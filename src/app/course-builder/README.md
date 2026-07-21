# Course Builder architecture

Phase 4 establishes the stable curriculum vocabulary. Phase 5 attaches independently identified exam questions to that vocabulary and exposes an approved, read-only retrieval workspace. Phase 6 composes those approved question references into reusable course drafts. Phase 7 binds a saved course to a student's scheduled session, freezes an immutable delivery snapshot, and exposes a student-safe practice space.

## Hierarchy

The canonical tree deliberately avoids fixed `subtrack` and `sub-subtrack` columns. It uses four node types:

```text
degree -> subject -> track -> topic -> topic -> ...
```

A topic may contain another topic at any depth. This supports concise paths such as `High School / Physics / Physics / Mechanics` and more precise paths such as `... / Mechanics / Kinematics / Two-dimensional motion / Velocity` without schema changes.

Canonical `curriculum_nodes.id` values are the future reference keys for questions and courses. Labels and descriptions may change without changing an ID. Nodes are archived, never hard-deleted through the client. A node can be archived only after its active children are archived.

## Governance

- `taxonomy.propose` lets mentors and administrators read the canonical tree and submit missing-node proposals.
- `taxonomy.manage` lets administrators add canonical nodes directly, approve or reject proposals, edit canonical labels/descriptions/order, and archive leaf nodes.
- Proposal approval creates a canonical node and links both records through `source_proposal_id` / `applied_node_id`.
- Rejection requires review notes.
- Direct table mutation is revoked from authenticated clients. All writes pass through capability-checked RPCs and append `curriculum_taxonomy_events`.

The browser capability checks shape the interface only. The migration functions remain the authorization boundary.

## Reusable questions

Every exam question keeps its globally unique `exam_questions.id`; Phase 5 does not create a second identity. A classified question adds:

- a tutor-proposed difficulty;
- overlapping `questionTypeTags` such as `numeric`, `word-problem`, `graph`, or `multiple-choice`;
- one primary active track/topic ID and an array of curriculum node IDs for forward-compatible multi-classification;
- its source exam, owner, copy provenance, review state, and position.

Structural categories are derived by the builder from the response/media type. `word-problem` remains an optional semantic tutor label. The current UI chooses one primary path, while `exam_question_curriculum_links` is deliberately many-to-many so later review tools can attach another valid node without changing question identity.

Drafts may be stored while incomplete. Moving a question into review or approved publication requires a difficulty, at least one category, and an active track/topic. Approval changes the question and its curriculum links from proposed to reviewed. Older approved questions with no curriculum classification are preserved but do not silently enter the bank.

`question-bank.html` requires `question_bank.read`, currently granted to mentors and administrators. It searches only active, public, approved exams whose questions and primary curriculum links are reviewed. Curriculum filtering includes descendant nodes. Results are paginated and ordered from easiest to hardest; the detail RPC returns the complete question only after the same authorization and publication checks.

## Course composition

`course-composer.html` requires `course.compose`, `course.assign`, and `question_bank.read`, currently granted to mentors and administrators. The editor selects a canonical degree, subject, track, and any depth of nested topics. Its stable destination is the deepest selected track/topic ID; changing that destination removes question selections that no longer belong beneath it after explicit confirmation.

The question picker reuses the approved bank contract, with search, category, difficulty, curriculum, and pagination filters. A course stores ordered `exam_questions.id` references rather than copying answer-bearing question content. On every save, the server rechecks that each reference is still active, public, approved, reviewed, fully classified, and beneath the selected curriculum path. It then normalizes the sequence from `very-easy` through `challenge`, preserving the mentor's selection order within one difficulty.

Course drafts are owner-scoped. Opening a draft edits the same course ID; duplicating creates a new ID and copies only its question references. Archive precedes hard deletion, and deleting a course never deletes or mutates its source exam questions. This makes later source-question lifecycle policy a separate concern from course composition.

## Scheduled assignments and practice

The Course Builder can assign the current saved, active, unchanged course to one active session in a student's learning schedule. The existing Schedule Generator still writes its prototype document to `localStorage`; **Sync browser schedule** sends that document through `upsert_student_learning_schedule`, where the server derives ownership, validates the IANA timezone and session structure, and persists stable schedule/session IDs for the selected student.

Assignment is a publication boundary, not a live reference. `assign_course_to_schedule_session` revalidates the course and every approved source question, then freezes:

- the course title, description, curriculum path, schedule, and session labels;
- one private grading snapshot containing answer keys; and
- one student delivery snapshot with answer keys, solutions, rubrics, explanations, and teacher notes removed by the server.

