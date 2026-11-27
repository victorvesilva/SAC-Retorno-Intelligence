import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startChromium} from './helpers/chromium_cdp.mjs';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('index.html');
const main=html.slice(html.indexOf('<main class="main">'),html.indexOf('</main>')+7);
const inline=[...html.slice(0,html.indexOf('<main class="main">')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const files=['gestao-operacional-refinado.css','refinamento-operacional-etapa2.css','refinamento-analitico-relatorios-etapa3.css','refinamento-bases-qualidade-etapa4.css','revisao-visual-integrada.css','sri-mobile-navigation.css','sri-integrated-improvements.css','sri-p03-reporting.css','sri-layout-clarity.css','sri-interface.css'];
const styles=inline+'\n'+files.map(file=>read('assets/'+file)).join('\n');
const routing=html.split('\n').find(line=>line.startsWith('function v46SetPane('))+'\n'+html.split('\n').find(line=>line.startsWith('function distPane('));
const setup=`
const ui={tab:'overview'},distState={};function dmManagerRender(){}
window.layoutErrors=[];
window.addEventListener('error',event=>window.layoutErrors.push(event.message));
window.switchTab=id=>{
 ui.tab=id;
 document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('active',el.id===id));
 document.getElementById('global-controls').hidden=!['overview','details','agents','intelligence','priorities'].includes(id);
};
document.getElementById('v20-login')?.remove();
document.getElementById('reports').insertAdjacentHTML('beforeend',
 '<section id="sri-p03-integrated-reports"><h3>Resultados</h3><input id="saved-period" value="2026-11-27"></section>'+
 '<section id="sri-p03-productivity"><h3>Produtividade</h3></section>'+
 '<section id="sri-movement-panel"><h3>Movimentações</h3></section>');
document.getElementById('import').insertAdjacentHTML('beforeend','<section id="sri33-progress">Acompanhamento autorizado</section>');
document.getElementById('distribution').insertAdjacentHTML('beforeend','<section id="sri-distribution-history">Histórico autorizado</section>');
document.getElementById('v20-settings').insertAdjacentHTML('beforeend','<section id="sri-monitor-panel">Monitor autorizado</section>');
for(const id of ['overview','details','reports']){
 document.getElementById(id).insertAdjacentHTML('afterbegin','<nav class="v20-module-tabs"><button>Seção</button></nav>');
}
window.switchTab('overview');
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sri-module-layout-'));
const fixture=path.join(dir,'fixture.html');
fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><style>'+styles+'</style><div class="app v5-app"><aside class="sidebar"></aside>'+main+'</div><script>'+routing+setup+'</script><script>'+read('assets/sri-layout-clarity.js')+'</script>');
const browser=await startChromium(process.env.CHROME_BIN||'/usr/bin/chromium',path.join(dir,'profile'));
try {
 for(const width of [1440,768,390]){
  const page=await browser.page('file://'+fixture,width,900);
  await page.waitFor("document.querySelector('#sri-report-tabs button')");
  const run=expression=>page.evaluate(expression);
  assert.equal(await run("getComputedStyle(document.querySelector('.main > .hero')).display"),'none','Título da tela sem banner duplicado');
  assert.equal(await run("document.getElementById('hero-upload').closest('.tab-content').id"),'overview','Atalho de importação preservado');
  for(const id of ['overview','details','agents','intelligence','priorities']){
   await run(`window.switchTab('${id}')`);
   await page.waitFor(`document.getElementById('global-controls').parentElement.id==='${id}'`);
   assert.equal(await run(`document.getElementById('${id}').firstElementChild.classList.contains('sri-module-header')`),true,'Título antes dos filtros em '+id);
  }
  await run("window.switchTab('reports')");
  for(const [key,target]of [['period','sri-p03-integrated-reports'],['pdf','sri-layout-pdf'],['productivity','sri-p03-productivity'],['movements','sri-movement-panel']]){
   await run(`document.querySelector('#sri-report-tabs [data-layout-view="${key}"]').click()`);
   assert.equal(await run(`getComputedStyle(document.getElementById('${target}')).display!=='none'`),true,key+' visível');
   assert.equal(await run("document.querySelectorAll('#reports [role=tabpanel]:not(.sri-layout-panel-hidden)').length"),1,'Uma consulta por vez');
   assert.equal(await run("document.documentElement.scrollWidth<=innerWidth+5"),true,'Sem overflow em relatórios '+key+' '+width);
  }
  await run("window.sriShowReportSection('period')");
  assert.equal(await run("document.getElementById('saved-period').value"),'2026-11-27','Trocar abas preserva o filtro');
  await run("document.querySelector('#sri-report-tabs [data-layout-view=period]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");
  // Explicit focus exercises keyboard navigation independently of pointer focus behavior.
  await run("document.querySelector('#sri-report-tabs [data-layout-view=period]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert.equal(await run("document.activeElement.dataset.layoutView"),'pdf');
  await run("window.switchTab('details');document.getElementById('sri-quality-alerts-link').click()");
  assert.equal(await run("document.querySelector('.tab-content.active').id"),'v20-alerts');
  await run("document.querySelector('#sri-quality-return button').click()");
  assert.equal(await run("document.getElementById('v46-pane-records').classList.contains('active')"),true);
  await run("window.switchTab('distribution');document.querySelector('[data-dist-pane=history]').click()");
  assert.equal(await run("document.getElementById('sri-distribution-history').closest('.dist-pane').classList.contains('active')"),true);
  await run("document.querySelector('[data-dist-pane=followup]').click()");
  assert.equal(await run("document.getElementById('sri33-progress').closest('.dist-pane').classList.contains('active')"),true);
  await run("window.switchTab('v20-settings');document.getElementById('sri-settings-monitor').click()");
  assert.equal(await run("getComputedStyle(document.getElementById('v20-settings-body')).display"),'none');
  await run("document.querySelector('#v20-settings [data-v20=settingsUsers]').click()");
  await page.waitFor("getComputedStyle(document.getElementById('v20-settings-body')).display!=='none'");
  await new Promise(resolve=>setTimeout(resolve,1100));
  assert.equal(await run("document.querySelectorAll('[data-layout-catalog]').length"),1,'Sem duplicação em remontagens');
  assert.equal(await run("document.querySelectorAll('#sri-report-tabs').length"),1);
  assert.deepEqual(await run('window.layoutErrors'),[],'Sem erros de interface');
  await page.close();
  console.log('PASS organização dos módulos '+width+'px, navegação e preservação dos filtros.');
 }
} finally {await browser.close();}
