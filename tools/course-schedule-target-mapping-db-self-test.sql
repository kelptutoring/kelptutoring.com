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
  \echo 'The Phase 5.F.2.2 actors are not provisioned.'
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

select (
  current_date
  + case
      when ((2 - extract(dow from current_date)::integer + 7) % 7) = 0
        then 7
      else ((2 - extract(dow from current_date)::integer + 7) % 7)
    end
)::date as next_tuesday \gset
select (clock_timestamp() at time zone 'America/Sao_Paulo')::date as local_today \gset

-- Five remaining topics and four recurring opportunities are valid. The fifth
-- topic waits for a future slot without creating a booking or purchase.
select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.2.2 recurring target mapping',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f2-2-db-recurring-schedule',
    'name', 'Phase 5.F.2.2 recurring mapping plan',
    'timeZone', 'America/Sao_Paulo',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f2-2-db-a',
        'title', 'Topic A',
        'startDate', :'local_today'::date,
        'endDate', :'local_today'::date
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-b',
        'title', 'Topic B',
        'startDate', :'next_tuesday'::date + 2,
        'endDate', :'next_tuesday'::date + 2
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-c',
        'title', 'Topic C',
        'startDate', :'next_tuesday'::date + 7,
        'endDate', :'next_tuesday'::date + 7
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-d',
        'title', 'Topic D',
        'startDate', :'next_tuesday'::date + 9,
        'endDate', :'next_tuesday'::date + 9
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-e',
        'title', 'Topic E',
        'startDate', :'next_tuesday'::date + 14,
        'endDate', :'next_tuesday'::date + 14
      )
    )
  ),
  'phase5f2-2-db-recurring-course'
) ->> 'id') as recurring_course_id \gset
select public.activate_student_course(:'recurring_course_id'::uuid);
select active_schedule_version_id as recurring_v1_id
from public.student_courses
where id = :'recurring_course_id'::uuid \gset
select set_config('test.mapping_v1_id', :'recurring_v1_id', false);

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_meeting_pattern_version(
  :'recurring_course_id'::uuid,
  :'recurring_v1_id'::uuid,
  :'next_tuesday'::date,
  :'next_tuesday'::date + 9,
  jsonb_build_array(
    jsonb_build_object(
      'stablePatternKey', 'phase5f2-2-tuesday',
      'weekday', 2,
      'localStartTime', '15:00',
      'durationMinutes', 30,
      'position', 0
    ),
    jsonb_build_object(
      'stablePatternKey', 'phase5f2-2-thursday',
      'weekday', 4,
      'localStartTime', '15:00',
      'durationMinutes', 30,
      'position', 1
    )
  ),
  'Tuesday and Thursday remain neutral tutoring opportunities.',
  null,
  'phase5f2-2-db-pattern'
) as recurring_pattern_publish \gset
select set_config(
  'test.mapping_course_id',
  :'recurring_course_id',
  false
);
select set_config(
  'test.mapping_v2_id',
  :'recurring_pattern_publish'::jsonb ->> 'publishedVersionId',
  false
);

do $recurring_pattern_is_neutral$
declare
  projection jsonb := public.get_my_course_meeting_pattern(
    current_setting('test.mapping_course_id')::uuid
  );
begin
  if projection #>> '{recurrence,patterns,0,durationMinutes}' <> '30'
    or projection #>> '{recurrence,patterns,1,durationMinutes}' <> '30'
    or projection #> '{recurrence,patterns,0,purpose}' is not null
    or exists (
      select 1
      from public.course_schedule_meeting_patterns pattern
      where pattern.version_id = current_setting('test.mapping_v2_id')::uuid
        and pattern.purpose <> 'academic'
    ) then
    raise exception 'Recurring opportunities retained a default purpose or duration-based progression rule.';
  end if;
end;
$recurring_pattern_is_neutral$;

select item.id as recurring_c_item_id
from public.course_schedule_items item
where item.version_id = current_setting('test.mapping_v2_id')::uuid
  and item.stable_item_key = 'phase5f2-2-db-c' \gset
select set_config('test.mapping_c_item_id', :'recurring_c_item_id', false);

do $recurring_mapping_is_sequential_and_capacity_is_nonfinancial$
declare
  projection jsonb := public.get_my_course_target_mapping(
    current_setting('test.mapping_course_id')::uuid
  );
