# Kelp canonical domain glossary

**Contract phase:** 1 of 54  
**Status:** Canonical terminology baseline  
**Last updated:** 2026-07-20  
**Applies to:** product language, interface copy, database design, APIs, authorization, tests, analytics, support operations, and future contracts

## 1. Purpose and authority

This document defines the domain language for Kelp Tutoring. A capitalized term such as **Course**, **Classroom**, or **Class** refers to the domain object defined here, not merely to its everyday meaning.

When an older planning document, interface label, database proposal, or source-code comment conflicts with this glossary, this glossary takes precedence. Older documents remain useful historical context, but they are not authoritative for the terms defined here.

This phase establishes names and boundaries. It does not yet establish the complete database schema, state machines, pricing implementation, legal terms, or authorization policies. Those are later contract and architecture phases.

The words **must**, **must not**, **should**, and **may** are used intentionally:

- **Must / must not**: a settled domain invariant.
- **Should**: the preferred design, subject to a later contract.
- **May**: an allowed behavior, not a requirement.
- **Provisional**: useful for planning but not ready to encode as an irreversible business rule.
- **Deferred**: intentionally left for a named later phase.

## 2. Core domain map

```mermaid
flowchart LR
    template["Course Template and version"] --> course["Course\nassigned learning track"]
    course --> classroom["Classroom\npersistent Course environment"]
    course --> curriculum["Course Schedule\nwhat is studied and when"]
    course --> lessons["Lesson Schedule\nwhen recurring meetings occur"]
    lessons --> class["Class\none scheduled meeting"]
    class --> live["Live Classroom mode\nvideo, whiteboard, code editor"]
    classroom --> forum["Forum"]
    classroom --> assignments["Assignments and submissions"]
    classroom --> files["Files and Course material"]
    classroom --> history["Lesson history"]
    classroom --> reports["Report cards"]
    student["Student membership"] --> course
    tutor["Tutor assignment"] --> course
    guardian["Guardian relationship\nread-only and child-scoped"] --> student
```

The shortest correct distinction is:

- A **Course** says what a student or cohort is studying and following.
- A **Classroom** is the persistent digital place belonging to that Course.
- A **Class** is one scheduled meeting conducted through that Classroom.

## 3. Identity, roles, and access terms

### Account

The authenticated identity used to sign in to Kelp. An Account is not itself a role and must not be treated as the only source of authorization.

### Profile

The person-facing record associated with an Account. It contains shared personal information and may be connected to more than one role or workspace.

Kelp stores a student's country, state, and city, but not a full street address. Stripe may collect billing-address information for payment processing; Kelp must not unnecessarily duplicate that information in its Profile domain.

### Role

A named way a person participates in Kelp, such as Student, Guardian, Tutor, Mentor, Quality Assistant, or Administrator. Roles may be cumulative. Authorization must ultimately be expressed through scoped capabilities and relationships, not only through a single role string.

### Role Assignment

The effective, auditable record that a person holds a named Role. It has a start, optional end, state, granting authority, and reason. A Role Assignment is distinct from the Account and does not by itself grant access to every resource associated with that Role name.

### Capability

A specific permitted action within a defined scope. Examples include reading a child's Classroom, assigning a Tutor to a Course, reviewing a support case, or publishing a report card.

### Workspace Context

The interface context a multi-role user selects, such as Student, Guardian, Tutor, or Mentor. It changes navigation and defaults but never creates, broadens, or transfers authority.

### Operational Scope

The set of people and resources connected to an actor through effective relationships. Examples include a Guardian's linked children, a Tutor's assigned Courses, a Mentor's supervised Tutors, and a Quality Assistant's assigned Mentors or explicit investigation Cases.

### Role Suspension

The reversible prevention of some or all capabilities belonging to a Role Assignment while its history and attribution remain intact. Suspension never erases prior actions or effective periods.

### Student

A person enrolled in a Course, using platform tools, or booking Classes. A Student may have multiple Courses and assigned Tutors, but each individual Class bears on exactly one subject within one Course.

### Guardian

A person linked to one or more Students through a Guardian Relationship. Guardian is a cumulative role and is not defined only by the Student's age.

A Guardian:

- is constrained to their linked children;
- has Tutor-equivalent educational visibility into the linked child's Course and Classroom, not Tutor authorship, staff, or mutation capabilities;
- is read-only for academic and scheduling data except for attributed requests, permitted purchases, downloads, and Guardian-owned preference management;
- may purchase credits or services for a linked child;
- may have a separate Student profile and purchase for themselves;
- has notification preferences like every other user.

A verified Guardian may hide their identity from ordinary child-facing relationship UI. Hidden status never hides the Guardian from Kelp authorization, audit, the assigned Tutor, Supervising Mentor, or authorized Quality Assistant. A hidden Guardian cannot create visible activity that would require concealed or false attribution.

When the Student reaches the applicable adulthood threshold, continued access to new educational activity requires the Student's affirmative consent and the Guardian's continuation choice. Either party may end the relationship.

### Guardian Relationship

The durable, auditable connection between a Guardian and a Student. It defines scope; it is not inferred from a shared address, payment method, surname, or age. A request does not grant access until Kelp verifies the relationship.

The relationship distinguishes pending verification, active visible, active hidden, adulthood transition, suspended, ended, and historical states. Tutors and Mentors may request review within child scope, while an authorized Quality Assistant decides disputed, safety-driven, or forced suspension and ending. Ending the relationship removes forward-looking authority without erasing its period or attributed actions.

### Tutor

The canonical term for a person who teaches Students. **Teacher** is a permitted human-language alias but must not represent a separate domain role.

A Tutor may teach only subjects, subtopics, and content for which they have the required qualifications. A Tutor can teach more than one subject when separately qualified for each one.

For a Kelp Tutor, qualification alone is not enough: the Tutor's Kelp-teachable scope is limited to the intersection of the Tutor's approved qualifications and their sole active Supervising Mentor's approved qualifications.

### Kelp Tutor

A Tutor activated through Phase 8 and working for Kelp as a contractor. Kelp Tutors:

- are supervised through Kelp's Mentor and Quality Assistant structure;
- have exactly one active Supervising Mentor at a time;
- teach Kelp-billed Classes;
- receive monetary compensation through the Kelp Tutor settlement and payout process;
- are subject to Kelp's commission, reliability, dispute-recovery, and quality rules.

One Account may also use the Independent Tutor model, but each Course has one explicit service model. Kelp Tutor supervision and financial rules follow the Kelp-managed Course and never the selected Workspace Context.

### Independent Tutor

A Tutor who subscribes to Kelp as a platform user but does not work for Kelp. This is a Tutor service model, not the Mentor role.

An Independent Tutor:

- pays a flat USD 10 platform fee per month, regardless of Student count;
- is not assigned a supervising Mentor and is not subject to Kelp Tutor supervision;
- may use a Kelp Course Template or create their own;
- may administer assessment exams;
- may generate Kelp report cards;
- handles lesson prices and Student payments outside Kelp;
- receives no Kelp Tutor payout and pays no Kelp lesson commission;
- may be investigated by a Quality Assistant for conduct, safety, content, academic quality, or platform misuse;
- cannot send private payment disputes to Kelp for adjudication.

Students taught only through the Independent Tutor model do not pay Kelp's USD 5 Student platform fee and do not consume Kelp Lesson Credits for externally billed Classes.

An Independent Tutor must not receive Mentor-wide authorization merely because their workspace includes Course-management capabilities.

One Account may hold both Kelp Tutor and Independent Tutor service relationships. Each Course remains explicit about its service model and cannot silently combine or convert the two models.

Ordinary Independent Tutor platform use relies on self-declared teaching scope, not Kelp Tutor Qualification. An Independent Tutor may complete an optional separate Kelp verification Track, but verification creates no Kelp supervision, employment, lesson commission, Lesson Credit, compensation, or payout relationship. A Kelp-generated Independent Tutor Report Card is not by itself a Kelp endorsement.

### Mentor

A Tutor who may also supervise other Tutors. A Mentor is responsible for the Student intake and Course-assignment process within their scope, including assessment, goals review, orientation, Course setup, and Tutor assignment.

A Mentor must be qualified for every Subject and teaching scope in which a supervised Kelp Tutor is authorized to teach. A Tutor is never split across multiple active Supervising Mentors.

Mentor capabilities are scoped to their assigned Tutors, Students, applicants, and Courses. Being a Mentor does not imply global access.

When a Mentor personally teaches a Kelp-managed Course, they act as a Kelp Tutor for that Course and must have a different qualified Supervising Mentor. Self-supervision, self-approval of protected actions, and direct or indirect supervisory cycles are prohibited.

### Quality Assistant

The role above Mentors in Kelp's operational supervision structure. The canonical code-facing name should be `quality_assistant`; ambiguous abbreviations such as QA and QS should not become separate roles.

A Quality Assistant may:

- supervise Mentors and investigate Tutor-Mentor misalignment;
- receive and investigate support cases;
- review conduct, safety, content, and academic-quality concerns;
- extend a Course during its wind-down period;
- supervise an Independent Tutor investigation without becoming that Tutor's permanent Mentor.

Quality Assistant assignments flow downward and are not constrained by subject qualification.

Each active Mentor has one active Primary Quality Assistant Assignment for ordinary oversight. One Quality Assistant may oversee many Mentors. Additional Quality Assistant access requires an explicit Case, coverage, handoff, or emergency scope and is time-bounded.

Quality Assistant corrections are append-only. A Quality Assistant does not teach, grade, impersonate another actor, or access unrelated Cases without the separate Role, qualification, relationship, and scope required for that action.

### Primary Quality Assistant Assignment

The effective relationship connecting one Mentor to the Quality Assistant responsible for ordinary operational oversight. It creates a clear escalation chain without granting every Quality Assistant global access.

### Temporary Intervention Scope

A time-bounded, reasoned grant allowing a Quality Assistant or another authorized staff actor to review or act on a particular Case, Tutor, Mentor, Course, or safety event without receiving permanent global access.

### Administrator

A privileged operational role responsible for system-wide administration. **Admin** and **ADM** are aliases in informal conversation, but `admin` is the canonical code-facing value.

Administrator access must still be auditable and must not be used as a substitute for defining normal role capabilities.

### Break-glass Access

Exceptional, time-bounded Administrator access used to protect safety, security, availability, or data integrity when the ordinary capability path cannot resolve an event in time. It is limited by target, reason, strong authentication, audit, and review. It never permits silent impersonation or historical overwriting.

### Tutor Applicant

A person applying to become a Kelp Tutor. A Tutor Applicant is not an active Tutor and gains no Tutor authority by applying, uploading credentials, passing one exam, or entering an Applicant Classroom. Kelp may grant a learner-scoped Student Role Assignment only inside the staff-training environment.

### Tutor Application

The top-level, auditable request by one person to become a Kelp Tutor. It stores the Applicant, requested Subjects, application evidence, lifecycle, assigned staff, blockers, decisions, and links to one or more Qualification Tracks.

### Qualification Track

The Subject-specific evaluation path within one Tutor Application. Each Track has its own taxonomy scope, Assessment, preparation, Mock Session, evidence, result, and decision. One Track may succeed while another fails unless a shared integrity, safety, identity, or conduct event blocks the entire Application.

### Application Screening

The non-academic completeness and eligibility review before academic evaluation. Support checks identity readiness, contact data, required declarations, requested Subject, evidence presence, terms, and blocking risk indicators without deciding whether the Applicant knows the Subject.

### Applicant Development Course

The staff-training Course through which Kelp prepares and evaluates an Applicant. It uses Kelp's educational structures but creates no Student subscription fee, Lesson Credit, Tutor compensation, commercial Student-Tutor relationship, or ordinary reliability event.

### Applicant Classroom

The Classroom belonging to an Applicant Development Course. It may contain orientation material, preparation, practice, Qualification Assessments, feedback, Files, Mock Session preparation, and decision notices.

### Applicant Membership

The limited Membership granting an Applicant learner-like access to their Applicant Classroom. It is not an ordinary Student subscription and grants no Tutor, Mentor, grader, Student Profile, real Student, or customer Classroom authority.

### Applicant Mentor

The Subject-qualified Mentor assigned to guide and academically evaluate all simultaneously active Qualification Tracks for one Applicant. The Applicant is not split across concurrent Applicant Mentors. If the Applicant activates as a Kelp Tutor, the Applicant Mentor becomes the Supervising Mentor unless an approved handoff completes before activation.

### Qualification Assessment

The versioned, immutable exam and associated manually reviewed evidence used to evaluate Subject, Subtopic, and Content knowledge for a Qualification Track.

### Assessment Blueprint

The approved mapping from an Assessment Version to taxonomy nodes, required sections, coverage weights, critical items, scoring rules, and minimum evidence needed to support a Qualification scope.

### Mock Session

The live evaluated lesson in which an Applicant teaches through Kelp's Classroom tools under a standardized scenario and rubric. It is not a paid Class, uses no ordinary customer Student or child, consumes no Lesson Credits, and creates no Tutor compensation.

### Mock Session Rubric

The versioned evaluation of content accuracy, explanation, diagnostic questioning, adaptation, structure, pacing, communication, professional conduct, tool use, and safeguarding behavior.

### Qualification Evidence Set

The immutable references used for one decision, including the Application snapshot, verified credentials, Assessment Blueprint and Attempt, manual grading, preparation record, Mock Session and rubric, integrity events, reviewer identities, and Applicant responses.

### Tutor Qualification

The effective, approved record of the canonical Subject, Subtopics, and Content a Tutor has demonstrated they may teach. It stores the Qualification Evidence Set, approval, effective period, review date, state, and append-only history.

### Operationally Enabled Scope

The portion of an approved Tutor Qualification that a Kelp Tutor may currently teach because it is also covered by the sole active Supervising Mentor and is not suspended, expired, disqualified, or otherwise restricted.

### Probationary Tutor Period

The initial active Kelp Tutor review period after activation. The Tutor may teach inside Operationally Enabled Scope while the Mentor and Quality Assistant apply the required person-wide and Subject-scope checkpoints.

### Qualification Renewal Review

The scheduled review before a Tutor Qualification reaches its review deadline. It determines whether to renew, narrow, suspend, or end the Qualification using current evidence and, when required, reassessment.

### Triggered Qualification Review

An unscheduled review caused by a complaint, repeated poor outcomes, curriculum change, expired evidence, integrity concern, conduct event, extended inactivity, or Mentor or Quality Assistant request.

### Qualification Suspension

