# Kelp current product contract

Status: Living implementation reference

Last consolidated: 2026-07-20

## Purpose

This document contains the stable product decisions needed to build Kelp one vertical feature at a time. It replaces the former 54-phase documentation program as the active source of truth.

It is intentionally concise. Detailed edge cases remain in [historical product documents](historical/README.md) until an implementation phase needs them. Legal, accounting, payment-provider, safeguarding, and jurisdiction-specific decisions remain provisional until specialist review.

## How decisions become implementation

Every product phase follows the same delivery pipeline:

1. Inspect the current page, code, data, and dependencies.
2. Resolve only questions that block the feature.
3. Design the schema and row-level-security boundaries.
4. Implement server-authoritative commands and queries.
5. Enhance and connect the frontend.
6. Test authorization, behavior, failure states, responsiveness, and accessibility.
7. Record the implemented contract and deferred decisions concisely.

A browser route, hidden button, role label, cached object, or client clock is never authorization or financial authority.

## Core domain model

### Identity and access

- An **Account** is the authenticated identity.
- A **Profile** stores shared person-facing information and is not a financial ledger or permission record.
- One Account may hold several active **Role Assignments**.
- A preferred workspace changes navigation only; it does not remove or grant capabilities.
- Authorization is evaluated server-side from capabilities, relationships, resource state, and restrictions.
- Sensitive state and preferences are stored server-side, not only in browser storage.

### Learning structure

- A **Course** is the Student-specific academic track approved by a Mentor. It owns goals, curriculum scope, a versioned learning schedule, progress, and reporting period.
- A **Classroom** is the persistent Course space containing Overview, Forum, Files, assignments, history, and Report Cards.
- A **Class** is one scheduled lesson event for one Subject.
- A **Class Session** is the live occurrence attached to a Class, including admission, presence, forms, tools, and attendance evidence.
- A **Classroom Card** is a Dashboard shortcut and summary. It is not the Classroom itself.
- An **Assignment** is academic work with a deadline and submission workflow.
- An **Exam** is graded work such as a weekly assessment, midterm, or final.
- A **Report Card** is Course-scoped and calculated from Course evidence.

### Curriculum taxonomy

The governed Course path is **Education level → Subject → Track → Module → Session/topic**.

- **Education level** is the learner stage, such as Middle School, High School, or College.
- **Academic pathway** is optional Track metadata, such as Regular, AP, IB, SAT, ACT, O-Level, or A-Level. It groups and filters Track choices inside a Subject and may select different books, problems, and Session plans.
- **Student goal** is a separate Student/Course intention, such as passing AP Physics. It may justify supporting Tracks but does not become a mandatory curriculum-navigation step.
- **Subject** is the broad domain, such as Mathematics, Physics, or Biology.
- **Track** is a governed branch within one Subject, such as Mechanics, Electromagnetism, Algebra 1, or Algebra 2.
- **Module** groups related Sessions inside one Track.
- **Session/topic** is a selectable concept or lesson plan inside a Module.
- One Class has one Subject. Standalone lesson requests require Subject, Track, and Session/topic selected from governed options that the Tutor is qualified to teach.
- One Course/Classroom always owns one required active Schedule, but planned Phase 5.G.2.4 permits that Schedule to combine qualified Sessions from multiple Education levels, Subjects, and Tracks. Each Class still retains one actual Subject/target context.
- Stable identifiers and submitted labels are snapshotted so later taxonomy edits do not rewrite history.

## Roles and operating models

### Student

Students access their Profile, Dashboard, Courses, Classrooms, Calendar, academic work, reports, preferences, and permitted scheduling and support actions.

### Guardian

A verified Guardian is linked to specific children rather than inferred from age, surname, address, or payment method. Within that scope, Guardians receive Tutor-equivalent educational visibility but not Tutor authorship or teaching authority. They may download reports, submit attributed requests, configure their own notifications, and purchase for a child. Guardian identity may be hidden from ordinary child-facing UI, but never from Kelp authorization and audit.

### Tutor and Mentor

Tutor and teacher mean the same teaching function in the product. A Mentor is a Tutor who may supervise qualified Kelp Tutors. A Kelp Tutor may teach only within qualifications also supported by their one supervising Mentor. A Mentor designs or approves Courses, assignments, and reassignment decisions within their authority.

### Quality Assistant, Support, and Administrator

A Quality Assistant supervises quality above Mentors, may investigate complaints, and may confirm or override authorized decisions. Support performs intake and communication but does not gain unrestricted product mutation. Administrators handle narrow system authorities such as role management and exceptional corrections; Administrator is not universal day-to-day educational access.

### Kelp Tutor and independent Tutor

- A **Kelp Tutor** works within Kelp's qualification, supervision, scheduling, payment, and quality model.
- An **Independent Tutor** pays Kelp a flat USD 10 monthly platform fee, manages private Student payments outside Kelp, and is not subject to Kelp Tutor compensation or payment-dispute handling.
- Independent Tutors may use Kelp Courses or create collaborative educational products. Product-rights and revenue-sharing details beyond the currently agreed collaboration remain deferred for specialist review.

Tutor/provider access is approved rather than self-granted. An applicant chooses a Kelp-Tutor, independent-Tutor, or institution track and supplies the evidence appropriate to that claim, including background and mock-session review where required. Quality review and approval precede the applicable platform payment gate. The exact provider-subscription and payment-analysis workflow remains a later commercial contract.

An independent Tutor may be self-employed with no Mentor or may operate under a school Mentor. A self-employed Tutor owns the academic Schedule and Course-finishing authority for their own Students. School Quality, Mentor, Tutor, and administrative authority is organization-scoped and never grants global Kelp Quality access. Student connections use revocable invitation codes and Student acceptance rather than stable public Profile identifiers.

## Course lifecycle

1. A signed-in Student requests a Kelp trial and completes the Intake goals/strategy form; a Guardian may add separately attributed supplemental information.
2. Kelp proposes an Intake Mentor and a Quality Assistant confirms or overrides.
3. An Intake Waiting Room is created for the Student, Intake Mentor, and scoped Quality Assistant. It resembles a Classroom but has no Course, Tutor, or Schedule and remains a separate authorization domain.
4. The Intake Mentor conducts the trial and assigns or validates a target-Subject Assessment. A same-Subject Assessment may be reused for 90 days when the Mentor confirms it remains representative.
5. After results are available, the Mentor selects a qualified and available Tutor and assigns an authoritative Schedule. The Tutor may request reassignment with a reason but may not silently reject an authoritative assignment.
6. The Student acknowledges the Course summary and chooses meeting times from the assigned Tutor's eligible availability.
7. Platform-payment readiness is required before activation. Lesson credits are acquired only when the first funded Class commitment requires them.
8. Activation atomically creates the Course, Schedule version 1, Classroom, and active Memberships. The Intake Waiting Room closes read-only and links to the resulting Classroom.

The Intake Mentor becomes the supervising Mentor. Because one Kelp Tutor has one supervising Mentor, an Intake Case is handed to the Tutor's qualified Mentor before assignment when necessary.

During intake, Kelp sends inactivity reminders after 3, 7, and 14 days, pauses after 14 days, and closes after 30 days. Kelp-caused delays do not count.

### Extension and termination

- A Course enters a 14-day wind-down after its scheduled end.
- A Mentor or Quality Assistant may extend a Kelp Course during wind-down. The same Course, Classroom, Tutor Assignment, and Memberships continue; the Schedule is versioned and the wind-down restarts from the new end date.
- If not extended, the Course terminates automatically after wind-down.
- Termination ends the Course-scoped Tutor Assignment, cancels incomplete required work and pending lesson requests, cancels future Classes, dismisses an owed but unsubmitted Exam, and generates the mandatory final Report Card.
- The Classroom becomes inactive and remains historically readable according to authorization and retention rules.
- Active and wind-down Classrooms cannot be archived. An authorized member may archive or restore only an inactive Classroom for their own view.

Tutor reassignment keeps the same Course and Classroom. Membership and access change at an auditable cutover; the former Tutor retains only their authorized historical period, while the replacement receives the educational handoff needed for continuity.

## Scheduling and Calendar

### Course schedule

- Recurring tutoring uses weekly meetings selected by the Student from Tutor availability.
- A recurring Course may have several weekly Classes. Meeting duration remains a pricing and analytics input, but no duration or default “Theory” label advances progress. A completed Class never advances progress automatically; the Student or Tutor must explicitly mark the topic Studied.
- Neutral recurring meetings supply academic slots, while explicit Studied events determine which topic the next ordinary meeting targets.
- On-demand and access-only Courses have no recurring Class commitment, but their Student-facing effective academic Schedule still reflows when the learner records independent progress. The immutable original plan and every actual Studied timestamp remain available to authorized staff without forcing the Student to compare two separate Schedules.
- A recurring schedule change updates ordinary future recurring Classes but does not rewrite Extra Classes or previously rescheduled exceptions.

### Calendar presentation and Lesson Request entry

The Student Calendar will share one authoritative event and availability engine
across the Dashboard and Classroom, while presenting different scopes:

- The global Calendar supports Month and Week overview modes plus a time-grid
  mode, provisionally named `Timeline`, that initially presents approximately
  five days and the complete 00:00–24:00 range. It shows how Classes,
  Assignments, and other deadlines occupy time rather than reducing every date
  to an undifferentiated event label.
- Selecting a day in Month or Week opens the Lesson Request modal with that date
  prefilled. Selecting a position in Timeline also prefills its time. Date and
  time remain editable until the request is submitted.
