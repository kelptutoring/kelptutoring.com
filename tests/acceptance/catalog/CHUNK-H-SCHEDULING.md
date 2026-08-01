# Chunk H — Scheduling and synchronization

## Purpose

These cases protect deterministic date-only schedule generation, stable session identities, browser-draft recovery, explicit backend synchronization, server validation, creator scope, and the future relationship-scoped student chooser used before course assignment.

## Shared setup

- Use [`course-practice-standard-scenarios-v1.json`](../fixtures/course-practice-standard-scenarios-v1.json).
- Browser authoring may use `LOCAL-STATIC`; synchronized ownership/RPC cases require migrations through `202607190001_course_practice_delivery.sql` on `LOCAL-SUPABASE`.
- The Schedule Generator is still browser-backed; synchronization from Course Builder is a deliberate transitional bridge.

## Cases

### SCHED-001 — Date-only cadence remains deterministic in the student's IANA timezone

| Field | Value |
| --- | --- |
| Chunk | H — Scheduling |
| Priority | P1 |
| Coverage | NORMAL, BOUNDARY, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent UTC/local-browser shifts, invalid dates, or cadence drift from assigning practice to the wrong student day.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Generate fixed-period sessions. | Each start/end range advances by exact calendar-day intervals. |
| 2 | Generate weekly sessions with unordered/duplicate weekdays. | Weekdays normalize uniquely and dates follow the requested calendar sequence. |
| 3 | Test leap/invalid date, cadence outside bounds, session count, and invalid timezone. | Invalid input is rejected; no partial schedule is built. |
| 4 | Build in different browser host timezones. | `YYYY-MM-DD` schedule output remains identical. |

#### Forbidden outcomes

- Local midnight conversion moves a session one day.
- Country/city label is stored in place of a valid IANA timezone.

#### Cleanup and evidence

- Discard generated browser fixture.
- Required evidence: E3 from `npm run test:schedule-domain`.
- Invariants: `INV-ORDER-001`, `INV-TEST-001`.

### SCHED-002 — Modules and sessions retain stable identity while the outline is edited

| Field | Value |
| --- | --- |
| Chunk | H — Scheduling |
| Priority | P1 |
| Coverage | NORMAL, UI, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Keep assignment targets stable while modules/sessions are renamed, reordered, added, removed, or reconciled with source plans.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Reorder sessions and module blocks with arrows/drag behavior. | Stable session IDs remain; positions/date sequence recalculate intentionally. |
| 2 | Rename/add/remove module. | Sessions move according to documented adjacent-module rule; final module cannot be removed. |
| 3 | Remove source plan and reconcile. | Removed source session disappears without changing unrelated session IDs. |
| 4 | Add custom session. | New stable client/session identity is created and survives preview/save. |

#### Forbidden outcomes

- Display position or title becomes session identity.
- Reorder duplicates or silently drops a session.

#### Cleanup and evidence

- Restore fixture outline or clear browser draft.
- Required evidence: E3 from `npm run test:schedule-outline` and `npm run test:schedule-builder`.
- Invariants: `INV-ID-001`, `INV-ORDER-001`.

### SCHED-003 — Browser draft persistence is recoverable but not authoritative until explicit synchronization

| Field | Value |
| --- | --- |
| Chunk | H — Scheduling |
| Priority | P1 |
| Coverage | PERSISTENCE, RECOVERY, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active — transitional browser-to-backend bridge |
| Created | 2026-07-19 |

#### Purpose and protected risk

Preserve in-progress authoring while preventing local storage from being mistaken for a student-owned backend schedule.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Build partial schedule, reload, and restore draft. | Step, selections, outline, stable schedule ID, settings, and timezone return. |
| 2 | Save generated schedule. | Browser document and saved time persist and interactive schedule opens. |
| 3 | Open Course Builder before synchronization. | No authoritative student sessions exist solely because local storage exists. |
| 4 | Choose student and explicitly sync. | Validated schedule/session records become available for that student. |

#### Forbidden outcomes

- Any signed-in browser's local schedule automatically assigns another student's backend schedule.
- Hosted failure silently claims synchronization succeeded.

#### Cleanup and evidence

- Clear synthetic browser keys and roll back synchronized rows.
- Minimum evidence: E2 reload/sync UI plus E3 backend row assertions.
- Invariants: `INV-OWN-001`, `INV-RETRY-001`, `INV-SCOPE-001`.

### SCHED-004 — Schedule synchronization validates student, schema, timezone, and every session

| Field | Value |
| --- | --- |
| Chunk | H — Scheduling |
| Priority | P0 |
| Coverage | BOUNDARY, AUTHZ, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent malformed browser data, non-student targets, ambiguous identities, or impossible dates from becoming assignment targets.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Sync fixture to an active student. | Server derives creator, stores source snapshot/version, timezone, and stable source keys. |
| 2 | Use missing/inactive non-student target, invalid schema/timezone/name/source ID. | Entire request is denied. |
| 3 | Submit 0 or over 500 sessions, duplicate/blank session IDs, blank/overlong titles, invalid/reversed dates. | Entire request fails; prior schedule remains unchanged. |

#### Forbidden outcomes

- Client `createdBy`, database IDs, or lifecycle status becomes authoritative.
- Invalid sessions are silently dropped while synchronization reports success.

#### Cleanup and evidence

- Roll back schedule/session rows.
- Minimum evidence: E3 RPC/database validation assertions.
- Invariants: `INV-OWN-001`, `INV-AUTH-002`, `INV-RETRY-001`.

### SCHED-005 — Repeated synchronization upserts one schedule and reconciles sessions by source key

