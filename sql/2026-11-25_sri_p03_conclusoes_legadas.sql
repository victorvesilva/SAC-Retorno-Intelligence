BEGIN;
-- Derive completion without rewriting legacy tasks or historical events.
CREATE OR REPLACE FUNCTION private.sri_p03_is_completed(p_work text,p_treatment text)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(p_work='completed_in_tool',false) OR coalesce(private.sri_p03_status_sigo(p_treatment)=3,false)
$$;
REVOKE ALL ON FUNCTION private.sri_p03_is_completed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_is_completed(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_p03_productivity(p_from date,p_to date)
RETURNS TABLE(operational_day date,team_name text,operator_name text,received bigint,treated bigint,active_stock bigint,finalized_in_tool bigint,untreated_active bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH permitted AS (
 SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('admin','manager','supervisor','assistant')
 ), scoped AS (
 SELECT t.* FROM public.daily_operator_tasks t WHERE EXISTS(SELECT 1 FROM permitted)
 AND p_from IS NOT NULL AND p_to IS NOT NULL AND p_to>=p_from AND p_to-p_from<=31
 AND t.operational_day BETWEEN p_from AND p_to
 AND (t.completed_operational_day IS NULL OR t.completed_operational_day>=t.operational_day)
 ), grouped AS (
 SELECT t.operational_day,t.team_id,t.operator_user_id,t.protocol_number,
 bool_or(t.active AND NOT private.sri_p03_is_completed(t.work_status,t.treatment_status)) AS is_active,
 bool_or(EXISTS(SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=t.id AND h.actor_id=t.operator_user_id)) AS has_treatment,
 bool_or(t.active AND private.sri_p03_is_completed(t.work_status,t.treatment_status)) AS active_finalized,
 (array_agg(private.sri_p03_is_completed(t.work_status,t.treatment_status) ORDER BY t.updated_at DESC,t.id DESC))[1] AS latest_finalized
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
-- Keep existing authorization/pagination and change only legacy completion predicates.
DO $legacy_readers$
DECLARE definition text; marker text;
BEGIN
 definition:=pg_get_functiondef('private.sri_my_daily_processed(text,integer)'::regprocedure);
 marker:='x.work_status=''completed_in_tool''';
 IF position(marker IN definition)>0 THEN
  EXECUTE replace(definition,marker,'private.sri_p03_is_completed(x.work_status,x.treatment_status)');
 ELSIF position('private.sri_p03_is_completed' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected processed-history definition'; END IF;
 definition:=pg_get_functiondef('private.sri_p03_my_unresolved()'::regprocedure);
 marker:='t.work_status<>''completed_in_tool''';
 IF position(marker IN definition)>0 THEN
  EXECUTE replace(definition,marker,'NOT private.sri_p03_is_completed(t.work_status,t.treatment_status)');
 ELSIF position('private.sri_p03_is_completed' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected unresolved-history definition'; END IF;
 definition:=pg_get_functiondef('private.sri_p03_reporting_page(date,date,text)'::regprocedure);
 marker:='FROM scoped_tasks t WHERE t.operational_day BETWEEN p_from AND p_to';
 IF position('t.completed_operational_day>=t.operational_day' IN definition)=0 THEN
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected reporting definition'; END IF;
  EXECUTE replace(definition,marker,marker||' AND (t.completed_operational_day IS NULL OR t.completed_operational_day>=t.operational_day)');
 END IF;
END $legacy_readers$;
COMMIT;
