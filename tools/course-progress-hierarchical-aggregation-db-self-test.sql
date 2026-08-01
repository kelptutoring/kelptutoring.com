\set ON_ERROR_STOP on

\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?student_a_id}
\else
  \echo 'Missing required actor variable: student_a_id'
  \quit 3
\endif
\if :{?student_b_id}
\else
  \echo 'Missing required actor variable: student_b_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  cardinality(array[
    :'mentor_id'::uuid, :'tutor_id'::uuid, :'student_a_id'::uuid,
    :'student_b_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'mentor_id'::uuid, :'tutor_id'::uuid, :'student_a_id'::uuid,
      :'student_b_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (
    select 1 from public.user_roles
    where user_id = :'mentor_id'::uuid
      and role_key = 'mentor'
      and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'tutor_id'::uuid
      and role_key in ('teacher', 'tutor')
      and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'student_a_id'::uuid
      and role_key = 'student'
      and status = 'active'
  )
  and exists (
    select 1 from public.user_roles
    where user_id = :'student_b_id'::uuid
      and role_key = 'student'
      and status = 'active'
  )
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required hierarchical-progress actors are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.mentor_id', :'mentor_id'::uuid::text, false);
select set_config('test.tutor_id', :'tutor_id'::uuid::text, false);
select set_config('test.student_a_id', :'student_a_id'::uuid::text, false);
select set_config('test.student_b_id', :'student_b_id'::uuid::text, false);
select set_config('test.outsider_id', :'outsider_id'::uuid::text, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.E.3 hierarchical Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 2,
    'id', 'phase5e3-db-schedule-v1',
    'name', 'Phase 5.E.3 Mechanics Schedule',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5e3-db-derived-session',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-motion',
        'sourceSessionId', 'builtin-session-derived-motion',
        'sourceContentVersionKey', 'track-session:derived-motion:v1',
        'difficulty', 'medium',
        'title', 'Derived motion completion',
        'startDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
        'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
        'resources', jsonb_build_array(
          jsonb_build_object(
            'stableResourceKey', 'derived-required-a',
            'providerKey', 'openstax',
            'title', 'Required motion reading',
            'resourceKind', 'textbook',
            'href', 'https://openstax.org/',
            'requirementState', 'required',
            'position', 0
          ),
          jsonb_build_object(
            'stableResourceKey', 'derived-required-b',
            'providerKey', 'khan-academy',
            'title', 'Required motion lesson',
            'resourceKind', 'video',
            'href', 'https://www.khanacademy.org/',
            'requirementState', 'required',
            'position', 1
          ),
          jsonb_build_object(
            'stableResourceKey', 'derived-optional',
            'providerKey', 'kelp',
            'title', 'Optional motion challenge',
            'resourceKind', 'practice',
            'requirementState', 'optional',
            'position', 2
          ),
          jsonb_build_object(
            'stableResourceKey', 'derived-not-assigned',
            'providerKey', 'ixl',
            'title', 'Hidden motion drill',
            'resourceKind', 'practice',
            'requirementState', 'not_assigned',
            'position', 3
          )
        )
      ),
      jsonb_build_object(
        'id', 'phase5e3-db-direct-session',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-forces',
        'sourceSessionId', 'builtin-session-direct-forces',
        'sourceContentVersionKey', 'track-session:direct-forces:v1',
        'difficulty', 'high',
        'title', 'Direct forces completion',
        'startDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
        'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
        'resources', jsonb_build_array(
          jsonb_build_object(
            'stableResourceKey', 'direct-required-a',
            'providerKey', 'openstax',
            'title', 'Required forces reading',
            'resourceKind', 'textbook',
            'requirementState', 'required',
            'position', 0
          ),
          jsonb_build_object(
            'stableResourceKey', 'direct-required-b',
            'providerKey', 'kelp',
            'title', 'Required forces practice',
            'resourceKind', 'practice',
            'requirementState', 'required',
            'position', 1
          ),
          jsonb_build_object(
            'stableResourceKey', 'direct-optional',
            'providerKey', 'kelp',
            'title', 'Optional forces extension',
            'resourceKind', 'reference',
            'requirementState', 'optional',
            'position', 2
          )
        )
      ),
      jsonb_build_object(
        'id', 'phase5e3-db-no-required-session',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-wrap',
        'sourceSessionId', 'builtin-session-no-required',
        'sourceContentVersionKey', 'track-session:no-required:v1',
        'difficulty', 'low',
        'title', 'Session without required resources',
        'startDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 14,
        'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 14,
        'resources', jsonb_build_array(
          jsonb_build_object(
            'stableResourceKey', 'no-required-optional',
            'providerKey', 'kelp',
            'title', 'Optional summary',
            'resourceKind', 'reference',
            'requirementState', 'optional',
            'position', 0
          )
        )
      )
    )
  ),
  'phase5e3-db-hierarchical-course'
) ->> 'id') as hierarchy_course_id \gset

