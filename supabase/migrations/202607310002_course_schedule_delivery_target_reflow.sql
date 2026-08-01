-- Phase 5.G.2.4.7.3.1.2: keep Class delivery history separate from
-- curriculum-target completion.
--
-- A delivered Class occurrence is immutable occurrence history and continues
-- to establish that its Track has started. It does not, by itself, mean that
-- the Class's intended curriculum target was completed. When the Tutor pivots
-- to Review, Practice, an Exam, or other work without marking the target
-- Studied, that unfinished future target must remain in the continuing plan
-- and may move to the next selected cadence date. Studied targets and elapsed
-- structural dates remain locked by the existing publication guards.

begin;

create or replace function public.course_schedule_item_has_locked_structure(
  p_course_id uuid,
  p_schedule_item_id uuid
)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    public.course_session_studied_aggregation(
      p_course_id,
      p_schedule_item_id
    ) ->> 'marked'
  )::boolean, false);
$$;

revoke all on function public.course_schedule_item_has_locked_structure(
  uuid, uuid
) from public, anon, authenticated;

comment on function public.course_schedule_item_has_locked_structure(
  uuid, uuid
) is
  'Internal continuation guard. Studied locks exact curriculum-target structure. Delivered Class occurrences remain immutable occurrence history but do not complete or date-lock an unstudied target.';

do $clarify_studied_structure_guard$
declare
  original_definition text;
  patched_definition text;
  prior_message constant text :=
    'A Studied or delivered Schedule item is immutable in continuing Versions. Start a new Schedule instead.';
  next_message constant text :=
    'A Studied Schedule item is immutable in continuing Versions. Start a new Schedule instead.';
begin
  select pg_get_functiondef(
    'public.publish_course_builder_schedule_phase5g2_4_7_2_base(uuid,uuid,jsonb,jsonb,jsonb,text)'::regprocedure
  ) into original_definition;
  if original_definition is null
    or position(prior_message in original_definition) = 0 then
    raise exception
      'The governed Builder no longer matches its Studied structure guard.';
  end if;
  patched_definition := replace(
    original_definition,
    prior_message,
    next_message
  );
  if patched_definition = original_definition
    or position(next_message in patched_definition) = 0 then
    raise exception
      'The governed Builder Studied structure guard could not be clarified.';
  end if;
  execute patched_definition;
end;
$clarify_studied_structure_guard$;

comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes one governed immutable successor. Continuing Versions retain Practiced items and targets linked to delivered occurrences while allowing their unfinished future dates to follow cadence; Studied and elapsed structure stays protected.';

commit;
