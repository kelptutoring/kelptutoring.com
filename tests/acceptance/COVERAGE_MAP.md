# Kelp acceptance coverage map

## Document control

| Field | Value |
| --- | --- |
| Purpose | Trace acceptance chunks and invariants to the implementation, migrations, fixtures, executable checks, and known gaps. |
| Created | 2026-07-19 |
| Current stage | Vertical Phase 3 — Student Classroom membership and Card lifecycle implemented and locally characterized |
| Canonical behavior | [`TEST_REFERENCE.md`](./TEST_REFERENCE.md) |
| Execution results | [`TEST_RUN_LOG.md`](./TEST_RUN_LOG.md) |

## 1. How to read this map

This map answers four questions before a regression or feature test begins:

1. Which chunks and invariants can the change affect?
2. Which pages, contracts, and database resources implement those behaviors?
3. Which existing checks and fixtures can be reused?
4. Which important behaviors still require design, live verification, or manual judgment?

The map records available coverage. It does not claim that a test passed today. Formal executions and their environments belong in `TEST_RUN_LOG.md`.

## 2. Status vocabulary

### Implementation status

| Value | Meaning |
| --- | --- |
| `IMPLEMENTED` | The current frontend and/or backend contract contains the mapped behavior. |
| `PARTIAL` | A meaningful portion exists, but at least one central boundary or workflow is missing. |
| `PROTOTYPE` | The behavior exists primarily in browser/local state and is not yet an authoritative backend workflow. |
| `PLANNED` | The behavior is documented or linked in navigation but its required domain is not implemented. |

### Verification state

| Value | Meaning |
| --- | --- |
| `STATIC_AVAILABLE` | A deterministic source/contract characterization exists. |
| `DB_AVAILABLE` | A rollback-style SQL characterization exists for local Supabase. |
| `LIVE_PARTIAL` | At least one mapped RPC/RLS boundary passed in a formal local Supabase run, but the chunk still has unexecuted live cases. |
| `LIVE_PENDING` | The migrated local/hosted RPC, RLS, or authenticated browser flow still needs a recorded acceptance run. |
| `MANUAL_PENDING` | A user-facing or visual workflow still needs a recorded manual run. |
| `DESIGN_PENDING` | Expected behavior must be decided before a meaningful pass/fail case can be finalized. |

## 3. Chunk overview

| Chunk | Area | Implementation | Available verification | Primary unresolved boundary |
| --- | --- | --- | --- | --- |
| A | Identity and authorization | IMPLEMENTED | STATIC_AVAILABLE, LIVE_PENDING | Fresh migration replay and trusted first-admin bootstrap verification |
| B | Workspaces and multi-role navigation | IMPLEMENTED | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL, MANUAL_PENDING | Phase 2.B passed locally; broader multi-role browser journeys remain pending |
| C | Tutor–mentor–student relationships | PARTIAL | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL | Phase 2.A foundation is live locally; later lifecycle, Guardian, availability, and scheduling integrations remain pending |
| D | Form lifecycle | PARTIAL | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL, MANUAL_PENDING | Student assignment/profile distribution is absent |
| E | Exam lifecycle | PARTIAL | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL, MANUAL_PENDING | Student assignment and authoritative delivery are absent |
| F | Curriculum and reusable questions | IMPLEMENTED | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL | Broader authenticated browser/API governance journeys remain pending |
| G | Course composition | IMPLEMENTED | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL, MANUAL_PENDING | Full authenticated authoring UI run against reset data |
| H | Scheduling, assignment, and practice | PARTIAL | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL, MANUAL_PENDING | Calendar events, lesson requests, recurrence, and written-review UI remain absent |
| I | Persistence and content lifecycle | PARTIAL | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL | Cross-domain lifecycle and retry catalog cases are not yet consolidated |
| J | Cross-feature journeys and shared quality | PARTIAL | STATIC_AVAILABLE, MANUAL_PENDING | No automated author→review→compose→assign→practice journey |
| K | Student Profile and Configuration | IMPLEMENTED | STATIC_AVAILABLE, DB_AVAILABLE, LIVE_PARTIAL | Production global location-catalog population and relationship-derived learning statistics |

## 4. Chunk A — Identity and authorization

Detailed cases: [`AUTH-001` through `AUTH-010`](./catalog/CHUNK-A-IDENTITY-AUTHORIZATION.md).

Standard actors: [`authorization-standard-actors-v1.json`](./fixtures/authorization-standard-actors-v1.json).

### Protected invariants

`INV-AUTH-001`, `INV-AUTH-002`, `INV-REL-001`, `INV-SCOPE-001`, `INV-OWN-001`, `INV-TEST-001`

### Current implementation

