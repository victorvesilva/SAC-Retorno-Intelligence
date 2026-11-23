-- SRI P1 / Fechamento: impedir fechamento de turno com distribuição não publicada.
-- NÃO EXECUTADO; proposta para homologação TI e revisão de negócio.
-- Mantém assinatura e controles originais; sem exclusão de dados.
BEGIN;
CREATE OR REPLACE FUNCTION public.sri_close_result_shift(p_snapshot uuid, p_revision bigint, p_confirm_last_import boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_snap public.daily_result_snapshots%rowtype; v_dist bigint; v_newer uuid;
        v_existing public.sri_result_shift_closures%rowtype; v_id uuid;
        v_tasks integer; v_pending_tasks integer; v_expected_assignments integer; v_mismatched_tasks integer; v_conf jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_confirm_last_import IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Confirme explicitamente que esta é a última importação do turno'; END IF;
 SELECT * INTO v_snap FROM public.daily_result_snapshots WHERE id=p_snapshot;
 IF NOT FOUND THEN RAISE EXCEPTION 'Apuração não encontrada'; END IF;
 IF NOT(private.is_manager() OR private.is_supervisor_of(v_snap.team_id))
 THEN RAISE EXCEPTION 'Equipe não autorizada para fechamento'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||v_snap.operational_day::text,0));
 SELECT s.id INTO v_newer FROM public.daily_result_snapshots s WHERE s.team_id=v_snap.team_id
  AND s.operational_day=v_snap.operational_day AND s.shift_label=v_snap.shift_label
  ORDER BY s.created_at DESC,s.id DESC LIMIT 1;
 IF v_newer IS DISTINCT FROM p_snapshot THEN RAISE EXCEPTION 'Há apuração posterior: carregue a mais recente'; END IF;
 IF EXISTS(SELECT 1 FROM public.sri_result_day_closures WHERE operational_day=v_snap.operational_day
   AND status IN ('closed','closed_with_pending')) THEN RAISE EXCEPTION 'Dia geral encerrado'; END IF;
 SELECT d.revision INTO v_dist FROM public.daily_result_distributions d
  WHERE d.snapshot_id=p_snapshot FOR UPDATE;
 IF v_dist IS NULL OR v_dist<1 OR v_dist IS DISTINCT FROM p_revision
 THEN RAISE EXCEPTION 'Distribuição inexistente ou mudou: recarregue a apuração'; END IF;
 SELECT * INTO v_existing FROM public.sri_result_shift_closures
 WHERE team_id=v_snap.team_id AND operational_day=v_snap.operational_day AND shift_label=v_snap.shift_label FOR UPDATE;
 IF v_existing.status='closed' THEN RAISE EXCEPTION 'Este turno já foi fechado'; END IF;
 SELECT count(*),count(*) FILTER(WHERE work_status<>'completed_in_tool')
 INTO v_tasks,v_pending_tasks FROM public.daily_operator_tasks WHERE snapshot_id=p_snapshot AND active;
 -- Fechamento nao pode mascarar ausencia de publicacao ou revisao antiga.
 SELECT count(*) INTO v_expected_assignments FROM jsonb_object_keys(
   COALESCE((SELECT state->'assignments' FROM public.daily_result_distributions
             WHERE snapshot_id=p_snapshot),'{}'::jsonb));
 SELECT count(*) INTO v_mismatched_tasks FROM public.daily_operator_tasks
 WHERE snapshot_id=p_snapshot AND active AND distribution_revision<>v_dist;
 IF v_mismatched_tasks>0 THEN
   RAISE EXCEPTION 'Existem carteiras de uma revisão anterior: publique a distribuição atual antes de fechar';
 END IF;
 IF v_snap.protocol_count>0 AND v_tasks=0 THEN
   RAISE EXCEPTION 'Apuração com protocolos e nenhuma carteira publicada: conclua a distribuição antes de fechar';
 END IF;
 IF v_expected_assignments>v_tasks THEN
   RAISE EXCEPTION 'Há atribuições salvas sem publicação: confira os vínculos e publique todas as carteiras antes de fechar';
 END IF;
 v_conf:=jsonb_build_object('protocol_count',v_snap.protocol_count,'indicators',v_snap.indicators,
  'warnings',v_snap.warnings,'distribution_revision',v_dist,'published_tasks',v_tasks,
  'tasks_in_progress_or_pending',v_pending_tasks,'snapshot_id',p_snapshot,
  'notice','Fechamento operacional: não encerra protocolos no SIGO');
 IF v_existing.id IS NULL THEN
  INSERT INTO public.sri_result_shift_closures
  (team_id,operational_day,shift_label,snapshot_id,distribution_revision,conference,closed_by)
  VALUES(v_snap.team_id,v_snap.operational_day,v_snap.shift_label,p_snapshot,v_dist,v_conf,auth.uid())
  RETURNING id INTO v_id;
 ELSE
  UPDATE public.sri_result_shift_closures SET status='closed',snapshot_id=p_snapshot,
     distribution_revision=v_dist,conference=v_conf,closed_by=auth.uid(),closed_at=now(),
     reopened_at=NULL,reopened_by=NULL,reopen_reason=NULL WHERE id=v_existing.id RETURNING id INTO v_id;
 END IF;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES(auth.uid(),'RESULT_SHIFT_CLOSED','sri_result_shift_closure',v_id::text,v_conf);
 RETURN jsonb_build_object('id',v_id,'status','closed','conference',v_conf);
END;
$function$;
COMMIT;
