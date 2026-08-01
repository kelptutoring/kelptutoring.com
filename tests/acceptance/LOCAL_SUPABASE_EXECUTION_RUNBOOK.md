# Kelp local Supabase execution runbook

## Document control

| Field | Value |
| --- | --- |
| Purpose | Rebuild the disposable local database, provision deterministic synthetic actors, and execute the first rollback database characterizations safely and reproducibly. |
| Created | 2026-07-19 |
| Prepared in | Phase 8.3 |
| Target | `LOCAL-SUPABASE` project `kelptutoring.com-main` only |
| Remote execution allowed | No |
| Production identities or data allowed | No |

## What this runbook protects

The runbook removes the profile-ordering dependency identified by [`AUDIT-8.2-003`](./MIGRATION_SECURITY_AUDIT.md). Nine stable local actor aliases resolve to committed synthetic UUIDs and `*.local.test` email addresses through [`local-supabase-actor-map-v1.json`](./fixtures/local-supabase-actor-map-v1.json). Their shared temporary password exists only in `KELP_LOCAL_ACCEPTANCE_PASSWORD` for the current shell.

Auth users are created through the local Auth Admin API, not by inserting application profiles. This exercises the `auth.users` → `profiles` → student-role trigger chain. The first administrator is then created through `bootstrap_first_administrator`; every other privileged role is granted through the protected authorization RPCs.

The implementation follows Supabase's documented local workflow: migrations run before seed data during `db reset`, and login-capable test users should be created with the Auth Admin API. See [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows) and [Testing overview](https://supabase.com/docs/guides/local-development/testing/overview).

## Safety gates

The runner in [`local-supabase-acceptance.mjs`](../../tools/local-supabase-acceptance.mjs) refuses to continue unless all applicable checks pass:

- `supabase/config.toml` declares exactly `project_id = "kelptutoring.com-main"`;
- the actor fixture declares the same project;
- the API is loopback on port `54321`;
- the database is loopback on port `54322`;
- local anonymous/publishable and service-role/secret keys are available from `supabase status -o env`;
- destructive or identity-mutating commands receive `--confirm-project=kelptutoring.com-main`;
- actor provisioning receives a temporary password of at least 12 characters;
- the exact local database Docker container is running;
- every SQL characterization receives named actor UUIDs and confirms the required profiles and active roles before beginning.

The reset invocation always includes `--local`. The runner contains no `--linked`, `db push`, remote project reference, or production cleanup path.

## Prerequisites

1. Docker Desktop is running with its Linux engine available.
2. Dependencies are installed with the repository's existing `npm install` workflow.
3. The working tree and migration chain have been reviewed.
4. The local project is disposable and contains no data that must be preserved.
5. A formal run entry has been prepared in [`TEST_RUN_LOG.md`](./TEST_RUN_LOG.md) before executing acceptance cases.

## Prepared command sequence

Run these commands from the repository root in PowerShell. Phase 8.3 prepares this sequence but does not execute it.

### 1. Validate the execution package without touching Supabase

```powershell
npm.cmd run test:supabase-acceptance
```

### 2. Start and inspect the local stack

```powershell
npm.cmd run supabase:start
npm.cmd run supabase:preflight
```

The preflight output must name `kelptutoring.com-main`, the loopback API URL, and database port `54322`. It must not print API keys.

### 3. Set a temporary local actor password

```powershell
$env:KELP_LOCAL_ACCEPTANCE_PASSWORD = Read-Host 'Temporary local acceptance password'
```

Use at least 12 characters. This value is intentionally not written to a fixture, evidence file, run log, or `.env` file. Keep the same shell open for actor verification and any manual sign-in checks.

### 4. Record the formal run header

Copy the run template in [`TEST_RUN_LOG.md`](./TEST_RUN_LOG.md), assign its run ID, record the working-tree/source revision, set the environment to `LOCAL-SUPABASE`, and mark the database as disposable. Do this before reset so failures and blockers remain visible.

### 5. Reset only the confirmed local project

```powershell
npm.cmd run supabase:reset -- --confirm-project=kelptutoring.com-main
```

This is the destructive step. It calls `supabase db reset --local`, replays all migrations, and runs the configured seed. Stop immediately if the preflight target is unexpected.

### 6. Provision and verify deterministic actors

```powershell
npm.cmd run supabase:provision -- --confirm-project=kelptutoring.com-main
npm.cmd run supabase:verify-actors
```

Expected actor result:

| Alias | Active roles | Primary role |
| --- | --- | --- |
| `ACT-STUDENT` | student | student |
| `ACT-STUDENT-B` | student | student |
| `ACT-TUTOR` | tutor | tutor |
| `ACT-TEACHER` | teacher | teacher |
| `ACT-MENTOR` | mentor | mentor |
| `ACT-ADMIN` | admin | admin |
| `ACT-STUDENT-TUTOR` | student, tutor | student |
| `ACT-TUTOR-MENTOR` | tutor, mentor | mentor |
| `ACT-OUTSIDER` | student | student |

Provisioning also restores the interactive local Classroom test network used for
manual journeys:

| Account | Only active role | Relationship |
| --- | --- | --- |
| `al.van.astrea@gmail.com` | mentor | Aldebarã supervises Thiago Kelp |
| `thiago.loyola@kelptutoring.com` | tutor | Teaches both manual-QA Students |
| `thiago.d.loyola@gmail.com` | student | Recurring Algebra 1 Course |
| `thiago.dias.loyola@gmail.com` | student | On-demand Mechanics Course |

`tools/provision-classroom-test-network.sql` verifies this graph atomically and
is idempotent. It completes and inactivates only the exact known superseded
sandbox Courses, preserving their Classroom/Schedule history. Its 16 curriculum
rows are generated from the canonical Track catalogue and must retain Session
IDs, content-version keys, Module identities, and real planning destinations.
If Aldebarã must be recreated after a reset, that account receives the current
acceptance Student password hash. Existing account passwords are never replaced.

To restore only this four-account graph without entering or changing a password:

```powershell
npm.cmd run supabase:provision:manual-qa -- --confirm-project=kelptutoring.com-main
```

Any mismatch is a blocker. Do not repair roles with ad hoc table inserts; fix the migration, bootstrap, or provisioning runner and repeat from reset.

### 7. Execute rollback database characterizations

```powershell
npm.cmd run supabase:test:db
```

The runner executes these scripts in order:

1. `content-publication-db-self-test.sql`
2. `curriculum-taxonomy-db-self-test.sql`
3. `question-bank-db-self-test.sql`
4. `course-composition-db-self-test.sql`
5. `course-practice-delivery-db-self-test.sql`
6. `student-profile-preferences-db-self-test.sql`
7. `student-relationships-db-self-test.sql`
8. `student-dashboard-foundation-db-self-test.sql`
9. `student-classroom-cards-db-self-test.sql`

Each script:

- receives named actor UUIDs from the committed map;
- verifies profiles, distinct identities, and required active roles;
- switches to the `authenticated` database role for protected RPC/RLS behavior;
- wraps its fixtures and mutations in `BEGIN` / `ROLLBACK`;
- exits non-zero if setup, an assertion, or rollback-style execution fails.

The runner captures successful psql output and prints one `PASS` line per script so large JSON RPC payloads do not obscure the result. When a script fails, the runner prints `FAIL` and preserves PostgreSQL's error detail and context.

### 8. Audit retained local state

```powershell
npm.cmd run supabase:audit
```

This password-free audit verifies that all nine synthetic Auth/profile/role contracts remain intact and scans public tables for known characterization residue. A successful run prints the concise summary `9 actors verified; zero characterization rows retained`; PostgreSQL details remain available on failure.

### 9. Record outcomes and evidence

Record every selected acceptance test as `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`. Static suite success is not a live RLS result. Capture only sanitized command summaries—never status environment output, passwords, API keys, access tokens, or refresh tokens.

### 10. End the shell secret and choose cleanup

```powershell
Remove-Item Env:KELP_LOCAL_ACCEPTANCE_PASSWORD
```

If the next phase needs browser sessions, retain the disposable local database and record that choice. Otherwise, stop the local stack with the existing `npm.cmd run supabase:stop` command. A later reset may remove all synthetic identities.

## Failure handling

- **Start/preflight fails:** record `BLOCKED`; do not reset.
- **Migration replay fails:** record `FAIL` against migration readiness; do not provision actors.
- **Actor provisioning fails:** record `FAIL`; do not run SQL with substitute personal profiles.
- **A SQL script fails:** preserve its output as sanitized evidence, confirm the failed session rolled back, and do not report later scripts as passed unless they were actually executed.
- **Docker or Supabase target becomes ambiguous:** stop. Never add a remote flag to make the command work.
- **Interruption after reset:** record the incomplete cleanup and rerun from preflight; do not infer state from the prior attempt.

## Phase boundary

Phase 8.3 prepares and statically validates this workflow. The first destructive reset, actor creation, live migration replay, RPC/RLS characterization, and formal run-log entry belong to the following execution phase.
