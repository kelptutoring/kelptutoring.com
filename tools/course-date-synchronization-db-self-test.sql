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

begin;
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

-- Compatibility helper for this earlier Phase 5.C characterization. Current
-- migrations intentionally close distinct writes through the old mirror RPC,
-- so the test expresses its revisions through Phase 5.D's governed publisher.
create or replace function pg_temp.publish_phase5c_schedule(
  p_course_id uuid,
  p_schedule jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  expected_version_id uuid;
  active_version_id uuid;
  proposed_items jsonb := '[]'::jsonb;
  reasons jsonb := '[]'::jsonb;
  sessions jsonb := coalesce(p_schedule -> 'sessions', '[]'::jsonb);
  raw_session jsonb;
  ordinal bigint;
  old_item public.course_schedule_items%rowtype;
  changed_key text;
  session_key text;
  session_date date;
  session_end date;
  appended_position integer;
begin
  select active_schedule_version_id into expected_version_id
  from public.student_courses where id = p_course_id;
  active_version_id := expected_version_id;

  for raw_session, ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(sessions) with ordinality item(value, ordinality)
  loop
    session_key := btrim(raw_session ->> 'id');
    session_date := nullif(coalesce(raw_session ->> 'startDate', raw_session ->> 'date'), '')::date;
    session_end := coalesce(nullif(raw_session ->> 'endDate', '')::date, session_date);
    select * into old_item
    from public.course_schedule_items item
    where item.version_id = active_version_id and item.stable_item_key = session_key;

    proposed_items := proposed_items || jsonb_build_array(jsonb_build_object(
      'stableItemKey', session_key,
      'title', btrim(raw_session ->> 'title'),
      'kind', coalesce(old_item.item_kind, 'curriculum_topic'),
      'curriculumNodeId', old_item.curriculum_node_id,
      'scheduledDate', session_date,
      'endDate', session_end,
      'position', ordinal::integer - 1,
      'state', case when old_item.item_state = 'requeued' then 'requeued' else 'scheduled' end
    ));

    if not found then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'changeType', 'included', 'stableItemKey', session_key,
        'reasonCode', 'curriculum_adjustment',
        'studentExplanation', 'This rollback characterization includes a future Schedule item.'
      ));
    elsif old_item.scheduled_date <> session_date
      or old_item.end_date <> session_end
      or old_item.position <> ordinal::integer - 1 then
      changed_key := coalesce(changed_key, session_key);
    end if;
  end loop;

  for old_item in
    select item.*
    from public.course_schedule_items item
    where item.version_id = active_version_id
      and not exists (
        select 1 from jsonb_array_elements(sessions) proposed
        where proposed ->> 'id' = item.stable_item_key
      )
    order by item.position, item.id
  loop
    appended_position := jsonb_array_length(proposed_items);
    proposed_items := proposed_items || jsonb_build_array(jsonb_build_object(
      'stableItemKey', old_item.stable_item_key,
      'title', old_item.title,
      'kind', old_item.item_kind,
      'curriculumNodeId', old_item.curriculum_node_id,
      'scheduledDate', old_item.scheduled_date,
      'endDate', old_item.end_date,
      'position', appended_position,
      'state', 'dropped'
    ));
    if old_item.item_state in ('scheduled', 'requeued') then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'changeType', 'dropped', 'stableItemKey', old_item.stable_item_key,
        'reasonCode', 'curriculum_adjustment',
        'studentExplanation', 'This rollback characterization drops a future Schedule item.'
      ));
    end if;
  end loop;

  if jsonb_array_length(reasons) = 0 and changed_key is not null then
    reasons := jsonb_build_array(jsonb_build_object(
      'changeType', 'reordered', 'stableItemKey', changed_key,
      'reasonCode', 'pacing_adjustment',
      'studentExplanation', 'This rollback characterization adjusts the future Course timing.'
    ));
  end if;

  return public.publish_course_schedule_version(
    p_course_id, expected_version_id, proposed_items, reasons, p_idempotency_key
  );
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

