\set ON_ERROR_STOP on

\if :{?admin_id}
\else
  \echo 'Missing required actor variable: admin_id'
  \quit 3
\endif
\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?student_id}
\else
  \echo 'Missing required actor variable: student_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  cardinality(array[
    :'admin_id'::uuid,
    :'mentor_id'::uuid,
    :'tutor_id'::uuid,
    :'student_id'::uuid,
    :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value
    from unnest(array[
      :'admin_id'::uuid,
      :'mentor_id'::uuid,
      :'tutor_id'::uuid,
      :'student_id'::uuid,
      :'outsider_id'::uuid
    ]) value
  ))
  and exists (
    select 1 from public.user_roles
    where user_id = :'admin_id'::uuid and role_key = 'admin' and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'student_id'::uuid and role_key = 'student' and status = 'active'
  )
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required Classroom management actors are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
set local role authenticated;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select coalesce((
  select item #>> '{classroom,id}'
  from jsonb_array_elements(public.get_my_learning_relationships() -> 'courses') item
  where item #>> '{mentor,id}' = :'mentor_id'
    and item #>> '{tutor,id}' = :'tutor_id'
    and item #>> '{student,id}' = :'student_id'
    and item ->> 'status' in ('active', 'wind_down')
    and item #>> '{classroom,status}' = 'active'
  order by item ->> 'id'
  limit 1
), '') as classroom_id \gset

select (:'classroom_id' <> '') as classroom_ready \gset
\if :classroom_ready
\else
  \echo 'The deterministic active Mentor/Tutor/Student Classroom is missing. Run supabase:provision first.'
  \quit 3
\endif

select set_config('test.classroom_id', :'classroom_id', false);

do $mentor_management_access$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'mentor'
    or (payload #>> '{viewer,canManageClassroom}')::boolean is not true
    or payload #>> '{management,access}' <> 'active'
    or payload #>> '{management,actions,tutorAssignment}' <> 'planned_phase_6'
    or payload #>> '{management,actions,meetingSchedule}' <> 'planned_phase_5'
    or payload #>> '{featureStatus,classroomManagement}' <> 'active_phase_4a'
  then
    raise exception 'The supervising Mentor did not receive the Phase 4.A management projection.';
  end if;
end;
$mentor_management_access$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_management_denial$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if (payload #>> '{viewer,canManageClassroom}')::boolean is not false
    or payload #>> '{management,access}' <> 'unavailable'
  then
    raise exception 'The Tutor received Mentor-only Classroom management access.';
  end if;
end;
$tutor_management_denial$;

select set_config('request.jwt.claim.sub', :'student_id', true);
do $student_management_denial$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if (payload #>> '{viewer,canManageClassroom}')::boolean is not false
    or payload #>> '{management,access}' <> 'unavailable'
  then
    raise exception 'The Student received Mentor-only Classroom management access.';
  end if;
end;
$student_management_denial$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
do $administrator_management_denial$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'administrator'
    or (payload #>> '{viewer,canManageClassroom}')::boolean is not false
    or payload #>> '{management,access}' <> 'unavailable'
  then
    raise exception 'Administrative shell visibility incorrectly became ordinary Mentor management access.';
  end if;
end;
$administrator_management_denial$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_management_denial$
begin
  begin
    perform public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
    raise exception 'Expected outsider Classroom denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom denial was not raised.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$outsider_management_denial$;

rollback;
select 'passed' as classroom_management_surface_characterization;
