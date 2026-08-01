-- Phase 5.C: the active immutable Course Schedule Version is authoritative for
-- the Course date projection. Draft Courses follow both edges of their active
-- Schedule. Once activated, the original Course start is permanently locked;
-- later eligible versions may only change the scheduled endpoint.

alter table public.student_courses
  add column if not exists activated_start_date date;

-- Establish the locked historical start for Courses that have already been
-- activated before Phase 5.C. Draft Courses intentionally retain a null lock.
update public.student_courses
set activated_start_date = start_date
where activated_at is not null
  and activated_start_date is null;

-- Reconcile retained rows to their active authoritative Schedule Version before
-- the synchronization trigger and lifecycle constraint are installed.
with active_bounds as (
  select
    course.id as course_id,
    min(item.scheduled_date) filter (
      where item.item_state in ('scheduled', 'requeued')
    ) as first_date,
    max(item.end_date) filter (
      where item.item_state in ('scheduled', 'requeued')
    ) as last_date,
    count(*) filter (
      where item.item_state in ('scheduled', 'requeued')
    ) as effective_item_count
  from public.student_courses course
  join public.course_schedule_versions version
    on version.id = course.active_schedule_version_id
  join public.course_schedules schedule
    on schedule.id = version.schedule_id
   and schedule.course_id = course.id
  left join public.course_schedule_items item
    on item.version_id = version.id
  group by course.id
)
update public.student_courses course
set start_date = case
      when course.activated_at is null then bounds.first_date
      else course.start_date
    end,
    scheduled_end_date = bounds.last_date,
    activated_start_date = case
      when course.activated_at is null then null
      else course.start_date
    end
from active_bounds bounds
where bounds.course_id = course.id
  and bounds.effective_item_count > 0;

-- The two reconciliation updates queue both of Phase 5.B's deferred Course
-- constraints: the required-Schedule trigger and the active-Version foreign
-- key. PostgreSQL will not ALTER the same table while either event remains
-- pending, so evaluate both existing invariants before adding the Phase 5.C
-- lifecycle check. This preserves rather than weakens any of the three rules.
set constraints
  student_courses_require_schedule,
  student_courses_active_schedule_version_fkey
immediate;

alter table public.student_courses
  drop constraint if exists student_courses_activated_start_date_check,
  add constraint student_courses_activated_start_date_check check (
    (
      activated_at is null
      and activated_start_date is null
    )
    or (
      activated_at is not null
      and activated_start_date is not null
      and start_date = activated_start_date
    )
  );

