-- Phase 2.A: authoritative Mentor -> Tutor -> Student relationship foundation.
-- Availability, lesson requests, Classes, credits, Forum data, and Dashboard
-- presentation preferences remain in their later vertical slices.

insert into public.authorization_capabilities (capability_key, description)
values ('relationships.manage', 'Create and activate Course-scoped Student and Tutor relationships.')
on conflict (capability_key) do update set description = excluded.description;

insert into public.role_capabilities (role_key, capability_key)
values ('mentor', 'relationships.manage'), ('admin', 'relationships.manage')
on conflict do nothing;

create table if not exists public.teaching_qualifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  curriculum_node_id uuid not null references public.curriculum_nodes(id) on delete restrict,
  status text not null default 'active',
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint teaching_qualifications_status_check check (status in ('active', 'revoked')),
  constraint teaching_qualifications_lifecycle_check check (
    (status = 'active' and revoked_by is null and revoked_at is null)
    or (status = 'revoked' and revoked_by is not null and revoked_at is not null)
  ),
  constraint teaching_qualifications_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint teaching_qualifications_user_node_key unique (user_id, curriculum_node_id)
);

create table if not exists public.mentor_tutor_assignments (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete restrict,
  tutor_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active',
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_by uuid references public.profiles(id) on delete restrict,
  ended_at timestamptz,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint mentor_tutor_assignments_distinct_people check (mentor_id <> tutor_id),
  constraint mentor_tutor_assignments_status_check check (status in ('active', 'ended')),
  constraint mentor_tutor_assignments_lifecycle_check check (
    (status = 'active' and ended_by is null and ended_at is null)
    or (status = 'ended' and ended_by is not null and ended_at is not null)
  ),
  constraint mentor_tutor_assignments_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists mentor_tutor_one_active_supervisor_idx
on public.mentor_tutor_assignments (tutor_id) where status = 'active';
create index if not exists mentor_tutor_active_mentor_idx
on public.mentor_tutor_assignments (mentor_id, tutor_id) where status = 'active';

create table if not exists public.student_courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  tutor_id uuid not null references public.profiles(id) on delete restrict,
  mentor_id uuid not null references public.profiles(id) on delete restrict,
  subject_node_id uuid not null references public.curriculum_nodes(id) on delete restrict,
  focus_node_id uuid not null references public.curriculum_nodes(id) on delete restrict,
  title text not null,
  service_model text not null,
  status text not null default 'draft',
  start_date date not null,
  scheduled_end_date date not null,
  wind_down_ends_on date generated always as (scheduled_end_date + 14) stored,
  idempotency_key text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint student_courses_distinct_people check (
    student_id <> tutor_id and student_id <> mentor_id and tutor_id <> mentor_id
  ),
  constraint student_courses_title_present check (btrim(title) <> '' and char_length(title) <= 180),
  constraint student_courses_service_model_check check (
    service_model in ('recurring', 'on_demand', 'access_only', 'independent_tutor')
  ),
  constraint student_courses_status_check check (
    status in ('draft', 'active', 'wind_down', 'completed', 'cancelled')
  ),
  constraint student_courses_dates_check check (scheduled_end_date >= start_date),
  constraint student_courses_idempotency_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint student_courses_lifecycle_check check (
    (status = 'draft' and activated_at is null and ended_at is null)
    or (status in ('active', 'wind_down') and activated_at is not null and ended_at is null)
    or (status in ('completed', 'cancelled') and ended_at is not null)
  ),
  constraint student_courses_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint student_courses_mentor_idempotency_key unique (mentor_id, idempotency_key)
);

