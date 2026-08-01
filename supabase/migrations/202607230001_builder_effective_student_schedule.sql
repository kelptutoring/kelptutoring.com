-- Phase 5.E.4: governed Schedule Builder publication and one effective
-- Student-facing Course Schedule projection.

create or replace function public.get_my_course_schedule_builder_context(
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
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to edit a Course Schedule.';
  end if;
  if not public.current_user_can_edit_course_schedule(p_course_id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can edit this Course Schedule.';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'startDate', course.start_date,
      'scheduledEndDate', course.scheduled_end_date,
      'subject', jsonb_build_object(
        'id', subject.id,
        'name', subject.name,
        'slug', subject.slug
      ),
      'focus', jsonb_build_object(
        'id', focus.id,
        'name', focus.name,
        'slug', focus.slug
      )
    ),
    'schedule', jsonb_build_object(
      'id', schedule.id,
      'activeVersionId', version.id,
      'versionNumber', version.version_number,
      'name', version.name,
      'timeZone', version.time_zone,
      'cadence', version.cadence,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'scheduleItemId', item.id,
          'stableItemKey', item.stable_item_key,
          'title', item.title,
          'kind', item.item_kind,
          'curriculumNodeId', item.curriculum_node_id,
          'scheduledDate', item.scheduled_date,
          'endDate', item.end_date,
          'position', item.position,
          'state', item.item_state,
          'sourceSnapshot', item.source_snapshot
        ) order by item.position, item.id)
        from public.course_schedule_items item
        where item.version_id = version.id
      ), '[]'::jsonb)
    ),
    'permissions', jsonb_build_object(
      'canPublish', true,
      'requiresExpectedVersion', true
    )
  ) into payload
  from public.student_courses course
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions version
    on version.id = course.active_schedule_version_id
  where course.id = p_course_id;

  if payload is null then
    raise exception 'The required Course Schedule Builder context could not be found.';
  end if;
  return payload;
end;
$$;

