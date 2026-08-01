-- Phase 5.F.1: immutable weekly meeting-pattern contract.
--
-- Meeting patterns describe recurring academic opportunities. They are not
-- Calendar bookings, live Classes, attendance records, or credit events.
-- Changing a pattern creates a complete successor Course Schedule Version.

create table if not exists public.course_schedule_meeting_patterns (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  stable_pattern_key text not null,
  weekday smallint not null,
  local_start_time time without time zone not null,
  duration_minutes smallint not null,
  purpose text not null,
  position integer not null,
  effective_from date not null,
  effective_until date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint course_schedule_meeting_patterns_key_check check (
    stable_pattern_key ~ '^[a-z0-9][a-z0-9._:-]{2,119}$'
  ),
  constraint course_schedule_meeting_patterns_weekday_check check (
    weekday between 0 and 6
  ),
  constraint course_schedule_meeting_patterns_duration_check check (
    duration_minutes in (30, 60, 90)
  ),
  constraint course_schedule_meeting_patterns_purpose_check check (
    purpose in ('theory', 'practice', 'review', 'exam', 'wrap_up')
  ),
  constraint course_schedule_meeting_patterns_theory_duration_check check (
    purpose <> 'theory' or duration_minutes in (60, 90)
  ),
  constraint course_schedule_meeting_patterns_position_check check (position >= 0),
  constraint course_schedule_meeting_patterns_dates_check check (
    effective_until >= effective_from
  ),
  constraint course_schedule_meeting_patterns_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint course_schedule_meeting_patterns_version_key unique (
    version_id, stable_pattern_key
  ),
  constraint course_schedule_meeting_patterns_version_position unique (
    version_id, position
  ),
  constraint course_schedule_meeting_patterns_version_time unique (
    version_id, weekday, local_start_time
  )
);

create index if not exists course_schedule_meeting_patterns_version_idx
on public.course_schedule_meeting_patterns (
  version_id, weekday, local_start_time, position, id
);

create table if not exists public.course_schedule_meeting_pattern_changes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.student_courses(id) on delete restrict,
  version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  previous_version_id uuid not null references public.course_schedule_versions(id) on delete restrict,
  student_explanation text not null,
  private_staff_note text,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint course_schedule_meeting_pattern_changes_explanation_check check (
    char_length(btrim(student_explanation)) between 10 and 500
  ),
  constraint course_schedule_meeting_pattern_changes_private_note_check check (
    private_staff_note is null
    or char_length(btrim(private_staff_note)) between 1 and 2000
  ),
  constraint course_schedule_meeting_pattern_changes_before_check check (
    jsonb_typeof(before_snapshot) = 'object'
  ),
  constraint course_schedule_meeting_pattern_changes_after_check check (
    jsonb_typeof(after_snapshot) = 'object'
  ),
  constraint course_schedule_meeting_pattern_changes_version_key unique (version_id)
);

create index if not exists course_schedule_meeting_pattern_changes_course_idx
on public.course_schedule_meeting_pattern_changes (course_id, created_at desc, id);

create or replace function public.reject_course_schedule_meeting_pattern_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Course Schedule meeting patterns are immutable; publish a new Schedule Version instead.';
end;
$$;

drop trigger if exists course_schedule_meeting_patterns_immutable
on public.course_schedule_meeting_patterns;
create trigger course_schedule_meeting_patterns_immutable
before update or delete on public.course_schedule_meeting_patterns
for each row execute function public.reject_course_schedule_meeting_pattern_mutation();

drop trigger if exists course_schedule_meeting_pattern_changes_immutable
on public.course_schedule_meeting_pattern_changes;
create trigger course_schedule_meeting_pattern_changes_immutable
before update or delete on public.course_schedule_meeting_pattern_changes
for each row execute function public.reject_course_schedule_meeting_pattern_mutation();

