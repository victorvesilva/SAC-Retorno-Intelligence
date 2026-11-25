import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const calls=[],events=[];
let time=0;
const client={from(name){return {select(){return {range(){return this;},then(resolve,reject){return Promise.resolve({data:['private data'],error:name==='fail'?{message:'private error'}:null}).then(resolve,reject);}};}};},rpc(name,args){
 calls.push({name,args});
 if(name==='sri_p03_rpc_measure')return Promise.resolve({data:null});
 const request={
  range(from,to){this.bounds=[from,to];return this;},
  then(resolve,reject){
   time+=25;
   if(name==='throws')return Promise.reject(Error('synthetic')).then(resolve,reject);
   return Promise.resolve({data:[{id:1}],error:name==='fails'?{message:'sensitive text'}:name==='coded'?{code:'23505',message:'private record'}:null,status:409}).then(resolve,reject);
  }
 };
 return request;
}};
const window={sriGetSupabaseClient:async()=>client,sriMonitorEvent:(...args)=>events.push(args)};
vm.runInNewContext(readFileSync(new URL('../assets/sri-p03-rpc-monitor.js',import.meta.url),'utf8'),{
 window,performance:{now:()=>time}
});
const instrumented=await window.sriGetSupabaseClient();
const request=instrumented.rpc('query',{notes:'sensitive notes'});
assert.equal(request.range(10,19),request,'cadeia PostgREST preservada');
const response=await request;
assert.equal(response.data[0].id,1);
await instrumented.rpc('fails');
await assert.rejects(async()=>await instrumented.rpc('throws'),/synthetic/);
await Promise.resolve();
const measurements=calls.filter(call=>call.name==='sri_p03_rpc_measure');
assert.equal(measurements.length,3);
assert.deepEqual(measurements.map(call=>call.args.p_failed),[false,true,true]);
assert.ok(measurements.every(call=>call.args.p_duration===25));
assert.ok(measurements.every(call=>Object.keys(call.args).length===2));
assert.equal(JSON.stringify(measurements).includes('sensitive'),false);
assert.equal(events.length,2);
await window.sriGetSupabaseClient();
await instrumented.rpc('query');
assert.equal(calls.filter(call=>call.name==='sri_p03_rpc_measure').length,4,'instrumentação aplicada uma vez por cliente');
await instrumented.from('ok').select('*').range(0,10);
await instrumented.from('fail').select('*');
assert.equal(events.length,3);assert.deepEqual(events[2],['ERROR','REST_ERROR','Supabase']);
assert.equal(JSON.stringify(events).includes('private'),false);
await instrumented.rpc('coded',{private:'arguments'});
const coded=calls.find(call=>call.name==='sri_p03_monitor_error');
assert.equal(coded.args.p_error_code,'23505');assert.equal(coded.args.p_http_status,409);assert.equal(coded.args.p_rpc,true);
assert.equal(JSON.stringify(coded).includes('private'),false);
console.log('PASS: medições reais preservam encadeamento, propagam falhas e excluem argumentos e respostas dos registros.');
