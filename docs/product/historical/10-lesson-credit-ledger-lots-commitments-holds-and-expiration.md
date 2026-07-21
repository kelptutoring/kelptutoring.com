# Phase 10: Lesson Credit ledger, lots, commitments, holds, and expiration

**Contract phase:** 10 of 54  
**Status:** Final approved contract  
**Last updated:** 2026-07-20  
**Depends on:** canonical glossary and approved Phases 2-9  
**Applies to:** Student Lesson Credit Accounts, Credit Lots, credit acquisition, manual packages, recurring exact-shortfall funding, promotional credits, spendable capacity, Class commitments, six-hour holds, charges, releases, reversals, expiration, freezes, transfers, refunds, administrative adjustments, reconciliation, and credit visibility

## 1. Purpose

This contract defines how Kelp records, reserves, holds, charges, expires, restores, transfers, and displays integer Lesson Credits.

It separates eight questions that must never be collapsed:

1. **How many credits were acquired, from which source, and for what money amount?**
2. **Which Credit Lots remain eligible at a proposed Class time?**
3. **Which credits are already committed or held for other Classes?**
4. **Has a Class merely been scheduled, entered the Hold Window, or reached a final financial outcome?**
5. **Has expiration passed, paused, or resumed?**
6. **Is an adjustment changing credits, money, or both?**
7. **Who owns the credits, who paid, and who may receive a refund?**
8. **Did the authoritative ledger transition succeed exactly once?**

A displayed balance is not a ledger. A payment callback is not a Credit Lot. A Scheduled Class is not a Credit Charge. A Credit Hold is not Tutor compensation. A refund request is not a completed refund.

## 2. Contract authority and approval record

The canonical glossary and approved Phases 2-9 remain authoritative. In particular, Phase 10 preserves:

- integer Lesson Credits as booking units rather than money;
- Account-wide Student ownership rather than Tutor- or Classroom-specific ownership;
- 10, 20, and 30-credit full charges for 30-, 60-, and 90-minute Classes;
- 5, 10, and 15-credit Student no-show charges;
- Projected Meetings as non-financial planning records;
- accepted future Classes as commitments rather than final charges;
- the six-hour Credit Hold boundary;
- no negative Student credit balance;
- exact-shortfall recurring Automatic Top-ups under active Payer Authorization;
- promotional-first spending and then earliest-expiration ordering;
- the two-month no-show Subscription Freeze and expiration preservation;
- Kelp-managed versus Independent Tutor financial separation;
- server-authoritative, effective-dated, append-only decisions.

The product owner approved all twelve Phase 10 recommendations on 2026-07-20. The settled rules, approved rules, ledger model, lifecycle boundaries, prices, decision chain, and Phase 10 invariants in this document are authoritative. Items explicitly marked **Deferred** remain assigned to later contracts.

## 3. Settled baseline from earlier phases

The following rules are already settled and are not reopened here:

1. Lesson Credits are integers.
2. A 30-minute Kelp-billed Class costs 10 credits when fully charged.
3. A 60-minute Kelp-billed Class costs 20 credits when fully charged.
4. A 90-minute Kelp-billed Class costs 30 credits when fully charged.
5. A Student no-show charge is 50%: 5, 10, or 15 credits.
6. Lesson Credits belong Account-wide to the Student beneficiary.
7. Credits do not belong to a Tutor, Course, Classroom, Guardian, or payment method.
8. Ending or changing a Tutor relationship does not erase Student credits.
9. Credits cannot fund platform fees.
10. Credits cannot fund Independent Tutor Classes.
11. Existing eligible credits fund a recurring commitment before an Automatic Top-up.
12. An Automatic Top-up purchases only the exact recurring shortfall.
13. A larger package is a separate manual purchase.
14. A failed Automatic Top-up is retried once; if both attempts fail, no Class is booked.
15. Accepted future Classes reduce spendable capacity through a Credit Commitment but do not immediately create a final Credit Charge.
16. The stricter Credit Hold begins six hours before an eligible persisted Class.
17. A displayed raw balance is insufficient to determine booking eligibility.
18. Spendable capacity accounts for expiration at the proposed Class time, prior commitments, holds, and restrictions.
19. Promotional credits expire after one month and are spent before purchased credits.
20. Recurring-funded credits expire after 12 months.
21. Settled Standalone package examples use 40 credits for one month, 80 for two months, 120 for three months, and the same 40-credit-per-month pattern thereafter.
22. Otherwise eligible lots are consumed by earliest expiration.
23. Credit balances cannot become negative.
24. A Tutor no-show releases Student credits.
25. An approved Kelp service outage does not automatically charge the Student.
26. A settlement exception may remain pending for up to 14 days.
27. If no one reports an applicable outside-Kelp or outage issue during the reporting period, the normal financial workflow proceeds.
28. The no-show Subscription Freeze pauses Credit Lot expiration for up to two months and preserves remaining lifetime.
29. Credits may be transferred only through an approved request.
30. Refunds, reversals, and administrative adjustments require Support or authorized staff workflows.
31. The browser never directly grants credits after a payment.
32. Stripe invoices and receipts are money records and do not replace the Lesson Credit ledger.

## 4. Scope

### Included

Phase 10 defines:

- one Student Credit Account and its derived balances;
- immutable Credit Lots and append-only Credit Ledger Entries;
- acquisition sources and money snapshots;
- recurring, Standalone, manual-package, promotion, transfer, reversal, and adjustment Lots;
- current individual recurring and Standalone money-to-credit calculations;
- manual package quantity and expiration structure;
- expiration instants and timezone snapshots;
- deterministic Lot allocation order;
- Credit Commitments, Credit Holds, Credit Charges, releases, and reversals;
- commercial-capacity calculation for a proposed Class;
- financial effects consumed from authoritative Class outcomes;
- rescheduling and duration-change reallocation;
- no-show freeze and Case-specific Expiration Suspension;
- support-reviewed transfers;
- credit-side refund and administrative-adjustment mechanics;
- visibility, privacy, Notification Events, concurrency, idempotency, audit, and reconciliation.

