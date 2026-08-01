-- Phase 5.G.2.4.5.6: keep Student learning history worked-only and expose a
-- separate, printable Schedule audit projection to authorized academic staff.

alter function public.get_my_course_learning_history(uuid)
rename to get_my_course_learning_history_progress_base;

revoke all on function public.get_my_course_learning_history_progress_base(uuid)
from public, anon, authenticated;

create or replace function public.get_my_course_learning_history(
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  base_payload jsonb;
  filtered_versions jsonb := '[]'::jsonb;
  worked_session_count integer := 0;
  studied_count integer := 0;
  reviewed_count integer := 0;
  practiced_count integer := 0;
begin
  base_payload := public.get_my_course_learning_history_progress_base(p_course_id);

  with version_rows as (
    select entry.value as version_payload, entry.ordinality
    from jsonb_array_elements(
      coalesce(base_payload -> 'versions', '[]'::jsonb)
    ) with ordinality as entry(value, ordinality)
  ),
  filtered as (
    select
      version.version_payload,
      version.ordinality,
      coalesce((
        select jsonb_agg(item.value order by item.ordinality)
        from jsonb_array_elements(
          coalesce(version.version_payload -> 'items', '[]'::jsonb)
        ) with ordinality as item(value, ordinality)
        where coalesce(
          (item.value #>> '{progress,studied}')::boolean,
          false
        )
        or coalesce(
          (item.value #>> '{progress,practiced}')::boolean,
          false
        )
      ), '[]'::jsonb) as items
    from version_rows version
  ),
  rebuilt as (
    select
      (
        version.version_payload
        - 'items'
        - 'workedSessionCount'
        - 'studiedCount'
        - 'reviewedCount'
        - 'practicedCount'
      ) || jsonb_build_object(
        'workedSessionCount', jsonb_array_length(version.items),
        'studiedCount', (
          select count(*)::integer
          from jsonb_array_elements(version.items) item
          where coalesce((item #>> '{progress,studied}')::boolean, false)
        ),
        'reviewedCount', (
          select count(*)::integer
          from jsonb_array_elements(version.items) item
          where coalesce((item #>> '{progress,reviewed}')::boolean, false)
        ),
        'practicedCount', (
          select count(*)::integer
          from jsonb_array_elements(version.items) item
          where coalesce((item #>> '{progress,practiced}')::boolean, false)
        ),
        'items', version.items
      ) as version_payload,
      version.ordinality
    from filtered version
    where jsonb_array_length(version.items) > 0
  )
  select coalesce(
    jsonb_agg(version.version_payload order by version.ordinality),
    '[]'::jsonb
  )
  into filtered_versions
  from rebuilt version;

  select
    count(*)::integer,
    count(*) filter (
      where coalesce((item #>> '{progress,studied}')::boolean, false)
    )::integer,
    count(*) filter (
      where coalesce((item #>> '{progress,reviewed}')::boolean, false)
    )::integer,
    count(*) filter (
      where coalesce((item #>> '{progress,practiced}')::boolean, false)
    )::integer
  into
    worked_session_count,
    studied_count,
    reviewed_count,
    practiced_count
  from jsonb_array_elements(filtered_versions) version
  cross join lateral jsonb_array_elements(
    coalesce(version -> 'items', '[]'::jsonb)
  ) item;

  return base_payload || jsonb_build_object(
    'schemaVersion', 3,
    'versions', filtered_versions,
    'summary', jsonb_build_object(
      'workedSessionCount', coalesce(worked_session_count, 0),
      'studiedCount', coalesce(studied_count, 0),
      'reviewedCount', coalesce(reviewed_count, 0),
      'practicedCount', coalesce(practiced_count, 0),
      'scheduleVersionCount', jsonb_array_length(filtered_versions)
    ),
    'historyPolicy',
      coalesce(base_payload -> 'historyPolicy', '{}'::jsonb)
      || jsonb_build_object(
        'workedProgressKinds', jsonb_build_array('studied', 'practiced'),
        'reviewedOnlySessionsExcluded', true
      ),
    'featureStatus',
      coalesce(base_payload -> 'featureStatus', '{}'::jsonb)
      || jsonb_build_object(
        'courseLearningHistory', 'active_phase_5g2_4_5_6'
      )
  );
end;
$$;

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
      end as version_status
    from public.course_schedule_versions version
    join public.course_schedules schedule
      on schedule.id = version.schedule_id
     and schedule.course_id = course_record.id
    left join public.course_schedule_version_coverages coverage
      on coverage.version_id = version.id
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
        'changeCount', (
          select count(*)::integer
          from public.course_schedule_version_changes change
          where change.version_id = version.id
        ),
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
        'changes', coalesce((
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
        select count(*)::integer
        from public.course_schedule_version_changes change
        where change.course_id = course_record.id
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

revoke all on function public.get_my_course_learning_history(uuid)
from public, anon, authenticated;
revoke all on function public.get_my_course_schedule_audit_history(uuid)
from public, anon, authenticated;

grant execute on function public.get_my_course_learning_history(uuid)
to authenticated;
grant execute on function public.get_my_course_schedule_audit_history(uuid)
to authenticated;
grant execute on function public.get_my_course_learning_history(uuid)
to service_role;
grant execute on function public.get_my_course_schedule_audit_history(uuid)
to service_role;

comment on function public.get_my_course_schedule_audit_history(uuid) is
  'Returns immutable Schedule Versions, item snapshots, reasons, and private notes to authorized Tutor, Mentor, Quality, or administrative staff for audit and printing.';
