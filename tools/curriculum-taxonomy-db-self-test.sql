\set ON_ERROR_STOP on

\if :{?mentor_id}
\else
  \echo 'Missing required actor variable: mentor_id'
  \quit 3
\endif
\if :{?admin_id}
\else
  \echo 'Missing required actor variable: admin_id'
  \quit 3
\endif

select (
  :'mentor_id'::uuid <> :'admin_id'::uuid
  and exists (select 1 from public.profiles where id = :'mentor_id'::uuid)
  and exists (select 1 from public.profiles where id = :'admin_id'::uuid)
  and exists (select 1 from public.user_roles where user_id = :'mentor_id'::uuid and role_key = 'mentor' and status = 'active')
  and exists (select 1 from public.user_roles where user_id = :'admin_id'::uuid and role_key = 'admin' and status = 'active')
) as actors_ready \gset
\if :actors_ready
\else
  \echo 'Required synthetic curriculum actors or roles are missing. Run supabase:provision first.'
  \quit 3
\endif

begin;

select set_config('test.mentor_id', :'mentor_id', true);
select set_config('test.admin_id', :'admin_id', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'mentor_id', true);

select (public.propose_curriculum_node(
  '10000000-0000-4000-8000-000000000032'::uuid,
  'topic',
  'Forces and free-body diagrams',
  'A mentor-proposed mechanics topic.'
) ->> 'id') as proposal_id \gset
select set_config('test.proposal_id', :'proposal_id', true);

do $test$
begin
  if not exists (
    select 1 from public.curriculum_taxonomy_proposals
    where id = current_setting('test.proposal_id')::uuid
      and proposer_id = auth.uid()
      and parent_id = '10000000-0000-4000-8000-000000000032'::uuid
      and node_type = 'topic'
      and status = 'pending'
  ) then
    raise exception 'Mentor proposal did not enter the pending governance queue.';
  end if;
  if not exists (
    select 1 from public.curriculum_nodes
    where id = '10000000-0000-4000-8000-000000000061'::uuid
      and status = 'active'
  ) then
    raise exception 'Mentor cannot read the active canonical taxonomy.';
  end if;
end;
$test$;

do $test$
begin
  perform public.create_curriculum_node(
    '10000000-0000-4000-8000-000000000032'::uuid,
    'topic', 'Mentor direct node', ''
  );
  raise exception 'Expected mentor canonical creation to fail.';
exception when others then
  if sqlerrm = 'Expected mentor canonical creation to fail.' then raise; end if;
  if sqlerrm not like '%Only a taxonomy administrator%' then raise; end if;
end;
$test$;

select set_config('request.jwt.claim.sub', :'admin_id', true);

select public.review_curriculum_proposal(
  :'proposal_id'::uuid,
  'approved',
  'Fits the mechanics hierarchy.'
);

do $test$
begin
  if not exists (
    select 1
    from public.curriculum_taxonomy_proposals p
    join public.curriculum_nodes n on n.id = p.applied_node_id
    where p.id = current_setting('test.proposal_id')::uuid
      and p.status = 'approved'
      and p.reviewer_id = auth.uid()
      and n.source_proposal_id = p.id
      and n.created_by = current_setting('test.mentor_id')::uuid
      and n.approved_by = auth.uid()
      and n.status = 'active'
  ) then
    raise exception 'Administrator approval did not create and link a canonical node.';
  end if;
  if not exists (
    select 1 from public.curriculum_taxonomy_events
    where proposal_id = current_setting('test.proposal_id')::uuid
      and event_type = 'proposal_approved'
      and actor_id = auth.uid()
  ) then
    raise exception 'Proposal approval did not append a taxonomy audit event.';
  end if;
end;
$test$;

select (public.create_curriculum_node(
  '10000000-0000-4000-8000-000000000032'::uuid,
  'topic',
  'Temporary administrator leaf',
  'Created only inside the rolled-back database test.'
) ->> 'id') as direct_node_id \gset
select set_config('test.direct_node_id', :'direct_node_id', true);

select public.update_curriculum_node(
  :'direct_node_id'::uuid,
  'Renamed administrator leaf',
  'Stable identity after a label change.',
  900
);

select public.archive_curriculum_node(:'direct_node_id'::uuid);

do $test$
begin
  if not exists (
    select 1 from public.curriculum_nodes
    where id = current_setting('test.direct_node_id')::uuid
      and name = 'Renamed administrator leaf'
      and sort_order = 900
      and status = 'archived'
      and archived_at is not null
  ) then
    raise exception 'Canonical node update/archive did not preserve its stable identity.';
  end if;
end;
$test$;

do $test$
begin
  perform public.archive_curriculum_node('10000000-0000-4000-8000-000000000032'::uuid);
  raise exception 'Expected a parent with active children to resist archival.';
exception when others then
  if sqlerrm = 'Expected a parent with active children to resist archival.' then raise; end if;
  if sqlerrm not like '%active children first%' then raise; end if;
end;
$test$;

rollback;

\echo Curriculum taxonomy database self-test passed and rolled back.
