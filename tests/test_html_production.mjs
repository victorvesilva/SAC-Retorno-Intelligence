import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const reports=fs.readFileSync(new URL('../sri-prd-painel.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../api/supabase-config.js',import.meta.url),'utf8');

assert.match(html,/<html lang="pt-BR">/);
assert.match(html,/<title>SAC Retorno Intelligence 2\.0 \| Plataforma Operacional<\/title>/);
assert.match(html,/<meta name="robots" content="noindex,nofollow"\/>/);
assert.doesNotMatch(html,/sri-deployment-banner|AMBIENTE DE PRODUÇÃO · ACESSO AUTENTICADO/);
assert.doesNotMatch(html,/LOGIN SUPABASE · DADOS LOCAIS · NÃO PRODUÇÃO/);
assert.doesNotMatch(html,/Resultados por equipe e operador aguardando apuração homologada/);
assert.match(html,/Nenhuma meta configurada\. Defina metas para iniciar o acompanhamento/);
assert.match(html,/meta\(s\) em rascunho neste navegador/);
assert.match(html,/Os rascunhos de metas são salvos apenas neste navegador/);
assert.match(html,/VERSÃO 2\.0 · PRODUÇÃO · AUTENTICAÇÃO CORPORATIVA/);
assert.match(html,/document\.body\.dataset\.sriVersion='sac-retorno-2\.0-prod-20261123'/);
assert.match(html,/src="\/sri-prd-painel\.js\?v=2\.0-prod-20261123"/);
assert.match(html,/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.119\.1/);
assert.match(html,/fetch\('\/api\/supabase-config',\{cache:'no-store'\}\)/);
assert.match(html,/window\.sriGetSupabaseClient/);
assert.match(html,/function seed\(\)\{return \{users:\[\],access:\[\]/);
assert.match(html,/if\(location\.protocol==='https:'\)throw Error\('Carga fictícia desabilitada/);
assert.match(html,/data-v20="loadSample" disabled/);
assert.match(html,/Cadastro local legado:/);
assert.match(html,/O encerramento dos protocolos permanece no SIGO/);
assert.doesNotMatch(html,/Gestor Demonstração|Supervisor Demonstração|Operador Demonstração|adm@teste\.local|supervisor@teste\.local|operador@teste\.local/);
assert.doesNotMatch(html,/ETAPA 2 · LOGIN SUPABASE · DADOS OPERACIONAIS AINDA LOCAIS/);
assert.doesNotMatch(html,/ETAPA 2 · AUTENTICAÇÃO SUPABASE · DADOS OPERACIONAIS DE TESTE/);
assert.doesNotMatch(html,/Não use dados reais antes da homologação de segurança e distribuição/);
assert.doesNotMatch(html,/\bsb_secret_[A-Za-z0-9_-]{10,}\b/);
assert.match(html,/rpc\('publish_daily_operator_tasks'/);
assert.match(html,/rpc\('record_daily_operator_treatment'/);
assert.match(html,/rpc\('sri_close_result_shift'/);
assert.match(reports,/sri_v_daily_operational_metrics/);
assert.match(reports,/@page\{size:A4 portrait/);
assert.match(config,/NEXT_PUBLIC_SUPABASE_URL/);
assert.match(config,/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
assert.doesNotMatch(config,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);

const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
assert.ok(inline.length>=5,'Os módulos JS internos devem estar presentes');
for(const [i,js] of inline.entries()){
 new vm.Script(js,{filename:'index-inline-'+i+'.js'});
}
new vm.Script(reports,{filename:'sri-prd-painel.js'});
console.log('PASS: HTML produção atualizado; sem demos iniciais; scripts válidos; relatórios, Supabase e controles preservados.');
