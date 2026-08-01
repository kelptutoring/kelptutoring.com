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
  'Phase 5.D structural Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5d-db-schedule-v1',
    'name', 'Phase 5.D Mechanics Schedule',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5d-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 10,
        'endDate', current_date + 10
      ),
      jsonb_build_object(
        'id', 'phase5d-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 20,
        'endDate', current_date + 20
      )
    )
  ),
  'phase5d-db-structural-course'
) ->> 'id') as structural_course_id \gset
select public.activate_student_course(:'structural_course_id'::uuid);
select active_schedule_version_id as structural_v1_id
from public.student_courses where id = :'structural_course_id'::uuid \gset
select set_config('test.structural_course_id', :'structural_course_id', false);
select set_config('test.structural_v1_id', :'structural_v1_id', false);

-- The assigned Tutor may immediately add a Review. Its one governed reason
-- covers the deterministic downstream date/position reflow.
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_schedule_version(
  :'structural_course_id'::uuid,
  :'structural_v1_id'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5d-db-motion',
      'title', 'Motion foundations',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 10,
      'endDate', current_date + 10,
      'position', 0,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5d-db-review',
      'title', 'Kinematics review',
      'kind', 'review',
      'scheduledDate', current_date + 20,
      'endDate', current_date + 20,
      'position', 1,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5d-db-forces',
      'title', 'Forces and interactions',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 30,
      'endDate', current_date + 30,
      'position', 2,
      'state', 'scheduled'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5d-db-review',
    'reasonCode', 'review_required',
    'studentExplanation', 'We added a review meeting before moving on to Forces.',
    'privateStaffNote', 'Tutor observed that an additional guided review is academically appropriate.'
  )),
  'phase5d-db-tutor-review-v2'
) as tutor_publish_result \gset
select set_config('test.structural_v2_id', :'tutor_publish_result'::jsonb ->> 'publishedVersionId', false);

do $tutor_publish_contract$
declare
  projection jsonb := public.get_my_course_schedule(
    current_setting('test.structural_course_id')::uuid
  );
begin
  if projection #>> '{featureStatus,structuralEditing}' <> 'active_phase_5d'
    or projection #>> '{permissions,canEditStructure}' <> 'true'
    or projection #>> '{permissions,canReadSupersededVersions}' <> 'true'
    or projection #>> '{activeVersion,versionNumber}' <> '2'
    or projection #>> '{activeVersion,items,1,kind}' <> 'review'
    or projection #>> '{course,scheduledEndDate}' <> (current_date + 30)::text
    or jsonb_array_length(projection -> 'versions') <> 2
    or projection #>> '{activeVersion,changes,0,privateStaffNote}' is null then
    raise exception 'The assigned Tutor did not receive the complete Phase 5.D structural publishing contract.';
  end if;
  if (select count(*) from public.course_schedule_version_changes
      where version_id = current_setting('test.structural_v2_id')::uuid) <> 1 then
    raise exception 'The Tutor structural edit did not record exactly one governed root change.';
  end if;
  if (select count(*) from public.course_schedule_notification_events
      where schedule_version_id = current_setting('test.structural_v2_id')::uuid) <> 1 then
    raise exception 'The Tutor cannot read their own structural Schedule notification.';
  end if;
end;
$tutor_publish_contract$;

reset role;
do $all_participants_notified$
begin
  if (select count(*) from public.course_schedule_notification_events
      where schedule_version_id = current_setting('test.structural_v2_id')::uuid) <> 3 then
    raise exception 'The Tutor structural edit did not notify Student, Tutor, and Mentor exactly once.';
  end if;
  if not exists (
    select 1 from public.learning_schedule_sessions session
    join public.learning_schedules schedule on schedule.id = session.schedule_id
    where schedule.student_course_id = current_setting('test.structural_course_id')::uuid
      and session.source_key = 'phase5d-db-review'
      and session.status = 'active'
      and session.position = 1
  ) then
    raise exception 'The authoritative Version and Calendar compatibility mirror diverged.';
  end if;
end;
$all_participants_notified$;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'tutor_id', true);

