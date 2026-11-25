BEGIN;
CREATE TABLE IF NOT EXISTS private.sri_p03_monitor_occurrences(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_id bigint NOT NULL REFERENCES private.sri_monitor_events(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.sri_p03_monitor_occurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_p03_monitor_occurrences FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS sri_p03_occurrence_actor_time ON private.sri_p03_monitor_occurrences(actor_id,occurred_at);
CREATE INDEX IF NOT EXISTS sri_p03_occurrence_event_page ON private.sri_p03_monitor_occurrences(event_id,id DESC);

CREATE OR REPLACE FUNCTION private.sri_monitor_write(p_severity text,p_code text,p_module text,p_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); event_key bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor) THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
 IF p_severity IS NULL OR p_severity NOT IN ('INFO','SUCCESS','WARN','ERROR','FATAL')
 OR p_code IS NULL OR p_code NOT IN ('JS_ERROR','PROMISE_ERROR','PUBLISH_ERROR','PUBLISH_OK','MISSING_METADATA','RPC_ERROR','SLOW_RPC','AUTH_OK','AUTH_ERROR')
 OR p_module IS NULL OR p_module NOT IN ('Interface','Distribuição','Carteira','Supabase','Autenticação')
 OR p_version IS DISTINCT FROM 'pacote03-20261124' THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-monitor:'||actor::text,0));
 IF (SELECT count(*) FROM private.sri_p03_monitor_occurrences WHERE actor_id=actor AND occurred_at>now()-interval '1 minute')>=200 THEN RETURN; END IF;
 SELECT id INTO event_key FROM private.sri_monitor_events WHERE actor_id=actor AND code=p_code
 AND module=p_module AND severity=p_severity AND version=p_version AND occurred_at>now()-interval '5 minutes'
 ORDER BY id DESC LIMIT 1;
 IF event_key IS NULL THEN
  IF (SELECT count(*) FROM private.sri_monitor_events WHERE actor_id=actor AND occurred_at>now()-interval '1 minute')>=20 THEN RETURN; END IF;
  INSERT INTO private.sri_monitor_events(actor_id,severity,code,module,version)
  VALUES(actor,p_severity,p_code,p_module,p_version) RETURNING id INTO event_key;
 ELSE
  UPDATE private.sri_monitor_events SET occurrences=occurrences+1,last_at=clock_timestamp() WHERE id=event_key;
 END IF;
 INSERT INTO private.sri_p03_monitor_occurrences(event_id,actor_id) VALUES(event_key,actor);
END $$;

CREATE OR REPLACE FUNCTION private.sri_monitor_read(p_from timestamptz,p_to timestamptz,p_level text,p_before bigint DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Acesso exclusivo ao administrador'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '367 days' THEN RAISE EXCEPTION 'Período inválido'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',e.id::text,'occurred_at',e.occurred_at,'last_at',e.last_at,
 'severity',e.severity,'code',e.code,'module',e.module,'version',e.version,'occurrences',e.occurrences,'responsavel',p.full_name)
 FROM private.sri_monitor_events e LEFT JOIN public.profiles p ON p.id=e.actor_id
 WHERE e.occurred_at>=p_from AND e.occurred_at<p_to AND (p_level IS NULL OR e.severity=p_level)
 AND (p_before IS NULL OR e.id<p_before) ORDER BY e.id DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION private.sri_p03_monitor_occurrences(p_event bigint,p_before bigint DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Acesso exclusivo ao administrador'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',o.id::text,'event_id',o.event_id::text,'occurred_at',o.occurred_at)
 FROM private.sri_p03_monitor_occurrences o WHERE o.event_id=p_event AND (p_before IS NULL OR o.id<p_before)
 ORDER BY o.id DESC LIMIT 200;
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_monitor_occurrences(p_event bigint,p_before bigint DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.sri_p03_monitor_occurrences(p_event,p_before);
$$;
REVOKE ALL ON FUNCTION private.sri_monitor_write(text,text,text,text),
 private.sri_monitor_read(timestamptz,timestamptz,text,bigint),
 private.sri_p03_monitor_occurrences(bigint,bigint),public.sri_p03_monitor_occurrences(bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_monitor_write(text,text,text,text),
 private.sri_monitor_read(timestamptz,timestamptz,text,bigint),
 private.sri_p03_monitor_occurrences(bigint,bigint),public.sri_p03_monitor_occurrences(bigint,bigint) TO authenticated;
COMMIT;