create or replace function public.inherit_course_schedule_meeting_patterns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.previous_version_id is null
    or coalesce(new.metadata ->> 'changeScope', '') = 'meeting_pattern' then
    return new;
  end if;

  insert into public.course_schedule_meeting_patterns (
    version_id, stable_pattern_key, weekday, local_start_time,
    duration_minutes, purpose, position, effective_from, effective_until,
    metadata
  )
  select
    new.id, pattern.stable_pattern_key, pattern.weekday, pattern.local_start_time,
    pattern.duration_minutes, pattern.purpose, pattern.position,
    pattern.effective_from, pattern.effective_until, pattern.metadata
  from public.course_schedule_meeting_patterns pattern
  where pattern.version_id = new.previous_version_id
  order by pattern.position, pattern.id;

  return new;
end;
$$;

drop trigger if exists inherit_course_schedule_meeting_patterns
on public.course_schedule_versions;
create trigger inherit_course_schedule_meeting_patterns
after insert on public.course_schedule_versions
for each row execute function public.inherit_course_schedule_meeting_patterns();

create or replace function public.course_schedule_meeting_patterns_json(
  p_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'stablePatternKey', pattern.stable_pattern_key,
    'weekday', pattern.weekday,
    'localStartTime', to_char(pattern.local_start_time, 'HH24:MI'),
    'durationMinutes', pattern.duration_minutes,
    'purpose', pattern.purpose,
    'position', pattern.position,
    'effectiveFrom', pattern.effective_from,
    'effectiveUntil', pattern.effective_until,
    'advancesCurriculum', pattern.purpose = 'theory',
    'metadata', pattern.metadata
  ) order by pattern.position, pattern.id), '[]'::jsonb)
  from public.course_schedule_meeting_patterns pattern
  where pattern.version_id = p_version_id;
$$;