select public.activate_student_course(:'hierarchy_course_id'::uuid);

select course.active_schedule_version_id as hierarchy_v1_id
from public.student_courses course
where course.id = :'hierarchy_course_id'::uuid \gset

select item.id as derived_item_id
from public.course_schedule_items item
where item.version_id = :'hierarchy_v1_id'::uuid
  and item.stable_item_key = 'phase5e3-db-derived-session' \gset

select item.id as direct_item_id
from public.course_schedule_items item
where item.version_id = :'hierarchy_v1_id'::uuid
  and item.stable_item_key = 'phase5e3-db-direct-session' \gset

select item.id as no_required_item_id
from public.course_schedule_items item
where item.version_id = :'hierarchy_v1_id'::uuid
  and item.stable_item_key = 'phase5e3-db-no-required-session' \gset

select resource.id as derived_required_a_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'derived_item_id'::uuid
  and resource.stable_resource_key = 'derived-required-a' \gset

select resource.id as derived_required_b_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'derived_item_id'::uuid
  and resource.stable_resource_key = 'derived-required-b' \gset

select resource.id as derived_optional_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'derived_item_id'::uuid
  and resource.stable_resource_key = 'derived-optional' \gset

select resource.id as direct_required_a_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'direct_item_id'::uuid
  and resource.stable_resource_key = 'direct-required-a' \gset

select resource.id as direct_required_b_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'direct_item_id'::uuid
  and resource.stable_resource_key = 'direct-required-b' \gset

select resource.id as no_required_optional_id
from public.course_schedule_item_resources resource
where resource.schedule_item_id = :'no_required_item_id'::uuid
  and resource.stable_resource_key = 'no-required-optional' \gset

select classroom.id as hierarchy_classroom_id
from public.classrooms classroom
where classroom.course_id = :'hierarchy_course_id'::uuid \gset

reset role;
insert into public.classroom_memberships (
  classroom_id, user_id, membership_role, status
) values (
  :'hierarchy_classroom_id'::uuid,
  :'student_b_id'::uuid,
  'guardian',
  'active'
);

select set_config('test.hierarchy_course_id', :'hierarchy_course_id', false);
select set_config('test.hierarchy_v1_id', :'hierarchy_v1_id', false);
select set_config('test.derived_item_id', :'derived_item_id', false);
select set_config('test.direct_item_id', :'direct_item_id', false);
select set_config('test.no_required_item_id', :'no_required_item_id', false);
select set_config('test.derived_required_b_id', :'derived_required_b_id', false);
select set_config('test.direct_required_a_id', :'direct_required_a_id', false);
select set_config('test.direct_required_b_id', :'direct_required_b_id', false);

-- One required Studied resource and any optional work do not complete the
-- Session. Practiced completes independently when every required resource is
-- marked.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'derived_item_id'::uuid,
  :'derived_required_a_id'::uuid,
  'studied',
  null,
  null,
  p_reflection => 'The reading gave me a clear starting point for this topic.',
  p_student_explanation => null,
  p_private_staff_note => null,
  p_idempotency_key => 'phase5e3-db-derived-required-a'
) as derived_required_a_mark \gset

select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'derived_item_id'::uuid,
  :'derived_optional_id'::uuid,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-derived-optional'
) as derived_optional_mark \gset

select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'derived_item_id'::uuid,
  :'derived_required_a_id'::uuid,
  'practiced',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-derived-practiced-a'
) as derived_practiced_a \gset