begin
  if projection #>> '{mappingStatus}' <> 'configured'
    or projection #>> '{mapping,capacity,status}' <> 'awaiting_future_slots'
    or projection #>> '{mapping,capacity,slotCount}' <> '4'
    or projection #>> '{mapping,capacity,mappedTargetCount}' <> '4'
    or projection #>> '{mapping,capacity,awaitingFutureSlotCount}' <> '1'
    or projection #>> '{mapping,capacity,requiresPurchase}' <> 'false'
    or projection #>> '{mapping,capacity,requiresAutomaticClassBooking}' <> 'false'
    or projection #>> '{mapping,slotMappings,0,targetStableItemKey}'
      <> 'phase5f2-2-db-a'
    or projection #>> '{mapping,slotMappings,1,targetStableItemKey}'
      <> 'phase5f2-2-db-b'
    or projection #>> '{mapping,slotMappings,2,targetStableItemKey}'
      <> 'phase5f2-2-db-c'
    or projection #>> '{mapping,slotMappings,3,targetStableItemKey}'
      <> 'phase5f2-2-db-d'
    or projection #>> '{mapping,awaitingFutureSlot,0,stableItemKey}'
      <> 'phase5f2-2-db-e'
    or projection #>> '{mapping,bookingTargetSelection,enabled}' <> 'false' then
    raise exception 'The recurring Course did not map A-D and leave E awaiting a future slot.';
  end if;
end;
$recurring_mapping_is_sequential_and_capacity_is_nonfinancial$;

-- The Student studies C independently. C leaves the future recurring targets,
-- D and E move forward, and the prior mapping remains staff-auditable.
select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'recurring_course_id'::uuid,
  :'recurring_c_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  'I studied Topic C independently before its planned tutoring meeting.',
  null,
  null,
  'phase5f2-2-db-student-c'
) as recurring_c_progress \gset

do $independent_progress_reflows_only_future_targets$
declare
  projection jsonb := public.get_my_course_target_mapping(
    current_setting('test.mapping_course_id')::uuid
  );
begin
  if projection #>> '{mappingRevision,revisionNumber}' <> '2'
    or projection #>> '{mappingRevision,reason}' <> 'progress_reflow'
    or projection #>> '{mapping,capacity,status}' <> 'mapped'
    or projection #>> '{mapping,capacity,awaitingFutureSlotCount}' <> '0'
    or projection #>> '{mapping,slotMappings,0,targetStableItemKey}'
      <> 'phase5f2-2-db-a'
    or projection #>> '{mapping,slotMappings,1,targetStableItemKey}'
      <> 'phase5f2-2-db-b'
    or projection #>> '{mapping,slotMappings,2,targetStableItemKey}'
      <> 'phase5f2-2-db-d'
    or projection #>> '{mapping,slotMappings,3,targetStableItemKey}'
      <> 'phase5f2-2-db-e'
    or jsonb_array_length(projection -> 'history') <> 0 then
    raise exception 'Independent Study did not reflow recurring targets without exposing staff history.';
  end if;
end;
$independent_progress_reflows_only_future_targets$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $staff_retains_mapping_history$
declare
  projection jsonb := public.get_my_course_target_mapping(
    current_setting('test.mapping_course_id')::uuid
  );
begin
  if projection #>> '{permissions,canReadMappingHistory}' <> 'true'
    or jsonb_array_length(projection -> 'history') <> 3
    or (
      select count(*)
      from public.course_schedule_target_mapping_revisions revision
      where revision.version_id = current_setting('test.mapping_v2_id')::uuid
    ) <> 2
    or (
      select count(*)
      from public.course_schedule_target_mapping_revisions revision
      where revision.version_id = current_setting('test.mapping_v1_id')::uuid
        and revision.snapshot ->> 'slotSourceMode'
          = 'recurring_schedule_date_fallback'
    ) <> 1 then
    raise exception 'The assigned Tutor did not retain append-only mapping history.';
  end if;
end;
$staff_retains_mapping_history$;