The temporary prevention of teaching through one Qualification or all Qualifications while history remains intact. It may be scope-specific or account-wide.

### Disqualification

The authoritative end of one or more Tutor Qualifications after review. It removes future teaching authority in the affected scope but never erases prior Classes, authorship, Tutor Assignments, decisions, or evidence.

### Supervisory Relationship

The effective relationship connecting one Kelp Tutor to one Supervising Mentor. It determines ordinary oversight and the qualification intersection across the Tutor's Kelp work. Effective periods never overlap, and the relationship cannot be self-referential or cyclic.

### Supervising Mentor

The one active Mentor responsible for a Kelp Tutor at a given time. The Kelp Tutor's operational teaching authorization is the intersection of the Tutor's and Supervising Mentor's approved qualifications. A Quality Assistant may coordinate a Mentor change, but two Mentors must not simultaneously split supervision of the same Tutor. A person cannot be their own Supervising Mentor.

### Tutor Assignment

The Course-scoped relationship connecting one Tutor to a Student or cohort for one non-overlapping effective period. It is created through the applicable intake or reassignment process and is distinct from the Tutor's general qualification. One Course has at most one active Tutor Assignment at a time.

Automatic Course termination terminates its Tutor Assignment. Reassigning a Tutor creates a successor Assignment, atomically replaces the active Tutor Membership, and preserves the existing Course and Classroom. The outgoing Assignment's Tutor identifier and effective period are never overwritten.

### Assignment Change Request

The auditable request to replace, end, pause, or review a Tutor Assignment. It records a structured type and reason, requester, evidence links, reviewer, decision, and intended outcome. Submitting it does not itself change access, scheduling, or Assignment state.

### Effective Tutor period

The immutable non-overlapping interval during which one Tutor Assignment was authoritative for a Course. Reports and historical views identify every Tutor by these periods rather than inferring responsibility from Posts, grades, or Classes.

### Handoff Snapshot

The server-created educational continuity package pinned to an exact reassignment cutover instant. It includes the Course Summary and Schedule Version, progress, upcoming obligations, unresolved academic work, authorized Files, reporting context, and operational blockers. It excludes private Support Cases and unrelated Profile data.

### Supervisory ownership handoff

The Quality-Assistant-confirmed transfer of Kelp-managed Course oversight when a replacement Tutor belongs to another qualified Supervising Mentor. The prior and receiving Mentor periods do not overlap, and replacement activation occurs after or atomically with the handoff.

### Interim Tutor Assignment

A time-bounded Kelp Tutor Assignment used after emergency restriction of the ordinary Tutor and before permanent replacement. The qualified Supervising Mentor is the initial interim academic contact; new Classes remain blocked until all ordinary validation succeeds.

### Former Tutor Relationship

The historical record left after reassignment or termination. The former Tutor loses active Classroom access but retains a cutoff-bound view of their Assignment period, Classes, authored records, and authorized Handoff Snapshot. They cannot see ordinary post-cutover activity, the Student's changing live Profile, unrelated Courses, new relationships, or private Support Cases. Authored records remain attributed to their original author.

## 4. Learning-structure terms

### Assessment

The diagnostic process used to understand a Student's current knowledge. It may include an assessment exam, goals form, and a one-time meeting. In the Kelp Tutor model, a Mentor uses these results to create or select the Course and assign a qualified Tutor. An Independent Tutor may administer an Assessment for their own Students.

### Course Template

A reusable, versioned educational product from which a Course may be created. It may contain curriculum structure, goals, schedules, materials, assessments, or related authored content.

`Course Template` is the current canonical planning name; the complete authored-product and licensing model is deferred. A Course must reference a specific Template version so later edits do not silently change an active Student's Course.

### Course Template Version

An immutable numbered snapshot of a reusable Course Template. An active Course pins an exact Version and never follows a mutable `latest` pointer. A newer Version may be offered to the Supervising Mentor but is adopted only through an approved successor Course Schedule Version.

### Course Draft

The private Student-specific Course record created during Mentor-led Course design. It has a stable identity but remains inactive and has no Classroom until Phase 2 Activation Review succeeds.

### Course

A mentor-set or independent-tutor-set learning track assigned to one Student or a defined cohort. It describes what should be studied over time and is based on the Student's Assessment and goals.

A Course:

- has one Subject and may cover multiple related Subtopics and Content items;
- owns a Course Schedule and, when recurring, a Lesson Schedule;
- has exactly one persistent Classroom;
- has one active Tutor Assignment at a time;
- may enroll one Student or a defined group cohort;
- is not the same object as a Class, Classroom, Course Template, or subscription.

### Individual Course

A Course enrolling one Student.

### Group Course

A Course created for a defined cohort after a Group Course Offering reaches its minimum accepted cohort size and every academic, staffing, consent, scheduling, and commercial activation condition passes atomically. Group Classes exist only inside a Group Course. Kelp does not turn an individual Class into an ad-hoc multi-Student meeting.

### Group Course Offering

A versioned proposal for a future Group Course. It pins the Subject scope, level or Assessment band, Course Template Version, timezone and schedule window, minimum and maximum cohort size, service model, price, Tutor requirements, acceptance rules, and sales period.

### Group Queue Entry

One Student's private, effective request to be considered for a compatible Group Course Offering. It is not a Course, Classroom Membership, Tutor Assignment, Class booking, or payment charge.

### Cohort Candidate Set

The internal, privacy-preserving set of mutually compatible Group Queue Entries being evaluated for one Group Course Offering. Compatibility is evaluated before queue age, and candidates do not see one another merely because they are in the same set.

### Group Course Offer

The immutable 72-hour offer sent to a Student or authorized Guardian after Kelp identifies a viable cohort, Tutor, schedule, and price. Acceptance creates a Cohort Reservation but does not activate a Course or charge a Class.

### Cohort Reservation

The temporary reservation created by an accepted Group Course Offer. One Student learning need has at most one active Cohort Reservation; accepting one offer atomically releases competing offers for that need.

### Course Schedule

The versioned pedagogical plan describing what the Student should study each week. It may contain goals, Subjects, Subtopics, Content, materials, activities, assignments, projects, and exams.

The Course Schedule is distinct from the Lesson Schedule. Extending a Course appends or replaces it through a new Schedule version; it must not destroy the prior version.

### Course Schedule Version

An immutable numbered snapshot of one Course's complete approved academic plan. Every approved Material or Minor change produces a successor Version. Historical work retains the Version that governed it.

### Module

An ordered pedagogical grouping inside a Course Schedule. A Module organizes Learning Objectives and Course Schedule Items but is not a Subject, Course, Course Week, or Class.

### Course Schedule Item

A stable planned unit of academic work or a milestone inside a Course Schedule Version. It may represent content, a resource, practice, Assignment, Project, Exam, review, or check-in. It is never the live Class event itself.

### Course Progress

Student-specific state associated with stable Course Schedule Item identities. Progress, submissions, answers, grades, and participation are stored separately from immutable Schedule Versions.

For recurring tutoring, Course Progress may include the Curriculum Progression Cursor. For on-demand tutoring and access only, progress changes do not move the generated planned windows or Hard deadlines.

### Course Progression Mode

The Course-level rule governing curriculum pacing:

- `theory_gated` applies only to recurring weekly tutoring and advances its Cursor after a Qualifying Theory Class;
- `fixed_dates` applies to on-demand tutoring and access only, has no Class-driven Cursor, and retains generated Course Schedule dates until an authorized successor Version changes them.

Under fixed-date progression, the Student requests changes through the assigned Tutor. The Tutor then follows the Course's applicable approval and versioning rules.

### Practice Composition

A reusable ordered collection of approved practice or exam-question references that may be attached to a Course Schedule Item. The repository's current `course_compositions` are Practice Compositions, not complete domain Courses.

### Lesson Schedule

The planned dates, times, durations, recurrence rules, holidays, and exceptions for Classes. It answers when meetings occur, not what the Student studies.

### Lesson Schedule Version

An immutable numbered snapshot of a Course- and Tutor-Assignment-scoped recurring meeting arrangement. Every approved series-level change creates a successor Version; one-Class exceptions do not rewrite it.

### Recurring Slot

One weekly rule inside a Lesson Schedule Version. It records weekday, local start time, 30-, 60-, or 90-minute duration, Instruction Focus, date bounds, and Tutor-timezone anchor. A Student may select multiple weekly Slots within the service limits.

### Instruction Focus

The planned academic purpose of a Recurring Slot or Class. Phase 4 supports `theory` and `problem_solving`.

### Theory Slot

A Recurring Slot planned for theory. It must last 60 or 90 minutes. Every active recurring Lesson Schedule contains at least one Theory Slot.

### Qualifying Theory Class

A completed 60- or 90-minute Class whose server-stored post-Class record confirms theory was delivered. Only a Qualifying Theory Class advances the curriculum progression of a recurring tutoring Course. A 30-minute Class never qualifies.

### Projected Meeting

A read-only preview derived from recurrence beyond the rolling two-week Class-materialization window. It is not a Class, credit commitment, Hold, attendance record, or Tutor earning and cannot open as a live meeting.

### Curriculum Progression Map

The derived link between expected Theory occurrences and the ordered Course Schedule steps they are intended to advance. It references exact Course Schedule and Lesson Schedule Versions without rewriting either.

### Curriculum Progression Cursor

The Course Progress state identifying the next curriculum step for a recurring tutoring Course. It advances idempotently only after a Qualifying Theory Class and never mutates the Course Schedule Version.

### Class revision

An immutable record of a one-Class scheduling or duration change. An individually rescheduled Class retains one logical Class identity with append-only revisions.

### Course extension

An authorized change during the 14-day Course wind-down. A Mentor or Quality Assistant approves it for a Kelp-managed Course. An Independent Tutor may approve it for their own Course after Kelp validates its structure, dates, Memberships, and service state. An extension:

- keeps the same Course and Classroom;
- extends the Tutor Assignment;
- does not require a new Assessment;
- creates a new Course Schedule version;
- restarts the wind-down clock from the new Course end date.

### Course wind-down

The 14-day period following the scheduled end of a Course. It begins at `00:00` on the calendar day after the Course end date in the Student's confirmed IANA timezone and becomes due to terminate at the same local boundary 14 calendar days later. The derived instants and timezone are stored authoritatively and do not move because of a later Profile timezone change.

The Course has finished its planned Schedule but has not yet automatically terminated. Existing Forum threads, grading, Tutor comments, and explicitly reopened existing submissions may continue. New required academic work requires an extension. A Mentor or Quality Assistant may extend a Kelp-managed Course during this period.

### Course termination

The final lifecycle transition occurring automatically at the end of the wind-down unless the Course is extended earlier.

Termination must:

- terminate the Course-scoped Tutor Assignment;
- cancel incomplete Assignments;
- dismiss an owed but unsubmitted exam as `dismissed_due_to_course_end`;
- cancel pending Lesson Requests;
- cancel future Classes;
- generate the mandatory final Report Card;
- make the Classroom inactive and read-only;
- make each continuing historical Membership eligible for independent archival.

A submitted but ungraded Assignment, Project, or Exam becomes `awaiting_final_review` rather than zero. The Course still terminates on time, while the final Report Card remains `pending_final_review` until the work is graded or an authorized reviewer records a justified exclusion. A render or grading failure never keeps the Course active indefinitely.

A terminated Course cannot be extended or silently reactivated. Continued study uses a linked successor Course. A Quality Assistant corrects an erroneous system transition through an explicit administrative reversal record without deleting lifecycle history.

### Course dismissal

Not a canonical object. When the phrase “dismiss the Student” was used in planning, it meant dismissing an owed, unsubmitted exam at Course termination. It does not mean deleting the Student or treating the exam as a score of zero.

## 5. Classroom and communication terms

### Classroom

The persistent Course-specific digital environment shared by authorized members. Each Course has exactly one Classroom, and a Classroom belongs to exactly one Course.

The Classroom owns or presents:

- Forum;
- Overview and Course materials;
- Lesson Schedule;
- Assignments and submissions;
- shared Files;
- Lesson History;
- monthly and final Report Cards;
- entry into the Live Classroom mode.

The Classroom remains the same when its Tutor is reassigned or its Course is extended.

### Live Classroom

The synchronous meeting mode inside a Classroom. It may contain video calling, whiteboard, code editor, and other real-time teaching tools. It is not a second persistent Course hub and is not a synonym for the scheduled Class event.

### Classroom Membership

The relationship granting a person scoped access to a Classroom, such as Student, active Tutor, Guardian, or permitted supervisor. Membership status and a user's archive preference must be stored separately from the Classroom itself.

### Active Classroom

A Classroom whose Course and required teaching relationship remain active or in wind-down. An Active Classroom cannot be archived by any member.

### Inactive Classroom

A Classroom whose Course and Course-scoped Tutor Assignment have terminated. It is read-only for ordinary Student, Guardian, and former-Tutor collaboration. Authorized members may read Forum history, academic work, feedback, Files, materials, Lesson History, and Report Cards, but cannot create new Posts, submissions, Classes, Lesson Requests, or academic work. New disputes and correction requests use Support Cases. Historical content remains readable subject to retention rules.

### Archived Classroom

An Inactive Classroom a particular historically authorized member has hidden from their normal view. Archiving and restoration are per-Membership presentation actions, not deletion or global state changes. No member may archive an Active or wind-down Classroom. Archival does not change authorization, another member's view, retention, file or Report Card downloads, or lifecycle state.

### Classroom Card

The draggable dashboard hero card that gives quick access to a Classroom. It is not the Classroom itself.

The minimal card contract includes Subject, Tutor, next Class, homework badge, Student-specific color, active or archived state, unread count, and an accessible actions menu. Dragging changes dashboard presentation only; it does not change Course or Classroom identity.

### Forum

The primary asynchronous conversation area of a Classroom. A submitted and accepted Lesson Request becomes the first relevant message or post in the Class conversation context. Student comments associated with Report Cards remain Forum content rather than becoming part of the Report Card.

### Post

A top-level Forum item. A Post may represent an announcement, Class-related message, accepted request, or other Course communication.

### Thread

The conversation attached to a Forum Post. The application should avoid using `Class thread` to mean the entire Classroom.

### File

A privately stored attachment belonging to an authorized domain object such as a Lesson Request, Forum Post, Assignment submission, or Classroom resource. File access is controlled server-side; browser possession of a path is not authorization.

## 6. Scheduling and Class terms

### Class

