-- Phase 5.E.2: append-only Course progress with exact source pinning,
-- role-scoped mutation, item-level concurrency, and immutable reversals.

alter table public.course_schedule_items
  drop constraint if exists course_schedule_items_id_version_key,
  add constraint course_schedule_items_id_version_key unique (id, version_id);

alter table public.course_schedule_item_resources
  drop constraint if exists course_schedule_item_resources_id_item_key,
  add constraint course_schedule_item_resources_id_item_key unique (id, schedule_item_id);

create table if not exists public.course_progress_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  schedule_version_id uuid not null,
  schedule_item_id uuid not null,
  resource_id uuid,
  stable_item_key text not null,
  stable_resource_key text,
  target_kind text not null,
  progress_kind text not null,
  event_action text not null,
  related_event_id uuid references public.course_progress_events(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  reflection text,
  student_explanation text,
  private_staff_note text,
  target_snapshot jsonb not null,
  constraint course_progress_events_item_key_check check (
    btrim(stable_item_key) <> '' and char_length(stable_item_key) <= 180
  ),
  constraint course_progress_events_resource_key_check check (
    stable_resource_key is null
    or (btrim(stable_resource_key) <> '' and char_length(stable_resource_key) <= 240)
  ),
  constraint course_progress_events_target_check check (
    (target_kind = 'session' and resource_id is null and stable_resource_key is null)
    or
    (target_kind = 'resource' and resource_id is not null and stable_resource_key is not null)
  ),
  constraint course_progress_events_kind_check check (
    progress_kind in ('studied', 'reviewed', 'practiced')
  ),
  constraint course_progress_events_action_check check (
    event_action in ('marked', 'reversed', 'reflection_amended')
  ),
  constraint course_progress_events_relation_check check (
    (event_action = 'marked' and related_event_id is null)
    or
    (event_action in ('reversed', 'reflection_amended') and related_event_id is not null)
  ),
  constraint course_progress_events_actor_role_check check (
    actor_role in ('student', 'tutor', 'mentor')
  ),
  constraint course_progress_events_time_check check (effective_at <= recorded_at),
  constraint course_progress_events_reflection_check check (
    reflection is null or char_length(reflection) between 1 and 1000
  ),
  constraint course_progress_events_explanation_check check (
    student_explanation is null
    or char_length(btrim(student_explanation)) between 10 and 500
  ),
  constraint course_progress_events_private_note_check check (
    private_staff_note is null
    or char_length(btrim(private_staff_note)) between 1 and 2000
  ),
  constraint course_progress_events_snapshot_check check (
    jsonb_typeof(target_snapshot) = 'object'
  ),
  constraint course_progress_events_item_version_fkey foreign key (
    schedule_item_id, schedule_version_id
  ) references public.course_schedule_items(id, version_id) on delete restrict,
  constraint course_progress_events_resource_item_fkey foreign key (
    resource_id, schedule_item_id
  ) references public.course_schedule_item_resources(id, schedule_item_id) on delete restrict
);

create index if not exists course_progress_events_course_history_idx
on public.course_progress_events (course_id, recorded_at desc, id desc);

create index if not exists course_progress_events_target_history_idx
on public.course_progress_events (
  course_id,
  stable_item_key,
  coalesce(stable_resource_key, ''),
  progress_kind,
  recorded_at desc,
  id desc
);

create table if not exists public.course_progress_commands (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  command_kind text not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint course_progress_commands_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_progress_commands_kind_check check (
    command_kind in ('mark', 'reverse', 'amend_reflection')
  ),
  constraint course_progress_commands_request_check check (
    jsonb_typeof(request_payload) = 'object'
  ),
  constraint course_progress_commands_response_check check (
    jsonb_typeof(response_payload) = 'object'
  ),
  constraint course_progress_commands_actor_key unique (
    course_id, actor_user_id, idempotency_key
  )
);

create table if not exists public.course_progress_notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null references public.student_courses(id) on delete restrict,
  progress_event_id uuid not null references public.course_progress_events(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  constraint course_progress_notifications_type_check check (
    event_type in ('progress_studied_marked', 'progress_studied_reversed')
  ),
  constraint course_progress_notifications_payload_check check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint course_progress_notifications_read_check check (
    read_at is null or read_at >= created_at
  ),
  constraint course_progress_notifications_recipient_event_key unique (
    recipient_user_id, progress_event_id, event_type
  )
);

create index if not exists course_progress_notifications_recipient_idx
on public.course_progress_notification_events (recipient_user_id, created_at desc, id);

create or replace function public.reject_course_progress_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Course progress history is append-only.';
end;
$$;

create or replace function public.validate_course_progress_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  item_record public.course_schedule_items%rowtype;
  resource_record public.course_schedule_item_resources%rowtype;
  related_record public.course_progress_events%rowtype;