select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'derived_item_id'::uuid,
  :'derived_required_b_id'::uuid,
  'practiced',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-derived-practiced-b'
) as derived_practiced_b \gset

do $partial_resources_do_not_aggregate$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-derived-session';

  if session #>> '{studied,state}' <> 'unmarked'
    or session #>> '{studied,requiredResourceCount}' <> '2'
    or session #>> '{studied,explicitStudiedRequiredResourceCount}' <> '1'
    or session #>> '{practiced,state}' <> 'marked'
    or session #>> '{practiced,source}' <> 'required_resources'
    or session #>> '{practiced,requiredResourceCount}' <> '2'
    or session #>> '{practiced,explicitPracticedRequiredResourceCount}' <> '2'
    or session #>> '{practiced,advancesAcademicPointer}' <> 'false'
    or exists (
      select 1 from jsonb_array_elements(session -> 'resources') resource
      where resource ->> 'requirementState' = 'not_assigned'
    ) then
    raise exception 'Studied or Practiced required-resource aggregation was projected incorrectly.';
  end if;
end;
$partial_resources_do_not_aggregate$;

-- The final required resource derives Session Studied and one durable
-- aggregate notification fact per Student/Tutor recipient.
select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'derived_item_id'::uuid,
  :'derived_required_b_id'::uuid,
  'studied',
  null,
  null,
  p_reflection => 'The video confirmed the model I built from the first reading.',
  p_student_explanation => null,
  p_private_staff_note => null,
  p_idempotency_key => 'phase5e3-db-derived-required-b'
) as derived_required_b_mark \gset

select set_config(
  'test.derived_required_b_event_id',
  :'derived_required_b_mark'::jsonb ->> 'eventId',
  false
);

-- The Student-facing projection still resolves through auth.uid(), while
-- raw append-only event/notification assertions remain owner-only.
reset role;
do $required_resources_derive_studied$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-derived-session';

  if payload #>> '{featureStatus,hierarchicalAggregation}' <> 'active_phase_5e3'
    or session #>> '{studied,state}' <> 'marked'
    or session #>> '{studied,source}' <> 'required_resources'
    or session #>> '{studied,directMarked}' <> 'false'
    or session #>> '{studied,derivedFromRequiredResources}' <> 'true'
    or session #>> '{studied,explicitStudiedRequiredResourceCount}' <> '2'
    or session #>> '{studied,advancesAcademicPointer}' <> 'true'
    or session #>> '{studied,effectiveAt}' is null then
    raise exception 'Required-resource completion did not derive the expected Session Studied state.';
  end if;

  if (
    select count(*)
    from public.course_progress_events event
    where event.course_id = current_setting('test.hierarchy_course_id')::uuid
      and event.stable_item_key = 'phase5e3-db-derived-session'
      and event.target_kind = 'session'
      and event.progress_kind = 'studied'
  ) <> 0 then
    raise exception 'Derived Session Studied fabricated a parent progress event.';
  end if;

  if (
    select count(*)
    from public.course_progress_notification_events notification
    where notification.progress_event_id
      = current_setting('test.derived_required_b_event_id')::uuid
      and notification.event_type = 'session_studied_derived'
  ) <> 2 then
    raise exception 'Derived Session Studied did not notify exactly the Student and Tutor.';
  end if;

  if exists (
    select 1
    from public.course_progress_notification_events notification
    where notification.progress_event_id
      = current_setting('test.derived_required_b_event_id')::uuid
      and notification.event_type = 'session_studied_derived'
      and notification.recipient_user_id = current_setting('test.mentor_id')::uuid
  ) then
    raise exception 'Routine derived progress unnecessarily notified the Mentor.';
  end if;
end;
$required_resources_derive_studied$;

