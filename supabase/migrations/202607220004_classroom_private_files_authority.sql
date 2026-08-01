-- Phase 4.D: private Classroom Files authority.
-- The browser may reserve and upload an allowed object, but it never receives
-- hard-delete authority. Application metadata is the permission source of
-- truth; Storage remains private and is accessed through RLS.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'classroom-files',
  'classroom-files',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.classroom_files (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  upload_membership_id uuid not null references public.classroom_memberships(id) on delete restrict,
  storage_bucket text not null default 'classroom-files',
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'reserved',
  idempotency_key text not null,
  reserved_at timestamptz not null default now(),
  upload_expires_at timestamptz not null,
  activated_at timestamptz,
  withdrawal_deadline timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles(id) on delete restrict,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete restrict,
  hidden_reason text not null default '',
  retention_until date,
  legal_hold boolean not null default false,
  purged_at timestamptz,
  purged_by uuid references public.profiles(id) on delete restrict,
  purge_reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint classroom_files_bucket_check check (storage_bucket = 'classroom-files'),
  constraint classroom_files_path_check check (
    storage_path = classroom_id::text || '/' || id::text
  ),
  constraint classroom_files_name_check check (
    btrim(original_file_name) <> ''
    and char_length(original_file_name) <= 255
    and original_file_name !~ '[\\/]'
    and original_file_name !~ '[[:cntrl:]]'
  ),
  constraint classroom_files_mime_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint classroom_files_size_check check (
    size_bytes between 1 and 20971520
  ),
  constraint classroom_files_status_check check (
    status in ('reserved', 'active', 'withdrawn', 'hidden', 'purged')
  ),
  constraint classroom_files_idempotency_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint classroom_files_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint classroom_files_hidden_reason_check check (
    (status <> 'hidden') or char_length(btrim(hidden_reason)) between 10 and 1000
  ),
  constraint classroom_files_purge_reason_check check (
    (status <> 'purged') or char_length(btrim(purge_reason)) between 10 and 1000
  ),
  constraint classroom_files_lifecycle_check check (
    (status = 'reserved'
      and activated_at is null and withdrawal_deadline is null
      and withdrawn_at is null and withdrawn_by is null
      and hidden_at is null and hidden_by is null
      and purged_at is null and purged_by is null)
    or
    (status = 'active'
      and activated_at is not null and withdrawal_deadline is not null
      and withdrawn_at is null and withdrawn_by is null
      and hidden_at is null and hidden_by is null
      and purged_at is null and purged_by is null)
    or
    (status = 'withdrawn'
      and activated_at is not null and withdrawal_deadline is not null
      and withdrawn_at is not null and withdrawn_by is not null
      and hidden_at is null and hidden_by is null
      and purged_at is null and purged_by is null)
    or
    (status = 'hidden'
      and activated_at is not null and withdrawal_deadline is not null
      and withdrawn_at is null and withdrawn_by is null
      and hidden_at is not null and hidden_by is not null
      and purged_at is null and purged_by is null)
    or
    (status = 'purged'
      and activated_at is not null and withdrawal_deadline is not null
      and purged_at is not null and purged_by is not null)
  ),
  constraint classroom_files_uploader_idempotency_key unique (uploaded_by, idempotency_key)
);

create index if not exists classroom_files_classroom_status_idx
on public.classroom_files (classroom_id, status, activated_at desc, id desc);
create index if not exists classroom_files_uploader_status_idx
on public.classroom_files (uploaded_by, status, reserved_at desc);
create index if not exists classroom_files_storage_lookup_idx
on public.classroom_files (storage_bucket, storage_path);

