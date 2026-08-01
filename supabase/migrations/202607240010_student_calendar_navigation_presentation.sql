-- Phase 5.G.2.2 follow-up: Calendar destinations and retained date-only targets.
--
-- The first canonical Calendar cutover was already applied locally. Keep that
-- contract as an internal base and enrich it without weakening its atomic
-- Course Schedule read or reintroducing the legacy Schedule mirror.

alter function public.get_my_student_calendar(date, date)
  rename to get_my_student_calendar_phase5g2_2_base;

revoke all on function
  public.get_my_student_calendar_phase5g2_2_base(date, date)
  from public, anon, authenticated;

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
  caller_id uuid := auth.uid();
  payload jsonb;
  source_event jsonb;
  enriched_event jsonb;
  enriched_events jsonb := '[]'::jsonb;
  schedule_item_id uuid;
  event_identity text;
  planning_href text;
  event_action jsonb;
  target_record record;
begin
  payload := public.get_my_student_calendar_phase5g2_2_base(
    p_range_start,
    p_range_end
  );

  -- Existing canonical events receive their most specific safe destination.
  -- Assignments open Practice; Course targets open their Track Session page
  -- when the immutable Schedule snapshot retained one.
  for source_event in
    select entry.value
    from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb))
      entry(value)
  loop
    schedule_item_id := null;
    planning_href := null;
    event_action := null;
    event_identity := coalesce(source_event ->> 'id', '');

    if event_identity ~ '^(plan|progress):[0-9a-f-]{36}$' then
      schedule_item_id := split_part(event_identity, ':', 2)::uuid;
    elsif event_identity ~ '^meeting:[0-9a-f-]{36}$' then
      select coalesce(latest_target.schedule_item_id, slot.static_schedule_item_id)
      into schedule_item_id
      from public.course_schedule_academic_slots slot
      left join lateral (
        select target.schedule_item_id
        from public.course_schedule_target_mapping_revisions revision
        join public.course_schedule_academic_slot_targets target
          on target.mapping_revision_id = revision.id
          and target.academic_slot_id = slot.id
        where revision.version_id = slot.version_id
        order by revision.revision_number desc, revision.id desc
        limit 1
      ) latest_target on true
      where slot.id = split_part(event_identity, ':', 2)::uuid;
    end if;

    if source_event ->> 'kind' = 'assignment_due'
      and event_identity ~ '^assignment:[0-9a-f-]{36}$' then
      event_action := jsonb_build_object(
        'type', 'open_practice',
        'assignmentId', split_part(event_identity, ':', 2)::uuid
      );
    elsif schedule_item_id is not null then
      select item.planning_href
      into planning_href
      from public.course_schedule_items item
      where item.id = schedule_item_id
        and item.version_id = (
          select course.active_schedule_version_id
          from public.student_courses course
          where course.id = nullif(source_event ->> 'courseId', '')::uuid
        );

      if nullif(btrim(coalesce(planning_href, '')), '') is not null then
        event_action := jsonb_build_object(
          'type', 'open_track_session',
          'href', planning_href,
          'scheduleItemId', schedule_item_id
        );
      end if;
    end if;

    enriched_event := source_event;
    if schedule_item_id is not null then
      enriched_event := enriched_event || jsonb_build_object(
        'scheduleItemId', schedule_item_id
      );
    end if;
    if event_action is not null then
      enriched_event := enriched_event || jsonb_build_object(
        'action', event_action
      );
    end if;
    enriched_events := enriched_events
      || jsonb_build_array(jsonb_strip_nulls(enriched_event));
  end loop;

  -- A static academic opportunity intentionally has no meeting timestamp.
  -- Older copies of the cutover omitted those rows. Restore only targets that
  -- are still absent after canonical event enrichment.
  for target_record in
    select
      item.id as schedule_item_id,
      item.title,
      item.scheduled_date,
      item.end_date,
      item.item_state,
      item.planning_href,
      course.id as course_id,
      course.title as course_title,
      classroom.id as classroom_id,
      tutor.id as tutor_id,
      coalesce(nullif(btrim(tutor.full_name), ''), 'Tutor') as tutor_name,
      subject.name as subject_name,
      focus.name as focus_name,
      degree.name as education_level_name,
      degree.slug as education_level_slug,
      coalesce(card.color_key, 'ocean') as color_key
    from public.student_courses course
    join public.classrooms classroom on classroom.course_id = course.id
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
      and membership.user_id = caller_id
      and membership.membership_role = 'student'
      and membership.status = 'active'
    join public.course_schedule_items item
      on item.version_id = course.active_schedule_version_id
      and item.item_state in ('scheduled', 'requeued')
    join public.profiles tutor on tutor.id = course.tutor_id
    join public.curriculum_nodes subject on subject.id = course.subject_node_id
    join public.curriculum_nodes focus on focus.id = course.focus_node_id
    left join public.curriculum_nodes degree
      on degree.id = subject.parent_id
      and degree.node_type = 'degree'
    left join public.student_classroom_card_preferences card
      on card.user_id = caller_id
      and card.classroom_id = classroom.id
    where course.student_id = caller_id
      and course.status in ('active', 'wind_down')
      and classroom.status = 'active'
      and item.scheduled_date between p_range_start and p_range_end
      and not exists (
        select 1
        from jsonb_array_elements(enriched_events) event
        where event ->> 'scheduleItemId' = item.id::text
      )
    order by item.scheduled_date, item.position, item.id
  loop
    event_action := case
      when nullif(btrim(coalesce(target_record.planning_href, '')), '') is null
        then null
      else jsonb_build_object(
        'type', 'open_track_session',
        'href', target_record.planning_href,
        'scheduleItemId', target_record.schedule_item_id
      )
    end;

    enriched_events := enriched_events || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'plan:' || target_record.schedule_item_id::text,
        'kind', 'schedule_milestone',
        'eventCode', 'SM',
        'eventLabel', 'Schedule milestone',
        'startsOn', target_record.scheduled_date,
        'endsOn', coalesce(target_record.end_date, target_record.scheduled_date),
        'title', target_record.title,
        'detail', target_record.course_title,
        'courseId', target_record.course_id,
        'classroomId', target_record.classroom_id,
        'courseTitle', target_record.course_title,
        'scheduleItemId', target_record.schedule_item_id,
        'tutor', jsonb_build_object(
          'id', target_record.tutor_id,
          'name', target_record.tutor_name
        ),
        'subject', target_record.subject_name,
        'focus', target_record.focus_name,
        'educationLevel', jsonb_strip_nulls(jsonb_build_object(
          'name', target_record.education_level_name,
          'slug', target_record.education_level_slug,
          'code', nullif(public.calendar_education_level_code(
            target_record.education_level_name,
            target_record.education_level_slug
          ), '')
        )),
        'colorKey', target_record.color_key,
        'status', target_record.item_state,
        'calendarPresentation', jsonb_build_object(
          'sourceKind', 'course_target',
          'isDateOnly', true,
          'effectiveDate', target_record.scheduled_date,
          'displayAnchor',
            (target_record.scheduled_date + time '12:00')
              at time zone coalesce(payload #>> '{range,timeZone}', 'UTC'),
          'displayLocalTime', '12:00',
          'displayTimeZone', coalesce(payload #>> '{range,timeZone}', 'UTC'),
          'placement', 'viewer_local_noon',
          'blocksAvailability', false
        ),
        'action', event_action
      ))
    );
  end loop;

  select coalesce(jsonb_agg(event order by
    (event ->> 'startsOn')::date,
    case event ->> 'kind'
      when 'course_start' then 0
      when 'regular_class' then 1
      when 'extra_class' then 2
      when 'schedule_milestone' then 3
      when 'independent_progress' then 4
      when 'assignment_due' then 5
      when 'course_end' then 6
      else 7
    end,
    lower(event ->> 'title'),
    event ->> 'id'
  ), '[]'::jsonb)
  into enriched_events
  from jsonb_array_elements(enriched_events) event;

  payload := jsonb_set(payload, '{events}', enriched_events, true);
  payload := jsonb_set(payload, '{contract,version}', '2'::jsonb, true);
  payload := jsonb_set(
    payload,
    '{contract,directEventDestinations}',
    'true'::jsonb,
    true
  );
  return payload;
end;
$$;

revoke all on function public.get_my_student_calendar(date, date)
  from public, anon, authenticated;
grant execute on function public.get_my_student_calendar(date, date)
  to authenticated;

comment on function public.get_my_student_calendar(date, date) is
  'Phase 5.G.2.2 canonical Student Calendar follow-up. It restores date-only Course targets and routes Assignments and Track Sessions directly while retaining atomic Course Schedule authority.';