begin
  select course.* into course_record
  from public.student_courses course
  where course.id = new.course_id;
  if not found then raise exception 'The Course progress event Course does not exist.'; end if;

  select item.* into item_record
  from public.course_schedule_items item
  join public.course_schedule_versions version on version.id = item.version_id
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where item.id = new.schedule_item_id
    and item.version_id = new.schedule_version_id
    and schedule.course_id = new.course_id;
  if not found then
    raise exception 'The Course progress target does not belong to the Course Schedule.';
  end if;
  if item_record.item_kind <> 'curriculum_topic'
    or item_record.stable_item_key <> new.stable_item_key then
    raise exception 'The Course progress Session identity is invalid.';
  end if;

  if new.target_kind = 'resource' then
    select resource.* into resource_record
    from public.course_schedule_item_resources resource
    where resource.id = new.resource_id
      and resource.schedule_item_id = new.schedule_item_id;
    if not found
      or resource_record.stable_resource_key <> new.stable_resource_key
      or resource_record.requirement_state = 'not_assigned' then
      raise exception 'The Course progress resource identity is invalid.';
    end if;
  end if;

  if public.course_progress_actor_role(course_record, new.actor_user_id)
    is distinct from new.actor_role then
    raise exception 'The Course progress actor role is invalid.';
  end if;

  if new.actor_role = 'student' then
    if new.event_action = 'reversed' and new.progress_kind = 'studied' then
      raise exception 'Students cannot reverse Studied progress.';
    end if;
    if new.private_staff_note is not null then
      raise exception 'Students cannot create private academic staff notes.';
    end if;
  else
    if new.target_kind <> 'session' or new.progress_kind <> 'studied' then
      raise exception 'Academic staff progress events are limited to Session-level Studied progress.';
    end if;
    if new.reflection is not null then
      raise exception 'Progress reflections remain Student-controlled.';
    end if;
  end if;

  if new.event_action = 'reflection_amended'
    and new.actor_role <> 'student' then
    raise exception 'Only Students may amend progress reflections.';
  end if;

  if new.related_event_id is not null then
    select * into related_record
    from public.course_progress_events event
    where event.id = new.related_event_id;
    if not found
      or related_record.course_id <> new.course_id
      or related_record.stable_item_key <> new.stable_item_key
      or related_record.stable_resource_key is distinct from new.stable_resource_key
      or related_record.progress_kind <> new.progress_kind then
      raise exception 'The related Course progress event is invalid.';
    end if;
    if new.event_action = 'reversed' and related_record.event_action <> 'marked' then
      raise exception 'A progress reversal must reference the active mark.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_course_progress_event
on public.course_progress_events;
create trigger validate_course_progress_event
before insert on public.course_progress_events
for each row execute function public.validate_course_progress_event();

drop trigger if exists course_progress_events_immutable
on public.course_progress_events;
create trigger course_progress_events_immutable
before update or delete on public.course_progress_events
for each row execute function public.reject_course_progress_mutation();

drop trigger if exists course_progress_commands_immutable
on public.course_progress_commands;
create trigger course_progress_commands_immutable
before update or delete on public.course_progress_commands
for each row execute function public.reject_course_progress_mutation();

create or replace function public.course_progress_latest_event_id(
  p_course_id uuid,
  p_stable_item_key text,
  p_stable_resource_key text,
  p_progress_kind text
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select event.id
  from public.course_progress_events event
  where event.course_id = p_course_id
    and event.stable_item_key = p_stable_item_key
    and event.stable_resource_key is not distinct from p_stable_resource_key
    and event.progress_kind = p_progress_kind
  order by event.recorded_at desc, event.id desc
  limit 1;
$$;

create or replace function public.course_progress_active_mark(
  p_course_id uuid,
  p_stable_item_key text,
  p_stable_resource_key text,
  p_progress_kind text
)
returns public.course_progress_events
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select transition
  from public.course_progress_events transition
  where transition.course_id = p_course_id
    and transition.stable_item_key = p_stable_item_key
    and transition.stable_resource_key is not distinct from p_stable_resource_key
    and transition.progress_kind = p_progress_kind
    and transition.event_action in ('marked', 'reversed')
  order by transition.recorded_at desc, transition.id desc
  limit 1;
$$;

create or replace function public.course_progress_target_is_marked(
  p_course_id uuid,
  p_stable_item_key text,
  p_stable_resource_key text,
  p_progress_kind text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select transition.event_action = 'marked'
    from public.course_progress_events transition
    where transition.course_id = p_course_id
      and transition.stable_item_key = p_stable_item_key
      and transition.stable_resource_key is not distinct from p_stable_resource_key
      and transition.progress_kind = p_progress_kind
      and transition.event_action in ('marked', 'reversed')
    order by transition.recorded_at desc, transition.id desc
    limit 1
  ), false);
$$;

