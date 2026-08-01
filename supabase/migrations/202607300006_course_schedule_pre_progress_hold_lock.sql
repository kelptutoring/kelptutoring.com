-- Phase 5.G.2.4.7.2 follow-up:
-- preserve the prepared recurring target before a Studied fact becomes visible.
--
-- The original AFTER INSERT path attempted to create the six-hour lock and
-- refresh the mapping after the progress row already existed. The lock helper
-- therefore refreshed against a state in which the prepared target was already
-- Studied. Materializing the immutable target in a BEFORE INSERT trigger keeps
-- the lock snapshot on the target the Tutor prepared; the existing AFTER INSERT
-- trigger then performs the normal Adaptive reflow with that lock in place.

create or replace function public.lock_course_schedule_targets_before_progress()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_version_id uuid;
  policy jsonb;
  due_slot record;
  as_of timestamptz := clock_timestamp();
begin
  if new.progress_kind <> 'studied'
    or new.event_action <> 'marked' then
    return new;
  end if;

  select course.active_schedule_version_id into active_version_id
  from public.student_courses course
  where course.id = new.course_id;
  if active_version_id is null then
    return new;
  end if;

  policy := public.course_schedule_pacing_policy(active_version_id);
  if policy ->> 'mode' <> 'adaptive' then
    return new;
  end if;

  for due_slot in
    select slot.id
    from public.course_schedule_academic_slots slot
    where slot.course_id = new.course_id
      and slot.version_id = active_version_id
      and slot.source_kind = 'recurring_pattern'
      and public.course_schedule_slot_starts_at(slot) >= as_of
      and public.course_schedule_slot_starts_at(slot) - interval '6 hours'
        <= as_of
      and not exists (
        select 1
        from public.course_schedule_target_locks target_lock
        where target_lock.academic_slot_id = slot.id
      )
    order by public.course_schedule_slot_starts_at(slot), slot.id
  loop
    begin
      perform public.lock_course_schedule_slot_target(
        due_slot.id,
        as_of,
        'scheduled_six_hour'
      );
    exception
      when others then
        if sqlerrm <>
          'This academic occurrence has no mapped target to lock.' then
          raise;
        end if;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists lock_course_schedule_targets_before_progress
on public.course_progress_events;
create trigger lock_course_schedule_targets_before_progress
before insert on public.course_progress_events
for each row
execute function public.lock_course_schedule_targets_before_progress();

-- The hold is now established before the row exists. This AFTER INSERT
-- function has one responsibility: rebuild the effective target mapping from
-- the newly inserted progress fact while honoring any immutable hold lock.
create or replace function public.refresh_course_schedule_target_mapping_after_progress()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_version_id uuid;
begin
  if new.progress_kind <> 'studied'
    or new.event_action not in ('marked', 'reversed') then
    return new;
  end if;

  select course.active_schedule_version_id into active_version_id
  from public.student_courses course
  where course.id = new.course_id;
  if active_version_id is null then
    return new;
  end if;

  perform public.refresh_course_schedule_target_mapping(
    new.course_id,
    active_version_id,
    'progress_reflow',
    new.id
  );
  return new;
end;
$$;

revoke all on function
  public.lock_course_schedule_targets_before_progress()
from public, anon, authenticated;

comment on function public.lock_course_schedule_targets_before_progress() is
  'Internal pre-insert boundary that materializes the prepared recurring target during the six-hour hold before a Studied fact can reflow the active Schedule.';
