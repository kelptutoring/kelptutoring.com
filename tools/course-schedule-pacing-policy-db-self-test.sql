\set ON_ERROR_STOP on

\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
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

select case when (
  select count(distinct profile.id)
  from public.profiles profile
  where profile.id in (
    :'mentor_id'::uuid,
    :'tutor_id'::uuid,
    :'student_a_id'::uuid,
    :'outsider_id'::uuid
  )
) = 4 then 1 else 0 end as actors_ready \gset

\if :actors_ready
\else
  \echo 'The Phase 5.G.2.4.7.2 actors are not provisioned.'
  \quit 3
\endif

begin;
select set_config('test.pacing_mentor_id', :'mentor_id', false);
select set_config('test.pacing_tutor_id', :'tutor_id', false);
select set_config('test.pacing_student_id', :'student_a_id', false);
select set_config('test.pacing_outsider_id', :'outsider_id', false);
select set_config(
  'test.pacing_today',
  (clock_timestamp() at time zone 'America/Sao_Paulo')::date::text,
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (
  public.create_student_course_with_schedule_draft(
    :'student_a_id'::uuid,
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'Phase 5.G.2.4.7.2 pacing policy',
    'kelp',
    'on_demand',
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'phase5g2-4-7-2-db-schedule',
      'name', 'Adaptive and Static acceptance plan',
      'timeZone', 'America/Sao_Paulo',
      'cadence', jsonb_build_object(
        'type', 'day_interval',
        'intervalDays', 7
      ),
      'sessions', jsonb_build_array(
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-a',
          'title', 'Pacing topic A',
          'startDate', current_setting('test.pacing_today')::date,
          'endDate', current_setting('test.pacing_today')::date
        ),
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-b',
          'title', 'Pacing topic B',
          'startDate', current_setting('test.pacing_today')::date + 7,
          'endDate', current_setting('test.pacing_today')::date + 7
        ),
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-c',
          'title', 'Pacing topic C',
          'startDate', current_setting('test.pacing_today')::date + 14,
          'endDate', current_setting('test.pacing_today')::date + 14
        )
      )
    ),
    'phase5g2-4-7-2-db-course'
  ) ->> 'id'
) as pacing_course_id \gset
select set_config('test.pacing_course_id', :'pacing_course_id', false);
select public.activate_student_course(:'pacing_course_id'::uuid);
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select active_schedule_version_id as pacing_version_id
from public.student_courses
where id = :'pacing_course_id'::uuid \gset
select set_config('test.pacing_version_id', :'pacing_version_id', false);
select classroom.id as pacing_classroom_id
from public.classrooms classroom
where classroom.course_id = :'pacing_course_id'::uuid
  and classroom.status = 'active'
order by classroom.created_at desc, classroom.id desc
limit 1 \gset
select set_config(
  'test.pacing_classroom_id',
  :'pacing_classroom_id',
  false
);

select item.id as pacing_a_item_id
from public.course_schedule_items item
where item.version_id = :'pacing_version_id'::uuid
  and item.stable_item_key = 'phase5g2-4-7-2-db-a' \gset
select item.id as pacing_b_item_id
from public.course_schedule_items item
where item.version_id = :'pacing_version_id'::uuid
  and item.stable_item_key = 'phase5g2-4-7-2-db-b' \gset

do $existing_versions_default_adaptive$
declare
  policy jsonb := public.get_my_effective_course_schedule(
    current_setting('test.pacing_course_id')::uuid
  ) -> 'pacingPolicy';
begin
  if policy ->> 'mode' <> 'adaptive'
    or policy ->> 'eventKind' not in ('legacy_default', 'inherited') then
    raise exception 'A new or retained Schedule Version did not default to Adaptive pacing.';
  end if;
end;
$existing_versions_default_adaptive$;

-- The frontend owns date calculation, while the publication boundary proves
-- that the complete vector uses the new cadence without gaps or stale days.
reset role;
do $frontend_future_lane_rejects_stale_weekdays$
declare
  boundary date := current_setting('test.pacing_today')::date;
  cadence jsonb := jsonb_build_object(
    'type', 'weekly_frequency',
    'weekdays', jsonb_build_array(2, 4)
  );
  first_date date;
  second_date date;
  third_date date;
  lane jsonb;
  builder jsonb;
  validated jsonb;
