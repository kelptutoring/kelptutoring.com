\set ON_ERROR_STOP on

\if :{?admin_id}
\else
  \echo 'Missing required actor variable: admin_id'
  \quit 3
\endif
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
    :'admin_id'::uuid,
    :'mentor_id'::uuid,
    :'tutor_id'::uuid,
    :'student_a_id'::uuid,
    :'student_b_id'::uuid,
    :'outsider_id'::uuid
  )
) = 6 then 1 else 0 end as actors_ready \gset

\if :actors_ready
\else
  \echo 'The Phase 5.F.4 actors are not provisioned.'
  \quit 3
\endif

begin;
select set_config('test.unified_admin_id', :'admin_id', false);
select set_config('test.unified_mentor_id', :'mentor_id', false);
select set_config('test.unified_tutor_id', :'tutor_id', false);
select set_config('test.unified_student_id', :'student_a_id', false);
select set_config('test.unified_qa_id', :'student_b_id', false);
select set_config('test.unified_guardian_id', :'outsider_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.F.4 unified timeline',
  'kelp',
  'recurring',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5f4-db-schedule',
    'name', 'Phase 5.F.4 unified plan',
    'timeZone', 'UTC',
    'cadence', jsonb_build_object('frequency', 'weekly'),
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5f4-db-a',
        'title', 'Topic A',
        'startDate', current_date,
        'endDate', current_date
      ),
      jsonb_build_object(
        'id', 'phase5f4-db-b',
        'title', 'Topic B',
        'startDate', current_date + 7,
        'endDate', current_date + 7
      ),
      jsonb_build_object(
        'id', 'phase5f4-db-c',
        'title', 'Topic C',
        'startDate', current_date + 14,
        'endDate', current_date + 14
      )
    )
  ),
  'phase5f4-db-course'
) ->> 'id') as unified_course_id \gset
select public.activate_student_course(:'unified_course_id'::uuid);
select set_config('test.unified_course_id', :'unified_course_id', false);

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.publish_course_meeting_pattern_version(
  :'unified_course_id'::uuid,
  (select active_schedule_version_id
   from public.student_courses where id = :'unified_course_id'::uuid),
  current_date,
  current_date + 14,
  jsonb_build_array(jsonb_build_object(
    'stablePatternKey', 'phase5f4-weekly',
    'weekday', extract(dow from current_date)::integer,
    'localStartTime', '00:01',
    'durationMinutes', 60,
    'position', 0
  )),
  'The unified timeline needs three neutral weekly opportunities.',
  'The private pattern note must remain staff-only.',
  'phase5f4-db-pattern'
) as unified_pattern_publish \gset

select set_config(
  'test.unified_version_id',
  :'unified_pattern_publish'::jsonb ->> 'publishedVersionId',
  false
);
select slot.id as unified_first_slot_id
from public.course_schedule_academic_slots slot
where slot.version_id = current_setting('test.unified_version_id')::uuid
order by slot.position, slot.id limit 1 \gset
select slot.id as unified_second_slot_id
from public.course_schedule_academic_slots slot
where slot.version_id = current_setting('test.unified_version_id')::uuid
order by slot.position, slot.id offset 1 limit 1 \gset

-- The Tutor-delivered occurrence marks Topic A Studied in the same command.
-- The unified projection must embed that progress in the meeting row instead
-- of rendering a duplicate independent-progress row.
select public.record_course_occurrence_outcome(
  :'unified_first_slot_id'::uuid,
  null,
  'delivered',
  'curriculum_topic',
  'recurring',
  'joint_presence_verified',
  'full_charge',
  true,
  'Topic A was delivered and completed in the scheduled lesson.',
  'This private completion note is visible only to authorized staff.',
  '{}'::uuid[],
  'phase5f4-db-delivered-a'
);

-- Simulate the scheduled T-6h job for the second occurrence. Phase 5.G.1 keeps
-- the immutable target lock but presents a far-future meeting as Planned until
-- the viewer actually enters its six-hour hold.
reset role;
select public.lock_course_schedule_slot_target(
  :'unified_second_slot_id'::uuid,
  public.course_schedule_slot_starts_at(
    (select slot from public.course_schedule_academic_slots slot
     where slot.id = :'unified_second_slot_id'::uuid)
  ) - interval '6 hours',
  'trusted_backfill'
);

update public.user_preferences
set time_zone = 'Asia/Damascus', time_zone_confirmed_at = clock_timestamp()
where user_id = current_setting('test.unified_student_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_receives_one_public_timeline$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.unified_course_id')::uuid
  );
