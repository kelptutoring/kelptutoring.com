# Classroom

## Classroom domain boundary

`classroom-space.html` is the authenticated persistent Course Classroom. Dashboard Cards open this route with a Classroom ID; the server derives the viewer's membership role and returns only an authorized Course/Classroom projection. Home, Overview, Schedule, Files, and History are functional here; Forum, Assignments, Report Cards, and additional Classroom tools retain their own later phases.

`classroom.html` is one live-lesson tool inside that persistent Classroom. It is not the complete Classroom and must eventually be opened from an authoritative scheduled Class rather than directly from a persistent Classroom Card.

## Student Classroom membership lifecycle

Phase 3 implements the Student-facing lifecycle shell without inventing Forum, Assignment, Schedule, unread, homework, or Report Card data:

- `../dashboard/student-dashboard.html` shows only mandatory active and wind-down Classroom Cards. Wind-down Cards display `Ending soon`; active Cards cannot be hidden or archived.
- `student-classrooms.html` lists the signed-in Student's Active, Former, and personally Archived Classrooms.
- `classroom-space.html?classroom=<uuid>` opens an authorized persistent Classroom projection. Inactive retained Classrooms open read-only; the URL never supplies a trusted role.
- Archive and Restore change only `classroom_member_preferences` for the signed-in Student. They do not change the shared Classroom lifecycle or another member's view.

The browser calls only trusted RPCs through `src/data/studentData.js`:

| Operation | RPC |
| --- | --- |
| Dashboard active Cards | `get_my_student_dashboard` |
| Active, Former, and Archived collections | `get_my_student_classrooms` |
| Persistent Classroom entry | `get_my_classroom_space` |
| Personal archive | `archive_my_student_classroom` |
| Personal restore | `restore_my_student_classroom` |

The lifecycle source is migrations `202607200010_classroom_membership_visibility.sql` and `202607200011_student_classroom_lifecycle_projection.sql`. Verify changes with:

```bash
npm run test:student-classrooms
npm run supabase:test:db
npm run supabase:audit
```

The rollback suite covers Student isolation, active/wind-down archive denial, retained historical reads, member-specific archive independence, idempotent restore, and outsider denial. Schedule, Forum, Assignment, Report Card, and live-Class participation rules remain with their owning vertical phases.

## Effective Course Schedule

Phase 5.E.4 replaces the temporary read-only Schedule list with one compact effective Course plan:

- Studied Curriculum topics appear in their actual server-recorded order and date; the remaining plan follows the active immutable Schedule Version.
- Each wide-screen row uses three compact columns: number/date, linked Track topic/status, and always-visible Session progress controls. Studied rows emphasize the number and effective date without relying on color alone. Assigned-resource details expand only when resources exist, so an empty progress panel does not make the row unnecessarily tall.
- Students may mark Session or assigned-resource Studied/Reviewed/Practiced progress. A warning explains that Studied advances the plan and only the Tutor or Mentor can correct it. When an actual timed Class begins within six hours, the Student's Studied controls are disabled and the database rejects the same action; Reviewed and Practiced remain available. Date-only opportunities never create this hold.
- Tutors and Mentors may mark Session-level Studied work; later-topic marks and Studied corrections require a Student-visible reason.
- Successful progress clicks update the row without a transient text receipt. Row-local failures and stale-data instructions remain visible.
- Active Tutor/Mentor members can open the existing Schedule Builder from this area. Course mode publishes an expected-Version successor and rejects stale screens.
- Sessions are grouped under their Builder-authored modules on both the page and generated PDF. Older retained Schedule items resolve their stable module IDs against the Track catalogue; future publications also snapshot the module title.
- Each Classroom member can select one of the original Schedule Generator color templates or choose custom module-header and row-stripe colors. The preference is synchronized through Supabase, affects that member's web/PDF presentation, and never changes Course data, the active Schedule Version, or another member's view.
- Module and Schedule color pickers remain open while colors are selected and close when the member clicks outside them. Schedule text color applies to both the web view and its PDF snapshot. Active Studied, Reviewed, and Practiced controls use distinct pressed colors, including Studied/Practiced progress inherited from a parent Session or derived from its required resources.
- A member may also customize the PDF rule and text colors independently. The PDF inherits the same personal module colors as the web Schedule, while the governing Course and Schedule remain unchanged.
- The number/date cell is vertically centered in both layouts so compact and expanded topic rows keep a stable visual axis.
- Printed rows use three main columns: number/date metadata, the topic with the same pill-style status/kind/difficulty cues as the web Schedule, and a dedicated Studied/Reviewed/Practiced checkbox column. Module bodies are borderless so personal header and row colors define the visual grouping without a heavy frame.
- Each progress control shows its own marked date without the hour. The generated PDF repeats the same date beside the corresponding checkbox.
- Printed modules may continue on another page. The browser repeats the module header, never divides one topic row, respects A4 margins, and uses paged-media margin boxes for a generation date at bottom-left, centered copyright, and the page number at bottom-right on every page.

