-- Phase 4.C: persistent Classroom navigation status and staff-only visibility
-- for the supervisory Mentor. Classroom areas remain a single authorized
-- shell; feature-owned content keeps its own later authorization boundary.

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
    'schemaVersion', 5,
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
    'student', jsonb_build_object(
      'id', student.id,
      'name', coalesce(nullif(btrim(student.full_name), ''), 'Student')
    ),
    'subject', jsonb_build_object('id', subject.id, 'name', subject.name),
    'focus', jsonb_build_object('id', focus.id, 'name', focus.name),
    'tutor', jsonb_build_object(
      'id', tutor.id,
      'name', coalesce(nullif(btrim(tutor.full_name), ''), 'Tutor')
    ),
    'mentor', case
      when membership.membership_role in ('tutor', 'mentor')
        or public.authorization_user_has_capability(caller_id, 'relationships.manage')
        or public.authorization_user_has_capability(caller_id, 'authorization.manage')
      then jsonb_build_object(
        'id', mentor.id,
        'name', coalesce(nullif(btrim(mentor.full_name), ''), 'Mentor')
      )
      else 'null'::jsonb
    end,
    'provider', jsonb_build_object(
      'kind', case
        when course.service_model = 'independent_tutor' then 'independent_tutor'
        else 'kelp'
      end,
      'label', case
        when course.service_model = 'independent_tutor' then 'Independent Tutor'
        else 'Kelp Tutoring'
      end
    ),
    'schedule', jsonb_build_object(
      'linkageStatus', case when linked_schedule.id is null then 'missing' else 'linked' end,
      'id', linked_schedule.id,
      'name', linked_schedule.name,
      'recordStatus', linked_schedule.status,
      'timeZone', linked_schedule.time_zone,
      'sessionCount', coalesce(linked_schedule.session_count, 0),
      'firstSessionDate', linked_schedule.first_session_date,
      'lastSessionDate', linked_schedule.last_session_date,
      'versionCount', (
        select count(*)
        from public.learning_schedules schedule_version
        where schedule_version.student_course_id = course.id
      ),
      'updatedAt', linked_schedule.updated_at
    ),
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
        'tutorAssignment', 'planned_phase_6',
        'meetingSchedule', 'planned_phase_5',
        'courseEnding', 'planned_phase_5',
        'courseTermination', 'planned_phase_5'
      )
    ),
    'featureStatus', jsonb_build_object(
      'classroomOverview', 'active_phase_4b',
      'classroomNavigation', 'active_phase_4c',
      'forum', 'planned_phase_7',
      'assignments', 'planned_phase_12',
      'files', 'planned_phase_4e',
      'reportCards', 'planned_phase_13',
      'history', 'planned_phase_7',
      'classroomManagement', 'active_phase_4a',
      'liveClassTool', case
        when membership.status = 'active'
          and classroom.status = 'active'
          and course.status in ('active', 'wind_down')
          then 'scheduled_class_required'
        else 'unavailable_read_only'
      end
    )
  ) into payload
  from public.classrooms classroom
  join public.student_courses course on course.id = classroom.course_id
  join public.profiles student on student.id = course.student_id
  join public.profiles tutor on tutor.id = course.tutor_id
  join public.profiles mentor on mentor.id = course.mentor_id
  join public.curriculum_nodes subject on subject.id = course.subject_node_id
  join public.curriculum_nodes focus on focus.id = course.focus_node_id
  left join lateral (
    select
      schedule.id,
      schedule.name,
      schedule.time_zone,
      schedule.status,
      schedule.updated_at,
      (
        select count(*)
        from public.learning_schedule_sessions session
        where session.schedule_id = schedule.id and session.status = 'active'
      ) as session_count,
      (
        select min(session.scheduled_date)
        from public.learning_schedule_sessions session
        where session.schedule_id = schedule.id and session.status = 'active'
      ) as first_session_date,
      (
        select max(session.end_date)
        from public.learning_schedule_sessions session
        where session.schedule_id = schedule.id and session.status = 'active'
      ) as last_session_date
    from public.learning_schedules schedule
    where schedule.student_course_id = course.id
    order by
      case schedule.status when 'active' then 0 else 1 end,
      schedule.updated_at desc,
      schedule.id desc
    limit 1
  ) linked_schedule on true
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
  'Authorized Phase 4.C persistent Classroom shell. Supervisory Mentor identity is staff-only; feature areas expose status without granting their later content permissions.';
