# Kelp acceptance test reference

## Document control

| Field | Value |
| --- | --- |
| Purpose | Define Kelp's central behavioral, security, persistence, and interaction tests in one durable reference. |
| Created | 2026-07-19 |
| Current stage | Phase 8.4 — first guarded local Supabase run completed |
| Canonical location | `tests/acceptance/TEST_REFERENCE.md` |
| Coverage map | `tests/acceptance/COVERAGE_MAP.md` |
| Execution record | `tests/acceptance/TEST_RUN_LOG.md` |
| Case template | `tests/acceptance/TEST_CASE_TEMPLATE.md` |

### Revision history

| Date | Revision | Summary |
| --- | --- | --- |
| 2026-07-19 | 0.1 | Established the reference structure, standard actors, scales, case rules, and chunk registry. |
| 2026-07-19 | 0.2 | Assigned stable invariant IDs and added chunk-to-implementation coverage traceability. |
| 2026-07-19 | 0.3 | Added detailed Chunk A and B cases plus the standard synthetic authorization actor fixture. |
| 2026-07-19 | 0.4 | Added detailed form and exam lifecycle cases, shared publication cases, and the content-lifecycle fixture manifest. |
| 2026-07-19 | 0.5 | Added detailed curriculum governance and reusable-question/Question Bank cases plus their symbolic fixture manifest. |
| 2026-07-19 | 0.6 | Added detailed Course Builder composition cases and an easiest-to-hardest symbolic course fixture. |
| 2026-07-19 | 0.7 | Added detailed scheduling, immutable assignment, student practice, attempt, and grading cases plus their cross-feature fixture. |
| 2026-07-19 | 0.8 | Audited all 93 cases, fixtures, invariants, links, commands, and run-log claims; corrected six automation labels from automated to partial. |
| 2026-07-19 | 0.9 | Audited the complete migration chain, hardened sign-up/bootstrap and student delivery, and recorded deterministic actor provisioning as the remaining database-execution blocker. |
| 2026-07-19 | 1.0 | Added deterministic local Auth identities, guarded reset/provision/test orchestration, explicit SQL actor requirements, and the first local Supabase execution runbook. |
| 2026-07-19 | 1.1 | Completed the first guarded local reset, provisioned eight synthetic actors, passed five rollback characterizations, and added a post-run residue audit. |

## 1. Purpose

This reference defines what must be tested when Kelp's central behavior changes. It is intended to:

- make cross-feature testing repeatable;
- prevent important interactions from relying on memory;
- preserve security and data-lifecycle expectations during refactoring;
- provide a stable scale for comparing test coverage and results;
- connect manual testing to future automation;
- identify deliberately missing behavior without mistaking it for a regression;
- make relationships, ownership, authorization, and persistence testable as separate concepts.

This is a behavioral specification. It should describe the accepted outcome, not merely the application's current output.

## 2. Scope

The catalog covers browser behavior, server RPCs, row-level security, persistence, immutable snapshots, role/capability boundaries, explicit account relationships, content lifecycles, and cross-feature journeys.

It does not contain production credentials, real student records, performance secrets, or an exhaustive unit test for every helper function. Low-level implementation tests may be linked from a catalog case when they support the same behavioral promise.

## 3. How the catalog works

Each accepted behavior receives a stable test ID. The reference holds the canonical purpose, setup, actions, expected outcomes, forbidden outcomes, and cleanup. `TEST_RUN_LOG.md` records what happened during a particular execution.

A case may begin as manual, become an automation candidate, and later receive an executable implementation. Its test ID and behavioral meaning remain stable throughout that progression.

Changes should follow this sequence:

1. Identify affected chunks and invariants.
2. Add or revise the relevant catalog cases.
3. Implement the product change.
4. Execute the selected cases.
5. Record results and evidence.
6. Promote repeatable, high-value cases to automation when worthwhile.

## 4. Folder structure

```text
tests/acceptance/
├── README.md                 Folder purpose and working method
├── TEST_REFERENCE.md        Canonical behaviors and cases
├── COVERAGE_MAP.md           Current implementation, automation, and gap traceability
├── TEST_RUN_LOG.md          Append-only execution records
├── TEST_CASE_TEMPLATE.md    Required case structure
├── PRE_DATABASE_AUDIT.md    Phase 8.1 acceptance-system integrity audit
├── MIGRATION_SECURITY_AUDIT.md Phase 8.2 migration/security source audit
├── LOCAL_SUPABASE_READINESS.md Phase 8.3 execution-package checkpoint
├── LOCAL_SUPABASE_EXECUTION_RUNBOOK.md Guarded local execution sequence
├── catalog/                 Detailed cases organized by chunk
├── fixtures/                Synthetic deterministic inputs
├── automation/              Executable cases retaining catalog IDs
└── evidence/                Local screenshots, logs, and reports
```

