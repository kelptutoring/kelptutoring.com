\set ON_ERROR_STOP on

\if :{?admin_id}
\else
  \echo 'Missing required actor variable: admin_id'
  \quit 3
\endif
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
    :'admin_id'::uuid,
    :'mentor_id'::uuid,
    :'tutor_id'::uuid,
    :'student_a_id'::uuid,
    :'outsider_id'::uuid
  )
) = 5 then 1 else 0 end as actors_ready \gset

\if :actors_ready
\else
  \echo 'The Phase 5.G.2.4.4 actors are not provisioned.'
  \quit 3
\endif

begin;
select set_config('test.tutor_id', :'tutor_id', true);

do $builder_catalog_tracks_resolve_once$
declare
  unresolved_count integer;
begin
  select count(*) into unresolved_count
  from (
    values
      ('10000000-0000-4000-8000-000000000012'::uuid, 'algebra-2'),
      ('10000000-0000-4000-8000-000000000012'::uuid, 'geometry'),
      ('10000000-0000-4000-8000-000000000012'::uuid, 'trigonometry'),
      ('10000000-0000-4000-8000-000000000023'::uuid, 'fluids-and-thermodynamics'),
      ('10000000-0000-4000-8000-000000000023'::uuid, 'waves-and-sound'),
      ('10000000-0000-4000-8000-000000000023'::uuid, 'optics'),
      ('10000000-0000-4000-8000-000000000023'::uuid, 'electricity-and-magnetism'),
      (
        '10000000-0000-4000-8000-000000000023'::uuid,
        'modern-atomic-and-nuclear-physics'
      )
  ) expected(parent_id, slug)
  where (
    select count(*)
    from public.curriculum_nodes node
    where node.parent_id = expected.parent_id
      and node.slug = expected.slug
      and node.status = 'active'
  ) <> 1;

  if unresolved_count <> 0 then
    raise exception
      'Every governed Builder Track must resolve to one active taxonomy branch.';
  end if;
end;
$builder_catalog_tracks_resolve_once$;

-- The selected replacement branches use different Subjects and Education
-- levels. Qualification rows are transaction-local characterization fixtures.
insert into public.teaching_qualifications (
  user_id, curriculum_node_id, status, granted_by, reason, metadata
) values
  (
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000022'::uuid,
    'active',
    :'mentor_id'::uuid,
    'Phase 5.G.2.4.4 Algebra qualification',
    '{"characterization":"phase5g244"}'::jsonb
  ),
  (
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000024'::uuid,
    'active',
    :'mentor_id'::uuid,
    'Phase 5.G.2.4.4 Calculus qualification',
    '{"characterization":"phase5g244"}'::jsonb
  ),
  (
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'active',
    :'mentor_id'::uuid,
    'Phase 5.G.2.4.4 Mechanics qualification',
    '{"characterization":"phase5g244"}'::jsonb
  )
on conflict (user_id, curriculum_node_id) do update
set status = 'active',
    revoked_by = null,
    revoked_at = null,
    reason = excluded.reason,
    metadata = excluded.metadata;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.G.2.4.4 governed replacement',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5g244-db-initial',
    'name', 'Initial Mechanics plan',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5g244-old-worked',
        'title', 'Retained Mechanics history',
        'sourceSessionId',
          'builtin_session_high-school-physics-modules-1-5-instructions-hsp1',
        'sourceSessionKey',
          'builtin_session_high-school-physics-modules-1-5-instructions-hsp1',
        'sourceTrackKey',
          'builtin_track_high-school-physics-broad-modules-hsp-group-1',
        'sourceModuleKey',
          'builtin_module_high-school-physics-modules-1-5-hsp-module-1',
        'sourceModuleTitle', 'Module 1: Fundamentals of physics',
        'sourceContentVersionKey',
          'sha256:1e81ced41df81e80cfea00a438cea55d2707f88387b82900b894575797b883b8',
        'startDate', current_date,
        'endDate', current_date
      ),
      jsonb_build_object(
        'id', 'phase5g244-old-reviewed',
        'title', 'Reviewed-only Mechanics history',
        'sourceSessionId', 'phase5g244-reviewed-source',
        'sourceSessionKey', 'phase5g244-reviewed-source',
        'sourceTrackKey',
          'builtin_track_high-school-physics-broad-modules-hsp-group-1',
        'sourceModuleKey',
          'builtin_module_high-school-physics-modules-1-5-hsp-module-1',
        'sourceModuleTitle', 'Module 1: Fundamentals of physics',
        'startDate', current_date + 1,
        'endDate', current_date + 1
      ),
      jsonb_build_object(
        'id', 'phase5g244-old-practiced',
        'title', 'Practiced Mechanics history',
        'sourceSessionId', 'phase5g244-practiced-source',
        'sourceSessionKey', 'phase5g244-practiced-source',
        'sourceTrackKey',
          'builtin_track_high-school-physics-broad-modules-hsp-group-1',
        'sourceModuleKey',
          'builtin_module_high-school-physics-modules-1-5-hsp-module-1',
        'sourceModuleTitle', 'Module 1: Fundamentals of physics',
        'startDate', current_date + 2,
        'endDate', current_date + 2
      ),
      jsonb_build_object(
        'id', 'phase5g244-old-future',
        'title', 'Abandoned Mechanics future work',
        'startDate', current_date + 20,
        'endDate', current_date + 20
      )
    )
  ),
  'phase5g244-db-course'
) ->> 'id') as governed_course_id \gset

select course.active_schedule_version_id as governed_v1_id
from public.student_courses course
where course.id = :'governed_course_id'::uuid \gset

select item.id as governed_old_worked_item_id
from public.course_schedule_items item
where item.version_id = :'governed_v1_id'::uuid
  and item.stable_item_key = 'phase5g244-old-worked' \gset
select item.id as governed_old_reviewed_item_id
from public.course_schedule_items item
where item.version_id = :'governed_v1_id'::uuid
  and item.stable_item_key = 'phase5g244-old-reviewed' \gset
select item.id as governed_old_practiced_item_id
from public.course_schedule_items item
where item.version_id = :'governed_v1_id'::uuid
  and item.stable_item_key = 'phase5g244-old-practiced' \gset

reset role;
update public.student_courses
set status = 'active',
    activated_at = clock_timestamp()
where id = :'governed_course_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'governed_course_id'::uuid,
  :'governed_old_worked_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  'I completed this topic before my Course plan was replaced.',
  null,
  null,
  'phase5g244-db-old-progress'
) as governed_old_progress \gset
select public.record_course_progress(
  :'governed_course_id'::uuid,
  :'governed_old_reviewed_item_id'::uuid,
  null,
  'reviewed',
  null,
  null,
  'I reviewed this topic before my Course plan was replaced.',
  null,
  null,
  'phase5g244-db-old-reviewed'
) as governed_old_reviewed_progress \gset
select public.record_course_progress(
  :'governed_course_id'::uuid,
  :'governed_old_practiced_item_id'::uuid,
  null,
  'practiced',
  null,
  null,
  'I practiced this topic before my Course plan was replaced.',
  null,
  null,
  'phase5g244-db-old-practiced'
) as governed_old_practiced_progress \gset
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select jsonb_build_object(
  'schemaVersion', 2,
  'id', 'phase5g244-db-builder',
  'name', 'Algebra and Calculus replacement',
  'timeZone', 'America/Sao_Paulo',
  'cadence', jsonb_build_object(
    'type', 'weekly_frequency',
    'weekdays', jsonb_build_array(1, 3, 5)
  ),
  'context', jsonb_build_object(
    'subjectTaxonomySlug', 'mathematics',
    'trackTaxonomySlugs', jsonb_build_array('algebra-1', 'calculus-1'),
    'coverage', jsonb_build_object(
      'schemaVersion', 2,
      'primaryTrackKey', 'builder-algebra-1',
      'branches', jsonb_build_array(
        jsonb_build_object(
          'branchKey', 'high-school::mathematics::algebra-1',
          'role', 'primary',
          'educationLevel', jsonb_build_object(
            'key', 'builder-high-school',
            'name', 'High School',
            'slug', 'high-school'
          ),
          'academicPathways', jsonb_build_array(jsonb_build_object(
            'key', 'ap',
            'name', 'AP',
            'slug', 'ap'
          )),
          'subject', jsonb_build_object(
            'key', 'builder-hs-mathematics',
            'name', 'Mathematics',
            'slug', 'mathematics'
          ),
          'track', jsonb_build_object(
            'key', 'builder-algebra-1',
            'name', 'Algebra 1',
            'slug', 'algebra-1'
          )
        ),
        jsonb_build_object(
          'branchKey', 'college::mathematics::calculus-1',
          'role', 'supporting',
          'educationLevel', jsonb_build_object(
            'key', 'builder-college',
            'name', 'College',
            'slug', 'college'
          ),
          'academicPathways', '[]'::jsonb,
          'subject', jsonb_build_object(
            'key', 'builder-college-mathematics',
            'name', 'Mathematics',
            'slug', 'mathematics'
          ),
          'track', jsonb_build_object(
            'key', 'builder-calculus-1',
            'name', 'Calculus I',
            'slug', 'calculus-1'
          )
        )
      )
    )
  )
) as governed_builder \gset

