\set ON_ERROR_STOP on

\if :{?tutor_id}
\else
  \echo 'Missing required actor variable: tutor_id'
  \quit 3
\endif
\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif

select (
  :'tutor_id'::uuid <> :'mentor_id'::uuid
  and exists (select 1 from public.profiles where id = :'tutor_id'::uuid)
  and exists (select 1 from public.profiles where id = :'mentor_id'::uuid)
  and exists (select 1 from public.user_roles where user_id = :'tutor_id'::uuid and role_key = 'tutor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic publication actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;
set local role authenticated;

select set_config('request.jwt.claim.sub', :'tutor_id', true);

select public.save_form_draft($definition$
{
  "id":"phase3-db-tutor-form",
  "version":3,
  "meta":{"title":"Phase 3 tutor review form","respondentDetails":{}},
  "settings":{"submissionPolicy":{"mode":"multiple"}},
  "blocks":[{"id":"phase3-db-q1","kind":"question","type":"short-answer","prompt":"How are you?","required":true,"options":[]}]
}
$definition$::jsonb);

do $test$
begin
  perform public.publish_form('phase3-db-tutor-form', 'This call must be rejected.');
  raise exception 'Expected tutor direct publication to fail.';
exception when others then
  if sqlerrm = 'Expected tutor direct publication to fail.' then raise; end if;
  if sqlerrm not like '%Only a mentor or administrator%' then raise; end if;
end;
$test$;

select public.submit_form_for_review('phase3-db-tutor-form');

do $test$
begin
  if not exists (
    select 1 from public.form_definitions
    where id = 'phase3-db-tutor-form'
      and review_status = 'pending_review'
      and visibility = 'private'
      and publication_mode = 'private'
  ) then
    raise exception 'Tutor form did not enter the private review queue.';
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.review_form('phase3-db-tutor-form', 'approved', 'Independent mentor approval.');

do $test$
begin
  if not exists (
    select 1 from public.form_definitions
    where id = 'phase3-db-tutor-form'
      and review_status = 'approved'
      and visibility = 'public'
      and publication_mode = 'review_approved'
      and published_by = auth.uid()
      and published_at is not null
  ) then
    raise exception 'Independent approval did not publish trusted metadata.';
  end if;
  if not exists (
    select 1 from public.content_publication_events
    where resource_type = 'form'
      and resource_id = 'phase3-db-tutor-form'
      and publication_mode = 'review_approved'
      and actor_id = auth.uid()
  ) then
    raise exception 'Independent approval did not create an audit event.';
  end if;
end;
$test$;

select public.save_form_draft($definition$
{
  "id":"phase3-db-mentor-direct-form",
  "version":3,
  "meta":{"title":"Phase 3 mentor direct form","respondentDetails":{}},
  "settings":{"submissionPolicy":{"mode":"single"}},
  "blocks":[{"id":"phase3-db-q2","kind":"question","type":"number","prompt":"Rate the lesson.","required":true,"options":[]}]
}
$definition$::jsonb);
select public.publish_form('phase3-db-mentor-direct-form', 'Mentor-owned direct publication.');

do $test$
begin
  if not exists (
    select 1 from public.form_definitions
    where id = 'phase3-db-mentor-direct-form'
      and review_status = 'approved'
      and visibility = 'public'
      and publication_mode = 'privileged_direct'
      and published_by = auth.uid()
  ) then
    raise exception 'Privileged direct publication did not publish trusted metadata.';
  end if;
  if not exists (
    select 1 from public.content_publication_events
    where resource_type = 'form'
      and resource_id = 'phase3-db-mentor-direct-form'
      and publication_mode = 'privileged_direct'
      and actor_id = auth.uid()
  ) then
    raise exception 'Privileged direct publication did not create an audit event.';
  end if;
end;
$test$;

select public.save_form_draft($definition$
{
  "id":"phase3-db-mentor-self-review",
  "version":3,
  "meta":{"title":"Phase 3 mentor self-review guard","respondentDetails":{}},
  "settings":{"submissionPolicy":{"mode":"multiple"}},
  "blocks":[{"id":"phase3-db-q3","kind":"question","type":"true-false","prompt":"Continue?","required":true,"options":[]}]
}
$definition$::jsonb);
select public.submit_form_for_review('phase3-db-mentor-self-review');

do $test$
begin
  perform public.review_form('phase3-db-mentor-self-review', 'approved', 'This call must be rejected.');
  raise exception 'Expected owner self-review to fail.';
exception when others then
  if sqlerrm = 'Expected owner self-review to fail.' then raise; end if;
  if sqlerrm not like '%reviewed by a different mentor or administrator%' then raise; end if;
end;
$test$;

select set_config('request.jwt.claim.sub', :'tutor_id', true);
select public.save_exam_draft($bundle$
{
  "schema":"kelp-exam-persistence-bundle-v1",
  "exam":{"schema":"kelp-exam-definition-v1","id":"phase3-db-tutor-exam","title":"Phase 3 tutor exam","questionIds":["phase3-db-exam-q1"]},
  "questions":[{
    "schema":"kelp-exam-question-record-v1",
    "id":"phase3-db-exam-q1",
    "examId":"phase3-db-tutor-exam",
    "position":0,
    "difficulty":"easy",
    "classificationStatus":"proposed",
    "reviewStatus":"draft",
    "content":{"id":"phase3-db-exam-q1","type":"short-answer","prompt":"Explain your reasoning.","difficulty":"easy","classificationStatus":"proposed","questionTypeTags":["short-answer"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000032"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000032"}
  }]
}
$bundle$::jsonb);

do $test$
begin
  perform public.publish_exam('phase3-db-tutor-exam', 'This call must be rejected.');
  raise exception 'Expected tutor direct exam publication to fail.';
exception when others then
  if sqlerrm = 'Expected tutor direct exam publication to fail.' then raise; end if;
  if sqlerrm not like '%Only a mentor or administrator%' then raise; end if;
end;
$test$;

select public.submit_exam_for_review('phase3-db-tutor-exam');
select set_config('request.jwt.claim.sub', :'mentor_id', true);
select public.review_exam('phase3-db-tutor-exam', 'approved', 'Independent mentor exam approval.');

do $test$
begin
  if not exists (
    select 1 from public.exam_definitions
    where id = 'phase3-db-tutor-exam'
      and review_status = 'approved'
      and visibility = 'public'
      and publication_mode = 'review_approved'
      and published_by = auth.uid()
  ) then
    raise exception 'Independent exam approval did not publish trusted metadata.';
  end if;
  if not exists (
    select 1 from public.exam_questions
    where exam_id = 'phase3-db-tutor-exam'
      and review_status = 'approved'
      and classification_status = 'reviewed'
      and content ->> 'classificationStatus' = 'reviewed'
  ) then
    raise exception 'Independent exam approval did not confirm question classification.';
  end if;
  if not exists (
    select 1 from public.content_publication_events
    where resource_type = 'exam'
      and resource_id = 'phase3-db-tutor-exam'
      and publication_mode = 'review_approved'
      and actor_id = auth.uid()
  ) then
    raise exception 'Independent exam approval did not create an audit event.';
  end if;
end;
$test$;

select public.save_exam_draft($bundle$
{
  "schema":"kelp-exam-persistence-bundle-v1",
  "exam":{"schema":"kelp-exam-definition-v1","id":"phase3-db-mentor-direct-exam","title":"Phase 3 mentor direct exam","questionIds":["phase3-db-exam-q2"]},
  "questions":[{
    "schema":"kelp-exam-question-record-v1",
    "id":"phase3-db-exam-q2",
    "examId":"phase3-db-mentor-direct-exam",
    "position":0,
    "difficulty":"challenge",
    "classificationStatus":"proposed",
    "reviewStatus":"draft",
    "content":{"id":"phase3-db-exam-q2","type":"numeric","prompt":"Calculate the result.","difficulty":"challenge","classificationStatus":"proposed","questionTypeTags":["numeric"],"curriculumNodeIds":["10000000-0000-4000-8000-000000000032"],"primaryCurriculumNodeId":"10000000-0000-4000-8000-000000000032"}
  }]
}
$bundle$::jsonb);
select public.publish_exam('phase3-db-mentor-direct-exam', 'Mentor-owned direct exam publication.');

do $test$
begin
  if not exists (
    select 1 from public.exam_definitions
    where id = 'phase3-db-mentor-direct-exam'
      and review_status = 'approved'
      and visibility = 'public'
      and publication_mode = 'privileged_direct'
      and published_by = auth.uid()
  ) then
    raise exception 'Privileged direct exam publication did not publish trusted metadata.';
  end if;
  if not exists (
    select 1 from public.exam_questions
    where exam_id = 'phase3-db-mentor-direct-exam'
      and classification_status = 'reviewed'
  ) then
    raise exception 'Privileged direct exam publication did not confirm question classification.';
  end if;
  if not exists (
    select 1 from public.content_publication_events
    where resource_type = 'exam'
      and resource_id = 'phase3-db-mentor-direct-exam'
      and publication_mode = 'privileged_direct'
      and actor_id = auth.uid()
  ) then
    raise exception 'Privileged direct exam publication did not create an audit event.';
  end if;
end;
$test$;

rollback;

\echo Content publication database self-test passed and rolled back.
