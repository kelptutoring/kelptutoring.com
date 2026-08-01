-- Phase 5.D: reasoned, version-aware structural Schedule editing.
--
-- The immutable Course Schedule Version remains authoritative. The older
-- learning_schedules tables are refreshed in the same transaction only as a
-- compatibility read mirror for Calendar, Classroom Overview, and retained
-- assignment references.

insert into public.authorization_capabilities (capability_key, description)
values ('schedule.edit', 'Publish an immediate, reasoned structural Course Schedule revision.')
on conflict (capability_key) do update set description = excluded.description;

insert into public.role_capabilities (role_key, capability_key)
values
  ('teacher', 'schedule.edit'),
  ('tutor', 'schedule.edit'),
  ('mentor', 'schedule.edit')
on conflict do nothing;

alter table public.course_schedule_items
  add column if not exists item_kind text not null default 'curriculum_topic',
  add column if not exists curriculum_node_id uuid
    references public.curriculum_nodes(id) on delete restrict;

alter table public.course_schedule_items
  drop constraint if exists course_schedule_items_kind_check,
  add constraint course_schedule_items_kind_check check (
    item_kind in ('curriculum_topic', 'review', 'exam')
  );

create table if not exists public.course_schedule_change_reasons (
  id uuid primary key default gen_random_uuid(),
  reason_code text not null unique,
  label text not null,
  description text not null,
  allowed_change_types text[] not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint course_schedule_change_reasons_code_check check (
    reason_code ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint course_schedule_change_reasons_label_check check (
    btrim(label) <> '' and char_length(label) <= 100
  ),
  constraint course_schedule_change_reasons_description_check check (
    btrim(description) <> '' and char_length(description) <= 500
  ),
  constraint course_schedule_change_reasons_types_check check (
    cardinality(allowed_change_types) > 0
    and allowed_change_types <@ array['included', 'dropped', 'restored', 'reordered']::text[]
  ),
  constraint course_schedule_change_reasons_status_check check (
    status in ('active', 'retired')
  )
);

insert into public.course_schedule_change_reasons (
  reason_code, label, description, allowed_change_types
)
values
  (
    'curriculum_adjustment',
    'Curriculum adjustment',
    'The future plan needs a reasoned academic adjustment.',
    array['included', 'dropped', 'restored', 'reordered']::text[]
  ),
  (
    'review_required',
    'Review required',
    'A review meeting is needed before the learner moves forward.',
    array['included', 'reordered']::text[]
  ),
  (
    'exam_scheduled',
    'Exam scheduled',
    'An exam must occupy a regular academic meeting slot.',
    array['included', 'reordered']::text[]
  ),
  (
    'pacing_adjustment',
    'Pacing adjustment',
    'The future order or timing needs to match the learner''s current pace.',
    array['included', 'dropped', 'restored', 'reordered']::text[]
  ),
  (
    'student_request',
    'Student request',
    'The learner requested a justified change to the future academic plan.',
    array['included', 'dropped', 'restored', 'reordered']::text[]
  ),
  (
    'learning_gap',
    'Learning gap',
    'The learner needs an additional or reordered step to close a learning gap.',
    array['included', 'restored', 'reordered']::text[]
  ),
  (
    'administrative_correction',
    'Administrative correction',
    'Staff must correct a future structural planning error without rewriting history.',
    array['included', 'dropped', 'restored', 'reordered']::text[]
  ),
  (
    'other',
    'Other academic reason',
    'A concise learner-facing explanation records an academic reason not covered above.',
    array['included', 'dropped', 'restored', 'reordered']::text[]
  )
on conflict (reason_code) do update set
  label = excluded.label,
  description = excluded.description,
  allowed_change_types = excluded.allowed_change_types,
  status = 'active';

create table if not exists public.course_schedule_version_changes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  stable_item_key text not null,
  change_type text not null,
  reason_id uuid not null references public.course_schedule_change_reasons(id) on delete restrict,
  student_explanation text not null,
  private_staff_note text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint course_schedule_version_changes_key_check check (
    btrim(stable_item_key) <> '' and char_length(stable_item_key) <= 180
  ),
  constraint course_schedule_version_changes_type_check check (
    change_type in ('included', 'dropped', 'restored', 'reordered')
  ),
  constraint course_schedule_version_changes_explanation_check check (
    char_length(btrim(student_explanation)) between 10 and 500
  ),
  constraint course_schedule_version_changes_private_note_check check (
    private_staff_note is null
    or char_length(btrim(private_staff_note)) between 1 and 2000
  ),
  constraint course_schedule_version_changes_before_check check (
    before_snapshot is null or jsonb_typeof(before_snapshot) = 'object'
  ),
  constraint course_schedule_version_changes_after_check check (
    after_snapshot is null or jsonb_typeof(after_snapshot) = 'object'
  ),
  constraint course_schedule_version_changes_one_action unique (
    version_id, change_type, stable_item_key
  )
);

create index if not exists course_schedule_version_changes_course_idx
on public.course_schedule_version_changes (course_id, created_at desc, id);

