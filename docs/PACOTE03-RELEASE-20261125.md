# Pacote 03 — release consolidada de 25/11/2026

O desenvolvimento foi consolidado na branch `feat/pacote-03-integridade-monitoramento-20261124`, no PR #42. A matriz `PACOTE03-MATRIZ-125-20261125.csv` confronta individualmente as 120 MEL-071–190 e as cinco prioridades #37–41 com a implementação e suas evidências. A verificação combina testes funcionais em navegador, integração em PostgreSQL, regressão e inspeção. Os níveis de evidência estão indicados por item; a matriz não representa 125 jornadas independentes executadas em produção.

## Regras esclarecidas pelo solicitante

- Reabertura de protocolo concluído: somente Administrador/Gestor, com justificativa obrigatória, por encerramento indevido do operador. A carteira concluída é somente leitura. Chamadas antigas de tratativa e alterações diretas não podem reabrir o protocolo.
- Meta vigente neste pacote: percentual de protocolos concluídos na ferramenta sobre os protocolos distintos trabalhados naquele dia. Usa a última tratativa do protocolo no dia e desconta reabertura posterior no mesmo recorte. Dias sem trabalho não recebem percentual fictício. Metas de movimentação e retrabalho foram expressamente adiadas para implementação futura com a gestão.
- Concluído na ferramenta não equivale a resolução confirmada no SIGO. A matriz oficial de 13 status mantém separados status de origem, tratativa e `work_status`.
- A publicação deve ser consolidada no menor número de deployments. Nenhuma branch ou preview novo foi criado para a homologação.

## Resultado implementado

Base/Área acompanham a fonte persistida, a distribuição, a carteira, o modal e o contexto histórico. Dados ausentes/conflitantes são sinalizados e não inventados. A importação seguinte mantém metadados comprovados e pendências existentes.

Carteiras têm filtros combinados, atalhos, favoritos por conta/equipe, colunas, paginação, densidade, cabeçalho fixo, ordenação e avanço pela ordem filtrada. A consulta por cursor foi validada com 4.201 tarefas ativas e um concluído adicional. Concluídos permanecem somente leitura no dia e ficam no histórico no dia seguinte. Reimportação, turno e transporte de carteira preservam autoria e estados, sem criar tratativas fictícias.

Históricos usam eventos e versões imutáveis desde a instalação. Meu Histórico agrupa protocolos e oferece linha do tempo, log e calendário próprio. Gestão Operacional consulta a data/turno escolhidos e descarta respostas atrasadas. Histórico gerencial registra anterior/novo, autoria/perfil e origem, com acesso por equipe. Contextos que não foram capturados antes da instalação continuam explicitamente ausentes.

Console exclusivo do Administrador tem captura automática de erros JavaScript/promessas, falhas RPC/PostgREST, códigos técnicos sanitizados, níveis, período/responsável/módulo, métricas reais de duração RPC, agrupamento com ocorrências individuais, incidentes com transições/CAS, alerta interno FATAL e exportações. Ocorrências geradas por auditoria possuem vínculo real para a movimentação correspondente. Mensagens, argumentos, respostas, URLs e segredos não são enviados à telemetria. Não há expurgo automático de logs.

Relatórios por período integram atribuições, tratativas, importações, conciliações, fechamentos e auditoria. Incluem Resumo Executivo, desempenho por equipe, produtividade por operador, metas/resultados diários, evolução, SLA/criticidade, jornada, importações e auditoria. Tabelas, gráficos, comparação de períodos e exportações compartilham os filtros e o mesmo modelo de contagem. Metas publicadas são compartilhadas, versionadas e protegidas por equipe e concorrência. Rascunhos locais anteriores continuam preservados.

Os gráficos existentes foram mantidos e organizados em quatro grupos. Há detalhamento, exportação individual em PDF com contexto, série diária, composição por status, evolução das extrações e indicadores de conciliação/reabertura. O tema claro obrigatório permanece ativo; estilos de compatibilidade não reativam modo escuro.

O cache operacional passou a ser separado por conta. Cópias legadas sem proprietário permanecem intactas e são recuperáveis por Administrador/Gestor. Respostas antigas são descartadas após troca de identidade; a nova sessão não reutiliza memória da conta anterior.

## Evidências técnicas

- Esquema de teste reconstruído das definições do projeto conectado: 31 tabelas, 82 funções, constraints, triggers, RLS e grants. Dados inteiramente sintéticos. As 82 definições de funções conferiram com produção, sem divergências. A 83ª função existente de manutenção específica foi excluída da fixture e não é alterada pelo pacote.
- Integração testa os seis perfis: Operador, Viewer, Supervisor, Assistente, Gestor e Administrador. Inclui acesso próprio/equipe/outra equipe, console administrativo, publicação, autoria, tratamento idempotente, conclusão, continuidade, reabertura, imutabilidade, metas e concorrência.
- Relatórios recuperaram 450 eventos por paginação sem perda/duplicidade. Modelo gerencial validado com 12.000 eventos, incluindo repetição de atuação, protocolo compartilhado, reabertura, vigência/precedência de metas, nota legada e ausência de denominador.
- O pacote SQL completo foi executado e reaplicado no PostgreSQL de teste sem modificar quantidade nem conteúdo de registros existentes. Uma adulteração proposital foi detectada pelo hash e a transação revertida.
- Chromium executa filtros, favoritos, colunas, cabeçalho durante rolagem, históricos, calendário, console, ocorrências, reabertura, gráficos, relatórios, metas, exportação do recorte, navegação, formulário não salvo e troca de sessão.
- Regressão inclui sintaxe de todos os scripts, autenticação/cadastro, distribuição, horários/fechamento, CSV, sincronização, contingência, layouts e PDFs A4.
- CI anterior já verde em `45617613758` para `cada475`. A publicação deve usar somente o SHA final com a execução final verde. Evidências finais serão entregues junto da identificação do deployment.

