# Chunk D — Form lifecycle

## Purpose

These cases protect form identity, authoring, conditional routing, respondent data, immutable submissions, retry behavior, submission policy, printing, and source-definition lifecycle. Shared review/publication behavior is defined in [`SHARED-CONTENT-PUBLICATION.md`](./SHARED-CONTENT-PUBLICATION.md).

## Shared setup

- Use actors and resources from [`content-lifecycle-standard-scenarios-v1.json`](../fixtures/content-lifecycle-standard-scenarios-v1.json).
- Use [`comprehensive-five-phase-template.json`](../../../src/app/form-builder/test-fixtures/comprehensive-five-phase-template.json) and [`routing-cases.json`](../../../src/app/form-builder/test-fixtures/routing-cases.json) without modifying their canonical files.
- Browser-only cases may use `LOCAL-STATIC`; ownership, submissions, and lifecycle cases require `LOCAL-SUPABASE`.

## Cases

### FORM-001 — Importing a form creates an independent copy with valid internal references

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P0 |
| Coverage | NORMAL, PERSISTENCE, INTEGRATION |
| Automation | AUTOMATED |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent imported forms from overwriting the source identity or breaking phase, question, option, and trigger references when IDs are regenerated.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Import `FORM-COMPREHENSIVE` as a copy. | New form ID is created; transport metadata is excluded from editable state. |
| 2 | Compare every source block, option, and trigger. | Every nested identity is new and unique; labels/settings remain equivalent. |
| 3 | Resolve all trigger sources, questions, options, and targets. | References point to the corresponding cloned identities and remain valid. |
| 4 | Run the documented conditional answers. | Copied form produces the same reachable routes as the source. |

#### Forbidden outcomes

- Source and copy share form/block/option/trigger IDs.
- Provenance or imported ownership authorizes access to the original.

#### Cleanup and evidence

- Discard the browser copy or delete its synthetic local-library record.
- Required evidence: E3 from `npm run test:form-builder`.
- Invariants: `INV-ID-001`, `INV-ORDER-001`, `INV-TEST-001`.

### FORM-002 — Owner save, retrieve, and edit preserve one draft identity

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P1 |
| Coverage | NORMAL, AUTHZ, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prove an author can continue editing the same active private draft while another author cannot read or overwrite it through owner-scoped operations.

#### Actors and preconditions

- Owner: `ACT-TUTOR`; outsider: `ACT-OUTSIDER`.
- `FORM-TUTOR-DRAFT` has no submissions and remains active/private/draft.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Owner saves imported copy. | Saved record appears in My forms. | Server derives owner/timestamps/private draft state; definition and schema IDs agree. |
| 2 | Owner reloads, edits title/question, and saves. | Same draft opens with changes. | Same form ID/created time; updated time advances; nested IDs not replaced unnecessarily. |
| 3 | Outsider lists/loads/saves the ID. | Form is absent or access fails. | RLS/RPC rejects read/write; owner and content remain unchanged. |

#### Forbidden outcomes

- Client-supplied owner, visibility, review state, or timestamps become authoritative.
- Ordinary edit silently creates a new form or rewrites every question ID.

#### Cleanup and evidence

