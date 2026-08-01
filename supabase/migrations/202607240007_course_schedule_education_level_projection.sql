-- Course Schedule education-level projection.
--
-- The printable Schedule identifies the canonical curriculum degree that owns
-- the Course Subject (for example, High School). This is Course/Schedule
-- context, not a personal credential stored on the Student Profile.

alter function public.get_my_effective_course_schedule(uuid)
  rename to get_my_effective_course_schedule_phase5h_track_progress;

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
  education_level jsonb;
begin
  payload := public.get_my_effective_course_schedule_phase5h_track_progress(
    p_course_id
  );

  select jsonb_build_object(
    'id', degree.id,
    'name', degree.name,
    'slug', degree.slug
  )
  into education_level
  from public.student_courses course
  join public.curriculum_nodes subject
    on subject.id = course.subject_node_id
   and subject.node_type = 'subject'
  join public.curriculum_nodes degree
    on degree.id = subject.parent_id
   and degree.node_type = 'degree'
  where course.id = p_course_id;

  if education_level is null then
    raise exception 'The Course Subject does not have a canonical Education level.';
  end if;

  return jsonb_set(
    payload,
    '{educationLevel}',
    education_level,
    true
  );
end;
$$;

revoke all on function
  public.get_my_effective_course_schedule_phase5h_track_progress(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated;
grant execute on function public.get_my_effective_course_schedule(uuid)
  to service_role;

comment on function
  public.get_my_effective_course_schedule_phase5h_track_progress(uuid) is
  'Private retained Phase 5.H Track-progress projection wrapped by the printable Education-level contract.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Returns the effective Course Schedule with its canonical curriculum Education level, Track progress, member presentation preferences, and role-aware items.';
