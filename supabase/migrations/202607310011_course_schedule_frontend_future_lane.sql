-- Phase 5.G.2.4.7.3.1.5, step 1: persist one frontend-authored future
-- cadence lane and prevent inherited recurring patterns from reintroducing
-- dates from a superseded cadence.
--
-- Studied history and the future lane are deliberately different facts. A
-- Studied Session keeps its actual Studied date, while the Builder submits a
-- complete ordered vector of cadence slots for the selected plan. The server
-- validates that vector, materializes it as immutable academic slots, and
-- lets the existing adaptive mapper assign only unfinished targets to it.

begin;

create table if not exists public.course_schedule_future_lane_publish_intents (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  schedule_id uuid not null references public.course_schedules(id) on delete restrict,
  expected_version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  actor_user_id uuid not null,
  idempotency_key text not null,
  lane_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint course_schedule_future_lane_intents_snapshot_check check (
    jsonb_typeof(lane_snapshot) = 'object'
    and jsonb_typeof(lane_snapshot -> 'entries') = 'array'
  ),
  constraint course_schedule_future_lane_intents_command_key unique (
    schedule_id, actor_user_id, idempotency_key
  )
);

create index if not exists course_schedule_future_lane_intents_version_idx
on public.course_schedule_future_lane_publish_intents (
  schedule_id, expected_version_id, created_at desc, id desc
);

create or replace function public.reject_course_schedule_future_lane_intent_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'Course Schedule future-lane intents are immutable publication evidence.';
end;
$$;

drop trigger if exists course_schedule_future_lane_publish_intents_immutable
on public.course_schedule_future_lane_publish_intents;
create trigger course_schedule_future_lane_publish_intents_immutable
before update or delete on public.course_schedule_future_lane_publish_intents
for each row execute function
  public.reject_course_schedule_future_lane_intent_mutation();

alter table public.course_schedule_future_lane_publish_intents
  enable row level security;

