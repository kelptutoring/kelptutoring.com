# Kelp migration and security audit

## Document control

| Field | Value |
| --- | --- |
| Purpose | Record the Phase 8.2 static audit of the complete Supabase migration chain before any local reset or migration execution. |
| Created | 2026-07-19 |
| Current checkpoint | Phase 8.2 — migration and security inspection |
| Checkpoint result | PASS WITH CORRECTIONS |
| Database touched | No |
| Formal acceptance run recorded | No |

## Safety boundary

This checkpoint inspected source files and ran static implementation characterizations. It did not start Supabase, reset data, apply migrations, create Auth users, bootstrap an administrator, invoke database RPCs, or execute the rollback SQL characterizations.

The results describe the migration source as written. Only a clean replay and authenticated RPC/RLS run can prove PostgreSQL accepts the chain and enforces the resulting policies and privileges at runtime.

## Migration inventory

| Order | Migration | Primary domain |
| --- | --- | --- |
| 1 | `202607160001_profiles.sql` | Auth profile and sign-up trigger foundation |
| 2 | `202607170001_form_library.sql` | Form definitions and immutable submissions |
| 3 | `202607180001_exam_library.sql` | Exam definitions and independent questions |
| 4 | `202607180002_exam_review_workflow.sql` | Exam review lifecycle |
| 5 | `202607180003_multi_role_authorization.sql` | Cumulative roles, capabilities, credentials, and audit events |
| 6 | `202607180004_content_publication.sql` | Form/exam review and publication |
| 7 | `202607180005_curriculum_taxonomy.sql` | Curriculum hierarchy and governance |
| 8 | `202607180006_question_bank.sql` | Question classification and retrieval |
| 9 | `202607180007_course_composition.sql` | Course composition and source references |
| 10 | `202607190001_course_practice_delivery.sql` | Schedules, immutable assignment delivery, and attempts |

## Static security inventory

| Measure | Result |
| --- | --- |
| Ordered migrations | 10 |
| Public tables declared | 25 |
| Public tables enabling RLS | 25 |
| Tables missing RLS declarations | 0 |
| Final function definitions | 60 |
| Final `SECURITY DEFINER` functions | 53 |
| `SECURITY DEFINER` functions missing a constrained `search_path` | 0 |
| Functions without a constrained `search_path` | 0 |
| Function names without an explicit privilege revocation | 0 |

Every final function fixes its lookup path to `pg_catalog`, or to `pg_catalog, public`. Browser-callable privileged functions derive the caller from `auth.uid()` and check the relevant capability, ownership, student identity, or resource lifecycle. Trigger and internal helper entry points are explicitly revoked from `PUBLIC`, `anon`, and `authenticated`; only intended RPCs are granted back.

This is a source-level result. It does not substitute for catalog queries against the migrated database.

## Corrected findings

### AUDIT-8.2-001 — Public metadata could influence the legacy privileged-role backfill

| Field | Value |
| --- | --- |
| Severity | Critical |
| Status | Resolved in Phase 8.2 source |

The first profile migration originally copied `raw_user_meta_data.role` into `profiles.role`. The later cumulative-role migration then treated that legacy column as a trusted grant source. An account created before the hardening migration could therefore have carried a self-selected privileged role into `user_roles`.

Corrections:

- public sign-up now always creates or updates a `student` profile, regardless of client metadata;
- the cumulative-role migration normalizes pre-existing profiles to `student` and seeds only the student role with `source = 'system'`;
- the migration suspends the preceding role-immutability trigger only around that trusted one-time normalization, then immediately restores it;
- the migration no longer imports legacy `profiles.role` values as grants;
- `bootstrap_first_administrator(uuid, text)` is executable only by `service_role`, refuses to run after an active administrator exists, serializes the one-time check, updates the compatibility role, and records an authorization event;
- browser roles and trigger functions receive explicit privilege revocations.

This correction is safe for the current undeployed/disposable database chain. A future upgrade of a real database with independently verified privileged users would require an explicit trusted mapping plan before applying the normalization.

### AUDIT-8.2-002 — Student question delivery relied on a finite answer-key blacklist

| Field | Value |
| --- | --- |
| Severity | Important |
| Status | Resolved in Phase 8.2 source |

The delivery projection removed known grading keys from author snapshots. A new or legacy alias such as `answerKey` could have survived that blacklist. `course_assignment_delivery_question` now builds the student snapshot from an explicit allowlist of prompt, option, media, graph, classification, and numeric-display fields. The static and rollback-style checks now include the legacy `answerKey` alias as forbidden delivery data.

## Open execution blocker

### AUDIT-8.2-003 — Database characterizations depend on accidental profile ordering

| Field | Value |
| --- | --- |
| Severity | Blocking for database execution |
| Status | Open |

The current rollback SQL scripts select arbitrary rows from `public.profiles` using `ORDER BY id`, including offsets that require two or three accounts. The clean seed is intentionally empty, and the disposable database currently has only one known user. Consequently, a reset followed by these scripts would not create deterministic actors and could fail before testing the intended policy.

Affected characterizations:

- content publication: 2 profiles;
- curriculum governance: 2 profiles;
- Question Bank: 2 profiles;
- course composition: 2 profiles;
- course assignment/practice: 3 profiles.

Before database execution, Phase 8.3 must define a deterministic synthetic Auth/profile provisioning step, map stable actor aliases to generated UUIDs, grant roles through trusted paths, and make every SQL characterization fail clearly when its required actors are absent. Tests must not reuse a personal account or rely on UUID ordering.

Phase 8.3 follow-up: this source-level blocker is resolved by [`local-supabase-actor-map-v1.json`](./fixtures/local-supabase-actor-map-v1.json), the guarded local runner, and explicit actor preflights in all five SQL characterizations. Phase 8.4 then provisioned the actors and passed all five live rollback characterizations in [`RUN-20260719-001`](./TEST_RUN_LOG.md#run-20260719-001--first-disposable-local-migration-and-database-characterization-run).

## Known product boundaries found during the audit

These are not migration-replay defects, but they prevent a production-readiness claim:

- tutor–mentor–student relationships are not modeled, so course assignment discovery currently exposes every active student-role profile to an actor with `course.assign`;
- form and exam assignment/access-token delivery are not implemented;
- `submit_form_response` accepts any authenticated respondent for an active form ID and persists much of the client-provided snapshot; assignment-scoped access and a server-derived authoritative delivery snapshot remain future work;
- cancellation after an attempt, idempotent final-result replay, and written-response review/finalization remain Draft acceptance boundaries;
- archived curriculum-node eligibility for Question Bank reuse remains unresolved.

These boundaries stay visible in the acceptance catalog and must not be reported as passes during the first live database run.

## Characterization evidence

The following non-formal static suites passed after the corrections:

- `npm run test:authorization`
- `npm run test:publication`
- `npm run test:curriculum`
- `npm run test:question-bank`
- `npm run test:course-composition`
- `npm run test:course-practice`
- `npm run test:form-supabase`
- `npm run test:exam-supabase`

These results are readiness evidence only. They are not recorded as formal case outcomes in [`TEST_RUN_LOG.md`](./TEST_RUN_LOG.md).

## Phase 8.2 conclusion

**GO for Phase 8.3 deterministic actor provisioning and database-execution runbook preparation.**

**NO-GO for local database reset or migration execution yet.** The actor/setup dependency must be removed first so the initial live run is reproducible, isolated, and attributable to the correct synthetic identities.

**NO-GO for production deployment.** Relationship scoping, authoritative form/exam assignment delivery, and the other Draft lifecycle boundaries remain intentionally incomplete.
