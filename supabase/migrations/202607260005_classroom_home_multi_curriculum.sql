-- Phase 5.G.2.4.5.2: make the Classroom Home an active-Version,
-- multi-curriculum consumer of the authoritative Course Schedule.
--
-- The Home projection deliberately keeps Assignment deadlines independent
-- from academic Schedule movement. A fully replaced Schedule therefore
-- disappears from the active Home while remaining available through retained
-- Schedule history.

create or replace function public.project_course_schedule_member_module_styles(
  p_items jsonb,
  p_module_styles jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  source_item jsonb;
  source_module_key text;
  presentation_key text;
  style_payload jsonb;
  projected_styles jsonb := coalesce(p_module_styles, '{}'::jsonb);
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(projected_styles) <> 'object'
  then
    raise exception 'The member Schedule presentation payload is invalid.';
  end if;

  for source_item in
    select item_entry.value
    from jsonb_array_elements(p_items) item_entry(value)
  loop
    source_module_key := coalesce(
      nullif(btrim(source_item #>> '{presentation,moduleKey}'), ''),
      nullif(btrim(source_item #>> '{source,moduleKey}'), ''),
      nullif(btrim(source_item ->> 'moduleKey'), ''),
      'course-plan'
    );
    presentation_key := coalesce(
      nullif(
        btrim(source_item #>> '{presentation,modulePresentationKey}'),
        ''
      ),
      source_module_key
    );
    style_payload := coalesce(
      projected_styles -> presentation_key,
      projected_styles -> source_module_key
    );
    if style_payload is not null then
      projected_styles := jsonb_set(
        projected_styles,
        array[presentation_key],
        style_payload,
        true
      );
    end if;
  end loop;

  return projected_styles;
end;
$$;

create or replace function public.project_course_schedule_classroom_home(
  p_course_id uuid,
  p_payload jsonb,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  viewer_time_zone text := coalesce(
    nullif(p_payload #>> '{schedule,timeZone}', ''),
    'UTC'
  );
  viewer_date date;
  this_week_start date;
  this_week_end date;
  next_week_start date;
  next_week_end date;
  this_week_items jsonb;
  coming_next_items jsonb;
  coverage jsonb := coalesce(
    p_payload #> '{academicTrack,coverage}',
    '{}'::jsonb
  );
  course_progress jsonb := coalesce(
    p_payload #> '{academicTrack,courseProgress}',
    '{}'::jsonb
  );
begin
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'The canonical Course Schedule payload is invalid.';
  end if;
  if nullif(p_payload #>> '{schedule,activeVersionId}', '') is null then
    raise exception 'The Classroom Home requires an active Schedule Version.';
  end if;

  begin
    viewer_date := (p_as_of at time zone viewer_time_zone)::date;
  exception when invalid_parameter_value then
    viewer_time_zone := 'UTC';
    viewer_date := (p_as_of at time zone viewer_time_zone)::date;
  end;
  this_week_start :=
    viewer_date - extract(dow from viewer_date)::integer;
  this_week_end := this_week_start + 6;
  next_week_start := this_week_end + 1;
  next_week_end := next_week_start + 6;

  with schedule_work as (
    select
      nullif(item.value ->> 'effectiveDate', '')::date as work_date,
      10 as sort_priority,
      lower(coalesce(item.value ->> 'title', '')) as sort_title,
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'schedule:' || (item.value ->> 'scheduleItemId'),
        'kind', coalesce(item.value ->> 'kind', 'curriculum_topic'),
        'date', nullif(item.value ->> 'effectiveDate', '')::date,
        'dateLabel', case
          when item.value ->> 'kind' = 'exam' then 'Exam'
          when item.value ->> 'kind' = 'review' then 'Review'
          when item.value ->> 'kind' = 'wrap_up' then 'Wrap-up'
          else 'Scheduled'
        end,
        'title', item.value ->> 'title',
        'status', item.value ->> 'sequenceState',
        'academicPath',
          item.value #>> '{academicBranch,displayLabel}',
        'moduleTitle',
          coalesce(
            nullif(item.value #>> '{presentation,moduleTitle}', ''),
            nullif(item.value #>> '{source,moduleTitle}', '')
          ),
        'progress', item.value -> 'progress',
        'action', case
          when nullif(btrim(coalesce(item.value ->> 'planningHref', '')), '')
            is not null
          then jsonb_build_object(
            'type', 'open_track_session',
            'href', item.value ->> 'planningHref'
          )
          else jsonb_build_object('type', 'open_schedule')
        end
      )) as work_item
    from jsonb_array_elements(
      coalesce(p_payload #> '{academicTrack,items}', '[]'::jsonb)
    ) item(value)
    where nullif(item.value ->> 'effectiveDate', '') is not null
      and (item.value ->> 'effectiveDate')
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and coalesce(item.value ->> 'state', 'scheduled') <> 'dropped'
  ),
  assignment_work as (
    select
      coalesce(
        nullif(assignment.schedule_snapshot ->> 'endDate', '')::date,
        session.end_date
      ) as work_date,
      20 as sort_priority,
      lower(assignment.course_title) as sort_title,
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'assignment:' || assignment.id::text,
        'kind', 'assignment_due',
        'date', coalesce(
          nullif(assignment.schedule_snapshot ->> 'endDate', '')::date,
          session.end_date
        ),
        'dateLabel', 'Due',
        'title', assignment.course_title,
        'status', assignment.status,
        'academicPath', coalesce(
          nullif(assignment.schedule_snapshot ->> 'academicPath', ''),
          nullif(assignment.schedule_snapshot ->> 'curriculumPath', '')
        ),
        'moduleTitle',
          nullif(assignment.schedule_snapshot ->> 'moduleTitle', ''),
        'detail', coalesce(
          nullif(assignment.schedule_snapshot ->> 'sessionTitle', ''),
          nullif(assignment.course_description, '')
        ),
        'action', jsonb_build_object(
          'type', 'open_practice',
          'assignmentId', assignment.id
        )
      )) as work_item
    from public.course_assignments assignment
    join public.learning_schedule_sessions session
      on session.id = assignment.schedule_session_id
    join public.learning_schedules legacy_schedule
      on legacy_schedule.id = session.schedule_id
    where legacy_schedule.student_course_id = p_course_id
      and assignment.status = 'assigned'
  ),
  all_work as (
    select * from schedule_work
    union all
    select * from assignment_work
  )
  select
    coalesce(jsonb_agg(work_item order by
      work_date,
      sort_priority,
      sort_title,
      work_item ->> 'id'
    ) filter (
      where work_date between this_week_start and this_week_end
    ), '[]'::jsonb),
    coalesce(jsonb_agg(work_item order by
      work_date,
      sort_priority,
      sort_title,
      work_item ->> 'id'
    ) filter (
      where work_date between next_week_start and next_week_end
    ), '[]'::jsonb)
  into this_week_items, coming_next_items
  from all_work;

  return jsonb_build_object(
    'schemaVersion', 1,
    'label', 'Classroom Home',
    'timeZone', viewer_time_zone,
    'coverage', jsonb_build_object(
      'displayLabel', coverage ->> 'displayLabel',
      'branchCount', coalesce(
        nullif(coverage ->> 'branchCount', '')::integer,
        0
      ),
      'branches', coalesce(coverage -> 'branches', '[]'::jsonb)
    ),
    'courseProgress', course_progress,
    'thisWeek', jsonb_build_object(
      'startsOn', this_week_start,
      'endsOn', this_week_end,
      'items', this_week_items
    ),
    'comingNext', jsonb_build_object(
      'startsOn', next_week_start,
      'endsOn', next_week_end,
      'items', coming_next_items
    ),
    'historyPolicy', jsonb_build_object(
      'activeVersionOnly', true,
      'ordinaryAdjustmentsRetainContinuingProgress', true,
      'fullReplacementProgressLocation', 'schedule_history',
      'assignmentsMoveIndependently', true
    )
  );
exception when invalid_text_representation then
  raise exception 'The Classroom Home contains an invalid academic date.';
end;
$$;

alter function public.get_my_unified_course_schedule(uuid)
  rename to get_my_unified_course_schedule_phase5g2_4_5_2_base;

create or replace function public.get_my_unified_course_schedule(
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
  member_module_styles jsonb;
begin
  payload :=
    public.get_my_unified_course_schedule_phase5g2_4_5_2_base(p_course_id);

  member_module_styles :=
    public.project_course_schedule_member_module_styles(
      coalesce(payload #> '{academicTrack,items}', '[]'::jsonb),
      coalesce(payload #> '{academicTrack,moduleStyles}', '{}'::jsonb)
    );
  payload := jsonb_set(
    payload,
    '{academicTrack,moduleStyles}',
    member_module_styles,
    true
  );
  payload := jsonb_set(
    payload,
    '{classroomHome}',
    public.project_course_schedule_classroom_home(
      p_course_id,
      payload,
      clock_timestamp()
    ),
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus,classroomHomeMultiCurriculum}',
    to_jsonb('active_phase_5g2_4_5_2'::text),
    true
  );
  return payload;
end;
$$;

alter function public.save_my_classroom_schedule_module_style(
  uuid, text, text, text, text
) rename to save_my_classroom_schedule_module_style_phase5g2_4_5_2_base;

create or replace function public.save_my_classroom_schedule_module_style(
  p_course_id uuid,
  p_module_key text,
  p_header_color text,
  p_stripe_color text,
  p_template_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  target_classroom_id uuid;
  active_version_id uuid;
  supplied_key text := btrim(coalesce(p_module_key, ''));
  storage_key text;
  header_color text := lower(btrim(coalesce(p_header_color, '')));
  stripe_color text := lower(btrim(coalesce(p_stripe_color, '')));
  template_name text := nullif(btrim(coalesce(p_template_name, '')), '');
  style_payload jsonb;
  matching_qualified_keys text[];
begin
  if caller_id is null then
    raise exception 'Authentication is required to customize a Schedule module.';
  end if;
  if char_length(supplied_key) < 1 or char_length(supplied_key) > 240 then
    raise exception 'The Schedule module identity is invalid.';
  end if;
  if header_color !~ '^#[0-9a-f]{6}$'
    or stripe_color !~ '^#[0-9a-f]{6}$'
  then
    raise exception 'Schedule module colors must use six-digit hexadecimal values.';
  end if;
  if template_name is not null and char_length(template_name) > 80 then
    raise exception 'The Schedule module color label is too long.';
  end if;

  select classroom.id, course.active_schedule_version_id
  into target_classroom_id, active_version_id
  from public.student_courses course
  join public.classrooms classroom on classroom.course_id = course.id
  join public.classroom_memberships membership
    on membership.classroom_id = classroom.id
   and membership.user_id = caller_id
  where course.id = p_course_id
  order by classroom.created_at, classroom.id
  limit 1;

  if target_classroom_id is null or active_version_id is null then
    raise exception 'A retained Classroom Membership is required to customize this Schedule.';
  end if;

  with module_candidates as (
    select distinct
      module_identity.module_key as source_module_key,
      public.course_schedule_module_presentation_key(
        coalesce(branch_identity.branch_context ->> 'branchKey', ''),
        module_identity.module_key
      ) as presentation_key
    from public.course_schedule_items item
    join public.course_schedule_version_coverages coverage
      on coverage.version_id = item.version_id
    cross join lateral (
      select coalesce(
        nullif(btrim(item.source_module_key), ''),
        nullif(btrim(item.source_snapshot ->> 'sourceModuleKey'), ''),
        nullif(btrim(item.source_snapshot ->> 'moduleKey'), ''),
        'course-plan'
      ) as module_key
    ) module_identity
    cross join lateral (
      select coalesce(
        public.course_schedule_consumer_branch_context(
          coverage.coverage_snapshot,
          item.source_snapshot,
          item.curriculum_node_id
        ),
        case
          when jsonb_array_length(
            coverage.coverage_snapshot -> 'branches'
          ) = 1
          then public.course_schedule_consumer_branch_context(
            coverage.coverage_snapshot,
            jsonb_build_object(
              'sourceTrackKey',
              coverage.coverage_snapshot #>> '{branches,0,branchKey}'
            ),
            null
          )
          else null
        end
      ) as branch_context
    ) branch_identity
    where item.version_id = active_version_id
  )
  select array_agg(candidate.presentation_key order by candidate.presentation_key)
  into matching_qualified_keys
  from module_candidates candidate
  where candidate.presentation_key = supplied_key
    or candidate.source_module_key = supplied_key;

  if coalesce(cardinality(matching_qualified_keys), 0) = 0 then
    raise exception 'The selected module is not part of the active Course Schedule.';
  end if;
  if supplied_key not like 'branch:%'
    and supplied_key not like 'course:m:%'
    and cardinality(matching_qualified_keys) > 1
  then
    raise exception 'This module name exists in more than one Track. Refresh the Schedule and choose the Track-specific module.';
  end if;

  storage_key := case
    when supplied_key like 'branch:%' or supplied_key like 'course:m:%'
      then supplied_key
    else matching_qualified_keys[1]
  end;
  style_payload := jsonb_build_object(
    'headerColor', header_color,
    'stripeColor', stripe_color,
    'templateName', coalesce(template_name, 'Custom')
  );

  insert into public.classroom_member_preferences (
    user_id,
    classroom_id,
    schedule_module_styles
  ) values (
    caller_id,
    target_classroom_id,
    jsonb_build_object(storage_key, style_payload)
  )
  on conflict (user_id, classroom_id) do update
  set schedule_module_styles = jsonb_set(
    public.classroom_member_preferences.schedule_module_styles,
    array[storage_key],
    style_payload,
    true
  );

  return public.get_my_effective_course_schedule(p_course_id);
end;
$$;

revoke all on function
  public.get_my_unified_course_schedule_phase5g2_4_5_2_base(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.save_my_classroom_schedule_module_style_phase5g2_4_5_2_base(
    uuid, text, text, text, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.project_course_schedule_member_module_styles(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.project_course_schedule_classroom_home(uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_unified_course_schedule(uuid)
  from public, anon, authenticated;
revoke all on function public.save_my_classroom_schedule_module_style(
  uuid, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.get_my_unified_course_schedule(uuid)
  to authenticated, service_role;
grant execute on function public.save_my_classroom_schedule_module_style(
  uuid, text, text, text, text
) to authenticated, service_role;

comment on function public.project_course_schedule_classroom_home(
  uuid, jsonb, timestamptz
) is
  'Projects active-Version Course progress, current-week academic work, independent Assignment deadlines, and the following week for the multi-curriculum Classroom Home.';
comment on function public.get_my_unified_course_schedule(uuid) is
  'Phase 5.G.2.4.5.2 canonical Course Schedule read contract with active-only multi-curriculum Classroom Home work windows and Track-qualified member module colors.';
comment on function public.save_my_classroom_schedule_module_style(
  uuid, text, text, text, text
) is
  'Stores a member-private Track-qualified module presentation preference; identical Module numbers in different Tracks remain independent.';
