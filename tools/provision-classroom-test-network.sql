\set ON_ERROR_STOP on

-- Reset-safe interactive manual-QA graph:
--
--   Aldebarã (Mentor)
--     -> Thiago Kelp (Tutor)
--       -> Thiago D. (Student, recurring Algebra 1)
--       -> Thiago Dias (Student, on-demand Mechanics)
--
-- The two Schedules are injected from the generated Track catalogue by
-- local-supabase-acceptance.mjs. Curriculum rows therefore retain canonical
-- Session/content identity and a real planningHref instead of relying on title
-- matching. The deterministic nine-actor rollback fixtures are not modified.

select case when exists (
  select 1
  from public.profiles profile
  join public.user_roles role_assignment
    on role_assignment.user_id = profile.id
   and role_assignment.role_key = 'admin'
   and role_assignment.status = 'active'
  where profile.id = '90000000-0000-4000-8000-000000000005'::uuid
) then 1 else 0 end as local_admin_ready \gset

\if :local_admin_ready
\else
  \echo 'Provision the deterministic local acceptance actors first.'
  \quit 3
\endif

begin;

-- Aldebarã is the one manual-QA account that may be recreated after a local
-- reset. The three Thiago accounts are existing interactive accounts and are
-- intentionally never created or assigned a new password here.
do $create_missing_aldebara_account$
declare
  shared_password_hash text;
  aldebara_id constant uuid := '93000000-0000-4000-8000-000000000002'::uuid;
  aldebara_email constant text := 'al.van.astrea@gmail.com';
begin
  if exists (
    select 1 from auth.users existing
    where existing.id = aldebara_id
      and lower(existing.email) <> aldebara_email
  ) then
    raise exception 'Reserved local UUID % belongs to another account.', aldebara_id;
  end if;

  if not exists (
    select 1 from auth.users existing where lower(existing.email) = aldebara_email
  ) then
    select user_record.encrypted_password
    into shared_password_hash
    from auth.users user_record
    where user_record.id = '90000000-0000-4000-8000-000000000001'::uuid;

    if nullif(shared_password_hash, '') is null then
      raise exception
        'The acceptance Student password hash is unavailable. Re-run local provisioning.';
    end if;

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token,
      is_sso_user,
      is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      aldebara_id,
      'authenticated',
      'authenticated',
      aldebara_email,
      shared_password_hash,
      clock_timestamp(),
      '',
      '',
      '',
      '',
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email')
      ),
      jsonb_build_object(
        'sub', aldebara_id,
        'email', aldebara_email,
        'full_name', 'Aldebarã',
        'location_key', 'kelp:br:sp:sao-paulo',
        'email_verified', true,
        'phone_verified', false,
        'local_classroom_test_fixture', true
      ),
      false,
      clock_timestamp(),
      clock_timestamp(),
      null,
      '',
      '',
      '',
      '',
      false,
      false
    );

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      aldebara_id::text,
      aldebara_id,
      jsonb_build_object(
        'sub', aldebara_id,
        'email', aldebara_email,
        'full_name', 'Aldebarã',
        'location_key', 'kelp:br:sp:sao-paulo',
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()
    );
  end if;
end;
$create_missing_aldebara_account$;

select (
  select count(*)
  from public.profiles profile
  where lower(profile.email) in (
    'al.van.astrea@gmail.com',
    'thiago.loyola@kelptutoring.com',
    'thiago.d.loyola@gmail.com',
    'thiago.dias.loyola@gmail.com'
  )
) = 4 as manual_qa_accounts_ready
\gset

\if :manual_qa_accounts_ready
\else
  \echo 'All four interactive manual-QA accounts must exist before provisioning.'
  \quit 3
\endif

select id as manual_mentor_id
from public.profiles
where lower(email) = 'al.van.astrea@gmail.com'
\gset

select id as manual_tutor_id
from public.profiles
where lower(email) = 'thiago.loyola@kelptutoring.com'
\gset

select id as algebra_student_id
from public.profiles
where lower(email) = 'thiago.d.loyola@gmail.com'
\gset

select id as mechanics_student_id
from public.profiles
where lower(email) = 'thiago.dias.loyola@gmail.com'
\gset

-- Preserve the exact known legacy sandbox data as read-only former history.
create temporary table manual_qa_retiring_courses (
  id uuid primary key
) on commit drop;

insert into manual_qa_retiring_courses (id)
select course.id
from public.student_courses course
where course.idempotency_key in (
  'local-network-thiago-algebra-course',
  'local-network-aldebara-mechanics-course',
  'local-network-thiago-marina-course',
  'local-network-aldebara-oliver-course',
  'interactive-mentor-algebra-v1',
  'interactive-mentor-mechanics-v1'
);

