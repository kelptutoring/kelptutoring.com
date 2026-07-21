insert into public.authorization_capabilities (capability_key, description)
values ('course.assign', 'Assign an immutable course snapshot to a student schedule session.')
on conflict (capability_key) do update set description = excluded.description;

insert into public.role_capabilities (role_key, capability_key)
values
  ('mentor', 'course.assign'),
  ('admin', 'course.assign')
on conflict do nothing;

create table if not exists public.learning_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  source_key text not null,
  name text not null,
  time_zone text not null,
  status text not null default 'active',
  source_schema_version integer not null default 1,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint learning_schedules_source_key_present check (btrim(source_key) <> ''),
  constraint learning_schedules_name_present check (btrim(name) <> ''),
  constraint learning_schedules_name_length check (char_length(name) <= 180),
  constraint learning_schedules_time_zone_length check (char_length(time_zone) <= 100),
  constraint learning_schedules_status_check check (status in ('active', 'archived')),
  constraint learning_schedules_snapshot_object check (jsonb_typeof(source_snapshot) = 'object'),
  constraint learning_schedules_archive_consistency check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ),
  constraint learning_schedules_student_source_key unique (student_id, source_key)
);

create table if not exists public.learning_schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.learning_schedules(id) on delete cascade,
  source_key text not null,
  title text not null,
  scheduled_date date not null,
  end_date date not null,
  position integer not null,
  status text not null default 'active',
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_schedule_sessions_source_key_present check (btrim(source_key) <> ''),
  constraint learning_schedule_sessions_title_present check (btrim(title) <> ''),
  constraint learning_schedule_sessions_title_length check (char_length(title) <= 240),
  constraint learning_schedule_sessions_date_order check (end_date >= scheduled_date),
  constraint learning_schedule_sessions_position_check check (position >= 0),
  constraint learning_schedule_sessions_status_check check (status in ('active', 'removed')),
  constraint learning_schedule_sessions_snapshot_object check (jsonb_typeof(source_snapshot) = 'object'),
  constraint learning_schedule_sessions_schedule_source_key unique (schedule_id, source_key)
);