### Deferred

Phase 10 does not define:

- Stripe Checkout, Billing, Connect, webhook, tax, invoice, receipt, or refund APIs;
- exact database tables, RLS policies, RPCs, APIs, queues, jobs, or frontend pages;
- processor-fee deductions, taxes, statutory refund rights, or the provisional 20% and 7% refund deductions;
- payment disputes, chargeback evidence, collections, or Tutor recovery implementation;
- Tutor accrual, commission, settlement hold, payout, or promotional compensation posting;
- the Phase 11 attendance detector, Presence Intervals, Classroom forms, and Authoritative Class Outcome state machine, which remain outside Phase 10 but now provide its settlement input;
- late cancellation and rescheduling entitlement decisions;
- Lesson Request acceptance, expiry, competing requests, or Tutor decision workflow;
- Group Course price, per-member Lesson Credit quantity, cohort discounts, scholarships, or revenue allocation;
- Independent Tutor private Student billing;
- exact promotion-campaign eligibility and marketing rules;
- jurisdiction-specific stored-value, gift-card, escheatment, money-transmission, accounting, or tax treatment;
- final retention and deletion periods for financial records;
- notification delivery through Stripe, email, Twilio SMS, push, or another provider.

## 5. Phase 10 concepts

### Student Credit Account

The one Account-wide Lesson Credit ledger owned by a Student beneficiary. It aggregates Credit Lots and their entries but is not a mutable balance column, bank account, wallet of money, or Course-specific entitlement.

### Credit Ledger Entry

An immutable, signed, reasoned posting affecting one Student Credit Account and, where applicable, one Credit Lot, Credit Commitment, Credit Hold, Credit Charge, transfer, refund, or adjustment. Corrections use compensating entries rather than edits.

### Credit Lot

A separately traceable group of Lesson Credits acquired through one purchase, Automatic Top-up, promotion, transfer, reversal, or administrative adjustment. It pins source, original quantity, remaining quantity derivation, money basis where applicable, effective instant, expiration instant, beneficiary, payer attribution, and history.

### Lot Source

The canonical reason a Credit Lot exists. Initial values are `recurring_top_up`, `standalone_class_purchase`, `manual_package`, `promotion`, `transfer_in`, `charge_reversal`, and `administrative_grant`.

### Credit Allocation

The immutable link reserving a specific quantity from a specific Credit Lot for one Credit Commitment or Hold. The allocation pins the deterministic spending order used when the commitment was created.

### Posted credit quantity

The sum of effective Credit Ledger Entries for the Student Credit Account before commitments, holds, future expiration, or restrictions are applied.

### Available credit quantity

The unexpired, unrestricted, unallocated quantity currently available across eligible Credit Lots.

### Spendable credit capacity

The quantity eligible for one proposed Class at its scheduled start instant after applying Lot expiration, source restrictions, prior allocations, Holds, account restrictions, and the Class's financial model.

### Credit Commitment

The reservation created for one accepted future Kelp-billed Class. It owns one or more Lot allocations, reduces capacity for later bookings, and is not a final charge.

### Credit Hold

The stricter state applied to the commitment at the start of the six-hour Hold Window. It preserves the allocated Lot quantities until the Class receives an authoritative financial outcome.

### Credit Charge

The final Lesson Credit deduction created from an authoritative Class financial outcome. It consumes some or all held allocations exactly once.

### Credit Release

The append-only event returning an uncharged committed or held quantity to its originating Lot after a valid cancellation, reduced charge, Tutor no-show, approved outage, service transition, or other authorized result.

### Credit Reversal

The compensating event undoing all or part of a prior Credit Charge after an authorized review. It links to the original Charge and normally restores quantity into a traceable successor Lot rather than editing the consumed Lot.

### Expiration Suspension

An effective-dated pause preserving the remaining lifetime of one or more eligible Credit Lots during the settled no-show Subscription Freeze or an authorized Support remediation. It never revives a Lot that expired before the suspension began.

### Credit Transfer

The authorized movement of unused eligible purchased credits from one Student Credit Account to another through linked `transfer_out` and `transfer_in` entries. It preserves source, money basis, payer attribution, and expiration rather than creating fresh lifetime.

### Credit Refund Allocation

The traceable association between a money refund and the exact unspent or reversed Credit Lot quantity removed because of that refund. It uses original purchase attribution rather than the current catalog price.

### Credit Restriction

A scoped, reasoned block preventing some or all Credit Lots from funding new commitments without deleting quantity or history. A restriction may arise from payment review, fraud, chargeback, legal obligation, or Support action.

### Credit Reconciliation Case

The operational record used when payment, Credit Lot, commitment, charge, refund, transfer, or external-provider states disagree. It has an owner, safe default, evidence, retry history, and resolution entries.

## 6. Approved boundaries consumed by Phase 10

Phase 10 must not use a credit quantity or ledger state as a substitute for:

- Student Platform Access Subscription;
- Course Service Arrangement;
- Course, Classroom, Role, Membership, or Tutor Assignment;
- Tutor Qualification or Operationally Enabled Scope;
- Tutor Availability or Class conflict validation;
- Lesson Request acceptance;
- Class scheduling or revision authority;
- attendance, no-show, cancellation, outage, or incident authority;
- Tutor compensation or payout;
- money payment, invoice, receipt, or refund completion.

Credits answer whether Kelp-billed tutoring capacity exists. They do not grant educational, scheduling, or payment authority on their own.

## 7. Approved ledger model