begin
  if projection #>> '{viewer,actorRole}' <> 'student'
    or projection #>> '{viewer,viewMode}' <> 'student'
    or projection #>> '{schedule,timeZone}' <> 'Asia/Damascus'
    or projection #>> '{featureStatus,unifiedScheduleProjection}'
      <> 'active_phase_5f4'
    or projection #>> '{groups,past,0,rowKind}' <> 'meeting'
    or projection #>> '{groups,past,0,status}' <> 'delivered'
    or projection #>> '{groups,past,0,progress,studied,marked}' <> 'true'
    or projection #>> '{groups,next,0,status}' <> 'planned'
    or projection #>> '{groups,next,0,targetState}' <> 'locked'
    or projection #>> '{groups,upcoming,0,status}' <> 'planned'
    or projection #> '{groups,past,0,privateStaffNote}' is not null
    or jsonb_array_length(projection -> 'versionHistory') <> 0
    or (
      select count(*)
      from jsonb_array_elements(
        (projection #> '{groups,past}')
        || (projection #> '{groups,next}')
        || (projection #> '{groups,upcoming}')
      ) row
      where row ->> 'stableItemKey' = 'phase5f4-db-a'
    ) <> 1
  then
    raise exception 'The Student did not receive one redacted Past/Next/Upcoming timeline.';
  end if;
end;
$student_receives_one_public_timeline$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $assigned_tutor_receives_staff_audit_detail$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.unified_course_id')::uuid
  );
begin
  if projection #>> '{viewer,viewMode}' <> 'staff_audit'
    or projection #>> '{schedule,timeZone}' <> 'UTC'
    or projection #>> '{permissions,canReadPrivateStaffNotes}' <> 'true'
    or projection #>> '{groups,past,0,privateStaffNote}'
      <> 'This private completion note is visible only to authorized staff.'
    or jsonb_array_length(projection -> 'versionHistory') < 2
  then
    raise exception 'The assigned Tutor did not receive the staff audit projection.';
  end if;
end;
$assigned_tutor_receives_staff_audit_detail$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $supervising_mentor_receives_staff_audit_detail$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.unified_course_id')::uuid
  );
begin
  if projection #>> '{viewer,actorRole}' <> 'mentor'
    or projection #>> '{viewer,viewMode}' <> 'staff_audit'
    or projection #>> '{permissions,canReadVersionHistory}' <> 'true'
  then
    raise exception 'The supervising Mentor did not receive the staff audit projection.';
  end if;
end;
$supervising_mentor_receives_staff_audit_detail$;

-- A normal unrelated actor is denied before receiving scoped QA authority.
select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $unrelated_actor_is_denied$
begin
  begin
    perform public.get_my_unified_course_schedule(
      current_setting('test.unified_course_id')::uuid
    );
    raise exception 'Expected unrelated unified-Schedule access to fail.';
  exception when others then
    if sqlerrm = 'Expected unrelated unified-Schedule access to fail.' then
      raise;
    end if;
  end;
end;
$unrelated_actor_is_denied$;

select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.grant_user_role(
  :'student_b_id'::uuid,
  'quality_assistant',
  'Phase 5.F.4 rollback-only unified projection characterization.',
  false
);
select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $quality_assistant_receives_staff_audit_detail$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.unified_course_id')::uuid
  );
begin
  if projection #>> '{viewer,actorRole}' <> 'quality_assistant'
    or projection #>> '{viewer,viewMode}' <> 'staff_audit'
    or projection #>> '{permissions,canReadEvidence}' <> 'true'
  then
    raise exception 'The Quality Assistant did not receive outcome oversight.';
  end if;
end;
$quality_assistant_receives_staff_audit_detail$;

-- The Guardian receives only the high-level plan. Lesson attendance, charge
-- recommendations, progress detail, evidence, and staff history stay hidden.
reset role;
insert into public.classroom_memberships (
  classroom_id, user_id, membership_role, status
)
select classroom.id, :'outsider_id'::uuid, 'guardian', 'active'
from public.classrooms classroom
where classroom.course_id = current_setting('test.unified_course_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $guardian_receives_only_higher_level_schedule$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.unified_course_id')::uuid
  );
  serialized text := projection #>> '{groups}';
begin
  if projection #>> '{viewer,viewMode}' <> 'guardian_summary'
    or projection #>> '{permissions,canReadProgressDetails}' <> 'false'
    or projection #>> '{groups,past,0,title}' <> 'Topic A'
    or serialized like '%attendanceBasis%'
    or serialized like '%chargeRecommendation%'
    or serialized like '%progress%'
    or serialized like '%resources%'
    or serialized like '%evidence%'
    or jsonb_array_length(projection -> 'versionHistory') <> 0
  then
    raise exception 'The Guardian projection exposed lesson-level or staff-only detail.';
  end if;
end;
$guardian_receives_only_higher_level_schedule$;

rollback;
