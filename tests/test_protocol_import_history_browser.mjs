import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {startChromium} from './helpers/chromium_cdp.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sri-protocol-calendar-')),file=path.join(dir,'fixture.html');
const setup=`
const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}),month=today.slice(0,7);
window.errors=[];addEventListener('error',e=>errors.push(e.message));
window.fail=false;window.pause=false;window.role='admin';window.queries=[];
const rows=[{id:'a',operational_day:today,shift_label:'Manhã',created_at:today+'T11:00Z'},{id:'b',operational_day:today,shift_label:'Manhã',created_at:today+'T12:00Z'},{id:'c',operational_day:today,shift_label:'Tarde',created_at:today+'T17:00Z'},{id:'d',operational_day:today,shift_label:'Tarde',created_at:today+'T18:00Z'}];
const base={id:'101',status:'12',statusDesc:'SAC RETORNO',bko:'Base A',area:'Área A',agente:'RETORNO',limite:20786,filial:'Filial A'};
const payloads={a:{source:[base]},b:{source:[base]},c:{source:[{...base,status:'11',statusDesc:'<img src=x onerror=alert(1)>'}]},d:{source:[{...base,id:'999'}]}};
window.v42Uncompress=async data=>{if(pause)await new Promise(r=>window.release=r);return payloads[data]||payloads.a;};
window.sriGetSupabaseClient=async()=>({auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:fn=>window.authChanged=fn},from:table=>{let fields='',id='',start='';const q={select:f=>{fields=f;return q;},eq:(k,v)=>{id=v;return q;},gte:(k,v)=>{start=v;return q;},lt:()=>q,order:()=>q,range:()=>q,abortSignal:()=>q,single:()=>q,then:resolve=>{queries.push({table,fields,id,start});resolve(table==='profiles'?{data:{role}}:fields==='payload_gzip'?(fail&&id==='b'?{error:{message:'offline'}}:{data:{payload_gzip:id}}):{data:start.startsWith(month)?rows:[]});}};return q;}});
`;
fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>'+read('assets/sri-layout-clarity.css')+'</style><button data-sri-import-history="101">Histórico de importações</button><script>'+setup+'</script><script>'+read('assets/sri-protocol-import-history.js')+'</script>');
const browser=await startChromium(process.env.CHROME_BIN||'/usr/bin/chromium',path.join(dir,'profile'));
try{for(const width of [1366,768,390]){
 const page=await browser.page('file://'+file,width,1000),run=expr=>page.evaluate(expr);
 await page.waitFor("document.querySelector('[data-sri-import-history]')");await run("document.querySelector('[data-sri-import-history]').click()");
 await page.waitFor("document.querySelectorAll('.sri-import-event').length===3&&document.querySelector('#sri-protocol-import-history [role=status]').textContent.startsWith('3 importação')");
 assert.match(await run("document.querySelector('.sri-import-calendar .has-imports').getAttribute('aria-label')"),/protocolo presente/);
 assert.match(await run("document.querySelectorAll('.sri-import-event')[1].textContent"),/Sem alteração nos campos exibidos/);
 assert.match(await run("document.querySelector('.sri-import-event').textContent"),/Alteração em status de origem/);
 await run("document.querySelector('.sri-import-event').open=true");assert.equal(await run("document.querySelector('#sri-protocol-import-history img')===null"),true);
 assert.equal(await run("document.querySelector('#sri-protocol-import-history').getBoundingClientRect().right<=innerWidth"),true);
 await run("document.querySelector('[aria-label=\"Mês anterior\"]').click()");await page.waitFor("document.querySelector('#sri-protocol-import-history [role=status]').textContent.startsWith('0 importação')");
 assert.equal(await run("document.querySelectorAll('.sri-import-event').length"),0);
 await run("window.fail=true;document.querySelector('[aria-label=\"Próximo mês\"]').click()");await page.waitFor("document.querySelector('#sri-protocol-import-history [role=status]').textContent.includes('Consulta incompleta')");
 assert.match(await run("document.querySelector('.sri-import-event').textContent"),/Comparação indisponível/);
 await run("window.fail=false;[...document.querySelectorAll('#sri-protocol-import-history button')].find(b=>b.textContent==='Tentar novamente').click()");await page.waitFor("document.querySelectorAll('.sri-import-event').length===3");
 if(width===1366){
  await run("document.querySelector('#sri-protocol-import-history header button').click();rows.splice(0,rows.length,...Array.from({length:21},(_,i)=>({id:'many'+i,operational_day:today,shift_label:'Manhã',created_at:today+'T11:00Z'})));document.querySelector('[data-sri-import-history]').click()");
  await page.waitFor("document.querySelector('#sri-protocol-import-history [role=status]').textContent.includes('20 de 21')");
  assert.equal(await run("document.querySelectorAll('.sri-import-event').length"),20);
  await run("[...document.querySelectorAll('#sri-protocol-import-history button')].find(b=>b.textContent==='Continuar consulta do mês').click()");
  await page.waitFor("document.querySelector('#sri-protocol-import-history [role=status]').textContent.startsWith('21 importação')");
 }
 await run("window.pause=true;document.querySelector('[aria-label=\"Próximo mês\"]').click();document.querySelector('[aria-label=\"Mês anterior\"]').click()");await page.waitFor('window.release');
 await run("window.authChanged('SIGNED_OUT');window.release()");assert.equal(await run("document.getElementById('sri-protocol-import-history')===null"),true);
 assert.deepEqual(await run('window.errors'),[]);await page.close();console.log('PASS histórico real, calendário, comparações, vazio, erro, retry, sessão e layout '+width+'px.');
}}finally{await browser.close();}
