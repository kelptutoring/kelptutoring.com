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
\if :{?independent_tutor_id}
\else
  \echo 'Missing required actor variable: independent_tutor_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

begin;
select set_config('test.admin_id', :'admin_id', false);
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.independent_tutor_id', :'independent_tutor_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

do $independent_actor_precondition$
begin
  if not exists (
      select 1 from public.user_roles
      where user_id = current_setting('test.independent_tutor_id')::uuid
        and role_key in ('teacher', 'tutor')
        and status = 'active'
    )
    or exists (
      select 1 from public.mentor_tutor_assignments
      where tutor_id = current_setting('test.independent_tutor_id')::uuid
        and status = 'active'
    ) then
    raise exception 'The Phase 5.B independent-Tutor actor must be qualified-role compatible and unsupervised.';
  end if;
end;
$independent_actor_precondition$;

do $backfill_contract$
begin
  if exists (
    select 1
    from public.student_courses course
    left join public.course_schedules schedule on schedule.course_id = course.id
    left join public.course_schedule_versions version
      on version.id = course.active_schedule_version_id
     and version.schedule_id = schedule.id
    where schedule.id is null
      or version.id is null
      or not exists (
        select 1 from public.course_schedule_items item where item.version_id = version.id
      )
  ) then
    raise exception 'A retained Course was not backfilled with its required active Schedule Version.';
  end if;
  if exists (
    select 1 from public.student_courses where service_model = 'independent_tutor'
  ) then
    raise exception 'Provider kind remains conflated with the Student service model.';
  end if;
end;
$backfill_contract$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.B DB versioned Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5b-db-kelp-schedule-v1',
    'name', 'Phase 5.B Kelp Schedule',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5b-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 10,
        'endDate', current_date + 10
      ),
      jsonb_build_object(
        'id', 'phase5b-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 20,
        'endDate', current_date + 20
      )
    )
  ),
  'phase5b-db-kelp-course'
) ->> 'id') as kelp_course_id \gset

select (public.activate_student_course(:'kelp_course_id'::uuid)
  -> 'classroom' ->> 'id') as kelp_classroom_id \gset
select set_config('test.kelp_course_id', :'kelp_course_id', false);
select set_config('test.kelp_classroom_id', :'kelp_classroom_id', false);

do $atomic_kelp_course$
declare
  projection jsonb := public.get_my_course_schedule(current_setting('test.kelp_course_id')::uuid);
begin
  if projection #>> '{course,startDate}' <> (current_date + 10)::text
    or projection #>> '{course,scheduledEndDate}' <> (current_date + 20)::text
    or projection #>> '{schedule,versionCount}' <> '1'
    or projection #>> '{activeVersion,versionNumber}' <> '1'
    or jsonb_array_length(projection #> '{activeVersion,items}') <> 2
    or projection #>> '{activeVersion,items,0,stableItemKey}' <> 'phase5b-db-motion'
    or projection #>> '{featureStatus,requiredSchedule}' <> 'active_phase_5b' then
    raise exception 'The atomic Kelp Course and Schedule version 1 projection is incomplete.';
  end if;
end;
$atomic_kelp_course$;

-- Later structural publishing must preserve version 1 rather than rewriting
-- the original plan. Phase 5.D has closed distinct compatibility-bridge writes.
select active_schedule_version_id as kelp_v1_id
from public.student_courses where id = :'kelp_course_id'::uuid \gset
select public.publish_course_schedule_version(
  :'kelp_course_id'::uuid,
  :'kelp_v1_id'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5b-db-motion', 'title', 'Motion foundations',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
      'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5b-db-forces', 'title', 'Forces and interactions',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 24,
      'endDate', current_date + 24, 'position', 1, 'state', 'scheduled'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'reordered', 'stableItemKey', 'phase5b-db-forces',
    'reasonCode', 'pacing_adjustment',
    'studentExplanation', 'Forces moved to the next available academic meeting.'
  )),
  'phase5b-db-reasoned-v2'
);