select jsonb_build_array(
  jsonb_build_object(
    'stableItemKey', 'phase5g244-old-worked',
    'title', 'Retained Mechanics history',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date,
    'endDate', current_date,
    'position', 0,
    'state', 'scheduled'
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g244-old-reviewed',
    'title', 'Reviewed-only Mechanics history',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 1,
    'endDate', current_date + 1,
    'position', 1,
    'state', 'scheduled'
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g244-old-practiced',
    'title', 'Practiced Mechanics history',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 2,
    'endDate', current_date + 2,
    'position', 2,
    'state', 'scheduled'
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g244-old-future',
    'title', 'Abandoned Mechanics future work',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 20,
    'endDate', current_date + 20,
    'position', 3,
    'state', 'dropped'
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g244-algebra',
    'title', 'Algebra foundations',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 30,
    'endDate', current_date + 30,
    'position', 4,
    'state', 'scheduled',
    'sourceTrackKey', 'builder-algebra-1',
    'sourceModuleKey', 'builder-linear-module',
    'sourceSessionKey', 'builder-algebra-session',
    'sourceContentVersionKey', 'sha256:phase5g244-algebra-v1',
    'sourceSubjectSlug', 'mathematics',
    'sourceTrackSlug', 'algebra-1',
    'resources', '[]'::jsonb
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g244-calculus',
    'title', 'Calculus foundations',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 40,
    'endDate', current_date + 40,
    'position', 5,
    'state', 'scheduled',
    'sourceTrackKey', 'builder-calculus-1',
    'sourceModuleKey', 'builder-calculus-module',
    'sourceSessionKey', 'builder-calculus-session',
    'sourceContentVersionKey', 'sha256:phase5g244-calculus-v1',
    'sourceSubjectSlug', 'mathematics',
    'sourceTrackSlug', 'calculus-1',
    'resources', '[]'::jsonb
  )
) as governed_items \gset

select jsonb_build_array(
  jsonb_build_object(
    'changeType', 'dropped',
    'stableItemKey', 'phase5g244-old-future',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'The former Mechanics plan was replaced by the new study plan.',
    'privateStaffNote', 'The supervising team approved this complete Track replacement.'
  ),
  jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5g244-algebra',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'Algebra now belongs to the Student active study plan.'
  ),
  jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5g244-calculus',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'Calculus now belongs to the Student active study plan.'
  )
) as governed_reasons \gset

select public.publish_course_builder_schedule(
  :'governed_course_id'::uuid,
  :'governed_v1_id'::uuid,
  :'governed_builder'::jsonb,
  :'governed_items'::jsonb,
  :'governed_reasons'::jsonb,
  'phase5g244-db-publish'
) as governed_result \gset

select course.active_schedule_version_id as governed_v2_id
from public.student_courses course
where course.id = :'governed_course_id'::uuid \gset

select set_config('test.governed_course_id', :'governed_course_id', false);
select set_config('test.governed_v1_id', :'governed_v1_id', false);
select set_config('test.governed_v2_id', :'governed_v2_id', false);
select set_config('test.governed_tutor_id', :'tutor_id', false);

do $governed_publication_contract$
declare
  command_record public.course_schedule_builder_publish_commands%rowtype;
  published_version public.course_schedule_versions%rowtype;
  expected_builder_cadence jsonb := jsonb_build_object(
    'type', 'weekly_frequency',
    'weekdays', jsonb_build_array(1, 3, 5)
  );
  builder_context jsonb := public.get_my_course_schedule_builder_context(
    current_setting('test.governed_course_id')::uuid
  );
  reopened_builder_context jsonb :=
    public.get_my_course_schedule_builder_context(
      current_setting('test.governed_course_id')::uuid
    );
  active_projection jsonb := public.get_my_effective_course_schedule(
    current_setting('test.governed_course_id')::uuid
  );
  progress_history jsonb := public.get_my_course_progress(
    current_setting('test.governed_course_id')::uuid
  );
  learning_history jsonb := public.get_my_course_learning_history(
    current_setting('test.governed_course_id')::uuid
  );
