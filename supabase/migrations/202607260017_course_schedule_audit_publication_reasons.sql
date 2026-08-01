-- Phase 5.G.2.4.5.6 follow-up: Builder publication commands retain the
-- authoritative reason set for complete and partial Track replacement. Surface
-- those reasons in staff audit history instead of the normalized subset written
-- to the successor Version's structural-change rows.

create or replace function public.get_my_course_schedule_audit_history(
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  actor_role text;
  can_read_audit boolean := false;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open Schedule audit history.';
  end if;

  select course.* into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception 'The Course could not be found.';
  end if;

  can_read_audit :=
    public.current_user_can_read_course_schedule_history(course_record.id)
    or public.current_user_can_oversee_course_outcomes(course_record.id);
  if not can_read_audit then
    raise exception
      'Schedule audit history is private to authorized Course staff.';
  end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  if actor_role is null
    and public.current_user_can_oversee_course_outcomes(course_record.id) then
    actor_role := 'quality_assistant';
  elsif actor_role is null
    and public.authorization_user_has_capability(
      caller_id,
      'authorization.manage'
    ) then
    actor_role := 'administrator';
  end if;

  with version_rows as (
    select
      version.*,
      coverage.display_label as coverage_label,
      case
        when version.id = course_record.active_schedule_version_id
          then 'active'
        else 'superseded'
      end as version_status,
      command.id as builder_command_id,
      command.actor_user_id as builder_actor_user_id,
      command.request_payload as builder_request_payload,
      command.transition_kind as builder_transition_kind,
      command.created_at as builder_created_at
    from public.course_schedule_versions version
    join public.course_schedules schedule
      on schedule.id = version.schedule_id
     and schedule.course_id = course_record.id
    left join public.course_schedule_version_coverages coverage
      on coverage.version_id = version.id
    left join lateral (
      select publication.*
      from public.course_schedule_builder_publish_commands publication
      where publication.published_version_id = version.id
      order by publication.created_at desc, publication.id desc
      limit 1
    ) command on true
  ),
  version_payloads as (
    select
      version.version_number,
      version.id,
      jsonb_build_object(
        'scheduleVersionId', version.id,
        'versionNumber', version.version_number,
        'previousVersionId', version.previous_version_id,
        'name', version.name,
        'timeZone', version.time_zone,
        'status', version.version_status,
        'createdAt', version.created_at,
        'createdBy', version.created_by,
        'coverageLabel', version.coverage_label,
        'reason', version.reason,
        'publicationTransition', version.builder_transition_kind,
        'itemCount', (
          select count(*)::integer
          from public.course_schedule_items item
          where item.version_id = version.id
        ),
        'effectiveItemCount', (
          select count(*)::integer
          from public.course_schedule_items item
          where item.version_id = version.id
            and item.item_state in ('scheduled', 'requeued')
        ),
        'droppedItemCount', (
          select count(*)::integer
          from public.course_schedule_items item
          where item.version_id = version.id
            and item.item_state = 'dropped'
        ),
        'changeCount', case
          when version.builder_command_id is not null then jsonb_array_length(
            coalesce(
              version.builder_request_payload -> 'changeReasons',
              '[]'::jsonb
            )
          )
          else (
            select count(*)::integer
            from public.course_schedule_version_changes change
            where change.version_id = version.id
          )
        end,
        'items', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'stableItemKey', item.stable_item_key,
            'title', item.title,
            'kind', item.item_kind,
            'state', item.item_state,
            'scheduledDate', item.scheduled_date,
            'endDate', item.end_date,
            'position', item.position,
            'sourceSessionKey', coalesce(
              nullif(item.source_session_key, ''),
              nullif(item.source_snapshot ->> 'sourceSessionKey', ''),
              nullif(item.source_snapshot ->> 'sourceSessionId', '')
            ),
            'sourceTrackKey', coalesce(
              nullif(item.source_track_key, ''),
              nullif(item.source_snapshot ->> 'sourceTrackKey', '')
            ),
            'sourceModuleKey', coalesce(
              nullif(item.source_module_key, ''),
              nullif(item.source_snapshot ->> 'sourceModuleKey', '')
            ),
            'sourceModuleTitle',
              nullif(item.source_snapshot ->> 'sourceModuleTitle', '')
          )) order by item.position, item.id)
          from public.course_schedule_items item
          where item.version_id = version.id
        ), '[]'::jsonb),
        'changes', case
          when version.builder_command_id is not null then coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'stableItemKey', reason.value ->> 'stableItemKey',
              'changeType', reason.value ->> 'changeType',
              'reasonCode', reason.value ->> 'reasonCode',
              'reasonLabel', catalog.label,
              'studentExplanation',
                reason.value ->> 'studentExplanation',
              'privateStaffNote', reason.value ->> 'privateStaffNote',
              'actorUserId', version.builder_actor_user_id,
              'actorName', coalesce(
                nullif(btrim(actor.full_name), ''),
                actor.email,
                'Staff member'
              ),
              'createdAt', version.builder_created_at,
              'publicationBoundary', true
            )) order by reason.ordinality)
            from jsonb_array_elements(coalesce(
              version.builder_request_payload -> 'changeReasons',
              '[]'::jsonb
            )) with ordinality reason(value, ordinality)
            left join public.course_schedule_change_reasons catalog
              on catalog.reason_code = reason.value ->> 'reasonCode'
            left join public.profiles actor
              on actor.id = version.builder_actor_user_id
          ), '[]'::jsonb)
          else coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'stableItemKey', change.stable_item_key,
              'changeType', change.change_type,
              'reasonCode', reason.reason_code,
              'reasonLabel', reason.label,
              'studentExplanation', change.student_explanation,
              'privateStaffNote', change.private_staff_note,
              'actorUserId', change.actor_user_id,
              'actorName', coalesce(
                nullif(btrim(actor.full_name), ''),
                actor.email,
                'Staff member'
              ),
              'beforeSnapshot', change.before_snapshot,
              'afterSnapshot', change.after_snapshot,
              'createdAt', change.created_at
            )) order by change.created_at, change.id)
            from public.course_schedule_version_changes change
            join public.course_schedule_change_reasons reason
              on reason.id = change.reason_id
            left join public.profiles actor
              on actor.id = change.actor_user_id
            where change.version_id = version.id
          ), '[]'::jsonb)
        end
      ) as version_payload
    from version_rows version
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course_record.id,
    'activeScheduleVersionId', course_record.active_schedule_version_id,
    'course', jsonb_build_object(
      'title', course_record.title,
      'status', course_record.status,
      'studentName', coalesce(
        nullif(btrim(student.full_name), ''),
        student.email,
        'Student'
      ),
      'tutorName', coalesce(
        nullif(btrim(tutor.full_name), ''),
        tutor.email,
        'Tutor'
      )
    ),
    'permissions', jsonb_build_object(
      'actorRole', coalesce(actor_role, 'staff'),
      'canReadScheduleAudit', true,
      'canReadPrivateStaffNotes', true,
      'canPrintScheduleAudit', true
    ),
    'summary', jsonb_build_object(
      'versionCount', (select count(*)::integer from version_rows),
      'changeCount', (
        select coalesce(sum(
          (version.version_payload ->> 'changeCount')::integer
        ), 0)::integer
        from version_payloads version
      )
    ),
    'versions', coalesce((
      select jsonb_agg(
        version.version_payload
        order by version.version_number desc, version.id
      )
      from version_payloads version
    ), '[]'::jsonb),
    'auditPolicy', jsonb_build_object(
      'appendOnlyVersionHistory', true,
      'privateStaffNotesIncluded', true,
      'builderPublicationReasonsIncluded', true,
      'studentAccess', false,
      'printable', true
    ),
    'featureStatus', jsonb_build_object(
      'courseScheduleAuditHistory', 'active_phase_5g2_4_5_6'
    )
  ) into payload
  from public.profiles student
  join public.profiles tutor on tutor.id = course_record.tutor_id
  where student.id = course_record.student_id;

  return payload;
end;
$$;

revoke all on function public.get_my_course_schedule_audit_history(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_course_schedule_audit_history(uuid)
to authenticated;
grant execute on function public.get_my_course_schedule_audit_history(uuid)
to service_role;

comment on function public.get_my_course_schedule_audit_history(uuid) is
  'Returns immutable Schedule Versions and the authoritative governed reason set for ordinary structural edits or Builder publication to authorized academic staff for audit and printing.';