do $version_history$
declare
  projection jsonb := public.get_my_course_schedule(current_setting('test.kelp_course_id')::uuid);
begin
  if projection #>> '{schedule,versionCount}' <> '2'
    or projection #>> '{activeVersion,versionNumber}' <> '2'
    or jsonb_array_length(projection -> 'versions') <> 2
    or not exists (
      select 1
      from public.course_schedule_versions version
      join public.course_schedules schedule on schedule.id = version.schedule_id
      join public.course_schedule_items item on item.version_id = version.id
      where schedule.course_id = current_setting('test.kelp_course_id')::uuid
        and version.version_number = 1
        and item.stable_item_key = 'phase5b-db-forces'
        and item.scheduled_date = current_date + 20
    ) then
    raise exception 'The revised Schedule did not preserve auditable version 1.';
  end if;
end;
$version_history$;

reset role;
do $immutable_history$
declare
  old_version_id uuid;
begin
  select version.id into old_version_id
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where schedule.course_id = current_setting('test.kelp_course_id')::uuid
    and version.version_number = 1;
  begin
    update public.course_schedule_versions
    set reason = 'phase5b-db-illegal-rewrite'
    where id = old_version_id;
    raise exception 'Expected immutable Schedule Version update to fail.';
  exception when others then
    if sqlerrm = 'Expected immutable Schedule Version update to fail.' then raise; end if;
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
  begin
    delete from public.course_schedule_items where version_id = old_version_id;
    raise exception 'Expected immutable Schedule item deletion to fail.';
  exception when others then
    if sqlerrm = 'Expected immutable Schedule item deletion to fail.' then raise; end if;
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
end;
$immutable_history$;

do $required_schedule_constraint$
begin
  begin
    insert into public.student_courses (
      student_id, tutor_id, mentor_id, subject_node_id, focus_node_id,
      title, provider_kind, service_model, status, start_date, scheduled_end_date,
      idempotency_key, idempotency_owner_id, created_by
    ) values (
      current_setting('test.student_a_id')::uuid,
      current_setting('test.tutor_id')::uuid,
      current_setting('test.mentor_id')::uuid,
      '10000000-0000-4000-8000-000000000013'::uuid,
      '10000000-0000-4000-8000-000000000032'::uuid,
      'Phase 5.B DB forbidden schedule-less Course',
      'kelp', 'recurring', 'draft', current_date + 1, current_date + 2,
      'phase5b-db-no-schedule',
      current_setting('test.mentor_id')::uuid,
      current_setting('test.mentor_id')::uuid
    );
    set constraints student_courses_require_schedule immediate;
    raise exception 'Expected a schedule-less Course to be rejected.';
  exception when others then
    if sqlerrm = 'Expected a schedule-less Course to be rejected.' then raise; end if;
    if sqlerrm not like '%requires an active Schedule Version%' then raise; end if;
  end;
end;
$required_schedule_constraint$;
set constraints student_courses_require_schedule deferred;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.grant_teaching_qualification(
  :'independent_tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.B rollback independent-Tutor qualification'
);

select set_config('request.jwt.claim.sub', :'independent_tutor_id', true);
select (public.create_student_course_with_schedule_draft(
  :'student_b_id'::uuid,
  :'independent_tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.B DB independent Mechanics',
  'independent_tutor',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5b-db-independent-schedule-v1',
    'name', 'Independent Mechanics Schedule',
    'timeZone', 'UTC',
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', 'phase5b-db-independent-motion',
      'title', 'Independent motion review',
      'startDate', current_date + 15,
      'endDate', current_date + 15
    ))
  ),
  'phase5b-db-independent-course'
) ->> 'id') as independent_course_id \gset
select (public.activate_student_course(:'independent_course_id'::uuid)
  -> 'classroom' ->> 'id') as independent_classroom_id \gset
select set_config('test.independent_course_id', :'independent_course_id', false);
select set_config('test.independent_classroom_id', :'independent_classroom_id', false);