- Browser authorization: [`auth-guard.js`](../../src/auth/auth-guard.js), [`authorization.js`](../../src/auth/authorization.js), and [`workspaces.js`](../../src/auth/workspaces.js).
- Sign-in/sign-up surfaces: [`login.js`](../../src/auth/login.js) and [`signUp.js`](../../src/auth/signUp.js).
- Multi-role tables, capabilities, primary role, administrative RPCs, audit events, RLS, and compatibility behavior: [`202607180003_multi_role_authorization.sql`](../../supabase/migrations/202607180003_multi_role_authorization.sql).
- Initial profile/auth trigger foundation: [`202607160001_profiles.sql`](../../supabase/migrations/202607160001_profiles.sql).
- Developer contract: [`AUTHORIZATION.md`](../../src/auth/AUTHORIZATION.md).
- Deterministic local identities and guarded execution: [`local-supabase-actor-map-v1.json`](./fixtures/local-supabase-actor-map-v1.json), [`local-supabase-acceptance.mjs`](../../tools/local-supabase-acceptance.mjs), and [`LOCAL_SUPABASE_EXECUTION_RUNBOOK.md`](./LOCAL_SUPABASE_EXECUTION_RUNBOOK.md).

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:authorization` | Role preservation, cumulative capabilities, compatibility fallback, sign-up hardening, and migration contract. |
| `npm run test:supabase-acceptance` | Actor-map alignment, local-only safety gates, explicit SQL actors, package commands, and execution-runbook contract. |
| `npm run test:dashboards` | Workspace role boundaries and routing integration. |
| [`content-publication-db-self-test.sql`](../../tools/content-publication-db-self-test.sql) | Authenticated role simulation for protected publication RPCs. |

### Known gaps and live checks

- Execute the prepared guarded migration replay against clean disposable local Supabase and record the formal run.
- Bootstrap the prepared `ACT-ADMIN` through the service-role-only RPC and prove public sign-up cannot create an administrator.
- Exercise `get_my_authorization`, role grants/revocations, and `set_my_primary_role` with real authenticated sessions.
- Prove direct-table access and unauthorized RPC calls fail under live RLS/grants.
- Role-management and credential-review user interfaces remain planned.

## 5. Chunk B — Workspaces and multi-role navigation

Detailed cases: [`WORK-001` through `WORK-009`](./catalog/CHUNK-B-WORKSPACES.md).

Standard actors: [`authorization-standard-actors-v1.json`](./fixtures/authorization-standard-actors-v1.json).

### Protected invariants

`INV-AUTH-001`, `INV-AUTH-002`, `INV-SCOPE-001`

### Current implementation

- Dashboards: [`student-dashboard.html`](../../src/app/dashboard/student-dashboard.html), [`tutor-dashboard.html`](../../src/app/dashboard/tutor-dashboard.html), [`mentor-dashboard.html`](../../src/app/dashboard/mentor-dashboard.html), and [`admin-dashboard.html`](../../src/app/dashboard/admin-dashboard.html).
- Shared switching: [`workspace-switcher.js`](../../src/app/dashboard/workspace-switcher.js).
- Route catalog: [`workspaces.js`](../../src/auth/workspaces.js).
- Workspace contract: [`dashboard/README.md`](../../src/app/dashboard/README.md).
- Phase 2.B Student Dashboard preference/read-model authority: [`202607200005_student_dashboard_foundation.sql`](../../supabase/migrations/202607200005_student_dashboard_foundation.sql), refined by [`202607200006_student_dashboard_refinements.sql`](../../supabase/migrations/202607200006_student_dashboard_refinements.sql) for synchronized collapsed blocks.
- Phase 2.C responsive shell: normal-flow grouped top navigation, Credits wallet and other fixed regions outside the two-block reorderable grid, narrow-phone header wrapping, Calendar-contained horizontal scrolling, silent successful preference changes, non-shifting failure feedback, and reduced-motion-aware block transitions.
- Phase 2.D Classroom Cards: active Student membership projection, per-Student Card color/order, cross-Student denial, authenticated persistent Classroom entry, and strict separation from the schedule-bound live-lesson tool.
- Phase 3 Classroom lifecycle: Active, Former, and personally Archived Student collections; retained read-only Classroom entry; idempotent personal Archive/Restore; and active/wind-down archive denial.

### Available checks

| Command | Coverage |
| --- | --- |
| `npm run test:dashboards` | Route resolution, exact-role guards, switcher RPC use, protected destinations, and responsive hooks. |
| `npm run test:student-dashboard` | Dashboard schema/RLS/RPC contract, fixed/reorderable region boundary, layout normalization, grouped responsive top navigation, header drag handles, automatic preference persistence, and deferred-feature boundaries. |
| `npm run test:student-classrooms` | Student collection normalization, Archive/Restore wiring, read-only entry, keyboard tabs, and responsive layout contracts. |
| `npm run test:authorization` | Multi-role preservation and primary-role compatibility. |
| [`student-dashboard-foundation-db-self-test.sql`](../../tools/student-dashboard-foundation-db-self-test.sql) | Student-only projection, preference round-trip/reset, cross-Student RLS, unlinked empty state, and Tutor denial. |
| [`student-classroom-cards-db-self-test.sql`](../../tools/student-classroom-cards-db-self-test.sql) | Active Card projection, Card preference round-trip, cross-Student denial, Student/Tutor Classroom entry, and outsider denial. |
| [`student-classroom-lifecycle-projection-db-self-test.sql`](../../tools/student-classroom-lifecycle-projection-db-self-test.sql) | Wind-down presentation, active archive denial, retained history, member-specific archive independence, Student A/B isolation, idempotent restore, and outsider denial. |

`RUN-20260720-002` applied the Phase 2.B migration, passed all eight rollback database characterizations, verified layout/view persistence and reset in an authenticated browser, and passed 390-pixel overflow plus clean-console checks.

`RUN-20260720-003` applied the additive collapsed-state migration and passed direct-manipulation, auto-save, reload-persistence, all eight rollback characterizations, and the nine-actor zero-residue audit.

`RUN-20260720-004` passed the Phase 2.C fixed/reorderable boundary and responsive shell at 320, 390, 768, and 1440 pixels, then verified silent successful direct manipulation, failure-only feedback, and animated block transitions without a database change.

`RUN-20260720-005` applied the Phase 2.D Classroom Card migration, passed all nine rollback database characterizations and the nine-actor zero-residue audit, then verified Dashboard controls, reload-persistent block ordering, normal-flow reload position, and zero document overflow at 390 pixels. The current browser account had no active Classroom; active Card projection, per-Student customization, Student/Tutor entry, and outsider denial were exercised by the live database characterization.

`RUN-20260720-006` completed Phase 3 with all 13 rollback database characterizations, the nine-actor zero-residue audit, mouse and keyboard collection navigation, a three-column desktop grid, and a one-column 390-pixel layout without document overflow or browser warnings.

### Known gaps and live checks

- Complete Tutor, Mentor, Guardian, and administrator Classroom journeys in their owning role slices.
- Verify primary-role persistence through reload, logout, and login.
- Verify users cannot switch to a workspace for a role they do not hold.
- Tutor dashboard links to the planned `src/app/students/tutor-students.html`, but that relationship workspace does not yet exist.

## 6. Chunk C — Tutor–mentor–student relationships

### Protected invariants

`INV-REL-001`, `INV-REL-002`, `INV-SCOPE-001`, `INV-HISTORY-001`, `INV-TEST-001`

### Current implementation

- Multi-role authorization states account responsibilities but does not imply a relationship.
- Phase 2.A adds curriculum-scoped teaching qualifications, one active supervisory Mentor per Tutor, runtime Student Courses, persistent Classrooms, and explicit Classroom memberships.
- Course activation revalidates Tutor/Mentor qualification scope and creates Student, Tutor, and Mentor memberships atomically.
- Two deterministic Students receive separate Mechanics Courses and Classrooms with the same supervised Tutor. `ACT-OUTSIDER` remains unlinked for denial checks.

### Available checks

- `npm run test:relationships` statically checks the Phase 2.A schema, trusted functions, fixtures, and boundary.
- `student-relationships-db-self-test.sql` characterizes Mentor creation, activation, participant RLS, separate Classrooms, qualification enforcement, and outsider denial inside a rollback transaction.
- `supabase:provision` creates the deterministic Phase 2.A relationship graph through protected RPCs after provisioning Auth users and roles.
- `RUN-20260720-001` passed the seven-script local database suite and verified nine actors with zero retained characterization rows.

### Design and implementation gaps

- Student/Guardian Course acknowledgement, correction requests, reassignment, extension, and atomic termination.
- Student retained-read and personal archive behavior is implemented; content-specific Tutor and Guardian tenure rules remain with their owning features.
- Tutor-supervision reassignment and Quality Assistant intervention.
- Transfer and historical-access rules.
- Guardian memberships and relationship-scoped Profile projections.
- Availability, lesson-request, Class, Calendar, and credit integrations.
- Multi-role context when the same person participates through different relationships.

Only the Phase 2.A foundation may be marked implemented. Later lifecycle and workflow cases remain `DRAFT`, `NOT_RUN`, or `BLOCKED` until their vertical slices are delivered.

## 7. Chunk D — Form lifecycle

Detailed catalogs: [`CHUNK-D-FORM-LIFECYCLE.md`](./catalog/CHUNK-D-FORM-LIFECYCLE.md) and [`SHARED-CONTENT-PUBLICATION.md`](./catalog/SHARED-CONTENT-PUBLICATION.md).

### Protected invariants

`INV-AUTH-002`, `INV-SCOPE-001`, `INV-OWN-001`, `INV-PUB-001`, `INV-ID-001`, `INV-LIFE-001`, `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-ORDER-001`, `INV-RETRY-001`

### Current implementation

- Authoring: [`form-builder.html`](../../src/app/form-builder/form-builder.html), [`form-builder.js`](../../src/app/form-builder/form-builder.js), and [`form-domain.js`](../../src/app/form-builder/form-domain.js).
- Respondent delivery: [`form-taker.html`](../../src/app/form-builder/form-taker.html) and [`form-taker.js`](../../src/app/form-builder/form-taker.js).
- Review: [`form-review.html`](../../src/app/form-builder/form-review.html) and [`form-review.js`](../../src/app/form-builder/form-review.js).
- Backend adapters: [`form-supabase-adapters.js`](../../src/app/form-builder/form-supabase-adapters.js) and [`form-supabase-provider.js`](../../src/app/form-builder/form-supabase-provider.js).
- Persistence migration: [`202607170001_form_library.sql`](../../supabase/migrations/202607170001_form_library.sql).
- Review/publication policy: [`202607180004_content_publication.sql`](../../supabase/migrations/202607180004_content_publication.sql).

### Reusable fixtures

- [`content-lifecycle-standard-scenarios-v1.json`](./fixtures/content-lifecycle-standard-scenarios-v1.json) resolves shared actors and symbolic lifecycle resources without copying builder fixtures.
- [`comprehensive-five-phase-template.json`](../../src/app/form-builder/test-fixtures/comprehensive-five-phase-template.json)
- [`routing-cases.json`](../../src/app/form-builder/test-fixtures/routing-cases.json)

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:form-builder` | Routing, visible numbering, cloning, PDF paths, submissions, and comprehensive fixture. |
| `npm run test:form-supabase` | Provider/migration contract and immutable response shape. |
| `npm run test:form-review` | Review access, readable rendering, decisions, and audit history. |
| `npm run test:publication` | Independent review and privileged publication policy. |
| [`content-publication-db-self-test.sql`](../../tools/content-publication-db-self-test.sql) | Live-style role/RPC characterization with rollback. |

