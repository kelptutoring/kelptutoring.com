-- Phase 5.F.3: immutable six-hour target locks, append-only occurrence
-- outcomes, disputes, private evidence, and outcome-aware target reflow.
-- Financial values here are recommendations for later ledgers; this migration
-- never posts Student credits or Tutor settlements.

insert into public.authorization_roles (
  role_key, display_name, description, sort_order
) values (
  'quality_assistant',
  'Quality Assistant',
  'Audits learning operations and resolves exceptional Course incidents.',
  45
)
on conflict (role_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.authorization_capabilities (capability_key, description)
values
  ('workspace.quality_assistant', 'Open the Quality Assistant workspace.'),
  ('course.outcome.oversight', 'Audit and resolve exceptional Course occurrence outcomes.')
on conflict (capability_key) do update set description = excluded.description;

insert into public.role_capabilities (role_key, capability_key)
values
  ('quality_assistant', 'workspace.quality_assistant'),
  ('quality_assistant', 'course.outcome.oversight'),
  ('admin', 'course.outcome.oversight')
on conflict (role_key, capability_key) do nothing;

create or replace function public.current_user_can_oversee_course_outcomes(
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    public.authorization_user_has_capability(
      auth.uid(), 'course.outcome.oversight'
    )
    and exists (
      select 1 from public.student_courses course where course.id = p_course_id
    ),
    false
  );
$$;

create or replace function public.current_user_can_manage_course_outcome(
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.student_courses course
    where course.id = p_course_id
      and auth.uid() in (course.tutor_id, course.mentor_id)
  ), false)
  or public.current_user_can_oversee_course_outcomes(p_course_id);
$$;

create or replace function public.course_schedule_slot_starts_at(
  p_slot public.course_schedule_academic_slots
)
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select case
    when p_slot.local_start_time is null then null
    else (p_slot.local_date + p_slot.local_start_time)
      at time zone p_slot.time_zone
  end;
$$;

create table if not exists public.course_schedule_target_locks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  academic_slot_id uuid not null
    references public.course_schedule_academic_slots(id) on delete restrict,
  mapping_revision_id uuid not null
    references public.course_schedule_target_mapping_revisions(id) on delete restrict,
  mapped_target_id uuid not null
    references public.course_schedule_academic_slot_targets(id) on delete restrict,
  schedule_item_id uuid not null
    references public.course_schedule_items(id) on delete restrict,
  stable_slot_key text not null,
  stable_item_key text not null,
  target_snapshot jsonb not null,
  slot_starts_at timestamptz not null,
  lock_at timestamptz not null,
  locked_at timestamptz not null,
  lock_source text not null,
  constraint course_schedule_target_locks_source_check check (
    lock_source in ('scheduled_six_hour', 'occurrence_submission', 'trusted_backfill')
  ),
  constraint course_schedule_target_locks_key_check check (
    btrim(stable_slot_key) <> '' and btrim(stable_item_key) <> ''
  ),
  constraint course_schedule_target_locks_time_check check (
    lock_at = slot_starts_at - interval '6 hours' and locked_at >= lock_at
  ),
  constraint course_schedule_target_locks_snapshot_check check (
    jsonb_typeof(target_snapshot) = 'object'
  ),
  constraint course_schedule_target_locks_slot_key unique (academic_slot_id)
);

create index if not exists course_schedule_target_locks_course_time_idx
on public.course_schedule_target_locks (course_id, slot_starts_at, id);

create table if not exists public.course_schedule_occurrence_outcome_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  academic_slot_id uuid not null
    references public.course_schedule_academic_slots(id) on delete restrict,
  target_lock_id uuid not null
    references public.course_schedule_target_locks(id) on delete restrict,
  schedule_item_id uuid not null
    references public.course_schedule_items(id) on delete restrict,
  supersedes_event_id uuid
    references public.course_schedule_occurrence_outcome_events(id) on delete restrict,
  event_action text not null,
  resolution_status text not null,
  delivery_kind text,
  lesson_origin text not null,
  attendance_basis text not null,
  charge_recommendation text not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  public_explanation text,
  private_staff_note text,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  response_deadline timestamptz not null,
  dispute_deadline timestamptz,
  fixed_at timestamptz,
  settlement_not_before timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint course_schedule_occurrence_outcomes_action_check check (
    event_action in (
      'submitted', 'corrected', 'automatic_resolved', 'student_confirmed',
      'mentor_resolved', 'quality_resolved'
    )
  ),
  constraint course_schedule_occurrence_outcomes_status_check check (
    resolution_status in ('pending', 'delivered', 'not_delivered', 'cancelled')
  ),
  constraint course_schedule_occurrence_outcomes_delivery_kind_check check (
    delivery_kind is null
    or delivery_kind in (
      'curriculum_topic', 'review', 'practice', 'exam', 'wrap_up'
    )
  ),
  constraint course_schedule_occurrence_outcomes_origin_check check (
    lesson_origin in ('recurring', 'on_demand', 'extra')
  ),
  constraint course_schedule_occurrence_outcomes_attendance_check check (
    attendance_basis in (
      'joint_presence_verified', 'student_no_show', 'tutor_no_show',
      'no_platform_presence', 'technical_uncertain', 'outside_kelp_claim',
      'cancelled', 'unreported'
    )
  ),
  constraint course_schedule_occurrence_outcomes_charge_check check (
    charge_recommendation in (
      'full_charge', 'half_charge', 'no_charge', 'pending'
    )
  ),
  constraint course_schedule_occurrence_outcomes_actor_check check (
    actor_role in ('student', 'tutor', 'mentor', 'quality_assistant', 'system')
  ),
  constraint course_schedule_occurrence_outcomes_relation_check check (
    (event_action = 'submitted' and supersedes_event_id is null)
    or event_action = 'automatic_resolved'
    or (
      event_action not in ('submitted', 'automatic_resolved')
      and supersedes_event_id is not null
    )
  ),
  constraint course_schedule_occurrence_outcomes_resolution_check check (
    (
      resolution_status = 'pending' and delivery_kind is null
      and charge_recommendation = 'pending' and fixed_at is null
    )
    or (
      resolution_status = 'delivered' and delivery_kind is not null
      and charge_recommendation in ('full_charge', 'no_charge', 'pending')
    )
    or (
      resolution_status = 'not_delivered' and delivery_kind is null
      and charge_recommendation in ('half_charge', 'no_charge', 'pending')
    )
    or (
      resolution_status = 'cancelled' and delivery_kind is null
      and attendance_basis = 'cancelled'
      and charge_recommendation = 'no_charge'
    )
  ),
  constraint course_schedule_occurrence_outcomes_public_check check (
    public_explanation is null
    or char_length(btrim(public_explanation)) between 10 and 1000
  ),
  constraint course_schedule_occurrence_outcomes_private_check check (
    private_staff_note is null
    or char_length(btrim(private_staff_note)) between 1 and 2000
  ),
  constraint course_schedule_occurrence_outcomes_time_check check (
    response_deadline >= occurred_at
    and settlement_not_before >= occurred_at + interval '14 days'
    and (dispute_deadline is null or dispute_deadline >= recorded_at)
    and (fixed_at is null or fixed_at >= occurred_at)
  ),
  constraint course_schedule_occurrence_outcomes_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists course_schedule_occurrence_outcomes_slot_idx
on public.course_schedule_occurrence_outcome_events (
  academic_slot_id, recorded_at desc, id desc
);
create index if not exists course_schedule_occurrence_outcomes_course_idx
on public.course_schedule_occurrence_outcome_events (
  course_id, occurred_at desc, id desc
);

create table if not exists public.course_schedule_occurrence_commands (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  command_kind text not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint course_schedule_occurrence_commands_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_schedule_occurrence_commands_kind_check check (
    command_kind in (
      'record_outcome', 'submit_dispute', 'resolve_dispute',
      'confirm_delivery', 'reserve_evidence', 'activate_evidence'
    )
  ),
  constraint course_schedule_occurrence_commands_payload_check check (
    jsonb_typeof(request_payload) = 'object'
    and jsonb_typeof(response_payload) = 'object'
  ),
  constraint course_schedule_occurrence_commands_actor_key unique (
    course_id, actor_user_id, idempotency_key
  )
);

create table if not exists public.course_schedule_occurrence_dispute_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  academic_slot_id uuid not null
    references public.course_schedule_academic_slots(id) on delete restrict,
  outcome_event_id uuid not null
    references public.course_schedule_occurrence_outcome_events(id) on delete restrict,
  related_dispute_event_id uuid
    references public.course_schedule_occurrence_dispute_events(id) on delete restrict,
  event_action text not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  public_explanation text not null,
  private_staff_note text,
  created_at timestamptz not null default clock_timestamp(),
  constraint course_schedule_occurrence_disputes_action_check check (
    event_action in ('submitted', 'upheld', 'rejected', 'withdrawn')
  ),
  constraint course_schedule_occurrence_disputes_relation_check check (
    (event_action = 'submitted' and related_dispute_event_id is null)
    or (event_action <> 'submitted' and related_dispute_event_id is not null)
  ),
  constraint course_schedule_occurrence_disputes_actor_check check (
    actor_role in ('student', 'mentor', 'quality_assistant')
  ),
  constraint course_schedule_occurrence_disputes_public_check check (
    char_length(btrim(public_explanation)) between 10 and 1000
  ),
  constraint course_schedule_occurrence_disputes_private_check check (
    private_staff_note is null
    or char_length(btrim(private_staff_note)) between 1 and 2000
  )
);

create index if not exists course_schedule_occurrence_disputes_slot_idx
on public.course_schedule_occurrence_dispute_events (
  academic_slot_id, created_at desc, id desc
);