## Instalação atômica e integridade

Aplicar **somente** `sql/2026-11-25_sri_p03_release_integral.sql`, gerado por `python tools/build_p03_release.py`. O manifesto `PACOTE03-MANIFESTO-20261125.json` registra ordem e SHA-256 dos 20 arquivos fonte. Não aplicar também os arquivos individuais após o pacote.

O bundle usa uma única transação, timeout de lock e verificação de integridade dentro do PostgreSQL. Registra quantidade e hash do conjunto de colunas original de cada tabela pública/privada, mantém os dados estáveis durante a instalação e compara novamente antes do commit. Qualquer diferença aborta toda a transação. Colunas novas são aditivas e não são confundidas com alteração dos valores anteriores.

As migrações não realizam correções retroativas de protocolos/tratativas. Novos contextos, versões, ocorrências e vínculos começam na instalação. Não há exclusão, recriação de carteiras nem backfill inventado de estados antigos.

O solicitante autorizou explicitamente uma cópia privada de perfis, protocolos, carteiras, tratativas, auditoria e apurações em `/workspace/.secure/sri-p03-backup`, fora do Git. Foram copiados 31 conjuntos de tabelas operacionais e seis payloads compactados. Os seis payloads conferiram em tamanho, MD5 de origem, SHA-256 local e descompactação JSON. A cópia contém 121 tarefas, 42 tratativas, 79 eventos de auditoria e seis distribuições. Diretórios têm permissão 0700 e arquivos 0600. Isso é uma cópia operacional, sem credenciais de autenticação, e não uma imagem física/PITR do banco.

## Segurança e ressalvas operacionais

RLS e grants das novas tabelas privadas são restritivos. RPCs validam perfil/escopo no servidor. Supervisor e Assistente têm as mesmas permissões, sem funções exclusivas de Gestor/Administrador. Apuração geral compactada sem recorte de equipe só pode ser lida por seu importador ou por Gestor/Administrador; carteiras/históricos gerenciais permanecem acessíveis pelo recorte de equipe. Essa restrição evita transportar payload de outra equipe para o navegador.

Os avisos preexistentes do Supabase incluem funções `SECURITY DEFINER` acessíveis a `authenticated`, tabelas privadas seladas sem policies e proteção contra senhas vazadas desabilitada. Funções públicas necessárias não são revogadas indiscriminadamente; as novas RPCs usam guardas explícitas de papel e escopo e foram exercitadas sob `SET ROLE authenticated`. O aviso de senhas vazadas é configuração preexistente de Auth e permanece identificado no inventário, sem alteração de plano/cobrança.

A fonte das 120 MEL declara reconstrução funcional/paráfrase e ressalvas de detalhes não recuperados. Essas ressalvas foram mantidas na matriz. Não se atribui existência a histórico não capturado, meta não cadastrada, resolução SIGO não confirmada ou limiar de desempenho não definido.

A jornada com credenciais reais pelo navegador de produção não foi executada na homologação sintética. Após a publicação, registrar smoke público, commit/READY, configuração pública e verificações reais de RLS/contagens. Não confundir os testes sintéticos com um login real de produção.

## Publicação e rollback

Validar o SHA final e CI, conferir backup e funções instaladas, aplicar o bundle uma vez e verificar o banco antes de liberar a interface. Consolidar o PR #42 e acompanhar a publicação de produção do mesmo commit, reutilizando uma publicação automática se existir. Não criar previews. Verificar `READY`, domínio, assets e configuração pública sem expor chaves.

Deployment de produção anterior identificado para retorno de interface: `dpl_JE4EEkRRZfYzk3qftxmjdtW3A2Uh`, commit `89cc93c0c824a9fbfce9107a1d16342573a61f79`. As alterações de banco são aditivas; um retorno de interface não exige apagar históricos ou tabelas novas. Não executar restauração destrutiva de dados como procedimento automático.

Complemento de compatibilidade: 14 tarefas reais conservavam tratativa de conclusão com outro estado de trabalho legado. A migração `2026-11-25_sri_p03_conclusoes_legadas.sql` corrige apenas a interpretação nas consultas, sem reescrever esses registros. Instalações que já receberam o bundle original de 19 fontes aplicam somente esse complemento; instalações novas usam o bundle completo de 20 fontes.
