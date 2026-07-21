# Chunk A — Identity and authorization

## Purpose

These cases protect sign-up, authentication, cumulative roles, capability derivation, role administration, primary-workspace selection, profile hardening, and the trusted first-administrator bootstrap.

## Shared setup

- Environment: `LOCAL-SUPABASE` unless a case explicitly permits `LOCAL-STATIC`.
- Apply all migrations from a clean disposable database before the first formal live run.
- Resolve the symbolic actors in [`authorization-standard-actors-v1.json`](../fixtures/authorization-standard-actors-v1.json) to synthetic local accounts without writing credentials into the repository.
- Record the migration head, source revision, Supabase project/ref, and reset status in `TEST_RUN_LOG.md`.
- Use a transaction with rollback for direct SQL characterization where possible.

## Cases

### AUTH-001 — Public sign-up always begins as student

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | NORMAL, AUTHN, AUTHZ, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prove that public account creation cannot grant tutor, mentor, administrator, or arbitrary roles through UI fields or user metadata.

#### Actors and fixtures

- `ACT-NEW-SIGNUP`, starting with no account.
- The standard actor fixture defines only the expected alias; credentials are generated during setup.

#### Preconditions

1. The email alias does not already exist.
2. Profile and role-seeding triggers from the current authorization migration are installed.

#### Actions and expected outcomes

| Step | Actor action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Submit ordinary public sign-up. | Account creation succeeds or requests email confirmation according to local auth configuration. | `profiles.role = student`; one active primary `user_roles` row exists for `student` with source `signup`. |
| 2 | Repeat through an SDK request that includes `role: admin` and other privileged role metadata. | Metadata may be stored only as non-authoritative auth metadata; it does not open an admin workspace. | Profile and active role remain `student`; no privileged `user_roles` row or capability is created. |
| 3 | Call `get_my_authorization` as the new user. | Student workspace is selected. | Roles contain only `student`; capabilities are the server-seeded student capability set. |

#### Forbidden outcomes

- Public metadata creates or activates `tutor`, `mentor`, or `admin`.
- The new account receives `authorization.manage`, review, publication, taxonomy, or course-assignment capabilities.

#### Cleanup

Delete the synthetic auth account through the trusted local administration path, or rely on the documented disposable database reset.

#### Evidence and related artifacts

- Minimum evidence: E3 for profile, role, and capability assertions.
- Migration: `supabase/migrations/202607180003_multi_role_authorization.sql`.
- Static coverage: `npm run test:authorization`.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`, `INV-OWN-001`, `INV-TEST-001`.

### AUTH-002 — Anonymous users cannot open protected workspaces or authorization RPCs

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHN, AUTHZ, UI |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure a missing session cannot reveal protected pages or execute authorization and content-management operations.

#### Preconditions and actors

- No authenticated browser session.
- No bearer token in the direct RPC client.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Navigate directly to each role dashboard and one capability-protected page. | The page redirects to `/src/app/signUp/login.html` and protected content does not initialize. | No protected read/write occurs. |
| 2 | Call `get_my_authorization` anonymously. | A handled authentication error is returned. | Function raises `Authentication is required to load authorization.` |
| 3 | Call role grant, role revoke, taxonomy, review, and course-assignment RPC examples anonymously. | Calls fail without creating state. | Capability/authentication checks reject the calls; audit/content rows are unchanged. |

#### Forbidden outcomes

- Cached role hints or route parameters authorize a protected action.
- Anonymous failure creates an authorization event or changes a resource.

#### Cleanup and evidence

- Cleanup: none beyond closing the anonymous session.
- Minimum evidence: E3 for RPC denial and E2 for one representative redirect.
- Invariants: `INV-AUTH-002`, `INV-SCOPE-001`.

### AUTH-003 — Effective authorization is the union of all active roles

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prove that multi-role users retain every capability granted by their active roles without receiving capabilities from roles they do not hold.

#### Actors

- `ACT-STUDENT-TUTOR`.
- `ACT-TUTOR-MENTOR`.

#### Preconditions

Role rows match the fixture and no extra role is active for either actor.

#### Actions and expected outcomes

| Step | Actor action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | `ACT-STUDENT-TUTOR` loads authorization. | Student and tutor workspaces are available. | Roles are exactly `student` and `tutor`; capabilities include student practice plus tutor authoring/submission capabilities. |
| 2 | The same actor checks mentor/admin actions. | Mentor/admin tools are unavailable. | No review, publication, taxonomy-management, course-assignment, or authorization-management capability is returned. |
| 3 | `ACT-TUTOR-MENTOR` loads authorization. | Tutor and mentor workspaces are available. | Capabilities are the distinct union of tutor and mentor mappings, including review/publication/course composition but excluding administrator-only authorization/taxonomy management. |
| 4 | Reload authorization after changing only the primary role. | Workspace preference changes; capability-driven tools remain available. | Role and capability arrays are unchanged apart from `primaryRole`. |

#### Forbidden outcomes

- Selecting a workspace discards capabilities from another active role.
- Duplicate role rows cause duplicate capability keys.
- A multi-role actor receives `authorization.manage` without `admin` or an explicitly mapped role.

#### Cleanup and evidence

- Restore fixture primary roles if changed.
- Minimum evidence: E3 from `get_my_authorization` and protected RPC probes.
- Static coverage: `npm run test:authorization`.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`, `INV-SCOPE-001`.

