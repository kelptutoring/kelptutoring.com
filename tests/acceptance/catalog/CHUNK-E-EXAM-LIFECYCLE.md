# Chunk E — Exam lifecycle

## Purpose

These cases protect exam/question identity, authoring, classification, ordering, media/graph persistence, grading, results, PDF output, and definition lifecycle. Shared review/publication behavior is defined in [`SHARED-CONTENT-PUBLICATION.md`](./SHARED-CONTENT-PUBLICATION.md).

## Shared setup

- Use actors/resources from [`content-lifecycle-standard-scenarios-v1.json`](../fixtures/content-lifecycle-standard-scenarios-v1.json).
- Use [`exam-builder-comprehensive-test.json`](../../../src/app/exam-builder/test-fixtures/exam-builder-comprehensive-test.json) without changing the canonical fixture.
- Classification cases require the current curriculum taxonomy migration and active track/topic nodes.
- Browser authoring/grading may use `LOCAL-STATIC`; owner, review, classification, and lifecycle assertions require `LOCAL-SUPABASE`.

## Cases

### EXAM-001 — Importing an exam creates independent exam and question identities

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P0 |
| Coverage | NORMAL, PERSISTENCE, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent an imported exam from overwriting its source or sharing question identities that later belong to another owner/definition.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Import `EXAM-COMPREHENSIVE` as a copy. | A new exam identity is generated and the source remains unchanged. |
| 2 | Compare all twenty questions. | Every question receives a new unique ID; order, content, grading rules, PDF settings, media, graphs, and classification proposals are preserved. |
| 3 | Export and re-import the copy. | Persistence bundle's `exam.questionIds` exactly matches the ordered question records. |
| 4 | Inspect provenance. | Safe source/copy provenance may remain, but does not retain source ownership or authorization. |

#### Forbidden outcomes

- Copy and source share exam/question IDs.
- Import trusts `madeBy`, owner, review, or publication fields as server authority.

#### Cleanup and evidence

- Discard local copy or remove its synthetic archived draft record.
- Minimum evidence: E3 for identity/order and E2 for source preservation.
- Related checks: `npm run test:exam-builder`, `npm run test:exam-supabase`.
- Invariants: `INV-ID-001`, `INV-OWN-001`, `INV-TEST-001`.

### EXAM-002 — Owner persistence keeps definition and question rows transactional and ordered

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, NORMAL |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prove one owner-scoped save atomically persists the exam definition, independent question records, order, and classification proposals.

#### Actors and preconditions

- Owner `ACT-TUTOR`; outsider `ACT-OUTSIDER`.
- `EXAM-TUTOR-DRAFT` is active/private/draft.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Owner saves imported copy. | Exam appears in My exams. | Server derives owner/timestamps/lifecycle; one definition and twenty ordered question rows commit together. |
| 2 | Owner changes prompt and order, then saves. | Reload shows exact edit and order. | Same exam/question IDs persist; positions and bundle order agree. |
| 3 | Send invalid/missing/misordered or duplicate question IDs. | Save fails without partial visible update. | Transaction rolls back; prior definition/question rows remain intact. |
| 4 | Outsider loads or overwrites the ID. | Access fails/record absent. | RLS/RPC preserves owner content. |

#### Forbidden outcomes

- Definition saves while some question rows fail.
- Client-supplied owner/review/publication fields become authoritative.

#### Cleanup and evidence

