# Phase 13: Kelp Tutor compensation, settlement, payouts, and dispute recovery

**Contract phase:** 13 of 54  
**Status:** Final approved contract  
**Last updated:** 2026-07-20  
**Depends on:** canonical glossary and approved Phases 2-12  
**Applies to:** Kelp Tutor compensation basis, accruals, 14-day settlement holds, commission, promotional and no-show compensation, monthly payout batches, payout readiness and failure, post-payout corrections, dispute-loss sharing, recovery withholding, statements, reconciliation, privacy, and audit

## 1. Purpose

This contract defines how a final Kelp-managed Class outcome becomes money owed to a Kelp Tutor and, later, a payout.

It separates eight questions that must not be collapsed:

1. **Which Tutor actually owns the compensation item?**
2. **Which pinned Class price supplies the monetary basis?**
3. **Which attendance or cancellation outcome changes that basis?**
4. **How much belongs to the Tutor and how much is Kelp commission?**
5. **Has the amount merely accrued, completed its 14-day hold, entered a payout batch, or actually transferred?**
6. **Did a later refund, outcome correction, dispute, or chargeback affect the money?**
7. **May Kelp recover a share from future Tutor earnings?**
8. **Did every internal and provider transition reconcile exactly once?**

Lesson Credits are booking units, not Tutor money. A Student Credit Charge is not a Tutor accrual. A final Class outcome is not a payout. A Stripe event is not the internal compensation ledger. A displayed earnings total is not accounting authority.

## 2. Contract authority and current approval status

The canonical glossary and approved Phases 2-12 remain authoritative. In particular, Phase 13 preserves:

- Kelp Tutors working for Kelp as contractors;
- Independent Tutors remaining outside Kelp lesson payments, commission, and payouts;
- 10-, 20-, and 30-credit Class charges for 30-, 60-, and 90-minute Classes;
- 5-, 10-, and 15-credit Student no-show charges;
- recurring prices of USD 20, USD 40, and USD 60;
- Standalone prices of USD 25, USD 50, and USD 75;
- one immutable Class identity with exact Tutor Assignment and Session history;
- Phase 11 Authoritative Class Outcomes as the attendance and incident source;
- Phase 12 valid cancellation outcomes as the cancellation source;
- no Tutor compensation for Tutor no-show, mutual absence, confirmed Kelp outage, or valid zero-charge cancellation;
- a normal 25% Kelp commission and 75% Kelp Tutor share;
- a 14-day settlement hold after each Class;
- the regular Tutor payout date of the 10th of each month;
- a 50/50 post-payout dispute-loss allocation for Kelp Tutors;
- an additional 25 percentage points withheld from future eligible gross lesson value during active recovery;
- manual account-receivable review when a Tutor leaves with an unrecovered balance;
- no automatic charge to an unrelated Tutor payment method;
- append-only, server-authoritative financial history.

The product owner approved all twelve Phase 13 decisions on 2026-07-20. The rules, formulas, lifecycle states, matrices, and invariants in this document are authoritative. Items explicitly marked **Deferred** remain assigned to later contracts.

## 3. Settled baseline

The following rules are already settled and are not reopened here:

1. Kelp processes Student payments for Kelp-managed Classes.
2. A Kelp Tutor's normal compensation is 75% of gross lesson value.
3. Kelp retains the remaining 25% as commission.
4. Kelp Tutors are contractors.
5. Compensation becomes payable only after a 14-day hold.
6. Eligible Tutor earnings enter the payout process on the 10th of each month.
7. Student no-show compensation uses the 75% Tutor share rule.
8. Promotional credits do not reduce the Tutor's 75% compensation rule.
9. Independent Tutors pay Kelp a flat USD 10 monthly platform fee, receive Student lesson payments privately, and receive no Kelp Tutor payout.
10. Kelp does not take lesson commission from Independent Tutors.
11. Kelp does not adjudicate Independent Tutor private payment disputes.
12. A Student no-show produces a 50% Student Lesson Credit charge.
13. Tutor no-show produces zero Student charge and zero Tutor compensation.
14. Confirmed Kelp service failure produces zero charge and zero compensation.
15. If a qualifying exception remains unreported, normal settlement becomes eligible after day 14 under Phase 11.
16. Kelp bears the external dispute loss first and later recovers the Tutor's agreed half.
17. While recovery is active, the Tutor's ordinary 75% share is temporarily reduced to 50% of future eligible gross lesson value.
18. Recovery stops exactly when the Tutor's allocated half has been recovered.
19. Authored Product royalties, including the provisional 2% arrangement, remain a separate future contract.

## 4. Scope

### Included

Phase 13 defines:

- the Tutor Compensation Basis Snapshot pinned to a Class;
- a separate append-only Tutor Compensation Ledger;
- normal, no-show, promotional, reduced, zero, and pending compensation formulas;
- exact high-precision money calculation and payout rounding;
- accrual, settlement-hold, eligibility, batching, transfer, failure, and reconciliation states;
- the regular monthly payout calendar and cutoff;
- payout-account readiness and contractor statement visibility;
- ordinary commission and processor-fee boundary;
- pre-payout refund and correction effects;
- post-payout refund, correction, dispute, and chargeback separation;
- 50/50 Dispute Loss allocation and future-earnings recovery;
- Tutor departure with an outstanding recovery balance;
- recipient authority, Group Course and Independent Tutor boundaries;
- privacy, concurrency, idempotency, audit, and Notification Events.

### Deferred

Phase 13 does not define:

- final Stripe Connect account type, charge type, transfer method, negative-balance configuration, or webhook implementation;
- contractor agreement text, labor classification advice, tax forms, withholding, invoice law, or jurisdiction-specific reporting;
- exchange rates, cross-currency settlement, or currencies beyond an approved Price Version;
- statutory refund and chargeback rights or evidence requirements;
- exact bank-holiday provider and payout-rail processing time;
- fraud reserves beyond the approved 14-day hold;
- automatic sanctions arising from Phase 12 Tutor reliability review;
- compensation during the Phase 8 Probationary Tutor Period;
- Group Course price, cohort revenue, and Tutor compensation allocation;
- authored Course, question, Schedule, or other product royalties;
- Independent Tutor private lesson billing, refunds, payouts, and disputes;
- Support Case screens, Stripe dashboard operations, database tables, RLS, APIs, jobs, or frontend pages;
- Twilio, email, push, or statement-delivery implementation.

## 5. Phase 13 concepts

### Tutor Compensation Basis Snapshot

The immutable monetary snapshot pinned to one Kelp-billed Class before delivery. It records service price Version, service path, currency, scheduled duration, full gross lesson value, Tutor Assignment, compensation policy Version, commission rate, and origin references.

It is separate from the Student's Credit Lots and actual Lot allocation.

### Gross lesson value

The full monetary value assigned to the Class by its pinned recurring or Standalone price Version before outcome modifiers, Tutor share, Kelp commission, processor fees, taxes, refunds, or recovery deductions.

### Earned compensation basis

The gross lesson value after applying the authoritative Class outcome modifier. A normal completed Class uses 100%; a Student no-show uses 50%; a zero outcome uses 0%; and an authorized reduced outcome supplies an explicit modifier or amount.

### Tutor Compensation Ledger

The append-only money subledger recording accruals, releases from hold, payout items, transfers, adjustments, recovery receivables, recovery withholdings, reversals, and reconciliation results for one Kelp Tutor and currency.

It is not the Student Lesson Credit ledger, a Stripe balance, or a mutable earnings total.

### Tutor Accrual Entry

The append-only entry recognizing exact Tutor compensation from a final authoritative Class outcome. It records gross lesson value, outcome modifier, earned compensation basis, Tutor share, Kelp commission, Class and outcome Versions, and settlement-hold end.

### Tutor Settlement Hold

The non-payable interval ending exactly 14 days after the authoritative Class operational end. A final accrual may exist during the hold, but it cannot enter a payout batch until the hold ends and every other eligibility requirement passes.

### Payout Eligibility Event

The append-only event stating that an accrual is final, its hold ended, its recipient remains valid, required payout readiness exists, and no active financial or compliance block prevents inclusion in a payout batch.

### Tutor Payout Batch

The immutable monthly collection of eligible items locked for one Tutor, currency, and payout destination. Its total is rounded to the currency minor unit only after exact item aggregation and authorized deductions.

### Tutor Payout Item

The immutable link from one eligible accrual or adjustment to one Payout Batch. It preserves the exact internal amount, displayed rounded allocation, Class reference, commission, outcome modifier, and recovery effect.

### Tutor Payout Transfer

The server-authorized provider transfer attempting to pay one Payout Batch. A submitted or successful transfer is distinct from batch creation and must reconcile with provider state.

### Compensation Adjustment

An append-only correction to a prior accrual, commission, eligibility, payout, or recovery result. It identifies the predecessor, reason, authority, exact amount, Class or dispute evidence, and whether money has already left Kelp.

### Payout Reconciliation Case

The operational record used when internal batch, transfer, connected-account, bank, dispute, or provider state disagrees. It preserves a safe payable or blocked state and prevents duplicate transfers while the mismatch is resolved.

### Tutor Recovery Balance

The exact remaining Tutor share of an approved Dispute Loss that Kelp paid externally and may recover under the Tutor agreement. It is a money receivable, not a negative payout balance or Student credit entry.

### Recovery Withholding

The append-only deduction from future eligible Tutor compensation while a Tutor Recovery Balance exists. The ordinary rule withholds an additional 25 percentage points of the future earned compensation basis, leaving the Tutor with 50% instead of 75%, capped by the remaining recovery balance.

## 6. Separation of money systems

Kelp requires separate authoritative records for:

| Record | Owner or subject | Answers |
| --- | --- | --- |
| Student Lesson Credit ledger | Student | Which booking units are available, committed, held, charged, or released? |
| Student or Guardian money records | Payer | What was purchased, invoiced, refunded, or disputed? |
| Tutor Compensation Ledger | Kelp Tutor | What compensation accrued, became eligible, was paid, adjusted, or recovered? |
| Independent Tutor private payments | Independent Tutor and their Student | What happened outside Kelp's payment responsibility? |
| Kelp accounting ledger | Kelp legal entity | How revenue, commission, processor costs, taxes, liabilities, and losses are recognized? |

No balance is copied from one ledger to become authority in another. They reconcile through immutable references.

## 7. Compensation-basis snapshot

Every Kelp-billed Scheduled Class must pin a Tutor Compensation Basis Snapshot when its initial Credit Commitment succeeds.

The snapshot records:

- stable snapshot ID and Version;
- Class, current revision, Course, Classroom, and service model;
- Tutor Account, Tutor Assignment, and Supervising Mentor period;
- scheduled duration and Subject;
- recurring or Standalone service path;
- accepted Class Price Version and currency;
- full gross lesson value;
- 75% Tutor share and 25% Kelp commission policy Version;
- promotion or discount independence rule;
- creation and supersession references;
- audit state.

A valid pre-Class duration change creates a successor Basis Snapshot tied to the successor Class revision. A time-only reschedule normally preserves the same price Version unless an approved commercial revalidation explicitly pins a successor Version. Historical snapshots are never overwritten.

## 8. Price and normal compensation table

The current individual Class values are:

| Service path | Duration | Student credits at full outcome | Gross lesson value | Normal Tutor share, 75% | Kelp commission, 25% |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recurring | 30 minutes | 10 | USD 20.00 | USD 15.00 | USD 5.00 |
| Recurring | 60 minutes | 20 | USD 40.00 | USD 30.00 | USD 10.00 |
| Recurring | 90 minutes | 30 | USD 60.00 | USD 45.00 | USD 15.00 |
| Standalone | 30 minutes | 10 | USD 25.00 | USD 18.75 | USD 6.25 |
| Standalone | 60 minutes | 20 | USD 50.00 | USD 37.50 | USD 12.50 |
| Standalone | 90 minutes | 30 | USD 75.00 | USD 56.25 | USD 18.75 |