create unique index if not exists course_schedule_occurrence_one_resolution_idx
on public.course_schedule_occurrence_dispute_events (related_dispute_event_id)
where related_dispute_event_id is not null;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'course-outcome-evidence', 'course-outcome-evidence', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.course_schedule_occurrence_evidence (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  academic_slot_id uuid not null
    references public.course_schedule_academic_slots(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_bucket text not null default 'course-outcome-evidence',
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'reserved',
  idempotency_key text not null,
  reserved_at timestamptz not null default clock_timestamp(),
  upload_expires_at timestamptz not null,
  activated_at timestamptz,
  retention_until date not null default (current_date + 730),
  metadata jsonb not null default '{}'::jsonb,
  constraint course_schedule_occurrence_evidence_bucket_check check (
    storage_bucket = 'course-outcome-evidence'
  ),
  constraint course_schedule_occurrence_evidence_path_check check (
    storage_path = course_id::text || '/' || academic_slot_id::text || '/' || id::text
  ),
  constraint course_schedule_occurrence_evidence_name_check check (
    btrim(original_file_name) <> '' and char_length(original_file_name) <= 255
    and original_file_name !~ '[\\/]' and original_file_name !~ '[[:cntrl:]]'
  ),
  constraint course_schedule_occurrence_evidence_mime_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint course_schedule_occurrence_evidence_size_check check (
    size_bytes between 1 and 20971520
  ),
  constraint course_schedule_occurrence_evidence_status_check check (
    status in ('reserved', 'active')
  ),
  constraint course_schedule_occurrence_evidence_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_schedule_occurrence_evidence_lifecycle_check check (
    (status = 'reserved' and activated_at is null)
    or (status = 'active' and activated_at is not null)
  ),
  constraint course_schedule_occurrence_evidence_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint course_schedule_occurrence_evidence_actor_key unique (
    uploaded_by, idempotency_key
  )
);

create index if not exists course_schedule_occurrence_evidence_slot_idx
on public.course_schedule_occurrence_evidence (
  academic_slot_id, status, activated_at desc, id
);

create table if not exists public.course_schedule_occurrence_notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  course_id uuid not null references public.student_courses(id) on delete restrict,
  academic_slot_id uuid not null
    references public.course_schedule_academic_slots(id) on delete restrict,
  outcome_event_id uuid
    references public.course_schedule_occurrence_outcome_events(id) on delete restrict,
  dispute_event_id uuid
    references public.course_schedule_occurrence_dispute_events(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  constraint course_schedule_occurrence_notifications_type_check check (
    event_type in (
      'outcome_resolved', 'outcome_pivoted',
      'outcome_automatically_not_delivered', 'outcome_corrected',
      'outcome_disputed', 'outcome_dispute_resolved'
    )
  ),
  constraint course_schedule_occurrence_notifications_payload_check check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint course_schedule_occurrence_notifications_source_check check (
    outcome_event_id is not null or dispute_event_id is not null
  ),
  constraint course_schedule_occurrence_notifications_read_check check (
    read_at is null or read_at >= created_at
  )
);

create unique index if not exists course_schedule_occurrence_notifications_source_key
on public.course_schedule_occurrence_notification_events (
  recipient_user_id,
  coalesce(outcome_event_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(dispute_event_id, '00000000-0000-0000-0000-000000000000'::uuid),
  event_type
);
create index if not exists course_schedule_occurrence_notifications_recipient_idx
on public.course_schedule_occurrence_notification_events (
  recipient_user_id, created_at desc, id
);

create or replace function public.reject_course_schedule_occurrence_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Course occurrence history is append-only.';
end;
$$;

drop trigger if exists course_schedule_target_locks_immutable
on public.course_schedule_target_locks;
create trigger course_schedule_target_locks_immutable
before update or delete on public.course_schedule_target_locks
for each row execute function public.reject_course_schedule_occurrence_immutable_mutation();

drop trigger if exists course_schedule_occurrence_outcomes_immutable
on public.course_schedule_occurrence_outcome_events;
create trigger course_schedule_occurrence_outcomes_immutable
before update or delete on public.course_schedule_occurrence_outcome_events
for each row execute function public.reject_course_schedule_occurrence_immutable_mutation();

drop trigger if exists course_schedule_occurrence_commands_immutable
on public.course_schedule_occurrence_commands;
create trigger course_schedule_occurrence_commands_immutable
before update or delete on public.course_schedule_occurrence_commands
for each row execute function public.reject_course_schedule_occurrence_immutable_mutation();

drop trigger if exists course_schedule_occurrence_disputes_immutable
on public.course_schedule_occurrence_dispute_events;
create trigger course_schedule_occurrence_disputes_immutable
before update or delete on public.course_schedule_occurrence_dispute_events
for each row execute function public.reject_course_schedule_occurrence_immutable_mutation();

create or replace function public.course_schedule_occurrence_actor_role(
  p_course public.student_courses,
  p_actor_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p_actor_id = p_course.tutor_id then 'tutor'
    when p_actor_id = p_course.mentor_id then 'mentor'
    when public.authorization_user_has_capability(
      p_actor_id, 'course.outcome.oversight'
    ) then 'quality_assistant'
    else null
  end;
$$;

create or replace function public.course_schedule_occurrence_response_deadline(
  p_slot_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select public.course_schedule_slot_starts_at(next_slot)
      from public.course_schedule_academic_slots next_slot
      where next_slot.course_id = slot.course_id
        and next_slot.version_id = slot.version_id
        and next_slot.source_kind = 'recurring_pattern'
        and public.course_schedule_slot_starts_at(next_slot)
          > public.course_schedule_slot_starts_at(slot)
      order by public.course_schedule_slot_starts_at(next_slot), next_slot.id
      limit 1
    ),
    public.course_schedule_slot_starts_at(slot) + interval '7 days'
  )
  from public.course_schedule_academic_slots slot
  where slot.id = p_slot_id and slot.source_kind = 'recurring_pattern';
$$;

create or replace function public.course_schedule_occurrence_latest_event(
  p_slot_id uuid
)
returns public.course_schedule_occurrence_outcome_events
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select event
  from public.course_schedule_occurrence_outcome_events event
  where event.academic_slot_id = p_slot_id
  order by event.recorded_at desc, event.id desc
  limit 1;
$$;

create or replace function public.lock_course_schedule_slot_target(
  p_slot_id uuid,
  p_as_of timestamptz default clock_timestamp(),
  p_lock_source text default 'scheduled_six_hour'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  slot_record public.course_schedule_academic_slots%rowtype;
  course_record public.student_courses%rowtype;
  revision_record public.course_schedule_target_mapping_revisions%rowtype;
  mapped_target public.course_schedule_academic_slot_targets%rowtype;
  item_record public.course_schedule_items%rowtype;
  existing_lock public.course_schedule_target_locks%rowtype;
  created_lock public.course_schedule_target_locks%rowtype;
  starts_at timestamptz;
begin
  select * into existing_lock
  from public.course_schedule_target_locks target_lock
  where target_lock.academic_slot_id = p_slot_id;
  if found then
    return jsonb_build_object(
      'id', existing_lock.id, 'status', 'already_locked',
      'scheduleItemId', existing_lock.schedule_item_id,
      'lockAt', existing_lock.lock_at
    );
  end if;

  select * into slot_record
  from public.course_schedule_academic_slots slot
  where slot.id = p_slot_id for share;
  if not found or slot_record.source_kind <> 'recurring_pattern' then
    raise exception 'Only a recurring academic occurrence can lock a target.';
  end if;
  select * into course_record
  from public.student_courses course
  where course.id = slot_record.course_id for update;
  if not found or course_record.active_schedule_version_id <> slot_record.version_id then
    raise exception 'Only an active Course Schedule occurrence can lock a target.';
  end if;

  starts_at := public.course_schedule_slot_starts_at(slot_record);
  if p_as_of < starts_at - interval '6 hours' then
    raise exception 'The six-hour target lock has not started.';
  end if;
  select * into revision_record
  from public.course_schedule_target_mapping_revisions revision
  where revision.version_id = slot_record.version_id
  order by revision.revision_number desc, revision.id desc limit 1;
  if not found then
    raise exception 'The occurrence requires an effective target mapping before it can lock.';
  end if;
  select target.* into mapped_target
  from public.course_schedule_academic_slot_targets target
  where target.mapping_revision_id = revision_record.id
    and target.academic_slot_id = slot_record.id
    and target.mapping_state = 'targeted';
  if not found or mapped_target.schedule_item_id is null then
    raise exception 'This academic occurrence has no mapped target to lock.';
  end if;
  select * into item_record
  from public.course_schedule_items item
  where item.id = mapped_target.schedule_item_id;

  insert into public.course_schedule_target_locks (
    course_id, version_id, academic_slot_id, mapping_revision_id,
    mapped_target_id, schedule_item_id, stable_slot_key, stable_item_key,
    target_snapshot, slot_starts_at, lock_at, locked_at, lock_source
  ) values (
    course_record.id, slot_record.version_id, slot_record.id, revision_record.id,
    mapped_target.id, item_record.id, slot_record.stable_slot_key,
    item_record.stable_item_key,
    jsonb_build_object(
      'scheduleItemId', item_record.id,
      'stableItemKey', item_record.stable_item_key,
      'title', item_record.title,
      'kind', item_record.item_kind,
      'plannedDate', item_record.scheduled_date,
      'difficultyLevel', item_record.difficulty_level,
      'mappingRevisionId', revision_record.id,
      'mappingRevisionNumber', revision_record.revision_number
    ),
    starts_at, starts_at - interval '6 hours', p_as_of, p_lock_source
  ) returning * into created_lock;

  perform public.refresh_course_schedule_target_mapping(
    course_record.id, course_record.active_schedule_version_id,
    'manual_refresh', null
  );

  return jsonb_build_object(
    'id', created_lock.id, 'status', 'locked',
    'scheduleItemId', created_lock.schedule_item_id,
    'stableItemKey', created_lock.stable_item_key,
    'lockAt', created_lock.lock_at,
    'slotStartsAt', created_lock.slot_starts_at
  );
end;
$$;

create or replace function public.lock_due_course_schedule_targets(
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  slot_record record;
  locked_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Due target locking is a trusted scheduled operation.';
  end if;
  for slot_record in
    select slot.id
    from public.course_schedule_academic_slots slot
    join public.student_courses course on course.id = slot.course_id
    where slot.source_kind = 'recurring_pattern'
      and course.active_schedule_version_id = slot.version_id
      and course.status in ('active', 'wind_down')
      and public.course_schedule_slot_starts_at(slot) - interval '6 hours' <= p_as_of
      and not exists (
        select 1 from public.course_schedule_target_locks target_lock
        where target_lock.academic_slot_id = slot.id
      )
    order by public.course_schedule_slot_starts_at(slot), slot.id
  loop
    begin
      perform public.lock_course_schedule_slot_target(
        slot_record.id, p_as_of, 'scheduled_six_hour'
      );
      locked_count := locked_count + 1;
    exception
      when others then
        if sqlerrm <> 'This academic occurrence has no mapped target to lock.' then
          raise;
        end if;
    end;
  end loop;
  return jsonb_build_object(
    'status', 'completed', 'lockedCount', locked_count, 'asOf', p_as_of
  );
end;
$$;

create or replace function public.insert_course_schedule_occurrence_notifications(
  p_event public.course_schedule_occurrence_outcome_events
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  notification_type text;
  notify_mentor boolean;
begin
  select * into course_record
  from public.student_courses course where course.id = p_event.course_id;
  notification_type := case
    when p_event.event_action = 'automatic_resolved'
      and p_event.resolution_status = 'not_delivered'
      then 'outcome_automatically_not_delivered'
    when p_event.event_action in ('corrected', 'mentor_resolved', 'quality_resolved')
      then 'outcome_corrected'
    when p_event.delivery_kind is not null
      and p_event.delivery_kind <> 'curriculum_topic' then 'outcome_pivoted'
    else 'outcome_resolved'
  end;
  notify_mentor := notification_type in (
    'outcome_automatically_not_delivered', 'outcome_corrected', 'outcome_pivoted'
  );
  insert into public.course_schedule_occurrence_notification_events (
    recipient_user_id, actor_user_id, course_id, academic_slot_id,
    outcome_event_id, event_type, payload
  )
  select
    recipient.user_id, p_event.actor_user_id, p_event.course_id,
    p_event.academic_slot_id, p_event.id, notification_type,
    jsonb_build_object(
      'resolutionStatus', p_event.resolution_status,
      'deliveryKind', p_event.delivery_kind,
      'lessonOrigin', p_event.lesson_origin,
      'chargeRecommendation', p_event.charge_recommendation,
      'occurredAt', p_event.occurred_at,
      'settlementNotBefore', p_event.settlement_not_before
    )
  from (
    select course_record.student_id as user_id
    union select course_record.tutor_id
    union select course_record.mentor_id where notify_mentor
  ) recipient
  where recipient.user_id is not null
  on conflict do nothing;
end;
$$;

alter table public.course_schedule_target_mapping_revisions
  drop constraint if exists course_schedule_target_mapping_reason_check,
  add constraint course_schedule_target_mapping_reason_check check (
    mapping_reason in (
      'initial_generation', 'schedule_version_activated', 'progress_reflow',
      'manual_refresh', 'outcome_reflow'
    )
  );

-- Keep the Phase 5.F.2.2 implementation for static plans. Recurring plans now
-- preserve locked historical targets and allocate only unlocked future slots.
alter function public.course_schedule_target_mapping_snapshot(uuid, uuid)
rename to course_schedule_target_mapping_snapshot_phase5f2_2;

create or replace function public.course_schedule_target_mapping_snapshot(
  p_course_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  version_record public.course_schedule_versions%rowtype;
  payload jsonb;
begin
  select * into course_record
  from public.student_courses course where course.id = p_course_id;
  if not found then raise exception 'The Course could not be found for target mapping.'; end if;
  if course_record.active_schedule_version_id <> p_version_id then
    raise exception 'Target mapping can be generated only for the active Schedule Version.';
  end if;
  if course_record.service_model <> 'recurring' then
    return public.course_schedule_target_mapping_snapshot_phase5f2_2(
      p_course_id, p_version_id
    );
  end if;
  select version.* into version_record
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where version.id = p_version_id and schedule.course_id = p_course_id;

  with latest_outcomes as (
    select distinct on (event.academic_slot_id)
      event.academic_slot_id, event.resolution_status, event.delivery_kind,
      event.lesson_origin, event.attendance_basis, event.charge_recommendation
    from public.course_schedule_occurrence_outcome_events event
    where event.version_id = version_record.id
    order by event.academic_slot_id, event.recorded_at desc, event.id desc
  ),
  locked as (
    select
      target_lock.academic_slot_id, target_lock.schedule_item_id,
      target_lock.stable_item_key, target_lock.target_snapshot,
      outcome.resolution_status, outcome.delivery_kind,
      outcome.lesson_origin, outcome.attendance_basis,
      outcome.charge_recommendation
    from public.course_schedule_target_locks target_lock
    left join latest_outcomes outcome
      on outcome.academic_slot_id = target_lock.academic_slot_id
    where target_lock.version_id = version_record.id
  ),
  item_states as (
    select
      item.id, item.stable_item_key, item.title, item.item_kind,
      item.scheduled_date, item.position, item.difficulty_level,
      case when item.item_kind = 'curriculum_topic'
        then public.course_schedule_item_is_currently_studied(
          course_record.id, item.id
        ) else false end as studied,
      exists (
        select 1 from locked
        where locked.schedule_item_id = item.id
          and (
            locked.resolution_status is null
            or locked.resolution_status = 'pending'
          )
      ) as reserved_by_unresolved_lock,
      exists (
        select 1 from locked
        where locked.schedule_item_id = item.id
          and locked.resolution_status = 'delivered'
      ) as delivered_once
    from public.course_schedule_items item
    where item.version_id = version_record.id
      and item.item_state in ('scheduled', 'requeued')
  ),
  remaining as (
    select item.*,
      row_number() over (order by item.position, item.id) - 1 as remaining_position
    from item_states item
    where not item.reserved_by_unresolved_lock
      and (
        (item.item_kind = 'curriculum_topic' and not item.studied)
        or (item.item_kind <> 'curriculum_topic' and not item.delivered_once)
      )
  ),
  unlocked_slots as (
    select slot.*,
      row_number() over (order by slot.position, slot.id) - 1 as unlocked_ordinal
    from public.course_schedule_academic_slots slot
    where slot.version_id = version_record.id
      and not exists (
        select 1 from locked where locked.academic_slot_id = slot.id
      )
  ),
  all_slots as (
    select slot.* from public.course_schedule_academic_slots slot
    where slot.version_id = version_record.id
  ),
  slot_mappings as (
    select
      slot.id as slot_id, slot.stable_slot_key, slot.local_date,
      slot.local_start_time, slot.duration_minutes, slot.time_zone,
      slot.position as slot_position,
      coalesce(locked.schedule_item_id, target.id) as target_item_id,
      coalesce(locked.stable_item_key, target.stable_item_key) as stable_item_key,
      coalesce(locked.target_snapshot ->> 'title', target.title) as title,
      coalesce(locked.target_snapshot ->> 'kind', target.item_kind) as item_kind,
      coalesce(
        nullif(locked.target_snapshot ->> 'plannedDate', '')::date,
        target.scheduled_date
      ) as scheduled_date,
      coalesce(
        (select item.position from public.course_schedule_items item
          where item.id = locked.schedule_item_id),
        target.position
      ) as target_position,
      coalesce(
        locked.target_snapshot ->> 'difficultyLevel', target.difficulty_level
      ) as difficulty_level,
      locked.resolution_status, locked.delivery_kind, locked.lesson_origin,
      locked.attendance_basis, locked.charge_recommendation,
      locked.academic_slot_id is not null as locked
    from all_slots slot
    left join locked on locked.academic_slot_id = slot.id
    left join unlocked_slots unlocked on unlocked.id = slot.id
    left join remaining target
      on target.remaining_position = unlocked.unlocked_ordinal
  ),
  counts as (
    select
      (select count(*) from all_slots) as slot_count,
      (select count(*) from unlocked_slots) as unlocked_count,
      (select count(*) from remaining) as remaining_count
  )
  select jsonb_build_object(
    'schemaVersion', 2,
    'courseId', course_record.id,
    'versionId', version_record.id,
    'serviceModel', course_record.service_model,
    'timeZone', version_record.time_zone,
    'slotMappings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slotId', mapping.slot_id,
        'stableSlotKey', mapping.stable_slot_key,
        'localDate', mapping.local_date,
        'localStartTime', to_char(mapping.local_start_time, 'HH24:MI'),
        'durationMinutes', mapping.duration_minutes,
        'timeZone', mapping.time_zone,
        'slotPosition', mapping.slot_position,
        'mappingState', case
          when mapping.locked then 'targeted'
          when mapping.target_item_id is null then 'open'
          else 'targeted'
        end,
        'targetScheduleItemId', mapping.target_item_id,
        'targetStableItemKey', mapping.stable_item_key,
        'targetTitle', mapping.title,
        'targetKind', mapping.item_kind,
        'targetPlannedDate', mapping.scheduled_date,
        'targetPosition', mapping.target_position,
        'difficultyLevel', mapping.difficulty_level,
        'targetLocked', mapping.locked,
        'outcome', case when mapping.resolution_status is null then null
          else jsonb_build_object(
            'resolutionStatus', mapping.resolution_status,
            'deliveryKind', mapping.delivery_kind,
            'lessonOrigin', mapping.lesson_origin,
            'attendanceBasis', mapping.attendance_basis,
            'chargeRecommendation', mapping.charge_recommendation
          ) end
      ) order by mapping.slot_position, mapping.slot_id)
      from slot_mappings mapping
    ), '[]'::jsonb),
    'awaitingFutureSlot', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scheduleItemId', target.id,
        'stableItemKey', target.stable_item_key,
        'title', target.title,
        'kind', target.item_kind,
        'plannedDate', target.scheduled_date,
        'position', target.position,
        'difficultyLevel', target.difficulty_level,
        'status', 'awaiting_future_slot'
      ) order by target.remaining_position, target.id)
      from remaining target cross join counts
      where target.remaining_position >= counts.unlocked_count
    ), '[]'::jsonb),
    'capacity', (
      select jsonb_build_object(
        'status', case
          when counts.remaining_count > counts.unlocked_count
            then 'awaiting_future_slots'
          when counts.remaining_count < counts.unlocked_count then 'open_slots'
          else 'mapped'
        end,
        'slotCount', counts.slot_count,
        'unlockedSlotCount', counts.unlocked_count,
        'remainingTargetCount', counts.remaining_count,
        'mappedTargetCount', least(counts.unlocked_count, counts.remaining_count),
        'awaitingFutureSlotCount', greatest(
          counts.remaining_count - counts.unlocked_count, 0
        ),
        'openSlotCount', greatest(
          counts.unlocked_count - counts.remaining_count, 0
        ),
        'requiresPurchase', false,
        'requiresAutomaticClassBooking', false
      ) from counts
    ),
    'bookingTargetSelection', jsonb_build_object(
      'enabled', false,
      'selectionMode', 'automatic_next_unstudied',
      'recommendedTarget', null,
      'selectableTargets', '[]'::jsonb
    )
  ) into payload;
  return payload;