create table if not exists public.classroom_file_events (
  id bigint generated by default as identity primary key,
  file_id uuid not null references public.classroom_files(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_membership_id uuid references public.classroom_memberships(id) on delete restrict,
  event_type text not null,
  reason text not null default '',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint classroom_file_events_type_check check (
    event_type in (
      'upload_reserved', 'upload_activated', 'uploader_withdrew',
      'moderator_hid', 'administrator_purged'
    )
  ),
  constraint classroom_file_events_reason_check check (char_length(reason) <= 1000),
  constraint classroom_file_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists classroom_file_events_file_idx
on public.classroom_file_events (file_id, occurred_at, id);
create index if not exists classroom_file_events_classroom_idx
on public.classroom_file_events (classroom_id, occurred_at desc, id desc);

drop trigger if exists classroom_files_set_updated_at on public.classroom_files;
create trigger classroom_files_set_updated_at before update on public.classroom_files
for each row execute function public.set_updated_at();

create or replace function public.current_user_can_upload_classroom_file(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1
    from public.classrooms classroom
    join public.student_courses course on course.id = classroom.course_id
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
    where classroom.id = p_classroom_id
      and classroom.status = 'active'
      and course.status in ('active', 'wind_down')
      and (
        (membership.membership_role = 'student' and course.student_id = auth.uid())
        or (membership.membership_role = 'tutor' and course.tutor_id = auth.uid())
        or (membership.membership_role = 'mentor' and course.mentor_id = auth.uid())
      )
  ), false);
$$;

create or replace function public.current_user_can_moderate_classroom_file(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1
    from public.classrooms classroom
    join public.student_courses course on course.id = classroom.course_id
    join public.classroom_memberships membership
      on membership.classroom_id = classroom.id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
    where classroom.id = p_classroom_id
      and classroom.status = 'active'
      and course.status in ('active', 'wind_down')
      and (
        (membership.membership_role = 'tutor' and course.tutor_id = auth.uid())
        or (membership.membership_role = 'mentor' and course.mentor_id = auth.uid())
      )
  ), false)
  or public.authorization_user_has_capability(auth.uid(), 'authorization.manage');
$$;

create or replace function public.current_user_can_read_classroom_file(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1
    from public.classroom_files file
    join public.classrooms classroom on classroom.id = file.classroom_id
    join public.student_courses course on course.id = classroom.course_id
    where file.id = p_file_id
      and (
        (
          file.status = 'reserved'
          and file.uploaded_by = auth.uid()
          and file.upload_expires_at > now()
        )
        or (
          file.status = 'active'
          and exists (
            select 1
            from public.classroom_memberships membership
            where membership.classroom_id = file.classroom_id
              and membership.user_id = auth.uid()
              and (
                membership.status = 'active'
                or (
                  membership.status = 'ended'
                  and file.activated_at between membership.joined_at and membership.ended_at
                )
              )
          )
        )
        or (
          file.status = 'hidden'
          and (
            public.current_user_can_moderate_classroom_file(file.classroom_id)
            or public.authorization_user_has_capability(auth.uid(), 'authorization.manage')
          )
        )
        or public.authorization_user_has_capability(auth.uid(), 'authorization.manage')
      )
  ), false);
$$;

create or replace function public.current_user_can_upload_classroom_file_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.classroom_files file
    where file.storage_bucket = 'classroom-files'
      and file.storage_path = p_storage_path
      and file.status = 'reserved'
      and file.uploaded_by = auth.uid()
      and file.upload_expires_at > now()
      and public.current_user_can_upload_classroom_file(file.classroom_id)
  ), false);
$$;

create or replace function public.current_user_can_read_classroom_file_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.classroom_files file
    where file.storage_bucket = 'classroom-files'
      and file.storage_path = p_storage_path
      and public.current_user_can_read_classroom_file(file.id)
  ), false);
$$;

