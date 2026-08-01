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
  \echo 'The Phase 5.F.3 actors are not provisioned.'
  \quit 3
\endif

begin;
select set_config('test.outcome_admin_id', :'admin_id', false);
select set_config('test.outcome_mentor_id', :'mentor_id', false);
select set_config('test.outcome_tutor_id', :'tutor_id', false);
select set_config('test.outcome_student_id', :'student_a_id', false);
select set_config('test.outcome_outsider_id', :'outsider_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.3 occurrence outcomes',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f3-db-schedule',
    'name', 'Phase 5.F.3 outcome plan',
    'timeZone', 'UTC',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f3-db-a',
        'title', 'Topic A',
        'startDate', current_date,
        'endDate', current_date
      ),
      jsonb_build_object(
        'id', 'phase5f3-db-b',
        'title', 'Topic B',
        'startDate', current_date + 7,
        'endDate', current_date + 7
      ),
      jsonb_build_object(
        'id', 'phase5f3-db-c',
        'title', 'Topic C',
        'startDate', current_date + 14,
        'endDate', current_date + 14
      )
    )
  ),
  'phase5f3-db-course'
) ->> 'id') as outcome_course_id \gset
select public.activate_student_course(:'outcome_course_id'::uuid);
select active_schedule_version_id as outcome_v1_id
from public.student_courses
where id = :'outcome_course_id'::uuid \gset

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_meeting_pattern_version(
  :'outcome_course_id'::uuid,
  :'outcome_v1_id'::uuid,
  current_date,
  current_date + 14,
  jsonb_build_array(jsonb_build_object(
    'stablePatternKey', 'phase5f3-weekly',
    'weekday', extract(dow from current_date)::integer,
    'localStartTime', '00:01',
    'durationMinutes', 60,
    'position', 0
  )),
  'The weekly opportunity is ready for occurrence outcome testing.',
  null,
  'phase5f3-db-pattern'
) as outcome_pattern_publish \gset

select set_config('test.outcome_course_id', :'outcome_course_id', false);
select set_config(
  'test.outcome_version_id',
  :'outcome_pattern_publish'::jsonb ->> 'publishedVersionId',
  false
);
select slot.id as outcome_first_slot_id
from public.course_schedule_academic_slots slot
where slot.version_id = current_setting('test.outcome_version_id')::uuid
order by slot.position, slot.id limit 1 \gset
select set_config('test.outcome_first_slot_id', :'outcome_first_slot_id', false);

-- A delivered Review preserves Topic A as the immutable historical target,
-- does not mark A Studied, and requeues A into the next unlocked opportunity.
select public.record_course_occurrence_outcome(
  :'outcome_first_slot_id'::uuid,
  null,
  'delivered',
  'review',
  'recurring',
  'joint_presence_verified',
  'full_charge',
  false,
  'The lesson pivoted to review before returning to Topic A next week.',
  'The Tutor retained the locked target and recorded the actual purpose.',
  '{}'::uuid[],
  'phase5f3-db-review-outcome'
) as outcome_review \gset
select set_config(
  'test.outcome_review_event_id',
  :'outcome_review'::jsonb ->> 'eventId',
  false
);

do $review_requeues_locked_target_and_defers_money$
declare
  mapping jsonb := public.get_my_course_target_mapping(
    current_setting('test.outcome_course_id')::uuid
  );
  projection jsonb := public.get_my_course_occurrence_outcomes(
    current_setting('test.outcome_course_id')::uuid
  );
