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
  \echo 'Required Classroom Overview actors are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
set local role authenticated;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
with selected as (
  select item
  from jsonb_array_elements(public.get_my_learning_relationships() -> 'courses') item
  where item #>> '{mentor,id}' = :'mentor_id'
    and item #>> '{tutor,id}' = :'tutor_id'
    and item #>> '{student,id}' = :'student_id'
    and item ->> 'status' in ('active', 'wind_down')
    and item #>> '{classroom,status}' = 'active'
  order by item ->> 'id'
  limit 1
)
select
  coalesce(max(item ->> 'id'), '') as course_id,
  coalesce(max(item #>> '{classroom,id}'), '') as classroom_id
from selected \gset

select (
  coalesce(:'course_id', '') <> '' and coalesce(:'classroom_id', '') <> ''
) as classroom_ready \gset
\if :classroom_ready
\else
  \echo 'The deterministic active Classroom for Phase 4.B is missing. Run supabase:provision first.'
  \quit 3
\endif

select set_config('test.course_id', :'course_id', false);
select set_config('test.classroom_id', :'classroom_id', false);
select set_config('test.student_id', :'student_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.mentor_id', :'mentor_id', false);

-- Phase 4.B characterizes its read projection with a rollback-only mirror
-- fixture. Current production revisions use Phase 5.D's reasoned publisher.
reset role;
insert into public.learning_schedules (
  student_id, student_course_id, created_by, source_key, name, time_zone,
  status, source_schema_version, source_snapshot
)
select
  course.student_id, course.id, current_setting('test.mentor_id')::uuid,
  'phase4b-overview-' || course.id::text,
  'Phase 4.B Mechanics schedule', 'America/Sao_Paulo',
  'active', 1, jsonb_build_object('phase4bRollbackFixture', true)
from public.student_courses course
where course.id = :'course_id'::uuid
  and not exists (
    select 1 from public.learning_schedules existing
    where existing.student_course_id = course.id and existing.status = 'active'
  );
select id as schedule_id
from public.learning_schedules
where student_course_id = :'course_id'::uuid and status = 'active' \gset
update public.learning_schedules
set name = 'Phase 4.B Mechanics schedule',
    time_zone = 'America/Sao_Paulo',
    source_schema_version = 1,
    source_snapshot = jsonb_build_object('phase4bRollbackFixture', true),
    updated_at = clock_timestamp()
where id = :'schedule_id'::uuid;
update public.learning_schedule_sessions
set status = 'removed', updated_at = clock_timestamp()
where schedule_id = :'schedule_id'::uuid;
insert into public.learning_schedule_sessions (
  schedule_id, source_key, title, scheduled_date, end_date, position,
  status, source_snapshot
) values
  (
    :'schedule_id'::uuid, 'phase4b-theory-1', 'Mechanics theory',
    '2026-08-04', '2026-08-04', 0, 'active', '{}'::jsonb
  ),
  (
    :'schedule_id'::uuid, 'phase4b-practice-1', 'Mechanics practice',
    '2026-08-11', '2026-08-12', 1, 'active', '{}'::jsonb
  )
on conflict (schedule_id, source_key) do update set
  title = excluded.title,
  scheduled_date = excluded.scheduled_date,
  end_date = excluded.end_date,
  position = excluded.position,
  status = 'active',
  source_snapshot = excluded.source_snapshot,
  updated_at = clock_timestamp();
select set_config('test.schedule_id', :'schedule_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

do $mentor_overview_projection$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if (payload ->> 'schemaVersion')::integer < 4
    or payload #>> '{featureStatus,classroomOverview}' <> 'active_phase_4b'
    or payload #>> '{student,id}' <> current_setting('test.student_id', true)
    or payload #>> '{tutor,id}' <> current_setting('test.tutor_id', true)
    or payload #>> '{mentor,id}' <> current_setting('test.mentor_id', true)
    or nullif(btrim(payload #>> '{student,name}'), '') is null
    or nullif(btrim(payload #>> '{tutor,name}'), '') is null
    or nullif(btrim(payload #>> '{mentor,name}'), '') is null
    or payload #>> '{schedule,linkageStatus}' <> 'linked'
    or payload #>> '{schedule,id}' <> current_setting('test.schedule_id')
    or payload #>> '{schedule,name}' <> 'Phase 4.B Mechanics schedule'
    or payload #>> '{schedule,recordStatus}' <> 'active'
    or payload #>> '{schedule,timeZone}' <> 'America/Sao_Paulo'
    or (payload #>> '{schedule,sessionCount}')::integer <> 2
    or payload #>> '{schedule,firstSessionDate}' <> '2026-08-04'
    or payload #>> '{schedule,lastSessionDate}' <> '2026-08-12'
    or (payload #>> '{schedule,versionCount}')::integer < 1
    or payload #>> '{management,actions,meetingSchedule}' <> 'planned_phase_5'
    or payload #>> '{management,actions,tutorAssignment}' <> 'planned_phase_6'
    or payload #>> '{provider,kind}' not in ('kelp', 'independent_tutor')
  then
    raise exception 'The supervising Mentor did not receive the complete Phase 4.B Classroom Overview.';
  end if;
end;
$mentor_overview_projection$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_overview_projection$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'tutor'
    or (payload #>> '{viewer,canManageClassroom}')::boolean is not false
    or payload #>> '{schedule,linkageStatus}' <> 'linked'
    or payload #>> '{student,id}' <> current_setting('test.student_id')
    or payload #>> '{mentor,id}' <> current_setting('test.mentor_id')
  then
    raise exception 'The assigned Tutor did not receive the authorized read-only Overview data.';
  end if;
end;
$tutor_overview_projection$;

select set_config('request.jwt.claim.sub', :'student_id', true);
do $student_overview_projection$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'student'
    or payload #>> '{student,id}' <> current_setting('test.student_id')
    or payload -> 'mentor' is distinct from 'null'::jsonb
    or payload #>> '{schedule,linkageStatus}' <> 'linked'
  then
    raise exception 'The Student did not receive their authorized Classroom Overview.';
  end if;
end;
$student_overview_projection$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
do $administrator_overview_projection$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{viewer,membershipRole}' <> 'administrator'
    or payload #>> '{viewer,accessMode}' <> 'read_only'
    or (payload #>> '{viewer,canManageClassroom}')::boolean is not false
    or payload #>> '{schedule,linkageStatus}' <> 'linked'
    or payload #>> '{mentor,id}' <> current_setting('test.mentor_id')
  then
    raise exception 'The administrator shell projection exceeded its read-only Overview boundary.';
  end if;
end;
$administrator_overview_projection$;

reset role;
update public.learning_schedules
set student_course_id = null
where id = current_setting('test.schedule_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_id', true);
do $legacy_missing_schedule_projection$
declare payload jsonb := public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{schedule,linkageStatus}' <> 'missing'
    or nullif(payload #>> '{schedule,id}', '') is not null
    or (payload #>> '{schedule,sessionCount}')::integer <> 0
    or (payload #>> '{schedule,versionCount}')::integer <> 0
  then
    raise exception 'A legacy Course without a linked Schedule did not return the explicit missing state.';
  end if;
end;
$legacy_missing_schedule_projection$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_overview_denial$
begin
  begin
    perform public.get_my_classroom_space(current_setting('test.classroom_id')::uuid);
    raise exception 'Expected outsider Classroom Overview denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom Overview denial was not raised.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$outsider_overview_denial$;

rollback;
select 'passed' as classroom_overview_projection_characterization;