begin
  first_date := public.course_schedule_next_combined_cadence_date(
    cadence, null, boundary
  );
  second_date := public.course_schedule_next_combined_cadence_date(
    cadence, first_date, boundary
  );
  third_date := public.course_schedule_next_combined_cadence_date(
    cadence, second_date, boundary
  );
  lane := jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5g2-4-7-3-1-5-db-a',
      'startDate', first_date,
      'endDate', first_date,
      'ordinal', 0
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5g2-4-7-3-1-5-db-b',
      'startDate', second_date,
      'endDate', second_date,
      'ordinal', 1
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5g2-4-7-3-1-5-db-c',
      'startDate', third_date,
      'endDate', third_date,
      'ordinal', 2
    )
  );
  builder := jsonb_build_object(
    'name', 'Frontend future-lane validation',
    'timeZone', 'America/Sao_Paulo',
    'startDate', boundary,
    'pacingMode', 'adaptive',
    'cadence', cadence,
    'context', jsonb_build_object(
      'effectiveFutureLaneAuthority', true,
      'effectiveFutureLane', lane
    ),
    'sessions', jsonb_build_array(
      jsonb_build_object('id', 'phase5g2-4-7-3-1-5-db-a'),
      jsonb_build_object('id', 'phase5g2-4-7-3-1-5-db-b'),
      jsonb_build_object('id', 'phase5g2-4-7-3-1-5-db-c')
    )
  );

  validated := public.validate_course_schedule_effective_future_lane(builder);
  if validated -> 'entries' <> lane then
    raise exception
      'The valid Tuesday/Thursday frontend future lane was not preserved exactly.';
  end if;

  begin
    perform public.validate_course_schedule_effective_future_lane(
      jsonb_set(
        jsonb_set(
          builder,
          '{context,effectiveFutureLane,1,startDate}',
          to_jsonb(second_date + 1)
        ),
        '{context,effectiveFutureLane,1,endDate}',
        to_jsonb(second_date + 1)
      )
    );
    raise exception
      'A stale weekday was accepted inside the frontend future lane.';
  exception when others then
    if sqlerrm not like '%without stale weekdays or vacancies%' then
      raise;
    end if;
  end;
end;
$frontend_future_lane_rejects_stale_weekdays$;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);

-- Every downstream consumer must receive the same compacted effective lane.
-- This synthetic boundary reproduces A Studied with B/C still unfinished:
-- the stale future A row disappears, B consumes A's date, C consumes B's
-- date, and only the final cadence slot becomes vacant.
reset role;
do $effective_consumer_groups_compact_without_middle_vacancies$
declare
  today_date date := current_setting('test.pacing_today')::date;
  projection jsonb;
