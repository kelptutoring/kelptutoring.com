# Chunk B — Workspaces and multi-role navigation

## Purpose

These cases protect role-specific dashboards, primary-workspace routing, switching among active roles, capability continuity across workspaces, and safe return navigation from shared tools.

## Shared setup

- Use `LOCAL-SUPABASE` with actors resolved from [`authorization-standard-actors-v1.json`](../fixtures/authorization-standard-actors-v1.json).
- Execute the matching Chunk A authorization case first when a workspace case depends on role or primary-role mutation.
- Clear `kelpDashboardTarget` before cases that verify server-owned primary-role routing; record its value separately when testing the optional browser cache.
- Browser redirects prove navigation behavior only. Pair access-sensitive cases with server authorization evidence from Chunk A.

## Cases

### WORK-001 — Each primary role opens its canonical workspace

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P1 |
| Coverage | NORMAL, AUTHZ, UI |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure each role has a deterministic workspace and users do not enter a more privileged or unrelated dashboard by role normalization accident.

#### Actors

`ACT-STUDENT`, `ACT-TUTOR`, `ACT-TEACHER`, `ACT-MENTOR`, and `ACT-ADMIN` with the fixture primary role.

#### Actions and expected outcomes

| Actor | Expected route | Expected visible identity | Expected server state |
| --- | --- | --- | --- |
| ACT-STUDENT | `/src/app/dashboard/student-dashboard.html` | Student workspace | Primary role `student` |
| ACT-TUTOR | `/src/app/dashboard/tutor-dashboard.html` | Tutor workspace | Primary role `tutor` |
| ACT-TEACHER | `/src/app/dashboard/tutor-dashboard.html` | Teacher workspace label on shared operational surface | Primary role `teacher` |
| ACT-MENTOR | `/src/app/dashboard/mentor-dashboard.html` | Mentor workspace | Primary role `mentor` |
| ACT-ADMIN | `/src/app/dashboard/admin-dashboard.html` | Administrator workspace | Primary role `admin` |

For each actor, sign in through the normal login path, follow automatic routing, and reload the destination once.

#### Forbidden outcomes

- Mentor or administrator is normalized into the tutor dashboard without a separate tutor/teacher role.
- Teacher is rewritten into tutor authorization even though both share one operational page.
- Reload changes the primary role or destination.

#### Cleanup and evidence

- Sign out after each isolated actor check.
- Minimum evidence: E2 for routes/headings and E3 for `get_my_authorization`.
- Static coverage: `npm run test:dashboards`.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`.

### WORK-002 — Workspace switcher lists active held roles only

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P0 |
| Coverage | AUTHZ, UI, BOUNDARY |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prevent navigation from advertising or attempting workspaces the signed-in account does not actively hold.

#### Actors

- `ACT-STUDENT-TUTOR`: expected buttons `student`, `tutor`.
- `ACT-TUTOR-MENTOR`: expected buttons `tutor`, `mentor`.
- `ACT-ADMIN`: expected button `admin` only.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Open each actor's primary dashboard. | Switcher contains exactly the active role set in canonical workspace order; current role is marked `aria-current=page`. | Returned roles match the active `user_roles` rows. |
| 2 | Revoke one non-primary role through `AUTH-007`, then reload. | Revoked workspace button disappears. | Revoked role is absent from `get_my_authorization`. |
| 3 | Inspect the DOM for unheld roles. | No hidden enabled button/link exists for unheld workspaces. | Not applicable. |

#### Forbidden outcomes

- `profiles.role`, local storage, or a stale DOM preserves a revoked/unheld workspace.
- Administrator status implicitly adds student/tutor/mentor switcher buttons.

#### Cleanup and evidence

- Restore fixture roles after the revocation subcase.
- Minimum evidence: E2 for exact switcher controls and E3 for role rows/RPC.
- Static coverage: `npm run test:dashboards`.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`, `INV-SCOPE-001`.

### WORK-003 — Workspace selection persists through reload and later login

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P1 |
| Coverage | NORMAL, PERSISTENCE, RECOVERY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Prove workspace preference is server-owned and survives browser/session transitions without depending exclusively on local storage.

#### Actor

`ACT-STUDENT-TUTOR`, initially primary `student`.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Select Tutor in the switcher. | Busy/status feedback appears, then navigation opens tutor dashboard. | `set_my_primary_role('tutor')` succeeds; only tutor is primary; event is appended. |
| 2 | Reload with browser storage intact. | Tutor dashboard remains open and marks Tutor current. | Primary role remains tutor. |
| 3 | Clear `kelpDashboardTarget`, sign out, and sign in again. | Server authorization routes to tutor dashboard. | Primary role remains tutor; no role/capability change occurs. |
| 4 | Switch back to Student. | Student dashboard opens. | Student becomes primary through the same RPC. |

