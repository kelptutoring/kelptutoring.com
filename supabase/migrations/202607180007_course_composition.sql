-- Phase 6: compose approved question-bank items into retrievable course drafts.

insert into public.authorization_capabilities (capability_key, description)
values ('course.compose', 'Create and manage course drafts from approved question-bank items.')
on conflict (capability_key) do update set description = excluded.description;

insert into public.role_capabilities (role_key, capability_key)
values
  ('mentor', 'course.compose'),
  ('admin', 'course.compose')
on conflict (role_key, capability_key) do nothing;

create table if not exists public.course_compositions (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null default '',
  primary_curriculum_node_id uuid not null references public.curriculum_nodes(id) on delete restrict,
  status text not null default 'active',
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint course_compositions_title_present check (btrim(title) <> ''),
  constraint course_compositions_title_length check (char_length(title) <= 180),
  constraint course_compositions_description_length check (char_length(description) <= 4000),
  constraint course_compositions_status_check check (status in ('active', 'archived')),
  constraint course_compositions_schema_version_check check (schema_version = 1),
  constraint course_compositions_archive_consistency check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create table if not exists public.course_composition_items (
  course_id uuid not null references public.course_compositions(id) on delete cascade,
  question_id text not null references public.exam_questions(id) on delete restrict,
  position integer not null,
  added_at timestamptz not null default now(),
  primary key (course_id, question_id),
  constraint course_composition_items_position_check check (position >= 0),
  constraint course_composition_items_course_position_key
    unique (course_id, position) deferrable initially deferred
);

create index if not exists course_compositions_owner_updated_idx
on public.course_compositions (owner_id, status, updated_at desc);

create index if not exists course_composition_items_question_idx
on public.course_composition_items (question_id, course_id);

create or replace function public.course_question_difficulty_rank(p_difficulty text)
returns integer
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case btrim(coalesce(p_difficulty, ''))
    when 'very-easy' then 10
    when 'easy' then 20
    when 'difficult' then 30
    when 'very-difficult' then 40
    when 'challenge' then 50
    else 99
  end;
$$;

create or replace function public.course_composition_json(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'schema', 'kelp-course-composition-v1',
    'id', course.id,
    'ownerId', course.owner_id,
    'title', course.title,
    'description', course.description,
    'primaryCurriculumNodeId', course.primary_curriculum_node_id,
    'curriculumPath', public.curriculum_node_path_json(course.primary_curriculum_node_id),
    'status', course.status,
    'questionIds', coalesce((
      select jsonb_agg(item.question_id order by item.position)
      from public.course_composition_items item
      where item.course_id = course.id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', question.id,
          'position', item.position,
          'difficulty', question.difficulty,
          'questionTypeTags', to_jsonb(question.question_type_tags),
          'name', coalesce(question.content ->> 'name', ''),
          'prompt', coalesce(question.content ->> 'prompt', ''),
          'responseType', coalesce(question.content ->> 'type', ''),
          'points', case
            when coalesce(question.content ->> 'points', '') ~ '^-?[0-9]+([.][0-9]+)?$'
              then (question.content ->> 'points')::numeric
            else 0
          end,
          'hasImage', (
            coalesce(question.content ->> 'imageData', '') <> ''
            or coalesce(question.content ->> 'type', '') like '%image'
          ),
          'hasGraph', (
            coalesce(jsonb_typeof(question.content -> 'graph'), 'null') = 'object'
            or coalesce(question.content ->> 'type', '') like '%graph'
          ),
          'examId', question.exam_id,
          'examTitle', exam.title,
          'ownerId', question.owner_id,
          'authorName', coalesce(profile.full_name, ''),
          'curriculumNodeId', link.curriculum_node_id,
          'curriculumPath', public.curriculum_node_path_json(link.curriculum_node_id),
          'updatedAt', question.updated_at
        ) order by item.position
      )
      from public.course_composition_items item
      join public.exam_questions question on question.id = item.question_id
      join public.exam_definitions exam on exam.id = question.exam_id
      join public.exam_question_curriculum_links link
        on link.question_id = question.id and link.is_primary
      left join public.profiles profile on profile.id = question.owner_id
      where item.course_id = course.id
    ), '[]'::jsonb),
    'createdAt', course.created_at,
    'updatedAt', course.updated_at,
    'archivedAt', course.archived_at
  )
  from public.course_compositions course
  where course.id = p_course_id;
$$;

