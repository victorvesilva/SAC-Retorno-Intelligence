BEGIN;
CREATE TABLE IF NOT EXISTS private.sri_p03_completion_goals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 scope text NOT NULL CHECK(scope IN ('general','team','operator')),
 target uuid,
 effective date NOT NULL,
 percentage numeric(5,2) NOT NULL CHECK(percentage BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 CHECK((scope='general' AND target IS NULL) OR (scope<>'general' AND target IS NOT NULL))
);
ALTER TABLE private.sri_p03_completion_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sri_p03_completion_goals FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS sri_p03_goal_version ON private.sri_p03_completion_goals(scope,target,effective DESC,id DESC);
CREATE OR REPLACE FUNCTION private.sri_p03_goal_allowed(p_scope text,p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles viewer WHERE viewer.id=auth.uid() AND
  (viewer.role IN ('admin','manager') OR (viewer.role IN ('supervisor','assistant') AND
   ((p_scope='team' AND private.is_supervisor_of(p_target)) OR (p_scope='operator' AND EXISTS(
    SELECT 1 FROM public.team_memberships m WHERE m.user_id=p_target AND private.is_supervisor_of(m.team_id)))))))
$$;
CREATE OR REPLACE FUNCTION private.sri_p03_goals()
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','manager','supervisor','assistant')) THEN RAISE EXCEPTION 'Acesso restrito à gestão'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',g.id::text,'scope',g.scope,'target',g.target,'effective',g.effective,
  'percentage',g.percentage,'created_at',g.created_at,'created_by',g.created_by,
  'target_name',CASE WHEN g.scope='general' THEN 'Toda a operação' WHEN g.scope='team' THEN tm.name ELSE p.full_name END)
 FROM private.sri_p03_completion_goals g LEFT JOIN public.teams tm ON g.scope='team' AND tm.id=g.target
 LEFT JOIN public.profiles p ON g.scope='operator' AND p.id=g.target
 WHERE g.scope='general' OR private.sri_p03_goal_allowed(g.scope,g.target)
 ORDER BY g.effective DESC,g.id DESC;
END $$;
CREATE OR REPLACE FUNCTION private.sri_p03_goal_save(p_scope text,p_target uuid,p_effective date,p_percentage numeric,p_expected bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_id bigint; new_id bigint;
BEGIN
 IF NOT private.sri_p03_goal_allowed(p_scope,p_target) THEN RAISE EXCEPTION 'Meta fora do escopo autorizado'; END IF;
 IF p_scope NOT IN ('general','team','operator') OR p_effective IS NULL OR p_percentage IS NULL OR p_percentage<0 OR p_percentage>100
 OR (p_scope='general' AND p_target IS NOT NULL) OR (p_scope<>'general' AND p_target IS NULL) THEN RAISE EXCEPTION 'Parâmetros da meta inválidos'; END IF;
 IF p_scope='team' AND NOT EXISTS(SELECT 1 FROM public.teams WHERE id=p_target AND active) THEN RAISE EXCEPTION 'Equipe inválida'; END IF;
 IF p_scope='operator' AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_target AND role='operator' AND operational_status IN ('Ativo','Promovido')) THEN RAISE EXCEPTION 'Operador inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sri-goal:'||p_scope||':'||coalesce(p_target::text,'general')||':'||p_effective::text,0));
 SELECT id INTO current_id FROM private.sri_p03_completion_goals WHERE scope=p_scope AND target IS NOT DISTINCT FROM p_target AND effective=p_effective ORDER BY id DESC LIMIT 1;
 IF current_id IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Meta atualizada por outro usuário. Consulte novamente'; END IF;
 INSERT INTO private.sri_p03_completion_goals(scope,target,effective,percentage,created_by)
 VALUES(p_scope,p_target,p_effective,p_percentage,auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details)
 VALUES(auth.uid(),'COMPLETION_GOAL_VERSION','completion_goal',new_id::text,
  jsonb_build_object('scope',p_scope,'target',p_target,'effective',p_effective,'percentage',p_percentage,'previous_version',current_id));
 RETURN new_id;
END $$;
CREATE OR REPLACE FUNCTION public.sri_p03_goals() RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.sri_p03_goals() $$;
CREATE OR REPLACE FUNCTION public.sri_p03_goal_save(p_scope text,p_target uuid,p_effective date,p_percentage numeric,p_expected bigint DEFAULT NULL)
RETURNS bigint LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sri_p03_goal_save(p_scope,p_target,p_effective,p_percentage,p_expected) $$;
REVOKE ALL ON FUNCTION private.sri_p03_goal_allowed(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sri_p03_goals(),public.sri_p03_goals(),private.sri_p03_goal_save(text,uuid,date,numeric,bigint),public.sri_p03_goal_save(text,uuid,date,numeric,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_p03_goals(),public.sri_p03_goals(),private.sri_p03_goal_save(text,uuid,date,numeric,bigint),public.sri_p03_goal_save(text,uuid,date,numeric,bigint) TO authenticated;
COMMIT;