create or replace function public.publish_course_meeting_pattern_version(
  p_course_id uuid,
  p_expected_version_id uuid,
  p_effective_from date,
  p_effective_until date,
  p_patterns jsonb,
  p_student_explanation text,
  p_private_staff_note text,
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
  normalized_student_explanation text := btrim(coalesce(p_student_explanation, ''));
  normalized_private_staff_note text := nullif(btrim(coalesce(p_private_staff_note, '')), '');
  request_payload jsonb;
  course_record public.student_courses%rowtype;
  stable_schedule public.course_schedules%rowtype;
  active_version public.course_schedule_versions%rowtype;
  new_version public.course_schedule_versions%rowtype;
  prior_receipt public.course_schedule_publish_commands%rowtype;
  raw_pattern jsonb;
  normalized_patterns jsonb;
  before_snapshot jsonb;
  after_snapshot jsonb;
  response_payload jsonb;
  pattern_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required to publish a recurring meeting pattern.';
  end if;
  if p_course_id is null or p_expected_version_id is null then
    raise exception 'The Course and expected active Schedule Version are required.';
  end if;
  if normalized_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{7,127}$' then
    raise exception 'The meeting-pattern idempotency key is invalid.';
  end if;
  if char_length(normalized_student_explanation) not between 10 and 500 then
    raise exception 'A Student-visible explanation between 10 and 500 characters is required.';
  end if;
  if normalized_private_staff_note is not null
    and char_length(normalized_private_staff_note) > 2000 then
    raise exception 'A private meeting-pattern note cannot exceed 2000 characters.';
  end if;
  if p_patterns is null or jsonb_typeof(p_patterns) <> 'array'
    or jsonb_array_length(p_patterns) < 1
    or jsonb_array_length(p_patterns) > 28 then
    raise exception 'A recurring meeting pattern requires between 1 and 28 weekly slots.';
  end if;
  if p_effective_from is null or p_effective_until is null
    or p_effective_until < p_effective_from then
    raise exception 'The recurring meeting pattern requires an ordered effective date range.';
  end if;

  select * into course_record
  from public.student_courses
  where id = p_course_id
  for update;
  if not found then raise exception 'The Course could not be found.'; end if;
  if not public.current_user_can_edit_course_schedule(course_record.id) then
    raise exception 'Only the assigned Tutor or supervising Mentor can edit this Course meeting pattern.';
  end if;
  if course_record.status not in ('draft', 'active') then
    raise exception 'This Course does not currently accept recurring meeting-pattern edits.';
  end if;
  if course_record.service_model <> 'recurring' then
    raise exception 'Only a recurring Course owns a weekly meeting pattern.';
  end if;
  if p_effective_from < (case
      when course_record.status = 'active' then current_date
      else course_record.start_date
    end) then
    raise exception 'A meeting-pattern Version cannot rewrite elapsed Course dates.';
  end if;
  if p_effective_until > course_record.scheduled_end_date then
    raise exception 'A meeting pattern cannot extend beyond the current Course Schedule.';
  end if;

  select * into stable_schedule
  from public.course_schedules
  where course_id = course_record.id
  for update;
  if not found then raise exception 'The required stable Course Schedule could not be found.'; end if;

  request_payload := jsonb_build_object(
    'command', 'publish_course_meeting_pattern_version',
    'courseId', p_course_id,
    'expectedVersionId', p_expected_version_id,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'patterns', p_patterns,
    'studentExplanation', normalized_student_explanation,
    'privateStaffNote', normalized_private_staff_note
  );

  select * into prior_receipt
  from public.course_schedule_publish_commands receipt
  where receipt.schedule_id = stable_schedule.id
    and receipt.actor_user_id = caller_id
    and receipt.idempotency_key = normalized_idempotency_key;
  if found then
    if prior_receipt.request_payload <> request_payload then
      raise exception 'This Schedule idempotency key is already bound to a different request.';
    end if;
    return prior_receipt.response_payload || jsonb_build_object('idempotentReplay', true);
  end if;

  if course_record.active_schedule_version_id <> p_expected_version_id then
    raise exception 'The Schedule changed after this page loaded. Refresh it before publishing your edits.';
  end if;

  select * into active_version
  from public.course_schedule_versions
  where id = course_record.active_schedule_version_id
    and schedule_id = stable_schedule.id;
  if not found then raise exception 'The active Course Schedule Version could not be found.'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_patterns) pattern
    where btrim(coalesce(pattern ->> 'stablePatternKey', ''))
        !~ '^[a-z0-9][a-z0-9._:-]{2,119}$'
      or coalesce(pattern ->> 'weekday', '') !~ '^[0-6]$'
      or coalesce(pattern ->> 'localStartTime', '')
        !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(pattern ->> 'durationMinutes', '') not in ('30', '60', '90')
      or coalesce(pattern ->> 'purpose', '')
        not in ('theory', 'practice', 'review', 'exam', 'wrap_up')
      or (
        pattern ->> 'purpose' = 'theory'
        and coalesce(pattern ->> 'durationMinutes', '') not in ('60', '90')
      )
      or coalesce(pattern ->> 'position', '') !~ '^[0-9]+$'
      or (
        pattern ? 'metadata'
        and jsonb_typeof(pattern -> 'metadata') <> 'object'
      )
  ) then
    raise exception 'Every weekly slot requires a valid key, weekday, local time, duration, purpose, position, and metadata object.';
  end if;

  pattern_count := jsonb_array_length(p_patterns);
  if pattern_count <> (
      select count(distinct btrim(pattern ->> 'stablePatternKey'))
      from jsonb_array_elements(p_patterns) pattern
    ) then
    raise exception 'Every weekly slot requires a unique stable key.';
  end if;
  if pattern_count <> (
      select count(distinct (pattern ->> 'position')::integer)
      from jsonb_array_elements(p_patterns) pattern
    )
    or (select min((pattern ->> 'position')::integer)
        from jsonb_array_elements(p_patterns) pattern) <> 0
    or (select max((pattern ->> 'position')::integer)
        from jsonb_array_elements(p_patterns) pattern) <> pattern_count - 1 then
    raise exception 'Weekly slot positions must be unique and contiguous from zero.';
  end if;
  if pattern_count <> (
      select count(distinct concat(
        pattern ->> 'weekday', ':', pattern ->> 'localStartTime'
      ))
      from jsonb_array_elements(p_patterns) pattern
    ) then
    raise exception 'Two weekly slots cannot begin at the same local date and time.';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(p_patterns) pattern
    where pattern ->> 'purpose' = 'theory'
  ) then
    raise exception 'A recurring Course requires at least one weekly Theory slot.';
  end if;

  select jsonb_agg(jsonb_build_object(
    'stablePatternKey', btrim(pattern ->> 'stablePatternKey'),
    'weekday', (pattern ->> 'weekday')::integer,
    'localStartTime', pattern ->> 'localStartTime',
    'durationMinutes', (pattern ->> 'durationMinutes')::integer,
    'purpose', pattern ->> 'purpose',
    'position', (pattern ->> 'position')::integer,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'advancesCurriculum', pattern ->> 'purpose' = 'theory',
    'metadata', coalesce(pattern -> 'metadata', '{}'::jsonb)
  ) order by (pattern ->> 'position')::integer)
  into normalized_patterns
  from jsonb_array_elements(p_patterns) pattern;

  before_snapshot := jsonb_build_object(
    'effectiveFrom', (
      select min(pattern.effective_from)
      from public.course_schedule_meeting_patterns pattern
      where pattern.version_id = active_version.id
    ),
    'effectiveUntil', (
      select max(pattern.effective_until)
      from public.course_schedule_meeting_patterns pattern
      where pattern.version_id = active_version.id
    ),
    'timeZone', active_version.time_zone,
    'patterns', public.course_schedule_meeting_patterns_json(active_version.id)
  );
  after_snapshot := jsonb_build_object(
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'timeZone', active_version.time_zone,
    'patterns', normalized_patterns
  );
  if before_snapshot = after_snapshot then
    raise exception 'Publishing an identical recurring meeting pattern is not allowed.';
  end if;

  insert into public.course_schedule_versions (
    schedule_id, version_number, previous_version_id, legacy_schedule_id,
    name, time_zone, cadence, source_schema_version, source_snapshot,
    reason, created_by, metadata
  )
  select
    stable_schedule.id,
    coalesce(max(version.version_number), 0) + 1,
    active_version.id,
    active_version.legacy_schedule_id,
    active_version.name,
    active_version.time_zone,
    active_version.cadence || jsonb_build_object(
      'type', 'weekly_meeting_pattern',
      'meetingPatternCount', pattern_count,
      'meetingPatternEffectiveFrom', p_effective_from,
      'meetingPatternEffectiveUntil', p_effective_until
    ),
    greatest(active_version.source_schema_version, 4),
    active_version.source_snapshot || jsonb_build_object(
      'meetingPatterns', normalized_patterns,
      'meetingPatternEffectiveFrom', p_effective_from,
      'meetingPatternEffectiveUntil', p_effective_until
    ),
    'Recurring meeting pattern revised',
    caller_id,
    active_version.metadata || jsonb_build_object(
      'phase', '5.F.1',
      'changeScope', 'meeting_pattern',
      'expectedVersionId', p_expected_version_id,
      'idempotencyKey', normalized_idempotency_key
    )
  from public.course_schedule_versions version
  where version.schedule_id = stable_schedule.id
  returning * into new_version;

  insert into public.course_schedule_items (
    version_id, stable_item_key, legacy_schedule_session_id, title,
    scheduled_date, end_date, position, item_state, source_snapshot,
    item_kind, curriculum_node_id
  )
  select
    new_version.id, item.stable_item_key, item.legacy_schedule_session_id, item.title,
    item.scheduled_date, item.end_date, item.position, item.item_state,
    item.source_snapshot, item.item_kind, item.curriculum_node_id
  from public.course_schedule_items item
  where item.version_id = active_version.id
  order by item.position, item.id;

  for raw_pattern in
    select pattern
    from jsonb_array_elements(normalized_patterns) pattern
    order by (pattern ->> 'position')::integer
  loop
    insert into public.course_schedule_meeting_patterns (
      version_id, stable_pattern_key, weekday, local_start_time,
      duration_minutes, purpose, position, effective_from, effective_until,
      metadata
    ) values (
      new_version.id,
      raw_pattern ->> 'stablePatternKey',
      (raw_pattern ->> 'weekday')::smallint,
      (raw_pattern ->> 'localStartTime')::time,
      (raw_pattern ->> 'durationMinutes')::smallint,
      raw_pattern ->> 'purpose',
      (raw_pattern ->> 'position')::integer,
      p_effective_from,
      p_effective_until,
      raw_pattern -> 'metadata'
    );
  end loop;

  insert into public.course_schedule_meeting_pattern_changes (
    course_id, version_id, previous_version_id, student_explanation,
    private_staff_note, before_snapshot, after_snapshot, actor_user_id
  ) values (
    course_record.id, new_version.id, active_version.id,
    normalized_student_explanation, normalized_private_staff_note,
    before_snapshot, after_snapshot, caller_id
  );

  update public.student_courses
  set active_schedule_version_id = new_version.id
  where id = course_record.id;

  insert into public.course_schedule_notification_events (
    recipient_user_id, actor_user_id, course_id, schedule_version_id,
    event_type, payload
  )
  select recipient.user_id, caller_id, course_record.id, new_version.id,
    'schedule_version_published',
    jsonb_build_object(
      'courseId', course_record.id,
      'courseTitle', course_record.title,
      'versionId', new_version.id,
      'versionNumber', new_version.version_number,
      'actorId', caller_id,
      'changeScope', 'meeting_pattern',
      'patternCount', pattern_count,
      'effectiveFrom', p_effective_from,
      'effectiveUntil', p_effective_until
    )
  from (
    select course_record.student_id as user_id
    union select course_record.tutor_id
    union select course_record.mentor_id where course_record.mentor_id is not null
  ) recipient;

  response_payload := jsonb_build_object(
    'courseId', course_record.id,
    'scheduleId', stable_schedule.id,
    'previousVersionId', active_version.id,
    'publishedVersionId', new_version.id,
    'versionNumber', new_version.version_number,
    'changeScope', 'meeting_pattern',
    'patternCount', pattern_count,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'idempotentReplay', false
  );

  insert into public.course_schedule_publish_commands (
    schedule_id, actor_user_id, idempotency_key, expected_version_id,
    published_version_id, request_payload, response_payload
  ) values (
    stable_schedule.id, caller_id, normalized_idempotency_key,
    p_expected_version_id, new_version.id, request_payload, response_payload
  );

  return response_payload;
