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

### RUN-20260731-009 — Effective Course End and frontend future-lane authority

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Apply the active effective-end projection and prevent former cadence weekdays from leaking into a successor Schedule's future lane. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31; exact UTC timestamp not captured |
| Executor | User PowerShell run; Codex `/root` source verification |
| Environment | LOCAL-SUPABASE plus local Node source tests |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Disposable local project `kelptutoring.com-main`, port 54322 |
| Migration state | Applied through `202607310011_course_schedule_frontend_future_lane.sql` |
| Database reset | Not required; each characterization rolled back |
| Evidence | User-supplied command transcript plus the dedicated three-case cadence-change regression gate |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| LOCAL-PREFLIGHT | PASS | — | Local project URL and database port passed preflight. |
| MIGRATION-010-011 | PASS | — | Effective Course End and frontend future-lane migrations applied successfully. |
| SRC-CADENCE-CHANGE-3 | PASS | — | Studied retention, unfinished reflow, post-change reversal, and publication-lane exclusivity all passed as three named tests. |
| DB-ROLLBACK-35 | PASS | — | All 35 rollback database characterizations passed. |
| DB-POST-RUN-AUDIT | PASS | — | Nine actors verified; zero characterization rows retained. |

#### Unexpected observations

- None.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Every database characterization rolled back. |
| Synthetic accounts/data | Clean | The post-run audit verified all nine actors and found no retained characterization rows. |
| Temporary files/evidence review | Complete | No credentials or private records were recorded. |
| Browser sessions/dialogs | Not applicable | This was an automated migration and database checkpoint. |

#### Follow-up

- Keep `test:schedule-cadence-change-regressions` wired into both the pre-database Classroom/Calendar gate and the complete Schedule source suite.

### RUN-20260731-008 — Combined cadence and active-Version Calendar parity source checkpoint

| Field | Value |
| --- | --- |
| Status | Source complete; local database verification pending |
| Purpose | Fill every valid cadence opportunity after combining Tracks and make Student Calendars read the same current active Schedule Version as Tutor and Mentor Calendars. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31; exact UTC timestamp not captured |
| Executor | Codex `/root`; local migration and database rerun delegated to the user's PowerShell because Docker spawning is blocked in the desktop sandbox |
| Environment | LOCAL-STATIC; LOCAL-SUPABASE pending |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Pending migration of disposable local project `kelptutoring.com-main`, port 54322 |
| Migration state | Pending `202607310003_combined_cadence_and_student_calendar_parity.sql` |
| Database reset | Not run |
| Evidence | Focused exact-date cadence regression, full Student/staff event-set parity contract, and complete Schedule source suite |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-CADENCE | PASS | — | The exact nine-Session Monday/Saturday lane is Aug 8, 10, 15, 17, 22, 24, 29, 31, and Sep 5; no Track boundary gaps remain. |
| SRC-CONSUMER-PARITY | PASS | — | Student Calendar wrappers are bound to the current role-aware active-Version Classroom reader, with bidirectional full-array database assertions. |
| SRC-SCHEDULE-COMPLETE | PASS | — | Complete Schedule source suite result recorded after the final verification pass. |
| DB-ROLLBACK-35 | PENDING | Local migration not yet applied | Run `npm.cmd run supabase:test:db` after applying migration `202607310003`. |
| DB-POST-RUN-AUDIT | PENDING | Database suite not yet run | Run `npm.cmd run supabase:audit` after the rollback suite. |

#### Unexpected observations

- Each Track batch had a valid local cadence, but composing those already-dated batches left valid combined-Schedule opportunities vacant.
- Student Dashboard and Classroom wrappers retained an older PostgreSQL function binding even though Tutor and Mentor views had moved to the current role-aware reader.

#### Cleanup

| Item | Status | Notes |
| --- | --- |
| Database transaction/reset | Not applicable | Source-only checkpoint; user local migration is pending. |
| Synthetic accounts/data | Unchanged | Manual-QA network was not modified. |
| Temporary files/evidence review | Complete | No credentials or private records were captured. |
| Browser sessions/dialogs | Not applicable | The user's authenticated screenshots supplied the reproduction. |

#### Follow-up

- Apply migration `202607310003`, hard-refresh the Builder, and publish the continuation once so the immutable active Version receives the repaired combined lane.
- Run all rollback database characterizations and the nine-actor zero-residue audit, then compare Student and Mentor August Calendars again.

### RUN-20260731-007 — Delivered-occurrence target reflow source checkpoint

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Keep immutable Class delivery history separate from curriculum completion so a future unfinished target follows a revised continuation cadence. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31; exact UTC timestamp not captured |
| Executor | Codex `/root`; local database rerun delegated to the user's PowerShell because Docker spawning is blocked in the desktop sandbox |
| Environment | LOCAL-STATIC and disposable LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Disposable local project `kelptutoring.com-main`, port 54322 |
| Migration state | Applied through `202607310002_course_schedule_delivery_target_reflow.sql` |
| Database reset | No; database characterization is rollback-only |
| Evidence | Focused cadence, continuation, Builder preload, adapter, and complete Schedule source suites |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-SCHEDULE-ADAPTER | PASS | — | Delivered-linked unfinished targets remain selected and reflow onto the revised future cadence; past and Studied dates remain fixed. |
| SRC-BUILDER-PRELOAD | PASS | — | A delivered occurrence starts its Track but no longer misclassifies its unfinished target as locked historical work. |
| SRC-CONTINUATION | PASS | — | Started-Track removal protection remains intact without treating delivery as curriculum completion. |
| SRC-CADENCE | PASS | — | Exact Tuesday/Saturday multi-week lanes and delivered-target reflow contracts passed. |
| SRC-SCHEDULE-COMPLETE | PASS | — | The complete `test:schedule-phase` source suite passed, including all 252 linked Track Sessions. |
| DB-ROLLBACK-35 | PASS | — | All 35 rollback database characterizations passed after applying migration `202607310002`. |
| DB-POST-RUN-AUDIT | PASS | — | All nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- Class delivery and curriculum completion had been collapsed into one structural lock. That made unfinished targets from delivered Review, Exam, Practice, or pivot occurrences ignore a newly selected cadence even though the corresponding Studied facts were correctly frozen on July 30.

#### Cleanup

| Item | Status | Notes |
| --- | --- |
| Database transaction/reset | Complete | The migration applied successfully; all 35 characterizations reached their rollback boundary. |
| Synthetic accounts/data | Retained intentionally | Existing manual-QA network was not changed. |
| Temporary files/evidence review | Complete | No credentials or private records were captured. |
| Browser sessions/dialogs | Complete | Isolated inspection tabs were closed; the user's authenticated browser supplied the visual reproduction. |

#### Follow-up

- Republish the continuation with Tuesday/Saturday selected. The already immutable active Version is intentionally not rewritten by the migration itself.

### RUN-20260731-006 — Student Dashboard/Classroom Calendar exact-event parity follow-up

| Field | Value |
| --- | --- |
| Status | In progress |
| Purpose | Eliminate the Student-only split between the complete Dashboard Calendar and the partial independently assembled Classroom Calendar, then prevent event-set drift. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | — |
| Executor | Codex `/root`; local database rerun delegated to the user's PowerShell because Docker spawning is blocked in the desktop sandbox |
| Environment | LOCAL-STATIC; retained LOCAL-SUPABASE verification pending |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Disposable local project `kelptutoring.com-main`, port 54322 |
| Migration state | Applied through `202607310001_calendar_pdf_presentation_parity.sql`; no new migration is required for this consumer routing fix |
| Database reset | No; database characterization is rollback-only |
| Evidence | Student Dashboard, Classroom Calendar, consumer-parity, and aggregate Classroom Calendar follow-up source suites |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-STUDENT-DASHBOARD | PASS | — | Canonical Student Calendar consumer and Dashboard shell contracts passed. |
| SRC-CLASSROOM-CALENDAR | PASS | — | Student Classroom routing uses the Classroom-filtered Student reader; Tutor/Mentor routing retains the role-aware reader. |
| SRC-CONSUMER-PARITY | PASS | — | Calendar identity, timezone, role, failure, color, destination, and legacy-isolation contracts passed. |
| SRC-CLASSROOM-FOLLOWUP | PASS | — | Home, Calendar, Lesson Request, coverage, continuation, cadence, and multi-curriculum aggregate checks passed. |
| DB-ROLLBACK-35 | BLOCKED | Desktop sandbox returned `spawn EPERM` when the acceptance runner attempted to start Docker. | Strengthened characterization now compares count and complete bidirectional event identity between Classroom and Dashboard timelines. Run `npm.cmd run supabase:test:db` in project PowerShell. |
| DB-POST-RUN-AUDIT | NOT_RUN | Awaiting database characterization. | Run `npm.cmd run supabase:audit` after the rollback suite passes. |

#### Unexpected observations

- The role-aware Classroom endpoint independently reconstructed Schedule groups. That path is still necessary for Tutor and Mentor viewers, but using it for a Student allowed a partial milestone list even though the Student-specific Classroom-filtered canonical reader already existed.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Not started | Docker could not be spawned; no database mutation occurred. |
| Synthetic accounts/data | Retained intentionally | Existing manual-QA network was not changed. |
| Temporary files/evidence review | Complete | No credentials or private records were captured. |
| Browser sessions/dialogs | Retained | User's authenticated side-by-side browser comparison supplied the reproduction evidence. |

#### Follow-up

- Run the rollback database suite and audit locally, then refresh both pages and compare the same month again. With one active Course, the two counts and event dates must match exactly.

### RUN-20260731-005 — Phase 5.G.2.4.5.3 Calendar/PDF presentation parity source checkpoint

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify item-specific academic identity and branch-qualified module colors across Calendar and PDF consumers while reserving whole-Course coverage for lifecycle/document metadata. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31; exact UTC timestamp not captured |
| Executor | Codex `/root` |
| Environment | LOCAL-STATIC and retained LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Disposable local project `kelptutoring.com-main`, port 54322 |
| Migration state | Applied through `202607310001_calendar_pdf_presentation_parity.sql` |
| Database reset | No; every database characterization used its own rollback transaction |
| Evidence | Focused Calendar/PDF checks, complete Classroom and Schedule source suites, 35 database characterizations, and post-run audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-CLASSROOM-PHASE | PASS | — | Complete Classroom source suite passed, including Dashboard Calendar, Classroom Calendar, PDF, and cross-consumer contracts. |
| SRC-SCHEDULE-PHASE | PASS | — | Complete Schedule source suite passed, including canonical branch identity, coverage, module keys, destinations, pacing, continuation, and replacement regressions. |
| CALENDAR-PDF-5G2453 | PASS | — | Focused contracts verify item academic paths, selected pathways, branch-qualified colors, lifecycle whole-Course coverage, PDF coverage metadata, and PDF row paths. |
| DB-MIGRATION-202607310001 | PASS | — | The Calendar/PDF presentation-parity migration applied successfully to the retained local stack. |
| DB-ROLLBACK-35 | PASS | — | All 35 canonical rollback database characterizations passed. |
| DB-POST-RUN-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The pre-existing main Student Calendar resolved raw module keys while the Classroom Calendar used branch-qualified keys; the new wrapper makes all Calendar consumers resolve the same canonical item branch before applying member-private colors.
- The PDF snapshot retained module grouping but omitted whole-Course coverage metadata and per-row academic paths; both are now explicit without splitting the Student-facing Schedule.
- The managed sandbox could not spawn Docker (`spawn EPERM`), so the user completed the canonical migration, database, and audit commands in local PowerShell without changing their scope.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transactions | Complete | All 35 characterizations passed and rolled back. |
| Synthetic accounts/data | Retained intentionally | The nine deterministic actors remain unchanged. |
| Temporary files/evidence review | Complete | No temporary artifacts retained. |

#### Follow-up

- Begin Phase 5.G.2.4.6 mixed-coverage verification and documentation.

### RUN-20260731-004 — Phase 5.G.2.4.7.4 consolidated regression checkpoint

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Close the Schedule progress, pacing, revision, qualification, History, and cleanup regression checkpoint before returning to Calendar/PDF parity. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31T04:23:06Z |
| Executor | Codex `/root` |
| Environment | LOCAL-STATIC and retained LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Disposable local project `kelptutoring.com-main`, port 54322 |
| Migration state | Applied through `202607300011_course_schedule_builder_cadence_persistence.sql` |
| Database reset | No; every database characterization used its own rollback transaction |
| Evidence | Complete Classroom/Schedule source suites, consolidated checkpoint, 35 database characterizations, and post-run audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-CLASSROOM-PHASE | PASS | — | Complete Classroom source suite passed. |
| SRC-SCHEDULE-PHASE | PASS | — | Complete Schedule source suite passed with the new consolidated checkpoint registered at the end. |
| SCHEDULE-5G2474-CHECKPOINT | PASS | — | Role parity, staff explanations, modal behavior, pre-start authority, six-hour locks, Adaptive/Static pacing, Track replacement, qualifications, History, and cleanup wiring passed. |
| DB-ROLLBACK-35 | PASS | — | All 35 canonical rollback database characterizations passed with the canonical nine-actor fixture. |
| DB-POST-RUN-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained, including nested Phase-key patterns. |

#### Unexpected observations

- The sandbox denied Docker named-pipe access (`spawn EPERM`), although the local database remained reachable. The same canonical SQL files, actor variables, `ON_ERROR_STOP`, and rollback semantics were therefore executed directly through the bundled PostgreSQL client against `127.0.0.1:54322`.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transactions | Complete | All 35 characterizations rolled back. |
| Synthetic accounts/data | Retained intentionally | The nine deterministic acceptance actors remain unchanged. |
| Residue audit | Complete | Zero characterization rows retained. |
| Temporary files/evidence review | Complete | No temporary database or evidence artifacts retained. |

#### Follow-up

- Resume Phase 5.G.2.4.5.3 Calendar/PDF and remaining presentation parity.

### RUN-20260731-003 — Viewport-safe helpers and four-state Builder presentation

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Contain Classroom Home helper panels within the visible viewport, distinguish all retained/new Builder states, and make fresh Review-and-reorder modules start minimized. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31T04:06:42Z |
| Executor | Codex `/root` |
| Environment | LOCAL-STATIC |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Not mutated |
| Migration state | Unchanged; source-only presentation and contract slice |
| Database reset | Not applicable |
| Evidence | Focused tests plus complete Classroom and Schedule source-suite output |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-CLASSROOM-HOME-LAYOUT | PASS | — | Right-edge and offset visual-viewport fixtures verify horizontal clamping, opening direction, height limits, and internal overflow behavior. |
| SRC-SCHEDULE-MULTI-BRANCH | PASS | — | Green Studied, red dropped, yellow former, blue recent, and equal-segment mixed-module presentation passed. |
| SRC-SCHEDULE-OUTLINE | PASS | — | Existing and newly added Review-and-reorder modules start minimized. |
| SRC-CLASSROOM-PHASE | PASS | — | The complete Classroom source suite passed. |
| SRC-SCHEDULE-PHASE | PASS | — | The complete Schedule source suite passed. |

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Not applicable | No database writes or migrations. |
| Synthetic accounts/data | Not applicable | No accounts or records created. |
| Temporary files/evidence review | Complete | No temporary evidence retained. |
| Browser sessions/dialogs | Not applicable | No browser session was opened. |