create or replace function public.save_course_composition(p_definition jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  target_course_id uuid;
  node_id uuid;
  normalized_title text := btrim(coalesce(p_definition ->> 'title', ''));
  normalized_description text := btrim(coalesce(p_definition ->> 'description', ''));
  question_ids jsonb := coalesce(p_definition -> 'questionIds', '[]'::jsonb);
  supplied_count integer;
  eligible_count integer;
  existing_course public.course_compositions%rowtype;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.compose')
  then
    raise exception 'Your assigned roles cannot compose courses.';
  end if;
  if p_definition is null or jsonb_typeof(p_definition) <> 'object' then
    raise exception 'A course definition object is required.';
  end if;
  if coalesce(p_definition ->> 'schema', '') <> 'kelp-course-composition-v1' then
    raise exception 'The course definition schema is unsupported.';
  end if;
  begin
    target_course_id := (p_definition ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'The course definition requires a valid ID.';
  end;
  begin
    node_id := (p_definition ->> 'primaryCurriculumNodeId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Choose a valid curriculum track or topic for this course.';
  end;
  if normalized_title = '' then raise exception 'A course title is required.'; end if;
  if char_length(normalized_title) > 180 then raise exception 'The course title is too long.'; end if;
  if char_length(normalized_description) > 4000 then raise exception 'The course description is too long.'; end if;
  if jsonb_typeof(question_ids) <> 'array' then raise exception 'Course question IDs must be an array.'; end if;
  supplied_count := jsonb_array_length(question_ids);
  if supplied_count > 300 then raise exception 'A course draft cannot contain more than 300 questions.'; end if;
  if supplied_count <> (
    select count(distinct btrim(value))
    from jsonb_array_elements_text(question_ids)
    where btrim(value) <> ''
  ) then
    raise exception 'Course question IDs must be non-empty and unique.';
  end if;
  if not exists (
    select 1 from public.curriculum_nodes
    where id = node_id and status = 'active' and node_type in ('track', 'topic')
  ) then
    raise exception 'A course must reference an active curriculum track or topic.';
  end if;

  select * into existing_course from public.course_compositions where id = target_course_id;
  if found and existing_course.owner_id <> caller_id then
    raise exception 'This course ID belongs to another author.';
  end if;
  if found and existing_course.status <> 'active' then
    raise exception 'Archived courses cannot be overwritten. Duplicate the course first.';
  end if;

  with recursive descendants as (
    select id from public.curriculum_nodes where id = node_id
    union all
    select child.id
    from public.curriculum_nodes child
    join descendants parent on child.parent_id = parent.id
    where child.status = 'active'
  ),
  supplied as (
    select btrim(value) as question_id
    from jsonb_array_elements_text(question_ids)
  )
  select count(*) into eligible_count
  from supplied
  join public.exam_questions question on question.id = supplied.question_id
  join public.exam_definitions exam on exam.id = question.exam_id
  join public.exam_question_curriculum_links link
    on link.question_id = question.id and link.is_primary
  where exam.status = 'active'
    and exam.review_status = 'approved'
    and exam.visibility = 'public'
    and question.review_status = 'approved'
    and question.classification_status = 'reviewed'
    and question.difficulty <> 'unclassified'
    and cardinality(question.question_type_tags) > 0
    and link.classification_status = 'reviewed'
    and link.curriculum_node_id in (select id from descendants);

  if eligible_count <> supplied_count then
    raise exception 'Every course item must be an approved question beneath the selected curriculum path.';
  end if;

  insert into public.course_compositions (
    id, owner_id, title, description, primary_curriculum_node_id,
    status, schema_version, created_at, updated_at, archived_at
  ) values (
    target_course_id, caller_id, normalized_title, normalized_description, node_id,
    'active', 1, now(), now(), null
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    primary_curriculum_node_id = excluded.primary_curriculum_node_id,
    updated_at = now();

  delete from public.course_composition_items where course_id = target_course_id;

  insert into public.course_composition_items (course_id, question_id, position, added_at)
  select
    target_course_id,
    supplied.question_id,
    row_number() over (
      order by public.course_question_difficulty_rank(question.difficulty), supplied.requested_position
    )::integer - 1,
    now()
  from (
    select btrim(value) as question_id, ordinality as requested_position
    from jsonb_array_elements_text(question_ids) with ordinality
  ) supplied
  join public.exam_questions question on question.id = supplied.question_id;

  return public.course_composition_json(target_course_id);
end;
$$;

create or replace function public.list_my_course_compositions(p_status text default 'active')
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_status text := lower(btrim(coalesce(p_status, 'active')));
  result jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.compose')
  then
    raise exception 'Your assigned roles cannot manage course drafts.';
  end if;
  if normalized_status not in ('active', 'archived') then raise exception 'The course status filter is invalid.'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'description', course.description,
      'primaryCurriculumNodeId', course.primary_curriculum_node_id,
      'curriculumPath', public.curriculum_node_path_json(course.primary_curriculum_node_id),
      'status', course.status,
      'questionCount', (select count(*) from public.course_composition_items item where item.course_id = course.id),
      'createdAt', course.created_at,
      'updatedAt', course.updated_at,
      'archivedAt', course.archived_at
    ) order by course.updated_at desc, course.id
  ), '[]'::jsonb) into result
  from public.course_compositions course
  where course.owner_id = caller_id and course.status = normalized_status;
  return result;
end;
$$;

create or replace function public.get_my_course_composition(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  item jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.compose')
  then
    raise exception 'Your assigned roles cannot manage course drafts.';
  end if;
  if not exists (
    select 1 from public.course_compositions
    where id = p_course_id and owner_id = caller_id
  ) then raise exception 'The course draft could not be found.'; end if;
  item := public.course_composition_json(p_course_id);
  return item;
end;
$$;

create or replace function public.duplicate_course_composition(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  source public.course_compositions%rowtype;
  copy_id uuid := gen_random_uuid();
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.compose')
  then raise exception 'Your assigned roles cannot duplicate course drafts.'; end if;
  select * into source from public.course_compositions
  where id = p_course_id and owner_id = caller_id;
  if not found then raise exception 'The course draft could not be found.'; end if;
  insert into public.course_compositions (
    id, owner_id, title, description, primary_curriculum_node_id,
    status, schema_version, created_at, updated_at, archived_at
  ) values (
    copy_id, caller_id, left('Copy of ' || source.title, 180), source.description,
    source.primary_curriculum_node_id, 'active', 1, now(), now(), null
  );
  insert into public.course_composition_items (course_id, question_id, position, added_at)
  select copy_id, question_id, position, now()
  from public.course_composition_items where course_id = source.id;
  return public.course_composition_json(copy_id);
end;
$$;

create or replace function public.archive_course_composition(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare caller_id uuid := auth.uid(); archived public.course_compositions%rowtype;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.compose')
  then raise exception 'Your assigned roles cannot archive course drafts.'; end if;
  update public.course_compositions
  set status = 'archived', archived_at = now(), updated_at = now()
  where id = p_course_id and owner_id = caller_id and status = 'active'
  returning * into archived;
  if not found then raise exception 'The active course draft could not be found.'; end if;
  return public.course_composition_json(archived.id);
end;
$$;

create or replace function public.delete_course_composition(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare caller_id uuid := auth.uid(); deleted_id uuid;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'course.compose')
  then raise exception 'Your assigned roles cannot delete course drafts.'; end if;
  delete from public.course_compositions
  where id = p_course_id and owner_id = caller_id and status = 'archived'
  returning id into deleted_id;
  if deleted_id is null then raise exception 'Archive the course draft before deleting it.'; end if;
  return jsonb_build_object('id', deleted_id, 'deleted', true);
end;
$$;

alter table public.course_compositions enable row level security;
alter table public.course_composition_items enable row level security;

drop policy if exists "Authors can read their course drafts" on public.course_compositions;
create policy "Authors can read their course drafts"
on public.course_compositions for select to authenticated
using (owner_id = (select auth.uid()) and public.current_user_has_capability('course.compose'));

drop policy if exists "Authors can read their course draft items" on public.course_composition_items;
create policy "Authors can read their course draft items"
on public.course_composition_items for select to authenticated
using (exists (
  select 1 from public.course_compositions course
  where course.id = course_composition_items.course_id
    and course.owner_id = (select auth.uid())
    and public.current_user_has_capability('course.compose')
));

revoke all on public.course_compositions from anon, authenticated;
revoke all on public.course_composition_items from anon, authenticated;
grant select on public.course_compositions to authenticated;
grant select on public.course_composition_items to authenticated;

revoke all on function public.course_question_difficulty_rank(text) from public, anon, authenticated;
revoke all on function public.course_composition_json(uuid) from public, anon, authenticated;
revoke all on function public.save_course_composition(jsonb) from public, anon, authenticated;
revoke all on function public.list_my_course_compositions(text) from public, anon, authenticated;
revoke all on function public.get_my_course_composition(uuid) from public, anon, authenticated;
revoke all on function public.duplicate_course_composition(uuid) from public, anon, authenticated;
revoke all on function public.archive_course_composition(uuid) from public, anon, authenticated;
revoke all on function public.delete_course_composition(uuid) from public, anon, authenticated;

grant execute on function public.save_course_composition(jsonb) to authenticated;
grant execute on function public.list_my_course_compositions(text) to authenticated;
grant execute on function public.get_my_course_composition(uuid) to authenticated;
grant execute on function public.duplicate_course_composition(uuid) to authenticated;
grant execute on function public.archive_course_composition(uuid) to authenticated;
grant execute on function public.delete_course_composition(uuid) to authenticated;
