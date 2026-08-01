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

select case when (
  select count(distinct profile.id)
  from public.profiles profile
  where profile.id in (
    :'mentor_id'::uuid,
    :'tutor_id'::uuid,
    :'student_a_id'::uuid,
    :'student_b_id'::uuid,
    :'outsider_id'::uuid
  )
) = 5 then 1 else 0 end as actors_ready \gset

\if :actors_ready
\else
  \echo 'The Phase 5.F.2.1 actors are not provisioned.'
  \quit 3
\endif

begin;
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.2.1 recurring Mechanics',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f2-1-db-recurring-schedule',
    'name', 'Phase 5.F.2.1 recurring plan',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f2-1-db-a',
        'title', 'Topic A',
        'startDate', current_date + 7,
        'endDate', current_date + 7
      ),
      jsonb_build_object(
        'id', 'phase5f2-1-db-b',
        'title', 'Topic B',
        'startDate', current_date + 21,
        'endDate', current_date + 21
      ),
      jsonb_build_object(
        'id', 'phase5f2-1-db-c',
        'title', 'Topic C',
        'startDate', current_date + 35,
        'endDate', current_date + 35
      )
    )
  ),
  'phase5f2-1-db-recurring-course'
) ->> 'id') as recurring_course_id \gset
select public.activate_student_course(:'recurring_course_id'::uuid);
select active_schedule_version_id as recurring_v1_id
from public.student_courses
where id = :'recurring_course_id'::uuid \gset
select set_config('test.slot_course_id', :'recurring_course_id', false);
select set_config('test.slot_v1_id', :'recurring_v1_id', false);

do $recurring_without_pattern_uses_schedule_dates_for_pacing$
declare
  projection jsonb := public.get_my_course_academic_slots(
    current_setting('test.slot_course_id')::uuid
  );
begin
  if projection #>> '{generation,status}' <> 'configured'
    or projection #>> '{generation,slotCount}' <> '3'
    or jsonb_array_length(projection -> 'slots') <> 3
    or (
      select count(*)
      from public.course_schedule_academic_slots slot
      where slot.version_id = current_setting('test.slot_v1_id')::uuid
        and slot.source_kind = 'static_schedule'
        and slot.meeting_pattern_id is null
        and slot.static_schedule_item_id is not null
        and slot.local_start_time is null
        and slot.duration_minutes is null
        and slot.metadata ->> 'recurringDateFallback' = 'true'
        and slot.metadata ->> 'createsBookedClass' = 'false'
        and slot.metadata ->> 'createsSixHourHold' = 'false'
    ) <> 3 then
    raise exception
      'A recurring Course without a meeting pattern did not receive safe date-only pacing opportunities.';
  end if;
end;
$recurring_without_pattern_uses_schedule_dates_for_pacing$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_meeting_pattern_version(
  :'recurring_course_id'::uuid,
  :'recurring_v1_id'::uuid,
  current_date + 7,
  current_date + 35,
  jsonb_build_array(
    jsonb_build_object(
      'stablePatternKey', 'phase5f2-1-tuesday',
      'weekday', 2,
      'localStartTime', '15:00',
      'durationMinutes', 60,
      'purpose', 'theory',
      'position', 0
    ),
    jsonb_build_object(
      'stablePatternKey', 'phase5f2-1-thursday',
      'weekday', 4,
      'localStartTime', '15:00',
      'durationMinutes', 30,
      'purpose', 'practice',
      'position', 1
    )
  ),
  'Tuesday and Thursday are the ordinary recurring Course meetings.',
  'Purpose values are legacy input and must not control generated slots.',
  'phase5f2-1-db-pattern-v2'
) as recurring_publish \gset
select set_config(
  'test.slot_v2_id',
  :'recurring_publish'::jsonb ->> 'publishedVersionId',
  false
);

do $recurring_slots_generated_without_purpose$
declare
  expected_count integer;
  actual_count integer;
  projection jsonb := public.get_my_course_academic_slots(
    current_setting('test.slot_course_id')::uuid
  );
