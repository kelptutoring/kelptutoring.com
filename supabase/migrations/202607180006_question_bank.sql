-- Phase 5: independently retrievable, curriculum-classified exam questions.

insert into public.authorization_capabilities (capability_key, description)
values ('question_bank.read', 'Search and inspect approved reusable exam questions.')
on conflict (capability_key) do update set description = excluded.description;

insert into public.role_capabilities (role_key, capability_key)
values
  ('mentor', 'question_bank.read'),
  ('admin', 'question_bank.read')
on conflict (role_key, capability_key) do nothing;

alter table public.exam_questions
  add column if not exists question_type_tags text[] not null default array[]::text[];

alter table public.exam_questions
  drop constraint if exists exam_questions_question_type_tags_check;
alter table public.exam_questions
  add constraint exam_questions_question_type_tags_check check (
    question_type_tags <@ array[
      'word-problem', 'numeric', 'graph', 'image', 'true-false',
      'multiple-choice', 'multiple-answer', 'short-answer', 'essay'
    ]::text[]
    and array_position(question_type_tags, null) is null
  );

create index if not exists exam_questions_type_tags_idx
on public.exam_questions using gin (question_type_tags);

create table if not exists public.exam_question_curriculum_links (
  question_id text not null references public.exam_questions(id) on delete cascade,
  curriculum_node_id uuid not null references public.curriculum_nodes(id) on delete restrict,
  is_primary boolean not null default false,
  classification_status text not null default 'proposed',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (question_id, curriculum_node_id),
  constraint exam_question_curriculum_links_status_check check (
    classification_status in ('proposed', 'reviewed')
  )
);

create unique index if not exists exam_question_curriculum_one_primary_idx
on public.exam_question_curriculum_links (question_id)
where is_primary;

create index if not exists exam_question_curriculum_node_idx
on public.exam_question_curriculum_links (
  curriculum_node_id, classification_status, question_id
);

create or replace function public.normalize_exam_question_bank_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  allowed_tags constant text[] := array[
    'word-problem', 'numeric', 'graph', 'image', 'true-false',
    'multiple-choice', 'multiple-answer', 'short-answer', 'essay'
  ]::text[];
  normalized_tags text[] := array[]::text[];
  normalized_node_ids text[] := array[]::text[];
  tag_value text;
  node_value text;
  node_uuid uuid;
  primary_node text := btrim(coalesce(new.content ->> 'primaryCurriculumNodeId', ''));
begin
  if new.content ? 'questionTypeTags'
    and coalesce(jsonb_typeof(new.content -> 'questionTypeTags'), '') <> 'array'
  then
    raise exception 'Question-bank categories must be an array.';
  end if;
  for tag_value in
    select lower(btrim(value))
    from jsonb_array_elements_text(coalesce(new.content -> 'questionTypeTags', '[]'::jsonb))
  loop
    if tag_value = '' or not (tag_value = any(allowed_tags)) then
      raise exception 'The question contains an unsupported question-bank category.';
    end if;
    if not (tag_value = any(normalized_tags)) then
      normalized_tags := array_append(normalized_tags, tag_value);
    end if;
  end loop;

  if new.content ? 'curriculumNodeIds'
    and coalesce(jsonb_typeof(new.content -> 'curriculumNodeIds'), '') <> 'array'
  then
    raise exception 'Question curriculum links must be an array.';
  end if;
  for node_value in
    select btrim(value)
    from jsonb_array_elements_text(coalesce(new.content -> 'curriculumNodeIds', '[]'::jsonb))
  loop
    begin
      node_uuid := node_value::uuid;
    exception when invalid_text_representation then
      raise exception 'The question contains an invalid curriculum node ID.';
    end;
    if not exists (
      select 1 from public.curriculum_nodes
      where id = node_uuid
        and status = 'active'
        and node_type in ('track', 'topic')
    ) then
      raise exception 'Question curriculum links must reference active track or topic nodes.';
    end if;
    if not (node_value = any(normalized_node_ids)) then
      normalized_node_ids := array_append(normalized_node_ids, node_value);
    end if;
  end loop;

  if primary_node <> '' and not (primary_node = any(normalized_node_ids)) then
    raise exception 'The primary curriculum node must appear in the question curriculum links.';
  end if;
  if cardinality(normalized_node_ids) > 0 and primary_node = '' then
    primary_node := normalized_node_ids[1];
  end if;

  if new.review_status in ('pending_review', 'approved')
    and (tg_op = 'INSERT' or old.review_status is distinct from new.review_status)
  then
    if cardinality(normalized_tags) = 0 then
      raise exception 'Classify every question by question-bank category before review or publication.';
    end if;
    if cardinality(normalized_node_ids) = 0 or primary_node = '' then
      raise exception 'Assign every question to a curriculum track or topic before review or publication.';
    end if;
  end if;

  new.question_type_tags := normalized_tags;
  new.content := jsonb_set(new.content, '{questionTypeTags}', to_jsonb(normalized_tags), true);
  new.content := jsonb_set(new.content, '{curriculumNodeIds}', to_jsonb(normalized_node_ids), true);
  new.content := jsonb_set(new.content, '{primaryCurriculumNodeId}', to_jsonb(primary_node), true);
  return new;
