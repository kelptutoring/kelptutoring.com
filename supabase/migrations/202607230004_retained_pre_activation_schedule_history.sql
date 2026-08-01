-- Phase 5.E.4 repair: Courses created before Phase 5.C may retain an
-- authoritative Schedule row dated before the Course start that was locked
-- during migration. A successor Version may carry that exact historical row
-- forward, but it must not introduce or move any effective item before the
-- activated Course start.

create or replace function public.course_schedule_version_introduces_pre_start_item(
  p_version_id uuid,
  p_previous_version_id uuid,
  p_locked_start date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.course_schedule_items proposed
    where proposed.version_id = p_version_id
      and proposed.item_state in ('scheduled', 'requeued')
      and proposed.scheduled_date < p_locked_start
      and not exists (
        select 1
        from public.course_schedule_items retained
        where retained.version_id = p_previous_version_id
          and retained.stable_item_key = proposed.stable_item_key
          and retained.item_state = proposed.item_state
          and retained.scheduled_date = proposed.scheduled_date
          and retained.end_date = proposed.end_date
      )
  );
$$;

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
  version_changed boolean := tg_op = 'INSERT'
    or new.active_schedule_version_id is distinct from old.active_schedule_version_id;
  was_activated boolean := case
    when tg_op = 'INSERT' then false
    else old.activated_at is not null or old.activated_start_date is not null
  end;
begin
  -- Atomic Course creation inserts the Course shell first and assigns version 1
  -- later in the same transaction. The deferred required-Schedule constraint
  -- still rejects any Course that reaches commit without that pointer.
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
    -- Draft design remains fluid: both Course edges follow version content.
    new.start_date := bounds.first_date;
    new.scheduled_end_date := bounds.last_date;
    new.activated_start_date := null;
    return new;
  end if;

  if not was_activated and new.activated_at is not null then
    -- Activation establishes the permanent historical start.
    if bounds.last_date < current_date then
      raise exception 'A Course cannot be activated from a Schedule Version that ends in the past.';
    end if;
    locked_start := bounds.first_date;
  else
    locked_start := coalesce(old.activated_start_date, old.start_date);
  end if;

  if version_changed
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
  if bounds.last_date < locked_start then
    raise exception 'The active Schedule Version ends before the activated Course start.';
  end if;
  if was_activated
    and version_changed
    and new.status in ('active', 'wind_down')
    and bounds.last_date < current_date then
    raise exception 'A past-only Schedule revision requires the explicit Course finish flow.';
  end if;

  new.start_date := locked_start;
  new.activated_start_date := locked_start;
  new.scheduled_end_date := bounds.last_date;

  -- Extending a Course during its 14-day wind-down reopens it and derives a
  -- fresh wind-down endpoint from the newly authoritative Schedule end.
  if was_activated
    and version_changed
    and new.status = 'wind_down'
    and bounds.last_date >= current_date then
    new.status := 'active';
  end if;

  return new;
end;
$$;

revoke all on function public.course_schedule_version_introduces_pre_start_item(
  uuid, uuid, date
) from public, anon, authenticated;
revoke all on function public.synchronize_student_course_schedule_dates()
  from public, anon, authenticated;

comment on function public.course_schedule_version_introduces_pre_start_item(
  uuid, uuid, date
) is
  'Detects new or moved effective items before an activated Course start while permitting byte-for-byte retained legacy date ranges.';
comment on function public.synchronize_student_course_schedule_dates() is
  'Phase 5.C Course-date invariant with Phase 5.E.4 support for unchanged pre-activation legacy Schedule history.';
