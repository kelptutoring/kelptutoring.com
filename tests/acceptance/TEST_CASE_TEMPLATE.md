# Acceptance test case template

Use this template when adding a case to [`TEST_REFERENCE.md`](./TEST_REFERENCE.md) or a future chunk file. Remove instructional placeholders, but retain every information category. Adjacent categories such as actors/fixtures/preconditions or cleanup/evidence may share a heading when the combination remains unambiguous and no required information is omitted. Write observable outcomes rather than implementation wishes.

```markdown
### TEST-ID — Concise behavioral title

| Field | Value |
| --- | --- |
| Chunk | Named chunk |
| Priority | P0 / P1 / P2 / P3 |
| Coverage | NORMAL, AUTHZ, PERSISTENCE, ... |
| Automation | MANUAL / CANDIDATE / PARTIAL / AUTOMATED |
| Environment | LOCAL-STATIC / LOCAL-SUPABASE / STAGING / ... |
| Status | Active / Draft / Retired |
| Created | YYYY-MM-DD |
| Last revised | YYYY-MM-DD |

#### Purpose and protected risk

State the single behavioral promise and what failure could harm, expose, corrupt, confuse, or block.

#### Dependencies

- Required migrations, services, feature flags, pages, or external tools.
- Use `None` when the case is self-contained.

#### Actors and authorization

| Actor alias | Roles | Primary role | Required capabilities | Required relationships |
| --- | --- | --- | --- | --- |
| ACT-... | ... | ... | ... | Explicit link or `None` |

Do not infer a relationship from a role.

#### Fixtures

- List fixture names, stable symbolic IDs, and the state they must represent.
- State whether importing creates a new copy or preserves an existing identity.

#### Preconditions

1. Describe the verified starting state.
2. Include ownership, lifecycle state, prior submissions/attempts, and migration state when relevant.
3. Do not hide setup actions that could make the test pass accidentally.

#### Actions and expected outcomes

| Step | Actor action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Observable action | Visible result or `Not applicable` | Persisted/denied result or `Not applicable` |

#### Forbidden outcomes

- State what must never happen: unauthorized visibility, answer-key delivery, identity reuse, historical mutation, silent data loss, or unsafe deletion.

#### Persistence and reload checks

- State what must remain after reload, another session, source edits, archive, deletion, or relationship changes.
- Use `Not applicable` only when the behavior genuinely has no persistence boundary.

#### Cleanup

1. Describe rollback, fixture deletion, status restoration, or local reset requirements.
2. State which historical records intentionally remain immutable.

#### Evidence requirements

| Assertion | Minimum strength | Suggested artifact |
| --- | --- | --- |
| Central assertion | E0/E1/E2/E3 | Screenshot, RPC output, SQL assertion, automated report, etc. |

#### Related artifacts

- Pages:
- Domain/adapters:
- Migrations/RPCs:
- Fixtures:
- Automated runner:
- Related test IDs:
- Defects/decisions:

#### Revision notes

| Date | Change | Reason |
| --- | --- | --- |
| YYYY-MM-DD | Initial case | — |
```

## Quality check before accepting a case

A new case is ready only when:

- its ID is unique and semantically appropriate;
- its purpose protects one coherent promise;
- actors, roles, capabilities, ownership, and relationships are explicit;
- preconditions can be reproduced;
- steps are ordered and observable;
- expected UI and server/database results are separated;
- at least one forbidden outcome is considered for P0/P1 behavior;
- cleanup is safe and complete;
- evidence expectations match the risk;
- existing automation and fixtures are linked rather than copied unnecessarily;
- ambiguity is recorded as an open decision, not silently resolved by the writer.

## Retirement and replacement

Do not delete a case that appears in an execution log. Mark it `Retired`, explain why, and link its replacement IDs. A product decision may change accepted behavior, but the revision history must preserve what changed and when.
