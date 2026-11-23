-- SAC Retorno Intelligence 2.0 · Operadores cadastrados elegíveis à distribuição
-- A listagem é limitada à equipe autorizada e aos operadores ainda sem equipe.
-- Ao publicar tarefas, o vínculo só é criado para quem já foi efetivamente atribuído
-- à apuração, sem movimentar automaticamente contas de outras equipes.

CREATE OR REPLACE FUNCTION public.sri_distribution_operator_candidates(p_team uuid)
RETURNS TABLE(user_id uuid, full_name text, operational_status text, team_id uuid, supervisor_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT (private.is_manager() OR private.is_supervisor_of(p_team)) THEN
    RAISE EXCEPTION 'Somente gestão ou supervisão da equipe pode consultar candidatos';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.teams t WHERE t.id=p_team AND t.active) THEN
    RAISE EXCEPTION 'Selecione uma equipe ativa';
  END IF;

  RETURN QUERY
  SELECT p.id, COALESCE(NULLIF(btrim(p.full_name),''),'Operador sem nome'),
         p.operational_status, tm.team_id,
         COALESCE(NULLIF(btrim(s.full_name),''),t.name,'Sem supervisor')
  FROM public.profiles p
  LEFT JOIN public.team_memberships tm ON tm.user_id=p.id AND tm.team_id=p_team
  LEFT JOIN public.teams t ON t.id=tm.team_id
  LEFT JOIN public.profiles s ON s.id=p.supervisor_id
  WHERE p.role='operator'
    AND p.operational_status IN ('Ativo','Promovido')
    -- Evitar exposição ou transferência de pessoas vinculadas a outra equipe.
    AND NOT EXISTS (
      SELECT 1 FROM public.team_memberships other
       WHERE other.user_id=p.id AND other.team_id<>p_team
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.operator_links linked
       WHERE linked.user_id=p.id AND linked.team_id<>p_team
    )
  ORDER BY p.full_name, p.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sri_activate_assigned_operator_accounts(
  p_snapshot uuid, p_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_team uuid; v_revision bigint; v_state jsonb;
  v_user uuid; v_role text; v_status text;
  v_new_links integer:=0; v_checked integer:=0; v_joined integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória'; END IF;
  SELECT s.team_id, d.revision, d.state INTO v_team, v_revision, v_state
    FROM public.daily_result_snapshots s
    JOIN public.daily_result_distributions d ON d.snapshot_id=s.id
   WHERE s.id=p_snapshot;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuração ou distribuição inexistente'; END IF;
  IF NOT (private.is_manager() OR private.is_supervisor_of(v_team)) THEN
    RAISE EXCEPTION 'Somente gestão ou supervisão da equipe pode vincular operadores';
  END IF;
  IF v_revision<>p_revision THEN
    RAISE EXCEPTION 'Distribuição alterada em outra sessão: atualize a apuração';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.teams WHERE id=v_team AND active) THEN
    RAISE EXCEPTION 'A equipe de destino está inativa';
  END IF;
  IF jsonb_typeof(v_state->'assignments') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Distribuição inválida';
  END IF;

  FOR v_user IN
    SELECT DISTINCT substring(e.value->>'opId' from 6)::uuid
      FROM jsonb_each(v_state->'assignments') e
     WHERE e.value->>'opId' ~ '^acct:[0-9a-fA-F-]{36}$'
     ORDER BY 1
  LOOP
    SELECT p.role,p.operational_status INTO v_role,v_status
      FROM public.profiles p WHERE p.id=v_user FOR UPDATE;
    IF NOT FOUND OR v_role<>'operator' OR v_status NOT IN ('Ativo','Promovido') THEN
      RAISE EXCEPTION 'A distribuição contém um perfil inexistente ou operador indisponível';
    END IF;
    IF EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.user_id=v_user AND tm.team_id<>v_team)
      OR EXISTS(SELECT 1 FROM public.operator_links ol WHERE ol.user_id=v_user AND ol.team_id<>v_team) THEN
      RAISE EXCEPTION 'Operador já pertence a outra equipe; solicite à gestão a transferência autorizada';
    END IF;

    INSERT INTO public.team_memberships(user_id,team_id)
      VALUES(v_user,v_team) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_joined=ROW_COUNT;
    INSERT INTO public.operator_links(team_id,user_id,operator_name,linked_by)
      VALUES(v_team,v_user,'USER:'||v_user::text,(SELECT auth.uid()))
      ON CONFLICT (team_id,user_id) DO NOTHING;

    IF v_joined>0 THEN
      v_new_links:=v_new_links+1;
      INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
        VALUES((SELECT auth.uid()),'DISTRIBUTION_OPERATOR_AUTO_LINKED','profile',v_user::text,
          jsonb_build_object('team_id',v_team,'snapshot_id',p_snapshot,'revision',p_revision));
    END IF;
    v_checked:=v_checked+1;
  END LOOP;
  RETURN jsonb_build_object('checked',v_checked,'auto_linked',v_new_links);
END;
$function$;

REVOKE ALL ON FUNCTION public.sri_distribution_operator_candidates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sri_activate_assigned_operator_accounts(uuid,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sri_distribution_operator_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sri_activate_assigned_operator_accounts(uuid,bigint) TO authenticated;
