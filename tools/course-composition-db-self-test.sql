\set ON_ERROR_STOP on

\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif

select (
  :'mentor_id'::uuid <> :'tutor_id'::uuid
  and exists (select 1 from public.profiles where id = :'mentor_id'::uuid)
  and exists (select 1 from public.profiles where id = :'tutor_id'::uuid)
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic course-composition actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select public.save_exam_draft($bundle$
{
  "schema":"kelp-exam-persistence-bundle-v1",
  "exam":{"schema":"kelp-exam-definition-v1","id":"phase6-db-source-exam","title":"Phase 6 source questions","questionIds":["phase6-db-challenge-q","phase6-db-easy-q","phase6-db-very-easy-q"]},
  "questions":[
    {
      "schema":"kelp-exam-question-record-v1","id":"phase6-db-challenge-q","examId":"phase6-db-source-exam","position":0,"difficulty":"challenge","classificationStatus":"proposed","reviewStatus":"draft",
      "content":{"id":"phase6-db-challenge-q","name":"Challenge acceleration","type":"multiple-choice-graph","prompt":"Interpret the acceleration graph.","points":5,"difficulty":"challenge","classificationStatus":"proposed","questionTypeTags":["multiple-choice","graph"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000062"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000062"}
    },
    {
      "schema":"kelp-exam-question-record-v1","id":"phase6-db-easy-q","examId":"phase6-db-source-exam","position":1,"difficulty":"easy","classificationStatus":"proposed","reviewStatus":"draft",
      "content":{"id":"phase6-db-easy-q","name":"Average velocity","type":"numeric","prompt":"Calculate average velocity.","points":2,"difficulty":"easy","classificationStatus":"proposed","questionTypeTags":["numeric","word-problem"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000061"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000061"}
    },
    {
      "schema":"kelp-exam-question-record-v1","id":"phase6-db-very-easy-q","examId":"phase6-db-source-exam","position":2,"difficulty":"very-easy","classificationStatus":"proposed","reviewStatus":"draft",
      "content":{"id":"phase6-db-very-easy-q","name":"Velocity meaning","type":"true-false","prompt":"Velocity contains direction.","points":1,"difficulty":"very-easy","classificationStatus":"proposed","questionTypeTags":["true-false"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000061"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000061"}
    }
  ]
}
$bundle$::jsonb);

select public.publish_exam('phase6-db-source-exam', 'Phase 6 composition test sources.');

create temporary table phase6_saved_course as
select public.save_course_composition($course$
{
  "schema":"kelp-course-composition-v1",
  "id":"20000000-0000-4000-8000-000000000001",
  "title":"Mechanics progression",
  "description":"An easiest-to-hardest reusable course draft.",
  "primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000023",
  "questionIds":["phase6-db-challenge-q","phase6-db-easy-q","phase6-db-very-easy-q"]
}
$course$::jsonb) as payload;

do $test$
declare
  saved jsonb := (select payload from phase6_saved_course limit 1);
  listed jsonb;
begin
  if saved ->> 'ownerId' <> auth.uid()::text then
    raise exception 'Course ownership was not derived from the authenticated composer.';
  end if;
  if saved #>> '{questionIds,0}' <> 'phase6-db-very-easy-q'
    or saved #>> '{questionIds,1}' <> 'phase6-db-easy-q'
    or saved #>> '{questionIds,2}' <> 'phase6-db-challenge-q'
  then
    raise exception 'The course was not normalized from easiest to hardest.';
  end if;
  if saved #>> '{curriculumPath,2,name}' <> 'Physics' then
    raise exception 'The course curriculum path was not preserved.';
  end if;
  if not exists (
    select 1 from public.course_composition_items
    where course_id = '20000000-0000-4000-8000-000000000001'::uuid
      and question_id = 'phase6-db-very-easy-q' and position = 0
  ) then
    raise exception 'The normalized course item order was not stored.';
  end if;
  listed := public.list_my_course_compositions('active');
  if jsonb_array_length(listed) <> 1
    or listed #>> '{0,questionCount}' <> '3'
  then
    raise exception 'The author course library did not return the saved draft.';
  end if;
end;
$test$;

create temporary table phase6_copied_course as
select (public.duplicate_course_composition(
  '20000000-0000-4000-8000-000000000001'::uuid
) ->> 'id')::uuid as course_id;

do $test$
declare
  copied_course_id uuid := (select course_id from phase6_copied_course limit 1);
begin
  if copied_course_id = '20000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Course duplication reused the source ID.';
  end if;
  if (select count(*) from public.course_composition_items where course_id = copied_course_id) <> 3 then
    raise exception 'Course duplication did not preserve its question references.';
  end if;
end;
$test$;

do $test$
begin
  perform public.save_course_composition($course$
  {
    "schema":"kelp-course-composition-v1",
    "id":"20000000-0000-4000-8000-000000000002",
    "title":"Invalid cross-curriculum course",
    "description":"",
    "primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000022",
    "questionIds":["phase6-db-easy-q"]
  }
  $course$::jsonb);
  raise exception 'Expected cross-curriculum course composition to fail.';
exception when others then
  if sqlerrm = 'Expected cross-curriculum course composition to fail.' then raise; end if;
  if sqlerrm not like '%approved question beneath the selected curriculum path%' then raise; end if;
end;
$test$;

select public.archive_course_composition('20000000-0000-4000-8000-000000000001'::uuid);

do $test$
begin
  perform public.save_course_composition($course$
  {
    "schema":"kelp-course-composition-v1",
    "id":"20000000-0000-4000-8000-000000000001",
    "title":"Overwrite archived course",
    "description":"",
    "primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000023",
    "questionIds":[]
  }
  $course$::jsonb);
  raise exception 'Expected an archived course overwrite to fail.';
exception when others then
  if sqlerrm = 'Expected an archived course overwrite to fail.' then raise; end if;
  if sqlerrm not like '%Archived courses cannot be overwritten%' then raise; end if;
end;
$test$;

select public.delete_course_composition('20000000-0000-4000-8000-000000000001'::uuid);

do $test$
begin
  if not exists (select 1 from public.exam_questions where id = 'phase6-db-easy-q') then
    raise exception 'Deleting a course incorrectly deleted its source question.';
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);

do $test$
begin
  perform public.list_my_course_compositions('active');
  raise exception 'Expected tutor course-composition access to fail.';
exception when others then
  if sqlerrm = 'Expected tutor course-composition access to fail.' then raise; end if;
  if sqlerrm not like '%assigned roles cannot manage course drafts%' then raise; end if;
end;
$test$;

rollback;

\echo Course-composition database self-test passed and rolled back.
