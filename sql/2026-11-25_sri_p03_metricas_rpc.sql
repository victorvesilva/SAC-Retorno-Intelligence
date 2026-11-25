BEGIN;
CREATE TABLE IF NOT EXISTS private.sri_p03_rpc_metrics(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 0 AND 2147483647),
 failed boolean NOT NULL
);
ALTER TABLE private.sri_p03_rpc_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_p03_rpc_metrics FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS sri_p03_rpc_time ON private.sri_p03_rpc_metrics(occurred_at,actor_id);
CREATE INDEX IF NOT EXISTS sri_p03_rpc_actor_time ON private.sri_p03_rpc_metrics(actor_id,occurred_at);
CREATE OR REPLACE FUNCTION private.sri_p03_rpc_measure(p_duration integer,p_failed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
 IF p_duration IS NULL OR p_duration NOT BETWEEN 0 AND 2147483647 OR p_failed IS NULL THEN RAISE EXCEPTION 'Medição inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-rpc-metric:'||auth.uid()::text,0));
 IF (SELECT count(*) FROM private.sri_p03_rpc_metrics WHERE actor_id=auth.uid() AND occurred_at>now()-interval '1 minute')>=200 THEN RETURN; END IF;
 INSERT INTO private.sri_p03_rpc_metrics(actor_id,duration_ms,failed) VALUES(auth.uid(),p_duration,p_failed);
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_rpc_measure(p_duration integer,p_failed boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.sri_p03_rpc_measure(p_duration,p_failed);
$$;
CREATE OR REPLACE FUNCTION private.sri_p03_rpc_metrics(p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin')
 THEN RAISE EXCEPTION 'Acesso exclusivo ao administrador'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '367 days' THEN RAISE EXCEPTION 'Período inválido'; END IF;
 RETURN (SELECT jsonb_build_object('calls',count(*),'errors',count(*) FILTER(WHERE failed),
  'average_ms',round(avg(duration_ms)),'p95_ms',percentile_disc(0.95) WITHIN GROUP(ORDER BY duration_ms),
  'maximum_ms',max(duration_ms),'source','browser')
  FROM private.sri_p03_rpc_metrics WHERE occurred_at>=p_from AND occurred_at<p_to);
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_rpc_metrics(p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.sri_p03_rpc_metrics(p_from,p_to);
$$;
REVOKE ALL ON FUNCTION private.sri_p03_rpc_measure(integer,boolean),public.sri_p03_rpc_measure(integer,boolean),
 private.sri_p03_rpc_metrics(timestamptz,timestamptz),public.sri_p03_rpc_metrics(timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_rpc_measure(integer,boolean),public.sri_p03_rpc_measure(integer,boolean),
 private.sri_p03_rpc_metrics(timestamptz,timestamptz),public.sri_p03_rpc_metrics(timestamptz,timestamptz) TO authenticated;
COMMIT;
