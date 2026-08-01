-- Student-visible accountability for staff Course-progress changes.
--
-- Tutor and Mentor Session-level Studied marks already produce immutable
-- progress events and recipient-scoped notification facts. Make the public
-- explanation mandatory for every staff mark and reversal, include it in the
-- notification payload, and expose a private-note-free Log for the current
-- effective Schedule.

create or replace function public.validate_course_progress_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  item_record public.course_schedule_items%rowtype;
  resource_record public.course_schedule_item_resources%rowtype;
  related_record public.course_progress_events%rowtype;
begin
  select course.* into course_record
  from public.student_courses course
  where course.id = new.course_id;
  if not found then
    raise exception 'The Course progress event Course does not exist.';
  end if;

  select item.* into item_record
  from public.course_schedule_items item
  join public.course_schedule_versions version on version.id = item.version_id
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where item.id = new.schedule_item_id
    and item.version_id = new.schedule_version_id
    and schedule.course_id = new.course_id;
  if not found then
    raise exception
      'The Course progress target does not belong to the Course Schedule.';
  end if;
  if item_record.item_kind <> 'curriculum_topic'
    or item_record.stable_item_key <> new.stable_item_key then
    raise exception 'The Course progress Session identity is invalid.';
  end if;

  if new.target_kind = 'resource' then
    select resource.* into resource_record
    from public.course_schedule_item_resources resource
    where resource.id = new.resource_id
      and resource.schedule_item_id = new.schedule_item_id;
    if not found
      or resource_record.stable_resource_key <> new.stable_resource_key
      or resource_record.requirement_state = 'not_assigned' then
      raise exception 'The Course progress resource identity is invalid.';
    end if;
  end if;

  if public.course_progress_actor_role(course_record, new.actor_user_id)
    is distinct from new.actor_role then
    raise exception 'The Course progress actor role is invalid.';
  end if;

  if new.actor_role = 'student' then
    if new.event_action = 'reversed' and new.progress_kind = 'studied' then
      raise exception 'Students cannot reverse Studied progress.';
    end if;
    if new.private_staff_note is not null then
      raise exception 'Students cannot create private academic staff notes.';
    end if;
  else
    if new.progress_kind <> 'studied'
      or (
        new.event_action in ('marked', 'reflection_amended')
        and new.target_kind <> 'session'
      ) then
      raise exception
        'Academic staff may mark Session-level Studied progress and correct Studied Session or resource progress.';
    end if;
    if new.reflection is not null then
      raise exception 'Progress reflections remain Student-controlled.';
    end if;
    if new.event_action in ('marked', 'reversed')
      and not public.course_progress_reason_is_valid(
        new.student_explanation
      ) then
      raise exception
        'A Student-visible explanation is required whenever a Tutor or Mentor marks or unmarks Studied progress.';
    end if;
  end if;

  if new.event_action = 'reflection_amended'
    and new.actor_role <> 'student' then
    raise exception 'Only Students may amend progress reflections.';
  end if;

  if new.related_event_id is not null then
    select * into related_record
    from public.course_progress_events event
    where event.id = new.related_event_id;
    if not found
      or related_record.course_id <> new.course_id
      or related_record.stable_item_key <> new.stable_item_key
      or related_record.stable_resource_key
        is distinct from new.stable_resource_key
      or related_record.progress_kind <> new.progress_kind then
      raise exception 'The related Course progress event is invalid.';
    end if;
    if new.event_action = 'reversed'
      and related_record.event_action <> 'marked' then
      raise exception 'A progress reversal must reference the active mark.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.insert_course_progress_notifications(
  p_event public.course_progress_events
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  notification_type text;
begin
  if p_event.progress_kind <> 'studied'
    or p_event.event_action not in ('marked', 'reversed') then
    return;
  end if;

  select * into course_record
  from public.student_courses
  where id = p_event.course_id;

  notification_type := case p_event.event_action
    when 'marked' then 'progress_studied_marked'
    else 'progress_studied_reversed'
  end;

  insert into public.course_progress_notification_events (
    recipient_user_id,
    actor_user_id,
    course_id,
    progress_event_id,
    event_type,
    payload
  )
  select
    recipient.user_id,
    p_event.actor_user_id,
    p_event.course_id,
    p_event.id,
    notification_type,
    jsonb_strip_nulls(jsonb_build_object(
      'scheduleItemId', p_event.schedule_item_id,
      'stableItemKey', p_event.stable_item_key,
      'title', coalesce(
        nullif(p_event.target_snapshot ->> 'title', ''),
        nullif(p_event.target_snapshot ->> 'resourceTitle', '')
      ),
      'targetKind', p_event.target_kind,
      'stableResourceKey', p_event.stable_resource_key,
      'progressKind', p_event.progress_kind,
      'action', p_event.event_action,
      'studentExplanation', p_event.student_explanation,
      'effectiveAt', p_event.effective_at,
      'recordedAt', p_event.recorded_at,
      'actorRole', p_event.actor_role
    ))
  from (
    select p_event.actor_user_id as user_id
    union select course_record.student_id
    union select course_record.tutor_id
  ) recipient
  where recipient.user_id is not null
  on conflict (recipient_user_id, progress_event_id, event_type) do nothing;
