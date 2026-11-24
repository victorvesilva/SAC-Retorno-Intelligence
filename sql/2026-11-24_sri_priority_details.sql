-- Aplicar somente após teste isolado. Adiciona metadados mínimos à carteira, sem dados pessoais.
BEGIN;
ALTER TABLE public.daily_operator_tasks ADD COLUMN IF NOT EXISTS priority_reason text;
ALTER TABLE public.daily_operator_tasks ADD COLUMN IF NOT EXISTS due_date date;
CREATE OR REPLACE FUNCTION private.sri_priority_date(p_value text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $date$
BEGIN
 IF p_value IS NULL OR p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN NULL; END IF;
 RETURN p_value::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
END; $date$;
CREATE OR REPLACE FUNCTION private.sri_priority_reason(p_value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $reason$
 SELECT CASE WHEN p_value IN ('Prazo vencido','Vence hoje','Prazo D6','Histórico de NIP','Fila crítica','Credenciamento D6','Prazo D5/D4','Tempo excedido no retorno','Prazo regular','Prioridade definida pela supervisão','Sem classificação de prazo') THEN p_value ELSE NULL END;
$reason$;
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
     criticality,due_situation,sla_band,channel,source_status,distribution_revision,active,priority_reason,due_date)
    VALUES
    (p_snapshot,v_team,v_day,v_shift,v_id,v_user,
     left(v_criticality,80),left(v_detail->>'situation',80),left(v_detail->>'sla',50),
     left(v_detail->>'channel',80),left(COALESCE(v_state->'statuses'->>v_id,v_detail->>'status'),80),
     v_revision,true,private.sri_priority_reason(v_detail->>'priority_reason'),private.sri_priority_date(v_detail->>'due_date'))
    ON CONFLICT(snapshot_id,protocol_number) DO UPDATE SET
      operator_user_id=EXCLUDED.operator_user_id,
      criticality=EXCLUDED.criticality,priority_reason=EXCLUDED.priority_reason,due_date=EXCLUDED.due_date,
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
  IF EXISTS(SELECT 1 FROM public.operator_links ol WHERE ol.user_id=v_user
    AND ol.team_id IS DISTINCT FROM v_team) THEN
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
   criticality,due_situation,sla_band,channel,source_status,distribution_revision,active,priority_reason,due_date)
  VALUES(p_snapshot,v_team,v_day,v_shift,v_protocol,v_user,
   left(v_criticality,80),left(v_detail->>'situation',80),left(v_detail->>'sla',50),
   left(v_detail->>'channel',80),
   left(COALESCE(v_state->'statuses'->>v_protocol,v_detail->>'status'),80),v_revision,true,private.sri_priority_reason(v_detail->>'priority_reason'),private.sri_priority_date(v_detail->>'due_date'))
  ON CONFLICT(snapshot_id,protocol_number) DO UPDATE SET
   operator_user_id=EXCLUDED.operator_user_id,team_id=EXCLUDED.team_id,
   criticality=EXCLUDED.criticality,priority_reason=EXCLUDED.priority_reason,due_date=EXCLUDED.due_date,due_situation=EXCLUDED.due_situation,
   sla_band=EXCLUDED.sla_band,channel=EXCLUDED.channel,
   source_status=EXCLUDED.source_status,
   active=true,distribution_revision=EXCLUDED.distribution_revision,updated_at=now(),
   work_status=CASE WHEN public.daily_operator_tasks.operator_user_id
                        IS DISTINCT FROM EXCLUDED.operator_user_id
                    THEN 'pending' ELSE public.daily_operator_tasks.work_status END;
  v_published:=v_published+1;
 END LOOP;
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
$function$;
-- Audita alterações efetivas no nível final de uma tarefa, sem registrar dados do beneficiário.
CREATE OR REPLACE FUNCTION private.sri_audit_criticality_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $audit$
BEGIN
 IF auth.uid() IS NOT NULL AND OLD.criticality IS DISTINCT FROM NEW.criticality THEN
  INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
  VALUES(auth.uid(),'TASK_CRITICALITY_CHANGED','daily_operator_task',NEW.id::text,jsonb_build_object('before',OLD.criticality,'after',NEW.criticality,'reason',NEW.priority_reason));
 END IF;
 RETURN NEW;
END; $audit$;
REVOKE ALL ON FUNCTION private.sri_audit_criticality_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sri_audit_criticality_change ON public.daily_operator_tasks;
CREATE TRIGGER sri_audit_criticality_change AFTER UPDATE OF criticality ON public.daily_operator_tasks FOR EACH ROW EXECUTE FUNCTION private.sri_audit_criticality_change();
COMMIT;
