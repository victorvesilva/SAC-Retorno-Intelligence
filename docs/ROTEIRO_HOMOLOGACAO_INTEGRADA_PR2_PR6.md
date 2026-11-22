# SAC Retorno Intelligence 2.0 — Homologação integrada das PRs #2 a #6
**Status:** branch de homologação; NÃO representa implementação em produção.

## Objetivo
Consolidar em uma versão de teste as cinco correções aprovadas tecnicamente nos seus respectivos PRs:
- PR #2: importação SAC/ATIVO e preservação de alinhamento do CSV, sem divulgar dados de beneficiários.
- PR #3: controle de acesso a carteiras, autorização de tratativas e bloqueio de republicação após fechamento.
- PR #4: bloqueio de fechamento de turno sem carteiras publicadas, revisão divergente ou publicação parcial.
- PR #5: relatórios A4 (executivo, equipe, divergências, fechamento), totais, filtros e paginação.
- PR #6: inventário de retenção somente leitura, segurança do hold e bloqueio de exclusão automática.

## Sequência de testes integrada
1. **Entrada dos dados:** carregar arquivos fictícios SAC/ATIVO (incluindo divergências, ponto-e-vírgula em texto livre, linhas inválidas e duplicidade) no navegador; validar quantitativos, criticidade e identificação dos conflitos.
2. **Identidades:** criar somente no ambiente isolado um gestor, dois supervisores de equipes diferentes e dois operadores. Testar login e RLS de cada perfil no cliente e na API.
3. **Distribuição:** salvar carteira, publicar tarefas, consultar somente a carteira do operador, registrar tratativas e testar redistribuição/concorrência de edição.
4. **Fechamento:** exigir publicação completa, última apuração, controle de revisão, justificativa de pendência e trilha de reabertura; confirmar que não encerra protocolos no SIGO.
5. **Indicadores e PDFs:** revisar as quatro finalidades A4; comparar totais com resultados esperados; garantir 225 linhas únicas em teste sintético longo e restrição de acesso.
6. **Retenção:** simular candidatos antigos, casos com hold, tarefa aberta e protocolo ainda aberto no SIGO; inventário deve permanecer bloqueado. Registrar a periodicidade de **dois meses**, sem acionar exclusão.
7. **Infraestrutura:** validar preview Vercel, backup, estabilidade, perda de sessão, navegador desatualizado, falha de conexão e recuperação.

## Importante: o que a CI mede e o que não mede
A CI testa código e PDFs com dados fictícios. Ela NÃO testa login com múltiplas contas reais, compatibilidade com SIGO, políticas RLS no contexto real de usuários, nem aplica os scripts SQL ao banco. **Os scripts SQL ainda precisam ser revisados e aplicados a um ambiente de homologação isolado pela equipe responsável.**

## Condições para aceite
- PR e CI aprovados.
- Teste multissessão de gestor, supervisor e operadores, incluindo casos negativos.
- Validação com Operação de planilhas e relatórios, sem expor dados pessoais.
- Revisão de TI/Segurança dos scripts e recuperação testada.
- Para retenção: decisão da periodicidade documentada; critérios de eliminação e primeira execução ainda sujeitos a aceites formais.

## Proteção dos ambientes
Não mesclar esta branch com a `main`, não promover Vercel para produção e não executar SQL, limpeza ou criação de contas na base de produção sem autorização e homologação. A preview existente pode servir apenas para verificar o frontend; SQL ainda não aplicado nela.
