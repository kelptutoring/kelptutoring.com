-- Phase 5.H thin slice: authoritative Classroom Home Track progress.
--
-- The Student-facing percentage counts two completion units for every visible
-- active Curriculum Session: one Studied unit and one Practiced unit. Reviewed
-- remains useful history but does not affect Track completion. Resource-level
-- progress never adds extra units, and non-curriculum Schedule items are
-- excluded.

alter function public.get_my_effective_course_schedule(uuid)
  rename to get_my_effective_course_schedule_phase5f5_presentation;

create or replace function public.get_my_effective_course_schedule(
  p_course_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  eligible_session_count integer := 0;
  studied_count integer := 0;
  reviewed_count integer := 0;
  practiced_count integer := 0;
  completed_unit_count integer := 0;
  total_unit_count integer := 0;
  progress_percent integer := 0;
begin
  payload := public.get_my_effective_course_schedule_phase5f5_presentation(
    p_course_id
  );

  select
    count(*)::integer,
    count(*) filter (
      where coalesce(
        nullif(entry.item_payload #>> '{progress,studied,state}', '') = 'marked',
        nullif(entry.item_payload #>> '{progress,studied,marked}', '')::boolean,
        false
      )
    )::integer,
    count(*) filter (
      where coalesce(
        nullif(entry.item_payload #>> '{progress,reviewed,state}', '') = 'marked',
        nullif(entry.item_payload #>> '{progress,reviewed,marked}', '')::boolean,
        false
      )
    )::integer,
    count(*) filter (
      where coalesce(
        nullif(entry.item_payload #>> '{progress,practiced,state}', '') = 'marked',
        nullif(entry.item_payload #>> '{progress,practiced,marked}', '')::boolean,
        false
      )
    )::integer
  into
    eligible_session_count,
    studied_count,
    reviewed_count,
    practiced_count
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    entry(item_payload)
  where entry.item_payload ->> 'kind' = 'curriculum_topic';

  completed_unit_count := studied_count + practiced_count;
  total_unit_count := eligible_session_count * 2;
  progress_percent := case
    when total_unit_count = 0 then 0
    else round((completed_unit_count::numeric * 100) / total_unit_count)::integer
  end;

  payload := jsonb_set(
    payload,
    '{trackProgress}',
    jsonb_build_object(
      'eligibleSessionCount', eligible_session_count,
      'studiedCount', studied_count,
      'reviewedCount', reviewed_count,
      'practicedCount', practiced_count,
      'completedUnitCount', completed_unit_count,
      'totalUnitCount', total_unit_count,
      'percent', progress_percent,
      'reviewedAffectsPercent', false
    ),
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus,trackProgress}',
    to_jsonb('active_phase_5h_home'::text),
    true
  );

  return payload;
end;
$$;

revoke all on function public.get_my_effective_course_schedule_phase5f5_presentation(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated;
grant execute on function public.get_my_effective_course_schedule(uuid)
  to service_role;

comment on function public.get_my_effective_course_schedule_phase5f5_presentation(uuid) is
  'Private retained Phase 5.F.5 presentation projection wrapped by the Classroom Home Track-progress contract.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Returns the effective Course Schedule plus the authoritative Classroom Home Track-progress summary. Studied and Practiced each contribute one unit per active Curriculum Session; Reviewed does not affect the percentage.';