create table if not exists public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.course_compositions(id) on delete set null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  student_id uuid not null references auth.users(id) on delete cascade,
  schedule_session_id uuid not null references public.learning_schedule_sessions(id) on delete restrict,
  status text not null default 'assigned',
  course_title text not null,
  course_description text not null default '',
  curriculum_path_snapshot jsonb not null default '[]'::jsonb,
  schedule_snapshot jsonb not null,
  question_count integer not null,
  total_points numeric not null default 0,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint course_assignments_status_check check (status in ('assigned', 'completed', 'cancelled')),
  constraint course_assignments_title_present check (btrim(course_title) <> ''),
  constraint course_assignments_question_count_check check (question_count > 0 and question_count <= 300),
  constraint course_assignments_total_points_check check (total_points >= 0),
  constraint course_assignments_curriculum_path_array check (jsonb_typeof(curriculum_path_snapshot) = 'array'),
  constraint course_assignments_schedule_snapshot_object check (jsonb_typeof(schedule_snapshot) = 'object'),
  constraint course_assignments_lifecycle_check check (
    (status = 'assigned' and completed_at is null and cancelled_at is null)
    or (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create unique index if not exists course_assignments_active_course_session_key
on public.course_assignments (course_id, student_id, schedule_session_id)
where status <> 'cancelled' and course_id is not null;

create table if not exists public.course_assignment_items (
  assignment_id uuid not null references public.course_assignments(id) on delete cascade,
  position integer not null,
  source_question_id text not null,
  difficulty text not null,
  question_type_tags text[] not null default array[]::text[],
  points numeric not null default 0,
  delivery_snapshot jsonb not null,
  grading_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (assignment_id, position),
  constraint course_assignment_items_source_present check (btrim(source_question_id) <> ''),
  constraint course_assignment_items_position_check check (position >= 0),
  constraint course_assignment_items_difficulty_check check (
    difficulty in ('very-easy', 'easy', 'difficult', 'very-difficult', 'challenge')
  ),
  constraint course_assignment_items_points_check check (points >= 0),
  constraint course_assignment_items_delivery_object check (jsonb_typeof(delivery_snapshot) = 'object'),
  constraint course_assignment_items_grading_object check (jsonb_typeof(grading_snapshot) = 'object'),
  constraint course_assignment_items_assignment_question_key unique (assignment_id, source_question_id)
);

create table if not exists public.course_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.course_assignments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  attempt_number integer not null,
  status text not null default 'in_progress',
  responses jsonb not null default '{}'::jsonb,
  result_summary jsonb,
  auto_score numeric not null default 0,
  auto_max_points numeric not null default 0,
  pending_review_count integer not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint course_practice_attempts_number_check check (attempt_number > 0),
  constraint course_practice_attempts_status_check check (status in ('in_progress', 'submitted')),
  constraint course_practice_attempts_responses_object check (jsonb_typeof(responses) = 'object'),
  constraint course_practice_attempts_result_object check (
    result_summary is null or jsonb_typeof(result_summary) = 'object'
  ),
  constraint course_practice_attempts_score_check check (
    auto_score >= 0 and auto_max_points >= 0 and auto_score <= auto_max_points
  ),
  constraint course_practice_attempts_pending_check check (pending_review_count >= 0),
  constraint course_practice_attempts_lifecycle_check check (
    (status = 'in_progress' and submitted_at is null and result_summary is null)
    or (status = 'submitted' and submitted_at is not null and result_summary is not null)
  ),
  constraint course_practice_attempts_assignment_attempt_key unique (
    assignment_id, student_id, attempt_number
  )
);

create unique index if not exists course_practice_attempts_one_open_idx
on public.course_practice_attempts (assignment_id, student_id)
where status = 'in_progress';

create index if not exists learning_schedules_student_idx
on public.learning_schedules (student_id, status, updated_at desc);

create index if not exists learning_schedule_sessions_date_idx
on public.learning_schedule_sessions (schedule_id, status, scheduled_date, position);

create index if not exists course_assignments_student_idx
on public.course_assignments (student_id, status, assigned_at desc);

create index if not exists course_assignments_author_idx
on public.course_assignments (assigned_by, course_id, assigned_at desc);

create index if not exists course_practice_attempts_student_idx
on public.course_practice_attempts (student_id, assignment_id, attempt_number desc);

create or replace function public.course_assignment_delivery_question(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_snapshot -> 'id',
    'name', p_snapshot -> 'name',
    'prompt', p_snapshot -> 'prompt',
    'type', p_snapshot -> 'type',
    'points', p_snapshot -> 'points',
    'options', p_snapshot -> 'options',
    'optionGraphs', p_snapshot -> 'optionGraphs',
    'optionImages', p_snapshot -> 'optionImages',
    'imageBeforeText', p_snapshot -> 'imageBeforeText',
    'imageData', p_snapshot -> 'imageData',
    'imageAlt', p_snapshot -> 'imageAlt',
    'imageCaption', p_snapshot -> 'imageCaption',
    'imageAfterText', p_snapshot -> 'imageAfterText',
    'graphBeforeText', p_snapshot -> 'graphBeforeText',
    'graphAfterText', p_snapshot -> 'graphAfterText',
    'graphImageData', p_snapshot -> 'graphImageData',
    'graph', p_snapshot -> 'graph',
    'questionTypeTags', p_snapshot -> 'questionTypeTags',
    'curriculumNodeIds', p_snapshot -> 'curriculumNodeIds',
    'primaryCurriculumNodeId', p_snapshot -> 'primaryCurriculumNodeId',
    'numericAngleMode', p_snapshot -> 'numericAngleMode',
    'numericRequireUnit', p_snapshot -> 'numericRequireUnit',
    'numericUnit', p_snapshot -> 'numericUnit'
  ));
$$;

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

create or replace function public.list_course_assignment_students()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.assign')
  then
    raise exception 'Your assigned roles cannot assign course practice.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', profile.id,
    'fullName', coalesce(nullif(btrim(profile.full_name), ''), profile.email, 'Student'),
    'email', profile.email
  ) order by lower(coalesce(nullif(btrim(profile.full_name), ''), profile.email)), profile.id), '[]'::jsonb)
  into result
  from public.profiles profile
  where exists (
    select 1 from public.user_roles role
    where role.user_id = profile.id and role.role_key = 'student' and role.status = 'active'
  );
  return result;