The `Generate PDF` action refreshes this projection from Supabase before opening the
browser's print/save-as-PDF dialog. The Student-facing document identifies the
Student, Tutor, Education level, Subject, and Track explicitly, then shows the effective dates,
difficulty, progress, and Student-visible assigned resources. It excludes original
planning dates, internal identifiers, private reflections, staff-only notes, hidden
resources, and superseded Schedule Versions. Copyright appears in the true center
of every footer; generation time appears at the left of every footer, and the
watermark remains centered on the A4 print canvas.
The print stylesheet suppresses the browser's unrelated upper timestamp/title
margin boxes while preserving Kelp's footer. Deterministic snapshot, Course,
Version, and timezone metadata
remain available to the application without being printed for the Student.

Progress commands refresh the authoritative projection without replacing it with a
loading panel. The page preserves expanded resource rows, the viewport, and keyboard
focus and uses a softened transition so marking Studied, Reviewed, or Practiced does
not make the Schedule jump.
Students see only the resulting effective date; original-date and exact progress
timestamp audit details remain staff-facing.

## Canonical Classroom Schedule consumer

Phase 5.G.2.1 changes the Classroom's data source without redesigning its interface:

- Home, Schedule, Retry, post-progress refreshes, module/PDF preference saves, and PDF generation read `course_schedule_read` through `get_my_unified_course_schedule`.
- The browser does not fall back to `get_my_effective_course_schedule` or the `learning_schedules` compatibility mirror when the canonical read fails.
- The Classroom adapter retains the canonical Past/Next/Upcoming timeline and Calendar/meeting policies for later consumers while continuing to render the established module Schedule only.
- A successful write followed by a failed canonical refresh is reported as saved-but-not-reloaded. It is never presented as a rejected write.
- Guardian higher-level timeline presentation remains outside this Student-first Classroom surface and will be completed with its owning role slice.

This cutover needs no new database migration because migration
`202607240008_unified_schedule_read_contract.sql` already supplies the governed
read RPC. `test:classroom-schedule`, `test:schedule-effective`, and
`test:schedule-pdf` cover the consumer boundary.

## Classroom Home and Course progress

The initial Phase 5.H slice makes `Home` the default Classroom destination and keeps
`Overview` as secondary reference material. Phase 5.G.2.4.5.2 keeps Home on the same
authorized canonical active-Version Schedule as the Schedule area and shows:

- a compact multi-curriculum coverage summary in the Classroom header;
- `Course progress — N%`;
- `Studied x/y · Practiced z/y`;
- one progress bar and an inline explanation of Studied, Practiced, Reviewed, and Schedule reflow;
- an optional compact per-Track progress breakdown;
- `This week` and `Coming next` blocks with Schedule work, independent Assignment
  deadlines, due dates, and direct Track/Assignment destinations;
- a Course-scoped Month/Week Calendar for active Student, Tutor, and Mentor
  Classroom members;
- a direct link to the detailed combined Schedule.

Only the active Schedule Version feeds Home. Ordinary adjustments keep continuing
progress visible; a complete replacement leaves the former plan and progress together
in Schedule history. Assignment deadlines are merged for presentation only and never
move tutoring sessions.

