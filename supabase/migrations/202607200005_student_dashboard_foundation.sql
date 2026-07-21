-- Phase 2.B: Student Dashboard grid, synchronized layout preferences, and read model.

create table if not exists public.student_dashboard_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  block_order text[] not null default array['calendar', 'classrooms']::text[],
  calendar_view text not null default 'month',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_dashboard_preferences_block_order_check check (
    array_ndims(block_order) = 1
    and cardinality(block_order) = 2
    and block_order @> array['calendar', 'classrooms']::text[]
    and block_order <@ array['calendar', 'classrooms']::text[]
  ),
  constraint student_dashboard_preferences_calendar_view_check check (
    calendar_view in ('month', 'week')
  ),
  constraint student_dashboard_preferences_revision_check check (revision > 0)
);

drop trigger if exists student_dashboard_preferences_set_updated_at
on public.student_dashboard_preferences;
create trigger student_dashboard_preferences_set_updated_at
before update on public.student_dashboard_preferences
for each row execute function public.set_updated_at();

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
    'classroom', case when classroom.id is null then null else jsonb_build_object(
      'id', classroom.id,
      'status', classroom.status,
      'membershipRole', 'student'
    ) end
  ) order by
    case coalesce(classroom.status, 'archived')
      when 'active' then 0 when 'inactive' then 1 else 2 end,
    course.title,
    course.id
  ), '[]'::jsonb) into classrooms
  from public.student_courses course
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  left join public.classrooms classroom on classroom.course_id = course.id
  where course.student_id = caller_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'viewer', jsonb_build_object(
      'id', profile_record.id,
      'name', profile_record.full_name
    ),
    'preferences', jsonb_build_object(
      'blockOrder', coalesce(to_jsonb(preference_record.block_order), '["calendar","classrooms"]'::jsonb),
      'calendarView', coalesce(preference_record.calendar_view, 'month'),
      'revision', coalesce(preference_record.revision, 1),
      'updatedAt', preference_record.updated_at
    ),
    'classrooms', classrooms,
    'featureStatus', jsonb_build_object(
      'classroomCards', 'pending_phase_3',
      'calendarData', 'pending_phase_7',
      'credits', 'pending_phase_8'
    )
  );
end;
$$;

create or replace function public.save_my_student_dashboard_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  current_order text[] := array['calendar', 'classrooms']::text[];
  current_view text := 'month';
  requested_order text[];
  requested_view text;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to save Dashboard preferences.';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Dashboard preferences must be an object.';
  end if;
  if p_preferences - 'blockOrder' - 'calendarView' <> '{}'::jsonb then
    raise exception 'Dashboard preferences contain unsupported fields.';
  end if;

  select block_order, calendar_view into current_order, current_view
  from public.student_dashboard_preferences
  where user_id = caller_id;
  if not found then
    current_order := array['calendar', 'classrooms']::text[];
    current_view := 'month';
  end if;

  requested_order := current_order;
  if p_preferences ? 'blockOrder' then
    if jsonb_typeof(p_preferences -> 'blockOrder') <> 'array' then
      raise exception 'Dashboard block order must be an array.';
    end if;
    select coalesce(array_agg(item.value order by item.ordinality), '{}'::text[])
      into requested_order
    from jsonb_array_elements_text(p_preferences -> 'blockOrder')
      with ordinality as item(value, ordinality);
  end if;
  if array_ndims(requested_order) is distinct from 1
    or cardinality(requested_order) <> 2
    or not requested_order @> array['calendar', 'classrooms']::text[]
    or not requested_order <@ array['calendar', 'classrooms']::text[] then
    raise exception 'Dashboard block order must contain Calendar and Classrooms exactly once.';
  end if;

  requested_view := coalesce(nullif(lower(btrim(p_preferences ->> 'calendarView')), ''), current_view);
  if requested_view not in ('month', 'week') then
    raise exception 'Calendar view must be month or week.';
  end if;

  insert into public.student_dashboard_preferences (
    user_id, block_order, calendar_view
  ) values (
    caller_id, requested_order, requested_view
  )
  on conflict (user_id) do update set
    block_order = excluded.block_order,
    calendar_view = excluded.calendar_view,
    revision = public.student_dashboard_preferences.revision + 1;

  return public.get_my_student_dashboard();
end;
$$;

create or replace function public.reset_my_student_dashboard_preferences()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare caller_id uuid := auth.uid();
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to reset Dashboard preferences.';
  end if;
  delete from public.student_dashboard_preferences where user_id = caller_id;
  return public.get_my_student_dashboard();
end;
$$;

alter table public.student_dashboard_preferences enable row level security;

create policy "Students can read their own Dashboard preferences"
on public.student_dashboard_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and public.current_user_has_role('student')
);

revoke all on public.student_dashboard_preferences from anon, authenticated;
grant select on public.student_dashboard_preferences to authenticated;

revoke all on function public.get_my_student_dashboard() from public, anon, authenticated;
revoke all on function public.save_my_student_dashboard_preferences(jsonb) from public, anon, authenticated;
revoke all on function public.reset_my_student_dashboard_preferences() from public, anon, authenticated;
grant execute on function public.get_my_student_dashboard() to authenticated;
grant execute on function public.save_my_student_dashboard_preferences(jsonb) to authenticated;
grant execute on function public.reset_my_student_dashboard_preferences() to authenticated;

comment on table public.student_dashboard_preferences is
  'Student-owned, cross-device Dashboard block order and calendar presentation. Credits remain fixed and Classroom Card preferences belong to Phase 3.';
comment on function public.get_my_student_dashboard() is
  'Student-only Dashboard projection. It exposes relationship-backed Classroom foundations and explicit pending feature boundaries without inventing events or balances.';
