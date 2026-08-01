-- Phase 5.G.2.4.7.3, step 1: distinguish a complete Schedule replacement
-- from an in-place revision and retain immutable Studied-restoration context.
--
-- A replacement may begin on any date from publication day onward. When the
-- former plan had not begun yet, its future activation edge follows the new
-- plan; an elapsed Course start remains historical and immutable. Ordinary
-- successor Versions retain the activated-start invariant. Every Studied mark also
-- captures the plan epoch, Version cadence, and nearest-first predecessor
-- chain that future restoration logic will use without guessing from a newer
-- Schedule Version.

create table if not exists public.course_progress_restoration_provenance (
  progress_event_id uuid primary key
    references public.course_progress_events(id) on delete restrict,
  course_id uuid not null references public.student_courses(id) on delete restrict,
  schedule_version_id uuid not null
    references public.course_schedule_versions(id) on delete restrict,
  stable_item_key text not null,
  plan_epoch_id uuid not null,
  marked_cadence jsonb not null,
  predecessor_stable_item_keys jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint course_progress_restoration_item_key_check check (
    btrim(stable_item_key) <> '' and char_length(stable_item_key) <= 180
  ),
  constraint course_progress_restoration_cadence_check check (
    jsonb_typeof(marked_cadence) = 'object'
  ),
  constraint course_progress_restoration_predecessors_check check (
    jsonb_typeof(predecessor_stable_item_keys) = 'array'
  )
);

create index if not exists course_progress_restoration_course_epoch_idx
on public.course_progress_restoration_provenance (
  course_id, plan_epoch_id, stable_item_key, created_at, progress_event_id
);

create or replace function public.capture_course_progress_restoration_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  marked_item public.course_schedule_items%rowtype;
  marked_version public.course_schedule_versions%rowtype;
  coverage_metadata jsonb := '{}'::jsonb;
  stable_plan_epoch_id uuid;
  predecessor_keys jsonb;
begin
  if new.progress_kind <> 'studied' or new.event_action <> 'marked' then
    return new;
  end if;

  select item.* into strict marked_item
  from public.course_schedule_items item
  where item.id = new.schedule_item_id
    and item.version_id = new.schedule_version_id;

  select version.* into strict marked_version
  from public.course_schedule_versions version
  where version.id = new.schedule_version_id;

  select coalesce(coverage.metadata, '{}'::jsonb)
  into coverage_metadata
  from public.course_schedule_version_coverages coverage
  where coverage.version_id = new.schedule_version_id;

  begin
    stable_plan_epoch_id := nullif(coverage_metadata ->> 'planEpochId', '')::uuid;
  exception when invalid_text_representation then
    stable_plan_epoch_id := null;
  end;
  stable_plan_epoch_id := coalesce(stable_plan_epoch_id, marked_version.schedule_id);

  select coalesce(
    jsonb_agg(
      predecessor.stable_item_key
      order by predecessor.position desc, predecessor.id desc
    ),
    '[]'::jsonb
  )
  into predecessor_keys
  from public.course_schedule_items predecessor
  where predecessor.version_id = new.schedule_version_id
    and predecessor.item_state in ('scheduled', 'requeued')
    and (
      predecessor.position < marked_item.position
      or (
        predecessor.position = marked_item.position
        and predecessor.id < marked_item.id
      )
    );

  insert into public.course_progress_restoration_provenance (
    progress_event_id,
    course_id,
    schedule_version_id,
    stable_item_key,
    plan_epoch_id,
    marked_cadence,
    predecessor_stable_item_keys
  ) values (
    new.id,
    new.course_id,
    new.schedule_version_id,
    new.stable_item_key,
    stable_plan_epoch_id,
    marked_version.cadence,
    predecessor_keys
  ) on conflict (progress_event_id) do nothing;

  return new;
end;
$$;

drop trigger if exists capture_course_progress_restoration_provenance
on public.course_progress_events;
create trigger capture_course_progress_restoration_provenance
after insert on public.course_progress_events
for each row execute function public.capture_course_progress_restoration_provenance();

drop trigger if exists course_progress_restoration_provenance_immutable
on public.course_progress_restoration_provenance;
create trigger course_progress_restoration_provenance_immutable
before update or delete on public.course_progress_restoration_provenance
for each row execute function public.reject_course_progress_mutation();

-- Existing marked events already point at immutable Schedule Versions, so
-- their restoration context can be reconstructed exactly once during upgrade.
insert into public.course_progress_restoration_provenance (
  progress_event_id,
  course_id,
  schedule_version_id,
  stable_item_key,
  plan_epoch_id,
  marked_cadence,
  predecessor_stable_item_keys,
  created_at
)
select
  event.id,
  event.course_id,
  event.schedule_version_id,
  event.stable_item_key,
  coalesce(epoch.plan_epoch_id, version.schedule_id),
  version.cadence,
  coalesce(predecessors.stable_item_keys, '[]'::jsonb),
  event.recorded_at
from public.course_progress_events event
join public.course_schedule_versions version
  on version.id = event.schedule_version_id
join public.course_schedule_items marked_item
  on marked_item.id = event.schedule_item_id
 and marked_item.version_id = event.schedule_version_id
left join public.course_schedule_version_coverages coverage
  on coverage.version_id = event.schedule_version_id
