import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {startChromium} from './helpers/chromium_cdp.mjs';
const root=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,root),'utf8');
const html=read('index.html'),head=html.slice(0,html.indexOf('</head>'));
const style=[...[...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]),read('assets/sri-integrated-improvements.css'),read('assets/sri-layout-clarity.css')].join('\n');
const mock=`
window.testRole='admin';window.calls=[];window.mutationMode='success';window.confirm=()=>true;
window.sriGetSupabaseClient=async()=>({auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:fn=>window.authChanged=fn},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'admin',role:window.testRole}})})})}),rpc:async(name,args)=>{
 window.calls.push({name,args});
 if(name==='sri_distribution_history'&&!args.p_snapshot)return {data:args.p_day==='2026-11-24'?[{id:'s1',shift:'Manhã',registered_at:'2026-11-24T11:00:00Z',reference:1,team:'Geral'},{id:'s2',shift:'Tarde',registered_at:'2026-11-24T16:00:00Z',reference:2,team:'Geral'}]:[]};
 if(name==='sri_distribution_history')return {data:{revision:7,rows:Array.from({length:65},(_,i)=>({protocol:'P'+i,operator:i===0?'Assistente <img src=x>':'Operador '+i,profile:i===0?'assistant':'operator',active:i>0,can_remove:i!==1,has_treatment:i===1,work_status:i===1?'completed_in_tool':'pending'}))}};
 if(name==='sri_distribution_unassign')return window.mutationMode==='success'?{data:{removed:args.p_protocols.length,revision:8}}:{error:{message:'Dia ou turno fechado. Realize a reabertura autorizada'}};
 return {data:[]};}});
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sri-distribution-history-'));const fixture=path.join(dir,'fixture.html');
fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><style>'+style+'</style><body class="v20-active"><main style="padding:16px"><section id="distribution"></section></main><script>'+mock+'</script><script>'+read('assets/sri-distribution-history.js')+'</script>');
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);const browser=await startChromium(chrome,path.join(dir,'profile'));
const evidence=new URL('../.tmp/distribution-history/',import.meta.url);fs.mkdirSync(evidence,{recursive:true});
try{
 const page=await browser.page('file://'+fixture,1366,900);await page.waitFor("document.getElementById('sri-distribution-history')");
 await page.evaluate(`window.clickHistory=text=>[...document.querySelectorAll('#sri-distribution-history button')].find(b=>b.textContent===text).click();
 document.getElementById('sri-dist-history-day').value='2026-11-24';clickHistory('Buscar extrações');`);
 await page.waitFor("document.getElementById('sri-dist-history-snapshot').options.length===3");
 assert.equal(await page.evaluate("document.querySelectorAll('#sri-distribution-history tbody tr').length"),0,'nenhuma remoção automática');
 await page.evaluate("document.getElementById('sri-dist-history-period').value='Manhã';document.getElementById('sri-dist-history-period').dispatchEvent(new Event('change'))");
 assert.equal(await page.evaluate("document.getElementById('sri-dist-history-snapshot').options.length"),2,'período filtra rodadas da data');
 await page.evaluate("document.getElementById('sri-dist-history-snapshot').value='s1';document.getElementById('sri-dist-history-snapshot').dispatchEvent(new Event('change'));clickHistory('Consultar atribuições')");
 await page.waitFor("document.querySelectorAll('#sri-distribution-history tbody tr').length===50");
 assert.equal(await page.evaluate("document.querySelector('#sri-distribution-history img')===null"),true,'nomes não executam HTML');
 assert.equal(await page.evaluate("document.querySelectorAll('#sri-distribution-history tbody input')[1].disabled"),true,'concluído protegido');
 await page.evaluate("clickHistory('Próxima página')");assert.equal(await page.evaluate("document.querySelectorAll('#sri-distribution-history tbody tr').length"),15,'paginação não perde registros');
 await page.evaluate("document.getElementById('sri-dist-history-search').value='Assistente';document.getElementById('sri-dist-history-search').dispatchEvent(new Event('input'))");
 assert.equal(await page.evaluate("document.querySelectorAll('#sri-distribution-history tbody tr').length"),1);
 await page.evaluate("document.querySelector('#sri-distribution-history tbody input').click()");
 assert.equal(await page.evaluate("document.querySelector('.sri-dist-history-remove').disabled"),true,'justificativa obrigatória');
 await page.evaluate("document.getElementById('sri-dist-history-reason').value='Atribuição de teste feita por engano';document.getElementById('sri-dist-history-reason').dispatchEvent(new Event('input'))");
 fs.writeFileSync(new URL('historical-1366.png',evidence),await page.screenshot());
 await page.evaluate("clickHistory('Remover atribuições selecionadas')");await page.waitFor("document.querySelector('#sri-distribution-history [role=status]').textContent.includes('removida(s)')");
 const mutation=await page.evaluate("window.calls.find(c=>c.name==='sri_distribution_unassign')");
 assert.deepEqual(mutation.args,{p_day:'2026-11-24',p_snapshot:'s1',p_revision:7,p_protocols:['P0'],p_reason:'Atribuição de teste feita por engano'});
 assert.equal(await page.evaluate("document.querySelector('.sri-dist-history-remove').disabled"),true,'não permite repetição com revisão antiga');
 await page.evaluate("clickHistory('Consultar atribuições')");await page.waitFor("document.querySelector('#sri-distribution-history tbody input')");
 await page.evaluate("window.mutationMode='closed';document.querySelector('#sri-distribution-history tbody input').click();document.getElementById('sri-dist-history-reason').value='Correção histórica justificada';document.getElementById('sri-dist-history-reason').dispatchEvent(new Event('input'));clickHistory('Remover atribuições selecionadas')");
 await page.waitFor("document.querySelector('#sri-distribution-history [role=status]').textContent.includes('fechado')");
 assert.equal(await page.evaluate("document.querySelector('.sri-dist-history-remove').disabled"),true,'falha exige consulta nova');
 await page.evaluate("document.getElementById('sri-dist-history-day').value='2026-11-23';document.getElementById('sri-dist-history-day').dispatchEvent(new Event('change'));clickHistory('Buscar extrações')");
 await page.waitFor("document.querySelector('#sri-distribution-history [role=status]').textContent.includes('Nenhuma extração')");
 assert.equal(await page.evaluate("document.querySelectorAll('#sri-distribution-history tbody tr').length"),0,'data sem dados não mantém resultado anterior');
 for(const width of [768,390]){const view=await browser.page('file://'+fixture,width,900);await view.waitFor("document.getElementById('sri-distribution-history')");assert.equal(await view.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true);fs.writeFileSync(new URL('historical-'+width+'.png',evidence),await view.screenshot());await view.close();}
 await page.evaluate("window.testRole='operator';window.authChanged('USER_UPDATED')");await page.waitFor("document.getElementById('sri-distribution-history')===null");
 await page.close();console.log('PASS: data/período/rodada, consulta de Assistente, seleção, justificativa, confirmação, revisão, erro de fechamento, vazio, troca de perfil e layout 1366/768/390px.');
}finally{await browser.close();}
