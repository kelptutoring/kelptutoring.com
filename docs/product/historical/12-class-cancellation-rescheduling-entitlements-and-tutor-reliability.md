# Phase 12: Class cancellation, rescheduling, entitlements, and Tutor reliability

**Contract phase:** 12 of 54  
**Status:** Final approved contract  
**Last updated:** 2026-07-20  
**Depends on:** canonical glossary and approved Phases 2-11  
**Applies to:** cancellation and rescheduling of persisted Classes, Student late-change entitlement, Tutor-initiated changes, Kelp Tutor short-notice reliability, planned-disruption boundaries, protective cancellations, authoritative cancellation outcomes, and the Phase 10 credit effects of those outcomes

## 1. Purpose

This contract defines how Kelp changes or cancels a persisted Scheduled Class without confusing a request with an effective change, a Student benefit with Tutor reliability, or a calendar edit with a financial outcome.

It separates six questions:

1. **Who requested the change and who must approve it?**
2. **Was the request outside or inside the six-hour Hold Window?**
3. **Does the Student have an available late-change entitlement?**
4. **Does a Tutor action create a short-notice reliability incident?**
5. **Is the action an ordinary change, planned Time Off, or a protective Kelp cancellation?**
6. **Which Class revision, Commitment, Hold, and notification events must change atomically?**

A drag action, calendar paint, message, Tutor proposal, or Support Case does not cancel or reschedule a Class. The current Class remains authoritative until the server commits an approved successor outcome.

## 2. Contract authority and approval record

The canonical glossary and approved Phases 2-11 remain authoritative. In particular, Phase 12 preserves:

- one stable logical Class identity with append-only scheduling revisions;
- 30-, 60-, and 90-minute supported durations;
- the prohibition on duration changes inside the six-hour Hold Window;
- Student authority to choose a valid time inside the assigned Tutor's published Availability without separate Tutor approval;
- Student approval for every Tutor-initiated time or duration change;
- one-off changes remaining separate from Recurring Schedule moves;
- Extra and individually rescheduled Classes remaining outside later bulk series moves;
- Phase 10 Lot ownership, Commitment, Hold, release, expiration, and atomic reallocation rules;
- Phase 11 attendance and outcome authority after a Class has begun;
- the Student no-show rule remaining separate from late-change entitlement use;
- Course termination, Tutor reassignment, and eligible service transitions producing zero-consequence cancellations;
- Guardian schedule visibility remaining read-only;
- Independent Tutor private pricing and payment remaining outside Kelp.

The product owner approved all twelve Phase 12 decisions on 2026-07-20. The rules, state models, matrices, and invariants in this document are authoritative. Items explicitly marked **Deferred** remain assigned to later contracts.

## 3. Settled baseline

The following product rules were settled before Phase 12 and are not reopened here:

1. Students may cancel or reschedule without a numerical limit before the Hold Window, subject to ordinary validation.
2. A Student begins with one late-change entitlement in each Classroom.
3. The entitlement is used only for a successful Student cancellation or reschedule inside the Hold Window.
4. Entitlements do not accumulate.
5. After use, the entitlement returns after eight consecutive Clean Completion Events in the same Classroom.
6. Tutor-initiated changes, Kelp technical failures, and Student no-shows do not consume the Student entitlement.
7. A Student no-show is a distinct attendance and conduct outcome.
8. A Kelp Tutor's short-notice reliability is Account-wide for that Tutor and uses a rolling 24-Class model rather than fixed blocks.
9. The first qualifying Tutor incident is allowed; a second incident in the active rolling window creates the first warning, and the second warning starts penalty review.
10. Planned Time Off is separate from short-notice reliability.
11. Tutor-initiated rescheduling and duration changes require Student approval.
12. A Tutor must provide a reason when declining or disrupting a Class.
13. Local holiday observance may block booking in advance, while a later holiday-setting change cannot silently cancel an accepted Class.
14. Student and Tutor changes never create negative Lesson Credit balances.

## 4. Scope

### Included

Phase 12 defines:

- Class Change Requests and effective Class Change Events;
- authoritative timing-band evaluation;
- Student ordinary cancellation and rescheduling outside the Hold Window;
- Student late cancellation and rescheduling inside the Hold Window;
- entitlement use, recovery, reset, neutrality, and correction;
- one-off versus recurring-series change behavior;
- Tutor proposals, Student decisions, Tutor cancellations, and required reasons;
- qualifying Tutor short-notice reliability incidents;
- the rolling 24-Clean-Completion classification and warning ladder;
- the boundary between Class changes, planned Time Off, holiday exceptions, and emergencies;
- system and protective cancellations that affect neither party negatively;
- Phase 10 Commitment, Hold, release, and successor-allocation effects;
- authority, privacy, concurrency, audit, correction, and Notification Events.

### Deferred

Phase 12 does not define:

- the full Tutor Availability editor, recurring Availability, date overrides, holiday provider, or Time Off approval lifecycle, handled in Phase 16;
- the full Lesson Request form, attachment, acceptance, expiry, and competing-request workflow, handled in Phase 18;
- Tutor money accrual, commission, payout, reserves, or recovery;
- the exact monetary, access, qualification, or contractual sanction chosen after a Tutor penalty-review trigger;
- consumer-law cancellation notices, statutory cooling-off rights, or jurisdiction-specific remedies;
- Group Course per-member cancellation prices, seat replacement, or cohort schedule voting;
- Independent Tutor private cancellation fees or payment disputes;
- Support Case queues and emergency-evidence adjudication details;
- Twilio, email, push, or quiet-hour delivery rules;
- database tables, RLS, APIs, jobs, or frontend interactions.

## 5. Phase 12 concepts

### Class Change Request

