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

select (
  cardinality(array[
    :'mentor_id'::uuid, :'tutor_id'::uuid,
    :'student_a_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'mentor_id'::uuid, :'tutor_id'::uuid,
      :'student_a_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (
    select 1 from public.user_roles
    where user_id = :'mentor_id'::uuid
      and role_key = 'mentor'
      and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'tutor_id'::uuid
      and role_key in ('teacher', 'tutor')
      and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'student_a_id'::uuid
      and role_key = 'student'
      and status = 'active'
  )
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required Builder/effective-Schedule actors are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.mentor_id', :'mentor_id'::uuid::text, false);
select set_config('test.tutor_id', :'tutor_id'::uuid::text, false);
select set_config('test.student_id', :'student_a_id'::uuid::text, false);
select set_config('test.outsider_id', :'outsider_id'::uuid::text, false);
select set_config(
  'test.student_time_zone',
  coalesce(
    (
      select nullif(btrim(preferences.time_zone), '')
      from public.user_preferences preferences
      where preferences.user_id = :'student_a_id'::uuid
    ),
    'America/Sao_Paulo'
  ),
  false
);

-- Phase 5.G.2.4.4 requires the assigned Tutor to be actively qualified for
-- every selected branch before a Builder publication can create a successor.
-- This transaction-local fixture preserves the older Builder characterization
-- while exercising the current qualification boundary.
insert into public.teaching_qualifications (
  user_id, curriculum_node_id, status, granted_by, reason, metadata
) values (
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'active',
  :'mentor_id'::uuid,
  'Builder effective-Schedule characterization',
  '{"characterization":"phase5e4"}'::jsonb
)
on conflict (user_id, curriculum_node_id) do update
set status = 'active',
    revoked_by = null,
    revoked_at = null,
    reason = excluded.reason,
    metadata = excluded.metadata;

select subject.slug as subject_slug, focus.slug as focus_slug
from public.curriculum_nodes subject
join public.curriculum_nodes focus
  on focus.id = '10000000-0000-4000-8000-000000000032'::uuid
where subject.id = '10000000-0000-4000-8000-000000000013'::uuid
\gset
select set_config('test.subject_slug', :'subject_slug', false);
select set_config('test.focus_slug', :'focus_slug', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (
  public.create_student_course_with_schedule_draft(
    :'student_a_id'::uuid,
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'Phase 5.E.4 effective Mechanics',
    'kelp',
    'recurring',
    jsonb_build_object(
      'schemaVersion', 2,
      'id', 'phase5e4-db-schedule-v1',
      'name', 'Phase 5.E.4 Mechanics Schedule',
      'timeZone', 'America/Sao_Paulo',
      'cadence', jsonb_build_object('frequency', 'weekly'),
      'sessions', jsonb_build_array(
        jsonb_build_object(
          'id', 'phase5e4-db-original-a',
          'sourceTrackKey', 'builtin-track-mechanics',
          'sourceModuleKey', 'builtin-module-motion',
          'sourceModuleTitle', 'Module 1: Motion',
          'sourceSessionId', 'builtin-session-motion-a',
          'sourceContentVersionKey', 'sha256:phase5e4-motion-a',
          'sourceSubjectSlug', :'subject_slug',
          'sourceTrackSlug', :'focus_slug',
          'difficulty', 'medium',
          'title', 'Motion foundations',
          'startDate', current_date + 7,
          'endDate', current_date + 7,
          'resources', '[]'::jsonb
        ),
        jsonb_build_object(
          'id', 'phase5e4-db-original-b',
          'sourceTrackKey', 'builtin-track-mechanics',
          'sourceModuleKey', 'builtin-module-motion',
          'sourceModuleTitle', 'Module 1: Motion',
          'sourceSessionId', 'builtin-session-motion-b',
          'sourceContentVersionKey', 'sha256:phase5e4-motion-b',
          'sourceSubjectSlug', :'subject_slug',
          'sourceTrackSlug', :'focus_slug',
          'difficulty', 'high',
          'title', 'Motion representations',
          'startDate', current_date + 14,
          'endDate', current_date + 14,
          'resources', '[]'::jsonb
        ),
        jsonb_build_object(
          'id', 'phase5e4-db-legacy-placeholder',
          'title', 'Legacy placeholder without Track identity',
          'startDate', current_date + 28,
          'endDate', current_date + 28
        )
      )
    ),
    'phase5e4-db-effective-course'
  ) ->> 'id'
) as effective_course_id \gset

select public.activate_student_course(:'effective_course_id'::uuid);

select course.active_schedule_version_id as effective_v1_id
from public.student_courses course
where course.id = :'effective_course_id'::uuid
\gset

select set_config('test.effective_course_id', :'effective_course_id', false);
select set_config('test.effective_v1_id', :'effective_v1_id', false);

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_mixed_track_plan_hides_legacy_scaffold$
declare
  payload jsonb := public.get_my_effective_course_schedule(
    current_setting('test.effective_course_id')::uuid
  );
begin
  if jsonb_array_length(payload -> 'items') <> 2
    or payload #>> '{educationLevel,name}' <> 'High School'
    or payload #>> '{educationLevel,slug}' <> 'high-school'
    or payload #>> '{trackProgress,eligibleSessionCount}' <> '2'
    or payload #>> '{trackProgress,studiedCount}' <> '0'
    or payload #>> '{trackProgress,practicedCount}' <> '0'
    or payload #>> '{trackProgress,percent}' <> '0'
    or exists (
      select 1
      from jsonb_array_elements(payload -> 'items') item
      where item ->> 'stableItemKey' = 'phase5e4-db-legacy-placeholder'
    ) then
    raise exception 'The Student mixed Track plan exposed a source-less legacy curriculum scaffold.';
  end if;
end;
$student_mixed_track_plan_hides_legacy_scaffold$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $mentor_active_plan_matches_student_without_legacy_scaffold$
declare
  payload jsonb := public.get_my_effective_course_schedule(
    current_setting('test.effective_course_id')::uuid
  );
begin
  if jsonb_array_length(payload -> 'items') <> 2
    or payload #>> '{trackProgress,eligibleSessionCount}' <> '2'
    or payload #>> '{trackProgress,studiedCount}' <> '0'
    or payload #>> '{trackProgress,practicedCount}' <> '0'
    or exists (
      select 1
      from jsonb_array_elements(payload -> 'items') item
      where item ->> 'stableItemKey' = 'phase5e4-db-legacy-placeholder'
    ) then
    raise exception
      'The Mentor active plan diverged from the Student plan or exposed retained legacy scaffolding.';
  end if;
end;
$mentor_active_plan_matches_student_without_legacy_scaffold$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_builder_context$
declare
  payload jsonb := public.get_my_course_schedule_builder_context(
    current_setting('test.effective_course_id')::uuid
  );
begin
  if payload ->> 'schemaVersion' <> '4'
    or payload #>> '{schedule,activeVersionId}' <> current_setting('test.effective_v1_id')
    or payload #>> '{course,classroomId}' is null
    or payload #>> '{course,studentTimeZone}'
      <> current_setting('test.student_time_zone')
    or payload #>> '{course,subject,slug}' is null
    or payload #>> '{course,focus,slug}' is null
    or payload #>> '{schedule,coverage,displayLabel}' is null
    or payload #>> '{schedule,coverage,snapshot,branches,0,role}' <> 'primary'
    or jsonb_array_length(payload #> '{schedule,items}') <> 3
    or payload #>> '{permissions,canPublish}' <> 'true'
    or payload #>> '{permissions,canDraftMultipleTracks}' <> 'true'
    or payload #>> '{permissions,canPublishMultipleTracks}' <> 'true'
    or payload #>> '{permissions,requiresQualificationValidation}' <> 'true'
    or payload #>> '{permissions,courseScopeLocked}' <> 'false'
    or not exists (
      select 1
      from jsonb_array_elements(payload #> '{schedule,items}') item
      where item ->> 'stableItemKey' = 'phase5e4-db-original-a'
        and item ->> 'sourceSessionKey' = 'builtin-session-motion-a'
        and item ->> 'sourceContentVersionKey' = 'sha256:phase5e4-motion-a'
        and item ->> 'isDelivered' = 'false'
    )
    or exists (
      select 1
      from jsonb_array_elements(payload #> '{schedule,items}') item
      where item ->> 'isStudied' <> 'false'
    ) then
    raise exception 'The Tutor did not receive the governed Builder context.';
  end if;
end;
$tutor_builder_context$;

do $legacy_track_list_cannot_fake_multi_branch_coverage$
begin
  begin
    perform public.publish_course_builder_schedule(
      current_setting('test.effective_course_id')::uuid,
      current_setting('test.effective_v1_id')::uuid,
      jsonb_build_object(
        'id', 'phase5f5-db-multi-content',
        'name', 'Invalid legacy multi-content Classroom plan',
        'timeZone', 'America/Sao_Paulo',
        'cadence', jsonb_build_object(
          'type', 'day_interval',
          'intervalDays', 7
        ),
        'context', jsonb_build_object(
          'subjectTaxonomySlug', current_setting('test.subject_slug'),
          'trackTaxonomySlugs', jsonb_build_array(
            current_setting('test.focus_slug'),
            current_setting('test.focus_slug')
          )
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      'phase5f5-db-multi-content'
    );
    raise exception 'Expected the legacy Track list without Sessions to fail.';
  exception when others then
    if sqlerrm = 'Expected the legacy Track list without Sessions to fail.' then raise; end if;
    if sqlerrm not like '%requires at least one active governed Session%' then raise; end if;
  end;
end;
$legacy_track_list_cannot_fake_multi_branch_coverage$;

select public.publish_course_builder_schedule(
  :'effective_course_id'::uuid,
  :'effective_v1_id'::uuid,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5e4-db-builder-document',
    'name', 'Phase 5.E.4 Builder Schedule',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object(
      'type', 'day_interval',
      'intervalDays', 7
    ),
    'context', jsonb_build_object(
      'subjectTaxonomySlug', :'subject_slug',
      'trackTaxonomySlugs', jsonb_build_array(:'focus_slug')
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5e4-db-original-a',
      'title', 'Motion foundations',
      'kind', 'curriculum_topic',
      'curriculumNodeId', null,
      'scheduledDate', current_date + 7,
      'endDate', current_date + 7,
      'position', 0,
      'state', 'scheduled',
      'sourceTrackKey', 'builtin-track-mechanics',
      'sourceModuleKey', 'builtin-module-motion',
      'sourceModuleTitle', 'Module 1: Motion',
      'sourceSessionKey', 'builtin-session-motion-a',
      'sourceContentVersionKey', 'sha256:phase5e4-motion-a',
      'sourceSubjectSlug', :'subject_slug',
      'sourceTrackSlug', :'focus_slug',
      'difficulty', 'medium',
      'resources', '[]'::jsonb
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5e4-db-original-b',
      'title', 'Motion representations',
      'kind', 'curriculum_topic',
      'curriculumNodeId', null,
      'scheduledDate', current_date + 14,
      'endDate', current_date + 14,
      'position', 1,
      'state', 'scheduled',
      'sourceTrackKey', 'builtin-track-mechanics',
      'sourceModuleKey', 'builtin-module-motion',
      'sourceModuleTitle', 'Module 1: Motion',
      'sourceSessionKey', 'builtin-session-motion-b',
      'sourceContentVersionKey', 'sha256:phase5e4-motion-b',
      'sourceSubjectSlug', :'subject_slug',
      'sourceTrackSlug', :'focus_slug',
      'difficulty', 'high',
      'resources', '[]'::jsonb
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5e4-db-legacy-placeholder',
      'title', 'Legacy placeholder without Track identity',
      'kind', 'curriculum_topic',
      'curriculumNodeId', null,
      'scheduledDate', current_date + 28,
      'endDate', current_date + 28,
      'position', 2,
      'state', 'dropped'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5e4-db-builder-c',
      'title', 'Acceleration from the Kelp Track',
      'kind', 'curriculum_topic',
      'curriculumNodeId', '10000000-0000-4000-8000-000000000032',
      'scheduledDate', current_date + 21,
      'endDate', current_date + 21,
      'position', 3,
      'state', 'scheduled',
      'sourceTrackKey', 'builtin-track-mechanics',
      'sourceModuleKey', 'builtin-module-motion',
      'sourceModuleTitle', 'Module 1: Motion',
      'sourceSessionKey', 'builtin-session-acceleration',
      'sourceContentVersionKey', 'sha256:phase5e4-acceleration',
      'sourceSubjectSlug', :'subject_slug',
      'sourceTrackSlug', :'focus_slug',
      'difficulty', 'medium',
      'planningHref', '../schedules/mechanics/acceleration.html',
      'resources', '[]'::jsonb
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'changeType', 'dropped',
      'stableItemKey', 'phase5e4-db-legacy-placeholder',
      'reasonCode', 'curriculum_adjustment',
      'studentExplanation', 'The legacy placeholder was replaced by approved Track Sessions.'
    ),
    jsonb_build_object(
      'changeType', 'included',
      'stableItemKey', 'phase5e4-db-builder-c',
      'reasonCode', 'curriculum_adjustment',
      'studentExplanation', 'Acceleration was added from the approved Kelp Track.'
    )
  ),
  'phase5e4-db-builder-publish'
) as builder_publish \gset

select set_config(
  'test.effective_v2_id',
  :'builder_publish'::jsonb ->> 'publishedVersionId',
  false
);
select set_config('test.builder_publish', :'builder_publish', false);

do $builder_publication_created_successor$
declare
  publication jsonb := current_setting('test.builder_publish')::jsonb;
begin
  if publication ->> 'builderScheduleId'
      <> 'phase5e4-db-builder-document'
    or publication ->> 'versionNumber' <> '2'
    or not exists (
      select 1
      from public.course_schedule_items item
      where item.version_id = current_setting('test.effective_v2_id')::uuid
        and item.stable_item_key = 'phase5e4-db-builder-c'
        and item.curriculum_node_id = '10000000-0000-4000-8000-000000000032'::uuid
        and item.source_content_version_key = 'sha256:phase5e4-acceleration'
        and item.difficulty_level = 'intermediate'
    )
    or not exists (
      select 1
      from public.course_schedule_items item
      where item.version_id = current_setting('test.effective_v2_id')::uuid
        and item.stable_item_key = 'phase5e4-db-original-a'
        and item.curriculum_node_id is null
    )
    or not exists (
      select 1
      from public.course_schedule_items item
      where item.version_id = current_setting('test.effective_v2_id')::uuid
        and item.stable_item_key = 'phase5e4-db-legacy-placeholder'
        and item.item_state = 'dropped'
        and item.curriculum_node_id is null
        and item.source_track_key is null
        and item.source_module_key is null
    )
    or not exists (
      select 1
      from public.student_courses course
      join public.course_schedule_versions active_version
        on active_version.id = course.active_schedule_version_id
      where course.id = current_setting('test.effective_course_id')::uuid
        and active_version.id = current_setting('test.effective_v2_id')::uuid
        and active_version.previous_version_id
          = current_setting('test.effective_v1_id')::uuid
    ) then
    raise exception 'Builder publication did not create the expected immutable successor Version.';
  end if;
end;
$builder_publication_created_successor$;

do $stale_builder_publish_rejected$
declare
  stale_items jsonb;
begin
  select jsonb_agg(
    item.source_snapshot || jsonb_build_object(
      'stableItemKey', item.stable_item_key,
      'title', item.title,
      'kind', item.item_kind,
      'curriculumNodeId', item.curriculum_node_id,
      'scheduledDate', item.scheduled_date,
      'endDate', item.end_date,
      'position', item.position,
      'state', item.item_state
    )
    order by item.position, item.id
  )
  into stale_items
  from public.course_schedule_items item
  where item.version_id = current_setting('test.effective_v1_id')::uuid;

  if stale_items is null or jsonb_array_length(stale_items) = 0 then
    raise exception 'The stale Builder fixture did not retain version 1 items.';
  end if;

  begin
    perform public.publish_course_builder_schedule(
      current_setting('test.effective_course_id')::uuid,
      current_setting('test.effective_v1_id')::uuid,
      jsonb_build_object(
        'id', 'phase5e4-db-stale-builder',
        'name', 'Stale Builder',
        'timeZone', 'America/Sao_Paulo',
        'context', jsonb_build_object(
          'subjectTaxonomySlug', current_setting('test.subject_slug'),
          'trackTaxonomySlugs', jsonb_build_array(current_setting('test.focus_slug'))
        )
      ),
      stale_items,
      '[]'::jsonb,
      'phase5e4-db-stale-publish'
    );
    raise exception 'Expected stale Builder publication to fail.';
  exception when others then
    if sqlerrm = 'Expected stale Builder publication to fail.' then raise; end if;
    if sqlerrm not like '%changed after this page loaded%' then raise; end if;
  end;
end;
$stale_builder_publish_rejected$;

select item.id as later_item_id
from public.course_schedule_items item
where item.version_id = current_setting('test.effective_v2_id')::uuid
  and item.stable_item_key = 'phase5e4-db-original-b'
\gset
select set_config('test.later_item_id', :'later_item_id', false);

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'effective_course_id'::uuid,
  :'later_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  'I studied this topic independently before its planned date.',
  null,
  null,
  'phase5e4-db-later-topic-studied'
);

do $student_effective_schedule_reorders_progress$
declare
  payload jsonb := public.get_my_effective_course_schedule(
    current_setting('test.effective_course_id')::uuid
  );
  first_item jsonb := payload #> '{items,0}';
  second_item jsonb := payload #> '{items,1}';
begin
  if payload #>> '{featureStatus,effectiveSchedule}' <> 'active_phase_5e4'
    or payload #>> '{permissions,actorRole}' <> 'student'
    or first_item ->> 'stableItemKey' <> 'phase5e4-db-original-b'
    or first_item ->> 'sequenceState' <> 'studied'
    or first_item #>> '{source,moduleTitle}' <> 'Module 1: Motion'
    or first_item ->> 'effectiveTimestamp' is null
    or first_item ->> 'effectiveDate' = first_item ->> 'plannedDate'
    or second_item ->> 'stableItemKey' <> 'phase5e4-db-original-a'
    or second_item ->> 'sequenceState' <> 'next'
    or jsonb_array_length(payload -> 'items') <> 3
    or payload #>> '{trackProgress,eligibleSessionCount}' <> '3'
    or payload #>> '{trackProgress,studiedCount}' <> '1'
    or payload #>> '{trackProgress,practicedCount}' <> '0'
    or payload #>> '{trackProgress,totalUnitCount}' <> '6'
    or payload #>> '{trackProgress,completedUnitCount}' <> '1'
    or payload #>> '{trackProgress,percent}' <> '17'
    or payload #>> '{trackProgress,reviewedAffectsPercent}' <> 'false'
    or payload #>> '{featureStatus,trackProgress}' <> 'active_phase_5h_home' then
    raise exception 'The Student effective Schedule did not combine plan order and actual progress.';
  end if;
end;
$student_effective_schedule_reorders_progress$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $tutor_builder_context_identifies_studied_lock$
declare
  payload jsonb := public.get_my_course_schedule_builder_context(
    current_setting('test.effective_course_id')::uuid
  );
begin
  if not exists (
    select 1
    from jsonb_array_elements(payload #> '{schedule,items}') item
    where item ->> 'stableItemKey' = 'phase5e4-db-original-b'
      and item ->> 'isStudied' = 'true'
  ) then
    raise exception 'The governed Builder context did not identify the immutable Studied item.';
  end if;
end;
$tutor_builder_context_identifies_studied_lock$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.save_my_classroom_schedule_module_style(
  :'effective_course_id'::uuid,
  'builtin-module-motion',
  '#5b8def',
  '#8b6fc0',
  'Custom'
);

do $student_module_style_is_personal_presentation$
declare
  payload jsonb := public.get_my_effective_course_schedule(
    current_setting('test.effective_course_id')::uuid
  );
begin
  if payload #>> '{permissions,canCustomizeModuleStyle}' <> 'true'
    or payload #>> '{moduleStyles,builtin-module-motion,headerColor}' <> '#5b8def'
    or payload #>> '{moduleStyles,builtin-module-motion,stripeColor}' <> '#8b6fc0'
    or exists (
      select 1
      from public.student_courses course
      join public.course_schedule_versions version
        on version.id = course.active_schedule_version_id
      where course.id = current_setting('test.effective_course_id')::uuid
        and version.source_snapshot ? 'moduleStyles'
    ) then
    raise exception 'Student module colors were not stored as private presentation metadata.';
  end if;
end;
$student_module_style_is_personal_presentation$;

select public.save_my_classroom_schedule_pdf_style(
  :'effective_course_id'::uuid,
  '#224466',
  '#112233'
);

do $student_pdf_style_is_personal_presentation$
declare
  payload jsonb := public.get_my_effective_course_schedule(
    current_setting('test.effective_course_id')::uuid
  );
begin
  if payload #>> '{permissions,canCustomizePdfStyle}' <> 'true'
    or payload #>> '{pdfStyle,ruleColor}' <> '#224466'
    or payload #>> '{pdfStyle,textColor}' <> '#112233' then
    raise exception 'Student PDF colors were not stored as private presentation metadata.';
  end if;
end;
$student_pdf_style_is_personal_presentation$;

reset role;
update public.user_preferences
set time_zone = 'Asia/Damascus', time_zone_confirmed_at = clock_timestamp()
where user_id = current_setting('test.student_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_effective_schedule_follows_profile_timezone$
declare
  payload jsonb := public.get_my_effective_course_schedule(
    current_setting('test.effective_course_id')::uuid
  );
begin
  if payload ->> 'timeZone' <> 'Asia/Damascus' then
    raise exception 'The Student effective Schedule did not inherit the current Profile timezone.';
  end if;
  if not exists (
    select 1
    from public.student_courses course
    join public.course_schedule_versions version
      on version.id = course.active_schedule_version_id
    where course.id = current_setting('test.effective_course_id')::uuid
      and version.time_zone = 'America/Sao_Paulo'
  ) then
    raise exception 'The Student timezone projection rewrote immutable Schedule Version history.';
  end if;
end;
$student_effective_schedule_follows_profile_timezone$;

do $student_builder_context_denied$
begin
  begin
    perform public.get_my_course_schedule_builder_context(
      current_setting('test.effective_course_id')::uuid
    );
    raise exception 'Expected Student Builder access to fail.';
  exception when others then
    if sqlerrm = 'Expected Student Builder access to fail.' then raise; end if;
    if sqlerrm not like '%assigned Tutor or supervising Mentor%' then raise; end if;
  end;
end;
$student_builder_context_denied$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $mentor_builder_context$
begin
  if public.get_my_course_schedule_builder_context(
    current_setting('test.effective_course_id')::uuid
  ) #>> '{schedule,versionNumber}' <> '2'
    or public.get_my_course_schedule_builder_context(
      current_setting('test.effective_course_id')::uuid
    ) #>> '{course,studentTimeZone}' <> 'Asia/Damascus' then
    raise exception 'The Mentor did not receive the latest Builder context.';
  end if;
end;
$mentor_builder_context$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_module_style_denied$
begin
  begin
    perform public.save_my_classroom_schedule_module_style(
      current_setting('test.effective_course_id')::uuid,
      'builtin-module-motion',
      '#5b8def',
      '#8b6fc0',
      'Custom'
    );
    raise exception 'Expected outsider module-style access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider module-style access to fail.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$outsider_module_style_denied$;

do $outsider_pdf_style_denied$
begin
  begin
    perform public.save_my_classroom_schedule_pdf_style(
      current_setting('test.effective_course_id')::uuid,
      '#224466',
      '#112233'
    );
    raise exception 'Expected outsider PDF-style access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider PDF-style access to fail.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$outsider_pdf_style_denied$;

do $outsider_effective_schedule_denied$
begin
  begin
    perform public.get_my_effective_course_schedule(
      current_setting('test.effective_course_id')::uuid
    );
    raise exception 'Expected outsider effective Schedule access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider effective Schedule access to fail.' then raise; end if;
    if sqlerrm not like '%private to the Student and assigned academic staff%' then raise; end if;
  end;
end;
$outsider_effective_schedule_denied$;

rollback;
