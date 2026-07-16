# Classroom

## Function

The classroom provides the live-lesson room around video, audio, attendance, chat, timers, files, surveys, and the shared whiteboard. Tutors and students enter the same room with role-specific waiting-room and lesson controls. The page can run entirely with a room-scoped browser record or synchronize through the shared backend adapter contract.

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
