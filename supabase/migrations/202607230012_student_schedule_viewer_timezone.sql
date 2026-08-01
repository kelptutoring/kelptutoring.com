-- Phase 5.F.5: Student-facing Schedule timezone follows the governed Profile.
--
-- Schedule Versions retain the timezone in which they were authored. That
-- immutable value remains available to staff and version-history readers.
-- Students, however, read timestamped Schedule facts in the current timezone
-- derived from their Profile location, matching the existing Calendar contract.

alter function public.get_my_effective_course_schedule(uuid)
  rename to get_my_effective_course_schedule_phase5e4;

alter function public.get_my_unified_course_schedule(uuid)
  rename to get_my_unified_course_schedule_phase5f4;

create or replace function public.project_course_schedule_rows_in_time_zone(
  p_rows jsonb,
  p_time_zone text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  projected_rows jsonb;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    case
      when timestamp_value.value is null then entry.row_payload
      else jsonb_set(
        case
          when entry.row_payload ->> 'rowKind' = 'meeting' then
            jsonb_set(
              jsonb_set(
                entry.row_payload,
                '{timeZone}',
                to_jsonb(p_time_zone),
                true
              ),
              '{localStartTime}',
              to_jsonb(to_char(
                timestamp_value.value at time zone p_time_zone,
                'HH24:MI'
              )),
              true
            )
          else entry.row_payload
        end,
        '{effectiveDate}',
        to_jsonb((timestamp_value.value at time zone p_time_zone)::date),
        true
      )
    end
    order by entry.ordinality
  ), '[]'::jsonb)
  into projected_rows
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
    with ordinality entry(row_payload, ordinality)
  left join lateral (
    select nullif(entry.row_payload ->> 'effectiveTimestamp', '')::timestamptz
      as value
  ) timestamp_value on true;

  return projected_rows;
end;
$$;

create or replace function public.get_my_effective_course_schedule(
  p_course_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  payload jsonb;
  viewer_time_zone text;
begin
  payload := public.get_my_effective_course_schedule_phase5e4(p_course_id);

  if payload #>> '{permissions,actorRole}' = 'student' then
    viewer_time_zone := coalesce(
      (
        select preference.time_zone
        from public.user_preferences preference
        where preference.user_id = caller_id
      ),
      payload ->> 'timeZone',
      'UTC'
    );

    payload := jsonb_set(
      payload,
      '{timeZone}',
      to_jsonb(viewer_time_zone),
      true
    );
    payload := jsonb_set(
      payload,
      '{items}',
      public.project_course_schedule_rows_in_time_zone(
        payload -> 'items',
        viewer_time_zone
      ),
      true
    );
  end if;

  return payload;
end;
$$;

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
  caller_id uuid := auth.uid();
  payload jsonb;
  viewer_time_zone text;
  group_key text;
begin
  payload := public.get_my_unified_course_schedule_phase5f4(p_course_id);

  if payload #>> '{viewer,viewMode}' = 'student' then
    viewer_time_zone := coalesce(
      (
        select preference.time_zone
        from public.user_preferences preference
        where preference.user_id = caller_id
      ),
      payload #>> '{schedule,timeZone}',
      'UTC'
    );

    payload := jsonb_set(
      payload,
      '{schedule,timeZone}',
      to_jsonb(viewer_time_zone),
      true
    );

    foreach group_key in array array['past', 'next', 'upcoming'] loop
      payload := jsonb_set(
        payload,
        array['groups', group_key],
        public.project_course_schedule_rows_in_time_zone(
          payload #> array['groups', group_key],
          viewer_time_zone
        ),
        true
      );
    end loop;
  end if;

  return payload;
end;
$$;

revoke all on function public.get_my_effective_course_schedule_phase5e4(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_unified_course_schedule_phase5f4(uuid)
  from public, anon, authenticated;
revoke all on function public.project_course_schedule_rows_in_time_zone(jsonb, text)
  from public, anon, authenticated;
revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_unified_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated, service_role;
grant execute on function public.get_my_unified_course_schedule(uuid)
  to authenticated, service_role;

comment on function public.project_course_schedule_rows_in_time_zone(jsonb, text) is
  'Phase 5.F.5 internal read helper. Timestamped Student Schedule rows receive local display dates and times without changing canonical Schedule history.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Phase 5.F.5 Student projection of the compact effective Schedule. Student timestamp display follows the current Profile-derived timezone; staff retain the immutable Version timezone.';
comment on function public.get_my_unified_course_schedule(uuid) is
  'Phase 5.F.5 role-aware timeline. Student timestamp display follows the current Profile-derived timezone; Guardian and staff projections retain their governed Course context.';