One scheduled live meeting event between the assigned Tutor and one Student or an authorized Group Course cohort. A Class has exactly one Subject and a scheduled duration of 30, 60, or 90 minutes.

`Class` is the canonical domain object. The word `lesson` may appear in user-facing prose, but `Lesson` alone must not become a competing database entity.

### Recurring Class

A Class generated from the recurring Lesson Schedule of a recurring Course arrangement. Moving the recurring Lesson Schedule affects future ordinary Recurring Classes from an effective date, but does not silently move Extra Classes or individually rescheduled Classes.

### Extra Class

An additional Class outside the ordinary recurring series. It remains an exception and is not converted into part of the recurrence when the ordinary Lesson Schedule moves.

### Standalone Class

An on-demand Class booked using applicable Lesson Credits rather than generated as an ordinary recurring commitment. Its request must specify Subject, Subtopic, and Content.

### Individually rescheduled Class

A single Class whose date or time has been changed without changing the underlying recurring Lesson Schedule. It is preserved as an exception when the series moves.

### Lesson Request

The structured request that proposes creating or modifying a Class. The canonical name remains `Lesson Request` even though the resulting event is a Class.

A request summarizes at least:

- Tutor;
- regular or Extra Class;
- date and time;
- Subject, Subtopic, and Content as applicable;
- Duration;
- Credit cost where Kelp billing applies;
- optional message;
- optional permitted attachments and web links.

The selected taxonomy values use canonical identifiers and store label/path snapshots for historical readability.

### Pending Lesson Request

A submitted request not yet accepted, declined, expired, or cancelled. A pending request does not itself guarantee the slot.

### Accepted booking

A Class created or modified by an accepted Lesson Request. Acceptance must be atomic: two competing requests must not create overlapping accepted bookings for the same Tutor.

### Tutor Availability

The times at which a Tutor is normally open to proposed Classes. It is a source for scheduling decisions, not a promise that a slot remains bookable.

### Recurring availability

The Tutor's repeating weekly availability pattern.

### Date-specific availability override

An exception for one date that adds or removes availability without changing the recurring pattern.

### Time off

A planned Tutor absence across one or more dates. Time-off rules are separate from the short-notice reliability entitlement.

### Holiday observance

A Student or Tutor preference determining whether local public holidays derived from country, state, and city should block new bookings. A recurrence skips an observed holiday. An existing accepted Class must not be silently cancelled merely because a holiday setting changes.

### Tutor buffer

The protected interval between one Class ending and the next Class beginning for the same Tutor. The initial invariant is one hour.

### Booking horizon

The furthest future date a Student may request. The initial Student booking horizon is two weeks.

### Minimum request notice

The minimum time between request submission and the proposed Class. The initial rule is 24 hours.

### Request expiry

The deadline after which a still-pending Lesson Request expires automatically. The initial rule is 12 hours before the proposed Class.

### Hold window

The restricted period beginning six hours before the scheduled Class. Applicable credits become held, duration cannot be changed, and late cancellation or rescheduling rules apply.

### Late-change entitlement

The Student's limited right to complete one zero-charge cancellation or reschedule inside the Hold Window. It begins available per Classroom, never accumulates beyond one, and is consumed only when the Class change, financial outcome, and Entitlement Use Event commit successfully.

After use, eight consecutive Clean Completion Events in the same Classroom restore it. Student-caused no-show, unexcused early departure, or an approved exceptional late disruption resets recovery progress without consuming another entitlement. Tutor-initiated changes, approved Time Off or holidays, Kelp failures, lifecycle cancellations, and ordinary Student changes outside the Hold Window neither consume nor reset it.

Tutor short-notice reliability is Account-wide for the Kelp Tutor and must not be modeled as the Student entitlement.

### Class Change Request

The append-only request to cancel, reschedule, or change the duration of one persisted Class. It records the current Class revision, requester, requested result, reason, authoritative timing snapshot, approvals, successor slot where applicable, and decision history. A request does not change the Class.

### Class Change Event

The server-authored statement that an approved cancellation, reschedule, or duration change became effective. It links the prior and successor Class revisions or cancellation outcome, actors, approvals, entitlement and reliability effects, financial transition, and audit instant.

### Change timing snapshot

The server-created record of the current Class revision, authoritative scheduled start, request-received instant, timezone, and outside- or inside-Hold classification. Browser time never supplies this authority.

### Entitlement Use Event

The append-only event that consumes the one available late-change entitlement for one Student and Classroom. It exists only for an effective Student late cancellation or reschedule and starts recovery progress at zero.

### Entitlement Recovery Progress

The derived zero-through-eight count of consecutive Clean Completion Events in the same Classroom after the latest Entitlement Use Event. Reaching eight restores one entitlement; it is not a spendable or accumulating balance.

### Tutor change proposal

A Tutor-authored request for the Student to approve a different Class time or supported duration. The original Class remains authoritative until Student approval and an atomic successor transition succeed. Student silence is not approval.

### Tutor cancellation

The Tutor's explicit declaration that the scheduled service cannot be provided. It requires a reason, creates zero Student charge and full allocation release, never consumes Student entitlement, and receives the applicable Tutor reliability classification.

### Qualifying Tutor short-notice incident

A Tutor-caused cancellation or forced reschedule inside the six-hour Hold Window for a Kelp-managed Class, unless an approved emergency, holiday, Time Off, Kelp-failure, lifecycle, or safety exclusion applies.

### Tutor reliability warning

The append-only warning created by the rolling Tutor reliability ladder. The second qualifying incident in the active span creates the first warning; the third creates the second warning and opens Quality Assistant penalty review. Aging out of the active span never deletes warning history.

### Planned disruption request

A Tutor request for future absence across a bounded date range. It is separate from Student entitlement and short-notice Tutor reliability, does not silently cancel accepted Classes, and receives the later Time Off workflow.

### Protective cancellation

A server-authorized, non-party-fault cancellation for an approved lifecycle, Kelp failure, safety action, or similar protection. It creates zero Student charge, full allocation release, no Student entitlement effect, no Tutor reliability incident, no attendance event, and no Tutor compensation.

## 7. Subject and curriculum taxonomy

### Subject

The broad academic domain, such as Mathematics, Physics, or Biology. It is required for a Course and Class. One Class cannot contain multiple Subjects.

### Subtopic

A selectable branch within a Subject, such as Mechanics, Algebra 1, or Algebra 2. It is required for a Standalone Class.

### Content

A more specific concept within a Subtopic, such as two-dimensional kinematics, circular motion, or electrical charge. One Standalone Class may select multiple Content items only when they belong to the selected Subtopic.

### Taxonomy snapshot

The immutable copy of selected labels and hierarchy stored alongside canonical taxonomy identifiers when a request or historical record is created. It preserves what the user saw even if the live taxonomy is later renamed or reorganized.

### Unlisted-content request

The support or curriculum request used when a Student cannot find an appropriate fixed option. Arbitrary `Other` text must not be stored as though it were an approved Subject, Subtopic, or Content value.

## 8. Academic-work and reporting terms

### Assignment

A Course-scoped piece of work assigned to a Student with an optional deadline and submission. Homework, projects, and some exams may share delivery infrastructure but retain their academic category.

### Homework

An Assignment categorized as ordinary practice or weekly work. A Classroom Card shows only a compact due-state or count; details belong in the Classroom.

### Project

A larger assessed work categorized separately from Homework and Exams.

### Exam

An assessed activity such as a weekly assessment, midterm exam, or final exam. Exams included in reporting contribute through the Exams category unless a later grading contract states otherwise.

### Dismissed exam

An exam closed without a grade because it was still owed and unsubmitted when the Course terminated. Its status is `dismissed_due_to_course_end`. It is excluded from grade calculations but remains in Course history and may be identified in the final Report Card.

### Participation score

A Tutor's whole-number post-Class participation grade from 0 through 5. Reporting normalizes it to a 0-100 scale by multiplying it by 20. Missing participation is missing data and is not automatically a zero.

### Report Card

A Course-wise academic report available inside the Classroom and through the Classroom Card. It is not account-wide and is not generated per Tutor relationship outside the Course.

A Report Card includes, as applicable:

- Student name;
- Tutor name or Tutors and their effective periods;
- Subject and Subtopic;
- Course begin date;
- report date;
- analyzed period in days;
- number of Classes;
- applicable assessment grades;
- participation result;
- Tutor comments.

### Monthly Report Card

A Report Card calculated from work and participation inside one monthly reporting period.

### Final Report Card

The mandatory report generated automatically at Course termination. It recalculates the entire Course from its underlying grade records and does not average the monthly Report Cards. If submitted work remains ungraded, the report becomes `pending_final_review` without delaying Course termination or assigning an automatic zero.

### Pending final review

The closeout state used when a final Report Card cannot yet publish because submitted work remains ungraded or is under an authorized academic correction. Kelp escalates the task to the Tutor, Mentor, and Quality Assistant until the work is graded or explicitly excluded with a reason.

### Report Card category

One component of the weighted grade. The initial default weight ratios are:

- Homework and weekly assignments: 3 (30%);
- Projects: 2 (20%);
- Exams: 4 (40%);
- Participation: 1 (10%).

A Tutor may change the weights, which must total 100%. If a category has no grades, it is excluded and the remaining category weights are proportionally renormalized.

Grades within each category are normalized to a 0-100 score from earned versus available points. The detailed rounding and missing-work contract belongs to the reporting phase.

### Draft Report Card

The editable current report visible to the authorized Tutor, Student, and Guardian.

### Published Report Card

An immutable versioned snapshot with a downloadable PDF for that exact Version. Any correction creates a successor Version and PDF rather than mutating published history. The Tutor may correct their comment during the initial two-hour window, but that edit also creates a successor Version.

## 9. Service plans, credits, prices, and payment terms

### Service Plan Offering

A versioned commercial catalog definition describing one available service, its eligibility, currency, prices, billing cadence, included capabilities, restrictions, and effective sales period. It is not a user's subscription or Course.

### Service Plan Version

The immutable Version of a Service Plan Offering accepted for a subscription, Course Service Arrangement, or Group Course Offer. Later catalog or price edits never rewrite an accepted prior Version.

### Student Platform Access Subscription

The Account-scoped USD 5 monthly monetary service that permits a Kelp-managed Student to use applicable Course and platform tools. One subscription may support multiple Kelp-managed Courses and is separate from Course service paths, Lesson Credits, Class commitments, Roles, and Memberships.

### Course Service Arrangement

The effective-dated Course-scoped record selecting `recurring`, `on_demand`, or `access_only` for a Kelp-managed Course. One Student may hold different active arrangements for different Courses, while one Course has at most one active Arrangement at an effective instant.

### Recurring Tutoring Arrangement

A Course Service Arrangement permitting a weekly Lesson Schedule, ordinary Recurring Classes, recurring-price exact-shortfall funding, and theory-gated Course progression. It creates no fixed monthly Lesson Credit deposit.

### On-demand Tutoring Arrangement

A Course Service Arrangement permitting Standalone Class requests with the assigned Kelp Tutor but creating no recurring Lesson Schedule. It is also the canonical unresolved outcome after the two-month no-show Subscription Freeze.

### Access-only Arrangement

A Course Service Arrangement providing the Course, Classroom, assigned Kelp Tutor, and platform tools without Class-booking authority or a Lesson Schedule.

### Independent Tutor Platform Subscription

The Account-scoped USD 10 monthly service allowing an Independent Tutor to use Kelp for their permitted Students, Courses, Classrooms, schedules, Assessments, and reports, regardless of Student count. It creates no Kelp staff role, supervision, lesson-payment, commission, Lesson Credit, accrual, or payout relationship.

### Payer

The verified Account or external customer identity responsible for a monetary service. The Payer may be the Student or an authorized Guardian and remains distinct from the beneficiary and from educational access.

### Payer Authorization

The server-authoritative record of a Payer's consent for one Student subscription, manual purchase, or Automatic Top-up purpose. It records the beneficiary, payment-method provider reference, limits, effective period, terms Version, authority, and revocation history without storing raw payment credentials.

One current renewal Payer and one current Automatic Top-up Payer may exist per Student and purpose. Other authorized Guardians may make explicit manual purchases without silently replacing either current Payer.

### Funding Cycle

The monthly period used to measure a Payer's Automatic Top-up spending limit. Its anchor is the first Automatic Top-up date and is separate from the platform-subscription renewal period and the Tutor payout date.

### Service Plan Change

An effective-dated, Course-scoped request and decision to upgrade, downgrade, pause, resume, or end a Student Platform Access Subscription or Course Service Arrangement. It preserves prior Versions and service history and never rewrites an Ongoing or completed Class.

### Payment Action Required

The safe state used when payment readiness, consent, renewal, or a funding attempt fails. It blocks the new paid capability or Class commitment without pretending that access or booking succeeded.

### Lesson Credit

Kelp's integer booking unit for Kelp-billed tutoring Classes. It is not money, platform access, Tutor compensation, or an Independent Tutor payment.

The initial duration mapping is:

| Scheduled duration | Full Student charge | Student no-show charge |
| --- | ---: | ---: |
| 30 minutes | 10 credits | 5 credits |
| 60 minutes | 20 credits | 10 credits |
| 90 minutes | 30 credits | 15 credits |

Lesson Credits are owned account-wide by the Student, not by a Tutor or Classroom. A Tutor relationship ending does not erase them.

### Student Credit Account

The single Account-wide financial subledger that benefits one Student and records all Lesson Credit acquisition, allocation, commitment, hold, charge, release, expiration, reversal, transfer, restriction, refund allocation, and administrative adjustment history. Its authoritative quantities are derived from append-only records and never from a mutable Profile balance.

### Credit Ledger Entry

An immutable, effective-dated posting to a Student Credit Account. Corrections use linked compensating entries rather than editing or deleting prior history. Required audit persistence is part of the posting's success.

### Credit Lot

A separately traceable group of integer Lesson Credits issued through one purchase, recurring funding event, promotion, transfer, charge reversal, or administrative grant. A Lot pins its Student beneficiary, Lot Source, original quantity, effective instant, expiration policy, and, when purchased, original Payer, currency, money amount, and price Version. Remaining quantities are derived from ledger entries and allocations rather than mutated in place.

### Lot Source

The immutable origin category of a Credit Lot, such as recurring top-up, Standalone Class purchase, manual package, promotion, transfer in, charge reversal, or administrative grant. A transfer or reversal preserves traceability to the original source.

### Credit Allocation

