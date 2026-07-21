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
    :'student_a_id'::uuid, :'student_b_id'::uuid,
    :'tutor_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'student_a_id'::uuid, :'student_b_id'::uuid,
      :'tutor_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (select 1 from public.user_roles where user_id = :'student_a_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_b_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'outsider_id'::uuid and role_key = 'student' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic Classroom Card actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.outsider_id', :'outsider_id', false);
set local role authenticated;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select (public.get_my_student_dashboard() -> 'classrooms' -> 0 -> 'classroom' ->> 'id') as classroom_a_id \gset
select set_config('test.classroom_a_id', :'classroom_a_id', false);

do $student_card_projection$
declare payload jsonb := public.get_my_student_dashboard();
begin
  if (payload ->> 'schemaVersion')::integer <> 4
    or payload #>> '{featureStatus,classroomCards}' <> 'active_phase_2d'
    or jsonb_array_length(payload -> 'classrooms') < 1
    or payload #>> '{classrooms,0,classroom,status}' <> 'active'
    or payload #>> '{classrooms,0,classroom,membershipRole}' <> 'student'
    or payload #>> '{classrooms,0,card,colorKey}' <> 'ocean' then
    raise exception 'Student A did not receive an active relationship-backed Classroom Card.';
  end if;
end;
$student_card_projection$;

select public.save_my_student_classroom_card_color(:'classroom_a_id'::uuid, 'coral');
select public.save_my_student_classroom_card_order(array[:'classroom_a_id'::uuid]);

do $student_card_saved$
declare payload jsonb := public.get_my_student_dashboard();
begin
  if payload #>> '{classrooms,0,card,colorKey}' <> 'coral'
    or (payload #>> '{classrooms,0,card,position}')::integer <> 0
    or (select count(*) from public.student_classroom_card_preferences
        where user_id = current_setting('test.student_a_id')::uuid) <> 1 then
    raise exception 'Student A Classroom Card preferences did not round-trip.';
  end if;
end;
$student_card_saved$;

do $student_classroom_space$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
begin
  if payload #>> '{classroom,id}' <> current_setting('test.classroom_a_id')
    or payload #>> '{viewer,membershipRole}' <> 'student'
    or payload #>> '{featureStatus,liveClassTool}' <> 'schedule_bound' then
    raise exception 'Student A could not open their authenticated persistent Classroom space.';
  end if;
end;
$student_classroom_space$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
select (public.get_my_student_dashboard() -> 'classrooms' -> 0 -> 'classroom' ->> 'id') as classroom_b_id \gset
select set_config('test.classroom_b_id', :'classroom_b_id', false);

do $student_card_isolation$
begin
  if exists (
    select 1 from public.student_classroom_card_preferences
    where classroom_id = current_setting('test.classroom_a_id')::uuid
  ) then
    raise exception 'Student B could read Student A Classroom Card preferences.';
  end if;
  begin
    perform public.save_my_student_classroom_card_color(
      current_setting('test.classroom_a_id')::uuid,
      'kelp'
    );
    raise exception 'Expected cross-Student Classroom Card customization denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected cross-Student Classroom Card customization denial was not raised.' then raise; end if;
    if sqlerrm not like '%active Student Classroom membership%' then raise; end if;
  end;
  begin
    perform public.save_my_student_classroom_card_order(array[
      current_setting('test.classroom_a_id')::uuid
    ]);
    raise exception 'Expected incomplete Classroom Card order rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected incomplete Classroom Card order rejection was not raised.' then raise; end if;
    if sqlerrm not like '%every active Student Classroom%' then raise; end if;
  end;
end;
$student_card_isolation$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_classroom_space$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'tutor' then
    raise exception 'The assigned Tutor could not open the persistent Classroom space.';
  end if;
end;
$tutor_classroom_space$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_classroom_denial$
begin
  if jsonb_array_length(public.get_my_student_dashboard() -> 'classrooms') <> 0 then
    raise exception 'The unlinked Student received an active Classroom Card.';
  end if;
  begin
    perform public.get_my_classroom_space(current_setting('test.classroom_a_id')::uuid);
    raise exception 'Expected outsider Classroom-space denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom-space denial was not raised.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$outsider_classroom_denial$;

rollback;
select 'passed' as student_classroom_cards_characterization;