do $independent_tutor_visible_contract$
declare
  visible_memberships integer;
  projection jsonb;
begin
  if not exists (
    select 1 from public.student_courses
    where id = current_setting('test.independent_course_id')::uuid
      and tutor_id = auth.uid()
      and provider_kind = 'independent_tutor'
      and service_model = 'on_demand'
      and mentor_id is null
      and active_schedule_version_id is not null
  ) then
    raise exception 'The independent Tutor cannot read the expected self-employed Course contract.';
  end if;

  projection := public.get_my_course_schedule(
    current_setting('test.independent_course_id')::uuid
  );
  if projection #>> '{course,providerKind}' <> 'independent_tutor'
    or projection #>> '{course,serviceModel}' <> 'on_demand'
    or projection #>> '{activeVersion,versionNumber}' <> '1'
    or jsonb_array_length(projection #> '{activeVersion,items}') <> 1 then
    raise exception 'The independent Tutor received an invalid Course Schedule projection.';
  end if;

  select count(*) into visible_memberships
  from public.classroom_memberships
  where classroom_id = current_setting('test.independent_classroom_id')::uuid
    and status = 'active';
  if visible_memberships <> 1 then
    raise exception 'Classroom Membership RLS should expose exactly the Tutor''s own row; observed %.', visible_memberships;
  end if;
  if not exists (
    select 1 from public.classroom_memberships
    where classroom_id = current_setting('test.independent_classroom_id')::uuid
      and user_id = auth.uid()
      and membership_role = 'tutor'
      and status = 'active'
  ) then
    raise exception 'The independent Tutor cannot read their own active Classroom Membership.';
  end if;
end;
$independent_tutor_visible_contract$;

reset role;
do $independent_underlying_contract$
declare
  underlying_memberships integer;
  underlying_roles text[];
begin
  select count(*), array_agg(membership_role order by membership_role)
  into underlying_memberships, underlying_roles
  from public.classroom_memberships
  where classroom_id = current_setting('test.independent_classroom_id')::uuid
    and status = 'active';

  if underlying_memberships <> 2 then
    raise exception 'The independent Classroom requires two underlying active Memberships; observed %.', underlying_memberships;
  end if;
  if underlying_roles is distinct from array['student', 'tutor']::text[] then
    raise exception 'The independent Classroom Membership roles are invalid: %.', underlying_roles;
  end if;
  if exists (
    select 1 from public.classroom_memberships
    where classroom_id = current_setting('test.independent_classroom_id')::uuid
      and membership_role = 'mentor'
  ) then
    raise exception 'A self-employed independent Classroom must not contain a Mentor Membership.';
  end if;
  if not exists (
    select 1 from public.student_courses
    where id = current_setting('test.independent_course_id')::uuid
      and provider_kind = 'independent_tutor'
      and service_model = 'on_demand'
      and mentor_id is null
      and active_schedule_version_id is not null
  ) then
    raise exception 'The underlying self-employed independent Course contract is invalid.';
  end if;
end;
$independent_underlying_contract$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_read_scope$
declare
  projection jsonb := public.get_my_course_schedule(current_setting('test.kelp_course_id')::uuid);
begin
  if projection #>> '{course,id}' <> current_setting('test.kelp_course_id')
    or exists (
      select 1 from public.course_schedules schedule
      where schedule.course_id = current_setting('test.independent_course_id')::uuid
    ) then
    raise exception 'Student Schedule RLS exposed another Student Course.';
  end if;
end;
$student_read_scope$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_denial$
begin
  begin
    perform public.get_my_course_schedule(current_setting('test.kelp_course_id')::uuid);
    raise exception 'Expected outsider Course Schedule access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider Course Schedule access to fail.' then raise; end if;
    if sqlerrm not like '%do not have access%' then raise; end if;
  end;
end;
$outsider_denial$;

rollback;
select 'passed' as required_versioned_course_schedule_characterization;
