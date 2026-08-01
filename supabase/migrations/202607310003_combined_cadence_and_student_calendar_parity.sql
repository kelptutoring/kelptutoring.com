-- Phase 5.G.2.4.7.3.1.3: assign cadence only after the Builder has combined
-- every selected Track, and make Student Calendars consume the same current
-- active-Version Classroom reader as Tutor and Mentor Calendars.
--
-- Earlier clients calculated a valid cadence inside each Track batch and then
-- combined those batches. The resulting Version retained every Session, but
-- left holes such as Monday August 17 and Monday August 24 between batches.
-- The governed publication boundary already owns the definitive cross-Track
-- order, so it is the authoritative place to assign one continuous lane.
--
-- Student Dashboard and Classroom Calendar wrappers also retained an older
-- PostgreSQL function binding after the unified Schedule reader was replaced.
-- Recompose their event arrays from the current role-aware Classroom reader so
-- all three roles observe the same active immutable Version.

begin;

create or replace function public.course_schedule_next_combined_cadence_date(
  p_cadence jsonb,
  p_previous_date date,
  p_floor_date date
)
returns date
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  candidate date;
  interval_days integer;
  weekdays integer[];
begin
  if p_floor_date is null then
    raise exception 'A combined Schedule cadence requires a date boundary.';
  end if;

  if p_cadence ->> 'type' = 'day_interval' then
    interval_days := (p_cadence ->> 'intervalDays')::integer;
    candidate := case
      when p_previous_date is null then p_floor_date
      else p_previous_date + interval_days
    end;
    while candidate < p_floor_date loop
      candidate := candidate + interval_days;
    end loop;
    return candidate;
  end if;

  select array_agg((weekday.value #>> '{}')::integer order by
    (weekday.value #>> '{}')::integer
  )
  into weekdays
  from jsonb_array_elements(p_cadence -> 'weekdays') weekday(value);

  candidate := case
    when p_previous_date is null then p_floor_date
    else p_previous_date + 1
  end;
  if candidate < p_floor_date then candidate := p_floor_date; end if;
  while not (extract(dow from candidate)::integer = any(weekdays)) loop
    candidate := candidate + 1;
  end loop;
  return candidate;
end;
$$;

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
  publication_metadata jsonb;
  normalized_cadence jsonb;
  time_zone_name text;
  course_start date;
  local_today date;
  start_boundary date;
  previous_date date;
  reserved_dates date[] := array[]::date[];
  raw_item jsonb;
  normalized_item jsonb;
  prior_item public.course_schedule_items%rowtype;
  candidate date;
  duration_days integer;
  result jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The generated Course Schedule item list is invalid.';
  end if;

  -- Old clients and complete replacements retain their already-validated
  -- behavior. The explicit handshake lets the server distinguish the final
  -- combined-plan contract from a historical per-Track draft.
  if coalesce(
      (p_builder_schedule #>> '{context,combinedCadenceAuthority}')::boolean,
      false
    ) is not true
    or p_builder_schedule #>> '{context,revisionMode}'
      is distinct from 'continuing_revision'
    or lower(coalesce(p_builder_schedule ->> 'pacingMode', 'adaptive'))
      <> 'adaptive' then
    return p_items;
  end if;

  publication_metadata :=
    public.course_schedule_builder_publication_metadata(p_builder_schedule);
  normalized_cadence := publication_metadata -> 'cadence';
  time_zone_name := publication_metadata ->> 'timeZone';

  select course.start_date
  into course_start
  from public.student_courses course
  where course.id = p_course_id
    and course.active_schedule_version_id = p_expected_version_id;
  if not found then
    raise exception
      'Combined cadence assignment requires the current active Schedule Version.';
  end if;

  local_today := (clock_timestamp() at time zone time_zone_name)::date;
  start_boundary := greatest(course_start, local_today);

  select coalesce(array_agg(item.scheduled_date), array[]::date[])
  into reserved_dates
  from public.course_schedule_items item
  where item.version_id = p_expected_version_id
    and item.item_state in ('scheduled', 'requeued')
    and (
      item.scheduled_date < local_today
      or public.course_schedule_item_has_locked_structure(
        p_course_id,
        item.id
      )
    );

  for raw_item in
    select proposed.value
    from jsonb_array_elements(p_items)
      with ordinality proposed(value, ordinality)
    order by
      case when coalesce(proposed.value ->> 'position', '') ~ '^[0-9]+$'
        then (proposed.value ->> 'position')::integer
        else proposed.ordinality::integer
      end,
      proposed.ordinality
  loop
    normalized_item := raw_item;
    select item.*
    into prior_item
    from public.course_schedule_items item
    where item.version_id = p_expected_version_id
      and item.stable_item_key = raw_item ->> 'stableItemKey';

    if coalesce(raw_item ->> 'state', 'scheduled') = 'dropped' then
      result := result || jsonb_build_array(normalized_item);
      continue;
    end if;

    if prior_item.id is not null
      and (
        prior_item.scheduled_date < local_today
        or public.course_schedule_item_has_locked_structure(
          p_course_id,
          prior_item.id
        )
      ) then
      previous_date := prior_item.scheduled_date;
      result := result || jsonb_build_array(
        (normalized_item - 'scheduledDate' - 'endDate')
        || jsonb_build_object(
          'scheduledDate', prior_item.scheduled_date,
          'endDate', prior_item.end_date
        )
      );
      continue;
    end if;

    candidate := public.course_schedule_next_combined_cadence_date(
      normalized_cadence,
      previous_date,
      start_boundary
    );
    while candidate = any(reserved_dates) loop
      candidate := public.course_schedule_next_combined_cadence_date(
        normalized_cadence,
        candidate,
        candidate + 1
      );
    end loop;
    previous_date := candidate;
    duration_days := case
      when normalized_cadence ->> 'type' = 'day_interval'
        then (normalized_cadence ->> 'intervalDays')::integer - 1
      else 0
    end;
    result := result || jsonb_build_array(
      (normalized_item - 'scheduledDate' - 'endDate')
      || jsonb_build_object(
        'scheduledDate', candidate,
        'endDate', candidate + duration_days
      )
    );
  end loop;

  return result;
end;
$$;

revoke all on function public.course_schedule_next_combined_cadence_date(
  jsonb, date, date
) from public, anon, authenticated, service_role;
revoke all on function public.reflow_course_schedule_builder_items(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;

alter function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) rename to publish_course_builder_schedule_phase5g2_4_7_3_1_3_base;

revoke all on function
  public.publish_course_builder_schedule_phase5g2_4_7_3_1_3_base(
    uuid, uuid, jsonb, jsonb, jsonb, text
  ) from public, anon, authenticated, service_role;

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
begin
  return public.publish_course_builder_schedule_phase5g2_4_7_3_1_3_base(
    p_course_id,
    p_expected_version_id,
    p_builder_schedule,
    public.reflow_course_schedule_builder_items(
      p_course_id,
      p_expected_version_id,
      p_builder_schedule,
      p_items
    ),
    p_change_reasons,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon;
grant execute on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) to authenticated;

comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes one governed immutable successor. Combined continuing drafts receive one cross-Track cadence lane after definitive ordering; elapsed and Studied structure remains fixed.';

alter function public.get_my_student_calendar(date, date)
  rename to get_my_student_calendar_phase5g2_4_7_3_1_3_base;

revoke all on function
  public.get_my_student_calendar_phase5g2_4_7_3_1_3_base(date, date)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_student_calendar(
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  context_entry jsonb;
  classroom_payload jsonb;
  classroom_id uuid;
  merged_events jsonb := '[]'::jsonb;
  canonical_events jsonb;
begin
  -- Keep the established Dashboard contract, validation, and eligible Tutor
  -- contexts, but replace its stale event set with current Classroom reads.
  payload := public.get_my_student_calendar_phase5g2_4_7_3_1_3_base(
    p_range_start,
    p_range_end
  );

  for context_entry in
    select context.value
    from jsonb_array_elements(coalesce(
      payload #> '{availabilityOverlay,eligibleContexts}',
      '[]'::jsonb
    )) context(value)
  loop
    classroom_id := nullif(context_entry ->> 'classroomId', '')::uuid;
    classroom_payload := public.get_my_classroom_calendar(
      classroom_id,
      p_range_start,
      p_range_end
    );
    if classroom_payload #>> '{contract,name}'
        is distinct from 'classroom_calendar_read'
      or classroom_payload #>> '{viewer,membershipRole}'
        is distinct from 'student' then
      raise exception
        'The Student Calendar could not load its current Classroom timeline.';
    end if;
    merged_events := merged_events
      || coalesce(classroom_payload -> 'events', '[]'::jsonb);
  end loop;

  with ranked_events as (
    select
      event.value as event_payload,
      row_number() over (
        partition by
          event.value ->> 'classroomId',
          event.value ->> 'id'
        order by event.ordinality
      ) as duplicate_rank
    from jsonb_array_elements(merged_events)
      with ordinality event(value, ordinality)
  )
  select coalesce(jsonb_agg(event_payload order by
    (event_payload ->> 'startsOn')::date,
    case event_payload ->> 'kind'
      when 'course_start' then 0
      when 'regular_class' then 1
      when 'extra_class' then 2
      when 'schedule_milestone' then 3
      when 'independent_progress' then 4
      when 'assignment_due' then 5
      when 'course_end' then 6
      else 7
    end,
    lower(event_payload ->> 'title'),
    event_payload ->> 'id'
  ), '[]'::jsonb)
  into canonical_events
  from ranked_events
  where duplicate_rank = 1;

  payload := jsonb_set(payload, '{events}', canonical_events, true);
  payload := jsonb_set(
    payload,
    '{contract,activeVersionClassroomAuthority}',
    'true'::jsonb,
    true
  );
  payload := jsonb_set(
    payload,
    '{lessonRequestFoundation}',
    public.calendar_lesson_request_draft_contract(payload, 'dashboard'),
    true
  );
  return payload;
end;
$$;

revoke all on function public.get_my_student_calendar(date, date)
  from public, anon;
grant execute on function public.get_my_student_calendar(date, date)
  to authenticated;

alter function public.get_my_student_classroom_calendar(uuid, date, date)
  rename to get_my_student_classroom_calendar_phase5g2_4_7_3_1_3_base;

revoke all on function
  public.get_my_student_classroom_calendar_phase5g2_4_7_3_1_3_base(
    uuid, date, date
  ) from public, anon, authenticated, service_role;

create or replace function public.get_my_student_classroom_calendar(
  p_classroom_id uuid,
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  role_payload jsonb;
  scoped_events jsonb;
  scoped_contexts jsonb;
begin
  if p_classroom_id is null then
    raise exception 'A Classroom is required to load its Calendar.';
  end if;

  payload := public.get_my_student_calendar(p_range_start, p_range_end);
  role_payload := public.get_my_classroom_calendar(
    p_classroom_id,
    p_range_start,
    p_range_end
  );

  if role_payload #>> '{viewer,membershipRole}' is distinct from 'student' then
    raise exception
      'An active Student Classroom Membership is required to load this Calendar.';
  end if;

  select coalesce(jsonb_agg(context.value order by context.ordinality), '[]'::jsonb)
  into scoped_contexts
  from jsonb_array_elements(coalesce(
    payload #> '{availabilityOverlay,eligibleContexts}',
    '[]'::jsonb
  )) with ordinality context(value, ordinality)
  where context.value ->> 'classroomId' = p_classroom_id::text;

  if jsonb_array_length(scoped_contexts) = 0 then
    raise exception
      'An active Student Classroom Membership is required to load this Calendar.';
  end if;

  select coalesce(jsonb_agg(event.value order by
    (event.value ->> 'startsOn')::date,
    event.value ->> 'id'
  ), '[]'::jsonb)
  into scoped_events
  from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb))
    event(value)
  where event.value ->> 'classroomId' = p_classroom_id::text;

  payload := jsonb_set(payload, '{events}', scoped_events, true);
  payload := jsonb_set(payload, '{viewer}', role_payload -> 'viewer', true);
  payload := jsonb_set(
    payload,
    '{availabilityOverlay,eligibleContexts}',
    scoped_contexts,
    true
  );
  payload := jsonb_set(
    payload,
    '{contract,scope}',
    to_jsonb('classroom'::text),
    true
  );
  payload := jsonb_set(
    payload,
    '{contract,classroomId}',
    to_jsonb(p_classroom_id),
    true
  );
  payload := jsonb_set(
    payload,
    '{calendarPolicy,classroomCourseFilter}',
    'true'::jsonb,
    true
  );
  payload := jsonb_set(
    payload,
    '{calendarPolicy,availabilityTutorScope}',
    to_jsonb('assigned_classroom_tutor'::text),
    true
  );
  payload := jsonb_set(
    payload,
    '{lessonRequestFoundation}',
    public.calendar_lesson_request_draft_contract(payload, 'classroom'),
    true
  );
  return payload;
end;
$$;

revoke all on function
  public.get_my_student_classroom_calendar(uuid, date, date)
  from public, anon;
grant execute on function
  public.get_my_student_classroom_calendar(uuid, date, date)
  to authenticated;

comment on function public.get_my_student_calendar(date, date) is
  'Student Dashboard Calendar recomposed from current active-Version role-aware Classroom timelines. It preserves global Tutor contexts and exact Student/Classroom parity.';

comment on function public.get_my_student_classroom_calendar(
  uuid, date, date
) is
  'Student Classroom Calendar filtered from the same active-Version Dashboard event set and role-aware Classroom authority.';

commit;
