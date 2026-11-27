import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function verifySpecialProtocol(db,id,fingerprint){
 await db.exec('RESET ROLE');
 const migration=readFileSync(new URL('../../sql/sri_special_protocol.sql',import.meta.url),'utf8');
 const before=(await db.query('SELECT id,criticality,work_status,treatment_status,updated_at FROM daily_operator_tasks ORDER BY id')).rows;
 await db.exec(migration);
 assert.deepEqual((await db.query('SELECT id,criticality,work_status,treatment_status,updated_at FROM daily_operator_tasks ORDER BY id')).rows,before,'instalação preserva os dados operacionais');
 const actor=async n=>db.exec('RESET ROLE;SET request.jwt.claim.sub='+id(n)+';SET ROLE authenticated');
 await db.exec(`SET request.jwt.claim.sub=${id(10)};
 INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count) VALUES
 (${id(2000)},'2031-01-15','Manhã',1,${id(10)},repeat('a',64),repeat('x',20),3),
 (${id(2001)},'2031-01-15','Tarde',2,${id(10)},repeat('b',64),repeat('x',20),1);
 INSERT INTO daily_operator_tasks(id,snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,criticality) VALUES
 (${id(2010)},${id(2000)},${id(6)},'2031-01-15','Manhã','SPECIAL-LOW',${id(2)},'Baixo'),
 (${id(2011)},${id(2000)},${id(6)},'2031-01-15','Manhã','SPECIAL-CRITICAL',${id(2)},'Crítico'),
 (${id(2012)},${id(2000)},${id(7)},'2031-01-15','Manhã','OTHER-TEAM',${id(3)},'Baixo');`);
 const version=async task=>(await db.query('SELECT updated_at FROM daily_operator_tasks WHERE id=$1',[task])).rows[0]?.updated_at;
 const task=id(2010).slice(1,-1),critical=id(2011).slice(1,-1),foreign=id(2012).slice(1,-1);
 const save=(task,expected,request,special,notes='Observação preservada')=>db.query("SELECT sri_record_treatment_v3($1,'PENDENTE',$2,$3,$4,$5) result",[task,notes,expected,id(request).slice(1,-1),special]);
 await actor(2);
 const expected=await version(task),saved=(await save(task,expected,2020,true)).rows[0].result;
 assert.equal(saved.is_special,true);
 assert.deepEqual((await save(task,expected,2020,true)).rows[0].result,saved,'retry retorna a mesma tratativa');
 assert.equal((await db.query('SELECT count(*)::int n FROM daily_operator_treatments WHERE task_id=$1',[task])).rows[0].n,1);
 await assert.rejects(save(task,expected,2020,false),/Solicitação já utilizada/);
 await assert.rejects(save(task,expected,2021,false),/outra sessão/);
 await save(critical,await version(critical),2022,true);
 assert.equal((await db.query('SELECT criticality FROM daily_operator_tasks WHERE id=$1',[critical])).rows[0].criticality,'Crítico');
 assert.equal((await db.query('SELECT criticality FROM daily_operator_tasks WHERE id=$1',[task])).rows[0].criticality,'Baixo');
 const current=await version(task);
 await actor(3);
 await assert.rejects(save(task,current,2023,false),/Acesso negado/);
 await actor(2);
 assert.equal((await db.query('SELECT is_special FROM daily_operator_tasks WHERE id=$1',[task])).rows[0].is_special,true,'falha de autorização reverte a marcação');
 await assert.rejects(db.query('UPDATE daily_operator_tasks SET is_special=false WHERE id=$1',[task]),/permission denied/);
 await db.query("SELECT sri_record_treatment_v2($1,'PENDENTE','Observação do cliente anterior',$2,$3)",[task,current,id(2024).slice(1,-1)]);
 assert.equal((await db.query('SELECT is_special FROM daily_operator_tasks WHERE id=$1',[task])).rows[0].is_special,true,'cliente antigo preserva a marcação');
 assert.equal((await db.query('SELECT is_special FROM daily_operator_treatments WHERE task_id=$1 ORDER BY id DESC LIMIT 1',[task])).rows[0].is_special,true);
 await actor(10);
 const details=(await db.query('SELECT sri_protocol_treatment_details($1) result',[task])).rows[0].result;
 assert.equal(details.is_special,true);assert.equal(details.notes,'Observação do cliente anterior');assert.equal(details.actor_name,'Operador A');
 await actor(4);
 assert.equal((await db.query('SELECT sri_protocol_treatment_details($1) result',[foreign])).rows[0].result,null,'supervisor não consulta outra equipe');
 await db.exec(`RESET ROLE;SET request.jwt.claim.sub=${id(10)};
 INSERT INTO daily_operator_tasks(id,snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,criticality)
 VALUES(${id(2013)},${id(2001)},${id(6)},'2031-01-15','Tarde','SPECIAL-LOW',${id(2)},'Baixo');`);
 const carried=id(2013).slice(1,-1);
 await actor(10);
 const carriedDetails=(await db.query('SELECT sri_protocol_treatment_details($1) result',[carried])).rows[0].result;
 assert.equal(carriedDetails.is_special,true,'marcação acompanha a extração');
 assert.equal(carriedDetails.notes,'Observação do cliente anterior','observação acompanha a cadeia de tarefas autorizadas');
 await actor(2);
 await save(carried,await version(carried),2025,false,'Sinalização revisada');
 const events=(await db.query('SELECT is_special,event_context FROM daily_operator_treatments WHERE task_id=$1',[carried])).rows;
 assert.equal(events[0].is_special,false);assert.equal(events[0].event_context.is_special,false);
 await actor(10);
 assert.equal((await db.query('SELECT is_special FROM daily_operator_treatments WHERE task_id=$1 ORDER BY id LIMIT 1',[task])).rows[0].is_special,true,'registro anterior continua marcado no histórico');
 await db.exec('RESET ROLE');
 const audit=(await db.query("SELECT details FROM audit_events WHERE action='PROTOCOL_SPECIAL_CHANGED' AND object_id=$1",[carried])).rows;
 assert.equal(audit[0].details.previous_is_special,true);assert.equal(audit[0].details.is_special,false);
 await db.exec('RESET ROLE;SET ROLE anon');
 await assert.rejects(db.query('SELECT sri_protocol_treatment_details($1)',[task]),/permission denied/);
 await db.exec('RESET ROLE');
 const after=await fingerprint();await db.exec(migration);assert.deepEqual(await fingerprint(),after,'reaplicação preserva histórico e estado');
 console.log('PASS protocolo especial em criticidade baixa/crítica, observação, auditoria, retry, concorrência, autorização, clientes anteriores e continuidade entre extrações.');
}
