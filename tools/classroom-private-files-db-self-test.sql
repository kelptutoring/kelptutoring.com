\set ON_ERROR_STOP on

\if :{?admin_id}
\else
  \echo 'Missing required actor variable: admin_id'
  \quit 3
\endif
\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?student_id}
\else
  \echo 'Missing required actor variable: student_id'
  \quit 3
\endif
\if :{?guardian_id}
\else
  \echo 'Missing required actor variable: guardian_id'
  \quit 3
\endif
\if :{?former_tutor_id}
\else
  \echo 'Missing required actor variable: former_tutor_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  cardinality(array[
    :'admin_id'::uuid, :'mentor_id'::uuid, :'tutor_id'::uuid,
    :'student_id'::uuid, :'guardian_id'::uuid,
    :'former_tutor_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'admin_id'::uuid, :'mentor_id'::uuid, :'tutor_id'::uuid,
      :'student_id'::uuid, :'guardian_id'::uuid,
      :'former_tutor_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (select 1 from public.user_roles where user_id = :'admin_id'::uuid and role_key = 'admin' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'guardian_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'former_tutor_id'::uuid and role_key = 'tutor' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required Classroom File actors are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select coalesce((
  select item #>> '{classroom,id}'
  from jsonb_array_elements(public.get_my_learning_relationships() -> 'courses') item
  where item #>> '{mentor,id}' = :'mentor_id'
    and item #>> '{tutor,id}' = :'tutor_id'
    and item #>> '{student,id}' = :'student_id'
    and item ->> 'status' in ('active', 'wind_down')
    and item #>> '{classroom,status}' = 'active'
  order by item ->> 'id'
  limit 1
), '') as classroom_id \gset

select (:'classroom_id' <> '') as classroom_ready \gset
\if :classroom_ready
\else
  \echo 'The deterministic active Classroom for Phase 4.D is missing. Run supabase:provision first.'
  \quit 3
\endif

select set_config('test.classroom_id', :'classroom_id', false);
select set_config('test.student_id', :'student_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.mentor_id', :'mentor_id', false);
select set_config('test.guardian_id', :'guardian_id', false);
select set_config('test.former_tutor_id', :'former_tutor_id', false);

reset role;
insert into public.classroom_memberships (
  classroom_id, user_id, membership_role, status, joined_at
) values (
  :'classroom_id'::uuid, :'guardian_id'::uuid, 'guardian', 'active', now() - interval '20 days'
) returning id as guardian_membership_id \gset

insert into public.classroom_memberships (
  classroom_id, user_id, membership_role, status, joined_at, ended_at
) values (
  :'classroom_id'::uuid, :'former_tutor_id'::uuid, 'tutor', 'ended',
  now() - interval '10 days', now() - interval '5 days'
) returning id as former_tutor_membership_id \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_id', true);
select
  payload ->> 'id' as old_file_id,
  payload ->> 'path' as old_file_path
from (
  select public.reserve_my_classroom_file_upload(
    :'classroom_id'::uuid, 'mechanics-reference.pdf', 'application/pdf', 1500,
    'phase4d-file-old-001'
  ) payload
) reserved \gset

select
  payload ->> 'id' as duplicate_file_id
from (
  select public.reserve_my_classroom_file_upload(
    :'classroom_id'::uuid, 'mechanics-reference.pdf', 'application/pdf', 1500,
    'phase4d-file-old-001'
  ) payload
) duplicate \gset

select (:'old_file_id' = :'duplicate_file_id') as idempotency_ready \gset
\if :idempotency_ready
\else
  \echo 'Classroom File reservation was not idempotent.'
  \quit 3
\endif

select set_config('test.old_file_id', :'old_file_id', false);
select set_config('test.old_file_path', :'old_file_path', false);

do $student_reservation_authority$
begin
  if not public.current_user_can_upload_classroom_file_object(current_setting('test.old_file_path')) then
    raise exception 'The Student could not upload their valid reserved Classroom object.';
  end if;
end;
$student_reservation_authority$;

select payload ->> 'id' as recent_file_id
from (
  select public.reserve_my_classroom_file_upload(
    :'classroom_id'::uuid, 'recent-diagram.png', 'image/png', 2500,
    'phase4d-file-recent-001'
  ) payload
) reserved \gset
select payload ->> 'id' as withdraw_file_id
from (
  select public.reserve_my_classroom_file_upload(
    :'classroom_id'::uuid, 'student-notes.jpg', 'image/jpeg', 3500,
    'phase4d-file-withdraw-001'
  ) payload
) reserved \gset
select payload ->> 'id' as expired_file_id
from (
  select public.reserve_my_classroom_file_upload(
    :'classroom_id'::uuid, 'older-notes.pdf', 'application/pdf', 4500,
    'phase4d-file-expired-001'
  ) payload
) reserved \gset
select payload ->> 'id' as mentor_file_id
from (
  select public.reserve_my_classroom_file_upload(
    :'classroom_id'::uuid, 'mentor-review.png', 'image/png', 5500,
    'phase4d-file-mentor-001'
  ) payload
) reserved \gset

