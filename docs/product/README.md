# Kelp product documentation

## Current source of truth

[Current product contract](product-contract.md) is the concise, living reference for product terminology, settled business rules, implementation principles, and the vertical implementation roadmap.

It intentionally contains only decisions that affect current implementation. When a feature reaches analysis, unresolved details are decided in that feature's implementation phase and added to the contract only if they remain useful across features.

## Historical material

The former phase-by-phase contracts, cumulative glossary, early system overview, and early backend roadmap are preserved in [historical](historical/README.md).

Historical documents explain how decisions were reached, but they are not an implementation checklist and do not override the current product contract. A historical rule that is absent from the current contract should be treated as background or deferred until the relevant feature is analyzed.

## Delivery model

Each product phase is a vertical slice:

1. Analysis.
2. Schema and row-level security.
3. Server-side behavior.
4. Frontend enhancement.
5. Tests.
6. Concise documentation.

The active product flow is:

1. Profile and configuration.
2. Dashboard.
3. Classroom cards and persistent Classroom environment.
4. Classroom Forum, schedule, and history.
5. Calendar, scheduling, and booking credit analysis.
6. Live Class forms, attendance, credit outcomes, and history.
7. Forms and Exams.
8. Assignments and Report Cards.
9. Course Builder when its authoring workflow is ready.

The detailed implementation phases and completion rules live in the [current product contract](product-contract.md#implementation-roadmap). The Student Dashboard's canonical Phase 2.A–2.F delivery sequence is retained in the [Phase 2 delivery slices](product-contract.md#phase-2-delivery-slices), and the Student Classroom membership/Card sequence is retained in the [Phase 3 delivery slices](product-contract.md#phase-3-delivery-slices).

## Existing technical references

- [Acceptance testing](../../tests/acceptance/README.md)
- [Multi-role authorization](../../src/auth/AUTHORIZATION.md)
- [Student Profile and Configuration](../../src/app/profile/README.md)
- [Dashboard workspaces](../../src/app/dashboard/README.md)
- [Classroom lifecycle surfaces and live-lesson prototype](../../src/app/classroom/README.md)
- [Shared backend adapters](../../src/app/shared/BACKEND_ADAPTERS.md)
