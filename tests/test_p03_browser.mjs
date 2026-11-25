import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const source=readFileSync(new URL('assets/sri-pacote03.js',root),'utf8');
const from=html.indexOf('    root.insertAdjacentHTML(\'beforeend\',`\n      <section class="v20-panel" id="sri33-mine"');
assert.ok(from>0);
const start=html.indexOf('`',from)+1,end=html.indexOf('</section>`);',start)+10;
const markup=html.slice(start,end);
const filters=html.slice(html.indexOf('  function p03QuickMatch'),html.indexOf('  let historySessionRequest=0;'));
const harness=`
const $=id=>document.getElementById(id),h=value=>String(value??''),TREATMENT_STATUSES=['PENDENTE','FILIAL'];
let p03Page=0,p03Quick='',p03History=[],p03HistoryCursor=null;
const packLevel=row=>row.criticality||'Baixo',packDate=row=>row.due_date||'';
const packDue=()=>0,packRank=()=>0,packDueDate=()=>0;
let taskRows=[
 {id:'a',protocol_number:'101',treatment_status:'PENDENTE',base_name:'Base A',area_name:'Área A'},
 {id:'b',protocol_number:'102',treatment_status:'FILIAL',base_name:'Base A',area_name:'Área B'},
 {id:'c',protocol_number:'103',treatment_status:'ACEITOU',base_name:'Base B',area_name:'Área B'}
];
document.getElementById('operator').innerHTML=`${markup}`;
${filters}
setupP03Preferences();renderPackTasks();
p03PreferenceScope='synthetic-user/team-a';
const multi=document.querySelector('[data-p03-field="treatment_status"]');
for(const option of multi.options)option.selected=['PENDENTE','FILIAL'].includes(option.value);
renderPackTasks();
if(document.querySelectorAll('#sri33-task-table tbody tr').length!==2)throw Error('Filtro múltiplo perdeu registros');
$('sri-p03-column-1').click();
$('sri-pack-carteira').dispatchEvent(new Event('change',{bubbles:true}));
if(!document.querySelector('#sri33-task-table thead tr').children[1].hidden)throw Error('Coluna não ocultada');
$('sri-p03-favorite-name').value='Pendências';
$('sri-p03-favorite-save').click();
for(const option of multi.options)option.selected=false;
renderPackTasks();
$('sri-p03-favorites').value='Pendências';$('sri-p03-favorite-apply').click();
if(document.querySelectorAll('#sri33-task-table tbody tr').length!==2)throw Error('Favorito não restaurou o recorte');
p03PreferenceScope='other-user/team-a';restoreP03Preferences();
if($('sri-p03-favorites').options.length!==1)throw Error('Favorito de outra conta exposto');
document.body.dataset.filters='PASS';
`;
const probe=`
window.onerror=message=>{document.body.dataset.error=message;};
const button=()=>[...document.querySelectorAll('#sri-p03-go-history button')].find(el=>el.textContent==='Consultar data');
setTimeout(()=>{
 const day=document.querySelector('#sri-p03-go-history input[type=date]');
 if(!day||!button())throw Error('Consulta histórica ausente');
 day.value='2026-11-23';button().click();
 setTimeout(()=>{
  const region=document.getElementById('sri-p03-go-history');
  if(!region.textContent.includes('P23'))throw Error('Snapshot de 23/11 ausente');
  const operator=[...region.querySelectorAll('label')].find(el=>el.firstChild.textContent==='Operador').querySelector('input');
  operator.value='inexistente';operator.dispatchEvent(new Event('input'));
  if(region.querySelectorAll('tbody tr').length!==0)throw Error('Filtro do histórico não aplicado');
  if(![...region.querySelectorAll('button')].find(el=>el.textContent==='Exportar CSV da consulta').disabled)throw Error('Exportação vazia ativa');
  day.value='2026-11-22';button().click();
  setTimeout(()=>{
   if(region.textContent.includes('P23'))throw Error('Data vazia manteve estado anterior');
   if(!region.textContent.includes('Não há histórico armazenado para esta data'))throw Error('Mensagem histórica ausente');
   document.body.dataset.history='PASS';
  },30);
 },30);
},50);
`;
const mock=`
window.sriGetSupabaseClient=async()=>({
 auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:()=>{}},
 from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'admin',role:'admin'}})})})}),
 rpc:async(name,args)=>{
  if(name==='sri_p03_history_snapshots')return {data:args.p_day==='2026-11-23'?[{id:'s23',operational_day:args.p_day,created_at:'2026-11-23T18:00Z'}]:[]};
  if(name==='sri_p03_history_tasks')return {data:[{protocol_number:'P23',operator_name:'Operador',team_name:'Equipe A'}]};
  return {data:[]};
 }
});
`;
const folder=mkdtempSync(join(tmpdir(),'sri-p03-browser-'));
const fixture=join(folder,'fixture.html');
writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><div id="overview"></div><div id="operator"></div><script>'+mock+harness+'</script><script>'+source+'</script><script>'+probe+'</script>');
const chromium=process.env.CHROME_BIN||['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(chromium);
const dom=execFileSync(chromium,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--virtual-time-budget=1500','--user-data-dir='+join(folder,'profile'),'--dump-dom','file://'+fixture],{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
assert.match(dom,/<body[^>]*data-filters="PASS"/);
assert.match(dom,/<body[^>]*data-history="PASS"/);
assert.doesNotMatch(dom,/<body[^>]*data-error=/);
console.log('PASS: Chromium executou filtros múltiplos, colunas, favoritos por conta e consulta histórica por data sem reaproveitar recorte vazio.');
