-- Phase 5.F.2.1: immutable academic-slot generation.
--
-- An academic slot is a Course-Schedule occurrence, not a Calendar booking,
-- live Class, attendance fact, or credit commitment. Recurring slots derive
-- only from weekday, local time, duration, effective range, and Course
-- timezone. The legacy Phase 5.F.1 purpose field is deliberately ignored:
-- planned Practice/Review/Exam/Wrap-up belongs to structural Schedule items,
-- while actual Class purpose belongs to the later occurrence outcome.

create table if not exists public.course_schedule_academic_slots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  source_kind text not null,
  meeting_pattern_id uuid references public.course_schedule_meeting_patterns(id) on delete restrict,
  static_schedule_item_id uuid references public.course_schedule_items(id) on delete restrict,
  stable_slot_key text not null,
  local_date date not null,
  local_start_time time without time zone,
  duration_minutes smallint,
  time_zone text not null,
  position integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint course_schedule_academic_slots_source_kind_check check (
    source_kind in ('recurring_pattern', 'static_schedule')
  ),
  constraint course_schedule_academic_slots_key_check check (
    stable_slot_key ~ '^[a-z0-9][a-z0-9._:-]{2,159}$'
  ),
  constraint course_schedule_academic_slots_time_zone_check check (
    char_length(btrim(time_zone)) between 1 and 120
  ),
  constraint course_schedule_academic_slots_position_check check (position >= 0),
  constraint course_schedule_academic_slots_duration_check check (
    duration_minutes is null or duration_minutes in (30, 60, 90)
  ),
  constraint course_schedule_academic_slots_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint course_schedule_academic_slots_source_check check (
    (
      source_kind = 'recurring_pattern'
      and meeting_pattern_id is not null
      and static_schedule_item_id is null
      and local_start_time is not null
      and duration_minutes is not null
    )
    or (
      source_kind = 'static_schedule'
      and meeting_pattern_id is null
      and static_schedule_item_id is not null
      and local_start_time is null
      and duration_minutes is null
    )
  ),
  constraint course_schedule_academic_slots_version_key unique (
    version_id, stable_slot_key
  ),
  constraint course_schedule_academic_slots_version_position unique (
    version_id, position
  )
);

create index if not exists course_schedule_academic_slots_course_date_idx
on public.course_schedule_academic_slots (
  course_id, local_date, local_start_time, position, id
);

create index if not exists course_schedule_academic_slots_version_idx
on public.course_schedule_academic_slots (
  version_id, position, id
);

create or replace function public.reject_course_schedule_academic_slot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Course Schedule academic slots are immutable; activate a successor Schedule Version instead.';
end;
$$;

drop trigger if exists course_schedule_academic_slots_immutable
on public.course_schedule_academic_slots;
create trigger course_schedule_academic_slots_immutable
before update or delete on public.course_schedule_academic_slots
for each row execute function public.reject_course_schedule_academic_slot_mutation();

