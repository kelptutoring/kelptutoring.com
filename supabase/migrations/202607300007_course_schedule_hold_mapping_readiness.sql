-- Phase 5.G.2.4.7.2 hold-lock readiness follow-up.
--
-- A recurring Version can acquire its timed academic slots and initial mapping
-- through separate activation triggers. Before a Studied event enters the
-- six-hour hold path, rebuild the mapping once from the still-unmodified
-- progress state. The subsequent immutable lock therefore never depends on a
-- missing or stale activation revision.

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
  mapping_ready boolean := false;
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
    if not mapping_ready then
      perform public.refresh_course_schedule_target_mapping(
        new.course_id,
        active_version_id,
        'manual_refresh',
        null
      );
      mapping_ready := true;
    end if;

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

revoke all on function
  public.lock_course_schedule_targets_before_progress()
from public, anon, authenticated;

comment on function public.lock_course_schedule_targets_before_progress() is
  'Internal pre-insert boundary that refreshes the pre-progress recurring mapping and materializes every prepared target inside the six-hour hold before a Studied fact can reflow the active Schedule.';

