import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const match=html.match(/<script id="sri-prd-first-start-reset">([\s\S]*?)<\/script>/);
assert.ok(match,'Rotina de limpeza local obrigatória antes da aplicação');
assert.ok(html.indexOf(match[0])<html.indexOf('</head>'),'A limpeza precisa ocorrer antes do carregamento da página');
assert.ok(html.indexOf(match[0])<html.indexOf('const V2_STORE_HISTORY'),'Limpeza deve anteceder a restauração das bases');

function storage(initial={}){
 const map=new Map(Object.entries(initial));
 return {get length(){return map.size},key:i=>[...map.keys()][i]??null,
  getItem:k=>map.has(k)?map.get(k):null,
  setItem:(k,v)=>{map.set(k,String(v))},removeItem:k=>{map.delete(k)},
  snapshot:()=>Object.fromEntries(map)};
}
const authToken='{"access_token":"USER_SESSION_STAYS"}';
const local=storage({
 'sri_v42_latest_gzip_v1':'old-SAC-ATIVO',
 'sri_v42_last_protocols_v1':'previous protocols',
 'sac-pulse-distribution-v1':'old distribution',
 'sac_pulse_v2_fotos_agregadas':'old history',
 'sacpulse_v3_favoritos':'previous filters',
 'sac20-etapa2-auth-local-v1':'legacy local accounts',
 'sac_retorno_intelligence_v5_menu':'collapsed',
 'sac-intelligence-tratativas-history-v47':'previous notes',
 'sri_cloud_shared_digest_v1':'previous hash',
 'sb-djjgvvzmopehatdsnlnd-auth-token':authToken,
 'other-application':'keep'
});
const sess=storage({'sri_local_run':'old','sb-login-token':'keep-session'});
const errors=[];
const ctx={window:{localStorage:local,sessionStorage:sess},console:{warn:(...x)=>errors.push(x)}};
vm.runInNewContext(match[1],ctx);
const after=local.snapshot();
assert.equal(after['sri_prd_cutover_epoch'],'PRD_2026_11_23_INITIAL_START_V1');
for(const key of ['sri_v42_latest_gzip_v1','sac-pulse-distribution-v1','sac_pulse_v2_fotos_agregadas','sac20-etapa2-auth-local-v1','sac_retorno_intelligence_v5_menu','sri_cloud_shared_digest_v1'])
 assert.equal(after[key],undefined,'Dado local antigo não removido: '+key);
assert.equal(after['sb-djjgvvzmopehatdsnlnd-auth-token'],authToken,'Autenticação do Supabase jamais removida');
assert.equal(after['other-application'],'keep','Outras aplicações não podem ser afetadas');
assert.equal(sess.getItem('sri_local_run'),null);
assert.equal(sess.getItem('sb-login-token'),'keep-session');
local.setItem('sri_v42_latest_gzip_v1','new-live-PRODUCTION');
vm.runInNewContext(match[1],ctx);
assert.equal(local.getItem('sri_v42_latest_gzip_v1'),'new-live-PRODUCTION','A limpeza não pode se repetir e apagar dados novos');
assert.deepEqual(errors,[]);
console.log('PASS: cutover PRD apaga somente dados locais do Intelligence uma vez, preserva  login Supabase e novas importações.');