create table if not exists public.course_schedule_publish_commands (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.course_schedules(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  expected_version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  published_version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint course_schedule_publish_commands_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_schedule_publish_commands_request_check check (
    jsonb_typeof(request_payload) = 'object'
  ),
  constraint course_schedule_publish_commands_response_check check (
    jsonb_typeof(response_payload) = 'object'
  ),
  constraint course_schedule_publish_commands_actor_key unique (
    schedule_id, actor_user_id, idempotency_key
  )
);

create table if not exists public.course_schedule_notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null references public.student_courses(id) on delete restrict,
  schedule_version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint course_schedule_notification_events_type_check check (
    event_type in ('schedule_version_published')
  ),
  constraint course_schedule_notification_events_payload_check check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint course_schedule_notification_events_read_check check (
    read_at is null or read_at >= created_at
  ),
  constraint course_schedule_notification_events_recipient_version_key unique (
    recipient_user_id, schedule_version_id, event_type
  )
);

create index if not exists course_schedule_notification_events_recipient_idx
on public.course_schedule_notification_events (recipient_user_id, created_at desc, id);

create or replace function public.current_user_can_read_course_schedule_history(
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1
    from public.student_courses course
    where course.id = p_course_id
      and auth.uid() in (course.tutor_id, course.mentor_id)
  ), false)
  or public.authorization_user_has_capability(auth.uid(), 'authorization.manage');
$$;

create or replace function public.current_user_can_edit_course_schedule(
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    public.authorization_user_has_capability(auth.uid(), 'schedule.edit')
    and exists (
      select 1
      from public.student_courses course
      where course.id = p_course_id
        and auth.uid() in (course.tutor_id, course.mentor_id)
    ),
    false
  );
$$;

