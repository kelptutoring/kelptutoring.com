-- Phase 5.E.3: hierarchical Course progress aggregation.
-- Explicit append-only facts remain authoritative. Session completion and
-- inherited child presentation are projections, never fabricated events.

alter table public.course_progress_notification_events
  drop constraint if exists course_progress_notifications_type_check,
  add constraint course_progress_notifications_type_check check (
    event_type in (
      'progress_studied_marked',
      'progress_studied_reversed',
      'session_studied_derived',
      'session_studied_derived_reversed'
    )
  );

create or replace function public.validate_course_progress_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  item_record public.course_schedule_items%rowtype;
  resource_record public.course_schedule_item_resources%rowtype;
  related_record public.course_progress_events%rowtype;
begin
  select course.* into course_record
  from public.student_courses course
  where course.id = new.course_id;
  if not found then raise exception 'The Course progress event Course does not exist.'; end if;

  select item.* into item_record
  from public.course_schedule_items item
  join public.course_schedule_versions version on version.id = item.version_id
  join public.course_schedules schedule on schedule.id = version.schedule_id
  where item.id = new.schedule_item_id
    and item.version_id = new.schedule_version_id
    and schedule.course_id = new.course_id;
  if not found then
    raise exception 'The Course progress target does not belong to the Course Schedule.';
  end if;
  if item_record.item_kind <> 'curriculum_topic'
    or item_record.stable_item_key <> new.stable_item_key then
    raise exception 'The Course progress Session identity is invalid.';
  end if;

  if new.target_kind = 'resource' then
    select resource.* into resource_record
    from public.course_schedule_item_resources resource
    where resource.id = new.resource_id
      and resource.schedule_item_id = new.schedule_item_id;
    if not found
      or resource_record.stable_resource_key <> new.stable_resource_key
      or resource_record.requirement_state = 'not_assigned' then
      raise exception 'The Course progress resource identity is invalid.';
    end if;
  end if;

  if public.course_progress_actor_role(course_record, new.actor_user_id)
    is distinct from new.actor_role then
    raise exception 'The Course progress actor role is invalid.';
  end if;

  if new.actor_role = 'student' then
    if new.event_action = 'reversed' and new.progress_kind = 'studied' then
      raise exception 'Students cannot reverse Studied progress.';
    end if;
    if new.private_staff_note is not null then
      raise exception 'Students cannot create private academic staff notes.';
    end if;
  else
    if new.progress_kind <> 'studied'
      or (
        new.event_action in ('marked', 'reflection_amended')
        and new.target_kind <> 'session'
      ) then
      raise exception 'Academic staff may mark Session-level Studied progress and correct Studied Session or resource progress.';
    end if;
    if new.reflection is not null then
      raise exception 'Progress reflections remain Student-controlled.';
    end if;
  end if;

  if new.event_action = 'reflection_amended'
    and new.actor_role <> 'student' then
    raise exception 'Only Students may amend progress reflections.';
  end if;

  if new.related_event_id is not null then
    select * into related_record
    from public.course_progress_events event
    where event.id = new.related_event_id;
    if not found
      or related_record.course_id <> new.course_id
      or related_record.stable_item_key <> new.stable_item_key
      or related_record.stable_resource_key is distinct from new.stable_resource_key
      or related_record.progress_kind <> new.progress_kind then
      raise exception 'The related Course progress event is invalid.';
    end if;
    if new.event_action = 'reversed' and related_record.event_action <> 'marked' then
      raise exception 'A progress reversal must reference the active mark.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.course_session_studied_aggregation(
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
    'studied'
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
      and event.progress_kind = 'studied'
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
    'explicitStudiedRequiredResourceCount', explicit_required_count,
    'advancesAcademicPointer', direct_marked or derived_marked
  );
