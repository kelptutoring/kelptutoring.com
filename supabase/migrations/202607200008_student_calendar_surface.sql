-- Phase 2.E: authoritative Student Calendar projection and Course-scoped
-- learning-schedule bridge. Scheduled Classes, Tutor availability slots,
-- lesson requests, booking concurrency, and credit checks remain deferred.

alter table public.learning_schedules
  add column if not exists student_course_id uuid
    references public.student_courses(id) on delete restrict;

create index if not exists learning_schedules_student_course_idx
on public.learning_schedules (student_course_id, status, updated_at desc)
where student_course_id is not null;

create unique index if not exists learning_schedules_one_active_student_course_idx
on public.learning_schedules (student_course_id)
where student_course_id is not null and status = 'active';

comment on column public.learning_schedules.student_course_id is
  'Runtime Student Course that owns this schedule version. Null identifies a legacy, unlinked prototype schedule that is excluded from the Student Calendar.';

create or replace function public.learning_schedule_json(p_schedule_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', schedule.id,
    'studentId', schedule.student_id,
    'studentCourseId', schedule.student_course_id,
    'createdBy', schedule.created_by,
    'sourceKey', schedule.source_key,
    'name', schedule.name,
    'timeZone', schedule.time_zone,
    'status', schedule.status,
    'schemaVersion', schedule.source_schema_version,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', session.id,
        'sourceKey', session.source_key,
        'title', session.title,
        'scheduledDate', session.scheduled_date,
        'endDate', session.end_date,
        'position', session.position,
        'status', session.status
      ) order by session.scheduled_date, session.position, session.id)
      from public.learning_schedule_sessions session
      where session.schedule_id = schedule.id and session.status = 'active'
    ), '[]'::jsonb),
    'createdAt', schedule.created_at,
    'updatedAt', schedule.updated_at
  )
  from public.learning_schedules schedule
  where schedule.id = p_schedule_id;
$$;

