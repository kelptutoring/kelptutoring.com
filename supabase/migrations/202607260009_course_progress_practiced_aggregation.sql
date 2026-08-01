-- Practiced progress follows the same parent/required-resource hierarchy as
-- Studied without advancing the academic pointer. Direct Session marks are
-- inherited by assigned resources; completing every required resource derives
-- the Session mark as a read projection rather than fabricating an event.

create or replace function public.course_session_practiced_aggregation(
  p_course_id uuid,
  p_schedule_item_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  item_record public.course_schedule_items%rowtype;
  direct_transition public.course_progress_events%rowtype;
  direct_marked boolean := false;
  required_count integer := 0;
  explicit_required_count integer := 0;
  required_completed_at timestamptz;
  derived_marked boolean := false;
begin
  select item.* into item_record
  from public.student_courses course
  join public.course_schedule_items item
    on item.version_id = course.active_schedule_version_id
  where course.id = p_course_id
    and item.id = p_schedule_item_id
    and item.item_kind = 'curriculum_topic'
    and item.item_state in ('scheduled', 'requeued');
  if not found then
    raise exception 'The active Curriculum Session could not be aggregated.';
  end if;

  direct_transition := public.course_progress_active_mark(
    p_course_id,
    item_record.stable_item_key,
    null,
    'practiced'
  );
  direct_marked := coalesce(direct_transition.event_action = 'marked', false);

  select
    count(*) filter (where resource.requirement_state = 'required'),
    count(*) filter (
      where resource.requirement_state = 'required'
        and transition.event_action = 'marked'
    ),
    max(transition.effective_at) filter (
      where resource.requirement_state = 'required'
        and transition.event_action = 'marked'
    )
  into required_count, explicit_required_count, required_completed_at
  from public.course_schedule_item_resources resource
  left join lateral (
    select event.*
    from public.course_progress_events event
    where event.course_id = p_course_id
      and event.stable_item_key = item_record.stable_item_key
      and event.stable_resource_key = resource.stable_resource_key
      and event.progress_kind = 'practiced'
      and event.event_action in ('marked', 'reversed')
    order by event.recorded_at desc, event.id desc
    limit 1
  ) transition on true
  where resource.schedule_item_id = item_record.id;

  derived_marked := required_count > 0
    and explicit_required_count = required_count;

  return jsonb_build_object(
    'scheduleItemId', item_record.id,
    'stableItemKey', item_record.stable_item_key,
    'marked', direct_marked or derived_marked,
    'source', case
      when direct_marked then 'direct_session'
      when derived_marked then 'required_resources'
      else 'none'
    end,
    'effectiveAt', case
      when direct_marked then direct_transition.effective_at
      when derived_marked then required_completed_at
      else null
    end,
    'directMarked', direct_marked,
    'directTransitionEventId', direct_transition.id,
    'derivedFromRequiredResources', derived_marked,
    'requiredResourceCount', required_count,
    'explicitPracticedRequiredResourceCount', explicit_required_count,
    'advancesAcademicPointer', false
  );
end;
$$;

alter function public.course_session_progress_aggregation(
  uuid, uuid, boolean
) rename to course_session_progress_aggregation_phase5e3;

create or replace function public.course_session_progress_aggregation(
  p_course_id uuid,
  p_schedule_item_id uuid,
  p_include_not_assigned boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  practiced jsonb;
  projected_resources jsonb;
begin
  payload := public.course_session_progress_aggregation_phase5e3(
    p_course_id,
    p_schedule_item_id,
    p_include_not_assigned
  );
  practiced := public.course_session_practiced_aggregation(
    p_course_id,
    p_schedule_item_id
  );

  select coalesce(jsonb_agg(
    jsonb_set(
      resource.payload,
      '{practiced}',
      case
        when resource.payload #>> '{practiced,source}' = 'explicit_resource'
          then resource.payload -> 'practiced'
        when resource.payload ->> 'requirementState' in ('required', 'optional')
          and coalesce((practiced ->> 'directMarked')::boolean, false)
          then jsonb_build_object(
            'state', 'marked',
            'source', 'inherited_session',
            'effectiveAt', practiced ->> 'effectiveAt',
            'transitionEventId', null,
            'inheritedFromEventId', practiced ->> 'directTransitionEventId'
          )
        else resource.payload -> 'practiced'
      end,
      true
    )
    order by
      coalesce((resource.payload ->> 'position')::integer, 0),
      resource.payload ->> 'stableResourceKey'
  ), '[]'::jsonb)
  into projected_resources
  from jsonb_array_elements(coalesce(payload -> 'resources', '[]'::jsonb))
    resource(payload);

  payload := jsonb_set(
    payload,
    '{practiced}',
    jsonb_build_object(
      'state', case
        when coalesce((practiced ->> 'marked')::boolean, false)
          then 'marked'
        else 'unmarked'
      end,
      'source', practiced ->> 'source',
      'effectiveAt', practiced ->> 'effectiveAt',
      'transitionEventId', practiced ->> 'directTransitionEventId',
      'directMarked', coalesce((practiced ->> 'directMarked')::boolean, false),
      'derivedFromRequiredResources',
        coalesce((practiced ->> 'derivedFromRequiredResources')::boolean, false),
      'requiredResourceCount',
        coalesce((practiced ->> 'requiredResourceCount')::integer, 0),
      'explicitPracticedRequiredResourceCount',
        coalesce((practiced ->> 'explicitPracticedRequiredResourceCount')::integer, 0),
      'advancesAcademicPointer', false
    ),
    true
  );
  payload := jsonb_set(payload, '{resources}', projected_resources, true);
  return payload;
end;
$$;

revoke all on function public.course_session_practiced_aggregation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.course_session_progress_aggregation_phase5e3(
  uuid, uuid, boolean
) from public, anon, authenticated;
revoke all on function public.course_session_progress_aggregation(
  uuid, uuid, boolean
) from public, anon, authenticated;

comment on function public.course_session_practiced_aggregation(uuid, uuid) is
  'Internal Practiced projection: direct Session marks win; otherwise every required assigned resource must have an active explicit Practiced mark.';
comment on function public.course_session_progress_aggregation(
  uuid, uuid, boolean
) is
  'Session/resource progress projection with bidirectional Studied and Practiced hierarchy. Derived Practiced state never advances the academic pointer.';