### Known gaps and live checks

- Form assignment to a linked student, class, or access token is not implemented.
- Tutor-facing retrieval of immutable submissions remains limited.
- Relationship-filtered form distribution cannot be verified until Chunk C exists.
- Perform an authenticated browser/RPC run after the clean database reset.
- Record manual responsive, print, helper, drag/reorder, and conditional-path evidence.

## 8. Chunk E — Exam lifecycle

Detailed catalogs: [`CHUNK-E-EXAM-LIFECYCLE.md`](./catalog/CHUNK-E-EXAM-LIFECYCLE.md) and [`SHARED-CONTENT-PUBLICATION.md`](./catalog/SHARED-CONTENT-PUBLICATION.md).

### Protected invariants

`INV-AUTH-002`, `INV-SCOPE-001`, `INV-OWN-001`, `INV-PUB-001`, `INV-DELIVERY-001`, `INV-ID-001`, `INV-LIFE-001`, `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-ORDER-001`, `INV-RETRY-001`

### Current implementation

- Authoring and contract: [`exam-builder.html`](../../src/app/exam-builder/exam-builder.html), [`exam-builder.js`](../../src/app/exam-builder/exam-builder.js), and [`exam-contract.js`](../../src/app/exam-builder/exam-contract.js).
- Student/result surfaces: [`exam-taker.html`](../../src/app/exam-builder/exam-taker.html), [`exam-results.html`](../../src/app/exam-builder/exam-results.html), and [`exam-answer-key.html`](../../src/app/exam-builder/exam-answer-key.html).
- Review: [`exam-review.html`](../../src/app/exam-builder/exam-review.html) and [`exam-review.js`](../../src/app/exam-builder/exam-review.js).
- Backend adapters: [`exam-supabase-adapters.js`](../../src/app/exam-builder/exam-supabase-adapters.js) and [`exam-supabase-provider.js`](../../src/app/exam-builder/exam-supabase-provider.js).
- Definition/question persistence: [`202607180001_exam_library.sql`](../../supabase/migrations/202607180001_exam_library.sql).
- Review workflow: [`202607180002_exam_review_workflow.sql`](../../supabase/migrations/202607180002_exam_review_workflow.sql).
- Shared publication policy: [`202607180004_content_publication.sql`](../../supabase/migrations/202607180004_content_publication.sql).

