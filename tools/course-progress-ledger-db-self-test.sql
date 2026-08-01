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
\if :{?student_b_id}
\else
  \echo 'Missing required actor variable: student_b_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

begin;
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.E.2 progress Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 2,
    'id', 'phase5e2-db-schedule-v1',
    'name', 'Phase 5.E.2 Mechanics Schedule',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5e2-db-motion',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-kinematics',
        'sourceSessionId', 'builtin-session-motion',
        'sourceContentVersionKey', 'track-session:motion:v1',
        'planningHref', '../schedules/mechanics/motion.html',
        'difficulty', 'low',
        'title', 'Motion foundations',
        'startDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
        'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
        'resources', jsonb_build_array(
          jsonb_build_object(
            'stableResourceKey', 'motion-openstax',
            'providerKey', 'openstax',
            'title', 'OpenStax motion reading',
            'resourceKind', 'textbook',
            'href', 'https://openstax.org/',
            'requirementState', 'required',
            'sourceContentVersionKey', 'resource:motion-openstax:v1',
            'position', 0
          ),
          jsonb_build_object(
            'stableResourceKey', 'motion-ixl',
            'providerKey', 'ixl',
            'title', 'IXL motion practice',
            'resourceKind', 'practice',
            'href', 'https://www.ixl.com/',
            'requirementState', 'not_assigned',
            'position', 1
          )
        )
      ),
      jsonb_build_object(
        'id', 'phase5e2-db-forces',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-forces',
        'sourceSessionId', 'builtin-session-forces',
        'sourceContentVersionKey', 'track-session:forces:v1',
        'planningHref', '../schedules/mechanics/forces.html',
        'difficulty', 'high',
        'title', 'Forces and interactions',
        'startDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
        'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
        'resources', '[]'::jsonb
      )
    )
  ),
  'phase5e2-db-progress-course'
) ->> 'id') as progress_course_id \gset
select public.activate_student_course(:'progress_course_id'::uuid);

select course.active_schedule_version_id as progress_v1_id
from public.student_courses course
where course.id = :'progress_course_id'::uuid \gset

select item.id as motion_item_id
from public.course_schedule_items item
where item.version_id = :'progress_v1_id'::uuid
  and item.stable_item_key = 'phase5e2-db-motion' \gset

select item.id as forces_item_id
from public.course_schedule_items item
where item.version_id = :'progress_v1_id'::uuid
  and item.stable_item_key = 'phase5e2-db-forces' \gset

select resource.id as required_resource_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'motion_item_id'::uuid
  and resource.stable_resource_key = 'motion-openstax' \gset

select resource.id as hidden_resource_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'motion_item_id'::uuid
  and resource.stable_resource_key = 'motion-ixl' \gset

select classroom.id as progress_classroom_id
from public.classrooms classroom
where classroom.course_id = :'progress_course_id'::uuid \gset

reset role;
insert into public.classroom_memberships (
  classroom_id, user_id, membership_role, status
) values (
  :'progress_classroom_id'::uuid,
  :'student_b_id'::uuid,
  'guardian',
  'active'
);

select set_config('test.progress_course_id', :'progress_course_id', false);
select set_config('test.progress_v1_id', :'progress_v1_id', false);
select set_config('test.motion_item_id', :'motion_item_id', false);
select set_config('test.forces_item_id', :'forces_item_id', false);
select set_config('test.required_resource_id', :'required_resource_id', false);
select set_config('test.hidden_resource_id', :'hidden_resource_id', false);

-- A Student may independently study a later Session without supplying a reason.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'progress_course_id'::uuid,
  :'forces_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  'I found this topic easier than expected.',
  null,
  null,
  'phase5e2-db-student-forces-mark'
) as forces_mark \gset
select set_config('test.forces_mark_id', :'forces_mark'::jsonb ->> 'eventId', false);

-- A Studied mark freezes the exact Version/epoch, authored cadence, and the
-- nearest-first predecessor chain needed for a later deterministic reversal.
reset role;
do $studied_restoration_provenance_captured$
declare
  provenance public.course_progress_restoration_provenance%rowtype;
  expected_epoch uuid;