create or replace function public.publish_course_schedule_version(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_items jsonb,
  p_change_reasons jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_idempotency_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  request_payload jsonb := jsonb_build_object(
    'courseId', p_course_id,
    'expectedVersionId', p_expected_version_id,
    'items', p_items,
    'changeReasons', p_change_reasons
  );
  course_record public.student_courses%rowtype;
  stable_schedule public.course_schedules%rowtype;
  active_version public.course_schedule_versions%rowtype;
  prior_item public.course_schedule_items%rowtype;
  new_version public.course_schedule_versions%rowtype;
  prior_receipt public.course_schedule_publish_commands%rowtype;
  raw_item jsonb;
  raw_reason jsonb;
  ordinal bigint;
  stable_key text;
  item_title text;
  item_kind_value text;
  item_state_value text;
  item_date date;
  item_end date;
  item_position integer;
  curriculum_id uuid;
  target_legacy_schedule_id uuid;
  legacy_session_id uuid;
  normalized_sessions jsonb;
  new_snapshot jsonb;
  response_payload jsonb;
  change_count integer := 0;
  included_count integer := 0;
  dropped_count integer := 0;
  restored_count integer := 0;
  reordered_required boolean := false;
  old_retained_order text[];
  new_retained_order text[];
  reason_record record;
begin
  if caller_id is null then
    raise exception 'Authentication is required to publish a Course Schedule Version.';
  end if;
  if p_course_id is null or p_expected_version_id is null then
    raise exception 'The Course and expected active Schedule Version are required.';
  end if;
  if normalized_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Schedule publishing idempotency key is invalid.';
  end if;
  select * into course_record
  from public.student_courses
  where id = p_course_id
  for update;
  if not found then raise exception 'The Course could not be found.'; end if;
  if not public.current_user_can_edit_course_schedule(course_record.id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can edit this Course Schedule.';
  end if;
  if course_record.status not in ('draft', 'active') then
    raise exception 'This Course does not currently accept ordinary structural Schedule edits.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 500 then
    raise exception 'A structural Schedule Version must contain between 1 and 500 items.';
  end if;
  if p_change_reasons is null or jsonb_typeof(p_change_reasons) <> 'array' then
    raise exception 'Structural Schedule changes require a governed reason list.';
  end if;

  select * into stable_schedule
  from public.course_schedules
  where course_id = course_record.id
  for update;
  if not found then raise exception 'The required stable Course Schedule could not be found.'; end if;

  select * into prior_receipt
  from public.course_schedule_publish_commands receipt
  where receipt.schedule_id = stable_schedule.id
    and receipt.actor_user_id = caller_id
    and receipt.idempotency_key = normalized_idempotency_key;
  if found then
    if prior_receipt.request_payload <> request_payload then
      raise exception 'This Schedule idempotency key is already bound to a different request.';
    end if;
    return prior_receipt.response_payload || jsonb_build_object('idempotentReplay', true);
  end if;

  if course_record.active_schedule_version_id <> p_expected_version_id then
    raise exception 'The Schedule changed after this page loaded. Refresh it before publishing your edits.';
  end if;

  select * into active_version
  from public.course_schedule_versions
  where id = course_record.active_schedule_version_id
    and schedule_id = stable_schedule.id;
  if not found then raise exception 'The active Course Schedule Version could not be found.'; end if;

  -- Validate the complete proposed immutable Version before any durable write.
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where btrim(coalesce(item ->> 'stableItemKey', '')) = ''
      or char_length(btrim(item ->> 'stableItemKey')) > 180
      or btrim(coalesce(item ->> 'title', '')) = ''
      or char_length(btrim(item ->> 'title')) > 240
      or coalesce(item ->> 'kind', 'curriculum_topic')
        not in ('curriculum_topic', 'review', 'exam')
      or coalesce(item ->> 'state', 'scheduled')
        not in ('scheduled', 'dropped', 'requeued')
      or coalesce(item ->> 'position', '') !~ '^[0-9]+$'
  ) then
    raise exception 'Every proposed Schedule item requires a valid key, title, kind, state, and position.';
  end if;

  if jsonb_array_length(p_items) <> (
      select count(distinct btrim(item ->> 'stableItemKey'))
      from jsonb_array_elements(p_items) item
    ) then raise exception 'Every proposed Schedule item requires a unique stable key.'; end if;
  if jsonb_array_length(p_items) <> (
      select count(distinct (item ->> 'position')::integer)
      from jsonb_array_elements(p_items) item
    ) or (select min((item ->> 'position')::integer) from jsonb_array_elements(p_items) item) <> 0
      or (select max((item ->> 'position')::integer) from jsonb_array_elements(p_items) item)
        <> jsonb_array_length(p_items) - 1 then
    raise exception 'Proposed Schedule positions must be unique and contiguous from zero.';
  end if;
  if exists (
    select 1
    from public.course_schedule_items old_item
    where old_item.version_id = active_version.id
      and not exists (
        select 1 from jsonb_array_elements(p_items) proposed
        where btrim(proposed ->> 'stableItemKey') = old_item.stable_item_key
      )
  ) then
    raise exception 'Existing Schedule items cannot disappear; mark a future item as dropped instead.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_items) item
    where coalesce(item ->> 'state', 'scheduled') in ('scheduled', 'requeued')
  ) then raise exception 'A Course Schedule Version requires at least one effective item.'; end if;

  -- Reason entries are public academic explanations plus optional private notes.
  if exists (
    select 1
    from jsonb_array_elements(p_change_reasons) reason
    left join public.course_schedule_change_reasons catalog
      on catalog.reason_code = btrim(reason ->> 'reasonCode')
      and catalog.status = 'active'
    where coalesce(reason ->> 'changeType', '')
        not in ('included', 'dropped', 'restored', 'reordered')
      or btrim(coalesce(reason ->> 'stableItemKey', '')) = ''
      or catalog.id is null
      or not ((reason ->> 'changeType') = any(catalog.allowed_change_types))
      or not exists (
        select 1 from jsonb_array_elements(p_items) proposed
        where btrim(proposed ->> 'stableItemKey') = btrim(reason ->> 'stableItemKey')
      )
      or char_length(btrim(coalesce(reason ->> 'studentExplanation', ''))) not between 10 and 500
      or char_length(btrim(coalesce(reason ->> 'privateStaffNote', ''))) > 2000
  ) then raise exception 'A structural Schedule reason is invalid or unavailable for that change type.'; end if;
  if jsonb_array_length(p_change_reasons) <> (
    select count(distinct concat(reason ->> 'changeType', ':', reason ->> 'stableItemKey'))
    from jsonb_array_elements(p_change_reasons) reason
  ) then raise exception 'Each structural change may contain only one governed reason.'; end if;

  for raw_item, ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(p_items) with ordinality item(value, ordinality)
  loop
    stable_key := btrim(raw_item ->> 'stableItemKey');
    item_title := btrim(raw_item ->> 'title');
    item_kind_value := coalesce(raw_item ->> 'kind', 'curriculum_topic');
    item_state_value := coalesce(raw_item ->> 'state', 'scheduled');
    item_position := (raw_item ->> 'position')::integer;
    begin
      item_date := (raw_item ->> 'scheduledDate')::date;
      item_end := coalesce(nullif(raw_item ->> 'endDate', '')::date, item_date);
      curriculum_id := nullif(raw_item ->> 'curriculumNodeId', '')::uuid;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception 'Every proposed Schedule item requires valid dates and an optional valid Curriculum node.';
    end;
    if item_date is null or item_end < item_date then
      raise exception 'Every proposed Schedule item requires an ordered date range.';
    end if;
    if item_kind_value = 'curriculum_topic' and curriculum_id is not null
      and not public.curriculum_node_is_within(curriculum_id, course_record.subject_node_id) then
      raise exception 'A Curriculum topic must belong to the Course Subject.';
    end if;

    select * into prior_item
    from public.course_schedule_items item
    where item.version_id = active_version.id and item.stable_item_key = stable_key;

    if found then
      if prior_item.title <> item_title
        or prior_item.item_kind <> item_kind_value
        or prior_item.curriculum_node_id is distinct from curriculum_id then
        raise exception 'Existing Schedule item identity cannot be rewritten; include a new item instead.';
      end if;
      if prior_item.scheduled_date < current_date and (
        prior_item.scheduled_date <> item_date
        or prior_item.end_date <> item_end
        or prior_item.position <> item_position
        or prior_item.item_state <> item_state_value
      ) then raise exception 'Past Schedule items are locked and cannot be changed.'; end if;

      if prior_item.item_state in ('scheduled', 'requeued') and item_state_value = 'dropped' then
        dropped_count := dropped_count + 1;
        if not exists (
          select 1 from jsonb_array_elements(p_change_reasons) reason
          where reason ->> 'changeType' = 'dropped'
            and btrim(reason ->> 'stableItemKey') = stable_key
        ) then raise exception 'Dropping a future Schedule item requires its governed reason.'; end if;
      elsif prior_item.item_state = 'dropped' and item_state_value in ('scheduled', 'requeued') then
        restored_count := restored_count + 1;
        if not exists (
          select 1 from jsonb_array_elements(p_change_reasons) reason
          where reason ->> 'changeType' = 'restored'
            and btrim(reason ->> 'stableItemKey') = stable_key
        ) then raise exception 'Restoring a dropped Schedule item requires its governed reason.'; end if;
      elsif prior_item.item_state in ('scheduled', 'requeued')
        and item_state_value in ('scheduled', 'requeued')
        and prior_item.item_state <> item_state_value then
        raise exception 'Scheduled and requeued lifecycle transitions belong to the missed-session flow.';
      elsif prior_item.item_state = 'dropped' and item_state_value = 'dropped'
        and (
          prior_item.scheduled_date <> item_date
          or prior_item.end_date <> item_end
          or prior_item.position <> item_position
        ) then raise exception 'A dropped Schedule item remains immutable until it is explicitly restored.';
      end if;
    else
      included_count := included_count + 1;
      if item_state_value = 'dropped' then
        raise exception 'A newly included Schedule item cannot begin in the dropped state.';
      end if;
      if not exists (
        select 1 from jsonb_array_elements(p_change_reasons) reason
        where reason ->> 'changeType' = 'included'
          and btrim(reason ->> 'stableItemKey') = stable_key
      ) then raise exception 'Including a Schedule item requires its governed reason.'; end if;
    end if;
  end loop;

  select array_agg(old_item.stable_item_key order by old_item.position, old_item.id)
  into old_retained_order
  from public.course_schedule_items old_item
  where old_item.version_id = active_version.id
    and old_item.item_state in ('scheduled', 'requeued')
    and exists (
      select 1 from jsonb_array_elements(p_items) proposed
      where proposed ->> 'stableItemKey' = old_item.stable_item_key
        and coalesce(proposed ->> 'state', 'scheduled') in ('scheduled', 'requeued')
    );

  select array_agg(proposed ->> 'stableItemKey' order by (proposed ->> 'position')::integer)
  into new_retained_order
  from jsonb_array_elements(p_items) proposed
  where coalesce(proposed ->> 'state', 'scheduled') in ('scheduled', 'requeued')
    and exists (
      select 1 from public.course_schedule_items old_item
      where old_item.version_id = active_version.id
        and old_item.stable_item_key = proposed ->> 'stableItemKey'
        and old_item.item_state in ('scheduled', 'requeued')
    );

  reordered_required := old_retained_order is distinct from new_retained_order
    or (
      included_count = 0 and dropped_count = 0 and restored_count = 0
      and exists (
        select 1
        from public.course_schedule_items old_item
        join lateral (
          select proposed
          from jsonb_array_elements(p_items) proposed
          where proposed ->> 'stableItemKey' = old_item.stable_item_key
        ) match on true
        where old_item.version_id = active_version.id
          and old_item.item_state in ('scheduled', 'requeued')
          and coalesce(match.proposed ->> 'state', 'scheduled') in ('scheduled', 'requeued')
          and (
            old_item.position <> (match.proposed ->> 'position')::integer
            or old_item.scheduled_date <> (match.proposed ->> 'scheduledDate')::date
            or old_item.end_date <> coalesce(nullif(match.proposed ->> 'endDate', '')::date,
                                             (match.proposed ->> 'scheduledDate')::date)
          )
      )
    );
  if reordered_required and not exists (
    select 1 from jsonb_array_elements(p_change_reasons) reason
    where reason ->> 'changeType' = 'reordered'
  ) then raise exception 'Reordering or directly rescheduling future items requires a governed reason.'; end if;

  -- Reject reason entries that do not describe a server-observed root change.
  for raw_reason in select value from jsonb_array_elements(p_change_reasons)
  loop
    stable_key := btrim(raw_reason ->> 'stableItemKey');
    if raw_reason ->> 'changeType' = 'included' and exists (
        select 1 from public.course_schedule_items item
        where item.version_id = active_version.id and item.stable_item_key = stable_key
      ) then raise exception 'An included-item reason references an existing Schedule item.';
    elsif raw_reason ->> 'changeType' = 'dropped' and not exists (
        select 1 from public.course_schedule_items old_item
        join lateral (
          select proposed from jsonb_array_elements(p_items) proposed
          where proposed ->> 'stableItemKey' = stable_key
        ) match on true
        where old_item.version_id = active_version.id
          and old_item.stable_item_key = stable_key
          and old_item.item_state in ('scheduled', 'requeued')
          and match.proposed ->> 'state' = 'dropped'
      ) then raise exception 'A dropped-item reason does not match the proposed structural change.';
    elsif raw_reason ->> 'changeType' = 'restored' and not exists (
        select 1 from public.course_schedule_items old_item
        join lateral (
          select proposed from jsonb_array_elements(p_items) proposed
          where proposed ->> 'stableItemKey' = stable_key
        ) match on true
        where old_item.version_id = active_version.id
          and old_item.stable_item_key = stable_key
          and old_item.item_state = 'dropped'
          and coalesce(match.proposed ->> 'state', 'scheduled') in ('scheduled', 'requeued')
      ) then raise exception 'A restored-item reason does not match the proposed structural change.';
    elsif raw_reason ->> 'changeType' = 'reordered' and (
      not reordered_required
      or not exists (
        select 1
        from public.course_schedule_items old_item
        join lateral (
          select proposed from jsonb_array_elements(p_items) proposed
          where proposed ->> 'stableItemKey' = stable_key
        ) match on true
        where old_item.version_id = active_version.id
          and old_item.stable_item_key = stable_key
          and old_item.item_state in ('scheduled', 'requeued')
          and coalesce(match.proposed ->> 'state', 'scheduled') in ('scheduled', 'requeued')
          and (
            old_item.position <> (match.proposed ->> 'position')::integer
            or old_item.scheduled_date <> (match.proposed ->> 'scheduledDate')::date
            or old_item.end_date <> coalesce(nullif(match.proposed ->> 'endDate', '')::date,
                                             (match.proposed ->> 'scheduledDate')::date)
          )
      )
    ) then
      raise exception 'A reordered-item reason was supplied without a corresponding change to that item.';
    end if;
  end loop;

  change_count := jsonb_array_length(p_change_reasons);
  if change_count = 0 then
    raise exception 'Publishing an identical Schedule Version is not allowed.';
  end if;

  target_legacy_schedule_id := active_version.legacy_schedule_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', item ->> 'stableItemKey',
      'title', item ->> 'title',
      'kind', coalesce(item ->> 'kind', 'curriculum_topic'),
      'curriculumNodeId', nullif(item ->> 'curriculumNodeId', ''),
      'startDate', item ->> 'scheduledDate',
      'endDate', coalesce(nullif(item ->> 'endDate', ''), item ->> 'scheduledDate'),
      'state', coalesce(item ->> 'state', 'scheduled')
    ) order by (item ->> 'position')::integer
  ), '[]'::jsonb)
  into normalized_sessions
  from jsonb_array_elements(p_items) item
  where coalesce(item ->> 'state', 'scheduled') in ('scheduled', 'requeued');

  new_snapshot := jsonb_build_object(
    'schemaVersion', 3,
    'id', coalesce(active_version.source_snapshot ->> 'id', 'course-' || course_record.id::text),
    'name', active_version.name,
    'timeZone', active_version.time_zone,
    'cadence', active_version.cadence,
    'sessions', normalized_sessions
  );

  if target_legacy_schedule_id is null then
    target_legacy_schedule_id := gen_random_uuid();
    insert into public.learning_schedules (
      id, student_id, student_course_id, created_by, source_key, name,
      time_zone, status, source_schema_version, source_snapshot,
      created_at, updated_at, archived_at
    ) values (
      target_legacy_schedule_id,
      course_record.student_id,
      course_record.id,
      caller_id,
      'course-' || course_record.id::text || '-calendar-mirror',
      active_version.name,
      active_version.time_zone,
      'active',
      3,
      new_snapshot,
      clock_timestamp(),
      clock_timestamp(),
      null
    );
  else
    update public.learning_schedules
    set name = active_version.name,
        time_zone = active_version.time_zone,
        status = 'active',
        source_schema_version = 3,
        source_snapshot = new_snapshot,
        updated_at = clock_timestamp(),
        archived_at = null
    where id = target_legacy_schedule_id and student_course_id = course_record.id;
    if not found then raise exception 'The Calendar compatibility mirror is no longer linked to this Course.'; end if;
  end if;

  update public.learning_schedule_sessions
  set status = 'removed', updated_at = clock_timestamp()
  where schedule_id = target_legacy_schedule_id;

  for raw_item in
    select item
    from jsonb_array_elements(p_items) item
    where coalesce(item ->> 'state', 'scheduled') in ('scheduled', 'requeued')
    order by (item ->> 'position')::integer
  loop
    insert into public.learning_schedule_sessions (
      schedule_id, source_key, title, scheduled_date, end_date, position,
      status, source_snapshot, created_at, updated_at
    ) values (
      target_legacy_schedule_id,
      btrim(raw_item ->> 'stableItemKey'),
      btrim(raw_item ->> 'title'),
      (raw_item ->> 'scheduledDate')::date,
      coalesce(nullif(raw_item ->> 'endDate', '')::date, (raw_item ->> 'scheduledDate')::date),
      (raw_item ->> 'position')::integer,
      'active',
      raw_item,
      clock_timestamp(),
      clock_timestamp()
    ) on conflict (schedule_id, source_key) do update set
      title = excluded.title,
      scheduled_date = excluded.scheduled_date,
      end_date = excluded.end_date,
      position = excluded.position,
      status = 'active',
      source_snapshot = excluded.source_snapshot,
      updated_at = clock_timestamp();
  end loop;

  insert into public.course_schedule_versions (
    schedule_id, version_number, previous_version_id, legacy_schedule_id,
    name, time_zone, cadence, source_schema_version, source_snapshot,
    reason, created_by, metadata
  )
  select
    stable_schedule.id,
    coalesce(max(version.version_number), 0) + 1,
    active_version.id,
    target_legacy_schedule_id,
    active_version.name,
    active_version.time_zone,
    active_version.cadence,
    3,
    new_snapshot,
    'Reasoned structural Schedule revision',
    caller_id,
    jsonb_build_object(
      'phase', '5.D',
      'expectedVersionId', p_expected_version_id,
      'idempotencyKey', normalized_idempotency_key
    )
  from public.course_schedule_versions version
  where version.schedule_id = stable_schedule.id
  returning * into new_version;

  for raw_item in
    select item from jsonb_array_elements(p_items) item
    order by (item ->> 'position')::integer
  loop
    stable_key := btrim(raw_item ->> 'stableItemKey');
    select id into legacy_session_id
    from public.learning_schedule_sessions
    where schedule_id = target_legacy_schedule_id and source_key = stable_key;
    if legacy_session_id is null then
      select legacy_schedule_session_id into legacy_session_id
      from public.course_schedule_items
      where version_id = active_version.id and stable_item_key = stable_key;
    end if;

    insert into public.course_schedule_items (
      version_id, stable_item_key, legacy_schedule_session_id, title,
      scheduled_date, end_date, position, item_state, source_snapshot,
      item_kind, curriculum_node_id
    ) values (
      new_version.id,
      stable_key,
      legacy_session_id,
      btrim(raw_item ->> 'title'),
      (raw_item ->> 'scheduledDate')::date,
      coalesce(nullif(raw_item ->> 'endDate', '')::date, (raw_item ->> 'scheduledDate')::date),
      (raw_item ->> 'position')::integer,
      coalesce(raw_item ->> 'state', 'scheduled'),
      raw_item,
      coalesce(raw_item ->> 'kind', 'curriculum_topic'),
      nullif(raw_item ->> 'curriculumNodeId', '')::uuid
    );
  end loop;

  for raw_reason in select value from jsonb_array_elements(p_change_reasons)
  loop
    stable_key := btrim(raw_reason ->> 'stableItemKey');
    select catalog.id, catalog.reason_code into reason_record
    from public.course_schedule_change_reasons catalog
    where catalog.reason_code = btrim(raw_reason ->> 'reasonCode')
      and catalog.status = 'active';

    insert into public.course_schedule_version_changes (
      course_id, version_id, stable_item_key, change_type, reason_id,
      student_explanation, private_staff_note, before_snapshot, after_snapshot,
      actor_user_id
    ) values (
      course_record.id,
      new_version.id,
      stable_key,
      raw_reason ->> 'changeType',
      reason_record.id,
      btrim(raw_reason ->> 'studentExplanation'),
      nullif(btrim(coalesce(raw_reason ->> 'privateStaffNote', '')), ''),
      (
        select to_jsonb(item) - 'id' - 'version_id' - 'created_at'
        from public.course_schedule_items item
        where item.version_id = active_version.id and item.stable_item_key = stable_key
      ),
      (
        select to_jsonb(item) - 'id' - 'version_id' - 'created_at'
        from public.course_schedule_items item
        where item.version_id = new_version.id and item.stable_item_key = stable_key
      ),
      caller_id
    );
  end loop;

  update public.student_courses
  set active_schedule_version_id = new_version.id
  where id = course_record.id;

  insert into public.course_schedule_notification_events (
    recipient_user_id, actor_user_id, course_id, schedule_version_id,
    event_type, payload
  )
  select recipient.user_id, caller_id, course_record.id, new_version.id,
    'schedule_version_published',
    jsonb_build_object(
      'courseId', course_record.id,
      'courseTitle', course_record.title,
      'versionId', new_version.id,
      'versionNumber', new_version.version_number,
      'actorId', caller_id,
      'changeCount', change_count
    )
  from (
    select course_record.student_id as user_id
    union select course_record.tutor_id
    union select course_record.mentor_id where course_record.mentor_id is not null
  ) recipient;

  response_payload := jsonb_build_object(
    'courseId', course_record.id,
    'scheduleId', stable_schedule.id,
    'previousVersionId', active_version.id,
    'publishedVersionId', new_version.id,
    'versionNumber', new_version.version_number,
    'changeCount', change_count,
    'idempotentReplay', false
  );

  insert into public.course_schedule_publish_commands (
    schedule_id, actor_user_id, idempotency_key, expected_version_id,
    published_version_id, request_payload, response_payload
  ) values (
    stable_schedule.id, caller_id, normalized_idempotency_key,
    p_expected_version_id, new_version.id, request_payload, response_payload
  );

  return response_payload;
