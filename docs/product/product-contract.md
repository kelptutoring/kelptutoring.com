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

- **Subject** is the broad domain, such as Mathematics, Physics, or Biology.
- **Subtopic** is a branch within one Subject, such as Mechanics or Algebra 1.
- **Content** is a specific concept within one Subtopic.
- One Class has one Subject. Standalone lesson requests require Subject, Subtopic, and Content selected from governed options that the Tutor is qualified to teach.
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

## Course lifecycle

1. Kelp proposes an Intake Mentor and a Quality Assistant confirms or overrides.
2. The Student submits goals; a Guardian may add separately attributed supplemental information.
3. The Mentor administers or validates an Assessment, meets the Student for Orientation, and designs a private draft Course.
4. A same-Subject Assessment may be reused for 90 days when the Mentor confirms it remains representative.
5. The Mentor assigns a qualified Tutor. The Tutor may request reassignment with a reason but may not silently reject an authoritative assignment.
6. The Student chooses meeting times from the assigned Tutor's eligible availability.
7. Platform-payment readiness is required before activation. Lesson credits are acquired only when the first funded Class commitment requires them.
8. Activation creates the Classroom and active Memberships.

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
- A recurring Course may have several weekly Classes, but at least one 60- or 90-minute Theory Class is required for automatic curriculum progression.
- Only qualifying Theory Classes advance recurring Course progression.
- On-demand and access-only Courses keep the dates generated in their versioned schedule. Progress does not move those dates automatically; changes require Tutor-routed schedule revision.
- A recurring schedule change updates ordinary future recurring Classes but does not rewrite Extra Classes or previously rescheduled exceptions.

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

The Classroom owns Overview, Forum, shared Files, Course material, assignments, reports, and lesson history. Accepted lesson-request attachments become the first relevant Forum message. Active Classroom content is not hidden merely because a user prefers a different Dashboard layout.

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
| 5 | Classroom Forum and shared activity/history model. |
| 6 | Versioned Course Schedule and generated Class foundation wired into the Classroom. |
| 7 | Calendar, availability, holidays, lesson requests, recurrence, and concurrency. |
| 8 | Credit simulation, commitments, holds, expiration, and booking validation. |
| 9 | Live Class admission, forms, attendance, outcomes, credit charge/release, and history. |
| 10 | Reusable Forms and Exams with secure definitions, delivery, responses, and grading. |
| 11 | Assignment creation, submission, feedback, deadlines, and Classroom/Calendar integration. |
| 12 | Monthly and final Report Cards, calculation, archival access, and PDF generation. |
| 13 | Course Builder authoring, curriculum reuse, schedule construction, versioning, and authorship once its UX is decided. |
| 14 | Guardian, support, notification, integration, accessibility, security, and end-to-end completion work. |

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
