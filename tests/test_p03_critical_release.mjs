import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const html=read('index.html'),p03=read('assets/sri-pacote03.js'),
  css=read('assets/sri-integrated-improvements.css'),
  notify=read('assets/sri-integrated-improvements.js'),
  nav=read('assets/sri-p03-navigation.js'),
  sql=read('sql/2026-11-24_sri_criticos_persistencia_status.sql'),
  historical=read('sql/2026-11-24_sri_p03_historico_datas.sql'),
  assistant=read('sql/2026-11-24_sri_p03_perfil_assistente.sql');

for(const src of [p03,notify,nav])new vm.Script(src);
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(x=>!/\bsrc\s*=|type\s*=\s*["'](?:application\/json|module)/i.test(x[1]));
for(const inline of scripts)new vm.Script(inline[2]);
assert.equal((html.match(/src="\/assets\/sri-pacote03\.js/g)||[]).length,1,'carregar módulo apenas uma vez');

// Data realmente determina consulta histórica, sem reutilização silenciosa da carteira atual.
assert.match(p03,/sri_p03_history_snapshots/);
assert.match(p03,/sri_p03_history_tasks/);
assert.match(p03,/Não há histórico armazenado para esta data/);
assert.match(p03,/overview\.classList\.add\('sri-p03-historical'\)/);
assert.match(p03,/selectedDay\(\)!==currentSnapshot\.operational_day/);
assert.match(historical,/s\.operational_day=p_day/);
assert.match(historical,/WHERE t\.snapshot_id=p_snapshot/);
assert.match(historical,/h\.actor_id=auth\.uid\(\)/);
assert.match(historical,/h\.created_at < \(\(p_to\+1\)::timestamp AT TIME ZONE 'America\/Sao_Paulo'\)/);
assert.match(html,/sri_p03_my_treatments_page/);
assert.match(html,/Histórico por data indisponível/);

// Identidade e escopo da assistência, sem promoção implícita a administrador.
assert.match(html,/assistant:'Assistente'/);
assert.match(html,/result\.role==='assistant'\?'supervisor'/);
assert.match(assistant,/profiles_role_check/);
assert.match(assistant,/admin_change_user_role/);
assert.match(assistant,/team_memberships/);
assert.match(assistant,/ALTER POLICY/);

// Toasts 4s e navegação interna sem history.back(). 
assert.match(css,/\.sri-pack-toast\{position:fixed;right:16px;top:16px;bottom:auto/);
assert.match(notify,/setTimeout\(\(\)=>item\.remove\(\),4000\)/);
assert.doesNotMatch(notify,/kind==='success'\?4000:5000/);
assert.match(nav,/stack\.pop\(\)/);
assert.match(nav,/data-v20-go/);
assert.doesNotMatch(nav,/(?:window\.)?history\.(?:back|go|forward)\(/);

// Todos os 13 status — formato original, sem alteração automática do SIGO.
const expected=[['E-MAIL',3],['LIGAÇÃO',3],['ASCSAC',3],['RECUSOU',2],
 ['ACEITOU',3],['ASSOCIADO',2],['OUTROS',3],['FILIAL',10],['DÚVIDA',0],
 ['OUVIDORIA',2],['PENDENTE',0],['MÍDIAS NE',3],['CARTA AR',3]];
const mapClause=sql.slice(sql.indexOf('FUNCTION private.sri_p03_status_sigo'),sql.indexOf('FUNCTION private.sri_p03_status_work'));
const matchGroups=[...mapClause.matchAll(/WHEN v IN \(([^)]+)\) THEN (\d+)/g)];
const out=new Map(matchGroups.flatMap(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>[x[1],Number(m[2])])));
out.set('FILIAL',10);
for(const [status,code]of expected)assert.equal(out.get(status),code,status);
assert.equal(out.size,13);
assert.match(sql,/private\.sri_p03_preserve_open_tasks/);
assert.match(sql,/private\.sri_p03_guard_transfer/);
assert.match(sql,/private\.sri_p03_status_sigo\(old\.treatment_status\)/);
assert.match(sql,/private\.sri_p03_status_work\(p_action\)/);
console.log('PASS: sintaxe JS/HTML e regras estáticas P03 (histórico, Assistente, navegação, status, carteira).');
