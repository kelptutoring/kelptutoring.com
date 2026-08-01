# Kelp acceptance coverage map

## Document control

| Field | Value |
| --- | --- |
| Purpose | Trace acceptance chunks and invariants to the implementation, migrations, fixtures, executable checks, and known gaps. |
| Created | 2026-07-19 |
| Current stage | Phase 5.G.2.4.5.3 Calendar/PDF presentation parity is complete. A consumer follow-up now makes a Student's Classroom Calendar the exact Classroom-filtered slice of the Dashboard's canonical Student timeline; Tutor and Mentor readers remain role-aware. Focused and aggregate source suites pass, and the strengthened full-event-set database characterization awaits the local PowerShell rerun in `RUN-20260731-006`. Phase 5.G.2.4.6 follows this verification. |
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
- Phase 4.A Classroom management entry: the persistent Classroom projection derives supervising-Mentor authority, exposes no mutation, and keeps all Tutor/schedule/ending actions visibly staged.
- Phase 4.B Classroom Overview: authorized Course/team/provider details plus a read-only linked Schedule summary and explicit legacy missing-Schedule state, without additional Profile data or Schedule mutation authority.
- Phase 4.C Classroom navigation: deep-linked area selection and browser history, explicit planned-area screens, Student-hidden supervisory Mentor identity, and a separate scheduled-Class-only live lesson tool.
- Phase 4.D private Classroom Files authority: direct Student/Tutor/Mentor shared-drive uploads, Guardian read-only access, two-hour uploader withdrawal, reasoned Tutor/Mentor moderation, tenure-bounded historical reads, private Storage RLS, provisional retention, and service-only purge finalization.
- Phase 4.E private Classroom Files interface: choose-or-drop upload, short-lived preview/download links, authoritative withdrawal/moderation refresh, retryable errors, read-only historical presentation, accessible dialog behavior, and responsive file actions.

### Available checks

| Command | Coverage |
| --- | --- |
| `npm run test:dashboards` | Route resolution, exact-role guards, switcher RPC use, protected destinations, and responsive hooks. |
| `npm run test:student-dashboard` | Dashboard schema/RLS/RPC contract, fixed/reorderable region boundary, layout normalization, grouped responsive top navigation, header drag handles, automatic preference persistence, and deferred-feature boundaries. |
| `npm run test:student-classrooms` | Student collection normalization, Archive/Restore wiring, read-only entry, keyboard tabs, and responsive layout contracts. |
| `npm run test:classroom-management` | Mentor-only capability normalization, staged management interface, disabled mutation controls, responsive styling, and migration/test documentation contracts. |
| `npm run test:classroom-overview` | Overview normalization, privacy boundary, linked/missing Schedule presentation, responsive layout, and migration/test documentation contracts. |
| `npm run test:classroom-navigation` | Area catalog/URLs, browser navigation wiring, staff-only Mentor visibility, planned-area presentation, and live-tool separation. |
| `npm run test:classroom-files` | Files payload normalization, private bucket limits, reservation/withdrawal/moderation/purge boundaries, adapter wiring, test-runner registration, and documentation contract. |
| `npm run test:classroom-files-ui` | File validation, active navigation, upload/activation orchestration, signed links, withdrawal/moderation dialogs, no browser delete authority, responsive states, and Phase 4.E status projection. |
| `npm run test:classroom-phase` | Consolidated Phase 4 authorization, workspace, Dashboard/Card, historical Classroom, management, Overview, navigation/privacy, Files authority/interface, and guarded-runner regression. |
| `npm run test:authorization` | Multi-role preservation and primary-role compatibility. |
| [`student-dashboard-foundation-db-self-test.sql`](../../tools/student-dashboard-foundation-db-self-test.sql) | Student-only projection, preference round-trip/reset, cross-Student RLS, unlinked empty state, and Tutor denial. |
| [`student-classroom-cards-db-self-test.sql`](../../tools/student-classroom-cards-db-self-test.sql) | Active Card projection, Card preference round-trip, cross-Student denial, Student/Tutor Classroom entry, and outsider denial. |
| [`student-classroom-lifecycle-projection-db-self-test.sql`](../../tools/student-classroom-lifecycle-projection-db-self-test.sql) | Wind-down presentation, active archive denial, retained history, member-specific archive independence, Student A/B isolation, idempotent restore, and outsider denial. |
| [`classroom-management-surface-db-self-test.sql`](../../tools/classroom-management-surface-db-self-test.sql) | Supervising-Mentor management access; Tutor, Student, and administrator Mentor-control denial; and outsider Classroom denial. |
| [`classroom-overview-projection-db-self-test.sql`](../../tools/classroom-overview-projection-db-self-test.sql) | Authorized Student/Tutor/Mentor Overview parity, administrator read-only shell, linked and legacy-missing Schedule states, privacy fields, and outsider denial. |
| [`classroom-navigation-privacy-db-self-test.sql`](../../tools/classroom-navigation-privacy-db-self-test.sql) | Student-hidden internal Mentor identity, Tutor/Mentor/administrator staff context, feature-area status, scheduled-Class-only live-tool state, and outsider denial. |
| [`classroom-private-files-db-self-test.sql`](../../tools/classroom-private-files-db-self-test.sql) | Student direct upload authority, Guardian read-only access, replacement/former-Tutor tenure rules, two-hour withdrawal, reasoned Tutor moderation, outsider denial, private Storage policies, and append-only audit events. |

`RUN-20260720-002` applied the Phase 2.B migration, passed all eight rollback database characterizations, verified layout/view persistence and reset in an authenticated browser, and passed 390-pixel overflow plus clean-console checks.

