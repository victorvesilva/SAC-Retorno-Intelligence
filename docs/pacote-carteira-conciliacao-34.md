# Pacote 2 — MEL-037 a MEL-070 (24/11/2026)
Escopo aprovado em bloco. Base: produção e2b6797. Modal centralizado (não painel lateral). 
## Implementação inicial
- 037–039: base e área publicadas em carteira, filtros; migração pendente.
- 040: tema claro obrigatório, preferências anteriores preservadas.
- 041–046: leitura centralizada das tarefas autorizadas da apuração, consulta periódica em 15 segundos, gravação do supervisor por RPC, verificação de versão, preservação no mesmo turno. Ainda testar exportações/indicadores, correção legada, escopo de supervisão e virada de turno.
- 047–054: comparação por mudança de origem nas tarefas publicadas, registro de conciliação, pesquisa por operador/equipe/base/área, decisões e justificativa, matriz de compatibilidade vazia com função de configuração. A ausência em ambas as bases e a devolução efetiva para carteira do operador ainda não estão implementadas; matriz depende de validação da operação, não equiparar códigos SIGO e tratativas.
- 055–060: corrigido erro de escopo de closeTreatment; atualização local após confirmação, histórico separado, manutenção de filtros/rolagem, idempotência no servidor e validação da versão, recuperação de conflito. Testar perda de conexão e repetição de pedido em sessão real.
- 061–070: layout claro, indicadores, tabela compacta com cabeçalho fixo, modal central, salvar e avançar, foco visível e navegação por teclado, responsividade. Revisão visual e menu por perfil pendentes.
## Critérios para liberar
1. Validar migração em banco isolado, incluindo políticas RLS, funções com perfis distintos, duas sessões, rollback.
2. Simular tratativas consecutivas, alteração do mesmo protocolo, clique duplo, conflito de versões e perda de conexão após confirmação do banco.
3. Testar importações sequenciais, redistribuição, virada de turno, fechamento, alterações de status e ausência nas duas bases. Não concluir automaticamente protocolo no SIGO.
4. Validar matriz de compatibilidade com operação, interface de configuração, decisão efetiva de devolução e impacto sobre os relatórios. Não sobrescrever origem nem histórico.
5. Testar todos os 13 status, filtros, indicadores, exportações, modal central, acessibilidade e mobile.
6. Revisar logs, autorizar publicação da versão completa; nenhuma migração aplicada em produção nesta etapa.
## Testes realizados
8 scripts internos e 2 externos passaram na compilação JavaScript; 14 verificações estáticas de integração passaram. Isso não equivale a homologação funcional ou SQL.
