BEGIN;
-- Corrections are append-only evidence; original tasks/treatments and snapshots remain.
CREATE TABLE IF NOT EXISTS private.sri_distribution_removals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 snapshot_id uuid NOT NULL REFERENCES public.daily_result_snapshots(id),
 protocol_number text NOT NULL, task_id uuid, operator_id uuid,
 removed_by uuid NOT NULL, removed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL, previous_assignment jsonb, previous_task jsonb
);
CREATE INDEX IF NOT EXISTS sri_distribution_removals_task ON private.sri_distribution_removals(task_id,operator_id);
CREATE INDEX IF NOT EXISTS sri_distribution_removals_snapshot ON private.sri_distribution_removals(snapshot_id,protocol_number,operator_id);
ALTER TABLE private.sri_distribution_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_distribution_removals FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sri_distribution_history(p_day date,p_snapshot uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; state jsonb; rev bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','manager') AND operational_status IN ('Ativo','Promovido')) THEN RAISE EXCEPTION 'Consulta restrita a ADM/Gestor'; END IF;
 IF p_day IS NULL THEN RAISE EXCEPTION 'Informe a data'; END IF;
 IF p_snapshot IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'shift',s.shift_label,'registered_at',s.created_at,'reference',s.reference_serial,'team',coalesce(t.name,'Apuração geral'),'revision',d.revision) ORDER BY s.created_at,s.id),'[]') INTO result
  FROM public.daily_result_snapshots s JOIN public.daily_result_distributions d ON d.snapshot_id=s.id LEFT JOIN public.teams t ON t.id=s.team_id WHERE s.operational_day=p_day;
  RETURN result;
 END IF;
 SELECT d.state,d.revision INTO state,rev FROM public.daily_result_snapshots s JOIN public.daily_result_distributions d ON d.snapshot_id=s.id WHERE s.id=p_snapshot AND s.operational_day=p_day;
 IF NOT FOUND THEN RAISE EXCEPTION 'Extração não encontrada para esta data'; END IF;
 WITH entries AS (
  SELECT key protocol,value assignment FROM jsonb_each(coalesce(state->'assignments','{}'))
 ), protocols AS (
  SELECT protocol FROM entries UNION SELECT protocol_number FROM public.daily_operator_tasks WHERE snapshot_id=p_snapshot
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('protocol',q.protocol,'operator',coalesce(p.full_name,r.item->>'name',e.assignment->>'opId','Não identificado'),
 'profile',coalesce(p.role,'Cadastro da distribuição'),'active',coalesce(task.active,false),'work_status',task.work_status,'treatment',task.treatment_status,
 'can_remove',(e.assignment IS NOT NULL OR coalesce(task.active,false)) AND coalesce(task.work_status,'pending')='pending' AND coalesce(nullif(task.treatment_status,'SEM STATUS'),'')='' AND coalesce(state->'statuses'->q.protocol->>'status',state->'statuses'->>q.protocol,'') IN ('','SEM STATUS') AND NOT coalesce(private.sri_p03_is_completed(task.work_status,task.treatment_status),false) AND NOT EXISTS(SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=task.id),
 'has_treatment',EXISTS(SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=task.id)) ORDER BY q.protocol),'[]') INTO result
 FROM protocols q LEFT JOIN entries e ON e.protocol=q.protocol LEFT JOIN public.daily_operator_tasks task ON task.snapshot_id=p_snapshot AND task.protocol_number=q.protocol
 LEFT JOIN LATERAL (SELECT item FROM jsonb_array_elements(coalesce(state->'roster','[]')||coalesce(state->'archivedRoster','[]')) item WHERE item->>'id'=e.assignment->>'opId' LIMIT 1) r ON true
 LEFT JOIN public.profiles p ON p.id=coalesce(task.operator_user_id,CASE WHEN e.assignment->>'opId' ~ '^acct:[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN substring(e.assignment->>'opId' from 6)::uuid END);
 RETURN jsonb_build_object('revision',rev,'rows',result);
END $$;

CREATE OR REPLACE FUNCTION private.sri_distribution_unassign(p_day date,p_snapshot uuid,p_revision bigint,p_protocols text[],p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE distribution public.daily_result_distributions%rowtype; snapshot public.daily_result_snapshots%rowtype;
 task public.daily_operator_tasks%rowtype; protocol text; assignment jsonb; total integer:=0; actor uuid:=auth.uid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role IN ('admin','manager') AND operational_status IN ('Ativo','Promovido')) THEN RAISE EXCEPTION 'Remoção restrita a ADM/Gestor'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))<10 OR length(p_reason)>1500 THEN RAISE EXCEPTION 'Informe justificativa de 10 a 1500 caracteres'; END IF;
 IF p_protocols IS NULL OR cardinality(p_protocols) NOT BETWEEN 1 AND 500 OR array_position(p_protocols,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Selecione de 1 a 500 protocolos'; END IF;
 SELECT * INTO snapshot FROM public.daily_result_snapshots WHERE id=p_snapshot AND operational_day=p_day;
 IF NOT FOUND THEN RAISE EXCEPTION 'Extração não encontrada para esta data'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||p_day::text,0));
 IF EXISTS(SELECT 1 FROM public.sri_general_day_closures WHERE operational_day=p_day)
 OR EXISTS(SELECT 1 FROM public.sri_result_day_closures WHERE operational_day=p_day AND status IN ('closed','closed_with_pending'))
 OR EXISTS(SELECT 1 FROM public.sri_result_shift_closures WHERE operational_day=p_day AND team_id IS NOT DISTINCT FROM snapshot.team_id AND shift_label=snapshot.shift_label AND status='closed') THEN RAISE EXCEPTION 'Dia ou turno fechado. Realize a reabertura autorizada antes de remover atribuições'; END IF;
 SELECT * INTO distribution FROM public.daily_result_distributions WHERE snapshot_id=p_snapshot FOR UPDATE;
 IF NOT FOUND OR distribution.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'A distribuição mudou. Consulte novamente antes de remover'; END IF;
 FOR protocol IN SELECT DISTINCT x FROM unnest(p_protocols) x ORDER BY x LOOP
  SELECT * INTO task FROM public.daily_operator_tasks WHERE snapshot_id=p_snapshot AND protocol_number=protocol FOR UPDATE;
  assignment:=distribution.state->'assignments'->protocol;
  IF assignment IS NULL AND NOT coalesce(task.active,false) THEN RAISE EXCEPTION 'Protocolo sem atribuição removível: %',protocol; END IF;
  IF coalesce(task.work_status,'pending')<>'pending' OR coalesce(nullif(task.treatment_status,'SEM STATUS'),'')<>'' OR coalesce(distribution.state->'statuses'->protocol->>'status',distribution.state->'statuses'->>protocol,'') NOT IN ('','SEM STATUS') OR coalesce(private.sri_p03_is_completed(task.work_status,task.treatment_status),false) OR EXISTS(SELECT 1 FROM public.daily_operator_treatments WHERE task_id=task.id) THEN RAISE EXCEPTION 'Protocolo com tratativa/conclusão preservado: %',protocol; END IF;
  INSERT INTO private.sri_distribution_removals(snapshot_id,protocol_number,task_id,operator_id,removed_by,reason,previous_assignment,previous_task)
  VALUES(p_snapshot,protocol,task.id,task.operator_user_id,actor,btrim(p_reason),assignment,CASE WHEN task.id IS NULL THEN NULL ELSE to_jsonb(task) END);
  IF task.id IS NOT NULL THEN UPDATE public.daily_operator_tasks SET active=false,updated_at=clock_timestamp() WHERE id=task.id; END IF;
  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES(actor,'DISTRIBUTION_ASSIGNMENT_REMOVED',CASE WHEN task.id IS NULL THEN 'daily_result_distribution' ELSE 'daily_operator_task' END,coalesce(task.id,p_snapshot)::text,
    jsonb_build_object('reason',btrim(p_reason),'event_protocol',protocol,'snapshot_id',p_snapshot,'operational_day',p_day,'shift',snapshot.shift_label,'previous_value',assignment,'new_value',NULL));
  distribution.state:=jsonb_set(distribution.state,'{assignments}',coalesce(distribution.state->'assignments','{}')-protocol);
  total:=total+1;
 END LOOP;
 UPDATE public.daily_result_distributions SET state=distribution.state,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() WHERE snapshot_id=p_snapshot;
 RETURN jsonb_build_object('removed',total,'revision',p_revision+1);
