-- Phase 5.F.2.2: append-only effective target mapping.
--
-- Mapping is derived academic intent. It does not book a Class, consume a
-- Lesson Credit, prove attendance, or settle a post-Class outcome.
-- Recurring Courses automatically target the next unstudied structural item.
-- On-demand Courses expose a recommended and selectable unstudied target for
-- the later Lesson Request form without pre-booking a tutoring meeting.

alter table public.course_schedule_items
  drop constraint if exists course_schedule_items_kind_check,
  add constraint course_schedule_items_kind_check check (
    item_kind in (
      'curriculum_topic',
      'review',
      'practice',
      'exam',
      'wrap_up'
    )
  );

-- Historical 5.F.1 rows retain their recorded purpose for audit, but every new
-- pattern uses the neutral `academic` compatibility value. Public projections
-- no longer expose a default purpose or an automatic advancement claim.
alter table public.course_schedule_meeting_patterns
  alter column purpose set default 'academic',
  drop constraint if exists course_schedule_meeting_patterns_purpose_check,
  drop constraint if exists course_schedule_meeting_patterns_theory_duration_check,
  add constraint course_schedule_meeting_patterns_purpose_check check (
    purpose in (
      'academic',
      'theory',
      'practice',
      'review',
      'exam',
      'wrap_up'
    )
  );

create or replace function public.course_schedule_meeting_patterns_json(
  p_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'stablePatternKey', pattern.stable_pattern_key,
    'weekday', pattern.weekday,
    'localStartTime', to_char(pattern.local_start_time, 'HH24:MI'),
    'durationMinutes', pattern.duration_minutes,
    'position', pattern.position,
    'effectiveFrom', pattern.effective_from,
    'effectiveUntil', pattern.effective_until,
    'metadata', pattern.metadata
  ) order by pattern.position, pattern.id), '[]'::jsonb)
  from public.course_schedule_meeting_patterns pattern
  where pattern.version_id = p_version_id;
$$;

