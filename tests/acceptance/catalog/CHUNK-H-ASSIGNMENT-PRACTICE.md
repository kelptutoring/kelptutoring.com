# Chunk H — Course assignment and student practice

## Purpose

These cases protect assignment authorization, schedule/session scope, source eligibility, immutable answer-safe snapshots, student-only delivery, cancellation, resumable and repeat attempts, response validation, automatic scoring, pending review, submission immutability, and source-deletion survival.

## Shared setup

- Use [`course-practice-standard-scenarios-v1.json`](../fixtures/course-practice-standard-scenarios-v1.json).
- Database cases require migrations through `202607190001_course_practice_delivery.sql` on disposable `LOCAL-SUPABASE`.
- The authoring question, private grading snapshot, student delivery snapshot, response, and final result are separate data layers and must be asserted separately.

## Cases

### ASSIGN-001 — Only a capable author may assign their own saved active course

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | AUTHN, AUTHZ, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent tutors/students/outsiders or another capable author from assigning a course they do not own.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Owner mentor assigns its saved active populated course. | One assignment is created with server-derived assigner/student/snapshot metadata. |
| 2 | Student, ordinary tutor, outsider, or anonymous caller invokes assignment RPC. | Capability denial; no assignment/items persist. |
| 3 | Different mentor/admin assigns owner's course ID. | Not found/denied because course must be caller-owned. |
| 4 | Owner assigns unsaved, empty, archived, or dirty client-only course. | Denied; authoritative active populated saved course is required. |

#### Forbidden outcomes

- `course.assign` grants access to all course authors' drafts.
- Client-provided assigner, student name, count, points, or status becomes authoritative.

#### Cleanup and evidence

