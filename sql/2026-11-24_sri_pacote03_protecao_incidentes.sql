BEGIN;
-- Preserve autoria da tratativa entre apurações; não altera registros existentes.
CREATE OR REPLACE FUNCTION private.sri_carry_task_status()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old_task public.daily_operator_tasks%rowtype;
BEGIN
 SELECT t.* INTO old_task FROM public.daily_operator_tasks t
 JOIN public.daily_result_snapshots s ON s.id=t.snapshot_id
 JOIN public.daily_result_snapshots n ON n.id=NEW.snapshot_id
 WHERE t.operational_day=NEW.operational_day AND t.shift_label=NEW.shift_label
 AND t.protocol_number=NEW.protocol_number AND t.snapshot_id<>NEW.snapshot_id
 AND s.team_id IS NOT DISTINCT FROM n.team_id AND t.active
 ORDER BY t.updated_at DESC,t.id DESC LIMIT 1;
 IF FOUND AND old_task.operator_user_id=NEW.operator_user_id THEN
 NEW.treatment_status:=old_task.treatment_status; NEW.work_status:=old_task.work_status;
 ELSIF FOUND AND old_task.work_status='completed_in_tool' THEN
 RAISE EXCEPTION 'Protocolo finalizado na ferramenta: revisão da supervisão necessária antes da redistribuição';
 END IF;
 RETURN NEW;
END $$;
-- Proíbe transferência direta de uma tarefa tratada, preservando vínculo com seus eventos.
CREATE OR REPLACE FUNCTION private.sri_p03_guard_transfer()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.operator_user_id IS DISTINCT FROM NEW.operator_user_id AND
 (OLD.work_status='completed_in_tool' OR EXISTS(SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=OLD.id)) THEN
 RAISE EXCEPTION 'Protocolo com histórico de tratativa: revisão necessária antes de alterar o responsável';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sri_p03_guard_transfer ON public.daily_operator_tasks;
CREATE TRIGGER sri_p03_guard_transfer BEFORE UPDATE OF operator_user_id ON public.daily_operator_tasks FOR EACH ROW EXECUTE FUNCTION private.sri_p03_guard_transfer();
REVOKE ALL ON FUNCTION private.sri_p03_guard_transfer() FROM PUBLIC,anon,authenticated;
-- Incidentes técnicos: apenas identificador de evento e etapas predefinidas, sem texto sensível.
CREATE TABLE IF NOT EXISTS private.sri_p03_incidents (
 event_id bigint PRIMARY KEY REFERENCES private.sri_monitor_events(id) ON DELETE RESTRICT,
 stage text NOT NULL DEFAULT 'identified' CHECK(stage IN ('identified','analysis','correction','validation','resolved')),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.sri_p03_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_p03_incidents FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS private.sri_p03_incident_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_id bigint NOT NULL REFERENCES private.sri_p03_incidents(event_id),
 old_stage text,new_stage text NOT NULL,actor_id uuid NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.sri_p03_incident_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_p03_incident_history FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.sri_p03_incident_set(p_event bigint,p_expected text,p_stage text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_stage text; actor uuid:=auth.uid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='admin') THEN RAISE EXCEPTION 'Acesso exclusivo ao administrador'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.sri_monitor_events WHERE id=p_event AND severity IN ('ERROR','FATAL','WARN')) THEN RAISE EXCEPTION 'Evento indisponível'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-incident:'||p_event::text,0));
 SELECT stage INTO old_stage FROM private.sri_p03_incidents WHERE event_id=p_event;
 IF coalesce(old_stage,'identified') IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Incidente alterado; atualize a consulta'; END IF;
 IF p_stage IS NULL OR NOT ((coalesce(old_stage,'identified'),p_stage) IN (('identified','analysis'),('analysis','correction'),('correction','validation'),('validation','resolved'),('validation','correction'),('resolved','analysis'))) THEN RAISE EXCEPTION 'Transição inválida'; END IF;
 INSERT INTO private.sri_p03_incidents(event_id,stage,updated_by) VALUES(p_event,p_stage,actor)
 ON CONFLICT(event_id) DO UPDATE SET stage=EXCLUDED.stage,updated_by=actor,updated_at=now();
 INSERT INTO private.sri_p03_incident_history(event_id,old_stage,new_stage,actor_id) VALUES(p_event,coalesce(old_stage,'identified'),p_stage,actor);
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_incident_set(p_event bigint,p_expected text,p_stage text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sri_p03_incident_set(p_event,p_expected,p_stage); $$;
CREATE OR REPLACE FUNCTION private.sri_p03_incident_list()
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Acesso exclusivo ao administrador'; END IF;
 RETURN QUERY SELECT jsonb_build_object('event_id',i.event_id::text,'stage',i.stage,'updated_at',i.updated_at) FROM private.sri_p03_incidents i ORDER BY i.updated_at DESC LIMIT 1000;
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_incident_list()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.sri_p03_incident_list(); $$;
REVOKE ALL ON FUNCTION private.sri_p03_incident_set(bigint,text,text),public.sri_p03_incident_set(bigint,text,text),private.sri_p03_incident_list(),public.sri_p03_incident_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_incident_set(bigint,text,text),public.sri_p03_incident_set(bigint,text,text),private.sri_p03_incident_list(),public.sri_p03_incident_list() TO authenticated;
COMMIT;