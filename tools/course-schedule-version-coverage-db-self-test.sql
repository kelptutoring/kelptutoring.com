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
  \echo 'The Phase 5.G.2.4.2 actors are not provisioned.'
  \quit 3
\endif

begin;
select set_config('test.coverage_mentor_id', :'mentor_id', false);
select set_config('test.coverage_tutor_id', :'tutor_id', false);
select set_config('test.coverage_student_id', :'student_a_id', false);
select set_config('test.coverage_outsider_id', :'outsider_id', false);

do $all_retained_versions_are_covered$
begin
  if (
    select count(*) from public.course_schedule_version_coverages
  ) <> (
    select count(*) from public.course_schedule_versions
  ) then
    raise exception 'The retained Schedule Version coverage backfill is incomplete.';
  end if;

  if exists (
    select 1
    from public.course_schedule_version_coverages coverage
    where coverage.provenance = 'legacy_course_scope'
      and (
        coverage.metadata ->> 'sourceSubjectNodeId' is null
        or coverage.metadata ->> 'sourceFocusNodeId' is null
        or coverage.primary_track_key is distinct from
          coverage.metadata ->> 'sourceFocusNodeId'
        or coverage.coverage_snapshot ->> 'primaryTrackKey' is distinct from
          coverage.metadata ->> 'sourceFocusNodeId'
        or jsonb_array_length(coverage.coverage_snapshot -> 'branches') <> 1
        or coverage.coverage_snapshot #>> '{branches,0,role}' <> 'primary'
        or coverage.coverage_snapshot #>> '{branches,0,subject,nodeId}'
          is distinct from coverage.metadata ->> 'sourceSubjectNodeId'
        or coverage.coverage_snapshot #>> '{branches,0,track,nodeId}'
          is distinct from coverage.metadata ->> 'sourceFocusNodeId'
        or jsonb_array_length(
          coverage.coverage_snapshot #> '{branches,0,goals}'
        ) <> 0
      )
  ) then
    raise exception 'An existing single-focus Course received invented or invalid Version coverage.';
  end if;
end;
$all_retained_versions_are_covered$;

do $selected_goal_hierarchy_is_valid$
declare
  snapshot jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'primaryTrackKey', '10000000-0000-4000-8000-000000000032',
    'branches', jsonb_build_array(
      jsonb_build_object(
        'branchKey', 'mechanics',
        'role', 'primary',
        'educationLevel', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000001',
          'key', 'high-school',
          'name', 'High School',
          'slug', 'high-school'
        ),
        'goals', jsonb_build_array(
          jsonb_build_object('key', 'ap', 'name', 'AP', 'slug', 'ap'),
          jsonb_build_object('key', 'sat', 'name', 'SAT', 'slug', 'sat')
        ),
        'subject', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000013',
          'key', 'physics',
          'name', 'Physics',
          'slug', 'physics'
        ),
        'track', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000032',
          'key', '10000000-0000-4000-8000-000000000032',
          'name', 'Mechanics',
          'slug', 'mechanics'
        )
      ),
      jsonb_build_object(
        'branchKey', 'algebra-1',
        'role', 'supporting',
        'educationLevel', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000001',
          'key', 'high-school',
          'name', 'High School',
          'slug', 'high-school'
        ),
        'goals', jsonb_build_array(
          jsonb_build_object('key', 'ap', 'name', 'AP', 'slug', 'ap')
        ),
        'subject', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000012',
          'key', 'mathematics',
          'name', 'Mathematics',
          'slug', 'mathematics'
        ),
        'track', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000031',
          'key', '10000000-0000-4000-8000-000000000031',
          'name', 'Algebra 1',
          'slug', 'algebra-1'
        )
      )
    )
  );
begin
  if not public.course_schedule_coverage_snapshot_is_valid(
    snapshot,
    '10000000-0000-4000-8000-000000000032'
  ) then
    raise exception 'A valid multi-Subject Goal hierarchy was rejected.';
  end if;
  if public.course_schedule_coverage_display_label(snapshot)
      <> 'High School · AP + SAT · Physics + Mathematics'
    or public.course_schedule_coverage_display_label(snapshot) ~ 'ACT|IB' then
    raise exception 'The coverage label did not preserve only the selected Goals.';
  end if;

  if public.course_schedule_coverage_snapshot_is_valid(
    jsonb_set(
      snapshot,
      '{branches,1,role}',
      '"primary"'::jsonb
    ),
    '10000000-0000-4000-8000-000000000032'
  ) then
    raise exception 'Coverage accepted more than one primary Track.';
  end if;
end;
$selected_goal_hierarchy_is_valid$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.G.2.4.2 version coverage',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5g242-db-schedule-v1',
    'name', 'Version coverage Schedule',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5g242-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 10,
        'endDate', current_date + 10
      ),
      jsonb_build_object(
        'id', 'phase5g242-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 20,
        'endDate', current_date + 20
      )
    )
  ),
  'phase5g242-db-course'
) ->> 'id') as coverage_course_id \gset

