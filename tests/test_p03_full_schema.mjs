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
const baselineHashes=(await db.query("SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature,md5(pg_get_functiondef(p.oid)) definition_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f' ORDER BY 1")).rows;
writeFileSync('/tmp/sri-reconstructed-function-hashes.json',JSON.stringify(baselineHashes));
const files=['2026-11-24_sri_pacote03_historico_carteira.sql','2026-11-24_sri_pacote03_produtividade.sql','2026-11-24_sri_pacote03_protecao_incidentes.sql','2026-11-24_sri_criticos_persistencia_status.sql','2026-11-24_sri_p03_historico_datas.sql','2026-11-24_sri_p03_perfil_assistente.sql','2026-11-25_sri_p03_historico_imutavel.sql','2026-11-25_sri_p03_escopo_publicacao.sql','2026-11-25_sri_p03_metricas_rpc.sql','2026-11-25_sri_p03_produtividade_carga.sql','2026-11-25_sri_p03_monitor_ocorrencias.sql','2026-11-25_sri_p03_continuidade_carteira.sql','2026-11-25_sri_p03_auditoria_contexto.sql','2026-11-25_sri_p03_escopo_apuracao_geral.sql','2026-11-25_sri_p03_guard_distribuicao_fechada.sql','2026-11-25_sri_p03_reabertura_protocolo.sql','2026-11-25_sri_p03_relatorios_integrados.sql','2026-11-25_sri_p03_meta_conclusao.sql','2026-11-25_sri_p03_vinculo_auditoria_monitor.sql','2026-11-25_sri_p03_conclusoes_legadas.sql'];
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
assert.ok(retained.some(row=>row.result.code==='AUTH_OK'&&Date.parse(row.result.occurred_at)<Date.now()-100*86400000),'logs antigos preservados permanecem consultáveis');
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
await db.query('SELECT publish_general_operator_tasks('+id(16)+",1,'{}')");
await db.exec('RESET ROLE');
const repeatedDay=(await db.query('SELECT active,work_status FROM daily_operator_tasks WHERE snapshot_id='+id(16)+" AND protocol_number='A'")).rows[0];
assert.equal(repeatedDay.active,false,'segunda importação do dia seguinte não reativa conclusão transportada');
assert.equal((await db.query("SELECT active FROM daily_operator_tasks WHERE protocol_number='B'")).rows[0].active,true,'continuidade não altera carteira de outra equipe');

assert.equal(Number((await db.query("SELECT count(*) FROM daily_operator_treatments WHERE action='ACEITOU'")).rows[0].count),1,'continuidade não cria tratativa fictícia');
console.log('PASS: conclusão preservada entre turnos e no dia seguinte, sem reativação nem nova tratativa fictícia.');

await db.exec('SET request.jwt.claim.sub='+id(1)+'; SET ROLE authenticated');
const movement=(await db.query("SELECT sri_movement_read(now()-interval '1 day',now()+interval '1 day','A') result")).rows.map(row=>row.result);
assert.ok(movement.some(row=>row.action==='DAY_TASK_TREATMENT'));
assert.ok(movement.some(row=>row.action==='TASK_CARRIED'));
assert.ok(movement.every(row=>row.protocol==='A'));
assert.ok(movement.filter(row=>row.action==='TASK_CARRIED').every(row=>row.perfil==='assistant'));
const otherMovement=(await db.query("SELECT sri_movement_read(now()-interval '1 day',now()+interval '1 day','B') result")).rows;
assert.equal(otherMovement.length,0,'histórico da outra equipe permanece restrito');
await db.exec('RESET ROLE');
const beforeAudit=Number((await db.query('SELECT count(*) FROM audit_events')).rows[0].count);
await db.exec('SET ROLE authenticated');
await assert.rejects(db.query('DELETE FROM audit_events RETURNING id'),/permission denied|row.level/i,'permissões impedem exclusão direta da auditoria');
await db.exec('RESET ROLE');
assert.equal(Number((await db.query('SELECT count(*) FROM audit_events')).rows[0].count),beforeAudit);
console.log('PASS: auditoria por protocolo preserva autoria/perfil do evento, transporte automático e bloqueio de outra equipe e de exclusão.');

