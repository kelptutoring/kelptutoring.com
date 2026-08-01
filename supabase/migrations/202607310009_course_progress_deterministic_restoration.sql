-- Phase 5.G.2.4.7.3, step 2: restore a reversed Studied Session to its
-- semantic predecessor position and let the active cadence provide its date.
--
-- The immutable mark-time provenance created in step 1 is the source of
-- ordering truth.  A reversal never reuses its former calendar date.  It
-- removes the restored Session from the current unfinished lane, finds the
-- nearest predecessor that is still present, inserts immediately after it (or
-- first when none remain), and then assigns the resulting lane to the current
-- Version's unlocked academic slots.

create or replace function public.course_schedule_active_plan_epoch(
  p_version_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  stable_schedule_id uuid;
  coverage_metadata jsonb := '{}'::jsonb;
  stable_plan_epoch_id uuid;
begin
  select version.schedule_id into stable_schedule_id
  from public.course_schedule_versions version
  where version.id = p_version_id;

  if stable_schedule_id is null then
    raise exception 'The Schedule Version could not be found for restoration ordering.';
  end if;

  select coalesce(coverage.metadata, '{}'::jsonb)
  into coverage_metadata
  from public.course_schedule_version_coverages coverage
  where coverage.version_id = p_version_id;

  begin
    stable_plan_epoch_id :=
      nullif(coverage_metadata ->> 'planEpochId', '')::uuid;
  exception when invalid_text_representation then
    stable_plan_epoch_id := null;
  end;

  return coalesce(stable_plan_epoch_id, stable_schedule_id);
end;
$$;

create or replace function public.course_schedule_adaptive_item_order(
  p_course_id uuid,
  p_version_id uuid
)
returns table (
  schedule_item_id uuid,
  stable_item_key text,
  restoration_ordinal integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  active_version_id uuid;
  active_epoch_id uuid;
  ordered_keys text[] := array[]::text[];
  restored record;
  predecessor_key text;
  predecessor_ordinal integer;
  anchor_index integer;
begin
  select course.active_schedule_version_id into active_version_id
  from public.student_courses course
  where course.id = p_course_id;

  if active_version_id is null or active_version_id <> p_version_id then
    raise exception 'Restoration ordering requires the active Schedule Version.';
  end if;

  active_epoch_id := public.course_schedule_active_plan_epoch(p_version_id);

  -- Start with the ordinary unfinished lane, excluding Sessions whose latest
  -- Studied transition is a reversal in this same plan epoch.  Those Sessions
  -- are reinserted below from their immutable predecessor provenance.
  with latest_studied_transition as (
    select distinct on (event.stable_item_key)
      event.stable_item_key,
      event.event_action,
      event.related_event_id
    from public.course_progress_events event
    where event.course_id = p_course_id
      and event.target_kind = 'session'
      and event.progress_kind = 'studied'
      and event.event_action in ('marked', 'reversed')
    order by event.stable_item_key, event.recorded_at desc, event.id desc
  ),
  restored_keys as (
    select transition.stable_item_key
    from latest_studied_transition transition
    join public.course_progress_restoration_provenance provenance
      on provenance.progress_event_id = transition.related_event_id
    where transition.event_action = 'reversed'
      and provenance.plan_epoch_id = active_epoch_id
  )
  select coalesce(
    array_agg(item.stable_item_key order by item.position, item.id),
    array[]::text[]
  )
  into ordered_keys
  from public.course_schedule_items item
  where item.version_id = p_version_id
    and item.item_state in ('scheduled', 'requeued')
    and (
      item.item_kind <> 'curriculum_topic'
      or not public.course_schedule_item_is_currently_studied(
        p_course_id,
        item.id
      )
    )
    and not exists (
      select 1
      from restored_keys restored_key
      where restored_key.stable_item_key = item.stable_item_key
    );

  -- Earlier original Sessions are restored first.  That makes a later
  -- restored Session able to anchor behind an earlier restored predecessor.
  for restored in
    with latest_studied_transition as (
      select distinct on (event.stable_item_key)
        event.id,
        event.stable_item_key,
        event.event_action,
        event.related_event_id,
        event.recorded_at
      from public.course_progress_events event
      where event.course_id = p_course_id
        and event.target_kind = 'session'
        and event.progress_kind = 'studied'
        and event.event_action in ('marked', 'reversed')
      order by event.stable_item_key, event.recorded_at desc, event.id desc
    )
    select
      transition.stable_item_key,
      provenance.predecessor_stable_item_keys,
      marked_item.position as marked_position,
      transition.recorded_at,
      transition.id
    from latest_studied_transition transition
    join public.course_progress_restoration_provenance provenance
      on provenance.progress_event_id = transition.related_event_id
    join public.course_schedule_items marked_item
      on marked_item.id = (
        select mark.schedule_item_id
        from public.course_progress_events mark
        where mark.id = provenance.progress_event_id
      )
    join public.course_schedule_items active_item
      on active_item.version_id = p_version_id
     and active_item.stable_item_key = transition.stable_item_key
     and active_item.item_state in ('scheduled', 'requeued')
    where transition.event_action = 'reversed'
      and provenance.plan_epoch_id = active_epoch_id
      and not public.course_schedule_item_is_currently_studied(
        p_course_id,
        active_item.id
      )
    order by marked_item.position, transition.recorded_at, transition.id
  loop
    anchor_index := null;

    for predecessor_key, predecessor_ordinal in
      select predecessor.value, predecessor.ordinality::integer
      from jsonb_array_elements_text(
        restored.predecessor_stable_item_keys
      ) with ordinality predecessor(value, ordinality)
      order by predecessor.ordinality
    loop
      anchor_index := array_position(ordered_keys, predecessor_key);
      exit when anchor_index is not null;
    end loop;

    if anchor_index is null then
      ordered_keys := array[restored.stable_item_key] || ordered_keys;
    elsif anchor_index >= coalesce(array_length(ordered_keys, 1), 0) then
      ordered_keys := ordered_keys || restored.stable_item_key;
    else
      ordered_keys :=
        ordered_keys[1:anchor_index]
        || restored.stable_item_key
        || ordered_keys[(anchor_index + 1):array_length(ordered_keys, 1)];
    end if;
  end loop;

  return query
  select
    item.id,
    item.stable_item_key,
    ordered.ordinality::integer - 1
  from unnest(ordered_keys) with ordinality ordered(stable_item_key, ordinality)
  join public.course_schedule_items item
    on item.version_id = p_version_id
   and item.stable_item_key = ordered.stable_item_key
  order by ordered.ordinality;
end;
$$;

create or replace function public.course_schedule_apply_restoration_order(
  p_course_id uuid,
  p_version_id uuid,
  p_snapshot jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with slot_entries as (
    select
      slot.value,
      slot.ordinality::integer as source_ordinal,
      coalesce((slot.value ->> 'targetLocked')::boolean, false) as locked
    from jsonb_array_elements(
      coalesce(p_snapshot -> 'slotMappings', '[]'::jsonb)
    ) with ordinality slot(value, ordinality)
  ),
  pool_candidates as (
    select
      slot.value ->> 'targetStableItemKey' as stable_item_key,
      min(slot.source_ordinal) as source_ordinal
    from slot_entries slot
    where not slot.locked
      and nullif(slot.value ->> 'targetStableItemKey', '') is not null
    group by slot.value ->> 'targetStableItemKey'

    union all

    select
      awaiting.value ->> 'stableItemKey' as stable_item_key,
      1000000 + awaiting.ordinality::integer as source_ordinal
    from jsonb_array_elements(
      coalesce(p_snapshot -> 'awaitingFutureSlot', '[]'::jsonb)
    ) with ordinality awaiting(value, ordinality)
    where nullif(awaiting.value ->> 'stableItemKey', '') is not null
  ),
  pool as (
    select candidate.stable_item_key, min(candidate.source_ordinal) as source_ordinal
    from pool_candidates candidate
    group by candidate.stable_item_key
  ),
  desired as (
    select ordering.stable_item_key, ordering.restoration_ordinal
    from public.course_schedule_adaptive_item_order(
      p_course_id,
      p_version_id
    ) ordering
    join pool on pool.stable_item_key = ordering.stable_item_key
  ),
  ordered_pool as (
    select
      pool.stable_item_key,
      row_number() over (
        order by
          coalesce(desired.restoration_ordinal, 2147483647),
          pool.source_ordinal,
          pool.stable_item_key
      )::integer - 1 as target_ordinal
    from pool
    left join desired on desired.stable_item_key = pool.stable_item_key
  ),
  unlocked_slots as (
    select
      slot.source_ordinal,
      row_number() over (order by slot.source_ordinal)::integer - 1
        as unlocked_ordinal
    from slot_entries slot
    where not slot.locked
  ),
  rebuilt_slot_entries as (
    select
      slot.source_ordinal,
      case
        when slot.locked then slot.value
        else
          (
            slot.value - array[
              'mappingState', 'targetScheduleItemId', 'targetStableItemKey',
              'targetTitle', 'targetKind', 'targetPlannedDate',
              'targetPosition', 'difficultyLevel', 'targetLocked', 'outcome'
            ]
          ) || case
            when target_item.id is null then jsonb_build_object(
              'mappingState', 'open',
              'targetScheduleItemId', null,
              'targetStableItemKey', null,
              'targetTitle', null,
              'targetKind', null,
              'targetPlannedDate', null,
              'targetPosition', null,
              'difficultyLevel', null,
              'targetLocked', false,
              'outcome', null
            )
            else jsonb_build_object(
              'mappingState', 'targeted',
              'targetScheduleItemId', target_item.id,
              'targetStableItemKey', target_item.stable_item_key,
              'targetTitle', target_item.title,
              'targetKind', target_item.item_kind,
              'targetPlannedDate', target_item.scheduled_date,
              'targetPosition', target_item.position,
              'difficultyLevel', target_item.difficulty_level,
              'targetLocked', false,
              'outcome', null
            )
          end
      end as value
    from slot_entries slot
    left join unlocked_slots unlocked
      on unlocked.source_ordinal = slot.source_ordinal
    left join ordered_pool target
      on target.target_ordinal = unlocked.unlocked_ordinal
    left join public.course_schedule_items target_item
      on target_item.version_id = p_version_id
     and target_item.stable_item_key = target.stable_item_key
  ),
  counts as (
    select
      (select count(*) from slot_entries)::integer as slot_count,
      (select count(*) from unlocked_slots)::integer as unlocked_count,
      (select count(*) from ordered_pool)::integer as target_count
  ),
  rebuilt_slots as (
    select coalesce(
      jsonb_agg(slot.value order by slot.source_ordinal),
      '[]'::jsonb
    ) as value
    from rebuilt_slot_entries slot
  ),
  rebuilt_awaiting as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'scheduleItemId', item.id,
      'stableItemKey', item.stable_item_key,
      'title', item.title,
      'kind', item.item_kind,
      'plannedDate', item.scheduled_date,
      'position', item.position,
      'difficultyLevel', item.difficulty_level,
      'status', 'awaiting_future_slot'
    ) order by target.target_ordinal), '[]'::jsonb) as value
    from ordered_pool target
    cross join counts
    join public.course_schedule_items item
      on item.version_id = p_version_id
     and item.stable_item_key = target.stable_item_key
    where target.target_ordinal >= counts.unlocked_count
  ),
  selectable_topics as (
    select
      target.target_ordinal,
      item.*,
      row_number() over (order by target.target_ordinal)::integer - 1
        as topic_ordinal
    from ordered_pool target
    join public.course_schedule_items item
      on item.version_id = p_version_id
     and item.stable_item_key = target.stable_item_key
    where item.item_kind = 'curriculum_topic'
  ),
  rebuilt_booking as (
    select case
      when coalesce((p_snapshot #>> '{bookingTargetSelection,enabled}')::boolean, false)
      then jsonb_build_object(
        'enabled', true,
        'selectionMode', coalesce(
          p_snapshot #>> '{bookingTargetSelection,selectionMode}',
          'student_selects_unstudied_topic'
        ),
        'recommendedTarget', (
          select jsonb_build_object(
            'scheduleItemId', topic.id,
            'stableItemKey', topic.stable_item_key,
            'title', topic.title,
            'plannedDate', topic.scheduled_date,
            'position', topic.position,
            'difficultyLevel', topic.difficulty_level
          )
          from selectable_topics topic
          where topic.topic_ordinal = 0
        ),
        'selectableTargets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'scheduleItemId', topic.id,
            'stableItemKey', topic.stable_item_key,
            'title', topic.title,
            'plannedDate', topic.scheduled_date,
            'position', topic.position,
            'difficultyLevel', topic.difficulty_level,
            'recommended', topic.topic_ordinal = 0
          ) order by topic.topic_ordinal)
          from selectable_topics topic
        ), '[]'::jsonb)
      )
      else coalesce(
        p_snapshot -> 'bookingTargetSelection',
        jsonb_build_object(
          'enabled', false,
          'selectionMode', 'automatic_next_unstudied',
          'recommendedTarget', null,
          'selectableTargets', '[]'::jsonb
        )
      )
    end as value
  ),
  rebuilt_capacity as (
    select
      coalesce(p_snapshot -> 'capacity', '{}'::jsonb)
      || jsonb_build_object(
        'status', case
          when counts.target_count > counts.unlocked_count
            then 'awaiting_future_slots'
          when counts.target_count < counts.unlocked_count
            then 'open_slots'
          else 'mapped'
        end,
        'slotCount', counts.slot_count,
        'unlockedSlotCount', counts.unlocked_count,
        'remainingTargetCount', counts.target_count,
        'mappedTargetCount', least(counts.unlocked_count, counts.target_count),
        'awaitingFutureSlotCount', greatest(
          counts.target_count - counts.unlocked_count,
          0
        ),
        'openSlotCount', greatest(
          counts.unlocked_count - counts.target_count,
          0
        )
      ) as value
    from counts
  )
  select
    p_snapshot || jsonb_build_object(
      'restorationOrdering', jsonb_build_object(
        'mode', 'predecessor_provenance_current_cadence',
        'applied', true
      ),
      'slotMappings', rebuilt_slots.value,
      'awaitingFutureSlot', rebuilt_awaiting.value,
      'capacity', rebuilt_capacity.value,
      'bookingTargetSelection', rebuilt_booking.value
    )
  from rebuilt_slots, rebuilt_awaiting, rebuilt_capacity, rebuilt_booking;
