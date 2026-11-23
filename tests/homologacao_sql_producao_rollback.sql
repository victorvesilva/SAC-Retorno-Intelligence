-- HOMOLOGAÇÃO SQL REVERSÍVEL - somente identidades e registros fictícios.
-- Uso: executado dentro de BEGIN/ROLLBACK, nunca executar COMMIT.
-- Não prova login real via SDK/GoTrue nem integração SIGO.
BEGIN;
SET LOCAL statement_timeout='100s';
SET LOCAL lock_timeout='3s';

INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,created_at,updated_at,is_anonymous) VALUES ('a1100000-0000-4000-8000-000000000111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sri-hml-supa@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,now(),now(),false),
('a1100000-0000-4000-8000-000000000112','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sri-hml-supb@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,now(),now(),false),
('a1100000-0000-4000-8000-000000000121','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sri-hml-opa1@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,now(),now(),false),
('a1100000-0000-4000-8000-000000000122','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sri-hml-opa2@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,now(),now(),false),
('a1100000-0000-4000-8000-000000000123','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sri-hml-opb1@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,now(),now(),false);
UPDATE public.profiles SET role='supervisor',full_name='SRI HOMOLOG SUP A' WHERE id='a1100000-0000-4000-8000-000000000111';
UPDATE public.profiles SET role='supervisor',full_name='SRI HOMOLOG SUP B' WHERE id='a1100000-0000-4000-8000-000000000112';
UPDATE public.profiles SET full_name='SRI HOMOLOG OP A1' WHERE id='a1100000-0000-4000-8000-000000000121';
UPDATE public.profiles SET full_name='SRI HOMOLOG OP A2' WHERE id='a1100000-0000-4000-8000-000000000122';
UPDATE public.profiles SET full_name='SRI HOMOLOG OP B1' WHERE id='a1100000-0000-4000-8000-000000000123';
INSERT INTO public.operations(name) VALUES('SRI HOMOLOGACAO SQL ROLLBACK 2099');
INSERT INTO public.teams(operation_id,name) SELECT id,'SRI HML EQUIPE A' FROM public.operations WHERE name='SRI HOMOLOGACAO SQL ROLLBACK 2099';
INSERT INTO public.teams(operation_id,name) SELECT id,'SRI HML EQUIPE B' FROM public.operations WHERE name='SRI HOMOLOGACAO SQL ROLLBACK 2099';
SELECT set_config('hml.team_a',(SELECT id::text FROM public.teams WHERE name='SRI HML EQUIPE A'),true),
set_config('hml.team_b',(SELECT id::text FROM public.teams WHERE name='SRI HML EQUIPE B'),true),
set_config('hml.manager',(SELECT id::text FROM public.profiles WHERE role='admin' LIMIT 1),true);
INSERT INTO public.team_memberships(user_id,team_id) VALUES
('a1100000-0000-4000-8000-000000000111',current_setting('hml.team_a')::uuid),('a1100000-0000-4000-8000-000000000112',current_setting('hml.team_b')::uuid),
('a1100000-0000-4000-8000-000000000121',current_setting('hml.team_a')::uuid),('a1100000-0000-4000-8000-000000000122',current_setting('hml.team_a')::uuid),
('a1100000-0000-4000-8000-000000000123',current_setting('hml.team_b')::uuid);
INSERT INTO public.operator_links(team_id,user_id,operator_name,linked_by) VALUES
(current_setting('hml.team_a')::uuid,'a1100000-0000-4000-8000-000000000121','SRI HML OP A1',current_setting('hml.manager')::uuid),
(current_setting('hml.team_a')::uuid,'a1100000-0000-4000-8000-000000000122','SRI HML OP A2',current_setting('hml.manager')::uuid),
(current_setting('hml.team_b')::uuid,'a1100000-0000-4000-8000-000000000123','SRI HML OP B1',current_setting('hml.manager')::uuid);
SELECT set_config('request.jwt.claim.sub',current_setting('hml.manager'),true);
INSERT INTO public.daily_result_snapshots
(team_id,operational_day,shift_label,reference_serial,imported_by,payload_sha256,payload_gzip,protocol_count,indicators,warnings)
VALUES
(current_setting('hml.team_a')::uuid,DATE '2099-01-12','SRI HML TURNO A',1,current_setting('hml.manager')::uuid,repeat('a',64),repeat('HML FICTICIO ',5),3,'{"protocolos_monitorados":3}'::jsonb,'{}'::jsonb),
(current_setting('hml.team_b')::uuid,DATE '2099-01-12','SRI HML TURNO B',1,current_setting('hml.manager')::uuid,repeat('b',64),repeat('HML FICTICIO ',5),1,'{"protocolos_monitorados":1}'::jsonb,'{}'::jsonb);
SELECT set_config('hml.snap_a',(SELECT id::text FROM public.daily_result_snapshots WHERE shift_label='SRI HML TURNO A'),true),
set_config('hml.snap_b',(SELECT id::text FROM public.daily_result_snapshots WHERE shift_label='SRI HML TURNO B'),true);
INSERT INTO public.daily_result_distributions(snapshot_id,state,revision,updated_by)
VALUES
(current_setting('hml.snap_a')::uuid,jsonb_build_object(
 'assignments',jsonb_build_object('HML-TA1',jsonb_build_object('opId','acct:a1100000-0000-4000-8000-000000000121'),'HML-TA2',jsonb_build_object('opId','acct:a1100000-0000-4000-8000-000000000122'),'HML-TA3',jsonb_build_object('opId','acct:a1100000-0000-4000-8000-000000000121')),
 'roster',jsonb_build_array(jsonb_build_object('id','acct:a1100000-0000-4000-8000-000000000121','name','SRI HML OP A1'),jsonb_build_object('id','acct:a1100000-0000-4000-8000-000000000122','name','SRI HML OP A2')),
 'archivedRoster','[]'::jsonb,'criticities','{}'::jsonb,'statuses','{}'::jsonb),1,current_setting('hml.manager')::uuid),
(current_setting('hml.snap_b')::uuid,jsonb_build_object(
 'assignments',jsonb_build_object('HML-TB1',jsonb_build_object('opId','acct:a1100000-0000-4000-8000-000000000123')),
 'roster',jsonb_build_array(jsonb_build_object('id','acct:a1100000-0000-4000-8000-000000000123','name','SRI HML OP B1')),
 'archivedRoster','[]'::jsonb,'criticities','{}'::jsonb,'statuses','{}'::jsonb),1,current_setting('hml.manager')::uuid);

SET LOCAL ROLE authenticated;
DO $hml$
DECLARE r jsonb; n int; tid uuid; denied text; cid uuid; revision bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('hml.manager'),true);
 SELECT public.publish_daily_operator_tasks(current_setting('hml.snap_a')::uuid,1,'{}'::jsonb) INTO r;
 IF (r->>'published')::int<>3 OR (r->>'unlinked')::int<>0 THEN RAISE EXCEPTION 'Falha ao publicar A: %',r;END IF;
 SELECT public.publish_daily_operator_tasks(current_setting('hml.snap_b')::uuid,1,'{}'::jsonb) INTO r;
 IF (r->>'published')::int<>1 OR (r->>'unlinked')::int<>0 THEN RAISE EXCEPTION 'Falha ao publicar B: %',r;END IF;
 SELECT count(*) INTO n FROM public.daily_operator_tasks;
 IF n<>4 THEN RAISE EXCEPTION 'Carteiras publicadas incorretamente: %',n;END IF;
 PERFORM set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000112',true);
 SELECT count(*) INTO n FROM public.daily_operator_tasks WHERE team_id=current_setting('hml.team_a')::uuid;
 IF n<>0 THEN RAISE EXCEPTION 'Supervisor B visualizou equipe A';END IF;
 SELECT count(*) INTO n FROM public.daily_operator_tasks;
 IF n<>1 THEN RAISE EXCEPTION 'Supervisor B deveria ver uma tarefa: %',n;END IF;
 denied:=NULL;
 BEGIN
  PERFORM public.publish_daily_operator_tasks(current_setting('hml.snap_a')::uuid,1,'{}'::jsonb);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied=MESSAGE_TEXT;END;
 IF denied NOT LIKE '%Somente gestão/supervisão%' THEN RAISE EXCEPTION 'SUP B conseguiu publicar equipe A: %',denied;END IF;
 PERFORM set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000121',true);
 SELECT count(*) INTO n FROM public.daily_operator_tasks;
 IF n<>2 THEN RAISE EXCEPTION 'OP A1 deveria ver 2 tarefas: %',n;END IF;
 SELECT id INTO tid FROM public.daily_operator_tasks WHERE protocol_number='HML-TA1';
 PERFORM public.record_daily_operator_treatment(tid,'in_progress','Tratativa sintética, sem protocolo real');
 SELECT count(*) INTO n FROM public.daily_operator_treatments WHERE task_id=tid;
 IF n<>1 THEN RAISE EXCEPTION 'Tratativa não persistiu dentro do teste';END IF;
 PERFORM set_config('hml.task_a1',tid::text,true);
 denied:=NULL;
 BEGIN
  SELECT id INTO tid FROM public.daily_operator_tasks WHERE protocol_number='HML-TA2';
  -- Se o RLS ocultou a tarefa, usar UUID com SELECT como gestor logo após;
  PERFORM set_config('request.jwt.claim.sub',current_setting('hml.manager'),true);
  SELECT id INTO tid FROM public.daily_operator_tasks WHERE protocol_number='HML-TA2';
  PERFORM set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000121',true);
  PERFORM public.record_daily_operator_treatment(tid,'in_progress','Tentativa cruzada sintética');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied=MESSAGE_TEXT;END;
 IF denied NOT LIKE '%Acesso negado%' THEN RAISE EXCEPTION 'OP A1 alterou carteira A2: %',denied;END IF;
 PERFORM set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000122',true);
 SELECT count(*) INTO n FROM public.daily_operator_tasks;
 IF n<>1 THEN RAISE EXCEPTION 'OP A2 deveria ver 1 tarefa: %',n;END IF;
 PERFORM set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000123',true);
 SELECT count(*) INTO n FROM public.daily_operator_tasks;
 IF n<>1 THEN RAISE EXCEPTION 'OP B1 deveria ver 1 tarefa: %',n;END IF;
 PERFORM set_config('request.jwt.claim.sub',current_setting('hml.manager'),true);
 denied:=NULL;
 BEGIN
  PERFORM public.sri_close_result_shift(current_setting('hml.snap_a')::uuid,99,true);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied=MESSAGE_TEXT;END;
 IF denied NOT LIKE 'Distribuição inexistente ou mudou%' THEN RAISE EXCEPTION 'Revisão indevida aprovada: %',denied;END IF;
 denied:=NULL;
 BEGIN
  PERFORM public.sri_close_result_day(DATE '2099-01-12',NULL);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied=MESSAGE_TEXT;END;
 IF denied NOT LIKE 'Fechamento com pendências exige justificativa%' THEN RAISE EXCEPTION 'Fechamento sem justificativa aprovado: %',denied;END IF;
 -- Simular atribuicao sem vinculo confirmado, para garantir bloqueio de fechamento parcial.
 UPDATE public.daily_result_distributions
 SET state=jsonb_set(state,'{assignments,HML-TA4}',jsonb_build_object('opId','acct:a1100000-0000-4000-8000-000000000999'),true),
     revision=2,updated_by=current_setting('hml.manager')::uuid
 WHERE snapshot_id=current_setting('hml.snap_a')::uuid AND revision=1;
 SELECT public.publish_daily_operator_tasks(current_setting('hml.snap_a')::uuid,2,'{}'::jsonb) INTO r;
 IF (r->>'published')::int<>3 OR (r->>'unlinked')::int<>1 THEN RAISE EXCEPTION 'Publicação parcial não detectada: %',r;END IF;
 denied:=NULL;
 BEGIN
  PERFORM public.sri_close_result_shift(current_setting('hml.snap_a')::uuid,2,true);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied=MESSAGE_TEXT;END;
 IF denied NOT LIKE 'Há atribuições salvas sem publicação%' THEN RAISE EXCEPTION 'Fechamento parcial não bloqueado: %',denied;END IF;
 UPDATE public.daily_result_distributions
 SET state=state#-'{assignments,HML-TA4}',revision=3,updated_by=current_setting('hml.manager')::uuid
 WHERE snapshot_id=current_setting('hml.snap_a')::uuid AND revision=2;
 SELECT public.publish_daily_operator_tasks(current_setting('hml.snap_a')::uuid,3,'{}'::jsonb) INTO r;
 IF (r->>'published')::int<>3 OR (r->>'unlinked')::int<>0 THEN RAISE EXCEPTION 'Republicação completa falhou: %',r;END IF;
 SELECT public.sri_close_result_shift(current_setting('hml.snap_a')::uuid,3,true) INTO r;
 IF r->>'status'<>'closed' THEN RAISE EXCEPTION 'Turno A não fechou: %',r;END IF;
 cid=(r->>'id')::uuid;
 SELECT public.sri_close_result_shift(current_setting('hml.snap_b')::uuid,1,true) INTO r;
 IF r->>'status'<>'closed' THEN RAISE EXCEPTION 'Turno B não fechou: %',r;END IF;
 denied:=NULL;
 BEGIN
  PERFORM public.publish_daily_operator_tasks(current_setting('hml.snap_a')::uuid,3,'{}'::jsonb);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied=MESSAGE_TEXT;END;
 IF denied NOT LIKE 'Turno ou dia encerrado%' THEN RAISE EXCEPTION 'Publicação após fechamento permitida: %',denied;END IF;
 SELECT public.sri_close_result_day(DATE '2099-01-12',NULL) INTO r;
 IF r->>'status'<>'closed' THEN RAISE EXCEPTION 'Dia não fechado: %',r;END IF;
 denied:=NULL;
 BEGIN
  PERFORM public.sri_reopen_result_shift(cid,'Justificativa extensa de homologacao');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied=MESSAGE_TEXT;END;
 IF denied NOT LIKE 'Reabra o fechamento geral%' THEN RAISE EXCEPTION 'Reabriu turno sem reabrir dia: %',denied;END IF;
 PERFORM public.sri_reopen_result_day(DATE '2099-01-12','Justificativa extensa de homologacao');
 PERFORM public.sri_reopen_result_shift(cid,'Justificativa extensa de homologacao');
 SELECT public.sri_close_result_day(DATE '2099-01-12','Há um turno reaberto no teste sintético') INTO r;
 IF r->>'status'<>'closed_with_pending' THEN RAISE EXCEPTION 'Fechamento de dia com pendência falhou: %',r;END IF;
 PERFORM set_config('hml.tests','5 identidades;2 equipes;4 carteiras;RLS isolado;tratativa;publicação parcial;fechamento/reabertura;auditoria PASS',true);
END $hml$;

-- Segurança adicional: operador afastado nao deve ver nem alterar sua antiga carteira.
RESET ROLE;
UPDATE public.profiles SET operational_status='Afastamento' WHERE id='a1100000-0000-4000-8000-000000000121';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000121',true);
DO $inactive$
DECLARE n int; den text;
BEGIN
 SELECT count(*) INTO n FROM public.daily_operator_tasks WHERE operator_user_id='a1100000-0000-4000-8000-000000000121';
 IF n<>0 THEN RAISE EXCEPTION 'Operador afastado continua lendo % tarefas',n;END IF;
 den:=NULL;
 BEGIN
  PERFORM public.record_daily_operator_treatment(current_setting('hml.task_a1')::uuid,'note','Tratativa deveria ser proibida');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS den=MESSAGE_TEXT;END;
 IF den NOT LIKE 'Acesso negado%' THEN RAISE EXCEPTION 'Operador afastado ainda modifica tarefa: %',den;END IF;
END $inactive$;

SELECT current_setting('hml.tests') AS resultado,
       'Operador afastado bloqueado; transação integralmente revertida' AS situacao;
ROLLBACK;