end;
$$;

-- The old bridge may still retrieve the existing Calendar mirror for callers
-- that repeat the exact active payload. It can no longer publish a distinct
-- Version and therefore cannot bypass Phase 5.D reasons or concurrency checks.
create or replace function public.upsert_student_course_learning_schedule(
  p_student_course_id uuid,
  p_schedule jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  active_version public.course_schedule_versions%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  select * into course_record
  from public.student_courses
  where id = p_student_course_id;
  if not found then raise exception 'The runtime Student Course could not be found.'; end if;
  if not public.current_user_can_edit_course_schedule(course_record.id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can access this Course Schedule mirror.';
  end if;
  select * into active_version
  from public.course_schedule_versions
  where id = course_record.active_schedule_version_id;
  if active_version.source_snapshot <> p_schedule then
    raise exception 'Direct Schedule synchronization is closed. Publish a reasoned structural Schedule Version instead.';
  end if;
  return public.learning_schedule_json(active_version.legacy_schedule_id);
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
  staff_history boolean;
  can_edit boolean;
  payload jsonb;
begin
  if caller_id is null then raise exception 'Authentication is required to open a Course Schedule.'; end if;
  if not public.current_user_can_read_student_course(p_course_id) then
    raise exception 'You do not have access to this Course Schedule.';
  end if;
  staff_history := public.current_user_can_read_course_schedule_history(p_course_id);
  can_edit := public.current_user_can_edit_course_schedule(p_course_id);

  select jsonb_build_object(
    'schemaVersion', 3,
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'providerKind', course.provider_kind,
      'serviceModel', course.service_model,
      'startDate', course.start_date,
      'activatedStartDate', course.activated_start_date,
      'startDateLocked', course.activated_start_date is not null,
      'scheduledEndDate', course.scheduled_end_date,
      'windDownEndsOn', course.wind_down_ends_on
    ),
    'schedule', jsonb_build_object(
      'id', schedule.id,
      'status', schedule.status,
      'activeVersionId', course.active_schedule_version_id,
      'versionCount', case when staff_history then (
        select count(*) from public.course_schedule_versions counted
        where counted.schedule_id = schedule.id
      ) else null end
    ),
    'permissions', jsonb_build_object(
      'canEditStructure', can_edit,
      'canReadSupersededVersions', staff_history
    ),
    'activeVersion', jsonb_build_object(
      'id', active_version.id,
      'versionNumber', active_version.version_number,
      'previousVersionId', case when staff_history then active_version.previous_version_id else null end,
      'name', active_version.name,
      'timeZone', active_version.time_zone,
      'cadence', active_version.cadence,
      'reason', active_version.reason,
      'createdBy', active_version.created_by,
      'createdAt', active_version.created_at,
      'dateRange', jsonb_build_object(
        'firstDate', active_bounds.first_date,
        'lastDate', active_bounds.last_date,
        'effectiveItemCount', active_bounds.effective_item_count
      ),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.id,
          'stableItemKey', item.stable_item_key,
          'title', item.title,
          'kind', item.item_kind,
          'curriculumNodeId', item.curriculum_node_id,
          'scheduledDate', item.scheduled_date,
          'endDate', item.end_date,
          'position', item.position,
          'state', item.item_state,
          'legacyScheduleSessionId', item.legacy_schedule_session_id
        ) order by item.position, item.id)
        from public.course_schedule_items item
        where item.version_id = active_version.id
          and (staff_history or item.item_state in ('scheduled', 'requeued'))
      ), '[]'::jsonb),
      'changes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'stableItemKey', change.stable_item_key,
          'changeType', change.change_type,
          'reasonCode', reason.reason_code,
          'reasonLabel', reason.label,
          'studentExplanation', change.student_explanation,
          'privateStaffNote', case when staff_history then change.private_staff_note else null end,
          'actorUserId', change.actor_user_id,
          'createdAt', change.created_at
        ) order by change.created_at, change.id)
        from public.course_schedule_version_changes change
        join public.course_schedule_change_reasons reason on reason.id = change.reason_id
        where change.version_id = active_version.id
      ), '[]'::jsonb)
    ),
    'versions', case when staff_history then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'previousVersionId', version.previous_version_id,
        'name', version.name,
        'timeZone', version.time_zone,
        'reason', version.reason,
        'createdBy', version.created_by,
        'createdAt', version.created_at,
        'itemCount', version_bounds.total_item_count,
        'dateRange', jsonb_build_object(
          'firstDate', version_bounds.first_date,
          'lastDate', version_bounds.last_date,
          'effectiveItemCount', version_bounds.effective_item_count
        ),
        'status', case when version.id = course.active_schedule_version_id then 'active' else 'superseded' end
      ) order by version.version_number desc)
      from public.course_schedule_versions version
      cross join lateral (
        select
          min(item.scheduled_date) filter (where item.item_state in ('scheduled', 'requeued')) as first_date,
          max(item.end_date) filter (where item.item_state in ('scheduled', 'requeued')) as last_date,
          count(*) filter (where item.item_state in ('scheduled', 'requeued')) as effective_item_count,
          count(*) as total_item_count
        from public.course_schedule_items item
        where item.version_id = version.id
      ) version_bounds
      where version.schedule_id = schedule.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'featureStatus', jsonb_build_object(
      'requiredSchedule', 'active_phase_5b',
      'courseDateSynchronization', 'active_phase_5c',
      'structuralEditing', 'active_phase_5d',
      'progression', 'planned_phase_5e'
    )
  ) into payload
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions active_version
    on active_version.id = course.active_schedule_version_id
  cross join lateral public.course_schedule_version_date_bounds(active_version.id) active_bounds
  where course.id = p_course_id;

  if payload is null then raise exception 'The required Course Schedule could not be found.'; end if;
  return payload;