### Reusable fixture

- [`content-lifecycle-standard-scenarios-v1.json`](./fixtures/content-lifecycle-standard-scenarios-v1.json) defines symbolic owner, reviewer, respondent, and lifecycle resources.
- [`exam-builder-comprehensive-test.json`](../../src/app/exam-builder/test-fixtures/exam-builder-comprehensive-test.json)

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:exam-builder` | Reorder, metadata, persistence bundle, comprehensive content, and adapters. |
| `npm run test:exam-supabase` | Supabase provider and migration contract. |
| `npm run test:exam-review` | Review access, rendering, decisions, and audit history. |
| `npm run test:publication` | Publication capability and independent-review invariants. |
| [`content-publication-db-self-test.sql`](../../tools/content-publication-db-self-test.sql) | Protected exam publication/review RPC characterization. |

### Known gaps and live checks

- Exam assignment to a student or tutor is not implemented.
- The student taker is not yet backed by an authoritative student-safe assignment service.
- Relationship-filtered delivery and tutor result access are unavailable.
- The durable immutable grading basis for production student submissions still needs its assignment/submission domain.
- Record live author→review→publication checks after reset and manual visual/PDF/graph/grading runs.

## 9. Chunk F — Curriculum and reusable questions

Detailed catalogs: [`CHUNK-F-CURRICULUM-GOVERNANCE.md`](./catalog/CHUNK-F-CURRICULUM-GOVERNANCE.md) and [`CHUNK-F-QUESTION-BANK.md`](./catalog/CHUNK-F-QUESTION-BANK.md).

### Protected invariants

`INV-AUTH-002`, `INV-SCOPE-001`, `INV-OWN-001`, `INV-PUB-001`, `INV-DELIVERY-001`, `INV-LIFE-001`, `INV-ORDER-001`

### Current implementation

- Taxonomy workspace: [`course-builder.html`](../../src/app/course-builder/course-builder.html) and [`course-builder.js`](../../src/app/course-builder/course-builder.js).
- Question Bank: [`question-bank.html`](../../src/app/course-builder/question-bank.html), [`question-bank.js`](../../src/app/course-builder/question-bank.js), and [`question-bank-adapters.js`](../../src/app/course-builder/question-bank-adapters.js).
- Taxonomy migration: [`202607180005_curriculum_taxonomy.sql`](../../supabase/migrations/202607180005_curriculum_taxonomy.sql).
- Classification and bank migration: [`202607180006_question_bank.sql`](../../supabase/migrations/202607180006_question_bank.sql).

### Reusable fixture

- [`curriculum-question-bank-standard-scenarios-v1.json`](./fixtures/curriculum-question-bank-standard-scenarios-v1.json) resolves seeded taxonomy paths, governed proposals, and classified copies of the comprehensive exam questions.

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:curriculum` | Hierarchy, proposals, governance, adapters, and workspace contract. |
| `npm run test:question-bank` | Classification, retrieval filters, authorization, and UI contract. |
| [`curriculum-taxonomy-db-self-test.sql`](../../tools/curriculum-taxonomy-db-self-test.sql) | Proposal/decision, archive, authorization, and rollback characterization. |
| [`question-bank-db-self-test.sql`](../../tools/question-bank-db-self-test.sql) | Approved question eligibility, filters, authorization, and rollback characterization. |

