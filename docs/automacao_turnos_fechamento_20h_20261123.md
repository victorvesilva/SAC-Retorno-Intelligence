# Automação operacional — turno, importação e fechamento às 20h (23/11/2026)

## Regra aprovada
- **Manhã:** 07:00–12:59 (America/Sao_Paulo)
- **Tarde:** 13:00–17:59
- **Noite:** 18:00–06:59
- **Virada do dia operacional:** 20:00. Importações a partir de 20:00 pertencem ao próximo dia operacional, mesmo quando o turno ainda é Noite. Exemplo: 23/11 às 20:00 usa o dia 24/11.
- Operação e equipe podem continuar salvas como preferência de destino; nenhum nome R1/R2 determina o turno.
- A seleção de turno e data não é visível nem alterável na importação. O sistema atribui automaticamente no momento de publicar o resultado.
- Atualizações de SAC+ATIVO são **novas versões históricas** do mesmo resultado corrente (equipe/dia/turno) até 20:00. Somente a mais recente é exibida; nenhuma versão é apagada.
- Distribuições, situações, criticidades e eventos compatíveis são herdados da rodada compartilhada anterior do mesmo ciclo; novas datas/turnos não herdam inadvertidamente as carteiras do ciclo encerrado.
- Publicação automática reaproveita RPC de carteira, e mudança de snapshot preserva a situação de trabalho para o mesmo protocolo/operador; auditorias e registros antigos são mantidos.
- Toasts pequenos no canto direito informam sucessos, avisos e falhas; retry manual fica disponível somente se a operação falhar. CSVs originais ficam no navegador.
- Após 20:00, um job do Supabase (pg_cron, checagem de cinco em cinco minutos) fecha automaticamente o dia, incluindo turnos elegíveis com carteiras publicadas. Quando uma equipe não concluiu a publicação, o dia é encerrado **com pendências registradas**, sem simular sucesso.
- Fechamento automático é administrativo no Supabase, **não fecha protocolos no SIGO**. Histórico auditável com ator nulo (sistema). Reaberturas deliberadas pela gestão não são encerradas novamente automaticamente.

## Condições de homologação
1. Testar horário 06:59, 07:00, 12:59, 13:00, 17:59, 18:00, 19:59, 20:00, 23:59 e 00:00 no relógio de Brasília.
2. Importar duas versões no mesmo turno; conferir preservação da atribuição e status do operador e histórico de importações.
3. Importar após 20h; validar novo dia operacional no banco e turno Noite.
4. Monitorar `cron.job_run_details` às 20h; conferir `sri_result_day_closures` e `sri_result_shift_closures` e notificações.
5. Emular falha de conexão: nenhuma exclusão ou publicação parcial indicada como sucesso; reenvio excepcional visível.
6. Validar supervisor, operador e gestor em sessões autenticadas com dados de homologação.

**Observação:** testes estáticos/CI não substituem a verificação operacional autenticada na janela das 20h.