begin
  projection := public.course_schedule_reconcile_effective_groups(
    jsonb_build_object(
      'past', '[]'::jsonb,
      'next', jsonb_build_array(jsonb_build_object(
        'rowId', 'plan:a',
        'rowKind', 'planned_topic',
        'scheduleItemId', 'item-a',
        'effectiveDate', today_date,
        'section', 'next',
        'calendarPresentation', jsonb_build_object(
          'isDateOnly', true,
          'effectiveDate', today_date
        )
      )),
      'upcoming', jsonb_build_array(
        jsonb_build_object(
          'rowId', 'plan:b',
          'rowKind', 'planned_topic',
          'scheduleItemId', 'item-b',
          'effectiveDate', today_date + 7,
          'section', 'upcoming',
          'calendarPresentation', jsonb_build_object(
            'isDateOnly', true,
            'effectiveDate', today_date + 7
          )
        ),
        jsonb_build_object(
          'rowId', 'plan:c',
          'rowKind', 'planned_topic',
          'scheduleItemId', 'item-c',
          'effectiveDate', today_date + 14,
          'section', 'upcoming',
          'calendarPresentation', jsonb_build_object(
            'isDateOnly', true,
            'effectiveDate', today_date + 14
          )
        )
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'scheduleItemId', 'item-a',
        'sequenceState', 'studied',
        'effectiveDate', today_date
      ),
      jsonb_build_object(
        'scheduleItemId', 'item-b',
        'sequenceState', 'next',
        'effectiveDate', today_date
      ),
      jsonb_build_object(
        'scheduleItemId', 'item-c',
        'sequenceState', 'upcoming',
        'effectiveDate', today_date + 7
      )
    ),
    'America/Sao_Paulo'
  );

  if jsonb_array_length(projection -> 'past') <> 0
    or jsonb_array_length(projection -> 'next') <> 1
    or jsonb_array_length(projection -> 'upcoming') <> 1
    or projection #>> '{next,0,scheduleItemId}' <> 'item-b'
    or projection #>> '{next,0,effectiveDate}' <> today_date::text
    or projection #>> '{next,0,calendarPresentation,effectiveDate}'
      <> today_date::text
    or projection #>> '{upcoming,0,scheduleItemId}' <> 'item-c'
    or projection #>> '{upcoming,0,effectiveDate}'
      <> (today_date + 7)::text
    or exists (
      select 1
      from jsonb_array_elements(
        (projection -> 'past')
        || (projection -> 'next')
        || (projection -> 'upcoming')
      ) row_entry(value)
      where row_entry.value ->> 'scheduleItemId' = 'item-a'
    )
  then
    raise exception
      'Canonical consumers retained a studied future milestone or a middle cadence vacancy.';
  end if;
end;
$effective_consumer_groups_compact_without_middle_vacancies$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);

-- Independent progress outside any recurring six-hour hold reflows the next
-- unfinished item into the earliest effective date.
select public.record_course_progress(
  :'pacing_course_id'::uuid,
  :'pacing_a_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5g2-4-7-2-db-student-a'
);

do $adaptive_independent_progress_reflows$
declare
  projection jsonb := public.get_my_effective_course_schedule(
    current_setting('test.pacing_course_id')::uuid
  );
  topic_b jsonb;
begin
  select item.value into topic_b
  from jsonb_array_elements(projection -> 'items') item(value)
  where item.value ->> 'stableItemKey' = 'phase5g2-4-7-2-db-b';
  if topic_b ->> 'effectiveDate' <> current_setting('test.pacing_today')
    or topic_b ->> 'plannedDate'
      <> (current_setting('test.pacing_today')::date + 7)::text then
    raise exception 'Adaptive independent progress did not move the next unfinished topic forward.';
  end if;
end;
$adaptive_independent_progress_reflows$;

do $adaptive_course_end_contracts_with_effective_lane$
declare
  today_date date := current_setting('test.pacing_today')::date;
  calendar_payload jsonb := public.get_my_classroom_calendar(
    current_setting('test.pacing_classroom_id')::uuid,
    today_date,
    today_date + 14
  );
  projected_course_end date;
begin
  select (event.value ->> 'startsOn')::date
  into projected_course_end
  from jsonb_array_elements(calendar_payload -> 'events') event(value)
  where event.value ->> 'kind' = 'course_end'
  limit 1;

  if (
      select count(*)
      from jsonb_array_elements(calendar_payload -> 'events') event(value)
      where event.value ->> 'kind' = 'course_end'
    ) <> 1
    or projected_course_end is distinct from today_date + 7
    or exists (
      select 1
      from jsonb_array_elements(calendar_payload -> 'events') event(value)
      where event.value ->> 'kind' = 'course_end'
        and (event.value ->> 'startsOn')::date = today_date + 14
    ) then
    raise exception
      'Adaptive Course End did not contract to the last effective target.';
  end if;
end;
$adaptive_course_end_contracts_with_effective_lane$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.set_course_schedule_pacing_mode(
  :'pacing_course_id'::uuid,
  :'pacing_version_id'::uuid,
  'static',
  'Keep the Student''s currently effective future dates fixed.',
  'phase5g2-4-7-2-db-static'
) as static_response \gset
select set_config('test.pacing_static_response', :'static_response', false);