begin
  select * into published_version
  from public.course_schedule_versions version
  where version.id = current_setting('test.governed_v2_id')::uuid;
  if published_version.cadence = jsonb_build_object(
    'type', 'day_interval',
    'intervalDays', 7
  ) then
    raise exception
      'Reopening the governed Builder fell back to a seven-day fixed period.';
  end if;
  if published_version.cadence <> expected_builder_cadence
    or builder_context #> '{schedule,cadence}' <> expected_builder_cadence
    or reopened_builder_context #> '{schedule,cadence}'
      <> expected_builder_cadence then
    raise exception
      'The reopened governed Builder did not retain Monday, Wednesday, and Friday.';
  end if;
  if published_version.name <> 'Algebra and Calculus replacement'
    or published_version.time_zone <> 'America/Sao_Paulo'
    or published_version.source_snapshot -> 'cadence'
      <> expected_builder_cadence
    or builder_context #>> '{schedule,name}'
      <> 'Algebra and Calculus replacement'
    or builder_context #>> '{schedule,timeZone}' <> 'America/Sao_Paulo'
    or reopened_builder_context #>> '{schedule,name}'
      <> 'Algebra and Calculus replacement'
    or reopened_builder_context #>> '{schedule,timeZone}'
      <> 'America/Sao_Paulo' then
    raise exception
      'The governed Builder presentation did not persist for reopening.';
  end if;
  if current_setting('test.governed_v1_id')
      = current_setting('test.governed_v2_id') then
    raise exception 'The governed Builder did not publish a successor Version.';
  end if;
  if not exists (
    select 1
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = current_setting('test.governed_v2_id')::uuid
      and coverage.provenance = 'selected'
      and coverage.primary_track_key
        = '10000000-0000-4000-8000-000000000022'
      and jsonb_array_length(coverage.coverage_snapshot -> 'branches') = 2
      and coverage.metadata ->> 'transitionKind' = 'complete_replacement'
      and coverage.metadata ->> 'historicalProgressLocation'
        = 'previous_schedule'
      and (coverage.metadata ->> 'activePlanOnly')::boolean
  ) then
    raise exception 'The selected multi-branch coverage or complete-replacement boundary is invalid.';
  end if;
  if not exists (
    select 1
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = current_setting('test.governed_v1_id')::uuid
      and coverage.primary_track_key
        = '10000000-0000-4000-8000-000000000032'
  ) then
    raise exception 'The former Schedule coverage was not retained with its historical Version.';
  end if;
  if not exists (
    select 1
    from public.student_courses course
    where course.id = current_setting('test.governed_course_id')::uuid
      and course.subject_node_id
        = '10000000-0000-4000-8000-000000000012'
      and course.focus_node_id
        = '10000000-0000-4000-8000-000000000022'
  ) then
    raise exception 'The Course compatibility anchors did not follow the selected primary Track.';
  end if;
  if exists (
    select 1
    from public.course_schedule_items item
    where item.version_id = current_setting('test.governed_v2_id')::uuid
      and item.stable_item_key = 'phase5g244-old-worked'
  ) or not exists (
    select 1
    from public.course_schedule_items item
    where item.version_id = current_setting('test.governed_v1_id')::uuid
      and item.stable_item_key = 'phase5g244-old-worked'
  ) then
    raise exception 'Historical work did not remain available with the former Schedule.';
  end if;
  if active_projection::text like '%phase5g244-old-worked%'
    or active_projection::text like '%phase5g244-old-reviewed%'
    or active_projection::text like '%phase5g244-old-practiced%'
    or active_projection #>> '{trackProgress,eligibleSessionCount}' <> '2'
    or active_projection #>> '{trackProgress,studiedCount}' <> '0'
    or progress_history::text not like '%phase5g244-old-worked%'
    or progress_history::text not like '%phase5g244-old-reviewed%'
    or progress_history::text not like '%phase5g244-old-practiced%' then
    raise exception 'Former progress leaked into the active Classroom Home or disappeared from history.';
  end if;
  if learning_history #>> '{summary,workedSessionCount}' <> '2'
    or learning_history #>> '{summary,studiedCount}' <> '1'
    or learning_history #>> '{summary,reviewedCount}' <> '0'
    or learning_history #>> '{summary,practicedCount}' <> '1'
    or learning_history #>> '{summary,scheduleVersionCount}' <> '1'
    or learning_history #>> '{versions,0,scheduleVersionId}'
      <> current_setting('test.governed_v1_id')
    or jsonb_array_length(learning_history #> '{versions,0,items}') <> 2
    or learning_history::text not like '%phase5g244-old-worked%'
    or learning_history::text not like '%phase5g244-old-practiced%'
    or learning_history::text like '%phase5g244-old-reviewed%'
    or learning_history::text like '%phase5g244-old-future%'
    or learning_history::text like '%phase5g244-algebra%'
    or learning_history #>> '{historyPolicy,workedProgressKinds,0}'
      <> 'studied'
    or learning_history #>> '{historyPolicy,workedProgressKinds,1}'
      <> 'practiced'
    or learning_history #>> '{historyPolicy,reviewedOnlySessionsExcluded}'
      <> 'true' then
    raise exception 'Student learning history did not isolate worked Sessions from the superseded Schedule.';
  end if;

  select * into command_record
  from public.course_schedule_builder_publish_commands command
  where command.published_version_id
    = current_setting('test.governed_v2_id')::uuid;
  if command_record.request_payload #> '{builderSchedule,cadence}'
      <> expected_builder_cadence then
    raise exception
      'The Builder publication receipt did not retain its authored cadence.';
  end if;
  if command_record.id is null
    or command_record.transition_kind <> 'complete_replacement'
    or jsonb_array_length(
      command_record.qualification_snapshot -> 'branches'
    ) <> 2
    or command_record.qualification_snapshot ->> 'assignedTutorId'
      <> current_setting('test.governed_tutor_id') then
    raise exception 'The assigned-Tutor qualification audit snapshot is incomplete.';
  end if;
end;
$governed_publication_contract$;

reset role;
do $governed_builder_presentation_persists$
declare
  published_version public.course_schedule_versions%rowtype;
begin
  select * into published_version
  from public.course_schedule_versions version
  where version.id = current_setting('test.governed_v2_id')::uuid;
  if not exists (
    select 1
    from public.learning_schedules mirror
    where mirror.id = published_version.legacy_schedule_id
      and mirror.name = published_version.name
      and mirror.time_zone = published_version.time_zone
      and mirror.source_snapshot -> 'cadence'
        = published_version.cadence
  ) then
    raise exception
      'The Calendar compatibility mirror lost the Builder presentation.';
  end if;

  if public.normalize_course_schedule_builder_cadence(
    jsonb_build_object(
      'type', 'weekly_frequency',
      'weekdays', jsonb_build_array(5, 1, 3, 1)
    )
  ) <> jsonb_build_object(
    'type', 'weekly_frequency',
    'weekdays', jsonb_build_array(1, 3, 5)
  ) then
    raise exception
      'The governed Builder cadence did not normalize its weekday lanes.';
  end if;

  begin
    perform public.normalize_course_schedule_builder_cadence(
      jsonb_build_object(
        'type', 'weekly_frequency',
        'weekdays', jsonb_build_array(1, 7)
      )
    );
    raise exception 'Expected invalid Builder cadence to be rejected.';
  exception when others then
    if sqlerrm = 'Expected invalid Builder cadence to be rejected.' then
      raise;
    end if;
    if sqlerrm not like
      '%Choose between 1 and 7 different meeting weekdays%' then
      raise;
    end if;
  end;
end;
$governed_builder_presentation_persists$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $mentor_receives_printable_schedule_audit$
declare
  audit_history jsonb := public.get_my_course_schedule_audit_history(
    current_setting('test.governed_course_id')::uuid
  );
begin
  if audit_history #>> '{permissions,actorRole}' <> 'mentor'
    or audit_history #>> '{permissions,canReadScheduleAudit}' <> 'true'
    or audit_history #>> '{permissions,canReadPrivateStaffNotes}' <> 'true'
    or audit_history #>> '{permissions,canPrintScheduleAudit}' <> 'true'
    or audit_history #>> '{summary,versionCount}' <> '2'
    or audit_history #>> '{summary,changeCount}' <> '3'
    or audit_history #>> '{auditPolicy,studentAccess}' <> 'false'
    or audit_history::text not like
      '%The supervising team approved this complete Track replacement.%'
    or audit_history::text not like '%phase5g244-old-reviewed%'
    or audit_history::text not like '%phase5g244-old-practiced%' then
    raise exception
      'The Mentor did not receive the complete printable Schedule audit history.';
  end if;
end;
$mentor_receives_printable_schedule_audit$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $assigned_tutor_receives_printable_schedule_audit$
declare
  audit_history jsonb := public.get_my_course_schedule_audit_history(
    current_setting('test.governed_course_id')::uuid
  );
begin
  if audit_history #>> '{permissions,actorRole}' <> 'tutor'
    or audit_history #>> '{permissions,canPrintScheduleAudit}' <> 'true'
    or audit_history #>> '{summary,versionCount}' <> '2' then
    raise exception
      'The assigned Tutor did not receive printable Schedule audit history.';
  end if;
end;
$assigned_tutor_receives_printable_schedule_audit$;

reset role;
do $internal_publication_intent_was_consumed$
begin
  if exists (
    select 1 from public.course_schedule_coverage_publish_intents
    where course_id = current_setting('test.governed_course_id')::uuid
  ) then
    raise exception 'A completed publication retained its internal coverage intent.';
  end if;
end;
$internal_publication_intent_was_consumed$;

-- An exact retry returns the original governed receipt and creates no history.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.publish_course_builder_schedule(
  :'governed_course_id'::uuid,
  :'governed_v1_id'::uuid,
  :'governed_builder'::jsonb,
  :'governed_items'::jsonb,
  :'governed_reasons'::jsonb,
  'phase5g244-db-publish'
);

do $exact_retry_is_idempotent$
begin
  if (
    select count(*)
    from public.course_schedule_builder_publish_commands
    where published_version_id = current_setting('test.governed_v2_id')::uuid
  ) <> 1 then
    raise exception 'An exact governed Builder retry created duplicate history.';
  end if;
end;
$exact_retry_is_idempotent$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_receives_worked_only_learning_history$
declare
  learning_history jsonb := public.get_my_course_learning_history(
    current_setting('test.governed_course_id')::uuid
  );
begin
  if learning_history #>> '{permissions,actorRole}' <> 'student'
    or learning_history #>> '{summary,workedSessionCount}' <> '2'
    or learning_history #>> '{summary,studiedCount}' <> '1'
    or learning_history #>> '{summary,reviewedCount}' <> '0'
    or learning_history #>> '{summary,practicedCount}' <> '1'
    or learning_history::text not like '%phase5g244-old-worked%'
    or learning_history::text not like '%phase5g244-old-practiced%'
    or learning_history::text like '%phase5g244-old-reviewed%' then
    raise exception
      'The Student history did not retain only Studied or Practiced Sessions.';
  end if;
end;
$student_receives_worked_only_learning_history$;

do $student_cannot_read_schedule_audit$
begin
  begin
    perform public.get_my_course_schedule_audit_history(
      current_setting('test.governed_course_id')::uuid
    );
    raise exception 'Expected Student Schedule-audit access to fail.';
  exception when others then
    if sqlerrm = 'Expected Student Schedule-audit access to fail.' then
      raise;
    end if;
    if sqlerrm not like
      '%Schedule audit history is private to authorized Course staff%' then
      raise;
    end if;
  end;
end;
$student_cannot_read_schedule_audit$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_cannot_read_governed_receipts$
begin
  if exists (
    select 1
    from public.course_schedule_builder_publish_commands
    where published_version_id = current_setting('test.governed_v2_id')::uuid
  ) then
    raise exception 'An unrelated account received governed Builder publication evidence.';
  end if;
end;
$outsider_cannot_read_governed_receipts$;

do $outsider_cannot_read_learning_history$
begin
  begin
    perform public.get_my_course_learning_history(
      current_setting('test.governed_course_id')::uuid
    );
    raise exception 'Expected unrelated Course learning-history access to fail.';
  exception when others then
    if sqlerrm = 'Expected unrelated Course learning-history access to fail.' then
      raise;
    end if;
    if sqlerrm not like '%private to the Student and assigned academic staff%' then
      raise;
    end if;
  end;
end;
$outsider_cannot_read_learning_history$;

do $outsider_cannot_read_schedule_audit$
begin
  begin
    perform public.get_my_course_schedule_audit_history(
      current_setting('test.governed_course_id')::uuid
    );
    raise exception 'Expected outsider Schedule-audit access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider Schedule-audit access to fail.' then
      raise;
    end if;
    if sqlerrm not like
      '%Schedule audit history is private to authorized Course staff%' then
      raise;
    end if;
  end;
end;
$outsider_cannot_read_schedule_audit$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.grant_user_role(
  :'outsider_id'::uuid,
  'quality_assistant',
  'Phase 5.G.2.4.5.6 rollback-only Schedule audit characterization.',
  false
);
select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $quality_assistant_receives_printable_schedule_audit$
declare
  audit_history jsonb := public.get_my_course_schedule_audit_history(
    current_setting('test.governed_course_id')::uuid
  );
begin
  if audit_history #>> '{permissions,actorRole}' <> 'quality_assistant'
    or audit_history #>> '{permissions,canReadPrivateStaffNotes}' <> 'true'
    or audit_history #>> '{permissions,canPrintScheduleAudit}' <> 'true'
    or audit_history::text not like
      '%The supervising team approved this complete Track replacement.%' then
    raise exception
      'The Quality Assistant did not receive printable Schedule audit history.';
  end if;
end;
$quality_assistant_receives_printable_schedule_audit$;

-- A partial replacement keeps the continuing Track and its progress active.
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select item.id as governed_algebra_item_id
from public.course_schedule_items item
where item.version_id = :'governed_v2_id'::uuid
  and item.stable_item_key = 'phase5g244-algebra' \gset

select public.record_course_progress(
  :'governed_course_id'::uuid,
  :'governed_algebra_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  'I completed the continuing Algebra topic in my active plan.',
  null,
  null,
  'phase5g244-db-continuing-progress'
) as governed_continuing_progress \gset

select jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        :'governed_builder'::jsonb,
        '{id}',
        to_jsonb('phase5g244-db-partial-builder'::text)
      ),
      '{name}',
      to_jsonb('Algebra and Mechanics adjustment'::text)
    ),
    '{context,trackTaxonomySlugs}',
    jsonb_build_array('algebra-1', 'mechanics')
  ),
  '{context,coverage,branches,1}',
  jsonb_build_object(
    'branchKey', 'high-school::physics::mechanics',
    'role', 'supporting',
    'educationLevel', jsonb_build_object(
      'key', 'builder-high-school',
      'name', 'High School',
      'slug', 'high-school'
    ),
    'academicPathways', '[]'::jsonb,
    'subject', jsonb_build_object(
      'key', 'builder-hs-physics',
      'name', 'Physics',
      'slug', 'physics'
    ),
    'track', jsonb_build_object(
      'key', 'builder-mechanics',
      'name', 'Mechanics',
      'slug', 'mechanics'
    )
  )
) as governed_partial_builder \gset

