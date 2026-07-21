# Kelp pre-database audit

## Document control

| Field | Value |
| --- | --- |
| Purpose | Record the read-only audit that must pass before resetting, migrating, or testing disposable local Supabase. |
| Created | 2026-07-19 |
| Current checkpoint | Phase 8.1 — acceptance-system integrity |
| Checkpoint result | PASS WITH CORRECTION |
| Database touched | No |
| Formal acceptance run recorded | No |

## Safety boundary

Phase 8.1 inspected files and executed read-only catalog parsers only. It did not start Supabase, reset data, apply migrations, bootstrap accounts, execute RPCs, run database characterizations, or add results to [`TEST_RUN_LOG.md`](./TEST_RUN_LOG.md).

Passing this checkpoint authorizes Phase 8.2 migration/security inspection. It is not yet authorization to bring up or mutate the local database.

## Phase 8.1 inventory

| Measure | Result |
| --- | --- |
| Acceptance cases | 93 unique IDs |
| Prefixes | `AUTH` 10, `WORK` 9, `FORM` 9, `EXAM` 10, `PUB` 6, `CURR` 9, `QBANK` 10, `COURSE` 10, `SCHED` 7, `ASSIGN` 13 |
| Priority | P0 64, P1 26, P2 3, P3 0 |
| Automation after correction | AUTOMATED 7, PARTIAL 67, CANDIDATE 19 |
| Environment | LOCAL-STATIC 22, LOCAL-SUPABASE 71 |
| Canonical status | Active 86, Draft 7, Retired 0 |
| Registered invariants | 15 |
| Central JSON fixtures | 5 |
| Fixture consumer mappings | 92, with no duplicates or unknown case IDs |
| Referenced npm test commands | 18 |
| Recorded formal runs | 0 |

`AUTH-004` is intentionally fixture-free because it is a self-contained authorization-normalization characterization. Every other case is mapped through one central fixture without duplicate consumer ownership.

## Checks and results

| Area | Result | Evidence summary |
| --- | --- | --- |
| Case identity | PASS | 93 unique IDs; expected prefix counts; no reused IDs. |
| Required case structure | PASS | Every case contains priority, automation, environment, status, purpose, expected outcomes, forbidden outcomes, cleanup/evidence, and invariant references. |
| Metadata vocabulary | PASS | Priorities, coverage tags, automation values, environments, statuses, and creation dates use registered values. |
| Invariant registry | PASS | All 15 defined invariants are referenced; every case protects 2–4 invariants; no unknown invariant IDs. |
| Fixture parsing | PASS | All five JSON files parse, declare schema/version, and contain unique aliases. |
| Fixture dependency graph | PASS | Actor/content/fixture paths resolve; all actor aliases and consumer case IDs exist. |
| Fixture safety | PASS | No environment UUIDs, credentials, access/service keys, or email literals. Synthetic grading answers in the practice fixture are deliberate test inputs. |
| Documentation links | PASS | No unresolved relative Markdown links. |
| Command references | PASS | All 18 documented `npm run test:*` commands exist in `package.json`. |
| Whitespace/parse hygiene | PASS | No trailing whitespace found in the acceptance tree. |
| Run-log truthfulness | PASS | No formal run is claimed; earlier characterization executions remain distinct from recorded acceptance evidence. |
| Automation claims | PASS AFTER CORRECTION | Six over-broad `AUTOMATED` labels were downgraded to `PARTIAL`; behavioral expectations were not weakened. |

## Corrected finding

### AUDIT-8.1-001 — Six cases overstated complete automation

| Field | Value |
| --- | --- |
| Severity | Important |
| Status | Resolved in Phase 8.1 |
| Affected cases | `QBANK-001`, `QBANK-009`, `COURSE-006`, `COURSE-010`, `SCHED-001`, `SCHED-002` |

The linked runners reliably characterize their core domain/static contracts, but they do not execute every browser, environment, negative authorization, same-difficulty tie, or missing/ineligible lookup assertion written in the complete case. Their status is now `PARTIAL`. No expected behavior or case ID changed.

## Deliberately unresolved Draft boundaries

| Case | Boundary |
| --- | --- |
| `EXAM-007` | Authoritative exam assignment/submission and immutable production result basis |
| `PUB-006` | Student-safe form/exam assignment and access-token delivery |
| `QBANK-010` | Archived curriculum-node eligibility for future reuse |
| `SCHED-007` | Relationship-scoped student discovery |
| `ASSIGN-007` | Preventing cancellation after an attempt exists |
| `ASSIGN-012` | Idempotent final-result replay after a lost submission response |
| `ASSIGN-013` | Authorized written-response review and final grade lifecycle |

Draft cases must be selected as `BLOCKED` or `NOT_RUN` until their prerequisite behavior exists. Their absence must not be interpreted as a pass during database testing.

## Phase 8.1 conclusion

**GO for Phase 8.2 migration and security audit.**

**NO-GO for database reset or migration execution yet.** Phase 8.2 must inspect the complete migration chain, function security, grants, RLS, ownership derivation, lifecycle constraints, first-administrator bootstrap, and migration replay dependencies before the execution runbook can be approved.

Phase 8.2 is recorded in [`MIGRATION_SECURITY_AUDIT.md`](./MIGRATION_SECURITY_AUDIT.md). Its source audit passed with corrections, while database execution remains blocked pending deterministic synthetic actor provisioning and an exact runbook.
