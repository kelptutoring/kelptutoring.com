# Phase 14: Support Cases, requests, complaints, refunds, transfers, and escalations

**Contract phase:** 14 of 54  
**Status:** Draft - awaiting product owner approval  
**Last updated:** 2026-07-20  
**Depends on:** canonical glossary and approved Phases 2-13  
**Applies to:** Support Case intake, complaints, compliments, suggestions, refund and credit-transfer requests, service and academic-quality concerns, relationship requests, technical incidents, conduct and safety escalation, Case assignment, communication, evidence, decisions, downstream Action Orders, resolution, privacy, retention, appeals, and audit

## 1. Purpose

This contract defines one traceable way for Students, Guardians, Tutors, Mentors, Independent Tutors, and other permitted users to ask Kelp for help without giving a message form the power to rewrite authoritative product state.

It separates eight questions:

1. **Who reported the issue, for whom, and about which exact resource or event?**
2. **What type, priority, and confidentiality tier does the Case require?**
3. **Who may triage, investigate, decide, communicate, or execute a remedy?**
4. **Which information may the reporter, subject, Guardian, staff, or third party see?**
5. **Did Kelp merely receive a request, make a decision, or complete a downstream action?**
6. **Do a refund, transfer, correction, reassignment, restriction, or suspension contract permit the requested result?**
7. **Was the Case resolved, withdrawn, merged, appealed, or reopened without deleting history?**
8. **Did every sensitive read, decision, and resulting action remain auditable?**

A Support Case is not a refund. A complaint is not a misconduct finding. A transfer request is not a Credit Transfer. A safety report is not automatic proof. A Case status is not a Class, Course, subscription, credit, payout, or Role state.

## 2. Contract authority and current approval status

The canonical glossary and approved Phases 2-13 remain authoritative. In particular, Phase 14 preserves:

- relationship-scoped Role and Support authority from Phase 7;
- Support receiving, routing, communicating, and performing only delegated non-academic actions;
- Quality Assistants receiving applicable complaints, refunds, transfers, incidents, and quality concerns;
- Mentors retaining academic continuity and Tutor-supervision authority;
- Administrator corrections remaining explicit, exceptional, append-only, and audited;
- Course and Tutor Assignment changes following Phases 5 and 6;
- Lesson Credit transfer, restriction, suspension, refund allocation, reversal, and adjustment following Phase 10;
- attendance and incident results following Phase 11;
- cancellation and reliability results following Phase 12;
- Tutor compensation, correction, payout, and dispute recovery following Phase 13;
- Independent Tutor private Student payments remaining outside Kelp adjudication;
- confirmed Kelp failures remaining Kelp responsibility;
- private Support Case content remaining outside ordinary Tutor reassignment and Classroom history;
- a generic Support Case creating no automatic credit-expiration suspension;
- append-only, server-authoritative decision and correction history.

This Phase is not yet final. The twelve recommendations in section 36 require product-owner approval. Draft rules and invariants must not be implemented as final behavior before approval.

## 3. Settled baseline

The following rules were settled before Phase 14 and are not reopened here:

1. Kelp provides a dedicated Support page.
2. Users may submit complaints, compliments, suggestions, refund requests, credit-transfer requests, issues, and service incidents.
3. Applicable Cases are sent to a Quality Assistant.
4. Tutors, Mentors, and replacement Tutors do not receive private Support Cases merely through educational relationships.
5. Tutors may report Student misconduct and Students or Guardians may report Tutor misconduct, lack of knowledge, or relationship problems.
6. Either party may request a Tutor-Student relationship review or ending, but the request does not end it automatically.
7. Kelp may investigate Independent Tutor conduct, safety, content, academic quality, and platform misuse.
8. Kelp does not adjudicate Independent Tutor private Student payment disputes.
9. Credit Transfers occur only through approved requests.
10. Refunds and administrative adjustments require authorized support or operational workflows.
11. Opening a generic Case does not suspend Credit Lot expiration.
12. A Case-specific expiration suspension requires explicit approval, affected Lots, reason, owner, and review date.
13. Attendance and outside-Kelp exception reports retain the Phase 11 seven-day reporting deadline.
14. Opening a Case does not cancel or reschedule a Class, release a Hold, or grant a late-change entitlement.
15. Guardians may submit child-scoped requests in their own identity but may not impersonate the Student.
16. Independent Tutor Students may submit platform, safety, conduct, content, and quality Cases even though private payment remains out of scope.
17. Historical and Inactive Classrooms remain read-only; new disputes use Support Cases.
18. Sensitive Case information must not be stored as browser-only authority.

## 4. Scope

### Included

Phase 14 defines:

- authenticated and limited public Case intake;
- Reporter, Beneficiary, Subject, Resource Link, and Case Participant identities;
- Case type, priority, confidentiality, and conflict-of-interest classification;
- required context and structured narrative;
- Case lifecycle, assignment, communication, internal notes, and deadlines;
- ordinary Support, Quality Assistant, Mentor, Finance-capability, Administrator, and downstream executor boundaries;
- complaint fairness and protected disclosure;
- refund, Credit Transfer, expiration-remediation, relationship, attendance, technical, quality, conduct, and safety request boundaries;
- Independent Tutor in-scope and out-of-scope handling;
- Support Action Orders and completion reconciliation;
- attachments, links, malware controls, editing, retention, and deletion boundaries;
- withdrawal, duplicate merge, correction, appeal, and reopening;
- privacy, search, notifications, automation, concurrency, idempotency, and audit.

### Deferred

Phase 14 does not define:

- statutory refund rights, mandatory complaint procedures, limitation periods, or jurisdiction-specific consumer remedies;
- final refund percentages, processor-fee deductions, taxes, or the provisional 20% and 7% figures;
- criminal, emergency, safeguarding, mandatory-reporting, or law-enforcement procedure;
- the complete Tutor conduct, Student conduct, sanction, qualification, or contractor-remedy matrix;
- the exact financial-operations Role name and organization chart;
- final staffing hours, holiday coverage, languages, and guaranteed resolution times;
- public legal notices, emergency telephone numbers, or regional crisis resources;
- email, Twilio SMS, push, phone, or live-chat delivery implementation;
- external helpdesk, malware scanning, object storage, search, or AI provider selection;
- database tables, RLS, APIs, jobs, dashboards, or frontend implementation;
- legal-hold, retention, erasure, accounting, and tax requirements beyond the provisional product retention boundary;
- Independent Tutor private billing, refund, or payment-dispute decisions.