end;
$$;

alter table public.course_schedule_change_reasons enable row level security;
alter table public.course_schedule_version_changes enable row level security;
alter table public.course_schedule_publish_commands enable row level security;
alter table public.course_schedule_notification_events enable row level security;

drop policy if exists "Authorized members can read Course Schedule Versions"
on public.course_schedule_versions;
create policy "Active Students and authorized staff read Schedule Versions"
on public.course_schedule_versions for select to authenticated
using (exists (
  select 1
  from public.course_schedules schedule
  join public.student_courses course on course.id = schedule.course_id
  where schedule.id = course_schedule_versions.schedule_id
    and (
      (course.student_id = (select auth.uid())
        and course.active_schedule_version_id = course_schedule_versions.id)
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

drop policy if exists "Authorized members can read Course Schedule Items"
on public.course_schedule_items;
create policy "Active Students and authorized staff read Schedule Items"
on public.course_schedule_items for select to authenticated
using (exists (
  select 1
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  join public.student_courses course on course.id = schedule.course_id
  where version.id = course_schedule_items.version_id
    and (
      (course.student_id = (select auth.uid())
        and course.active_schedule_version_id = version.id
        and course_schedule_items.item_state in ('scheduled', 'requeued'))
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

create policy "Authenticated users can read governed Schedule reasons"
on public.course_schedule_change_reasons for select to authenticated
using (true);

create policy "Authorized staff can read Schedule change audit"
on public.course_schedule_version_changes for select to authenticated
using (public.current_user_can_read_course_schedule_history(course_id));

create policy "Recipients can read their Schedule notification events"
on public.course_schedule_notification_events for select to authenticated
using (recipient_user_id = (select auth.uid()));

revoke all on public.course_schedule_change_reasons from public, anon, authenticated;
revoke all on public.course_schedule_version_changes from public, anon, authenticated;
revoke all on public.course_schedule_publish_commands from public, anon, authenticated;
revoke all on public.course_schedule_notification_events from public, anon, authenticated;
grant select on public.course_schedule_change_reasons to authenticated;
grant select on public.course_schedule_version_changes to authenticated;
grant select on public.course_schedule_notification_events to authenticated;
grant select on public.course_schedule_change_reasons to service_role;
grant select on public.course_schedule_version_changes to service_role;
grant select on public.course_schedule_publish_commands to service_role;
grant select on public.course_schedule_notification_events to service_role;

revoke all on function public.current_user_can_read_course_schedule_history(uuid)
  from public, anon, authenticated;
revoke all on function public.current_user_can_edit_course_schedule(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_course_schedule_version(uuid, uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.upsert_student_course_learning_schedule(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.current_user_can_read_course_schedule_history(uuid)
  to authenticated;
grant execute on function public.current_user_can_edit_course_schedule(uuid)
  to authenticated;
grant execute on function public.publish_course_schedule_version(uuid, uuid, jsonb, jsonb, text)
  to authenticated;
grant execute on function public.upsert_student_course_learning_schedule(uuid, jsonb)
  to authenticated;
grant execute on function public.get_my_course_schedule(uuid)
  to authenticated;

comment on column public.course_schedule_items.item_kind is
  'Structural academic item kind. Project milestones and Assignment deadlines live outside the Course Schedule.';
comment on table public.course_schedule_version_changes is
  'Immutable reasoned root changes that produced an authoritative Course Schedule Version; private notes remain staff-only.';
comment on table public.course_schedule_publish_commands is
  'Idempotency receipts binding an actor request to exactly one published immutable Schedule Version.';
comment on table public.course_schedule_notification_events is
  'In-app Schedule notification facts. Later delivery adapters may send email or SMS without affecting the publishing transaction.';
comment on function public.publish_course_schedule_version(uuid, uuid, jsonb, jsonb, text) is
  'Phase 5.D atomic structural publisher with assignment-scoped authority, governed reasons, immutable history, stale-screen rejection, mirror synchronization, audit, and notifications.';
comment on function public.upsert_student_course_learning_schedule(uuid, jsonb) is
  'Read-only compatibility replay for the exact active Schedule payload. Distinct revisions must use publish_course_schedule_version.';
comment on function public.get_my_course_schedule(uuid) is
  'Phase 5.D role-aware projection: Students receive one active effective Schedule; assigned staff may inspect superseded Versions and private notes.';