| Field | Value |
| --- | --- |
| Chunk | H — Scheduling |
| Priority | P0 |
| Coverage | PERSISTENCE, RECOVERY, IMMUTABILITY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent retries and later edits from duplicating schedules/sessions or breaking assignment references.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Sync fixture twice with same student/source key. | One schedule database ID remains; existing session IDs are reused by source key. |
| 2 | Rename/reorder/redate a session and sync. | Same session row updates and list order follows date, position, stable ID. |
| 3 | Remove one source session and add another. | Removed row becomes `removed`; new active row appears; active-session list excludes removed row. |
| 4 | Inspect an existing assignment snapshot. | Its frozen schedule/session labels and dates remain unchanged. |

#### Forbidden outcomes

- Retry creates duplicate active schedule/session rows.
- Schedule resync rewrites prior assignment metadata.

#### Cleanup and evidence

- Roll back all sync revisions and assignment fixture.
- Required evidence: E3 idempotent/reconciliation/snapshot assertions.
- Invariants: `INV-RETRY-001`, `INV-HISTORY-001`, `INV-SOURCE-001`.

### SCHED-006 — Schedule management remains creator-scoped unless explicit authorization management applies

| Field | Value |
| --- | --- |
| Chunk | H — Scheduling |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent one capable employee from silently taking over another employee's synchronized student schedule.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Original mentor resyncs its schedule. | Update succeeds. |
| 2 | Different mentor with `course.assign` resyncs same student/source key. | Denied because another authorized employee manages it. |
| 3 | Administrator with explicit `authorization.manage` performs approved takeover/update. | Allowed and auditable according to privileged policy. |
| 4 | Student/ordinary tutor calls sync/list-session RPC. | Capability denial; no rows revealed. |

#### Forbidden outcomes

- `course.assign` alone grants access to every employee's schedule records.
- Browser-supplied creator ID transfers ownership.

#### Cleanup and evidence

- Roll back both employee scenarios.
- Minimum evidence: E3 creator/capability assertions.
- Invariants: `INV-SCOPE-001`, `INV-OWN-001`, `INV-AUTH-002`.

### SCHED-007 — Student discovery for scheduling and assignment is relationship-scoped

| Field | Value |
| --- | --- |
| Chunk | H — Scheduling |
| Priority | P0 |
| Coverage | AUTHZ, INTEGRATION, BOUNDARY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Draft — tutor/mentor/student relationship domain not implemented |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure a mentor/tutor sees only students linked through an active permitted relationship rather than every account holding the student role.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Mentor opens student chooser. | Only actively related students in permitted scope appear. |
| 2 | Search/select unrelated `ACT-OUTSIDER`. | Account is absent and server rejects direct-ID schedule/assignment calls. |
| 3 | End/suspend relationship. | Future discovery/access disappears without rewriting existing legitimate schedules/assignments. |

#### Forbidden outcomes

- Active student role alone makes a profile visible to every course assigner.
- Relationship termination deletes historical assignment snapshots or attempts.

#### Cleanup and evidence

- Record `BLOCKED` until Chunk C relationships exist; do not accept the current global student list as a pass.
- Minimum evidence: future E3 relationship-aware RPC/RLS assertions.
- Invariants: `INV-REL-001`, `INV-REL-002`, `INV-SCOPE-001`, `INV-HISTORY-001`.

### SCHED-008 — Progress and pacing authority remains role-aware

- Student, assigned Tutor, and supervisory Mentor actions retain their distinct authority.
- Tutor and Mentor progress changes require one Student-visible explanation.
- Ordinary current-time pre-start progress is allowed; an explicit historical timestamp before the Course start is rejected.
- A Student cannot mark Studied during the six-hour hold before a recurring or booked on-demand Class, while Reviewed and Practiced remain available.
- Adaptive pacing advances unfinished work outside the hold; Static pacing preserves future dates.
- Reversing Studied progress restores the stable Session after its nearest surviving predecessor on the current cadence, never on a stale mark-time date.
- A cadence revision publishes one complete frontend-calculated future lane; the server rejects vacancies, identity drift, and weekdays inherited from the former Version.
- Course End contracts and expands with the same active effective lane; Static pacing retains its frozen terminal date.
- Evidence: `npm run test:schedule-cadence-change-regressions`, `npm run test:schedule-regression-checkpoint`, `course-progress-ledger-db-self-test.sql`, and `course-schedule-pacing-policy-db-self-test.sql`.

### SCHED-009 — Schedule continuation and replacement preserve the correct history

- Removing an untouched Track is a continuation and does not discard legitimate progress.
- Removing a started Track requires explicit full replacement; the retired Schedule and its progress remain available through History.
- Studied and delivered work remain date-locked. Practiced work remains retained but may move with future pacing.
- Qualification failures reject publication atomically without creating a Version or receipt.
- Evidence: `npm run test:schedule-cadence-continuation`, `npm run test:schedule-regression-checkpoint`, and `course-schedule-qualification-publication-db-self-test.sql`.

### SCHED-010 — The consolidated regression gate leaves no database residue

- The complete Classroom and Schedule source suites run alongside all canonical rollback database characterizations.
- The post-run audit verifies all nine deterministic actors and scans nested Phase keys such as `phase5g2-4-7-2-db-*`.
- Evidence: `RUN-20260731-004`.

## Phase 5.G execution note

Phase 5.G.2.4.7.4 closes the consolidated role, progress, pacing, revision, qualification, History, and cleanup checkpoint. Browser-only visual judgment remains a manual-QA concern, but the underlying source contracts and all 35 database characterizations are executable and passed in `RUN-20260731-004`. `SCHED-007` deliberately remains Draft because role membership and account relationships are different authorization facts.