#### Forbidden outcomes

- Local storage alone determines an unauthorized workspace.
- Switching creates or revokes a role.
- Reload/login falls back to an unrelated role while the stored primary is active.

#### Cleanup and evidence

- End with student primary and clear the optional cache key.
- Minimum evidence: E2 for navigation/status and E3 for primary role/events.
- Invariants: `INV-AUTH-001`, `INV-RETRY-001`.

### WORK-004 — Switching workspaces does not change the capability union

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P0 |
| Coverage | AUTHZ, PERSISTENCE, INTEGRATION |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure primary role remains navigation state and does not reduce or overgrant the account's effective authorization.

#### Actor

`ACT-TUTOR-MENTOR`.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Capture authorization while Mentor is primary. | Mentor workspace shows mentor-capability tools. | Record exact roles and sorted capability set. |
| 2 | Switch to Tutor. | Tutor dashboard opens; mentor workspace remains available in switcher. | Only `primaryRole` changes; roles and capability set are byte-for-byte equivalent after normalization. |
| 3 | Open a capability-protected mentor tool directly while Tutor is primary. | Tool opens because the actor still has mentor-derived capability, and its Home/Back destination follows the tutor primary role where designed. | Protected RPC accepts based on capability, not primary role. |

#### Forbidden outcomes

- Tutor primary removes mentor review/composition capability.
- Tutor primary grants administrator-only capability.
- A page checks only `profiles.role` and contradicts the server capability union.

#### Cleanup and evidence