end;
$$;

create or replace function public.upsert_student_learning_schedule(
  p_student_id uuid,
  p_schedule jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  target_schedule_id uuid;
  existing_creator uuid;
  normalized_source_key text := btrim(coalesce(p_schedule ->> 'id', ''));
  normalized_name text := btrim(coalesce(p_schedule ->> 'name', ''));
  normalized_time_zone text := btrim(coalesce(p_schedule ->> 'timeZone', ''));
  sessions jsonb := coalesce(p_schedule -> 'sessions', '[]'::jsonb);
  raw_session jsonb;
  ordinal bigint;
  session_source_key text;
  session_title text;
  session_start date;
  session_end date;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.assign')
  then
    raise exception 'Your assigned roles cannot synchronize student schedules.';
  end if;
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'A generated schedule object is required.';
  end if;
  if p_student_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_student_id and role_key = 'student' and status = 'active'
  ) then
    raise exception 'Choose an account with an active student role.';
  end if;
  if normalized_source_key = '' or char_length(normalized_source_key) > 180 then
    raise exception 'The generated schedule requires a stable source ID.';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 180 then
    raise exception 'The generated schedule requires a name.';
  end if;
  if normalized_time_zone = '' or not exists (
    select 1 from pg_timezone_names where name = normalized_time_zone
  ) then
    raise exception 'The generated schedule requires a valid IANA timezone.';
  end if;
  if jsonb_typeof(sessions) <> 'array' or jsonb_array_length(sessions) < 1
    or jsonb_array_length(sessions) > 500
  then
    raise exception 'A synchronized schedule must contain between 1 and 500 sessions.';
  end if;
  if jsonb_array_length(sessions) <> (
    select count(distinct btrim(value ->> 'id'))
    from jsonb_array_elements(sessions)
    where btrim(coalesce(value ->> 'id', '')) <> ''
  ) then
    raise exception 'Every synchronized session requires a unique source ID.';
  end if;

  select id, created_by into target_schedule_id, existing_creator
  from public.learning_schedules
  where student_id = p_student_id and source_key = normalized_source_key;

  if found and existing_creator <> caller_id
    and not public.authorization_user_has_capability(caller_id, 'authorization.manage')
  then
    raise exception 'This student schedule is managed by another authorized employee.';
  end if;

  if target_schedule_id is null then target_schedule_id := gen_random_uuid(); end if;

  insert into public.learning_schedules (
    id, student_id, created_by, source_key, name, time_zone, status,
    source_schema_version, source_snapshot, created_at, updated_at, archived_at
  ) values (
    target_schedule_id, p_student_id, caller_id, normalized_source_key, normalized_name,
    normalized_time_zone, 'active', greatest(coalesce((p_schedule ->> 'schemaVersion')::integer, 1), 1),
    p_schedule, now(), now(), null
  )
  on conflict (id) do update set
    name = excluded.name,
    time_zone = excluded.time_zone,
    status = 'active',
    source_schema_version = excluded.source_schema_version,
    source_snapshot = excluded.source_snapshot,
    updated_at = now(),
    archived_at = null;

  update public.learning_schedule_sessions
  set status = 'removed', updated_at = now()
  where schedule_id = target_schedule_id;

  for raw_session, ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(sessions) with ordinality as item(value, ordinality)
  loop
    session_source_key := btrim(coalesce(raw_session ->> 'id', ''));
    session_title := btrim(coalesce(raw_session ->> 'title', ''));
    if session_title = '' then session_title := 'Untitled session'; end if;
    if char_length(session_title) > 240 then
      raise exception 'A synchronized session title is too long.';
    end if;
    begin
      session_start := nullif(coalesce(raw_session ->> 'startDate', raw_session ->> 'date'), '')::date;
      session_end := coalesce(
        nullif(raw_session ->> 'endDate', '')::date,
        session_start
      );
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Every synchronized session requires valid start and end dates.';
    end;
    if session_start is null or session_end < session_start then
      raise exception 'Every synchronized session requires an ordered date range.';
    end if;

    insert into public.learning_schedule_sessions (
      schedule_id, source_key, title, scheduled_date, end_date, position,
      status, source_snapshot, created_at, updated_at
    ) values (
      target_schedule_id, session_source_key, session_title, session_start, session_end,
      ordinal::integer - 1, 'active', raw_session, now(), now()
    )
    on conflict (schedule_id, source_key) do update set
      title = excluded.title,
      scheduled_date = excluded.scheduled_date,
      end_date = excluded.end_date,
      position = excluded.position,
      status = 'active',
      source_snapshot = excluded.source_snapshot,
      updated_at = now();
  end loop;

  return public.learning_schedule_json(target_schedule_id);
