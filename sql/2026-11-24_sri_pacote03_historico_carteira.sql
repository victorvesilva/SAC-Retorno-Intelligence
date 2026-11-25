BEGIN;
-- Pacote 03: read-only history, without reactivating tasks or altering treatment records.
CREATE OR REPLACE FUNCTION private.sri_my_history_page(p_before bigint DEFAULT NULL,p_limit integer DEFAULT 200)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',h.id::text,'action',h.action,'notes',h.notes,'created_at',h.created_at,'task_id',h.task_id,'protocol_number',t.protocol_number,'base_name',t.base_name,'area_name',t.area_name)
 FROM public.daily_operator_treatments h JOIN public.daily_operator_tasks t ON t.id=h.task_id
 WHERE h.actor_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='operator' AND p.operational_status IN ('Ativo','Promovido'))
 AND (p_before IS NULL OR h.id<p_before)
 ORDER BY h.id DESC LIMIT greatest(1,least(coalesce(p_limit,200),200))
$$;
CREATE OR REPLACE FUNCTION public.sri_my_history_page(p_before bigint DEFAULT NULL,p_limit integer DEFAULT 200)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.sri_my_history_page(p_before,p_limit); $$;
-- completed_in_tool is deliberately NOT treated as confirmed resolution in SIGO.
-- Historical rows require the caller's own recorded treatment, and are never reactivated.
CREATE OR REPLACE FUNCTION private.sri_my_daily_processed(p_before text DEFAULT NULL,p_limit integer DEFAULT 200)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH own_rows AS (
 SELECT DISTINCT ON(t.protocol_number) t.id,t.protocol_number,t.base_name,t.area_name,t.criticality,t.priority_reason,t.due_date,t.due_situation,t.sla_band,t.channel,t.shift_label,t.work_status,t.treatment_status,t.updated_at,t.active,t.operational_day
 FROM public.daily_operator_tasks t
 WHERE t.operator_user_id=auth.uid()
 AND t.operational_day=(now() AT TIME ZONE 'America/Fortaleza')::date
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='operator' AND p.operational_status IN ('Ativo','Promovido'))
 AND EXISTS(SELECT 1 FROM public.daily_operator_treatments h WHERE h.task_id=t.id AND h.actor_id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.daily_operator_tasks a WHERE a.protocol_number=t.protocol_number AND a.operational_day=t.operational_day AND a.active AND a.operator_user_id=auth.uid())
 ORDER BY t.protocol_number,t.updated_at DESC,t.id DESC
 ) SELECT to_jsonb(x) FROM own_rows x WHERE x.active=false AND x.work_status='completed_in_tool' AND (p_before IS NULL OR x.protocol_number>p_before)
 ORDER BY x.protocol_number LIMIT greatest(1,least(coalesce(p_limit,200),200))
$$;
CREATE OR REPLACE FUNCTION public.sri_my_daily_processed(p_before text DEFAULT NULL,p_limit integer DEFAULT 200)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.sri_my_daily_processed(p_before,p_limit); $$;
REVOKE ALL ON FUNCTION private.sri_my_history_page(bigint,integer),public.sri_my_history_page(bigint,integer),private.sri_my_daily_processed(text,integer),public.sri_my_daily_processed(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_my_history_page(bigint,integer),public.sri_my_history_page(bigint,integer),private.sri_my_daily_processed(text,integer),public.sri_my_daily_processed(text,integer) TO authenticated;
COMMIT;