-- Draft version 1 is created atomically and derives both Course edges.
select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.C synchronized Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5c-db-schedule-v1',
    'name', 'Phase 5.C Schedule version 1',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5c-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 10,
        'endDate', current_date + 10
      ),
      jsonb_build_object(
        'id', 'phase5c-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 20,
        'endDate', current_date + 20
      )
    )
  ),
  'phase5c-db-course-sync'
) ->> 'id') as synchronized_course_id \gset
select set_config('test.synchronized_course_id', :'synchronized_course_id', false);

do $draft_version_one$
declare
  projection jsonb := public.get_my_course_schedule(
    current_setting('test.synchronized_course_id')::uuid
  );
begin
  if projection #>> '{course,startDate}' <> (current_date + 10)::text
    or projection #>> '{course,scheduledEndDate}' <> (current_date + 20)::text
    or projection #>> '{course,activatedStartDate}' is not null
    or projection #>> '{course,startDateLocked}' <> 'false'
    or projection #>> '{activeVersion,dateRange,firstDate}' <> (current_date + 10)::text
    or projection #>> '{activeVersion,dateRange,lastDate}' <> (current_date + 20)::text
    or projection #>> '{activeVersion,dateRange,effectiveItemCount}' <> '2'
    or projection #>> '{featureStatus,courseDateSynchronization}' <> 'active_phase_5c' then
    raise exception 'Draft version 1 did not derive the complete Phase 5.C Course range.';
  end if;
end;
$draft_version_one$;

-- A draft is still fluid: activating a revised version moves both boundaries.
select pg_temp.publish_phase5c_schedule(
  :'synchronized_course_id'::uuid,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5c-db-schedule-v2',
    'name', 'Phase 5.C Schedule version 2',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5c-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 5,
        'endDate', current_date + 5
      ),
      jsonb_build_object(
        'id', 'phase5c-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 30,
        'endDate', current_date + 30
      )
    )
  ),
  'phase5c-db-draft-revision-v2'
);

do $draft_revision$
begin
  if not exists (
    select 1 from public.student_courses
    where id = current_setting('test.synchronized_course_id')::uuid
      and status = 'draft'
      and start_date = current_date + 5
      and scheduled_end_date = current_date + 30
      and activated_start_date is null
  ) then
    raise exception 'A draft Course did not follow both edges of its revised Schedule.';
  end if;
end;
$draft_revision$;

select public.activate_student_course(:'synchronized_course_id'::uuid);

do $activation_lock$
begin
  if not exists (
    select 1 from public.student_courses
    where id = current_setting('test.synchronized_course_id')::uuid
      and status = 'active'
      and start_date = current_date + 5
      and activated_start_date = current_date + 5
      and scheduled_end_date = current_date + 30
  ) then
    raise exception 'Course activation did not establish the permanent Schedule start lock.';
  end if;
end;
$activation_lock$;

-- Extending the active Schedule changes only the Course endpoint.
select pg_temp.publish_phase5c_schedule(
  :'synchronized_course_id'::uuid,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5c-db-schedule-v3',
    'name', 'Phase 5.C Schedule version 3 extended',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5c-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 5,
        'endDate', current_date + 5
      ),
      jsonb_build_object(
        'id', 'phase5c-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 45,
        'endDate', current_date + 45
      )
    )
  ),
  'phase5c-db-active-extension-v3'
);

do $active_extension$
declare
  projection jsonb := public.get_my_course_schedule(
    current_setting('test.synchronized_course_id')::uuid
  );