The same 10 Lesson Credits may correspond to USD 20 or USD 25 depending on the accepted service price Version. Compensation must therefore use the pinned money basis, never a universal credit-to-money conversion.

## 9. Normal 75/25 calculation

For a normal full outcome:

```text
earned_compensation_basis = pinned_gross_lesson_value
tutor_gross_share = earned_compensation_basis x 0.75
kelp_commission = earned_compensation_basis - tutor_gross_share
```

The 25% commission includes Kelp's ordinary platform margin for the lesson. Ordinary Student payment-processing and Tutor payout-processing fees do not reduce the promised 75% Tutor gross share unless a future accepted Tutor agreement Version explicitly changes the commercial model.

Taxes legally attributable to the Tutor, statutory withholding, and jurisdiction-specific reporting remain separate and may affect cash transferred without rewriting gross compensation.

## 10. Promotional credits and purchase discounts

Tutor compensation is independent of which eligible Credit Lots funded the Student Charge.

For a completed Class:

- promotional credits receive the same pinned full gross lesson value as purchased credits;
- a discounted package does not silently reduce Tutor compensation;
- transferred credits preserve no special Tutor-pay rate;
- mixed Credit Lots do not split the Tutor accrual into different prices;
- Kelp bears the promotion or approved purchase discount against its own commercial economics;
- the Tutor sees the Class basis and compensation, not the Student's promotion, Payer, or Lot details.

This rule applies to outcome modifiers as well. A promotional-credit Student no-show uses the same half-basis no-show formula as a purchased-credit Student no-show.

## 11. Student no-show compensation

A final Student no-show uses 50% of the pinned gross lesson value because Phase 11 charges 50% of the full Lesson Credit quantity. The Tutor then receives 75% of that reduced earned compensation basis.

```text
no_show_basis = pinned_gross_lesson_value x 0.50
tutor_no_show_share = no_show_basis x 0.75
kelp_no_show_commission = no_show_basis - tutor_no_show_share
```

The current values are:

| Service path | Duration | Student no-show credits | No-show earned basis | Exact Tutor share, 75% | Exact Kelp commission |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recurring | 30 minutes | 5 | USD 10.00 | USD 7.50 | USD 2.50 |
| Recurring | 60 minutes | 10 | USD 20.00 | USD 15.00 | USD 5.00 |
| Recurring | 90 minutes | 15 | USD 30.00 | USD 22.50 | USD 7.50 |
| Standalone | 30 minutes | 5 | USD 12.50 | USD 9.3750 | USD 3.1250 |
| Standalone | 60 minutes | 10 | USD 25.00 | USD 18.75 | USD 6.25 |
| Standalone | 90 minutes | 15 | USD 37.50 | USD 28.1250 | USD 9.3750 |

The 75% rule applies to the amount earned by the no-show outcome, not to the full unprovided lesson value.

## 12. Exact money and rounding

The Standalone no-show table produces half-cent values, so per-Class cent rounding would create systematic bias.

The approved rule is:

1. store every compensation calculation in an exact decimal unit supporting at least four USD decimal places;
2. retain the exact Tutor share, commission, adjustment, and recovery amount per item;
3. sum exact items for one Tutor and currency inside the Payout Batch;
4. apply recovery withholding against the exact aggregate;
5. round the final transfer amount once to the currency minor unit using round-half-to-even;
6. record the exact-to-payable rounding adjustment explicitly;
7. carry no hidden mutable remainder outside the ledger.

This makes USD 9.3750 auditable and allows several half-cent items to offset naturally before the cash transfer is rounded to cents.

## 13. Outcome-to-compensation matrix

| Authoritative Class outcome | Earned compensation basis | Tutor compensation signal |
| --- | ---: | --- |
| `completed` | 100% of pinned gross | Normal 75% Tutor share |
| `valid_early_completion` | 100% | Normal 75% Tutor share |
| `student_no_show` | 50% | 75% of the half basis |
| `student_early_departure` | 100% unless corrected | Normal 75% Tutor share |
| `tutor_no_show` | 0% | None |
| `mutual_absence` | 0% | None |
| confirmed Kelp outage preventing service | 0% | None |
| valid zero-charge cancellation | 0% | None |
| Tutor cancellation | 0% | None |
| `tutor_early_departure` | Pending | No accrual eligible before reviewed result |
| Settlement Pending | Pending | No payout eligibility |
| confirmed outside-Kelp delivered Class | 100% | Normal 75% Tutor share |
| authorized reduced outcome | Explicit approved basis | 75% unless the approved outcome Version says otherwise |
| protective cancellation | 0% | None |

Phase 13 consumes the outcome. It does not reinterpret Presence Evidence, Student credits, cancellation entitlement, or Tutor reliability.

## 14. Compensation recipient

The Tutor recipient comes from the Class Session and current Class revision that produced the Authoritative Class Outcome.

The eligible recipient must be:

- the Kelp Tutor identified by the effective Tutor Assignment or authorized interim Assignment for that Class;
- admitted as the Tutor for the delivered Class Session when attendance was required;
- operating under Kelp-managed service;
- covered by a valid compensation policy Version;
- not an observer, Guardian, Mentor acting only as supervisor, or Quality Assistant.

When a Mentor personally teaches, they earn Kelp Tutor compensation only when they hold the valid teaching Assignment and are supervised by a different qualified Mentor. Reassignment after the Class never moves the accrual to the replacement Tutor.

## 15. Non-compensable activity

The following create no ordinary Class compensation:

- Projected Meeting;
- pending or rejected Lesson Request;
- Credit Commitment or Hold without a final eligible outcome;
- Orientation Meeting;
- Applicant Development Course work;
- Mock Session;
- access-only messaging, Forum activity, assignment review, report creation, or Course planning unless a later contract prices it separately;
- courtesy time beyond the scheduled Class duration;
- unauthorized extension;
- cancelled or protective Class;
- Independent Tutor Class;
- Group Course Class until the Group compensation contract is approved;
- Authored Product creation or reuse.

## 16. Accrual creation

An accrual can be created only from one effective Authoritative Class Outcome Version or Phase 12 cancellation outcome.

For an eligible final outcome, Kelp atomically:

1. locks the effective Class outcome and Basis Snapshot;
2. validates the compensation recipient;
3. calculates the exact earned basis, Tutor share, and commission;
4. appends one Tutor Accrual Entry;
5. links the Student Credit Charge or zero outcome for reconciliation without copying credit quantity as money;
6. calculates the hold end from the Class operational end;
7. emits audit and Notification Events;
8. commits once.

A retry with the same Class outcome Version returns the existing accrual. It never creates a second earning.

## 17. Accrual lifecycle

The approved lifecycle is:

| State | Meaning |
| --- | --- |
| `awaiting_outcome` | Class exists but compensation cannot yet be calculated |
| `settlement_pending` | Phase 11 or another authorized review blocks a final basis |
| `held` | Final accrual exists but the 14-day hold has not ended |
| `eligible` | Hold ended and all payout gates passed |
| `blocked` | Accrual remains owed but payout readiness, compliance, or reconciliation blocks batching |
| `batched` | Item belongs to one locked Payout Batch |
| `transfer_pending` | Provider transfer was submitted but is not final |
| `paid` | Provider success reconciled to the internal batch |
| `transfer_failed` | Transfer failed without extinguishing the payable amount |
| `adjusted` | A successor adjustment changed the effective amount |
| `written_off` | Authorized accounting action closed a receivable or payable without pretending payment occurred |

Only append-only events change effective state. A dashboard label never does.

## 18. Fourteen-day settlement hold

The hold end is:

```text
hold_ends_at = authoritative_class_operational_end + 14 x 24 hours
```

Payout eligibility occurs no earlier than:

```text
eligible_at = max(hold_ends_at, final_outcome_effective_at)
```

The item must also satisfy payout readiness and have no active block.

During the hold:

- the Tutor may see the provisional exact accrual and hold end;
- Kelp may receive an incident, refund, payment-dispute, or outcome correction;
- no provider transfer is initiated;
- the amount is not spendable credit or Tutor-controlled wallet money;
- a pending outcome remains visibly pending rather than becoming zero;
- retries cannot shorten or restart the hold.

If no blocking report exists and Phase 11 produces the normal outcome at day 14, the accrual may become eligible immediately, subject to payout readiness and batch cutoff.

## 19. Eligibility gates

An accrual becomes eligible only when all are true:

- its Class has one effective final compensation-bearing outcome;
- the 14-day hold ended;
- no Settlement Pending, open outcome conflict, or duplicate-compensation Case blocks it;
- the exact accrual and commission entries passed audit;
- the Tutor has an active or historical payable relationship that preserves earned compensation;
- the Tutor's payout destination is verified and enabled;
- required contractor, identity, tax, and compliance readiness is current where legally required;
- currency and payout rail are supported;
- it is not already batched or paid;
- no scoped legal or financial hold applies.

Loss of active teaching authority does not forfeit valid prior earnings. It may block future Classes and may delay transfer only when a lawful or operational payout gate requires it.

## 20. Monthly payout calendar

The intended regular payout date remains the 10th of each month.

The approved deterministic rule is:

- Kelp configures one payout-calendar timezone per paying legal entity;
- the monthly batch locks at `00:00` on the 10th in that timezone;
- every item already `eligible` before the lock enters that month's batch unless explicitly blocked;
- an item becoming eligible at or after the lock rolls to the next regular batch;
- Kelp initiates the transfer during the 10th;
- if the 10th is not a supported banking day, initiation occurs on the next supported banking day without changing the batch identity;
- provider transit time does not change the contractual batch date;
- one Tutor and currency receive at most one ordinary batch per month, plus explicit correction batches when required.

The batch cutoff is server time, not the Tutor's browser timezone.

## 21. Minimum and negative payout rules

The approved initial policy has no Kelp-imposed minimum payout threshold. Every positive rounded eligible amount enters the normal batch when the payout rail supports it.

- A batch can never be negative.
- Recovery Withholding cannot exceed the current eligible Tutor share or remaining Recovery Balance.
- An amount too small for a provider rail remains payable and rolls forward transparently.
- Kelp cannot label a payable amount `paid` merely because it is below a provider minimum.
- Different currencies are never netted against each other.

## 22. Payout Batch calculation

For one Tutor and currency:

```text
exact_eligible_total = sum(exact eligible accruals and adjustments)
exact_recovery_withholding = min(25% of applicable earned bases,
                                 remaining Tutor Recovery Balance)
exact_payable = exact_eligible_total - exact_recovery_withholding
transfer_amount = round_half_even(exact_payable to currency minor unit)
```

The batch records:

- exact eligible total;
- normal commission by item;
- each outcome modifier;
- exact Recovery Withholding;
- exact payable total;
- explicit rounding adjustment;
- final transfer amount;
- included and excluded item IDs;
- payout destination Version;
- lock and transfer instants;
- provider and reconciliation references.

## 23. Payout destination and readiness

The Tutor supplies payout onboarding through a server-created provider flow. Kelp stores provider references and readiness states, never raw bank-account credentials.

- Browser completion alone does not mark an account payable-ready.
- Provider readiness must reconcile to the Tutor Account and Kelp legal entity.
- Changing the destination after batch lock affects only a later batch unless the locked batch is safely cancelled before transfer.
- A suspended or departed Tutor retains visibility of legitimate payable history and a secure route to complete required payout readiness.
- Mentor and Quality Assistant roles do not grant access to bank details.
- A Tutor cannot redirect another Tutor's payout through Workspace Context or Course access.