`RUN-20260720-003` applied the additive collapsed-state migration and passed direct-manipulation, auto-save, reload-persistence, all eight rollback characterizations, and the nine-actor zero-residue audit.

`RUN-20260720-004` passed the Phase 2.C fixed/reorderable boundary and responsive shell at 320, 390, 768, and 1440 pixels, then verified silent successful direct manipulation, failure-only feedback, and animated block transitions without a database change.

`RUN-20260720-005` applied the Phase 2.D Classroom Card migration, passed all nine rollback database characterizations and the nine-actor zero-residue audit, then verified Dashboard controls, reload-persistent block ordering, normal-flow reload position, and zero document overflow at 390 pixels. The current browser account had no active Classroom; active Card projection, per-Student customization, Student/Tutor entry, and outsider denial were exercised by the live database characterization.

`RUN-20260720-006` completed Phase 3 with all 13 rollback database characterizations, the nine-actor zero-residue audit, mouse and keyboard collection navigation, a three-column desktop grid, and a one-column 390-pixel layout without document overflow or browser warnings.

`RUN-20260722-001` applied the Phase 4.A management projection, passed all 14 rollback database characterizations, and verified the nine deterministic actors with zero retained characterization rows. The supervising Mentor alone receives the ordinary Classroom management capability; all management mutations remain staged.

`RUN-20260722-002` applied the Phase 4.B Overview projection, passed all 15 rollback database characterizations, and verified the nine deterministic actors with zero retained characterization rows. Student, Tutor, and Mentor receive the authorized Course Overview and linked Schedule summary; administrative shell access remains read-only, legacy missing-Schedule state remains explicit, and outsiders remain denied.

`RUN-20260722-003` applied the Phase 4.C navigation/privacy projection, passed all 16 rollback database characterizations, and verified the nine deterministic actors with zero retained characterization rows. Students do not receive the supervisory Mentor identity; eligible staff retain it, Classroom areas have explicit status, and the live lesson room remains a scheduled-Class-only tool.

`RUN-20260722-004` applied the Phase 4.D private Files authority, passed all 17 rollback database characterizations, and verified the nine deterministic actors with zero retained characterization rows. The run covered direct Student uploads, Guardian read-only access, current and former Tutor tenure boundaries, two-hour uploader withdrawal, reasoned Tutor/Mentor hiding, private Storage policies, and service-only purge finalization.

`RUN-20260722-005` applied the Phase 4.E interface-status migration, passed the Files interface and navigation static checks, reran all 17 rollback database characterizations successfully, and verified the nine deterministic actors with zero retained characterization rows. The first database attempt exposed and recorded a stale Phase 4.C schema-version expectation; after the compatibility assertion was corrected from version 5 to the intentional Phase 4.E version 6, the complete suite passed.

`RUN-20260722-006` completed the Phase 4.F checkpoint. Its consolidated source regression passed across authorization, workspace routing, Dashboard/Card integration, retained Classroom access, management, Overview, navigation/privacy, and Files. It reused the immediately preceding passing 17-characterization database and zero-residue audit gate, then passed the authenticated Student/Mentor Files journeys and 390-pixel responsive browser review.

`RUN-20260722-007` completed the Phase 5.A read-only Schedule audit. The Schedule domain, outline, 252-link builder integrity, immutable Course-practice delivery, Classroom Overview projection, Student Classroom checkpoint, and guarded local-runner tests passed. No migration or database mutation was introduced. The audit selected immutable versions, Course-date derivation, shared Studied progress, future-only editing, and provider/service/supervision separation as Phase 5.B boundaries.

Phase 5.B is implemented with the required stable Schedule, immutable version/item tables, retained-Course backfill, provider/service separation, atomic Schedule-aware Course creation, independent-Tutor activation, authorized read projection, and rollback characterization. `RUN-20260722-008` passed `test:course-schedule`, all 18 rollback database characterizations, and the nine-actor zero-residue audit. The independent-Tutor characterization separately proved the RLS-filtered Tutor view and the complete administrator-visible Student/Tutor Membership structure without weakening Membership privacy.

`RUN-20260722-008` completed Phase 5.B. Its first migration attempt rolled back at an unnecessary legacy relationship-projection refresh, which was removed from this Schedule-owned slice. An initially ambiguous independent-Tutor assertion was then split by authority: the Tutor correctly saw only their own Membership through RLS, while administrative verification confirmed exactly the underlying Student and Tutor Memberships and no Mentor Membership. The final complete suite passed.

`RUN-20260722-009` completed Phase 5.C with a central `student_courses` synchronization invariant, an activated-start lock, effective Schedule Version ranges, wind-down reopening, and a participant projection that distinguishes synchronized Course dates from immutable Version bounds. The migration applied through `202607220007`, all 19 rollback characterizations passed, and the nine-actor audit retained zero characterization rows. The run covered draft movement, activation, extension, shortening, immutable history, backdating rejection, dropped-only rejection, direct-write normalization, wind-down extension, elapsed activation, and outsider denial.

Phase 5.D is implemented in `202607220008_course_schedule_structural_editing.sql` with assignment-scoped Tutor/Mentor authority, Curriculum/Review/Exam structural kinds, governed public/private reasons, immutable expected-Version publishing, idempotency receipts, Calendar-mirror synchronization, Student-active-only RLS, staff history, and notification facts. `RUN-20260722-010` applied the migration and passed the complete 20-case rollback runner plus the nine-actor zero-residue audit. Coverage includes Tutor, Mentor, Student, outsider, administrator, independent-Tutor, wind-down, stale-save, retry, audit, privacy, and immutable-history cases.

