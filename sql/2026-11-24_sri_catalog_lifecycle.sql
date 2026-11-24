-- Pacote integrado: executar somente após homologação e revisão de permissões.
BEGIN;
CREATE OR REPLACE FUNCTION private.sri_manage_catalog_impl(p_kind text,p_action text,p_id uuid,p_name text,p_operation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_before jsonb; v_after jsonb; v_op uuid; v_fk record; v_ref boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_manager() THEN RAISE EXCEPTION 'Ação exclusiva da gestão'; END IF;
 IF p_kind NOT IN ('teams','operations') OR p_kind IS NULL OR p_action NOT IN ('create','edit','enable','disable','delete') OR p_action IS NULL THEN RAISE EXCEPTION 'Ação inválida'; END IF;
 IF p_action IN ('create','edit') AND (length(btrim(coalesce(p_name,'')))<2 OR length(btrim(p_name))>80) THEN RAISE EXCEPTION 'Informe um nome entre 2 e 80 caracteres'; END IF;
 IF p_kind='teams' AND p_action IN ('create','edit','enable') THEN
   IF p_action='enable' THEN SELECT operation_id INTO v_op FROM public.teams WHERE id=p_id; ELSE v_op:=p_operation; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.operations WHERE id=v_op AND active FOR SHARE) THEN RAISE EXCEPTION 'Selecione uma operação ativa'; END IF;
 END IF;
 IF p_action='create' THEN
   IF p_kind='teams' THEN INSERT INTO public.teams(operation_id,name,active) VALUES(v_op,btrim(p_name),true) RETURNING id,to_jsonb(teams) INTO v_id,v_after;
   ELSE INSERT INTO public.operations(name,active) VALUES(btrim(p_name),true) RETURNING id,to_jsonb(operations) INTO v_id,v_after; END IF;
 ELSE
   IF p_kind='teams' THEN SELECT to_jsonb(t) INTO v_before FROM public.teams t WHERE id=p_id FOR UPDATE;
   ELSE SELECT to_jsonb(o) INTO v_before FROM public.operations o WHERE id=p_id FOR UPDATE; END IF;
   IF v_before IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
   v_id:=p_id;
   IF p_kind='teams' AND (p_action IN ('disable','delete') OR (p_action='edit' AND v_op IS DISTINCT FROM (v_before->>'operation_id')::uuid)) THEN
     IF EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=p_id) THEN RAISE EXCEPTION 'Transfira os integrantes antes de continuar'; END IF;
     IF EXISTS(SELECT 1 FROM public.daily_operator_tasks WHERE team_id=p_id AND active) THEN RAISE EXCEPTION 'Redistribua os protocolos ativos antes de continuar'; END IF;
   END IF;
   IF p_kind='operations' AND p_action='disable' AND EXISTS(SELECT 1 FROM public.teams WHERE operation_id=p_id AND active) THEN RAISE EXCEPTION 'Inative as equipes vinculadas antes de continuar'; END IF;
   -- Qualquer referência, inclusive vínculos com ON DELETE CASCADE, impede exclusão.
   IF p_action='delete' OR (p_kind='teams' AND p_action='edit' AND v_op IS DISTINCT FROM (v_before->>'operation_id')::uuid) THEN
     FOR v_fk IN SELECT ns.nspname AS schema_name, cl.relname AS table_name, att.attname AS column_name
       FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
       JOIN pg_attribute att ON att.attrelid=co.conrelid AND att.attnum=co.conkey[1]
       WHERE co.contype='f' AND co.confrelid=CASE WHEN p_kind='teams' THEN 'public.teams'::regclass ELSE 'public.operations'::regclass END
       AND cardinality(co.conkey)=1
     LOOP
       EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',v_fk.schema_name,v_fk.table_name,v_fk.column_name) INTO v_ref USING p_id;
       IF v_ref THEN RAISE EXCEPTION 'Há vínculos ou registros históricos. Preserve o cadastro e utilize a inativação quando possível'; END IF;
     END LOOP;
   END IF;
   IF p_kind='teams' THEN
     CASE p_action
       WHEN 'edit' THEN UPDATE public.teams SET name=btrim(p_name),operation_id=v_op WHERE id=p_id RETURNING to_jsonb(teams) INTO v_after;
       WHEN 'enable' THEN UPDATE public.teams SET active=true WHERE id=p_id RETURNING to_jsonb(teams) INTO v_after;
       WHEN 'disable' THEN UPDATE public.teams SET active=false WHERE id=p_id RETURNING to_jsonb(teams) INTO v_after;
       WHEN 'delete' THEN DELETE FROM public.teams WHERE id=p_id;
     END CASE;
   ELSE
     CASE p_action
       WHEN 'edit' THEN UPDATE public.operations SET name=btrim(p_name) WHERE id=p_id RETURNING to_jsonb(operations) INTO v_after;
       WHEN 'enable' THEN UPDATE public.operations SET active=true WHERE id=p_id RETURNING to_jsonb(operations) INTO v_after;
       WHEN 'disable' THEN UPDATE public.operations SET active=false WHERE id=p_id RETURNING to_jsonb(operations) INTO v_after;
       WHEN 'delete' THEN DELETE FROM public.operations WHERE id=p_id;
     END CASE;
   END IF;
 END IF;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details) VALUES(auth.uid(),'CATALOG_'||upper(p_action),p_kind,v_id::text,jsonb_build_object('before',v_before,'after',v_after));
 RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Já existe um cadastro com esse nome. Consulte também os inativos';