update public.student_courses course
set status = 'completed',
    ended_at = coalesce(course.ended_at, clock_timestamp()),
    updated_at = clock_timestamp()
where course.id in (select retiring.id from manual_qa_retiring_courses retiring)
  and course.status in ('draft', 'active', 'wind_down');

update public.classrooms classroom
set status = 'inactive',
    inactivated_at = coalesce(classroom.inactivated_at, clock_timestamp()),
    archived_at = null,
    updated_at = clock_timestamp()
where classroom.course_id in (
    select retiring.id from manual_qa_retiring_courses retiring
  )
  and classroom.status = 'active';

update public.classroom_memberships membership
set status = 'ended',
    ended_at = coalesce(membership.ended_at, clock_timestamp())
where membership.classroom_id in (
    select classroom.id
    from public.classrooms classroom
    join manual_qa_retiring_courses retiring on retiring.id = classroom.course_id
  )
  and membership.status = 'active';

update public.course_assignments assignment
set status = 'cancelled',
    cancelled_at = coalesce(assignment.cancelled_at, clock_timestamp()),
    updated_at = clock_timestamp()
where assignment.id = '92000000-0000-4000-8000-000000000001'::uuid
  and assignment.status = 'assigned';

-- End only supervision relationships that conflict with the approved graph.
update public.mentor_tutor_assignments assignment
set status = 'ended',
    ended_by = '90000000-0000-4000-8000-000000000005'::uuid,
    ended_at = clock_timestamp(),
    reason = 'Retired by the approved local manual-QA graph normalization.',
    updated_at = clock_timestamp()
where assignment.status = 'active'
  and (
    assignment.tutor_id in (
      :'algebra_student_id'::uuid,
      :'mechanics_student_id'::uuid
    )
    or assignment.mentor_id in (
      :'algebra_student_id'::uuid,
      :'mechanics_student_id'::uuid
    )
    or (
      assignment.tutor_id = :'manual_tutor_id'::uuid
      and assignment.mentor_id <> :'manual_mentor_id'::uuid
    )
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000005',
  true
);

-- Establish each account's one unmistakable manual-QA workspace.
select public.grant_user_role(
  :'manual_mentor_id'::uuid,
  'mentor',
  'Manual QA: Aldebarã is the supervising Mentor.',
  true
)
where not exists (
  select 1
  from public.user_roles role_assignment
  where role_assignment.user_id = :'manual_mentor_id'::uuid
    and role_assignment.role_key = 'mentor'
    and role_assignment.status = 'active'
    and role_assignment.is_primary
);

select public.grant_user_role(
  :'manual_tutor_id'::uuid,
  'tutor',
  'Manual QA: Thiago Kelp is the assigned Tutor.',
  true
)
where not exists (
  select 1
  from public.user_roles role_assignment
  where role_assignment.user_id = :'manual_tutor_id'::uuid
    and role_assignment.role_key = 'tutor'
    and role_assignment.status = 'active'
    and role_assignment.is_primary
);

select public.grant_user_role(
  :'algebra_student_id'::uuid,
  'student',
  'Manual QA: Thiago D. is the recurring Algebra 1 Student.',
  true
)
where not exists (
  select 1
  from public.user_roles role_assignment
  where role_assignment.user_id = :'algebra_student_id'::uuid
    and role_assignment.role_key = 'student'
    and role_assignment.status = 'active'
    and role_assignment.is_primary
);

select public.grant_user_role(
  :'mechanics_student_id'::uuid,
  'student',
  'Manual QA: Thiago Dias is the on-demand Mechanics Student.',
  true
)
where not exists (
  select 1
  from public.user_roles role_assignment
  where role_assignment.user_id = :'mechanics_student_id'::uuid
    and role_assignment.role_key = 'student'
    and role_assignment.status = 'active'
    and role_assignment.is_primary
);

select public.revoke_user_role(
  role_assignment.user_id,
  role_assignment.role_key,
  'Manual QA role normalization.'
)
from public.user_roles role_assignment
where role_assignment.status = 'active'
  and (
    (
      role_assignment.user_id = :'manual_mentor_id'::uuid
      and role_assignment.role_key <> 'mentor'
    )
    or (
      role_assignment.user_id = :'manual_tutor_id'::uuid
      and role_assignment.role_key <> 'tutor'
    )
    or (
      role_assignment.user_id in (
        :'algebra_student_id'::uuid,
        :'mechanics_student_id'::uuid
      )
      and role_assignment.role_key <> 'student'
    )
  );

reset role;

-- Student-only manual-QA accounts must not retain active teaching authority.
update public.teaching_qualifications qualification
set status = 'revoked',
    revoked_by = '90000000-0000-4000-8000-000000000005'::uuid,
    revoked_at = clock_timestamp(),
    reason = 'Manual QA role normalization.',
    updated_at = clock_timestamp()