begin
  if projection #>> '{course,startDate}' <> (current_date + 5)::text
    or projection #>> '{course,activatedStartDate}' <> (current_date + 5)::text
    or projection #>> '{course,scheduledEndDate}' <> (current_date + 45)::text
    or projection #>> '{course,windDownEndsOn}' <> (current_date + 59)::text
    or projection #>> '{activeVersion,dateRange,lastDate}' <> (current_date + 45)::text
    or projection #>> '{schedule,versionCount}' <> '3' then
    raise exception 'Extending an active Schedule did not synchronize the Course endpoint.';
  end if;
end;
$active_extension$;

-- Removing the final future item in a later immutable version shortens the
-- Course without changing its locked historical start.
select pg_temp.publish_phase5c_schedule(
  :'synchronized_course_id'::uuid,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5c-db-schedule-v4',
    'name', 'Phase 5.C Schedule version 4 shortened',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5c-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 5,
        'endDate', current_date + 5
      ),
      jsonb_build_object(
        'id', 'phase5c-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 25,
        'endDate', current_date + 25
      )
    )
  ),
  'phase5c-db-active-shortening-v4'
);

do $active_shortening_and_history$
begin
  if not exists (
      select 1 from public.student_courses
      where id = current_setting('test.synchronized_course_id')::uuid
        and start_date = current_date + 5
        and activated_start_date = current_date + 5
        and scheduled_end_date = current_date + 25
    )
    or (
      select count(*)
      from public.course_schedule_versions version
      join public.course_schedules schedule on schedule.id = version.schedule_id
      where schedule.course_id = current_setting('test.synchronized_course_id')::uuid
    ) <> 4
    or not exists (
      select 1
      from public.course_schedule_versions version
      join public.course_schedules schedule on schedule.id = version.schedule_id
      join public.course_schedule_items item on item.version_id = version.id
      where schedule.course_id = current_setting('test.synchronized_course_id')::uuid
        and version.version_number = 3
        and item.scheduled_date = current_date + 45
    ) then
    raise exception 'Shortening an active Schedule changed its start or lost immutable history.';
  end if;
end;
$active_shortening_and_history$;

-- A pre-Phase 5.C Course may have locked a start after the first retained
-- Schedule row. A successor may preserve that exact legacy row for audit, but
-- the Course start remains locked and no newly backdated item becomes valid.
reset role;
set constraints
  student_courses_require_schedule,
  student_courses_active_schedule_version_fkey
immediate;
alter table public.student_courses
  disable trigger synchronize_student_course_schedule_dates;
update public.student_courses
set start_date = current_date + 6,
    activated_start_date = current_date + 6
where id = current_setting('test.synchronized_course_id')::uuid;
alter table public.student_courses
  enable trigger synchronize_student_course_schedule_dates;
set constraints
  student_courses_require_schedule,
  student_courses_active_schedule_version_fkey
deferred;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select pg_temp.publish_phase5c_schedule(
  :'synchronized_course_id'::uuid,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5c-db-schedule-v5-retained-history',
    'name', 'Phase 5.C retained pre-activation history',
    'timeZone', 'America/Sao_Paulo',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5c-db-motion',
        'title', 'Motion foundations',
        'startDate', current_date + 5,
        'endDate', current_date + 5
      ),
      jsonb_build_object(
        'id', 'phase5c-db-forces',
        'title', 'Forces and interactions',
        'startDate', current_date + 30,
        'endDate', current_date + 30
      )
    )
  ),
  'phase5c-db-retained-pre-activation-v5'
);

do $retained_pre_activation_history$
begin
  if not exists (
      select 1
      from public.student_courses course
      join public.course_schedule_items item
        on item.version_id = course.active_schedule_version_id
      where course.id = current_setting('test.synchronized_course_id')::uuid
        and course.start_date = current_date + 6
        and course.activated_start_date = current_date + 6
        and course.scheduled_end_date = current_date + 30
        and item.stable_item_key = 'phase5c-db-motion'
        and item.scheduled_date = current_date + 5
        and item.item_state = 'scheduled'
    ) then
    raise exception 'An unchanged pre-activation legacy row was not retained without moving the Course start.';
  end if;