WHEN foreign_key_violation THEN RAISE EXCEPTION 'Existem vínculos ou histórico. Não foi possível concluir';
END; $$;
REVOKE ALL ON FUNCTION private.sri_manage_catalog_impl(text,text,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_manage_catalog_impl(text,text,uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_manage_catalog(p_kind text,p_action text,p_id uuid DEFAULT NULL,p_name text DEFAULT NULL,p_operation uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sri_manage_catalog_impl(p_kind,p_action,p_id,p_name,p_operation) $$;
REVOKE ALL ON FUNCTION public.sri_manage_catalog(text,text,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_manage_catalog(text,text,uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.sri_rename_user_impl(p_user uuid,p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old text; v_role text; v_actor text;
BEGIN
 SELECT role INTO v_actor FROM public.profiles WHERE id=auth.uid();
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_actor NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Ação exclusiva da gestão'; END IF;
 IF length(btrim(coalesce(p_name,'')))<2 OR length(btrim(p_name))>120 THEN RAISE EXCEPTION 'Informe um nome válido'; END IF;
 SELECT full_name,role INTO v_old,v_role FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
 IF v_actor='manager' AND v_role NOT IN ('operator','supervisor') THEN RAISE EXCEPTION 'Ação exclusiva do administrador'; END IF;
 UPDATE public.profiles SET full_name=btrim(p_name) WHERE id=p_user;
 INSERT INTO public.audit_events(user_id,action,object_type,object_id,details) VALUES(auth.uid(),'USER_NAME_CHANGED','profile',p_user::text,jsonb_build_object('before',v_old,'after',btrim(p_name)));
END; $$;
REVOKE ALL ON FUNCTION private.sri_rename_user_impl(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_rename_user_impl(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_rename_user(p_user uuid,p_name text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sri_rename_user_impl(p_user,p_name) $$;
REVOKE ALL ON FUNCTION public.sri_rename_user(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_rename_user(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION private.sri_admin_history_impl(p_kind text,p_id uuid)
RETURNS TABLE(occurred_at timestamptz,actor_name text,action text,details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $history$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_manager() THEN RAISE EXCEPTION 'Ação exclusiva da gestão'; END IF;
 IF p_kind NOT IN ('teams','operations','profile') OR p_id IS NULL THEN RAISE EXCEPTION 'Cadastro inválido'; END IF;
 RETURN QUERY SELECT a.occurred_at,p.full_name,a.action,a.details FROM public.audit_events a
 LEFT JOIN public.profiles p ON p.id=a.user_id
 WHERE a.object_id=p_id::text AND (a.object_type=p_kind OR (p_kind='teams' AND a.object_type='team'))
 AND a.action IN ('CATALOG_CREATE','CATALOG_EDIT','CATALOG_DISABLE','CATALOG_ENABLE','CATALOG_DELETE','TEAM_READY','USER_NAME_CHANGED','USER_TEAM_CONFIGURED','USER_ROLE_CHANGED')
 ORDER BY a.occurred_at DESC LIMIT 100;
END; $history$;
REVOKE ALL ON FUNCTION private.sri_admin_history_impl(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sri_admin_history_impl(text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sri_admin_history(p_kind text,p_id uuid)
RETURNS TABLE(occurred_at timestamptz,actor_name text,action text,details jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $history$ SELECT * FROM private.sri_admin_history_impl(p_kind,p_id) $history$;
REVOKE ALL ON FUNCTION public.sri_admin_history(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sri_admin_history(text,uuid) TO authenticated;
COMMIT;
