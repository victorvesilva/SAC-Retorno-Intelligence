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
assert.match(html,/Plataforma de inteligência operacional/);
assert.match(html,/document\.body\.dataset\.sriVersion='sac-retorno-2\.0-prod-20261123'/);
assert.match(html,/src="\/sri-prd-painel\.js\?v=2\.0-prod-20261123"/);
assert.match(html,/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.119\.1/);
assert.match(html,/fetch\('\/api\/supabase-config',\{cache:'no-store'\}\)/);
assert.match(html,/window\.sriGetSupabaseClient/);
assert.match(html,/function seed\(\)\{return \{users:\[\],access:\[\]/);
// Restaurar o snapshot ao abrir não equivale a executar nova apuração.
assert.match(html,/if\(!v42Restoring\)v2Toast\('Apuração concluída\. Painel atualizado\.'\)/);
assert.match(html,/if\(sriBootHasLocalCopy\)sriBootRecovery\.beginLocal\(\)/);
assert.match(html,/requestAnimationFrame\(\(\)=>setTimeout\(\(\)=>\{if\(sriBootHasLocalCopy\)void sriBootRecovery\.run\(\);else void v42RestoreSavedOnOpen\(\)\},0\)\)/);
assert.match(html,/if\(location\.protocol==='https:'\)throw Error\('Carga fictícia desabilitada/);
assert.match(html,/data-v20="loadSample" disabled/);
assert.match(html,/Cadastro local legado:/);
assert.match(html,/O SIGO permanece como sistema oficial dos protocolos/);
// Tela de acesso premium: logo do anexo, foto em HD, campos originais e versão móvel.
assert.ok(html.includes('href="/assets/login-refinado.css?v=2.0.4"'),'Login deve carregar o estilo atualizado');
assert.ok(html.includes('<span class="sri-login-version">SAC Retorno Intelligence</span>'),'O selo de login precisa conter somente o nome do produto');
assert.ok(!html.includes('<span class="sri-login-version">INTELLIGENCE 2.0</span>'),'O selo não pode mostrar a versão antiga');
const globalUiCss=fs.readFileSync(new URL('../assets/revisao-visual-integrada.css',import.meta.url),'utf8');
assert.ok(html.includes('href="/assets/revisao-visual-integrada.css?v=1.0.0"'),'Estilo de revisão integrada deve estar ativo');
assert.ok(html.indexOf('refinamento-bases-qualidade-etapa4.css?v=1.0.0') < html.indexOf('revisao-visual-integrada.css?v=1.0.0'),'A revisão global deve carregar após a etapa 4');
for(const selector of ['.v5-app .main','.v5-app .topbar','.v5-app #global-controls','.v5-app #distribution .dist-table','.v5-app #v20-closure .v20-controls','.v5-app #v20-settings .v20-row']){
 assert.ok(globalUiCss.includes(selector),'Regra visual geral ausente: '+selector);
}
assert.equal(globalUiCss.split('{').length,globalUiCss.split('}').length,'CSS global deve estar balanceado');
assert.ok(!globalUiCss.includes('#v20-login'),'CSS transversal não pode modificar login');
assert.ok(!globalUiCss.includes('.v51-pdf-page'),'CSS transversal não pode modificar PDF');

const visualCss=fs.readFileSync(new URL('../assets/gestao-operacional-refinado.css',import.meta.url),'utf8');
assert.ok(html.includes('href="/assets/gestao-operacional-refinado.css?v=1.0.0"'),'Folha de estilo operacional deve ser carregada');
const riskHeading=html.indexOf('class="go-section-title go-attention-heading"');
const compositionHeading=html.indexOf('class="go-section-title go-composition-heading"');
assert.ok(riskHeading>0&&compositionHeading>riskHeading,'Os riscos precisam aparecer antes da composição da carteira');
assert.equal(html.split('id="go-focus"').length-1,1,'Painel de atenção não pode ser duplicado');
assert.ok(visualCss.includes('#overview .go-focus-item'),'Estilos da atenção operacional não encontrados');
assert.ok(visualCss.includes('#distribution .dist-table'),'Estilos das tabelas não encontrados');
assert.ok(visualCss.includes('@media screen and (max-width:620px)'),'Ajustes móveis não encontrados');
assert.ok(!visualCss.includes('#v20-login')&&!visualCss.includes('.sri-login-'),'O refinamento visual não pode alterar o login');
assert.equal(visualCss.split('{').length,visualCss.split('}').length,'Blocos CSS devem estar balanceados');

const visualV2Css=fs.readFileSync(new URL('../assets/refinamento-operacional-etapa2.css',import.meta.url),'utf8');
assert.ok(html.includes('href="/assets/refinamento-operacional-etapa2.css?v=1.0.0"'),'Refinamento visual etapa 2 precisa estar ativo');
assert.ok(html.indexOf('gestao-operacional-refinado.css?v=1.0.0')<html.indexOf('refinamento-operacional-etapa2.css?v=1.0.0'),'A etapa 2 deve carregar depois da etapa 1');
assert.ok(html.includes('Organize a carteira, acompanhe os responsáveis e distribua demandas com segurança.'),'Descrição da tela de distribuição deve ser exibida');
for(const selector of ['#nav .v20-nav-group-title','#nav .v20-nav-entry.active','#distribution .dist-kpi','#distribution .dist-filter-group','#distribution #v199-launch','#priorities .v3-controls','#agents .v3-table']){
  assert.ok(visualV2Css.includes(selector),'Faltando refinamento de '+selector);
}
assert.ok(!visualV2Css.includes('#v20-login')&&!visualV2Css.includes('.sri-login-'),'O CSS operacional não deve alterar o login');
assert.ok(!visualV2Css.includes('!important;display:none'),'O CSS operacional não deve suprimir elementos do sistema');
assert.equal(visualV2Css.split('{').length,visualV2Css.split('}').length,'Blocos CSS da etapa 2 devem estar balanceados');

const visualV3Css=fs.readFileSync(new URL('../assets/refinamento-analitico-relatorios-etapa3.css',import.meta.url),'utf8');
const visualLinks=['gestao-operacional-refinado.css?v=1.0.0','refinamento-operacional-etapa2.css?v=1.0.0','refinamento-analitico-relatorios-etapa3.css?v=1.0.0'];
for(const ref of visualLinks)assert.ok(html.includes('/assets/'+ref),'CSS de refinamento não carregado: '+ref);
assert.ok(html.indexOf(visualLinks[0])<html.indexOf(visualLinks[1])&&html.indexOf(visualLinks[1])<html.indexOf(visualLinks[2]),'A ordem de cascata visual deve permanecer 1, 2, 3');
assert.equal(html.split('class="v49-kpi-gap"').length-1,1,'Espaçamento da área analítica deve ter um único marcador');
for(const id of ['intelligence','v49-pane-bko','v49-pane-evolucao','v49-pane-comparativo','bko-kpis','bko-bars','v49-compare-chart','reports','v55-report-kinds','v55-source','v55-history-fields','v55-extraction-meta','v55-generate','v194-from-reports'])
 assert.ok(html.includes('id="'+id+'"'),'Controle analítico/relatório ausente: '+id);
for(const selector of ['#intelligence .v49-tabs','#intelligence .v2-kpi','#intelligence :is(.v3-controls,.v49-compare-filters)','#reports .v55-shell','#reports .v55-report-option','#reports #v55-generate'])
 assert.ok(visualV3Css.includes(selector),'Refinamento de apresentação ausente: '+selector);
assert.equal(visualV3Css.split('{').length,visualV3Css.split('}').length,'Blocos CSS da etapa 3 devem estar balanceados');
assert.ok(!visualV3Css.includes('#v20-login')&&!visualV3Css.includes('.sri-login-'),'A etapa 3 não pode alterar a autenticação');
assert.ok(!visualV3Css.includes('.v55-pdf-source')&&!visualV3Css.includes('.v51-pdf-page'),'A etapa 3 não pode alterar o conteúdo impresso de PDFs');

const visualV4Css=fs.readFileSync(new URL('../assets/refinamento-bases-qualidade-etapa4.css',import.meta.url),'utf8');
const styleV4='refinamento-bases-qualidade-etapa4.css?v=1.0.0';
assert.ok(html.includes('/assets/'+styleV4),'CSS visual de Base e Qualidade deve estar carregado');
assert.ok(html.indexOf(visualLinks[2])<html.indexOf(styleV4),'CSS etapa 4 deve carregar após a etapa 3');
for(const id of ['import','details','file-sac','file-ativo','process-btn','progress-box','v57-last-import','v195-open','v42-vault','v42-backup-all','v42-restore-all','v42-forget-current','v46-pane-records','v46-pane-quality','v46-pane-reconcile','search-record','details-body','v57-audit-body','v3-advanced-checks','v195-file','v195-import','v195-duplicate-body']){
  assert.ok(html.includes('id="'+id+'"'),'Elemento de dados/importação ausente: '+id);
}
for(const target of ['#import .source-unified','#import .source-upload .dropzone','#import #process-btn','#import .v42-vault','#details .v46-subtab','#details .data-table','#details #v46-pane-reconcile .v195-header']){
  assert.ok(visualV4Css.includes(target),'Refinamento visual de dados não encontrado: '+target);
}
assert.equal(visualV4Css.split('{').length,visualV4Css.split('}').length,'Blocos CSS da etapa 4 devem estar balanceados');
assert.ok(!visualV4Css.includes('#v20-login')&&!visualV4Css.includes('.sri-login-'),'Estilos de Base e Qualidade não devem modificar login');
assert.ok(!visualV4Css.includes('.v55-pdf-source')&&!visualV4Css.includes('.v51-pdf-page'),'Estilos de Base e Qualidade não devem modificar PDFs');




assert.match(html,/src="\/assets\/foto-atendimento-hd\.webp"/);
assert.match(html,/src="\/assets\/hapvida-logo\.svg"/);
assert.match(html,/class="v20-login-wrap sri-login-v3"/);
assert.match(html,/class="sri-login-photo"/);
assert.match(html,/class="sri-login-main"/);
assert.match(html,/Bem-vindo de volta\./);
assert.match(html,/Crie sua conta\./);
assert.match(html,/id="sri-login-description"/);
assert.match(html,/Mais resolutividade\./);
assert.match(html,/id="v20-login-form"/);
assert.match(html,/id="v20-email"/);
assert.match(html,/id="v20-pass"/);
assert.match(html,/id="v20-show-pass"/);
assert.match(html,/id="sri-auth-switch"/);
assert.match(html,/id="sri-auth-submit"/);
assert.match(html,/id="sri-signup-fields"/);
assert.match(html,/id="v20-login-error"/);
assert.match(html,/id="sri-auth-info"/);
assert.doesNotMatch(html,/id="sri-login-humanizado-20261123"|id="sri-login-logo"/);
const loginIndex=html.indexOf('<div aria-labelledby="v20-login-title"');
const endIndex=html.indexOf('</main></div>',loginIndex);
assert.ok(loginIndex>0&&endIndex>loginIndex,'Bloco de login não localizado');
const loginBlock=html.slice(loginIndex,endIndex);
assert.equal((loginBlock.match(/src="\/assets\/hapvida-logo\.svg"/g)||[]).length,1,'Uma única logo Hapvida no login');
assert.doesNotMatch(loginBlock,/NotreDame|Intermédica/i);
const photo=fs.readFileSync(new URL('../assets/foto-atendimento-hd.webp',import.meta.url));
assert.ok(photo.length>45000&&photo.length<200000,'Foto deve preservar alta definição e ser otimizada');
assert.equal(photo.toString('ascii',0,4),'RIFF');
assert.equal(photo.toString('ascii',8,12),'WEBP');
const logo=fs.readFileSync(new URL('../assets/hapvida-logo.svg',import.meta.url),'utf8');
assert.match(logo,/<svg/);
assert.match(logo,/viewBox="0 0 945 224"/);
assert.match(logo,/<path fill="#0B459F"/);
const css=fs.readFileSync(new URL('../assets/login-refinado.css',import.meta.url),'utf8');
assert.match(css,/#v20-login \.v20-login-wrap\.sri-login-v3/);
assert.match(css,/@media\(max-width:820px\)/);
assert.match(css,/\.sri-login-photo \{ display:none; \}/);

const operationFn=html.match(/function sriOperationLabel\(name\)\{[\s\S]*?\n  \}/);
assert.ok(operationFn,'Tradutor de nomes de operações não localizado');
const operationLabel=vm.runInNewContext('('+operationFn[0]+')');
assert.equal(operationLabel('R1'),'Manhã');
assert.equal(operationLabel('r2'),'Tarde');
assert.equal(operationLabel(' R1 '),'Manhã');
assert.equal(operationLabel('Outra Operação'),'Outra Operação');
assert.match(html,/const team=null,\{day,shift\}=syncShift\(\)/,'Publicação sem seleção de equipe');
assert.match(html,/ctx\.teams\.filter\(t=>t\.operation_id===(?:op|operation)\)/);
assert.doesNotMatch(html,/Gestor Demonstração|Supervisor Demonstração|Operador Demonstração|adm@teste\.local|supervisor@teste\.local|operador@teste\.local/);
assert.doesNotMatch(html,/ETAPA 2 · LOGIN SUPABASE · DADOS OPERACIONAIS AINDA LOCAIS/);
assert.doesNotMatch(html,/ETAPA 2 · AUTENTICAÇÃO SUPABASE · DADOS OPERACIONAIS DE TESTE/);
assert.doesNotMatch(html,/Não use dados reais antes da homologação de segurança e distribuição/);
assert.doesNotMatch(html,/\bsb_secret_[A-Za-z0-9_-]{10,}\b/);
assert.match(html,/rpc\('publish_general_operator_tasks'/);
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