Phase 5.E.1 is implemented in `202607220009_course_schedule_session_resources.sql`, with the applied successor-inheritance repair in `202607220010_course_schedule_source_inheritance_fix.sql`. Curriculum items derive stable Track/Module/Session identity, an immutable source-content key, Easy/Intermediate/Difficult normalization, and a safe planning route from their immutable source snapshot. Course-specific resources are immutable required/optional/not-assigned snapshots. Student reads exclude not-assigned resources, authorized staff retain the complete audit view, and successor structural Versions inherit unchanged source/resource identity. `RUN-20260722-011` passed all 21 rollback characterizations and the nine-actor zero-residue audit.

Phase 5.E.2 is implemented in `202607220011_course_progress_ledger.sql`. It adds immutable progress events, idempotent command receipts, private Student reflections with append-only two-hour amendments, governed Studied reversals, server/effective timestamp separation, per-target stale-state rejection, Student-controlled resource progress, Student/Tutor notification facts, wind-down reopening, and a Course-participant projection that deliberately excludes Guardians from lesson-level progress and reflections. Studied Sessions pin their exact identity and cannot be dropped, reordered, rescheduled, or have their source/resource snapshot replaced in a successor structural Version. `RUN-20260723-012` passed all 22 rollback characterizations and the nine-actor zero-residue audit. Hierarchical aggregation and effective reflow remain deliberately staged in 5.E.3–5.E.4. Full Markdown-derived Track publication remains Phase 15.

Phase 5.E.3 is complete in `202607220012_course_progress_hierarchical_aggregation.sql`. It derives Session Studied from all required assigned resources, preserves optional and not-assigned boundaries, presents required/optional children as inherited after a direct Session mark, and never fabricates child progress events. Parent reversals preserve explicit child facts; resource-level Studied corrections are Tutor/Mentor-governed and parent-first; Reviewed/Practiced remain explicit and non-advancing. Derived completion locks structural history and creates durable Student/Tutor boundary notifications. `RUN-20260723-013` applied the migration, passed `course-progress-hierarchical-aggregation-db-self-test.sql` within the complete 23-case rollback runner, and passed the nine-actor zero-residue audit.

Phase 5.E.4 is complete in migrations `202607230001`–`005`, `course-schedule-adapter.js`, and the persistent Classroom Schedule surface. It adds deterministic Markdown content hashes, Tutor/Mentor Builder context, Course/Subject/Track validation, expected-Version publication, one effective Student projection, row-level progress controls, retained pre-activation history, and a least-privilege server read of the Calendar compatibility mirror. `builder-effective-student-schedule-db-self-test.sql` covers immutable successor publication, stale-save rejection, Student/outsider denial, Mentor/Tutor authority, and a later topic moving into actual Studied order. `RUN-20260723-016` passed all 24 rollback characterizations, preserved the newer seven-session Builder-backed Algebra 1 Schedule during interactive Mentor sandbox verification, and passed the nine-actor zero-residue audit.

Phase 5.E.5 adds `createClassroomScheduleSnapshot`, refresh-before-print behavior, a private-data-filtered print document, and deterministic internal snapshot identity. The Student PDF presents Student, Tutor, Subject, Content, effective dates, progress, copyright, generation time, and a centered watermark without exposing Course/Version UUIDs, original planning dates, or timezone metadata. Authoritative progress refreshes preserve the visible Schedule, expanded resource rows, viewport, and keyboard focus while Student-facing audit timestamps remain hidden. `RUN-20260723-017` passed the original consolidated Classroom source suite and every Phase 5.E source contract. `RUN-20260724-023` then applied the Profile-derived Student viewer-timezone projection and passed all 29 rollback characterizations plus the zero-residue audit. The module/interaction follow-up adds member-private module and PDF colors, persistent pressed progress states, outside-click color popovers, softened progress transitions, corrected re-mark signature history, and Student-only filtering of mixed source-less scaffolds. `RUN-20260724-024` confirms migrations through `202607240003`, all 29 rollback characterizations, and the nine-actor zero-residue audit. `RUN-20260724-025` confirms migrations `202607240004`–`005`, the single-content Classroom Builder boundary, active-only progress aggregation, all 29 rollback characterizations, and zero residue.

The initial Phase 5.H slice makes Classroom Home the default destination and adds an authoritative Track-progress projection in `202607240006_classroom_home_track_progress.sql`. Studied and Practiced each contribute one unit per active Curriculum Session; Reviewed and resource-level marks do not affect the percentage. `builder-effective-student-schedule-db-self-test.sql` characterizes zero progress and progress after independent later-topic study. The source contracts also cover default Home routing, the progress bar/helper, per-control progress dates, a dedicated Studied confirmation dialog, and the paginated PDF table/footer boundary. `RUN-20260724-026` confirms the migration, all 29 rollback database characterizations, and the nine-actor zero-residue audit.

Phase 5.F.1 is complete in `202607230006_course_schedule_meeting_patterns.sql`,
with its active publishing contract forward-corrected by Phase 5.F.2.2.
It adds immutable, Version-owned weekly patterns; Tutor/Mentor and
self-employed-Tutor publishing; expected-Version concurrency; idempotency;
participant notifications; Student active-only visibility; staff history; and
automatic inheritance into later structural Versions. New patterns are neutral
weekday/time/duration opportunities without a default purpose or a
duration-based progression rule. Historical 5.F.1 purpose values remain
auditable. `course-schedule-meeting-pattern-db-self-test.sql` covers the original
database contract, and the Phase 5.F.2.2 characterization covers the corrected
publisher. `RUN-20260723-018` applied the original migration, passed all 25
rollback database characterizations, and passed the nine-actor zero-residue
audit. Class/Calendar records, outcomes, attendance, and credits are
deliberately absent.