## 24. Transfer submission and provider results

Kelp creates a stable idempotency key from the Payout Batch and transfer attempt.

The internal lifecycle distinguishes:

- batch locked;
- transfer requested;
- provider accepted;
- provider pending;
- provider paid or delivered;
- provider failed;
- provider reversed or returned;
- internally reconciled.

A webhook is evidence of provider state but does not bypass internal Batch identity, recipient, amount, or reconciliation checks. Unknown, duplicated, late, or contradictory events create or update a Payout Reconciliation Case rather than a second transfer.

## 25. Failed and returned payouts

A failed or returned transfer:

- never changes the underlying eligible earnings to zero;
- never creates a second accrual;
- moves the Batch to a retryable or review state;
- notifies the Tutor without exposing provider secrets;
- preserves the original destination Version and failure reference;
- requires verified readiness before another attempt;
- uses a new attempt record linked to the same Batch or an explicit successor Batch;
- cannot be paid twice if a late provider success arrives.

The exact automated retry schedule remains an integration decision. The accounting contract requires safe idempotent retry and manual reconciliation, not blind repeated transfers.

## 26. Tutor statement

Every locked Payout Batch produces a Tutor-visible statement containing:

- Tutor legal or display identity as permitted;
- batch period, currency, and payout date;
- each Class date, Course or Subject label, duration, service path, and Class ID;
- gross lesson value;
- outcome modifier such as full or Student no-show;
- exact Tutor gross share;
- Kelp commission;
- pre-payout adjustments;
- recovery withholding shown separately from commission;
- exact aggregate, rounding adjustment, and transfer amount;
- transfer status and provider reference safe for display;
- correction or successor statement links.

Statements are immutable Versions. A correction creates a successor statement and never silently replaces a delivered one.

## 27. Refunds before payout

Before transfer, a valid money refund or Class-outcome correction affects Tutor compensation only through an authorized linked decision.

- A goodwill refund alone does not rewrite the Class outcome or Tutor accrual.
- A correction from full to reduced or zero appends a Compensation Adjustment.
- The adjustment can reduce or remove eligibility before batching.
- A batched but not submitted transfer may be cancelled and rebuilt only through an audited Batch successor.
- If a provider transfer is already pending and cannot be cancelled safely, the item follows the post-payout correction boundary.
- The Student Credit Reversal and money refund remain separate reconciled records.

## 28. Ordinary refunds after payout

The product owner's settled intent is that the 14-day hold protects the Tutor from routine post-payout clawbacks.

The approved rule is:

- an ordinary Kelp goodwill refund approved after a valid Tutor payout is Kelp's expense and does not create Tutor debt;
- a consumer refund caused only by Kelp service policy after payout does not silently reduce future Tutor earnings;
- a qualifying payment dispute or chargeback follows the separate 50/50 Dispute Loss rule;
- a proven duplicate or erroneous Tutor payment creates a separately reviewed Compensation Correction rather than being mislabeled a customer refund;
- Tutor misconduct or contractual breach remedies remain a later conduct and contractor-agreement decision.

## 29. Outcome corrections after payout

A post-payout Authoritative Class Outcome correction cannot mutate the paid item.

Kelp appends:

1. the successor Class outcome Version;
2. the recomputed exact compensation result;
3. a Compensation Adjustment for the difference;
4. an accounting receivable or payable when cash already moved;
5. an assigned manual review when automatic offset authority is absent;
6. a successor statement and Notification Event.

If the correction increases Tutor compensation, the positive adjustment enters the next eligible payout after any required review. If it decreases compensation, Kelp may not use the 25-percentage-point Dispute Loss mechanism unless the event actually qualifies as a payment dispute under the agreed rule.

## 30. Dispute Loss calculation

The settled working formula is:

```text
total_dispute_loss = disputed principal
                     + applicable provider dispute fees
                     - successfully recovered funds

kelp_share = total_dispute_loss x 0.50
tutor_share = total_dispute_loss - kelp_share
```

Kelp pays or absorbs the provider-facing loss first. The Tutor Recovery Balance then records only the Tutor's allocated half.

When one disputed purchase funded several Classes, Tutors, unused credits, platform fees, or taxes, Kelp must allocate the loss through the original money, Credit Lot, Charge, and Class lineage. One Tutor is responsible only for the traceable share assigned to that Tutor's already-paid Kelp-managed Classes plus the allocated dispute-fee share under the accepted policy.

Promotional value with no disputed Payer principal remains Kelp-funded and does not manufacture Tutor debt.

## 31. Recovery Withholding

While a Tutor Recovery Balance is positive:

```text
normal_tutor_share = earned_compensation_basis x 0.75
maximum_recovery_for_item = earned_compensation_basis x 0.25
actual_recovery = min(maximum_recovery_for_item,
                      remaining Tutor Recovery Balance)
cash_share_before_other_lawful_deductions = normal_tutor_share - actual_recovery
```

Therefore an ordinary future Class temporarily pays 50% of earned basis when the full additional withholding is needed. A future Student no-show uses its half earned basis before the same 25-percentage-point recovery calculation.

Recovery Withholding:

- is shown separately from ordinary Kelp commission;
- never exceeds the remaining Recovery Balance;
- never makes a payout item negative;
- stops immediately when the exact balance reaches zero;
- does not increase Kelp's recognized lesson commission;
- is corrected through append-only entries;
- is never applied to Independent Tutor private earnings.

## 32. Tutor dispute and review rights

Before or promptly after recovery begins, the Tutor receives:

- the disputed transaction and affected Class scope;
- total loss formula and their allocated half;
- permitted evidence deadline;
- current Recovery Balance;
- planned 25-percentage-point withholding rule;
- Support or appeal route;
- outcome and correction history.

