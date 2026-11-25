BEGIN;
-- Preserve context at the instant of the treatment. No historical backfill.
CREATE OR REPLACE FUNCTION private.sri_p03_capture_treatment_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 SELECT jsonb_build_object('protocol_number',t.protocol_number,'base_name',t.base_name,'area_name',t.area_name,
  'source_status',t.source_status,'work_status',private.sri_p03_status_work(NEW.action),'version','20261125',
  'team_id',t.team_id,'team_name',tm.name,'actor_name',p.full_name,'criticality',t.criticality,
  'sla_band',t.sla_band,'due_situation',t.due_situation,'due_date',t.due_date,'channel',t.channel)
 INTO NEW.event_context FROM public.daily_operator_tasks t
 LEFT JOIN public.teams tm ON tm.id=t.team_id LEFT JOIN public.profiles p ON p.id=NEW.actor_id WHERE t.id=NEW.task_id;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.sri_p03_reporting_page(p_from date,p_to date,p_after text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer_role text; start_at timestamptz; end_at timestamptz;
BEGIN
 SELECT role INTO viewer_role FROM public.profiles WHERE id=auth.uid();
 IF viewer_role IS NULL OR viewer_role NOT IN ('admin','manager','supervisor','assistant') THEN RAISE EXCEPTION 'Relatórios restritos à gestão'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>92 THEN RAISE EXCEPTION 'Selecione até 93 dias'; END IF;
 start_at:=p_from::timestamp AT TIME ZONE 'America/Sao_Paulo';end_at:=(p_to+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
 RETURN QUERY
 WITH scoped_tasks AS MATERIALIZED (
  SELECT t.*,tm.name AS team_name,p.full_name AS operator_name FROM public.daily_operator_tasks t
  LEFT JOIN public.teams tm ON tm.id=t.team_id LEFT JOIN public.profiles p ON p.id=t.operator_user_id
  WHERE (viewer_role IN ('admin','manager') OR (t.team_id IS NOT NULL AND private.is_supervisor_of(t.team_id)))
 ), events AS (
  SELECT 'A:'||t.id::text AS cursor_key,jsonb_build_object('kind','assignment','id',t.id,'day',t.operational_day,
   'at',t.created_at,'protocol',t.protocol_number,'team_id',t.team_id,'team',t.team_name,'operator_id',t.operator_user_id,
   'operator',t.operator_name,'base',t.base_name,'area',t.area_name,'sla',t.sla_band,'criticality',t.criticality,
   'due_situation',t.due_situation,'due_date',t.due_date,'channel',t.channel,'source_status',t.source_status,
   'work_status',t.work_status,'status',t.treatment_status,'active',t.active,
   'state_reference','Estado armazenado da atribuição; conclusões do período são calculadas pelos eventos') AS payload
  FROM scoped_tasks t WHERE t.operational_day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'H:'||lpad(h.id::text,20,'0'),jsonb_build_object('kind','treatment','id',h.id::text,
   'day',(h.created_at AT TIME ZONE 'America/Sao_Paulo')::date,'at',h.created_at,'protocol',coalesce(h.event_context->>'protocol_number',t.protocol_number),
   'team_id',coalesce((h.event_context->>'team_id')::uuid,t.team_id),'team',coalesce(h.event_context->>'team_name',t.team_name),
   'operator_id',h.actor_id,'operator',coalesce(h.event_context->>'actor_name',p.full_name),
   'base',h.event_context->>'base_name','area',h.event_context->>'area_name','status',h.action,
   'sla',h.event_context->>'sla_band','criticality',h.event_context->>'criticality','context_available',h.event_context IS NOT NULL)
  FROM public.daily_operator_treatments h JOIN scoped_tasks t ON t.id=h.task_id LEFT JOIN public.profiles p ON p.id=h.actor_id
  WHERE h.created_at>=start_at AND h.created_at<end_at
   AND (viewer_role IN ('admin','manager') OR private.is_supervisor_of(coalesce((h.event_context->>'team_id')::uuid,t.team_id)))
  UNION ALL
  SELECT 'I:'||s.id::text,jsonb_build_object('kind','import','id',s.id,'day',s.operational_day,'at',s.created_at,
   'team_id',s.team_id,'team',tm.name,'operator_id',s.imported_by,'operator',p.full_name,'shift',s.shift_label,
   'protocol_count',s.protocol_count,'indicators',s.indicators)
  FROM public.daily_result_snapshots s LEFT JOIN public.teams tm ON tm.id=s.team_id LEFT JOIN public.profiles p ON p.id=s.imported_by
  WHERE s.operational_day BETWEEN p_from AND p_to AND (viewer_role IN ('admin','manager') OR
   (s.team_id IS NOT NULL AND private.is_supervisor_of(s.team_id)) OR (s.team_id IS NULL AND s.imported_by=auth.uid()))
  UNION ALL
  SELECT 'R:'||lpad(r.id::text,20,'0'),jsonb_build_object('kind','reconciliation','id',r.id::text,
   'day',(r.observed_at AT TIME ZONE 'America/Sao_Paulo')::date,'at',r.observed_at,'protocol',r.protocol_number,
   'team_id',r.team_id,'team',tm.name,'operator_id',r.operator_id,'operator',p.full_name,'base',r.base_name,'area',r.area_name,
   'previous',r.previous_source,'source_status',r.current_source,'status',r.manual_status,'decision',r.decision,
   'decision_at',r.decided_at,'justification',r.justification,'event_kind',r.event_kind)
  FROM private.sri_status_reconciliation r LEFT JOIN public.teams tm ON tm.id=r.team_id LEFT JOIN public.profiles p ON p.id=r.operator_id
  WHERE r.observed_at>=start_at AND r.observed_at<end_at AND (viewer_role IN ('admin','manager') OR
   (r.team_id IS NOT NULL AND private.is_supervisor_of(r.team_id)))
  UNION ALL
  SELECT 'C:team:'||c.id::text,jsonb_build_object('kind','closure','id','team:'||c.id::text,
   'day',c.operational_day,'at',c.closed_at,'team_id',c.team_id,'team',tm.name,'shift',c.shift_label,
   'status',c.status,'reopened_at',c.reopened_at,'justification',c.reopen_reason)
  FROM public.sri_result_shift_closures c LEFT JOIN public.teams tm ON tm.id=c.team_id
  WHERE c.operational_day BETWEEN p_from AND p_to AND (viewer_role IN ('admin','manager') OR private.is_supervisor_of(c.team_id))
  UNION ALL
  SELECT 'C:general:'||c.operational_day::text,jsonb_build_object('kind','closure','id','general:'||c.operational_day::text,
   'day',c.operational_day,'at',c.closed_at,'status',c.status,'protocol_count',c.protocol_count,'scope','general')
  FROM public.sri_general_day_closures c WHERE c.operational_day BETWEEN p_from AND p_to AND viewer_role IN ('admin','manager')
  UNION ALL
  SELECT 'V:'||lpad(e.id::text,20,'0'),jsonb_build_object('kind','movement','id',e.id::text,
   'day',(e.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date,'at',e.occurred_at,
   'protocol',coalesce(e.details->>'event_protocol',t.protocol_number),'team_id',coalesce((e.details->>'event_team_id')::uuid,t.team_id),
   'team',coalesce(e.details->>'event_team_name',tm.name),'assigned_operator_id',coalesce(e.details->>'event_operator_id',t.operator_user_id::text),
   'assigned_operator',coalesce(e.details->>'event_operator_name',t.operator_name),'operator_id',e.user_id,'operator',coalesce(e.details->>'actor_name_at_event',p.full_name),
   'base',e.details->>'event_base','area',e.details->>'event_area','action',e.action,
   'previous',coalesce(e.details->>'previous_treatment_status',e.details->>'previous_value'),
   'status',coalesce(e.details->>'treatment_status',e.details->>'new_value'),
   'justification',coalesce(e.details->>'reason',e.details->>'justification'),'origin',e.details->>'event_origin')
  FROM public.audit_events e LEFT JOIN scoped_tasks t ON e.object_type='daily_operator_task' AND e.object_id=t.id::text
  LEFT JOIN public.teams tm ON tm.id=coalesce((e.details->>'event_team_id')::uuid,t.team_id) LEFT JOIN public.profiles p ON p.id=e.user_id
  WHERE e.occurred_at>=start_at AND e.occurred_at<end_at AND (viewer_role IN ('admin','manager') OR
   private.is_supervisor_of(coalesce((e.details->>'event_team_id')::uuid,t.team_id)))
 )
 SELECT payload||jsonb_build_object('cursor',cursor_key) FROM events
 WHERE p_after IS NULL OR cursor_key>p_after ORDER BY cursor_key LIMIT 400;
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_reporting_page(p_from date,p_to date,p_after text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.sri_p03_reporting_page(p_from,p_to,p_after)
$$;
REVOKE ALL ON FUNCTION private.sri_p03_reporting_page(date,date,text),public.sri_p03_reporting_page(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_reporting_page(date,date,text),public.sri_p03_reporting_page(date,date,text) TO authenticated;
COMMIT;