end;
$$;

create or replace function public.get_my_course_meeting_pattern(
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  staff_history boolean;
  can_edit boolean;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open a Course meeting pattern.';
  end if;
  if not public.current_user_can_read_student_course(p_course_id) then
    raise exception 'You do not have access to this Course meeting pattern.';
  end if;

  staff_history := public.current_user_can_read_course_schedule_history(p_course_id);
  can_edit := public.current_user_can_edit_course_schedule(p_course_id);

  select jsonb_build_object(
    'schemaVersion', 1,
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'serviceModel', course.service_model
    ),
    'schedule', jsonb_build_object(
      'id', schedule.id,
      'activeVersionId', active_version.id,
      'versionNumber', active_version.version_number,
      'timeZone', active_version.time_zone
    ),
    'recurrence', jsonb_build_object(
      'status', case
        when course.service_model <> 'recurring' then 'not_applicable'
        when exists (
          select 1 from public.course_schedule_meeting_patterns pattern
          where pattern.version_id = active_version.id
        ) then 'configured'
        else 'review_required'
      end,
      'patterns', public.course_schedule_meeting_patterns_json(active_version.id),
      'change', (
        select jsonb_build_object(
          'studentExplanation', change.student_explanation,
          'privateStaffNote', case when staff_history then change.private_staff_note else null end,
          'actorUserId', case when staff_history then change.actor_user_id else null end,
          'createdAt', change.created_at
        )
        from public.course_schedule_meeting_pattern_changes change
        join public.course_schedule_versions changed_version
          on changed_version.id = change.version_id
        where changed_version.schedule_id = schedule.id
          and changed_version.version_number <= active_version.version_number
        order by changed_version.version_number desc
        limit 1
      )
    ),
    'permissions', jsonb_build_object(
      'canEditMeetingPattern', can_edit and course.service_model = 'recurring',
      'canReadPatternHistory', staff_history
    ),
    'versions', case when staff_history then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'status', case when version.id = active_version.id then 'active' else 'superseded' end,
        'patternCount', (
          select count(*) from public.course_schedule_meeting_patterns pattern
          where pattern.version_id = version.id
        ),
        'patterns', public.course_schedule_meeting_patterns_json(version.id)
      ) order by version.version_number desc)
      from public.course_schedule_versions version
      where version.schedule_id = schedule.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'featureStatus', jsonb_build_object(
      'meetingPatternContract', 'active_phase_5f1',
      'slotGeneration', 'planned_phase_5f2',
      'outcomesAndRequeue', 'planned_phase_5f3'
    )
  ) into payload
  from public.student_courses course
  join public.course_schedules schedule on schedule.course_id = course.id
  join public.course_schedule_versions active_version
    on active_version.id = course.active_schedule_version_id
  where course.id = p_course_id;

  if payload is null then raise exception 'The required Course Schedule could not be found.'; end if;
  return payload;
