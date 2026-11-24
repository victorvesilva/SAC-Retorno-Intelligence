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

## Dependências e sequência
1. Conferir branch atual e divergências de main, sem sobrescrever alterações concorrentes.
2. Verificar SQL previamente aplicado: 2026-11-24_sri_carteira_v2.sql e 2026-11-24_sri_pacote03.sql.
3. Validar e, apenas na janela de publicação, aplicar migrações pendentes na ordem:
   - sql/2026-11-24_sri_pacote03_historico_carteira.sql
   - sql/2026-11-24_sri_pacote03_produtividade.sql
4. Verificar funções, grants, RLS, recortes por perfil e retornos reais. Não atribuir a resolução SIGO ao status completed_in_tool.
5. Testar login/logout, carteira, tratamento e avanço, atualização e paginação, conciliação, importação/distribuição, relatórios e exportações.
6. Somente após conclusão do escopo autorizado, confirmação dos testes e ausência de impedimentos: consolidar main, solicitar um único deploy, verificar READY e commit correto. Não repetir deployment bem-sucedido; não contornar quotas nem alterar cobrança.
7. Caso incompleto ou bloqueado, manter versão anterior e informar precisamente.

## Verificação realizada
Análise de sintaxe: 8 scripts clássicos inline do index.html e assets/sri-pacote03.js sem erro de parsing no commit b20d229. Não equivale a testes em navegador, integração autenticada ou validação das migrações.

## Lacunas não liberadas
- Regras completas de conclusão confirmada, reabertura e bloqueio de redistribuição.
- Consolidação histórica e cobertura de eventos, incidentes e alertas do console.
- Relatórios especializados e metas, exportações XLSX/PDF específicas, gráficos e indicadores restantes.
- Testes integrados, auditoria de segurança e desempenho.
- As 120 MEL não estão integralmente concluídas. Não tratar esta branch como release pronta.
