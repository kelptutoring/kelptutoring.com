# Chunk F — Reusable questions and Question Bank

## Purpose

These cases protect independent question identity, tutor-supplied classification, reviewer confirmation, answer-bearing access, eligibility, filtering, pagination, and deterministic easiest-to-hardest retrieval. Taxonomy governance is defined in [`CHUNK-F-CURRICULUM-GOVERNANCE.md`](./CHUNK-F-CURRICULUM-GOVERNANCE.md).

## Shared setup

- Use [`curriculum-question-bank-standard-scenarios-v1.json`](../fixtures/curriculum-question-bank-standard-scenarios-v1.json), resolving its symbolic paths and newly imported question IDs during setup.
- Database cases require migrations through `202607180006_question_bank.sql` plus the form/exam publication migrations.
- Question Bank results contain author/reviewer content and are never a student delivery projection.

## Cases

### QBANK-001 — Question classification survives draft save, reload, export, and import-as-copy

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P1 |
| Coverage | NORMAL, PERSISTENCE, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Keep difficulty, category tags, primary curriculum path, and additional paths attached to the correct stable question through authoring round trips.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Apply each fixture question profile and save/reload. | Classification fields return on the same question IDs without duplicates. |
| 2 | Export and import exam as a copy. | Copy receives new exam/question IDs while retaining classification values and valid copied-from provenance. |
| 3 | Reorder questions. | Classification follows stable question identity rather than position. |

#### Forbidden outcomes

- Classification is stored only in UI state or inferred from question type.
- Import reuses source question IDs or turns provenance into authorization.

#### Cleanup and evidence

- Discard browser copies.
- Required evidence: E3 from `npm run test:exam-builder` and `npm run test:question-bank`.
- Invariants: `INV-ID-001`, `INV-SOURCE-001`, `INV-ORDER-001`.

### QBANK-002 — Difficulty, category, and curriculum-link values use controlled vocabularies

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P0 |
| Coverage | BOUNDARY, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent unfilterable spelling variants, invalid curriculum levels, or inconsistent primary links from entering reusable-question metadata.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Save each allowed difficulty and category. | Values normalize/deduplicate and persist from the defined vocabularies. |
| 2 | Save unsupported difficulty/category or malformed curriculum ID. | Rejected without partial question/link changes. |
| 3 | Link degree/subject, archived node, or missing node. | Rejected; only active track/topic nodes are accepted. |
| 4 | Select primary node absent from all links or two primary links. | Rejected; exactly one primary may exist when links exist. |

#### Forbidden outcomes

- Free text creates a new difficulty or category silently.
- Database link rows disagree with the question content classification.

#### Cleanup and evidence

- Roll back synthetic question changes.
- Minimum evidence: E3 trigger/constraint assertions and E2 authoring validation.
- Invariants: `INV-SOURCE-001`, `INV-ID-001`, `INV-TEST-001`.

### QBANK-003 — Every question must be fully classified before review or publication

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P0 |
| Coverage | BOUNDARY, PERSISTENCE, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Stop partially classified exams from reaching reviewers/publication and producing incomplete Question Bank filters.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Leave one question unclassified or without category tags. | Submit-for-review/publication is denied and draft remains editable. |
| 2 | Assign tags but no active track/topic path. | Transition is still denied. |
| 3 | Complete difficulty, at least one category, links, and primary link for every question. | Review submission becomes eligible; classifications remain proposed until approval. |

#### Forbidden outcomes

- One classified question satisfies the entire exam.
- Browser validation is the only publication gate.

#### Cleanup and evidence

- Return the synthetic exam to a private draft or roll back.
- Minimum evidence: E3 transition-trigger/RPC assertions; related checks `npm run test:exam-review`, `npm run test:publication`.
- Invariants: `INV-PUB-001`, `INV-AUTH-002`, `INV-SOURCE-001`.