end;
$$;

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
  item_record public.course_schedule_items%rowtype;
  studied jsonb;
  session_reviewed public.course_progress_events%rowtype;
  session_practiced public.course_progress_events%rowtype;
  resources jsonb;
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
    raise exception 'The active Curriculum Session could not be projected.';
  end if;

  studied := public.course_session_studied_aggregation(
    p_course_id,
    p_schedule_item_id
  );
  session_reviewed := public.course_progress_active_mark(
    p_course_id,
    item_record.stable_item_key,
    null,
    'reviewed'
  );
  session_practiced := public.course_progress_active_mark(
    p_course_id,
    item_record.stable_item_key,
    null,
    'practiced'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'resourceId', resource.id,
    'stableResourceKey', resource.stable_resource_key,
    'title', resource.title,
    'requirementState', resource.requirement_state,
    'position', resource.position,
    'studied', jsonb_build_object(
      'state', case
        when resource_studied.event_action = 'marked'
          or (
            resource.requirement_state in ('required', 'optional')
            and coalesce((studied ->> 'directMarked')::boolean, false)
          ) then 'marked'
        else 'unmarked'
      end,
      'source', case
        when resource_studied.event_action = 'marked' then 'explicit_resource'
        when resource.requirement_state in ('required', 'optional')
          and coalesce((studied ->> 'directMarked')::boolean, false)
          then 'inherited_session'
        else 'none'
      end,
      'effectiveAt', case
        when resource_studied.event_action = 'marked'
          then resource_studied.effective_at
        when resource.requirement_state in ('required', 'optional')
          and coalesce((studied ->> 'directMarked')::boolean, false)
          then (studied ->> 'effectiveAt')::timestamptz
        else null
      end,
      'transitionEventId', resource_studied.id,
      'inheritedFromEventId', case
        when resource_studied.event_action = 'marked' then null
        when resource.requirement_state in ('required', 'optional')
          and coalesce((studied ->> 'directMarked')::boolean, false)
          then (studied ->> 'directTransitionEventId')::uuid
        else null
      end
    ),
    'reviewed', jsonb_build_object(
      'state', case when resource_reviewed.event_action = 'marked'
        then 'marked' else 'unmarked' end,
      'source', case when resource_reviewed.event_action = 'marked'
        then 'explicit_resource' else 'none' end,
      'effectiveAt', case when resource_reviewed.event_action = 'marked'
        then resource_reviewed.effective_at else null end,
      'transitionEventId', resource_reviewed.id
    ),
    'practiced', jsonb_build_object(
      'state', case when resource_practiced.event_action = 'marked'
        then 'marked' else 'unmarked' end,
      'source', case when resource_practiced.event_action = 'marked'
        then 'explicit_resource' else 'none' end,
      'effectiveAt', case when resource_practiced.event_action = 'marked'
        then resource_practiced.effective_at else null end,
      'transitionEventId', resource_practiced.id
    )
  ) order by resource.position, resource.id), '[]'::jsonb)
  into resources
  from public.course_schedule_item_resources resource
  left join lateral (
    select event.*
    from public.course_progress_events event
    where event.course_id = p_course_id
      and event.stable_item_key = item_record.stable_item_key
      and event.stable_resource_key = resource.stable_resource_key
      and event.progress_kind = 'studied'
      and event.event_action in ('marked', 'reversed')
    order by event.recorded_at desc, event.id desc
    limit 1
  ) resource_studied on true
  left join lateral (
    select event.*
    from public.course_progress_events event
    where event.course_id = p_course_id
      and event.stable_item_key = item_record.stable_item_key
      and event.stable_resource_key = resource.stable_resource_key
      and event.progress_kind = 'reviewed'
      and event.event_action in ('marked', 'reversed')
    order by event.recorded_at desc, event.id desc
    limit 1
  ) resource_reviewed on true
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
  ) resource_practiced on true
  where resource.schedule_item_id = item_record.id
    and (
      p_include_not_assigned
      or resource.requirement_state in ('required', 'optional')
    );

  return jsonb_build_object(
    'scheduleItemId', item_record.id,
    'stableItemKey', item_record.stable_item_key,
    'title', item_record.title,
    'position', item_record.position,
    'studied', studied,
    'reviewed', jsonb_build_object(
      'state', case when session_reviewed.event_action = 'marked'
        then 'marked' else 'unmarked' end,
      'source', case when session_reviewed.event_action = 'marked'
        then 'direct_session' else 'none' end,
      'effectiveAt', case when session_reviewed.event_action = 'marked'
        then session_reviewed.effective_at else null end,
      'transitionEventId', session_reviewed.id,
      'advancesAcademicPointer', false
    ),
    'practiced', jsonb_build_object(
      'state', case when session_practiced.event_action = 'marked'
        then 'marked' else 'unmarked' end,
      'source', case when session_practiced.event_action = 'marked'
        then 'direct_session' else 'none' end,
      'effectiveAt', case when session_practiced.event_action = 'marked'
        then session_practiced.effective_at else null end,
      'transitionEventId', session_practiced.id,
      'advancesAcademicPointer', false
    ),
    'resources', resources
  );