create or replace function public.course_progress_actor_role(
  p_course public.student_courses,
  p_actor_id uuid
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_actor_id = p_course.student_id then 'student'
    when p_actor_id = p_course.tutor_id then 'tutor'
    when p_actor_id = p_course.mentor_id then 'mentor'
    else null
  end;
$$;

create or replace function public.course_progress_reason_is_valid(p_reason text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select char_length(btrim(coalesce(p_reason, ''))) between 10 and 500;
$$;

create or replace function public.insert_course_progress_notifications(
  p_event public.course_progress_events
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  notification_type text;
begin
  if p_event.progress_kind <> 'studied'
    or p_event.event_action not in ('marked', 'reversed') then
    return;
  end if;

  select * into course_record
  from public.student_courses
  where id = p_event.course_id;

  notification_type := case p_event.event_action
    when 'marked' then 'progress_studied_marked'
    else 'progress_studied_reversed'
  end;

  insert into public.course_progress_notification_events (
    recipient_user_id,
    actor_user_id,
    course_id,
    progress_event_id,
    event_type,
    payload
  )
  select
    recipient.user_id,
    p_event.actor_user_id,
    p_event.course_id,
    p_event.id,
    notification_type,
    jsonb_build_object(
      'scheduleItemId', p_event.schedule_item_id,
      'stableItemKey', p_event.stable_item_key,
      'targetKind', p_event.target_kind,
      'stableResourceKey', p_event.stable_resource_key,
      'effectiveAt', p_event.effective_at,
      'actorRole', p_event.actor_role
    )
  from (
    select p_event.actor_user_id as user_id
    union select course_record.student_id
    union select course_record.tutor_id
  ) recipient
  where recipient.user_id is not null
  on conflict (recipient_user_id, progress_event_id, event_type) do nothing;
end;
$$;

create or replace function public.record_course_progress(
  p_course_id uuid,
  p_schedule_item_id uuid,
  p_resource_id uuid,
  p_progress_kind text,
  p_expected_latest_event_id uuid,
  p_effective_at timestamptz,
  p_reflection text,
  p_student_explanation text,
  p_private_staff_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  item_record public.course_schedule_items%rowtype;
  resource_record public.course_schedule_item_resources%rowtype;
  existing_command public.course_progress_commands%rowtype;
  active_mark public.course_progress_events%rowtype;
  inserted_event public.course_progress_events%rowtype;
  actor_role text;
  normalized_kind text := lower(btrim(coalesce(p_progress_kind, '')));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  normalized_reflection text := nullif(btrim(coalesce(p_reflection, '')), '');
  normalized_explanation text := nullif(btrim(coalesce(p_student_explanation, '')), '');
  normalized_private_note text := nullif(btrim(coalesce(p_private_staff_note, '')), '');
  target_resource_key text;
  target_kind text;
  latest_event_id uuid;
  expected_item_key text;
  effective_time timestamptz;
  server_time timestamptz := clock_timestamp();
  schedule_time_zone text;
  reason_required boolean := false;
  request_payload jsonb;
  response_payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to record Course progress.';
  end if;
  if p_course_id is null or p_schedule_item_id is null then
    raise exception 'A Course and active Schedule item are required.';
  end if;
  if normalized_kind not in ('studied', 'reviewed', 'practiced') then
    raise exception 'The Course progress kind is invalid.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Course progress idempotency key is invalid.';
  end if;
  if normalized_reflection is not null and char_length(normalized_reflection) > 1000 then
    raise exception 'A progress reflection may contain at most 1000 characters.';
  end if;
  if normalized_private_note is not null and char_length(normalized_private_note) > 2000 then
    raise exception 'A private staff note may contain at most 2000 characters.';
  end if;

  request_payload := jsonb_build_object(
    'courseId', p_course_id,
    'scheduleItemId', p_schedule_item_id,
    'resourceId', p_resource_id,
    'progressKind', normalized_kind,
    'expectedLatestEventId', p_expected_latest_event_id,
    'effectiveAt', p_effective_at,
    'reflection', normalized_reflection,
    'studentExplanation', normalized_explanation,
    'privateStaffNote', normalized_private_note
  );

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for share;
  if not found then raise exception 'The Course does not exist.'; end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  if actor_role is null then
    raise exception 'Only the Student, assigned Tutor, or Course Mentor may record Course progress.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-progress-command', p_course_id::text, caller_id::text, normalized_key),
    0
  ));
  select * into existing_command
  from public.course_progress_commands command
  where command.course_id = p_course_id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if existing_command.command_kind <> 'mark'
      or existing_command.request_payload <> request_payload then
      raise exception 'This progress idempotency key is already bound to a different request.';
    end if;
    return existing_command.response_payload;
  end if;

  if course_record.status not in ('active', 'wind_down') then
    raise exception 'Course progress is available only while the Course is active or in wind-down.';
  end if;

  select item.* into item_record
  from public.course_schedule_items item
  where item.id = p_schedule_item_id
    and item.version_id = course_record.active_schedule_version_id
    and item.item_state in ('scheduled', 'requeued');
  if not found then
    raise exception 'Progress must target an eligible item in the active Schedule Version.';
  end if;
  if item_record.item_kind <> 'curriculum_topic' then
    raise exception 'Review and Exam outcomes are not Course progress marks.';
  end if;

  if p_resource_id is null then
    target_kind := 'session';
    target_resource_key := null;
  else
    select * into resource_record
    from public.course_schedule_item_resources resource
    where resource.id = p_resource_id
      and resource.schedule_item_id = item_record.id;
    if not found then
      raise exception 'The selected resource does not belong to this active Session.';
    end if;
    if resource_record.requirement_state = 'not_assigned' then
      raise exception 'A Student cannot record progress for an unassigned resource.';
    end if;
    target_kind := 'resource';
    target_resource_key := resource_record.stable_resource_key;
  end if;

  if actor_role = 'student' then
    if p_effective_at is not null then
      raise exception 'Student progress always uses authoritative server time.';
    end if;
    if normalized_explanation is not null or normalized_private_note is not null then
      raise exception 'Student progress does not accept staff reasons or private notes.';
    end if;
    effective_time := server_time;
  else
    if target_kind <> 'session' or normalized_kind <> 'studied' then
      raise exception 'Tutors and Mentors may record only Session-level Studied progress.';
    end if;
    if normalized_reflection is not null then
      raise exception 'Progress reflections remain Student-controlled.';
    end if;
    effective_time := coalesce(p_effective_at, server_time);
    if effective_time > server_time then
      raise exception 'Course progress cannot be recorded in the future.';
    end if;
    if p_effective_at is not null then reason_required := true; end if;

    select version.time_zone into schedule_time_zone
    from public.course_schedule_versions version
    where version.id = course_record.active_schedule_version_id;
    if (effective_time at time zone coalesce(schedule_time_zone, 'UTC'))::date
      < course_record.start_date then
      raise exception 'Back-reported progress cannot predate the Course start.';
    end if;

    select candidate.stable_item_key into expected_item_key
    from public.course_schedule_items candidate
    where candidate.version_id = course_record.active_schedule_version_id
      and candidate.item_kind = 'curriculum_topic'
      and candidate.item_state in ('scheduled', 'requeued')
      and not public.course_progress_target_is_marked(
        course_record.id,
        candidate.stable_item_key,
        null,
        'studied'
      )
    order by candidate.position, candidate.id
    limit 1;

    if expected_item_key is distinct from item_record.stable_item_key then
      reason_required := true;
    end if;
    if reason_required and not public.course_progress_reason_is_valid(normalized_explanation) then
      raise exception 'A Student-visible academic reason is required for back-reported or later-topic progress.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(
      ':',
      course_record.id::text,
      item_record.stable_item_key,
      coalesce(target_resource_key, 'session'),
      normalized_kind
    ),
    0
  ));

  latest_event_id := public.course_progress_latest_event_id(
    course_record.id,
    item_record.stable_item_key,
    target_resource_key,
    normalized_kind
  );
  if latest_event_id is distinct from p_expected_latest_event_id then
    raise exception 'Course progress changed while this page was open. Reload before saving.';
  end if;

  active_mark := public.course_progress_active_mark(
    course_record.id,
    item_record.stable_item_key,
    target_resource_key,
    normalized_kind
  );
  if active_mark.event_action = 'marked' then
    raise exception 'This Course progress is already marked.';
  end if;

  insert into public.course_progress_events (
    course_id,
    schedule_version_id,
    schedule_item_id,
    resource_id,
    stable_item_key,
    stable_resource_key,
    target_kind,
    progress_kind,
    event_action,
    related_event_id,
    actor_user_id,
    actor_role,
    effective_at,
    recorded_at,
    reflection,
    student_explanation,
    private_staff_note,
    target_snapshot
  ) values (
    course_record.id,
    item_record.version_id,
    item_record.id,
    resource_record.id,
    item_record.stable_item_key,
    target_resource_key,
    target_kind,
    normalized_kind,
    'marked',
    null,
    caller_id,
    actor_role,
    effective_time,
    server_time,
    normalized_reflection,
    normalized_explanation,
    normalized_private_note,
    jsonb_strip_nulls(jsonb_build_object(
      'scheduleVersionId', item_record.version_id,
      'scheduleItemId', item_record.id,
      'stableItemKey', item_record.stable_item_key,
      'title', item_record.title,
      'sourceTrackKey', item_record.source_track_key,
      'sourceModuleKey', item_record.source_module_key,
      'sourceSessionKey', item_record.source_session_key,
      'sourceContentVersionKey', item_record.source_content_version_key,
      'difficultyLevel', item_record.difficulty_level,
      'resourceId', resource_record.id,
      'stableResourceKey', target_resource_key,
      'resourceContentVersionKey', resource_record.source_content_version_key,
      'resourceTitle', resource_record.title,
      'resourceRequirementState', resource_record.requirement_state
    ))
  ) returning * into inserted_event;

  perform public.insert_course_progress_notifications(inserted_event);

  response_payload := jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course_record.id,
    'eventId', inserted_event.id,
    'latestEventId', inserted_event.id,
    'targetKind', inserted_event.target_kind,
    'stableItemKey', inserted_event.stable_item_key,
    'stableResourceKey', inserted_event.stable_resource_key,
    'progressKind', inserted_event.progress_kind,
    'state', 'marked',
    'effectiveAt', inserted_event.effective_at,
    'recordedAt', inserted_event.recorded_at
  );

  insert into public.course_progress_commands (
    course_id,
    actor_user_id,
    idempotency_key,
    command_kind,
    request_payload,
    response_payload
  ) values (
    course_record.id,
    caller_id,
    normalized_key,
    'mark',
    request_payload,
    response_payload
  );

  return response_payload;