select jsonb_build_array(
  jsonb_build_object(
    'stableItemKey', 'phase5g244-algebra',
    'title', 'Algebra foundations',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 30,
    'endDate', current_date + 30,
    'position', 0,
    'state', 'scheduled',
    'sourceTrackKey', 'builder-algebra-1',
    'sourceModuleKey', 'builder-linear-module',
    'sourceSessionKey', 'builder-algebra-session',
    'sourceContentVersionKey', 'sha256:phase5g244-algebra-v1',
    'sourceSubjectSlug', 'mathematics',
    'sourceTrackSlug', 'algebra-1',
    'resources', '[]'::jsonb
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g244-calculus',
    'title', 'Calculus foundations',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 40,
    'endDate', current_date + 40,
    'position', 1,
    'state', 'dropped',
    'sourceTrackKey', 'builder-calculus-1',
    'sourceModuleKey', 'builder-calculus-module',
    'sourceSessionKey', 'builder-calculus-session',
    'sourceContentVersionKey', 'sha256:phase5g244-calculus-v1',
    'sourceSubjectSlug', 'mathematics',
    'sourceTrackSlug', 'calculus-1',
    'resources', '[]'::jsonb
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g244-mechanics',
    'title', 'Mechanics support',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 50,
    'endDate', current_date + 50,
    'position', 2,
    'state', 'scheduled',
    'sourceTrackKey', 'builder-mechanics',
    'sourceModuleKey', 'builder-mechanics-module',
    'sourceSessionKey', 'builder-mechanics-session',
    'sourceContentVersionKey', 'sha256:phase5g244-mechanics-v1',
    'sourceSubjectSlug', 'physics',
    'sourceTrackSlug', 'mechanics',
    'resources', '[]'::jsonb
  )
) as governed_partial_items \gset

select jsonb_build_array(
  jsonb_build_object(
    'changeType', 'dropped',
    'stableItemKey', 'phase5g244-calculus',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'Calculus left the active plan while Algebra progress continues.'
  ),
  jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5g244-mechanics',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'Mechanics now supports the continuing Algebra study plan.'
  )
) as governed_partial_reasons \gset

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.publish_course_builder_schedule(
  :'governed_course_id'::uuid,
  :'governed_v2_id'::uuid,
  :'governed_partial_builder'::jsonb,
  :'governed_partial_items'::jsonb,
  :'governed_partial_reasons'::jsonb,
  'phase5g244-db-partial'
) as governed_partial_result \gset

select course.active_schedule_version_id as governed_v3_id
from public.student_courses course
where course.id = :'governed_course_id'::uuid \gset
select set_config('test.governed_v3_id', :'governed_v3_id', false);

do $partial_replacement_retains_active_progress$
declare
  continuing_item_id uuid;
  active_projection jsonb := public.get_my_effective_course_schedule(
    current_setting('test.governed_course_id')::uuid
  );
begin
  select item.id into continuing_item_id
  from public.course_schedule_items item
  where item.version_id = current_setting('test.governed_v3_id')::uuid
    and item.stable_item_key = 'phase5g244-algebra';
  if continuing_item_id is null
    or active_projection::text not like '%phase5g244-algebra%'
    or active_projection::text like '%phase5g244-old-worked%'
    or active_projection #>> '{trackProgress,eligibleSessionCount}' <> '2'
    or active_projection #>> '{trackProgress,studiedCount}' <> '1'
    or not exists (
      select 1
      from public.course_schedule_version_coverages current_coverage
      join public.course_schedule_version_coverages previous_coverage
        on previous_coverage.version_id
          = current_setting('test.governed_v2_id')::uuid
      where current_coverage.version_id
          = current_setting('test.governed_v3_id')::uuid
        and current_coverage.metadata ->> 'transitionKind'
          = 'partial_replacement'
        and current_coverage.metadata ->> 'planEpochId'
          = previous_coverage.metadata ->> 'planEpochId'
    ) then
    raise exception 'A partial replacement hid or detached continuing Student progress.';
  end if;
end;
$partial_replacement_retains_active_progress$;

