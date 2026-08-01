-- Phase 5.E.1: immutable Track Session identity and personalized resource snapshots.

alter table public.course_schedule_items
  add column if not exists source_track_key text generated always as (
    case when item_kind = 'curriculum_topic' then nullif(btrim(coalesce(
      source_snapshot ->> 'sourceTrackKey',
      source_snapshot ->> 'trackId',
      source_snapshot ->> 'trackKey'
    )), '') else null end
  ) stored,
  add column if not exists source_module_key text generated always as (
    case when item_kind = 'curriculum_topic' then nullif(btrim(coalesce(
      source_snapshot ->> 'sourceModuleKey',
      source_snapshot ->> 'moduleId',
      source_snapshot ->> 'moduleKey'
    )), '') else null end
  ) stored,
  add column if not exists source_session_key text generated always as (
    case when item_kind = 'curriculum_topic' then coalesce(nullif(btrim(coalesce(
      source_snapshot ->> 'sourceSessionKey',
      source_snapshot ->> 'sourceSessionId',
      source_snapshot ->> 'sessionId'
    )), ''), stable_item_key) else null end
  ) stored,
  add column if not exists source_content_version_key text generated always as (
    case when item_kind = 'curriculum_topic' then coalesce(nullif(btrim(coalesce(
      source_snapshot ->> 'sourceContentVersionKey',
      source_snapshot ->> 'contentVersionKey',
      source_snapshot ->> 'contentVersion'
    )), ''), 'schedule-item:' || id::text) else null end
  ) stored,
  add column if not exists difficulty_level text generated always as (
    case
      when item_kind <> 'curriculum_topic' then null
      when lower(btrim(coalesce(source_snapshot ->> 'difficulty', ''))) in ('low', 'easy')
        then 'easy'
      when lower(btrim(coalesce(source_snapshot ->> 'difficulty', ''))) in ('medium', 'intermediate')
        then 'intermediate'
      when lower(btrim(coalesce(source_snapshot ->> 'difficulty', ''))) in ('high', 'difficult')
        then 'difficult'
      else null
    end
  ) stored,
  add column if not exists planning_href text generated always as (
    case when item_kind = 'curriculum_topic' then nullif(btrim(coalesce(
      source_snapshot ->> 'planningHref',
      source_snapshot ->> 'planningRoute'
    )), '') else null end
  ) stored;

alter table public.course_schedule_items
  drop constraint if exists course_schedule_items_source_track_key_check,
  drop constraint if exists course_schedule_items_source_module_key_check,
  drop constraint if exists course_schedule_items_source_session_key_check,
  drop constraint if exists course_schedule_items_content_version_key_check,
  drop constraint if exists course_schedule_items_difficulty_check,
  drop constraint if exists course_schedule_items_planning_href_check,
  add constraint course_schedule_items_source_track_key_check check (
    source_track_key is null or char_length(source_track_key) <= 240
  ),
  add constraint course_schedule_items_source_module_key_check check (
    source_module_key is null or char_length(source_module_key) <= 240
  ),
  add constraint course_schedule_items_source_session_key_check check (
    source_session_key is null or char_length(source_session_key) <= 240
  ),
  add constraint course_schedule_items_content_version_key_check check (
    source_content_version_key is null or char_length(source_content_version_key) <= 300
  ),
  add constraint course_schedule_items_difficulty_check check (
    difficulty_level is null or difficulty_level in ('easy', 'intermediate', 'difficult')
  ),
  add constraint course_schedule_items_planning_href_check check (
    planning_href is null
    or (
      char_length(planning_href) <= 2048
      and planning_href !~* '^\\s*(javascript|data|vbscript):'
    )
  );