end;
$$;

create or replace function public.reverse_course_progress(
  p_course_id uuid,
  p_schedule_item_id uuid,
  p_resource_id uuid,
  p_progress_kind text,
  p_expected_latest_event_id uuid,
  p_effective_at timestamptz,
  p_student_explanation text,
  p_private_staff_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  item_record public.course_schedule_items%rowtype;
  resource_record public.course_schedule_item_resources%rowtype;
  existing_command public.course_progress_commands%rowtype;
  active_mark public.course_progress_events%rowtype;
  inserted_event public.course_progress_events%rowtype;
  actor_role text;
  normalized_kind text := lower(btrim(coalesce(p_progress_kind, '')));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  normalized_explanation text := nullif(btrim(coalesce(p_student_explanation, '')), '');
  normalized_private_note text := nullif(btrim(coalesce(p_private_staff_note, '')), '');
  target_resource_key text;
  target_kind text;
  latest_event_id uuid;
  effective_time timestamptz;
  server_time timestamptz := clock_timestamp();
  schedule_time_zone text;
  request_payload jsonb;
  response_payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to reverse Course progress.';
  end if;
  if p_course_id is null or p_schedule_item_id is null then
    raise exception 'A Course and active Schedule item are required.';
  end if;
  if normalized_kind not in ('studied', 'reviewed', 'practiced') then
    raise exception 'The Course progress kind is invalid.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Course progress idempotency key is invalid.';
  end if;
  if normalized_private_note is not null and char_length(normalized_private_note) > 2000 then
    raise exception 'A private staff note may contain at most 2000 characters.';
  end if;

  request_payload := jsonb_build_object(
    'courseId', p_course_id,
    'scheduleItemId', p_schedule_item_id,
    'resourceId', p_resource_id,
    'progressKind', normalized_kind,
    'expectedLatestEventId', p_expected_latest_event_id,
    'effectiveAt', p_effective_at,
    'studentExplanation', normalized_explanation,
    'privateStaffNote', normalized_private_note
  );

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for share;
  if not found then raise exception 'The Course does not exist.'; end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  if actor_role is null then
    raise exception 'Only the Student, assigned Tutor, or Course Mentor may reverse Course progress.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-progress-command', p_course_id::text, caller_id::text, normalized_key),
    0
  ));
  select * into existing_command
  from public.course_progress_commands command
  where command.course_id = p_course_id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if existing_command.command_kind <> 'reverse'
      or existing_command.request_payload <> request_payload then
      raise exception 'This progress idempotency key is already bound to a different request.';
    end if;
    return existing_command.response_payload;
  end if;

  if course_record.status not in ('active', 'wind_down') then
    raise exception 'Course progress is editable only while the Course is active or in wind-down.';
  end if;

  select item.* into item_record
  from public.course_schedule_items item
  where item.id = p_schedule_item_id
    and item.version_id = course_record.active_schedule_version_id
    and item.item_state in ('scheduled', 'requeued');
  if not found or item_record.item_kind <> 'curriculum_topic' then
    raise exception 'A reversal must target an eligible Curriculum item in the active Schedule.';
  end if;

  if p_resource_id is null then
    target_kind := 'session';
    target_resource_key := null;
  else
    select * into resource_record
    from public.course_schedule_item_resources resource
    where resource.id = p_resource_id
      and resource.schedule_item_id = item_record.id;
    if not found or resource_record.requirement_state = 'not_assigned' then
      raise exception 'The selected resource is not an assigned resource in this Session.';
    end if;
    target_kind := 'resource';
    target_resource_key := resource_record.stable_resource_key;
  end if;

  if actor_role = 'student' then
    if normalized_kind = 'studied' then
      raise exception 'Students must ask their Tutor to reverse Studied progress.';
    end if;
    if p_effective_at is not null
      or normalized_explanation is not null
      or normalized_private_note is not null then
      raise exception 'Student Reviewed or Practiced reversals use authoritative server time without staff notes.';
    end if;
    effective_time := server_time;
  else
    if normalized_kind <> 'studied' then
      raise exception 'Reviewed and Practiced progress remain Student-controlled.';
    end if;
    if not public.course_progress_reason_is_valid(normalized_explanation) then
      raise exception 'A Student-visible reason is required to reverse Studied progress.';
    end if;
    effective_time := coalesce(p_effective_at, server_time);
    if effective_time > server_time then
      raise exception 'A progress reversal cannot be recorded in the future.';
    end if;
    select version.time_zone into schedule_time_zone
    from public.course_schedule_versions version
    where version.id = course_record.active_schedule_version_id;
    if (effective_time at time zone coalesce(schedule_time_zone, 'UTC'))::date
      < course_record.start_date then
      raise exception 'A back-reported reversal cannot predate the Course start.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(
      ':',
      course_record.id::text,
      item_record.stable_item_key,
      coalesce(target_resource_key, 'session'),
      normalized_kind
    ),
    0
  ));

  latest_event_id := public.course_progress_latest_event_id(
    course_record.id,
    item_record.stable_item_key,
    target_resource_key,
    normalized_kind
  );
  if latest_event_id is distinct from p_expected_latest_event_id then
    raise exception 'Course progress changed while this page was open. Reload before saving.';
  end if;

  active_mark := public.course_progress_active_mark(
    course_record.id,
    item_record.stable_item_key,
    target_resource_key,
    normalized_kind
  );
  if active_mark.event_action is distinct from 'marked' then
    raise exception 'This Course progress is not currently marked.';
  end if;
  if actor_role = 'student' and active_mark.actor_user_id <> caller_id then
    raise exception 'Students may reverse only their own Reviewed or Practiced progress.';
  end if;

  insert into public.course_progress_events (
    course_id,
    schedule_version_id,
    schedule_item_id,
    resource_id,
    stable_item_key,
    stable_resource_key,
    target_kind,
    progress_kind,
    event_action,
    related_event_id,
    actor_user_id,
    actor_role,
    effective_at,
    recorded_at,
    reflection,
    student_explanation,
    private_staff_note,
    target_snapshot
  ) values (
    course_record.id,
    item_record.version_id,
    item_record.id,
    resource_record.id,
    item_record.stable_item_key,
    target_resource_key,
    target_kind,
    normalized_kind,
    'reversed',
    active_mark.id,
    caller_id,
    actor_role,
    effective_time,
    server_time,
    null,
    normalized_explanation,
    normalized_private_note,
    active_mark.target_snapshot
  ) returning * into inserted_event;

  if normalized_kind = 'studied' and course_record.status = 'wind_down' then
    update public.student_courses
    set status = 'active',
        ended_at = null,
        updated_at = server_time
    where id = course_record.id;
  end if;

  perform public.insert_course_progress_notifications(inserted_event);

  response_payload := jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course_record.id,
    'eventId', inserted_event.id,
    'latestEventId', inserted_event.id,
    'targetKind', inserted_event.target_kind,
    'stableItemKey', inserted_event.stable_item_key,
    'stableResourceKey', inserted_event.stable_resource_key,
    'progressKind', inserted_event.progress_kind,
    'state', 'unmarked',
    'effectiveAt', inserted_event.effective_at,
    'recordedAt', inserted_event.recorded_at,
    'courseReopened', normalized_kind = 'studied' and course_record.status = 'wind_down'
  );

  insert into public.course_progress_commands (
    course_id,
    actor_user_id,
    idempotency_key,
    command_kind,
    request_payload,
    response_payload
  ) values (
    course_record.id,
    caller_id,
    normalized_key,
    'reverse',
    request_payload,
    response_payload
  );

  return response_payload;