do $static_selection_is_versioned_and_frozen$
declare
  response jsonb := current_setting('test.pacing_static_response')::jsonb;
  policy jsonb := public.get_my_effective_course_schedule(
    current_setting('test.pacing_course_id')::uuid
  ) -> 'pacingPolicy';
begin
  if response ->> 'status' <> 'changed'
    or policy ->> 'mode' <> 'static'
    or policy #>> '{frozenEffectiveDates,phase5g2-4-7-2-db-b}'
      <> current_setting('test.pacing_today')
    or (
      select count(*)
      from public.course_schedule_pacing_policy_events event
      where event.version_id = current_setting('test.pacing_version_id')::uuid
    ) <> 2 then
    raise exception 'Static pacing did not append one frozen policy revision.';
  end if;
end;
$static_selection_is_versioned_and_frozen$;

select public.set_course_schedule_pacing_mode(
  :'pacing_course_id'::uuid,
  :'pacing_version_id'::uuid,
  'static',
  'Keep the Student''s currently effective future dates fixed.',
  'phase5g2-4-7-2-db-static'
) as static_retry \gset
select set_config('test.pacing_static_retry', :'static_retry', false);

do $pacing_command_is_idempotent$
begin
  if current_setting('test.pacing_static_retry')::jsonb
      ->> 'idempotentReplay' <> 'true'
    or (
      select count(*)
      from public.course_schedule_pacing_policy_events event
      where event.version_id = current_setting('test.pacing_version_id')::uuid
    ) <> 2 then
    raise exception 'An exact pacing retry created duplicate history.';
  end if;
end;
$pacing_command_is_idempotent$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'pacing_course_id'::uuid,
  :'pacing_b_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5g2-4-7-2-db-student-b'
);

do $static_progress_does_not_reflow_future_dates$
declare
  projection jsonb := public.get_my_effective_course_schedule(
    current_setting('test.pacing_course_id')::uuid
  );
  topic_c jsonb;
begin
  select item.value into topic_c
  from jsonb_array_elements(projection -> 'items') item(value)
  where item.value ->> 'stableItemKey' = 'phase5g2-4-7-2-db-c';
  if topic_c ->> 'effectiveDate'
      <> (current_setting('test.pacing_today')::date + 7)::text
    or topic_c ->> 'plannedDate'
      <> (current_setting('test.pacing_today')::date + 14)::text then
    raise exception 'Static progress changed a frozen future effective date.';
  end if;
end;
$static_progress_does_not_reflow_future_dates$;

do $static_course_end_retains_frozen_effective_lane$
declare
  today_date date := current_setting('test.pacing_today')::date;
  calendar_payload jsonb := public.get_my_classroom_calendar(
    current_setting('test.pacing_classroom_id')::uuid,
    today_date,
    today_date + 14
  );
  projected_course_end date;
begin
  select (event.value ->> 'startsOn')::date
  into projected_course_end
  from jsonb_array_elements(calendar_payload -> 'events') event(value)
  where event.value ->> 'kind' = 'course_end'
  limit 1;

  if (
      select count(*)
      from jsonb_array_elements(calendar_payload -> 'events') event(value)
      where event.value ->> 'kind' = 'course_end'
    ) <> 1
    or projected_course_end is distinct from today_date + 7 then
    raise exception
      'Static Course End did not retain its frozen terminal date.';
  end if;
end;
$static_course_end_retains_frozen_effective_lane$;

