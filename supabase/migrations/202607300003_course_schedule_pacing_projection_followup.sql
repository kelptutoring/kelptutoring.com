-- Phase 5.G.2.4.7.2 follow-up: bind the canonical Classroom reader directly
-- to the pacing-aware effective Schedule projection.
--
-- get_my_unified_course_schedule historically called
-- get_my_effective_course_schedule through several retained wrappers. A
-- long-lived PostgREST connection may still hold a cached plan for an older
-- function identity after the effective reader is replaced. Recreating the
-- canonical wrapper makes the active pacing projection explicit and ensures
-- the Classroom immediately receives reflowed effective dates.

alter function public.get_my_unified_course_schedule(uuid)
rename to get_my_unified_course_schedule_phase5g2_4_7_2_base;

create or replace function public.get_my_unified_course_schedule(
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
  effective_payload jsonb;
  pacing_policy jsonb;
begin
  payload :=
    public.get_my_unified_course_schedule_phase5g2_4_7_2_base(
      p_course_id
    );

  if coalesce(
    (payload #>> '{permissions,canReadDetailedAcademicTrack}')::boolean,
    false
  ) then
    effective_payload := public.get_my_effective_course_schedule(p_course_id);
    pacing_policy := coalesce(
      effective_payload -> 'pacingPolicy',
      jsonb_build_object(
        'mode', 'adaptive',
        'eventKind', 'implicit_default',
        'lockWindowHours', 6
      )
    );

    payload := jsonb_set(
      payload,
      '{academicTrack,activeScheduleVersionId}',
      effective_payload -> 'activeScheduleVersionId',
      true
    );
    payload := jsonb_set(
      payload,
      '{academicTrack,versionNumber}',
      effective_payload -> 'versionNumber',
      true
    );
    payload := jsonb_set(
      payload,
      '{academicTrack,items}',
      coalesce(effective_payload -> 'items', '[]'::jsonb),
      true
    );
    payload := jsonb_set(
      payload,
      '{academicTrack,trackProgress}',
      coalesce(effective_payload -> 'trackProgress', '{}'::jsonb),
      true
    );
    payload := jsonb_set(
      payload,
      '{academicTrack,courseProgress}',
      coalesce(effective_payload -> 'courseProgress', '{}'::jsonb),
      true
    );
    payload := jsonb_set(
      payload,
      '{academicTrack,pacingPolicy}',
      pacing_policy,
      true
    );
    payload := jsonb_set(
      payload,
      '{schedule,pacingPolicy}',
      pacing_policy,
      true
    );
  end if;

  payload := jsonb_set(
    payload,
    '{featureStatus,canonicalSchedulePacingProjection}',
    to_jsonb('active_phase_5g2_4_7_2_followup'::text),
    true
  );
  return payload;
exception when invalid_text_representation then
  raise exception 'The canonical Schedule pacing projection is invalid.';
end;
$$;

revoke all on function
  public.get_my_unified_course_schedule_phase5g2_4_7_2_base(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.get_my_unified_course_schedule(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_unified_course_schedule(uuid)
to authenticated, service_role;

comment on function public.get_my_unified_course_schedule(uuid) is
  'Canonical Classroom Schedule bound directly to pacing-aware effective dates, immutable planned dates, and the active Adaptive or Static policy.';
