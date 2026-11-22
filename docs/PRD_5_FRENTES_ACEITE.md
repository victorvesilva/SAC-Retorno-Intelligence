# SAC Retorno Intelligence 2.0 — Consolidação das 5 frentes de PRD
Data: 22/11/2026. Ambiente: Supabase djjgvvzmopehatdsnlnd / Vercel sac-intelligence.
## Objetivo
Preservar a apuração consolidada (sem armazenar CSV SAC/ATIVO), distribuir aos usuários autenticados, encerrar turnos/dias, consultar indicadores e imprimir relatórios A4.
## Entregas por frente
1. **Fechamento**: usa Etapa 3.4 já implantada. Funções sri_close_result_shift / sri_close_result_day; exigem conferência e justificativa quando há pendências. NÃO finaliza protocolo no SIGO. Faltam testes completos com perfis distintos.
2. **Indicadores e filtros**: nova view sri_v_daily_operational_metrics (security_invoker=true, RLS subjacente) + painel com intervalo, equipe, turno, KPIs e barras com valores visíveis, hover, teclado e toque. Agregações somam apurações por turno; NÃO equivalem a protocolos únicos do dia.
3. **Relatórios**: central sincronizada na seção Relatórios, por finalidade (executivo, equipe, divergências, fechamento). Impressão A4 pelo navegador. Relatórios legados locais continuam para consultas; ainda precisam de auditoria com bases de teste.
4. **Segurança e retenção**: nova view sri_v_retention_review é SOMENTE inventário; nenhuma exclusão, cron ou limpeza automática. Revise 22 funções SECURITY DEFINER expostas a authenticated, embora a varredura estática tenha identificado controles contextuais em todas. Validar RLS e permissões com contas distintas. Ativar proteção de senhas vazadas e fechar repositório público antes de dados reais. Nenhuma chave secreta em arquivos estáticos.
5. **Homologação e PRD**: roteiro abaixo. NÃO confundir Vercel target=production com aceite operacional. Não liberar dados reais até todos os testes e aprovações.
## Checklist de homologação com bases fictícias
- [ ] Login recém-cadastrado -> role operator, sem equipe.
- [ ] Gestor atribui equipe, supervisiona e impede operador de acessar outra equipe.
- [ ] Importar SAC+ATIVO no navegador; salvar somente apuração consolidada; comparar protocolos, D6, backlog, alertas com conferência manual.
- [ ] Abrir em outro navegador, recuperar mesma apuração, filtros e KPIs; comparar totais e tooltips.
- [ ] Distribuir protocolos a 2 operadores, publicar e consultar carteiras isoladas; registrar tratativa; verificar histórico e redistribuição sem perda.
- [ ] Tentar visualizar tarefa de outro operador via consulta API; exigir bloqueio RLS.
- [ ] Reabrir apuração antiga e tentar republicar: não deve substituir tarefas recentes.
- [ ] Fechar turno após conferência, fechar dia com e sem pendências e justificativa, reabrir auditavelmente; não finalizar SIGO.
- [ ] Exportar 4 relatórios A4 em PDF, verificar páginas, corte de colunas, totais, legibilidade, filtros e ausência de apresentação 16:9.
- [ ] Simular erro de rede e duas sessões editando simultaneamente; verificar retomada sem sobrescrita silenciosa.
- [ ] Medir tempo de processamento e consulta com bases autorizadas representativas, e validar cópia/recuperação de segurança.
- [ ] Validar retenção de 2 meses com TI/Jurídico e identificar protocolos ativos; SOMENTE depois desenhar job de exclusão segura.
## Implantação e rollback
SQL em sql/2026-11-22_sri_prd_5_frentes.sql: views e índices, sem remoção de dados, já migrado.
Aplicação: index.html conserva os fluxos 3.2-3.4 e inclui sri-prd-painel.js; Preview antes do merge.
Voltar ao commit anterior da main em caso de falha visual; não desfazer dados operacionais nem aplicar limpeza.
## Bloqueadores atuais
Sem testes multiusuário reais, sem conferência de bases representativas, sem validação de PDFs antigos, sem monitoramento/recuperação homologados e sem política de retenção aprovada. Repositório atualmente público. Não declarar PRD operacional até liberar estes itens.
