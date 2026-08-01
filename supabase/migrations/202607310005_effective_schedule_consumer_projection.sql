-- Phase 5.G.2.4.7.3.3: one effective date lane for every Schedule consumer.
--
-- Adaptive pacing already compacts unfinished Sessions onto the remaining
-- academic slots. The effective reader exposed that correct lane through
-- academicTrack.items, but the unified reader had already assembled its
-- past/next/upcoming groups and Classroom Home from structural dates. Calendar
-- and Home could consequently retain a vacancy or a stale future milestone
-- after Studied progress advanced the active plan.
--
-- Reconcile date-only planned rows with the effective item lane, remove any
-- defensive stale planned copy of a Studied Session, re-section the future
-- rows, and rebuild Classroom Home. Meetings, assignments, actual Studied
-- history, and occurrence outcomes keep their own authoritative dates.

begin;

create or replace function public.course_schedule_reconcile_effective_groups(
  p_groups jsonb,
  p_items jsonb,
  p_display_time_zone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  group_key text;
  row_entry jsonb;
  item_entry jsonb;
  calendar_entry jsonb;
  effective_date date;
  viewer_time_zone text := coalesce(
    nullif(btrim(p_display_time_zone), ''),
    'UTC'
  );
  past_rows jsonb := '[]'::jsonb;
  future_rows jsonb := '[]'::jsonb;
  next_rows jsonb := '[]'::jsonb;
  upcoming_rows jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_groups, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
  then
    raise exception 'The effective Schedule consumer projection is invalid.';
  end if;

  begin
    perform clock_timestamp() at time zone viewer_time_zone;
  exception when invalid_parameter_value then
    viewer_time_zone := 'UTC';
  end;

  foreach group_key in array array['past', 'next', 'upcoming'] loop
    for row_entry in
      select entry.value
      from jsonb_array_elements(coalesce(
        p_groups -> group_key,
        '[]'::jsonb
      )) entry(value)
    loop
      item_entry := null;
      effective_date := null;

      if row_entry ->> 'rowKind' = 'planned_topic'
        and nullif(row_entry ->> 'scheduleItemId', '') is not null
      then
        select item.value
        into item_entry
        from jsonb_array_elements(p_items) item(value)
        where item.value ->> 'scheduleItemId'
          = row_entry ->> 'scheduleItemId'
        limit 1;

        -- Studied work is represented by its independent-progress history row
        -- on the actual Studied date, never by a second future milestone.
        if item_entry ->> 'sequenceState' = 'studied'
          or lower(coalesce(
            item_entry #>> '{progress,studied,state}',
            'unmarked'
          )) = 'marked'
          or lower(coalesce(
            item_entry #>> '{progress,studied,marked}',
            'false'
          )) = 'true'
        then
          continue;
        end if;

        if coalesce(item_entry ->> 'effectiveDate', '')
          ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then
          effective_date := (item_entry ->> 'effectiveDate')::date;
          row_entry := jsonb_set(
            row_entry,
            '{effectiveDate}',
            to_jsonb(effective_date),
            true
          );
          calendar_entry := coalesce(
            row_entry -> 'calendarPresentation',
            '{}'::jsonb
          ) || jsonb_build_object(
            'sourceKind', 'course_target',
            'isDateOnly', true,
            'effectiveDate', effective_date,
            'displayAnchor',
              (effective_date + time '12:00') at time zone viewer_time_zone,
            'displayLocalTime', '12:00',
            'displayTimeZone', viewer_time_zone,
            'placement', 'viewer_local_noon',
            'blocksAvailability', false
          );
          row_entry := jsonb_set(
            row_entry,
            '{calendarPresentation}',
            calendar_entry,
            true
          );
        end if;
      end if;

      if group_key = 'past' then
        past_rows := past_rows || jsonb_build_array(
          jsonb_set(
            row_entry,
            '{section}',
            to_jsonb('past'::text),
            true
          )
        );
      else
        future_rows := future_rows || jsonb_build_array(row_entry);
      end if;
    end loop;
  end loop;

  with ordered as (
    select
      entry.value as row_payload,
      row_number() over (
        order by
          case
            when coalesce(entry.value ->> 'effectiveDate', '')
              ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then (entry.value ->> 'effectiveDate')::date
            else null
          end nulls last,
          nullif(entry.value ->> 'effectiveTimestamp', '')::timestamptz
            nulls last,
          entry.value ->> 'rowId',
          entry.ordinality
      ) as future_ordinal
    from jsonb_array_elements(future_rows)
      with ordinality entry(value, ordinality)
  )
  select
    coalesce(jsonb_agg(
      jsonb_set(
        ordered.row_payload,
        '{section}',
        to_jsonb('next'::text),
        true
      )
      order by ordered.future_ordinal
    ) filter (where ordered.future_ordinal = 1), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_set(
        ordered.row_payload,
        '{section}',
        to_jsonb('upcoming'::text),
        true
      )
      order by ordered.future_ordinal
    ) filter (where ordered.future_ordinal > 1), '[]'::jsonb)
  into next_rows, upcoming_rows
  from ordered;

  return jsonb_build_object(
    'past', past_rows,
    'next', next_rows,
    'upcoming', upcoming_rows
  );
