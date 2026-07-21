# Kelp acceptance test run log

## Purpose

This file records actual acceptance-test executions. The canonical expected behavior remains in [`TEST_REFERENCE.md`](./TEST_REFERENCE.md). A failure belongs here and in the relevant defect record; it must not be hidden by editing the expected outcome to match the implementation.

## Logging rules

- Append new runs in reverse chronological order beneath **Recorded runs**.
- Use run IDs in the form `RUN-YYYYMMDD-NNN`.
- Use ISO UTC timestamps for started/finished times.
- Record the source revision and migration state before interpreting a result.
- Use only the result values defined in the reference: `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED`, or `NOT_APPLICABLE`.
- A `BLOCKED` result must name the external or environmental blocker.
- A `NOT_APPLICABLE` result must explain why the case does not apply.
- Link evidence by run ID and test ID. Never paste passwords, tokens, production records, or private student information.
- Record cleanup status, including local database resets, rollback confirmation, temporary accounts, files, and browser state.
- Do not delete failed runs after a fix. Add a later rerun showing the new result.

## Run summary template

Copy this block beneath **Recorded runs** when beginning a formal execution.

```markdown
### RUN-YYYYMMDD-NNN — Short scope

| Field | Value |
| --- | --- |
| Status | In progress / Complete / Aborted |
| Purpose | Why this selection is being executed |
| Started | YYYY-MM-DDTHH:MM:SSZ |
| Finished | — |
| Executor | Name or agent identifier |
| Environment | LOCAL-STATIC / LOCAL-SUPABASE / STAGING / PRODUCTION-OBSERVE |
| Source revision | Commit SHA or working-tree description |
| Database | Project/ref and disposable/non-disposable classification |
| Migration state | Latest applied migration or status output reference |
| Database reset | Yes / No / Not applicable |
| Browser/runtime | Browser name/version or automated runtime |
| Evidence folder | evidence/RUN-YYYYMMDD-NNN/ |

#### Selection rationale

Describe the changed feature, risk, relationship, persistence boundary, or regression concern that selected these cases.

#### Results

| Test ID | Result | Evidence | Defect/blocker | Notes |
| --- | --- | --- | --- | --- |
| EXAMPLE-001 | NOT_RUN | — | — | Replace this example row. |

#### Unexpected observations

- None.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Pending | |
| Synthetic accounts/data | Pending | |
| Temporary files/evidence review | Pending | |
| Browser sessions/dialogs | Pending | |

#### Follow-up

- None.
```

## Recorded runs

### RUN-20260720-006 — Phase 3 Student Classroom lifecycle

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify active/wind-down Cards, retained historical access, personal Archive/Restore, Student isolation, outsider denial, and responsive Student Classroom interaction. |
| Finished | 2026-07-20 (user terminal results received) |
| Executor | User terminal with Codex `/root` implementation, static checks, and authenticated browser verification |
| Environment | Retained LOCAL-SUPABASE project plus authenticated local app |
| Migration state | Applied through `202607200011_student_classroom_lifecycle_projection.sql` |
| Database reset | No; all characterization mutations rolled back |
| Evidence | [`student-classroom-lifecycle-projection-db-self-test.sql`](../../tools/student-classroom-lifecycle-projection-db-self-test.sql) and [`student-classrooms-surface-self-test.mjs`](../../tools/student-classrooms-surface-self-test.mjs) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| CLASSROOM-3-STATIC | PASS | Student Classroom, Dashboard, and relationship contract checks passed. |
| CLASSROOM-3-LIFECYCLE | PASS | Active and wind-down archive denial, retained read-only entry, personal archive independence, idempotent restore, Student A/B isolation, and outsider denial passed. |
| CLASSROOM-3-RESPONSIVE | PASS | Mouse and keyboard tabs, normal-flow header, three-column desktop grid, and one-column 390-pixel layout passed without document overflow. |
| CLASSROOM-3-DB | PASS | All 13 rollback database characterizations passed. |
| CLASSROOM-3-AUDIT | PASS | Nine actors verified; zero characterization rows retained. |

