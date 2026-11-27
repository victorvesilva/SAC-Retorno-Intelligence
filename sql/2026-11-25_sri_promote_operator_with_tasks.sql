BEGIN;
-- Only relax the active-task guard for promotion to Administrator/Manager.
-- Keep the existing authorization, self-change protection, row lock and audit.
DO $$
DECLARE definition text; previous_guard text:='old_role=''operator'' AND p_new_role<>''operator'' AND EXISTS(';
 new_guard text:='old_role=''operator'' AND p_new_role NOT IN (''operator'',''admin'',''manager'') AND EXISTS(';
BEGIN
 definition:=pg_get_functiondef('public.admin_change_user_role(uuid,text)'::regprocedure);
 IF position(previous_guard IN definition)>0 THEN
  definition:=replace(definition,previous_guard,new_guard);
  EXECUTE definition;
 ELSIF position(new_guard IN definition)=0 THEN
  RAISE EXCEPTION 'Definição de alteração de perfil incompatível. Nenhuma regra foi alterada';
 END IF;
END $$;
COMMIT;
