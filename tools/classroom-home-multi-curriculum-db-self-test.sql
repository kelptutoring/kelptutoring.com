\set ON_ERROR_STOP on

\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?student_a_id}
\else
  \echo 'Missing required actor variable: student_a_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select case when (
  select count(distinct profile.id)
  from public.profiles profile
  where profile.id in (
    :'mentor_id'::uuid,
    :'tutor_id'::uuid,
    :'student_a_id'::uuid,
    :'outsider_id'::uuid
  )
) = 4 then 1 else 0 end as actors_ready \gset

\if :actors_ready
\else
  \echo 'The Phase 5.G.2.4.5.2 actors are not provisioned.'
  \quit 3
\endif

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.G.2.4.5.2 Classroom Home',
  'kelp',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5g2452-db-schedule',
    'name', 'Classroom Home Schedule',
    'timeZone', 'UTC',
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', 'phase5g2452-db-topic',
      'title', 'Classroom Home next-week topic',
      'startDate', current_date + 7,
      'endDate', current_date + 7
    ))
  ),
  'phase5g2452-db-course'
) ->> 'id') as classroom_home_course_id \gset

select public.activate_student_course(:'classroom_home_course_id'::uuid);

reset role;
select schedule.id as classroom_home_legacy_schedule_id
from public.learning_schedules schedule
where schedule.student_course_id = :'classroom_home_course_id'::uuid
order by schedule.created_at, schedule.id
limit 1 \gset

insert into public.learning_schedule_sessions (
  schedule_id,
  source_key,
  title,
  scheduled_date,
  end_date,
  position,
  status,
  source_snapshot
) values (
  :'classroom_home_legacy_schedule_id'::uuid,
  'phase5g2452-db-assignment-session',
  'Classroom Home assignment source',
  current_date - extract(dow from current_date)::integer + 2,
  current_date - extract(dow from current_date)::integer + 2,
  50,
  'active',
  '{}'::jsonb
)
returning id as classroom_home_assignment_session_id \gset

insert into public.course_assignments (
  course_id,
  assigned_by,
  student_id,
  schedule_session_id,
  status,
  course_title,
  course_description,
  curriculum_path_snapshot,
  schedule_snapshot,
  question_count,
  total_points
) values (
  null,
  :'mentor_id'::uuid,
  :'student_a_id'::uuid,
  :'classroom_home_assignment_session_id'::uuid,
  'assigned',
  'Classroom Home assignment',
  'Independent Assignment deadline',
  '[]'::jsonb,
  jsonb_build_object(
    'sessionTitle', 'Classroom Home assignment source',
    'endDate',
      current_date - extract(dow from current_date)::integer + 2
  ),
  1,
  10
)
returning id as classroom_home_assignment_id \gset

select set_config(
  'test.classroom_home_course_id',
  :'classroom_home_course_id',
  false
);
select set_config(
  'test.classroom_home_assignment_id',
  :'classroom_home_assignment_id',
  false
);

do $classroom_home_only_projects_pending_work$
declare
  work_date date :=
    current_date - extract(dow from current_date)::integer + 3;
  projection jsonb;
begin
  projection := public.project_course_schedule_classroom_home(
    current_setting('test.classroom_home_course_id')::uuid,
    jsonb_build_object(
      'schedule', jsonb_build_object(
        'activeVersionId', gen_random_uuid(),
        'timeZone', 'UTC'
      ),
      'academicTrack', jsonb_build_object(
        'coverage', jsonb_build_object(
          'displayLabel', 'Pending-work test',
          'branchCount', 1,
          'branches', '[]'::jsonb
        ),
        'courseProgress', '{}'::jsonb,
        'items', jsonb_build_array(
          jsonb_build_object(
            'scheduleItemId', 'studied-home-item',
            'title', 'Already studied',
            'kind', 'curriculum_topic',
            'state', 'scheduled',
            'effectiveDate', work_date,
            'sequenceState', 'studied',
            'progress', jsonb_build_object(
              'studied', jsonb_build_object('state', 'marked')
            )
          ),
          jsonb_build_object(
            'scheduleItemId', 'pending-home-item',
            'title', 'Still pending',
            'kind', 'curriculum_topic',
            'state', 'scheduled',
            'effectiveDate', work_date,
            'sequenceState', 'next',
            'presentation', jsonb_build_object(
              'moduleTitle', 'Module 1: Foundations',
              'modulePresentationKey', 'branch:test:m:module-1'
            ),
            'progress', jsonb_build_object(
              'studied', jsonb_build_object('state', 'unmarked')
            )
          )
        )
      )
    ),
    clock_timestamp()
  );

  if exists (
    select 1
    from jsonb_array_elements(
      projection #> '{thisWeek,items}'
    ) work(item)
    where work.item ->> 'id' = 'schedule:studied-home-item'
  ) or not exists (
    select 1
    from jsonb_array_elements(
      projection #> '{thisWeek,items}'
    ) work(item)
    where work.item ->> 'id' = 'schedule:pending-home-item'
      and work.item ->> 'modulePresentationKey'
        = 'branch:test:m:module-1'
  ) then
    raise exception
      'Classroom Home did not isolate pending work with its module presentation identity.';
  end if;