- Starting a Lesson Request activates an explicitly labeled, temporary
  Tutor-availability overlay. The Student chooses the relevant Subject or Course
  and Tutor before selecting a Slot. Non-blocking Assignment and milestone
  detail may recede visually while the overlay is active, but the Student's
  already-booked Classes remain visible as conflicts.
- The overlay distinguishes Tutor availability, unavailable time, the Student's
  conflicts, and any authorized competing-request indication. It never exposes
  another Student's identity or a private reason for Tutor unavailability.
- Viewing availability does not reserve a Slot. Booking remains an authoritative
  server request with later availability, concurrency, and credit validation.
  The overlay clears after submission, cancellation or abandonment, a Tutor
  context change, or departure from the booking workflow.
- The Classroom Home includes a Calendar backed by the same engine. It is
  Course-aware and may request availability only for the Classroom's currently
  assigned Tutor, whereas the global Calendar may retrieve other Tutors allowed
  by matching rules. Other personal commitments may appear there as
  privacy-safe busy blocks without exposing unrelated Classroom content.
- The Classroom Calendar participates in the Student's per-Classroom movable,
  minimizable, and maximizable Home layout alongside This week, Assignments,
  Track progress, and Next week.

Phase 5.H owns the compact Classroom Home and its Course Schedule integration.
Phase 10 owns the complete Calendar interaction and Lesson Request workflow;
Phase 11 adds credit validation, and Phase 12 turns accepted bookings into
attendance-bearing live Classes.

Phase 5 distinguishes three records that must not overwrite one another:

- The **Schedule** is the stable Course-owned container.
- A **Schedule Version** is an immutable ordered plan of topics, future cadence slots, timezone, effective dates, author, reason, and predecessor. Exactly one version is active; every plan edit creates another version and preserves all earlier versions.
- **Course Progress** records what the Student has Studied, Practiced, or Reviewed without rewriting a Schedule Version.

A Schedule item is one expected topic such as A, B, or C. An ordinary Class has one primary Schedule item but separately records its purpose, such as Theory, Practice, Review, or Doubts. Completing a Class never marks its topic Studied automatically. The Tutor may mark the topic Studied in the post-Class workflow or leave it unmarked; the Student may also mark a topic Studied after independent work. The next ordinary meeting targets the earliest active unstudied topic, including when the Student has studied later topics independently.

Studied is shared Course progress. The current Student or Tutor may mark it; only the current Tutor or Course Mentor may reverse it, and a reversal requires an audited reason. For a self-employed independent Tutor without a Mentor, that Tutor owns the reversal and Course-finishing authority. Practiced and Reviewed are Student-oriented indicators and do not advance the shared Course pointer. Progress changes append actor/time events and do not create Schedule Versions.

The Classroom Home Track percentage is a projection, not another ledger. Every active
Curriculum Session contributes two equal completion units: one for Studied and one
for Practiced. The percentage is `(Studied Session marks + Practiced Session marks) /
(active Curriculum Sessions × 2)`. Reviewed remains visible history but does not
change the percentage. Review, Exam, Wrap-up, dropped Schedule items, and
resource-level marks do not add denominator units. A Studied correction or an
authorized newly published future Curriculum Session may therefore lower the current
percentage while all earlier events remain auditable.

Progress is hierarchical. A Curriculum Schedule item links to one stable Track Session. Each Course snapshots the Session's assigned resources as required, optional, or not assigned according to the learner's intake and later authorized personalization. Required resources are visible and count toward derived Session completion; optional resources are visible but never block it; not-assigned resources are hidden and do not participate in progress. When every required resource is Studied, the Session becomes Studied. A direct Session Studied mark gives its assigned resources inherited Studied presentation without fabricating individual resource events. Reversing the parent removes only inherited state and preserves resource marks the learner actually recorded.

Phase 5.E.3 implements hierarchical aggregation as a projection over the append-only ledger. A Session with no required resources cannot complete by aggregation and needs a direct Studied mark. Required and optional assigned children inherit presentation from a direct parent mark; explicit child facts retain their own actor and time and take precedence in the read model. Reviewed and Practiced never aggregate or advance the academic pointer. A Tutor or Mentor may reverse a Student's explicit resource-level Studied mark with a public reason, but must remove an active direct parent mark first. Derived completion and its reversal create durable Student/Tutor notification facts without creating synthetic progress events.

Every Tutor or Mentor action that marks or unmarks Session-level Studied
progress requires a 10–500-character Student-visible explanation, including an
ordinary mark of the next expected topic. The append-only event validator
enforces this independently of the browser. The Student's notification fact
retains the target title and explanation. A separate current-Schedule Log
combines public progress, structural, and pacing changes for the active plan;
it includes retained stable-item progress across an ordinary adjustment,
excludes private staff notes, and does not pull unrelated progress from a fully
replaced Schedule.

Markdown remains the editable authoring source for built-in Tracks. Completed Sessions are pinned to the exact Schedule item, Track Session identity, content-version identity, difficulty, and personalized resource snapshot used at completion. Later Track publications may update only unstudied Sessions through an auditable successor snapshot; studied content never changes silently. Phase 5.E establishes the identities and progress boundary. Phase 15 owns full immutable Markdown-derived Track publication and synchronization.

The Student-facing Schedule can be saved as a PDF through the browser print flow. Generation first refreshes the authorized effective Schedule from the server. The printable snapshot identifies Student, assigned Tutor, canonical Education level, Subject, and Track and includes effective dates, difficulty, visible assigned resources, current Studied/Reviewed/Practiced presentation, and the date of each progress mark beside its checkbox. It excludes original planning dates, timezone metadata, internal Course/Version identifiers, private Student reflections, private staff notes, hidden resources, and superseded Versions. Modules may split across pages only between complete rows; their header repeats and page margins are preserved. Generation time appears at bottom-left, copyright at the true center, and `Page X of Y` at bottom-right through CSS page-margin boxes on every page. The print stylesheet blanks the browser's unrelated upper timestamp/title margin boxes while preserving Kelp's footer. The centered watermark remains presentation-only. PDF generation does not create a retained Classroom file in this phase.

For recurring Courses, a weekly meeting pattern is immutable content owned by one
Course Schedule Version. Each entry records a local weekday and start time plus
a 30-, 60-, or 90-minute duration. It does not prescribe a default Class
purpose. Replacing the week creates a complete successor Version
and preserves the previous pattern; a later structural Schedule publication
inherits the unchanged pattern. The assigned Tutor or supervising Mentor may
publish it immediately with an expected Version, idempotency key, Student-visible
explanation, and optional private staff note. Self-employed Tutors exercise the
same combined authority. Students see only the active pattern and public
explanation.

Meeting-pattern rows are academic intent. They are not Calendar bookings,
scheduled Classes, attendance evidence, no-show facts, or credit commitments.
Phase 5.F.2 expands them into academic slots; Phase 5.F.3 owns target locks,
outcomes, and requeue history. Calendar/Class creation and billing retain their
later owning phases.

The later Phase 5.F alignment clarifies that Theory, Practice, Review, Exam, and
Wrap-up are not default recurring-slot classifications. A recurring pattern is
only weekday, local time, duration, effective range, and Course timezone. Every
ordinary occurrence receives the next planned structural Schedule item. A Tutor
may insert Practice, Review, Exam, or Wrap-up beforehand as an explicit item that
consumes one occurrence and shifts later items. If a prepared Class pivots only
after the participants meet, the post-Class outcome records what actually
happened, does not mark the original topic Studied, preserves that occurrence in
history, and requeues the original topic plus later targets one meeting forward.
Phase 5.F.2.1 generates immutable occurrence dates without copying the legacy
5.F.1 purpose field; 5.F.2.2 forward-corrects that field's publishing contract,
and 5.F.3 implements the outcome/requeue engine.

Phase 5.F.2.1 stores one immutable occurrence set per Schedule Version.
Recurring occurrences derive only from the active pattern's local weekday/time,
duration, effective dates, and timezone. On-demand and access-only Courses use
date-only occurrences derived from their immutable structural items. A successor
Version receives a distinct set in the same activation transaction. Students
read only the active set, authorized staff may inspect Version summaries, and
the generator does not create Calendar bookings, Classes, notifications,
attendance/no-show evidence, or credit commitments.

Phase 5.G.2.4.7.2 adds one compatibility boundary for an active recurring
Course that already has dated structural Sessions but does not yet have a
governed meeting pattern. Its immutable structural dates become date-only
Adaptive pacing opportunities, identified as a recurring-date fallback. They
do not carry a start time or duration, do not represent a booked Class, and
cannot enter the six-hour Class hold. Studied progress may therefore move the
next unfinished topic into a freed structural date. Publishing an actual
meeting pattern creates a successor Version with timed recurring slots while
the fallback remains immutable history on the former Version.

For Student progress, the six-hour Class boundary is intentionally simpler
than target-preservation logic. When an actual timed Class in the active
Schedule begins within six hours, the Student cannot create a new Studied mark.
The server rejects the command before any progress event, target lock, or
Adaptive reflow is written, and the Classroom disables the affected Studied
controls using the same canonical hold projection. Reviewed and Practiced
remain available because neither advances the lesson plan. Tutor/Mentor
post-Class and correction workflows remain independently governed. A date-only
academic opportunity never activates the hold. A booked on-demand Class follows
the same rule once its timed academic slot exists.

