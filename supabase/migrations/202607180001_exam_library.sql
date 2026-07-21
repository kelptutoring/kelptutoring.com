create table if not exists public.exam_definitions (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  review_status text not null default 'draft',
  visibility text not null default 'private',
  schema_version integer not null default 1,
  title text not null default '',
  bundle jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint exam_definitions_id_present check (btrim(id) <> ''),
  constraint exam_definitions_status_check check (status in ('active', 'archived')),
  constraint exam_definitions_review_status_check check (
    review_status in ('draft', 'pending_review', 'approved', 'changes_requested', 'rejected')
  ),
  constraint exam_definitions_visibility_check check (visibility in ('private', 'public')),
  constraint exam_definitions_public_review_check check (
    visibility = 'private' or (status = 'active' and review_status = 'approved')
  ),
  constraint exam_definitions_schema_version_check check (schema_version = 1),
  constraint exam_definitions_bundle_object_check check (jsonb_typeof(bundle) = 'object'),
  constraint exam_definitions_bundle_identity_check check (
    coalesce(bundle ->> 'schema', '') = 'kelp-exam-persistence-bundle-v1'
    and coalesce(bundle #>> '{exam,id}', '') = id
    and coalesce(bundle #>> '{exam,schema}', '') = 'kelp-exam-definition-v1'
  ),
  constraint exam_definitions_bundle_questions_check check (
    jsonb_typeof(bundle #> '{exam,questionIds}') = 'array'
    and jsonb_typeof(bundle -> 'questions') = 'array'
  ),
  constraint exam_definitions_bundle_workflow_check check (
    coalesce(bundle #>> '{workflow,reviewStatus}', '') = review_status
    and coalesce(bundle #>> '{workflow,visibility}', '') = visibility
  ),
  constraint exam_definitions_archived_at_check check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create table if not exists public.exam_questions (
  id text primary key,
  exam_id text not null references public.exam_definitions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  position integer not null,
  difficulty text not null,
  classification_status text not null,
  review_status text not null default 'draft',
  copied_from_question_id text,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_questions_id_present check (btrim(id) <> ''),
  constraint exam_questions_position_check check (position >= 0),
  constraint exam_questions_difficulty_check check (
    difficulty in ('unclassified', 'very-easy', 'easy', 'difficult', 'very-difficult', 'challenge')
  ),
  constraint exam_questions_classification_status_check check (
    classification_status in ('unclassified', 'proposed', 'reviewed')
  ),
  constraint exam_questions_classification_consistency_check check (
    (difficulty = 'unclassified' and classification_status = 'unclassified')
    or (difficulty <> 'unclassified' and classification_status in ('proposed', 'reviewed'))
  ),
  constraint exam_questions_review_status_check check (
    review_status in ('draft', 'pending_review', 'approved', 'changes_requested', 'rejected')
  ),
  constraint exam_questions_content_object_check check (jsonb_typeof(content) = 'object'),
  constraint exam_questions_content_identity_check check (coalesce(content ->> 'id', '') = id),
  constraint exam_questions_exam_position_key
    unique (exam_id, position) deferrable initially deferred
);

create index if not exists exam_definitions_owner_updated_idx
on public.exam_definitions (owner_id, updated_at desc);

create index if not exists exam_definitions_review_idx
on public.exam_definitions (review_status, visibility, updated_at desc);

create index if not exists exam_questions_exam_position_idx
on public.exam_questions (exam_id, position);

create index if not exists exam_questions_catalog_idx
on public.exam_questions (difficulty, classification_status, review_status);

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
  exam.title as exam_title
from public.exam_questions as question
join public.exam_definitions as exam on exam.id = question.exam_id;

create or replace function public.enforce_exam_definition_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.review_status <> 'draft' or new.visibility <> 'private' then
      raise exception 'New exams must begin as private drafts.';
    end if;
    new.created_at := now();
    new.updated_at := new.created_at;
    new.archived_at := null;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Exam identity and ownership fields are immutable.';
  end if;

  if old.status = 'archived' then
    raise exception 'Archived exams cannot be overwritten. Open the exam as a copy instead.';
  end if;

  if old.review_status <> 'draft' and new.bundle is distinct from old.bundle then
    raise exception 'An exam under review or already reviewed cannot be overwritten.';
  end if;

  if new.review_status is distinct from old.review_status
    or new.visibility is distinct from old.visibility
  then
    raise exception 'Exam review and publication require a trusted review workflow.';
  end if;

  if new.status = 'archived' and new.bundle is distinct from old.bundle then
    raise exception 'Archive the existing exam without changing its definition.';
  end if;

  new.updated_at := now();
  if new.status = 'archived' then
    new.archived_at := new.updated_at;
  else
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists exam_definitions_enforce_lifecycle on public.exam_definitions;
create trigger exam_definitions_enforce_lifecycle
before insert or update on public.exam_definitions
for each row
execute function public.enforce_exam_definition_lifecycle();

create or replace function public.save_exam_draft(p_bundle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  source_exam jsonb;
  source_exam_id text;
  existing_exam public.exam_definitions%rowtype;
  saved_exam public.exam_definitions%rowtype;
  question_record jsonb;
  trusted_question jsonb;
  trusted_content jsonb;
  trusted_questions jsonb := '[]'::jsonb;
  trusted_bundle jsonb;
  question_position integer;
  question_id text;
  question_difficulty text;
  question_classification text;
  question_ids text[] := array[]::text[];
  saved_at timestamptz := clock_timestamp();
  created_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required to save an exam.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = caller_id and role in ('teacher', 'tutor', 'mentor', 'admin')
  ) then
    raise exception 'Your profile cannot create or edit exams.';
  end if;

  if coalesce(jsonb_typeof(p_bundle), '') <> 'object'
    or coalesce(p_bundle ->> 'schema', '') <> 'kelp-exam-persistence-bundle-v1'
    or coalesce(jsonb_typeof(p_bundle -> 'exam'), '') <> 'object'
    or coalesce(jsonb_typeof(p_bundle -> 'questions'), '') <> 'array'
    or coalesce(jsonb_typeof(p_bundle #> '{exam,questionIds}'), '') <> 'array'
  then
    raise exception 'A valid exam persistence bundle is required.';
  end if;

  source_exam := p_bundle -> 'exam';
  source_exam_id := btrim(coalesce(source_exam ->> 'id', ''));
  if source_exam_id = ''
    or coalesce(source_exam ->> 'schema', '') <> 'kelp-exam-definition-v1'
  then
    raise exception 'The exam definition identity or schema is invalid.';
  end if;

  select * into existing_exam
  from public.exam_definitions
  where id = source_exam_id;

  if found then
    if existing_exam.owner_id <> caller_id then
      raise exception 'This exam belongs to another tutor.';
    end if;
    if existing_exam.status = 'archived' then
      raise exception 'Archived exams cannot be overwritten. Open the exam as a copy instead.';
    end if;
    if existing_exam.review_status <> 'draft' then
      raise exception 'An exam under review or already reviewed cannot be overwritten. Open it as a copy instead.';
    end if;
    created_at := existing_exam.created_at;
  else
    created_at := saved_at;
  end if;

  if jsonb_array_length(p_bundle #> '{exam,questionIds}') <> jsonb_array_length(p_bundle -> 'questions') then
    raise exception 'The exam question order does not match its question records.';
  end if;

  for question_record, question_position in
    select value, (ordinality - 1)::integer
    from jsonb_array_elements(p_bundle -> 'questions') with ordinality
  loop
    question_id := btrim(coalesce(question_record ->> 'id', ''));
    question_difficulty := lower(btrim(coalesce(question_record ->> 'difficulty', '')));
    if question_id = ''
      or coalesce(question_record ->> 'schema', '') <> 'kelp-exam-question-record-v1'
      or coalesce(question_record ->> 'examId', '') <> source_exam_id
      or coalesce(jsonb_typeof(question_record -> 'content'), '') <> 'object'
      or coalesce(question_record #>> '{content,id}', '') <> question_id
      or coalesce(source_exam #> '{questionIds}' ->> question_position, '') <> question_id
    then
      raise exception 'The exam contains an invalid or misordered question record.';
    end if;
    if question_id = any(question_ids) then
      raise exception 'Question IDs must be unique within an exam.';
    end if;
    if question_difficulty not in ('unclassified', 'very-easy', 'easy', 'difficult', 'very-difficult', 'challenge') then
      raise exception 'The exam contains an unsupported question difficulty.';
    end if;

    question_classification := case
      when question_difficulty = 'unclassified' then 'unclassified'
      else 'proposed'
    end;
    question_ids := array_append(question_ids, question_id);

    trusted_content := question_record -> 'content';
    trusted_content := jsonb_set(trusted_content, '{id}', to_jsonb(question_id), true);
    trusted_content := jsonb_set(trusted_content, '{difficulty}', to_jsonb(question_difficulty), true);
    trusted_content := jsonb_set(trusted_content, '{classificationStatus}', to_jsonb(question_classification), true);

    trusted_question := question_record;
    trusted_question := jsonb_set(trusted_question, '{position}', to_jsonb(question_position), true);
    trusted_question := jsonb_set(trusted_question, '{createdBy}', to_jsonb(caller_id::text), true);
    trusted_question := jsonb_set(trusted_question, '{difficulty}', to_jsonb(question_difficulty), true);
    trusted_question := jsonb_set(trusted_question, '{classificationStatus}', to_jsonb(question_classification), true);
    trusted_question := jsonb_set(trusted_question, '{reviewStatus}', to_jsonb('draft'::text), true);
    trusted_question := jsonb_set(trusted_question, '{content}', trusted_content, true);
    trusted_questions := trusted_questions || jsonb_build_array(trusted_question);
  end loop;

  if exists (
    select 1 from public.exam_questions
    where id = any(question_ids) and exam_id <> source_exam_id
  ) then
    raise exception 'A question ID is already owned by another exam. Import or open the exam as an independent copy.';
  end if;

  source_exam := jsonb_set(source_exam, '{madeBy}', to_jsonb(caller_id::text), true);
  source_exam := jsonb_set(
    source_exam,
    '{createdAt}',
    to_jsonb(to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    true
  );
  source_exam := jsonb_set(
    source_exam,
    '{updatedAt}',
    to_jsonb(to_char(saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    true
  );
  trusted_bundle := jsonb_set(p_bundle, '{exam}', source_exam, true);
  trusted_bundle := jsonb_set(trusted_bundle, '{questions}', trusted_questions, true);
  trusted_bundle := jsonb_set(
    trusted_bundle,
    '{workflow}',
    jsonb_build_object('reviewStatus', 'draft', 'visibility', 'private'),
    true
  );

  insert into public.exam_definitions (
    id, owner_id, status, review_status, visibility, schema_version, title, bundle, created_at, updated_at, archived_at
  ) values (
    source_exam_id,
    caller_id,
    'active',
    'draft',
    'private',
    1,
    coalesce(source_exam ->> 'title', ''),
    trusted_bundle,
    created_at,
    saved_at,
    null
  )
  on conflict (id) do update set
    title = excluded.title,
    bundle = excluded.bundle,
    updated_at = excluded.updated_at,
    archived_at = null
  returning * into saved_exam;

  delete from public.exam_questions
  where exam_id = source_exam_id and not (id = any(question_ids));

  for trusted_question in select value from jsonb_array_elements(trusted_questions)
  loop
    insert into public.exam_questions (
      id,
      exam_id,
      owner_id,
      position,
      difficulty,
      classification_status,
      review_status,
      copied_from_question_id,
      content,
      created_at,
      updated_at
    ) values (
      trusted_question ->> 'id',
      source_exam_id,
      caller_id,
      (trusted_question ->> 'position')::integer,
      trusted_question ->> 'difficulty',
      trusted_question ->> 'classificationStatus',
      'draft',
      nullif(trusted_question ->> 'copiedFromQuestionId', ''),
      trusted_question -> 'content',
      saved_at,
      saved_at
    )
    on conflict (id) do update set
      position = excluded.position,
      difficulty = excluded.difficulty,
      classification_status = excluded.classification_status,
      review_status = 'draft',
      copied_from_question_id = excluded.copied_from_question_id,
      content = excluded.content,
      updated_at = excluded.updated_at;
  end loop;

  return jsonb_build_object(
    'id', saved_exam.id,
    'status', saved_exam.status,
    'review_status', saved_exam.review_status,
    'visibility', saved_exam.visibility,
    'created_at', saved_exam.created_at,
    'updated_at', saved_exam.updated_at,
    'archived_at', saved_exam.archived_at,
    'bundle', saved_exam.bundle
  );
end;
$$;

alter table public.exam_definitions enable row level security;
alter table public.exam_questions enable row level security;

drop policy if exists "Tutors can read their own exams" on public.exam_definitions;
create policy "Tutors can read their own exams"
on public.exam_definitions
for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Tutors can archive their active draft exams" on public.exam_definitions;
create policy "Tutors can archive their active draft exams"
on public.exam_definitions
for update
to authenticated
using (
  (select auth.uid()) = owner_id
  and status = 'active'
  and review_status = 'draft'
)
with check (
  (select auth.uid()) = owner_id
  and status = 'archived'
  and review_status = 'draft'
  and visibility = 'private'
);

drop policy if exists "Tutors can delete their archived draft exams" on public.exam_definitions;
create policy "Tutors can delete their archived draft exams"
on public.exam_definitions
for delete
to authenticated
using (
  (select auth.uid()) = owner_id
  and status = 'archived'
  and review_status = 'draft'
  and visibility = 'private'
);

drop policy if exists "Tutors can read questions from their own exams" on public.exam_questions;
create policy "Tutors can read questions from their own exams"
on public.exam_questions
for select
to authenticated
using ((select auth.uid()) = owner_id);

grant usage on schema public to authenticated;

revoke all on public.exam_definitions from anon, authenticated;
grant select, delete on public.exam_definitions to authenticated;
grant update (status) on public.exam_definitions to authenticated;

revoke all on public.exam_questions from anon, authenticated;
grant select on public.exam_questions to authenticated;

revoke all on public.exam_question_records from anon, authenticated;
grant select on public.exam_question_records to authenticated;

revoke all on function public.save_exam_draft(jsonb) from public, anon, authenticated;
grant execute on function public.save_exam_draft(jsonb) to authenticated;