end;
$retained_pre_activation_history$;

-- A later version may not rewrite history before the activated start.
do $backdated_revision_rejected$
begin
  begin
    perform pg_temp.publish_phase5c_schedule(
      current_setting('test.synchronized_course_id')::uuid,
      jsonb_build_object(
        'schemaVersion', 1,
        'id', 'phase5c-db-schedule-backdated',
        'name', 'Phase 5.C forbidden backdated Schedule',
        'timeZone', 'America/Sao_Paulo',
        'sessions', jsonb_build_array(
          jsonb_build_object(
            'id', 'phase5c-db-backdated',
            'title', 'Forbidden historical rewrite',
            'startDate', current_date + 4,
            'endDate', current_date + 25
          )
        )
      ),
      'phase5c-db-backdated-rejected'
    );
    raise exception 'Expected a backdated active Schedule revision to fail.';
  exception when others then
    if sqlerrm = 'Expected a backdated active Schedule revision to fail.' then raise; end if;
    if sqlerrm not like '%locked start date%' then raise; end if;
  end;
end;
$backdated_revision_rejected$;

-- Effective ranges count scheduled and requeued items, but never dropped ones.
reset role;
do $empty_effective_version_rejected$
declare
  schedule_id uuid;
  active_version_id uuid;
  forbidden_version_id uuid;
  next_version integer;
begin
  select schedule.id, course.active_schedule_version_id,
         max(version.version_number) + 1
  into schedule_id, active_version_id, next_version
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions version on version.schedule_id = schedule.id
  where course.id = current_setting('test.synchronized_course_id')::uuid
  group by schedule.id, course.active_schedule_version_id;

  begin
    insert into public.course_schedule_versions (
      schedule_id, version_number, previous_version_id, name, time_zone,
      source_snapshot, reason, created_by
    ) values (
      schedule_id, next_version, active_version_id,
      'Phase 5.C dropped-only version', 'America/Sao_Paulo', '{}'::jsonb,
      'Phase 5.C rejection characterization',
      current_setting('test.mentor_id')::uuid
    ) returning id into forbidden_version_id;

    insert into public.course_schedule_items (
      version_id, stable_item_key, title, scheduled_date, end_date,
      position, item_state, source_snapshot
    ) values (
      forbidden_version_id, 'phase5c-db-dropped-only', 'Dropped item',
      current_date + 30, current_date + 30, 0, 'dropped', '{}'::jsonb
    );

    update public.student_courses
    set active_schedule_version_id = forbidden_version_id
    where id = current_setting('test.synchronized_course_id')::uuid;
    raise exception 'Expected a dropped-only active Schedule Version to fail.';
  exception when others then
    if sqlerrm = 'Expected a dropped-only active Schedule Version to fail.' then raise; end if;
    if sqlerrm not like '%scheduled or requeued item%' then raise; end if;
  end;
end;
$empty_effective_version_rejected$;

-- The invariant also protects against direct Course date writes by restoring
-- the active Version projection in the same transaction.
update public.student_courses
set start_date = current_date + 12,
    scheduled_end_date = current_date + 80
where id = current_setting('test.synchronized_course_id')::uuid;

do $manual_date_write_normalized$
begin
  if not exists (
    select 1 from public.student_courses
    where id = current_setting('test.synchronized_course_id')::uuid
      and start_date = current_date + 6
      and scheduled_end_date = current_date + 30
  ) then
    raise exception 'A direct Course date write bypassed Schedule authority.';
  end if;
end;
$manual_date_write_normalized$;

-- A valid extension during wind-down reopens the Course and restarts the
-- generated 14-day wind-down endpoint.
update public.student_courses
set status = 'wind_down'
where id = current_setting('test.synchronized_course_id')::uuid;

do $exceptional_wind_down_version$
declare
  schedule_id uuid;
  active_version_id uuid;
  legacy_schedule_id uuid;
  extended_version_id uuid;
  next_version integer;
