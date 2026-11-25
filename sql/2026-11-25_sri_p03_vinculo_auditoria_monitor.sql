BEGIN;
CREATE TABLE IF NOT EXISTS private.sri_p03_monitor_audit_links(
 occurrence_id bigint PRIMARY KEY REFERENCES private.sri_p03_monitor_occurrences(id) ON DELETE RESTRICT,
 event_id bigint NOT NULL REFERENCES private.sri_monitor_events(id) ON DELETE RESTRICT,
 audit_id bigint NOT NULL REFERENCES public.audit_events(id) ON DELETE RESTRICT
);
ALTER TABLE private.sri_p03_monitor_audit_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_p03_monitor_audit_links FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS sri_p03_monitor_link_event ON private.sri_p03_monitor_audit_links(event_id,occurrence_id);
CREATE OR REPLACE FUNCTION private.sri_p03_monitor_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_id bigint; occurrence_key bigint; event_key bigint;
BEGIN
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.action NOT IN
 ('DAY_TASK_TREATMENT','TASK_REOPENED','COMPLETION_GOAL_VERSION','STATUS_RECONCILIATION','RECONCILIATION_DECISION') THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id) THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-monitor:'||NEW.user_id::text,0));
 SELECT max(id) INTO previous_id FROM private.sri_p03_monitor_occurrences WHERE actor_id=NEW.user_id;
 PERFORM private.sri_monitor_write('INFO','OPERATION_AUDIT','Carteira','pacote03-20261124');
 SELECT id,event_id INTO occurrence_key,event_key FROM private.sri_p03_monitor_occurrences
 WHERE actor_id=NEW.user_id AND id>coalesce(previous_id,0) ORDER BY id DESC LIMIT 1;
 IF occurrence_key IS NOT NULL THEN
  INSERT INTO private.sri_p03_monitor_audit_links(occurrence_id,event_id,audit_id) VALUES(occurrence_key,event_key,NEW.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_monitor_audit() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sri_p03_monitor_audit ON public.audit_events;
CREATE TRIGGER sri_p03_monitor_audit AFTER INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION private.sri_p03_monitor_audit();
CREATE OR REPLACE FUNCTION private.sri_p03_monitor_occurrences(p_event bigint,p_before bigint DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Acesso exclusivo ao administrador'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',o.id::text,'event_id',o.event_id::text,'occurred_at',o.occurred_at,
  'audit_id',a.id::text,'audit_at',a.occurred_at,'protocol',a.details->>'event_protocol','action',a.action)
 FROM private.sri_p03_monitor_occurrences o LEFT JOIN private.sri_p03_monitor_audit_links l ON l.occurrence_id=o.id
 LEFT JOIN public.audit_events a ON a.id=l.audit_id WHERE o.event_id=p_event AND (p_before IS NULL OR o.id<p_before)
 ORDER BY o.id DESC LIMIT 200;
END $$;
COMMIT;
