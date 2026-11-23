-- SAC Retorno Intelligence 2.0 · turnos automaticos e fechamento 20h Brasilia
-- A partir de 20:00 America/Sao_Paulo, importacoes sao do dia operacional seguinte.
-- Snapshots sao append-only: nenhuma apuracao, distribuicao ou tratativa e excluida.
-- Fechamento autonomo roda no banco, independentemente de navegador/supervisor.
-- Responsavel NULL significa "sistema" apenas para fechamentos automaticos.
ALTER TABLE public.sri_result_shift_closures ALTER COLUMN closed_by DROP NOT NULL;
ALTER TABLE public.sri_result_day_closures ALTER COLUMN closed_by DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.sri_close_due_days(p_clock timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE
  v_local timestamp;
  v_limit date;
  v_day date;
  v_snapshot record;
  v_tasks integer;
  v_mismatch integer;
  v_assignments integer;
  v_expected integer;
  v_pending integer;
  v_conf jsonb;
  v_metrics jsonb;
  v_closure uuid;
  v_closed_shifts integer := 0;
  v_closed_days integer := 0;
  v_pending_days integer := 0;
BEGIN
  v_local := p_clock AT TIME ZONE 'America/Sao_Paulo';
  v_limit := v_local::date - CASE WHEN v_local::time < time '20:00:00' THEN 1 ELSE 0 END;

  -- Reconstitui fechamentos pendentes mesmo se o job falhou em uma rodada.
  FOR v_day IN
    SELECT DISTINCT s.operational_day
    FROM public.daily_result_snapshots s
    WHERE s.operational_day <= v_limit
      AND NOT EXISTS (
        SELECT 1 FROM public.sri_result_day_closures c
        WHERE c.operational_day=s.operational_day
      )
    ORDER BY s.operational_day
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||v_day::text,0));
    -- Nunca refazer fechamento/reabertura deliberada pela gestao.
    IF EXISTS(SELECT 1 FROM public.sri_result_day_closures d WHERE d.operational_day=v_day) THEN
      CONTINUE;
    END IF;

    FOR v_snapshot IN
      SELECT DISTINCT ON (s.team_id,s.shift_label)
        s.id,s.team_id,s.operational_day,s.shift_label,s.protocol_count,s.indicators,s.warnings,
        d.revision,d.state
      FROM public.daily_result_snapshots s
      LEFT JOIN public.daily_result_distributions d ON d.snapshot_id=s.id
      WHERE s.operational_day=v_day
      ORDER BY s.team_id,s.shift_label,s.created_at DESC,s.id DESC
    LOOP
      -- Nao ocultar uma reabertura manual ou converter uma apuracao incompleta em "fechada".
      IF EXISTS(
        SELECT 1 FROM public.sri_result_shift_closures c
        WHERE c.team_id=v_snapshot.team_id AND c.operational_day=v_day
          AND c.shift_label=v_snapshot.shift_label
      ) THEN CONTINUE; END IF;
      IF v_snapshot.revision IS NULL OR v_snapshot.revision < 1 THEN CONTINUE; END IF;
      IF jsonb_typeof(v_snapshot.state->'assignments') IS DISTINCT FROM 'object' THEN CONTINUE; END IF;

      SELECT count(*),
             count(*) FILTER (WHERE distribution_revision IS DISTINCT FROM v_snapshot.revision)
      INTO v_tasks,v_mismatch
      FROM public.daily_operator_tasks t
      WHERE t.snapshot_id=v_snapshot.id AND t.active;
      SELECT count(*) INTO v_assignments
      FROM jsonb_object_keys(COALESCE(v_snapshot.state->'assignments','{}'::jsonb));
      IF v_mismatch>0 OR v_assignments>v_tasks OR
        (v_snapshot.protocol_count>0 AND v_tasks=0) THEN CONTINUE; END IF;

      v_conf:=jsonb_build_object(
        'automatic',true,'cutoff_local','20:00','time_zone','America/Sao_Paulo',
        'protocol_count',v_snapshot.protocol_count,'indicators',v_snapshot.indicators,
        'warnings',v_snapshot.warnings,'distribution_revision',v_snapshot.revision,
        'published_tasks',v_tasks,'snapshot_id',v_snapshot.id,
        'notice','Fechamento administrativo automatico: nao encerra protocolos no SIGO');
      INSERT INTO public.sri_result_shift_closures
        (team_id,operational_day,shift_label,snapshot_id,distribution_revision,conference,closed_by)
      VALUES(v_snapshot.team_id,v_day,v_snapshot.shift_label,v_snapshot.id,
             v_snapshot.revision,v_conf,NULL)
      ON CONFLICT (team_id,operational_day,shift_label) DO NOTHING
      RETURNING id INTO v_closure;
      IF v_closure IS NOT NULL THEN
        v_closed_shifts:=v_closed_shifts+1;
        INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
        VALUES(NULL,'RESULT_SHIFT_AUTO_CLOSED','sri_result_shift_closure',v_closure::text,v_conf);
      END IF;
      v_closure:=NULL;
    END LOOP;

    SELECT count(*), count(*) FILTER (WHERE c.status IS DISTINCT FROM 'closed')
    INTO v_expected,v_pending
    FROM (
      SELECT team_id,shift_label FROM public.shift_expectations WHERE operational_day=v_day
      UNION
      SELECT team_id,shift_label FROM public.daily_result_snapshots WHERE operational_day=v_day
    ) x
    LEFT JOIN public.sri_result_shift_closures c
      ON c.team_id=x.team_id AND c.operational_day=v_day AND c.shift_label=x.shift_label;
    IF v_expected=0 THEN CONTINUE; END IF;
    SELECT jsonb_build_object(
        'protocol_count_sum',COALESCE(sum(s.protocol_count),0),
        'monitored_sum',COALESCE(sum(NULLIF(s.indicators->>'protocolos_monitorados','')::integer),0),
        'snapshots_count',count(*))
    INTO v_metrics
    FROM (
      SELECT DISTINCT ON (team_id,shift_label) *
      FROM public.daily_result_snapshots
      WHERE operational_day=v_day
      ORDER BY team_id,shift_label,created_at DESC,id DESC
    ) s;
    v_conf:=jsonb_build_object(
      'automatic',true,'cutoff_local','20:00','time_zone','America/Sao_Paulo',
      'day',v_day,'expected_shifts',v_expected,'closed_shifts',v_expected-v_pending,
      'pending_shifts',v_pending,'latest_snapshots',v_metrics,
      'notice','Somatorio por turno; nao equivale a protocolos unicos no dia');
    INSERT INTO public.sri_result_day_closures
      (operational_day,status,pending_shift_count,justification,conference,closed_by)
    VALUES(v_day,
           CASE WHEN v_pending>0 THEN 'closed_with_pending' ELSE 'closed' END,
           v_pending,
           CASE WHEN v_pending>0
             THEN 'Fechamento automatico as 20h: turnos incompletos permanecem sinalizados para a gestao'
             ELSE NULL END,
           v_conf,NULL)
    ON CONFLICT(operational_day) DO NOTHING
    RETURNING id INTO v_closure;
    IF v_closure IS NOT NULL THEN
      v_closed_days:=v_closed_days+1;
      IF v_pending>0 THEN v_pending_days:=v_pending_days+1; END IF;
      INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
      VALUES(NULL,'RESULT_DAY_AUTO_CLOSED','sri_result_day_closure',v_closure::text,v_conf);
    END IF;
    v_closure:=NULL;
  END LOOP;
  RETURN jsonb_build_object('automatic',true,'closed_days',v_closed_days,
           'closed_shifts',v_closed_shifts,'days_with_pending',v_pending_days,
           'evaluated_until',v_limit,'time_zone','America/Sao_Paulo');