### QBANK-004 — Approval confirms classifications and synchronizes reviewed link rows

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P0 |
| Coverage | NORMAL, PERSISTENCE, IMMUTABILITY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure reviewer approval confirms the exact immutable question classifications and does not leave content and relational links in conflicting states.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Different capable reviewer approves a tutor exam. | Exam/questions become approved; question and link classifications become reviewed atomically. |
| 2 | Reload review and Question Bank. | Difficulty, categories, and complete curriculum path equal the approved copy. |
| 3 | Attempt same-ID classification edit. | Denied by immutable reviewed/public lifecycle; changes require a new copy. |

#### Forbidden outcomes

- Reviewer confirmation updates only JSON or only link rows.
- Author can approve their own tutor submission or edit the approved classification in place.

#### Cleanup and evidence

- Roll back the publication scenario; do not mutate review history independently.
- Minimum evidence: E3 approval/trigger assertions and E2 review rendering.
- Invariants: `INV-PUB-001`, `INV-HISTORY-001`, `INV-SOURCE-001`.

### QBANK-005 — Only fully eligible questions appear in Question Bank search and lookup

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P0 |
| Coverage | AUTHZ, BOUNDARY, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent drafts, private exams, rejected content, unreviewed classifications, or secondary-link duplicates from becoming reusable source questions.

#### Actions and expected outcomes

| Step | Setup/action | Expected result |
| --- | --- | --- |
| 1 | Search active + public + approved exam/question + reviewed classification/primary link. | Eligible question appears once. |
| 2 | Break each eligibility condition separately. | Question disappears from search and direct lookup returns not found. |
| 3 | Add additional reviewed curriculum link. | Search still returns one item using its single primary path. |

#### Forbidden outcomes

- Publication alone makes incomplete classifications reusable.
- A secondary curriculum link produces duplicate result cards.

#### Cleanup and evidence

- Roll back each state mutation.
- Minimum evidence: E3 eligibility-matrix assertions from Question Bank DB characterization.
- Invariants: `INV-PUB-001`, `INV-SCOPE-001`, `INV-SOURCE-001`.

### QBANK-006 — Question Bank access requires its capability and never grants student delivery

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P0 |
| Coverage | AUTHZ, AUTHN, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Protect full question content, expected answers, rubrics, provenance, and author information from students and unrelated authenticated accounts.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Mentor/admin with `question_bank.read` searches and gets an eligible item. | Search preview and full authoring item are returned. |
| 2 | Student, tutor without capability, outsider, and anonymous client call both RPCs. | Denied before any answer-bearing content is returned. |
| 3 | Capable user reads curriculum link table. | Reviewer/owner RLS still applies independently; capability does not broaden unrelated table access automatically. |

#### Forbidden outcomes

- Knowing a question ID bypasses search authorization.
- Question Bank RPC output is used as a student assignment payload.

#### Cleanup and evidence

- No content cleanup beyond rolled-back fixtures.
- Required evidence: E3 RPC/RLS assertions; related cases `PUB-006`, `AUTH-006`.
- Invariants: `INV-AUTH-002`, `INV-DELIVERY-001`, `INV-SCOPE-001`.

### QBANK-007 — Search composes text, difficulty, category, and descendant curriculum filters

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P1 |
| Coverage | NORMAL, BOUNDARY, INTEGRATION |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Let mentors find precise working items without losing valid matches in deeply nested taxonomy or receiving results that satisfy only part of the selected filters.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Filter Mechanics parent. | Eligible primary links at Mechanics and all descendants match. |
| 2 | Add difficulty and one/more categories. | Difficulty matches selected set; category arrays use overlap; both filter groups combine with the curriculum constraint. |
| 3 | Search name, prompt fragment, and exam title. | Case-insensitive substring matches eligible rows only. |
| 4 | Supply unsupported filter or missing curriculum node. | Request is rejected rather than silently broadened. |

#### Forbidden outcomes

- Descendant traversal stops at a fixed topic depth.
- Invalid filters are dropped server-side and return an unfiltered answer-bearing catalog.

#### Cleanup and evidence

