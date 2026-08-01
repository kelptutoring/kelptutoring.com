-- Phase 5.G.2.4.7.2: governed Adaptive and Static Schedule pacing.
--
-- Pacing is append-only policy history associated with an immutable structural
-- Schedule Version. Adaptive removes completed curriculum targets from future
-- academic opportunities. Static retains the effective future dates captured
-- when the policy is selected. Neither mode rewrites progress history.

create table if not exists public.course_schedule_pacing_policy_events (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null
    references public.course_schedules(id) on delete restrict,
  version_id uuid not null
    references public.course_schedule_versions(id) on delete restrict,
  revision_number integer not null,
  pacing_mode text not null,
  event_kind text not null,
  source_version_id uuid
    references public.course_schedule_versions(id) on delete restrict,
  frozen_effective_dates jsonb not null default '{}'::jsonb,
  student_explanation text,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint course_schedule_pacing_policy_mode_check check (
    pacing_mode in ('adaptive', 'static')
  ),
  constraint course_schedule_pacing_policy_event_kind_check check (
    event_kind in ('legacy_default', 'inherited', 'builder_selected', 'mode_changed')
  ),
  constraint course_schedule_pacing_policy_revision_check check (
    revision_number >= 1
  ),
  constraint course_schedule_pacing_policy_frozen_dates_check check (
    jsonb_typeof(frozen_effective_dates) = 'object'
  ),
  constraint course_schedule_pacing_policy_explanation_check check (
    student_explanation is null
    or char_length(btrim(student_explanation)) between 10 and 500
  ),
  constraint course_schedule_pacing_policy_idempotency_check check (
    idempotency_key is null
    or idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_schedule_pacing_policy_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint course_schedule_pacing_policy_version_revision_key unique (
    version_id, revision_number
  ),
  constraint course_schedule_pacing_policy_version_idempotency_key unique (
    version_id, idempotency_key
  )
);

create index if not exists course_schedule_pacing_policy_schedule_idx
on public.course_schedule_pacing_policy_events (
  schedule_id, created_at desc, id
);

create table if not exists public.course_schedule_pacing_policy_commands (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null
    references public.course_schedules(id) on delete restrict,
  version_id uuid not null
    references public.course_schedule_versions(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint course_schedule_pacing_commands_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_schedule_pacing_commands_request_check check (
    jsonb_typeof(request_payload) = 'object'
  ),
  constraint course_schedule_pacing_commands_response_check check (
    jsonb_typeof(response_payload) = 'object'
  ),
  constraint course_schedule_pacing_commands_actor_key unique (
    schedule_id, actor_user_id, idempotency_key
  )
);

create or replace function public.reject_course_schedule_pacing_policy_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'Course Schedule pacing policy is append-only; record a successor policy event instead.';
end;
$$;

drop trigger if exists course_schedule_pacing_policy_events_immutable
on public.course_schedule_pacing_policy_events;
create trigger course_schedule_pacing_policy_events_immutable
before update or delete on public.course_schedule_pacing_policy_events
for each row execute function public.reject_course_schedule_pacing_policy_mutation();

drop trigger if exists course_schedule_pacing_policy_commands_immutable
on public.course_schedule_pacing_policy_commands;
create trigger course_schedule_pacing_policy_commands_immutable
before update or delete on public.course_schedule_pacing_policy_commands
for each row execute function public.reject_course_schedule_pacing_policy_mutation();

-- Every retained Version predates the choice and therefore starts Adaptive.
insert into public.course_schedule_pacing_policy_events (
  schedule_id, version_id, revision_number, pacing_mode, event_kind,
  source_version_id, frozen_effective_dates, student_explanation,
  actor_user_id, metadata
)
select
  version.schedule_id,
  version.id,
  1,
  'adaptive',
  'legacy_default',
  version.previous_version_id,
  '{}'::jsonb,
  null,
  version.created_by,
  jsonb_build_object(
    'migration', '202607300002',
    'defaultPolicy', 'adaptive'
  )
from public.course_schedule_versions version
where not exists (
  select 1
  from public.course_schedule_pacing_policy_events event
  where event.version_id = version.id
);

create or replace function public.course_schedule_pacing_policy(
  p_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select jsonb_build_object(
      'eventId', event.id,
      'scheduleId', event.schedule_id,
      'versionId', event.version_id,
      'revisionNumber', event.revision_number,
      'mode', event.pacing_mode,
      'eventKind', event.event_kind,
      'sourceVersionId', event.source_version_id,
      'frozenEffectiveDates', event.frozen_effective_dates,
      'studentExplanation', event.student_explanation,
      'actorUserId', event.actor_user_id,
      'createdAt', event.created_at,
      'lockWindowHours', 6
    )
    from public.course_schedule_pacing_policy_events event
    where event.version_id = p_version_id
    order by event.revision_number desc, event.id desc
    limit 1
  ), jsonb_build_object(
    'versionId', p_version_id,
    'revisionNumber', 0,
    'mode', 'adaptive',
    'eventKind', 'implicit_default',
    'frozenEffectiveDates', '{}'::jsonb,
    'lockWindowHours', 6
  ));
$$;

create or replace function public.inherit_course_schedule_pacing_policy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_policy jsonb;
begin
  if exists (
    select 1 from public.course_schedule_pacing_policy_events event
    where event.version_id = new.id
  ) then
    return new;
  end if;

  previous_policy := public.course_schedule_pacing_policy(
    new.previous_version_id
  );
  insert into public.course_schedule_pacing_policy_events (
    schedule_id, version_id, revision_number, pacing_mode, event_kind,
    source_version_id, frozen_effective_dates, student_explanation,
    actor_user_id, metadata
  ) values (
    new.schedule_id,
    new.id,
    1,
    coalesce(previous_policy ->> 'mode', 'adaptive'),
    'inherited',
    new.previous_version_id,
    case
      when previous_policy ->> 'mode' = 'static'
        then coalesce(previous_policy -> 'frozenEffectiveDates', '{}'::jsonb)
      else '{}'::jsonb
    end,
    null,
    new.created_by,
    jsonb_build_object(
      'phase', '5.G.2.4.7.2',
      'inheritedFromPolicyEventId', previous_policy ->> 'eventId'
    )
  );
  return new;
end;
$$;

drop trigger if exists inherit_course_schedule_pacing_policy
on public.course_schedule_versions;
create trigger inherit_course_schedule_pacing_policy
after insert on public.course_schedule_versions
for each row execute function public.inherit_course_schedule_pacing_policy();

create or replace function public.capture_course_schedule_effective_dates(
  p_course_id uuid,
  p_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with latest_revision as (
    select revision.snapshot
    from public.course_schedule_target_mapping_revisions revision
    where revision.course_id = p_course_id
      and revision.version_id = p_version_id
    order by revision.revision_number desc, revision.id desc
    limit 1
  ),
  mapped_dates as (
    select
      mapping ->> 'targetStableItemKey' as stable_item_key,
      min((mapping ->> 'localDate')::date) as effective_date
    from latest_revision,
      jsonb_array_elements(
        coalesce(latest_revision.snapshot -> 'slotMappings', '[]'::jsonb)
      ) mapping
    where mapping ->> 'mappingState' in ('targeted', 'completed')
      and nullif(mapping ->> 'targetStableItemKey', '') is not null
      and nullif(mapping ->> 'localDate', '') is not null
    group by mapping ->> 'targetStableItemKey'
  )
  select coalesce(jsonb_object_agg(
    item.stable_item_key,
    to_jsonb(coalesce(mapped.effective_date, item.scheduled_date))
    order by item.position, item.id
  ), '{}'::jsonb)
  from public.course_schedule_items item
  left join mapped_dates mapped
    on mapped.stable_item_key = item.stable_item_key
  where item.version_id = p_version_id
    and item.item_state in ('scheduled', 'requeued');
$$;

create or replace function public.course_schedule_pacing_mapping_snapshot(
  p_course_id uuid,
  p_version_id uuid,
  p_pacing_mode text,
  p_frozen_effective_dates jsonb
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
  from public.student_courses course
  where course.id = p_course_id;
  select version.* into version_record
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where version.id = p_version_id
    and schedule.course_id = p_course_id;
  if not found or course_record.active_schedule_version_id <> p_version_id then
    raise exception
      'Pacing target mapping requires the active Schedule Version.';
  end if;

  with item_states as (
    select
      item.*,
      case when item.item_kind = 'curriculum_topic'
        then public.course_schedule_item_is_currently_studied(
          course_record.id, item.id
        ) else false end as studied
    from public.course_schedule_items item
    where item.version_id = version_record.id
      and item.item_state in ('scheduled', 'requeued')
  ),
  eligible_items as (
    select
      item.*,
      row_number() over (order by item.position, item.id) - 1 as item_ordinal
    from item_states item
    where p_pacing_mode = 'static'
      or item.item_kind <> 'curriculum_topic'
      or not item.studied
  ),
  ordered_slots as (
    select
      slot.*,
      row_number() over (order by slot.position, slot.id) - 1 as slot_ordinal
    from public.course_schedule_academic_slots slot
    where slot.version_id = version_record.id
  ),
  mappings as (
    select
      slot.id as slot_id,
      slot.stable_slot_key,
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
      item.scheduled_date,
      item.studied,
      case
        when p_pacing_mode = 'static'
          and p_frozen_effective_dates ? item.stable_item_key
          then (p_frozen_effective_dates ->> item.stable_item_key)::date
        when p_pacing_mode = 'static' then item.scheduled_date
        else slot.local_date
      end as effective_date
    from ordered_slots slot
    left join eligible_items item on item.item_ordinal = slot.slot_ordinal
  ),
  counts as (
    select
      (select count(*) from ordered_slots) as slot_count,
      (select count(*) from eligible_items) as item_count
  ),
  unstudied_topics as (
    select item.*,
      row_number() over (order by item.position, item.id) - 1 as recommendation_position
    from item_states item
    where item.item_kind = 'curriculum_topic' and not item.studied
  )
  select jsonb_build_object(
    'schemaVersion', 3,
    'courseId', course_record.id,
    'versionId', version_record.id,
    'serviceModel', course_record.service_model,
    'timeZone', version_record.time_zone,
    'pacingMode', p_pacing_mode,
    'slotMappings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slotId', mapping.slot_id,
        'stableSlotKey', mapping.stable_slot_key,
        'localDate', mapping.effective_date,
        'localStartTime', case when mapping.local_start_time is null then null
          else to_char(mapping.local_start_time, 'HH24:MI') end,
        'durationMinutes', mapping.duration_minutes,
        'timeZone', mapping.time_zone,
        'slotPosition', mapping.slot_position,
        'mappingState', case
          when mapping.target_item_id is null then 'open'
          when mapping.studied then 'completed'
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
      from eligible_items item cross join counts
      where item.item_ordinal >= counts.slot_count
    ), '[]'::jsonb),
    'capacity', (
      select jsonb_build_object(
        'status', case
          when p_pacing_mode = 'static' then 'static_academic_plan'
          when counts.item_count > counts.slot_count then 'awaiting_future_slots'
          when counts.item_count < counts.slot_count then 'open_slots'
          else 'mapped'
        end,
        'slotCount', counts.slot_count,
        'remainingTargetCount', (
          select count(*) from unstudied_topics
        ),
        'mappedTargetCount', least(counts.slot_count, counts.item_count),
        'awaitingFutureSlotCount', greatest(
          counts.item_count - counts.slot_count, 0
        ),
        'openSlotCount', greatest(counts.slot_count - counts.item_count, 0),
        'requiresPurchase', false,
        'requiresAutomaticClassBooking', false
      ) from counts
    ),
    'bookingTargetSelection', jsonb_build_object(
      'enabled', course_record.service_model = 'on_demand',
      'selectionMode', case when course_record.service_model = 'on_demand'
        then 'student_selects_unstudied_topic' else 'not_available' end,
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
  return payload;
end;
$$;

alter function public.course_schedule_target_mapping_snapshot(uuid, uuid)
rename to course_schedule_target_mapping_snapshot_phase5g2_4_7_2_base;

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
  payload jsonb;
begin
  select * into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception 'The Course could not be found for paced target mapping.';
  end if;

  if policy ->> 'mode' = 'adaptive'
    and course_record.service_model = 'recurring' then
    payload :=
      public.course_schedule_target_mapping_snapshot_phase5g2_4_7_2_base(
        p_course_id, p_version_id
      );
    return jsonb_set(
      payload,
      '{pacingMode}',
      to_jsonb('adaptive'::text),
      true
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

-- Materialize a due recurring target before the Studied event can reflow it.
-- Date-only on-demand/access-only opportunities are deliberately excluded.
create or replace function public.refresh_course_schedule_target_mapping_after_progress()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_version_id uuid;
  policy jsonb;
  due_slot record;
  as_of timestamptz := clock_timestamp();
begin
  if new.progress_kind <> 'studied'
    or new.event_action not in ('marked', 'reversed') then
    return new;
  end if;

  select course.active_schedule_version_id into active_version_id
  from public.student_courses course
  where course.id = new.course_id;
  if active_version_id is null then return new; end if;

  policy := public.course_schedule_pacing_policy(active_version_id);
  if new.event_action = 'marked' and policy ->> 'mode' = 'adaptive' then
    for due_slot in
      select slot.id
      from public.course_schedule_academic_slots slot
      where slot.course_id = new.course_id
        and slot.version_id = active_version_id
        and slot.source_kind = 'recurring_pattern'
        and public.course_schedule_slot_starts_at(slot) >= as_of
        and public.course_schedule_slot_starts_at(slot) - interval '6 hours'
          <= as_of
        and not exists (
          select 1 from public.course_schedule_target_locks target_lock
          where target_lock.academic_slot_id = slot.id
        )
      order by public.course_schedule_slot_starts_at(slot), slot.id
    loop
      begin
        perform public.lock_course_schedule_slot_target(
          due_slot.id, as_of, 'scheduled_six_hour'
        );
      exception when others then
        if sqlerrm <> 'This academic occurrence has no mapped target to lock.' then
          raise;
        end if;
      end;
    end loop;
  end if;

  perform public.refresh_course_schedule_target_mapping(
    new.course_id,
    active_version_id,
    'progress_reflow',
    new.id
  );
  return new;
end;
$$;

create or replace function public.set_course_schedule_pacing_mode(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_pacing_mode text,
  p_student_explanation text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_mode text := lower(btrim(coalesce(p_pacing_mode, '')));
  normalized_explanation text := btrim(coalesce(p_student_explanation, ''));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  course_record public.student_courses%rowtype;
  stable_schedule public.course_schedules%rowtype;
  prior_command public.course_schedule_pacing_policy_commands%rowtype;
  current_policy jsonb;
  frozen_dates jsonb := '{}'::jsonb;
  request_payload jsonb;
  response_payload jsonb;
  next_revision integer;
  created_event_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to change Schedule pacing.';
  end if;
  if normalized_mode not in ('adaptive', 'static') then
    raise exception 'Choose Adaptive or Static Schedule pacing.';
  end if;
  if char_length(normalized_explanation) not between 10 and 500 then
    raise exception
      'Explain this Schedule pacing change in 10 to 500 characters.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Schedule pacing idempotency key is invalid.';
  end if;
  if not public.current_user_can_edit_course_schedule(p_course_id) then
    raise exception
      'Only the assigned Tutor or supervising Mentor can change Schedule pacing.';
  end if;

  select * into course_record
  from public.student_courses course
  where course.id = p_course_id
  for update;
  if not found then raise exception 'The Course could not be found.'; end if;
  if course_record.active_schedule_version_id <> p_expected_version_id then
    raise exception
      'The Schedule changed after this page loaded. Refresh it before changing pacing.';
  end if;
  select * into stable_schedule
  from public.course_schedules schedule
  where schedule.course_id = p_course_id
  for update;

  request_payload := jsonb_build_object(
    'courseId', p_course_id,
    'expectedVersionId', p_expected_version_id,
    'pacingMode', normalized_mode,
    'studentExplanation', normalized_explanation
  );
  select * into prior_command
  from public.course_schedule_pacing_policy_commands command
  where command.schedule_id = stable_schedule.id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_key;
  if found then
    if prior_command.request_payload <> request_payload then
      raise exception
        'This Schedule pacing idempotency key is already bound to another request.';
    end if;
    return prior_command.response_payload
      || jsonb_build_object('idempotentReplay', true);
  end if;

  current_policy :=
    public.course_schedule_pacing_policy(p_expected_version_id);
  if current_policy ->> 'mode' = normalized_mode then
    response_payload := jsonb_build_object(
      'courseId', p_course_id,
      'scheduleId', stable_schedule.id,
      'activeScheduleVersionId', p_expected_version_id,
      'pacingPolicy', current_policy,
      'status', 'unchanged',
      'idempotentReplay', false
    );
  else
    if normalized_mode = 'static' then
      frozen_dates := public.capture_course_schedule_effective_dates(
        p_course_id, p_expected_version_id
      );
    end if;
    select coalesce(max(event.revision_number), 0) + 1
    into next_revision
    from public.course_schedule_pacing_policy_events event
    where event.version_id = p_expected_version_id;

    insert into public.course_schedule_pacing_policy_events (
      schedule_id, version_id, revision_number, pacing_mode, event_kind,
      source_version_id, frozen_effective_dates, student_explanation,
      actor_user_id, idempotency_key, metadata
    ) values (
      stable_schedule.id,
      p_expected_version_id,
      next_revision,
      normalized_mode,
      'mode_changed',
      p_expected_version_id,
      frozen_dates,
      normalized_explanation,
      caller_id,
      normalized_key,
      jsonb_build_object(
        'phase', '5.G.2.4.7.2',
        'previousMode', current_policy ->> 'mode'
      )
    ) returning id into created_event_id;

    perform public.refresh_course_schedule_target_mapping(
      p_course_id,
      p_expected_version_id,
      'manual_refresh',
      null
    );
    response_payload := jsonb_build_object(
      'courseId', p_course_id,
      'scheduleId', stable_schedule.id,
      'activeScheduleVersionId', p_expected_version_id,
      'pacingPolicyEventId', created_event_id,
      'pacingPolicy',
        public.course_schedule_pacing_policy(p_expected_version_id),
      'status', 'changed',
      'idempotentReplay', false
    );
  end if;

  insert into public.course_schedule_pacing_policy_commands (
    schedule_id, version_id, actor_user_id, idempotency_key,
    request_payload, response_payload
  ) values (
    stable_schedule.id,
    p_expected_version_id,
    caller_id,
    normalized_key,
    request_payload,
    response_payload
  );
  return response_payload;
end;
$$;

alter function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) rename to publish_course_builder_schedule_phase5g2_4_7_2_base;

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
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  requested_mode text;
  current_policy jsonb;
  frozen_dates jsonb := '{}'::jsonb;
  response_payload jsonb;
  published_version_id uuid;
  published_policy jsonb;
  next_revision integer;
  stable_schedule_id uuid;
  explanation text;
begin
  current_policy :=
    public.course_schedule_pacing_policy(p_expected_version_id);
  requested_mode := lower(btrim(coalesce(
    p_builder_schedule ->> 'pacingMode',
    current_policy ->> 'mode',
    'adaptive'
  )));
  if requested_mode not in ('adaptive', 'static') then
    raise exception 'Choose Adaptive or Static Schedule pacing.';
  end if;
  if requested_mode = 'static'
    and current_policy ->> 'mode' <> 'static' then
    frozen_dates := public.capture_course_schedule_effective_dates(
      p_course_id, p_expected_version_id
    );
  end if;

  response_payload :=
    public.publish_course_builder_schedule_phase5g2_4_7_2_base(
      p_course_id,
      p_expected_version_id,
      p_builder_schedule,
      p_items,
      p_change_reasons,
      p_idempotency_key
    );
  published_version_id :=
    nullif(response_payload ->> 'publishedVersionId', '')::uuid;
  if published_version_id is null then
    raise exception 'The governed Builder did not return a published Version.';
  end if;
  select version.schedule_id into stable_schedule_id
  from public.course_schedule_versions version
  where version.id = published_version_id;

  published_policy :=
    public.course_schedule_pacing_policy(published_version_id);
  if published_policy ->> 'mode' <> requested_mode then
    explanation := coalesce((
      select reason ->> 'studentExplanation'
      from jsonb_array_elements(coalesce(p_change_reasons, '[]'::jsonb)) reason
      where char_length(btrim(coalesce(
        reason ->> 'studentExplanation', ''
      ))) between 10 and 500
      limit 1
    ), case when requested_mode = 'static'
      then 'Future Schedule dates were frozen at their current effective dates.'
      else 'The Schedule now advances with completed curriculum progress.'
    end);
    select coalesce(max(event.revision_number), 0) + 1
    into next_revision
    from public.course_schedule_pacing_policy_events event
    where event.version_id = published_version_id;
    insert into public.course_schedule_pacing_policy_events (
      schedule_id, version_id, revision_number, pacing_mode, event_kind,
      source_version_id, frozen_effective_dates, student_explanation,
      actor_user_id, idempotency_key, metadata
    ) values (
      stable_schedule_id,
      published_version_id,
      next_revision,
      requested_mode,
      'builder_selected',
      p_expected_version_id,
      case when requested_mode = 'static'
        then frozen_dates else '{}'::jsonb end,
      explanation,
      caller_id,
      normalized_key,
      jsonb_build_object(
        'phase', '5.G.2.4.7.2',
        'previousMode', current_policy ->> 'mode'
      )
    );
    perform public.refresh_course_schedule_target_mapping(
      p_course_id,
      published_version_id,
      'manual_refresh',
      null
    );
    published_policy :=
      public.course_schedule_pacing_policy(published_version_id);
  end if;

  return response_payload || jsonb_build_object(
    'pacingPolicy', published_policy
  );
end;
$$;

alter function public.get_my_course_schedule_builder_context(uuid)
rename to get_my_course_schedule_builder_context_phase5g2_4_7_2_base;

create or replace function public.get_my_course_schedule_builder_context(
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  active_version_id uuid;
begin
  payload :=
    public.get_my_course_schedule_builder_context_phase5g2_4_7_2_base(
      p_course_id
    );
  active_version_id :=
    nullif(payload #>> '{schedule,activeVersionId}', '')::uuid;
  payload := jsonb_set(
    payload,
    '{schedule,pacingPolicy}',
    public.course_schedule_pacing_policy(active_version_id),
    true
  );
  payload := jsonb_set(
    payload,
    '{permissions,canChangePacingMode}',
    'true'::jsonb,
    true
  );
  return payload;
end;
$$;

alter function public.get_my_effective_course_schedule(uuid)
rename to get_my_effective_course_schedule_phase5g2_4_7_2_base;

create or replace function public.get_my_effective_course_schedule(
  p_course_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  active_version_id uuid;
  policy jsonb;
  mapping_snapshot jsonb := '{}'::jsonb;
  projected_items jsonb;
begin
  payload :=
    public.get_my_effective_course_schedule_phase5g2_4_7_2_base(
      p_course_id
    );
  active_version_id :=
    nullif(payload ->> 'activeScheduleVersionId', '')::uuid;
  policy := public.course_schedule_pacing_policy(active_version_id);
  select revision.snapshot into mapping_snapshot
  from public.course_schedule_target_mapping_revisions revision
  where revision.version_id = active_version_id
  order by revision.revision_number desc, revision.id desc
  limit 1;
  mapping_snapshot := coalesce(mapping_snapshot, '{}'::jsonb);

  select coalesce(jsonb_agg(
    case
      when item.item_payload ->> 'sequenceState' = 'studied'
        then item.item_payload
      when mapped.effective_date is null
        then item.item_payload
      else jsonb_set(
        item.item_payload,
        '{effectiveDate}',
        to_jsonb(mapped.effective_date),
        true
      )
    end
    order by item.ordinality
  ), '[]'::jsonb)
  into projected_items
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality item(item_payload, ordinality)
  left join lateral (
    select (mapping.value ->> 'localDate')::date as effective_date
    from jsonb_array_elements(
      coalesce(mapping_snapshot -> 'slotMappings', '[]'::jsonb)
    ) mapping(value)
    where mapping.value ->> 'targetScheduleItemId'
      = item.item_payload ->> 'scheduleItemId'
      and mapping.value ->> 'mappingState' in ('targeted', 'completed')
    order by (mapping.value ->> 'slotPosition')::integer
    limit 1
  ) mapped on true;

  payload := jsonb_set(payload, '{items}', projected_items, true);
  payload := jsonb_set(payload, '{pacingPolicy}', policy, true);
  payload := jsonb_set(
    payload,
    '{featureStatus,courseSchedulePacingPolicy}',
    to_jsonb('active_phase_5g2_4_7_2'::text),
    true
  );
  return payload;
exception when invalid_text_representation then
  raise exception 'The effective Schedule pacing projection is invalid.';
end;
$$;

alter table public.course_schedule_pacing_policy_events enable row level security;
alter table public.course_schedule_pacing_policy_commands enable row level security;

drop policy if exists "Authorized actors read Schedule pacing history"
on public.course_schedule_pacing_policy_events;
create policy "Authorized actors read Schedule pacing history"
on public.course_schedule_pacing_policy_events
for select to authenticated
using (exists (
  select 1
  from public.course_schedules schedule
  where schedule.id = course_schedule_pacing_policy_events.schedule_id
    and public.current_user_can_read_course_schedule_history(schedule.course_id)
));

drop policy if exists "Authorized staff read Schedule pacing commands"
on public.course_schedule_pacing_policy_commands;
create policy "Authorized staff read Schedule pacing commands"
on public.course_schedule_pacing_policy_commands
for select to authenticated
using (exists (
  select 1
  from public.course_schedules schedule
  where schedule.id = course_schedule_pacing_policy_commands.schedule_id
    and public.current_user_can_edit_course_schedule(schedule.course_id)
));

revoke all on public.course_schedule_pacing_policy_events
from public, anon, authenticated;
revoke all on public.course_schedule_pacing_policy_commands
from public, anon, authenticated;
grant select on public.course_schedule_pacing_policy_events
to authenticated, service_role;
grant select on public.course_schedule_pacing_policy_commands
to authenticated, service_role;

revoke all on function public.reject_course_schedule_pacing_policy_mutation()
from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_pacing_policy(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.inherit_course_schedule_pacing_policy()
from public, anon, authenticated, service_role;
revoke all on function public.capture_course_schedule_effective_dates(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_pacing_mapping_snapshot(
  uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function
  public.course_schedule_target_mapping_snapshot_phase5g2_4_7_2_base(
    uuid, uuid
  ) from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_target_mapping_snapshot(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function
  public.publish_course_builder_schedule_phase5g2_4_7_2_base(
    uuid, uuid, jsonb, jsonb, jsonb, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.get_my_course_schedule_builder_context_phase5g2_4_7_2_base(uuid)
from public, anon, authenticated, service_role;
revoke all on function
  public.get_my_effective_course_schedule_phase5g2_4_7_2_base(uuid)
from public, anon, authenticated, service_role;

revoke all on function public.set_course_schedule_pacing_mode(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.set_course_schedule_pacing_mode(
  uuid, uuid, text, text, text
) to authenticated;
revoke all on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) to authenticated;
revoke all on function public.get_my_course_schedule_builder_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_course_schedule_builder_context(uuid)
to authenticated;
revoke all on function public.get_my_effective_course_schedule(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_effective_course_schedule(uuid)
to authenticated, service_role;

comment on table public.course_schedule_pacing_policy_events is
  'Append-only Adaptive/Static pacing policy history. Static events retain the effective future dates visible when the mode was selected.';
comment on function public.set_course_schedule_pacing_mode(
  uuid, uuid, text, text, text
) is
  'Changes pacing without rewriting the structural Schedule Version. Static freezes current effective future dates; Adaptive resumes progress-driven reflow.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Effective Schedule enriched with the governed pacing policy and mapping-derived dates while preserving Studied timestamps and immutable planned dates.';
