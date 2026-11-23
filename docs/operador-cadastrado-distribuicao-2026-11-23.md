# Operadores cadastrados recebem distribuição — 23/11/2026

**Objetivo:** a conta única com perfil `operator` e situação `Ativo` ou `Promovido` deve aparecer na distribuição sem cadastro paralelo de operadores e sem vinculação manual prévia.

## Regras
- O sistema consulta o Supabase para listar operadores ativos **da equipe selecionada e ainda sem equipe**, com acesso limitado a gestão e supervisores autorizados à equipe. Não lista contas já vinculadas a outra equipe.
- Após distribuir um protocolo, o sistema salva a distribuição e chama a RPC `sri_activate_assigned_operator_accounts` somente para os IDs técnicos de contas efetivamente atribuídas na distribuição registrada. A RPC valida, no banco, perfil, situação, equipe, ausência de vínculos conflitantes e revisão da distribuição.
- Operadores sem equipe recebem automaticamente vínculos `team_memberships` e `operator_links` da equipe da apuração. O procedimento é idempotente, auditado, e não cria novo login.
- Operador já vinculado à equipe permanece inalterado e recebe as tarefas normalmente. Atribuição a outra equipe é recusada, sem movimentação silenciosa.
- Situações Férias, Afastamento e Desligado não recebem novas tarefas.
- **Somente depois** de conferir os vínculos, o processo existente `publish_daily_operator_tasks` publica os protocolos no `daily_operator_tasks`; cada operador visualiza apenas sua própria carteira.
- Quando uma conta não puder receber todas as atribuições, a interface mostra erro explícito em vez de indicar sucesso parcial como completo.
- CSVs SAC e ATIVO originais continuam fora do Supabase. Não modifica RLS, senhas, tokens ou contas existentes.

## Aceite
- Testes automatizados da listagem e do fluxo de publicação com dados sintéticos.
- Homologação integrada do projeto.
- Teste operacional autenticado com operador recém-criado e sem equipe, seguido de distribuição para ele e verificação em Minha Carteira.
