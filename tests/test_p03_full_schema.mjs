const {PGlite}=await import(process.env.SRI_PGLITE_MODULE||'@electric-sql/pglite');
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/p03-baseline.json',import.meta.url)));
const schema=baseline.schema;
const db=new PGlite();
await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; GRANT USAGE ON SCHEMA public TO authenticated; CREATE SCHEMA auth; CREATE SCHEMA private; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_user::text$$; SET check_function_bodies=off;");
for(const ddl of schema.tables)await db.exec(ddl);
for(const ddl of schema.functions)await db.exec(ddl);
for(const ddl of schema.constraints)await db.exec(ddl);
for(const ddl of schema.triggers)await db.exec(ddl);

const rls=baseline.authorization;
const ident=value=>'"'+value.replace(/"/g,'""')+'"';
for(const item of rls.rls)if(item.enabled)await db.exec('ALTER TABLE '+ident(item.schema)+'.'+ident(item.table)+' ENABLE ROW LEVEL SECURITY');
await db.exec('GRANT USAGE ON SCHEMA auth,private TO authenticated');
for(const grant of rls.grants)if(schema.tables.some(ddl=>ddl.startsWith('CREATE TABLE '+grant.table_schema+'.'+grant.table_name+' ')))await db.exec('GRANT '+grant.privilege_type+' ON TABLE '+ident(grant.table_schema)+'.'+ident(grant.table_name)+' TO '+(grant.grantee==='PUBLIC'?'PUBLIC':ident(grant.grantee)));
for(const policy of rls.policies){
 let ddl='CREATE POLICY '+ident(policy.policyname)+' ON '+ident(policy.schemaname)+'.'+ident(policy.tablename)+' AS '+policy.permissive+' FOR '+policy.cmd+' TO '+policy.roles.map(role=>role==='public'?'PUBLIC':ident(role)).join(',');
 if(policy.qual)ddl+=' USING ('+policy.qual+')';
 if(policy.with_check)ddl+=' WITH CHECK ('+policy.with_check+')';
 await db.exec(ddl);
}
await db.exec('SET check_function_bodies=on');
const files=['2026-11-24_sri_pacote03_historico_carteira.sql','2026-11-24_sri_pacote03_produtividade.sql','2026-11-24_sri_pacote03_protecao_incidentes.sql','2026-11-24_sri_criticos_persistencia_status.sql','2026-11-24_sri_p03_historico_datas.sql','2026-11-24_sri_p03_perfil_assistente.sql','2026-11-25_sri_p03_historico_imutavel.sql','2026-11-25_sri_p03_escopo_publicacao.sql','2026-11-25_sri_p03_metricas_rpc.sql','2026-11-25_sri_p03_produtividade_carga.sql','2026-11-25_sri_p03_monitor_ocorrencias.sql','2026-11-25_sri_p03_continuidade_carteira.sql'];
for(const file of files){await db.exec(readFileSync(new URL('../sql/'+file,import.meta.url),'utf8'));console.log('PASS migration '+file);}

// Use today's civil date for flows whose production authorization requires the current day.
const day=(await db.query("SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS operational_date")).rows[0].operational_date;
const executeFixture=db.exec.bind(db),queryFixture=db.query.bind(db);
db.exec=statement=>executeFixture(statement.replaceAll('2026-11-25',day));
db.query=(statement,parameters)=>queryFixture(statement.replaceAll('2026-11-25',day),parameters);
const id=n=>"'00000000-0000-0000-0000-"+String(n).padStart(12,'0')+"'";
await db.exec(`
INSERT INTO auth.users(id) VALUES (${id(1)}),(${id(2)}),(${id(3)}),(${id(4)});
INSERT INTO profiles(id,role,full_name) VALUES
(${id(1)},'assistant','Assistente'),(${id(2)},'operator','Operador A'),(${id(3)},'operator','Operador B'),(${id(4)},'supervisor','Supervisor');
INSERT INTO operations(id,name) VALUES (${id(5)},'Operação');
INSERT INTO teams(id,operation_id,name) VALUES (${id(6)},${id(5)},'Equipe A'),(${id(7)},${id(5)},'Equipe B');
INSERT INTO team_memberships VALUES (${id(1)},${id(6)}),(${id(2)},${id(6)}),(${id(3)},${id(7)}),(${id(4)},${id(6)});
INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count,created_at) VALUES
(${id(8)},'2026-11-25','Manhã',1,${id(1)},repeat('0',64),repeat('x',20),2,'2026-11-25T10:00Z'),
(${id(9)},'2026-11-25','Manhã',1,${id(1)},repeat('1',64),repeat('x',20),2,'2026-11-25T11:00Z');
SET request.jwt.claim.sub=${id(1)};
INSERT INTO daily_result_distributions(snapshot_id,state,updated_by,revision) VALUES
(${id(9)},'{"assignments":{}}',${id(1)},1);
INSERT INTO operator_links(team_id,user_id,operator_name,linked_by) VALUES (${id(6)},${id(2)},'Operador A',${id(1)}),(${id(7)},${id(3)},'Operador B',${id(1)});
INSERT INTO daily_operator_tasks(snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id) VALUES
(${id(8)},${id(6)},'2026-11-25','Manhã','A',${id(2)}),
(${id(8)},${id(7)},'2026-11-25','Manhã','B',${id(3)});
SET request.jwt.claim.sub=${id(1)};
`);
await db.exec('SET ROLE authenticated');
await db.query('SELECT publish_general_operator_tasks('+id(9)+",1,'{}')");
await db.exec("RESET ROLE");
const before=(await db.query("SELECT protocol_number,active,snapshot_id FROM daily_operator_tasks ORDER BY protocol_number,snapshot_id")).rows;
assert.equal(before.find(row=>row.protocol_number==='B').active,true);
assert.equal(before.filter(row=>row.protocol_number==='B').length,1,'outra equipe não deve ser copiada');
assert.equal(before.filter(row=>row.protocol_number==='A').length,2,'pendência própria preservada na nova extração');
assert.equal(before.find(row=>row.protocol_number==='A'&&row.snapshot_id===id(8).slice(1,-1)).active,false);
console.log('PASS: publicação geral de Assistente preserva carteiras de outra equipe e carrega apenas pendências autorizadas.');

await db.exec(`
RESET ROLE; RESET request.jwt.claim.sub;
INSERT INTO auth.users(id) VALUES (${id(10)}),(${id(11)}),(${id(12)});
INSERT INTO profiles(id,role,full_name) VALUES (${id(10)},'admin','Admin sintético'),(${id(11)},'manager','Gestor sintético'),(${id(12)},'viewer','Consulta sintética');
`);
for(const [actor,role,ownOnly]of [[1,'assistant',true],[4,'supervisor',true],[10,'admin',false],[11,'manager',false]]){
 await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(actor)+'; SET ROLE authenticated');
 const rows=(await db.query('SELECT protocol_number FROM daily_operator_tasks')).rows;
 assert.equal(rows.some(row=>row.protocol_number==='B'),!ownOnly,role+' acesso direto à outra equipe');
 const productivity=(await db.query("SELECT * FROM sri_p03_productivity('2026-11-25','2026-11-25')")).rows;
 assert.equal(productivity.some(row=>row.operator_name==='Operador B'),!ownOnly,role+' produtividade de outra equipe');
 if(ownOnly)await assert.rejects(db.query('SELECT admin_change_user_role('+id(2)+",'admin')"),/administrador|restrit|admin/i);
 console.log('PASS RLS '+role+' — tarefa e produtividade no escopo autorizado');
}
for(const [actor,role]of [[2,'operator'],[12,'viewer']]){
 await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(actor)+'; SET ROLE authenticated');
 const rows=(await db.query('SELECT protocol_number FROM daily_operator_tasks')).rows;
 assert.equal(rows.some(row=>row.protocol_number==='B'),false,role+' não acessa carteira de outro operador');
 await assert.rejects(db.query("SELECT sri_p03_history_snapshots('2026-11-25')"),/indisponível/);
 await assert.rejects(db.query("SELECT sri_monitor_read(now()-interval '1 day',now(),null)"),/administrador/);
 console.log('PASS RLS '+role+' — restrições de histórico gerencial e console');
}
await db.exec('RESET ROLE');

