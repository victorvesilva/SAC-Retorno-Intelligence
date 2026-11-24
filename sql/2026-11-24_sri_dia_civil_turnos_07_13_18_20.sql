-- SAC Retorno Intelligence 2.0 — dia civil e turnos (24/11/2026)
-- Ciclo utilizado pela RLS da importação geral SAC + ATIVO.
-- Preserva todas as apurações e fechamentos históricos.
-- Manhã [07:00,13:00), Tarde [13:00,18:00), Noite [18:00,20:00).
-- Fora de 07h–20h, shift_label=NULL e novas importações são bloqueadas na política.
CREATE OR REPLACE FUNCTION private.sri_current_general_cycle()
RETURNS TABLE(operational_day date, shift_label text)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
 SELECT
   (now() AT TIME ZONE 'America/Fortaleza')::date AS operational_day,
   CASE
     WHEN (now() AT TIME ZONE 'America/Fortaleza')::time >= TIME '07:00'
      AND (now() AT TIME ZONE 'America/Fortaleza')::time < TIME '13:00'
       THEN 'Manhã'
     WHEN (now() AT TIME ZONE 'America/Fortaleza')::time >= TIME '13:00'
      AND (now() AT TIME ZONE 'America/Fortaleza')::time < TIME '18:00'
       THEN 'Tarde'
     WHEN (now() AT TIME ZONE 'America/Fortaleza')::time >= TIME '18:00'
      AND (now() AT TIME ZONE 'America/Fortaleza')::time < TIME '20:00'
       THEN 'Noite'
     ELSE NULL
   END AS shift_label;
$function$;