```mermaid
flowchart TD
    payment["Authoritative payment or grant"] --> lot["Credit Lot"]
    lot --> entry["Append-only Ledger Entries"]
    lot --> allocation["Credit Allocation"]
    class["Accepted Kelp-billed Class"] --> commitment["Credit Commitment"]
    allocation --> commitment
    commitment --> hold["Six-hour Credit Hold"]
    outcome["Authoritative Class financial outcome"] --> settlement{"Settle"}
    hold --> settlement
    settlement --> charge["Credit Charge"]
    settlement --> release["Credit Release"]
    charge --> reversal["Authorized Credit Reversal"]
    lot --> expiration["Expiration or Suspension"]
    discrepancy["Provider or ledger mismatch"] --> reconciliation["Credit Reconciliation Case"]
```

The diagram is conceptual. Database object names remain deferred.

## 8. Student Credit Account and derived balances

Kelp should create at most one Student Credit Account per Student Account.

The authoritative quantities are derived from effective ledger records:

```text
posted quantity = sum of effective signed Credit Ledger Entries

available now = unexpired and unrestricted Lot quantity
                - active allocations, whether committed or held

spendable for Class C = Lot quantity eligible at C.scheduled_start
                        - allocations for other Classes
                        - applicable restrictions
```

The following user-facing values may be cached for performance but must reconcile to the ledger:

- available now;
- committed for future Classes;
- currently held;
- expiring within 30 days;
- restricted;
- expired historically;
- total required for the proposed Class;
- shortfall requiring purchase.

No cached or Profile-level balance may be used as financial authority without revalidation.

## 9. Credit Ledger Entry requirements

Every entry records at least:

- stable entry ID;
- Student Credit Account;
- Credit Lot when applicable;
- signed integer quantity;
- canonical entry type;
- effective instant and recorded instant;
- source event and idempotency key;
- actor or system authority;
- reason code;
- related payment, Class, commitment, hold, charge, transfer, refund, Case, or adjustment;
- predecessor or compensating entry when correcting;
- audit metadata.

Initial entry types should include:

- `lot_issued`;
- `commitment_allocated`;
- `commitment_released`;
- `hold_started`;
- `charge_posted`;
- `charge_reversed`;
- `lot_expired`;
- `expiration_suspended`;
- `expiration_resumed`;
- `transfer_out`;
- `transfer_in`;
- `refund_removed`;
- `administrative_grant`;
- `administrative_removal`;
- `restriction_started`;
- `restriction_ended`.

Allocation and state entries may use zero signed quantity when the economic quantity remains owned by the Lot. The architecture must not double-subtract merely because commitment and hold lifecycle events are audited.

## 10. Credit Lot requirements

Every Credit Lot pins:

- Lot ID and Student beneficiary;
- Lot Source and source Version;
- original integer quantity;
- currency and original money amount in minor units when purchased;
- tax and processor references when later available;
- Payer and Payer Authorization when applicable;
- acquisition and effective instants;
- Student timezone snapshot used for expiration;
- expiration policy Version and calculated expiration instant;
- promotion or package Version where applicable;
- source payment or predecessor Lot;
- transfer and refund lineage;
- restriction and Expiration Suspension history;
- audit timestamps.

The Lot's remaining amount is derived from issuance, Charge, expiration, transfer, refund, and compensating entries. It is not edited directly.

## 11. Settled individual price and quantity Versions

The current approved individual mapping is:

| Service price Version | Credits per 30 minutes | Money per 30 minutes | Money per credit in this Version |
| --- | ---: | ---: | ---: |
| Recurring tutoring | 10 | USD 20 | USD 2.00 |
| Standalone tutoring | 10 | USD 25 | USD 2.50 |

Therefore:

| Service | 30 minutes | 60 minutes | 90 minutes |
| --- | ---: | ---: | ---: |
| Recurring credits | 10 | 20 | 30 |
| Recurring price | USD 20 | USD 40 | USD 60 |
| Standalone credits | 10 | 20 | 30 |
| Standalone price | USD 25 | USD 50 | USD 75 |

The current Versions are linear, so an exact shortfall may use the pinned per-credit amount. This does not create one timeless universal conversion rate. Every Lot stores the actual price Version and money basis accepted at acquisition.

## 12. Credit acquisition paths

Credits may enter a Student Credit Account only through an authorized path:

1. **Recurring Automatic Top-up:** exact shortfall at the pinned recurring price.
2. **Standalone Class-specific purchase:** Student- or Guardian-confirmed exact shortfall for one proposed Standalone Class.
3. **Manual package purchase:** a separately selected package from the active catalog.
4. **Promotion:** a zero-price or discounted Lot issued under a Promotion Version.
5. **Transfer in:** unused eligible credits moved through an approved Support request.
6. **Charge reversal:** credits restored after an authorized reversal.
7. **Administrative grant:** explicit adjustment by an authorized actor.

Each path must create its source money or grant record and Credit Lot atomically, or enter reconciliation without granting spendable capacity.

## 13. Manual package structure and expiration

The user's settled Standalone package pattern is 40 credits per month of lifetime:

| Package quantity | Lifetime |
| ---: | ---: |
| 40 credits | 1 calendar month |
| 80 credits | 2 calendar months |
| 120 credits | 3 calendar months |
| 40 x N credits | N calendar months |

The approved rule caps `N` at 12, producing a maximum ordinary package of 480 credits with 12 months of lifetime. The active catalog may offer a subset of those multiples and does not need to expose every possible value.

Package price uses the pinned Standalone price Version unless a separately approved discount Version applies. The Lot stores the actual money amount rather than reconstructing it later.

## 14. Expiration instant calculation

The approved rule uses calendar-month expiration in the Student's confirmed IANA timezone snapshotted at acquisition:

```text
expires_at = acquired_at shifted by the Lot policy's calendar-month count
             in the snapshotted timezone
```

The expiration retains the same local wall-clock time when possible. If the target month lacks that calendar day, use the final valid day of that month at the same local time. Ambiguous or nonexistent daylight-saving times use the timezone library's documented deterministic rule and store the resulting UTC instant.

Later Student timezone changes do not rewrite existing Lot expiration instants.

## 15. Recurring Automatic Top-up Lots

An Automatic Top-up Lot:

- is created only after authoritative server-side payment success;
- buys the exact shortfall for one otherwise eligible recurring Class commitment;
- uses the pinned recurring price Version;
- may contain any positive integer credit quantity required by the shortfall;
- expires after 12 calendar months;
- is allocated immediately to the intended commitment;
- cannot be duplicated by a repeated webhook or materialization retry;
- remains an ordinary purchased Lot if the commitment is later validly released.

If payment succeeds but Lot creation or commitment allocation fails, the event enters reconciliation. Kelp must not charge again automatically or pretend the Class was booked.

## 16. Standalone Class-specific funding

For an on-demand or Extra Class, the approved rule offers two explicit manual choices when capacity is insufficient:

1. purchase exactly the proposed Class shortfall at the pinned Standalone price Version; or
2. buy a larger manual package and then allocate the required credits.

A Class-specific exact-shortfall purchase requires active confirmation and is not an Automatic Top-up. Its Lot pins a one-calendar-month expiration at acquisition. That expiration governs any quantity later released from the intended commitment.

Payment success, Lot issuance, and Class Commitment creation must be one recoverable workflow. A failed payment creates no Class booking.

## 17. Promotional Credit Lots

Every promotional Lot records:

- Promotion Version;
- eligibility decision and actor or campaign;
- original quantity;
- zero or discounted money basis;
- acquisition instant;
- one-calendar-month expiration;
- usage restrictions, if any;
- transfer and refund prohibition by default.

Promotional credits are allocated before purchased credits, as already settled. Within promotional Lots, the earliest expiration is used first.

The Tutor compensation contract must calculate Tutor money independently from whether the Student Charge consumed promotional or purchased credits.

## 18. Deterministic allocation order

For one proposed individual Kelp-billed Class, Kelp allocates eligible Lots in this order:

1. promotional Lots, earliest expiration first;
2. purchased, transferred, reversed, or administratively granted Lots, earliest expiration first;
3. stable Lot ID as the final tie-breaker.

Only Lots valid at the proposed Class scheduled start instant are eligible. A Lot that expires before that instant cannot support the Class even if it is available when the request is submitted.

Allocations are pinned when the Credit Commitment succeeds. A later Lot acquisition does not silently reshuffle an existing commitment. Released quantity returns to the originating Lot with its original expiration and history.

## 19. Spendable capacity calculation

For one proposed Class, the server calculates:

1. the full required quantity from the pinned duration and financial Version;
2. the Student Credit Account and Course financial model;
3. Lots valid at the Class scheduled start instant;
4. promotional-first and earliest-expiration ordering;
5. quantity already allocated to other commitments or Holds;
6. Credit Restrictions and Expiration Suspensions;
7. exact remaining shortfall;
8. applicable recurring or Standalone price for that shortfall;
9. active Payer Authorization and Funding Cycle limit where automatic funding is requested.

The result contains separate integer values for:

- required;
- available from existing Lots;
- shortfall;
- quantity to allocate by Lot;
- money purchase required, if any;
- blocker codes.

The calculation is advisory until the same values are revalidated inside the atomic commitment transaction.

## 20. Credit Commitment lifecycle

Approved states are:

| State | Meaning |
| --- | --- |
| `funding_required` | The Class is otherwise eligible but lacks confirmed credits |
| `committed` | Required quantity is allocated to the accepted future Class |
| `held` | The six-hour Hold Window has begun |
| `settlement_pending` | The Class awaits an authoritative financial outcome or exception review |
| `charged` | The final Credit Charge posted |
| `partially_charged` | A reduced Charge posted and the remainder released |
| `released` | No final Charge posted and all allocation was released or expired |
| `reversed` | A prior final Charge was compensated by an authorized reversal |
| `cancelled_before_commitment` | Funding or acceptance failed and no allocation became active |

A Kelp-billed Class is not successfully booked until its required Credit Commitment exists. A `funding_required` record may support UI recovery but grants no seat, time, or Classroom access by itself.

Every Commitment pins:

- Student, Course, Class, and Tutor Assignment;
- scheduled start and duration Version;
- required credit quantity;
- price and service Versions;
- Lot allocations;
- commitment and Hold instants;
- predecessor when revised;
- idempotency key;
- lifecycle and audit history.

## 21. Six-hour Credit Hold

At `scheduled_start - 6 hours`, an eligible committed Class transitions to Hold after revalidation.

The transition:

- is server-generated and idempotent;
- keeps the same pinned Lot allocations;
- prevents transfer, refund, expiration, or unrelated reallocation of held quantity;
- does not create a final Charge;
- does not pay the Tutor;
- records the expected full and no-show quantities;
- remains linked through settlement or authorized release.

If a Lot was valid at the scheduled Class start when committed and the Class begins before that Lot's expiration instant, the held allocation remains chargeable even when final settlement occurs later. Expiration applies to unallocated quantity and released quantity, not to a validly consumed Class outcome.

## 22. Authoritative Class financial outcome input

Phase 10 does not infer attendance from browser presence. It consumes the server-authoritative Class financial output in the current Phase 11 Authoritative Class Outcome Version, plus any later valid cancellation outcome.

The outcome must identify:

- Class and current revision;
- scheduled duration;
- outcome type;
- full, reduced, or zero credit quantity;
- attendance or incident evidence references;
- decision actor and authority;
- effective and recorded instants;
- pending-review deadline where applicable;
- correction predecessor;
- audit state.

The initial settled mapping is:

| Authoritative outcome | Student Credit Charge | Release |
| --- | ---: | ---: |
| Completed or valid early completion | Full: 10, 20, or 30 | 0 |
| Student no-show | Half: 5, 10, or 15 | Remaining half |
| Tutor no-show | 0 | Full commitment |
| Mutual absence | 0 | Full commitment |
| Student early departure | Full: 10, 20, or 30 | 0 |
| Tutor early departure | No final Charge yet | No release until resolution |
| Approved Kelp outage preventing service | 0 | Full commitment after decision |
| Valid cancellation with zero-charge outcome | 0 | Full commitment |
| Reduced-charge policy outcome | Explicit approved quantity | Remainder |
| Settlement pending | No final Charge yet | No release until resolution |

Phase 11 decides whether an early ending, disconnection pattern, outside-Kelp claim, no-show, outage, or attendance exception qualifies for one of these outcomes. The later cancellation contract supplies valid cancellation outcomes. Phase 10 posts only the quantity supplied by the current valid outcome Version.

## 23. Partial charge and release ordering

When the final Charge is smaller than the Commitment:

1. consume allocated Lots in the same order pinned by the Commitment;
2. post the Credit Charge for the approved quantity;
3. release the remaining allocated quantity to its originating Lots;
4. immediately expire any released quantity whose Lot expiration instant already passed and is not suspended;
5. close the Commitment atomically.

For a 60-minute Student no-show, for example, a 20-credit Commitment becomes a 10-credit Charge and a 10-credit release.

## 24. Settlement-pending exceptions

An outside-Kelp meeting claim, Kelp service-outage claim, or another approved exception may hold settlement pending for up to 14 days.

During that state:

- the held quantity remains unavailable for other bookings;
- no Tutor credit or money conclusion is inferred from the Student ledger;
- either party has the settled seven-day reporting window;
- an assigned reviewer sees the deadline and evidence;
- a reviewed zero-charge outcome releases the hold;
- a reviewed or unreported normal-charge outcome posts the applicable Charge;
- the same pending event cannot settle twice.

If the deadline passes without the report required to prevent normal settlement, the normal Class outcome becomes eligible for posting through an idempotent job. A later correction requires a Credit Reversal rather than deletion.

## 25. Cancellation, service transition, and relationship release

A pending Lesson Request creates no Credit Commitment.

An accepted future Class cancelled with a zero-charge outcome releases its Commitment or Hold according to the authoritative cancellation result. Existing settled zero-consequence cases include:

- Course termination;
- Tutor reassignment of outgoing-Tutor future Classes;
- Group formation failure before Course activation;
- eligible Phase 9 service transition outside the Hold Window;
- Tutor no-show;
- approved Kelp outage.

Release does not reset Lot expiration, change Payer attribution, create a refund, or grant a late-change entitlement. Those are separate records.

## 26. Rescheduling and duration changes

Outside the Hold Window, a Class time or duration change requires commercial revalidation against the successor scheduled start and duration.

The approved architecture should:

1. calculate the successor required quantity and eligible Lots;
2. preserve the old Commitment until the scheduling change is otherwise valid;
3. atomically release or supersede the old allocation and create the successor Commitment;
4. purchase an authorized shortfall only after the successor Class is otherwise eligible;
5. retain both Commitment Versions and the Class revision link.

If successor funding fails, the change does not become financially complete. The scheduling contract determines whether the old Class remains active or the request fails, but Phase 10 never leaves both old and new Commitments active.

Inside the six-hour Hold Window, duration cannot change under Phase 4. A permitted time change or cancellation must supply an explicit financial outcome rather than silently reallocating held credits.

## 27. Credit expiration lifecycle

At a Lot's expiration instant, Kelp posts an idempotent `lot_expired` entry for the quantity that is:

- not already charged;
- not transferred or refunded;
- not actively allocated to a Class beginning while the Lot was valid;
- not protected by an active Expiration Suspension.

Expired credits:

- are not spendable;
- do not disappear from history;
- cannot be transferred;
- do not become money;
- are not ordinarily refundable;
- remain visible in audit and permitted transaction history.

If a commitment is later released after its Lot has expired, that released quantity expires immediately unless an active suspension protects it.

Expiration jobs never mutate the original Lot or delete entries. They append the exact expired quantity once.

A Credit Reversal reconstructs the original consumed Lot allocation through one or more successor Lots with the original source, money basis, and expiration instant. If that instant already passed, the restored quantity expires immediately unless an Expiration Suspension tied to the timely review protected its remaining lifetime. A separately approved administrative grant may remedy a Kelp-caused delay but must not be hidden inside the reversal.

## 28. No-show Subscription Freeze expiration behavior

At the Phase 9 freeze start, Kelp snapshots each eligible Lot's remaining lifetime:

```text
remaining_lifetime = expires_at - freeze_started_at
```

During the maximum two-month freeze:

- expiration jobs skip protected quantity;
- new recurring Automatic Top-ups do not occur;
- existing Lot source and money basis do not change;
- cancelled future recurring Commitments release to the frozen Lots;
- a Lot already expired before freeze start is not revived.

At reactivation or automatic on-demand downgrade:

```text
new_expires_at = freeze_ended_at + remaining_lifetime
```

The new expiration instant and predecessor are recorded. Repeated retries cannot extend lifetime twice.

## 29. Case-specific Expiration Suspension

The product owner has allowed Kelp to preserve credit lifetime when a Tutor relationship ends because something materially went wrong and Kelp is arranging a replacement.

The approved rule uses a Support- or Quality-Assistant-approved Expiration Suspension that:

- identifies the affected Lots and Student;
- links the Tutor relationship or service Case;
- records reason, evidence, start, review date, and responsible owner;
- preserves remaining lifetime rather than assigning a generic new expiration;
- ends when the replacement Tutor activates, the Student chooses another service outcome, or the Case closes;
- receives mandatory review at least every 90 days;
- may continue through a Kelp-caused delay only through a new attributed review event;
- never revives credits already expired before Case opening.

Opening a generic Support Case does not automatically suspend expiration.

## 30. Credit Transfer workflow

A Credit Transfer requires an approved Support request and may move only quantity that is:

- purchased rather than promotional;
- unexpired;
- unrestricted;
- uncommitted and unheld;
- not already included in a refund or dispute;
- permitted by applicable terms and law.

The transfer records:

- source and destination Student Credit Accounts;
- requester and authority;
- source Lot allocations;
- quantity;
- original Payer and money basis;
- unchanged expiration instant;
- reason and Support Case;
- reviewer and decision;
- paired idempotency key;
- linked `transfer_out` and `transfer_in` entries.

The destination receives successor Lots linked to the source Lots. A transfer never resets expiration or invents a current-price money basis. If one side of the atomic transfer fails, neither side is considered complete and the event enters reconciliation.

## 31. Credit refunds and reversals

A money refund and a credit mutation are separate but coordinated records.

The credit-side workflow should:

1. identify the original payment and Credit Lots;
2. identify unspent, uncommitted quantity eligible for removal;
3. calculate money using the original purchase allocation, not current prices;
4. restrict the exact pending refund quantity against new commitments, transfers, and expiration processing;
5. create the pending provider-refund instruction;
6. remove the exact refunded quantity only when the refund reaches its authoritative state;
7. release the restriction if the provider refund fails authoritatively;
8. link Credit Refund Allocations to the money refund;
9. reconcile any partial failure.

Spent credits require an authorized Credit Charge Reversal before they can become refundable. Promotional credits have no ordinary cash refund value. Transferred credits preserve original Payer attribution, so any later money refund route must identify the original Payer and destination-Lot consequence.

Processor fees, percentage deductions, taxes, consumer-law exceptions, and the provisional 20% and 7% figures remain deferred until accounting and legal review.

## 32. Administrative adjustments and corrections

Authorized staff may create:

- a positive administrative grant;
- a negative removal limited to available quantity;
- a Charge Reversal;
- a Credit Restriction;
- a correction through compensating entries.

Every adjustment requires:

- capability and scoped authority;
- Student and affected Lots;
- integer quantity;
- reason code and explanation;
- Support or reconciliation Case when applicable;
- evidence references;
- second review for high-risk or large adjustments under a later threshold contract;
- immutable actor, time, and predecessor.

No actor edits, deletes, or backdates an existing financial record to make the result look original.

## 33. Negative-balance prevention and payment disputes

No Credit Ledger transition may reduce posted or available Lesson Credits below zero.

If a payment dispute or chargeback occurs after the related credits were spent:

- Kelp does not create a negative Lesson Credit balance;
- historical Charges remain attributed;
- an external financial receivable, Account restriction, or Support Case records the unresolved money problem;
- new credit use may be restricted through explicit authority;
- later recovery or write-off does not rewrite the Student ledger history.

Tutor dispute-loss recovery remains a separate money-ledger contract.

## 34. Visibility and privacy

### Student

May see their available, committed, held, restricted, and expiring quantities; Lot source labels; expiration dates; Class allocations; and permitted purchase, transfer, refund, and adjustment history.

### Guardian and Payer

A verified Guardian may see the linked child's aggregate credit state needed to fund service. A Payer may see their own purchases, refunds, authorizations, and resulting Lot quantities. They do not see another Payer's payment method or private transaction details merely because both fund the same Student.

### Tutor and Mentor

An assigned Tutor sees whether a proposed Class is commercially ready or blocked and the required Class quantity, not the Student's full balance, Payer identity, payment method, unrelated purchases, or refund history. A Mentor receives only the scoped blocker information needed for continuity.

### Support, Quality Assistant, and Administrator

Visibility follows assigned Case and capability scope. High-risk correction access is audited and never permits impersonation or silent history rewriting.

### Independent Tutor

Independent Tutor Courses never expose or consume Kelp Lesson Credit information.

## 35. Concurrency, reconciliation, audit, and notifications

### Concurrency and idempotency

The server must prevent:

- duplicate Lots from one payment or webhook;
- two simultaneous commitments spending the same Lot quantity;
- expiration and commitment both consuming the same quantity;
- transfer and refund racing for the same quantity;
- a Hold settling twice;
- a Charge and full release both succeeding;
- a reschedule leaving old and new Commitments active;
- freeze resume extending expiration twice;
- a repeated reversal restoring credits twice;
- an administrative removal producing a negative balance.

### Reconciliation

Create a Credit Reconciliation Case when:

- payment succeeded but no Lot exists;
- a Lot exists without the expected payment or grant authority;
- payment and Lot amounts disagree;
- Lot issuance succeeded but intended commitment failed;
- a Charge lacks an authoritative Class outcome;
- provider refund and credit removal disagree;
- transfer sides disagree;
- cached balances differ from ledger derivation;
- a scheduled job partially failed.

Safe defaults block duplicate value and new spending of disputed quantity while preserving unaffected Course access where possible.

### Audit

Persist every price Version, Lot, entry, allocation, Commitment, Hold, Charge, release, expiration, suspension, transfer, refund allocation, restriction, adjustment, reconciliation action, actor, reason, effective instant, and predecessor.

Audit persistence is part of each state transition. If required audit fails, the credit acquisition, allocation, Hold, Charge, release, transfer, refund, adjustment, or reconciliation resolution is not considered successful.