An append-only request to cancel, reschedule, or change the duration of one persisted Class. It identifies the Class and current revision, requester, requested result, reason category, optional private detail, authoritative request time, timing band, approval requirements, successor slot where applicable, and decision history.

A request is not an effective Class change.

### Class Change Event

The server-authored record that an approved Class cancellation, reschedule, or duration change became effective. It references the request, prior Class revision, successor revision or cancellation outcome, actors, approvals, policy classification, financial outcome, reliability result, entitlement result, and audit instant.

### Change timing snapshot

The server-created statement of scheduled start, current Class revision, authoritative request-received instant, and whether the request arrived outside or inside the Hold Window. It prevents browser clocks and backend processing delay from changing the applicable rule silently.

### Student ordinary change

A Student-authored cancellation or reschedule whose complete request reaches Kelp before the Hold Window. It uses no late-change entitlement.

### Student entitled late change

A successful Student-authored cancellation or reschedule inside the Hold Window that atomically consumes the available Classroom-scoped entitlement.

### Entitlement Use Event

The append-only event consuming the Student's one available entitlement for one Classroom. It identifies the effective Class Change Event and starts recovery progress at zero.

### Entitlement Recovery Progress

The derived count from zero through eight of consecutive qualifying Clean Completion Events in the same Classroom after the latest effective Entitlement Use Event. It is not a spendable balance and cannot exceed eight.

### Tutor change proposal

A Tutor-authored request asking the Student to accept a new Class time or supported duration. The original Class remains authoritative until the Student accepts and the successor transition succeeds.

### Tutor cancellation

A Tutor-authored declaration that the Tutor cannot provide the scheduled Class. It requires a structured reason and may take effect without Student approval because the unavailable service cannot be forced to occur. Its financial, reliability, and review consequences remain server-derived.

### Qualifying Tutor short-notice incident

An effective Tutor-authored cancellation, or a Tutor reschedule made necessary by Tutor unavailability, inside the Hold Window for a Kelp-managed Class, unless an approved exclusion applies.

### Tutor reliability span

For one qualifying Tutor incident, the moving interval beginning immediately after the Tutor's twenty-fourth most recent Clean Completion Event and ending at that incident. Prior qualifying incidents still inside that interval determine whether the new incident is the first, second, third, or later incident in the rolling window.

Each incident ages out only after twenty-four later Clean Completion Events for that Tutor. There are no fixed blocks of 24.

### Tutor reliability warning

An append-only operational warning created by the incident ladder. A warning remains in history after its originating incident ages out of the active rolling window.

### Planned disruption request

A Tutor request for a future absence or schedule disruption covering a bounded date range. It is not a short-notice reliability incident merely because it may later produce explicit Class changes. The Phase 16 Time Off contract owns its complete approval lifecycle.

### Protective cancellation

A zero-charge, zero-entitlement, zero-reliability cancellation authored by Kelp or an authorized reviewer to protect participants or maintain a previously approved lifecycle, such as Course termination, Tutor reassignment, service freeze, confirmed Kelp failure, or another approved safety action.

## 6. Separation of the three control systems

Phase 12 uses three independent systems:

| System | Scope | Purpose | Recovery basis |
| --- | --- | --- | --- |
| Student late-change entitlement | One Student and one Classroom | One successful cancellation or reschedule inside the Hold Window | Eight consecutive Clean Completion Events in that Classroom |
| Kelp Tutor short-notice reliability | One Kelp Tutor Account across Kelp-managed Classes | Detect repeated Tutor disruption inside the Hold Window | Rolling twenty-four Clean Completion Events for that Tutor |
| Planned Time Off and holidays | Tutor Availability and future date ranges | Prevent or approve future booking disruption | Later Availability and Time Off rules |

No implementation may reuse one counter or flag for all three. A Student entitlement cannot excuse a Tutor incident. A Tutor allowance cannot consume a Student benefit. Approved Time Off cannot be modeled as a fake entitlement use.

## 7. Request and effective-change lifecycle

The initial Class Change Request states are:

| State | Meaning |
| --- | --- |
| `submitted` | Complete request received with a server timing snapshot |
| `awaiting_student` | Tutor proposal requires the Student's decision |
| `validating` | Authority, slot, buffer, Course, service, credit, and concurrency checks are running |
| `approved_pending_commit` | Required approvals exist but the successor transaction has not committed |
| `applied` | One Class Change Event and all required successor records committed |
| `declined` | An authorized decision-maker declined the request |
| `withdrawn` | Requester withdrew it before application |
| `expired` | Its decision or commit deadline passed |
| `failed_validation` | The proposed result could not safely become effective |
| `superseded` | A later authorized request replaced it before application |

Only `applied` changes the Class. Every other state leaves the current valid Class revision and financial allocation in force unless a separate authorized event changes them.

## 8. Timing-band authority

The Hold Window begins exactly six hours before the current authoritative scheduled start.

The server records the timing band when it receives a complete idempotent command. Browser time and client labels are not authoritative.

If a complete request arrived outside the Hold Window but crossed the boundary only because Kelp was processing it, Kelp preserves the captured outside-Hold classification when:

- no user response or missing data caused the delay;
- the Class revision did not change;
- the proposed slot and funding remain valid;
- the operation commits through the same idempotent request.

If any relevant state changed, Kelp revalidates and returns an explicit result rather than silently treating the request as late.

No ordinary Class change may become effective after Joint Attendance begins. From that point Phase 11 attendance and incident rules control.

## 9. Student changes outside the Hold Window

Before the Hold Window, a Student may cancel or reschedule any number of eligible Classes. Numerical limits do not replace ordinary validation.

### Cancellation

A successful ordinary Student cancellation:

- creates a zero-charge valid cancellation outcome;
- releases the Phase 10 Commitment;
- uses no late-change entitlement;
- creates no Tutor reliability incident;
- preserves the Class, request, revision, reason, and release history;
- does not change the Recurring Slot or cancel later recurring Classes.

### Rescheduling

A Student may select a successor time from the assigned Tutor's current valid Availability. Separate Tutor approval is unnecessary because the Tutor already published that Availability.

The reschedule succeeds only when Kelp atomically validates:

- active Course, Classroom, Tutor Assignment, and applicable service path;
- successor date inside permitted Course and booking bounds;
- Tutor Availability, Time Off, holiday rule, conflicts, and one-hour buffers;
- supported duration and Phase 4 duration rules;
- successor Credit Commitment for Kelp-billed service;
- no competing Class revision or reservation.

If validation fails, the original Class remains active and no entitlement is used.

## 10. Student changes inside the Hold Window

Inside the Hold Window:

- duration cannot change;
- a Student cancellation or reschedule requires an available entitlement in that Classroom;
- the Student sees that the entitlement will be consumed before confirmation;
- a structured reason is required and private detail remains optional;
- one successful cancellation or reschedule consumes exactly one entitlement;
- the successful outcome is zero-charge and releases the old Hold;
- a reschedule requires a valid successor Commitment before the old booking is replaced;
- failed, declined, expired, withdrawn, or superseded requests consume nothing.

If the entitlement is unavailable, the ordinary self-service cancellation and rescheduling path is blocked. The Student may continue with the original Class or open the later Support Case route for an exceptional review. Opening a Case does not cancel the Class, release the Hold, or create an entitlement.

Failing to attend remains a Phase 11 Student no-show; it is not an implied cancellation request.

## 11. Atomic entitlement use

The Class change, zero-charge cancellation outcome, Phase 10 release or successor allocation, and Entitlement Use Event must commit as one idempotent operation.

For an entitled cancellation:

1. lock the current Class revision, Hold, and Classroom entitlement state;
2. confirm the Class has not begun and the entitlement is available;
3. append the Class cancellation revision and valid zero-charge outcome;
4. release the Hold to its originating Lots;
5. append one Entitlement Use Event;
6. set recovery progress to zero;
7. emit audit and Notification Events;
8. commit all or none.

For an entitled reschedule, Kelp also validates and creates the successor Commitment before superseding the old Hold. The same logical Class ID remains, with an append-only successor revision.

## 12. Entitlement recovery

Each Classroom entitlement begins `available`. It never exceeds one.

After use:

- status becomes `recovering` with progress zero;
- each later Phase 11 Clean Completion Event in the same Classroom increments progress once;
- the eighth consecutive qualifying event restores status to `available`;
- further clean Classes do not accumulate another entitlement;
- a correction that invalidates a counted event appends a compensating recovery event and recomputes the effective count.

### Recovery reset events

The following Student-caused events break the required clean sequence and reset recovery progress to zero without consuming another entitlement:

- final Student no-show;
- Student early departure not excused by an approved incident;
- a separately approved Student late-change exception while the ordinary entitlement is unavailable;
- a correction that establishes Student-caused conduct incompatible with Clean Completion.

### Recovery-neutral events

The following neither increment nor reset Student recovery:

- Tutor-initiated cancellation or reschedule;
- Tutor no-show or Tutor early-departure incident;
- approved Tutor Time Off or holiday action;
- confirmed Kelp outage or technical failure;
- Course termination, Tutor reassignment, service freeze, or another protective cancellation;
- mutual absence or Settlement Pending until an authoritative correction assigns a relevant result;
- an ordinary Student change outside the Hold Window;
- an Independent Tutor Class.

Student no-show therefore does not consume the entitlement, but it interrupts recovery when the entitlement is already recovering. These are separate effects.

## 13. One-off cancellation and rescheduling

Cancelling or rescheduling one Recurring Class creates one Schedule exception:

- the Recurring Slot remains unchanged;
- the next ordinary occurrence still follows the active Lesson Schedule Version;
- an individually rescheduled Class remains excluded from later bulk moves unless explicitly selected;
- an Extra Class remains outside recurrence;
- historical, Ongoing, and completed Classes never move.

The Student must choose explicitly between:

- `extra_class`, which adds one separate meeting; and
- `move_future_recurrence`, which creates a successor Lesson Schedule Version for eligible future ordinary occurrences.

One action never silently performs both.

## 14. Recurring Schedule moves

A Recurring Schedule move follows Phase 4 and adds these Phase 12 rules:

- it has an explicit effective date;
- it changes only future ordinary Recurring Classes;
- it preserves Extra, individually rescheduled, cancelled, Ongoing, and historical Classes;
- it cannot bulk-move a Class already inside its Hold Window;
- each held occurrence requires its own valid late-change result or remains at the original time;
- ordinary materialized occurrences outside the Hold Window receive atomic Class revisions and successor Commitments;
- projected occurrences are recomputed from the successor Lesson Schedule Version;
- a Student move inside published Availability requires no separate Tutor approval;
- a Tutor move requires Student approval before activation.

Changing recurrence never edits the Course Schedule or its academic deadlines automatically.

## 15. Duration changes

Phase 4 remains authoritative:

- duration is always 30, 60, or 90 minutes;
- duration cannot change inside the Hold Window;
- outside the Hold Window, shortening is valid after conflict and commercial revalidation;
- lengthening requires adjacent Tutor Availability and the one-hour buffer after the new end;
- Student-initiated changes activate after validation without separate Tutor approval;
- Tutor-initiated changes require Student approval;
- the successor duration maps to 10, 20, or 30 Lesson Credits for Kelp-billed Classes;
- actual time spent in a Live Classroom never rewrites scheduled duration automatically.

