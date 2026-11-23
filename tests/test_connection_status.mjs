import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../assets/sri-connection-status.js',import.meta.url),'utf8');

assert.match(html,/id="sri-connection-chip" data-connection="checking"/);
assert.match(html,/id="connection-text" role="status" aria-live="polite">Verificando\.\.\./);
assert.match(html,/src="\/assets\/sri-connection-status\.js\?v=20261123"/);
assert.match(html,/window\.sriGetCloudSyncState=\(\)=>\(\{/);
assert.match(html,/pending:Boolean\(hasLocalChanges\(\)\)/);
assert.match(html,/new CustomEvent\('sri-cloud-saved'/);
assert.match(html,/#sri-connection-chip\[data-connection="online"\]/);
assert.doesNotMatch(html,/getElementById\('connection-text'\)\.textContent='(?:Local|Importado)'/);
assert.doesNotMatch(source,/document\.getElementById\('update-clock'\)\s*\.textContent/,'Conexão não pode mudar o horário de importação');
assert.match(source,/client\.from\('profiles'\)\.select\('id'\)\.eq\('id',userId\)\.maybeSingle\(\)/);
assert.match(source,/new Promise\(resolve=>setTimeout\(\(\)=>resolve\(\{timeout:true\}\),12000\)\)/);

let startup=null,renderTick=null,connectionEvents={};
let loaded=0;
let connected=true;
let actualSave=null;
const flags={busy:false,pending:false,lastSaveAt:null};
const chip={dataset:{},title:'',setAttribute(k,v){this[k]=v}};
const label={textContent:'Verificando...'};
const document={
 readyState:'loading',hidden:false,body:{classList:{}},
 getElementById:id=>id==='sri-connection-chip'?chip:id==='connection-text'?label:null,
 addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')startup=fn},
};
const window={
 sriGetCloudSyncState:()=>flags,
 sriGetSupabaseClient:async()=>({
   auth:{getSession:async()=>({data:{session:{user:{id:'userid'}}},error:null})},
   from(table){
     assert.equal(table,'profiles');
     return {
       select(column){assert.equal(column,'id');return this},
       eq(column,value){assert.equal(column,'id');assert.equal(value,'userid');return this},
       async maybeSingle(){loaded++;return connected?{data:{id:'userid'},error:null}:{data:null,error:{message:'Falha na conexão'}}}
     };
   }
 }),
 addEventListener:(event,fn)=>{connectionEvents[event]=fn}
};
const clock={window,document,navigator:{onLine:true},MutationObserver:class{observe(){}},
  setInterval:(fn,interval)=>{if(interval===1300)renderTick=fn;return interval;},
  setTimeout:()=>0,console,Date,Intl};
vm.runInNewContext(source,clock);
assert.equal(typeof startup,'function');
assert.equal(window.sriResolveConnectionDisplay({remote:'ready',online:true,busy:false,pending:false}).label,'Online');
assert.equal(window.sriResolveConnectionDisplay({remote:'ready',online:true,busy:false,pending:true}).label,'Pendente');
assert.equal(window.sriResolveConnectionDisplay({remote:'ready',online:true,busy:true,pending:true}).label,'Sincronizando');
assert.equal(window.sriResolveConnectionDisplay({remote:'ready',online:false,busy:true,pending:true}).label,'Sem conexão');
assert.equal(window.sriResolveConnectionDisplay({remote:'session',online:true,busy:false,pending:false}).label,'Sessão necessária');
assert.equal(window.sriResolveConnectionDisplay({remote:'checking',online:true,busy:false,pending:false}).label,'Verificando...');

startup();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(loaded,1,'Indicador precisa fazer uma consulta remota real');
assert.equal(label.textContent,'Online','Sem CSV importado, Supabase saudável deve indicar online');
assert.equal(chip.dataset.connection,'online');
assert.match(chip.title,/Última verificação/);
flags.pending=true;renderTick();assert.equal(label.textContent,'Pendente');
flags.busy=true;renderTick();assert.equal(label.textContent,'Sincronizando');
flags.busy=false;flags.pending=false;renderTick();assert.equal(label.textContent,'Online');
assert.equal(typeof connectionEvents.offline,'function');
clock.navigator.onLine=false;connectionEvents.offline();assert.equal(label.textContent,'Sem conexão');
clock.navigator.onLine=true;connected=false;
connectionEvents.online();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(label.textContent,'Sem conexão','Falha em consulta autenticada não pode indicar online');
connected=true;
connectionEvents.focus();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(label.textContent,'Online','Após recuperar Supabase o indicador deve voltar ao normal');
actualSave=new Date('2026-11-23T19:01:00.000Z').toISOString();
flags.lastSaveAt=actualSave;
renderTick();
assert.match(chip.title,/Última gravação confirmada/);
console.log('PASS: Supabase real, sem CSV, pendências, sincronização, falha e recuperação, hora da última gravação.');