#### Follow-up

- Continue Phase 5.G.2.4.7.4 regression and documentation coverage before returning to Calendar/PDF parity.
- Confirm helper containment and four-state gradients in the user's authenticated manual-QA session.

### RUN-20260731-002 — Student Log and printable staff-audit grouping

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Prevent one Schedule publication from flooding the Student Log, retain one shared explanation, restore deliberate Home collapse motion, and prevent large staff-audit Versions from printing as empty pages. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31T03:51:52Z |
| Executor | Codex `/root` |
| Environment | LOCAL-STATIC; unauthenticated local-browser boundary check |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Not mutated |
| Migration state | Unchanged; source-only presentation and contract slice |
| Database reset | Not applicable |
| Evidence | Focused tests plus complete Classroom and Schedule source-suite output |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-CLASSROOM-HOME-LAYOUT | PASS | — | Slower grid/content transition and reduced-motion coverage passed. |
| SRC-CLASSROOM-HISTORY | PASS | — | Builder-command grouping, Included/Dropped action groups, one shared explanation, second-level timestamps, and printable-pagination assertions passed. |
| SRC-CLASSROOM-PHASE | PASS | — | The complete Classroom source suite passed. |
| SRC-SCHEDULE-PHASE | PASS | — | The complete Schedule source suite passed. |
| UI-AUTHENTICATED-VISUAL | BLOCKED | The isolated in-app browser had no authenticated local session. | Navigation correctly reached the Kelp sign-in boundary; no credentials were requested or transmitted. |

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Not applicable | No database writes or migrations. |
| Synthetic accounts/data | Not applicable | No accounts or records created. |
| Temporary files/evidence review | Complete | No temporary evidence retained. |
| Browser sessions/dialogs | Complete | The isolated verification tab was finalized. |

#### Follow-up

- Continue with Phase 5.G.2.4.7.3.3, Builder state presentation and Review-and-reorder ergonomics.
- Confirm grouped Log expansion and a multi-page staff audit in the user's authenticated manual-QA session.

### RUN-20260731-001 — Explicit published-cadence reopen regression

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Prevent a published Monday/Wednesday/Friday Schedule from reopening as a seven-day Fixed period after a later Builder edit. |
| Started | 2026-07-31; exact UTC timestamp not captured |
| Finished | 2026-07-31; exact UTC timestamp not captured |
| Executor | Codex `/root` source execution and user terminal database execution |
| Environment | LOCAL-STATIC and retained disposable LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Local project `kelptutoring.com-main`; disposable Docker-backed Supabase |
| Migration state | Applied through `202607300011_course_schedule_builder_cadence_persistence.sql` |
| Database reset | No |
| Evidence | Active-task focused and complete Schedule-suite output |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-SCHEDULE-CADENCE-CONTINUATION | PASS | — | Exact M/W/F reopen, seven-day fallback rejection, repeat projection reads, receipt retention, and prerequisite-suite wiring passed. |
| SRC-SCHEDULE-PHASE | PASS | — | The complete Schedule source suite passed with the strengthened regression. |
| DB-SCHEDULE-QUALIFICATION-PUBLICATION | PASS | — | The strengthened M/W/F persistence, repeat reopen, fallback rejection, and publication-receipt assertions passed within database characterization 23 of 35. |
| DB-ALL | PASS | — | All 35 rollback database characterizations passed. |
| AUDIT | PASS | — | Nine deterministic acceptance actors were verified and zero characterization rows remained. |

#### Follow-up

- Continue with Phase 5.G.2.4.7.3.2, Student Log and staff audit grouping.

### RUN-20260730-006 — Builder cadence-metadata persistence follow-up

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify that a published Mon/Wed/Fri Builder cadence is stored on the immutable successor and reopens unchanged, including safe repair of Versions affected before the fix. |
| Started | 2026-07-30; exact UTC timestamp not captured |
| Finished | 2026-07-31; exact UTC timestamp not captured |
| Executor | Codex `/root` implementation and user terminal database execution |
| Environment | LOCAL-STATIC and retained disposable LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Local project `kelptutoring.com-main`; disposable Docker-backed Supabase |
| Migration state | Applied through `202607300011_course_schedule_builder_cadence_persistence.sql` |
| Database reset | No |
| Evidence | Focused source-suite output in the active task; authenticated screenshot of the stale fixed-period reopen |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-SCHEDULE-CADENCE-CONTINUATION | PASS | — | Persistence/preload, draft precedence, navigation placement, weekday lanes, continuation locks, and receipt-based repair contracts passed. |
| SRC-SCHEDULE-QUALIFICATION-PUBLICATION | PASS | — | Governed publication source contracts passed. |
| SRC-SCHEDULE-BUILDER | PASS | — | All 252 Track Sessions remain linked. |
| SRC-SCHEDULE-BUILDER-ADAPTER | PASS | — | Builder-to-governed-publication adapter contracts passed. |
| SRC-SCHEDULE-PHASE | PASS | — | The complete Schedule source suite passed after the persistence repair. |
| DB-ALL | PASS | — | All 35 rollback database characterizations passed after applying `202607300011`. |
| AUDIT | PASS | — | Nine deterministic acceptance actors were verified and zero characterization rows remained. |

#### Follow-up

- The migration and original persistence characterization are verified. RUN-20260731-001 tracks the more explicit regression diagnostics added afterward.

### RUN-20260730-005 — Cadence authority and continuation-date regression

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify active-cadence preload, intentional draft cadence restoration, exact weekly sequencing, valid replacement starts, continuation locks, Practiced-item retention/reflow, and Builder navigation placement. |
| Started | Not captured; interactive user-terminal execution on 2026-07-30 |
| Finished | 2026-07-31T02:38:14Z |
| Executor | User terminal with Codex `/root` implementation and browser verification |
| Environment | Retained disposable LOCAL-SUPABASE plus local browser |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 dirty working tree |
| Database | Local project `kelptutoring.com-main`; disposable Docker-backed Supabase |
| Migration state | Applied incrementally through `202607300010_course_schedule_practiced_date_reflow.sql` |
| Database reset | No |
| Evidence | User-terminal source and database output plus focused local-browser layout inspection |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-SCHEDULE-CADENCE-CONTINUATION | PASS | — | Active cadence survives untouched Session-selection drafts; explicit draft edits remain recoverable; weekly lanes, replacement floors, continuation locks, and Practiced reflow/retention passed. |
| SRC-SCHEDULE-PHASE | PASS | — | The complete Schedule source phase passed. |
| BROWSER-BUILDER-NAVIGATION | PASS | — | Back is absent from the page-level header and rendered after the Builder workflow. |
| DB-ALL | PASS | — | All 35 rollback database characterizations passed, including strengthened qualification-publication assertions. |
| AUDIT | PASS | — | Nine deterministic acceptance actors were verified and zero characterization rows remained. |

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database characterization rows | Complete | Every characterization rolled back; the audit found zero retained rows. |
| Interactive manual-QA graph | Retained intentionally | Existing local Mentor/Tutor/Student data was not reset or replaced. |
| Credentials | Clean | No password, key, token, or private evidence was recorded. |
| Browser sessions/dialogs | Complete | The temporary local verification tab was closed. |

#### Follow-up

- Continue the remaining 5.G.2.4.7.4 regression checkpoint after visual confirmation of cadence restoration in the authenticated Course workflow.

### RUN-20260730-004 — Active-Schedule continuation and replacement verification

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify locked-start continuation, future-only cadence recalculation, untouched-Track removal, started-Track protection, delivered-Class recognition, and complete-replacement history isolation. |
| Started | Not captured; interactive user-terminal execution on 2026-07-30 |
| Finished | 2026-07-31T00:19:58Z |
| Executor | User terminal with Codex `/root` implementation and compatibility repair |
| Environment | Retained disposable LOCAL-SUPABASE |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 dirty working tree |
| Database | Local project `kelptutoring.com-main`; disposable Docker-backed Supabase |
| Migration state | Applied incrementally through `202607300009_schedule_continuation_replacement_guard.sql` |
| Database reset | No |
| Evidence | User-terminal source-suite output, 35 rollback database characterizations, and nine-actor zero-residue audit |

#### Selection rationale

Phase 5.G.2.4.7.3 distinguishes an ordinary active-plan continuation from an explicit replacement. The run therefore selected Builder preload and presentation contracts, future-only cadence behavior, started work from Studied, Practiced, or delivered outcomes, Reviewed-only exclusion, untouched-Track removal, continuing-Version immutability, complete replacement, retained History, the complete rollback suite, and residue cleanup.

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-SCHEDULE-CONTINUATION | PASS | — | Locked start, future cadence continuation, revision classification, delivered-Class protection, and selected-Session presentation passed. |
| SRC-CLASSROOM-CALENDAR-FOLLOWUP | PASS | — | Classroom Home layout, Calendar, Lesson Request, Version coverage, consumer parity, continuation, and multi-curriculum Home contracts passed. |
| DB-QUALIFICATION-PUBLICATION | PASS | — | Started-Track protection, delivered occurrence recognition, immutable continuing items, and replacement publication boundaries passed in the existing characterization. |
| DB-ALL | PASS | — | All 35 rollback database characterizations passed. |
| AUDIT | PASS | — | Nine deterministic acceptance actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first migration attempt targeted the thin Phase 5.G.2.4.7.2 pacing wrapper instead of its retained governed Builder implementation. Migration `202607300009` now patches the implementation function beneath that wrapper.
- The first database rerun used noon today as an explicit back-report timestamp, which is future-dated when the suite runs before noon. The characterization now uses one minute before server time and statically rejects the time-of-day-sensitive form.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database characterization rows | Complete | Every characterization rolled back; the audit found zero retained rows. |
| Interactive manual-QA graph | Retained intentionally | Existing local Mentor/Tutor/Student data was not reset or replaced. |
| Credentials | Clean | No password, key, token, or private evidence was recorded. |
| Browser sessions/dialogs | Not applicable | This checkpoint used source contracts and rollback database characterizations. |

#### Follow-up

- Proceed to 5.G.2.4.7.4 for the consolidated regression and documentation checkpoint before resuming Calendar/PDF parity.

### RUN-20260730-003 — Adaptive/Static pacing and Student Class-hold verification

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify Adaptive/Static effective-date behavior and the simplified rule that blocks Student Studied marks during an actual timed Class’s six-hour hold without blocking Reviewed or Practiced progress. |
| Started | Not captured; interactive user-terminal execution on 2026-07-30 |
| Finished | 2026-07-30T22:08:25Z |
| Executor | User terminal with Codex `/root` implementation and characterization repair |
| Environment | Retained disposable LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | Local project `kelptutoring.com-main`; disposable Docker-backed Supabase |
| Migration state | Applied incrementally through `202607300008_student_studied_class_hold.sql` |
| Database reset | No |
| Evidence | User-terminal source-suite output, 35 rollback database characterizations, and nine-actor zero-residue audit |

#### Selection rationale

Phase 5.G.2.4.7.2 changes effective Schedule dates and protects a Tutor’s prepared lesson plan. The run therefore selected independent/date-only reflow, timed recurring reflow outside the hold, Static frozen dates, Student Studied rejection inside the hold, Reviewed/Practiced availability, append-only policy/mapping history, role isolation, the complete rollback database suite, and residue cleanup.

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-CLASSROOM-CALENDAR-FOLLOWUP | PASS | — | Classroom Home layout, Classroom Calendar, Lesson Request foundation, Schedule Version coverage, consumer parity, and multi-curriculum Classroom Home source contracts passed. |
| DB-SCHEDULE-PACING | PASS | — | The 35th characterization verified Adaptive/Static behavior, date-only fallback, timed-Class Student Studied rejection, absence of residual progress/locks/reflow, and continued Reviewed/Practiced access. |
| DB-ALL | PASS | — | All 35 rollback database characterizations passed. |
| AUDIT | PASS | — | Nine deterministic acceptance actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first pacing rerun exposed a `psql` fixture variable inside a dollar-quoted `DO` block, where substitution is unavailable. The fixture now uses a transaction-local setting, and its source test rejects future instances of the same pattern.
- The next rerun correctly denied the authenticated Student direct `SELECT` access to `course_progress_events`. Internal no-residue assertions now run as the database owner; the Student-facing assertion remains a black-box RPC/projection check. No ledger privilege was broadened.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database characterization rows | Complete | Every characterization rolled back; the audit found zero retained rows. |
| Interactive manual-QA graph | Retained intentionally | Existing local Mentor/Tutor/Student data was not reset or replaced. |
| Credentials | Clean | No password, key, token, or private evidence was recorded. |
| Browser sessions/dialogs | Not applicable | This checkpoint used source contracts and rollback database characterizations. |

#### Follow-up

- Proceed to 5.G.2.4.7.3 for active-Schedule continuation, cadence changes, and complete-replacement UX.

### RUN-20260730-001 — Four-account interactive manual-QA network verification

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Provision and verify the simplified Mentor → Tutor → Student graph used for manual Schedule and Classroom journeys, then rerun its dependent source contracts, complete rollback database suite, and residue audit. |
| Started | Not captured; interactive user-terminal execution on 2026-07-30 |
| Finished | 2026-07-30T17:34:59Z (checkpoint recorded after the terminal run) |
| Executor | User terminal with Codex `/root` implementation and fixture preparation |
| Environment | Retained disposable LOCAL-SUPABASE |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 dirty working tree |
| Database | Local project `kelptutoring.com-main`; disposable Docker-backed Supabase |
| Migration state | Applied incrementally through `202607260017_course_schedule_audit_publication_reasons.sql` |
| Database reset | No |
| Evidence | User-terminal provisioning output, six dependent source suites, 34 rollback database characterizations, and nine-actor zero-residue audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| FIXTURE-MANUAL-QA-GRAPH | PASS | — | Provisioning verified Aldebarã as the sole Mentor, Thiago Kelp as the sole Tutor, Thiago D. as the recurring Algebra 1 Student, and Thiago Dias as the on-demand Mechanics Student. |
| FIXTURE-MANUAL-QA-TRACKS | PASS | — | The two active Courses retain 16 generated curriculum rows sourced from canonical Track Sessions with durable Session-page destinations; exact predecessor sandbox Courses remain inactive history. |
| SRC-MANUAL-QA-DEPENDENCIES | PASS | — | Classroom Home layout, Classroom Calendar, Lesson Request foundation, Schedule Version coverage, Schedule consumer parity, and multi-curriculum Classroom Home contracts passed before database execution. |
| DB-ALL | PASS | — | All 34 rollback database characterizations passed. |
| AUDIT | PASS | — | Nine deterministic acceptance actors were verified and zero characterization rows remained. |