## 5. Phase 14 concepts

### Support Case

The durable, traceable container for one related request, complaint, compliment, suggestion, incident, or review. It owns structured type, priority, confidentiality, Reporter, Beneficiary, Subjects, Resource Links, Messages, Attachments, Assignments, Decisions, Action Orders, deadlines, resolution, and history.

It does not own or directly mutate the underlying Course, Class, credit, money, payout, Role, or relationship state.

### Case Reporter

The verified person or limited public contact who submits the Case. Their true identity and acting relationship remain attributed even when their identity is hidden from another Case participant for safety or confidentiality.

### Case Beneficiary

The person whose service or rights the request primarily concerns. The Reporter and Beneficiary may differ, such as a Guardian reporting for a linked child.

### Case Subject

The person, service, event, transaction, relationship, content item, or Kelp operation about which the Case was raised. Being named as a Subject is not a finding of fault.

### Case Participant

A person granted an explicit Case-scoped communication or viewing role, such as Reporter, authorized Guardian, responding Subject, assigned Support agent, investigator, decision-maker, or executor. Educational relationship alone never creates Case participation.

### Case Resource Link

The immutable reference connecting the Case to an exact Course, Classroom, Class revision, Assignment, transaction, Credit Lot, payout item, Report Card, Post, File, Tutor Application, Account, or other permitted resource. It avoids relying on names or mutable display text.

### Case Type

The structured reason family used for routing and reporting. It is separate from priority, confidentiality, outcome, and fault.

### Case Priority

The operational urgency level used to calculate response and update targets. It does not decide merit, remedy, or confidentiality.

### Case Confidentiality Tier

The sensitivity and disclosure policy applied to Case content. It is separate from Role and Case Priority and always enforces least privilege.

### Case Message

An append-only communication attributed to one Case Participant and audience. User-visible Messages, Subject-response Messages, and internal restricted notes are different audience types and cannot be relabeled silently after posting.

### Case Attachment

A permissioned, malware-screened File submitted to one Case Message. It preserves uploader, source, checksum, media validation, access history, retention class, and any restriction or redaction Versions.

### Internal Case Note

A staff-only append-only record for triage, evidence analysis, legal or safety coordination, or operational planning. It is never displayed as though it were a user-visible Message and must not contain unrelated personal data.

### Case Assignment

The effective-dated responsibility given to a Support agent, Quality Assistant, Mentor, financial-capability holder, Administrator, or specialist for a precise Case function. Assignment grants only the Case scope and capability stated.

### Case Decision

The append-only authorized determination approving, partially approving, declining, referring, or finding no current basis for one requested outcome. A Decision records authority, evidence basis, policy Version, explanation, affected request, and appeal route.

### Support Action Order

The immutable, idempotent instruction created from an authorized Case Decision for another domain to execute, such as Credit Transfer, refund instruction, Expiration Suspension, Tutor Assignment review, protective restriction, Credit Adjustment, outcome correction request, or payout correction.

An Action Order is not successful until the owning downstream contract confirms its result.

### Case Resolution

The append-only summary explaining why active Case work ended, which Decisions were made, which Action Orders completed or remain separately tracked, what was communicated, and whether appeal or reopening is available.

### Case Appeal

The attributed request for a different authorized reviewer to reconsider a Case Decision because of new evidence, procedural error, authority error, or material policy misapplication. It does not erase or suspend the original Decision automatically.

### Safeguarding escalation

The restricted urgent routing of a report that may involve imminent harm, abuse, exploitation, coercion, or serious risk to a child or vulnerable person. It is a triage classification, not a final factual finding or emergency-service substitute.

## 6. Case type taxonomy

The initial Case Types are:

| Type | Examples | Ordinary owner |
| --- | --- | --- |
| `general_help` | navigation, service question, non-sensitive assistance | Support |
| `compliment` | praise for a Tutor, Mentor, tool, or service | Support or Quality Assistant |
| `suggestion` | product, curriculum, accessibility, or service idea | Support or routed product owner |
| `academic_quality` | Tutor knowledge, explanation, Course fit, grading concern | Quality Assistant with academic input |
| `relationship_review` | Tutor change, communication problem, termination request | Quality Assistant and applicable Mentor |
| `refund_request` | platform fee, credit purchase, Class, or approved reversal request | Quality Assistant plus financial authority |
| `credit_transfer_request` | moving eligible credits between Students | Quality Assistant plus Phase 10 executor |
| `credit_expiration_remediation` | Kelp-caused delay, replacement pause, suspension request | Quality Assistant plus Phase 10 executor |
| `payment_or_subscription` | failed purchase, duplicate charge, invoice, subscription state | Support or financial authority |
| `class_or_attendance_incident` | no-show, outage, outside-Kelp delivery, early ending | Phase 11 review owner |
| `cancellation_exception` | unavailable entitlement or emergency late-change request | Quality Assistant under Phase 12 |
| `technical_issue` | Classroom, upload, account, or service failure | Support or technical owner |
| `conduct_concern` | harassment, dishonesty, repeated disruption, misuse | Quality Assistant |
| `safety_or_safeguarding` | imminent or serious participant safety concern | restricted safeguarding route |
| `privacy_or_data_rights` | access, correction, deletion, disclosure, consent | authorized privacy route |
| `accessibility` | accommodation, barrier, alternative format | Support and accessibility owner |
| `independent_tutor_platform_concern` | conduct, content, safety, quality, or platform misuse | Quality Assistant |
| `security_or_account_compromise` | unauthorized access, identity or credential concern | restricted security route |
| `other` | unable to classify safely at intake | Support triage |

`other` is a Case routing value, not permission to store arbitrary academic taxonomy or bypass structured follow-up.

## 7. Type, priority, confidentiality, and outcome separation

The architecture must not encode Case meaning in one status.

For example:

- a `refund_request` may be standard or urgent;
- an `academic_quality` Case may be ordinary or restricted;
- a `safety_or_safeguarding` Case may be unresolved without proving misconduct;
- a complaint may end as fulfilled, partially fulfilled, declined, referred, unsupported, or no action required;
- a high-priority Case does not guarantee the requested remedy;
- a confidential Case may still require a safe summary and response opportunity for the Subject.

Each dimension remains explicit and versioned.

## 8. Intake paths

### Authenticated intake

Account-, education-, relationship-, credit-, refund-, attendance-, and payout-specific Cases require authenticated intake whenever reasonably possible.

The server derives eligible Resource Links from the Reporter's actual relationships. A user selects the affected Class, Course, transaction, Tutor Assignment, or credit record rather than typing another person's private identifier.

### Limited public contact

Kelp may accept unauthenticated general suggestions, compliments, accessibility contacts, pre-account questions, and urgent safety or security reports. Public intake:

- creates no Account-specific disclosure or action before identity and authority verification;
- receives abuse, rate, and malware controls;
- never exposes whether a named person has a Kelp Account;
- may be converted or linked to an authenticated Case after verification;
- warns users not to submit payment credentials or unnecessary sensitive data.

Account recovery and Tutor Application intake remain their own verified workflows.

## 9. Required intake record

Every submitted Case records:

- stable Case ID and safe human-readable reference;
- Reporter identity or public-contact classification;
- acting Role and relationship;
- Beneficiary, when different;
- one primary Case Type and optional secondary tags;
- requested result or help needed;
- structured narrative;
- exact Resource Links available to the Reporter;
- event date, timezone, and date learned where relevant;
- affected person as a server-resolved Subject when permitted;
- Attachments and submitted web links;
- urgent safety or ongoing-harm indicators;
- preferred accessible communication method;
- authoritative submission instant;
- accepted Support terms and privacy notice Version;
- audit and anti-abuse state.

The user must not be asked for a full street address, raw payment card, bank credential, password, government credential, or another person's sensitive data unless a later lawful process explicitly requires it.

## 10. Reporter and acting authority

### Student

May report their own service, education, relationship, Class, credit, payment, safety, privacy, or accessibility concern.

### Guardian

May submit in their own identity for themselves or a linked child within Guardian scope. The Case records both Reporter and child Beneficiary. The Guardian never appears as the Student and receives no unrelated payment or confidential safety data.

### Tutor or Mentor

May report a connected Student, relationship, Class, academic-quality, conduct, safety, technical, or supervisory issue within effective scope. Reporting does not grant decision authority over their own complaint.

### Independent Tutor

May report platform, Account, content, conduct, safety, quality, or subscription issues. Their private Student billing remains out of scope.

### Former participant

May submit a retained-history Case about their prior relationship or Class while identity, retention, and applicable deadlines permit. Former relationship does not restore Classroom access.

## 11. Guardian and minor confidentiality

Guardian educational visibility does not create automatic access to every child-related Support Case.

- Ordinary service and academic Cases may include the active Guardian when child scope permits.
- A safety, safeguarding, privacy, abuse, or conflict Case may restrict Guardian visibility when disclosure could create harm, defeat an investigation, violate law, or expose another person's protected information.
- Restriction requires an authorized reason and review, not a hidden UI choice by ordinary staff.
- A hidden Guardian remains visible to Kelp staff and audit.
- A child-facing view never falsifies who submitted or decided a Case.
- Reaching adulthood follows the Phase 7 consent transition for new Case access.

Kelp must not promise secrecy that law or immediate safety duties may make impossible. The user-facing notice should explain that restricted disclosure may occur only to protect safety, rights, or legal obligations.

## 12. Support Case lifecycle

The proposed lifecycle is:

| State | Meaning |
| --- | --- |
| `draft` | Reporter has not submitted the Case |
| `submitted` | Server accepted the immutable initial Version |
| `triage` | Type, priority, confidentiality, scope, and conflicts are being validated |
| `assigned` | One accountable owner and any specialist assignments exist |
| `awaiting_reporter` | Kelp requested specific information from the Reporter |
| `awaiting_subject_response` | An authorized safe response request was sent to a Subject |
| `awaiting_internal` | Kelp is waiting on an internal specialist or domain decision |
| `under_review` | Evidence and applicable policy are actively being evaluated |
| `decision_pending_action` | Decision exists and one or more Action Orders remain incomplete |
| `resolved` | Decision and required execution reached a stable result |
| `closed` | Resolution was communicated and ordinary follow-up ended |
| `withdrawn` | Reporter withdrew the request without deleting history |
| `merged` | Work continues under a linked primary Case |
| `reopened` | Authorized new evidence or failure resumed review |
| `restricted` | Legal, safety, security, or privacy authority limits ordinary processing or visibility |

State change and assignment change are append-only events. `closed` never means erased.

## 13. Triage

Triage must determine:

1. identity and relationship confidence;
2. whether Kelp is responsible for the reported domain;
3. primary and secondary Case Types;
4. urgency and any ongoing harm;
5. Confidentiality Tier;
6. exact linked resources and evidence preservation need;
7. applicable deadline, such as Phase 11's seven-day report window;
8. conflict-of-interest or self-review issue;
9. accountable Case owner and specialists;
10. whether immediate protective authority must be requested;
11. whether another existing Case should be linked or merged;
12. first response and next-update target.

Automated triage may recommend classification, redact obvious secrets, detect duplicates, or raise urgency. It cannot make a final adverse, financial, safety, relationship, or misconduct Decision.

## 14. Priority and response policy

The initial priorities are:

| Priority | Examples | Initial response target |
| --- | --- | --- |
| `P0_critical` | imminent safety risk, active Account compromise, severe service-wide security event | immediate automated alert and human target within 1 staffed service hour |
| `P1_urgent` | Class or access impact within 24 hours, active financial duplication, serious ongoing conduct | within 4 staffed service hours |
| `P2_standard` | ordinary complaint, refund, transfer, relationship, academic, or technical review | within 1 business day |
| `P3_feedback` | compliment, suggestion, non-urgent product feedback | within 3 business days |

These are response targets, not guaranteed resolution times or emergency-service promises.

