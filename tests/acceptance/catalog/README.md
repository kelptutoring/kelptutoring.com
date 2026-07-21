# Acceptance catalog chunks

This folder contains detailed cases that extend `TEST_REFERENCE.md`. The reference defines shared actors, scales, invariants, and chunk boundaries; these files define the executable-quality cases.

## Current catalog

- [`CHUNK-A-IDENTITY-AUTHORIZATION.md`](./CHUNK-A-IDENTITY-AUTHORIZATION.md) — sign-up, authentication, multi-role capabilities, role lifecycle, and administrator bootstrap.
- [`CHUNK-B-WORKSPACES.md`](./CHUNK-B-WORKSPACES.md) — role-specific dashboards, switching, multi-role navigation, and protected return destinations.
- [`CHUNK-D-FORM-LIFECYCLE.md`](./CHUNK-D-FORM-LIFECYCLE.md) — form copying, routing, respondent details, immutable submissions, print routes, and failure recovery.
- [`CHUNK-E-EXAM-LIFECYCLE.md`](./CHUNK-E-EXAM-LIFECYCLE.md) — exam copying, question classification, content round trips, ordering, grading, PDFs, and lifecycle boundaries.
- [`SHARED-CONTENT-PUBLICATION.md`](./SHARED-CONTENT-PUBLICATION.md) — independent review, privileged direct publication, immutable reviewed copies, and answer-safe delivery boundaries shared by forms and exams.
- [`CHUNK-F-CURRICULUM-GOVERNANCE.md`](./CHUNK-F-CURRICULUM-GOVERNANCE.md) — canonical hierarchy, mentor proposals, administrator decisions, scoped audit history, uniqueness, and archival.
- [`CHUNK-F-QUESTION-BANK.md`](./CHUNK-F-QUESTION-BANK.md) — independent question classification, reviewer confirmation, eligibility, capability-gated retrieval, filtering, and ordering.
- [`CHUNK-G-COURSE-COMPOSITION.md`](./CHUNK-G-COURSE-COMPOSITION.md) — course authorization, curriculum placement, approved-source selection, sequencing, owner persistence, duplication, archival, and assignment boundary.
- [`CHUNK-H-SCHEDULING.md`](./CHUNK-H-SCHEDULING.md) — date-only cadence, outline identity, browser recovery, backend synchronization, ownership, and future relationship-scoped student discovery.
- [`CHUNK-H-ASSIGNMENT-PRACTICE.md`](./CHUNK-H-ASSIGNMENT-PRACTICE.md) — assignment authorization, immutable answer-safe snapshots, student delivery, cancellation, attempts, scoring, retry, and written review.

Chunk C remains deliberately unwritten until tutor–mentor–student relationship policy is designed. Later chunks will be added in their corresponding catalog phases.

## Rules

- Test IDs remain globally unique and are never renumbered.
- Chunk files use the shared `TEST_CASE_TEMPLATE.md` fields.
- Expected behavior belongs here; run outcomes belong in `TEST_RUN_LOG.md`.
- A linked automated script does not imply a recorded pass.
- Cross-chunk cases should reference smaller cases instead of copying their full assertions.
- If a case is retired, preserve it with a replacement link and revision note.
