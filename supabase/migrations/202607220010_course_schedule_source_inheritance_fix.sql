-- Phase 5.E.1 repair: non-Curriculum items intentionally have no Track
-- content-version key. Never pass that SQL NULL to jsonb_set while inheriting
-- a Review or Exam source snapshot into a successor Schedule Version.

create or replace function public.inherit_course_schedule_item_source_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_item public.course_schedule_items%rowtype;
  merged_snapshot jsonb;
begin
  if new.source_snapshot is null or jsonb_typeof(new.source_snapshot) <> 'object' then
    raise exception 'A Course Schedule item source snapshot must be an object.';
  end if;

  select prior_item.* into previous_item
  from public.course_schedule_versions new_version
  join public.course_schedule_items prior_item
    on prior_item.version_id = new_version.previous_version_id
   and prior_item.stable_item_key = new.stable_item_key
  where new_version.id = new.version_id;

  if found then
    merged_snapshot := previous_item.source_snapshot || new.source_snapshot;
    if previous_item.source_content_version_key is not null
      and nullif(btrim(coalesce(
        new.source_snapshot ->> 'sourceContentVersionKey',
        new.source_snapshot ->> 'contentVersionKey',
        new.source_snapshot ->> 'contentVersion'
      )), '') is null then
      merged_snapshot := jsonb_set(
        merged_snapshot,
        '{sourceContentVersionKey}',
        to_jsonb(previous_item.source_content_version_key),
        true
      );
    end if;
    new.source_snapshot := merged_snapshot;
  end if;

  return new;
end;
$$;

revoke all on function public.inherit_course_schedule_item_source_snapshot()
  from public, anon, authenticated;

comment on function public.inherit_course_schedule_item_source_snapshot() is
  'Carries immutable Track source/resource metadata into successor Schedule items while leaving Review and Exam content-version identity intentionally null.';