- Staffed service hours and holidays use a published Version.
- P0 intake warns that Kelp is not an emergency service and directs immediate danger to appropriate local emergency resources.
- Every unresolved Case receives an attributed next-update deadline.
- Missing a target creates an operational escalation and audit event; it does not auto-approve the requested remedy.
- Priority changes require a reason and history.

## 15. Confidentiality tiers

The initial tiers are:

| Tier | Typical content | Access rule |
| --- | --- | --- |
| `ordinary` | general help, compliment, non-sensitive suggestion | assigned Case participants |
| `restricted_financial` | purchases, refunds, credits, payouts, invoices | assigned Support, Quality, and financial capability only |
| `restricted_quality_or_conduct` | academic-quality evidence, complaint, response | assigned investigator and explicitly participating parties |
| `restricted_safety` | abuse, safeguarding, vulnerable person, urgent risk | named safeguarding or authorized Quality scope only |
| `restricted_security_privacy_legal` | compromise, data rights, legal request, legal hold | named specialist scope only |

Case Type does not grant access by itself. Every restricted Case read is relationship- and assignment-checked and audit logged.

## 16. Assignment and accountable ownership

Each active Case has one accountable owner even when several specialists participate.

### Support

May receive, acknowledge, classify, request information, communicate, route, and perform narrowly delegated non-academic tasks.

### Quality Assistant

Is the accountable decision owner for applicable complaint, academic-quality, relationship, conduct, refund-recommendation, transfer, remediation, Tutor, Mentor, and Independent Tutor platform Cases within organizational scope.

### Mentor

May provide academic or continuity input for connected Courses and Tutors. They do not receive the full private Case by default and cannot decide a complaint about themselves.

### Financial capability holder

Validates Payer, transaction, refund, transfer, provider, accounting, and tax requirements. They execute or authorize money and credit actions only through the owning financial contract.

### Administrator or specialist

May perform explicit correction, security, privacy, legal, or Break-glass functions within granted scope. They are not the ordinary Case owner merely because they have technical access.

## 17. Conflict of interest and recusal

No person may investigate, decide, or execute a high-impact Case when they are:

- the Reporter or Subject;
- the accused or directly affected Tutor, Mentor, Quality Assistant, Support agent, or Administrator;
- the direct decision under review;
- financially interested beyond ordinary employment or contract;
- otherwise unable to act impartially under the current conflict policy.

A Case about a Mentor routes outside that Mentor. A Case about a Quality Assistant routes to another authorized Quality Assistant or higher organizational authority. A Case about the ordinary owner requires reassignment before substantive review.

Recusal and reassignment preserve prior access history and notes.

## 18. Case communication model

Case communication separates:

- Reporter-visible Messages;
- authorized Guardian-visible Messages;
- Subject-response requests and responses;
- staff-only Internal Notes;
- restricted safety, legal, security, or financial notes;
- system events and Action Order updates.

A participant sees only Messages addressed to an audience they currently may access. Removing future access does not rewrite prior lawful access or copy confidential content into another view.

Email or SMS replies, when implemented, must authenticate and bind to the correct Case before becoming a Message. A forwarded email address or guessed Case number cannot grant access.

## 19. Complaint fairness and response

A complaint is an allegation until an authorized Decision establishes a result.

When safe and appropriate, the Subject receives:

- a sufficient summary of material allegations;
- the applicable conduct or quality standard;
- a reasonable response deadline;
- a way to submit evidence or identify relevant records;
- notice of the Decision and appeal route permitted to them.

Kelp may delay, limit, or omit disclosure when necessary to protect a child, Reporter, evidence, Account security, privacy, legal duty, or immediate safety. The restriction requires reason, authority, and review.

Reporter identity, private attachments, unrelated history, Guardian identity, payment data, and staff analysis are not disclosed merely because a response is requested.

## 20. Evidence and Resource Links

The Case should link to authoritative records rather than copy or rewrite them.

- A Class complaint links the exact Class revision, Attendance Summary, outcome Version, and permitted evidence.
- A refund request links the original payment, Payer, invoice, Credit Lots, allocations, and Charges.
- A transfer request links source and proposed destination Student Credit Accounts and eligible Lots.
- A Tutor complaint links the effective Assignment and supervisory periods.
- A Forum or File complaint links the immutable Post or File Version and access scope.
- A payout concern links the exact accrual, Batch, transfer, statement, or Recovery Balance.

If mutable external evidence must be preserved, Kelp records a lawful snapshot or checksum with source, acquisition time, permission, and access tier. Staff do not download unrelated private data speculatively.

## 21. Support Action Orders

An approved Decision requiring product mutation creates one or more Support Action Orders.

The initial Action Order types include:

- `credit_transfer`;
- `credit_refund_allocation`;
- `provider_refund_instruction`;
- `credit_reversal_or_adjustment`;
- `expiration_suspension_start_or_end`;
- `subscription_or_service_change`;
- `tutor_assignment_review_or_change`;
- `class_outcome_correction_request`;
- `cancellation_exception_result`;
- `protective_access_restriction`;
- `tutor_compensation_adjustment_request`;
- `privacy_or_security_action`;
- `no_operational_action`.

Each Order identifies the exact owning contract, target, approved parameters, decision-maker, executor capability, idempotency key, deadline, and completion callback.

## 22. Action Order lifecycle

The proposed Action Order states are:

| State | Meaning |
| --- | --- |
| `proposed` | Investigator drafted a remedy but no authority approved it |
| `approved` | Authorized Decision permits execution |
| `rejected` | Proposed action was not authorized |
| `queued` | Owning domain accepted the idempotent instruction |
| `executing` | Downstream transition is in progress |
| `succeeded` | Owning domain returned its authoritative result |
| `failed` | Action did not complete and authoritative state remains safe |
| `reconciliation_required` | Case and downstream state disagree or completion is uncertain |
| `cancelled` | Authorized cancellation occurred before irreversible execution |
| `superseded` | A successor Order replaced the parameters safely |

The Case cannot claim a remedy was fulfilled while a required Order is proposed, queued, executing, failed, or unreconciled.

## 23. Refund request boundary

A refund Case records the request and decision; it does not itself move money.

The review must identify:

- Reporter, Beneficiary, original Payer, and refund recipient authority;
- payment, invoice, transaction, currency, and Price Version;
- affected Credit Lots, remaining quantity, Commitments, Holds, and Charges;
- Class outcome, service delivery, cancellation, or Kelp-failure basis;
- Tutor compensation and payout state where relevant;
- prior refund, dispute, transfer, or restriction;
- consumer, accounting, tax, and policy requirements;
- proposed credit-side and money-side actions separately.

A mere request does not restrict credits. An authorized refund-review or Action Order may create the exact Phase 10 Credit Restriction needed to prevent double spending while execution is pending.

The provisional 20%, 7%, processor-fee, and subscription-deduction formulas remain non-authoritative until legal and accounting review.

## 24. Credit Transfer request boundary

A Credit Transfer Case must collect:

- source Student and eligible source Lots;
- destination Student and verified destination acceptance;
- requested integer quantity;
- requester's relationship and authority;
- original Payer and preserved money attribution;
- unchanged expiration instants;
- reason and terms acknowledgment;
- conflicts with Commitments, Holds, refunds, restrictions, disputes, or expiration;
- Quality Assistant decision and Phase 10 executor.

Only unused, unexpired, unrestricted purchased credits may transfer. Promotional credits remain ineligible by default. The transfer is complete only when Phase 10 posts paired atomic `transfer_out` and `transfer_in` entries.

Guardian payment authority alone does not silently grant transfer authority. The applicable Student and lawful Guardian authority must be verified for each source and destination.

## 25. Credit expiration remediation

Opening a Case never pauses expiration automatically.

An approved Expiration Suspension Action Order must identify:

- exact Student and Lots;
- qualifying Kelp-caused or relationship-remediation reason;
- remaining lifetime snapshot;
- start, responsible owner, and review date;
- expected replacement or service outcome;
- ending conditions;
- mandatory review at least every 90 days.

It never revives already expired credits or creates new money value. The Phase 10 ledger remains authoritative.

## 26. Relationship and reassignment requests

A Case may request Tutor reassignment, relationship ending, emergency restriction, or continuity help. Submitting it never ends the Assignment or removes Classroom access.

- Quality Assistant reviews complaint and operational scope.
- The current Mentor supplies academic continuity input unless conflicted or restricted.
- Phase 6 remains authoritative for Assignment Change Request, handoff, replacement, cancellation, and Membership cutover.
- Safety or conduct urgency may request a Phase 7 protective restriction before ordinary handoff.
- The replacement Tutor receives authorized educational history, never the private Support Case.
- Credits remain Student-owned and compensation history remains with the Tutor who earned it.

## 27. Attendance, cancellation, and technical incidents

Phase 14 receives reports but does not recalculate attendance or entitlement.

- Phase 11 reports requiring financial exception remain due within seven days.
- Phase 11 Settlement Pending remains at most 14 days without a successor outcome.
- Phase 12 late-change Support requests do not cancel the original Class before an authorized result.
- A confirmed Kelp outage may create the settled zero-charge outcome through the owning incident workflow.
- A local device or household-network failure is not automatically a Kelp outage.
- A report received after a contractual deadline may still support conduct, quality, safety, or technical learning even when it cannot change the settled financial outcome automatically.
- Outcome correction requires the Phase 11 Administrator successor-Version path.

## 28. Conduct, academic quality, and safety

### Academic quality

Quality review may examine qualification scope, Course fit, Tutor Review, assessments, grades, explanations, Course materials, reports, and related evidence. A Quality Assistant may decide operational quality action but does not edit grades or Course records without the owning academic contract.

### Conduct

Conduct review separates allegation, evidence, response, finding, remedy, and sanction. A complaint count alone never proves misconduct.

### Safety and safeguarding

P0 safety intake creates immediate restricted routing and may request time-bounded protective action. Kelp must:

- explain it is not an emergency service;
- preserve necessary evidence lawfully;
- limit disclosure;
- avoid alerting a Subject when doing so may create harm or destroy evidence;
- use authorized safeguarding and legal review;
- never let an automated system make the final safety finding.

Exact mandatory reporting, external escalation, and regional emergency procedure remain deferred to qualified legal and safeguarding design.

## 29. Independent Tutor Cases

Kelp accepts Independent Tutor Cases concerning:

- participant safety or safeguarding;
- harassment, fraud, impersonation, or platform misuse;
- academic quality or misleading Kelp representation;
- Course, content, report, or Classroom use;
- privacy, security, accessibility, or account service;
- Independent Tutor platform subscription.

Kelp does not decide:

- the private lesson price;
- whether the private Student paid the Tutor;
- private refund entitlement;
- private chargeback allocation;
- private Tutor payout.

An out-of-scope payment request receives a clear scope Decision without closing or suppressing any connected safety, conduct, quality, privacy, or platform Case.

## 30. Attachments, links, and editing

The recommended initial attachment policy is:

- PDF, JPEG, and PNG only;
- at most three Attachments per Message;
- at most 10 MiB per Attachment;
- web links stored in a dedicated field rather than disguised as Files;
- extension, media signature, malware, active-content, and archive validation;
- quarantine until scanning succeeds;
- safe preview or download only through permissioned, expiring access;
- image and document metadata stripped from derived previews where appropriate;
- original preserved only under its Case tier and retention rule.

The Reporter may edit the user-visible initial narrative and remove an Attachment for up to two hours after submission or until substantive triage action begins, whichever occurs first. Every Version remains attributed in audit. After lock, users add a correction Message or request restriction; they do not delete evidence silently.

## 31. Retention, deletion, and legal hold boundary

The provisional product default is to retain the Case and Attachments for two years after closure, consistent with the current historical-service period.

- Financial, tax, safety, safeguarding, security, privacy, legal, or dispute records may require a different lawful period.
- A legal or safeguarding hold suspends deletion only through explicit authority and scope.
- Profile deletion does not erase records Kelp must retain, but it removes ordinary Account access and minimizes non-required data.
- A withdrawn or merged Case remains retained with its history.
- Derived previews, malware copies, and abandoned pre-submission uploads follow shorter operational deletion policies.
- The final jurisdictional retention and erasure schedule remains a later legal and accounting contract.

