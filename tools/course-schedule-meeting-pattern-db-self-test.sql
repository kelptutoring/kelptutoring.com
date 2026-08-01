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
\if :{?student_b_id}
\else
  \echo 'Missing required actor variable: student_b_id'
  \quit 3
\endif
\if :{?independent_tutor_id}
\else
  \echo 'Missing required actor variable: independent_tutor_id'
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
    :'student_b_id'::uuid,
    :'independent_tutor_id'::uuid,
    :'outsider_id'::uuid
  )
) = 7 then 1 else 0 end as actors_ready \gset

\if :actors_ready
\else
  \echo 'The Phase 5.F.1 actors are not provisioned.'
  \quit 3
\endif

begin;
select set_config('test.admin_id', :'admin_id', false);
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.independent_tutor_id', :'independent_tutor_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.1 recurring Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f1-db-schedule-v1',
    'name', 'Phase 5.F.1 Mechanics plan',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f1-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 7,
        'endDate', current_date + 7
      ),
      jsonb_build_object(
        'id', 'phase5f1-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 35,
        'endDate', current_date + 35
      )
    )
  ),
  'phase5f1-db-recurring-course'
) ->> 'id') as recurring_course_id \gset
select public.activate_student_course(:'recurring_course_id'::uuid);
select active_schedule_version_id as recurring_v1_id
from public.student_courses where id = :'recurring_course_id'::uuid \gset
select set_config('test.recurring_course_id', :'recurring_course_id', false);
select set_config('test.recurring_v1_id', :'recurring_v1_id', false);

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_meeting_pattern_version(
  :'recurring_course_id'::uuid,
  :'recurring_v1_id'::uuid,
  current_date + 7,
  current_date + 35,
  jsonb_build_array(
    jsonb_build_object(
      'stablePatternKey', 'phase5f1-tuesday-theory',
      'weekday', 2,
      'localStartTime', '15:00',
      'durationMinutes', 30,
      'position', 0
    ),
    jsonb_build_object(
      'stablePatternKey', 'phase5f1-thursday-practice',
      'weekday', 4,
      'localStartTime', '15:00',
      'durationMinutes', 30,
      'position', 1,
      'metadata', jsonb_build_object('label', 'Guided problems')
    )
  ),
  'Tutoring remains on Tuesday and Thursday as neutral academic opportunities.',
  'The Tutor and Student selected these recurring times during onboarding.',
  'phase5f1-db-tutor-pattern-v2'
) as tutor_publish_result \gset
select set_config(
  'test.recurring_v2_id',
  :'tutor_publish_result'::jsonb ->> 'publishedVersionId',
  false
);

do $tutor_pattern_contract$
declare
  projection jsonb := public.get_my_course_meeting_pattern(
    current_setting('test.recurring_course_id')::uuid
  );
begin
  if projection #>> '{featureStatus,meetingPatternContract}' <> 'active_phase_5f1'
    or projection #>> '{featureStatus,slotGeneration}' <> 'planned_phase_5f2'
    or projection #>> '{permissions,canEditMeetingPattern}' <> 'true'
    or projection #>> '{permissions,canReadPatternHistory}' <> 'true'
    or projection #>> '{recurrence,status}' <> 'configured'
    or jsonb_array_length(projection #> '{recurrence,patterns}') <> 2
    or projection #> '{recurrence,patterns,0,purpose}' is not null
    or projection #> '{recurrence,patterns,0,advancesCurriculum}' is not null
    or projection #> '{recurrence,patterns,1,purpose}' is not null
    or projection #> '{recurrence,patterns,1,advancesCurriculum}' is not null
    or projection #>> '{recurrence,change,privateStaffNote}' is null
    or jsonb_array_length(projection -> 'versions') <> 2 then
    raise exception 'The assigned Tutor did not receive the complete Phase 5.F.1 meeting-pattern contract.';
  end if;

  if (select count(*) from public.course_schedule_items
      where version_id = current_setting('test.recurring_v2_id')::uuid) <> 2
    or (select count(*) from public.course_schedule_meeting_patterns
        where version_id = current_setting('test.recurring_v2_id')::uuid
          and purpose = 'academic') <> 2
    or (select count(*) from public.course_schedule_meeting_pattern_changes
        where version_id = current_setting('test.recurring_v2_id')::uuid) <> 1 then
    raise exception 'The meeting-pattern successor did not retain structure and one immutable audit snapshot.';
  end if;
end;
$tutor_pattern_contract$;

reset role;
do $pattern_dates_and_notifications$
begin
  if not exists (
    select 1
    from public.student_courses course
    join public.course_schedule_versions version
      on version.id = course.active_schedule_version_id
    where course.id = current_setting('test.recurring_course_id')::uuid
      and course.start_date = current_date + 7
      and course.scheduled_end_date = current_date + 35
      and version.id = current_setting('test.recurring_v2_id')::uuid
      and version.version_number = 2
      and version.previous_version_id = current_setting('test.recurring_v1_id')::uuid
      and version.metadata ->> 'changeScope' = 'meeting_pattern'
  ) then
    raise exception 'The pattern-only Version changed Course dates or lost Version ancestry.';
  end if;
  if (select count(*) from public.course_schedule_notification_events
      where schedule_version_id = current_setting('test.recurring_v2_id')::uuid
        and payload ->> 'changeScope' = 'meeting_pattern') <> 3 then
    raise exception 'A meeting-pattern Version did not notify Student, Tutor, and Mentor exactly once.';
  end if;
end;
$pattern_dates_and_notifications$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'tutor_id', true);