await db.exec(readFileSync(new URL('../sql/2026-11-25_sri_p03_escopo_apuracao_geral.sql',import.meta.url),'utf8'));
await db.exec('SET request.jwt.claim.sub='+id(4)+'; SET ROLE authenticated');
assert.equal((await db.query('SELECT id FROM daily_result_snapshots')).rows.length,0,'supervisor não lê base geral de outro importador');
await assert.rejects(db.query('SELECT publish_general_operator_tasks('+id(16)+",1,'{}')"),/fora do escopo/);
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(1)+'; SET ROLE authenticated');
assert.ok((await db.query('SELECT id FROM daily_result_snapshots')).rows.length>0,'assistente consulta sua própria importação');
const allowed=(await db.query("SELECT private.sri_p03_distribution_is_scoped($1) allowed",[JSON.stringify({assignments:{A:{opId:'acct:00000000-0000-0000-0000-000000000002'}}})])).rows[0].allowed;
assert.equal(allowed,true);
const denied=(await db.query("SELECT private.sri_p03_distribution_is_scoped($1) allowed",[JSON.stringify({assignments:{B:{opId:'acct:00000000-0000-0000-0000-000000000003'}}})])).rows[0].allowed;
assert.equal(denied,false,'distribuição com operador de outra equipe não é legível nem editável');
await assert.rejects(db.query("UPDATE daily_result_distributions SET state=$1,updated_by=auth.uid() WHERE snapshot_id="+id(16),[JSON.stringify({assignments:{B:{opId:'acct:00000000-0000-0000-0000-000000000003'}}})]),/row.level|policy|permiss/i);
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(10)+'; SET ROLE authenticated');
assert.ok((await db.query('SELECT id FROM daily_result_snapshots')).rows.length>0,'administrador mantém visão global');
await db.exec('RESET ROLE');
console.log('PASS: RLS da apuração geral impede leitura de outro importador e edição de carteira fora da equipe, mantendo visão administrativa.');

await db.exec(readFileSync(new URL('../sql/2026-11-25_sri_p03_guard_distribuicao_fechada.sql',import.meta.url),'utf8'));

