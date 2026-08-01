-- Phase 5.B: every runtime Course owns one stable Schedule and one required
-- active immutable Schedule Version. The older learning_schedules tables stay
-- as a compatibility mirror for Calendar and immutable practice-assignment
-- snapshots; they are no longer the Course Schedule authority.

alter table public.student_courses
  add column if not exists provider_kind text not null default 'kelp',
  add column if not exists idempotency_owner_id uuid references public.profiles(id) on delete restrict;

alter table public.student_courses
  drop constraint if exists student_courses_distinct_people,
  drop constraint if exists student_courses_service_model_check,
  drop constraint if exists student_courses_mentor_idempotency_key;

alter table public.student_courses
  alter column mentor_id drop not null;

update public.student_courses
set provider_kind = case
      when service_model = 'independent_tutor' then 'independent_tutor'
      else 'kelp'
    end,
    service_model = case
      when service_model = 'independent_tutor' then 'on_demand'
      else service_model
    end,
    idempotency_owner_id = coalesce(mentor_id, tutor_id)
where idempotency_owner_id is null
   or service_model = 'independent_tutor';

alter table public.student_courses
  alter column idempotency_owner_id set not null,
  add constraint student_courses_distinct_people check (
    student_id <> tutor_id
    and (
      mentor_id is null
      or (student_id <> mentor_id and tutor_id <> mentor_id)
    )
  ),
  add constraint student_courses_provider_kind_check check (
    provider_kind in ('kelp', 'independent_tutor')
  ),
  add constraint student_courses_service_model_check check (
    service_model in ('recurring', 'on_demand', 'access_only')
  ),
  add constraint student_courses_provider_supervision_check check (
    provider_kind <> 'kelp' or mentor_id is not null
  ),
  add constraint student_courses_owner_idempotency_key unique (
    idempotency_owner_id, idempotency_key
  );

create index if not exists student_courses_provider_status_idx
on public.student_courses (provider_kind, status, updated_at desc);

create table if not exists public.course_schedules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null unique references public.student_courses(id) on delete restrict,
  status text not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint course_schedules_status_check check (status in ('active', 'finished')),
  constraint course_schedules_lifecycle_check check (
    (status = 'active' and finished_at is null)
    or (status = 'finished' and finished_at is not null)
  ),
  constraint course_schedules_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.course_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.course_schedules(id) on delete restrict,
  version_number integer not null,
  previous_version_id uuid references public.course_schedule_versions(id) on delete restrict,
  legacy_schedule_id uuid references public.learning_schedules(id) on delete restrict,
  name text not null,
  time_zone text not null,
  cadence jsonb not null default '{}'::jsonb,
  source_schema_version integer not null default 1,
  source_snapshot jsonb not null default '{}'::jsonb,
  reason text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint course_schedule_versions_number_check check (version_number >= 1),
  constraint course_schedule_versions_name_check check (
    btrim(name) <> '' and char_length(name) <= 180
  ),
  constraint course_schedule_versions_time_zone_check check (
    btrim(time_zone) <> '' and char_length(time_zone) <= 100
  ),
  constraint course_schedule_versions_cadence_check check (jsonb_typeof(cadence) = 'object'),
  constraint course_schedule_versions_source_check check (jsonb_typeof(source_snapshot) = 'object'),
  constraint course_schedule_versions_reason_check check (
    btrim(reason) <> '' and char_length(reason) <= 500
  ),
  constraint course_schedule_versions_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint course_schedule_versions_number_key unique (schedule_id, version_number),
  constraint course_schedule_versions_id_schedule_key unique (id, schedule_id)
);

create table if not exists public.course_schedule_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  stable_item_key text not null,
  legacy_schedule_session_id uuid references public.learning_schedule_sessions(id) on delete restrict,
  title text not null,
  scheduled_date date not null,
  end_date date not null,
  position integer not null,
  item_state text not null default 'scheduled',
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint course_schedule_items_key_check check (
    btrim(stable_item_key) <> '' and char_length(stable_item_key) <= 180
  ),
  constraint course_schedule_items_title_check check (
    btrim(title) <> '' and char_length(title) <= 240
  ),
  constraint course_schedule_items_date_check check (end_date >= scheduled_date),
  constraint course_schedule_items_position_check check (position >= 0),
  constraint course_schedule_items_state_check check (
    item_state in ('scheduled', 'dropped', 'requeued')
  ),
  constraint course_schedule_items_snapshot_check check (jsonb_typeof(source_snapshot) = 'object'),
  constraint course_schedule_items_version_key unique (version_id, stable_item_key),
  constraint course_schedule_items_version_position unique (version_id, position)
);

create index if not exists course_schedule_versions_schedule_idx
on public.course_schedule_versions (schedule_id, version_number desc);
create index if not exists course_schedule_items_version_order_idx
on public.course_schedule_items (version_id, position, id);

