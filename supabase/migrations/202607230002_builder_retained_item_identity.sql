-- Phase 5.E.4 repair: a retained Schedule item must preserve the Curriculum
-- identity recorded in the expected immutable Version. Builder-created items
-- must use the Course focus. This keeps legacy NULL identity intact without
-- weakening the Phase 5.D identity guard.

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
        or (
          exists (
            select 1
            from public.course_schedule_items prior_item
            where prior_item.version_id = p_expected_version_id
              and prior_item.stable_item_key = btrim(item ->> 'stableItemKey')
          )
          and nullif(item ->> 'curriculumNodeId', '')::uuid is distinct from (
            select prior_item.curriculum_node_id
            from public.course_schedule_items prior_item
            where prior_item.version_id = p_expected_version_id
              and prior_item.stable_item_key = btrim(item ->> 'stableItemKey')
          )
        )
        or (
          not exists (
            select 1
            from public.course_schedule_items prior_item
            where prior_item.version_id = p_expected_version_id
              and prior_item.stable_item_key = btrim(item ->> 'stableItemKey')
          )
          and nullif(item ->> 'curriculumNodeId', '')::uuid
            is distinct from course_record.focus_node_id
        )
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

comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Phase 5.E.4 governed Builder adapter. Retained items preserve their expected-Version Curriculum identity; new Track items must use the Course focus before immutable publication.';