$$;

alter function public.course_schedule_target_mapping_snapshot(uuid, uuid)
rename to course_schedule_target_mapping_snapshot_phase5g2_4_7_3_2_base;

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
  policy jsonb := public.course_schedule_pacing_policy(p_version_id);
  payload jsonb;
begin
  payload :=
    public.course_schedule_target_mapping_snapshot_phase5g2_4_7_3_2_base(
      p_course_id,
      p_version_id
    );

  if policy ->> 'mode' <> 'adaptive' then
    return payload;
  end if;

  return public.course_schedule_apply_restoration_order(
    p_course_id,
    p_version_id,
    payload
  );
end;
$$;

-- The reversal and its provenance are already present before the existing
-- alphabetically-later refresh trigger calls the wrapper above.
revoke all on function public.course_schedule_active_plan_epoch(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_adaptive_item_order(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_apply_restoration_order(
  uuid, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function
  public.course_schedule_target_mapping_snapshot_phase5g2_4_7_3_2_base(
    uuid, uuid
  ) from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_target_mapping_snapshot(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.course_schedule_adaptive_item_order(uuid, uuid) is
  'Builds the active unfinished lane and restores reversed Studied Sessions after the nearest predecessor that remains, or first when none remain.';
comment on function public.course_schedule_apply_restoration_order(
  uuid, uuid, jsonb
) is
  'Reassigns only unlocked adaptive targets to their provenance order while preserving current-Version slots, dates, cadence, and occurrence locks.';
comment on function public.course_schedule_target_mapping_snapshot(uuid, uuid) is
  'Builds the current target mapping and applies deterministic reversal restoration only to Adaptive Schedules.';