-- Practice remains part of Student progress and keeps its Track started, but
-- it does not reserve a future lesson date. A continuing cadence revision may
-- move the retained Practiced item without dropping or rewriting its identity.
reset role;
select item.id as governed_practice_reflow_item_id
from public.course_schedule_items item
where item.version_id = :'governed_v3_id'::uuid
  and item.stable_item_key = 'phase5g244-mechanics' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'governed_course_id'::uuid,
  :'governed_practice_reflow_item_id'::uuid,
  null,
  'practiced',
  null,
  null,
  null,
  null,
  null,
  'phase5g24731-db-practiced-reflow-progress'
);

reset role;
select jsonb_set(
  :'governed_partial_builder'::jsonb,
  '{id}',
  to_jsonb('phase5g24731-db-practiced-reflow'::text)
) as governed_practiced_reflow_builder \gset
select jsonb_set(
  jsonb_set(
    :'governed_partial_items'::jsonb,
    '{2,scheduledDate}',
    to_jsonb((current_date + 55)::text)
  ),
  '{2,endDate}',
  to_jsonb((current_date + 55)::text)
) as governed_practiced_reflow_items \gset
select jsonb_build_array(jsonb_build_object(
  'changeType', 'reordered',
  'stableItemKey', 'phase5g244-mechanics',
  'reasonCode', 'pacing_adjustment',
  'studentExplanation',
    'The retained Practiced topic now follows the revised future meeting cadence.'
)) as governed_practiced_reflow_reasons \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.publish_course_builder_schedule(
  :'governed_course_id'::uuid,
  :'governed_v3_id'::uuid,
  :'governed_practiced_reflow_builder'::jsonb,
  :'governed_practiced_reflow_items'::jsonb,
  :'governed_practiced_reflow_reasons'::jsonb,
  'phase5g24731-db-practiced-reflow'
) as governed_practiced_reflow_result \gset

reset role;
select course.active_schedule_version_id as governed_v3_id
from public.student_courses course
where course.id = :'governed_course_id'::uuid \gset
select set_config('test.governed_v3_id', :'governed_v3_id', false);

do $future_practiced_item_reflows_without_losing_progress$
declare
  practiced_item public.course_schedule_items%rowtype;
begin
  select * into practiced_item
  from public.course_schedule_items item
  where item.version_id = current_setting('test.governed_v3_id')::uuid
    and item.stable_item_key = 'phase5g244-mechanics';

  if practiced_item.id is null
    or practiced_item.scheduled_date <> current_date + 55
    or not coalesce((
      public.course_session_practiced_aggregation(
        current_setting('test.governed_course_id')::uuid,
        practiced_item.id
      ) ->> 'marked'
    )::boolean, false) then
    raise exception
      'A future Practiced item did not reflow with its progress intact.';
  end if;
end;
$future_practiced_item_reflows_without_losing_progress$;

