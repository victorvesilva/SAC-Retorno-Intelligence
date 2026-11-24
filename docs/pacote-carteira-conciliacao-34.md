# Pacote 2 — MEL-037 a MEL-070 (24/11/2026)
Escopo aprovado em bloco. Base de produção e2b6797. Modal centralizado. 
## Implementação em desenvolvimento
- 037–039: Base e Área publicadas em carteira, filtros e contexto do modal.
- 040: tema claro obrigatório; preferências anteriores preservadas.
- 041–046: leitura centralizada das tarefas autorizadas da apuração, consulta periódica (15s), registro pela supervisão, versão otimista e serialização por dia; distribuição e status independentes, exportações consultam fonte central. Preservação de tratativas em reimportações e redistribuição no mesmo dia/turno.
- 047–054: evidência da presença em SAC e ATIVO, comparação de CD_STATUS e ausência nas duas fontes, alerta sem concluir automaticamente no SIGO; matriz de compatibilidade editável somente pela gestão, sem regras presumidas; central, decisões, justificativa, data de extração e tratativa, devolução ao operador, resposta e conclusão pela supervisão. Indicadores e situação validada na distribuição e exportação consolidada.
- 055–060: corrigido escopo de closeTreatment; atualização imediata após confirmação, histórico separado, filtros e rolagem, idempotência e tratamento de concorrência. Histórico com identificação de protocolo anterior.
- 061–070: layout claro, indicadores, tabela compacta com cabeçalho fixo, modal central, salvar e avançar, foco e teclado, responsividade. Menu visual e teste de acessibilidade por perfil ainda requerem revisão.
## Validação realizada
20 verificações automatizadas, incluindo execução simulada das funções de comparação e salvamento, compilação dos 8 scripts internos e 2 externos e inspeção de contratos SQL. Executar novamente com node tests/test_carteira_conciliacao.mjs.
## Homologação necessária
1. Banco isolado: nenhum ambiente de homologação existente; criação solicita confirmação de custo. Não aplicar migração na produção para testar. Executar SQL e validar RLS, papéis, concorrência real e rollback.
2. Contas de teste e duas sessões: 13 status, sequência de tratativas, alteração no mesmo protocolo, clique duplo, perda de rede após commit, conflito, histórico e navegação.
3. Importações sequenciais SAC + ATIVO: presença somente ATIVO, ausência nas duas, CD 12→11, alteração temporal, remoção e retorno à distribuição, fechamento e virada de turno. Preservação automática atual limitada ao mesmo dia/turno; validar regra de transição entre turnos. Alertas de ausência são para análise, não confirmação de resolução.
4. Matriz de compatibilidade: configuração pronta, equivalências dependem de validação da operação; nenhum código presumido. Validar devolução e decisão final.
5. Conferir indicadores, exportações, perfis e responsividade em navegador real. Verificar extrações com grandes volumes e dados anteriores à migração (Base/Área podem não estar preenchidas até republicação).
6. Só após testes integrados, autorizar publicação em produção. A prévia pode apontar ao banco real: não usar protocolos reais para testes.
