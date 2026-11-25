-- Apply after the six Package 03 release migrations. Append-only capture starts
-- at installation. Earlier states cannot be inferred from mutable tasks.
BEGIN;
CREATE TABLE IF NOT EXISTS private.sri_p03_task_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id uuid NOT NULL,
 snapshot_id uuid NOT NULL,
 operational_day date NOT NULL,
 protocol_number text NOT NULL,
 team_id uuid,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 payload jsonb NOT NULL
);
ALTER TABLE private.sri_p03_task_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_p03_task_versions FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS sri_p03_version_snapshot_protocol
 ON private.sri_p03_task_versions(snapshot_id,protocol_number,captured_at DESC,id DESC);

CREATE OR REPLACE FUNCTION private.sri_p03_capture_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operator_name text; team_name text;
BEGIN
 SELECT p.full_name INTO operator_name FROM public.profiles p WHERE p.id=NEW.operator_user_id;
 SELECT t.name INTO team_name FROM public.teams t WHERE t.id=NEW.team_id;
 INSERT INTO private.sri_p03_task_versions(task_id,snapshot_id,operational_day,protocol_number,team_id,payload)
 VALUES(NEW.id,NEW.snapshot_id,NEW.operational_day,NEW.protocol_number,NEW.team_id,
   to_jsonb(NEW)||jsonb_build_object('operator_name',operator_name,'team_name',team_name));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_capture_task() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sri_p03_capture_task ON public.daily_operator_tasks;
CREATE TRIGGER sri_p03_capture_task AFTER INSERT OR UPDATE ON public.daily_operator_tasks
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_capture_task();

ALTER TABLE public.daily_operator_treatments ADD COLUMN IF NOT EXISTS event_context jsonb;
CREATE OR REPLACE FUNCTION private.sri_p03_capture_treatment_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Always derive the context on the server, even if a caller supplies a value.
 SELECT jsonb_build_object('protocol_number',t.protocol_number,
  'base_name',t.base_name,'area_name',t.area_name,'source_status',t.source_status,
  'work_status',private.sri_p03_status_work(NEW.action),'version','20261125')
 INTO NEW.event_context FROM public.daily_operator_tasks t WHERE t.id=NEW.task_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_capture_treatment_context() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sri_p03_capture_treatment_context ON public.daily_operator_treatments;
CREATE TRIGGER sri_p03_capture_treatment_context BEFORE INSERT ON public.daily_operator_treatments
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_capture_treatment_context();

CREATE OR REPLACE FUNCTION private.sri_p03_my_treatments_page(
 p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_before bigint DEFAULT NULL,p_limit integer DEFAULT 200
) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
  AND p.role='operator' AND p.operational_status IN ('Ativo','Promovido'))
 THEN RAISE EXCEPTION 'Acesso restrito ao operador autenticado'; END IF;
 IF p_from>p_to OR p_to-p_from>366 THEN RAISE EXCEPTION 'Período de consulta inválido'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',h.id::text,'action',h.action,'notes',h.notes,
  'created_at',h.created_at,'task_id',h.task_id,
  'protocol_number',coalesce(h.event_context->>'protocol_number',t.protocol_number),
  'base_name',h.event_context->>'base_name','area_name',h.event_context->>'area_name',
  'context_available',h.event_context IS NOT NULL)
 FROM public.daily_operator_treatments h LEFT JOIN public.daily_operator_tasks t ON t.id=h.task_id
 WHERE h.actor_id=auth.uid()
 AND (p_from IS NULL OR h.created_at >= (p_from::timestamp AT TIME ZONE 'America/Sao_Paulo'))
 AND (p_to IS NULL OR h.created_at < ((p_to+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
 AND (p_before IS NULL OR h.id<p_before)
 ORDER BY h.id DESC LIMIT greatest(1,least(coalesce(p_limit,200),200));
END $$;

CREATE OR REPLACE FUNCTION private.sri_p03_history_tasks(
 p_snapshot uuid,p_after text DEFAULT NULL,p_limit integer DEFAULT 200
) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer_role text; snapshot_day date;
BEGIN
 SELECT p.role INTO viewer_role FROM public.profiles p WHERE p.id=auth.uid();
 IF viewer_role IS NULL OR viewer_role NOT IN ('admin','manager','supervisor','assistant')
 THEN RAISE EXCEPTION 'Consulta histórica indisponível'; END IF;
 SELECT s.operational_day INTO snapshot_day FROM public.daily_result_snapshots s WHERE s.id=p_snapshot
 AND (viewer_role IN ('admin','manager') OR s.team_id IS NULL OR private.is_supervisor_of(s.team_id));
 IF NOT FOUND THEN RAISE EXCEPTION 'Apuração não autorizada'; END IF;
 RETURN QUERY
 SELECT v.payload||jsonb_build_object('captured_at',v.captured_at)
 FROM (
  SELECT DISTINCT ON(h.protocol_number) h.*
  FROM private.sri_p03_task_versions h WHERE h.snapshot_id=p_snapshot
  AND h.captured_at<((snapshot_day+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  AND (p_after IS NULL OR h.protocol_number>p_after)
  ORDER BY h.protocol_number,h.captured_at DESC,h.id DESC
 ) v
 WHERE viewer_role IN ('admin','manager')
 OR (v.team_id IS NOT NULL AND private.is_supervisor_of(v.team_id))
 ORDER BY v.protocol_number LIMIT greatest(1,least(coalesce(p_limit,200),200));
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_my_treatments_page(date,date,bigint,integer),
 private.sri_p03_history_tasks(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_my_treatments_page(date,date,bigint,integer),
 private.sri_p03_history_tasks(uuid,text,integer) TO authenticated;
COMMIT;