create or replace function public.publish_course_meeting_pattern_version(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_effective_from date,
  p_effective_until date,
  p_patterns jsonb,
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
  normalized_idempotency_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  normalized_student_explanation text := btrim(coalesce(p_student_explanation, ''));
  normalized_private_staff_note text := nullif(btrim(coalesce(p_private_staff_note, '')), '');
  request_payload jsonb;
  course_record public.student_courses%rowtype;
  stable_schedule public.course_schedules%rowtype;
  active_version public.course_schedule_versions%rowtype;
  new_version public.course_schedule_versions%rowtype;
  prior_receipt public.course_schedule_publish_commands%rowtype;
  raw_pattern jsonb;
  normalized_patterns jsonb;
  before_snapshot jsonb;
  after_snapshot jsonb;
  response_payload jsonb;
  pattern_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required to publish a recurring meeting pattern.';
  end if;
  if p_course_id is null or p_expected_version_id is null then
    raise exception 'The Course and expected active Schedule Version are required.';
  end if;
  if normalized_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The meeting-pattern idempotency key is invalid.';
  end if;
  if char_length(normalized_student_explanation) not between 10 and 500 then
    raise exception 'A Student-visible explanation between 10 and 500 characters is required.';
  end if;
  if normalized_private_staff_note is not null
    and char_length(normalized_private_staff_note) > 2000 then
    raise exception 'A private meeting-pattern note cannot exceed 2000 characters.';
  end if;
  if p_patterns is null or jsonb_typeof(p_patterns) <> 'array'
    or jsonb_array_length(p_patterns) < 1
    or jsonb_array_length(p_patterns) > 28 then
    raise exception 'A recurring meeting pattern requires between 1 and 28 weekly slots.';
  end if;
  if p_effective_from is null or p_effective_until is null
    or p_effective_until < p_effective_from then
    raise exception 'The recurring meeting pattern requires an ordered effective date range.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for update;
  if not found then raise exception 'The Course could not be found.'; end if;
  if not public.current_user_can_edit_course_schedule(course_record.id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can edit this Course meeting pattern.';
  end if;
  if course_record.status not in ('draft', 'active') then
    raise exception 'This Course does not currently accept recurring meeting-pattern edits.';
  end if;
  if course_record.service_model <> 'recurring' then
    raise exception 'Only a recurring Course owns a weekly meeting pattern.';
  end if;
  if p_effective_from < (case
      when course_record.status = 'active' then current_date
      else course_record.start_date
    end) then
    raise exception 'A meeting-pattern Version cannot rewrite elapsed Course dates.';
  end if;
  if p_effective_until > course_record.scheduled_end_date then
    raise exception 'A meeting pattern cannot extend beyond the current Course Schedule.';
  end if;

  select * into stable_schedule
  from public.course_schedules
  where course_id = course_record.id
  for update;
  if not found then
    raise exception 'The required stable Course Schedule could not be found.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_patterns) pattern
    where btrim(coalesce(pattern ->> 'stablePatternKey', ''))
        !~ '^[a-z0-9][a-z0-9._:-]{2,119}$'
      or coalesce(pattern ->> 'weekday', '') !~ '^[0-6]$'
      or coalesce(pattern ->> 'localStartTime', '')
        !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(pattern ->> 'durationMinutes', '')
        not in ('30', '60', '90')
      or coalesce(pattern ->> 'position', '') !~ '^[0-9]+$'
      or (
        pattern ? 'metadata'
        and coalesce(jsonb_typeof(pattern -> 'metadata'), 'null') <> 'object'
      )
  ) then
    raise exception 'Every weekly slot requires a valid key, weekday, local time, duration, position, and metadata object.';
  end if;

  pattern_count := jsonb_array_length(p_patterns);
  if pattern_count <> (
      select count(distinct btrim(pattern ->> 'stablePatternKey'))
      from jsonb_array_elements(p_patterns) pattern
    ) then
    raise exception 'Every weekly slot requires a unique stable key.';
  end if;
  if pattern_count <> (
      select count(distinct (pattern ->> 'position')::integer)
      from jsonb_array_elements(p_patterns) pattern
    )
    or (
      select min((pattern ->> 'position')::integer)
      from jsonb_array_elements(p_patterns) pattern
    ) <> 0
    or (
      select max((pattern ->> 'position')::integer)
      from jsonb_array_elements(p_patterns) pattern
    ) <> pattern_count - 1 then
    raise exception 'Weekly slot positions must be unique and contiguous from zero.';
  end if;
  if pattern_count <> (
      select count(distinct concat(
        pattern ->> 'weekday',
        ':',
        pattern ->> 'localStartTime'
      ))
      from jsonb_array_elements(p_patterns) pattern
    ) then
    raise exception 'Two weekly slots cannot begin at the same local date and time.';
  end if;

  select jsonb_agg(jsonb_build_object(
    'stablePatternKey', btrim(pattern ->> 'stablePatternKey'),
    'weekday', (pattern ->> 'weekday')::integer,
    'localStartTime', pattern ->> 'localStartTime',
    'durationMinutes', (pattern ->> 'durationMinutes')::integer,
    'position', (pattern ->> 'position')::integer,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'metadata', coalesce(pattern -> 'metadata', '{}'::jsonb)
  ) order by (pattern ->> 'position')::integer)
  into normalized_patterns
  from jsonb_array_elements(p_patterns) pattern;

  request_payload := jsonb_build_object(
    'command', 'publish_course_meeting_pattern_version',
    'contractVersion', 2,
    'courseId', p_course_id,
    'expectedVersionId', p_expected_version_id,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'patterns', normalized_patterns,
    'studentExplanation', normalized_student_explanation,
    'privateStaffNote', normalized_private_staff_note
  );

  select * into prior_receipt
  from public.course_schedule_publish_commands receipt
  where receipt.schedule_id = stable_schedule.id
    and receipt.actor_user_id = caller_id
    and receipt.idempotency_key = normalized_idempotency_key;
  if found then
    if prior_receipt.request_payload <> request_payload then
      raise exception 'This Schedule idempotency key is already bound to a different request.';
    end if;
    return prior_receipt.response_payload
      || jsonb_build_object('idempotentReplay', true);
  end if;

  if course_record.active_schedule_version_id <> p_expected_version_id then
    raise exception 'The Schedule changed after this page loaded. Refresh it before publishing your edits.';
  end if;

  select * into active_version
  from public.course_schedule_versions
  where id = course_record.active_schedule_version_id
    and schedule_id = stable_schedule.id;
  if not found then
    raise exception 'The active Course Schedule Version could not be found.';
  end if;

  before_snapshot := jsonb_build_object(
    'effectiveFrom', (
      select min(pattern.effective_from)
      from public.course_schedule_meeting_patterns pattern
      where pattern.version_id = active_version.id
    ),
    'effectiveUntil', (
      select max(pattern.effective_until)
      from public.course_schedule_meeting_patterns pattern
      where pattern.version_id = active_version.id
    ),
    'timeZone', active_version.time_zone,
    'patterns', public.course_schedule_meeting_patterns_json(active_version.id)
  );
  after_snapshot := jsonb_build_object(
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'timeZone', active_version.time_zone,
    'patterns', normalized_patterns
  );
  if before_snapshot = after_snapshot then
    raise exception 'Publishing an identical recurring meeting pattern is not allowed.';
  end if;

  insert into public.course_schedule_versions (
    schedule_id,
    version_number,
    previous_version_id,
    legacy_schedule_id,
    name,
    time_zone,
    cadence,
    source_schema_version,
    source_snapshot,
    reason,
    created_by,
    metadata
  )
  select
    stable_schedule.id,
    coalesce(max(version.version_number), 0) + 1,
    active_version.id,
    active_version.legacy_schedule_id,
    active_version.name,
    active_version.time_zone,
    active_version.cadence || jsonb_build_object(
      'type', 'weekly_meeting_pattern',
      'meetingPatternCount', pattern_count,
      'meetingPatternEffectiveFrom', p_effective_from,
      'meetingPatternEffectiveUntil', p_effective_until,
      'meetingPatternSemantics', 'neutral_academic_opportunity'
    ),
    greatest(active_version.source_schema_version, 5),
    active_version.source_snapshot || jsonb_build_object(
      'meetingPatterns', normalized_patterns,
      'meetingPatternEffectiveFrom', p_effective_from,
      'meetingPatternEffectiveUntil', p_effective_until,
      'meetingPatternSemantics', 'neutral_academic_opportunity'
    ),
    'Recurring meeting pattern revised',
    caller_id,
    active_version.metadata || jsonb_build_object(
      'phase', '5.F.2.2',
      'changeScope', 'meeting_pattern',
      'meetingPatternContractVersion', 2,
      'expectedVersionId', p_expected_version_id,
      'idempotencyKey', normalized_idempotency_key
    )
  from public.course_schedule_versions version
  where version.schedule_id = stable_schedule.id
  returning * into new_version;

  insert into public.course_schedule_items (
    version_id,
    stable_item_key,
    legacy_schedule_session_id,
    title,
    scheduled_date,
    end_date,
    position,
    item_state,
    source_snapshot,
    item_kind,
    curriculum_node_id
  )
  select
    new_version.id,
    item.stable_item_key,
    item.legacy_schedule_session_id,
    item.title,
    item.scheduled_date,
    item.end_date,
    item.position,
    item.item_state,
    item.source_snapshot,
    item.item_kind,
    item.curriculum_node_id
  from public.course_schedule_items item
  where item.version_id = active_version.id
  order by item.position, item.id;

  for raw_pattern in
    select pattern
    from jsonb_array_elements(normalized_patterns) pattern
    order by (pattern ->> 'position')::integer
  loop
    insert into public.course_schedule_meeting_patterns (
      version_id,
      stable_pattern_key,
      weekday,
      local_start_time,
      duration_minutes,
      purpose,
      position,
      effective_from,
      effective_until,
      metadata
    ) values (
      new_version.id,
      raw_pattern ->> 'stablePatternKey',
      (raw_pattern ->> 'weekday')::smallint,
      (raw_pattern ->> 'localStartTime')::time,
      (raw_pattern ->> 'durationMinutes')::smallint,
      'academic',
      (raw_pattern ->> 'position')::integer,
      p_effective_from,
      p_effective_until,
      raw_pattern -> 'metadata'
    );
  end loop;

  insert into public.course_schedule_meeting_pattern_changes (
    course_id,
    version_id,
    previous_version_id,
    student_explanation,
    private_staff_note,
    before_snapshot,
    after_snapshot,
    actor_user_id
  ) values (
    course_record.id,
    new_version.id,
    active_version.id,
    normalized_student_explanation,
    normalized_private_staff_note,
    before_snapshot,
    after_snapshot,
    caller_id
  );

  update public.student_courses
  set active_schedule_version_id = new_version.id
  where id = course_record.id;

  insert into public.course_schedule_notification_events (
    recipient_user_id,
    actor_user_id,
    course_id,
    schedule_version_id,
    event_type,
    payload
  )
  select
    recipient.user_id,
    caller_id,
    course_record.id,
    new_version.id,
    'schedule_version_published',
    jsonb_build_object(
      'courseId', course_record.id,
      'courseTitle', course_record.title,
      'versionId', new_version.id,
      'versionNumber', new_version.version_number,
      'actorId', caller_id,
      'changeScope', 'meeting_pattern',
      'meetingPatternSemantics', 'neutral_academic_opportunity',
      'patternCount', pattern_count,
      'effectiveFrom', p_effective_from,
      'effectiveUntil', p_effective_until
    )
  from (
    select course_record.student_id as user_id
    union select course_record.tutor_id
    union select course_record.mentor_id
      where course_record.mentor_id is not null
  ) recipient;

  response_payload := jsonb_build_object(
    'courseId', course_record.id,
    'scheduleId', stable_schedule.id,
    'previousVersionId', active_version.id,
    'publishedVersionId', new_version.id,
    'versionNumber', new_version.version_number,
    'changeScope', 'meeting_pattern',
    'meetingPatternSemantics', 'neutral_academic_opportunity',
    'patternCount', pattern_count,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'idempotentReplay', false
  );

  insert into public.course_schedule_publish_commands (
    schedule_id,
    actor_user_id,
    idempotency_key,
    expected_version_id,
    published_version_id,
    request_payload,
    response_payload
  ) values (
    stable_schedule.id,
    caller_id,
    normalized_idempotency_key,
    p_expected_version_id,
    new_version.id,
    request_payload,
    response_payload
  );

  return response_payload;
end;
$$;

create table if not exists public.course_schedule_target_mapping_revisions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  revision_number integer not null,
  mapping_reason text not null,
  source_progress_event_id uuid
    references public.course_progress_events(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  mapping_signature text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint course_schedule_target_mapping_revision_number_check check (
    revision_number >= 1
  ),
  constraint course_schedule_target_mapping_reason_check check (
    mapping_reason in (
      'initial_generation',
      'schedule_version_activated',
      'progress_reflow',
      'manual_refresh'
    )
  ),
  constraint course_schedule_target_mapping_signature_check check (
    mapping_signature ~ '^[a-f0-9]{32}$'
  ),
  constraint course_schedule_target_mapping_snapshot_check check (
    jsonb_typeof(snapshot) = 'object'
  ),
  constraint course_schedule_target_mapping_version_number_key unique (
    version_id, revision_number
  ),
  constraint course_schedule_target_mapping_version_signature_key unique (
    version_id, mapping_signature
  )
);

create index if not exists course_schedule_target_mapping_course_idx
on public.course_schedule_target_mapping_revisions (
  course_id, created_at desc, id
);

create table if not exists public.course_schedule_academic_slot_targets (
  id uuid primary key default gen_random_uuid(),
  mapping_revision_id uuid not null
    references public.course_schedule_target_mapping_revisions(id) on delete restrict,
  academic_slot_id uuid not null
    references public.course_schedule_academic_slots(id) on delete restrict,
  schedule_item_id uuid
    references public.course_schedule_items(id) on delete restrict,
  mapping_state text not null,
  slot_position integer not null,
  target_position integer,
  created_at timestamptz not null default now(),
  constraint course_schedule_academic_slot_targets_state_check check (
    mapping_state in ('targeted', 'completed', 'open')
  ),
  constraint course_schedule_academic_slot_targets_slot_position_check check (
    slot_position >= 0
  ),
  constraint course_schedule_academic_slot_targets_target_position_check check (
    target_position is null or target_position >= 0
  ),
  constraint course_schedule_academic_slot_targets_state_identity_check check (
    (mapping_state = 'open' and schedule_item_id is null and target_position is null)
    or
    (mapping_state in ('targeted', 'completed')
      and schedule_item_id is not null
      and target_position is not null)
  ),
  constraint course_schedule_academic_slot_targets_revision_slot_key unique (
    mapping_revision_id, academic_slot_id
  )
);

create index if not exists course_schedule_academic_slot_targets_revision_idx
on public.course_schedule_academic_slot_targets (
  mapping_revision_id, slot_position, id
);

create or replace function public.reject_course_schedule_target_mapping_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Course Schedule target mappings are append-only; create a successor mapping revision instead.';
end;
$$;

drop trigger if exists course_schedule_target_mapping_revisions_immutable
on public.course_schedule_target_mapping_revisions;
create trigger course_schedule_target_mapping_revisions_immutable
before update or delete on public.course_schedule_target_mapping_revisions
for each row execute function public.reject_course_schedule_target_mapping_mutation();

drop trigger if exists course_schedule_academic_slot_targets_immutable
on public.course_schedule_academic_slot_targets;
create trigger course_schedule_academic_slot_targets_immutable
before update or delete on public.course_schedule_academic_slot_targets
for each row execute function public.reject_course_schedule_target_mapping_mutation();

create or replace function public.course_schedule_item_is_currently_studied(
  p_course_id uuid,
  p_schedule_item_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  item_record public.course_schedule_items%rowtype;
  progress jsonb;
begin
  select item.* into item_record
  from public.student_courses course
  join public.course_schedule_items item
    on item.version_id = course.active_schedule_version_id
  where course.id = p_course_id
    and item.id = p_schedule_item_id
    and item.item_state in ('scheduled', 'requeued');

  if not found or item_record.item_kind <> 'curriculum_topic' then
    return false;
  end if;

  progress := public.course_session_studied_aggregation(
    p_course_id,
    p_schedule_item_id
  );
  return coalesce((progress ->> 'marked')::boolean, false);
end;
$$;

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
  from public.student_courses
  where id = p_course_id;
  if not found then
    raise exception 'The Course could not be found for target mapping.';
  end if;
  if course_record.active_schedule_version_id <> p_version_id then
    raise exception 'Target mapping can be generated only for the active Schedule Version.';
  end if;

  select version.* into version_record
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where version.id = p_version_id
    and schedule.course_id = course_record.id;
  if not found then
    raise exception 'The Schedule Version does not belong to this Course.';
  end if;

  if course_record.service_model = 'recurring' then
    with item_states as (
      select
        item.id,
        item.stable_item_key,
        item.title,
        item.item_kind,
        item.scheduled_date,
        item.position,
        item.difficulty_level,
        case
          when item.item_kind = 'curriculum_topic'
            then public.course_schedule_item_is_currently_studied(
              course_record.id,
              item.id
            )
          else false
        end as studied
      from public.course_schedule_items item
      where item.version_id = version_record.id
        and item.item_state in ('scheduled', 'requeued')
    ),
    remaining as (
      select
        item.*,
        row_number() over (
          order by item.position, item.id
        ) - 1 as remaining_position
      from item_states item
      where item.item_kind <> 'curriculum_topic' or not item.studied
    ),
    ordered_slots as (
      select
        slot.*,
        row_number() over (
          order by slot.position, slot.id
        ) - 1 as slot_ordinal
      from public.course_schedule_academic_slots slot
      where slot.version_id = version_record.id
    ),
    slot_mappings as (
      select
        slot.id as slot_id,
        slot.stable_slot_key,
        slot.local_date,
        slot.local_start_time,
        slot.duration_minutes,
        slot.time_zone,
        slot.position as slot_position,
        target.id as target_item_id,
        target.stable_item_key,
        target.title,
        target.item_kind,
        target.scheduled_date,
        target.position as target_position,
        target.difficulty_level
      from ordered_slots slot
      left join remaining target
        on target.remaining_position = slot.slot_ordinal
    ),
    counts as (
      select
        (select count(*) from ordered_slots) as slot_count,
        (select count(*) from remaining) as remaining_count
    )
    select jsonb_build_object(
      'schemaVersion', 1,
      'courseId', course_record.id,
      'versionId', version_record.id,
      'serviceModel', course_record.service_model,
      'timeZone', version_record.time_zone,
      'slotMappings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'slotId', mapping.slot_id,
          'stableSlotKey', mapping.stable_slot_key,
          'localDate', mapping.local_date,
          'localStartTime', case
            when mapping.local_start_time is null then null
            else to_char(mapping.local_start_time, 'HH24:MI')
          end,
          'durationMinutes', mapping.duration_minutes,
          'timeZone', mapping.time_zone,
          'slotPosition', mapping.slot_position,
          'mappingState', case
            when mapping.target_item_id is null then 'open'
            else 'targeted'
          end,
          'targetScheduleItemId', mapping.target_item_id,
          'targetStableItemKey', mapping.stable_item_key,
          'targetTitle', mapping.title,
          'targetKind', mapping.item_kind,
          'targetPlannedDate', mapping.scheduled_date,
          'targetPosition', mapping.target_position,
          'difficultyLevel', mapping.difficulty_level
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
        from remaining target
        cross join counts
        where target.remaining_position >= counts.slot_count
      ), '[]'::jsonb),
      'capacity', (
        select jsonb_build_object(
          'status', case
            when counts.remaining_count > counts.slot_count
              then 'awaiting_future_slots'
            when counts.remaining_count < counts.slot_count
              then 'open_slots'
            else 'mapped'
          end,
          'slotCount', counts.slot_count,
          'remainingTargetCount', counts.remaining_count,
          'mappedTargetCount', least(counts.slot_count, counts.remaining_count),
          'awaitingFutureSlotCount', greatest(
            counts.remaining_count - counts.slot_count,
            0
          ),
          'openSlotCount', greatest(
            counts.slot_count - counts.remaining_count,
            0
          ),
          'requiresPurchase', false,
          'requiresAutomaticClassBooking', false
        )
        from counts
      ),
      'bookingTargetSelection', jsonb_build_object(
        'enabled', false,
        'selectionMode', 'automatic_next_unstudied',
        'recommendedTarget', null,
        'selectableTargets', '[]'::jsonb
      )
    ) into payload;
  else
    with item_states as (
      select
        item.id,
        item.stable_item_key,
        item.title,
        item.item_kind,
        item.scheduled_date,
        item.position,
        item.difficulty_level,
        case
          when item.item_kind = 'curriculum_topic'
            then public.course_schedule_item_is_currently_studied(
              course_record.id,
              item.id
            )
          else false
        end as studied
      from public.course_schedule_items item
      where item.version_id = version_record.id
        and item.item_state in ('scheduled', 'requeued')
    ),
    ordered_slots as (
      select slot.*
      from public.course_schedule_academic_slots slot
      where slot.version_id = version_record.id
      order by slot.position, slot.id
    ),
    slot_mappings as (
      select
        slot.id as slot_id,
        slot.stable_slot_key,
        slot.local_date,
        slot.time_zone,
        slot.position as slot_position,
        item.id as target_item_id,
        item.stable_item_key,
        item.title,
        item.item_kind,
        item.scheduled_date,
        item.position as target_position,
        item.difficulty_level,
        item.studied
      from ordered_slots slot
      join item_states item on item.id = slot.static_schedule_item_id
    ),
    unstudied_topics as (
      select
        item.*,
        row_number() over (
          order by item.position, item.id
        ) - 1 as recommendation_position
      from item_states item
      where item.item_kind = 'curriculum_topic'
        and not item.studied
    )
    select jsonb_build_object(
      'schemaVersion', 1,
      'courseId', course_record.id,
      'versionId', version_record.id,
      'serviceModel', course_record.service_model,
      'timeZone', version_record.time_zone,
      'slotMappings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'slotId', mapping.slot_id,
          'stableSlotKey', mapping.stable_slot_key,
          'localDate', mapping.local_date,
          'localStartTime', null,
          'durationMinutes', null,
          'timeZone', mapping.time_zone,
          'slotPosition', mapping.slot_position,
          'mappingState', case
            when mapping.item_kind = 'curriculum_topic' and mapping.studied
              then 'completed'
            else 'targeted'
          end,
          'targetScheduleItemId', mapping.target_item_id,
          'targetStableItemKey', mapping.stable_item_key,
          'targetTitle', mapping.title,
          'targetKind', mapping.item_kind,
          'targetPlannedDate', mapping.scheduled_date,
          'targetPosition', mapping.target_position,
          'difficultyLevel', mapping.difficulty_level
        ) order by mapping.slot_position, mapping.slot_id)
        from slot_mappings mapping
      ), '[]'::jsonb),
      'awaitingFutureSlot', '[]'::jsonb,
      'capacity', jsonb_build_object(
        'status', 'static_academic_plan',
        'slotCount', (select count(*) from ordered_slots),
        'remainingTargetCount', (select count(*) from unstudied_topics),
        'mappedTargetCount', (select count(*) from slot_mappings),
        'awaitingFutureSlotCount', 0,
        'openSlotCount', 0,
        'requiresPurchase', false,
        'requiresAutomaticClassBooking', false
      ),
      'bookingTargetSelection', jsonb_build_object(
        'enabled', course_record.service_model = 'on_demand',
        'selectionMode', case
          when course_record.service_model = 'on_demand'
            then 'student_selects_unstudied_topic'
          else 'not_available'
        end,
        'recommendedTarget', (
          select jsonb_build_object(
            'scheduleItemId', topic.id,
            'stableItemKey', topic.stable_item_key,
            'title', topic.title,
            'plannedDate', topic.scheduled_date,
            'position', topic.position,
            'difficultyLevel', topic.difficulty_level
          )
          from unstudied_topics topic
          where topic.recommendation_position = 0
        ),
        'selectableTargets', case
          when course_record.service_model = 'on_demand' then coalesce((
            select jsonb_agg(jsonb_build_object(
              'scheduleItemId', topic.id,
              'stableItemKey', topic.stable_item_key,
              'title', topic.title,
              'plannedDate', topic.scheduled_date,
              'position', topic.position,
              'difficultyLevel', topic.difficulty_level,
              'recommended', topic.recommendation_position = 0
            ) order by topic.recommendation_position, topic.id)
            from unstudied_topics topic
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      )
    ) into payload;
  end if;

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
    'initial_generation',
    'schedule_version_activated',
    'progress_reflow',
    'manual_refresh'
  ) then
    raise exception 'The Course Schedule target-mapping reason is invalid.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for update;
  if not found then
    raise exception 'The Course could not be found for target-mapping refresh.';
  end if;
  if course_record.active_schedule_version_id <> p_version_id then
    return jsonb_build_object(
      'courseId', course_record.id,
      'versionId', p_version_id,
      'status', 'inactive_version_ignored'
    );
  end if;

  if not exists (
    select 1
    from public.course_schedule_academic_slots slot
    where slot.version_id = p_version_id
  ) then
    return jsonb_build_object(
      'courseId', course_record.id,
      'versionId', p_version_id,
      'status', case
        when course_record.service_model = 'recurring'
          then 'meeting_pattern_review_required'
        else 'academic_slot_generation_required'
      end
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
    course_record.id,
    p_version_id
  );
  signature_value := md5(snapshot_payload::text);

  select * into latest_revision
  from public.course_schedule_target_mapping_revisions revision
  where revision.version_id = p_version_id
  order by revision.revision_number desc, revision.id desc
  limit 1;

  if found and latest_revision.mapping_signature = signature_value then
    return jsonb_build_object(
      'courseId', course_record.id,
      'versionId', p_version_id,
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
    course_id,
    version_id,
    revision_number,
    mapping_reason,
    source_progress_event_id,
    actor_user_id,
    mapping_signature,
    snapshot
  ) values (
    course_record.id,
    p_version_id,
    next_revision_number,
    p_mapping_reason,
    p_source_progress_event_id,
    coalesce(progress_event.actor_user_id, auth.uid()),
    signature_value,
    snapshot_payload
  )
  returning * into new_revision;

  for mapping in
    select value
    from jsonb_array_elements(snapshot_payload -> 'slotMappings')
  loop
    insert into public.course_schedule_academic_slot_targets (
      mapping_revision_id,
      academic_slot_id,
      schedule_item_id,
      mapping_state,
      slot_position,
      target_position
    ) values (
      new_revision.id,
      (mapping ->> 'slotId')::uuid,
      nullif(mapping ->> 'targetScheduleItemId', '')::uuid,
      mapping ->> 'mappingState',
      (mapping ->> 'slotPosition')::integer,
      nullif(mapping ->> 'targetPosition', '')::integer
    );
  end loop;

  return jsonb_build_object(
    'courseId', course_record.id,
    'versionId', p_version_id,
    'mappingRevisionId', new_revision.id,
    'revisionNumber', new_revision.revision_number,
    'status', 'generated',
    'capacity', snapshot_payload -> 'capacity',
    'bookingTargetSelection', snapshot_payload -> 'bookingTargetSelection'
  );
