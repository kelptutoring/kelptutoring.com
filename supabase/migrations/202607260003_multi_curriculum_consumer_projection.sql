-- Phase 5.G.2.4.5.1: canonical multi-curriculum consumer projection.
--
-- The active Schedule Version coverage is authoritative. Compatibility Course
-- Subject/focus columns remain available to older consumers, but they no longer
-- describe every Schedule item. Classroom, Calendar, PDF, and progress
-- consumers receive one compact Course coverage plus each item's own canonical
-- Education-level / pathway / Subject / Track / Module identity.

create or replace function public.course_schedule_consumer_branch_label(
  p_branch jsonb
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  pathway_names text[];
  label_parts text[] := array[]::text[];
  separator text := ' ' || chr(183) || ' ';
begin
  if p_branch is null or jsonb_typeof(p_branch) <> 'object' then
    return '';
  end if;

  if nullif(btrim(coalesce(p_branch #>> '{educationLevel,name}', '')), '')
    is not null then
    label_parts := array_append(
      label_parts,
      btrim(p_branch #>> '{educationLevel,name}')
    );
  end if;

  select array_agg(pathway.name order by pathway.ordinality)
  into pathway_names
  from (
    select
      btrim(entry.value ->> 'name') as name,
      entry.ordinality
    from jsonb_array_elements(coalesce(
      p_branch -> 'academicPathways',
      p_branch -> 'goals',
      '[]'::jsonb
    )) with ordinality entry(value, ordinality)
    where nullif(btrim(coalesce(entry.value ->> 'name', '')), '') is not null
  ) pathway;
  if coalesce(cardinality(pathway_names), 0) > 0 then
    label_parts := array_append(
      label_parts,
      array_to_string(pathway_names, ' + ')
    );
  end if;

  if nullif(btrim(coalesce(p_branch #>> '{subject,name}', '')), '')
    is not null then
    label_parts := array_append(
      label_parts,
      btrim(p_branch #>> '{subject,name}')
    );
  end if;
  if nullif(btrim(coalesce(p_branch #>> '{track,name}', '')), '')
    is not null then
    label_parts := array_append(
      label_parts,
      btrim(p_branch #>> '{track,name}')
    );
  end if;

  return array_to_string(label_parts, separator);
end;
$$;

create or replace function public.course_schedule_consumer_branch_context(
  p_coverage_snapshot jsonb,
  p_source_snapshot jsonb,
  p_curriculum_node_id uuid default null
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  source_level_slug text := lower(btrim(coalesce(
    p_source_snapshot ->> 'sourceEducationLevelSlug',
    p_source_snapshot ->> 'educationLevelTaxonomySlug',
    ''
  )));
  source_subject_slug text := lower(btrim(coalesce(
    p_source_snapshot ->> 'sourceSubjectSlug',
    p_source_snapshot ->> 'subjectTaxonomySlug',
    ''
  )));
  source_track_slug text := lower(btrim(coalesce(
    p_source_snapshot ->> 'sourceTrackSlug',
    p_source_snapshot ->> 'trackTaxonomySlug',
    ''
  )));
  source_track_key text := btrim(coalesce(
    p_source_snapshot ->> 'sourceTrackKey',
    p_source_snapshot ->> 'trackId',
    p_source_snapshot ->> 'trackKey',
    ''
  ));
  resolved_branch jsonb;
begin
  if p_coverage_snapshot is null
    or jsonb_typeof(p_coverage_snapshot -> 'branches') <> 'array' then
    return null;
  end if;

  select branch_entry.value
  into resolved_branch
  from jsonb_array_elements(p_coverage_snapshot -> 'branches')
    with ordinality branch_entry(value, ordinality)
  where
    (
      p_curriculum_node_id is not null
      and branch_entry.value #>> '{track,nodeId}'
        = p_curriculum_node_id::text
    )
    or (
      source_track_slug <> ''
      and branch_entry.value #>> '{track,slug}' = source_track_slug
      and (
        source_subject_slug = ''
        or branch_entry.value #>> '{subject,slug}' = source_subject_slug
      )
      and (
        source_level_slug = ''
        or branch_entry.value #>> '{educationLevel,slug}' = source_level_slug
      )
    )
    or (
      source_track_key <> ''
      and source_track_key in (
        coalesce(branch_entry.value ->> 'branchKey', ''),
        coalesce(branch_entry.value ->> 'builderTrackKey', ''),
        coalesce(branch_entry.value #>> '{track,key}', '')
      )
    )
  order by
    case
      when p_curriculum_node_id is not null
        and branch_entry.value #>> '{track,nodeId}'
          = p_curriculum_node_id::text then 0
      when source_track_slug <> ''
        and branch_entry.value #>> '{track,slug}' = source_track_slug then 1
      else 2
    end,
    branch_entry.ordinality
  limit 1;

  if resolved_branch is null then
    return null;
  end if;

  return jsonb_build_object(
    'branchKey', resolved_branch ->> 'branchKey',
    'role', resolved_branch ->> 'role',
    'educationLevel', resolved_branch -> 'educationLevel',
    'academicPathways', coalesce(
      resolved_branch -> 'academicPathways',
      resolved_branch -> 'goals',
      '[]'::jsonb
    ),
    'subject', resolved_branch -> 'subject',
    'track', resolved_branch -> 'track',
    'displayLabel',
      public.course_schedule_consumer_branch_label(resolved_branch)
  );
end;
$$;

create or replace function public.course_schedule_module_presentation_key(
  p_branch_key text,
  p_module_key text
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when nullif(btrim(coalesce(p_branch_key, '')), '') is null then
      'course:m:' || md5(coalesce(nullif(btrim(p_module_key), ''), 'course-plan'))
    else
      'branch:' || md5(btrim(p_branch_key))
        || ':m:' || md5(coalesce(nullif(btrim(p_module_key), ''), 'course-plan'))
  end
$$;

create or replace function public.course_schedule_consumer_coverage(
  p_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  coverage_record public.course_schedule_version_coverages%rowtype;
  projected_branches jsonb;
begin
  select *
  into coverage_record
  from public.course_schedule_version_coverages coverage
  where coverage.version_id = p_version_id;
  if not found then
    raise exception 'The active Schedule Version has no immutable curriculum coverage.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'branchKey', branch.value ->> 'branchKey',
      'role', branch.value ->> 'role',
      'educationLevel', branch.value -> 'educationLevel',
      'academicPathways', coalesce(
        branch.value -> 'academicPathways',
        branch.value -> 'goals',
        '[]'::jsonb
      ),
      'subject', branch.value -> 'subject',
      'track', branch.value -> 'track',
      'displayLabel',
        public.course_schedule_consumer_branch_label(branch.value)
    )
    order by branch.ordinality
  ), '[]'::jsonb)
  into projected_branches
  from jsonb_array_elements(coverage_record.coverage_snapshot -> 'branches')
    with ordinality branch(value, ordinality);

  return jsonb_build_object(
    'schemaVersion', coverage_record.schema_version,
    'versionId', coverage_record.version_id,
    'primaryTrackKey', coverage_record.primary_track_key,
    'displayLabel', coverage_record.display_label,
    'branchCount', jsonb_array_length(
      coverage_record.coverage_snapshot -> 'branches'
    ),
    'branches', projected_branches
  );
end;
$$;

create or replace function public.project_course_schedule_consumer_items(
  p_version_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  coverage_snapshot jsonb;
  source_item jsonb;
  projected_item jsonb;
  projected_items jsonb := '[]'::jsonb;
  item_record public.course_schedule_items%rowtype;
  branch_context jsonb;
  module_key text;
  module_title text;
  branch_key text;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'The effective Schedule item projection is invalid.';
  end if;

  select coverage.coverage_snapshot
  into coverage_snapshot
  from public.course_schedule_version_coverages coverage
  where coverage.version_id = p_version_id;
  if coverage_snapshot is null then
    raise exception 'The active Schedule Version has no immutable curriculum coverage.';
  end if;

  for source_item in
    select item_entry.value
    from jsonb_array_elements(p_items)
      with ordinality item_entry(value, ordinality)
    order by item_entry.ordinality
  loop
    select item.*
    into item_record
    from public.course_schedule_items item
    where item.version_id = p_version_id
      and item.id = nullif(source_item ->> 'scheduleItemId', '')::uuid;
    if not found then
      raise exception 'An effective Schedule item is outside the active Version.';
    end if;

    branch_context := public.course_schedule_consumer_branch_context(
      coverage_snapshot,
      item_record.source_snapshot,
      item_record.curriculum_node_id
    );
    if branch_context is null
      and item_record.item_kind = 'curriculum_topic'
      and jsonb_array_length(coverage_snapshot -> 'branches') = 1 then
      branch_context := public.course_schedule_consumer_branch_context(
        coverage_snapshot,
        jsonb_build_object(
          'sourceTrackKey',
          coverage_snapshot #>> '{branches,0,branchKey}'
        ),
        null
      );
    end if;
    module_key := coalesce(
      nullif(btrim(item_record.source_module_key), ''),
      nullif(btrim(item_record.source_snapshot ->> 'sourceModuleKey'), ''),
      nullif(btrim(item_record.source_snapshot ->> 'moduleKey'), ''),
      nullif(btrim(source_item #>> '{source,moduleKey}'), ''),
      'course-plan'
    );
    module_title := coalesce(
      nullif(btrim(item_record.source_snapshot ->> 'sourceModuleTitle'), ''),
      nullif(btrim(item_record.source_snapshot ->> 'moduleTitle'), ''),
      nullif(btrim(source_item #>> '{source,moduleTitle}'), ''),
      'Course plan'
    );
    branch_key := coalesce(branch_context ->> 'branchKey', '');

    projected_item := source_item || jsonb_build_object(
      'academicScope', case
        when branch_context is null then 'course'
        else 'branch'
      end,
      'presentation', jsonb_build_object(
        'branchKey', nullif(branch_key, ''),
        'branchLabel', branch_context ->> 'displayLabel',
        'moduleKey', module_key,
        'moduleTitle', module_title,
        'modulePresentationKey',
          public.course_schedule_module_presentation_key(
            branch_key,
            module_key
          )
      )
    );
    if branch_context is not null then
      projected_item := projected_item
        || jsonb_build_object('academicBranch', branch_context);
    end if;
    projected_item := jsonb_set(
      projected_item,
      '{source}',
      coalesce(projected_item -> 'source', '{}'::jsonb)
        || jsonb_build_object(
          'moduleKey', module_key,
          'moduleTitle', module_title
        ),
      true
    );
    projected_items := projected_items || jsonb_build_array(projected_item);
  end loop;

  return projected_items;
exception when invalid_text_representation then
  raise exception 'An effective Schedule item has invalid identity.';
end;
$$;

create or replace function public.project_course_schedule_consumer_progress(
  p_items jsonb,
  p_existing_progress jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  track_breakdown jsonb;
begin
  with curriculum_items as (
    select entry.item_payload
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
      entry(item_payload)
    where entry.item_payload ->> 'kind' = 'curriculum_topic'
      and entry.item_payload ->> 'academicScope' = 'branch'
  ),
  grouped as (
    select
      item_payload #>> '{academicBranch,branchKey}' as branch_key,
      min(item_payload #>> '{academicBranch,role}') as branch_role,
      min(item_payload #>> '{academicBranch,displayLabel}') as display_label,
      (array_agg(
        item_payload #> '{academicBranch,educationLevel}'
      ))[1] as education_level,
      (array_agg(
        item_payload #> '{academicBranch,academicPathways}'
      ))[1] as academic_pathways,
      (array_agg(
        item_payload #> '{academicBranch,subject}'
      ))[1] as subject,
      (array_agg(
        item_payload #> '{academicBranch,track}'
      ))[1] as track,
      count(*)::integer as eligible_count,
      count(*) filter (
        where item_payload #>> '{progress,studied,state}' = 'marked'
      )::integer as studied_count,
      count(*) filter (
        where item_payload #>> '{progress,reviewed,state}' = 'marked'
      )::integer as reviewed_count,
      count(*) filter (
        where item_payload #>> '{progress,practiced,state}' = 'marked'
      )::integer as practiced_count
    from curriculum_items
    group by item_payload #>> '{academicBranch,branchKey}'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'branchKey', grouped.branch_key,
    'role', grouped.branch_role,
    'displayLabel', grouped.display_label,
    'educationLevel', grouped.education_level,
    'academicPathways', grouped.academic_pathways,
    'subject', grouped.subject,
    'track', grouped.track,
    'eligibleSessionCount', grouped.eligible_count,
    'studiedCount', grouped.studied_count,
    'reviewedCount', grouped.reviewed_count,
    'practicedCount', grouped.practiced_count,
    'completedUnitCount', grouped.studied_count + grouped.practiced_count,
    'totalUnitCount', grouped.eligible_count * 2,
    'percent', case
      when grouped.eligible_count = 0 then 0
      else round(
        (
          (grouped.studied_count + grouped.practiced_count)::numeric
          * 100
        ) / (grouped.eligible_count * 2)
      )::integer
    end
  ) order by
    case when grouped.branch_role = 'primary' then 0 else 1 end,
    grouped.display_label,
    grouped.branch_key), '[]'::jsonb)
  into track_breakdown
  from grouped;

  return coalesce(p_existing_progress, '{}'::jsonb)
    || jsonb_build_object(
      'label', 'Course progress',
      'scope', 'active_schedule_version',
      'reviewedAffectsPercent', false,
      'byTrack', track_breakdown
    );
end;
$$;

alter function public.get_my_effective_course_schedule(uuid)
  rename to get_my_effective_course_schedule_phase5g2_4_5_base;

create or replace function public.get_my_effective_course_schedule(
  p_course_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  active_version_id uuid;
  coverage jsonb;
  projected_items jsonb;
  course_progress jsonb;
begin
  payload := public.get_my_effective_course_schedule_phase5g2_4_5_base(
    p_course_id
  );
  active_version_id := nullif(
    payload ->> 'activeScheduleVersionId',
    ''
  )::uuid;
  if active_version_id is null then
    raise exception 'The effective Course Schedule has no active Version.';
  end if;

  coverage := public.course_schedule_consumer_coverage(active_version_id);
  projected_items := public.project_course_schedule_consumer_items(
    active_version_id,
    coalesce(payload -> 'items', '[]'::jsonb)
  );
  course_progress := public.project_course_schedule_consumer_progress(
    projected_items,
    payload -> 'trackProgress'
  );

  payload := jsonb_set(payload, '{items}', projected_items, true);
  payload := jsonb_set(payload, '{coverage}', coverage, true);
  payload := jsonb_set(
    payload,
    '{courseProgress}',
    course_progress,
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus,multiCurriculumConsumerProjection}',
    to_jsonb('active_phase_5g2_4_5_1'::text),
    true
  );
  return payload;
end;
$$;

alter function public.get_my_unified_course_schedule(uuid)
  rename to get_my_unified_course_schedule_phase5g2_4_5_base;

create or replace function public.get_my_unified_course_schedule(
  p_course_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  active_version_id uuid;
  coverage jsonb;
  course_progress jsonb;
  primary_branch jsonb;
begin
  payload := public.get_my_unified_course_schedule_phase5g2_4_5_base(
    p_course_id
  );
  active_version_id := nullif(
    payload #>> '{schedule,activeVersionId}',
    ''
  )::uuid;
  if active_version_id is null then
    raise exception 'The canonical Course Schedule has no active Version.';
  end if;

  coverage := public.course_schedule_consumer_coverage(active_version_id);
  select branch.value
  into primary_branch
  from jsonb_array_elements(coverage -> 'branches') branch(value)
  where branch.value ->> 'role' = 'primary'
  limit 1;
  if primary_branch is null then
    raise exception 'The canonical Course Schedule has no primary curriculum branch.';
  end if;

  course_progress := public.project_course_schedule_consumer_progress(
    coalesce(payload #> '{academicTrack,items}', '[]'::jsonb),
    payload #> '{academicTrack,trackProgress}'
  );

  payload := jsonb_set(
    payload,
    '{context,academicContext,coverage}',
    coverage,
    true
  );
  payload := jsonb_set(
    payload,
    '{context,academicContext,primaryBranch}',
    primary_branch,
    true
  );
  payload := jsonb_set(
    payload,
    '{academicTrack,coverage}',
    coverage,
    true
  );
  payload := jsonb_set(
    payload,
    '{academicTrack,courseProgress}',
    course_progress,
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus,multiCurriculumConsumerProjection}',
    to_jsonb('active_phase_5g2_4_5_1'::text),
    true
  );
  return payload;
end;
$$;

revoke all on function public.course_schedule_consumer_branch_label(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_consumer_branch_context(
  jsonb, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_module_presentation_key(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.course_schedule_consumer_coverage(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.project_course_schedule_consumer_items(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.project_course_schedule_consumer_progress(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.get_my_effective_course_schedule_phase5g2_4_5_base(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.get_my_unified_course_schedule_phase5g2_4_5_base(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_unified_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated, service_role;
grant execute on function public.get_my_unified_course_schedule(uuid)
  to authenticated, service_role;

comment on function public.course_schedule_consumer_branch_context(
  jsonb, jsonb, uuid
) is
  'Resolves one immutable Schedule-item source to its selected Version coverage branch without treating an academic pathway as a Student goal.';
comment on function public.course_schedule_module_presentation_key(text, text) is
  'Collision-resistant member-presentation identity. Module 1 in two Tracks receives two independent color keys.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Phase 5.G.2.4.5.1 effective Schedule with item-specific Education-level, academic-pathway, Subject, Track, Module, destination, and active-Version Course progress context.';
comment on function public.get_my_unified_course_schedule(uuid) is
  'Canonical Course Schedule read contract enriched with authoritative active-Version multi-curriculum coverage and item-specific branch presentation.';
