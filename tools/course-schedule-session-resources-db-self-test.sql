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
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

begin;
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.E.1 resource Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 2,
    'id', 'phase5e1-db-schedule-v1',
    'name', 'Phase 5.E.1 Mechanics Schedule',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5e1-db-motion',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-kinematics',
        'sourceSessionId', 'builtin-session-motion',
        'sourceContentVersionKey', 'track-session:motion:v1',
        'planningHref', '../schedules/mechanics/motion.html',
        'difficulty', 'low',
        'title', 'Motion foundations',
        'startDate', current_date + 10,
        'endDate', current_date + 10,
        'resources', jsonb_build_array(
          jsonb_build_object(
            'stableResourceKey', 'motion-openstax',
            'providerKey', 'openstax',
            'title', 'OpenStax motion reading',
            'resourceKind', 'textbook',
            'href', 'https://openstax.org/',
            'requirementState', 'required',
            'sourceContentVersionKey', 'resource:motion-openstax:v1',
            'position', 0
          ),
          jsonb_build_object(
            'stableResourceKey', 'motion-khan',
            'providerKey', 'khan-academy',
            'title', 'Khan Academy motion review',
            'resourceKind', 'video',
            'href', 'https://www.khanacademy.org/',
            'requirementState', 'optional',
            'position', 1
          ),
          jsonb_build_object(
            'stableResourceKey', 'motion-ixl',
            'providerKey', 'ixl',
            'title', 'IXL motion practice',
            'resourceKind', 'practice',
            'href', 'https://www.ixl.com/',
            'requirementState', 'not_assigned',
            'position', 2
          )
        )
      ),
      jsonb_build_object(
        'id', 'phase5e1-db-forces',
        'sourceTrackKey', 'builtin-track-mechanics',
        'sourceModuleKey', 'builtin-module-forces',
        'sourceSessionId', 'builtin-session-forces',
        'sourceContentVersionKey', 'track-session:forces:v1',
        'planningHref', '../schedules/mechanics/forces.html',
        'difficulty', 'high',
        'title', 'Forces and interactions',
        'startDate', current_date + 20,
        'endDate', current_date + 20,
        'resources', '[]'::jsonb
      )
    )
  ),
  'phase5e1-db-resource-course'
) ->> 'id') as resource_course_id \gset
select public.activate_student_course(:'resource_course_id'::uuid);
select active_schedule_version_id as resource_v1_id
from public.student_courses where id = :'resource_course_id'::uuid \gset
select set_config('test.resource_course_id', :'resource_course_id', false);
select set_config('test.resource_v1_id', :'resource_v1_id', false);

-- The Student sees only assigned resources and normalized source metadata.
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_projection$
declare
  payload jsonb := public.get_my_course_schedule_sources(
    current_setting('test.resource_course_id')::uuid
  );
begin
  if payload #>> '{featureStatus,sessionResourceIdentity}' <> 'active_phase_5e1'
    or payload #>> '{sessions,0,source,sessionKey}' <> 'builtin-session-motion'
    or payload #>> '{sessions,0,source,contentVersionKey}' <> 'track-session:motion:v1'
    or payload #>> '{sessions,0,difficultyLevel}' <> 'easy'
    or payload #>> '{sessions,1,difficultyLevel}' <> 'difficult'
    or jsonb_array_length(payload #> '{sessions,0,resources}') <> 2
    or exists (
      select 1 from jsonb_array_elements(payload #> '{sessions,0,resources}') resource
      where resource ->> 'requirementState' = 'not_assigned'
    ) then
    raise exception 'The Student Session/resource projection is invalid.';
  end if;

  if (select count(*) from public.course_schedule_item_resources) <> 2
    or exists (
      select 1 from public.course_schedule_item_resources
      where requirement_state = 'not_assigned'
    ) then
    raise exception 'Student RLS exposed a not-assigned Session resource.';
  end if;
end;
$student_projection$;

-- The supervising Mentor can audit all three personalized resource states.
select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $mentor_projection$
declare
  payload jsonb := public.get_my_course_schedule_sources(
    current_setting('test.resource_course_id')::uuid
  );
begin
  if payload #>> '{permissions,canReadUnassignedResources}' <> 'true'
    or jsonb_array_length(payload #> '{sessions,0,resources}') <> 3
    or not exists (
      select 1 from jsonb_array_elements(payload #> '{sessions,0,resources}') resource
      where resource ->> 'stableResourceKey' = 'motion-ixl'
        and resource ->> 'requirementState' = 'not_assigned'
    ) then
    raise exception 'The Mentor did not receive the complete resource snapshot.';
  end if;
end;
$mentor_projection$;

-- A later structural Version inherits unchanged Track/resource identity even
-- when its structural payload contains only the Phase 5.D fields.
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_schedule_version(
  :'resource_course_id'::uuid,
  :'resource_v1_id'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5e1-db-forces',
      'title', 'Forces and interactions',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 10,
      'endDate', current_date + 10,
      'position', 0,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5e1-db-motion',
      'title', 'Motion foundations',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 20,
      'endDate', current_date + 20,
      'position', 1,
      'state', 'scheduled'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'reordered',
    'stableItemKey', 'phase5e1-db-motion',
    'reasonCode', 'pacing_adjustment',
    'studentExplanation', 'The next two topics were reordered to match the learner pace.'
  )),
  'phase5e1-db-resource-v2'
);

reset role;
do $inherited_snapshot$
begin
  if not exists (
    select 1
    from public.student_courses course
    join public.course_schedule_items item
      on item.version_id = course.active_schedule_version_id
     and item.stable_item_key = 'phase5e1-db-motion'
    where course.id = current_setting('test.resource_course_id')::uuid
      and item.source_session_key = 'builtin-session-motion'
      and item.source_content_version_key = 'track-session:motion:v1'
      and item.difficulty_level = 'easy'
      and (
        select count(*) from public.course_schedule_item_resources resource
        where resource.schedule_item_id = item.id
      ) = 3
  ) then
    raise exception 'A successor Schedule Version lost its inherited Session/resource snapshot.';
  end if;
end;
$inherited_snapshot$;

-- Outsiders receive neither the RPC projection nor direct resource rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_denied$
begin
  begin
    perform public.get_my_course_schedule_sources(
      current_setting('test.resource_course_id')::uuid
    );
    raise exception 'Expected outsider Session source access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider Session source access to fail.' then raise; end if;
    if sqlerrm not like '%do not have access%' then raise; end if;
  end;

  if exists (select 1 from public.course_schedule_item_resources) then
    raise exception 'Outsider RLS exposed Course Session resources.';
  end if;
end;
$outsider_denied$;

-- Resource snapshots are part of immutable Schedule history.
reset role;
do $resource_history_immutable$
begin
  begin
    update public.course_schedule_item_resources
    set title = 'Forbidden resource rewrite'
    where stable_resource_key = 'motion-openstax';
    raise exception 'Expected immutable resource history to reject an update.';
  exception when others then
    if sqlerrm = 'Expected immutable resource history to reject an update.' then raise; end if;
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
end;
$resource_history_immutable$;

rollback;
