-- Phase 1.A follow-up: allow the local governed-catalog importer to verify
-- hierarchical RPCs after PUBLIC execution was revoked.

grant execute on function public.list_profile_countries() to service_role;
grant execute on function public.list_profile_regions(text) to service_role;
grant execute on function public.list_profile_cities(text, text) to service_role;

select pg_catalog.pg_notify('pgrst', 'reload schema');