When the reference becomes difficult to navigate, chunks may move into `tests/acceptance/catalog/`. Their test IDs, titles, and history must not change merely because the files are split.

## 5. Standard actors

Actor aliases are documentation identities, not usernames or database UUIDs. A test environment maps them to synthetic accounts.

| Alias | Active roles | Intended use |
| --- | --- | --- |
| `ACT-STUDENT` | student | Student-only workspace, delivery, submissions, and unauthorized-boundary checks. |
| `ACT-TUTOR` | tutor | Regular tutor authoring; requires independent review before publication. |
| `ACT-TEACHER` | teacher | Teacher compatibility where operational behavior matches a tutor but the role remains distinct. |
| `ACT-MENTOR` | mentor | Trusted reviewer, taxonomy proposer, course composer, and course assigner. |
| `ACT-ADMIN` | admin | Trusted administrator, taxonomy/authorization manager, and bootstrap verification actor. |
| `ACT-STUDENT-TUTOR` | student + tutor | Cumulative capability and workspace-switching checks. |
| `ACT-TUTOR-MENTOR` | tutor + mentor | Trusted author/reviewer boundaries and future supervision checks. |
| `ACT-OUTSIDER` | student or minimally privileged account | Authenticated but unrelated/unauthorized access checks. |

Rules:

- Holding several roles does not create relationships between accounts.
- A tutor role does not imply access to every student.
- A mentor role does not imply supervision of every tutor.
- The first administrator must be bootstrapped through a trusted migration or service-role path, never public sign-up.
- Tests must state which role is the primary workspace role when navigation matters.

## 6. Test identifiers

Use a semantic prefix followed by a three-digit, never-reused number.

| Prefix | Domain |
| --- | --- |
| `AUTH-###` | Identity, roles, capabilities, and administrator bootstrap |
| `WORK-###` | Dashboards and workspace switching |
| `REL-###` | Tutor–mentor–student relationships |
| `FORM-###` | Form authoring, routing, delivery, and submissions |
| `EXAM-###` | Exam authoring, delivery, grading, and results |
| `PUB-###` | Review, approval, publication, and audit history |
| `CURR-###` | Curriculum taxonomy and governance |
| `QBANK-###` | Question classification and reusable question retrieval |
| `COURSE-###` | Course composition and source-question behavior |
| `SCHED-###` | Schedule creation, persistence, and synchronization |
| `ASSIGN-###` | Assignment snapshots, practice, attempts, and grading |
| `DATA-###` | Copying, persistence, archive, deletion, and historical integrity |
| `CROSS-###` | Cross-feature journeys and system-wide regressions |
| `UI-###` | Shared presentation, responsive behavior, and accessibility |

Do not encode priority or execution order in the ID. Do not renumber cases when inserting another case.

## 7. Standardized scales

### 7.1 Priority

| Value | Meaning |
| --- | --- |
| `P0` | Security, privacy, authorization, answer-key exposure, or irreversible historical-data integrity. Release-blocking. |
| `P1` | Central user journey or persistence behavior. A failure prevents meaningful use of the feature. |
| `P2` | Important boundary, recovery path, compatibility behavior, or non-central workflow. |
| `P3` | Presentation, convenience, or low-risk refinement that does not corrupt or expose data. |

Priority describes impact, not how easy the test is to automate.

### 7.2 Execution result

| Value | Meaning |
| --- | --- |
| `NOT_RUN` | The case exists but was not executed in this run. |
| `PASS` | Every required outcome and forbidden-outcome check passed. |
| `FAIL` | At least one required or forbidden outcome was violated. |
| `BLOCKED` | A documented environmental or dependency issue prevented a meaningful result. |
| `NOT_APPLICABLE` | The case legitimately does not apply to the tested configuration; a reason is mandatory. |

There is no `PARTIAL PASS`. Record `FAIL` when a required assertion fails, or split an overly broad case during catalog maintenance.

### 7.3 Automation status

| Value | Meaning |
| --- | --- |
| `MANUAL` | Deliberately performed by a person. |
| `CANDIDATE` | Repeatable and valuable enough to automate, but no reliable runner exists yet. |
| `PARTIAL` | Some assertions are automated; remaining assertions are explicitly listed. |
| `AUTOMATED` | The full required behavior is executed and asserted by a linked runner. |