## 16. Tutor-initiated rescheduling

A Kelp Tutor may propose a different Class time but cannot silently impose it.

The proposal must include:

- Class and current revision;
- proposed successor time and unchanged or valid supported duration;
- structured reason;
- optional private detail visible only to authorized reviewers;
- whether Tutor unavailability will require cancellation if declined;
- response deadline;
- effect on recurrence, if any.

The original Class remains active while the proposal is pending. Student silence is never acceptance.

Outside the Hold Window, the ordinary response deadline is the original Hold Window start. If the Student does not respond, the original Class remains unless the Tutor separately cancels it.

Inside the Hold Window, the Student may accept a Tutor proposal before the Class starts if the successor transition remains valid. If the Student declines or does not respond and the Tutor cannot provide the original Class, the Tutor must cancel it. That cancellation is evaluated as a short-notice incident.

A Tutor-initiated change never consumes or resets the Student entitlement.

## 17. Tutor cancellation

A Tutor cancellation requires a structured reason and becomes an explicit Class outcome. Student approval is not required because Kelp cannot require an unavailable Tutor to deliver the Class.

Every effective Tutor cancellation:

- creates zero Student charge and a full Commitment or Hold release;
- creates no Student entitlement use or recovery reset;
- preserves the Class identity and cancellation reason;
- cancels only the named Class unless an approved planned-disruption workflow identifies more;
- creates the applicable Tutor reliability classification;
- notifies the Student and applicable operational owner;
- never marks the Student absent.

A Tutor cancellation inside the Hold Window is a qualifying short-notice incident unless an approved exclusion applies.

## 18. Qualifying Tutor short-notice incidents

A Tutor Reliability Incident is created when all are true:

1. the service is Kelp-managed rather than Independent Tutor service;
2. the Tutor caused an effective cancellation or made a reschedule necessary;
3. the change became necessary inside the Class's six-hour Hold Window;
4. the Class had not begun;
5. no approved exclusion applies;
6. required audit persistence succeeds.

An ordinary Tutor proposal outside the Hold Window is not a short-notice incident. A rejected proposal is not itself an incident while the Tutor remains ready to provide the original Class. A Tutor cancellation after that rejection is evaluated at the cancellation's authoritative time.

One cancellation affecting several Students in one Group Class is one Tutor incident for that shared Class, not one incident per Student.

## 19. Rolling 24-Class calculation

The rolling model uses Phase 11 Clean Completion Events for that Kelp Tutor across all Kelp-managed Courses and Students.

For each new qualifying incident:

1. identify the Tutor's twenty-four most recent Clean Completion Events before the incident;
2. identify prior qualifying incidents that occurred after the oldest of those events, or all prior incidents when fewer than twenty-four events exist;
3. add the current incident;
4. classify the current incident by its ordinal count in that moving span;
5. retain the incident until twenty-four later Clean Completion Events cause it to age out naturally.

This is a sliding window. It never divides a Tutor's work into fixed batches of 24 and never destroys prior history.

Student no-show, Student early departure, protective cancellation, Kelp outage, pending result, and Independent Tutor Class neither add a Clean Completion Event nor create a Tutor incident. They do not reset the rolling history.

## 20. Tutor warning and review ladder

The classification for one active rolling span is:

| Qualifying incident ordinal | Result |
| ---: | --- |
| 1 | Allowed incident recorded; Supervising Mentor informed; no warning |
| 2 | First formal warning; Mentor follow-up required |
| 3 | Second formal warning; Quality Assistant penalty review opened |
| 4 or later | Additional escalated reliability event added to the open or successor Quality Assistant review |

The second warning begins review; Phase 12 does not invent an automatic monetary deduction, suspension, or termination. The later Tutor conduct, compensation, and support contracts determine the proportionate consequence with contractual and jurisdictional review.

When earlier incidents age out, the active rolling classification may fall, but warnings and review records remain immutable history. A correction to the originating Class Change Event appends a compensating reliability event and recomputes the active span.

## 21. Planned disruption and Time Off boundary

Planned Time Off is not the same as repeatedly cancelling individual Classes.

The approved request envelopes are:

| Earliest affected date | Standard maximum requested span |
| --- | --- |
| Within the next 2 weeks | One specific local calendar day |
| More than 2 weeks and no more than 2 months away | Seven consecutive local calendar days |
| More than 2 months and no more than 6 months away | Fourteen consecutive local calendar days |
| More than 6 months and no more than 12 months away | Thirty-one consecutive local calendar days |

These are maximum standard request envelopes, not recurring quotas or permission to cancel accepted Classes silently.

- A wider or otherwise exceptional request routes to the Supervising Mentor.
- Requests affecting dates within six months require Mentor review before they become approved Time Off.
- A request more than six months ahead may reserve future unavailability under Phase 16 after validation.
- Every already accepted Class receives an explicit keep, reschedule, substitute, or cancellation result.
- Student approval remains required for Tutor-proposed rescheduling.
- An approved planned disruption does not create a short-notice incident merely because it changes future Availability.
- A last-minute Tutor cancellation cannot be relabeled as planned Time Off after the fact without authorized emergency review.

## 22. Holidays

Student and Tutor holiday observance is chosen in advance from country, state, and city derived calendars.

- New bookings and recurrence materialization respect the effective holiday preference.
- Users may explicitly agree to work on an observed holiday.
- Changing a holiday preference does not silently cancel an accepted Class.
- An accepted Class requires an explicit Class Change Event.
- A predeclared or authorized holiday exception creates no Student entitlement or Tutor reliability effect.
- The holiday provider, jurisdiction matching, and calendar-edit interface remain Phase 16 work.

