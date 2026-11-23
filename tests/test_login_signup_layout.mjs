import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const base = fileURLToPath(new URL('../', import.meta.url));
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(base, 'assets/login-refinado.css'), 'utf8');
assert.match(css, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
assert.match(css, /overflow-y:auto/);
assert.match(css, /#v20-login\.sri-signup-open/);
assert.match(css, /@media\(max-width:820px\)/);
assert.match(html, /classList\.toggle\('sri-signup-open',sriRegisterMode\)/);
assert.match(html, /'Crie sua conta\.'/);

const start = html.indexOf('<div aria-labelledby="v20-login-title"');
const end = html.indexOf('\n</main></div>', start);
assert.ok(start > 0 && end > start, 'A estrutura de login deve estar intacta');
const markup = html.slice(start, end);
const fnStart = html.indexOf('function sriToggleSignup(value){');
const fnEnd = html.indexOf('async function sriAuthorizeUser(', fnStart);
assert.ok(fnStart > 0 && fnEnd > fnStart, 'Handler real do cadastro não localizado');
const toggle = html.slice(fnStart, fnEnd);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sri-login-signup-'));
const fixture = path.join(tmp, 'signup-fixture.html');
const chrome = process.env.CHROME_BIN ||
  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(x => fs.existsSync(x));
assert.ok(chrome, 'Chrome/Chromium deve existir no ambiente de testes');

function probe() {
 const $ = id => document.getElementById(id);
 function box(el) {
  const r = el.getBoundingClientRect();
  return { top:r.top, bottom:r.bottom, width:r.width, height:r.height };
 }
 function snap() {
  const root = $('v20-login'), card = root.querySelector('.v20-login-wrap'),
    photo = root.querySelector('.sri-login-photo'), form = $('v20-login-form');
  return {
   width:window.innerWidth, height:window.innerHeight,
   card:box(card), photo:box(photo), photoDisplay:getComputedStyle(photo).display,
   form: { ...box(form), clientHeight:form.clientHeight, scrollHeight:form.scrollHeight, scrollTop:form.scrollTop },
   root:{ scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,scrollHeight:root.scrollHeight },
   title:$('v20-login-title').textContent,
   signupHidden:$('sri-signup-fields').hidden,
   signupClass:root.classList.contains('sri-signup-open'),brandLoaded:root.querySelector('.sri-login-hapvida-img').complete&&root.querySelector('.sri-login-hapvida-img').naturalWidth>0,photoLoaded:root.querySelector('.sri-login-photo img').complete&&root.querySelector('.sri-login-photo img').naturalWidth>0
  };
 }
 const login = snap();
 sriToggleSignup(true);
 const signup = snap();
 const form = $('v20-login-form');
 form.scrollTop=form.scrollHeight;
 const endOfForm = { button:box($('sri-auth-switch')),form:box(form),scrollTop:form.scrollTop };
 sriToggleSignup(false);
 const restored = snap();
 if(location.search.includes('signup=1')) sriToggleSignup(true);
 const output = {login,signup,endOfForm,restored};
 const node = document.createElement('pre');
 node.id='sri-login-test-result';node.textContent=JSON.stringify(output);document.body.appendChild(node);
 node.hidden=true;
}
const withLocalAssets = markup
 .replace('src="/assets/foto-atendimento-hd.webp"', 'src="file://' + path.join(base,'assets/foto-atendimento-hd.webp') + '"')
 .replace('src="/assets/hapvida-logo.svg"', 'src="file://' + path.join(base,'assets/hapvida-logo.svg') + '"');
const fixtureHtml =
'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>' +
'<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%;}</style><style>' +
css + '</style></head><body>' + withLocalAssets +
'<script>let sriRegisterMode=false; const $=id=>document.getElementById(id);' +
toggle + ';(' + probe.toString() + ')();</script></body></html>';
fs.writeFileSync(fixture, fixtureHtml, 'utf8');
const sizes = [[1440,900],[1440,690],[1024,768],[800,690],[390,844],[390,640]];
for (const [width,height] of sizes) {
 const dom = execFileSync(chrome, [
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--allow-file-access-from-files',
  '--force-device-scale-factor=1',
  '--window-size='+width+','+height,
  '--user-data-dir='+path.join(tmp, 'profile-'+width+'-'+height),
  '--dump-dom','file://'+fixture
 ], { encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe'] });
 const match = dom.match(/<pre id="sri-login-test-result"[^>]*>([\s\S]*?)<\/pre>/);
 assert.ok(match,'Chromium não executou o teste de layout '+width+'x'+height);
 const result = JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
 const {login,signup,restored,endOfForm}=result;
 const mobile=signup.width<=820;
 assert.equal(signup.signupClass,true);
 assert.equal(signup.signupHidden,false);
 assert.equal(signup.title,'Crie sua conta.');
 assert.equal(restored.title,'Bem-vindo de volta.');
 assert.equal(restored.signupHidden,true);
 assert.equal(restored.signupClass,false);
 assert.ok(signup.brandLoaded,'Logo oficial não carregou: '+width+'x'+height);
 assert.ok(signup.photoLoaded,'Foto HD não carregou: '+width+'x'+height);
 assert.ok(signup.card.top>=-1,'A borda superior não pode ficar cortada: '+width+'x'+height+' top='+signup.card.top);
 assert.ok(signup.root.scrollWidth<=signup.root.clientWidth+3,'Não pode haver rolagem horizontal '+width+'x'+height);
 if(!mobile) {
  assert.notEqual(signup.photoDisplay,'none');
  assert.ok(Math.abs(signup.card.height-login.card.height)<3,'Cadastro estica o card '+width+'x'+height);
  assert.ok(Math.abs(signup.photo.height-login.photo.height)<3,'Cadastro estica foto '+width+'x'+height);
  assert.ok(signup.form.scrollHeight>=signup.form.clientHeight,'Formulário precisa poder rolar');
  assert.ok(endOfForm.button.bottom<=endOfForm.form.bottom+4,
    'Botão de cadastro inacessível após rolagem: '+width+'x'+height);
 } else {
  assert.equal(signup.photoDisplay,'none','Mobile prioriza o formulário');
  assert.ok(signup.card.width<=signup.width,'Cartão móvel ultrapassou a largura');
 }
 console.log('PASS login/cadastro',width+'x'+height,
  mobile?'mobile':'desktop',
  'card='+Math.round(signup.card.height)+'px',
  'foto='+Math.round(signup.photo.height)+'px',
  'form='+signup.form.clientHeight+'/'+signup.form.scrollHeight+'px');
}
if(process.env.SRI_CAPTURE_LOGIN_SCREENSHOT==='1'){
 for(const [width,height] of [[1440,900],[390,844]]) {
  const output = path.join(base,'.tmp','login-signup-'+width+'.png');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  execFileSync(chrome,[
   '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
   '--disable-background-networking','--allow-file-access-from-files',
   '--force-device-scale-factor=1','--window-size='+width+','+height,
   '--user-data-dir='+path.join(tmp,'shot-'+width),
   '--screenshot='+output,'file://'+fixture+'?signup=1'
  ],{timeout:45000,stdio:['ignore','pipe','pipe']});
  assert.ok(fs.statSync(output).size>4000,'Screenshot do cadastro deve ser gerada');
  console.log('SCREENSHOT',output);
 }
}
console.log('PASS: alternância Entrar/Criar conta sem esticar a imagem e sem cortar formulário.');
