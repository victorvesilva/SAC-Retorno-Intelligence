import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
export async function verifyImportIndex(db,id){
 await db.exec('RESET ROLE');await db.exec(readFileSync(new URL('../../sql/sri_protocol_import_index.sql',import.meta.url),'utf8'));
 const raw=n=>id(n).slice(1,-1),actor=async n=>db.exec('RESET ROLE;SET request.jwt.claim.sub='+id(n)+';SET ROLE authenticated');
 await db.exec(`INSERT INTO daily_result_snapshots(id,team_id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count) VALUES
 (${id(3000)},${id(6)},'2032-01-15','Manhã',1,${id(10)},repeat('c',64),repeat('x',20),1),
 (${id(3001)},${id(7)},'2032-01-15','Tarde',2,${id(10)},repeat('d',64),repeat('x',20),1);`);
 await actor(10);await assert.rejects(db.query("SELECT sri_import_index_start($1,repeat('c',64))",[raw(3000)]),/permission denied/);
 await db.exec("RESET ROLE;INSERT INTO private.sri_import_index_backfill_keys VALUES(encode(sha256(convert_to('temporary-test-token','UTF8')),'hex'),now()+interval '1 minute',ARRAY["+id(3000)+"]::uuid[]);SET ROLE service_role");
 assert.equal((await db.query('SELECT sri_import_index_backfill_authorized($1,$2) allowed',['temporary-test-token',raw(3000)])).rows[0].allowed,true);
 assert.equal((await db.query('SELECT sri_import_index_backfill_authorized($1,$2) allowed',['temporary-test-token',raw(3001)])).rows[0].allowed,false);
 assert.equal((await db.query('SELECT sri_import_index_backfill_snapshot($1,$2,true) value',['temporary-test-token',raw(3000)])).rows[0].value.payload_gzip,'x'.repeat(20));
 await assert.rejects(db.query('SELECT sri_import_index_backfill_snapshot($1,$2,true)',['invalid',raw(3000)]),/não autorizada/);

 const first=(await db.query("SELECT sri_import_index_start($1,repeat('c',64)) value",[raw(3000)])).rows[0].value;
 assert.ok(first.job);assert.equal((await db.query("SELECT sri_import_index_start($1,repeat('c',64)) value",[raw(3000)])).rows[0].value.busy,true);
 const rows=[{protocol:'INDEXED',rows:[{status:'12',area:'A'}]}];
 await db.query('SELECT sri_import_index_batch($1,$2,$3::jsonb)',[raw(3000),first.job,JSON.stringify(rows)]);
 await actor(4);assert.equal((await db.query('SELECT count(*)::int n FROM sri_protocol_imports')).rows[0].n,0,'lote parcial não é publicado');
 let calendar=(await db.query("SELECT sri_protocol_import_calendar('INDEXED','2032-01-01') value")).rows[0].value;assert.equal(calendar.pending_days.includes('2032-01-15'),true);
 await db.exec('RESET ROLE;SET ROLE service_role');
 await assert.rejects(db.query('SELECT sri_import_index_batch($1,$2,$3::jsonb,true,2)',[raw(3000),first.job,'[]']),/incompleta/);
 await db.query('SELECT sri_import_index_batch($1,$2,$3::jsonb,true,1,$4)',[raw(3000),first.job,'[]','2032-01-15T11:00:00Z']);
 assert.equal((await db.query("SELECT sri_import_index_start($1,repeat('c',64)) value",[raw(3000)])).rows[0].value.ready,true);
 const foreign=(await db.query("SELECT sri_import_index_start($1,repeat('d',64)) value",[raw(3001)])).rows[0].value;
 await db.query('SELECT sri_import_index_batch($1,$2,$3::jsonb,true,1,$4)',[raw(3001),foreign.job,JSON.stringify(rows),'2032-01-15T15:00Z']);
 await actor(4);
 calendar=(await db.query("SELECT sri_protocol_import_calendar('INDEXED','2032-01-01') value")).rows[0].value;
 assert.equal(calendar.days.length,1);assert.equal(calendar.days[0].count,1);assert.equal(calendar.pending_days.length,0);
 const records=(await db.query("SELECT sri_protocol_import_day('INDEXED','2032-01-15') value")).rows;
 assert.equal(records.length,1);assert.equal(records[0].value.id,raw(3000));assert.equal(records[0].value.rows[0].status,'12');
 assert.equal((await db.query('SELECT count(*)::int n FROM sri_protocol_imports')).rows[0].n,1,'snapshot de outra equipe não vaza por outra apuração visível');
 await assert.rejects(db.query('UPDATE sri_protocol_imports SET source_rows=$1',['[]']),/permission denied/);
 await actor(2);await assert.rejects(db.query("SELECT sri_protocol_import_calendar('INDEXED','2032-01-01')"),/não autorizada/);
 await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(db.query("SELECT sri_protocol_import_calendar('INDEXED','2032-01-01')"),/permission denied/);
 await db.exec('RESET ROLE');
 console.log('PASS índice por protocolo/data, publicação atômica, idempotência, paginação e isolamento por snapshot/equipe.');
}