begin
  select restoration.* into provenance
  from public.course_progress_restoration_provenance restoration
  where restoration.progress_event_id =
    current_setting('test.forces_mark_id')::uuid;

  select coalesce(
    nullif(coverage.metadata ->> 'planEpochId', '')::uuid,
    version.schedule_id
  ) into expected_epoch
  from public.course_schedule_versions version
  left join public.course_schedule_version_coverages coverage
    on coverage.version_id = version.id
  where version.id = current_setting('test.progress_v1_id')::uuid;

  if provenance.progress_event_id is null
    or provenance.course_id <> current_setting('test.progress_course_id')::uuid
    or provenance.schedule_version_id <> current_setting('test.progress_v1_id')::uuid
    or provenance.stable_item_key <> 'phase5e2-db-forces'
    or provenance.plan_epoch_id <> expected_epoch
    or provenance.marked_cadence <> jsonb_build_object('frequency', 'weekly')
    or provenance.predecessor_stable_item_keys
      <> jsonb_build_array('phase5e2-db-motion') then
    raise exception 'The Studied mark did not freeze its deterministic restoration provenance.';
  end if;
end;
$studied_restoration_provenance_captured$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);

-- Exact idempotent retry returns the original receipt without duplicating facts.
select public.record_course_progress(
  :'progress_course_id'::uuid,
  :'forces_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  'I found this topic easier than expected.',
  null,
  null,
  'phase5e2-db-student-forces-mark'
);

do $student_stale_mark_rejected$
begin
  begin
    perform public.record_course_progress(
      current_setting('test.progress_course_id')::uuid,
      current_setting('test.forces_item_id')::uuid,
      null,
      'studied',
      null,
      null,
      null,
      null,
      null,
      'phase5e2-db-student-forces-stale'
    );
    raise exception 'Expected a stale Course progress mark to fail.';
  exception when others then
    if sqlerrm = 'Expected a stale Course progress mark to fail.' then raise; end if;
    if sqlerrm not like '%changed while this page was open%' then raise; end if;
  end;
end;
$student_stale_mark_rejected$;

do $student_mark_contract$
begin
  if has_table_privilege('authenticated', 'public.course_progress_events', 'select')
    or has_table_privilege('authenticated', 'public.course_progress_commands', 'select') then
    raise exception 'Raw progress history is directly readable by the Student browser role.';
  end if;

  if (
    select count(*) from public.course_progress_notification_events
    where progress_event_id = current_setting('test.forces_mark_id')::uuid
  ) <> 1 then
    raise exception 'The Student should read only their own Studied notification fact.';
  end if;
end;
$student_mark_contract$;

-- Students cannot reverse Studied progress themselves.
do $student_studied_reversal_denied$
begin
  begin
    perform public.reverse_course_progress(
      current_setting('test.progress_course_id')::uuid,
      current_setting('test.forces_item_id')::uuid,
      null,
      'studied',
      current_setting('test.forces_mark_id')::uuid,
      null,
      null,
      null,
      'phase5e2-db-student-forces-reverse'
    );
    raise exception 'Expected the Student Studied reversal to fail.';
  exception when others then
    if sqlerrm = 'Expected the Student Studied reversal to fail.' then raise; end if;
    if sqlerrm not like '%ask their Tutor%' then raise; end if;
  end;
end;
$student_studied_reversal_denied$;

-- Assigned resources remain Student-controlled; unassigned resources cannot be marked.
select public.record_course_progress(
  :'progress_course_id'::uuid,
  :'motion_item_id'::uuid,
  :'required_resource_id'::uuid,
  'practiced',
  null,
  null,
  'The examples helped me check my understanding.',
  null,
  null,
  'phase5e2-db-student-resource-practiced'
) as practiced_mark \gset
select set_config('test.practiced_mark_id', :'practiced_mark'::jsonb ->> 'eventId', false);

