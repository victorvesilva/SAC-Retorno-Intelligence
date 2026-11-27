import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../assets/sri-p03-navigation.js',import.meta.url),'utf8');
const fixture=mkdtempSync(join(tmpdir(),'sri-p03-navigation-'));
const file=join(fixture,'navigation.html');
const markup='<header><div class="v5-top-identity"><div><div>SAC Retorno Intelligence</div><div id="v5-active-context">Carteira por Operador</div></div></div></header><main><button data-tab="overview">A</button><button data-tab="details">B</button><button data-tab="reports">C</button><section id="overview" class="tab-content active"><input id="filter-a" type="search"></section><section id="details" class="tab-content"><form><input id="edit"></form></section><section id="reports" class="tab-content"></section></main>';
const dispatcher=String.raw`
document.body.dataset.v20Role='admin';
window.onerror=message=>document.body.dataset.error=message;
window.onunhandledrejection=event=>document.body.dataset.error=String(event.reason);
document.addEventListener('click',event=>{
 const route=event.target.closest('[data-tab]');if(!route)return;
 document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('active',el.id===route.dataset.tab));
});
`;
const probe=String.raw`
const click=id=>document.querySelector('[data-tab="'+id+'"]').click();
const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
(async()=>{
 if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
 document.getElementById('filter-a').value='consulta A';
 click('details');await wait();click('reports');await wait();
 const back=document.getElementById('sri-p03-back');
 if(back.parentElement!==document.querySelector('.v5-top-identity'))throw Error('Voltar deve ficar ao lado do título no cabeçalho');
 if(back.nextElementSibling!==document.getElementById('v5-active-context').parentElement)throw Error('Voltar deve preceder o título');
 if(back.getAttribute('aria-label')!=='Voltar à última categoria visitada')throw Error('Voltar precisa de nome acessível');

 back.click();await wait();
 if(!document.getElementById('details').classList.contains('active'))throw Error('C não retornou a B');
 const edit=document.getElementById('edit');edit.value='alteração pendente';edit.dispatchEvent(new Event('input',{bubbles:true}));
 window.confirm=()=>false;
 click('overview');await wait();
 if(!document.getElementById('details').classList.contains('active')||edit.value!=='alteração pendente')throw Error('Cancelamento de navegação perdeu o formulário');
 back.click();await wait();
 if(!document.getElementById('details').classList.contains('active'))throw Error('Voltar ignorou alterações não salvas');
 window.confirm=()=>true;
 back.click();await wait();
 if(!document.getElementById('overview').classList.contains('active'))throw Error('B não retornou a A');
 if(document.getElementById('filter-a').value!=='consulta A')throw Error('Filtro de origem perdido');
 click('reports');await wait();
 document.body.dataset.v20Role='supervisor';await wait();
 if(!back.disabled)throw Error('Troca de perfil manteve histórico');
 document.body.classList.add('v20-not-logged');await wait();
 if(!back.disabled)throw Error('Logout manteve histórico');
 document.body.dataset.result='PASS';
})();
`;
writeFileSync(file,'<!doctype html><meta charset="utf-8">'+markup+'<script>'+dispatcher+'</script><script>'+source+'</script><script>'+probe+'</script>');
const chrome=process.env.CHROME_BIN||['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(chrome);
const dom=execFileSync(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--virtual-time-budget=1200','--user-data-dir='+join(fixture,'profile'),'--dump-dom','file://'+file],{encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
assert.match(dom,/<body[^>]*data-result="PASS"/);
assert.doesNotMatch(dom,/<body[^>]*data-error=/);
console.log('PASS: Voltar A/B/C, cancelamento de saída, preservação de formulário e filtro, troca de perfil e logout.');
