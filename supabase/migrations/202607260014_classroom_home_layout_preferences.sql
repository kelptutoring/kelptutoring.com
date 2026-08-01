-- Phase 5.H Classroom Home personalization:
-- synchronize one Student's block order and collapsed state per Classroom.

create table if not exists public.classroom_home_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  block_order text[] not null default array[
    'progress', 'this-week', 'coming-next', 'calendar'
  ]::text[],
  collapsed_blocks text[] not null default '{}'::text[],
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, classroom_id),
  constraint classroom_home_preferences_block_order_check check (
    array_ndims(block_order) = 1
    and cardinality(block_order) = 4
    and block_order @> array[
      'progress', 'this-week', 'coming-next', 'calendar'
    ]::text[]
    and block_order <@ array[
      'progress', 'this-week', 'coming-next', 'calendar'
    ]::text[]
  ),
  constraint classroom_home_preferences_collapsed_blocks_check check (
    cardinality(collapsed_blocks) <= 4
    and collapsed_blocks <@ array[
      'progress', 'this-week', 'coming-next', 'calendar'
    ]::text[]
    and cardinality(collapsed_blocks) =
      (case when 'progress' = any(collapsed_blocks) then 1 else 0 end)
      + (case when 'this-week' = any(collapsed_blocks) then 1 else 0 end)
      + (case when 'coming-next' = any(collapsed_blocks) then 1 else 0 end)
      + (case when 'calendar' = any(collapsed_blocks) then 1 else 0 end)
  ),
  constraint classroom_home_preferences_revision_check check (revision > 0)
);

drop trigger if exists classroom_home_preferences_set_updated_at
on public.classroom_home_preferences;
create trigger classroom_home_preferences_set_updated_at
before update on public.classroom_home_preferences
for each row execute function public.set_updated_at();

create or replace function public.get_my_classroom_home_preferences(
  p_classroom_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  preference_record public.classroom_home_preferences%rowtype;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student')
  then
    raise exception 'An active Student workspace is required to load Classroom Home preferences.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required.';
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

  select *
  into preference_record
  from public.classroom_home_preferences
  where user_id = caller_id
    and classroom_id = p_classroom_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'classroomId', p_classroom_id,
    'blockOrder', coalesce(
      to_jsonb(preference_record.block_order),
      '["progress","this-week","coming-next","calendar"]'::jsonb
    ),
    'collapsedBlocks', coalesce(
      to_jsonb(preference_record.collapsed_blocks),
      '[]'::jsonb
    ),
    'revision', coalesce(preference_record.revision, 1),
    'updatedAt', preference_record.updated_at
  );
end;
$$;

create or replace function public.save_my_classroom_home_preferences(
  p_classroom_id uuid,
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  current_order text[] := array[
    'progress', 'this-week', 'coming-next', 'calendar'
  ]::text[];
  current_collapsed text[] := '{}'::text[];
  requested_order text[];
  requested_collapsed text[];
begin
  perform public.get_my_classroom_home_preferences(p_classroom_id);
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Classroom Home preferences must be an object.';
  end if;
  if p_preferences - 'blockOrder' - 'collapsedBlocks' <> '{}'::jsonb then
    raise exception 'Classroom Home preferences contain unsupported fields.';
  end if;

  select block_order, collapsed_blocks
  into current_order, current_collapsed
  from public.classroom_home_preferences
  where user_id = caller_id
    and classroom_id = p_classroom_id;
  if not found then
    current_order := array[
      'progress', 'this-week', 'coming-next', 'calendar'
    ]::text[];
    current_collapsed := '{}'::text[];
  end if;

  requested_order := current_order;
  if p_preferences ? 'blockOrder' then
    if jsonb_typeof(p_preferences -> 'blockOrder') <> 'array' then
      raise exception 'Classroom Home block order must be an array.';
    end if;
    select coalesce(
      array_agg(item.value order by item.ordinality),
      '{}'::text[]
    )
    into requested_order
    from jsonb_array_elements_text(p_preferences -> 'blockOrder')
      with ordinality as item(value, ordinality);
  end if;
  if array_ndims(requested_order) is distinct from 1
    or cardinality(requested_order) <> 4
    or not requested_order @> array[
      'progress', 'this-week', 'coming-next', 'calendar'
    ]::text[]
    or not requested_order <@ array[
      'progress', 'this-week', 'coming-next', 'calendar'
    ]::text[]
  then
    raise exception 'Classroom Home block order must contain every block exactly once.';
  end if;

  requested_collapsed := current_collapsed;
  if p_preferences ? 'collapsedBlocks' then
    if jsonb_typeof(p_preferences -> 'collapsedBlocks') <> 'array' then
      raise exception 'Collapsed Classroom Home blocks must be an array.';
    end if;
    select coalesce(
      array_agg(item.value order by item.ordinality),
      '{}'::text[]
    )
    into requested_collapsed
    from jsonb_array_elements_text(p_preferences -> 'collapsedBlocks')
      with ordinality as item(value, ordinality);
  end if;
  if cardinality(requested_collapsed) > 4
    or not requested_collapsed <@ array[
      'progress', 'this-week', 'coming-next', 'calendar'
    ]::text[]
    or cardinality(requested_collapsed) <> (
      select count(distinct item.value)
      from unnest(requested_collapsed) item(value)
    )
  then
    raise exception 'Collapsed Classroom Home blocks contain an unsupported or duplicate value.';
  end if;

  insert into public.classroom_home_preferences (
    user_id,
    classroom_id,
    block_order,
    collapsed_blocks
  ) values (
    caller_id,
    p_classroom_id,
    requested_order,
    requested_collapsed
  )
  on conflict (user_id, classroom_id) do update set
    block_order = excluded.block_order,
    collapsed_blocks = excluded.collapsed_blocks,
    revision = public.classroom_home_preferences.revision + 1;

  return public.get_my_classroom_home_preferences(p_classroom_id);
end;
$$;

alter table public.classroom_home_preferences enable row level security;

drop policy if exists "Students can read their own Classroom Home preferences"
on public.classroom_home_preferences;
create policy "Students can read their own Classroom Home preferences"
on public.classroom_home_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and public.current_user_has_role('student')
  and exists (
    select 1
    from public.classroom_memberships membership
    join public.classrooms classroom on classroom.id = membership.classroom_id
    join public.student_courses course on course.id = classroom.course_id
    where membership.classroom_id = classroom_home_preferences.classroom_id
      and membership.user_id = (select auth.uid())
      and membership.membership_role = 'student'
      and membership.status = 'active'
      and classroom.status = 'active'
      and course.student_id = (select auth.uid())
      and course.status in ('active', 'wind_down')
  )
);

revoke all on public.classroom_home_preferences
from public, anon, authenticated;
grant select on public.classroom_home_preferences to authenticated;

revoke all on function public.get_my_classroom_home_preferences(uuid)
from public, anon, authenticated;
revoke all on function public.save_my_classroom_home_preferences(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.get_my_classroom_home_preferences(uuid)
to authenticated;
grant execute on function public.save_my_classroom_home_preferences(uuid, jsonb)
to authenticated;

comment on table public.classroom_home_preferences is
  'Student-owned, per-Classroom Home block order and collapsed state.';
comment on function public.get_my_classroom_home_preferences(uuid) is
  'Returns synchronized Classroom Home layout preferences for the active Student member.';
comment on function public.save_my_classroom_home_preferences(uuid, jsonb) is
  'Validates and saves one active Student member''s per-Classroom Home layout.';