exception when invalid_text_representation then
  raise exception 'The generated schedule schema version is invalid.';
end;
$$;

create or replace function public.list_student_learning_sessions(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.assign')
  then
    raise exception 'Your assigned roles cannot read student schedule sessions.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', session.id,
    'scheduleId', schedule.id,
    'scheduleName', schedule.name,
    'timeZone', schedule.time_zone,
    'sourceKey', session.source_key,
    'title', session.title,
    'scheduledDate', session.scheduled_date,
    'endDate', session.end_date,
    'position', session.position
  ) order by session.scheduled_date, session.position, session.id), '[]'::jsonb)
  into result
  from public.learning_schedule_sessions session
  join public.learning_schedules schedule on schedule.id = session.schedule_id
  where schedule.student_id = p_student_id
    and schedule.status = 'active'
    and session.status = 'active';
  return result;
end;
$$;

create or replace function public.assign_course_to_schedule_session(
  p_course_id uuid,
  p_student_id uuid,
  p_schedule_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  source_course public.course_compositions%rowtype;
  target_session record;
  assignment_id uuid := gen_random_uuid();
  item_count integer;
  eligible_count integer;
  point_total numeric;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.assign')
  then
    raise exception 'Your assigned roles cannot assign course practice.';
  end if;
  select * into source_course
  from public.course_compositions
  where id = p_course_id and owner_id = caller_id and status = 'active';
  if not found then raise exception 'Open and save one of your active courses before assigning it.'; end if;

  select
    session.id, session.title, session.scheduled_date, session.end_date,
    schedule.id as schedule_id, schedule.name as schedule_name, schedule.time_zone,
    schedule.student_id
  into target_session
  from public.learning_schedule_sessions session
  join public.learning_schedules schedule on schedule.id = session.schedule_id
  where session.id = p_schedule_session_id
    and session.status = 'active'
    and schedule.status = 'active'
    and schedule.student_id = p_student_id;
  if not found then raise exception 'Choose an active session from the selected student schedule.'; end if;

  select count(*) into item_count
  from public.course_composition_items where course_id = source_course.id;
  if item_count < 1 then raise exception 'Add at least one approved question before assigning this course.'; end if;

  select count(*) into eligible_count
  from public.course_composition_items item
  join public.exam_questions question on question.id = item.question_id
  join public.exam_definitions exam on exam.id = question.exam_id
  where item.course_id = source_course.id
    and exam.status = 'active' and exam.review_status = 'approved' and exam.visibility = 'public'
    and question.review_status = 'approved' and question.classification_status = 'reviewed';
  if eligible_count <> item_count then
    raise exception 'One or more course questions are no longer eligible for assignment.';
  end if;

  if exists (
    select 1 from public.course_assignments
    where course_id = source_course.id and student_id = p_student_id
      and schedule_session_id = p_schedule_session_id and status <> 'cancelled'
  ) then
    raise exception 'This course is already assigned to the selected student session.';
  end if;

  select coalesce(sum(case
    when coalesce(question.content ->> 'points', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (question.content ->> 'points')::numeric
    else 0 end), 0)
  into point_total
  from public.course_composition_items item
  join public.exam_questions question on question.id = item.question_id
  where item.course_id = source_course.id;

  insert into public.course_assignments (
    id, course_id, assigned_by, student_id, schedule_session_id, status,
    course_title, course_description, curriculum_path_snapshot, schedule_snapshot,
    question_count, total_points, assigned_at, updated_at
  ) values (
    assignment_id, source_course.id, caller_id, p_student_id, p_schedule_session_id, 'assigned',
    source_course.title, source_course.description,
    public.curriculum_node_path_json(source_course.primary_curriculum_node_id),
    jsonb_build_object(
      'scheduleId', target_session.schedule_id,
      'scheduleName', target_session.schedule_name,
      'sessionId', target_session.id,
      'sessionTitle', target_session.title,
      'scheduledDate', target_session.scheduled_date,
      'endDate', target_session.end_date,
      'timeZone', target_session.time_zone
    ),
    item_count, point_total, now(), now()
  );

  insert into public.course_assignment_items (
    assignment_id, position, source_question_id, difficulty, question_type_tags,
    points, delivery_snapshot, grading_snapshot, created_at
  )
  select
    assignment_id,
    item.position,
    question.id,
    question.difficulty,
    question.question_type_tags,
    case when coalesce(question.content ->> 'points', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (question.content ->> 'points')::numeric else 0 end,
    public.course_assignment_delivery_question(question.content),
    question.content,
    now()
  from public.course_composition_items item
  join public.exam_questions question on question.id = item.question_id
  where item.course_id = source_course.id
  order by item.position;

  return jsonb_build_object(
    'id', assignment_id,
    'courseId', source_course.id,
    'courseTitle', source_course.title,
    'studentId', p_student_id,
    'studentName', (select coalesce(nullif(btrim(full_name), ''), email, 'Student') from public.profiles where id = p_student_id),
    'status', 'assigned',
    'schedule', (select schedule_snapshot from public.course_assignments where id = assignment_id),
    'questionCount', item_count,
    'totalPoints', point_total,
    'assignedAt', now()
  );
end;
$$;

create or replace function public.list_my_course_assignments(
  p_course_id uuid default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  result jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.assign')
  then
    raise exception 'Your assigned roles cannot read course assignments.';
  end if;
  if normalized_status is not null and normalized_status not in ('assigned', 'completed', 'cancelled') then
    raise exception 'The assignment status filter is invalid.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment.id,
    'courseId', assignment.course_id,
    'courseTitle', assignment.course_title,
    'studentId', assignment.student_id,
    'studentName', coalesce(nullif(btrim(profile.full_name), ''), profile.email, 'Student'),
    'studentEmail', profile.email,
    'status', assignment.status,
    'schedule', assignment.schedule_snapshot,
    'questionCount', assignment.question_count,
    'totalPoints', assignment.total_points,
    'assignedAt', assignment.assigned_at,
    'completedAt', assignment.completed_at,
    'cancelledAt', assignment.cancelled_at
  ) order by assignment.assigned_at desc, assignment.id), '[]'::jsonb)
  into result
  from public.course_assignments assignment
  left join public.profiles profile on profile.id = assignment.student_id
  where assignment.assigned_by = caller_id
    and (p_course_id is null or assignment.course_id = p_course_id)
    and (normalized_status is null or assignment.status = normalized_status);
  return result;
end;
$$;

create or replace function public.cancel_course_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  cancelled public.course_assignments%rowtype;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.assign')
  then
    raise exception 'Your assigned roles cannot cancel course assignments.';
  end if;
  update public.course_assignments
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = p_assignment_id and assigned_by = caller_id and status = 'assigned'
  returning * into cancelled;
  if not found then raise exception 'Only one of your uncompleted assignments can be cancelled.'; end if;
  return jsonb_build_object(
    'id', cancelled.id,
    'status', cancelled.status,
    'cancelledAt', cancelled.cancelled_at
  );
end;
$$;

create or replace function public.list_my_practice_assignments()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'practice.attempt')
  then
    raise exception 'Your assigned roles cannot open student practice.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment.id,
    'courseTitle', assignment.course_title,
    'courseDescription', assignment.course_description,
    'curriculumPath', assignment.curriculum_path_snapshot,
    'schedule', assignment.schedule_snapshot,
    'status', assignment.status,
    'questionCount', assignment.question_count,
    'totalPoints', assignment.total_points,
    'assignedAt', assignment.assigned_at,
    'completedAt', assignment.completed_at,
    'latestAttempt', lateral_attempt.summary
  ) order by
    coalesce((assignment.schedule_snapshot ->> 'scheduledDate')::date, assignment.assigned_at::date),
    assignment.assigned_at,
    assignment.id), '[]'::jsonb)
  into result
  from public.course_assignments assignment
  left join lateral (
    select jsonb_build_object(
      'id', attempt.id,
      'attemptNumber', attempt.attempt_number,
      'status', attempt.status,
      'autoScore', attempt.auto_score,
      'autoMaxPoints', attempt.auto_max_points,
      'pendingReviewCount', attempt.pending_review_count,
      'startedAt', attempt.started_at,
      'updatedAt', attempt.updated_at,
      'submittedAt', attempt.submitted_at
    ) as summary
    from public.course_practice_attempts attempt
    where attempt.assignment_id = assignment.id and attempt.student_id = caller_id
    order by attempt.attempt_number desc
    limit 1
  ) lateral_attempt on true
  where assignment.student_id = caller_id and assignment.status <> 'cancelled';
  return result;