### Known gaps and live checks

- Apply migrations to the reset database and record mentor proposal/admin decision behavior.
- Verify a student cannot call answer-bearing Question Bank RPCs.
- Record real pagination, descendant filtering, empty states, and archived-node behavior.
- Multi-classification review tooling remains future work even though the link table supports it.
- Archived source exams are excluded from Question Bank retrieval; archived curriculum-node eligibility still needs implementation verification and is captured by `QBANK-010`.

## 10. Chunk G — Course composition

Detailed catalog: [`CHUNK-G-COURSE-COMPOSITION.md`](./catalog/CHUNK-G-COURSE-COMPOSITION.md).

### Protected invariants

`INV-AUTH-002`, `INV-SCOPE-001`, `INV-OWN-001`, `INV-ID-001`, `INV-LIFE-001`, `INV-SOURCE-001`, `INV-ORDER-001`

### Current implementation

- Course editor: [`course-composer.html`](../../src/app/course-builder/course-composer.html) and [`course-composer.js`](../../src/app/course-builder/course-composer.js).
- Domain/adapters: [`course-composition-domain.js`](../../src/app/course-builder/course-composition-domain.js) and [`course-composition-adapters.js`](../../src/app/course-builder/course-composition-adapters.js).
- Migration: [`202607180007_course_composition.sql`](../../supabase/migrations/202607180007_course_composition.sql).

### Reusable fixture

- [`course-composition-standard-scenarios-v1.json`](./fixtures/course-composition-standard-scenarios-v1.json) defines an empty planning draft and a five-difficulty Mechanics progression using approved symbolic Question Bank references.

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:course-composition` | Domain ordering, adapter contract, authorization, workflow, and page boundary. |
| [`course-composition-db-self-test.sql`](../../tools/course-composition-db-self-test.sql) | Save/list/load/duplicate/archive/delete and source protection with rollback. |

### Known gaps and live checks

- Record an authenticated mentor/admin authoring run after reset.
- Verify server revalidation when a selected source question becomes ineligible before save.
- Record manual question-picker pagination/filtering and course lifecycle behavior.
- Future organization/cohort ownership is not modeled.
- Course drafts intentionally store live source-question references; immutable answer-safe content begins only at assignment and is covered by Chunk H.

## 11. Chunk H — Scheduling, assignment, and practice

Detailed catalogs: [`CHUNK-H-SCHEDULING.md`](./catalog/CHUNK-H-SCHEDULING.md) and [`CHUNK-H-ASSIGNMENT-PRACTICE.md`](./catalog/CHUNK-H-ASSIGNMENT-PRACTICE.md).

### Protected invariants

`INV-AUTH-002`, `INV-REL-001`, `INV-REL-002`, `INV-SCOPE-001`, `INV-OWN-001`, `INV-DELIVERY-001`, `INV-LIFE-001`, `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-ORDER-001`, `INV-RETRY-001`

### Current implementation

- Browser-backed schedule authoring: [`schedule-generator.html`](../../src/app/schedule-generator/schedule-generator.html), [`schedule-generator.js`](../../src/app/schedule-generator/schedule-generator.js), and [`schedule-domain.js`](../../src/app/schedule-generator/schedule-domain.js).
- Course assignment UI: [`course-composer.html`](../../src/app/course-builder/course-composer.html) and [`course-assignment-adapters.js`](../../src/app/course-builder/course-assignment-adapters.js).
- Student practice: [`practice-library.html`](../../src/app/course-builder/practice-library.html) and [`course-practice.html`](../../src/app/course-builder/course-practice.html).
- Assignment/practice domain: [`course-assignment-domain.js`](../../src/app/course-builder/course-assignment-domain.js).
- Backend delivery migration: [`202607190001_course_practice_delivery.sql`](../../supabase/migrations/202607190001_course_practice_delivery.sql).

### Reusable fixture

- [`course-practice-standard-scenarios-v1.json`](./fixtures/course-practice-standard-scenarios-v1.json) defines a timezone-aware student schedule, four-type approved source course, immutable assignment, redaction requirements, and automatic/pending-review response sets.

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:schedule-domain` | Date-only cadence and schedule document behavior. |
| `npm run test:schedule-outline` | Module/session outline mutations. |
| `npm run test:schedule-builder` | Page/catalog/link and key UI contracts. |
| `npm run test:course-practice` | Assignment/practice domain, adapter, authorization, and UI contracts. |
| [`course-practice-delivery-db-self-test.sql`](../../tools/course-practice-delivery-db-self-test.sql) | Answer-key stripping, permissions, attempts, scoring, repeat practice, and snapshot survival with rollback. |

