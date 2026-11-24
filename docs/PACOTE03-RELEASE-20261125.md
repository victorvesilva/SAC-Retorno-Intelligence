# Pacote 03 — preparação de release 25/11/2026
Estado: NÃO LIBERADO PARA PRODUÇÃO. Branch feat/pacote-03-integridade-monitoramento-20261124.

## Alterações registradas
- Histórico do operador agrupado por protocolo, linha do tempo, log, pesquisa e paginação.
- Consulta de tratativas do dia anteriores à distribuição ativa, somente leitura; distingue finalização na ferramenta de resolução confirmada no SIGO.
- Filtros avançados, atalhos, vencimento, ordenação, paginação, densidade.
- Central de relatórios: busca, favoritos, PDF 16:9, prévia agregada, CSV, comparação de extrações.
- Mapa Área × SLA com consulta de protocolos e CSV.
- Monitoramento e histórico gerencial: contadores no recorte carregado, exportação JSON/CSV, deduplicação.
- Produtividade por dia/equipe/operador com consulta RLS, gráfico e CSV.
- Correção de declaração JavaScript duplicada na publicação das carteiras.
- Gestão Operacional: consulta histórica read-only no Supabase por dia/turno, identificação da fonte e atalho para relatório de dia anterior. O histórico da nuvem contém somente indicadores consolidados; não reconstrói carteira detalhada.

## Dependências e sequência
1. Conferir branch atual e divergências de main, sem sobrescrever alterações concorrentes.
2. Verificar SQL previamente aplicado: 2026-11-24_sri_carteira_v2.sql e 2026-11-24_sri_pacote03.sql.
3. Validar e, apenas na janela de publicação, aplicar migrações pendentes na ordem:
   - sql/2026-11-24_sri_pacote03_historico_carteira.sql
   - sql/2026-11-24_sri_pacote03_produtividade.sql
   - sql/2026-11-24_sri_pacote03_protecao_incidentes.sql (revisar gatilhos e transições antes de aplicar)
4. Verificar funções, grants, RLS, recortes por perfil e retornos reais. Não atribuir a resolução SIGO ao status completed_in_tool.
5. Testar login/logout, carteira, tratamento e avanço, atualização e paginação, conciliação, importação/distribuição, relatórios e exportações.
6. Somente após conclusão do escopo autorizado, confirmação dos testes e ausência de impedimentos: consolidar main, solicitar um único deploy, verificar READY e commit correto. Não repetir deployment bem-sucedido; não contornar quotas nem alterar cobrança.
7. Caso incompleto ou bloqueado, manter versão anterior e informar precisamente.

## Verificação realizada
- Histórico operacional: dados da apuração geral de 23/11/2026 confirmados em `daily_result_snapshots` (1 extração, turno Tarde, 2.678 protocolos monitorados; 2.467 SAC Retorno; 231 WhatsSAC). Mapeamento de metadados e consulta de histórico testados com amostra, sem testar interface autenticada.
- Correção do histórico registrada nos commits `08614ed`, `46ffc0c`; continua não publicada.
Análise de sintaxe: 8 scripts clássicos inline do index.html e assets/sri-pacote03.js sem erro de parsing no commit b20d229. Não equivale a testes em navegador, integração autenticada ou validação das migrações.

## Lacunas não liberadas
- Regras completas de conclusão confirmada, reabertura e bloqueio de redistribuição.
- Consolidação histórica e cobertura de eventos, incidentes e alertas do console.
- Relatórios especializados e metas, exportações XLSX/PDF específicas, gráficos e indicadores restantes.
- Testes integrados, auditoria de segurança e desempenho.
- As 120 MEL não estão integralmente concluídas. Não tratar esta branch como release pronta.

## 24/11 — candidato para homologação funcional em produção
O solicitante autorizou homologação de interface e jornada em produção. Isso não dispensa testes técnicos prévios de sintaxe, acesso, migrações, RLS e integridade de dados; não autoriza publicação parcial com falhas conhecidas.

Novas implementações candidatas:
- BUG-GO-001 (#37): Gestão Operacional com seleção de data e snapshot persistido, sem fallback para dados de hoje, e CSV da consulta. Limite: detalhes apenas de protocolos atribuídos no snapshot; não reconstruir extrações completas.
- MEL-EXTRA-002 (#38): histórico do operador filtrado no servidor pela data real da tratativa, com paginação e fuso America/Sao_Paulo.
- MEL-EXTRA-003 (#39): suporte a papel assistant, gestão de papéis e migração de permissões/RLS por equipe, pendente de testes comparativos.
- MEL-EXTRA-004 (#40): notificações em cima por até 4s e navegação Voltar interna.
- MEL-EXTRA-005 (#41): tabela dos 13 status e proteção de protocolo tratado; históricos legados precisam de conciliação manual.

Sequência SQL após conferir dependências:
1. sql/2026-11-24_sri_pacote03_historico_carteira.sql
2. sql/2026-11-24_sri_pacote03_produtividade.sql
3. sql/2026-11-24_sri_pacote03_protecao_incidentes.sql
4. sql/2026-11-24_sri_criticos_persistencia_status.sql
5. sql/2026-11-24_sri_p03_historico_datas.sql
6. sql/2026-11-24_sri_p03_perfil_assistente.sql

Portões pré-produção: backup verificável; revisar grants, RLS, SECURITY DEFINER e proteção contra reatribuição de carteiras; executar CI e testes sintéticos; preparar rollback; confirmar versão do commit antes de um único deploy e smoke test em produção.
Os previews automáticos estão desativados para evitar consumo da cota.

Limitação: não se comprovou ainda a conclusão das 120 MEL-071 a MEL-190; permanecer com bloqueio de liberação integral do Pacote 03 até auditoria do escopo.