select public.publish_course_meeting_pattern_version(
  :'recurring_course_id'::uuid,
  :'recurring_v1_id'::uuid,
  current_date + 7,
  current_date + 35,
  jsonb_build_array(
    jsonb_build_object(
      'stablePatternKey', 'phase5f1-tuesday-theory',
      'weekday', 2, 'localStartTime', '15:00',
      'durationMinutes', 30, 'position', 0
    ),
    jsonb_build_object(
      'stablePatternKey', 'phase5f1-thursday-practice',
      'weekday', 4, 'localStartTime', '15:00',
      'durationMinutes', 30, 'position', 1,
      'metadata', jsonb_build_object('label', 'Guided problems')
    )
  ),
  'Tutoring remains on Tuesday and Thursday as neutral academic opportunities.',
  'The Tutor and Student selected these recurring times during onboarding.',
  'phase5f1-db-tutor-pattern-v2'
) as idempotent_result \gset
select set_config('test.idempotent_result', :'idempotent_result', false);

do $pattern_idempotency$
begin
  if current_setting('test.idempotent_result')::jsonb ->> 'publishedVersionId'
      <> current_setting('test.recurring_v2_id')
    or current_setting('test.idempotent_result')::jsonb ->> 'idempotentReplay' <> 'true'
    or (select count(*) from public.course_schedule_meeting_pattern_changes
        where version_id = current_setting('test.recurring_v2_id')::uuid) <> 1 then
    raise exception 'An exact meeting-pattern retry created duplicate effects.';
  end if;
end;
$pattern_idempotency$;

do $invalid_pattern_contracts$
begin
  begin
    perform public.publish_course_meeting_pattern_version(
      current_setting('test.recurring_course_id')::uuid,
      current_setting('test.recurring_v2_id')::uuid,
      current_date + 7,
      current_date + 35,
      jsonb_build_array(jsonb_build_object(
        'stablePatternKey', 'phase5f1-invalid-duration',
        'weekday', 2, 'localStartTime', '16:00',
        'durationMinutes', 45, 'position', 0
      )),
      'This unsupported meeting duration must be rejected.',
      null,
      'phase5f1-db-invalid-duration'
    );
    raise exception 'Expected an unsupported meeting duration to fail.';
  exception when others then
    if sqlerrm = 'Expected an unsupported meeting duration to fail.' then raise; end if;
    if sqlerrm not like '%valid key, weekday, local time, duration%' then raise; end if;
  end;

  begin
    perform public.publish_course_meeting_pattern_version(
      current_setting('test.recurring_course_id')::uuid,
      current_setting('test.recurring_v2_id')::uuid,
      current_date + 7,
      current_date + 35,
      jsonb_build_array(
        jsonb_build_object(
          'stablePatternKey', 'phase5f1-duplicate-theory',
          'weekday', 2, 'localStartTime', '17:00',
          'durationMinutes', 60, 'position', 0
        ),
        jsonb_build_object(
          'stablePatternKey', 'phase5f1-duplicate-practice',
          'weekday', 2, 'localStartTime', '17:00',
          'durationMinutes', 30, 'position', 1
        )
      ),
      'This duplicate weekly start must be rejected.',
      null,
      'phase5f1-db-duplicate-time'
    );
    raise exception 'Expected duplicate weekly local starts to fail.';
  exception when others then
    if sqlerrm = 'Expected duplicate weekly local starts to fail.' then raise; end if;
    if sqlerrm not like '%cannot begin at the same local date and time%' then raise; end if;
  end;

  begin
    perform public.publish_course_meeting_pattern_version(
      current_setting('test.recurring_course_id')::uuid,
      current_setting('test.recurring_v2_id')::uuid,
      current_date - 1,
      current_date + 35,
      jsonb_build_array(jsonb_build_object(
        'stablePatternKey', 'phase5f1-backdated-theory',
        'weekday', 2, 'localStartTime', '18:00',
        'durationMinutes', 60, 'position', 0
      )),
      'This backdated pattern must not rewrite elapsed dates.',
      null,
      'phase5f1-db-backdated-pattern'
    );
    raise exception 'Expected a backdated active pattern to fail.';
  exception when others then
    if sqlerrm = 'Expected a backdated active pattern to fail.' then raise; end if;
    if sqlerrm not like '%cannot rewrite elapsed Course dates%' then raise; end if;
  end;