end;
$$;

create or replace function public.refresh_course_schedule_target_mapping(
  p_course_id uuid,
  p_version_id uuid,
  p_mapping_reason text,
  p_source_progress_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  progress_event public.course_progress_events%rowtype;
  snapshot_payload jsonb;
  signature_value text;
  latest_revision public.course_schedule_target_mapping_revisions%rowtype;
  new_revision public.course_schedule_target_mapping_revisions%rowtype;
  next_revision_number integer;
  mapping jsonb;
begin
  if p_mapping_reason not in (
    'initial_generation', 'schedule_version_activated', 'progress_reflow',
    'manual_refresh', 'outcome_reflow'
  ) then
    raise exception 'The Course Schedule target-mapping reason is invalid.';
  end if;
  select * into course_record
  from public.student_courses where id = p_course_id for update;
  if not found then
    raise exception 'The Course could not be found for target-mapping refresh.';
  end if;
  if course_record.active_schedule_version_id <> p_version_id then
    return jsonb_build_object(
      'courseId', course_record.id, 'versionId', p_version_id,
      'status', 'inactive_version_ignored'
    );
  end if;
  if not exists (
    select 1 from public.course_schedule_academic_slots slot
    where slot.version_id = p_version_id
  ) then
    return jsonb_build_object(
      'courseId', course_record.id, 'versionId', p_version_id,
      'status', case when course_record.service_model = 'recurring'
        then 'meeting_pattern_review_required'
        else 'academic_slot_generation_required' end
    );
  end if;
  if p_source_progress_event_id is not null then
    select * into progress_event
    from public.course_progress_events event
    where event.id = p_source_progress_event_id
      and event.course_id = course_record.id;
    if not found then
      raise exception 'The progress event does not belong to this Course.';
    end if;
  end if;

  snapshot_payload := public.course_schedule_target_mapping_snapshot(
    course_record.id, p_version_id
  );
  signature_value := md5(snapshot_payload::text);
  select * into latest_revision
  from public.course_schedule_target_mapping_revisions revision
  where revision.version_id = p_version_id
  order by revision.revision_number desc, revision.id desc limit 1;
  if found and latest_revision.mapping_signature = signature_value then
    return jsonb_build_object(
      'courseId', course_record.id, 'versionId', p_version_id,
      'mappingRevisionId', latest_revision.id,
      'revisionNumber', latest_revision.revision_number,
      'status', 'unchanged'
    );
  end if;
  select coalesce(max(revision.revision_number), 0) + 1
  into next_revision_number
  from public.course_schedule_target_mapping_revisions revision
  where revision.version_id = p_version_id;
  insert into public.course_schedule_target_mapping_revisions (
    course_id, version_id, revision_number, mapping_reason,
    source_progress_event_id, actor_user_id, mapping_signature, snapshot
  ) values (
    course_record.id, p_version_id, next_revision_number, p_mapping_reason,
    p_source_progress_event_id, coalesce(progress_event.actor_user_id, auth.uid()),
    signature_value, snapshot_payload
  ) returning * into new_revision;
  for mapping in
    select value from jsonb_array_elements(snapshot_payload -> 'slotMappings')
  loop
    insert into public.course_schedule_academic_slot_targets (
      mapping_revision_id, academic_slot_id, schedule_item_id,
      mapping_state, slot_position, target_position
    ) values (
      new_revision.id, (mapping ->> 'slotId')::uuid,
      nullif(mapping ->> 'targetScheduleItemId', '')::uuid,
      mapping ->> 'mappingState',
      (mapping ->> 'slotPosition')::integer,
      nullif(mapping ->> 'targetPosition', '')::integer
    );
  end loop;
  return jsonb_build_object(
    'courseId', course_record.id, 'versionId', p_version_id,
    'mappingRevisionId', new_revision.id,
    'revisionNumber', new_revision.revision_number,
    'status', 'generated',
    'capacity', snapshot_payload -> 'capacity',
    'bookingTargetSelection', snapshot_payload -> 'bookingTargetSelection'
  );
end;
$$;

create or replace function public.record_course_occurrence_outcome(
  p_academic_slot_id uuid,
  p_expected_latest_event_id uuid,
  p_resolution_status text,
  p_delivery_kind text,
  p_lesson_origin text,
  p_attendance_basis text,
  p_charge_recommendation text,
  p_mark_target_studied boolean,
  p_public_explanation text,
  p_private_staff_note text,
  p_evidence_ids uuid[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  slot_record public.course_schedule_academic_slots%rowtype;
  course_record public.student_courses%rowtype;
  target_lock public.course_schedule_target_locks%rowtype;
  item_record public.course_schedule_items%rowtype;
  latest_event public.course_schedule_occurrence_outcome_events%rowtype;
  existing_command public.course_schedule_occurrence_commands%rowtype;
  inserted_event public.course_schedule_occurrence_outcome_events%rowtype;
  actor_role text;
  normalized_status text := lower(btrim(coalesce(p_resolution_status, '')));
  normalized_kind text := nullif(lower(btrim(coalesce(p_delivery_kind, ''))), '');
  normalized_origin text := lower(btrim(coalesce(p_lesson_origin, '')));
  normalized_attendance text := lower(btrim(coalesce(p_attendance_basis, '')));
  normalized_charge text := lower(btrim(coalesce(p_charge_recommendation, '')));
  normalized_public text := nullif(btrim(coalesce(p_public_explanation, '')), '');
  normalized_private text := nullif(btrim(coalesce(p_private_staff_note, '')), '');
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  action_value text;
  starts_at timestamptz;
  response_deadline timestamptz;
  dispute_deadline timestamptz;
  fixed_time timestamptz;
  evidence_count integer;
  latest_progress_event_id uuid;
  progress_payload jsonb;
  request_payload jsonb;
  response_payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to record a lesson outcome.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'A valid occurrence-outcome idempotency key is required.';
  end if;
  if normalized_status not in ('pending', 'delivered', 'not_delivered', 'cancelled')
    or normalized_origin not in ('recurring', 'on_demand', 'extra')
    or normalized_attendance not in (
      'joint_presence_verified', 'student_no_show', 'tutor_no_show',
      'no_platform_presence', 'technical_uncertain', 'outside_kelp_claim',
      'cancelled', 'unreported'
    )
    or normalized_charge not in (
      'full_charge', 'half_charge', 'no_charge', 'pending'
    ) then
    raise exception 'The lesson outcome classification is invalid.';
  end if;
  if normalized_kind is not null and normalized_kind not in (
    'curriculum_topic', 'review', 'practice', 'exam', 'wrap_up'
  ) then
    raise exception 'The actual lesson purpose is invalid.';
  end if;
  if normalized_public is not null
    and char_length(normalized_public) not between 10 and 1000 then
    raise exception 'A Student-visible explanation must contain 10 to 1000 characters.';
  end if;
  if normalized_private is not null and char_length(normalized_private) > 2000 then
    raise exception 'A private staff note may contain at most 2000 characters.';
  end if;

  select * into slot_record
  from public.course_schedule_academic_slots slot
  where slot.id = p_academic_slot_id for share;
  if not found or slot_record.source_kind <> 'recurring_pattern' then
    raise exception 'The lesson outcome must target a recurring academic occurrence.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-occurrence', slot_record.id),
    0
  ));
  select * into course_record
  from public.student_courses course
  where course.id = slot_record.course_id for update;
  if not found or course_record.active_schedule_version_id <> slot_record.version_id
    or course_record.status not in ('active', 'wind_down') then
    raise exception 'The lesson outcome must target the active Course Schedule.';
  end if;
  actor_role := public.course_schedule_occurrence_actor_role(course_record, caller_id);
  if actor_role is null then
    raise exception 'Only the assigned Tutor, Course Mentor, or Quality Assistant may record this outcome.';
  end if;

  request_payload := jsonb_build_object(
    'academicSlotId', p_academic_slot_id,
    'expectedLatestEventId', p_expected_latest_event_id,
    'resolutionStatus', normalized_status,
    'deliveryKind', normalized_kind,
    'lessonOrigin', normalized_origin,
    'attendanceBasis', normalized_attendance,
    'chargeRecommendation', normalized_charge,
    'markTargetStudied', coalesce(p_mark_target_studied, false),
    'publicExplanation', normalized_public,
    'privateStaffNote', normalized_private,
    'evidenceIds', coalesce(to_jsonb(p_evidence_ids), '[]'::jsonb)
  );
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-occurrence-command', course_record.id, caller_id, normalized_key),
    0
  ));
  select * into existing_command
  from public.course_schedule_occurrence_commands command
  where command.course_id = course_record.id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if existing_command.command_kind <> 'record_outcome'
      or existing_command.request_payload <> request_payload then
      raise exception 'This occurrence idempotency key is already bound to another request.';
    end if;
    return existing_command.response_payload;
  end if;

  starts_at := public.course_schedule_slot_starts_at(slot_record);
  if clock_timestamp() < starts_at - interval '6 hours' then
    raise exception 'This occurrence is still outside its six-hour outcome window.';
  end if;
  response_deadline := public.course_schedule_occurrence_response_deadline(
    slot_record.id
  );
  select * into target_lock
  from public.course_schedule_target_locks lock_record
  where lock_record.academic_slot_id = slot_record.id;
  if not found then
    perform public.lock_course_schedule_slot_target(
      slot_record.id, clock_timestamp(), 'occurrence_submission'
    );
    select * into target_lock
    from public.course_schedule_target_locks lock_record
    where lock_record.academic_slot_id = slot_record.id;
  end if;
  select * into item_record
  from public.course_schedule_items item where item.id = target_lock.schedule_item_id;
  select * into latest_event
  from public.course_schedule_occurrence_outcome_events event
  where event.academic_slot_id = slot_record.id
  order by event.recorded_at desc, event.id desc limit 1;
  if latest_event.id is distinct from p_expected_latest_event_id then
    raise exception 'The lesson outcome changed while this page was open. Reload before saving.';
  end if;

  if latest_event.id is null then
    if actor_role = 'tutor' and clock_timestamp() > response_deadline then
      raise exception 'The Tutor response deadline has closed; a Mentor or Quality Assistant must resolve this occurrence.';
    end if;
    action_value := 'submitted';
  else
    action_value := case
      when actor_role = 'mentor' then 'mentor_resolved'
      when actor_role = 'quality_assistant' then 'quality_resolved'
      else 'corrected'
    end;
    if actor_role = 'tutor'
      and (
        latest_event.actor_user_id <> caller_id
        or clock_timestamp() > latest_event.response_deadline
      ) then
      raise exception 'After the response deadline, a Mentor or Quality Assistant must correct the outcome.';
    end if;
    if normalized_public is null then
      raise exception 'A Student-visible reason is required to correct a lesson outcome.';
    end if;
  end if;

  if normalized_status = 'pending' then
    if normalized_kind is not null or normalized_charge <> 'pending'
      or normalized_attendance not in (
        'no_platform_presence', 'technical_uncertain', 'unreported'
      ) then
      raise exception 'A pending outcome must await evidence without deciding purpose or charge.';
    end if;
  elsif normalized_status = 'delivered' then
    if normalized_kind is null
      or normalized_charge not in ('full_charge', 'no_charge', 'pending') then
      raise exception 'A delivered outcome requires its actual purpose and a compatible charge recommendation.';
    end if;
  elsif normalized_status = 'not_delivered' then
    if normalized_kind is not null
      or normalized_charge not in ('half_charge', 'no_charge', 'pending') then
      raise exception 'A not-delivered outcome cannot claim an actual lesson purpose.';
    end if;
  elsif normalized_kind is not null or normalized_attendance <> 'cancelled'
    or normalized_charge <> 'no_charge' then
    raise exception 'A cancelled outcome must recommend no charge.';
  end if;
  if normalized_attendance = 'student_no_show'
    and (normalized_status <> 'not_delivered' or normalized_charge <> 'half_charge') then
    raise exception 'A Student no-show recommends a half charge and requeues the target.';
  end if;
  if normalized_attendance = 'tutor_no_show'
    and (normalized_status <> 'not_delivered' or normalized_charge <> 'no_charge') then
    raise exception 'A Tutor no-show cannot recommend a Student charge.';
  end if;
  if normalized_attendance = 'joint_presence_verified'
    and (normalized_status <> 'delivered' or normalized_charge <> 'full_charge') then
    raise exception 'Verified joint presence requires a delivered full-charge recommendation.';
  end if;

  select count(*) into evidence_count
  from public.course_schedule_occurrence_evidence evidence
  where evidence.id = any(coalesce(p_evidence_ids, '{}'::uuid[]))
    and evidence.course_id = course_record.id
    and evidence.academic_slot_id = slot_record.id
    and evidence.status = 'active';
  if evidence_count <> cardinality(coalesce(p_evidence_ids, '{}'::uuid[])) then
    raise exception 'Every evidence file must be active and belong to this occurrence.';
  end if;
  if normalized_attendance in ('outside_kelp_claim', 'technical_uncertain')
    and evidence_count = 0 then
    raise exception 'Outside-Kelp and technical exception claims require private evidence.';
  end if;

  if coalesce(p_mark_target_studied, false) then
    if normalized_status <> 'delivered'
      or normalized_kind <> 'curriculum_topic'
      or item_record.item_kind <> 'curriculum_topic' then
      raise exception 'Only a delivered Curriculum topic can mark its locked target Studied.';
    end if;
    if not public.course_progress_target_is_marked(
      course_record.id, item_record.stable_item_key, null, 'studied'
    ) then
      latest_progress_event_id := public.course_progress_latest_event_id(
        course_record.id, item_record.stable_item_key, null, 'studied'
      );
      progress_payload := public.record_course_progress(
        course_record.id, item_record.id, null, 'studied',
        latest_progress_event_id, null, null, normalized_public,
        normalized_private, normalized_key || ':studied'
      );
    end if;
  elsif normalized_status = 'delivered'
    and normalized_kind = 'curriculum_topic'
    and public.course_progress_target_is_marked(
      course_record.id, item_record.stable_item_key, null, 'studied'
    ) then
    if normalized_public is null then
      raise exception 'A Student-visible reason is required when the Tutor leaves a previously marked target incomplete.';
    end if;
    latest_progress_event_id := public.course_progress_latest_event_id(
      course_record.id, item_record.stable_item_key, null, 'studied'
    );
    progress_payload := public.reverse_course_progress(
      course_record.id, item_record.id, null, 'studied',
      latest_progress_event_id, null, normalized_public,
      normalized_private, normalized_key || ':studied-reversal'
    );
  end if;

  dispute_deadline := case
    when normalized_status = 'pending' then null
    when normalized_attendance = 'outside_kelp_claim'
      then greatest(
        response_deadline + interval '2 days',
        clock_timestamp() + interval '2 days'
      )
    else greatest(
      starts_at + interval '14 days',
      clock_timestamp() + interval '2 days'
    )
  end;
  fixed_time := case
    when normalized_status = 'pending'
      or normalized_attendance = 'outside_kelp_claim' then null
    else clock_timestamp()
  end;

  insert into public.course_schedule_occurrence_outcome_events (
    course_id, version_id, academic_slot_id, target_lock_id,
    schedule_item_id, supersedes_event_id, event_action, resolution_status,
    delivery_kind, lesson_origin, attendance_basis, charge_recommendation,
    actor_user_id, actor_role, public_explanation, private_staff_note,
    occurred_at, response_deadline, dispute_deadline, fixed_at,
    settlement_not_before, metadata
  ) values (
    course_record.id, slot_record.version_id, slot_record.id, target_lock.id,
    item_record.id, latest_event.id, action_value, normalized_status,
    normalized_kind, normalized_origin, normalized_attendance, normalized_charge,
    caller_id, actor_role, normalized_public, normalized_private,
    starts_at, response_deadline, dispute_deadline, fixed_time,
    greatest(starts_at + interval '14 days', clock_timestamp()),
    jsonb_build_object(
      'schemaVersion', 1, 'phase', '5.F.3',
      'evidenceIds', coalesce(to_jsonb(p_evidence_ids), '[]'::jsonb),
      'targetStudiedCommand', progress_payload,
      'financialPosting', 'deferred'
    )
  ) returning * into inserted_event;

  perform public.insert_course_schedule_occurrence_notifications(inserted_event);
  perform public.refresh_course_schedule_target_mapping(
    course_record.id, course_record.active_schedule_version_id,
    'outcome_reflow', null
  );
  response_payload := jsonb_build_object(
    'schemaVersion', 1,
    'eventId', inserted_event.id,
    'courseId', inserted_event.course_id,
    'academicSlotId', inserted_event.academic_slot_id,
    'resolutionStatus', inserted_event.resolution_status,
    'deliveryKind', inserted_event.delivery_kind,
    'lessonOrigin', inserted_event.lesson_origin,
    'chargeRecommendation', inserted_event.charge_recommendation,
    'responseDeadline', inserted_event.response_deadline,
    'disputeDeadline', inserted_event.dispute_deadline,
    'settlementNotBefore', inserted_event.settlement_not_before,
    'targetProgress', progress_payload,
    'creditPosted', false,
    'tutorSettlementPosted', false
  );
  insert into public.course_schedule_occurrence_commands (
    course_id, actor_user_id, idempotency_key, command_kind,
    request_payload, response_payload
  ) values (
    course_record.id, caller_id, normalized_key, 'record_outcome',
    request_payload, response_payload
  );
  return response_payload;
