-- Phase 5.F.4: one role-aware Course Schedule timeline.
--
-- This is a read model only. It combines the active structural Schedule,
-- effective progress, academic slots, current target mapping, immutable target
-- locks, and latest occurrence outcomes. It does not create Classes, post
-- credits, or settle Tutor compensation.

create or replace function public.get_my_unified_course_schedule(
  p_course_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  active_version public.course_schedule_versions%rowtype;
  current_mapping public.course_schedule_target_mapping_revisions%rowtype;
  actor_role text;
  staff_view boolean := false;
  guardian_view boolean := false;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open the Course Schedule timeline.';
  end if;

  select course.* into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception 'The Course could not be found.';
  end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  staff_view :=
    coalesce(actor_role in ('tutor', 'mentor'), false)
    or public.current_user_can_oversee_course_outcomes(course_record.id)
    or public.authorization_user_has_capability(caller_id, 'authorization.manage');

  if actor_role is null
    and public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    actor_role := 'administrator';
  elsif actor_role is null
    and public.current_user_can_oversee_course_outcomes(course_record.id) then
    actor_role := 'quality_assistant';
  end if;

  select exists (
    select 1
    from public.classrooms classroom
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
    where classroom.course_id = course_record.id
      and membership.user_id = caller_id
      and membership.membership_role = 'guardian'
      and membership.status = 'active'
  ) into guardian_view;

  guardian_view := guardian_view and actor_role is null;
  if actor_role is null and guardian_view then
    actor_role := 'guardian';
  end if;

  if actor_role is null then
    raise exception 'You do not have access to this Course Schedule timeline.';
  end if;

  select version.* into active_version
  from public.course_schedule_versions version
  where version.id = course_record.active_schedule_version_id;
  if not found then
    raise exception 'The active Course Schedule Version could not be found.';
  end if;

  select revision.* into current_mapping
  from public.course_schedule_target_mapping_revisions revision
  where revision.version_id = active_version.id
  order by revision.revision_number desc, revision.id desc
  limit 1;

  with
  latest_outcomes as (
    select distinct on (event.academic_slot_id) event.*
    from public.course_schedule_occurrence_outcome_events event
    where event.course_id = course_record.id
      and event.version_id = active_version.id
    order by event.academic_slot_id, event.recorded_at desc, event.id desc
  ),
  current_targets as (
    select target.*
    from public.course_schedule_academic_slot_targets target
    where target.mapping_revision_id = current_mapping.id
  ),
  active_items as (
    select
      item.*,
      case
        when item.item_kind = 'curriculum_topic'
          and item.item_state in ('scheduled', 'requeued')
        then public.course_session_progress_aggregation(
          course_record.id,
          item.id,
          staff_view
        )
        else null
      end as progress
    from public.course_schedule_items item
    where item.version_id = active_version.id
      and item.item_state in ('scheduled', 'requeued')
  ),
  meeting_facts as (
    select
      slot.id as academic_slot_id,
      slot.stable_slot_key,
      slot.local_date,
      slot.local_start_time,
      slot.duration_minutes,
      slot.time_zone,
      public.course_schedule_slot_starts_at(slot) as starts_at,
      target_lock.id as target_lock_id,
      target_lock.locked_at,
      coalesce(target_lock.schedule_item_id, target.schedule_item_id) as schedule_item_id,
      item.stable_item_key,
      coalesce(target_lock.target_snapshot ->> 'title', item.title) as title,
      item.item_kind,
      item.difficulty_level,
      item.scheduled_date as original_planned_date,
      item.progress,
      outcome.id as outcome_event_id,
      outcome.resolution_status,
      outcome.delivery_kind,
      outcome.lesson_origin,
      outcome.attendance_basis,
      outcome.charge_recommendation,
      outcome.public_explanation,
      outcome.private_staff_note,
      outcome.response_deadline,
      outcome.dispute_deadline,
      outcome.fixed_at,
      outcome.settlement_not_before,
      outcome.metadata as outcome_metadata,
      exists (
        select 1
        from public.course_schedule_occurrence_dispute_events dispute
        where dispute.academic_slot_id = slot.id
          and dispute.event_action = 'submitted'
          and not exists (
            select 1
            from public.course_schedule_occurrence_dispute_events resolution
            where resolution.related_dispute_event_id = dispute.id
          )
      ) as open_dispute,
      exists (
        select 1
        from public.course_schedule_occurrence_evidence evidence
        where evidence.academic_slot_id = slot.id
          and evidence.status = 'active'
      ) as evidence_submitted
    from public.course_schedule_academic_slots slot
    left join current_targets target
      on target.academic_slot_id = slot.id
      and target.mapping_state in ('targeted', 'completed')
    left join public.course_schedule_target_locks target_lock
      on target_lock.academic_slot_id = slot.id
    left join active_items item
      on item.id = coalesce(target_lock.schedule_item_id, target.schedule_item_id)
    left join latest_outcomes outcome
      on outcome.academic_slot_id = slot.id
    where slot.version_id = active_version.id
      and slot.source_kind = 'recurring_pattern'
      and (
        coalesce(target_lock.schedule_item_id, target.schedule_item_id) is not null
        or outcome.id is not null
      )
  ),
  linked_progress_events as (
    select nullif(
      outcome.outcome_metadata #>> '{targetStudiedCommand,eventId}',
      ''
    )::uuid as event_id
    from meeting_facts outcome
    where outcome.outcome_metadata #>> '{targetStudiedCommand,eventId}' is not null
  ),
  meeting_rows as (
    select
      'meeting:' || meeting.academic_slot_id::text as row_id,
      coalesce(
        meeting.starts_at,
        meeting.local_date::timestamp at time zone meeting.time_zone
      ) as sort_at,
      case
        when meeting.outcome_event_id is not null
          or (
            meeting.starts_at is not null
            and meeting.starts_at < clock_timestamp()
          ) then 'past'
        else 'future'
      end as preliminary_section,
      case when guardian_view then
        jsonb_strip_nulls(jsonb_build_object(
          'rowId', 'meeting:' || meeting.academic_slot_id::text,
          'rowKind', 'meeting',
          'effectiveDate', meeting.local_date,
          'title', meeting.title,
          'difficultyLevel', meeting.difficulty_level,
          'status', case
            when meeting.outcome_event_id is not null
              then coalesce(meeting.resolution_status, 'pending')
            when meeting.target_lock_id is not null then 'confirmed'
            else 'planned'
          end
        ))
      else
        jsonb_strip_nulls(jsonb_build_object(
          'rowId', 'meeting:' || meeting.academic_slot_id::text,
          'rowKind', 'meeting',
          'academicSlotId', meeting.academic_slot_id,
          'stableSlotKey', meeting.stable_slot_key,
          'effectiveDate', meeting.local_date,
          'effectiveTimestamp', meeting.starts_at,
          'localStartTime', case when meeting.local_start_time is null
            then null else to_char(meeting.local_start_time, 'HH24:MI') end,
          'durationMinutes', meeting.duration_minutes,
          'timeZone', meeting.time_zone,
          'title', meeting.title,
          'scheduleItemId', meeting.schedule_item_id,
          'stableItemKey', meeting.stable_item_key,
          'itemKind', meeting.item_kind,
          'difficultyLevel', meeting.difficulty_level,
          'originalPlannedDate', meeting.original_planned_date,
          'targetState', case when meeting.target_lock_id is not null
            then 'confirmed' else 'planned' end,
          'status', case
            when meeting.outcome_event_id is not null
              then coalesce(meeting.resolution_status, 'pending')
            when meeting.target_lock_id is not null then 'confirmed'
            else 'planned'
          end,
          'actualPurpose', meeting.delivery_kind,
          'lessonOrigin', meeting.lesson_origin,
          'attendanceBasis', meeting.attendance_basis,
          'chargeRecommendation', meeting.charge_recommendation,
          'publicExplanation', meeting.public_explanation,
          'responseDeadline', meeting.response_deadline,
          'disputeDeadline', meeting.dispute_deadline,
          'fixedAt', meeting.fixed_at,
          'settlementNotBefore', meeting.settlement_not_before,
          'openDispute', coalesce(meeting.open_dispute, false),
          'evidenceSubmitted', coalesce(meeting.evidence_submitted, false),
          'privateStaffNote', case when staff_view
            then meeting.private_staff_note else null end,
          'progress', coalesce(meeting.progress - 'resources', '{}'::jsonb),
          'resources', coalesce(meeting.progress -> 'resources', '[]'::jsonb),
          'evidence', case when staff_view then coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', evidence.id,
              'fileName', evidence.original_file_name,
              'mimeType', evidence.mime_type,
              'sizeBytes', evidence.size_bytes,
              'bucket', evidence.storage_bucket,
              'path', evidence.storage_path,
              'uploadedBy', evidence.uploaded_by,
              'activatedAt', evidence.activated_at,
              'retentionUntil', evidence.retention_until
            ) order by evidence.activated_at, evidence.id)
            from public.course_schedule_occurrence_evidence evidence
            where evidence.academic_slot_id = meeting.academic_slot_id
              and evidence.status = 'active'
          ), '[]'::jsonb) else null end
        ))
      end as row_payload
    from meeting_facts meeting
  ),
  independent_rows as (
    select
      'progress:' || item.id::text as row_id,
      (item.progress #>> '{studied,effectiveAt}')::timestamptz as sort_at,
      'past'::text as preliminary_section,
      case when guardian_view then
        jsonb_strip_nulls(jsonb_build_object(
          'rowId', 'progress:' || item.id::text,
          'rowKind', 'independent_progress',
          'effectiveDate',
            ((item.progress #>> '{studied,effectiveAt}')::timestamptz
              at time zone active_version.time_zone)::date,
          'title', item.title,
          'difficultyLevel', item.difficulty_level,
          'status', 'studied'
        ))
      else
        jsonb_strip_nulls(jsonb_build_object(
          'rowId', 'progress:' || item.id::text,
          'rowKind', 'independent_progress',
          'scheduleItemId', item.id,
          'stableItemKey', item.stable_item_key,
          'effectiveDate',
            ((item.progress #>> '{studied,effectiveAt}')::timestamptz
              at time zone active_version.time_zone)::date,
          'effectiveTimestamp', item.progress #>> '{studied,effectiveAt}',
          'title', item.title,
          'itemKind', item.item_kind,
          'difficultyLevel', item.difficulty_level,
          'originalPlannedDate', item.scheduled_date,
          'status', 'studied',
          'progress', item.progress - 'resources',
          'resources', item.progress -> 'resources'
        ))
      end as row_payload
    from active_items item
    where item.item_kind = 'curriculum_topic'
      and coalesce((item.progress #>> '{studied,marked}')::boolean, false)
      and not exists (
        select 1
        from linked_progress_events linked
        where linked.event_id = nullif(
          item.progress #>> '{studied,directTransitionEventId}', ''
        )::uuid
      )
  ),
  targeted_item_ids as (
    select distinct meeting.schedule_item_id
    from meeting_facts meeting
    where meeting.schedule_item_id is not null
  ),
  planned_rows as (
    select
      'plan:' || item.id::text as row_id,
      item.scheduled_date::timestamp at time zone active_version.time_zone as sort_at,
      'future'::text as preliminary_section,
      case when guardian_view then
        jsonb_strip_nulls(jsonb_build_object(
          'rowId', 'plan:' || item.id::text,
          'rowKind', 'planned_topic',
          'effectiveDate', item.scheduled_date,
          'title', item.title,
          'difficultyLevel', item.difficulty_level,
          'status', 'planned'
        ))
      else
        jsonb_strip_nulls(jsonb_build_object(
          'rowId', 'plan:' || item.id::text,
          'rowKind', 'planned_topic',
          'scheduleItemId', item.id,
          'stableItemKey', item.stable_item_key,
          'effectiveDate', item.scheduled_date,
          'title', item.title,
          'itemKind', item.item_kind,
          'difficultyLevel', item.difficulty_level,
          'originalPlannedDate', item.scheduled_date,
          'status', 'planned',
          'progress', coalesce(item.progress - 'resources', '{}'::jsonb),
          'resources', coalesce(item.progress -> 'resources', '[]'::jsonb)
        ))
      end as row_payload
    from active_items item
    where not (
      item.item_kind = 'curriculum_topic'
      and coalesce((item.progress #>> '{studied,marked}')::boolean, false)
    )
      and not exists (
        select 1 from targeted_item_ids target
        where target.schedule_item_id = item.id
      )
  ),
  all_rows as (
    select * from meeting_rows
    union all
    select * from independent_rows
    union all
    select * from planned_rows
  ),
  sectioned as (
    select
      row.*,
      case
        when row.preliminary_section = 'past' then 'past'
        when row_number() over (
          partition by row.preliminary_section
          order by row.sort_at, row.row_id
        ) = 1 then 'next'
        else 'upcoming'
      end as section
    from all_rows row
  ),
  final_rows as (
    select
      sectioned.*,
      sectioned.row_payload || jsonb_build_object('section', sectioned.section)
        as final_payload
    from sectioned
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'course', jsonb_build_object(
      'id', course_record.id,
      'title', course_record.title,
      'status', course_record.status,
      'serviceModel', course_record.service_model,
      'startDate', course_record.start_date,
      'scheduledEndDate', course_record.scheduled_end_date
    ),
    'schedule', jsonb_build_object(
      'id', active_version.schedule_id,
      'activeVersionId', active_version.id,
      'versionNumber', active_version.version_number,
      'name', active_version.name,
      'timeZone', active_version.time_zone,
      'mappingRevisionId', current_mapping.id,
      'mappingRevisionNumber', current_mapping.revision_number
    ),
    'viewer', jsonb_build_object(
      'actorRole', actor_role,
      'viewMode', case
        when guardian_view then 'guardian_summary'
        when staff_view then 'staff_audit'
        else 'student'
      end
    ),
    'permissions', jsonb_build_object(
      'canReadProgressDetails', not guardian_view,
      'canReadPublicOutcomeDetails', not guardian_view,
      'canReadPrivateStaffNotes', staff_view,
      'canReadEvidence', staff_view,
      'canReadVersionHistory', staff_view,
      'canRecordStudentProgress', actor_role = 'student',
      'canRecordOccurrenceOutcome', staff_view
    ),
    'groups', jsonb_build_object(
      'past', coalesce((
        select jsonb_agg(final.final_payload order by final.sort_at, final.row_id)
        from final_rows final where final.section = 'past'
      ), '[]'::jsonb),
      'next', coalesce((
        select jsonb_agg(final.final_payload order by final.sort_at, final.row_id)
        from final_rows final where final.section = 'next'
      ), '[]'::jsonb),
      'upcoming', coalesce((
        select jsonb_agg(final.final_payload order by final.sort_at, final.row_id)
        from final_rows final where final.section = 'upcoming'
      ), '[]'::jsonb)
    ),
    'summary', jsonb_build_object(
      'pastCount', (select count(*) from final_rows where section = 'past'),
      'nextCount', (select count(*) from final_rows where section = 'next'),
      'upcomingCount', (select count(*) from final_rows where section = 'upcoming'),
      'targetingStatus', case when current_mapping.id is null
        then 'generation_required' else 'configured' end
    ),
    'versionHistory', case when staff_view then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'name', version.name,
        'timeZone', version.time_zone,
        'effectiveFrom', (
          select min(history_item.scheduled_date)
          from public.course_schedule_items history_item
          where history_item.version_id = version.id
        ),
        'effectiveUntil', (
          select max(history_item.end_date)
          from public.course_schedule_items history_item
          where history_item.version_id = version.id
        ),
        'previousVersionId', version.previous_version_id,
        'createdAt', version.created_at,
        'itemCount', (
          select count(*) from public.course_schedule_items history_item
          where history_item.version_id = version.id
        )
      ) order by version.version_number desc, version.id)
      from public.course_schedule_versions version
      where version.schedule_id = active_version.schedule_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'financialBoundary', jsonb_build_object(
      'recommendationsOnly', true,
      'creditPosting', 'deferred_credit_phase',
      'tutorSettlementPosting', 'deferred_live_class_phase',
      'minimumSettlementHoldDays', 14
    ),
    'featureStatus', jsonb_build_object(
      'unifiedScheduleProjection', 'active_phase_5f4',
      'classroomInterface', 'deferred_phase_5h',
      'calendarBooking', 'deferred_calendar_phase',
      'credits', 'deferred_credit_phase'
    )
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.get_my_unified_course_schedule(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_unified_course_schedule(uuid)
  to authenticated;
grant execute on function public.get_my_unified_course_schedule(uuid)
  to service_role;

comment on function public.get_my_unified_course_schedule(uuid) is
  'Phase 5.F.4 active-Version timeline combining structural plan, progress, slots, target locks, and latest outcomes. Guardian reads are high-level; Student reads are public; authorized staff retain audit detail.';
