import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const controls=new Map();
const input=(id,value='')=>{const el={id,value,tagName:'INPUT',type:'text',dataset:{},closest:()=>null};controls.set(id,el);return el;};
for(const [id,value] of Object.entries({
 'sri-pack-search':'','sri-pack-filter':'all','sri-pack-status-filter':'all','sri-pack-base':'','sri-pack-area':'',
 'sri-p03-state':'all','sri-p03-due-from':'','sri-p03-due-to':'','sri-p03-sort':'priority'
}))input(id,value);
input('sri-p03-preference-status');
const multi={id:'',value:'',multiple:true,dataset:{p03Field:'treatment_status'},options:[
 {value:'PENDENTE',selected:true},{value:'FILIAL',selected:true},{value:'ACEITOU',selected:false}
],closest:()=>null};
Object.defineProperty(multi,'selectedOptions',{get:()=>multi.options.filter(option=>option.selected)});
const storage=new Map();
const context={
 $:id=>controls.get(id),
 document:{querySelectorAll:query=>query==='[data-p03-field]'?[multi]:[...controls.values(),multi]},
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
};
const filterCode=html.slice(html.indexOf('  function p03QuickMatch'),html.indexOf('  function renderPackTasks'));
const preferenceCode=html.slice(html.indexOf("  let p03PreferenceScope=''"),html.indexOf('  let historySessionRequest=0;'));
const harness=vm.runInNewContext(`
 let p03Quick='',p03Page=0,taskRows=[];
 const packLevel=row=>row.criticality;
 function renderPackTasks(){}
 ${filterCode}
 ${preferenceCode}
 ({
  filtered:packFilteredRows,
  rows:value=>{taskRows=value;},
  scope:value=>{p03PreferenceScope=value;},
  capture:p03FilterState,apply:applyP03FilterState,
  write:writeP03Preferences,read:readP03Preferences
 })
`,context);
harness.rows([
 {protocol_number:'1',treatment_status:'PENDENTE',base_name:'A',area_name:'X'},
 {protocol_number:'2',treatment_status:'FILIAL',base_name:'A',area_name:'Y'},
 {protocol_number:'3',treatment_status:'ACEITOU',base_name:'A',area_name:'Y'},
 {protocol_number:'4',treatment_status:'PENDENTE',base_name:'B',area_name:'X'}
]);
const ids=()=>Array.from(harness.filtered(),row=>row.protocol_number);
assert.deepEqual(ids(),['1','2','4'],'seleção múltipla aceita qualquer status selecionado');
controls.get('sri-pack-base').value='A';
assert.deepEqual(ids(),['1','2'],'critérios de campos diferentes são combinados');
controls.get('sri-pack-area').value='Y';
assert.deepEqual(ids(),['2']);
harness.scope('operator-a/team-a');
harness.write({current:harness.capture()});
harness.scope('operator-b/team-a');
assert.equal(harness.read().current,undefined,'preferência isolada por operador');
harness.scope('operator-a/team-b');
assert.equal(harness.read().current,undefined,'preferência isolada por equipe');
harness.scope('operator-a/team-a');
const saved=harness.read().current;
controls.get('sri-pack-base').value='B';
multi.options.forEach(option=>option.selected=false);
harness.apply(saved);
assert.equal(controls.get('sri-pack-base').value,'A');
assert.deepEqual(multi.selectedOptions.map(option=>option.value),['PENDENTE','FILIAL']);
assert.deepEqual(ids(),['2'],'favorito restaura o mesmo recorte');
harness.apply({quick:'critical'});
assert.equal(controls.get('sri-pack-filter').value,'Crítico','favorito antigo usa o filtro visível de criticidade');
assert.equal(controls.get('sri-p03-state').value,'active');
assert.equal(harness.capture().quick,'','atalho removido não permanece oculto');
harness.apply({quick:'processed'});
assert.equal(controls.get('sri-p03-state').value,'processed','favorito antigo de finalizados usa a situação visível');
harness.apply({quick:'untreated'});
assert.equal(controls.get('sri-pack-status-filter').value,'pending');
assert.equal(controls.get('sri-p03-state').value,'active');
console.log('PASS: filtros múltiplos combinados, restauração de favoritos e isolamento por operador/equipe.');
