import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startChromium} from './helpers/chromium_cdp.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('index.html');
const slice=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
const panel=slice('  function operatorPanel(){','  async function safeMine(fn)');
const functions=slice('  function p03QuickMatch','  let historySessionRequest=0;');
const save=slice('  async function saveTreatment(){','  // Ao publicar uma nova distribuição');
const safe=slice('  async function safeMine(fn)','  async function loadTasks(){');
const statuses=slice('const DIST_STATUS_DEFS=','const DIST_STATUS_CHOICES=');
const css=read('assets/sri-layout-clarity.css')+read('assets/sri-integrated-improvements.css')+
 html.match(/<style>(body\.sri33-operator-cloud[\s\S]*?)<\/style>/)[1];
const setup=`
const $=id=>document.getElementById(id),h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
${statuses}
const TREATMENT_STATUSES=DIST_STATUS_DEFS.map(([name])=>name),label=value=>value,sriTreatmentReference=()=>'',stateMsg=()=>{};
let taskRows=[
 {id:'one',protocol_number:'101',base_name:'Base A',area_name:'Área A',criticality:'Baixo',due_situation:'VENCE HOJE',sla_band:'D7',channel:'WHATSSAC',shift_label:'Manhã',updated_at:'v1',work_status:'pending'},
 {id:'two',protocol_number:'102',base_name:'Base B',area_name:'Área B',criticality:'Crítico',due_situation:'BACKLOG',sla_band:'D6',channel:'SAC RETORNO',shift_label:'Tarde',updated_at:'v1',work_status:'pending'}
],currentTask=null,inProgress=false,closeTreatment,openTreatment,savePending=null,operatorEpoch=0,operatorLoadSeq=0,operatorFingerprint='';
let p03Page=0,p03Quick='',p03History=[],p03HistoryCursor=null;
const packLevel=row=>row.criticality||'Baixo',packDate=()=>'',packDueDate=()=>0,packRank=()=>0,packDue=()=>0;
const logged={profile:{full_name:'Operador sintético'}};
let authRole='operator',authId='operator';
window.sriGetSavedDistributionContext=()=>({snapshotId:'snapshot'});
window.sriOperationalContext=()=>({day:'2026-11-27'});
window.calls=[];window.uiErrors=[];
window.addEventListener('error',event=>window.uiErrors.push(event.message));
const client={
 auth:{getUser:async()=>({data:{user:{id:authId}}})},
 from:table=>{
  const chain={select(){return chain;},eq(){return chain;},order(){return chain;},
   single:async()=>({data:{role:authRole}}),range:async()=>({data:taskRows.map(row=>({...row}))})};
  return chain;
 },
 rpc:async(name,args)=>{
  window.calls.push({name,args});
  if(name==='sri_record_treatment_v3'){
   if(window.failSave){window.failSave=false;return {error:{message:'Falha de rede'}};}
   const row=taskRows.find(row=>row.id===args.p_task);
   const data={treatment_status:args.p_action,work_status:'awaiting',is_special:args.p_special,updated_at:'v'+window.calls.length};
   Object.assign(row,data,{notes:args.p_notes});return {data};
  }
  if(name==='sri_protocol_treatment_details'){
   if(window.pauseDetails)await new Promise(resolve=>window.releaseDetails=resolve);
   const row=taskRows.find(row=>row.id===args.p_task);
   return {data:{protocol_number:row.protocol_number,is_special:row.is_special,notes:row.notes,recorded_at:'2026-11-27T12:00Z',actor_name:'Operador sintético'}};
  }
  return {data:[]};
 }
};
window.sriGetSupabaseClient=async()=>client;
const session=async()=>({client,profile:{role:'operator',full_name:'Operador sintético'},user:{id:'operator'}});
const loadTasks=async()=>renderPackTasks(),refreshHistory=()=>{},loadHistory=async()=>{};
${functions}
${safe}
${save}
${panel}
operatorPanel();renderPackTasks();
window.fixture={rows:()=>taskRows,render:renderPackTasks,management:()=>{authRole='admin';authId='manager';},actor:()=>{authRole='operator';authId='operator';}};
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sri-operator-special-')),file=path.join(dir,'fixture.html');
fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>'+css+'</style><body class="sri33-operator-cloud" data-sri-operator-view="active"><main class="v5-app" style="padding:16px"><section id="v20-mine" class="tab-content active"><div class="v20-between"><h2>Minha Carteira</h2></div></section><section id="distribution"><div id="dist-pane-protocols"></div><div id="details-cell"></div></section></main><script>'+setup+'</script><script>'+read('assets/sri-layout-clarity.js')+'</script><script>'+read('assets/sri-cloud-treatments.js')+'</script>');
const browser=await startChromium(process.env.CHROME_BIN||'/usr/bin/chromium',path.join(dir,'profile'));
try{
 for(const width of [1366,768,390]){
  const page=await browser.page('file://'+file,width,1000),run=expression=>page.evaluate(expression);
  await page.waitFor("document.getElementById('sri-wallet-more-button')");
  assert.equal(await run("document.querySelectorAll('.sri-clarity-basic > label').length"),3,'Somente busca, prazo e tratativa');
  assert.equal(await run("document.getElementById('sri-p03-advanced').open"),false);
  assert.equal(await run("getComputedStyle(document.getElementById('sri-pack-clear')).display"),'none','Limpar aparece quando há filtros');
  await run("document.getElementById('sri-pack-due').value='today';document.getElementById('sri-pack-due').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await run("document.querySelectorAll('#sri33-task-table tbody tr').length"),1);
  await run("document.getElementById('sri-wallet-more-button').click()");
  await page.waitFor("document.getElementById('sri-p03-advanced').open");
  await run("document.getElementById('sri-pack-base').value='Base A';document.getElementById('sri-pack-base').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await run("document.getElementById('sri-wallet-more-button').textContent"),'Mais filtros (1)');
  assert.equal(await run("getComputedStyle(document.querySelector('[data-p03-field=channel]').closest('label')).display"),'none','Lista nativa substituída por seleção compacta');
  await run("document.querySelector('#sri-p03-advanced .sri-wallet-choice summary').click()");
  assert.equal(await run("document.querySelectorAll('.sri-wallet-choice-options input[type=checkbox]').length>0"),true);
  await run("document.getElementById('sri-pack-clear').click()");
  assert.equal(await run("document.querySelectorAll('#sri33-task-table tbody tr').length"),2);
  await run("document.querySelector('[data-sri33-task=one]').click();document.querySelector('.sri-special-help').focus()");
  assert.equal(await run("getComputedStyle(document.getElementById('sri33-special-help')).display"),'block','Explicação acessível pelo teclado');
  assert.deepEqual(await run("[...document.querySelectorAll('.sri33-actions button')].map(button=>button.textContent)"),['Cancelar','Salvar tratativa']);
  await run("document.getElementById('sri33-treatment-special').checked=true;document.getElementById('sri33-treatment-special').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('sri33-treatment-kind').value='PENDENTE';document.getElementById('sri33-treatment-kind').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('sri33-treatment-notes').value='<img src=x onerror=alert(1)> Observação sensível';window.failSave=true;document.getElementById('sri33-treatment-save').click()");
  await page.waitFor("document.getElementById('sri33-treatment-status').textContent.includes('salvamento')");
  const first=await run("window.calls.find(call=>call.name==='sri_record_treatment_v3').args.p_request");
  assert.equal(await run("document.getElementById('sri33-treatment-special').checked"),true,'Falha mantém a escolha');
  await run("document.getElementById('sri33-treatment-save').click()");
  await page.waitFor("document.getElementById('sri33-treatment').hidden");
  assert.equal(await run("window.calls.filter(call=>call.name==='sri_record_treatment_v3').at(-1).args.p_request"),first,'Retry reaproveita a solicitação');
  assert.equal(await run("window.fixture.rows()[0].is_special"),true);
  assert.equal(await run("window.fixture.rows()[0].criticality"),'Baixo','Marcação mantém a criticidade');
  await run("document.querySelector('[data-sri33-task=one]').click()");
  assert.equal(await run("document.getElementById('sri33-treatment-special').checked"),true,'Marcação preservada ao reabrir o modal');
  await run("document.getElementById('sri33-treatment-cancel').click();window.fixture.management();window.sriCloudTreatmentInit()");
  await page.waitFor("window.sriCloudTreatment('101')");
  await run("document.getElementById('details-cell').innerHTML=window.sriTreatmentDetailsCell('101');document.querySelector('[data-sri-treatment-details]').click()");
  await page.waitFor("document.querySelector('.sri-treatment-note')");
  assert.match(await run("document.querySelector('.sri-treatment-details-content').textContent"),/caso sensível.*Operador sintético.*Observação sensível/s);
  assert.equal(await run("document.querySelector('#sri-treatment-details img')===null"),true,'Observação exibida como texto');
  assert.equal(await run("document.getElementById('sri-treatment-details').getBoundingClientRect().width<=innerWidth"),true);
  await run("Object.assign(window.fixture.rows()[0],{notes:'Observação atualizada pelo operador',is_special:false,updated_at:'new-version'});document.getElementById('sri-cloud-treatment-refresh').click()");
  await page.waitFor("document.querySelector('.sri-treatment-note').textContent==='Observação atualizada pelo operador'");
  assert.match(await run("document.querySelector('.sri-treatment-details-content').textContent"),/Sinalização especial desmarcada/);
  assert.equal(await run("document.getElementById('sri-cloud-treatment-toolbar').getBoundingClientRect().right<=innerWidth"),true);
  await run("document.querySelector('#sri-treatment-details button').click();window.pauseDetails=true;document.querySelector('[data-sri-treatment-details]').click()");
  await page.waitFor('window.releaseDetails');
  await run("window.sriCloudTreatmentReset();window.releaseDetails()");
  assert.equal(await run("document.getElementById('sri-treatment-details')===null"),true,'Troca de sessão limpa a observação');
  assert.deepEqual(await run('window.uiErrors'),[]);
  await page.close();
  console.log('PASS filtros compactos, caso sensível, tooltip, salvamento com retry e consulta segura na Distribuição '+width+'px.');
 }
}finally{await browser.close();}