await db.exec(readFileSync(new URL('../sql/2026-11-25_sri_p03_reabertura_protocolo.sql',import.meta.url),'utf8'));
for(const [actor,protocol]of [[10,'ReopenAdmin'],[11,'ReopenManager']]){
 await db.exec('RESET ROLE');
 await db.exec("INSERT INTO daily_operator_tasks(snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,source_status) VALUES ("+id(14)+","+id(6)+",'2026-11-25','Tarde',$$"+protocol+"$$,"+id(2)+",'AGENTE')");
 await db.exec('SET request.jwt.claim.sub='+id(2)+'; SET ROLE authenticated');
 const row=(await db.query('SELECT id,updated_at FROM daily_operator_tasks WHERE protocol_number=$1',[protocol])).rows[0];
 await db.query("SELECT sri_record_treatment_v2($1,'OUTROS','Encerramento sintético',$2,$3)",[row.id,row.updated_at,'00000000-0000-0000-0000-'+String(actor+100).padStart(12,'0')]);
 await assert.rejects(db.query("SELECT sri_record_treatment_v2($1,'PENDENTE','Tentativa de reabertura',$2,$3)",[row.id,(await db.query('SELECT updated_at FROM daily_operator_tasks WHERE id=$1',[row.id])).rows[0].updated_at,crypto.randomUUID()]),/reabertura/);
 for(const forbidden of [1,2,4,12]){
  await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(forbidden)+'; SET ROLE authenticated');
  await assert.rejects(db.query('SELECT sri_p03_reopen_candidate($1)',[protocol]),/exclusiva/);
  await assert.rejects(db.query('SELECT sri_p03_reopen_task($1,$2,$3)',[row.id,row.updated_at,'Tentativa não autorizada']),/exclusiva/);
 }
 await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(actor)+'; SET ROLE authenticated');
 await assert.rejects(db.query("UPDATE daily_operator_tasks SET work_status='pending',treatment_status=NULL WHERE id=$1",[row.id]),/permission denied|Somente Administrador|reabrir/);
 await db.exec('RESET ROLE');
 await assert.rejects(db.query("UPDATE daily_operator_tasks SET work_status='pending',treatment_status=NULL WHERE id=$1",[row.id]),/Somente Administrador|reabrir/);
 await db.exec('SET ROLE authenticated');
 const candidate=(await db.query('SELECT sri_p03_reopen_candidate($1) result',[protocol])).rows[0].result;
 assert.equal(candidate.can_reopen,true);
 await assert.rejects(db.query('SELECT sri_p03_reopen_task($1,$2,$3)',[candidate.id,candidate.updated_at,'   ']),/Justificativa obrigatória/);
 const result=(await db.query('SELECT sri_p03_reopen_task($1,$2,$3) result',[candidate.id,candidate.updated_at,'Encerramento indevido confirmado pela gestão'])).rows[0].result;
 assert.equal(result.work_status,'pending');
 await assert.rejects(db.query('SELECT sri_p03_reopen_task($1,$2,$3)',[candidate.id,candidate.updated_at,'Repetição de tentativa']),/alterado|não está concluído/);
 const task=(await db.query('SELECT active,source_status,treatment_status FROM daily_operator_tasks WHERE id=$1',[result.id])).rows[0];
 assert.equal(task.active,true);assert.equal(task.source_status,'AGENTE');assert.equal(task.treatment_status,null);
 await db.exec('RESET ROLE');
 const events=(await db.query("SELECT action FROM daily_operator_treatments WHERE task_id=$1",[row.id])).rows;
 assert.deepEqual(events.map(event=>event.action),['OUTROS'],'reabertura não altera a tratativa anterior');
 const audit=(await db.query("SELECT details FROM audit_events WHERE action='TASK_REOPENED' AND object_id=$1",[result.id])).rows;
 assert.equal(audit.length,1);assert.equal(audit[0].details.reason,'Encerramento indevido confirmado pela gestão');
 assert.equal(audit[0].details.actor_role_at_event,actor===10?'admin':'manager');
}