await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(2)+'; SET ROLE authenticated');
const task=(await db.query("SELECT id,updated_at,source_status FROM daily_operator_tasks WHERE protocol_number='A' AND active")).rows[0];
const saved=(await db.query("SELECT sri_record_treatment_v2($1,'ACEITOU','Tratativa sintética',$2,$3) result",[task.id,task.updated_at,'00000000-0000-0000-0000-000000000019'])).rows[0].result;
assert.equal(saved.work_status,'completed_in_tool');
const repeated=(await db.query("SELECT sri_record_treatment_v2($1,'ACEITOU','Tratativa sintética',$2,$3) result",[task.id,task.updated_at,'00000000-0000-0000-0000-000000000019'])).rows[0].result;
assert.deepEqual(saved,repeated,'retry não duplica a tratativa');
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(1));
await db.exec(`
INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count,created_at)
VALUES (${id(13)},'2026-11-25','Manhã',1,${id(1)},repeat('2',64),repeat('x',20),0,'2026-11-25T12:00Z');
INSERT INTO daily_result_distributions(snapshot_id,state,updated_by,revision)
VALUES (${id(13)},'{"assignments":{}}',${id(1)},1);
SET ROLE authenticated;
`);
await db.query('SELECT publish_general_operator_tasks('+id(13)+",1,'{}')");
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(2)+'; SET ROLE authenticated');
const processed=(await db.query("SELECT sri_my_daily_processed(null,200) result")).rows.map(row=>row.result);
assert.equal(processed.filter(row=>row.protocol_number==='A').length,1,'concluído permanece visível no dia após reimportação');
assert.equal(processed.find(row=>row.protocol_number==='A').work_status,'completed_in_tool');
const history=(await db.query("SELECT sri_p03_my_treatments_page('2026-11-25','2026-11-25',null,200) result")).rows.map(row=>row.result);
assert.equal(history.filter(row=>row.action==='ACEITOU').length,1);
console.log('PASS: operador trata, repete idempotentemente e mantém conclusão no histórico e na carteira do dia após reimportar.');
await db.exec('RESET ROLE');

