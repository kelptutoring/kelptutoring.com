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

## 4. Multi-curriculum Course coverage

Phase 5.G.2.4.1 defines the forward contract without changing the currently
deployed single-focus database command. One Course/Classroom continues to own
one required active Schedule. A future active Version may combine governed
Sessions from several Education levels, Subjects, academic pathways, and Tracks:

```js
{
  schemaVersion: 1,
  primaryTrackKey,
  branches: [{
    branchKey,
    role: "primary" | "supporting",
    educationLevel: { nodeId, key, name, slug },
    goals: [{ key, name, slug }], // compatibility field for selected pathway labels
    subject: { nodeId, key, name, slug },
    track: { nodeId, key, name, slug }
  }]
}
```

Exactly one selected Track is primary. Supporting Tracks belong to the same
Course and never imply another Classroom or another Student-facing Schedule.
The compact Classroom label uses only values selected for the active Schedule:

```text
High School · AP + SAT · Physics + Mathematics
```

An unselected ACT, IB, or other pathway cannot appear just because the same
source content may support it. The Builder attaches pathway metadata to a Track
and groups it inside its Subject; pathway is not a mandatory navigation level
and is not the Student goal. Different pathways may reference materially
different books, problems, and Sessions even when they share concepts.

Every curriculum target carries the complete path:

```text
Education level → Subject → Track [optional pathway metadata] → Module → Session
```

The target snapshots one canonical Session identity and one source-content
version. A canonical Session appears only once as an active curriculum target
in a Schedule Version. Another tutoring occurrence may discuss the same target
and retains its own Class/slot/outcome record without adding another Studied or
Practiced denominator unit. Homework creates no tutoring occurrence and no
duplicate target. Planned or post-lesson Review/Practice items may link to the
canonical Session; Exams and wrap-ups may be branch-specific or Course-wide.
Arbitrary custom curriculum topics do not receive governed Track identity.

The assigned Tutor must be qualified for every selected branch. A Mentor
supervises without inheriting teaching authority; if acting as a Tutor, the
Mentor needs the same applicable qualification. A Quality Assistant manages
oversight and disputes without teaching authority.

Phase 5.G.2.4.2 persists that contract in
`course_schedule_version_coverages`. The row is keyed by the immutable Schedule
Version and stores the exact immutable coverage snapshot, primary Track, derived compact
label, and provenance. Existing Versions receive one primary branch from the
retained Course Subject/focus, an empty `goals` array, and
`legacy_course_scope` provenance. This is an insert-only migration: it does not
replace Versions or alter dates, items, progress events, Classrooms, or
Memberships.

Legacy coverage also captures `sourceSubjectNodeId` and `sourceFocusNodeId` in
its immutable metadata. Later Schedule replacement may legitimately change the
Course's current compatibility Subject or focus; that must not invalidate or
rewrite an earlier Version. Historical legacy coverage is therefore checked
against its captured source metadata, never against the mutable current Course
focus.

Phase 5.G.2.4.3.1 adds the schema-v2 reusable Builder plan. Standalone authors
navigate Education level → Subject, filter/group Track cards by optional
pathway metadata, and retain Tracks from different branches in one selection
tray. Exactly one selected Track is primary. A branch joins reusable coverage
only after at least one governed Track Session is selected; supplemental
Review, Practice, Exam, and Wrap-up items cannot establish coverage. Each
generated Session carries its own Education-level, Subject, pathway, Track,
Module, planning-link, and content-version identity.

Phase 5.G.2.4.4 introduces the governed multi-branch publisher. The complete
schema-v2 Builder coverage is resolved to canonical active curriculum nodes,
and every branch must contain an active governed Session. The assigned Tutor
must have an active qualification at the selected Track or one of its
ancestors; a Mentor's qualification never substitutes. Qualification rows are
locked for the transaction and their IDs/scopes are copied into the immutable
publication receipt and Version-coverage metadata.

The successor Version, selected coverage, primary Course Subject/focus
compatibility projection, reasons, Course dates, and notifications commit
together. Expected-Version concurrency and full-request idempotency remain
mandatory. The direct structural command may edit only the already active
coverage and therefore cannot bypass branch qualification by adding another
same-Subject Track.