-- Required-resource-derived Studied locks the Session just like an explicit
-- parent mark; a successor Version cannot drop it.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $derived_studied_structural_lock$
begin
  begin
    perform public.publish_course_schedule_version(
      current_setting('test.hierarchy_course_id')::uuid,
      current_setting('test.hierarchy_v1_id')::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'stableItemKey', 'phase5e3-db-derived-session',
          'title', 'Derived motion completion',
          'kind', 'curriculum_topic',
          'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
          'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date,
          'position', 0,
          'state', 'dropped'
        ),
        jsonb_build_object(
          'stableItemKey', 'phase5e3-db-direct-session',
          'title', 'Direct forces completion',
          'kind', 'curriculum_topic',
          'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
          'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 7,
          'position', 1,
          'state', 'scheduled'
        ),
        jsonb_build_object(
          'stableItemKey', 'phase5e3-db-no-required-session',
          'title', 'Session without required resources',
          'kind', 'curriculum_topic',
          'scheduledDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 14,
          'endDate', (clock_timestamp() at time zone 'America/Sao_Paulo')::date + 14,
          'position', 2,
          'state', 'scheduled'
        )
      ),
      jsonb_build_array(jsonb_build_object(
        'changeType', 'dropped',
        'stableItemKey', 'phase5e3-db-derived-session',
        'reasonCode', 'pacing_adjustment',
        'studentExplanation', 'This attempted drop must fail because required resources completed the Session.'
      )),
      'phase5e3-db-derived-studied-drop'
    );
    raise exception 'Expected the derived Studied Session drop to fail.';
  exception when others then
    if sqlerrm = 'Expected the derived Studied Session drop to fail.' then raise; end if;
    if sqlerrm not like '%Studied Schedule item%' then raise; end if;
  end;
end;
$derived_studied_structural_lock$;

-- A Student cannot correct Studied; academic staff can correct an explicit
-- resource mark with a public reason.
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_studied_resource_reversal_denied$
begin
  begin
    perform public.reverse_course_progress(
      current_setting('test.hierarchy_course_id')::uuid,
      current_setting('test.derived_item_id')::uuid,
      current_setting('test.derived_required_b_id')::uuid,
      'studied',
      current_setting('test.derived_required_b_event_id')::uuid,
      null,
      null,
      null,
      'phase5e3-db-student-resource-reverse'
    );
    raise exception 'Expected the Student Studied resource reversal to fail.';
  exception when others then
    if sqlerrm = 'Expected the Student Studied resource reversal to fail.' then raise; end if;
    if sqlerrm not like '%ask their Tutor%' then raise; end if;
  end;
end;
$student_studied_resource_reversal_denied$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.reverse_course_progress(
  :'hierarchy_course_id'::uuid,
  :'derived_item_id'::uuid,
  :'derived_required_b_id'::uuid,
  'studied',
  (:'derived_required_b_mark'::jsonb ->> 'eventId')::uuid,
  null,
  'The required lesson was marked accidentally and needs to be completed again.',
  'Tutor corrected the learner resource record after reviewing the request.',
  'phase5e3-db-tutor-resource-reverse'
) as derived_required_b_reversal \gset

select set_config(
  'test.derived_required_b_reversal_id',
  :'derived_required_b_reversal'::jsonb ->> 'eventId',
  false
);

-- Notification-table cardinality is an owner-only audit assertion.
reset role;
do $resource_correction_reverses_derived_state$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-derived-session';

  if session #>> '{studied,state}' <> 'unmarked'
    or session #>> '{studied,explicitStudiedRequiredResourceCount}' <> '1' then
    raise exception 'A governed required-resource correction did not remove derived Session completion.';
  end if;

  if (
    select count(*)
    from public.course_progress_notification_events notification
    where notification.progress_event_id
      = current_setting('test.derived_required_b_reversal_id')::uuid
      and notification.event_type = 'session_studied_derived_reversed'
  ) <> 2 then
    raise exception 'A derived Session reversal did not notify exactly the Student and Tutor.';
  end if;
end;
$resource_correction_reverses_derived_state$;

-- Direct Session Studied gives assigned resources inherited presentation
-- without creating child events. Explicit child work takes precedence.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'direct_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  p_reflection => 'I completed this topic as a whole and am ready to move forward.',
  p_student_explanation => null,
  p_private_staff_note => null,
  p_idempotency_key => 'phase5e3-db-direct-session-mark'
) as direct_session_mark \gset

