# Kelp Tutoring

Kelp Tutoring is a browser-based tutoring platform prototype. The repository contains dashboards, profiles, schedule and exam builders, a live classroom, a collaborative-ready whiteboard, forms, sign-up pages, and a markdown-driven course-planning catalogue.

The current front end is primarily plain HTML, CSS, and JavaScript. Several tools persist to browser storage for local development. Classroom and whiteboard already use validated adapter boundaries so a backend provider can replace their local fallback without rewriting their UI logic.

## Tool guides

- [Schedule generator](src/app/schedule-generator/README.md): catalogue selection, custom sessions, modules, cadence, date preview, editable schedules, progress, appearance, and PDF output.
- [Exam builder](src/app/exam-builder/README.md): exam authoring, question types, diagrams, student delivery, grading, results, JSON, and print output.
- [Classroom](src/app/classroom/README.md): waiting room, admission, devices, Jitsi, presence, chat, timers, surveys, and backend adapters.
- [Whiteboard](src/app/whiteboard/README.md): Excalidraw tools, geometry, grids, room scenes, collaboration adapters, and image/PDF output.

Each tool guide documents its function, code workflow, stored/exported data, integration boundary, commands, and debugging checks.

## Repository map

```text
src/
  app/
    classroom/             Live lesson room and waiting room
    dashboard/             Tutor and student dashboards
    exam-builder/          Exam authoring, taker, results, answer key
    form-builder/          Reusable form-building UI
    profile/               Tutor/student profile pages
    schedule-generator/    Schedule builder and generated schedule
    schedules/             Markdown planning tree and generated pages
    shared/                Cross-tool browser helpers and backend adapters
    signUp/                Registration flows
    whiteboard/            Standalone and classroom-embedded board
  data/
    tracks-data.js         Generated schedule catalogue for the browser
  styles/
    style.css              Shared Kelp visual system
docs/
  schedule-markdown.md     Planning-authoring syntax
  schedule-data-contract.md
  week-page-template.md
tools/                     Generators, local servers, and self-tests
```

## Running locally

The project has no bundling step, but HTTP is strongly recommended because it uses ES modules, iframes, media permissions, and CDN dependencies.

From the repository root:

```bash
npm run serve:app
```

This serves the full site at `http://127.0.0.1:3000/src/app/signUp/login.html`, matching the local Supabase Auth redirect configuration.

For focused tool work:

```bash
npm run serve:classroom
```

or:

```bash
npm run serve:whiteboard
```

Those commands start the repository's local server and open the requested tool. Any static HTTP server rooted at this repository can also be used for the other pages.

Network access is currently needed for some third-party browser dependencies:

- Excalidraw, React, and ReactDOM on the whiteboard.
- MathJax and Math.js in the exam flow.
- Lucide icons in classroom/whiteboard pages.
- Jitsi for live classroom video.

For an offline or production build, pin and serve these assets locally and update the current CSP/cache strategy accordingly.

## Local Supabase backend

The project includes a local Supabase setup for fast auth/profile testing without waiting for deployed GitHub changes.

Prerequisites:

- Docker Desktop running.
- Project dependencies installed with `npm install`.

Start the local backend:

```bash
npm run supabase:start
```

Then start the local app server:

```bash
npm run serve:app
```

Useful local URLs:

- App login: `http://127.0.0.1:3000/src/app/signUp/login.html`
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Local email inbox: `http://127.0.0.1:54324`

When the browser host is `127.0.0.1` or `localhost`, `src/lib/supabase/supabaseClient.js` automatically uses the local Supabase URL and publishable key. Other hosts keep using the hosted Supabase project.

The `supabase:*` npm scripts run through `tools/supabase-local.mjs`, which adds Docker Desktop's CLI folder to `PATH` on Windows before calling the Supabase CLI. Local schema changes live in `supabase/migrations/`. The first migration creates `public.profiles`, its sign-up trigger, and RLS policies for profile reads/updates. Analytics is disabled in the local config because the Supabase Analytics container is unreliable on this Windows Docker setup and is not needed for app auth/profile testing.

## Commands

```bash
npm run extract:schedules
npm run generate:tracks
npm run generate:schedules
npm run watch:schedules

npm run test:adapters
npm run test:exam-builder
npm run test:schedule-builder
npm run test:schedule-domain
npm run test:schedule-outline
npm run test:smoke

npm run serve:classroom
npm run serve:whiteboard
npm run serve:app

npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:stop
```

Command roles:

- `generate:tracks`: rebuilds `src/data/tracks-data.js` from planning markdown.
- `generate:schedules`: rebuilds static planning HTML and then the browser catalogue.
- `watch:schedules`: watches the planning markdown tree and regenerates outputs after changes.
- `extract:schedules`: migration helper for extracting supported existing HTML cards into markdown; it is not part of normal editing.
- `test:adapters`: validates the classroom/whiteboard local adapter contract and override merging.
- `test:exam-builder`: checks exam question reordering and related static contracts.
- `test:schedule-*`: checks cadence, outline mutations, catalogue/link integrity, and builder wiring.
- `test:smoke`: checks classroom/whiteboard integration and browser-facing contracts.
- `serve:app`: serves the full static site on port `3000` for local Supabase Auth redirects.
- `supabase:*`: manages the local Docker-backed Supabase stack for auth/profile/backend testing.

## Course-planning source of truth

The schedule catalogue is authored under `src/app/schedules/**/*.md`.

```text
schedules.md
  -> level page
    -> subject page
      -> track page
        -> module page
          -> session/week planning page
```

Normal editing flow:

1. Edit or add markdown under `src/app/schedules/`.
2. Link new pages from their parent markdown file. Links should point to the generated `.html` destination; the generators map them back to markdown sources.
3. Run `npm run generate:schedules`, or keep `npm run watch:schedules` running.
4. Verify the generated static planning page and the choices in `schedule-generator.html`.

Do not hand-edit these generated outputs:

- `src/app/schedules/**/*.html`
- `src/data/tracks-data.js`

The next generation run can overwrite them. Markdown files whose names begin with `_` are treated as drafts/notes and ignored by the schedule generators.

See `docs/schedule-markdown.md` for exact syntax and `docs/week-page-template.md` for the planning-page pattern.

## Data boundaries

The platform deliberately separates reusable content from user-specific activity:

```text
track catalogue
  -> editable schedule
    -> student assignment
      -> private progress

exam definition
  -> assigned/active exam
    -> detailed result
      -> compact submission/report

classroom room state <-> classroom adapter
whiteboard room scene <-> whiteboard adapter
```

This separation matters during backend wiring:

- A schedule copies source metadata so future track edits do not silently rewrite an existing schedule.
- Schedule progress is keyed by scheduled-session ID and is not embedded in reusable track content.
- Exam ownership must come from the authenticated tutor, not the browser placeholder.
- Exam results should retain the immutable question/grading basis used when the student submitted.
- Classroom role, room access, attendance, reports, and surveys require server-side authorization.
- Whiteboard file blobs should move out of browser storage into durable object storage.

Current schemas are described in the four tool READMEs and `docs/schedule-data-contract.md`.

## Shared backend adapters

`src/app/shared/backend-adapters.js` defines contract version `1` for classroom and whiteboard.

At startup, those pages create working local adapters and then inspect `window.KelpBackendAdapters`. A provider can be supplied as:

```js
window.KelpBackendAdapters = {
  async create(scope, context) {
    if (scope === "classroom") return classroomAdapters;
    if (scope === "whiteboard") return whiteboardAdapters;
    return null;
  }
};
```

It may also expose a scope-specific factory or adapter object. Overrides are merged with the local fallback, then all required methods are validated. The resolved adapters are available for diagnostics as:

```js
window.kelpClassroomAdapters
window.kelpWhiteboardAdapters
```

The adapter boundary is functional but is not itself authentication, database schema, conflict resolution, or real-time infrastructure. Production providers still need access control, authoritative timestamps/IDs, retry/idempotency behavior, and subscription delivery.

## Browser storage

Browser storage currently supports local development and cross-page handoff. Major namespaces include:

- `kelpGeneratedSchedule*` and `kelpSchedule*` for builder output, progress, and appearance.
- `kelp-exam-*` for exam drafts, library, active exam, and results.
- `kelp:classroom:v1:*` for room snapshots.
- `kelp:whiteboard:*` for board scenes, files, grid settings, and tool preferences.

Do not treat local/session storage as secure identity, durable multi-device persistence, or a transaction boundary. When replacing it, preserve the documented record separation and stable IDs.

## Verification before handoff

Run the complete local suite from the repository root:

```bash
npm run test:adapters
npm run test:exam-builder
npm run test:schedule-domain
npm run test:schedule-outline
npm run test:schedule-builder
npm run test:smoke
```

Then manually check the changed tool through the local HTTP server. For visual work, verify both screen and print modes, keyboard focus, reduced-motion behavior, and the relevant empty/loading/error state.

## Debugging order

1. Confirm the page is served from the expected repository and URL/room parameters are correct.
2. Check the browser console for module/CDN/adapter errors.
3. Inspect the tool's documented storage key or resolved adapter metadata.
4. Validate the stored object shape before debugging rendering.
5. Run the narrow self-test for the affected tool.
6. If a generated planning page/catalogue is involved, verify the markdown source and regenerate before editing output files.

Keep the relevant tool README updated when a storage key, schema, workflow stage, export, or adapter method changes. These guides are intended to be part of the debugging surface, not release marketing copy.