- Archive/delete eligible synthetic draft or reset database.
- Minimum evidence: E3 for transaction, owner scope, identity, and order; E2 for reload.
- Related checks: `npm run test:exam-supabase`, `npm run test:exam-builder`.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-ID-001`, `INV-SCOPE-001`.

### EXAM-003 — Review/publication requires complete question classification

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, BOUNDARY, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent unclassified questions from entering trusted review, publication, the Question Bank, or later course composition.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Submit/publish an exam with no questions. | Rejected. |
| 2 | Add a question with `unclassified` difficulty. | Rejected. |
| 3 | Add difficulty but omit supported question type tags. | Rejected by current classification gate. |
| 4 | Add tags but omit an active track/topic curriculum link or use archived/invalid node. | Rejected. |
| 5 | Complete difficulty, tags, primary/linked active curriculum path for every question. | Review submission becomes eligible; mentor/admin owner direct publication becomes eligible. |
| 6 | Approve/publish through a valid path. | Question and curriculum-link classifications become `reviewed`; definition becomes approved/public. |

#### Forbidden outcomes

- Browser classification labels alone bypass database validation.
- Approval reviews only bundle JSON while independent question/link rows remain proposed.

#### Cleanup and evidence

- Roll back/reset lifecycle fixtures.
- Minimum evidence: E3 for every rejection and reviewed-row transition.
- Related checks: `npm run test:exam-builder`, `npm run test:question-bank`, `npm run test:publication`.
- Invariants: `INV-PUB-001`, `INV-DELIVERY-001`, `INV-OWN-001`.

### EXAM-004 — Comprehensive question, media, and graph content survives round trips

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P1 |
| Coverage | NORMAL, PERSISTENCE, UI, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure every supported response/media family retains its authoring, preview, student, and persistence semantics.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Import the comprehensive 20-question fixture. | Supported multiple choice/answer, true-false, numeric, short/essay, text/image/graph option, body media, and diagram content loads. |
| 2 | Open/minimize live preview and inspect each question. | Prompt, options, media, graphs, points, and answer controls render without mutation. |
| 3 | Export JSON, save/reload draft, and reopen student view. | Semantically equivalent content and stable IDs/order remain. |
| 4 | Edit representative function plots, measurements, constrained shapes, labels, and circuits. | Diagram-editor data survives builder→preview→export/import. |

#### Forbidden outcomes

- Irrelevant type fields become active grading settings.
- Graph/media data is dropped, duplicated, or assigned to another question/option.

#### Cleanup and evidence

- Discard local copy and generated media evidence after safe review.
- Minimum evidence: E3 structural round-trip plus E2 representative render screenshots.
- Related check: `npm run test:exam-builder`.
- Invariants: `INV-ID-001`, `INV-ORDER-001`.

### EXAM-005 — Reordering changes student order without changing question identity

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P1 |
| Coverage | NORMAL, PERSISTENCE, UI |
| Automation | AUTOMATED |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Protect question identity and answer/metadata association while drag, arrow, duplicate, and remove operations change the visible order.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Move questions using arrows and drag cue lines. | Only ordered positions change; student numbering becomes contiguous 1…N. |
| 2 | Duplicate one question. | Duplicate receives a new ID and independent nested data while preserving copied content. |
| 3 | Remove a confirmed question. | Removed ID leaves definition/order; remaining identities and answers do not shift between records. |
| 4 | Export/save/reload. | Student order, question IDs, and independent rows match exactly. |

#### Forbidden outcomes

- Reordering regenerates IDs or associates an answer/media payload with a different prompt.
- Duplicate reuses source question ID.

#### Cleanup and evidence

- Reset fixture copy.
- Required evidence: E3 from `npm run test:exam-builder`.
- Invariants: `INV-ID-001`, `INV-ORDER-001`.

### EXAM-006 — Automatic grading and pending review are separated by response type

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P0 |
| Coverage | NORMAL, BOUNDARY, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent incorrect automatic scores and ensure written/unsupported expression responses remain visibly pending human review.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Submit correct/incorrect multiple choice and true-false. | Exact stored keys produce deterministic earned points. |
| 2 | Submit multiple-answer exact, partial, and incorrect sets. | Configured partial-credit rules apply without option-order accidents. |
| 3 | Submit numeric equivalent, tolerance-boundary, unit, and ungradable expression cases. | Numeric engine grades only supported cases; unsupported cases remain review/clearly ungraded. |
| 4 | Submit short and essay responses. | Items have `status=review`, contribute to `reviewNeeded`, and do not inflate automatic percentage. |
| 5 | Inspect result aggregates. | Earned/possible/automatic/review counts equal item-level records. |

#### Forbidden outcomes

- Written answer text is matched loosely and treated as authoritative automatic grading.
- Pending-review points are counted as automatically correct or wrong without policy.

#### Cleanup and evidence

- Clear local detailed results after evidence capture.
- Minimum evidence: E3 grading assertions and E2 result presentation.
- Related check: `npm run test:exam-builder`.
- Invariants: `INV-HISTORY-001`, `INV-ORDER-001`.

### EXAM-007 — Final results retain an immutable grading basis independent of source edits

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P0 |
| Coverage | PERSISTENCE, IMMUTABILITY, INTEGRATION |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Draft — authoritative exam assignment/submission backend not implemented |
| Created | 2026-07-19 |

#### Purpose and protected risk

Define the required future boundary: a completed student's questions, responses, grading keys/rules, points, and score cannot change when the editable exam source later changes.

#### Expected actions and outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Assign an answer-safe immutable exam snapshot and complete an attempt. | Final result references the assignment/attempt and its private grading snapshot, not the live author definition. |
| 2 | Edit/duplicate/archive/delete the source exam where lifecycle permits. | Historical result, item order, keys/rules, earned/possible points, and review state remain unchanged. |
| 3 | Re-render results and answer review. | Frozen question/answer context remains available under authorized access. |

#### Forbidden outcomes

- Result joins the current source exam to recalculate grades.
- Source deletion erases legitimate student history.

#### Cleanup and evidence

- Do not fabricate a pass before the assignment/submission domain exists; record `BLOCKED` when selected today.
- Future minimum evidence: E3 database snapshot comparison.
- Invariants: `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-DELIVERY-001`.

### EXAM-008 — Exam and answer-key PDFs preserve margins, order, media, and answer spaces

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P2 |
| Coverage | NORMAL, BOUNDARY, UI |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure printed student exams and answer keys remain usable across question types without clipping or leaking answers into the student version.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Configure no/small/medium/large/custom PDF answer blocks on eligible questions. | Type-appropriate options and custom millimeters persist by question ID. |
| 2 | Print student PDF. | Current student order, prompts/media, safe margins, and configured blank spaces render; answer keys/teacher notes are absent. |
| 3 | Print answer key. | Correct answers and grading context render on the authorized key without changing the exam. |
| 4 | Inspect page breaks around graphs/images. | Content follows existing non-splitting/page-margin rules where supported. |

#### Forbidden outcomes

- Student PDF contains answer keys or teacher-only content.
- PDF settings migrate to another question after reorder.

#### Cleanup and evidence

- Delete temporary PDFs after sanitized comparison.
- Minimum evidence: E2 rendered pages plus E3 answer-space/order contract.
- Related check: `npm run test:exam-builder`.
- Invariants: `INV-DELIVERY-001`, `INV-ID-001`, `INV-ORDER-001`.

### EXAM-009 — Archive and hard deletion obey private-draft lifecycle rules

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent unsafe deletion or mutation of reviewed/published definitions while allowing an owner to remove an unchanged archived private draft.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Archive an active unchanged private draft as owner. | Status becomes archived and timestamp is server-derived; content remains unchanged. |
| 2 | Attempt to edit archived draft. | Rejected with open-as-copy guidance. |
| 3 | Hard-delete archived private draft as owner. | Definition and its derived question rows are removed. |
| 4 | Attempt archive/delete of pending-review, approved/public, another owner's, or active unarchived exam. | Rejected; review/publication/question records remain unchanged. |

#### Forbidden outcomes

- Public/review history is destroyed through draft-delete policy.
- Archiving changes bundle/question content.
- Deleting one exam removes questions owned by another exam.

#### Cleanup and evidence

- Roll back/reset synthetic lifecycle records.
- Minimum evidence: E3 for allowed and denied transitions.
- Related checks: `npm run test:exam-supabase`, `npm run test:publication`.
- Invariants: `INV-LIFE-001`, `INV-SOURCE-001`, `INV-SCOPE-001`.

### EXAM-010 — A question ID cannot be owned by two exams

| Field | Value |
| --- | --- |
| Chunk | E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Protect independently retrievable question identity and prevent one exam save from hijacking another exam's reusable question record.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Save an owner exam with a stable question ID. | Question row belongs to that exam/owner. |
| 2 | Save another exam—same or different owner—reusing the ID. | Entire save fails with import/open-as-copy guidance; first exam/question is unchanged. |
| 3 | Import second exam as copy and regenerate IDs. | Save succeeds with new question identity and safe provenance. |

#### Forbidden outcomes

- Later save reassigns the existing question row or merges content across exams.
- Client provenance is treated as ownership permission.

#### Cleanup and evidence

- Archive/delete eligible synthetic drafts or reset database.
- Minimum evidence: E3 for uniqueness, ownership, rollback, and successful copied identity.
- Related check: `npm run test:exam-supabase`.
- Invariants: `INV-ID-001`, `INV-OWN-001`, `INV-SOURCE-001`.

## Phase 4 execution note

The Exam cases are canonical. `EXAM-005` is fully characterized today; several other cases have partial static coverage. `EXAM-007` intentionally remains Draft/blocked until authoritative exam assignment and immutable result persistence are implemented.
