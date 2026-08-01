-- Preserve worked Sessions from superseded Schedule Versions as Student-visible
-- learning history without mixing them into the active Schedule percentage.

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
  staff_history :=
    public.current_user_can_read_course_schedule_history(p_course_id);
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
  session_events as (
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
    where event.course_id = course_record.id
      and event.target_kind = 'session'
      and event.stable_resource_key is null
      and event.progress_kind in ('studied', 'reviewed', 'practiced')
      and event.event_action in ('marked', 'reversed')
  ),
  latest_session_states as (
    select distinct on (
      event.source_session_key,
      event.progress_kind
    )
      event.*
    from session_events event
    where event.source_session_key is not null
    order by
      event.source_session_key,
      event.progress_kind,
      event.recorded_at desc,
      event.id desc
  ),
  marked_historical_states as (
    select state.*
    from latest_session_states state
    join public.course_schedule_items item
      on item.id = state.schedule_item_id
      and item.version_id = state.schedule_version_id
    where state.event_action = 'marked'
      and item.item_state <> 'dropped'
      and not exists (
        select 1
        from active_session_keys active_item
        where active_item.source_session_key = state.source_session_key
      )
  ),
  item_progress as (
    select
      state.source_session_key,
      bool_or(state.progress_kind = 'studied') as studied,
      bool_or(state.progress_kind = 'reviewed') as reviewed,
      bool_or(state.progress_kind = 'practiced') as practiced,
      min(state.effective_at) as first_worked_at,
      max(state.effective_at) as last_worked_at
    from marked_historical_states state
    group by state.source_session_key
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
      progress.first_worked_at,
      progress.last_worked_at,
      progress.studied,
      progress.reviewed,
      progress.practiced,
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
    join item_progress progress
      on progress.source_session_key = state.source_session_key
    join public.course_schedule_items item
      on item.id = state.schedule_item_id
      and item.version_id = state.schedule_version_id
    join public.course_schedule_versions version
      on version.id = state.schedule_version_id
    left join public.course_schedule_version_coverages coverage
      on coverage.version_id = state.schedule_version_id
  ),
  version_groups as (
    select
      item.schedule_version_id,
      item.version_number,
      item.version_name,
      item.time_zone,
      item.version_created_at,
      item.coverage_label,
      max(item.last_worked_at) as last_worked_at,
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
        )
      )) order by item.last_worked_at desc, item.title, item.stable_item_key)
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
    'schemaVersion', 1,
    'courseId', course_record.id,
    'activeScheduleVersionId', course_record.active_schedule_version_id,
    'permissions', jsonb_build_object(
      'actorRole', coalesce(actor_role, 'staff'),
      'canReadLearningHistory', true,
      'canReadPrivateStaffNotes', false
    ),
    'summary', jsonb_build_object(
      'workedSessionCount', (
        select count(*)::integer from historical_items
      ),
      'studiedCount', (
        select count(*)::integer
        from historical_items item
        where item.studied
      ),
      'reviewedCount', (
        select count(*)::integer
        from historical_items item
        where item.reviewed
      ),
      'practicedCount', (
        select count(*)::integer
        from historical_items item
        where item.practiced
      ),
      'scheduleVersionCount', (
        select count(*)::integer from version_groups
      )
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
      'missingSourcesRequireCatalogValidation', true
    ),
    'featureStatus', jsonb_build_object(
      'courseLearningHistory', 'active_phase_5g2_4_5_4'
    )
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.get_my_course_learning_history(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_course_learning_history(uuid)
  to authenticated;
grant execute on function public.get_my_course_learning_history(uuid)
  to service_role;

comment on function public.get_my_course_learning_history(uuid) is
  'Returns current marked Session progress that no longer belongs to the active Schedule, grouped by immutable prior Version. Active, dropped, resource-level, reversed, and source-less rows are excluded.';