Private Student payment credentials and unrelated Payer activity remain hidden. A Tutor appeal does not delete the external provider loss; it may pause recovery only through explicit scoped authority.

## 33. Tutor departure with recovery balance

Ending Kelp Tutor status does not erase valid unpaid earnings or an approved Recovery Balance.

- Eligible positive earnings remain payable under the normal or final payout process.
- Authorized recovery may be applied to those earnings without exceeding the contract.
- Any remaining Tutor share becomes an account receivable assigned to manual review.
- Kelp does not automatically charge an unrelated card, bank account, or payment method.
- The receivable may be settled, disputed, written off, or pursued only through later approved legal and accounting procedure.
- Tutor access to statements, export, Support, and dispute history remains available under retention and account-security rules.

## 34. Independent Tutor, Group Course, and authored-product boundaries

### Independent Tutor

An Independent Tutor Class never creates a Compensation Basis Snapshot, Kelp commission, Tutor accrual, settlement hold, Payout Batch, or Dispute Loss. The flat USD 10 platform subscription is not netted against Kelp Tutor earnings when one Account uses both models.

### Group Course

Phase 13 does not guess Group Course gross value or divide one Class among Student payments. Group compensation remains blocked until the Group pricing, per-member credit, cohort cancellation, and revenue-allocation contract is approved.

### Authored products

Lesson compensation never includes the provisional 2% authored-product revenue arrangement. Course Templates, questions, Schedules, derivative works, attribution, and post-departure access require their own product-rights and royalty contract.

## 35. Authority, privacy, concurrency, audit, and notifications

### Authority

- The server derives accruals from authoritative outcomes and pinned Basis Snapshots.
- A Tutor cannot create, approve, edit, or mark their own accrual paid.
- A Mentor may see operational blockers for supervised Tutors but not bank details.
- A Quality Assistant may see scoped Class, dispute, or conduct evidence but cannot silently post accounting corrections.
- Authorized Finance or Administrator capability posts adjustments, batches, and reconciliation actions with separation of duties.
- Browser routes, Workspace Context, role labels, and provider dashboard visibility grant no accounting authority.

### Privacy

Students and Guardians see their own charges and refunds, not the Tutor's compensation, recovery balance, tax data, or payout destination. Tutors see their own statements and affected dispute allocation, not unrelated Payer or Student financial data.

### Concurrency and idempotency

The system must prevent:

- two accruals for one outcome Version;
- one item entering two active batches;
- two transfers paying one Batch;
- one webhook marking unrelated money paid;
- recovery exceeding the approved Tutor share;
- a correction and payout race from losing either history;
- destination changes redirecting a locked Batch silently;
- a retry duplicating statements, notifications, or ledger entries.

### Minimum audit record

Every transition records stable IDs, Tutor, Class, Assignment, Basis Snapshot, Price and policy Versions, outcome Version, exact calculations, currency, actors, server instants, predecessor, destination Version, provider references, recovery references, evidence, authorization, idempotency key, and audit-persistence result.

If required audit persistence fails, the compensation, eligibility, batch, transfer, adjustment, or recovery transition is not successful.

### Notification Events

Phase 13 creates server-side events for at least:

- accrual created or adjusted;
- settlement hold started or ending;
- item became eligible or blocked;
- payout account action required;
- monthly Batch locked;
- transfer submitted, paid, failed, returned, or corrected;
- statement available;
- dispute opened, allocated, won, lost, or corrected;
- recovery started, changed, paused, completed, or moved to manual receivable review;
- reconciliation Case opened or resolved.

Email, Twilio SMS, push, and provider-delivery channels remain later work.

## 36. Approved Phase 13 decisions

The product owner approved all twelve decisions below on 2026-07-20.

### Decision 1: Separate compensation money ledger

**Approved rule:** create a Tutor Compensation Ledger separate from Student Lesson Credits, Payer money records, Kelp accounting, and Independent Tutor private payments. Reconcile through immutable references rather than balance copying.

**Why:** credits, customer money, Tutor liability, and cash transfer have different owners and failure modes.

### Decision 2: Pin a monetary Class basis

**Approved rule:** pin recurring or Standalone gross lesson value, currency, duration, Tutor, and policy Versions in a Tutor Compensation Basis Snapshot when the Class commitment succeeds. Never derive Tutor money from credit count alone.

**Why:** 10 credits can represent USD 20 recurring or USD 25 Standalone, and historical earnings must survive later price edits.

### Decision 3: Preserve the 75/25 normal split

**Approved rule:** pay the Kelp Tutor 75% of pinned earned compensation basis and retain 25% as Kelp commission. Let Kelp bear ordinary processing fees from its economics; keep Tutor taxes and lawful withholding separate.

**Why:** the promised percentage should not shrink unpredictably because Kelp selected a processor or payout rail.

### Decision 4: Protect promotional compensation

**Approved rule:** calculate Tutor compensation independently of promotional, purchased, transferred, mixed, or discounted Credit Lots. Kelp bears approved promotions and package discounts.

**Why:** the Tutor delivered the same Class and cannot inspect or control how the Student acquired credits.

### Decision 5: Apply 75% to the no-show half basis

**Approved rule:** for a Student no-show, first reduce gross lesson value to 50%, then pay the Tutor 75% of that reduced basis. Store four-decimal exact amounts and round only the aggregate payout using half-even.

**Why:** this aligns Tutor money with the approved half-charge while resolving legitimate half-cent outcomes without systematic bias.

### Decision 6: Use outcome-driven accrual and a 14-day hold

**Approved rule:** create one accrual from the effective Phase 11 or Phase 12 outcome, hold it until 14 days after operational Class end, and make it eligible at the later of hold end or final outcome. Never infer money from attendance UI or credit state.

**Why:** the two-week review period remains meaningful and a pending incident cannot be paid prematurely.