create or replace function public.upsert_student_course_learning_schedule(
  p_student_course_id uuid,
  p_schedule jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  schedule_payload jsonb;
  target_schedule_id uuid;
  existing_course_id uuid;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.assign') then
    raise exception 'Your assigned roles cannot synchronize a Course schedule.';
  end if;
  if p_student_course_id is null then
    raise exception 'A runtime Student Course is required.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_student_course_id
  for share;
  if not found then
    raise exception 'The runtime Student Course could not be found.';
  end if;
  if caller_id <> course_record.mentor_id
    and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    raise exception 'Only the Course Mentor can synchronize this Course schedule.';
  end if;
  if course_record.status not in ('draft', 'active', 'wind_down') then
    raise exception 'The Course no longer accepts schedule versions.';
  end if;

  schedule_payload := public.upsert_student_learning_schedule(course_record.student_id, p_schedule);
  target_schedule_id := nullif(schedule_payload ->> 'id', '')::uuid;
  if target_schedule_id is null then
    raise exception 'The synchronized schedule did not return an ID.';
  end if;

  select student_course_id into existing_course_id
  from public.learning_schedules
  where id = target_schedule_id
  for update;
  if existing_course_id is not null and existing_course_id <> course_record.id then
    raise exception 'This schedule source is already linked to another runtime Course.';
  end if;

  update public.learning_schedules
  set status = 'archived', archived_at = clock_timestamp(), updated_at = clock_timestamp()
  where student_course_id = course_record.id
    and id <> target_schedule_id
    and status = 'active';

  update public.learning_schedules
  set student_course_id = course_record.id,
      status = 'active',
      archived_at = null,
      updated_at = clock_timestamp()
  where id = target_schedule_id;

  return public.learning_schedule_json(target_schedule_id);
exception when invalid_text_representation then
  raise exception 'The synchronized schedule did not return a valid ID.';
end;
$$;

create or replace function public.get_my_student_calendar(
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  viewer_time_zone text := 'UTC';
  calendar_events_payload jsonb := '[]'::jsonb;
  availability_contexts jsonb := '[]'::jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to load this Calendar.';
  end if;
  if p_range_start is null or p_range_end is null then
    raise exception 'Calendar range start and end dates are required.';
  end if;
  if p_range_end < p_range_start then
    raise exception 'Calendar range end must not precede its start.';
  end if;
  if (p_range_end - p_range_start) > 61 then
    raise exception 'Calendar ranges cannot exceed 62 days.';
  end if;

  select coalesce(nullif(btrim(preferences.time_zone), ''), 'UTC')
  into viewer_time_zone
  from public.user_preferences preferences
  where preferences.user_id = caller_id;
  if not found then viewer_time_zone := 'UTC'; end if;

  with course_context as (
    select
      course.id as course_id,
      course.title as course_title,
      course.start_date,
      course.scheduled_end_date,
      classroom.id as classroom_id,
      tutor.id as tutor_id,
      coalesce(nullif(btrim(tutor.full_name), ''), 'Tutor') as tutor_name,
      subject.name as subject_name,
      focus.name as focus_name,
      coalesce(card.color_key, 'ocean') as color_key
    from public.student_courses course
    join public.classrooms classroom on classroom.course_id = course.id
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
      and membership.user_id = caller_id
      and membership.membership_role = 'student'
      and membership.status = 'active'
    join public.profiles tutor on tutor.id = course.tutor_id
    join public.curriculum_nodes subject on subject.id = course.subject_node_id
    join public.curriculum_nodes focus on focus.id = course.focus_node_id
    left join public.student_classroom_card_preferences card
      on card.user_id = caller_id and card.classroom_id = classroom.id
    where course.student_id = caller_id
      and course.status in ('active', 'wind_down')
      and classroom.status = 'active'
  ),
  course_events as (
    select
      'course-start:' || context.course_id::text as event_id,
      'course_start'::text as event_kind,
      context.start_date as starts_on,
      context.start_date as ends_on,
      context.course_title || ' begins' as title,
      context.subject_name || case when context.focus_name <> '' then ' · ' || context.focus_name else '' end as detail,
      context.course_id,
      context.classroom_id,
      context.course_title,
      context.tutor_id,
      context.tutor_name,
      context.subject_name,
      context.focus_name,
      context.color_key,
      null::uuid as assignment_id
    from course_context context
    where context.start_date between p_range_start and p_range_end
    union all
    select
      'course-end:' || context.course_id::text,
      'course_end'::text,
      context.scheduled_end_date,
      context.scheduled_end_date,
      context.course_title || ' scheduled end',
      context.subject_name || case when context.focus_name <> '' then ' · ' || context.focus_name else '' end,
      context.course_id,
      context.classroom_id,
      context.course_title,
      context.tutor_id,
      context.tutor_name,
      context.subject_name,
      context.focus_name,
      context.color_key,
      null::uuid
    from course_context context
    where context.scheduled_end_date between p_range_start and p_range_end
  ),
  schedule_events as (
    select
      'schedule:' || session.id::text as event_id,
      'schedule_milestone'::text as event_kind,
      session.scheduled_date as starts_on,
      session.end_date as ends_on,
      session.title,
      schedule.name as detail,
      context.course_id,
      context.classroom_id,
      context.course_title,
      context.tutor_id,
      context.tutor_name,
      context.subject_name,
      context.focus_name,
      context.color_key,
      null::uuid as assignment_id
    from public.learning_schedule_sessions session
    join public.learning_schedules schedule on schedule.id = session.schedule_id
    join course_context context on context.course_id = schedule.student_course_id
    where schedule.student_id = caller_id
      and schedule.status = 'active'
      and session.status = 'active'
      and session.scheduled_date between p_range_start and p_range_end
  ),
  assignment_source as (
    select
      assignment.id,
      assignment.course_title as assignment_title,
      assignment.schedule_snapshot,
      session.end_date as session_end_date,
      context.*
    from public.course_assignments assignment
    join public.learning_schedule_sessions session on session.id = assignment.schedule_session_id
    join public.learning_schedules schedule on schedule.id = session.schedule_id
    join course_context context on context.course_id = schedule.student_course_id
    where assignment.student_id = caller_id
      and assignment.status <> 'cancelled'
      and schedule.status = 'active'
      and session.status = 'active'
  ),
  assignment_events as (
    select
      'assignment:' || source.id::text as event_id,
      'assignment_due'::text as event_kind,
      coalesce(nullif(source.schedule_snapshot ->> 'endDate', '')::date, source.session_end_date) as starts_on,
      coalesce(nullif(source.schedule_snapshot ->> 'endDate', '')::date, source.session_end_date) as ends_on,
      source.assignment_title || ' due' as title,
      coalesce(nullif(source.schedule_snapshot ->> 'sessionTitle', ''), source.course_title) as detail,
      source.course_id,
      source.classroom_id,
      source.course_title,
      source.tutor_id,
      source.tutor_name,
      source.subject_name,
      source.focus_name,
      source.color_key,
      source.id as assignment_id
    from assignment_source source
    where coalesce(nullif(source.schedule_snapshot ->> 'endDate', '')::date, source.session_end_date)
      between p_range_start and p_range_end
  ),
  calendar_events as (
    select * from course_events
    union all select * from schedule_events
    union all select * from assignment_events
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.event_id,
    'kind', event.event_kind,
    'startsOn', event.starts_on,
    'endsOn', event.ends_on,
    'title', event.title,
    'detail', event.detail,
    'courseId', event.course_id,
    'classroomId', event.classroom_id,
    'courseTitle', event.course_title,
    'tutor', jsonb_build_object('id', event.tutor_id, 'name', event.tutor_name),
    'subject', event.subject_name,
    'focus', event.focus_name,
    'colorKey', event.color_key,
    'action', case when event.assignment_id is null then null else jsonb_build_object(
      'type', 'open_practice', 'assignmentId', event.assignment_id
    ) end
  ) order by event.starts_on, case event.event_kind
    when 'course_start' then 0
    when 'schedule_milestone' then 1
    when 'assignment_due' then 2
    else 3 end, lower(event.title), event.event_id), '[]'::jsonb)
  into calendar_events_payload
  from calendar_events event;

  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', context.course_id,
    'classroomId', context.classroom_id,
    'courseTitle', context.course_title,
    'tutor', jsonb_build_object('id', context.tutor_id, 'name', context.tutor_name),
    'subject', context.subject_name,
    'focus', context.focus_name,
    'colorKey', context.color_key
  ) order by lower(context.tutor_name), lower(context.course_title), context.course_id), '[]'::jsonb)
  into availability_contexts
  from (
    select
      course.id as course_id,
      classroom.id as classroom_id,
      course.title as course_title,
      tutor.id as tutor_id,
      coalesce(nullif(btrim(tutor.full_name), ''), 'Tutor') as tutor_name,
      subject.name as subject_name,
      focus.name as focus_name,
      coalesce(card.color_key, 'ocean') as color_key
    from public.student_courses course
    join public.classrooms classroom on classroom.course_id = course.id
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
      and membership.user_id = caller_id
      and membership.membership_role = 'student'
      and membership.status = 'active'
    join public.profiles tutor on tutor.id = course.tutor_id
    join public.curriculum_nodes subject on subject.id = course.subject_node_id
    join public.curriculum_nodes focus on focus.id = course.focus_node_id
    left join public.student_classroom_card_preferences card
      on card.user_id = caller_id and card.classroom_id = classroom.id
    where course.student_id = caller_id
      and course.status in ('active', 'wind_down')
      and classroom.status = 'active'
  ) context;

  return jsonb_build_object(
    'schemaVersion', 1,
    'range', jsonb_build_object(
      'startDate', p_range_start,
      'endDate', p_range_end,
      'timeZone', viewer_time_zone
    ),
    'events', calendar_events_payload,
    'availabilityOverlay', jsonb_build_object(
      'status', 'contract_only_phase_2e',
      'eligibleContexts', availability_contexts
    ),
    'featureStatus', jsonb_build_object(
      'calendarProjection', 'active_phase_2e',
      'scheduledClasses', 'pending_calendar_phase',
      'availabilitySlots', 'contract_only_phase_2e',
      'lessonRequests', 'pending_calendar_phase',
      'bookingConcurrency', 'pending_calendar_phase'
    )
  );