The pinned assignment of integer quantity from one Credit Lot to one Credit Commitment, Hold, Charge, refund, transfer, or other authorized outcome. Promotional Lots allocate first; within each priority, earliest expiration wins and stable Lot ID breaks ties. Later purchases never reshuffle an existing allocation automatically.

### Posted credit quantity

The historical quantity represented by successful Student Credit Account ledger entries before subtracting commitments, Holds, expiration, or restrictions. It is an accounting view and does not by itself prove booking capacity.

### Available credit quantity

The uncharged and unexpired quantity remaining in eligible Credit Lots after subtracting active allocations, Holds, transfers, refunds, and restrictions at the evaluation instant.

### Spendable credit capacity

The integer quantity that remains eligible for a specific proposed Kelp-billed Class at its scheduled start instant after accounting for Lot validity, deterministic allocation, prior Commitments, Holds, refunds, transfers, and restrictions. It is calculated server-side; a displayed raw balance never proves spendable capacity.

### Credit commitment

The fully allocated reservation required before an accepted future Kelp-billed Class can be booked. A Commitment reduces spendable capacity, preserves its pinned Lot allocations, and is not the final Charge.

### Credit hold

The stricter reservation produced from a Credit Commitment at the beginning of the six-hour Hold Window. Held quantity remains traceable to its originating Credit Lots and cannot be transferred, refunded, expired, or used elsewhere before settlement. A Hold is not a final Charge.

### Credit charge

The final ledger posting produced from one authoritative Class financial outcome. It may consume the full or a partial pinned allocation, cannot settle the same Class Hold twice, and cannot make the Student credit quantity negative.

### Credit release

The ledger outcome that returns uncharged committed or held quantity to its originating Credit Lot. Quantity released after that Lot's unsuspended expiration becomes expired immediately.

### Credit reversal

A compensating ledger entry that restores quantity from a prior Credit Charge or corrects another posted outcome without deleting history. Restored quantity preserves its source and expiration basis unless an explicit administrative remedy lawfully grants a different Lot.

### Credit expiration

The append-only outcome that makes an unused eligible Credit Lot quantity no longer spendable after its snapshotted expiration instant. The instant is calculated by calendar months in the Student's confirmed timezone at acquisition and remains fixed if the Student later changes timezone.

### Expiration Suspension

An approved, scoped pause that preserves a Credit Lot's remaining lifetime during the two-month no-show Subscription Freeze or a qualifying Kelp-caused Case. A Case-specific suspension requires an owner, reason, and review date; opening a generic Support Case never suspends expiration by itself.

### Credit Transfer

An atomic, Support-approved movement of unused, unexpired, unrestricted purchased credits between Student Credit Accounts. The destination preserves original source, Payer, money basis, and expiration; promotional credits are not ordinarily transferable.

### Credit Refund Allocation

The traceable allocation that identifies which unused credit quantity and original purchase basis correspond to a requested or completed money refund. Credit removal and provider refund remain separate but reconciled records and use original purchase allocation rather than current catalog price.

### Credit Restriction

Explicit server-authoritative authority that temporarily prevents otherwise available Credit Lot quantity from being spent, transferred, or refunded for a recorded reason. A restriction is not a negative balance and never deletes historical credit ownership.

### Credit Reconciliation Case

The operational record used when payment, Lot issuance, allocation, Commitment, settlement, transfer, refund, or provider state disagree or cannot complete atomically. It records the mismatch, protected quantities, responsible owner, resolution, and linked audit history.

### Manual Credit Package

An explicit Payer purchase in an approved 40-credit multiple. Each 40 credits grants one calendar month of lifetime, capped for ordinary packages at 480 credits and 12 months; the active catalog may expose only a subset and may define later-approved discounts.

### Automatic top-up

A server-authorized purchase of exactly the Lesson Credit shortfall needed before a recurring commitment can be accepted. A larger package is a separate manual purchase.

Top-up authority belongs to the payer:

- a self-paying Student controls their limit;
- a Guardian controls the limit for their payment method separately for each child;
- a Student cannot raise a Guardian-funded limit;
- future consent may be withdrawn without silently invalidating an already accepted obligation;
- a failed payment is retried once, after which the Class is not booked and support contact is recommended.

Existing eligible credits fund the recurring Class first. The Automatic Top-up then buys only the exact remaining shortfall at the pinned recurring price Version, subject to the Payer's remaining Funding Cycle limit.

### Money amount

A monetary value expressed in currency-specific minor units or a documented higher-precision internal unit. Money must never be represented by the Student Lesson Credit ledger.

### Platform fee

A monetary subscription fee for access to Kelp services. It is separate from Lesson Credits. The approved initial rules are one USD 5 monthly Student Platform Access Subscription per Kelp-managed Student Account regardless of Kelp-managed Course count and one flat USD 10 monthly Independent Tutor Platform Subscription regardless of Student count. Students served only through the Independent Tutor model owe no separate USD 5 Kelp Student platform fee for that service.

### Kelp-billed Class

A Class for which Kelp handles the Student payment, Lesson Credit commitment and charge, and Kelp Tutor compensation.

### Externally billed Class

A Class taught through the Independent Tutor model whose lesson price and Student payment remain outside Kelp. It may record scheduling, attendance, assignments, and reporting, but must not create Kelp Lesson Credit charges or Tutor payouts.

### Tutor Compensation Basis Snapshot

The immutable money snapshot pinned to one Kelp-billed Class when its initial Credit Commitment succeeds. It identifies the Class and Tutor Assignment, service path, accepted Price Version, currency, scheduled duration, full gross lesson value, 75/25 compensation policy Version, and revision history. A valid duration change creates a successor Snapshot; later price edits never rewrite an earlier one.

### Gross lesson value

The full money value assigned to a Class by its pinned recurring or Standalone Price Version before outcome modifiers, Tutor share, Kelp commission, processor fees, taxes, refunds, or recovery. It is never derived from a timeless credit-to-money conversion.

### Earned compensation basis

The gross lesson value after applying the effective Authoritative Class Outcome or valid cancellation modifier. Completed, valid early completion, and ordinary Student early departure normally use 100%; Student no-show uses 50%; zero outcomes use 0%; and an authorized reduced outcome supplies an explicit basis.

### Tutor Compensation Ledger

The append-only money subledger for one Kelp Tutor and currency. It records accruals, settlement release, payout items, transfers, adjustments, dispute receivables, recovery withholding, and reconciliation. It is separate from Student Lesson Credits, Payer money records, Kelp accounting, Stripe balances, and Independent Tutor private payments.

### Tutor accrual

The exact monetary amount recognized for a Kelp Tutor from one effective compensation-bearing Class outcome. It identifies the Compensation Basis Snapshot, earned basis, exact 75% Tutor share, 25% Kelp commission, outcome Version, and settlement-hold end. It is not a Lesson Credit balance or payout.

### Tutor settlement hold

The non-payable interval ending exactly 14 times 24 hours after the authoritative Class operational end. Eligibility begins no earlier than both the hold end and the final outcome effective time. Retry never shortens or restarts it.

### Payout Eligibility Event

The append-only statement that one exact Tutor accrual is final, its hold ended, payout readiness exists, no active block applies, and it may enter a Payout Batch.

### Tutor Payout Batch

The immutable monthly collection of eligible items for one Tutor, currency, and destination Version. The ordinary Batch locks at 00:00 on the 10th in Kelp's configured paying-entity timezone. Exact items and recovery deductions aggregate before the final transfer is rounded once to the currency minor unit using half-even.

### Tutor Payout Item

The immutable link from one eligible accrual or adjustment to one Payout Batch. It preserves the Class, exact internal amount, outcome modifier, Tutor share, commission, recovery effect, and displayed allocation.

### Tutor payout

The provider transfer of one locked Tutor Payout Batch. Kelp initiates an ordinary Batch on the 10th or next supported banking day. A Batch, submitted transfer, provider success, internal reconciliation, and Tutor statement are distinct states; failed or returned transfer never erases the payable amount.

### Kelp commission

The normal 25% share of earned compensation basis retained by Kelp for a Kelp Tutor Class. The Kelp Tutor's normal gross share is 75%. Ordinary payment and payout processor fees do not silently reduce that 75%, and Recovery Withholding is displayed separately rather than added to commission.

### Compensation Adjustment

An append-only correction to a Tutor accrual, eligibility, payout, commission, or recovery result. It records exact amount, predecessor, authority, reason, evidence, and whether money already moved. A post-payout correction never edits the paid item.

### Payout Reconciliation Case

The operational record used when internal Batch, transfer, connected-account, bank, dispute, or provider state disagrees. It protects the payable amount and prevents duplicate transfer while an authorized actor resolves the mismatch.

### Tutor Recovery Balance

The exact remaining Tutor half of an approved post-payout Dispute Loss that Kelp covered externally and may recover under the accepted Tutor agreement. It is a money receivable rather than a negative payout or Student Credit balance.

### Recovery Withholding

The append-only deduction from future eligible Kelp Tutor compensation while a Tutor Recovery Balance exists. It is capped at an additional 25 percentage points of earned basis and at the remaining Recovery Balance, temporarily reducing the cash share from 75% to 50% when the full deduction is required. It never makes a payout negative, never applies to Independent Tutors, and stops at exact recovery.

### Dispute loss

For Kelp Tutors only, the recoverable financial loss produced by a post-payout Student dispute or chargeback. Independent Tutors are excluded because Kelp does not handle their Student payments.

The working loss basis is:

`disputed principal + applicable dispute fees - successfully recovered funds`

Kelp and the Kelp Tutor each bear 50% of that loss. Kelp covers the external loss first. A disputed purchase spanning several Classes, Tutors, fees, or unused credits must be allocated through original money and Class lineage before Tutor liability is assigned. Until the Tutor's half is recovered, Recovery Withholding deducts at most 25 additional percentage points of future earned basis. If the Tutor leaves with an unrecovered balance, it becomes an account receivable for manual review; Kelp must not automatically charge an unrelated payment method.

Stripe Connect charge type, negative-balance responsibility, transfer reversal, and exact recovery mechanics remain an integration decision. The internal ledger and Tutor agreement must remain authoritative for Kelp's 50/50 allocation.

## 10. Attendance, incidents, and reliability terms

### Class Session

The bounded live occurrence associated with one persisted Class and current Class revision. It owns admission, Presence Evidence, operational state, Attendance Summary Versions, incident references, and Authoritative Class Outcome history. It is not the persistent Classroom or a media-provider room by itself.

### Session Admission

The server-authoritative decision permitting one verified participant to enter a Class Session in a specific role. It is scoped to the Class, current Membership or Tutor Assignment, participant, role, and effective time. A route, query parameter, browser role, or media-provider identity never creates admission.

### Presence Evidence

An append-only server record indicating that an admitted participant was available in the Live Classroom during a bounded time. Authenticated heartbeats, media-session signals, reconnects, and trusted observations may contribute evidence, but one browser timer or provider event is never authoritative by itself.

### Presence Interval

The normalized server-time interval derived from valid Presence Evidence for one admitted participant. Overlapping tabs or devices form a union and never multiply attendance. Separate valid intervals may accumulate after reconnection.

### Attendance interval

The earlier canonical name for a participant Presence Interval. Phase 11 uses **Presence Interval** when precision matters; both names refer to the same normalized server-authoritative interval and never to a browser timer.

### Joint Attendance Interval

The intersection of one Student Presence Interval and the assigned Tutor Presence Interval for the same Class Session. Guardian, observer, Mentor, Quality Assistant, and Support presence never contributes.

### Joint attendance

The union duration of valid Joint Attendance Intervals. Disconnections pause the current interval, separate valid intervals accumulate, and presence before scheduled start does not count toward paid service.

### Attendance Summary

An immutable result Version recording scheduled anchors, admitted participants, normalized intervals, accumulated Joint Attendance, threshold, lateness, departures, incident references, and the evidence Version used to derive one outcome.

### No-show Checkpoint

The server-evaluated instant 10 minutes after authoritative scheduled start. A party relying on the other's no-show remains validly available through the checkpoint unless trusted Kelp failure evidence excuses departure.

### Operational Class State

The real-time state showing whether the Class Session is `scheduled`, `entry_open`, `waiting`, `ongoing`, or `ended`. It is separate from the Authoritative Class Outcome so an ended Class may still have a pending incident.

### Authoritative Class Outcome

The append-only server decision stating the effective attendance type and financial-output code for one Class revision. It references one Attendance Summary Version, incident and review authority where applicable, correction history, no-show-streak action, and Clean Completion eligibility. Phase 10 consumes its credit quantity without reconstructing attendance.

### Completion threshold

Joint Attendance equal to 50% of scheduled Class duration: 15 minutes for a 30-minute Class, 30 for 60, and 45 for 90. Reaching the threshold qualifies the Class for a full completed outcome but does not immediately end its operational session.

### Early Completion Confirmation

An independently attributed Student or Tutor acknowledgment that a substantive Class ended intentionally before the Completion Threshold. Valid early completion requires separate confirmations from both participants within 24 hours and no contradictory incident; Tutor confirmation alone never manufactures a full Charge.

### Attendance Incident

A traceable suspected or confirmed event that may affect a Class outcome, including outage, repeated disconnection, early departure, outside-Kelp claim, or contradictory evidence. Filing an incident does not change attendance or settlement without authorized outcome authority.

### Outcome Review

The scoped Quality Assistant investigation of a timely Attendance Incident. It records evidence and the recommended or approved result. A post-transition correction to an Ongoing or completed Class status is posted by an Administrator as an append-only successor Version.

### Post-Class Tutor Review

The Tutor's required educational record for an attended Kelp-managed Class, due within 24 hours. It confirms the Class taxonomy snapshot, Instruction Focus, lesson format, structured participation evidence, whole-number participation score from 0 through 5, and optional feedback. It is not attendance authority or a conduct report and has a two-hour ordinary edit window.

### Post-Class Student Survey

The Student's optional, separately permissioned Class feedback. Skipping it never changes attendance, credits, Tutor compensation, or Support rights. A requested conduct report is stored separately and confidentially.

### Clean completed Class

A completed Class without a late Student change, no-show, Tutor-initiated disruption, or applicable technical incident. Its authoritative qualification is recorded through a Clean Completion Event rather than inferred later from UI state.

### Clean Completion Event

The append-only statement that a completed Class satisfies the Clean Completed Class definition. Later Student late-change entitlement and Tutor reliability contracts consume it without reinterpreting raw presence.

### Student no-show

The outcome reached when the Tutor remains validly present and available through the No-show Checkpoint but the Student has not begun Joint Attendance. It produces the 50% Lesson Credit charge shown in the duration table, records a conduct incident, and does not consume the Student's late-change entitlement.

