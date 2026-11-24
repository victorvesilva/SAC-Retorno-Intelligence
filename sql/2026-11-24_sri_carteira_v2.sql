BEGIN;
ALTER TABLE public.daily_operator_tasks ADD COLUMN IF NOT EXISTS base_name text, ADD COLUMN IF NOT EXISTS area_name text;
CREATE TABLE IF NOT EXISTS private.sri_treatment_requests(actor_id uuid NOT NULL, request_id uuid NOT NULL, task_id uuid NOT NULL, action text NOT NULL, notes text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,request_id));
ALTER TABLE private.sri_treatment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_treatment_requests FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.sri_record_treatment_v2(p_task uuid,p_action text,p_notes text,p_expected timestamptz,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $v2$
DECLARE t public.daily_operator_tasks%rowtype; prior private.sri_treatment_requests%rowtype; result jsonb; actor uuid:=auth.uid(); tid bigint;
BEGIN
 IF actor IS NULL OR p_request IS NULL OR p_expected IS NULL THEN RAISE EXCEPTION 'Sessão ou versão inválida';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,0));
 SELECT * INTO prior FROM private.sri_treatment_requests WHERE actor_id=actor AND request_id=p_request;
 IF FOUND THEN
  IF prior.task_id<>p_task OR prior.action IS DISTINCT FROM p_action OR prior.notes IS DISTINCT FROM btrim(coalesce(p_notes,'')) THEN RAISE EXCEPTION 'Solicitação já utilizada'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO t FROM public.daily_operator_tasks WHERE id=p_task FOR UPDATE;
 IF NOT FOUND OR NOT t.active THEN RAISE EXCEPTION 'Demanda indisponível; atualize a carteira';END IF;
 IF t.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'A demanda foi atualizada em outra sessão. Atualize a carteira antes de salvar';END IF;
 tid:=public.record_daily_operator_treatment(p_task,p_action,p_notes);
 SELECT jsonb_build_object('treatment_id',tid,'treatment_status',x.treatment_status,'work_status',x.work_status,'updated_at',x.updated_at) INTO result FROM public.daily_operator_tasks x WHERE x.id=p_task;
 INSERT INTO private.sri_treatment_requests(actor_id,request_id,task_id,action,notes,result) VALUES(actor,p_request,p_task,p_action,btrim(coalesce(p_notes,'')),result);
 RETURN result;
