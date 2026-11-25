BEGIN;
ALTER TABLE public.daily_operator_tasks ADD COLUMN IF NOT EXISTS carried_from_task_id uuid
 REFERENCES public.daily_operator_tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_operator_tasks ADD COLUMN IF NOT EXISTS completed_operational_day date;
CREATE OR REPLACE FUNCTION private.sri_carry_task_status()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prior public.daily_operator_tasks%rowtype; completed boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'sri-protocol-scope:'||(SELECT coalesce(s.team_id::text,'general') FROM public.daily_result_snapshots s WHERE s.id=NEW.snapshot_id)||':'||NEW.protocol_number,0));
 IF EXISTS(
  SELECT 1 FROM public.daily_operator_tasks newer
  JOIN public.daily_result_snapshots newer_snapshot ON newer_snapshot.id=newer.snapshot_id
  JOIN public.daily_result_snapshots target_snapshot ON target_snapshot.id=NEW.snapshot_id
  WHERE newer.protocol_number=NEW.protocol_number AND newer.operational_day>NEW.operational_day
  AND newer_snapshot.team_id IS NOT DISTINCT FROM target_snapshot.team_id
 ) THEN RAISE EXCEPTION 'Existe carteira de data posterior para este protocolo. Atualize a apuração antes de publicar'; END IF;
 SELECT task.* INTO prior FROM public.daily_operator_tasks task
 JOIN public.daily_result_snapshots old_snapshot ON old_snapshot.id=task.snapshot_id
 JOIN public.daily_result_snapshots new_snapshot ON new_snapshot.id=NEW.snapshot_id
 WHERE task.protocol_number=NEW.protocol_number AND task.snapshot_id<>NEW.snapshot_id
 AND task.operational_day<=NEW.operational_day
 AND old_snapshot.team_id IS NOT DISTINCT FROM new_snapshot.team_id
 AND (task.active OR task.work_status='completed_in_tool' OR private.sri_p03_status_sigo(task.treatment_status)=3)
 ORDER BY task.operational_day DESC,task.updated_at DESC,task.id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NEW; END IF;
 completed:=prior.work_status='completed_in_tool' OR coalesce(private.sri_p03_status_sigo(prior.treatment_status)=3,false);
 IF prior.operator_user_id IS DISTINCT FROM NEW.operator_user_id
 AND (prior.work_status<>'pending' OR completed OR EXISTS(
  SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=prior.id)) THEN
  RAISE EXCEPTION 'Protocolo com tratativa anterior: concilie o responsável antes de redistribuir';
 END IF;
 IF prior.operator_user_id=NEW.operator_user_id THEN
  NEW.carried_from_task_id:=prior.id;
  NEW.treatment_status:=prior.treatment_status;
  NEW.work_status:=CASE WHEN completed THEN 'completed_in_tool' ELSE prior.work_status END;
  NEW.completed_operational_day:=CASE WHEN completed THEN coalesce(prior.completed_operational_day,prior.operational_day) END;
  IF completed AND NEW.completed_operational_day<NEW.operational_day THEN NEW.active:=false; END IF;
  NEW.base_name:=coalesce(nullif(btrim(NEW.base_name),''),prior.base_name);
  NEW.area_name:=coalesce(nullif(btrim(NEW.area_name),''),prior.area_name);
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.sri_p03_completion_day()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.work_status='completed_in_tool' AND
 (NEW.work_status IS DISTINCT FROM OLD.work_status OR NEW.treatment_status IS DISTINCT FROM OLD.treatment_status OR NEW.completed_operational_day IS NULL)
 THEN NEW.completed_operational_day:=NEW.operational_day;
 ELSIF NEW.work_status<>'completed_in_tool' THEN NEW.completed_operational_day:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sri_p03_completion_day ON public.daily_operator_tasks;
CREATE TRIGGER sri_p03_completion_day BEFORE UPDATE ON public.daily_operator_tasks
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_completion_day();