Three consecutive Student no-shows account-wide freeze the recurring subscription. An attended Class resets the streak.

### Student No-show Streak Event

The append-only account-wide increment or reset produced by a final Kelp-managed Class outcome. Student no-show increments; an attended completed, valid early completion, or Student early-departure outcome resets; unrelated outcomes remain neutral. The third consecutive increment triggers the Phase 9 Subscription Freeze exactly once.

### Tutor no-show

The outcome reached when the Student remains validly present and available through the No-show Checkpoint but the Tutor has not begun Joint Attendance. It cancels the Class, releases Student credits, creates no Tutor compensation, and generates an investigation alert.

### Mutual absence

The outcome when neither Student nor Tutor satisfies the No-show Checkpoint. It is not a Student no-show, creates no automatic Student charge or Tutor compensation, and may create separate conduct or reliability review.

### Student early departure

The outcome when Joint Attendance began but the Student ended availability below the Completion Threshold while the Tutor remained available. It produces the full scheduled Student credit quantity unless an approved Kelp or safety incident changes the result and resets the no-show streak because attendance occurred.

### Tutor early departure

The pending outcome when Joint Attendance began but the Tutor ended availability below the Completion Threshold while the Student remained available. It creates no automatic final Student Charge or Tutor compensation before Outcome Review.

### Kelp service outage

A confirmed failure of Kelp or an integrated Live Classroom service that materially prevents the Class. Trusted confirmation produces an immediate zero-charge, zero-compensation outcome and consumes neither party's late-change entitlement. A reported or suspected outage remains Settlement Pending until reviewed.

### Settlement pending

The temporary outcome for an outside-Kelp meeting claim, reported or suspected outage, Tutor early departure, contradictory evidence, or another approved attendance exception.

Either party has seven days to report the issue. The Phase 10 Hold remains protected and financial settlement stays pending for at most 14 days. If no required blocking report exists and Kelp has not confirmed an outage by day 14, the normal full outcome becomes eligible. A Quality Assistant reviews timely reported exceptions, and the same pending incident cannot settle twice.

### Subscription freeze

The two-month pause triggered by three consecutive account-wide Student no-shows. Recurring billing and Automatic Top-ups pause, Credit Lot expiration clocks preserve their remaining lifetime, future Recurring Class materialization stops, and future recurring Classes receive the Phase 9 service-freeze outcome. Course and platform-tool access remains available.

If unresolved after two months, every affected Recurring Tutoring Arrangement becomes `on_demand`, the recurring Lesson Schedule ends without erasing history, the USD 5 platform fee resumes, and each Credit Lot resumes with the remaining lifetime it had at freeze start.

### Rolling Tutor reliability window

The moving span used to evaluate one Kelp Tutor's qualifying short-notice incidents across Kelp-managed Classes. For each new incident, Kelp looks back through the Tutor's twenty-four most recent Clean Completion Events and counts qualifying incidents still inside that span. Each incident ages out only after twenty-four later Clean Completion Events; fixed blocks are forbidden.

The first active-span incident is recorded without a warning, the second creates the first warning, and the third creates the second warning plus Quality Assistant penalty review. Planned Time Off, Independent Tutor work, and approved protective exclusions are evaluated separately.

## 11. Support, notification, and preference terms

### Support Case

A traceable request to Kelp concerning a complaint, compliment, suggestion, refund, transfer, safety concern, conduct concern, academic-quality concern, or service incident. Quality Assistants receive the applicable cases.

Kelp may accept support cases about an Independent Tutor's conduct or platform use while refusing to adjudicate the Independent Tutor's private Student payment disputes.

### Notification event

A server-created event that may be presented in-app or delivered through an approved channel. Examples include request received, accepted or declined request, upcoming hold, held credit, Class reminder, cancellation, low balance, and Homework deadline.

### Notification preference

A server-stored choice determining which optional channels a user wants for each notification category. It must not be stored only in the browser.

### Delivery channel

In-app, email, SMS, or another supported means of delivering a Notification Event. Twilio is the intended later integration for applicable messages. Channel delivery does not replace the underlying in-app event or audit history.

### User preference

A user-scoped, cross-device setting such as theme, dashboard module order, Classroom Card color, calendar display style, holiday observance, notification choice, or confirmed timezone.

Preferences belong in dedicated records rather than expanding the main Profile row. Classroom Card colors belong to the Student's preference, not globally to the Classroom.

## 12. Authored educational products

### Authored Product

A provisional umbrella term for reusable educational content created through Kelp, potentially including Course Templates, questions, exams, schedules, or other curriculum material.

The following interim business intent is recorded but is not yet an implementation-ready intellectual-property contract:

- Kelp and the creator collaborate while the creator is active at Kelp.
- The creator receives 2% of Kelp's revenue attributable to their Product while they remain at Kelp.
- When the creator leaves, Kelp retains the Product and continues identifying the creator by name.
- After leaving, the creator receives no further royalties.
- The former creator loses authenticated editing or in-site Product access but receives or retains access to a PDF or equivalent content copy.

The meanings of `Product`, `attributable revenue`, derivative work, co-authorship, approval, withdrawal, attribution, and the governing legal instrument are explicitly deferred. Code must not infer joint copyright or calculate royalties until that contract is complete.

### Product author

The person credited with the original Authored Product or a traceable contribution. Attribution history must survive later edits, Course use, Tutor reassignment, and the author's departure.

### Product version

An immutable snapshot of an Authored Product. Active Courses reference versions rather than mutable author drafts.

## 13. Canonical aliases and deprecated usages

| Avoid as a domain object | Canonical usage |
| --- | --- |
| Teacher role | Tutor; `teacher` may be accepted only as a legacy alias |
| Lesson as a standalone entity | Class for the meeting; Lesson Request for the request |
| Subject Space | Classroom |
| Class space | Classroom |
| Class hub | Classroom |
| Live Classroom as the meeting record | Class is the record; Live Classroom is its synchronous mode |
| Course as a single meeting | Class |
| Classroom as a single meeting | Class |
| Learning path | Course or Course Schedule, depending on meaning |
| Student-Tutor link without scope | Tutor Assignment scoped to a Course |
| Shared copyright flag | Authored Product contract and versioned rights records, still deferred |
| Credits for platform access | Money-based Platform Fee |
| Tutor credits | Monetary Tutor accrual and payout |
| Global archive flag | Per-user archive state on Classroom Membership |
| Independent Tutor as Mentor | Independent Tutor service model with scoped capabilities |
| QA and QS as separate roles | Quality Assistant |

## 14. Phase 1 invariants

The following statements must remain true throughout later phases unless the product owner explicitly revises this contract:

1. One Class bears on exactly one Subject.
2. A Course and its Classroom are persistent structures; a Class is one meeting.
3. Each Course has exactly one Classroom, and each Classroom belongs to exactly one Course.
4. Tutor reassignment keeps the same Course and Classroom and preserves authored history.
5. Active Classrooms cannot be archived by anyone.
6. Archiving an Inactive Classroom is per member and never means deletion.
7. Course termination terminates the Course-scoped Tutor Assignment and cancels future operational work as defined above.
8. Group Classes exist through Group Courses, not through ad-hoc conversion of an individual meeting.
9. Student Lesson Credits are integers, account-wide, non-negative, and separate from money.
10. Platform fees and Independent Tutor lesson payments are not Lesson Credits.
11. Independent Tutor Classes are externally billed and create no Kelp credit charge or Tutor payout.
12. The Kelp Tutor dispute-loss recovery rule never applies to Independent Tutors.
13. A Guardian's academic access is read-only and constrained to linked children.
14. An Independent Tutor is not granted Mentor-wide authorization.
15. A Student can request Classes only with an assigned Tutor qualified for the selected taxonomy.
16. Historical records store canonical identifiers plus readable snapshots and original attribution.
17. Active Courses reference immutable Course Template and Schedule versions.
18. Full billing addresses and payment credentials are not Profile data.
19. Payment completion in the browser is never authoritative for granting credits or services.
20. Preferences with cross-device effect are stored server-side in dedicated preference records.
21. Each Kelp Tutor has exactly one active Supervising Mentor at a time.
22. A Kelp Tutor may teach only within the intersection of the Tutor's and Supervising Mentor's approved qualifications.
23. An active Course pins immutable Course Template and Course Schedule Versions.
24. Course Schedule changes never silently book, cancel, or reschedule Classes, and Class changes never silently rewrite the Course Schedule.
25. Progress, submissions, answers, grades, and participation remain separate from Schedule Versions.
26. Every approved Material or Minor academic-plan change creates a successor Course Schedule Version.
27. Students may request changes and organize personal reminders but cannot edit authoritative Course Schedule dates or deadlines.
28. Course Template updates never apply automatically to active Courses.
29. Course Weeks use explicit Monday-through-Sunday ranges in the Student's confirmed timezone, allowing partial first and last weeks.
30. A custom Student Course does not automatically become a reusable shared Product.
31. Practice Compositions are Course components, not complete domain Courses.
32. Lesson recurrence is weekly and may contain multiple Student-selected Recurring Slots within the service limits.
33. Each Slot has a planned focus of `theory` or `problem_solving`, and every active recurring Schedule has at least one Theory Slot.
34. Theory Slots last 60 or 90 minutes; a 30-minute Class never advances curriculum progression.
35. Only a completed 60- or 90-minute Class where theory was actually delivered advances the Curriculum Progression Cursor.
36. Problem-solving-only Classes, cancellations, no-shows, and Projected Meetings do not advance the Cursor.
37. Curriculum Cursor advancement is Course Progress and never mutates a Course Schedule Version.
38. Meetings project through the Course end date but materialize as Classes only inside a rolling two-week window.
39. Recurrence anchors in the Tutor's confirmed IANA timezone and is converted for the Student.
40. One-Class cancellation or rescheduling never changes the recurring series.
41. Every Kelp-managed activated Course, including access only, has an active qualified Kelp Tutor Assignment; an Independent Tutor Course remains assigned to its Independent Tutor.
42. Theory-gated progression applies only to recurring weekly tutoring.
43. On-demand and access-only Courses use fixed generated Course Schedule dates and no Class-driven Curriculum Progression Cursor.
44. Standalone Classes and ordinary progress updates never move fixed Course Schedule dates automatically; changes require a Tutor-routed authorized successor Version.
45. Wind-down begins at `00:00` on the day after the Course end date in the Student's timezone and becomes due to terminate at the same local boundary 14 calendar days later.
46. Active and wind-down Classrooms cannot be archived by any member.
47. Wind-down may close existing work but new required academic work requires a Course extension.
48. Submitted ungraded work becomes `awaiting_final_review` and never an automatic zero.
49. A pending grade or Report Card render never keeps the Course active indefinitely.
50. Every published Report Card Version and its PDF are immutable; corrections create successor Versions.
51. An Inactive Classroom is read-only for ordinary historical collaboration.
52. Every continuing historically authorized member may archive and restore only their own Inactive Classroom view.
53. The provisional two-year minimum retention clock begins at Course termination and is not an automatic deletion instruction.
54. An approved voluntary early ending creates a successor Course Schedule Version and follows the ordinary 14-day wind-down.
55. An Independent Tutor may approve extension of their own Course after Kelp structural validation without creating Kelp lesson-payment effects.
56. An Extra Class may not end after the Course termination instant.
57. A terminated Course cannot be extended or silently reactivated; continuation uses a linked successor Course.
58. A former Tutor's historical Classroom access never includes the Student's changing live Profile, unrelated Courses, or later private relationships.
59. Tutor reassignment creates a successor Assignment and never overwrites the outgoing Tutor or effective period.
60. One Course has at most one active Tutor Assignment, and Assignment effective periods never overlap.
61. An Assignment Change Request does not itself change access, scheduling, or Assignment state.
62. Ordinary reassignment cannot become effective during an ongoing Class.
63. Outgoing Assignment and Membership end atomically with replacement Assignment and Membership activation.
64. A candidate Tutor has no full Student Profile, Classroom, scheduling, or teaching access.
65. Before cutover, an approved replacement may see only a time-bounded Handoff Snapshot; full Tutor access begins at activation.
66. The replacement Tutor receives educational Course history but never private Support Cases through reassignment.
67. Former Tutor visibility is bounded by the cutover snapshot and excludes ordinary post-cutover activity.
68. Outgoing-Tutor pending Lesson Requests and future Classes are cancelled without entitlement, reliability, attendance, Lesson Credit, or Tutor-payout consequences.
69. No outgoing Lesson Schedule, Lesson Request, or future Class transfers automatically to the replacement Tutor.
70. Reassignment preserves academic-work authorship; later grading separately identifies the grader.
71. Reports spanning Tutor periods identify every Tutor and effective period.
72. Cross-Mentor replacement requires a Quality-Assistant-confirmed Supervisory ownership handoff and never creates two ordinary Course supervisors.
73. Emergency restriction preserves a qualified named interim academic contact and blocks new interim Classes until validation.
74. Ending a Tutor relationship while the Course continues requires replacement or interim continuity.
75. Independent Tutor transfer requires Student or Guardian acceptance, participating Tutor consent unless restricted for cause, and Kelp structural validation; private payment obligations never transfer through Kelp.
76. Group Course reassignment changes the Tutor for the whole cohort atomically rather than one member.
77. Historical relationship views retain stable IDs plus readable Tutor or Student name, Subject, and effective-period snapshots.
78. Assignment, Membership, handoff, and decision history is append-only.
79. Student or Guardian acknowledgment provides a correction and concern route but does not replace Mentor Assignment authority.
80. Browser state, a route, or possession of an Assignment ID never grants Tutor access.
81. One Account may hold multiple non-destructive Role Assignments.
82. A Workspace Context changes presentation and never authority.
83. Authorization is evaluated server-side from Capability, relationship, Operational Scope, resource state, and restrictions.
84. Browser state, a route, a role label, or a resource identifier never grants access.
85. Every privileged action identifies the authority actually used.
86. Guardian access exists only through a verified Guardian Relationship.
87. Guardian access is constrained to linked children.
88. Tutor-equivalent Guardian access means educational visibility, not Tutor action authority.
89. A Guardian cannot teach, grade, impersonate the Student, or directly mutate academic and scheduling records.
90. Guardian and Student submissions and decisions remain separately attributed.
91. A hidden Guardian remains visible to authorized staff and audit.
92. A hidden Guardian cannot create visible activity under concealed or false attribution.
93. Adult forward-looking Guardian access requires affirmative Student consent and Guardian continuation choice.
94. Ending a Guardian Relationship does not erase its period or authored actions.
95. Tutors and Mentors may request Guardian review but do not unilaterally manufacture or erase a verified relationship.
96. Every active Kelp Tutor has exactly one active Supervising Mentor.
97. A Kelp Tutor's teachable scope is the Tutor-Mentor qualification intersection.
98. A person cannot be their own Supervising Mentor.
99. Supervising Mentor relationships cannot form cycles.
100. A Mentor teaching a Course uses Tutor authority for teaching and separate Mentor authority for supervision.
101. A teaching Mentor cannot approve their own protected academic action.
102. Each Mentor has one active Primary Quality Assistant.
103. Quality Assistant ordinary access follows assigned Mentors or explicit Temporary Intervention Scope.
104. Quality Assistant supervisory action does not require Subject qualification, but teaching does.
105. A Quality Assistant correction appends a new attributed decision and never rewrites history.
106. Direct Quality Assistant oversight of a Tutor is exceptional and time-bounded.
107. Independent Tutor capability is limited to their own Students, Courses, Classrooms, and authorized products.
108. Independent Tutor access does not confer Mentor, Quality Assistant, Support, Administrator, or global catalog authority.
109. One person may use both Kelp Tutor and Independent Tutor models, but one Course cannot silently combine them.
110. Course service model, not Workspace Context, controls supervision and financial behavior.
111. Support cannot perform academic work without a separate valid academic Capability.
112. Administrator correction preserves prior values, actor, evidence, reason, and effects.
113. Break-glass Access is explicit, time-bounded, scoped, reasoned, and audited.
114. No privileged actor may impersonate another person or erase authorship.
115. Role and relationship suspension removes future authority without erasing history.
116. Role, relationship, supervision, and access history is append-only.
117. Failed audit persistence prevents a privileged state change from being considered successful.
118. Ending or suspending access is enforced at the next trusted authorization check, regardless of an open page.
119. A Tutor Applicant is not an active Tutor.
120. Applying, uploading a credential, passing one exam, or selecting a workspace never grants Tutor authority.
121. One Tutor Application may contain multiple independent Subject Qualification Tracks, and every new Subject requires its own Track, Subject Assessment, and representative Mock.
122. Person-wide identity, integrity, safety, or conduct blockers may affect all Tracks.
123. One failed Subject Track does not automatically invalidate an unrelated passed Track.
124. Support screens completeness but never makes academic Qualification decisions.
125. An Applicant Development Course and Classroom create no Student fee, Lesson Credit, Tutor compensation, or commercial Tutor relationship.
126. Applicant Membership grants no access to real Students or customer Classrooms.
127. One Applicant Mentor must be qualified for every simultaneously active Track, and the Applicant is never split across concurrent Applicant Mentors.
128. The Applicant Mentor becomes Supervising Mentor unless an authorized handoff completes before activation.
129. A Quality Assistant different from the Applicant Mentor and Mock grader makes the final Qualification and activation decision without replacing Subject-qualified academic review.
130. A Tutor Qualification identifies canonical Subject, Subtopic, Content, evidence, effective period, review deadline, and state.
131. A Qualification Assessment pins an immutable Version and Blueprint.
132. Passing requires 80% overall, 70% in each required section, all critical gates, complete manual review, and no unresolved integrity event.
133. A failed first Assessment permits one retry after at least 14 days of remediation.
134. A second Assessment failure closes the Track for at least 90 days.
135. Preparation completion alone never creates a Qualification pass.
136. A Mock Session is not a paid Class, uses no ordinary customer Student or child, and creates no Lesson Credit or Tutor compensation event.
137. A Mock passes only with average 4.0, no dimension below 3, and at least 4 in accuracy and safeguarding.
138. A failed first Mock permits one retry after at least 14 days of remediation.
139. A second qualified Mentor reviews an appealed or near-threshold Mock result.
140. External credentials supplement but never replace Kelp Subject Assessment and Mock evidence.
141. Qualification approval may be narrower than the requested taxonomy scope.
142. Tutor activation requires at least one approved Qualification and non-empty Operationally Enabled Scope.
143. Tutor Role Assignment, Supervisory Relationship, Operationally Enabled Scope, and activation audit become effective atomically.
144. Every active Kelp Tutor has exactly one different active Supervising Mentor.
145. A Kelp Tutor teaches only within the Tutor-Mentor Qualification intersection.
146. Approved Qualifications outside the current Mentor's scope remain operationally inactive.
147. A Tutor cannot be split among Mentors to activate different Subjects.
148. Every newly activated Kelp Tutor enters the approved probation process.
149. Fewer than eight completed Classes at 90 days cannot silently end probation, and every Subject not represented during person-wide probation receives a later four-Class scope checkpoint.
150. Every Tutor Qualification receives a 24-month review deadline.
151. A timely complete renewal delayed only by Kelp may remain `renewal_pending` for at most 60 days unless risk requires restriction.
152. Expired, suspended, rejected, or disqualified scope does not authorize teaching.
153. Qualification loss invokes explicit Phase 6 continuity for affected active Courses.
154. An active Tutor with no Operationally Enabled Scope has no teaching authority.
155. Suspension removes future authority without erasing history.
156. Disqualification never rewrites prior Classes, Assignments, grades, reports, authorship, or evidence.
157. One appeal is permitted within 14 days and does not automatically restore authority.
158. A permanent reapplication prohibition requires a second authorized governance review.
159. Independent Tutor self-declared scope is not a Kelp Tutor Qualification.
160. A Kelp-generated Independent Tutor Report Card is not by itself Kelp endorsement of the Tutor.
161. Kelp Tutor and Independent Tutor authority follow the Course service model, not Workspace Context.
162. Evidence, decisions, effective periods, and access history are append-only.
163. Browser role values, `viewerRole`, routes, or identifiers never grant Applicant, grader, Mentor, or Tutor authority.
164. Failed audit persistence prevents activation, suspension, disqualification, appeal, or Role change from being successful.
165. A platform subscription is not a Course, Classroom, Tutor Assignment, Membership, Lesson Schedule, Class, or Credit Lot.
166. Student platform access is Account-scoped; recurring, on-demand, and access-only arrangements are Course-scoped.
167. One Student may use different service paths in different Courses at the same time.
168. One Course has at most one active Course Service Arrangement at an effective instant.
169. A Course-path change never changes another Course automatically.
170. Money, Lesson Credits, Tutor accruals, and Independent Tutor private payments remain separate ledgers.
171. The USD 5 Student platform fee never consumes Lesson Credits.
172. The USD 10 Independent Tutor platform fee never creates Kelp Tutor status or Student Lesson Credits.
173. Students served only through an Independent Tutor Course owe no Kelp Student platform fee for that service.
174. Every accepted service period pins an immutable Service Plan Version.
175. A later catalog or price edit never rewrites an accepted prior Version.
176. A browser payment callback never grants access, credits, or booking authority.
177. A recurring arrangement creates no fixed monthly Lesson Credit deposit under the approved model.
178. A Projected Meeting creates no payment, credit commitment, charge, or Tutor compensation.
179. An Automatic Top-up buys only the exact recurring Class shortfall.
180. Existing eligible Lesson Credits fund a Class before an Automatic Top-up.
181. A larger credit package requires a separate manual purchase.
182. Automatic Top-up authority is server-validated against Payer consent and the remaining per-Student limit.
183. A Student cannot raise a Guardian-funded limit.
184. One failed Automatic Top-up and one failed retry create no Class booking.
185. A failed top-up cannot produce a negative Student balance.
186. Lesson Credits survive Tutor and Course service-path changes subject to their own expiration and restriction rules.
187. Lesson Credits never fund an Independent Tutor Class.
188. Access only grants no Class-booking authority.
189. On-demand tutoring creates no recurring Lesson Schedule.
190. Recurring tutoring requires a valid Lesson Schedule and at least one Theory Slot.
191. A plan transition is effective-dated and append-only.
192. A plan transition never rewrites an Ongoing or completed Class.
193. Projected Meetings stop materializing after the effective end of recurring service.
194. Held Classes remain governed by the cancellation and entitlement contract unless a separately authorized protective freeze applies.
195. Three consecutive account-wide Student no-shows trigger the two-month Subscription Freeze.
196. An attended Class resets the no-show streak before the freeze trigger.
197. The no-show freeze pauses recurring billing, Automatic Top-ups, and Credit Lot expiration clocks.
198. The no-show freeze preserves Course and platform-tool access.
199. No unresolved freeze may silently continue recurring service beyond two months.
200. The unresolved two-month outcome becomes the canonical on-demand path.
201. Freeze reactivation never recreates missed Classes retroactively.
202. Independent Tutor Classes remain externally billed regardless of educational scheduling pattern.
203. Independent Tutor delinquency never creates Kelp Lesson Credit, commission, accrual, or payout entries.
204. Ending an Independent Tutor subscription never deletes Course, Classroom, Class, report, or authorship history.
205. An active Course never converts in place between Kelp-managed and Independent Tutor service models.
206. A Group Queue Entry is not a Course, Classroom, Membership, Tutor Assignment, Class booking, or payment charge.
207. Group Queue matching reveals no candidate identity to another candidate.
208. Academic and schedule compatibility precede queue age.
209. Queue age breaks ties only among mutually compatible eligible entries.
210. One Student learning need has at most one active Cohort Reservation.
211. Accepting one Group Course Offer releases competing offers for the same learning need.
212. A Group Course activates only after its minimum cohort size and every academic, staffing, consent, schedule, and commercial condition pass.
213. A Group Course never activates above its maximum cohort size.
214. Group Course activation creates one Course, one Classroom, one cohort Membership set, and one Tutor Assignment atomically.
215. Group Course underfill before activation creates no Class charge.
216. Kelp-caused Group Course formation failure preserves the Student's eligible queue priority.
217. A Group Course Offering pins price, cohort, schedule, taxonomy, and terms Versions.
218. Payer authority never creates educational access.
219. Guardian payment authority remains scoped to the linked child and funding purpose.
220. Revoking future payer consent does not erase an already accepted lawful obligation.
221. Workspace Context never changes service model, plan authority, or Payer identity.
222. Browser state, route, role label, payment-method token, or resource identifier never grants paid capability.
223. Service, payer, queue, offer, reservation, and transition history is append-only.
224. Failed required audit persistence prevents service activation, transition, top-up, freeze, queue conversion, or override from being successful.
225. Lesson Credits are integer booking units and are not money.
226. A Student has at most one Student Credit Account.
227. The Student Credit Account is Account-wide and not Tutor-, Course-, Classroom-, Guardian-, or payment-method-specific.
228. The authoritative credit quantity is derived from append-only ledger records.
229. A mutable Profile balance is never financial authority.
230. Corrections use compensating entries and never edit or delete prior entries.
231. Every Credit Lot has one Student beneficiary, source, original integer quantity, effective instant, and expiration policy.
232. Every purchased Lot pins its original Payer, currency, money amount, and price Version.
233. Current catalog price never reconstructs a historical Lot's money basis.
234. A payment callback alone never creates spendable credits.
235. Payment or grant authority and Lot issuance succeed atomically or enter reconciliation.
236. A duplicate webhook or retry never creates a duplicate Lot.
237. The full individual duration mapping remains 10, 20, and 30 credits.
238. The Student no-show mapping remains 5, 10, and 15 credits.
239. Platform fees never consume Lesson Credits.
240. Independent Tutor Classes never consume Lesson Credits.
241. Group Course credit mapping is not inferred from individual pricing.
242. Recurring exact-shortfall Lots use the pinned recurring price Version.
243. A recurring Automatic Top-up purchases only the exact positive shortfall.
244. Existing eligible credits fund the recurring commitment before an Automatic Top-up.
245. A larger package requires a separate manual purchase.
246. A Standalone exact-shortfall purchase requires active Payer confirmation.
247. A failed payment creates no Lot, Credit Commitment, or Class booking.
248. Promotional Lots expire after one calendar month.
249. Recurring-funded Lots expire after 12 calendar months.
250. Ordinary manual packages use 40 credits per calendar month of lifetime, capped at 480 credits and 12 months.
251. Existing Lot expiration instants do not change when the Student later changes timezone.
252. A Lot expired before a freeze or Case suspension never revives.
253. Promotional Lots allocate before purchased Lots.
254. Within each source priority, the earliest expiration allocates first.
255. Stable Lot ID breaks otherwise equal allocation ties.
256. Only Lots valid at the Class scheduled start instant may support that Class.
257. A displayed raw balance never proves spendable capacity.
258. One Credit Lot quantity cannot fund two active commitments.
259. A Kelp-billed Class requires a fully allocated Credit Commitment before booking succeeds.
260. A Credit Commitment reduces capacity but is not a final Charge.
261. A Projected Meeting creates no Credit Commitment, Hold, or Charge.
262. A Credit Hold begins at the six-hour Hold Window and is not a final Charge.
263. Held quantity cannot be transferred, refunded, expired, or used elsewhere before settlement.
264. A validly held Lot remains chargeable for its Class even if settlement occurs after Lot expiration.
265. A Credit Charge requires one authoritative Class financial outcome.
266. The credit ledger never infers attendance from browser state.
267. A completed or validly ended Class posts the full approved quantity.
268. A Student no-show posts the approved half quantity and releases the remainder.
269. A Tutor no-show posts no Student Charge and releases the commitment.
270. An approved Kelp outage posts no automatic Student Charge.
271. A partial Charge consumes pinned allocations in their original order.
272. Any uncharged remainder returns to its originating Lot.
273. Released quantity whose Lot already expired becomes expired immediately unless suspended.
274. Settlement pending preserves the Hold and posts no final Charge until resolution.
275. One Class Hold cannot settle twice.
276. A later correction uses a Credit Reversal and never deletes the original Charge.
277. Outside the Hold Window, a reschedule or duration change revalidates credit eligibility.
278. One atomic successor transition prevents old and new Commitments from overlapping.
279. Inside the Hold Window, a duration change cannot bypass Phase 4 by reallocating credits.
280. Expiration appends the exact eligible expired quantity once and never deletes the Lot.
281. Expired credits remain historical and are not spendable, transferable, or automatically refundable.
282. The no-show Subscription Freeze preserves remaining Lot lifetime for at most two months.
283. Freeze resume cannot extend the same remaining lifetime twice.
284. Case-specific Expiration Suspension requires scoped approval, an owner, reason, and review date.
285. Opening a generic Support Case never suspends expiration by itself.
286. A transfer moves only unused, unexpired, unrestricted purchased credits.
287. Transfer never resets expiration or replaces original Payer and money attribution.
288. Transfer out and transfer in succeed atomically or not at all.
289. Promotional credits are not ordinarily transferable or cash-refundable.
290. A refund uses original purchase allocation rather than current catalog price.
291. A money refund and credit removal remain separate but reconciled records.
292. No ledger transition may create a negative Student credit balance.
293. A post-spend chargeback creates an external financial issue rather than negative credits.
294. Tutors see commercial readiness, not full Student balance or Payer details.
295. Browser state, route, token, cached balance, or payment-method reference never grants credits or booking authority.
296. Failed required audit persistence prevents acquisition, allocation, Hold, Charge, release, expiration, transfer, refund, adjustment, or reconciliation resolution from being successful.
297. A Class Session belongs to one persisted Class and current Class revision.
298. A Projected Meeting creates no Class Session attendance outcome.
299. Loading a route, prejoin page, or media frame is not attendance.
300. Session Admission requires server-authoritative identity, relationship, Class, and role validation.
301. A browser role value never creates Session Admission.
302. Guardian, observer, Mentor, Quality Assistant, and Support presence never substitutes for Student or Tutor presence.
303. Operational Class state and Authoritative Class Outcome are separate.
304. The visible `ongoing` state begins only after valid Joint Attendance begins.
305. Ending the operational session does not invent a final financial outcome.
306. Presence Evidence is append-only and server-timestamped.
307. One participant's overlapping tabs or devices never multiply attendance.
308. Presence Intervals use the union of valid evidence for one participant.
309. Joint Attendance uses the intersection of Student and assigned Tutor Presence Intervals.
310. Separate valid Joint Attendance Intervals accumulate.
311. Chat, whiteboard, file, or form activity alone never proves presence.
312. Presence before scheduled start does not accumulate paid Joint Attendance.
313. Prejoin opens 15 minutes before scheduled start.
314. The no-show checkpoint remains 10 minutes after scheduled start.
315. A permitted Class start occurs no later than the no-show checkpoint.
316. The expected end equals first valid Joint Attendance plus scheduled duration.
317. A permitted late start does not reduce scheduled duration.
318. A start after the checkpoint cannot silently revive the ordinary Class.
319. Courtesy time after the expected end creates no extra Student charge or Tutor compensation.
320. The Completion Threshold remains 50% of scheduled duration.
321. The thresholds remain 15, 30, and 45 joint minutes for 30-, 60-, and 90-minute Classes.
322. Reaching the threshold makes the Class eligible for a full outcome.
323. Reaching the threshold does not immediately end the operational session.
324. Joint Attendance above scheduled duration creates no additional commercial entitlement by itself.
325. Student no-show requires Tutor availability through the checkpoint and Student absence.
326. Tutor no-show requires Student availability through the checkpoint and Tutor absence.
327. Once Joint Attendance begins, the Class cannot later become an ordinary no-show.
328. Student no-show produces the settled half-credit quantity.
329. Tutor no-show produces zero Student Charge and no Tutor compensation.
330. Mutual absence is not a Student no-show.
331. Mutual absence produces no automatic Student charge or Tutor compensation.
332. Student early departure after Joint Attendance begins is distinct from Student no-show.
333. Student early departure produces the full scheduled credit quantity unless an approved incident changes it.
334. Tutor early departure below threshold enters review and creates no automatic final Charge.
335. Valid early completion below threshold requires separately attributed Student and Tutor confirmations.
336. Tutor confirmation alone cannot create valid early completion below threshold.
337. Early Completion Confirmations are due within 24 hours.
338. A contradictory early-completion report creates Settlement Pending.
339. One lost heartbeat or provider event never proves participant fault by itself.
340. A 90-second stale-evidence tolerance applies only when surrounding evidence supports continuity.
341. Confirmed Kelp outage preventing service produces a zero-charge outcome.
342. Confirmed Kelp outage creates no Tutor compensation and consumes no late-change entitlement.
343. A participant device or household-network failure is not automatically a Kelp outage.
344. Outside-Kelp activity creates no automatic Joint Attendance.
345. A qualifying exception report is due within seven days.
346. Settlement Pending lasts no longer than 14 days without a successor decision.
347. Settlement Pending preserves the Phase 10 Hold and posts no final Charge.
348. The same pending incident cannot settle twice.
349. Normal settlement becomes eligible after day 14 when no required blocking report exists and Kelp has not confirmed an outage.
350. One effective Authoritative Class Outcome Version exists at a time.
351. Every outcome references one reproducible Attendance Summary Version.
352. Phase 10 consumes the outcome and never reconstructs attendance.
353. Phase 11 never converts Lesson Credits into Tutor money.
354. A required Tutor Review is due within 24 hours.
355. A missing Tutor Review never keeps a Class Ongoing or changes valid attendance automatically.
356. The Tutor Review confirms rather than replaces the Class Subject taxonomy snapshot.
357. Participation uses whole-number scores from 0 through 5.
358. Normalized participation equals the raw score multiplied by 20.
359. Missing participation data is not automatically a zero grade.
360. The Student survey is optional and does not control attendance or settlement.
361. Conduct reports remain separate from attendance, Tutor Review, and Student survey records.
362. A final Kelp-managed Student no-show increments the Account-wide streak.
363. An attended final Kelp-managed outcome resets the Student no-show streak.
364. Tutor no-show, cancellation, outage, pending outcome, and Independent Tutor Class neither increment nor reset the Student streak.
365. The third consecutive Student no-show triggers the Phase 9 Subscription Freeze exactly once.
366. Student no-show never consumes the separate late-change entitlement.
367. Clean Completion is an explicit event and is not inferred later from UI state.
368. Only a completed or validly completed early 60- or 90-minute Theory Class with a valid Tutor post-Class record may supply the Phase 4 Qualifying Theory Class input.
369. A Problem-Solving-only Class never advances the curriculum Cursor.
370. Group Course attendance is participant-specific.
371. One Group Course Student's absence never assigns the same outcome to the cohort.
372. Group Course credit and revenue allocation remain deferred.
373. A Student, Tutor, Guardian, route, or workspace cannot directly rewrite Ongoing or taught Class status.
374. A Quality Assistant may investigate and approve incident results only within scope.
375. An Administrator posts any post-transition Class-status correction through an append-only successor Version.
376. A correction never deletes the original evidence, Attendance Summary, outcome, streak, or downstream financial history.
377. Duplicate evidence, retries, or webhooks never duplicate attendance, no-show, streak, or financial outcomes.
378. Failed required audit persistence prevents the admission, interval, checkpoint, outcome, incident, correction, streak, or Clean Completion transition from succeeding.
379. A timely Student admission request cannot become Student absence solely because the Tutor or Kelp failed to complete admission.
380. The participant relying on the other party's no-show remains validly available through the checkpoint unless trusted Kelp failure evidence excuses departure.
381. A Class Change Request is not an effective Class change.
382. Only an applied Class Change Event changes the current Class revision or cancellation state.
383. A pending, declined, withdrawn, expired, failed, or superseded request leaves the current valid Class in force.
384. The server is authoritative for request, decision, and commit time.
385. Browser time and calendar paint never determine the Hold Window.
386. The Hold Window begins six hours before the current authoritative scheduled start.
387. A complete request is not made late solely by Kelp processing delay when its captured state remains valid.
388. No ordinary Class change becomes effective after Joint Attendance begins.
389. Outside the Hold Window, Student cancellation and rescheduling have no numerical frequency limit.
390. Every Student change still requires ordinary Course, Assignment, service, Availability, buffer, conflict, and credit validation.
391. An ordinary Student cancellation outside the Hold Window produces zero Student charge.
392. An ordinary Student cancellation uses no late-change entitlement.
393. An ordinary Student reschedule uses no late-change entitlement.
394. A failed reschedule leaves the original Class and allocation active.
395. Inside the Hold Window, Class duration cannot change.
396. Inside the Hold Window, a Student cancellation or reschedule requires an available entitlement.
397. A Student begins with at most one available entitlement per Classroom.
398. Entitlements never accumulate beyond one.
399. One successful late cancellation or reschedule consumes exactly one entitlement.
400. Failed, declined, withdrawn, expired, superseded, or support-only requests consume no entitlement.
401. Entitlement use, Class change, cancellation outcome, and financial transition succeed atomically or not at all.
402. An unavailable entitlement blocks the ordinary late-change path.
403. Opening a Support Case does not cancel a Class or grant an entitlement.
404. Student absence is not an implied cancellation request.
405. Student no-show never consumes the late-change entitlement.
406. After use, recovery begins at zero in the same Classroom.
407. Only a later Clean Completion Event in that Classroom increments recovery.
408. One Clean Completion Event increments recovery no more than once.
409. Eight consecutive qualifying events restore one entitlement.
410. Clean Completions beyond eight create no accumulated entitlement.
411. A final Student no-show while recovering resets recovery to zero without consuming another entitlement.
412. Unexcused Student early departure while recovering resets recovery to zero.
413. An approved exceptional Student late change while recovering resets progress to zero.
414. Tutor-caused disruption neither consumes nor resets Student entitlement recovery.
415. Kelp failure, approved Time Off, holiday action, lifecycle cancellation, and protective cancellation are recovery-neutral.
416. Ordinary Student changes outside the Hold Window are recovery-neutral.
417. Corrections append compensating recovery events rather than rewriting prior events.
418. Cancelling one Class never cancels the recurring series.
419. One-off rescheduling never changes the generating Recurring Slot.
420. An Extra Class never becomes ordinary recurrence automatically.
421. A Recurring Schedule move affects only eligible future ordinary Classes.
422. A bulk move cannot silently move a Held Class.
423. Held occurrences require individual valid outcomes or remain unchanged.
424. Extra and individually rescheduled Classes remain excluded from a bulk move unless explicitly selected.
425. Historical, Ongoing, and completed Classes never move.
426. Recurrence changes never edit Course Schedule deadlines automatically.
427. Every reschedule preserves one logical Class ID and append-only revisions.
428. Every Tutor-initiated time or duration change requires Student approval.
429. Student silence is never approval of a Tutor proposal.
430. The original Class remains authoritative while a Tutor proposal is pending.
431. A rejected Tutor proposal is not an incident if the Tutor remains ready for the original Class.
432. Tutor cancellation requires a structured reason.
433. Tutor cancellation produces zero Student charge and full allocation release.
434. Tutor cancellation never consumes or resets the Student entitlement.
435. Tutor cancellation never marks the Student absent.
436. A qualifying Tutor incident applies only to Kelp-managed service.
437. A qualifying Tutor incident requires a Tutor-caused cancellation or forced reschedule inside the Hold Window.
438. An ordinary Tutor proposal outside the Hold Window is not a short-notice incident.
439. Approved Time Off, holiday, Kelp failure, lifecycle, emergency, and safety exclusions create no Tutor incident.
440. A Tutor cannot self-approve an emergency exclusion merely by choosing a reason label.
441. Tutor reliability is Account-wide across the Tutor's Kelp-managed Classes.
442. Tutor reliability uses a rolling span rather than fixed blocks of 24.
443. The rolling denominator uses Phase 11 Clean Completion Events.
444. One Group Class creates at most one Tutor reliability incident regardless of Student count.
445. The first active-span incident creates no formal warning.
446. The second active-span incident creates the first formal warning.
447. The third active-span incident creates the second warning and opens Quality Assistant penalty review.
448. Later active-span incidents create escalated review events.
449. Phase 12 creates no automatic monetary, qualification, suspension, or termination sanction.
450. A Tutor incident ages out of the active span only after twenty-four later Clean Completion Events.
451. Aging out never deletes the incident, warning, or review history.
452. A reliability correction appends a compensating event and recomputes the active span.
453. Planned Time Off is not a Student entitlement or Tutor short-notice allowance.
454. Planned disruption limits describe one request span, not a recurring cancellation quota.
455. A planned disruption never silently cancels an accepted Class.
456. Requests affecting dates within six months require Mentor review.
457. A wider or exceptional planned disruption requires Mentor review.
458. A preference change never silently cancels an accepted holiday Class.
459. Both parties may explicitly agree to work on an observed holiday.
460. A protective cancellation creates zero Student charge, zero Tutor compensation, no entitlement use, and no reliability incident.
461. Course termination and outgoing-Tutor reassignment cancellations remain protective.
462. Eligible service transition and confirmed Kelp outage cancellations remain protective.
463. A generic plan change inside the Hold Window is not protective without explicit authority.
464. Every zero-charge cancellation releases the applicable Commitment or Hold exactly once.
465. Release returns quantity to its originating Lots.
466. Release never resets expiration or changes Payer attribution.
467. A reschedule leaves at most one active Commitment for the logical Class.
468. Old release and successor Commitment activation are atomic.
469. A failed automatic payment never consumes entitlement or destroys the original Class.
470. A Class Change Event never creates Tutor compensation by itself.
471. Guardian payment authority never grants schedule authority.
472. A Guardian cannot consume a Student entitlement through the ordinary workflow.
473. One Group Course Student cannot reschedule the shared Class for the cohort.
474. Group per-member late-cancellation commercial effects remain deferred.
475. Independent Tutor Classes create no Kelp entitlement or Tutor reliability event.
476. Independent Tutor private cancellation fees remain outside Kelp.
477. Private reasons remain permissioned and are not exposed in shared calendars or Class threads.
478. Two concurrent requests cannot consume one entitlement twice.
479. One old allocation cannot be released twice.
480. One incident cannot create duplicate warnings through retries.
481. Corrections never delete prior requests, Class revisions, entitlement events, incidents, warnings, or ledger records.
482. Failed required audit persistence prevents the Class change from succeeding.
483. Lesson Credits are not Tutor money.
484. A Student Credit Charge is not a Tutor Accrual Entry.
485. A Class outcome is not a Tutor payout.
486. A provider balance is not the Tutor Compensation Ledger.
487. Kelp Tutor compensation and Independent Tutor private payments remain separate.
488. One Kelp Tutor and currency have one append-only Compensation Ledger.
489. A displayed earnings total is derived rather than edited directly.
490. Every compensated Class pins one Compensation Basis Snapshot.
491. The snapshot pins service path, duration, currency, gross value, Tutor, and policy Versions.
492. A later catalog price change never rewrites a historical Basis Snapshot.
493. A valid duration change creates a successor Basis Snapshot.
494. Compensation never uses a timeless universal credit-to-money conversion.
495. Recurring 30-, 60-, and 90-minute gross values remain USD 20, USD 40, and USD 60 for the current Version.
496. Standalone 30-, 60-, and 90-minute gross values remain USD 25, USD 50, and USD 75 for the current Version.
497. The normal Tutor gross share is 75% of earned compensation basis.
498. Normal Kelp commission is the remaining 25%.
499. Ordinary processor fees do not silently reduce the 75% Tutor gross share.
500. Tutor-specific taxes and lawful withholding never rewrite gross compensation.
501. Promotional credits do not reduce Tutor compensation.
502. Discounted or mixed Credit Lots do not silently change Class compensation basis.
503. Credit transfers do not create a new Tutor pay rate.
504. Student Lot, promotion, and Payer details remain hidden from the Tutor unless separately authorized.
505. A Student no-show uses 50% of pinned gross lesson value as earned basis.
506. The Tutor share for a Student no-show is 75% of that no-show basis.
507. A no-show never pays 75% of the unprovided full gross value.
508. Compensation calculations preserve at least four decimal USD places internally.
509. Per-item cent rounding is forbidden when it would lose exact fractional-cent value.
510. One Payout Batch aggregates exact items before currency-minor-unit rounding.
511. Final transfer rounding uses half-even.
512. Every rounding adjustment is explicit and auditable.
513. A completed outcome normally supplies 100% earned basis.
514. Valid early completion normally supplies 100% earned basis.
515. Student early departure normally supplies 100% earned basis unless corrected.
516. Tutor no-show supplies zero earned basis.
517. Mutual absence supplies zero earned basis.
518. Confirmed Kelp outage preventing service supplies zero earned basis.
519. Valid zero-charge and protective cancellation supply zero earned basis.
520. Settlement Pending creates no payout eligibility.
521. Tutor early departure creates no automatic final accrual before review.
522. Confirmed outside-Kelp delivery may supply full basis only through the Phase 11 outcome.
523. An authorized reduced outcome supplies an explicit basis.
524. Phase 13 consumes outcomes and never reconstructs attendance or cancellation authority.
525. The compensation recipient comes from the effective Class teaching Assignment and Session history.
526. Reassignment after a Class never redirects that Class's accrual.
527. A Mentor earns lesson compensation only when acting through a valid supervised Kelp Tutor Assignment.
528. Observer, Guardian, Supervising Mentor, Quality Assistant, and Support presence creates no lesson compensation.
529. A Projected Meeting creates no Tutor accrual.
530. A pending Lesson Request or Credit Commitment creates no Tutor accrual.
531. Courtesy time and unauthorized extension create no additional compensation.
532. Orientation, Applicant training, Mock Sessions, and access-only communication create no ordinary Class compensation.
533. One effective compensation-bearing outcome Version creates at most one accrual.
534. Accrual creation is idempotent.
535. Every accrual links its exact Class outcome and Basis Snapshot.
536. A missing or conflicting final outcome blocks accrual finality.
537. The settlement hold ends 14 times 24 hours after the authoritative operational Class end.
538. Eligibility occurs no earlier than both hold end and final-outcome effectiveness.
539. Retry never shortens or restarts the settlement hold.
540. A Tutor may see held earnings without controlling them as wallet money.
541. Payout-account unreadiness delays transfer but does not erase earned compensation.
542. Loss of active teaching authority does not forfeit valid prior earnings.
543. An active legal or reconciliation block is explicit and scoped.
544. The ordinary Payout Batch locks at 00:00 on the 10th in the configured Kelp payout timezone.
545. Only items eligible before Batch lock enter that ordinary Batch.
546. Later eligibility rolls to the next regular Batch.
547. A non-banking 10th moves initiation to the next supported banking day without changing Batch identity.
548. Provider transit time does not change the contractual Batch date.
549. Kelp imposes no initial minimum payout threshold.
550. A Payout Batch can never be negative.
551. Different currencies are never netted together.
552. One eligible item belongs to at most one active Batch.
553. Exact items aggregate before recovery and final rounding.
554. A locked Batch pins one Tutor, currency, and payout destination Version.
555. A browser onboarding completion never proves payout readiness by itself.
556. Raw bank credentials are never stored in the Kelp application database.
557. A destination change after Batch lock never redirects the Batch silently.
558. One Batch can be paid at most once.
559. Provider events are reconciled evidence rather than unilateral internal authority.
560. Duplicate, unknown, late, or contradictory provider events never create a second transfer.
561. A failed or returned payout never erases the underlying payable amount.
562. A payout retry uses an explicit linked attempt.
563. A late provider success cannot cause duplicate repayment.
564. Every locked Batch creates an immutable Tutor statement Version.
565. Recovery Withholding appears separately from ordinary commission.
566. A statement correction creates a successor Version.
567. A goodwill refund alone never rewrites Class outcome or Tutor accrual.
568. A pre-payout outcome correction uses a Compensation Adjustment.
569. A submitted transfer is not silently edited to accommodate a refund.
570. An ordinary post-payout goodwill refund creates no Tutor debt.
571. A duplicate or erroneous Tutor payment requires a separately reviewed Compensation Correction.
572. A post-payout outcome correction never edits the paid item.
573. A positive post-payout correction enters a later eligible payout.
574. A negative post-payout correction is not automatically a Dispute Loss.
575. Dispute Loss equals disputed principal plus applicable fees minus recovered funds.
576. Kelp and the Kelp Tutor each bear 50% of an approved Dispute Loss.
577. Kelp covers the provider-facing loss before Tutor recovery.
578. Disputed multi-purpose purchases require traceable allocation to Classes and Tutors.
579. A Tutor is not assigned unrelated disputed Student value.
580. Zero-basis promotional value never manufactures Tutor dispute debt.
581. Recovery Withholding is at most 25% of future earned compensation basis.
582. Full Recovery Withholding temporarily reduces the Tutor cash share from 75% to 50% of earned basis.
583. A future Student no-show applies recovery to its reduced half basis.
584. Recovery never exceeds the remaining Tutor Recovery Balance.
585. Recovery never makes an item or Batch negative.
586. Recovery stops when the exact balance reaches zero.
587. Recovery Withholding is not Kelp commission.
588. Independent Tutor private earnings are never subject to Kelp Tutor recovery.
589. A Tutor receives scoped notice and a review route for Dispute Loss allocation.
590. Ending Kelp Tutor status never erases earned compensation or an approved recovery receivable.
591. A remaining departure balance enters manual account-receivable review.
592. Kelp never automatically charges an unrelated Tutor payment method for recovery.
593. Independent Tutor Classes create no Kelp compensation or payout records.
594. The Independent Tutor platform fee is never netted against Kelp Tutor earnings silently.
595. Group Course compensation remains blocked until its revenue-allocation contract is approved.
596. Authored Product royalties remain separate from lesson compensation.
597. Students and Guardians cannot see Tutor payout, recovery, tax, or bank details.
598. Mentors and Quality Assistants cannot see Tutor bank credentials through supervisory access.
599. A Tutor cannot create, approve, or mark their own accrual paid.
600. Financial corrections require scoped authority and separation of duties.
601. Two accruals cannot exist for one effective outcome Version.
602. One accrual cannot enter two active Batches.
603. One recovery event cannot withhold the same amount twice.
604. Corrections append successor entries and never delete financial history.
605. Failed required audit persistence prevents the transition from succeeding.
606. Database, browser, provider, Batch, transfer, and accounting state mismatches create reconciliation rather than guessed success.