END;
$function$;

-- Apenas rotinas internas administradas; nao abre novo endpoint anonimo nem supera RLS.
REVOKE ALL ON FUNCTION private.sri_close_due_days(timestamptz) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.sri_close_due_days(timestamptz)
IS 'Job interno e idempotente de fechamento administrativo as 20h Brasilia; nao fecha protocolos SIGO.';

-- Uma nova rodada do mesmo turno preserva a situacao da tratativa do mesmo protocolo
-- e operador. O historico de eventos da tarefa anterior permanece intacto.
CREATE OR REPLACE FUNCTION private.sri_carry_task_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v_status text;
BEGIN
  SELECT t.work_status INTO v_status
  FROM public.daily_operator_tasks t
  WHERE t.team_id=NEW.team_id
    AND t.operational_day=NEW.operational_day
    AND t.shift_label=NEW.shift_label
    AND t.protocol_number=NEW.protocol_number
    AND t.operator_user_id=NEW.operator_user_id
    AND t.snapshot_id<>NEW.snapshot_id
    AND t.active
  ORDER BY t.updated_at DESC,t.id DESC LIMIT 1;
  IF FOUND AND v_status IN ('pending','in_progress','awaiting','completed_in_tool')
    AND COALESCE(NEW.work_status,'pending')='pending' THEN
    NEW.work_status:=v_status;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.sri_carry_task_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sri_carry_task_status_on_refresh ON public.daily_operator_tasks;
CREATE TRIGGER sri_carry_task_status_on_refresh
BEFORE INSERT ON public.daily_operator_tasks
FOR EACH ROW EXECUTE FUNCTION private.sri_carry_task_status();

-- Agendamento independente de navegador: a cada 5 minutos verifica o horario
-- local, executando no marco de 20:00 e recuperando falhas posteriores.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
  'sri-close-20h-brasilia',
  '*/5 * * * *',
  'SELECT private.sri_close_due_days();'
);
