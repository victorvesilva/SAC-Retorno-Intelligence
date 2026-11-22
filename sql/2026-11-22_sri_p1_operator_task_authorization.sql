-- P1 / SAC Retorno Intelligence 2.0
-- Patch proposto. Revisar e homologar antes de aplicar; nao altera SIGO nem retencao.
-- Revoga a autorizacao de leitura/escrita de tarefas a operadores desligados,
-- afastados ou sem os dois vinculos operacionais (equipe + identificacao).
-- Gestores e supervisores preservam suas autorizacoes existentes.

BEGIN;

DROP POLICY IF EXISTS daily_tasks_read ON public.daily_operator_tasks;
CREATE POLICY daily_tasks_read ON public.daily_operator_tasks
 FOR SELECT TO authenticated
 USING (
   (
     active
     AND operator_user_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       JOIN public.team_memberships tm
         ON tm.user_id=p.id AND tm.team_id=daily_operator_tasks.team_id
       JOIN public.operator_links ol
         ON ol.user_id=p.id AND ol.team_id=daily_operator_tasks.team_id
       WHERE p.id=(SELECT auth.uid())
         AND p.role='operator'
         AND p.operational_status IN ('Ativo','Promovido')
     )
   )
   OR private.is_manager()
   OR private.is_supervisor_of(team_id)
 );

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
 v_operator_allowed boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;

 SELECT * INTO v_task FROM public.daily_operator_tasks
 WHERE id=p_task FOR UPDATE;
 IF NOT FOUND OR NOT v_task.active THEN
   RAISE EXCEPTION 'Tarefa indisponível ou inativa';
 END IF;

 -- O vínculo com a tarefa nao substitui a situacao operacional atual.
 IF v_task.operator_user_id=auth.uid() THEN
   SELECT EXISTS(
     SELECT 1 FROM public.profiles p
     JOIN public.team_memberships tm ON tm.user_id=p.id AND tm.team_id=v_task.team_id
     JOIN public.operator_links ol ON ol.user_id=p.id AND ol.team_id=v_task.team_id
     WHERE p.id=auth.uid()
       AND p.role='operator'
       AND p.operational_status IN ('Ativo','Promovido')
   ) INTO v_operator_allowed;
 END IF;
 IF NOT (v_operator_allowed
         OR private.is_manager()
         OR private.is_supervisor_of(v_task.team_id)) THEN
   RAISE EXCEPTION 'Acesso negado a esta tarefa';
 END IF;
 IF p_action NOT IN ('note','in_progress','awaiting','completed_in_tool') THEN
   RAISE EXCEPTION 'Tratativa inválida';
 END IF;
 IF length(btrim(COALESCE(p_notes,''))) NOT BETWEEN 3 AND 1500 THEN
   RAISE EXCEPTION 'A descrição precisa ter de 3 a 1.500 caracteres';
 END IF;

 INSERT INTO public.daily_operator_treatments(task_id,actor_id,action,notes)
 VALUES(v_task.id,auth.uid(),p_action,btrim(p_notes)) RETURNING id INTO v_id;
 IF p_action<>'note' THEN
   UPDATE public.daily_operator_tasks
      SET work_status=p_action,updated_at=now()
    WHERE id=v_task.id;
 END IF;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES(auth.uid(),'DAY_TASK_TREATMENT','daily_operator_task',v_task.id::text,
        jsonb_build_object('team_id',v_task.team_id,'action',p_action));
 RETURN v_id;
END;
$function$;

-- Mantem o endpoint intencionalmente acessivel ao papel authenticated,
-- com autorizacao de negocio verificada dentro da funcao.
REVOKE ALL ON FUNCTION public.record_daily_operator_treatment(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_daily_operator_treatment(uuid,text,text) TO authenticated;

COMMIT;
