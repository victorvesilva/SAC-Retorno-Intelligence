import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const loader=html.slice(html.indexOf('  async function loadTasks(){',html.indexOf('<script id="sri-operator-cloud-stage33">')),html.indexOf('  const packLevel=',html.indexOf('<script id="sri-operator-cloud-stage33">')));
const active=Array.from({length:4201},(_,index)=>({
 id:String(index+1).padStart(8,'0'),protocol_number:String(10000000+index),
 work_status:'pending',treatment_status:null,team_id:'A'
}));
let requests=0,archivedRequests=0;
const client={
 from(){
  let cursor='';
  const query={
   select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
   gt(key,value){assert.equal(key,'id');cursor=value;return this;},
   then(resolve,reject){
    requests++;
    return Promise.resolve({data:active.filter(row=>row.id>cursor).slice(0,200)}).then(resolve,reject);
   }
  };
  return query;
 },
 async rpc(name,args){
  assert.equal(name,'sri_my_daily_processed');archivedRequests++;
  return {data:args.p_before?[]:[{id:'completed',protocol_number:'99999999',work_status:'completed_in_tool'}]};
 }
};
const context={
 client,DIST_STATUS_DEFS:[['ACEITOU','',3],['OUTROS','',3]],window:{sriOperationalContext:()=>({day:'2026-11-25'})},
 document:{querySelectorAll:()=>[]},$(){return {textContent:''};},
 session:async()=>({client,profile:{role:'operator'},user:{id:'operator'}}),
 packRank:()=>0,packDueDate:()=>0,packDue:()=>0,renderPackTasks(){},restoreP03Preferences(){},stateMsg(){},loadHistory:async()=>{},
};
const harness=vm.runInNewContext(`
 let operatorEpoch=0,operatorLoadSeq=0,taskRows=[],p03PreferenceScope='';
 ${loader}
 ({loadTasks,rows:()=>taskRows})
`,context);
await harness.loadTasks();
assert.equal(requests,22,'consulta deve ultrapassar o antigo limite de vinte páginas');
assert.equal(archivedRequests,1);
assert.equal(harness.rows().length,4202);
assert.equal(harness.rows().at(-1).p03Readonly,true);
assert.equal(new Set(harness.rows().map(row=>row.protocol_number)).size,4202);
console.log('PASS: carteira com 4.201 ativos e um concluído carregada integralmente, com cursor estável e preservação do concluído.');