#### Deferred ownership

- Schedule, homework, unread, Report Card, Forum, and live-Class data remain absent until their owning vertical phases create authoritative records.

### RUN-20260720-005 — Phase 2.D active Classroom Cards

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify relationship-backed active Classroom Cards, per-Student color/order, authenticated Classroom entry, and responsive Dashboard containment. |
| Finished | 2026-07-20 |
| Executor | User terminal with Codex `/root` implementation and authenticated browser verification |
| Environment | Retained LOCAL-SUPABASE project plus authenticated local app |
| Migration state | Applied through `202607200007_student_classroom_cards.sql` |
| Database reset | No; characterization mutations rolled back |
| Evidence | [`student-classroom-cards-db-self-test.sql`](../../tools/student-classroom-cards-db-self-test.sql) and [`student-dashboard-foundation-self-test.mjs`](../../tools/student-dashboard-foundation-self-test.mjs) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| DASH-2D-STATIC | PASS | Active Card projection, Student-owned customization, and authenticated Classroom route contracts passed. |
| DASH-2D-DB | PASS | All nine rollback database characterizations passed. |
| DASH-2D-BROWSER | PASS | Dashboard controls, reload-persistent ordering, normal-flow reload position, and 390-pixel containment passed. |
| DASH-2D-AUDIT | PASS | Nine actors verified; zero characterization rows retained. |

### RUN-20260720-004 — Phase 2.C responsive top navigation and grid

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the sidebar-free responsive top navigation and the boundary between fixed Dashboard regions and the reorderable Calendar/Classrooms grid. |
| Finished | 2026-07-20 |
| Executor | Codex `/root` static and authenticated browser verification |
| Environment | Local app backed by the retained LOCAL-SUPABASE project |
| Database change | None; Phase 2.C reuses the verified Phase 2.B read model and preferences |
| Evidence folder | [`evidence/RUN-20260720-004/`](./evidence/RUN-20260720-004/) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| DASH-2C-STATIC | PASS | Dashboard, workspace, authorization, and theme-coverage suites passed with fixed/reorderable and narrow-header assertions. |
| DASH-2C-320 | PASS | Logo and Credits remained visible above the full-width navigation row; Account panel stayed inside the viewport; no document overflow. |
| DASH-2C-390 | PASS | Compact one-row header remained intact; only the 670-pixel Calendar canvas scrolled internally. |
| DASH-2C-TABLET | PASS | Fixed regions remained outside the two-block grid at 768 pixels with no document overflow. |
| DASH-2C-DESKTOP | PASS | Normal-flow topbar, wallet, two reorderable blocks, and sidebar absence passed at 1440 pixels. |

#### Cleanup

- The temporary viewport override was reset.
- The browser-test Student was restored to Calendar-first, Month view, with no collapsed blocks.

#### Follow-up

- Phase 2.D owns real Classroom Cards and Classroom entry.
- Phase 2.E owns authoritative Calendar items and the availability-overlay contract.
- Phase 2.F owns the consolidated multi-actor, responsive, cross-device test/documentation closeout.

### RUN-20260720-003 — Phase 2.B direct-manipulation refinement

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the normal-flow Dashboard header, Credits wallet, dated Month view, synchronized collapse state, and always-available auto-saved block manipulation. |
| Finished | 2026-07-20 (user confirmation and audit received) |
| Executor | User terminal with Codex `/root` implementation and authenticated browser verification |
| Environment | Retained LOCAL-SUPABASE project plus authenticated local app |
| Source revision | `8bd63a4c9b9f3a2812cedeecb046e1550a7d1da8` with a shared dirty working tree; refinement files remain in the workspace |
| Migration state | Sixteen migrations applied through `202607200006_student_dashboard_refinements.sql` |
| Evidence folder | [`evidence/RUN-20260720-003/`](./evidence/RUN-20260720-003/) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| DASH-2B-R3-STATIC | PASS | Dashboard, workspace, authorization, and theme-coverage suites passed. |
| DASH-2B-R3-DB | PASS | All eight rollback database characterizations passed after the additive refinement migration. |
| DASH-2B-R3-BROWSER | PASS | Month/Week, minimize/expand, direct reorder, reload persistence, and two-second feedback behavior passed; the user confirmed the interaction is working. |
| DASH-2B-R3-AUDIT | PASS | Nine actors verified; zero characterization rows retained. |