where qualification.user_id in (
    :'algebra_student_id'::uuid,
    :'mechanics_student_id'::uuid
  )
  and qualification.status = 'active';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000005',
  true
);

-- The interactive manual-QA Tutor and Mentor intentionally cover every active
-- Subject so a human tester can exercise cross-Track and cross-Subject
-- Schedule revisions without fixture-only qualification failures. This does
-- not relax production authorization: publication still validates the
-- assigned Tutor against every selected branch under Phase 5.G.2.4.4.
select public.grant_teaching_qualification(
  actor.user_id,
  subject.id,
  concat(
    'Manual QA ',
    actor.actor_label,
    ' full active-Subject coverage for ',
    subject.name,
    '.'
  )
)
from (
  values
    (:'manual_mentor_id'::uuid, 'Mentor'),
    (:'manual_tutor_id'::uuid, 'Tutor')
) as actor(user_id, actor_label)
cross join public.curriculum_nodes subject
where subject.node_type = 'subject'
  and subject.status = 'active'
  and not exists (
    select 1
    from public.teaching_qualifications qualification
    where qualification.user_id = actor.user_id
      and qualification.curriculum_node_id = subject.id
      and qualification.status = 'active'
  );

-- Keep exact Course-focus qualifications as explicit fixtures for the legacy
-- activation path while all-Subject grants support later manual revisions.
select public.grant_teaching_qualification(
  actor.user_id,
  actor.curriculum_node_id,
  actor.reason
)
from (
  values
    (
      :'manual_mentor_id'::uuid,
      '10000000-0000-4000-8000-000000000022'::uuid,
      'Manual QA Mentor Algebra 1 activation coverage.'
    ),
    (
      :'manual_mentor_id'::uuid,
      '10000000-0000-4000-8000-000000000032'::uuid,
      'Manual QA Mentor Mechanics activation coverage.'
    ),
    (
      :'manual_tutor_id'::uuid,
      '10000000-0000-4000-8000-000000000022'::uuid,
      'Manual QA Tutor Algebra 1 teaching coverage.'
    ),
    (
      :'manual_tutor_id'::uuid,
      '10000000-0000-4000-8000-000000000032'::uuid,
      'Manual QA Tutor Mechanics teaching coverage.'
    )
) as actor(user_id, curriculum_node_id, reason)
where not exists (
  select 1
  from public.teaching_qualifications qualification
  where qualification.user_id = actor.user_id
    and qualification.curriculum_node_id = actor.curriculum_node_id
    and qualification.status = 'active'
);

select public.assign_tutor_supervisor(
  :'manual_tutor_id'::uuid,
  :'manual_mentor_id'::uuid,
  'Manual QA: Aldebarã supervises Thiago Kelp.'
);

select (
  public.create_student_course_with_schedule_draft(
    :'algebra_student_id'::uuid,
    :'manual_tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000012'::uuid,
    '10000000-0000-4000-8000-000000000022'::uuid,
    'Thiago D. · Algebra 1',
    'kelp',
    'recurring',
    convert_from(
      decode('@@ALGEBRA_SCHEDULE_BASE64@@', 'base64'),
      'utf8'
    )::jsonb,
    'manual-qa-thiago-d-algebra-v1'
  ) ->> 'id'
) as algebra_course_id
\gset

select public.activate_student_course(:'algebra_course_id'::uuid);

select (
  public.create_student_course_with_schedule_draft(
    :'mechanics_student_id'::uuid,
    :'manual_tutor_id'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000032'::uuid,
    'Thiago Dias · Mechanics',
    'kelp',
    'on_demand',
    convert_from(
      decode('@@MECHANICS_SCHEDULE_BASE64@@', 'base64'),
      'utf8'
    )::jsonb,
    'manual-qa-thiago-dias-mechanics-v1'
  ) ->> 'id'
) as mechanics_course_id
\gset

select public.activate_student_course(:'mechanics_course_id'::uuid);

reset role;

select (
  select count(*)
  from public.user_roles role_assignment
  where role_assignment.status = 'active'
    and (
      (
        role_assignment.user_id = :'manual_mentor_id'::uuid
        and role_assignment.role_key = 'mentor'
        and role_assignment.is_primary
      )
      or (
        role_assignment.user_id = :'manual_tutor_id'::uuid
        and role_assignment.role_key = 'tutor'
        and role_assignment.is_primary
      )
      or (
        role_assignment.user_id in (
          :'algebra_student_id'::uuid,
          :'mechanics_student_id'::uuid
        )
        and role_assignment.role_key = 'student'
        and role_assignment.is_primary
      )
    )
) = 4
and (
  select count(*)
  from public.user_roles role_assignment
  where role_assignment.status = 'active'
    and role_assignment.user_id in (
      :'manual_mentor_id'::uuid,
      :'manual_tutor_id'::uuid,
      :'algebra_student_id'::uuid,
      :'mechanics_student_id'::uuid
    )
) = 4 as manual_roles_ready
\gset