create or replace function public.validate_course_schedule_effective_future_lane(
  p_builder_schedule jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  publication_metadata jsonb;
  normalized_cadence jsonb;
  time_zone_name text;
  lane jsonb;
  sessions jsonb;
  proposed_start date;
  local_today date;
  start_boundary date;
  previous_date date;
  expected_date date;
  expected_end date;
  lane_entry jsonb;
  session_entry jsonb;
  submitted_date date;
  submitted_end date;
  entry_ordinal integer;
  session_count integer;
begin
  if coalesce(
      (p_builder_schedule #>> '{context,effectiveFutureLaneAuthority}')::boolean,
      false
    ) is not true
    or lower(coalesce(p_builder_schedule ->> 'pacingMode', 'adaptive'))
      <> 'adaptive' then
    return null;
  end if;

  lane := p_builder_schedule #> '{context,effectiveFutureLane}';
  sessions := p_builder_schedule -> 'sessions';
  if jsonb_typeof(lane) <> 'array'
    or jsonb_typeof(sessions) <> 'array' then
    raise exception
      'The generated Schedule requires one complete effective future lane.';
  end if;

  session_count := jsonb_array_length(sessions);
  if session_count < 1
    or session_count > 500
    or jsonb_array_length(lane) <> session_count then
    raise exception
      'The effective future lane must identify every selected Session exactly once.';
  end if;

  if session_count <> (
      select count(distinct btrim(entry.value ->> 'stableItemKey'))
      from jsonb_array_elements(lane) entry(value)
      where btrim(coalesce(entry.value ->> 'stableItemKey', '')) <> ''
    ) then
    raise exception
      'Every effective future-lane entry requires a unique stable Session identity.';
  end if;

  publication_metadata :=
    public.course_schedule_builder_publication_metadata(p_builder_schedule);
  normalized_cadence := publication_metadata -> 'cadence';
  time_zone_name := publication_metadata ->> 'timeZone';
  begin
    proposed_start := (p_builder_schedule ->> 'startDate')::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'The generated Schedule start date is invalid.';
  end;
  if proposed_start is null then
    raise exception 'The generated Schedule start date is invalid.';
  end if;

  local_today := (clock_timestamp() at time zone time_zone_name)::date;
  start_boundary := greatest(proposed_start, local_today);

  for lane_entry, entry_ordinal in
    select entry.value, entry.ordinality::integer - 1
    from jsonb_array_elements(lane)
      with ordinality entry(value, ordinality)
    order by entry.ordinality
  loop
    session_entry := sessions -> entry_ordinal;
    if lane_entry ->> 'stableItemKey'
      is distinct from session_entry ->> 'id'
      or coalesce(lane_entry ->> 'ordinal', '') !~ '^[0-9]+$'
      or (lane_entry ->> 'ordinal')::integer <> entry_ordinal then
      raise exception
        'The effective future lane must preserve the selected Session order and identity.';
    end if;

    begin
      submitted_date := (lane_entry ->> 'startDate')::date;
      submitted_end := (lane_entry ->> 'endDate')::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'An effective future-lane date is invalid.';
    end;

    expected_date := public.course_schedule_next_combined_cadence_date(
      normalized_cadence,
      previous_date,
      start_boundary
    );
    expected_end := expected_date + case
      when normalized_cadence ->> 'type' = 'day_interval'
        then (normalized_cadence ->> 'intervalDays')::integer - 1
      else 0
    end;
    if submitted_date is distinct from expected_date
      or submitted_end is distinct from expected_end then
      raise exception
        'The effective future lane must use every current cadence slot in order without stale weekdays or vacancies.';
    end if;
    previous_date := expected_date;
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'timeZone', time_zone_name,
    'cadence', normalized_cadence,
    'startBoundary', start_boundary,
    'entries', lane
  );
end;
$$;

-- Keep the existing stale-Version and retry precedence. Only a current,
-- adaptive document that opts into the new contract is lane-validated.
create or replace function public.reflow_course_schedule_builder_items(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_builder_schedule jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  current_active_version_id uuid;
  ignored_publication_metadata jsonb;
  ignored_future_lane jsonb;
  proposed_start_text text;
  proposed_start date;
begin
  select course.active_schedule_version_id
  into current_active_version_id
  from public.student_courses course
  where course.id = p_course_id;

  if not found
    or current_active_version_id is distinct from p_expected_version_id then
    return p_items;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The generated Course Schedule item list is invalid.';
  end if;

  ignored_publication_metadata :=
    public.course_schedule_builder_publication_metadata(p_builder_schedule);
  ignored_future_lane :=
    public.validate_course_schedule_effective_future_lane(p_builder_schedule);
  proposed_start_text := nullif(btrim(p_builder_schedule ->> 'startDate'), '');
  if proposed_start_text is not null then
    begin
      proposed_start := proposed_start_text::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'The generated Schedule start date is invalid.';
    end;
  end if;

  return p_items;
end;
$$;

-- Retain the previous generator as the compatibility path. The activation
-- trigger is recompiled below so new Builder Versions call this wrapper.
alter function public.generate_course_schedule_academic_slots(uuid, uuid)
rename to generate_course_schedule_academic_slots_phase5g2_4_7_3_1_5_base;

create or replace function public.generate_course_schedule_academic_slots(
  p_course_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  version_record public.course_schedule_versions%rowtype;
  lane_snapshot jsonb;
  existing_count integer;
  generated_count integer := 0;
begin
  select course.* into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception 'The Course could not be found for academic-slot generation.';
  end if;

  select version.* into version_record
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where version.id = p_version_id
    and schedule.course_id = course_record.id;
  if not found then
    raise exception 'The requested Schedule Version does not belong to this Course.';
  end if;

  select count(*) into existing_count
  from public.course_schedule_academic_slots slot
  where slot.version_id = version_record.id;
  if existing_count > 0 then
    return jsonb_build_object(
      'courseId', course_record.id,
      'versionId', version_record.id,
      'serviceModel', course_record.service_model,
      'status', 'already_generated',
      'slotCount', existing_count
    );
  end if;

  select intent.lane_snapshot into lane_snapshot
  from public.course_schedule_future_lane_publish_intents intent
  where intent.course_id = course_record.id
    and intent.schedule_id = version_record.schedule_id
    and intent.expected_version_id = version_record.previous_version_id
    and intent.actor_user_id = version_record.created_by
  order by intent.created_at desc, intent.id desc
  limit 1;

  if lane_snapshot is null then
    return public.generate_course_schedule_academic_slots_phase5g2_4_7_3_1_5_base(
      p_course_id,
      p_version_id
    );
  end if;

  insert into public.course_schedule_academic_slots (
    course_id, version_id, source_kind, meeting_pattern_id,
    static_schedule_item_id, stable_slot_key, local_date,
    local_start_time, duration_minutes, time_zone, position, metadata
  )
  select
    course_record.id,
    version_record.id,
    'static_schedule',
    null,
    item.id,
    'frontend:' || lpad((entry.value ->> 'ordinal'), 4, '0'),
    (entry.value ->> 'startDate')::date,
    null,
    null,
    version_record.time_zone,
    (entry.value ->> 'ordinal')::integer,
    jsonb_build_object(
      'schemaVersion', 1,
      'sourceScheduleItemKey', item.stable_item_key,
      'frontendCadenceLane', true,
      'recurringDateFallback', course_record.service_model = 'recurring',
      'createsBookedClass', false,
      'createsSixHourHold', false
    )
  from jsonb_array_elements(lane_snapshot -> 'entries') entry(value)
  join public.course_schedule_items item
    on item.version_id = version_record.id
   and item.stable_item_key = entry.value ->> 'stableItemKey'
   and item.item_state in ('scheduled', 'requeued')
  order by (entry.value ->> 'ordinal')::integer;

  get diagnostics generated_count = row_count;
  if generated_count <> jsonb_array_length(lane_snapshot -> 'entries') then
    raise exception
      'The effective future lane could not be matched to every published Session identity.';
  end if;

  return jsonb_build_object(
    'courseId', course_record.id,
    'versionId', version_record.id,
    'serviceModel', course_record.service_model,
    'status', 'generated_frontend_future_lane',
    'slotCount', generated_count
  );
end;
$$;

create or replace function public.generate_active_course_schedule_academic_slots()
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
    perform public.generate_course_schedule_academic_slots(
      new.id,
      new.active_schedule_version_id
    );
  end if;
  return new;
end;
$$;

-- Insert the lane intent before the governed base creates and activates the
-- successor Version. That lets activation materialize the exact submitted
-- slot vector atomically in the same transaction.
create or replace function public.publish_course_builder_schedule(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_builder_schedule jsonb,
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
  locked_course public.student_courses%rowtype;
  stable_schedule_id uuid;
  normalized_items jsonb;
  future_lane jsonb;
begin
  if caller_id is null then
    raise exception
      'Authentication is required to publish a generated Course Schedule.';
  end if;
  if not public.current_user_can_edit_course_schedule(p_course_id) then
    raise exception
      'Only the assigned Tutor or supervising Mentor can publish this generated Course Schedule.';
  end if;

  select course.* into locked_course
  from public.student_courses course
  where course.id = p_course_id
  for update;
  if not found then
    raise exception 'The Course could not be found.';
  end if;

  normalized_items := public.reflow_course_schedule_builder_items(
    p_course_id,
    p_expected_version_id,
    p_builder_schedule,
    p_items
  );

  if locked_course.active_schedule_version_id = p_expected_version_id then
    future_lane :=
      public.validate_course_schedule_effective_future_lane(p_builder_schedule);
    if future_lane is not null then
      select schedule.id into stable_schedule_id
      from public.course_schedules schedule
      where schedule.course_id = locked_course.id;

      insert into public.course_schedule_future_lane_publish_intents (
        course_id, schedule_id, expected_version_id, actor_user_id,
        idempotency_key, lane_snapshot
      ) values (
        locked_course.id,
        stable_schedule_id,
        p_expected_version_id,
        caller_id,
        lower(btrim(coalesce(p_idempotency_key, ''))),
        future_lane
      )
      on conflict (schedule_id, actor_user_id, idempotency_key) do nothing;
    end if;
  end if;

  return public.publish_course_builder_schedule_phase5g2_4_7_3_1_3_base(
    p_course_id,
    p_expected_version_id,
    p_builder_schedule,
    normalized_items,
    p_change_reasons,
    p_idempotency_key
  );
end;
$$;

revoke all on table public.course_schedule_future_lane_publish_intents
from public, anon, authenticated;
revoke all on function public.reject_course_schedule_future_lane_intent_mutation()
from public, anon, authenticated, service_role;
revoke all on function public.validate_course_schedule_effective_future_lane(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.reflow_course_schedule_builder_items(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function
  public.generate_course_schedule_academic_slots_phase5g2_4_7_3_1_5_base(
    uuid, uuid
  ) from public, anon, authenticated, service_role;
revoke all on function public.generate_course_schedule_academic_slots(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.generate_active_course_schedule_academic_slots()
from public, anon, authenticated, service_role;
revoke all on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon;
grant execute on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) to authenticated;

comment on table public.course_schedule_future_lane_publish_intents is
  'Immutable, internal evidence of the complete frontend-calculated cadence slot vector used by one governed Schedule publication.';
comment on function public.validate_course_schedule_effective_future_lane(jsonb) is
  'Validates exact Session identity, order, date boundaries, and gap-free cadence before the frontend-authored lane can be persisted.';
comment on function public.generate_course_schedule_academic_slots(uuid, uuid) is
  'Materializes a validated frontend future lane before falling back to legacy meeting-pattern or static slot generation.';
comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes a governed successor and atomically materializes its validated frontend-calculated future cadence lane.';

commit;