end;
$$;

create or replace function public.sync_exam_question_curriculum_links()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  node_value text;
  primary_node text := btrim(coalesce(new.content ->> 'primaryCurriculumNodeId', ''));
begin
  delete from public.exam_question_curriculum_links where question_id = new.id;
  for node_value in
    select distinct btrim(value)
    from jsonb_array_elements_text(coalesce(new.content -> 'curriculumNodeIds', '[]'::jsonb))
  loop
    insert into public.exam_question_curriculum_links (
      question_id, curriculum_node_id, is_primary, classification_status,
      created_by, created_at, updated_at
    ) values (
      new.id,
      node_value::uuid,
      node_value = primary_node,
      case when new.classification_status = 'reviewed' then 'reviewed' else 'proposed' end,
      new.owner_id,
      new.created_at,
      new.updated_at
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists exam_questions_normalize_bank_fields on public.exam_questions;
create trigger exam_questions_normalize_bank_fields
before insert or update of content, review_status, classification_status
on public.exam_questions
for each row
execute function public.normalize_exam_question_bank_fields();

drop trigger if exists exam_questions_sync_curriculum_links on public.exam_questions;
create trigger exam_questions_sync_curriculum_links
after insert or update of content, review_status, classification_status
on public.exam_questions
for each row
execute function public.sync_exam_question_curriculum_links();

-- Backfill the structural categories that can be inferred safely. Curriculum
-- paths are intentionally not guessed; older approved questions enter the bank
-- only after an author creates a classified copy and it is approved.
update public.exam_questions
set content = jsonb_set(
      jsonb_set(
        jsonb_set(content, '{questionTypeTags}', to_jsonb(array[
          case
            when content ->> 'type' = 'numeric' then 'numeric'
            when content ->> 'type' = 'true-false' then 'true-false'
            when content ->> 'type' like 'multiple-answer%' then 'multiple-answer'
            when content ->> 'type' like 'multiple-choice%' then 'multiple-choice'
            when content ->> 'type' = 'essay' then 'essay'
            else 'short-answer'
          end
        ]::text[]), true),
        '{curriculumNodeIds}', '[]'::jsonb, true
      ),
      '{primaryCurriculumNodeId}', '""'::jsonb, true
    ),
    updated_at = updated_at
where not (content ? 'questionTypeTags');

create or replace view public.exam_question_records
with (security_invoker = true)
as
select
  question.id,
  question.exam_id,
  question.owner_id,
  question.position,
  question.difficulty,
  question.classification_status,
  question.review_status,
  question.copied_from_question_id,
  question.content,
  question.created_at,
  question.updated_at,
  exam.status as exam_status,
  exam.review_status as exam_review_status,
  exam.visibility as exam_visibility,
  exam.title as exam_title,
  question.question_type_tags,
  coalesce((
    select array_agg(link.curriculum_node_id order by link.is_primary desc, link.created_at, link.curriculum_node_id)
    from public.exam_question_curriculum_links link
    where link.question_id = question.id
  ), array[]::uuid[]) as curriculum_node_ids,
  (
    select link.curriculum_node_id
    from public.exam_question_curriculum_links link
    where link.question_id = question.id and link.is_primary
    limit 1
  ) as primary_curriculum_node_id
from public.exam_questions as question
join public.exam_definitions as exam on exam.id = question.exam_id;

create or replace function public.curriculum_node_path_json(p_node_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recursive ancestors as (
    select id, parent_id, node_type, name, slug, 0 as depth
    from public.curriculum_nodes
    where id = p_node_id
    union all
    select parent.id, parent.parent_id, parent.node_type, parent.name, parent.slug,
           ancestors.depth + 1
    from public.curriculum_nodes parent
    join ancestors on ancestors.parent_id = parent.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'type', node_type,
        'name', name,
        'slug', slug
      ) order by depth desc
    ),
    '[]'::jsonb
  )
  from ancestors;