do $hidden_resource_denied$
begin
  begin
    perform public.record_course_progress(
      current_setting('test.progress_course_id')::uuid,
      current_setting('test.motion_item_id')::uuid,
      current_setting('test.hidden_resource_id')::uuid,
      'studied',
      null,
      null,
      null,
      null,
      null,
      'phase5e2-db-hidden-resource-mark'
    );
    raise exception 'Expected the unassigned-resource mark to fail.';
  exception when others then
    if sqlerrm = 'Expected the unassigned-resource mark to fail.' then raise; end if;
    if sqlerrm not like '%unassigned resource%' then raise; end if;
  end;
end;
$hidden_resource_denied$;

select public.reverse_course_progress(
  :'progress_course_id'::uuid,
  :'motion_item_id'::uuid,
  :'required_resource_id'::uuid,
  'practiced',
  (:'practiced_mark'::jsonb ->> 'eventId')::uuid,
  null,
  null,
  null,
  'phase5e2-db-student-resource-unpractice'
) as practiced_reversal \gset

-- Student Session progress uses server time and supports append-only reflection amendments.
select public.record_course_progress(
  :'progress_course_id'::uuid,
  :'motion_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  'The motion diagrams made sense after practice.',
  null,
  null,
  'phase5e2-db-student-motion-mark'
) as motion_mark \gset
select set_config('test.motion_mark_id', :'motion_mark'::jsonb ->> 'eventId', false);

select public.amend_my_course_progress_reflection(
  :'progress_course_id'::uuid,
  :'motion_item_id'::uuid,
  null,
  'studied',
  (:'motion_mark'::jsonb ->> 'eventId')::uuid,
  'The motion diagrams made sense after a second practice set.',
  'phase5e2-db-student-motion-reflection'
) as reflection_amendment \gset
select set_config(
  'test.motion_reflection_event_id',
  :'reflection_amendment'::jsonb ->> 'eventId',
  false
);

do $student_projection_contract$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.progress_course_id')::uuid
  );
begin
  if payload #>> '{permissions,actorRole}' <> 'student'
    or payload #>> '{permissions,canMarkResource}' <> 'true'
    or payload #>> '{permissions,canReverseStudied}' <> 'false'
    or not exists (
      select 1 from jsonb_array_elements(payload -> 'states') state
      where state ->> 'stableItemKey' = 'phase5e2-db-motion'
        and state ->> 'progressKind' = 'studied'
        and state ->> 'state' = 'marked'
        and state ->> 'reflection'
          = 'The motion diagrams made sense after a second practice set.'
    )
    or exists (
      select 1 from jsonb_array_elements(payload -> 'history') event
      where event ->> 'privateStaffNote' is not null
    ) then
    raise exception 'The Student progress projection is invalid.';
  end if;
end;
$student_projection_contract$;

-- Tutor reverses the later Student mark, then needs a reason to mark it again
-- while Motion remains the current expected topic.
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.reverse_course_progress(
  :'progress_course_id'::uuid,
  :'motion_item_id'::uuid,
  null,
  'studied',
  current_setting('test.motion_reflection_event_id')::uuid,
  null,
  'Motion was reopened because the Student requested another explanation.',
  'The prior reflection remains in the immutable progress history.',
  'phase5e2-db-tutor-motion-reverse'
) as motion_reversal \gset

select public.reverse_course_progress(
  :'progress_course_id'::uuid,
  :'forces_item_id'::uuid,
  null,
  'studied',
  (:'forces_mark'::jsonb ->> 'eventId')::uuid,
  null,
  'The learner asked to revisit Forces after more Motion practice.',
  'Internal note retained for academic continuity.',
  'phase5e2-db-tutor-forces-reverse'
) as forces_reversal \gset
select set_config('test.forces_reversal_id', :'forces_reversal'::jsonb ->> 'eventId', false);

do $later_topic_reason_required$
begin
  begin
    perform public.record_course_progress(
      current_setting('test.progress_course_id')::uuid,
      current_setting('test.forces_item_id')::uuid,
      null,
      'studied',
      current_setting('test.forces_reversal_id')::uuid,
      null,
      null,
      null,
      null,
      'phase5e2-db-tutor-forces-no-reason'
    );
    raise exception 'Expected the later-topic Tutor mark to require a reason.';
  exception when others then
    if sqlerrm = 'Expected the later-topic Tutor mark to require a reason.' then raise; end if;
    if sqlerrm not like '%academic reason%' then raise; end if;
  end;