#### Unexpected observations

- None.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database characterization rows | Complete | Every characterization rolled back; the audit found zero retained rows. |
| Interactive manual-QA graph | Retained intentionally | The four-account graph is durable local test data and can be restored idempotently without changing passwords. |
| Legacy sandbox Courses | Retained inactive | Known predecessor Courses remain available as history and are excluded from active manual-QA views. |
| Credentials | Clean | Provisioning required no password entry and no credential or token was recorded. |

#### Follow-up

- Use the four accounts for authenticated visual Schedule/Classroom journeys; rerun `supabase:provision:manual-qa` after any local database reset.

### RUN-20260727-001 — Former-Schedule audit completion and Classroom test network

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Preserve every authoritative Builder publication reason in printable staff Schedule audit history and provision a reset-safe local Mentor/Tutor/Student/Classroom graph for authenticated journeys. |
| Started | 2026-07-27T03:10:00Z |
| Finished | 2026-07-27T03:18:23Z |
| Executor | User terminal reset/provision plus Codex source, direct-local-PostgreSQL, and audit verification |
| Environment | LOCAL-STATIC plus disposable LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Database | `kelptutoring.com-main`; disposable local Docker-backed Supabase |
| Migration state | Applied incrementally through `202607260017_course_schedule_audit_publication_reasons.sql` |
| Database reset | Yes; user-run immediately before remediation, followed by additive migrations `016` and `017` |
| Evidence | Complete Classroom and Schedule source suites; 34 rollback database characterizations; nine-actor audit; verified three-link supervision graph and four active Course/Classroom pairs |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SRC-CLASSROOM | PASS | — | Complete `test:classroom-phase` suite passed. |
| SRC-SCHEDULE | PASS | — | Complete `test:schedule-phase` suite passed. |
| DB-QUALIFICATION-PUBLICATION | PASS | — | Mentor printable history now includes the complete immutable Builder reason set, including private staff notes. |
| DB-ALL | PASS | — | All 34 rollback database characterizations passed. |
| AUDIT | PASS | — | Nine deterministic actors verified; zero characterization rows retained. |
| FIXTURE-CLASSROOM-NETWORK | PASS | — | Provisioning is atomic and idempotent; three supervision links and four active Classrooms were verified. |

#### Unexpected observations

- Codex desktop could not spawn Docker (`EPERM`), so the same SQL scripts and actor variables were run through local PostgreSQL port `54322`.
- The first direct port run inherited PowerShell's non-UTF-8 pipeline encoding and altered a middle-dot assertion. Repeating the complete suite with explicit UTF-8 passed all 34 tests.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database characterization rows | Complete | Every characterization rolled back; the post-run audit found zero residue. |
| Interactive Classroom fixture | Retained intentionally | The requested local relationship/Classroom graph is durable and restored by provisioning after reset. |
| Credentials | Clean | No password or token was recorded; newly created fixture users reuse the current acceptance password hash. |

### RUN-20260726-036 — Phase 5.G.2.4.5.2 Classroom/Home adaptation

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Adapt the canonical active-Version Classroom header, Schedule modules, Course progress, and Home weekly work windows to multi-curriculum coverage without coupling Assignment deadlines to meeting reflow. |
| Started | 2026-07-26T07:26:37Z |
| Finished | 2026-07-26T07:40:19Z |
| Executor | User terminal with Codex `/root` implementation and source verification |
| Environment | LOCAL-STATIC plus retained disposable LOCAL-SUPABASE |
| Source revision | Shared Phase 4/5 dirty working tree |
| Migration state | Applied incrementally through `202607260005_classroom_home_multi_curriculum.sql` |
| Database reset | No |
| Evidence | Complete Schedule and Classroom source suites; user-terminal migration output; 34 rollback database characterizations; nine-actor audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G2452-HOME-SOURCE | PASS | — | The complete Schedule source suite, complete Classroom source suite, focused Classroom Home contract, and guarded acceptance runner pass. |
| SCHEDULE-5G2452-MODULES | PASS | — | Canonical module numbering is preserved; a repeated non-contiguous module is labeled `continued`, and both qualified and legacy raw-key saves resolve to one branch-qualified color preference. |
| SCHEDULE-5G2452-DB | PASS | — | Migration `202607260005` applied and all 34 rollback database characterizations passed, including the Classroom Home contract. |
| SCHEDULE-5G2452-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The preflight UI inspection found that the client had been renumbering source modules by first appearance. This changed canonical module numbers and printed a reused module as a new full heading. The grouping contract now preserves Track-authored numbers and marks later chronological segments as continuations.
- The Codex sandbox received `permission denied` from the Docker API while attempting the rollback-only migration diagnostic. No database statement was executed.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | The migration applied incrementally; each of the 34 characterization scripts rolled back. No reset was performed. |
| Synthetic accounts/data | Unchanged | The retained local actor and exploratory fixture set remained intact. |
| Characterization rows | Complete | The post-run audit found zero retained characterization rows. |
| Browser sessions/dialogs | Not run | Authenticated visual review follows successful migration and database verification. |

#### Follow-up

- Visually review the compact coverage header, Course-progress breakdown, weekly work cards, direct destinations, and independent colors for same-numbered modules in different Tracks.
- Continue with Phase 5.G.2.4.5.3 Calendar/PDF and item-specific presentation parity.

### RUN-20260726-035 — Phase 5.G.2.4.5.1 canonical consumer projection

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Project authoritative active-Version multi-curriculum coverage, per-item academic identity, branch-qualified module presentation, and one combined Course-progress result without leaking historical replacement progress into the active Classroom. |
| Started | Not captured; user-triggered local migration and database execution on 2026-07-26 |
| Finished | 2026-07-26T06:50:48Z |
| Executor | User terminal with Codex `/root` implementation, diagnosis, compatibility migration, and source verification |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` plus local source checks |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 dirty working tree |
| Migration state | Applied incrementally through `202607260004_calendar_legacy_module_identity_compatibility.sql` |
| Database reset | No — the retained local project and exploratory fixtures were preserved |
| Evidence | User terminal output, complete Schedule source suite, 33 rollback database characterizations, and nine-actor audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G2451-COVERAGE | PASS | — | The canonical read exposes the immutable active-Version coverage, including the primary and supporting Track branches. |
| SCHEDULE-5G2451-ITEMS | PASS | — | Each active item carries its own Education level, selected academic pathways, Subject, Track, destination, and chronological branch/module context. |
| SCHEDULE-5G2451-MODULES | PASS | — | Same-numbered modules in different Tracks receive collision-resistant branch-qualified presentation identities. |
| SCHEDULE-5G2451-PROGRESS | PASS | — | One Course-progress result retains the Studied-plus-Practiced calculation and may supplement it with a per-Track breakdown without creating separate Student Schedules. |
| SCHEDULE-5G2451-HISTORY | PASS | — | Only the active Version enters the projection, so complete replacements do not leak former progress into the current Classroom Home; ordinary continuing items remain visible. |
| SCHEDULE-5G2451-CALENDAR | PASS | — | Retained legacy rows use the same `course-plan` identity, member-private colors, and pale body-color default in Classroom and Calendar. |
| SCHEDULE-5G2451-SOURCE | PASS | — | The focused projection contract, complete `test:schedule-phase` suite, and guarded acceptance-runner self-test passed. |
| SCHEDULE-5G2451-DB | PASS | — | Migrations `202607260003` and `202607260004` applied successfully and all 33 rollback database characterizations passed. |
| SCHEDULE-5G2451-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows were retained. |

#### Unexpected observations

- The first full run after `202607260003` correctly exposed a parity gap for retained legacy items without module metadata: Classroom normalized them to `course-plan`, while Calendar still treated them as module-less and selected an event-family color.
- Forward migration `202607260004` aligns Calendar with the canonical compatibility identity and existing member-private style lookup. The older Calendar characterization also used the green header color as its fallback body color; it now expects the established pale `#dcefdc` body default. No authorization, history, or parity requirement was weakened.
- The Codex process applied the migration but could not spawn the Docker-backed test runner (`spawn EPERM`). The user terminal completed the authoritative 33-test rerun and audit successfully.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | All 33 characterizations rolled back cleanly; no database reset was performed. |
| Synthetic accounts/data | Unchanged | The nine deterministic acceptance actors remain intact. |
| Characterization rows | Complete | The post-run audit found zero retained rows. |
| Temporary files/evidence review | Complete | No credentials, tokens, or private records were captured. |
| Browser sessions/dialogs | Not applicable | This checkpoint changed additive canonical projection and compatibility behavior, not the visible Classroom interface. |

#### Follow-up

- Continue with Phase 5.G.2.4.5.2 to adapt Classroom Header, Schedule, Home, and progress presentation to the verified canonical multi-curriculum projection.
- Add the missing `This week` and `Coming next` Classroom Home blocks with due dates and direct Track/Assignment destinations while keeping one combined Student Schedule.

