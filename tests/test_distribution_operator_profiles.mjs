import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../sql/2026-11-23_sri_importacao_geral.sql',import.meta.url),'utf8');
const legacy=fs.readFileSync(new URL('../sql/sri_operator_distribution_autolink_20261123.sql',import.meta.url),'utf8');
for(const marker of [
 "window.sriSyncDistributionCandidates=function(candidates,selectedTeamId)",
 "client.rpc('sri_general_distribution_candidates')",
 "client.rpc('publish_general_operator_tasks',{p_snapshot:snapshotId,p_revision:revision,p_details:details})",
 "if(Number(data?.unlinked)>0)throw Error(",
 "window.sriUnifiedCloudEligibleIds instanceof Set&&window.sriUnifiedCloudEligibleIds.has(o.id)",
 "const team=members.get(profile.id)||null"
])assert.ok(html.includes(marker),'Integração de operadores ausente: '+marker);
assert.match(sql,/p\.role='operator'/);
assert.match(sql,/p\.operational_status IN\('Ativo','Promovido'\)/);
assert.match(sql,/v_num_teams>1/);
assert.match(sql,/private\.is_supervisor_of\(v_team\)/);
assert.match(sql,/CREATE POLICY sri_general_tasks_read/);
assert.match(sql,/operator_user_id=\(SELECT auth\.uid\(\)\)/);
assert.match(legacy,/CREATE OR REPLACE FUNCTION public\.sri_activate_assigned_operator_accounts/,'Cadastro legado preservado');
assert.doesNotMatch(sql,/RETURNS TABLE\([^)]*(?:contact_email|password|cpf)/i);

const start=html.indexOf('window.sriSyncDistributionCandidates=function(');
const end=html.indexOf('window.sriRefreshCloudDistributionOptions=',start);
const window={};let refreshes=0;
const ctx={window,distSituation:x=>x.situation||'Ativo',console,
 distTargetOptions:()=>refreshes++,distBuildFilterOptions:()=>{},distRenderRoster:()=>{},
 distRefreshStats:()=>{},distApplyFilters:()=>{}};
vm.runInNewContext('let distRoster=[];\n'+html.slice(start,end)+'\n;globalThis.getRoster=()=>distRoster;',ctx);
ctx.window.sriSyncDistributionCandidates([
 {user_id:'00000000-0000-0000-0000-000000000011',full_name:'Operador Sem Equipe',team_id:null,operational_status:'Ativo'},
 {user_id:'00000000-0000-0000-0000-000000000022',full_name:'Operador Equipe A',team_id:'teamA',operational_status:'Promovido'},
 {user_id:'00000000-0000-0000-0000-000000000033',full_name:'Operador Equipe B',team_id:'teamB',operational_status:'Ativo'},
 {user_id:'00000000-0000-0000-0000-000000000044',full_name:'Operador Férias',team_id:null,operational_status:'Férias'}
],null);
assert.equal(ctx.getRoster().length,3,'Todos os operadores ativos devem estar disponíveis sem cadastro duplicado');
assert.equal(window.sriUnifiedCloudEligibleIds.size,3);
assert.equal(window.sriUnifiedCloudRosterTeams.get('acct:00000000-0000-0000-0000-000000000011'),null);
assert.ok(refreshes>0);
ctx.window.sriSyncDistributionCandidates([],null);
assert.equal(window.sriUnifiedCloudEligibleIds.size,0,'Lista autenticada atualiza elegibilidade');

const begin=html.indexOf('  async function publishTasks(snapshotId,revision){');
const finish=html.indexOf('  window.sriSyncOperatorTasks=publishTasks;',begin);
assert.ok(begin>0&&finish>begin);
let unlinked=0;const calls=[];
const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{published:2,unlinked},error:null}}};
const runtime={session:async()=>({client,profile:{role:'manager'}}),
 window:{sriGetDistributionDetails:()=>({})},stateMsg:()=>{},console};
vm.runInNewContext(html.slice(begin,finish)+'\n;globalThis.publish=publishTasks;',runtime);
await runtime.publish('snap',2);
assert.equal(calls.length,1,'Não exigir cadastro adicional de vínculo para publicação global');
assert.equal(calls[0].name,'publish_general_operator_tasks');
assert.equal(calls[0].args.p_snapshot,'snap');
unlinked=1;
await assert.rejects(runtime.publish('snap',3),/sem carteira publicada/);
console.log('PASS: operadores cadastrados e ativos recebem distribuição geral mesmo sem equipe; segurança mantida no banco.');
