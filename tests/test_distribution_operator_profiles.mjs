import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../sql/sri_operator_distribution_autolink_20261123.sql',import.meta.url),'utf8');
const required=[
 "window.sriSyncDistributionCandidates=function(candidates,selectedTeamId)",
 "window.sriUnifiedCloudEligibleIds instanceof Set&&window.sriUnifiedCloudEligibleIds.has(o.id)",
 "client.rpc('sri_distribution_operator_candidates',{p_team:team})",
 "client.rpc('sri_activate_assigned_operator_accounts',{p_snapshot:snapshotId,p_revision:revision})",
 "client.rpc('publish_daily_operator_tasks',{p_snapshot:snapshotId,p_revision:revision,p_details:details})",
 "if(Number(data?.unlinked)>0)throw Error(",
 "if(document.getElementById('sri-daily-team')?.value!==team)return"
];
for(const m of required)assert.ok(html.includes(m),'Integração de operadores cadastrados ausente: '+m);
assert.ok(html.indexOf("client.rpc('sri_activate_assigned_operator_accounts'") <
 html.indexOf("client.rpc('publish_daily_operator_tasks'"),
 'O vínculo deve preceder a publicação da carteira');

const sqlRequired=[
 'CREATE OR REPLACE FUNCTION public.sri_distribution_operator_candidates(p_team uuid)',
 "p.role='operator'",
 "p.operational_status IN ('Ativo','Promovido')",
 'private.is_supervisor_of(p_team)',
 'CREATE OR REPLACE FUNCTION public.sri_activate_assigned_operator_accounts(',
 "v_role<>'operator' OR v_status NOT IN ('Ativo','Promovido')",
 "team_memberships tm WHERE tm.user_id=v_user AND tm.team_id<>v_team",
 "operator_links ol WHERE ol.user_id=v_user AND ol.team_id<>v_team",
 "e.value->>'opId' ~ '^acct:[0-9a-fA-F-]{36}$'",
 "ON CONFLICT (team_id,user_id) DO NOTHING",
 "DISTRIBUTION_OPERATOR_AUTO_LINKED",
 "REVOKE ALL ON FUNCTION public.sri_distribution_operator_candidates(uuid) FROM PUBLIC, anon"
];
for(const m of sqlRequired)assert.ok(sql.includes(m),'Proteção no Supabase ausente: '+m);
assert.ok(!/RETURNS TABLE\([^)]*(?:contact_email|password|cpf)/i.test(sql),'Listagem não pode expor dados pessoais além de nome/perfil');

const start=html.indexOf('window.sriSyncDistributionCandidates=function(');
const end=html.indexOf('window.sriRefreshCloudDistributionOptions=',start);
assert.ok(start>0&&end>start);
let refreshes=0;
const window={};
const ctx={
 window,distSituation:x=>x.situation||'Ativo',
 distTargetOptions:()=>refreshes++,distBuildFilterOptions:()=>{},
 distRenderRoster:()=>{},distRefreshStats:()=>{},distApplyFilters:()=>{},console
};
vm.runInNewContext('let distRoster=[];\n'+html.slice(start,end)+
 '\n;globalThis.getRoster=()=>distRoster;',ctx);
ctx.window.sriSyncDistributionCandidates([
 {user_id:'00000000-0000-0000-0000-000000000011',full_name:'Operador Um',team_id:null,operational_status:'Ativo'},
 {user_id:'00000000-0000-0000-0000-000000000022',full_name:'Operador Dois',team_id:'teamA',operational_status:'Promovido'},
 {user_id:'00000000-0000-0000-0000-000000000033',full_name:'Operador de Outra Equipe',team_id:'teamB',operational_status:'Ativo'},
 {user_id:'00000000-0000-0000-0000-000000000044',full_name:'Operador em Férias',team_id:null,operational_status:'Férias'}
 ],'teamA');
assert.equal(ctx.getRoster().length,2,'Operador sem equipe e da equipe devem ser elegíveis, demais não');
assert.equal(window.sriUnifiedCloudEligibleIds.size,2);
assert.ok(window.sriUnifiedCloudEligibleIds.has('acct:00000000-0000-0000-0000-000000000011'));
assert.ok(window.sriUnifiedCloudEligibleIds.has('acct:00000000-0000-0000-0000-000000000022'));
assert.ok(refreshes>0);
ctx.window.sriSyncDistributionCandidates([],null);
assert.equal(window.sriUnifiedCloudEligibleIds.size,0,'Trocar equipe deve revogar elegibilidade anterior, sem alterar cadastro no banco');

const pubStart=html.indexOf('  async function publishTasks(snapshotId,revision){');
const pubEnd=html.indexOf('  window.sriSyncOperatorTasks=publishTasks;',pubStart);
assert.ok(pubStart>0&&pubEnd>pubStart);
const calls=[];
let activationError=null,unlinked=0;
const client={rpc:async (functionName,args)=>{
 calls.push({functionName,args});
 if(functionName==='sri_activate_assigned_operator_accounts')return {error:activationError,data:{checked:2,auto_linked:1}};
 if(functionName==='publish_daily_operator_tasks')return {data:{published:2,unlinked},error:null};
 throw Error('RPC desconhecida');
}};
const pubCtx={
 session:async()=>({client,profile:{role:'manager'}}),
 window:{sriGetDistributionDetails:()=>({})},stateMsg:()=>{},console
};
vm.runInNewContext(html.slice(pubStart,pubEnd)+'\n;globalThis.publish=publishTasks;',pubCtx);
await pubCtx.publish('snap',4);
assert.deepEqual(calls.map(x=>x.functionName),['sri_activate_assigned_operator_accounts','publish_daily_operator_tasks']);
assert.equal(calls[0].args.p_snapshot,'snap');
assert.equal(calls[0].args.p_revision,4);
activationError={message:'Operador já pertence a outra equipe'};
calls.length=0;
await assert.rejects(pubCtx.publish('snap',4),/Operador já pertence a outra equipe/);
assert.equal(calls.length,1,'Não publicar carteira quando a vinculação for rejeitada');
activationError=null;unlinked=1;calls.length=0;
await assert.rejects(pubCtx.publish('snap',4),/sem carteira publicada/);
console.log('PASS: perfil Operador ativo e sem equipe pode distribuir; vínculo automático validado por equipe, sem publicação falsa.');
