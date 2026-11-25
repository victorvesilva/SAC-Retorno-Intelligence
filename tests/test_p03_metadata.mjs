import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('  async function publishTasks(snapshotId,revision)'),html.indexOf('  window.sriSyncOperatorTasks=publishTasks'));
const details={one:{base:'valor de outra tela',area:'outra área'},two:{},three:{}};
let published,message,kind;
const source=[
 {id:'one',bko:'',area:''},{id:'one',bko:'Base A',area:'Área A'},
 {id:'two',bko:'Base A',area:'Área B'},{id:'two',bko:'Base B',area:'Área B'}
];
const client={
 from(table){return {select(){return this;},eq(){return this;},async single(){
  return {data:table==='daily_result_snapshots'?{payload_gzip:'synthetic'}:{revision:1,state:{assignments:{one:{},two:{},three:{}}}}};
 }};},
 async rpc(name,args){assert.equal(name,'publish_general_operator_tasks');published=args;return {data:{published:3,unlinked:0}};}
};
const context={
 window:{sriGetDistributionDetails:()=>details,sriMonitorEvent(){}},
 session:async()=>({client,profile:{role:'manager'}}),
 v42Uncompress:async()=>({source}),
 stateMsg(id,text,severity){message=text;kind=severity;}
};
const publish=vm.runInNewContext(code+';publishTasks',context);
await publish('snapshot',1);
assert.equal(published.p_details.one.base,'Base A');
assert.equal(published.p_details.one.area,'Área A','recupera metadados da fonte persistida');
assert.equal(published.p_details.two.base,null,'conflito não inventa uma Base');
assert.equal(published.p_details.two.area,'Área B');
assert.equal(published.p_details.three.base,null,'ausência real permanece explícita');
assert.equal(kind,'warning');
assert.match(message,/2 protocolo\(s\) com Base ou Área ausente ou conflitante/);
assert.equal(published.p_revision,1);
console.log('PASS: Base/Área vêm do snapshot publicado, recuperam valores comprovados e sinalizam conflitos e ausências sem perder protocolos.');
