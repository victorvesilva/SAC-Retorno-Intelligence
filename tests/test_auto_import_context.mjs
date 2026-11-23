import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../sql/2026-11-23_sri_importacao_geral.sql',import.meta.url),'utf8');

assert.match(html,/id="sri-import-context"/);
assert.match(html,/id="sri-daily-panel" hidden style="display:none"/);
assert.match(html,/id="sri-daily-operation" hidden aria-hidden="true"/);
assert.match(html,/id="sri-daily-team" hidden aria-hidden="true"/);
assert.match(html,/id="sri-daily-team" hidden aria-hidden="true"/);
assert.doesNotMatch(html,/Selecione uma vez a operação e a equipe para receber os resultados/);
assert.match(html,/id="sri-import-recovery" hidden/);
assert.match(html,/id="sri-shared-notice" hidden/);
assert.match(html,/await loadLast\(\{startup:true\}\)/);
assert.match(html,/window\.sriQueueDistributionSave=queueDistributionSave/);
assert.match(html,/window\.sriRefreshDistributionCandidates\?\.\(\)/);
assert.match(html,/window\.sriCanAutoPublish=\(\)=>publishingContextValid/);
assert.match(html,/const team=null,\{day,shift\}=syncShift\(\)/);
assert.match(html,/\.is\('team_id',null\)\.order\('created_at'/);
assert.match(html,/query=query\.is\('team_id',null\)/);
assert.match(html,/client\.rpc\('sri_general_distribution_candidates'\)/);
assert.match(html,/client\.rpc\('publish_general_operator_tasks'/);
assert.match(html,/sri-auto-toast-root/);
for(const expected of [
 'ALTER TABLE public.daily_result_snapshots ALTER COLUMN team_id DROP NOT NULL',
 'ALTER TABLE public.daily_operator_tasks ALTER COLUMN team_id DROP NOT NULL',
 'CREATE UNIQUE INDEX IF NOT EXISTS sri_general_snapshots_unique',
 'CREATE POLICY sri_general_snapshots_insert',
 'CREATE POLICY sri_general_snapshots_read',
 'CREATE OR REPLACE FUNCTION public.publish_general_operator_tasks',
 'CREATE OR REPLACE FUNCTION public.sri_general_distribution_candidates',
 'CREATE OR REPLACE FUNCTION public.record_daily_operator_treatment',
 'CREATE OR REPLACE FUNCTION private.sri_close_general_days',
 'sri-close-general-20h-brasilia',
 "team_id IS NULL",
 "p.operational_status IN('Ativo','Promovido')"
])assert.ok(sql.includes(expected),'Regra backend ausente: '+expected);
assert.match(sql,/private\.is_supervisor_of\(v_team\)/,'Permissões de supervisão são mantidas');
assert.match(sql,/operator_user_id=\(SELECT auth\.uid\(\)\)/,'Operador só lê sua carteira');
assert.match(sql,/v_num_teams>1/,'Conflitos reais de equipe não podem ser aplicados automaticamente');
assert.match(sql,/ON CONFLICT\(snapshot_id,protocol_number\) DO UPDATE/,'Publicação idempotente de protocolos');
assert.match(sql,/v_task\.team_id IS NULL/,'Operador sem equipe pode registrar tratativa');
assert.doesNotMatch(sql,/TRUNCATE\b|DELETE\s+FROM\s+public\.daily_operator_tasks/i);

const a=html.indexOf('  function publishingContextValid({showError=false}={}){');
const b=html.indexOf('  function resultPayload(){',a);
assert.ok(a>0&&b>a);
let calls=0;
const ctx={ctx:{profile:{role:'manager'},operations:[],teams:[]},window:{},
 managerRoles:new Set(['admin','manager','supervisor']),
 inferredShift:()=> 'Manhã',status:()=>{},renderImportContext:()=>{},
 auth:async()=>({}),console};
vm.runInNewContext(html.slice(a,b)+'\n;globalThis.getRules={publishingContextValid,loadMetadata}',ctx);
assert.equal(ctx.getRules.publishingContextValid(),true,'Gestor pode importar geral, sem equipe');
await ctx.getRules.loadMetadata();
assert.equal(ctx.ctx.teams.length,0,'Nenhuma escolha de equipe é necessária');
assert.equal(calls,0);
ctx.ctx.profile={role:'operator'};
assert.equal(ctx.getRules.publishingContextValid(),false,'Operador não deve importar apuração geral');
console.log('PASS: importação geral SAC+ATIVO sem campos de equipe, permissões e distribuição por UUID.');
