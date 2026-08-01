-- Phase 5.G.2.4.5.1 compatibility follow-up:
-- the canonical multi-curriculum projection gives retained legacy Schedule
-- items without module metadata the stable `course-plan` identity. Calendar
-- presentation must resolve that same compatibility identity so Classroom and
-- Calendar consumers do not color the same academic item differently.

alter function public.get_my_student_calendar(date, date)
  rename to get_my_student_calendar_phase5g2_4_5_legacy_module_base;

revoke all on function
  public.get_my_student_calendar_phase5g2_4_5_legacy_module_base(date, date)
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
declare
  caller_id uuid := auth.uid();
  payload jsonb;
  source_event jsonb;
  enriched_event jsonb;
  enriched_events jsonb := '[]'::jsonb;
  schedule_item_id uuid;
  resolved_module_key text;
  resolved_module_title text;
  resolved_module_style jsonb;
begin
  payload :=
    public.get_my_student_calendar_phase5g2_4_5_legacy_module_base(
      p_range_start,
      p_range_end
    );

  for source_event in
    select event_entry.value
    from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb))
      event_entry(value)
  loop
    enriched_event := source_event;
    schedule_item_id := null;
    resolved_module_key := null;
    resolved_module_title := null;
    resolved_module_style := '{}'::jsonb;

    if coalesce(source_event ->> 'scheduleItemId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      schedule_item_id := (source_event ->> 'scheduleItemId')::uuid;
    end if;

    if schedule_item_id is not null
      and source_event ->> 'kind' in (
        'schedule_milestone',
        'regular_class',
        'extra_class',
        'independent_progress'
      )
    then
      select
        module_identity.module_key,
        module_identity.module_title,
        coalesce(
          preference.schedule_module_styles -> module_identity.module_key,
          '{}'::jsonb
        )
      into
        resolved_module_key,
        resolved_module_title,
        resolved_module_style
      from public.course_schedule_items item
      cross join lateral (
        select
          coalesce(
            nullif(btrim(item.source_module_key), ''),
            nullif(btrim(item.source_snapshot ->> 'sourceModuleKey'), ''),
            nullif(btrim(item.source_snapshot ->> 'moduleKey'), ''),
            'course-plan'
          ) as module_key,
          coalesce(
            nullif(btrim(item.source_snapshot ->> 'sourceModuleTitle'), ''),
            nullif(btrim(item.source_snapshot ->> 'moduleTitle'), ''),
            'Course plan'
          ) as module_title
      ) module_identity
      left join public.classroom_member_preferences preference
        on preference.classroom_id =
          nullif(source_event ->> 'classroomId', '')::uuid
        and preference.user_id = caller_id
      where item.id = schedule_item_id;

      if resolved_module_key is not null then
        enriched_event := source_event || jsonb_build_object(
          'presentationColorSource',
          'module',
          'modulePresentation',
          jsonb_build_object(
            'key', resolved_module_key,
            'title', resolved_module_title,
            'headerColor', coalesce(
              nullif(resolved_module_style ->> 'headerColor', ''),
              '#5fae63'
            ),
            'rowColor', coalesce(
              nullif(resolved_module_style ->> 'stripeColor', ''),
              '#dcefdc'
            )
          )
        );
      end if;
    end if;

    enriched_events := enriched_events || jsonb_build_array(
      jsonb_strip_nulls(enriched_event)
    );
  end loop;

  payload := jsonb_set(payload, '{events}', enriched_events, true);
  payload := jsonb_set(
    payload,
    '{contract,legacyModuleIdentityCompatibility}',
    'true'::jsonb,
    true
  );
  return payload;
end;
$$;

revoke all on function public.get_my_student_calendar(date, date)
  from public, anon;
grant execute on function public.get_my_student_calendar(date, date)
  to authenticated;

comment on function
  public.get_my_student_calendar_phase5g2_4_5_legacy_module_base(date, date)
is
  'Private retained Phase 5.G.2.2 Calendar presentation wrapped by the Phase 5.G.2.4.5.1 legacy-module compatibility projection.';

comment on function public.get_my_student_calendar(date, date) is
  'Canonical Student Calendar with the same retained legacy `course-plan` module identity and member-private colors used by the authoritative Classroom Schedule projection.';
