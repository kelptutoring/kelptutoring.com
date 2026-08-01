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
  \echo 'The Phase 5.G.1 actors are not provisioned.'
  \quit 3
\endif

begin;

-- Presentation-state classification is characterized with a fixed clock so
-- the six-hour boundary remains deterministic regardless of test runtime.
do $canonical_meeting_states_are_deterministic$
declare
  projection jsonb := public.project_phase5g1_timeline_rows(
    jsonb_build_array(
      jsonb_build_object(
        'rowId', 'planned',
        'rowKind', 'meeting',
        'effectiveTimestamp', '2026-08-01T20:00:00Z',
        'durationMinutes', 60,
        'status', 'planned',
        'targetState', 'planned'
      ),
      jsonb_build_object(
        'rowId', 'awaiting',
        'rowKind', 'meeting',
        'effectiveTimestamp', '2026-08-01T14:00:00Z',
        'durationMinutes', 60,
        'status', 'confirmed',
        'targetState', 'confirmed'
      ),
      jsonb_build_object(
        'rowId', 'pending',
        'rowKind', 'meeting',
        'effectiveTimestamp', '2026-08-01T10:00:00Z',
        'durationMinutes', 60,
        'status', 'confirmed',
        'targetState', 'confirmed'
      ),
      jsonb_build_object(
        'rowId', 'delivered',
        'rowKind', 'meeting',
        'status', 'delivered'
      ),
      jsonb_build_object(
        'rowId', 'student-absent',
        'rowKind', 'meeting',
        'status', 'not_delivered',
        'attendanceBasis', 'student_no_show'
      ),
      jsonb_build_object(
        'rowId', 'tutor-absent',
        'rowKind', 'meeting',
        'status', 'not_delivered',
        'attendanceBasis', 'tutor_no_show'
      ),
      jsonb_build_object(
        'rowId', 'technical',
        'rowKind', 'meeting',
        'status', 'not_delivered',
        'attendanceBasis', 'technical_uncertain'
      ),
      jsonb_build_object(
        'rowId', 'outside-kelp',
        'rowKind', 'meeting',
        'status', 'not_delivered',
        'attendanceBasis', 'outside_kelp_claim'
      ),
      jsonb_build_object(
        'rowId', 'unverified',
        'rowKind', 'meeting',
        'status', 'not_delivered',
        'attendanceBasis', 'no_platform_presence'
      ),
      jsonb_build_object(
        'rowId', 'cancelled',
        'rowKind', 'meeting',
        'status', 'cancelled'
      ),
      jsonb_build_object(
        'rowId', 'guardian-awaiting',
        'rowKind', 'meeting',
        'section', 'next',
        'status', 'confirmed',
        'targetState', 'confirmed'
      ),
      jsonb_build_object(
        'rowId', 'guardian-pending',
        'rowKind', 'meeting',
        'section', 'past',
        'status', 'confirmed',
        'targetState', 'confirmed'
      ),
      jsonb_build_object(
        'rowId', 'date-only',
        'rowKind', 'planned_topic',
        'effectiveDate', '2026-08-02',
        'status', 'planned'
      )
    ),
    '2026-08-01T12:00:00Z'::timestamptz,
    'UTC'
  );
begin
  if projection #>> '{0,status}' <> 'planned'
    or projection #>> '{1,status}' <> 'awaiting'
    or projection #>> '{1,targetState}' <> 'locked'
    or projection #>> '{2,status}' <> 'pending_confirmation'
    or projection #>> '{3,status}' <> 'delivered'
    or projection #>> '{4,nonDeliveryReason}' <> 'student_absent'
    or projection #>> '{5,nonDeliveryReason}' <> 'tutor_absent'
    or projection #>> '{6,nonDeliveryReason}' <> 'technical_issue'
    or projection #>> '{7,nonDeliveryReason}'
      <> 'outside_kelp_unconfirmed'
    or projection #>> '{8,nonDeliveryReason}' <> 'unverified'
    or projection #>> '{9,status}' <> 'cancelled'
    or projection #>> '{10,status}' <> 'awaiting'
    or projection #>> '{11,status}' <> 'pending_confirmation'
    or projection #>> '{12,calendarPresentation,placement}'
      <> 'viewer_local_noon'
    or projection #>> '{12,calendarPresentation,displayLocalTime}' <> '12:00'
    or projection #>> '{12,calendarPresentation,blocksAvailability}' <> 'false'
  then
    raise exception 'The Phase 5.G.1 meeting or date-only presentation vocabulary is invalid.';
  end if;
end;
$canonical_meeting_states_are_deterministic$;

select set_config('test.read_contract_mentor_id', :'mentor_id', false);
select set_config('test.read_contract_tutor_id', :'tutor_id', false);
select set_config('test.read_contract_student_id', :'student_a_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.create_student_course_with_schedule_draft(
  :'student_a_id'::uuid,
  :'tutor_id'::uuid,
  '10000000-0000-4000-8000-000000000013'::uuid,
  '10000000-0000-4000-8000-000000000032'::uuid,
  'Phase 5.G.1 canonical read contract',
  'kelp',
  'on_demand',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'phase5g1-db-schedule',
    'name', 'Phase 5.G.1 module plan',
    'timeZone', 'UTC',
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'id', 'phase5g1-db-a',
        'title', 'Topic A',
        'startDate', current_date + 1,
        'endDate', current_date + 1
      ),
      jsonb_build_object(
        'id', 'phase5g1-db-b',
        'title', 'Topic B',
        'startDate', current_date + 8,
        'endDate', current_date + 8
      )
    )
  ),
  'phase5g1-db-course'
) ->> 'id') as read_contract_course_id \gset

