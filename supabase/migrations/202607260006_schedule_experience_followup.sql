-- Schedule experience follow-up:
-- 1. Make every Track exposed by the governed Builder resolvable by publication.
-- 2. Keep completed Schedule work out of Classroom Home pending windows.
-- 3. Carry module presentation identity into Home so member colors remain useful.

with catalog_node (
  id,
  parent_id,
  node_type,
  name,
  slug,
  description,
  sort_order
) as (
  values
    (
      '16000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000012'::uuid,
      'track',
      'Algebra 2',
      'algebra-2',
      'High-school Algebra 2 curriculum.',
      20
    ),
    (
      '16000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000012'::uuid,
      'track',
      'Geometry',
      'geometry',
      'High-school geometry curriculum.',
      30
    ),
    (
      '16000000-0000-4000-8000-000000000003'::uuid,
      '10000000-0000-4000-8000-000000000012'::uuid,
      'track',
      'Trigonometry',
      'trigonometry',
      'High-school trigonometry curriculum.',
      40
    ),
    (
      '16000000-0000-4000-8000-000000000011'::uuid,
      '10000000-0000-4000-8000-000000000023'::uuid,
      'topic',
      'Fluids and thermodynamics',
      'fluids-and-thermodynamics',
      'Fluids, heat, kinetic theory, and thermodynamics.',
      20
    ),
    (
      '16000000-0000-4000-8000-000000000012'::uuid,
      '10000000-0000-4000-8000-000000000023'::uuid,
      'topic',
      'Waves and sound',
      'waves-and-sound',
      'Oscillations, wave behavior, acoustics, and resonance.',
      30
    ),
    (
      '16000000-0000-4000-8000-000000000013'::uuid,
      '10000000-0000-4000-8000-000000000023'::uuid,
      'topic',
      'Optics',
      'optics',
      'Light, reflection, refraction, diffraction, and interference.',
      40
    ),
    (
      '16000000-0000-4000-8000-000000000014'::uuid,
      '10000000-0000-4000-8000-000000000023'::uuid,
      'topic',
      'Electricity and magnetism',
      'electricity-and-magnetism',
      'Electric fields, circuits, magnetism, and induction.',
      50
    ),
    (
      '16000000-0000-4000-8000-000000000015'::uuid,
      '10000000-0000-4000-8000-000000000023'::uuid,
      'topic',
      'Modern, atomic, and nuclear physics',
      'modern-atomic-and-nuclear-physics',
      'Quantum, atomic, nuclear, and particle physics.',
      60
    )
)
insert into public.curriculum_nodes (
  id,
  parent_id,
  node_type,
  name,
  slug,
  description,
  sort_order,
  metadata
)
select
  catalog_node.id,
  catalog_node.parent_id,
  catalog_node.node_type,
  catalog_node.name,
  catalog_node.slug,
  catalog_node.description,
  catalog_node.sort_order,
  jsonb_build_object(
    'seed', true,
    'source', 'tracksCatalog',
    'phase', 'schedule-experience-followup'
  )
from catalog_node
where not exists (
  select 1
  from public.curriculum_nodes existing
  where existing.parent_id = catalog_node.parent_id
    and existing.slug = catalog_node.slug
    and existing.status = 'active'
)
on conflict (id) do nothing;

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
        'modulePresentationKey',
          coalesce(
            nullif(
              item.value #>> '{presentation,modulePresentationKey}',
              ''
            ),
            nullif(item.value #>> '{presentation,moduleKey}', ''),
            nullif(item.value #>> '{source,moduleKey}', ''),
            nullif(item.value ->> 'moduleKey', ''),
            'course-plan'
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
      and lower(coalesce(item.value ->> 'state', 'scheduled')) <> 'dropped'
      and lower(coalesce(item.value ->> 'sequenceState', '')) <> 'studied'
      and lower(coalesce(
        item.value #>> '{progress,studied,state}',
        'unmarked'
      )) <> 'marked'
      and lower(coalesce(
        item.value #>> '{progress,studied,marked}',
        'false'
      )) <> 'true'
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
        'modulePresentationKey',
          coalesce(
            nullif(
              assignment.schedule_snapshot ->> 'modulePresentationKey',
              ''
            ),
            nullif(assignment.schedule_snapshot ->> 'moduleKey', '')
          ),
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

revoke all on function
  public.project_course_schedule_classroom_home(uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

comment on function public.project_course_schedule_classroom_home(
  uuid, jsonb, timestamptz
) is
  'Projects pending active-Version Course work and independent Assignment deadlines with Track-qualified module presentation identity.';
