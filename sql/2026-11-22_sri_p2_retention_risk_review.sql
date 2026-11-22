-- SAC Retorno Intelligence 2.0 | P2 - inventario de retencao
-- PROPOSTA, SEM EXECUCAO EM PRODUCAO.
-- "2 months" abaixo e janela de TRIAGEM JA PRESENTE na view original:
-- nao e autorizacao legal de exclusao. Esta view NUNCA autoriza limpeza automatica.
-- Os campos de work_status e lifecycle NAO comprovam encerramento no SIGO.
-- Nao apaga historicos, auditoria, anexos ou dados operacionais.

BEGIN;

-- A view legada sri_v_retention_review usa retention_holds com security_invoker,
-- mas o papel authenticated atualmente nao tem SELECT na tabela.
-- RLS da retention_holds permite apenas private.is_manager() (confirmar em auditoria).
-- Dar SELECT ao papel autenticado nao remove o filtro RLS, e e necessario
-- para qualquer view security_invoker que consulte os bloqueios.
GRANT SELECT ON TABLE public.retention_holds TO authenticated;

CREATE OR REPLACE VIEW public.sri_v_retention_risk_review
WITH (security_invoker = true) AS
SELECT
 s.id AS snapshot_id,
 s.team_id,
 s.operational_day,
 s.shift_label,
 s.created_at,
 s.protocol_count,
 (CURRENT_DATE - s.operational_day)::integer AS idade_dias,
 COALESCE(a.tarefas_total,0) AS tarefas_total,
 COALESCE(a.tarefas_ativas,0) AS tarefas_ativas,
 COALESCE(a.tarefas_pendentes,0) AS tarefas_pendentes,
 COALESCE(a.protocolos_ativos_vinculados,0) AS protocolos_ativos_vinculados,
 h.operational_day IS NOT NULL AS retencao_obrigatoria_ativa,
 COALESCE(sc.status,'sem_fechamento') AS status_turno,
 COALESCE(dc.status,'sem_fechamento') AS status_dia,
 d.snapshot_id IS NOT NULL AS distribuicao_salva,
 -- 'completed_in_tool' nao equivale a fechamento no SIGO.
 -- O cruzamento com protocol_current inclui SOMENTE os protocolos com tarefa.
 true AS confirmacao_integral_sigo_pendente,
 false AS exclusao_automatica_autorizada,
 CASE
  WHEN h.operational_day IS NOT NULL THEN 'BLOQUEADO_RETENCAO_OBRIGATORIA'
  WHEN COALESCE(a.protocolos_ativos_vinculados,0)>0 THEN 'BLOQUEADO_PROTOCOLOS_ATIVOS_VINCULADOS'
  WHEN COALESCE(a.tarefas_pendentes,0)>0 THEN 'BLOQUEADO_TAREFAS_PENDENTES'
  WHEN COALESCE(a.tarefas_ativas,0)=0 AND s.protocol_count>0
   THEN 'BLOQUEADO_SEM_CARTEIRAS_PUBLICADAS'
  WHEN sc.status IS DISTINCT FROM 'closed'
   THEN 'BLOQUEADO_TURNO_NAO_FECHADO'
  WHEN dc.status IS DISTINCT FROM 'closed'
   THEN 'BLOQUEADO_DIA_NAO_FECHADO_OU_PENDENTE'
  ELSE 'REVISAO_MANUAL_OBRIGATORIA_SIGO_TI_JURIDICO'
 END AS classificacao
FROM public.daily_result_snapshots s
LEFT JOIN public.daily_result_distributions d ON d.snapshot_id=s.id
LEFT JOIN public.retention_holds h ON h.operational_day=s.operational_day
                                    AND h.released_at IS NULL
LEFT JOIN public.sri_result_shift_closures sc
 ON sc.team_id=s.team_id AND sc.operational_day=s.operational_day
 AND sc.shift_label=s.shift_label
LEFT JOIN public.sri_result_day_closures dc
 ON dc.operational_day=s.operational_day
LEFT JOIN LATERAL (
 SELECT
  count(*)::integer AS tarefas_total,
  count(*) FILTER (WHERE t.active)::integer AS tarefas_ativas,
  count(*) FILTER (WHERE t.active AND t.work_status<>'completed_in_tool')::integer AS tarefas_pendentes,
  count(*) FILTER (WHERE pc.lifecycle='active')::integer AS protocolos_ativos_vinculados
 FROM public.daily_operator_tasks t
 LEFT JOIN public.protocol_current pc
   ON pc.team_id=t.team_id AND pc.protocol_number=t.protocol_number
 WHERE t.snapshot_id=s.id
) a ON true
WHERE s.operational_day < (CURRENT_DATE-INTERVAL '2 months')::date
  AND (SELECT private.is_manager());

REVOKE ALL ON public.sri_v_retention_risk_review FROM PUBLIC, anon;
GRANT SELECT ON public.sri_v_retention_risk_review TO authenticated;

COMMIT;