- Roll back search fixtures.
- Minimum evidence: E3 RPC results and E2 filter UI.
- Invariants: `INV-ORDER-001`, `INV-SCOPE-001`, `INV-TEST-001`.

### QBANK-008 — Pagination is bounded, stable, and ordered from easiest to hardest

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P1 |
| Coverage | NORMAL, BOUNDARY, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent skipped/duplicated choices and ensure course authors receive the pedagogical difficulty progression requested by the product.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Search all five difficulties across more than one page. | Order is very easy, easy, difficult, very difficult, challenge. |
| 2 | Inspect ties. | Newer update first, then stable question ID; repeated request returns the same page for unchanged data. |
| 3 | Request page below 1 and page sizes below 1/above 48. | Page normalizes to at least 1 and page size clamps to 1–48; total remains full match count. |

#### Forbidden outcomes

- Database row order determines pagination.
- Client sorting only rearranges one page and misrepresents global difficulty order.

#### Cleanup and evidence

- Roll back pagination fixtures.
- Minimum evidence: E3 multi-page RPC assertions.
- Invariants: `INV-ORDER-001`, `INV-ID-001`.

### QBANK-009 — Direct item lookup returns the exact eligible source question and primary path

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P0 |
| Coverage | NORMAL, AUTHZ, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure a mentor's selection modal retrieves the intended stable question with full content and provenance, rather than reconstructing it from an incomplete preview.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Select an eligible preview and fetch its ID. | Full content retains same question/exam/owner IDs, classification, copied-from ID, and primary path. |
| 2 | Compare image/graph/type/points preview flags with content. | Preview accurately signals content without being the authoritative full item. |
| 3 | Fetch missing or now-ineligible ID. | Generic not-found response; no stale content is returned. |

#### Forbidden outcomes

- Lookup returns another question from the same exam or trusts client preview content.
- Item endpoint skips current eligibility/capability checks.

#### Cleanup and evidence

- No persisted cleanup for adapter characterization.
- Required evidence: E3 from `npm run test:question-bank`.
- Invariants: `INV-ID-001`, `INV-SOURCE-001`, `INV-AUTH-002`.

### QBANK-010 — Archived source or taxonomy cannot remain available for future reuse

| Field | Value |
| --- | --- |
| Chunk | F — Reusable questions |
| Priority | P0 |
| Coverage | PERSISTENCE, BOUNDARY, IMMUTABILITY, INTEGRATION |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Draft — archived curriculum-node eligibility needs implementation verification |
| Created | 2026-07-19 |

#### Purpose and protected risk

Remove retired sources from future composition while preserving stable IDs, review history, and any already-created course/assignment snapshots.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Archive eligible source exam. | Its questions disappear from search/lookup; source rows and history remain. |
| 2 | Archive the primary curriculum leaf after reference policy permits. | Linked questions become ineligible for future Question Bank retrieval until reclassified to an active path. |
| 3 | Inspect an existing downstream immutable snapshot in a later course/assignment case. | Historical delivery remains unchanged; only future selection eligibility changes. |

#### Forbidden outcomes

- Archival hard-deletes questions, classification links, or historical snapshots.
- Archived taxonomy remains silently selectable for new courses.

#### Cleanup and evidence

- Record `BLOCKED` for the taxonomy half until its eligibility contract is implemented; roll back source archival fixtures.
- Minimum evidence: E3 source/taxonomy eligibility plus future course snapshot assertion.
- Related future cases: Chunk G composition and Chunk H assignment lifecycle.
- Invariants: `INV-LIFE-001`, `INV-SOURCE-001`, `INV-HISTORY-001`.

## Phase 5 execution note

Existing automation characterizes adapter normalization, classification persistence, authorization wiring, eligibility predicates, filter shape, and item lookup. Live capability/RLS and multi-row filter/pagination evidence remains pending. `QBANK-010` deliberately exposes the archived-taxonomy eligibility gap rather than treating current behavior as accepted.
