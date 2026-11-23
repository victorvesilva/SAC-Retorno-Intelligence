import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function mustContain(s){assert.ok(html.includes(s),'Ponto ausente: '+s);}
mustContain('window.sriCanAutoPublish&&!window.sriCanAutoPublish()');
mustContain('postLoad();setTimeout(()=>window.sriShareProcessedResult?.(),0)');
mustContain("window.sriShareProcessedResult=()=>{");
mustContain("void safe(saveResult)");
mustContain("Turno (automático)");
mustContain("Reenviar apuração pendente");
mustContain("sri_auto_publish_target_v1_");
mustContain("const heading=root.querySelector('.section-heading')");
mustContain("a apuração consolidada, seus indicadores e a distribuição");
mustContain("ctx.pendingSnapshot={key,id:snapshotId}");
mustContain("throw Error('Distribuição salva, mas a carteira dos operadores NÃO foi sincronizada: '");
const startMeta=html.indexOf('  // O destino é escolhido UMA vez');
const endMeta=html.indexOf('  function resultPayload(){',startMeta);
assert.ok(startMeta>0&&endMeta>startMeta,'Metadados do fluxo automático');
function runMetadata(){
 const nodes={};
 const $=id=>nodes[id]||(nodes[id]={value:'',innerHTML:'',scrollIntoView(){},addEventListener(){}});
 const saves=new Map();
 const ctx={operations:[{id:'r1',name:'R1'},{id:'r2',name:'R2'}],
  teams:[{id:'t1',name:'R1 Equipe',operation_id:'r1'},{id:'t2',name:'R2 Equipe',operation_id:'r2'}],
  profile:{role:'manager'},user:{id:'u'}};
 const context={ctx,$,window:{},managerRoles:new Set(['admin','manager','supervisor']),
  localStorage:{getItem:k=>saves.get(k)||null,setItem:(k,v)=>saves.set(k,v)},
  status:()=>{},esc:s=>s};
 vm.runInNewContext(html.slice(startMeta,endMeta)+'\n;globalThis.meta={inferredShift,setTeams,loadMetadata,publishingContextValid,rememberPublishingTarget};',context);
 assert.equal(context.meta.inferredShift(),'','Operação não selecionada não pode ter turno inferido');
 assert.equal(context.meta.publishingContextValid(),false,'Não salvar em equipe padrão arbitrária');
 $('sri-daily-operation').value='r1';context.meta.setTeams();
 assert.equal($('sri-daily-team').value,'t1','Equipe única da operação escolhida deve ser inferida');
 assert.equal(context.meta.inferredShift(),'Manhã');
 assert.equal(context.meta.publishingContextValid(),true);
 context.meta.rememberPublishingTarget();
 $('sri-daily-operation').value='r2';context.meta.setTeams();
 assert.equal(context.meta.inferredShift(),'Tarde');
 assert.equal($('sri-daily-team').value,'t2');
 return true;
}
assert.equal(runMetadata(),true);
const startSave=html.indexOf('  async function saveResult(){');
const endSave=html.indexOf('  function distributionState(){',startSave);
assert.ok(startSave>0&&endSave>startSave);
const code=html.slice(startSave,endSave);
assert.ok(!code.includes('confirm('),'Publicação automática nunca deve pedir confirmação');
assert.ok(!code.includes("ui.files"),'Não usar CSVs originais para gravar no Supabase');
const statusLog=[];
let inserts=0,failDist=true;
const rows=[];
const client={from:table=>{
 assert.equal(table,'daily_result_snapshots');
 return {insert:payload=>{
  inserts++;rows.push(payload);
  return {select:()=>({single:async()=>({data:{id:'snp-123',created_at:'2026-11-23T17:30:00Z'},error:null})})};
 }};
}};
const inputs={
 'sri-daily-team':{value:'t1'},'sri-daily-day':{value:'2026-11-23'},
 'sri-daily-result':{innerHTML:''},
};
const $=id=>inputs[id]||(inputs[id]={value:''});
const state={user:{id:'mgr'},profile:{role:'manager'},teams:[{id:'t1',name:'Equipe'}],
 snapshotId:null,revision:0,localDataUnsaved:true,fileStaged:false,pendingSnapshot:null};
const ctx={
 auth:async()=>client,ctx:state,$,inferredShift:()=> 'Manhã',
 publishingContextValid:()=>true,
 resultPayload:()=>({schema:1,reference:20000,importedAt:'2026-11-23T17:30:00Z',source:[{id:'1234567',status:'12'}]}),
 summarize:()=>({protocolos_consolidados:1,protocolos_monitorados:1}),
 warningSummary:()=>({divergencias_informativas:0}),
 hash:async()=> 'a'.repeat(64),v42Compress:async()=> 'gzip-consolidated-only',
 status:(m,t)=>statusLog.push({m,t}),
 saveDistribution:async()=>{if(failDist)throw Error('Conectividade temporariamente indisponível');},
 markSharedDigest:()=>{},clearSharedNotice:()=>{},esc:s=>s,
 loadSnapshot:async()=>{throw Error('Não deve carregar snapshot em inserção nova');},
 console
};
vm.runInNewContext(code+'\n;globalThis.publish=saveResult;',ctx);
await assert.rejects(ctx.publish(),/Conectividade temporariamente indisponível/);
assert.equal(inserts,1,'Tentativa inicial insere um snapshot consolidado');
assert.equal(state.localDataUnsaved,true,'Falha deixa apuração pendente');
assert.equal(state.pendingSnapshot?.id,'snp-123','Guardar ID para reenvio idempotente');
failDist=false;
await ctx.publish();
assert.equal(inserts,1,'Reenvio não deve inserir novamente o mesmo snapshot');
assert.equal(state.localDataUnsaved,false);
assert.equal(state.pendingSnapshot,null);
assert.equal(rows[0].payload_gzip,'gzip-consolidated-only');
assert.equal(Object.prototype.hasOwnProperty.call(rows[0],'sacCsv'),false);
assert.equal(Object.prototype.hasOwnProperty.call(rows[0],'ativoCsv'),false);
assert.equal(statusLog.at(-1).t,'success');
console.log('PASS: operação/turno sem confirmação, publicação consolidada e reenvio idempotente em falhas de distribuição.');
