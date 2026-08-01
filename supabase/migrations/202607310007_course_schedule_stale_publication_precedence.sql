begin;

-- A stale Builder submission must reach the governed publisher before its
-- document is validated. The governed publisher owns exact-retry handling
-- and the authoritative expected-Version check. Current publications remain
-- strict: their cadence and start metadata are still validated before write.
create or replace function public.reflow_course_schedule_builder_items(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_builder_schedule jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  current_active_version_id uuid;
  ignored_publication_metadata jsonb;
  proposed_start_text text;
  proposed_start date;
begin
  select course.active_schedule_version_id
  into current_active_version_id
  from public.student_courses course
  where course.id = p_course_id;

  -- The retained governed publisher checks an idempotent retry before its
  -- expected-Version guard. Do not let validation of a stale/legacy document
  -- hide either of those authoritative outcomes.
  if not found
    or current_active_version_id is distinct from p_expected_version_id then
    return p_items;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The generated Course Schedule item list is invalid.';
  end if;

  ignored_publication_metadata :=
    public.course_schedule_builder_publication_metadata(p_builder_schedule);
  proposed_start_text := nullif(btrim(p_builder_schedule ->> 'startDate'), '');
  if proposed_start_text is not null then
    begin
      proposed_start := proposed_start_text::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'The generated Schedule start date is invalid.';
    end;
  end if;

  return p_items;
end;
$$;

-- Authenticate, authorize, and hold the Course row before the helper decides
-- whether the submitted Version is current. The governed base repeats every
-- check, including the expected-Version comparison, so the row lock improves
-- error precedence without weakening the concurrency boundary.
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
  locked_course_id uuid;
begin
  if caller_id is null then
    raise exception
      'Authentication is required to publish a generated Course Schedule.';
  end if;
  if not public.current_user_can_edit_course_schedule(p_course_id) then
    raise exception
      'Only the assigned Tutor or supervising Mentor can publish this generated Course Schedule.';
  end if;

  select course.id
  into locked_course_id
  from public.student_courses course
  where course.id = p_course_id
  for update;
  if not found then
    raise exception 'The Course could not be found.';
  end if;

  return public.publish_course_builder_schedule_phase5g2_4_7_3_1_3_base(
    p_course_id,
    p_expected_version_id,
    p_builder_schedule,
    public.reflow_course_schedule_builder_items(
      p_course_id,
      p_expected_version_id,
      p_builder_schedule,
      p_items
    ),
    p_change_reasons,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.reflow_course_schedule_builder_items(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) from public, anon;
grant execute on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) to authenticated;

comment on function public.reflow_course_schedule_builder_items(
  uuid, uuid, jsonb, jsonb
) is
  'Preserves frontend-calculated dates. Current publications validate their governed Builder envelope; stale and replay submissions defer to the authoritative publisher.';
comment on function public.publish_course_builder_schedule(
  uuid, uuid, jsonb, jsonb, jsonb, text
) is
  'Publishes one governed immutable successor while preserving authorization, idempotent-retry, stale-Version, and current-document validation precedence.';

commit;