## 15. Explicitly deferred decisions

These questions are intentionally not answered by Phase 1 and must not be guessed during implementation:

- the complete Authored Product ownership, license, royalty-base, derivative-work, and departure agreement;
- whether the 2% royalty is based on gross revenue, net revenue, receipts after processor fees, or another allocation formula;
- Course Template catalog review, reuse permissions, forking, and independent/Kelp Tutor revenue attribution;
- the publication and review standard for official reports produced by Independent Tutors;
- jurisdiction-specific verification of Guardian authority, custody disputes, adulthood thresholds, and compelled disclosure;
- exact retention and deletion periods after jurisdiction-specific legal and accounting review;
- jurisdiction-specific taxes, invoice requirements, refund deductions, and mandatory cancellation or price-change notices;
- final Stripe Connect account and charge configuration;
- provider-specific reserves beyond the approved 14-day hold, jurisdiction-specific chargeback edge cases, and legal enforcement limits beyond the approved recovery cap;
- exact monetary, qualification, suspension, termination, or contractual sanctions applied after a Phase 12 Tutor penalty-review trigger;
- exact initial Group Course Offering minimum and maximum cohort sizes, lesson prices, and Lesson Credit mapping;
- exact voluntary service-pause limits and notice periods;
- holiday data provider and jurisdictional holiday rules;
- notification consent, quiet hours, required operational messages, delivery fallback, and minor-account controls;
- category-level grading rounding and missing-work rules;
- exact taxonomy catalog contents and governance;
- exact Tutor Application form questions and jurisdiction-specific identity, background, safeguarding, and eligibility providers;
- exact Qualification Assessment Question Bank content and remote-proctoring implementation;
- Mock Session observation, recording-consent, and retention mechanics;
- Kelp Tutor compensation during the Probationary Tutor Period.