end;
$later_topic_reason_required$;

select public.record_course_progress(
  :'progress_course_id'::uuid,
  :'forces_item_id'::uuid,
  null,
  'studied',
  (:'forces_reversal'::jsonb ->> 'eventId')::uuid,
  null,
  null,
  'The Student demonstrated the later Forces objective during guided work.',
  'Back-report evidence remains visible only to academic staff.',
  'phase5e2-db-tutor-forces-remark'
) as forces_remark \gset
select set_config('test.forces_remark_id', :'forces_remark'::jsonb ->> 'eventId', false);

-- Tutors cannot take over Student-controlled resource indicators.
do $tutor_resource_denied$
begin
  begin
    perform public.record_course_progress(
      current_setting('test.progress_course_id')::uuid,
      current_setting('test.motion_item_id')::uuid,
      current_setting('test.required_resource_id')::uuid,
      'reviewed',
      null,
      null,
      null,
      null,
      null,
      'phase5e2-db-tutor-resource-reviewed'
    );
    raise exception 'Expected the Tutor resource mark to fail.';
  exception when others then
    if sqlerrm = 'Expected the Tutor resource mark to fail.' then raise; end if;
    if sqlerrm not like '%Session-level Studied%' then raise; end if;
  end;
end;
$tutor_resource_denied$;

do $staff_projection_contract$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.progress_course_id')::uuid
  );
begin
  if payload #>> '{permissions,actorRole}' <> 'tutor'
    or payload #>> '{permissions,canReadPrivateStaffNotes}' <> 'true'
    or not exists (
      select 1 from jsonb_array_elements(payload -> 'history') event
      where event ->> 'id' = current_setting('test.forces_reversal_id')
        and event ->> 'privateStaffNote'
          = 'Internal note retained for academic continuity.'
    )
    or not exists (
      select 1 from jsonb_array_elements(payload -> 'history') event
      where event ->> 'id' = current_setting('test.motion_reflection_event_id')
        and event ->> 'reflection'
          = 'The motion diagrams made sense after a second practice set.'
    ) then
    raise exception 'The assigned Tutor did not receive the complete academic progress history.';
  end if;
end;
$staff_projection_contract$;

-- A successor Version may preserve Studied items exactly, but it cannot move them.
do $studied_reorder_rejected$
begin
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.progress_course_id')::uuid,
      current_setting('test.progress_v1_id')::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'stableItemKey', 'phase5e2-db-forces',
          'title', 'Forces and interactions',
          'kind', 'curriculum_topic',
          'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
          'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
          'position', 0,
          'state', 'scheduled'
        ),
        jsonb_build_object(
          'stableItemKey', 'phase5e2-db-motion',
          'title', 'Motion foundations',
          'kind', 'curriculum_topic',
          'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
          'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
          'position', 1,
          'state', 'scheduled'
        )
      ),
      jsonb_build_array(jsonb_build_object(
        'changeType', 'reordered',
        'stableItemKey', 'phase5e2-db-motion',
        'reasonCode', 'pacing_adjustment',
        'studentExplanation', 'This attempted revision should be rejected because the topics are already Studied.'
      )),
      'phase5e2-db-studied-reorder'
    );
    raise exception 'Expected the Studied Schedule reorder to fail.';
  exception when others then
    if sqlerrm = 'Expected the Studied Schedule reorder to fail.' then raise; end if;
    if sqlerrm not like '%Studied Schedule item%' then raise; end if;
  end;
end;
$studied_reorder_rejected$;

select public.publish_course_schedule_version(
  :'progress_course_id'::uuid,
  :'progress_v1_id'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5e2-db-motion',
      'title', 'Motion foundations',
      'kind', 'curriculum_topic',
      'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
      'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
      'position', 0,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5e2-db-forces',
      'title', 'Forces and interactions',
      'kind', 'curriculum_topic',
      'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
      'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
      'position', 1,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5e2-db-energy-review',
      'title', 'Energy review',
      'kind', 'review',
      'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 14,
      'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 14,
      'position', 2,
      'state', 'scheduled'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5e2-db-energy-review',
    'reasonCode', 'review_required',
    'studentExplanation', 'A final review was added without changing either completed curriculum topic.'
  )),
  'phase5e2-db-preserve-studied-v2'
) as preserved_version \gset