alter table public.student_courses
  add column if not exists active_schedule_version_id uuid;

alter table public.student_courses
  drop constraint if exists student_courses_active_schedule_version_fkey,
  add constraint student_courses_active_schedule_version_fkey
    foreign key (active_schedule_version_id)
    references public.course_schedule_versions(id)
    on delete restrict
    deferrable initially deferred;

-- Migrate every retained Course to one stable Schedule and immutable version 1.
insert into public.course_schedules (course_id, created_by, metadata)
select course.id, course.created_by,
  jsonb_build_object('migration', 'phase_5b', 'backfilled', true)
from public.student_courses course
on conflict (course_id) do nothing;

insert into public.course_schedule_versions (
  schedule_id, version_number, previous_version_id, legacy_schedule_id,
  name, time_zone, cadence, source_schema_version, source_snapshot,
  reason, created_by, metadata
)
select
  schedule.id,
  1,
  null,
  legacy.id,
  coalesce(nullif(btrim(legacy.name), ''), course.title || ' Schedule'),
  coalesce(nullif(btrim(legacy.time_zone), ''), 'UTC'),
  coalesce(legacy.source_snapshot -> 'cadence', '{}'::jsonb),
  coalesce(legacy.source_schema_version, 1),
  coalesce(
    legacy.source_snapshot,
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'migrated-course-' || course.id::text,
      'name', course.title || ' Schedule',
      'timeZone', 'UTC',
      'sessions', jsonb_build_array(jsonb_build_object(
        'id', 'migration-initial-plan',
        'title', course.title || ' — initial plan review',
        'startDate', course.start_date,
        'endDate', course.scheduled_end_date,
        'migrationPlaceholder', true,
        'requiresReview', true
      ))
    )
  ),
  case when legacy.id is null
    then 'Phase 5.B migration placeholder; academic review required'
    else 'Phase 5.B migration from the retained Course-linked Schedule'
  end,
  course.created_by,
  jsonb_build_object(
    'migration', 'phase_5b',
    'backfilled', true,
    'requiresReview', legacy.id is null
  )
from public.course_schedules schedule
join public.student_courses course on course.id = schedule.course_id
left join lateral (
  select candidate.*
  from public.learning_schedules candidate
  where candidate.student_course_id = course.id
  order by
    case candidate.status when 'active' then 0 else 1 end,
    candidate.updated_at desc,
    candidate.id desc
  limit 1
) legacy on true
where not exists (
  select 1 from public.course_schedule_versions existing
  where existing.schedule_id = schedule.id
);

insert into public.course_schedule_items (
  version_id, stable_item_key, legacy_schedule_session_id, title,
  scheduled_date, end_date, position, item_state, source_snapshot
)
select
  version.id,
  legacy_session.source_key,
  legacy_session.id,
  legacy_session.title,
  legacy_session.scheduled_date,
  legacy_session.end_date,
  row_number() over (
    partition by version.id
    order by legacy_session.scheduled_date, legacy_session.position, legacy_session.id
  )::integer - 1,
  'scheduled',
  legacy_session.source_snapshot
from public.course_schedule_versions version
join public.learning_schedule_sessions legacy_session
  on legacy_session.schedule_id = version.legacy_schedule_id
 and legacy_session.status = 'active'
where version.version_number = 1
on conflict (version_id, stable_item_key) do nothing;

insert into public.course_schedule_items (
  version_id, stable_item_key, title, scheduled_date, end_date,
  position, item_state, source_snapshot
)
select
  version.id,
  'migration-initial-plan',
  course.title || ' — initial plan review',
  course.start_date,
  course.scheduled_end_date,
  0,
  'scheduled',
  jsonb_build_object('migrationPlaceholder', true, 'requiresReview', true)
from public.course_schedule_versions version
join public.course_schedules schedule on schedule.id = version.schedule_id
join public.student_courses course on course.id = schedule.course_id
where not exists (
  select 1 from public.course_schedule_items item where item.version_id = version.id
)
on conflict (version_id, stable_item_key) do nothing;

update public.student_courses course
set active_schedule_version_id = version.id
from public.course_schedules schedule
join public.course_schedule_versions version
  on version.schedule_id = schedule.id and version.version_number = 1
where schedule.course_id = course.id
  and course.active_schedule_version_id is null;

create or replace function public.reject_course_schedule_version_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Course Schedule Versions and their items are immutable; create a new version instead.';
end;
$$;

drop trigger if exists course_schedule_versions_immutable on public.course_schedule_versions;
create trigger course_schedule_versions_immutable
before update or delete on public.course_schedule_versions
for each row execute function public.reject_course_schedule_version_mutation();

