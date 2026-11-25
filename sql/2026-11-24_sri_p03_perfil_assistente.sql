-- MEL-EXTRA-003: Assistant profile; same operational team scope as Supervisor.
-- Apply after the other Package 03 migrations, in one transaction.
BEGIN;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
 CHECK (role IN ('operator','viewer','supervisor','assistant','manager','admin'));

-- Explicit whitelist of privileged functions. Only role authorization comparisons are amended,
-- never change manager/admin-only permissions into supervisor permissions.
DO $assistant_funcs$
DECLARE r record; src text; upd text;
BEGIN
 FOR r IN SELECT n.nspname,p.proname,p.oid
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prokind='f' AND (
      (n.nspname='private' AND p.proname IN (
        'is_supervisor_of','sri_supervisor_can_view_user','sri_reconcile_presence',
        'sri_reconciliation_counts','sri_list_reconciliation','sri_decide_reconciliation',
        'sri_rename_user_impl','sri_movement_read'))
      OR (n.nspname='public' AND p.proname IN (
        'admin_change_user_role','sri_set_user_team','management_summary',
        'publish_general_operator_tasks','sri_general_distribution_candidates',
        'sri_result_closure_overview','sri_p03_productivity'))
     )
 LOOP
  src:=pg_get_functiondef(r.oid);
  upd:=src;
  upd:=replace(upd, 'role=''supervisor''','role IN (''supervisor'',''assistant'')');
  upd:=replace(upd, 'role = ''supervisor''','role IN (''supervisor'',''assistant'')');
  upd:=replace(upd, 'role_name NOT IN (''admin'',''manager'',''supervisor'')',
                        'role_name NOT IN (''admin'',''manager'',''supervisor'',''assistant'')');
  upd:=replace(upd, 'role IN (''admin'',''manager'',''supervisor'')',
                        'role IN (''admin'',''manager'',''supervisor'',''assistant'')');
  upd:=replace(upd, 'v_role NOT IN (''operator'',''supervisor'')',
                        'v_role NOT IN (''operator'',''supervisor'',''assistant'')');
  upd:=replace(upd, 'v_role NOT IN (''operator'',''supervisor'')',
                        'v_role NOT IN (''operator'',''supervisor'',''assistant'')');
  upd:=replace(upd, 'v_sup_role NOT IN (''supervisor'',''manager'',''admin'')',
                        'v_sup_role NOT IN (''supervisor'',''assistant'',''manager'',''admin'')');
  upd:=replace(upd, 'v_sup_role=''supervisor''',
                        'v_sup_role IN (''supervisor'',''assistant'')');
  upd:=replace(upd, 'v_actor=''manager'' AND v_role NOT IN (''operator'',''supervisor'')',
                        'v_actor=''manager'' AND v_role NOT IN (''operator'',''supervisor'',''assistant'')');
  upd:=replace(upd, 'p_new_role NOT IN (''operator'',''viewer'',''supervisor'',''manager'',''admin'')',
                        'p_new_role NOT IN (''operator'',''viewer'',''supervisor'',''assistant'',''manager'',''admin'')');
  IF src IS DISTINCT FROM upd THEN EXECUTE upd; END IF;
 END LOOP;
END $assistant_funcs$;

-- All existing RLS scopes remain identical; only supervisor role predicate
-- is extended to assistant role, without manager/admin privilege broadening.
DO $assistant_policies$
DECLARE r record; oldq text; newq text; oldw text; neww text; statement text;
BEGIN
 FOR r IN SELECT * FROM pg_policies WHERE schemaname='public'
   AND (coalesce(qual,'') LIKE '%role = ''supervisor''::text%'
     OR coalesce(with_check,'') LIKE '%role = ''supervisor''::text%')
 LOOP
  oldq:=r.qual;oldw:=r.with_check;
  newq:=replace(oldq, 'role = ''supervisor''::text',
         'role = ANY (ARRAY[''supervisor''::text,''assistant''::text])');
  neww:=replace(oldw, 'role = ''supervisor''::text',
         'role = ANY (ARRAY[''supervisor''::text,''assistant''::text])');
  statement:=format('ALTER POLICY %I ON public.%I',r.policyname,r.tablename);
  IF newq IS DISTINCT FROM oldq THEN statement:=statement||' USING ('||newq||')'; END IF;
  IF neww IS DISTINCT FROM oldw THEN statement:=statement||' WITH CHECK ('||neww||')'; END IF;
  IF statement<>format('ALTER POLICY %I ON public.%I',r.policyname,r.tablename)
  THEN EXECUTE statement; END IF;
 END LOOP;
END $assistant_policies$;
COMMIT;