-- The read projection remains Student-scoped through auth.uid(); only the
-- no-fabricated-event assertion needs owner access to the raw ledger.
reset role;
do $direct_session_inheritance$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-direct-session';

  if session #>> '{studied,state}' <> 'marked'
    or session #>> '{studied,source}' <> 'direct_session'
    or (
      select count(*)
      from jsonb_array_elements(session -> 'resources') resource
      where resource #>> '{studied,state}' = 'marked'
        and resource #>> '{studied,source}' = 'inherited_session'
    ) <> 3 then
    raise exception 'A direct Session Studied mark did not produce assigned-resource inheritance.';
  end if;

  if exists (
    select 1
    from public.course_progress_events event
    where event.course_id = current_setting('test.hierarchy_course_id')::uuid
      and event.stable_item_key = 'phase5e3-db-direct-session'
      and event.target_kind = 'resource'
  ) then
    raise exception 'Direct Session inheritance fabricated resource progress events.';
  end if;
end;
$direct_session_inheritance$;

set local role authenticated;
select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'direct_item_id'::uuid,
  :'direct_required_a_id'::uuid,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-direct-required-a'
) as direct_required_a_mark \gset
select set_config(
  'test.direct_required_a_event_id',
  :'direct_required_a_mark'::jsonb ->> 'eventId',
  false
);

select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'direct_item_id'::uuid,
  :'direct_required_b_id'::uuid,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-direct-required-b'
) as direct_required_b_mark \gset
select set_config(
  'test.direct_required_b_event_id',
  :'direct_required_b_mark'::jsonb ->> 'eventId',
  false
);

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $parent_first_correction$
begin
  begin
    perform public.reverse_course_progress(
      current_setting('test.hierarchy_course_id')::uuid,
      current_setting('test.direct_item_id')::uuid,
      current_setting('test.direct_required_a_id')::uuid,
      'studied',
      current_setting('test.direct_required_a_event_id')::uuid,
      null,
      'This resource needs correction after the parent completion is removed.',
      null,
      'phase5e3-db-parent-first-guard'
    );
    raise exception 'Expected the inherited resource correction to require parent reversal first.';
  exception when others then
    if sqlerrm = 'Expected the inherited resource correction to require parent reversal first.' then raise; end if;
    if sqlerrm not like '%Session-level Studied mark%' then raise; end if;
  end;
end;
$parent_first_correction$;

reset role;
update public.student_courses
set status = 'wind_down'
where id = :'hierarchy_course_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.reverse_course_progress(
  :'hierarchy_course_id'::uuid,
  :'direct_item_id'::uuid,
  null,
  'studied',
  (:'direct_session_mark'::jsonb ->> 'eventId')::uuid,
  null,
  'The direct Session completion was removed so the explicit resources remain authoritative.',
  null,
  'phase5e3-db-direct-parent-reverse'
) as direct_parent_reversal \gset
select set_config(
  'test.direct_parent_course_reopened',
  :'direct_parent_reversal'::jsonb ->> 'courseReopened',
  false
);

do $parent_reversal_preserves_explicit_children$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-direct-session';

  if session #>> '{studied,state}' <> 'marked'
    or session #>> '{studied,source}' <> 'required_resources'
    or session #>> '{studied,directMarked}' <> 'false'
    or session #>> '{studied,explicitStudiedRequiredResourceCount}' <> '2'
    or current_setting('test.direct_parent_course_reopened')::boolean
    or not exists (
      select 1
      from public.student_courses course
      where course.id = current_setting('test.hierarchy_course_id')::uuid
        and course.status = 'wind_down'
    )
    or exists (
      select 1 from jsonb_array_elements(session -> 'resources') resource
      where resource ->> 'stableResourceKey' = 'direct-optional'
        and resource #>> '{studied,state}' <> 'unmarked'
    ) then
    raise exception 'Parent reversal did not preserve explicit children and remove only inherited state.';
  end if;
end;
$parent_reversal_preserves_explicit_children$;

-- With the parent removed, a staff resource correction is accepted. It makes
-- the derived Session incomplete and reopens wind-down.
select public.reverse_course_progress(
  :'hierarchy_course_id'::uuid,
  :'direct_item_id'::uuid,
  :'direct_required_b_id'::uuid,
  'studied',
  (:'direct_required_b_mark'::jsonb ->> 'eventId')::uuid,
  null,
  'The second required resource still needs work before this Session is complete.',
  null,
  'phase5e3-db-direct-required-b-reverse'
) as direct_required_b_reversal \gset
select set_config(
  'test.direct_required_b_course_reopened',
  :'direct_required_b_reversal'::jsonb ->> 'courseReopened',
  false
);