### RUN-20260726-034 — Phase 5.G.2.4.4 qualification and publication enforcement

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Enforce complete assigned-Tutor qualification across multi-curriculum coverage, publish selected coverage and the successor Version atomically, preserve continuing progress during partial changes, and isolate former progress only during complete replacement. |
| Started | Not captured; user-triggered local migration and database execution on 2026-07-26 |
| Finished | 2026-07-26T06:01:30Z |
| Executor | User terminal with Codex `/root` implementation, diagnosis, and characterization correction |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` plus local source checks |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 dirty working tree |
| Migration state | Applied incrementally through `202607260002_course_schedule_qualification_publication.sql` |
| Database reset | No — the retained local project and exploratory fixtures were preserved |
| Evidence | User terminal output, focused migration-plus-characterization rollback, complete Schedule source suite, 32 rollback database characterizations, and nine-actor audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G244-COVERAGE | PASS | — | Every proposed branch resolves to one active canonical Education-level/Subject/Track path and contains a governed active Session. |
| SCHEDULE-5G244-QUALIFICATION | PASS | — | The assigned Tutor must hold active scope for every branch; Mentor scope cannot substitute, revoked scope rejects the whole save, and the evidence is locked and snapshotted. |
| SCHEDULE-5G244-ATOMICITY | PASS | — | Selected coverage, primary compatibility anchors, immutable successor Version, dates, reasons, notifications, and the complete idempotency receipt commit together. |
| SCHEDULE-5G244-HISTORY | PASS | — | A complete replacement starts a new plan epoch and keeps old progress with the former Schedule; partial replacement retains its epoch and keeps continuing Studied/Reviewed/Practiced work active and visible on Classroom Home. |
| SCHEDULE-5G244-BYPASS | PASS | — | Direct structural publication cannot introduce an unselected branch or bypass qualification validation. |
| SCHEDULE-5G244-SOURCE | PASS | — | The focused publication test and complete `test:schedule-phase` regression suite passed. |
| SCHEDULE-5G244-DB | PASS | — | Migration `202607260002` applied successfully and all 32 rollback database characterizations passed. |
| SCHEDULE-5G244-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows were retained. |

#### Unexpected observations

- The first full database run after migration stopped at characterization 14 because the older Builder test still expected single-Track publication, a locked Course scope, and no Tutor qualification fixture. The runtime contract was correct. The characterization now expects governed multi-Track publication, supplies a rollback-only Tutor qualification, and proves a legacy Track list cannot fabricate multi-branch coverage without governed Sessions.
- The corrected Builder characterization passed independently before the complete 32-test rerun passed. No production authorization, qualification, history, or immutability rule was weakened.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | All 32 characterizations rolled back cleanly; no database reset was performed. |
| Synthetic accounts/data | Unchanged | The nine deterministic acceptance actors remain intact. |
| Temporary qualification fixtures | Complete | Characterization-only qualification changes rolled back; the audit found zero retained rows. |
| Temporary files/evidence review | Complete | No credentials, tokens, or private records were captured. |
| Browser sessions/dialogs | Deferred by choice | Visual Builder inspection remains planned for later and is not a backend completion blocker. |

#### Follow-up

- Continue with Phase 5.G.2.4.5 to adapt Classroom, Calendar, PDF, and progress presentation to each item's own curriculum path and the Course's compact multi-curriculum coverage.
- Preserve the complete-versus-partial replacement distinction when adapting active Home and historical Schedule presentation.

### RUN-20260726-033 — Phase 5.G.2.4.3.2 Classroom preload and recovery

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Preload the exact active Classroom coverage and eligible Sessions, preserve retained history/source identity, recover missing or updated sources safely, and reject stale local drafts without enabling premature multi-branch publication. |
| Started | 2026-07-26T04:42:00Z |
| Finished | 2026-07-26T04:42:00Z |
| Executor | Codex `/root` |
| Environment | LOCAL-STATIC source checks plus retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Applied incrementally through `202607260001_classroom_builder_preload_recovery.sql` |
| Database reset | No — the retained local project and exploratory fixtures were preserved |
| Evidence | Focused Classroom-preload test, complete Schedule phase suite, Builder integrity/adapter regressions, 31 rollback database characterizations, nine-actor audit, and documentation trace |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G2432-PRELOAD | PASS | — | Active Version coverage and eligible future Sessions preload across Tracks while retained past, Studied, delivered, and dropped items remain staff-only locked context. |
| SCHEDULE-5G2432-SOURCE | PASS | — | Missing catalogue branches/Sessions remain visible from immutable snapshots; updated Track sources are called out and never silently substituted. |
| SCHEDULE-5G2432-IDENTITY | PASS | — | Retained source Session IDs map back to their stable Schedule-item keys so an unchanged successor cannot rewrite identity. |
| SCHEDULE-5G2432-STALE | PASS | — | Course-scoped drafts carry their base active Version; stale drafts are excluded from merging and kept only as read-only local recovery data. |
| SCHEDULE-5G2432-BOUNDARY | PASS | — | Multi-branch, primary-Track, missing-source, and source-update plans can be previewed but cannot publish before 5.G.2.4.4 qualification enforcement. |
| SCHEDULE-5G2432-RESPONSIVE | PASS | — | Recovery rows stack at the narrow breakpoint and all hierarchy/recovery controls retain native keyboard semantics; authenticated visual verification remains pending. |
| SCHEDULE-5G2432-REGRESSION | PASS | — | `test:schedule-classroom-preload`, `test:schedule-builder`, `test:schedule-multi-branch`, `test:schedule-builder-adapter`, the complete `test:schedule-phase` suite, and `test:supabase-acceptance` passed. |
| SCHEDULE-5G2432-DB | PASS | — | Migration `202607260001` applied successfully and all 31 rollback database characterizations passed, including the extended schema-v3 Classroom Builder context. |
| SCHEDULE-5G2432-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows were retained. |

#### Unexpected observations

- Two older Builder source tests still asserted the former single-focus wording and the removal of cross-Track Classroom traversal. Their expectations were updated to characterize the new preload/Add-content contract; no runtime or authorization invariant was weakened.
- The first combined regression output exceeded the desktop result window, so every affected suite was rerun separately and the complete Schedule suite was rerun with an exit-code-preserving bounded tail.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | The migration applied incrementally; all 31 characterizations rolled back cleanly; no reset was performed. |
| Synthetic accounts/data | Unchanged | No Auth or application records were created or changed. |
| Temporary files/evidence review | Complete | No credentials, tokens, or private records were captured. |
| Browser sessions/dialogs | Deferred by choice | The user will inspect the workflow interactively later; this is no longer a backend or completion blocker. |

#### Follow-up

- Later, open a Tutor/Mentor Classroom Builder and inspect preloaded branches, locked retained context, cross-Track addition, stale-draft recovery, and 390-pixel stacking on the spot.
- Keep multi-branch publication disabled until 5.G.2.4.4 validates every selected branch against the assigned Tutor and publishes the coverage atomically.

### RUN-20260726-032 — Phase 5.G.2.4.3.1 subject-first multi-branch Builder

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Add reusable subject-first Schedule traversal across Education levels and Subjects without enabling multi-branch Classroom publication before complete qualification enforcement. |
| Started | 2026-07-26T03:55:15Z |
| Finished | 2026-07-26T03:55:15Z |
| Executor | Codex `/root` |
| Environment | LOCAL-STATIC source and Node.js self-tests |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Unchanged through `202607250001_course_schedule_version_coverage.sql` |
| Database reset | Not applicable — source-only Builder slice |
| Evidence | Focused multi-branch test, complete Schedule phase suite, local Supabase runner self-test, and diff validation |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G2431-CATALOG | PASS | — | Catalog schema v2 carries optional Track pathway metadata; missing metadata remains null and is presented as Regular without inventing a Student goal. |
| SCHEDULE-5G2431-TRAVERSAL | PASS | — | Standalone selection persists across Education levels and Subjects with pathway grouping/filtering, one primary Track, supporting Tracks, and direct tray editing/removal. |
| SCHEDULE-5G2431-DRAFT | PASS | — | Schema-v1 browser drafts migrate to schema v2 after invalid Track/Session identities are filtered against the current catalog. |
| SCHEDULE-5G2431-COVERAGE | PASS | — | A branch enters reusable coverage only after a governed Track Session is selected; supplemental items alone cannot establish curriculum coverage. |
| SCHEDULE-5G2431-REGRESSION | PASS | — | The complete `test:schedule-phase` suite and guarded local Supabase runner self-test passed. The governed Classroom publisher retains its single-focus boundary. |

#### Unexpected observations

- Two older source characterizations still described academic pathways as mandatory Goal nodes and one retained an obsolete pre-migration status sentence. The assertions and canonical documents were updated to the agreed distinction: pathway is optional Track metadata, Student goal is separate, and the applied database `goals` array remains a compatibility field until governed multi-branch publication translates it.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Not applicable | No migration or database mutation was introduced. |
| Synthetic accounts/data | Unchanged | No Auth or application records were created. |
| Temporary files/evidence review | Complete | No credential-bearing or personal-data evidence was created. |
| Browser sessions/dialogs | Not applicable | Responsive and authenticated Classroom traversal remain in 5.G.2.4.3.2. |

#### Follow-up

- Implement 5.G.2.4.3.2 Classroom coverage preloading, missing-source recovery, keyboard behavior, and narrow-screen verification.
- Keep multi-branch Classroom publication disabled until 5.G.2.4.4 validates the assigned Tutor against every proposed curriculum branch atomically.

### RUN-20260725-031 — Phase 5.G.2.4.2 immutable Version coverage and safe backfill

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Persist one immutable multi-curriculum coverage snapshot for every retained and future Schedule Version without rewriting existing Course, Version, progress, Classroom, Membership, or academic history. |
| Started | 2026-07-25 |
| Finished | 2026-07-25 |
| Executor | Codex `/root` source verification; user local database execution |
| Environment | Local app source and retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Applied through `202607250001_course_schedule_version_coverage.sql` |
| Database reset | No — migration applied incrementally and rollback characterizations preserved retained exploratory data |
| Evidence | Focused Version-coverage test, complete Schedule phase suite, 31 rollback database characterizations, and post-run actor/residue audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G242-MIGRATION | PASS | — | Every retained Schedule Version received one equivalent immutable coverage snapshot with empty legacy Goal selection and without changing active Version IDs or history. |
| SCHEDULE-5G242-COVERAGE | PASS | — | Exactly one primary Track, supporting branches, selected-only Goals, derived compact labels, safe inheritance, and direct-mutation rejection passed. |
| SCHEDULE-5G242-RLS | PASS | — | Students received active coverage only, authorized Tutor/Mentor staff retained Version history, and unrelated accounts remained denied. |
| SCHEDULE-5G242-REGRESSION | PASS | — | All 31 rollback database characterizations passed, including the new Version-coverage case and every earlier Course Schedule, Classroom, Calendar, and adapter-privilege contract. |
| SCHEDULE-5G242-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows were retained. |

#### Unexpected observations

- The first migration attempt failed atomically because `course_schedule_coverage_display_label` used `value` both as a PL/pgSQL variable and as the implicit output column of `jsonb_array_elements`. A verbose transactional diagnostic isolated PostgreSQL error `42702`; every JSON iterator is now explicitly aliased, the scalar is named `label_part`, and the focused source test rejects unqualified iterators. No coverage invariant was weakened.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | The diagnostic transaction rolled back; the corrected migration applied incrementally; all 31 characterizations rolled back. |
| Synthetic accounts/data | Unchanged | The nine deterministic actors and retained exploratory fixtures were preserved. |
| Temporary files/evidence review | Complete | No credentials, tokens, or private records were captured. |
| Browser sessions/dialogs | Not applicable | This slice establishes persistence, migration, RLS, and database contracts; Builder traversal begins next. |

#### Follow-up

- Align Phase 5.G.2.4.3 multi-branch Builder traversal before implementation.

### RUN-20260725-030 — Phase 5.G.2.4.1 multi-curriculum vocabulary and coverage contract

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Define the governed source contract for one required Course Schedule spanning selected Sessions from several Education levels, Goals, Subjects, and Tracks without duplicating curriculum progress targets. |
| Started | 2026-07-25 |
| Finished | 2026-07-25 |
| Executor | Codex `/root` source verification |
| Environment | Local app source |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | No new migration; the persisted multi-curriculum Version coverage begins in Phase 5.G.2.4.2 |
| Database reset | Not applicable |
| Evidence | Focused coverage test, complete Schedule phase suite, existing Builder adapter and consumer-parity checks, and diff check |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G241-VOCAB | PASS | — | The ordered Education level → Goal → Subject → Track → Module → Session vocabulary and selected-only Goal labels are explicit. |
| SCHEDULE-5G241-COVERAGE | PASS | — | One Course retains one required active Schedule, exactly one primary Track, and any number of governed supporting branches. |
| SCHEDULE-5G241-AUTH | PASS | — | Tutors require qualifications across every selected branch; Mentors supervise without inheriting teaching authority; Quality Assistants retain oversight/dispute authority only. |
| SCHEDULE-5G241-TARGETS | PASS | — | A canonical Curriculum Session contributes one active progress target per Version even when several tutoring Classes discuss it; homework creates neither a Class occurrence nor a duplicate target. |
| SCHEDULE-5G241-SOURCE | PASS | — | `test:schedule-coverage`, `test:schedule-builder-adapter`, `test:schedule-consumer-parity`, and the complete `test:schedule-phase` suite passed. |

#### Unexpected observations

- One older Phase 5.E source assertion still expected the README checkpoint to stop at 5.G.2.2. It now checks both the completed 5.G.2.3 consumer gate and the new 5.G.2.4.1 contract; no runtime rule was weakened.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Not applicable | This subphase introduces no database migration or data mutation. |
| Synthetic accounts/data | Unchanged | Existing local fixtures were not touched. |
| Temporary files/evidence review | Complete | No credentials or private records were captured. |
| Browser sessions/dialogs | Not applicable | This is a source-contract slice; UI authoring begins later. |

#### Follow-up

- Align and implement Phase 5.G.2.4.2: immutable Version coverage plus a safe migration path for existing single-focus Courses.

### RUN-20260724-029 — Phase 5.G.2.3 consumer parity gate

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Lock Classroom and Calendar consumers to the same canonical identity, date, status, timezone, destination, module presentation, authorization, failure, and legacy-isolation behavior. |
| Started | 2026-07-24 |
| Finished | 2026-07-25 |
| Executor | Codex `/root` source verification; user local database execution |
| Environment | Local app source and retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | No new migration; expected through `202607240011_student_calendar_module_presentation.sql` |
| Database reset | Not applicable; characterization is rollback-only |
| Evidence | Focused parity gate, consolidated Classroom/Schedule source suites, acceptance-runner self-test, and diff check |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G23-PARITY | PASS | — | Normalized Classroom and Calendar views preserve Course/Classroom/item identity, effective date, status, Track destination, module colors, and viewer timezone. |
| SCHEDULE-5G23-ROLES | PASS | — | The rollback characterization now covers Student parity, detailed Tutor/Mentor access, and cross-Student denial. |
| SCHEDULE-5G23-FAILURE | PASS | — | Source and contract checks retain atomic Calendar failure and prohibit legacy-mirror fallback. |
| SCHEDULE-5G23-SOURCE | PASS | — | `test:schedule-phase`, `test:classroom-phase`, the focused parity gate, and the acceptance-runner self-test passed. |
| SCHEDULE-5G23-DB | PASS | — | All 30 rollback database characterizations passed, including the strengthened Student Calendar parity assertions. |
| SCHEDULE-5G23-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- One older Phase 5.E source assertion expected the README checkpoint to stop at 5.G.1. It was updated to require the current completed 5.G.2.2 checkpoint; no runtime contract was weakened.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | PASS | Every characterization rolled back; no reset was required. |
| Synthetic accounts/data | Unchanged | Existing local Mentor sandbox remains available. |
| Characterization residue | PASS | Audit reported zero retained rows. |

#### Follow-up

- Phase 5.G.2 is complete. Continue with the Phase 5.G.3 durable integration-event outbox alignment cycle.

### RUN-20260724-028 — Phase 5.G.2.1 Classroom consumer cutover

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Move Classroom Home, Schedule, progress refreshes, presentation preferences, Retry, and PDF refreshes onto the canonical Schedule read contract without changing the established interface. |
| Started | 2026-07-24 |
| Finished | 2026-07-24 |
| Executor | Codex `/root` implementation and source verification |
| Environment | Local app source with retained Phase 5.G.1 LOCAL-SUPABASE gate |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Unchanged through `202607240008_unified_schedule_read_contract.sql` |
| Database reset | Not applicable; this consumer cutover introduced no database migration |
| Evidence | Consolidated Schedule and Classroom source suites plus static syntax/diff checks |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G21-ADAPTER | PASS | — | Classroom reads only `get_my_unified_course_schedule`; no browser fallback to `get_my_effective_course_schedule` remains. |
| SCHEDULE-5G21-PARITY | PASS | — | Canonical detailed modules, Track progress, permissions, styles, PDF data, and viewer role normalize into the established Classroom interface. |
| SCHEDULE-5G21-TIMELINE | PASS | — | Past/Next/Upcoming rows and Calendar/meeting policies remain attached for later consumers without adding a duplicate visible timeline. |
| SCHEDULE-5G21-WRITES | PASS | — | Progress and presentation writes reread the canonical contract; a committed write followed by a failed refresh is reported as saved-but-not-reloaded. |
| SCHEDULE-5G21-SOURCE | PASS | — | Consolidated Schedule and Classroom source suites passed. |
| SCHEDULE-5G21-DB | PASS | — | No schema change was introduced; this run reuses the immediately preceding 30/30 Phase 5.G.1 database gate and nine-actor zero-residue audit. |

#### Unexpected observations

- The canonical RPC keeps viewer role under `viewer.actorRole` while its effective permissions are merged under `permissions`. The Classroom adapter maps that role explicitly so Student/Tutor/Mentor behavior does not regress.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database | Unchanged | No migration or data mutation was introduced. |
| Browser state | Not run | No browser UI QA was requested for this interface-preserving cutover. |
| Synthetic accounts/data | Retained intentionally | Existing local Mentor sandbox remains available. |

#### Follow-up

- Align and implement Phase 5.G.2.2 so Dashboard and Classroom Calendars consume canonical Schedule presentation metadata while Assignment deadlines remain independent.

### RUN-20260724-027 — Phase 5.G.1 canonical Schedule read contract

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the canonical role-aware Schedule read contract and its Calendar presentation boundary, then retain the Classroom Home/PDF interaction follow-up. |
| Started | 2026-07-24 |
| Finished | 2026-07-24 |
| Executor | Codex `/root` implementation and source verification; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Applied through `202607240008_unified_schedule_read_contract.sql` |
| Database reset | No; migration was applied incrementally |
| Evidence | User terminal output: preflight, migration status, complete rollback suite, and audit; consolidated Schedule and Classroom source suites |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5G1-CONTRACT | PASS | — | The canonical projection retains role redaction, module/detail permissions, meeting-state vocabulary, and viewer-local-noon Calendar anchors. |
| SCHEDULE-5G1-DB | PASS | — | All 30 rollback database characterizations passed. |
| SCHEDULE-5G1-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |
| SCHEDULE-5G1-SOURCE | PASS | — | The consolidated Schedule and Classroom source suites passed. |
| SCHEDULE-5G1-PDF | PASS | — | The focused PDF contract keeps Kelp’s repeated footer while blanking the browser’s upper page-margin timestamp/title. |
| SCHEDULE-5G1-HOME | PASS | — | The Home progress helper now participates in outside-click and Escape dismissal. |

#### Unexpected observations

- None.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | PASS | Every characterization rolled back; no reset was required. |
| Synthetic accounts/data | Retained intentionally | Existing local Mentor sandbox remains available. |
| Characterization residue | PASS | Audit reported zero retained rows. |

#### Follow-up

- Begin Phase 5.G.2 by cutting Classroom and Calendar consumers over to the canonical read contract without changing established presentation behavior.

### RUN-20260724-026 — Classroom Home and authoritative Track progress

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the default Classroom Home destination and the server-owned Studied/Practiced Track-progress summary. |
| Started | 2026-07-24 |
| Finished | 2026-07-24 |
| Executor | Codex `/root` implementation and source verification; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Applied through `202607240006_classroom_home_track_progress.sql` |
| Database reset | No; migration was applied incrementally |
| Evidence | User terminal output: preflight, migration, complete rollback suite, and audit; Codex source-suite output |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5H-HOME | PASS | — | Home is the default Classroom destination, with Overview retained as a secondary area. |
| SCHEDULE-5H-PROGRESS | PASS | — | Each active Curriculum Session contributes one Studied and one Practiced unit; Reviewed and resource-level marks do not affect the percentage. |
| SCHEDULE-5H-SOURCE | PASS | — | Complete Classroom and Schedule source suites passed, including routing, helper, confirmation, progress-date, and PDF contracts. |
| SCHEDULE-5H-DB | PASS | — | All 29 rollback database characterizations passed. |
| SCHEDULE-5H-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The Codex-managed shell rejected the local Supabase child process with Windows `spawn EPERM`; the same guarded commands passed normally in the user's project terminal. No database contract was weakened or bypassed.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | PASS | Every characterization rolled back; no reset was required. |
| Synthetic accounts/data | Retained intentionally | Existing local Mentor sandbox remains available. |
| Characterization residue | PASS | Audit reported zero retained rows. |

#### Follow-up

- Perform the authenticated Student visual check of Home against the retained Algebra Classroom; remaining Classroom Home blocks stay staged under Phase 5.H.

### RUN-20260724-025 — Classroom-scoped Builder and active progress guard

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify single-content Classroom Builder publication, immutable Studied snapshots, and active-only progress aggregation while retaining dropped history. |
| Started | 2026-07-24 |
| Finished | 2026-07-24 |
| Executor | Codex `/root` implementation; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Applied through `202607240005_classroom_builder_progress_state_guard.sql` |
| Database reset | No; migrations were applied incrementally |
| Evidence | User terminal output: complete rollback suite and audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F5-BUILDER-SCOPE | PASS | — | Classroom publication remains locked to the Course Subject/content while standalone Builder plans may combine content. |
| SCHEDULE-5F5-STUDIED-LOCK | PASS | — | Completed snapshots remain immutable while eligible future work may be replaced. |
| SCHEDULE-5F5-ACTIVE-AGGREGATION | PASS | — | Retained dropped rows remain staff history and are excluded from the active progress aggregator. |
| SCHEDULE-5F5-DB | PASS | — | All 29 rollback database characterizations passed. |
| SCHEDULE-5F5-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first `202607240004` characterization passed retained dropped history into the active Curriculum aggregator. Forward migration `202607240005` tightened the projection without deleting history or weakening the Studied lock.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | PASS | Every characterization rolled back. |
| Synthetic accounts/data | Retained intentionally | Existing local Mentor sandbox remains available. |
| Characterization residue | PASS | Audit reported zero retained rows. |

#### Follow-up

- Apply and verify `202607240006_classroom_home_track_progress.sql` for the initial Phase 5.H Classroom Home slice.

### RUN-20260724-024 — Classroom Schedule interaction and PDF inheritance follow-up

| Field | Value |
| --- | --- |
| Status | Complete for source and local database gates; authenticated visual recheck deferred |
| Purpose | Verify member-private module/PDF presentation, corrected progress re-marking, Student-only legacy-scaffold filtering, and PDF module-style inheritance. |
| Started | 2026-07-24 |
| Finished | 2026-07-24 |
| Executor | Codex `/root` implementation and source verification; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Applied through `202607240003_classroom_schedule_interaction_followup.sql` |
| Database reset | No; migrations were applied incrementally |
| Evidence | User terminal output: complete rollback suite and audit; Codex source-suite output |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F5-MIGRATIONS | PASS | — | The retained local database is applied through migration `202607240003`. |
| SCHEDULE-5F5-SOURCE | PASS | — | The complete Course-Schedule and Classroom source suites passed. |
| SCHEDULE-5F5-PDF-INHERITANCE | PASS (source) | Authenticated visual recheck deferred | Regression coverage preserves normalized module key/title and the member's selected module header color when producing the PDF snapshot. |
| SCHEDULE-5F5-PROGRESS-REMARK | PASS | — | Corrected progress may revisit a prior mapping signature without overwriting append-only history. |
| SCHEDULE-5F5-DB | PASS | — | All 29 rollback database characterizations passed. |
| SCHEDULE-5F5-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The PDF initially fell back to the default green because snapshot creation normalized already-normalized sessions a second time and discarded their top-level module identity. The contract now retains that identity, and the source regression asserts the selected lime header color.
- The authenticated PDF was not visually rechecked after this repair; the user deferred that check and further Schedule polish until the next session.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Every characterization rolled back; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | Existing deterministic and interactive local actors remain available. |
| Temporary files/evidence review | Complete | No credentials or private records were copied into this log. |
| Browser sessions/dialogs | Deferred | Resume with the authenticated PDF color check and remaining Schedule tweaks. |

#### Follow-up

- Reopen the authenticated Student Schedule and confirm that the generated PDF inherits the selected module header/row colors.
- Continue the user-directed Schedule visual and interaction refinements before advancing beyond Phase 5.F.5.

### RUN-20260724-023 — Student Schedule viewer-timezone projection

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Make Student-facing Schedule timestamps follow the current governed Profile timezone without rewriting immutable Schedule Version history. |
| Started | 2026-07-24 |
| Finished | 2026-07-24 |
| Executor | Codex `/root` implementation and source verification; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | Shared Phase 4/5 working tree |
| Migration state | Applied through `202607230012_student_schedule_viewer_timezone.sql` |
| Database reset | No; migration was applied incrementally |
| Evidence | User terminal output: preflight, migration, complete rollback suite, and audit |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F5-TIMEZONE-MIGRATION | PASS | — | Migration `202607230012` applied to the retained local database. |
| SCHEDULE-5F5-TIMEZONE-PROJECTION | PASS | — | Student effective and unified Schedule timestamps use the Profile-derived viewer timezone while staff retain authored Schedule context. |
| SCHEDULE-5F5-DB | PASS | — | All 29 rollback database characterizations passed. |
| SCHEDULE-5F5-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- None. The local migration, characterization suite, and audit completed cleanly.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Every characterization rolled back; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | Existing deterministic and interactive local actors remain available. |
| Temporary files/evidence review | Complete | No credentials or private records were copied into this log. |
| Browser sessions/dialogs | Not applicable | No browser case was selected for this database gate. |

#### Follow-up

- Apply and verify the separate module-presentation migration after its web/PDF source slice is complete.

### RUN-20260723-022 — Phase 5.F.4 unified Course-Schedule projection

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Present the active structural plan, effective progress, recurring slots, current targets, immutable locks, and latest outcomes through one role-aware Past/Next/Upcoming read model. |
| Started | 2026-07-23 |
| Finished | 2026-07-24T00:51:47Z |
| Executor | Codex `/root` implementation and source verification; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 working tree |
| Migration state | Applied through `202607230011_unified_course_schedule_projection.sql` |
| Database reset | No; migration was applied incrementally |
| Evidence | User terminal output plus the Phase 5.F.4 unified-projection and guarded-runner source suites |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F4-MIGRATION | PASS | — | Migration `202607230011` applied to the retained local database. |
| SCHEDULE-5F4-SOURCE | PASS | — | Unified projection and guarded acceptance-runner source contracts passed. |
| SCHEDULE-5F4-TIMELINE | PASS | — | One active-Version projection grouped meeting, independent-progress, and untargeted planned rows into Past, Next, and Upcoming. |
| SCHEDULE-5F4-LOCK | PASS | — | Future targets remained Planned until their immutable T−6h snapshot existed and became Confirmed afterward. |
| SCHEDULE-5F4-DE-DUPLICATION | PASS | — | Tutor-posted Studied progress remained embedded in its meeting row instead of creating a duplicate independent-progress row. |
| SCHEDULE-5F4-AUTH-PRIVACY | PASS | — | Student public detail, Tutor/Mentor/Quality Assistant staff audit reads, outsider denial, and high-level-only Guardian reads passed. |
| SCHEDULE-5F4-FINANCIAL-BOUNDARY | PASS | — | The projection exposed provisional recommendations without writing credits, payments, or Tutor settlements. |
| SCHEDULE-5F4-DB | PASS | — | `unified-course-schedule-db-self-test.sql` passed as item 19 of the complete 29-case rollback suite. |
| SCHEDULE-5F4-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The task sandbox could not access the Docker API, so the user executed the guarded migration, database suite, and audit from the local project terminal.
- No product or authorization defect appeared during the local database gate.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | All 29 characterization scripts reached rollback; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | The nine deterministic local-only actors and interactive sandbox fixtures remain available. |
| Temporary files/evidence review | Complete | No credentials, tokens, production records, or private evidence were copied into the run log. |
| Browser sessions/dialogs | Not applicable | Phase 5.H owns the finished browser interface over this projection. |

#### Follow-up

- Complete Phase 5.F.5 verification/documentation, then continue with Phase 5.G downstream read-model and integration-event consolidation.
- Phase 5.H will replace the existing Classroom Schedule consumer with this unified projection.

### RUN-20260723-021 — Phase 5.F.3 occurrence outcomes and settlement boundary

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Lock recurring targets, retain authoritative lesson outcomes, requeue undelivered academic work, govern disputes/evidence, and record a nonfinancial 14-day Kelp-Tutor settlement boundary. |
| Started | 2026-07-23 |
| Finished | 2026-07-24T00:09:07Z |
| Executor | Codex `/root` implementation and source verification; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 working tree |
| Migration state | Applied through `202607230010_course_schedule_local_date_boundary.sql` |
| Database reset | No; migrations were applied incrementally |
| Evidence | User terminal output plus the Phase 5.F.3, structural-editing, progress, aggregation, and guarded-runner source suites |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F3-MIGRATIONS | PASS | — | Migrations `202607230009` and `202607230010` applied to the retained local database. |
| SCHEDULE-5F3-SOURCE | PASS | — | Outcome, structural-editing, progress, aggregation, target-mapping, slot-generation, and guarded-runner source contracts passed. |
| SCHEDULE-5F3-LOCK-REFLOW | PASS | — | Six-hour target snapshots remained immutable while Review/not-delivered outcomes requeued only eligible future work. |
| SCHEDULE-5F3-AUTH-PRIVACY | PASS | — | Tutor/Mentor/Quality authority, Student redaction and dispute access, outsider denial, and private evidence isolation passed. |
| SCHEDULE-5F3-CONCURRENCY | PASS | — | Exact retries returned their original receipts and each submitted dispute accepted at most one append-only resolution. |
| SCHEDULE-5F3-FINANCIAL-BOUNDARY | PASS | — | Outcome facts recommend full/half/no/pending charge without posting money; every potential Kelp-Tutor settlement remains ineligible for at least 14 days and unresolved disputes extend the hold. |
| SCHEDULE-5F3-TIMEZONE | PASS | — | Structural past-item protection now derives the date from the immutable Schedule Version timezone instead of UTC server time. |
| SCHEDULE-5F3-DB | PASS | — | `course-schedule-occurrence-outcomes-db-self-test.sql` passed within the complete 28-case rollback suite. |
| SCHEDULE-5F3-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- Two early characterization failures attempted raw table diagnostics under intentionally restricted Student/Tutor roles. The assertions were moved to redacted receipts or the trusted harness without changing runtime privileges.
- A later UTC/São Paulo rollover exposed a real production defect: structural publishing used the database `current_date` for past-item protection. Forward migration `202607230010` retained the lock but made its date Schedule-timezone-aware.
- The task sandbox could not access the Docker API, so the user executed the guarded migration, database suite, and audit from the local project terminal.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Every characterization rolled back; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | Nine local-only acceptance actors and the interactive Mentor sandbox remain available. |
| Characterization residue | Complete | Post-run audit found zero retained characterization rows. |
| Browser sessions/dialogs | Not applicable | Phase 5.F.3 establishes server authority; live Class presence and final financial posting remain later slices. |

#### Follow-up

- Continue with the remaining Phase 5 schedule lifecycle slices after the agreed alignment cycle.
- Live Classroom presence, actual credit posting, and Tutor settlement execution remain in their dedicated later phases.

### RUN-20260723-020 — Phase 5.F.2.2 effective target mapping and capacity

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Forward-correct recurring meeting patterns into neutral academic opportunities and append effective recurring/on-demand target mappings without booking Classes or changing credits. |
| Started | 2026-07-23 |
| Finished | 2026-07-23T22:16:11Z |
| Executor | Codex `/root` implementation and source verification; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 working tree |
| Migration state | Applied through `202607230008_course_schedule_target_mapping.sql` |
| Database reset | No; the migration was applied incrementally |
| Evidence | User terminal output plus the related Course-Schedule source suites |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F2-2-MIGRATION | PASS | — | Migration `202607230008` applied to the retained local database. |
| SCHEDULE-5F2-2-SOURCE | PASS | — | Required Schedule, dates, editing, resources, progress, aggregation, effective Schedule, meeting-pattern, academic-slot, target-mapping, and guarded-runner source contracts passed. |
| SCHEDULE-5F2-2-RECURRING | PASS | — | Neutral 30-minute recurring opportunities mapped A–D in order, left E awaiting a future slot, and triggered no purchase or automatic booking. |
| SCHEDULE-5F2-2-REFLOW | PASS | — | Independent Studied progress appended a successor mapping revision and moved later unstudied topics forward without rewriting prior mappings. |
| SCHEDULE-5F2-2-ON-DEMAND | PASS | — | With A, B, E, and F Studied, the projection recommended C and retained D as a selectable alternative for the later Lesson Request form. |
| SCHEDULE-5F2-2-AUTH | PASS | — | Students received only the current mapping, authorized staff retained history, and outsider access was denied. |
| SCHEDULE-5F2-2-IMMUTABILITY | PASS | — | Browser mutation failed at the privilege boundary and privileged rewriting failed at the append-only trigger. |
| SCHEDULE-5F2-2-DB | PASS | — | `course-schedule-target-mapping-db-self-test.sql` passed within the complete 27-case rollback suite. |
| SCHEDULE-5F2-2-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The original Phase 5.F.1 characterization still enforced a superseded rule requiring a 60- or 90-minute Theory meeting. It was forward-corrected to prove that neutral 30-minute opportunities are valid and that duration or a default purpose never advances progress.
- The task sandbox could not access the Docker API, so the user executed the guarded migration, database suite, and audit from the local project terminal.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Every characterization rolled back; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | Nine local-only acceptance actors and the interactive Mentor sandbox remain available. |
| Characterization residue | Complete | Post-run audit found zero retained characterization rows. |
| Browser sessions/dialogs | Not applicable | Phase 5.F.2.2 adds server projections and no finished booking interface. |

#### Follow-up

- Align Phase 5.F.3 before implementation: six-hour target locks, actual academic outcomes, missed occurrences, review/exam/practice pivots, and append-only requeue history.
- The later Lesson Request slice owns the Student’s final on-demand topic choice. Credit simulation, subscription replenishment, expiry, and booking validation remain in their dedicated credit phase under the existing contract.

### RUN-20260723-019 — Phase 5.F.2.1 immutable neutral academic slots

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Generate immutable Schedule-Version-owned academic opportunities for recurring and static Courses without creating Calendar bookings, live Classes, attendance facts, or credit records. |
| Started | 2026-07-23 |
| Finished | 2026-07-23T21:16:10Z |
| Executor | Codex `/root` implementation and rollback diagnostics; user local migration and complete database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 working tree |
| Migration state | Applied through `202607230007_course_schedule_academic_slots.sql` |
| Database reset | No; the migration was applied incrementally |
| Evidence | User terminal output plus source-level and rollback-transaction diagnostics |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F2-1-MIGRATION | PASS | — | Migration `202607230007` applied to the retained local database. |
| SCHEDULE-5F2-1-SOURCE | PASS | — | Academic-slot, meeting-pattern, guarded-runner, and Schedule-source contracts passed. |
| SCHEDULE-5F2-1-DB | PASS | — | `course-schedule-academic-slots-db-self-test.sql` passed within the complete 26-case rollback suite. |
| SCHEDULE-5F2-1-AUTH | PASS | — | Students read only active slots, authorized staff retain Version summaries, and outsider access was denied. |
| SCHEDULE-5F2-1-IMMUTABILITY | PASS | — | Successor Versions received distinct slot sets; browser mutation and privileged direct rewriting were both denied. |
| SCHEDULE-5F2-1-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first isolated characterization expected the immutable-row trigger to answer an authenticated Tutor update. PostgreSQL correctly rejected the write earlier at the table privilege boundary. The final characterization now proves both defenses separately: browser-role denial and trigger-level immutability for privileged callers.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Every characterization rolled back; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | Nine local-only acceptance actors and the interactive Mentor sandbox remain available. |
| Characterization residue | Complete | Post-run audit found zero retained characterization rows. |
| Browser sessions/dialogs | Not applicable | Phase 5.F.2.1 adds no Student-facing interface. |

#### Follow-up

- Align Phase 5.F.2.2 target mapping and capacity before implementation. Post-Class pivots, absences, attendance evidence, and credit settlement remain in their subsequent owning slices.

### RUN-20260723-018 — Phase 5.F.1 immutable weekly meeting patterns

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Apply and characterize immutable Schedule-Version-owned weekly meeting patterns, publishing authority, Student/staff visibility, concurrency, idempotency, inheritance, and rollback behavior. |
| Started | 2026-07-23 |
| Finished | 2026-07-23T18:10:04Z |
| Executor | Codex `/root` implementation and transactional diagnostics; user local Docker migration and database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Source revision | `7a92b3e874f0483c2b7d144edaebfa98a77f11a9` with the shared Phase 4/5 working tree |
| Migration state | Applied through `202607230006_course_schedule_meeting_patterns.sql` |
| Database reset | No; the migration was applied incrementally |
| Evidence | User terminal output plus source-level and rollback-transaction diagnostics |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5F1-MIGRATION | PASS | — | Migration `202607230006` applied to the retained local database. |
| SCHEDULE-5F1-SOURCE | PASS | — | Meeting-pattern and guarded-runner source contracts passed. |
| SCHEDULE-5F1-DB | PASS | — | `course-schedule-meeting-pattern-db-self-test.sql` passed within the complete 25-case rollback suite. |
| SCHEDULE-5F1-AUTH | PASS | — | Tutor/Mentor and self-employed-Tutor authority, Student/outsider denial, and staff-history privacy passed. |
| SCHEDULE-5F1-CONCURRENCY | PASS | — | Expected-Version rejection, idempotent replay, immutable history, and structural-Version inheritance passed. |
| SCHEDULE-5F1-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first migration attempt exposed an ambiguous unparenthesized `CASE` inside a PL/pgSQL `IF`; PostgreSQL parsed its inner `THEN` as the surrounding `IF` boundary. Parenthesizing the expression preserved the rule and allowed the function to compile.
- The first direct transactional characterization found one test-only reference that treated a PostgreSQL session setting as a `psql` variable. It now reads the stored setting explicitly.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Every characterization rolled back; no database reset was performed. |
| Synthetic accounts/data | Retained intentionally | Nine local-only acceptance actors and the interactive Mentor sandbox remain available. |
| Characterization residue | Complete | Post-run audit found zero retained characterization rows. |
| Browser sessions/dialogs | Not applicable | Phase 5.F.1 adds no Student-facing slot interface. |

#### Follow-up

- Align Phase 5.F.2 before implementation: expand weekly patterns into future academic slots and map eligible Schedule targets without creating Calendar bookings, live Classes, attendance, or billing facts.

### RUN-20260723-017 — Phase 5.E.5 Schedule PDF and deferred live acceptance

| Field | Value |
| --- | --- |
| Status | In progress — automated scope complete; three authenticated checks deferred by the user |
| Purpose | Verify the authoritative effective-Schedule print snapshot, privacy boundary, identifiers, responsive source contracts, and regression surface without changing schema. |
| Started | 2026-07-23 |
| Finished | — |
| Executor | Codex `/root` source, PDF, and visual checks; user authenticated Student print preview |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` plus local static server |
| Migration state | Unchanged from `202607230005_server_schedule_mirror_read_privileges.sql` |
| Database reset | No; Phase 5.E.5 introduces no migration |
| Evidence | Consolidated source suites, generated/rendered representative A4 PDF, and user-supplied authenticated Student Classroom/print-preview screenshots |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5E5-SOURCE | PASS | — | `test:classroom-phase`, Session/resource, progress, aggregation, Builder adapter, effective Schedule, and PDF snapshot contracts passed. |
| SCHEDULE-5E5-REFRESH | PASS | — | Source contract requires a forced authoritative Schedule refresh before creating the print snapshot. |
| SCHEDULE-5E5-PRIVACY | PASS | — | Printable markup excludes reflection and private staff-note fields and includes only Student-visible assigned resources. |
| SCHEDULE-5E5-PDF | PASS | — | Authenticated Student preview showed Course, Student, Tutor, timezone, effective/original dates, progress, watermark, copyright, and complete Course/active-Version identifiers without clipping. |
| SCHEDULE-5E5-STUDENT-ROUNDTRIP | NOT_RUN | Deferred by user | Mark Reviewed, reload, reverse, and reload will be performed later. |
| SCHEDULE-5E5-TUTOR | NOT_RUN | Deferred by user | Assigned-Tutor Schedule/PDF authority and Student-reflection privacy remain a short live check. |
| SCHEDULE-5E5-390PX | NOT_RUN | Deferred by user | Source responsive contracts pass; authenticated visual overflow review remains manual. |
| SCHEDULE-5E5-DB | NOT_APPLICABLE | — | No schema or RLS changed. The immediately preceding 24-characterization and nine-actor zero-residue gate remains the database checkpoint. |