end;
$$;

create or replace function public.reserve_course_occurrence_evidence(
  p_academic_slot_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  slot_record public.course_schedule_academic_slots%rowtype;
  course_record public.student_courses%rowtype;
  file_id uuid := gen_random_uuid();
  normalized_name text := btrim(coalesce(p_original_file_name, ''));
  normalized_mime text := lower(btrim(coalesce(p_mime_type, '')));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  existing_file public.course_schedule_occurrence_evidence%rowtype;
  created_file public.course_schedule_occurrence_evidence%rowtype;
begin
  select * into slot_record
  from public.course_schedule_academic_slots slot
  where slot.id = p_academic_slot_id;
  if caller_id is null or not found then
    raise exception 'The evidence occurrence could not be found.';
  end if;
  select * into course_record
  from public.student_courses course where course.id = slot_record.course_id;
  if public.course_schedule_occurrence_actor_role(course_record, caller_id) is null then
    raise exception 'Only Course staff may upload private lesson evidence.';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 255
    or normalized_name ~ '[\\/]' or normalized_name ~ '[[:cntrl:]]' then
    raise exception 'The evidence file name is invalid.';
  end if;
  if normalized_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Only PDF, JPEG, and PNG evidence is supported.';
  end if;
  if (normalized_mime = 'application/pdf' and lower(normalized_name) !~ '\.pdf$')
    or (normalized_mime = 'image/jpeg' and lower(normalized_name) !~ '\.(jpg|jpeg)$')
    or (normalized_mime = 'image/png' and lower(normalized_name) !~ '\.png$') then
    raise exception 'The evidence extension does not match its declared type.';
  end if;
  if p_size_bytes is null or p_size_bytes not between 1 and 20971520 then
    raise exception 'A private evidence file may be no larger than 20 MB.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'A valid evidence idempotency key is required.';
  end if;

  select * into existing_file
  from public.course_schedule_occurrence_evidence evidence
  where evidence.uploaded_by = caller_id
    and evidence.idempotency_key = normalized_key;
  if found then
    if existing_file.academic_slot_id <> p_academic_slot_id
      or existing_file.original_file_name <> normalized_name
      or existing_file.mime_type <> normalized_mime
      or existing_file.size_bytes <> p_size_bytes then
      raise exception 'This evidence idempotency key is already bound to another file.';
    end if;
    return jsonb_build_object(
      'id', existing_file.id, 'status', existing_file.status,
      'bucket', existing_file.storage_bucket, 'path', existing_file.storage_path,
      'uploadExpiresAt', existing_file.upload_expires_at,
      'retentionUntil', existing_file.retention_until
    );
  end if;

  insert into public.course_schedule_occurrence_evidence (
    id, course_id, academic_slot_id, uploaded_by, storage_path,
    original_file_name, mime_type, size_bytes, idempotency_key,
    upload_expires_at
  ) values (
    file_id, course_record.id, slot_record.id, caller_id,
    course_record.id::text || '/' || slot_record.id::text || '/' || file_id::text,
    normalized_name, normalized_mime, p_size_bytes, normalized_key,
    clock_timestamp() + interval '30 minutes'
  ) returning * into created_file;

  return jsonb_build_object(
    'id', created_file.id, 'status', created_file.status,
    'bucket', created_file.storage_bucket, 'path', created_file.storage_path,
    'uploadExpiresAt', created_file.upload_expires_at,
    'retentionUntil', created_file.retention_until
  );
end;
$$;

create or replace function public.activate_course_occurrence_evidence(
  p_evidence_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  caller_id uuid := auth.uid();
  evidence_record public.course_schedule_occurrence_evidence%rowtype;
begin
  select * into evidence_record
  from public.course_schedule_occurrence_evidence evidence
  where evidence.id = p_evidence_id for update;
  if caller_id is null or not found or evidence_record.uploaded_by <> caller_id then
    raise exception 'The reserved evidence file could not be activated.';
  end if;
  if evidence_record.status = 'active' then
    return jsonb_build_object(
      'id', evidence_record.id, 'status', evidence_record.status,
      'retentionUntil', evidence_record.retention_until
    );
  end if;
  if lower(btrim(coalesce(p_idempotency_key, '')))
      <> evidence_record.idempotency_key
    or evidence_record.upload_expires_at <= clock_timestamp() then
    raise exception 'The evidence upload reservation has expired or changed.';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = evidence_record.storage_bucket
      and object.name = evidence_record.storage_path
      and object.owner_id = caller_id::text
  ) then
    raise exception 'Upload the reserved Storage object before activating evidence.';
  end if;
  update public.course_schedule_occurrence_evidence
  set status = 'active', activated_at = clock_timestamp()
  where id = evidence_record.id returning * into evidence_record;
  return jsonb_build_object(
    'id', evidence_record.id, 'status', evidence_record.status,
    'retentionUntil', evidence_record.retention_until
  );
end;
$$;

create or replace function public.confirm_course_occurrence_delivery(
  p_outcome_event_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  prior_outcome public.course_schedule_occurrence_outcome_events%rowtype;
  current_outcome public.course_schedule_occurrence_outcome_events%rowtype;
  course_record public.student_courses%rowtype;
  inserted_outcome public.course_schedule_occurrence_outcome_events%rowtype;
  existing_command public.course_schedule_occurrence_commands%rowtype;
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  request_payload jsonb;
  response_payload jsonb;
begin
  select * into prior_outcome
  from public.course_schedule_occurrence_outcome_events event
  where event.id = p_outcome_event_id;
  if caller_id is null or not found then
    raise exception 'The evidence-backed lesson outcome could not be found.';
  end if;
  select * into course_record
  from public.student_courses course where course.id = prior_outcome.course_id;
  if caller_id <> course_record.student_id then
    raise exception 'Only the Course Student may confirm this delivery.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'A valid delivery-confirmation idempotency key is required.';
  end if;

  request_payload := jsonb_build_object('outcomeEventId', prior_outcome.id);
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-occurrence', prior_outcome.academic_slot_id),
    0
  ));
  select * into existing_command
  from public.course_schedule_occurrence_commands command
  where command.course_id = course_record.id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if existing_command.command_kind <> 'confirm_delivery'
      or existing_command.request_payload <> request_payload then
      raise exception 'This confirmation idempotency key is already bound to another request.';
    end if;
    return existing_command.response_payload;
  end if;

  if prior_outcome.resolution_status <> 'delivered'
    or prior_outcome.attendance_basis <> 'outside_kelp_claim'
    or prior_outcome.fixed_at is not null then
    raise exception 'Only an unfixed outside-Kelp delivery claim can be confirmed.';
  end if;
  current_outcome := public.course_schedule_occurrence_latest_event(
    prior_outcome.academic_slot_id
  );
  if current_outcome.id <> prior_outcome.id then
    raise exception 'The lesson outcome changed before confirmation. Reload first.';
  end if;
  if clock_timestamp() > prior_outcome.dispute_deadline then
    raise exception 'The delivery confirmation window has closed.';
  end if;

  insert into public.course_schedule_occurrence_outcome_events (
    course_id, version_id, academic_slot_id, target_lock_id,
    schedule_item_id, supersedes_event_id, event_action, resolution_status,
    delivery_kind, lesson_origin, attendance_basis, charge_recommendation,
    actor_user_id, actor_role, public_explanation, private_staff_note,
    occurred_at, response_deadline, dispute_deadline, fixed_at,
    settlement_not_before, metadata
  ) values (
    prior_outcome.course_id, prior_outcome.version_id,
    prior_outcome.academic_slot_id, prior_outcome.target_lock_id,
    prior_outcome.schedule_item_id, prior_outcome.id, 'student_confirmed',
    prior_outcome.resolution_status, prior_outcome.delivery_kind,
    prior_outcome.lesson_origin, prior_outcome.attendance_basis,
    prior_outcome.charge_recommendation, caller_id, 'student',
    'The Student confirmed that the evidence-backed lesson was delivered.',
    prior_outcome.private_staff_note, prior_outcome.occurred_at,
    prior_outcome.response_deadline, null, clock_timestamp(),
    prior_outcome.settlement_not_before,
    prior_outcome.metadata || jsonb_build_object('studentConfirmed', true)
  ) returning * into inserted_outcome;

  perform public.insert_course_schedule_occurrence_notifications(inserted_outcome);
  response_payload := jsonb_build_object(
    'schemaVersion', 1, 'outcomeEventId', inserted_outcome.id,
    'status', 'confirmed', 'fixedAt', inserted_outcome.fixed_at,
    'settlementNotBefore', inserted_outcome.settlement_not_before,
    'creditPosted', false, 'tutorSettlementPosted', false
  );
  insert into public.course_schedule_occurrence_commands (
    course_id, actor_user_id, idempotency_key, command_kind,
    request_payload, response_payload
  ) values (
    course_record.id, caller_id, normalized_key, 'confirm_delivery',
    request_payload, response_payload
  );
  return response_payload;