### 7.4 Coverage types

A case may have several tags:

- `NORMAL`: successful central path.
- `BOUNDARY`: limits, empty states, invalid transitions, or edge conditions.
- `AUTHN`: authentication behavior.
- `AUTHZ`: roles, capabilities, ownership, relationships, or RLS.
- `PERSISTENCE`: save, reload, history, copying, archive, or deletion.
- `IMMUTABILITY`: a historical snapshot must not change.
- `RECOVERY`: retry, interruption, stale state, or safe failure.
- `INTEGRATION`: behavior spanning several domains or pages.
- `UI`: presentation, responsive layout, or interaction behavior.
- `ACCESSIBILITY`: keyboard, semantics, focus, labels, or readable feedback.

### 7.5 Evidence strength

| Value | Meaning |
| --- | --- |
| `E0` | No retained evidence; observation only. Acceptable only for low-risk exploratory runs. |
| `E1` | Written observation with environment and reproduction details. |
| `E2` | Screenshot, console log, network/RPC output, or deterministic exported artifact. |
| `E3` | Automated assertion or database characterization proving the expected and forbidden outcomes. |

Evidence strength does not replace the execution result. P0 cases should normally reach E3 for their server-side boundary.

## 8. Environment labels

| Label | Meaning |
| --- | --- |
| `LOCAL-STATIC` | Locally served frontend using local/browser providers without live Supabase assertions. |
| `LOCAL-SUPABASE` | Disposable local Supabase with migrations applied and synthetic accounts. |
| `STAGING` | Hosted non-production environment with synthetic test data. |
| `PRODUCTION-OBSERVE` | Read-only observation explicitly approved for a production-safe check. Never use destructive fixtures. |

The run log must record the environment, source revision, migration state, browser/runtime, and whether the database was reset.

## 9. Case-writing requirements

Every catalog case must include:

- stable ID and title;
- purpose and protected risk;
- priority, coverage tags, and automation status;
- environment and dependencies;
- actors, roles, capabilities, and relationships;
- fixtures and preconditions;
- numbered actions;
- expected UI/client result when applicable;
- expected RPC/database result when applicable;
- forbidden outcome;
- cleanup;
- evidence expectations;
- related migrations, pages, adapters, and automated checks;
- revision note when its accepted meaning changes.

Use one case for one coherent behavioral promise. Large journeys may reference smaller cases instead of repeating all of their assertions.

## 10. System-wide invariants

Invariant IDs are permanent traceability keys. Detailed cases may protect one invariant from several domain-specific angles.

| ID | Invariant | Primary chunks | Minimum evidence target |
| --- | --- | --- | --- |
| `INV-AUTH-001` | Roles are cumulative; the primary role selects navigation and never replaces the complete authorization union. | A, B | E3 for capability union; E2 for workspace behavior |
| `INV-AUTH-002` | Browser guards shape the interface, while server capabilities, ownership checks, and RLS enforce access. | A, J | E3 |
| `INV-REL-001` | Roles, relationships, ownership, assignments, and review responsibilities are distinct records with distinct effects. | A, C, H, I | E3 after relationship implementation |
| `INV-SCOPE-001` | A user sees and mutates only resources allowed by their capabilities, ownership, active relationships, and explicit assignments. | C, D, E, G, H, I | E3 |
| `INV-OWN-001` | Authoritative ownership, actor identity, timestamps, and privileged lifecycle fields are derived by the server rather than trusted from client payloads. | D, E, G, H, I | E3 |
| `INV-PUB-001` | Tutors and teachers require independent mentor/admin approval before publication; a reviewer cannot approve their own submitted immutable copy. | D, E, J | E3 |
| `INV-DELIVERY-001` | Public/catalog eligibility never grants students access to answer-bearing author, reviewer, grading, or question-bank records. | E, F, H, J | E3 |
| `INV-ID-001` | Duplication and import-as-copy create new resource and nested-item identities while retaining non-authorizing provenance. | D, E, G, I | E3 for IDs; E2 for UI |
| `INV-LIFE-001` | Archive precedes hard deletion wherever history, references, or recovery expectations make immediate deletion unsafe. | D, E, G, H, I | E3 |
| `INV-HISTORY-001` | Submitted responses, attempts, review decisions, publication events, and assignment snapshots are immutable historical records. | D, E, H, I, J | E3 |
| `INV-SOURCE-001` | Editing, archiving, deleting, or reclassifying a source cannot silently rewrite historical deliveries, submissions, attempts, or grades. | D, E, G, H, I | E3 |
| `INV-REL-002` | Ending or changing a relationship removes unauthorized future interaction without rewriting legitimate historical records. | C, H, I, J | E3 after relationship implementation |
| `INV-ORDER-001` | Student-visible numbering and ordered learning sequences remain contiguous and intentional even when internal IDs, conditional routes, or difficulty ordering differ. | D, E, F, G, H | E2/E3 |
| `INV-RETRY-001` | Retrying an interrupted write cannot create unintended duplicates or mutate an already final record. | D, E, H, I | E3 |
| `INV-TEST-001` | Tests use deterministic synthetic identities and data and do not depend on production credentials, personal information, or accidental database ordering. | All | E3 for automated setup; E1 for manual setup |