-- Exact retries are idempotent even though the active pointer has advanced.
select public.publish_course_schedule_version(
  :'structural_course_id'::uuid,
  :'structural_v1_id'::uuid,
  jsonb_build_array(
    jsonb_build_object('stableItemKey', 'phase5d-db-motion', 'title', 'Motion foundations',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
      'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'),
    jsonb_build_object('stableItemKey', 'phase5d-db-review', 'title', 'Kinematics review',
      'kind', 'review', 'scheduledDate', current_date + 20,
      'endDate', current_date + 20, 'position', 1, 'state', 'scheduled'),
    jsonb_build_object('stableItemKey', 'phase5d-db-forces', 'title', 'Forces and interactions',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 30,
      'endDate', current_date + 30, 'position', 2, 'state', 'scheduled')
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'included', 'stableItemKey', 'phase5d-db-review',
    'reasonCode', 'review_required',
    'studentExplanation', 'We added a review meeting before moving on to Forces.',
    'privateStaffNote', 'Tutor observed that an additional guided review is academically appropriate.'
  )),
  'phase5d-db-tutor-review-v2'
) as idempotent_result \gset
select set_config('test.idempotent_result', :'idempotent_result', false);

do $idempotency_contract$
begin
  if current_setting('test.idempotent_result')::jsonb ->> 'publishedVersionId'
      <> current_setting('test.structural_v2_id')
    or current_setting('test.idempotent_result')::jsonb ->> 'idempotentReplay' <> 'true'
    or (select count(*) from public.course_schedule_versions version
        join public.course_schedules schedule on schedule.id = version.schedule_id
        where schedule.course_id = current_setting('test.structural_course_id')::uuid) <> 2
    or (select count(*) from public.course_schedule_notification_events
        where schedule_version_id = current_setting('test.structural_v2_id')::uuid) <> 1 then
    raise exception 'An exact structural publishing retry created duplicate effects.';
  end if;
end;
$idempotency_contract$;

-- A Student receives one active effective Schedule, the public explanation,
-- and no superseded Version or private supervision note.
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_projection_and_rls$
declare
  projection jsonb := public.get_my_course_schedule(
    current_setting('test.structural_course_id')::uuid
  );
  visible_old_versions integer;
  visible_private_changes integer;
begin
  if projection #>> '{permissions,canEditStructure}' <> 'false'
    or projection #>> '{permissions,canReadSupersededVersions}' <> 'false'
    or projection #>> '{schedule,versionCount}' is not null
    or jsonb_array_length(projection -> 'versions') <> 0
    or jsonb_array_length(projection #> '{activeVersion,items}') <> 3
    or projection #>> '{activeVersion,changes,0,studentExplanation}' is null
    or projection #>> '{activeVersion,changes,0,privateStaffNote}' is not null then
    raise exception 'The Student Schedule projection exposed staff history or hid the effective plan.';
  end if;
  select count(*) into visible_old_versions
  from public.course_schedule_versions
  where id = current_setting('test.structural_v1_id')::uuid;
  select count(*) into visible_private_changes
  from public.course_schedule_version_changes
  where version_id = current_setting('test.structural_v2_id')::uuid;
  if visible_old_versions <> 0 or visible_private_changes <> 0 then
    raise exception 'Schedule history RLS exposed superseded or private staff records to the Student.';
  end if;
  if (select count(*) from public.course_schedule_notification_events
      where recipient_user_id = auth.uid()
        and schedule_version_id = current_setting('test.structural_v2_id')::uuid) <> 1 then
    raise exception 'The Student cannot read their own Schedule notification event.';
  end if;
end;
$student_projection_and_rls$;

do $student_publish_denied$
begin
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.structural_course_id')::uuid,
      current_setting('test.structural_v2_id')::uuid,
      '[]'::jsonb, '[]'::jsonb, 'phase5d-db-student-denied'
    );
    raise exception 'Expected Student structural publishing to fail.';
  exception when others then
    if sqlerrm = 'Expected Student structural publishing to fail.' then raise; end if;
    if sqlerrm not like '%assigned Tutor or supervising Mentor%' then raise; end if;
  end;
end;
$student_publish_denied$;

-- A stale Mentor save is rejected before creating any Version or event.
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $stale_mentor_save$
declare
  versions_before integer;
