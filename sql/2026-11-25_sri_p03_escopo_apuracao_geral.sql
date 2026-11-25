BEGIN;
CREATE OR REPLACE FUNCTION private.sri_p03_distribution_is_scoped(p_state jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE reference text; actor_role text; operator_id uuid; operator_team uuid;
BEGIN
 IF private.is_manager() THEN RETURN true; END IF;
 SELECT role INTO actor_role FROM public.profiles WHERE id=auth.uid();
 IF actor_role IS NULL OR actor_role NOT IN ('supervisor','assistant') OR jsonb_typeof(p_state) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF jsonb_typeof(coalesce(p_state->'assignments','{}'::jsonb))<>'object'
 OR jsonb_typeof(coalesce(p_state->'roster','[]'::jsonb))<>'array'
 OR jsonb_typeof(coalesce(p_state->'archivedRoster','[]'::jsonb))<>'array' THEN RETURN false; END IF;
 FOR reference IN
  SELECT DISTINCT value FROM (
   SELECT value->>'opId' value FROM jsonb_each(coalesce(p_state->'assignments','{}'::jsonb))
   UNION ALL SELECT value->>'id' FROM jsonb_array_elements(coalesce(p_state->'roster','[]'::jsonb))
   UNION ALL SELECT value->>'id' FROM jsonb_array_elements(coalesce(p_state->'archivedRoster','[]'::jsonb))
  ) refs
 LOOP
  IF reference IS NULL OR reference !~ '^acct:[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
  operator_id:=substring(reference FROM 6)::uuid;
  SELECT member.team_id INTO operator_team FROM public.team_memberships member WHERE member.user_id=operator_id
  AND private.is_supervisor_of(member.team_id) LIMIT 1;
  IF NOT private.sri_p03_can_manage_task(operator_id,operator_team) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_distribution_is_scoped(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_distribution_is_scoped(jsonb) TO authenticated;

DROP POLICY IF EXISTS sri_general_snapshots_read ON public.daily_result_snapshots;
CREATE POLICY sri_general_snapshots_read ON public.daily_result_snapshots FOR SELECT TO authenticated USING(
 team_id IS NULL AND (private.is_manager() OR (imported_by=auth.uid() AND EXISTS(
 SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('supervisor','assistant'))))
);
DROP POLICY IF EXISTS sri_general_distribution_read ON public.daily_result_distributions;
CREATE POLICY sri_general_distribution_read ON public.daily_result_distributions FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.daily_result_snapshots snapshot WHERE snapshot.id=snapshot_id AND snapshot.team_id IS NULL
 AND (private.is_manager() OR snapshot.imported_by=auth.uid())) AND private.sri_p03_distribution_is_scoped(state)
);
DROP POLICY IF EXISTS sri_general_distribution_insert ON public.daily_result_distributions;
CREATE POLICY sri_general_distribution_insert ON public.daily_result_distributions FOR INSERT TO authenticated WITH CHECK(
 updated_by=auth.uid() AND EXISTS(SELECT 1 FROM public.daily_result_snapshots snapshot WHERE snapshot.id=snapshot_id AND snapshot.team_id IS NULL
 AND (private.is_manager() OR snapshot.imported_by=auth.uid())) AND private.sri_p03_distribution_is_scoped(state)
);
DROP POLICY IF EXISTS sri_general_distribution_update ON public.daily_result_distributions;
CREATE POLICY sri_general_distribution_update ON public.daily_result_distributions FOR UPDATE TO authenticated USING(
 EXISTS(SELECT 1 FROM public.daily_result_snapshots snapshot WHERE snapshot.id=snapshot_id AND snapshot.team_id IS NULL
 AND (private.is_manager() OR snapshot.imported_by=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.sri_general_day_closures closure WHERE closure.operational_day=snapshot.operational_day))
 AND private.sri_p03_distribution_is_scoped(state)
) WITH CHECK(
 updated_by=auth.uid() AND EXISTS(SELECT 1 FROM public.daily_result_snapshots snapshot WHERE snapshot.id=snapshot_id AND snapshot.team_id IS NULL
 AND (private.is_manager() OR snapshot.imported_by=auth.uid())) AND private.sri_p03_distribution_is_scoped(state)
);
DROP POLICY IF EXISTS sri_general_closure_read ON public.sri_general_day_closures;
CREATE POLICY sri_general_closure_read ON public.sri_general_day_closures FOR SELECT TO authenticated USING(private.is_manager());

DO $publication_owner$
DECLARE definition text; guard text;
BEGIN
 definition:=pg_get_functiondef('public.publish_general_operator_tasks(uuid,bigint,jsonb)'::regprocedure);
 guard:='IF NOT private.is_manager() AND NOT EXISTS(SELECT 1 FROM public.daily_result_snapshots snapshot WHERE snapshot.id=p_snapshot AND snapshot.imported_by=auth.uid()) THEN RAISE EXCEPTION ''Apuração geral fora do escopo autorizado''; END IF;';
 IF position(guard IN definition)=0 THEN
  definition:=replace(definition,'IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Sessão obrigatória''; END IF;',
   'IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Sessão obrigatória''; END IF; '||guard);
  EXECUTE definition;
 END IF;
END $publication_owner$;
COMMIT;
