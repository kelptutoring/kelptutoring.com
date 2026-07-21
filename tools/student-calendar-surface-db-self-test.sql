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
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  cardinality(array[
    :'student_a_id'::uuid, :'student_b_id'::uuid, :'mentor_id'::uuid,
    :'tutor_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'student_a_id'::uuid, :'student_b_id'::uuid, :'mentor_id'::uuid,
      :'tutor_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (select 1 from public.user_roles where user_id = :'student_a_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_b_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'outsider_id'::uuid and role_key = 'student' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic Calendar actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

-- Calendar output uses the viewer's governed preference. Pin the synthetic
-- Student's timezone inside this rollback-only transaction so the assertion
-- does not depend on whichever profile fixture happened to run first.
update public.user_preferences
set time_zone = 'America/Sao_Paulo', time_zone_confirmed_at = now()
where user_id = :'student_a_id'::uuid;

select id as course_a_id
from public.student_courses
where student_id = :'student_a_id'::uuid and status = 'active'
order by created_at, id limit 1 \gset
select id as course_b_id
from public.student_courses
where student_id = :'student_b_id'::uuid and status = 'active'
order by created_at, id limit 1 \gset
select id as classroom_a_id
from public.classrooms
where course_id = :'course_a_id'::uuid and status = 'active' \gset
select set_config('test.course_a_id', :'course_a_id', false);
select set_config('test.course_b_id', :'course_b_id', false);
select set_config('test.classroom_a_id', :'classroom_a_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select
  payload ->> 'id' as schedule_a_id,
  payload #>> '{sessions,0,id}' as session_a_id
from (
  select public.upsert_student_course_learning_schedule(
    :'course_a_id'::uuid,
    jsonb_build_object(
      'id', 'phase2e-db-student-a-v1',
      'name', 'Phase 2.E Mechanics schedule',
      'timeZone', 'America/Sao_Paulo',
      'schemaVersion', 1,
      'sessions', jsonb_build_array(jsonb_build_object(
        'id', 'phase2e-db-kinematics',
        'title', 'Kinematics milestone',
        'startDate', '2026-07-22',
        'endDate', '2026-07-22'
      ))
    )
  ) as payload
) synchronized \gset
select set_config('test.schedule_a_id', :'schedule_a_id', false);
select set_config('test.session_a_id', :'session_a_id', false);

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.save_my_student_classroom_card_color(:'classroom_a_id'::uuid, 'coral');

reset role;
insert into public.learning_schedules (
  id, student_id, created_by, student_course_id, source_key, name, time_zone,
  status, source_schema_version, source_snapshot
) values (
  '92000000-0000-4000-8000-000000000010', :'student_a_id'::uuid, :'mentor_id'::uuid,
  null, 'phase2e-db-unlinked', 'Legacy unlinked schedule', 'America/Sao_Paulo',
  'active', 1, '{}'::jsonb
);
insert into public.learning_schedule_sessions (
  id, schedule_id, source_key, title, scheduled_date, end_date, position, status, source_snapshot
) values (
  '92000000-0000-4000-8000-000000000011',
  '92000000-0000-4000-8000-000000000010',
  'phase2e-db-unlinked-session', 'Legacy milestone must stay hidden',
  '2026-07-22', '2026-07-22', 0, 'active', '{}'::jsonb
);
insert into public.course_assignments (
  id, course_id, assigned_by, student_id, schedule_session_id, status,
  course_title, course_description, curriculum_path_snapshot, schedule_snapshot,
  question_count, total_points
) values (
  '92000000-0000-4000-8000-000000000020', null, :'mentor_id'::uuid,
  :'student_a_id'::uuid, :'session_a_id'::uuid, 'assigned',
  'Kinematics homework', 'Phase 2.E assignment deadline', '[]'::jsonb,
  jsonb_build_object(
    'scheduleId', :'schedule_a_id'::uuid,
    'sessionId', :'session_a_id'::uuid,
    'sessionTitle', 'Kinematics milestone',
    'scheduledDate', '2026-07-22',
    'endDate', '2026-07-22',
    'timeZone', 'America/Sao_Paulo'
  ),
  1, 10
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_calendar_projection$
declare payload jsonb := public.get_my_student_calendar('2026-07-01', '2026-07-31');
begin
  if payload #>> '{featureStatus,calendarProjection}' <> 'active_phase_2e' then
    raise exception 'Student Calendar feature status was not active_phase_2e.';
  end if;
  if payload #>> '{availabilityOverlay,status}' <> 'contract_only_phase_2e' then
    raise exception 'Student Calendar availability contract status was unexpected.';
  end if;
  if payload #>> '{range,timeZone}' <> 'America/Sao_Paulo' then
    raise exception 'Student Calendar did not use the viewer timezone.';
  end if;
  if jsonb_array_length(payload -> 'availabilityOverlay' -> 'eligibleContexts') <> 1 then
    raise exception 'Student Calendar did not return exactly one authorized availability context.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(payload -> 'events') event
    where event ->> 'kind' = 'schedule_milestone'
      and event ->> 'title' = 'Kinematics milestone'
      and event ->> 'startsOn' = '2026-07-22'
      and event ->> 'colorKey' = 'coral'
  ) then
    raise exception 'Student Calendar did not return its Course-linked schedule milestone.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(payload -> 'events') event
    where event ->> 'kind' = 'assignment_due'
      and event ->> 'title' = 'Kinematics homework due'
      and event ->> 'startsOn' = '2026-07-22'
      and event #>> '{action,type}' = 'open_practice'
  ) then
    raise exception 'Student Calendar did not return its actionable assignment deadline.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'events') event
    where event ->> 'title' = 'Legacy milestone must stay hidden'
  ) then
    raise exception 'Student Calendar leaked an unlinked legacy schedule.';
  end if;
end;
$student_calendar_projection$;

do $student_calendar_range_validation$
begin
  begin
    perform public.get_my_student_calendar('2026-08-02', '2026-08-01');
    raise exception 'Expected reversed Calendar range rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected reversed Calendar range rejection was not raised.' then raise; end if;
    if sqlerrm not like '%must not precede%' then raise; end if;
  end;
  begin
    perform public.get_my_student_calendar('2026-01-01', '2026-04-01');
    raise exception 'Expected oversized Calendar range rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected oversized Calendar range rejection was not raised.' then raise; end if;
    if sqlerrm not like '%cannot exceed 62 days%' then raise; end if;
  end;
end;
$student_calendar_range_validation$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $student_calendar_isolation$
declare payload jsonb := public.get_my_student_calendar('2026-07-01', '2026-07-31');
begin
  if exists (
    select 1 from jsonb_array_elements(payload -> 'events') event
    where event ->> 'courseId' = current_setting('test.course_a_id')
  ) or exists (
    select 1 from jsonb_array_elements(payload -> 'availabilityOverlay' -> 'eligibleContexts') context
    where context ->> 'courseId' = current_setting('test.course_a_id')
  ) then
    raise exception 'Student B received Student A Calendar data.';
  end if;
end;
$student_calendar_isolation$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_calendar_empty$
declare payload jsonb := public.get_my_student_calendar('2026-07-01', '2026-07-31');
begin
  if jsonb_array_length(payload -> 'events') <> 0
    or jsonb_array_length(payload -> 'availabilityOverlay' -> 'eligibleContexts') <> 0 then
    raise exception 'The unlinked outsider received Calendar data.';
  end if;
end;
$outsider_calendar_empty$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_calendar_denial$
begin
  begin
    perform public.get_my_student_calendar('2026-07-01', '2026-07-31');
    raise exception 'Expected Tutor Student-Calendar denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected Tutor Student-Calendar denial was not raised.' then raise; end if;
    if sqlerrm not like '%active Student workspace%' then raise; end if;
  end;
end;
$tutor_calendar_denial$;

rollback;
select 'passed' as student_calendar_surface_characterization;