await db.exec('SET request.jwt.claim.sub='+id(2)+'; SET ROLE authenticated');
await db.query("SELECT sri_monitor_write('FATAL','RPC_ERROR','Supabase','pacote03-20261124')");
await db.query("SELECT sri_monitor_write('FATAL','RPC_ERROR','Supabase','pacote03-20261124')");
await assert.rejects(db.query('SELECT sri_p03_monitor_occurrences(1,null)'),/administrador/);
await assert.rejects(db.query('SELECT * FROM private.sri_p03_monitor_occurrences'),/permission denied/);
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(10)+'; SET ROLE authenticated');
const groups=(await db.query("SELECT sri_monitor_read(now()-interval '1 day',now()+interval '1 day','FATAL') result")).rows.map(row=>row.result);
assert.equal(groups.length,1);assert.equal(groups[0].occurrences,2);
const occurrences=(await db.query('SELECT sri_p03_monitor_occurrences($1,null) result',[groups[0].id])).rows;
assert.equal(occurrences.length,2,'agrupamento mantém cada ocorrência auditável');
await db.exec('RESET ROLE');
await db.exec("INSERT INTO private.sri_monitor_events(actor_id,severity,code,module,version,occurred_at) VALUES ("+id(2)+",'INFO','AUTH_OK','Autenticação','pacote03-20261124',now()-interval '120 days')");
await db.exec('SET ROLE authenticated');
const retained=(await db.query("SELECT sri_monitor_read(now()-interval '130 days',now()+interval '1 day',null) result")).rows;
assert.equal(retained.length,2,'logs antigos preservados permanecem consultáveis');
await db.exec('RESET ROLE');
console.log('PASS: falha crítica agrupada mantém ocorrências individuais, acesso administrativo e consulta de logs antigos preservados.');