create or replace function public.generate_course_schedule_academic_slots(
  p_course_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  stable_schedule public.course_schedules%rowtype;
  version_record public.course_schedule_versions%rowtype;
  existing_count integer;
  generated_count integer := 0;
  generation_status text;
begin
  if p_course_id is null or p_version_id is null then
    raise exception 'Academic-slot generation requires a Course and Schedule Version.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for share;
  if not found then raise exception 'The Course could not be found for academic-slot generation.'; end if;

  select * into stable_schedule
  from public.course_schedules
  where course_id = course_record.id;
  if not found then raise exception 'The stable Course Schedule could not be found for academic-slot generation.'; end if;

  select * into version_record
  from public.course_schedule_versions
  where id = p_version_id
    and schedule_id = stable_schedule.id;
  if not found then
    raise exception 'The requested Schedule Version does not belong to this Course.';
  end if;

  select count(*) into existing_count
  from public.course_schedule_academic_slots slot
  where slot.version_id = version_record.id;
  if existing_count > 0 then
    return jsonb_build_object(
      'courseId', course_record.id,
      'versionId', version_record.id,
      'serviceModel', course_record.service_model,
      'status', 'already_generated',
      'slotCount', existing_count
    );
  end if;

  if course_record.service_model = 'recurring' then
    if not exists (
      select 1
      from public.course_schedule_meeting_patterns pattern
      where pattern.version_id = version_record.id
    ) then
      return jsonb_build_object(
        'courseId', course_record.id,
        'versionId', version_record.id,
        'serviceModel', course_record.service_model,
        'status', 'meeting_pattern_review_required',
        'slotCount', 0
      );
    end if;

    with occurrences as (
      select
        pattern.id as meeting_pattern_id,
        pattern.stable_pattern_key,
        pattern.local_start_time,
        pattern.duration_minutes,
        pattern.position as pattern_position,
        generated.local_day::date as local_date
      from public.course_schedule_meeting_patterns pattern
      cross join lateral generate_series(
        pattern.effective_from::timestamp,
        pattern.effective_until::timestamp,
        interval '1 day'
      ) generated(local_day)
      where pattern.version_id = version_record.id
        and extract(dow from generated.local_day)::integer = pattern.weekday
    ),
    ordered as (
      select
        occurrence.*,
        row_number() over (
          order by
            occurrence.local_date,
            occurrence.local_start_time,
            occurrence.pattern_position,
            occurrence.meeting_pattern_id
        ) - 1 as slot_position
      from occurrences occurrence
    )
    insert into public.course_schedule_academic_slots (
      course_id, version_id, source_kind, meeting_pattern_id,
      static_schedule_item_id, stable_slot_key, local_date,
      local_start_time, duration_minutes, time_zone, position, metadata
    )
    select
      course_record.id,
      version_record.id,
      'recurring_pattern',
      ordered.meeting_pattern_id,
      null,
      'pattern:' || ordered.stable_pattern_key || ':' ||
        to_char(ordered.local_date, 'YYYYMMDD'),
      ordered.local_date,
      ordered.local_start_time,
      ordered.duration_minutes,
      version_record.time_zone,
      ordered.slot_position::integer,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourcePatternKey', ordered.stable_pattern_key,
        'generationPhase', '5.F.2.1'
      )
    from ordered
    order by ordered.slot_position
    on conflict (version_id, stable_slot_key) do nothing;

    get diagnostics generated_count = row_count;
    if generated_count = 0 then
      raise exception 'The active meeting pattern does not produce an academic occurrence inside its effective range.';
    end if;
    generation_status := 'generated_recurring';
  elsif course_record.service_model in ('on_demand', 'access_only') then
    with ordered as (
      select
        item.id as schedule_item_id,
        item.stable_item_key,
        item.scheduled_date as local_date,
        row_number() over (
          order by item.scheduled_date, item.position, item.id
        ) - 1 as slot_position
      from public.course_schedule_items item
      where item.version_id = version_record.id
        and item.item_state in ('scheduled', 'requeued')
    )
    insert into public.course_schedule_academic_slots (
      course_id, version_id, source_kind, meeting_pattern_id,
      static_schedule_item_id, stable_slot_key, local_date,
      local_start_time, duration_minutes, time_zone, position, metadata
    )
    select
      course_record.id,
      version_record.id,
      'static_schedule',
      null,
      ordered.schedule_item_id,
      'static:' || ordered.stable_item_key,
      ordered.local_date,
      null,
      null,
      version_record.time_zone,
      ordered.slot_position::integer,
      jsonb_build_object(
        'schemaVersion', 1,
        'sourceScheduleItemKey', ordered.stable_item_key,
        'generationPhase', '5.F.2.1'
      )
    from ordered
    order by ordered.slot_position
    on conflict (version_id, stable_slot_key) do nothing;

    get diagnostics generated_count = row_count;
    if generated_count = 0 then
      raise exception 'A static Course Schedule requires at least one active academic item.';
    end if;
    generation_status := 'generated_static';
  else
    raise exception 'The Course service model cannot generate academic slots.';
  end if;

  return jsonb_build_object(
    'courseId', course_record.id,
    'versionId', version_record.id,
    'serviceModel', course_record.service_model,
    'status', generation_status,
    'slotCount', generated_count
  );
end;
$$;