end;
$$;

create or replace function public.get_my_practice_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'practice.attempt')
  then
    raise exception 'Your assigned roles cannot open student practice.';
  end if;
  select jsonb_build_object(
    'id', assignment.id,
    'courseTitle', assignment.course_title,
    'courseDescription', assignment.course_description,
    'curriculumPath', assignment.curriculum_path_snapshot,
    'schedule', assignment.schedule_snapshot,
    'status', assignment.status,
    'questionCount', assignment.question_count,
    'totalPoints', assignment.total_points,
    'assignedAt', assignment.assigned_at,
    'completedAt', assignment.completed_at,
    'questions', coalesce((
      select jsonb_agg(
        item.delivery_snapshot || jsonb_build_object(
          'id', item.source_question_id,
          'position', item.position,
          'difficulty', item.difficulty,
          'questionTypeTags', to_jsonb(item.question_type_tags),
          'points', item.points
        ) order by item.position
      )
      from public.course_assignment_items item
      where item.assignment_id = assignment.id
    ), '[]'::jsonb)
  ) into result
  from public.course_assignments assignment
  where assignment.id = p_assignment_id
    and assignment.student_id = caller_id
    and assignment.status <> 'cancelled';
  if result is null then raise exception 'The assigned practice activity could not be found.'; end if;
  return result;