Phase 5.F.2.1 is complete in
`202607230007_course_schedule_academic_slots.sql`. It creates one immutable
occurrence set for each active Schedule Version. Recurring occurrences use only
weekday, local time, duration, effective range, and Course timezone; the legacy
meeting-pattern purpose is deliberately excluded. On-demand/access-only Courses
receive date-only occurrences from active structural items. Successor Version
activation generates a distinct set atomically, recurring Courses without a
pattern remain review-required, Students read only the active set, and staff
receive Version summaries. `course-schedule-academic-slots-db-self-test.sql`
covers recurring/static generation, RLS, successor isolation, outsider denial,
and both browser-role and trigger-level immutability. `RUN-20260723-019`
applied the migration, passed all 26 rollback database characterizations, and
passed the nine-actor zero-residue audit. Target mapping, capacity validation, Calendar bookings,
Classes, outcomes, attendance, and credits remain outside 5.F.2.1.

Phase 5.F.2.2 is complete in
`202607230008_course_schedule_target_mapping.sql`. It adds append-only mapping
revisions and immutable slot-target rows. Recurring slots receive the next
unstudied structural item in order; independent Studied progress appends a new
mapping revision and reflows future targets without rewriting prior mappings.
Excess topics remain `awaiting_future_slot` and never create a booking, credit
purchase, or top-up. On-demand Courses expose the earliest unstudied topic as
the recommendation and all unstudied topics as selectable data for the later
Lesson Request form; access-only Courses expose no booking choice. Raw mapping
history remains staff-authorized while Students receive only the active
revision. `RUN-20260723-020` applied the migration, passed the complete related
source suite and all 27 rollback database characterizations, and verified the
nine deterministic actors with zero retained characterization rows.

Phase 5.F.3 is complete in
`202607230009_course_schedule_occurrence_outcomes.sql`. It adds immutable
six-hour target locks; append-only occurrence
outcomes and corrections; separate resolution, actual-purpose, and lesson-origin
facts; outcome-aware future target reflow; Student disputes and outside-Kelp
confirmation; Quality Assistant oversight; staff-only PDF/JPEG/PNG evidence;
automatic unresolved `not_delivered` resolution; redacted Student projections;
notification facts; idempotent retries; and one-resolution concurrency. The
command records only full/half/no/pending charge
recommendations and a minimum 14-day settlement boundary. It creates no credit,
Class attendance, payout, or Tutor-settlement ledger entry.
`course-schedule-occurrence-outcomes-db-self-test.sql` characterizes Review
pivots, locked historical targets, requeueing, Student privacy/denial, Mentor
dispute resolution, Quality Assistant access, private evidence isolation,
append-only history, and the nonfinancial 14-day boundary. Forward migration
`202607230010_course_schedule_local_date_boundary.sql` makes structural past-item
protection use the Schedule Version timezone rather than the database server
date. `RUN-20260723-021` applied both migrations, passed all 28 rollback
database characterizations, and verified nine deterministic actors with zero
retained characterization rows.

Phase 5.F.4 is source-complete in
`202607230011_unified_course_schedule_projection.sql`. The new
`get_my_unified_course_schedule` RPC exposes one active-Version Past/Next/
Upcoming timeline over structural items, effective progress, recurring slots,
current target mapping, immutable target locks, and latest outcomes. It embeds
a Tutor-linked Studied event in its meeting row, distinguishes `planned` from
`confirmed`, retains public provisional financial recommendations without
posting ledger entries, gives authorized staff Version/audit detail, and limits
Guardians to the higher-level plan. `unified-course-schedule-db-self-test.sql`
is registered as the 29th rollback characterization and covers Student
redaction/de-duplication, Tutor and Quality Assistant audit reads, outsider
denial, and Guardian privacy. `RUN-20260723-022` applied the migration, passed
all 29 rollback database characterizations, verified all nine deterministic
actors, and retained zero characterization rows.

Phase 5.G.1 is complete in
`202607240008_unified_schedule_read_contract.sql`. The canonical versioned
projection preserves module-based detail for Students and assigned academic
staff, retains a high-level Guardian view, excludes internal supervision from
Student responses, and classifies meetings as Planned, Awaiting, Pending
confirmation, Delivered, Not delivered, or Cancelled. Its Calendar metadata
anchors date-only rows at viewer-local noon without creating bookings or
blocking availability, and states explicitly that Assignment deadlines do not
move meetings. `unified-schedule-read-contract-db-self-test.sql` is registered
as the 30th rollback characterization and covers the fixed six-hour state
boundary, non-delivery reason vocabulary, module/detail permissions, Student
privacy, Guardian redaction, outsider denial, private helper grants, and the
non-authoritative legacy mirror. `RUN-20260724-027` confirms the local
migration state, all 30 rollback database characterizations, the nine-actor
zero-residue audit, and the focused Classroom Schedule/PDF source contracts.

Phase 5.G.2.1 cuts the existing Classroom Home and Schedule consumer over to
`get_my_unified_course_schedule`. The browser adapter validates
`course_schedule_read` version 1, maps its detailed `academicTrack` into the
established module interface, preserves the canonical Past/Next/Upcoming
timeline and Calendar/meeting policies, and rejects higher-level-only responses
from the detailed Classroom Schedule surface. No browser fallback to
`get_my_effective_course_schedule` or `learning_schedules` remains. Progress
and presentation-preference writes reread the canonical contract; a committed
write followed by a failed refresh receives an explicit saved-but-not-reloaded
message. `RUN-20260724-028` covers this source-only consumer cutover; no
database migration was required beyond the passing 5.G.1 gate.

