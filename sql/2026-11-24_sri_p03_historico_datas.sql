-- Pacote 03 — API histórica com filtros por data, leitura sem alterar estado.
BEGIN;

CREATE OR REPLACE FUNCTION private.sri_p03_my_treatments_page(
 p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_before bigint DEFAULT NULL,p_limit integer DEFAULT 200
) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND p.role='operator' AND p.operational_status IN ('Ativo','Promovido'))
 THEN RAISE EXCEPTION 'Acesso restrito ao operador autenticado'; END IF;
 IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to
 THEN RAISE EXCEPTION 'Período de consulta inválido'; END IF;
 IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to-p_from>366
 THEN RAISE EXCEPTION 'Intervalo máximo de 367 dias'; END IF;
 RETURN QUERY
 SELECT jsonb_build_object('id',h.id,'action',h.action,'notes',h.notes,
   'created_at',h.created_at,'task_id',h.task_id,'protocol_number',t.protocol_number,
   'base_name',t.base_name,'area_name',t.area_name)
 FROM public.daily_operator_treatments h
 JOIN public.daily_operator_tasks t ON t.id=h.task_id
 WHERE h.actor_id=auth.uid()
 AND (p_from IS NULL OR h.created_at >= (p_from::timestamp AT TIME ZONE 'America/Sao_Paulo'))
 AND (p_to IS NULL OR h.created_at < ((p_to+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
 AND (p_before IS NULL OR h.id<p_before)
 ORDER BY h.id DESC
 LIMIT greatest(1,least(coalesce(p_limit,200),200));
END $$;

CREATE OR REPLACE FUNCTION public.sri_p03_my_treatments_page(
 p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_before bigint DEFAULT NULL,p_limit integer DEFAULT 200
) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.sri_p03_my_treatments_page(p_from,p_to,p_before,p_limit);
$$;
REVOKE ALL ON FUNCTION private.sri_p03_my_treatments_page(date,date,bigint,integer),
 public.sri_p03_my_treatments_page(date,date,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_my_treatments_page(date,date,bigint,integer),
 public.sri_p03_my_treatments_page(date,date,bigint,integer) TO authenticated;

-- Lista de snapshots reais por data operacional. Os indicadores globais são exibidos
-- somente a administrador/gestor; supervisores recebem apenas a referência de data/turno.
CREATE OR REPLACE FUNCTION private.sri_p03_history_snapshots(p_day date)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;
BEGIN
 SELECT p.role INTO v_role FROM public.profiles p WHERE p.id=auth.uid();
 IF v_role IS NULL OR v_role NOT IN ('admin','manager','supervisor','assistant') OR p_day IS NULL
 THEN RAISE EXCEPTION 'Consulta histórica indisponível'; END IF;
 RETURN QUERY
 SELECT jsonb_build_object(
   'id',s.id,'operational_day',s.operational_day,'shift_label',s.shift_label,
   'created_at',s.created_at,'protocol_count',
     CASE WHEN v_role IN ('admin','manager') THEN s.protocol_count ELSE NULL END,
   'indicators',CASE WHEN v_role IN ('admin','manager') THEN s.indicators ELSE NULL END)
 FROM public.daily_result_snapshots s
 WHERE s.operational_day=p_day
   AND (v_role IN ('admin','manager') OR
     (s.team_id IS NULL OR private.is_supervisor_of(s.team_id)))
 ORDER BY s.created_at DESC,s.id DESC LIMIT 100;
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_history_snapshots(p_day date)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.sri_p03_history_snapshots(p_day);
$$;

-- Detalhe dos protocolos distribuídos para o snapshot escolhido.
-- Proteção por equipe/vínculo: não expõe carteiras de outros supervisores.
CREATE OR REPLACE FUNCTION private.sri_p03_history_tasks(
 p_snapshot uuid,p_after text DEFAULT NULL,p_limit integer DEFAULT 200
) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;
BEGIN
 SELECT p.role INTO v_role FROM public.profiles p WHERE p.id=auth.uid();
 IF v_role IS NULL OR v_role NOT IN ('admin','manager','supervisor','assistant') OR p_snapshot IS NULL
 THEN RAISE EXCEPTION 'Consulta histórica indisponível'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_result_snapshots s WHERE s.id=p_snapshot
   AND (v_role IN ('admin','manager') OR
        s.team_id IS NULL OR private.is_supervisor_of(s.team_id)))
 THEN RAISE EXCEPTION 'Apuração não autorizada'; END IF;
 RETURN QUERY
 SELECT jsonb_build_object('protocol_number',t.protocol_number,'operator_name',op.full_name,
   'criticality',t.criticality,'source_status',t.source_status,
   'work_status',t.work_status,'treatment_status',t.treatment_status,
   'due_date',t.due_date,'base_name',t.base_name,'area_name',t.area_name,
   'snapshot_id',t.snapshot_id)
 FROM public.daily_operator_tasks t
 JOIN public.profiles op ON op.id=t.operator_user_id
 WHERE t.snapshot_id=p_snapshot
 AND (p_after IS NULL OR t.protocol_number>p_after)
 AND (v_role IN ('admin','manager') OR
   EXISTS(SELECT 1 FROM public.profiles me
    WHERE me.id=auth.uid() AND me.role IN ('supervisor','assistant')
     AND (op.supervisor_id=auth.uid()
        OR EXISTS(SELECT 1 FROM public.team_memberships member
                  JOIN public.team_memberships owner ON owner.team_id=member.team_id
                  WHERE member.user_id=op.id AND owner.user_id=auth.uid()))))
 ORDER BY t.protocol_number,t.id
 LIMIT greatest(1,least(coalesce(p_limit,200),200));
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_history_tasks(
 p_snapshot uuid,p_after text DEFAULT NULL,p_limit integer DEFAULT 200
) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.sri_p03_history_tasks(p_snapshot,p_after,p_limit);
$$;
REVOKE ALL ON FUNCTION private.sri_p03_history_snapshots(date),
 public.sri_p03_history_snapshots(date),private.sri_p03_history_tasks(uuid,text,integer),
 public.sri_p03_history_tasks(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_history_snapshots(date),
 public.sri_p03_history_snapshots(date),private.sri_p03_history_tasks(uuid,text,integer),
 public.sri_p03_history_tasks(uuid,text,integer) TO authenticated;
COMMIT;