end;
$$;

create or replace function public.insert_course_progress_aggregate_notification(
  p_progress_event_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  progress_event public.course_progress_events%rowtype;
  course_record public.student_courses%rowtype;
begin
  if p_event_type not in (
    'session_studied_derived',
    'session_studied_derived_reversed'
  ) then
    raise exception 'The Session aggregation notification type is invalid.';
  end if;

  select * into progress_event
  from public.course_progress_events
  where id = p_progress_event_id;
  if not found then
    raise exception 'The Session aggregation notification source event does not exist.';
  end if;

  select * into course_record
  from public.student_courses
  where id = progress_event.course_id;

  insert into public.course_progress_notification_events (
    recipient_user_id,
    actor_user_id,
    course_id,
    progress_event_id,
    event_type,
    payload
  )
  select
    recipient.user_id,
    progress_event.actor_user_id,
    progress_event.course_id,
    progress_event.id,
    p_event_type,
    jsonb_build_object(
      'scheduleItemId', progress_event.schedule_item_id,
      'stableItemKey', progress_event.stable_item_key,
      'targetKind', 'session_aggregate',
      'causedByResourceKey', progress_event.stable_resource_key,
      'effectiveAt', progress_event.effective_at,
      'actorRole', progress_event.actor_role
    )
  from (
    select progress_event.actor_user_id as user_id
    union select course_record.student_id
    union select course_record.tutor_id
  ) recipient
  where recipient.user_id is not null
  on conflict (recipient_user_id, progress_event_id, event_type) do nothing;
end;
$$;

alter function public.record_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) rename to record_course_progress_phase5e2;

create or replace function public.record_course_progress(
  p_course_id uuid,
  p_schedule_item_id uuid,
  p_resource_id uuid,
  p_progress_kind text,
  p_expected_latest_event_id uuid,
  p_effective_at timestamptz,
  p_reflection text,
  p_student_explanation text,
  p_private_staff_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  before_state jsonb;
  after_state jsonb;
  response_payload jsonb;
begin
  if lower(btrim(coalesce(p_progress_kind, ''))) = 'studied' then
    -- Serialize Studied changes within one Session without coupling the
    -- stale token of one resource to another. Concurrent submissions for
    -- different resources wait briefly rather than losing the aggregate
    -- completion boundary or its notification fact.
    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(
        ':',
        'course-session-studied-aggregate',
        p_course_id::text,
        p_schedule_item_id::text
      ),
      0
    ));
  end if;

  if lower(btrim(coalesce(p_progress_kind, ''))) = 'studied'
    and p_resource_id is not null then
    before_state := public.course_session_studied_aggregation(
      p_course_id,
      p_schedule_item_id
    );
  end if;

  response_payload := public.record_course_progress_phase5e2(
    p_course_id,
    p_schedule_item_id,
    p_resource_id,
    p_progress_kind,
    p_expected_latest_event_id,
    p_effective_at,
    p_reflection,
    p_student_explanation,
    p_private_staff_note,
    p_idempotency_key
  );

  if before_state is not null then
    after_state := public.course_session_studied_aggregation(
      p_course_id,
      p_schedule_item_id
    );
    if not coalesce((before_state ->> 'marked')::boolean, false)
      and coalesce((after_state ->> 'marked')::boolean, false) then
      perform public.insert_course_progress_aggregate_notification(
        (response_payload ->> 'eventId')::uuid,
        'session_studied_derived'
      );
    end if;
  end if;

  return response_payload;
end;
$$;

alter function public.reverse_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) rename to reverse_course_progress_phase5e2;

