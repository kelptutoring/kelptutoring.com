-- Classroom Schedule interaction follow-up.
--
-- 1. A legitimate mark -> correction -> re-mark cycle may revisit an earlier
--    effective target-mapping signature. Revisions remain append-only and are
--    ordered by revision_number; a signature is therefore searchable, not
--    globally unique within a Schedule Version.
-- 2. PDF rule/text colors are member-private presentation preferences. They
--    never alter the Course, Schedule Version, Track, or another member's PDF.

alter table public.course_schedule_target_mapping_revisions
  drop constraint if exists course_schedule_target_mapping_version_signature_key;

create index if not exists course_schedule_target_mapping_version_signature_idx
on public.course_schedule_target_mapping_revisions (version_id, mapping_signature);

alter table public.classroom_member_preferences
  add column if not exists schedule_pdf_style jsonb not null
    default '{"ruleColor":"#4e9d68","textColor":"#17333a"}'::jsonb;

alter table public.classroom_member_preferences
  drop constraint if exists classroom_member_preferences_schedule_pdf_style_check,
  add constraint classroom_member_preferences_schedule_pdf_style_check check (
    jsonb_typeof(schedule_pdf_style) = 'object'
    and lower(coalesce(schedule_pdf_style ->> 'ruleColor', '')) ~ '^#[0-9a-f]{6}$'
    and lower(coalesce(schedule_pdf_style ->> 'textColor', '')) ~ '^#[0-9a-f]{6}$'
  );

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
  caller_id uuid := auth.uid();
  payload jsonb;
  target_classroom_id uuid;
  module_styles jsonb := '{}'::jsonb;
  pdf_style jsonb := jsonb_build_object(
    'ruleColor', '#4e9d68',
    'textColor', '#17333a'
  );
  projected_items jsonb := '[]'::jsonb;
begin
  payload := public.get_my_effective_course_schedule_phase5f5(p_course_id);

  select classroom.id
  into target_classroom_id
  from public.classrooms classroom
  where classroom.course_id = p_course_id
  order by classroom.created_at, classroom.id
  limit 1;

  if target_classroom_id is not null then
    select
      coalesce(preference.schedule_module_styles, '{}'::jsonb),
      coalesce(preference.schedule_pdf_style, pdf_style)
    into module_styles, pdf_style
    from public.classroom_member_preferences preference
    where preference.classroom_id = target_classroom_id
      and preference.user_id = caller_id;
  end if;
  module_styles := coalesce(module_styles, '{}'::jsonb);
  pdf_style := coalesce(pdf_style, jsonb_build_object(
    'ruleColor', '#4e9d68',
    'textColor', '#17333a'
  ));

  select coalesce(jsonb_agg(
    jsonb_set(
      entry.item_payload,
      '{source,moduleTitle}',
      to_jsonb(coalesce(
        nullif(btrim(item.source_snapshot ->> 'sourceModuleTitle'), ''),
        nullif(btrim(item.source_snapshot ->> 'moduleTitle'), ''),
        ''
      )),
      true
    )
    order by entry.ordinality
  ), '[]'::jsonb)
  into projected_items
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality entry(item_payload, ordinality)
  left join public.course_schedule_items item
    on item.id = nullif(entry.item_payload ->> 'scheduleItemId', '')::uuid
  where item.id is null
    or coalesce(payload #>> '{permissions,actorRole}', '') <> 'student'
    or item.item_kind <> 'curriculum_topic'
    or item.source_module_key is not null
    or not exists (
      select 1
      from public.course_schedule_items track_item
      where track_item.version_id = item.version_id
        and track_item.item_kind = 'curriculum_topic'
        and track_item.source_module_key is not null
    );

  payload := jsonb_set(payload, '{items}', projected_items, true);
  payload := jsonb_set(payload, '{moduleStyles}', module_styles, true);
  payload := jsonb_set(payload, '{pdfStyle}', pdf_style, true);
  payload := jsonb_set(
    payload,
    '{permissions,canCustomizeModuleStyle}',
    to_jsonb(coalesce(exists (
      select 1
      from public.classroom_memberships membership
      where membership.classroom_id = target_classroom_id
        and membership.user_id = caller_id
    ), false)),
    true
  );
  payload := jsonb_set(
    payload,
    '{permissions,canCustomizePdfStyle}',
    payload #> '{permissions,canCustomizeModuleStyle}',
    true
  );

  return payload;
end;
$$;

create or replace function public.save_my_classroom_schedule_pdf_style(
  p_course_id uuid,
  p_rule_color text,
  p_text_color text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  target_classroom_id uuid;
  rule_color text := lower(btrim(coalesce(p_rule_color, '')));
  text_color text := lower(btrim(coalesce(p_text_color, '')));
  style_payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to customize Schedule PDF colors.';
  end if;
  if rule_color !~ '^#[0-9a-f]{6}$' or text_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Schedule PDF colors must use six-digit hexadecimal values.';
  end if;

  select classroom.id
  into target_classroom_id
  from public.classrooms classroom
  join public.classroom_memberships membership
    on membership.classroom_id = classroom.id
   and membership.user_id = caller_id
  where classroom.course_id = p_course_id
  order by classroom.created_at, classroom.id
  limit 1;

  if target_classroom_id is null then
    raise exception 'A retained Classroom Membership is required to customize this Schedule PDF.';
  end if;

  style_payload := jsonb_build_object(
    'ruleColor', rule_color,
    'textColor', text_color
  );

  insert into public.classroom_member_preferences (
    user_id,
    classroom_id,
    schedule_pdf_style
  ) values (
    caller_id,
    target_classroom_id,
    style_payload
  )
  on conflict (user_id, classroom_id) do update
  set schedule_pdf_style = excluded.schedule_pdf_style;

  return public.get_my_effective_course_schedule(p_course_id);
end;
$$;

revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;
revoke all on function public.save_my_classroom_schedule_pdf_style(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated, service_role;
grant execute on function public.save_my_classroom_schedule_pdf_style(uuid, text, text)
  to authenticated, service_role;

comment on column public.classroom_member_preferences.schedule_pdf_style is
  'Member-private Schedule PDF rule/text colors; presentation only, never authoritative Course data.';
comment on function public.save_my_classroom_schedule_pdf_style(uuid, text, text) is
  'Stores one Classroom member''s Schedule PDF rule/text colors and returns the refreshed effective Schedule.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Returns the unified Course Schedule with member presentation preferences; mixed Track-backed Student plans omit source-less legacy curriculum scaffolds while retaining them in staff history.';