end;
$invalid_pattern_contracts$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $stale_mentor_pattern_save$
begin
  begin
    perform public.publish_course_meeting_pattern_version(
      current_setting('test.recurring_course_id')::uuid,
      current_setting('test.recurring_v1_id')::uuid,
      current_date + 7,
      current_date + 35,
      jsonb_build_array(jsonb_build_object(
        'stablePatternKey', 'phase5f1-stale-theory',
        'weekday', 1, 'localStartTime', '10:00',
        'durationMinutes', 60, 'position', 0
      )),
      'This stale Mentor save must be refreshed first.',
      null,
      'phase5f1-db-stale-mentor'
    );
    raise exception 'Expected stale Mentor pattern publishing to fail.';
  exception when others then
    if sqlerrm = 'Expected stale Mentor pattern publishing to fail.' then raise; end if;
    if sqlerrm not like '%changed after this page loaded%' then raise; end if;
  end;
end;
$stale_mentor_pattern_save$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_pattern_projection_and_denial$
declare
  projection jsonb := public.get_my_course_meeting_pattern(
    current_setting('test.recurring_course_id')::uuid
  );
  visible_audit integer;
begin
  if projection #>> '{permissions,canEditMeetingPattern}' <> 'false'
    or projection #>> '{permissions,canReadPatternHistory}' <> 'false'
    or jsonb_array_length(projection #> '{recurrence,patterns}') <> 2
    or projection #>> '{recurrence,change,studentExplanation}' is null
    or projection #>> '{recurrence,change,privateStaffNote}' is not null
    or jsonb_array_length(projection -> 'versions') <> 0 then
    raise exception 'The Student meeting-pattern projection exposed staff history or hid the active week.';
  end if;

  select count(*) into visible_audit
  from public.course_schedule_meeting_pattern_changes
  where course_id = current_setting('test.recurring_course_id')::uuid;
  if visible_audit <> 0 then
    raise exception 'Meeting-pattern audit RLS exposed private staff history to the Student.';
  end if;

  begin
    perform public.publish_course_meeting_pattern_version(
      current_setting('test.recurring_course_id')::uuid,
      current_setting('test.recurring_v2_id')::uuid,
      current_date + 7,
      current_date + 35,
      jsonb_build_array(jsonb_build_object(
        'stablePatternKey', 'phase5f1-student-theory',
        'weekday', 1, 'localStartTime', '10:00',
        'durationMinutes', 60, 'position', 0
      )),
      'The Student must not directly replace the recurring week.',
      null,
      'phase5f1-db-student-denied'
    );
    raise exception 'Expected Student meeting-pattern publishing to fail.';
  exception when others then
    if sqlerrm = 'Expected Student meeting-pattern publishing to fail.' then raise; end if;
    if sqlerrm not like '%assigned Tutor or supervising Mentor%' then raise; end if;
  end;
end;
$student_pattern_projection_and_denial$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_pattern_denied$
begin
  begin
    perform public.get_my_course_meeting_pattern(
      current_setting('test.recurring_course_id')::uuid
    );
    raise exception 'Expected outsider meeting-pattern access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider meeting-pattern access to fail.' then raise; end if;
    if sqlerrm not like '%do not have access%' then raise; end if;
  end;
end;
$outsider_pattern_denied$;

-- A later structural successor inherits the complete meeting pattern.
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_schedule_version(
  :'recurring_course_id'::uuid,
  current_setting('test.recurring_v2_id')::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5f1-db-motion',
      'title', 'Motion foundations',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 7,
      'endDate', current_date + 7,
      'position', 0,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5f1-db-review',
      'title', 'Motion review',
      'kind', 'review',
      'scheduledDate', current_date + 21,
      'endDate', current_date + 21,
      'position', 1,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5f1-db-forces',
      'title', 'Forces and interactions',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 35,
      'endDate', current_date + 35,
      'position', 2,
      'state', 'scheduled'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5f1-db-review',
    'reasonCode', 'review_required',
    'studentExplanation', 'A Motion review was added before Forces and interactions.'
  )),
  'phase5f1-db-structural-successor-v3'
) as structural_successor \gset
select set_config(
  'test.recurring_v3_id',
  :'structural_successor'::jsonb ->> 'publishedVersionId',
  false
);