## 16. Phase 2 contract

[Phase 2: Mentor-led Student intake](02-mentor-led-student-intake.md) defines the approved workflow from Intake Request through Assessment, goals review, Orientation, Course design, Tutor matching, Initial Schedule Selection, and atomic Course activation.

Phase 2 preserves the meanings of Course, Classroom, Class, Tutor Assignment, and Assessment defined here. It also establishes the single-Supervising-Mentor rule for Kelp Tutors.

## 17. Phase 7 contract

[Phase 7: Roles, Guardians, Mentors, Quality Assistants, and supervisory hierarchy](07-roles-guardians-mentors-quality-assistants-and-supervisory-hierarchy.md) defines the approved cumulative Role Assignment model, Guardian visibility and lifecycle, Kelp supervisory chain, Quality Assistant scope, Independent Tutor separation, Role Suspension, and Administrator Break-glass Access.

Phase 7 makes authority relationship-scoped and server-authoritative. A Workspace Context, browser value, route, or role label never creates access.

## 18. Phase 8 contract

[Phase 8: Tutor application, qualification, and approval lifecycle](08-tutor-application-qualification-and-approval-lifecycle.md) defines the approved Tutor Application and Subject Qualification Track lifecycle, Applicant learning environment, Assessment and Mock evidence, activation chain, Operationally Enabled Scope, probation, renewal, suspension, appeal, disqualification, and Independent Tutor verification boundaries.

Phase 8 consumes the Phase 7 Role Assignment and supervisory model. Qualification, activation, restriction, and access decisions are server-authoritative and append-only; a credential, Profile label, Workspace Context, route, or browser role value never grants teaching authority.

## 19. Phase 9 contract

[Phase 9: Service plans, subscriptions, transitions, and Group Course entry](09-service-plans-subscriptions-transitions-and-group-course-entry.md) defines the approved Account-scoped Student and Independent Tutor platform subscriptions, Course-scoped service arrangements, immutable plan and price Versions, Payer Authorization, exact-shortfall recurring funding, service transitions, no-show freeze outcome, Independent Tutor delinquency, and private Group Course queue, offer, reservation, and activation lifecycle.

Phase 9 makes service authority server-authoritative and effective-dated. A payment callback, Workspace Context, route, browser state, or payment-method token never creates platform access, educational authority, Lesson Credits, or a Class booking.

## 20. Phase 10 contract

[Phase 10: Lesson Credit ledger, lots, commitments, holds, and expiration](10-lesson-credit-ledger-lots-commitments-holds-and-expiration.md) defines the approved Student Credit Account, append-only Credit Ledger Entries, immutable Credit Lots, deterministic allocations, spendable capacity, Class Commitments, six-hour Holds, outcome-based Charges, releases, reversals, expiration, suspensions, transfers, refund allocations, restrictions, administrative adjustments, and reconciliation lifecycle.

Phase 10 makes Lesson Credit authority server-derived, Lot-aware, and auditable. A displayed balance, browser callback, route, cached token, payment-method reference, or payment success detached from Lot issuance never creates spendable credits or Class-booking authority.

## 21. Phase 11 contract

[Phase 11: Class attendance, outcomes, no-shows, and incidents](11-class-attendance-outcomes-no-shows-and-incidents.md) defines the approved Class Session, Session Admission, Presence Evidence, normalized intervals, Joint Attendance, Operational Class State, Attendance Summary, Authoritative Class Outcome, no-show, early-departure, outage, Settlement Pending, post-Class record, streak, Clean Completion, Group Course attendance, review, and correction lifecycles.

Phase 11 makes attendance server-authoritative, evidence-backed, versioned, and distinct from live UI state. A route, prejoin page, media-provider event, browser timer, form submission, workspace, or role label never manufactures presence, completion, no-show, settlement, or correction authority.

## 22. Phase 12 contract

[Phase 12: Class cancellation, rescheduling, entitlements, and Tutor reliability](12-class-cancellation-rescheduling-entitlements-and-tutor-reliability.md) defines the approved Class Change Request and Event lifecycle, timing snapshots, ordinary and entitled Student changes, Classroom-scoped recovery, Tutor proposals and cancellations, rolling Tutor reliability warnings, planned-disruption boundary, protective cancellations, and Phase 10 financial outcomes.

Phase 12 makes Class changes server-authoritative, atomic, append-only, and separate from requests, UI state, payment identity, and private commercial agreements. A drag action, calendar display, browser clock, message, payer role, proposal, or Support Case never cancels, reschedules, funds, releases, or corrects a Class by itself.

## 23. Phase 13 contract

[Phase 13: Kelp Tutor compensation, settlement, payouts, and dispute recovery](13-kelp-tutor-compensation-settlement-payouts-and-dispute-recovery.md) defines the approved Tutor Compensation Basis Snapshot, Tutor Compensation Ledger, outcome-based accrual, 75/25 split, promotional and Student-no-show compensation, exact rounding, 14-day hold, payout eligibility, monthly Batch, transfer, statement, correction, Dispute Loss, Recovery Balance, and reconciliation lifecycles.

Phase 13 makes Kelp Tutor money server-authoritative, exact, append-only, and independent of Student credit source. A Lesson Credit quantity, displayed earnings total, browser state, provider balance, webhook, Workspace Context, private Independent Tutor payment, or current Tutor Assignment never manufactures, redirects, pays, or corrects Tutor compensation by itself.