end;
$classroom_home_only_projects_pending_work$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);

do $classroom_home_is_active_version_and_assignment_aware$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.classroom_home_course_id')::uuid
  );
  home jsonb := projection -> 'classroomHome';
begin
  if projection #>> '{featureStatus,classroomHomeMultiCurriculum}'
      <> 'active_phase_5g2_4_5_2'
    or home #>> '{courseProgress,label}' <> 'Course progress'
    or home #>> '{historyPolicy,activeVersionOnly}' <> 'true'
    or home #>> '{historyPolicy,ordinaryAdjustmentsRetainContinuingProgress}'
      <> 'true'
    or home #>> '{historyPolicy,fullReplacementProgressLocation}'
      <> 'schedule_history'
    or home #>> '{historyPolicy,assignmentsMoveIndependently}' <> 'true'
    or home #>> '{coverage,displayLabel}'
      <> projection #>> '{academicTrack,coverage,displayLabel}'
    or not exists (
      select 1
      from jsonb_array_elements(home #> '{thisWeek,items}') work(item)
      where work.item ->> 'id' =
        'assignment:' || current_setting('test.classroom_home_assignment_id')
        and work.item #>> '{action,type}' = 'open_practice'
    )
    or not exists (
      select 1
      from jsonb_array_elements(home #> '{comingNext,items}') work(item)
      where work.item ->> 'id' like 'schedule:%'
        and work.item #>> '{action,type}' in (
          'open_track_session',
          'open_schedule'
        )
    )
  then
    raise exception 'The canonical Classroom Home projection is incomplete.';
  end if;
end;
$classroom_home_is_active_version_and_assignment_aware$;

select projection #>>
  '{academicTrack,items,0,presentation,modulePresentationKey}'
  as classroom_home_module_presentation_key
from (
  select public.get_my_unified_course_schedule(
    :'classroom_home_course_id'::uuid
  ) as projection
) source \gset

select public.save_my_classroom_schedule_module_style(
  :'classroom_home_course_id'::uuid,
  :'classroom_home_module_presentation_key',
  '#90caf9',
  '#bbdefb',
  'Blue'
);

select projection #>>
  '{academicTrack,items,0,presentation,moduleKey}'
  as classroom_home_source_module_key
from (
  select public.get_my_unified_course_schedule(
    :'classroom_home_course_id'::uuid
  ) as projection
) source \gset

select set_config(
  'test.classroom_home_source_module_key',
  :'classroom_home_source_module_key',
  false
);

select public.save_my_classroom_schedule_module_style(
  :'classroom_home_course_id'::uuid,
  :'classroom_home_source_module_key',
  '#9575cd',
  '#d1c4e9',
  'Violet'
);

do $track_qualified_module_color_is_returned$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.classroom_home_course_id')::uuid
  );
  qualified_key text :=
    projection #>>
      '{academicTrack,items,0,presentation,modulePresentationKey}';
begin
  if qualified_key is null
    or projection #>> array[
      'academicTrack',
      'moduleStyles',
      qualified_key,
      'headerColor'
    ] <> '#9575cd'
    or projection #>> array[
      'academicTrack',
      'moduleStyles',
      qualified_key,
      'stripeColor'
    ] <> '#d1c4e9'
    or (
      projection #> '{academicTrack,moduleStyles}'
    ) ? current_setting('test.classroom_home_source_module_key')
  then
    raise exception 'Track-qualified module colors or raw-key compatibility were not isolated.';
  end if;
