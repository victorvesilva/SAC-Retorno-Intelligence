-- SAC Retorno Intelligence 2.0 — Base geral SAC + ATIVO, sem operação/equipe na importação
-- Mantém registros legados por equipe; team_id NULL identifica apuração CONSOLIDADA GERAL.
-- Operadores podem receber carteira por UUID sem segunda inscrição e sem equipe quando necessário.
-- Atenção: acesso aos protocolos consolidados é somente da gestão e supervisão, nunca de operadores.
BEGIN;

ALTER TABLE public.daily_result_snapshots ALTER COLUMN team_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sri_general_snapshots_unique
  ON public.daily_result_snapshots(operational_day,shift_label,payload_sha256)
  WHERE team_id IS NULL;
CREATE INDEX IF NOT EXISTS sri_general_snapshots_latest
  ON public.daily_result_snapshots(operational_day DESC,created_at DESC)
  WHERE team_id IS NULL;

-- Distribuição geral: tarefas continuam vinculadas ao operador real. Equipe opcional,
-- apenas quando existe vinculação inequívoca (equipe nula não cria uma equipe fictícia).
ALTER TABLE public.daily_operator_tasks ALTER COLUMN team_id DROP NOT NULL;

-- Defesa: somente o dia/turno atuais de Brasília podem ser publicados.
-- O ciclo muda às 20h; as importações seguintes entram no próximo dia operacional.
CREATE OR REPLACE FUNCTION private.sri_current_general_cycle()
RETURNS TABLE(operational_day date,shift_label text)
LANGUAGE sql STABLE SET search_path TO ''
AS $$
 SELECT (
  (now() AT TIME ZONE 'America/Sao_Paulo')::date
  + CASE WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time >= time '20:00' THEN 1 ELSE 0 END
 ) AS operational_day,
 CASE
  WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time >= time '07:00'
   AND (now() AT TIME ZONE 'America/Sao_Paulo')::time < time '13:00' THEN 'Manhã'
  WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time >= time '13:00'
   AND (now() AT TIME ZONE 'America/Sao_Paulo')::time < time '18:00' THEN 'Tarde'
  ELSE 'Noite' END AS shift_label;
$$;
REVOKE ALL ON FUNCTION private.sri_current_general_cycle() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_current_general_cycle() TO authenticated;

CREATE TABLE IF NOT EXISTS public.sri_general_day_closures (
 operational_day date PRIMARY KEY,
 snapshot_id uuid NOT NULL REFERENCES public.daily_result_snapshots(id) ON DELETE RESTRICT,
 protocol_count integer NOT NULL CHECK(protocol_count >= 0),
 closed_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'closed' CHECK(status = 'closed')
);
ALTER TABLE public.sri_general_day_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sri_general_day_closures FROM anon;
GRANT SELECT ON public.sri_general_day_closures TO authenticated;
DROP POLICY IF EXISTS sri_general_closure_read ON public.sri_general_day_closures;
CREATE POLICY sri_general_closure_read ON public.sri_general_day_closures
 FOR SELECT TO authenticated
 USING (private.is_manager() OR EXISTS (
   SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='supervisor'
 ));

-- RLS adicional (OR) só para team_id NULL. Regras de times existentes permanecem intocadas.
DROP POLICY IF EXISTS sri_general_snapshots_read ON public.daily_result_snapshots;
CREATE POLICY sri_general_snapshots_read ON public.daily_result_snapshots
 FOR SELECT TO authenticated
 USING(team_id IS NULL AND (
  private.is_manager() OR EXISTS (
   SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='supervisor'
  )
 ));
DROP POLICY IF EXISTS sri_general_snapshots_insert ON public.daily_result_snapshots;
CREATE POLICY sri_general_snapshots_insert ON public.daily_result_snapshots
 FOR INSERT TO authenticated WITH CHECK (
  team_id IS NULL
  AND imported_by=(SELECT auth.uid())
  AND (
   private.is_manager() OR EXISTS (
     SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='supervisor'
   )
  )
  AND (operational_day,shift_label) IN (SELECT operational_day,shift_label FROM private.sri_current_general_cycle())
  AND NOT EXISTS(
   SELECT 1 FROM public.sri_general_day_closures c WHERE c.operational_day=daily_result_snapshots.operational_day
  )
  AND NOT EXISTS (
   SELECT 1 FROM public.sri_result_day_closures c
   WHERE c.operational_day=daily_result_snapshots.operational_day AND c.status IN('closed','closed_with_pending')
  )
 );

