-- Phase 5.G.2.4.7.3.1.1: persist Builder presentation metadata on successors.
--
-- The governed Builder already used its cadence to calculate item dates, but
-- the structural publisher copied name, timezone, and cadence from the
-- previous Version. Reopening a Mon/Wed/Fri Schedule could therefore show the
-- inherited seven-day cadence even though the published rows followed the
-- selected weekdays. Carry the validated Builder metadata through the same
-- short-lived publication intent that already governs coverage, and repair
-- historical Builder Versions from their immutable command receipts.

begin;

alter table public.course_schedule_coverage_publish_intents
  add column if not exists version_name text,
  add column if not exists time_zone text,
  add column if not exists cadence jsonb;

alter table public.course_schedule_coverage_publish_intents
  drop constraint if exists
    course_schedule_coverage_publish_intents_version_name_check,
  add constraint course_schedule_coverage_publish_intents_version_name_check
    check (
      version_name is null
      or (
        btrim(version_name) <> ''
        and char_length(version_name) <= 180
      )
    ),
  drop constraint if exists
    course_schedule_coverage_publish_intents_time_zone_check,
  add constraint course_schedule_coverage_publish_intents_time_zone_check
    check (
      time_zone is null
      or (
        btrim(time_zone) <> ''
        and char_length(time_zone) <= 100
      )
    ),
  drop constraint if exists
    course_schedule_coverage_publish_intents_cadence_check,
  add constraint course_schedule_coverage_publish_intents_cadence_check
    check (
      cadence is null
      or jsonb_typeof(cadence) = 'object'
    );

