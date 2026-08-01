-- Phase 5.G.2.2 presentation follow-up:
-- carry each member's private Classroom Schedule module colors into canonical
-- Calendar targets. Course lifecycle events keep the Classroom Card color,
-- while independent Assignment deadlines keep their event-family palette.

alter function public.get_my_student_calendar(date, date)
  rename to get_my_student_calendar_phase5g2_2_navigation;

revoke all on function
  public.get_my_student_calendar_phase5g2_2_navigation(date, date)
  from public, anon, authenticated;

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
  module_key text;
  module_title text;
  module_style jsonb;
  presentation_source text;
begin
  payload := public.get_my_student_calendar_phase5g2_2_navigation(
    p_range_start,
    p_range_end
  );

  for source_event in
    select entry.value
    from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb))
      entry(value)
  loop
    schedule_item_id := null;
    module_key := null;
    module_title := null;
    module_style := '{}'::jsonb;

    if coalesce(source_event ->> 'scheduleItemId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      schedule_item_id := (source_event ->> 'scheduleItemId')::uuid;
    end if;

    if schedule_item_id is not null then
      select
        item.source_module_key,
        coalesce(
          nullif(btrim(item.source_snapshot ->> 'sourceModuleTitle'), ''),
          nullif(btrim(item.source_snapshot ->> 'moduleTitle'), ''),
          'Course plan'
        ),
        coalesce(
          preference.schedule_module_styles -> item.source_module_key,
          '{}'::jsonb
        )
      into module_key, module_title, module_style
      from public.course_schedule_items item
      left join public.classroom_member_preferences preference
        on preference.classroom_id =
          nullif(source_event ->> 'classroomId', '')::uuid
        and preference.user_id = caller_id
      where item.id = schedule_item_id;
    end if;

    presentation_source := case
      when source_event ->> 'kind' in ('course_start', 'course_end')
        then 'classroom'
      when module_key is not null
        and source_event ->> 'kind' in (
          'schedule_milestone',
          'regular_class',
          'extra_class',
          'independent_progress'
        )
        then 'module'
      else 'event_kind'
    end;

    enriched_event := source_event || jsonb_build_object(
      'presentationColorSource',
      presentation_source
    );

    if presentation_source = 'module' then
      enriched_event := enriched_event || jsonb_build_object(
        'modulePresentation',
        jsonb_build_object(
          'key', module_key,
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
      );
    end if;

    enriched_events := enriched_events || jsonb_build_array(
      jsonb_strip_nulls(enriched_event)
    );
  end loop;

  payload := jsonb_set(payload, '{events}', enriched_events, true);
  payload := jsonb_set(
    payload,
    '{contract,moduleColorPresentation}',
    'true'::jsonb,
    true
  );
  return payload;
end;
$$;

revoke all on function public.get_my_student_calendar(date, date)
  from public, anon, authenticated;
grant execute on function public.get_my_student_calendar(date, date)
  to authenticated;

comment on function public.get_my_student_calendar(date, date) is
  'Phase 5.G.2.2 canonical Student Calendar with member-private module colors, Classroom-colored Course lifecycle events, direct destinations, and atomic Course Schedule authority.';
