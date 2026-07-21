-- Phase 2.B refinement: synchronized collapsed Dashboard blocks.

alter table public.student_dashboard_preferences
  add column if not exists collapsed_blocks text[] not null default '{}'::text[];

alter table public.student_dashboard_preferences
  drop constraint if exists student_dashboard_preferences_collapsed_blocks_check;
alter table public.student_dashboard_preferences
  add constraint student_dashboard_preferences_collapsed_blocks_check check (
    cardinality(collapsed_blocks) <= 2
    and collapsed_blocks <@ array['calendar', 'classrooms']::text[]
    and cardinality(collapsed_blocks) =
      (case when 'calendar' = any(collapsed_blocks) then 1 else 0 end)
      + (case when 'classrooms' = any(collapsed_blocks) then 1 else 0 end)
  );

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
    'schemaVersion', 2,
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
  current_collapsed text[] := '{}'::text[];
  requested_order text[];
  requested_view text;
  requested_collapsed text[];
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to save Dashboard preferences.';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Dashboard preferences must be an object.';
  end if;
  if p_preferences - 'blockOrder' - 'calendarView' - 'collapsedBlocks' <> '{}'::jsonb then
    raise exception 'Dashboard preferences contain unsupported fields.';
  end if;

  select block_order, calendar_view, collapsed_blocks
    into current_order, current_view, current_collapsed
  from public.student_dashboard_preferences
  where user_id = caller_id;
  if not found then
    current_order := array['calendar', 'classrooms']::text[];
    current_view := 'month';
    current_collapsed := '{}'::text[];
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

  requested_collapsed := current_collapsed;
  if p_preferences ? 'collapsedBlocks' then
    if jsonb_typeof(p_preferences -> 'collapsedBlocks') <> 'array' then
      raise exception 'Collapsed Dashboard blocks must be an array.';
    end if;
    select coalesce(array_agg(item.value order by item.ordinality), '{}'::text[])
      into requested_collapsed
    from jsonb_array_elements_text(p_preferences -> 'collapsedBlocks')
      with ordinality as item(value, ordinality);
  end if;
  if cardinality(requested_collapsed) > 2
    or not requested_collapsed <@ array['calendar', 'classrooms']::text[]
    or cardinality(requested_collapsed) <>
      (case when 'calendar' = any(requested_collapsed) then 1 else 0 end)
      + (case when 'classrooms' = any(requested_collapsed) then 1 else 0 end) then
    raise exception 'Collapsed Dashboard blocks may contain Calendar and Classrooms at most once.';
  end if;

  insert into public.student_dashboard_preferences (
    user_id, block_order, calendar_view, collapsed_blocks
  ) values (
    caller_id, requested_order, requested_view, requested_collapsed
  )
  on conflict (user_id) do update set
    block_order = excluded.block_order,
    calendar_view = excluded.calendar_view,
    collapsed_blocks = excluded.collapsed_blocks,
    revision = public.student_dashboard_preferences.revision + 1;

  return public.get_my_student_dashboard();
end;
$$;

revoke all on function public.get_my_student_dashboard() from public, anon, authenticated;
revoke all on function public.save_my_student_dashboard_preferences(jsonb) from public, anon, authenticated;
grant execute on function public.get_my_student_dashboard() to authenticated;
grant execute on function public.save_my_student_dashboard_preferences(jsonb) to authenticated;

comment on table public.student_dashboard_preferences is
  'Student-owned, cross-device Dashboard block order, collapsed state, and calendar presentation. Classroom Card preferences belong to Phase 3.';
