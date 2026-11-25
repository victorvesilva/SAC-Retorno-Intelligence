BEGIN;
CREATE INDEX IF NOT EXISTS sri_p03_treatment_task_actor ON public.daily_operator_treatments(task_id,actor_id);
CREATE INDEX IF NOT EXISTS sri_p03_task_productivity_date ON public.daily_operator_tasks(operational_day,team_id,operator_user_id,protocol_number);
CREATE INDEX IF NOT EXISTS sri_p03_treatment_actor_date ON public.daily_operator_treatments(actor_id,created_at,id DESC);
CREATE INDEX IF NOT EXISTS sri_p03_audit_object_page ON public.audit_events(object_type,object_id,id DESC);

CREATE OR REPLACE FUNCTION private.sri_p03_audit_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task public.daily_operator_tasks%rowtype; actor_name text; actor_role text;
BEGIN
 IF jsonb_typeof(NEW.details) IS DISTINCT FROM 'object' THEN
  NEW.details:=CASE WHEN NEW.details IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('original_details',NEW.details) END;
 END IF;
 SELECT full_name,role INTO actor_name,actor_role FROM public.profiles WHERE id=NEW.user_id;
 NEW.details:=NEW.details||jsonb_build_object('actor_name_at_event',actor_name,'actor_role_at_event',actor_role,
  'event_origin',CASE WHEN NEW.user_id IS NULL THEN 'database' ELSE 'user' END);
 IF NEW.object_type='daily_operator_task' THEN
  SELECT * INTO task FROM public.daily_operator_tasks WHERE id=CASE WHEN NEW.object_id ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN NEW.object_id::uuid END;
  IF FOUND THEN
   NEW.details:=NEW.details||jsonb_build_object('event_protocol',task.protocol_number,'event_base',task.base_name,
    'event_area',task.area_name,'event_team_id',task.team_id,'event_snapshot_id',task.snapshot_id);
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sri_p03_audit_context ON public.audit_events;
CREATE TRIGGER sri_p03_audit_context BEFORE INSERT ON public.audit_events
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_audit_context();

CREATE OR REPLACE FUNCTION private.sri_p03_task_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE action_name text; previous_value jsonb; next_value jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  action_name:=CASE WHEN NEW.carried_from_task_id IS NULL THEN 'TASK_ASSIGNED' ELSE 'TASK_CARRIED' END;
  next_value:=jsonb_build_object('operator',NEW.operator_user_id,'team',NEW.team_id,'active',NEW.active,'carried_from',NEW.carried_from_task_id);
 ELSIF NEW.operator_user_id IS DISTINCT FROM OLD.operator_user_id OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN
  action_name:='TASK_REASSIGNED';
  previous_value:=jsonb_build_object('operator',OLD.operator_user_id,'team',OLD.team_id);
  next_value:=jsonb_build_object('operator',NEW.operator_user_id,'team',NEW.team_id);
 ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
  action_name:=CASE WHEN NEW.active THEN 'TASK_ACTIVATED' ELSE 'TASK_ARCHIVED' END;
  previous_value:=to_jsonb(OLD.active);next_value:=to_jsonb(NEW.active);
 ELSE
  previous_value:=jsonb_build_object('base',OLD.base_name,'area',OLD.area_name,'source',OLD.source_status,'criticality',OLD.criticality,'due_date',OLD.due_date);
  next_value:=jsonb_build_object('base',NEW.base_name,'area',NEW.area_name,'source',NEW.source_status,'criticality',NEW.criticality,'due_date',NEW.due_date);
  IF previous_value IS NOT DISTINCT FROM next_value THEN RETURN NEW; END IF;
  action_name:='TASK_METADATA_CHANGED';
 END IF;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES(auth.uid(),action_name,'daily_operator_task',NEW.id::text,
  jsonb_build_object('previous_value',previous_value,'new_value',next_value));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sri_p03_task_movement ON public.daily_operator_tasks;
CREATE TRIGGER sri_p03_task_movement AFTER INSERT OR UPDATE ON public.daily_operator_tasks
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_task_movement();

CREATE OR REPLACE FUNCTION private.sri_movement_read(p_from timestamptz,p_to timestamptz,p_protocol text,p_before bigint DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;
BEGIN
 SELECT role INTO role_name FROM public.profiles WHERE id=auth.uid();
 IF role_name IS NULL OR role_name NOT IN ('admin','manager','supervisor','assistant') THEN RAISE EXCEPTION 'Acesso restrito à gestão'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '367 days' THEN RAISE EXCEPTION 'Período inválido'; END IF;
 RETURN QUERY
 SELECT jsonb_build_object('id',e.id::text,'occurred_at',e.occurred_at,'action',e.action,
 'protocol',coalesce(e.details->>'event_protocol',task.protocol_number),
 'base',e.details->>'event_base','area',e.details->>'event_area',
 'responsavel',coalesce(e.details->>'actor_name_at_event',actor.full_name,'Banco de dados / autoria não informada'),
 'perfil',coalesce(e.details->>'actor_role_at_event','Não registrado'),
 'origin',coalesce(e.details->>'event_origin','Não registrado'),'justificativa',coalesce(e.details->>'reason',e.details->>'justification'),
 'anterior',coalesce(e.details->>'previous_treatment_status',e.details->>'previous_value'),
 'novo',coalesce(e.details->>'treatment_status',e.details->>'new_value'),'object_type',e.object_type)
 FROM public.audit_events e
 LEFT JOIN public.daily_operator_tasks task ON e.object_type='daily_operator_task' AND e.object_id=task.id::text
 LEFT JOIN public.profiles actor ON actor.id=e.user_id
 WHERE e.occurred_at>=p_from AND e.occurred_at<p_to AND (p_before IS NULL OR e.id<p_before)
 AND (p_protocol IS NULL OR coalesce(e.details->>'event_protocol',task.protocol_number)=p_protocol)
 AND (role_name IN ('admin','manager') OR private.is_supervisor_of(
  coalesce((e.details->>'event_team_id')::uuid,task.team_id)))
 ORDER BY e.id DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_audit_context(),private.sri_p03_task_movement() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sri_movement_read(timestamptz,timestamptz,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_movement_read(timestamptz,timestamptz,text,bigint) TO authenticated;
COMMIT;
