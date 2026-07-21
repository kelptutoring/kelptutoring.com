\set ON_ERROR_STOP on

\if :{?student_a_id}
\else
  \echo 'Missing required actor variable: student_a_id'
  \quit 3
\endif
\if :{?student_b_id}
\else
  \echo 'Missing required actor variable: student_b_id'
  \quit 3
\endif
\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  cardinality(array[
    :'student_a_id'::uuid,
    :'student_b_id'::uuid,
    :'tutor_id'::uuid,
    :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value
    from unnest(array[
      :'student_a_id'::uuid,
      :'student_b_id'::uuid,
      :'tutor_id'::uuid,
      :'outsider_id'::uuid
    ]) value
  ))
  and exists (
    select 1 from public.user_roles
    where user_id = :'student_a_id'::uuid and role_key = 'student' and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'student_b_id'::uuid and role_key = 'student' and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'outsider_id'::uuid and role_key = 'student' and status = 'active'
  )
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic Student Classroom lifecycle actors are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.outsider_id', :'outsider_id', false);
set local role authenticated;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select (public.get_my_student_classrooms() #>> '{collections,active,0,classroom,id}') as classroom_a_id \gset
select set_config('test.classroom_a_id', :'classroom_a_id', false);
select (public.get_my_student_classrooms() #>> '{collections,active,0,courseId}') as course_a_id \gset
select set_config('test.course_a_id', :'course_a_id', false);

do $active_projection_and_archive_denial$
declare
  payload jsonb := public.get_my_student_classrooms();
  space jsonb := public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
begin
  if payload #>> '{featureStatus,classroomCollections}' <> 'active_phase_3c'
    or payload #>> '{collections,active,0,classroom,accessMode}' <> 'participating'
    or payload #>> '{collections,active,0,card,presentationState}' not in ('active', 'ending_soon')
    or space #>> '{viewer,accessMode}' <> 'participating'
    or (space #>> '{viewer,canParticipate}')::boolean is not true
  then
    raise exception 'The active Student Classroom projection is incomplete.';
  end if;

  begin
    perform public.archive_my_student_classroom(
      current_setting('test.classroom_a_id')::uuid
    );
    raise exception 'Expected active Classroom archive denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected active Classroom archive denial was not raised.' then raise; end if;
    if sqlerrm not like '%Active and wind-down Classrooms%' then raise; end if;
  end;
end;
$active_projection_and_archive_denial$;

reset role;
update public.student_courses
set status = 'wind_down'
where id = current_setting('test.course_a_id')::uuid;
set local role authenticated;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $wind_down_projection_and_archive_denial$
declare
  payload jsonb := public.get_my_student_classrooms();
  dashboard jsonb := public.get_my_student_dashboard();
begin
  if payload #>> '{collections,active,0,courseStatus}' <> 'wind_down'
    or payload #>> '{collections,active,0,card,presentationState}' <> 'ending_soon'
    or dashboard #>> '{classrooms,0,courseStatus}' <> 'wind_down'
  then
    raise exception 'The wind-down Classroom did not retain its mandatory Ending soon presentation.';
  end if;

  begin
    perform public.archive_my_student_classroom(
      current_setting('test.classroom_a_id')::uuid
    );
    raise exception 'Expected wind-down Classroom archive denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected wind-down Classroom archive denial was not raised.' then raise; end if;
    if sqlerrm not like '%Active and wind-down Classrooms%' then raise; end if;
  end;
end;
$wind_down_projection_and_archive_denial$;

reset role;
update public.student_courses
set status = 'completed', ended_at = clock_timestamp()
where id = current_setting('test.course_a_id')::uuid;
update public.classrooms
set status = 'inactive', inactivated_at = clock_timestamp()
where id = current_setting('test.classroom_a_id')::uuid;
update public.classroom_memberships
set status = 'ended', ended_at = clock_timestamp()
where classroom_id = current_setting('test.classroom_a_id')::uuid;
set local role authenticated;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $former_projection$
declare
  payload jsonb := public.get_my_student_classrooms();
  space jsonb := public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
begin
  if jsonb_array_length(payload #> '{collections,active}') <> 0
    or payload #>> '{collections,former,0,classroom,id}' <> current_setting('test.classroom_a_id')
    or payload #>> '{collections,former,0,classroom,accessMode}' <> 'read_only'
    or payload #>> '{collections,former,0,card,presentationState}' <> 'former'
    or space #>> '{viewer,accessMode}' <> 'read_only'
    or (space #>> '{viewer,canParticipate}')::boolean is not false
    or (space #>> '{classroom,readOnly}')::boolean is not true
    or space #>> '{featureStatus,liveClassTool}' <> 'unavailable_read_only'
  then
    raise exception 'The inactive Student Classroom did not become retained read-only history.';
  end if;
end;
$former_projection$;

select public.archive_my_student_classroom(:'classroom_a_id'::uuid);
select public.archive_my_student_classroom(:'classroom_a_id'::uuid);

do $personal_archive_projection$
declare
  payload jsonb := public.get_my_student_classrooms();
  space jsonb := public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
begin
  if jsonb_array_length(payload #> '{collections,former}') <> 0
    or payload #>> '{collections,archived,0,classroom,id}' <> current_setting('test.classroom_a_id')
    or payload #>> '{collections,archived,0,card,presentationState}' <> 'archived'
    or (space #>> '{viewer,personalArchived}')::boolean is not true
    or (select status from public.classrooms
        where id = current_setting('test.classroom_a_id')::uuid) <> 'inactive'
    or (select count(*) from public.learning_relationship_events
        where classroom_id = current_setting('test.classroom_a_id')::uuid
          and event_type = 'classroom_personally_archived') <> 1
  then
    raise exception 'Personal archive did not move only the Student projection.';
  end if;
end;
$personal_archive_projection$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $member_specific_archive_independence$
declare space jsonb := public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
begin
  if space #>> '{viewer,membershipRole}' <> 'tutor'
    or space #>> '{viewer,accessMode}' <> 'read_only'
    or (space #>> '{viewer,personalArchived}')::boolean is not false
  then
    raise exception 'The Student personal archive changed another retained member projection.';
  end if;
end;
$member_specific_archive_independence$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.restore_my_student_classroom(:'classroom_a_id'::uuid);
select public.restore_my_student_classroom(:'classroom_a_id'::uuid);

do $personal_restore_projection$
declare payload jsonb := public.get_my_student_classrooms();
begin
  if payload #>> '{collections,former,0,classroom,id}' <> current_setting('test.classroom_a_id')
    or jsonb_array_length(payload #> '{collections,archived}') <> 0
    or (select count(*) from public.learning_relationship_events
        where classroom_id = current_setting('test.classroom_a_id')::uuid
          and event_type = 'classroom_personally_restored') <> 1
  then
    raise exception 'Personal restore was not idempotent.';
  end if;
end;
$personal_restore_projection$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $former_tutor_shell$
declare space jsonb := public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
begin
  if space #>> '{viewer,membershipRole}' <> 'tutor'
    or space #>> '{viewer,membershipStatus}' <> 'ended'
    or space #>> '{viewer,accessMode}' <> 'read_only'
  then
    raise exception 'The former Tutor lost their retained read-only Classroom shell.';
  end if;
end;
$former_tutor_shell$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $other_student_denial$
declare
  payload jsonb := public.get_my_student_classrooms();
  dashboard jsonb := public.get_my_student_dashboard();
begin
  if jsonb_array_length(payload #> '{collections,active}') <> 1
    or payload #>> '{collections,active,0,classroom,id}' = current_setting('test.classroom_a_id')
    or jsonb_array_length(dashboard #> '{classrooms}') <> 1
    or dashboard #>> '{classrooms,0,classroom,id}' = current_setting('test.classroom_a_id')
  then
    raise exception 'Student B did not retain exactly their own active Classroom.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      (payload #> '{collections,active}')
      || (payload #> '{collections,former}')
      || (payload #> '{collections,archived}')
    ) item
    where item #>> '{classroom,id}' = current_setting('test.classroom_a_id')
  ) then
    raise exception 'Another Student received a Classroom A collection projection.';
  end if;

  begin
    perform public.archive_my_student_classroom(current_setting('test.classroom_a_id')::uuid);
    raise exception 'Expected cross-Student archive denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected cross-Student archive denial was not raised.' then raise; end if;
    if sqlerrm not like '%authorized Student Classroom Membership%' then raise; end if;
  end;

  begin
    perform public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
    raise exception 'Expected cross-Student Classroom-space denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected cross-Student Classroom-space denial was not raised.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$other_student_denial$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_denial$
declare payload jsonb := public.get_my_student_classrooms();
begin
  if jsonb_array_length(payload #> '{collections,active}') <> 0
    or jsonb_array_length(payload #> '{collections,former}') <> 0
    or jsonb_array_length(payload #> '{collections,archived}') <> 0
  then
    raise exception 'The unlinked outsider received a Student Classroom collection.';
  end if;

  begin
    perform public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
    raise exception 'Expected outsider Classroom-space denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom-space denial was not raised.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;

  begin
    perform public.restore_my_student_classroom(current_setting('test.classroom_a_id')::uuid);
    raise exception 'Expected outsider restore denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider restore denial was not raised.' then raise; end if;
    if sqlerrm not like '%inactive retained Student Classroom%' then raise; end if;
  end;
end;
$outsider_denial$;

rollback;
select 'passed' as student_classroom_lifecycle_projection_characterization;