end;
$$;

create or replace function public.submit_course_occurrence_dispute(
  p_outcome_event_id uuid,
  p_public_explanation text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  outcome_record public.course_schedule_occurrence_outcome_events%rowtype;
  course_record public.student_courses%rowtype;
  inserted_dispute public.course_schedule_occurrence_dispute_events%rowtype;
  existing_command public.course_schedule_occurrence_commands%rowtype;
  normalized_explanation text := btrim(coalesce(p_public_explanation, ''));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  deadline timestamptz;
  request_payload jsonb;
  response_payload jsonb;
  current_event public.course_schedule_occurrence_outcome_events%rowtype;
begin
  select * into outcome_record
  from public.course_schedule_occurrence_outcome_events event
  where event.id = p_outcome_event_id;
  if caller_id is null or not found then
    raise exception 'The lesson outcome could not be found.';
  end if;
  select * into course_record
  from public.student_courses course where course.id = outcome_record.course_id;
  if caller_id <> course_record.student_id then
    raise exception 'Only the Course Student may dispute this outcome.';
  end if;
  if char_length(normalized_explanation) not between 10 and 1000 then
    raise exception 'A dispute explanation must contain 10 to 1000 characters.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'A valid dispute idempotency key is required.';
  end if;

  request_payload := jsonb_build_object(
    'outcomeEventId', outcome_record.id,
    'publicExplanation', normalized_explanation
  );
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-occurrence', outcome_record.academic_slot_id),
    0
  ));
  select * into existing_command
  from public.course_schedule_occurrence_commands command
  where command.course_id = course_record.id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if existing_command.command_kind <> 'submit_dispute'
      or existing_command.request_payload <> request_payload then
      raise exception 'This dispute idempotency key is already bound to another request.';
    end if;
    return existing_command.response_payload;
  end if;

  if outcome_record.resolution_status = 'pending' then
    raise exception 'A pending outcome must be resolved before it can be disputed.';
  end if;
  current_event := public.course_schedule_occurrence_latest_event(
    outcome_record.academic_slot_id
  );
  if current_event.id <> outcome_record.id then
    raise exception 'Only the current lesson outcome can be disputed.';
  end if;
  deadline := coalesce(
    outcome_record.dispute_deadline, outcome_record.settlement_not_before
  );
  if clock_timestamp() > deadline then
    raise exception 'The lesson-outcome dispute window has closed.';
  end if;
  if exists (
    select 1
    from public.course_schedule_occurrence_dispute_events dispute
    where dispute.outcome_event_id = outcome_record.id
      and dispute.event_action = 'submitted'
      and not exists (
        select 1
        from public.course_schedule_occurrence_dispute_events resolution
        where resolution.related_dispute_event_id = dispute.id
      )
  ) then
    raise exception 'This lesson outcome already has an open dispute.';
  end if;

  insert into public.course_schedule_occurrence_dispute_events (
    course_id, academic_slot_id, outcome_event_id, event_action,
    actor_user_id, actor_role, public_explanation
  ) values (
    course_record.id, outcome_record.academic_slot_id, outcome_record.id,
    'submitted', caller_id, 'student', normalized_explanation
  ) returning * into inserted_dispute;

  insert into public.course_schedule_occurrence_notification_events (
    recipient_user_id, actor_user_id, course_id, academic_slot_id,
    outcome_event_id, dispute_event_id, event_type, payload
  )
  select
    recipient.user_id, caller_id, course_record.id,
    outcome_record.academic_slot_id, outcome_record.id, inserted_dispute.id,
    'outcome_disputed',
    jsonb_build_object(
      'resolutionStatus', outcome_record.resolution_status,
      'disputeDeadline', deadline
    )
  from (
    select course_record.student_id as user_id
    union select course_record.tutor_id
    union select course_record.mentor_id
  ) recipient
  on conflict do nothing;

  response_payload := jsonb_build_object(
    'schemaVersion', 1, 'disputeEventId', inserted_dispute.id,
    'status', 'submitted', 'settlementHeld', true, 'deadline', deadline
  );
  insert into public.course_schedule_occurrence_commands (
    course_id, actor_user_id, idempotency_key, command_kind,
    request_payload, response_payload
  ) values (
    course_record.id, caller_id, normalized_key, 'submit_dispute',
    request_payload, response_payload
  );
  return response_payload;