A complete replacement occurs only when the old and proposed active Track sets
have no overlap. It receives a new plan epoch and records
`historicalProgressLocation = previous_schedule`: the active Classroom Home
uses only the new plan, while all old progress stays attached to the retained
historical Schedule. Partial replacements retain the plan epoch and keep
continuing Track progress in the active Schedule and Classroom Home.

A complete replacement owns its new active-plan start. The Builder accepts any
Student-local date from today onward and must not floor that choice at the
former Version's future start. If the former plan has not begun, the Course's
future activation edge follows the replacement Version; once the Course start
is today or elapsed, it remains immutable. An ordinary continuation never
receives this exception.

Every `studied/marked` progress event has immutable restoration provenance:
the exact Schedule Version, plan epoch, cadence authored on that Version, and
the stable-item keys preceding the marked Session in nearest-first order.
Reversal retains this evidence. Adaptive restoration removes the reversed
Session from the ordinary unfinished lane, inserts it after the nearest
captured predecessor that remains (or first when none remain), and maps the
result through the then-current active cadence. It never guesses from an
obsolete Calendar projection, rewrites the mark-time cadence, reuses a stale
effective date, or moves a locked occurrence target. Static Schedules retain
their frozen-date contract.

`effectiveCourseEnd` is the maximum effective date in the active Version. A
currently Studied curriculum Session uses its actual Studied local date; every
unfinished curriculum Session, Review, or Exam uses its current target-mapping
date, including a Static-frozen date. Unmapped legacy rows fall back to their
immutable planned date. The projection may contract, expand, or follow a new
cadence, but it never rewrites `student_courses.scheduled_end_date`. Calendar
Course End events are rebuilt from this one value for every authorized role and
consumer.

Every Builder publication also carries one `effectiveFutureLane`: a complete,
ordered vector of stable Session identities and frontend-calculated cadence
dates. It is independent of the visible Schedule rows, where a Studied Session
continues to show its actual Studied date. The server validates the vector's
identity order, Student-local boundary, and every gap-free cadence date before
materializing immutable academic slots. It never fills gaps, substitutes a
former Version's weekdays, or recalculates a different lane. Adaptive target
mapping consumes these slots only for unfinished Sessions.

For an ordinary continuation, the original Course start date is immutable and
the current cadence is the Builder default. A changed cadence is applied only
to future flexible items; past items and items with Studied progress retain
their dates and positions. A delivered Class occurrence remains immutable and
makes its Track started, but it does not by itself mark the original curriculum
target Studied. If that future target remains unfinished after a delivered
Review, Exam, Practice, pivot, or other non-completing Class, its date and
position may follow the revised cadence. Practiced progress remains
attached to its stable curriculum item, and that item cannot be removed from a
continuing Version, but its future date and position may follow a revised
cadence because Practice does not consume a lesson opportunity. Keeping at
least one former Track is a continuation. Dropping an untouched Track is
allowed, but a Track with Studied or Practiced progress or a delivered
occurrence is started and cannot be removed from a continuing Version. Reviewed
alone does not establish started work. Replacing every former Track is the
explicit complete-replacement boundary.

Direct update or deletion of Version coverage is rejected. Student RLS exposes
only the active Version's
coverage, while authorized Tutors and Mentors may read historical Version
coverage and unrelated accounts see nothing. Branch labels such as `Active`
and `Completed` are derived from the current effective plan and progress; they
are not frozen into the immutable snapshot. `Delivered` continues to describe
one Class occurrence.

## Student Studied hold

An actual timed Class in the active Schedule creates one Student-only Studied
hold from T−6 hours through its start. During that interval, the Student cannot
create a new Studied progress event, because that action could advance an
Adaptive plan after the Tutor has begun preparing the Class. The database
rejects the command before any progress event, mapping revision, or target lock
is retained. The canonical Classroom projection exposes the same hold state so
the interface can disable Studied proactively.

Reviewed and Practiced remain available during the hold because they do not
change the target sequence. Tutor/Mentor progress and correction workflows are
not governed by this Student-only rule. Structural date fallbacks and other
date-only opportunities have no start time and therefore cannot create a hold.
A recurring Class and a booked on-demand Class use the same rule whenever each
is represented by a timed academic slot.