Kelp stores country, state, and city for this purpose; it does not require a Student's street address.

## 23. Emergency and justified exclusions

A Tutor-caused late action is excluded from the reliability ladder only when an authorized record classifies it as:

- confirmed Kelp or Live Classroom service failure;
- approved safety or safeguarding action;
- verified emergency Time Off;
- authorized holiday correction caused by Kelp data error;
- Tutor reassignment, qualification restriction, or Course closure initiated by Kelp;
- another documented protective action approved by a Mentor or Quality Assistant within scope.

The Tutor supplies a reason, but self-labeling a request `emergency` does not create the exclusion. Until review completes, the incident may remain `exclusion_pending`; the final reliability result then appends or compensates the incident atomically.

Student personal emergencies may be reviewed through Support when the entitlement is unavailable. Approval may grant a zero-charge late cancellation, but it does not manufacture an additional entitlement and resets recovery progress because the eight clean completions must follow the latest approved Student late disruption.

## 24. Protective and lifecycle cancellations

The following settled cancellations create no Student entitlement use, no recovery reset, no Tutor reliability incident, no attendance event, no Student Credit Charge, and no Tutor compensation:

- Course termination under Phase 5;
- outgoing-Tutor cancellation at Phase 6 reassignment;
- Group Course formation failure before activation;
- eligible Phase 9 service transition outside the Hold Window;
- the Phase 9 no-show Subscription Freeze and approved service-protective cancellation;
- confirmed Kelp outage preventing service;
- an authorized safety restriction or administrative correction classified as protective.

A protective cancellation:

- preserves the Class and request identities;
- uses a specific non-party-fault reason;
- releases the applicable Commitment or Hold;
- does not appear as a Student or Tutor failure in ordinary profile metrics;
- remains visible to authorized operational reviewers;
- is idempotent and cannot release or notify twice.

Inside the Hold Window, a service transition requires an explicitly authorized protective result; a generic plan change cannot silently claim this category.

## 25. Cancellation outcome matrix

| Effective event | Student charge | Commitment or Hold | Student entitlement | Tutor reliability |
| --- | ---: | --- | --- | --- |
| Student cancellation outside Hold | 0 | Release full | No use; neutral | None |
| Student reschedule outside Hold | 0 on old revision | Atomic successor allocation | No use; neutral | None |
| Student entitled cancellation inside Hold | 0 | Release full | Consume one | None |
| Student entitled reschedule inside Hold | 0 on old revision | Release and atomic successor allocation | Consume one | None |
| Student late request without entitlement | No change by request | Original remains | No use | None |
| Tutor cancellation | 0 | Release full | Neutral | Incident only if qualifying |
| Student-accepted Tutor reschedule | 0 on old revision | Atomic successor allocation | Neutral | Incident only if qualifying |
| Approved Time Off or holiday change | 0 | Release or successor allocation | Neutral | Excluded |
| Protective cancellation | 0 | Release full | Neutral | Excluded |
| Student no-show | Phase 11 half charge | Phase 10 partial charge and release | No use; recovery reset if recovering | None |
| Confirmed Kelp outage | 0 | Release full | Neutral | Excluded |

Phase 12 creates cancellation outcomes only before a Class begins. Phase 11 continues to own no-show, attendance, early departure, and outage results after live-session rules apply.

## 26. Reschedule identity and financial transition

A reschedule keeps one logical Class ID and creates a successor Class revision.

Outside the Hold Window, Kelp follows Phase 10:

1. validate the requested successor time and duration;
2. compute the successor credit requirement and eligible Lots;
3. retain the old Commitment while validation is incomplete;
4. atomically supersede and release the old allocation;
5. create exactly one successor Commitment;
6. append the Class Change Event and notification;
7. commit all or none.

Inside the Hold Window, duration remains fixed. The old Hold receives an explicit zero-charge cancellation outcome and the successor revision receives a separately valid Commitment. The operation still commits atomically so neither two bookings nor no booking can result from a partial failure.

If automatic funding is authorized, it buys only the exact valid shortfall after every non-payment check succeeds. A failed payment leaves the original Class active and does not consume the entitlement.

## 27. Cancellation and credit release

Every zero-charge cancellation release returns quantity to the originating Lots. It never:

- resets expiration;
- changes the original Payer;
- converts promotional credits into purchased credits;
- creates cash automatically;
- creates a transferable Tutor balance;
- revives an already expired quantity unless an approved suspension applies.

If released quantity belongs to a Lot whose expiration passed while held, Phase 10 expires it immediately unless an active Expiration Suspension protects it.

## 28. Reason and privacy model

Every Class change stores one structured reason category. Initial categories include:

- Student availability;
- Student emergency;
- Tutor availability;
- Tutor emergency;
- holiday;
- approved Time Off;
- Course or service lifecycle;
- Tutor reassignment or restriction;
- Kelp technical failure;
- safety or safeguarding;
- administrative correction;
- other Support-reviewed reason.

Student-facing views receive only the operationally necessary explanation. Private medical, conduct, family, safeguarding, payment, or staffing detail belongs in a permissioned Support or review record, not in the shared Class thread or calendar.

## 29. Guardian and Payer authority

A Guardian may:

- see the linked child's Class schedule and change results;
- receive applicable child-scoped notifications;
- fund credits and configure permitted top-up limits under the commercial contracts;
- open a Support Case in their own identity.

A Guardian may not cancel, reschedule, approve a Tutor proposal, or spend the child's late-change entitlement through the ordinary schedule workflow. Payment authority is not schedule authority.

The Student remains the academic scheduling actor. A later legal or safeguarding contract may define exceptional authority for a minor without turning every Guardian into the Student.

## 30. Mentor, Quality Assistant, Support, and Administrator authority