end;
$$;

create or replace function public.resolve_course_occurrence_dispute(
  p_submitted_dispute_event_id uuid,
  p_resolution text,
  p_resolution_status text,
  p_delivery_kind text,
  p_attendance_basis text,
  p_charge_recommendation text,
  p_public_explanation text,
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
  dispute_record public.course_schedule_occurrence_dispute_events%rowtype;
  prior_outcome public.course_schedule_occurrence_outcome_events%rowtype;
  current_outcome public.course_schedule_occurrence_outcome_events%rowtype;
  course_record public.student_courses%rowtype;
  inserted_outcome public.course_schedule_occurrence_outcome_events%rowtype;
  inserted_resolution public.course_schedule_occurrence_dispute_events%rowtype;
  existing_command public.course_schedule_occurrence_commands%rowtype;
  actor_role text;
  normalized_resolution text := lower(btrim(coalesce(p_resolution, '')));
  normalized_status text := lower(btrim(coalesce(p_resolution_status, '')));
  normalized_kind text := nullif(lower(btrim(coalesce(p_delivery_kind, ''))), '');
  normalized_attendance text := lower(btrim(coalesce(p_attendance_basis, '')));
  normalized_charge text := lower(btrim(coalesce(p_charge_recommendation, '')));
  normalized_public text := btrim(coalesce(p_public_explanation, ''));
  normalized_private text := nullif(btrim(coalesce(p_private_staff_note, '')), '');
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  request_payload jsonb;
  response_payload jsonb;
begin
  select * into dispute_record
  from public.course_schedule_occurrence_dispute_events dispute
  where dispute.id = p_submitted_dispute_event_id
    and dispute.event_action = 'submitted' for share;
  if caller_id is null or not found then
    raise exception 'The submitted lesson-outcome dispute could not be found.';
  end if;
  select * into prior_outcome
  from public.course_schedule_occurrence_outcome_events outcome
  where outcome.id = dispute_record.outcome_event_id;
  select * into course_record
  from public.student_courses course where course.id = prior_outcome.course_id;
  actor_role := public.course_schedule_occurrence_actor_role(course_record, caller_id);
  if actor_role not in ('mentor', 'quality_assistant') then
    raise exception 'Only the Course Mentor or Quality Assistant may resolve a dispute.';
  end if;
  if normalized_resolution not in ('upheld', 'rejected')
    or normalized_status not in ('delivered', 'not_delivered', 'cancelled')
    or normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
    or char_length(normalized_public) not between 10 and 1000 then
    raise exception 'The dispute resolution is incomplete or invalid.';
  end if;

  request_payload := jsonb_build_object(
    'submittedDisputeEventId', dispute_record.id,
    'resolution', normalized_resolution,
    'resolutionStatus', normalized_status,
    'deliveryKind', normalized_kind,
    'attendanceBasis', normalized_attendance,
    'chargeRecommendation', normalized_charge,
    'publicExplanation', normalized_public,
    'privateStaffNote', normalized_private
  );
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'course-occurrence', prior_outcome.academic_slot_id),
    0
  ));
  select * into existing_command
  from public.course_schedule_occurrence_commands command
  where command.course_id = course_record.id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if existing_command.command_kind <> 'resolve_dispute'
      or existing_command.request_payload <> request_payload then
      raise exception 'This dispute-resolution idempotency key is already bound to another request.';
    end if;
    return existing_command.response_payload;
  end if;

  if exists (
    select 1 from public.course_schedule_occurrence_dispute_events resolution
    where resolution.related_dispute_event_id = dispute_record.id
  ) then
    raise exception 'This lesson-outcome dispute is already resolved.';
  end if;
  current_outcome := public.course_schedule_occurrence_latest_event(
    prior_outcome.academic_slot_id
  );
  if current_outcome.id <> prior_outcome.id then
    raise exception 'The lesson outcome changed before this dispute was resolved. Reload first.';
  end if;

  if normalized_status = 'delivered' then
    if normalized_kind is null
      or normalized_charge not in ('full_charge', 'no_charge') then
      raise exception 'A delivered dispute resolution requires purpose and charge recommendation.';
    end if;
  elsif normalized_status = 'not_delivered' then
    if normalized_kind is not null
      or normalized_charge not in ('half_charge', 'no_charge') then
      raise exception 'A not-delivered dispute resolution cannot claim an actual purpose.';
    end if;
  elsif normalized_kind is not null or normalized_attendance <> 'cancelled'
    or normalized_charge <> 'no_charge' then
    raise exception 'A cancelled dispute resolution must recommend no charge.';
  end if;

  insert into public.course_schedule_occurrence_outcome_events (
    course_id, version_id, academic_slot_id, target_lock_id,
    schedule_item_id, supersedes_event_id, event_action, resolution_status,
    delivery_kind, lesson_origin, attendance_basis, charge_recommendation,
    actor_user_id, actor_role, public_explanation, private_staff_note,
    occurred_at, response_deadline, dispute_deadline, fixed_at,
    settlement_not_before, metadata
  ) values (
    prior_outcome.course_id, prior_outcome.version_id,
    prior_outcome.academic_slot_id, prior_outcome.target_lock_id,
    prior_outcome.schedule_item_id, prior_outcome.id,
    case when actor_role = 'quality_assistant'
      then 'quality_resolved' else 'mentor_resolved' end,
    normalized_status, normalized_kind, prior_outcome.lesson_origin,
    normalized_attendance, normalized_charge, caller_id, actor_role,
    normalized_public, normalized_private, prior_outcome.occurred_at,
    prior_outcome.response_deadline, null, clock_timestamp(),
    greatest(prior_outcome.settlement_not_before, clock_timestamp()),
    jsonb_build_object(
      'schemaVersion', 1, 'resolvedDisputeEventId', dispute_record.id,
      'financialPosting', 'deferred'
    )
  ) returning * into inserted_outcome;

  insert into public.course_schedule_occurrence_dispute_events (
    course_id, academic_slot_id, outcome_event_id,
    related_dispute_event_id, event_action, actor_user_id, actor_role,
    public_explanation, private_staff_note
  ) values (
    course_record.id, prior_outcome.academic_slot_id, inserted_outcome.id,
    dispute_record.id, normalized_resolution, caller_id, actor_role,
    normalized_public, normalized_private
  ) returning * into inserted_resolution;

  perform public.insert_course_schedule_occurrence_notifications(inserted_outcome);
  insert into public.course_schedule_occurrence_notification_events (
    recipient_user_id, actor_user_id, course_id, academic_slot_id,
    outcome_event_id, dispute_event_id, event_type, payload
  )
  select
    recipient.user_id, caller_id, course_record.id,
    prior_outcome.academic_slot_id, inserted_outcome.id,
    inserted_resolution.id, 'outcome_dispute_resolved',
    jsonb_build_object(
      'resolution', normalized_resolution,
      'resolutionStatus', normalized_status,
      'chargeRecommendation', normalized_charge
    )
  from (
    select course_record.student_id as user_id
    union select course_record.tutor_id
    union select course_record.mentor_id
  ) recipient
  on conflict do nothing;
  perform public.refresh_course_schedule_target_mapping(
    course_record.id, course_record.active_schedule_version_id,
    'outcome_reflow', null
  );
  response_payload := jsonb_build_object(
    'schemaVersion', 1,
    'disputeResolutionEventId', inserted_resolution.id,
    'outcomeEventId', inserted_outcome.id,
    'resolution', normalized_resolution,
    'resolutionStatus', normalized_status,
    'settlementNotBefore', inserted_outcome.settlement_not_before,
    'creditPosted', false, 'tutorSettlementPosted', false
  );
  insert into public.course_schedule_occurrence_commands (
    course_id, actor_user_id, idempotency_key, command_kind,
    request_payload, response_payload
  ) values (
    course_record.id, caller_id, normalized_key, 'resolve_dispute',
    request_payload, response_payload
  );
  return response_payload;
