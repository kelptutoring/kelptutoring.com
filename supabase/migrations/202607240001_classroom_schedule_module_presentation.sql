-- Phase 5.F follow-up: preserve Builder module labels in the effective
-- Classroom Schedule and store each member's module colors separately from
-- authoritative academic Schedule data.

alter table public.classroom_member_preferences
  add column if not exists schedule_module_styles jsonb not null default '{}'::jsonb;

alter table public.classroom_member_preferences
  drop constraint if exists classroom_member_preferences_schedule_module_styles_check,
  add constraint classroom_member_preferences_schedule_module_styles_check check (
    jsonb_typeof(schedule_module_styles) = 'object'
  );

alter function public.get_my_effective_course_schedule(uuid)
  rename to get_my_effective_course_schedule_phase5f5;

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
    select coalesce(preference.schedule_module_styles, '{}'::jsonb)
    into module_styles
    from public.classroom_member_preferences preference
    where preference.classroom_id = target_classroom_id
      and preference.user_id = caller_id;
  end if;
  module_styles := coalesce(module_styles, '{}'::jsonb);

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
    on item.id = nullif(entry.item_payload ->> 'scheduleItemId', '')::uuid;

  payload := jsonb_set(payload, '{items}', projected_items, true);
  payload := jsonb_set(payload, '{moduleStyles}', module_styles, true);
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

  return payload;
end;
$$;

create or replace function public.save_my_classroom_schedule_module_style(
  p_course_id uuid,
  p_module_key text,
  p_header_color text,
  p_stripe_color text,
  p_template_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  target_classroom_id uuid;
  module_key text := btrim(coalesce(p_module_key, ''));
  header_color text := lower(btrim(coalesce(p_header_color, '')));
  stripe_color text := lower(btrim(coalesce(p_stripe_color, '')));
  template_name text := nullif(btrim(coalesce(p_template_name, '')), '');
  style_payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to customize a Schedule module.';
  end if;
  if char_length(module_key) < 1 or char_length(module_key) > 240 then
    raise exception 'The Schedule module identity is invalid.';
  end if;
  if header_color !~ '^#[0-9a-f]{6}$' or stripe_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Schedule module colors must use six-digit hexadecimal values.';
  end if;
  if template_name is not null and char_length(template_name) > 80 then
    raise exception 'The Schedule module color label is too long.';
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
    raise exception 'A retained Classroom Membership is required to customize this Schedule.';
  end if;

  if not exists (
    select 1
    from public.student_courses course
    join public.course_schedule_items item
      on item.version_id = course.active_schedule_version_id
    where course.id = p_course_id
      and item.source_module_key = module_key
  ) then
    raise exception 'The selected module is not part of the active Course Schedule.';
  end if;

  style_payload := jsonb_build_object(
    'headerColor', header_color,
    'stripeColor', stripe_color,
    'templateName', coalesce(template_name, 'Custom')
  );

  insert into public.classroom_member_preferences (
    user_id,
    classroom_id,
    schedule_module_styles
  ) values (
    caller_id,
    target_classroom_id,
    jsonb_build_object(module_key, style_payload)
  )
  on conflict (user_id, classroom_id) do update
  set schedule_module_styles = jsonb_set(
    public.classroom_member_preferences.schedule_module_styles,
    array[module_key],
    style_payload,
    true
  );

  return public.get_my_effective_course_schedule(p_course_id);
end;
$$;

revoke all on function public.get_my_effective_course_schedule_phase5f5(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_effective_course_schedule(uuid)
  from public, anon, authenticated;
revoke all on function public.save_my_classroom_schedule_module_style(
  uuid, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.get_my_effective_course_schedule(uuid)
  to authenticated, service_role;
grant execute on function public.save_my_classroom_schedule_module_style(
  uuid, text, text, text, text
) to authenticated, service_role;

comment on column public.classroom_member_preferences.schedule_module_styles is
  'Member-private Classroom Schedule module appearance. This never changes Course, Schedule Version, or another member presentation.';
comment on function public.get_my_effective_course_schedule(uuid) is
  'Student/Tutor/Mentor effective Schedule enriched with immutable Builder module labels and member-private module presentation preferences.';
comment on function public.save_my_classroom_schedule_module_style(
  uuid, text, text, text, text
) is
  'Stores one Classroom member''s web/PDF module colors without mutating authoritative academic Schedule data.';
