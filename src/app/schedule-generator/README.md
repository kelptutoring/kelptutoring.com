# Schedule generator

## Function

The schedule generator lets a tutor compose an editable teaching schedule from the built-in course catalogue or custom sessions. A tutor chooses a level, subject, and one or more tracks, selects sessions, arranges them into modules, defines the student's meeting cadence and timezone, reviews every calculated date, and saves the resulting schedule.

The generated schedule remains interactive. Session titles link to their planning pages, tutors can restyle the schedule, and assigned students can edit progress fields. Printing creates a PDF representation of the current schedule; the PDF is not the source of truth.

## Entry pages and main files

- `schedule-generator.html` is the tutor-facing, multi-step builder.
- `schedule-generator.js` owns builder state, draft restoration, catalogue selection, custom sessions, module editing, reordering, undo/redo, and preview/save navigation.
- `schedule-domain.js` is the date-only cadence engine and schedule-document builder.
- `schedule-outline.js` contains the module/session outline operations used by drag-and-drop, arrow controls, add/remove, and reassignment.
- `generated-schedule.html` displays the saved schedule and its appearance/progress controls.
- `generated-schedule.js` merges the schedule with progress, renders module tables, manages color rules, and invokes browser printing.
- `../../data/tracks-data.js` is the generated catalogue consumed by the builder.
- `../schedules/**/*.md` is the planning source of truth from which the catalogue and static planning pages are generated.
- `../../../docs/schedule-data-contract.md` describes the catalogue, schedule, cadence, and progress records in more detail.

## Workflow

1. Select the education level.
2. Select the subject.
3. Select one or more tracks, such as Algebra 1 plus Algebra 2 or Mechanics plus Optics.
4. For each selected track, expand modules and choose the sessions to include. Custom sessions can be added alongside catalogue sessions.
5. Enter the schedule name, first meeting date, student's IANA timezone, and cadence:
   - a fixed number of days between meetings; or
   - one to seven selected meeting weekdays per week.
6. Review the complete outline. Modules and sessions can be renamed, collapsed, reordered, added, or removed. Moving a module moves its sessions as a block; moving an individual session can reassign it to the module immediately above it.
7. Review all calculated meeting dates and the overall end date, then save.
8. The generated page reads the saved schedule, renders planning links, and keeps assignment progress in a separate record.

The builder automatically stores its current step and working state in `kelpScheduleBuilderDraft`. Returning to an earlier step does not discard later selections.

## Source catalogue

`src/data/tracks-data.js` exposes `globalThis.tracksCatalog` with schema version `1`:

```js
{
  schemaVersion: 1,
  levels: [{
    id,
    title,
    subjects: [{
      id,
      title,
      tracks: [{
        id,
        title,
        modules: [{
          id,
          title,
          sessions: [{
            id,
            sourceSessionId,
            moduleId,
            title,
            difficulty,
            planningHref,
            type
          }]
        }]
      }]
    }]
  }]
}
```

Built-in IDs are deterministic and path-based. A future tutor-authored track service should return the same normalized hierarchy, even if its IDs are database UUIDs. Do not edit `tracks-data.js` by hand; it is regenerated from the schedule markdown tree.

## Saved schedule data

The builder writes `kelpGeneratedSchedule` as a schema-versioned document:

```js
{
  schemaVersion: 1,
  id,
  name,
  status: "draft",
  startDate,             // YYYY-MM-DD
  endDate,               // YYYY-MM-DD
  timeZone,              // student's IANA timezone
  cadence,
  context: {
    levelId,
    levelTitle,
    subjectId,
    subjectTitle,
    trackId,              // set when exactly one track is selected
    trackTitle,           // selected track names joined for display
    trackIds,
    trackTitles
  },
  modules: [{
    id,
    sourceModuleId,
    trackId,
    trackTitle,
    title,
    order
  }],
  styleRules: [],
  sessions: [{
    id,
    sessionNumber,
    startDate,
    endDate,
    sourceSessionId,
    trackId,
    trackTitle,
    moduleId,
    moduleTitle,
    title,
    planningHref,
    type,
    difficulty,
    notes
  }]
}
```

`startDate` and `endDate` are currently the same meeting date for each session. Both fields are retained in the contract for compatibility, although the generated table presents the value as `Date`.