-- Practice starts its Track and contributes to Student progress, so it cannot
-- be silently discarded from a continuing Version. It may move, as proved
-- above, but a removal must instead start a new Schedule.
select jsonb_set(
  :'governed_practiced_reflow_builder'::jsonb,
  '{id}',
  to_jsonb('phase5g24731-db-practiced-drop'::text)
) as governed_practiced_drop_builder \gset
select jsonb_set(
  :'governed_practiced_reflow_items'::jsonb,
  '{2,state}',
  to_jsonb('dropped'::text)
) || jsonb_build_array(jsonb_build_object(
  'stableItemKey', 'phase5g24731-mechanics-continuation',
  'title', 'Mechanics continuation',
  'kind', 'curriculum_topic',
  'scheduledDate', current_date + 70,
  'endDate', current_date + 70,
  'position', 3,
  'state', 'scheduled',
  'sourceTrackKey', 'builder-mechanics',
  'sourceModuleKey', 'builder-mechanics-module',
  'sourceSessionKey', 'builder-mechanics-continuation-session',
  'sourceContentVersionKey', 'sha256:phase5g24731-mechanics-continuation-v1',
  'sourceSubjectSlug', 'physics',
  'sourceTrackSlug', 'mechanics',
  'resources', '[]'::jsonb
)) as governed_practiced_drop_items \gset
select jsonb_build_array(
  jsonb_build_object(
    'changeType', 'dropped',
    'stableItemKey', 'phase5g244-mechanics',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation',
      'This continuing revision must retain the Student''s Practiced topic.'
  ),
  jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5g24731-mechanics-continuation',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation',
      'A second governed Mechanics Session keeps the selected branch active.'
  )
) as governed_practiced_drop_reasons \gset
select set_config(
  'test.governed_practiced_drop_builder',
  :'governed_practiced_drop_builder',
  false
);
select set_config(
  'test.governed_practiced_drop_items',
  :'governed_practiced_drop_items',
  false
);
select set_config(
  'test.governed_practiced_drop_reasons',
  :'governed_practiced_drop_reasons',
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $continuing_practiced_item_cannot_be_dropped$
begin
  begin
    perform public.publish_course_builder_schedule(
      current_setting('test.governed_course_id')::uuid,
      current_setting('test.governed_v3_id')::uuid,
      current_setting('test.governed_practiced_drop_builder')::jsonb,
      current_setting('test.governed_practiced_drop_items')::jsonb,
      current_setting('test.governed_practiced_drop_reasons')::jsonb,
      'phase5g24731-db-practiced-drop'
    );
    raise exception
      'Expected a continuing Version to reject Practiced-item removal.';
  exception when others then
    if sqlerrm =
      'Expected a continuing Version to reject Practiced-item removal.' then
      raise;
    end if;
    if sqlerrm not like
      '%A Practiced Schedule item must remain in a continuing Version%' then
      raise;
    end if;
  end;
  if (
    select active_schedule_version_id
    from public.student_courses
    where id = current_setting('test.governed_course_id')::uuid
  ) <> current_setting('test.governed_v3_id')::uuid then
    raise exception
      'Rejected Practiced-item removal changed the active Version.';
  end if;
  if exists (
    select 1
    from public.course_schedule_builder_publish_commands command
    where command.idempotency_key = 'phase5g24731-db-practiced-drop'
  ) then
    raise exception
      'Rejected Practiced-item removal retained a publication receipt.';
  end if;
end;
$continuing_practiced_item_cannot_be_dropped$;

-- Studied progress reserves the exact curriculum structure. Even a future
-- Studied row cannot be moved by a continuing cadence adjustment.
reset role;
select jsonb_set(
  :'governed_practiced_reflow_builder'::jsonb,
  '{id}',
  to_jsonb('phase5g24731-db-studied-move'::text)
) as governed_studied_move_builder \gset
select jsonb_set(
  jsonb_set(
    :'governed_practiced_reflow_items'::jsonb,
    '{0,scheduledDate}',
    to_jsonb((current_date + 31)::text)
  ),
  '{0,endDate}',
  to_jsonb((current_date + 31)::text)
) as governed_studied_move_items \gset
select jsonb_build_array(jsonb_build_object(
  'changeType', 'reordered',
  'stableItemKey', 'phase5g244-algebra',
  'reasonCode', 'pacing_adjustment',
  'studentExplanation',
    'This continuing revision must not move an already Studied topic.'
)) as governed_studied_move_reasons \gset
select set_config(
  'test.governed_studied_move_builder',
  :'governed_studied_move_builder',
  false
);
select set_config(
  'test.governed_studied_move_items',
  :'governed_studied_move_items',
  false
);
select set_config(
  'test.governed_studied_move_reasons',
  :'governed_studied_move_reasons',
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $continuing_studied_item_cannot_move$
begin
  begin
    perform public.publish_course_builder_schedule(
      current_setting('test.governed_course_id')::uuid,
      current_setting('test.governed_v3_id')::uuid,
      current_setting('test.governed_studied_move_builder')::jsonb,
      current_setting('test.governed_studied_move_items')::jsonb,
      current_setting('test.governed_studied_move_reasons')::jsonb,
      'phase5g24731-db-studied-move'
    );
    raise exception
      'Expected a continuing Version to reject Studied-item movement.';
  exception when others then
    if sqlerrm =
      'Expected a continuing Version to reject Studied-item movement.' then
      raise;
    end if;
    if sqlerrm not like
      '%A Studied Schedule item is immutable in continuing Versions%' then
      raise;
    end if;
  end;
  if (
    select active_schedule_version_id
    from public.student_courses
    where id = current_setting('test.governed_course_id')::uuid
  ) <> current_setting('test.governed_v3_id')::uuid then
    raise exception
      'Rejected Studied-item movement changed the active Version.';
  end if;
  if exists (
    select 1
    from public.course_schedule_builder_publish_commands command
    where command.idempotency_key = 'phase5g24731-db-studied-move'
  ) then
    raise exception
      'Rejected Studied-item movement retained a publication receipt.';
  end if;
end;
$continuing_studied_item_cannot_move$;

-- A delivered Class starts its Track even when the Tutor intentionally leaves
-- the curriculum target unstudied (for example, a Review pivot).
reset role;
do $delivered_class_starts_track_without_progress$
declare
  mechanics_item public.course_schedule_items%rowtype;
  mapped_target record;
  inserted_lock public.course_schedule_target_locks%rowtype;
  starts_at timestamptz := clock_timestamp() - interval '1 day';
begin
  select * into mechanics_item
  from public.course_schedule_items item
  where item.version_id = current_setting('test.governed_v3_id')::uuid
    and item.stable_item_key = 'phase5g244-mechanics';
  select
    target.id as target_id,
    target.mapping_revision_id,
    target.academic_slot_id,
    slot.stable_slot_key
  into mapped_target
  from public.course_schedule_academic_slot_targets target
  join public.course_schedule_target_mapping_revisions revision
    on revision.id = target.mapping_revision_id
  join public.course_schedule_academic_slots slot
    on slot.id = target.academic_slot_id
  where revision.version_id = current_setting('test.governed_v3_id')::uuid
    and target.schedule_item_id = mechanics_item.id
  order by revision.revision_number desc, target.slot_position
  limit 1;
  if mechanics_item.id is null or mapped_target.target_id is null then
    raise exception
      'The delivered-Track characterization could not resolve its mapped target.';
  end if;

  insert into public.course_schedule_target_locks (
    course_id, version_id, academic_slot_id, mapping_revision_id,
    mapped_target_id, schedule_item_id, stable_slot_key, stable_item_key,
    target_snapshot, slot_starts_at, lock_at, locked_at, lock_source
  ) values (
    current_setting('test.governed_course_id')::uuid,
    current_setting('test.governed_v3_id')::uuid,
    mapped_target.academic_slot_id,
    mapped_target.mapping_revision_id,
    mapped_target.target_id,
    mechanics_item.id,
    mapped_target.stable_slot_key,
    mechanics_item.stable_item_key,
    jsonb_build_object(
      'stableSlotKey', mapped_target.stable_slot_key,
      'stableItemKey', mechanics_item.stable_item_key
    ),
    starts_at,
    starts_at - interval '6 hours',
    starts_at - interval '6 hours',
    'trusted_backfill'
  ) returning * into inserted_lock;

  insert into public.course_schedule_occurrence_outcome_events (
    course_id, version_id, academic_slot_id, target_lock_id,
    schedule_item_id, event_action, resolution_status, delivery_kind,
    lesson_origin, attendance_basis, charge_recommendation,
    actor_user_id, actor_role, public_explanation, occurred_at,
    response_deadline, dispute_deadline, fixed_at,
    settlement_not_before, metadata
  ) values (
    current_setting('test.governed_course_id')::uuid,
    current_setting('test.governed_v3_id')::uuid,
    mapped_target.academic_slot_id,
    inserted_lock.id,
    mechanics_item.id,
    'submitted',
    'delivered',
    'review',
    'recurring',
    'joint_presence_verified',
    'full_charge',
    current_setting('test.tutor_id')::uuid,
    'tutor',
    'The Class was delivered as Review without completing the target.',
    starts_at,
    clock_timestamp() + interval '1 day',
    clock_timestamp() + interval '2 days',
    clock_timestamp(),
    starts_at + interval '14 days',
    '{"characterization":"phase5g2473-delivered"}'::jsonb
  );

  if not public.course_schedule_item_has_started_work(
    current_setting('test.governed_course_id')::uuid,
    mechanics_item.id
  ) or not public.course_schedule_track_has_worked_progress(
    current_setting('test.governed_course_id')::uuid,
    current_setting('test.governed_v3_id')::uuid,
    null,
    'mechanics'
  ) then
    raise exception
      'A delivered Class did not establish started Track work.';
  end if;
end;
$delivered_class_starts_track_without_progress$;

-- A delivered Class is immutable occurrence history, but it does not complete
-- or date-lock the curriculum target when the Tutor intentionally leaves that
-- target unstudied. A later continuing cadence update may move the target.
select jsonb_set(
  :'governed_practiced_reflow_builder'::jsonb,
  '{id}',
  to_jsonb('phase5g24731-db-delivered-move'::text)
) as governed_delivered_move_builder \gset
select jsonb_set(
  jsonb_set(
    :'governed_practiced_reflow_items'::jsonb,
    '{2,scheduledDate}',
    to_jsonb((current_date + 56)::text)
  ),
  '{2,endDate}',
  to_jsonb((current_date + 56)::text)
) as governed_delivered_move_items \gset
select jsonb_build_array(jsonb_build_object(
  'changeType', 'reordered',
  'stableItemKey', 'phase5g244-mechanics',
  'reasonCode', 'pacing_adjustment',
  'studentExplanation',
    'The delivered Review remains in Class history while its unfinished target follows the revised cadence.'
)) as governed_delivered_move_reasons \gset
select set_config(
  'test.governed_delivered_move_builder',
  :'governed_delivered_move_builder',
  false
);
select set_config(
  'test.governed_delivered_move_items',
  :'governed_delivered_move_items',
  false
);
select set_config(
  'test.governed_delivered_move_reasons',
  :'governed_delivered_move_reasons',
  false
);

savepoint delivered_target_reflow;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $continuing_delivered_item_reflows$
declare
  response_payload jsonb;
  published_version_id uuid;
begin
  response_payload := public.publish_course_builder_schedule(
    current_setting('test.governed_course_id')::uuid,
    current_setting('test.governed_v3_id')::uuid,
    current_setting('test.governed_delivered_move_builder')::jsonb,
    current_setting('test.governed_delivered_move_items')::jsonb,
    current_setting('test.governed_delivered_move_reasons')::jsonb,
    'phase5g24731-db-delivered-move'
  );
  published_version_id :=
    nullif(response_payload ->> 'publishedVersionId', '')::uuid;
  if published_version_id is null then
    raise exception
      'Delivered-occurrence target reflow did not publish a successor.';
  end if;
  if not exists (
    select 1 from public.course_schedule_items item
    where item.version_id = published_version_id
      and item.stable_item_key = 'phase5g244-mechanics'
      and item.scheduled_date = current_date + 56
      and item.item_state in ('scheduled', 'requeued')
  ) then
    raise exception
      'A delivered Review incorrectly froze its unfinished curriculum target.';
  end if;
end;
$continuing_delivered_item_reflows$;
reset role;
rollback to savepoint delivered_target_reflow;

reset role;
select jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        :'governed_partial_builder'::jsonb,
        '{id}',
        to_jsonb('phase5g2473-db-delivered-track-removal'::text)
      ),
      '{context,trackTaxonomySlugs}',
      jsonb_build_array('algebra-1')
    ),
    '{context,coverage,primaryTrackKey}',
    to_jsonb('builder-algebra-1'::text)
  ),
  '{context,coverage,branches}',
  jsonb_build_array(
    :'governed_partial_builder'::jsonb
      #> '{context,coverage,branches,0}'
  )
) as governed_delivered_track_removal_builder \gset

select jsonb_set(
  :'governed_partial_items'::jsonb,
  '{2,state}',
  to_jsonb('dropped'::text)
) as governed_delivered_track_removal_items \gset

select jsonb_build_array(jsonb_build_object(
  'changeType', 'dropped',
  'stableItemKey', 'phase5g244-mechanics',
  'reasonCode', 'curriculum_adjustment',
  'studentExplanation',
    'This continuing revision must not detach a delivered Mechanics Class.'
)) as governed_delivered_track_removal_reasons \gset

