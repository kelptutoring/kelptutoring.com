# Role-aware dashboards

Phase 2 gives each high-level responsibility its own workspace while preserving cumulative account roles.

## Pages

- `student-dashboard.html`: the Phase 2.D Student shell with synchronized Dashboard preferences, active relationship-backed Classroom Cards, and grouped Learn/Schedule/Account navigation.
- `tutor-dashboard.html`: tutor/teacher authoring, classroom, schedule, and calendar tools.
- `mentor-dashboard.html`: exam/form authoring, tutor-content review, and the curriculum proposal entry point.
- `admin-dashboard.html`: trusted authoring/review plus authorization, credential, and canonical taxonomy entry points.

Teacher currently shares the tutor dashboard because its operational tools are the same. The roles remain distinct in authorization and in the workspace switcher.

## Workspace switching

`workspace-switcher.js` renders only the roles returned by `get_my_authorization()`. Selecting another workspace calls `set_my_primary_role` before navigation. The selected role becomes the preferred login destination and updates the temporary `profiles.role` compatibility hint on the server.

Workspace routes live in `src/auth/workspaces.js`. Do not duplicate role-to-dashboard maps in new pages.

A role grants access to its own workspace only. An administrator can open the student or tutor workspace only if `student`, `tutor`, or `teacher` is separately present in their active role union. Mentor and administrator are no longer aliases for tutor.

## Current tool state

Both builders and both read-only review queues are operational for mentors and administrators. Direct publication is exposed only when the active capability union grants the corresponding `*.publish` capability. The curriculum workspace lets mentors submit taxonomy proposals while administrators maintain canonical nodes. The Question bank retrieves approved reusable questions for both roles through `question_bank.read`. The Course Builder composes those references into owner-scoped drafts through `course.compose` and binds a saved course to a student's scheduled session through `course.assign`. Student dashboards link to a practice library whose delivery RPCs expose immutable, answer-free question snapshots only. Credential review and visual role management are still planned information-architecture destinations and do not link to empty pages.

Builder and review headers resolve their return destination from the user's primary role, so mentor and administrator users return to the appropriate dashboard.

## Student Dashboard foundation

The canonical Student Dashboard delivery sequence is:

1. **Phase 2.A — Test actors and relationship foundation:** Mentor → Tutor → two Students, Course-scoped assignments, and an unlinked outsider.
2. **Phase 2.B — Dashboard preferences and read model:** server-owned ordering and relationship-authorized Dashboard data.
3. **Phase 2.C — Responsive top navigation and grid:** replace the sidebar and separate fixed regions from the reorderable grid.
4. **Phase 2.D — Real Classroom Cards:** render active membership Cards and enter the existing Classroom route.
5. **Phase 2.E — Calendar surface:** authoritative schedule items and the availability-overlay contract, with full booking concurrency deferred to the Calendar phase.
6. **Phase 2.F — Tests and documentation:** both Students, Tutor, Mentor supervision, outsider denial, responsive ordering, and cross-device preferences.

Phases 2.A–2.D are complete. Phase 2.E is active; the remaining slices stay within their stated boundaries.

The Student Dashboard no longer reads the undeclared `important_links` or `student_events` tables. `get_my_student_dashboard()` returns the signed-in Student's dedicated Dashboard preferences and Phase 2.A Course/Classroom relationships. `save_my_student_dashboard_preferences()` and `reset_my_student_dashboard_preferences()` own cross-device persistence.

The Dashboard header follows normal page flow and scrolls away with the content. Its Credits wallet and Learn, Schedule, and Account controls are independent solid surfaces; they are not wrapped in an additional decorative group. On mobile, each menu opens as a viewport-contained panel instead of expanding a full-height sidebar before the Dashboard content.

Credits remain outside the rearrangeable grid in the topbar wallet. Calendar and Classrooms are the only reorderable blocks, and each can independently retain an expanded or minimized state. The Calendar can retain a `month` or `week` presentation choice; Month renders actual numbered date cells, but Phase 2.B deliberately returns no invented events. Phase 2.D renders only active membership-backed Classroom Cards. Students can reorder and recolor them, then enter the authenticated persistent Classroom-space route. Homework, unread counts, and next-Class cues remain absent until authoritative sources exist.

There is no Dashboard edit mode. Each block's heading area is its pointer drag handle, while the arrow buttons preserve a keyboard-accessible alternative. Order, minimized state, and Calendar view save automatically after each action. Controls pause only while that individual write is in flight, and a failed write restores the immediately preceding preference state.

Phase 2.C keeps the topbar, Credits wallet, Student heading, feedback, and fatal-error surface outside the reorderable grid. Only Calendar and Classrooms move. The header remains one row where it fits and becomes a two-row logo/wallet plus navigation layout on very narrow phones; no fixed region is silently removed. The page itself must not overflow horizontally, while the Calendar may retain isolated internal scrolling. Self-evident preference changes stay silent; save failures remain visible. Collapse/expand plus reorder actions animate unless the device requests reduced motion.

Phase 2.D distinguishes the persistent Classroom from its live-lesson tool. `classroom-space.html` is the membership-authorized Course hub foundation; `classroom.html` remains the schedule-bound video/whiteboard tool. The Card URL carries only a Classroom ID. The server derives membership role and denies unlinked users. Active Cards cannot be hidden, and per-Student Card color/order preferences are stored separately from both the Profile and the Classroom.

## Verification

Run:

```bash
npm run test:dashboards
npm run test:student-dashboard
npm run test:authorization
npm run test:exam-review
npm run test:form-review
npm run test:publication
npm run test:question-bank
npm run test:course-composition
npm run test:course-practice
```

The workspace test covers route resolution, exact-role guards, switcher RPC usage, capability-protected destinations, dynamic review return navigation, and shared responsive hooks. The Student Dashboard test covers its schema/RLS/RPC contract, strict two-block layout normalization, collapsed-state normalization, grouped navigation, normal-flow responsive header, direct manipulation with automatic persistence, real relationship projection, and deferred-feature markers. Live database verification runs through `supabase:test:db` after migrations `202607200005_student_dashboard_foundation.sql` and `202607200006_student_dashboard_refinements.sql` are applied.
