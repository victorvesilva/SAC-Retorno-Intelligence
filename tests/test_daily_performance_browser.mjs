import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {startChromium} from './helpers/chromium_cdp.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),html=read('index.html');
const statuses=html.slice(html.indexOf('const DIST_STATUS_DEFS='),html.indexOf('const DIST_STATUS_CHOICES='));
const report=read('assets/sri-p03-reporting.js'),model=report.slice(0,report.indexOf('const $=id=>'))+'})();';
const mock=`${statuses}
window.errors=[];addEventListener('error',e=>errors.push(e.message));
const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}),at=t=>today+'T'+t+':00Z';
const done=DIST_STATUS_DEFS.find(([, ,code])=>code===3)[0];window.fail=false;window.pause=false;window.goals=[];
const tasks=[{id:'a',protocol_number:'101',operator_user_id:'op1',team_id:'t1',created_at:at('10:00'),updated_at:at('12:00'),operational_day:today,base_name:'Base A',area_name:'Área A',due_date:today},
{id:'b',protocol_number:'102',operator_user_id:'op1',team_id:'t1',created_at:at('10:00'),updated_at:at('12:00'),operational_day:today,base_name:'Base A',area_name:'Área A'},
{id:'c',protocol_number:'103',operator_user_id:'op2',team_id:'t2',created_at:at('10:00'),updated_at:at('12:00'),operational_day:today}];
const treatments=[{id:1,task_id:'a',action:done,created_at:at('11:00'),is_special:false,notes:'Concluído'},
{id:2,task_id:'b',action:'PENDENTE',created_at:at('11:00'),is_special:false,notes:'Anterior'},
{id:3,task_id:'b',action:'PENDENTE',created_at:at('12:00'),is_special:true,notes:'<img src=x onerror=alert(1)> Caso sensível',event_context:{actor_name:'Ana'}}];
const names=[{id:'op1',full_name:'Ana'},{id:'op2',full_name:'Bruno'}],teams=[{id:'t1',name:'Equipe A'},{id:'t2',name:'Equipe B'}];
window.sriGetSupabaseClient=async()=>({auth:{getUser:async()=>({data:{user:{id:'manager'}}}),onAuthStateChange:fn=>window.authChanged=fn},
from:table=>{let fields='',filters=[];const q={select:f=>{fields=f;return q;},eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},in:(k,vals)=>{filters.push(r=>vals.includes(r[k]));return q;},lt:()=>q,order:()=>q,range:()=>q,abortSignal:()=>q,single:()=>q,then:async resolve=>{if(fields.includes('role'))return resolve({data:{id:'manager',role:'manager'}});if(window.pause&&table==='daily_operator_tasks')await new Promise(r=>window.release=r);resolve(fail?{error:{message:'offline'}}:{data:(table==='daily_operator_tasks'?tasks:table==='daily_operator_treatments'?treatments:table==='profiles'?names:teams).filter(r=>filters.every(f=>f(r)))});}};return q;},
rpc:(name)=>({abortSignal(){return this;},then(resolve){resolve({data:name==='sri_p03_goals'?window.goals:[]});}})});
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sri-daily-')),file=path.join(dir,'fixture.html');
fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>body{font:14px Arial;margin:16px}.v20-table{border-collapse:collapse;width:100%}.v20-table td,.v20-table th{padding:10px}.v20-tablewrap{overflow:auto}.sri-pack-controls{display:flex;flex-wrap:wrap;gap:10px}.v20-panel{margin:14px 0;padding:16px;border:1px solid #ddd}.v20-stat{border:1px solid #ccc;padding:16px}.v20-stat b{font-size:26px}.v20-button{padding:10px}.v20-field{display:grid;gap:6px}'+read('assets/sri-layout-clarity.css')+'</style><section id="v20-daily-performance" class="active"></section><script>'+mock+'</script><script>'+model+'</script><script>'+read('assets/sri-daily-performance.js')+'</script>');
const browser=await startChromium(process.env.CHROME_BIN||'/usr/bin/chromium',path.join(dir,'profile'));
try{for(const width of [1366,768,390]){
 const page=await browser.page('file://'+file,width,1000),run=e=>page.evaluate(e);
 await page.waitFor("document.getElementById('sri-daily-message')?.textContent.startsWith('3 protocolos')");
 assert.deepEqual(await run("[...document.querySelectorAll('#sri-daily-stats b')].map(b=>b.textContent)"),['3','2','1','1','1']);
 assert.match(await run("document.querySelector('#sri-daily-stats').textContent"),/66,7%/);
 assert.match(await run("document.getElementById('v20-daily-performance').textContent"),/Meta não definida/);
 await run("[...document.querySelectorAll('.sri-daily-analysis button')].find(b=>b.textContent.startsWith('Casos sensíveis')).click()");
 assert.match(await run("document.getElementById('sri-daily-details').textContent"),/1 protocolos no detalhamento/);
 assert.equal(await run("document.querySelector('#sri-daily-details img')===null"),true);
 await run("document.getElementById('sri-daily-team').value='t2';document.getElementById('sri-daily-team').dispatchEvent(new Event('change'))");
 assert.deepEqual(await run("[...document.querySelectorAll('#sri-daily-stats b')].map(b=>b.textContent)"),['1','0','0','0','1']);
 assert.equal(await run("document.getElementById('sri-daily-operator').options.length"),2);
 assert.equal(await run("document.documentElement.scrollWidth<=innerWidth+2"),true);
 await run("document.getElementById('sri-daily-team').value='';document.getElementById('sri-daily-team').dispatchEvent(new Event('change'));window.goals=[{id:1,scope:'general',effective:today,target:null,percentage:60}];document.querySelector('#v20-daily-performance .sri-pack-controls button').click()");
 await page.waitFor("document.querySelector('#v20-daily-performance').textContent.includes('Abaixo da meta')");
 const evidence=new URL('../.tmp/distribution-history/',import.meta.url);fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(new URL('desempenho-diario-'+width+'.png',evidence),await page.screenshot());
 await run("document.getElementById('sri-daily-day').value=new Date(Date.parse(today+'T12:00Z')-86400000).toISOString().slice(0,10);document.getElementById('sri-daily-day').dispatchEvent(new Event('change'));document.querySelector('#v20-daily-performance .sri-pack-controls button').click()");
 await page.waitFor("document.getElementById('sri-daily-message').textContent.startsWith('Nenhuma atribuição')");
 assert.deepEqual(await run("[...document.querySelectorAll('#sri-daily-stats b')].map(b=>b.textContent)"),['0','0','0','0','0']);
 await run("document.getElementById('sri-daily-day').value=today;document.getElementById('sri-daily-day').dispatchEvent(new Event('change'))");
 await run("window.fail=true;document.querySelector('#v20-daily-performance .sri-pack-controls button').click()");
 await page.waitFor("document.getElementById('sri-daily-message').textContent.includes('Não foi possível')");
 assert.equal(await run("document.querySelector('#sri-daily-stats b').textContent"),'—');
 await run("window.fail=false;window.pause=true;document.querySelector('#v20-daily-performance .sri-pack-controls button').click()");await page.waitFor('window.release');
 await run("window.authChanged('SIGNED_OUT');window.release()");assert.equal(await run("document.getElementById('v20-daily-performance').children.length"),0);
 assert.deepEqual(await run('window.errors'),[]);await page.close();console.log('PASS desempenho diário, filtros, protocolos únicos, observações, metas, falha, sessão e layout '+width+'px.');
}}finally{await browser.close();}
