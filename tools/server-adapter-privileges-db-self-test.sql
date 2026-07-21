\set ON_ERROR_STOP on

begin;

do $verify_server_adapter_privileges$
begin
  if not has_table_privilege('service_role', 'public.profiles', 'select')
    or not has_table_privilege('service_role', 'public.user_preferences', 'select')
    or not has_table_privilege('service_role', 'public.user_roles', 'select')
    or not has_table_privilege('service_role', 'public.teaching_qualifications', 'select')
    or not has_table_privilege('service_role', 'public.mentor_tutor_assignments', 'select')
    or not has_table_privilege('service_role', 'public.student_courses', 'select')
    or not has_table_privilege('service_role', 'public.classrooms', 'select')
    or not has_table_privilege('service_role', 'public.course_assignments', 'select')
  then
    raise exception 'The service role is missing a required server-adapter SELECT privilege.';
  end if;

  if not has_table_privilege('service_role', 'public.course_assignments', 'insert')
    or not has_table_privilege('service_role', 'public.course_assignment_items', 'insert')
  then
    raise exception 'The service role is missing a required protected-assignment INSERT privilege.';
  end if;

  if has_table_privilege('anon', 'public.profiles', 'select')
    or has_table_privilege('anon', 'public.course_assignments', 'insert')
    or has_table_privilege('authenticated', 'public.course_assignments', 'insert')
  then
    raise exception 'A server-only table privilege leaked to a browser role.';
  end if;
end;
$verify_server_adapter_privileges$;

rollback;