await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(11));
await db.exec(`
INSERT INTO daily_result_snapshots(id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count,created_at)
VALUES (${id(22)},(now() AT TIME ZONE 'America/Sao_Paulo')::date-1,'Tarde',1,${id(11)},repeat('7',64),repeat('x',20),1,now()-interval '1 day');
INSERT INTO daily_operator_tasks(id,snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,source_status,work_status,treatment_status,active,completed_operational_day)
VALUES (${id(23)},${id(22)},${id(6)},(now() AT TIME ZONE 'America/Sao_Paulo')::date-1,'Tarde','ReopenPast',${id(2)},'AGENTE','pending',NULL,false,(now() AT TIME ZONE 'America/Sao_Paulo')::date-1);
INSERT INTO daily_operator_treatments(task_id,actor_id,action,notes,created_at)
VALUES (${id(23)},${id(2)},'OUTROS','Evento sintético do dia anterior',now()-interval '1 day');
UPDATE daily_operator_tasks SET work_status='completed_in_tool',treatment_status='OUTROS' WHERE id=${id(23)};
SET ROLE authenticated;
`);
const past=(await db.query("SELECT sri_p03_reopen_candidate('ReopenPast') result")).rows[0].result;
const reopened=(await db.query("SELECT sri_p03_reopen_task($1,$2,$3) result",[past.id,past.updated_at,'Correção de encerramento do dia anterior'])).rows[0].result;
assert.notEqual(reopened.id,past.id,'reabertura de dia anterior cria atribuição atual');
await db.exec('RESET ROLE');
const prior=(await db.query('SELECT work_status,treatment_status,active FROM daily_operator_tasks WHERE id='+id(23))).rows[0];
assert.deepEqual(prior,{work_status:'completed_in_tool',treatment_status:'OUTROS',active:false});
const current=(await db.query('SELECT active,work_status,carried_from_task_id FROM daily_operator_tasks WHERE id=$1',[reopened.id])).rows[0];
assert.equal(current.active,true);assert.equal(current.work_status,'pending');assert.equal(current.carried_from_task_id,past.id);
assert.equal(Number((await db.query('SELECT count(*) FROM daily_operator_treatments WHERE task_id='+id(23))).rows[0].count),1);
console.log('PASS: somente Administrador/Gestor reabre com justificativa obrigatória, preservando autoria, histórico e origem SIGO.');
await db.exec("INSERT INTO sri_general_day_closures(operational_day,snapshot_id,protocol_count) VALUES ('2026-11-25',"+id(13)+",2)");
await db.exec('SET ROLE authenticated');
await assert.rejects(db.query("UPDATE daily_result_distributions SET revision=revision+1,updated_by=auth.uid() WHERE snapshot_id="+id(13)),/encerrado|bloqueada/i);
await db.exec('RESET ROLE');
console.log('PASS: dia fechado impede alteração direta de distribuição, inclusive para administrador, preservando o fechamento existente.');
// Reporting pagination must be complete and enforce the same team boundaries as wallets.
await db.exec('SET request.jwt.claim.sub='+id(10));
await db.exec("INSERT INTO audit_events(user_id,action,object_type,details) SELECT "+id(10)+",'REPORT_SYNTHETIC','test',jsonb_build_object('sequence',n) FROM generate_series(1,450) n");
await db.exec('SET ROLE authenticated');
let reporting=[],reportCursor=null;
for(;;){const page=(await db.query('SELECT sri_p03_reporting_page($1::date,$2::date,$3) result',[day,day,reportCursor])).rows.map(r=>r.result);reporting.push(...page);if(page.length<400)break;assert.notEqual(page.at(-1).cursor,reportCursor);reportCursor=page.at(-1).cursor;}
assert.ok(reporting.filter(r=>r.kind==='movement'&&r.action==='REPORT_SYNTHETIC').length===450);
assert.equal(new Set(reporting.map(r=>r.cursor)).size,reporting.length);
assert.ok(reporting.some(r=>r.kind==='treatment'&&r.status==='OUTROS'));
assert.ok(reporting.some(r=>r.kind==='movement'&&r.action==='TASK_REOPENED'));
assert.ok(reporting.some(r=>r.kind==='closure'));
await db.exec('RESET ROLE');
const auditLinks=(await db.query('SELECT l.* FROM private.sri_p03_monitor_audit_links l')).rows;
await db.exec('SET ROLE authenticated');
assert.ok(auditLinks.length>0,'monitoramento tem vínculos reais com auditoria');
const linked=(await db.query('SELECT sri_p03_monitor_occurrences($1,NULL) result',[auditLinks[0].event_id])).rows.map(r=>r.result);
assert.ok(linked.some(r=>r.audit_id===String(auditLinks[0].audit_id)));
await assert.rejects(db.query('SELECT * FROM private.sri_p03_monitor_audit_links'),/permission denied/);
await db.query("SELECT sri_p03_monitor_error(false,'PGRST202',404)");
const technical=(await db.query("SELECT sri_monitor_read(now()-interval '1 day',now()+interval '1 day','ERROR') result")).rows.map(r=>r.result);
assert.ok(technical.some(r=>r.code==='REST_ERROR'&&r.technical_codes==='PGRST202'));
await db.query("SELECT sri_p03_monitor_error(false,'token=private',9999)");
const globalGoal=(await db.query("SELECT sri_p03_goal_save('general',NULL,$1,70,NULL) id",[day])).rows[0].id;
await assert.rejects(db.query("SELECT sri_p03_goal_save('general',NULL,$1,75,NULL)",[day]),/outro usuário/);
const revisedGoal=(await db.query("SELECT sri_p03_goal_save('general',NULL,$1,75,$2) id",[day,globalGoal])).rows[0].id;
assert.notEqual(globalGoal,revisedGoal);
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(1)+'; SET ROLE authenticated');
const teamReports=(await db.query('SELECT sri_p03_reporting_page($1::date,$2::date,NULL) result',[day,day])).rows.map(r=>r.result);
assert.ok(teamReports.some(r=>r.kind==='assignment'&&r.protocol==='A'));
assert.ok(teamReports.every(r=>r.protocol!=='B'));
assert.ok(teamReports.every(r=>r.action!=='REPORT_SYNTHETIC'));
await assert.rejects(db.query("SELECT sri_p03_goal_save('general',NULL,$1,80,NULL)",[day]),/fora do escopo/);
await assert.rejects(db.query("SELECT sri_p03_goal_save('team',"+id(7)+",$1,80,NULL)",[day]),/fora do escopo/);
const teamGoal=(await db.query("SELECT sri_p03_goal_save('team',"+id(6)+",$1,80,NULL) id",[day])).rows[0].id;
await db.query("SELECT sri_p03_goal_save('operator',"+id(2)+",$1,85,NULL)",[day]);
await assert.rejects(db.query('UPDATE private.sri_p03_completion_goals SET percentage=0'),/permission denied/);
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(4)+'; SET ROLE authenticated');
const goals=(await db.query('SELECT sri_p03_goals() result')).rows.map(r=>r.result);
assert.ok(goals.some(g=>g.id===String(teamGoal)));
assert.equal(goals.filter(g=>g.scope==='general').length,2,'versões gerais preservadas');
await db.exec('RESET ROLE; SET request.jwt.claim.sub='+id(2)+'; SET ROLE authenticated');
await assert.rejects(db.query('SELECT sri_p03_reporting_page($1::date,$2::date,NULL)',[day,day]),/restritos/);
await assert.rejects(db.query('SELECT sri_p03_goals()'),/restrito/);
await assert.rejects(db.query("SELECT sri_p03_goal_save('general',NULL,$1,90,NULL)",[day]),/fora do escopo/);
await db.exec('RESET ROLE');
console.log('PASS: relatórios paginados preservam 450 eventos sem duplicar, com recorte por equipe, metas versionadas e proteção contra gravação direta e concorrente.');
// Legacy ACEITOU/OUTROS may still have an old mutable work_status. Readers must not count them as pending.
await db.exec('SET request.jwt.claim.sub='+id(10));
const beforeLegacy=(await db.query('SELECT coalesce(sum(active_stock),0)::int active,coalesce(sum(finalized_in_tool),0)::int finalized FROM sri_p03_productivity($1,$1)',[day])).rows[0];
for(const status of ['ACEITOU','OUTROS']){
 const protocol='Legacy-'+status;
 const task=(await db.query("INSERT INTO daily_operator_tasks(snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,work_status) VALUES ("+id(14)+","+id(6)+",$1,'Tarde',$2,"+id(2)+",'pending') RETURNING id",[day,protocol])).rows[0];
 await db.query("INSERT INTO daily_operator_treatments(task_id,actor_id,action,notes) VALUES ($1,"+id(2)+",$2,'Evento legado sintético')",[task.id,status]);
 await db.query("UPDATE daily_operator_tasks SET treatment_status=$2 WHERE id=$1",[task.id,status]);
}
const afterLegacy=(await db.query('SELECT coalesce(sum(active_stock),0)::int active,coalesce(sum(finalized_in_tool),0)::int finalized FROM sri_p03_productivity($1,$1)',[day])).rows[0];
assert.equal(afterLegacy.active,beforeLegacy.active);assert.equal(afterLegacy.finalized,beforeLegacy.finalized+2);
await db.exec('SET ROLE authenticated; SET request.jwt.claim.sub='+id(2));
const unresolved=(await db.query('SELECT sri_p03_my_unresolved() result')).rows.map(r=>r.result);
assert.ok(unresolved.every(r=>!r.protocol_number.startsWith('Legacy-')));
await db.exec('RESET ROLE');
assert.equal(Number((await db.query("SELECT count(*) FROM daily_operator_tasks WHERE protocol_number LIKE 'Legacy-%' AND work_status='pending'")).rows[0].count),2,'estado original permanece intacto');
// Next-day completed carry placeholders do not count as fresh receipts.
await db.exec('SET request.jwt.claim.sub='+id(10));
const nextDay=(await db.query("SELECT (date '2026-11-25'+1)::text AS next_day")).rows[0].next_day;
const nextReceived=(await db.query('SELECT coalesce(sum(received),0)::int total FROM sri_p03_productivity($1,$1)',[nextDay])).rows[0].total;
assert.equal(nextReceived,1,'somente a pendência C é recebida no dia seguinte; A concluído é excluído');
const nextReport=(await db.query('SELECT sri_p03_reporting_page($1,$1,NULL) result',[nextDay])).rows.map(r=>r.result);
assert.ok(nextReport.filter(r=>r.kind==='assignment').every(r=>r.protocol==='C'));
await db.exec("UPDATE daily_operator_tasks SET active=false WHERE protocol_number LIKE 'Legacy-%'; SET request.jwt.claim.sub="+id(2)+"; SET ROLE authenticated");
const legacyArchived=(await db.query("SELECT sri_my_daily_processed(NULL,200) result")).rows.map(r=>r.result);
assert.equal(legacyArchived.filter(r=>r.protocol_number.startsWith('Legacy-')).length,2,'conclusões legadas arquivadas continuam na carteira de leitura do mesmo dia');
await db.exec('RESET ROLE');
console.log('PASS: ACEITOU/OUTROS legados excluídos da carga e reconhecidos nas conclusões sem alterar registros; transporte concluído não cria recebimento no dia seguinte.');

