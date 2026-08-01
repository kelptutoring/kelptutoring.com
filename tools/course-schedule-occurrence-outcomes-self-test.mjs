import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, dbTest, runner, runnerTest, packageJson, plan, contract, coverage] =
  await Promise.all([
    readText('supabase/migrations/202607230009_course_schedule_occurrence_outcomes.sql'),
    readText('tools/course-schedule-occurrence-outcomes-db-self-test.sql'),
    readText('tools/local-supabase-acceptance.mjs'),
    readText('tools/local-supabase-acceptance-self-test.mjs'),
    readText('package.json'),
    readText('IMPLEMENTATION_PLAN.md'),
    readText('docs/product/product-contract.md'),
    readText('tests/acceptance/COVERAGE_MAP.md')
  ])

for (const fragment of [
  "'quality_assistant'",
  "'course.outcome.oversight'",
  'create table if not exists public.course_schedule_target_locks',
  'create table if not exists public.course_schedule_occurrence_outcome_events',
  'create table if not exists public.course_schedule_occurrence_dispute_events',
  'course_schedule_occurrence_one_resolution_idx',
  'create table if not exists public.course_schedule_occurrence_evidence',
  "'course-outcome-evidence'",
  'course_schedule_target_locks_immutable',
  'course_schedule_occurrence_outcomes_immutable',
  'lock_due_course_schedule_targets',
  'record_course_occurrence_outcome',
  'confirm_course_occurrence_delivery',
  'submit_course_occurrence_dispute',
  'resolve_course_occurrence_dispute',
  'settle_due_course_occurrence_outcomes',
  'get_my_course_occurrence_outcomes',
  "'student_no_show'",
  "'tutor_no_show'",
  "'outside_kelp_claim'",
  "'technical_uncertain'",
  "'full_charge'",
  "'half_charge'",
  "'no_charge'",
  "'pending'",
  "interval '6 hours'",
  "interval '14 days'",
  "'financialPosting', 'deferred'",
  "'creditPosted', false",
  "'tutorSettlementPosted', false",
  "'course-occurrence'",
  "'outcome_reflow'",
  "'deferred_credit_phase'",
  "'deferred_live_class_phase'"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.F.3 migration is missing ${fragment}`)
}

assert.doesNotMatch(
  migration,
  /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.(?:credit|student_credit|tutor_settlement|tutor_payout)/i
)
assert.doesNotMatch(
  migration,
  /create table if not exists public\.(?:classes|class_attendance|credit_ledger|tutor_settlements)/i
)
assert.doesNotMatch(
  migration,
  /grant\s+(?:insert|update|delete|all)\s+on\s+public\.course_schedule_occurrence_/i
)
assert.doesNotMatch(
  migration,
  /storage_bucket text not null default 'classroom-files'/i
)

for (const fragment of [
  'Review did not retain/requeue Topic A with a nonfinancial 14-day outcome recommendation',
  'The Student received raw staff outcome or evidence data',
  'Expected Student outcome authority to fail',
  'Expected Student private-evidence authority to fail',
  'An exact dispute-submission retry did not return the original result',
  'The Mentor did not resolve the dispute through append-only history',
  'Expected outsider outcome access to fail',
  'The Quality Assistant did not receive occurrence oversight',
  'Outcome evidence was not isolated from ordinary Classroom Files',
  'Expected append-only outcome mutation to fail',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.F.3 DB characterization is missing ${fragment}`)
}

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.F.3 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'course-schedule-occurrence-outcomes-db-self-test\.sql'/)
assert.match(runnerTest, /course-schedule-occurrence-outcomes-db-self-test\.sql/)
assert.match(
  packageJson,
  /"test:schedule-outcomes": "node tools\/course-schedule-occurrence-outcomes-self-test\.mjs"/
)
assert.match(plan, /5\.F\.3 .*Occurrence outcomes/i)
assert.match(contract, /Phase 5\.F\.3/i)
assert.match(coverage, /Phase 5\.F\.3/i)

console.log(
  'Phase 5.F.3 target locks, outcome authority, requeue, disputes, private evidence, and 14-day nonfinancial settlement contracts passed.'
)
