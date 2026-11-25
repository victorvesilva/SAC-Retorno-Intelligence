BEGIN;
-- Trigger enforcement also covers overlapping permissive RLS policies.
CREATE OR REPLACE FUNCTION private.sri_p03_guard_distribution_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE targets uuid[]:=ARRAY[NEW.snapshot_id]; target uuid; snapshot public.daily_result_snapshots%rowtype;
BEGIN
 IF TG_OP='UPDATE' THEN targets:=array_append(targets,OLD.snapshot_id); END IF;
 FOREACH target IN ARRAY targets LOOP
  SELECT * INTO snapshot FROM public.daily_result_snapshots WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuração indisponível'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||snapshot.operational_day::text,0));
  IF EXISTS(SELECT 1 FROM public.sri_general_day_closures WHERE operational_day=snapshot.operational_day)
  OR EXISTS(SELECT 1 FROM public.sri_result_day_closures WHERE operational_day=snapshot.operational_day AND status IN ('closed','closed_with_pending'))
  OR EXISTS(SELECT 1 FROM public.sri_result_shift_closures WHERE operational_day=snapshot.operational_day AND team_id=snapshot.team_id AND shift_label=snapshot.shift_label AND status='closed')
  THEN RAISE EXCEPTION 'Dia ou turno encerrado: distribuição bloqueada até reabertura autorizada'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_guard_distribution_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sri_p03_guard_distribution_write ON public.daily_result_distributions;
CREATE TRIGGER sri_p03_guard_distribution_write BEFORE INSERT OR UPDATE ON public.daily_result_distributions
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_guard_distribution_write();
COMMIT;