Phase 5.F.2.2 stores append-only effective target-mapping revisions without
rewriting structural items or academic slots. A recurring mapping assigns the
next unstudied structural item to each neutral slot in order. Independently
Studied topics leave future mappings immediately; later unstudied topics move
forward, while authorized staff retain every prior mapping revision. More
remaining topics than generated slots is valid: excess items use
`awaiting_future_slot` and never trigger a Class booking, purchase, or automatic
top-up. On-demand and access-only rows remain fixed date-based academic planning
rows. For an on-demand Lesson Request, the server recommends the earliest
unstudied Curriculum topic and exposes all other eligible unstudied topics as
alternatives; the later Lesson Request command records the Student's actual
choice. Choosing D instead of recommended C does not mark, drop, or reorder C.
For example, if A, B, E, and F are already Studied, the booking projection
recommends C while still allowing the Student to select D.
Planned Review, Practice, Exam, and optional Wrap-up are explicit structural
items that consume recurring slots. Project milestones and Assignment deadlines
remain Calendar events and consume no academic slot.

Phase 5.F.3 locks the effective target of a recurring occurrence six hours
before its local start. That snapshot never changes afterward, even when later
progress reflows future meetings. The latest append-only outcome is one of
`pending`, `delivered`, `not_delivered`, or `cancelled`; actual purpose
(`curriculum_topic`, `review`, `practice`, `exam`, or `wrap_up`) and lesson
origin (`recurring`, `on_demand`, or `extra`) are separate facts. A delivered
Review/Practice/Exam/Wrap-up preserves the originally locked topic and leaves
that topic eligible for the next unlocked slot. A `not_delivered` occurrence
also remains permanently visible and requeues its target. Marking the locked
Curriculum topic Studied is an explicit Tutor post-lesson action, never a
consequence of presence or duration alone.

The assigned Tutor records the ordinary outcome before the next scheduled
meeting, or within seven days when no later meeting exists. Tutor corrections
inside that window require a Student-visible reason. The Course Mentor and
Quality Assistant may append later dispute/correction decisions; they never
rewrite the earlier event. Students receive a redacted outcome projection and
may dispute a resolved outcome, but cannot author the authoritative delivery
status. An evidence-backed outside-Kelp claim becomes fixed immediately when
the Student confirms it; otherwise the Student may dispute through two days
after the next meeting, or for seven days when no next meeting exists.

PDF/JPEG/PNG evidence for outside-Kelp or technical exceptions is kept in a
separate private bucket, excluded from ordinary Classroom Files, readable only
by authorized Course staff/Quality oversight, and provisionally retained with
the Classroom's two-year history. `student_no_show` recommends a half charge;
`tutor_no_show` recommends no Student charge; verified joint presence recommends
a full charge; no-platform or technically uncertain cases remain pending until
resolved. These are nonfinancial recommendations only. The later Credit/Live
Class ledgers decide and post actual amounts. Every Kelp-Tutor settlement remains
ineligible for at least 14 days after the occurrence, and any unresolved dispute
extends that hold.

Phase 5.F.4 presents these separate authoritative records through one active
Course-Schedule timeline. Rows are grouped into Past, Next, and Upcoming and
represent a meeting, independently completed work, or planned work that has no
meeting target yet. A Tutor-posted Studied transition that belongs to a lesson
is embedded in that meeting row rather than repeated as independent work.
Before the immutable T−6h snapshot exists, an upcoming meeting target is
`planned`; after the lock exists, it is `confirmed`. Student detail may include
the public outcome, established attendance basis, dispute status, and the
provisional full/half/no/pending charge recommendation, but never a final
credit posting. Tutors, Mentors, Quality Assistants, and administrators receive
authorized staff audit detail and Version history. Guardians receive only the
higher-level Schedule: topic/activity, date, difficulty, and high-level status,
without lesson attendance, charge recommendations, progress/resources,
disputes, evidence, private notes, or superseded Version history.

Phase 5.G.1 wraps that timeline and the module-based effective Track in one
versioned `course_schedule_read` contract. Students, assigned Tutors, Mentors,
and administrators receive the detailed module sequence appropriate to their
permissions; Guardians receive only the higher-level timeline. Quality
Assistants retain governed outcome and Version audit detail without inheriting
a Classroom member's private module presentation preferences. Student responses
never expose the Tutor's Mentor or other internal supervision structure. The contract
keeps Subject, Track, Education level, Course/Classroom lifecycle, participant
names, Track progress, member-private presentation preferences, and role
permissions in explicit sections so downstream pages do not reconstruct them
from unrelated endpoints.

Meeting presentation uses `planned` before the six-hour hold, `awaiting` from
the hold through the scheduled meeting, `pending_confirmation` after the
meeting when no governed outcome exists, and then `delivered`,
`not_delivered`, or `cancelled`. Non-delivery reasons are
`student_absent`, `tutor_absent`, `technical_issue`,
`outside_kelp_unconfirmed`, or `unverified`. An automatic unreported outcome
may become `not_delivered` plus `unverified`; that classification neither
assigns blame nor posts a final charge.

Date-only Course targets and independent progress are presented at noon in the
viewer's current timezone when a full-day Calendar needs a visual anchor. The
anchor is presentation-only and never blocks availability; an explicit due
time overrides it. Assignment deadlines remain independent Assignment facts,
and changing a deadline never moves Course meetings. Academic slots are still
opportunities rather than bookings. The retained `learning_schedules` data is
an internal Calendar/assignment compatibility mirror and is never the source
of live Course Schedule truth.

Phase 5.G.2.1 makes that boundary operational in the Classroom. Classroom Home,
the detailed Schedule, progress-refresh paths, member-private module/PDF
preferences, Retry, and PDF generation all reread `course_schedule_read`;
browser code never falls back to `get_my_effective_course_schedule` or the
legacy mirror. The established module interface remains unchanged and does not
duplicate the canonical Past/Next/Upcoming timeline. If a write succeeds but
the canonical reread fails, the user is told that the change was saved and the
latest Schedule could not be loaded; the failure is not misreported as a
rejected write.

Phase 5.G.2.2 makes the same boundary operational in the Student Dashboard
Calendar. Active and wind-down Course events are projected atomically from
`course_schedule_read`; one failed Course projection fails the complete
Calendar instead of returning a partial plan or using the legacy mirror.
Course lifecycle, meetings, planned topics, and independent progress retain
their canonical presentation metadata. Assignment deadlines remain independent
facts and may coexist with another event on the same date. Date-only facts use
viewer-local noon solely for display and never block availability.

Compact Calendar labels use `CB`, `CE`, `SM`, `RC`, `EC`, `IP`, and `AD`, plus
an education-level code such as `ES`, `MS`, `HS`, or `CL`. `SM` is reserved for
Schedule milestone so `MS` remains unambiguous as Middle School. The complete
description remains available on hover/focus and in a day-detail dialog. The
Dashboard keeps its current Month/Week geometry during this cutover; full
hour-grid scheduling and availability overlays remain later Calendar work.
Descriptions remain inside the Calendar boundary and omit repeated Course
metadata. Event families use distinct presentation colors. Assignment
deadlines open their Practice page, while milestones, independent progress,
and Class targets open the immutable Track Session planning route when one was
retained; only events without a dedicated destination fall back to Classroom.

Phase 5.G.2.3 locks the two consumer views together without collapsing their
different interfaces. A canonical timeline row keeps the same Course,
Classroom, Schedule-item identity, effective date, public status,
non-delivery reason, Track destination, module presentation, and viewer
timezone when it is shown in Classroom or Calendar. Students retain their
own detailed Course plan, assigned Tutors and supervising Mentors retain
detailed Classroom access, and unrelated Students remain denied. A Profile
timezone change must affect both consumers on their next canonical read.
Calendar aggregation remains atomic: one failed canonical Course read aborts
the complete result, and the retained `learning_schedules` mirror never fills
the gap.

Phase 5.G.2.4 expands the canonical model without weakening the
required-Schedule invariant. One Course/Classroom continues to own one stable
Schedule and one active immutable Version, but the Version may contain
Curriculum Sessions from several Education levels, Subjects, academic pathways, and Tracks. Every
Curriculum item snapshots its complete governed path, source version, and
destination. Reviews and Exams may carry either one branch context or an
explicit Course-wide context. The existing Course Subject/focus survive first
as compatibility and primary-display anchors; they are not sufficient
authority for the Version's complete coverage.

Academic pathway labels such as Regular, AP, IB, SAT, ACT, O-Level, and A-Level
are optional Track metadata. The Builder groups and filters them inside the
selected Education level and Subject rather than forcing pathway to become a
navigation step. A Student goal such as passing AP Physics is a separate
Student/Course fact that can justify supporting content, such as Algebra,
without changing Track identity. Pathways do not create duplicate Algebra,
Mechanics, or other canonical content solely because one Session supports
several programs or examinations, but they may legitimately point to different
books, problems, and Session plans. The Course and Classroom Card project only
the pathways selected for the active Schedule; an unselected ACT, IB, or other pathway must
never appear merely because the same source Session could support it. The
assigned Tutor must be qualified for every selected branch, and publication of
one unauthorized item rejects the complete successor Version. Mentors supervise
the Tutor and Course without inheriting teaching authority or needing identical
qualifications merely to supervise; if a Mentor personally teaches a Class,
their Tutor action requires the corresponding qualification. Quality Assistants
manage oversight and disputes without teaching authority. Existing single-focus
Courses migrate as one equivalent coverage branch without changing dates,
active Version identity, progress, Memberships, Classroom identity, or history.