#### Follow-up

- Phase 3 owns finished Classroom Cards and Classroom entry.
- Calendar data/booking and authoritative credit balances remain in their later vertical slices.

### RUN-20260720-002 — Phase 2.B Student Dashboard foundation

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Apply and verify the Student-owned Dashboard preference/read model, grouped sticky navigation, reorderable Calendar/Classrooms grid, Calendar style persistence, and explicit deferred-feature states. |
| Started | Not captured; user-triggered local migration and database execution on 2026-07-20 |
| Finished | 2026-07-20T21:29:43Z (browser result recorded) |
| Executor | User terminal with Codex `/root` implementation and browser verification |
| Environment | LOCAL-SUPABASE plus authenticated local in-app browser |
| Source revision | `8bd63a4c9b9f3a2812cedeecb046e1550a7d1da8` with a 459-entry shared dirty working tree; Phase 2.B files remain in the workspace |
| Database | Retained disposable local project `kelptutoring.com-main` |
| Migration state | Fifteen migrations applied through `202607200005_student_dashboard_foundation.sql` |
| Database reset | No — the Dashboard migration was applied incrementally |
| Browser/runtime | Node.js runner, Supabase CLI, Docker PostgreSQL `psql`, and authenticated Codex in-app browser at desktop and 390×844 responsive viewport |
| Evidence folder | [`evidence/RUN-20260720-002/`](./evidence/RUN-20260720-002/) |

#### Selection rationale

Phase 2.B replaces undeclared Dashboard tables and a mobile-first-screen sidebar with a Student-only server projection and a compact grouped shell. The run selected preference validation, cross-Student RLS, linked and unlinked relationship results, Tutor denial, rollback cleanup, grouped-menu behavior, sticky positioning, save/reload/reset, Calendar-style persistence, responsive containment, and clean browser diagnostics.

#### Results

| Test ID | Result | Evidence | Defect/blocker | Notes |
| --- | --- | --- | --- | --- |
| DASH-2B-STATIC | PASS | [Run summary](./evidence/RUN-20260720-002/run-summary.md) | — | Dashboard, workspace, authorization, theme, relationship, Profile, and local-runner static suites passed. |
| DASH-2B-DB | PASS | [Run summary](./evidence/RUN-20260720-002/run-summary.md) | — | All eight rollback database characterizations passed, including the new Dashboard preference/read-model script. |
| DASH-2B-RLS | PASS | [Run summary](./evidence/RUN-20260720-002/run-summary.md) | — | Student A/B preferences remained isolated, the unlinked Student received no relationships, and the Tutor was denied the Student Dashboard RPC. |
| DASH-2B-BROWSER | PASS | [Run summary](./evidence/RUN-20260720-002/run-summary.md) | — | Layout and month/week preferences survived reload; Reset restored defaults; grouped menus and sticky positioning behaved as specified. |
| DASH-2B-RESPONSIVE | PASS | [Run summary](./evidence/RUN-20260720-002/run-summary.md) | — | At the 390-pixel test viewport, the document remained 375 pixels wide and only the 670-pixel Calendar canvas scrolled internally. |
| DASH-2B-AUDIT | PASS | [Run summary](./evidence/RUN-20260720-002/run-summary.md) | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first mobile pass exposed document-level horizontal overflow because the Calendar's intrinsic width propagated through the grid item. Adding `min-width: 0` to the Dashboard grid and blocks confined horizontal scrolling to the Calendar shell; the responsive rerun passed.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Eight characterization scripts passed and rolled back; no reset was performed. |
| Synthetic accounts/data | Retained intentionally | Nine local-only actor contracts and persistent Phase 2.A fixtures remain available. |
| Dashboard preference mutation | Complete | The browser-test Student was reset to Calendar-first and Month view after persistence checks. |
| Browser sessions/dialogs | Complete | Test tabs were closed and the temporary app server was not left listening. |