-- A recurring Course can carry dated curriculum Sessions before its actual
-- meeting pattern is configured. Those structural dates remain usable for
-- Adaptive pacing without becoming booked Classes or entering the six-hour
-- hold. This reproduces the interactive manual-QA Course shape.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select (
  public.create_student_course_with_schedule_draft(
    :'student_a_id'::uuid,
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'Phase 5.G.2.4.7.2 recurring date fallback',
    'kelp',
    'recurring',
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'phase5g2-4-7-2-db-fallback-schedule',
      'name', 'Recurring date-fallback acceptance plan',
      'timeZone', 'America/Sao_Paulo',
      'cadence', jsonb_build_object('type', 'day_interval', 'intervalDays', 7),
      'sessions', jsonb_build_array(
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-fallback-a',
          'title', 'Fallback target A',
          'startDate', current_setting('test.pacing_today')::date,
          'endDate', current_setting('test.pacing_today')::date
        ),
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-fallback-b',
          'title', 'Fallback target B',
          'startDate', current_setting('test.pacing_today')::date + 7,
          'endDate', current_setting('test.pacing_today')::date + 7
        ),
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-fallback-c',
          'title', 'Fallback target C',
          'startDate', current_setting('test.pacing_today')::date + 14,
          'endDate', current_setting('test.pacing_today')::date + 14
        )
      )
    ),
    'phase5g2-4-7-2-db-fallback-course'
  ) ->> 'id'
) as pacing_fallback_course_id \gset
select set_config(
  'test.pacing_fallback_course_id',
  :'pacing_fallback_course_id',
  false
);
select public.activate_student_course(:'pacing_fallback_course_id'::uuid);
select active_schedule_version_id as pacing_fallback_version_id
from public.student_courses
where id = :'pacing_fallback_course_id'::uuid \gset
select set_config(
  'test.pacing_fallback_version_id',
  :'pacing_fallback_version_id',
  false
);
select item.id as pacing_fallback_a_item_id
from public.course_schedule_items item
where item.version_id = :'pacing_fallback_version_id'::uuid
  and item.stable_item_key = 'phase5g2-4-7-2-db-fallback-a' \gset

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'pacing_fallback_course_id'::uuid,
  :'pacing_fallback_a_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5g2-4-7-2-db-fallback-a'
);

do $adaptive_recurring_date_fallback_reflows_without_class_hold$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.pacing_fallback_course_id')::uuid
  );
  topic_b jsonb;
begin
  select item.value into topic_b
  from jsonb_array_elements(
    projection #> '{academicTrack,items}'
  ) item(value)
  where item.value ->> 'stableItemKey' =
    'phase5g2-4-7-2-db-fallback-b';

  if topic_b ->> 'effectiveDate' <> current_setting('test.pacing_today')
    or topic_b ->> 'plannedDate'
      <> (current_setting('test.pacing_today')::date + 7)::text
    or (
      select count(*)
      from public.course_schedule_academic_slots slot
      where slot.version_id =
        current_setting('test.pacing_fallback_version_id')::uuid
        and slot.source_kind = 'static_schedule'
        and slot.local_start_time is null
        and slot.duration_minutes is null
        and slot.metadata ->> 'recurringDateFallback' = 'true'
        and slot.metadata ->> 'createsBookedClass' = 'false'
        and slot.metadata ->> 'createsSixHourHold' = 'false'
    ) <> 3
    or exists (
      select 1
      from public.course_schedule_target_locks target_lock
      where target_lock.version_id =
        current_setting('test.pacing_fallback_version_id')::uuid
    ) then
    raise exception
      'Adaptive recurring progress without a meeting pattern did not consume the freed structural date safely.';
  end if;
end;
$adaptive_recurring_date_fallback_reflows_without_class_hold$;

-- A normal recurring Course outside the six-hour hold must consume the newly
-- freed earliest Class date instead of retaining every original planned date.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select
  ((clock_timestamp() + interval '48 hours')
    at time zone 'America/Sao_Paulo')::date as pacing_reflow_date,
  to_char(
    (clock_timestamp() + interval '48 hours')
      at time zone 'America/Sao_Paulo',
    'HH24:MI'
  ) as pacing_reflow_time,
  extract(dow from (
    (clock_timestamp() + interval '48 hours')
      at time zone 'America/Sao_Paulo'
  ))::integer as pacing_reflow_weekday \gset
