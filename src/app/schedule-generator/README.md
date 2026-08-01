# Schedule generator

## Function

The schedule generator lets a tutor compose an editable teaching schedule from the built-in course catalogue or custom sessions. A tutor chooses a level, subject, and one or more tracks, selects sessions, arranges them into modules, defines the student's meeting cadence and timezone, reviews every calculated date, and saves the resulting schedule.

The generated schedule remains interactive. Session titles link to their planning pages, tutors can restyle the schedule, and assigned students can edit progress fields. Printing creates a PDF representation of the current schedule; the PDF is not the source of truth.

## Entry pages and main files

- `schedule-generator.html` is the tutor-facing, multi-step builder.
- `schedule-generator.js` owns builder state, draft restoration, catalogue selection, custom sessions, module editing, reordering, undo/redo, preview/save navigation, and authenticated Course publication mode.
- `course-schedule-adapter.js` converts one generated plan into a complete reasoned successor payload while preserving past history and making removed future items explicit drops.
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
5. Enter the schedule name, first meeting date, student's IANA timezone, cadence, and pacing mode:
   - a fixed number of days between meetings; or
   - one to seven selected meeting weekdays per week.
6. Review the complete outline. Modules and sessions can be renamed, collapsed, reordered, added, or removed. Moving a module moves its sessions as a block; moving an individual session can reassign it to the module immediately above it.
7. Review all calculated meeting dates and the overall end date, then save.
8. The generated page reads the saved schedule, renders planning links, and keeps assignment progress in a separate record.

The standalone builder stores its working state in `kelpScheduleBuilderDraft`. Course mode uses a Course-scoped draft key, receives its Subject/focus and expected active Version from the server, and publishes an immutable successor rather than writing the final result to browser storage.

### Continuing or replacing an active Course Schedule

When Course mode opens an active Schedule, the Builder preloads its current cadence and locks the original Course start date. A Session-selection draft cannot replace that active cadence with untouched form defaults; once the Tutor deliberately edits cadence, however, that in-progress choice survives reload. A cadence change affects only future flexible meetings and milestones. Past and Studied items keep their retained dates and positions. A delivered Class remains immutable occurrence history, but an unfinished target discussed during that Class may still move; Practiced progress likewise remains attached to its curriculum item without reserving a lesson opportunity. The final publisher assigns one continuous cadence only after every selected Track has been combined into definitive order, so a Track boundary cannot restart the weekday sequence or leave a valid slot vacant. Workflow Back navigation sits after the Builder content rather than in the page-level header.

Keeping at least one former active Track is an ordinary continuation. An untouched Track may be removed without discarding continuing progress. Replacing every former Track starts a new Schedule plan. Studied or Practiced progress and a delivered Class each make a Track started; Reviewed alone does not. A started Track cannot be removed through an ordinary continuation: the Builder warns staff and requires the explicit replacement path. The former Schedule and its progress remain available in History, while the new Classroom Home reads only the replacement plan.

## Source catalogue

`src/data/tracks-data.js` exposes `globalThis.tracksCatalog` with schema version `2`:

```js
{
  schemaVersion: 2,
  levels: [{
    id,
    title,
    subjects: [{
      id,
      title,
      tracks: [{
        id,
        title,
        academicPathway,     // null or { key, title }
        modules: [{
          id,
          title,
          sessions: [{
            id,
            sourceSessionId,
            moduleId,
            title,
            difficulty,
            sourceContentVersionKey,
            planningHref,
            type
          }]
        }]
      }]
    }]
  }]
}
```

Built-in IDs are deterministic and path-based. Every Markdown Session also receives a deterministic SHA-256 content-version key, and generated Subject/Track nodes carry taxonomy slugs for Course validation. A future tutor-authored track service should return the same normalized hierarchy, even if its IDs are database UUIDs. Do not edit `tracks-data.js` by hand; it is regenerated from the schedule markdown tree.

## Saved schedule data

The builder writes `kelpGeneratedSchedule` as a schema-versioned document:

```js
{
  schemaVersion: 2,
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
    trackId,              // primary Track compatibility identity
    trackTitle,           // included Track names joined for display
    trackIds,
    trackTitles,
    coverage: {
      schemaVersion: 2,
      primaryTrackKey,
      branches: [{
        role: "primary" | "supporting",
        educationLevel,
        academicPathways,
        subject,
        track
      }]
    }
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
    educationLevelId,
    educationLevelTitle,
    subjectId,
    subjectTitle,
    academicPathway,
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

`pacingMode` is either `adaptive` or `static`:

- `adaptive` is the default. Studied progress moves eligible unfinished work into earlier academic opportunities, while a recurring Class target inside its six-hour hold stays locked.
- `static` still records Studied, Reviewed, and Practiced progress, but freezes the effective future dates captured when the mode is selected.

For an assigned Course, pacing changes are governed backend commands. A pacing-only edit appends policy history without manufacturing a structural Schedule change; a pacing change published with curriculum edits is attached to the successor immutable Version.

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

- `kelpScheduleBuilderDraft`: schema-v2 subject-first branch selections, primary Track, outline history, settings, and current step. Schema-v1 drafts are filtered against the current catalogue and upgraded when restored.
- `kelpGeneratedSchedule`: the current editable schedule document.
- `kelpGeneratedScheduleSavedAt`: the latest saved timestamp shown in the UI.
- `kelpGeneratedScheduleProgress_<scheduleId>`: per-session assignment progress.
- `kelpScheduleStyle_<scheduleId>`: appearance rules for the current schedule.
- `kelpScheduleStyle`: legacy appearance fallback read by older schedules.

These keys are the current prototype persistence layer. Backend wiring should replace storage access without merging progress into the schedule record.

## Phase 5.E Track Session boundary

Markdown remains the editable source for built-in Track content, and generated HTML remains a preview/runtime prototype. Phase 5.E.1 adds backend identities for the source Track, Module, Session, content version, normalized difficulty, planning route, and Course-specific resource snapshot. Resources are assigned as `required`, `optional`, or `not_assigned`: required resources count toward later Session aggregation, optional resources never block completion, and not-assigned resources remain hidden from the Student.

The static planning URL is not sufficient historical identity because a later Markdown deployment can replace its content. Phase 5.E progress therefore pins a completed Session to its exact Schedule item/content/resource snapshot. Unstudied Sessions may later adopt a published Track successor; full immutable Markdown-derived publication and synchronization belongs to Phase 15. Phase 5.E.4 lets staff open this existing Builder from a Classroom and publish through the governed expected-Version command. The currently implemented Classroom mode derives and locks the Course's single content, skips level/subject/track selection, and begins at **Choose sessions**; Back returns to the Classroom instead of escaping into another Track. Phase 5.G.2.4.1 defines the multi-curriculum coverage boundary. The standalone Builder now uses the Phase 5.G.2.4.3.1 **subject-first multi-branch** flow: Education level → Subject → Track → Module → Session. Academic pathway labels such as Regular, AP, IB, SAT, or ACT group and filter Track cards within a Subject; they are not a mandatory navigation level and are not the Student's goal. Missing pathway metadata displays under Regular without adding invented data to the reusable plan.

The selection tray persists Tracks from different Education levels and Subjects, identifies one primary Track, allows supporting Tracks, and returns directly to any branch for editing. A branch enters schema-v2 reusable coverage only after at least one governed Track Session is selected. Review, Practice, Exam, and Wrap-up items stay supplemental and cannot establish curriculum coverage by themselves. Generated Sessions retain their own Education level, Subject, pathway, Track, Module, source-content version, and planning destination.

Phase 5.G.2.4.3.2 adds governed **Classroom preloading and recovery**. Classroom mode begins on the primary Track with every resolvable active coverage branch and eligible future Session selected. Existing stable Schedule-item keys are carried into the preview so a retained Session is not mistaken for a new one. Studied, delivered, past, and dropped work appears only in the staff recovery context as locked history; it does not add technical notices or retained-history counts to the Student Schedule. A missing catalogue branch or Session remains represented by its stored Version snapshot, while an eligible Session whose content hash changed is labelled **Updated from Track** and uses the current Track source in the draft. Neither case silently rewrites Supabase.

Course-scoped browser drafts now record the Course and active Version they were based on. A stale draft is never merged with a successor Version: the current Version is preloaded and the old draft is retained as a read-only local recovery copy until staff discard it. Staff may traverse `Education level → Subject → Track → Module → Session` through **Add content from another Track** without losing current selections. Multi-branch, primary-Track, missing-source, and Track-source-update drafts may be previewed, but their Publish action remains explicitly locked until Phase 5.G.2.4.4 validates the assigned Tutor's complete qualifications and persists the proposed Version atomically. Ordinary unchanged single-branch coverage remains on the existing expected-Version publisher.

## Course-assignment sync bridge

Phase 7 introduces authoritative backend schedule/session records for course delivery while leaving the Schedule Generator prototype unchanged. In Course Builder, **Sync browser schedule** reads `kelpGeneratedSchedule`, associates it with the mentor-selected student, and calls `upsert_student_learning_schedule(student_id, schedule_json)`. The server validates the timezone and session document, preserves the supplied stable schedule/session UUIDs, upserts active sessions, and marks sessions removed from a later sync as inactive.

A mentor can then bind a saved course to one active scheduled-session ID. The resulting assignment copies the schedule/session labels and the course questions into an immutable snapshot; later edits to this browser schedule, source course, or source questions cannot alter the student's existing activity. This sync action is a transitional bridge. When the Schedule Generator gains native backend persistence, it should write the same `learning_schedules` and `learning_schedule_sessions` contract directly and remove the manual sync step.

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
npm run test:schedule-sources
npm run test:course-practice
```

- Use `generate:tracks` after catalogue-only markdown edits.
- Use `generate:schedules` after planning markdown edits to rebuild static HTML and catalogue data.
- `schedule-domain` verifies date/cadence calculations.
- `schedule-outline` verifies module/session outline mutations.
- `schedule-builder` verifies page wiring, catalogue integrity, links, and key UI contracts.
- `schedule-sources` verifies the Phase 5.E.1 immutable Session/resource identity and visibility boundary.
- `schedule-continuation` verifies locked starts, Sunday-first cadence preload, exact multi-week weekday changes across combined Tracks, future Practiced and unfinished delivered-target reflow, continuation/replacement classification, delivered-Class history protection, and selected-Session presentation.

## Debugging notes

- Serve the repository over HTTP for reliable navigation; opening HTML files directly can produce inconsistent browser behavior.
- If catalogue changes do not appear, regenerate `src/data/tracks-data.js` and check the browser cache.
- If a generated page is empty, inspect `kelpGeneratedSchedule` for valid JSON and a non-empty `sessions` array.
- If dates look wrong, verify the cadence type, weekday values, first meeting date, and the student's IANA timezone separately.
- If appearance looks stale, inspect both `scheduleDocument.styleRules` and `kelpScheduleStyle_<scheduleId>`.
- The schedule document is editable, but source references remain stable. Updating a built-in track later must not silently rewrite an already-created schedule.