do $structural_successor_inherits_pattern$
begin
  if (select count(*) from public.course_schedule_meeting_patterns
      where version_id = current_setting('test.recurring_v3_id')::uuid) <> 2
    or public.get_my_course_meeting_pattern(
      current_setting('test.recurring_course_id')::uuid
    ) #>> '{recurrence,change,studentExplanation}'
      <> 'Tutoring remains on Tuesday and Thursday as neutral academic opportunities.' then
    raise exception 'A structural successor lost its inherited meeting pattern or latest public explanation.';
  end if;
end;
$structural_successor_inherits_pattern$;

-- Self-employed Tutors use the same recurring Course contract without a Mentor.
reset role;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.grant_teaching_qualification(
  :'independent_tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.1 rollback independent-Tutor qualification'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', :'independent_tutor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_b_id'::uuid,
  :'independent_tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.1 independent recurring Mechanics',
  'independent_tutor',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f1-db-independent-v1',
    'name', 'Independent recurring Mechanics',
    'timeZone', 'UTC',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f1-db-independent-motion',
        'title', 'Independent motion study',
        'startDate', current_date + 8,
        'endDate', current_date + 8
      ),
      jsonb_build_object(
        'id', 'phase5f1-db-independent-forces',
        'title', 'Independent forces study',
        'startDate', current_date + 22,
        'endDate', current_date + 22
      )
    )
  ),
  'phase5f1-db-independent-course'
) ->> 'id') as independent_course_id \gset
select public.activate_student_course(:'independent_course_id'::uuid);
select active_schedule_version_id as independent_v1_id
from public.student_courses where id = :'independent_course_id'::uuid \gset

select public.publish_course_meeting_pattern_version(
  :'independent_course_id'::uuid,
  :'independent_v1_id'::uuid,
  current_date + 8,
  current_date + 22,
  jsonb_build_array(jsonb_build_object(
    'stablePatternKey', 'phase5f1-independent-theory',
    'weekday', 3,
    'localStartTime', '09:00',
    'durationMinutes', 90,
    'position', 0
  )),
  'The independent recurring Course meets each Wednesday.',
  null,
  'phase5f1-db-independent-pattern-v2'
) as independent_pattern_result \gset
select set_config(
  'test.independent_v2_id',
  :'independent_pattern_result'::jsonb ->> 'publishedVersionId',
  false
);
select set_config('test.independent_course_id', :'independent_course_id', false);

do $independent_tutor_pattern_authority$
begin
  if not exists (
    select 1
    from public.student_courses course
    join public.course_schedule_meeting_patterns pattern
      on pattern.version_id = course.active_schedule_version_id
    where course.id = current_setting('test.independent_course_id')::uuid
      and course.mentor_id is null
      and course.active_schedule_version_id = current_setting('test.independent_v2_id')::uuid
      and pattern.purpose = 'academic'
      and pattern.duration_minutes = 90
  ) then
    raise exception 'The self-employed Tutor could not publish the ordinary recurring meeting pattern.';
  end if;
end;
$independent_tutor_pattern_authority$;

-- Immutable pattern history is protected even from a direct SQL caller.
reset role;
do $immutable_pattern_history$
begin
  begin
    update public.course_schedule_meeting_patterns
    set duration_minutes = 90
    where version_id = current_setting('test.recurring_v2_id')::uuid
      and stable_pattern_key = 'phase5f1-tuesday-theory';
    raise exception 'Expected immutable meeting-pattern history to reject an update.';
  exception when others then
    if sqlerrm = 'Expected immutable meeting-pattern history to reject an update.' then raise; end if;
    if sqlerrm not like '%meeting patterns are immutable%' then raise; end if;
  end;
end;
$immutable_pattern_history$;

rollback;