select set_config(
  'test.pacing_reflow_date',
  :'pacing_reflow_date',
  false
);

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select (
  public.create_student_course_with_schedule_draft(
    :'student_a_id'::uuid,
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'Phase 5.G.2.4.7.2 recurring reflow',
    'kelp',
    'recurring',
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'phase5g2-4-7-2-db-reflow-schedule',
      'name', 'Recurring Adaptive acceptance plan',
      'timeZone', 'America/Sao_Paulo',
      'cadence', jsonb_build_object('type', 'day_interval', 'intervalDays', 7),
      'sessions', jsonb_build_array(
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-reflow-a',
          'title', 'Recurring target A',
          'startDate', :'pacing_reflow_date'::date,
          'endDate', :'pacing_reflow_date'::date
        ),
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-reflow-b',
          'title', 'Recurring target B',
          'startDate', :'pacing_reflow_date'::date + 7,
          'endDate', :'pacing_reflow_date'::date + 7
        ),
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-reflow-c',
          'title', 'Recurring target C',
          'startDate', :'pacing_reflow_date'::date + 14,
          'endDate', :'pacing_reflow_date'::date + 14
        )
      )
    ),
    'phase5g2-4-7-2-db-reflow-course'
  ) ->> 'id'
) as pacing_reflow_course_id \gset
select set_config(
  'test.pacing_reflow_course_id',
  :'pacing_reflow_course_id',
  false
);
select public.activate_student_course(:'pacing_reflow_course_id'::uuid);
select active_schedule_version_id as pacing_reflow_v1_id
from public.student_courses
where id = :'pacing_reflow_course_id'::uuid \gset

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_meeting_pattern_version(
  :'pacing_reflow_course_id'::uuid,
  :'pacing_reflow_v1_id'::uuid,
  :'pacing_reflow_date'::date,
  :'pacing_reflow_date'::date + 14,
  jsonb_build_array(jsonb_build_object(
    'stablePatternKey', 'phase5g2-4-7-2-db-reflow-pattern',
    'weekday', :'pacing_reflow_weekday'::integer,
    'localStartTime', :'pacing_reflow_time',
    'durationMinutes', 60,
    'position', 0
  )),
  'Create recurring opportunities outside the six-hour hold.',
  null,
  'phase5g2-4-7-2-db-reflow-pattern'
) as pacing_reflow_pattern \gset
select set_config(
  'test.pacing_reflow_version_id',
  :'pacing_reflow_pattern'::jsonb ->> 'publishedVersionId',
  false
);
select item.id as pacing_reflow_a_item_id
from public.course_schedule_items item
where item.version_id =
    current_setting('test.pacing_reflow_version_id')::uuid
  and item.stable_item_key = 'phase5g2-4-7-2-db-reflow-a' \gset

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'pacing_reflow_course_id'::uuid,
  :'pacing_reflow_a_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5g2-4-7-2-db-reflow-a'
);

do $adaptive_recurring_progress_reflows_outside_hold$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.pacing_reflow_course_id')::uuid
  );
  topic_b jsonb;
begin
  select item.value into topic_b
  from jsonb_array_elements(
    projection #> '{academicTrack,items}'
  ) item(value)
  where item.value ->> 'stableItemKey' =
    'phase5g2-4-7-2-db-reflow-b';
  if topic_b ->> 'effectiveDate' <>
      current_setting('test.pacing_reflow_date')
    or topic_b ->> 'plannedDate' <>
      (current_setting('test.pacing_reflow_date')::date + 7)::text then
    raise exception
      'Adaptive recurring progress outside the hold did not move the next unfinished topic into the freed Class date.';
  end if;
end;
$adaptive_recurring_progress_reflows_outside_hold$;

-- A Student cannot mark Studied while an actual timed Class is inside the
-- six-hour hold. The command creates no progress fact, lock, or reflow.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select
  (clock_timestamp() + interval '3 hours') as pacing_hold_start_at,
  ((clock_timestamp() + interval '3 hours')
    at time zone 'America/Sao_Paulo')::date as pacing_hold_date,
  to_char(
    (clock_timestamp() + interval '3 hours')
      at time zone 'America/Sao_Paulo',
    'HH24:MI'
  ) as pacing_hold_time,
  extract(dow from (
    (clock_timestamp() + interval '3 hours')
      at time zone 'America/Sao_Paulo'
  ))::integer as pacing_hold_weekday \gset
