-- Marcação de caso sensível vinculada à tratativa e ao protocolo.
ALTER TABLE public.daily_operator_tasks ADD COLUMN IF NOT EXISTS is_special boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_operator_treatments ADD COLUMN IF NOT EXISTS is_special boolean NOT NULL DEFAULT false;
ALTER TABLE private.sri_treatment_requests ADD COLUMN IF NOT EXISTS is_special boolean;

CREATE OR REPLACE FUNCTION private.sri_capture_special_treatment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 SELECT t.is_special INTO NEW.is_special FROM public.daily_operator_tasks t WHERE t.id=NEW.task_id;
 NEW.event_context:=coalesce(NEW.event_context,'{}'::jsonb)||jsonb_build_object('is_special',NEW.is_special);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sri_capture_special_treatment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sri_special_treatment_context ON public.daily_operator_treatments;
CREATE TRIGGER sri_special_treatment_context BEFORE INSERT ON public.daily_operator_treatments
 FOR EACH ROW EXECUTE FUNCTION private.sri_capture_special_treatment();

CREATE OR REPLACE FUNCTION private.sri_carry_special_protocol()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.carried_from_task_id IS NOT NULL THEN
  SELECT t.is_special INTO NEW.is_special FROM public.daily_operator_tasks t
   WHERE t.id=NEW.carried_from_task_id AND t.protocol_number=NEW.protocol_number;
  NEW.is_special:=coalesce(NEW.is_special,false);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sri_carry_special_protocol() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sri_special_carry ON public.daily_operator_tasks;
CREATE TRIGGER sri_special_carry BEFORE INSERT ON public.daily_operator_tasks
 FOR EACH ROW EXECUTE FUNCTION private.sri_carry_special_protocol();

CREATE OR REPLACE FUNCTION private.sri_record_treatment_v3(
 p_task uuid,p_action text,p_notes text,p_expected timestamptz,p_request uuid,p_special boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor uuid:=auth.uid();
 task public.daily_operator_tasks%rowtype;
 prior private.sri_treatment_requests%rowtype;
 day_key date;
 treatment bigint;
 result jsonb;
BEGIN
 IF actor IS NULL OR p_request IS NULL OR p_expected IS NULL OR p_special IS NULL THEN
  RAISE EXCEPTION 'Sessão, versão ou sinalização inválida';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,0));
 SELECT * INTO prior FROM private.sri_treatment_requests WHERE actor_id=actor AND request_id=p_request;
 IF FOUND THEN
  IF prior.task_id<>p_task OR prior.action IS DISTINCT FROM p_action
   OR prior.notes IS DISTINCT FROM btrim(coalesce(p_notes,''))
   OR prior.is_special IS DISTINCT FROM p_special THEN RAISE EXCEPTION 'Solicitação já utilizada'; END IF;
  RETURN prior.result;
 END IF;
 SELECT operational_day INTO day_key FROM public.daily_operator_tasks WHERE id=p_task;
 IF NOT FOUND THEN RAISE EXCEPTION 'Demanda indisponível; atualize a carteira'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||day_key::text,0));
 SELECT * INTO task FROM public.daily_operator_tasks WHERE id=p_task FOR UPDATE;
 IF NOT FOUND OR NOT task.active THEN RAISE EXCEPTION 'Demanda indisponível; atualize a carteira'; END IF;
 IF task.updated_at IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'A demanda foi atualizada em outra sessão. Atualize a carteira antes de salvar';
 END IF;
 -- A rotina existente valida responsável, equipe, perfil, status e fechamento.
 -- Toda a operação é revertida se essa validação ou o registro falhar.
 UPDATE public.daily_operator_tasks SET is_special=p_special WHERE id=p_task;
 treatment:=public.record_daily_operator_treatment(p_task,p_action,p_notes);
 SELECT jsonb_build_object('treatment_id',treatment,'treatment_status',t.treatment_status,
  'work_status',t.work_status,'updated_at',t.updated_at,'is_special',t.is_special)
 INTO result FROM public.daily_operator_tasks t WHERE t.id=p_task;
 INSERT INTO private.sri_treatment_requests(actor_id,request_id,task_id,action,notes,result,is_special)
 VALUES(actor,p_request,p_task,p_action,btrim(coalesce(p_notes,'')),result,p_special);
 IF task.is_special IS DISTINCT FROM p_special THEN
  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES(actor,'PROTOCOL_SPECIAL_CHANGED','daily_operator_task',p_task::text,
   jsonb_build_object('team_id',task.team_id,'protocol_number',task.protocol_number,
    'previous_is_special',task.is_special,'is_special',p_special,'treatment_id',treatment));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.sri_record_treatment_v3(uuid,text,text,timestamptz,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_record_treatment_v3(uuid,text,text,timestamptz,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sri_record_treatment_v3(
 p_task uuid,p_action text,p_notes text,p_expected timestamptz,p_request uuid,p_special boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.sri_record_treatment_v3(p_task,p_action,p_notes,p_expected,p_request,p_special);
$$;
REVOKE ALL ON FUNCTION public.sri_record_treatment_v3(uuid,text,text,timestamptz,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_record_treatment_v3(uuid,text,text,timestamptz,uuid,boolean) TO authenticated;

-- A consulta utiliza as políticas existentes para tarefas e tratativas.
CREATE OR REPLACE FUNCTION public.sri_protocol_treatment_details(p_task uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH RECURSIVE lineage AS (
  SELECT t.id,t.carried_from_task_id,t.protocol_number,ARRAY[t.id] AS visited
  FROM public.daily_operator_tasks t WHERE t.id=p_task AND auth.uid() IS NOT NULL
  UNION ALL
  SELECT t.id,t.carried_from_task_id,t.protocol_number,l.visited||t.id
  FROM public.daily_operator_tasks t JOIN lineage l ON t.id=l.carried_from_task_id
  WHERE t.protocol_number=l.protocol_number AND NOT t.id=ANY(l.visited)
 ), latest AS (
  SELECT h.notes,h.is_special,h.created_at,h.event_context
  FROM public.daily_operator_treatments h JOIN lineage l ON l.id=h.task_id
  ORDER BY h.created_at DESC,h.id DESC LIMIT 1
 )
 SELECT jsonb_build_object('protocol_number',t.protocol_number,'is_special',t.is_special,
  'notes',h.notes,'recorded_special',h.is_special,'recorded_at',h.created_at,'actor_name',h.event_context->>'actor_name')
 FROM public.daily_operator_tasks t LEFT JOIN latest h ON true
 WHERE t.id=p_task AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.sri_protocol_treatment_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_protocol_treatment_details(uuid) TO authenticated;

COMMENT ON COLUMN public.daily_operator_tasks.is_special IS 'Caso sensível sinalizado na tratativa; independente da criticidade calculada.';
COMMENT ON COLUMN public.daily_operator_treatments.is_special IS 'Sinalização de caso sensível no momento desta tratativa.';
NOTIFY pgrst, 'reload schema';