### AUTH-004 — Explicit database authorization is never expanded by legacy fallback

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHZ, RECOVERY |
| Automation | AUTOMATED |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure an explicit server response containing an empty or restricted capability list is respected instead of being expanded from the legacy profile-role hint.

#### Preconditions

Use the authorization domain with a database-source payload and a legacy role that would normally have broader compatibility capabilities.

#### Actions and expected outcomes

| Step | Action | Expected client result | Expected database result |
| --- | --- | --- | --- |
| 1 | Normalize `{ roles: ['mentor'], primaryRole: 'mentor', capabilities: [] }` with legacy role `mentor`. | Source remains `database`; capability array remains empty. | Not applicable. |
| 2 | Check `exam.review`, `form.publish`, and `course.assign`. | Every check returns false. | Not applicable. |

#### Forbidden outcomes

- Client compatibility logic invents capabilities when the server supplied an explicit array.

#### Cleanup and evidence

- Cleanup: none.
- Required evidence: E3 from `npm run test:authorization`.
- Invariants: `INV-AUTH-002`, `INV-SCOPE-001`.

### AUTH-005 — Primary role can be selected only from active held roles

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent users from selecting an unassigned workspace role or using primary-role state as a privilege escalation.

#### Actor

`ACT-STUDENT-TUTOR`, initially primary `student`.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Call `set_my_primary_role('tutor')`. | Tutor becomes the preferred workspace. | Exactly the active tutor row becomes primary; `profiles.role` is updated as a compatibility hint; a `primary_selected` event is appended. |
| 2 | Call `set_my_primary_role('admin')`. | An error is shown and no navigation occurs. | RPC raises `The selected workspace role is not assigned to this user.`; primary role and events remain unchanged by the rejected call. |
| 3 | Reload authorization. | Tutor remains primary. | Roles/capabilities remain the same union as before the switch. |

#### Forbidden outcomes

- An inactive, revoked, unknown, or merely requested role becomes primary.
- Primary selection grants that role's capabilities when no active role row exists.

#### Cleanup and evidence

- Restore primary role to `student` through the same RPC.
- Minimum evidence: E3 for role rows/event/capability union and E2 for error feedback.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`.

### AUTH-006 — Only authorization administrators can grant roles

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Protect privileged role assignment and its audit trail from self-service or mentor/tutor misuse.

#### Actors

- Grantor: `ACT-ADMIN`.
- Unauthorized callers: `ACT-TUTOR`, `ACT-MENTOR`, and `ACT-ROLE-TARGET`.
- Target: `ACT-ROLE-TARGET`, initially student-only.

#### Actions and expected outcomes

| Step | Actor action | Expected client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Each unauthorized caller attempts to grant `tutor` to the target. | Each call fails. | No role/event change; RPC reports authorization administrator requirement. |
| 2 | `ACT-ADMIN` grants `tutor` with a reason and without making it primary. | Operation succeeds. | Active tutor row records admin source/grantor; student remains primary; one `granted` event contains actor, target, role, and reason. |
| 3 | `ACT-ADMIN` regrants the role after a controlled revocation. | Operation succeeds. | Existing row becomes active and receives a `regranted` event without creating duplicate `(user, role)` rows. |
| 4 | Administrator requests an unknown role or missing target. | Operation fails clearly. | No role/event change. |

#### Forbidden outcomes

- A mentor's trusted content privileges imply `authorization.manage`.
- Client-supplied grantor, source, or event actor overrides server identity.

#### Cleanup and evidence

- Return target to student-only using `AUTH-007` rules.
- Minimum evidence: E3 for denied calls, role row, uniqueness, and audit events.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-HISTORY-001`.

### AUTH-007 — Role revocation preserves a valid primary role and audit history

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY, RECOVERY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure only administrators revoke roles, no account loses every role, and primary-workspace state remains valid.

#### Actors

`ACT-ADMIN`, unauthorized `ACT-MENTOR`, and `ACT-ROLE-TARGET` with active `student` plus primary `tutor` prepared by `AUTH-006`.

#### Actions and expected outcomes