select set_config('test.pacing_hold_date', :'pacing_hold_date', false);

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select (
  public.create_student_course_with_schedule_draft(
    :'student_a_id'::uuid,
    :'tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'Phase 5.G.2.4.7.2 six-hour hold',
    'kelp',
    'recurring',
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'phase5g2-4-7-2-db-hold-schedule',
      'name', 'Six-hour hold acceptance plan',
      'timeZone', 'America/Sao_Paulo',
      'cadence', jsonb_build_object('type', 'day_interval', 'intervalDays', 7),
      'sessions', jsonb_build_array(
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-hold-a',
          'title', 'Held target A',
          'startDate', :'pacing_hold_date'::date,
          'endDate', :'pacing_hold_date'::date
        ),
        jsonb_build_object(
          'id', 'phase5g2-4-7-2-db-hold-b',
          'title', 'Future target B',
          'startDate', :'pacing_hold_date'::date + 7,
          'endDate', :'pacing_hold_date'::date + 7
        )
      )
    ),
    'phase5g2-4-7-2-db-hold-course'
  ) ->> 'id'
) as pacing_hold_course_id \gset
select set_config('test.pacing_hold_course_id', :'pacing_hold_course_id', false);
select public.activate_student_course(:'pacing_hold_course_id'::uuid);
select active_schedule_version_id as pacing_hold_v1_id
from public.student_courses
where id = :'pacing_hold_course_id'::uuid \gset

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_meeting_pattern_version(
  :'pacing_hold_course_id'::uuid,
  :'pacing_hold_v1_id'::uuid,
  :'pacing_hold_date'::date,
  :'pacing_hold_date'::date,
  jsonb_build_array(jsonb_build_object(
    'stablePatternKey', 'phase5g2-4-7-2-db-hold-pattern',
    'weekday', :'pacing_hold_weekday'::integer,
    'localStartTime', :'pacing_hold_time',
    'durationMinutes', 60,
    'position', 0
  )),
  'Create one recurring opportunity inside the six-hour hold.',
  null,
  'phase5g2-4-7-2-db-hold-pattern'
) as pacing_hold_pattern \gset
select set_config(
  'test.pacing_hold_version_id',
  :'pacing_hold_pattern'::jsonb ->> 'publishedVersionId',
  false
);
select item.id as pacing_hold_a_item_id
from public.course_schedule_items item
where item.version_id =
    current_setting('test.pacing_hold_version_id')::uuid
  and item.stable_item_key = 'phase5g2-4-7-2-db-hold-a' \gset
select set_config(
  'test.pacing_hold_a_item_id',
  :'pacing_hold_a_item_id',
  false
);

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $six_hour_hold_fixture_is_ready$
declare
  mapping jsonb := public.get_my_course_target_mapping(
    current_setting('test.pacing_hold_course_id')::uuid
  );
begin
  if not exists (
    select 1
    from public.course_schedule_academic_slots slot
    where slot.course_id =
      current_setting('test.pacing_hold_course_id')::uuid
      and slot.version_id =
        current_setting('test.pacing_hold_version_id')::uuid
      and slot.source_kind = 'recurring_pattern'
      and (slot.local_date + slot.local_start_time)
        at time zone slot.time_zone >= clock_timestamp()
      and (
        (slot.local_date + slot.local_start_time)
          at time zone slot.time_zone
      ) - interval '6 hours' <= clock_timestamp()
  ) then
    raise exception
      'The six-hour hold fixture did not create a due recurring academic slot.';
  end if;

  if mapping #>> '{mapping,slotMappings,0,targetStableItemKey}'
    <> 'phase5g2-4-7-2-db-hold-a' then
    raise exception
      'The six-hour hold fixture did not initially map its recurring slot to the prepared target.';
  end if;
end;
$six_hour_hold_fixture_is_ready$;

do $six_hour_hold_blocks_student_studied$
declare
  denied boolean := false;
  mapping jsonb;