DROP POLICY IF EXISTS sri_general_distribution_read ON public.daily_result_distributions;
CREATE POLICY sri_general_distribution_read ON public.daily_result_distributions
 FOR SELECT TO authenticated USING(
  EXISTS (SELECT 1 FROM public.daily_result_snapshots s
   WHERE s.id=daily_result_distributions.snapshot_id AND s.team_id IS NULL)
  AND (
   private.is_manager() OR EXISTS (
     SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='supervisor'
   )
  )
 );

DROP POLICY IF EXISTS sri_general_distribution_insert ON public.daily_result_distributions;
CREATE POLICY sri_general_distribution_insert ON public.daily_result_distributions
 FOR INSERT TO authenticated WITH CHECK(
  updated_by=(SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.daily_result_snapshots s
   WHERE s.id=daily_result_distributions.snapshot_id AND s.team_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.sri_general_day_closures c WHERE c.operational_day=s.operational_day)
   AND NOT EXISTS(SELECT 1 FROM public.sri_result_day_closures c
    WHERE c.operational_day=s.operational_day AND c.status IN('closed','closed_with_pending')))
  AND (
   private.is_manager() OR EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='supervisor'
   )
  )
 );

DROP POLICY IF EXISTS sri_general_distribution_update ON public.daily_result_distributions;
CREATE POLICY sri_general_distribution_update ON public.daily_result_distributions
 FOR UPDATE TO authenticated USING(
  EXISTS(SELECT 1 FROM public.daily_result_snapshots s WHERE s.id=daily_result_distributions.snapshot_id
   AND s.team_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.sri_general_day_closures c WHERE c.operational_day=s.operational_day))
  AND (private.is_manager() OR EXISTS (
   SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='supervisor'
  ))
 ) WITH CHECK(
  updated_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1 FROM public.daily_result_snapshots s
    WHERE s.id=daily_result_distributions.snapshot_id AND s.team_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.sri_general_day_closures c WHERE c.operational_day=s.operational_day)
      AND NOT EXISTS(SELECT 1 FROM public.sri_result_day_closures c
        WHERE c.operational_day=s.operational_day AND c.status IN('closed','closed_with_pending')))
  AND (private.is_manager() OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='supervisor'
  ))
 );

-- A carteira geral com team_id NULL é privativa do titular ativo.
DROP POLICY IF EXISTS sri_general_tasks_read ON public.daily_operator_tasks;
CREATE POLICY sri_general_tasks_read ON public.daily_operator_tasks
 FOR SELECT TO authenticated USING(
   team_id IS NULL AND active
   AND operator_user_id=(SELECT auth.uid())
   AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.role='operator' AND p.operational_status IN('Ativo','Promovido'))
 );
-- A gestão pode consultar/acompanhar distribuição global sem expandir acesso do operador.
DROP POLICY IF EXISTS sri_general_management_tasks_read ON public.daily_operator_tasks;
CREATE POLICY sri_general_management_tasks_read ON public.daily_operator_tasks
 FOR SELECT TO authenticated USING(
  team_id IS NULL AND private.is_manager()
 );

-- Função auxiliar para popular a lista de TODOS os operadores cadastrados.
-- Não depende de selecionar uma equipe na importação.
CREATE OR REPLACE FUNCTION public.sri_general_distribution_candidates()
RETURNS TABLE(user_id uuid,full_name text,operational_status text,team_id uuid,supervisor_name text)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO ''
AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (
   private.is_manager() OR EXISTS(SELECT 1 FROM public.profiles p
     WHERE p.id=auth.uid() AND p.role='supervisor')
 ) THEN RAISE EXCEPTION 'Acesso restrito à gestão/supervisão'; END IF;
 RETURN QUERY
 SELECT p.id, COALESCE(NULLIF(btrim(p.full_name),''),'Operador sem nome')::text,
   p.operational_status,
   CASE WHEN (SELECT count(*) FROM public.team_memberships tm JOIN public.teams t
     ON t.id=tm.team_id AND t.active WHERE tm.user_id=p.id)=1
    THEN (SELECT tm.team_id FROM public.team_memberships tm JOIN public.teams t
     ON t.id=tm.team_id AND t.active WHERE tm.user_id=p.id LIMIT 1)
    ELSE NULL::uuid END,
   COALESCE(NULLIF(btrim(s.full_name),''),'Sem supervisor')::text
 FROM public.profiles p LEFT JOIN public.profiles s ON s.id=p.supervisor_id
 WHERE p.role='operator' AND p.operational_status IN('Ativo','Promovido')
  AND (private.is_manager() OR p.supervisor_id=(SELECT auth.uid())
   OR EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.user_id=p.id
    AND private.is_supervisor_of(tm.team_id)))
 ORDER BY p.full_name,p.id;
