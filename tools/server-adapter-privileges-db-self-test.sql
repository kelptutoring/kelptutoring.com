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
    or not has_table_privilege('service_role', 'public.course_schedules', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_versions', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_version_coverages', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_items', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_change_reasons', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_version_changes', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_publish_commands', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_notification_events', 'select')
    or not has_table_privilege('service_role', 'public.course_schedule_item_resources', 'select')
    or not has_table_privilege('service_role', 'public.course_progress_events', 'select')
    or not has_table_privilege('service_role', 'public.course_progress_commands', 'select')
    or not has_table_privilege('service_role', 'public.course_progress_notification_events', 'select')
    or not has_table_privilege('service_role', 'public.course_progress_restoration_provenance', 'select')
    or not has_table_privilege('service_role', 'public.learning_schedules', 'select')
    or not has_table_privilege('service_role', 'public.learning_schedule_sessions', 'select')
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
    or has_table_privilege('authenticated', 'public.course_progress_events', 'select')
    or has_table_privilege('authenticated', 'public.course_progress_commands', 'select')
    or has_table_privilege('authenticated', 'public.course_progress_restoration_provenance', 'select')
    or has_table_privilege('authenticated', 'public.learning_schedules', 'select')
    or has_table_privilege('authenticated', 'public.learning_schedule_sessions', 'select')
  then
    raise exception 'A server-only table privilege leaked to a browser role.';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.get_my_course_schedule_builder_context(uuid)',
      'execute'
    )
    or not has_function_privilege(
      'authenticated',
      'public.publish_course_builder_schedule(uuid,uuid,jsonb,jsonb,jsonb,text)',
      'execute'
    )
    or not has_function_privilege(
      'authenticated',
      'public.get_my_effective_course_schedule(uuid)',
      'execute'
    )
    or has_function_privilege(
      'anon',
      'public.get_my_effective_course_schedule(uuid)',
      'execute'
    )
    or not has_function_privilege(
      'authenticated',
      'public.get_my_unified_course_schedule(uuid)',
      'execute'
    )
    or has_function_privilege(
      'anon',
      'public.get_my_unified_course_schedule(uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.normalize_course_schedule_builder_cadence(jsonb)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.course_schedule_builder_publication_metadata(jsonb)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.course_schedule_successor_metadata(uuid,uuid,uuid,text,text,text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.course_schedule_active_plan_epoch(uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.course_schedule_adaptive_item_order(uuid,uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.course_schedule_apply_restoration_order(uuid,uuid,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.course_schedule_effective_plan_end(uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_my_classroom_calendar_phase5g2_4_7_3_4_base(uuid,date,date)',
      'execute'
    )
  then
    raise exception 'The Course Schedule Browser RPC privileges are invalid.';
  end if;
end;
$verify_server_adapter_privileges$;

rollback;