begin
  begin
    perform public.record_course_progress(
      current_setting('test.pacing_hold_course_id')::uuid,
      current_setting('test.pacing_hold_a_item_id')::uuid,
      null,
      'studied',
      null,
      null,
      null,
      null,
      null,
      'phase5g2-4-7-2-db-held-a'
    );
  exception when others then
    denied := sqlerrm =
      'Your next class begins within six hours, so its lesson plan is locked. You can mark this topic as Studied after the class.';
  end;

  if not denied then
    raise exception
      'The Student could mark Studied while a timed Class was inside the six-hour hold.';
  end if;

  mapping := public.get_my_course_target_mapping(
    current_setting('test.pacing_hold_course_id')::uuid
  );

  if mapping #>> '{mapping,slotMappings,0,targetStableItemKey}'
    <> 'phase5g2-4-7-2-db-hold-a' then
    raise exception
      'The rejected six-hour Student action moved the prepared target.';
  end if;

  if mapping #>> '{mapping,slotMappings,0,targetLocked}' <> 'false' then
    raise exception
      'The rejected six-hour Student action changed target-lock presentation.';
  end if;
end;
$six_hour_hold_blocks_student_studied$;

-- Direct append-only ledger and lock inspection is deliberately unavailable
-- to the Student. Verify those internal postconditions as the database owner
-- instead of weakening RLS for a characterization.
reset role;
do $rejected_student_studied_left_no_internal_facts$
begin
  if exists (
    select 1
    from public.course_progress_events event
    where event.course_id =
      current_setting('test.pacing_hold_course_id')::uuid
      and event.stable_item_key = 'phase5g2-4-7-2-db-hold-a'
      and event.progress_kind = 'studied'
      and event.event_action = 'marked'
  ) then
    raise exception
      'The rejected six-hour Student action retained a progress event.';
  end if;

  if exists (
    select 1
    from public.course_schedule_target_locks target_lock
    where target_lock.version_id =
      current_setting('test.pacing_hold_version_id')::uuid
  ) then
    raise exception
      'The rejected six-hour Student action retained a target lock.';
  end if;
end;
$rejected_student_studied_left_no_internal_facts$;

-- The hold protects lesson-plan movement only. It does not prevent a Student
-- from recording reinforcement work that cannot advance the Schedule.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'pacing_hold_course_id'::uuid,
  :'pacing_hold_a_item_id'::uuid,
  null,
  'reviewed',
  null,
  null,
  null,
  null,
  null,
  'phase5g2-4-7-2-db-held-a-reviewed'
);
select public.record_course_progress(
  :'pacing_hold_course_id'::uuid,
  :'pacing_hold_a_item_id'::uuid,
  null,
  'practiced',
  null,
  null,
  null,
  null,
  null,
  'phase5g2-4-7-2-db-held-a-practiced'
);

reset role;
do $six_hour_hold_keeps_reinforcement_available$
begin
  if (
    select count(*)
    from public.course_progress_events event
    where event.course_id =
      current_setting('test.pacing_hold_course_id')::uuid
      and event.stable_item_key = 'phase5g2-4-7-2-db-hold-a'
      and event.progress_kind in ('reviewed', 'practiced')
      and event.event_action = 'marked'
  ) <> 2 then
    raise exception
      'The six-hour Student hold incorrectly blocked Reviewed or Practiced progress.';
  end if;
end;
$six_hour_hold_keeps_reinforcement_available$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_cannot_read_or_change_pacing$
declare
  denied boolean := false;
begin
  begin
    perform public.set_course_schedule_pacing_mode(
      current_setting('test.pacing_course_id')::uuid,
      current_setting('test.pacing_version_id')::uuid,
      'adaptive',
      'This outsider must not control another Student Schedule.',
      'phase5g2-4-7-2-db-outsider'
    );
  exception when others then
    denied := sqlerrm =
      'Only the assigned Tutor or supervising Mentor can change Schedule pacing.';
  end;
  if not denied or exists (
    select 1
    from public.course_schedule_pacing_policy_events event
    where event.version_id = current_setting('test.pacing_version_id')::uuid
  ) then
    raise exception 'An outsider read or changed private Schedule pacing history.';
  end if;
end;
$outsider_cannot_read_or_change_pacing$;

reset role;
rollback;