begin
  select count(*) into versions_before
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where schedule.course_id = current_setting('test.structural_course_id')::uuid;
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.structural_course_id')::uuid,
      current_setting('test.structural_v1_id')::uuid,
      jsonb_build_array(
        jsonb_build_object('stableItemKey', 'phase5d-db-motion', 'title', 'Motion foundations',
          'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
          'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'),
        jsonb_build_object('stableItemKey', 'phase5d-db-forces', 'title', 'Forces and interactions',
          'kind', 'curriculum_topic', 'scheduledDate', current_date + 20,
          'endDate', current_date + 20, 'position', 1, 'state', 'scheduled')
      ),
      jsonb_build_array(jsonb_build_object(
        'changeType', 'reordered', 'stableItemKey', 'phase5d-db-forces',
        'reasonCode', 'curriculum_adjustment',
        'studentExplanation', 'The Mentor is correcting the future Course order.'
      )),
      'phase5d-db-stale-mentor-save'
    );
    raise exception 'Expected a stale Mentor Schedule save to fail.';
  exception when others then
    if sqlerrm = 'Expected a stale Mentor Schedule save to fail.' then raise; end if;
    if sqlerrm not like '%Refresh it before publishing%' then raise; end if;
  end;
  if versions_before <> (
    select count(*)
    from public.course_schedule_versions version
    join public.course_schedules schedule on schedule.id = version.schedule_id
    where schedule.course_id = current_setting('test.structural_course_id')::uuid
  ) then raise exception 'A stale Mentor save left a partial immutable Version.'; end if;
end;
$stale_mentor_save$;

-- After refreshing, the Mentor may exercise final authority and drop a future
-- item with a learner-facing reason. The Course endpoint shrinks atomically.
select public.publish_course_schedule_version(
  :'structural_course_id'::uuid,
  current_setting('test.structural_v2_id')::uuid,
  jsonb_build_array(
    jsonb_build_object('stableItemKey', 'phase5d-db-motion', 'title', 'Motion foundations',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
      'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'),
    jsonb_build_object('stableItemKey', 'phase5d-db-review', 'title', 'Kinematics review',
      'kind', 'review', 'scheduledDate', current_date + 20,
      'endDate', current_date + 20, 'position', 1, 'state', 'scheduled'),
    jsonb_build_object('stableItemKey', 'phase5d-db-forces', 'title', 'Forces and interactions',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 30,
      'endDate', current_date + 30, 'position', 2, 'state', 'dropped')
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'dropped', 'stableItemKey', 'phase5d-db-forces',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'Forces will be covered in a later Course instead.',
    'privateStaffNote', 'Mentor final academic decision after reviewing the active plan.'
  )),
  'phase5d-db-mentor-drop-v3'
) as mentor_publish_result \gset
select set_config('test.structural_v3_id', :'mentor_publish_result'::jsonb ->> 'publishedVersionId', false);

do $mentor_final_authority$
declare projection jsonb := public.get_my_course_schedule(
  current_setting('test.structural_course_id')::uuid
);
begin
  if projection #>> '{activeVersion,versionNumber}' <> '3'
    or projection #>> '{course,scheduledEndDate}' <> (current_date + 20)::text
    or projection #>> '{activeVersion,dateRange,effectiveItemCount}' <> '2'
    or projection #>> '{activeVersion,items,2,state}' <> 'dropped'
    or projection #>> '{versions,1,status}' <> 'superseded' then
    raise exception 'The refreshed Mentor publish did not atomically override the future plan.';
  end if;