- Archive/delete the synthetic draft if it has no history, or reset the disposable database.
- Minimum evidence: E3 for ownership and identity; E2 for retrieval UI.
- Related checks: `npm run test:form-supabase`, `npm run test:adapters`.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-ID-001`, `INV-SCOPE-001`.

### FORM-003 — Conditional routes remain deterministic and student numbering remains contiguous

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P1 |
| Coverage | NORMAL, BOUNDARY, INTEGRATION, UI |
| Automation | AUTOMATED |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Protect question/phase triggers, skipped-phase resumption, reachable paths, and respondent-facing numbering when internal block positions differ.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Execute every `FORM-ROUTING` scenario. | Expected page IDs and precedence rules match the fixture. |
| 2 | Exercise all four comprehensive-template routes. | Conditional jumps and FIFO normal-phase resumption match the documented sequences. |
| 3 | Observe question progress on a route with noncontiguous internal positions. | Visible labels remain Question 1, 2, 3… for the route actually shown. |
| 4 | Submit a conditional route. | Snapshot contains visited pages/questions only; unvisited-branch answers are excluded. |

#### Forbidden outcomes

- Internal indexes or IDs leak into visible numbering.
- A later/invalid target wins over the earliest eligible later phase.
- Hidden branch answers enter the immutable record.

#### Cleanup and evidence

- Cleanup: reset browser answers.
- Required evidence: E3 from `npm run test:form-builder`.
- Invariants: `INV-ORDER-001`, `INV-HISTORY-001`.

### FORM-004 — Respondent details enforce location and required-field dependencies

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P1 |
| Coverage | NORMAL, BOUNDARY, UI, ACCESSIBILITY |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure tutors request coherent respondent data and students receive valid dependent country/state/city controls and required-field feedback.

#### Actions and expected outcomes

| Step | Builder/respondent action | Expected result |
| --- | --- | --- |
| 1 | Collect country only. | Country is enabled independently; state/city remain absent. |
| 2 | Collect state. | Country is automatically collected; city remains optional/absent. |
| 3 | Collect city. | Country and state are automatically collected. |
| 4 | Mark city required, then state required. | Required cascades upward city→state→country and state→country, never downward. |
| 5 | Select country and state as respondent. | State options are filtered by country; city options are filtered by state; changing an ancestor clears invalid descendants. |
| 6 | Attempt Next with required details or privacy consent missing. | Focusable, readable validation prevents progression; consent aligns with its label. |

#### Forbidden outcomes

- State/city is submitted without its required ancestor context.
- A required child leaves an optional ancestor.
- Location controls accept stale incompatible values after an ancestor changes.

#### Cleanup and evidence

- Reset respondent-detail settings and answers.
- Minimum evidence: E2 for UI/validation and E3 for dependency normalization.
- Related check: `npm run test:form-builder`.
- Invariants: `INV-ORDER-001`, `INV-TEST-001`.

### FORM-005 — Submission is server-owned, immutable, and idempotent on retry

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, IMMUTABILITY, RECOVERY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent client spoofing, duplicate responses after uncertain network failure, and mutation/deletion of a final response.

#### Actors and preconditions

- Respondent: `RESPONDENT-ONE`.
- Active saved form accepting submissions.
- One valid immutable client record with a stable submission ID.

#### Actions and expected outcomes

| Step | Action | Expected client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Submit while spoofing timestamp, owner, respondent, and policy fields. | One success is reported. | Server derives respondent/owner/timestamp/current policy and stores the validated snapshot/data/metadata. |
| 2 | Retry the identical submission ID after simulating a lost response. | Same successful record returns. | No duplicate row/event is created. |
| 3 | Reuse that ID for a different form. | Clear failure. | Existing record remains unchanged. |
| 4 | Attempt update/delete of the stored submission. | Operation fails. | Immutability trigger preserves the row. |

#### Forbidden outcomes

- Client identity, owner, timestamp, or policy overrides server values.
- Retry creates two submissions or two final UI events.

#### Cleanup and evidence

- Immutable row remains until transaction rollback/database reset.
- Minimum evidence: E3 from RPC/table assertions; E2 for retry feedback.
- Related checks: `npm run test:form-builder`, `npm run test:form-supabase`.
- Invariants: `INV-OWN-001`, `INV-HISTORY-001`, `INV-RETRY-001`.

### FORM-006 — Single and multiple submission policies are enforced by the server

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P0 |
| Coverage | BOUNDARY, AUTHZ, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent browser changes from bypassing the tutor's saved one-response or repeated-response policy.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | `RESPONDENT-ONE` submits a saved `single` form. | First distinct submission succeeds. |
| 2 | Same respondent sends another ID while claiming `multiple`. | Server rejects the second response; saved policy remains single. |
| 3 | Two different respondents submit the single form. | One response per respondent succeeds. |
| 4 | Save a separate `multiple` form and submit two distinct IDs from one respondent. | Both succeed and retain independent immutable records. |
| 5 | Retry either existing ID. | Original record returns idempotently rather than counting as another response. |

#### Forbidden outcomes

- Client metadata changes the authoritative policy.
- Single-policy uniqueness is global across different respondents.

#### Cleanup and evidence

- Roll back/reset synthetic submissions.
- Minimum evidence: E3 for partial unique index/RPC behavior.
- Invariants: `INV-OWN-001`, `INV-RETRY-001`, `INV-HISTORY-001`.

### FORM-007 — Submission history survives archive and hard deletion of its source form

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P0 |
| Coverage | PERSISTENCE, IMMUTABILITY, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Protect historical responses and their rendering basis when the editable source form is no longer retained.

#### Preconditions

Private draft form with one immutable submission; snapshot is sufficient to render the visited route.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Attempt to overwrite form content after submission. | Save fails and directs author to open as a copy. |
| 2 | Archive the unchanged eligible private draft. | Form stops accepting submissions; archived definition remains readable to owner as permitted. |
| 3 | Hard-delete the archived private draft. | Definition is removed without cascading to submissions. |
| 4 | Retrieve/render the prior response through the trusted owner-facing read path. | Form ID/owner metadata, answers, route, question snapshot, and submitted time remain unchanged. |

#### Forbidden outcomes

- Hard deletion erases or rewrites submission rows.
- Archived/deleted form accepts a new submission.

#### Cleanup and evidence

- Submission remains until rollback/reset; do not mutate it for cleanup.
- Minimum evidence: E3 for independent row survival and E2 for historical rendering when the read UI exists.
- Invariants: `INV-LIFE-001`, `INV-HISTORY-001`, `INV-SOURCE-001`.

### FORM-008 — Printable routes and per-question answer spaces remain intentional

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P2 |
| Coverage | NORMAL, BOUNDARY, UI |
| Automation | PARTIAL |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure tutors can select one reachable path and produce a usable PDF without losing conditional order or written-response space settings.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Open Print/PDF for `FORM-COMPREHENSIVE`. | Every reachable route is listed with phases/questions in respondent order. |
| 2 | Change route and per-question answer space. | Selection does not unexpectedly scroll; short answers allow no/small block, long answers allow all supported sizes/custom distance. |
| 3 | Print each route. | Only selected path prints; margins are safe; question/phase content is not cut off; configured spaces are measurable. |
| 4 | Reopen settings. | Per-question choices remain associated with stable question IDs. |

#### Forbidden outcomes

- Hidden/unreachable questions print.
- Global defaults overwrite explicit per-question choices.
- Browser option selection jumps the modal scroll position.

#### Cleanup and evidence

- Restore fixture defaults and discard generated PDF after inspection unless sanitized evidence is required.
- Minimum evidence: E2 PDF/page render plus E3 route catalog assertions.
- Related check: `npm run test:form-builder`.
- Invariants: `INV-ORDER-001`, `INV-ID-001`.

### FORM-009 — Hosted submission failure remains recoverable and never reports a false save

| Field | Value |
| --- | --- |
| Chunk | D — Form lifecycle |
| Priority | P0 |
| Coverage | RECOVERY, PERSISTENCE, UI |
| Automation | AUTOMATED |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent lost answers and false success when the hosted backend provider is unavailable or a submission attempt fails.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Submit through HTTP(S) with unavailable/failing persistence provider. | Error state is shown; answers remain; `submitted=false`; no completion event fires. |
| 2 | Retry with provider restored using the same submission ID. | One save succeeds and one final completion event fires. |
| 3 | Run direct `file://` preview/local sandbox. | Local persistence is explicitly treated as preview behavior, not a successful hosted submission. |

#### Forbidden outcomes

- Failure clears answers, navigates to success, or generates a new retry ID.
- Hosted page silently falls back to local storage and claims server persistence.

#### Cleanup and evidence

- Clear local preview submission data.
- Required evidence: E3 from `npm run test:form-builder`.
- Invariants: `INV-RETRY-001`, `INV-HISTORY-001`.

## Phase 4 execution note

The Form cases are canonical. Existing characterization coverage fully automates `FORM-001`, `FORM-003`, and `FORM-009`; the remaining backend and visual assertions require the clean local Supabase run or a recorded manual execution.
