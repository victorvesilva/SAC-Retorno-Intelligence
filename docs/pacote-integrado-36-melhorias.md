# Pacote integrado — SAC Retorno Intelligence 2.0

Branch única, baseada no commit de produção b3b7b10. Nenhuma migração aplicada à produção.

## Cobertura e pendências
| Escopo | Situação nesta entrega |
|---|---|
| MEL-001, 002, 005, 007 | CRUD de equipes/operações em interface e SQL; inativação condicionada a dependências, exclusão bloqueada se houver qualquer FK, inclusive cascata. Homologar SQL. Exclusão de contas de autenticação ainda não implementada. |
| MEL-003 | Edição de nome; alteração de e-mail/login ainda requer fluxo seguro de confirmação e Auth. |
| MEL-004 | Situação operacional de operadores/supervisores continua pelo fluxo existente. Inativação efetiva do acesso (incluindo sessões existentes) e reativação de todos os perfis ainda pendentes. |
| MEL-006 | Fluxo existente de transferência individual preservado; homologar proteção de protocolos e vínculos. |
| MEL-008, 009 | Auditoria de catálogo/nome e consulta a eventos administrativos; filtros de situação para catálogo e usuários. |
| MEL-010 | Novas funções validam gestão no servidor; revisão completa de todas as permissões ainda pendente. |
| MEL-011 a 017 | Mensagens de conexão, autenticação, carteira, cadastro, distribuição e notificações comuns revisadas; inventário integral de textos e modais restantes ainda pendente. Erros e avisos persistentes, informações 5 s, sucesso 4 s, deduplicação 5 s. |
| MEL-018 a 022 | Tema claro, escuro e automático, atalho e preferência por conta/navegador. Homologação visual de todos os módulos, gráficos, impressão e contraste ainda pendente. |
| MEL-023 a 030 | Carteira com indicadores individuais, filtro de protocolo, criticidade e tratativa; histórico em tela distinta; menu redundante de prioridades removido; preferências e ajuda rápida na conta. Painel individual completo, manual/FAQ completo, revisão de alçadas e testes móveis ainda pendentes. |
| MEL-031 a 036 | Propagação da criticidade final da regra existente (automática ou manual), níveis, destaque, ordenação, contagem e filtro. Prazo categórico exibido e usado no desempate. A atualização da carteira existente foi preservada. Motivo completo (NIP, fila, ajuste manual etc.), data/hora exata de vencimento e auditoria remota da criticidade precisam de evolução e homologação; não inventar motivos nem expor origem técnica. |

## Homologação antes de merge/produção
1. Aplicar SQL em ambiente de teste; verificar criação/edição/inativação/reativação/exclusão com cadastros sintéticos. Testar com membro, protocolo ativo, histórico, equipe em operação inativa e conflito de nome; verificar ausência de alteração em falhas.
2. Testar autorização por operador, supervisor, gestor, administrador e consulta. Não liberar exclusão de contas nem desativação global de acesso até existir teste de sessões ativas, histórico e políticas/RPCs.
3. Publicar carteira sintética contendo Crítico/Alto/Médio/Baixo e não avaliado; verificar ordem, desempate, ajuste manual e atualização após publicação. Registrar cada um dos 13 status sem alterar encerramento no SIGO.
4. Verificar dois logins alternados, logout, erro de carregamento, dia operacional e fechamento às 20h.
5. Inspecionar temas em todas as telas (inclusive gráficos, modais e PDF/print), desktop e celular; verificar foco, contraste, textos e notificações sem duplicação.
6. Rodar regressão integral da importação SAC + ATIVO e distribuição/fechamento; não alterar dados de beneficiários em homologação.

## Evidências
- Oito scripts inline do HTML compilados em JavaScript sem erro de sintaxe.
- Novo JS e JS de conexão compilados sem erro de sintaxe.
- Teste sintético do ranking por criticidade/prazo passou.
- SQL preparado, não executado nem validado em banco de homologação.
- Nenhuma homologação visual/autenticada nem regressão ponta a ponta realizada nesta etapa.