create or replace function public.normalize_course_schedule_builder_cadence(
  p_cadence jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  cadence_type text;
  interval_days integer;
  normalized_weekdays jsonb;
begin
  if p_cadence is null or jsonb_typeof(p_cadence) <> 'object' then
    raise exception 'Choose a supported Schedule cadence.';
  end if;

  cadence_type := lower(btrim(coalesce(p_cadence ->> 'type', '')));
  if cadence_type = 'day_interval' then
    if jsonb_typeof(p_cadence -> 'intervalDays') <> 'number'
      or coalesce(p_cadence ->> 'intervalDays', '') !~ '^[0-9]+$' then
      raise exception 'The session period must be between 1 and 365 days.';
    end if;
    interval_days := (p_cadence ->> 'intervalDays')::integer;
    if interval_days < 1 or interval_days > 365 then
      raise exception 'The session period must be between 1 and 365 days.';
    end if;
    return jsonb_build_object(
      'type', 'day_interval',
      'intervalDays', interval_days
    );
  end if;

  if cadence_type in ('weekly_frequency', 'weekly_meeting_pattern') then
    if jsonb_typeof(p_cadence -> 'weekdays') <> 'array'
      or jsonb_array_length(p_cadence -> 'weekdays') < 1
      or jsonb_array_length(p_cadence -> 'weekdays') > 7
      or exists (
        select 1
        from jsonb_array_elements(p_cadence -> 'weekdays') weekday(value)
        where jsonb_typeof(weekday.value) <> 'number'
          or (weekday.value #>> '{}') !~ '^[0-6]$'
      ) then
      raise exception
        'Choose between 1 and 7 different meeting weekdays.';
    end if;

    select jsonb_agg(day_value order by day_value)
    into normalized_weekdays
    from (
      select distinct (weekday.value #>> '{}')::integer as day_value
      from jsonb_array_elements(p_cadence -> 'weekdays') weekday(value)
    ) normalized;

    return jsonb_build_object(
      'type', 'weekly_frequency',
      'weekdays', normalized_weekdays
    );
  end if;

  raise exception 'Choose a supported Schedule cadence.';
end;
$$;

create or replace function public.course_schedule_builder_publication_metadata(
  p_builder_schedule jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_name text :=
    btrim(coalesce(p_builder_schedule ->> 'name', ''));
  normalized_time_zone text :=
    btrim(coalesce(p_builder_schedule ->> 'timeZone', ''));
  normalized_cadence jsonb;
begin
  if p_builder_schedule is null
    or jsonb_typeof(p_builder_schedule) <> 'object'
    or normalized_name = ''
    or char_length(normalized_name) > 180 then
    raise exception 'The generated Schedule name is invalid.';
  end if;
  if normalized_time_zone = ''
    or char_length(normalized_time_zone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names zone
      where zone.name = normalized_time_zone
    ) then
    raise exception 'The generated Schedule timezone is invalid.';
  end if;

  normalized_cadence :=
    public.normalize_course_schedule_builder_cadence(
      p_builder_schedule -> 'cadence'
    );
  return jsonb_build_object(
    'name', normalized_name,
    'timeZone', normalized_time_zone,
    'cadence', normalized_cadence
  );
end;
$$;

create or replace function
  public.course_schedule_builder_publication_metadata_if_valid(
    p_builder_schedule jsonb
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.course_schedule_builder_publication_metadata(
    p_builder_schedule
  );
exception when others then
  return null;
end;
$$;

create or replace function public.course_schedule_successor_metadata(
  p_schedule_id uuid,
  p_expected_version_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_active_name text,
  p_active_time_zone text,
  p_active_cadence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  resolved jsonb;
begin
  select jsonb_build_object(
    'name', intent.version_name,
    'timeZone', intent.time_zone,
    'cadence', intent.cadence,
    'source', 'builder_intent'
  )
  into resolved
  from public.course_schedule_coverage_publish_intents intent
  where intent.schedule_id = p_schedule_id
    and intent.expected_version_id = p_expected_version_id
    and intent.actor_user_id = p_actor_user_id
    and intent.idempotency_key = p_idempotency_key
    and intent.version_name is not null
    and intent.time_zone is not null
    and intent.cadence is not null;

  return coalesce(resolved, jsonb_build_object(
    'name', p_active_name,
    'timeZone', p_active_time_zone,
    'cadence', p_active_cadence,
    'source', 'active_version'
  ));
end;
$$;

revoke all on function public.normalize_course_schedule_builder_cadence(
  jsonb
) from public, anon, authenticated;
revoke all on function public.course_schedule_builder_publication_metadata(
  jsonb
) from public, anon, authenticated;
revoke all on function
  public.course_schedule_builder_publication_metadata_if_valid(
    jsonb
  ) from public, anon, authenticated;
revoke all on function public.course_schedule_successor_metadata(
  uuid, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;

do $persist_builder_publication_metadata$
declare
  original_definition text;
  patched_definition text;
  declaration_anchor constant text :=
    '  published_version_id uuid;' || chr(10) || 'begin';
  declaration_replacement constant text :=
    '  published_version_id uuid;' || chr(10)
    || '  publication_metadata jsonb;' || chr(10) || 'begin';
  insert_anchor constant text :=
    '  insert into public.course_schedule_coverage_publish_intents (';
  insert_replacement constant text :=
    '  publication_metadata := '
    || 'public.course_schedule_builder_publication_metadata('
    || 'p_builder_schedule);' || chr(10)
    || '  insert into public.course_schedule_coverage_publish_intents (';
  column_anchor constant text :=
    '    qualification_snapshot, transition_kind, plan_epoch_id,'
    || chr(10) || '    previous_plan_epoch_id'
    || chr(10) || '  ) values (';
  column_replacement constant text :=
    '    qualification_snapshot, transition_kind, plan_epoch_id,'
    || chr(10)
    || '    previous_plan_epoch_id, version_name, time_zone, cadence'
    || chr(10) || '  ) values (';
  value_anchor constant text := $intent_values$    case
      when transition_kind = 'complete_replacement'
        then previous_plan_epoch_id
      else null
    end
  );$intent_values$;
  value_replacement constant text := $intent_values$    case
      when transition_kind = 'complete_replacement'
        then previous_plan_epoch_id
      else null
    end,
    publication_metadata ->> 'name',
    publication_metadata ->> 'timeZone',
    publication_metadata -> 'cadence'
  );$intent_values$;
begin
  select pg_get_functiondef(
    'public.publish_course_builder_schedule_phase5g2_4_7_2_base(uuid,uuid,jsonb,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(declaration_anchor in original_definition) = 0
    or position(insert_anchor in original_definition) = 0
    or position(column_anchor in original_definition) = 0
    or position(value_anchor in original_definition) = 0 then
    raise exception
      'The governed Builder publisher no longer matches its metadata boundary.';
  end if;

  patched_definition := replace(
    original_definition,
    declaration_anchor,
    declaration_replacement
  );
  patched_definition := replace(
    patched_definition,
    insert_anchor,
    insert_replacement
  );
  patched_definition := replace(
    patched_definition,
    column_anchor,
    column_replacement
  );
  patched_definition := replace(
    patched_definition,
    value_anchor,
    value_replacement
  );
  if patched_definition = original_definition
    or position('publication_metadata jsonb' in patched_definition) = 0
    or position(
      'publication_metadata -> ''cadence''' in patched_definition
    ) = 0 then
    raise exception
      'The governed Builder metadata could not be attached to its intent.';
  end if;
  execute patched_definition;
end;
$persist_builder_publication_metadata$;

do $publish_successor_metadata$
declare
  original_definition text;
  patched_definition text;
  declaration_anchor constant text :=
    '  reason_record record;' || chr(10) || 'begin';
  declaration_replacement constant text :=
    '  reason_record record;' || chr(10)
    || '  version_metadata jsonb;' || chr(10) || 'begin';
  active_anchor constant text := $active_version$  if not found then raise exception 'The active Course Schedule Version could not be found.'; end if;

  -- Validate the complete proposed immutable Version before any durable write.$active_version$;
  active_replacement constant text := $active_version$  if not found then raise exception 'The active Course Schedule Version could not be found.'; end if;

  version_metadata := public.course_schedule_successor_metadata(
    stable_schedule.id,
    p_expected_version_id,
    caller_id,
    normalized_idempotency_key,
    active_version.name,
    active_version.time_zone,
    active_version.cadence
  );

  -- Validate the complete proposed immutable Version before any durable write.$active_version$;
begin
  select pg_get_functiondef(
    'public.publish_course_schedule_version(uuid,uuid,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(declaration_anchor in original_definition) = 0
    or position(active_anchor in original_definition) = 0
    or position('active_version.cadence' in original_definition) = 0 then
    raise exception
      'The structural publisher no longer matches its successor metadata boundary.';
  end if;

  patched_definition := replace(
    original_definition,
    declaration_anchor,
    declaration_replacement
  );
  patched_definition := replace(
    patched_definition,
    'active_version.name',
    'version_metadata ->> ''name'''
  );
  patched_definition := replace(
    patched_definition,
    'active_version.time_zone',
    'version_metadata ->> ''timeZone'''
  );
  patched_definition := replace(
    patched_definition,
    'active_version.cadence',
    'version_metadata -> ''cadence'''
  );
  -- Add the resolver only after replacing the original successor references;
  -- its fallback arguments must continue to read the active Version directly.
  patched_definition := replace(
    patched_definition,
    active_anchor,
    active_replacement
  );
  if patched_definition = original_definition
    or position('version_metadata jsonb' in patched_definition) = 0
    or position(
      'version_metadata -> ''cadence''' in patched_definition
    ) = 0
    or position(active_replacement in patched_definition) = 0 then
    raise exception
      'The structural successor could not adopt governed Builder metadata.';
  end if;
  execute patched_definition;
end;
$publish_successor_metadata$;

-- Repair Versions that were already published through the Builder. The
-- command receipt is immutable and contains the exact submitted presentation
-- metadata, so this does not infer cadence from dates or rewrite user intent.
alter table public.course_schedule_versions
  disable trigger course_schedule_versions_immutable;

with recovered_commands as (
  select distinct on (command.published_version_id)
    command.published_version_id,
    public.course_schedule_builder_publication_metadata_if_valid(
      command.request_payload -> 'builderSchedule'
    ) as presentation
  from public.course_schedule_builder_publish_commands command
  order by command.published_version_id, command.created_at desc, command.id desc
),
recoverable as (
  select *
  from recovered_commands
  where presentation is not null
)
update public.course_schedule_versions version
set name = recoverable.presentation ->> 'name',
    time_zone = recoverable.presentation ->> 'timeZone',
    cadence = recoverable.presentation -> 'cadence',
    source_snapshot = jsonb_set(
      jsonb_set(
        jsonb_set(
          version.source_snapshot,
          '{name}',
          to_jsonb(recoverable.presentation ->> 'name'),
          true
        ),
        '{timeZone}',
        to_jsonb(recoverable.presentation ->> 'timeZone'),
        true
      ),
      '{cadence}',
      recoverable.presentation -> 'cadence',
      true
    ),
    metadata = version.metadata || jsonb_build_object(
      'builderPresentationRecoveredBy', '202607300011'
    )
from recoverable
where version.id = recoverable.published_version_id
  and (
    version.name is distinct from recoverable.presentation ->> 'name'
    or version.time_zone is distinct from
      recoverable.presentation ->> 'timeZone'
    or version.cadence is distinct from recoverable.presentation -> 'cadence'
  );

alter table public.course_schedule_versions
  enable trigger course_schedule_versions_immutable;

update public.learning_schedules mirror
set name = version.name,
    time_zone = version.time_zone,
    source_snapshot = version.source_snapshot,
    updated_at = clock_timestamp()
from public.student_courses course
join public.course_schedule_versions version
  on version.id = course.active_schedule_version_id
where mirror.id = version.legacy_schedule_id
  and mirror.student_course_id = course.id
  and (
    mirror.name is distinct from version.name
    or mirror.time_zone is distinct from version.time_zone
    or mirror.source_snapshot is distinct from version.source_snapshot
  );

comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes one governed immutable successor whose validated Builder name, Student timezone, and cadence remain authoritative when the Schedule is reopened.';

comment on column
  public.course_schedule_coverage_publish_intents.cadence is
  'Validated Builder cadence carried transactionally into the immutable successor Version; never inferred from generated dates.';

commit;