#### Unexpected observations

- The authenticated Classroom displayed active Schedule Version 5 with two effective sessions. The earlier seven-session reference belongs to the older Version observed during `RUN-20260723-016`; the provisioner correctly preserves the current governed Builder publication instead of restoring its fallback fixture.
- The task-local browser did not share the user's authenticated browser state. No password, session storage, or account state was requested or modified.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Not applicable | No database mutation or migration was introduced. |
| Interactive sandbox | Retained intentionally | Existing Mentor/Tutor/Student test relationships remain available for the deferred checks. |
| Temporary PDF artifacts | Complete | Only the Phase 5.E.5 helper PDF, render script, and rendered page were removed; unrelated PDF-review artifacts were preserved. |
| Browser sessions/dialogs | Complete | The unauthenticated task-local Classroom tab redirected to Login and was not used to alter account state. |

#### Follow-up

- Resume the three deferred authenticated checks when the user is available.
- Align Phase 5.F occurrence authority and its boundary with the later live-Class attendance phase before implementing academic-slot remapping.

### RUN-20260723-016 — Phase 5.E.4 backend wiring and interactive Builder Schedule acceptance

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the effective Student Schedule, retained legacy history, server-only Calendar-mirror access, and interactive Mentor sandbox without replacing a newer Builder publication. |
| Started | 2026-07-23 |
| Finished | 2026-07-23 (user database and provisioning results received) |
| Executor | Codex `/root` implementation and static checks; user local Docker database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Migration state | Applied through `202607230005_server_schedule_mirror_read_privileges.sql` |
| Database reset | No; migrations `004` and `005` were applied incrementally |
| Evidence | `npm run test:schedule-builder-adapter`, `npm run test:schedule-effective`, `npm run supabase:test:db`, interactive Mentor sandbox provisioning, and `npm run supabase:audit` |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5E4-SOURCE | PASS | — | Builder restoration, effective Schedule, guarded local runner, and adapter contracts passed. |
| SCHEDULE-5E4-DB | PASS | — | All 24 rollback database characterizations passed after the retained-history test restored its deferred constraint mode. |
| SCHEDULE-5E4-HISTORY | PASS | — | An unchanged pre-activation legacy row may remain auditable, while a new or moved pre-start item remains rejected. |
| SCHEDULE-5E4-PRIVILEGES | PASS | — | `service_role` received read-only access to the two Calendar compatibility-mirror tables; browser roles retained no direct table access. |
| SCHEDULE-5E4-BUILDER | PASS | — | The provisioner recognized and preserved the newer seven-session Builder-backed Algebra 1 Schedule instead of restoring an obsolete four-session fixture. |
| SCHEDULE-5E4-SANDBOX | PASS | — | Mentor, two Tutors, two Students, two Courses/Classrooms, Aldebarã's Assignment, and the current Builder Schedule were provisioned and verified. |
| SCHEDULE-5E4-AUDIT | PASS | — | Nine deterministic actors were unchanged and zero characterization rows remained. |