end;
$$;

create or replace function public.amend_my_course_progress_reflection(
  p_course_id uuid,
  p_schedule_item_id uuid,
  p_resource_id uuid,
  p_progress_kind text,
  p_expected_latest_event_id uuid,
  p_reflection text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  item_record public.course_schedule_items%rowtype;
  resource_record public.course_schedule_item_resources%rowtype;
  existing_command public.course_progress_commands%rowtype;
  active_mark public.course_progress_events%rowtype;
  inserted_event public.course_progress_events%rowtype;
  normalized_kind text := lower(btrim(coalesce(p_progress_kind, '')));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  normalized_reflection text := nullif(btrim(coalesce(p_reflection, '')), '');
  target_resource_key text;
  target_kind text;
  latest_event_id uuid;
  server_time timestamptz := clock_timestamp();
  request_payload jsonb;
  response_payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to amend a progress reflection.';
  end if;
  if normalized_kind not in ('studied', 'reviewed', 'practiced') then
    raise exception 'The Course progress kind is invalid.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Course progress idempotency key is invalid.';
  end if;
  if normalized_reflection is not null and char_length(normalized_reflection) > 1000 then
    raise exception 'A progress reflection may contain at most 1000 characters.';
  end if;

  request_payload := jsonb_build_object(
    'courseId', p_course_id,
    'scheduleItemId', p_schedule_item_id,
    'resourceId', p_resource_id,
    'progressKind', normalized_kind,
    'expectedLatestEventId', p_expected_latest_event_id,
    'reflection', normalized_reflection
  );

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for share;
  if not found or caller_id <> course_record.student_id then
    raise exception 'Only the Course Student may amend their progress reflection.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-progress-command', p_course_id::text, caller_id::text, normalized_key),
    0
  ));
  select * into existing_command
  from public.course_progress_commands command
  where command.course_id = p_course_id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if existing_command.command_kind <> 'amend_reflection'
      or existing_command.request_payload <> request_payload then
      raise exception 'This progress idempotency key is already bound to a different request.';
    end if;
    return existing_command.response_payload;
  end if;

  if course_record.status not in ('active', 'wind_down') then
    raise exception 'Progress reflections are editable only while the Course is active or in wind-down.';
  end if;

  select item.* into item_record
  from public.course_schedule_items item
  where item.id = p_schedule_item_id
    and item.version_id = course_record.active_schedule_version_id
    and item.item_kind = 'curriculum_topic'
    and item.item_state in ('scheduled', 'requeued');
  if not found then
    raise exception 'A reflection must target an eligible item in the active Schedule.';
  end if;

  if p_resource_id is null then
    target_kind := 'session';
    target_resource_key := null;
  else
    select * into resource_record
    from public.course_schedule_item_resources resource
    where resource.id = p_resource_id
      and resource.schedule_item_id = item_record.id
      and resource.requirement_state in ('required', 'optional');
    if not found then
      raise exception 'The selected reflection resource is not assigned to this Session.';
    end if;
    target_kind := 'resource';
    target_resource_key := resource_record.stable_resource_key;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(
      ':',
      course_record.id::text,
      item_record.stable_item_key,
      coalesce(target_resource_key, 'session'),
      normalized_kind
    ),
    0
  ));

  latest_event_id := public.course_progress_latest_event_id(
    course_record.id,
    item_record.stable_item_key,
    target_resource_key,
    normalized_kind
  );
  if latest_event_id is distinct from p_expected_latest_event_id then
    raise exception 'Course progress changed while this page was open. Reload before saving.';
  end if;

  active_mark := public.course_progress_active_mark(
    course_record.id,
    item_record.stable_item_key,
    target_resource_key,
    normalized_kind
  );
  if active_mark.event_action is distinct from 'marked'
    or active_mark.actor_user_id <> caller_id
    or active_mark.actor_role <> 'student' then
    raise exception 'Students may amend only a currently active reflection they recorded.';
  end if;
  if server_time > active_mark.recorded_at + interval '2 hours' then
    raise exception 'The two-hour reflection amendment window has closed.';
  end if;

  insert into public.course_progress_events (
    course_id,
    schedule_version_id,
    schedule_item_id,
    resource_id,
    stable_item_key,
    stable_resource_key,
    target_kind,
    progress_kind,
    event_action,
    related_event_id,
    actor_user_id,
    actor_role,
    effective_at,
    recorded_at,
    reflection,
    student_explanation,
    private_staff_note,
    target_snapshot
  ) values (
    course_record.id,
    item_record.version_id,
    item_record.id,
    resource_record.id,
    item_record.stable_item_key,
    target_resource_key,
    target_kind,
    normalized_kind,
    'reflection_amended',
    latest_event_id,
    caller_id,
    'student',
    active_mark.effective_at,
    server_time,
    normalized_reflection,
    null,
    null,
    active_mark.target_snapshot
  ) returning * into inserted_event;

  response_payload := jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course_record.id,
    'eventId', inserted_event.id,
    'latestEventId', inserted_event.id,
    'targetKind', inserted_event.target_kind,
    'stableItemKey', inserted_event.stable_item_key,
    'stableResourceKey', inserted_event.stable_resource_key,
    'progressKind', inserted_event.progress_kind,
    'state', 'marked',
    'reflection', inserted_event.reflection,
    'recordedAt', inserted_event.recorded_at
  );

  insert into public.course_progress_commands (
    course_id,
    actor_user_id,
    idempotency_key,
    command_kind,
    request_payload,
    response_payload
  ) values (
    course_record.id,
    caller_id,
    normalized_key,
    'amend_reflection',
    request_payload,
    response_payload
  );

  return response_payload;
