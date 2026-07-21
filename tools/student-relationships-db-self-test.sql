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
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  cardinality(array[
    :'admin_id'::uuid, :'mentor_id'::uuid, :'tutor_id'::uuid,
    :'student_a_id'::uuid, :'student_b_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'admin_id'::uuid, :'mentor_id'::uuid, :'tutor_id'::uuid,
      :'student_a_id'::uuid, :'student_b_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (select 1 from public.user_roles where user_id = :'admin_id'::uuid and role_key = 'admin' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_a_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_b_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'outsider_id'::uuid and role_key = 'student' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic relationship actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.admin_id', :'admin_id', false);
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.outsider_id', :'outsider_id', false);
set local role authenticated;

select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.grant_teaching_qualification(
  :'mentor_id'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 2.A rollback qualification'
);
select public.grant_teaching_qualification(
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 2.A rollback qualification'
);
select public.assign_tutor_supervisor(
  :'tutor_id'::uuid,
  :'mentor_id'::uuid,
  'Phase 2.A rollback supervision'
);

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select (public.create_student_course_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 2.A DB recurring Mechanics',
  'recurring',
  current_date + 1,
  current_date + 120,
  'phase2a-db-student-a'
) ->> 'id') as course_a_id \gset
select (public.activate_student_course(:'course_a_id'::uuid) -> 'classroom' ->> 'id') as classroom_a_id \gset

select (public.create_student_course_draft(
  :'student_b_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 2.A DB on-demand Mechanics',
  'on_demand',
  current_date + 1,
  current_date + 90,
  'phase2a-db-student-b'
) ->> 'id') as course_b_id \gset
select (public.activate_student_course(:'course_b_id'::uuid) -> 'classroom' ->> 'id') as classroom_b_id \gset
select set_config('test.course_a_id', :'course_a_id', false);
select set_config('test.course_b_id', :'course_b_id', false);
select set_config('test.classroom_a_id', :'classroom_a_id', false);
select set_config('test.classroom_b_id', :'classroom_b_id', false);

do $assert_relationship_shape$
begin
  if current_setting('test.course_a_id')::uuid = current_setting('test.course_b_id')::uuid
    or current_setting('test.classroom_a_id')::uuid = current_setting('test.classroom_b_id')::uuid then
    raise exception 'Each Student must receive a separate Course and Classroom.';
  end if;
  if (select count(*) from public.classroom_memberships
      where classroom_id in (
        current_setting('test.classroom_a_id')::uuid,
        current_setting('test.classroom_b_id')::uuid
      )
        and user_id = auth.uid()
        and membership_role = 'mentor'
        and status = 'active') <> 2 then
    raise exception 'The Mentor should read only their own active Membership in each Classroom.';
  end if;
  if (select count(*) from public.mentor_tutor_assignments
      where tutor_id = current_setting('test.tutor_id')::uuid and status = 'active') <> 1 then
    raise exception 'The Tutor must have exactly one active supervisory Mentor.';
  end if;
end;
$assert_relationship_shape$;

do $reject_unqualified_scope$
begin
  perform public.create_student_course_draft(
    current_setting('test.student_a_id')::uuid,
    current_setting('test.tutor_id')::uuid,
    '10000000-0000-4000-8000-000000000012'::uuid,
    '10000000-0000-4000-8000-000000000031'::uuid,
    'Phase 2.A DB unqualified Algebra',
    'on_demand',
    current_date + 1,
    current_date + 30,
    'phase2a-db-unqualified'
  );
  raise exception 'Expected the unqualified Course scope to be rejected.';
exception
  when others then
    if sqlerrm = 'Expected the unqualified Course scope to be rejected.' then raise; end if;
    if sqlerrm not like '%Tutor is not qualified%' then raise; end if;
end;
$reject_unqualified_scope$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_a_scope$
declare projection jsonb := public.get_my_learning_relationships();
begin
  if not exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_a_id')
    )
    or exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_b_id')
    ) then
    raise exception 'Student A could not see temporary Course A or could see Student B Course B.';
  end if;
  if not exists (
      select 1 from public.student_courses
      where id = current_setting('test.course_a_id')::uuid
    )
    or exists (
      select 1 from public.student_courses
      where id = current_setting('test.course_b_id')::uuid
    )
    or (select count(*) from public.classroom_memberships
        where classroom_id = current_setting('test.classroom_a_id')::uuid
          and user_id = auth.uid()
          and membership_role = 'student') <> 1
    or exists (
      select 1 from public.classroom_memberships
      where classroom_id = current_setting('test.classroom_b_id')::uuid
    ) then
    raise exception 'Student A RLS exposed another Student relationship.';
  end if;
end;
$student_a_scope$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $student_b_scope$
declare projection jsonb := public.get_my_learning_relationships();
begin
  if not exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_b_id')
    )
    or exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_a_id')
    ) then
    raise exception 'Student B could not see temporary Course B or could see Student A Course A.';
  end if;
end;
$student_b_scope$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_scope$
declare projection jsonb := public.get_my_learning_relationships();
begin
  if not exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_a_id')
    )
    or not exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_b_id')
    )
    or jsonb_array_length(projection -> 'supervisions') <> 1 then
    raise exception 'The Tutor must see both temporary assigned Courses and their supervision.';
  end if;
end;
$tutor_scope$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $mentor_scope$
declare projection jsonb := public.get_my_learning_relationships();
begin
  if not exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_a_id')
    )
    or not exists (
      select 1 from jsonb_array_elements(projection -> 'courses') course
      where course ->> 'id' = current_setting('test.course_b_id')
    )
    or jsonb_array_length(projection -> 'supervisions') <> 1 then
    raise exception 'The Mentor must see both temporary supervised Courses.';
  end if;
end;
$mentor_scope$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_scope$
declare projection jsonb := public.get_my_learning_relationships();
begin
  if jsonb_array_length(projection -> 'courses') <> 0
    or jsonb_array_length(projection -> 'supervisions') <> 0
    or (select count(*) from public.student_courses) <> 0
    or (select count(*) from public.classrooms) <> 0
    or (select count(*) from public.classroom_memberships) <> 0 then
    raise exception 'The unlinked outsider received relationship data.';
  end if;
  begin
    perform public.activate_student_course(current_setting('test.course_a_id')::uuid);
    raise exception 'Expected outsider activation to fail.';
  exception
    when others then
      if sqlerrm = 'Expected outsider activation to fail.' then raise; end if;
      if sqlerrm not like '%Only the Course Mentor%' then raise; end if;
  end;
end;
$outsider_scope$;

rollback;
select 'passed' as student_relationships_characterization;