- Restore mentor primary.
- Minimum evidence: E3 for exact capability comparison and protected RPC; E2 for navigation.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`, `INV-SCOPE-001`.

### WORK-005 — Mentor and administrator do not inherit tutor workspace access

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P0 |
| Coverage | AUTHZ, BOUNDARY, UI |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Keep high-trust review/administrative roles distinct from the operational tutor role and its future student relationships.

#### Actors

`ACT-MENTOR` and `ACT-ADMIN`, each without tutor/teacher.

#### Actions and expected outcomes

| Step | Actor action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Open the assigned workspace. | Switcher omits Tutor and Teacher. | Role arrays omit tutor/teacher. |
| 2 | Navigate directly to tutor dashboard. | `requireAuth(['teacher','tutor'])` redirects to the actor's own primary workspace. | No role/capability mutation occurs. |
| 3 | Probe tutor-only relationship/roster access once implemented. | Access is unavailable without separate tutor/teacher role and active relationships. | Server denies based on missing role/capability/relationship. |

#### Forbidden outcomes

- Role hierarchy assumptions treat mentor/admin as automatic tutor.
- Trusted publication capability grants access to every student or tutor roster.

#### Cleanup and evidence

- Cleanup: none.
- Minimum current evidence: E2 route/switcher and E3 authorization response; relationship probe remains future Chunk C coverage.
- Static coverage: `npm run test:dashboards`.
- Invariants: `INV-AUTH-001`, `INV-REL-001`, `INV-SCOPE-001`.

### WORK-006 — Direct navigation to a wrong role dashboard returns to the active primary workspace

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P1 |
| Coverage | AUTHZ, BOUNDARY, UI |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Provide predictable recovery from bookmarks or typed URLs without rendering a dashboard for an unheld role.

#### Actors and actions

| Actor | Wrong direct route | Expected destination |
| --- | --- | --- |
| ACT-STUDENT | admin dashboard | student dashboard |
| ACT-TUTOR | mentor dashboard | tutor dashboard |
| ACT-MENTOR | student dashboard | mentor dashboard |
| ACT-ADMIN | tutor dashboard | admin dashboard |

For each actor, confirm the wrong page does not initialize protected data before redirect.

#### Forbidden outcomes

- A dashboard grants access because the URL was known.
- Redirect loops occur because primary role and active roles disagree.
- Wrong-route navigation changes the primary role.

#### Cleanup and evidence

- Cleanup: sign out isolated sessions.
- Minimum evidence: E2 for redirect destinations and E3 for unchanged authorization.
- Static coverage: `npm run test:dashboards`.
- Invariants: `INV-AUTH-002`, `INV-SCOPE-001`.

### WORK-007 — Shared tools return to the actor's current primary workspace

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P2 |
| Coverage | NORMAL, INTEGRATION, UI |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Keep shared mentor/admin and multi-role tools from returning users to a hard-coded or stale dashboard.

#### Actors

- `ACT-TUTOR-MENTOR` under both primary roles.
- `ACT-ADMIN`.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Open exam review, form review, taxonomy, Question Bank, Course Builder, and Course Composer where capability permits. | Each page loads based on capability rather than an arbitrary single role. | Server calls authorize from the active capability union. |
| 2 | Use Home/Back/Dashboard links with Mentor primary. | Destination is mentor dashboard. | Primary role unchanged. |
| 3 | Switch multi-role actor to Tutor and revisit a still-permitted shared tool. | Return destination is tutor dashboard. | Capability union remains unchanged. |
| 4 | Repeat representative shared tool as Admin. | Return destination is admin dashboard. | Primary role remains admin. |

#### Forbidden outcomes

- A shared page always returns to tutor dashboard.
- Return navigation changes roles or bypasses a capability guard.

#### Cleanup and evidence

- Restore fixture primary roles.
- Minimum evidence: E2 for links/destinations and E3 for protected RPC acceptance.
- Static coverage: `npm run test:dashboards`, relevant review/course tests.
- Invariants: `INV-AUTH-001`, `INV-AUTH-002`.

### WORK-008 — Teacher and tutor remain distinct roles on one shared operational surface

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P1 |
| Coverage | AUTHZ, NORMAL, UI |
| Automation | PARTIAL |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Verify shared dashboard implementation does not erase the teacher role or create tutor relationships/authorization implicitly.

#### Actors

`ACT-TEACHER` and `ACT-TUTOR`.

#### Actions and expected outcomes

| Step | Actor action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Each actor signs in. | Both use tutor-dashboard URL; heading/switcher label reflects Teacher or Tutor accurately. | Authorization contains only the actor's actual role and its mapped workspace capability. |
| 2 | Inspect role badges and switcher. | Teacher is not relabeled Tutor; Tutor is not relabeled Teacher. | No role conversion occurs. |
| 3 | Compare shared authoring access. | Operational tools shared by policy are available to both. | Server authorizes through each role's capability mapping. |

#### Forbidden outcomes

- Browser normalization changes `teacher` into `tutor`.
- Sharing a page creates a tutor-student relationship or grants mentor/admin powers.

#### Cleanup and evidence

- Cleanup: sign out.
- Minimum evidence: E2 for labels and E3 for exact role/capability responses.
- Static coverage: `npm run test:dashboards`, `npm run test:authorization`.
- Invariants: `INV-AUTH-001`, `INV-REL-001`.

### WORK-009 — Capability-gated dashboard destinations are disabled without their capability

| Field | Value |
| --- | --- |
| Chunk | B — Workspaces and multi-role navigation |
| Priority | P1 |
| Coverage | AUTHZ, UI, ACCESSIBILITY |
| Automation | CANDIDATE |
| Environment | LOCAL-SUPABASE |
| Status | Active |
| Created | 2026-07-19 |

#### Purpose and protected risk

Ensure dashboards do not present capability-gated actions as usable when the server authorization response denies them, while preserving server enforcement as the real boundary.

#### Preconditions

Use a controlled synthetic actor/role mapping or explicit test response in which one normally displayed capability is absent. Do not alter production role mappings for this case.

#### Actions and expected outcomes

| Step | Action | Expected UI/client result | Expected RPC/database result |
| --- | --- | --- | --- |
| 1 | Load the relevant dashboard with the capability absent. | Destination receives disabled styling, no actionable `href`, and `aria-disabled=true`; status text reflects unavailable access where provided. | Authorization response remains authoritative and unchanged. |
| 2 | Attempt direct navigation to the gated page. | Capability guard redirects to the actor's primary workspace. | Protected RPC also denies if called directly. |
| 3 | Restore the mapped capability and reload. | Destination becomes actionable without stale disabled state. | Protected RPC accepts when all other ownership/scope rules pass. |

#### Forbidden outcomes

- CSS-only disabled styling leaves a functional privileged link.
- Dashboard enablement is treated as sufficient server authorization.
- Explicit empty capability response is expanded by legacy fallback.

#### Cleanup and evidence

- Restore the standard actor mapping and reload.
- Minimum evidence: E2 for accessibility/link state and E3 for direct RPC denial.
- Invariants: `INV-AUTH-002`, `INV-SCOPE-001`.

## Phase 3 execution note

These cases are canonical but not yet a formal run. Existing dashboard/authorization scripts provide static and domain evidence; authenticated navigation, persistence, and direct-RPC assertions remain pending until the local Supabase reset.