select set_config(
  'test.governed_delivered_track_removal_builder',
  :'governed_delivered_track_removal_builder',
  false
);
select set_config(
  'test.governed_delivered_track_removal_items',
  :'governed_delivered_track_removal_items',
  false
);
select set_config(
  'test.governed_delivered_track_removal_reasons',
  :'governed_delivered_track_removal_reasons',
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $delivered_track_requires_new_schedule$
begin
  begin
    perform public.publish_course_builder_schedule(
      current_setting('test.governed_course_id')::uuid,
      current_setting('test.governed_v3_id')::uuid,
      current_setting('test.governed_delivered_track_removal_builder')::jsonb,
      current_setting('test.governed_delivered_track_removal_items')::jsonb,
      current_setting('test.governed_delivered_track_removal_reasons')::jsonb,
      'phase5g2473-db-delivered-track-removal'
    );
    raise exception 'Expected delivered Track removal to require a new Schedule.';
  exception when others then
    if sqlerrm = 'Expected delivered Track removal to require a new Schedule.' then
      raise;
    end if;
    if sqlerrm not like
      '%Studied, Practiced, or delivered work cannot be removed from a continuing Schedule%' then
      raise;
    end if;
  end;
  if (
    select active_schedule_version_id
    from public.student_courses
    where id = current_setting('test.governed_course_id')::uuid
  ) <> current_setting('test.governed_v3_id')::uuid then
    raise exception 'Rejected delivered Track removal changed the active Version.';
  end if;
  if exists (
    select 1
    from public.course_schedule_builder_publish_commands command
    where command.idempotency_key =
      'phase5g2473-db-delivered-track-removal'
  ) then
    raise exception
      'Rejected delivered Track removal retained a publication receipt.';
  end if;
end;
$delivered_track_requires_new_schedule$;

-- Removing the continuing Algebra Track now would detach Studied progress
-- while another old Track remains. The browser warns first, but the governed
-- publisher must independently reject this as a continuing revision.
select jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        :'governed_partial_builder'::jsonb,
        '{id}',
        to_jsonb('phase5g244-db-worked-track-removal'::text)
      ),
      '{context,trackTaxonomySlugs}',
      jsonb_build_array('mechanics')
    ),
    '{context,coverage,primaryTrackKey}',
    to_jsonb('builder-mechanics'::text)
  ),
  '{context,coverage,branches}',
  jsonb_build_array(
    jsonb_set(
      :'governed_partial_builder'::jsonb
        #> '{context,coverage,branches,1}',
      '{role}',
      to_jsonb('primary'::text)
    )
  )
) as governed_worked_track_removal_builder \gset

select jsonb_build_array(jsonb_build_object(
  'changeType', 'dropped',
  'stableItemKey', 'phase5g244-algebra',
  'reasonCode', 'curriculum_adjustment',
  'studentExplanation',
    'This continuing revision must not detach worked Algebra progress.'
)) as governed_worked_track_removal_reasons \gset

select set_config(
  'test.governed_worked_track_removal_builder',
  :'governed_worked_track_removal_builder',
  false
);
select set_config(
  'test.governed_worked_track_removal_items',
  :'governed_partial_items',
  false
);
select set_config(
  'test.governed_worked_track_removal_reasons',
  :'governed_worked_track_removal_reasons',
  false
);

do $worked_track_requires_new_schedule$
begin
  begin
    perform public.publish_course_builder_schedule(
      current_setting('test.governed_course_id')::uuid,
      current_setting('test.governed_v3_id')::uuid,
      current_setting('test.governed_worked_track_removal_builder')::jsonb,
      current_setting('test.governed_worked_track_removal_items')::jsonb,
      current_setting('test.governed_worked_track_removal_reasons')::jsonb,
      'phase5g244-db-worked-track-removal'
    );
    raise exception 'Expected worked Track removal to require a new Schedule.';
  exception when others then
    if sqlerrm = 'Expected worked Track removal to require a new Schedule.' then
      raise;
    end if;
    if sqlerrm not like
      '%Studied, Practiced, or delivered work cannot be removed from a continuing Schedule%' then
      raise;
    end if;
  end;
  if (
    select active_schedule_version_id
    from public.student_courses
    where id = current_setting('test.governed_course_id')::uuid
  ) <> current_setting('test.governed_v3_id')::uuid then
    raise exception 'Rejected worked Track removal changed the active Version.';
  end if;
  if exists (
    select 1
    from public.course_schedule_builder_publish_commands command
    where command.schedule_id = (
      select schedule.id
      from public.course_schedules schedule
      where schedule.course_id = current_setting('test.governed_course_id')::uuid
    )
      and command.idempotency_key = 'phase5g244-db-worked-track-removal'
  ) then
    raise exception 'Rejected worked Track removal retained a publication receipt.';
  end if;
end;
$worked_track_requires_new_schedule$;

select set_config('test.governed_v2_id', :'governed_v3_id', false);

reset role;
update public.teaching_qualifications
set status = 'revoked',
    revoked_by = :'mentor_id'::uuid,
    revoked_at = clock_timestamp(),
    reason = 'Phase 5.G.2.4.4 revocation characterization'
where user_id = :'tutor_id'::uuid
  and curriculum_node_id = '10000000-0000-4000-8000-000000000032'::uuid;

select set_config('test.governed_builder', :'governed_partial_builder', false);
select set_config('test.governed_items', :'governed_partial_items', false);
select set_config('test.governed_reasons', :'governed_partial_reasons', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $revoked_tutor_scope_blocks_whole_publication$
begin
  begin
    perform public.publish_course_builder_schedule(
      current_setting('test.governed_course_id')::uuid,
      current_setting('test.governed_v2_id')::uuid,
      current_setting('test.governed_builder')::jsonb,
      current_setting('test.governed_items')::jsonb,
      current_setting('test.governed_reasons')::jsonb,
      'phase5g244-db-revoked'
    );
    raise exception 'Expected a revoked Tutor branch to reject the whole publication.';
  exception when others then
    if sqlerrm = 'Expected a revoked Tutor branch to reject the whole publication.' then
      raise;
    end if;
    if sqlerrm not like '%assigned Tutor is not actively qualified%' then
      raise;
    end if;
  end;
  if (
    select active_schedule_version_id
    from public.student_courses
    where id = current_setting('test.governed_course_id')::uuid
  ) <> current_setting('test.governed_v2_id')::uuid then
    raise exception 'A rejected qualification check partially changed the active Version.';
  end if;
end;
$revoked_tutor_scope_blocks_whole_publication$;

-- A direct structural call cannot add a same-Subject Track that is absent from
-- the selected coverage, even when the assigned Tutor is qualified for it.
reset role;
insert into public.curriculum_nodes (
  id, parent_id, node_type, name, slug, description, status, sort_order, metadata
) values (
  '19900000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000012',
  'track',
  'Algebra 2 characterization',
  'algebra-2-characterization',
  'Transaction-local Phase 5.G.2.4.4 node.',
  'active',
  999,
  '{"characterization":"phase5g244"}'::jsonb
);
insert into public.teaching_qualifications (
  user_id, curriculum_node_id, status, granted_by, reason, metadata
) values (
  :'tutor_id'::uuid,
  '19900000-0000-4000-8000-000000000001',
  'active',
  :'mentor_id'::uuid,
  'Phase 5.G.2.4.4 bypass characterization',
  '{"characterization":"phase5g244"}'::jsonb
);

select coalesce(jsonb_agg(jsonb_build_object(
  'stableItemKey', item.stable_item_key,
  'title', item.title,
  'kind', item.item_kind,
  'curriculumNodeId', item.curriculum_node_id,
  'scheduledDate', item.scheduled_date,
  'endDate', item.end_date,
  'position', item.position,
  'state', item.item_state
) order by item.position), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
  'stableItemKey', 'phase5g244-direct-bypass',
  'title', 'Unauthorized direct Algebra 2 branch',
  'kind', 'curriculum_topic',
  'curriculumNodeId', '19900000-0000-4000-8000-000000000001',
  'scheduledDate', current_date + 50,
  'endDate', current_date + 50,
  'position', count(*),
  'state', 'scheduled'
)) as bypass_items
from public.course_schedule_items item
where item.version_id = :'governed_v3_id'::uuid \gset