end;
$track_qualified_module_color_is_returned$;

reset role;
select classroom.id as classroom_home_layout_classroom_id
from public.classrooms classroom
where classroom.course_id =
  current_setting('test.classroom_home_course_id')::uuid
order by classroom.created_at, classroom.id
limit 1
\gset

delete from public.classroom_home_preferences
where user_id = :'student_a_id'::uuid
  and classroom_id = :'classroom_home_layout_classroom_id'::uuid;

select set_config(
  'test.classroom_home_layout_classroom_id',
  :'classroom_home_layout_classroom_id',
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);

do $classroom_home_layout_defaults$
declare
  payload jsonb := public.get_my_classroom_home_preferences(
    current_setting('test.classroom_home_layout_classroom_id')::uuid
  );
begin
  if payload #> '{blockOrder}'
      <> '["progress","this-week","coming-next","calendar"]'::jsonb
    or payload #> '{collapsedBlocks}' <> '[]'::jsonb
    or payload #>> '{revision}' <> '1'
  then
    raise exception 'Classroom Home preferences did not return server defaults.';
  end if;
end;
$classroom_home_layout_defaults$;

select public.save_my_classroom_home_preferences(
  :'classroom_home_layout_classroom_id'::uuid,
  jsonb_build_object(
    'blockOrder', jsonb_build_array(
      'calendar', 'progress', 'coming-next', 'this-week'
    ),
    'collapsedBlocks', jsonb_build_array('progress', 'coming-next')
  )
);

do $classroom_home_layout_round_trip$
declare
  payload jsonb := public.get_my_classroom_home_preferences(
    current_setting('test.classroom_home_layout_classroom_id')::uuid
  );
begin
  if payload #> '{blockOrder}'
      <> '["calendar","progress","coming-next","this-week"]'::jsonb
    or payload #> '{collapsedBlocks}'
      <> '["progress","coming-next"]'::jsonb
  then
    raise exception 'Classroom Home preferences did not round-trip.';
  end if;
end;
$classroom_home_layout_round_trip$;

do $classroom_home_layout_invalid_order$
begin
  begin
    perform public.save_my_classroom_home_preferences(
      current_setting('test.classroom_home_layout_classroom_id')::uuid,
      '{"blockOrder":["progress","progress","coming-next","calendar"]}'::jsonb
    );
    raise exception 'Expected invalid Classroom Home order rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected invalid Classroom Home order rejection was not raised.' then
      raise;
    end if;
  end;
end;
$classroom_home_layout_invalid_order$;

do $classroom_home_layout_invalid_collapsed$
begin
  begin
    perform public.save_my_classroom_home_preferences(
      current_setting('test.classroom_home_layout_classroom_id')::uuid,
      '{"collapsedBlocks":["calendar","calendar"]}'::jsonb
    );
    raise exception 'Expected duplicate collapsed Classroom Home block rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected duplicate collapsed Classroom Home block rejection was not raised.' then
      raise;
    end if;
  end;
end;
$classroom_home_layout_invalid_collapsed$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $classroom_home_layout_tutor_denial$
begin
  begin
    perform public.get_my_classroom_home_preferences(
      current_setting('test.classroom_home_layout_classroom_id')::uuid
    );
    raise exception 'Expected Tutor Classroom Home preference denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected Tutor Classroom Home preference denial was not raised.' then
      raise;
    end if;
  end;
end;
$classroom_home_layout_tutor_denial$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $classroom_home_layout_outsider_denial$
begin
  begin
    perform public.get_my_classroom_home_preferences(
      current_setting('test.classroom_home_layout_classroom_id')::uuid
    );
    raise exception 'Expected outsider Classroom Home preference denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom Home preference denial was not raised.' then
      raise;
    end if;
  end;
end;
$classroom_home_layout_outsider_denial$;

do $outsider_cannot_read_classroom_home$
begin
  perform public.get_my_unified_course_schedule(
    current_setting('test.classroom_home_course_id')::uuid
  );
  raise exception 'An outsider read the multi-curriculum Classroom Home.';
exception
  when others then
    if sqlerrm = 'An outsider read the multi-curriculum Classroom Home.' then
      raise;
    end if;
end;
$outsider_cannot_read_classroom_home$;

rollback;