// Reapplying the whole release cannot rewrite any pre-existing operational row.
const tables=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','private') ORDER BY schemaname,tablename")).rows;
const fingerprint=async()=>{const result={};for(const t of tables){const name=ident(t.schemaname)+'.'+ident(t.tablename);result[name]=(await db.query("SELECT count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash FROM "+name+' t')).rows[0];}return result;};
const beforeReapply=await fingerprint();
await db.exec(readFileSync(new URL('../sql/2026-11-25_sri_p03_release_integral.sql',import.meta.url),'utf8'));
assert.deepEqual(await fingerprint(),beforeReapply,'migrações não modificam registros já existentes');
const releaseBundle=readFileSync(new URL('../sql/2026-11-25_sri_p03_release_integral.sql',import.meta.url),'utf8');
const tamperedBundle=releaseBundle.replace('DO $integrity_after$',"UPDATE public.profiles SET full_name=full_name||'INVALID';\nDO $integrity_after$");
await assert.rejects(db.exec(tamperedBundle),/Integrity check failed/);
await db.exec('ROLLBACK');
assert.deepEqual(await fingerprint(),beforeReapply,'falha no hash reverte integralmente a transação');
console.log('PASS: o pacote atômico de 20 migrações pode ser reaplicado sem alterar quantidade nem conteúdo de qualquer registro público/privado existente; adulteração proposital é detectada e revertida.');
await db.close();
