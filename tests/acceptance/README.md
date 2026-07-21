# Kelp acceptance testing

This folder is the durable home for Kelp's cross-feature acceptance method. It records the behavior the platform is expected to preserve across roles, relationships, builders, review workflows, persistence, assignments, and student delivery.

The acceptance catalog complements unit, characterization, database, and smoke tests. It does not replace them. Its main purpose is to keep important user journeys and security boundaries visible even when they cross several pages or database domains.

## Start here

- [`TEST_REFERENCE.md`](./TEST_REFERENCE.md) is the behavioral reference book and test catalog.
- [`COVERAGE_MAP.md`](./COVERAGE_MAP.md) traces every chunk to its current pages, migrations, fixtures, automated checks, and known gaps.
- [`TEST_RUN_LOG.md`](./TEST_RUN_LOG.md) records actual manual and automated executions.
- [`PRE_DATABASE_AUDIT.md`](./PRE_DATABASE_AUDIT.md) records read-only readiness checkpoints before local Supabase is reset or migrated.
- [`MIGRATION_SECURITY_AUDIT.md`](./MIGRATION_SECURITY_AUDIT.md) records the Phase 8.2 migration-chain, RLS, function-security, bootstrap, and replay-dependency audit.
- [`LOCAL_SUPABASE_READINESS.md`](./LOCAL_SUPABASE_READINESS.md) records the Phase 8.3 actor-provisioning and execution-package checkpoint.
- [`LOCAL_SUPABASE_EXECUTION_RUNBOOK.md`](./LOCAL_SUPABASE_EXECUTION_RUNBOOK.md) is the guarded command sequence for the first live local reset and database run.
- [`TEST_CASE_TEMPLATE.md`](./TEST_CASE_TEMPLATE.md) is the required shape for new catalog cases.
- [`catalog/`](./catalog/README.md) contains detailed cases organized by feature chunk.
- [`fixtures/`](./fixtures/README.md) will contain deterministic, synthetic inputs shared by tests.
- [`automation/`](./automation/README.md) will contain executable counterparts to catalog cases.
- [`evidence/`](./evidence/README.md) is a local staging area for screenshots, logs, and reports.

## Guiding rules

1. **Expected behavior is written before or alongside implementation.** A failing implementation does not justify silently weakening the expected result.
2. **Stable IDs connect the catalog, run log, fixtures, bugs, and automation.** Test IDs are never reused or renumbered.
3. **Authorization and relationships are separate.** A role grants capabilities; a relationship grants scoped interaction with another account or resource.
4. **Every central workflow includes a negative boundary.** A successful action is incomplete coverage unless an unauthorized or invalid version is also considered.
5. **Historical data is tested as historical data.** Source edits, archive actions, relationship changes, and deletion must not rewrite immutable submissions, attempts, reviews, or assignment snapshots.
6. **Fixtures are synthetic.** Never store production credentials, access tokens, private student data, or real-world evidence in this folder.
7. **Database tests clean up after themselves.** Prefer transactions with rollback. A destructive reset is allowed only against a confirmed disposable local database.
8. **Manual and automated results use the same vocabulary.** A browser observation and an RPC assertion can refer to the same catalog case without becoming different tests.

## Working flow

1. Select cases from `TEST_REFERENCE.md` by risk, feature, or change impact.
2. Confirm the required environment, migrations, actors, relationships, and fixtures.
3. Add a run header to `TEST_RUN_LOG.md` before beginning a formal run.
4. Execute the documented steps without changing the expected result midway.
5. Record `PASS`, `FAIL`, `BLOCKED`, or `NOT_APPLICABLE` and attach safe evidence when useful.
6. Complete the documented cleanup and record anything left behind.
7. Open or link defects for failures instead of rewriting the test to match the defect.
8. When a case becomes automated, keep its original test ID and update its automation status in the reference.

## Relationship to existing tests

Existing scripts under `tools/` remain focused executable characterizations. Existing builder fixtures remain close to their builders. The acceptance catalog links to those assets rather than copying them indiscriminately.

Examples include:

- `src/app/exam-builder/test-fixtures/exam-builder-comprehensive-test.json`
- `src/app/form-builder/test-fixtures/comprehensive-five-phase-template.json`
- `src/app/form-builder/test-fixtures/routing-cases.json`
- `tools/authorization-self-test.mjs`
- `tools/content-publication-db-self-test.sql`
- `tools/course-practice-delivery-db-self-test.sql`

As automation grows, small scenario runners may live in `tests/acceptance/automation/`. Broad implementation-level self-tests may remain under `tools/`. The deciding factor is ownership and clarity, not file extension.

## Safe maintenance

- Add new cases; do not overwrite the meaning of an old executed case without a revision note.
- Retire obsolete cases explicitly and point to their replacements.
- Keep run outcomes in the run log, not in the canonical expected-behavior section.
- Use ISO dates (`YYYY-MM-DD`) and UTC timestamps where a time is required.
- Use symbolic actor aliases in documentation and fixtures. Resolve them to local test accounts only during setup.
- Keep evidence filenames tied to a run ID and test ID.
- Review this foundation whenever a new central domain, relationship, or persistence boundary is introduced.

## Current state

Phases 1 and 2 establish the method, folder structure, invariant registry, and current coverage map. Phases 3–7 add detailed authorization, builder, publication, curriculum, course, schedule, assignment, and practice cases. Phase 8.1 audits the resulting 93-case acceptance system; Phase 8.2 audits and hardens the migration/security source; Phase 8.3 prepares deterministic local actors and guarded orchestration. Phase 8.4 records the first live local run: ten migrations replayed, eight actors provisioned, five rollback database characterizations passed, and 18 selected cases recorded as `PASS`. Only `TEST_RUN_LOG.md` records formal outcomes; this remains a partial acceptance result, not production readiness.
