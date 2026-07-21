-- Phase 3.C: Student Classroom collections, personal archive/restore commands,
-- and state-aware persistent Classroom entry.

alter table public.learning_relationship_events
drop constraint if exists learning_relationship_events_type_check;

alter table public.learning_relationship_events
add constraint learning_relationship_events_type_check check (
  event_type in (
    'qualification_granted',
    'supervision_started',
    'course_drafted',
    'course_activated',
    'classroom_created',
    'classroom_member_joined',
    'classroom_personally_archived',
    'classroom_personally_restored'
  )
);

create or replace function public.get_my_student_classrooms()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  viewer_name text;
  payload jsonb;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to load Classrooms.';
  end if;

  select profile.full_name
  into viewer_name
  from public.profiles profile
  where profile.id = caller_id;

  if not found then
    raise exception 'The authenticated Student Profile is unavailable.';
  end if;

  with classroom_context as (
    select
      course.id as course_id,
      course.title as course_title,
      course.status as course_status,
      course.service_model,
      course.start_date,
      course.scheduled_end_date,
      course.wind_down_ends_on,
      course.ended_at as course_ended_at,
      classroom.id as classroom_id,
      classroom.status as classroom_status,
      membership.status as membership_status,
      membership.joined_at,
      membership.ended_at as membership_ended_at,
      tutor.id as tutor_id,
      coalesce(nullif(btrim(tutor.full_name), ''), 'Tutor') as tutor_name,
      subject.id as subject_id,
      subject.name as subject_name,
      focus.id as focus_id,
      focus.name as focus_name,
      coalesce(card.color_key, 'ocean') as color_key,
      card.position,
      member_preference.archived_at as personally_archived_at
    from public.student_courses course
    join public.classrooms classroom on classroom.course_id = course.id
    join lateral (
      select candidate.status, candidate.joined_at, candidate.ended_at
      from public.classroom_memberships candidate
      where candidate.classroom_id = classroom.id
        and candidate.user_id = caller_id
        and candidate.membership_role = 'student'
      order by
        case candidate.status when 'active' then 0 else 1 end,
        candidate.joined_at desc,
        candidate.id desc
      limit 1
    ) membership on true
    join public.profiles tutor on tutor.id = course.tutor_id
    join public.curriculum_nodes subject on subject.id = course.subject_node_id
    join public.curriculum_nodes focus on focus.id = course.focus_node_id
    left join public.student_classroom_card_preferences card
      on card.user_id = caller_id and card.classroom_id = classroom.id
    left join public.classroom_member_preferences member_preference
      on member_preference.user_id = caller_id
      and member_preference.classroom_id = classroom.id
    where course.student_id = caller_id
      and (
        (
          course.status in ('active', 'wind_down')
          and classroom.status = 'active'
          and membership.status = 'active'
        )
        or (
          course.status in ('completed', 'cancelled')
          and classroom.status in ('inactive', 'archived')
          and membership.status = 'ended'
        )
      )
  ),
  classified as (
    select
      context.*,
      case
        when context.course_status in ('active', 'wind_down') then 'active'
        when context.personally_archived_at is not null then 'archived'
        else 'former'
      end as collection_key,
      case
        when context.course_status = 'wind_down' then 'ending_soon'
        when context.course_status = 'active' then 'active'
        when context.personally_archived_at is not null then 'archived'
        else 'former'
      end as presentation_state,
      case
        when context.course_status in ('active', 'wind_down') then 'participating'
        else 'read_only'
      end as access_mode
    from classroom_context context
  ),
  items as (
    select
      classified.collection_key,
      classified.position,
      classified.course_ended_at,
      classified.personally_archived_at,
      classified.course_title,
      classified.classroom_id,
      jsonb_build_object(
        'courseId', classified.course_id,
        'courseTitle', classified.course_title,
        'courseStatus', classified.course_status,
        'serviceModel', classified.service_model,
        'startDate', classified.start_date,
        'scheduledEndDate', classified.scheduled_end_date,
        'windDownEndsOn', classified.wind_down_ends_on,
        'endedAt', classified.course_ended_at,
        'subject', jsonb_build_object(
          'id', classified.subject_id,
          'name', classified.subject_name
        ),
        'focus', jsonb_build_object(
          'id', classified.focus_id,
          'name', classified.focus_name
        ),
        'tutor', jsonb_build_object(
          'id', classified.tutor_id,
          'name', classified.tutor_name
        ),
        'classroom', jsonb_build_object(
          'id', classified.classroom_id,
          'status', classified.classroom_status,
          'membershipRole', 'student',
          'membershipStatus', classified.membership_status,
          'accessMode', classified.access_mode
        ),
        'card', jsonb_build_object(
          'colorKey', classified.color_key,
          'position', classified.position,
          'presentationState', classified.presentation_state,
          'personallyArchivedAt', classified.personally_archived_at
        )
      ) as item
    from classified
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'viewer', jsonb_build_object('id', caller_id, 'name', viewer_name),
    'collections', jsonb_build_object(
      'active', coalesce((
        select jsonb_agg(item order by
          coalesce(position, 2147483647), lower(course_title), classroom_id
        )
        from items where collection_key = 'active'
      ), '[]'::jsonb),
      'former', coalesce((
        select jsonb_agg(item order by
          course_ended_at desc nulls last, lower(course_title), classroom_id
        )
        from items where collection_key = 'former'
      ), '[]'::jsonb),
      'archived', coalesce((
        select jsonb_agg(item order by
          personally_archived_at desc nulls last, lower(course_title), classroom_id
        )
        from items where collection_key = 'archived'
      ), '[]'::jsonb)
    ),
    'featureStatus', jsonb_build_object(
      'classroomCollections', 'active_phase_3c',
      'archiveRestore', 'active_phase_3c',
      'nextClass', 'pending_schedule_phase',
      'homework', 'pending_assignment_phase',
      'unread', 'pending_forum_phase',
      'reportCards', 'pending_report_phase'
    )
  ) into payload;

  return payload;