left join lateral (
  select case
    when coalesce(coverage.metadata ->> 'planEpochId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (coverage.metadata ->> 'planEpochId')::uuid
    else null
  end as plan_epoch_id
) epoch on true
left join lateral (
  select jsonb_agg(
    predecessor.stable_item_key
    order by predecessor.position desc, predecessor.id desc
  ) as stable_item_keys
  from public.course_schedule_items predecessor
  where predecessor.version_id = event.schedule_version_id
    and predecessor.item_state in ('scheduled', 'requeued')
    and (
      predecessor.position < marked_item.position
      or (
        predecessor.position = marked_item.position
        and predecessor.id < marked_item.id
      )
    )
) predecessors on true
where event.progress_kind = 'studied'
  and event.event_action = 'marked'
on conflict (progress_event_id) do nothing;

create or replace function public.synchronize_student_course_schedule_dates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  bounds record;
  authoritative_schedule_id uuid;
  stable_course_id uuid;
  locked_start date;
  complete_replacement boolean := false;
  version_changed boolean := tg_op = 'INSERT'
    or new.active_schedule_version_id is distinct from old.active_schedule_version_id;
  was_activated boolean := case
    when tg_op = 'INSERT' then false
    else old.activated_at is not null or old.activated_start_date is not null
  end;
begin
  if new.active_schedule_version_id is null then
    return new;
  end if;

  select version.schedule_id, schedule.course_id
  into authoritative_schedule_id, stable_course_id
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where version.id = new.active_schedule_version_id;

  if authoritative_schedule_id is null or stable_course_id <> new.id then
    raise exception 'The active Schedule Version does not belong to this Course.';
  end if;

  if tg_op = 'UPDATE' and version_changed then
    select exists (
      select 1
      from public.course_schedule_coverage_publish_intents intent
      where intent.course_id = new.id
        and intent.schedule_id = authoritative_schedule_id
        and intent.expected_version_id = old.active_schedule_version_id
        and intent.transition_kind = 'complete_replacement'
    ) into complete_replacement;
  end if;

  select * into bounds
  from public.course_schedule_version_date_bounds(new.active_schedule_version_id);

  if bounds.effective_item_count = 0
    or bounds.first_date is null
    or bounds.last_date is null then
    raise exception 'An active Schedule Version requires at least one scheduled or requeued item.';
  end if;

  if version_changed and new.status in ('completed', 'cancelled') then
    raise exception 'A completed or cancelled Course cannot activate another Schedule Version.';
  end if;

  if not was_activated and new.activated_at is null then
    new.start_date := bounds.first_date;
    new.scheduled_end_date := bounds.last_date;
    new.activated_start_date := null;
    return new;
  end if;

  if not was_activated and new.activated_at is not null then
    if bounds.last_date < current_date then
      raise exception 'A Course cannot be activated from a Schedule Version that ends in the past.';
    end if;
    locked_start := bounds.first_date;
  else
    locked_start := coalesce(old.activated_start_date, old.start_date);
  end if;

  -- A future plan has no elapsed Course history to protect. Its governed
  -- complete replacement owns the new start edge. Once that edge is today or
  -- in the past, it remains the permanent historical Course boundary.
  if complete_replacement and locked_start > current_date then
    locked_start := bounds.first_date;
  end if;

  if version_changed
    and not complete_replacement
    and bounds.first_date < locked_start
    and (
      tg_op = 'INSERT'
      or old.active_schedule_version_id is null
      or public.course_schedule_version_introduces_pre_start_item(
        new.active_schedule_version_id,
        old.active_schedule_version_id,
        locked_start
      )
    ) then
    raise exception 'A later Schedule Version cannot move an activated Course before its locked start date.';
  end if;
  if not complete_replacement and bounds.last_date < locked_start then
    raise exception 'The active Schedule Version ends before the activated Course start.';
  end if;
  if was_activated
    and version_changed
    and new.status in ('active', 'wind_down')
    and bounds.last_date < current_date then
    raise exception 'A past-only Schedule revision requires the explicit Course finish flow.';
  end if;

  -- An elapsed Course retains its historical activation edge. A future plan
  -- replacement establishes its own edge from the authoritative Version.
  new.start_date := locked_start;
  new.activated_start_date := locked_start;
  new.scheduled_end_date := bounds.last_date;

  if was_activated
    and version_changed
    and new.status = 'wind_down'
    and bounds.last_date >= current_date then
    new.status := 'active';
  end if;

  return new;
end;
$$;

alter table public.course_progress_restoration_provenance enable row level security;

revoke all on public.course_progress_restoration_provenance
from public, anon, authenticated, service_role;
grant select on public.course_progress_restoration_provenance to service_role;

revoke all on function public.capture_course_progress_restoration_provenance()
from public, anon, authenticated;
revoke all on function public.synchronize_student_course_schedule_dates()
from public, anon, authenticated;

comment on table public.course_progress_restoration_provenance is
  'Immutable mark-time provenance for deterministic restoration of a reversed Studied Session in a later phase.';
comment on function public.capture_course_progress_restoration_provenance() is
  'Captures the marked Version, plan epoch, cadence, and nearest-first predecessor order for every Studied mark.';
comment on function public.synchronize_student_course_schedule_dates() is
  'Preserves elapsed Course starts while allowing an explicitly governed complete replacement of a future plan to establish any start from publication day onward.';