reset role;
select course.active_schedule_version_id as progress_v2_id
from public.student_courses course
where course.id = :'progress_course_id'::uuid \gset
select set_config('test.progress_v2_id', :'progress_v2_id', false);
select item.id as forces_v2_item_id
from public.course_schedule_items item
where item.version_id = :'progress_v2_id'::uuid
  and item.stable_item_key = 'phase5e2-db-forces' \gset

reset role;
do $adaptive_course_end_contracts_before_restoration$
declare
  today_date date :=
    (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  effective_end date := public.course_schedule_effective_plan_end(
    current_setting('test.progress_course_id')::uuid
  );
begin
  if effective_end is distinct from today_date + 7 then
    raise exception
      'Adaptive Course End did not contract before Studied restoration.';
  end if;
end;
$adaptive_course_end_contracts_before_restoration$;

-- A governed Studied reversal during wind-down reopens the Course.
update public.student_courses
set status = 'wind_down'
where id = :'progress_course_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.reverse_course_progress(
  :'progress_course_id'::uuid,
  :'forces_v2_item_id'::uuid,
  null,
  'studied',
  (:'forces_remark'::jsonb ->> 'eventId')::uuid,
  null,
  'Forces was reopened because the learner needs another guided explanation.',
  'Mentor correction reopened the active academic Schedule.',
  'phase5e2-db-mentor-winddown-reversal'
) as winddown_reversal \gset