$$;

create or replace function public.search_question_bank(
  p_query text default '',
  p_curriculum_node_id uuid default null,
  p_difficulties text[] default null,
  p_question_type_tags text[] default null,
  p_page integer default 1,
  p_page_size integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_query text := btrim(coalesce(p_query, ''));
  normalized_page integer := greatest(coalesce(p_page, 1), 1);
  normalized_page_size integer := least(greatest(coalesce(p_page_size, 12), 1), 48);
  allowed_difficulties constant text[] := array[
    'very-easy', 'easy', 'difficult', 'very-difficult', 'challenge'
  ]::text[];
  allowed_tags constant text[] := array[
    'word-problem', 'numeric', 'graph', 'image', 'true-false',
    'multiple-choice', 'multiple-answer', 'short-answer', 'essay'
  ]::text[];
  result jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'question_bank.read')
  then
    raise exception 'Your assigned roles cannot search the question bank.';
  end if;
  if (coalesce(p_difficulties, array[]::text[]) <@ allowed_difficulties) is false then
    raise exception 'The question-bank difficulty filter is invalid.';
  end if;
  if (coalesce(p_question_type_tags, array[]::text[]) <@ allowed_tags) is false then
    raise exception 'The question-bank category filter is invalid.';
  end if;
  if p_curriculum_node_id is not null
    and not exists (select 1 from public.curriculum_nodes where id = p_curriculum_node_id)
  then
    raise exception 'The selected curriculum filter does not exist.';
  end if;

  with recursive descendants as (
    select id from public.curriculum_nodes where id = p_curriculum_node_id
    union all
    select child.id
    from public.curriculum_nodes child
    join descendants parent on child.parent_id = parent.id
  ),
  matches as materialized (
    select
      question.id,
      question.exam_id,
      exam.title as exam_title,
      question.owner_id,
      coalesce(profile.full_name, '') as author_name,
      question.position,
      question.difficulty,
      question.question_type_tags,
      question.copied_from_question_id,
      question.content,
      question.created_at,
      question.updated_at,
      link.curriculum_node_id,
      public.curriculum_node_path_json(link.curriculum_node_id) as curriculum_path,
      case question.difficulty
        when 'very-easy' then 10
        when 'easy' then 20
        when 'difficult' then 30
        when 'very-difficult' then 40
        when 'challenge' then 50
        else 99
      end as difficulty_order
    from public.exam_questions question
    join public.exam_definitions exam on exam.id = question.exam_id
    join public.exam_question_curriculum_links link
      on link.question_id = question.id and link.is_primary
    left join public.profiles profile on profile.id = question.owner_id
    where exam.status = 'active'
      and exam.review_status = 'approved'
      and exam.visibility = 'public'
      and question.review_status = 'approved'
      and question.classification_status = 'reviewed'
      and link.classification_status = 'reviewed'
      and cardinality(question.question_type_tags) > 0
      and (
        p_curriculum_node_id is null
        or link.curriculum_node_id in (select id from descendants)
      )
      and (
        coalesce(cardinality(p_difficulties), 0) = 0
        or question.difficulty = any(p_difficulties)
      )
      and (
        coalesce(cardinality(p_question_type_tags), 0) = 0
        or question.question_type_tags && p_question_type_tags
      )
      and (
        normalized_query = ''
        or coalesce(question.content ->> 'name', '') ilike '%' || normalized_query || '%'
        or coalesce(question.content ->> 'prompt', '') ilike '%' || normalized_query || '%'
        or exam.title ilike '%' || normalized_query || '%'
      )
  ),
  page_rows as (
    select * from matches
    order by difficulty_order, updated_at desc, id
    limit normalized_page_size
    offset (normalized_page - 1) * normalized_page_size
  )
  select jsonb_build_object(
    'page', normalized_page,
    'pageSize', normalized_page_size,
    'total', (select count(*) from matches),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'examId', row.exam_id,
          'examTitle', row.exam_title,
          'ownerId', row.owner_id,
          'authorName', row.author_name,
          'position', row.position,
          'difficulty', row.difficulty,
          'questionTypeTags', to_jsonb(row.question_type_tags),
          'copiedFromQuestionId', row.copied_from_question_id,
          'curriculumNodeId', row.curriculum_node_id,
          'curriculumPath', row.curriculum_path,
          'name', coalesce(row.content ->> 'name', ''),
          'prompt', coalesce(row.content ->> 'prompt', ''),
          'responseType', coalesce(row.content ->> 'type', ''),
          'points', case
            when coalesce(row.content ->> 'points', '') ~ '^-?[0-9]+([.][0-9]+)?$'
              then (row.content ->> 'points')::numeric
            else 0
          end,
          'hasImage', (
            coalesce(row.content ->> 'imageData', '') <> ''
            or coalesce(row.content ->> 'type', '') like '%image'
          ),
          'hasGraph', (
            coalesce(jsonb_typeof(row.content -> 'graph'), 'null') = 'object'
            or coalesce(row.content ->> 'type', '') like '%graph'
          ),
          'createdAt', row.created_at,
          'updatedAt', row.updated_at
        ) order by row.difficulty_order, row.updated_at desc, row.id
      ) from page_rows row
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_question_bank_item(p_question_id text)
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
    or not public.authorization_user_has_capability(caller_id, 'question_bank.read')
  then
    raise exception 'Your assigned roles cannot inspect question-bank items.';
  end if;
  select jsonb_build_object(
    'id', question.id,
    'examId', question.exam_id,
    'examTitle', exam.title,
    'ownerId', question.owner_id,
    'authorName', coalesce(profile.full_name, ''),
    'position', question.position,
    'difficulty', question.difficulty,
    'questionTypeTags', to_jsonb(question.question_type_tags),
    'copiedFromQuestionId', question.copied_from_question_id,
    'curriculumNodeId', link.curriculum_node_id,
    'curriculumPath', public.curriculum_node_path_json(link.curriculum_node_id),
    'content', question.content,
    'createdAt', question.created_at,
    'updatedAt', question.updated_at
  ) into item
  from public.exam_questions question
  join public.exam_definitions exam on exam.id = question.exam_id
  join public.exam_question_curriculum_links link
    on link.question_id = question.id and link.is_primary and link.classification_status = 'reviewed'
  left join public.profiles profile on profile.id = question.owner_id
  where question.id = btrim(coalesce(p_question_id, ''))
    and exam.status = 'active'
    and exam.review_status = 'approved'
    and exam.visibility = 'public'
    and question.review_status = 'approved'
    and question.classification_status = 'reviewed';
  if item is null then raise exception 'The approved question-bank item could not be found.'; end if;
  return item;
end;
$$;

alter table public.exam_question_curriculum_links enable row level security;

drop policy if exists "Owners and reviewers can read question curriculum links"
on public.exam_question_curriculum_links;
create policy "Owners and reviewers can read question curriculum links"
on public.exam_question_curriculum_links for select to authenticated
using (
  exists (
    select 1 from public.exam_questions question
    where question.id = exam_question_curriculum_links.question_id
      and (
        question.owner_id = (select auth.uid())
        or public.current_user_has_capability('exam.review')
      )
  )
);

revoke all on public.exam_question_curriculum_links from anon, authenticated;
grant select on public.exam_question_curriculum_links to authenticated;

revoke all on function public.normalize_exam_question_bank_fields() from public, anon, authenticated;
revoke all on function public.sync_exam_question_curriculum_links() from public, anon, authenticated;
revoke all on function public.curriculum_node_path_json(uuid) from public, anon, authenticated;
revoke all on function public.search_question_bank(text, uuid, text[], text[], integer, integer) from public, anon, authenticated;
revoke all on function public.get_question_bank_item(text) from public, anon, authenticated;
grant execute on function public.search_question_bank(text, uuid, text[], text[], integer, integer) to authenticated;
grant execute on function public.get_question_bank_item(text) to authenticated;
