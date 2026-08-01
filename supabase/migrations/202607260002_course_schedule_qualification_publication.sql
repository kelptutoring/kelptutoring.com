-- Phase 5.G.2.4.4: governed multi-branch publication.
--
-- A Builder publication resolves every selected Education-level / Subject /
-- Track branch to canonical curriculum nodes, locks and snapshots the assigned
-- Tutor's active qualifications, and then publishes the structural Version and
-- its coverage in one transaction. Direct structural callers may continue to
-- edit branches already present in the active coverage, but cannot introduce a
-- new branch by bypassing this command.

create table if not exists public.course_schedule_coverage_publish_intents (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.course_schedules(id) on delete restrict,
  course_id uuid not null references public.student_courses(id) on delete restrict,
  expected_version_id uuid not null
    references public.course_schedule_versions(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  coverage_snapshot jsonb not null,
  primary_track_key text not null,
  display_label text not null,
  qualification_snapshot jsonb not null,
  transition_kind text not null,
  plan_epoch_id uuid not null,
  previous_plan_epoch_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint course_schedule_coverage_publish_intents_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_schedule_coverage_publish_intents_coverage_check check (
    public.course_schedule_coverage_snapshot_is_valid(
      coverage_snapshot,
      primary_track_key
    )
  ),
  constraint course_schedule_coverage_publish_intents_label_check check (
    display_label = public.course_schedule_coverage_display_label(coverage_snapshot)
  ),
  constraint course_schedule_coverage_publish_intents_qualification_check check (
    jsonb_typeof(qualification_snapshot) = 'object'
  ),
  constraint course_schedule_coverage_publish_intents_transition_check check (
    transition_kind in (
      'continued',
      'primary_track_changed',
      'partial_replacement',
      'complete_replacement'
    )
  ),
  constraint course_schedule_coverage_publish_intents_actor_key unique (
    schedule_id, actor_user_id
  )
);

create table if not exists public.course_schedule_builder_publish_commands (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.course_schedules(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  expected_version_id uuid not null
    references public.course_schedule_versions(id) on delete restrict,
  published_version_id uuid not null
    references public.course_schedule_versions(id) on delete restrict,
  request_payload jsonb not null,
  response_payload jsonb not null,
  coverage_snapshot jsonb not null,
  qualification_snapshot jsonb not null,
  transition_kind text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint course_schedule_builder_publish_commands_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{7,127}$'
  ),
  constraint course_schedule_builder_publish_commands_request_check check (
    jsonb_typeof(request_payload) = 'object'
  ),
  constraint course_schedule_builder_publish_commands_response_check check (
    jsonb_typeof(response_payload) = 'object'
  ),
  constraint course_schedule_builder_publish_commands_coverage_check check (
    jsonb_typeof(coverage_snapshot) = 'object'
  ),
  constraint course_schedule_builder_publish_commands_qualification_check check (
    jsonb_typeof(qualification_snapshot) = 'object'
  ),
  constraint course_schedule_builder_publish_commands_transition_check check (
    transition_kind in (
      'continued',
      'primary_track_changed',
      'partial_replacement',
      'complete_replacement'
    )
  ),
  constraint course_schedule_builder_publish_commands_actor_key unique (
    schedule_id, actor_user_id, idempotency_key
  )
);

create index if not exists course_schedule_builder_publish_commands_version_idx
on public.course_schedule_builder_publish_commands (published_version_id, created_at);

create or replace function public.resolve_course_schedule_builder_coverage(
  p_course_id uuid,
  p_builder_schedule jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  raw_coverage jsonb;
  raw_branch jsonb;
  raw_goal jsonb;
  raw_goals jsonb;
  raw_primary_key text;
  raw_track_key text;
  branch_key text;
  branch_role text;
  level_slug text;
  subject_slug text;
  track_slug text;
  level_record public.curriculum_nodes%rowtype;
  subject_record public.curriculum_nodes%rowtype;
  track_record public.curriculum_nodes%rowtype;
  resolved_track_ids uuid[];
  goals jsonb;
  goal_keys text[];
  goal_key text;
  goal_name text;
  goal_slug text;
  branches jsonb := '[]'::jsonb;
  resolved_track_keys text[] := array[]::text[];
  branch_keys text[] := array[]::text[];
  primary_count integer := 0;
  primary_track_key text;
  snapshot jsonb;
  legacy_snapshot jsonb;
begin
  if p_builder_schedule is null
    or jsonb_typeof(p_builder_schedule) <> 'object'
    or btrim(coalesce(p_builder_schedule ->> 'id', '')) = ''
    or btrim(coalesce(p_builder_schedule ->> 'name', '')) = ''
    or btrim(coalesce(p_builder_schedule ->> 'timeZone', '')) = '' then
    raise exception 'The generated Schedule source identity is incomplete.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then raise exception 'The Course could not be found.'; end if;

  raw_coverage := p_builder_schedule #> '{context,coverage}';
  if raw_coverage is null then
    legacy_snapshot := public.build_legacy_course_schedule_coverage(p_course_id);
    if btrim(coalesce(
        p_builder_schedule #>> '{context,subjectTaxonomySlug}', ''
      )) <> legacy_snapshot #>> '{branches,0,subject,slug}'
      or not (
        coalesce(
          p_builder_schedule #> '{context,trackTaxonomySlugs}',
          '[]'::jsonb
        ) ? (legacy_snapshot #>> '{branches,0,track,slug}')
      ) then
      raise exception 'A legacy Builder Schedule must retain its Course coverage.';
    end if;
    return legacy_snapshot;
  end if;

  if jsonb_typeof(raw_coverage) <> 'object'
    or jsonb_typeof(raw_coverage -> 'branches') <> 'array'
    or jsonb_array_length(raw_coverage -> 'branches') < 1
    or jsonb_array_length(raw_coverage -> 'branches') > 64 then
    raise exception 'The generated Schedule coverage is invalid.';
  end if;
  raw_primary_key := btrim(coalesce(raw_coverage ->> 'primaryTrackKey', ''));
  if raw_primary_key = '' then
    raise exception 'The generated Schedule requires one primary Track.';
  end if;

  for raw_branch in
    select branch_entry.value
    from jsonb_array_elements(raw_coverage -> 'branches')
      as branch_entry(value)
  loop
    if jsonb_typeof(raw_branch) <> 'object' then
      raise exception 'A generated Schedule coverage branch is invalid.';
    end if;
    branch_role := lower(btrim(coalesce(raw_branch ->> 'role', '')));
    if branch_role not in ('primary', 'supporting') then
      raise exception 'Every selected Track must be primary or supporting.';
    end if;
    raw_track_key := btrim(coalesce(
      raw_branch #>> '{track,key}',
      raw_branch #>> '{track,id}',
      ''
    ));
    branch_key := btrim(coalesce(
      raw_branch ->> 'branchKey',
      raw_track_key
    ));
    level_slug := lower(btrim(coalesce(
      raw_branch #>> '{educationLevel,slug}',
      raw_branch #>> '{educationLevel,taxonomySlug}',
      ''
    )));
    subject_slug := lower(btrim(coalesce(
      raw_branch #>> '{subject,slug}',
      raw_branch #>> '{subject,taxonomySlug}',
      ''
    )));
    track_slug := lower(btrim(coalesce(
      raw_branch #>> '{track,slug}',
      raw_branch #>> '{track,taxonomySlug}',
      ''
    )));
    if raw_track_key = '' or branch_key = ''
      or level_slug = '' or subject_slug = '' or track_slug = ''
      or branch_key = any(branch_keys) then
      raise exception 'A selected curriculum branch has incomplete or repeated identity.';
    end if;

    select * into level_record
    from public.curriculum_nodes node
    where node.parent_id is null
      and node.node_type = 'degree'
      and node.status = 'active'
      and node.slug = level_slug;
    if not found then
      raise exception 'A selected Education level is not available in the active curriculum.';
    end if;

    select * into subject_record
    from public.curriculum_nodes node
    where node.parent_id = level_record.id
      and node.node_type = 'subject'
      and node.status = 'active'
      and node.slug = subject_slug;
    if not found then
      raise exception 'A selected Subject is not available beneath its Education level.';
    end if;

    select array_agg(node.id order by node.id)
    into resolved_track_ids
    from public.curriculum_nodes node
    where node.status = 'active'
      and node.node_type in ('track', 'topic')
      and node.slug = track_slug
      and public.curriculum_node_is_within(node.id, subject_record.id);
    if coalesce(cardinality(resolved_track_ids), 0) <> 1 then
      raise exception 'A selected Track does not resolve to exactly one active curriculum branch.';
    end if;
    select * into track_record
    from public.curriculum_nodes
    where id = resolved_track_ids[1];
    if track_record.id::text = any(resolved_track_keys) then
      raise exception 'A canonical Track may appear only once in one Schedule coverage.';
    end if;

    raw_goals := coalesce(
      raw_branch -> 'academicPathways',
      raw_branch -> 'goals',
      '[]'::jsonb
    );
    if jsonb_typeof(raw_goals) <> 'array'
      or jsonb_array_length(raw_goals) > 32 then
      raise exception 'A selected Track pathway list is invalid.';
    end if;
    goals := '[]'::jsonb;
    goal_keys := array[]::text[];
    for raw_goal in
      select goal_entry.value
      from jsonb_array_elements(raw_goals) as goal_entry(value)
    loop
      goal_key := btrim(coalesce(
        raw_goal ->> 'key',
        raw_goal ->> 'id',
        raw_goal ->> 'slug',
        ''
      ));
      goal_name := btrim(coalesce(
        raw_goal ->> 'name',
        raw_goal ->> 'title',
        ''
      ));
      goal_slug := lower(btrim(coalesce(
        raw_goal ->> 'slug',
        raw_goal ->> 'taxonomySlug',
        ''
      )));
      if goal_key = '' or goal_name = ''
        or goal_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        or goal_key = any(goal_keys) then
        raise exception 'A selected academic pathway has invalid or repeated identity.';
      end if;
      goals := goals || jsonb_build_array(jsonb_build_object(
        'key', goal_key,
        'name', goal_name,
        'slug', goal_slug
      ));
      goal_keys := array_append(goal_keys, goal_key);
    end loop;

    branches := branches || jsonb_build_array(jsonb_build_object(
      'branchKey', branch_key,
      'builderTrackKey', raw_track_key,
      'role', branch_role,
      'educationLevel', jsonb_build_object(
        'nodeId', level_record.id,
        'key', level_record.id::text,
        'name', level_record.name,
        'slug', level_record.slug
      ),
      'goals', goals,
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
    ));
    branch_keys := array_append(branch_keys, branch_key);
    resolved_track_keys := array_append(resolved_track_keys, track_record.id::text);
    if branch_role = 'primary' then
      primary_count := primary_count + 1;
      if raw_track_key <> raw_primary_key then
        raise exception 'The primary Track key does not match the primary coverage branch.';
      end if;
      primary_track_key := track_record.id::text;
    end if;
  end loop;

  if primary_count <> 1 then
    raise exception 'A generated Schedule coverage requires exactly one primary Track.';
  end if;
  snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'primaryTrackKey', primary_track_key,
    'branches', branches
  );
  if not public.course_schedule_coverage_snapshot_is_valid(
    snapshot,
    primary_track_key
  ) then
    raise exception 'The resolved Course Schedule coverage is invalid.';
  end if;
  return snapshot;
end;
$$;

create or replace function public.course_schedule_tutor_qualification_snapshot(
  p_course_id uuid,
  p_coverage_snapshot jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  branch jsonb;
  track_id uuid;
  qualification_record record;
  branches jsonb := '[]'::jsonb;
begin
  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then raise exception 'The Course could not be found.'; end if;

  for branch in
    select branch_entry.value
    from jsonb_array_elements(p_coverage_snapshot -> 'branches')
      as branch_entry(value)
  loop
    track_id := (branch #>> '{track,nodeId}')::uuid;
    select
      qualification.id,
      qualification.curriculum_node_id,
      qualification.granted_at,
      scope.name as scope_name,
      scope.slug as scope_slug
    into qualification_record
    from public.teaching_qualifications qualification
    join public.curriculum_nodes scope
      on scope.id = qualification.curriculum_node_id
    where qualification.user_id = course_record.tutor_id
      and qualification.status = 'active'
      and public.curriculum_node_is_within(
        track_id,
        qualification.curriculum_node_id
      )
    order by
      case when qualification.curriculum_node_id = track_id then 0 else 1 end,
      qualification.granted_at,
      qualification.id
    limit 1;
    if qualification_record.id is null then
      raise exception
        'The assigned Tutor is not actively qualified for every selected curriculum branch.';
    end if;
    branches := branches || jsonb_build_array(jsonb_build_object(
      'branchKey', branch ->> 'branchKey',
      'trackNodeId', track_id,
      'trackName', branch #>> '{track,name}',
      'qualificationId', qualification_record.id,
      'qualificationScopeNodeId', qualification_record.curriculum_node_id,
      'qualificationScopeName', qualification_record.scope_name,
      'qualificationScopeSlug', qualification_record.scope_slug,
      'grantedAt', qualification_record.granted_at
    ));
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'checkedAt', clock_timestamp(),
    'assignedTutorId', course_record.tutor_id,
    'branches', branches
  );
end;
$$;

create or replace function public.normalize_course_schedule_builder_items(
  p_expected_version_id uuid,
  p_items jsonb,
  p_coverage_snapshot jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  raw_item jsonb;
  normalized_item jsonb;
  prior_item public.course_schedule_items%rowtype;
  branch jsonb;
  kind_value text;
  stable_key text;
  source_track_key text;
  source_session_key text;
  source_content_version_key text;
  source_subject_slug text;
  source_track_slug text;
  curriculum_id uuid;
  result jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The generated Course Schedule item list is invalid.';
  end if;

  for raw_item in
    select item_entry.value
    from jsonb_array_elements(p_items) as item_entry(value)
  loop
    normalized_item := raw_item;
    stable_key := btrim(coalesce(raw_item ->> 'stableItemKey', ''));
    kind_value := coalesce(raw_item ->> 'kind', 'curriculum_topic');
    select * into prior_item
    from public.course_schedule_items item
    where item.version_id = p_expected_version_id
      and item.stable_item_key = stable_key;

    if kind_value <> 'curriculum_topic' then
      normalized_item := (normalized_item - 'curriculumNodeId')
        || jsonb_build_object('curriculumNodeId', null);
      result := result || jsonb_build_array(normalized_item);
      continue;
    end if;

    if prior_item.id is not null then
      if nullif(btrim(coalesce(
          raw_item ->> 'sourceTrackKey',
          raw_item ->> 'trackId',
          raw_item ->> 'trackKey',
          ''
        )), '') is not null
        and nullif(btrim(coalesce(
          raw_item ->> 'sourceTrackKey',
          raw_item ->> 'trackId',
          raw_item ->> 'trackKey',
          ''
        )), '') is distinct from prior_item.source_track_key then
        raise exception 'A retained Curriculum Session cannot change its Track source identity.';
      end if;
      if nullif(btrim(coalesce(
          raw_item ->> 'sourceSessionKey',
          raw_item ->> 'sourceSessionId',
          raw_item ->> 'sessionId',
          ''
        )), '') is not null
        and nullif(btrim(coalesce(
          raw_item ->> 'sourceSessionKey',
          raw_item ->> 'sourceSessionId',
          raw_item ->> 'sessionId',
          ''
        )), '') is distinct from prior_item.source_session_key then
        raise exception 'A retained Curriculum Session cannot change its canonical Session identity.';
      end if;
      if nullif(btrim(coalesce(
          raw_item ->> 'sourceContentVersionKey',
          raw_item ->> 'contentVersionKey',
          raw_item ->> 'contentVersion',
          ''
        )), '') is not null
        and nullif(btrim(coalesce(
          raw_item ->> 'sourceContentVersionKey',
          raw_item ->> 'contentVersionKey',
          raw_item ->> 'contentVersion',
          ''
        )), '') is distinct from prior_item.source_content_version_key then
        raise exception 'A Track source revision requires a new Schedule item identity.';
      end if;
      normalized_item := normalized_item
        || jsonb_build_object('curriculumNodeId', prior_item.curriculum_node_id);
      result := result || jsonb_build_array(normalized_item);
      continue;
    end if;

    source_track_key := nullif(btrim(coalesce(
      raw_item ->> 'sourceTrackKey',
      raw_item ->> 'trackId',
      raw_item ->> 'trackKey',
      ''
    )), '');
    source_session_key := nullif(btrim(coalesce(
      raw_item ->> 'sourceSessionKey',
      raw_item ->> 'sourceSessionId',
      raw_item ->> 'sessionId',
      ''
    )), '');
    source_content_version_key := nullif(btrim(coalesce(
      raw_item ->> 'sourceContentVersionKey',
      raw_item ->> 'contentVersionKey',
      raw_item ->> 'contentVersion',
      ''
    )), '');
    source_subject_slug := lower(btrim(coalesce(
      raw_item ->> 'sourceSubjectSlug',
      ''
    )));
    source_track_slug := lower(btrim(coalesce(
      raw_item ->> 'sourceTrackSlug',
      ''
    )));
    if source_track_key is null
      or source_session_key is null
      or source_content_version_key is null
      or source_subject_slug = ''
      or source_track_slug = '' then
      raise exception 'A new Curriculum Session requires complete governed Track source identity.';
    end if;

    select branch_entry.value into branch
    from jsonb_array_elements(p_coverage_snapshot -> 'branches')
      as branch_entry(value)
    where branch_entry.value #>> '{subject,slug}' = source_subject_slug
      and branch_entry.value #>> '{track,slug}' = source_track_slug
      and (
        coalesce(branch_entry.value ->> 'builderTrackKey', source_track_key)
          = source_track_key
      );
    if branch is null then
      raise exception 'A new Curriculum Session does not belong to the selected Version coverage.';
    end if;
    curriculum_id := (branch #>> '{track,nodeId}')::uuid;
    normalized_item := normalized_item
      || jsonb_build_object('curriculumNodeId', curriculum_id);
    result := result || jsonb_build_array(normalized_item);
  end loop;
  return result;
end;
$$;

create or replace function public.course_schedule_curriculum_item_is_publishable(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_stable_item_key text,
  p_curriculum_node_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  course_record public.student_courses%rowtype;
  prior_item public.course_schedule_items%rowtype;
  coverage_snapshot jsonb;
  branch jsonb;
  covered boolean := false;
begin
  if p_curriculum_node_id is null then return true; end if;
  select * into course_record
  from public.student_courses
  where id = p_course_id;
  if not found then return false; end if;

  select intent.coverage_snapshot into coverage_snapshot
  from public.course_schedule_coverage_publish_intents intent
  where intent.course_id = p_course_id
    and intent.expected_version_id = p_expected_version_id
    and intent.actor_user_id = auth.uid()
  order by intent.created_at desc
  limit 1;
  if coverage_snapshot is null then
    select coverage.coverage_snapshot into coverage_snapshot
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = p_expected_version_id;
  end if;
  if coverage_snapshot is null then return false; end if;

  for branch in
    select branch_entry.value
    from jsonb_array_elements(coverage_snapshot -> 'branches')
      as branch_entry(value)
  loop
    if public.curriculum_node_is_within(
      p_curriculum_node_id,
      (branch #>> '{track,nodeId}')::uuid
    ) then
      covered := true;
      exit;
    end if;
  end loop;

  if covered then
    return public.user_has_active_teaching_scope(
      course_record.tutor_id,
      p_curriculum_node_id
    );
  end if;

  select * into prior_item
  from public.course_schedule_items item
  where item.version_id = p_expected_version_id
    and item.stable_item_key = p_stable_item_key;
  return prior_item.id is not null
    and prior_item.curriculum_node_id is not distinct from p_curriculum_node_id;
end;
$$;

create or replace function public.snapshot_course_schedule_version_coverage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_coverage public.course_schedule_version_coverages%rowtype;
  course_record public.student_courses%rowtype;
  publication_intent public.course_schedule_coverage_publish_intents%rowtype;
  snapshot jsonb;
  inherited_epoch text;
begin
  if exists (
    select 1 from public.course_schedule_version_coverages coverage
    where coverage.version_id = new.id
  ) then
    return new;
  end if;

  select * into publication_intent
  from public.course_schedule_coverage_publish_intents intent
  where intent.schedule_id = new.schedule_id
    and intent.expected_version_id = new.previous_version_id
    and intent.actor_user_id = new.created_by
    and intent.idempotency_key = lower(btrim(coalesce(
      new.metadata ->> 'idempotencyKey',
      ''
    )));
  if found then
    insert into public.course_schedule_version_coverages (
      version_id, schema_version, primary_track_key, coverage_snapshot,
      display_label, provenance, metadata
    ) values (
      new.id,
      1,
      publication_intent.primary_track_key,
      publication_intent.coverage_snapshot,
      publication_intent.display_label,
      'selected',
      jsonb_strip_nulls(jsonb_build_object(
        'previousVersionId', new.previous_version_id,
        'transitionKind', publication_intent.transition_kind,
        'planEpochId', publication_intent.plan_epoch_id,
        'previousPlanEpochId', publication_intent.previous_plan_epoch_id,
        'historicalProgressLocation', case
          when publication_intent.transition_kind = 'complete_replacement'
            then 'previous_schedule'
          else null
        end,
        'activePlanOnly', true,
        'qualificationSnapshot', publication_intent.qualification_snapshot
      ))
    );
    return new;
  end if;

  if new.previous_version_id is not null then
    select * into previous_coverage
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = new.previous_version_id;
    if not found then
      raise exception 'The previous Schedule Version has no immutable curriculum coverage.';
    end if;
    inherited_epoch := coalesce(
      previous_coverage.metadata ->> 'planEpochId',
      new.schedule_id::text
    );
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
        'inheritedCoverageProvenance', previous_coverage.provenance,
        'transitionKind', 'continued',
        'planEpochId', inherited_epoch,
        'activePlanOnly', true
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
      'sourceFocusNodeId', course_record.focus_node_id,
      'transitionKind', 'continued',
      'planEpochId', new.schedule_id,
      'activePlanOnly', true
    )
  );
  return new;
end;
$$;

do $patch_multi_branch_structural_guard$
declare
  original_definition text;
  patched_definition text;
  original_guard constant text :=
    'not public.curriculum_node_is_within(curriculum_id, course_record.subject_node_id)';
  governed_guard constant text :=
    'not public.course_schedule_curriculum_item_is_publishable(course_record.id, active_version.id, stable_key, curriculum_id)';
  original_retention_guard constant text := $retention_guard$if exists (
    select 1
    from public.course_schedule_items old_item
    where old_item.version_id = active_version.id
      and not exists (
        select 1 from jsonb_array_elements(p_items) proposed
        where btrim(proposed ->> 'stableItemKey') = old_item.stable_item_key
      )
  ) then$retention_guard$;
  governed_retention_guard constant text := $retention_guard$if not exists (
    select 1
    from public.course_schedule_coverage_publish_intents replacement_intent
    where replacement_intent.course_id = p_course_id
      and replacement_intent.expected_version_id = p_expected_version_id
      and replacement_intent.actor_user_id = auth.uid()
      and replacement_intent.transition_kind = 'complete_replacement'
  ) and exists (
    select 1
    from public.course_schedule_items old_item
    where old_item.version_id = active_version.id
      and not exists (
        select 1 from jsonb_array_elements(p_items) proposed
        where btrim(proposed ->> 'stableItemKey') = old_item.stable_item_key
      )
  ) then$retention_guard$;
begin
  select pg_get_functiondef(
    'public.publish_course_schedule_version(uuid,uuid,jsonb,jsonb,text)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(original_guard in original_definition) = 0 then
    raise exception
      'The structural Schedule curriculum guard no longer matches its expected definition.';
  end if;
  patched_definition := replace(
    original_definition,
    original_guard,
    governed_guard
  );
  patched_definition := replace(
    patched_definition,
    original_retention_guard,
    governed_retention_guard
  );
  if patched_definition = original_definition
    or position(governed_guard in patched_definition) = 0
    or position(governed_retention_guard in patched_definition) = 0 then
    raise exception
      'The structural Schedule guards could not be governed by Version coverage.';
  end if;
  execute patched_definition;
end;
$patch_multi_branch_structural_guard$;

do $allow_audited_complete_replacement_of_studied_history$
declare
  original_definition text;
  patched_definition text;
  original_anchor constant text := $studied_anchor$if new.active_schedule_version_id is not distinct from old.active_schedule_version_id then
    return new;
  end if;

  for studied in$studied_anchor$;
  governed_anchor constant text := $studied_anchor$if new.active_schedule_version_id is not distinct from old.active_schedule_version_id then
    return new;
  end if;

  if exists (
    select 1
    from public.course_schedule_coverage_publish_intents replacement_intent
    where replacement_intent.course_id = old.id
      and replacement_intent.expected_version_id = old.active_schedule_version_id
      and replacement_intent.actor_user_id = auth.uid()
      and replacement_intent.transition_kind = 'complete_replacement'
  ) then
    return new;
  end if;

  for studied in$studied_anchor$;
begin
  select pg_get_functiondef(
    'public.protect_studied_course_schedule_items()'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position(original_anchor in original_definition) = 0 then
    raise exception
      'The Studied-item successor guard no longer matches its expected definition.';
  end if;
  patched_definition := replace(
    original_definition,
    original_anchor,
    governed_anchor
  );
  if patched_definition = original_definition
    or position(governed_anchor in patched_definition) = 0 then
    raise exception
      'The Studied-item successor guard could not be governed by complete replacement.';
  end if;
  execute patched_definition;
end;
$allow_audited_complete_replacement_of_studied_history$;

create or replace function public.publish_course_builder_schedule(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_builder_schedule jsonb,
  p_items jsonb,
  p_change_reasons jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_idempotency_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  course_record public.student_courses%rowtype;
  stable_schedule public.course_schedules%rowtype;
  prior_command public.course_schedule_builder_publish_commands%rowtype;
  old_coverage public.course_schedule_version_coverages%rowtype;
  normalized_coverage jsonb;
  normalized_items jsonb;
  normalized_change_reasons jsonb;
  qualification_snapshot jsonb;
  request_payload jsonb;
  response_payload jsonb;
  branch jsonb;
  primary_branch jsonb;
  transition_kind text;
  old_track_keys text[];
  new_track_keys text[];
  common_track_count integer;
  previous_plan_epoch_id uuid;
  plan_epoch_id uuid;
  published_version_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to publish a generated Course Schedule.';
  end if;
  if normalized_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The Schedule publishing idempotency key is invalid.';
  end if;
  if not public.current_user_can_edit_course_schedule(p_course_id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can publish this generated Course Schedule.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for update;
  if not found then raise exception 'The Course could not be found.'; end if;
  select * into stable_schedule
  from public.course_schedules
  where course_id = p_course_id
  for update;
  if not found then raise exception 'The required stable Course Schedule could not be found.'; end if;

  select * into prior_command
  from public.course_schedule_builder_publish_commands command
  where command.schedule_id = stable_schedule.id
    and command.actor_user_id = caller_id
    and command.idempotency_key = normalized_idempotency_key;
  if found then
    request_payload := jsonb_build_object(
      'courseId', p_course_id,
      'expectedVersionId', p_expected_version_id,
      'builderSchedule', p_builder_schedule,
      'items', p_items,
      'changeReasons', p_change_reasons
    );
    if prior_command.request_payload <> request_payload then
      raise exception 'This Schedule idempotency key is already bound to a different Builder publication.';
    end if;
    return prior_command.response_payload
      || jsonb_build_object('idempotentReplay', true);
  end if;
  if exists (
    select 1
    from public.course_schedule_publish_commands command
    where command.schedule_id = stable_schedule.id
      and command.actor_user_id = caller_id
      and command.idempotency_key = normalized_idempotency_key
  ) then
    raise exception 'This Schedule idempotency key was already used outside the governed Builder publisher.';
  end if;
  if course_record.active_schedule_version_id <> p_expected_version_id then
    raise exception 'The Schedule changed after this page loaded. Refresh it before publishing your edits.';
  end if;

  select * into old_coverage
  from public.course_schedule_version_coverages coverage
  where coverage.version_id = p_expected_version_id;
  if not found then
    raise exception 'The active Schedule Version has no immutable curriculum coverage.';
  end if;

  normalized_coverage := public.resolve_course_schedule_builder_coverage(
    p_course_id,
    p_builder_schedule
  );
  normalized_items := public.normalize_course_schedule_builder_items(
    p_expected_version_id,
    p_items,
    normalized_coverage
  );

  for branch in
    select branch_entry.value
    from jsonb_array_elements(normalized_coverage -> 'branches')
      as branch_entry(value)
  loop
    if not exists (
      select 1
      from jsonb_array_elements(normalized_items) item
      where coalesce(item ->> 'kind', 'curriculum_topic') = 'curriculum_topic'
        and coalesce(item ->> 'state', 'scheduled') in ('scheduled', 'requeued')
        and item ->> 'sourceSubjectSlug' = branch #>> '{subject,slug}'
        and item ->> 'sourceTrackSlug' = branch #>> '{track,slug}'
    ) then
      raise exception 'Every selected curriculum branch requires at least one active governed Session.';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(normalized_items) item
    where coalesce(item ->> 'kind', 'curriculum_topic') = 'curriculum_topic'
      and coalesce(item ->> 'state', 'scheduled') in ('scheduled', 'requeued')
      and not exists (
        select 1
        from jsonb_array_elements(normalized_coverage -> 'branches')
          branch_entry(value)
        where branch_entry.value #>> '{track,nodeId}'
          = nullif(item ->> 'curriculumNodeId', '')
      )
      and not exists (
        select 1
        from public.course_schedule_items prior
        where prior.version_id = p_expected_version_id
          and prior.stable_item_key = item ->> 'stableItemKey'
          and prior.curriculum_node_id::text
            is not distinct from nullif(item ->> 'curriculumNodeId', '')
      )
  ) then
    raise exception 'An active Curriculum Session is outside the selected Version coverage.';
  end if;

  qualification_snapshot :=
    public.course_schedule_tutor_qualification_snapshot(
      p_course_id,
      normalized_coverage
    );
  perform 1
  from public.teaching_qualifications qualification
  where qualification.id in (
    select (entry.value ->> 'qualificationId')::uuid
    from jsonb_array_elements(qualification_snapshot -> 'branches')
      as entry(value)
  )
  for share;

  select array_agg(value order by value)
  into old_track_keys
  from (
    select branch_entry.value #>> '{track,nodeId}' as value
    from jsonb_array_elements(old_coverage.coverage_snapshot -> 'branches')
      as branch_entry(value)
  ) tracks;
  select array_agg(value order by value)
  into new_track_keys
  from (
    select branch_entry.value #>> '{track,nodeId}' as value
    from jsonb_array_elements(normalized_coverage -> 'branches')
      as branch_entry(value)
  ) tracks;
  select count(*) into common_track_count
  from unnest(coalesce(old_track_keys, array[]::text[])) as old_track(value)
  where old_track.value = any(coalesce(new_track_keys, array[]::text[]));

  if common_track_count = 0 then
    transition_kind := 'complete_replacement';
  elsif old_track_keys is distinct from new_track_keys then
    transition_kind := 'partial_replacement';
  elsif old_coverage.primary_track_key
      <> normalized_coverage ->> 'primaryTrackKey' then
    transition_kind := 'primary_track_changed';
  else
    transition_kind := 'continued';
  end if;

  if transition_kind = 'complete_replacement' then
    with replacement_items as (
      select
        proposed.item_payload,
        row_number() over (
          order by
            (proposed.item_payload ->> 'position')::integer,
            proposed.ordinality
        ) - 1 as replacement_position
      from jsonb_array_elements(normalized_items)
        with ordinality proposed(item_payload, ordinality)
      where not exists (
        select 1
        from public.course_schedule_items former_item
        where former_item.version_id = p_expected_version_id
          and former_item.stable_item_key
            = proposed.item_payload ->> 'stableItemKey'
      )
    )
    select coalesce(jsonb_agg(
      (replacement.item_payload - 'position')
        || jsonb_build_object(
          'position',
          replacement.replacement_position
        )
      order by replacement.replacement_position
    ), '[]'::jsonb)
    into normalized_items
    from replacement_items replacement;

    select coalesce(jsonb_agg(reason.value order by reason.ordinality), '[]'::jsonb)
    into normalized_change_reasons
    from jsonb_array_elements(p_change_reasons)
      with ordinality reason(value, ordinality)
    where exists (
      select 1
      from jsonb_array_elements(normalized_items) replacement_item
      where replacement_item ->> 'stableItemKey'
        = reason.value ->> 'stableItemKey'
    );

    for branch in
      select branch_entry.value
      from jsonb_array_elements(normalized_coverage -> 'branches')
        as branch_entry(value)
    loop
      if not exists (
        select 1
        from jsonb_array_elements(normalized_items) replacement_item
        where coalesce(
            replacement_item ->> 'kind',
            'curriculum_topic'
          ) = 'curriculum_topic'
          and coalesce(
            replacement_item ->> 'state',
            'scheduled'
          ) in ('scheduled', 'requeued')
          and replacement_item ->> 'sourceSubjectSlug'
            = branch #>> '{subject,slug}'
          and replacement_item ->> 'sourceTrackSlug'
            = branch #>> '{track,slug}'
      ) then
        raise exception
          'A complete replacement requires a new governed Session for every selected branch.';
      end if;
    end loop;
  else
    normalized_change_reasons := p_change_reasons;
  end if;

  begin
    previous_plan_epoch_id := coalesce(
      nullif(old_coverage.metadata ->> 'planEpochId', '')::uuid,
      stable_schedule.id
    );
  exception when invalid_text_representation then
    previous_plan_epoch_id := stable_schedule.id;
  end;
  plan_epoch_id := case
    when transition_kind = 'complete_replacement' then gen_random_uuid()
    else previous_plan_epoch_id
  end;

  request_payload := jsonb_build_object(
    'courseId', p_course_id,
    'expectedVersionId', p_expected_version_id,
    'builderSchedule', p_builder_schedule,
    'items', p_items,
    'changeReasons', p_change_reasons
  );
  insert into public.course_schedule_coverage_publish_intents (
    schedule_id, course_id, expected_version_id, actor_user_id,
    idempotency_key, coverage_snapshot, primary_track_key, display_label,
    qualification_snapshot, transition_kind, plan_epoch_id,
    previous_plan_epoch_id
  ) values (
    stable_schedule.id,
    p_course_id,
    p_expected_version_id,
    caller_id,
    normalized_idempotency_key,
    normalized_coverage,
    normalized_coverage ->> 'primaryTrackKey',
    public.course_schedule_coverage_display_label(normalized_coverage),
    qualification_snapshot,
    transition_kind,
    plan_epoch_id,
    case
      when transition_kind = 'complete_replacement'
        then previous_plan_epoch_id
      else null
    end
  );

  response_payload := public.publish_course_schedule_version(
    p_course_id,
    p_expected_version_id,
    normalized_items,
    normalized_change_reasons,
    normalized_idempotency_key
  );
  published_version_id := (response_payload ->> 'publishedVersionId')::uuid;
  if not exists (
    select 1
    from public.course_schedule_version_coverages coverage
    where coverage.version_id = published_version_id
      and coverage.provenance = 'selected'
      and coverage.coverage_snapshot = normalized_coverage
  ) then
    raise exception 'The selected curriculum coverage was not attached to the published Version.';
  end if;

  select branch_entry.value into primary_branch
  from jsonb_array_elements(normalized_coverage -> 'branches')
    as branch_entry(value)
  where branch_entry.value ->> 'role' = 'primary';
  update public.student_courses
  set subject_node_id = (primary_branch #>> '{subject,nodeId}')::uuid,
      focus_node_id = (primary_branch #>> '{track,nodeId}')::uuid
  where id = p_course_id;

  response_payload := response_payload || jsonb_build_object(
    'builderScheduleId', p_builder_schedule ->> 'id',
    'builderSchemaVersion', greatest(
      coalesce((p_builder_schedule ->> 'schemaVersion')::integer, 1),
      1
    ),
    'coverage', jsonb_build_object(
      'primaryTrackKey', normalized_coverage ->> 'primaryTrackKey',
      'displayLabel', public.course_schedule_coverage_display_label(
        normalized_coverage
      ),
      'branchCount', jsonb_array_length(normalized_coverage -> 'branches')
    ),
    'transitionKind', transition_kind,
    'planEpochId', plan_epoch_id,
    'historicalProgressLocation', case
      when transition_kind = 'complete_replacement'
        then 'previous_schedule'
      else null
    end,
    'idempotentReplay', false
  );

  insert into public.course_schedule_builder_publish_commands (
    schedule_id, actor_user_id, idempotency_key, expected_version_id,
    published_version_id, request_payload, response_payload,
    coverage_snapshot, qualification_snapshot, transition_kind
  ) values (
    stable_schedule.id,
    caller_id,
    normalized_idempotency_key,
    p_expected_version_id,
    published_version_id,
    request_payload,
    response_payload,
    normalized_coverage,
    qualification_snapshot,
    transition_kind
  );
  delete from public.course_schedule_coverage_publish_intents
  where schedule_id = stable_schedule.id
    and actor_user_id = caller_id;
  return response_payload;
exception when invalid_text_representation then
  raise exception 'The generated Course Schedule contains an invalid curriculum identity.';
end;
$$;

-- The preload boundary now advertises the governed publisher. The rest of the
-- payload remains unchanged.
do $enable_multi_branch_builder_context$
declare
  original_definition text;
  patched_definition text;
begin
  select pg_get_functiondef(
    'public.get_my_course_schedule_builder_context(uuid)'::regprocedure
  )
  into original_definition;
  if original_definition is null
    or position('''canPublishMultipleTracks'', false' in original_definition) = 0
    or position('''courseScopeLocked'', true' in original_definition) = 0 then
    raise exception 'The Classroom Builder permission boundary no longer matches Phase 5.G.2.4.3.2.';
  end if;
  patched_definition := replace(
    replace(
      original_definition,
      '''canPublishMultipleTracks'', false',
      '''canPublishMultipleTracks'', true'
    ),
    '''courseScopeLocked'', true',
    '''courseScopeLocked'', false'
  );
  execute patched_definition;
end;
$enable_multi_branch_builder_context$;

alter table public.course_schedule_coverage_publish_intents enable row level security;
alter table public.course_schedule_builder_publish_commands enable row level security;

drop policy if exists "Authorized staff read Builder publication commands"
on public.course_schedule_builder_publish_commands;
create policy "Authorized staff read Builder publication commands"
on public.course_schedule_builder_publish_commands
for select to authenticated
using (exists (
  select 1
  from public.course_schedules schedule
  where schedule.id = course_schedule_builder_publish_commands.schedule_id
    and public.current_user_can_read_course_schedule_history(schedule.course_id)
));

revoke all on public.course_schedule_coverage_publish_intents
from public, anon, authenticated, service_role;
revoke all on public.course_schedule_builder_publish_commands
from public, anon, authenticated;
grant select on public.course_schedule_builder_publish_commands
to authenticated, service_role;

revoke all on function public.resolve_course_schedule_builder_coverage(uuid, jsonb)
from public, anon, authenticated;
revoke all on function public.course_schedule_tutor_qualification_snapshot(uuid, jsonb)
from public, anon, authenticated;
revoke all on function public.normalize_course_schedule_builder_items(uuid, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.course_schedule_curriculum_item_is_publishable(uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) to authenticated;

comment on table public.course_schedule_builder_publish_commands is
  'Immutable governed Builder command receipts containing complete request, selected coverage, assigned-Tutor qualification evidence, transition classification, and response.';
comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Atomically validates every selected curriculum branch against the assigned Tutor, publishes one immutable successor Version plus selected coverage, preserves stale-screen and reason guards, and records full-replacement history outside the new active plan.';
comment on function public.course_schedule_curriculum_item_is_publishable(
  uuid, uuid, text, uuid
) is
  'Prevents the direct structural publisher from introducing curriculum outside active or atomically selected Version coverage while allowing immutable retained history.';
