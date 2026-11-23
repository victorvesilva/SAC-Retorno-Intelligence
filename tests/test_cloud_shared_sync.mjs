import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const markers=[
 'window.sriMarkLocalImportPending?.();ui.source=s.rows;',
 'window.sriMarkLocalUploadStaged?.();ui.files[type]=f;',
 'postLoad();setTimeout(()=>window.sriShareProcessedResult?.(),0)',
 "ctx.localDataUnsaved=true;ctx.snapshotId=null;ctx.revision=0;",
 "ctx.localDataUnsaved||!ctx.snapshotId",
 'await saveDistribution();\n    ctx.localDataUnsaved=false;',
 "ctx.syncedDistributionState=JSON.stringify(distributionState())",
 "select('id,team_id,operational_day,shift_label,created_at,payload_sha256')",
 "client.from('daily_result_snapshots')",
 "client.from('daily_result_distributions')",
 "setInterval(()=>{void checkSharedUpdates()},25000)",
 "setInterval(()=>{void checkOperatorTaskRefresh()},40000)",
 "if($('sri33-treatment')&&!$('sri33-treatment').hidden)return",
 "await loadLast({startup:true})",
 "if(startup&&ui.live&&!ctx.snapshotId)",
 'id="sri-shared-notice"',
 'id="sri-shared-apply"'
];
for(const m of markers)assert.ok(html.includes(m),'Fluxo compartilhado ausente: '+m);
assert.ok(html.includes('if(!publishingContextValid({showError:true}))return;'), 'Auto-publicação deve validar equipe e turno antes do envio');
assert.ok(html.includes('if(hasLocalChanges()&&!confirm('), 'Atualização manual deve exigir confirmação antes de descartar dados');
const start=html.indexOf("  const sharedDigestKey='sri_cloud_shared_digest_v1';");
const end=html.indexOf('  window.sriSnapshotAfterAuth=()=>{',start);
assert.ok(start>0&&end>start,'Controlador de sincronização não encontrado');
const nodes={};const $=id=>nodes[id]||(nodes[id]={hidden:true,textContent:'',value:''});
const state={snapshotId:'original',revision:3,busy:false,restoring:false,saveTimer:null,
  localDataUnsaved:false,syncedDistributionState:JSON.stringify({assignments:{}}),
  syncedPayloadHash:null,cloudTimer:null,cloudChecking:false,cloudPendingId:null,
  client:null,profile:{role:'supervisor'},user:{id:'x'}};
let assignments={};let loaded=[];
const context={
 ctx:state,ui:{busy:false},$: $,status:()=>{},console,document:{hidden:false,
 activeElement:{closest:()=>null},addEventListener:()=>{}},
 window:{addEventListener:()=>{}},setInterval:()=>100,clearTimeout:()=>{},
 localStorage:{getItem:()=>'',setItem:()=>{}},
 distributionState:()=>({assignments}),
 managerRoles:new Set(['admin','manager','supervisor']),
 loadSnapshot:async s=>{loaded.push(s.id);state.snapshotId=s.id},safe:async fn=>fn(),
 saveResult:async()=>{},loadLast:async()=>{},
};
vm.runInNewContext(html.slice(start,end)+'\n;globalThis.testSync={hasLocalChanges,showSharedNotice,clearSharedNotice,checkSharedUpdates}',context,{timeout:2000});
const sync=context.testSync;
assert.equal(sync.hasLocalChanges(),false);
context.window.sriMarkLocalUploadStaged();
assert.equal(sync.hasLocalChanges(),true,'CSV selecionado não deve ser sobrescrito');
state.fileStaged=false;
assignments={P1:{opId:'O1'}};
assert.equal(sync.hasLocalChanges(),true,'Distribuição alterada deve impedir atualização automática');
assignments={};context.window.sriMarkLocalImportPending();
assert.equal(state.localDataUnsaved,true);
assert.equal(state.snapshotId,null);
assert.equal(sync.hasLocalChanges(),true);
sync.showSharedNotice({id:'new'},'Atualizado');
assert.equal($('sri-shared-notice').hidden,false);
assert.equal(state.cloudPendingId,'new');
sync.clearSharedNotice();
assert.equal($('sri-shared-notice').hidden,true);
state.localDataUnsaved=true;state.snapshotId='old';state.teamId='team';
const candidate={id:'new',team_id:'team',operational_day:'2026-11-23'};
context.ctx.client={from:table=>{
 const q={select(){return q},order(){return q},limit(){return q},eq(){return q},
  then(resolve){return Promise.resolve({data:[candidate],error:null}).then(resolve)},
  maybeSingle(){return Promise.resolve({data:{revision:0},error:null})}};
 return q;
}};
await sync.checkSharedUpdates();
assert.equal(loaded.length,0,'Importação local não pode ser sobrescrita');
assert.equal(state.cloudPendingId,'new','Aviso deve apontar para a nova versão');
state.localDataUnsaved=false;state.fileStaged=false;state.syncedDistributionState=JSON.stringify({assignments:{}});
await sync.checkSharedUpdates();
assert.deepEqual(loaded,['new'],'Sessão limpa deve receber nova versão automaticamente');
console.log('PASS: publicação após apuração, polling gerencial/operador e bloqueio de sobrescrita local.');