create table if not exists public.course_schedule_item_resources (
  id uuid primary key default gen_random_uuid(),
  schedule_item_id uuid not null references public.course_schedule_items(id) on delete restrict,
  stable_resource_key text not null,
  provider_key text not null,
  title text not null,
  resource_kind text not null,
  href text,
  requirement_state text not null default 'optional',
  source_content_version_key text not null,
  position integer not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint course_schedule_item_resources_key_check check (
    btrim(stable_resource_key) <> '' and char_length(stable_resource_key) <= 240
  ),
  constraint course_schedule_item_resources_provider_check check (
    provider_key ~ '^[a-z][a-z0-9._-]{1,79}$'
  ),
  constraint course_schedule_item_resources_title_check check (
    btrim(title) <> '' and char_length(title) <= 300
  ),
  constraint course_schedule_item_resources_kind_check check (
    resource_kind ~ '^[a-z][a-z0-9._-]{1,79}$'
  ),
  constraint course_schedule_item_resources_href_check check (
    href is null
    or (
      char_length(href) <= 2048
      and href !~* '^\\s*(javascript|data|vbscript):'
    )
  ),
  constraint course_schedule_item_resources_requirement_check check (
    requirement_state in ('required', 'optional', 'not_assigned')
  ),
  constraint course_schedule_item_resources_content_version_check check (
    btrim(source_content_version_key) <> ''
    and char_length(source_content_version_key) <= 400
  ),
  constraint course_schedule_item_resources_position_check check (position >= 0),
  constraint course_schedule_item_resources_snapshot_check check (
    jsonb_typeof(source_snapshot) = 'object'
  ),
  constraint course_schedule_item_resources_item_key unique (
    schedule_item_id, stable_resource_key
  ),
  constraint course_schedule_item_resources_item_position unique (
    schedule_item_id, position
  )
);

create index if not exists course_schedule_item_resources_item_idx
on public.course_schedule_item_resources (schedule_item_id, position, id);

create or replace function public.inherit_course_schedule_item_source_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_item public.course_schedule_items%rowtype;
  merged_snapshot jsonb;
begin
  if new.source_snapshot is null or jsonb_typeof(new.source_snapshot) <> 'object' then
    raise exception 'A Course Schedule item source snapshot must be an object.';
  end if;

  select prior_item.* into previous_item
  from public.course_schedule_versions new_version
  join public.course_schedule_items prior_item
    on prior_item.version_id = new_version.previous_version_id
   and prior_item.stable_item_key = new.stable_item_key
  where new_version.id = new.version_id;

  if found then
    merged_snapshot := previous_item.source_snapshot || new.source_snapshot;
    if previous_item.source_content_version_key is not null
      and nullif(btrim(coalesce(
        new.source_snapshot ->> 'sourceContentVersionKey',
        new.source_snapshot ->> 'contentVersionKey',
        new.source_snapshot ->> 'contentVersion'
      )), '') is null then
      merged_snapshot := jsonb_set(
        merged_snapshot,
        '{sourceContentVersionKey}',
        to_jsonb(previous_item.source_content_version_key),
        true
      );
    end if;
    new.source_snapshot := merged_snapshot;
  end if;

  return new;
end;
$$;

drop trigger if exists inherit_course_schedule_item_source_snapshot
on public.course_schedule_items;
create trigger inherit_course_schedule_item_source_snapshot
before insert on public.course_schedule_items
for each row execute function public.inherit_course_schedule_item_source_snapshot();

create or replace function public.snapshot_course_schedule_item_resources()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resources jsonb := new.source_snapshot -> 'resources';
begin
  if resources is null then return new; end if;
  if new.item_kind <> 'curriculum_topic' then
    raise exception 'Only a Curriculum Schedule item may snapshot Track Session resources.';
  end if;
  if jsonb_typeof(resources) <> 'array' then
    raise exception 'A Track Session resource snapshot must be an array.';
  end if;
  if jsonb_array_length(resources) > 100 then
    raise exception 'A Track Session may snapshot no more than 100 resources.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(resources) with ordinality entry(resource, ordinal)
    where btrim(coalesce(
        resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
      )) = ''
      or char_length(btrim(coalesce(
        resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
      ))) > 240
      or btrim(coalesce(resource ->> 'title', '')) = ''
      or char_length(btrim(resource ->> 'title')) > 300
      or lower(btrim(coalesce(resource ->> 'providerKey', resource ->> 'provider', 'other')))
        !~ '^[a-z][a-z0-9._-]{1,79}$'
      or lower(btrim(coalesce(resource ->> 'resourceKind', resource ->> 'type', 'reference')))
        !~ '^[a-z][a-z0-9._-]{1,79}$'
      or coalesce(resource ->> 'requirementState', resource ->> 'assignmentState', 'optional')
        not in ('required', 'optional', 'not_assigned')
      or (coalesce(resource ->> 'position', '') <> ''
        and coalesce(resource ->> 'position', '') !~ '^[0-9]+$')
      or char_length(btrim(coalesce(resource ->> 'href', ''))) > 2048
      or btrim(coalesce(resource ->> 'href', '')) ~* '^\\s*(javascript|data|vbscript):'
  ) then
    raise exception 'A Track Session resource snapshot contains an invalid resource.';
  end if;

  if jsonb_array_length(resources) <> (
      select count(distinct btrim(coalesce(
        resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
      )))
      from jsonb_array_elements(resources) resource
    ) then
    raise exception 'Every Track Session resource requires a unique stable key.';
  end if;

  if jsonb_array_length(resources) <> (
      select count(distinct coalesce(
        nullif(resource ->> 'position', '')::integer,
        ordinal::integer - 1
      ))
      from jsonb_array_elements(resources) with ordinality entry(resource, ordinal)
    ) then
    raise exception 'Every Track Session resource requires a unique position.';
  end if;

  insert into public.course_schedule_item_resources (
    schedule_item_id, stable_resource_key, provider_key, title, resource_kind,
    href, requirement_state, source_content_version_key, position, source_snapshot
  )
  select
    new.id,
    btrim(coalesce(
      resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
    )),
    lower(btrim(coalesce(resource ->> 'providerKey', resource ->> 'provider', 'other'))),
    btrim(resource ->> 'title'),
    lower(btrim(coalesce(resource ->> 'resourceKind', resource ->> 'type', 'reference'))),
    nullif(btrim(coalesce(resource ->> 'href', '')), ''),
    coalesce(resource ->> 'requirementState', resource ->> 'assignmentState', 'optional'),
    coalesce(
      nullif(btrim(coalesce(
        resource ->> 'sourceContentVersionKey', resource ->> 'contentVersionKey'
      )), ''),
      new.source_content_version_key || ':resource:' || btrim(coalesce(
        resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
      ))
    ),
    coalesce(nullif(resource ->> 'position', '')::integer, ordinal::integer - 1),
    resource
  from jsonb_array_elements(resources) with ordinality entry(resource, ordinal)
  order by coalesce(nullif(resource ->> 'position', '')::integer, ordinal::integer - 1);

  return new;
