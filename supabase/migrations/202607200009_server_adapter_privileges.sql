-- Server-side adapters use the Supabase service-role token. RLS bypass alone
-- does not confer PostgreSQL table privileges, so grant only the operations
-- required by trusted backend orchestration and local acceptance provisioning.
-- These grants do not apply to anon or authenticated browser sessions.

grant select on table
  public.profiles,
  public.user_preferences,
  public.user_roles,
  public.teaching_qualifications,
  public.mentor_tutor_assignments,
  public.student_courses,
  public.classrooms,
  public.course_assignments
to service_role;

grant insert on table
  public.course_assignments,
  public.course_assignment_items
to service_role;

comment on table public.course_assignments is
  'Immutable Student practice assignments. Trusted server adapters may create snapshots; browsers use protected RPC projections.';
