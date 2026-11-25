-- Scope every write performed by a general publication, including carried
-- assignments and deactivation of older rounds.
BEGIN;
CREATE OR REPLACE FUNCTION private.sri_p03_can_manage_task(p_operator uuid,p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.is_manager() OR EXISTS(
  SELECT 1 FROM public.profiles me JOIN public.profiles operator ON operator.id=p_operator
  WHERE me.id=auth.uid() AND me.role IN ('supervisor','assistant')
  AND (operator.supervisor_id=me.id OR (p_team IS NOT NULL AND private.is_supervisor_of(p_team)))
 );
$$;
REVOKE ALL ON FUNCTION private.sri_p03_can_manage_task(uuid,uuid) FROM PUBLIC,anon,authenticated;

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
   AND private.sri_p03_can_manage_task(old.operator_user_id,old.team_id)
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
   AND private.sri_p03_can_manage_task(old.operator_user_id,old.team_id)
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
   AND private.sri_p03_can_manage_task(t.operator_user_id,t.team_id)
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
  WHERE p.id=auth.uid() AND p.role IN ('supervisor','assistant'))) THEN
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
 WHERE t.snapshot_id=p_snapshot AND t.active AND t.distribution_revision<>v_revision
 AND private.sri_p03_can_manage_task(t.operator_user_id,t.team_id);
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 -- Versionamento: a nova rodada desativa a anterior SOMENTE deste turno/apuração geral.
 UPDATE public.daily_operator_tasks t SET active=false,updated_at=now()
 WHERE t.snapshot_id<>p_snapshot AND t.operational_day=v_day AND t.shift_label=v_shift
  AND t.active AND private.sri_p03_can_manage_task(t.operator_user_id,t.team_id)
  AND EXISTS(SELECT 1 FROM public.daily_result_snapshots s
    WHERE s.id=t.snapshot_id AND s.team_id IS NULL);
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES((SELECT auth.uid()),'GENERAL_OPERATOR_TASKS_PUBLISHED','daily_result',p_snapshot::text,
  jsonb_build_object('revision',v_revision,'published',v_published,'prior_revision_removed',v_changed));
 RETURN jsonb_build_object('published',v_published,'unlinked',0,'revision',v_revision);
END;
$function$
;



REVOKE ALL ON FUNCTION public.publish_general_operator_tasks(uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_general_operator_tasks(uuid,bigint,jsonb) TO authenticated;
COMMIT;
