# Multi-role authorization

This document describes authorization contract version `1`, introduced by `supabase/migrations/202607180003_multi_role_authorization.sql` and consumed by the publication policy in `202607180004_content_publication.sql`.

## Core model

A person can hold several active roles at the same time. Roles are not mutually exclusive and must not be collapsed into a single occupational label. For example, one account can simultaneously be a student, tutor, mentor, and administrator.

The model separates four concerns:

- **Role**: a named responsibility such as `student`, `tutor`, `teacher`, `mentor`, or `admin`.
- **Capability**: a narrow permission such as `exam.create`, `exam.review`, or `authorization.manage`.
- **Credential**: evidence that may support a role grant, such as a degree or professional qualification. Credentials do not grant capabilities by themselves in Phase 1.
- **Primary role**: the workspace the user prefers to enter first. It is navigation state, not the complete authorization decision.

Authorization is the union of the capabilities granted by every active role. Application code should ask whether the current user has a capability. It should check a role only when the named role itself is meaningful to the experience, such as choosing a workspace.

## Database records

The migration adds:

- `authorization_roles`: the role catalog.
- `authorization_capabilities`: the capability catalog.
- `role_capabilities`: the many-to-many mapping from roles to capabilities.
- `user_roles`: active and revoked role assignments, including source, reason, primary-workspace choice, and audit fields.
- `user_credentials`: qualification evidence and its review state.
- `authorization_events`: append-only role-grant, role-revocation, and primary-role audit events.

`profiles.role` remains temporarily available as a primary-workspace compatibility hint for older pages. It is no longer the source of truth for all roles or permissions. Never use it alone to authorize a protected operation.

Existing profile roles are backfilled into `user_roles` when the migration is applied. New sign-ups always begin with the `student` role; the sign-up request cannot promote itself by supplying role metadata.

## Server API

Authenticated clients can call:

- `get_my_authorization()`: returns the current primary role, active roles, and effective capabilities.
- `current_user_has_role(role_key)`: checks an active role.
- `current_user_has_capability(capability_key)`: checks the effective capability union.
- `set_my_primary_role(role_key)`: selects one of the caller's existing active roles as the preferred workspace.

Role administration uses:

- `grant_user_role(user_id, role_key, reason, make_primary)`
- `revoke_user_role(user_id, role_key, reason)`

Those functions require `authorization.manage`; calling the function is not itself permission to change assignments. Grants and revocations append authorization audit events.

Protected database policies and mutation RPCs must call the server-side capability helpers. Browser checks exist only to shape navigation and feedback. They are not the security boundary.

## Browser API

`src/auth/auth-guard.js` loads `get_my_authorization()` after resolving the authenticated profile. The returned auth context includes:

```js
const current = await getCurrentAuth();

current.roles;                  // every active role
current.capabilities;           // the effective capability union
current.hasRole("mentor");
current.can("exam.review");
current.canAll(["exam.review", "exam.publish"]);
current.canAny(["workspace.tutor", "workspace.mentor"]);
```

Page guards can require either a role or a capability:

```js
await requireAuth(["tutor", "teacher", "mentor", "admin"]);
await requireCapability(["exam.review"]);
```

Prefer `requireCapability` for protected work. Use `requireAuth` with roles for role-specific workspace presentation only.

Student, tutor/teacher, mentor, and administrator dashboards consume the active role union through `src/auth/workspaces.js`. Switching workspaces calls `set_my_primary_role` before navigation. Mentor and administrator no longer enter the tutor workspace unless `mentor`/`admin` is accompanied by a separate tutor or teacher assignment.

If the authorization RPC is not available while an older backend is being upgraded, the client derives a limited compatibility capability set from `profiles.role`. This fallback is transitional. An explicit database response containing no capabilities remains empty and is never expanded from the profile hint.

## Current capability boundaries

The Phase 1 seed grants authoring capabilities to tutors and teachers, authoring/review/publication and taxonomy-proposal capabilities to mentors, and system authorization/credential/taxonomy management capabilities to administrators. Phase 5 adds `question_bank.read` to mentors and administrators; Phase 6 adds `course.compose` to the same trusted roles; Phase 7 adds `course.assign` to those trusted roles. Students receive student-workspace and `practice.attempt` access, but never question-bank, grading-snapshot, or assignment-authoring access.

The exam and form review workflows check `exam.review` and `form.review`. Creation checks `exam.create` or `form.create`; review submission checks the matching `*.submit_review` capability. These checks allow cumulative roles without weakening server enforcement.

Regular tutors and teachers cannot publish their own definitions: they submit an immutable saved copy, and a different mentor or administrator records the decision. Mentors and administrators receive the narrower `exam.publish` and `form.publish` capabilities, so they may publish an owned private draft directly. They may still choose independent review, but cannot approve their own submitted copy. Both approval routes create a `content_publication_events` record whose mode is either `review_approved` or `privileged_direct`.

## Administrative bootstrap

The first account capable of granting roles must first sign up as a student and then be promoted through the service-role-only `bootstrap_first_administrator(user_id, reason)` RPC. The RPC refuses authenticated/anonymous callers and refuses to run after an active administrator exists. Do not expose a public bootstrap endpoint, accept an administrator role from sign-up metadata, or treat a legacy `profiles.role` value as an authorization grant.

## Deferred work

The following work remains deliberately deferred:

- credential-submission and credential-review screens;
- automatic teacher-role grants based on a verified credential;
- form/exam assignment to students;
- cohort assignment and mentor grading screens for written course-practice responses;

Those features should consume roles and capabilities from this contract instead of adding new single-role checks.

## Verification

Run:

```bash
npm run test:authorization
npm run test:publication
npm run test:exam-review
npm run test:form-review
npm run test:question-bank
npm run test:course-composition
npm run test:course-practice
```

The authorization self-test checks role preservation, cumulative capabilities, the no-overgrant fallback rule, migration structure, sign-up hardening, protected profile columns, and client integration. A passing static test does not apply the Supabase migration; deployment must still run the migration and exercise its RPCs/RLS against a local or hosted database.
