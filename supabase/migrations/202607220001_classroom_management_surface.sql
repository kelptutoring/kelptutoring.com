-- Phase 4.A: Mentor-only Classroom management entry and staged action surface.
-- This migration grants no Course mutation authority. It exposes only whether
-- the signed-in viewer may open the management area for the current Classroom.

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
    'schemaVersion', 3,
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
      'canManageClassroom', coalesce(
        membership.membership_role = 'mentor'
        and membership.status = 'active'
        and course.mentor_id = caller_id
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
    'management', jsonb_build_object(
      'access', case
        when membership.membership_role = 'mentor'
          and membership.status = 'active'
          and course.mentor_id = caller_id
          and classroom.status = 'active'
          and course.status in ('active', 'wind_down')
          then 'active'
        else 'unavailable'
      end,
      'actions', jsonb_build_object(
        'tutorAssignment', 'planned_phase_4d',
        'meetingSchedule', 'planned_phase_4b',
        'courseEnding', 'planned_course_lifecycle',
        'courseTermination', 'planned_course_lifecycle'
      )
    ),
    'featureStatus', jsonb_build_object(
      'forum', 'planned',
      'assignments', 'planned',
      'files', 'planned',
      'reportCards', 'planned',
      'history', 'planned',
      'classroomManagement', 'active_phase_4a',
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

revoke all on function public.get_my_classroom_space(uuid) from public, anon;
grant execute on function public.get_my_classroom_space(uuid) to authenticated;

comment on function public.get_my_classroom_space(uuid) is
  'Authorized persistent Classroom projection with a Mentor-only Phase 4.A management-entry capability. No management mutation is granted by this projection.';