END $$;

-- A removed task must not return as an old pending item or be reactivated by stale publication.
CREATE OR REPLACE FUNCTION private.sri_guard_removed_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.active AND EXISTS(SELECT 1 FROM private.sri_distribution_removals r WHERE r.snapshot_id=NEW.snapshot_id AND r.protocol_number=NEW.protocol_number AND r.operator_id=NEW.operator_user_id) THEN RAISE EXCEPTION 'Atribuição removida nesta extração. Redistribua para um responsável autorizado em uma nova extração'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sri_guard_removed_assignment ON public.daily_operator_tasks;
CREATE TRIGGER sri_guard_removed_assignment BEFORE INSERT OR UPDATE ON public.daily_operator_tasks FOR EACH ROW EXECUTE FUNCTION private.sri_guard_removed_assignment();
DO $$DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('private.sri_p03_my_unresolved()'::regprocedure);
 IF position('sri_distribution_removals' IN definition)=0 THEN
  definition:=replace(definition,'t.protocol_number,t.operator_user_id,t.work_status','t.id,t.protocol_number,t.operator_user_id,t.work_status');
  definition:=replace(definition,'WHERE t.operator_user_id=auth.uid()','WHERE t.operator_user_id=auth.uid() AND NOT EXISTS(SELECT 1 FROM private.sri_distribution_removals r WHERE r.task_id=t.id AND r.operator_id=t.operator_user_id)');
  IF position('sri_distribution_removals' IN definition)=0 THEN RAISE EXCEPTION 'Definição de pendências incompatível'; END IF;
  EXECUTE definition;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.sri_distribution_history(p_day date,p_snapshot uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.sri_distribution_history(p_day,p_snapshot)$$;
CREATE OR REPLACE FUNCTION public.sri_distribution_unassign(p_day date,p_snapshot uuid,p_revision bigint,p_protocols text[],p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.sri_distribution_unassign(p_day,p_snapshot,p_revision,p_protocols,p_reason)$$;
REVOKE ALL ON FUNCTION private.sri_guard_removed_assignment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sri_distribution_history(date,uuid),public.sri_distribution_history(date,uuid),private.sri_distribution_unassign(date,uuid,bigint,text[],text),public.sri_distribution_unassign(date,uuid,bigint,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_distribution_history(date,uuid),public.sri_distribution_history(date,uuid),private.sri_distribution_unassign(date,uuid,bigint,text[],text),public.sri_distribution_unassign(date,uuid,bigint,text[],text) TO authenticated;
COMMIT;
