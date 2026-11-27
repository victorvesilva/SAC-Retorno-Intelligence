BEGIN;
CREATE TABLE IF NOT EXISTS public.sri_import_index_state (
 snapshot_id uuid PRIMARY KEY REFERENCES public.daily_result_snapshots(id) ON DELETE CASCADE,
 payload_sha256 text NOT NULL, imported_at timestamptz, indexed_at timestamptz NOT NULL DEFAULT now(), protocol_count integer NOT NULL CHECK(protocol_count>=0)
);
CREATE TABLE IF NOT EXISTS public.sri_protocol_imports (
 snapshot_id uuid NOT NULL REFERENCES public.daily_result_snapshots(id) ON DELETE CASCADE,
 protocol_number text NOT NULL CHECK(length(protocol_number) BETWEEN 1 AND 80),operational_day date NOT NULL,
 source_rows jsonb NOT NULL CHECK(jsonb_typeof(source_rows)='array'),PRIMARY KEY(protocol_number,snapshot_id)
);
CREATE INDEX IF NOT EXISTS sri_protocol_imports_calendar ON public.sri_protocol_imports(protocol_number,operational_day,snapshot_id);
CREATE INDEX IF NOT EXISTS sri_protocol_imports_snapshot ON public.sri_protocol_imports(snapshot_id);
CREATE TABLE IF NOT EXISTS private.sri_import_index_jobs (
 snapshot_id uuid PRIMARY KEY REFERENCES public.daily_result_snapshots(id) ON DELETE CASCADE,
 job_id uuid NOT NULL, payload_sha256 text NOT NULL, lease_until timestamptz NOT NULL
);
ALTER TABLE public.sri_import_index_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sri_protocol_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sri_import_index_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sri_import_index_state,public.sri_protocol_imports,private.sri_import_index_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sri_import_index_state,public.sri_protocol_imports TO authenticated;
DROP POLICY IF EXISTS sri_import_index_read ON public.sri_import_index_state;
CREATE POLICY sri_import_index_read ON public.sri_import_index_state FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.daily_result_snapshots s WHERE s.id=public.sri_import_index_state.snapshot_id));
DROP POLICY IF EXISTS sri_protocol_imports_read ON public.sri_protocol_imports;
CREATE POLICY sri_protocol_imports_read ON public.sri_protocol_imports FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.daily_result_snapshots s JOIN public.sri_import_index_state ready ON ready.snapshot_id=s.id AND ready.payload_sha256=s.payload_sha256 WHERE s.id=public.sri_protocol_imports.snapshot_id));
-- Only the trusted worker can write derived records. Clients never submit history rows.
CREATE OR REPLACE FUNCTION public.sri_import_index_start(p_snapshot uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-import-index:'||p_snapshot::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.daily_result_snapshots WHERE id=p_snapshot AND payload_sha256=p_hash) THEN RAISE EXCEPTION 'Apuração indisponível'; END IF;
 IF EXISTS(SELECT 1 FROM public.sri_import_index_state WHERE snapshot_id=p_snapshot AND payload_sha256=p_hash) THEN RETURN jsonb_build_object('ready',true); END IF;
 IF EXISTS(SELECT 1 FROM private.sri_import_index_jobs WHERE snapshot_id=p_snapshot AND lease_until>now()) THEN RETURN jsonb_build_object('busy',true); END IF;
 job:=gen_random_uuid();
 DELETE FROM public.sri_import_index_state WHERE snapshot_id=p_snapshot;
 DELETE FROM public.sri_protocol_imports WHERE snapshot_id=p_snapshot;
 INSERT INTO private.sri_import_index_jobs VALUES(p_snapshot,job,p_hash,now()+interval '10 minutes')
 ON CONFLICT(snapshot_id) DO UPDATE SET job_id=excluded.job_id,payload_sha256=excluded.payload_sha256,lease_until=excluded.lease_until;
 RETURN jsonb_build_object('job',job);
END $$;
CREATE OR REPLACE FUNCTION public.sri_import_index_batch(p_snapshot uuid,p_job uuid,p_rows jsonb,p_final boolean DEFAULT false,p_total integer DEFAULT 0,p_imported timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot public.daily_result_snapshots%rowtype; job private.sri_import_index_jobs%rowtype; total integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-import-index:'||p_snapshot::text,0));
 SELECT * INTO job FROM private.sri_import_index_jobs WHERE snapshot_id=p_snapshot AND job_id=p_job;
 IF NOT FOUND OR job.lease_until<now() THEN RAISE EXCEPTION 'Preparação expirada'; END IF;
 SELECT * INTO snapshot FROM public.daily_result_snapshots WHERE id=p_snapshot AND payload_sha256=job.payload_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Apuração alterada'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 INSERT INTO public.sri_protocol_imports(snapshot_id,protocol_number,operational_day,source_rows)
 SELECT p_snapshot,r->>'protocol',snapshot.operational_day,r->'rows' FROM jsonb_array_elements(p_rows) r
 ON CONFLICT(protocol_number,snapshot_id) DO UPDATE SET source_rows=excluded.source_rows;
 IF p_final THEN
  SELECT count(*) INTO total FROM public.sri_protocol_imports WHERE snapshot_id=p_snapshot;
  IF total<>p_total OR p_total<0 THEN RAISE EXCEPTION 'Preparação incompleta'; END IF;
  INSERT INTO public.sri_import_index_state(snapshot_id,payload_sha256,imported_at,protocol_count) VALUES(p_snapshot,job.payload_sha256,p_imported,total)
  ON CONFLICT(snapshot_id) DO NOTHING;
  DELETE FROM private.sri_import_index_jobs WHERE snapshot_id=p_snapshot;
 END IF;
 RETURN jsonb_build_object('ready',p_final);
END $$;
CREATE OR REPLACE FUNCTION public.sri_import_index_abort(p_snapshot uuid,p_job uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE private.sri_import_index_jobs SET lease_until=now()-interval '1 second' WHERE snapshot_id=p_snapshot AND job_id=p_job;
$$;
REVOKE ALL ON FUNCTION public.sri_import_index_start(uuid,text),public.sri_import_index_batch(uuid,uuid,jsonb,boolean,integer,timestamptz),public.sri_import_index_abort(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sri_import_index_start(uuid,text),public.sri_import_index_batch(uuid,uuid,jsonb,boolean,integer,timestamptz),public.sri_import_index_abort(uuid,uuid) TO service_role;
CREATE TABLE IF NOT EXISTS private.sri_import_index_backfill_keys (
 token_hash text PRIMARY KEY,expires_at timestamptz NOT NULL,snapshot_ids uuid[] NOT NULL
);
ALTER TABLE private.sri_import_index_backfill_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_import_index_backfill_keys FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.sri_import_index_backfill_authorized(p_token text,p_snapshot uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.sri_import_index_backfill_keys WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND expires_at>now() AND p_snapshot=ANY(snapshot_ids));
$$;
REVOKE ALL ON FUNCTION public.sri_import_index_backfill_authorized(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sri_import_index_backfill_authorized(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.sri_protocol_import_calendar(p_protocol text,p_month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE first_day date:=date_trunc('month',p_month)::date; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','manager','supervisor','assistant')) THEN RAISE EXCEPTION 'Consulta não autorizada'; END IF;
 IF p_month IS NULL OR p_protocol IS NULL OR length(p_protocol) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
 SELECT jsonb_build_object('revision',(SELECT max(ready.indexed_at)::text FROM public.sri_import_index_state ready JOIN public.daily_result_snapshots s ON s.id=ready.snapshot_id WHERE s.operational_day>=first_day AND s.operational_day<(first_day+interval '1 month')),'days',coalesce((SELECT jsonb_agg(d ORDER BY day) FROM (
 SELECT h.operational_day AS day,count(*) AS count FROM public.sri_protocol_imports h
 WHERE h.protocol_number=p_protocol AND h.operational_day>=first_day AND h.operational_day<(first_day+interval '1 month') GROUP BY h.operational_day) d),'[]'::jsonb),
 'pending_days',coalesce((SELECT jsonb_agg(day ORDER BY day) FROM (SELECT DISTINCT s.operational_day AS day FROM public.daily_result_snapshots s
 WHERE s.operational_day>=first_day AND s.operational_day<(first_day+interval '1 month') AND NOT EXISTS(SELECT 1 FROM public.sri_import_index_state ready WHERE ready.snapshot_id=s.id AND ready.payload_sha256=s.payload_sha256)) d),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.sri_protocol_import_day(p_protocol text,p_day date,p_after uuid DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','manager','supervisor','assistant')) THEN RAISE EXCEPTION 'Consulta não autorizada'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',s.id,'day',h.operational_day,'shift',s.shift_label,'at',coalesce(ready.imported_at,s.created_at),'created',s.created_at,'rows',h.source_rows)
 FROM public.sri_protocol_imports h JOIN public.daily_result_snapshots s ON s.id=h.snapshot_id JOIN public.sri_import_index_state ready ON ready.snapshot_id=s.id AND ready.payload_sha256=s.payload_sha256
 WHERE h.protocol_number=p_protocol AND h.operational_day=p_day AND (p_after IS NULL OR s.id>p_after) ORDER BY s.id LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.sri_protocol_import_calendar(text,date),public.sri_protocol_import_day(text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_protocol_import_calendar(text,date),public.sri_protocol_import_day(text,date,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
