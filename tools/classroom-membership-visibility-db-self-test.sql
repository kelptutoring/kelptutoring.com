\set ON_ERROR_STOP on

\if :{?admin_id}
\else
  \echo 'Missing required actor variable: admin_id'
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
    :'admin_id'::uuid,
    :'student_a_id'::uuid,
    :'student_b_id'::uuid,
    :'tutor_id'::uuid,
    :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value
    from unnest(array[
      :'admin_id'::uuid,
      :'student_a_id'::uuid,
      :'student_b_id'::uuid,
      :'tutor_id'::uuid,
      :'outsider_id'::uuid
    ]) value
  ))
  and exists (
    select 1 from public.user_roles
    where user_id = :'admin_id'::uuid and role_key = 'admin' and status = 'active'
  )
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
  \echo 'Required synthetic Classroom visibility actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.admin_id', :'admin_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.outsider_id', :'outsider_id', false);
set local role authenticated;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select (public.get_my_student_dashboard() -> 'classrooms' -> 0 -> 'classroom' ->> 'id') as classroom_a_id \gset
select set_config('test.classroom_a_id', :'classroom_a_id', false);
select (
  select classroom.course_id
  from public.classrooms classroom
  where classroom.id = :'classroom_a_id'::uuid
) as course_a_id \gset
select set_config('test.course_a_id', :'course_a_id', false);

select set_config('request.jwt.claim.sub', :'student_b_id', true);
select (public.get_my_student_dashboard() -> 'classrooms' -> 0 -> 'classroom' ->> 'id') as classroom_b_id \gset
select set_config('test.classroom_b_id', :'classroom_b_id', false);

reset role;
do $active_archive_invariant$
begin
  begin
    insert into public.classroom_member_preferences (
      user_id,
      classroom_id,
      archived_at
    ) values (
      current_setting('test.student_b_id')::uuid,
      current_setting('test.classroom_b_id')::uuid,
      clock_timestamp()
    );
    raise exception 'Expected active Classroom personal-archive rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected active Classroom personal-archive rejection was not raised.' then raise; end if;
    if sqlerrm not like '%inactive retained Classroom%' then raise; end if;
  end;
end;
$active_archive_invariant$;

update public.student_courses
set status = 'completed', ended_at = clock_timestamp()
where id = current_setting('test.course_a_id')::uuid;

update public.classrooms
set status = 'inactive', inactivated_at = clock_timestamp()
where id = current_setting('test.classroom_a_id')::uuid;

update public.classroom_memberships
set status = 'ended', ended_at = clock_timestamp()
where classroom_id = current_setting('test.classroom_a_id')::uuid;

insert into public.classroom_member_preferences (
  user_id,
  classroom_id,
  archived_at
) values (
  current_setting('test.student_a_id')::uuid,
  current_setting('test.classroom_a_id')::uuid,
  clock_timestamp()
);

-- A second Tutor tenure must coexist with the ended historical tenure while
-- the partial unique index still prevents two active tenures.
update public.classroom_memberships
set status = 'ended', ended_at = clock_timestamp()
where classroom_id = current_setting('test.classroom_b_id')::uuid
  and user_id = current_setting('test.tutor_id')::uuid
  and membership_role = 'tutor'
  and status = 'active';

insert into public.classroom_memberships (
  classroom_id,
  user_id,
  membership_role,
  status
) values (
  current_setting('test.classroom_b_id')::uuid,
  current_setting('test.tutor_id')::uuid,
  'tutor',
  'active'
);

do $one_active_tenure_invariant$
begin
  begin
    insert into public.classroom_memberships (
      classroom_id,
      user_id,
      membership_role,
      status
    ) values (
      current_setting('test.classroom_b_id')::uuid,
      current_setting('test.tutor_id')::uuid,
      'tutor',
      'active'
    );
    raise exception 'Expected duplicate active Membership rejection was not raised.';
  exception when unique_violation then
    null;
  end;
end;
$one_active_tenure_invariant$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);

do $retained_student_access$
begin
  if not public.current_user_can_read_classroom(
      current_setting('test.classroom_a_id')::uuid
    )
    or public.current_user_can_participate_in_classroom(
      current_setting('test.classroom_a_id')::uuid
    )
    or not public.current_user_can_read_student_course(
      current_setting('test.course_a_id')::uuid
    )
    or (select count(*) from public.classroom_member_preferences
        where classroom_id = current_setting('test.classroom_a_id')::uuid
          and archived_at is not null) <> 1
    or (select count(*) from public.classroom_memberships
        where classroom_id = current_setting('test.classroom_a_id')::uuid) <> 1
    or has_table_privilege('authenticated', 'public.classroom_member_preferences', 'insert')
    or has_table_privilege('authenticated', 'public.classroom_member_preferences', 'update')
  then
    raise exception 'The former Student did not receive private retained-read state.';
  end if;

  if (select status from public.classrooms
      where id = current_setting('test.classroom_a_id')::uuid) <> 'inactive' then
    raise exception 'Personal archive mutated the shared Classroom lifecycle.';
  end if;
end;
$retained_student_access$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $other_student_isolation$
begin
  if public.current_user_can_read_classroom(
      current_setting('test.classroom_a_id')::uuid
    )
    or public.current_user_can_read_student_course(
      current_setting('test.course_a_id')::uuid
    )
    or exists (
      select 1
      from public.classroom_member_preferences
      where classroom_id = current_setting('test.classroom_a_id')::uuid
    )
    or exists (
      select 1
      from public.classroom_memberships
      where classroom_id = current_setting('test.classroom_a_id')::uuid
    )
  then
    raise exception 'Another Student received retained Classroom or private preference data.';
  end if;
end;
$other_student_isolation$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $membership_tenure_history$
begin
  if (select count(*) from public.classroom_memberships
      where classroom_id = current_setting('test.classroom_b_id')::uuid
        and user_id = auth.uid()
        and membership_role = 'tutor') <> 2
    or (select count(*) from public.classroom_memberships
        where classroom_id = current_setting('test.classroom_b_id')::uuid
          and user_id = auth.uid()
          and membership_role = 'tutor'
          and status = 'active') <> 1
  then
    raise exception 'Classroom Membership tenure history is not preserved.';
  end if;
end;
$membership_tenure_history$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_denial$
begin
  if public.current_user_can_read_classroom(
      current_setting('test.classroom_a_id')::uuid
    )
    or public.current_user_can_participate_in_classroom(
      current_setting('test.classroom_a_id')::uuid
    )
    or public.current_user_can_read_student_course(
      current_setting('test.course_a_id')::uuid
    )
  then
    raise exception 'The outsider received Classroom or Course authority.';
  end if;
end;
$outsider_denial$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
do $administrator_audit_visibility$
begin
  if not public.current_user_can_read_classroom(
      current_setting('test.classroom_a_id')::uuid
    )
    or (select count(*) from public.classroom_memberships
        where classroom_id = current_setting('test.classroom_a_id')::uuid) < 3
  then
    raise exception 'The authorization administrator lost audit visibility.';
  end if;

  if exists (
    select 1
    from public.classroom_member_preferences
    where classroom_id = current_setting('test.classroom_a_id')::uuid
  ) then
    raise exception 'A member-private Classroom preference leaked to an administrator session.';
  end if;
end;
$administrator_audit_visibility$;

rollback;
select 'passed' as classroom_membership_visibility_characterization;