END;
$$;
REVOKE ALL ON FUNCTION public.sri_general_distribution_candidates() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_general_distribution_candidates() TO authenticated;

-- Regra de distribuição global: 1 protocolo->1 operador cadastrado.
-- Equipe é herdada somente quando não há ambiguidades; sem vínculo, tarefa pertence
-- diretamente ao operador. Nenhum outro operador ou supervisor herda este protocolo.
CREATE OR REPLACE FUNCTION public.publish_general_operator_tasks(
 p_snapshot uuid,p_revision bigint,p_details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
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
  SELECT count(*),min(tm.team_id) INTO v_num_teams,v_team
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
  SELECT min(tm.team_id) INTO v_team
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
   criticality,due_situation,sla_band,channel,source_status,distribution_revision,active)
  VALUES(p_snapshot,v_team,v_day,v_shift,v_protocol,v_user,
   left(v_criticality,80),left(v_detail->>'situation',80),left(v_detail->>'sla',50),
   left(v_detail->>'channel',80),
   left(COALESCE(v_state->'statuses'->>v_protocol,v_detail->>'status'),80),v_revision,true)
  ON CONFLICT(snapshot_id,protocol_number) DO UPDATE SET
   operator_user_id=EXCLUDED.operator_user_id,team_id=EXCLUDED.team_id,
   criticality=EXCLUDED.criticality,due_situation=EXCLUDED.due_situation,
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
$$;
REVOKE ALL ON FUNCTION public.publish_general_operator_tasks(uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_general_operator_tasks(uuid,bigint,jsonb) TO authenticated;

-- Tratativa direta mesmo quando o operador ainda não pertence a uma equipe.
-- Validação do perfil e da identidade continua obrigatória, sem liberar acesso cruzado.
CREATE OR REPLACE FUNCTION public.record_daily_operator_treatment(p_task uuid,p_action text,p_notes text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_task public.daily_operator_tasks%rowtype;v_id bigint;v_allowed boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória';END IF;
 SELECT * INTO v_task FROM public.daily_operator_tasks WHERE id=p_task FOR UPDATE;
 IF NOT FOUND OR NOT v_task.active THEN RAISE EXCEPTION 'Tarefa indisponível';END IF;
 IF v_task.operator_user_id=auth.uid() THEN
  SELECT EXISTS(
   SELECT 1 FROM public.profiles p
   WHERE p.id=auth.uid() AND p.role='operator'
    AND p.operational_status IN('Ativo','Promovido')
    AND (v_task.team_id IS NULL OR EXISTS (
      SELECT 1 FROM public.team_memberships tm JOIN public.operator_links ol
        ON ol.user_id=tm.user_id AND ol.team_id=tm.team_id
      WHERE tm.user_id=p.id AND tm.team_id=v_task.team_id))
  ) INTO v_allowed;
 END IF;
 IF NOT (v_allowed OR private.is_manager() OR
   (v_task.team_id IS NOT NULL AND private.is_supervisor_of(v_task.team_id))) THEN
  RAISE EXCEPTION 'Acesso negado à tarefa';END IF;
 IF p_action NOT IN ('note','in_progress','awaiting','completed_in_tool') THEN
  RAISE EXCEPTION 'Tratativa inválida';END IF;
 IF length(btrim(COALESCE(p_notes,''))) NOT BETWEEN 3 AND 1500 THEN
  RAISE EXCEPTION 'A descrição precisa ter entre 3 e 1500 caracteres';END IF;
 INSERT INTO public.daily_operator_treatments(task_id,actor_id,action,notes)
 VALUES(v_task.id,auth.uid(),p_action,btrim(p_notes)) RETURNING id INTO v_id;
 IF p_action<>'note' THEN
  UPDATE public.daily_operator_tasks SET work_status=p_action,updated_at=now() WHERE id=v_task.id;
 END IF;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES(auth.uid(),'DAY_TASK_TREATMENT','daily_operator_task',v_task.id::text,
  jsonb_build_object('team_id',v_task.team_id,'action',p_action));
 RETURN v_id;
END;
$$;

-- Preserva status em reimportações quando team_id é NULL.
DO $$
DECLARE previous text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO previous FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='sri_carry_task_status';
 IF previous IS NULL OR position('t.team_id=NEW.team_id' in previous)=0 THEN
  RAISE EXCEPTION 'Rotina de preservação de tratativas não corresponde à versão esperada';
 END IF;
 EXECUTE replace(previous,'t.team_id=NEW.team_id','t.team_id IS NOT DISTINCT FROM NEW.team_id');
END $$;

-- Fechamento legado ignora snapshots globais e continua protegido para equipes anteriores.
DO $$
DECLARE previous text;adjusted text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO previous FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='sri_close_due_days';
 IF previous IS NULL OR position('WHERE s.operational_day <= v_limit' in previous)=0
    OR position('WHERE s.operational_day=v_day' in previous)=0 THEN
  RAISE EXCEPTION 'Rotina de fechamento legado não corresponde à versão esperada';
 END IF;
 adjusted:=replace(previous,'WHERE s.operational_day <= v_limit',
   'WHERE s.team_id IS NOT NULL AND s.operational_day <= v_limit');
 adjusted:=replace(adjusted,'WHERE s.operational_day=v_day',
   'WHERE s.team_id IS NOT NULL AND s.operational_day=v_day');
 adjusted:=replace(adjusted,'SELECT team_id,shift_label FROM public.daily_result_snapshots WHERE operational_day=v_day',
   'SELECT team_id,shift_label FROM public.daily_result_snapshots WHERE operational_day=v_day AND team_id IS NOT NULL');
 adjusted:=replace(adjusted,'FROM public.daily_result_snapshots'||chr(10)||'      WHERE operational_day=v_day',
   'FROM public.daily_result_snapshots'||chr(10)||'      WHERE operational_day=v_day AND team_id IS NOT NULL');
 EXECUTE adjusted;
END $$;

CREATE OR REPLACE FUNCTION private.sri_close_general_days(p_clock timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SET search_path TO ''
AS $$
DECLARE v_limit date;v_row record;v_closed integer:=0;
BEGIN
 v_limit:=(p_clock AT TIME ZONE 'America/Sao_Paulo')::date
   - CASE WHEN (p_clock AT TIME ZONE 'America/Sao_Paulo')::time < time '20:00'
     THEN 1 ELSE 0 END;
 FOR v_row IN
  SELECT DISTINCT ON(s.operational_day) s.operational_day,s.id,s.protocol_count
  FROM public.daily_result_snapshots s
  WHERE s.team_id IS NULL AND s.operational_day<=v_limit
  ORDER BY s.operational_day,s.created_at DESC,s.id DESC
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('sri-result-day:'||v_row.operational_day::text,0));
  INSERT INTO public.sri_general_day_closures(operational_day,snapshot_id,protocol_count)
  VALUES(v_row.operational_day,v_row.id,v_row.protocol_count)
  ON CONFLICT (operational_day) DO NOTHING;
  IF FOUND THEN
   v_closed:=v_closed+1;
   INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
   VALUES(NULL,'GENERAL_DAY_AUTO_CLOSED','sri_general_day_closure',v_row.operational_day::text,
     jsonb_build_object('snapshot_id',v_row.id,'protocols',v_row.protocol_count,
       'time_zone','America/Sao_Paulo','cutoff_local','20:00'));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('closed_days',v_closed,'evaluated_until',v_limit,
  'automatic',true,'time_zone','America/Sao_Paulo');
END;
$$;
REVOKE ALL ON FUNCTION private.sri_close_general_days(timestamptz) FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('sri-close-general-20h-brasilia','*/5 * * * *',
 'SELECT private.sri_close_general_days();');

COMMIT;