#### Follow-up

- Phase 3 may replace the neutral relationship foundations with finished Classroom Cards, Student-owned colors, inactive-Card controls, compact summaries, and Classroom entry.
- Phase 7 supplies Calendar events and booking; Phase 8 supplies authoritative credit balances and commitments.

### RUN-20260720-001 — Phase 2.A relationship and Classroom foundation

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Apply and characterize the first runtime Student–Tutor–Mentor relationship, Course, Classroom, and membership foundation without resetting the retained local stack. |
| Started | Not captured; user-triggered local execution on 2026-07-20 |
| Finished | 2026-07-20T20:36:01Z (result recorded) |
| Executor | User terminal with Codex `/root` implementation and test runner |
| Environment | LOCAL-SUPABASE |
| Source revision | `8bd63a4c9b9f3a2812cedeecb046e1550a7d1da8` with a 454-entry shared dirty working tree; Phase 2.A files remain in the workspace |
| Database | Retained disposable local project `kelptutoring.com-main` |
| Migration state | Fourteen migrations applied through `202607200004_student_relationship_classroom_foundation.sql` |
| Database reset | No — the pending migration was applied incrementally and existing exploratory accounts were preserved |
| Browser/runtime | Node.js v22.17.0 runner, Supabase CLI, Docker PostgreSQL `psql`; no browser cases selected |
| Evidence folder | [`evidence/RUN-20260720-001/`](./evidence/RUN-20260720-001/) |

#### Selection rationale

Phase 2.A introduces authoritative relationship records before the Student Dashboard starts consuming them. The run therefore selected qualification and supervision constraints, Course activation, atomic Classroom membership creation, participant-scoped RLS, two-Student isolation, outsider denial, rollback cleanup, and preservation of the retained local actor set.

#### Results

| Test ID | Result | Evidence | Defect/blocker | Notes |
| --- | --- | --- | --- | --- |
| REL-2A-STATIC | PASS | [Run summary](./evidence/RUN-20260720-001/run-summary.md) | — | Migration, RPC, fixture, RLS, and runner contracts passed static verification. |
| REL-2A-DB | PASS | [Run summary](./evidence/RUN-20260720-001/run-summary.md) | — | The relationship characterization passed as item 7 of the seven-script rollback suite. |
| REL-2A-RLS | PASS | [Run summary](./evidence/RUN-20260720-001/run-summary.md) | — | Each Student saw only their own Course/Classroom; Tutor and Mentor saw participant records; the outsider saw none. |
| REL-2A-AUDIT | PASS | [Run summary](./evidence/RUN-20260720-001/run-summary.md) | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The original SQL characterizations interpolated `psql` variables inside dollar-quoted `DO` blocks, where `psql` does not substitute them. The harness now passes those values through transaction-local settings and includes a static regression check.
- The first relationship assertion assumed an otherwise empty database. It now targets the generated Course/Classroom IDs explicitly, so persistent fixtures and rollback-only characterization rows can coexist safely.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | All seven characterization scripts passed and rolled back; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | Nine verified local-only actors and the protected Phase 2.A fixture graph remain for Dashboard work. |
| Temporary files/evidence review | Complete | Sanitized evidence records results only; no credentials, tokens, or private user records are included. |
| Browser sessions/dialogs | Not applicable | No browser case was selected. |

#### Follow-up

- Use the retained Mentor, Tutor, two linked Students, two separate Courses, and two separate Classrooms as the backend fixture for the next Student Dashboard slice.
- Relationship reassignment, Guardians, availability, lesson requests, Calendar events, and credits remain outside Phase 2.A.

