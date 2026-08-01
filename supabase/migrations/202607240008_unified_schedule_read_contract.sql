-- Phase 5.G.1: canonical Course Schedule read contract.
--
-- The existing Phase 5.F timeline and effective module projection already own
-- the underlying facts. This migration gives downstream Classroom and Calendar
-- consumers one versioned envelope and one presentation vocabulary without
-- creating bookings, Classes, credit entries, notifications, or mutable audit
-- records.

alter function public.get_my_unified_course_schedule(uuid)
  rename to get_my_unified_course_schedule_phase5f5;

create or replace function public.project_phase5g1_timeline_rows(
  p_rows jsonb,
  p_as_of timestamptz,
  p_display_time_zone text
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $$
declare
  projected_rows jsonb;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    return '[]'::jsonb;
  end if;

  with input_rows as (
    select
      entry.row_payload,
      entry.ordinality,
      entry.row_payload ->> 'rowKind' as row_kind,
      nullif(entry.row_payload ->> 'effectiveTimestamp', '')::timestamptz
        as starts_at,
      coalesce(
        nullif(entry.row_payload ->> 'durationMinutes', '')::integer,
        0
      ) as duration_minutes,
      lower(coalesce(entry.row_payload ->> 'status', 'planned')) as legacy_status,
      lower(coalesce(entry.row_payload ->> 'attendanceBasis', '')) as attendance_basis
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
      with ordinality entry(row_payload, ordinality)
  ),
  classified as (
    select
      input.*,
      case
        when input.row_kind <> 'meeting' then input.legacy_status
        when input.legacy_status in ('delivered', 'not_delivered', 'cancelled')
          then input.legacy_status
        when input.legacy_status = 'pending' then 'pending_confirmation'
        when input.starts_at is null
          and input.legacy_status = 'confirmed'
          and input.row_payload ->> 'section' = 'past'
          then 'pending_confirmation'
        when input.starts_at is null
          and input.legacy_status = 'confirmed'
          then 'awaiting'
        when input.starts_at is null then 'planned'
        when p_as_of < input.starts_at - interval '6 hours' then 'planned'
        when p_as_of < input.starts_at
          + make_interval(mins => input.duration_minutes) then 'awaiting'
        else 'pending_confirmation'
      end as display_status,
      case
        when input.attendance_basis = 'student_no_show' then 'student_absent'
        when input.attendance_basis = 'tutor_no_show' then 'tutor_absent'
        when input.attendance_basis = 'technical_uncertain' then 'technical_issue'
        when input.attendance_basis = 'outside_kelp_claim'
          then 'outside_kelp_unconfirmed'
        else 'unverified'
      end as non_delivery_reason
    from input_rows input
  )
  select coalesce(jsonb_agg(
    case
      when row.row_kind = 'meeting' then
        jsonb_strip_nulls(
          (
            row.row_payload
              - 'status'
              - 'targetState'
              - 'calendarPresentation'
              - 'nonDeliveryReason'
          )
          || jsonb_build_object(
            'status', row.display_status,
            'targetState', case
              when row.row_payload ->> 'targetState' = 'confirmed'
                then 'locked'
              else 'planned'
            end,
            'nonDeliveryReason', case
              when row.display_status = 'not_delivered'
                then row.non_delivery_reason
              else null
            end,
            'calendarPresentation', jsonb_build_object(
              'sourceKind', 'academic_opportunity',
              'isDateOnly', false,
              'startsAt', row.starts_at,
              'endsAt', case
                when row.starts_at is null then null
                else row.starts_at
                  + make_interval(mins => row.duration_minutes)
              end,
              'displayTimeZone', p_display_time_zone,
              'blocksAvailability', false,
              'bookingStatus', 'not_created'
            )
          )
        )
      else
        jsonb_strip_nulls(
          (
            row.row_payload
              - 'calendarPresentation'
          )
          || jsonb_build_object(
            'calendarPresentation', jsonb_build_object(
              'sourceKind', case row.row_kind
                when 'independent_progress' then 'independent_progress'
                else 'course_target'
              end,
              'isDateOnly', true,
              'effectiveDate', row.row_payload ->> 'effectiveDate',
              'displayAnchor', case
                when nullif(row.row_payload ->> 'effectiveDate', '') is null
                  then null
                else (
                  (
                    (row.row_payload ->> 'effectiveDate')::date
                    + time '12:00'
                  ) at time zone p_display_time_zone
                )
              end,
              'displayLocalTime', '12:00',
              'displayTimeZone', p_display_time_zone,
              'placement', 'viewer_local_noon',
              'blocksAvailability', false
            )
          )
        )
    end
    order by row.ordinality
  ), '[]'::jsonb)
  into projected_rows
  from classified row;

  return projected_rows;
end;
$$;

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
  payload jsonb;
  effective_payload jsonb := '{}'::jsonb;
  context_payload jsonb;
  staff_context jsonb := '{}'::jsonb;
  actor_role text;
  view_mode text;
  display_time_zone text;
  group_key text;
  as_of timestamptz := clock_timestamp();
begin
  payload := public.get_my_unified_course_schedule_phase5f5(p_course_id);
  actor_role := payload #>> '{viewer,actorRole}';
  view_mode := payload #>> '{viewer,viewMode}';
  display_time_zone := coalesce(
    nullif(payload #>> '{schedule,timeZone}', ''),
    'UTC'
  );

  if actor_role in ('student', 'tutor', 'mentor', 'administrator') then
    effective_payload := public.get_my_effective_course_schedule(p_course_id);
  end if;

  select
    jsonb_build_object(
      'classroom', jsonb_strip_nulls(jsonb_build_object(
        'id', classroom.id,
        'status', classroom.status
      )),
      'academicContext', jsonb_build_object(
        'educationLevel', jsonb_strip_nulls(jsonb_build_object(
          'id', degree.id,
          'name', degree.name,
          'slug', degree.slug
        )),
        'subject', jsonb_build_object(
          'id', subject.id,
          'name', subject.name,
          'slug', subject.slug
        ),
        'track', jsonb_build_object(
          'id', track.id,
          'name', track.name,
          'slug', track.slug
        )
      ),
      'participants', jsonb_build_object(
        'student', jsonb_build_object(
          'id', student.id,
          'name', student.full_name
        ),
        'tutor', jsonb_build_object(
          'id', tutor.id,
          'name', tutor.full_name
        )
      ),
      'provider', jsonb_build_object(
        'kind', course.provider_kind,
        'serviceModel', course.service_model
      ),
      'lifecycle', jsonb_build_object(
        'courseStatus', course.status,
        'courseStartDate', course.start_date,
        'courseScheduledEndDate', course.scheduled_end_date,
        'courseActivatedAt', course.activated_at,
        'courseEndedAt', course.ended_at,
        'scheduleStatus', stable_schedule.status,
        'scheduleFinishedAt', stable_schedule.finished_at
      )
    ),
    case when view_mode = 'staff_audit' then
      jsonb_strip_nulls(jsonb_build_object(
        'mentor', case when mentor.id is null then null
          else jsonb_build_object(
            'id', mentor.id,
            'name', mentor.full_name
          )
        end,
        'selfSupervised', course.mentor_id is null
      ))
    else '{}'::jsonb end
  into context_payload, staff_context
  from public.student_courses course
  join public.course_schedules stable_schedule
    on stable_schedule.course_id = course.id
  join public.curriculum_nodes subject
    on subject.id = course.subject_node_id
  join public.curriculum_nodes track
    on track.id = course.focus_node_id
  left join public.curriculum_nodes degree
    on degree.id = subject.parent_id
   and degree.node_type = 'degree'
  join public.profiles student on student.id = course.student_id
  join public.profiles tutor on tutor.id = course.tutor_id
  left join public.profiles mentor on mentor.id = course.mentor_id
  left join public.classrooms classroom on classroom.course_id = course.id
  where course.id = p_course_id;

  if context_payload is null then
    raise exception 'The Course Schedule context could not be projected.';
  end if;

  foreach group_key in array array['past', 'next', 'upcoming'] loop
    payload := jsonb_set(
      payload,
      array['groups', group_key],
      public.project_phase5g1_timeline_rows(
        payload #> array['groups', group_key],
        as_of,
        display_time_zone
      ),
      true
    );
  end loop;

  payload := jsonb_set(payload, '{schemaVersion}', '2'::jsonb, true);
  payload := jsonb_set(
    payload,
    '{contract}',
    jsonb_build_object(
      'name', 'course_schedule_read',
      'phase', '5.G.1',
      'version', 1,
      'asOf', as_of,
      'authority', jsonb_build_object(
        'structure', 'course_schedule_versions',
        'progress', 'course_progress_events',
        'academicOpportunities', 'course_schedule_academic_slots',
        'targetMapping', 'course_schedule_target_mapping_revisions',
        'meetingOutcomes', 'course_schedule_occurrence_outcome_events'
      ),
      'legacyMirror', jsonb_build_object(
        'relation', 'learning_schedules',
        'authoritative', false,
        'purpose', jsonb_build_array(
          'calendar_compatibility',
          'immutable_practice_assignment_snapshots'
        )
      )
    ),
    true
  );
  payload := jsonb_set(payload, '{context}', context_payload, true);
  payload := jsonb_set(payload, '{staffContext}', staff_context, true);
  payload := jsonb_set(
    payload,
    '{academicTrack}',
    case
      when effective_payload <> '{}'::jsonb then jsonb_build_object(
        'layoutMode', 'modules',
        'activeScheduleVersionId',
          effective_payload -> 'activeScheduleVersionId',
        'versionNumber', effective_payload -> 'versionNumber',
        'items', coalesce(effective_payload -> 'items', '[]'::jsonb),
        'trackProgress',
          coalesce(effective_payload -> 'trackProgress', '{}'::jsonb),
        'moduleStyles',
          coalesce(effective_payload -> 'moduleStyles', '{}'::jsonb),
        'pdfStyle', coalesce(effective_payload -> 'pdfStyle', '{}'::jsonb),
        'educationLevel',
          coalesce(
            effective_payload -> 'educationLevel',
            context_payload #> '{academicContext,educationLevel}'
          )
      )
      else jsonb_build_object(
        'layoutMode', 'higher_level_timeline',
        'items', '[]'::jsonb,
        'trackProgress', '{}'::jsonb,
        'moduleStyles', '{}'::jsonb,
        'pdfStyle', '{}'::jsonb,
        'educationLevel',
          context_payload #> '{academicContext,educationLevel}'
      )
    end,
    true
  );
  payload := jsonb_set(
    payload,
    '{permissions}',
    coalesce(payload -> 'permissions', '{}'::jsonb)
      || (coalesce(effective_payload -> 'permissions', '{}'::jsonb) - 'actorRole')
      || jsonb_build_object(
        'canReadDetailedAcademicTrack',
          effective_payload <> '{}'::jsonb,
        'canReadStaffContext', view_mode = 'staff_audit'
      ),
    true
  );
  payload := jsonb_set(
    payload,
    '{calendarPolicy}',
    jsonb_build_object(
      'dateOnlyDisplayAnchor', 'viewer_local_noon',
      'dateOnlyDisplayIsPresentationOnly', true,
      'dateOnlyItemsBlockAvailability', false,
      'assignmentDeadlinesAreIndependent', true,
      'assignmentDeadlineChangesMoveMeetings', false,
      'academicSlotsCreateBookings', false,
      'explicitDueTimeOverridesNoonAnchor', true
    ),
    true
  );
  payload := jsonb_set(
    payload,
    '{meetingStatePolicy}',
    jsonb_build_object(
      'states', jsonb_build_array(
        'planned',
        'awaiting',
        'pending_confirmation',
        'delivered',
        'not_delivered',
        'cancelled'
      ),
      'lockWindowHours', 6,
      'nonDeliveryReasons', jsonb_build_array(
        'student_absent',
        'tutor_absent',
        'technical_issue',
        'outside_kelp_unconfirmed',
        'unverified'
      ),
      'automaticUnreportedOutcome', jsonb_build_object(
        'status', 'not_delivered',
        'reason', 'unverified',
        'assignsBlame', false,
        'postsFinalCharge', false
      )
    ),
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus}',
    coalesce(payload -> 'featureStatus', '{}'::jsonb)
      || jsonb_build_object(
        'unifiedScheduleReadContract', 'active_phase_5g1',
        'consumerCutover', 'planned_phase_5g2',
        'integrationEvents', 'planned_phase_5g3',
        'courseFinishCommand', 'planned_later_phase_5g'
      ),
    true
  );

  return payload;
end;
$$;

revoke all on function public.get_my_unified_course_schedule_phase5f5(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.project_phase5g1_timeline_rows(
  jsonb, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_my_unified_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_unified_course_schedule(uuid)
  to authenticated, service_role;

comment on function public.get_my_unified_course_schedule_phase5f5(uuid) is
  'Private retained Phase 5.F.5 timeline wrapped by the Phase 5.G.1 canonical read contract.';
comment on function public.project_phase5g1_timeline_rows(
  jsonb, timestamptz, text
) is
  'Private Phase 5.G.1 presentation helper for meeting states, non-delivery reasons, and viewer-local noon anchors.';
comment on function public.get_my_unified_course_schedule(uuid) is
  'Phase 5.G.1 canonical Course Schedule read contract. Detailed module rows remain available to assigned Classroom actors, Guardian reads remain high-level, and Calendar presentation metadata creates no booking or financial facts.';
