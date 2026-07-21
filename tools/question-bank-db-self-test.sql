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
  \echo 'Required synthetic Question Bank actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select public.save_exam_draft($bundle$
{
  "schema":"kelp-exam-persistence-bundle-v1",
  "exam":{"schema":"kelp-exam-definition-v1","id":"phase5-db-bank-exam","title":"Phase 5 mechanics bank","questionIds":["phase5-db-easy-q","phase5-db-challenge-q"]},
  "questions":[
    {
      "schema":"kelp-exam-question-record-v1",
      "id":"phase5-db-easy-q",
      "examId":"phase5-db-bank-exam",
      "position":0,
      "difficulty":"easy",
      "classificationStatus":"proposed",
      "reviewStatus":"draft",
      "content":{"id":"phase5-db-easy-q","name":"Average velocity","type":"numeric","prompt":"Calculate average velocity.","points":2,"difficulty":"easy","classificationStatus":"proposed","questionTypeTags":["numeric","word-problem"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000061"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000061"}
    },
    {
      "schema":"kelp-exam-question-record-v1",
      "id":"phase5-db-challenge-q",
      "examId":"phase5-db-bank-exam",
      "position":1,
      "difficulty":"challenge",
      "classificationStatus":"proposed",
      "reviewStatus":"draft",
      "content":{"id":"phase5-db-challenge-q","name":"Acceleration graph","type":"multiple-choice-graph","prompt":"Interpret the acceleration graph.","points":4,"difficulty":"challenge","classificationStatus":"proposed","questionTypeTags":["multiple-choice","graph"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000062"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000062"}
    }
  ]
}
$bundle$::jsonb);

select public.publish_exam('phase5-db-bank-exam', 'Phase 5 question-bank test.');

do $test$
declare
  result jsonb;
begin
  result := public.search_question_bank(
    '',
    '10000000-0000-4000-8000-000000000023'::uuid,
    null,
    null,
    1,
    12
  );
  if (result ->> 'total')::integer <> 2 then
    raise exception 'The ancestor curriculum search did not return both descendant questions.';
  end if;
  if result #>> '{items,0,id}' <> 'phase5-db-easy-q'
    or result #>> '{items,1,id}' <> 'phase5-db-challenge-q'
  then
    raise exception 'Question-bank results were not ordered easiest to hardest.';
  end if;

  result := public.search_question_bank(
    'velocity',
    null,
    array['easy'],
    array['numeric'],
    1,
    12
  );
  if (result ->> 'total')::integer <> 1
    or result #>> '{items,0,id}' <> 'phase5-db-easy-q'
  then
    raise exception 'Question-bank text, difficulty, or category filtering failed.';
  end if;

  result := public.get_question_bank_item('phase5-db-easy-q');
  if result #>> '{content,primaryCurriculumNodeId}' <> '10000000-0000-4000-8000-000000000061'
    or result #>> '{content,questionTypeTags,0}' <> 'numeric'
  then
    raise exception 'The complete question-bank item lost its curriculum or category contract.';
  end if;

  if not exists (
    select 1 from public.exam_question_curriculum_links
    where question_id = 'phase5-db-easy-q'
      and curriculum_node_id = '10000000-0000-4000-8000-000000000061'::uuid
      and is_primary
      and classification_status = 'reviewed'
  ) then
    raise exception 'The reviewed primary curriculum link was not synchronized.';
  end if;
end;
$test$;

select public.save_exam_draft($bundle$
{
  "schema":"kelp-exam-persistence-bundle-v1",
  "exam":{"schema":"kelp-exam-definition-v1","id":"phase5-db-unclassified-exam","title":"Missing bank labels","questionIds":["phase5-db-unclassified-q"]},
  "questions":[{
    "schema":"kelp-exam-question-record-v1",
    "id":"phase5-db-unclassified-q",
    "examId":"phase5-db-unclassified-exam",
    "position":0,
    "difficulty":"easy",
    "classificationStatus":"proposed",
    "reviewStatus":"draft",
    "content":{"id":"phase5-db-unclassified-q","type":"short-answer","prompt":"Explain.","difficulty":"easy","classificationStatus":"proposed"}
  }]
}
$bundle$::jsonb);

do $test$
begin
  perform public.publish_exam('phase5-db-unclassified-exam', 'This must fail.');
  raise exception 'Expected publication without question-bank classification to fail.';
exception when others then
  if sqlerrm = 'Expected publication without question-bank classification to fail.' then raise; end if;
  if sqlerrm not like '%Classify every question by question-bank category%'
    and sqlerrm not like '%Assign every question to a curriculum track or topic%'
  then raise; end if;
end;
$test$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);

do $test$
begin
  perform public.search_question_bank('', null, null, null, 1, 12);
  raise exception 'Expected tutor question-bank access to fail.';
exception when others then
  if sqlerrm = 'Expected tutor question-bank access to fail.' then raise; end if;
  if sqlerrm not like '%assigned roles cannot search the question bank%' then raise; end if;
end;
$test$;

rollback;

\echo Question-bank database self-test passed and rolled back.
