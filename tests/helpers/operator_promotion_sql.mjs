import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function verifyOperatorPromotion(db,id,fingerprint){
 const migration=readFileSync(new URL('../../sql/2026-11-25_sri_promote_operator_with_tasks.sql',import.meta.url),'utf8');
 const before=await fingerprint();await db.exec(migration);await db.exec(migration);assert.deepEqual(await fingerprint(),before,'instalar e reaplicar a regra não muda usuários nem protocolos');
 await db.exec(`SET request.jwt.claim.sub=${id(10)};
 INSERT INTO auth.users(id) VALUES(${id(850)});
 INSERT INTO profiles(id,role,full_name) VALUES(${id(850)},'operator','Operador a promover');
 INSERT INTO team_memberships(user_id,team_id) VALUES(${id(850)},${id(6)});
 INSERT INTO operator_links(team_id,user_id,operator_name,linked_by) VALUES(${id(6)},${id(850)},'Operador a promover',${id(10)});
 INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count)
 VALUES(${id(851)},'2031-01-15','Manhã',1,${id(10)},repeat('c',64),repeat('x',20),2);
 INSERT INTO daily_operator_tasks(snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,work_status,treatment_status)
 VALUES(${id(851)},${id(6)},'2031-01-15','Manhã','PROMOTE-PENDING',${id(850)},'pending',NULL),
 (${id(851)},${id(6)},'2031-01-15','Manhã','PROMOTE-DONE',${id(850)},'completed_in_tool','ACEITOU');`);
 const tasks=async()=>(await db.query("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) hash FROM daily_operator_tasks t")).rows[0].hash;
 const treatments=async()=>(await db.query("SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) hash FROM daily_operator_treatments t")).rows[0].hash;
 const originalTasks=await tasks(),originalTreatments=await treatments();
 const promote=async(actor,target,role)=>{await db.exec(`RESET ROLE;SET request.jwt.claim.sub=${id(actor)};SET ROLE authenticated`);return db.query('SELECT admin_change_user_role($1,$2)',['00000000-0000-0000-0000-'+String(target).padStart(12,'0'),role]);};
 for(const actor of [1,2,4,11,12])await assert.rejects(promote(actor,850,'admin'),/Somente administradores/);
 await assert.rejects(promote(10,10,'manager'),/próprio perfil/);
 for(const role of ['viewer','supervisor','assistant'])await assert.rejects(promote(10,850,role),/Redistribua/);
 for(const role of ['manager','admin']){
  await promote(10,850,role);await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT role FROM profiles WHERE id=${id(850)}`)).rows[0].role,role);
  assert.equal(await tasks(),originalTasks,'carteiras ativas, conclusões e responsáveis preservados após '+role);
  assert.equal(await treatments(),originalTreatments,'tratativas preservadas após '+role);
  assert.equal((await db.query(`SELECT count(*)::int n FROM audit_events WHERE action='USER_ROLE_CHANGED' AND object_id=${id(850)}::text AND details->>'new_role'=$1`,[role])).rows[0].n,1,'promoção auditada');
  await promote(10,850,'operator');
 }
 await db.exec('RESET ROLE');
 console.log('PASS: operador com protocolos ativos/concluídos pode virar Gestor/Administrador sem mudar tarefas ou tratativas; promoção auditada, demais perfis/autopromoção e chamadores sem permissão continuam bloqueados.');
}