create or replace function public.reserve_my_classroom_file_upload(
  p_classroom_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  membership_record public.classroom_memberships%rowtype;
  file_id uuid := gen_random_uuid();
  normalized_name text := btrim(coalesce(p_original_file_name, ''));
  normalized_mime text := lower(btrim(coalesce(p_mime_type, '')));
  normalized_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  existing_file public.classroom_files%rowtype;
  created_file public.classroom_files%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required to upload a Classroom file.'; end if;
  if not public.current_user_can_upload_classroom_file(p_classroom_id) then
    raise exception 'An active Student, assigned Tutor, or supervisory Mentor Membership is required to upload here.';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 255
    or normalized_name ~ '[\\/]' or normalized_name ~ '[[:cntrl:]]' then
    raise exception 'The file name is invalid.';
  end if;
  if normalized_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Only PDF, JPEG, and PNG files are supported.';
  end if;
  if (normalized_mime = 'application/pdf' and lower(normalized_name) !~ '\.pdf$')
    or (normalized_mime = 'image/jpeg' and lower(normalized_name) !~ '\.(jpg|jpeg)$')
    or (normalized_mime = 'image/png' and lower(normalized_name) !~ '\.png$') then
    raise exception 'The file extension does not match its declared type.';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 20971520 then
    raise exception 'Classroom files must be no larger than 20 MB.';
  end if;
  if normalized_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'A valid idempotency key is required.';
  end if;

  select membership.* into membership_record
  from public.classroom_memberships membership
  join public.classrooms classroom on classroom.id = membership.classroom_id
  join public.student_courses course on course.id = classroom.course_id
  where membership.classroom_id = p_classroom_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and (
      (membership.membership_role = 'student' and course.student_id = caller_id)
      or (membership.membership_role = 'tutor' and course.tutor_id = caller_id)
      or (membership.membership_role = 'mentor' and course.mentor_id = caller_id)
    )
  order by case membership.membership_role when 'student' then 0 when 'tutor' then 1 else 2 end
  limit 1;

  select * into existing_file
  from public.classroom_files
  where uploaded_by = caller_id and idempotency_key = normalized_key;
  if found then
    if existing_file.classroom_id <> p_classroom_id
      or existing_file.original_file_name <> normalized_name
      or existing_file.mime_type <> normalized_mime
      or existing_file.size_bytes <> p_size_bytes then
      raise exception 'This idempotency key is already used by another Classroom file.';
    end if;
    return jsonb_build_object(
      'id', existing_file.id,
      'status', existing_file.status,
      'bucket', existing_file.storage_bucket,
      'path', existing_file.storage_path,
      'uploadExpiresAt', existing_file.upload_expires_at
    );
  end if;

  insert into public.classroom_files (
    id, classroom_id, uploaded_by, upload_membership_id,
    storage_path, original_file_name, mime_type, size_bytes,
    idempotency_key, upload_expires_at
  ) values (
    file_id, p_classroom_id, caller_id, membership_record.id,
    p_classroom_id::text || '/' || file_id::text,
    normalized_name, normalized_mime, p_size_bytes,
    normalized_key, clock_timestamp() + interval '30 minutes'
  ) returning * into created_file;

  insert into public.classroom_file_events (
    file_id, classroom_id, actor_user_id, actor_membership_id,
    event_type, metadata
  ) values (
    created_file.id, created_file.classroom_id, caller_id, membership_record.id,
    'upload_reserved', jsonb_build_object(
      'mimeType', created_file.mime_type,
      'sizeBytes', created_file.size_bytes,
      'uploadExpiresAt', created_file.upload_expires_at
    )
  );

  return jsonb_build_object(
    'id', created_file.id,
    'status', created_file.status,
    'bucket', created_file.storage_bucket,
    'path', created_file.storage_path,
    'uploadExpiresAt', created_file.upload_expires_at
  );
end;
$$;

create or replace function public.activate_my_classroom_file(p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  caller_id uuid := auth.uid();
  file_record public.classroom_files%rowtype;
begin
  select * into file_record from public.classroom_files where id = p_file_id for update;
  if caller_id is null or not found or file_record.uploaded_by <> caller_id then
    raise exception 'The reserved Classroom file could not be activated.';
  end if;
  if file_record.status = 'active' then
    return jsonb_build_object('id', file_record.id, 'status', file_record.status,
      'withdrawalDeadline', file_record.withdrawal_deadline);
  end if;
  if file_record.status <> 'reserved' or file_record.upload_expires_at <= clock_timestamp() then
    raise exception 'The Classroom file upload reservation has expired.';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = file_record.storage_bucket
      and object.name = file_record.storage_path
      and object.owner_id = caller_id::text
  ) then
    raise exception 'Upload the reserved Storage object before activating the Classroom file.';
  end if;

  update public.classroom_files
  set status = 'active', activated_at = clock_timestamp(),
      withdrawal_deadline = clock_timestamp() + interval '2 hours'
  where id = file_record.id
  returning * into file_record;

  insert into public.classroom_file_events (
    file_id, classroom_id, actor_user_id, actor_membership_id, event_type, metadata
  ) values (
    file_record.id, file_record.classroom_id, caller_id,
    file_record.upload_membership_id, 'upload_activated',
    jsonb_build_object('withdrawalDeadline', file_record.withdrawal_deadline)
  );

  return jsonb_build_object('id', file_record.id, 'status', file_record.status,
    'withdrawalDeadline', file_record.withdrawal_deadline);
end;
$$;

create or replace function public.withdraw_my_classroom_file(
  p_file_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  file_record public.classroom_files%rowtype;
  normalized_reason text := left(btrim(coalesce(p_reason, '')), 1000);
begin
  select * into file_record from public.classroom_files where id = p_file_id for update;
  if caller_id is null or not found or file_record.uploaded_by <> caller_id then
    raise exception 'Only the uploader may withdraw this Classroom file.';
  end if;
  if file_record.status = 'withdrawn' then
    return jsonb_build_object('id', file_record.id, 'status', file_record.status);
  end if;
  if file_record.status <> 'active' or file_record.withdrawal_deadline < clock_timestamp() then
    raise exception 'The two-hour Classroom file withdrawal window has closed.';
  end if;

  update public.classroom_files
  set status = 'withdrawn', withdrawn_at = clock_timestamp(), withdrawn_by = caller_id
  where id = file_record.id
  returning * into file_record;

  insert into public.classroom_file_events (
    file_id, classroom_id, actor_user_id, actor_membership_id, event_type, reason
  ) values (
    file_record.id, file_record.classroom_id, caller_id,
    file_record.upload_membership_id, 'uploader_withdrew',
    coalesce(nullif(normalized_reason, ''), 'Uploader withdrew the file within the two-hour window.')
  );

  return jsonb_build_object('id', file_record.id, 'status', file_record.status);
end;
$$;

create or replace function public.hide_classroom_file(p_file_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  file_record public.classroom_files%rowtype;
  membership_id uuid;
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into file_record from public.classroom_files where id = p_file_id for update;
  if caller_id is null or not found
    or not public.current_user_can_moderate_classroom_file(file_record.classroom_id) then
    raise exception 'Only the assigned Tutor, supervisory Mentor, or an administrator may hide this file.';
  end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'A moderation reason between 10 and 1000 characters is required.';
  end if;
  if file_record.status = 'hidden' then
    return jsonb_build_object('id', file_record.id, 'status', file_record.status);
  end if;
  if file_record.status <> 'active' then
    raise exception 'Only an active Classroom file can be hidden.';
  end if;

  select membership.id into membership_id
  from public.classroom_memberships membership
  where membership.classroom_id = file_record.classroom_id
    and membership.user_id = caller_id and membership.status = 'active'
  order by membership.joined_at desc, membership.id desc limit 1;

  update public.classroom_files
  set status = 'hidden', hidden_at = clock_timestamp(), hidden_by = caller_id,
      hidden_reason = normalized_reason
  where id = file_record.id
  returning * into file_record;

  insert into public.classroom_file_events (
    file_id, classroom_id, actor_user_id, actor_membership_id, event_type, reason
  ) values (
    file_record.id, file_record.classroom_id, caller_id,
    membership_id, 'moderator_hid', normalized_reason
  );

  return jsonb_build_object('id', file_record.id, 'status', file_record.status);
end;
$$;

create or replace function public.get_my_classroom_files(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  can_upload boolean := false;
  can_moderate boolean := false;
  has_retained_access boolean := false;
  file_payload jsonb := '[]'::jsonb;
begin
  if caller_id is null then raise exception 'Authentication is required to open Classroom Files.'; end if;
  select exists (
    select 1 from public.classroom_memberships membership
    where membership.classroom_id = p_classroom_id and membership.user_id = caller_id
  ) or public.authorization_user_has_capability(caller_id, 'authorization.manage')
  into has_retained_access;
  if not has_retained_access then
    raise exception 'A retained Classroom Membership is required to open Classroom Files.';
  end if;

  can_upload := public.current_user_can_upload_classroom_file(p_classroom_id);
  can_moderate := public.current_user_can_moderate_classroom_file(p_classroom_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', file.id,
    'name', file.original_file_name,
    'mimeType', file.mime_type,
    'sizeBytes', file.size_bytes,
    'status', file.status,
    'uploadedAt', file.activated_at,
    'uploadedBy', jsonb_build_object(
      'id', uploader.id,
      'name', coalesce(nullif(btrim(uploader.full_name), ''), 'Classroom member')
    ),
    'storage', jsonb_build_object('bucket', file.storage_bucket, 'path', file.storage_path),
    'canWithdraw', file.uploaded_by = caller_id and file.status = 'active'
      and file.withdrawal_deadline >= now(),
    'withdrawalDeadline', case when file.uploaded_by = caller_id then file.withdrawal_deadline else null end,
    'canHide', can_moderate and file.status = 'active',
    'hiddenReason', case when can_moderate and file.status = 'hidden' then file.hidden_reason else null end
  ) order by file.activated_at desc nulls last, file.reserved_at desc, file.id desc), '[]'::jsonb)
  into file_payload
  from public.classroom_files file
  join public.profiles uploader on uploader.id = file.uploaded_by
  where file.classroom_id = p_classroom_id
    and public.current_user_can_read_classroom_file(file.id);

  return jsonb_build_object(
    'schemaVersion', 1,
    'classroomId', p_classroom_id,
    'access', jsonb_build_object(
      'canUpload', can_upload,
      'canModerate', can_moderate,
      'canPermanentlyPurge', false
    ),
    'uploadRules', jsonb_build_object(
      'bucket', 'classroom-files',
      'maxFileSizeBytes', 20971520,
      'allowedMimeTypes', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
      'uploaderWithdrawalMinutes', 120,
      'reservationMinutes', 30
    ),
    'retentionPolicy', 'provisional_two_year_classroom_retention',
    'files', file_payload,
    'featureStatus', jsonb_build_object(
      'fileAuthority', 'active_phase_4d',
      'fileInterface', 'planned_phase_4e'
    )
  );
end;
$$;

create or replace function public.finalize_classroom_file_purge(
  p_file_id uuid,
  p_administrator_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  file_record public.classroom_files%rowtype;
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.authorization_user_has_capability(p_administrator_id, 'authorization.manage') then
    raise exception 'A valid administrator is required to finalize a permanent purge.';
  end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'A purge reason between 10 and 1000 characters is required.';
  end if;
  select * into file_record from public.classroom_files where id = p_file_id for update;
  if not found or file_record.status not in ('withdrawn', 'hidden')
    or file_record.retention_until is null or file_record.retention_until > current_date
    or file_record.legal_hold then
    raise exception 'This Classroom file is not eligible for permanent purge.';
  end if;
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = file_record.storage_bucket and object.name = file_record.storage_path
  ) then
    raise exception 'Remove the Storage object through the trusted Storage API before finalizing its purge.';
  end if;

  update public.classroom_files
  set status = 'purged', purged_at = clock_timestamp(), purged_by = p_administrator_id,
      purge_reason = normalized_reason
  where id = file_record.id;
  insert into public.classroom_file_events (
    file_id, classroom_id, actor_user_id, event_type, reason
  ) values (
    file_record.id, file_record.classroom_id, p_administrator_id,
    'administrator_purged', normalized_reason
  );
end;
$$;

alter table public.classroom_files enable row level security;
alter table public.classroom_file_events enable row level security;

revoke all on table public.classroom_files from anon, authenticated;
revoke all on table public.classroom_file_events from anon, authenticated;
revoke all on function public.current_user_can_upload_classroom_file(uuid) from public, anon;
revoke all on function public.current_user_can_moderate_classroom_file(uuid) from public, anon;
revoke all on function public.current_user_can_read_classroom_file(uuid) from public, anon;
revoke all on function public.current_user_can_upload_classroom_file_object(text) from public, anon;
revoke all on function public.current_user_can_read_classroom_file_object(text) from public, anon;
revoke all on function public.reserve_my_classroom_file_upload(uuid, text, text, bigint, text) from public, anon;
revoke all on function public.activate_my_classroom_file(uuid) from public, anon;
revoke all on function public.withdraw_my_classroom_file(uuid, text) from public, anon;
revoke all on function public.hide_classroom_file(uuid, text) from public, anon;
revoke all on function public.get_my_classroom_files(uuid) from public, anon;
revoke all on function public.finalize_classroom_file_purge(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.current_user_can_upload_classroom_file(uuid) to authenticated;
grant execute on function public.current_user_can_moderate_classroom_file(uuid) to authenticated;
grant execute on function public.current_user_can_read_classroom_file(uuid) to authenticated;
grant execute on function public.current_user_can_upload_classroom_file_object(text) to authenticated;
grant execute on function public.current_user_can_read_classroom_file_object(text) to authenticated;
grant execute on function public.reserve_my_classroom_file_upload(uuid, text, text, bigint, text) to authenticated;
grant execute on function public.activate_my_classroom_file(uuid) to authenticated;
grant execute on function public.withdraw_my_classroom_file(uuid, text) to authenticated;
grant execute on function public.hide_classroom_file(uuid, text) to authenticated;
grant execute on function public.get_my_classroom_files(uuid) to authenticated;
grant execute on function public.finalize_classroom_file_purge(uuid, uuid, text) to service_role;

drop policy if exists classroom_files_authenticated_insert on storage.objects;
create policy classroom_files_authenticated_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'classroom-files'
  and public.current_user_can_upload_classroom_file_object(name)
);

drop policy if exists classroom_files_authenticated_select on storage.objects;
create policy classroom_files_authenticated_select
on storage.objects for select to authenticated
using (
  bucket_id = 'classroom-files'
  and public.current_user_can_read_classroom_file_object(name)
);

comment on table public.classroom_files is
  'Private Classroom File metadata and lifecycle authority. Physical objects live in the private classroom-files Storage bucket.';
comment on table public.classroom_file_events is
  'Append-only audit history for Classroom File reservation, activation, withdrawal, moderation, and trusted purge.';
comment on function public.get_my_classroom_files(uuid) is
  'Authorized Phase 4.D Classroom Files projection. Phase 4.E owns the upload/download interface.';
comment on function public.finalize_classroom_file_purge(uuid, uuid, text) is
  'Service-role-only purge finalization after an administrator-authorized Storage API deletion and retention/legal-hold checks.';
