begin;

-- The Student-only Classroom Calendar is a narrower boundary than the
-- role-aware Classroom Calendar. Recomposition through the role-aware reader
-- must not replace its Student-specific authorization result with the broader
-- Student/Tutor/Mentor denial.
alter function public.get_my_student_classroom_calendar(uuid, date, date)
  rename to get_my_student_classroom_calendar_phase5g2_4_7_3_1_4_base;

revoke all on function
  public.get_my_student_classroom_calendar_phase5g2_4_7_3_1_4_base(
    uuid, date, date
  ) from public, anon, authenticated, service_role;

create or replace function public.get_my_student_classroom_calendar(
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
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication is required to load this Calendar.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required to load its Calendar.';
  end if;

  if not exists (
    select 1
    from public.classroom_memberships membership
    join public.classrooms classroom
      on classroom.id = membership.classroom_id
    join public.student_courses course
      on course.id = classroom.course_id
    where membership.classroom_id = p_classroom_id
      and membership.user_id = caller_id
      and membership.membership_role = 'student'
      and membership.status = 'active'
      and classroom.status = 'active'
      and course.student_id = caller_id
      and course.status in ('active', 'wind_down')
  ) then
    raise exception
      'An active Student Classroom Membership is required to load this Calendar.';
  end if;

  return public.get_my_student_classroom_calendar_phase5g2_4_7_3_1_4_base(
    p_classroom_id,
    p_range_start,
    p_range_end
  );
end;
$$;

revoke all on function
  public.get_my_student_classroom_calendar(uuid, date, date)
  from public, anon;
grant execute on function
  public.get_my_student_classroom_calendar(uuid, date, date)
  to authenticated;

comment on function public.get_my_student_classroom_calendar(
  uuid, date, date
) is
  'Student-only Classroom Calendar boundary. It verifies an active Student membership before delegating to the active-Version parity reader.';

commit;
