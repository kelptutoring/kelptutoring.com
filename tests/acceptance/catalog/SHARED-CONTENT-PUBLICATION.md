# Shared content review and publication

## Purpose

These `PUB` cases protect the common Form/Exam transition from private author draft to trusted public/catalog-eligible content. They apply to both Chunk D and Chunk E unless a step explicitly names one resource type.

## Shared setup

- Use tutor-owned and mentor-owned resources from [`content-lifecycle-standard-scenarios-v1.json`](../fixtures/content-lifecycle-standard-scenarios-v1.json).
- Use `ACT-TUTOR`, `ACT-TEACHER`, `ACT-MENTOR`, and `ACT-ADMIN` with the standard authorization fixture.
- Exam eligibility additionally requires every question to pass `EXAM-003` classification gates.
- Review and publication assertions require `LOCAL-SUPABASE`.

## Cases

### PUB-001 — Tutor/teacher authors submit for review but cannot publish directly

| Field | Value |
| --- | --- |
| Chunks | D — Form lifecycle; E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure regular authors cannot bypass independent review while retaining a valid route to submit eligible work.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Tutor/teacher saves eligible active private draft. | Owner-scoped draft remains editable. |
| 2 | Author calls direct form/exam publish RPC. | Denied for missing `*.publish`; lifecycle and events unchanged. |
| 3 | Author submits own eligible draft for review. | Status becomes `pending_review`, visibility remains private, content becomes non-editable under the same ID. |
| 4 | Unrelated tutor/teacher submits another owner's draft. | Denied; owner/state unchanged. |

#### Forbidden outcomes

- UI hiding is the only publication control.
- Tutor-supplied visibility/review fields make content public.

#### Cleanup and evidence

- Review or roll back the synthetic pending records; do not direct-update lifecycle columns.
- Minimum evidence: E3 for capability, ownership, state, and event absence.
- Related checks: `npm run test:publication`, form/exam provider tests.
- Invariants: `INV-AUTH-002`, `INV-PUB-001`, `INV-OWN-001`.

### PUB-002 — Submitted content requires a different capable reviewer

| Field | Value |
| --- | --- |
| Chunks | D — Form lifecycle; E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, BOUNDARY, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent self-approval and review decisions by accounts lacking the appropriate review capability.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Tutor author reviews own pending content. | Denied for missing review capability. |
| 2 | Mentor/admin author submits their own draft, then reviews it themselves. | Denied because reviewer and owner are the same even though capability exists. |
| 3 | Different mentor/admin reviews eligible pending tutor content. | Decision RPC is allowed. |
| 4 | Capable reviewer attempts decision on draft, archived, or already decided content. | Denied because only pending active content may receive a decision. |

#### Forbidden outcomes

- Holding mentor/admin role removes the different-reviewer requirement for submitted copies.
- Client-supplied reviewer ID overrides `auth.uid()`.

#### Cleanup and evidence

- Roll back/reset review fixtures.
- Minimum evidence: E3 for self-review, capability, lifecycle, and server actor assertions.
- Related check: `npm run test:publication`; DB characterization: `tools/content-publication-db-self-test.sql`.
- Invariants: `INV-PUB-001`, `INV-OWN-001`, `INV-HISTORY-001`.

### PUB-003 — Review decisions preserve notes, visibility rules, and append-only history

| Field | Value |
| --- | --- |
| Chunks | D — Form lifecycle; E — Exam lifecycle |
| Priority | P0 |
| Coverage | PERSISTENCE, IMMUTABILITY, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Make every trusted decision auditable and keep publication visibility consistent with the decision.

#### Actions and expected outcomes

| Decision | Required notes | Expected state | Expected history |
| --- | --- | --- | --- |
| approved | Optional by current contract | approved + public + `review_approved` | Review row plus one publication event with owner/reviewer/server time |
| changes_requested | Required | changes_requested + private | Review row; no publication event |
| rejected | Required | rejected + private | Review row; no publication event |

Run each decision on a separate pending synthetic form and exam. Then verify participants can read the related decision history while unrelated actors cannot.

#### Forbidden outcomes

- Change request/rejection succeeds with blank notes.
- Decision overwrites or deletes an earlier review/publication event.
- Non-approved content becomes public.

#### Cleanup and evidence

- History remains until rollback/reset.
- Minimum evidence: E3 for rows, visibility, mode, actor, timestamps, notes, and RLS.
- Related checks: `npm run test:form-review`, `npm run test:exam-review`, `npm run test:publication`.
- Invariants: `INV-PUB-001`, `INV-HISTORY-001`, `INV-SCOPE-001`.