### Known gaps and live checks

- Schedule Generator persistence remains `localStorage`; Course Builder uses a transitional manual sync bridge.
- Course assignment currently lists every active student role account, not students linked to the acting mentor/tutor.
- Written-response mentor review and grade-finalization UI is not implemented.
- Cancellation currently needs a server-side no-existing-attempt rule before `ASSIGN-007` can become Active.
- Lost-response submission retry cannot yet replay an already committed final result (`ASSIGN-012`).
- Structured graph-editor data has limited rendering in the practice player.
- Form and exam assignment do not yet share this course-delivery domain.
- Record mentor assignment and student practice using real authenticated sessions after reset.

## 12. Chunk I — Persistence and content lifecycle

### Protected invariants

`INV-SCOPE-001`, `INV-OWN-001`, `INV-ID-001`, `INV-LIFE-001`, `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-RETRY-001`, `INV-TEST-001`

### Current implementation

- Shared adapter guidance: [`BACKEND_ADAPTERS.md`](../../src/app/shared/BACKEND_ADAPTERS.md).
- Form, exam, course, and practice migrations provide domain-specific ownership and lifecycle rules.
- Local/browser providers remain available for several standalone tools; hosted providers use Supabase where implemented.

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:adapters` | Shared adapter composition and immutable local behavior. |
| `npm run test:form-supabase` | Form definition/submission adapter and migration contract. |
| `npm run test:exam-supabase` | Exam definition/question adapter and migration contract. |
| Database self-tests listed in Chunks D–H | Owner scope, lifecycle transitions, immutability, and rollback characterizations. |

### Known gaps and live checks

- No generic cross-domain assignment or relationship access model exists.
- Retry/idempotency behavior is implemented unevenly and needs explicit domain cases.
- Hosted retrieval, reload, archive, deletion, and failure-recovery runs remain unrecorded.
- Relationship termination effects cannot be tested before Chunk C is designed.
- A source→copy→publish→assign→archive/delete matrix should become a dedicated Phase 2/3 traceability table when detailed cases are added.

## 13. Chunk J — Cross-feature journeys and shared quality

### Protected invariants

All invariants, especially `INV-AUTH-002`, `INV-REL-001`, `INV-PUB-001`, `INV-DELIVERY-001`, `INV-HISTORY-001`, and `INV-TEST-001`.

### Current implementation

- Shared styling and dashboard navigation span the feature pages.
- The classroom/whiteboard smoke runner exercises a separate multi-participant live lesson journey.
- Builder, review, taxonomy, course, schedule, and practice checks currently run mostly as domain-specific characterizations.

### Available checks

| Command | Coverage |
| --- | --- |
| `npm run test:smoke` | Classroom/whiteboard multi-participant interaction and responsive checks. |
| All mapped `npm run test:*` commands | Broad static regression selection across implemented domains. |

### Known gaps and live checks

- No single automated journey currently creates an exam, obtains independent approval, retrieves its questions, composes a course, assigns it, and completes student practice.
- No relationship-aware multi-account journey exists.
- Manual responsive/accessibility evidence is not yet cataloged by shared component.
- The first 18-case database regression selection is recorded as `RUN-20260719-001`; complete cross-feature and browser selections remain pending.

## 14. Chunk K — Student Profile and Configuration

### Protected invariants

`INV-AUTH-001`, `INV-SCOPE-001`, `INV-HISTORY-001`, `INV-TEST-001`

### Current implementation

- Student routes and contract: [`student-profile.html`](../../src/app/profile/student-profile.html), [`student-preferences.html`](../../src/app/profile/student-preferences.html), and [`profile/README.md`](../../src/app/profile/README.md).
- Server adapter and theme bootstrap: [`profile-data.js`](../../src/app/profile/profile-data.js), [`theme.js`](../../src/auth/theme.js), and [`auth-guard.js`](../../src/auth/auth-guard.js).
- Catalogs, preferences, audit events, RPCs, grants, and RLS: [`202607200001_student_profile_preferences.sql`](../../supabase/migrations/202607200001_student_profile_preferences.sql).

### Available checks

| Command/artifact | Coverage |
| --- | --- |
| `npm run test:profile` | Source, routes, controlled values, privacy boundaries, migration, RPC, and RLS contract. |
| `npm run test:profile-live` | Disposable authenticated users, self-service saves, immutable birth date, invalid-value rejection, cross-account isolation, direct-write denial, and reset behavior. |
| [`student-profile-preferences-db-self-test.sql`](../../tools/student-profile-preferences-db-self-test.sql) | Rollback-style SQL characterization for the normal local Supabase acceptance runner. |

### Known gaps and live checks

- Populate the production catalog from a reviewed global country/state/city source; the migration seed is deliberately compact for local development.
- Add relationship-derived active Tutors and Course/Class statistics only when those authoritative domains exist.
- Re-run the rollback SQL through the standard runner outside sandboxes that deny child-process and Docker socket access.

## 15. Migration traceability

| Migration | Primary chunks | Central contract |
| --- | --- | --- |
| [`202607160001_profiles.sql`](../../supabase/migrations/202607160001_profiles.sql) | A, B | Auth profile foundation and initial role compatibility |
| [`202607170001_form_library.sql`](../../supabase/migrations/202607170001_form_library.sql) | D, I | Form definitions and immutable submissions |
| [`202607180001_exam_library.sql`](../../supabase/migrations/202607180001_exam_library.sql) | E, I | Exam definitions and independent question records |
| [`202607180002_exam_review_workflow.sql`](../../supabase/migrations/202607180002_exam_review_workflow.sql) | E, I | Exam review lifecycle and history |
| [`202607180003_multi_role_authorization.sql`](../../supabase/migrations/202607180003_multi_role_authorization.sql) | A, B | Roles, capabilities, credentials, primary role, and audit events |
| [`202607180004_content_publication.sql`](../../supabase/migrations/202607180004_content_publication.sql) | D, E, J | Independent review and privileged publication |
| [`202607180005_curriculum_taxonomy.sql`](../../supabase/migrations/202607180005_curriculum_taxonomy.sql) | F | Canonical taxonomy and governance |
| [`202607180006_question_bank.sql`](../../supabase/migrations/202607180006_question_bank.sql) | E, F | Question classifications, curriculum links, and bank RPCs |
| [`202607180007_course_composition.sql`](../../supabase/migrations/202607180007_course_composition.sql) | G, I | Course drafts and stable question references |
| [`202607190001_course_practice_delivery.sql`](../../supabase/migrations/202607190001_course_practice_delivery.sql) | H, I | Schedules, immutable assignments, safe delivery, and attempts |
| [`202607200001_student_profile_preferences.sql`](../../supabase/migrations/202607200001_student_profile_preferences.sql) | A, K | Governed Profile catalogs, preferences, audit events, self-service RPCs, grants, and RLS |
| [`202607200004_student_relationship_classroom_foundation.sql`](../../supabase/migrations/202607200004_student_relationship_classroom_foundation.sql) | C | Phase 2.A qualifications, supervision, runtime Courses, Classrooms, memberships, participant RLS, and trusted activation/projection RPCs |
| [`202607200005_student_dashboard_foundation.sql`](../../supabase/migrations/202607200005_student_dashboard_foundation.sql) | B, C | Phase 2.B Student-owned layout preferences, Student-only Dashboard projection, grouped shell boundary, and explicit deferred-feature status |
| [`202607200006_student_dashboard_refinements.sql`](../../supabase/migrations/202607200006_student_dashboard_refinements.sql) | B | Phase 2.B synchronized collapsed blocks and refined Dashboard preference projection |
| [`202607200007_student_classroom_cards.sql`](../../supabase/migrations/202607200007_student_classroom_cards.sql) | B, C | Active relationship-backed Classroom Cards, Student-owned color/order, and authenticated persistent Classroom entry |
| [`202607200008_student_calendar_surface.sql`](../../supabase/migrations/202607200008_student_calendar_surface.sql) | B, H | Course milestones, assignment deadlines, and authorized availability-context projection |
| [`202607200009_server_adapter_privileges.sql`](../../supabase/migrations/202607200009_server_adapter_privileges.sql) | A, I | Explicit service-role privileges used by guarded local server adapters |
| [`202607200010_classroom_membership_visibility.sql`](../../supabase/migrations/202607200010_classroom_membership_visibility.sql) | B, C, I | Retained Membership tenure, member-private archive preference, and participant/history RLS boundaries |
| [`202607200011_student_classroom_lifecycle_projection.sql`](../../supabase/migrations/202607200011_student_classroom_lifecycle_projection.sql) | B, C, I | Active/Former/Archived collections, personal Archive/Restore, and participating/read-only Classroom projections |

## 16. Existing executable-check inventory

This is a selection aid, not a run result.

| Change area | Minimum available command selection |
| --- | --- |
| Authentication, roles, or capabilities | `npm run test:authorization`, `npm run test:dashboards`, affected DB characterizations |
| Local Supabase reset, actors, or DB orchestration | `npm run test:supabase-acceptance`, then follow `LOCAL_SUPABASE_EXECUTION_RUNBOOK.md` |
| Dashboards or workspace routing | `npm run test:dashboards`, `npm run test:authorization` |
| Student Profile, signup configuration, preferences, or themes | `npm run test:profile`, `npm run test:profile-live`, `npm run test:authorization` |
| Forms | `npm run test:form-builder`, `npm run test:form-supabase`, `npm run test:form-review`, `npm run test:publication` |
| Exams | `npm run test:exam-builder`, `npm run test:exam-supabase`, `npm run test:exam-review`, `npm run test:publication` |
| Curriculum or classifications | `npm run test:curriculum`, `npm run test:question-bank`, `npm run test:exam-builder` |
| Course composition | `npm run test:course-composition`, `npm run test:question-bank`, `npm run test:curriculum` |
| Scheduling or practice delivery | `npm run test:schedule-domain`, `npm run test:schedule-outline`, `npm run test:schedule-builder`, `npm run test:course-practice` |
| Shared persistence/adapters | `npm run test:adapters` plus the affected domain provider test |
| Student Classroom Cards, collections, or historical entry | `npm run test:student-dashboard`, `npm run test:student-classrooms`, affected DB characterizations |
| Live Classroom/whiteboard tool | `npm run test:smoke` |

Database characterizations are executed separately against disposable local Supabase and must be recorded with their migration state and rollback result.

## 17. Change-impact selection guide

| If a change touches… | Review these chunks | Always reconsider these invariants |
| --- | --- | --- |
| Roles, capabilities, auth guards, or profile bootstrap | A, B, C, J | `INV-AUTH-001`, `INV-AUTH-002`, `INV-REL-001`, `INV-SCOPE-001` |
| Student Profile, governed options, themes, or confirmed timezone | A, K, J | `INV-AUTH-001`, `INV-SCOPE-001`, `INV-HISTORY-001`, `INV-TEST-001` |
| Student/tutor/mentor linking | A, B, C, H, I, J | `INV-REL-001`, `INV-REL-002`, `INV-SCOPE-001`, `INV-HISTORY-001` |
| Form persistence or routing | D, I, J | `INV-OWN-001`, `INV-ID-001`, `INV-HISTORY-001`, `INV-ORDER-001`, `INV-RETRY-001` |
| Exam questions, classification, delivery, or grading | E, F, G, H, I, J | `INV-DELIVERY-001`, `INV-ID-001`, `INV-SOURCE-001`, `INV-ORDER-001` |
| Review or publication | A, D, E, F, J | `INV-PUB-001`, `INV-OWN-001`, `INV-HISTORY-001` |
| Curriculum taxonomy | F, G, I | `INV-SCOPE-001`, `INV-LIFE-001`, `INV-SOURCE-001` |
| Course composition | F, G, H, I, J | `INV-ID-001`, `INV-SOURCE-001`, `INV-ORDER-001` |
| Schedules, assignments, attempts, or grades | C, H, I, J | `INV-REL-001`, `INV-DELIVERY-001`, `INV-HISTORY-001`, `INV-RETRY-001` |
| Archive, deletion, copying, or retry behavior | D, E, G, H, I, J | `INV-ID-001`, `INV-LIFE-001`, `INV-HISTORY-001`, `INV-SOURCE-001`, `INV-RETRY-001` |
| Shared layout, modals, or navigation | B, D, E, F, G, H, J | `INV-ORDER-001` plus relevant authorization invariant |

## 18. Highest-priority uncovered work

| Priority | Gap | Why it matters |
| --- | --- | --- |
| P0 | Clean migration replay plus live RPC/RLS verification | Static contracts cannot prove the deployed grants, policies, and authenticated behavior are correct. |
| P0 | Trusted first-administrator bootstrap characterization | Public self-promotion must remain impossible while deployment still has a recoverable bootstrap path. |
| P0 | Relationship model and scoped visibility | Course assignment currently sees all active students, and future interaction cannot safely rely on roles alone. |
| P0 | Authoritative exam/form assignment and answer-safe delivery | Published author records may contain answer-bearing or private content and cannot be used directly for student delivery. |
| P1 | Schedule Generator native backend persistence | The current manual browser-to-backend sync is transitional and can drift from authoritative assignments. |
| P1 | Written practice review/finalization | Pending-review responses cannot complete a trusted grade lifecycle yet. |
| P1 | Cross-feature multi-account journey | Domain checks do not yet prove the complete approved-question-to-student-practice path in one run. |
| P2 | Structured graph rendering in Course Practice | Graph-bearing reusable questions have a limited student renderer. |
| P2 | Recorded responsive/accessibility baseline | Shared visual behavior has checks but no formal acceptance evidence catalog yet. |

## 19. Phase boundary

Phase 7 defines detailed scheduling, assignment, practice, attempt, and grading behavior. It does not:

- claim that mapped commands passed a formal run;
- claim relationship-scoped student discovery exists while `SCHED-007` remains Draft;
- claim cancellation, submission-retry recovery, or written-review finalization is complete while their cases remain Draft;
- replace the transitional browser schedule synchronization bridge with native Schedule Generator backend persistence;
- claim archived curriculum-node eligibility is implemented while `QBANK-010` remains Draft;
- reset or mutate the local database;
- promote existing scripts to `AUTOMATED` acceptance status without case-level assertion review.

The next work should apply/reset local Supabase, run the catalog's live RPC/RLS characterizations, and record formal outcomes. Relationship design remains a separate prerequisite for safely narrowing student/tutor/mentor interaction.
