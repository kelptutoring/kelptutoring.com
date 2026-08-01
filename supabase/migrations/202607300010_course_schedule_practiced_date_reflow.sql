-- Phase 5.G.2.4.7.3.1: cadence-correct continuation for Practiced work.
--
-- Practiced progress keeps the curriculum item in an ordinary successor and
-- continues to make its Track "started", but Practice does not consume a
-- lesson opportunity. A future Practiced item may therefore move to the
-- selected cadence. Studied and delivered items remain exact structural
-- locks, while the structural publisher continues to protect past items.

begin;

create or replace function public.course_schedule_item_has_locked_structure(
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

revoke all on function public.course_schedule_item_has_locked_structure(
  uuid, uuid
) from public, anon, authenticated;

comment on function public.course_schedule_item_has_locked_structure(
  uuid, uuid
) is
  'Internal continuation guard. Studied or a latest delivered Class locks exact item structure; Practiced progress retains the item but may follow a changed future cadence.';

do $govern_practiced_date_reflow$
declare
  original_definition text;
  patched_definition text;
  original_guard constant text := $publisher_guard$  if transition_kind <> 'complete_replacement'
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

$publisher_guard$;
  governed_guard constant text := $publisher_guard$  if transition_kind <> 'complete_replacement'
    and exists (
      select 1
      from public.course_schedule_items prior_item
      where prior_item.version_id = p_expected_version_id
        and prior_item.item_kind = 'curriculum_topic'
        and prior_item.item_state in ('scheduled', 'requeued')
        and public.course_schedule_item_has_locked_structure(
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
      'A Studied or delivered Schedule item is immutable in continuing Versions. Start a new Schedule instead.';
  end if;

  if transition_kind <> 'complete_replacement'
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
        and not public.course_schedule_item_has_locked_structure(
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
        )
    ) then
    raise exception
      'A Practiced Schedule item must remain in a continuing Version. Start a new Schedule instead.';
  end if;

$publisher_guard$;
begin
  select pg_get_functiondef(
    'public.publish_course_builder_schedule_phase5g2_4_7_2_base(uuid,uuid,jsonb,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(original_guard in original_definition) = 0 then
    raise exception
      'The started-item continuation guard no longer matches its expected definition.';
  end if;
  patched_definition := replace(
    original_definition,
    original_guard,
    governed_guard
  );
  if patched_definition = original_definition
    or position(governed_guard in patched_definition) = 0 then
    raise exception
      'Practiced Schedule-item date reflow could not be governed.';
  end if;
  execute patched_definition;
end;
$govern_practiced_date_reflow$;

comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes one governed immutable successor. Continuing Versions retain Practiced items while allowing their future dates to follow cadence; Studied, delivered, and past structure stays protected.';

commit;