end;
$$;

create or replace function public.start_or_resume_course_practice_attempt(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  attempt public.course_practice_attempts%rowtype;
  next_number integer;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'practice.attempt')
  then
    raise exception 'Your assigned roles cannot attempt student practice.';
  end if;
  if not exists (
    select 1 from public.course_assignments
    where id = p_assignment_id and student_id = caller_id and status in ('assigned', 'completed')
  ) then
    raise exception 'The assigned practice activity could not be opened.';
  end if;
  select * into attempt
  from public.course_practice_attempts
  where assignment_id = p_assignment_id and student_id = caller_id and status = 'in_progress'
  order by attempt_number desc limit 1;
  if not found then
    select coalesce(max(attempt_number), 0) + 1 into next_number
    from public.course_practice_attempts
    where assignment_id = p_assignment_id and student_id = caller_id;
    insert into public.course_practice_attempts (
      assignment_id, student_id, attempt_number, status, responses,
      auto_score, auto_max_points, pending_review_count, started_at, updated_at
    ) values (
      p_assignment_id, caller_id, next_number, 'in_progress', '{}'::jsonb,
      0, 0, 0, now(), now()
    ) returning * into attempt;
  end if;
  return jsonb_build_object(
    'id', attempt.id,
    'assignmentId', attempt.assignment_id,
    'attemptNumber', attempt.attempt_number,
    'status', attempt.status,
    'responses', attempt.responses,
    'startedAt', attempt.started_at,
    'updatedAt', attempt.updated_at
  );
end;
$$;

create or replace function public.validate_course_practice_responses(
  p_attempt_id uuid,
  p_responses jsonb,
  p_student_id uuid
)
returns public.course_practice_attempts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  attempt public.course_practice_attempts%rowtype;
  supplied_count integer;
  valid_count integer;