begin
  select count(*) into expected_count
  from public.course_schedule_meeting_patterns pattern
  cross join lateral generate_series(
    pattern.effective_from::timestamp,
    pattern.effective_until::timestamp,
    interval '1 day'
  ) generated(local_day)
  where pattern.version_id = current_setting('test.slot_v2_id')::uuid
    and extract(dow from generated.local_day)::integer = pattern.weekday;

  select count(*) into actual_count
  from public.course_schedule_academic_slots slot
  where slot.version_id = current_setting('test.slot_v2_id')::uuid
    and slot.source_kind = 'recurring_pattern'
    and slot.static_schedule_item_id is null
    and slot.meeting_pattern_id is not null
    and slot.local_start_time is not null
    and slot.duration_minutes in (30, 60, 90)
    and slot.time_zone = 'America/Sao_Paulo'
    and not (slot.metadata ? 'purpose');

  if expected_count < 8
    or actual_count <> expected_count
    or projection #>> '{generation,status}' <> 'configured'
    or (projection #>> '{generation,slotCount}')::integer <> expected_count
    or projection #>> '{featureStatus,slotGeneration}' <> 'active_phase_5f2_1'
    or projection #>> '{featureStatus,targetMapping}' <> 'planned_phase_5f2_2'
    or projection #>> '{permissions,canMutateSlotsDirectly}' <> 'false' then
    raise exception 'The assigned Tutor did not receive purpose-free generated academic occurrences.';
  end if;
end;
$recurring_slots_generated_without_purpose$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_reads_active_slots_only$
declare
  projection jsonb := public.get_my_course_academic_slots(
    current_setting('test.slot_course_id')::uuid
  );
  direct_count integer;
begin
  if projection #>> '{permissions,canReadSlotHistory}' <> 'false'
    or jsonb_array_length(projection -> 'versions') <> 0
    or jsonb_array_length(projection -> 'slots') = 0 then
    raise exception 'The Student academic-slot projection exposed staff history or hid active slots.';
  end if;

  select count(*) into direct_count
  from public.course_schedule_academic_slots slot
  where slot.course_id = current_setting('test.slot_course_id')::uuid;
  if direct_count <> (
    select count(*)
    from public.course_schedule_academic_slots slot
    where slot.version_id = current_setting('test.slot_v2_id')::uuid
  ) then
    raise exception 'Student RLS exposed a superseded academic-slot Version.';
  end if;
end;
$student_reads_active_slots_only$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_slots_denied$
begin
  begin
    perform public.get_my_course_academic_slots(
      current_setting('test.slot_course_id')::uuid
    );
    raise exception 'Expected outsider academic-slot access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider academic-slot access to fail.' then raise; end if;
    if sqlerrm not like '%do not have access%' then raise; end if;
  end;
end;
$outsider_slots_denied$;

-- A structural successor inherits the week and generates a distinct occurrence
-- set without copying any legacy purpose into the slot record.
select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_schedule_version(
  :'recurring_course_id'::uuid,
  current_setting('test.slot_v2_id')::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'stableItemKey', 'phase5f2-1-db-a',
      'title', 'Topic A',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 7,
      'endDate', current_date + 7,
      'position', 0,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5f2-1-db-review',
      'title', 'Planned Review',
      'kind', 'review',
      'scheduledDate', current_date + 14,
      'endDate', current_date + 14,
      'position', 1,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5f2-1-db-b',
      'title', 'Topic B',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 21,
      'endDate', current_date + 21,
      'position', 2,
      'state', 'scheduled'
    ),
    jsonb_build_object(
      'stableItemKey', 'phase5f2-1-db-c',
      'title', 'Topic C',
      'kind', 'curriculum_topic',
      'scheduledDate', current_date + 35,
      'endDate', current_date + 35,
      'position', 3,
      'state', 'scheduled'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'changeType', 'included',
    'stableItemKey', 'phase5f2-1-db-review',
    'reasonCode', 'review_required',
    'studentExplanation', 'A planned Review was inserted before the remaining topics.'
  )),
  'phase5f2-1-db-structural-v3'
) as structural_publish \gset
select set_config(
  'test.slot_v3_id',
  :'structural_publish'::jsonb ->> 'publishedVersionId',
  false
);