drop trigger if exists course_schedule_items_immutable on public.course_schedule_items;
create trigger course_schedule_items_immutable
before update or delete on public.course_schedule_items
for each row execute function public.reject_course_schedule_version_mutation();

create or replace function public.enforce_student_course_required_schedule()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  current_course public.student_courses%rowtype;
begin
  -- A deferred INSERT event retains its original NEW tuple. Re-read the row
  -- so an atomic Course -> Schedule -> active-version transaction is judged by
  -- its committed candidate state rather than its temporary insert state.
  select * into current_course from public.student_courses where id = new.id;
  if not found then return new; end if;
  if current_course.active_schedule_version_id is null or not exists (
    select 1
    from public.course_schedule_versions version
    join public.course_schedules schedule on schedule.id = version.schedule_id
    where version.id = current_course.active_schedule_version_id
      and schedule.course_id = current_course.id
      and exists (
        select 1 from public.course_schedule_items item where item.version_id = version.id
      )
  ) then
    raise exception 'A Course requires an active Schedule Version with at least one item.';
  end if;
  return new;
end;
$$;

drop trigger if exists student_courses_require_schedule on public.student_courses;
create constraint trigger student_courses_require_schedule
after insert or update on public.student_courses
deferrable initially deferred
for each row execute function public.enforce_student_course_required_schedule();