end;
$$;

create or replace function public.get_my_course_progress(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  actor_role text;
  staff_history boolean;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open Course progress.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then raise exception 'The Course does not exist.'; end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  staff_history := public.current_user_can_read_course_schedule_history(p_course_id);
  if actor_role is null and not staff_history then
    raise exception 'Course progress is private to the Student and assigned academic staff.';
  end if;

  with target_keys as (
    select distinct
      event.stable_item_key,
      event.stable_resource_key,
      event.target_kind,
      event.progress_kind
    from public.course_progress_events event
    where event.course_id = p_course_id
  ),
  current_states as (
    select
      target.*,
      transition.id as transition_event_id,
      transition.event_action,
      transition.actor_user_id,
      transition.actor_role,
      transition.effective_at,
      transition.recorded_at,
      transition.target_snapshot,
      latest.id as latest_event_id,
      latest.recorded_at as latest_recorded_at,
      reflection.reflection,
      reflection.recorded_at as reflection_recorded_at
    from target_keys target
    left join lateral (
      select event.*
      from public.course_progress_events event
      where event.course_id = p_course_id
        and event.stable_item_key = target.stable_item_key
        and event.stable_resource_key is not distinct from target.stable_resource_key
        and event.progress_kind = target.progress_kind
        and event.event_action in ('marked', 'reversed')
      order by event.recorded_at desc, event.id desc
      limit 1
    ) transition on true
    left join lateral (
      select event.*
      from public.course_progress_events event
      where event.course_id = p_course_id
        and event.stable_item_key = target.stable_item_key
        and event.stable_resource_key is not distinct from target.stable_resource_key
        and event.progress_kind = target.progress_kind
      order by event.recorded_at desc, event.id desc
      limit 1
    ) latest on true
    left join lateral (
      select event.*
      from public.course_progress_events event
      where event.course_id = p_course_id
        and event.stable_item_key = target.stable_item_key
        and event.stable_resource_key is not distinct from target.stable_resource_key
        and event.progress_kind = target.progress_kind
        and event.event_action in ('marked', 'reflection_amended')
        and transition.event_action = 'marked'
        and (event.recorded_at, event.id) >= (transition.recorded_at, transition.id)
      order by event.recorded_at desc, event.id desc
      limit 1
    ) reflection on true
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course_record.id,
    'courseStatus', course_record.status,
    'permissions', jsonb_build_object(
      'actorRole', actor_role,
      'canMarkSession', actor_role in ('student', 'tutor', 'mentor'),
      'canMarkResource', actor_role = 'student',
      'canReverseStudied', actor_role in ('tutor', 'mentor'),
      'canReverseOwnReviewedPracticed', actor_role = 'student',
      'canAmendOwnReflection', actor_role = 'student',
      'canReadPrivateStaffNotes', staff_history
    ),
    'states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stableItemKey', state.stable_item_key,
        'stableResourceKey', state.stable_resource_key,
        'targetKind', state.target_kind,
        'progressKind', state.progress_kind,
        'state', case when state.event_action = 'marked' then 'marked' else 'unmarked' end,
        'transitionEventId', state.transition_event_id,
        'latestEventId', state.latest_event_id,
        'actorUserId', state.actor_user_id,
        'actorRole', state.actor_role,
        'effectiveAt', state.effective_at,
        'recordedAt', state.recorded_at,
        'latestRecordedAt', state.latest_recorded_at,
        'reflection', case when state.event_action = 'marked' then state.reflection else null end,
        'reflectionRecordedAt', case
          when state.event_action = 'marked' then state.reflection_recorded_at else null end,
        'targetSnapshot', state.target_snapshot
      ) order by
        state.stable_item_key,
        state.stable_resource_key nulls first,
        state.progress_kind)
      from current_states state
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'scheduleVersionId', event.schedule_version_id,
        'scheduleItemId', event.schedule_item_id,
        'resourceId', event.resource_id,
        'stableItemKey', event.stable_item_key,
        'stableResourceKey', event.stable_resource_key,
        'targetKind', event.target_kind,
        'progressKind', event.progress_kind,
        'action', event.event_action,
        'relatedEventId', event.related_event_id,
        'actorUserId', event.actor_user_id,
        'actorRole', event.actor_role,
        'effectiveAt', event.effective_at,
        'recordedAt', event.recorded_at,
        'reflection', event.reflection,
        'studentExplanation', event.student_explanation,
        'privateStaffNote', case when staff_history then event.private_staff_note else null end,
        'targetSnapshot', event.target_snapshot
      ) order by event.recorded_at, event.id)
      from public.course_progress_events event
      where event.course_id = p_course_id
    ), '[]'::jsonb),
    'featureStatus', jsonb_build_object(
      'appendOnlyProgressLedger', 'active_phase_5e2',
      'hierarchicalAggregation', 'planned_phase_5e3',
      'effectiveSchedule', 'planned_phase_5e4'
    )
  ) into payload;

  return payload;