do $resource_correction_reopens_winddown$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-direct-session';

  if session #>> '{studied,state}' <> 'unmarked'
    or not current_setting('test.direct_required_b_course_reopened')::boolean
    or not exists (
      select 1
      from public.student_courses course
      where course.id = current_setting('test.hierarchy_course_id')::uuid
        and course.status = 'active'
    ) then
    raise exception 'A correction that made the Session incomplete did not reopen wind-down.';
  end if;
end;
$resource_correction_reopens_winddown$;

-- Optional-only Sessions do not derive Studied. A direct Session Practiced
-- mark is inherited by its assigned resources and never advances the academic
-- pointer.
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'no_required_item_id'::uuid,
  :'no_required_optional_id'::uuid,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-no-required-optional-studied'
);

select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'no_required_item_id'::uuid,
  null,
  'practiced',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-no-required-session-practiced'
);

do $no_required_and_practice_contract$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-no-required-session';

  if session #>> '{studied,state}' <> 'unmarked'
    or session #>> '{studied,requiredResourceCount}' <> '0'
    or session #>> '{practiced,state}' <> 'marked'
    or session #>> '{practiced,source}' <> 'direct_session'
    or session #>> '{practiced,advancesAcademicPointer}' <> 'false'
    or not exists (
      select 1 from jsonb_array_elements(session -> 'resources') resource
      where resource ->> 'stableResourceKey' = 'no-required-optional'
        and resource #>> '{practiced,state}' = 'marked'
        and resource #>> '{practiced,source}' = 'inherited_session'
    ) then
    raise exception 'Optional-only or direct Practiced progress violated the hierarchy contract.';
  end if;
end;
$no_required_and_practice_contract$;

select public.record_course_progress(
  :'hierarchy_course_id'::uuid,
  :'no_required_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5e3-db-no-required-direct-studied'
);

do $no_required_direct_completion$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-no-required-session';

  if session #>> '{studied,source}' <> 'direct_session'
    or session #>> '{studied,marked}' <> 'true' then
    raise exception 'A no-required-resource Session could not be completed directly.';
  end if;
end;
$no_required_direct_completion$;

-- Authorized staff retain not-assigned source visibility, while Guardians and
-- outsiders remain outside the lesson-level progress projection.
select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $staff_not_assigned_visibility$
declare
  payload jsonb := public.get_my_course_progress(
    current_setting('test.hierarchy_course_id')::uuid
  );
  session jsonb;
begin
  select value into session
  from jsonb_array_elements(payload -> 'sessionAggregates')
  where value ->> 'stableItemKey' = 'phase5e3-db-derived-session';

  if not exists (
    select 1 from jsonb_array_elements(session -> 'resources') resource
    where resource ->> 'stableResourceKey' = 'derived-not-assigned'
      and resource ->> 'requirementState' = 'not_assigned'
      and resource #>> '{studied,state}' = 'unmarked'
  ) then
    raise exception 'Authorized academic staff lost the not-assigned audit resource.';
  end if;
end;
$staff_not_assigned_visibility$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $guardian_progress_denied$
begin
  begin
    perform public.get_my_course_progress(
      current_setting('test.hierarchy_course_id')::uuid
    );
    raise exception 'Expected Guardian hierarchical progress access to fail.';
  exception when others then
    if sqlerrm = 'Expected Guardian hierarchical progress access to fail.' then raise; end if;
    if sqlerrm not like '%private to the Student and assigned academic staff%' then raise; end if;
  end;
end;
$guardian_progress_denied$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_progress_denied$
begin
  begin
    perform public.get_my_course_progress(
      current_setting('test.hierarchy_course_id')::uuid
    );
    raise exception 'Expected outsider hierarchical progress access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider hierarchical progress access to fail.' then raise; end if;
    if sqlerrm not like '%private to the Student and assigned academic staff%' then raise; end if;
  end;
end;
$outsider_progress_denied$;

rollback;
