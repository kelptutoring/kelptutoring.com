-- Phase 5.G.2.4.5.3: Calendar and PDF presentation parity.
--
-- Calendar events backed by an active Schedule item inherit that item's own
-- immutable curriculum branch and branch-qualified module presentation key.
-- Course lifecycle events use the whole active-Version coverage instead.

create or replace function public.course_schedule_calendar_presentation_parity(
  p_payload jsonb,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  source_event jsonb;
  enriched_event jsonb;
  enriched_events jsonb := '[]'::jsonb;
  event_kind text;
  event_course_id uuid;
  event_classroom_id uuid;
  schedule_item_id uuid;
  active_version_id uuid;
  item_record public.course_schedule_items%rowtype;
  coverage_snapshot jsonb;
  consumer_coverage jsonb;
  branch_context jsonb;
  education_level jsonb;
  education_code text;
  distinct_level_count integer;
  raw_module_key text;
  module_title text;
  module_presentation_key text;
  module_style jsonb;
  compact_label text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A Calendar payload is required for presentation parity.';
  end if;

  for source_event in
    select entry.value
    from jsonb_array_elements(coalesce(p_payload -> 'events', '[]'::jsonb))
      entry(value)
  loop
    enriched_event := source_event;
    event_kind := coalesce(source_event ->> 'kind', '');
    event_course_id := null;
    event_classroom_id := null;
    schedule_item_id := null;
    active_version_id := null;
    coverage_snapshot := null;
    consumer_coverage := null;
    branch_context := null;
    education_level := null;
    raw_module_key := null;
    module_title := null;
    module_presentation_key := null;
    module_style := '{}'::jsonb;
    compact_label := null;

    if coalesce(source_event ->> 'courseId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      event_course_id := (source_event ->> 'courseId')::uuid;
    end if;
    if coalesce(source_event ->> 'classroomId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      event_classroom_id := (source_event ->> 'classroomId')::uuid;
    end if;
    if coalesce(source_event ->> 'scheduleItemId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      schedule_item_id := (source_event ->> 'scheduleItemId')::uuid;
    end if;

    if event_course_id is not null then
      select course.active_schedule_version_id
      into active_version_id
      from public.student_courses course
      where course.id = event_course_id;
    end if;

    if event_kind in ('course_start', 'course_end')
      and active_version_id is not null then
      consumer_coverage := public.course_schedule_consumer_coverage(
        active_version_id
      );

      select count(distinct coalesce(
        nullif(branch.value #>> '{educationLevel,slug}', ''),
        nullif(branch.value #>> '{educationLevel,name}', '')
      ))
      into distinct_level_count
      from jsonb_array_elements(coalesce(
        consumer_coverage -> 'branches',
        '[]'::jsonb
      )) branch(value);

      if distinct_level_count = 1 then
        education_level := consumer_coverage
          #> '{branches,0,educationLevel}';
        education_code := public.calendar_education_level_code(
          education_level ->> 'name',
          education_level ->> 'slug'
        );
        education_level := education_level || jsonb_build_object(
          'code', nullif(education_code, '')
        );
      elsif distinct_level_count > 1 then
        education_level := jsonb_build_object(
          'name', 'Multiple education levels',
          'slug', 'multiple-education-levels',
          'code', 'MULTI'
        );
      else
        education_level := source_event -> 'educationLevel';
      end if;

      compact_label := case
        when coalesce((consumer_coverage ->> 'branchCount')::integer, 0) = 1
          then consumer_coverage #>> '{branches,0,track,name}'
        when coalesce((consumer_coverage ->> 'branchCount')::integer, 0) > 1
          then (consumer_coverage ->> 'branchCount') || ' tracks'
        else null
      end;

      enriched_event := source_event || jsonb_strip_nulls(jsonb_build_object(
        'academicScope', 'course',
        'academicPath', consumer_coverage ->> 'displayLabel',
        'compactAcademicLabel', compact_label,
        'academicCoverage', consumer_coverage,
        'educationLevel', education_level,
        'detail', coalesce(
          nullif(consumer_coverage ->> 'displayLabel', ''),
          source_event ->> 'detail'
        ),
        'presentationColorSource', 'classroom'
      ));
    elsif schedule_item_id is not null
      and event_kind in (
        'schedule_milestone',
        'regular_class',
        'extra_class',
        'independent_progress'
      ) then
      select item.*
      into item_record
      from public.course_schedule_items item
      where item.id = schedule_item_id
        and item.version_id = active_version_id;

      if found then
        select coverage.coverage_snapshot
        into coverage_snapshot
        from public.course_schedule_version_coverages coverage
        where coverage.version_id = active_version_id;

        branch_context := public.course_schedule_consumer_branch_context(
          coverage_snapshot,
          item_record.source_snapshot,
          item_record.curriculum_node_id
        );
        if branch_context is null
          and item_record.item_kind = 'curriculum_topic'
          and jsonb_array_length(coalesce(
            coverage_snapshot -> 'branches',
            '[]'::jsonb
          )) = 1 then
          branch_context := public.course_schedule_consumer_branch_context(
            coverage_snapshot,
            jsonb_build_object(
              'sourceTrackKey', coverage_snapshot #>> '{branches,0,branchKey}'
            ),
            null
          );
        end if;

        raw_module_key := coalesce(
          nullif(btrim(item_record.source_module_key), ''),
          nullif(btrim(item_record.source_snapshot ->> 'sourceModuleKey'), ''),
          nullif(btrim(item_record.source_snapshot ->> 'moduleKey'), ''),
          'course-plan'
        );
        module_title := coalesce(
          nullif(btrim(item_record.source_snapshot ->> 'sourceModuleTitle'), ''),
          nullif(btrim(item_record.source_snapshot ->> 'moduleTitle'), ''),
          'Course plan'
        );
        module_presentation_key :=
          public.course_schedule_module_presentation_key(
            branch_context ->> 'branchKey',
            raw_module_key
          );

        select coalesce((
          select coalesce(
            preference.schedule_module_styles -> module_presentation_key,
            preference.schedule_module_styles -> raw_module_key
          )
          from public.classroom_member_preferences preference
          where preference.classroom_id = event_classroom_id
            and preference.user_id = p_user_id
        ), '{}'::jsonb)
        into module_style;

        education_level := branch_context -> 'educationLevel';
        education_code := public.calendar_education_level_code(
          education_level ->> 'name',
          education_level ->> 'slug'
        );
        education_level := coalesce(education_level, '{}'::jsonb)
          || jsonb_build_object('code', nullif(education_code, ''));

        enriched_event := source_event || jsonb_strip_nulls(jsonb_build_object(
          'academicScope', case
            when branch_context is null then 'course'
            else 'branch'
          end,
          'academicPath', branch_context ->> 'displayLabel',
          'compactAcademicLabel', branch_context #>> '{track,name}',
          'academicPathways', branch_context -> 'academicPathways',
          'subject', coalesce(
            nullif(branch_context #>> '{subject,name}', ''),
            source_event ->> 'subject'
          ),
          'focus', coalesce(
            nullif(branch_context #>> '{track,name}', ''),
            source_event ->> 'focus'
          ),
          'educationLevel', case
            when branch_context is null then source_event -> 'educationLevel'
            else education_level
          end,
          'presentationColorSource', 'module',
          'modulePresentation', jsonb_build_object(
            'key', module_presentation_key,
            'sourceModuleKey', raw_module_key,
            'title', module_title,
            'headerColor', coalesce(
              nullif(module_style ->> 'headerColor', ''),
              '#5fae63'
            ),
            'rowColor', coalesce(
              nullif(module_style ->> 'stripeColor', ''),
              '#dcefdc'
            )
          )
        ));
      end if;
    end if;

    enriched_events := enriched_events || jsonb_build_array(
      jsonb_strip_nulls(enriched_event)
    );
  end loop;

  p_payload := jsonb_set(p_payload, '{events}', enriched_events, true);
  p_payload := jsonb_set(
    p_payload,
    '{contract,itemAcademicPresentation}',
    'true'::jsonb,
    true
  );
  p_payload := jsonb_set(
    p_payload,
    '{contract,courseLifecycleCoveragePresentation}',
    'true'::jsonb,
    true
  );
  return p_payload;
end;
$$;

revoke all on function
  public.course_schedule_calendar_presentation_parity(jsonb, uuid)
  from public, anon, authenticated, service_role;

alter function public.get_my_student_calendar(date, date)
  rename to get_my_student_calendar_phase5g2_4_5_3_base;

revoke all on function
  public.get_my_student_calendar_phase5g2_4_5_3_base(date, date)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_student_calendar(
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.course_schedule_calendar_presentation_parity(
    public.get_my_student_calendar_phase5g2_4_5_3_base(
      p_range_start,
      p_range_end
    ),
    auth.uid()
  );
end;
$$;

revoke all on function public.get_my_student_calendar(date, date)
  from public, anon;
grant execute on function public.get_my_student_calendar(date, date)
  to authenticated;

alter function public.get_my_student_classroom_calendar(uuid, date, date)
  rename to get_my_student_classroom_calendar_phase5g2_4_5_3_base;

revoke all on function
  public.get_my_student_classroom_calendar_phase5g2_4_5_3_base(uuid, date, date)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_student_classroom_calendar(
  p_classroom_id uuid,
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.course_schedule_calendar_presentation_parity(
    public.get_my_student_classroom_calendar_phase5g2_4_5_3_base(
      p_classroom_id,
      p_range_start,
      p_range_end
    ),
    auth.uid()
  );
end;
$$;

revoke all on function
  public.get_my_student_classroom_calendar(uuid, date, date)
  from public, anon;
grant execute on function
  public.get_my_student_classroom_calendar(uuid, date, date)
  to authenticated;

alter function public.get_my_classroom_calendar(uuid, date, date)
  rename to get_my_classroom_calendar_phase5g2_4_5_3_base;

revoke all on function
  public.get_my_classroom_calendar_phase5g2_4_5_3_base(uuid, date, date)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_classroom_calendar(
  p_classroom_id uuid,
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.course_schedule_calendar_presentation_parity(
    public.get_my_classroom_calendar_phase5g2_4_5_3_base(
      p_classroom_id,
      p_range_start,
      p_range_end
    ),
    auth.uid()
  );
end;
$$;

revoke all on function public.get_my_classroom_calendar(uuid, date, date)
  from public, anon;
grant execute on function public.get_my_classroom_calendar(uuid, date, date)
  to authenticated;

comment on function public.get_my_student_calendar(date, date) is
  'Canonical Student Calendar with item-specific academic paths, branch-qualified module colors, whole-Course lifecycle coverage, direct destinations, and date-only presentation semantics.';

comment on function public.get_my_classroom_calendar(uuid, date, date) is
  'Role-aware Classroom Calendar with item-specific academic paths, branch-qualified module colors, whole-Course lifecycle coverage, and exact Classroom scope.';
