-- A continuing Schedule may replace an untouched Track, but a Track with
-- Studied or Practiced work can leave the active plan only through the
-- explicit new-Schedule path. The old immutable Version remains the authority
-- for its progress and audit history.

begin;

do $add_practiced_state_to_builder_context$
declare
  original_definition text;
  patched_definition text;
  original_anchor constant text := $context_anchor$          'isStudied', case
            when item.item_kind = 'curriculum_topic'
              and item.item_state in ('scheduled', 'requeued') then coalesce((
                public.course_session_studied_aggregation(course.id, item.id)
                ->> 'marked'
              )::boolean, false)
            else false
          end,
          'isDelivered', exists ($context_anchor$;
  governed_anchor constant text := $context_anchor$          'isStudied', case
            when item.item_kind = 'curriculum_topic'
              and item.item_state in ('scheduled', 'requeued') then coalesce((
                public.course_session_studied_aggregation(course.id, item.id)
                ->> 'marked'
              )::boolean, false)
            else false
          end,
          'isPracticed', case
            when item.item_kind = 'curriculum_topic'
              and item.item_state in ('scheduled', 'requeued') then coalesce((
                public.course_session_practiced_aggregation(course.id, item.id)
                ->> 'marked'
              )::boolean, false)
            else false
          end,
          'isDelivered', exists ($context_anchor$;
begin
  select pg_get_functiondef(
    'public.get_my_course_schedule_builder_context(uuid)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(original_anchor in original_definition) = 0 then
    raise exception
      'The governed Builder progress context no longer matches its expected definition.';
  end if;
  patched_definition := replace(
    original_definition,
    original_anchor,
    governed_anchor
  );
  if patched_definition = original_definition
    or position(governed_anchor in patched_definition) = 0 then
    raise exception
      'Practiced progress could not be added to the governed Builder context.';
  end if;
  execute patched_definition;
end;
$add_practiced_state_to_builder_context$;

create or replace function public.course_schedule_track_has_worked_progress(
  p_course_id uuid,
  p_version_id uuid,
  p_track_node_id uuid,
  p_track_slug text
)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.course_schedule_items item
    where item.version_id = p_version_id
      and item.item_kind = 'curriculum_topic'
      and item.item_state in ('scheduled', 'requeued')
      and (
        (
          p_track_node_id is not null
          and item.curriculum_node_id = p_track_node_id
        )
        or (
          nullif(lower(btrim(coalesce(p_track_slug, ''))), '') is not null
          and lower(btrim(coalesce(
            item.source_snapshot ->> 'sourceTrackSlug',
            item.source_snapshot ->> 'trackTaxonomySlug',
            ''
          ))) = lower(btrim(p_track_slug))
        )
      )
      and (
        coalesce((
          public.course_session_studied_aggregation(p_course_id, item.id)
          ->> 'marked'
        )::boolean, false)
        or coalesce((
          public.course_session_practiced_aggregation(p_course_id, item.id)
          ->> 'marked'
        )::boolean, false)
      )
  );
$$;

revoke all on function public.course_schedule_track_has_worked_progress(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

comment on function public.course_schedule_track_has_worked_progress(
  uuid, uuid, uuid, text
) is
  'Internal publication guard. A Track is worked when an active Session is Studied or Practiced, including required-resource-derived Practiced progress.';

do $govern_worked_track_removal$
declare
  original_definition text;
  patched_definition text;
  original_anchor constant text := $publisher_anchor$  if common_track_count = 0 then
    transition_kind := 'complete_replacement';
  elsif old_track_keys is distinct from new_track_keys then
    transition_kind := 'partial_replacement';
  elsif old_coverage.primary_track_key
      <> normalized_coverage ->> 'primaryTrackKey' then
    transition_kind := 'primary_track_changed';
  else
    transition_kind := 'continued';
  end if;

  if transition_kind = 'complete_replacement' then$publisher_anchor$;
  governed_anchor constant text := $publisher_anchor$  if p_builder_schedule #>> '{context,revisionMode}' = 'new_schedule' then
    transition_kind := 'complete_replacement';
  elsif common_track_count = 0 then
    transition_kind := 'complete_replacement';
  elsif old_track_keys is distinct from new_track_keys then
    transition_kind := 'partial_replacement';
  elsif old_coverage.primary_track_key
      <> normalized_coverage ->> 'primaryTrackKey' then
    transition_kind := 'primary_track_changed';
  else
    transition_kind := 'continued';
  end if;

  if transition_kind = 'partial_replacement'
    and exists (
      select 1
      from jsonb_array_elements(old_coverage.coverage_snapshot -> 'branches')
        as old_branch(value)
      where not exists (
        select 1
        from jsonb_array_elements(normalized_coverage -> 'branches')
          as new_branch(value)
        where new_branch.value #>> '{track,nodeId}'
          = old_branch.value #>> '{track,nodeId}'
      )
        and public.course_schedule_track_has_worked_progress(
          p_course_id,
          p_expected_version_id,
          nullif(old_branch.value #>> '{track,nodeId}', '')::uuid,
          old_branch.value #>> '{track,slug}'
        )
    ) then
    raise exception
      'A Track with Studied or Practiced work cannot be removed from a continuing Schedule. Start a new Schedule instead.';
  end if;

  if transition_kind = 'complete_replacement' then$publisher_anchor$;
begin
  select pg_get_functiondef(
    'public.publish_course_builder_schedule(uuid,uuid,jsonb,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(original_anchor in original_definition) = 0 then
    raise exception
      'The governed Builder transition classifier no longer matches its expected definition.';
  end if;
  patched_definition := replace(
    original_definition,
    original_anchor,
    governed_anchor
  );
  if patched_definition = original_definition
    or position(governed_anchor in patched_definition) = 0 then
    raise exception
      'Worked Track removal could not be governed at the publication boundary.';
  end if;
  execute patched_definition;
end;
$govern_worked_track_removal$;

comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes an immutable governed Builder successor. Removing a Studied or Practiced Track requires an explicit new-Schedule transition; continuing revisions may remove only untouched Tracks.';

commit;