begin
  select schedule.id, course.active_schedule_version_id,
         active_version.legacy_schedule_id, max(version.version_number) + 1
  into schedule_id, active_version_id, legacy_schedule_id, next_version
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions active_version
    on active_version.id = course.active_schedule_version_id
  join public.course_schedule_versions version on version.schedule_id = schedule.id
  where course.id = current_setting('test.synchronized_course_id')::uuid
  group by schedule.id, course.active_schedule_version_id, active_version.legacy_schedule_id;

  insert into public.course_schedule_versions (
    schedule_id, version_number, previous_version_id, legacy_schedule_id,
    name, time_zone, source_snapshot, reason, created_by, metadata
  ) values (
    schedule_id, next_version, active_version_id, legacy_schedule_id,
    'Phase 5.C exceptional wind-down extension', 'America/Sao_Paulo',
    '{}'::jsonb, 'Phase 5.C central-invariant characterization',
    current_setting('test.mentor_id')::uuid,
    jsonb_build_object('exceptionalTestPath', true)
  ) returning id into extended_version_id;

  insert into public.course_schedule_items (
    version_id, stable_item_key, title, scheduled_date, end_date,
    position, item_state, source_snapshot, item_kind
  ) values
    (
      extended_version_id, 'phase5c-db-motion', 'Motion foundations',
      current_date + 5, current_date + 5, 0, 'scheduled', '{}'::jsonb,
      'curriculum_topic'
    ),
    (
      extended_version_id, 'phase5c-db-extension', 'Extended Course review',
      current_date + 60, current_date + 60, 1, 'scheduled', '{}'::jsonb,
      'review'
    );

  update public.student_courses
  set active_schedule_version_id = extended_version_id
  where id = current_setting('test.synchronized_course_id')::uuid;
end;
$exceptional_wind_down_version$;

do $wind_down_extension$
begin
  if not exists (
    select 1 from public.student_courses
    where id = current_setting('test.synchronized_course_id')::uuid
      and status = 'active'
      and start_date = current_date + 6
      and scheduled_end_date = current_date + 60
      and wind_down_ends_on = current_date + 74
  ) then
    raise exception 'A valid wind-down extension did not reopen and resynchronize the Course.';
  end if;
end;
$wind_down_extension$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

-- A draft may be designed from retained dates, but it cannot activate when its
-- entire authoritative Schedule has already elapsed.
select (public.create_student_course_with_schedule_draft(
  :'student_b_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.C elapsed draft',
  'kelp',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5c-db-elapsed-draft',
    'name', 'Phase 5.C elapsed draft Schedule',
    'timeZone', 'UTC',
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', 'phase5c-db-elapsed-item',
      'title', 'Elapsed review',
      'startDate', current_date - 30,
      'endDate', current_date - 10
    ))
  ),
  'phase5c-db-elapsed-course'
) ->> 'id') as elapsed_course_id \gset
select set_config('test.elapsed_course_id', :'elapsed_course_id', false);

do $elapsed_activation_rejected$
begin
  begin
    perform public.activate_student_course(current_setting('test.elapsed_course_id')::uuid);
    raise exception 'Expected an elapsed Schedule activation to fail.';
  exception when others then
    if sqlerrm = 'Expected an elapsed Schedule activation to fail.' then raise; end if;
    if sqlerrm not like '%ends in the past%' then raise; end if;
  end;
end;
$elapsed_activation_rejected$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_denial$
begin
  begin
    perform public.get_my_course_schedule(
      current_setting('test.synchronized_course_id')::uuid
    );
    raise exception 'Expected outsider synchronized Course Schedule access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider synchronized Course Schedule access to fail.' then raise; end if;
    if sqlerrm not like '%do not have access%' then raise; end if;
  end;
end;
$outsider_denial$;

rollback;
select 'passed' as course_date_synchronization_characterization;