### RUN-20260719-001 — First disposable local migration and database characterization run

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Replay the complete migration chain, provision deterministic synthetic actors through trusted paths, and execute the first five rollback RPC/RLS characterizations. |
| Started | 2026-07-19T19:24:29Z |
| Finished | 2026-07-19T19:39:01Z |
| Executor | Codex `/root` |
| Environment | LOCAL-SUPABASE |
| Source revision | `8bd63a4c9b9f3a2812cedeecb046e1550a7d1da8` with 103-entry dirty working tree; exact Phase 8.4 files remain in the shared workspace |
| Database | Local project `kelptutoring.com-main`; confirmed disposable by user |
| Migration state | Ten migrations applied in order through `202607190001_course_practice_delivery.sql` |
| Database reset | Yes — guarded `db reset --local` completed |
| Browser/runtime | Node.js runner, Supabase CLI, Docker PostgreSQL `psql`; no browser cases selected |
| Evidence folder | `evidence/RUN-20260719-001/` |

#### Selection rationale

Phase 8.2 found a critical sign-up/bootstrap trust issue and an answer-delivery projection weakness; Phase 8.3 prepared guarded local execution and removed arbitrary-profile/direct-role setup from the SQL scripts. This run selects only catalog cases whose central server assertions are exercised by the five database characterizations. Relationship scoping, browser journeys, cancellation, lost-response replay, written review, and other Draft boundaries remain outside this run.

#### Results

| Test ID | Result | Evidence | Defect/blocker | Notes |
| --- | --- | --- | --- | --- |
| PUB-001 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Tutor form/exam direct publication was denied; review submission succeeded. |
| PUB-002 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Independent reviewer approval succeeded and owner self-review was denied. |
| PUB-003 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Trusted publication metadata and audit events were asserted. |
| PUB-004 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Privileged direct publication of owned eligible drafts succeeded. |
| CURR-002 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Mentor proposal was allowed while canonical creation was denied. |
| CURR-004 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Administrator approval created and linked the canonical node/event. |
| CURR-008 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Stable update/archive behavior and active-child denial passed. |
| QBANK-003 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Incomplete classification blocked publication. |
| QBANK-004 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Approval synchronized the reviewed primary curriculum link. |
| QBANK-007 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Text, difficulty, category, and descendant filtering passed. |
| QBANK-009 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Direct eligible item lookup retained the classification/path contract. |
| COURSE-001 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Mentor composition was allowed and tutor composition was denied. |
| COURSE-002 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Stable destination and cross-curriculum denial passed. |
| COURSE-008 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Duplication created an independent ID and retained source references. |
| COURSE-009 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Archive/delete lifecycle preserved source questions. |
| ASSIGN-004 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Answer-safe delivery and private grading snapshots remained separate. |
| ASSIGN-005 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Assigned-student visibility passed and outsider access was denied. |
| ASSIGN-006 | PASS | [Run summary](./evidence/RUN-20260719-001/run-summary.md) | — | Immutable assignment snapshots survived source-course deletion. |

#### Unexpected observations

- The sandbox initially denied the Supabase CLI's user-level telemetry write; approved local CLI access resolved the environmental restriction before reset.
- The generic local Supabase wrapper exposed local development credentials in raw `start` output. The wrapper now redacts credential-bearing fields, and live `supabase:status` output verified the fix. No credential values were copied into the run log or evidence.
- Several optional local services were stopped, while the API, database, Auth, REST, Studio, and other services required by this run remained available. This did not block the selected cases.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Reset applied ten migrations; all five scripts reached `ROLLBACK`; post-run scan found zero characterization rows. |
| Synthetic accounts/data | Retained intentionally | Eight verified local-only Auth identities remain for the next acceptance phase. |
| Temporary files/evidence review | Complete | Sanitized run summary contains no credentials, tokens, or production/personal data; ephemeral password was removed from the process environment. |
| Browser sessions/dialogs | Not applicable | No browser case selected. |

#### Follow-up

- Use the retained disposable stack and synthetic actors for the next selected browser/API journeys; cases outside this run remain `NOT_RUN` in the coverage map.