select set_config('test.recent_file_id', :'recent_file_id', false);
select set_config('test.withdraw_file_id', :'withdraw_file_id', false);
select set_config('test.expired_file_id', :'expired_file_id', false);
select set_config('test.mentor_file_id', :'mentor_file_id', false);

reset role;
update public.classroom_files
set status = 'active', activated_at = now() - interval '7 days',
    withdrawal_deadline = now() - interval '6 days 22 hours'
where id = :'old_file_id'::uuid;
update public.classroom_files
set status = 'active', activated_at = now() - interval '2 days',
    withdrawal_deadline = now() - interval '1 day 22 hours'
where id = :'recent_file_id'::uuid;
update public.classroom_files
set status = 'active', activated_at = now(), withdrawal_deadline = now() + interval '2 hours'
where id = :'withdraw_file_id'::uuid;
update public.classroom_files
set status = 'active', activated_at = now() - interval '3 hours',
    withdrawal_deadline = now() - interval '1 hour'
where id = :'expired_file_id'::uuid;
update public.classroom_files
set status = 'active', activated_at = now() - interval '1 day',
    withdrawal_deadline = now() - interval '22 hours'
where id = :'mentor_file_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_id', true);
do $student_file_projection$
declare payload jsonb := public.get_my_classroom_files(current_setting('test.classroom_id')::uuid);
begin
  if payload #>> '{featureStatus,fileAuthority}' <> 'active_phase_4d'
    or payload #>> '{featureStatus,fileInterface}' <> 'active_phase_4e'
    or (payload #>> '{access,canUpload}')::boolean is not true
    or (payload #>> '{access,canModerate}')::boolean is not false
    or (payload #>> '{uploadRules,maxFileSizeBytes}')::integer <> 20971520
    or (payload #>> '{uploadRules,uploaderWithdrawalMinutes}')::integer <> 120
    or jsonb_array_length(payload -> 'files') <> 5
  then
    raise exception 'The active Student did not receive the Phase 4.D shared-drive authority.';
  end if;
end;
$student_file_projection$;

select public.withdraw_my_classroom_file(:'withdraw_file_id'::uuid, 'Uploaded the wrong image.');
do $expired_withdrawal_denial$
begin
  begin
    perform public.withdraw_my_classroom_file(
      current_setting('test.expired_file_id')::uuid,
      'Trying after the window.'
    );
    raise exception 'Expected expired withdrawal denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected expired withdrawal denial was not raised.' then raise; end if;
    if sqlerrm not like '%two-hour Classroom file withdrawal window%' then raise; end if;
  end;
end;
$expired_withdrawal_denial$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.hide_classroom_file(
  :'recent_file_id'::uuid,
  'This upload contains material that should not remain visible to the Student.'
);
do $tutor_moderation_projection$
declare payload jsonb := public.get_my_classroom_files(current_setting('test.classroom_id')::uuid);
begin
  if (payload #>> '{access,canUpload}')::boolean is not true
    or (payload #>> '{access,canModerate}')::boolean is not true
    or not exists (
      select 1 from jsonb_array_elements(payload -> 'files') file
      where file ->> 'id' = current_setting('test.recent_file_id')
        and file ->> 'status' = 'hidden'
        and nullif(file ->> 'hiddenReason', '') is not null
    )
  then
    raise exception 'The assigned Tutor did not receive reasoned moderation authority.';
  end if;
end;
$tutor_moderation_projection$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.hide_classroom_file(
  :'mentor_file_id'::uuid,
  'The supervisory Mentor is hiding this file while its contents are reviewed.'
);
do $mentor_moderation_projection$
declare payload jsonb := public.get_my_classroom_files(current_setting('test.classroom_id')::uuid);
begin
  if (payload #>> '{access,canUpload}')::boolean is not true
    or (payload #>> '{access,canModerate}')::boolean is not true
    or not exists (
      select 1 from jsonb_array_elements(payload -> 'files') file
      where file ->> 'id' = current_setting('test.mentor_file_id')
        and file ->> 'status' = 'hidden'
        and nullif(file ->> 'hiddenReason', '') is not null
    )
  then
    raise exception 'The supervisory Mentor did not receive reasoned moderation authority.';
  end if;
end;
$mentor_moderation_projection$;

select set_config('request.jwt.claim.sub', :'student_id', true);
do $student_hidden_withdrawn_filter$
declare payload jsonb := public.get_my_classroom_files(current_setting('test.classroom_id')::uuid);
begin
  if exists (
    select 1 from jsonb_array_elements(payload -> 'files') file
    where file ->> 'id' in (
      current_setting('test.recent_file_id'), current_setting('test.mentor_file_id'),
      current_setting('test.withdraw_file_id')
    )
  ) then
    raise exception 'The Student could still read a hidden or withdrawn Classroom file.';
  end if;
end;
$student_hidden_withdrawn_filter$;

select set_config('request.jwt.claim.sub', :'guardian_id', true);
do $guardian_read_only_files$
declare payload jsonb := public.get_my_classroom_files(current_setting('test.classroom_id')::uuid);
begin
  if (payload #>> '{access,canUpload}')::boolean is not false
    or (payload #>> '{access,canModerate}')::boolean is not false
    or jsonb_array_length(payload -> 'files') <> 2
  then
    raise exception 'The Guardian did not receive read-only active Classroom Files.';
  end if;
  begin
    perform public.reserve_my_classroom_file_upload(
      current_setting('test.classroom_id')::uuid,
      'guardian-upload.pdf', 'application/pdf', 1000, 'phase4d-guardian-001'
    );
    raise exception 'Expected Guardian upload denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected Guardian upload denial was not raised.' then raise; end if;
    if sqlerrm not like '%active Student, assigned Tutor, or supervisory Mentor%' then raise; end if;
  end;
end;
$guardian_read_only_files$;

select set_config('request.jwt.claim.sub', :'former_tutor_id', true);
do $former_tutor_tenure_files$
declare payload jsonb := public.get_my_classroom_files(current_setting('test.classroom_id')::uuid);
begin
  if (payload #>> '{access,canUpload}')::boolean is not false
    or jsonb_array_length(payload -> 'files') <> 1
    or payload #>> '{files,0,id}' <> current_setting('test.old_file_id')
  then
    raise exception 'The former Tutor did not receive tenure-bounded read-only Files access.';
  end if;
end;
$former_tutor_tenure_files$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $outsider_files_denial$
begin
  begin
    perform public.get_my_classroom_files(current_setting('test.classroom_id')::uuid);
    raise exception 'Expected outsider Classroom Files denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected outsider Classroom Files denial was not raised.' then raise; end if;
    if sqlerrm not like '%retained Classroom Membership%' then raise; end if;
  end;
end;
$outsider_files_denial$;

reset role;
do $storage_and_audit_contract$
begin
  if not exists (
    select 1 from storage.buckets bucket
    where bucket.id = 'classroom-files' and bucket.public is false
      and bucket.file_size_limit = 20971520
      and bucket.allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png']::text[]
  ) then
    raise exception 'The private Classroom Files bucket contract is missing.';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('classroom_files_authenticated_insert', 'classroom_files_authenticated_select')) <> 2
    or exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'classroom_files_%' and cmd in ('DELETE', 'UPDATE')
    ) then
    raise exception 'Classroom Storage policies exceeded insert/select authority.';
  end if;
  if has_function_privilege(
      'authenticated', 'public.finalize_classroom_file_purge(uuid,uuid,text)', 'execute'
    ) then
    raise exception 'Authenticated users received permanent purge finalization authority.';
  end if;
  if (select count(*) from public.classroom_file_events
      where classroom_id = current_setting('test.classroom_id')::uuid
        and event_type = 'upload_reserved') <> 5
    or not exists (
      select 1 from public.classroom_file_events
      where file_id = current_setting('test.withdraw_file_id')::uuid
        and event_type = 'uploader_withdrew'
    )
    or not exists (
      select 1 from public.classroom_file_events
      where file_id = current_setting('test.recent_file_id')::uuid
        and event_type = 'moderator_hid' and char_length(reason) >= 10
    )
    or not exists (
      select 1 from public.classroom_file_events
      where file_id = current_setting('test.mentor_file_id')::uuid
        and event_type = 'moderator_hid' and char_length(reason) >= 10
    ) then
    raise exception 'Classroom File audit events were incomplete or non-idempotent.';
  end if;
end;
$storage_and_audit_contract$;

rollback;
select 'passed' as classroom_private_files_characterization;
