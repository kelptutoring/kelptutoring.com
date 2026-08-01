-- Phase 5.G.2.4.7.2 policy simplification:
-- Students cannot mark Studied while an actual timed Class is inside T-6h.
--
-- This replaces the Student-specific "record progress but preserve the
-- prepared target" branch with one deterministic rule. Reviewed and Practiced
-- remain available. Date-only pacing opportunities have no start time and
-- therefore never create this hold. The predicate is intentionally based on
-- an actual timed academic occurrence so a future on-demand booked-Class
-- adapter can enter the same contract without changing Student progress rules.

create or replace function public.course_schedule_student_studied_hold(
  p_course_id uuid,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  hold_payload jsonb;
begin
  select jsonb_build_object(
    'active', true,
    'academicSlotId', candidate.id,
    'stableSlotKey', candidate.stable_slot_key,
    'startsAt', candidate.starts_at,
    'localDate', candidate.local_date,
    'localStartTime', to_char(candidate.local_start_time, 'HH24:MI'),
    'durationMinutes', candidate.duration_minutes,
    'timeZone', candidate.time_zone,
    'lockWindowHours', 6,
    'message',
      'Your next class begins within six hours, so its lesson plan is locked. You can mark this topic as Studied after the class.'
  )
  into hold_payload
  from public.student_courses course
  cross join lateral (
    select
      slot.*,
      (slot.local_date + slot.local_start_time)
        at time zone slot.time_zone as starts_at
    from public.course_schedule_academic_slots slot
    where slot.course_id = course.id
      and slot.version_id = course.active_schedule_version_id
      and slot.local_start_time is not null
      and (slot.local_date + slot.local_start_time)
        at time zone slot.time_zone >= p_as_of
      and (
        (slot.local_date + slot.local_start_time)
          at time zone slot.time_zone
      ) - interval '6 hours' <= p_as_of
    order by
      (slot.local_date + slot.local_start_time)
        at time zone slot.time_zone,
      slot.id
    limit 1
  ) candidate
  where course.id = p_course_id
    and course.status in ('active', 'wind_down');

  return coalesce(
    hold_payload,
    jsonb_build_object(
      'active', false,
      'lockWindowHours', 6
    )
  );
end;
$$;

create or replace function public.block_student_studied_during_class_hold()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  hold_payload jsonb;
begin
  if new.actor_role <> 'student'
    or new.progress_kind <> 'studied'
    or new.event_action <> 'marked' then
    return new;
  end if;

  hold_payload := public.course_schedule_student_studied_hold(
    new.course_id,
    clock_timestamp()
  );
  if coalesce((hold_payload ->> 'active')::boolean, false) then
    raise exception '%', hold_payload ->> 'message';
  end if;

  return new;
end;
$$;

drop trigger if exists block_student_studied_during_class_hold
on public.course_progress_events;
create trigger block_student_studied_during_class_hold
before insert on public.course_progress_events
for each row
execute function public.block_student_studied_during_class_hold();

-- Add the same authoritative hold state to the canonical Classroom read so the
-- UI can disable Studied before a rejected command is attempted.
alter function public.get_my_unified_course_schedule(uuid)
rename to get_my_unified_course_schedule_phase5g2_4_7_2_hold_base;

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
  hold_payload jsonb;
begin
  payload :=
    public.get_my_unified_course_schedule_phase5g2_4_7_2_hold_base(
      p_course_id
    );

  if coalesce(
    (payload #>> '{permissions,canReadDetailedAcademicTrack}')::boolean,
    false
  ) then
    hold_payload :=
      public.course_schedule_student_studied_hold(
        p_course_id,
        clock_timestamp()
      );
    payload := jsonb_set(
      payload,
      '{academicTrack,studentStudiedHold}',
      hold_payload,
      true
    );
  end if;

  payload := jsonb_set(
    payload,
    '{featureStatus,studentStudiedClassHold}',
    to_jsonb('active_phase_5g2_4_7_2'::text),
    true
  );
  return payload;
end;
$$;

revoke all on function
  public.course_schedule_student_studied_hold(uuid, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function
  public.block_student_studied_during_class_hold()
from public, anon, authenticated, service_role;
revoke all on function
  public.get_my_unified_course_schedule_phase5g2_4_7_2_hold_base(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.get_my_unified_course_schedule(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_unified_course_schedule(uuid)
to authenticated, service_role;

comment on function public.course_schedule_student_studied_hold(
  uuid,
  timestamptz
) is
  'Internal authoritative T-6h Student Studied hold for an actual timed Class. Date-only Schedule opportunities never activate it.';

comment on function public.block_student_studied_during_class_hold() is
  'Rejects Student Studied marks while an actual timed Class is within T-6h; Reviewed, Practiced, and staff/post-Class workflows remain independent.';