| Step | Actor action | Expected client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | `ACT-MENTOR` tries to revoke tutor. | Call fails. | No role/event change. |
| 2 | `ACT-ADMIN` revokes the primary tutor role with a reason. | Operation succeeds. | Tutor row becomes revoked with server actor/time; student becomes the deterministic replacement primary; profile hint changes to student; one `revoked` event is appended. |
| 3 | `ACT-ADMIN` attempts to revoke the target's last active student role. | Call fails. | RPC reports that a user must retain at least one role; student remains active and primary. |
| 4 | Administrator tries to revoke an inactive or unheld role. | Call fails clearly. | No extra event or mutation. |

#### Forbidden outcomes

- Revocation deletes the historical grant/revoke row or authorization events.
- A user is left with zero active roles or a revoked primary role.

#### Cleanup and evidence

- Target ends student-only, matching fixture setup.
- Minimum evidence: E3 for permission denials, replacement selection, timestamps, and event history.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`, `INV-HISTORY-001`.

### AUTH-008 — First administrator is bootstrapped only through a trusted path

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHN, AUTHZ, PERSISTENCE |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prove the deployment can establish its first administrator without exposing a public bootstrap or depending on an administrator that does not yet exist.

#### Preconditions

1. Clean disposable database with migrations applied.
2. No active account currently has `authorization.manage`.
3. A synthetic bootstrap target has signed up and therefore holds only student.

#### Actions and expected outcomes

| Step | Action | Expected client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Attempt public sign-up and authenticated self-RPC promotion to admin. | Both paths fail to produce admin access. | No active admin role is created. |
| 2 | Use an explicitly reviewed migration/service-role operation to grant the bootstrap target admin and make it primary. | Not performed through public UI. | Admin role is active/primary with a trusted source and auditable bootstrap context. |
| 3 | Sign in as the bootstrapped actor and call authorization management. | Admin dashboard and role-management capability are available. | `get_my_authorization` includes admin and `authorization.manage`; protected grant RPC succeeds for a synthetic target. |

#### Forbidden outcomes

- An anon/authenticated public endpoint can bootstrap admin.
- A hard-coded production user/email is embedded in a migration or repository fixture.

#### Cleanup and evidence

- The local database may retain `ACT-ADMIN` for the remaining acceptance run, then be reset.
- Minimum evidence: E3 for failed public paths and trusted resulting role/capability state.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-TEST-001`.

### AUTH-009 — Authenticated clients cannot rewrite profile identity or role hints

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent profile updates from becoming a side door for changing account identity, email, roles, or authorization.

#### Actor

`ACT-STUDENT` updating their own profile row through the authenticated client.

#### Actions and expected outcomes

| Step | Action | Expected client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Update allowed `full_name` and `birth_date`. | Update succeeds and reload displays the values. | Only those columns change. |
| 2 | Attempt to change `id`, `email`, or `role` directly. | Update is denied. | Identity/role columns and `user_roles` remain unchanged. |
| 3 | Attempt direct insert/update of role/capability mapping tables. | Operation is denied. | No authorization rows or events are created. |

#### Forbidden outcomes

- Changing `profiles.role` or user metadata grants a role/capability.
- A profile update can impersonate another auth user.

#### Cleanup and evidence

- Restore the synthetic display name/birth date if the fixture requires fixed values.
- Minimum evidence: E3 for allowed-column and denied-column/table assertions.
- Static coverage: `npm run test:authorization`.
- Invariants: `INV-AUTH-002`, `INV-OWN-001`, `INV-SCOPE-001`.

### AUTH-010 — Legacy fallback is limited, labeled, and never overrides explicit server denial

| Field | Value |
| --- | --- |
| Chunk | A — Identity and authorization |
| Priority | P1 |
| Coverage | AUTHZ, RECOVERY |
| Automation | AUTOMATED |
| Environment | LOCAL-STATIC |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Keep transitional compatibility usable during migration rollout without turning profile hints into unrestricted administrator access.

#### Actions and expected outcomes

| Step | Action | Expected client result | Expected database result |
| --- | --- | --- | --- |
| 1 | Normalize no authorization payload with legacy mentor. | Source is labeled `legacy-profile`; only the documented mentor compatibility capabilities are present. | Not applicable. |
| 2 | Check administrator-only `authorization.manage`. | Capability is absent. | Not applicable. |
| 3 | Normalize an explicit database payload with empty capabilities. | Source is `database` and remains empty as protected by `AUTH-004`. | Not applicable. |
| 4 | Supply malformed/unknown legacy role. | Role normalizes safely to the defined fallback behavior without creating arbitrary capabilities. | Not applicable. |

#### Forbidden outcomes

- Compatibility derives capabilities for arbitrary role strings.
- A server-provided restriction is replaced by legacy-role capabilities.

#### Cleanup and evidence

- Cleanup: none.
- Required evidence: E3 from `npm run test:authorization`.
- Invariants: `INV-AUTH-002`, `INV-SCOPE-001`.

## Phase 3 execution note

These cases are now canonical but have not yet been recorded as a formal run. `AUTH-004` and `AUTH-010` have complete existing automated characterizations; other cases retain live assertions that must be executed after the disposable Supabase reset.
