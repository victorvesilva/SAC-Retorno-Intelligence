-- SRI: rollback executável somente com autorização, caso P1/P2 apresentem falha.
-- CUIDADO: reverte as melhorias de autorização! Só usar como contenção emergencial.
-- Gerado a partir do esquema observado ANTES da migração, 22/11/2026.
BEGIN;
SET LOCAL lock_timeout='3s';
DROP VIEW IF EXISTS public.sri_v_retention_risk_review;
REVOKE SELECT ON TABLE public.retention_holds FROM authenticated;
DROP POLICY IF EXISTS daily_tasks_read ON public.daily_operator_tasks;
CREATE POLICY daily_tasks_read ON public.daily_operator_tasks
AS PERMISSIVE FOR SELECT TO authenticated
USING (((active AND (operator_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'operator'::text) AND (p.operational_status = ANY (ARRAY['Ativo'::text, 'Promovido'::text])))))) OR private.is_manager() OR private.is_supervisor_of(team_id)));

CREATE OR REPLACE FUNCTION public.publish_daily_operator_tasks(p_snapshot uuid, p_revision bigint, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_team uuid; v_day date; v_shift text; v_state jsonb; v_revision bigint;
  v_assignments jsonb; v_roster jsonb; v_archive jsonb;
  v_id text; v_opid text; v_name text; v_user uuid;
  v_entry record; v_detail jsonb; v_criticality text; v_latest uuid;
  v_published integer:=0; v_unlinked integer:=0; v_changed integer:=0;
  v_unlinked_names jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
  IF p_details IS NULL OR jsonb_typeof(p_details)<>'object' THEN
    RAISE EXCEPTION 'Detalhes inválidos';
  END IF;
  SELECT s.team_id,s.operational_day,s.shift_label,d.state,d.revision
  INTO v_team,v_day,v_shift,v_state,v_revision
  FROM public.daily_result_snapshots s
  JOIN public.daily_result_distributions d ON d.snapshot_id=s.id
  WHERE s.id=p_snapshot FOR SHARE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuração ou distribuição inexistente'; END IF;
  IF NOT (private.is_manager() OR private.is_supervisor_of(v_team)) THEN
    RAISE EXCEPTION 'Somente gestão/supervisão da equipe pode publicar'; END IF;
  IF v_revision<>p_revision THEN
    RAISE EXCEPTION 'A distribuição mudou em outro navegador. Recarregue antes de publicar'; END IF;
  -- Não permita que apurações históricas desativem tarefas da apuração mais recente.
  SELECT s.id INTO v_latest FROM public.daily_result_snapshots s
  WHERE s.team_id=v_team AND s.operational_day=v_day AND s.shift_label=v_shift
  ORDER BY s.created_at DESC,s.id DESC LIMIT 1;
  IF v_latest IS DISTINCT FROM p_snapshot THEN
    RAISE EXCEPTION 'Apuração anterior: recupere a rodada mais recente antes de publicar carteiras';
  END IF;
  v_assignments:=COALESCE(v_state->'assignments','{}'::jsonb);
  v_roster:=COALESCE(v_state->'roster','[]'::jsonb);
  v_archive:=COALESCE(v_state->'archivedRoster','[]'::jsonb);
  IF jsonb_typeof(v_assignments)<>'object' OR jsonb_typeof(v_roster)<>'array'
     OR jsonb_typeof(v_archive)<>'array' THEN
    RAISE EXCEPTION 'Estrutura da distribuição incompatível';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_assignments))>15000 THEN
    RAISE EXCEPTION 'Distribuição excede 15 mil atribuições por rodada';
  END IF;
  FOR v_entry IN SELECT key,value FROM jsonb_each(v_assignments) LOOP
    v_id:=btrim(v_entry.key);
    v_opid:=v_entry.value->>'opId';
    IF v_id IS NULL OR length(v_id)<1 OR length(v_id)>100 OR v_opid IS NULL THEN CONTINUE; END IF;
    SELECT item->>'name' INTO v_name FROM (
      SELECT item FROM jsonb_array_elements(v_roster) AS z(item)
      UNION ALL
      SELECT item FROM jsonb_array_elements(v_archive) AS z(item)
    ) list WHERE list.item->>'id'=v_opid LIMIT 1;
    v_user:=NULL;
    -- Para novos cadastros o ID da conta é o identificador da distribuição.
    -- A equipe e a situação são confirmadas NO BANCO, sem confiar no navegador.
    IF v_opid ~ '^acct:[0-9a-fA-F-]{36}$' THEN
      SELECT p.id INTO v_user FROM public.profiles p
      JOIN public.team_memberships tm ON tm.user_id=p.id AND tm.team_id=v_team
      JOIN public.operator_links link ON link.user_id=p.id AND link.team_id=v_team
      WHERE p.id=substring(v_opid from 6)::uuid AND p.role='operator'
        AND p.operational_status IN ('Ativo','Promovido')
      LIMIT 1;
    ELSIF v_name IS NOT NULL THEN
      -- Compatibilidade de históricos: somente vínculos já conferidos manualmente.
      SELECT link.user_id INTO v_user FROM public.operator_links link
      JOIN public.profiles p ON p.id=link.user_id AND p.role='operator'
      JOIN public.team_memberships tm ON tm.user_id=link.user_id AND tm.team_id=link.team_id
      WHERE link.team_id=v_team AND p.operational_status IN ('Ativo','Promovido')
        AND lower(btrim(link.operator_name))=lower(btrim(v_name))
      LIMIT 1;
    END IF;
    IF v_user IS NULL THEN
      v_unlinked:=v_unlinked+1;
      IF jsonb_array_length(v_unlinked_names)<15 THEN
         v_unlinked_names:=v_unlinked_names || jsonb_build_array(COALESCE(v_name,'Operador não identificado'));
      END IF;
      CONTINUE;
    END IF;
    v_detail:=COALESCE(p_details->v_id,'{}'::jsonb);
    IF jsonb_typeof(v_detail)<>'object' THEN v_detail:='{}'::jsonb; END IF;
    v_criticality:=COALESCE(NULLIF(v_state->'criticities'->v_id->>'value',''),NULLIF(v_detail->>'criticality',''));
    INSERT INTO public.daily_operator_tasks
    (snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,
     criticality,due_situation,sla_band,channel,source_status,distribution_revision,active)
    VALUES
    (p_snapshot,v_team,v_day,v_shift,v_id,v_user,
     left(v_criticality,80),left(v_detail->>'situation',80),left(v_detail->>'sla',50),
     left(v_detail->>'channel',80),left(COALESCE(v_state->'statuses'->>v_id,v_detail->>'status'),80),
     v_revision,true)
    ON CONFLICT(snapshot_id,protocol_number) DO UPDATE SET
      operator_user_id=EXCLUDED.operator_user_id,
      criticality=EXCLUDED.criticality,
      due_situation=EXCLUDED.due_situation,
      sla_band=EXCLUDED.sla_band,
      channel=EXCLUDED.channel,
      source_status=EXCLUDED.source_status,
      active=true,distribution_revision=EXCLUDED.distribution_revision,updated_at=now(),
      work_status=CASE WHEN public.daily_operator_tasks.operator_user_id IS DISTINCT FROM EXCLUDED.operator_user_id
                       THEN 'pending' ELSE public.daily_operator_tasks.work_status END;
    v_published:=v_published+1;
  END LOOP;
  -- Desativa atribuições removidas, sem excluir histórico. Também invalida rodadas anteriores do mesmo turno.
  UPDATE public.daily_operator_tasks t SET active=false,updated_at=now()
  WHERE t.snapshot_id=p_snapshot AND t.active AND t.distribution_revision<>v_revision;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  UPDATE public.daily_operator_tasks t SET active=false,updated_at=now()
  WHERE t.snapshot_id<>p_snapshot AND t.team_id=v_team AND t.operational_day=v_day
    AND t.shift_label=v_shift AND t.active;
  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES(auth.uid(),'DAY_OPERATOR_TASKS_PUBLISHED','daily_result',p_snapshot::text,
         jsonb_build_object('revision',v_revision,'published',v_published,'unlinked',v_unlinked,'deactivated',v_changed));
  RETURN jsonb_build_object('published',v_published,'unlinked',v_unlinked,
                            'unlinked_names',v_unlinked_names,'revision',v_revision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_daily_operator_treatment(p_task uuid, p_action text, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_task public.daily_operator_tasks%rowtype; v_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
  SELECT * INTO v_task FROM public.daily_operator_tasks WHERE id=p_task FOR UPDATE;
  IF NOT FOUND OR NOT v_task.active THEN RAISE EXCEPTION 'Tarefa indisponível ou inativa'; END IF;
  IF NOT (v_task.operator_user_id=auth.uid() OR private.is_manager() OR private.is_supervisor_of(v_task.team_id))
  THEN RAISE EXCEPTION 'Acesso negado a esta tarefa'; END IF;
  IF p_action NOT IN ('note','in_progress','awaiting','completed_in_tool') THEN RAISE EXCEPTION 'Tratativa inválida'; END IF;
  IF length(btrim(COALESCE(p_notes,''))) NOT BETWEEN 3 AND 1500 THEN
    RAISE EXCEPTION 'A descrição precisa ter de 3 a 1.500 caracteres'; END IF;
  INSERT INTO public.daily_operator_treatments(task_id,actor_id,action,notes)
  VALUES(v_task.id,auth.uid(),p_action,btrim(p_notes)) RETURNING id INTO v_id;
  IF p_action<>'note' THEN
    UPDATE public.daily_operator_tasks SET work_status=p_action,updated_at=now() WHERE id=v_task.id;
  END IF;
  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES(auth.uid(),'DAY_TASK_TREATMENT','daily_operator_task',v_task.id::text,
         jsonb_build_object('team_id',v_task.team_id,'action',p_action));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sri_close_result_shift(p_snapshot uuid, p_revision bigint, p_confirm_last_import boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_snap public.daily_result_snapshots%rowtype; v_dist bigint; v_newer uuid;
        v_existing public.sri_result_shift_closures%rowtype; v_id uuid;
        v_tasks integer; v_pending_tasks integer; v_conf jsonb;
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
