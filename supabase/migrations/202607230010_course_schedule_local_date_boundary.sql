begin;

create or replace function public.course_schedule_version_current_date(
  p_version_id uuid
)
returns date
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select (now() at time zone version.time_zone)::date
      from public.course_schedule_versions version
      where version.id = p_version_id
    ),
    (now() at time zone 'UTC')::date
  );
$$;

revoke all on function public.course_schedule_version_current_date(uuid)
from public, anon, authenticated;

do $patch_publish_course_schedule_version$
declare
  original_definition text;
  patched_definition text;
  original_boundary constant text :=
    'prior_item.scheduled_date < current_date';
  local_boundary constant text :=
    'prior_item.scheduled_date < public.course_schedule_version_current_date(prior_item.version_id)';
begin
  select pg_get_functiondef(
    'public.publish_course_schedule_version(uuid,uuid,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;

  if original_definition is null
    or position(original_boundary in original_definition) = 0 then
    raise exception
      'The Course Schedule publishing date boundary no longer matches the expected Phase 5.D definition.';
  end if;

  patched_definition := replace(
    original_definition,
    original_boundary,
    local_boundary
  );

  if patched_definition = original_definition
    or position(local_boundary in patched_definition) = 0 then
    raise exception
      'The Course Schedule publishing date boundary could not be made timezone-aware.';
  end if;

  execute patched_definition;
end;
$patch_publish_course_schedule_version$;

comment on function public.course_schedule_version_current_date(uuid) is
  'Returns the transaction-local calendar date in an immutable Course Schedule Version timezone. Used by structural past-item locks instead of the database server date.';

comment on function public.publish_course_schedule_version(
  uuid, uuid, jsonb, jsonb, text
) is
  'Publishes an immutable successor Course Schedule Version with authorization, reasons, concurrency, Track/resource inheritance, Studied locks, and Schedule-timezone-aware past-item protection.';

commit;
