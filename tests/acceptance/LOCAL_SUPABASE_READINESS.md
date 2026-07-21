# Kelp local Supabase execution readiness

## Document control

| Field | Value |
| --- | --- |
| Purpose | Record the Phase 8.3 preparation that makes the first disposable local Supabase execution deterministic and guarded. |
| Created | 2026-07-19 |
| Current checkpoint | Phase 8.3 — actor provisioning and execution runbook |
| Checkpoint result | PASS |
| Database touched | No |
| Formal acceptance run recorded | No |

## Prepared assets

| Asset | Prepared behavior |
| --- | --- |
| [`local-supabase-actor-map-v1.json`](./fixtures/local-supabase-actor-map-v1.json) | Maps nine standard aliases to unique local-only Auth UUIDs, `*.local.test` emails, exact role sets, and primary roles without storing credentials. |
| [`local-supabase-acceptance.mjs`](../../tools/local-supabase-acceptance.mjs) | Performs loopback/project preflight, guarded local reset, Admin-API user provisioning, service-role first-admin bootstrap, protected role grants/revocations, actor verification, and Docker/psql rollback test execution. |
| [`local-supabase-acceptance-self-test.mjs`](../../tools/local-supabase-acceptance-self-test.mjs) | Verifies fixture alignment, safety guards, package commands, explicit SQL actor contracts, bootstrap availability, and runbook completeness without touching Supabase. |
| [`LOCAL_SUPABASE_EXECUTION_RUNBOOK.md`](./LOCAL_SUPABASE_EXECUTION_RUNBOOK.md) | Defines the exact PowerShell sequence, evidence boundary, failure handling, and cleanup choices for the first formal execution. |
| Seven `tools/*-db-self-test.sql` files | Consume named actor variables, reject absent/mismatched setup, use provisioned roles, execute as `authenticated` where applicable, and roll back their domain fixtures. |

## Resolved Phase 8.2 blocker

`AUDIT-8.2-003` identified that the database scripts selected arbitrary profiles by UUID order and silently inserted their own privileged roles. Phase 8.3 removes both behaviors:

- no database characterization contains `FROM public.profiles ORDER BY id` actor selection;
- no database characterization inserts or updates `public.user_roles` for setup;
- the runner passes each required UUID by semantic psql variable such as `mentor_id`, `student_id`, or `outsider_id`;
- every script checks variable presence, distinct identities, profile existence, and the required active role before `BEGIN`;
- missing setup exits non-zero and instructs the executor to run the trusted provisioner.

## Safety controls

- Reset and provisioning require `--confirm-project=kelptutoring.com-main`.
- Reset always invokes `supabase db reset --local`.
- API and database URLs must resolve to loopback ports `54321` and `54322`.
- The configured project and actor-map project must both equal `kelptutoring.com-main`.
- Actor passwords exist only in `KELP_LOCAL_ACCEPTANCE_PASSWORD` and must contain at least 12 characters.
- API keys and tokens are never written to fixtures, evidence, or output summaries.
- The runner has no linked-project, push, remote-reset, or production-data path.
- SQL runs target the exact running `supabase_db_kelptutoring.com-main` Docker container.

## Static verification

| Check | Result |
| --- | --- |
| Runner and self-test JavaScript syntax | PASS |
| Actor map and `package.json` parsing | PASS |
| Nine actor aliases/roles/primary roles aligned to canonical fixture | PASS |
| Unique valid local UUIDs and synthetic emails | PASS |
| Five SQL scripts free of row-order actor selection | PASS |
| Five SQL scripts free of direct role provisioning | PASS |
| Required named variables, actor preflight, authenticated role, and rollback present | PASS |
| Guarded reset/provision refuse missing project confirmation | PASS |
| `npm run test:supabase-acceptance` | PASS |

These are preparation checks, not evidence that the local Auth Admin API, migration replay, Docker container name, PostgreSQL syntax, RLS, grants, or RPCs passed live.

