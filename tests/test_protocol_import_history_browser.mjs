import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {startChromium} from './helpers/chromium_cdp.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sri-protocol-calendar-')),file=path.join(dir,'fixture.html');
const setup=`
const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}),month=today.slice(0,7);
window.errors=[];addEventListener('error',e=>errors.push(e.message));window.fail=false;window.pause=false;window.pending=false;window.queries=[];
const base={status:'12',statusDesc:'SAC RETORNO',bko:'Base A',area:'Área A',agente:'RETORNO',limite:20786,filial:'Filial A'};
const records=[{id:'a',day:today,shift:'Manhã',at:today+'T11:00Z',created:today+'T11:00Z',rows:[base]},{id:'b',day:today,shift:'Manhã',at:today+'T12:00Z',created:today+'T12:00Z',rows:[base]},{id:'c',day:today,shift:'Tarde',at:today+'T17:00Z',created:today+'T17:00Z',rows:[{...base,status:'11',statusDesc:'<img src=x onerror=alert(1)>'}]}];
window.sriGetSupabaseClient=async()=>({auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:fn=>window.authChanged=fn},from:table=>{if(table!=='profiles')throw Error('Download de apuração na consulta');return {select:()=>({eq:()=>({single:async()=>({data:{role:'admin'}})})})};},rpc:(name,args)=>({abortSignal(){return this;},async then(resolve){queries.push({name,args});if(pause)await new Promise(r=>window.release=r);resolve(fail?{error:{message:'offline'}}:name==='sri_protocol_import_calendar'?{data:{days:args.p_month.startsWith(month)?[{day:today,count:3}]:[],pending_days:pending?[today]:[],revision:pending?'pending':'ready'}}:{data:args.p_day===today?records:[]});}})});
`;
fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>'+read('assets/sri-layout-clarity.css')+'</style><button data-sri-import-history="101">Histórico de importações</button><script>'+setup+'</script><script>'+read('assets/sri-protocol-import-history.js')+'</script>');
const browser=await startChromium(process.env.CHROME_BIN||'/usr/bin/chromium',path.join(dir,'profile'));
try{for(const width of [1366,768,390]){
 const page=await browser.page('file://'+file,width,1000),run=e=>page.evaluate(e);
 await page.waitFor("document.querySelector('[data-sri-import-history]')");await run("document.querySelector('[data-sri-import-history]').click()");
 await page.waitFor("document.querySelectorAll('.sri-import-event').length===3");
 assert.equal(await run('queries.length'),2,'calendário e dia em duas consultas leves');
 assert.match(await run("document.querySelectorAll('.sri-import-event')[1].textContent"),/Sem alteração nos campos exibidos/);
 assert.match(await run("document.querySelector('.sri-import-event').textContent"),/Alteração em status de origem/);
 await run("document.querySelector('.sri-import-event').open=true");assert.equal(await run("document.querySelector('#sri-protocol-import-history img')===null"),true);
 assert.equal(await run("document.querySelector('#sri-protocol-import-history').getBoundingClientRect().right<=innerWidth"),true);
 await run("document.querySelector('#sri-protocol-import-history header button').click();document.querySelector('[data-sri-import-history]').click()");await page.waitFor("document.querySelectorAll('.sri-import-event').length===3");
 assert.equal(await run('queries.length'),2,'reabertura usa cache da sessão');
 await run("document.querySelector('[aria-label=\"Mês anterior\"]').click()");await page.waitFor("document.querySelector('#sri-protocol-import-history [role=status]')?.textContent.startsWith('0 importação')");assert.equal(await run('queries.length'),3,'mês vazio consulta apenas calendário');
 await run("document.querySelector('[aria-label=\"Próximo mês\"]').click()");await page.waitFor("document.querySelectorAll('.sri-import-event').length===3");assert.equal(await run('queries.length'),3);
 await run("window.pending=true;[...document.querySelectorAll('#sri-protocol-import-history button')].find(b=>b.textContent==='Atualizar histórico').click()");
 await page.waitFor("document.querySelector('#sri-protocol-import-history [role=status]').textContent.includes('ainda estão sendo preparadas')");assert.match(await run("document.querySelector('.sri-import-event').textContent"),/Comparação indisponível/);
 await run("window.pending=false;window.fail=true;[...document.querySelectorAll('#sri-protocol-import-history button')].find(b=>b.textContent==='Atualizar histórico').click()");await page.waitFor("document.querySelector('#sri-protocol-import-history [role=status]').textContent.includes('Não foi possível')");
 await run("window.fail=false;[...document.querySelectorAll('#sri-protocol-import-history button')].find(b=>b.textContent==='Tentar novamente').click()");await page.waitFor("document.querySelectorAll('.sri-import-event').length===3");
 await run("window.pause=true;[...document.querySelectorAll('#sri-protocol-import-history button')].find(b=>b.textContent==='Atualizar histórico').click()");await page.waitFor('window.release');await run("window.authChanged('SIGNED_OUT');window.release()");assert.equal(await run("document.getElementById('sri-protocol-import-history')===null"),true);
 assert.deepEqual(await run('window.errors'),[]);await page.close();console.log('PASS calendário e dia em 2 consultas, cache, vazio, pendência, erro, sessão e layout '+width+'px.');
}}finally{await browser.close();}
