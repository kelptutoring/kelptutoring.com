# Chunk F — Curriculum governance

## Purpose

These cases protect Kelp's canonical degree → subject → track → topic hierarchy, arbitrary topic depth, proposal governance, manager-only mutations, audit history, and safe archival. Reusable-question eligibility is defined separately in [`CHUNK-F-QUESTION-BANK.md`](./CHUNK-F-QUESTION-BANK.md).

## Shared setup

- Use actors from [`authorization-standard-actors-v1.json`](../fixtures/authorization-standard-actors-v1.json) and taxonomy paths/proposals from [`curriculum-question-bank-standard-scenarios-v1.json`](../fixtures/curriculum-question-bank-standard-scenarios-v1.json).
- Database cases require migrations through `202607180005_curriculum_taxonomy.sql` on disposable `LOCAL-SUPABASE`.
- Resolve aliases to fresh environment IDs; fixture aliases never authorize access.

## Cases

### CURR-001 — Canonical hierarchy accepts arbitrary topic depth and remains deterministically ordered

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P1 |
| Coverage | NORMAL, PERSISTENCE, INTEGRATION |
| Automation | AUTOMATED |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Preserve precise academic paths without imposing an artificial subtopic-depth limit or producing unstable navigation order.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Build the fixture forest. | Root order uses `sortOrder`, then name; children follow the same rule. |
| 2 | Inspect `PATH-HS-PHYSICS-VELOCITY`. | Path is degree → subject → track → topic → topic → topic → topic. |
| 3 | Flatten active nodes, then include archived nodes. | Depth/path labels are complete; archived nodes appear only when requested. |

#### Forbidden outcomes

- A topic cannot contain another topic.
- Ordering depends on database row arrival or environment IDs.

#### Cleanup and evidence

- No persisted cleanup.
- Required evidence: E3 from `npm run test:curriculum`.
- Invariants: `INV-ORDER-001`, `INV-TEST-001`.

### CURR-002 — A mentor may propose but cannot directly create a canonical node

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P0 |
| Coverage | AUTHZ, NORMAL, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Keep mentor expertise available while preventing `taxonomy.propose` from becoming canonical-taxonomy authority.

#### Actors and preconditions

- Proposer: `ACT-MENTOR`; canonical manager: `ACT-ADMIN`.
- `PROPOSAL-PROJECTILE-MOTION` does not exist yet and its parent is active.

#### Actions and expected outcomes

| Step | Actor action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Mentor submits the proposal. | Pending proposal is visible to its proposer. | Server derives proposer, slug, pending state, timestamps, and emits a proposed event. |
| 2 | Mentor invokes canonical create/update/archive RPCs. | Action is unavailable or fails clearly. | Capability check denies every mutation; taxonomy is unchanged. |

#### Forbidden outcomes

- Client-provided proposer/reviewer/status becomes authoritative.
- Proposal creation inserts a canonical node immediately.

#### Cleanup and evidence

- Roll back or reset the pending proposal/event.
- Minimum evidence: E3 for capability and persisted state; related checks `npm run test:curriculum`, `npm run test:authorization`.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-SCOPE-001`.

### CURR-003 — Proposal and taxonomy-event visibility remains scoped

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P0 |
| Coverage | AUTHZ, BOUNDARY, PERSISTENCE |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent an authenticated user from reading another proposer's governance queue or administrator audit stream.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | `ACT-MENTOR` lists proposals. | Own proposals are visible. |
| 2 | Another non-manager lists proposals. | Mentor's proposals are absent. |
| 3 | `ACT-ADMIN` lists proposals and events. | All proposals and taxonomy events are visible. |
| 4 | Student/mentor reads event table directly. | RLS denies/filters all event rows without `taxonomy.manage`. |

#### Forbidden outcomes

- Authentication alone reveals proposal or event history.
- Browser filtering is the only privacy boundary.

#### Cleanup and evidence

- Roll back synthetic proposals/events.
- Required evidence: E3 RLS assertions from the curriculum DB characterization.
- Invariants: `INV-AUTH-002`, `INV-SCOPE-001`.

### CURR-004 — Administrator approval atomically creates one canonical node and closes the proposal

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P0 |
| Coverage | NORMAL, AUTHZ, PERSISTENCE, IMMUTABILITY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure approval cannot create an orphan node, duplicate node, or proposal state that disagrees with the canonical tree.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Admin approves `PROPOSAL-PROJECTILE-MOTION`. | One active topic is created beneath its verified active parent. |
| 2 | Reload proposal. | Status is approved with reviewer, decision time, and `appliedNodeId`; source proposal and node cross-reference each other. |
| 3 | Inspect events and repeat decision. | One approval event exists; a second decision is denied and creates nothing. |

#### Forbidden outcomes

- Partial commit leaves approved proposal without its node or node without decision history.
- Reviewer identity or applied node ID is trusted from the client.

#### Cleanup and evidence

- Use transaction rollback; do not delete an executed governance event independently.
- Minimum evidence: E3 atomic RPC/database assertions.
- Invariants: `INV-OWN-001`, `INV-HISTORY-001`, `INV-RETRY-001`.

### CURR-005 — Rejection requires notes, creates no node, and cannot be redone

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P1 |
| Coverage | BOUNDARY, PERSISTENCE, IMMUTABILITY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Preserve a useful and auditable negative decision without polluting the canonical tree.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Admin rejects a pending proposal without notes. | Decision is denied; proposal remains pending. |
| 2 | Admin rejects with notes. | Proposal becomes rejected with reviewer/time/notes; rejection event is appended; no node is created. |
| 3 | Attempt another decision. | Denied because only pending proposals can be decided. |

#### Forbidden outcomes

- Rejected proposal has an applied node.
- Later actions rewrite the original decision or notes.

#### Cleanup and evidence

- Roll back the synthetic decision or retain it only in an explicitly disposable run.
- Minimum evidence: E3 decision and no-node assertions.
- Invariants: `INV-HISTORY-001`, `INV-RETRY-001`.

### CURR-006 — Only taxonomy managers can create, rename, reorder, or archive canonical nodes

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prove canonical mutations depend on `taxonomy.manage`, not dashboard access, proposer status, or direct table grants.

#### Actions and expected outcomes

| Step | Actor action | Expected result |
| --- | --- | --- |
| 1 | Student, tutor, and mentor invoke each mutation RPC. | Each request is denied; no rows/events change. |
| 2 | Admin creates and updates a synthetic leaf. | Server derives creator/approver/timestamps, normalizes slug, saves order, and appends events. |
| 3 | Any authenticated actor attempts direct insert/update/delete. | Table grants/RLS prevent the mutation. |

#### Forbidden outcomes

- A role name is accepted without the required capability.
- Update replaces stable node ID or reparents the node implicitly.

#### Cleanup and evidence

- Archive/rollback the synthetic leaf and events.
- Minimum evidence: E3 capability and direct-table denial assertions.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-ID-001`.

