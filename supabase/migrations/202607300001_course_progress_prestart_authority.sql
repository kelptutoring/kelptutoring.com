-- Progress actions use authoritative server time unless academic staff
-- explicitly supplies an effective timestamp. A Course may be activated
-- before its first planned Session, so an ordinary current-time action must
-- not be mistaken for a back-report merely because today precedes that first
-- Session. Explicit back-reports remain bounded by the locked Course start.

do $repair_course_progress_prestart_authority$
declare
  function_definition text;
  original_guard text;
  repaired_guard text;
begin
  select pg_get_functiondef(
    'public.record_course_progress_phase5e2(uuid,uuid,uuid,text,uuid,timestamp with time zone,text,text,text,text)'::regprocedure
  )
  into function_definition;

  original_guard :=
    '    if (effective_time at time zone coalesce(schedule_time_zone, ''UTC''))::date'
    || E'\n      < course_record.start_date then';
  repaired_guard :=
    '    if p_effective_at is not null'
    || E'\n      and (effective_time at time zone coalesce(schedule_time_zone, ''UTC''))::date'
    || E'\n        < course_record.start_date then';

  if position(original_guard in function_definition) = 0 then
    raise exception
      'The Course progress pre-start mark guard no longer matches its governed definition.';
  end if;

  execute replace(function_definition, original_guard, repaired_guard);

  select pg_get_functiondef(
    'public.reverse_course_progress_phase5e2(uuid,uuid,uuid,text,uuid,timestamp with time zone,text,text,text)'::regprocedure
  )
  into function_definition;

  original_guard :=
    '    if (effective_time at time zone coalesce(schedule_time_zone, ''UTC''))::date'
    || E'\n      < course_record.start_date then';
  repaired_guard :=
    '    if p_effective_at is not null'
    || E'\n      and (effective_time at time zone coalesce(schedule_time_zone, ''UTC''))::date'
    || E'\n        < course_record.start_date then';

  if position(original_guard in function_definition) = 0 then
    raise exception
      'The Course progress pre-start reversal guard no longer matches its governed definition.';
  end if;

  execute replace(function_definition, original_guard, repaired_guard);
end;
$repair_course_progress_prestart_authority$;

comment on function public.record_course_progress_phase5e2(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) is
  'Phase 5.E.2 append-only mark authority with current-time actions allowed before the first planned Session and explicit back-reports bounded by the Course start.';

comment on function public.reverse_course_progress_phase5e2(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) is
  'Phase 5.E.2 append-only reversal authority with current-time corrections allowed before the first planned Session and explicit back-reports bounded by the Course start.';