create index if not exists student_courses_student_status_idx
on public.student_courses (student_id, status, updated_at desc);
create index if not exists student_courses_tutor_status_idx
on public.student_courses (tutor_id, status, updated_at desc);
create index if not exists student_courses_mentor_status_idx
on public.student_courses (mentor_id, status, updated_at desc);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null unique references public.student_courses(id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  inactivated_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint classrooms_status_check check (status in ('active', 'inactive', 'archived')),
  constraint classrooms_lifecycle_check check (
    (status = 'active' and inactivated_at is null and archived_at is null)
    or (status = 'inactive' and inactivated_at is not null and archived_at is null)
    or (status = 'archived' and inactivated_at is not null and archived_at is not null)
  ),
  constraint classrooms_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.classroom_memberships (
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  membership_role text not null,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  primary key (classroom_id, user_id, membership_role),
  constraint classroom_memberships_role_check check (
    membership_role in ('student', 'tutor', 'mentor', 'guardian')
  ),
  constraint classroom_memberships_status_check check (status in ('active', 'ended')),
  constraint classroom_memberships_lifecycle_check check (
    (status = 'active' and ended_at is null)
    or (status = 'ended' and ended_at is not null)
  ),
  constraint classroom_memberships_metadata_check check (jsonb_typeof(metadata) = 'object')
);
create index if not exists classroom_memberships_user_status_idx
on public.classroom_memberships (user_id, status, joined_at desc);

create table if not exists public.learning_relationship_events (
  id bigint generated by default as identity primary key,
  course_id uuid references public.student_courses(id) on delete restrict,
  classroom_id uuid references public.classrooms(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid references public.profiles(id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint learning_relationship_events_type_check check (
    event_type in (
      'qualification_granted', 'supervision_started', 'course_drafted',
      'course_activated', 'classroom_created', 'classroom_member_joined'
    )
  ),
  constraint learning_relationship_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);
create index if not exists learning_relationship_events_course_idx
on public.learning_relationship_events (course_id, occurred_at desc, id desc);

drop trigger if exists teaching_qualifications_set_updated_at on public.teaching_qualifications;
create trigger teaching_qualifications_set_updated_at before update on public.teaching_qualifications
for each row execute function public.set_updated_at();
drop trigger if exists mentor_tutor_assignments_set_updated_at on public.mentor_tutor_assignments;
create trigger mentor_tutor_assignments_set_updated_at before update on public.mentor_tutor_assignments
for each row execute function public.set_updated_at();
drop trigger if exists student_courses_set_updated_at on public.student_courses;
create trigger student_courses_set_updated_at before update on public.student_courses
for each row execute function public.set_updated_at();
drop trigger if exists classrooms_set_updated_at on public.classrooms;
create trigger classrooms_set_updated_at before update on public.classrooms
for each row execute function public.set_updated_at();

create or replace function public.curriculum_node_is_within(p_node_id uuid, p_scope_node_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  with recursive lineage as (
    select node.id, node.parent_id from public.curriculum_nodes node
    where node.id = p_node_id and node.status = 'active'
    union all
    select parent.id, parent.parent_id from public.curriculum_nodes parent
    join lineage child on child.parent_id = parent.id where parent.status = 'active'
  )
  select coalesce(exists (select 1 from lineage where id = p_scope_node_id), false);
$$;

create or replace function public.user_has_active_teaching_scope(
  p_user_id uuid, p_curriculum_node_id uuid
)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(exists (
    select 1 from public.teaching_qualifications qualification
    where qualification.user_id = p_user_id and qualification.status = 'active'
      and public.curriculum_node_is_within(
        p_curriculum_node_id, qualification.curriculum_node_id
      )
  ), false);
$$;

create or replace function public.user_can_access_student_course(p_user_id uuid, p_course_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(exists (
    select 1 from public.student_courses course
    where course.id = p_course_id
      and p_user_id in (course.student_id, course.tutor_id, course.mentor_id)
  ), false) or public.authorization_user_has_capability(p_user_id, 'authorization.manage');
$$;

create or replace function public.user_can_access_classroom(p_user_id uuid, p_classroom_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(exists (
    select 1 from public.classrooms classroom
    join public.student_courses course on course.id = classroom.course_id
    where classroom.id = p_classroom_id
      and p_user_id in (course.student_id, course.tutor_id, course.mentor_id)
  ), false) or public.authorization_user_has_capability(p_user_id, 'authorization.manage');
$$;

create or replace function public.grant_teaching_qualification(
  p_user_id uuid, p_curriculum_node_id uuid, p_reason text default ''
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare caller_id uuid := auth.uid(); qualification public.teaching_qualifications%rowtype;
begin
  if caller_id is null or not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    raise exception 'Only an authorization administrator can grant teaching qualifications.';
  end if;
  if not exists (
    select 1 from public.user_roles role_assignment
    where role_assignment.user_id = p_user_id and role_assignment.status = 'active'
      and role_assignment.role_key in ('teacher', 'tutor', 'mentor')
  ) then raise exception 'The qualification target must be an active Tutor, Teacher, or Mentor.'; end if;
  if not exists (
    select 1 from public.curriculum_nodes node
    where node.id = p_curriculum_node_id and node.status = 'active'
      and node.node_type in ('subject', 'track', 'topic')
  ) then raise exception 'The qualification curriculum scope is not active or selectable.'; end if;

  insert into public.teaching_qualifications (
    user_id, curriculum_node_id, status, granted_by, granted_at,
    revoked_by, revoked_at, reason
  ) values (
    p_user_id, p_curriculum_node_id, 'active', caller_id, clock_timestamp(),
    null, null, btrim(coalesce(p_reason, ''))
  ) on conflict (user_id, curriculum_node_id) do update set
    status = 'active', granted_by = caller_id, granted_at = clock_timestamp(),
    revoked_by = null, revoked_at = null, reason = excluded.reason
  returning * into qualification;

  insert into public.learning_relationship_events (
    actor_user_id, target_user_id, event_type, metadata
  ) values (
    caller_id, p_user_id, 'qualification_granted',
    jsonb_build_object('curriculumNodeId', p_curriculum_node_id)
  );
  return to_jsonb(qualification);
end;
$$;

create or replace function public.assign_tutor_supervisor(
  p_tutor_id uuid, p_mentor_id uuid, p_reason text default ''
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare caller_id uuid := auth.uid(); assignment public.mentor_tutor_assignments%rowtype;
begin
  if caller_id is null or not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    raise exception 'Only an authorization administrator can assign Tutor supervision.';
  end if;
  if p_tutor_id = p_mentor_id then raise exception 'A Tutor cannot supervise themselves.'; end if;
  if not exists (
    select 1 from public.user_roles role_assignment
    where role_assignment.user_id = p_tutor_id and role_assignment.status = 'active'
      and role_assignment.role_key in ('teacher', 'tutor')
  ) then raise exception 'The selected Tutor does not hold an active Tutor or Teacher role.'; end if;
  if not exists (
    select 1 from public.user_roles role_assignment
    where role_assignment.user_id = p_mentor_id and role_assignment.status = 'active'
      and role_assignment.role_key = 'mentor'
  ) then raise exception 'The selected Mentor does not hold an active Mentor role.'; end if;

  select * into assignment from public.mentor_tutor_assignments
  where tutor_id = p_tutor_id and status = 'active';
  if found then
    if assignment.mentor_id <> p_mentor_id then
      raise exception 'The Tutor already has a different active supervisory Mentor.';
    end if;
    return to_jsonb(assignment);
  end if;

  insert into public.mentor_tutor_assignments (mentor_id, tutor_id, assigned_by, reason)
  values (p_mentor_id, p_tutor_id, caller_id, btrim(coalesce(p_reason, '')))
  returning * into assignment;
  insert into public.learning_relationship_events (
    actor_user_id, target_user_id, event_type, metadata
  ) values (
    caller_id, p_tutor_id, 'supervision_started',
    jsonb_build_object('mentorId', p_mentor_id, 'assignmentId', assignment.id)
  );
  return to_jsonb(assignment);
end;
$$;

create or replace function public.create_student_course_draft(
  p_student_id uuid, p_tutor_id uuid, p_subject_node_id uuid,
  p_focus_node_id uuid, p_title text, p_service_model text,
  p_start_date date, p_scheduled_end_date date, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  caller_id uuid := auth.uid();
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_model text := lower(btrim(coalesce(p_service_model, '')));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  supervisory_mentor_id uuid;
  course public.student_courses%rowtype;
begin
  if caller_id is null or not public.authorization_user_has_capability(caller_id, 'relationships.manage') then
    raise exception 'Only a Mentor or authorization administrator can create a Course draft.';
  end if;
  if not exists (
    select 1 from public.user_roles role_assignment
    where role_assignment.user_id = p_student_id and role_assignment.role_key = 'student'
      and role_assignment.status = 'active'
  ) then raise exception 'The selected Student does not hold an active Student role.'; end if;

  select assignment.mentor_id into supervisory_mentor_id
  from public.mentor_tutor_assignments assignment
  where assignment.tutor_id = p_tutor_id and assignment.status = 'active';
  if supervisory_mentor_id is null then
    raise exception 'The selected Tutor does not have an active supervisory Mentor.';
  end if;
  if caller_id <> supervisory_mentor_id
    and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    raise exception 'Only the Tutor''s supervisory Mentor can create this Course draft.';
  end if;
  if normalized_title = '' or char_length(normalized_title) > 180 then
    raise exception 'A Course title between 1 and 180 characters is required.';
  end if;
  if normalized_model not in ('recurring', 'on_demand', 'access_only', 'independent_tutor') then
    raise exception 'The Course service model is invalid.';
  end if;
  if p_start_date is null or p_scheduled_end_date is null or p_scheduled_end_date < p_start_date then
    raise exception 'The Course schedule dates are invalid.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Course idempotency key is invalid.';
  end if;
  if not exists (
    select 1 from public.curriculum_nodes node
    where node.id = p_subject_node_id and node.status = 'active' and node.node_type = 'subject'
  ) then raise exception 'The Course Subject must be an active Subject node.'; end if;
  if not public.curriculum_node_is_within(p_focus_node_id, p_subject_node_id) then
    raise exception 'The Course focus must belong to the selected Subject.';
  end if;
  if not public.user_has_active_teaching_scope(p_tutor_id, p_focus_node_id) then
    raise exception 'The Tutor is not qualified for the selected Course focus.';
  end if;
  if not public.user_has_active_teaching_scope(supervisory_mentor_id, p_focus_node_id) then
    raise exception 'The Tutor''s supervisory Mentor is not qualified for the selected Course focus.';
  end if;

  select * into course from public.student_courses existing
  where existing.mentor_id = supervisory_mentor_id and existing.idempotency_key = normalized_key;
  if found then
    if course.student_id <> p_student_id or course.tutor_id <> p_tutor_id
      or course.subject_node_id <> p_subject_node_id or course.focus_node_id <> p_focus_node_id then
      raise exception 'The Course idempotency key is already bound to different participants or curriculum.';
    end if;
    return to_jsonb(course);
  end if;

  insert into public.student_courses (
    student_id, tutor_id, mentor_id, subject_node_id, focus_node_id,
    title, service_model, status, start_date, scheduled_end_date,
    idempotency_key, created_by
  ) values (
    p_student_id, p_tutor_id, supervisory_mentor_id, p_subject_node_id, p_focus_node_id,
    normalized_title, normalized_model, 'draft', p_start_date, p_scheduled_end_date,
    normalized_key, caller_id
  ) returning * into course;
  insert into public.learning_relationship_events (
    course_id, actor_user_id, target_user_id, event_type, metadata
  ) values (
    course.id, caller_id, p_student_id, 'course_drafted',
    jsonb_build_object('tutorId', p_tutor_id, 'mentorId', supervisory_mentor_id)
  );
  return to_jsonb(course);
end;
$$;

create or replace function public.activate_student_course(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  caller_id uuid := auth.uid();
  course public.student_courses%rowtype;
  classroom public.classrooms%rowtype;
  member record;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  select * into course from public.student_courses where id = p_course_id for update;
  if not found then raise exception 'The Course does not exist.'; end if;
  if caller_id <> course.mentor_id
    and not public.authorization_user_has_capability(caller_id, 'authorization.manage') then
    raise exception 'Only the Course Mentor can activate this Course.';
  end if;
  if course.status = 'active' then
    select * into classroom from public.classrooms where course_id = course.id;
    return jsonb_build_object('course', to_jsonb(course), 'classroom', to_jsonb(classroom));
  end if;
  if course.status <> 'draft' then raise exception 'Only a draft Course can be activated.'; end if;
  if not exists (
    select 1 from public.mentor_tutor_assignments assignment
    where assignment.tutor_id = course.tutor_id and assignment.mentor_id = course.mentor_id
      and assignment.status = 'active'
  ) then raise exception 'The Course Tutor supervision is no longer active.'; end if;
  if not public.user_has_active_teaching_scope(course.tutor_id, course.focus_node_id)
    or not public.user_has_active_teaching_scope(course.mentor_id, course.focus_node_id) then
    raise exception 'The Course teaching qualification scope is no longer valid.';
  end if;

  update public.student_courses set status = 'active', activated_at = clock_timestamp()
  where id = course.id returning * into course;
  insert into public.classrooms (course_id, status) values (course.id, 'active')
  returning * into classroom;

  for member in
    select course.student_id as user_id, 'student'::text as membership_role
    union all select course.tutor_id, 'tutor'::text
    union all select course.mentor_id, 'mentor'::text
  loop
    insert into public.classroom_memberships (classroom_id, user_id, membership_role, status)
    values (classroom.id, member.user_id, member.membership_role, 'active');
    insert into public.learning_relationship_events (
      course_id, classroom_id, actor_user_id, target_user_id, event_type, metadata
    ) values (
      course.id, classroom.id, caller_id, member.user_id, 'classroom_member_joined',
      jsonb_build_object('membershipRole', member.membership_role)
    );
  end loop;

  insert into public.learning_relationship_events (
    course_id, classroom_id, actor_user_id, target_user_id, event_type
  ) values
    (course.id, classroom.id, caller_id, course.student_id, 'course_activated'),
    (course.id, classroom.id, caller_id, course.student_id, 'classroom_created');
  return jsonb_build_object('course', to_jsonb(course), 'classroom', to_jsonb(classroom));
end;
$$;

create or replace function public.get_my_learning_relationships()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare caller_id uuid := auth.uid(); courses jsonb; supervisions jsonb;
begin
  if caller_id is null then raise exception 'Authentication is required to load learning relationships.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', course.id, 'title', course.title, 'status', course.status,
    'serviceModel', course.service_model, 'startDate', course.start_date,
    'scheduledEndDate', course.scheduled_end_date, 'windDownEndsOn', course.wind_down_ends_on,
    'student', jsonb_build_object('id', student.id, 'name', student.full_name),
    'tutor', jsonb_build_object('id', tutor.id, 'name', tutor.full_name),
    'mentor', jsonb_build_object('id', mentor.id, 'name', mentor.full_name),
    'subject', jsonb_build_object('id', subject.id, 'name', subject.name),
    'focus', jsonb_build_object('id', focus.id, 'name', focus.name),
    'classroom', case when classroom.id is null then null else jsonb_build_object(
      'id', classroom.id, 'status', classroom.status,
      'membershipRole', case when caller_id = course.student_id then 'student'
        when caller_id = course.tutor_id then 'tutor'
        when caller_id = course.mentor_id then 'mentor' else null end
    ) end
  ) order by course.created_at, course.id), '[]'::jsonb) into courses
  from public.student_courses course
  join public.profiles student on student.id = course.student_id
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.profiles mentor on mentor.id = course.mentor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  left join public.classrooms classroom on classroom.course_id = course.id
  where caller_id in (course.student_id, course.tutor_id, course.mentor_id)
    or public.authorization_user_has_capability(caller_id, 'authorization.manage');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment.id, 'mentorId', assignment.mentor_id,
    'tutorId', assignment.tutor_id, 'status', assignment.status,
    'startedAt', assignment.started_at
  ) order by assignment.started_at, assignment.id), '[]'::jsonb) into supervisions
  from public.mentor_tutor_assignments assignment
  where caller_id in (assignment.mentor_id, assignment.tutor_id)
    or public.authorization_user_has_capability(caller_id, 'authorization.manage');

  return jsonb_build_object('schemaVersion', 1, 'courses', courses, 'supervisions', supervisions);
end;
$$;

alter table public.teaching_qualifications enable row level security;
alter table public.mentor_tutor_assignments enable row level security;
alter table public.student_courses enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_memberships enable row level security;
alter table public.learning_relationship_events enable row level security;

create policy "Participants can read teaching qualifications"
on public.teaching_qualifications for select to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.mentor_tutor_assignments assignment
    where assignment.mentor_id = (select auth.uid())
      and assignment.tutor_id = teaching_qualifications.user_id and assignment.status = 'active'
  )
  or public.current_user_has_capability('authorization.manage')
);
create policy "Participants can read Tutor supervision"
on public.mentor_tutor_assignments for select to authenticated using (
  mentor_id = (select auth.uid()) or tutor_id = (select auth.uid())
  or public.current_user_has_capability('authorization.manage')
);
create policy "Participants can read Student Courses"
on public.student_courses for select to authenticated
using (public.user_can_access_student_course((select auth.uid()), id));
create policy "Participants can read Classrooms"
on public.classrooms for select to authenticated
using (public.user_can_access_classroom((select auth.uid()), id));
create policy "Participants can read Classroom memberships"
on public.classroom_memberships for select to authenticated
using (public.user_can_access_classroom((select auth.uid()), classroom_id));
create policy "Participants can read relationship events"
on public.learning_relationship_events for select to authenticated using (
  actor_user_id = (select auth.uid()) or target_user_id = (select auth.uid())
  or (course_id is not null and public.user_can_access_student_course((select auth.uid()), course_id))
  or public.current_user_has_capability('authorization.manage')
);

revoke all on public.teaching_qualifications from anon, authenticated;
revoke all on public.mentor_tutor_assignments from anon, authenticated;
revoke all on public.student_courses from anon, authenticated;
revoke all on public.classrooms from anon, authenticated;
revoke all on public.classroom_memberships from anon, authenticated;
revoke all on public.learning_relationship_events from anon, authenticated;
grant select on public.teaching_qualifications to authenticated;
grant select on public.mentor_tutor_assignments to authenticated;
grant select on public.student_courses to authenticated;
grant select on public.classrooms to authenticated;
grant select on public.classroom_memberships to authenticated;
grant select on public.learning_relationship_events to authenticated;

revoke all on function public.curriculum_node_is_within(uuid, uuid) from public, anon, authenticated;
revoke all on function public.user_has_active_teaching_scope(uuid, uuid) from public, anon, authenticated;
revoke all on function public.user_can_access_student_course(uuid, uuid) from public, anon, authenticated;
revoke all on function public.user_can_access_classroom(uuid, uuid) from public, anon, authenticated;
revoke all on function public.grant_teaching_qualification(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.assign_tutor_supervisor(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_student_course_draft(uuid, uuid, uuid, uuid, text, text, date, date, text) from public, anon, authenticated;
revoke all on function public.activate_student_course(uuid) from public, anon, authenticated;
revoke all on function public.get_my_learning_relationships() from public, anon, authenticated;
grant execute on function public.user_can_access_student_course(uuid, uuid) to authenticated;
grant execute on function public.user_can_access_classroom(uuid, uuid) to authenticated;
grant execute on function public.grant_teaching_qualification(uuid, uuid, text) to authenticated;
grant execute on function public.assign_tutor_supervisor(uuid, uuid, text) to authenticated;
grant execute on function public.create_student_course_draft(uuid, uuid, uuid, uuid, text, text, date, date, text) to authenticated;
grant execute on function public.activate_student_course(uuid) to authenticated;
grant execute on function public.get_my_learning_relationships() to authenticated;

comment on table public.student_courses is
  'Runtime Student Course relationships; authored Course Builder compositions remain reusable definitions.';
comment on table public.classrooms is
  'Persistent Course space identity. Forum, Files, schedule, and live-Class data are added later.';
