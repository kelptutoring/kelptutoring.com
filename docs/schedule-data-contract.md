# Schedule data contract

The scheduling UI uses three separate records. Keeping them separate lets built-in and tutor-authored tracks feed the same builder while student progress remains independently editable.

## 1. Track catalogue

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
        isImplicit,
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

The built-in catalogue is generated from markdown. A future tutor track builder should return the same hierarchy from the backend. Built-in IDs are deterministic path-based IDs; backend-authored records can use database UUIDs.

## 2. Editable schedule

The builder stores one ordered schedule document:

```js
{
  schemaVersion: 1,
  id,
  name,
  status: "draft",
  startDate,
  endDate,
  timeZone,
  cadence,
  context: {
    levelId,
    levelTitle,
    subjectId,
    subjectTitle,
    trackId,       // one selected track, otherwise null
    trackTitle,    // selected track titles joined for display
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

`modules` is the editable outline that controls grouping and display order. A module keeps its source/track references when available, but its schedule title and order can change independently. Each session belongs to the nearest module above it in the builder outline.

Appearance rules use one of three targets:

```js
{ target: "schedule", moduleId: null, headerColor, stripeColor, templateName }
```

```js
{ target: "module", moduleId, headerColor, stripeColor, templateName }
```

```js
{ target: "title_stripe", moduleId: null, titleStripeColor, templateName: null }
```

The `title_stripe` rule changes only the underline beneath the schedule title. The title text remains black. If this rule is absent, the underline uses the first displayed module header color.

The title, module, type, difficulty, and planning link are copied source metadata. They remain editable schedule data; they are not a read-only snapshot. `sourceSessionId` records where a built-in session came from and is `null` for a custom class, review, or assessment.

Supported cadence values are:

```js
{ type: "day_interval", intervalDays: 3 }
```

```js
{
  type: "weekly_frequency",
  meetingsPerWeek: 2,
  weekdays: [1, 4]
}
```

Weekday numbers follow JavaScript's convention: Sunday is `0`, Monday is `1`, and Saturday is `6`. Weekly frequency accepts one to seven distinct weekdays. Date strings use `YYYY-MM-DD` and are interpreted in the student's IANA timezone stored in `timeZone`.

## 3. Assignment progress

Progress is keyed by scheduled-session ID and stored separately from the schedule definition:

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

The generated schedule page combines the schedule sessions with this progress record at render time. Editing and saving progress does not rewrite the reusable schedule document. PDF export renders the current combined view but is not the source of truth.