end;
$$;

drop trigger if exists snapshot_course_schedule_item_resources
on public.course_schedule_items;
create trigger snapshot_course_schedule_item_resources
after insert on public.course_schedule_items
for each row execute function public.snapshot_course_schedule_item_resources();

-- Existing retained snapshots rarely contain structured resources. Validate and
-- backfill any that do before the new trigger owns future immutable inserts.
do $validate_retained_track_resources$
begin
  if exists (
    select 1
    from public.course_schedule_items item
    where item.source_snapshot ? 'resources'
      and jsonb_typeof(item.source_snapshot -> 'resources') <> 'array'
  ) then
    raise exception 'A retained Track Session contains a malformed resource snapshot.';
  end if;
end;
$validate_retained_track_resources$;

insert into public.course_schedule_item_resources (
  schedule_item_id, stable_resource_key, provider_key, title, resource_kind,
  href, requirement_state, source_content_version_key, position, source_snapshot
)
select
  item.id,
  btrim(coalesce(
    resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
  )),
  lower(btrim(coalesce(resource ->> 'providerKey', resource ->> 'provider', 'other'))),
  btrim(resource ->> 'title'),
  lower(btrim(coalesce(resource ->> 'resourceKind', resource ->> 'type', 'reference'))),
  nullif(btrim(coalesce(resource ->> 'href', '')), ''),
  coalesce(resource ->> 'requirementState', resource ->> 'assignmentState', 'optional'),
  coalesce(
    nullif(btrim(coalesce(
      resource ->> 'sourceContentVersionKey', resource ->> 'contentVersionKey'
    )), ''),
    item.source_content_version_key || ':resource:' || btrim(coalesce(
      resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
    ))
  ),
  coalesce(nullif(resource ->> 'position', '')::integer, ordinal::integer - 1),
  resource
from public.course_schedule_items item
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(item.source_snapshot -> 'resources') = 'array'
    then item.source_snapshot -> 'resources' else '[]'::jsonb end
) with ordinality entry(resource, ordinal)
where btrim(coalesce(
    resource ->> 'stableResourceKey', resource ->> 'resourceKey', resource ->> 'id'
  )) <> ''
  and btrim(coalesce(resource ->> 'title', '')) <> ''
on conflict (schedule_item_id, stable_resource_key) do nothing;

drop trigger if exists course_schedule_item_resources_immutable
on public.course_schedule_item_resources;
create trigger course_schedule_item_resources_immutable
before update or delete on public.course_schedule_item_resources
for each row execute function public.reject_course_schedule_version_mutation();

