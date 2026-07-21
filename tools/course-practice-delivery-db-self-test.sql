\set ON_ERROR_STOP on

\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?student_id}
\else
  \echo 'Missing required actor variable: student_id'
  \quit 3
\endif
\if :{?outsider_id}
\else
  \echo 'Missing required actor variable: outsider_id'
  \quit 3
\endif

select (
  :'mentor_id'::uuid <> :'student_id'::uuid
  and :'mentor_id'::uuid <> :'outsider_id'::uuid
  and :'student_id'::uuid <> :'outsider_id'::uuid
  and exists (select 1 from public.profiles where id = :'mentor_id'::uuid)
  and exists (select 1 from public.profiles where id = :'student_id'::uuid)
  and exists (select 1 from public.profiles where id = :'outsider_id'::uuid)
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'student_id'::uuid and role_key = 'student' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'outsider_id'::uuid and role_key = 'student' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic course-practice actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select public.save_exam_draft($bundle$
{
  "schema":"kelp-exam-persistence-bundle-v1",
  "exam":{"schema":"kelp-exam-definition-v1","id":"phase7-db-source-exam","title":"Phase 7 practice source","questionIds":["phase7-db-choice-q","phase7-db-essay-q"]},
  "questions":[
    {
      "schema":"kelp-exam-question-record-v1","id":"phase7-db-choice-q","examId":"phase7-db-source-exam","position":0,"difficulty":"very-easy","classificationStatus":"proposed","reviewStatus":"draft",
      "content":{"id":"phase7-db-choice-q","name":"Velocity direction","type":"multiple-choice","prompt":"Which option includes direction?","points":2,"options":["Speed","Velocity"],"correctOptionIndex":1,"answer":"Velocity includes direction.","answerKey":"Legacy imported secret","difficulty":"very-easy","classificationStatus":"proposed","questionTypeTags":["multiple-choice"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000061"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000061"}
    },
    {
      "schema":"kelp-exam-question-record-v1","id":"phase7-db-essay-q","examId":"phase7-db-source-exam","position":1,"difficulty":"difficult","classificationStatus":"proposed","reviewStatus":"draft",
      "content":{"id":"phase7-db-essay-q","name":"Explain acceleration","type":"essay","prompt":"Explain the relationship between velocity and acceleration.","points":4,"answer":"A complete explanation should relate acceleration to velocity change over time.","teacherNotes":"Review the sign convention.","difficulty":"difficult","classificationStatus":"proposed","questionTypeTags":["essay","word-problem"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000062"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000062"}
    }
  ]
}
$bundle$::jsonb);

select public.publish_exam('phase7-db-source-exam', 'Phase 7 assignment snapshot source.');

select public.save_course_composition($course$
{
  "schema":"kelp-course-composition-v1",
  "id":"20000000-0000-4000-8000-000000000071",
  "title":"Immutable mechanics practice",
  "description":"Snapshot safety characterization.",
  "primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000023",
  "questionIds":["phase7-db-essay-q","phase7-db-choice-q"]
}
$course$::jsonb);

create temporary table phase7_schedule as
select public.upsert_student_learning_schedule(:'student_id'::uuid, $schedule$
{
  "schemaVersion":1,
  "id":"phase7-student-schedule",
  "name":"Student mechanics schedule",
  "timeZone":"America/Sao_Paulo",
  "startDate":"2026-08-01",
  "endDate":"2026-08-08",
  "sessions":[
    {"id":"phase7-session-velocity","title":"Velocity practice","startDate":"2026-08-01","endDate":"2026-08-01"},
    {"id":"phase7-session-acceleration","title":"Acceleration practice","startDate":"2026-08-08","endDate":"2026-08-08"}
  ]
}
$schedule$::jsonb) as payload;

create temporary table phase7_assignment as
select public.assign_course_to_schedule_session(
  '20000000-0000-4000-8000-000000000071'::uuid,
  :'student_id'::uuid,
  ((select payload from phase7_schedule) #>> '{sessions,0,id}')::uuid
) as payload;

set local role postgres;

do $test$
declare
  target_assignment_id uuid := ((select payload from phase7_assignment) ->> 'id')::uuid;
  choice_delivery jsonb;
  choice_grading jsonb;
  essay_delivery jsonb;
begin
  if (select payload #>> '{questionCount}' from phase7_assignment) <> '2' then
    raise exception 'The assignment did not freeze both course questions.';
  end if;
  select delivery_snapshot, grading_snapshot into choice_delivery, choice_grading
  from public.course_assignment_items item
  where item.assignment_id = target_assignment_id and item.source_question_id = 'phase7-db-choice-q';
  if choice_delivery ? 'correctOptionIndex'
    or choice_delivery ? 'answer'
    or choice_delivery ? 'answerKey'
  then
    raise exception 'The student delivery snapshot leaked a choice answer key.';
  end if;
  if choice_grading ->> 'correctOptionIndex' <> '1' or coalesce(choice_grading ->> 'answer', '') = '' then
    raise exception 'The private grading snapshot did not preserve its answer key.';
  end if;
  select delivery_snapshot into essay_delivery
  from public.course_assignment_items item
  where item.assignment_id = target_assignment_id and item.source_question_id = 'phase7-db-essay-q';
  if essay_delivery ? 'answer' or essay_delivery ? 'teacherNotes' then
    raise exception 'The student delivery snapshot leaked essay grading guidance.';
  end if;
end;
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'student_id', true);

do $test$
declare
  listed jsonb := public.list_my_practice_assignments();
  delivered jsonb := public.get_my_practice_assignment(((select payload from phase7_assignment) ->> 'id')::uuid);
begin
  if jsonb_array_length(listed) <> 1 or listed #>> '{0,courseTitle}' <> 'Immutable mechanics practice' then
    raise exception 'The assigned student practice library is incorrect.';
  end if;
  if delivered #>> '{questions,0,id}' <> 'phase7-db-choice-q'
    or delivered #>> '{questions,1,id}' <> 'phase7-db-essay-q'
  then
    raise exception 'The student delivery order did not preserve easiest-to-hardest assignment order.';
  end if;
  if delivered::text like '%correctOptionIndex%'
    or delivered::text like '%teacherNotes%'
    or delivered::text like '%Velocity includes direction%'
  then
    raise exception 'The student assignment RPC leaked private grading data.';
  end if;
end;
$test$;

create temporary table phase7_attempt as
select public.start_or_resume_course_practice_attempt(
  ((select payload from phase7_assignment) ->> 'id')::uuid
) as payload;

select public.save_my_course_practice_progress(
  ((select payload from phase7_attempt) ->> 'id')::uuid,
  '{"phase7-db-choice-q":"1","phase7-db-essay-q":"Acceleration measures velocity change over time."}'::jsonb
);

create temporary table phase7_submitted as
select public.submit_my_course_practice_attempt(
  ((select payload from phase7_attempt) ->> 'id')::uuid,
  '{"phase7-db-choice-q":"1","phase7-db-essay-q":"Acceleration measures velocity change over time."}'::jsonb
) as payload;

do $test$
declare
  submitted jsonb := (select payload from phase7_submitted);
  second_attempt jsonb;
begin
  if submitted #>> '{status}' <> 'submitted'
    or submitted #>> '{result,autoScore}' <> '2'
    or submitted #>> '{result,autoMaxPoints}' <> '2'
    or submitted #>> '{result,pendingReviewCount}' <> '1'
  then
    raise exception 'Practice submission grading or pending-review accounting is incorrect.';
  end if;
  if public.list_my_practice_assignments() #>> '{0,status}' <> 'completed' then
    raise exception 'Submitting practice did not complete the assignment lifecycle.';
  end if;
  second_attempt := public.start_or_resume_course_practice_attempt(
    ((select payload from phase7_assignment) ->> 'id')::uuid
  );
  if second_attempt #>> '{attemptNumber}' <> '2' then
    raise exception 'A submitted activity could not start an independent repeat attempt.';
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub', :'outsider_id', true);

do $test$
begin
  perform public.get_my_practice_assignment(((select payload from phase7_assignment) ->> 'id')::uuid);
  raise exception 'Expected another student to be denied the assignment snapshot.';
exception when others then
  if sqlerrm = 'Expected another student to be denied the assignment snapshot.' then raise; end if;
  if sqlerrm not like '%assigned practice activity could not be found%' then raise; end if;
end;
$test$;

do $test$
begin
  perform public.list_course_assignment_students();
  raise exception 'Expected an outsider without course.assign to be denied.';
exception when others then
  if sqlerrm = 'Expected an outsider without course.assign to be denied.' then raise; end if;
  if sqlerrm not like '%cannot assign course practice%' then raise; end if;
end;
$test$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.archive_course_composition('20000000-0000-4000-8000-000000000071'::uuid);
select public.delete_course_composition('20000000-0000-4000-8000-000000000071'::uuid);

set local role postgres;

do $test$
begin
  if not exists (
    select 1 from public.course_assignments assignment
    join public.course_assignment_items item on item.assignment_id = assignment.id
    where assignment.id = ((select payload from phase7_assignment) ->> 'id')::uuid
      and assignment.course_id is null
      and item.source_question_id = 'phase7-db-choice-q'
  ) then
    raise exception 'Deleting the source course damaged its immutable assignment snapshot.';
  end if;
end;
$test$;

rollback;

\echo Course-practice delivery database self-test passed and rolled back.