await db.exec('SET request.jwt.claim.sub='+id(1));
await db.exec(`
INSERT INTO daily_operator_tasks(snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,base_name,area_name)
VALUES (${id(13)},${id(6)},'2026-11-25','Manhã','C',${id(2)},'Base C','Área C');
`);
await db.exec(`
INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count,created_at)
VALUES (${id(14)},'2026-11-25','Tarde',1,${id(1)},repeat('3',64),repeat('x',20),1,now());
INSERT INTO daily_result_distributions(snapshot_id,state,updated_by,revision)
VALUES (${id(14)},'{"assignments":{"A":{"opId":"acct:00000000-0000-0000-0000-000000000002"}}}',${id(1)},1);
SET ROLE authenticated;
`);
await db.query('SELECT publish_general_operator_tasks('+id(14)+",1,'{}')");
await db.exec('RESET ROLE');
const later=(await db.query('SELECT active,work_status,carried_from_task_id FROM daily_operator_tasks WHERE snapshot_id='+id(14)+" AND protocol_number='A'")).rows[0];
assert.equal(later.work_status,'completed_in_tool','novo turno não reabre conclusão');
assert.equal(later.active,true,'concluído permanece na carteira no mesmo dia');
assert.ok(later.carried_from_task_id);
const sameDay=(await db.query("SELECT protocol_number,count(*) AS total FROM daily_operator_tasks WHERE active AND operator_user_id="+id(2)+" AND operational_day='2026-11-25' GROUP BY protocol_number")).rows;
assert.ok(sameDay.every(row=>Number(row.total)===1),'novo turno mantém uma atribuição ativa por protocolo');

await db.exec(`
INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count,created_at)
VALUES (${id(15)},(now() AT TIME ZONE 'America/Sao_Paulo')::date+1,'Manhã',1,${id(1)},repeat('4',64),repeat('x',20),1,now()+interval '1 day');
INSERT INTO daily_result_distributions(snapshot_id,state,updated_by,revision)
VALUES (${id(15)},'{"assignments":{"A":{"opId":"acct:00000000-0000-0000-0000-000000000002"}}}',${id(1)},1);
SET ROLE authenticated;
`);
await db.query('SELECT publish_general_operator_tasks('+id(15)+",1,'{}')");
await db.exec('RESET ROLE');
const tomorrow=(await db.query('SELECT active,work_status FROM daily_operator_tasks WHERE snapshot_id='+id(15)+" AND protocol_number='A'")).rows[0];
assert.equal(tomorrow.work_status,'completed_in_tool');
assert.equal(tomorrow.active,false,'dia seguinte mantém conclusão fora da carga ativa');
const pending=(await db.query('SELECT active,base_name,area_name FROM daily_operator_tasks WHERE snapshot_id='+id(15)+" AND protocol_number='C'")).rows[0];
assert.equal(pending.active,true,'pendência ausente da nova importação continua no dia seguinte');
assert.equal(pending.base_name,'Base C');assert.equal(pending.area_name,'Área C');
await db.exec(`
INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count,created_at)
VALUES (${id(16)},(now() AT TIME ZONE 'America/Sao_Paulo')::date+1,'Manhã',1,${id(1)},repeat('5',64),repeat('x',20),1,now()+interval '2 days');
INSERT INTO daily_result_distributions(snapshot_id,state,updated_by,revision)
VALUES (${id(16)},'{"assignments":{"A":{"opId":"acct:00000000-0000-0000-0000-000000000002"}}}',${id(1)},1);
SET ROLE authenticated;
`);
await db.query('SELECT publish_general_operator_tasks('+id(16)+",1,'{}')");
await db.exec('RESET ROLE');
const repeatedDay=(await db.query('SELECT active,work_status FROM daily_operator_tasks WHERE snapshot_id='+id(16)+" AND protocol_number='A'")).rows[0];
assert.equal(repeatedDay.active,false,'segunda importação do dia seguinte não reativa conclusão transportada');
assert.equal((await db.query("SELECT active FROM daily_operator_tasks WHERE protocol_number='B'")).rows[0].active,true,'continuidade não altera carteira de outra equipe');

assert.equal(Number((await db.query("SELECT count(*) FROM daily_operator_treatments WHERE action='ACEITOU'")).rows[0].count),1,'continuidade não cria tratativa fictícia');
console.log('PASS: conclusão preservada entre turnos e no dia seguinte, sem reativação nem nova tratativa fictícia.');
await db.close();