begin
  select * into attempt
  from public.course_practice_attempts
  where id = p_attempt_id and student_id = p_student_id and status = 'in_progress';
  if not found then raise exception 'The open practice attempt could not be found.'; end if;
  if p_responses is null or jsonb_typeof(p_responses) <> 'object' then
    raise exception 'Practice responses must be an object keyed by question ID.';
  end if;
  if pg_column_size(p_responses) > 1048576 then
    raise exception 'Practice responses exceed the one-megabyte limit.';
  end if;
  select count(*) into supplied_count from jsonb_object_keys(p_responses);
  select count(*) into valid_count
  from jsonb_object_keys(p_responses) response_key
  where exists (
    select 1 from public.course_assignment_items item
    where item.assignment_id = attempt.assignment_id and item.source_question_id = response_key
  );
  if supplied_count <> valid_count then
    raise exception 'Practice responses contain an unknown question ID.';
  end if;
  return attempt;
end;
$$;

create or replace function public.save_my_course_practice_progress(
  p_attempt_id uuid,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  attempt public.course_practice_attempts%rowtype;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'practice.attempt')
  then
    raise exception 'Your assigned roles cannot save student practice.';
  end if;
  attempt := public.validate_course_practice_responses(p_attempt_id, p_responses, caller_id);
  update public.course_practice_attempts
  set responses = p_responses, updated_at = now()
  where id = attempt.id
  returning * into attempt;
  return jsonb_build_object(
    'id', attempt.id,
    'assignmentId', attempt.assignment_id,
    'attemptNumber', attempt.attempt_number,
    'status', attempt.status,
    'responses', attempt.responses,
    'startedAt', attempt.started_at,
    'updatedAt', attempt.updated_at
  );
end;
$$;

create or replace function public.submit_my_course_practice_attempt(
  p_attempt_id uuid,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  attempt public.course_practice_attempts%rowtype;
  item public.course_assignment_items%rowtype;
  response_value jsonb;
  response_text text;
  expected_text text;
  base_type text;
  tolerance numeric;
  earned numeric := 0;
  auto_max numeric := 0;
  pending_count integer := 0;
  item_status text;
  item_earned numeric;
  result_items jsonb := '[]'::jsonb;
  expected_set jsonb;
  response_set jsonb;
  submitted_at_value timestamptz := now();
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'practice.attempt')
  then
    raise exception 'Your assigned roles cannot submit student practice.';
  end if;
  attempt := public.validate_course_practice_responses(p_attempt_id, p_responses, caller_id);

  for item in
    select * from public.course_assignment_items
    where assignment_id = attempt.assignment_id order by position
  loop
    response_value := p_responses -> item.source_question_id;
    response_text := case
      when response_value is null or response_value = 'null'::jsonb then ''
      when jsonb_typeof(response_value) in ('string', 'number', 'boolean') then response_value #>> '{}'
      else response_value::text
    end;
    base_type := lower(coalesce(item.grading_snapshot ->> 'type', 'short-answer'));
    item_status := 'unanswered';
    item_earned := 0;

    if base_type = 'true-false' or base_type like 'multiple-choice%' then
      auto_max := auto_max + item.points;
      expected_text := coalesce(item.grading_snapshot ->> 'correctOptionIndex', '');
      if response_text <> '' then
        item_status := case when response_text = expected_text then 'correct' else 'incorrect' end;
        if item_status = 'correct' then item_earned := item.points; end if;
      end if;
    elsif base_type like 'multiple-answer%' then
      auto_max := auto_max + item.points;
      if jsonb_typeof(response_value) = 'array'
        and jsonb_typeof(item.grading_snapshot -> 'correctOptionIndexes') = 'array'
      then
        select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into response_set
        from (select distinct value from jsonb_array_elements_text(response_value)) selected;
        select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into expected_set
        from (select distinct value from jsonb_array_elements_text(item.grading_snapshot -> 'correctOptionIndexes')) expected;
        item_status := case when response_set = expected_set then 'correct' else 'incorrect' end;
        if item_status = 'correct' then item_earned := item.points; end if;
      end if;
    elsif base_type = 'numeric' then
      expected_text := coalesce(nullif(item.grading_snapshot ->> 'numericExpectedAnswer', ''), item.grading_snapshot ->> 'answer', '');
      if expected_text ~ '^-?[0-9]+([.][0-9]+)?$' then
        auto_max := auto_max + item.points;
        tolerance := case
          when coalesce(item.grading_snapshot ->> 'numericTolerance', '') ~ '^[0-9]+([.][0-9]+)?([eE]-?[0-9]+)?$'
            then (item.grading_snapshot ->> 'numericTolerance')::numeric
          else 0.000001 end;
        if response_text ~ '^-?[0-9]+([.][0-9]+)?$' then
          item_status := case
            when abs(response_text::numeric - expected_text::numeric) <= tolerance then 'correct'
            else 'incorrect' end;
          if item_status = 'correct' then item_earned := item.points; end if;
        elsif response_text <> '' then
          item_status := 'incorrect';
        end if;
      elsif response_text <> '' then
        item_status := 'pending-review';
        pending_count := pending_count + 1;
      end if;
    elsif response_text <> '' then
      item_status := 'pending-review';
      pending_count := pending_count + 1;
    end if;

    earned := earned + item_earned;
    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'questionId', item.source_question_id,
      'position', item.position,
      'status', item_status,
      'earnedPoints', item_earned,
      'points', item.points
    ));
  end loop;

  update public.course_practice_attempts
  set
    status = 'submitted',
    responses = p_responses,
    result_summary = jsonb_build_object(
      'autoScore', earned,
      'autoMaxPoints', auto_max,
      'pendingReviewCount', pending_count,
      'items', result_items
    ),
    auto_score = earned,
    auto_max_points = auto_max,
    pending_review_count = pending_count,
    updated_at = submitted_at_value,
    submitted_at = submitted_at_value
  where id = attempt.id
  returning * into attempt;

  update public.course_assignments
  set status = 'completed', completed_at = coalesce(completed_at, submitted_at_value), updated_at = submitted_at_value
  where id = attempt.assignment_id and status = 'assigned';

  return jsonb_build_object(
    'id', attempt.id,
    'assignmentId', attempt.assignment_id,
    'attemptNumber', attempt.attempt_number,
    'status', attempt.status,
    'responses', attempt.responses,
    'result', attempt.result_summary,
    'startedAt', attempt.started_at,
    'submittedAt', attempt.submitted_at
  );
