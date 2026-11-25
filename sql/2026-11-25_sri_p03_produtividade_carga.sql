BEGIN;
-- Carga pendente exclui conclusões internas, mantendo sua visibilidade diária.
-- Consultas gerenciais somente leitura. SECURITY INVOKER mantém as políticas existentes.
-- Unidade: protocolo por operador/equipe/dia. Não somar operadores como se fossem protocolos globais.
CREATE OR REPLACE FUNCTION public.sri_p03_productivity(p_from date,p_to date)
RETURNS TABLE(operational_day date,team_name text,operator_name text,received bigint,treated bigint,active_stock bigint,finalized_in_tool bigint,untreated_active bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH permitted AS (
 SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('admin','manager','supervisor','assistant')
 ), scoped AS (
 SELECT t.* FROM public.daily_operator_tasks t
 WHERE EXISTS(SELECT 1 FROM permitted)
 AND p_from IS NOT NULL AND p_to IS NOT NULL AND p_to>=p_from AND p_to-p_from<=31
 AND t.operational_day BETWEEN p_from AND p_to
 ), grouped AS (
 SELECT t.operational_day,t.team_id,t.operator_user_id,t.protocol_number,
 bool_or(t.active AND t.work_status<>'completed_in_tool') AS is_active,
 bool_or(EXISTS(SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=t.id AND h.actor_id=t.operator_user_id)) AS has_treatment,
 bool_or(t.active AND t.work_status='completed_in_tool') AS active_finalized,
 (array_agg(t.work_status ORDER BY t.updated_at DESC,t.id DESC))[1]='completed_in_tool' AS latest_finalized
 FROM scoped t GROUP BY t.operational_day,t.team_id,t.operator_user_id,t.protocol_number
 )
 SELECT g.operational_day,coalesce(tm.name,'Sem equipe identificada'),coalesce(p.full_name,'Operador não identificado'),
 count(*),count(*) FILTER(WHERE g.has_treatment),count(*) FILTER(WHERE g.is_active),
 count(*) FILTER(WHERE g.has_treatment AND (g.active_finalized OR (NOT g.is_active AND g.latest_finalized))),
 count(*) FILTER(WHERE g.is_active AND NOT g.has_treatment)
 FROM grouped g LEFT JOIN public.teams tm ON tm.id=g.team_id LEFT JOIN public.profiles p ON p.id=g.operator_user_id
 GROUP BY g.operational_day,g.team_id,g.operator_user_id,tm.name,p.full_name
 ORDER BY g.operational_day DESC,tm.name,p.full_name
$$;
REVOKE ALL ON FUNCTION public.sri_p03_productivity(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_p03_productivity(date,date) TO authenticated;
COMMIT;