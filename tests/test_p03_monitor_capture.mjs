import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const writes=[],listeners=new Map(),ready=[];
const client={auth:{getUser:async()=>({data:{user:{id:'operator'}}}),onAuthStateChange(){}},
 from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:'operator',role:'operator'}})}),
 rpc:async(name,args)=>{writes.push({name,args});return {data:[]};}};
const window={addEventListener:(name,fn)=>listeners.set(name,fn),sriGetSupabaseClient:async()=>client};
const document={readyState:'loading',getElementById:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')ready.push(fn);}};
vm.runInNewContext(readFileSync(new URL('../assets/sri-pacote03.js',import.meta.url),'utf8'),{window,document,setTimeout:fn=>fn(),setInterval(){},clearTimeout(){},Date,console});
await ready[0]();
listeners.get('error')({message:'private message https://secret.invalid?token=private'});
listeners.get('unhandledrejection')({reason:Error('private payload')});
await Promise.resolve();
assert.ok(writes.some(row=>row.args.p_code==='JS_ERROR'));
assert.ok(writes.some(row=>row.args.p_code==='PROMISE_ERROR'));
assert.ok(writes.every(row=>row.args.p_version==='pacote03-20261124'));
assert.equal(JSON.stringify(writes).includes('private'),false);
console.log('PASS: erros JavaScript e promessas são capturados automaticamente com versão e códigos permitidos, sem mensagem, URL ou conteúdo sensível.');
