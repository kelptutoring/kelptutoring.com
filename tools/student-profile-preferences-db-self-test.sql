\set ON_ERROR_STOP on

\if :{?student_id}
\else
  \echo 'Missing required actor variable: student_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  :'student_id'::uuid <> :'outsider_id'::uuid
  and exists (select 1 from public.profiles where id = :'student_id'::uuid)
  and exists (select 1 from public.profiles where id = :'outsider_id'::uuid)
  and exists (select 1 from public.user_roles where user_id = :'student_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'outsider_id'::uuid and role_key = 'student' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic Profile actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;

select set_config('test.student_id', :'student_id', false);
select set_config('test.outsider_id', :'outsider_id', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_id', true);

do $test$
declare
  profile_payload jsonb := public.get_my_profile_configuration();
begin
  if profile_payload #>> '{profile,id}' <> current_setting('test.student_id') then
    raise exception 'The self Profile RPC returned another account.';
  end if;
  if profile_payload #>> '{preferences,themeKey}' <> 'ocean' then
    raise exception 'The existing Student did not receive the default Ocean preference.';
  end if;
  if profile_payload #>> '{learningSummary,status}' <> 'awaiting_learning_domains' then
    raise exception 'Unsupported learning statistics were not marked unavailable.';
  end if;
end;
$test$;

select public.save_my_student_profile(
  jsonb_build_object(
    'fullName', 'Phase 1 Student',
    'birthDate', coalesce((select birth_date::text from public.profiles where id = :'student_id'::uuid), '2000-01-01'),
    'locationKey', 'kelp:br:sp:sao-paulo'
  ),
  array['reading', 'coding-technology'],
  array['strengthen-foundations', 'problem-solving']
);

select public.save_my_preferences(jsonb_build_object(
  'themeKey', 'coral'
));

do $test$
declare
  profile_payload jsonb := public.get_my_profile_configuration();
begin
  if profile_payload #>> '{profile,location,key}' <> 'kelp:br:sp:sao-paulo'
    or profile_payload #>> '{preferences,themeKey}' <> 'coral'
    or profile_payload #>> '{preferences,timeZone}' <> 'America/Sao_Paulo'
  then
    raise exception 'Saved Profile configuration did not round-trip.';
  end if;
  if jsonb_array_length(profile_payload -> 'hobbies') <> 2
    or jsonb_array_length(profile_payload -> 'learningGoals') <> 2
  then
    raise exception 'Governed Profile selections did not round-trip.';
  end if;
end;
$test$;

do $test$
begin
  begin
    perform public.save_my_student_profile(
      '{"fullName":"Phase 1 Student","birthDate":"1999-12-31","locationKey":"kelp:br:sp:sao-paulo"}'::jsonb,
      array['reading'], array['problem-solving']
    );
    raise exception 'Expected birth-date mutation rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected birth-date mutation rejection was not raised.' then raise; end if;
    if sqlerrm not like '%Birth date corrections require Support review%' then raise; end if;
  end;

  begin
    perform public.save_my_student_profile(
      '{"fullName":"Phase 1 Student","birthDate":"2000-01-01","locationKey":"browser-authored-place"}'::jsonb,
      array['reading'], array['problem-solving']
    );
    raise exception 'Expected location-catalog rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected location-catalog rejection was not raised.' then raise; end if;
    if sqlerrm not like '%Choose an available country, state, and city%' then raise; end if;
  end;

  begin
    perform public.save_my_preferences('{"themeKey":"arbitrary-css"}'::jsonb);
    raise exception 'Expected theme allowlist rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected theme allowlist rejection was not raised.' then raise; end if;
    if sqlerrm not like '%Choose an available theme%' then raise; end if;
  end;

  begin
    perform public.save_my_preferences('{"themeKey":"coral","timeZone":"America/New_York"}'::jsonb);
    raise exception 'Expected derived-timezone rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected derived-timezone rejection was not raised.' then raise; end if;
    if sqlerrm not like '%Timezone is derived from the Profile country, state, and city%' then raise; end if;
  end;
end;
$test$;

select public.reset_my_preferences('theme');

do $test$
declare
  profile_payload jsonb := public.get_my_profile_configuration();
begin
  if profile_payload #>> '{preferences,themeKey}' <> 'ocean'
    or profile_payload #>> '{preferences,timeZone}' <> 'America/Sao_Paulo'
  then
    raise exception 'Individual theme reset changed the wrong preference fields.';
  end if;
end;
$test$;

set local role postgres;

do $test$
begin
  if (select count(*) from public.user_profile_option_selections
      where user_id = current_setting('test.student_id')::uuid) <> 4 then
    raise exception 'The Student selection rows are incomplete.';
  end if;
  if not exists (select 1 from public.profile_change_events
      where user_id = current_setting('test.student_id')::uuid and event_type = 'profile_updated')
    or not exists (select 1 from public.profile_change_events
      where user_id = current_setting('test.student_id')::uuid and event_type = 'preferences_updated')
  then
    raise exception 'Profile or preference audit events are missing.';
  end if;
end;
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'outsider_id', true);

do $test$
declare
  visible_preferences integer;
  own_payload jsonb := public.get_my_profile_configuration();
begin
  select count(*) into visible_preferences
  from public.user_preferences where user_id = current_setting('test.student_id')::uuid;
  if visible_preferences <> 0 then
    raise exception 'Another Student can read the target Student preferences.';
  end if;
  if own_payload #>> '{profile,id}' <> current_setting('test.outsider_id') then
    raise exception 'The self Profile RPC accepted another account identity.';
  end if;

  begin
    update public.user_preferences set theme_key = 'coral'
    where user_id = current_setting('test.student_id')::uuid;
    raise exception 'Expected direct preference update denial was not raised.';
  exception when insufficient_privilege then null;
  end;
end;
$test$;

rollback;

\echo 'Student Profile and preference rollback characterization passed.'