Phase 5.G.2.2 cuts the Student Dashboard Calendar over to canonical Course
timelines while preserving independent Assignment deadlines. Migrations
`202607240009`–`202607240011` provide atomic failure, direct Track/Assignment
destinations, module and Classroom color inheritance, exact Classroom-Course
filtering, and compact accessible event presentation. The user applied the
sequence and confirmed all 30 rollback characterizations.

Phase 5.G.2.3 adds a cross-consumer parity gate. The source contract compares
normalized Classroom and Calendar identity, date, status, destination,
timezone, and module presentation. The Student Calendar rollback
characterization compares the live RPC results against the same canonical
timeline row, repeats the read after a Profile timezone change, verifies
assigned-Tutor and supervising-Mentor detail, rejects cross-Student access,
and retains atomic failure plus legacy-mirror isolation. `RUN-20260724-029`
records the passing consolidated source suites, all 30 rollback database
characterizations, and the nine-actor zero-residue audit.

Phase 5.G.2.4.1 defines the multi-curriculum coverage source contract. One
Course/Classroom still requires one active Schedule, but that Schedule may
select governed branches from several Education levels, Goals,
Subjects, and Tracks. Exactly one selected Track is primary; supporting Tracks
remain in the same Classroom. Student-facing coverage labels include only the
Goals actually selected beneath their Education level. The assigned Tutor must be qualified for every
selected branch, a supervising Mentor does not inherit teaching authority, and
a Quality Assistant retains oversight/dispute authority rather than teaching
authority. One canonical Curriculum Session contributes one active progress
target per Schedule Version even when several tutoring Class occurrences
discuss it; homework creates no Class occurrence and no duplicate target.
`RUN-20260725-030` records the passing focused contract, Builder adapter,
consumer-parity check, and complete Schedule phase suite. Persistence and
existing-Course migration intentionally begin in Phase 5.G.2.4.2.

Phase 5.G.2.4.2 is complete in
`202607250001_course_schedule_version_coverage.sql`. It creates one immutable
coverage row per Schedule Version, validates exactly one primary Track,
preserves the Education-level → Goal → Subject → Track hierarchy, and derives
compact labels from selected values only. Existing Versions receive one
primary branch from their retained Course Subject/focus with an empty Goal list
and explicit migration provenance; the migration does not update Course,
Version, item, progress, Classroom, or Membership history. An insert trigger
gives new version 1 rows equivalent coverage and makes current single-focus
successors inherit the exact previous snapshot. Student RLS exposes only active
coverage, assigned Tutors and supervising Mentors retain Version history, and
outsiders remain denied. `RUN-20260725-031` records the corrected and applied
migration, focused and complete Schedule source checks, all 31 passing rollback
database characterizations, and the nine-actor zero-residue audit.

Phase 5.G.2.4.3.1 is source-complete. The generated catalogue now carries
optional academic-pathway metadata per Track and the shared Builder uses
subject-first Education level → Subject → Track → Module → Session traversal.
Standalone authors can retain branches across Education levels and Subjects in
one selection tray, designate one primary Track, add supporting Tracks, migrate
schema-v1 browser drafts, and generate schema-v2 reusable coverage with
item-level curriculum identity. Missing pathway metadata appears as Regular
without creating a fake pathway or Student goal. A branch enters coverage only
after a governed Track Session is selected; supplemental Review, Practice,
Exam, and Wrap-up items cannot establish coverage alone. Classroom publication
remains single-focus until qualification and atomic multi-branch publication
arrive. `RUN-20260726-032` records the focused test, complete Schedule source
suite, local Supabase runner self-test, and source-only cleanup. No migration or
database mutation was required.

Phase 5.G.2.4.3.2 is complete.
Migration `202607260001_classroom_builder_preload_recovery.sql` extends the
authorized Classroom Builder context with the exact immutable active-Version
coverage, Classroom identity, item-level Track Session/content source keys,
Studied and delivered state, and explicit draft-multiple/publish-single
permissions. Classroom mode preloads every resolvable branch and eligible
future Session while retaining past, Studied, and dropped work as staff-only
locked context. Delivered occurrence state remains available for started-Track
and audit decisions without locking an unfinished future target. Missing catalogue sources remain represented from
the immutable Version snapshot; newer source content is called out without
silently replacing the Course copy. Course drafts carry their base active
Version, stale drafts are rejected from merging and preserved read-only for
recovery, and retained source identities keep their stable Schedule-item keys.
Multi-branch, primary-Track, missing-source, and source-update previews remain
visible, but publication stays disabled until 5.G.2.4.4 performs complete
qualification validation and atomic coverage publication.
`RUN-20260726-033` records the focused contract, complete Schedule source suite,
applied migration, all 31 passing rollback database characterizations, and the
nine-actor zero-residue audit. Authenticated responsive exploration remains a
useful later walkthrough rather than a database or completion blocker.