\if :manual_roles_ready
\else
  \echo 'The four manual-QA accounts do not have their one expected active role.'
  \quit 3
\endif

select not exists (
  select 1
  from (
    values
      (:'manual_mentor_id'::uuid),
      (:'manual_tutor_id'::uuid)
  ) actor(user_id)
  cross join public.curriculum_nodes subject
  where subject.node_type = 'subject'
    and subject.status = 'active'
    and not exists (
      select 1
      from public.teaching_qualifications qualification
      where qualification.user_id = actor.user_id
        and qualification.curriculum_node_id = subject.id
        and qualification.status = 'active'
    )
) as manual_qualification_coverage_ready
\gset

\if :manual_qualification_coverage_ready
\else
  \echo 'Manual QA Tutor/Mentor active-Subject qualification coverage failed.'
  \quit 3
\endif

select (
  select count(*)
  from public.mentor_tutor_assignments assignment
  where assignment.status = 'active'
    and assignment.mentor_id = :'manual_mentor_id'::uuid
    and assignment.tutor_id = :'manual_tutor_id'::uuid
) = 1 as manual_supervision_ready
\gset

\if :manual_supervision_ready
\else
  \echo 'The Aldebarã-to-Thiago-Kelp supervision relationship is incomplete.'
  \quit 3
\endif

select (
  select count(*)
  from public.student_courses course
  join public.classrooms classroom
    on classroom.course_id = course.id
   and classroom.status = 'active'
  where course.id in (
    :'algebra_course_id'::uuid,
    :'mechanics_course_id'::uuid
  )
    and course.status = 'active'
    and course.mentor_id = :'manual_mentor_id'::uuid
    and course.tutor_id = :'manual_tutor_id'::uuid
) = 2 as manual_classrooms_ready
\gset

\if :manual_classrooms_ready
\else
  \echo 'The two manual-QA Courses and Classrooms were not activated.'
  \quit 3
\endif

select not exists (
  select 1
  from public.student_courses course
  where course.idempotency_key in (
    'local-network-thiago-algebra-course',
    'local-network-aldebara-mechanics-course',
    'local-network-thiago-marina-course',
    'local-network-aldebara-oliver-course',
    'interactive-mentor-algebra-v1',
    'interactive-mentor-mechanics-v1'
  )
    and course.status in ('draft', 'active', 'wind_down')
) as legacy_network_retired
\gset

\if :legacy_network_retired
\else
  \echo 'A known legacy sandbox Course remains active.'
  \quit 3
\endif

select (
  select count(*)
  from public.course_schedule_items item
  join public.student_courses course
    on course.active_schedule_version_id = item.version_id
  where course.id in (
    :'algebra_course_id'::uuid,
    :'mechanics_course_id'::uuid
  )
    and item.item_kind = 'curriculum_topic'
) = 16
and not exists (
  select 1
  from public.course_schedule_items item
  join public.student_courses course
    on course.active_schedule_version_id = item.version_id
  where course.id in (
    :'algebra_course_id'::uuid,
    :'mechanics_course_id'::uuid
  )
    and item.item_kind = 'curriculum_topic'
    and (
      nullif(item.source_snapshot ->> 'sourceSessionId', '') is null
      or nullif(item.source_snapshot ->> 'sourceContentVersionKey', '') is null
      or nullif(item.source_snapshot ->> 'sourceModuleKey', '') is null
      or nullif(item.source_snapshot ->> 'planningHref', '') is null
    )
) as canonical_schedule_sources_ready
\gset

\if :canonical_schedule_sources_ready
\else
  \echo 'A manual-QA curriculum topic is missing its canonical Track destination.'
  \quit 3
\endif

commit;

\echo 'Interactive manual-QA Classroom network provisioned and verified.'
\echo 'Mentor: Aldebarã (al.van.astrea@gmail.com)'
\echo 'Tutor: Thiago Kelp (thiago.loyola@kelptutoring.com)'
\echo 'Student: Thiago D. (thiago.d.loyola@gmail.com) -> recurring Algebra 1'
\echo 'Student: Thiago Dias (thiago.dias.loyola@gmail.com) -> on-demand Mechanics'
\echo 'Known legacy sandbox Courses were retained as inactive history.'
\echo 'All 16 curriculum topics use canonical Track Session destinations.'