#### Unexpected observations

- The retained interactive Course predates Course-date synchronization: its first historical Schedule row is earlier than its locked Course start. Migration `004` now permits only an identical retained row across successor Versions and continues rejecting actual backdating.
- The first retained-history characterization attempted to disable a trigger while deferred events were pending, then temporarily left the constraints in immediate mode. The test now flushes the two named constraints, performs the legacy simulation, and restores deferred mode before later atomic Course creation.
- The server key bypassed RLS but lacked SQL `SELECT` privileges on the Calendar compatibility mirror. Migration `005` grants only the two required server-side reads and the privilege characterization confirms that browser roles remain denied.
- Read-only diagnostics showed that a newer seven-session Algebra 1 Schedule Builder publication was already active. The provisioner now recognizes valid current Track provenance and never overwrites newer Builder work with its canned fallback.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | All 24 characterization transactions rolled back; no reset was used. |
| Interactive sandbox | Retained intentionally | The Mentor workflow graph, Aldebarã Course/Assignment, and current seven-session Builder Schedule remain available for authenticated UI review. |
| Credentials | Complete | The local acceptance password was removed from the PowerShell environment and was not recorded. |
| Residue audit | Complete | Nine deterministic actors verified; zero characterization rows retained. |

#### Follow-up

- Complete Phase 5.E.5 authenticated Student/Tutor browser and PDF snapshot verification, then proceed to Phase 5.F academic-slot mapping.

### RUN-20260723-013 — Phase 5.E.3 hierarchical aggregation

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Derive Session Studied from required resources, project direct-parent inheritance without synthetic child events, preserve explicit child history, and govern hierarchical corrections and notifications. |
| Started | 2026-07-23 |
| Finished | 2026-07-23 (user database results received) |
| Executor | Codex `/root` implementation and static checks; user local Docker database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Migration state | Applied through `202607220012_course_progress_hierarchical_aggregation.sql` |
| Database reset | No; migration `012` was applied incrementally |
| Evidence | `npm run test:schedule-aggregation`, `npm run supabase:test:db`, and `npm run supabase:audit` |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5E3-PREFLIGHT | PASS | — | The retained local Supabase project and expected loopback ports were available. |
| SCHEDULE-5E3-MIGRATION | PASS | — | Hierarchical aggregation migration `012` applied successfully on its first execution. |
| SCHEDULE-5E3-SOURCE | PASS | — | Aggregation, RPC compatibility, concurrency serialization, privacy, structural-lock, runner, and documentation contracts passed. |
| SCHEDULE-5E3-DB | PASS | — | All 23 rollback database characterizations passed after correcting three characterization-only assumptions. |
| SCHEDULE-5E3-AGGREGATION | PASS | — | Completing every required assigned resource derived Session Studied; optional work did not block and empty-required Sessions required a direct mark. |
| SCHEDULE-5E3-INHERITANCE | PASS | — | Direct Session Studied projected inherited state to required and optional assigned children without creating synthetic child events; explicit child facts retained precedence. |
| SCHEDULE-5E3-CORRECTION | PASS | — | Students could not reverse Studied; Tutor/Mentor resource corrections required a public reason and removal of an active direct parent first. |
| SCHEDULE-5E3-LIFECYCLE | PASS | — | Derived Studied Sessions resisted successor-Version mutation; parent reversal preserved explicit children; a correction that removed aggregate completion reopened wind-down. |
| SCHEDULE-5E3-PRIVACY | PASS | — | Participant projections remained authorized, raw ledgers stayed private, staff retained not-assigned audit visibility, and Guardians/outsiders remained excluded. |
| SCHEDULE-5E3-NOTIFICATIONS | PASS | — | Derived completion and reversal produced durable Student/Tutor notification facts without routine Mentor delivery or fabricated progress events. |
| SCHEDULE-5E3-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first characterization attempt placed optional Student reflection text in the staff-only `studentExplanation` argument. Named RPC arguments now prevent that ordering error.
- The second attempt queried private raw progress tables while still running as `authenticated`. Audit-only cardinality checks now run as the database owner; authenticated users received no additional table privileges.
- The third attempt removed a Schedule item entirely and was correctly stopped by the pre-existing structural invariant before reaching the derived-Studied lock. The test now performs the valid representation of a drop—retaining the item with state `dropped`—and proves that the Studied lock rejects it.
- These were rollback-test design corrections. Migration `012`, its RLS boundaries, retained Course data, and production permissions did not require weakening.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Migration `012` remains applied; all 23 characterization transactions rolled back. No reset was used. |
| Retained history | Preserved | Existing Schedule Versions, progress history, Track/resource snapshots, Course relationships, and Classroom records remain retained. |
| Synthetic accounts/data | Retained intentionally | Nine deterministic actors and the interactive Mentor sandbox remain available. |
| Residue audit | Complete | Zero characterization rows remained after the failed characterization attempts and successful final run. |