END;
$v2$;
REVOKE ALL ON FUNCTION private.sri_record_treatment_v2(uuid,text,text,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_record_treatment_v2(uuid,text,text,timestamptz,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_record_treatment_v2(p_task uuid,p_action text,p_notes text,p_expected timestamptz,p_request uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrap$ SELECT private.sri_record_treatment_v2(p_task,p_action,p_notes,p_expected,p_request); $wrap$;
REVOKE ALL ON FUNCTION public.sri_record_treatment_v2(uuid,text,text,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_record_treatment_v2(uuid,text,text,timestamptz,uuid) TO authenticated;
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

-- Preservar a tratativa do mesmo protocolo nas reimportações do mesmo dia/turno.
CREATE OR REPLACE FUNCTION private.sri_carry_task_status()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $carry$
DECLARE old_task public.daily_operator_tasks%rowtype;
BEGIN
 SELECT t.* INTO old_task FROM public.daily_operator_tasks t
 JOIN public.daily_result_snapshots s ON s.id=t.snapshot_id
 JOIN public.daily_result_snapshots n ON n.id=NEW.snapshot_id
 WHERE t.operational_day=NEW.operational_day AND t.shift_label=NEW.shift_label
 AND t.protocol_number=NEW.protocol_number AND t.snapshot_id<>NEW.snapshot_id
 AND (s.team_id IS NOT DISTINCT FROM n.team_id) AND t.active
 ORDER BY t.updated_at DESC,t.id DESC LIMIT 1;
 IF FOUND THEN NEW.treatment_status:=old_task.treatment_status;NEW.work_status:=old_task.work_status; END IF;
 RETURN NEW;
END;
$carry$;
CREATE TABLE IF NOT EXISTS private.sri_status_reconciliation(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id uuid NOT NULL, snapshot_id uuid NOT NULL, protocol_number text NOT NULL,
 operational_day date NOT NULL, team_id uuid, operator_id uuid NOT NULL,
 base_name text, area_name text, previous_source text NOT NULL, current_source text NOT NULL,
 manual_status text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
 decision text, justification text, decided_by uuid, decided_at timestamptz,
 UNIQUE(task_id,previous_source,current_source,manual_status)
);
ALTER TABLE private.sri_status_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_status_reconciliation FROM PUBLIC,anon,authenticated;
-- A matriz sem validação operacional não presume equivalências. Mudanças da origem com tratativa
-- existente são sinais de revisão, nunca uma declaração automática de erro do operador.

-- Matriz operacional configurável. Sem equivalência validada, o evento é analisado manualmente.
CREATE TABLE IF NOT EXISTS private.sri_status_compatibility(
 source_status text NOT NULL, treatment_status text NOT NULL,
 compatible boolean NOT NULL, reason text NOT NULL, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_status,treatment_status));
ALTER TABLE private.sri_status_compatibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_status_compatibility FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.sri_set_status_compatibility(p_source text,p_treatment text,p_compatible boolean,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $matrix$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_manager() THEN RAISE EXCEPTION 'A configuração da matriz é exclusiva da gestão';END IF;
 IF length(btrim(coalesce(p_source,''))) NOT BETWEEN 1 AND 80 OR p_treatment IS NULL OR p_treatment NOT IN ('E-MAIL','LIGAÇÃO','ASCSAC','RECUSOU','ACEITOU','ASSOCIADO','OUTROS','FILIAL','DÚVIDA','OUVIDORIA','PENDENTE','MÍDIAS NE','CARTA AR') OR p_compatible IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 1500 THEN RAISE EXCEPTION 'Preencha os campos da regra'; END IF;
 INSERT INTO private.sri_status_compatibility(source_status,treatment_status,compatible,reason,updated_by)
 VALUES(btrim(p_source),p_treatment,p_compatible,btrim(p_reason),auth.uid())
 ON CONFLICT(source_status,treatment_status) DO UPDATE SET compatible=EXCLUDED.compatible,reason=EXCLUDED.reason,updated_by=auth.uid(),updated_at=now();
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details) VALUES(auth.uid(),'STATUS_COMPATIBILITY_CONFIGURED','status_matrix',btrim(p_source)||':'||p_treatment,jsonb_build_object('compatible',p_compatible,'reason',p_reason));
END;
$matrix$;
REVOKE ALL ON FUNCTION private.sri_set_status_compatibility(text,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_set_status_compatibility(text,text,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_set_status_compatibility(p_source text,p_treatment text,p_compatible boolean,p_reason text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $m$ SELECT private.sri_set_status_compatibility(p_source,p_treatment,p_compatible,p_reason); $m$;
REVOKE ALL ON FUNCTION public.sri_set_status_compatibility(text,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_set_status_compatibility(text,text,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.sri_detect_reconciliation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $detect$
DECLARE prior public.daily_operator_tasks%rowtype;
BEGIN
 IF NEW.treatment_status IS NULL OR NEW.source_status IS NULL OR NEW.source_status='' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.source_status IS NOT DISTINCT FROM NEW.source_status THEN RETURN NEW; END IF;
  prior:=OLD;
 ELSE
  SELECT t.* INTO prior FROM public.daily_operator_tasks t
  JOIN public.daily_result_snapshots s ON s.id=t.snapshot_id
  JOIN public.daily_result_snapshots n ON n.id=NEW.snapshot_id
  WHERE t.protocol_number=NEW.protocol_number AND t.operational_day=NEW.operational_day
  AND s.team_id IS NOT DISTINCT FROM n.team_id AND t.snapshot_id<>NEW.snapshot_id
  ORDER BY s.created_at DESC,t.updated_at DESC,t.id DESC LIMIT 1;
 END IF;
 IF prior.source_status IS NULL OR prior.source_status='' OR prior.source_status=NEW.source_status THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM private.sri_status_compatibility m WHERE m.source_status=NEW.source_status AND m.treatment_status=NEW.treatment_status AND m.compatible) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM private.sri_status_reconciliation r WHERE r.operational_day=NEW.operational_day
 AND r.protocol_number=NEW.protocol_number AND r.team_id IS NOT DISTINCT FROM NEW.team_id
 AND r.previous_source=prior.source_status AND r.current_source=NEW.source_status AND r.manual_status=NEW.treatment_status) THEN RETURN NEW; END IF;
 INSERT INTO private.sri_status_reconciliation(task_id,snapshot_id,protocol_number,operational_day,team_id,operator_id,base_name,area_name,previous_source,current_source,manual_status)
 VALUES(NEW.id,NEW.snapshot_id,NEW.protocol_number,NEW.operational_day,NEW.team_id,NEW.operator_user_id,NEW.base_name,NEW.area_name,prior.source_status,NEW.source_status,NEW.treatment_status)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END;
$detect$;
REVOKE ALL ON FUNCTION private.sri_detect_reconciliation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sri_detect_reconciliation AFTER INSERT OR UPDATE OF source_status ON public.daily_operator_tasks FOR EACH ROW EXECUTE FUNCTION private.sri_detect_reconciliation();
CREATE OR REPLACE FUNCTION private.sri_list_reconciliation(p_day date)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $list$
 SELECT to_jsonb(r)||jsonb_build_object('operator_name',p.full_name,'team_name',t.name,'reviewer_name',u.full_name)
 FROM private.sri_status_reconciliation r LEFT JOIN public.profiles p ON p.id=r.operator_id
 LEFT JOIN public.teams t ON t.id=r.team_id LEFT JOIN public.profiles u ON u.id=r.decided_by
 WHERE auth.uid() IS NOT NULL AND r.operational_day=p_day
 AND (private.is_manager() OR (r.team_id IS NOT NULL AND private.is_supervisor_of(r.team_id)))
 ORDER BY r.observed_at DESC,r.id DESC LIMIT 2000
$list$;
CREATE OR REPLACE FUNCTION private.sri_decide_reconciliation(p_id bigint,p_decision text,p_justification text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $dec$
DECLARE r private.sri_status_reconciliation%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória';END IF;
 SELECT * INTO r FROM private.sri_status_reconciliation WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT (private.is_manager() OR (r.team_id IS NOT NULL AND private.is_supervisor_of(r.team_id))) THEN RAISE EXCEPTION 'Conciliação indisponível';END IF;
 IF r.decision IS NOT NULL THEN RAISE EXCEPTION 'Conciliação já analisada';END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('base','manual','both','return') OR length(btrim(coalesce(p_justification,''))) NOT BETWEEN 1 AND 1500 THEN RAISE EXCEPTION 'Selecione a decisão e informe a justificativa';END IF;
 UPDATE private.sri_status_reconciliation SET decision=p_decision,justification=btrim(p_justification),decided_by=auth.uid(),decided_at=now() WHERE id=p_id;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details) VALUES(auth.uid(),'STATUS_RECONCILIATION','daily_operator_task',r.task_id::text,jsonb_build_object('reconciliation_id',r.id,'decision',p_decision,'justification',p_justification,'previous_source',r.previous_source,'current_source',r.current_source,'manual_status',r.manual_status));
END;
$dec$;
REVOKE ALL ON FUNCTION private.sri_list_reconciliation(date),private.sri_decide_reconciliation(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_list_reconciliation(date),private.sri_decide_reconciliation(bigint,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_list_reconciliation(p_day date) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $l$ SELECT * FROM private.sri_list_reconciliation(p_day); $l$;
CREATE OR REPLACE FUNCTION public.sri_decide_reconciliation(p_id bigint,p_decision text,p_justification text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $d$ SELECT private.sri_decide_reconciliation(p_id,p_decision,p_justification); $d$;
REVOKE ALL ON FUNCTION public.sri_list_reconciliation(date),public.sri_decide_reconciliation(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_list_reconciliation(date),public.sri_decide_reconciliation(bigint,text,text) TO authenticated;
COMMIT;
