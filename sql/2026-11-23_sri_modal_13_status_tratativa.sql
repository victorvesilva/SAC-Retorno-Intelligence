-- SAC Retorno Intelligence 2.0 — status originais da tratativa no Supabase
-- Preserva estados antigos da operação e as restrições de alçada/autorização.
BEGIN;

ALTER TABLE public.daily_operator_tasks
  ADD COLUMN IF NOT EXISTS treatment_status text;

ALTER TABLE public.daily_operator_tasks
  DROP CONSTRAINT IF EXISTS daily_operator_tasks_treatment_status_check;
ALTER TABLE public.daily_operator_tasks
  ADD CONSTRAINT daily_operator_tasks_treatment_status_check CHECK (
    treatment_status IS NULL OR treatment_status IN (
      'E-MAIL','LIGAÇÃO','ASCSAC','RECUSOU','ACEITOU','ASSOCIADO',
      'OUTROS','FILIAL','DÚVIDA','OUVIDORIA','PENDENTE','MÍDIAS NE','CARTA AR'
    )
  );

-- O histórico anterior de ações genéricas é mantido, sem tradução fictícia.
ALTER TABLE public.daily_operator_treatments
  DROP CONSTRAINT IF EXISTS daily_operator_treatments_action_check;
ALTER TABLE public.daily_operator_treatments
  ADD CONSTRAINT daily_operator_treatments_action_check CHECK (
    action IN (
      'note','in_progress','awaiting','completed_in_tool',
      'E-MAIL','LIGAÇÃO','ASCSAC','RECUSOU','ACEITOU','ASSOCIADO',
      'OUTROS','FILIAL','DÚVIDA','OUVIDORIA','PENDENTE','MÍDIAS NE','CARTA AR'
    )
  );

-- Justificativa opcional: aceita texto vazio, mas limita o tamanho.
ALTER TABLE public.daily_operator_treatments
  DROP CONSTRAINT IF EXISTS daily_operator_treatments_notes_check;
ALTER TABLE public.daily_operator_treatments
  ADD CONSTRAINT daily_operator_treatments_notes_check
  CHECK (length(btrim(notes)) <= 1500);

CREATE OR REPLACE FUNCTION public.record_daily_operator_treatment(
 p_task uuid,p_action text,p_notes text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_task public.daily_operator_tasks%rowtype;
  v_id bigint;
  v_allowed boolean:=false;
  v_note text;
  v_work_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória';
  END IF;

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

  IF p_action IS NULL OR p_action NOT IN (
    'E-MAIL','LIGAÇÃO','ASCSAC','RECUSOU','ACEITOU','ASSOCIADO',
    'OUTROS','FILIAL','DÚVIDA','OUVIDORIA','PENDENTE','MÍDIAS NE','CARTA AR'
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
    WHEN p_action IN ('E-MAIL','LIGAÇÃO','ASCSAC','MÍDIAS NE','CARTA AR')
      THEN 'completed_in_tool'
    WHEN p_action IN ('RECUSOU','ASSOCIADO','FILIAL')
      THEN 'awaiting'
    ELSE 'in_progress'
  END;

  INSERT INTO public.daily_operator_treatments(task_id,actor_id,action,notes)
    VALUES(v_task.id,auth.uid(),p_action,v_note)
    RETURNING id INTO v_id;

  UPDATE public.daily_operator_tasks
     SET treatment_status=p_action,
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
      'treatment_id',v_id
    )
  );
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_daily_operator_treatment(uuid,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_daily_operator_treatment(uuid,text,text)
  TO authenticated;

COMMENT ON COLUMN public.daily_operator_tasks.treatment_status IS
  'Status da tratativa selecionado pelo operador, distinto de work_status e do CD_STATUS do SIGO.';
COMMIT;