### Notification Events

Create server-side events for at least:

- credits acquired;
- Automatic Top-up attempted, succeeded, or failed;
- manual purchase succeeded or failed;
- Commitment created, changed, or released;
- Hold started;
- full, partial, or zero Charge outcome posted;
- credits expiring in 30, 7, and 1 day;
- credits expired;
- Expiration Suspension started, reviewed, resumed, or ended;
- transfer requested, approved, declined, or completed;
- refund or reversal requested, pending, completed, or failed;
- administrative adjustment or restriction applied;
- reconciliation requires action.

Channel choice and critical-message exceptions belong to the later notification contract.

## 36. Approved Phase 10 decisions

The product owner approved all twelve decisions below on 2026-07-20.

### Decision 1: Ledger architecture

**Approved rule:** use one Student Credit Account backed by append-only Credit Ledger Entries and immutable Credit Lots. Derive balances and use compensating entries for corrections; never store the authoritative balance as a mutable Profile field.

**Why:** commitments, expiration, transfers, refunds, and simultaneous bookings cannot be explained safely by one editable number.

### Decision 2: Lot money attribution

**Approved rule:** pin the original Payer, currency, money amount, price Version, acquisition instant, source, and expiration policy to every purchased Lot. Never reconstruct historical money from the current catalog.

**Why:** recurring and Standalone credits have different prices, and prices can change later.

### Decision 3: Manual package formula

**Approved rule:** allow catalog packages in 40-credit multiples, grant one calendar month of lifetime per 40 credits, and cap ordinary manual packages at 480 credits and 12 months. The catalog may expose only a subset such as 40, 80, and 120 initially.

**Why:** this implements the approved 40/80/120 pattern without allowing unlimited liability through an unbounded "and so on."

### Decision 4: Expiration timestamp

**Approved rule:** calculate expiration by calendar months from acquisition in the Student's confirmed timezone snapshotted to the Lot. Preserve the resulting UTC instant even if the Student later changes timezone.

**Why:** this is deterministic across devices and daylight-saving changes and prevents timezone changes from extending credit life.

### Decision 5: Standalone shortfall purchase

**Approved rule:** when a proposed Standalone or Extra Class lacks capacity, let the Payer explicitly buy either the exact shortfall or a larger manual package. Give a released exact-shortfall Lot a one-month lifetime.

**Why:** a Student should not be forced to buy 40 credits merely to book one 10-, 20-, or 30-credit Class, while the purchase must remain manual rather than an Automatic Top-up.

### Decision 6: Allocation order and pinning

**Approved rule:** allocate promotional Lots first, then all other eligible Lots by earliest expiration, using stable Lot ID as the final tie-breaker. Pin allocations at commitment and never reshuffle them automatically after a later purchase.

**Why:** this honors the settled promotional-first rule and makes every booking reproducible.

### Decision 7: Commitment and Hold protection

**Approved rule:** require a fully allocated Credit Commitment before a Kelp-billed Class is booked, convert it to a Hold at T-6 hours, and protect held quantity from transfer, refund, expiration, or unrelated use until settlement.

**Why:** displayed balance alone cannot promise the same credits to multiple future Classes.

### Decision 8: Outcome-based settlement

**Approved rule:** let Phase 10 consume an authoritative Class financial outcome and post full, half, reduced, or zero Charge deterministically. Keep exception Holds pending for at most 14 days and require reversals for later corrections.

**Why:** the credit ledger should record financial consequences without inventing attendance facts.

### Decision 9: Reschedule and duration reallocation

**Approved rule:** outside the Hold Window, atomically replace the old Commitment with one revalidated against the successor time and duration. If funding fails, never leave both Commitments active or silently complete the scheduling change.

**Why:** a later time may cross a Lot's expiration, and a longer Class may require more credits.

### Decision 10: Expiration Suspension

**Approved rule:** implement the two-month no-show freeze exactly as remaining-lifetime preservation. Also permit Case-specific suspension during Kelp-caused Tutor replacement, with a responsible owner and mandatory review every 90 days.

**Why:** this protects Students during Kelp-caused disruption without creating invisible indefinite extensions.

### Decision 11: Transfers

**Approved rule:** permit Support-approved transfer only for unused, unexpired, unrestricted purchased credits. Preserve source, original Payer, money basis, and expiration through paired atomic entries; prohibit ordinary promotional transfer.

**Why:** resetting lifetime or price during transfer would create value that was never purchased and obscure refund ownership.

### Decision 12: Refunds, disputes, and adjustments

**Approved rule:** remove or restore credits through entries linked to the original Lot and money transaction. Use original purchase allocation for refunds, keep promotional credits non-refundable by default, prevent negative credit balances, and record post-spend chargeback debt outside the credit ledger.

**Why:** credits and money must reconcile without pretending that a payment dispute changes historical Class attendance.

## 37. Phase 10 invariants

The following invariants are authoritative:

1. Lesson Credits are integer booking units and are not money.
2. A Student has at most one Student Credit Account.
3. The Student Credit Account is Account-wide and not Tutor-, Course-, Classroom-, Guardian-, or payment-method-specific.
4. The authoritative credit quantity is derived from append-only ledger records.
5. A mutable Profile balance is never financial authority.
6. Corrections use compensating entries and never edit or delete prior entries.
7. Every Credit Lot has one Student beneficiary, source, original integer quantity, effective instant, and expiration policy.
8. Every purchased Lot pins its original Payer, currency, money amount, and price Version.
9. Current catalog price never reconstructs a historical Lot's money basis.
10. A payment callback alone never creates spendable credits.
11. Payment or grant authority and Lot issuance succeed atomically or enter reconciliation.
12. A duplicate webhook or retry never creates a duplicate Lot.
13. The full individual duration mapping remains 10, 20, and 30 credits.
14. The Student no-show mapping remains 5, 10, and 15 credits.
15. Platform fees never consume Lesson Credits.
16. Independent Tutor Classes never consume Lesson Credits.
17. Group Course credit mapping is not inferred from individual pricing.
18. Recurring exact-shortfall Lots use the pinned recurring price Version.
19. A recurring Automatic Top-up purchases only the exact positive shortfall.
20. Existing eligible credits fund the recurring commitment before an Automatic Top-up.
21. A larger package requires a separate manual purchase.
22. A Standalone exact-shortfall purchase requires active Payer confirmation.
23. A failed payment creates no Lot, Credit Commitment, or Class booking.
24. Promotional Lots expire after one calendar month.
25. Recurring-funded Lots expire after 12 calendar months.
26. Ordinary manual packages use 40 credits per calendar month of lifetime, capped at 480 credits and 12 months.
27. Existing Lot expiration instants do not change when the Student later changes timezone.
28. A Lot expired before a freeze or Case suspension never revives.
29. Promotional Lots allocate before purchased Lots.
30. Within each source priority, the earliest expiration allocates first.
31. Stable Lot ID breaks otherwise equal allocation ties.
32. Only Lots valid at the Class scheduled start instant may support that Class.
33. A displayed raw balance never proves spendable capacity.
34. One Credit Lot quantity cannot fund two active commitments.
35. A Kelp-billed Class requires a fully allocated Credit Commitment before booking succeeds.
36. A Credit Commitment reduces capacity but is not a final Charge.
37. A Projected Meeting creates no Credit Commitment, Hold, or Charge.
38. A Credit Hold begins at the six-hour Hold Window and is not a final Charge.
39. Held quantity cannot be transferred, refunded, expired, or used elsewhere before settlement.
40. A validly held Lot remains chargeable for its Class even if settlement occurs after Lot expiration.
41. A Credit Charge requires one authoritative Class financial outcome.
42. The credit ledger never infers attendance from browser state.
43. A completed or validly ended Class posts the full approved quantity.
44. A Student no-show posts the approved half quantity and releases the remainder.
45. A Tutor no-show posts no Student Charge and releases the commitment.
46. An approved Kelp outage posts no automatic Student Charge.
47. A partial Charge consumes pinned allocations in their original order.
48. Any uncharged remainder returns to its originating Lot.
49. Released quantity whose Lot already expired becomes expired immediately unless suspended.
50. Settlement pending preserves the Hold and posts no final Charge until resolution.
51. One Class Hold cannot settle twice.
52. A later correction uses a Credit Reversal and never deletes the original Charge.
53. Outside the Hold Window, a reschedule or duration change revalidates credit eligibility.
54. One atomic successor transition prevents old and new Commitments from overlapping.
55. Inside the Hold Window, a duration change cannot bypass Phase 4 by reallocating credits.
56. Expiration appends the exact eligible expired quantity once and never deletes the Lot.
57. Expired credits remain historical and are not spendable, transferable, or automatically refundable.
58. The no-show Subscription Freeze preserves remaining Lot lifetime for at most two months.
59. Freeze resume cannot extend the same remaining lifetime twice.
60. Case-specific Expiration Suspension requires scoped approval, an owner, reason, and review date.
61. Opening a generic Support Case never suspends expiration by itself.
62. A transfer moves only unused, unexpired, unrestricted purchased credits.
63. Transfer never resets expiration or replaces original Payer and money attribution.
64. Transfer out and transfer in succeed atomically or not at all.
65. Promotional credits are not ordinarily transferable or cash-refundable.
66. A refund uses original purchase allocation rather than current catalog price.
67. A money refund and credit removal remain separate but reconciled records.
68. No ledger transition may create a negative Student credit balance.
69. A post-spend chargeback creates an external financial issue rather than negative credits.
70. Tutors see commercial readiness, not full Student balance or Payer details.
71. Browser state, route, token, cached balance, or payment-method reference never grants credits or booking authority.
72. Failed required audit persistence prevents acquisition, allocation, Hold, Charge, release, expiration, transfer, refund, adjustment, or reconciliation resolution from being successful.

## 38. Relationship to existing implementation

The repository does not yet contain the complete Phase 10 domain model:

- no authoritative Student Credit Account, Credit Lot, Credit Ledger Entry, Allocation, Commitment, Hold, Charge, Transfer, Refund Allocation, or Reconciliation Case exists;
- no server-authoritative derived-balance or class-time spendable-capacity calculation exists;
- no expiration, freeze-preservation, or deterministic allocation worker exists;
- no Stripe payment record is atomically linked to Credit Lot issuance;
- current browser pages, fixtures, and local state are not credit or payment authority;
- existing schedule code acknowledges commercial capacity but does not implement this ledger.

Phase 10 does not authorize a migration, Stripe integration, Docker run, Supabase change, background worker, or frontend wiring. Later architecture must implement the approved ledger with transactional authorization, idempotency, reconciliation, and audit.

## 39. Phase 10 completion and later-phase handoff

Phase 10 is final and authoritative. Later phases must consume its Student Credit Account, Credit Lots, ledger entries, allocations, Commitments, Holds, Charges, releases, reversals, expiration, suspension, transfer, refund allocation, restriction, and reconciliation outputs rather than infer credit authority from a displayed balance or payment callback.

Phase 11 now produces the authoritative attendance financial output consumed by this ledger. Later cancellation, payment-provider, Tutor-compensation, Support Case, and notification contracts may produce or consume other credit outcomes, but they must not reopen this ledger's ownership, allocation, concurrency, expiration, or audit rules unless a later approved contract explicitly amends Phase 10.

No database, API, row-level-security, Stripe, Twilio, Docker, Supabase, payment, or frontend implementation is authorized by this contract.
