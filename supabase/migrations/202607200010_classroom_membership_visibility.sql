-- Phase 3.B: history-capable Classroom Memberships, retained-read authority,
-- and member-private Classroom presentation preferences.

alter table public.classroom_memberships
add column if not exists id uuid default gen_random_uuid();

update public.classroom_memberships
set id = gen_random_uuid()
where id is null;

alter table public.classroom_memberships
alter column id set default gen_random_uuid(),
alter column id set not null;

alter table public.classroom_memberships
drop constraint if exists classroom_memberships_pkey;

alter table public.classroom_memberships
add constraint classroom_memberships_pkey primary key (id);

create unique index if not exists classroom_memberships_one_active_tenure_idx
on public.classroom_memberships (classroom_id, user_id, membership_role)
where status = 'active';

create index if not exists classroom_memberships_history_idx
on public.classroom_memberships (
  classroom_id,
  user_id,
  membership_role,
  joined_at desc,
  ended_at desc
);

create table if not exists public.classroom_member_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, classroom_id)
);

create index if not exists classroom_member_preferences_user_archive_idx
on public.classroom_member_preferences (user_id, archived_at, classroom_id);

create or replace function public.enforce_classroom_member_preference()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.classroom_memberships membership
    where membership.classroom_id = new.classroom_id
      and membership.user_id = new.user_id
  ) then
    raise exception 'A Classroom Membership is required to store a member preference.';
  end if;

  if new.archived_at is not null and not exists (
    select 1
    from public.classrooms classroom
    join public.student_courses course on course.id = classroom.course_id
    where classroom.id = new.classroom_id
      and classroom.status in ('inactive', 'archived')
      and course.status in ('completed', 'cancelled')
  ) then
    raise exception 'Only an inactive retained Classroom can be personally archived.';
  end if;

  return new;
end;
$$;

drop trigger if exists classroom_member_preferences_enforce
on public.classroom_member_preferences;
create trigger classroom_member_preferences_enforce
before insert or update on public.classroom_member_preferences
for each row execute function public.enforce_classroom_member_preference();

drop trigger if exists classroom_member_preferences_set_updated_at
on public.classroom_member_preferences;
create trigger classroom_member_preferences_set_updated_at
before update on public.classroom_member_preferences
for each row execute function public.set_updated_at();

create or replace function public.current_user_can_participate_in_classroom(
  p_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1
    from public.classroom_memberships membership
    join public.classrooms classroom on classroom.id = membership.classroom_id
    join public.student_courses course on course.id = classroom.course_id
    where membership.classroom_id = p_classroom_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and classroom.status = 'active'
      and course.status in ('active', 'wind_down')
  ), false);
$$;

create or replace function public.current_user_can_read_classroom(
  p_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1
    from public.classroom_memberships membership
    where membership.classroom_id = p_classroom_id
      and membership.user_id = auth.uid()
  ), false)
  or public.authorization_user_has_capability(auth.uid(), 'authorization.manage');
$$;

create or replace function public.current_user_can_read_student_course(
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1
    from public.student_courses course
    where course.id = p_course_id
      and auth.uid() in (course.student_id, course.tutor_id, course.mentor_id)
  ), false)
  or coalesce(exists (
    select 1
    from public.classrooms classroom
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
    where classroom.course_id = p_course_id
      and membership.user_id = auth.uid()
  ), false)
  or public.authorization_user_has_capability(auth.uid(), 'authorization.manage');
$$;

drop policy if exists "Participants can read Student Courses"
on public.student_courses;
create policy "Authorized members can read Student Courses"
on public.student_courses for select to authenticated
using (public.current_user_can_read_student_course(id));

drop policy if exists "Participants can read Classrooms"
on public.classrooms;
create policy "Authorized members can read Classrooms"
on public.classrooms for select to authenticated
using (public.current_user_can_read_classroom(id));

drop policy if exists "Participants can read Classroom memberships"
on public.classroom_memberships;
create policy "Members can read only their own Classroom memberships"
on public.classroom_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or public.current_user_has_capability('authorization.manage')
);

drop policy if exists "Participants can read relationship events"
on public.learning_relationship_events;
create policy "Event participants can read relationship events"
on public.learning_relationship_events for select to authenticated
using (
  actor_user_id = (select auth.uid())
  or target_user_id = (select auth.uid())
  or public.current_user_has_capability('authorization.manage')
);

alter table public.classroom_member_preferences enable row level security;

drop policy if exists "Members can read their own Classroom preferences"
on public.classroom_member_preferences;
create policy "Members can read their own Classroom preferences"
on public.classroom_member_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and public.current_user_can_read_classroom(classroom_id)
);

revoke all on public.classroom_member_preferences from public, anon, authenticated;
grant select on public.classroom_member_preferences to authenticated;

revoke all on function public.current_user_can_participate_in_classroom(uuid)
from public, anon, authenticated;
revoke all on function public.current_user_can_read_classroom(uuid)
from public, anon, authenticated;
revoke all on function public.current_user_can_read_student_course(uuid)
from public, anon, authenticated;
grant execute on function public.current_user_can_participate_in_classroom(uuid)
to authenticated;
grant execute on function public.current_user_can_read_classroom(uuid)
to authenticated;
grant execute on function public.current_user_can_read_student_course(uuid)
to authenticated;

-- The arbitrary-user helpers are retained for owner-side compatibility but
-- are no longer exposed as browser RPCs or used by RLS policies.
revoke all on function public.user_can_access_student_course(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.user_can_access_classroom(uuid, uuid)
from public, anon, authenticated;

revoke all on function public.enforce_classroom_member_preference()
from public, anon, authenticated;

comment on table public.classroom_memberships is
  'Auditable Classroom access tenures. At most one active tenure exists per User, Classroom, and Membership role.';
comment on table public.classroom_member_preferences is
  'Member-private Classroom presentation state. Personal archive never mutates the shared Classroom lifecycle.';
comment on function public.current_user_can_participate_in_classroom(uuid) is
  'True only for the signed-in User with an active Membership in an active Classroom backed by an active or wind-down Course.';
comment on function public.current_user_can_read_classroom(uuid) is
  'Retained Classroom-shell visibility for the signed-in member or an authorization administrator; feature content applies its own tenure bounds.';
