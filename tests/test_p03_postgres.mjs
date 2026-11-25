const { PGlite } = await import(process.env.SRI_PGLITE_MODULE || '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const sql = name => readFileSync(new URL('../sql/'+name,import.meta.url),'utf8');
const ids = Object.fromEntries(['operator','other','assistant','supervisor','admin','viewer','team','foreign','s23','s24','t23','t24','tOther'].map((name,i)=>[name,'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0')]));
const ref = name => "'"+ids[name]+"'";
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA private; CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA private,auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE TABLE profiles(id uuid PRIMARY KEY, role text, full_name text, operational_status text, supervisor_id uuid,
 CONSTRAINT profiles_role_check CHECK (role IN ('operator','viewer','supervisor','manager','admin')));
CREATE TABLE team_memberships(user_id uuid,team_id uuid);
CREATE TABLE daily_result_snapshots(id uuid PRIMARY KEY,operational_day date,shift_label text,created_at timestamptz,protocol_count int,indicators jsonb,team_id uuid);
CREATE TABLE daily_operator_tasks(id uuid PRIMARY KEY,protocol_number text,operator_user_id uuid,criticality text,source_status text,work_status text,treatment_status text,due_date date,base_name text,area_name text,snapshot_id uuid);
CREATE TABLE daily_operator_treatments(id bigint PRIMARY KEY,action text,notes text,created_at timestamptz,task_id uuid,actor_id uuid);
CREATE FUNCTION private.is_supervisor_of(team uuid) RETURNS bool LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.team_memberships m ON m.user_id=p.id WHERE p.id=auth.uid() AND p.role = 'supervisor' AND m.team_id=team)
$$;
CREATE TABLE scoped(team_id uuid);
ALTER TABLE scoped ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON scoped TO authenticated;
CREATE POLICY scoped_read ON scoped FOR SELECT TO authenticated USING(private.is_supervisor_of(team_id));
`);
await db.exec(sql('2026-11-24_sri_p03_historico_datas.sql'));
await db.exec(sql('2026-11-24_sri_p03_perfil_assistente.sql'));
const statuses=sql('2026-11-24_sri_criticos_persistencia_status.sql');
await db.exec(statuses.slice(statuses.indexOf('CREATE OR REPLACE FUNCTION'),statuses.indexOf('CREATE OR REPLACE FUNCTION public.record_daily')));
await db.exec(`
INSERT INTO profiles VALUES
(${ref('operator')},'operator','Operador','Ativo',NULL),(${ref('other')},'operator','Outro','Ativo',NULL),
(${ref('assistant')},'assistant','Assistente','Ativo',NULL),(${ref('supervisor')},'supervisor','Supervisor','Ativo',NULL),
(${ref('admin')},'admin','Administrador','Ativo',NULL),(${ref('viewer')},'viewer','Consulta','Ativo',NULL);
INSERT INTO team_memberships VALUES (${ref('operator')},${ref('team')}),(${ref('assistant')},${ref('team')}),(${ref('supervisor')},${ref('team')}),(${ref('other')},${ref('foreign')});
INSERT INTO scoped VALUES (${ref('team')}),(${ref('foreign')});
INSERT INTO daily_result_snapshots VALUES
(${ref('s23')},'2026-11-23','Tarde','2026-11-23T20:00Z',2,'{}',${ref('team')}),
(${ref('s24')},'2026-11-24','Tarde','2026-11-24T20:00Z',1,'{}',NULL);
INSERT INTO daily_operator_tasks(id,protocol_number,operator_user_id,snapshot_id) VALUES
(${ref('t23')},'P23',${ref('operator')},${ref('s23')}),(${ref('t24')},'P24',${ref('operator')},${ref('s24')}),(${ref('tOther')},'Outro',${ref('other')},${ref('s24')});
INSERT INTO daily_operator_treatments VALUES
(1,'ACEITOU',NULL,'2026-11-24T02:59:59Z',${ref('t23')},${ref('operator')}),
(2,'FILIAL',NULL,'2026-11-24T03:00:00Z',${ref('t24')},${ref('operator')}),
(3,'DÚVIDA',NULL,'2026-11-24T02:59:59Z',${ref('tOther')},${ref('other')});
`);
for (const [name,code] of Object.entries({'E-MAIL':3,'LIGAÇÃO':3,ASCSAC:3,RECUSOU:2,ACEITOU:3,ASSOCIADO:2,OUTROS:3,FILIAL:10,'DÚVIDA':0,OUVIDORIA:2,PENDENTE:0,'MÍDIAS NE':3,'CARTA AR':3})) {
 const {rows:[result]}=await db.query('SELECT private.sri_p03_status_sigo($1) AS code, private.sri_p03_status_work($1) AS work',[name]);
 assert.equal(result.code,code);
 assert.equal(result.work==='completed_in_tool',code===3);
}
const identify = name => db.exec("RESET ROLE; SET request.jwt.claim.sub="+ref(name)+"; SET ROLE authenticated");
const values = async statement => (await db.query(statement)).rows.map(row=>row.result);
await identify('operator');
assert.deepEqual((await values("SELECT sri_p03_my_treatments_page('2026-11-23','2026-11-23') result")).map(row=>row.id),[1]);
assert.deepEqual((await values("SELECT sri_p03_my_treatments_page('2026-11-24','2026-11-24') result")).map(row=>row.id),[2]);
await assert.rejects(db.query("SELECT sri_p03_history_snapshots('2026-11-23')"),/indisponível/);
for(const name of ['assistant','supervisor']){
 await identify(name);
 assert.deepEqual(await values('SELECT team_id result FROM scoped'),[ids.team]);
 for(const day of ['23','24']){
  const [snapshot]=await values("SELECT sri_p03_history_snapshots('2026-11-"+day+"') result");
  assert.equal(snapshot.id,ids['s'+day]);
  assert.equal(snapshot.protocol_count,null);
  assert.deepEqual((await values("SELECT sri_p03_history_tasks('"+snapshot.id+"') result")).map(row=>row.protocol_number),['P'+day]);
 }
 assert.deepEqual(await values("SELECT sri_p03_history_snapshots('2026-11-22') result"),[]);
 await assert.rejects(db.query("SELECT sri_p03_my_treatments_page('2026-11-23','2026-11-23')"),/restrito/);
}
await identify('admin');
assert.deepEqual((await values('SELECT sri_p03_history_tasks('+ref('s24')+') result')).map(row=>row.protocol_number),['Outro','P24']);
await identify('viewer');
await assert.rejects(db.query('SELECT sri_p03_history_tasks('+ref('s24')+')'),/indisponível/);
await db.exec("RESET ROLE; RESET request.jwt.claim.sub; SET ROLE anon");
await assert.rejects(db.query("SELECT sri_p03_history_snapshots('2026-11-23')"),/permission denied/);
await db.exec("RESET ROLE");
for(const [table,count] of [['daily_result_snapshots',2],['daily_operator_tasks',3],['daily_operator_treatments',3]]) {
 assert.equal(Number((await db.query('SELECT count(*) FROM '+table)).rows[0].count),count);
}

await db.exec(`
ALTER TABLE daily_operator_tasks ADD COLUMN team_id uuid, ADD COLUMN operational_day date;
CREATE TABLE teams(id uuid PRIMARY KEY,name text);
INSERT INTO teams VALUES (${ref('team')},'Equipe A'),(${ref('foreign')},'Equipe B');
UPDATE daily_operator_tasks SET team_id=${ref('team')},operational_day='2026-11-23';
`);
const migration=sql('2026-11-25_sri_p03_historico_imutavel.sql');
await db.exec(migration);
await db.exec(migration);
await identify('admin');
assert.deepEqual(await values('SELECT sri_p03_history_tasks('+ref('s23')+') result'),[],'não fabricar histórico anterior à migração');
await db.exec(`RESET ROLE; UPDATE daily_operator_tasks SET treatment_status='PENDENTE',base_name='Base original',area_name='Área original' WHERE id=${ref('t23')};
 UPDATE private.sri_p03_task_versions SET captured_at='2026-11-23T20:00Z';
 UPDATE daily_operator_tasks SET treatment_status='ACEITOU',work_status='completed_in_tool' WHERE id=${ref('t23')};
 UPDATE private.sri_p03_task_versions SET captured_at='2026-11-24T14:00Z' WHERE payload->>'treatment_status'='ACEITOU';
