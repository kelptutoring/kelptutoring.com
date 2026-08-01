-- Retain worked Sessions even when their current catalog page disappears, and
-- preserve the Session/resource hierarchy in immutable Course History.

create or replace function public.course_historical_progress_transition(
  p_course_id uuid,
  p_source_session_key text,
  p_stable_resource_key text,
  p_progress_kind text
)
returns public.course_progress_events
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select event
  from public.course_progress_events event
  join public.course_schedule_items item
    on item.id = event.schedule_item_id
   and item.version_id = event.schedule_version_id
  where event.course_id = p_course_id
    and coalesce(
      nullif(event.target_snapshot ->> 'sourceSessionKey', ''),
      nullif(item.source_session_key, ''),
      nullif(item.source_snapshot ->> 'sourceSessionKey', ''),
      nullif(item.source_snapshot ->> 'sourceSessionId', '')
    ) = p_source_session_key
    and event.stable_resource_key is not distinct from p_stable_resource_key
    and event.progress_kind = lower(btrim(p_progress_kind))
    and event.event_action in ('marked', 'reversed')
  order by event.recorded_at desc, event.id desc
  limit 1;
$$;

create or replace function public.course_historical_session_progress(
  p_course_id uuid,
  p_source_session_key text,
  p_schedule_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  item_record public.course_schedule_items%rowtype;
  direct_studied public.course_progress_events%rowtype;
  direct_reviewed public.course_progress_events%rowtype;
  direct_practiced public.course_progress_events%rowtype;
  required_count integer := 0;
  studied_required_count integer := 0;
  practiced_required_count integer := 0;
  studied_required_at timestamptz;
  practiced_required_at timestamptz;
  first_worked_at timestamptz;
  last_worked_at timestamptz;
  resources jsonb := '[]'::jsonb;
begin
  select item.* into item_record
  from public.course_schedule_items item
  join public.course_schedule_versions version on version.id = item.version_id
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where item.id = p_schedule_item_id
    and schedule.course_id = p_course_id
    and item.item_kind = 'curriculum_topic';
  if not found then
    raise exception 'The historical Curriculum Session could not be projected.';
  end if;

  direct_studied := public.course_historical_progress_transition(
    p_course_id, p_source_session_key, null, 'studied'
  );
  direct_reviewed := public.course_historical_progress_transition(
    p_course_id, p_source_session_key, null, 'reviewed'
  );
  direct_practiced := public.course_historical_progress_transition(
    p_course_id, p_source_session_key, null, 'practiced'
  );

  select
    count(*) filter (where resource.requirement_state = 'required'),
    count(*) filter (
      where resource.requirement_state = 'required'
        and studied.event_action = 'marked'
    ),
    count(*) filter (
      where resource.requirement_state = 'required'
        and practiced.event_action = 'marked'
    ),
    max(studied.effective_at) filter (
      where resource.requirement_state = 'required'
        and studied.event_action = 'marked'
    ),
    max(practiced.effective_at) filter (
      where resource.requirement_state = 'required'
        and practiced.event_action = 'marked'
    ),
    coalesce(jsonb_agg(jsonb_build_object(
      'stableResourceKey', resource.stable_resource_key,
      'title', resource.title,
      'requirementState', resource.requirement_state,
      'position', resource.position,
      'progress', jsonb_build_object(
        'studied', studied.event_action = 'marked'
          or (
            resource.requirement_state in ('required', 'optional')
            and direct_studied.event_action = 'marked'
          ),
        'reviewed', reviewed.event_action = 'marked',
        'practiced', practiced.event_action = 'marked'
          or (
            resource.requirement_state in ('required', 'optional')
            and direct_practiced.event_action = 'marked'
          )
      )
    ) order by resource.position, resource.id) filter (
      where resource.id is not null
    ), '[]'::jsonb)
  into
    required_count,
    studied_required_count,
    practiced_required_count,
    studied_required_at,
    practiced_required_at,
    resources
  from public.course_schedule_item_resources resource
  left join lateral public.course_historical_progress_transition(
    p_course_id,
    p_source_session_key,
    resource.stable_resource_key,
    'studied'
  ) studied on true
  left join lateral public.course_historical_progress_transition(
    p_course_id,
    p_source_session_key,
    resource.stable_resource_key,
    'reviewed'
  ) reviewed on true
  left join lateral public.course_historical_progress_transition(
    p_course_id,
    p_source_session_key,
    resource.stable_resource_key,
    'practiced'
  ) practiced on true
  where resource.schedule_item_id = item_record.id
    and resource.requirement_state in ('required', 'optional');

  with event_sources as (
    select
      event.*,
      coalesce(
        nullif(event.target_snapshot ->> 'sourceSessionKey', ''),
        nullif(item.source_session_key, ''),
        nullif(item.source_snapshot ->> 'sourceSessionKey', ''),
        nullif(item.source_snapshot ->> 'sourceSessionId', '')
      ) as source_session_key
    from public.course_progress_events event
    join public.course_schedule_items item
      on item.id = event.schedule_item_id
     and item.version_id = event.schedule_version_id
    where event.course_id = p_course_id
  ),
  latest_states as (
    select distinct on (
      coalesce(event.stable_resource_key, ''),
      event.progress_kind
    )
      event.*
    from event_sources event
    where event.source_session_key = p_source_session_key
      and event.event_action in ('marked', 'reversed')
    order by
      coalesce(event.stable_resource_key, ''),
      event.progress_kind,
      event.recorded_at desc,
      event.id desc
  )
  select
    min(state.effective_at) filter (where state.event_action = 'marked'),
    max(state.effective_at) filter (where state.event_action = 'marked')
  into first_worked_at, last_worked_at
  from latest_states state;

  return jsonb_build_object(
    'firstWorkedAt', first_worked_at,
    'lastWorkedAt', last_worked_at,
    'progress', jsonb_build_object(
      'studied',
        direct_studied.event_action = 'marked'
        or (
          required_count > 0
          and studied_required_count = required_count
        ),
      'reviewed', direct_reviewed.event_action = 'marked',
      'practiced',
        direct_practiced.event_action = 'marked'
        or (
          required_count > 0
          and practiced_required_count = required_count
        )
    ),
    'derived', jsonb_build_object(
      'requiredResourceCount', required_count,
      'studiedRequiredResourceCount', studied_required_count,
      'practicedRequiredResourceCount', practiced_required_count,
      'studiedRequiredAt', studied_required_at,
      'practicedRequiredAt', practiced_required_at
    ),
    'resources', resources
  );
end;
$$;

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
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  actor_role text;
  staff_history boolean;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open Course learning history.';
  end if;

  select course.* into course_record
  from public.student_courses course
  where course.id = p_course_id;
  if not found then
    raise exception 'The Course could not be found.';
  end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  staff_history := public.current_user_can_read_course_schedule_history(p_course_id);
  if actor_role is null and not staff_history then
    raise exception
      'Course learning history is private to the Student and assigned academic staff.';
  end if;
  if course_record.active_schedule_version_id is null then
    raise exception 'The Course has no active Schedule Version.';
  end if;

  with
  active_session_keys as (
    select distinct coalesce(
      nullif(item.source_session_key, ''),
      nullif(item.source_snapshot ->> 'sourceSessionKey', ''),
      nullif(item.source_snapshot ->> 'sourceSessionId', '')
    ) as source_session_key
    from public.course_schedule_items item
    where item.version_id = course_record.active_schedule_version_id
  ),
  event_sources as (
    select
      event.*,
      coalesce(
        nullif(event.target_snapshot ->> 'sourceSessionKey', ''),
        nullif(item.source_session_key, ''),
        nullif(item.source_snapshot ->> 'sourceSessionKey', ''),
        nullif(item.source_snapshot ->> 'sourceSessionId', '')
      ) as source_session_key,
      item.item_state
    from public.course_progress_events event
    join public.course_schedule_items item
      on item.id = event.schedule_item_id
     and item.version_id = event.schedule_version_id
    where event.course_id = course_record.id
      and event.progress_kind in ('studied', 'reviewed', 'practiced')
      and event.event_action in ('marked', 'reversed')
  ),
  latest_target_states as (
    select distinct on (
      event.source_session_key,
      coalesce(event.stable_resource_key, ''),
      event.progress_kind
    )
      event.*
    from event_sources event
    where event.source_session_key is not null
    order by
      event.source_session_key,
      coalesce(event.stable_resource_key, ''),
      event.progress_kind,
      event.recorded_at desc,
      event.id desc
  ),
  marked_historical_states as (
    select state.*
    from latest_target_states state
    where state.event_action = 'marked'
      and state.item_state <> 'dropped'
      and not exists (
        select 1
        from active_session_keys active_item
        where active_item.source_session_key = state.source_session_key
      )
  ),
  canonical_state as (
    select distinct on (state.source_session_key)
      state.*
    from marked_historical_states state
    order by
      state.source_session_key,
      state.recorded_at desc,
      state.id desc
  ),
  historical_items as (
    select
      state.stable_item_key,
      state.schedule_version_id,
      version.version_number,
      version.name as version_name,
      version.time_zone,
      version.created_at as version_created_at,
      coverage.display_label as coverage_label,
      coalesce(
        nullif(state.target_snapshot ->> 'title', ''),
        item.title
      ) as title,
      item.scheduled_date,
      progress ->> 'firstWorkedAt' as first_worked_at,
      progress ->> 'lastWorkedAt' as last_worked_at,
      coalesce((progress #>> '{progress,studied}')::boolean, false) as studied,
      coalesce((progress #>> '{progress,reviewed}')::boolean, false) as reviewed,
      coalesce((progress #>> '{progress,practiced}')::boolean, false) as practiced,
      progress -> 'resources' as resources,
      state.source_session_key,
      coalesce(
        nullif(state.target_snapshot ->> 'sourceTrackKey', ''),
        nullif(item.source_track_key, ''),
        nullif(item.source_snapshot ->> 'sourceTrackKey', '')
      ) as source_track_key,
      coalesce(
        nullif(state.target_snapshot ->> 'sourceModuleKey', ''),
        nullif(item.source_module_key, ''),
        nullif(item.source_snapshot ->> 'sourceModuleKey', '')
      ) as source_module_key,
      nullif(item.source_snapshot ->> 'sourceModuleTitle', '')
        as source_module_title,
      nullif(item.source_snapshot ->> 'sourceTrackSlug', '')
        as source_track_slug
    from canonical_state state
    join public.course_schedule_items item
      on item.id = state.schedule_item_id
     and item.version_id = state.schedule_version_id
    join public.course_schedule_versions version
      on version.id = state.schedule_version_id
    left join public.course_schedule_version_coverages coverage
      on coverage.version_id = state.schedule_version_id
    cross join lateral public.course_historical_session_progress(
      course_record.id,
      state.source_session_key,
      state.schedule_item_id
    ) progress
  ),
  version_groups as (
    select
      item.schedule_version_id,
      item.version_number,
      item.version_name,
      item.time_zone,
      item.version_created_at,
      item.coverage_label,
      max(item.last_worked_at::timestamptz) as last_worked_at,
      count(*)::integer as worked_session_count,
      count(*) filter (where item.studied)::integer as studied_count,
      count(*) filter (where item.reviewed)::integer as reviewed_count,
      count(*) filter (where item.practiced)::integer as practiced_count,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'stableItemKey', item.stable_item_key,
        'title', item.title,
        'scheduledDate', item.scheduled_date,
        'firstWorkedAt', item.first_worked_at,
        'lastWorkedAt', item.last_worked_at,
        'sourceSessionKey', item.source_session_key,
        'sourceTrackKey', item.source_track_key,
        'sourceTrackSlug', item.source_track_slug,
        'sourceModuleKey', item.source_module_key,
        'sourceModuleTitle', item.source_module_title,
        'progress', jsonb_build_object(
          'studied', item.studied,
          'reviewed', item.reviewed,
          'practiced', item.practiced
        ),
        'resources', item.resources
      )) order by item.last_worked_at::timestamptz desc, item.title, item.stable_item_key)
        as items
    from historical_items item
    group by
      item.schedule_version_id,
      item.version_number,
      item.version_name,
      item.time_zone,
      item.version_created_at,
      item.coverage_label
  )
  select jsonb_build_object(
    'schemaVersion', 2,
    'courseId', course_record.id,
    'activeScheduleVersionId', course_record.active_schedule_version_id,
    'permissions', jsonb_build_object(
      'actorRole', coalesce(actor_role, 'staff'),
      'canReadLearningHistory', true,
      'canReadPrivateStaffNotes', false
    ),
    'summary', jsonb_build_object(
      'workedSessionCount', (select count(*)::integer from historical_items),
      'studiedCount', (
        select count(*)::integer from historical_items item where item.studied
      ),
      'reviewedCount', (
        select count(*)::integer from historical_items item where item.reviewed
      ),
      'practicedCount', (
        select count(*)::integer from historical_items item where item.practiced
      ),
      'scheduleVersionCount', (select count(*)::integer from version_groups)
    ),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scheduleVersionId', version.schedule_version_id,
        'versionNumber', version.version_number,
        'name', version.version_name,
        'timeZone', version.time_zone,
        'createdAt', version.version_created_at,
        'coverageLabel', version.coverage_label,
        'lastWorkedAt', version.last_worked_at,
        'workedSessionCount', version.worked_session_count,
        'studiedCount', version.studied_count,
        'reviewedCount', version.reviewed_count,
        'practicedCount', version.practiced_count,
        'items', version.items
      ) order by
        version.last_worked_at desc,
        version.version_number desc,
        version.schedule_version_id
      )
      from version_groups version
    ), '[]'::jsonb),
    'historyPolicy', jsonb_build_object(
      'activeScheduleProgressExcluded', true,
      'droppedItemsExcluded', true,
      'unavailableSourcesRetained', true,
      'resourceProgressRetained', true
    ),
    'featureStatus', jsonb_build_object(
      'courseLearningHistory', 'active_phase_5g2_4_5_5'
    )
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.course_historical_progress_transition(
  uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.course_historical_session_progress(
  uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.get_my_course_learning_history(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_course_learning_history(uuid)
  to authenticated;
grant execute on function public.get_my_course_learning_history(uuid)
  to service_role;

comment on function public.course_historical_session_progress(uuid, text, uuid) is
  'Internal immutable Session/resource progress projection for a superseded Schedule source identity.';
comment on function public.get_my_course_learning_history(uuid) is
  'Returns worked Sessions absent from the active Schedule, including retained resource progress and current-catalog availability-independent source identity.';