end;
$mentor_final_authority$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_dropped_item_hidden$
declare projection jsonb := public.get_my_course_schedule(
  current_setting('test.structural_course_id')::uuid
);
begin
  if jsonb_array_length(projection #> '{activeVersion,items}') <> 2
    or exists (
      select 1 from public.course_schedule_items item
      where item.version_id = current_setting('test.structural_v3_id')::uuid
        and item.stable_item_key = 'phase5d-db-forces'
    ) then
    raise exception 'The Student effective Schedule exposed a dropped item.';
  end if;
end;
$student_dropped_item_hidden$;

-- A dropped Session may be restored in a successor Version. The immutable
-- dropped snapshot and its audit event remain attached to Version 3.
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.publish_course_schedule_version(
  :'structural_course_id'::uuid,
  current_setting('test.structural_v3_id')::uuid,
  jsonb_build_array(
    jsonb_build_object('stableItemKey', 'phase5d-db-motion', 'title', 'Motion foundations',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
      'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'),
    jsonb_build_object('stableItemKey', 'phase5d-db-review', 'title', 'Kinematics review',
      'kind', 'review', 'scheduledDate', current_date + 20,
      'endDate', current_date + 20, 'position', 1, 'state', 'scheduled'),
    jsonb_build_object('stableItemKey', 'phase5d-db-forces', 'title', 'Forces and interactions',
      'kind', 'curriculum_topic', 'scheduledDate', current_date + 35,
      'endDate', current_date + 35, 'position', 2, 'state', 'scheduled')
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'restored', 'stableItemKey', 'phase5d-db-forces',
    'reasonCode', 'curriculum_adjustment',
    'studentExplanation', 'Forces is returning to this Course after the plan was reviewed.',
    'privateStaffNote', 'Mentor restored the previously dropped Session without rewriting Version 3.'
  )),
  'phase5d-db-mentor-restore-v4'
) as mentor_restore_result \gset
select set_config(
  'test.structural_v4_id',
  :'mentor_restore_result'::jsonb ->> 'publishedVersionId',
  false
);

do $restored_item_history_preserved$
declare projection jsonb := public.get_my_course_schedule(
  current_setting('test.structural_course_id')::uuid
);
begin
  if projection #>> '{activeVersion,versionNumber}' <> '4'
    or projection #>> '{course,scheduledEndDate}' <> (current_date + 35)::text
    or projection #>> '{activeVersion,dateRange,effectiveItemCount}' <> '3'
    or projection #>> '{activeVersion,items,2,state}' <> 'scheduled'
    or not exists (
      select 1
      from public.course_schedule_items item
      where item.version_id = current_setting('test.structural_v3_id')::uuid
        and item.stable_item_key = 'phase5d-db-forces'
        and item.item_state = 'dropped'
    )
    or not exists (
      select 1
      from public.course_schedule_version_changes change
      where change.version_id = current_setting('test.structural_v4_id')::uuid
        and change.stable_item_key = 'phase5d-db-forces'
        and change.change_type = 'restored'
    ) then
    raise exception 'Restoring a dropped Session rewrote history or failed to activate the successor snapshot.';
  end if;
end;
$restored_item_history_preserved$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_restored_item_visible$
declare projection jsonb := public.get_my_course_schedule(
  current_setting('test.structural_course_id')::uuid
);
begin
  if jsonb_array_length(projection #> '{activeVersion,items}') <> 3
    or projection #>> '{activeVersion,items,2,title}' <> 'Forces and interactions' then
    raise exception 'The Student effective Schedule did not expose the restored Session.';
  end if;
end;
$student_restored_item_visible$;

-- Outsiders and generic administrators cannot perform routine academic edits.
select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_denied$
begin
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.structural_course_id')::uuid,
      current_setting('test.structural_v4_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'stableItemKey', 'phase5d-db-motion', 'title', 'Motion foundations',
        'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
        'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'
      )),
      '[]'::jsonb,
      'phase5d-db-outsider-denied'
    );
    raise exception 'Expected outsider structural publishing to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider structural publishing to fail.' then raise; end if;
    if sqlerrm not like '%assigned Tutor or supervising Mentor%' then raise; end if;
  end;
end;
$outsider_denied$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
do $administrator_routine_edit_denied$
begin
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.structural_course_id')::uuid,
      current_setting('test.structural_v4_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'stableItemKey', 'phase5d-db-motion', 'title', 'Motion foundations',
        'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
        'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'
      )),
      '[]'::jsonb,
      'phase5d-db-admin-denied'
    );
    raise exception 'Expected administrator routine structural publishing to fail.';
  exception when others then
    if sqlerrm = 'Expected administrator routine structural publishing to fail.' then raise; end if;
    if sqlerrm not like '%assigned Tutor or supervising Mentor%' then raise; end if;
  end;