Phase 5.G.2.4.4 is complete.
Migration `202607260002_course_schedule_qualification_publication.sql` resolves
the complete proposed Builder coverage to canonical curriculum nodes, locks and
snapshots the assigned Tutor's active qualification for every selected branch,
and rejects the whole request before writing when one branch is unauthorized.
The selected coverage, successor Version, Course primary compatibility anchors,
date projection, reasons, notifications, and complete Builder idempotency
receipt share one transaction. Direct structural publication is limited to the
active coverage and cannot add a same-Subject branch as a bypass. When no former
active Track remains, the successor records a new plan epoch and points former
progress to the previous Schedule; the Classroom Home must show only the new
active plan, while historical Versions retain all prior items and progress.
The focused source check and rollback characterization are registered.
Migration `202607260002` applied locally, all 32 rollback database
characterizations passed, and the nine-actor audit retained zero
characterization rows. `RUN-20260726-034` records the verified checkpoint.

Phase 5.G.2.4.5.3 is complete in
`202607310001_calendar_pdf_presentation_parity.sql`. Schedule-backed events in
all three Calendar projections now resolve their own canonical academic branch,
compact label, direct destination, branch-qualified module key, and the
viewer's private module presentation. Course lifecycle events instead summarize
the immutable active-Version whole-Course coverage and retain the Classroom
color; Assignment deadlines keep their independent palette. The combined
Student Schedule PDF snapshots whole-Course coverage for document metadata and
prints each row's item-specific academic path with the same branch-qualified
module colors used on the webpage. Source characterizations cover Dashboard and
Classroom Calendar normalization, lifecycle-versus-item scope, Calendar/PDF
color identity, pathways, and unchanged date-only/destination behavior. Both
complete source suites pass. The migration applied locally, all 35 rollback
database characterizations passed, and the nine-actor audit retained zero
characterization rows in `RUN-20260731-005`.

A same-day consumer-parity follow-up removes the remaining Student-only split:
the Classroom page now calls `get_my_student_classroom_calendar`, which is the
Classroom-filtered projection of `get_my_student_calendar`, while Tutor and
Mentor pages continue to call the role-aware Classroom reader. The database
characterization compares the complete Classroom event array with the matching
Dashboard slice, including event counts and both difference directions, so a
partial milestone list cannot pass by matching only one sampled row. Focused
and aggregate source suites pass; `RUN-20260731-006` records the local database
rerun as pending because the desktop sandbox cannot spawn Docker.

Phase 5.G.2.4.7.3.1.2 corrects the distinction between immutable delivery
history and curriculum completion. Migration
`202607310002_course_schedule_delivery_target_reflow.sql` narrows exact
structural locks to Studied progress: a delivered occurrence still makes its
Track started and cannot be rewritten, while its future unfinished curriculum
target remains selected and may move onto a continuation's revised cadence.
Past and Studied targets remain fixed, Practiced progress remains attached, and
ordinary started-Track removal protection is unchanged. Focused regressions
cover exact Tuesday/Saturday lanes, Builder preload, adapter reflow, stable
positions, and governed successor publication; the complete Schedule source
suite passes. The migration applied locally, all 35 rollback database
characterizations passed, and the nine-actor audit retained zero
characterization rows. `RUN-20260731-007` records the verified checkpoint.

Phase 5.G.2.4.7.3.1.3 closes the remaining cross-Track cadence and role-parity
gaps. Migration
`202607310003_combined_cadence_and_student_calendar_parity.sql` assigns dates
once, after all selected Tracks have entered the definitive publication order,
so a Track boundary cannot restart a weekly lane. The regression fixes the
formerly vacant Aug 17 and Aug 24 opportunities in the exact nine-Session
Monday/Saturday sequence. The same migration recomposes Student Dashboard and
Classroom Calendar events from the current role-aware active-Version Classroom
reader. Characterization now compares the complete Student and staff event
arrays in both directions rather than accepting a matching subset.
`RUN-20260731-008` records the source checkpoint; local migration and database
verification remain pending.

### Known gaps and live checks