select set_config('test.bypass_items', :'bypass_items', false);
set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $direct_structural_bypass_is_rejected$
begin
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.governed_course_id')::uuid,
      current_setting('test.governed_v2_id')::uuid,
      current_setting('test.bypass_items')::jsonb,
      jsonb_build_array(jsonb_build_object(
        'changeType', 'included',
        'stableItemKey', 'phase5g244-direct-bypass',
        'reasonCode', 'curriculum_adjustment',
        'studentExplanation', 'This direct branch must not bypass selected Schedule coverage.'
      )),
      'phase5g244-db-direct-bypass'
    );
    raise exception 'Expected the direct structural coverage bypass to fail.';
  exception when others then
    if sqlerrm = 'Expected the direct structural coverage bypass to fail.' then
      raise;
    end if;
    if sqlerrm not like '%must belong to the Course Subject%' then
      raise;
    end if;
  end;
end;
$direct_structural_bypass_is_rejected$;

reset role;

-- The frontend owns the one combined date/session lane. Publication validates
-- the Builder envelope and persists those exact dates without calculating a
-- second lane from the historical Course start.
do $frontend_combined_track_dates_persist_exactly$
declare
  builder_schedule jsonb := jsonb_build_object(
    'name', 'Combined cadence characterization',
    'startDate', current_date + 12,
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object(
      'type', 'weekly_frequency',
      'weekdays', jsonb_build_array(1, 6)
    ),
    'pacingMode', 'adaptive',
    'context', jsonb_build_object(
      'revisionMode', 'continuing_revision',
      'combinedCadenceAuthority', true
    )
  );
  proposed_items jsonb;
  reflowed_items jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'stableItemKey', format('phase5g247313-combined-%s', item_number),
    'title', format('Combined cadence Session %s', item_number),
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + item_number * 20,
    'endDate', current_date + item_number * 20,
    'position', item_number - 1,
    'state', 'scheduled',
    'sourceTrackKey', case
      when item_number <= 2 then 'geometry'
      when item_number <= 6 then 'fluids-and-thermodynamics'
      else 'trigonometry'
    end
  ) order by item_number)
  into proposed_items
  from generate_series(1, 9) item_number;

  reflowed_items := public.reflow_course_schedule_builder_items(
    current_setting('test.governed_course_id')::uuid,
    current_setting('test.governed_v3_id')::uuid,
    builder_schedule,
    proposed_items
  );

  if reflowed_items <> proposed_items then
    raise exception
      'Publication recalculated the frontend combined date/session lane.';
  end if;
end;
$frontend_combined_track_dates_persist_exactly$;

-- A replacement start belongs to the immutable active Version publication,
-- while student_courses.start_date remains the historical Course boundary.
update public.course_schedule_builder_publish_commands command
set request_payload = jsonb_set(
  command.request_payload,
  '{builderSchedule,startDate}',
  to_jsonb(current_date + 12),
  true
)
where command.published_version_id = :'governed_v3_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $active_plan_start_reopens_from_published_version$
declare
  builder_context jsonb := public.get_my_course_schedule_builder_context(
    current_setting('test.governed_course_id')::uuid
  );
begin
  if builder_context #>> '{schedule,activeStartDate}'
    <> (current_date + 12)::text then
    raise exception
      'The reopened Builder fell back to the historical Course start.';
  end if;
end;
$active_plan_start_reopens_from_published_version$;

reset role;

-- Replacing a future plan is not an in-place revision. The replacement may
-- establish any start from today onward, while the former Version remains in
-- history. This characterizes the exact stale-start defect seen in the Builder.
-- An earlier characterization intentionally revoked the Tutor's Mechanics
-- qualification. Restore that transaction-local fixture before creating this
-- independent Course; production qualification enforcement remains unchanged.
update public.teaching_qualifications
set status = 'active',
    revoked_by = null,
    revoked_at = null,
    reason = 'Phase 5.G replacement-start fixture qualification'
where user_id = :'tutor_id'::uuid
  and curriculum_node_id = '10000000-0000-4000-8000-000000000032'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.G replacement start boundary',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5g-replacement-start-initial',
    'name', 'Future Mechanics plan',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5g-replacement-start-old-a',
        'title', 'Future Mechanics A',
        'startDate', current_date + 14,
        'endDate', current_date + 14
      ),
      jsonb_build_object(
        'id', 'phase5g-replacement-start-old-b',
        'title', 'Future Mechanics B',
        'startDate', current_date + 21,
        'endDate', current_date + 21
      )
    )
  ),
  'phase5g-replacement-start-course'
) ->> 'id') as replacement_start_course_id \gset

select public.activate_student_course(:'replacement_start_course_id'::uuid);
select course.active_schedule_version_id as replacement_start_v1_id
from public.student_courses course
where course.id = :'replacement_start_course_id'::uuid \gset

select jsonb_set(
  :'governed_builder'::jsonb,
  '{startDate}',
  to_jsonb((current_date + 1)::text),
  true
) as replacement_start_builder \gset

select jsonb_build_array(
  jsonb_build_object(
    'stableItemKey', 'phase5g-replacement-start-algebra',
    'title', 'Replacement Algebra foundations',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 1,
    'endDate', current_date + 1,
    'position', 0,
    'state', 'scheduled',
    'sourceTrackKey', 'builder-algebra-1',
    'sourceModuleKey', 'builder-linear-module',
    'sourceSessionKey', 'builder-replacement-algebra-session',
    'sourceContentVersionKey', 'sha256:phase5g-replacement-algebra-v1',
    'sourceSubjectSlug', 'mathematics',
    'sourceTrackSlug', 'algebra-1',
    'resources', '[]'::jsonb
  ),
  jsonb_build_object(
    'stableItemKey', 'phase5g-replacement-start-calculus',
    'title', 'Replacement Calculus foundations',
    'kind', 'curriculum_topic',
    'scheduledDate', current_date + 2,
    'endDate', current_date + 2,
    'position', 1,
    'state', 'scheduled',
    'sourceTrackKey', 'builder-calculus-1',
    'sourceModuleKey', 'builder-calculus-module',
    'sourceSessionKey', 'builder-replacement-calculus-session',
    'sourceContentVersionKey', 'sha256:phase5g-replacement-calculus-v1',
    'sourceSubjectSlug', 'mathematics',
    'sourceTrackSlug', 'calculus-1',
    'resources', '[]'::jsonb
  )
) as replacement_start_items \gset

select jsonb_build_array(
  jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5g-replacement-start-algebra',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'The new plan starts with Algebra on the selected date.'
  ),
  jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5g-replacement-start-calculus',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'The new plan continues with Calculus.'
  )
) as replacement_start_reasons \gset

select public.publish_course_builder_schedule(
  :'replacement_start_course_id'::uuid,
  :'replacement_start_v1_id'::uuid,
  :'replacement_start_builder'::jsonb,
  :'replacement_start_items'::jsonb,
  :'replacement_start_reasons'::jsonb,
  'phase5g-replacement-start-publish'
);

select set_config(
  'test.replacement_start_course_id',
  :'replacement_start_course_id',
  false
);

reset role;
do $complete_replacement_owns_future_plan_start$
declare
  course_record public.student_courses%rowtype;
  bounds record;
begin
  select course.* into strict course_record
  from public.student_courses course
  where course.id = current_setting('test.replacement_start_course_id')::uuid;

  select * into bounds
  from public.course_schedule_version_date_bounds(
    course_record.active_schedule_version_id
  );

  if bounds.first_date <> current_date + 1
    or bounds.last_date <> current_date + 2
    or course_record.start_date <> current_date + 1
    or course_record.activated_start_date <> current_date + 1
    or course_record.scheduled_end_date <> current_date + 2 then
    raise exception
      'A complete replacement did not establish the selected future-plan start.';
  end if;

  if not exists (
    select 1
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = course_record.active_schedule_version_id
      and coverage.metadata ->> 'transitionKind' = 'complete_replacement'
  ) then
    raise exception 'The replacement-start fixture did not cross a complete replacement boundary.';
  end if;
end;
$complete_replacement_owns_future_plan_start$;

rollback;
