# Acceptance fixtures

## Purpose

This folder holds deterministic, synthetic inputs shared by cross-feature acceptance cases. Builder-specific fixtures may remain beside their builders when that location makes ownership clearer; the central catalog links to them rather than duplicating them.

## Fixture requirements

Every fixture must:

- use fictional people, organizations, content, and responses;
- avoid credentials, access tokens, service-role keys, production UUIDs, and real student information;
- declare a schema name and version when it is machine-readable;
- use stable symbolic aliases that can be mapped to fresh local UUIDs;
- state whether IDs must be preserved, regenerated, or resolved during setup;
- state its intended starting lifecycle status;
- describe expected ownership, roles, capabilities, and relationships separately;
- identify the test IDs that consume it;
- be deterministic and safe to recreate;
- define cleanup or transaction/rollback expectations.

## Suggested naming

```text
<domain>-<purpose>-v<schema-version>.<json|sql|md>
```

Examples:

- `authorization-standard-actors-v1.json`
- `relationships-linked-household-v1.json`
- `course-practice-central-journey-v1.json`

Filenames should describe behavioral purpose, not the date of one execution.

## Identity rules

- Documentation aliases such as `ACT-STUDENT` are stable.
- Database UUIDs are environment-specific unless a rollback-only database characterization deliberately uses fixed test UUIDs.
- [`local-supabase-actor-map-v1.json`](./local-supabase-actor-map-v1.json) deliberately reserves fixed UUIDs for the disposable `kelptutoring.com-main` local Auth environment; they must never be reused as hosted or production identities.
- Import-as-copy tests must assert new identities rather than overwriting fixture identities.
- Provenance fields may refer to symbolic fixture identities, but must never grant authorization.

## Existing reusable fixtures

- [`authorization-standard-actors-v1.json`](./authorization-standard-actors-v1.json) defines the standard symbolic accounts used by identity, authorization, and workspace cases.
- [`local-supabase-actor-map-v1.json`](./local-supabase-actor-map-v1.json) resolves those eight aliases to synthetic local Auth UUIDs, emails, exact roles, and primary roles without storing credentials.
- [`content-lifecycle-standard-scenarios-v1.json`](./content-lifecycle-standard-scenarios-v1.json) composes symbolic form/exam owners, reviewers, respondents, and lifecycle resources while referencing the builder-owned content fixtures below.
- [`curriculum-question-bank-standard-scenarios-v1.json`](./curriculum-question-bank-standard-scenarios-v1.json) defines symbolic canonical paths, governance proposals, and reusable-question classifications while resolving environment IDs during setup.
- [`course-composition-standard-scenarios-v1.json`](./course-composition-standard-scenarios-v1.json) composes approved symbolic source references into empty and populated course drafts with a five-level difficulty progression.
- [`course-practice-standard-scenarios-v1.json`](./course-practice-standard-scenarios-v1.json) joins a student schedule, approved course, immutable delivery/grading snapshots, and repeatable automatic/pending-review response sets.
- `src/app/exam-builder/test-fixtures/exam-builder-comprehensive-test.json`
- `src/app/form-builder/test-fixtures/comprehensive-five-phase-template.json`
- `src/app/form-builder/test-fixtures/routing-cases.json`

Do not duplicate these centrally unless a cross-feature fixture genuinely needs a frozen independent version.

## Review checklist

Before committing a fixture, verify:

- it contains no secrets or personal information;
- it is parseable and schema-valid;
- its expected copy/identity behavior is documented;
- it does not depend on row ordering, current time, or an existing local account unless explicitly resolved during setup;
- its consuming cases and cleanup path exist.