Each assignment item also retains its original question ID as provenance, but student rendering never joins back to the mutable source question. Archiving or deleting the source course therefore cannot change an existing assignment, response, or score. An unstarted assignment may be cancelled; an assignment with attempts remains historical.

`practice-library.html` lists only the signed-in student's non-cancelled assignments. `course-practice.html` retrieves only the safe delivery projection, renders the frozen questions in easiest-to-hardest order, saves resumable progress, and submits an immutable attempt. Multiple-choice, multiple-answer, true/false, and simple numeric responses can be scored automatically. Written or expression-based responses remain pending mentor review. A submitted attempt is never overwritten; **Practice again** creates the next attempt number.

## Backend resources

Migration: `supabase/migrations/202607180005_curriculum_taxonomy.sql`

Question-bank migration: `supabase/migrations/202607180006_question_bank.sql`

Course-composition migration: `supabase/migrations/202607180007_course_composition.sql`

Course-delivery migration: `supabase/migrations/202607190001_course_practice_delivery.sql`

Tables:

- `curriculum_nodes`
- `curriculum_taxonomy_proposals`
- `curriculum_taxonomy_events`
- `exam_question_curriculum_links`
- `course_compositions`
- `course_composition_items`
- `learning_schedules`
- `learning_schedule_sessions`
- `course_assignments`
- `course_assignment_items`
- `course_practice_attempts`

Authenticated RPCs:

- `propose_curriculum_node(parent_id, node_type, name, description)`
- `create_curriculum_node(parent_id, node_type, name, description)`
- `review_curriculum_proposal(proposal_id, decision, notes)`
- `update_curriculum_node(node_id, name, description, sort_order)`
- `archive_curriculum_node(node_id)`
- `search_question_bank(query, curriculum_node_id, difficulties, question_type_tags, page, page_size)`
- `get_question_bank_item(question_id)`
- `save_course_composition(course_json)`
- `list_my_course_compositions(status)`
- `get_my_course_composition(course_id)`
- `duplicate_course_composition(course_id)`
- `archive_course_composition(course_id)`
- `delete_course_composition(course_id)`
- `list_course_assignment_students()`
- `upsert_student_learning_schedule(student_id, schedule_json)`
- `list_student_learning_sessions(student_id)`
- `assign_course_to_schedule_session(course_id, student_id, session_id)`
- `list_my_course_assignments(student_id, status)`
- `cancel_course_assignment(assignment_id)`
- `list_my_practice_assignments()`
- `get_my_practice_assignment(assignment_id)`
- `start_or_resume_course_practice_attempt(assignment_id)`
- `save_my_course_practice_progress(attempt_id, responses)`
- `submit_my_course_practice_attempt(attempt_id, responses)`

The Supabase-facing curriculum contract lives in `curriculum-supabase-adapters.js`; hierarchy normalization and tree construction live in `curriculum-domain.js`. `question-bank-adapters.js` owns the authorized retrieval contract used by `question-bank.js`. Course draft normalization and ordering live in `course-composition-domain.js`, while `course-composition-adapters.js` owns its Supabase RPC boundary. Assignment, schedule, practice, and attempt normalization live in `course-assignment-domain.js`; `course-assignment-adapters.js` is the only browser-facing RPC adapter for that delivery workflow.

## Deliberately deferred

Phase 7 deliberately does not yet provide mentor grading screens for written responses, assignment-to-class cohorts, or a complete renderer for structured graph-editor data in the practice player. The current Schedule Generator also remains browser-backed; its explicit sync bridge is transitional until schedule authoring itself uses the backend tables directly.

## Verification

Run:

```bash
npm run test:curriculum
npm run test:question-bank
npm run test:course-composition
npm run test:course-practice
npm run test:dashboards
npm run test:authorization
```

Apply the migrations to a local Supabase instance before exercising the live pages. Use `tests/acceptance/LOCAL_SUPABASE_EXECUTION_RUNBOOK.md` for the guarded reset, deterministic actor provisioning, and database-test sequence; do not select arbitrary existing profiles or seed roles directly. Transactional database characterizations live in `tools/question-bank-db-self-test.sql`, `tools/course-composition-db-self-test.sql`, and `tools/course-practice-delivery-db-self-test.sql`; all roll back their fixtures. The Phase 7 database test verifies answer-key stripping, permissions, resumable and repeat attempts, automatic/pending-review scoring, and snapshot survival after source-course deletion.
