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

-- Phase 2.E owns the Calendar read contract, so it uses a rollback-only mirror
-- fixture. Current production Schedule changes use Phase 5.D's publisher.
insert into public.learning_schedules (
  student_id, student_course_id, created_by, source_key, name, time_zone,
  status, source_schema_version, source_snapshot
)
select
  course.student_id, course.id, current_setting('test.mentor_id')::uuid,
  'phase2e-calendar-' || course.id::text,
  'Phase 2.E Mechanics schedule', 'America/Sao_Paulo',
  'active', 1, jsonb_build_object('phase2eRollbackFixture', true)
from public.student_courses course
where course.id = :'course_a_id'::uuid
  and not exists (
    select 1 from public.learning_schedules existing
    where existing.student_course_id = course.id and existing.status = 'active'
  );
select id as schedule_a_id
from public.learning_schedules
where student_course_id = :'course_a_id'::uuid and status = 'active' \gset
update public.learning_schedules
set name = 'Phase 2.E Mechanics schedule',
    time_zone = 'America/Sao_Paulo',
    source_schema_version = 1,
    source_snapshot = jsonb_build_object('phase2eRollbackFixture', true),
    updated_at = clock_timestamp()
where id = :'schedule_a_id'::uuid;
update public.learning_schedule_sessions
set status = 'removed', updated_at = clock_timestamp()
where schedule_id = :'schedule_a_id'::uuid;
insert into public.learning_schedule_sessions (
  schedule_id, source_key, title, scheduled_date, end_date, position,
  status, source_snapshot
) values (
  :'schedule_a_id'::uuid, 'phase2e-db-kinematics', 'Kinematics milestone',
  '2026-07-22', '2026-07-22', 0, 'active', '{}'::jsonb
)
on conflict (schedule_id, source_key) do update set
  title = excluded.title,
  scheduled_date = excluded.scheduled_date,
  end_date = excluded.end_date,
  position = excluded.position,
  status = 'active',
  source_snapshot = excluded.source_snapshot,
  updated_at = clock_timestamp()
returning id as session_a_id \gset
select set_config('test.schedule_a_id', :'schedule_a_id', false);
select set_config('test.session_a_id', :'session_a_id', false);
select item.id as canonical_item_id,
       item.title as canonical_item_title,
       item.scheduled_date as canonical_item_date
from public.student_courses course
join public.course_schedule_items item
  on item.version_id = course.active_schedule_version_id
where course.id = :'course_a_id'::uuid
  and item.item_state in ('scheduled', 'requeued')
order by item.position, item.id
limit 1 \gset
select set_config('test.canonical_item_title', :'canonical_item_title', false);
select set_config('test.canonical_item_date', :'canonical_item_date', false);

set local role authenticated;
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
declare
  payload jsonb := public.get_my_student_calendar(
    current_setting('test.canonical_item_date')::date - 30,
    current_setting('test.canonical_item_date')::date + 31
  );
  unified_payload jsonb := public.get_my_unified_course_schedule(
    current_setting('test.course_a_id')::uuid
  );
  assignment_payload jsonb := public.get_my_student_calendar(
    '2026-07-01',
    '2026-07-31'
  );
  classroom_payload jsonb := public.get_my_student_classroom_calendar(
    current_setting('test.classroom_a_id')::uuid,
    current_setting('test.canonical_item_date')::date - 30,
    current_setting('test.canonical_item_date')::date + 31
  );
  role_aware_classroom_payload jsonb := public.get_my_classroom_calendar(
    current_setting('test.classroom_a_id')::uuid,
    current_setting('test.canonical_item_date')::date - 30,
    current_setting('test.canonical_item_date')::date + 31
  );
  canonical_row jsonb;
  calendar_event jsonb;
  classroom_calendar_event jsonb;
  course_start_event jsonb;
  academic_item jsonb;
  module_key text;
  expected_header_color text;
  expected_row_color text;
  expected_event_date text;
  expected_planning_href text;
  course_start_date date := (
    select course.start_date
    from public.student_courses course
    where course.id = current_setting('test.course_a_id')::uuid
  );
  lifecycle_payload jsonb;