### Decision 7: Lock monthly batches on the 10th

**Approved rule:** lock the ordinary monthly Batch at 00:00 on the 10th in Kelp's configured legal-entity timezone, include items eligible before lock, initiate on the 10th or next banking day, and impose no Kelp minimum payout.

**Why:** a deterministic cutoff resolves the conflict between per-Class 14-day eligibility and one monthly payout date.

### Decision 8: Keep readiness and transfer states explicit

**Approved rule:** retain earned amounts when payout onboarding, provider state, or a transfer fails. Use verified server-side destination Versions, idempotent attempts, explicit failed or returned states, and reconciliation before retry.

**Why:** a bank failure is neither loss of Tutor earnings nor permission to transfer twice.

### Decision 9: Protect paid Tutors from routine refunds

**Approved rule:** adjust valid outcomes before payout through linked entries. After payout, let Kelp bear ordinary goodwill refunds; use separate reviewed corrections for duplicate or erroneous pay and use the Dispute Loss rule only for qualifying payment disputes or chargebacks.

**Why:** the 14-day hold should provide real finality without hiding accounting errors or external disputes.

### Decision 10: Implement the settled 50/50 Dispute Loss

**Approved rule:** allocate traceable post-payout dispute principal and fees 50/50, let Kelp cover the external loss first, then recover the Tutor half by withholding 25 additional percentage points of future earned basis until exact recovery. Never overrecover or charge an unrelated method.

**Why:** this implements the agreed risk share while keeping the recovery visible, capped, and contractually scoped.

### Decision 11: Preserve recipient and service-model boundaries

**Approved rule:** pay the Kelp Tutor who held the authoritative teaching Assignment and delivered the Class. Preserve earnings after reassignment or departure, exclude Independent Tutor and non-Class activity, and defer Group and authored-product revenue allocation.

**Why:** current workspace, later Tutor replacement, private service, and product authorship cannot redirect lesson compensation.

### Decision 12: Make accounting append-only and server-authoritative

**Approved rule:** require immutable basis, accrual, adjustment, batch, transfer, recovery, statement, and reconciliation records with exact money, separation of duties, scoped privacy, idempotency, and compensating corrections.

**Why:** neither browser state nor one provider event is sufficient authority for money owed or paid.

## 37. Phase 13 invariants

The following invariants are authoritative:

1. Lesson Credits are not Tutor money.
2. A Student Credit Charge is not a Tutor Accrual Entry.
3. A Class outcome is not a Tutor payout.
4. A provider balance is not the Tutor Compensation Ledger.
5. Kelp Tutor compensation and Independent Tutor private payments remain separate.
6. One Kelp Tutor and currency have one append-only Compensation Ledger.
7. A displayed earnings total is derived rather than edited directly.
8. Every compensated Class pins one Compensation Basis Snapshot.
9. The snapshot pins service path, duration, currency, gross value, Tutor, and policy Versions.
10. A later catalog price change never rewrites a historical Basis Snapshot.
11. A valid duration change creates a successor Basis Snapshot.
12. Compensation never uses a timeless universal credit-to-money conversion.
13. Recurring 30-, 60-, and 90-minute gross values remain USD 20, USD 40, and USD 60 for the current Version.
14. Standalone 30-, 60-, and 90-minute gross values remain USD 25, USD 50, and USD 75 for the current Version.
15. The normal Tutor gross share is 75% of earned compensation basis.
16. Normal Kelp commission is the remaining 25%.
17. Ordinary processor fees do not silently reduce the 75% Tutor gross share.
18. Tutor-specific taxes and lawful withholding never rewrite gross compensation.
19. Promotional credits do not reduce Tutor compensation.
20. Discounted or mixed Credit Lots do not silently change Class compensation basis.
21. Credit transfers do not create a new Tutor pay rate.
22. Student Lot, promotion, and Payer details remain hidden from the Tutor unless separately authorized.
23. A Student no-show uses 50% of pinned gross lesson value as earned basis.
24. The Tutor share for a Student no-show is 75% of that no-show basis.
25. A no-show never pays 75% of the unprovided full gross value.
26. Compensation calculations preserve at least four decimal USD places internally.
27. Per-item cent rounding is forbidden when it would lose exact fractional-cent value.
28. One Payout Batch aggregates exact items before currency-minor-unit rounding.
29. Final transfer rounding uses half-even.
30. Every rounding adjustment is explicit and auditable.
31. A completed outcome normally supplies 100% earned basis.
32. Valid early completion normally supplies 100% earned basis.
33. Student early departure normally supplies 100% earned basis unless corrected.
34. Tutor no-show supplies zero earned basis.
35. Mutual absence supplies zero earned basis.
36. Confirmed Kelp outage preventing service supplies zero earned basis.
37. Valid zero-charge and protective cancellation supply zero earned basis.
38. Settlement Pending creates no payout eligibility.
39. Tutor early departure creates no automatic final accrual before review.
40. Confirmed outside-Kelp delivery may supply full basis only through the Phase 11 outcome.
41. An authorized reduced outcome supplies an explicit basis.
42. Phase 13 consumes outcomes and never reconstructs attendance or cancellation authority.
43. The compensation recipient comes from the effective Class teaching Assignment and Session history.
44. Reassignment after a Class never redirects that Class's accrual.
45. A Mentor earns lesson compensation only when acting through a valid supervised Kelp Tutor Assignment.
46. Observer, Guardian, Supervising Mentor, Quality Assistant, and Support presence creates no lesson compensation.
47. A Projected Meeting creates no Tutor accrual.
48. A pending Lesson Request or Credit Commitment creates no Tutor accrual.
49. Courtesy time and unauthorized extension create no additional compensation.
50. Orientation, Applicant training, Mock Sessions, and access-only communication create no ordinary Class compensation.
51. One effective compensation-bearing outcome Version creates at most one accrual.
52. Accrual creation is idempotent.
53. Every accrual links its exact Class outcome and Basis Snapshot.
54. A missing or conflicting final outcome blocks accrual finality.
55. The settlement hold ends 14 times 24 hours after the authoritative operational Class end.
56. Eligibility occurs no earlier than both hold end and final-outcome effectiveness.
57. Retry never shortens or restarts the settlement hold.
58. A Tutor may see held earnings without controlling them as wallet money.
59. Payout-account unreadiness delays transfer but does not erase earned compensation.
60. Loss of active teaching authority does not forfeit valid prior earnings.
61. An active legal or reconciliation block is explicit and scoped.
62. The ordinary Payout Batch locks at 00:00 on the 10th in the configured Kelp payout timezone.
63. Only items eligible before Batch lock enter that ordinary Batch.
64. Later eligibility rolls to the next regular Batch.
65. A non-banking 10th moves initiation to the next supported banking day without changing Batch identity.
66. Provider transit time does not change the contractual Batch date.
67. Kelp imposes no initial minimum payout threshold.
68. A Payout Batch can never be negative.
69. Different currencies are never netted together.
70. One eligible item belongs to at most one active Batch.
71. Exact items aggregate before recovery and final rounding.
72. A locked Batch pins one Tutor, currency, and payout destination Version.
73. A browser onboarding completion never proves payout readiness by itself.
74. Raw bank credentials are never stored in the Kelp application database.
75. A destination change after Batch lock never redirects the Batch silently.
76. One Batch can be paid at most once.
77. Provider events are reconciled evidence rather than unilateral internal authority.
78. Duplicate, unknown, late, or contradictory provider events never create a second transfer.
79. A failed or returned payout never erases the underlying payable amount.
80. A payout retry uses an explicit linked attempt.
81. A late provider success cannot cause duplicate repayment.
82. Every locked Batch creates an immutable Tutor statement Version.
83. Recovery Withholding appears separately from ordinary commission.
84. A statement correction creates a successor Version.
85. A goodwill refund alone never rewrites Class outcome or Tutor accrual.
86. A pre-payout outcome correction uses a Compensation Adjustment.
87. A submitted transfer is not silently edited to accommodate a refund.
88. An ordinary post-payout goodwill refund creates no Tutor debt.
89. A duplicate or erroneous Tutor payment requires a separately reviewed Compensation Correction.
90. A post-payout outcome correction never edits the paid item.
91. A positive post-payout correction enters a later eligible payout.
92. A negative post-payout correction is not automatically a Dispute Loss.
93. Dispute Loss equals disputed principal plus applicable fees minus recovered funds.
94. Kelp and the Kelp Tutor each bear 50% of an approved Dispute Loss.
95. Kelp covers the provider-facing loss before Tutor recovery.
96. Disputed multi-purpose purchases require traceable allocation to Classes and Tutors.
97. A Tutor is not assigned unrelated disputed Student value.
98. Zero-basis promotional value never manufactures Tutor dispute debt.
99. Recovery Withholding is at most 25% of future earned compensation basis.
100. Full Recovery Withholding temporarily reduces the Tutor cash share from 75% to 50% of earned basis.
101. A future Student no-show applies recovery to its reduced half basis.
102. Recovery never exceeds the remaining Tutor Recovery Balance.
103. Recovery never makes an item or Batch negative.
104. Recovery stops when the exact balance reaches zero.
105. Recovery Withholding is not Kelp commission.
106. Independent Tutor private earnings are never subject to Kelp Tutor recovery.
107. A Tutor receives scoped notice and a review route for Dispute Loss allocation.
108. Ending Kelp Tutor status never erases earned compensation or an approved recovery receivable.
109. A remaining departure balance enters manual account-receivable review.
110. Kelp never automatically charges an unrelated Tutor payment method for recovery.
111. Independent Tutor Classes create no Kelp compensation or payout records.
112. The Independent Tutor platform fee is never netted against Kelp Tutor earnings silently.
113. Group Course compensation remains blocked until its revenue-allocation contract is approved.
114. Authored Product royalties remain separate from lesson compensation.
115. Students and Guardians cannot see Tutor payout, recovery, tax, or bank details.
116. Mentors and Quality Assistants cannot see Tutor bank credentials through supervisory access.
117. A Tutor cannot create, approve, or mark their own accrual paid.
118. Financial corrections require scoped authority and separation of duties.
119. Two accruals cannot exist for one effective outcome Version.
120. One accrual cannot enter two active Batches.
121. One recovery event cannot withhold the same amount twice.
122. Corrections append successor entries and never delete financial history.
123. Failed required audit persistence prevents the transition from succeeding.
124. Database, browser, provider, Batch, transfer, and accounting state mismatches create reconciliation rather than guessed success.

## 38. Relationship to existing implementation

The repository does not yet implement the Phase 13 accounting authority. Any current Tutor dashboard earnings number, fixture, local-storage value, payment label, or projected lesson total is a display prototype only.

Later architecture must implement:

- exact money arithmetic;
- immutable Basis Snapshots and ledger entries;
- outcome-driven accrual;
- 14-day eligibility jobs;
- monthly Batch locking;
- provider onboarding and transfer reconciliation;
- recovery receivables and capped withholding;
- statements, corrections, privacy, and audit.

Phase 13 does not authorize database migrations, Stripe Connect setup, Docker, Supabase changes, payment transfers, frontend wiring, or external notifications.

## 39. Phase 13 completion and later-phase handoff

Phase 13 is final and authoritative.

The canonical glossary contains the finalized Phase 13 concepts and cumulative invariants. Later Support, Tutor conduct, contractor agreement, Group Course pricing, Authored Product, tax, notification, and payment-provider architecture contracts must consume this money lifecycle without deriving compensation from Lesson Credits, browser state, or private Independent Tutor payments.

No database, API, RLS, Docker, Supabase, Stripe, Twilio, payout, or frontend implementation is authorized by this contract.