create or replace function public.reverse_course_progress(
  p_course_id uuid,
  p_schedule_item_id uuid,
  p_resource_id uuid,
  p_progress_kind text,
  p_expected_latest_event_id uuid,
  p_effective_at timestamptz,
  p_student_explanation text,
  p_private_staff_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  course_before public.student_courses%rowtype;
  item_record public.course_schedule_items%rowtype;
  actor_role text;
  before_state jsonb;
  after_state jsonb;
  response_payload jsonb;
begin
  select * into course_before
  from public.student_courses
  where id = p_course_id;
  if not found then raise exception 'The Course does not exist.'; end if;

  select item.* into item_record
  from public.course_schedule_items item
  where item.id = p_schedule_item_id
    and item.version_id = course_before.active_schedule_version_id;
  if not found then
    raise exception 'The progress correction must target the active Schedule Version.';
  end if;

  actor_role := public.course_progress_actor_role(course_before, caller_id);
  if lower(btrim(coalesce(p_progress_kind, ''))) = 'studied' then
    -- Match the mark path's Session-level serialization. Target-local stale
    -- tokens remain independent, while aggregate transitions are observed
    -- in a deterministic order.
    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(
        ':',
        'course-session-studied-aggregate',
        p_course_id::text,
        p_schedule_item_id::text
      ),
      0
    ));
  end if;

  if lower(btrim(coalesce(p_progress_kind, ''))) = 'studied'
    and p_resource_id is not null then
    if actor_role in ('tutor', 'mentor')
      and public.course_progress_target_is_marked(
        p_course_id,
        item_record.stable_item_key,
        null,
        'studied'
      ) then
      raise exception 'Reverse the Session-level Studied mark before correcting an inherited resource.';
    end if;
    before_state := public.course_session_studied_aggregation(
      p_course_id,
      p_schedule_item_id
    );
  end if;

  response_payload := public.reverse_course_progress_phase5e2(
    p_course_id,
    p_schedule_item_id,
    p_resource_id,
    p_progress_kind,
    p_expected_latest_event_id,
    p_effective_at,
    p_student_explanation,
    p_private_staff_note,
    p_idempotency_key
  );

  if lower(btrim(coalesce(p_progress_kind, ''))) = 'studied' then
    after_state := public.course_session_studied_aggregation(
      p_course_id,
      p_schedule_item_id
    );
    if course_before.status = 'wind_down'
      and coalesce((after_state ->> 'marked')::boolean, false) then
      update public.student_courses
      set status = course_before.status,
          ended_at = course_before.ended_at,
          updated_at = course_before.updated_at
      where id = course_before.id;
      response_payload := jsonb_set(
        response_payload,
        '{courseReopened}',
        'false'::jsonb,
        true
      );
    end if;
  end if;

  if before_state is not null
    and coalesce((before_state ->> 'marked')::boolean, false)
    and not coalesce((after_state ->> 'marked')::boolean, false) then
    perform public.insert_course_progress_aggregate_notification(
      (response_payload ->> 'eventId')::uuid,
      'session_studied_derived_reversed'
    );
  end if;

  return response_payload;
end;
$$;

alter function public.get_my_course_progress(uuid)
rename to get_my_course_progress_phase5e2;

create or replace function public.get_my_course_progress(p_course_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  include_not_assigned boolean;
  session_aggregates jsonb;
begin
  payload := public.get_my_course_progress_phase5e2(p_course_id);
  include_not_assigned := public.current_user_can_read_course_schedule_history(
    p_course_id
  );

  select coalesce(jsonb_agg(
    public.course_session_progress_aggregation(
      p_course_id,
      item.id,
      include_not_assigned
    )
    order by item.position, item.id
  ), '[]'::jsonb)
  into session_aggregates
  from public.student_courses course
  join public.course_schedule_items item
    on item.version_id = course.active_schedule_version_id
  where course.id = p_course_id
    and item.item_kind = 'curriculum_topic'
    and item.item_state in ('scheduled', 'requeued');

  payload := jsonb_set(
    payload,
    '{sessionAggregates}',
    session_aggregates,
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus,hierarchicalAggregation}',
    to_jsonb('active_phase_5e3'::text),
    true
  );
  return payload;
end;
$$;

alter function public.get_my_course_schedule_sources(uuid)
rename to get_my_course_schedule_sources_phase5e2;

