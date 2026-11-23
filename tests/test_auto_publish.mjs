import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function mustContain(s){assert.ok(html.includes(s),'Ponto ausente: '+s);}
mustContain('window.sriCanAutoPublish&&!window.sriCanAutoPublish()');
mustContain('postLoad();setTimeout(()=>window.sriShareProcessedResult?.(),0)');
mustContain("window.sriShareProcessedResult=()=>{");
mustContain("void safe(saveResult)");
mustContain('id="sri-daily-shift" type="hidden"');
mustContain('sriOperationalContext=operationalContext');
mustContain("Reenviar apuração pendente");
mustContain('id="sri-import-context"');
mustContain('id="sri-daily-panel" hidden style="display:none"');
mustContain("team_id:team,operational_day:day,shift_label:shift");
mustContain("const team=null,{day,shift}=syncShift()");
mustContain("ctx.pendingSnapshot={key,id:snapshotId}");
mustContain("throw Error('Distribuição salva, mas a carteira dos operadores NÃO foi sincronizada: '");
assert.doesNotMatch(html,/<label class="v20-field">Operação<select/,'Não solicitar operação na importação');
assert.doesNotMatch(html,/<label class="v20-field">Equipe<select/,'Não solicitar equipe na importação');
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
 'sri-daily-day':{value:'2026-11-23'},
 'sri-daily-result':{innerHTML:'',textContent:''},
};
const $=id=>inputs[id]||(inputs[id]={value:''});
const state={user:{id:'mgr'},profile:{role:'manager'},teams:[{id:'t1',name:'Equipe'}],
 snapshotId:null,revision:0,localDataUnsaved:true,fileStaged:false,pendingSnapshot:null};
const ctx={
 auth:async()=>client,ctx:state,$,syncShift:()=>({day:'2026-11-23',shift:'Manhã'}),carryForwardDistribution:async()=>{},
 publishingContextValid:()=>true,
 resultPayload:()=>({schema:1,reference:20000,importedAt:'2026-11-23T17:30:00Z',source:[{id:'1234567',status:'12'}]}),
 summarize:()=>({protocolos_consolidados:1,protocolos_monitorados:1}),
 warningSummary:()=>({divergencias_informativas:0}),
 hash:async()=> 'a'.repeat(64),v42Compress:async()=> 'gzip-consolidated-only',
 status:(m,t)=>statusLog.push({m,t}),
 saveDistribution:async()=>{if(failDist)throw Error('Conectividade temporariamente indisponível');},
 markSharedDigest:()=>{},clearSharedNotice:()=>{},renderImportContext:()=>{},esc:s=>s,localStorage:{setItem:()=>{}},
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
assert.equal(rows[0].team_id,null,'Importação precisa ser geral, sem equipe');
assert.equal(Object.prototype.hasOwnProperty.call(rows[0],'sacCsv'),false);
assert.equal(Object.prototype.hasOwnProperty.call(rows[0],'ativoCsv'),false);
assert.equal(statusLog.at(-1).t,'success');
console.log('PASS: importação geral sem equipe, turno automático e reenvio idempotente.');