begin
  lifecycle_payload := public.get_my_student_calendar(
    course_start_date - 1,
    course_start_date + 1
  );
  select entry.value
  into canonical_row
  from jsonb_array_elements(
    coalesce(unified_payload #> '{groups,past}', '[]'::jsonb)
    || coalesce(unified_payload #> '{groups,next}', '[]'::jsonb)
    || coalesce(unified_payload #> '{groups,upcoming}', '[]'::jsonb)
  ) entry(value)
  where entry.value ->> 'title' = current_setting('test.canonical_item_title')
  order by entry.value ->> 'rowId'
  limit 1;

  select event
  into calendar_event
  from jsonb_array_elements(payload -> 'events') event
  where event ->> 'id' = canonical_row ->> 'rowId'
  limit 1;

  select item
  into academic_item
  from jsonb_array_elements(
    coalesce(unified_payload #> '{academicTrack,items}', '[]'::jsonb)
  ) item
  where item ->> 'scheduleItemId' = canonical_row ->> 'scheduleItemId'
  limit 1;

  select event
  into classroom_calendar_event
  from jsonb_array_elements(role_aware_classroom_payload -> 'events') event
  where event ->> 'id' = canonical_row ->> 'rowId'
  limit 1;

  select event
  into course_start_event
  from jsonb_array_elements(lifecycle_payload -> 'events') event
  where event ->> 'kind' = 'course_start'
    and event ->> 'courseId' = current_setting('test.course_a_id')
  limit 1;

  module_key := coalesce(
    nullif(academic_item #>> '{presentation,modulePresentationKey}', ''),
    nullif(academic_item ->> 'modulePresentationKey', ''),
    nullif(academic_item ->> 'moduleKey', ''),
    nullif(academic_item #>> '{source,moduleKey}', '')
  );
  expected_header_color := coalesce(
    unified_payload #>> array['academicTrack', 'moduleStyles', module_key, 'headerColor'],
    '#5fae63'
  );
  expected_row_color := coalesce(
    unified_payload #>> array['academicTrack', 'moduleStyles', module_key, 'stripeColor'],
    '#dcefdc'
  );
  expected_event_date := coalesce(
    nullif(canonical_row #>> '{calendarPresentation,effectiveDate}', ''),
    case
      when nullif(canonical_row #>> '{calendarPresentation,startsAt}', '') is null
        then null
      else (
        (canonical_row #>> '{calendarPresentation,startsAt}')::timestamptz
          at time zone (payload #>> '{range,timeZone}')
      )::date::text
    end
  );
  expected_planning_href := coalesce(
    nullif(academic_item ->> 'planningHref', ''),
    nullif(academic_item #>> '{source,planningHref}', '')
  );

  if payload #>> '{contract,name}' <> 'student_calendar_read'
    or payload #>> '{contract,phase}' <> '5.G.2.2'
    or payload #>> '{contract,version}' <> '2'
    or payload #>> '{contract,scheduleAuthority}' <> 'course_schedule_read'
    or payload #>> '{contract,legacyScheduleMirrorAuthoritative}' <> 'false'
    or payload #>> '{contract,failureMode}' <> 'atomic'
    or payload #>> '{contract,directEventDestinations}' <> 'true'
    or payload #>> '{contract,moduleColorPresentation}' <> 'true'
    or payload #>> '{contract,legacyModuleIdentityCompatibility}' <> 'true'
    or payload #>> '{contract,itemAcademicPresentation}' <> 'true'
    or payload #>> '{contract,courseLifecycleCoveragePresentation}' <> 'true'
    or payload #>> '{featureStatus,calendarProjection}' <> 'active_phase_5g2_2'
  then
    raise exception 'Student Calendar did not expose the canonical Phase 5.G.2.2 contract.';
  end if;
  if payload #>> '{availabilityOverlay,status}' <> 'contract_only_phase_10' then
    raise exception 'Student Calendar availability contract status was unexpected.';
  end if;
  if payload #>> '{lessonRequestFoundation,status}'
      <> 'local_draft_active_phase_5h'
    or payload #>> '{lessonRequestFoundation,scope}' <> 'dashboard'
    or payload #>> '{lessonRequestFoundation,canStart}' <> 'true'
    or payload #>> '{lessonRequestFoundation,draftStorage}'
      <> 'browser_session_only'
    or payload #>> '{lessonRequestFoundation,submissionStatus}'
      <> 'pending_phase_10'
    or payload #>> '{lessonRequestFoundation,createsReservation}' <> 'false'
    or payload #>> '{lessonRequestFoundation,createsLessonRequest}' <> 'false'
    or payload #>> '{lessonRequestFoundation,createsClass}' <> 'false'
  then
    raise exception 'Student Calendar Lesson Request draft contract is invalid.';
  end if;
  if payload #>> '{range,timeZone}' <> 'America/Sao_Paulo' then
    raise exception 'Student Calendar did not use the viewer timezone.';
  end if;
  if unified_payload #>> '{schedule,timeZone}' <> payload #>> '{range,timeZone}' then
    raise exception 'Classroom and Calendar consumers disagreed about the viewer timezone.';
  end if;
  if canonical_row is null
    or calendar_event is null
    or unified_payload #>> '{contract,name}' <> 'course_schedule_read'
    or calendar_event ->> 'courseId' <> unified_payload #>> '{course,id}'
    or calendar_event ->> 'classroomId' <> unified_payload #>> '{classroom,id}'
    or calendar_event ->> 'title' <> canonical_row ->> 'title'
    or coalesce(calendar_event ->> 'scheduleItemId', '')
      <> coalesce(canonical_row ->> 'scheduleItemId', '')
    or coalesce(calendar_event ->> 'status', '')
      <> coalesce(canonical_row ->> 'status', '')
    or coalesce(calendar_event ->> 'nonDeliveryReason', '')
      <> coalesce(canonical_row ->> 'nonDeliveryReason', '')
    or calendar_event ->> 'startsOn' <> expected_event_date
    or coalesce(calendar_event #>> '{calendarPresentation,effectiveDate}', '')
      <> coalesce(canonical_row #>> '{calendarPresentation,effectiveDate}', '')
  then
    raise exception 'Classroom and Calendar consumers drifted from the same canonical timeline row.';
  end if;
  if module_key is not null
    and (
      calendar_event ->> 'presentationColorSource' <> 'module'
      or calendar_event #>> '{modulePresentation,key}' <> module_key
      or lower(calendar_event #>> '{modulePresentation,headerColor}')
        <> lower(expected_header_color)
      or lower(calendar_event #>> '{modulePresentation,rowColor}')
        <> lower(expected_row_color)
    )
  then
    raise exception 'Classroom and Calendar consumers disagreed about module presentation colors.';
  end if;
  if academic_item ->> 'academicScope' = 'branch'
    and (
      calendar_event ->> 'academicScope' <> 'branch'
      or calendar_event ->> 'academicPath'
        <> academic_item #>> '{academicBranch,displayLabel}'
      or calendar_event ->> 'subject'
        <> academic_item #>> '{academicBranch,subject,name}'
      or calendar_event ->> 'focus'
        <> academic_item #>> '{academicBranch,track,name}'
      or calendar_event -> 'academicPathways'
        is distinct from academic_item #> '{academicBranch,academicPathways}'
      or classroom_calendar_event ->> 'academicPath'
        <> academic_item #>> '{academicBranch,displayLabel}'
      or classroom_calendar_event #>> '{modulePresentation,key}'
        <> module_key
    )
  then
    raise exception 'Calendar consumers did not preserve the item-specific academic path.';
  end if;
  if course_start_event is null
    or course_start_event ->> 'academicScope' <> 'course'
    or course_start_event ->> 'academicPath'
      <> unified_payload #>> '{academicTrack,coverage,displayLabel}'
    or course_start_event #>> '{academicCoverage,displayLabel}'
      <> unified_payload #>> '{academicTrack,coverage,displayLabel}'
    or course_start_event ->> 'presentationColorSource' <> 'classroom'
  then
    raise exception 'Course lifecycle presentation did not use whole-Course coverage.';
  end if;
  if expected_planning_href is not null
    and (
      calendar_event #>> '{action,type}' <> 'open_track_session'
      or calendar_event #>> '{action,href}' <> expected_planning_href
    )
  then
    raise exception 'Classroom and Calendar consumers disagreed about the Track destination.';
  end if;
  if jsonb_array_length(payload -> 'availabilityOverlay' -> 'eligibleContexts') <> 1 then
    raise exception 'Student Calendar did not return exactly one authorized availability context.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(payload -> 'events') event
    where event ->> 'courseId' = current_setting('test.course_a_id')
      and event ->> 'title' = current_setting('test.canonical_item_title')
      and event ->> 'kind' in (
        'schedule_milestone', 'regular_class', 'extra_class',
        'independent_progress'
      )
      and nullif(event ->> 'eventCode', '') is not null
      and event #>> '{calendarPresentation,blocksAvailability}' = 'false'
      and event ->> 'colorKey' = 'coral'
  ) then
    raise exception 'Student Calendar did not return its authoritative Course timeline item.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(assignment_payload -> 'events') event
    where event ->> 'kind' = 'assignment_due'
      and event ->> 'title' = 'Kinematics homework'
      and event ->> 'startsOn' = '2026-07-22'
      and event ->> 'eventCode' = 'AD'
      and event #>> '{action,type}' = 'open_practice'
  ) then
    raise exception
      'Student Calendar did not return its actionable assignment deadline. Assignment events: %',
      coalesce((
        select jsonb_agg(event)
        from jsonb_array_elements(assignment_payload -> 'events') event
        where event ->> 'kind' = 'assignment_due'
      ), '[]'::jsonb);
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'events') event
    where event ->> 'id' = 'schedule:' || current_setting('test.session_a_id')
      or event ->> 'title' = 'Legacy milestone must stay hidden'
      or event ->> 'title' = 'Kinematics milestone'
  ) then
    raise exception 'Student Calendar treated the legacy Schedule mirror as Course-event authority.';
  end if;
  if payload #>> '{calendarPolicy,dateOnlyDisplayAnchor}' <> 'viewer_local_noon'
    or payload #>> '{calendarPolicy,assignmentDeadlinesAreIndependent}' <> 'true'
    or payload #>> '{calendarPolicy,canonicalFailureIsAtomic}' <> 'true'
    or payload #>> '{calendarPolicy,legacyScheduleFallback}' <> 'false'
  then
    raise exception 'Student Calendar presentation or failure policy is invalid.';
  end if;
  if classroom_payload #>> '{contract,scope}' <> 'classroom'
    or classroom_payload #>> '{contract,classroomId}'
      <> current_setting('test.classroom_a_id')
    or classroom_payload #>> '{calendarPolicy,classroomCourseFilter}' <> 'true'
    or classroom_payload #>> '{calendarPolicy,availabilityTutorScope}'
      <> 'assigned_classroom_tutor'
    or exists (
      select 1
      from jsonb_array_elements(classroom_payload -> 'events') event
      where event ->> 'classroomId' <> current_setting('test.classroom_a_id')
    )
    or jsonb_array_length(
      classroom_payload #> '{availabilityOverlay,eligibleContexts}'
    ) <> 1
  then
    raise exception 'The Classroom Calendar adapter did not preserve its exact Course scope.';
  end if;
  if jsonb_array_length(classroom_payload -> 'events') <> (
      select count(*)
      from jsonb_array_elements(payload -> 'events') event
      where event ->> 'classroomId' = current_setting('test.classroom_a_id')
    )
    or exists (
      select 1
      from jsonb_array_elements(payload -> 'events') dashboard_event
      where dashboard_event ->> 'classroomId'
          = current_setting('test.classroom_a_id')
        and not exists (
          select 1
          from jsonb_array_elements(classroom_payload -> 'events') classroom_event
          where classroom_event = dashboard_event
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(classroom_payload -> 'events') classroom_event
      where not exists (
        select 1
        from jsonb_array_elements(payload -> 'events') dashboard_event
        where dashboard_event ->> 'classroomId'
            = current_setting('test.classroom_a_id')
          and dashboard_event = classroom_event
      )
    )
  then
    raise exception
      'Student Classroom Calendar diverged from its Dashboard timeline.';
  end if;
  if role_aware_classroom_payload #>> '{contract,name}'
      <> 'classroom_calendar_read'
    or role_aware_classroom_payload #>> '{contract,roleAwareClassroomAccess}'
      <> 'true'
    or role_aware_classroom_payload #>> '{viewer,membershipRole}' <> 'student'
    or role_aware_classroom_payload #>> '{viewer,canRequestLesson}' <> 'true'
    or role_aware_classroom_payload #>> '{lessonRequestFoundation,scope}'
      <> 'classroom'
    or role_aware_classroom_payload #>> '{lessonRequestFoundation,canStart}'
      <> 'true'
    or role_aware_classroom_payload
      #>> '{lessonRequestFoundation,tutorSelection}'
      <> 'assigned_classroom_tutor_locked'
    or role_aware_classroom_payload
      #>> '{lessonRequestFoundation,contextSelection}'
      <> 'current_course_locked'
    or jsonb_array_length(
      role_aware_classroom_payload #> '{availabilityOverlay,eligibleContexts}'
    ) <> 1
    or exists (
      select 1
      from jsonb_array_elements(role_aware_classroom_payload -> 'events') event
      where event ->> 'classroomId' <> current_setting('test.classroom_a_id')
    )
  then
    raise exception 'The Student role-aware Classroom Calendar contract is invalid.';
  end if;
  if payload #>> '{contract,activeVersionClassroomAuthority}' <> 'true'
    or jsonb_array_length(classroom_payload -> 'events')
      <> jsonb_array_length(role_aware_classroom_payload -> 'events')
    or exists (
      select 1
      from jsonb_array_elements(classroom_payload -> 'events') student_event
      where not exists (
        select 1
        from jsonb_array_elements(
          role_aware_classroom_payload -> 'events'
        ) role_event
        where role_event = student_event
      )
    )
    or exists (
      select 1
      from jsonb_array_elements(
        role_aware_classroom_payload -> 'events'
      ) role_event
      where not exists (
        select 1
        from jsonb_array_elements(classroom_payload -> 'events') student_event
        where student_event = role_event
      )
    )
  then
    raise exception
      'Student and staff Calendars disagreed about the active Schedule Version.';
  end if;
end;
$student_calendar_projection$;

reset role;
update public.user_preferences
set time_zone = 'Asia/Damascus', time_zone_confirmed_at = clock_timestamp()
where user_id = current_setting('test.student_a_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_calendar_follows_profile_timezone_change$
declare
  payload jsonb := public.get_my_student_calendar('2026-07-01', '2026-07-31');
  unified_payload jsonb := public.get_my_unified_course_schedule(
    current_setting('test.course_a_id')::uuid
  );
begin
  if payload #>> '{range,timeZone}' <> 'Asia/Damascus'
    or unified_payload #>> '{schedule,timeZone}' <> 'Asia/Damascus'
  then
    raise exception 'Classroom and Calendar did not inherit the same Profile timezone.';
  end if;
end;
$student_calendar_follows_profile_timezone_change$;

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
  begin
    perform public.get_my_unified_course_schedule(
      current_setting('test.course_a_id')::uuid
    );
    raise exception 'Expected cross-Student Classroom Schedule denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected cross-Student Classroom Schedule denial was not raised.' then
      raise;
    end if;
  end;
  begin
    perform public.get_my_student_classroom_calendar(
      current_setting('test.classroom_a_id')::uuid,
      '2026-07-01',
      '2026-07-31'
    );
    raise exception 'Expected cross-Student Classroom Calendar denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected cross-Student Classroom Calendar denial was not raised.' then
      raise;
    end if;
    if sqlerrm not like '%active Student Classroom Membership%' then raise; end if;
  end;
  begin
    perform public.get_my_classroom_calendar(
      current_setting('test.classroom_a_id')::uuid,
      '2026-07-01',
      '2026-07-31'
    );
    raise exception 'Expected cross-Student role-aware Classroom Calendar denial was not raised.';
  exception when others then
    if sqlerrm =
      'Expected cross-Student role-aware Classroom Calendar denial was not raised.'
    then
      raise;
    end if;
    if sqlerrm not like '%active Student, Tutor, or Mentor Classroom Membership%' then
      raise;
    end if;
  end;
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
  begin
    perform public.get_my_classroom_calendar(
      current_setting('test.classroom_a_id')::uuid,
      '2026-07-01',
      '2026-07-31'
    );
    raise exception 'Expected outsider Classroom Calendar denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom Calendar denial was not raised.' then
      raise;
    end if;
    if sqlerrm not like '%active Student, Tutor, or Mentor Classroom Membership%' then
      raise;
    end if;
  end;
end;
$outsider_calendar_empty$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_calendar_denial$
declare
  unified_payload jsonb := public.get_my_unified_course_schedule(
    current_setting('test.course_a_id')::uuid
  );
  classroom_calendar_payload jsonb := public.get_my_classroom_calendar(
    current_setting('test.classroom_a_id')::uuid,
    current_setting('test.canonical_item_date')::date - 30,
    current_setting('test.canonical_item_date')::date + 31
  );
begin
  if unified_payload #>> '{viewer,actorRole}' <> 'tutor'
    or unified_payload #>> '{permissions,canReadDetailedAcademicTrack}' <> 'true'
    or unified_payload #>> '{course,id}' <> current_setting('test.course_a_id')
  then
    raise exception 'The assigned Tutor did not retain detailed Classroom Schedule access.';
  end if;
  begin
    perform public.get_my_student_calendar('2026-07-01', '2026-07-31');
    raise exception 'Expected Tutor Student-Calendar denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected Tutor Student-Calendar denial was not raised.' then raise; end if;
    if sqlerrm not like '%active Student workspace%' then raise; end if;
  end;
  if classroom_calendar_payload #>> '{viewer,membershipRole}' <> 'tutor'
    or classroom_calendar_payload #>> '{viewer,canRequestLesson}' <> 'false'
    or classroom_calendar_payload #>> '{lessonRequestFoundation,canStart}'
      <> 'false'
    or jsonb_array_length(
      classroom_calendar_payload #> '{availabilityOverlay,eligibleContexts}'
    ) <> 0
    or exists (
      select 1
      from jsonb_array_elements(classroom_calendar_payload -> 'events') event
      where event ->> 'classroomId' <> current_setting('test.classroom_a_id')
    )
  then
    raise exception 'The assigned Tutor Classroom Calendar authority is invalid.';
  end if;
end;
$tutor_calendar_denial$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $mentor_classroom_schedule_access$
declare
  unified_payload jsonb := public.get_my_unified_course_schedule(
    current_setting('test.course_a_id')::uuid
  );
  classroom_calendar_payload jsonb := public.get_my_classroom_calendar(
    current_setting('test.classroom_a_id')::uuid,
    current_setting('test.canonical_item_date')::date - 30,
    current_setting('test.canonical_item_date')::date + 31
  );
begin
  if unified_payload #>> '{viewer,actorRole}' <> 'mentor'
    or unified_payload #>> '{permissions,canReadDetailedAcademicTrack}' <> 'true'
    or unified_payload #>> '{course,id}' <> current_setting('test.course_a_id')
  then
    raise exception 'The supervising Mentor did not retain detailed Classroom Schedule access.';
  end if;
  if classroom_calendar_payload #>> '{viewer,membershipRole}' <> 'mentor'
    or classroom_calendar_payload #>> '{viewer,canRequestLesson}' <> 'false'
    or classroom_calendar_payload #>> '{lessonRequestFoundation,canStart}'
      <> 'false'
    or jsonb_array_length(
      classroom_calendar_payload #> '{availabilityOverlay,eligibleContexts}'
    ) <> 0
    or exists (
      select 1
      from jsonb_array_elements(classroom_calendar_payload -> 'events') event
      where event ->> 'classroomId' <> current_setting('test.classroom_a_id')
    )
  then
    raise exception 'The supervising Mentor Classroom Calendar authority is invalid.';
  end if;
end;
$mentor_classroom_schedule_access$;

rollback;
select 'passed' as student_calendar_surface_characterization;