create or replace function public.get_my_course_schedule_sources(p_course_id uuid)
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
    raise exception 'Authentication is required to open Course Session sources.';
  end if;
  if not public.current_user_can_read_student_course(p_course_id) then
    raise exception 'You do not have access to these Course Session sources.';
  end if;

  staff_history := public.current_user_can_read_course_schedule_history(p_course_id);

  select jsonb_build_object(
    'schemaVersion', 1,
    'courseId', course.id,
    'activeScheduleVersionId', active_version.id,
    'permissions', jsonb_build_object(
      'canReadUnassignedResources', staff_history,
      'canReadSupersededSourceSnapshots', staff_history
    ),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scheduleItemId', item.id,
        'stableItemKey', item.stable_item_key,
        'title', item.title,
        'kind', item.item_kind,
        'state', item.item_state,
        'scheduledDate', item.scheduled_date,
        'endDate', item.end_date,
        'position', item.position,
        'source', jsonb_build_object(
          'trackKey', item.source_track_key,
          'moduleKey', item.source_module_key,
          'sessionKey', item.source_session_key,
          'contentVersionKey', item.source_content_version_key,
          'planningHref', item.planning_href
        ),
        'difficultyLevel', item.difficulty_level,
        'difficultyStatus', case when item.difficulty_level is null then 'unrated' else 'rated' end,
        'resources', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', resource.id,
            'stableResourceKey', resource.stable_resource_key,
            'providerKey', resource.provider_key,
            'title', resource.title,
            'resourceKind', resource.resource_kind,
            'href', resource.href,
            'requirementState', resource.requirement_state,
            'sourceContentVersionKey', resource.source_content_version_key,
            'position', resource.position
          ) order by resource.position, resource.id)
          from public.course_schedule_item_resources resource
          where resource.schedule_item_id = item.id
            and (staff_history or resource.requirement_state in ('required', 'optional'))
        ), '[]'::jsonb)
      ) order by item.position, item.id)
      from public.course_schedule_items item
      where item.version_id = active_version.id
        and (staff_history or item.item_state in ('scheduled', 'requeued'))
    ), '[]'::jsonb),
    'sourcePolicy', jsonb_build_object(
      'authoringSource', 'markdown',
      'completedSessionPinning', 'planned_phase_5e2',
      'publishedTrackSynchronization', 'planned_phase_13'
    ),
    'featureStatus', jsonb_build_object(
      'sessionResourceIdentity', 'active_phase_5e1',
      'progressLedger', 'planned_phase_5e2',
      'hierarchicalAggregation', 'planned_phase_5e3',
      'effectiveSchedule', 'planned_phase_5e4'
    )
  ) into payload
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions active_version
    on active_version.id = course.active_schedule_version_id
  where course.id = p_course_id;

  if payload is null then
    raise exception 'The required Course Session source snapshot could not be found.';
  end if;
  return payload;
end;
$$;

alter table public.course_schedule_item_resources enable row level security;

create policy "Active Students and authorized staff read Session resources"
on public.course_schedule_item_resources for select to authenticated
using (exists (
  select 1
  from public.course_schedule_items item
  join public.course_schedule_versions version on version.id = item.version_id
  join public.course_schedules schedule on schedule.id = version.schedule_id
  join public.student_courses course on course.id = schedule.course_id
  where item.id = course_schedule_item_resources.schedule_item_id
    and (
      (
        course.student_id = (select auth.uid())
        and course.active_schedule_version_id = version.id
        and item.item_state in ('scheduled', 'requeued')
        and course_schedule_item_resources.requirement_state in ('required', 'optional')
      )
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

revoke all on public.course_schedule_item_resources from public, anon, authenticated;
grant select on public.course_schedule_item_resources to authenticated;
grant select on public.course_schedule_item_resources to service_role;

revoke all on function public.inherit_course_schedule_item_source_snapshot()
  from public, anon, authenticated;
revoke all on function public.snapshot_course_schedule_item_resources()
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule_sources(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_course_schedule_sources(uuid) to authenticated;
grant execute on function public.get_my_course_schedule_sources(uuid) to service_role;

comment on column public.course_schedule_items.source_content_version_key is
  'Immutable content identity for the Track Session snapshot represented by this Schedule item. Phase 13 replaces legacy item keys with published Track-version identities.';
comment on table public.course_schedule_item_resources is
  'Immutable Course-specific Track Session resource snapshots. Required resources count toward later aggregation, optional resources never block it, and not-assigned resources remain staff-only.';
comment on function public.get_my_course_schedule_sources(uuid) is
  'Phase 5.E.1 participant-safe Track Session/resource projection. Progress and effective reflow arrive in later Phase 5.E subphases.';