create or replace function public.get_my_course_schedule_sources(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  payload := public.get_my_course_schedule_sources_phase5e2(p_course_id);
  payload := jsonb_set(
    payload,
    '{featureStatus,hierarchicalAggregation}',
    to_jsonb('active_phase_5e3'::text),
    true
  );
  return payload;
end;
$$;

create or replace function public.protect_studied_course_schedule_items()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  studied record;
  successor public.course_schedule_items%rowtype;
begin
  if new.active_schedule_version_id is not distinct from old.active_schedule_version_id then
    return new;
  end if;

  for studied in
    select item.stable_item_key, item.id as schedule_item_id
    from public.course_schedule_items item
    where item.version_id = old.active_schedule_version_id
      and item.item_kind = 'curriculum_topic'
      and item.item_state in ('scheduled', 'requeued')
      and coalesce((
        public.course_session_studied_aggregation(old.id, item.id)
        ->> 'marked'
      )::boolean, false)
  loop
    select candidate.* into successor
    from public.course_schedule_items candidate
    where candidate.version_id = new.active_schedule_version_id
      and candidate.stable_item_key = studied.stable_item_key;

    if not found then
      raise exception 'A Studied Schedule item cannot be dropped from a successor Version.';
    end if;

    if not exists (
      select 1
      from public.course_schedule_items original
      where original.id = studied.schedule_item_id
        and successor.stable_item_key = original.stable_item_key
        and successor.title = original.title
        and successor.item_kind = original.item_kind
        and successor.curriculum_node_id is not distinct from original.curriculum_node_id
        and successor.scheduled_date = original.scheduled_date
        and successor.end_date = original.end_date
        and successor.position = original.position
        and successor.item_state = original.item_state
        and successor.source_track_key is not distinct from original.source_track_key
        and successor.source_module_key is not distinct from original.source_module_key
        and successor.source_session_key is not distinct from original.source_session_key
        and successor.source_content_version_key is not distinct from original.source_content_version_key
        and successor.difficulty_level is not distinct from original.difficulty_level
        and successor.planning_href is not distinct from original.planning_href
        and (
          select coalesce(jsonb_agg(
            to_jsonb(resource) - 'id' - 'schedule_item_id' - 'created_at'
            order by resource.position, resource.stable_resource_key
          ), '[]'::jsonb)
          from public.course_schedule_item_resources resource
          where resource.schedule_item_id = successor.id
        ) = (
          select coalesce(jsonb_agg(
            to_jsonb(resource) - 'id' - 'schedule_item_id' - 'created_at'
            order by resource.position, resource.stable_resource_key
          ), '[]'::jsonb)
          from public.course_schedule_item_resources resource
          where resource.schedule_item_id = original.id
        )
    ) then
      raise exception 'A Studied Schedule item is immutable in successor Versions.';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.course_session_studied_aggregation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.course_session_progress_aggregation(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.insert_course_progress_aggregate_notification(uuid, text)
  from public, anon, authenticated;
revoke all on function public.record_course_progress_phase5e2(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.reverse_course_progress_phase5e2(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) from public, anon, authenticated;
revoke all on function public.get_my_course_progress_phase5e2(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule_sources_phase5e2(uuid)
  from public, anon, authenticated;

revoke all on function public.record_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.reverse_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) from public, anon, authenticated;
revoke all on function public.get_my_course_progress(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_course_schedule_sources(uuid)
  from public, anon, authenticated;

grant execute on function public.record_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) to authenticated;
grant execute on function public.reverse_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) to authenticated;
grant execute on function public.get_my_course_progress(uuid)
  to authenticated;
grant execute on function public.get_my_course_schedule_sources(uuid)
  to authenticated;
grant execute on function public.get_my_course_progress(uuid)
  to service_role;
grant execute on function public.get_my_course_schedule_sources(uuid)
  to service_role;

comment on function public.course_session_studied_aggregation(uuid, uuid) is
  'Phase 5.E.3 internal projection: direct Session Studied wins; otherwise every required assigned resource must have an active explicit Studied mark.';
comment on function public.course_session_progress_aggregation(uuid, uuid, boolean) is
  'Phase 5.E.3 internal Session/resource hierarchy. Inheritance never creates child progress events; Reviewed and Practiced remain explicit.';
comment on function public.record_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text, text
) is
  'Phase 5.E.3 progress mark boundary with derived Session-completion notification facts.';
comment on function public.reverse_course_progress(
  uuid, uuid, uuid, text, uuid, timestamptz, text, text, text
) is
  'Phase 5.E.3 correction boundary. Staff may reverse resource Studied facts with a public reason after removing an active parent mark.';
comment on function public.get_my_course_progress(uuid) is
  'Private Phase 5.E.3 progress projection with explicit, inherited, and required-resource-derived Session state.';
comment on function public.get_my_course_schedule_sources(uuid) is
  'Session/resource source projection reporting active Phase 5.E.3 hierarchical aggregation.';
