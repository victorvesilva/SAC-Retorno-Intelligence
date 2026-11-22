import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../sql/2026-11-22_sri_p1_shift_close_distribution_guard.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(sql,/CREATE OR REPLACE FUNCTION public\.sri_close_result_shift/);
assert.match(sql,/v_snap\.protocol_count>0 AND v_tasks=0/);
assert.match(sql,/v_mismatched_tasks>0/);
assert.match(sql,/v_expected_assignments>v_tasks/);
assert.match(sql,/distribution_revision<>v_dist/);
assert.match(sql,/COALESCE\(\(SELECT state->'assignments'/);
assert.match(sql,/v_dist IS DISTINCT FROM p_revision/);
assert.match(sql,/v_newer IS DISTINCT FROM p_snapshot/);
assert.match(sql,/p_confirm_last_import IS DISTINCT FROM true/);
assert.match(sql,/private\.is_supervisor_of\(v_snap\.team_id\)/);
assert.match(sql,/sri_result_day_closures/);
assert.match(sql,/jsonb_build_object\('protocol_count'/);
assert.match(sql,/RESULT_SHIFT_CLOSED/);
assert.match(html,/rpc\('sri_close_result_shift'/);
assert.doesNotMatch(sql,/\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bTRUNCATE\b/i);

console.log('PASS: fechamento exige carteiras publicadas e revisao atual; controles originais e auditoria preservados.');