### PUB-004 — Mentor/admin may directly publish only their own eligible private draft

| Field | Value |
| --- | --- |
| Chunks | D — Form lifecycle; E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Preserve privileged direct publication without turning that capability into ownership bypass or publication of incomplete content.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Mentor/admin publishes their own eligible active private draft. | Becomes approved/public with `privileged_direct`; server records publisher/time and publication event. |
| 2 | Mentor/admin directly publishes another author's draft. | Denied even though publisher capability exists. |
| 3 | Mentor/admin publishes empty form/exam or incompletely classified exam. | Denied; no event/state change. |
| 4 | Mentor/admin publishes pending, decided, public, or archived content. | Denied because direct publication accepts only active private draft. |

#### Forbidden outcomes

- Publication capability means global edit/publish ownership.
- Client-supplied publisher/time/mode replaces server values.

#### Cleanup and evidence

- Published synthetic records remain until rollback/reset.
- Minimum evidence: E3 for owner gate, eligibility, mode, actor, and event.
- Related check: `npm run test:publication`.
- Invariants: `INV-PUB-001`, `INV-OWN-001`, `INV-SCOPE-001`.

### PUB-005 — Pending or published content is immutable and changes continue through a copy

| Field | Value |
| --- | --- |
| Chunks | D — Form lifecycle; E — Exam lifecycle |
| Priority | P0 |
| Coverage | PERSISTENCE, IMMUTABILITY, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent review/publication history and downstream references from silently changing when an author edits content after submission or approval.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Attempt to save altered content over pending form/exam. | Rejected with open-as-copy guidance; pending record stays byte-equivalent except trusted lifecycle metadata. |
| 2 | Attempt to save over approved/public form/exam. | Rejected; review/publication history and classifications remain unchanged. |
| 3 | Open/import the definition as a copy. | New private draft with new definition and nested item identities; safe provenance preserved. |
| 4 | Edit/save the copy. | Copy changes independently; original public/pending record is unchanged. |

#### Forbidden outcomes

- Copy retains original nested IDs and competes for question/block ownership.
- Editing a copy rewrites the source or its publication event.

#### Cleanup and evidence

- Archive/delete eligible copy or reset; preserve immutable original until rollback/reset.
- Minimum evidence: E3 for rejected overwrite, new identities, and unchanged source.
- Related checks: `npm run test:publication`, builder/provider tests.
- Invariants: `INV-ID-001`, `INV-HISTORY-001`, `INV-SOURCE-001`.

### PUB-006 — Public/catalog eligibility is not student assignment or answer-bearing access

| Field | Value |
| --- | --- |
| Chunks | D — Form lifecycle; E — Exam lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, INTEGRATION, BOUNDARY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Draft — form/exam assignment and access-token domains are not implemented |
| Created | 2026-07-19 |

#### Purpose and protected risk

Define the student-delivery boundary: approval makes content eligible for trusted catalogs/workflows but never grants arbitrary students the answer-bearing author/reviewer record.

#### Expected actions and outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Publish approved exam and form. | Trusted reviewer/catalog surfaces may find them according to capability. |
| 2 | `ACT-STUDENT` directly reads full definitions, independent exam questions, review rows, or question-bank detail. | Denied unless a future explicit assignment/access service returns a student-safe projection. |
| 3 | Create explicit future form/exam assignment. | Student receives only assigned content and required delivery fields; exam keys, solutions, rubrics, teacher notes, review data, and private grading snapshot remain server-private. |
| 4 | Revoke/cancel assignment where policy permits. | Future access changes without rewriting prior legitimate submissions/results. |

#### Forbidden outcomes

- `visibility=public` acts as a blanket SELECT policy for answer-bearing records.
- Knowing a definition ID constitutes assignment.
- Builder preview JSON is treated as authoritative student authorization.

#### Cleanup and evidence

- Record `BLOCKED` when selected before the assignment domain exists; still verify current direct-read denials where possible.
- Future minimum evidence: E3 for RLS and answer-safe projection keys.
- Related future chunks: C, H, I.
- Invariants: `INV-DELIVERY-001`, `INV-REL-001`, `INV-SCOPE-001`, `INV-HISTORY-001`.

## Phase 4 execution note

The shared publication cases are canonical. `PUB-006` intentionally remains Draft until form/exam assignment and safe delivery are implemented. Existing publication tests provide partial coverage for `PUB-001` through `PUB-005`; live actor/RLS evidence remains pending.
