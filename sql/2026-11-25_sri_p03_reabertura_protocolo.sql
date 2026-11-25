BEGIN;
CREATE OR REPLACE FUNCTION private.sri_p03_reopen_candidate(p_protocol text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.is_manager() THEN RAISE EXCEPTION 'Reabertura exclusiva de Administrador ou Gestor'; END IF;
 IF p_protocol IS NULL OR length(btrim(p_protocol)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Informe um protocolo válido'; END IF;
 RETURN (
  SELECT jsonb_build_object('id',task.id,'protocol_number',task.protocol_number,'operator_name',operator.full_name,
   'operational_day',task.operational_day,'work_status',task.work_status,'treatment_status',task.treatment_status,
   'updated_at',task.updated_at,'can_reopen',task.work_status='completed_in_tool' OR coalesce(private.sri_p03_status_sigo(task.treatment_status)=3,false))
  FROM public.daily_operator_tasks task JOIN public.daily_result_snapshots snapshot ON snapshot.id=task.snapshot_id
  JOIN public.profiles operator ON operator.id=task.operator_user_id
  WHERE task.protocol_number=btrim(p_protocol) AND task.operational_day<=(now() AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY task.operational_day DESC,snapshot.created_at DESC,snapshot.id DESC,task.id DESC LIMIT 1
 );
END $$;

CREATE OR REPLACE FUNCTION private.sri_p03_reopen_task(p_task uuid,p_expected timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.daily_operator_tasks%rowtype; target public.daily_result_snapshots%rowtype;
 scope_team uuid; latest uuid; current_day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 target_task uuid; reason text:=btrim(p_reason,E' \t\n\r'); revision bigint; changed public.daily_operator_tasks%rowtype;
BEGIN
 IF NOT private.is_manager() THEN RAISE EXCEPTION 'Reabertura exclusiva de Administrador ou Gestor'; END IF;
 IF reason IS NULL OR length(reason) NOT BETWEEN 1 AND 1500 THEN RAISE EXCEPTION 'Justificativa obrigatória, com até 1.500 caracteres'; END IF;
 SELECT * INTO original FROM public.daily_operator_tasks WHERE id=p_task;
 IF NOT FOUND THEN RAISE EXCEPTION 'Protocolo indisponível'; END IF;
 SELECT team_id INTO scope_team FROM public.daily_result_snapshots WHERE id=original.snapshot_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||current_day::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-protocol-scope:'||coalesce(scope_team::text,'general')||':'||original.protocol_number,0));
 SELECT * INTO original FROM public.daily_operator_tasks WHERE id=p_task FOR UPDATE;
 IF p_expected IS NULL OR original.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Protocolo alterado. Consulte novamente antes de reabrir'; END IF;
 SELECT task.id INTO latest FROM public.daily_operator_tasks task JOIN public.daily_result_snapshots snapshot ON snapshot.id=task.snapshot_id
 WHERE task.protocol_number=original.protocol_number AND snapshot.team_id IS NOT DISTINCT FROM scope_team
 AND task.operational_day<=current_day
 ORDER BY task.operational_day DESC,snapshot.created_at DESC,snapshot.id DESC,task.id DESC LIMIT 1;
 IF latest IS DISTINCT FROM p_task THEN RAISE EXCEPTION 'Há atribuição mais recente. Consulte novamente o protocolo'; END IF;
 IF original.work_status<>'completed_in_tool' AND private.sri_p03_status_sigo(original.treatment_status) IS DISTINCT FROM 3
 THEN RAISE EXCEPTION 'O protocolo não está concluído na ferramenta'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=original.operator_user_id AND role='operator' AND operational_status IN ('Ativo','Promovido'))
 THEN RAISE EXCEPTION 'O responsável está indisponível. Revise seu cadastro antes da reabertura'; END IF;
 SELECT snapshot.* INTO target FROM public.daily_result_snapshots snapshot
 JOIN public.daily_result_distributions distribution ON distribution.snapshot_id=snapshot.id
 WHERE snapshot.operational_day=current_day AND snapshot.team_id IS NOT DISTINCT FROM scope_team
 ORDER BY snapshot.created_at DESC,snapshot.id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Publique a apuração do dia para receber o protocolo reaberto'; END IF;
 IF EXISTS(SELECT 1 FROM public.sri_general_day_closures WHERE operational_day=current_day)
 OR EXISTS(SELECT 1 FROM public.sri_result_day_closures WHERE operational_day=current_day AND status IN ('closed','closed_with_pending'))
 OR EXISTS(SELECT 1 FROM public.sri_result_shift_closures WHERE operational_day=current_day AND team_id=original.team_id AND shift_label=target.shift_label AND status='closed')
 THEN RAISE EXCEPTION 'Dia ou turno encerrado. Faça a reabertura autorizada do período antes de reabrir o protocolo'; END IF;
 SELECT id INTO target_task FROM public.daily_operator_tasks WHERE snapshot_id=target.id AND protocol_number=original.protocol_number;
 IF target_task IS NULL THEN
  SELECT distribution.revision INTO revision FROM public.daily_result_distributions distribution WHERE snapshot_id=target.id;
  INSERT INTO public.daily_operator_tasks(snapshot_id,team_id,operational_day,shift_label,protocol_number,operator_user_id,
   criticality,due_situation,sla_band,channel,source_status,work_status,treatment_status,active,distribution_revision,priority_reason,due_date,base_name,area_name)
  VALUES(target.id,original.team_id,current_day,target.shift_label,original.protocol_number,original.operator_user_id,
   original.criticality,original.due_situation,original.sla_band,original.channel,original.source_status,
   original.work_status,original.treatment_status,false,revision,original.priority_reason,original.due_date,original.base_name,original.area_name)
  RETURNING id INTO target_task;
 END IF;
 UPDATE public.daily_operator_tasks SET active=true,work_status='pending',treatment_status=NULL,completed_operational_day=NULL,updated_at=clock_timestamp()
 WHERE id=target_task RETURNING * INTO changed;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES(auth.uid(),'TASK_REOPENED','daily_operator_task',changed.id::text,
  jsonb_build_object('reason',reason,'previous_task_id',original.id,'previous_treatment_status',original.treatment_status,
   'previous_value',original.work_status,'new_value','pending','source_status_preserved',original.source_status));
 RETURN jsonb_build_object('id',changed.id,'protocol_number',changed.protocol_number,'work_status',changed.work_status,'updated_at',changed.updated_at);
END $$;

CREATE OR REPLACE FUNCTION public.sri_p03_reopen_candidate(p_protocol text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.sri_p03_reopen_candidate(p_protocol); $$;
CREATE OR REPLACE FUNCTION public.sri_p03_reopen_task(p_task uuid,p_expected timestamptz,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sri_p03_reopen_task(p_task,p_expected,p_reason); $$;
REVOKE ALL ON FUNCTION private.sri_p03_reopen_candidate(text),public.sri_p03_reopen_candidate(text),
 private.sri_p03_reopen_task(uuid,timestamptz,text),public.sri_p03_reopen_task(uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_reopen_candidate(text),public.sri_p03_reopen_candidate(text),
 private.sri_p03_reopen_task(uuid,timestamptz,text),public.sri_p03_reopen_task(uuid,timestamptz,text) TO authenticated;

DROP TRIGGER IF EXISTS z_sri_p03_roll_forward ON public.daily_operator_tasks;
CREATE TRIGGER z_sri_p03_roll_forward AFTER INSERT OR UPDATE OF active ON public.daily_operator_tasks
 FOR EACH ROW EXECUTE FUNCTION private.sri_p03_roll_forward();
COMMIT;