`);
for(const name of ['admin','supervisor','assistant']){
 await identify(name);
 const [history]=await values('SELECT sri_p03_history_tasks('+ref('s23')+') result');
 assert.equal(history.treatment_status,'PENDENTE','alteração posterior preserva estado de 23/11');
 assert.equal(history.operator_name,'Operador');
 assert.equal(history.team_name,'Equipe A');
}
await db.exec(`RESET ROLE;
 INSERT INTO daily_operator_treatments(id,action,created_at,task_id,actor_id,event_context)
 VALUES (4,'OUTROS','2026-11-23T20:00Z',${ref('t23')},${ref('operator')},'{"base_name":"valor forjado"}');
 UPDATE daily_operator_tasks SET base_name='Base posterior',area_name='Área posterior' WHERE id=${ref('t23')};
`);
await identify('operator');
const events=await values("SELECT sri_p03_my_treatments_page('2026-11-23','2026-11-23') result");
assert.equal(events[0].base_name,'Base original');
assert.equal(events[0].area_name,'Área original');
assert.equal(events[1].base_name,null,'metadado histórico ausente permanece ausente');
await assert.rejects(db.query('SELECT * FROM private.sri_p03_task_versions'),/permission denied/);
await identify('viewer');
await assert.rejects(db.query('SELECT sri_p03_history_tasks('+ref('s23')+')'),/indisponível/);
await db.exec('RESET ROLE');
assert.equal(Number((await db.query('SELECT count(*) FROM daily_operator_treatments')).rows[0].count),4);

await db.exec(`
CREATE TABLE private.sri_monitor_events(id bigint PRIMARY KEY,severity text);
INSERT INTO private.sri_monitor_events VALUES (1,'FATAL'),(2,'INFO');
`);
const protection=sql('2026-11-24_sri_pacote03_protecao_incidentes.sql');
await db.exec(protection.slice(protection.indexOf('CREATE TABLE IF NOT EXISTS private.sri_p03_incidents')));
await identify('operator');
await assert.rejects(db.query("SELECT sri_p03_incident_set(1,'identified','analysis')"),/administrador/);
await identify('admin');
await assert.rejects(db.query("SELECT sri_p03_incident_set(2,'identified','analysis')"),/indisponível/);
await assert.rejects(db.query("SELECT sri_p03_incident_set(1,'identified','resolved')"),/Transição inválida/);
await db.exec("SELECT sri_p03_incident_set(1,'identified','analysis')");
await assert.rejects(db.query("SELECT sri_p03_incident_set(1,'identified','analysis')"),/Incidente alterado/);
for(const [from,to] of [['analysis','correction'],['correction','validation'],['validation','resolved'],['resolved','analysis']]){
 await db.query('SELECT sri_p03_incident_set(1,$1,$2)',[from,to]);
}
const [incident]=await values('SELECT sri_p03_incident_list() result');
assert.equal(incident.stage,'analysis');
await db.exec('RESET ROLE');
assert.equal(Number((await db.query('SELECT count(*) FROM private.sri_p03_incident_history')).rows[0].count),5);
console.log('PASS: ciclo de incidente com controle de concorrência, reabertura auditada e acesso exclusivo do Administrador.');
await db.close();
console.log('PASS: migração aditiva e repetível, estados de 23/11 preservados após conclusão em 24/11, autoria/equipe congeladas, Base/Área do evento imutáveis, proteção de tabelas e ausência histórica explícita.');

console.log('PASS: duas migrações e funções de classificação executadas em PostgreSQL isolado. Validados data, fuso, autoria, grants, RLS de equipe, paridade Supervisor/Assistente no recorte sintético, 13 códigos e contagens preservadas.');
