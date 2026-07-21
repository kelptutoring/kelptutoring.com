# Chunk G — Course composition

## Purpose

These cases protect Course Builder authorization, stable curriculum placement, approved-source selection, deterministic sequencing, owner-scoped persistence, duplication, archival, deletion, and the boundary between an editable course draft and an immutable student assignment.

## Shared setup

- Use [`course-composition-standard-scenarios-v1.json`](../fixtures/course-composition-standard-scenarios-v1.json) with its actor, taxonomy, and Question Bank dependencies.
- Database cases require migrations through `202607180007_course_composition.sql` on disposable `LOCAL-SUPABASE`.
- Assignment/schedule/practice behavior is outside this chunk and must not be inferred from course-draft persistence.

## Cases

### COURSE-001 — Only capable mentor/admin workspaces may compose courses

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P0 |
| Coverage | AUTHN, AUTHZ, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent ordinary tutors, students, outsiders, or anonymous clients from reading or mutating course drafts or using answer-bearing Question Bank sources.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Mentor/admin with the current page capability set opens Course Builder. | Workspace and approved-question picker load. |
| 2 | Tutor, student, outsider, or anonymous actor opens page/calls composition RPCs. | Guard and server deny access; no course rows/items are exposed or changed. |
| 3 | Multi-role capable actor changes primary workspace role. | Capabilities remain cumulative; ownership remains the authenticated person. |

#### Forbidden outcomes

- Dashboard link visibility is the only authorization boundary.
- `question_bank.read` alone grants course mutation or `course.compose` grants student delivery.

#### Cleanup and evidence

