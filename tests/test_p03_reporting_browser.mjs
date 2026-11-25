import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../assets/sri-p03-reporting.js',import.meta.url),'utf8');
const day=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
const setup=`
const DIST_STATUS_DEFS=[['ACEITOU','',3],['OUTROS','',3],['FILIAL','',10],['PENDENTE','',0]];
const day=${JSON.stringify(day)};
let user={id:'admin',role:'admin'},handler,delay=null;
const rows=[
 {kind:'assignment',id:'a',cursor:'A:a',protocol:'P1',day,team:'Equipe A',team_id:'team-a',operator:'Operador A',operator_id:'op-a',area:'Área A',base:'Base A'},
 {kind:'treatment',id:'1',cursor:'H:1',protocol:'P1',status:'ACEITOU',at:day+'T10:00Z',day,team:'Equipe A',team_id:'team-a',operator:'Operador A',operator_id:'op-a'},
 {kind:'treatment',id:'2',cursor:'H:2',protocol:'P1',status:'ACEITOU',at:day+'T11:00Z',day,team:'Equipe A',team_id:'team-a',operator:'Operador A',operator_id:'op-a'},
 {kind:'treatment',id:'3',cursor:'H:3',protocol:'P2',status:'FILIAL',at:day+'T10:00Z',day,team:'Equipe A',team_id:'team-a',operator:'Operador A',operator_id:'op-a'}];
let goals=[{id:'1',scope:'general',target:null,effective:day,percentage:50,target_name:'Toda a operação'}];
window.exports=[];window.sriP03ExportReport=(...args)=>window.exports.push(args);
window.sriGetSupabaseClient=async()=>({
 auth:{getUser:async()=>({data:{user}}),onAuthStateChange:fn=>{handler=fn;}},
 from:table=>({select(){return this;},eq(){return this;},single:async()=>({data:user}),then(resolve){resolve({data:table==='teams'?[{id:'team-a',name:'Equipe A'}]:[{id:'op-a',full_name:'Operador A',role:'operator',operational_status:'Ativo'}]});}}),
 rpc:async(name,args)=>{
  if(name==='sri_p03_reporting_page'){if(delay)return await new Promise(resolve=>{window.release=()=>resolve({data:rows});});return {data:args.p_from===day?rows:[]};}
  if(name==='sri_p03_goals')return {data:goals};
  if(name==='sri_p03_goal_save'){goals=[{id:'2',scope:args.p_scope,target:args.p_target,effective:args.p_effective,percentage:args.p_percentage,target_name:'Toda a operação'},...goals];return {data:'2'};}
  return {data:[]};
 }
});
window.onerror=message=>document.body.dataset.error=String(message);
window.onunhandledrejection=event=>document.body.dataset.error=String(event.reason);
`;
const probe=`
(async()=>{
 await new Promise(resolve=>document.addEventListener('DOMContentLoaded',()=>setTimeout(resolve,25)));
 const panel=document.getElementById('sri-p03-integrated-reports');if(!panel)throw Error('Central ausente');
 const btn=text=>[...panel.querySelectorAll('button')].find(el=>el.textContent===text);
 await btn('Consultar').onclick();
 if(!panel.textContent.includes('Protocolos trabalhados2')||!panel.textContent.includes('Concluídos na ferramenta1'))throw Error('Deduplicação inconsistente');
 const kind=document.getElementById('sri-p03-report-kind');kind.value='goals';kind.dispatchEvent(new Event('change'));
 if(!panel.textContent.includes('50%')||!panel.textContent.includes('Atingida'))throw Error('Meta aprovada não calculada');
 await btn('Exportar Excel').onclick();if(window.exports.length!==1||window.exports[0][2][0].treated!==2)throw Error('Exportação divergente');
 kind.value='journey';kind.dispatchEvent(new Event('change'));const protocol=document.getElementById('sri-p03-report-protocol');protocol.value='P1';protocol.dispatchEvent(new Event('input'));
 if(panel.querySelector('tbody').textContent.includes('P2'))throw Error('Filtro não aplicado');
 window.sriP03GoalSettings(document.getElementById('v20-settings-body'));
 await new Promise(resolve=>setTimeout(resolve,20));
 const goalForm=document.querySelector('.sri-p03-goals-shared form'),percent=goalForm.querySelector('input[type=number]');percent.value='75';
 await goalForm.onsubmit({preventDefault(){}});if(goals.length!==2||!document.querySelector('.sri-p03-goals-shared').textContent.includes('versão anterior foi preservada'))throw Error('Versionamento de meta ausente');
 delay=true;const pending=btn('Consultar').onclick();await new Promise(resolve=>setTimeout(resolve,20));
 document.getElementById('sri-p03-report-from').value='2000-01-01';document.getElementById('sri-p03-report-from').dispatchEvent(new Event('change'));window.release();await pending;
 if(panel.textContent.includes('Atingida'))throw Error('Resposta antiga repovoou consulta');
 user={id:'operator',role:'operator'};handler('SIGNED_OUT');await new Promise(resolve=>setTimeout(resolve,20));
 if(document.getElementById('sri-p03-integrated-reports')||document.querySelector('.sri-p03-goals-shared'))throw Error('Dados não removidos após logout');
 document.body.dataset.reporting='PASS';
})().catch(error=>document.body.dataset.error=error.stack);
`;
const folder=mkdtempSync(join(tmpdir(),'sri-report-browser-')),fixture=join(folder,'fixture.html');
writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><section id="reports"></section><div id="v20-settings-body"></div><script>'+setup+'</script><script>'+source+'</script><script>'+probe+'</script>');
const chrome=process.env.CHROME_BIN||['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);assert.ok(chrome);
const dom=execFileSync(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--virtual-time-budget=2000','--user-data-dir='+join(folder,'profile'),'--dump-dom','file://'+fixture],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
assert.match(dom,/<body[^>]*data-reporting="PASS"/,dom.match(/data-error="([^"]*)/)?.[1]||'Fluxo incompleto');
assert.doesNotMatch(dom,/<body[^>]*data-error=/);
console.log('PASS: Chromium consultou relatórios, calculou meta diária, filtrou jornada, exportou o mesmo recorte, versionou meta e descartou respostas após mudança de data/logout.');