Case contents must not be persisted as the sole authoritative copy in browser local storage, analytics payloads, URL parameters, notification bodies, or ordinary logs.

## 32. Decision and resolution model

Initial Decision results are:

- `approved`;
- `partially_approved`;
- `declined`;
- `no_current_basis`;
- `information_provided`;
- `referred`;
- `out_of_scope`;
- `duplicate`;
- `withdrawn_without_decision`.

Initial Resolution results are:

- `fulfilled`;
- `partially_fulfilled`;
- `declined_and_explained`;
- `referred_with_scope`;
- `no_action_required`;
- `unable_to_complete`;
- `withdrawn`;
- `merged_into_primary`.

The user receives a plain-language explanation, completed and incomplete actions, applicable policy basis, next steps, and appeal or reopening route. Protected evidence and internal notes remain excluded.

## 33. Withdrawal, merge, correction, appeal, and reopening

### Withdrawal

The Reporter may withdraw an ordinary request before final Decision. Withdrawal does not require Kelp to stop a safety, fraud, legal, security, or public-interest review and does not delete history.

### Merge

Duplicate Cases may merge only after identity, Beneficiary, confidentiality, and access compatibility are checked. The merged Case preserves its ID, Reporter, Messages, Attachments, and link to the primary Case. Content is not exposed across incompatible audiences.

### Correction

Incorrect Case classification, Message audience, Decision, or Resolution is corrected by successor Version. A correction never impersonates an earlier actor or deletes prior state.

### Appeal

The recommended ordinary appeal window is 14 calendar days after Decision communication. Safety, security, privacy, legal rights, or newly discovered material evidence may use a later linked review when policy or law permits.

### Reopening

A Case may reopen for failed Action Order, material new evidence, procedural error, incorrect authority, or recurrence directly tied to the original matter. Unrelated issues create a linked new Case.

## 34. Visibility, privacy, and access logging

Every Case view evaluates:

- active Account or verified public-contact session;
- Role and Case Participant relationship;
- current Case Assignment;
- Confidentiality Tier and Message audience;
- Beneficiary and Guardian scope;
- Subject-response scope;
- restriction, recusal, suspension, and Case state;
- minimum data needed for the action.

Restricted Case access logs actor, Case, purpose, timestamp, fields or Attachment scope, and result. Export, download, preview, redaction, and sharing are separately logged.

The Subject does not receive the Reporter identity, other Cases, private evidence, staff Notes, payment details, or Guardian status merely because they are asked to respond.

## 35. Concurrency, idempotency, audit, automation, and notifications

### Concurrency and idempotency

Kelp must prevent:

- duplicate public or authenticated submission from creating unintended repeated actions;
- one Case receiving two active accountable owners without explicit collaboration roles;
- one Decision creating the same Action Order twice;
- one refund, transfer, suspension, restriction, correction, or reassignment executing twice;
- a merged Case exposing incompatible private content;
- an Attachment scan race granting unsafe access;
- an appeal and original action overwriting each other;
- a closed Case hiding a failed downstream action.

### Audit

Every Case transition records Case and Version IDs, actors, acting Roles, relationships, assignments, types, priority, confidentiality, Resource Links, Message audiences, Attachments, decisions, Action Orders, deadlines, reasons, evidence references, recusal, access logs, predecessor, authoritative server time, and audit-persistence result.

If required audit persistence fails, the submission, access grant, assignment, Message, Decision, Order, Resolution, appeal, merge, or correction is not successful.

### Automation

Automation may acknowledge, classify, translate, summarize, detect secrets, scan Files, suggest duplicates, calculate deadlines, and recommend routing. Human or otherwise explicitly authorized review remains required for adverse, financial, relationship, conduct, safety, privacy, legal, or irreversible Decisions.

### Notification Events

Phase 14 creates server-side events for at least:

- Case received and reference issued;
- priority or confidentiality changed;
- Case assigned or reassigned;
- information or Subject response requested;
- response or new Message available;
- deadline or next update approaching or missed;
- Decision posted;
- Action Order approved, executing, failed, reconciled, or completed;
- Case resolved, closed, withdrawn, merged, appealed, or reopened;
- restricted access or protective action applied.

Notification preference governs optional channels later. Restricted content is not copied into SMS, email subject lines, push previews, or untrusted analytics.

## 36. Recommended Phase 14 decisions

The following twelve recommendations are presented for product-owner approval.

### Recommendation 1: One typed Support Case system

**Recommended rule:** use one durable Support Case model for help, complaints, compliments, suggestions, refunds, transfers, relationship issues, incidents, conduct, safety, privacy, and accessibility, while keeping type, priority, confidentiality, and outcome separate.

**Why:** separate unconnected inboxes would duplicate evidence, lose history, and make consistent privacy and action tracking difficult.

### Recommendation 2: Verified contextual intake

**Recommended rule:** require authenticated intake for Account-specific work, derive selectable Resource Links from actual relationships, and permit limited public contact only without Account disclosure or mutation before verification.

**Why:** names, typed IDs, and public forms are not sufficient authority for educational or financial records.

### Recommendation 3: Cases authorize but never mutate

**Recommended rule:** make every approved remedy a typed, immutable Support Action Order executed idempotently by the owning Phase contract. Do not mark the Case fulfilled until required Orders succeed or reconcile.

**Why:** Support communication and domain mutation need different authority, validation, and failure recovery.

### Recommendation 4: Quality ownership with separated execution

**Recommended rule:** let Support triage and communicate, make the Quality Assistant accountable for applicable complaints, refunds, transfers, remediation, relationships, and quality matters, and require financial, academic, security, privacy, or Administrator capability for the actual specialized action.

**Why:** one person should not gain every mutation power merely because they own the conversation.

### Recommendation 5: Versioned lifecycle and response targets

**Recommended rule:** adopt the explicit Case and Action Order states, one accountable owner, next-update deadlines, and initial P0-P3 response targets of one staffed hour, four staffed hours, one business day, and three business days.

**Why:** users need a traceable promise of acknowledgment and updates without confusing response targets with automatic approval or guaranteed resolution.

### Recommendation 6: Confidentiality and procedural fairness