create or replace function public.create_student_course_with_schedule_draft(
  p_student_id uuid,
  p_tutor_id uuid,
  p_subject_node_id uuid,
  p_focus_node_id uuid,
  p_title text,
  p_provider_kind text,
  p_service_model text,
  p_schedule jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_provider text := lower(btrim(coalesce(p_provider_kind, '')));
  normalized_model text := lower(btrim(coalesce(p_service_model, '')));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  normalized_schedule_key text := btrim(coalesce(p_schedule ->> 'id', ''));
  normalized_schedule_name text := btrim(coalesce(p_schedule ->> 'name', ''));
  normalized_time_zone text := btrim(coalesce(p_schedule ->> 'timeZone', ''));
  sessions jsonb := coalesce(p_schedule -> 'sessions', '[]'::jsonb);
  supervisory_mentor_id uuid;
  idempotency_owner uuid;
  schedule_start date;
  schedule_end date;
  raw_session jsonb;
  ordinal bigint;
  session_key text;
  session_title text;
  session_start date;
  session_end date;
  legacy_schedule_id uuid;
  legacy_session_id uuid;
  stable_schedule public.course_schedules%rowtype;
  schedule_version public.course_schedule_versions%rowtype;
  course public.student_courses%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  if normalized_provider not in ('kelp', 'independent_tutor') then
    raise exception 'The Course provider kind is invalid.';
  end if;
  if normalized_model not in ('recurring', 'on_demand', 'access_only') then
    raise exception 'The Course service model is invalid.';
  end if;
  if normalized_title = '' or char_length(normalized_title) > 180 then
    raise exception 'A Course title between 1 and 180 characters is required.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Course idempotency key is invalid.';
  end if;
  if p_student_id = p_tutor_id then
    raise exception 'The Course Student and Tutor must be different people.';
  end if;
  if not exists (
    select 1 from public.user_roles role_assignment
    where role_assignment.user_id = p_student_id
      and role_assignment.role_key = 'student'
      and role_assignment.status = 'active'
  ) then raise exception 'The selected Student does not hold an active Student role.'; end if;
  if not exists (
    select 1 from public.user_roles role_assignment
    where role_assignment.user_id = p_tutor_id
      and role_assignment.role_key in ('teacher', 'tutor')
      and role_assignment.status = 'active'
  ) then raise exception 'The selected Tutor does not hold an active Tutor or Teacher role.'; end if;

  select assignment.mentor_id into supervisory_mentor_id
  from public.mentor_tutor_assignments assignment
  where assignment.tutor_id = p_tutor_id and assignment.status = 'active';

  if normalized_provider = 'kelp' then
    if supervisory_mentor_id is null then
      raise exception 'A Kelp Tutor requires an active supervisory Mentor.';
    end if;
    if caller_id <> supervisory_mentor_id
      and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
      raise exception 'Only the Tutor''s supervisory Mentor can create this Kelp Course draft.';
    end if;
  elsif caller_id <> p_tutor_id
    and caller_id is distinct from supervisory_mentor_id
    and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    raise exception 'Only the independent Tutor, their Mentor, or an administrator can create this Course draft.';
  end if;

  if not exists (
    select 1 from public.curriculum_nodes node
    where node.id = p_subject_node_id and node.status = 'active' and node.node_type = 'subject'
  ) then raise exception 'The Course Subject must be an active Subject node.'; end if;
  if not public.curriculum_node_is_within(p_focus_node_id, p_subject_node_id) then
    raise exception 'The Course focus must belong to the selected Subject.';
  end if;
  if not public.user_has_active_teaching_scope(p_tutor_id, p_focus_node_id) then
    raise exception 'The Tutor is not qualified for the selected Course focus.';
  end if;
  if supervisory_mentor_id is not null
    and not public.user_has_active_teaching_scope(supervisory_mentor_id, p_focus_node_id) then
    raise exception 'The Tutor''s supervisory Mentor is not qualified for the selected Course focus.';
  end if;

  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'An initial generated Schedule object is required.';
  end if;
  if normalized_schedule_key = '' or char_length(normalized_schedule_key) > 180 then
    raise exception 'The initial Schedule requires a stable source ID.';
  end if;
  if normalized_schedule_name = '' or char_length(normalized_schedule_name) > 180 then
    raise exception 'The initial Schedule requires a name.';
  end if;
  if normalized_time_zone = '' or not exists (
    select 1 from pg_timezone_names where name = normalized_time_zone
  ) then raise exception 'The initial Schedule requires a valid IANA timezone.'; end if;
  if jsonb_typeof(sessions) <> 'array'
    or jsonb_array_length(sessions) < 1
    or jsonb_array_length(sessions) > 500 then
    raise exception 'An initial Schedule must contain between 1 and 500 items.';
  end if;
  if jsonb_array_length(sessions) <> (
    select count(distinct btrim(value ->> 'id'))
    from jsonb_array_elements(sessions)
    where btrim(coalesce(value ->> 'id', '')) <> ''
  ) then raise exception 'Every initial Schedule item requires a unique stable ID.'; end if;

  for raw_session, ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(sessions) with ordinality as item(value, ordinality)
  loop
    session_key := btrim(coalesce(raw_session ->> 'id', ''));
    session_title := btrim(coalesce(
      raw_session ->> 'title', raw_session ->> 'topicTitle', raw_session ->> 'sessionTitle', ''
    ));
    if session_title = '' or char_length(session_title) > 240 then
      raise exception 'Every initial Schedule item requires a title of at most 240 characters.';
    end if;
    begin
      session_start := nullif(coalesce(raw_session ->> 'startDate', raw_session ->> 'date'), '')::date;
      session_end := coalesce(nullif(raw_session ->> 'endDate', '')::date, session_start);
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Every initial Schedule item requires valid start and end dates.';
    end;
    if session_start is null or session_end < session_start then
      raise exception 'Every initial Schedule item requires an ordered date range.';
    end if;
    schedule_start := least(coalesce(schedule_start, session_start), session_start);
    schedule_end := greatest(coalesce(schedule_end, session_end), session_end);
  end loop;

  idempotency_owner := coalesce(supervisory_mentor_id, p_tutor_id);
  select * into course
  from public.student_courses existing
  where existing.idempotency_owner_id = idempotency_owner
    and existing.idempotency_key = normalized_key;
  if found then
    if course.student_id <> p_student_id
      or course.tutor_id <> p_tutor_id
      or course.subject_node_id <> p_subject_node_id
      or course.focus_node_id <> p_focus_node_id
      or course.provider_kind <> normalized_provider
      or course.service_model <> normalized_model then
      raise exception 'The Course idempotency key is already bound to a different Course contract.';
    end if;
    return to_jsonb(course) || jsonb_build_object(
      'scheduleId', (select id from public.course_schedules where course_id = course.id),
      'activeScheduleVersionId', course.active_schedule_version_id
    );
  end if;

  insert into public.student_courses (
    student_id, tutor_id, mentor_id, subject_node_id, focus_node_id,
    title, provider_kind, service_model, status, start_date, scheduled_end_date,
    idempotency_key, idempotency_owner_id, created_by
  ) values (
    p_student_id, p_tutor_id, supervisory_mentor_id, p_subject_node_id, p_focus_node_id,
    normalized_title, normalized_provider, normalized_model, 'draft', schedule_start, schedule_end,
    normalized_key, idempotency_owner, caller_id
  ) returning * into course;

  select id into legacy_schedule_id
  from public.learning_schedules
  where student_id = p_student_id and source_key = normalized_schedule_key
  for update;
  if found and exists (
    select 1 from public.learning_schedules
    where id = legacy_schedule_id
      and student_course_id is not null
      and student_course_id <> course.id
  ) then raise exception 'This Schedule source is already linked to another Course.'; end if;
  if legacy_schedule_id is null then legacy_schedule_id := gen_random_uuid(); end if;

  insert into public.learning_schedules (
    id, student_id, student_course_id, created_by, source_key, name, time_zone,
    status, source_schema_version, source_snapshot, created_at, updated_at, archived_at
  ) values (
    legacy_schedule_id, p_student_id, course.id, caller_id, normalized_schedule_key,
    normalized_schedule_name, normalized_time_zone, 'active',
    greatest(coalesce((p_schedule ->> 'schemaVersion')::integer, 1), 1),
    p_schedule, now(), now(), null
  ) on conflict (id) do update set
    student_course_id = excluded.student_course_id,
    name = excluded.name,
    time_zone = excluded.time_zone,
    status = 'active',
    source_schema_version = excluded.source_schema_version,
    source_snapshot = excluded.source_snapshot,
    updated_at = now(),
    archived_at = null;

  update public.learning_schedule_sessions
  set status = 'removed', updated_at = now()
  where schedule_id = legacy_schedule_id;

  insert into public.course_schedules (course_id, created_by, metadata)
  values (course.id, caller_id, jsonb_build_object('createdAtomically', true))
  returning * into stable_schedule;

  insert into public.course_schedule_versions (
    schedule_id, version_number, legacy_schedule_id, name, time_zone, cadence,
    source_schema_version, source_snapshot, reason, created_by, metadata
  ) values (
    stable_schedule.id, 1, legacy_schedule_id, normalized_schedule_name, normalized_time_zone,
    coalesce(p_schedule -> 'cadence', '{}'::jsonb),
    greatest(coalesce((p_schedule ->> 'schemaVersion')::integer, 1), 1),
    p_schedule, 'Initial Course Schedule', caller_id,
    jsonb_build_object('createdAtomically', true)
  ) returning * into schedule_version;

  for raw_session, ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(sessions) with ordinality as item(value, ordinality)
  loop
    session_key := btrim(raw_session ->> 'id');
    session_title := btrim(coalesce(
      raw_session ->> 'title', raw_session ->> 'topicTitle', raw_session ->> 'sessionTitle'
    ));
    session_start := nullif(coalesce(raw_session ->> 'startDate', raw_session ->> 'date'), '')::date;
    session_end := coalesce(nullif(raw_session ->> 'endDate', '')::date, session_start);

    insert into public.learning_schedule_sessions (
      schedule_id, source_key, title, scheduled_date, end_date, position,
      status, source_snapshot, created_at, updated_at
    ) values (
      legacy_schedule_id, session_key, session_title, session_start, session_end,
      ordinal::integer - 1, 'active', raw_session, now(), now()
    ) on conflict (schedule_id, source_key) do update set
      title = excluded.title,
      scheduled_date = excluded.scheduled_date,
      end_date = excluded.end_date,
      position = excluded.position,
      status = 'active',
      source_snapshot = excluded.source_snapshot,
      updated_at = now()
    returning id into legacy_session_id;

    insert into public.course_schedule_items (
      version_id, stable_item_key, legacy_schedule_session_id, title,
      scheduled_date, end_date, position, item_state, source_snapshot
    ) values (
      schedule_version.id, session_key, legacy_session_id, session_title,
      session_start, session_end, ordinal::integer - 1, 'scheduled', raw_session
    );
  end loop;

  update public.student_courses
  set active_schedule_version_id = schedule_version.id
  where id = course.id
  returning * into course;

  insert into public.learning_relationship_events (
    course_id, actor_user_id, target_user_id, event_type, metadata
  ) values (
    course.id, caller_id, p_student_id, 'course_drafted',
    jsonb_build_object(
      'tutorId', p_tutor_id,
      'mentorId', supervisory_mentor_id,
      'providerKind', normalized_provider,
      'scheduleId', stable_schedule.id,
      'scheduleVersionId', schedule_version.id
    )
  );

  return to_jsonb(course) || jsonb_build_object(
    'scheduleId', stable_schedule.id,
    'activeScheduleVersionId', schedule_version.id
  );
exception when invalid_text_representation then
  raise exception 'The initial Schedule schema version is invalid.';
end;
$$;

-- Compatibility entry point: old clients still create an atomic Course plus a
-- one-item review Schedule. Current clients must use the Schedule-aware RPC.
create or replace function public.create_student_course_draft(
  p_student_id uuid, p_tutor_id uuid, p_subject_node_id uuid,
  p_focus_node_id uuid, p_title text, p_service_model text,
  p_start_date date, p_scheduled_end_date date, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_start_date is null or p_scheduled_end_date is null or p_scheduled_end_date < p_start_date then
    raise exception 'The Course schedule dates are invalid.';
  end if;
  return public.create_student_course_with_schedule_draft(
    p_student_id,
    p_tutor_id,
    p_subject_node_id,
    p_focus_node_id,
    p_title,
    case when lower(btrim(coalesce(p_service_model, ''))) = 'independent_tutor'
      then 'independent_tutor' else 'kelp' end,
    case when lower(btrim(coalesce(p_service_model, ''))) = 'independent_tutor'
      then 'on_demand' else p_service_model end,
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'course-' || lower(btrim(p_idempotency_key)) || '-initial',
      'name', btrim(p_title) || ' Schedule',
      'timeZone', 'UTC',
      'sessions', jsonb_build_array(jsonb_build_object(
        'id', 'initial-plan-review',
        'title', btrim(p_title) || ' — initial plan review',
        'startDate', p_start_date,
        'endDate', p_scheduled_end_date,
        'requiresReview', true
      ))
    ),
    p_idempotency_key
  );
end;
$$;

create or replace function public.activate_student_course(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course public.student_courses%rowtype;
  classroom public.classrooms%rowtype;
  member record;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  select * into course from public.student_courses where id = p_course_id for update;
  if not found then raise exception 'The Course does not exist.'; end if;

  if course.mentor_id is not null then
    if caller_id <> course.mentor_id
      and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
      raise exception 'Only the Course Mentor can activate this Course.';
    end if;
  elsif course.provider_kind = 'independent_tutor' then
    if caller_id <> course.tutor_id
      and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
      raise exception 'Only the independent Tutor can activate this Course.';
    end if;
  else
    raise exception 'A Kelp Course requires a supervisory Mentor before activation.';
  end if;

  if course.status = 'active' then
    select * into classroom from public.classrooms where course_id = course.id;
    return jsonb_build_object('course', to_jsonb(course), 'classroom', to_jsonb(classroom));
  end if;
  if course.status <> 'draft' then raise exception 'Only a draft Course can be activated.'; end if;
  if course.active_schedule_version_id is null or not exists (
    select 1
    from public.course_schedule_versions version
    join public.course_schedules schedule on schedule.id = version.schedule_id
    where version.id = course.active_schedule_version_id
      and schedule.course_id = course.id
      and exists (
        select 1 from public.course_schedule_items item where item.version_id = version.id
      )
  ) then raise exception 'The Course requires Schedule version 1 before activation.'; end if;
  if course.mentor_id is not null and not exists (
    select 1 from public.mentor_tutor_assignments assignment
    where assignment.tutor_id = course.tutor_id
      and assignment.mentor_id = course.mentor_id
      and assignment.status = 'active'
  ) then raise exception 'The Course Tutor supervision is no longer active.'; end if;
  if not public.user_has_active_teaching_scope(course.tutor_id, course.focus_node_id)
    or (
      course.mentor_id is not null
      and not public.user_has_active_teaching_scope(course.mentor_id, course.focus_node_id)
    ) then raise exception 'The Course teaching qualification scope is no longer valid.'; end if;

  update public.student_courses
  set status = 'active', activated_at = clock_timestamp()
  where id = course.id
  returning * into course;

  insert into public.classrooms (course_id, status)
  values (course.id, 'active')
  returning * into classroom;

  for member in
    select course.student_id as user_id, 'student'::text as membership_role
    union all select course.tutor_id, 'tutor'::text
    union all select course.mentor_id, 'mentor'::text where course.mentor_id is not null
  loop
    insert into public.classroom_memberships (
      classroom_id, user_id, membership_role, status
    ) values (
      classroom.id, member.user_id, member.membership_role, 'active'
    );
    insert into public.learning_relationship_events (
      course_id, classroom_id, actor_user_id, target_user_id, event_type, metadata
    ) values (
      course.id, classroom.id, caller_id, member.user_id, 'classroom_member_joined',
      jsonb_build_object('membershipRole', member.membership_role)
    );
  end loop;

  insert into public.learning_relationship_events (
    course_id, classroom_id, actor_user_id, target_user_id, event_type
  ) values
    (course.id, classroom.id, caller_id, course.student_id, 'course_activated'),
    (course.id, classroom.id, caller_id, course.student_id, 'classroom_created');

  return jsonb_build_object('course', to_jsonb(course), 'classroom', to_jsonb(classroom));
end;
$$;

-- Transitional Schedule Generator bridge. It continues to refresh the legacy
-- Calendar/assignment mirror, but every distinct accepted payload also creates
-- and activates a new immutable authoritative version. Phase 5.G replaces this
-- compatibility command with the final reasoned/idempotent editing commands.
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
  stable_schedule public.course_schedules%rowtype;
  active_version public.course_schedule_versions%rowtype;
  new_version public.course_schedule_versions%rowtype;
  schedule_payload jsonb;
  target_legacy_schedule_id uuid;
  existing_course_id uuid;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  if p_student_course_id is null then raise exception 'A runtime Student Course is required.'; end if;

  select * into course_record
  from public.student_courses
  where id = p_student_course_id
  for update;
  if not found then raise exception 'The runtime Student Course could not be found.'; end if;

  if course_record.mentor_id is not null then
    if caller_id <> course_record.mentor_id
      and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
      raise exception 'Only the Course Mentor can synchronize this Course Schedule.';
    end if;
  elsif caller_id <> course_record.tutor_id
    and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    raise exception 'Only the independent Tutor can synchronize this Course Schedule.';
  end if;
  if course_record.status not in ('draft', 'active', 'wind_down') then
    raise exception 'The Course no longer accepts Schedule versions.';
  end if;

  schedule_payload := public.upsert_student_learning_schedule(course_record.student_id, p_schedule);
  target_legacy_schedule_id := nullif(schedule_payload ->> 'id', '')::uuid;
  if target_legacy_schedule_id is null then
    raise exception 'The synchronized Schedule did not return an ID.';
  end if;

  select student_course_id into existing_course_id
  from public.learning_schedules
  where id = target_legacy_schedule_id
  for update;
  if existing_course_id is not null and existing_course_id <> course_record.id then
    raise exception 'This Schedule source is already linked to another runtime Course.';
  end if;

  update public.learning_schedules
  set status = 'archived', archived_at = clock_timestamp(), updated_at = clock_timestamp()
  where student_course_id = course_record.id
    and id <> target_legacy_schedule_id
    and status = 'active';

  update public.learning_schedules
  set student_course_id = course_record.id,
      status = 'active',
      archived_at = null,
      updated_at = clock_timestamp()
  where id = target_legacy_schedule_id;

  select * into stable_schedule
  from public.course_schedules
  where course_id = course_record.id
  for update;
  if not found then raise exception 'The required stable Course Schedule could not be found.'; end if;

  select * into active_version
  from public.course_schedule_versions
  where id = course_record.active_schedule_version_id;

  if active_version.source_snapshot = p_schedule then
    return public.learning_schedule_json(target_legacy_schedule_id);
  end if;

  insert into public.course_schedule_versions (
    schedule_id, version_number, previous_version_id, legacy_schedule_id,
    name, time_zone, cadence, source_schema_version, source_snapshot,
    reason, created_by, metadata
  )
  select
    stable_schedule.id,
    coalesce(max(version.version_number), 0) + 1,
    course_record.active_schedule_version_id,
    target_legacy_schedule_id,
    btrim(p_schedule ->> 'name'),
    btrim(p_schedule ->> 'timeZone'),
    coalesce(p_schedule -> 'cadence', '{}'::jsonb),
    greatest(coalesce((p_schedule ->> 'schemaVersion')::integer, 1), 1),
    p_schedule,
    'Schedule Generator synchronization during the Phase 5.B compatibility window',
    caller_id,
    jsonb_build_object('compatibilityBridge', 'phase_5b')
  from public.course_schedule_versions version
  where version.schedule_id = stable_schedule.id
  returning * into new_version;

  insert into public.course_schedule_items (
    version_id, stable_item_key, legacy_schedule_session_id, title,
    scheduled_date, end_date, position, item_state, source_snapshot
  )
  select
    new_version.id,
    legacy_session.source_key,
    legacy_session.id,
    legacy_session.title,
    legacy_session.scheduled_date,
    legacy_session.end_date,
    row_number() over (
      order by legacy_session.scheduled_date, legacy_session.position, legacy_session.id
    )::integer - 1,
    'scheduled',
    legacy_session.source_snapshot
  from public.learning_schedule_sessions legacy_session
  where legacy_session.schedule_id = target_legacy_schedule_id
    and legacy_session.status = 'active';

  if not exists (
    select 1 from public.course_schedule_items where version_id = new_version.id
  ) then raise exception 'The synchronized Schedule did not contain any active items.'; end if;

  update public.student_courses
  set active_schedule_version_id = new_version.id
  where id = course_record.id;

  return public.learning_schedule_json(target_legacy_schedule_id);
exception when invalid_text_representation then
  raise exception 'The synchronized Schedule schema version or identifier is invalid.';
end;
$$;

create or replace function public.get_my_course_schedule(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  payload jsonb;
begin
  if caller_id is null then raise exception 'Authentication is required to open a Course Schedule.'; end if;
  if not public.current_user_can_read_student_course(p_course_id) then
    raise exception 'You do not have access to this Course Schedule.';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'providerKind', course.provider_kind,
      'serviceModel', course.service_model,
      'startDate', course.start_date,
      'scheduledEndDate', course.scheduled_end_date
    ),
    'schedule', jsonb_build_object(
      'id', schedule.id,
      'status', schedule.status,
      'activeVersionId', course.active_schedule_version_id,
      'versionCount', (
        select count(*) from public.course_schedule_versions counted
        where counted.schedule_id = schedule.id
      )
    ),
    'activeVersion', jsonb_build_object(
      'id', active_version.id,
      'versionNumber', active_version.version_number,
      'previousVersionId', active_version.previous_version_id,
      'name', active_version.name,
      'timeZone', active_version.time_zone,
      'cadence', active_version.cadence,
      'reason', active_version.reason,
      'createdBy', active_version.created_by,
      'createdAt', active_version.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.id,
          'stableItemKey', item.stable_item_key,
          'title', item.title,
          'scheduledDate', item.scheduled_date,
          'endDate', item.end_date,
          'position', item.position,
          'state', item.item_state,
          'legacyScheduleSessionId', item.legacy_schedule_session_id
        ) order by item.position, item.id)
        from public.course_schedule_items item
        where item.version_id = active_version.id
      ), '[]'::jsonb)
    ),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'previousVersionId', version.previous_version_id,
        'name', version.name,
        'timeZone', version.time_zone,
        'reason', version.reason,
        'createdBy', version.created_by,
        'createdAt', version.created_at,
        'itemCount', (
          select count(*) from public.course_schedule_items counted_item
          where counted_item.version_id = version.id
        ),
        'isActive', version.id = course.active_schedule_version_id
      ) order by version.version_number desc)
      from public.course_schedule_versions version
      where version.schedule_id = schedule.id
    ), '[]'::jsonb),
    'featureStatus', jsonb_build_object(
      'requiredSchedule', 'active_phase_5b',
      'versionEditing', 'planned_phase_5g',
      'progression', 'planned_phase_5e'
    )
  ) into payload
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions active_version
    on active_version.id = course.active_schedule_version_id
  where course.id = p_course_id;

  if payload is null then raise exception 'The required Course Schedule could not be found.'; end if;
  return payload;