[`COVERAGE_MAP.md`](./COVERAGE_MAP.md) identifies the current implementation and evidence supporting each invariant. A linked test script is available coverage, not proof of a formal run; execution results belong in `TEST_RUN_LOG.md`.

## 11. Chunk registry

Phase 1 establishes these chunks and their intended coverage. Detailed cases are added in later phases using `TEST_CASE_TEMPLATE.md`.

### Chunk A — Identity and authorization

Purpose: authentication, cumulative roles, capabilities, trusted administrator bootstrap, and server enforcement.

Detailed catalog: [`CHUNK-A-IDENTITY-AUTHORIZATION.md`](./catalog/CHUNK-A-IDENTITY-AUTHORIZATION.md), containing `AUTH-001` through `AUTH-010`.

Tests to be developed:

- sign-up begins with the student role and cannot self-promote;
- role grants/revocations and primary-role selection;
- cumulative capability unions for multi-role accounts;
- browser guard versus RPC/RLS enforcement;
- trusted first-administrator bootstrap;
- unauthorized and anonymous access boundaries.

### Chunk B — Workspaces and multi-role navigation

Purpose: dashboards, primary workspace selection, role-specific destinations, and shared tools.

Detailed catalog: [`CHUNK-B-WORKSPACES.md`](./catalog/CHUNK-B-WORKSPACES.md), containing `WORK-001` through `WORK-009`.

Tests to be developed:

- correct initial dashboard for each primary role;
- switching only among actively held roles;
- primary-role persistence after reload/login;
- mentor/admin separation from tutor workspace unless separately assigned;
- shared Course Builder availability for mentor and administrator;
- student+tutor and tutor+mentor navigation behavior.

### Chunk C — Tutor–mentor–student relationships

Purpose: future scoped interaction links without confusing them with roles.

Tests to be developed:

- creating, accepting, suspending, transferring, and ending links;
- multiple students per tutor and permitted multiple tutors per student;
- mentor supervision of tutors;
- visibility filtered by active relationships;
- multi-role users interacting in the correct relationship context;
- relationship termination preserving historical records;
- unrelated authenticated users being denied.

Current note: these relationship records and workflows are not implemented yet. Their future cases must begin as `BLOCKED` or `NOT_RUN`, not be treated as passing behavior.

### Chunk D — Form lifecycle

Purpose: form authoring, conditional routing, import/copy, review, publication, respondent delivery, and immutable submissions.

Detailed catalogs: [`CHUNK-D-FORM-LIFECYCLE.md`](./catalog/CHUNK-D-FORM-LIFECYCLE.md), containing `FORM-001` through `FORM-009`, and [`SHARED-CONTENT-PUBLICATION.md`](./catalog/SHARED-CONTENT-PUBLICATION.md), containing the shared `PUB-001` through `PUB-006` rules.

Tests to be developed:

- comprehensive question and phase coverage;
- conditional question/phase routes and visible numbering;
- respondent details and validation;
- export/import as an independent copy;
- tutor review requirement and privileged publication;
- answer persistence and immutable submissions;
- archive/delete effects on historical responses.

### Chunk E — Exam lifecycle

Purpose: exam authoring, classification, media/graph behavior, delivery, grading, results, review, and publication.

Detailed catalogs: [`CHUNK-E-EXAM-LIFECYCLE.md`](./catalog/CHUNK-E-EXAM-LIFECYCLE.md), containing `EXAM-001` through `EXAM-010`, and [`SHARED-CONTENT-PUBLICATION.md`](./catalog/SHARED-CONTENT-PUBLICATION.md), containing the shared `PUB-001` through `PUB-006` rules.

Tests to be developed:

- comprehensive question and media types;
- stable question identities and classifications;
- live preview, student view, PDF, and JSON round trips;
- automatic versus tutor-reviewed grading;
- tutor review requirement and privileged publication;
- immutable result/grading basis;
- archive/delete and duplication behavior.

### Chunk F — Curriculum and reusable questions

Purpose: canonical taxonomy governance, question classification, and trusted question-bank retrieval.

Detailed catalogs: [`CHUNK-F-CURRICULUM-GOVERNANCE.md`](./catalog/CHUNK-F-CURRICULUM-GOVERNANCE.md), containing `CURR-001` through `CURR-009`, and [`CHUNK-F-QUESTION-BANK.md`](./catalog/CHUNK-F-QUESTION-BANK.md), containing `QBANK-001` through `QBANK-010`.

Tests to be developed:

- mentor proposals and administrator decisions;
- arbitrary topic depth and stable node identities;
- active/archived taxonomy behavior;
- required difficulty, type tags, and curriculum paths;
- only approved, reviewed, public questions entering the bank;
- filters, descendants, pagination, and easiest-to-hardest ordering;
- no student access to answer-bearing bank payloads.

### Chunk G — Course composition

Purpose: assembling approved question references into reusable, owner-scoped course drafts.

Detailed catalog: [`CHUNK-G-COURSE-COMPOSITION.md`](./catalog/CHUNK-G-COURSE-COMPOSITION.md), containing `COURSE-001` through `COURSE-010`.

Tests to be developed:

- curriculum path selection and descendant validation;
- question selection, removal, and difficulty ordering;
- source eligibility revalidation on save;
- open/edit versus duplicate/new identity;
- archive/delete without deleting source questions;
- source-question lifecycle effects before and after assignment.

### Chunk H — Scheduling, assignment, and practice

Purpose: schedule persistence/sync, immutable delivery, student practice, attempts, and grading.

Detailed catalogs: [`CHUNK-H-SCHEDULING.md`](./catalog/CHUNK-H-SCHEDULING.md), containing `SCHED-001` through `SCHED-007`, and [`CHUNK-H-ASSIGNMENT-PRACTICE.md`](./catalog/CHUNK-H-ASSIGNMENT-PRACTICE.md), containing `ASSIGN-001` through `ASSIGN-013`.

Tests to be developed:

- deterministic schedule/session identity and timezone validation;
- assignment only to an eligible student/session;
- relationship-scoped student selection once relationships exist;
- private grading snapshot versus answer-free delivery snapshot;
- progress save/resume and immutable submission;
- automatic scoring and pending written review;
- repeat attempts, cancellation, and source deletion survival.

### Chunk I — Persistence and content lifecycle

Purpose: system-wide identity, copying, ownership, storage, retrieval, archive, deletion, and historical integrity.

Tests to be developed:

- create/save/retrieve/edit identity continuity;
- copy identity and provenance;
- owner-scoped visibility;
- archive-before-delete rules;
- referenced-source deletion behavior;
- immutable historical records;
- safe retry and idempotency boundaries;
- local-to-backend adapter parity where promised.

### Chunk J — Cross-feature journeys and shared quality

Purpose: central workflows that span several chunks and shared UI/accessibility expectations.

Tests to be developed:

- tutor creates classified content, mentor approves it, mentor builds a course, and student practices it;
- multi-role workspace switching without capability loss or overgrant;
- relationship changes affecting future visibility but not history;
- database reset/migration/bootstrap readiness;
- responsive central actions and modal behavior;
- keyboard/focus, status feedback, and accessible labels;
- regression selection based on changed relationships or persistence contracts.

## 12. Catalog growth and automation

Automation must consume or cite the same stable case ID. It should not create a second, competing definition of expected behavior.

Good early automation candidates are deterministic P0/P1 cases involving:

- capability and RLS denial;
- answer-key stripping;
- immutable snapshot survival;
- duplication identities;
- route calculations;
- ordering and classification gates;
- transactional save/retrieve behavior.

Visual quality, usability, and exploratory interaction may remain manual or partially automated when human judgment is still meaningful.

## 13. Open Phase 1 decisions

The following choices should be revisited when detailed cases begin:

- whether relationship links require invitation/acceptance or may be created administratively;
- whether a student can have several active tutors for different subjects;
- whether mentors supervise tutors globally, by subject, or by organization;
- whether test evidence should ever be sanitized and committed, or remain local by default;
- when the catalog should be split into one file per chunk.

These questions do not block the foundation. They prevent future cases from silently assuming a relationship policy that has not been designed.
