-- Phase 5.G.2.2: canonical Student Calendar consumer.
--
-- Dashboard and future Classroom Calendars consume the authoritative Course
-- Schedule timeline. The legacy learning_schedules mirror remains involved
-- only when resolving the immutable snapshot owned by an existing Assignment.

create or replace function public.calendar_education_level_code(
  p_name text,
  p_slug text
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select case
    when lower(coalesce(p_slug, '')) in ('elementary-school', 'primary-school')
      or lower(coalesce(p_name, '')) like '%elementary%'
      or lower(coalesce(p_name, '')) like '%primary%'
      then 'ES'
    when lower(coalesce(p_slug, '')) = 'middle-school'
      or lower(coalesce(p_name, '')) like '%middle school%'
      then 'MS'
    when lower(coalesce(p_slug, '')) in ('high-school', 'secondary-school')
      or lower(coalesce(p_name, '')) like '%high school%'
      or lower(coalesce(p_name, '')) like '%secondary%'
      then 'HS'
    when lower(coalesce(p_slug, '')) in (
      'college', 'university', 'undergraduate', 'higher-education'
    )
      or lower(coalesce(p_name, '')) like '%college%'
      or lower(coalesce(p_name, '')) like '%university%'
      or lower(coalesce(p_name, '')) like '%undergraduate%'
      then 'CL'
    when nullif(btrim(coalesce(p_name, '')), '') is null then ''
    else upper(left(regexp_replace(p_name, '[^[:alnum:] ]', '', 'g'), 1))
  end;
$$;

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
  viewer_time_zone text := 'UTC';
  calendar_events_payload jsonb := '[]'::jsonb;
  availability_contexts jsonb := '[]'::jsonb;
  course_record record;
  course_projection jsonb;
  timeline_rows jsonb;
  timeline_row jsonb;
  calendar_presentation jsonb;
  event_payload jsonb;
  event_kind text;
  event_code text;
  event_label text;
  event_date date;
  event_end_date date;
  event_starts_at timestamptz;
  event_ends_at timestamptz;
  event_origin text;
  education_code text;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to load this Calendar.';
  end if;
  if p_range_start is null or p_range_end is null then
    raise exception 'Calendar range start and end dates are required.';
  end if;
  if p_range_end < p_range_start then
    raise exception 'Calendar range end must not precede its start.';
  end if;
  if (p_range_end - p_range_start) > 61 then
    raise exception 'Calendar ranges cannot exceed 62 days.';
  end if;

  select coalesce(nullif(btrim(preferences.time_zone), ''), 'UTC')
  into viewer_time_zone
  from public.user_preferences preferences
  where preferences.user_id = caller_id;
  if not found then viewer_time_zone := 'UTC'; end if;

  for course_record in
    select
      course.id as course_id,
      course.title as course_title,
      course.status as course_status,
      course.start_date,
      course.scheduled_end_date,
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
    join public.profiles tutor on tutor.id = course.tutor_id
    join public.curriculum_nodes subject on subject.id = course.subject_node_id
    join public.curriculum_nodes focus on focus.id = course.focus_node_id
    left join public.curriculum_nodes degree
      on degree.id = subject.parent_id
      and degree.node_type = 'degree'
    left join public.student_classroom_card_preferences card
      on card.user_id = caller_id and card.classroom_id = classroom.id
    where course.student_id = caller_id
      and course.status in ('active', 'wind_down')
      and classroom.status = 'active'
    order by course.created_at, course.id
  loop
    education_code := public.calendar_education_level_code(
      course_record.education_level_name,
      course_record.education_level_slug
    );
    availability_contexts := availability_contexts || jsonb_build_array(
      jsonb_build_object(
        'courseId', course_record.course_id,
        'classroomId', course_record.classroom_id,
        'courseTitle', course_record.course_title,
        'tutor', jsonb_build_object(
          'id', course_record.tutor_id,
          'name', course_record.tutor_name
        ),
        'subject', course_record.subject_name,
        'focus', course_record.focus_name,
        'educationLevel', jsonb_strip_nulls(jsonb_build_object(
          'name', course_record.education_level_name,
          'slug', course_record.education_level_slug,
          'code', nullif(education_code, '')
        )),
        'colorKey', course_record.color_key
      )
    );

    if course_record.start_date between p_range_start and p_range_end then
      calendar_events_payload := calendar_events_payload || jsonb_build_array(
        jsonb_build_object(
          'id', 'course-start:' || course_record.course_id::text,
          'kind', 'course_start',
          'eventCode', 'CB',
          'eventLabel', 'Course begins',
          'startsOn', course_record.start_date,
          'endsOn', course_record.start_date,
          'title', course_record.course_title,
          'detail', course_record.subject_name || case
            when course_record.focus_name <> ''
              then ' · ' || course_record.focus_name
            else ''
          end,
          'courseId', course_record.course_id,
          'classroomId', course_record.classroom_id,
          'courseTitle', course_record.course_title,
          'tutor', jsonb_build_object(
            'id', course_record.tutor_id,
            'name', course_record.tutor_name
          ),
          'subject', course_record.subject_name,
          'focus', course_record.focus_name,
          'educationLevel', jsonb_strip_nulls(jsonb_build_object(
            'name', course_record.education_level_name,
            'slug', course_record.education_level_slug,
            'code', nullif(education_code, '')
          )),
          'colorKey', course_record.color_key,
          'status', course_record.course_status,
          'calendarPresentation', jsonb_build_object(
            'sourceKind', 'course_lifecycle',
            'isDateOnly', true,
            'effectiveDate', course_record.start_date,
            'displayAnchor',
              (course_record.start_date + time '12:00')
                at time zone viewer_time_zone,
            'displayLocalTime', '12:00',
            'displayTimeZone', viewer_time_zone,
            'placement', 'viewer_local_noon',
            'blocksAvailability', false
          )
        )
      );
    end if;

    if course_record.scheduled_end_date between p_range_start and p_range_end then
      calendar_events_payload := calendar_events_payload || jsonb_build_array(
        jsonb_build_object(
          'id', 'course-end:' || course_record.course_id::text,
          'kind', 'course_end',
          'eventCode', 'CE',
          'eventLabel', 'Course ends',
          'startsOn', course_record.scheduled_end_date,
          'endsOn', course_record.scheduled_end_date,
          'title', course_record.course_title,
          'detail', course_record.subject_name || case
            when course_record.focus_name <> ''
              then ' · ' || course_record.focus_name
            else ''
          end,
          'courseId', course_record.course_id,
          'classroomId', course_record.classroom_id,
          'courseTitle', course_record.course_title,
          'tutor', jsonb_build_object(
            'id', course_record.tutor_id,
            'name', course_record.tutor_name
          ),
          'subject', course_record.subject_name,
          'focus', course_record.focus_name,
          'educationLevel', jsonb_strip_nulls(jsonb_build_object(
            'name', course_record.education_level_name,
            'slug', course_record.education_level_slug,
            'code', nullif(education_code, '')
          )),
          'colorKey', course_record.color_key,
          'status', course_record.course_status,
          'calendarPresentation', jsonb_build_object(
            'sourceKind', 'course_lifecycle',
            'isDateOnly', true,
            'effectiveDate', course_record.scheduled_end_date,
            'displayAnchor',
              (course_record.scheduled_end_date + time '12:00')
                at time zone viewer_time_zone,
            'displayLocalTime', '12:00',
            'displayTimeZone', viewer_time_zone,
            'placement', 'viewer_local_noon',
            'blocksAvailability', false
          )
        )
      );
    end if;

    -- A canonical read failure aborts the whole Calendar. Omitting one Course
    -- or falling back to its legacy mirror would present an incomplete plan.
    course_projection := public.get_my_unified_course_schedule(
      course_record.course_id
    );
    if course_projection #>> '{contract,name}' is distinct from 'course_schedule_read' then
      raise exception 'A canonical Course Schedule could not be loaded for this Calendar.';
    end if;

    timeline_rows :=
      coalesce(course_projection #> '{groups,past}', '[]'::jsonb)
      || coalesce(course_projection #> '{groups,next}', '[]'::jsonb)
      || coalesce(course_projection #> '{groups,upcoming}', '[]'::jsonb);

    for timeline_row in
      select entry.value
      from jsonb_array_elements(timeline_rows) entry(value)
    loop
      calendar_presentation := coalesce(
        timeline_row -> 'calendarPresentation',
        '{}'::jsonb
      );
      event_starts_at := nullif(
        calendar_presentation ->> 'startsAt',
        ''
      )::timestamptz;
      event_ends_at := nullif(
        calendar_presentation ->> 'endsAt',
        ''
      )::timestamptz;

      if coalesce(
        (calendar_presentation ->> 'isDateOnly')::boolean,
        false
      ) then
        event_date := nullif(
          calendar_presentation ->> 'effectiveDate',
          ''
        )::date;
        event_end_date := event_date;
        calendar_presentation := calendar_presentation
          || jsonb_build_object(
            'displayAnchor', case when event_date is null then null
              else (event_date + time '12:00') at time zone viewer_time_zone
            end,
            'displayTimeZone', viewer_time_zone
          );
      elsif event_starts_at is null then
        -- Static academic slots deliberately carry no meeting time. They remain
        -- date-only Schedule milestones instead of disappearing or pretending
        -- to be booked Classes.
        event_date := nullif(timeline_row ->> 'effectiveDate', '')::date;
        event_end_date := event_date;
        calendar_presentation := calendar_presentation
          || jsonb_build_object(
            'sourceKind', 'course_target',
            'isDateOnly', true,
            'effectiveDate', event_date,
            'displayAnchor', case when event_date is null then null
              else (event_date + time '12:00') at time zone viewer_time_zone
            end,
            'displayLocalTime', '12:00',
            'displayTimeZone', viewer_time_zone,
            'placement', 'viewer_local_noon'
          );
      else
        event_date := (event_starts_at at time zone viewer_time_zone)::date;
        event_end_date := case when event_ends_at is null then event_date
          else (event_ends_at at time zone viewer_time_zone)::date
        end;
        calendar_presentation := calendar_presentation
          || jsonb_build_object('displayTimeZone', viewer_time_zone);
      end if;

      if event_date is null
        or event_date < p_range_start
        or event_date > p_range_end then
        continue;
      end if;

      if timeline_row ->> 'rowKind' = 'meeting'
        and event_starts_at is not null then
        event_origin := lower(coalesce(timeline_row ->> 'lessonOrigin', ''));
        if event_origin in ('extra', 'on_demand') then
          event_kind := 'extra_class';
          event_code := 'EC';
          event_label := 'Extra class';
        else
          event_kind := 'regular_class';
          event_code := 'RC';
          event_label := 'Regular class';
        end if;
      elsif timeline_row ->> 'rowKind' = 'independent_progress' then
        event_kind := 'independent_progress';
        event_code := 'IP';
        event_label := 'Independent progress';
      else
        event_kind := 'schedule_milestone';
        event_code := 'SM';
        event_label := 'Schedule milestone';
      end if;

      event_payload := jsonb_build_object(
        'id', timeline_row ->> 'rowId',
        'kind', event_kind,
        'eventCode', event_code,
        'eventLabel', event_label,
        'startsOn', event_date,
        'endsOn', coalesce(event_end_date, event_date),
        'startsAt', event_starts_at,
        'endsAt', event_ends_at,
        'title', coalesce(
          nullif(timeline_row ->> 'title', ''),
          course_record.course_title
        ),
        'detail', course_record.course_title,
        'courseId', course_record.course_id,
        'classroomId', course_record.classroom_id,
        'courseTitle', course_record.course_title,
        'tutor', jsonb_build_object(
          'id', course_record.tutor_id,
          'name', course_record.tutor_name
        ),
        'subject', course_record.subject_name,
        'focus', course_record.focus_name,
        'educationLevel', jsonb_strip_nulls(jsonb_build_object(
          'name', course_record.education_level_name,
          'slug', course_record.education_level_slug,
          'code', nullif(education_code, '')
        )),
        'colorKey', course_record.color_key,
        'status', timeline_row ->> 'status',
        'nonDeliveryReason', timeline_row ->> 'nonDeliveryReason',
        'calendarPresentation', calendar_presentation
      );
      calendar_events_payload := calendar_events_payload
        || jsonb_build_array(jsonb_strip_nulls(event_payload));
    end loop;
  end loop;

  -- Assignment deadlines remain independent facts. Their immutable assignment
  -- snapshot still references the compatibility session that existed when the
  -- Assignment was issued; changing the deadline never moves a meeting.
  with assignment_events as (
    select
      assignment.id,
      assignment.course_title as assignment_title,
      assignment.schedule_snapshot,
      session.end_date as session_end_date,
      course.id as course_id,
      classroom.id as classroom_id,
      course.title as course_title,
      tutor.id as tutor_id,
      coalesce(nullif(btrim(tutor.full_name), ''), 'Tutor') as tutor_name,
      subject.name as subject_name,
      focus.name as focus_name,
      degree.name as education_level_name,
      degree.slug as education_level_slug,
      coalesce(card.color_key, 'ocean') as color_key,
      coalesce(
        nullif(assignment.schedule_snapshot ->> 'endDate', '')::date,
        session.end_date
      ) as due_date
    from public.course_assignments assignment
    join public.learning_schedule_sessions session
      on session.id = assignment.schedule_session_id
    join public.learning_schedules legacy_schedule
      on legacy_schedule.id = session.schedule_id
    join public.student_courses course
      on course.id = legacy_schedule.student_course_id
    join public.classrooms classroom on classroom.course_id = course.id
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
      and membership.user_id = caller_id
      and membership.membership_role = 'student'
      and membership.status = 'active'
    join public.profiles tutor on tutor.id = course.tutor_id
    join public.curriculum_nodes subject on subject.id = course.subject_node_id
    join public.curriculum_nodes focus on focus.id = course.focus_node_id
    left join public.curriculum_nodes degree
      on degree.id = subject.parent_id
      and degree.node_type = 'degree'
    left join public.student_classroom_card_preferences card
      on card.user_id = caller_id and card.classroom_id = classroom.id
    where assignment.student_id = caller_id
      and assignment.status <> 'cancelled'
      and course.student_id = caller_id
      and course.status in ('active', 'wind_down')
      and classroom.status = 'active'
      and coalesce(
        nullif(assignment.schedule_snapshot ->> 'endDate', '')::date,
        session.end_date
      ) between p_range_start and p_range_end
  )
  select calendar_events_payload || coalesce(jsonb_agg(jsonb_build_object(
    'id', 'assignment:' || assignment.id::text,
    'kind', 'assignment_due',
    'eventCode', 'AD',
    'eventLabel', 'Assignment due',
    'startsOn', assignment.due_date,
    'endsOn', assignment.due_date,
    'title', assignment.assignment_title,
    'detail', coalesce(
      nullif(assignment.schedule_snapshot ->> 'sessionTitle', ''),
      assignment.course_title
    ),
    'courseId', assignment.course_id,
    'classroomId', assignment.classroom_id,
    'courseTitle', assignment.course_title,
    'tutor', jsonb_build_object(
      'id', assignment.tutor_id,
      'name', assignment.tutor_name
    ),
    'subject', assignment.subject_name,
    'focus', assignment.focus_name,
    'educationLevel', jsonb_strip_nulls(jsonb_build_object(
      'name', assignment.education_level_name,
      'slug', assignment.education_level_slug,
      'code', nullif(public.calendar_education_level_code(
        assignment.education_level_name,
        assignment.education_level_slug
      ), '')
    )),
    'colorKey', assignment.color_key,
    'calendarPresentation', jsonb_build_object(
      'sourceKind', 'assignment_deadline',
      'isDateOnly', true,
      'effectiveDate', assignment.due_date,
      'displayAnchor',
        (assignment.due_date + time '12:00') at time zone viewer_time_zone,
      'displayLocalTime', '12:00',
      'displayTimeZone', viewer_time_zone,
      'placement', 'viewer_local_noon',
      'blocksAvailability', false
    ),
    'action', jsonb_build_object(
      'type', 'open_practice',
      'assignmentId', assignment.id
    )
  ) order by assignment.due_date, lower(assignment.assignment_title), assignment.id), '[]'::jsonb)
  into calendar_events_payload
  from assignment_events assignment;

  select coalesce(jsonb_agg(event order by
    (event ->> 'startsOn')::date,
    case event ->> 'kind'
      when 'course_start' then 0
      when 'regular_class' then 1
      when 'extra_class' then 2
      when 'schedule_milestone' then 3
      when 'independent_progress' then 4
      when 'assignment_due' then 5
      else 6
    end,
    lower(event ->> 'title'),
    event ->> 'id'
  ), '[]'::jsonb)
  into calendar_events_payload
  from jsonb_array_elements(calendar_events_payload) event;

  return jsonb_build_object(
    'schemaVersion', 2,
    'contract', jsonb_build_object(
      'name', 'student_calendar_read',
      'phase', '5.G.2.2',
      'version', 1,
      'scheduleAuthority', 'course_schedule_read',
      'assignmentAuthority', 'course_assignments.schedule_snapshot',
      'legacyScheduleMirrorAuthoritative', false,
      'failureMode', 'atomic'
    ),
    'range', jsonb_build_object(
      'startDate', p_range_start,
      'endDate', p_range_end,
      'timeZone', viewer_time_zone
    ),
    'events', calendar_events_payload,
    'availabilityOverlay', jsonb_build_object(
      'status', 'contract_only_phase_10',
      'eligibleContexts', availability_contexts
    ),
    'calendarPolicy', jsonb_build_object(
      'dateOnlyDisplayAnchor', 'viewer_local_noon',
      'dateOnlyDisplayIsPresentationOnly', true,
      'dateOnlyItemsBlockAvailability', false,
      'assignmentDeadlinesAreIndependent', true,
      'assignmentDeadlineChangesMoveMeetings', false,
      'canonicalFailureIsAtomic', true,
      'legacyScheduleFallback', false
    ),
    'featureStatus', jsonb_build_object(
      'calendarProjection', 'active_phase_5g2_2',
      'scheduledClasses', 'canonical_academic_opportunities',
      'availabilitySlots', 'contract_only_phase_10',
      'lessonRequests', 'pending_phase_10',
      'bookingConcurrency', 'pending_phase_10'
    )
  );
end;
$$;

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
  scoped_events jsonb;
  scoped_contexts jsonb;
begin
  if p_classroom_id is null then
    raise exception 'A Classroom is required to load its Calendar.';
  end if;

  payload := public.get_my_student_calendar(p_range_start, p_range_end);

  select coalesce(jsonb_agg(context), '[]'::jsonb)
  into scoped_contexts
  from jsonb_array_elements(
    coalesce(payload #> '{availabilityOverlay,eligibleContexts}', '[]'::jsonb)
  ) context
  where context ->> 'classroomId' = p_classroom_id::text;

  if jsonb_array_length(scoped_contexts) = 0 then
    raise exception 'An active Student Classroom Membership is required to load this Calendar.';
  end if;

  select coalesce(jsonb_agg(event order by
    (event ->> 'startsOn')::date,
    event ->> 'id'
  ), '[]'::jsonb)
  into scoped_events
  from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb)) event
  where event ->> 'classroomId' = p_classroom_id::text;

  payload := jsonb_set(payload, '{events}', scoped_events, true);
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
  return payload;
end;
$$;

revoke all on function public.calendar_education_level_code(text, text)
  from public, anon, authenticated;
revoke all on function public.get_my_student_calendar(date, date)
  from public, anon, authenticated;
revoke all on function public.get_my_student_classroom_calendar(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.get_my_student_calendar(date, date)
  to authenticated;
grant execute on function public.get_my_student_classroom_calendar(uuid, date, date)
  to authenticated;

comment on function public.calendar_education_level_code(text, text) is
  'Stable compact Calendar code for the Course education level. SM remains reserved for Schedule milestone, while MS means Middle School.';
comment on function public.get_my_student_calendar(date, date) is
  'Phase 5.G.2.2 Student Calendar read. Course events are projected atomically from course_schedule_read; Assignment deadlines remain independent immutable facts and the legacy Schedule mirror is never a Course-event fallback.';
comment on function public.get_my_student_classroom_calendar(uuid, date, date) is
  'Course-scoped Phase 5.G.2.2 Calendar adapter for the future Classroom Calendar. It returns only the requested active Student Classroom and limits availability context to its assigned Tutor.';