-- A Tutor correction followed by a Student re-mark legitimately revisits the
-- same effective mapping signatures. The chronological revisions must remain
-- append-only instead of rejecting the repeated shape as a duplicate.
select public.reverse_course_progress(
  :'recurring_course_id'::uuid,
  :'recurring_c_item_id'::uuid,
  null,
  'studied',
  (:'recurring_c_progress'::jsonb ->> 'eventId')::uuid,
  null,
  'Topic C was marked prematurely and remains part of the Student plan.',
  null,
  'phase5f2-2-db-tutor-c-reverse'
) as recurring_c_reversal \gset

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.record_course_progress(
  :'recurring_course_id'::uuid,
  :'recurring_c_item_id'::uuid,
  null,
  'studied',
  (:'recurring_c_reversal'::jsonb ->> 'eventId')::uuid,
  null,
  null,
  null,
  null,
  'phase5f2-2-db-student-c-remark'
);

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $mapping_signatures_may_be_revisited$
begin
  if (
    select count(*)
    from public.course_schedule_target_mapping_revisions revision
    where revision.version_id = current_setting('test.mapping_v2_id')::uuid
  ) <> 4
  or (
    select count(distinct revision.mapping_signature)
    from public.course_schedule_target_mapping_revisions revision
    where revision.version_id = current_setting('test.mapping_v2_id')::uuid
  ) <> 2 then
    raise exception 'A corrected and re-marked topic did not retain all chronological mapping revisions.';
  end if;
end;
$mapping_signatures_may_be_revisited$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_cannot_read_target_mapping$
begin
  begin
    perform public.get_my_course_target_mapping(
      current_setting('test.mapping_course_id')::uuid
    );
    raise exception 'Expected outsider target-mapping access to fail.';
  exception when others then
    if sqlerrm = 'Expected outsider target-mapping access to fail.' then raise; end if;
    if sqlerrm not like '%do not have access%' then raise; end if;
  end;
end;
$outsider_cannot_read_target_mapping$;

-- Adaptive on-demand due-date rows reflow after independent progress. The
-- booking projection still recommends the next unstudied topic while
-- permitting another unstudied topic.
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select (public.create_student_course_with_schedule_draft(
  :'student_b_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.2.2 on-demand target selection',
  'kelp',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f2-2-db-on-demand-schedule',
    'name', 'Phase 5.F.2.2 on-demand plan',
    'timeZone', 'Europe/London',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f2-2-db-on-a',
        'title', 'On-demand A',
        'startDate', current_date + 3,
        'endDate', current_date + 3
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-on-b',
        'title', 'On-demand B',
        'startDate', current_date + 6,
        'endDate', current_date + 6
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-on-c',
        'title', 'On-demand C',
        'startDate', current_date + 9,
        'endDate', current_date + 9
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-on-d',
        'title', 'On-demand D',
        'startDate', current_date + 12,
        'endDate', current_date + 12
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-on-e',
        'title', 'On-demand E',
        'startDate', current_date + 15,
        'endDate', current_date + 15
      ),
      jsonb_build_object(
        'id', 'phase5f2-2-db-on-f',
        'title', 'On-demand F',
        'startDate', current_date + 18,
        'endDate', current_date + 18
      )
    )
  ),
  'phase5f2-2-db-on-demand-course'
) ->> 'id') as on_demand_course_id \gset
select public.activate_student_course(:'on_demand_course_id'::uuid);
select active_schedule_version_id as on_demand_version_id
from public.student_courses
where id = :'on_demand_course_id'::uuid \gset
select item.id as on_demand_a_item_id
from public.course_schedule_items item
where item.version_id = :'on_demand_version_id'::uuid
  and item.stable_item_key = 'phase5f2-2-db-on-a' \gset
select item.id as on_demand_b_item_id
from public.course_schedule_items item
where item.version_id = :'on_demand_version_id'::uuid
  and item.stable_item_key = 'phase5f2-2-db-on-b' \gset
select item.id as on_demand_e_item_id
from public.course_schedule_items item
where item.version_id = :'on_demand_version_id'::uuid
  and item.stable_item_key = 'phase5f2-2-db-on-e' \gset
select item.id as on_demand_f_item_id
from public.course_schedule_items item
where item.version_id = :'on_demand_version_id'::uuid
  and item.stable_item_key = 'phase5f2-2-db-on-f' \gset
select set_config('test.on_demand_course_id', :'on_demand_course_id', false);