**Recommended rule:** separate Message audiences and Confidentiality Tiers, log restricted access, give a Subject a safe summary and response opportunity when appropriate, and permit documented disclosure limits for safety, child protection, privacy, security, and evidence preservation.

**Why:** fairness does not require exposing the Reporter, private evidence, Guardian status, or protected information.

### Recommendation 7: Explicit financial-request boundaries

**Recommended rule:** let refund, Credit Transfer, and expiration-remediation Cases gather context and authorize downstream Phase 10 or payment actions, but never move money or credits directly. Keep provisional refund deductions non-authoritative.

**Why:** the Case must not bypass Payer attribution, Lot eligibility, Holds, expiration, accounting, or legal review.

### Recommendation 8: Relationship and incident handoff

**Recommended rule:** route reassignment and relationship outcomes through Phase 6, attendance and technical outcomes through Phase 11, cancellation exceptions through Phase 12, and Tutor-money corrections through Phase 13. Preserve existing deadlines and correction authority.

**Why:** Support should coordinate cross-domain outcomes without becoming a second state machine for each domain.

### Recommendation 9: Safety escalation without automated findings

**Recommended rule:** create restricted P0 safeguarding and security routes, permit authorized temporary protective requests, warn that Kelp is not an emergency service, and prohibit automation from making final safety, conduct, or adverse decisions.

**Why:** urgent protection and evidentiary fairness both require controlled human authority.

### Recommendation 10: Safe evidence and provisional retention

**Recommended rule:** initially allow three PDF/JPEG/PNG Attachments per Message up to 10 MiB each, quarantine and scan them, provide a two-hour pre-triage edit window with retained Versions, and use a provisional two-year post-closure Case retention period subject to legal and accounting review.

**Why:** evidence must be useful without turning Support into an unrestricted upload channel or allowing silent deletion after action begins.

### Recommendation 11: Immutable withdrawal, merge, appeal, and reopening

**Recommended rule:** preserve withdrawn and merged Cases, use successor corrections, offer an ordinary 14-day appeal window, and reopen only for failed execution, new material evidence, procedural error, or a directly related recurrence.

**Why:** lifecycle flexibility should not erase allegations, decisions, actions, or access history.

### Recommendation 12: Least privilege, audit, and safe automation

**Recommended rule:** make every Case read and write server-authoritative and relationship-scoped; audit restricted access; keep sensitive content out of browser storage and notification previews; and limit automation to assistive triage, summarization, scanning, and routing.

**Why:** a Support system concentrates some of Kelp's most sensitive educational, financial, conduct, and child-related information.

## 37. Draft Phase 14 invariants

These invariants become authoritative only after Phase 14 approval:

1. A Support Case is not a refund, transfer, correction, reassignment, restriction, suspension, or payout.
2. A complaint is not a finding of misconduct.
3. A Case status never substitutes for an authoritative domain state.
4. One Case preserves one durable related matter and its complete Version history.
5. Case Type, Priority, Confidentiality Tier, Decision, and Resolution are separate dimensions.
6. Being named as Case Subject never proves fault.
7. Every Case records Reporter and Beneficiary separately when they differ.
8. A Guardian reporting for a child remains attributed as Guardian.
9. No Case action impersonates the Student.
10. Educational relationship alone never creates Case participation.
11. Account-specific Case action requires authenticated identity and authority whenever reasonably possible.
12. Limited public contact creates no Account disclosure or mutation before verification.
13. Public intake never confirms whether a named person has a Kelp Account.
14. Resource selection is derived from authorized relationships rather than arbitrary typed IDs.
15. Every submitted Case has a safe human reference and stable internal ID.
16. Case intake never requests raw payment credentials or passwords.
17. A Case may link exact resources without copying their authority.
18. Linked authoritative records remain owned by their original contracts.
19. One primary Case Type is always explicit after triage.
20. `other` never bypasses structured follow-up or authorization.
21. Priority never decides Case merit or remedy.
22. Confidentiality never derives solely from Case Type.
23. A high-priority request is not auto-approved.
24. Each active Case has one accountable owner.
25. Specialist assignments grant only their stated Case function.
26. Support may triage and communicate but cannot perform undelegated academic or privileged actions.
27. A Quality Assistant may decide only within organizational and Case scope.
28. A Mentor receives only necessary academic or continuity context.
29. A financial action requires financial capability and the owning money or credit contract.
30. Administrator access is not ordinary Case decision authority.
31. No person decides a Case in which they are conflicted.
32. Recusal preserves all prior access and assignment history.
33. A Case about its ordinary owner is reassigned before substantive decision.
34. A Reporter-visible Message and Internal Note are distinct audience records.
35. A Message audience cannot be relabeled silently after posting.
36. A participant sees only the Message and Attachment audiences they are authorized to access.
37. Email, SMS, or guessed Case reference never grants Case access.
38. A complaint remains an allegation until an authorized Decision.
39. A Subject receives a safe response opportunity when disclosure is appropriate.
40. Reporter identity is not disclosed merely because a Subject responds.
41. Safety, child protection, privacy, security, legal duty, or evidence risk may justify limited disclosure.
42. Disclosure limitation requires authority, reason, and review.
43. Guardian educational visibility does not create automatic access to every child Case.
44. Restricted Guardian visibility requires an authorized safety, privacy, or legal reason.
45. Kelp never promises absolute secrecy it may lawfully be unable to keep.
46. Case lifecycle changes are append-only.
47. `closed` never means deleted.
48. `withdrawn` preserves history.
49. `merged` preserves the secondary Case ID and content.
50. Merge never exposes content across incompatible audiences.
51. Triage records type, priority, confidentiality, scope, deadline, conflicts, owner, and next update.
52. Automated triage never makes final adverse, financial, safety, relationship, privacy, or misconduct Decisions.
53. P0 creates immediate automated alert and a human target within one staffed service hour.
54. P1 targets initial response within four staffed service hours.
55. P2 targets initial response within one business day.
56. P3 targets initial response within three business days.
57. Response targets are not guaranteed resolution times.
58. Missing a response target never auto-approves a remedy.
59. Every unresolved Case has a next-update deadline.
60. Priority changes preserve reason and history.
61. Kelp identifies that it is not an emergency service for P0 safety intake.
62. Restricted Case access requires an explicit Case assignment and least privilege.
63. Every restricted Case read is audited.
64. Resource Links preserve exact Class, Course, transaction, Lot, Assignment, payout, Post, or File Versions where applicable.
65. External evidence snapshots record source, permission, checksum, and acquisition time.
66. Staff never collect unrelated private evidence speculatively.
67. A Case Decision is separate from downstream execution.
68. Every mutating remedy uses a Support Action Order.
69. Every Action Order names one owning contract and idempotency key.
70. A proposed Action Order has no mutation authority.
71. A failed or unreconciled Action Order prevents a fulfilled Resolution for that required remedy.
72. One Decision cannot execute the same remedy twice.
73. A refund request does not move money.
74. A refund request alone does not restrict credits.
75. An authorized refund-review action may restrict only the exact affected quantity.
76. Refund review preserves original Payer, payment, Price Version, Lots, Charges, and Tutor compensation context.
77. Money refund and credit mutation remain separate reconciled actions.
78. Provisional 20%, 7%, processor-fee, and subscription-deduction formulas remain non-authoritative.
79. A Credit Transfer Case does not transfer credits.
80. Credit Transfer requires eligible purchased quantity and destination acceptance.
81. Promotional credits are not ordinarily transferable.
82. A completed transfer requires paired atomic Phase 10 entries.
83. Transfer preserves Payer attribution and expiration.
84. Guardian payment authority alone never grants unrestricted transfer authority.
85. Opening a generic Case never suspends expiration.
86. Expiration Suspension names exact Lots, reason, owner, review date, and ending conditions.
87. Expiration Suspension never revives already expired credits.
88. Tutor reassignment request never ends an Assignment automatically.
89. Phase 6 remains authoritative for reassignment and handoff.
90. A replacement Tutor never receives private Support Case content through reassignment.
91. Support reporting never recalculates attendance directly.
92. Phase 11's seven-day exception-report deadline remains authoritative.
93. A late report may inform safety, conduct, quality, or technical learning without automatically changing settled money.
94. Cancellation-exception Case never cancels the original Class before an authorized Phase 12 result.
95. Outcome correction uses the Phase 11 successor-Version authority.
96. Conduct review separates allegation, evidence, response, finding, remedy, and sanction.
97. Complaint count alone never proves misconduct.
98. P0 safeguarding uses restricted routing and authorized protective requests.
99. Automation never makes the final safety finding.
100. Independent Tutor platform, conduct, safety, content, and quality Cases remain in scope.
101. Independent Tutor private prices, payments, refunds, chargebacks, and payouts remain out of scope.
102. An out-of-scope private payment Decision never suppresses a connected safety or conduct Case.
103. Initial Case Attachments are PDF, JPEG, or PNG only.
104. One Message carries at most three Attachments.
105. One initial Attachment is at most 10 MiB.
106. Attachments remain quarantined until validation and malware scanning succeed.
107. File extension alone never establishes media safety.
108. Case File access uses permissioned expiring delivery.
109. The initial narrative and Attachment set may be edited for two hours or until substantive triage begins, whichever is earlier.
110. Every edited Version remains attributed in audit.
111. Locked evidence is corrected or restricted rather than silently deleted.
112. The provisional Case retention period is two years after closure.
113. Explicit legal or safeguarding hold may override ordinary deletion only within scope.
114. Profile deletion does not erase records Kelp must retain.
115. Browser local storage, URL parameters, analytics, notification previews, and ordinary logs never become the authoritative Case store.
116. Decision and Resolution are separate records.
117. Resolution identifies completed and incomplete Action Orders.
118. The user receives a plain-language outcome without protected internal evidence.
119. Ordinary appeal remains available for 14 calendar days after Decision communication.
120. Appeal never erases or suspends the original Decision automatically.
121. Failed execution, material new evidence, procedural error, or directly related recurrence may reopen a Case.
122. Unrelated issues create a linked new Case.
123. Every Case read and write is server-authoritative and relationship-scoped.
124. Students and Guardians never receive Tutor payout, staff, or unrelated financial data through a Case.
125. Tutors never receive unrelated Student, Guardian, Payer, or Case data through a response request.
126. Duplicate submission never duplicates downstream action.
127. One Case cannot have two unqualified active accountable owners.
128. Attachment scan races never grant unsafe access.
129. Closed Case state never hides a failed required Action Order.
130. Corrections create successor Versions and never impersonate earlier actors.
131. Required audit persistence is part of every Case transition.
132. Failed required audit persistence prevents the transition from succeeding.
133. Sensitive Case content never appears in SMS, email subject lines, push previews, or untrusted analytics.
134. Notification delivery never replaces the in-product Case and audit record.
135. Automation remains assistive and never receives unbounded Support authority.
136. Independent Tutor payment scope, Group Course pricing, legal remedies, and jurisdictional retention remain explicitly deferred.

## 38. Relationship to existing implementation

The repository does not yet implement the Phase 14 authority model. A contact form, Forum Post, email address, local-storage message, modal, dashboard badge, or hard-coded support fixture is not a Support Case system.

Later architecture must implement:

- server-authoritative Case identity and relationships;
- typed intake, priority, confidentiality, and Resource Links;
- least-privilege Case assignments and Message audiences;
- evidence scanning and permissioned storage;
- immutable Decisions, Action Orders, Resolutions, appeals, and corrections;
- downstream idempotency and reconciliation;
- restricted access logging, retention, and safe notifications.

Phase 14 does not authorize creating Case tables, wiring email or Twilio, configuring storage or scanners, running Docker, changing Supabase, executing refunds or transfers, or modifying the frontend.

## 39. Approval request and later-phase handoff

Phase 14 remains a draft until the product owner approves, modifies, or rejects the twelve recommendations in section 36.

After approval, the canonical glossary should receive the finalized Phase 14 concepts and cumulative invariants. Later Tutor conduct, safeguarding, financial execution, privacy, retention, notification, availability, Lesson Request, and frontend contracts must consume this Case authority without turning user messages, support-agent access, or automated triage into unrestricted product mutation.

No database, API, RLS, Docker, Supabase, Stripe, Twilio, refund, transfer, restriction, or frontend implementation is authorized by this draft.