end;
$administrator_routine_edit_denied$;

-- A self-employed Tutor combines Tutor and Mentor Schedule authority.
select public.grant_teaching_qualification(
  :'independent_tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.D rollback independent-Tutor qualification'
);
select set_config('request.jwt.claim.sub', :'independent_tutor_id', true);
select (public.create_student_course_with_schedule_draft(
  :'student_b_id'::uuid,
  :'independent_tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.D independent Mechanics',
  'independent_tutor',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5d-db-independent-v1',
    'name', 'Independent Mechanics Schedule',
    'timeZone', 'UTC',
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', 'phase5d-db-independent-motion',
      'title', 'Independent motion study',
      'startDate', current_date + 12,
      'endDate', current_date + 12
    ))
  ),
  'phase5d-db-independent-course'
) ->> 'id') as independent_course_id \gset
select public.activate_student_course(:'independent_course_id'::uuid);
select active_schedule_version_id as independent_v1_id
from public.student_courses where id = :'independent_course_id'::uuid \gset
select set_config('test.independent_course_id', :'independent_course_id', false);

select public.publish_course_schedule_version(
  :'independent_course_id'::uuid,
  :'independent_v1_id'::uuid,
  jsonb_build_array(
    jsonb_build_object('stableItemKey', 'phase5d-db-independent-motion',
      'title', 'Independent motion study', 'kind', 'curriculum_topic',
      'scheduledDate', current_date + 12, 'endDate', current_date + 12,
      'position', 0, 'state', 'scheduled'),
    jsonb_build_object('stableItemKey', 'phase5d-db-independent-exam',
      'title', 'Independent Mechanics exam', 'kind', 'exam',
      'scheduledDate', current_date + 19, 'endDate', current_date + 19,
      'position', 1, 'state', 'scheduled')
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'included', 'stableItemKey', 'phase5d-db-independent-exam',
    'reasonCode', 'exam_scheduled',
    'studentExplanation', 'The Course now includes its required Mechanics exam.'
  )),
  'phase5d-db-independent-exam-v2'
);

do $independent_tutor_authority$
begin
  if not exists (
    select 1
    from public.student_courses course
    join public.course_schedule_versions version
      on version.id = course.active_schedule_version_id
    join public.course_schedule_items item on item.version_id = version.id
    where course.id = current_setting('test.independent_course_id')::uuid
      and course.mentor_id is null
      and version.version_number = 2
      and item.stable_item_key = 'phase5d-db-independent-exam'
      and item.item_kind = 'exam'
  ) then
    raise exception 'The self-employed Tutor could not exercise combined Schedule authority.';
  end if;
end;
$independent_tutor_authority$;

-- Ordinary structural editing stops during wind-down, and immutable history
-- remains physically protected even for direct SQL callers.
reset role;
update public.student_courses
set status = 'wind_down'
where id = current_setting('test.structural_course_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $wind_down_edit_denied$
begin
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.structural_course_id')::uuid,
      current_setting('test.structural_v4_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'stableItemKey', 'phase5d-db-motion', 'title', 'Motion foundations',
        'kind', 'curriculum_topic', 'scheduledDate', current_date + 10,
        'endDate', current_date + 10, 'position', 0, 'state', 'scheduled'
      )),
      '[]'::jsonb,
      'phase5d-db-wind-down-denied'
    );
    raise exception 'Expected wind-down structural publishing to fail.';
  exception when others then
    if sqlerrm = 'Expected wind-down structural publishing to fail.' then raise; end if;
    if sqlerrm not like '%does not currently accept ordinary%' then raise; end if;
  end;
end;
$wind_down_edit_denied$;

reset role;
do $immutable_history$
begin
  begin
    update public.course_schedule_items
    set title = 'Forbidden immutable rewrite'
    where version_id = current_setting('test.structural_v1_id')::uuid
      and stable_item_key = 'phase5d-db-motion';
    raise exception 'Expected immutable Schedule history to reject an update.';
  exception when others then
    if sqlerrm = 'Expected immutable Schedule history to reject an update.' then raise; end if;
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
end;
$immutable_history$;

rollback;
