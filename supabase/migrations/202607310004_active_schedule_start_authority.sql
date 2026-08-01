-- Phase 5.G.2.4.7.3.2: one active-plan start and cadence authority.
--
-- The Schedule Builder already calculates one deterministic, combined cadence
-- lane after every selected Track has been assembled. A later publication
-- wrapper was recalculating that lane from student_courses.start_date, which is
-- the historical Course start. Complete replacements could therefore be built
-- correctly from (for example) August 12, then reopen and publish from the old
-- August 6 boundary. The same historical field also produced a stale CB event.
--
-- Keep the historical Course start immutable, but recover the current plan's
-- start from its immutable Builder publication. Older Versions fall back to
-- their first active item. Publication now validates and persists the exact
-- dates calculated by the frontend instead of running a second date engine.

begin;

create or replace function public.course_schedule_active_plan_start(
  p_course_id uuid
)
returns date
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  active_version_id uuid;
  historical_course_start date;
  published_start_text text;
  item_start date;
begin
  select course.active_schedule_version_id, course.start_date
  into active_version_id, historical_course_start
  from public.student_courses course
  where course.id = p_course_id;

  if not found then
    raise exception 'The Course could not be found.';
  end if;

  select nullif(
    btrim(command.request_payload #>> '{builderSchedule,startDate}'),
    ''
  )
  into published_start_text
  from public.course_schedule_builder_publish_commands command
  where command.published_version_id = active_version_id
  order by command.created_at desc, command.id desc
  limit 1;

  if published_start_text is not null then
    begin
      return published_start_text::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception
          'The active Schedule Version contains an invalid published start date.';
    end;
  end if;

  select min(item.scheduled_date)
  into item_start
  from public.course_schedule_items item
  where item.version_id = active_version_id
    and item.item_state in ('scheduled', 'requeued');

  return coalesce(item_start, historical_course_start);
end;
$$;

revoke all on function public.course_schedule_active_plan_start(uuid)
from public, anon, authenticated, service_role;

alter function public.get_my_course_schedule_builder_context(uuid)
rename to get_my_course_schedule_builder_context_phase5g2_4_7_3_2_base;

revoke all on function
  public.get_my_course_schedule_builder_context_phase5g2_4_7_3_2_base(uuid)
from public, anon, authenticated, service_role;

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
  active_start date;
begin
  payload :=
    public.get_my_course_schedule_builder_context_phase5g2_4_7_3_2_base(
      p_course_id
    );
  active_start := public.course_schedule_active_plan_start(p_course_id);
  return jsonb_set(
    payload,
    '{schedule,activeStartDate}',
    to_jsonb(active_start),
    true
  );
end;
$$;

revoke all on function public.get_my_course_schedule_builder_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_course_schedule_builder_context(uuid)
to authenticated;

alter function public.get_my_classroom_calendar(uuid, date, date)
rename to get_my_classroom_calendar_phase5g2_4_7_3_2_base;

revoke all on function
  public.get_my_classroom_calendar_phase5g2_4_7_3_2_base(uuid, date, date)
from public, anon, authenticated, service_role;

create or replace function public.get_my_classroom_calendar(
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
  template_payload jsonb;
  course_start_event jsonb;
  normalized_events jsonb;
  course_id uuid;
  active_version_id uuid;
  historical_course_start date;
  active_start date;
  viewer_time_zone text;
begin
  payload := public.get_my_classroom_calendar_phase5g2_4_7_3_2_base(
    p_classroom_id,
    p_range_start,
    p_range_end
  );

  select course.id, course.active_schedule_version_id, course.start_date
  into course_id, active_version_id, historical_course_start
  from public.classrooms classroom
  join public.student_courses course on course.id = classroom.course_id
  where classroom.id = p_classroom_id;

  if not found then
    return payload;
  end if;

  active_start := public.course_schedule_active_plan_start(course_id);

  select coalesce(
    jsonb_agg(event.value order by
      (event.value ->> 'startsOn')::date,
      event.value ->> 'id'
    ),
    '[]'::jsonb
  )
  into normalized_events
  from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb))
    event(value)
  where event.value ->> 'kind' is distinct from 'course_start';

  if active_start between p_range_start and p_range_end then
    template_payload :=
      public.get_my_classroom_calendar_phase5g2_4_7_3_2_base(
        p_classroom_id,
        historical_course_start,
        historical_course_start
      );

    select event.value
    into course_start_event
    from jsonb_array_elements(coalesce(
      template_payload -> 'events',
      '[]'::jsonb
    )) event(value)
    where event.value ->> 'kind' = 'course_start'
    limit 1;

    if course_start_event is not null then
      viewer_time_zone := coalesce(
        nullif(
          course_start_event #>> '{calendarPresentation,displayTimeZone}',
          ''
        ),
        'UTC'
      );
      course_start_event := course_start_event || jsonb_build_object(
        'id', 'course-start:' || course_id::text || ':'
          || active_version_id::text,
        'startsOn', active_start,
        'endsOn', active_start
      );
      course_start_event := jsonb_set(
        course_start_event,
        '{calendarPresentation,sourceKind}',
        to_jsonb('active_schedule_lifecycle'::text),
        true
      );
      course_start_event := jsonb_set(
        course_start_event,
        '{calendarPresentation,effectiveDate}',
        to_jsonb(active_start),
        true
      );
      course_start_event := jsonb_set(
        course_start_event,
        '{calendarPresentation,displayAnchor}',
        to_jsonb(
          (active_start + time '12:00') at time zone viewer_time_zone
        ),
        true
      );
      normalized_events := normalized_events
        || jsonb_build_array(course_start_event);
    end if;
  end if;

  select coalesce(
    jsonb_agg(event.value order by
      (event.value ->> 'startsOn')::date,
      event.value ->> 'id'
    ),
    '[]'::jsonb
  )
  into normalized_events
  from jsonb_array_elements(normalized_events) event(value);

  return jsonb_set(payload, '{events}', normalized_events, true);
end;
$$;

revoke all on function public.get_my_classroom_calendar(uuid, date, date)
from public, anon;
grant execute on function public.get_my_classroom_calendar(uuid, date, date)
to authenticated;

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
  ignored_publication_metadata jsonb;
  proposed_start_text text;
  proposed_start date;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The generated Course Schedule item list is invalid.';
  end if;

  -- Validate the governed Builder envelope, but do not recalculate dates here.
  -- schedule-domain.js owns the single combined cadence calculation; this
  -- publication boundary persists its exact ordered date/session mapping.
  ignored_publication_metadata :=
    public.course_schedule_builder_publication_metadata(p_builder_schedule);
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

revoke all on function public.reflow_course_schedule_builder_items(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;

comment on function public.course_schedule_active_plan_start(uuid) is
  'Returns the current active Schedule Version start without rewriting the historical Course start.';

comment on function public.get_my_classroom_calendar(uuid, date, date) is
  'Role-aware Classroom Calendar whose CB lifecycle marker follows the current active Schedule Version start.';

comment on function public.reflow_course_schedule_builder_items(
  uuid, uuid, jsonb, jsonb
) is
  'Validates a combined Builder publication and preserves the exact frontend-calculated ordered item dates.';

commit;