The multi-branch Builder uses subject-first traversal across Education levels,
Subjects, Tracks, Modules, and Sessions plus a persistent selection tray.
Pathway metadata groups and filters Track cards. Phase 5.G.2.4.3.1 lets a
standalone author retain Tracks across levels and Subjects, choose one primary
Track, add supporting Tracks, migrate older browser drafts, and generate a
schema-v2 reusable plan whose Sessions retain branch-specific source identity.
A branch joins reusable coverage only after a governed Session is selected;
supplemental items cannot create curriculum coverage alone. Classroom editing
begins with current coverage already selected and offers an explicit way to
add another Track. Studied, delivered, past, and
dropped items retain their original curriculum path; only eligible future work
may add or remove branches. Classroom, Calendar, and PDF consumers use each
item's own labels rather than applying one Course focus to the entire plan. The
Student still receives one combined Schedule and one overall Course-progress
calculation. Full Track publication and Goal authoring remain in
Phase 15.

The Phase 5.G.2.4.3.2 Classroom Builder payload carries the exact active
Version coverage plus each item's durable Session and content-version source.
Resolvable eligible future Sessions are preselected while Studied, past, and
dropped items remain staff-only locked history. Delivered occurrence state is
retained for started-Track and audit purposes, but a delivered-linked future
Session remains preselected when its curriculum target is not Studied. Missing current
catalogue sources retain their stored Version snapshot, and eligible future
Sessions with a newer catalogue hash are identified as Track updates without
silently mutating the database. A local Classroom draft records its Course and
base active Version. When that Version is stale, Kelp loads the current Version,
never merges the old selections, and keeps only a read-only local recovery copy.
Changing coverage, changing the primary Track, resolving a missing source, or
adopting a newer Track source uses the Phase 5.G.2.4.4 governed publisher. It
resolves all proposed branches to canonical curriculum nodes and validates the
assigned Tutor's active qualification for every branch before publishing
anything. A Mentor may initiate publication but cannot substitute their own
qualification for the assigned Tutor.

The same transaction publishes the immutable successor Version, its selected
coverage, governed reasons, Course date projection, primary compatibility
anchors, notifications, and a complete idempotent Builder receipt containing
the qualification evidence used at decision time. A revoked qualification
blocks a new Version without invalidating readable historical Versions. Direct
structural publication remains restricted to the active coverage and cannot
introduce a new branch.

When none of the former active Tracks remains, the publication is a complete
replacement. The new active plan receives a new plan epoch and the Classroom
Home/progress surface uses only that plan. Prior Studied, Reviewed, and
Practiced facts remain unchanged and appear with the former Schedule in
history; abandoned untouched topics remain staff audit history. A partial
replacement keeps the current epoch, retains continuing branches, and keeps
their Studied, Reviewed, and Practiced work visible in the active Schedule and
Classroom Home calculation.

An active Course continuation always retains the locked original Course start.
The Builder preloads the current cadence and may change it only for future
flexible meetings and milestones; past items and Studied curriculum targets keep
their established dates and positions. A delivered Class occurrence remains
immutable history and makes its Track started, but delivery alone does not mark
its original curriculum target Studied or freeze that unfinished target's future
date. That target may therefore follow the revised cadence after a Review, Exam,
Practice, pivot, or other delivered outcome that did not complete it. Practiced progress remains attached to the
curriculum item and makes its Track started, but does not reserve a lesson
opportunity, so a future Practiced item may follow a revised cadence. Keeping
any former active Track remains a continuation, so an untouched Track can be
dropped without manufacturing a new plan. Reviewed alone is reinforcement and
does not start a Track. Removing a started Track requires the explicit
complete-replacement path, which preserves the former plan and its progress in
History and excludes that progress from the new Classroom Home.

Cadence belongs to the complete combined Schedule, not to an individual Track.
After all selected Tracks have been merged into their definitive order, one
continuous cadence lane assigns every future flexible Session. A Track boundary
must not restart the cadence or leave an otherwise valid meeting date vacant.
Student, Tutor, and Mentor Calendars derive their Course events from that same
current active Schedule Version; role-specific permissions and redaction may
differ, but the visible academic event identity and dates must not drift.

A true complete replacement may start on any Student-local date from today
onward. It does not inherit the former plan's future start floor. When the
former plan has not begun, its future Course-start edge follows the replacement;
an elapsed Course start remains immutable. Continuing revisions keep the
original start authority and cannot use the replacement exception.

Studied restoration is identity-based rather than Calendar-position-based.
At every Studied mark, Kelp immutably records the mark's Schedule Version, plan
epoch, authored cadence, and the ordered stable identities that preceded the
Session. The captured cadence remains historical even if the active Schedule
later changes. When the mark is reversed, Kelp removes that Session from the
ordinary unfinished lane, searches its nearest-first predecessor chain, and
reinserts it after the nearest predecessor that remains. If none remain, the
Session becomes first. The restored lane consumes only unlocked opportunities
from the current active cadence; mark-time dates and locked occurrences are
never revived or moved.

The visible Course End is an effective active-Version boundary, not a second
date engine and not a mutation of retained Course history. Currently Studied
Sessions contribute their actual Studied local date; unfinished Sessions,
Reviews, and Exams contribute their current mapped or Static-frozen date. The
latest of those dates is the Calendar Course End. Adaptive progress therefore
contracts it, a Studied reversal expands it, and a cadence revision moves it
with the same session lane. Static pacing keeps it at the frozen terminal date.
Student, Tutor, Mentor, Dashboard, and Classroom Calendar views receive that
same event identity and date.

Migration `202607250001` supplies the Phase 5.G.2.4.2 persistence boundary.
Every retained and newly inserted Schedule Version receives one immutable
coverage snapshot. Existing single-focus Versions become one primary branch
derived from their retained Course Subject/focus and receive no inferred Goal;
the migration inserts coverage without replacing the Version, changing dates,
rewriting items/progress, or touching Classroom Memberships. Until the
multi-branch publisher arrives, ordinary single-focus successor Versions inherit
the prior snapshot byte-for-byte. Students may read only their active Version's
coverage, authorized Tutors and Mentors retain coverage history, and unrelated
accounts remain denied. `Active` and `Completed` are derived branch-presentation
states; `Delivered` remains reserved for an individual Class occurrence.

A canonical Curriculum Session is one governed Track lesson with a stable
source identity, planning destination, and content-version identity. It appears
only once as an active curriculum target in one Schedule Version and therefore
contributes only one Studied unit and one Practiced unit to Course progress.
Several tutoring Classes may still discuss that same target: each meeting keeps
its own slot, attendance, outcome, and later credit consequences without
creating another curriculum target. A Tutor may plan another linked Review or
Practice item in advance or record a post-lesson pivot to that work. Homework
linked to the Session creates neither another Class occurrence nor another
progress-denominator target. Custom Reviews, Practice items, Exams, and wrap-ups
remain allowed, but arbitrary custom curriculum topics cannot impersonate a
governed Track Session.

Phase 5.E.4 bridges the existing Schedule Builder to one governed Course without making the browser document authoritative. Generated Markdown catalogue entries carry deterministic content hashes and taxonomy slugs. The currently implemented Classroom Builder remains inside that Course's Subject/focus boundary and publishes against the active Version ID; Phase 5.G.2.4 is the planned governed replacement for that single-focus guard. A stale screen is rejected before any Version changes. Publication creates a reasoned immutable successor and preserves missing past items while representing removed future items as explicit drops. The Student receives one effective Schedule: completed Curriculum Sessions appear in actual Studied order with their server timestamp, while untouched work retains its current structural order until Phase 5.F maps it onto academic slots.

The effective Student Schedule omits source-less legacy curriculum scaffolds when the same active Version contains real Track-backed curriculum, but those legacy records remain available in authorized staff history. Progress correction remains append-only: a mark → correction → re-mark sequence may legitimately revisit a prior effective target-mapping signature, so revision number—not global signature uniqueness—defines chronology. Module colors and PDF rule/text colors are member-private presentation preferences and never mutate academic Schedule data or another member's view.

Student progress uses authoritative server time. Students may record only current-time actions. Tutors and Mentors may record a normal current-time action even while an activated Course is waiting for its first planned Session; this is not a back-report. When staff explicitly supplies an earlier effective timestamp, that timestamp must lie inside the Course period and requires a reason; the immutable server-recorded time remains separate. Student reflections are optional and private to the Student, assigned Tutor, and Course Mentor. Guardians may read the learner's Schedule, weekly work, homework, Assignments, grades, and Report Cards, but they do not receive lesson-level progress reflections or private instructional notes. Tutors require a reason to mark a later-than-expected topic, and every Studied reversal requires a concise Student-visible reason plus an optional private staff note.

Only future, unstudied topics may be included, dropped, or reordered. Reordering assigns topics to the recalculated future cadence slots in the new version; it does not move Dashboard/Classroom blocks. Past and Studied topics remain structurally immutable. A delivered Class occurrence remains immutable, but its unfinished original curriculum target is not frozen merely by that delivery and may be reassigned to a revised future cadence. Missed delivery remains historical, while the undelivered topic may be linked into a newly created future slot. On-demand and access-only dates never move merely because progress changed, but an authorized explicit Schedule revision may replace their future topic/date assignments.

The active Schedule Version is authoritative for Course start and scheduled end dates. A managed Kelp Course requires a Mentor; an independent Course may have a school Mentor or may be owned directly by its self-employed Tutor. Provider kind (`kelp` or `independent_tutor`), Student service model (`recurring`, `on_demand`, or `access_only`), and optional supervision are separate fields. Course activation requires Schedule version 1 and may not accept caller-supplied dates that disagree with it.

