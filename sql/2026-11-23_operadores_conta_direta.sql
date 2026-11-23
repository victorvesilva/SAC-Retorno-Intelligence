-- SAC Retorno Intelligence - 2026-11-23
-- Operadores novos: vínculo automático pelo UUID da conta (acct:uuid), equipe e situação.
-- Operadores legados: conciliação manual operator_links preservada na publicação.
-- Mantém lock transacional, proteção de turno fechado e verificações RLS.
-- Aplicar em transação. Nenhum cadastro ou protocolo preexistente será alterado.
BEGIN;
DROP POLICY IF EXISTS daily_tasks_read ON public.daily_operator_tasks;
CREATE POLICY daily_tasks_read ON public.daily_operator_tasks
 FOR SELECT TO authenticated
 USING (
   (
     active
     AND operator_user_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       JOIN public.team_memberships tm
         ON tm.user_id=p.id AND tm.team_id=daily_operator_tasks.team_id
       WHERE p.id=(SELECT auth.uid())
         AND p.role='operator'
         AND p.operational_status IN ('Ativo','Promovido')
     )
   )
   OR private.is_manager()
   OR private.is_supervisor_of(team_id)
 );


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
  v_entry record; v_detail jsonb; v_criticality text; v_latest uuid; v_lock_day date;
  v_published integer:=0; v_unlinked integer:=0; v_changed integer:=0;
  v_unlinked_names jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
  SELECT operational_day INTO v_lock_day FROM public.daily_result_snapshots WHERE id=p_snapshot;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuração ou distribuição inexistente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||v_lock_day::text,0));
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
  IF EXISTS(SELECT 1 FROM public.sri_result_shift_closures c WHERE c.team_id=v_team AND c.operational_day=v_day AND c.shift_label=v_shift AND c.status='closed')
     OR EXISTS(SELECT 1 FROM public.sri_result_day_closures d WHERE d.operational_day=v_day AND d.status IN ('closed','closed_with_pending')) THEN
    RAISE EXCEPTION 'Turno ou dia encerrado: solicite reabertura autorizada antes de publicar';
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_daily_operator_treatment(p_task uuid, p_action text, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_task public.daily_operator_tasks%rowtype;
 v_id bigint;
 v_operator_allowed boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;

 SELECT * INTO v_task FROM public.daily_operator_tasks
 WHERE id=p_task FOR UPDATE;
 IF NOT FOUND OR NOT v_task.active THEN
   RAISE EXCEPTION 'Tarefa indisponível ou inativa';
 END IF;

 -- O vínculo com a tarefa nao substitui a situacao operacional atual.
 IF v_task.operator_user_id=auth.uid() THEN
   SELECT EXISTS(
     SELECT 1 FROM public.profiles p
     JOIN public.team_memberships tm ON tm.user_id=p.id AND tm.team_id=v_task.team_id
     WHERE p.id=auth.uid()
       AND p.role='operator'
       AND p.operational_status IN ('Ativo','Promovido')
   ) INTO v_operator_allowed;
 END IF;
 IF NOT (v_operator_allowed
         OR private.is_manager()
         OR private.is_supervisor_of(v_task.team_id)) THEN
   RAISE EXCEPTION 'Acesso negado a esta tarefa';
 END IF;
 IF p_action NOT IN ('note','in_progress','awaiting','completed_in_tool') THEN
   RAISE EXCEPTION 'Tratativa inválida';
 END IF;
 IF length(btrim(COALESCE(p_notes,''))) NOT BETWEEN 3 AND 1500 THEN
   RAISE EXCEPTION 'A descrição precisa ter de 3 a 1.500 caracteres';
 END IF;

 INSERT INTO public.daily_operator_treatments(task_id,actor_id,action,notes)
 VALUES(v_task.id,auth.uid(),p_action,btrim(p_notes)) RETURNING id INTO v_id;
 IF p_action<>'note' THEN
   UPDATE public.daily_operator_tasks
      SET work_status=p_action,updated_at=now()
    WHERE id=v_task.id;
 END IF;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES(auth.uid(),'DAY_TASK_TREATMENT','daily_operator_task',v_task.id::text,
        jsonb_build_object('team_id',v_task.team_id,'action',p_action));
 RETURN v_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.record_daily_operator_treatment(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_daily_operator_treatment(uuid,text,text) TO authenticated;
COMMIT;