end;
$$;

revoke all on function public.learning_schedule_json(uuid) from public, anon, authenticated;
revoke all on function public.upsert_student_course_learning_schedule(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_my_student_calendar(date, date) from public, anon, authenticated;
grant execute on function public.upsert_student_course_learning_schedule(uuid, jsonb) to authenticated;
grant execute on function public.get_my_student_calendar(date, date) to authenticated;

comment on function public.upsert_student_course_learning_schedule(uuid, jsonb) is
  'Mentor/admin bridge that versions an existing generated learning schedule under one runtime Student Course.';
comment on function public.get_my_student_calendar(date, date) is
  'Bounded Student-only Calendar projection. Unlinked schedules are excluded; availability and booking remain explicit deferred contracts.';

create or replace function public.get_my_student_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  profile_record public.profiles%rowtype;
  preference_record public.student_dashboard_preferences%rowtype;
  classrooms jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to load this Dashboard.';
  end if;

  select * into profile_record from public.profiles where id = caller_id;
  if not found then
    raise exception 'The authenticated Student Profile is unavailable.';
  end if;

  select * into preference_record
  from public.student_dashboard_preferences
  where user_id = caller_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', course.id,
    'courseTitle', course.title,
    'courseStatus', course.status,
    'serviceModel', course.service_model,
    'startDate', course.start_date,
    'scheduledEndDate', course.scheduled_end_date,
    'subject', jsonb_build_object('id', subject.id, 'name', subject.name),
    'focus', jsonb_build_object('id', focus.id, 'name', focus.name),
    'tutor', jsonb_build_object('id', tutor.id, 'name', tutor.full_name),
    'classroom', jsonb_build_object(
      'id', classroom.id,
      'status', classroom.status,
      'membershipRole', membership.membership_role
    ),
    'card', jsonb_build_object(
      'colorKey', coalesce(card.color_key, 'ocean'),
      'position', card.position
    )
  ) order by
    coalesce(card.position, 2147483647),
    course.title,
    classroom.id
  ), '[]'::jsonb) into classrooms
  from public.classroom_memberships membership
  join public.classrooms classroom on classroom.id = membership.classroom_id
  join public.student_courses course on course.id = classroom.course_id
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  left join public.student_classroom_card_preferences card
    on card.user_id = caller_id and card.classroom_id = classroom.id
  where membership.user_id = caller_id
    and membership.membership_role = 'student'
    and membership.status = 'active'
    and classroom.status = 'active'
    and course.student_id = caller_id
    and course.status in ('active', 'wind_down');

  return jsonb_build_object(
    'schemaVersion', 4,
    'viewer', jsonb_build_object(
      'id', profile_record.id,
      'name', profile_record.full_name
    ),
    'preferences', jsonb_build_object(
      'blockOrder', coalesce(to_jsonb(preference_record.block_order), '["calendar","classrooms"]'::jsonb),
      'calendarView', coalesce(preference_record.calendar_view, 'month'),
      'collapsedBlocks', coalesce(to_jsonb(preference_record.collapsed_blocks), '[]'::jsonb),
      'revision', coalesce(preference_record.revision, 1),
      'updatedAt', preference_record.updated_at
    ),
    'classrooms', classrooms,
    'featureStatus', jsonb_build_object(
      'classroomCards', 'active_phase_2d',
      'classroomSpace', 'foundation_phase_2d',
      'calendarData', 'active_phase_2e',
      'credits', 'pending_credit_phase'
    )
  );
end;
$$;

revoke all on function public.get_my_student_dashboard() from public, anon, authenticated;
grant execute on function public.get_my_student_dashboard() to authenticated;

notify pgrst, 'reload schema';
