import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function verifyDistributionHistory(db,id,fingerprint){
 const migration=readFileSync(new URL('../../sql/2026-11-25_sri_historical_distribution_unassign.sql',import.meta.url),'utf8');
 const before=await fingerprint();await db.exec(migration);assert.deepEqual(await fingerprint(),before,'instalação não altera dados existentes');await db.exec(migration);assert.deepEqual(await fingerprint(),before,'reaplicação não altera dados existentes');
 await db.exec(`SET request.jwt.claim.sub=${id(10)};
 INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count) VALUES
 (${id(800)},'2030-01-15','Manhã',1,${id(10)},repeat('a',64),repeat('x',20),3),
 (${id(801)},'2030-01-15','Tarde',2,${id(10)},repeat('b',64),repeat('x',20),1);
 INSERT INTO daily_result_distributions(snapshot_id,state,updated_by,revision) VALUES
 (${id(800)},'{"assignments":{"ASSIST-TEST":{"opId":"legacy-assistant"},"PENDING-TEST":{"opId":"acct:00000000-0000-0000-0000-000000000002"},"DONE-TEST":{"opId":"legacy"}},"roster":[{"id":"legacy-assistant","name":"Assistente de teste"}],"statuses":{"DONE-TEST":"ACEITOU"},"events":[]}',${id(10)},7),
 (${id(801)},'{"assignments":{"OTHER-TEST":{"opId":"legacy"}}}',${id(10)},1);
 INSERT INTO daily_operator_tasks(id,snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,work_status,treatment_status) VALUES
 (${id(802)},${id(800)},${id(6)},'2030-01-15','Manhã','PENDING-TEST',${id(2)},'pending',NULL),
 (${id(803)},${id(800)},${id(6)},'2030-01-15','Manhã','DONE-TEST',${id(2)},'completed_in_tool','ACEITOU');`);
 const read=async(actor,day='2030-01-15',snapshot=null)=>{await db.exec(`RESET ROLE;SET request.jwt.claim.sub=${id(actor)};SET ROLE authenticated`);return (await db.query('SELECT sri_distribution_history($1,$2) result',[day,snapshot])).rows[0].result;};
 const snapshot='00000000-0000-0000-0000-000000000800';
 for(const actor of [1,2,4,12])await assert.rejects(read(actor),/ADM\/Gestor/);
 const rounds=await read(11);assert.equal(rounds.length,2);assert.equal(rounds[0].id!==rounds[1].id,true);
 assert.deepEqual(await read(10,'2030-01-16'),[]);
 const listing=await read(10,'2030-01-15',snapshot);assert.equal(listing.revision,7);assert.equal(listing.rows.length,3);assert.equal(listing.rows.find(r=>r.protocol==='ASSIST-TEST').operator,'Assistente de teste');assert.equal(listing.rows.find(r=>r.protocol==='DONE-TEST').can_remove,false);
 const remove=(protocols,revision=7,reason='Atribuição realizada por engano no teste')=>db.query('SELECT sri_distribution_unassign($1,$2,$3,$4,$5) result',['2030-01-15',snapshot,revision,protocols,reason]);
 await assert.rejects(remove(['ASSIST-TEST'],7,'curta'),/justificativa/);
 await assert.rejects(remove(['ASSIST-TEST'],6),/mudou/);
 await assert.rejects(remove(['ASSIST-TEST','DONE-TEST']),/preservado/);
 assert.equal((await read(10,'2030-01-15',snapshot)).rows.length,3,'falha no lote reverte remoção anterior');
 const result=(await remove(['ASSIST-TEST','PENDING-TEST'])).rows[0].result;assert.equal(result.removed,2);
 await db.exec('RESET ROLE');
 const state=(await db.query('SELECT state,revision FROM daily_result_distributions WHERE snapshot_id=$1',[snapshot])).rows[0];assert.equal(state.revision,8);assert.deepEqual(Object.keys(state.state.assignments),['DONE-TEST']);assert.equal(state.state.statuses['DONE-TEST'],'ACEITOU');
 assert.equal((await db.query(`SELECT active FROM daily_operator_tasks WHERE id=${id(802)}`)).rows[0].active,false);
 assert.equal((await db.query(`SELECT count(*)::int n FROM daily_operator_tasks WHERE id IN (${id(802)},${id(803)})`)).rows[0].n,2,'tarefas originais preservadas');
 assert.equal((await db.query("SELECT count(*)::int n FROM audit_events WHERE action='DISTRIBUTION_ASSIGNMENT_REMOVED'")).rows[0].n,2);
 assert.equal((await db.query("SELECT count(*)::int n FROM private.sri_distribution_removals")).rows[0].n,2);
 assert.equal((await db.query(`SELECT revision FROM daily_result_distributions WHERE snapshot_id=${id(801)}`)).rows[0].revision,1,'outra rodada intacta');
 await assert.rejects(db.exec(`UPDATE daily_operator_tasks SET active=true WHERE id=${id(802)}`),/Atribuição removida/);
 await db.exec(`SET request.jwt.claim.sub=${id(10)};SET ROLE authenticated`);
 await assert.rejects(db.query('SELECT * FROM private.sri_distribution_removals'),/permission denied/);
 await db.exec(`RESET ROLE;SET request.jwt.claim.sub=${id(10)};INSERT INTO sri_general_day_closures(operational_day,snapshot_id,protocol_count) VALUES('2030-01-15',${id(800)},3)`);
 await assert.rejects(remove(['DONE-TEST'],8),/fechado/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query("SELECT sri_distribution_history('2030-01-15',NULL)"),/permission denied/);await db.exec('RESET ROLE');
 console.log('PASS: consulta por data/extração, vínculo legado de Assistente, remoção atômica auditada, revisão concorrente, conclusão preservada, outra rodada intacta, proteção contra reativação e acesso ADM/Gestor.');
}