- Roll back assignment/items.
- Minimum evidence: E3 capability/ownership assertions and E2 assignment-control state.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-SCOPE-001`.

### ASSIGN-002 — Assignment atomically revalidates its active session and every source question

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | PERSISTENCE, INTEGRATION, RECOVERY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Stop stale sessions or ineligible source questions from creating incomplete or unsafe assignment snapshots.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Assign fixture course to fixture student's active session. | Assignment and all ordered items commit together. |
| 2 | Use session belonging to another student, removed session, archived schedule, or mismatched student ID. | Entire assignment fails. |
| 3 | Make one source exam/question private, archived, unapproved, or unreviewed after course save. | Entire assignment fails with no partial snapshots. |
| 4 | Restore eligibility and retry. | One complete assignment succeeds. |

#### Forbidden outcomes

- Assignment trusts course save-time eligibility without recheck.
- Invalid item is skipped while count/points claim a complete assignment.

#### Cleanup and evidence

- Roll back all source/session mutations and assignment rows.
- Required evidence: E3 transactional revalidation assertions.
- Invariants: `INV-SOURCE-001`, `INV-RETRY-001`, `INV-HISTORY-001`.

### ASSIGN-003 — One active course/student/session assignment exists at a time

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P1 |
| Coverage | BOUNDARY, PERSISTENCE, RECOVERY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent double delivery from repeated clicks/retries while permitting an explicitly cancelled, never-started assignment to be replaced.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Assign course/student/session once. | One active assignment with one item set is created. |
| 2 | Repeat same assignment call. | Server rejects duplicate; original ID/snapshot unchanged. |
| 3 | Cancel eligible unstarted assignment and assign again. | New assignment ID/snapshot is created; cancelled history remains. |

#### Forbidden outcomes

- Double click creates two active assignments.
- Replacement reactivates or overwrites the cancelled row.

#### Cleanup and evidence

- Roll back both assignment records.
- Minimum evidence: E3 partial-unique/retry assertions.
- Invariants: `INV-RETRY-001`, `INV-HISTORY-001`, `INV-ID-001`.

### ASSIGN-004 — Assignment freezes separate student-delivery and private-grading snapshots

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | IMMUTABILITY, PERSISTENCE, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Preserve grading truth while ensuring students never receive answers, tolerances, rubrics, explanations, solutions, or teacher notes.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Create fixture assignment. | Course title/description, curriculum path, schedule/session metadata, question order/count/points freeze. |
| 2 | Inspect each delivery snapshot. | All `deliveryMustExclude` fields and other grading secrets are absent; prompt/options/media needed to answer remain. |
| 3 | Inspect private grading snapshot as privileged DB test. | Exact answer keys/tolerances/rubric inputs needed for grading remain. |
| 4 | Compare item IDs/order. | Source question ID remains provenance; assignment-local position is contiguous/easiest-to-hardest. |

#### Forbidden outcomes

- Same unrestricted JSON is used for student delivery and grading.
- Browser performs redaction after receiving private grading content.

#### Cleanup and evidence

- Roll back snapshots.
- Required evidence: E3 negative-key scan plus private grading assertions.
- Invariants: `INV-DELIVERY-001`, `INV-HISTORY-001`, `INV-ORDER-001`.

### ASSIGN-005 — Students see only their own non-cancelled answer-safe practice assignments

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | AUTHZ, AUTHN, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent cross-student access, ID guessing, and answer-key exposure in the practice library/player.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Assigned student lists/loads assignment. | Own assigned/completed, non-cancelled item appears with answer-safe ordered questions. |
| 2 | `ACT-OUTSIDER`, tutor, assigner, or anonymous caller loads assignment through student RPC. | Not found/capability denial; no delivery content returned. |
| 3 | Assigned student inspects network/DOM/client state. | No grading snapshot, expected answer, teacher note, solution, rubric, or hidden key exists. |

#### Forbidden outcomes

- Knowing assignment ID grants access.
- Author/reviewer Question Bank payload is embedded in practice page.

#### Cleanup and evidence

- Roll back fixture assignment.
- Required evidence: E3 RPC isolation/redaction and E2 student player inspection.
- Invariants: `INV-AUTH-002`, `INV-DELIVERY-001`, `INV-SCOPE-001`.

### ASSIGN-006 — Assignment snapshots survive source course/question/schedule changes and deletion

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | IMMUTABILITY, PERSISTENCE, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure a learner's delivered work and grade basis cannot drift when authors later edit/archive/delete sources or resync schedules.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Change source course title/order and create edited question copy. | Existing assignment content/order/path remain unchanged. |
| 2 | Resync schedule with renamed/redated/removed session. | Existing assignment schedule snapshot remains unchanged. |
| 3 | Archive/delete source course. | Assignment remains; nullable course reference clears without removing items. |
| 4 | Archive source exam/taxonomy where permitted. | Existing delivery/grading snapshot and attempts remain readable/gradable. |

#### Forbidden outcomes

- Student assignment performs live joins to mutable author content.
- Source deletion cascades into assignment items/attempts/results.

#### Cleanup and evidence

- Roll back source lifecycle scenario after assertions.
- Required evidence: E3 snapshot-before/after comparison.
- Invariants: `INV-SOURCE-001`, `INV-HISTORY-001`, `INV-LIFE-001`.

### ASSIGN-007 — Only an unstarted assignment may be cancelled

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | BOUNDARY, IMMUTABILITY, PERSISTENCE |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Draft — cancellation currently does not reject an existing attempt |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent an author from invalidating work after a student has opened/saved/submitted an attempt while still allowing mistaken untouched assignments to be withdrawn.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Assigner cancels own assigned activity with no attempts. | Status becomes cancelled; snapshot/history remains; student library hides it. |
| 2 | Different author cancels it. | Denied. |
| 3 | Student starts or saves attempt, then assigner cancels. | Cancellation is denied; assignment/attempt remain accessible. |
| 4 | Cancel completed assignment. | Denied. |

#### Forbidden outcomes

- Cancellation strands an open attempt or permits later submission against a hidden cancelled assignment.
- Cancellation deletes assignment/items.

#### Cleanup and evidence

- Record `BLOCKED` until server enforces the no-attempt rule; roll back fixture rows.
- Minimum evidence: future E3 cancellation/attempt assertions.
- Invariants: `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-SCOPE-001`.

### ASSIGN-008 — Starting practice resumes one open attempt and repeats only after submission

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | PERSISTENCE, RECOVERY, NORMAL |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent refresh/double-click from creating competing attempts while allowing deliberate practice again after a final submission.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Assigned student starts activity twice/concurrently. | Same one open attempt is returned; unique open-attempt boundary holds. |
| 2 | Reload after saved progress and start again. | Same attempt number/responses resume. |
| 3 | Submit and choose Practice again. | New attempt receives previous maximum + 1 and empty independent responses. |
| 4 | Outsider or cancelled assignment starts. | Denied/not found. |

#### Forbidden outcomes

- Two in-progress attempts exist for one student/assignment.
- New attempt overwrites prior submitted attempt/result.

#### Cleanup and evidence

- Roll back attempts.
- Required evidence: E3 uniqueness/resume/repeat assertions.
- Invariants: `INV-RETRY-001`, `INV-HISTORY-001`, `INV-ID-001`.

### ASSIGN-009 — Saved progress accepts only bounded responses for assignment question IDs

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | PERSISTENCE, BOUNDARY, RECOVERY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent cross-assignment injection, oversized payloads, and lost resumable answers.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Save partial fixture responses. | Object replaces open attempt responses and survives reload with updated time. |
| 2 | Supply unknown/other-assignment question ID, non-object payload, or payload over 1 MiB. | Entire save fails; prior responses unchanged. |
| 3 | Outsider or owner of another attempt saves by guessed ID. | Open attempt not found; no mutation. |
| 4 | Save submitted attempt. | Denied; final responses/result remain immutable. |

#### Forbidden outcomes

- Client keys create arbitrary response records.
- Failed save clears the last durable progress.

#### Cleanup and evidence

- Roll back progress fixture.
- Minimum evidence: E3 validation/ownership/reload assertions and E2 player recovery.
- Invariants: `INV-RETRY-001`, `INV-SCOPE-001`, `INV-HISTORY-001`.

### ASSIGN-010 — Submission auto-grades supported types and isolates pending human review

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | NORMAL, PERSISTENCE, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Produce deterministic automatic scores from the private frozen grading basis without pretending written work was graded.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Submit `RESPONSES-CORRECT-WITH-ESSAY`. | Choice/multi/numeric earn 7/7 automatic points; essay is `pending-review`; pending count 1. |
| 2 | Submit partial/incorrect fixture on repeat attempt. | Supported answered items are incorrect, unanswered essay is unanswered, score 0/7, pending count 0. |
| 3 | Test multi-answer order/duplicates and numeric tolerance edges. | Set equality ignores order/duplicates; inclusive tolerance behaves deterministically. |
| 4 | Inspect returned result items. | Each contains ID/position/status/points/earned only; no private answer key. |

#### Forbidden outcomes

- Essay/free expression is loosely matched and awarded automatic points.
- Grading uses current source question instead of frozen grading snapshot.

#### Cleanup and evidence

- Roll back attempts.
- Required evidence: E3 scoring and secret-absence assertions.
- Invariants: `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-DELIVERY-001`.

### ASSIGN-011 — Submitted attempt and first completion timestamp remain immutable

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | IMMUTABILITY, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Preserve the exact response/result record used for historical grading while permitting independent repeat practice.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Submit first attempt. | Attempt becomes submitted with final responses/result/time; assignment becomes completed once. |
| 2 | Save/resubmit/update/delete first attempt through client paths. | Denied; row remains unchanged. |
| 3 | Submit second attempt. | Separate immutable result is created; assignment's original completed time is not rewritten. |
| 4 | Reload practice library. | Latest attempt summary advances while complete attempt history remains in database. |

#### Forbidden outcomes

- Repeat practice replaces attempt 1 or grade history.
- Source/cancellation action rewrites submitted result.

#### Cleanup and evidence

- Roll back fixture; never individually edit a submitted attempt during cleanup.
- Required evidence: E3 before/after immutability assertions.
- Invariants: `INV-HISTORY-001`, `INV-RETRY-001`, `INV-SOURCE-001`.

### ASSIGN-012 — Lost-response submission retry returns the same final attempt result

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P0 |
| Coverage | RECOVERY, PERSISTENCE, IMMUTABILITY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Draft — submission idempotency/final-result replay not implemented |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent a network timeout after a successful commit from confusing the student, creating a duplicate attempt, or making the final result unrecoverable.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Submit while suppressing the successful response after commit. | One submitted attempt/result exists. |
| 2 | Retry same attempt with same idempotency identity/responses. | Server returns the existing final result without regrading or creating an attempt. |
| 3 | Retry with conflicting responses. | Conflict is rejected and original final response/result returned or discoverable safely. |

#### Forbidden outcomes

- Retry produces generic not-found with no recovery path.
- Client starts attempt 2 merely to discover whether attempt 1 succeeded.

#### Cleanup and evidence

- Record `BLOCKED` until an idempotent submission/retrieval contract exists.
- Minimum evidence: future E3 lost-response replay assertions.
- Invariants: `INV-RETRY-001`, `INV-HISTORY-001`.

### ASSIGN-013 — Pending written responses receive authorized review and immutable final grading

| Field | Value |
| --- | --- |
| Chunk | H — Assignment and practice |
| Priority | P1 |
| Coverage | AUTHZ, PERSISTENCE, IMMUTABILITY, INTEGRATION |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Draft — mentor review/finalization workflow not implemented |
| Created | 2026-07-19 |

#### Purpose and protected risk

Complete grades containing written work without exposing private grading material or allowing unrelated employees to review a student's response.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Authorized assigned mentor opens pending response. | Sees student response and private frozen rubric/notes only within review surface. |
| 2 | Unrelated tutor/mentor/student opens review ID. | Denied by relationship/assignment scope. |
| 3 | Reviewer awards points/feedback and finalizes. | Append-only review identifies reviewer/time; total grade combines auto and reviewed points. |
| 4 | Source question/course changes. | Final grade/review basis remains unchanged. |

#### Forbidden outcomes

- Pending work is treated as zero/final without policy or as automatically correct.
- Reviewer edits student's submitted response or original auto-grade facts.

#### Cleanup and evidence

- Record `BLOCKED` until review/finalization and relationship scope exist.
- Minimum evidence: future E3 review authorization/immutability plus E2 reviewer/student result surfaces.
- Invariants: `INV-REL-001`, `INV-SCOPE-001`, `INV-HISTORY-001`, `INV-DELIVERY-001`.

## Phase 7 execution note

Existing automation characterizes schedule payloads, assignment adapters, answer-key stripping, practice delivery, response normalization, scoring shape, and UI authorization wiring. `RUN-20260719-001` adds live database evidence for `ASSIGN-004`, `ASSIGN-005`, and `ASSIGN-006`. Browser journeys and the remaining multi-account cases are still pending. `ASSIGN-007`, `ASSIGN-012`, and `ASSIGN-013` remain Draft because their cancellation, retry, and written-review contracts are not yet complete.
