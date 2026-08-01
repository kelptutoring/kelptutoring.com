\set ON_ERROR_STOP on

\if :{?student_id}
\else
  \echo 'Missing required actor variable: student_id'
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
\if :{?teacher_id}
\else
  \echo 'Missing required actor variable: teacher_id'
  \quit 3
\endif
\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?admin_id}
\else
  \echo 'Missing required actor variable: admin_id'
  \quit 3
\endif
\if :{?student_tutor_id}
\else
  \echo 'Missing required actor variable: student_tutor_id'
  \quit 3
\endif
\if :{?tutor_mentor_id}
\else
  \echo 'Missing required actor variable: tutor_mentor_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select set_config('audit.student_id', :'student_id', false);
select set_config('audit.student_b_id', :'student_b_id', false);
select set_config('audit.tutor_id', :'tutor_id', false);
select set_config('audit.teacher_id', :'teacher_id', false);
select set_config('audit.mentor_id', :'mentor_id', false);
select set_config('audit.admin_id', :'admin_id', false);
select set_config('audit.student_tutor_id', :'student_tutor_id', false);
select set_config('audit.tutor_mentor_id', :'tutor_mentor_id', false);
select set_config('audit.outsider_id', :'outsider_id', false);

do $audit$
declare
  expected jsonb := jsonb_build_object(
    current_setting('audit.student_id'), jsonb_build_object('roles', jsonb_build_array('student'), 'primary', 'student'),
    current_setting('audit.student_b_id'), jsonb_build_object('roles', jsonb_build_array('student'), 'primary', 'student'),
    current_setting('audit.tutor_id'), jsonb_build_object('roles', jsonb_build_array('tutor'), 'primary', 'tutor'),
    current_setting('audit.teacher_id'), jsonb_build_object('roles', jsonb_build_array('teacher'), 'primary', 'teacher'),
    current_setting('audit.mentor_id'), jsonb_build_object('roles', jsonb_build_array('mentor'), 'primary', 'mentor'),
    current_setting('audit.admin_id'), jsonb_build_object('roles', jsonb_build_array('admin'), 'primary', 'admin'),
    current_setting('audit.student_tutor_id'), jsonb_build_object('roles', jsonb_build_array('student', 'tutor'), 'primary', 'student'),
    current_setting('audit.tutor_mentor_id'), jsonb_build_object('roles', jsonb_build_array('tutor', 'mentor'), 'primary', 'mentor'),
    current_setting('audit.outsider_id'), jsonb_build_object('roles', jsonb_build_array('student'), 'primary', 'student')
  );
  actor record;
  expected_roles text[];
  actual_roles text[];
  actual_primary text;
  table_row record;
  residue_count bigint;
begin
  for actor in select key::uuid as id, value as contract from jsonb_each(expected)
  loop
    if not exists (select 1 from auth.users where id = actor.id)
      or not exists (select 1 from public.profiles where id = actor.id) then
      raise exception 'Synthetic actor % is missing its Auth user or profile.', actor.id;
    end if;

    select array_agg(value order by value)
    into expected_roles
    from jsonb_array_elements_text(actor.contract -> 'roles');

    select
      array_agg(role_key order by role_key) filter (where status = 'active'),
      max(role_key) filter (where status = 'active' and is_primary)
    into actual_roles, actual_primary
    from public.user_roles
    where user_id = actor.id;

    if actual_roles is distinct from expected_roles
      or actual_primary is distinct from actor.contract ->> 'primary' then
      raise exception 'Synthetic actor % role state drifted: roles %, primary %.', actor.id, actual_roles, actual_primary;
    end if;
  end loop;

  for table_row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format(
      'select count(*) from %I.%I as candidate where to_jsonb(candidate)::text ~ $pattern$(phase[0-9][a-z0-9._-]*-db-|Forces and free-body diagrams|Temporary administrator leaf|Renamed administrator leaf)$pattern$',
      table_row.schemaname,
      table_row.tablename
    ) into residue_count;
    if residue_count > 0 then
      raise exception 'Rollback residue found in %.% (% rows).', table_row.schemaname, table_row.tablename, residue_count;
    end if;
  end loop;
end;
$audit$;

select
  9 as verified_synthetic_actors,
  0 as retained_characterization_rows,
  'passed' as post_run_audit;