create or replace function public.course_schedule_version_date_bounds(
  p_version_id uuid
)
returns table (
  first_date date,
  last_date date,
  effective_item_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    min(item.scheduled_date) filter (
      where item.item_state in ('scheduled', 'requeued')
    ) as first_date,
    max(item.end_date) filter (
      where item.item_state in ('scheduled', 'requeued')
    ) as last_date,
    count(*) filter (
      where item.item_state in ('scheduled', 'requeued')
    ) as effective_item_count
  from public.course_schedule_items item
  where item.version_id = p_version_id;
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

  if version_changed and bounds.first_date < locked_start then
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

drop trigger if exists synchronize_student_course_schedule_dates
on public.student_courses;
create trigger synchronize_student_course_schedule_dates
before insert or update on public.student_courses
for each row execute function public.synchronize_student_course_schedule_dates();

-- Phase 5.C projection: Course dates are the operational projection, while the
-- active Version also exposes its independently calculated effective range.
create or replace function public.get_my_course_schedule(p_course_id uuid)
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
  if caller_id is null then raise exception 'Authentication is required to open a Course Schedule.'; end if;
  if not public.current_user_can_read_student_course(p_course_id) then
    raise exception 'You do not have access to this Course Schedule.';
  end if;

  select jsonb_build_object(
    'schemaVersion', 2,
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'providerKind', course.provider_kind,
      'serviceModel', course.service_model,
      'startDate', course.start_date,
      'activatedStartDate', course.activated_start_date,
      'startDateLocked', course.activated_start_date is not null,
      'scheduledEndDate', course.scheduled_end_date,
      'windDownEndsOn', course.wind_down_ends_on
    ),
    'schedule', jsonb_build_object(
      'id', schedule.id,
      'status', schedule.status,
      'activeVersionId', course.active_schedule_version_id,
      'versionCount', (
        select count(*) from public.course_schedule_versions counted
        where counted.schedule_id = schedule.id
      )
    ),
    'activeVersion', jsonb_build_object(
      'id', active_version.id,
      'versionNumber', active_version.version_number,
      'previousVersionId', active_version.previous_version_id,
      'name', active_version.name,
      'timeZone', active_version.time_zone,
      'cadence', active_version.cadence,
      'reason', active_version.reason,
      'createdBy', active_version.created_by,
      'createdAt', active_version.created_at,
      'dateRange', jsonb_build_object(
        'firstDate', active_bounds.first_date,
        'lastDate', active_bounds.last_date,
        'effectiveItemCount', active_bounds.effective_item_count
      ),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.id,
          'stableItemKey', item.stable_item_key,
          'title', item.title,
          'scheduledDate', item.scheduled_date,
          'endDate', item.end_date,
          'position', item.position,
          'state', item.item_state,
          'legacyScheduleSessionId', item.legacy_schedule_session_id
        ) order by item.position, item.id)
        from public.course_schedule_items item
        where item.version_id = active_version.id
      ), '[]'::jsonb)
    ),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'previousVersionId', version.previous_version_id,
        'name', version.name,
        'timeZone', version.time_zone,
        'reason', version.reason,
        'createdBy', version.created_by,
        'createdAt', version.created_at,
        'itemCount', version_bounds.total_item_count,
        'dateRange', jsonb_build_object(
          'firstDate', version_bounds.first_date,
          'lastDate', version_bounds.last_date,
          'effectiveItemCount', version_bounds.effective_item_count
        ),
        'isActive', version.id = course.active_schedule_version_id
      ) order by version.version_number desc)
      from public.course_schedule_versions version
      cross join lateral (
        select
          min(item.scheduled_date) filter (
            where item.item_state in ('scheduled', 'requeued')
          ) as first_date,
          max(item.end_date) filter (
            where item.item_state in ('scheduled', 'requeued')
          ) as last_date,
          count(*) filter (
            where item.item_state in ('scheduled', 'requeued')
          ) as effective_item_count,
          count(*) as total_item_count
        from public.course_schedule_items item
        where item.version_id = version.id
      ) version_bounds
      where version.schedule_id = schedule.id
    ), '[]'::jsonb),
    'featureStatus', jsonb_build_object(
      'requiredSchedule', 'active_phase_5b',
      'courseDateSynchronization', 'active_phase_5c',
      'versionEditing', 'planned_phase_5g',
      'progression', 'planned_phase_5e'
    )
  ) into payload
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions active_version
    on active_version.id = course.active_schedule_version_id
  cross join lateral public.course_schedule_version_date_bounds(active_version.id) active_bounds
  where course.id = p_course_id;

  if payload is null then raise exception 'The required Course Schedule could not be found.'; end if;
  return payload;
end;
$$;

revoke all on function public.course_schedule_version_date_bounds(uuid)
  from public, anon, authenticated;
revoke all on function public.synchronize_student_course_schedule_dates()
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_course_schedule(uuid) to authenticated;

comment on column public.student_courses.activated_start_date is
  'Permanent historical Course start established by activation. Later Schedule Versions cannot move it.';
comment on function public.course_schedule_version_date_bounds(uuid) is
  'Calculates authoritative Course bounds from scheduled and requeued items; dropped items do not affect dates.';
comment on function public.synchronize_student_course_schedule_dates() is
  'Phase 5.C central invariant deriving Course dates from its active immutable Schedule Version.';
comment on function public.get_my_course_schedule(uuid) is
  'Authorized Phase 5.C projection with synchronized Course dates and calculated immutable-version date ranges.';