end;
$$;

create or replace function public.refresh_active_course_schedule_target_mapping()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.active_schedule_version_id is not null
    and (
      tg_op = 'INSERT'
      or old.active_schedule_version_id is distinct from new.active_schedule_version_id
    ) then
    perform public.refresh_course_schedule_target_mapping(
      new.id,
      new.active_schedule_version_id,
      'schedule_version_activated',
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_active_course_schedule_target_mapping
on public.student_courses;
create trigger refresh_active_course_schedule_target_mapping
after insert or update of active_schedule_version_id on public.student_courses
for each row execute function public.refresh_active_course_schedule_target_mapping();

create or replace function public.refresh_course_schedule_target_mapping_after_progress()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_version_id uuid;
begin
  if new.progress_kind <> 'studied'
    or new.event_action not in ('marked', 'reversed') then
    return new;
  end if;

  select course.active_schedule_version_id into active_version_id
  from public.student_courses course
  where course.id = new.course_id;

  if active_version_id is not null then
    perform public.refresh_course_schedule_target_mapping(
      new.course_id,
      active_version_id,
      'progress_reflow',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_course_schedule_target_mapping_after_progress
on public.course_progress_events;
create trigger refresh_course_schedule_target_mapping_after_progress
after insert on public.course_progress_events
for each row execute function public.refresh_course_schedule_target_mapping_after_progress();

create or replace function public.get_my_course_target_mapping(
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
  current_revision public.course_schedule_target_mapping_revisions%rowtype;
  staff_history boolean;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open Course target mapping.';
  end if;
  if not public.current_user_can_read_student_course(p_course_id) then
    raise exception 'You do not have access to this Course target mapping.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then
    raise exception 'The Course could not be found.';
  end if;

  staff_history := public.current_user_can_read_course_schedule_history(
    course_record.id
  );

  select * into current_revision
  from public.course_schedule_target_mapping_revisions revision
  where revision.version_id = course_record.active_schedule_version_id
  order by revision.revision_number desc, revision.id desc
  limit 1;

  payload := jsonb_build_object(
    'schemaVersion', 1,
    'course', jsonb_build_object(
      'id', course_record.id,
      'title', course_record.title,
      'status', course_record.status,
      'serviceModel', course_record.service_model
    ),
    'activeVersionId', course_record.active_schedule_version_id,
    'mappingStatus', case
      when current_revision.id is null then 'generation_required'
      else 'configured'
    end,
    'mappingRevision', case
      when current_revision.id is null then null
      else jsonb_build_object(
        'id', current_revision.id,
        'revisionNumber', current_revision.revision_number,
        'reason', current_revision.mapping_reason,
        'createdAt', current_revision.created_at
      )
    end,
    'mapping', coalesce(current_revision.snapshot, jsonb_build_object(
      'slotMappings', '[]'::jsonb,
      'awaitingFutureSlot', '[]'::jsonb,
      'bookingTargetSelection', jsonb_build_object(
        'enabled', false,
        'recommendedTarget', null,
        'selectableTargets', '[]'::jsonb
      )
    )),
    'permissions', jsonb_build_object(
      'canReadMappingHistory', staff_history,
      'canMutateMappingDirectly', false,
      'bookingChoiceOwnedByLaterLessonRequest', true
    ),
    'history', case when staff_history then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', revision.id,
        'versionId', revision.version_id,
        'revisionNumber', revision.revision_number,
        'reason', revision.mapping_reason,
        'sourceProgressEventId', revision.source_progress_event_id,
        'actorUserId', revision.actor_user_id,
        'createdAt', revision.created_at,
        'capacity', revision.snapshot -> 'capacity'
      ) order by version.version_number desc, revision.revision_number desc)
      from public.course_schedule_target_mapping_revisions revision
      join public.course_schedule_versions version on version.id = revision.version_id
      join public.course_schedules schedule on schedule.id = version.schedule_id
      where schedule.course_id = course_record.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'featureStatus', jsonb_build_object(
      'recurringAutomaticTargeting', 'active_phase_5f2_2',
      'onDemandTargetSelectionData', 'active_phase_5f2_2',
      'onDemandBookingChoice', 'deferred_lesson_request_phase',
      'targetLockAndOutcomes', 'planned_phase_5f3',
      'credits', 'deferred_credit_phase'
    )
  );

  return payload;
end;
$$;

alter table public.course_schedule_target_mapping_revisions enable row level security;
alter table public.course_schedule_academic_slot_targets enable row level security;

create policy "Active Students and authorized staff read target mappings"
on public.course_schedule_target_mapping_revisions
for select to authenticated
using (exists (
  select 1
  from public.student_courses course
  where course.id = course_schedule_target_mapping_revisions.course_id
    and (
      (
        course.student_id = (select auth.uid())
        and course.active_schedule_version_id
          = course_schedule_target_mapping_revisions.version_id
      )
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

create policy "Active Students and authorized staff read mapped targets"
on public.course_schedule_academic_slot_targets
for select to authenticated
using (exists (
  select 1
  from public.course_schedule_target_mapping_revisions revision
  join public.student_courses course on course.id = revision.course_id
  where revision.id = course_schedule_academic_slot_targets.mapping_revision_id
    and (
      (
        course.student_id = (select auth.uid())
        and course.active_schedule_version_id = revision.version_id
      )
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

revoke all on public.course_schedule_target_mapping_revisions
  from public, anon, authenticated;
revoke all on public.course_schedule_academic_slot_targets
  from public, anon, authenticated;
grant select on public.course_schedule_target_mapping_revisions to authenticated;
grant select on public.course_schedule_target_mapping_revisions to service_role;
grant select on public.course_schedule_academic_slot_targets to authenticated;
grant select on public.course_schedule_academic_slot_targets to service_role;

revoke all on function public.reject_course_schedule_target_mapping_mutation()
  from public, anon, authenticated;
revoke all on function public.course_schedule_item_is_currently_studied(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.course_schedule_target_mapping_snapshot(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_course_schedule_target_mapping(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_active_course_schedule_target_mapping()
  from public, anon, authenticated;
revoke all on function public.refresh_course_schedule_target_mapping_after_progress()
  from public, anon, authenticated;
revoke all on function public.get_my_course_target_mapping(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_course_target_mapping(uuid)
  to authenticated;
grant execute on function public.get_my_course_target_mapping(uuid)
  to service_role;

comment on table public.course_schedule_target_mapping_revisions is
  'Phase 5.F.2.2 append-only effective mapping revisions. Students see the current active mapping; authorized staff retain history.';
comment on table public.course_schedule_academic_slot_targets is
  'Immutable slot-to-structural-item rows owned by one target-mapping revision. They are academic intent, not booked Classes.';
comment on function public.get_my_course_target_mapping(uuid) is
  'Role-aware Phase 5.F.2.2 projection. On-demand target options are data for the later Lesson Request form and never create a booking.';

-- Backfill the current active Version when Phase 5.F.2.1 already generated
-- slots. Recurring Courses still awaiting a meeting pattern remain untouched.
do $backfill_active_target_mappings$
declare
  target record;
begin
  for target in
    select course.id as course_id, course.active_schedule_version_id as version_id
    from public.student_courses course
    where course.active_schedule_version_id is not null
      and exists (
        select 1
        from public.course_schedule_academic_slots slot
        where slot.version_id = course.active_schedule_version_id
      )
  loop
    perform public.refresh_course_schedule_target_mapping(
      target.course_id,
      target.version_id,
      'initial_generation',
      null
    );
  end loop;
end;
$backfill_active_target_mappings$;
