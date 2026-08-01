-- Phase 5.G.2.4.7.2 follow-up: Adaptive pacing for recurring Courses that
-- predate a governed meeting pattern.
--
-- A recurring Course can already own a dated structural Schedule while its
-- actual Class meeting pattern is still unconfigured. Those dates are valid
-- academic opportunities for pacing, but they are not booked Classes and
-- must not create a time, duration, attendance fact, credit charge, or
-- six-hour hold. Materialize them as date-only `static_schedule` slots. A
-- later meeting-pattern publication creates a successor Version whose slots
-- come from the real recurring pattern; retained fallback slots remain
-- immutable history on the older Version.

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
  stable_schedule public.course_schedules%rowtype;
  version_record public.course_schedule_versions%rowtype;
  existing_count integer;
  generated_count integer := 0;
  generation_status text;
  has_recurring_pattern boolean := false;
begin
  if p_course_id is null or p_version_id is null then
    raise exception
      'Academic-slot generation requires a Course and Schedule Version.';
  end if;

  select * into course_record
  from public.student_courses course
  where course.id = p_course_id
  for share;
  if not found then
    raise exception
      'The Course could not be found for academic-slot generation.';
  end if;

  select * into stable_schedule
  from public.course_schedules schedule
  where schedule.course_id = course_record.id;
  if not found then
    raise exception
      'The stable Course Schedule could not be found for academic-slot generation.';
  end if;

  select * into version_record
  from public.course_schedule_versions version
  where version.id = p_version_id
    and version.schedule_id = stable_schedule.id;
  if not found then
    raise exception
      'The requested Schedule Version does not belong to this Course.';
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

  select exists (
    select 1
    from public.course_schedule_meeting_patterns pattern
    where pattern.version_id = version_record.id
  ) into has_recurring_pattern;

  if course_record.service_model = 'recurring'
    and has_recurring_pattern then
    with occurrences as (
      select
        pattern.id as meeting_pattern_id,
        pattern.stable_pattern_key,
        pattern.local_start_time,
        pattern.duration_minutes,
        pattern.position as pattern_position,
        generated.local_day::date as local_date
      from public.course_schedule_meeting_patterns pattern
      cross join lateral generate_series(
        pattern.effective_from::timestamp,
        pattern.effective_until::timestamp,
        interval '1 day'
      ) generated(local_day)
      where pattern.version_id = version_record.id
        and extract(dow from generated.local_day)::integer = pattern.weekday
    ),
    ordered as (
      select
        occurrence.*,
        row_number() over (
          order by
            occurrence.local_date,
            occurrence.local_start_time,
            occurrence.pattern_position,
            occurrence.meeting_pattern_id
        ) - 1 as slot_position
      from occurrences occurrence
    )
    insert into public.course_schedule_academic_slots (
      course_id, version_id, source_kind, meeting_pattern_id,
      static_schedule_item_id, stable_slot_key, local_date,
      local_start_time, duration_minutes, time_zone, position, metadata
    )
    select
      course_record.id,
      version_record.id,
      'recurring_pattern',
      ordered.meeting_pattern_id,
      null,
      'pattern:' || ordered.stable_pattern_key || ':' ||
        to_char(ordered.local_date, 'YYYYMMDD'),
      ordered.local_date,
      ordered.local_start_time,
      ordered.duration_minutes,
      version_record.time_zone,
      ordered.slot_position::integer,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourcePatternKey', ordered.stable_pattern_key,
        'generationPhase', '5.F.2.1'
      )
    from ordered
    order by ordered.slot_position
    on conflict (version_id, stable_slot_key) do nothing;

    get diagnostics generated_count = row_count;
    if generated_count = 0 then
      raise exception
        'The active meeting pattern does not produce an academic occurrence inside its effective range.';
    end if;
    generation_status := 'generated_recurring';
  elsif course_record.service_model in (
    'recurring',
    'on_demand',
    'access_only'
  ) then
    with ordered as (
      select
        item.id as schedule_item_id,
        item.stable_item_key,
        item.scheduled_date as local_date,
        row_number() over (
          order by item.scheduled_date, item.position, item.id
        ) - 1 as slot_position
      from public.course_schedule_items item
      where item.version_id = version_record.id
        and item.item_state in ('scheduled', 'requeued')
    )
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
      ordered.schedule_item_id,
      case
        when course_record.service_model = 'recurring'
          then 'fallback:' || ordered.stable_item_key
        else 'static:' || ordered.stable_item_key
      end,
      ordered.local_date,
      null,
      null,
      version_record.time_zone,
      ordered.slot_position::integer,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourceScheduleItemKey', ordered.stable_item_key,
        'generationPhase', case
          when course_record.service_model = 'recurring'
            then '5.G.2.4.7.2'
          else '5.F.2.1'
        end,
        'recurringDateFallback',
          course_record.service_model = 'recurring',
        'createsBookedClass', false,
        'createsSixHourHold', false
      )
    from ordered
    order by ordered.slot_position
    on conflict (version_id, stable_slot_key) do nothing;

    get diagnostics generated_count = row_count;
    if generated_count = 0 then
      raise exception
        'A date-only Course Schedule requires at least one active academic item.';
    end if;
    generation_status := case
      when course_record.service_model = 'recurring'
        then 'generated_recurring_date_fallback'
      else 'generated_static'
    end;
  else
    raise exception
      'The Course service model cannot generate academic slots.';
  end if;

  return jsonb_build_object(
    'courseId', course_record.id,
    'versionId', version_record.id,
    'serviceModel', course_record.service_model,
    'status', generation_status,
    'slotCount', generated_count
  );