CREATE OR REPLACE FUNCTION private.sri_p03_roll_forward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT NEW.active THEN RETURN NEW; END IF;
 IF EXISTS(
  SELECT 1 FROM public.daily_operator_tasks previous_task
  JOIN public.daily_result_snapshots old_snapshot ON old_snapshot.id=previous_task.snapshot_id
  JOIN public.daily_result_snapshots new_snapshot ON new_snapshot.id=NEW.snapshot_id
  WHERE previous_task.id<>NEW.id AND previous_task.protocol_number=NEW.protocol_number AND previous_task.active
  AND previous_task.operational_day<=NEW.operational_day
  AND old_snapshot.team_id IS NOT DISTINCT FROM new_snapshot.team_id
  AND NOT private.sri_p03_can_manage_task(previous_task.operator_user_id,previous_task.team_id)
 ) THEN RAISE EXCEPTION 'Atribuição anterior fora do escopo autorizado: revisão da gestão necessária'; END IF;
 UPDATE public.daily_operator_tasks previous_task SET active=false,updated_at=clock_timestamp()
 FROM public.daily_result_snapshots old_snapshot,public.daily_result_snapshots new_snapshot
 WHERE previous_task.snapshot_id=old_snapshot.id AND new_snapshot.id=NEW.snapshot_id
 AND previous_task.id<>NEW.id AND previous_task.protocol_number=NEW.protocol_number AND previous_task.active
 AND previous_task.operational_day<=NEW.operational_day
 AND old_snapshot.team_id IS NOT DISTINCT FROM new_snapshot.team_id
 AND private.sri_p03_can_manage_task(previous_task.operator_user_id,previous_task.team_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_completion_day(),private.sri_p03_roll_forward() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS z_sri_p03_roll_forward ON public.daily_operator_tasks;
CREATE TRIGGER z_sri_p03_roll_forward AFTER INSERT ON public.daily_operator_tasks
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_roll_forward();

CREATE OR REPLACE FUNCTION private.sri_p03_preserve_open_tasks(
 p_snapshot uuid,p_day date,p_shift text,p_scope_team uuid,p_revision bigint)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_count integer:=0;
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.daily_operator_tasks old
  JOIN public.daily_result_snapshots os ON os.id=old.snapshot_id
  JOIN public.daily_operator_tasks fresh ON fresh.snapshot_id=p_snapshot
       AND fresh.protocol_number=old.protocol_number
  WHERE old.snapshot_id<>p_snapshot AND old.active
   AND old.operational_day<=p_day
   AND os.team_id IS NOT DISTINCT FROM p_scope_team
   AND private.sri_p03_can_manage_task(old.operator_user_id,old.team_id)
   AND old.operator_user_id IS DISTINCT FROM fresh.operator_user_id
   AND (old.work_status<>'pending' OR EXISTS(
    SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=old.id))
 ) THEN
  RAISE EXCEPTION 'Distribuição conflita com tratativa prévia: revisão manual obrigatória';
 END IF;
 WITH prior AS (
  SELECT DISTINCT ON(old.protocol_number) old.*
  FROM public.daily_operator_tasks old
  JOIN public.daily_result_snapshots os ON os.id=old.snapshot_id
  WHERE old.snapshot_id<>p_snapshot AND old.active
   AND old.operational_day<=p_day
   AND os.team_id IS NOT DISTINCT FROM p_scope_team
   AND private.sri_p03_can_manage_task(old.operator_user_id,old.team_id)
   AND old.work_status<>'completed_in_tool'
   AND private.sri_p03_status_sigo(old.treatment_status) IS DISTINCT FROM 3
   AND NOT EXISTS (SELECT 1 FROM public.daily_operator_tasks fresh
     WHERE fresh.snapshot_id=p_snapshot AND fresh.protocol_number=old.protocol_number)
  ORDER BY old.protocol_number,old.updated_at DESC,old.id DESC
 )
 INSERT INTO public.daily_operator_tasks
  (snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,
   criticality,due_situation,sla_band,channel,source_status,work_status,
   treatment_status,active,distribution_revision,priority_reason,due_date,base_name,area_name)
 SELECT p_snapshot,old.team_id,p_day,p_shift,old.protocol_number,old.operator_user_id,
  old.criticality,old.due_situation,old.sla_band,old.channel,old.source_status,
  old.work_status,old.treatment_status,true,p_revision,old.priority_reason,old.due_date,
  old.base_name,old.area_name
 FROM prior old JOIN public.profiles op ON op.id=old.operator_user_id
  AND op.role='operator' AND op.operational_status IN ('Ativo','Promovido')
 ON CONFLICT(snapshot_id,protocol_number) DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 UPDATE public.daily_operator_tasks t SET distribution_revision=p_revision,updated_at=now()
 WHERE t.snapshot_id=p_snapshot AND t.active AND t.distribution_revision<>p_revision
   AND private.sri_p03_can_manage_task(t.operator_user_id,t.team_id)
   AND t.work_status<>'completed_in_tool'
   AND private.sri_p03_status_sigo(t.treatment_status) IS DISTINCT FROM 3;
 IF v_count>0 THEN
  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES(auth.uid(),'P03_UNFINISHED_CARRIED','daily_result',p_snapshot::text,
    jsonb_build_object('day',p_day,'shift',p_shift,'carried',v_count,'revision',p_revision));
 END IF;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_preserve_open_tasks(uuid,date,text,uuid,bigint) FROM PUBLIC,anon,authenticated;


-- Repeated publication must preserve the active flag derived by the carry trigger.
DO $publication_active$
DECLARE routine regprocedure; definition text;
BEGIN
 FOREACH routine IN ARRAY ARRAY['public.publish_daily_operator_tasks(uuid,bigint,jsonb)'::regprocedure,
  'public.publish_general_operator_tasks(uuid,bigint,jsonb)'::regprocedure] LOOP
  definition:=pg_get_functiondef(routine);
  definition:=replace(definition,'active=true,distribution_revision=EXCLUDED.distribution_revision',
   'active=EXCLUDED.active,distribution_revision=EXCLUDED.distribution_revision');
  EXECUTE definition;
 END LOOP;
END $publication_active$;
COMMIT;
