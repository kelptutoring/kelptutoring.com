-- Phase 5.H Classroom Calendar:
-- expose one canonical Course-scoped Calendar to active Students, Tutors, and
-- Mentors without broadening the Student's global Calendar authority.

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
  caller_id uuid := auth.uid();
  viewer_time_zone text := 'UTC';
  course_record record;
  assignment_record record;
  course_projection jsonb;
  timeline_rows jsonb;
  timeline_row jsonb;
  calendar_presentation jsonb;
  calendar_events jsonb := '[]'::jsonb;
  event_payload jsonb;
  event_action jsonb;
  item_payload jsonb;
  item_branch jsonb;
  module_styles jsonb := '{}'::jsonb;
  module_style jsonb := '{}'::jsonb;
  schedule_item_id uuid;
  module_key text;
  module_title text;
  planning_href text;
  event_kind text;
  event_code text;
  event_label text;
  event_date date;
  event_end_date date;
  event_starts_at timestamptz;
  event_ends_at timestamptz;
  event_origin text;
  course_education_level jsonb;
  event_education_level jsonb;
  education_code text;
  event_subject text;
  event_track text;
  coverage_label text;
begin
  if caller_id is null then
    raise exception 'Authentication is required to load a Classroom Calendar.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required to load its Calendar.';
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

  select
    classroom.id as classroom_id,
    course.id as course_id,
    course.title as course_title,
    course.status as course_status,
    course.start_date,
    course.scheduled_end_date,
    course.student_id,
    membership.membership_role,
    tutor.id as tutor_id,
    coalesce(nullif(btrim(tutor.full_name), ''), 'Tutor') as tutor_name,
    subject.name as subject_name,
    focus.name as focus_name,
    degree.name as education_level_name,
    degree.slug as education_level_slug,
    coalesce(card.color_key, 'ocean') as color_key
  into course_record
  from public.classrooms classroom
  join public.student_courses course on course.id = classroom.course_id
  join lateral (
    select candidate.membership_role
    from public.classroom_memberships candidate
    where candidate.classroom_id = classroom.id
      and candidate.user_id = caller_id
      and candidate.status = 'active'
      and candidate.membership_role in ('student', 'tutor', 'mentor')
    order by case candidate.membership_role
      when 'student' then 0
      when 'tutor' then 1
      else 2
    end
    limit 1
  ) membership on true
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  left join public.curriculum_nodes degree
    on degree.id = subject.parent_id
    and degree.node_type = 'degree'
  left join public.student_classroom_card_preferences card
    on card.user_id = caller_id
    and card.classroom_id = classroom.id
  where classroom.id = p_classroom_id
    and classroom.status = 'active'
    and course.status in ('active', 'wind_down');

  if not found then
    raise exception
      'An active Student, Tutor, or Mentor Classroom Membership is required to load this Calendar.';
  end if;

  select coalesce(nullif(btrim(preferences.time_zone), ''), 'UTC')
  into viewer_time_zone
  from public.user_preferences preferences
  where preferences.user_id = caller_id;
  if not found then viewer_time_zone := 'UTC'; end if;

  course_projection := public.get_my_unified_course_schedule(
    course_record.course_id
  );
  if course_projection #>> '{contract,name}' is distinct from 'course_schedule_read' then
    raise exception 'A canonical Course Schedule could not be loaded for this Calendar.';
  end if;

  module_styles := coalesce(
    course_projection #> '{academicTrack,moduleStyles}',
    '{}'::jsonb
  );
  coverage_label := coalesce(
    nullif(course_projection #>> '{academicTrack,coverage,displayLabel}', ''),
    nullif(course_projection #>> '{context,academicContext,coverage,displayLabel}', ''),
    course_record.subject_name || case
      when nullif(course_record.focus_name, '') is null then ''
      else ' - ' || course_record.focus_name
    end
  );
  course_education_level := coalesce(
    course_projection #> '{academicTrack,educationLevel}',
    jsonb_strip_nulls(jsonb_build_object(
      'name', course_record.education_level_name,
      'slug', course_record.education_level_slug
    ))
  );
  education_code := public.calendar_education_level_code(
    course_education_level ->> 'name',
    course_education_level ->> 'slug'
  );
  course_education_level := course_education_level || jsonb_build_object(
    'code', nullif(education_code, '')
  );

  if course_record.start_date between p_range_start and p_range_end then
    calendar_events := calendar_events || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'course-start:' || course_record.course_id::text,
        'kind', 'course_start',
        'eventCode', 'CB',
        'eventLabel', 'Course begins',
        'startsOn', course_record.start_date,
        'endsOn', course_record.start_date,
        'title', course_record.course_title,
        'detail', coverage_label,
        'courseId', course_record.course_id,
        'classroomId', course_record.classroom_id,
        'courseTitle', course_record.course_title,
        'tutor', jsonb_build_object(
          'id', course_record.tutor_id,
          'name', course_record.tutor_name
        ),
        'subject', coverage_label,
        'focus', '',
        'educationLevel', course_education_level,
        'colorKey', course_record.color_key,
        'status', course_record.course_status,
        'presentationColorSource', 'classroom',
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
      ))
    );
  end if;

  if course_record.scheduled_end_date between p_range_start and p_range_end then
    calendar_events := calendar_events || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'course-end:' || course_record.course_id::text,
        'kind', 'course_end',
        'eventCode', 'CE',
        'eventLabel', 'Course ends',
        'startsOn', course_record.scheduled_end_date,
        'endsOn', course_record.scheduled_end_date,
        'title', course_record.course_title,
        'detail', coverage_label,
        'courseId', course_record.course_id,
        'classroomId', course_record.classroom_id,
        'courseTitle', course_record.course_title,
        'tutor', jsonb_build_object(
          'id', course_record.tutor_id,
          'name', course_record.tutor_name
        ),
        'subject', coverage_label,
        'focus', '',
        'educationLevel', course_education_level,
        'colorKey', course_record.color_key,
        'status', course_record.course_status,
        'presentationColorSource', 'classroom',
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
      ))
    );
  end if;

  timeline_rows :=
    coalesce(course_projection #> '{groups,past}', '[]'::jsonb)
    || coalesce(course_projection #> '{groups,next}', '[]'::jsonb)
    || coalesce(course_projection #> '{groups,upcoming}', '[]'::jsonb);

  for timeline_row in
    select entry.value
    from jsonb_array_elements(timeline_rows) entry(value)
  loop
    schedule_item_id := null;
    item_payload := null;
    item_branch := null;
    module_key := null;
    module_title := null;
    module_style := '{}'::jsonb;
    planning_href := null;
    event_action := null;

    if coalesce(timeline_row ->> 'scheduleItemId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      schedule_item_id := (timeline_row ->> 'scheduleItemId')::uuid;
      select item_entry.value
      into item_payload
      from jsonb_array_elements(coalesce(
        course_projection #> '{academicTrack,items}',
        '[]'::jsonb
      )) item_entry(value)
      where item_entry.value ->> 'scheduleItemId' = schedule_item_id::text
      limit 1;
    end if;

    if item_payload is not null then
      item_branch := item_payload -> 'academicBranch';
      module_key := coalesce(
        nullif(item_payload #>> '{presentation,modulePresentationKey}', ''),
        nullif(item_payload ->> 'moduleKey', ''),
        'course-plan'
      );
      module_title := coalesce(
        nullif(item_payload #>> '{presentation,moduleTitle}', ''),
        nullif(item_payload ->> 'moduleTitle', ''),
        'Course plan'
      );
      module_style := coalesce(module_styles -> module_key, '{}'::jsonb);
      planning_href := nullif(btrim(coalesce(
        item_payload ->> 'planningHref',
        ''
      )), '');
      if planning_href is not null then
        event_action := jsonb_build_object(
          'type', 'open_track_session',
          'href', planning_href,
          'scheduleItemId', schedule_item_id
        );
      end if;
    end if;

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
          'placement', 'viewer_local_noon',
          'blocksAvailability', false
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

    event_education_level := coalesce(
      item_branch -> 'educationLevel',
      course_projection #> '{academicTrack,educationLevel}',
      course_education_level
    );
    education_code := public.calendar_education_level_code(
      event_education_level ->> 'name',
      event_education_level ->> 'slug'
    );
    event_education_level := event_education_level || jsonb_build_object(
      'code', nullif(education_code, '')
    );
    event_subject := coalesce(
      nullif(item_branch #>> '{subject,name}', ''),
      course_record.subject_name
    );
    event_track := coalesce(
      nullif(item_branch #>> '{track,name}', ''),
      course_record.focus_name
    );

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
      'detail', coalesce(
        nullif(item_branch ->> 'displayLabel', ''),
        coverage_label
      ),
      'courseId', course_record.course_id,
      'classroomId', course_record.classroom_id,
      'courseTitle', course_record.course_title,
      'scheduleItemId', schedule_item_id,
      'tutor', jsonb_build_object(
        'id', course_record.tutor_id,
        'name', course_record.tutor_name
      ),
      'subject', event_subject,
      'focus', event_track,
      'educationLevel', event_education_level,
      'colorKey', course_record.color_key,
      'status', timeline_row ->> 'status',
      'nonDeliveryReason', timeline_row ->> 'nonDeliveryReason',
      'presentationColorSource', case
        when module_key is null then 'event_kind'
        else 'module'
      end,
      'modulePresentation', case
        when module_key is null then null
        else jsonb_build_object(
          'key', module_key,
          'title', module_title,
          'headerColor', coalesce(
            nullif(module_style ->> 'headerColor', ''),
            '#5fae63'
          ),
          'rowColor', coalesce(
            nullif(module_style ->> 'stripeColor', ''),
            '#dcefdc'
          )
        )
      end,
      'calendarPresentation', calendar_presentation,
      'action', event_action
    );
    calendar_events := calendar_events
      || jsonb_build_array(jsonb_strip_nulls(event_payload));
  end loop;

  for assignment_record in
    select
      assignment.id,
      assignment.course_title as assignment_title,
      assignment.schedule_snapshot,
      coalesce(
        nullif(assignment.schedule_snapshot ->> 'endDate', '')::date,
        session.end_date
      ) as due_date
    from public.course_assignments assignment
    join public.learning_schedule_sessions session
      on session.id = assignment.schedule_session_id
    join public.learning_schedules legacy_schedule
      on legacy_schedule.id = session.schedule_id
    where coalesce(
        assignment.course_id,
        legacy_schedule.student_course_id
      ) = course_record.course_id
      and assignment.student_id = course_record.student_id
      and assignment.status <> 'cancelled'
      and coalesce(
        nullif(assignment.schedule_snapshot ->> 'endDate', '')::date,
        session.end_date
      ) between p_range_start and p_range_end
    order by
      coalesce(
        nullif(assignment.schedule_snapshot ->> 'endDate', '')::date,
        session.end_date
      ),
      lower(assignment.course_title),
      assignment.id
  loop
    calendar_events := calendar_events || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'assignment:' || assignment_record.id::text,
        'kind', 'assignment_due',
        'eventCode', 'AD',
        'eventLabel', 'Assignment due',
        'startsOn', assignment_record.due_date,
        'endsOn', assignment_record.due_date,
        'title', assignment_record.assignment_title,
        'detail', coalesce(
          nullif(assignment_record.schedule_snapshot ->> 'sessionTitle', ''),
          course_record.course_title
        ),
        'courseId', course_record.course_id,
        'classroomId', course_record.classroom_id,
        'courseTitle', course_record.course_title,
        'tutor', jsonb_build_object(
          'id', course_record.tutor_id,
          'name', course_record.tutor_name
        ),
        'subject', course_record.subject_name,
        'focus', course_record.focus_name,
        'educationLevel', course_education_level,
        'colorKey', course_record.color_key,
        'presentationColorSource', 'event_kind',
        'calendarPresentation', jsonb_build_object(
          'sourceKind', 'assignment_deadline',
          'isDateOnly', true,
          'effectiveDate', assignment_record.due_date,
          'displayAnchor',
            (assignment_record.due_date + time '12:00')
              at time zone viewer_time_zone,
          'displayLocalTime', '12:00',
          'displayTimeZone', viewer_time_zone,
          'placement', 'viewer_local_noon',
          'blocksAvailability', false
        ),
        'action', jsonb_build_object(
          'type', 'open_practice',
          'assignmentId', assignment_record.id
        )
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
  into calendar_events
  from jsonb_array_elements(calendar_events) event;

  return jsonb_build_object(
    'schemaVersion', 3,
    'contract', jsonb_build_object(
      'name', 'classroom_calendar_read',
      'phase', '5.H',
      'version', 1,
      'scope', 'classroom',
      'classroomId', course_record.classroom_id,
      'scheduleAuthority', 'course_schedule_read',
      'assignmentAuthority', 'course_assignments.schedule_snapshot',
      'legacyScheduleMirrorAuthoritative', false,
      'directEventDestinations', true,
      'moduleColorPresentation', true,
      'roleAwareClassroomAccess', true,
      'failureMode', 'atomic'
    ),
    'viewer', jsonb_build_object(
      'membershipRole', course_record.membership_role,
      'canRequestLesson', course_record.membership_role = 'student'
    ),
    'range', jsonb_build_object(
      'startDate', p_range_start,
      'endDate', p_range_end,
      'timeZone', viewer_time_zone
    ),
    'events', calendar_events,
    'availabilityOverlay', jsonb_build_object(
      'status', 'contract_only_phase_10',
      'eligibleContexts', case
        when course_record.membership_role = 'student' then jsonb_build_array(
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
            'educationLevel', course_education_level,
            'colorKey', course_record.color_key
          )
        )
        else '[]'::jsonb
      end
    ),
    'calendarPolicy', jsonb_build_object(
      'dateOnlyDisplayAnchor', 'viewer_local_noon',
      'dateOnlyDisplayIsPresentationOnly', true,
      'dateOnlyItemsBlockAvailability', false,
      'assignmentDeadlinesAreIndependent', true,
      'assignmentDeadlineChangesMoveMeetings', false,
      'canonicalFailureIsAtomic', true,
      'legacyScheduleFallback', false,
      'classroomCourseFilter', true,
      'availabilityTutorScope', 'assigned_classroom_tutor'
    ),
    'featureStatus', jsonb_build_object(
      'calendarProjection', 'active_phase_5h_classroom',
      'scheduledClasses', 'canonical_academic_opportunities',
      'availabilitySlots', 'contract_only_phase_10',
      'lessonRequests', 'pending_phase_10',
      'bookingConcurrency', 'pending_phase_10'
    )
  );
end;
$$;

revoke all on function public.get_my_classroom_calendar(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.get_my_classroom_calendar(uuid, date, date)
  to authenticated;

comment on function public.get_my_classroom_calendar(uuid, date, date) is
  'Role-aware Phase 5.H Classroom Calendar for active Student, Tutor, and Mentor members. It is Course-scoped, uses canonical Schedule authority, and reserves lesson-request authority for the Student.';
