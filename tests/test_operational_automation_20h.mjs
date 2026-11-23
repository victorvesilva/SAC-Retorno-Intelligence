import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../sql/2026-11-23_sri_turnos_fechamento_20h.sql',import.meta.url),'utf8');
const globalSql=fs.readFileSync(new URL('../sql/2026-11-23_sri_importacao_geral.sql',import.meta.url),'utf8');
const a=html.indexOf('  // Turno definido exclusivamente pelo relógio de Brasília');
const b=html.indexOf('  function setTeams(){',a);
assert.ok(a>0&&b>a,'Contexto automático não encontrado');
const context={window:{},$:()=>({value:''})};
vm.runInNewContext(html.slice(a,b),context);
const clock=context.window.sriOperationalContext;
assert.equal(typeof clock,'function');
const cases=[
 ['2026-11-23T09:59:00Z','Noite','2026-11-23'], // 06:59 BRT
 ['2026-11-23T10:00:00Z','Manhã','2026-11-23'],
 ['2026-11-23T15:59:00Z','Manhã','2026-11-23'],
 ['2026-11-23T16:00:00Z','Tarde','2026-11-23'],
 ['2026-11-23T20:59:00Z','Tarde','2026-11-23'],
 ['2026-11-23T21:00:00Z','Noite','2026-11-23'],
 ['2026-11-23T22:59:00Z','Noite','2026-11-23'],
 ['2026-11-23T23:00:00Z','Noite','2026-11-24'],
 ['2026-11-24T05:00:00Z','Noite','2026-11-24'],
 ['2026-11-24T09:59:00Z','Noite','2026-11-24'],
 ['2026-11-24T10:00:00Z','Manhã','2026-11-24']
];
for(const [utc,shift,day] of cases){
 const actual=clock(new Date(utc));
 assert.equal(actual.shift,shift,'Turno incorreto '+utc);
 assert.equal(actual.day,day,'Ciclo operacional incorreto '+utc);
}
assert.match(html,/<input id="sri-daily-day" type="hidden">/);
assert.match(html,/<input id="sri-daily-shift" type="hidden">/);
assert.match(html,/const team=null,\{day,shift\}=syncShift\(\)/);
assert.match(html,/await carryForwardDistribution\(client,team,day,shift\)/);
assert.match(html,/is\('team_id',null\)\.eq\('operational_day',day\)\.eq\('shift_label',shift\)/);
assert.match(html,/function notify\(message,kind='success'\)/);
assert.match(html,/window\.sriToast=notify/);
assert.match(html,/root\.id='sri-auto-toast-root'/);
assert.match(html,/sri-retry-show/);
assert.match(sql,/private\.sri_close_due_days/);
assert.match(sql,/AT TIME ZONE 'America\/Sao_Paulo'/);
assert.match(sql,/time '20:00:00'/);
assert.match(sql,/cron\.schedule\(/);
assert.match(sql,/'\*\/5 \* \* \* \*'/);
assert.match(sql,/RESULT_DAY_AUTO_CLOSED/);
assert.match(sql,/RESULT_SHIFT_AUTO_CLOSED/);
assert.match(sql,/pending_shift_count/);
assert.match(sql,/private\.sri_carry_task_status/);
assert.match(sql,/NEW\.operator_user_id/);
assert.match(sql,/ALTER COLUMN closed_by DROP NOT NULL/);
assert.doesNotMatch(sql,/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/i);
assert.match(globalSql,/sri-close-general-20h-brasilia/);
assert.match(globalSql,/private\.sri_close_general_days/);
assert.match(globalSql,/time '20:00'/);
console.log('PASS: 11 limites horários, fechamento 20h, salvamento automatico, toast, histórico, PG cron e proteção de progresso.');