### Phase 5.A implementation audit

The existing browser Schedule Generator and its date-only cadence engine remain valuable inputs and passed their baseline tests. The current database bridge is transitional: `upsert_student_learning_schedule` mutates a Schedule and its sessions in place, `student_courses` stores dates independently, Course activation does not require a Schedule, and `independent_tutor` is currently encoded as a service model. Phase 5.B will replace those boundaries while migrating the retained Mechanics and Algebra Course-linked Schedules into initial immutable versions. Existing practice assignments retain their immutable Schedule/session snapshots and must not be rewritten by the migration.

### Phase 5.B implementation boundary

Every runtime Course now owns one stable `course_schedules` identity and must reference an active immutable `course_schedule_versions` record containing at least one ordered item. The Schedule-aware Course-draft command creates the Course, Schedule, version 1, ordered items, and the temporary Calendar/assignment compatibility mirror in one transaction. A deferred database invariant rejects a Course that reaches transaction completion without its own populated active version. Course activation independently revalidates that invariant.

Retained Courses are backfilled without deleting or rewriting `learning_schedules`, `learning_schedule_sessions`, or assignment snapshots. A linked retained Schedule becomes version 1; a Course without one receives an explicitly review-required migration placeholder. The older tables remain a non-authoritative compatibility mirror until their Calendar and assignment consumers move to the Course Schedule model. Phase 5.D closes distinct writes through the old synchronization bridge; the bridge may only replay the exact active payload, while the reasoned structural publisher updates the authoritative Version and compatibility mirror atomically.

Provider kind and Student service model are separate. Kelp Courses require a supervisory Mentor. An independent-Tutor Course may have a Mentor or may be owned by its self-employed Tutor; a self-employed Tutor may create and activate their own Course with no Mentor Membership. Phase 5.B exposes participant-authorized Schedule reads and version summaries. Phase 5.C now owns atomic Course-date synchronization; editing authority, progress, and finished states remain in 5.D–5.H.

### Phase 5.C implementation boundary

The active Schedule Version now owns the Course date projection. Only scheduled and requeued items contribute to its effective first and last dates; dropped items remain auditable but do not extend the Course. A draft Course follows both effective edges while its academic design is still fluid. Activation copies the active Version's first date into a permanent activated Course start and derives its endpoint from the Version's last effective date in the same transaction.

After activation, the activated Course start is historical and cannot move. Every later active Version must begin on or after that lock, while its last effective date may extend or shorten the current Course endpoint. A Version with no scheduled or requeued items is not activatable, and an active Course cannot accept a past-only revision through ordinary Schedule synchronization; those outcomes belong to the explicit finish flow. Direct writes to Course dates are normalized back to the active Version by the same database invariant, so browser and later server commands cannot bypass Schedule authority.

If an activated Course in wind-down receives an authorized Version whose endpoint is current or future, it returns to active and its generated 14-day wind-down date restarts from the new endpoint. The participant Schedule projection exposes both the synchronized Course dates and independently calculated Version ranges. Phase 5.C does not introduce editing buttons; authority-specific commands and interfaces remain in 5.D, 5.G, and 5.H.

### Phase 5.D implementation boundary

Structural Schedule items are Curriculum topics, Reviews, or Exams. Reviews and Exams consume regular academic slots and shift later effective items, but neither marks a Curriculum topic Studied. Project milestones remain Calendar highlights, and Assignment deadlines come from the Assignment system rather than consuming Schedule items.

The assigned Tutor and supervising Mentor may publish ordinary structural changes immediately while a Course is draft or active. A self-employed Tutor with no Mentor combines those authorities. Students, outsiders, generic administrators, and Quality staff do not receive the routine academic editing command; Quality oversight and exceptional extension belong to a separately authorized lifecycle flow. Ordinary structural editing stops during wind-down. Finishing a Schedule/Course remains Mentor authority, or self-employed-Tutor authority when no Mentor exists, and is not implemented by the structural publisher.

Each publish submits the complete proposed Version, the exact active Version it was based on, a stable idempotency key, and governed root-change reasons. Includes, drops, restores, and direct reorders require a concise Student-facing academic explanation; an optional private note is visible only to authorized staff. Downstream date/position reflow caused by one reasoned insertion or drop is deterministic and does not require repetitive reasons for every shifted row.

The server locks the Course, rejects stale screens before creating any effects, creates one immutable Version, activates it, synchronizes the Course endpoint and legacy Calendar mirror, appends reason/audit records, and creates one in-app notification fact for the Student, Tutor, and Mentor, including the actor. An exact retry returns the original Version without duplicating history or notifications. Delivery by email or SMS is a later adapter and cannot roll back the academic command.

Students receive one active effective Schedule and its public explanations. They cannot query superseded Schedule Versions, dropped items, private staff notes, or publishing receipts. The assigned Tutor and Mentor may inspect superseded Versions and private notes. Past dated items are structurally locked in this slice; the richer delivered/missed/requeued history and shared Studied event model arrive in 5.E–5.G.

### Availability

- Tutors publish recurring availability and may add date-specific overrides.
- Accepted Classes are not silently cancelled by an availability edit.
- A one-hour buffer is required between Classes.
- Students may request a Class at least 24 hours in advance and no more than two weeks ahead.
- Tutors may request Time Off up to 12 months ahead. Close or exceptional disruption follows Mentor review rules.
- Student and Tutor holiday-observance preferences are derived from country, state, and city. If either party blocks a holiday, new bookings are unavailable unless both explicitly agree to an override.
- Students see that a time is unavailable, not the private reason.

### Lesson requests

- Students request lessons only from their assigned active Tutors; Kelp is not a public Tutor marketplace.
- A request identifies Tutor, regular/extra/standalone purpose, date and time, Subject, Subtopic, Content, duration, credit requirement, optional message, and permitted attachments or links.
- Tutors accept or decline with a reason; they do not counter-propose a time.
- Pending requests expire 12 hours before the proposed Class.
- Multiple pending requests may target one slot. Students see only the request count; the Tutor chooses, and acceptance atomically revalidates availability, buffer, relationship, taxonomy, and funding.

## Lesson credits and commercial boundaries

Lesson credits fund Kelp-billed tutoring. Platform access and other services are monetary fees rather than credits.

| Duration | Full charge | Student no-show charge |
| --- | ---: | ---: |
| 30 minutes | 10 credits | 5 credits |
| 60 minutes | 20 credits | 10 credits |
| 90 minutes | 30 credits | 15 credits |

Current USD lesson prices are proportional to duration:

| Model | 30 minutes | 60 minutes | 90 minutes |
| --- | ---: | ---: | ---: |
| Standalone | 25 | 50 | 75 |
| Recurring | 20 | 40 | 60 |

Access-only Student service is currently USD 5 monthly. Independent Tutors pay USD 10 monthly regardless of Student count; their Students do not pay Kelp's Student platform fee for that relationship.

Credits are integers in storage. Money uses currency minor units or another exact high-precision ledger representation; floating-point arithmetic is never financial authority.

### Credit lifecycle

- Credits belong to one Student account, not to a Tutor or Classroom.
- Purchased, recurring-funded, transferred, promotional, and adjusted credits are stored as immutable lots with source and expiration.
- Promotional credits ordinarily expire after one month and are allocated first.
- Recurring-funded credits ordinarily expire after 12 months.
- Standalone packages expire by size: each 40 credits provides one calendar month, up to the approved 12-month limit.
- Unused eligible credits roll over until their lot expires.
- A displayed balance does not prove that a future Class can be afforded.
- Booking simulation considers existing commitments, holds, restrictions, and whether each lot remains valid at the proposed Class time.
- An accepted future Kelp-billed Class creates a fully allocated commitment. Six hours before the Class, the commitment becomes a hold.
- A final charge is posted only from the authoritative Class outcome. Credits never become negative.
- Automatic top-up may buy the exact shortfall for an eligible recurring commitment under prior consent, Student/Guardian limits, and a valid payment method. One failed retry leaves the Class unbooked and creates Payment Action Required.

Subscription freezes pause billing and credit expiration for the agreed period. Three consecutive account-wide Student no-shows trigger the subscription-freeze workflow; an attended Class resets the streak.

## Live Class and attendance

- Classes last 30, 60, or 90 minutes and may not be extended during the live session as an authoritative schedule change.
- Valid Student and Tutor presence is server-timestamped. Browser timers and media-room events are evidence, not final authority by themselves.
- Completion requires accumulated joint attendance equal to at least 50% of scheduled duration, together with the required end-of-Class records.
- A Student no-show is evaluated at 10 minutes and produces the half-credit outcome above.
- A Tutor no-show at 10 minutes cancels the Class without charging the Student and triggers review.
- A Class may start up to 10 minutes late and still runs for its scheduled duration unless an authorized exception applies.
- Kelp service outage or a reported outside-Kelp meeting creates a settlement exception. The parties have one week to report it; Kelp holds ordinary settlement for two weeks, after which the normal workflow proceeds if nobody reports an issue.

Student late cancellation or rescheduling is unrestricted outside the six-hour hold window. Inside the window, the Student starts with one entitlement per Classroom and regains it after eight clean completed Classes following use. Tutor-initiated changes and Kelp technical failures do not consume the Student entitlement. Tutor reliability uses a rolling 24-completed-Class window and is separate from planned Time Off.

## Classroom, academic work, and reports

### Classroom presentation

A Classroom Card remains compact: Subject, Tutor, next Class, homework count or state, Student-selected color, active/inactive state, unread count, and accessible actions. Card color and Dashboard position are per-Student preferences.

