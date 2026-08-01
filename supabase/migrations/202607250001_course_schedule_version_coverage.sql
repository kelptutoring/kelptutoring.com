-- Phase 5.G.2.4.2: immutable multi-curriculum coverage for every Schedule
-- Version. Existing single-focus Courses receive one equivalent primary
-- branch without rewriting their Versions, items, dates, progress, Classroom,
-- Memberships, or history.

create or replace function public.course_schedule_coverage_snapshot_is_valid(
  p_snapshot jsonb,
  p_primary_track_key text
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  branches jsonb;
  branch jsonb;
  goal jsonb;
  node_value jsonb;
  node_field text;
  branch_key text;
  track_key text;
  primary_count integer := 0;
  primary_track_count integer := 0;
  branch_keys text[] := array[]::text[];
  track_keys text[] := array[]::text[];
  goal_keys text[];
begin
  if p_snapshot is null
    or jsonb_typeof(p_snapshot) <> 'object'
    or btrim(coalesce(p_primary_track_key, '')) = ''
    or char_length(btrim(p_primary_track_key)) > 320 then
    return false;
  end if;
  if coalesce(p_snapshot ->> 'schemaVersion', '') !~ '^[0-9]+$'
    or (p_snapshot ->> 'schemaVersion')::integer <> 1
    or btrim(coalesce(p_snapshot ->> 'primaryTrackKey', ''))
      <> btrim(p_primary_track_key) then
    return false;
  end if;

  branches := p_snapshot -> 'branches';
  if branches is null
    or jsonb_typeof(branches) <> 'array'
    or jsonb_array_length(branches) < 1
    or jsonb_array_length(branches) > 64 then
    return false;
  end if;

  for branch in
    select branch_element.value
    from jsonb_array_elements(branches) as branch_element(value)
  loop
    if jsonb_typeof(branch) <> 'object'
      or coalesce(branch ->> 'role', '') not in ('primary', 'supporting') then
      return false;
    end if;

    branch_key := btrim(coalesce(branch ->> 'branchKey', ''));
    track_key := btrim(coalesce(branch #>> '{track,key}', ''));
    if branch_key = '' or char_length(branch_key) > 320
      or track_key = '' or char_length(track_key) > 320
      or branch_key = any(branch_keys)
      or track_key = any(track_keys) then
      return false;
    end if;
    branch_keys := array_append(branch_keys, branch_key);
    track_keys := array_append(track_keys, track_key);

    foreach node_field in array array['educationLevel', 'subject', 'track']
    loop
      node_value := branch -> node_field;
      if node_value is null
        or jsonb_typeof(node_value) <> 'object'
        or coalesce(node_value ->> 'nodeId', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or btrim(coalesce(node_value ->> 'key', '')) = ''
        or char_length(btrim(node_value ->> 'key')) > 320
        or btrim(coalesce(node_value ->> 'name', '')) = ''
        or char_length(btrim(node_value ->> 'name')) > 240
        or coalesce(node_value ->> 'slug', '') !~
          '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
        return false;
      end if;
    end loop;

    if branch -> 'goals' is null
      or jsonb_typeof(branch -> 'goals') <> 'array'
      or jsonb_array_length(branch -> 'goals') > 32 then
      return false;
    end if;
    goal_keys := array[]::text[];
    for goal in
      select goal_element.value
      from jsonb_array_elements(branch -> 'goals') as goal_element(value)
    loop
      if jsonb_typeof(goal) <> 'object'
        or btrim(coalesce(goal ->> 'key', '')) = ''
        or char_length(btrim(goal ->> 'key')) > 320
        or btrim(coalesce(goal ->> 'name', '')) = ''
        or char_length(btrim(goal ->> 'name')) > 240
        or coalesce(goal ->> 'slug', '') !~
          '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        or btrim(goal ->> 'key') = any(goal_keys) then
        return false;
      end if;
      goal_keys := array_append(goal_keys, btrim(goal ->> 'key'));
    end loop;

    if branch ->> 'role' = 'primary' then
      primary_count := primary_count + 1;
      if track_key = btrim(p_primary_track_key) then
        primary_track_count := primary_track_count + 1;
      end if;
    end if;
  end loop;

  return primary_count = 1 and primary_track_count = 1;
exception when others then
  return false;
end;
$$;

create or replace function public.course_schedule_coverage_display_label(
  p_snapshot jsonb
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  branch jsonb;
  goal jsonb;
  label_part text;
  levels text[] := array[]::text[];
  goals text[] := array[]::text[];
  subjects text[] := array[]::text[];
  sections text[] := array[]::text[];
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot -> 'branches') <> 'array' then
    return '';
  end if;
  for branch in
    select branch_element.value
    from jsonb_array_elements(p_snapshot -> 'branches') as branch_element(value)
  loop
    label_part := btrim(coalesce(branch #>> '{educationLevel,name}', ''));
    if label_part <> '' and not label_part = any(levels) then
      levels := array_append(levels, label_part);
    end if;

    if jsonb_typeof(branch -> 'goals') = 'array' then
      for goal in
        select goal_element.value
        from jsonb_array_elements(branch -> 'goals') as goal_element(value)
      loop
        label_part := btrim(coalesce(goal ->> 'name', ''));
        if label_part <> '' and not label_part = any(goals) then
          goals := array_append(goals, label_part);
        end if;
      end loop;
    end if;

    label_part := btrim(coalesce(branch #>> '{subject,name}', ''));
    if label_part <> '' and not label_part = any(subjects) then
      subjects := array_append(subjects, label_part);
    end if;
  end loop;

  if cardinality(levels) > 0 then sections := array_append(sections, array_to_string(levels, ' + ')); end if;
  if cardinality(goals) > 0 then sections := array_append(sections, array_to_string(goals, ' + ')); end if;
  if cardinality(subjects) > 0 then sections := array_append(sections, array_to_string(subjects, ' + ')); end if;
  return array_to_string(sections, ' · ');
end;
$$;

create table if not exists public.course_schedule_version_coverages (
  version_id uuid primary key
    references public.course_schedule_versions(id) on delete restrict,
  schema_version integer not null default 1,
  primary_track_key text not null,
  coverage_snapshot jsonb not null,
  display_label text not null,
  provenance text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint course_schedule_version_coverages_schema_check check (schema_version = 1),
  constraint course_schedule_version_coverages_primary_key_check check (
    btrim(primary_track_key) <> '' and char_length(btrim(primary_track_key)) <= 320
  ),
  constraint course_schedule_version_coverages_snapshot_check check (
    public.course_schedule_coverage_snapshot_is_valid(
      coverage_snapshot,
      primary_track_key
    )
  ),
  constraint course_schedule_version_coverages_label_check check (
    btrim(display_label) <> ''
    and char_length(display_label) <= 1000
    and display_label = public.course_schedule_coverage_display_label(coverage_snapshot)
  ),
  constraint course_schedule_version_coverages_provenance_check check (
    provenance in ('legacy_course_scope', 'inherited', 'selected')
  ),
  constraint course_schedule_version_coverages_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists course_schedule_version_coverages_primary_track_idx
on public.course_schedule_version_coverages (primary_track_key, version_id);

create or replace function public.build_legacy_course_schedule_coverage(
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  subject_record public.curriculum_nodes%rowtype;
  track_record public.curriculum_nodes%rowtype;
  level_record public.curriculum_nodes%rowtype;
begin
  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then raise exception 'The Course coverage source could not be found.'; end if;

  select * into subject_record
  from public.curriculum_nodes
  where id = course_record.subject_node_id;
  select * into track_record
  from public.curriculum_nodes
  where id = course_record.focus_node_id;
  if subject_record.id is null or track_record.id is null then
    raise exception 'The legacy Course coverage has an invalid Subject or Track identity.';
  end if;

  with recursive lineage as (
    select node.*, 0 as depth
    from public.curriculum_nodes node
    where node.id = subject_record.id
    union all
    select parent.*, child.depth + 1
    from public.curriculum_nodes parent
    join lineage child on child.parent_id = parent.id
  )
  select node.* into level_record
  from lineage path
  join public.curriculum_nodes node on node.id = path.id
  where node.node_type = 'degree'
  order by path.depth
  limit 1;
  if level_record.id is null then
    raise exception 'The legacy Course Subject does not have an Education level.';
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'primaryTrackKey', track_record.id::text,
    'branches', jsonb_build_array(jsonb_build_object(
      'branchKey', 'legacy-course-scope:' || track_record.id::text,
      'role', 'primary',
      'educationLevel', jsonb_build_object(
        'nodeId', level_record.id,
        'key', level_record.id::text,
        'name', level_record.name,
        'slug', level_record.slug
      ),
      'goals', '[]'::jsonb,
      'subject', jsonb_build_object(
        'nodeId', subject_record.id,
        'key', subject_record.id::text,
        'name', subject_record.name,
        'slug', subject_record.slug
      ),
      'track', jsonb_build_object(
        'nodeId', track_record.id,
        'key', track_record.id::text,
        'name', track_record.name,
        'slug', track_record.slug
      )
    ))
  );
end;
$$;

-- Backfill every retained Version. Goals remain empty because no existing
-- Course explicitly selected AP, SAT, ACT, IB, or another Goal.
insert into public.course_schedule_version_coverages (
  version_id,
  schema_version,
  primary_track_key,
  coverage_snapshot,
  display_label,
  provenance,
  metadata
)
select
  version.id,
  1,
  course.focus_node_id::text,
  built.snapshot,
  public.course_schedule_coverage_display_label(built.snapshot),
  'legacy_course_scope',
  jsonb_build_object(
    'migration', '202607250001',
    'sourceSubjectNodeId', course.subject_node_id,
    'sourceFocusNodeId', course.focus_node_id
  )
from public.course_schedule_versions version
join public.course_schedules schedule on schedule.id = version.schedule_id
join public.student_courses course on course.id = schedule.course_id
cross join lateral (
  select public.build_legacy_course_schedule_coverage(course.id) as snapshot
) built
on conflict (version_id) do nothing;

create or replace function public.snapshot_course_schedule_version_coverage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_coverage public.course_schedule_version_coverages%rowtype;
  course_record public.student_courses%rowtype;
  snapshot jsonb;
begin
  if exists (
    select 1 from public.course_schedule_version_coverages coverage
    where coverage.version_id = new.id
  ) then
    return new;
  end if;

  if new.previous_version_id is not null then
    select * into previous_coverage
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = new.previous_version_id;
    if not found then
      raise exception 'The previous Schedule Version has no immutable curriculum coverage.';
    end if;

    insert into public.course_schedule_version_coverages (
      version_id, schema_version, primary_track_key, coverage_snapshot,
      display_label, provenance, metadata
    ) values (
      new.id,
      previous_coverage.schema_version,
      previous_coverage.primary_track_key,
      previous_coverage.coverage_snapshot,
      previous_coverage.display_label,
      'inherited',
      jsonb_build_object(
        'previousVersionId', new.previous_version_id,
        'inheritedCoverageProvenance', previous_coverage.provenance
      )
    );
    return new;
  end if;

  select course.* into course_record
  from public.course_schedules schedule
  join public.student_courses course on course.id = schedule.course_id
  where schedule.id = new.schedule_id;
  if not found then
    raise exception 'The Schedule Version has no Course for its coverage snapshot.';
  end if;

  snapshot := public.build_legacy_course_schedule_coverage(course_record.id);
  insert into public.course_schedule_version_coverages (
    version_id, schema_version, primary_track_key, coverage_snapshot,
    display_label, provenance, metadata
  ) values (
    new.id,
    1,
    course_record.focus_node_id::text,
    snapshot,
    public.course_schedule_coverage_display_label(snapshot),
    'legacy_course_scope',
    jsonb_build_object(
      'createdWithVersion', true,
      'sourceSubjectNodeId', course_record.subject_node_id,
      'sourceFocusNodeId', course_record.focus_node_id
    )
  );
  return new;
end;
$$;

drop trigger if exists snapshot_course_schedule_version_coverage
on public.course_schedule_versions;
create trigger snapshot_course_schedule_version_coverage
after insert on public.course_schedule_versions
for each row execute function public.snapshot_course_schedule_version_coverage();

create or replace function public.reject_course_schedule_coverage_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Course Schedule Version coverage is immutable; publish a successor Version instead.';
end;
$$;

drop trigger if exists course_schedule_version_coverages_immutable
on public.course_schedule_version_coverages;
create trigger course_schedule_version_coverages_immutable
before update or delete on public.course_schedule_version_coverages
for each row execute function public.reject_course_schedule_coverage_mutation();

alter table public.course_schedule_version_coverages enable row level security;

drop policy if exists "Active Students and authorized staff read Version coverage"
on public.course_schedule_version_coverages;
create policy "Active Students and authorized staff read Version coverage"
on public.course_schedule_version_coverages for select to authenticated
using (exists (
  select 1
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  join public.student_courses course on course.id = schedule.course_id
  where version.id = course_schedule_version_coverages.version_id
    and (
      (
        course.student_id = (select auth.uid())
        and course.active_schedule_version_id = version.id
      )
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

revoke all on public.course_schedule_version_coverages
from public, anon, authenticated;
grant select on public.course_schedule_version_coverages to authenticated;
grant select on public.course_schedule_version_coverages to service_role;

revoke all on function public.course_schedule_coverage_snapshot_is_valid(jsonb, text)
from public, anon, authenticated;
revoke all on function public.course_schedule_coverage_display_label(jsonb)
from public, anon, authenticated;
revoke all on function public.build_legacy_course_schedule_coverage(uuid)
from public, anon, authenticated;
revoke all on function public.snapshot_course_schedule_version_coverage()
from public, anon, authenticated;
revoke all on function public.reject_course_schedule_coverage_mutation()
from public, anon, authenticated;

comment on table public.course_schedule_version_coverages is
  'Immutable Phase 5.G.2.4.2 Education-level, Goal, Subject, and Track coverage for each Course Schedule Version.';
comment on column public.course_schedule_version_coverages.coverage_snapshot is
  'Exactly one primary Track plus supporting branches. Goals such as AP, SAT, ACT, and IB are nested beneath their selected Education level and are never inferred.';
comment on column public.student_courses.subject_node_id is
  'Compatibility projection of the active Schedule Version primary Subject; Version coverage is authoritative from Phase 5.G.2.4.2.';
comment on column public.student_courses.focus_node_id is
  'Compatibility projection of the active Schedule Version primary Track; Version coverage is authoritative from Phase 5.G.2.4.2.';