do $successor_version_gets_distinct_slots$
begin
  if (select count(*) from public.course_schedule_academic_slots
      where version_id = current_setting('test.slot_v3_id')::uuid) = 0
    or (select count(*) from public.course_schedule_academic_slots
        where version_id = current_setting('test.slot_v2_id')::uuid) = 0
    or exists (
      select 1
      from public.course_schedule_academic_slots old_slot
      join public.course_schedule_academic_slots new_slot
        on new_slot.id = old_slot.id
      where old_slot.version_id = current_setting('test.slot_v2_id')::uuid
        and new_slot.version_id = current_setting('test.slot_v3_id')::uuid
    ) then
    raise exception 'A successor Schedule Version did not receive a distinct immutable slot set.';
  end if;
end;
$successor_version_gets_distinct_slots$;

-- On-demand/access-only Courses use immutable date-only Schedule occurrences.
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select (public.create_student_course_with_schedule_draft(
  :'student_b_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.2.1 on-demand Mechanics',
  'kelp',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f2-1-db-static-schedule',
    'name', 'Phase 5.F.2.1 static plan',
    'timeZone', 'Europe/London',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f2-1-db-static-a',
        'title', 'Static Topic A',
        'startDate', current_date + 10,
        'endDate', current_date + 10
      ),
      jsonb_build_object(
        'id', 'phase5f2-1-db-static-b',
        'title', 'Static Topic B',
        'startDate', current_date + 20,
        'endDate', current_date + 20
      )
    )
  ),
  'phase5f2-1-db-static-course'
) ->> 'id') as static_course_id \gset
select public.activate_student_course(:'static_course_id'::uuid);
select set_config('test.static_slot_course_id', :'static_course_id', false);

do $static_slots_are_date_only$
declare
  static_version_id uuid;
begin
  select active_schedule_version_id into static_version_id
  from public.student_courses
  where id = current_setting('test.static_slot_course_id')::uuid;

  if (select count(*) from public.course_schedule_academic_slots slot
      where slot.version_id = static_version_id
        and slot.source_kind = 'static_schedule'
        and slot.meeting_pattern_id is null
        and slot.static_schedule_item_id is not null
        and slot.local_start_time is null
        and slot.duration_minutes is null
        and slot.time_zone = 'Europe/London') <> 2 then
    raise exception 'The on-demand Course did not receive one date-only academic slot per active item.';
  end if;
end;
$static_slots_are_date_only$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $browser_roles_cannot_mutate_academic_slots$
begin
  begin
    update public.course_schedule_academic_slots
    set local_date = local_date + 1
    where version_id = current_setting('test.slot_v3_id')::uuid;
    raise exception 'Expected browser roles to be denied direct academic-slot updates.';
  exception when others then
    if sqlerrm = 'Expected browser roles to be denied direct academic-slot updates.' then raise; end if;
    if sqlerrm not like '%permission denied for table course_schedule_academic_slots%'
      and sqlerrm not like '%academic slots are immutable%' then
      raise;
    end if;
  end;
end;
$browser_roles_cannot_mutate_academic_slots$;

reset role;
do $academic_slots_are_immutable_even_for_privileged_callers$
begin
  begin
    update public.course_schedule_academic_slots
    set local_date = local_date + 1
    where version_id = current_setting('test.slot_v3_id')::uuid;
    raise exception 'Expected immutable academic-slot history to reject a privileged update.';
  exception when others then
    if sqlerrm = 'Expected immutable academic-slot history to reject a privileged update.' then
      raise;
    end if;
    if sqlerrm not like '%academic slots are immutable%' then raise; end if;
  end;
end;
$academic_slots_are_immutable_even_for_privileged_callers$;

do $phase5f5_dst_wall_clock_readiness$
begin
  if '2026-03-22 09:00'::timestamp at time zone 'Europe/London'
      <> '2026-03-22 09:00+00'::timestamptz
    or '2026-03-29 09:00'::timestamp at time zone 'Europe/London'
      <> '2026-03-29 08:00+00'::timestamptz then
    raise exception 'Recurring local wall-clock slots are not ready for an IANA daylight-saving boundary.';
  end if;
end;
$phase5f5_dst_wall_clock_readiness$;

do $phase5f2_1_rollback_summary$
begin
  if (select count(*) from public.course_schedule_academic_slots
      where course_id in (
        current_setting('test.slot_course_id')::uuid,
        current_setting('test.static_slot_course_id')::uuid
      )) = 0 then
    raise exception 'The Phase 5.F.2.1 characterization did not create academic slots.';
  end if;
end;
$phase5f2_1_rollback_summary$;

rollback;