Every visible active Curriculum Session contributes two equal units: one Studied and
one Practiced. Reviewed is retained as useful reinforcement history but contributes
no percentage. Review, Exam, Wrap-up, dropped rows, and resource-level marks do not
inflate the denominator. A corrected Studied mark can reduce the current percentage
without deleting its append-only history. Assignments and This week/Next week remain
part of the canonical Home projection. Migration
`202607260014_classroom_home_layout_preferences.sql` lets an active Student reorder,
minimize, and maximize Course progress, This week, Coming next, and Calendar. The
layout is synchronized per Student and per Classroom; it does not affect another
member or reuse the global Dashboard layout. Tutors and Mentors see the same
Course-scoped Home information without Student personalization controls.
Live-lesson eligibility remains with its own planned Classroom slice.

## Role-aware Classroom Calendar

Migration `202607260012_role_aware_classroom_calendar.sql` adds
`get_my_classroom_calendar`. It accepts only active Student, Tutor, or Mentor
Memberships and filters the shared canonical Calendar engine to the current Course.
The Classroom Home renders the result with the established Month/Week event language,
module colors, direct Track/Assignment destinations, crowded-day details, and
horizontal reel navigation.

The response preserves the future Scheduling boundary. Only the Student receives
`canRequestLesson: true` and the assigned-Tutor availability context; Tutor and Mentor
responses contain no availability context and no request action. Migration
`202607260013_lesson_request_draft_foundation.sql` supplies a non-authoritative entry
scaffold for the current Classroom Calendar; it does not define the final booking
interaction. Phase 10 preselects and locks the Classroom's assigned Tutor, overlays
that Tutor's privacy-safe availability on the Student's own commitments, requires an
eligible Slot selection, and only then opens the request form. The Phase 5.H scaffold
does not contact the Tutor, reserve availability, create a Class, or post credits.
Phase 10 owns authoritative submission and availability, while Phase 11 owns credit
validation.

Returning to Today is bounded to a six-month visual reel in either direction. A
farther Calendar position first resets to that boundary, then animates back to the
current period instead of replaying every browsed month or week.

Corrected progress may legitimately return to an earlier effective target mapping.
Mapping revisions therefore remain append-only and ordered by revision number without
requiring every effective signature to be globally unique. When a Student plan mixes
real Track-backed items with retained source-less scaffolds, only the Track-backed
curriculum appears in the Student's effective plan; staff history retains the scaffold.

The migrations and source checks are `202607230001_builder_effective_student_schedule.sql`,
`202607240001_classroom_schedule_module_presentation.sql`,
`202607240002_classroom_schedule_module_presentation_fix.sql`,
`202607240003_classroom_schedule_interaction_followup.sql`,
`202607240004_classroom_scoped_schedule_builder.sql`,
`202607240005_classroom_builder_progress_state_guard.sql`,
`202607240006_classroom_home_track_progress.sql`,
`test:classroom-schedule`, `test:schedule-builder-adapter`,
`test:schedule-effective`, and `test:schedule-pdf`. Phase 5.F still owns recurring
academic-slot remapping; Phase 15 owns automatic Track publication/synchronization.

## Mentor Classroom management surface

Phase 4.A adds the management entry point to the persistent Classroom without enabling a partial reassignment or Course-lifecycle command:

- `get_my_classroom_space` derives `viewer.canManageClassroom` on the server. It is true only for the active supervisory Mentor Membership on an active or wind-down Course and active Classroom.
- The `Manage Classroom` button appears beside the Classroom status only when that server capability is active. Students, Tutors, administrators using shell-level access, historical members, and outsiders do not receive this ordinary Mentor control.
- The expanded surface shows the current Tutor, recurring-meeting schedule, Course ending, and Course termination authority points. Their action buttons remain disabled until their owning schema, validation, commands, audit events, and notifications exist.
- Phase 4.A performs no Course or Membership mutation. Tutor reassignment remains in Phase 6, after authoritative Schedule and availability/conflict work.

The source is migration `202607220001_classroom_management_surface.sql`. Verify it with:

```bash
npm run test:classroom-management
npm run supabase:test:db
npm run supabase:audit
```