## Phase 8.4 execution outcome

`RUN-20260719-001` resolved the execution uncertainties tracked by this checkpoint:

- Docker and the exact local database container were available;
- guarded preflight confirmed the expected project and loopback ports;
- the Auth Admin API created all eight reserved identities and their profile triggers completed;
- all ten migrations replayed successfully;
- all five SQL characterizations parsed, passed, and reached `ROLLBACK`;
- the post-run audit retained eight actor contracts and found zero characterization rows.

Browser-authenticated workspace journeys, broader API cases, relationship scoping, and remaining Draft behavior are still separate formal work.

## Phase 8.3 conclusion

**GO for a controlled Phase 8.4 local execution using [`LOCAL_SUPABASE_EXECUTION_RUNBOOK.md`](./LOCAL_SUPABASE_EXECUTION_RUNBOOK.md).**

The first live step must create a run-log entry before reset. Any preflight, replay, provisioning, or SQL failure is recorded as `BLOCKED` or `FAIL`; it is not repaired with personal accounts or ad hoc role inserts.

**NO-GO for production deployment.** Relationship scoping, form/exam assignment delivery, written review, retry, and other Draft boundaries remain unchanged.

## Phase 8.4 conclusion

**PASS for the selected local migration/RPC/RLS characterization scope.** See [`RUN-20260719-001`](./TEST_RUN_LOG.md#run-20260719-001--first-disposable-local-migration-and-database-characterization-run) and its sanitized evidence summary.

The disposable local stack and eight synthetic actors are retained intentionally for the next acceptance selection. This result does not widen the production `NO-GO` boundaries above.

## Phase 2.A extension

`RUN-20260720-001` completed the Phase 2.A extension without changing the historical result of `RUN-20260719-001`:

- the relationship migration was applied incrementally without resetting manually created exploratory accounts;
- the guarded provisioner verified nine synthetic actors and created the protected Mentor/Tutor/two-Student fixture graph;
- all seven rollback database characterizations passed, including two separate Mechanics Courses/Classrooms, participant RLS, Student isolation, and outsider denial;
- the post-run audit retained all nine actor contracts and found zero characterization rows.

**PASS for the Phase 2.A local relationship-foundation scope.** Calendar availability, lesson requests, Classes, credits, Guardians, and later relationship lifecycle behavior remain separate work.

## Phase 2.B extension

`RUN-20260720-002` completed the Student Dashboard foundation on the retained stack:

- migration `202607200005_student_dashboard_foundation.sql` applied incrementally;
- all eight rollback database characterizations passed;
- Student preference isolation, linked/unlinked relationship projection, reset behavior, and Tutor denial passed live;
- layout order and month/week Calendar style persisted across browser reload and reset to defaults afterward;
- the sticky grouped header and mobile menu stayed within the viewport;
- the final 390-pixel responsive check found no document-level horizontal overflow and no browser warnings or errors;
- the post-run audit retained all nine actor contracts and found zero characterization rows.

**PASS for the Phase 2.B local Dashboard-foundation scope.** Finished Classroom Cards, Calendar data/booking, and credits remain explicitly assigned to Phases 3, 7, and 8.

## Phase 2.B direct-manipulation refinement

`RUN-20260720-003` applied migration `202607200006_student_dashboard_refinements.sql`, passed all eight rollback characterizations, and retained nine verified actors with zero characterization residue. Authenticated browser checks confirmed synchronized Month/Week view, collapsed state, direct block order, reload persistence, and transient feedback without a separate edit mode.

**PASS for the completed Phase 2.B Dashboard refinement scope.**

## Phase 2.C responsive shell

`RUN-20260720-004` made no database change. It verified the sidebar-free top navigation, persistent Credits wallet, fixed-versus-reorderable boundary, contained menu panels, and document-width behavior at 320, 390, 768, and 1440 pixels against the already verified Phase 2.B read model.

**PASS for the Phase 2.C responsive top-navigation and grid scope.**