### Supervising Mentor

The Mentor may review Tutor planned-disruption requests, emergency exclusions, repeated reliability concerns, and Course continuity. They cannot erase an incident or rewrite a Class directly.

### Quality Assistant

The Quality Assistant may investigate the second-warning penalty review, approve scoped emergency or protective classifications, and recommend corrective action. They cannot post an unauthorized financial or historical rewrite.

### Support

Support receives exceptional Student and Tutor requests, gathers evidence, and routes them to the authorized decision-maker. Opening or commenting on a Case does not change the Class.

### Administrator

An Administrator posts any correction after an effective Class cancellation or reschedule through append-only successor records. Administrator access is not permission to delete the prior request, incident, entitlement, credit, or warning history.

## 31. Group Course boundary

One Student in a Group Course cannot move the shared Class time, duration, or recurrence for the cohort.

Phase 12 permits Kelp to preserve participant-specific requests and outcomes, but the later Group Course contract must define:

- whether a Student may withdraw from one occurrence;
- whether a late withdrawal consumes a participant entitlement;
- per-member Lesson Credit consequences;
- substitute seats and cohort minimums;
- consent required for a Tutor-proposed cohort reschedule.

Until that contract is approved, the single-Student self-service reschedule path must not mutate a shared Group Class. A Tutor short-notice cancellation of one shared Group Class counts as one Tutor reliability incident.

## 32. Independent Tutor boundary

Independent Tutor Courses may use the same Class Change Request and revision history for schedule clarity. However:

- no Kelp Lesson Credit charge, Hold, release, or Tutor payout is created;
- the Kelp Student late-change entitlement does not govern private cancellation fees;
- the Kelp Tutor rolling reliability ladder does not apply;
- Independent Tutors have no Supervising Mentor approval chain;
- Kelp may still investigate conduct, safety, misleading use, or platform-policy complaints;
- Kelp does not adjudicate the Tutor's private Student payment dispute.

Student approval remains required before an Independent Tutor uses Kelp to replace an accepted time with a new time. Kelp's schedule history does not imply control of the private commercial agreement.

## 33. Concurrency, idempotency, and correction

The server must prevent:

- two simultaneous requests consuming one entitlement twice;
- a cancellation and Class start both becoming authoritative;
- a Tutor and Student reschedule creating different active revisions;
- one old Commitment being released twice;
- old and new Commitments remaining active together;
- one Tutor incident creating duplicate warnings;
- a corrected Clean Completion being counted twice;
- a retry duplicating notifications or audit events.

The authoritative transition locks or otherwise serializes the current Class revision, financial allocation, entitlement state, and applicable reliability span.

Corrections are compensating events. They never delete or mutate the original request, approval, Class revision, entitlement use, recovery entry, Tutor incident, warning, Charge, release, or notification.

## 34. Audit record

Each request and effective event records at least:

- stable IDs and idempotency key;
- Class, Course, Classroom, Lesson Schedule, and current revision;
- Student, Tutor, Tutor Assignment, and service model;
- requester and effective actor;
- server request, decision, and commit instants;
- timing snapshot and timezone;
- old and requested date, time, and duration;
- one-off or recurrence scope;
- reason category and protected evidence reference;
- required approval and decision;
- entitlement before, use, progress effect, and after;
- Tutor incident classification, rolling evidence, warning, and reviewer;
- old and successor Commitment or Hold references;
- valid cancellation financial outcome;
- predecessor and correction references;
- Notification Event IDs;
- audit persistence result.

If required audit persistence fails, the Class change is not successful.

## 35. Notification Events

Phase 12 creates server-side Notification Events for at least:

- Student cancellation or reschedule applied;
- Tutor change proposal received;
- Tutor proposal accepted, declined, withdrawn, or expired;
- Tutor cancellation applied;
- successor Class time confirmed;
- entitlement consumed;
- entitlement recovery progress milestone and restoration;
- Student late request blocked because entitlement is unavailable;
- Tutor reliability incident recorded;
- first or second Tutor warning created;
- Quality Assistant penalty review opened;
- planned-disruption request received or decided;
- protective cancellation applied;
- change failed because the slot, funding, or concurrent state changed;
- correction applied.

Notification preferences govern optional email, Twilio SMS, push, or other delivery later. The in-product event and audit history remain even when a user disables an optional channel.

## 36. Approved Phase 12 decisions

The product owner approved all twelve decisions below on 2026-07-20.

### Decision 1: Separate control systems

**Approved rule:** keep the Student Classroom-scoped late-change entitlement, Kelp Tutor Account-wide rolling reliability window, and planned Time Off or holiday model as separate records and policies.

**Why:** each answers a different question and must not consume or excuse the others accidentally.

### Decision 2: Unlimited ordinary Student changes

**Approved rule:** before the Hold Window, allow any number of Student cancellations or reschedules after normal Course, Assignment, Availability, buffer, service, and credit validation. Use no entitlement and create a zero-charge old-Class outcome.

**Why:** frequency alone should not block early planning, while ordinary validation still protects real capacity and commitments.

### Decision 3: Atomic entitled late change

**Approved rule:** inside the Hold Window, allow one Student cancellation or reschedule only when the Classroom entitlement is available. Consume it only when the Class revision, zero-charge outcome, financial transition, and Entitlement Use Event all succeed.

**Why:** a failed UI or payment attempt must not spend the benefit or destroy the valid booking.

### Decision 4: Eight-clean-Class recovery

**Approved rule:** restore the entitlement after eight consecutive Clean Completion Events in the same Classroom. Student-caused unclean outcomes reset recovery; Tutor, Kelp, lifecycle, and ordinary early changes remain neutral.

**Why:** recovery measures successful participation without letting another party's failure delay the Student unfairly.

