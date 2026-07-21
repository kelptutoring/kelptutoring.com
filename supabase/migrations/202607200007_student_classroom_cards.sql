-- Phase 2.D: active Classroom Cards and an authenticated Classroom-space projection.

create table if not exists public.student_classroom_card_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  position integer not null default 2147483647,
  color_key text not null default 'ocean' references public.profile_theme_presets(theme_key) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, classroom_id),
  constraint student_classroom_card_preferences_position_check check (position >= 0)
);

create index if not exists student_classroom_card_preferences_user_position_idx
on public.student_classroom_card_preferences (user_id, position, classroom_id);

drop trigger if exists student_classroom_card_preferences_set_updated_at
on public.student_classroom_card_preferences;
create trigger student_classroom_card_preferences_set_updated_at
before update on public.student_classroom_card_preferences
for each row execute function public.set_updated_at();

alter table public.student_classroom_card_preferences enable row level security;

drop policy if exists "Students can read their Classroom Card preferences"
on public.student_classroom_card_preferences;
create policy "Students can read their Classroom Card preferences"
on public.student_classroom_card_preferences for select to authenticated using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.classroom_memberships membership
    join public.classrooms classroom on classroom.id = membership.classroom_id
    where membership.classroom_id = student_classroom_card_preferences.classroom_id
      and membership.user_id = (select auth.uid())
      and membership.membership_role = 'student'
      and membership.status = 'active'
      and classroom.status = 'active'
  )
);

revoke all on public.student_classroom_card_preferences from anon, authenticated;
grant select on public.student_classroom_card_preferences to authenticated;

create or replace function public.get_my_student_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  profile_record public.profiles%rowtype;
  preference_record public.student_dashboard_preferences%rowtype;
  classrooms jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to load this Dashboard.';
  end if;

  select * into profile_record from public.profiles where id = caller_id;
  if not found then
    raise exception 'The authenticated Student Profile is unavailable.';
  end if;

  select * into preference_record
  from public.student_dashboard_preferences
  where user_id = caller_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', course.id,
    'courseTitle', course.title,
    'courseStatus', course.status,
    'serviceModel', course.service_model,
    'startDate', course.start_date,
    'scheduledEndDate', course.scheduled_end_date,
    'subject', jsonb_build_object('id', subject.id, 'name', subject.name),
    'focus', jsonb_build_object('id', focus.id, 'name', focus.name),
    'tutor', jsonb_build_object('id', tutor.id, 'name', tutor.full_name),
    'classroom', jsonb_build_object(
      'id', classroom.id,
      'status', classroom.status,
      'membershipRole', membership.membership_role
    ),
    'card', jsonb_build_object(
      'colorKey', coalesce(card.color_key, 'ocean'),
      'position', card.position
    )
  ) order by
    coalesce(card.position, 2147483647),
    course.title,
    classroom.id
  ), '[]'::jsonb) into classrooms
  from public.classroom_memberships membership
  join public.classrooms classroom on classroom.id = membership.classroom_id
  join public.student_courses course on course.id = classroom.course_id
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  left join public.student_classroom_card_preferences card
    on card.user_id = caller_id and card.classroom_id = classroom.id
  where membership.user_id = caller_id
    and membership.membership_role = 'student'
    and membership.status = 'active'
    and classroom.status = 'active'
    and course.student_id = caller_id
    and course.status in ('active', 'wind_down');

  return jsonb_build_object(
    'schemaVersion', 3,
    'viewer', jsonb_build_object(
      'id', profile_record.id,
      'name', profile_record.full_name
    ),
    'preferences', jsonb_build_object(
      'blockOrder', coalesce(to_jsonb(preference_record.block_order), '["calendar","classrooms"]'::jsonb),
      'calendarView', coalesce(preference_record.calendar_view, 'month'),
      'collapsedBlocks', coalesce(to_jsonb(preference_record.collapsed_blocks), '[]'::jsonb),
      'revision', coalesce(preference_record.revision, 1),
      'updatedAt', preference_record.updated_at
    ),
    'classrooms', classrooms,
    'featureStatus', jsonb_build_object(
      'classroomCards', 'active_phase_2d',
      'classroomSpace', 'foundation_phase_2d',
      'calendarData', 'pending_phase_2e',
      'credits', 'pending_credit_phase'
    )
  );
end;
$$;