The Classroom owns Overview, Forum, shared Files, Course material, assignments, reports, and lesson history. The Forum is asynchronous and visually follows a social-feed-style conversation: a Student or Tutor may post without expecting an immediate reply, the message composer stays anchored at the top, and its authoring tools include authorized image/file attachments. Those attachments reuse the private Classroom Files authority and object store, while the Forum owns message/thread context and Files provides the consolidated shared-drive view. Accepted lesson-request attachments become the first relevant Forum message. Active Classroom content is not hidden merely because a user prefers a different Dashboard layout.

### Files and retention

Initial lesson-request and support attachments accept up to three PDF, JPEG, or PNG files, with preview and download where authorized. Submitted request attachments and links may be edited for two hours. Accepted material follows the Classroom record; declined-request files are provisionally retained for one year. Classroom spaces and their academic history are provisionally retained for two years.

Deletion, accounting retention, legal hold, and paid-account closure rules remain provisional. Kelp stores Student country, state, and city but not a street address; Stripe may separately process billing addresses.

### Assignments and Report Cards

- Assignments support files, submission, feedback, grades, deadlines, and Classroom/Calendar indicators.
- Course termination cancels incomplete required work according to the closeout rules rather than deleting its history.
- Report Cards are Course-scoped, downloadable as PDF, and remain available while the Classroom exists.
- Monthly reports cover the relevant month. The final report calculates the entire Course rather than averaging monthly report totals.
- Categories default to Homework 3, Projects 2, Exams 4, and Participation 1; Tutors may choose category weights.
- Participation is recorded after each Class on a 0-5 scale and may be normalized to 0-100.
- Missing categories are excluded from the weighted denominator rather than treated as zero.
- Tutor comments do not require Mentor review. Student comments remain in the Forum.

## Profile and preferences

The shared Profile includes name, email identity reference, birth date, country, state, city, and timestamps. Student-facing experiences also need derived join duration, completed Class/Course statistics, active Tutors, location-derived timezone, hobbies, and learning goals.

- Kelp does not store the Student's street address.
- Tutors see only the Student's country from the location hierarchy. State/region and city remain absent from Tutor-facing Profile projections.
- A Tutor sees the Student fields authorized by their active relationship; ordinary views show birthday rather than the full birth year where the product contract requires that privacy boundary.
- Location may be updated through controlled country, state, and city choices.
- Timezone is derived server-side from the governed country/state/city selection and displayed in the Student Profile. Changing location recalculates it; the browser cannot submit a separate timezone override.
- Hobbies and learning goals use governed options rather than uncontrolled profile text unless a later phase explicitly adds a safe free-text supplement.

User preferences live in dedicated server-side records rather than expanding the Profile row. They include theme, Dashboard layout and collapsed blocks, Classroom Card color, Calendar display style, holiday observance, and notification settings. Preferences synchronize across devices and support reset behavior. A server-maintained timezone cache may live alongside preferences for scheduling, but its authority remains the governed Profile location.

Themes use accessible, softened gradient tokens and templates. A stored theme identifier and constrained settings drive presentation across Kelp pages; arbitrary CSS or environment-variable mutation from the browser is not permitted.

Student-owned themed pages may cache only the allowlisted theme identifier for first paint. This cache is a presentation hint, contains no identity or authorization data, and is reconciled against the server preference after authentication. Unsaved previews never become the first-paint cache. Feature-owned visual systems may explicitly opt out; Dashboard, Profile, Tracks, and Schedules inherit the Student theme.

### Phase 1 implementation boundary

Student Profile and Configuration are implemented as a vertical slice. Student signup and self-service Profile changes use governed country/state/city, hobby, learning-goal, and theme values. The selected city supplies the IANA timezone server-side. Email remains Auth-controlled; a saved birth date is locked and later corrections go through Support. Profile data and preferences are separate server-side records, and Profile changes record changed field names without copying sensitive values into the audit event.

The base migration contains a compact location fixture for disposable local development. Phase 1.A adds a checksum-verified import of the reviewed `v3.1-export.2` Countries States Cities bundle and hierarchical picker RPCs. Production deployment and ODbL obligations still require launch review. Learning statistics intentionally remain unavailable until Course, Classroom Membership, and Class history become authoritative; the Profile does not present invented zeroes.

### Phase 2 delivery slices

The Student Dashboard phase is delivered through the following canonical sequence:

| Slice | Outcome | Status |
| --- | --- | --- |
| Phase 2.A — Test actors and relationship foundation | Create the Mentor → Tutor → two Students graph with Course-scoped assignments and an unlinked outsider. | Complete |
| Phase 2.B — Dashboard preferences and read model | Store block/card ordering server-side and return only relationship-authorized Dashboard data. | Complete |
| Phase 2.C — Responsive top navigation and grid | Replace the sidebar and establish fixed versus reorderable regions. | Complete |
| Phase 2.D — Real Classroom Cards | Render cards from active Classroom memberships and enter the authenticated persistent Classroom space. | Complete |
| Phase 2.E — Calendar surface | Display authoritative schedule items and prepare the availability overlay contract. Full booking concurrency remains in the Calendar phase. | Complete |
| Phase 2.F — Tests and documentation | Test both Students, the Tutor, Mentor supervision, outsider denial, responsive ordering, and cross-device preferences. | Planned |

These slices refine roadmap Phase 2; they do not renumber the later vertical phases.

### Phase 2.A implementation boundary

Phase 2.A introduces the minimum relationship authority required to test a real Student Dashboard without inventing Calendar, credit, or Classroom-content data.

- Roles remain account responsibilities; they do not themselves connect a Mentor, Tutor, or Student.
- A Tutor has at most one active supervisory Mentor. A Tutor cannot supervise themselves.
- Tutor and Mentor teaching qualifications are attached to governed curriculum nodes. A Course focus is valid only when it lies beneath the selected Subject and both the Tutor and supervisory Mentor are qualified for that focus.
- The supervisory Mentor creates the private Course draft. Activation revalidates supervision and qualifications, marks the Course active, creates its persistent Classroom, and creates Student, Tutor, and Mentor memberships atomically.
- Each one-to-one Student relationship has its own Course and Classroom, even when two Students share the same Tutor. Group Course behavior is not inferred from a shared Tutor.
- Course and Classroom reads are restricted to the Course Student, Tutor, supervisory Mentor, and trusted authorization administrators. An unlinked account receives no relationship, Course, Classroom, membership, or relationship-event rows.
- Runtime `student_courses` are distinct from reusable Course Builder `course_compositions` and from individual practice `course_assignments`.
- The local acceptance package provides a Mentor, Tutor, two Students with separate Mechanics Courses/Classrooms, and an unlinked outsider. These are synthetic local identities, not production fixtures.

Phase 2.A does not introduce Tutor availability, recurring meetings, Classes, Calendar events, lesson requests, competition counts, credits, attendance, Forum content, Classroom Files, or Dashboard presentation. Those remain in their owning vertical slices.

### Phase 2.B implementation boundary

Phase 2.B establishes the Student Dashboard shell without taking ownership from later vertical slices.

- The Student Dashboard uses a compact normal-flow top navigation with separate Learn, Schedule, and Account menus. It scrolls with the page rather than remaining sticky.
- Credits occupy a compact wallet position in the top navigation and display an explicit unavailable state until the credit ledger exists.
- Calendar and Classrooms are the only reorderable Dashboard blocks. Their order, individual collapsed state, and the Student's month/week Calendar display preference live in a dedicated, Student-owned server record and synchronize across devices.
- Dashboard layout is direct-manipulation. A Student can drag either block by its header or use keyboard-operable move buttons at any time; dropping, minimizing/expanding, and changing Month/Week view each synchronize automatically. No separate Customize, Save, Cancel, or Reset mode is required. A failed save restores only the attempted change.
- The Month Calendar foundation renders real dated cells for the current month. It does not invent Classes, assignments, availability, or due dates before Scheduling owns those records.
- The Dashboard read model returns only the authenticated Student's Course/Classroom relationships. It exposes explicit feature-status markers rather than fabricated Calendar events, balances, homework, unread counts, or Classroom Card actions.
- Active and inactive relationship foundations remain present in the read model. Phase 2.B does not add the later ability to hide eligible inactive Classroom Cards.

Phase 2.D owns finished Classroom Card presentation, Student-selected Card colors, Card order, and authenticated Dashboard entry into a persistent Classroom. Homework, unread, and next-Class summaries remain absent until their authoritative systems exist. Inactive-Card visibility controls arrive with Classroom archival. Phase 2.E owns Calendar projection; the later Calendar and Credit phases own booking and balances.

### Phase 2.C implementation boundary

Phase 2.C completes the responsive Student Dashboard shell:

- the top navigation, Credits wallet, Student heading, feedback, and fatal-error surface are fixed regions outside the reorderable grid;
- Calendar and Classrooms are the only reorderable regions;
- the sidebar is absent at every breakpoint;
- desktop and ordinary phone widths use the compact top navigation, while very narrow phones wrap logo/wallet and navigation into two rows instead of hiding a fixed region;
- Dashboard blocks remain single-column, controls wrap without document-level overflow, and the wide Calendar canvas scrolls only inside its own shell;
- navigation panels remain viewport-contained, and arrow controls preserve reordering when pointer dragging is unavailable.
- self-evident preference changes do not create confirmation notices; save failures appear without shifting the grid, while collapse/expand and reorder actions use reduced-motion-aware transitions.

Phase 2.C does not render finished Classroom Cards, authoritative Calendar items, availability, booking, or credit balances. Those remain in Phases 2.D, 2.E, and the later Credit phase.

