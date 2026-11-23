import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),panel=read('sri-prd-painel.js');
const files=[
 'sql/2026-11-22_sri_p1_operator_task_authorization.sql',
 'sql/2026-11-22_sri_p1_publish_closure_guard.sql',
 'sql/2026-11-22_sri_p1_shift_close_distribution_guard.sql',
 'sql/2026-11-22_sri_p2_retention_risk_review.sql'
];
for(const path of files){
 const sql=read(path);
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
 assert.doesNotMatch(sql,/\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bTRUNCATE\b/i);
}
assert.match(html,/SRI CSV — correcoes auditaveis/);
assert.match(html,/rpc\('publish_general_operator_tasks'/);
assert.match(html,/rpc\('record_daily_operator_treatment'/);
assert.match(html,/rpc\('sri_close_result_shift'/);
assert.match(panel,/sri_v_daily_operational_metrics/);
assert.match(panel,/@page\{size:A4 portrait/);
assert.match(panel,/function freshRange\(/);
assert.match(panel,/function reportSummary\(/);
const p1pub=read(files[1]),p1close=read(files[2]),p2=read(files[3]);
assert.match(p1pub,/pg_advisory_xact_lock/);
assert.match(p1close,/pg_advisory_xact_lock/);
assert.match(p1pub,/sri-result-day:/);
assert.match(p1close,/sri-result-day:/);
assert.match(p2,/false AS exclusao_automatica_autorizada/);
assert.match(p2,/true AS confirmacao_integral_sigo_pendente/);
const cadence=read('docs/RETENCAO_BIMESTRAL_HOMOLOGACAO.md');
assert.match(cadence,/a cada dois meses/);
assert.match(cadence,/INTERVAL '2 months'/);
assert.match(cadence,/Nenhum agendador, cron, função de exclusão/);
const workflow=read('.github/workflows/sri-prd-static.yml');
for(const test of ['test_prd_static.mjs','test_csv_integrity.mjs','test_p1_authorization.mjs','test_p1_closure_guard.mjs','test_p1_pdf_reports.mjs','test_p2_retention.mjs','test_homologacao_integrada.mjs']){
 assert.ok(workflow.includes('node tests/'+test),'CI não inclui '+test);
}
console.log('PASS: cinco frentes consolidadas; exclusão bimestral documentada sem rotina destrutiva; CI abrangente.');
