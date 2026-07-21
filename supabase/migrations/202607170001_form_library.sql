create table if not exists public.form_definitions (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  schema_version integer not null,
  title text not null default '',
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint form_definitions_id_present check (btrim(id) <> ''),
  constraint form_definitions_status_check check (status in ('active', 'archived')),
  constraint form_definitions_schema_version_check check (schema_version > 0),
  constraint form_definitions_definition_object_check check (jsonb_typeof(definition) = 'object'),
  constraint form_definitions_definition_id_check check (coalesce(definition ->> 'id', '') = id),
  constraint form_definitions_definition_version_check check (
    coalesce(definition ->> 'version', '') ~ '^[1-9][0-9]*$'
    and (definition ->> 'version')::integer = schema_version
  ),
  constraint form_definitions_archived_at_check check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create table if not exists public.form_submissions (
  id text not null,
  respondent_id uuid not null,
  form_id text not null,
  form_owner_id uuid not null,
  version integer not null,
  submission_policy text not null,
  submitted_at timestamptz not null,
  record jsonb not null,
  primary key (respondent_id, id),
  constraint form_submissions_id_present check (btrim(id) <> ''),
  constraint form_submissions_form_id_present check (btrim(form_id) <> ''),
  constraint form_submissions_version_check check (version > 0),
  constraint form_submissions_policy_check check (submission_policy in ('single', 'multiple')),
  constraint form_submissions_record_object_check check (jsonb_typeof(record) = 'object'),
  constraint form_submissions_record_identity_check check (
    coalesce(record ->> 'id', '') = id
    and coalesce(record ->> 'formId', '') = form_id
    and coalesce(record ->> 'version', '') ~ '^[1-9][0-9]*$'
    and (record ->> 'version')::integer = version
    and coalesce(record ->> 'immutable', '') = 'true'
  ),
  constraint form_submissions_record_policy_check check (
    coalesce(record #>> '{metadata,submissionPolicy}', '') = submission_policy
  )
);

-- Submission rows intentionally do not reference form_definitions. Their embedded
-- snapshot and ownership metadata must survive hard deletion of the source form.
create index if not exists form_definitions_owner_updated_idx
on public.form_definitions (owner_id, updated_at desc);

create index if not exists form_submissions_owner_form_submitted_idx
on public.form_submissions (form_owner_id, form_id, submitted_at desc);

create index if not exists form_submissions_respondent_submitted_idx
on public.form_submissions (respondent_id, submitted_at desc);

create unique index if not exists form_submissions_single_response_idx
on public.form_submissions (form_owner_id, form_id, respondent_id)
where submission_policy = 'single';

create or replace function public.enforce_form_definition_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  definition_version integer;
begin
  if jsonb_typeof(new.definition) <> 'object'
    or coalesce(new.definition ->> 'id', '') <> new.id
    or coalesce(new.definition ->> 'version', '') !~ '^[1-9][0-9]*$'
  then
    raise exception 'The form definition identity or schema version is invalid.';
  end if;

  definition_version := (new.definition ->> 'version')::integer;
  new.schema_version := definition_version;
  new.title := coalesce(new.definition #>> '{meta,title}', '');

  if tg_op = 'INSERT' then
    if new.status <> 'active' then
      raise exception 'New forms must begin in the active state.';
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
    raise exception 'Form identity and ownership fields are immutable.';
  end if;

  if old.status = 'archived' then
    raise exception 'Archived forms cannot be overwritten. Open the form as a copy instead.';
  end if;

  if new.status not in ('active', 'archived') then
    raise exception 'The requested form lifecycle transition is invalid.';
  end if;

  if new.status = 'archived' and new.definition is distinct from old.definition then
    raise exception 'Archive the existing form without changing its definition.';
  end if;

  if new.definition is distinct from old.definition and exists (
    select 1
    from public.form_submissions
    where form_owner_id = old.owner_id
      and form_id = old.id
  ) then
    raise exception 'Forms with submissions cannot be overwritten. Open the form as a copy instead.';
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

drop trigger if exists form_definitions_enforce_lifecycle on public.form_definitions;
create trigger form_definitions_enforce_lifecycle
before insert or update on public.form_definitions
for each row
execute function public.enforce_form_definition_lifecycle();

create or replace function public.prevent_form_submission_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Form submissions are immutable. Create a new submission record instead.';
end;
$$;

drop trigger if exists form_submissions_prevent_mutation on public.form_submissions;
create trigger form_submissions_prevent_mutation
before update or delete on public.form_submissions
for each row
execute function public.prevent_form_submission_mutation();

create or replace function public.submit_form_response(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  client_submission_id text;
  source_form_id text;
  source_form public.form_definitions%rowtype;
  trusted_policy text;
  trusted_record jsonb;
  existing_record jsonb;
  server_submitted_at timestamptz := clock_timestamp();
begin
  if caller_id is null then
    raise exception 'Authentication is required to submit this form.';
  end if;

  if coalesce(jsonb_typeof(p_record), '') <> 'object'
    or coalesce(p_record ->> 'immutable', '') <> 'true'
    or coalesce(p_record ->> 'version', '') !~ '^[1-9][0-9]*$'
    or coalesce(jsonb_typeof(p_record -> 'snapshot'), '') <> 'object'
    or coalesce(jsonb_typeof(p_record -> 'data'), '') <> 'object'
    or coalesce(jsonb_typeof(p_record -> 'metadata'), '') <> 'object'
  then
    raise exception 'A valid immutable submission record is required.';
  end if;

  client_submission_id := btrim(coalesce(p_record ->> 'id', ''));
  source_form_id := btrim(coalesce(p_record ->> 'formId', ''));
  if client_submission_id = '' or source_form_id = '' then
    raise exception 'The submission and form IDs are required.';
  end if;

  if coalesce(p_record #>> '{snapshot,form,id}', '') <> source_form_id then
    raise exception 'The submission snapshot does not match its form ID.';
  end if;

  select *
  into source_form
  from public.form_definitions
  where id = source_form_id
    and status = 'active';

  if not found then
    raise exception 'This form is unavailable or no longer accepts submissions.';
  end if;

  select record
  into existing_record
  from public.form_submissions
  where respondent_id = caller_id
    and id = client_submission_id;

  if found then
    if existing_record ->> 'formId' <> source_form_id then
      raise exception 'A different submission already uses this ID.';
    end if;
    return existing_record;
  end if;

  trusted_policy := case
    when source_form.definition #>> '{settings,submissionPolicy,mode}' = 'multiple' then 'multiple'
    else 'single'
  end;

  trusted_record := jsonb_set(
    p_record,
    '{submittedAt}',
    to_jsonb(to_char(server_submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    true
  );
  trusted_record := jsonb_set(
    trusted_record,
    '{metadata,submissionPolicy}',
    to_jsonb(trusted_policy),
    true
  );

  begin
    insert into public.form_submissions (
      id,
      respondent_id,
      form_id,
      form_owner_id,
      version,
      submission_policy,
      submitted_at,
      record
    )
    values (
      client_submission_id,
      caller_id,
      source_form_id,
      source_form.owner_id,
      (trusted_record ->> 'version')::integer,
      trusted_policy,
      server_submitted_at,
      trusted_record
    );
  exception
    when unique_violation then
      select record
      into existing_record
      from public.form_submissions
      where respondent_id = caller_id
        and id = client_submission_id;

      if found and existing_record ->> 'formId' = source_form_id then
        return existing_record;
      end if;

      raise exception using
        errcode = '23505',
        message = 'This form accepts only one submission from this respondent.';
  end;

  return trusted_record;
end;
$$;

alter table public.form_definitions enable row level security;
alter table public.form_submissions enable row level security;

drop policy if exists "Tutors can read their own forms" on public.form_definitions;
create policy "Tutors can read their own forms"
on public.form_definitions
for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Tutors can create their own forms" on public.form_definitions;
create policy "Tutors can create their own forms"
on public.form_definitions
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and status = 'active'
  and exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('teacher', 'tutor', 'mentor', 'admin')
  )
);

drop policy if exists "Tutors can update their active forms" on public.form_definitions;
create policy "Tutors can update their active forms"
on public.form_definitions
for update
to authenticated
using ((select auth.uid()) = owner_id and status = 'active')
with check ((select auth.uid()) = owner_id and status in ('active', 'archived'));

drop policy if exists "Tutors can delete their archived forms" on public.form_definitions;
create policy "Tutors can delete their archived forms"
on public.form_definitions
for delete
to authenticated
using ((select auth.uid()) = owner_id and status = 'archived');

drop policy if exists "Participants can read related submissions" on public.form_submissions;
create policy "Participants can read related submissions"
on public.form_submissions
for select
to authenticated
using (
  (select auth.uid()) = form_owner_id
  or (select auth.uid()) = respondent_id
);

grant usage on schema public to authenticated;

revoke all on public.form_definitions from anon, authenticated;
grant select, insert, update, delete on public.form_definitions to authenticated;

revoke all on public.form_submissions from anon, authenticated;
grant select on public.form_submissions to authenticated;

revoke all on function public.submit_form_response(jsonb) from public, anon, authenticated;
grant execute on function public.submit_form_response(jsonb) to authenticated;