end;
$$;

create or replace function public.protect_studied_course_schedule_items()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  studied record;
  successor public.course_schedule_items%rowtype;
begin
  if new.active_schedule_version_id is not distinct from old.active_schedule_version_id then
    return new;
  end if;

  for studied in
    select
      event.stable_item_key,
      event.schedule_item_id
    from public.course_progress_events event
    where event.course_id = old.id
      and event.target_kind = 'session'
      and event.progress_kind = 'studied'
      and event.event_action in ('marked', 'reversed')
      and (event.recorded_at, event.id) = (
        select latest.recorded_at, latest.id
        from public.course_progress_events latest
        where latest.course_id = event.course_id
          and latest.stable_item_key = event.stable_item_key
          and latest.stable_resource_key is null
          and latest.progress_kind = 'studied'
          and latest.event_action in ('marked', 'reversed')
        order by latest.recorded_at desc, latest.id desc
        limit 1
      )
      and event.event_action = 'marked'
  loop
    select candidate.* into successor
    from public.course_schedule_items candidate
    where candidate.version_id = new.active_schedule_version_id
      and candidate.stable_item_key = studied.stable_item_key;

    if not found then
      raise exception 'A Studied Schedule item cannot be dropped from a successor Version.';
    end if;

    if not exists (
      select 1
      from public.course_schedule_items original
      where original.id = studied.schedule_item_id
        and successor.stable_item_key = original.stable_item_key
        and successor.title = original.title
        and successor.item_kind = original.item_kind
        and successor.curriculum_node_id is not distinct from original.curriculum_node_id
        and successor.scheduled_date = original.scheduled_date
        and successor.end_date = original.end_date
        and successor.position = original.position
        and successor.item_state = original.item_state
        and successor.source_track_key is not distinct from original.source_track_key
        and successor.source_module_key is not distinct from original.source_module_key
        and successor.source_session_key is not distinct from original.source_session_key
        and successor.source_content_version_key is not distinct from original.source_content_version_key
        and successor.difficulty_level is not distinct from original.difficulty_level
        and successor.planning_href is not distinct from original.planning_href
        and (
          select coalesce(jsonb_agg(
            to_jsonb(resource) - 'id' - 'schedule_item_id' - 'created_at'
            order by resource.position, resource.stable_resource_key
          ), '[]'::jsonb)
          from public.course_schedule_item_resources resource
          where resource.schedule_item_id = successor.id
        ) = (
          select coalesce(jsonb_agg(
            to_jsonb(resource) - 'id' - 'schedule_item_id' - 'created_at'
            order by resource.position, resource.stable_resource_key
          ), '[]'::jsonb)
          from public.course_schedule_item_resources resource
          where resource.schedule_item_id = original.id
        )
    ) then
      raise exception 'A Studied Schedule item is immutable in successor Versions.';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists protect_studied_course_schedule_items