The rollback characterization proves supervising-Mentor access, Student/Tutor/administrator denial of the Mentor controls, and outsider denial.

## Classroom Overview

Phase 4.B enriches the same authorized persistent Classroom projection without adding a mutation command:

- Course identity, Subject, Focus, lifecycle dates, service model, and Kelp-versus-independent provider label come from the runtime Course.
- Students see their own and the assigned Tutor's display names. The supervisory Mentor is internal staff context returned only to eligible Tutor, Mentor, Quality, and administrative viewers. The projection does not include email, birth date, location, or other Profile fields.
- A linked `learning_schedules` record is summarized by name, timezone, active-session coverage/count, and stored-version count. It is read-only in this phase.
- A legacy Course without that link remains readable and returns `schedule.linkageStatus = "missing"`. Phase 5 will migrate existing Courses and make a versioned Schedule mandatory.
- Historical Memberships retain the same read-only Classroom-shell behavior; outsiders remain denied.

The source is migration `202607220002_classroom_overview_projection.sql`. Verify it with:

```bash
npm run test:classroom-overview
npm run supabase:test:db
npm run supabase:audit
```

The rollback characterization exercises Student, Tutor, Mentor, administrator-shell, legacy missing-Schedule, and outsider boundaries. Schedule changes, Course-date synchronization, and Tutor reassignment remain in Phases 5 and 6.

## Classroom navigation and live-tool boundary

Phase 4.C makes the persistent Classroom shell navigable without presenting unfinished features as complete:

- Every Classroom area has a stable `area` query parameter, survives reload, and participates in browser Back/Forward navigation.
- Home, Overview, Schedule, Files, and History are functional. Planned areas display what will live there and name their owning phase rather than exposing a dead control or fabricated data.
- The supervisory Mentor row is absent for Students and other non-staff viewers because the server omits that identity; this is not a CSS-only privacy measure.
- The live lesson room has a central entry button beside the Classroom status. It remains disabled until an eligible scheduled Class can authorize entry, and it is never treated as the persistent Classroom itself. The former large Overview tool panel is intentionally absent so the same action is not presented twice.

The source is migration `202607220003_classroom_navigation_privacy.sql` and `classroom-space-navigation.js`. Verify it with:

```bash
npm run test:classroom-navigation
npm run supabase:test:db
npm run supabase:audit
```

The rollback characterization proves staff/non-staff supervision visibility, navigation status, administrator read-only context, and outsider denial. The future Forum, Assignment, Report Card, and live-Class phases retain their own content and mutation permissions.

## Former Schedule learning history

The Student-facing History area keeps completed learning visible after a complete
Schedule replacement without mixing former work into the active Course percentage.

- The append-only progress ledger remains the authority. A Student History row
  requires active Studied or Practiced progress. Reviewed remains visible as an
  auxiliary badge on an already worked Session and cannot create a row by itself.
- A Session still present in the active Schedule remains active progress and is not
  duplicated in History.
- Historical identity is deduplicated by the Track Session source key so legacy
  `stable_item_key` changes cannot create duplicate worked Sessions.
- Dropped items, untouched abandoned topics, and fully reversed progress are not
  shown to the Student. Resource-level progress is retained with its Session.
- A removed Session source remains clickable in History and opens a read-only
  `This content is unavailable` record instead of discarding the Student's work.
- Visible items are grouped by their immutable former Schedule Version. Unrelated
  accounts remain denied, while the Student and assigned academic staff can read the
  projection.
- Each former Version exposes an explicit `Minimize`/`Maximize` control beside its
  worked-Session count.

Migrations `202607260008_course_learning_history.sql` and
`202607260010_course_learning_history_resources.sql` provide
`get_my_course_learning_history`; `classroom-history-contract.js` annotates current
catalogue availability before `classroom-space.js` renders the History area.

Migration `202607260016_course_schedule_audit_history.sql` keeps the private
operational record separate from Student History. Authorized Tutors, Mentors,
Quality staff, and administrators receive immutable Version snapshots, governed
change reasons, actor details, and private staff notes through
`get_my_course_schedule_audit_history`. The Classroom History area starts each
audit Version minimized and can print the complete staff log. Students cannot call
or render this audit projection.
Verify it with:

```bash
npm run test:classroom-history
npm run test:classroom-phase
npm run test:schedule-phase
```

## Private Classroom Files authority

Phase 4.D supplies the private authority behind the Files area. Phase 4.E consumes it through the visible upload, preview, download, withdrawal, and moderation interface described below.

- An active Student, the assigned Tutor, or the supervisory Mentor can reserve and directly upload a PDF, JPEG, or PNG file of up to 20 MB. Files therefore work as the Classroom's shared drive rather than accepting Student material only through future Forum or Assignment flows.
- A Guardian can read and download visible retained files but cannot upload, withdraw, or hide them.
- An uploader can withdraw their own active file for two hours after activation. The file disappears from ordinary member access, but the browser does not physically delete it.
- The assigned Tutor or supervisory Mentor can hide an active file after supplying a reason. The action and reason are audited; authorized moderators retain review access.
- A replacement Tutor with an active Membership can read earlier visible Classroom files. A former Tutor can read only visible files activated during that Tutor's own Membership tenure.
- Only a trusted administrator workflow can permanently purge an eligible retained object. Authenticated browser users receive no Storage update/delete policy, and legal holds prevent purge.

The browser-facing read adapter is `getClassroomFilesData` in `src/data/studentData.js`, backed by `get_my_classroom_files`. Object metadata and audit history are defined by `202607220004_classroom_private_files_authority.sql`; the physical objects live in the private `classroom-files` bucket. Verify the authority with:

```bash
npm run test:classroom-files
npm run supabase:test:db
npm run supabase:audit
```

Phase 4.D does not grant a browser hard-delete path. The Phase 4.E controls preserve that boundary: withdrawal and moderation change authoritative visibility while retained-object cleanup remains trusted server work.

## Private Classroom Files interface

Phase 4.E turns the Files navigation area into the Classroom's responsive private shared drive:

- Eligible Students, assigned Tutors, and supervisory Mentors can choose or drag one PDF, JPEG, or PNG file at a time. The page validates the projected 20 MB limit and matching extension before reserving a private object path.
- Upload follows `reserve → private Storage upload → activate`. A failed activation is retried idempotently; the browser never tries to clean up a retained object with Storage delete authority.
- Preview and Download request 60-second signed links. No permanent or public object URL is rendered into the page.
- The uploader receives a Withdraw action only while the server says the two-hour window remains open. The dialog makes clear that withdrawal changes visibility without permanently erasing retained evidence.
- Assigned Tutors and supervisory Mentors receive Hide on active files. The dialog requires a 10–1000 character reason; hidden files remain visible to authorized moderators with the recorded reason.
- Guardians, former members, and historical Classroom participants receive the same file list in read-only form according to Phase 4.D's membership-tenure projection.
- File names and reasons are rendered with DOM text nodes, not injected HTML. Loading, empty, retryable-error, upload-busy, and reduced-motion states are explicit.

The interface lives in `classroom-space.html`, `classroom-space.js`, and `classroom-space.css`. Storage/RPC orchestration remains in `src/data/studentData.js`; validation and payload normalization remain in `classroom-files-contract.js`. Verify it with:

```bash
npm run test:classroom-files-ui
npm run test:classroom-files
npm run supabase:test:db
npm run supabase:audit
```

## Phase 4 checkpoint

Phase 4.F closes the persistent Classroom environment without enabling the staged Schedule or Tutor-reassignment mutations. Run the complete source regression with:

```bash
npm run test:classroom-phase
npm run supabase:test:db
npm run supabase:audit
```

The authenticated browser checkpoint is intentionally short:

1. As an active Student, enter an active Classroom from its Dashboard Card. Overview and Files must load; the supervisory Mentor and `Manage Classroom` must not appear.
2. Upload one small PDF or PNG in Files, then preview and download it. Withdraw it within two hours and confirm it leaves the ordinary file list without presenting permanent deletion.
3. As the supervisory Mentor, enter the same Classroom. The internal Mentor context and staged `Manage Classroom` surface may appear. Upload a second file, hide it with a reason of at least ten characters, and confirm the moderator view retains the hidden item and reason.
4. Open a retained former Classroom as its Student. Overview and Files must be read-only, while active-Classroom management and upload controls remain absent.
5. Attempt the active Classroom URL as an unlinked Student. The Classroom contents must not render.
6. At 390 CSS pixels, repeat Overview and Files navigation. The page must have no document-level horizontal overflow; file actions may wrap vertically and remain keyboard reachable.
7. Use Files, Overview, browser Back, and browser Forward. The `area` query parameter and selected content must remain synchronized, and the scheduled live-lesson tool must stay unavailable without an eligible Class.

Use synthetic files only and remove no retained Storage object from the browser. Record failures before fixing them; the database/RLS characterizations remain the authority for role isolation.

## Live-lesson tool

The live-lesson tool provides video, audio, attendance, chat, timers, lesson files, surveys, and the shared whiteboard. Tutors and students enter the same room with role-specific waiting-room and lesson controls. The page can run entirely with a room-scoped browser record or synchronize through the shared backend adapter contract.

The current video layer uses the Jitsi IFrame API. Classroom state and the video call are separate concerns: the room record tracks lesson workflow and UI state, while Jitsi transports live audio/video.

## Entry page and main files

- `classroom.html` contains the waiting room, lesson stage, quick panels, drawers, forms, review flow, and whiteboard host.
- `classroom.js` owns room state, device checks, admission, presence, Jitsi, timers, chat, files, surveys, and backend synchronization.
- `classroom.css` styles the prejoin, live room, focus layouts, drawers, notices, and post-lesson steps.
- `../whiteboard/whiteboard.html` is embedded with the same room ID when the shared board opens.
- `../shared/backend-adapters.js` defines and validates the optional backend boundary.
- `open-classroom-local.bat` is a Windows convenience launcher.

The page loads Lucide icons from `unpkg`, uses Jitsi at `meet.jit.si`, and requests browser media devices. Run it over HTTP/HTTPS; camera and microphone behavior is not reliable from `file://`.

## URL parameters

```text
classroom.html?room=lesson-123&role=tutor
classroom.html?room=lesson-123&role=student
classroom.html?room=lesson-123&role=observer
```

- `room`: shared room namespace. The default is `student-demo`.
- `role`: normalized to `tutor`, `student`, or the supported observer/read-only behavior.

The waiting-room Back to dashboard link is resolved by role: students return to `student-dashboard.html`; other classroom roles return to `tutor-dashboard.html`.

## Workflow

1. Resolve the room ID and requested role, then create a local room adapter.
2. Ask `window.KelpBackendAdapters` for optional `classroom` overrides and load the current room snapshot.
3. Populate the waiting room and enumerate camera, microphone, and speaker devices.
4. A tutor can enter and manage the lesson. A student submits the pre-lesson check-in and an admission request; the tutor approves it before the student joins.
5. Presence is published per participant. When tutor and student are present, lesson timing and attendance/session events can begin.
6. Initialize the Jitsi call and synchronize classroom controls such as device choice, layout, focus, and whiteboard availability.
7. Persist room changes through domain-specific adapter methods for room snapshots, presence, chat, timers, and session events.
8. On leave, collect the role-appropriate review, survey, technical feedback, and optional conduct report.

The classroom subscribes to room updates so two tabs or a backend provider can render the same normalized room state. Local fallback synchronization uses browser storage events and is device/browser scoped.

## Room data

The normalized room record contains:

```js
{
  roomId,
  title,
  studentName,
  tutorName,
  subject,
  scheduledDurationMinutes,
  classNumber,
  classTotal,
  cycleMonth,
  preFormId,
  postFormId,
  checkIn,
  studentRequest: {
    id,
    status,          // pending | approved
    requestedAt,
    approvedAt,
    checkIn
  } | null,
  presence,
  network,
  lessonStartedAt,
  timer: {
    status,
    durationSeconds,
    remainingSeconds,
    boxVisible,
    visibilityRequestedAt
  },
  devices,
  audio: { noiseSuppression },
  video: { background, mirrored },
  layout: { mode, focusRole },
  whiteboard: {
    active,
    openedAt,
    openedBy,
    openedByRole,
    closedAt,
    closedBy
  },
  chat,
  files,
  sessionEvents,
  conductReports,
  review,
  classroomSurveys: {
    teacher,
    student
  }
}
```

