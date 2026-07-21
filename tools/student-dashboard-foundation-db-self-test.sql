\set ON_ERROR_STOP on

\if :{?student_a_id}
\else
  \echo 'Missing required actor variable: student_a_id'
  \quit 3
\endif
\if :{?student_b_id}
\else
  \echo 'Missing required actor variable: student_b_id'
  \quit 3
\endif
\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  cardinality(array[
    :'student_a_id'::uuid, :'student_b_id'::uuid,
    :'tutor_id'::uuid, :'outsider_id'::uuid
  ]) = cardinality(array(
    select distinct value from unnest(array[
      :'student_a_id'::uuid, :'student_b_id'::uuid,
      :'tutor_id'::uuid, :'outsider_id'::uuid
    ]) value
  ))
  and exists (select 1 from public.user_roles where user_id = :'student_a_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_b_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'outsider_id'::uuid and role_key = 'student' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic Dashboard actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
select set_config('test.student_a_id', :'student_a_id', false);
select set_config('test.student_b_id', :'student_b_id', false);
select set_config('test.tutor_id', :'tutor_id', false);
select set_config('test.outsider_id', :'outsider_id', false);
set local role authenticated;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
do $dashboard_default$
declare payload jsonb := public.get_my_student_dashboard();
begin
  if payload #>> '{viewer,id}' <> current_setting('test.student_a_id')
    or payload #> '{preferences,blockOrder}' <> '["calendar","classrooms"]'::jsonb
    or payload #>> '{preferences,calendarView}' <> 'month'
    or payload #> '{preferences,collapsedBlocks}' <> '[]'::jsonb
    or payload #>> '{featureStatus,credits}' <> 'pending_credit_phase'
    or jsonb_array_length(payload -> 'classrooms') < 1 then
    raise exception 'Student A did not receive the default relationship-backed Dashboard.';
  end if;
end;
$dashboard_default$;

select public.save_my_student_dashboard_preferences(jsonb_build_object(
  'blockOrder', jsonb_build_array('classrooms', 'calendar'),
  'calendarView', 'week',
  'collapsedBlocks', jsonb_build_array('calendar')
));

do $dashboard_saved$
declare payload jsonb := public.get_my_student_dashboard();
begin
  if payload #> '{preferences,blockOrder}' <> '["classrooms","calendar"]'::jsonb
    or payload #>> '{preferences,calendarView}' <> 'week'
    or payload #> '{preferences,collapsedBlocks}' <> '["calendar"]'::jsonb
    or (payload #>> '{preferences,revision}')::bigint < 1 then
    raise exception 'Saved Dashboard preferences did not round-trip.';
  end if;
end;
$dashboard_saved$;

do $dashboard_invalid$
begin
  begin
    perform public.save_my_student_dashboard_preferences(
      '{"blockOrder":["calendar","calendar"]}'::jsonb
    );
    raise exception 'Expected invalid Dashboard order rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected invalid Dashboard order rejection was not raised.' then raise; end if;
  end;
end;
$dashboard_invalid$;

do $dashboard_invalid_collapsed$
begin
  begin
    perform public.save_my_student_dashboard_preferences(
      '{"collapsedBlocks":["calendar","calendar"]}'::jsonb
    );
    raise exception 'Expected duplicate collapsed Dashboard block rejection was not raised.';
  exception when others then
    if sqlerrm = 'Expected duplicate collapsed Dashboard block rejection was not raised.' then raise; end if;
  end;
end;
$dashboard_invalid_collapsed$;

select set_config('request.jwt.claim.sub', :'student_b_id', true);
do $dashboard_isolation$
declare payload jsonb := public.get_my_student_dashboard();
begin
  if exists (
      select 1 from public.student_dashboard_preferences
      where user_id = current_setting('test.student_a_id')::uuid
    )
    or payload #> '{preferences,blockOrder}' <> '["calendar","classrooms"]'::jsonb
    or jsonb_array_length(payload -> 'classrooms') < 1 then
    raise exception 'Student B received Student A Dashboard preferences or lost their own relationship projection.';
  end if;
end;
$dashboard_isolation$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);
do $dashboard_outsider$
declare payload jsonb := public.get_my_student_dashboard();
begin
  if jsonb_array_length(payload -> 'classrooms') <> 0
    or payload #> '{preferences,blockOrder}' <> '["calendar","classrooms"]'::jsonb then
    raise exception 'The unlinked Student received relationship data or another Student preference.';
  end if;
end;
$dashboard_outsider$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
do $dashboard_role_boundary$
begin
  begin
    perform public.get_my_student_dashboard();
    raise exception 'Expected Tutor Dashboard denial was not raised.';
  exception when others then
    if sqlerrm = 'Expected Tutor Dashboard denial was not raised.' then raise; end if;
  end;
end;
$dashboard_role_boundary$;

select set_config('request.jwt.claim.sub', :'student_a_id', true);
select public.reset_my_student_dashboard_preferences();
do $dashboard_reset$
declare payload jsonb := public.get_my_student_dashboard();
begin
  if payload #> '{preferences,blockOrder}' <> '["calendar","classrooms"]'::jsonb
    or payload #>> '{preferences,calendarView}' <> 'month'
    or payload #> '{preferences,collapsedBlocks}' <> '[]'::jsonb
    or exists (
      select 1 from public.student_dashboard_preferences
      where user_id = current_setting('test.student_a_id')::uuid
    ) then
    raise exception 'Dashboard preference reset did not restore server defaults.';
  end if;
end;
$dashboard_reset$;

rollback;
select 'passed' as student_dashboard_foundation_characterization;
