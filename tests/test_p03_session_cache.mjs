import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function sriLocalKey('),html.indexOf('let v2History='));
const stored=new Map([['protocols','legacy-records'],['history','legacy-history']]);
const window={};
const localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)};
const ctx=vm.createContext({window,localStorage});vm.runInContext(helpers,ctx);
const get=key=>vm.runInContext(`sriLocalGet(${JSON.stringify(key)})`,ctx);
assert.equal(get('protocols'),'legacy-records');
window.sriLocalIdentity={id:'A',role:'admin'};
assert.equal(get('protocols'),'legacy-records');
vm.runInContext("sriLocalSet('protocols','A-records')",ctx);
window.sriLocalIdentity={id:'B',role:'assistant'};
assert.equal(get('protocols'),null);
assert.equal(get('history'),null);
vm.runInContext("sriLocalSet('protocols','B-records')",ctx);
assert.equal(get('protocols'),'B-records');
window.sriLocalIdentity={id:'C',role:'operator'};
assert.equal(get('protocols'),null);
window.sriLocalIdentity={id:'A',role:'admin'};
assert.equal(get('protocols'),'A-records');
vm.runInContext("sriLocalDel('protocols')",ctx);
assert.equal(stored.get('protocols'),'legacy-records','cópia anterior intacta');
assert.equal(stored.get('sri_account_B_protocols'),'B-records','outra conta intacta');
window.sriLocalIdentity={id:'',role:''};
assert.equal(get('protocols'),null);
assert.throws(()=>vm.runInContext("sriLocalSet('protocols','invalid')",ctx),/Sessão não autenticada/);
// An older decompression response must never populate the next user's session.
let resolvePayload,applied=0;
Object.assign(ctx,{
 V42_CURRENT_KEY:'cache',v42RenderStats(){},v42SafeGet:()=> 'packed',v42SetStatus(){},
 v42Uncompress:()=>new Promise(resolve=>{resolvePayload=resolve;}),v42ApplyCurrent:()=>{applied++;},
 sriCivilDay:()=> '2026-11-25',resetLoadedData(){},console
});
vm.runInContext(html.slice(html.indexOf('async function v42RestoreSavedOnOpen()'),html.indexOf('function v42FullPayload()')),ctx);
window.sriLocalIdentity={id:'A',role:'admin'};
const pending=vm.runInContext('v42RestoreSavedOnOpen()',ctx);
window.sriLocalIdentity={id:'B',role:'supervisor'};
resolvePayload({source:[{id:'secret-A'}],importedAt:'2026-11-25T10:00Z'});
assert.equal(await pending,false);assert.equal(applied,0);
console.log('PASS: cache separado por conta, legado preservado, logout bloqueia acesso e resposta atrasada não repovoa outra sessão.');