end;
$$;

create or replace function public.get_my_current_course_schedule_log(
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
  schedule_record public.course_schedules%rowtype;
  version_record public.course_schedule_versions%rowtype;
  actor_role text;
  can_oversee boolean := false;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open the Schedule Log.';
  end if;

  select course.* into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception 'The Course could not be found.';
  end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  can_oversee := public.current_user_can_oversee_course_outcomes(
    course_record.id
  );
  if actor_role is null
    and not can_oversee
    and not public.authorization_user_has_capability(
      caller_id,
      'authorization.manage'
    ) then
    raise exception
      'The current Schedule Log is private to the Student and authorized Course staff.';
  end if;
  if actor_role is null and can_oversee then
    actor_role := 'quality_assistant';
  elsif actor_role is null then
    actor_role := 'administrator';
  end if;

  select schedule.* into schedule_record
  from public.course_schedules schedule
  where schedule.course_id = course_record.id;
  if not found or course_record.active_schedule_version_id is null then
    raise exception 'The Course does not have an active Schedule.';
  end if;

  select version.* into version_record
  from public.course_schedule_versions version
  where version.id = course_record.active_schedule_version_id
    and version.schedule_id = schedule_record.id;
  if not found then
    raise exception 'The active Schedule Version could not be found.';
  end if;

  with active_items as (
    select item.*
    from public.course_schedule_items item
    where item.version_id = version_record.id
  ),
  builder_publication as (
    select command.*
    from public.course_schedule_builder_publish_commands command
    where command.published_version_id = version_record.id
    order by command.created_at desc, command.id desc
    limit 1
  ),
  progress_entries as (
    select
      event.recorded_at as occurred_at,
      event.id::text as stable_order,
      jsonb_strip_nulls(jsonb_build_object(
        'entryId', event.id,
        'entryKind', 'progress',
        'action', event.event_action,
        'progressKind', event.progress_kind,
        'stableItemKey', event.stable_item_key,
        'sourceSessionKey', active_item.source_session_key,
        'title', coalesce(
          nullif(event.target_snapshot ->> 'title', ''),
          active_item.title,
          event.stable_item_key
        ),
        'studentExplanation', event.student_explanation,
        'actorUserId', event.actor_user_id,
        'actorName', coalesce(
          nullif(btrim(actor.full_name), ''),
          actor.email,
          'Course participant'
        ),
        'actorRole', event.actor_role,
        'effectiveAt', event.effective_at,
        'recordedAt', event.recorded_at
      )) as entry
    from public.course_progress_events event
    join active_items active_item
      on active_item.stable_item_key = event.stable_item_key
    left join public.profiles actor on actor.id = event.actor_user_id
    where event.course_id = course_record.id
      and event.target_kind = 'session'
      and event.event_action in ('marked', 'reversed')
  ),
  builder_entries as (
    select
      command.created_at as occurred_at,
      concat(command.id::text, ':', reason.ordinality::text) as stable_order,
      jsonb_strip_nulls(jsonb_build_object(
        'entryId', concat(command.id::text, ':', reason.ordinality::text),
        'entryKind', 'structure',
        'action', reason.value ->> 'changeType',
        'stableItemKey', reason.value ->> 'stableItemKey',
        'sourceSessionKey', active_item.source_session_key,
        'title', coalesce(
          active_item.title,
          reason.value ->> 'stableItemKey',
          'Schedule item'
        ),
        'reasonCode', reason.value ->> 'reasonCode',
        'reasonLabel', catalog.label,
        'studentExplanation',
          reason.value ->> 'studentExplanation',
        'actorUserId', command.actor_user_id,
        'actorName', coalesce(
          nullif(btrim(actor.full_name), ''),
          actor.email,
          'Staff member'
        ),
        'actorRole', coalesce(
          public.course_progress_actor_role(
            course_record,
            command.actor_user_id
          ),
          'staff'
        ),
        'recordedAt', command.created_at
      )) as entry
    from builder_publication command
    cross join lateral jsonb_array_elements(coalesce(
      command.request_payload -> 'changeReasons',
      '[]'::jsonb
    )) with ordinality reason(value, ordinality)
    left join active_items active_item
      on active_item.stable_item_key = reason.value ->> 'stableItemKey'
    left join public.course_schedule_change_reasons catalog
      on catalog.reason_code = reason.value ->> 'reasonCode'
    left join public.profiles actor on actor.id = command.actor_user_id
  ),
  structural_entries as (
    select
      change.created_at as occurred_at,
      change.id::text as stable_order,
      jsonb_strip_nulls(jsonb_build_object(
        'entryId', change.id,
        'entryKind', 'structure',
        'action', change.change_type,
        'stableItemKey', change.stable_item_key,
        'sourceSessionKey', active_item.source_session_key,
        'title', coalesce(
          active_item.title,
          change.stable_item_key
        ),
        'reasonCode', reason.reason_code,
        'reasonLabel', reason.label,
        'studentExplanation', change.student_explanation,
        'actorUserId', change.actor_user_id,
        'actorName', coalesce(
          nullif(btrim(actor.full_name), ''),
          actor.email,
          'Staff member'
        ),
        'actorRole', coalesce(
          public.course_progress_actor_role(
            course_record,
            change.actor_user_id
          ),
          'staff'
        ),
        'recordedAt', change.created_at
      )) as entry
    from public.course_schedule_version_changes change
    join public.course_schedule_change_reasons reason
      on reason.id = change.reason_id
    left join active_items active_item
      on active_item.stable_item_key = change.stable_item_key
    left join public.profiles actor on actor.id = change.actor_user_id
    where change.version_id = version_record.id
      and not exists (select 1 from builder_publication)
  ),
  pacing_entries as (
    select
      event.created_at as occurred_at,
      event.id::text as stable_order,
      jsonb_strip_nulls(jsonb_build_object(
        'entryId', event.id,
        'entryKind', 'pacing',
        'action', 'pacing_mode_changed',
        'title', 'Schedule pacing',
        'pacingMode', event.pacing_mode,
        'studentExplanation', event.student_explanation,
        'actorUserId', event.actor_user_id,
        'actorName', coalesce(
          nullif(btrim(actor.full_name), ''),
          actor.email,
          'Staff member'
        ),
        'actorRole', coalesce(
          public.course_progress_actor_role(
            course_record,
            event.actor_user_id
          ),
          'staff'
        ),
        'recordedAt', event.created_at
      )) as entry
    from public.course_schedule_pacing_policy_events event
    left join public.profiles actor on actor.id = event.actor_user_id
    where event.version_id = version_record.id
      and event.event_kind in ('builder_selected', 'mode_changed')
      and event.student_explanation is not null
  ),
  entries as (
    select * from progress_entries
    union all
    select * from builder_entries
    union all
    select * from structural_entries
    union all
    select * from pacing_entries
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course_record.id,
    'activeScheduleVersionId', version_record.id,
    'scheduleVersionNumber', version_record.version_number,
    'scheduleName', version_record.name,
    'timeZone', version_record.time_zone,
    'permissions', jsonb_build_object(
      'actorRole', actor_role,
      'canReadCurrentScheduleLog', true,
      'canReadPrivateStaffNotes', false
    ),
    'summary', jsonb_build_object(
      'entryCount', (select count(*)::integer from entries),
      'staffExplanationCount', (
        select count(*)::integer
        from entries item
        where nullif(item.entry ->> 'studentExplanation', '') is not null
      )
    ),
    'entries', coalesce((
      select jsonb_agg(
        item.entry
        order by item.occurred_at desc, item.stable_order desc
      )
      from entries item
    ), '[]'::jsonb),
    'logPolicy', jsonb_build_object(
      'activeScheduleOnly', true,
      'retainedStableItemProgressIncluded', true,
      'privateStaffNotesExcluded', true,
      'appendOnlySources', true
    )
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.get_my_current_course_schedule_log(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_current_course_schedule_log(uuid)
to authenticated;
grant execute on function public.get_my_current_course_schedule_log(uuid)
to service_role;

comment on function public.get_my_current_course_schedule_log(uuid) is
  'Returns the active Schedule public change log to its Student and authorized Course staff. It combines retained-item progress, active-Version structural reasons, and public pacing reasons without exposing private staff notes.';

comment on function public.insert_course_progress_notifications(
  public.course_progress_events
) is
  'Creates durable recipient-scoped Studied notification facts whose payload includes the target title and Student-visible staff explanation.';
