-- Keep the active Course plan identical for Students, Tutors, and Mentors.
--
-- Source-less legacy curriculum scaffolds remain immutable in Schedule history,
-- but they are not active Course items once a Version contains Track-backed
-- curriculum topics. Progress is recomputed from that shared active item set.

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
  eligible_count integer := 0;
  studied_count integer := 0;
  reviewed_count integer := 0;
  practiced_count integer := 0;
  total_unit_count integer := 0;
  completed_unit_count integer := 0;
  progress_percent integer := 0;
begin
  with curriculum_items as (
    select
      entry.item_payload,
      (
        lower(coalesce(
          entry.item_payload #>> '{progress,studied,state}',
          ''
        )) = 'marked'
        or lower(coalesce(
          entry.item_payload #>> '{progress,studied,marked}',
          'false'
        )) = 'true'
        or lower(coalesce(
          entry.item_payload ->> 'sequenceState',
          ''
        )) = 'studied'
      ) as studied,
      (
        lower(coalesce(
          entry.item_payload #>> '{progress,reviewed,state}',
          ''
        )) = 'marked'
        or lower(coalesce(
          entry.item_payload #>> '{progress,reviewed,marked}',
          'false'
        )) = 'true'
      ) as reviewed,
      (
        lower(coalesce(
          entry.item_payload #>> '{progress,practiced,state}',
          ''
        )) = 'marked'
        or lower(coalesce(
          entry.item_payload #>> '{progress,practiced,marked}',
          'false'
        )) = 'true'
      ) as practiced
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
      entry(item_payload)
    where entry.item_payload ->> 'kind' = 'curriculum_topic'
      and entry.item_payload ->> 'academicScope' = 'branch'
  )
  select
    count(*)::integer,
    count(*) filter (where curriculum_items.studied)::integer,
    count(*) filter (where curriculum_items.reviewed)::integer,
    count(*) filter (where curriculum_items.practiced)::integer
  into
    eligible_count,
    studied_count,
    reviewed_count,
    practiced_count
  from curriculum_items;

  total_unit_count := eligible_count * 2;
  completed_unit_count := studied_count + practiced_count;
  progress_percent := case
    when total_unit_count = 0 then 0
    else round(
      completed_unit_count::numeric * 100 / total_unit_count
    )::integer
  end;

  with curriculum_items as (
    select
      entry.item_payload,
      (
        lower(coalesce(
          entry.item_payload #>> '{progress,studied,state}',
          ''
        )) = 'marked'
        or lower(coalesce(
          entry.item_payload #>> '{progress,studied,marked}',
          'false'
        )) = 'true'
        or lower(coalesce(
          entry.item_payload ->> 'sequenceState',
          ''
        )) = 'studied'
      ) as studied,
      (
        lower(coalesce(
          entry.item_payload #>> '{progress,reviewed,state}',
          ''
        )) = 'marked'
        or lower(coalesce(
          entry.item_payload #>> '{progress,reviewed,marked}',
          'false'
        )) = 'true'
      ) as reviewed,
      (
        lower(coalesce(
          entry.item_payload #>> '{progress,practiced,state}',
          ''
        )) = 'marked'
        or lower(coalesce(
          entry.item_payload #>> '{progress,practiced,marked}',
          'false'
        )) = 'true'
      ) as practiced
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
      entry(item_payload)
    where entry.item_payload ->> 'kind' = 'curriculum_topic'
      and entry.item_payload ->> 'academicScope' = 'branch'
      and nullif(
        entry.item_payload #>> '{academicBranch,branchKey}',
        ''
      ) is not null
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
      count(*) filter (where studied)::integer as studied_count,
      count(*) filter (where reviewed)::integer as reviewed_count,
      count(*) filter (where practiced)::integer as practiced_count
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

  return case
    when jsonb_typeof(p_existing_progress) = 'object'
      then p_existing_progress
    else '{}'::jsonb
  end || jsonb_build_object(
    'label', 'Course progress',
    'scope', 'active_schedule_version',
    'eligibleSessionCount', eligible_count,
    'studiedCount', studied_count,
    'reviewedCount', reviewed_count,
    'practicedCount', practiced_count,
    'completedUnitCount', completed_unit_count,
    'totalUnitCount', total_unit_count,
    'percent', progress_percent,
    'reviewedAffectsPercent', false,
    'byTrack', track_breakdown
  );
end;
$$;

alter function public.get_my_effective_course_schedule(uuid)
  rename to get_my_effective_course_schedule_phase5g2_4_5_3_base;

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
  active_items jsonb;
  active_progress jsonb;
begin
  payload :=
    public.get_my_effective_course_schedule_phase5g2_4_5_3_base(
      p_course_id
    );
  active_version_id := nullif(
    payload ->> 'activeScheduleVersionId',
    ''
  )::uuid;
  if active_version_id is null then
    raise exception 'The effective Course Schedule has no active Version.';
  end if;

  select coalesce(jsonb_agg(
    entry.item_payload order by entry.ordinality
  ), '[]'::jsonb)
  into active_items
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality entry(item_payload, ordinality)
  left join public.course_schedule_items item
    on item.version_id = active_version_id
   and item.id = nullif(
     entry.item_payload ->> 'scheduleItemId',
     ''
   )::uuid
  where item.id is null
    or not (
      item.item_kind = 'curriculum_topic'
      and nullif(btrim(coalesce(item.source_module_key, '')), '') is null
      and exists (
        select 1
        from public.course_schedule_items track_item
        where track_item.version_id = active_version_id
          and track_item.item_kind = 'curriculum_topic'
          and nullif(
            btrim(coalesce(track_item.source_module_key, '')),
            ''
          ) is not null
      )
    );

  active_progress := public.project_course_schedule_consumer_progress(
    active_items,
    '{}'::jsonb
  );
  payload := jsonb_set(payload, '{items}', active_items, true);
  payload := jsonb_set(
    payload,
    '{trackProgress}',
    active_progress - 'byTrack' - 'label' - 'scope',
    true
  );
  payload := jsonb_set(
    payload,
    '{courseProgress}',
    active_progress,
    true
  );
  payload := jsonb_set(
    payload,
    '{featureStatus,activeScheduleRoleParity}',
    to_jsonb('active_phase_5g2_4_5_3'::text),
    true
  );
  return payload;
exception when invalid_text_representation then
  raise exception 'The active Course Schedule contains invalid item identity.';
end;
$$;

revoke all on function public.project_course_schedule_consumer_progress(
  jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function
  public.get_my_effective_course_schedule_phase5g2_4_5_3_base(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated, service_role;

comment on function public.get_my_effective_course_schedule(uuid) is
  'Returns one role-neutral active Course item set. Source-less legacy scaffolds remain in immutable staff history instead of appearing as active modules.';
comment on function public.project_course_schedule_consumer_progress(
  jsonb, jsonb
) is
  'Recomputes overall and per-Track progress from the canonical active curriculum items, including Studied sequence state.';