Built-in sessions keep `sourceSessionId` and `planningHref`. Custom sessions use `sourceSessionId: null`. The copied title, module, type, and difficulty remain editable schedule data; the schedule is not a read-only content snapshot.

Supported cadence objects are:

```js
{ type: "day_interval", intervalDays: 3 }
```

```js
{
  type: "weekly_frequency",
  meetingsPerWeek: 3,
  weekdays: [1, 3, 5]
}
```

Weekday numbers follow JavaScript's convention: Sunday is `0`, Monday is `1`, and Saturday is `6`. All calculations use date-only `YYYY-MM-DD` strings. `timeZone` stores the student's timezone for later backend/session interpretation; the cadence engine deliberately avoids browser-local timestamp arithmetic.

## Appearance rules

Appearance rules are stored in `scheduleDocument.styleRules` and duplicated in `kelpScheduleStyle_<scheduleId>` for the generated page. The supported targets are:

```js
// Default colors for every module without an override
{ target: "schedule", moduleId: null, headerColor, stripeColor, templateName }

// Colors for one module
{ target: "module", moduleId, headerColor, stripeColor, templateName }

// Independent underline beneath the schedule title
{ target: "title_stripe", moduleId: null, titleStripeColor, templateName: null }
```

The title text remains black. If no `title_stripe` rule exists, the underline falls back to the first module header color. Display cards are ordered as Entire schedule, Header's stripe, then module overrides in ascending module-number order.

## Assignment progress

Progress is intentionally separate from the reusable schedule document and is keyed by scheduled-session ID:

```js
{
  scheduledSessionId: {
    done,
    workedOn,
    practiced,
    perception
  }
}
```

It is stored under `kelpGeneratedScheduleProgress_<scheduleId>`. Editing progress does not rewrite the schedule definition. This separation maps to the intended backend flow: track content -> schedule -> student assignment -> private assignment progress.

## Browser storage

- `kelpScheduleBuilderDraft`: builder selections, outline history, settings, and current step.
- `kelpGeneratedSchedule`: the current editable schedule document.
- `kelpGeneratedScheduleSavedAt`: the latest saved timestamp shown in the UI.
- `kelpGeneratedScheduleProgress_<scheduleId>`: per-session assignment progress.
- `kelpScheduleStyle_<scheduleId>`: appearance rules for the current schedule.
- `kelpScheduleStyle`: legacy appearance fallback read by older schedules.

These keys are the current prototype persistence layer. Backend wiring should replace storage access without merging progress into the schedule record.

## Exported output

- Schedule document: the JSON object above, currently stored in `localStorage` and suitable for a schedule API payload.
- Progress document: a separate ID-keyed record suitable for an assignment-progress table.
- PDF: produced with `window.print()` from the generated schedule page. Print CSS hides controls and formats the current visible schedule.
- Planning navigation: `planningHref` points a scheduled session back to its static or tutor-created planning page.

## Regeneration and tests

Run commands from the repository root:

```bash
npm run generate:tracks
npm run generate:schedules
npm run watch:schedules
npm run test:schedule-domain
npm run test:schedule-outline
npm run test:schedule-builder
```

- Use `generate:tracks` after catalogue-only markdown edits.
- Use `generate:schedules` after planning markdown edits to rebuild static HTML and catalogue data.
- `schedule-domain` verifies date/cadence calculations.
- `schedule-outline` verifies module/session outline mutations.
- `schedule-builder` verifies page wiring, catalogue integrity, links, and key UI contracts.

## Debugging notes

- Serve the repository over HTTP for reliable navigation; opening HTML files directly can produce inconsistent browser behavior.
- If catalogue changes do not appear, regenerate `src/data/tracks-data.js` and check the browser cache.
- If a generated page is empty, inspect `kelpGeneratedSchedule` for valid JSON and a non-empty `sessions` array.
- If dates look wrong, verify the cadence type, weekday values, first meeting date, and the student's IANA timezone separately.
- If appearance looks stale, inspect both `scheduleDocument.styleRules` and `kelpScheduleStyle_<scheduleId>`.
- The schedule document is editable, but source references remain stable. Updating a built-in track later must not silently rewrite an already-created schedule.
