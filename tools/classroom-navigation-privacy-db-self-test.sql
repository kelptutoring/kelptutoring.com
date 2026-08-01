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
    :'admin_id'::uuid, :'mentor_id'::uuid, :'tutor_id'::uuid,
    :'student_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'admin_id'::uuid, :'mentor_id'::uuid, :'tutor_id'::uuid,
      :'student_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (select 1 from public.user_roles where user_id = :'admin_id'::uuid and role_key = 'admin' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_id'::uuid and role_key = 'student' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required Classroom navigation actors are missing. Run supabase:provision first.'
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
  \echo 'The deterministic active Classroom for Phase 4.C is missing. Run supabase:provision first.'
  \quit 3
\endif

select set_config('test.classroom_id', :'classroom_id', false);
select set_config('test.mentor_id', :'mentor_id', false);

do $mentor_navigation_projection$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if (payload ->> 'schemaVersion')::integer <> 6
    or payload #>> '{featureStatus,classroomNavigation}' <> 'active_phase_4c'
    or payload #>> '{featureStatus,forum}' <> 'planned_phase_7'
    or payload #>> '{featureStatus,files}' <> 'active_phase_4e'
    or payload #>> '{featureStatus,liveClassTool}' <> 'scheduled_class_required'
    or payload #>> '{mentor,id}' <> current_setting('test.mentor_id')
  then
    raise exception 'The supervising Mentor did not receive the Phase 4.C staff Classroom shell.';
  end if;
end;
$mentor_navigation_projection$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_internal_structure_visibility$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'tutor'
    or payload #>> '{mentor,id}' <> current_setting('test.mentor_id')
  then
    raise exception 'The assigned Tutor could not see their internal supervisory Mentor context.';
  end if;
end;
$tutor_internal_structure_visibility$;

select set_config('request.jwt.claim.sub', :'student_id', true);
do $student_internal_structure_privacy$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'student'
    or payload -> 'mentor' is distinct from 'null'::jsonb
    or payload #>> '{featureStatus,classroomNavigation}' <> 'active_phase_4c'
  then
    raise exception 'The Student projection exposed internal supervision structure or lost navigation status.';
  end if;
end;
$student_internal_structure_privacy$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
do $administrator_internal_structure_visibility$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'administrator'
    or payload #>> '{viewer,accessMode}' <> 'read_only'
    or payload #>> '{mentor,id}' <> current_setting('test.mentor_id')
  then
    raise exception 'Administrative shell access lost its staff context or exceeded read-only access.';
  end if;
end;
$administrator_internal_structure_visibility$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_navigation_denial$
begin
  begin
    perform public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
    raise exception 'Expected outsider Classroom navigation denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom navigation denial was not raised.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$outsider_navigation_denial$;

rollback;
select 'passed' as classroom_navigation_privacy_characterization;