create or replace function public.save_my_student_classroom_card_color(
  p_classroom_id uuid,
  p_color_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  requested_color text := lower(btrim(coalesce(p_color_key, '')));
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to customize Classroom Cards.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required.';
  end if;
  if not exists (
    select 1 from public.profile_theme_presets
    where theme_key = requested_color and active
  ) then
    raise exception 'Classroom Card color is not available.';
  end if;
  if not exists (
    select 1
    from public.classroom_memberships membership
    join public.classrooms classroom on classroom.id = membership.classroom_id
    join public.student_courses course on course.id = classroom.course_id
    where membership.classroom_id = p_classroom_id
      and membership.user_id = caller_id
      and membership.membership_role = 'student'
      and membership.status = 'active'
      and classroom.status = 'active'
      and course.student_id = caller_id
      and course.status in ('active', 'wind_down')
  ) then
    raise exception 'An active Student Classroom membership is required.';
  end if;

  insert into public.student_classroom_card_preferences (
    user_id, classroom_id, color_key
  ) values (
    caller_id, p_classroom_id, requested_color
  )
  on conflict (user_id, classroom_id) do update set
    color_key = excluded.color_key;

  return public.get_my_student_dashboard();
end;
$$;

create or replace function public.save_my_student_classroom_card_order(
  p_classroom_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  active_classroom_ids uuid[];
  requested_distinct_count integer;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to reorder Classroom Cards.';
  end if;
  if p_classroom_ids is null
    or (cardinality(p_classroom_ids) > 0 and array_ndims(p_classroom_ids) is distinct from 1) then
    raise exception 'Classroom Card order must be a one-dimensional array.';
  end if;
  if exists (select 1 from unnest(p_classroom_ids) item(id) where item.id is null) then
    raise exception 'Classroom Card order cannot contain an empty Classroom.';
  end if;

  select count(distinct item.id) into requested_distinct_count
  from unnest(p_classroom_ids) item(id);
  if requested_distinct_count <> cardinality(p_classroom_ids) then
    raise exception 'Classroom Card order cannot contain duplicates.';
  end if;

  select coalesce(array_agg(classroom.id order by classroom.id), '{}'::uuid[])
    into active_classroom_ids
  from public.classroom_memberships membership
  join public.classrooms classroom on classroom.id = membership.classroom_id
  join public.student_courses course on course.id = classroom.course_id
  where membership.user_id = caller_id
    and membership.membership_role = 'student'
    and membership.status = 'active'
    and classroom.status = 'active'
    and course.student_id = caller_id
    and course.status in ('active', 'wind_down');

  if cardinality(p_classroom_ids) <> cardinality(active_classroom_ids)
    or not p_classroom_ids @> active_classroom_ids
    or not active_classroom_ids @> p_classroom_ids then
    raise exception 'Classroom Card order must contain every active Student Classroom exactly once.';
  end if;

  insert into public.student_classroom_card_preferences (
    user_id, classroom_id, position
  )
  select caller_id, item.id, (item.ordinality - 1)::integer
  from unnest(p_classroom_ids) with ordinality item(id, ordinality)
  on conflict (user_id, classroom_id) do update set
    position = excluded.position;

  return public.get_my_student_dashboard();
end;
$$;

create or replace function public.get_my_classroom_space(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open a Classroom.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required.';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'viewer', jsonb_build_object(
      'id', caller_id,
      'membershipRole', membership.membership_role
    ),
    'classroom', jsonb_build_object(
      'id', classroom.id,
      'status', classroom.status,
      'createdAt', classroom.created_at
    ),
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'serviceModel', course.service_model,
      'startDate', course.start_date,
      'scheduledEndDate', course.scheduled_end_date
    ),
    'subject', jsonb_build_object('id', subject.id, 'name', subject.name),
    'focus', jsonb_build_object('id', focus.id, 'name', focus.name),
    'tutor', jsonb_build_object('id', tutor.id, 'name', tutor.full_name),
    'featureStatus', jsonb_build_object(
      'forum', 'planned',
      'assignments', 'planned',
      'files', 'planned',
      'reportCards', 'planned',
      'history', 'planned',
      'liveClassTool', 'schedule_bound'
    )
  ) into payload
  from public.classroom_memberships membership
  join public.classrooms classroom on classroom.id = membership.classroom_id
  join public.student_courses course on course.id = classroom.course_id
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  where membership.classroom_id = p_classroom_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and classroom.status = 'active'
  order by case membership.membership_role
    when 'student' then 0 when 'tutor' then 1 when 'mentor' then 2 else 3 end
  limit 1;

  if payload is null then
    raise exception 'An active Classroom membership is required to open this space.';
  end if;
  return payload;
end;
$$;

revoke all on function public.get_my_student_dashboard() from public, anon, authenticated;
revoke all on function public.save_my_student_classroom_card_color(uuid, text) from public, anon, authenticated;
revoke all on function public.save_my_student_classroom_card_order(uuid[]) from public, anon, authenticated;
revoke all on function public.get_my_classroom_space(uuid) from public, anon, authenticated;
grant execute on function public.get_my_student_dashboard() to authenticated;
grant execute on function public.save_my_student_classroom_card_color(uuid, text) to authenticated;
grant execute on function public.save_my_student_classroom_card_order(uuid[]) to authenticated;
grant execute on function public.get_my_classroom_space(uuid) to authenticated;

comment on table public.student_classroom_card_preferences is
  'Student-owned Classroom Card color and order. Active Classroom Cards cannot be hidden.';
comment on function public.get_my_classroom_space(uuid) is
  'Authenticated persistent Classroom-space foundation. The live lesson room is a separate schedule-bound tool.';
