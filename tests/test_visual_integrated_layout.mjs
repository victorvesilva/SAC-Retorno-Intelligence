/* Revisão visual integrada com dados sintéticos — sem login, rede ou dados pessoais.
 * Monta os painéis reais do index.html com os estilos de produção e valores longos.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const base=fileURLToPath(new URL('../',import.meta.url));
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const loginCss=fs.readFileSync(path.join(base,'assets/login-refinado.css'),'utf8');
const stageFiles=[
 'gestao-operacional-refinado.css',
 'refinamento-operacional-etapa2.css',
 'refinamento-analitico-relatorios-etapa3.css',
 'refinamento-bases-qualidade-etapa4.css',
 'revisao-visual-integrada.css'
];
assert.ok(html.includes('<span class="sri-login-version">SAC Retorno Intelligence</span>'),
 'O selo superior do login deve mostrar somente o nome do produto');
assert.ok(!html.includes('<span class="sri-login-version">INTELLIGENCE 2.0</span>'),
 'Identificação antiga da versão não deve permanecer no selo');
assert.ok(html.includes('/assets/login-refinado.css?v=2.0.4'),'O novo CSS de login deve estar ativo');
assert.ok(loginCss.includes('#v20-login .sri-login-version'),'O texto de identificação deve ter estilo responsivo');
let cursor=-1;
for(const file of stageFiles) {
 const filename='/assets/'+file+'?v=1.0.0';
 const index=html.indexOf(filename);
 assert.ok(index>cursor,'Ordem da cascata visual incorreta: '+file);
 cursor=index;
}
const integratedCss=fs.readFileSync(path.join(base,'assets/revisao-visual-integrada.css'),'utf8');
assert.equal(integratedCss.split('{').length,integratedCss.split('}').length,'CSS deve estar balanceado');
for(const id of ['overview','distribution','priorities','agents','intelligence','reports','import','details','v20-mine','v20-closure','v20-settings']){
 assert.ok(html.includes('id="'+id+'"'),'Área do sistema ausente: '+id);
}
assert.ok(!integratedCss.includes('#v20-login'),'A revisão transversal não pode afetar a tela de login');
assert.ok(!integratedCss.includes('.v51-pdf-page'),'A revisão não pode modificar relatório PDF');

const mainStart=html.indexOf('<main class="main">');
const mainEnd=html.indexOf('</main>',mainStart);
assert.ok(mainStart>0&&mainEnd>mainStart,'Estrutura real do aplicativo não localizada');
const mainHtml=html.slice(mainStart,mainEnd+'</main>'.length);
const headStyles=[...html.slice(0,mainStart).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const externalStyles=[...stageFiles,'sri-p03-reporting.css'].map(f=>fs.readFileSync(path.join(base,'assets',f),'utf8')).join('\n');
const reportingSource=fs.readFileSync(path.join(base,'assets/sri-p03-reporting.js'),'utf8');
const statusStart=html.indexOf('const DIST_STATUS_DEFS=');
const statusEnd=html.indexOf('const DIST_STATUS_CHOICES=',statusStart);
assert.ok(statusStart>0&&statusEnd>statusStart);
const statusDefinitions=html.slice(statusStart,statusEnd);
const chrome=process.env.CHROME_BIN ||
 ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(f=>fs.existsSync(f));
assert.ok(chrome,'Chrome/Chromium deve estar instalado para homologação visual');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sri-visual-integrada-'));
const fixture=path.join(tmp,'fixture.html');
async function fixtureProbe(){
 // Authentication is outside this synthetic module fixture. It must never cover the screen.
 document.getElementById('v20-login')?.remove();
 document.body.classList.add('v20-active');document.body.dataset.v20Role='admin';
 for(let attempt=0;attempt<30&&!document.getElementById('sri-p03-integrated-reports');attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 const tab=new URLSearchParams(location.search).get('tab')||'overview';
 const longName='Operadora de atendimento e qualidade regional de demandas complexas com identificação extensa';
 function put(id,markup){const el=document.getElementById(id);if(el)el.innerHTML=markup;}
 const td=(text)=>'<td>'+text+'</td>';
 function rows(id,cols,count){
  const values=['900000000000000202611230001','Operadora Regional Norte Nordeste','2026-11-23',
   longName,'Fila de Tratamento de Demandas Especializadas e Retornos','D6','Em tratamento',
   'Supervisor Equipe Atendimento de Qualidade Extenso','Prioridade crítica', '42.000','100%','R$ 9.999.999'];
  let markup='';
  for(let i=0;i<count;i++) {
   markup+='<tr data-record="SINTETICO-'+i+'">';
   for(let c=0;c<cols;c++)markup+=td(values[(i+c)%values.length]);
   markup+='</tr>';
  }
  put(id,markup);
 }
 const sampleCard='<div class="kpi-card"><div class="kpi-lbl">Protocolos críticos pendentes de tratamento</div>'+
  '<div class="kpi-value">128.967</div><div class="kpi-bottom">Referência sintética de grande volume</div></div>';
 put('kpis-primary',sampleCard.repeat(4));put('kpis-secondary',sampleCard.repeat(4));
 const focus='<article class="go-focus-item" style="--go-tone:#bb3759"><div class="go-focus-head">Backlog de atendimento</div>'+
  '<div class="go-focus-number">15.348</div><div class="go-focus-note">Demandas em atraso</div>'+
  '<div class="go-focus-bars"><button class="go-focus-bar"><span class="go-focus-bar-name">'+longName+
  '</span><small>8.903</small><span class="go-focus-bar-track"><span class="go-focus-bar-fill" style="width:73%"></span></span></button></div></article>';
 put('go-focus',focus.repeat(4));
 put('bko-kpis','<div class="v2-kpi"><small>Carteira em acompanhamento</small><strong>123.456</strong></div>'.repeat(5));
 put('bko-table','<table class="data-table"><thead><tr><th>BKO</th><th>Responsável</th><th>Total</th></tr></thead><tbody>'+
  '<tr>'+td(longName)+td(longName)+td('12.568')+'</tr>'.repeat(15)+'</tbody></table>');
 put('v3-priority-kpis','<div class="v3-stat"><small>Demandas prioritárias</small><strong>12.459</strong></div>'.repeat(4));
 put('v3-agent-kpis','<div class="v3-stat"><small>Operadores com grande carteira</small><strong>1.288</strong></div>'.repeat(4));
 rows('dist-table-body',17,24);
 rows('v3-priority-body',8,24);
 rows('v3-agent-body',8,24);
 rows('details-body',10,24);
 put('v49-compare-rows','<tr>'+td(longName)+td('12000')+td('12100')+td('+100')+td('0,8%')+'</tr>'.repeat(12));
 put('v20-mine-body','<div class="v20-panel"><h3>Carteira do operador</h3><div class="v20-tablewrap"><table class="data-table"><thead><tr><th>Protocolo</th><th>Operador</th><th>Status</th></tr></thead><tbody>'+
  ('<tr>'+td('900000000000000202611230001')+td(longName)+td('Em tratamento')+'</tr>').repeat(18)+'</tbody></table></div></div>');
 put('v20-cl-body','<div class="v20-panel"><h3>Consolidado diário</h3><div class="v20-tablewrap"><table class="data-table"><thead><tr><th>Equipe</th><th>Responsável</th><th>Total</th></tr></thead><tbody>'+
  ('<tr>'+td(longName)+td(longName)+td('123.456')+'</tr>').repeat(10)+'</tbody></table></div></div>');
 put('v20-settings-body','<div class="v20-panel"><h3>Gestão de usuários e equipes</h3><div class="v20-tablewrap"><table class="data-table"><thead><tr><th>Nome</th><th>Equipe</th></tr></thead><tbody>'+
  ('<tr>'+td(longName)+td(longName)+'</tr>').repeat(12)+'</tbody></table></div></div>');
 for(const section of document.querySelectorAll('section.tab-content')) {
  section.classList.toggle('active',section.id===tab);
 }
 const controls=document.getElementById('global-controls');
 if(controls)controls.hidden=!(tab==='overview'||tab==='intelligence');
 const section=document.getElementById(tab);
 if(tab==='reports'){
  const panel=document.getElementById('sri-p03-integrated-reports');
  if(!panel)throw Error('Relatórios integrados não montados');
  const query=[...panel.querySelectorAll('button')].find(el=>el.textContent==='Consultar');await query.onclick();
  if(location.search.includes('focus=integrated')){document.documentElement.style.scrollBehavior='auto';panel.scrollIntoView({block:'start',behavior:'instant'});await new Promise(resolve=>setTimeout(resolve,100));}
 }
 const rect=section?.getBoundingClientRect();
 const root=document.documentElement;
 const output={
  tab,width:window.innerWidth,height:window.innerHeight,
  rootWidth:root.clientWidth,rootScroll:root.scrollWidth,
  mainWidth:document.querySelector('.main')?.getBoundingClientRect().width,
  screenWidth:rect?.width,
  screenVisible:!!section && getComputedStyle(section).display!=='none'&&rect.height>0,
  loginPresent:!!document.getElementById('v20-login'),
  topLayerLogin:!!document.elementFromPoint(Math.floor(innerWidth*.75),Math.floor(innerHeight*.5))?.closest('#v20-login'),
  integratedReports:tab!=='reports'||!!document.querySelector('#sri-p03-integrated-reports tbody tr'),
  integratedBounds:(()=>{const box=document.getElementById('sri-p03-integrated-reports')?.getBoundingClientRect();return box?{top:box.top,left:box.left,width:box.width,height:box.height}:null;})(),
  topElement:document.elementFromPoint(Math.floor(innerWidth*.75),Math.floor(innerHeight*.5))?.tagName,
  cards:section?.querySelectorAll('.card,.v3-card,.dist-panel,.v20-panel').length||0
 };
 const result=document.createElement('pre');
 result.id='sri-integrated-probe';result.hidden=true;
 result.textContent=JSON.stringify(output);document.body.appendChild(result);
}
const head='<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<style>*,*::before,*::after{box-sizing:border-box}</style><style>'+headStyles+'\n'+externalStyles+'</style></head>';
const menu='<aside class="sidebar v5-sidebar"><div class="v5-rail"><div class="v5-rail-links">'+
 '<button class="v5-rail-link active">◎</button></div></div>'+
 '<div class="v5-nav-panel"><nav class="side-nav" id="nav"><button class="nav-link active">'+
 '<span>Gestão Operacional</span></button><button class="nav-link"><span>Distribuição</span></button></nav></div></aside>';
const fakeClient=`
window.sriGetSupabaseClient=async()=>({
 auth:{getUser:async()=>({data:{user:{id:'synthetic-admin'}}}),onAuthStateChange(){}},
 from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:'synthetic-admin',role:'admin'}})}),
 rpc:async(name)=>({data:name==='sri_p03_reporting_page'?[
 {kind:'assignment',id:'a',cursor:'A:a',protocol:'900000000000000202611230001',day:'2026-11-25',team:'Equipe Regional Norte Nordeste',team_id:'team',operator:'Operador sintético',operator_id:'op',area:'Área de atendimento especializado e demandas complexas',base:'Operadora regional'},
 {kind:'treatment',id:'1',cursor:'H:1',protocol:'900000000000000202611230001',day:'2026-11-25',at:'2026-11-25T12:00Z',team:'Equipe Regional Norte Nordeste',team_id:'team',operator:'Operador sintético',operator_id:'op',status:'OUTROS'},
 {kind:'treatment',id:'2',cursor:'H:2',protocol:'900000000000000202611230002',day:'2026-11-25',at:'2026-11-25T12:01Z',team:'Equipe Regional Norte Nordeste',team_id:'team',operator:'Operador sintético',operator_id:'op',status:'PENDENTE'}
 ]:[]})
});
`;
const js='<script>'+statusDefinitions+fakeClient+'</'+'script><script>'+reportingSource+'</'+'script><script>('+fixtureProbe.toString()+')().catch(error=>{document.body.dataset.visualError=error.message;});</'+'script>';
fs.writeFileSync(fixture,'<!doctype html><html lang="pt-BR">'+head+
 '<body><div class="app v5-app">'+menu+mainHtml+'</div>'+js+'</body></html>','utf8');

const devices=[
 [1440,900,['reports-integrated','overview','distribution','priorities','agents','intelligence','reports','import','details','v20-mine','v20-closure','v20-settings']],
 [1024,768,['overview','distribution','intelligence','reports','import','details','v20-closure']],
 [390,844,['reports-integrated','overview','distribution','priorities','agents','intelligence','reports','import','details','v20-mine','v20-closure','v20-settings']]
];
if(process.env.SRI_CAPTURE_INTEGRATED_SCREENSHOT==='1') {
 const destination=path.join(base,'.tmp','visual-integrada');
 fs.mkdirSync(destination,{recursive:true});
 for(const [width,height,tab] of [[1440,900,'overview'],[1440,900,'distribution'],
   [1440,900,'reports'],[1440,900,'details'],[390,844,'overview'],
   [390,844,'distribution'],[390,844,'reports'],[390,844,'import'],
   [1440,900,'reports-integrated'],[390,844,'reports-integrated']]){
  const image=path.join(destination,tab+'-'+width+'.png');
  execFileSync(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
   '--disable-background-networking','--allow-file-access-from-files',
   '--virtual-time-budget=2000','--run-all-compositor-stages-before-draw','--force-device-scale-factor=1',
   '--window-size='+width+','+height,
   '--user-data-dir='+path.join(tmp,'s-'+width+'-'+tab),
   '--screenshot='+image,'file://'+fixture+'?tab='+(tab==='reports-integrated'?'reports&focus=integrated':tab)],
   {timeout:50000,stdio:['ignore','pipe','pipe']});
  assert.ok(fs.statSync(image).size>3500,'Captura visual vazia '+tab);
  console.log('SCREENSHOT',image);
 }
}

for(const [width,height,tabs] of devices){
 for(const tab of tabs){
  const url='file://'+fixture+'?tab='+(tab==='reports-integrated'?'reports&focus=integrated':encodeURIComponent(tab));
  const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
   '--disable-background-networking','--allow-file-access-from-files',
   '--virtual-time-budget=2000','--run-all-compositor-stages-before-draw','--force-device-scale-factor=1',
   '--window-size='+width+','+height,'--user-data-dir='+path.join(tmp,'p-'+width+'-'+height+'-'+tab),
   '--dump-dom',url];
  const dom=execFileSync(chrome,args,{encoding:'utf8',timeout:50000,stdio:['ignore','pipe','pipe']});
  const match=dom.match(/<pre id="sri-integrated-probe"[^>]*>([\s\S]*?)<\/pre>/);
  if(!match){const dest=path.join(base,'.tmp','visual-integrada');fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'diagnostic-'+tab+'-'+width+'.html'),dom);}
  assert.ok(match,'Teste visual não executou: '+tab+' em '+width+'x'+height);
  const result=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
  if(tab==='reports-integrated'){assert.ok(result.integratedBounds?.height>200,JSON.stringify(result));assert.ok(result.integratedBounds.top>=-3&&result.integratedBounds.top<150,JSON.stringify(result));}
  assert.equal(result.loginPresent,false,'Login deve estar ausente da fixture de módulos');
  assert.equal(result.topLayerLogin,false,'Login não pode cobrir o módulo');
  assert.equal(result.integratedReports,true,'Relatórios novos devem apresentar dados reais do modelo sintético');
  assert.equal(result.screenVisible,true,'Módulo não visível: '+tab);
  assert.ok(result.screenWidth>100,'Módulo sem largura: '+tab);
  assert.ok(result.mainWidth<=result.width+3,'Conteúdo principal ultrapassa viewport '+tab+' '+width+'x'+height);
  assert.ok(result.rootScroll<=result.rootWidth+5,
   'Rolagem horizontal na página '+tab+' '+width+'x'+height+
   ': scroll='+result.rootScroll+' viewport='+result.rootWidth);
  console.log('PASS visual integrado',tab,width+'x'+height,
    'cards='+result.cards,'overflow='+Math.max(0,result.rootScroll-result.rootWidth));
 }
}
console.log('PASS: revisão visual integrada em 3 resoluções, 11 módulos e dados sintéticos.');