end;
$$;

create or replace function public.archive_my_student_classroom(
  p_classroom_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  authorized_course_id uuid;
  authorized_course_status text;
  authorized_classroom_status text;
  prior_archived_at timestamptz;
  preference_exists boolean;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to archive a Classroom.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required.';
  end if;

  select course.id, course.status, classroom.status
  into authorized_course_id, authorized_course_status, authorized_classroom_status
  from public.classrooms classroom
  join public.student_courses course on course.id = classroom.course_id
  where classroom.id = p_classroom_id
    and course.student_id = caller_id
    and exists (
      select 1
      from public.classroom_memberships membership
      where membership.classroom_id = classroom.id
        and membership.user_id = caller_id
        and membership.membership_role = 'student'
    )
  for update of classroom;

  if not found then
    raise exception 'An authorized Student Classroom Membership is required.';
  end if;
  if authorized_course_status in ('active', 'wind_down')
    or authorized_classroom_status = 'active' then
    raise exception 'Active and wind-down Classrooms cannot be archived.';
  end if;
  if authorized_course_status not in ('completed', 'cancelled')
    or authorized_classroom_status <> 'inactive'
    or not exists (
      select 1
      from public.classroom_memberships membership
      where membership.classroom_id = p_classroom_id
        and membership.user_id = caller_id
        and membership.membership_role = 'student'
        and membership.status = 'ended'
    ) then
    raise exception 'Only an inactive retained Student Classroom can be personally archived.';
  end if;

  select preference.archived_at
  into prior_archived_at
  from public.classroom_member_preferences preference
  where preference.user_id = caller_id
    and preference.classroom_id = p_classroom_id
  for update;
  preference_exists := found;

  if preference_exists and prior_archived_at is not null then
    return public.get_my_student_classrooms();
  end if;

  if preference_exists then
    update public.classroom_member_preferences
    set archived_at = clock_timestamp()
    where user_id = caller_id and classroom_id = p_classroom_id;
  else
    insert into public.classroom_member_preferences (
      user_id, classroom_id, archived_at
    ) values (
      caller_id, p_classroom_id, clock_timestamp()
    );
  end if;

  insert into public.learning_relationship_events (
    course_id,
    classroom_id,
    actor_user_id,
    target_user_id,
    event_type
  ) values (
    authorized_course_id,
    p_classroom_id,
    caller_id,
    caller_id,
    'classroom_personally_archived'
  );

  return public.get_my_student_classrooms();
end;
$$;

create or replace function public.restore_my_student_classroom(
  p_classroom_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  authorized_course_id uuid;
  authorized_course_status text;
  authorized_classroom_status text;
  prior_archived_at timestamptz;
begin
  if caller_id is null
    or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'An active Student workspace is required to restore a Classroom.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required.';
  end if;

  select course.id, course.status, classroom.status
  into authorized_course_id, authorized_course_status, authorized_classroom_status
  from public.classrooms classroom
  join public.student_courses course on course.id = classroom.course_id
  where classroom.id = p_classroom_id
    and course.student_id = caller_id
    and exists (
      select 1
      from public.classroom_memberships membership
      where membership.classroom_id = classroom.id
        and membership.user_id = caller_id
        and membership.membership_role = 'student'
        and membership.status = 'ended'
    )
  for update of classroom;

  if not found
    or authorized_course_status not in ('completed', 'cancelled')
    or authorized_classroom_status not in ('inactive', 'archived') then
    raise exception 'An inactive retained Student Classroom is required.';
  end if;

  select preference.archived_at
  into prior_archived_at
  from public.classroom_member_preferences preference
  where preference.user_id = caller_id
    and preference.classroom_id = p_classroom_id
  for update;

  if not found or prior_archived_at is null then
    return public.get_my_student_classrooms();
  end if;

  update public.classroom_member_preferences
  set archived_at = null
  where user_id = caller_id and classroom_id = p_classroom_id;

  insert into public.learning_relationship_events (
    course_id,
    classroom_id,
    actor_user_id,
    target_user_id,
    event_type
  ) values (
    authorized_course_id,
    p_classroom_id,
    caller_id,
    caller_id,
    'classroom_personally_restored'
  );

  return public.get_my_student_classrooms();
end;
$$;

create or replace function public.get_my_classroom_space(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required to open a Classroom.';
  end if;
  if p_classroom_id is null then
    raise exception 'A Classroom is required.';
  end if;

  select jsonb_build_object(
    'schemaVersion', 2,
    'viewer', jsonb_build_object(
      'id', caller_id,
      'membershipRole', coalesce(membership.membership_role, 'administrator'),
      'membershipStatus', coalesce(membership.status, 'administrative'),
      'accessMode', case
        when membership.status = 'active'
          and classroom.status = 'active'
          and course.status in ('active', 'wind_down')
          then 'participating'
        else 'read_only'
      end,
      'canParticipate', coalesce(
        membership.status = 'active'
        and classroom.status = 'active'
        and course.status in ('active', 'wind_down'),
        false
      ),
      'personalArchived', member_preference.archived_at is not null
    ),
    'classroom', jsonb_build_object(
      'id', classroom.id,
      'status', classroom.status,
      'createdAt', classroom.created_at,
      'readOnly', not coalesce(
        membership.status = 'active'
        and classroom.status = 'active'
        and course.status in ('active', 'wind_down'),
        false
      )
    ),
    'course', jsonb_build_object(
      'id', course.id,
      'title', course.title,
      'status', course.status,
      'serviceModel', course.service_model,
      'startDate', course.start_date,
      'scheduledEndDate', course.scheduled_end_date,
      'windDownEndsOn', course.wind_down_ends_on,
      'endedAt', course.ended_at
    ),
    'subject', jsonb_build_object('id', subject.id, 'name', subject.name),
    'focus', jsonb_build_object('id', focus.id, 'name', focus.name),
    'tutor', jsonb_build_object('id', tutor.id, 'name', tutor.full_name),
    'featureStatus', jsonb_build_object(
      'forum', 'planned',
      'assignments', 'planned',
      'files', 'planned',
      'reportCards', 'planned',
      'history', 'planned',
      'liveClassTool', case
        when membership.status = 'active'
          and classroom.status = 'active'
          and course.status in ('active', 'wind_down')
          then 'schedule_bound'
        else 'unavailable_read_only'
      end
    )
  ) into payload
  from public.classrooms classroom
  join public.student_courses course on course.id = classroom.course_id
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  left join lateral (
    select candidate.membership_role, candidate.status,
      candidate.joined_at, candidate.ended_at
    from public.classroom_memberships candidate
    where candidate.classroom_id = classroom.id
      and candidate.user_id = caller_id
    order by
      case candidate.status when 'active' then 0 else 1 end,
      case candidate.membership_role
        when 'student' then 0
        when 'tutor' then 1
        when 'mentor' then 2
        else 3
      end,
      candidate.joined_at desc,
      candidate.id desc
    limit 1
  ) membership on true
  left join public.classroom_member_preferences member_preference
    on member_preference.user_id = caller_id
    and member_preference.classroom_id = classroom.id
  where classroom.id = p_classroom_id
    and (
      membership.membership_role is not null
      or public.authorization_user_has_capability(caller_id, 'authorization.manage')
    );

  if payload is null then
    raise exception 'A retained Classroom Membership is required to open this space.';
  end if;

  return payload;
end;
$$;

revoke all on function public.get_my_student_classrooms()
from public, anon, authenticated;
revoke all on function public.archive_my_student_classroom(uuid)
from public, anon, authenticated;
revoke all on function public.restore_my_student_classroom(uuid)
from public, anon, authenticated;
revoke all on function public.get_my_classroom_space(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_student_classrooms() to authenticated;
grant execute on function public.archive_my_student_classroom(uuid) to authenticated;
grant execute on function public.restore_my_student_classroom(uuid) to authenticated;
grant execute on function public.get_my_classroom_space(uuid) to authenticated;

comment on function public.get_my_student_classrooms() is
  'Student-owned Active, Former, and personally Archived Classroom collections. Deferred Card indicators are explicit feature states, not fabricated values.';
comment on function public.archive_my_student_classroom(uuid) is
  'Idempotently archives one inactive retained Classroom for the signed-in Student without mutating shared Classroom state.';
comment on function public.restore_my_student_classroom(uuid) is
  'Idempotently restores one personally archived retained Classroom for the signed-in Student.';
comment on function public.get_my_classroom_space(uuid) is
  'Membership-derived persistent Classroom shell projection with participating versus retained read-only access.';

notify pgrst, 'reload schema';