### Phase 2.D implementation boundary

Phase 2.D turns active Course relationships into real Classroom entry points:

- a Classroom Card exists only for an active Student Classroom membership backed by an active or wind-down Course;
- active Cards cannot be hidden, while their per-Student color and order live in a dedicated server-side preference table;
- Card reads and writes validate the authenticated Student and the active Classroom membership; another Student cannot read or customize them;
- a Card opens an authenticated persistent Classroom-space route whose identity comes from the server, never a URL-provided role;
- the persistent Classroom owns Overview, Forum, assignments, Files, Report Cards, history, and Classroom tools;
- the existing video/whiteboard meeting page is a live-Class tool inside that persistent Classroom, not the Classroom itself, and remains schedule-bound;
- next Class, homework, unread counts, Forum posts, assignments, Files, and Report Card data are not fabricated before their owning phases create authoritative records.

Phase 2 intentionally leaves inactive access and personal archival to Phase 3. Finished Forum, Assignment, File, Report Card, History, and live-Class behavior remains in the later Classroom environment phases.

### Phase 2.E implementation boundary

Phase 2.E connects the Student Calendar to authoritative Course-owned scheduling data without prematurely implementing lesson booking:

- the Calendar returns Course start/end milestones, Course-linked learning-schedule milestones, and practice-assignment deadlines for the authenticated Student's active Classroom memberships;
- a schedule milestone and an assignment deadline remain separate events even when they share a date;
- assignment events open the protected Student Practice route, while answer and grading snapshots remain server-side;
- Calendar ranges are explicit, ordered, and limited to 62 days; output uses the Student's governed profile timezone;
- per-Student Classroom Card colors carry into Calendar events;
- legacy schedules that are not linked to a runtime Student Course are excluded;
- the availability overlay exposes only authorized Course/Tutor contexts and an explicit contract status. Tutor availability, competing-request counts, drag-to-request interaction, credit simulation, and booking concurrency remain in the later Calendar vertical phase.

The deterministic local acceptance graph remains fixed and test-only. A separate guarded interactive-sandbox command can grant an existing account the cumulative Student, Tutor, and Mentor workspaces; attach two synthetic Tutors in different timezones; connect one synthetic Student and one existing Student through separate Courses, Classrooms, and schedules; and create a protected sample assignment. Its Mentor roster reads the same relationship-authorized projection as the other workspaces. Re-running the command is idempotent and never repurposes the nine deterministic acceptance actors.

### Phase 3 delivery slices

Phase 3 completes Student-facing Classroom membership and Card lifecycle behavior without taking ownership of the persistent Classroom areas built in later phases.

| Slice | Outcome | Status |
| --- | --- | --- |
| Phase 3.A — Membership and visibility contract | Settle active, wind-down, inactive, historical-read, and member-specific archive behavior. | Complete |
| Phase 3.B — Schema and RLS | Separate participation, historical reading, and personal archive authority in server-owned records. | Complete |
| Phase 3.C — Server projections and commands | Return active/former/archived collections and enforce archive, restore, and read-only entry rules. | Complete |
| Phase 3.D — Student Classroom surfaces | Finish active Cards and add the Student Classrooms page for former and archived spaces. | Complete |
| Phase 3.E — Verification | Exercise Student isolation, historical access, archive independence, active-state invariants, and responsive interaction. | Complete |
| Phase 3.F — Documentation checkpoint | Reconcile the implementation with this contract and retain only concise operational references. | Complete |

These slices refine roadmap Phase 3 and preserve the Student-first vertical-delivery order. Tutor, Mentor, Guardian, Quality Assistant, and administrator behavior is implemented in later role slices, but Phase 3 must not adopt a Student-only data model that prevents those roles from receiving correctly scoped access.

### Phase 3.A membership and visibility contract

Course lifecycle, Classroom lifecycle, Membership lifecycle, and a member's preferred presentation are related but distinct state:

| Course state | Shared Classroom state | Student participation | Student presentation |
| --- | --- | --- | --- |
| `draft` | No Classroom exists | None | Nothing is shown. |
| `active` | `active` | Active | A mandatory active Dashboard Card is shown and cannot be hidden or archived. |
| `wind_down` | `active` | Active | A mandatory Dashboard Card is shown with an `Ending soon` presentation and cannot be hidden or archived. |
| `completed` or `cancelled` | `inactive` | Ended | The Classroom leaves the Dashboard, remains historically readable, and appears under Former Classrooms by default. The Student may personally move it to or restore it from Archived without changing another member's view. |

The shared `classrooms.status = 'archived'` state is reserved for Kelp-controlled retention or administrative lifecycle handling. A Student pressing Archive does not mutate that shared state. Personal archive state belongs to a server-side member preference keyed by both User and Classroom. It changes only that member's Former/Archived presentation and never deletes Course, Classroom, Membership, academic, communication, or audit history.

Classroom authorization distinguishes three questions:

1. **May this member participate?** Active Student Membership in an active Classroom permits the Student-facing actions owned by the implemented Classroom features.
2. **May this former member read retained history?** The Course Student retains read-only access to the inactive Classroom while the Classroom is retained. Later role slices apply time- and relationship-scoped history rules to former Tutors and Guardians rather than inferring access from a current Course foreign key.
3. **How does this member want the Classroom listed?** An authorized former member may archive or restore only their own inactive-Classroom presentation. This preference never grants resource access.

Classroom access is membership- and lifecycle-based. A URL parameter supplies only the Classroom identifier; it never supplies a role or authority. Active participation requires an active Membership. Historical reads require an eligible retained Membership or an explicit administrative capability. An unlinked account cannot discover the Classroom, its Memberships, its preference records, or its content.

The Student information architecture is:

- the Dashboard Classrooms block contains only mandatory active and wind-down Cards;
- Learn provides a standalone Classrooms destination with Active, Former, and Archived views;
- Former contains authorized inactive Classrooms that the Student has not personally archived;
- Archived contains the same Student's personally archived inactive Classrooms and provides Restore;
- inactive and personally archived Classrooms open the persistent Classroom shell in read-only mode;
- a Student cannot archive an active or wind-down Classroom through the interface or a direct server call.

The Phase 3 Card owns only authoritative membership and presentation data: Course title, Subject and focus, current Tutor, active or ending-soon state, Student-selected color, Student-selected order, and the Classroom entry action. The read contract may reserve nullable extension fields, but the interface does not render invented values. Next Class arrives with the generated-Class schedule, unread count with the Forum, homework state with Assignments, and Report Card availability with Reports.

Phase 3 does not add a partial production Course-termination command. Automatic closeout must eventually cancel future Classes and pending requests, dismiss incomplete required work, end the Course-scoped Tutor relationship, and generate the mandatory final Report Card atomically. Until those owning systems exist, Phase 3.B may characterize inactive and ended records through rollback-only test fixtures while implementing the read, archive, restore, and authorization invariants needed to consume the future closeout result.

### Phase 3.B implementation boundary

Classroom Memberships use durable tenure identifiers, retain ended tenures, and permit at most one active tenure for each Classroom, User, and Membership role. Member-private Classroom preferences are keyed by User and Classroom; their personal archive timestamp is valid only for a retained inactive Classroom and never mutates shared lifecycle state.

Server authorization distinguishes active participation from retained Classroom-shell reading. Direct Membership-table reads expose only the signed-in User's own rows unless the session has authorization-administration capability, preventing a Student from discovering a hidden Guardian through the membership roster. Course and Classroom reads accept eligible retained Memberships, while feature-owned content must still apply its own role and tenure bounds. Browser sessions receive no direct archive-preference mutation privilege; Phase 3.C owns the guarded archive and restore commands.

### Phase 3.C implementation boundary

The Student Classroom collection projection returns separate Active, Former, and personally Archived collections. Active and wind-down Classrooms remain mandatory participating entries; inactive retained Classrooms are read-only and move only between the signed-in Student's Former and Archived collections. Archive and Restore are server-authorized, idempotent commands. They record the personal transition without mutating the shared Classroom lifecycle, and they reject an unlinked Student or any attempt to archive an active or wind-down Classroom.

Persistent Classroom entry derives the viewer's Membership and returns either `participating` or `read_only`. An ended eligible Membership may open the retained Classroom shell but cannot use participation-only tools; an outsider cannot discover or open it. Former Tutor shell access is retained as read-only groundwork, while feature-owned content applies the Tutor's exact tenure bounds in its owning phase. The Dashboard payload remains focused on active Cards, while the separate collection projection supplies the Active, Former, and Archived Student Classrooms page. Next-Class, homework, unread, and Report Card summaries remain explicit deferred states.

### Phase 3.D–3.F implementation checkpoint

