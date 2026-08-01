-- Phase 5.G.2.4.3.2: preload the governed Classroom Builder from the exact
-- active Schedule Version without enabling multi-branch publication yet.

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
    'schemaVersion', 3,
    'course', jsonb_build_object(
      'id', course.id,
      'classroomId', classroom.id,
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
      'coverage', jsonb_build_object(
        'schemaVersion', coverage.schema_version,
        'primaryTrackKey', coverage.primary_track_key,
        'displayLabel', coverage.display_label,
        'provenance', coverage.provenance,
        'snapshot', coverage.coverage_snapshot
      ),
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
            when item.item_kind = 'curriculum_topic'
              and item.item_state in ('scheduled', 'requeued') then coalesce((
                public.course_session_studied_aggregation(course.id, item.id)
                ->> 'marked'
              )::boolean, false)
            else false
          end,
          'isDelivered', exists (
            select 1
            from public.course_schedule_occurrence_outcome_events outcome
            where outcome.schedule_item_id = item.id
              and outcome.resolution_status = 'delivered'
              and not exists (
                select 1
                from public.course_schedule_occurrence_outcome_events successor
                where successor.supersedes_event_id = outcome.id
              )
          ),
          'sourceTrackKey', item.source_track_key,
          'sourceModuleKey', item.source_module_key,
          'sourceSessionKey', item.source_session_key,
          'sourceContentVersionKey', item.source_content_version_key,
          'difficulty', item.difficulty_level,
          'planningHref', item.planning_href,
          'sourceSnapshot', item.source_snapshot
        ) order by item.position, item.id)
        from public.course_schedule_items item
        where item.version_id = version.id
      ), '[]'::jsonb)
    ),
    'permissions', jsonb_build_object(
      'canPublish', true,
      'canDraftMultipleTracks', true,
      'canPublishMultipleTracks', false,
      'requiresExpectedVersion', true,
      'requiresQualificationValidation', true,
      'courseScopeLocked', true
    )
  ) into payload
  from public.student_courses course
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions version
    on version.id = course.active_schedule_version_id
  join public.course_schedule_version_coverages coverage
    on coverage.version_id = version.id
  left join public.classrooms classroom on classroom.course_id = course.id
  where course.id = p_course_id;

  if payload is null then
    raise exception 'The required Course Schedule Builder context could not be found.';
  end if;
  return payload;
end;
$$;

revoke all on function public.get_my_course_schedule_builder_context(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_course_schedule_builder_context(uuid)
to authenticated;

comment on function public.get_my_course_schedule_builder_context(uuid) is
  'Returns the exact active Version coverage, durable Session sources, retained locks, and staged multi-branch permissions for Phase 5.G.2.4.3.2 Classroom Builder preloading and stale-draft recovery.';