end;
$$;

alter table public.course_schedules enable row level security;
alter table public.course_schedule_versions enable row level security;
alter table public.course_schedule_items enable row level security;

create policy "Authorized members can read Course Schedules"
on public.course_schedules for select to authenticated
using (public.current_user_can_read_student_course(course_id));

create policy "Authorized members can read Course Schedule Versions"
on public.course_schedule_versions for select to authenticated
using (exists (
  select 1 from public.course_schedules schedule
  where schedule.id = course_schedule_versions.schedule_id
    and public.current_user_can_read_student_course(schedule.course_id)
));

create policy "Authorized members can read Course Schedule Items"
on public.course_schedule_items for select to authenticated
using (exists (
  select 1
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where version.id = course_schedule_items.version_id
    and public.current_user_can_read_student_course(schedule.course_id)
));

revoke all on public.course_schedules from public, anon, authenticated;
revoke all on public.course_schedule_versions from public, anon, authenticated;
revoke all on public.course_schedule_items from public, anon, authenticated;
grant select on public.course_schedules to authenticated;
grant select on public.course_schedule_versions to authenticated;
grant select on public.course_schedule_items to authenticated;
grant select on public.course_schedules to service_role;
grant select on public.course_schedule_versions to service_role;
grant select on public.course_schedule_items to service_role;