exception when invalid_text_representation then
  raise exception 'The effective Schedule consumer date is invalid.';
end;
$$;

revoke all on function
  public.course_schedule_reconcile_effective_groups(jsonb, jsonb, text)
from public, anon, authenticated, service_role;

alter function public.get_my_unified_course_schedule(uuid)
rename to get_my_unified_course_schedule_phase5g2_4_7_3_3_base;

revoke all on function
  public.get_my_unified_course_schedule_phase5g2_4_7_3_3_base(uuid)
from public, anon, authenticated, service_role;

create or replace function public.get_my_unified_course_schedule(
  p_course_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  reconciled_groups jsonb;
begin
  payload :=
    public.get_my_unified_course_schedule_phase5g2_4_7_3_3_base(
      p_course_id
    );

  if coalesce(
    (payload #>> '{permissions,canReadDetailedAcademicTrack}')::boolean,
    false
  ) then
    reconciled_groups :=
      public.course_schedule_reconcile_effective_groups(
        coalesce(payload -> 'groups', '{}'::jsonb),
        coalesce(payload #> '{academicTrack,items}', '[]'::jsonb),
        coalesce(nullif(payload #>> '{schedule,timeZone}', ''), 'UTC')
      );

    payload := jsonb_set(
      payload,
      '{groups,past}',
      reconciled_groups -> 'past',
      true
    );
    payload := jsonb_set(
      payload,
      '{groups,next}',
      reconciled_groups -> 'next',
      true
    );
    payload := jsonb_set(
      payload,
      '{groups,upcoming}',
      reconciled_groups -> 'upcoming',
      true
    );
    payload := jsonb_set(
      payload,
      '{summary,pastCount}',
      to_jsonb(jsonb_array_length(reconciled_groups -> 'past')),
      true
    );
    payload := jsonb_set(
      payload,
      '{summary,nextCount}',
      to_jsonb(jsonb_array_length(reconciled_groups -> 'next')),
      true
    );
    payload := jsonb_set(
      payload,
      '{summary,upcomingCount}',
      to_jsonb(jsonb_array_length(reconciled_groups -> 'upcoming')),
      true
    );
    payload := jsonb_set(
      payload,
      '{classroomHome}',
      public.project_course_schedule_classroom_home(
        p_course_id,
        payload,
        clock_timestamp()
      ),
      true
    );
  end if;

  payload := jsonb_set(
    payload,
    '{featureStatus,effectiveScheduleConsumerProjection}',
    to_jsonb('active_phase_5g2_4_7_3_3'::text),
    true
  );
  return payload;
end;
$$;

revoke all on function public.get_my_unified_course_schedule(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_unified_course_schedule(uuid)
to authenticated, service_role;

comment on function public.course_schedule_reconcile_effective_groups(
  jsonb,
  jsonb,
  text
) is
  'Internal canonical reconciliation of date-only planned rows with the one pacing-aware effective item lane. Studied history and timed meetings retain their own dates.';

comment on function public.get_my_unified_course_schedule(uuid) is
  'Canonical Schedule reader whose academic items, timeline groups, Classroom Home, and Calendar consumers share one active-Version effective date projection.';

commit;
