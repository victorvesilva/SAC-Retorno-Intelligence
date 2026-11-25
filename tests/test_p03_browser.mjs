import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const source=readFileSync(new URL('assets/sri-pacote03.js',root),'utf8');
const from=html.indexOf('    root.insertAdjacentHTML(\'beforeend\',`\n      <section class="v20-panel" id="sri33-mine"');
assert.ok(from>0);
const start=html.indexOf('`',from)+1,end=html.indexOf('</section>`);',start)+10;
const markup=html.slice(start,end);
const filters=html.slice(html.indexOf('  function p03QuickMatch'),html.indexOf('  let historySessionRequest=0;'));
const renderedMarkup=vm.runInNewContext(String.fromCharCode(96)+markup+String.fromCharCode(96),{h:value=>String(value),TREATMENT_STATUSES:['PENDENTE','FILIAL']});
const stage=html.indexOf('<script id="sri-operator-cloud-stage33">');
const encode=html.slice(html.indexOf('  const h =',stage),html.indexOf('  const TREATMENT_STATUSES=',stage));
const historyRenderer=html.slice(html.indexOf('  function renderP03History()',stage),html.indexOf('  async function saveTreatment',stage));
const harness=`
const $=id=>document.getElementById(id),TREATMENT_STATUSES=['PENDENTE','FILIAL'];
${encode}
const DIST_STATUS_DEFS=[['ACEITOU','',3],['PENDENTE','',0]],DIST_STATUS_CHOICES=['ACEITOU','PENDENTE'];
let p03Page=0,p03Quick='',p03History=[],p03HistoryCursor=null;
const packLevel=row=>row.criticality||'Baixo',packDate=row=>row.due_date||'';
const packDue=()=>0,packRank=()=>0,packDueDate=()=>0;
let taskRows=[
 {id:'a',protocol_number:'101',treatment_status:'PENDENTE',base_name:'Base A',area_name:'Área A'},
 {id:'b',protocol_number:'102',treatment_status:'FILIAL',base_name:'Base A',area_name:'Área B'},
 {id:'c',protocol_number:'103',treatment_status:'ACEITOU',base_name:'Base B',area_name:'Área B'}
];
document.getElementById('operator').innerHTML=${JSON.stringify(renderedMarkup)};
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
${historyRenderer}
p03History=[
 {id:'1',protocol_number:'501',action:'ACEITOU',created_at:'2026-11-23T12:00Z',notes:'<img src=x onerror=alert(1)>'},
 {id:'2',protocol_number:'501',action:'PENDENTE',created_at:'2026-11-23T11:00Z'},
 {id:'3',protocol_number:'502',action:'PENDENTE',created_at:'2026-11-23T10:00Z'}
];
renderP03History();
if(document.querySelectorAll('#sri33-history details').length!==2)throw Error('Histórico não agrupou por protocolo');
if(document.querySelectorAll('#sri33-history article').length!==3)throw Error('Histórico perdeu eventos individuais');
if(document.querySelector('#sri33-history img'))throw Error('Notas históricas não foram escapadas');
if(!$('sri-p03-history-count').textContent.includes('2 protocolos distintos'))throw Error('Indicador duplicou protocolos');
$('sri-p03-history-mode').value='log';renderP03History();
if(document.querySelectorAll('#sri33-history .sri-p03-history-card').length!==3)throw Error('Log não preservou os eventos');
document.body.dataset.treatments='PASS';

`;
const probe=`
window.onerror=message=>{document.body.dataset.error=message;};
const button=()=>[...document.querySelectorAll('#sri-p03-go-history button')].find(el=>el.textContent==='Consultar data');
setTimeout(()=>{
 let printed=null;
 window.open=()=>({
  document:(()=>{const doc=document.implementation.createHTMLDocument('');Object.defineProperty(doc,'fonts',{value:{ready:Promise.resolve()}});return doc;})(),closed:false,opener:null,
  close(){this.closed=true;},focus(){},print(){printed=this.document;document.body.dataset.graph='PASS';}
 });
 const chart=document.querySelector('.sri-p03-chart-export');
 if(!chart)throw Error('Exportação individual ausente');
 chart.click();
 if(!document.querySelector('.sri-p03-chart-nav')?.textContent.includes('Riscos Operacionais'))throw Error('Categorias de gráficos ausentes');
 const reopen=document.getElementById('sri-p03-reopen');
 if(!reopen)throw Error('Reabertura administrativa ausente');
 reopen.querySelector('input').value='500';
 [...reopen.querySelectorAll('button')].find(button=>button.textContent==='Consultar protocolo').click();
 setTimeout(()=>{
  const save=[...reopen.querySelectorAll('button')].find(button=>button.textContent==='Reabrir para tratativa');
  save.click();
  if(window.reopenRequests.length)throw Error('Reabertura sem justificativa foi enviada');
  const reason=reopen.querySelector('textarea');reason.value='Encerramento feito por engano';reason.dispatchEvent(new Event('input',{bubbles:true}));
  save.click();
  setTimeout(()=>{
   if(window.reopenRequests.length!==1||window.reopenRequests[0].p_reason!=='Encerramento feito por engano')throw Error('Justificativa de reabertura perdida');
   if(!reopen.textContent.includes('justificativa foi registrada'))throw Error('Resultado de reabertura ausente');
   document.body.dataset.reopen='PASS';
  },40);
 },40);
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
   const monitor=document.getElementById('sri-monitor-panel');
   if(!monitor)throw Error('Console ausente');
   [...monitor.querySelectorAll('button')].find(el=>el.textContent==='Consultar').click();
   setTimeout(()=>{
    if(!monitor.textContent.includes('P95 40 ms'))throw Error('Medições reais não exibidas');
    if(!window.notifications.some(item=>item.kind==='error'))throw Error('Falha crítica sem notificação');
    const details=monitor.querySelector('tbody details');details.open=true;
    setTimeout(()=>{
     if(!details.textContent.includes('07:01'))throw Error('Ocorrências individuais ausentes');
     const actor=[...monitor.querySelectorAll('label')].find(el=>el.firstChild.textContent==='Responsável').querySelector('input');
     actor.value='outro';actor.dispatchEvent(new Event('input'));
     if(monitor.querySelectorAll('tbody tr').length)throw Error('Filtro por responsável ignorado');
     document.body.dataset.monitor='PASS';
    },40);
   },40);

  },30);
 },30);
},50);
`;
const mock=`
window.reopenRequests=[];window.notifications=[];window.sriPackNotify=(message,kind)=>window.notifications.push({message,kind});
window.sriGetSupabaseClient=async()=>({
 auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:()=>{}},
 from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'admin',role:'admin'}})})})}),
 rpc:async(name,args)=>{
  if(name==='sri_p03_history_snapshots')return {data:args.p_day==='2026-11-23'?[{id:'s23',operational_day:args.p_day,created_at:'2026-11-23T18:00Z'}]:[]};
  if(name==='sri_p03_history_tasks')return {data:[{protocol_number:'P23',operator_name:'Operador',team_name:'Equipe A'}]};
  if(name==='sri_p03_reopen_candidate')return {data:{id:'closed-task',protocol_number:args.p_protocol,operator_name:'Operador sintético',operational_day:'2026-11-25',treatment_status:'OUTROS',work_status:'completed_in_tool',updated_at:'2026-11-25T10:00Z',can_reopen:true}};
  if(name==='sri_p03_reopen_task'){window.reopenRequests.push(args);return {data:{id:args.p_task,work_status:'pending'}};}
  if(name==='sri_monitor_read')return {data:[{id:'100',severity:'FATAL',module:'Supabase',code:'RPC_ERROR',responsavel:'Operador sintético',version:'pacote03-20261124',occurred_at:'2026-11-25T10:00Z',occurrences:2}]};
  if(name==='sri_p03_rpc_metrics')return {data:{calls:2,errors:1,average_ms:30,p95_ms:40,maximum_ms:40}};
  if(name==='sri_p03_monitor_occurrences')return {data:[{id:'1',event_id:'100',occurred_at:'2026-11-25T10:00Z'},{id:'2',event_id:'100',occurred_at:'2026-11-25T10:01Z'}]};
  return {data:[]};
 }
});
`;
const folder=mkdtempSync(join(tmpdir(),'sri-p03-browser-'));
const fixture=join(folder,'fixture.html');
writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><div id="overview"></div><div id="operator"></div><div id="v20-settings"></div><div id="v20-pending"></div><section id="agents"><div class="card"><h3>Gráfico sintético</h3><div id="chart-areas"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="5" y="20">10</text></svg></div></div></section><script>'+mock+harness+'</script><script>'+source+'</script><script>'+probe+'</script>');
const chromium=process.env.CHROME_BIN||['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(chromium);
const dom=execFileSync(chromium,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--virtual-time-budget=1500','--user-data-dir='+join(folder,'profile'),'--dump-dom','file://'+fixture],{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
assert.match(dom,/<body[^>]*data-filters="PASS"/);
assert.match(dom,/<body[^>]*data-history="PASS"/);
assert.match(dom,/<body[^>]*data-monitor="PASS"/);
assert.match(dom,/<body[^>]*data-treatments="PASS"/);
assert.match(dom,/<body[^>]*data-graph="PASS"/);
assert.match(dom,/<body[^>]*data-reopen="PASS"/);
assert.doesNotMatch(dom,/<body[^>]*data-error=/);
console.log('PASS: Chromium executou filtros múltiplos, colunas, favoritos por conta e consulta histórica por data sem reaproveitar recorte vazio.');
