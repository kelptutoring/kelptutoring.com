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

The current interface refinement keeps Classroom Cards compact enough for three columns on wide screens, two on medium screens, and one on phones. The entire Card remains an accessible Classroom link, while hover underlining is limited to `Open Classroom`. Dashboard block collapse/expand and reorder motion is deliberately paced rather than abrupt and still respects reduced-motion preferences.

## Canonical Calendar consumer

Phase 5.G.2.2 replaces the Dashboard Calendar's live Course-event dependency
on `learning_schedules` with the canonical `course_schedule_read` timeline.
Every active or wind-down Classroom contributes authorized Course lifecycle,
Past/Next/Upcoming meeting, planned-topic, and independent-progress events. An
error in any Course read rejects the complete Calendar instead of silently
omitting that Course or falling back to legacy Schedule data.

Assignment deadlines remain separate immutable Assignment facts and may share
a date with a Course event. Date-only events use viewer-local noon only as a
nonblocking display anchor. The compatibility mirror is read solely to resolve
the immutable Schedule-session snapshot attached to an existing Assignment.

Calendar cells use compact labels because their available width is deliberately
small: `CB` Course begins, `CE` Course ends, `SM` Schedule milestone, `RC`
Regular class, `EC` Extra/on-demand class, `IP` Independent progress, and `AD`
Assignment due. `SM` is intentionally distinct from the `MS` education-level
code for Middle School. Hover and keyboard focus expose the complete
description inside the Calendar boundary, the inline circular helper explains
every code, and crowded days expose a color-coded modal list rather than
clipping undisplayed events. Full descriptions deliberately omit repeated
Course metadata and separate event type, education level, Subject/content, and
the specific description into four short lines.

Color presentation remains private to each member. Module-backed milestones,
Classes, and independent progress inherit the same saved module header/row
colors used in that member's Classroom Schedule. Course begin/end inherit the
Classroom Card color, while independent Assignment deadlines retain their
fixed deadline palette. Expanded day entries and hover/focus descriptions use
four concise lines: event type/outcome, education level, Subject/content, and
the specific item description.

Calendar actions use the most specific retained destination. An Assignment
deadline opens its Practice page; a Schedule milestone, independent-progress
fact, or Class target opens the linked Track Session when its immutable
Schedule snapshot retained a planning route. Events without a dedicated page
fall back to the current Classroom.

The current Month/Week layout stays in place during this data-source cutover.
Both Calendar surfaces cap a return-to-Today reel at six months, preventing a
long browsing session from producing an unbounded animation. The current Lesson
Request draft is a non-authoritative Phase 5.H entry scaffold; it does not
contact a Tutor, reserve availability, create a Class, or charge credits.

Phase 10 replaces that scaffold with the Tutor-first booking workflow. `Book a
lesson` lists Tutors from the Student's authorized many-to-many relationships,
then overlays the selected Tutor's privacy-safe availability on the Student's
own commitments. The Student selects an eligible Slot before the request form
opens. The Classroom variant preselects and locks its assigned Tutor. The full
hourly view, authoritative submission, and availability mask remain owned by
Phase 10; credit validation remains owned by Phase 11. The Phase 5.H Classroom
Calendar consumes the same canonical event model through a role-aware
current-Course endpoint for active Students, Tutors, and Mentors.

## Verification

Run:

```bash
npm run test:dashboards
npm run test:student-dashboard
npm run test:lesson-request-foundation
npm run test:authorization
npm run test:exam-review
npm run test:form-review
npm run test:publication
npm run test:question-bank
npm run test:course-composition
npm run test:course-practice
```

The workspace test covers route resolution, exact-role guards, switcher RPC usage, capability-protected destinations, dynamic review return navigation, and shared responsive hooks. The Student Dashboard test covers its schema/RLS/RPC contract, strict two-block layout normalization, collapsed-state normalization, grouped navigation, normal-flow responsive header, direct manipulation with automatic persistence, real relationship projection, and deferred-feature markers. Live database verification runs through `supabase:test:db` after migrations `202607200005_student_dashboard_foundation.sql` and `202607200006_student_dashboard_refinements.sql` are applied.