reset role;
do $studied_reversal_uses_predecessor_provenance_and_current_lane$
declare
  restored_order text[];
  today_date date :=
    (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  effective_end date := public.course_schedule_effective_plan_end(
    current_setting('test.progress_course_id')::uuid
  );
  mapping jsonb := public.course_schedule_target_mapping_snapshot(
    current_setting('test.progress_course_id')::uuid,
    current_setting('test.progress_v2_id')::uuid
  );
begin
  select array_agg(
    ordering.stable_item_key
    order by ordering.restoration_ordinal
  ) into restored_order
  from public.course_schedule_adaptive_item_order(
    current_setting('test.progress_course_id')::uuid,
    current_setting('test.progress_v2_id')::uuid
  ) ordering;

  if restored_order[1] <> 'phase5e2-db-motion'
    or restored_order[2] <> 'phase5e2-db-forces'
    or restored_order[3] <> 'phase5e2-db-energy-review' then
    raise exception
      'The Studied reversal did not restore the Session from predecessor provenance.';
  end if;

  if mapping #>> '{restorationOrdering,mode}'
      <> 'predecessor_provenance_current_cadence'
    or mapping #>> '{slotMappings,0,targetStableItemKey}'
      <> 'phase5e2-db-motion'
    or mapping #>> '{slotMappings,1,targetStableItemKey}'
      <> 'phase5e2-db-forces' then
    raise exception
      'The restored Session did not consume the active cadence lane.';
  end if;

  if effective_end is distinct from today_date + 14 then
    raise exception
      'Adaptive Course End did not expand after Studied reversal.';
  end if;
end;
$studied_reversal_uses_predecessor_provenance_and_current_lane$;

do $winddown_and_notifications$
begin
  if not exists (
    select 1 from public.student_courses course
    where course.id = current_setting('test.progress_course_id')::uuid
      and course.status = 'active'
  ) then
    raise exception 'A Studied reversal during wind-down did not reopen the Course.';
  end if;

  if (
    select count(*)
    from public.course_progress_notification_events notification
    where notification.progress_event_id = current_setting('test.forces_mark_id')::uuid
  ) <> 2 then
    raise exception 'A Student Studied mark did not notify exactly the Student and assigned Tutor.';
  end if;

  if exists (
    select 1
    from public.course_progress_notification_events notification
    where notification.progress_event_id = current_setting('test.forces_mark_id')::uuid
      and notification.recipient_user_id = current_setting('test.mentor_id')::uuid
  ) then
    raise exception 'A routine Student progress action unnecessarily notified the Mentor.';
  end if;
end;
$winddown_and_notifications$;

-- Guardians and outsiders do not receive lesson-level progress/reflection history.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $guardian_progress_denied$
begin
  begin
    perform public.get_my_course_progress(current_setting('test.progress_course_id')::uuid);
    raise exception 'Expected Guardian progress access to fail.';
  exception when others then
    if sqlerrm = 'Expected Guardian progress access to fail.' then raise; end if;
    if sqlerrm not like '%private to the Student and assigned academic staff%' then raise; end if;
  end;
end;
$guardian_progress_denied$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_progress_denied$
begin
  begin
    perform public.get_my_course_progress(current_setting('test.progress_course_id')::uuid);
    raise exception 'Expected outsider progress access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider progress access to fail.' then raise; end if;
    if sqlerrm not like '%private to the Student and assigned academic staff%' then raise; end if;
  end;
end;
$outsider_progress_denied$;

-- An activated Course may legitimately be waiting for its first planned
-- Session. Ordinary staff actions use authoritative server time and remain
-- valid before that date; only an explicitly supplied back-report timestamp
-- is bounded by the Course start.
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select (
  public.create_student_course_with_schedule_draft(
    :'student_a_id'::uuid,
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'Phase 5 progress pre-start authority',
    'kelp',
    'recurring',
    jsonb_build_object(
      'schemaVersion', 2,
      'id', 'phase5-progress-prestart-schedule',
      'name', 'Phase 5 progress pre-start Schedule',
      'timeZone', 'America/Sao_Paulo',
      'cadence', jsonb_build_object('frequency', 'weekly'),
      'sessions', jsonb_build_array(jsonb_build_object(
        'id', 'phase5-progress-prestart-session',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-kinematics',
        'sourceSessionId', 'builtin-session-prestart',
        'sourceContentVersionKey', 'track-session:prestart:v1',
        'planningHref', '../schedules/mechanics/prestart.html',
        'difficulty', 'low',
        'title', 'Pre-start Mechanics review',
        'startDate', current_date + 1,
        'endDate', current_date + 1,
        'resources', '[]'::jsonb
      ))
    ),
    'phase5-progress-prestart-course'
  ) ->> 'id'
) as prestart_course_id
\gset
select public.activate_student_course(:'prestart_course_id'::uuid);

reset role;
select item.id as prestart_item_id
from public.student_courses course
join public.course_schedule_items item
  on item.version_id = course.active_schedule_version_id
where course.id = :'prestart_course_id'::uuid
  and item.stable_item_key = 'phase5-progress-prestart-session'
\gset

select set_config(
  'test.prestart_course_id',
  :'prestart_course_id',
  false
);
select set_config(
  'test.prestart_item_id',
  :'prestart_item_id',
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'tutor_id', true);

do $staff_mark_always_requires_student_explanation$
begin
  begin
    perform public.record_course_progress(
      current_setting('test.prestart_course_id', true)::uuid,
      current_setting('test.prestart_item_id', true)::uuid,
      null,
      'studied',
      null,
      null,
      null,
      null,
      null,
      'phase5-progress-prestart-no-explanation'
    );
    raise exception 'Expected an ordinary Tutor mark without an explanation to fail.';
  exception when others then
    if sqlerrm =
      'Expected an ordinary Tutor mark without an explanation to fail.' then
      raise;
    end if;
    if sqlerrm not like '%Student-visible explanation is required%' then
      raise;
    end if;
  end;
end;
$staff_mark_always_requires_student_explanation$;

select public.record_course_progress(
  :'prestart_course_id'::uuid,
  :'prestart_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  'The Tutor confirmed that this Mechanics topic was completed before the first planned meeting.',
  null,
  'phase5-progress-prestart-current-mark'
) as prestart_mark
\gset
select set_config(
  'test.prestart_mark_id',
  :'prestart_mark'::jsonb ->> 'eventId',
  false
);

select public.reverse_course_progress(
  :'prestart_course_id'::uuid,
  :'prestart_item_id'::uuid,
  null,
  'studied',
  (:'prestart_mark'::jsonb ->> 'eventId')::uuid,
  null,
  'The planned Session has not started, so this current mark is being corrected.',
  'Current-time pre-start correction characterization.',
  'phase5-progress-prestart-current-reverse'
) as prestart_reversal
\gset

select set_config(
  'test.prestart_course_id',
  :'prestart_course_id',
  false
);
select set_config(
  'test.prestart_item_id',
  :'prestart_item_id',
  false
);
select set_config(
  'test.prestart_reversal_id',
  :'prestart_reversal'::jsonb ->> 'eventId',
  false
);

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_receives_explanation_notification_and_current_schedule_log$
declare
  schedule_log jsonb := public.get_my_current_course_schedule_log(
    current_setting('test.prestart_course_id')::uuid
  );
begin
  if schedule_log #>> '{permissions,actorRole}' <> 'student'
    or not exists (
      select 1
      from jsonb_array_elements(schedule_log -> 'entries') entry
      where entry ->> 'entryKind' = 'progress'
        and entry ->> 'action' = 'marked'
        and entry ->> 'studentExplanation' =
          'The Tutor confirmed that this Mechanics topic was completed before the first planned meeting.'
    )
    or not exists (
      select 1
      from jsonb_array_elements(schedule_log -> 'entries') entry
      where entry ->> 'entryKind' = 'progress'
        and entry ->> 'action' = 'reversed'
        and entry ->> 'studentExplanation' =
          'The planned Session has not started, so this current mark is being corrected.'
    )
    or schedule_log::text like
      '%Current-time pre-start correction characterization.%' then
    raise exception
      'The Student current-Schedule Log did not expose public staff explanations while excluding private notes.';
  end if;

  if not exists (
    select 1
    from public.course_progress_notification_events notification
    where notification.progress_event_id =
      current_setting('test.prestart_mark_id')::uuid
      and notification.recipient_user_id =
        current_setting('test.student_a_id')::uuid
      and notification.payload ->> 'title' =
        'Pre-start Mechanics review'
      and notification.payload ->> 'studentExplanation' =
        'The Tutor confirmed that this Mechanics topic was completed before the first planned meeting.'
  ) then
    raise exception
      'The Student notification did not retain the Tutor explanation and Schedule title.';
  end if;
end;
$student_receives_explanation_notification_and_current_schedule_log$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $explicit_prestart_backreport_rejected$
begin
  begin
    perform public.record_course_progress(
      current_setting('test.prestart_course_id')::uuid,
      current_setting('test.prestart_item_id')::uuid,
      null,
      'studied',
      current_setting('test.prestart_reversal_id')::uuid,
      clock_timestamp() - interval '1 minute',
      null,
      'This explicit back-report remains subject to the locked Course start.',
      null,
      'phase5-progress-prestart-explicit-backreport'
    );
    raise exception 'Expected an explicit pre-start back-report to fail.';
  exception when others then
    if sqlerrm = 'Expected an explicit pre-start back-report to fail.' then raise; end if;
    if sqlerrm not like '%cannot predate the Course start%' then raise; end if;
  end;
end;
$explicit_prestart_backreport_rejected$;

-- Event and command histories cannot be rewritten even by an elevated SQL actor.
reset role;
do $append_only_history$
begin
  begin
    update public.course_progress_events
    set reflection = 'Forbidden rewrite'
    where id = current_setting('test.motion_mark_id')::uuid;
    raise exception 'Expected Course progress history to reject an update.';
  exception when others then
    if sqlerrm = 'Expected Course progress history to reject an update.' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  begin
    delete from public.course_progress_commands
    where course_id = current_setting('test.progress_course_id')::uuid;
    raise exception 'Expected Course progress commands to reject deletion.';
  exception when others then
    if sqlerrm = 'Expected Course progress commands to reject deletion.' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  begin
    update public.course_progress_restoration_provenance
    set marked_cadence = '{}'::jsonb
    where progress_event_id = current_setting('test.forces_mark_id')::uuid;
    raise exception 'Expected Studied restoration provenance to reject an update.';
  exception when others then
    if sqlerrm = 'Expected Studied restoration provenance to reject an update.' then raise; end if;
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end;
$append_only_history$;

rollback;