select set_config('request.jwt.claim.sub', :'student_b_id', true);
select public.record_course_progress(
  :'on_demand_course_id'::uuid,
  :'on_demand_a_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5f2-2-db-on-a-studied'
);
select public.record_course_progress(
  :'on_demand_course_id'::uuid,
  :'on_demand_b_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5f2-2-db-on-b-studied'
);
select public.record_course_progress(
  :'on_demand_course_id'::uuid,
  :'on_demand_e_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5f2-2-db-on-e-studied'
);
select public.record_course_progress(
  :'on_demand_course_id'::uuid,
  :'on_demand_f_item_id'::uuid,
  null,
  'studied',
  null,
  null,
  null,
  null,
  null,
  'phase5f2-2-db-on-f-studied'
);

do $on_demand_recommends_c_and_allows_d$
declare
  projection jsonb := public.get_my_course_target_mapping(
    current_setting('test.on_demand_course_id')::uuid
  );
begin
  if projection #>> '{mapping,pacingMode}' <> 'adaptive'
    or projection #>> '{mapping,capacity,status}' <> 'open_slots'
    or projection #>> '{mapping,capacity,openSlotCount}' <> '4'
    or projection #>> '{mapping,slotMappings,0,targetStableItemKey}'
      <> 'phase5f2-2-db-on-c'
    or projection #>> '{mapping,slotMappings,0,localDate}'
      <> (current_date + 3)::text
    or projection #>> '{mapping,slotMappings,1,targetStableItemKey}'
      <> 'phase5f2-2-db-on-d'
    or projection #>> '{mapping,slotMappings,1,localDate}'
      <> (current_date + 6)::text
    or projection #>> '{mapping,bookingTargetSelection,enabled}' <> 'true'
    or projection #>> '{mapping,bookingTargetSelection,selectionMode}'
      <> 'student_selects_unstudied_topic'
    or projection #>> '{mapping,bookingTargetSelection,recommendedTarget,stableItemKey}'
      <> 'phase5f2-2-db-on-c'
    or jsonb_array_length(
      projection #> '{mapping,bookingTargetSelection,selectableTargets}'
    ) <> 2
    or not exists (
      select 1
      from jsonb_array_elements(
        projection #> '{mapping,bookingTargetSelection,selectableTargets}'
      ) target
      where target ->> 'stableItemKey' = 'phase5f2-2-db-on-d'
        and target ->> 'recommended' = 'false'
    ) then
    raise exception
      'Adaptive on-demand reflow did not move C and D forward while preserving booking choice.';
  end if;
end;
$on_demand_recommends_c_and_allows_d$;

-- Direct browser mutation is denied; privileged callers still meet the
-- append-only trigger.
do $student_cannot_mutate_mapping_history$
begin
  begin
    update public.course_schedule_target_mapping_revisions
    set mapping_reason = 'manual_refresh'
    where course_id = current_setting('test.on_demand_course_id')::uuid;
    raise exception 'Expected browser target-mapping mutation to fail.';
  exception when others then
    if sqlerrm = 'Expected browser target-mapping mutation to fail.' then raise; end if;
    if sqlerrm not like '%permission denied for table course_schedule_target_mapping_revisions%'
      and sqlerrm not like '%target mappings are append-only%' then
      raise;
    end if;
  end;
end;
$student_cannot_mutate_mapping_history$;

reset role;
do $privileged_mapping_rewrite_is_denied$
begin
  begin
    update public.course_schedule_target_mapping_revisions
    set mapping_reason = 'manual_refresh'
    where course_id = current_setting('test.on_demand_course_id')::uuid;
    raise exception 'Expected privileged target-mapping mutation to fail.';
  exception when others then
    if sqlerrm = 'Expected privileged target-mapping mutation to fail.' then raise; end if;
    if sqlerrm not like '%target mappings are append-only%' then raise; end if;
  end;
end;
$privileged_mapping_rewrite_is_denied$;

do $phase5f2_2_rollback_summary$
begin
  if (select count(*) from public.course_schedule_target_mapping_revisions
      where course_id in (
        current_setting('test.mapping_course_id')::uuid,
        current_setting('test.on_demand_course_id')::uuid
      )) < 4
    or (select count(*) from public.course_schedule_academic_slot_targets target
        join public.course_schedule_target_mapping_revisions revision
          on revision.id = target.mapping_revision_id
        where revision.course_id in (
          current_setting('test.mapping_course_id')::uuid,
          current_setting('test.on_demand_course_id')::uuid
        )) = 0 then
    raise exception 'The Phase 5.F.2.2 characterization did not create mapping history.';
  end if;
end;
$phase5f2_2_rollback_summary$;

rollback;
