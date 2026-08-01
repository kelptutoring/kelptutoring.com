-- Phase 5.H lesson-request entry foundation:
-- publish one stable draft contract on both Calendar scopes without creating a
-- request, reserving Tutor availability, charging credits, or creating a Class.

create or replace function public.calendar_lesson_request_draft_contract(
  p_calendar_payload jsonb,
  p_scope text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  normalized_scope text := lower(btrim(coalesce(p_scope, '')));
  contexts jsonb := coalesce(
    p_calendar_payload #> '{availabilityOverlay,eligibleContexts}',
    '[]'::jsonb
  );
  membership_role text := lower(coalesce(
    p_calendar_payload #>> '{viewer,membershipRole}',
    'student'
  ));
  can_start boolean;
begin
  if normalized_scope not in ('dashboard', 'classroom') then
    raise exception 'Lesson Request draft scope must be Dashboard or Classroom.';
  end if;

  can_start :=
    jsonb_array_length(contexts) > 0
    and (
      normalized_scope = 'dashboard'
      or (
        membership_role = 'student'
        and coalesce(
          (p_calendar_payload #>> '{viewer,canRequestLesson}')::boolean,
          false
        )
      )
    );

  return jsonb_build_object(
    'schemaVersion', 1,
    'status', 'local_draft_active_phase_5h',
    'scope', normalized_scope,
    'canStart', can_start,
    'tutorSelection', case
      when normalized_scope = 'classroom' then 'assigned_classroom_tutor_locked'
      else 'assigned_active_tutors'
    end,
    'contextSelection', case
      when normalized_scope = 'classroom' then 'current_course_locked'
      else 'active_course_contexts'
    end,
    'purposeOptions', jsonb_build_array(
      jsonb_build_object('key', 'regular', 'status', 'draftable'),
      jsonb_build_object('key', 'extra', 'status', 'draftable'),
      jsonb_build_object('key', 'standalone', 'status', 'contract_only_phase_10')
    ),
    'durationMinutes', jsonb_build_array(30, 60, 90),
    'constraints', jsonb_build_object(
      'minimumLeadMinutes', 1440,
      'maximumAdvanceDays', 14,
      'pendingRequestExpiresMinutesBeforeClass', 720
    ),
    'requiredFields', jsonb_build_array(
      'tutorId',
      'courseId',
      'purpose',
      'proposedDate',
      'proposedTime',
      'durationMinutes'
    ),
    'draftStorage', 'browser_session_only',
    'submissionStatus', 'pending_phase_10',
    'availabilityStatus', 'pending_phase_10',
    'creditValidationStatus', 'pending_phase_11',
    'createsReservation', false,
    'createsLessonRequest', false,
    'createsClass', false
  );
end;
$$;

revoke all on function public.calendar_lesson_request_draft_contract(jsonb, text)
  from public, anon, authenticated, service_role;

alter function public.get_my_student_calendar(date, date)
  rename to get_my_student_calendar_phase5h_lesson_request_base;

revoke all on function
  public.get_my_student_calendar_phase5h_lesson_request_base(date, date)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_student_calendar(
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  payload :=
    public.get_my_student_calendar_phase5h_lesson_request_base(
      p_range_start,
      p_range_end
    );
  return jsonb_set(
    payload,
    '{lessonRequestFoundation}',
    public.calendar_lesson_request_draft_contract(payload, 'dashboard'),
    true
  );
end;
$$;

revoke all on function public.get_my_student_calendar(date, date)
  from public, anon;
grant execute on function public.get_my_student_calendar(date, date)
  to authenticated;

alter function public.get_my_classroom_calendar(uuid, date, date)
  rename to get_my_classroom_calendar_phase5h_lesson_request_base;

revoke all on function
  public.get_my_classroom_calendar_phase5h_lesson_request_base(uuid, date, date)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_classroom_calendar(
  p_classroom_id uuid,
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  payload :=
    public.get_my_classroom_calendar_phase5h_lesson_request_base(
      p_classroom_id,
      p_range_start,
      p_range_end
    );
  return jsonb_set(
    payload,
    '{lessonRequestFoundation}',
    public.calendar_lesson_request_draft_contract(payload, 'classroom'),
    true
  );
end;
$$;

revoke all on function public.get_my_classroom_calendar(uuid, date, date)
  from public, anon;
grant execute on function public.get_my_classroom_calendar(uuid, date, date)
  to authenticated;

comment on function public.get_my_student_calendar(date, date) is
  'Canonical Student Calendar plus a non-reserving local Lesson Request draft contract. Phase 10 owns authoritative submission and availability.';

comment on function public.get_my_classroom_calendar(uuid, date, date) is
  'Role-aware Course-scoped Classroom Calendar plus a Student-only, assigned-Tutor Lesson Request draft contract. Phase 10 owns authoritative submission.';
