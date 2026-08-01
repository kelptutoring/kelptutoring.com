-- Phase 5.G.2.4.7.3: active-Schedule continuation and replacement guard.
--
-- Studied, Practiced, and delivered work keeps its exact active-Version
-- identity in an ordinary successor. Removing its Track or rewriting the item
-- requires the explicit new-Schedule path, whose prior plan epoch remains in
-- History. Reviewed alone is intentionally not treated as started work.

begin;

create or replace function public.course_schedule_item_has_started_work(
  p_course_id uuid,
  p_schedule_item_id uuid
)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select
    coalesce((
      public.course_session_studied_aggregation(
        p_course_id,
        p_schedule_item_id
      ) ->> 'marked'
    )::boolean, false)
    or coalesce((
      public.course_session_practiced_aggregation(
        p_course_id,
        p_schedule_item_id
      ) ->> 'marked'
    )::boolean, false)
    or exists (
      select 1
      from public.course_schedule_occurrence_outcome_events outcome
      where outcome.course_id = p_course_id
        and outcome.schedule_item_id = p_schedule_item_id
        and outcome.resolution_status = 'delivered'
        and not exists (
          select 1
          from public.course_schedule_occurrence_outcome_events successor
          where successor.supersedes_event_id = outcome.id
        )
    );
$$;

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
      and public.course_schedule_item_has_started_work(
        p_course_id,
        item.id
      )
  );
$$;

revoke all on function public.course_schedule_item_has_started_work(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function public.course_schedule_track_has_worked_progress(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

comment on function public.course_schedule_item_has_started_work(
  uuid, uuid
) is
  'Internal continuation guard. Studied, Practiced, or a latest delivered Class starts a Schedule item; Reviewed alone does not.';

comment on function public.course_schedule_track_has_worked_progress(
  uuid, uuid, uuid, text
) is
  'Internal publication guard. A Track is started by Studied or Practiced progress, including required-resource aggregation, or by a latest delivered Class.';

do $align_started_track_message$
declare
  original_definition text;
  patched_definition text;
  original_message constant text :=
    'A Track with Studied or Practiced work cannot be removed from a continuing Schedule. Start a new Schedule instead.';
  governed_message constant text :=
    'A Track with Studied, Practiced, or delivered work cannot be removed from a continuing Schedule. Start a new Schedule instead.';
begin
  select pg_get_functiondef(
    'public.publish_course_builder_schedule_phase5g2_4_7_2_base(uuid,uuid,jsonb,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(original_message in original_definition) = 0 then
    raise exception
      'The governed Builder started-Track message no longer matches its expected definition.';
  end if;
  patched_definition := replace(
    original_definition,
    original_message,
    governed_message
  );
  execute patched_definition;
end;
$align_started_track_message$;

do $guard_started_items_in_continuing_versions$
declare
  original_definition text;
  patched_definition text;
  original_anchor constant text := $publisher_anchor$  if transition_kind = 'complete_replacement' then
    with replacement_items as ($publisher_anchor$;
  governed_anchor constant text := $publisher_anchor$  if transition_kind <> 'complete_replacement'
    and exists (
      select 1
      from public.course_schedule_items prior_item
      where prior_item.version_id = p_expected_version_id
        and prior_item.item_kind = 'curriculum_topic'
        and prior_item.item_state in ('scheduled', 'requeued')
        and public.course_schedule_item_has_started_work(
          p_course_id,
          prior_item.id
        )
        and not exists (
          select 1
          from jsonb_array_elements(normalized_items) proposed(item)
          where proposed.item ->> 'stableItemKey'
              = prior_item.stable_item_key
            and coalesce(proposed.item ->> 'state', 'scheduled')
              = prior_item.item_state
            and (proposed.item ->> 'scheduledDate')::date
              = prior_item.scheduled_date
            and coalesce(
              nullif(proposed.item ->> 'endDate', '')::date,
              (proposed.item ->> 'scheduledDate')::date
            ) = prior_item.end_date
            and (proposed.item ->> 'position')::integer
              = prior_item.position
        )
    ) then
    raise exception
      'A started Schedule item is immutable in continuing Versions. Start a new Schedule instead.';
  end if;

  if transition_kind = 'complete_replacement' then
    with replacement_items as ($publisher_anchor$;
begin
  select pg_get_functiondef(
    'public.publish_course_builder_schedule_phase5g2_4_7_2_base(uuid,uuid,jsonb,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(original_anchor in original_definition) = 0 then
    raise exception
      'The governed Builder replacement boundary no longer matches its expected definition.';
  end if;
  patched_definition := replace(
    original_definition,
    original_anchor,
    governed_anchor
  );
  if patched_definition = original_definition
    or position(governed_anchor in patched_definition) = 0 then
    raise exception
      'Started Schedule-item continuation could not be governed.';
  end if;
  execute patched_definition;
end;
$guard_started_items_in_continuing_versions$;

comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes one governed immutable successor. Continuing Versions preserve started items exactly; removing a started Track or rewriting started work requires an explicit replacement plan retained in History.';

commit;