The Dashboard, standalone Student Classrooms page, and persistent Classroom shell consume the Phase 3.C projections directly. Active Cards retain Student-owned color and order; Former and Archived entries remain read-only and expose only personal Archive or Restore. Mouse, keyboard, desktop, and 390-pixel responsive behavior passed without document overflow or browser warnings. The 13-script rollback suite passed Student isolation, wind-down presentation, historical access, archive independence, and outsider denial, followed by a nine-actor zero-residue audit. Operational routes, RPCs, and verification commands live in the [Classroom guide](../../src/app/classroom/README.md#student-classroom-membership-lifecycle); older numbered contracts remain historical reference only.

### Phase 4 delivery slices

Phase 4 builds the persistent Classroom environment and introduces Mentor management through auditable vertical slices. Schedule mutation belongs to Phase 5; Tutor reassignment depends on that Schedule plus Phase 6 availability, qualifications, and supervision, so the user interface must not bypass those prerequisites.

| Slice | Outcome | Status |
| --- | --- | --- |
| Phase 4.A — Classroom management entry | Add a server-authorized Mentor management surface beside the active Classroom status, with all mutations staged. | Complete |
| Phase 4.B — Classroom Overview | Project authorized Course participants, provider/service model, dates, and current linked Schedule summary, including an explicit legacy missing-Schedule state. | Complete |
| Phase 4.C — Navigation and tool boundaries | Provide deep-linked Classroom areas, explicit unavailable states, staff-only supervision context, and a scheduled-Class-only live-tool boundary. | Complete |
| Phase 4.D — Private Files authority | Add private storage metadata, Membership/tenure authorization, retention, and audit boundaries. | Complete |
| Phase 4.E — Private Files interface | Add authorized upload, preview, download, withdrawal, moderation, and Classroom integration. | Complete; authenticated visual journeys move to 4.F |
| Phase 4.F — Verification and checkpoint | Exercise role isolation, historical access, responsive behavior, failure recovery, and concise documentation. | Complete |

Phase 4.A grants no mutation authority. The server returns `canManageClassroom` only when the viewer has an active Mentor Membership, is the Course's current supervisory Mentor, and the Course/Classroom remain active. Students, Tutors, Quality Assistants, administrators, historical members, and outsiders do not receive the ordinary Mentor button merely because another capability lets them inspect the Classroom shell. The disabled surface exposes the intended Tutor, recurring schedule, Course-ending, and Course-termination entry points while their authoritative commands remain absent.

Phase 4.B returns only the display names required for the Classroom team plus Course, curriculum, provider, and Schedule-summary fields. Phase 4.C narrows the internal structure further: Students and non-staff viewers do not receive the supervisory Mentor identity, while the assigned Tutor, Mentor, Quality staff, and administrators may use it. No Classroom projection exposes email, birth date, location, or other Profile data. The currently linked `learning_schedules` record is read-only context: existing Courses without a link remain readable with an explicit `missing` state, while Phase 5 owns migration, required versioned Schedules, editing, historical locks, and atomic Course-date synchronization.

Phase 4.D establishes Files as the Classroom's private shared drive. An active Student, the assigned Tutor, or the supervisory Mentor may upload a general shared file directly; a Guardian may preview and download retained visible files but may not upload or moderate them. Initial uploads accept PDF, JPEG, and PNG files up to 20 MB. The uploader may withdraw their own active file during the first two hours. Withdrawal removes it from ordinary member access without granting the browser authority to delete the physical object.

The assigned Tutor and supervisory Mentor may hide an active file only with a recorded reason. Hidden files leave ordinary Student and Guardian views but remain available to authorized moderators and administrators for review. Active replacement Tutors inherit access to the retained Classroom's visible files. Former Tutors retain read-only access only to visible files activated during their own Membership tenure. An unlinked user receives neither metadata nor Storage access.

Permanent purge is an administrative retention operation, not a Classroom-member action. No authenticated browser role receives Storage update or delete authority. A trusted server process may finalize a purge only after an authorized administrator supplies a reason, the provisional retention date has passed, no legal hold exists, and the object has been removed through the trusted Storage API. Until the accounting, legal, and privacy review replaces it, Classroom Files use the provisional two-year Classroom-retention policy.

Phase 4.E makes that authority usable from the persistent Classroom. Files is a functional deep-linked area with loading, empty, failure, retry, uploading, read-only, active, and moderator-hidden states. An eligible uploader chooses or drops one file at a time; the browser validates its name, declared type, matching extension, and server-projected size limit before reserving a unique object path. The adapter then uploads to the private bucket and activates the metadata. An activation retry is idempotent, while an abandoned reservation expires without granting another path access.

Preview and Download create short-lived signed links only after the Storage read policy rechecks current membership and file visibility. The interface never exposes a public bucket URL. Withdrawal and hiding use an accessible confirmation dialog: uploader notes are optional, while a Tutor/Mentor moderation reason is mandatory and between 10 and 1000 characters. Successful changes refresh the authoritative projection; failures remain visible and retryable. Neither action calls browser-side Storage deletion.

Classroom areas use stable `area` links inside the authorized persistent shell. Overview is functional; Forum, Assignments, Files, Report Cards, and History are clickable but explicitly identify their owning future phase instead of impersonating finished features. The live lesson room is not a Classroom area: its central button sits beside the Classroom status but remains unavailable until an eligible scheduled Class from the later live-Class lifecycle authorizes entry.

Tutor selection ultimately follows two Phase 6 branches. A qualified and schedule-compatible Tutor under the same Mentor may be reassigned through an atomic command. A qualified Tutor supervised by another Mentor may only become the subject of a request: the proposed Tutor accepts or denies it, both supervisory Mentors and the Quality Assistant are notified, and the complete transition is logged. An unavailable or unqualified Tutor cannot be selected in either branch.

## Support and notifications

A Support Case is a typed, auditable request for complaints, praise, refunds, transfers, incidents, suggestions, or relationship review. Creating a Case does not itself change money, credits, relationships, Classes, or access; authorized downstream actions perform those mutations.

Notification events are stored independently of delivery. Users configure optional channels such as email and SMS. In-app records remain available, and legally or operationally critical messages may follow separately defined exceptions. Twilio and email providers are adapters, not the source of notification truth.

## Kelp Tutor compensation

- Kelp processes Student lesson payments for Kelp Tutors.
- Ordinary Kelp Tutor compensation is 75% of eligible gross lesson value; Kelp's ordinary commission is 25%.
- Accrual follows the authoritative Class financial outcome, including approved no-show and promotional-credit rules.
- Settlement is held for 14 days after the Class.
- Eligible payouts are grouped for the 10th of each month.
- A post-payout dispute does not rewrite paid history. Where contractually allowed, Kelp and the Kelp Tutor share the dispute loss 50/50, with the Tutor portion recovered by an additional 25% withholding from future eligible earnings. An unpaid remainder when the Tutor leaves becomes an account receivable for manual review.
- Independent Tutors are outside this compensation and dispute model.

## Implementation rules

- Supabase Auth is the identity provider for the current application.
- RLS and protected server functions enforce ownership, relationships, capabilities, and lifecycle state.
- Browser capability checks improve UX but never replace RLS or server validation.
- Financial, attendance, role, relationship, and lifecycle histories use append-only events or compensating records where correction matters.
- Commands that can be retried use stable idempotency keys and atomic conflict checks.
- Private files use non-public storage with authorized access paths.
- Stripe webhooks and other provider callbacks are verified server-side and reconciled; the browser never directly credits a balance.
- Logs and notifications must avoid unnecessary sensitive information.
- Local browser adapters are development fallbacks, not production authority.

## Implementation roadmap

Each phase completes the full analysis-to-documentation pipeline.

| Phase | Vertical outcome |
| --- | --- |
| 0 | Audit current code, tests, schema, and documentation; consolidate the active product reference. |
| 1 | Student Profile and Configuration, including preferences and themes. |
| 2 | Student Dashboard grid, data, personalization, and responsive shell. |
| 3 | Classroom Memberships and Classroom Cards integrated with the Dashboard. |
| 4 | Persistent Classroom environment, Overview, navigation, and private Files. |
| 5 | Required versioned Course Schedule, Course-date synchronization, recurrence, editable future sessions, and Schedule interface. |
| 6 | Tutor availability, conflict validation, initial assignment, and same-/cross-Mentor reassignment. |
| 7 | Reusable Forms, Assessments, and Exams with secure definitions, Student delivery, responses, and grading. |
| 8 | Kelp Student Intake Waiting Room, trial, Assessment, Tutor/Schedule assignment, and atomic Classroom activation. |
| 9 | Classroom Forum and shared activity/history model. |
| 10 | Calendar, holidays, lesson requests, rescheduling, and concurrency. |
| 11 | Credit simulation, commitments, holds, expiration, and booking validation. |
| 12 | Live Class admission, forms, attendance, outcomes, credit charge/release, and history. |
| 13 | Assignment creation, submission, feedback, deadlines, and Classroom/Calendar integration. |
| 14 | Monthly and final Report Cards, calculation, archival access, and PDF generation. |
| 15 | Course Builder authoring, curriculum reuse, Schedule construction, versioning, and authorship once its UX is decided. |
| 16 | Reviewed provider applications, independent-Tutor ownership/supervision, payment gate, and Student invitations. |
| 17 | Verified school organizations, tenancy, and organization-scoped Quality/administrative roles. |
| 18 | Guardian, support, notification, integration, accessibility, security, and end-to-end completion work. |

Provider integrations are introduced behind adapters when their owning feature is stable. Stripe, Twilio, holiday providers, video, and other external services are not a separate excuse to postpone internal authority and failure handling.

## Deferred decisions

The following do not block the current vertical delivery work:

- jurisdiction-specific accounting, tax, deletion, and statutory retention periods;
- final Stripe/Stripe Connect liability and contractor terms;
- safeguarding providers, recording consent, background checks, and escalation obligations;
- exact hobby, learning-goal, and curriculum catalogs;
- authored-course copyright and revenue-sharing details beyond the current collaboration principle;
- Group Course pricing and complete cohort operations;
- mobile-application strategy;
- final external notification templates and critical-message consent exceptions;
- production video provider and real-time collaboration architecture.

Deferred questions are resolved when their vertical feature enters analysis. They should not be expanded into speculative implementation before that point.