select public.activate_student_course(:'read_contract_course_id'::uuid);
select set_config(
  'test.read_contract_course_id',
  :'read_contract_course_id',
  false
);

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $student_receives_modules_without_supervision_context$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.read_contract_course_id')::uuid
  );
begin
  if projection ->> 'schemaVersion' <> '2'
    or projection #>> '{contract,name}' <> 'course_schedule_read'
    or projection #>> '{contract,phase}' <> '5.G.1'
    or projection #>> '{contract,legacyMirror,authoritative}' <> 'false'
    or projection #>> '{featureStatus,unifiedScheduleReadContract}'
      <> 'active_phase_5g1'
    or projection #>> '{viewer,actorRole}' <> 'student'
    or projection #>> '{academicTrack,layoutMode}' <> 'modules'
    or jsonb_array_length(projection #> '{academicTrack,items}') <> 2
    or projection #>> '{permissions,canReadDetailedAcademicTrack}' <> 'true'
    or projection #>> '{permissions,canReadStaffContext}' <> 'false'
    or projection -> 'staffContext' <> '{}'::jsonb
    or nullif(
      projection #>> '{context,academicContext,educationLevel,name}',
      ''
    ) is null
    or projection #>> '{calendarPolicy,dateOnlyDisplayAnchor}'
      <> 'viewer_local_noon'
    or projection #>> '{calendarPolicy,assignmentDeadlinesAreIndependent}'
      <> 'true'
    or projection #>> '{calendarPolicy,assignmentDeadlineChangesMoveMeetings}'
      <> 'false'
    or projection #>> '{groups,next,0,calendarPresentation,isDateOnly}'
      <> 'true'
    or projection #>> '{groups,next,0,calendarPresentation,blocksAvailability}'
      <> 'false'
  then
    raise exception 'The Student did not receive the canonical module-based Schedule contract.';
  end if;
end;
$student_receives_modules_without_supervision_context$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $assigned_tutor_receives_modules_and_staff_context$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.read_contract_course_id')::uuid
  );
begin
  if projection #>> '{viewer,actorRole}' <> 'tutor'
    or projection #>> '{viewer,viewMode}' <> 'staff_audit'
    or projection #>> '{academicTrack,layoutMode}' <> 'modules'
    or projection #>> '{permissions,canReadStaffContext}' <> 'true'
    or projection #>> '{staffContext,mentor,id}'
      <> current_setting('test.read_contract_mentor_id')
    or jsonb_array_length(projection -> 'versionHistory') < 1
  then
    raise exception 'The assigned Tutor did not receive the detailed staff Schedule contract.';
  end if;
end;
$assigned_tutor_receives_modules_and_staff_context$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
do $supervising_mentor_receives_the_same_course_contract$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.read_contract_course_id')::uuid
  );
begin
  if projection #>> '{viewer,actorRole}' <> 'mentor'
    or projection #>> '{academicTrack,layoutMode}' <> 'modules'
    or projection #>> '{context,participants,student,id}'
      <> current_setting('test.read_contract_student_id')
    or projection #>> '{context,participants,tutor,id}'
      <> current_setting('test.read_contract_tutor_id')
  then
    raise exception 'The supervising Mentor did not receive the canonical Course context.';
  end if;
end;
$supervising_mentor_receives_the_same_course_contract$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $unrelated_actor_remains_denied$
begin
  begin
    perform public.get_my_unified_course_schedule(
      current_setting('test.read_contract_course_id')::uuid
    );
    raise exception 'Expected unrelated Phase 5.G.1 access to fail.';
  exception when others then
    if sqlerrm = 'Expected unrelated Phase 5.G.1 access to fail.' then
      raise;
    end if;
  end;
end;
$unrelated_actor_remains_denied$;

reset role;
insert into public.classroom_memberships (
  classroom_id, user_id, membership_role, status
)
select classroom.id, :'outsider_id'::uuid, 'guardian', 'active'
from public.classrooms classroom
where classroom.course_id = current_setting('test.read_contract_course_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $guardian_receives_only_the_higher_level_timeline$
declare
  projection jsonb := public.get_my_unified_course_schedule(
    current_setting('test.read_contract_course_id')::uuid
  );
begin
  if projection #>> '{viewer,viewMode}' <> 'guardian_summary'
    or projection #>> '{academicTrack,layoutMode}'
      <> 'higher_level_timeline'
    or jsonb_array_length(projection #> '{academicTrack,items}') <> 0
    or projection #>> '{permissions,canReadDetailedAcademicTrack}' <> 'false'
    or projection -> 'staffContext' <> '{}'::jsonb
    or (projection #> '{groups}')::text like '%resources%'
    or (projection #> '{groups}')::text like '%progress%'
    or (projection #> '{groups}')::text like '%attendanceBasis%'
  then
    raise exception 'The Guardian received detailed academic or staff Schedule data.';
  end if;
end;
$guardian_receives_only_the_higher_level_timeline$;

do $private_projection_helpers_remain_private$
begin
  if has_function_privilege(
      'authenticated',
      'public.get_my_unified_course_schedule_phase5f5(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.project_phase5g1_timeline_rows(jsonb,timestamp with time zone,text)',
      'EXECUTE'
    )
  then
    raise exception 'A private Phase 5.G.1 projection helper is browser-executable.';
  end if;
end;
$private_projection_helpers_remain_private$;

rollback;
