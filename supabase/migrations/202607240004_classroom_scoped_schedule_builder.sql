-- Phase 5.F.5 follow-up: Classroom-launched Schedule Builder sessions are
-- locked to the Course focus. The Builder context also identifies Studied
-- items so the client can retain their exact immutable successor snapshots
-- while replacing only eligible future work.

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
    'schemaVersion', 2,
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
          'isStudied', case
            when item.item_kind = 'curriculum_topic' then coalesce((
              public.course_session_studied_aggregation(course.id, item.id)
              ->> 'marked'
            )::boolean, false)
            else false
          end,
          'sourceSnapshot', item.source_snapshot
        ) order by item.position, item.id)
        from public.course_schedule_items item
        where item.version_id = version.id
      ), '[]'::jsonb)
    ),
    'permissions', jsonb_build_object(
      'canPublish', true,
      'requiresExpectedVersion', true,
      'courseScopeLocked', true
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

alter function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
)
rename to publish_course_builder_schedule_phase5e4;

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
  focus_slug text;
  track_slugs jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to publish a generated Course Schedule.';
  end if;
  if not public.current_user_can_edit_course_schedule(p_course_id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can publish this generated Course Schedule.';
  end if;

  select focus.slug into focus_slug
  from public.student_courses course
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  where course.id = p_course_id;
  if focus_slug is null then
    raise exception 'The Course focus could not be found.';
  end if;

  track_slugs := coalesce(
    p_builder_schedule #> '{context,trackTaxonomySlugs}',
    '[]'::jsonb
  );
  if jsonb_typeof(track_slugs) <> 'array'
    or jsonb_array_length(track_slugs) <> 1
    or btrim(coalesce(track_slugs ->> 0, '')) <> focus_slug then
    raise exception 'A Classroom Schedule must use exactly its Course content.';
  end if;

  return public.publish_course_builder_schedule_phase5e4(
    p_course_id,
    p_expected_version_id,
    p_builder_schedule,
    p_items,
    p_change_reasons,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.get_my_course_schedule_builder_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_course_schedule_builder_context(uuid)
to authenticated;

revoke all on function public.publish_course_builder_schedule_phase5e4(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) to authenticated;

comment on function public.get_my_course_schedule_builder_context(uuid) is
  'Returns the assigned Tutor/Mentor Classroom Builder context, including exact Studied locks for safe successor publication.';
comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes one Classroom-scoped Course Schedule using exactly the Course focus; standalone multi-content Builder documents remain outside this command.';