create or replace function public.generate_active_course_schedule_academic_slots()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.active_schedule_version_id is not null
    and (
      tg_op = 'INSERT'
      or old.active_schedule_version_id is distinct from new.active_schedule_version_id
    ) then
    perform public.generate_course_schedule_academic_slots(
      new.id,
      new.active_schedule_version_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists generate_active_course_schedule_academic_slots
on public.student_courses;
create trigger generate_active_course_schedule_academic_slots
after insert or update of active_schedule_version_id on public.student_courses
for each row execute function public.generate_active_course_schedule_academic_slots();

create or replace function public.get_my_course_academic_slots(
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
  staff_history boolean;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open Course academic slots.';
  end if;
  if not public.current_user_can_read_student_course(p_course_id) then
    raise exception 'You do not have access to this Course academic-slot plan.';
  end if;

  staff_history := public.current_user_can_read_course_schedule_history(p_course_id);

  select jsonb_build_object(
    'schemaVersion', 1,
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'serviceModel', course.service_model
    ),
    'schedule', jsonb_build_object(
      'id', schedule.id,
      'activeVersionId', active_version.id,
      'versionNumber', active_version.version_number,
      'timeZone', active_version.time_zone
    ),
    'generation', jsonb_build_object(
      'status', case
        when exists (
          select 1
          from public.course_schedule_academic_slots slot
          where slot.version_id = active_version.id
        ) then 'configured'
        when course.service_model = 'recurring' then 'meeting_pattern_review_required'
        else 'generation_required'
      end,
      'slotCount', (
        select count(*)
        from public.course_schedule_academic_slots slot
        where slot.version_id = active_version.id
      )
    ),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', slot.id,
        'stableSlotKey', slot.stable_slot_key,
        'sourceKind', slot.source_kind,
        'localDate', slot.local_date,
        'localStartTime', case
          when slot.local_start_time is null then null
          else to_char(slot.local_start_time, 'HH24:MI')
        end,
        'durationMinutes', slot.duration_minutes,
        'timeZone', slot.time_zone,
        'position', slot.position,
        'targetMappingStatus', 'planned_phase_5f2_2'
      ) order by slot.position, slot.id)
      from public.course_schedule_academic_slots slot
      where slot.version_id = active_version.id
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canReadSlotHistory', staff_history,
      'canMutateSlotsDirectly', false
    ),
    'versions', case when staff_history then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'status', case
          when version.id = active_version.id then 'active'
          else 'superseded'
        end,
        'slotCount', (
          select count(*)
          from public.course_schedule_academic_slots slot
          where slot.version_id = version.id
        )
      ) order by version.version_number desc)
      from public.course_schedule_versions version
      where version.schedule_id = schedule.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'featureStatus', jsonb_build_object(
      'slotGeneration', 'active_phase_5f2_1',
      'targetMapping', 'planned_phase_5f2_2',
      'outcomesAndRequeue', 'planned_phase_5f3',
      'calendarBookings', 'deferred_calendar_phase',
      'attendanceAndCredits', 'deferred_live_class_phase'
    )
  ) into payload
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions active_version
    on active_version.id = course.active_schedule_version_id
  where course.id = p_course_id;

  if payload is null then raise exception 'The required Course Schedule could not be found.'; end if;
  return payload;
end;
$$;

alter table public.course_schedule_academic_slots enable row level security;

create policy "Active Students and authorized staff read academic slots"
on public.course_schedule_academic_slots for select to authenticated
using (exists (
  select 1
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  join public.student_courses course on course.id = schedule.course_id
  where version.id = course_schedule_academic_slots.version_id
    and course.id = course_schedule_academic_slots.course_id
    and (
      (
        course.student_id = (select auth.uid())
        and course.active_schedule_version_id = version.id
      )
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

revoke all on public.course_schedule_academic_slots
  from public, anon, authenticated;
grant select on public.course_schedule_academic_slots to authenticated;
grant select on public.course_schedule_academic_slots to service_role;

revoke all on function public.reject_course_schedule_academic_slot_mutation()
  from public, anon, authenticated;
revoke all on function public.generate_course_schedule_academic_slots(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.generate_active_course_schedule_academic_slots()
  from public, anon, authenticated;
revoke all on function public.get_my_course_academic_slots(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_course_academic_slots(uuid)
  to authenticated;
grant execute on function public.get_my_course_academic_slots(uuid)
  to service_role;

comment on table public.course_schedule_academic_slots is
  'Phase 5.F.2.1 immutable Course-Schedule occurrence dates. These are academic intent, not Calendar bookings, live Classes, attendance, no-shows, or credit commitments.';
comment on function public.generate_course_schedule_academic_slots(uuid, uuid) is
  'Internal idempotent Phase 5.F.2.1 generator. Recurring slots use day/time/duration only; static Courses use date-only Schedule items.';
comment on function public.get_my_course_academic_slots(uuid) is
  'Role-aware Phase 5.F.2.1 slot projection. Students read only the active Version; authorized staff receive Version summaries. Target mapping arrives in 5.F.2.2.';

-- Existing active Versions are backfilled without fabricating a recurring
-- pattern. Recurring Courses without one remain review-required.
do $backfill_active_academic_slots$
declare
  target record;
begin
  for target in
    select course.id as course_id, course.active_schedule_version_id as version_id
    from public.student_courses course
    where course.active_schedule_version_id is not null
  loop
    perform public.generate_course_schedule_academic_slots(
      target.course_id,
      target.version_id
    );
  end loop;
end;
$backfill_active_academic_slots$;
