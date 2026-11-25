import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {startChromium} from './helpers/chromium_cdp.mjs';
const root=new URL('../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8'),html=read('index.html');
const at=html.indexOf("    root.insertAdjacentHTML('beforeend',`\n      <section class=\"v20-panel\" id=\"sri33-mine\"");
const start=html.indexOf('`',at)+1,end=html.indexOf('</section>`);',start)+10;
const markup=vm.runInNewContext('`'+html.slice(start,end)+'`',{h:String,TREATMENT_STATUSES:['PENDENTE','ACEITOU']});
const functions=html.slice(html.indexOf('  function p03QuickMatch'),html.indexOf('  let historySessionRequest=0;'));
const handlers=html.slice(html.indexOf("    $('sri33-mine-refresh').addEventListener"),html.indexOf('    let modalOpener=null;'));
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+['sri-integrated-improvements.css','revisao-visual-integrada.css','sri-layout-clarity.css'].map(f=>read('assets/'+f)).join('\n');
const harness=`
const $=id=>document.getElementById(id),h=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const TREATMENT_STATUSES=['PENDENTE','ACEITOU'];
let p03Quick='',p03Page=0,p03History=[],p03HistoryCursor=null,operatorEpoch=0,operatorLoadSeq=0,savePending=null,currentTask=null,operatorFingerprint='';
const packLevel=r=>r.criticality||'Baixo',packDate=r=>r.due_date||'',safeMine=fn=>fn(),loadTasks=()=>{},refreshHistory=()=>{},renderP03History=()=>{};
let taskRows=[{id:'a',protocol_number:'101',base_name:'A',area_name:'X',treatment_status:'PENDENTE',due_situation:'VENCE HOJE',due_date:'2026-11-25'},
 {id:'b',protocol_number:'102',base_name:'B',area_name:'Y',treatment_status:'PENDENTE',due_situation:'VENCE HOJE'},
 {id:'c',protocol_number:'103',base_name:'A',area_name:'X',treatment_status:'ACEITOU',p03Readonly:true,work_status:'completed_in_tool'}];
$('v20-mine').insertAdjacentHTML('beforeend',${JSON.stringify(markup)});
${functions}
setupP03Preferences();p03PreferenceScope='synthetic/team';renderPackTasks();
${handlers}
window.fixture={rows:value=>taskRows=value,render:renderPackTasks};
window.testRole='operator';window.pendingMode='rows';window.calls=[];
window.sriGetSupabaseClient=async()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic'}}}),onAuthStateChange:callback=>{window.authChanged=callback;}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'synthetic',role:window.testRole}})})})}),rpc:async name=>{
 window.calls.push(name);if(name==='sri_p03_my_unresolved'){
 if(window.pendingMode==='wait')await new Promise(resolve=>window.releasePending=resolve);
 if(window.pendingMode==='error')return {error:{message:'technical details'}};
 if(window.pendingMode==='empty')return {data:[]};
 return {data:[{protocol_number:'OLD-1',last_day:'2020-01-01',treatment_status:'<img src=x onerror=alert(1)>',base_name:'A',area_name:'X'},{protocol_number:'OLD-2',last_day:new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}),base_name:'A'}]};}
 return {data:[]};}});
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sri-clarity-')),fixture=path.join(dir,'fixture.html');
fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><style>'+styles+'</style><body class="v20-active" data-sri-operator-view="active"><main style="padding:16px"><section id="v20-mine"><div class="v20-between"><h2>Minha Carteira</h2><button>Atualizar visão</button></div></section><section id="reports"><h2>Relatórios</h2></section><section id="v20-settings"></section></main><script>'+harness+'</script><script>'+read('assets/sri-pacote03.js')+'</script><script>'+read('assets/sri-layout-clarity.js')+'</script>');
const chrome=process.env.CHROME_BIN||['/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
const browser=await startChromium(chrome,path.join(dir,'profile'));
const evidence=new URL('../.tmp/layout-clarity/',import.meta.url);fs.mkdirSync(evidence,{recursive:true});
try{
 const page=await browser.page('file://'+fixture,1366,900);
 await page.waitFor("document.querySelector('#sri-p03-reconcile tbody tr')&&document.getElementById('sri-clarity-active')");
 assert.equal(await page.evaluate("document.getElementById('sri-p03-reconcile').hidden"),true,'pendências fora da carteira ativa');
 assert.equal(await page.evaluate("document.querySelectorAll('#sri-p03-reconcile input').length"),0,'sem filtros de equipe/operador');
 assert.equal(await page.evaluate("document.querySelectorAll('#sri-p03-reconcile tbody tr').length"),2,'consulta não vazia renderiza');
 assert.equal(await page.evaluate("document.querySelector('#sri-p03-reconcile img')===null"),true,'conteúdo escapado');
 assert.match(await page.evaluate("document.getElementById('sri-p03-reconcile').textContent"),/Pendência de dia anterior.*Fora da carteira ativa do dia/s);
 await page.evaluate("document.getElementById('sri-pack-base').value='A';document.getElementById('sri-pack-base').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-quick=today]').click()");
 assert.equal(await page.evaluate("document.getElementById('sri-pack-base').value"),'A','atalho preserva base');
 assert.equal(await page.evaluate("document.querySelectorAll('#sri33-task-table tbody tr').length"),1,'atalho combina filtros');
 assert.match(await page.evaluate("document.getElementById('sri-clarity-active').textContent"),/Base: A/);
 await page.evaluate("document.querySelector('[data-quick=today]').click();document.getElementById('sri-p03-state').value='processed';document.getElementById('sri-p03-state').dispatchEvent(new Event('change',{bubbles:true}))");
 assert.match(await page.evaluate("document.getElementById('sri33-task-table').textContent"),/103/);
 assert.equal(await page.evaluate("document.querySelector('#sri33-task-table button[data-sri33-task]')===null"),true,'concluídos continuam somente leitura');
 await page.evaluate("document.querySelector('#sri-clarity-active button[aria-label=\"Remover filtro Base\"]').click();document.getElementById('sri-pack-clear').click()");
 assert.equal(await page.evaluate("document.getElementById('sri-p03-state').value"),'all');
 assert.equal(await page.evaluate("document.querySelectorAll('#sri33-task-table tbody tr').length"),3);
 assert.equal(await page.evaluate("document.getElementById('sri-p03-state').closest('#sri-p03-wallet-state')!==null"),true);
 assert.equal(await page.evaluate("document.getElementById('sri33-task-table').compareDocumentPosition(document.querySelector('.sri-clarity-pagination'))&Node.DOCUMENT_POSITION_FOLLOWING"),4);
 assert.equal(await page.evaluate("document.querySelectorAll('#sri-pack-summary button').length"),0,'indicadores não repetem filtros');
 for(const width of [1366,768,390]){
  const view=width===1366?page:await browser.page('file://'+fixture,width,900);
  await view.waitFor("document.getElementById('sri-clarity-active')");
  assert.equal(await view.evaluate("document.documentElement.scrollWidth<=innerWidth+2"),true,'sem overflow da página '+width);
  fs.writeFileSync(new URL('wallet-'+width+'.png',evidence),await view.screenshot());if(view!==page)await view.close();
 }
 await page.evaluate("window.sriPackOperatorView('pending');document.body.dataset.sriOperatorView='pending'");
 assert.equal(await page.evaluate("document.getElementById('sri-pack-carteira').hidden"),true);
 fs.writeFileSync(new URL('pending.png',evidence),await page.screenshot());
 for(const [mode,text]of [['empty','Nenhuma pendência de dias anteriores'],['error','Não foi possível consultar']]){
  await page.evaluate(`window.pendingMode=${JSON.stringify(mode)};document.querySelector('#sri-p03-reconcile button').click()`);
  await page.waitFor("document.getElementById('sri-p03-reconcile').getAttribute('aria-busy')==='false'");
  assert.match(await page.evaluate("document.getElementById('sri-p03-reconcile').textContent"),new RegExp(text));
  assert.equal(await page.evaluate("document.querySelectorAll('#sri-p03-reconcile tbody tr').length"),0,'sem tabela antiga após '+mode);
 }
 await page.evaluate("window.pendingMode='wait';document.querySelector('#sri-p03-reconcile button').click()");
 await page.waitFor("window.releasePending");
 assert.equal(await page.evaluate("document.querySelector('#sri-p03-reconcile button').disabled"),true);
 await page.waitFor("window.authChanged");
 await page.evaluate("window.testRole='manager';window.authChanged('USER_UPDATED')");
 await page.waitFor("document.getElementById('sri-p03-reconcile')===null");
 await page.evaluate("window.releasePending()");
 assert.equal(await page.evaluate("document.getElementById('sri-p03-reconcile')===null"),true,'resposta atrasada não vaza para outra conta');
 assert.equal(await page.evaluate("window.calls.some(name=>/reopen_task|task_treat|update/.test(name))"),false,'consulta nunca escreve protocolos');
 await page.waitFor("document.querySelector('#sri-p03-productivity .sri-clarity-exports button')");
 assert.equal(await page.evaluate("[...document.querySelectorAll('#sri-p03-productivity .sri-clarity-exports button')].length"),3,'formatos preservados no menu de resultados');
 assert.equal(await page.evaluate("[...document.querySelectorAll('#sri-p03-productivity > .v20-row button')].some(b=>b.textContent==='Consultar')"),true,'consultar permanece junto dos filtros');
 await page.close();
 console.log('PASS: filtros combinados, chips, paginação, concluídos, pendências preenchidas/vazias/erro/loading/troca de perfil; 1366/768/390px.');
}finally{await browser.close();}