- Roll back any synthetic course created during the capable path.
- Minimum evidence: E3 RPC/RLS assertions and E2 workspace guard.
- Related checks: `npm run test:course-composition`, `npm run test:authorization`.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`, `INV-SCOPE-001`.

### COURSE-002 — The deepest active track/topic is the stable course destination

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P1 |
| Coverage | NORMAL, BOUNDARY, UI |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Preserve precise arbitrary-depth placement and prevent incompatible questions from remaining selected after a course path changes.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Select degree → subject → track and progressively nested topics. | Deepest selected track/topic ID becomes the definition destination and full path is shown. |
| 2 | Change to another branch with incompatible selected questions; cancel confirmation. | Previous path and selection remain unchanged. |
| 3 | Confirm the change. | Only incompatible questions are removed; compatible descendants remain; draft becomes dirty. |
| 4 | Save with degree/subject or archived/missing node as destination. | Client/server reject; only an active track/topic is valid. |

#### Forbidden outcomes

- Course stores labels as identity or truncates nested topics at a fixed depth.
- Path change silently retains cross-curriculum questions.

#### Cleanup and evidence

- Restore `COURSE-MECHANICS-DRAFT` path/selections.
- Minimum evidence: E2 interaction plus E3 active-node validation.
- Invariants: `INV-ID-001`, `INV-SOURCE-001`, `INV-ORDER-001`.

### COURSE-003 — Question selection reuses the authorized bank and retains choices across filters/pages

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P1 |
| Coverage | NORMAL, INTEGRATION, UI |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Let mentors assemble varied courses without losing already-selected stable references or bypassing Question Bank eligibility.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Open picker after choosing a path. | Search is constrained to the course path and its descendants. |
| 2 | Filter by query/category/difficulty and move between pages. | Only approved bank previews appear; previously selected IDs remain marked and counted. |
| 3 | Add/remove items across pages and close/reopen modal. | One reference per question remains selected; course list reflects all choices. |
| 4 | Attempt picker without a destination. | Picker remains unavailable and explains the prerequisite. |

#### Forbidden outcomes

- Preview content is copied into the course definition or used as authorization.
- Filter/page changes clear prior selections or create duplicates.

#### Cleanup and evidence

- Reset selection to fixture aliases.
- Minimum evidence: E2 picker journey and E3 Question Bank authorization/filter assertions.
- Related cases: `QBANK-005` through `QBANK-009`.
- Invariants: `INV-ID-001`, `INV-SCOPE-001`, `INV-ORDER-001`.

### COURSE-004 — Course save validates its schema, shape, limits, and server-owned fields

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P0 |
| Coverage | PERSISTENCE, BOUNDARY, AUTHZ |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent malformed or client-forged definitions from creating ambiguous ownership, unsafe size, or partial item rows.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Save valid `COURSE-MECHANICS-DRAFT`. | Server derives owner/status/timestamps, stores schema v1, and returns normalized course. |
| 2 | Submit missing/wrong schema, invalid ID, blank/overlong title, overlong description, or non-array question IDs. | Request fails transactionally. |
| 3 | Submit blank/duplicate IDs or more than 300 references. | Request fails; prior course/items remain unchanged. |
| 4 | Forge owner/status/created time in payload. | Fields are ignored/not accepted; authenticated server values win. |

#### Forbidden outcomes

- Client ownership or lifecycle fields become authoritative.
- Failed replacement deletes the previously saved item set.

#### Cleanup and evidence

- Roll back the synthetic course and items.
- Minimum evidence: E3 RPC/database atomicity assertions.
- Invariants: `INV-OWN-001`, `INV-AUTH-002`, `INV-RETRY-001`.

### COURSE-005 — Every save transactionally revalidates source-question eligibility and curriculum scope

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P0 |
| Coverage | PERSISTENCE, INTEGRATION, RECOVERY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent stale, private, rejected, unreviewed, archived, or cross-curriculum references from being saved merely because they once appeared in a picker.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Save the eligible fixture set. | All references persist beneath selected path. |
| 2 | Make one source ineligible after selection, then save. | Entire save fails; no partial course/item mutation. |
| 3 | Supply eligible Algebra question to Mechanics course. | Save fails as cross-curriculum. |
| 4 | Remove/replace invalid reference and retry same course ID. | One consistent update succeeds. |

#### Forbidden outcomes

- Browser picker eligibility is trusted without server recheck.
- Invalid item is dropped silently while the rest of the save reports success.

#### Cleanup and evidence

- Restore/rollback source state and course.
- Required evidence: E3 save eligibility matrix and transactional assertions.
- Invariants: `INV-SOURCE-001`, `INV-RETRY-001`, `INV-SCOPE-001`.

### COURSE-006 — Student sequence is easiest-to-hardest with stable order inside each difficulty

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P1 |
| Coverage | NORMAL, PERSISTENCE, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Guarantee the intended learning progression independently of picker page, source exam position, or requested cross-difficulty order.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Submit fixture questions in scrambled difficulty order. | Returned order is very easy → easy → difficult → very difficult → challenge with contiguous positions. |
| 2 | Add two questions of one difficulty in a chosen order. | Their relative selection/request order is preserved. |
| 3 | Reload and save again. | IDs/order remain stable and difficulty counts agree with sequence. |

#### Forbidden outcomes

- Source exam position overrides difficulty progression.
- Client and database return different orderings.

#### Cleanup and evidence

- No persisted cleanup for domain characterization; roll back DB counterpart.
- Required evidence: E3 from `npm run test:course-composition` and DB characterization.
- Invariants: `INV-ORDER-001`, `INV-ID-001`.

### COURSE-007 — Authors list, load, and edit only their own active course IDs

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, NORMAL |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Keep mentor/admin drafts private to their author while allowing repeated edits to the same stable active course identity.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Mentor saves, lists, loads, edits, and resaves its course. | Same ID/created time/owner; updated time and intended fields/items change. |
| 2 | Admin lists/loads mentor ID. | Mentor course is absent/not found despite admin's composition capability. |
| 3 | Admin tries saving mentor's ID. | Explicit owner conflict; mentor record remains unchanged. |
| 4 | Direct table read as outsider. | RLS filters course and item rows. |

#### Forbidden outcomes

- Capability alone exposes all authors' drafts.
- Editing silently produces a second course or replaces source question identities.

#### Cleanup and evidence

- Roll back both authors' synthetic records.
- Minimum evidence: E3 owner-scoped RPC/RLS assertions and E2 My course drafts UI.
- Invariants: `INV-SCOPE-001`, `INV-OWN-001`, `INV-ID-001`.

### COURSE-008 — Duplication creates an independent active draft while retaining source references

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P1 |
| Coverage | PERSISTENCE, NORMAL, RECOVERY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Support safe course evolution without changing the original draft or unnecessarily duplicating approved questions.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Duplicate active and archived owner course. | New UUID, active status, new times, `Copy of …` title, same owner/path/reference order. |
| 2 | Edit copy. | Original definition/items remain unchanged. |
| 3 | Inspect questions. | Copy references the same approved question IDs; it does not clone answer-bearing question rows. |
| 4 | Outsider duplicates source ID. | Not found/denied. |

#### Forbidden outcomes

- Course duplication reuses source course ID or grants ownership of source questions.
- An ineligible stale reference becomes assignment-safe merely because it was duplicated.

#### Cleanup and evidence

- Archive/delete or roll back duplicated draft.
- Minimum evidence: E3 identity/reference/ownership assertions.
- Invariants: `INV-ID-001`, `INV-SOURCE-001`, `INV-SCOPE-001`.

### COURSE-009 — Archive precedes deletion and course deletion never deletes source questions

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P0 |
| Coverage | PERSISTENCE, IMMUTABILITY, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Provide a recoverable lifecycle and preserve independently owned source questions and any future assignment history.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Delete active course. | Denied with archive-first guidance. |
| 2 | Archive own active course. | Same ID becomes archived with timestamp; active list omits it and archived list contains it. |
| 3 | Overwrite archived ID. | Denied; author must duplicate it. |
| 4 | Delete archived course. | Course/items are removed; every source exam question/classification remains. |
| 5 | Outsider archives/deletes ID. | Denied/not found. |

#### Forbidden outcomes

- Archive hard-deletes the course or cascades to source questions.
- Deleting course rewrites an assignment snapshot or review/publication history.

#### Cleanup and evidence

- Roll back lifecycle scenario; hard deletion is permitted only for the confirmed synthetic archived draft.
- Required evidence: E3 lifecycle and source-survival assertions.
- Invariants: `INV-LIFE-001`, `INV-SOURCE-001`, `INV-HISTORY-001`.

### COURSE-010 — An editable course draft is not a student assignment

| Field | Value |
| --- | --- |
| Chunk | G — Course composition |
| Priority | P0 |
| Coverage | BOUNDARY, AUTHZ, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent save/duplication from granting student access or creating a live mutable delivery reference.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Save `COURSE-EMPTY-DRAFT`. | Empty authoring structure may persist, but assignment controls remain unavailable. |
| 2 | Inspect composition schema/migration. | No student, schedule, session, assignment, response, or grading fields/rows are created. |
| 3 | Save populated course with pending unsaved edits. | Draft remains authoring data; assignment readiness requires a populated active saved unchanged course and separate assignment RPC. |
| 4 | Student tries course composition ID. | No course content or questions are delivered through composition RPC/table access. |

#### Forbidden outcomes

- Saving a course is treated as publication/assignment.
- Student delivery joins directly to editable course or answer-bearing Question Bank records.

#### Cleanup and evidence

- Delete/roll back empty fixture draft.
- Required evidence: E3 phase-boundary assertions from `npm run test:course-composition`; assignment behavior belongs to Phase 7 cases.
- Invariants: `INV-DELIVERY-001`, `INV-REL-001`, `INV-HISTORY-001`.

## Phase 6 execution note

Existing automation characterizes normalization, ordering, adapter RPCs, page capability wiring, persistence shape, and the assignment boundary. Live owner/RLS, transactional source revalidation, duplication, and archive/delete assertions remain pending until the disposable local Supabase reset and recorded database execution.