end;
$$;

comment on function public.generate_course_schedule_academic_slots(uuid, uuid)
is
  'Internal immutable slot generator. Recurring Versions with a meeting pattern use timed occurrences; recurring Versions awaiting one use structural dates only for Adaptive pacing and do not fabricate Classes or holds.';

-- Elapsed fallback dates are history, not future academic capacity. This
-- snapshot deliberately excludes them while retaining every immutable slot
-- row. Timed recurring patterns continue through the Phase 5.F.3
-- lock/outcome-aware mapper.
create or replace function
public.course_schedule_recurring_date_fallback_mapping_snapshot(
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
  local_today date;
  payload jsonb;
begin
  select * into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception
      'The Course could not be found for recurring date-fallback mapping.';
  end if;

  select version.* into version_record
  from public.course_schedule_versions version
  join public.course_schedules schedule
    on schedule.id = version.schedule_id
  where version.id = p_version_id
    and schedule.course_id = course_record.id;
  if not found
    or course_record.active_schedule_version_id <> version_record.id then
    raise exception
      'Recurring date-fallback mapping requires the active Schedule Version.';
  end if;

  local_today :=
    (clock_timestamp() at time zone version_record.time_zone)::date;

  with item_states as (
    select
      item.*,
      case
        when item.item_kind = 'curriculum_topic' then
          public.course_schedule_item_is_currently_studied(
            course_record.id,
            item.id
          )
        else false
      end as studied
    from public.course_schedule_items item
    where item.version_id = version_record.id
      and item.item_state in ('scheduled', 'requeued')
  ),
  eligible_items as (
    select
      item.*,
      row_number() over (
        order by item.position, item.id
      ) - 1 as item_ordinal
    from item_states item
    where item.item_kind <> 'curriculum_topic'
      or not item.studied
  ),
  ordered_slots as (
    select
      slot.*,
      row_number() over (
        order by slot.position, slot.id
      ) - 1 as slot_ordinal
    from public.course_schedule_academic_slots slot
    where slot.version_id = version_record.id
      and slot.source_kind = 'static_schedule'
      and slot.metadata ->> 'recurringDateFallback' = 'true'
      and slot.local_date >= local_today
  ),
  mappings as (
    select
      slot.id as slot_id,
      slot.stable_slot_key,
      slot.local_date,
      slot.local_start_time,
      slot.duration_minutes,
      slot.time_zone,
      slot.position as slot_position,
      item.id as target_item_id,
      item.stable_item_key,
      item.title,
      item.item_kind,
      item.position as target_position,
      item.difficulty_level,
      item.scheduled_date
    from ordered_slots slot
    left join eligible_items item
      on item.item_ordinal = slot.slot_ordinal
  ),
  counts as (
    select
      (select count(*) from ordered_slots) as slot_count,
      (select count(*) from eligible_items) as item_count
  )
  select jsonb_build_object(
    'schemaVersion', 4,
    'courseId', course_record.id,
    'versionId', version_record.id,
    'serviceModel', course_record.service_model,
    'timeZone', version_record.time_zone,
    'pacingMode', 'adaptive',
    'slotSourceMode', 'recurring_schedule_date_fallback',
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
        'difficultyLevel', mapping.difficulty_level,
        'targetLocked', false
      ) order by mapping.slot_position, mapping.slot_id)
      from mappings mapping
    ), '[]'::jsonb),
    'awaitingFutureSlot', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scheduleItemId', item.id,
        'stableItemKey', item.stable_item_key,
        'title', item.title,
        'kind', item.item_kind,
        'plannedDate', item.scheduled_date,
        'position', item.position,
        'difficultyLevel', item.difficulty_level,
        'status', 'awaiting_future_slot'
      ) order by item.item_ordinal, item.id)
      from eligible_items item
      cross join counts
      where item.item_ordinal >= counts.slot_count
    ), '[]'::jsonb),
    'capacity', (
      select jsonb_build_object(
        'status', case
          when counts.item_count > counts.slot_count
            then 'awaiting_future_slots'
          when counts.item_count < counts.slot_count
            then 'open_slots'
          else 'mapped'
        end,
        'slotCount', counts.slot_count,
        'unlockedSlotCount', counts.slot_count,
        'remainingTargetCount', counts.item_count,
        'mappedTargetCount',
          least(counts.slot_count, counts.item_count),
        'awaitingFutureSlotCount',
          greatest(counts.item_count - counts.slot_count, 0),
        'openSlotCount',
          greatest(counts.slot_count - counts.item_count, 0),
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

  return payload;
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
  policy jsonb := public.course_schedule_pacing_policy(p_version_id);
begin
  select * into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception
      'The Course could not be found for paced target mapping.';
  end if;

  if policy ->> 'mode' = 'adaptive'
    and course_record.service_model = 'recurring' then
    if exists (
      select 1
      from public.course_schedule_academic_slots slot
      where slot.version_id = p_version_id
        and slot.source_kind = 'static_schedule'
        and slot.metadata ->> 'recurringDateFallback' = 'true'
    ) then
      return
        public.course_schedule_recurring_date_fallback_mapping_snapshot(
          p_course_id,
          p_version_id
        );
    end if;

    return
      public.course_schedule_target_mapping_snapshot_phase5g2_4_7_2_base(
        p_course_id,
        p_version_id
      );
  end if;

  return public.course_schedule_pacing_mapping_snapshot(
    p_course_id,
    p_version_id,
    policy ->> 'mode',
    coalesce(policy -> 'frozenEffectiveDates', '{}'::jsonb)
  );
end;
$$;

revoke all on function
  public.course_schedule_recurring_date_fallback_mapping_snapshot(uuid, uuid)
from public, anon, authenticated, service_role;

-- Repair already-active recurring Courses that were activated before the
-- fallback existed. Existing Studied history immediately participates in the
-- first mapping revision generated below.
do $backfill_recurring_date_fallback_slots$
declare
  target record;
begin
  for target in
    select
      course.id as course_id,
      course.active_schedule_version_id as version_id
    from public.student_courses course
    where course.service_model = 'recurring'
      and course.active_schedule_version_id is not null
      and not exists (
        select 1
        from public.course_schedule_academic_slots slot
        where slot.version_id = course.active_schedule_version_id
      )
  loop
    perform public.generate_course_schedule_academic_slots(
      target.course_id,
      target.version_id
    );
    perform public.refresh_course_schedule_target_mapping(
      target.course_id,
      target.version_id,
      'manual_refresh',
      null
    );
  end loop;
end;
$backfill_recurring_date_fallback_slots$;
