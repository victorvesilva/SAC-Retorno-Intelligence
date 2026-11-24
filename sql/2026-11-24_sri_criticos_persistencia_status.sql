-- PACOTE 03 / P0 - sem modificação retroativa das tratativas
-- Executar apenas em janela controlada DEPOIS de 2026-11-24_sri_pacote03_protecao_incidentes.sql.
BEGIN;


CREATE OR REPLACE FUNCTION private.sri_p03_status_sigo(v text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE
  WHEN v IN ('E-MAIL','LIGAÇÃO','ASCSAC','ACEITOU','OUTROS','MÍDIAS NE','CARTA AR') THEN 3
  WHEN v IN ('RECUSOU','ASSOCIADO','OUVIDORIA') THEN 2
  WHEN v IN ('DÚVIDA','PENDENTE') THEN 0
  WHEN v='FILIAL' THEN 10 ELSE NULL END
$$;
CREATE OR REPLACE FUNCTION private.sri_p03_status_work(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE
  WHEN v IN ('E-MAIL','LIGAÇÃO','ASCSAC','ACEITOU','OUTROS','MÍDIAS NE','CARTA AR') THEN 'completed_in_tool'
  WHEN v IN ('RECUSOU','ASSOCIADO','FILIAL') THEN 'awaiting'
  WHEN v IN ('DÚVIDA','PENDENTE') THEN 'pending'
  WHEN v='OUVIDORIA' THEN 'in_progress'
  ELSE NULL END
$$;
REVOKE ALL ON FUNCTION private.sri_p03_status_sigo(text),private.sri_p03_status_work(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_daily_operator_treatment(p_task uuid, p_action text, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_task public.daily_operator_tasks%rowtype;
  v_day date;
  v_id bigint;
  v_allowed boolean:=false;
  v_note text;
  v_work_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória';
  END IF;

  SELECT operational_day INTO v_day FROM public.daily_operator_tasks WHERE id=p_task;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa indisponível ou inativa'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||v_day::text,0));
  SELECT * INTO v_task
    FROM public.daily_operator_tasks
   WHERE id=p_task FOR UPDATE;
  IF NOT FOUND OR NOT v_task.active THEN
    RAISE EXCEPTION 'Tarefa indisponível ou inativa';
  END IF;

  -- Mantém autorização por responsável, equipe, vínculo e situação operacional.
  IF v_task.operator_user_id=auth.uid() THEN
    SELECT EXISTS(
      SELECT 1 FROM public.profiles p
      WHERE p.id=auth.uid() AND p.role='operator'
        AND p.operational_status IN ('Ativo','Promovido')
        AND (v_task.team_id IS NULL OR EXISTS (
          SELECT 1 FROM public.team_memberships tm
          JOIN public.operator_links ol
            ON ol.user_id=tm.user_id AND ol.team_id=tm.team_id
          WHERE tm.user_id=p.id AND tm.team_id=v_task.team_id
        ))
    ) INTO v_allowed;
  END IF;
  IF NOT (v_allowed OR private.is_manager() OR
          (v_task.team_id IS NOT NULL AND private.is_supervisor_of(v_task.team_id))) THEN
    RAISE EXCEPTION 'Acesso negado à tarefa';
  END IF;

  -- Compatibilidade temporaria: telas antigas podem enviar os quatro valores tecnicos.
  IF p_action IS NULL OR p_action NOT IN (
    'E-MAIL','LIGAÇÃO','ASCSAC','RECUSOU','ACEITOU','ASSOCIADO',
    'OUTROS','FILIAL','DÚVIDA','OUVIDORIA','PENDENTE','MÍDIAS NE','CARTA AR',
    'note','in_progress','awaiting','completed_in_tool'
  ) THEN
    RAISE EXCEPTION 'Selecione um dos 13 status de tratativa';
  END IF;
  v_note:=btrim(COALESCE(p_notes,''));
  IF length(v_note)>1500 THEN
    RAISE EXCEPTION 'Justificativa deve ter até 1.500 caracteres';
  END IF;

  -- Work_status mantém o contrato das métricas existentes.
  -- Tratativa original é independente do status do SIGO.
  v_work_status:=CASE
    WHEN p_action='note' THEN v_task.work_status
    WHEN p_action IN ('in_progress','awaiting','completed_in_tool') THEN p_action
    ELSE private.sri_p03_status_work(p_action)
  END;

  INSERT INTO public.daily_operator_treatments(task_id,actor_id,action,notes)
    VALUES(v_task.id,auth.uid(),p_action,v_note)
    RETURNING id INTO v_id;

  UPDATE public.daily_operator_tasks
     SET treatment_status=CASE
           WHEN p_action IN ('note','in_progress','awaiting','completed_in_tool')
             THEN v_task.treatment_status
           ELSE p_action END,
         work_status=v_work_status,
         updated_at=now()
   WHERE id=v_task.id;

  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES (
    auth.uid(),'DAY_TASK_TREATMENT','daily_operator_task',v_task.id::text,
    jsonb_build_object(
      'team_id',v_task.team_id,
      'previous_treatment_status',v_task.treatment_status,
      'treatment_status',p_action,
      'work_status',v_work_status,
      'sigo_reference',private.sri_p03_status_sigo(p_action),
      'treatment_id',v_id
    )
  );
  RETURN v_id;
END;
$function$
;


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
 IF FOUND THEN
  IF old_task.operator_user_id=NEW.operator_user_id THEN
   NEW.treatment_status:=old_task.treatment_status;
   NEW.work_status:=old_task.work_status;
  ELSIF old_task.work_status<>'pending' OR EXISTS(
   SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=old_task.id) THEN
   RAISE EXCEPTION 'Protocolo tratado por outro operador: conciliar responsável antes de redistribuir';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION private.sri_p03_guard_transfer()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.operator_user_id IS DISTINCT FROM NEW.operator_user_id
 AND (OLD.work_status<>'pending' OR EXISTS(
  SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=OLD.id)) THEN
  RAISE EXCEPTION 'Protocolo tratado: revisão da supervisão necessária antes de transferir';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sri_p03_guard_transfer ON public.daily_operator_tasks;
CREATE TRIGGER sri_p03_guard_transfer BEFORE UPDATE OF operator_user_id
 ON public.daily_operator_tasks FOR EACH ROW EXECUTE FUNCTION private.sri_p03_guard_transfer();
REVOKE ALL ON FUNCTION private.sri_p03_guard_transfer() FROM PUBLIC,anon,authenticated;


-- Conciliação automática APENAS da mesma data, turno e origem da apuração; sem reviver inativos antigos.
CREATE OR REPLACE FUNCTION private.sri_p03_preserve_open_tasks(
 p_snapshot uuid,p_day date,p_shift text,p_scope_team uuid,p_revision bigint)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_count integer:=0;
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.daily_operator_tasks old
  JOIN public.daily_result_snapshots os ON os.id=old.snapshot_id
  JOIN public.daily_operator_tasks fresh ON fresh.snapshot_id=p_snapshot
       AND fresh.protocol_number=old.protocol_number
  WHERE old.snapshot_id<>p_snapshot AND old.active
   AND old.operational_day=p_day AND old.shift_label=p_shift
   AND os.team_id IS NOT DISTINCT FROM p_scope_team
   AND old.operator_user_id IS DISTINCT FROM fresh.operator_user_id
   AND (old.work_status<>'pending' OR EXISTS(
    SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=old.id))
 ) THEN
  RAISE EXCEPTION 'Distribuição conflita com tratativa prévia: revisão manual obrigatória';
 END IF;
 WITH prior AS (
  SELECT DISTINCT ON(old.protocol_number) old.*
  FROM public.daily_operator_tasks old
  JOIN public.daily_result_snapshots os ON os.id=old.snapshot_id
  WHERE old.snapshot_id<>p_snapshot AND old.active
   AND old.operational_day=p_day AND old.shift_label=p_shift
   AND os.team_id IS NOT DISTINCT FROM p_scope_team
   AND old.work_status<>'completed_in_tool'
   AND private.sri_p03_status_sigo(old.treatment_status) IS DISTINCT FROM 3
   AND NOT EXISTS (SELECT 1 FROM public.daily_operator_tasks fresh
     WHERE fresh.snapshot_id=p_snapshot AND fresh.protocol_number=old.protocol_number)
  ORDER BY old.protocol_number,old.updated_at DESC,old.id DESC
 )
 INSERT INTO public.daily_operator_tasks
  (snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,
   criticality,due_situation,sla_band,channel,source_status,work_status,
   treatment_status,active,distribution_revision,priority_reason,due_date,base_name,area_name)
 SELECT p_snapshot,old.team_id,p_day,p_shift,old.protocol_number,old.operator_user_id,
  old.criticality,old.due_situation,old.sla_band,old.channel,old.source_status,
  old.work_status,old.treatment_status,true,p_revision,old.priority_reason,old.due_date,
  old.base_name,old.area_name
 FROM prior old JOIN public.profiles op ON op.id=old.operator_user_id
  AND op.role='operator' AND op.operational_status IN ('Ativo','Promovido')
 ON CONFLICT(snapshot_id,protocol_number) DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 UPDATE public.daily_operator_tasks t SET distribution_revision=p_revision,updated_at=now()
 WHERE t.snapshot_id=p_snapshot AND t.active AND t.distribution_revision<>p_revision
   AND t.work_status<>'completed_in_tool'
   AND private.sri_p03_status_sigo(t.treatment_status) IS DISTINCT FROM 3;
 IF v_count>0 THEN
  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES(auth.uid(),'P03_UNFINISHED_CARRIED','daily_result',p_snapshot::text,
    jsonb_build_object('day',p_day,'shift',p_shift,'carried',v_count,'revision',p_revision));
 END IF;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION private.sri_p03_preserve_open_tasks(uuid,date,text,uuid,bigint) FROM PUBLIC,anon,authenticated;

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
     criticality,due_situation,sla_band,channel,source_status,distribution_revision,active,priority_reason,due_date,base_name,area_name)
    VALUES
    (p_snapshot,v_team,v_day,v_shift,v_id,v_user,
     left(v_criticality,80),left(v_detail->>'situation',80),left(v_detail->>'sla',50),
     left(v_detail->>'channel',80),left(v_detail->>'status',80),
     v_revision,true,private.sri_priority_reason(v_detail->>'priority_reason'),private.sri_priority_date(v_detail->>'due_date'),left(v_detail->>'base',120),left(v_detail->>'area',120))
    ON CONFLICT(snapshot_id,protocol_number) DO UPDATE SET
      operator_user_id=EXCLUDED.operator_user_id,
      criticality=EXCLUDED.criticality,priority_reason=EXCLUDED.priority_reason,due_date=EXCLUDED.due_date,
      due_situation=EXCLUDED.due_situation,
      sla_band=EXCLUDED.sla_band,
      channel=EXCLUDED.channel,
      source_status=COALESCE(EXCLUDED.source_status,daily_operator_tasks.source_status),base_name=COALESCE(EXCLUDED.base_name,daily_operator_tasks.base_name),area_name=COALESCE(EXCLUDED.area_name,daily_operator_tasks.area_name),
      active=true,distribution_revision=EXCLUDED.distribution_revision,updated_at=now(),
      work_status=public.daily_operator_tasks.work_status;
    v_published:=v_published+1;
  END LOOP;
  PERFORM private.sri_p03_preserve_open_tasks(p_snapshot,v_day,v_shift,v_team,v_revision);
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

CREATE OR REPLACE FUNCTION public.publish_general_operator_tasks(p_snapshot uuid, p_revision bigint, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_day date;v_shift text;v_state jsonb;v_revision bigint;v_latest uuid;
 v_assignment record;v_protocol text;v_opid text;v_user uuid;v_team uuid;
 v_role text;v_status text;v_supervisor uuid;v_num_teams integer;
 v_criticality text;v_detail jsonb;v_published integer:=0;v_changed integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
 IF NOT (private.is_manager() OR EXISTS(SELECT 1 FROM public.profiles p
  WHERE p.id=auth.uid() AND p.role='supervisor')) THEN
  RAISE EXCEPTION 'Publicação restrita à gestão e supervisão'; END IF;
 IF p_details IS NULL OR jsonb_typeof(p_details)<>'object' THEN
  RAISE EXCEPTION 'Detalhes inválidos';END IF;
 SELECT s.operational_day,s.shift_label,d.state,d.revision
 INTO v_day,v_shift,v_state,v_revision
 FROM public.daily_result_snapshots s JOIN public.daily_result_distributions d ON d.snapshot_id=s.id
 WHERE s.id=p_snapshot AND s.team_id IS NULL FOR SHARE OF d;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resultado geral não publicado';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||v_day::text,0));
 IF v_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'A distribuição mudou: recarregue o resultado';END IF;
 IF EXISTS(SELECT 1 FROM public.sri_general_day_closures c WHERE c.operational_day=v_day)
  OR EXISTS(SELECT 1 FROM public.sri_result_day_closures c WHERE c.operational_day=v_day
   AND c.status IN('closed','closed_with_pending')) THEN
  RAISE EXCEPTION 'Dia operacional encerrado: distribuição bloqueada';END IF;
 SELECT s.id INTO v_latest FROM public.daily_result_snapshots s
 WHERE s.team_id IS NULL AND s.operational_day=v_day AND s.shift_label=v_shift
 ORDER BY s.created_at DESC,s.id DESC LIMIT 1;
 IF v_latest IS DISTINCT FROM p_snapshot THEN
  RAISE EXCEPTION 'Apuração geral anterior: recupere a importação mais recente';END IF;
 IF jsonb_typeof(v_state->'assignments') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Estrutura da distribuição inválida';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v_state->'assignments'))>15000 THEN
  RAISE EXCEPTION 'Limite de 15 mil atribuições por rodada excedido';END IF;
 -- Todos os vínculos são validados ANTES de efetuar qualquer INSERT.
 FOR v_assignment IN SELECT key,value FROM jsonb_each(v_state->'assignments') LOOP
  v_protocol:=btrim(v_assignment.key);v_opid:=v_assignment.value->>'opId';
  IF length(v_protocol) NOT BETWEEN 1 AND 100 OR v_opid IS NULL
    OR v_opid !~ '^acct:[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'Operador não cadastrado em protocolo: %',left(v_protocol,100);
  END IF;
  v_user:=substring(v_opid FROM 6)::uuid;
  SELECT p.role,p.operational_status,p.supervisor_id INTO v_role,v_status,v_supervisor
  FROM public.profiles p WHERE p.id=v_user;
  IF NOT FOUND OR v_role<>'operator' OR v_status NOT IN('Ativo','Promovido') THEN
    RAISE EXCEPTION 'Operador inativo ou inválido para o protocolo %',v_protocol; END IF;
  SELECT count(*),(array_agg(tm.team_id ORDER BY tm.team_id))[1] INTO v_num_teams,v_team
  FROM public.team_memberships tm JOIN public.teams t ON t.id=tm.team_id AND t.active
  WHERE tm.user_id=v_user;
  IF v_num_teams>1 THEN
    RAISE EXCEPTION 'Operador possui mais de uma equipe ativa; revise vínculo antes de distribuir'; END IF;
  IF EXISTS(SELECT 1 FROM public.daily_operator_tasks t WHERE t.operator_user_id=v_user AND t.active
    AND t.team_id IS DISTINCT FROM v_team AND private.sri_task_blocks_transfer(t.operational_day,t.team_id,t.shift_label)) THEN
    RAISE EXCEPTION 'Operador possui vínculo conflitante; a gestão deve revisar antes de distribuir'; END IF;
  IF NOT (private.is_manager() OR v_supervisor=(SELECT auth.uid())
   OR (v_team IS NOT NULL AND private.is_supervisor_of(v_team))) THEN
    RAISE EXCEPTION 'Operador fora da equipe sob responsabilidade da supervisão';END IF;
 END LOOP;
 FOR v_assignment IN SELECT key,value FROM jsonb_each(v_state->'assignments') LOOP
  v_protocol:=btrim(v_assignment.key);
  v_user:=substring(v_assignment.value->>'opId' FROM 6)::uuid;
  SELECT (array_agg(tm.team_id ORDER BY tm.team_id))[1] INTO v_team
  FROM public.team_memberships tm JOIN public.teams t ON t.id=tm.team_id AND t.active
  WHERE tm.user_id=v_user;
  IF v_team IS NOT NULL THEN
   -- Compatibilidade com FK de vínculo existente; só em equipe explicitamente cadastrada.
   INSERT INTO public.operator_links(team_id,user_id,operator_name,linked_by)
   VALUES(v_team,v_user,'USER:'||v_user::text,(SELECT auth.uid()))
   ON CONFLICT (team_id,user_id) DO NOTHING;
  END IF;
  v_detail:=COALESCE(p_details->v_protocol,'{}'::jsonb);
  IF jsonb_typeof(v_detail)<>'object' THEN v_detail:='{}'::jsonb;END IF;
  v_criticality:=COALESCE(NULLIF(v_state->'criticities'->v_protocol->>'value',''),
     NULLIF(v_detail->>'criticality',''));
  INSERT INTO public.daily_operator_tasks
  (snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,
   criticality,due_situation,sla_band,channel,source_status,distribution_revision,active,priority_reason,due_date,base_name,area_name)
  VALUES(p_snapshot,v_team,v_day,v_shift,v_protocol,v_user,
   left(v_criticality,80),left(v_detail->>'situation',80),left(v_detail->>'sla',50),
   left(v_detail->>'channel',80),
   left(v_detail->>'status',80),v_revision,true,private.sri_priority_reason(v_detail->>'priority_reason'),private.sri_priority_date(v_detail->>'due_date'),left(v_detail->>'base',120),left(v_detail->>'area',120))
  ON CONFLICT(snapshot_id,protocol_number) DO UPDATE SET
   operator_user_id=EXCLUDED.operator_user_id,team_id=EXCLUDED.team_id,
   criticality=EXCLUDED.criticality,priority_reason=EXCLUDED.priority_reason,due_date=EXCLUDED.due_date,due_situation=EXCLUDED.due_situation,
   sla_band=EXCLUDED.sla_band,channel=EXCLUDED.channel,
   source_status=COALESCE(EXCLUDED.source_status,daily_operator_tasks.source_status),base_name=COALESCE(EXCLUDED.base_name,daily_operator_tasks.base_name),area_name=COALESCE(EXCLUDED.area_name,daily_operator_tasks.area_name),
   active=true,distribution_revision=EXCLUDED.distribution_revision,updated_at=now(),
   work_status=public.daily_operator_tasks.work_status;
  v_published:=v_published+1;
 END LOOP;
 PERFORM private.sri_p03_preserve_open_tasks(p_snapshot,v_day,v_shift,NULL::uuid,v_revision);
 UPDATE public.daily_operator_tasks t SET active=false,updated_at=now()
 WHERE t.snapshot_id=p_snapshot AND t.active AND t.distribution_revision<>v_revision;
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 -- Versionamento: a nova rodada desativa a anterior SOMENTE deste turno/apuração geral.
 UPDATE public.daily_operator_tasks t SET active=false,updated_at=now()
 WHERE t.snapshot_id<>p_snapshot AND t.operational_day=v_day AND t.shift_label=v_shift
  AND t.active AND EXISTS(SELECT 1 FROM public.daily_result_snapshots s
    WHERE s.id=t.snapshot_id AND s.team_id IS NULL);
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES((SELECT auth.uid()),'GENERAL_OPERATOR_TASKS_PUBLISHED','daily_result',p_snapshot::text,
  jsonb_build_object('revision',v_revision,'published',v_published,'prior_revision_removed',v_changed));
 RETURN jsonb_build_object('published',v_published,'unlinked',0,'revision',v_revision);
END;
$function$
;


CREATE OR REPLACE FUNCTION private.sri_p03_my_unresolved()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH latest AS (
  SELECT DISTINCT ON(t.protocol_number)
   t.protocol_number,t.operator_user_id,t.work_status,t.treatment_status,t.operational_day,
   t.shift_label,t.updated_at,t.active,t.criticality,t.due_date,t.base_name,t.area_name
  FROM public.daily_operator_tasks t JOIN public.daily_result_snapshots s ON s.id=t.snapshot_id
  WHERE t.operational_day<=(now() AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY t.protocol_number,t.operational_day DESC,s.created_at DESC,t.active DESC,
   t.updated_at DESC,t.id DESC
 )
 SELECT jsonb_build_object('protocol_number',t.protocol_number,'last_day',t.operational_day,
  'shift_label',t.shift_label,'work_status',t.work_status,
  'treatment_status',t.treatment_status,'updated_at',t.updated_at,
  'sigo_reference',private.sri_p03_status_sigo(t.treatment_status),
  'criticality',t.criticality,'due_date',t.due_date,
  'base_name',t.base_name,'area_name',t.area_name,
  'requires_reconciliation',true)
 FROM latest t
 WHERE t.operator_user_id=auth.uid()
 AND t.work_status<>'completed_in_tool'
 AND (NOT t.active OR t.operational_day<(now() AT TIME ZONE 'America/Sao_Paulo')::date)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
  AND p.role='operator' AND p.operational_status IN ('Ativo','Promovido'))
 ORDER BY t.operational_day DESC,t.updated_at DESC LIMIT 200
$$;
CREATE OR REPLACE FUNCTION public.sri_p03_my_unresolved()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.sri_p03_my_unresolved()
$$;
REVOKE ALL ON FUNCTION private.sri_p03_my_unresolved(),public.sri_p03_my_unresolved() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_p03_my_unresolved(),private.sri_p03_my_unresolved() TO authenticated;


COMMIT;
