-- SAC Retorno Intelligence 2.0: consolidacao PRD, etapa 4 e 5
-- Nao remove dados, nao altera RLS existente e nao ativa retencao destrutiva.
CREATE INDEX IF NOT EXISTS sri_idx_daily_snapshots_recent
  ON public.daily_result_snapshots(team_id,operational_day DESC,shift_label,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS sri_idx_daily_tasks_scope
  ON public.daily_operator_tasks(team_id,operator_user_id,active);
CREATE OR REPLACE VIEW public.sri_v_daily_operational_metrics
WITH (security_invoker = true) AS
WITH last_snapshot AS (
 SELECT DISTINCT ON (s.team_id,s.operational_day,s.shift_label)
   s.id,s.team_id,s.operational_day,s.shift_label,s.created_at,s.protocol_count,
   s.indicators,s.warnings
 FROM public.daily_result_snapshots s
 ORDER BY s.team_id,s.operational_day,s.shift_label,s.created_at DESC,s.id DESC
)
SELECT s.id AS snapshot_id, s.team_id, t.name AS team_name,
       s.operational_day,s.shift_label,s.created_at AS snapshot_created_at,
       s.protocol_count AS protocolos_consolidados,
       coalesce((s.indicators->>'protocolos_monitorados')::integer,0) AS protocolos_monitorados,
       coalesce((s.indicators->>'sac_retorno')::integer,0) AS sac_retorno,
       coalesce((s.indicators->>'whatssac')::integer,0) AS whatssac,
       coalesce((s.indicators->>'vencem_hoje')::integer,0) AS vencem_hoje,
       coalesce((s.indicators->>'backlog')::integer,0) AS backlog,
       coalesce((s.indicators->>'sla_d6')::integer,0) AS sla_d6,
       coalesce((s.indicators->>'protocolos_sinalizados')::integer,0) AS protocolos_sinalizados,
       coalesce((s.warnings->>'divergencias_informativas')::integer,0) AS divergencias_informativas,
       coalesce((s.indicators->>'atribuicoes')::integer,0) AS atribuicoes_na_apuracao,
       coalesce(d.revision,0) AS revisao_distribuicao,
       (SELECT count(*)::integer FROM public.daily_operator_tasks a
          WHERE a.snapshot_id=s.id AND a.active) AS tarefas_publicadas,
       (SELECT count(*)::integer FROM public.daily_operator_tasks a
          WHERE a.snapshot_id=s.id AND a.active AND a.work_status='completed_in_tool') AS tratativas_concluidas,
       coalesce(c.status,'open') AS status_turno,
       coalesce(cd.status,'open') AS status_dia
FROM last_snapshot s
JOIN public.teams t ON t.id=s.team_id
LEFT JOIN public.daily_result_distributions d ON d.snapshot_id=s.id
LEFT JOIN public.sri_result_shift_closures c
  ON c.team_id=s.team_id AND c.operational_day=s.operational_day AND c.shift_label=s.shift_label
LEFT JOIN public.sri_result_day_closures cd ON cd.operational_day=s.operational_day;
REVOKE ALL ON public.sri_v_daily_operational_metrics FROM PUBLIC,anon;
GRANT SELECT ON public.sri_v_daily_operational_metrics TO authenticated;
COMMENT ON VIEW public.sri_v_daily_operational_metrics IS
 'Apuracao mais recente por equipe/data/turno. Segue RLS das tabelas originais. Somar linhas de turnos nao produz protocolos unicos do dia.';

CREATE OR REPLACE VIEW public.sri_v_retention_review
WITH (security_invoker = true) AS
SELECT s.id AS snapshot_id,s.team_id,s.operational_day,s.shift_label,s.created_at,
  s.protocol_count,
  EXISTS(SELECT 1 FROM public.daily_operator_tasks t
    WHERE t.snapshot_id=s.id AND t.active AND t.work_status<>'completed_in_tool') AS possui_tarefas_em_aberto,
  EXISTS(SELECT 1 FROM public.retention_holds h
    WHERE h.operational_day=s.operational_day AND h.released_at IS NULL) AS possui_retencao_obrigatoria,
  'REVISAO_MANUAL_OBRIGATORIA'::text AS classificacao,
  false AS exclusao_automatica_autorizada
FROM public.daily_result_snapshots s
WHERE s.operational_day < (current_date - interval '2 months')::date;
REVOKE ALL ON public.sri_v_retention_review FROM PUBLIC,anon;
GRANT SELECT ON public.sri_v_retention_review TO authenticated;
COMMENT ON VIEW public.sri_v_retention_review IS
 'Inventario apenas: NAO confirma que protocolos da apuracao estejam encerrados. Nao autoriza exclusao automatica.';
