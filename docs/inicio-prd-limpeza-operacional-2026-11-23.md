# Início oficial PRD — limpeza operacional controlada — 23/11/2026

## Escopo
- **Preservar** integralmente `auth.users`, `public.profiles`, `public.operations`, `public.teams`, `public.team_memberships`, `public.operator_links`, configurações de turnos e registros de auditoria de gestão de usuários/equipes.
- **Zerar** importações SAC + ATIVO, linhas, eventos, conflitos, protocolos, atribuições, tratativas operacionais, resultados consolidados, distribuições, publicações, históricos de distribuição e fechamentos dos turnos/dias. Não alterar tabelas nem políticas RLS.
- **Remover apenas auditorias de dados operacionais**, preservando ações sobre usuários, equipes e perfis.
- **Limpar caches locais da aplicação automaticamente** no primeiro acesso a esta versão em cada navegador. Remover itens com prefixos de projeto `sri_`, `sri-`, `sac-`, `sac_`, `sacpulse`, `sac20` (inclui backups, históricos, filtros, distribuição e perfis legados locais); preservar chaves `sb-*` do Supabase e entradas de outros sites/aplicações.
- A limpeza do navegador é **única por instalação** usando marcador `sri_prd_cutover_epoch` para não apagar importações novas. Abas já abertas precisam recarregar para executar o código novo.

## Verificação
- Teste isolado `tests/test_prd_reset.mjs` simula navegador com dados anteriores e token de login e valida a segunda visita.
- Testes gerais de regressão e homologação integrada do projeto.
- Consulta SQL de contagem antes/depois, inclusive `auth.users` e `public.profiles`, sem extrair senhas, tokens, dados clínicos ou bases CSV.
- Banco será zerado **após** confirmação da publicação da nova versão em produção para reduzir risco de reconstituição via cache local antigo.

## Observação
Dados que permanecerem apenas em abas **antigas e ainda abertas** não podem ser apagados retroativamente do processo já executado: todos precisam atualizar a página. O banco compartilha somente os dados publicados a partir da nova rodada PRD.