### Decision 5: Preserve Class and recurrence identity

**Approved rule:** a one-off change keeps one Class ID and does not edit its Recurring Slot. A recurring move affects only eligible future ordinary Classes and preserves held, Extra, individually rescheduled, and historical Classes unless each is explicitly handled.

**Why:** a single exception must not silently rewrite a series or duplicate Classes and credit commitments.

### Decision 6: Tutor proposal and cancellation authority

**Approved rule:** require Student approval for Tutor-proposed time or duration changes; keep the original Class active until approval and atomic commit. Permit a Tutor to cancel unavailable service with a required reason, zero Student charge, and reliability evaluation.

**Why:** the Student controls acceptance of a replacement time, while Kelp cannot pretend an unavailable Tutor will still deliver the original Class.

### Decision 7: Six-hour Tutor incident boundary

**Approved rule:** create a qualifying Kelp Tutor reliability incident for a Tutor-caused cancellation or forced reschedule inside the Hold Window unless an approved emergency, holiday, technical, lifecycle, or safety exclusion applies.

**Why:** the same six-hour operational boundary that protects the Class commitment gives short-notice reliability a deterministic meaning.

### Decision 8: Rolling warning ladder

**Approved rule:** use a rolling span based on the Tutor's twenty-four Clean Completion Events, never fixed blocks. Record the first incident, warn on the second, create the second warning and Quality Assistant penalty review on the third, and escalate later incidents without inventing an automatic sanction in Phase 12.

**Why:** the sliding model reflects current behavior while preserving due process and immutable history.

### Decision 9: Planned-disruption envelopes

**Approved rule:** keep Time Off separate and use the settled maximum spans of one day within two weeks, seven days within two months, fourteen days within six months, and thirty-one days within twelve months. Require Mentor review inside six months and for exceptional requests.

**Why:** planned absence needs a Course-continuity workflow, not a series of disguised Class cancellations.

### Decision 10: Protective exclusions

**Approved rule:** make Course termination, Tutor reassignment, eligible service transitions, approved Time Off or holiday action, confirmed Kelp failure, and authorized safety actions zero-entitlement and zero-reliability outcomes.

**Why:** neither party should be penalized for an approved lifecycle or Kelp-controlled event.

### Decision 11: Explicit financial outcome

**Approved rule:** give every successful cancellation or reschedule an explicit Phase 10 outcome. Release old allocations to their original Lots and create at most one successor Commitment atomically; never infer a refund, expiration reset, or Tutor payment.

**Why:** calendar state cannot safely stand in for a credit-ledger transition.

### Decision 12: Server authority and service-model boundaries

**Approved rule:** make timing, change, entitlement, reliability, and correction decisions server-authoritative and append-only. Keep Guardian scheduling read-only, defer shared Group Class changes, and exclude Independent Tutor private commerce from Kelp entitlement and reliability rules.

**Why:** authority and commercial responsibility must follow the actual relationship, not a browser role, payer identity, or reused interface.

## 37. Phase 12 invariants

The following invariants are authoritative:

1. A Class Change Request is not an effective Class change.
2. Only an applied Class Change Event changes the current Class revision or cancellation state.
3. A pending, declined, withdrawn, expired, failed, or superseded request leaves the current valid Class in force.
4. The server is authoritative for request, decision, and commit time.
5. Browser time and calendar paint never determine the Hold Window.
6. The Hold Window begins six hours before the current authoritative scheduled start.
7. A complete request is not made late solely by Kelp processing delay when its captured state remains valid.
8. No ordinary Class change becomes effective after Joint Attendance begins.
9. Outside the Hold Window, Student cancellation and rescheduling have no numerical frequency limit.
10. Every Student change still requires ordinary Course, Assignment, service, Availability, buffer, conflict, and credit validation.
11. An ordinary Student cancellation outside the Hold Window produces zero Student charge.
12. An ordinary Student cancellation uses no late-change entitlement.
13. An ordinary Student reschedule uses no late-change entitlement.
14. A failed reschedule leaves the original Class and allocation active.
15. Inside the Hold Window, Class duration cannot change.
16. Inside the Hold Window, a Student cancellation or reschedule requires an available entitlement.
17. A Student begins with at most one available entitlement per Classroom.
18. Entitlements never accumulate beyond one.
19. One successful late cancellation or reschedule consumes exactly one entitlement.
20. Failed, declined, withdrawn, expired, superseded, or support-only requests consume no entitlement.
21. Entitlement use, Class change, cancellation outcome, and financial transition succeed atomically or not at all.
22. An unavailable entitlement blocks the ordinary late-change path.
23. Opening a Support Case does not cancel a Class or grant an entitlement.
24. Student absence is not an implied cancellation request.
25. Student no-show never consumes the late-change entitlement.
26. After use, recovery begins at zero in the same Classroom.
27. Only a later Clean Completion Event in that Classroom increments recovery.
28. One Clean Completion Event increments recovery no more than once.
29. Eight consecutive qualifying events restore one entitlement.
30. Clean Completions beyond eight create no accumulated entitlement.
31. A final Student no-show while recovering resets recovery to zero without consuming another entitlement.
32. Unexcused Student early departure while recovering resets recovery to zero.
33. An approved exceptional Student late change while recovering resets progress to zero.
34. Tutor-caused disruption neither consumes nor resets Student entitlement recovery.
35. Kelp failure, approved Time Off, holiday action, lifecycle cancellation, and protective cancellation are recovery-neutral.
36. Ordinary Student changes outside the Hold Window are recovery-neutral.
37. Corrections append compensating recovery events rather than rewriting prior events.
38. Cancelling one Class never cancels the recurring series.
39. One-off rescheduling never changes the generating Recurring Slot.
40. An Extra Class never becomes ordinary recurrence automatically.
41. A Recurring Schedule move affects only eligible future ordinary Classes.
42. A bulk move cannot silently move a Held Class.
43. Held occurrences require individual valid outcomes or remain unchanged.
44. Extra and individually rescheduled Classes remain excluded from a bulk move unless explicitly selected.
45. Historical, Ongoing, and completed Classes never move.
46. Recurrence changes never edit Course Schedule deadlines automatically.
47. Every reschedule preserves one logical Class ID and append-only revisions.
48. Every Tutor-initiated time or duration change requires Student approval.
49. Student silence is never approval of a Tutor proposal.
50. The original Class remains authoritative while a Tutor proposal is pending.
51. A rejected Tutor proposal is not an incident if the Tutor remains ready for the original Class.
52. Tutor cancellation requires a structured reason.
53. Tutor cancellation produces zero Student charge and full allocation release.
54. Tutor cancellation never consumes or resets the Student entitlement.
55. Tutor cancellation never marks the Student absent.
56. A qualifying Tutor incident applies only to Kelp-managed service.
57. A qualifying Tutor incident requires a Tutor-caused cancellation or forced reschedule inside the Hold Window.
58. An ordinary Tutor proposal outside the Hold Window is not a short-notice incident.
59. Approved Time Off, holiday, Kelp failure, lifecycle, emergency, and safety exclusions create no Tutor incident.
60. A Tutor cannot self-approve an emergency exclusion merely by choosing a reason label.
61. Tutor reliability is Account-wide across the Tutor's Kelp-managed Classes.
62. Tutor reliability uses a rolling span rather than fixed blocks of 24.
63. The rolling denominator uses Phase 11 Clean Completion Events.
64. One Group Class creates at most one Tutor reliability incident regardless of Student count.
65. The first active-span incident creates no formal warning.
66. The second active-span incident creates the first formal warning.
67. The third active-span incident creates the second warning and opens Quality Assistant penalty review.
68. Later active-span incidents create escalated review events.
69. Phase 12 creates no automatic monetary, qualification, suspension, or termination sanction.
70. A Tutor incident ages out of the active span only after twenty-four later Clean Completion Events.
71. Aging out never deletes the incident, warning, or review history.
72. A reliability correction appends a compensating event and recomputes the active span.
73. Planned Time Off is not a Student entitlement or Tutor short-notice allowance.
74. Planned disruption limits describe one request span, not a recurring cancellation quota.
75. A planned disruption never silently cancels an accepted Class.
76. Requests affecting dates within six months require Mentor review.
77. A wider or exceptional planned disruption requires Mentor review.
78. A preference change never silently cancels an accepted holiday Class.
79. Both parties may explicitly agree to work on an observed holiday.
80. A protective cancellation creates zero Student charge, zero Tutor compensation, no entitlement use, and no reliability incident.
81. Course termination and outgoing-Tutor reassignment cancellations remain protective.
82. Eligible service transition and confirmed Kelp outage cancellations remain protective.
83. A generic plan change inside the Hold Window is not protective without explicit authority.
84. Every zero-charge cancellation releases the applicable Commitment or Hold exactly once.
85. Release returns quantity to its originating Lots.
86. Release never resets expiration or changes Payer attribution.
87. A reschedule leaves at most one active Commitment for the logical Class.
88. Old release and successor Commitment activation are atomic.
89. A failed automatic payment never consumes entitlement or destroys the original Class.
90. A Class Change Event never creates Tutor compensation by itself.
91. Guardian payment authority never grants schedule authority.
92. A Guardian cannot consume a Student entitlement through the ordinary workflow.
93. One Group Course Student cannot reschedule the shared Class for the cohort.
94. Group per-member late-cancellation commercial effects remain deferred.
95. Independent Tutor Classes create no Kelp entitlement or Tutor reliability event.
96. Independent Tutor private cancellation fees remain outside Kelp.
97. Private reasons remain permissioned and are not exposed in shared calendars or Class threads.
98. Two concurrent requests cannot consume one entitlement twice.
99. One old allocation cannot be released twice.
100. One incident cannot create duplicate warnings through retries.
101. Corrections never delete prior requests, Class revisions, entitlement events, incidents, warnings, or ledger records.
102. Failed required audit persistence prevents the Class change from succeeding.

## 38. Relationship to existing implementation

The current dashboard and calendar prototypes are not Phase 12 authority. Dragging a calendar item, changing local state, editing a fixture, or storing a preference in browser storage cannot:

- determine the Hold Window;
- consume or restore an entitlement;
- cancel or reschedule a persisted Class;
- release or reallocate Lesson Credits;
- create or remove a Tutor incident;
- approve a Tutor proposal;
- classify Time Off or an emergency;
- correct historical state.

Later architecture must implement these transitions with server identity, trusted time, transactional or idempotent orchestration, append-only history, scoped authorization, and reconciliation.

Phase 12 does not authorize modifying the dashboard, calendar, Classroom, Supabase schema, Docker environment, Stripe, Twilio, or backend services.

## 39. Phase 12 completion and later-phase handoff

Phase 12 is final and authoritative.

Later Tutor Availability and Time Off work must consume the planned-disruption envelopes and exclusions defined here without turning an Availability edit into a silent Class cancellation. Later Lesson Request work must create persisted Classes before this contract can change them. Later Tutor compensation must consume the cancellation and attendance outcomes without deriving money from calendar state. Later Support, safeguarding, and notification contracts may review or deliver these records but must preserve their authority, identity, and audit boundaries.

No database, API, RLS, Docker, Supabase, Stripe, Twilio, payment, or frontend implementation is authorized by this contract.