#### Follow-up

- Begin Phase 5.E.4 by aligning on the compact effective Student Schedule projection and row-level presentation before implementation.

### RUN-20260723-012 — Phase 5.E.2 append-only Course progress

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Establish server-owned Studied/Reviewed/Practiced history, governed reversals, private reflections, item-level concurrency, and completed-content structural protection without yet deriving hierarchical or effective-Schedule progress. |
| Started | 2026-07-22 |
| Finished | 2026-07-23 (user database results received) |
| Executor | Codex `/root` implementation and static checks; user local Docker database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Migration state | Applied through `202607220011_course_progress_ledger.sql` |
| Database reset | No; migration `011` was applied incrementally |
| Evidence | `npm run test:schedule-progress`, `npm run supabase:test:db`, and `npm run supabase:audit` |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5E2-PREFLIGHT | PASS | — | The retained local Supabase project and expected loopback ports were available. |
| SCHEDULE-5E2-MIGRATION | PASS | — | The append-only Course progress migration applied successfully on its first execution. |
| SCHEDULE-5E2-SOURCE | PASS | — | Progress schema, permissions, privacy, concurrency, notification, structural-lock, runner, and privilege assertions passed. |
| SCHEDULE-5E2-DB | PASS | — | All 22 rollback database characterizations passed after the test-harness substitution correction. |
| SCHEDULE-5E2-AUTHORITY | PASS | — | Students controlled Session/resource progress and their own Reviewed/Practiced reversals; assigned Tutor/Mentor authority governed Studied marks and reversals. |
| SCHEDULE-5E2-HISTORY | PASS | — | Marks, reversals, and reflection amendments remained append-only and pinned exact Schedule/content/resource identity. |
| SCHEDULE-5E2-CONCURRENCY | PASS | — | Per-target expected-event stale rejection and actor-scoped idempotent command receipts passed. |
| SCHEDULE-5E2-PRIVACY | PASS | — | Students and assigned academic staff received the governed projection; Guardians and outsiders remained excluded from lesson-level progress/reflections; private staff notes stayed staff-only. |
| SCHEDULE-5E2-LIFECYCLE | PASS | — | Studied Sessions resisted successor-Version mutation, while a governed wind-down reversal reopened the Course. |
| SCHEDULE-5E2-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The migration applied successfully. The first full runner stopped at characterization 12/22 because the new rollback test stored a reflection event ID in PostgreSQL session state but later referenced it as an undeclared `psql` substitution variable. PostgreSQL therefore received the literal colon and reported a syntax error.
- The test now reads the existing session setting directly, and its source test prevents the invalid substitution form from returning. No migration, RLS policy, command, constraint, or retained database data required repair.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Migration `011` remains applied; all 22 characterization transactions rolled back. No reset was used. |
| Retained history | Preserved | Existing Schedule Versions, Track/resource snapshots, Course relationships, and Classroom records remain retained. |
| Synthetic accounts/data | Retained intentionally | Nine deterministic actors and the interactive Mentor sandbox remain available. |
| Residue audit | Complete | Zero characterization rows remained after both the failed test-harness run and successful rerun. |

#### Follow-up

- Begin Phase 5.E.3 with required-resource aggregation, inherited parent/child presentation, reversal behavior that preserves individually recorded work, and the rule that only Studied advances the academic pointer.

### RUN-20260722-011 — Phase 5.E.1 Track Session and resource identity

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Give each Curriculum Schedule item immutable Track Session/content identity and a personalized required/optional/not-assigned resource snapshot without introducing progress mutations. |
| Started | 2026-07-22 |
| Finished | 2026-07-22 (user database results received) |
| Executor | Codex `/root` implementation and static checks; user local Docker database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Migration state | Applied through `202607220010_course_schedule_source_inheritance_fix.sql` |
| Database reset | No; migrations `009` and `010` were applied incrementally |
| Evidence | `npm run test:schedule-sources`, `npm run supabase:test:db`, and `npm run supabase:audit` |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5E1-PREFLIGHT | PASS | — | The retained local Supabase project and expected loopback ports were available. |
| SCHEDULE-5E1-MIGRATION | PASS | — | Session/resource identity migration `009` and inheritance repair `010` applied successfully. |
| SCHEDULE-5E1-SOURCE | PASS | — | Track source, resource visibility, documentation, runner, and privilege contracts passed. |
| SCHEDULE-5E1-DB | PASS | — | All 21 rollback database characterizations passed after the repair. |
| SCHEDULE-5E1-IDENTITY | PASS | — | Stable Track/Module/Session/content identities, safe planning routes, and normalized difficulty passed. |
| SCHEDULE-5E1-RESOURCES | PASS | — | Required, optional, and not-assigned snapshots remained immutable and inherited into successor structural Versions. |
| SCHEDULE-5E1-PRIVACY | PASS | — | Students saw only assigned resources; authorized staff retained the complete resource audit view; outsiders remained denied. |
| SCHEDULE-5E1-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first complete runner after migration `009` stopped at characterization 10/21. A successor Review item intentionally had no Track content-version key; passing that SQL `NULL` to `jsonb_set` turned its inherited JSON source snapshot into SQL `NULL`, and the existing not-null invariant rejected the row.
- Migration `010` guards content-version inheritance to items that actually possess a key. Reviews and Exams continue to carry ordinary immutable source JSON without inventing Track content identity. No RLS policy, immutability rule, or not-null constraint was weakened.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Both migrations remain applied; all 21 characterization transactions rolled back. No reset was used. |
| Retained history | Preserved | Existing Schedule Versions, Track snapshots, and compatibility records remain retained. |
| Synthetic accounts/data | Retained intentionally | Nine deterministic actors and the interactive Mentor sandbox remain available. |
| Residue audit | Complete | Zero characterization rows remained. |

#### Follow-up

- Begin Phase 5.E.2 with the agreed append-only Studied/Reviewed/Practiced ledger, exact server/effective timestamps, Student reflections, staff back-report reasons, item-level concurrency, idempotency, and completed-snapshot pinning.

### RUN-20260722-010 — Phase 5.D structural Course Schedule editing

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Let authorized academic staff publish immediate, auditable future Schedule revisions without rewriting completed history or exposing stale Versions to Students. |
| Started | 2026-07-22 |
| Finished | 2026-07-22 (user database results received) |
| Executor | Codex `/root` implementation and static checks; user local Docker database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Migration state | Applied through `202607220008_course_schedule_structural_editing.sql` |
| Database reset | No; the migration was applied incrementally to the retained local stack |
| Evidence | `npm run supabase:preflight`, `npx supabase migration up --local`, `npm run supabase:test:db`, and `npm run supabase:audit` |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5D-PREFLIGHT | PASS | — | The retained local Supabase project and expected loopback ports were available. |
| SCHEDULE-5D-MIGRATION | PASS | — | The structural-editing migration applied successfully. |
| SCHEDULE-5D-DB | PASS | — | All 20 rollback database characterizations passed. |
| SCHEDULE-5D-AUTHORITY | PASS | — | Assigned Tutor, supervising Mentor, and self-employed Tutor authority passed; Student, outsider, and generic-administrator edits remained denied. |
| SCHEDULE-5D-CONCURRENCY | PASS | — | Expected-Version stale-save rejection and idempotent retry behavior passed. |
| SCHEDULE-5D-HISTORY | PASS | — | Superseded Versions and audit history remained immutable while Students received only the active Version. |
| SCHEDULE-5D-INTEGRATION | PASS | — | Course endpoints, Calendar compatibility data, governed reasons, private staff notes, and notification facts remained synchronized. |
| SCHEDULE-5D-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- None in the formal migration/regression gate.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | The migration remains applied; all 20 characterization transactions rolled back. No reset was used. |
| Retained history | Preserved | Prior immutable Schedule Versions and compatibility records remain retained. |
| Synthetic accounts/data | Retained intentionally | Nine deterministic actors and the interactive Mentor sandbox remain available. |
| Residue audit | Complete | Zero characterization rows remained. |

#### Follow-up

- Inspect and align Phase 5.E before implementation: append-only Studied progress, audited reversals, exact timestamps, optional Student reflections, and the compact effective Student Schedule.

### RUN-20260722-009 — Phase 5.C authoritative Course-date synchronization

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Make the active immutable Schedule Version authoritative for Course dates while permanently protecting an activated Course's historical start. |
| Started | 2026-07-22 |
| Finished | 2026-07-22 (user database results received) |
| Executor | Codex `/root` implementation and static checks; user local Docker database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Migration state | Applied through `202607220007_course_date_synchronization.sql` |
| Database reset | No; four retained Courses were reconciled incrementally |
| Evidence | `npm run test:course-dates`, `npm run test:course-schedule`, `npm run supabase:test:db`, and `npm run supabase:audit` |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5C-STATIC | PASS | — | The central invariant, date-range projection, runner mapping, rollback characterization, and Phase 5.B compatibility checks passed. |
| SCHEDULE-5C-MIGRATION | PASS | — | The migration reconciled retained Courses and installed the activated-start constraint, date trigger, projection, and grants. |
| SCHEDULE-5C-DB | PASS | — | All 19 rollback database characterizations passed. |
| SCHEDULE-5C-DATES | PASS | — | Draft movement, activation lock, active extension/shortening, wind-down reopening, and generated 14-day endpoint recalculation passed. |
| SCHEDULE-5C-HISTORY | PASS | — | Backdating, dropped-only activation, elapsed activation, and direct Course-date bypass were rejected or normalized while prior versions remained immutable. |
| SCHEDULE-5C-RLS | PASS | — | Authorized participant projection passed and outsider access remained denied. |
| SCHEDULE-5C-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first migration attempt reached the new check-constraint statement but PostgreSQL rejected `ALTER TABLE` because Phase 5.B's deferred required-Schedule trigger and active-Version foreign key still had pending events from retained-Course reconciliation.
- A rollback-only raw `psql` diagnostic confirmed SQLSTATE `55006`. The final migration evaluates both specifically named Phase 5.B constraints before altering the table; no constraint or RLS rule was weakened. The diagnostic then executed the complete migration and explicitly rolled back before the formal application.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | The corrected migration is applied; all 19 characterization transactions rolled back. No reset was used. |
| Retained history | Preserved | All prior immutable Schedule Versions and legacy compatibility records remain retained. |
| Synthetic accounts/data | Retained intentionally | Nine deterministic actors and the interactive Mentor sandbox remain available. |
| Residue audit | Complete | Zero characterization rows remained. |

#### Follow-up

- Begin Phase 5.D by defining and enforcing which current Tutor, supervising Mentor, self-employed Tutor, and Student read paths may invoke future Schedule-editing actions.

### RUN-20260722-008 — Phase 5.B required versioned Course Schedule

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Require one stable Schedule and populated immutable active version for every Course, preserve retained history, and prove Kelp and self-employed independent-Tutor creation/activation boundaries. |
| Started | 2026-07-22 |
| Finished | 2026-07-22 (user database results received) |
| Executor | Codex `/root` implementation and static checks; user local Docker database execution |
| Environment | Retained disposable LOCAL-SUPABASE project `kelptutoring.com-main` |
| Migration state | Applied through `202607220006_required_versioned_course_schedule.sql` |
| Database reset | No; retained Courses were backfilled incrementally |
| Evidence | `npm run test:course-schedule`, `npm run supabase:test:db`, and `npm run supabase:audit` |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| SCHEDULE-5B-STATIC | PASS | — | Required container/version/item schema, atomic creation, guarded provisioning, RLS characterization, and documentation contract passed. |
| SCHEDULE-5B-MIGRATION | PASS | — | The corrected migration applied and backfilled retained Courses without resetting local accounts or deleting legacy assignment evidence. |
| SCHEDULE-5B-DB | PASS | — | All 18 rollback database characterizations passed. |
| SCHEDULE-5B-KELP | PASS | — | Kelp Course creation required Schedule version 1, preserved prior versions, and denied mutation of immutable versions/items. |
| SCHEDULE-5B-INDEPENDENT | PASS | — | The self-employed Tutor read the authorized Course/Schedule and only their own Membership through RLS; administrative verification confirmed underlying Student and Tutor Memberships with no Mentor. |
| SCHEDULE-5B-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows remained. |

#### Unexpected observations

- The first migration attempt rolled back while refreshing the old relationship roster. That optional cross-slice refresh was removed; Phase 5.B retains its dedicated authorized Schedule projection without changing the earlier roster.
- The first independent-Tutor assertion counted all Classroom Memberships while authenticated as the Tutor. Existing RLS intentionally exposed only the Tutor's own row. The final characterization separates participant-visible assertions from administrative structural assertions; no RLS policy was weakened.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | The migration is applied; all characterization transactions rolled back. No reset was used. |
| Retained history | Preserved | Legacy Schedule/session rows and immutable practice-assignment snapshots remain available as compatibility evidence. |
| Synthetic accounts/data | Retained intentionally | Nine deterministic actors and the interactive Mentor sandbox remain available. |
| Residue audit | Complete | Zero characterization rows remained. |

#### Follow-up

- Begin Phase 5.C so activating a new Schedule version updates authoritative Course dates atomically while protecting the historical activated start date.

