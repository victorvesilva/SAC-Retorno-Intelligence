import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../sql/2026-11-22_sri_p1_operator_task_authorization.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(sql,/DROP POLICY IF EXISTS daily_tasks_read ON public\.daily_operator_tasks/);
assert.match(sql,/CREATE POLICY daily_tasks_read ON public\.daily_operator_tasks/);
assert.match(sql,/FOR SELECT TO authenticated/);
assert.match(sql,/active\s+AND operator_user_id\s*=\s*\(SELECT auth\.uid\(\)\)/);
assert.match(sql,/JOIN public\.team_memberships tm[\s\S]*JOIN public\.operator_links ol/);
assert.match(sql,/p\.role='operator'/);
assert.match(sql,/p\.operational_status IN \('Ativo','Promovido'\)/);
assert.match(sql,/v_task\.operator_user_id=auth\.uid\(\)/);
assert.match(sql,/v_operator_allowed\s+OR private\.is_manager\(\)\s+OR private\.is_supervisor_of\(v_task\.team_id\)/);
assert.match(sql,/IF NOT FOUND OR NOT v_task\.active/);
assert.match(sql,/FOR UPDATE/);
assert.match(sql,/record_daily_operator_treatment/);
assert.match(sql,/INSERT INTO public\.daily_operator_treatments/);
assert.match(sql,/INSERT INTO public\.audit_events/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.record_daily_operator_treatment\(uuid,text,text\) FROM PUBLIC, anon/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.record_daily_operator_treatment\(uuid,text,text\) TO authenticated/);
assert.doesNotMatch(sql,/\bDELETE FROM\b|TRUNCATE\b|DROP TABLE\b/i);
assert.match(html,/\.eq\('snapshot_id',ctx\.snapshotId\)\.eq\('revision',ctx\.revision\)/);
assert.match(html,/rpc\('publish_daily_operator_tasks'/);
assert.match(html,/rpc\('record_daily_operator_treatment'/);

const publishSql=fs.readFileSync(new URL('../sql/2026-11-22_sri_p1_publish_closure_guard.sql',import.meta.url),'utf8');
assert.match(publishSql,/CREATE OR REPLACE FUNCTION public\\.publish_daily_operator_tasks/);
assert.match(publishSql,/pg_advisory_xact_lock/);
assert.match(publishSql,/sri-result-day:/);
assert.match(publishSql,/sri_result_shift_closures/);
assert.match(publishSql,/sri_result_day_closures/);
assert.match(publishSql,/closed_with_pending/);
assert.match(publishSql,/reabertura autorizada/);
assert.match(publishSql,/v_revision<>p_revision/);
assert.match(publishSql,/v_latest IS DISTINCT FROM p_snapshot/);
assert.doesNotMatch(publishSql,/\\bDELETE FROM\\b|TRUNCATE\\b|DROP TABLE\\b/i);

console.log('PASS: autorização ativa, vínculos obrigatórios, auditoria e atualização otimista preservadas. Teste de código: não substitui teste multiusuário.');
