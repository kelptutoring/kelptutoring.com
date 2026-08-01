-- Phase 5.E.4 repair: server adapters verify that each authoritative Course
-- Schedule publication also refreshed the legacy Calendar/assignment mirror.
-- The service role bypasses RLS but still requires explicit table privileges.
-- Browser roles remain limited to the governed RPC projections.

grant select on public.learning_schedules to service_role;
grant select on public.learning_schedule_sessions to service_role;

comment on table public.learning_schedules is
  'Compatibility Schedule mirror for Calendar and assignments. Browser access remains RPC-only; server adapters may verify synchronized rows.';
comment on table public.learning_schedule_sessions is
  'Compatibility Schedule-session mirror for Calendar and assignments. Browser access remains RPC-only; server adapters may verify synchronized rows.';