revoke all on function public.reject_course_schedule_version_mutation() from public, anon, authenticated;
revoke all on function public.enforce_student_course_required_schedule() from public, anon, authenticated;
revoke all on function public.create_student_course_with_schedule_draft(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.create_student_course_draft(
  uuid, uuid, uuid, uuid, text, text, date, date, text
) from public, anon, authenticated;
revoke all on function public.activate_student_course(uuid) from public, anon, authenticated;
revoke all on function public.upsert_student_course_learning_schedule(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule(uuid) from public, anon, authenticated;

grant execute on function public.create_student_course_with_schedule_draft(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text
) to authenticated;
grant execute on function public.create_student_course_draft(
  uuid, uuid, uuid, uuid, text, text, date, date, text
) to authenticated;
grant execute on function public.activate_student_course(uuid) to authenticated;
grant execute on function public.upsert_student_course_learning_schedule(uuid, jsonb)
  to authenticated;
grant execute on function public.get_my_course_schedule(uuid) to authenticated;

comment on table public.course_schedules is
  'Stable one-per-Course Schedule identity. Immutable versions carry the academic plan.';
comment on table public.course_schedule_versions is
  'Immutable ordered Course Schedule versions. The active version pointer belongs to student_courses.';
comment on table public.course_schedule_items is
  'Immutable items inside one Course Schedule Version. Progress is recorded separately in Phase 5.E.';
comment on column public.learning_schedules.student_course_id is
  'Compatibility mirror for Calendar and practice assignments. course_schedules and course_schedule_versions are authoritative from Phase 5.B.';
comment on function public.create_student_course_with_schedule_draft(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text
) is 'Atomically creates a runtime Course, stable Schedule, immutable version 1, items, and legacy Calendar/assignment mirror.';
comment on function public.get_my_course_schedule(uuid) is
  'Authorized Phase 5.B Course Schedule projection with the active immutable version and auditable version summary.';