end;
$$;

alter table public.course_schedule_meeting_patterns enable row level security;
alter table public.course_schedule_meeting_pattern_changes enable row level security;

create policy "Active Students and authorized staff read meeting patterns"
on public.course_schedule_meeting_patterns for select to authenticated
using (exists (
  select 1
  from public.course_schedule_versions version
  join public.course_schedules schedule on schedule.id = version.schedule_id
  join public.student_courses course on course.id = schedule.course_id
  where version.id = course_schedule_meeting_patterns.version_id
    and (
      (
        course.student_id = (select auth.uid())
        and course.active_schedule_version_id = version.id
      )
      or public.current_user_can_read_course_schedule_history(course.id)
    )
));

create policy "Authorized staff read meeting-pattern audit"
on public.course_schedule_meeting_pattern_changes for select to authenticated
using (public.current_user_can_read_course_schedule_history(course_id));

revoke all on public.course_schedule_meeting_patterns from public, anon, authenticated;
revoke all on public.course_schedule_meeting_pattern_changes from public, anon, authenticated;
grant select on public.course_schedule_meeting_patterns to authenticated;
grant select on public.course_schedule_meeting_pattern_changes to authenticated;
grant select on public.course_schedule_meeting_patterns to service_role;
grant select on public.course_schedule_meeting_pattern_changes to service_role;