end;
$$;

create or replace function public.settle_due_course_occurrence_outcomes(
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate record;
  prior_event public.course_schedule_occurrence_outcome_events%rowtype;
  inserted_event public.course_schedule_occurrence_outcome_events%rowtype;
  resolved_count integer := 0;
  fixed_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Automatic occurrence resolution is a trusted scheduled operation.';
  end if;
  perform public.lock_due_course_schedule_targets(p_as_of);
  for candidate in
    select
      slot.*, target_lock.id as target_lock_id,
      target_lock.schedule_item_id,
      public.course_schedule_slot_starts_at(slot) as starts_at,
      public.course_schedule_occurrence_response_deadline(slot.id) as deadline
    from public.course_schedule_academic_slots slot
    join public.student_courses course on course.id = slot.course_id
    join public.course_schedule_target_locks target_lock
      on target_lock.academic_slot_id = slot.id
    where slot.source_kind = 'recurring_pattern'
      and course.active_schedule_version_id = slot.version_id
      and public.course_schedule_occurrence_response_deadline(slot.id) <= p_as_of
    order by public.course_schedule_slot_starts_at(slot), slot.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(':', 'course-occurrence', candidate.id),
      0
    ));
    select * into prior_event
    from public.course_schedule_occurrence_outcome_events event
    where event.academic_slot_id = candidate.id
    order by event.recorded_at desc, event.id desc limit 1;
    if prior_event.id is null or prior_event.resolution_status = 'pending' then
      insert into public.course_schedule_occurrence_outcome_events (
        course_id, version_id, academic_slot_id, target_lock_id,
        schedule_item_id, supersedes_event_id, event_action,
        resolution_status, delivery_kind, lesson_origin, attendance_basis,
        charge_recommendation, actor_user_id, actor_role,
        public_explanation, occurred_at, response_deadline,
        dispute_deadline, fixed_at, settlement_not_before, metadata
      ) values (
        candidate.course_id, candidate.version_id, candidate.id,
        candidate.target_lock_id, candidate.schedule_item_id, prior_event.id,
        'automatic_resolved',
        'not_delivered', null, 'recurring', 'unreported', 'no_charge',
        coalesce(prior_event.actor_user_id, (
          select course.tutor_id from public.student_courses course
          where course.id = candidate.course_id
        )),
        'system',
        'No delivered lesson was reported before the next meeting deadline.',
        candidate.starts_at, candidate.deadline,
        candidate.starts_at + interval '14 days', p_as_of,
        candidate.starts_at + interval '14 days',
        jsonb_build_object(
          'schemaVersion', 1, 'automaticResolution', true,
          'financialPosting', 'deferred'
        )
      ) returning * into inserted_event;
      perform public.insert_course_schedule_occurrence_notifications(inserted_event);
      perform public.refresh_course_schedule_target_mapping(
        candidate.course_id, candidate.version_id, 'outcome_reflow', null
      );
      resolved_count := resolved_count + 1;
    elsif prior_event.attendance_basis = 'outside_kelp_claim'
      and prior_event.fixed_at is null
      and prior_event.dispute_deadline <= p_as_of
      and not exists (
        select 1
        from public.course_schedule_occurrence_dispute_events dispute
        where dispute.outcome_event_id = prior_event.id
          and dispute.event_action = 'submitted'
          and not exists (
            select 1
            from public.course_schedule_occurrence_dispute_events resolution
            where resolution.related_dispute_event_id = dispute.id
          )
      ) then
      insert into public.course_schedule_occurrence_outcome_events (
        course_id, version_id, academic_slot_id, target_lock_id,
        schedule_item_id, supersedes_event_id, event_action,
        resolution_status, delivery_kind, lesson_origin, attendance_basis,
        charge_recommendation, actor_user_id, actor_role,
        public_explanation, private_staff_note, occurred_at,
        response_deadline, dispute_deadline, fixed_at,
        settlement_not_before, metadata
      ) values (
        prior_event.course_id, prior_event.version_id,
        prior_event.academic_slot_id, prior_event.target_lock_id,
        prior_event.schedule_item_id, prior_event.id, 'automatic_resolved',
        prior_event.resolution_status, prior_event.delivery_kind,
        prior_event.lesson_origin, prior_event.attendance_basis,
        prior_event.charge_recommendation, prior_event.actor_user_id, 'system',
        coalesce(
          prior_event.public_explanation,
          'The evidence-backed delivery claim passed without a Student dispute.'
        ),
        prior_event.private_staff_note, prior_event.occurred_at,
        prior_event.response_deadline, null, p_as_of,
        greatest(prior_event.settlement_not_before, p_as_of),
        prior_event.metadata || jsonb_build_object('claimFixedAutomatically', true)
      ) returning * into inserted_event;
      perform public.insert_course_schedule_occurrence_notifications(inserted_event);
      fixed_count := fixed_count + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'status', 'completed',
    'automaticallyNotDeliveredCount', resolved_count,
    'fixedClaimCount', fixed_count, 'asOf', p_as_of
  );
end;
$$;