create or replace function public.publish_course_builder_schedule(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_builder_schedule jsonb,
  p_items jsonb,
  p_change_reasons jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_record public.student_courses%rowtype;
  subject_record public.curriculum_nodes%rowtype;
  focus_record public.curriculum_nodes%rowtype;
  subject_slug text;
  track_slugs jsonb;
  track_slug text;
begin
  if caller_id is null then
    raise exception 'Authentication is required to publish a generated Course Schedule.';
  end if;
  if not public.current_user_can_edit_course_schedule(p_course_id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can publish this generated Course Schedule.';
  end if;
  if p_builder_schedule is null or jsonb_typeof(p_builder_schedule) <> 'object' then
    raise exception 'A generated Schedule source document is required.';
  end if;
  if btrim(coalesce(p_builder_schedule ->> 'id', '')) = ''
    or btrim(coalesce(p_builder_schedule ->> 'name', '')) = ''
    or btrim(coalesce(p_builder_schedule ->> 'timeZone', '')) = '' then
    raise exception 'The generated Schedule source identity is incomplete.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then raise exception 'The Course could not be found.'; end if;
  select * into subject_record from public.curriculum_nodes where id = course_record.subject_node_id;
  select * into focus_record from public.curriculum_nodes where id = course_record.focus_node_id;

  subject_slug := btrim(coalesce(
    p_builder_schedule #>> '{context,subjectTaxonomySlug}',
    ''
  ));
  track_slugs := coalesce(
    p_builder_schedule #> '{context,trackTaxonomySlugs}',
    '[]'::jsonb
  );
  if subject_slug <> subject_record.slug then
    raise exception 'The generated Schedule Subject does not match this Course.';
  end if;
  if jsonb_typeof(track_slugs) <> 'array' or jsonb_array_length(track_slugs) = 0 then
    raise exception 'The generated Schedule requires at least one Track taxonomy identity.';
  end if;

  for track_slug in select value from jsonb_array_elements_text(track_slugs)
  loop
    if not exists (
      select 1
      from public.curriculum_nodes source_scope
      where source_scope.slug = track_slug
        and source_scope.status = 'active'
        and public.curriculum_node_is_within(source_scope.id, subject_record.id)
        and (
          public.curriculum_node_is_within(focus_record.id, source_scope.id)
          or public.curriculum_node_is_within(source_scope.id, focus_record.id)
        )
    ) then
      raise exception 'A selected Builder Track does not belong to this Course focus.';
    end if;
  end loop;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The generated Course Schedule item list is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where coalesce(item ->> 'kind', 'curriculum_topic') = 'curriculum_topic'
      and (
        nullif(btrim(coalesce(item ->> 'sourceTrackKey', '')), '') is null
        or nullif(btrim(coalesce(item ->> 'sourceModuleKey', '')), '') is null
        or nullif(btrim(coalesce(
          item ->> 'sourceSessionKey',
          item ->> 'sourceSessionId',
          ''
        )), '') is null
        or nullif(btrim(coalesce(item ->> 'sourceContentVersionKey', '')), '') is null
        or btrim(coalesce(item ->> 'sourceSubjectSlug', '')) <> subject_record.slug
        or not (track_slugs ? btrim(coalesce(item ->> 'sourceTrackSlug', '')))
        or nullif(item ->> 'curriculumNodeId', '')::uuid
          is distinct from course_record.focus_node_id
        or (
          item ? 'resources'
          and jsonb_typeof(item -> 'resources') <> 'array'
        )
      )
  ) then
    raise exception 'A generated Curriculum Session has invalid Course or Track source identity.';
  end if;

  return public.publish_course_schedule_version(
    p_course_id,
    p_expected_version_id,
    p_items,
    p_change_reasons,
    p_idempotency_key
  ) || jsonb_build_object(
    'builderScheduleId', p_builder_schedule ->> 'id',
    'builderSchemaVersion', greatest(
      coalesce((p_builder_schedule ->> 'schemaVersion')::integer, 1),
      1
    )
  );
exception when invalid_text_representation then
  raise exception 'The generated Curriculum Session contains an invalid Course taxonomy identity.';
end;
$$;

create or replace function public.get_my_effective_course_schedule(
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
  actor_role text;
  staff_history boolean;
  next_item_key text;
  items jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open the effective Course Schedule.';
  end if;
  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then raise exception 'The Course does not exist.'; end if;

  actor_role := public.course_progress_actor_role(course_record, caller_id);
  staff_history := public.current_user_can_read_course_schedule_history(p_course_id);
  if actor_role is null and not staff_history then
    raise exception 'The effective Course Schedule is private to the Student and assigned academic staff.';
  end if;
  select * into active_version
  from public.course_schedule_versions
  where id = course_record.active_schedule_version_id;
  if not found then raise exception 'The active Course Schedule Version does not exist.'; end if;

  select item.stable_item_key into next_item_key
  from public.course_schedule_items item
  where item.version_id = active_version.id
    and item.item_kind = 'curriculum_topic'
    and item.item_state in ('scheduled', 'requeued')
    and not coalesce((
      public.course_session_studied_aggregation(course_record.id, item.id)
      ->> 'marked'
    )::boolean, false)
  order by item.position, item.id
  limit 1;

  with projected as (
    select
      item.*,
      case when item.item_kind = 'curriculum_topic'
        then public.course_session_progress_aggregation(
          course_record.id,
          item.id,
          staff_history
        )
        else null
      end as progress
    from public.course_schedule_items item
    where item.version_id = active_version.id
      and item.item_state in ('scheduled', 'requeued')
  ),
  sequenced as (
    select
      projected.*,
      coalesce((projected.progress #>> '{studied,marked}')::boolean, false) as studied,
      nullif(projected.progress #>> '{studied,effectiveAt}', '')::timestamptz as studied_at
    from projected
  ),
  effective as (
    select
      sequenced.*,
      row_number() over (
        order by
          case when sequenced.item_kind = 'curriculum_topic' and sequenced.studied
            then 0 else 1 end,
          case when sequenced.item_kind = 'curriculum_topic' and sequenced.studied
            then sequenced.studied_at else null end,
          sequenced.position,
          sequenced.id
      ) - 1 as effective_position
    from sequenced
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'scheduleItemId', effective.id,
    'stableItemKey', effective.stable_item_key,
    'title', effective.title,
    'kind', effective.item_kind,
    'state', effective.item_state,
    'plannedPosition', effective.position,
    'effectivePosition', effective.effective_position,
    'plannedDate', effective.scheduled_date,
    'effectiveDate', case
      when effective.item_kind = 'curriculum_topic' and effective.studied
        then (effective.studied_at at time zone active_version.time_zone)::date
      else effective.scheduled_date
    end,
    'effectiveTimestamp', effective.studied_at,
    'sequenceState', case
      when effective.item_kind = 'curriculum_topic' and effective.studied then 'studied'
      when effective.item_kind = 'curriculum_topic'
        and effective.stable_item_key = next_item_key then 'next'
      else 'upcoming'
    end,
    'difficultyLevel', effective.difficulty_level,
    'planningHref', effective.planning_href,
    'source', jsonb_build_object(
      'trackKey', effective.source_track_key,
      'moduleKey', effective.source_module_key,
      'sessionKey', effective.source_session_key,
      'contentVersionKey', effective.source_content_version_key
    ),
    'progress', coalesce(effective.progress - 'resources', '{}'::jsonb),
    'resourceSummary', case when effective.item_kind = 'curriculum_topic' then jsonb_build_object(
      'assignedCount', coalesce(jsonb_array_length(effective.progress -> 'resources'), 0),
      'requiredCount', coalesce((
        select count(*) from jsonb_array_elements(effective.progress -> 'resources') resource
        where resource ->> 'requirementState' = 'required'
      ), 0),
      'studiedCount', coalesce((
        select count(*) from jsonb_array_elements(effective.progress -> 'resources') resource
        where resource #>> '{studied,state}' = 'marked'
      ), 0)
    ) else jsonb_build_object(
      'assignedCount', 0,
      'requiredCount', 0,
      'studiedCount', 0
    ) end,
    'resources', case when effective.item_kind = 'curriculum_topic' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', resource.id,
        'stableResourceKey', resource.stable_resource_key,
        'providerKey', resource.provider_key,
        'title', resource.title,
        'resourceKind', resource.resource_kind,
        'href', resource.href,
        'requirementState', resource.requirement_state,
        'position', resource.position,
        'progress', (
          select state
          from jsonb_array_elements(effective.progress -> 'resources') state
          where state ->> 'resourceId' = resource.id::text
        )
      ) order by resource.position, resource.id)
      from public.course_schedule_item_resources resource
      where resource.schedule_item_id = effective.id
        and (
          staff_history
          or resource.requirement_state in ('required', 'optional')
        )
    ), '[]'::jsonb) else '[]'::jsonb end
  ) order by effective.effective_position, effective.id), '[]'::jsonb)
  into items
  from effective;

  return jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course_record.id,
    'courseStatus', course_record.status,
    'activeScheduleVersionId', active_version.id,
    'versionNumber', active_version.version_number,
    'name', active_version.name,
    'timeZone', active_version.time_zone,
    'serviceModel', course_record.service_model,
    'permissions', jsonb_build_object(
      'actorRole', actor_role,
      'canMarkSession', actor_role in ('student', 'tutor', 'mentor'),
      'canMarkResource', actor_role = 'student',
      'canReverseStudied', actor_role in ('tutor', 'mentor'),
      'canReverseOwnReviewedPracticed', actor_role = 'student',
      'canReadPrivateStaffNotes', staff_history
    ),
    'items', items,
    'featureStatus', jsonb_build_object(
      'builderPublication', 'active_phase_5e4',
      'effectiveSchedule', 'active_phase_5e4',
      'academicSlots', 'planned_phase_5f'
    )
  );
end;
$$;

revoke all on function public.get_my_course_schedule_builder_context(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_course_schedule_builder_context(uuid)
  to authenticated;
grant execute on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) to authenticated;
grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated;

grant execute on function public.get_my_course_schedule_builder_context(uuid)
  to service_role;
grant execute on function public.get_my_effective_course_schedule(uuid)
  to service_role;

comment on function public.get_my_course_schedule_builder_context(uuid) is
  'Phase 5.E.4 Tutor/Mentor context for opening the existing Schedule Builder against one authoritative Course.';
comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Phase 5.E.4 governed Builder adapter. It validates Course/Subject/Track source identity before delegating immutable publication to the Phase 5.D command.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Phase 5.E.4 compact Student/Tutor/Mentor Schedule. Completed Curriculum Sessions use their authoritative completion timestamp; untouched work retains the active structural plan until academic-slot mapping in Phase 5.F.';
