import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/sri-contingencia-boot.css',import.meta.url),'utf8');
assert.ok(html.includes('/assets/sri-contingencia-boot.css?v=1.0.0'),'Estilos de inicialização ausentes');
for(const id of ['sri-boot-modal','sri-boot-title','sri-boot-message','sri-boot-help','sri-boot-retry','sri-boot-continue','dist-import-status-file','dist-status-review','sri-contingency-full-backup','v42-backup-all','v42-restore-all','file-sac','file-ativo','process-btn']){
 assert.ok(html.includes('id="'+id+'"'),'Controle de contingência/inicialização ausente: '+id);
}
for(const label of ['#dist-pane-exports label[for="dist-import-status-file"]','#dist-pane-exports #dist-status-review:not([hidden])','#sri-boot-modal[hidden]']){
 assert.ok(css.includes(label),'Estilo de importação ou modal ausente: '+label);
}
assert.equal(css.split('{').length,css.split('}').length,'CSS deve manter chaves balanceadas');
assert.match(html,/switchTab\(opts\.tab\|\|ui\.tab\|\|'overview'\)/,'Restauração local não deve forçar página inicial');
assert.match(html,/v42ApplyCurrent\(payload,\{tab:ui\.tab\|\|'overview'\}\)/,'Recuperação do Supabase deve preservar tela escolhida');
assert.match(html,/sriBootRecovery\.beginCloud\(\)/,'Sincronização autenticada deve ser coberta pelo modal');
assert.match(html,/await sriBootRecovery\.waitForLocal\(\)/,'Sincronização na nuvem deve aguardar recuperação local antes de carregar dados');
assert.match(html,/finally\{sriBootRecovery\.endCloud\(\);\}/,'Modal deve ser liberado após sincronização da equipe');
assert.match(html,/window\.sriSnapshotAfterAuth=\(\)=>\{\s*if\(!ctx\.initialized\)makePanel\(\);\s*return safe/,'Sincronização com Supabase precisa ser aguardada');
assert.match(html,/const sriBootHasLocalCopy=!!v42SafeGet\(V42_CURRENT_KEY\)/,'Abertura do modal deve conferir a cópia local');
assert.match(html,/if\(sriBootHasLocalCopy\)sriBootRecovery\.beginLocal\(\)/,'Modal deve abrir antes da recuperação de cache');
assert.match(html,/baseReference:ui\.reference,baseProtocols:distState\.rows\.map\(r=>r\.id\)\.join\('\|'\)/,'Prévia XLSX deve congelar a base');
assert.match(html,/d\.baseAssignments!==JSON\.stringify\(distAssignments\)/,'Restauração XLSX deve rejeitar mudanças concorrentes');
assert.match(html,/d\.baseStatuses!==JSON\.stringify\(distStatuses\)/,'Status alterados durante a prévia devem bloquear importação');
assert.match(html,/d\.baseCriticities!==JSON\.stringify\(distCriticities\)/,'Criticidade alterada durante a prévia deve bloquear importação');
assert.match(html,/v48-allow-reassignment/,'Redistribuições devem exigir aprovação explícita');
assert.match(html,/d\.blockedIds\.size&&!confirm/,'Registros conflitantes não podem ser aplicados automaticamente');
assert.match(html,/sri-contingency-full-backup'\)\.addEventListener\('click',v42ExportFull\)/,'Backup completo deve usar exportador existente');
assert.match(html,/CONTINGENCIAMENTO — RESTAURAÇÃO SOMENTE LOCAL/,'Restauro JSON deve apresentar o impacto da substituição');
assert.match(html,/Publicação restrita à gestão\/supervisão/,'Permissões de publicação devem permanecer inalteradas');
assert.match(html,/id="file-sac"/);
assert.match(html,/id="file-ativo"/);
assert.match(html,/id="process-btn"/);

// Exercita o controlador em um DOM sintético, sem API/Supabase e sem dados pessoais.
const begin=html.indexOf('const sriBootRecovery=(()=>{');
const end=html.indexOf('\n\n/* SAC Retorno Intelligence 4.6',begin);
assert.ok(begin>0&&end>begin,'Controlador de inicialização não encontrado');
const block=html.slice(begin,end);
function environment({copy=false,restore=async()=>true}={}){
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{id,hidden:true,dataset:{},textContent:'',
    listeners:{},isConnected:true,focus(){},addEventListener(name,cb){this.listeners[name]=cb}});
  return nodes.get(id);
 };
 const dialog=node('sri-boot-modal'),app={inert:false};
 const doc={getElementById:node,querySelector:q=>q==='.app'?app:null,body:{style:{overflow:''}},activeElement:{isConnected:true,focus(){}}};
 const context={document:doc,console,setTimeout:()=>123,clearTimeout:()=>{},
   v42SafeGet:()=>copy?'gzip':'',V42_CURRENT_KEY:'sri_v42_latest_gzip_v1',
   v42RestoreSavedOnOpen:restore,requestAnimationFrame:()=>{}};
 vm.runInNewContext(block+'\n;globalThis.__boot=sriBootRecovery;',context,{timeout:2000});
 return {dialog,app,node,controller:context.__boot,doc};
}

{
 const x=environment();
 assert.equal(x.dialog.hidden,true,'Sem cache não deve aparecer o modal');
 x.controller.beginCloud();
 assert.equal(x.dialog.hidden,false,'Login deve bloquear navegação até sincronizar');
 assert.equal(x.app.inert,true,'Interface não pode ser usada durante sincronização');
 x.controller.endCloud();
 assert.equal(x.dialog.hidden,true);
 assert.equal(x.app.inert,false);
}
{
 const x=environment({copy:true});
 assert.equal(x.dialog.hidden,false,'Cache presente deve abrir o modal antes da restauração');
 x.controller.beginCloud();
 await x.controller.run();
 await x.controller.waitForLocal();
 assert.equal(x.dialog.hidden,false,'Cloud pendente não pode liberar navegação antes da hora');
 x.controller.endCloud();
 assert.equal(x.dialog.hidden,true,'Modal deve fechar após as duas sincronizações');
 assert.equal(x.app.inert,false);
}
{
 let attempts=0;
 const x=environment({copy:true,restore:async()=>++attempts>1});
 await x.controller.run();
 assert.equal(x.dialog.hidden,false,'Falha deve manter opções de recuperação');
 assert.equal(x.node('sri-boot-actions').hidden,false,'Falha deve permitir nova tentativa');
 await x.controller.run();
 assert.equal(x.dialog.hidden,true,'Nova tentativa bem-sucedida deve liberar a navegação');
 assert.equal(attempts,2);
}
console.log('PASS: contingência Excel/JSON segura, permissão do supervisor preservada e modal até atualização autenticada.');
