# Kelp Tutoring

Kelp Tutoring is a browser-based tutoring platform prototype. The repository contains dashboards, profiles, schedule and exam builders, a live classroom, a collaborative-ready whiteboard, forms, sign-up pages, and a markdown-driven course-planning catalogue.

The current cross-task delivery sequence is maintained in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). Use that file to resume work in a new Codex task; detailed domain behavior remains in [`docs/product/product-contract.md`](docs/product/product-contract.md).

Current checkpoint: Course Schedule Phases 5.A–5.G.2.3, plus prerequisite Phases 1–4, are complete. Multi-curriculum Phases 5.G.2.4.1–5.G.2.4.4 are complete. Phases 5.G.2.4.5.1 and 5.G.2.4.5.2 are complete and backend-wired. The bounded 5.G.2.4.7 follow-up now precedes Calendar/PDF parity: 5.G.2.4.7.1 is complete with repaired staff progress interactions, legitimate current-time actions before the first planned Session, row-local feedback, and expanded manual-QA qualification fixtures. `RUN-20260730-002` records migration `202607300001`, all 34 passing rollback database characterizations, successful manual-QA reprovisioning, and the nine-actor zero-residue audit. Phase 5.G.2.4.7.2 is complete and locally verified: Schedule pacing is append-only policy history, existing plans default to Adaptive, and Static freezes current effective future dates without stopping progress recording. Outside a booked Class’s six-hour hold, Student Studied work may reflow eligible future academic targets; inside that hold, the Student cannot mark Studied at all, while Reviewed and Practiced remain available. Date-only independent/on-demand opportunities never create this hold. Migration `202607300002`, forward migrations through `202607300008`, `test:schedule-pacing`, and the dedicated 35th rollback characterization cover the policy, Builder, idempotency, RLS, reflow, frozen dates, and hold boundary. `RUN-20260730-003` records all 35 passing rollback database characterizations and the nine-actor zero-residue audit. Phase 5.G.2.4.7.3 is complete: active-plan edits lock the original start date, preload cadence, and reflow only future flexible dates; keeping any former Track is a continuation, while replacing every former Track starts a new plan. Studied, Practiced, or a delivered Class makes a Track started, Reviewed alone does not, and migration `202607300009` prevents a continuing Version from silently removing started work. The former plan remains in History after replacement, and selected Builder Sessions now have clearer contrast. `RUN-20260730-004` records the applied migration, all 35 passing rollback database characterizations, and the nine-actor zero-residue audit. The authoritative path is Education level → Subject → Track → Module → Session; AP, SAT, ACT, IB, and similar labels remain optional Track pathway metadata rather than a mandatory navigation level or Student goal. One Course may combine primary and supporting Tracks while retaining one required active Schedule, one chronological Student plan, item-level curriculum identity, and immutable history. Complete replacements retain former Schedule progress only in Schedule history; ordinary adjustments keep continuing progress in the active Classroom Home. `RUN-20260726-034` records qualification and publication enforcement, `RUN-20260726-035` records canonical multi-curriculum consumer projection, and `RUN-20260726-036` records the applied Classroom/Home migration, all 34 rollback database characterizations, and the nine-actor zero-residue audit. Classroom Home now exposes compact coverage, one overall Course-progress result, optional per-Track details, and active-only `This week`/`Coming next` work windows with independent Assignment deadlines. Canonical module numbering and Track-qualified presentation colors prevent same-numbered modules in different Tracks from colliding. The original 5.G.3 durable integration-event outbox remains after the multi-curriculum expansion; 5.G.3–5.G.5 have not been removed or renumbered. See [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for the preserved sequence and run history. Markdown remains the editable Track authoring source; full automatic Track publication and synchronization remain in Phase 15.

Follow-up 5.G.2.4.7.3.1 is locally verified. The Builder preloads canonical, meeting-pattern, or legacy cadence, presents weekdays Sunday through Saturday, verifies exact multi-week weekday sequences, and lets retained future Practiced items follow cadence without losing progress or allowing their Track to disappear. Forward migration `202607300010` preserves exact locks for Studied and delivered work while separating Practice retention from lesson-date authority.

Follow-up 5.G.2.4.7.3.1.4 is locally verified. A complete replacement may start on any Student-local date from today onward instead of inheriting a stale future start from the former plan; ordinary revisions keep their locked start. Migration `202607310006` freezes each Studied mark's Schedule Version, plan epoch, authored cadence, and nearest-first predecessor chain. Migration `202607310009` removes a reversed Studied Session from the unfinished lane, reinserts it after its nearest predecessor that remains (or first when none remain), and assigns only unlocked slots from the current active cadence. Migration `202607310010` completes step 3: Course End is projected from the active Version's actual Studied dates and current mapped or frozen target dates, so it contracts with Adaptive progress, expands after reversal, follows cadence changes, and remains fixed under Static pacing without rewriting historical Course data.

Follow-up 5.G.2.4.7.3.1.5 step 1 is locally verified through migration `202607310011`. The Builder now submits one complete, ordered frontend-calculated future cadence lane for every selected Session. The server validates its identities, order, boundary, and every gap-free cadence date before publication, then materializes that exact lane instead of inheriting academic target weekdays from the former Version's recurring pattern. Studied rows keep their actual historical dates, while only unfinished Sessions consume the authoritative future lane. Three named cadence-change regressions now prove that Studied Sessions stay fixed, unfinished Sessions move to the revised weekdays, and a reversed Studied Session cannot return to the former cadence. `RUN-20260731-009` records both applied migrations, all 35 passing rollback characterizations, and the nine-actor zero-residue audit.

Migration `202607310007` repairs Builder publication error precedence discovered by the complete database suite: stale submissions and exact retries reach the governed expected-Version/idempotency checks before current-document cadence validation, while valid current publications remain strict and concurrency-safe.

Migration `202607310008` restores the Student-only membership guard at the Classroom Calendar wrapper boundary. A cross-Student request now receives the narrow Student-membership denial before the role-aware Student/Tutor/Mentor reader is invoked; authorized Student parity remains delegated to the same active-Version Calendar projection.

`npm run test:recent-boundary-regressions` keeps both incidental repairs explicit: one named test preserves stale-publication error precedence for cadence-less legacy drafts, and another requires Student membership to be checked before role-aware Classroom Calendar delegation. This gate runs automatically before the local rollback database characterizations.

Phase 5.G.2.4.7.2 also includes forward migration `202607300003`, which
binds the canonical Classroom read directly to pacing-aware effective dates.
Its rollback characterization reproduces ordinary recurring reflow outside
the six-hour hold through the same endpoint used by the Classroom. Routine
successful progress clicks no longer show a transient text receipt.
Forward migration `202607300004` covers recurring Courses that have dated
Schedule Sessions but no governed meeting pattern yet. Their structural dates
become date-only Adaptive pacing opportunities, never fabricated booked
Classes or six-hour holds; retained Studied history is backfilled into a fresh
effective mapping so existing manual-QA Schedules reflow immediately.
Forward migration `202607300005` requires every Tutor/Mentor Studied mark or
reversal to carry a Student-visible explanation, adds that explanation and the
target title to the durable notification fact, and provides a Student-safe
current-Schedule Log subtab. The Log keeps retained-item progress visible after
ordinary Schedule adjustments but excludes private staff notes and unrelated
former-Schedule progress.
Forward migration `202607300006` establishes a due recurring target lock before
the Studied fact is inserted, so the ordinary post-progress Adaptive refresh
cannot move a Class that is already inside its six-hour preparation hold.
Forward migration `202607300007` refreshes that pre-progress mapping immediately
before lock materialization, removing any dependency on activation-trigger
ordering or a stale initial target revision.
Forward migration `202607300008` simplifies the Student boundary: an actual
timed Class within T−6 hours blocks a new Student Studied mark at the database
and disables the corresponding interface control. Reviewed and Practiced
remain available, and rejected attempts create no progress, target lock, or
reflow. Date-only opportunities remain outside this rule. A future booked
on-demand Class enters the same contract as soon as its timed academic slot is
published.

The interactive local manual-QA network is intentionally simple: Aldebarã is
the sole Mentor, Thiago Kelp is the sole Tutor, Thiago D. is the recurring
Algebra 1 Student, and Thiago Dias is the on-demand Mechanics Student. Its
curriculum rows are generated from the canonical Track catalogue so their
titles open real Session pages. Re-run only this graph with
`npm.cmd run supabase:provision:manual-qa -- --confirm-project=kelptutoring.com-main`;
known predecessor sandbox Courses are retained as inactive history.
The manual-QA Mentor and Tutor intentionally receive qualification coverage
for every active Subject so cross-Subject Schedule editing can be tested
without fixture-only authorization failures; production qualification checks
remain unchanged.
The graph was provisioned and backend-verified on 2026-07-30; all dependent
source contracts, all 34 rollback database characterizations, and the
nine-actor zero-residue audit passed (`RUN-20260730-001`).

The current Schedule continuation boundary assigns one cadence across the
fully combined Track order, preserving elapsed and Studied structure without
restarting the date lane at Track boundaries. Student Dashboard, Student
Classroom, Tutor, and Mentor Calendars consume the same current active-Version
Classroom timeline; their event dates and identities must remain equal for the
same Course.

The current front end is primarily plain HTML, CSS, and JavaScript. Several tools persist to browser storage for local development. Classroom and whiteboard already use validated adapter boundaries so a backend provider can replace their local fallback without rewriting their UI logic.

## Tool guides

- [Schedule generator](src/app/schedule-generator/README.md): catalogue selection, custom sessions, modules, cadence, date preview, editable schedules, progress, appearance, and PDF output.
- [Exam builder](src/app/exam-builder/README.md): exam authoring, question types, diagrams, student delivery, grading, results, JSON, and print output.
- [Classroom](src/app/classroom/README.md): Student Classroom collections and historical access, plus the live-lesson waiting room, Jitsi, whiteboard, and backend adapters.
- [Whiteboard](src/app/whiteboard/README.md): Excalidraw tools, geometry, grids, room scenes, collaboration adapters, and image/PDF output.

Each tool guide documents its function, code workflow, stored/exported data, integration boundary, commands, and debugging checks.

## Repository map

```text
src/
  app/
    classroom/             Persistent Classroom surfaces and live lesson tool
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

If PowerShell blocks `npm` or `npm` is unavailable, run the same local stack directly:

```bash
node tools/supabase-local.mjs start
node tools/serve-app.mjs
```

If the issue is PowerShell blocking `npm.ps1`, `npm.cmd run supabase:start` and `npm.cmd run serve:app` also work.

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
npm run test:relationships
npm run test:student-dashboard
npm run test:student-classrooms
npm run test:exam-builder
npm run test:schedule-builder
npm run test:schedule-domain
npm run test:schedule-outline
npm run test:schedule-sources
npm run test:schedule-progress
npm run test:schedule-aggregation
npm run test:schedule-builder-adapter
npm run test:schedule-effective
npm run test:schedule-pdf
npm run test:schedule-slots
npm run test:schedule-slot-generation
npm run test:smoke

npm run serve:classroom
npm run serve:whiteboard
npm run serve:app

npm run supabase:start
npm run supabase:status
npm run supabase:test:db
npm run supabase:audit
npm run supabase:reset
npm run supabase:stop
```

Command roles:

- `generate:tracks`: rebuilds `src/data/tracks-data.js` from planning markdown.
- `generate:schedules`: rebuilds static planning HTML and then the browser catalogue.
- `watch:schedules`: watches the planning markdown tree and regenerates outputs after changes.
- `extract:schedules`: migration helper for extracting supported existing HTML cards into markdown; it is not part of normal editing.
- `test:adapters`: validates the classroom/whiteboard local adapter contract and override merging.
- `test:relationships`: validates the Student–Tutor–Mentor relationship and Classroom foundation.
- `test:student-dashboard`: validates Student Dashboard preferences, Calendar surface, and active Classroom Cards.
- `test:student-classrooms`: validates Active/Former/Archived collections, historical entry, and responsive interaction contracts.
- `test:exam-builder`: checks exam question reordering and related static contracts.
- `test:schedule-*`: checks cadence, outline mutations, catalogue/link integrity, and builder wiring.
- `test:schedule-sources`: checks Phase 5.E.1 Track Session/content identities, personalized resource snapshots, visibility, and the guarded database characterization contract.
- `test:manual-qa-network`: checks the four-account Mentor → Tutor → Student graph, one-role-only account contracts, Track-catalogue source parity, and a real generated destination for every provisioned curriculum row.
- `test:schedule-progress`: checks Phase 5.E.2 append-only progress, privacy, concurrency, governed reversals, notifications, and Studied structural locking.
- `test:schedule-aggregation`: checks Phase 5.E.3 required-resource aggregation, direct-parent inheritance, explicit-child precedence, correction authority, and aggregate notifications.
- `test:schedule-builder-adapter`: checks deterministic Markdown content identities and conversion of a generated Track plan into a reasoned successor Course Schedule.
- `test:schedule-effective`: checks the compact effective Schedule contract, Classroom progress controls, staff Builder entry, and governed publication adapter.
- `test:schedule-pdf`: checks authoritative refresh-before-print, deterministic snapshot identity, privacy exclusions, full Course/Schedule identifiers, and the printable Schedule contract.
- `test:schedule-slots`: checks Phase 5.F.1 immutable weekly meeting patterns, duration/purpose rules, Version inheritance, authorization, privacy, concurrency, and rollback coverage.
- `test:schedule-slot-generation`: checks Phase 5.F.2.1 immutable recurring/static occurrence generation, active-Version visibility, successor isolation, and the boundary from Calendar/Class/billing records.
- `test:schedule-target-mapping`: checks Phase 5.F.2.2 append-only recurring target reflow, on-demand recommended/selectable topics, nonfinancial excess capacity, authorization, and immutable history.
- `test:schedule-unified`: checks Phase 5.F.4 Past/Next/Upcoming projection, planned-versus-confirmed targets, linked-progress de-duplication, Guardian redaction, staff audit detail, and downstream financial boundaries.
- `test:schedule-read-contract`: checks Phase 5.G.1 canonical modules/timeline composition, meeting-state vocabulary, date-only Calendar presentation, role redaction, and the non-authoritative legacy mirror.
- `test:schedule-consumer-parity`: checks Phase 5.G.2.3 Classroom/Calendar identity, date, status, timezone, destination, module-color, role, failure, and legacy-isolation parity.
- `test:schedule-coverage`: checks Phase 5.G.2.4.1 multi-curriculum vocabulary, selected-only Goals, primary/supporting Track coverage, role boundaries, canonical target uniqueness, and the distinction between tutoring occurrences and homework.
- `test:schedule-version-coverage`: checks Phase 5.G.2.4.2 immutable Version coverage, safe single-focus backfill, exact successor inheritance, Goal hierarchy, RLS, and rollback characterization registration.
- `test:schedule-multi-branch`: checks Phase 5.G.2.4.3.1 subject-first pathway grouping, cross-Subject/level selection, primary/supporting Track roles, browser-draft migration, zero-Session branch exclusion, and schema-v2 reusable coverage.
- `test:schedule-classroom-preload`: checks Phase 5.G.2.4.3.2 active Classroom coverage/Session preloading, locked and missing source recovery, source-update presentation, stable item identity, stale-draft rejection, and staged publication boundaries.
- `test:schedule-qualification-publication`: checks Phase 5.G.2.4.4 complete assigned-Tutor qualification enforcement, canonical branch resolution, atomic selected coverage, full-replacement history boundaries, idempotency, and direct structural bypass denial.
- `test:schedule-cadence-continuation`: checks persisted Builder cadence recovery/preload, intentional draft precedence, Sunday-first selection, exact weekly sequencing, bottom workflow navigation, replacement-date floors, immutable historical/Studied/delivered work, and movable-but-retained Practiced work.
- `test:schedule-cadence-change-regressions`: checks that cadence revisions move every unfinished Session, retain actual Studied dates, restore a later-unmarked Session only onto the revised weekdays, and publish no dates from the superseded cadence.
- `test:smoke`: checks classroom/whiteboard integration and browser-facing contracts.
- `serve:app`: serves the full static site on port `3000` for local Supabase Auth redirects.
- `supabase:test:db`: first runs the fast Classroom Home, Calendar, lesson-request, Schedule coverage, consumer-parity, and multi-curriculum source regressions, then runs all rollback database characterizations; `supabase:audit` confirms actor integrity and zero retained characterization rows.
- Other `supabase:*` commands manage the local Docker-backed Supabase stack for auth/profile/backend testing.

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