select active_schedule_version_id as coverage_v1_id
from public.student_courses
where id = :'coverage_course_id'::uuid \gset
select set_config('test.coverage_course_id', :'coverage_course_id', false);
select set_config('test.coverage_v1_id', :'coverage_v1_id', false);

do $initial_version_received_legacy_coverage$
begin
  if not exists (
    select 1
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = current_setting('test.coverage_v1_id')::uuid
      and coverage.provenance = 'legacy_course_scope'
      and coverage.primary_track_key = '10000000-0000-4000-8000-000000000032'
      and jsonb_array_length(
        coverage.coverage_snapshot #> '{branches,0,goals}'
      ) = 0
  ) then
    raise exception 'A newly created version did not receive its initial single-focus coverage.';
  end if;
end;
$initial_version_received_legacy_coverage$;

select public.publish_course_schedule_version(
  :'coverage_course_id'::uuid,
  :'coverage_v1_id'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5g242-motion',
      'title', 'Motion foundations',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 10,
      'endDate', current_date + 10,
      'position', 0,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5g242-forces',
      'title', 'Forces and interactions',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 24,
      'endDate', current_date + 24,
      'position', 1,
      'state', 'scheduled'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'reordered',
    'stableItemKey', 'phase5g242-forces',
    'reasonCode', 'pacing_adjustment',
    'studentExplanation', 'Forces moved to the next eligible meeting.'
  )),
  'phase5g242-db-successor'
);

select active_schedule_version_id as coverage_v2_id
from public.student_courses
where id = :'coverage_course_id'::uuid \gset
select set_config('test.coverage_v2_id', :'coverage_v2_id', false);

reset role;
do $successor_inherited_exact_coverage$
begin
  if not exists (
    select 1
    from public.course_schedule_version_coverages successor
    join public.course_schedule_version_coverages previous
      on previous.version_id = current_setting('test.coverage_v1_id')::uuid
    where successor.version_id = current_setting('test.coverage_v2_id')::uuid
      and successor.provenance = 'inherited'
      and successor.primary_track_key = previous.primary_track_key
      and successor.coverage_snapshot = previous.coverage_snapshot
      and successor.display_label = previous.display_label
      and successor.metadata ->> 'previousVersionId'
        = current_setting('test.coverage_v1_id')
  ) then
    raise exception 'A successor Version did not inherit the exact immutable coverage snapshot.';
  end if;

  begin
    update public.course_schedule_version_coverages
    set provenance = 'selected'
    where version_id = current_setting('test.coverage_v1_id')::uuid;
    raise exception 'Expected immutable Version coverage mutation to fail.';
  exception when others then
    if sqlerrm = 'Expected immutable Version coverage mutation to fail.' then raise; end if;
    if sqlerrm not like '%coverage is immutable%' then raise; end if;
  end;
end;
$successor_inherited_exact_coverage$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_reads_only_active_coverage$
begin
  if (
      select count(*)
      from public.course_schedule_version_coverages
      where version_id in (
        current_setting('test.coverage_v1_id')::uuid,
        current_setting('test.coverage_v2_id')::uuid
      )
    ) <> 1
    or not exists (
      select 1 from public.course_schedule_version_coverages
      where version_id = current_setting('test.coverage_v2_id')::uuid
    ) then
    raise exception 'The Student received stale Version coverage history.';
  end if;
end;
$student_reads_only_active_coverage$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $assigned_tutor_reads_coverage_history$
begin
  if (
    select count(*)
    from public.course_schedule_version_coverages
    where version_id in (
      current_setting('test.coverage_v1_id')::uuid,
      current_setting('test.coverage_v2_id')::uuid
    )
  ) <> 2 then
    raise exception 'The assigned Tutor cannot read Version coverage history.';
  end if;
end;
$assigned_tutor_reads_coverage_history$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $supervising_mentor_reads_coverage_history$
begin
  if (
    select count(*)
    from public.course_schedule_version_coverages
    where version_id in (
      current_setting('test.coverage_v1_id')::uuid,
      current_setting('test.coverage_v2_id')::uuid
    )
  ) <> 2 then
    raise exception 'The supervising Mentor cannot read Version coverage history.';
  end if;
end;
$supervising_mentor_reads_coverage_history$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_cannot_read_coverage$
begin
  if exists (
    select 1
    from public.course_schedule_version_coverages
    where version_id in (
      current_setting('test.coverage_v1_id')::uuid,
      current_setting('test.coverage_v2_id')::uuid
    )
  ) then
    raise exception 'An unrelated account received private Version coverage.';
  end if;
end;
$outsider_cannot_read_coverage$;

reset role;
rollback;
