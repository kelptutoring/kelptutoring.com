-- Phase 5.G.2.4.7.3.4: one effective Course End authority.
--
-- The stored Course boundary remains historical structural data. Adaptive
-- progress, Studied reversals, and cadence publications already rebuild one
-- current target-mapping revision, but the Calendar's CE lifecycle event still
-- read student_courses.scheduled_end_date. It could therefore remain months
-- behind a contracted plan or on the former cadence after a revision.
--
-- Derive the visible Course End from the active Version only:
--   * currently Studied curriculum Sessions contribute their actual Studied
--     local date;
--   * unfinished Sessions contribute their current mapped/frozen local date;
--   * an unmapped target falls back to its immutable planned date; and
--   * an empty/legacy plan falls back to its retained Course boundary.
--
-- This makes the terminal marker contract with Adaptive progress, expand after
-- a Studied reversal, follow the current cadence, and remain frozen under a
-- Static policy without mutating historical Course data.

begin;

create or replace function public.course_schedule_effective_plan_end(
  p_course_id uuid
)
returns date
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  active_version_id uuid;
  active_time_zone text;
  retained_course_end date;
  active_start date;
  mapping_snapshot jsonb := '{}'::jsonb;
  effective_end date;
begin
  select
    version.id,
    version.time_zone,
    course.scheduled_end_date
  into active_version_id, active_time_zone, retained_course_end
  from public.student_courses course
  join public.course_schedule_versions version
    on version.id = course.active_schedule_version_id
  where course.id = p_course_id;

  if not found then
    raise exception 'The active Course Schedule Version could not be found.';
  end if;

  select revision.snapshot
  into mapping_snapshot
  from public.course_schedule_target_mapping_revisions revision
  where revision.course_id = p_course_id
    and revision.version_id = active_version_id
  order by revision.revision_number desc, revision.id desc
  limit 1;

  if mapping_snapshot is null then
    mapping_snapshot := public.course_schedule_target_mapping_snapshot(
      p_course_id,
      active_version_id
    );
  end if;

  select max(
    case
      when coalesce(
        (studied.payload ->> 'marked')::boolean,
        false
      ) and nullif(studied.payload ->> 'effectiveAt', '') is not null
      then (
        (studied.payload ->> 'effectiveAt')::timestamptz
          at time zone active_time_zone
      )::date
      when mapped.local_date is not null then mapped.local_date
      else item.scheduled_date
    end
  )
  into effective_end
  from public.course_schedule_items item
  left join lateral (
    select public.course_session_studied_aggregation(
      p_course_id,
      item.id
    ) as payload
    where item.item_kind = 'curriculum_topic'
  ) studied on true
  left join lateral (
    select (mapping.value ->> 'localDate')::date as local_date
    from jsonb_array_elements(coalesce(
      mapping_snapshot -> 'slotMappings',
      '[]'::jsonb
    )) mapping(value)
    where mapping.value ->> 'targetScheduleItemId' = item.id::text
      and mapping.value ->> 'mappingState' in ('targeted', 'completed')
      and coalesce(mapping.value ->> 'localDate', '')
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    order by (mapping.value ->> 'slotPosition')::integer
    limit 1
  ) mapped on true
  where item.version_id = active_version_id
    and item.item_state in ('scheduled', 'requeued');

  active_start := public.course_schedule_active_plan_start(p_course_id);
  effective_end := coalesce(effective_end, retained_course_end, active_start);

  if active_start is not null
    and effective_end is not null
    and effective_end < active_start then
    effective_end := active_start;
  end if;

  return effective_end;
end;
$$;

revoke all on function public.course_schedule_effective_plan_end(uuid)
from public, anon, authenticated, service_role;

alter function public.get_my_classroom_calendar(uuid, date, date)
rename to get_my_classroom_calendar_phase5g2_4_7_3_4_base;

revoke all on function
  public.get_my_classroom_calendar_phase5g2_4_7_3_4_base(
    uuid, date, date
  ) from public, anon, authenticated, service_role;

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
  course_end_event jsonb;
  normalized_events jsonb;
  course_id uuid;
  active_version_id uuid;
  retained_course_end date;
  effective_end date;
  viewer_time_zone text;
begin
  payload := public.get_my_classroom_calendar_phase5g2_4_7_3_4_base(
    p_classroom_id,
    p_range_start,
    p_range_end
  );

  select
    course.id,
    course.active_schedule_version_id,
    course.scheduled_end_date
  into course_id, active_version_id, retained_course_end
  from public.classrooms classroom
  join public.student_courses course on course.id = classroom.course_id
  where classroom.id = p_classroom_id;

  if not found then
    return payload;
  end if;

  effective_end := public.course_schedule_effective_plan_end(course_id);

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
  where event.value ->> 'kind' is distinct from 'course_end';

  if effective_end between p_range_start and p_range_end
    and retained_course_end is not null then
    template_payload :=
      public.get_my_classroom_calendar_phase5g2_4_7_3_4_base(
        p_classroom_id,
        retained_course_end,
        retained_course_end
      );

    select event.value
    into course_end_event
    from jsonb_array_elements(coalesce(
      template_payload -> 'events',
      '[]'::jsonb
    )) event(value)
    where event.value ->> 'kind' = 'course_end'
    limit 1;

    if course_end_event is not null then
      viewer_time_zone := coalesce(
        nullif(
          course_end_event #>> '{calendarPresentation,displayTimeZone}',
          ''
        ),
        'UTC'
      );
      course_end_event := course_end_event || jsonb_build_object(
        'id', 'course-end:' || course_id::text || ':'
          || active_version_id::text,
        'startsOn', effective_end,
        'endsOn', effective_end
      );
      course_end_event := jsonb_set(
        course_end_event,
        '{calendarPresentation,sourceKind}',
        to_jsonb('effective_schedule_lifecycle'::text),
        true
      );
      course_end_event := jsonb_set(
        course_end_event,
        '{calendarPresentation,effectiveDate}',
        to_jsonb(effective_end),
        true
      );
      course_end_event := jsonb_set(
        course_end_event,
        '{calendarPresentation,displayAnchor}',
        to_jsonb(
          (effective_end + time '12:00') at time zone viewer_time_zone
        ),
        true
      );
      normalized_events := normalized_events
        || jsonb_build_array(course_end_event);
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

  payload := jsonb_set(payload, '{events}', normalized_events, true);
  return payload || jsonb_build_object(
    'featureStatus', coalesce(payload -> 'featureStatus', '{}'::jsonb)
      || jsonb_build_object(
        'effectiveCourseEndAuthority',
        'active_phase_5g2_4_7_3_4'
      )
  );
end;
$$;

revoke all on function public.get_my_classroom_calendar(uuid, date, date)
from public, anon;
grant execute on function public.get_my_classroom_calendar(uuid, date, date)
to authenticated;

comment on function public.course_schedule_effective_plan_end(uuid) is
  'Returns the active Schedule Version terminal date from actual Studied dates and the current mapped or frozen target lane.';

comment on function public.get_my_classroom_calendar(uuid, date, date) is
  'Role-aware Classroom Calendar whose CE lifecycle marker follows the last effective active-Version target.';

commit;