### RUN-20260722-007 — Phase 5.A authoritative Course Schedule audit

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Characterize the existing Schedule Generator, database bridge, Course linkage, progress boundary, provider model, and retained migration fixtures before designing immutable Schedule versions. |
| Finished | 2026-07-22 |
| Executor | Codex `/root` read-only source audit and local static checks |
| Environment | Local app source; retained LOCAL-SUPABASE schema inspected through migrations and existing characterizations |
| Migration state | Unchanged through `202607220005_classroom_files_interface_status.sql` |
| Database reset | Not applicable; 5.A introduced no database mutation |
| Evidence | Existing Schedule/Course migrations, Schedule Generator contract, retained Mentor-sandbox provisioner, and the baseline commands below |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| SCHEDULE-5A-DOMAIN | PASS | Date-only cadence and Schedule document behavior passed. |
| SCHEDULE-5A-OUTLINE | PASS | Add/remove/reorder/module outline behavior passed. |
| SCHEDULE-5A-BUILDER | PASS | Schedule Builder integrity passed across 252 linked sessions. |
| SCHEDULE-5A-PRACTICE | PASS | Existing immutable Course-assignment snapshots and delivery boundaries passed. |
| SCHEDULE-5A-CLASSROOM | PASS | Classroom Overview and Student Classroom compatibility checks passed. |
| SCHEDULE-5A-RUNNER | PASS | Guarded local Supabase actor/runner contract passed. |

#### Audit conclusions

- Keep the existing builder and cadence engine as frontend inputs, but replace browser storage and in-place database synchronization with a Course-owned Schedule container plus immutable versions.
- Derive Course dates from the active version and require version 1 before activation.
- Store shared Studied progress and Student-oriented Practiced/Reviewed indicators outside Schedule versions.
- Preserve delivered, past, Studied, and assignment-snapshotted history; edit only future unstudied topics through a new version.
- Separate provider kind, service model, and optional supervision so Kelp, school-supervised independent, and self-employed independent Courses use the same Schedule authority safely.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database | Unchanged | No SQL migration or live mutation ran. |
| Browser storage | Unchanged | The audit did not create or overwrite a generated Schedule. |
| Synthetic accounts/data | Retained intentionally | Mechanics and Algebra Course/Schedule fixtures remain for 5.B migration characterization. |

#### Follow-up

- Design and implement 5.B's additive migration for the stable Schedule container, immutable versions/items, active-version link, Course-date authority, provider/service separation, and legacy fixture migration.

### RUN-20260722-006 — Phase 4.F persistent Classroom checkpoint

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Close Phase 4 with one repeatable Classroom regression plus authenticated Student/Mentor, navigation-history, responsive, and failure-state verification. |
| Started | 2026-07-22 |
| Finished | 2026-07-22 (user browser results received) |
| Executor | Codex `/root` source checks and user authenticated browser walkthrough |
| Environment | Retained LOCAL-SUPABASE project and local app server |
| Migration state | Applied through `202607220005_classroom_files_interface_status.sql` |
| Database reset | No |
| Evidence | `npm run test:classroom-phase`, `RUN-20260722-005` database/audit baseline, and the Phase 4 checkpoint in [`src/app/classroom/README.md`](../../src/app/classroom/README.md) |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| CLASSROOM-4F-SOURCE | PASS | — | Authorization, workspaces, Student Dashboard, Classroom collections, management, Overview, navigation/privacy, Files authority/interface, and guarded local-runner checks all passed through the consolidated command. |
| CLASSROOM-4F-DB | PASS | — | Reuses the immediately preceding Phase 4.E run: all 17 rollback database characterizations passed against the same migration state. |
| CLASSROOM-4F-AUDIT | PASS | — | Reuses the immediately preceding nine-actor audit with zero retained characterization rows. |
| CLASSROOM-4F-STUDENT | PASS | — | User confirmed the active Student Classroom journey, hidden internal Mentor structure, Files upload/preview/download/withdrawal, and current navigation were functional. |
| CLASSROOM-4F-MENTOR | PASS | — | User confirmed shared Student/Mentor file visibility plus the role-specific Student withdrawal and Mentor reasoned-hiding actions. Hidden moderator visibility and ordinary-member withdrawal behavior worked as designed. |
| CLASSROOM-4F-RESPONSIVE | PASS | — | User confirmed Overview and Files looked and behaved correctly at the narrow-phone checkpoint with no observed clipping or page-level overflow. |

#### Unexpected observations

- None during the consolidated source checkpoint.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | Reused the passing rollback suite; no database mutation was introduced in 4.F. |
| Synthetic accounts/data | Retained intentionally | Interactive Mentor sandbox and deterministic local actors remain available. |
| Browser sessions/dialogs | Complete | Student, Mentor, Files, navigation, and narrow-screen checks completed in the user browser. |

#### Follow-up

- Begin Phase 5 with an inspection of the existing Course and Schedule records before introducing the required versioned Schedule authority.

### RUN-20260722-005 — Phase 4.E private Classroom Files interface

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the visible private Files interface contract, preserve the Phase 4.C navigation/privacy boundary, and activate the Phase 4.E Classroom projection without adding browser-side deletion authority. |
| Finished | 2026-07-22 (user terminal results received) |
| Executor | User terminal with Codex `/root` implementation and static checks |
| Environment | Retained LOCAL-SUPABASE project plus local app source |
| Migration state | Applied through `202607220005_classroom_files_interface_status.sql` |
| Database reset | No; all characterization mutations rolled back |
| Evidence | [`classroom-files-interface-self-test.mjs`](../../tools/classroom-files-interface-self-test.mjs), [`classroom-navigation-privacy-db-self-test.sql`](../../tools/classroom-navigation-privacy-db-self-test.sql), and [`classroom-private-files-db-self-test.sql`](../../tools/classroom-private-files-db-self-test.sql) |

#### Results

| Test ID | Result | Defect/blocker | Notes |
| --- | --- | --- | --- |
| CLASSROOM-4E-INITIAL-DB | FAIL | Resolved stale characterization expectation | The first post-migration run reached test 14 and found that the Phase 4.C compatibility check still expected Classroom shell schema version 5 after Phase 4.E intentionally published version 6. Tests 1–13 passed and the accompanying audit retained zero rows. |
| CLASSROOM-4E-STATIC | PASS | — | Files interface, navigation/privacy, and guarded local-acceptance runner checks passed after the correction. |
| CLASSROOM-4E-DB-RERUN | PASS | — | All 17 rollback database characterizations passed, including the corrected Phase 4.C compatibility check and Phase 4.D Files authority checks under the Phase 4.E projection. |
| CLASSROOM-4E-AUDIT | PASS | — | Nine deterministic actors were verified and zero characterization rows were retained. |
| CLASSROOM-4E-BROWSER | NOT_RUN | Assigned to Phase 4.F | Authenticated upload, preview/download, withdrawal, moderation, error recovery, and responsive journeys remain grouped in the dedicated Phase 4 verification checkpoint. |

#### Unexpected observations

- Phase 4.E correctly advanced `get_my_classroom_space` from schema version 5 to 6, but the older Phase 4.C live characterization still required version 5. The assertion was corrected without weakening Mentor access, Student supervision privacy, outsider denial, or any Files authority rule.

#### Cleanup

| Item | Status | Notes |
| --- | --- | --- |
| Database transaction/reset | Complete | All 17 characterizations passed and rolled back; no reset was performed. |
| Synthetic accounts/data | Retained intentionally | Nine deterministic local actors remain available for Phase 4.F. |
| Rollback-residue audit | Complete | Zero characterization rows retained. |
| Browser sessions/dialogs | Not run | Authenticated browser verification is deferred to Phase 4.F. |

#### Follow-up

- Run the role-specific authenticated Files journeys and responsive checks in Phase 4.F before creating the Phase 4 checkpoint.

### RUN-20260722-004 — Phase 4.D private Classroom Files authority

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the private Classroom shared-drive authority, role and tenure isolation, two-hour uploader withdrawal, reasoned moderation, retention boundary, and administrator-only purge finalization. |
| Finished | 2026-07-22 (user terminal results received) |
| Executor | User terminal with Codex `/root` implementation and static checks |
| Environment | Retained LOCAL-SUPABASE project plus local app source |
| Migration state | Applied through `202607220004_classroom_private_files_authority.sql` |
| Database reset | No; all characterization mutations rolled back |
| Evidence | [`classroom-private-files-db-self-test.sql`](../../tools/classroom-private-files-db-self-test.sql) and [`classroom-private-files-self-test.mjs`](../../tools/classroom-private-files-self-test.mjs) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| CLASSROOM-4D-STATIC | PASS | Private bucket, metadata, payload normalization, adapter wiring, retention, Storage-policy, and documentation contracts passed. |
| CLASSROOM-4D-UPLOAD | PASS | Active Students, assigned Tutors, and supervisory Mentors received direct PDF/JPEG/PNG upload authority with a 20 MB limit; Guardians remained read-only. |
| CLASSROOM-4D-WITHDRAW | PASS | The uploader could withdraw within two hours and was denied after the deadline; withdrawn files left ordinary member reads. |
| CLASSROOM-4D-MODERATION | PASS | Assigned Tutor and supervisory Mentor could hide active files only with an audited reason. |
| CLASSROOM-4D-HISTORY | PASS | Active replacement-Tutor access and former-Tutor tenure-bounded reads passed; the outsider was denied. |
| CLASSROOM-4D-PURGE | PASS | Authenticated users received no Storage update/delete or purge-finalization authority; trusted finalization retained administrator, retention, and legal-hold checks. |
| CLASSROOM-4D-DB | PASS | All 17 rollback database characterizations passed. |
| CLASSROOM-4D-AUDIT | PASS | Nine actors verified; zero characterization rows retained. |

#### Deferred ownership

- Phase 4.E owns the visible upload, preview, download, withdrawal, and moderation interface. Physical retained-object cleanup remains a trusted scheduled/server process rather than a browser action.

### RUN-20260722-003 — Phase 4.C Classroom navigation and internal privacy

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify deep-linked persistent Classroom areas, Student-hidden supervisory structure, eligible staff context, and separation of the scheduled live-lesson tool. |
| Finished | 2026-07-22 (user terminal results received) |
| Executor | User terminal with Codex `/root` implementation and static checks |
| Environment | Retained LOCAL-SUPABASE project plus local app source |
| Migration state | Applied through `202607220003_classroom_navigation_privacy.sql` |
| Database reset | No; all characterization mutations rolled back |
| Evidence | [`classroom-navigation-privacy-db-self-test.sql`](../../tools/classroom-navigation-privacy-db-self-test.sql) and [`classroom-navigation-self-test.mjs`](../../tools/classroom-navigation-self-test.mjs) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| CLASSROOM-4C-STATIC | PASS | Area catalog, stable URLs, browser-history wiring, planned-area presentation, responsive styling, and live-tool separation passed. |
| CLASSROOM-4C-PRIVACY | PASS | Students did not receive supervisory Mentor identity; assigned Tutors, Mentors, and administrators retained eligible staff context. |
| CLASSROOM-4C-BOUNDARY | PASS | The live lesson room remained unavailable without an eligible scheduled Class and was not represented as the persistent Classroom. |
| CLASSROOM-4C-ISOLATION | PASS | Administrative shell access remained read-only and the unlinked outsider was denied. |
| CLASSROOM-4C-DB | PASS | All 16 rollback database characterizations passed. |
| CLASSROOM-4C-AUDIT | PASS | Nine actors verified; zero characterization rows retained. |

#### Deferred ownership

- Forum, Assignments, Files, Report Cards, History, and live-Class content remain with their owning phases. Phase 4.D establishes private Files authority next.

### RUN-20260722-002 — Phase 4.B authorized Classroom Overview

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify the authorized persistent Classroom Overview, participant/provider privacy boundary, linked Schedule summary, legacy missing-Schedule state, and outsider isolation without enabling Schedule mutations. |
| Finished | 2026-07-22 (user terminal results received) |
| Executor | User terminal with Codex `/root` implementation and static checks |
| Environment | Retained LOCAL-SUPABASE project plus local app source |
| Migration state | Applied through `202607220002_classroom_overview_projection.sql` |
| Database reset | No; all characterization mutations rolled back |
| Evidence | [`classroom-overview-projection-db-self-test.sql`](../../tools/classroom-overview-projection-db-self-test.sql) and [`classroom-overview-self-test.mjs`](../../tools/classroom-overview-self-test.mjs) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| CLASSROOM-4B-STATIC | PASS | Projection normalization, privacy fields, linked/missing Schedule rendering, responsive Overview styling, and no-mutation boundaries passed. |
| CLASSROOM-4B-AUTHORIZED | PASS | Student, assigned Tutor, and supervisory Mentor received the authorized Course, team, provider, and linked Schedule summary. |
| CLASSROOM-4B-LEGACY | PASS | A retained legacy Course without a linked Schedule returned an explicit missing state and remained readable. |
| CLASSROOM-4B-ISOLATION | PASS | Administrative shell access remained read-only and the unlinked outsider was denied. |
| CLASSROOM-4B-DB | PASS | All 15 rollback database characterizations passed. |
| CLASSROOM-4B-AUDIT | PASS | Nine actors verified; zero characterization rows retained. |

#### Deferred ownership

- Required Schedule creation, versions, edits, historical locks, and Course-date synchronization remain in Phase 5. Availability and Tutor reassignment remain in Phase 6.

### RUN-20260722-001 — Phase 4.A Mentor Classroom management entry

| Field | Value |
| --- | --- |
| Status | Complete |
| Purpose | Verify server-derived supervising-Mentor Classroom management authority without enabling premature Course, Membership, Tutor, or schedule mutations. |
| Finished | 2026-07-22 (user terminal results received) |
| Executor | User terminal with Codex `/root` implementation and static checks |
| Environment | Retained LOCAL-SUPABASE project plus local app source |
| Migration state | Applied through `202607220001_classroom_management_surface.sql` |
| Database reset | No; all characterization mutations rolled back |
| Evidence | [`classroom-management-surface-db-self-test.sql`](../../tools/classroom-management-surface-db-self-test.sql) and [`classroom-management-surface-self-test.mjs`](../../tools/classroom-management-surface-self-test.mjs) |

#### Results

| Test ID | Result | Notes |
| --- | --- | --- |
| CLASSROOM-4A-STATIC | PASS | Capability normalization, staged controls, Mentor entry path, responsive hooks, and no-mutation boundary passed. |
| CLASSROOM-4A-AUTHORITY | PASS | The active supervising Mentor received management access; Tutor, Student, and administrator sessions did not receive ordinary Mentor controls. |
| CLASSROOM-4A-OUTSIDER | PASS | The unlinked outsider could not open the retained Classroom projection. |
| CLASSROOM-4A-DB | PASS | All 14 rollback database characterizations passed. |
| CLASSROOM-4A-AUDIT | PASS | Nine actors verified; zero characterization rows retained. |

#### Deferred ownership

- Recurring meetings, availability, conflicts, reassignment, Course extension, and termination remain disabled until their owning Phase 4 slices establish authoritative commands and audit behavior.

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
