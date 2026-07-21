# Acceptance automation

## Purpose

This folder will contain executable counterparts to cases defined in the acceptance reference. Phase 1 defines the contract only; it does not move or duplicate existing self-tests.

## Core rule

Automation implements a catalog case; it does not redefine it. Every executable scenario must cite one or more stable test IDs from `TEST_REFERENCE.md`.

`COVERAGE_MAP.md` inventories existing scripts before they are assigned to detailed acceptance cases. Mapping an existing script is not the same as recording a passing execution.

## Automation requirements

An automated case must:

- print or report its acceptance test IDs;
- make setup, action, assertions, and cleanup distinguishable;
- assert forbidden outcomes as well as successful outcomes for security-sensitive behavior;
- use synthetic accounts and data;
- avoid production endpoints by default;
- fail clearly when required migrations or services are unavailable;
- avoid treating an environmental blocker as a passing result;
- use transactions and rollback for database characterizations when possible;
- leave browser storage, files, processes, and database state clean;
- produce concise evidence suitable for a run-log entry;
- retain deterministic behavior across repeated local runs.

## Where automation belongs

Use this folder for orchestration that follows acceptance journeys across domains. Keep focused implementation characterizations under `tools/` when that remains the clearer home.

Examples:

- An RPC/RLS test for one migration may remain in `tools/*-db-self-test.sql`.
- A browser journey that signs in as several actors, reviews content, assigns it, and verifies student delivery may belong here.
- The acceptance reference links both kinds through stable test IDs.

## Suggested structure when automation begins

```text
automation/
├── README.md
├── helpers/
├── auth/
├── content/
├── relationships/
└── journeys/
```

Create subfolders only when real automated cases need them.

## Safety boundaries

- Never embed passwords, tokens, service-role keys, or production identifiers.
- Administrator bootstrap automation must run only against an explicitly selected disposable/local or controlled staging database.
- A database reset command must verify its target before execution.
- Destructive lifecycle tests must target synthetic records created for that run.
- Browser automation must not approve permissions, submit real communications, or upload personal files.

## Promotion checklist

Before marking a catalog case `AUTOMATED`:

1. Confirm every required assertion in the manual case is covered.
2. List any visual or judgment-based assertion that remains manual.
3. Demonstrate one passing run and one meaningful failure when practical.
4. Confirm cleanup after interruption as well as normal completion.
5. Link the runner from the catalog and record the automation revision.
