BEGIN;
CREATE TABLE IF NOT EXISTS private.sri_monitor_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL, severity text NOT NULL CHECK(severity IN ('INFO','SUCCESS','WARN','ERROR','FATAL')), code text NOT NULL, module text NOT NULL, version text NOT NULL, occurrences integer NOT NULL DEFAULT 1, last_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.sri_monitor_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_monitor_events FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS sri_monitor_actor_time ON private.sri_monitor_events(actor_id,occurred_at DESC);
CREATE OR REPLACE FUNCTION private.sri_monitor_write(p_severity text,p_code text,p_module text,p_version text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid:=auth.uid(); existing bigint;
BEGIN
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=a) THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
 IF p_severity NOT IN ('INFO','SUCCESS','WARN','ERROR','FATAL') OR p_code IS NULL OR p_code NOT IN ('JS_ERROR','PROMISE_ERROR','PUBLISH_ERROR','PUBLISH_OK','MISSING_METADATA','RPC_ERROR','SLOW_RPC','AUTH_OK','AUTH_ERROR') OR p_module IS NULL OR p_module NOT IN ('Interface','Distribuição','Carteira','Supabase','Autenticação') OR p_version IS DISTINCT FROM 'pacote03-20261124' THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-monitor:'||a::text,0));
 SELECT id INTO existing FROM private.sri_monitor_events WHERE actor_id=a AND code=p_code AND module=p_module AND severity=p_severity AND version=p_version AND occurred_at>now()-interval '5 minutes' ORDER BY id DESC LIMIT 1;
 IF existing IS NOT NULL THEN UPDATE private.sri_monitor_events SET occurrences=occurrences+1,last_at=now() WHERE id=existing; RETURN; END IF;
 IF (SELECT count(*) FROM private.sri_monitor_events WHERE actor_id=a AND occurred_at>now()-interval '1 minute')>=20 THEN RETURN; END IF;
 INSERT INTO private.sri_monitor_events(actor_id,severity,code,module,version) VALUES(a,p_severity,p_code,p_module,p_version);
END; $$;
CREATE OR REPLACE FUNCTION private.sri_monitor_read(p_from timestamptz,p_to timestamptz,p_level text,p_before bigint DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Acesso exclusivo ao administrador'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',e.id,'occurred_at',e.occurred_at,'last_at',e.last_at,'severity',e.severity,'code',e.code,'module',e.module,'version',e.version,'occurrences',e.occurrences,'responsavel',p.full_name) FROM private.sri_monitor_events e LEFT JOIN public.profiles p ON p.id=e.actor_id WHERE e.occurred_at>=greatest(p_from,now()-interval '90 days') AND e.occurred_at<p_to AND (p_level IS NULL OR e.severity=p_level) AND (p_before IS NULL OR e.id<p_before) ORDER BY e.id DESC LIMIT 200;
END; $$;
CREATE OR REPLACE FUNCTION private.sri_movement_read(p_from timestamptz,p_to timestamptz,p_protocol text,p_before bigint DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;
BEGIN
 SELECT role INTO role_name FROM public.profiles WHERE id=auth.uid();
 IF role_name IS NULL OR role_name NOT IN ('admin','manager','supervisor') THEN RAISE EXCEPTION 'Acesso restrito à gestão'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',e.id,'occurred_at',e.occurred_at,'action',e.action,'protocol',t.protocol_number,'base',t.base_name,'area',t.area_name,'responsavel',p.full_name,'perfil',p.role,'anterior',coalesce(e.details->>'previous_treatment_status',e.details->>'previous_value'),'novo',coalesce(e.details->>'treatment_status',e.details->>'new_value'),'object_type',e.object_type) FROM public.audit_events e LEFT JOIN public.daily_operator_tasks t ON e.object_type='daily_operator_task' AND e.object_id=t.id::text LEFT JOIN public.profiles p ON p.id=e.user_id WHERE e.occurred_at>=p_from AND e.occurred_at<p_to AND (p_before IS NULL OR e.id<p_before) AND (p_protocol IS NULL OR t.protocol_number=p_protocol) AND (role_name IN ('admin','manager') OR (t.team_id IS NOT NULL AND private.is_supervisor_of(t.team_id))) ORDER BY e.id DESC LIMIT 200;
END; $$;
REVOKE ALL ON FUNCTION private.sri_monitor_write(text,text,text,text),private.sri_monitor_read(timestamptz,timestamptz,text,bigint),private.sri_movement_read(timestamptz,timestamptz,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_monitor_write(text,text,text,text),private.sri_monitor_read(timestamptz,timestamptz,text,bigint),private.sri_movement_read(timestamptz,timestamptz,text,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_monitor_write(p_severity text,p_code text,p_module text,p_version text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sri_monitor_write(p_severity,p_code,p_module,p_version); $$;
CREATE OR REPLACE FUNCTION public.sri_monitor_read(p_from timestamptz,p_to timestamptz,p_level text,p_before bigint DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.sri_monitor_read(p_from,p_to,p_level,p_before); $$;
CREATE OR REPLACE FUNCTION public.sri_movement_read(p_from timestamptz,p_to timestamptz,p_protocol text,p_before bigint DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.sri_movement_read(p_from,p_to,p_protocol,p_before); $$;
REVOKE ALL ON FUNCTION public.sri_monitor_write(text,text,text,text),public.sri_monitor_read(timestamptz,timestamptz,text,bigint),public.sri_movement_read(timestamptz,timestamptz,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_monitor_write(text,text,text,text),public.sri_monitor_read(timestamptz,timestamptz,text,bigint),public.sri_movement_read(timestamptz,timestamptz,text,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION private.sri_preserve_task_metadata() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 NEW.base_name:=nullif(btrim(NEW.base_name),''); NEW.area_name:=nullif(btrim(NEW.area_name),'');
 IF TG_OP='UPDATE' THEN NEW.base_name:=coalesce(NEW.base_name,OLD.base_name); NEW.area_name:=coalesce(NEW.area_name,OLD.area_name); END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS sri_preserve_task_metadata ON public.daily_operator_tasks;
CREATE TRIGGER sri_preserve_task_metadata BEFORE INSERT OR UPDATE ON public.daily_operator_tasks FOR EACH ROW EXECUTE FUNCTION private.sri_preserve_task_metadata();
COMMIT;