on public.student_courses;
create trigger protect_studied_course_schedule_items
before update of active_schedule_version_id on public.student_courses
for each row execute function public.protect_studied_course_schedule_items();

alter function public.get_my_course_schedule_sources(uuid)
rename to get_my_course_schedule_sources_phase5e1;

create or replace function public.get_my_course_schedule_sources(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  payload := public.get_my_course_schedule_sources_phase5e1(p_course_id);
  payload := jsonb_set(
    payload,
    '{sourcePolicy,completedSessionPinning}',
    to_jsonb('active_phase_5e2'::text),
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus,progressLedger}',
    to_jsonb('active_phase_5e2'::text),
    true
  );
  return payload;
end;
$$;

alter table public.course_progress_events enable row level security;
alter table public.course_progress_commands enable row level security;
alter table public.course_progress_notification_events enable row level security;

drop policy if exists "Recipients can read Course progress notifications"
on public.course_progress_notification_events;
create policy "Recipients can read Course progress notifications"
on public.course_progress_notification_events for select to authenticated
using (recipient_user_id = (select auth.uid()));

revoke all on public.course_progress_events from public, anon, authenticated;
revoke all on public.course_progress_commands from public, anon, authenticated;
revoke all on public.course_progress_notification_events from public, anon, authenticated;

grant select on public.course_progress_notification_events to authenticated;
grant select on public.course_progress_events to service_role;
grant select on public.course_progress_commands to service_role;
grant select on public.course_progress_notification_events to service_role;

revoke all on function public.reject_course_progress_mutation()
  from public, anon, authenticated;
revoke all on function public.validate_course_progress_event()
  from public, anon, authenticated;
revoke all on function public.course_progress_latest_event_id(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.course_progress_active_mark(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.course_progress_target_is_marked(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.course_progress_actor_role(public.student_courses, uuid)
  from public, anon, authenticated;
revoke all on function public.course_progress_reason_is_valid(text)
  from public, anon, authenticated;
revoke all on function public.insert_course_progress_notifications(public.course_progress_events)
  from public, anon, authenticated;
revoke all on function public.protect_studied_course_schedule_items()
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule_sources_phase5e1(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule_sources(uuid)
  from public, anon, authenticated;
revoke all on function public.record_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.reverse_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) from public, anon, authenticated;
revoke all on function public.amend_my_course_progress_reflection(
  uuid, uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.get_my_course_progress(uuid)
  from public, anon, authenticated;

grant execute on function public.record_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) to authenticated;
grant execute on function public.reverse_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) to authenticated;
grant execute on function public.amend_my_course_progress_reflection(
  uuid, uuid, uuid, text, uuid, text, text
) to authenticated;
grant execute on function public.get_my_course_progress(uuid)
  to authenticated;
grant execute on function public.get_my_course_schedule_sources(uuid)
  to authenticated;

comment on table public.course_progress_events is
  'Append-only Phase 5.E.2 Course progress facts. Marks, reversals, and reflection amendments preserve exact Schedule/content/resource snapshots.';
comment on table public.course_progress_commands is
  'Idempotent Phase 5.E.2 command receipts. A retry returns the original response; a conflicting reuse is rejected.';
comment on table public.course_progress_notification_events is
  'In-app Studied progress notification facts for the actor, Course Student, and assigned Tutor. Delivery adapters remain later work.';
comment on function public.record_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) is
  'Marks Session or assigned-resource progress with role, timestamp, later-topic, reflection, idempotency, and stale-state rules.';
comment on function public.reverse_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) is
  'Appends a governed progress reversal. Students may reverse only their own Reviewed/Practiced marks; academic staff reverse Studied marks with a public reason.';
comment on function public.amend_my_course_progress_reflection(
  uuid, uuid, uuid, text, uuid, text, text
) is
  'Appends a Student reflection amendment within two hours while retaining the original event.';
comment on function public.get_my_course_progress(uuid) is
  'Private Phase 5.E.2 progress projection for the Student and assigned academic staff; Guardians are intentionally excluded.';
comment on function public.get_my_course_schedule_sources(uuid) is
  'Phase 5.E.1 Session/resource projection with Phase 5.E.2 completed-content pinning and progress-ledger status.';