begin
  if mapping #>> '{mappingRevision,reason}' <> 'outcome_reflow'
    or mapping #>> '{mapping,slotMappings,0,targetStableItemKey}'
      <> 'phase5f3-db-a'
    or mapping #>> '{mapping,slotMappings,0,targetLocked}' <> 'true'
    or mapping #>> '{mapping,slotMappings,0,outcome,deliveryKind}' <> 'review'
    or mapping #>> '{mapping,slotMappings,1,targetStableItemKey}'
      <> 'phase5f3-db-a'
    or projection #>> '{occurrences,0,resolutionStatus}' <> 'delivered'
    or projection #>> '{occurrences,0,chargeRecommendation}' <> 'full_charge'
    or projection #>> '{financialBoundary,minimumSettlementHoldDays}' <> '14'
    or projection #>> '{financialBoundary,creditPosting}' <> 'deferred_credit_phase'
    or (projection #>> '{occurrences,0,settlementNotBefore}')::timestamptz
      < (projection #>> '{occurrences,0,slotStartsAt}')::timestamptz
        + interval '14 days' then
    raise exception 'Review did not retain/requeue Topic A with a nonfinancial 14-day outcome recommendation.';
  end if;
end;
$review_requeues_locked_target_and_defers_money$;

-- The Student receives a redacted projection and cannot read raw staff events,
-- evidence metadata, or record an authoritative Tutor outcome.
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_projection_is_redacted_and_read_model_only$
declare
  projection jsonb := public.get_my_course_occurrence_outcomes(
    current_setting('test.outcome_course_id')::uuid
  );
begin
  if projection #>> '{permissions,canRecordOutcome}' <> 'false'
    or projection #>> '{permissions,canSubmitDispute}' <> 'true'
    or projection #>> '{permissions,canReadPrivateEvidence}' <> 'false'
    or projection #> '{occurrences,0,privateStaffNote}' is not null
    or (select count(*) from public.course_schedule_occurrence_outcome_events) <> 0
    or (select count(*) from public.course_schedule_occurrence_evidence) <> 0 then
    raise exception 'The Student received raw staff outcome or evidence data.';
  end if;
  begin
    perform public.record_course_occurrence_outcome(
      current_setting('test.outcome_first_slot_id')::uuid,
      current_setting('test.outcome_review_event_id')::uuid,
      'delivered', 'curriculum_topic', 'recurring',
      'joint_presence_verified', 'full_charge', true,
      null, null, '{}'::uuid[], 'phase5f3-db-student-authority'
    );
    raise exception 'Expected Student outcome authority to fail.';
  exception
    when others then
      if sqlerrm = 'Expected Student outcome authority to fail.' then raise; end if;
  end;
  begin
    perform public.reserve_course_occurrence_evidence(
      current_setting('test.outcome_first_slot_id')::uuid,
      'student-proof.png', 'image/png', 1024,
      'phase5f3-db-student-evidence'
    );
    raise exception 'Expected Student private-evidence authority to fail.';
  exception
    when others then
      if sqlerrm = 'Expected Student private-evidence authority to fail.' then raise; end if;
  end;
end;
$student_projection_is_redacted_and_read_model_only$;

select public.submit_course_occurrence_dispute(
  (:'outcome_review'::jsonb ->> 'eventId')::uuid,
  'I would like my Mentor to review the purpose recorded for this lesson.',
  'phase5f3-db-student-dispute'
) as outcome_dispute \gset
select set_config(
  'test.outcome_dispute_event_id',
  :'outcome_dispute'::jsonb ->> 'disputeEventId',
  false
);

select public.submit_course_occurrence_dispute(
  (:'outcome_review'::jsonb ->> 'eventId')::uuid,
  'I would like my Mentor to review the purpose recorded for this lesson.',
  'phase5f3-db-student-dispute'
) as outcome_dispute_retry \gset
select set_config(
  'test.outcome_dispute_retry_event_id',
  :'outcome_dispute_retry'::jsonb ->> 'disputeEventId',
  false
);

do $dispute_submission_retry_is_idempotent$
begin
  if current_setting('test.outcome_dispute_event_id')
      <> current_setting('test.outcome_dispute_retry_event_id') then
    raise exception 'An exact dispute-submission retry did not return the original result.';
  end if;
end;
$dispute_submission_retry_is_idempotent$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.resolve_course_occurrence_dispute(
  (:'outcome_dispute'::jsonb ->> 'disputeEventId')::uuid,
  'rejected',
  'delivered',
  'review',
  'joint_presence_verified',
  'full_charge',
  'The lesson record and retained notes support the Tutor review classification.',
  'The Mentor reviewed the append-only outcome and dispute history.',
  'phase5f3-db-mentor-resolution'
) as outcome_resolution \gset

select public.resolve_course_occurrence_dispute(
  (:'outcome_dispute'::jsonb ->> 'disputeEventId')::uuid,
  'rejected',
  'delivered',
  'review',
  'joint_presence_verified',
  'full_charge',
  'The lesson record and retained notes support the Tutor review classification.',
  'The Mentor reviewed the append-only outcome and dispute history.',
  'phase5f3-db-mentor-resolution'
) as outcome_resolution_retry \gset
select set_config(
  'test.outcome_resolution_event_id',
  :'outcome_resolution'::jsonb ->> 'outcomeEventId',
  false
);
select set_config(
  'test.outcome_resolution_dispute_event_id',
  :'outcome_resolution'::jsonb ->> 'disputeResolutionEventId',
  false
);
select set_config(
  'test.outcome_resolution_retry_event_id',
  :'outcome_resolution_retry'::jsonb ->> 'outcomeEventId',
  false
);
select set_config(
  'test.outcome_resolution_retry_dispute_event_id',
  :'outcome_resolution_retry'::jsonb ->> 'disputeResolutionEventId',
  false
);

do $mentor_resolution_is_append_only_and_holds_settlement$
declare
  projection jsonb := public.get_my_course_occurrence_outcomes(
    current_setting('test.outcome_course_id')::uuid
  );
begin
  if projection #>> '{occurrences,0,openDispute}' <> 'false'
    or projection #>> '{occurrences,0,resolutionStatus}' <> 'delivered'
    or projection #>> '{occurrences,0,privateStaffNote}'
      <> 'The Mentor reviewed the append-only outcome and dispute history.'
    or (
      select count(*)
      from public.course_schedule_occurrence_outcome_events event
      where event.academic_slot_id =
        current_setting('test.outcome_first_slot_id')::uuid
    ) <> 2
    or (
      select count(*)
      from public.course_schedule_occurrence_dispute_events dispute
      where dispute.academic_slot_id =
        current_setting('test.outcome_first_slot_id')::uuid
    ) <> 2
    or current_setting('test.outcome_resolution_event_id')
      <> current_setting('test.outcome_resolution_retry_event_id')
    or current_setting('test.outcome_resolution_dispute_event_id')
      <> current_setting('test.outcome_resolution_retry_dispute_event_id') then
    raise exception 'The Mentor did not resolve the dispute through append-only history.';
  end if;
end;
$mentor_resolution_is_append_only_and_holds_settlement$;

-- A normal outsider remains denied. An administrator can grant the dedicated
-- Quality Assistant role, after which oversight works without Course membership.
select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_is_denied_before_quality_role$
begin
  begin
    perform public.get_my_course_occurrence_outcomes(
      current_setting('test.outcome_course_id')::uuid
    );
    raise exception 'Expected outsider outcome access to fail.';
  exception
    when others then
      if sqlerrm = 'Expected outsider outcome access to fail.' then raise; end if;
  end;
end;
$outsider_is_denied_before_quality_role$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.grant_user_role(
  :'outsider_id'::uuid,
  'quality_assistant',
  'Phase 5.F.3 rollback-only Quality Assistant oversight characterization.',
  false
);
select set_config('request.jwt.claim.sub', :'outsider_id', true);

do $quality_assistant_has_scoped_outcome_oversight$
declare
  projection jsonb := public.get_my_course_occurrence_outcomes(
    current_setting('test.outcome_course_id')::uuid
  );
begin
  if projection #>> '{permissions,canRecordOutcome}' <> 'true'
    or projection #>> '{permissions,canResolveDispute}' <> 'true'
    or projection #>> '{permissions,canReadPrivateEvidence}' <> 'true' then
    raise exception 'The Quality Assistant did not receive occurrence oversight.';
  end if;
end;
$quality_assistant_has_scoped_outcome_oversight$;

-- Private evidence reservations are staff-only, separate from Classroom Files,
-- PDF/JPEG/PNG only, capped at 20 MB, and retained for approximately two years.
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.reserve_course_occurrence_evidence(
  :'outcome_first_slot_id'::uuid,
  'outside-kelp-proof.png',
  'image/png',
  2048,
  'phase5f3-db-tutor-evidence'
) as outcome_evidence \gset
select set_config(
  'test.outcome_evidence_path',
  :'outcome_evidence'::jsonb ->> 'path',
  false
);

-- Cross-table storage isolation is a trusted characterization assertion.
-- Runtime Tutors use the governed Classroom Files and outcome-evidence APIs
-- rather than receiving raw SELECT authority over both private tables.
reset role;
do $evidence_is_private_and_two_year_retained$
begin
  if not exists (
    select 1
    from public.course_schedule_occurrence_evidence evidence
    where evidence.id = (
      select id from public.course_schedule_occurrence_evidence
      where idempotency_key = 'phase5f3-db-tutor-evidence'
    )
      and evidence.storage_bucket = 'course-outcome-evidence'
      and evidence.status = 'reserved'
      and evidence.retention_until = current_date + 730
  ) or exists (
    select 1 from public.classroom_files file
    where file.storage_path = current_setting('test.outcome_evidence_path')
  ) then
    raise exception 'Outcome evidence was not isolated from ordinary Classroom Files.';
  end if;
end;
$evidence_is_private_and_two_year_retained$;

do $occurrence_history_rejects_mutation$
begin
  begin
    update public.course_schedule_occurrence_outcome_events
    set public_explanation = 'This forbidden mutation must never be retained.'
    where id = current_setting('test.outcome_review_event_id')::uuid;
    raise exception 'Expected append-only outcome mutation to fail.';
  exception
    when others then
      if sqlerrm = 'Expected append-only outcome mutation to fail.' then raise; end if;
  end;
end;
$occurrence_history_rejects_mutation$;

rollback;
