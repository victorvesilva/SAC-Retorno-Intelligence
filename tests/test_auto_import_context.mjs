import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.ok(html.includes('id="sri-import-context"'),'Contexto compacto precisa existir');
assert.ok(html.includes('id="sri-daily-panel" hidden style="display:none"'),'Painel técnico não deve ocupar espaço');
assert.ok(!html.includes('<h3 style="color:#08418e;margin:0 0 8px">Publicação automática SAC + ATIVO</h3>'),'Remover o grande painel');
assert.match(html,/id="sri-import-context-fields" hidden/,'Seletores só na exceção');
assert.match(html,/id="sri-import-recovery" hidden/,'Recuperação só em falha');
assert.match(html,/id="sri-shared-notice" hidden/,'Conflitos não podem ser ocultados');
assert.match(html,/ctx\.userChoosingDestination=true;renderImportContext\(\)/,'Permitir seleção quando destino é ambíguo');
assert.match(html,/\.from\('team_memberships'\)\.select\('team_id'\)\.eq\('user_id',ctx\.user\.id\)/);
assert.match(html,/\.eq\('team_id',selectedTeam\)\.order\('created_at'/,'Recuperar só carteira da equipe escolhida');
assert.match(html,/if\(!selectedTeam\)return;\s*query=query\.eq\('team_id',selectedTeam\)/,'Não atualizar automaticamente outra equipe');
assert.match(html,/await loadLast\(\{startup:true\}\)/,'Recuperação automática da última apuração');
assert.match(html,/window\.sriQueueDistributionSave=queueDistributionSave/,'Salvar distribuição automaticamente');
assert.match(html,/sri-auto-toast-root/,'Manter notificações');
const begin=html.indexOf('  function selectAutomaticDestination(){');
const end=html.indexOf('  function resultPayload(){',begin);
assert.ok(begin>0&&end>begin,'Rotinas de determinação de destino');
const ops=[{id:'r1',name:'R1'},{id:'r2',name:'R2'}];
const teams=[{id:'t1',operation_id:'r1',name:'Teste'},{id:'t2',operation_id:'r2',name:'Equipe Glaucio'}];
function makeScenario({members=[],pref=null,availableTeams=teams}={}){
 const nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',dataset:{},hidden:false,scrollIntoView(){}});return nodes.get(id)};
 const ctx={operations:[],teams:[],profile:{role:'manager'},user:{id:'user-1'},linkedTeamIds:new Set(),userChoosingDestination:false};
 let summaryUpdates=0;
 const answers={
   operations:{data:ops,error:null},
   teams:{data:availableTeams,error:null},
   team_memberships:{data:members.map(team_id=>({team_id})),error:null}
 };
 const client={from(name){
   assert.ok(Object.hasOwn(answers,name),'Consulta não esperada '+name);
   return {select(){return this},eq(){return this},order(){return this},
     then(resolve,reject){return Promise.resolve(answers[name]).then(resolve,reject)}};
 }};
 const sandbox={
   ctx,$,window:{},managerRoles:new Set(['admin','manager','supervisor']),
   localStorage:{getItem:()=>null,setItem:()=>{}},
   preferredPublishingTarget:()=>pref,renderImportContext:()=>{summaryUpdates++},
   syncShift:()=>({day:'2026-11-24',shift:'Noite'}),inferredShift:()=> 'Noite',
   status:()=>{},esc:x=>x,auth:async()=>client,console
 };
 vm.runInNewContext(html.slice(begin,end)+'\n;globalThis.controls={loadMetadata,publishingContextValid,selectAutomaticDestination,setTeams};',sandbox,{timeout:1500});
 return {ctx,$,controls:sandbox.controls,updates:()=>summaryUpdates};
}

const none=makeScenario();
await none.controls.loadMetadata();
assert.equal(none.$('sri-daily-operation').value,'','Duas equipes sem preferência: não escolher operação aleatória');
assert.equal(none.$('sri-daily-team').value,'','Duas equipes sem preferência: não escolher equipe aleatória');
assert.equal(none.ctx.userChoosingDestination,true,'Seleção visível quando necessário');
assert.equal(none.controls.publishingContextValid(),false,'Bloquear publicação sem destino');
assert.ok(none.updates()>0);

const linked=makeScenario({members:['t1']});
await linked.controls.loadMetadata();
assert.equal(linked.$('sri-daily-operation').value,'r1');
assert.equal(linked.$('sri-daily-team').value,'t1','Vínculo único deve ser o destino automático');
assert.equal(linked.controls.publishingContextValid(),true,'Perfil com vínculo único não exige ação humana');

const multiLink=makeScenario({members:['t1','t2']});
await multiLink.controls.loadMetadata();
assert.equal(multiLink.$('sri-daily-team').value,'','Vários vínculos exigem escolha');

const preferred=makeScenario({pref:{operation:'r2',team:'t2'}});
await preferred.controls.loadMetadata();
assert.equal(preferred.$('sri-daily-team').value,'t2','Preferência válida elimina escolha repetitiva');
assert.equal(preferred.controls.publishingContextValid(),true);

const invalidPref=makeScenario({pref:{operation:'r2',team:'deleted'}});
await invalidPref.controls.loadMetadata();
assert.equal(invalidPref.$('sri-daily-team').value,'','Nunca usar preferência inválida');

const unique=makeScenario({availableTeams:[teams[1]]});
await unique.controls.loadMetadata();
assert.equal(unique.$('sri-daily-team').value,'t2','Única equipe acessível: identificar automaticamente');

console.log('PASS: painel simplificado, escolha somente na ambiguidade, vínculo único, preferência lembrada, proteção multi-equipe e recuperação automática.');