revoke all on function public.reject_course_schedule_meeting_pattern_mutation()
  from public, anon, authenticated;
revoke all on function public.inherit_course_schedule_meeting_patterns()
  from public, anon, authenticated;
revoke all on function public.course_schedule_meeting_patterns_json(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_course_meeting_pattern_version(
  uuid, uuid, date, date, jsonb, text, text, text
) from public, anon, authenticated;
revoke all on function public.get_my_course_meeting_pattern(uuid)
  from public, anon, authenticated;

grant execute on function public.publish_course_meeting_pattern_version(
  uuid, uuid, date, date, jsonb, text, text, text
) to authenticated;
grant execute on function public.get_my_course_meeting_pattern(uuid)
  to authenticated;

comment on table public.course_schedule_meeting_patterns is
  'Phase 5.F.1 immutable weekly meeting patterns owned by one Course Schedule Version. These rows are academic intent, not Classes, attendance, Calendar bookings, or billing facts.';
comment on table public.course_schedule_meeting_pattern_changes is
  'One immutable public/private audit snapshot for a reasoned recurring meeting-pattern successor Version.';
comment on function public.publish_course_meeting_pattern_version(
  uuid, uuid, date, date, jsonb, text, text, text
) is
  'Publishes a complete recurring weekly pattern as an immutable successor Schedule Version with stale-save rejection, idempotency, audit, and participant notifications.';
comment on function public.get_my_course_meeting_pattern(uuid) is
  'Role-aware Phase 5.F.1 recurrence projection. Students receive only the active pattern and public explanation; assigned staff may inspect superseded pattern history and private notes.';