### CURR-007 — Active sibling names/slugs and pending proposals cannot be duplicated

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P1 |
| Coverage | BOUNDARY, PERSISTENCE, RECOVERY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent ambiguous paths and duplicate review work while allowing the same subject label beneath different degrees.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Propose/create a normalized duplicate under the same parent. | Denied with no extra proposal/node/event. |
| 2 | Submit the same pending proposal twice. | Second request is denied; one pending proposal remains. |
| 3 | Use the same label under a different valid parent. | Allowed because the complete path remains distinct. |

#### Forbidden outcomes

- Case/spacing/punctuation produces duplicate active sibling slugs.
- A unique violation leaves partial governance history.

#### Cleanup and evidence

- Roll back accepted cross-parent fixture rows.
- Minimum evidence: E3 uniqueness and rollback assertions.
- Invariants: `INV-RETRY-001`, `INV-ORDER-001`.

### CURR-008 — Archival proceeds leaf-first and preserves stable taxonomy history

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P0 |
| Coverage | PERSISTENCE, IMMUTABILITY, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Remove obsolete choices from future authoring without orphaning descendants or rewriting historical paths.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Archive a node with an active child. | Denied with instruction to archive active children first. |
| 2 | Archive the synthetic leaf. | Same node ID becomes archived with timestamp and archival event. |
| 3 | Reload as ordinary actor and manager. | Ordinary list omits it; manager can include archived nodes and audit data. |

#### Forbidden outcomes

- Archive hard-deletes node/proposal/event rows.
- Parent archive silently cascades into children.

#### Cleanup and evidence

- Prefer transaction rollback; otherwise leave the synthetic node archived rather than deleting history.
- Minimum evidence: E3 lifecycle/RLS assertions and E2 tree state.
- Invariants: `INV-LIFE-001`, `INV-HISTORY-001`, `INV-SOURCE-001`.

### CURR-009 — Parent type and active-state constraints reject invalid paths

| Field | Value |
| --- | --- |
| Chunk | F — Curriculum governance |
| Priority | P0 |
| Coverage | BOUNDARY, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent structurally invalid or inactive paths from becoming canonical through either direct creation or proposal approval.

#### Actions and expected outcomes

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Create/propose a non-degree root. | Denied. |
| 2 | Put track below degree, subject below subject, or non-topic below track/topic. | Denied by the same server hierarchy rule. |
| 3 | Create/propose below an archived or missing parent. | Denied; no proposal/node/event persists. |
| 4 | Archive a proposal's parent before approval, then approve. | Approval revalidates and fails without changing pending proposal. |

#### Forbidden outcomes

- Client-side allowed-child controls are the only constraint.
- Approval trusts hierarchy validity from proposal-submission time.

#### Cleanup and evidence

- Roll back archived-parent setup.
- Minimum evidence: E3 RPC assertions; related check `npm run test:curriculum`.
- Invariants: `INV-AUTH-002`, `INV-SOURCE-001`, `INV-TEST-001`.

## Phase 5 execution note

These cases define the governance contract; existing static checks cover hierarchy, adapters, pages, and migration shape. The role/RLS, atomic decision, uniqueness, and archive cases still require the planned clean local Supabase run before they can receive formal outcomes.