end;
$$;

alter table public.learning_schedules enable row level security;
alter table public.learning_schedule_sessions enable row level security;
alter table public.course_assignments enable row level security;
alter table public.course_assignment_items enable row level security;
alter table public.course_practice_attempts enable row level security;

revoke all on public.learning_schedules from anon, authenticated;
revoke all on public.learning_schedule_sessions from anon, authenticated;
revoke all on public.course_assignments from anon, authenticated;
revoke all on public.course_assignment_items from anon, authenticated;
revoke all on public.course_practice_attempts from anon, authenticated;

revoke all on function public.course_assignment_delivery_question(jsonb) from public, anon, authenticated;
revoke all on function public.learning_schedule_json(uuid) from public, anon, authenticated;
revoke all on function public.list_course_assignment_students() from public, anon, authenticated;
revoke all on function public.upsert_student_learning_schedule(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.list_student_learning_sessions(uuid) from public, anon, authenticated;
revoke all on function public.assign_course_to_schedule_session(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_my_course_assignments(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_course_assignment(uuid) from public, anon, authenticated;
revoke all on function public.list_my_practice_assignments() from public, anon, authenticated;
revoke all on function public.get_my_practice_assignment(uuid) from public, anon, authenticated;
revoke all on function public.start_or_resume_course_practice_attempt(uuid) from public, anon, authenticated;
revoke all on function public.validate_course_practice_responses(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.save_my_course_practice_progress(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_my_course_practice_attempt(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.list_course_assignment_students() to authenticated;
grant execute on function public.upsert_student_learning_schedule(uuid, jsonb) to authenticated;
grant execute on function public.list_student_learning_sessions(uuid) to authenticated;
grant execute on function public.assign_course_to_schedule_session(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_my_course_assignments(uuid, text) to authenticated;
grant execute on function public.cancel_course_assignment(uuid) to authenticated;
grant execute on function public.list_my_practice_assignments() to authenticated;
grant execute on function public.get_my_practice_assignment(uuid) to authenticated;
grant execute on function public.start_or_resume_course_practice_attempt(uuid) to authenticated;
grant execute on function public.save_my_course_practice_progress(uuid, jsonb) to authenticated;
grant execute on function public.submit_my_course_practice_attempt(uuid, jsonb) to authenticated;
