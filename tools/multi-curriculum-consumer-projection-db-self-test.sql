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
  \echo 'The Phase 5.G.2.4.5.1 actors are not provisioned.'
  \quit 3
\endif

begin;

do $branch_and_module_projection_is_unambiguous$
declare
  coverage jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'primaryTrackKey', 'physics-track',
    'branches', jsonb_build_array(
      jsonb_build_object(
        'branchKey', 'physics-track',
        'role', 'primary',
        'educationLevel', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000001',
          'key', 'high-school',
          'name', 'High School',
          'slug', 'high-school'
        ),
        'goals', jsonb_build_array(jsonb_build_object(
          'key', 'ap',
          'name', 'AP',
          'slug', 'ap'
        )),
        'subject', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000013',
          'key', 'physics',
          'name', 'Physics',
          'slug', 'physics'
        ),
        'track', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000032',
          'key', 'physics-track',
          'name', 'Mechanics',
          'slug', 'mechanics'
        )
      ),
      jsonb_build_object(
        'branchKey', 'mathematics-track',
        'role', 'supporting',
        'educationLevel', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000001',
          'key', 'high-school',
          'name', 'High School',
          'slug', 'high-school'
        ),
        'goals', '[]'::jsonb,
        'subject', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000012',
          'key', 'mathematics',
          'name', 'Mathematics',
          'slug', 'mathematics'
        ),
        'track', jsonb_build_object(
          'nodeId', '10000000-0000-4000-8000-000000000031',
          'key', 'mathematics-track',
          'name', 'Algebra 1',
          'slug', 'algebra-1'
        )
      )
    )
  );
  physics_branch jsonb := public.course_schedule_consumer_branch_context(
    coverage,
    jsonb_build_object(
      'sourceEducationLevelSlug', 'high-school',
      'sourceSubjectSlug', 'physics',
      'sourceTrackSlug', 'mechanics'
    ),
    null
  );
  mathematics_branch jsonb := public.course_schedule_consumer_branch_context(
    coverage,
    jsonb_build_object(
      'sourceEducationLevelSlug', 'high-school',
      'sourceSubjectSlug', 'mathematics',
      'sourceTrackSlug', 'algebra-1'
    ),
    null
  );
  physics_module_key text :=
    public.course_schedule_module_presentation_key(
      physics_branch ->> 'branchKey',
      'module-1'
    );
  mathematics_module_key text :=
    public.course_schedule_module_presentation_key(
      mathematics_branch ->> 'branchKey',
      'module-1'
    );
begin
  if physics_branch #>> '{academicPathways,0,name}' <> 'AP'
    or physics_branch ->> 'displayLabel'
      <> 'High School ' || chr(183) || ' AP ' || chr(183)
        || ' Physics ' || chr(183) || ' Mechanics'
    or mathematics_branch #>> '{subject,name}' <> 'Mathematics'
    or physics_module_key = mathematics_module_key
  then
    raise exception 'Two same-named modules shared one presentation identity.';
  end if;
end;
$branch_and_module_projection_is_unambiguous$;

do $course_progress_is_overall_with_optional_track_detail$
declare
  progress jsonb := public.project_course_schedule_consumer_progress(
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'curriculum_topic',
        'academicScope', 'branch',
        'sequenceState', 'studied',
        'academicBranch', jsonb_build_object(
          'branchKey', 'physics-track',
          'role', 'primary',
          'displayLabel', 'High School Physics Mechanics',
          'educationLevel', jsonb_build_object('name', 'High School'),
          'academicPathways', jsonb_build_array(
            jsonb_build_object('name', 'AP')
          ),
          'subject', jsonb_build_object('name', 'Physics'),
          'track', jsonb_build_object('name', 'Mechanics')
        ),
        'progress', jsonb_build_object(
          'studied', jsonb_build_object('state', 'marked'),
          'reviewed', jsonb_build_object('state', 'unmarked'),
          'practiced', jsonb_build_object('state', 'marked')
        )
      ),
      jsonb_build_object(
        'kind', 'curriculum_topic',
        'academicScope', 'branch',
        'sequenceState', 'studied',
        'academicBranch', jsonb_build_object(
          'branchKey', 'mathematics-track',
          'role', 'supporting',
          'displayLabel', 'High School Mathematics Algebra 1',
          'educationLevel', jsonb_build_object('name', 'High School'),
          'academicPathways', '[]'::jsonb,
          'subject', jsonb_build_object('name', 'Mathematics'),
          'track', jsonb_build_object('name', 'Algebra 1')
        ),
        'progress', jsonb_build_object(
          'studied', jsonb_build_object('state', 'unmarked'),
          'reviewed', jsonb_build_object('state', 'marked'),
          'practiced', jsonb_build_object('state', 'unmarked')
        )
      )
    ),
    jsonb_build_object(
      'eligibleSessionCount', 2,
      'studiedCount', 0,
      'reviewedCount', 1,
      'practicedCount', 1,
      'completedUnitCount', 1,
      'totalUnitCount', 4,
      'percent', 25
    )
  );
begin
  if progress ->> 'label' <> 'Course progress'
    or progress ->> 'studiedCount' <> '2'
    or progress ->> 'percent' <> '75'
    or jsonb_array_length(progress -> 'byTrack') <> 2
    or progress #>> '{byTrack,0,percent}' <> '100'
    or progress #>> '{byTrack,1,studiedCount}' <> '1'
    or progress #>> '{byTrack,1,percent}' <> '50'
    or progress #>> '{byTrack,1,reviewedCount}' <> '1'
  then
    raise exception 'The Course progress breakdown is not branch-specific.';
  end if;
end;
$course_progress_is_overall_with_optional_track_detail$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.G.2.4.5 consumer projection',
  'kelp',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5g245-db-schedule',
    'name', 'Consumer projection Schedule',
    'timeZone', 'UTC',
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', 'phase5g245-db-topic',
      'title', 'Consumer projection topic',
      'startDate', current_date + 7,
      'endDate', current_date + 7
    ))
  ),
  'phase5g245-db-course'
) ->> 'id') as consumer_course_id \gset

select set_config(
  'test.consumer_course_id',
  :'consumer_course_id',
  false
);
select public.activate_student_course(:'consumer_course_id'::uuid);

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $canonical_reader_exposes_active_coverage$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.consumer_course_id')::uuid
  );
begin
  if projection #>> '{featureStatus,multiCurriculumConsumerProjection}'
      <> 'active_phase_5g2_4_5_1'
    or projection #>> '{context,academicContext,coverage,branchCount}' <> '1'
    or projection #>> '{academicTrack,coverage,branchCount}' <> '1'
    or projection #>> '{academicTrack,courseProgress,label}'
      <> 'Course progress'
    or projection #>> '{academicTrack,courseProgress,scope}'
      <> 'active_schedule_version'
    or projection #>> '{context,academicContext,primaryBranch,role}'
      <> 'primary'
  then
    raise exception 'The canonical reader did not expose active Version coverage.';
  end if;
end;
$canonical_reader_exposes_active_coverage$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_cannot_read_consumer_projection$
begin
  perform public.get_my_unified_course_schedule(
    current_setting('test.consumer_course_id')::uuid
  );
  raise exception 'An outsider read the multi-curriculum consumer projection.';
exception
  when others then
    if sqlerrm = 'An outsider read the multi-curriculum consumer projection.' then
      raise;
    end if;
end;
$outsider_cannot_read_consumer_projection$;

rollback;