- Complete the deferred Student Reviewed mark/reload/reversal, assigned-Tutor Schedule/PDF view, and 390-pixel overflow check when the user returns to the Phase 5.E live checks.
- Live Classroom presence evidence, actual no-show credit posting, and Tutor settlement execution remain in their later owning slices.
- Complete Tutor, Guardian, Quality Assistant, and administrator Classroom journeys in their owning role slices.
- Phase 5 must replace the read-only linked Schedule summary with the authoritative, versioned Course Schedule while preserving Phase 4 Classroom authorization and history.
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
- `test:manual-qa-network` checks the separate interactive graph (Aldebarã Mentor → Thiago Kelp Tutor → two Student Courses), exact one-role account normalization, retained retirement of predecessor sandbox Courses, and canonical Track page destinations for all 16 curriculum rows. `supabase:provision:manual-qa` restores only this graph on the confirmed local stack without changing account passwords.
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
| `npm run test:schedule-cadence-change-regressions` | Named regressions for revised-cadence reflow: Studied dates remain fixed, unfinished and later-unmarked Sessions use only the new weekdays, and the persisted frontend future lane contains no superseded cadence dates. |
| `npm run test:schedule-cadence-continuation` | Transactional Builder name/timezone/cadence persistence; explicit Monday/Wednesday/Friday reopen and seven-day fixed-period fallback rejection; repeated active Builder-context reads; publication-receipt cadence retention and recovery for affected immutable Versions; Sunday-first cadence selection; canonical, meeting-pattern, and legacy preload compatibility; protection against untouched draft defaults replacing the active cadence; preservation of intentional draft cadence edits; bottom Back-control placement; replacement-date flooring against a future locked Course start; exact multi-week weekday lanes including Tuesday/Saturday; fixed historical/Studied dates; delivered-occurrence target retention/reflow; movable-but-retained Practiced work; standard pre-database-suite wiring; and atomic rejection/receipt coverage. |
| `npm run test:schedule-regression-checkpoint` | Consolidated Phase 5.G.2.4.7.4 contract for Student/Tutor/Mentor progress parity, mandatory explanations, centered dialogs, ordinary pre-start actions, explicit back-report rejection, six-hour holds, Adaptive/Static pacing, Track replacement boundaries, qualifications, Student-safe logs, staff audit privacy, rollback execution, and zero-residue audit wiring. |
| `npm run test:schedule-outline` | Module/session outline mutations. |
| `npm run test:schedule-builder` | Page/catalog/link and key UI contracts. |
| `npm run test:course-practice` | Assignment/practice domain, adapter, authorization, and UI contracts. |
| [`course-practice-delivery-db-self-test.sql`](../../tools/course-practice-delivery-db-self-test.sql) | Answer-key stripping, permissions, attempts, scoring, repeat practice, and snapshot survival with rollback. |
| [`course-schedule-qualification-publication-db-self-test.sql`](../../tools/course-schedule-qualification-publication-db-self-test.sql) | Continuing publication accepts future Practiced and delivered-linked unfinished-target date reflow, rejects Practiced removal and exact Studied movement atomically, and preserves delivered occurrence history plus started-Track removal protection. |

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
| [`202607220001_classroom_management_surface.sql`](../../supabase/migrations/202607220001_classroom_management_surface.sql) | B, C, I | Supervising-Mentor Classroom management capability and staged Phase 4.A action projection without mutation authority |
| [`202607220002_classroom_overview_projection.sql`](../../supabase/migrations/202607220002_classroom_overview_projection.sql) | B, C, H, I | Authorized Phase 4.B Classroom team, provider, Course, and read-only linked Schedule summary with explicit legacy missing state |
| [`202607220003_classroom_navigation_privacy.sql`](../../supabase/migrations/202607220003_classroom_navigation_privacy.sql) | A, B, C, I | Phase 4.C staff-only supervision context, persistent Classroom navigation status, and scheduled-Class-only live-tool boundary |
| [`202607220004_classroom_private_files_authority.sql`](../../supabase/migrations/202607220004_classroom_private_files_authority.sql) | A, B, C, I | Phase 4.D private Classroom shared-drive metadata, Membership/tenure reads, two-hour withdrawal, reasoned moderation, Storage RLS, retention, and service-only purge authority |
| [`202607220005_classroom_files_interface_status.sql`](../../supabase/migrations/202607220005_classroom_files_interface_status.sql) | B, C, I | Phase 4.E active Files interface projections without additional Storage or deletion authority |
| [`202607220006_required_versioned_course_schedule.sql`](../../supabase/migrations/202607220006_required_versioned_course_schedule.sql) | C, H, I | Phase 5.B required stable Course Schedule, immutable Versions/items, atomic Course creation, retained-data backfill, and provider/service separation |
| [`202607220007_course_date_synchronization.sql`](../../supabase/migrations/202607220007_course_date_synchronization.sql) | C, H, I | Phase 5.C active-Version date authority, activated-start lock, endpoint synchronization, wind-down reopening, and Version-range projection |
| [`202607220008_course_schedule_structural_editing.sql`](../../supabase/migrations/202607220008_course_schedule_structural_editing.sql) | A, C, H, I | Phase 5.D assignment-scoped structural editing, governed reasons, expected-Version concurrency, immutable audit, notification facts, Student-active-only RLS, and compatibility-mirror synchronization |
| [`202607220009_course_schedule_session_resources.sql`](../../supabase/migrations/202607220009_course_schedule_session_resources.sql) | A, C, H, I | Phase 5.E.1 immutable Track Session/content identity, normalized difficulty, personalized resource snapshots, inheritance, staff history, and Student visibility filtering |
| [`202607220010_course_schedule_source_inheritance_fix.sql`](../../supabase/migrations/202607220010_course_schedule_source_inheritance_fix.sql) | C, H, I | Phase 5.E.1 successor-Version inheritance repair that preserves Review/Exam JSON snapshots without inventing a Track content-version identity |
| [`202607220011_course_progress_ledger.sql`](../../supabase/migrations/202607220011_course_progress_ledger.sql) | A, C, H, I | Phase 5.E.2 append-only Studied/Reviewed/Practiced events, governed reversals, private reflections, idempotency, item-level concurrency, notifications, Guardian privacy, and Studied structural locking |
| [`202607250001_course_schedule_version_coverage.sql`](../../supabase/migrations/202607250001_course_schedule_version_coverage.sql) | C, H, I | Phase 5.G.2.4.2 immutable per-Version multi-curriculum coverage, safe legacy backfill, exact successor inheritance, role-scoped history, and mutation rejection |
| [`202607260001_classroom_builder_preload_recovery.sql`](../../supabase/migrations/202607260001_classroom_builder_preload_recovery.sql) | C, H, I | Phase 5.G.2.4.3.2 authorized Classroom Builder preload context, retained source/progress state, and staged multi-branch publication permissions |
| [`202607260002_course_schedule_qualification_publication.sql`](../../supabase/migrations/202607260002_course_schedule_qualification_publication.sql) | A, C, H, I | Phase 5.G.2.4.4 assigned-Tutor qualification snapshots, canonical multi-branch resolution, atomic selected coverage/Version publication, replacement-history boundary, complete idempotency, and direct-bypass denial |
| [`202607260003_multi_curriculum_consumer_projection.sql`](../../supabase/migrations/202607260003_multi_curriculum_consumer_projection.sql) | B, C, H, I | Phase 5.G.2.4.5.1 active-Version coverage, item-specific academic branch, branch-qualified module identity, and combined Course-progress projection |
| [`202607260004_calendar_legacy_module_identity_compatibility.sql`](../../supabase/migrations/202607260004_calendar_legacy_module_identity_compatibility.sql) | B, C, H | Retained legacy `course-plan` identity and member-private color parity between Classroom and Calendar |
| [`202607260005_classroom_home_multi_curriculum.sql`](../../supabase/migrations/202607260005_classroom_home_multi_curriculum.sql) | B, C, H, I | Phase 5.G.2.4.5.2 active-only multi-curriculum Classroom Home, independent Assignment deadline display, Course progress, direct destinations, and Track-qualified module preferences |
| [`202607310001_calendar_pdf_presentation_parity.sql`](../../supabase/migrations/202607310001_calendar_pdf_presentation_parity.sql) | B, C, H, I | Phase 5.G.2.4.5.3 item-specific academic paths and branch-qualified colors for Schedule-backed Calendar/PDF rows, with whole-Course coverage reserved for lifecycle events and PDF metadata |
| [`202607300009_schedule_continuation_replacement_guard.sql`](../../supabase/migrations/202607300009_schedule_continuation_replacement_guard.sql) | A, C, H, I | Phase 5.G.2.4.7.3 started-Track identity from Studied, Practiced, or delivered work; continuing-Version immutability; untouched-Track adjustment; and explicit complete-replacement history boundary |
| [`202607300010_course_schedule_practiced_date_reflow.sql`](../../supabase/migrations/202607300010_course_schedule_practiced_date_reflow.sql) | A, C, H, I | Phase 5.G.2.4.7.3.1 initial continuation authority split: Studied and then-delivered exact locks, retained Practiced identity with future cadence reflow, and unchanged historical-item protection |
| [`202607300011_course_schedule_builder_cadence_persistence.sql`](../../supabase/migrations/202607300011_course_schedule_builder_cadence_persistence.sql) | A, C, H, I | Phase 5.G.2.4.7.3.1.1 validated Builder name/timezone/cadence persistence, direct-publisher inheritance fallback, and receipt-based correction of already-affected Versions |
| [`202607310002_course_schedule_delivery_target_reflow.sql`](../../supabase/migrations/202607310002_course_schedule_delivery_target_reflow.sql) | A, C, H, I | Phase 5.G.2.4.7.3.1.2 delivered-occurrence history separated from Studied target locking, with unfinished future target cadence reflow and unchanged started-Track protection |
| [`202607310003_combined_cadence_and_student_calendar_parity.sql`](../../supabase/migrations/202607310003_combined_cadence_and_student_calendar_parity.sql) | A, C, H, I | Phase 5.G.2.4.7.3.1.3 one definitive cross-Track cadence lane plus exact Student/Tutor/Mentor current active-Version Calendar event parity |
| [`202607310011_course_schedule_frontend_future_lane.sql`](../../supabase/migrations/202607310011_course_schedule_frontend_future_lane.sql) | A, C, H, I | Phase 5.G.2.4.7.3.1.5 complete frontend-calculated stable-identity future lane, strict server validation, immutable exact-slot materialization, and rejection of inherited stale weekdays or cadence vacancies |

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
| Authoritative Course Schedule structure, versions, reasons, concurrency, Session/resource identity, or progress | `npm run test:course-schedule`, `npm run test:course-dates`, `npm run test:schedule-editing`, `npm run test:schedule-sources`, `npm run test:schedule-progress`, `npm run test:schedule-aggregation`, affected DB characterizations |
| Adaptive/Static pacing, recurring meeting holds, or recurring Courses awaiting a meeting pattern | `npm run test:schedule-slot-generation`, `npm run test:schedule-target-mapping`, `npm run test:schedule-pacing`, `npm run test:schedule-effective`, affected DB characterizations |
| Multi-curriculum Course coverage, Builder traversal/preload, selected Goals, primary/supporting Tracks, retained source recovery, canonical target uniqueness, or Version backfill | `npm run test:schedule-coverage`, `npm run test:schedule-version-coverage`, `npm run test:schedule-multi-branch`, `npm run test:schedule-classroom-preload`, `npm run test:schedule-builder-adapter`, `npm run test:schedule-consumer-parity`, affected DB characterization |
| Multi-curriculum Classroom Home, Course progress, weekly work windows, Assignment destinations, or Track-qualified module colors | `npm run test:classroom-home`, `npm run test:classroom-schedule`, `npm run test:schedule-consumer-projection`, `npm run test:schedule-consumer-parity`, affected DB characterization |
| Shared persistence/adapters | `npm run test:adapters` plus the affected domain provider test |
| Student Classroom Cards, collections, or historical entry | `npm run test:student-dashboard`, `npm run test:student-classrooms`, affected DB characterizations |
| Mentor Classroom management entry or authority | `npm run test:classroom-management`, `npm run test:student-classrooms`, affected DB characterizations |
| Persistent Classroom Overview or linked Schedule summary | `npm run test:classroom-overview`, `npm run test:classroom-management`, affected DB characterizations |
| Persistent Classroom navigation, planned areas, or live-tool boundary | `npm run test:classroom-navigation`, `npm run test:classroom-overview`, affected DB characterizations |
| Private Classroom Files authority, Storage access, retention, or moderation | `npm run test:classroom-files`, `npm run test:classroom-navigation`, affected DB characterizations |
| Private Classroom Files interface, upload, signed links, or responsive actions | `npm run test:classroom-files-ui`, `npm run test:classroom-files`, affected DB characterizations |
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