create or replace function public.get_my_course_occurrence_outcomes(
  p_course_id uuid
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
  staff_view boolean;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open lesson outcomes.';
  end if;
  select * into course_record
  from public.student_courses course where course.id = p_course_id;
  if not found then raise exception 'The Course could not be found.'; end if;
  staff_view := public.current_user_can_manage_course_outcome(p_course_id);
  if not public.current_user_can_read_student_course(p_course_id)
    and not staff_view then
    raise exception 'You do not have access to these lesson outcomes.';
  end if;

  with latest_outcomes as (
    select distinct on (event.academic_slot_id) event.*
    from public.course_schedule_occurrence_outcome_events event
    where event.course_id = course_record.id
    order by event.academic_slot_id, event.recorded_at desc, event.id desc
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'course', jsonb_build_object(
      'id', course_record.id,
      'title', course_record.title,
      'serviceModel', course_record.service_model,
      'status', course_record.status
    ),
    'occurrences', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'academicSlotId', slot.id,
        'stableSlotKey', slot.stable_slot_key,
        'localDate', slot.local_date,
        'localStartTime', to_char(slot.local_start_time, 'HH24:MI'),
        'durationMinutes', slot.duration_minutes,
        'timeZone', slot.time_zone,
        'slotStartsAt', public.course_schedule_slot_starts_at(slot),
        'target', target_lock.target_snapshot,
        'targetLockedAt', target_lock.locked_at,
        'resolutionStatus', outcome.resolution_status,
        'deliveryKind', outcome.delivery_kind,
        'lessonOrigin', outcome.lesson_origin,
        'attendanceBasis', outcome.attendance_basis,
        'chargeRecommendation', outcome.charge_recommendation,
        'publicExplanation', outcome.public_explanation,
        'responseDeadline', coalesce(
          outcome.response_deadline,
          public.course_schedule_occurrence_response_deadline(slot.id)
        ),
        'disputeDeadline', outcome.dispute_deadline,
        'fixedAt', outcome.fixed_at,
        'settlementNotBefore', outcome.settlement_not_before,
        'privateStaffNote', case when staff_view
          then outcome.private_staff_note else null end,
        'evidenceSubmitted', exists (
          select 1 from public.course_schedule_occurrence_evidence evidence
          where evidence.academic_slot_id = slot.id
            and evidence.status = 'active'
        ),
        'evidence', case when staff_view then coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', evidence.id,
            'fileName', evidence.original_file_name,
            'mimeType', evidence.mime_type,
            'sizeBytes', evidence.size_bytes,
            'bucket', evidence.storage_bucket,
            'path', evidence.storage_path,
            'uploadedBy', evidence.uploaded_by,
            'activatedAt', evidence.activated_at,
            'retentionUntil', evidence.retention_until
          ) order by evidence.activated_at, evidence.id)
          from public.course_schedule_occurrence_evidence evidence
          where evidence.academic_slot_id = slot.id
            and evidence.status = 'active'
        ), '[]'::jsonb) else null end,
        'openDispute', exists (
          select 1
          from public.course_schedule_occurrence_dispute_events dispute
          where dispute.academic_slot_id = slot.id
            and dispute.event_action = 'submitted'
            and not exists (
              select 1
              from public.course_schedule_occurrence_dispute_events resolution
              where resolution.related_dispute_event_id = dispute.id
            )
        )
      )) order by slot.position, slot.id)
      from public.course_schedule_academic_slots slot
      left join public.course_schedule_target_locks target_lock
        on target_lock.academic_slot_id = slot.id
      left join latest_outcomes outcome on outcome.academic_slot_id = slot.id
      where slot.version_id = course_record.active_schedule_version_id
        and slot.source_kind = 'recurring_pattern'
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canRecordOutcome', staff_view,
      'canSubmitDispute', caller_id = course_record.student_id,
      'canResolveDispute',
        caller_id = course_record.mentor_id
        or public.current_user_can_oversee_course_outcomes(course_record.id),
      'canReadPrivateEvidence', staff_view
    ),
    'financialBoundary', jsonb_build_object(
      'recommendationsRecorded', true,
      'creditPosting', 'deferred_credit_phase',
      'tutorSettlementPosting', 'deferred_live_class_phase',
      'minimumSettlementHoldDays', 14
    )
  ) into payload;
  return payload;
end;
$$;

alter table public.course_schedule_target_locks enable row level security;
alter table public.course_schedule_occurrence_outcome_events enable row level security;
alter table public.course_schedule_occurrence_commands enable row level security;
alter table public.course_schedule_occurrence_dispute_events enable row level security;
alter table public.course_schedule_occurrence_evidence enable row level security;
alter table public.course_schedule_occurrence_notification_events enable row level security;

create policy "Course staff read target locks"
on public.course_schedule_target_locks for select to authenticated
using (public.current_user_can_manage_course_outcome(course_id));

create policy "Course staff read occurrence outcome history"
on public.course_schedule_occurrence_outcome_events for select to authenticated
using (public.current_user_can_manage_course_outcome(course_id));

create policy "Actors read their own occurrence command receipts"
on public.course_schedule_occurrence_commands for select to authenticated
using (actor_user_id = (select auth.uid()));

create policy "Course staff read dispute history"
on public.course_schedule_occurrence_dispute_events for select to authenticated
using (public.current_user_can_manage_course_outcome(course_id));

create policy "Course staff read private occurrence evidence"
on public.course_schedule_occurrence_evidence for select to authenticated
using (public.current_user_can_manage_course_outcome(course_id));

create policy "Recipients read occurrence notifications"
on public.course_schedule_occurrence_notification_events for select to authenticated
using (recipient_user_id = (select auth.uid()));

create or replace function public.current_user_can_upload_occurrence_evidence_object(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.course_schedule_occurrence_evidence evidence
    where evidence.storage_bucket = 'course-outcome-evidence'
      and evidence.storage_path = p_storage_path
      and evidence.status = 'reserved'
      and evidence.uploaded_by = auth.uid()
      and evidence.upload_expires_at > now()
      and public.current_user_can_manage_course_outcome(evidence.course_id)
  ), false);
$$;

create or replace function public.current_user_can_read_occurrence_evidence_object(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.course_schedule_occurrence_evidence evidence
    where evidence.storage_bucket = 'course-outcome-evidence'
      and evidence.storage_path = p_storage_path
      and evidence.status = 'active'
      and public.current_user_can_manage_course_outcome(evidence.course_id)
  ), false);
$$;

drop policy if exists "Course staff upload reserved outcome evidence"
on storage.objects;
create policy "Course staff upload reserved outcome evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'course-outcome-evidence'
  and owner_id = (select auth.uid())::text
  and public.current_user_can_upload_occurrence_evidence_object(name)
);

drop policy if exists "Course staff read active outcome evidence"
on storage.objects;
create policy "Course staff read active outcome evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'course-outcome-evidence'
  and public.current_user_can_read_occurrence_evidence_object(name)
);

revoke all on public.course_schedule_target_locks
  from public, anon, authenticated;
revoke all on public.course_schedule_occurrence_outcome_events
  from public, anon, authenticated;
revoke all on public.course_schedule_occurrence_commands
  from public, anon, authenticated;
revoke all on public.course_schedule_occurrence_dispute_events
  from public, anon, authenticated;
revoke all on public.course_schedule_occurrence_evidence
  from public, anon, authenticated;
revoke all on public.course_schedule_occurrence_notification_events
  from public, anon, authenticated;

grant select on public.course_schedule_target_locks to authenticated, service_role;
grant select on public.course_schedule_occurrence_outcome_events
  to authenticated, service_role;
grant select on public.course_schedule_occurrence_commands
  to authenticated, service_role;
grant select on public.course_schedule_occurrence_dispute_events
  to authenticated, service_role;
grant select on public.course_schedule_occurrence_evidence
  to authenticated, service_role;
grant select on public.course_schedule_occurrence_notification_events
  to authenticated, service_role;

revoke all on function public.current_user_can_oversee_course_outcomes(uuid)
  from public, anon, authenticated;
revoke all on function public.current_user_can_manage_course_outcome(uuid)
  from public, anon, authenticated;
revoke all on function public.course_schedule_slot_starts_at(
  public.course_schedule_academic_slots
) from public, anon, authenticated;
revoke all on function public.lock_course_schedule_slot_target(uuid, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.lock_due_course_schedule_targets(timestamptz)
  from public, anon, authenticated;
revoke all on function public.settle_due_course_occurrence_outcomes(timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_course_occurrence_outcome(
  uuid, uuid, text, text, text, text, text, boolean, text, text, uuid[], text
) from public, anon, authenticated;
revoke all on function public.reserve_course_occurrence_evidence(
  uuid, text, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.activate_course_occurrence_evidence(uuid, text)
  from public, anon, authenticated;
revoke all on function public.confirm_course_occurrence_delivery(uuid, text)
  from public, anon, authenticated;
revoke all on function public.submit_course_occurrence_dispute(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.resolve_course_occurrence_dispute(
  uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.get_my_course_occurrence_outcomes(uuid)
  from public, anon, authenticated;
revoke all on function public.current_user_can_upload_occurrence_evidence_object(text)
  from public, anon, authenticated;
revoke all on function public.current_user_can_read_occurrence_evidence_object(text)
  from public, anon, authenticated;
revoke all on function public.course_schedule_target_mapping_snapshot_phase5f2_2(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.record_course_occurrence_outcome(
  uuid, uuid, text, text, text, text, text, boolean, text, text, uuid[], text
) to authenticated, service_role;
grant execute on function public.reserve_course_occurrence_evidence(
  uuid, text, text, bigint, text
) to authenticated, service_role;
grant execute on function public.activate_course_occurrence_evidence(uuid, text)
  to authenticated, service_role;
grant execute on function public.confirm_course_occurrence_delivery(uuid, text)
  to authenticated, service_role;
grant execute on function public.submit_course_occurrence_dispute(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.resolve_course_occurrence_dispute(
  uuid, text, text, text, text, text, text, text, text
) to authenticated, service_role;
grant execute on function public.get_my_course_occurrence_outcomes(uuid)
  to authenticated, service_role;
grant execute on function public.current_user_can_manage_course_outcome(uuid)
  to authenticated;
grant execute on function public.current_user_can_upload_occurrence_evidence_object(text)
  to authenticated;
grant execute on function public.current_user_can_read_occurrence_evidence_object(text)
  to authenticated;
grant execute on function public.lock_due_course_schedule_targets(timestamptz)
  to service_role;
grant execute on function public.settle_due_course_occurrence_outcomes(timestamptz)
  to service_role;

comment on table public.course_schedule_target_locks is
  'Phase 5.F.3 immutable six-hour snapshots of the effective target assigned to a recurring academic occurrence.';
comment on table public.course_schedule_occurrence_outcome_events is
  'Phase 5.F.3 append-only lesson-resolution history. Charge recommendations are facts for a later ledger, never financial postings.';
comment on table public.course_schedule_occurrence_evidence is
  'Staff-only PDF/JPEG/PNG evidence retained provisionally for two years and excluded from ordinary Classroom Files.';
comment on function public.record_course_occurrence_outcome(
  uuid, uuid, text, text, text, text, text, boolean, text, text, uuid[], text
) is
  'Atomic Tutor/Mentor/Quality Assistant post-lesson outcome. It may govern the locked Curriculum target but never posts credits or Tutor settlement.';
comment on function public.get_my_course_occurrence_outcomes(uuid) is
  'Redacted Student/staff Phase 5.F.3 projection. Students never receive private staff notes or evidence object paths.';