`normalizeRoom` supplies defaults and preserves backward compatibility with older duration and attendance fields. Backend implementations should return an object that can be normalized into this shape.

## Backend adapter contract

`src/app/shared/backend-adapters.js` defines contract version `1`. A classroom adapter must provide:

```js
{
  roomSession: {
    load(context),
    save(room, context),
    subscribe(listener)
  },
  participantPresence: {
    publish(presence, context)
  },
  chat: {
    send(message, context)
  },
  timers: {
    save(timer, context)
  },
  sessionEvents: {
    append(event, context)
  }
}
```

The page resolves overrides from `window.KelpBackendAdapters`. The registry may expose `create(scope, context)`, a `classroom(context)` factory, or a `classroom` object. Missing domains are merged from the local fallback and every required method is validated.

Write context includes:

```js
{
  roomId,
  participant,
  reason,
  snapshot,       // current normalized room
  occurredAt
}
```

The specialized methods let a backend avoid overwriting an entire high-traffic room record for every chat message, timer tick, or presence update. The local adapter implements them by writing the supplied context snapshot back to browser storage.

## Whiteboard integration

The classroom opens the whiteboard in an iframe using the same room ID and `embed=1`. Host and iframe exchange same-origin `postMessage` events for readiness, focus/view state, tool visibility, and classroom shortcuts. The board itself persists through the whiteboard adapter, not inside the classroom room record; the classroom stores only open/close coordination metadata.

When debugging a shared-board issue, check both records:

- `kelp:classroom:v1:<roomId>` for room/open-state coordination.
- `kelp:whiteboard:v1:<roomId>` for the actual Excalidraw scene.

## Browser storage

- `kelp:classroom:v1:<roomId>`: the normalized classroom room snapshot.
- Whiteboard storage uses its own `kelp:whiteboard:*` namespace.
- Role/profile helpers elsewhere in the site may be read to select names and dashboard destinations, but the room record remains the classroom source of truth.

Browser storage is the development fallback. It does not provide durable multi-device state or authoritative access control.

## Exported and synchronized data

The classroom does not currently expose a direct JSON/PDF download button. Its outward data is the adapter traffic:

- Full normalized room snapshots through `roomSession.save`.
- Participant presence updates through `participantPresence.publish`.
- Chat messages through `chat.send`.
- Timer state through `timers.save`.
- Attendance and lifecycle events through `sessionEvents.append`.
- Whiteboard scenes/files through the separate whiteboard adapter.
- Jitsi media/session commands through the Jitsi IFrame API.

For backend wiring, assign server-side IDs and timestamps where authoritative records matter, validate tutor/student access to `roomId`, and do not trust browser-provided role or ownership fields by themselves.

## Running and testing

From the repository root:

```bash
npm run serve:classroom
npm run test:smoke
npm run test:adapters
```

- `serve:classroom` starts the local HTTP server and opens the classroom.
- `test:smoke` checks classroom/whiteboard contracts and browser-facing integration behavior.
- `test:adapters` checks local persistence, adapter merging, and required method validation.

## Debugging notes

- Inspect `window.kelpClassroomAdapters.meta` to identify the active provider.
- If the page says it is using local mode, inspect the console for the adapter validation/initialization error.
- Tutor and student tabs must use the exact same `room` query value.
- Camera/microphone enumeration may not expose device labels until the user grants permission.
- If video fails while room state still changes, diagnose Jitsi/network/CSP separately from the classroom adapter.
- If student admission appears stuck, inspect `studentRequest.status`, presence for both roles, and room-subscription delivery.
- If a timer/chat update disappears with a custom backend, confirm the specialized adapter method also broadcasts or returns a room state that the subscriber will receive.
- Keep conduct reports and surveys permissioned separately in a production database even though the prototype normalizes them into the room snapshot.
