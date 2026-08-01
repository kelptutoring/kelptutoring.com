import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  recurringFallbackMigration,
  dbTest,
  runner,
  runnerTest,
  packageJson,
  plan,
  contract,
  coverage
] = await Promise.all([
  readText('supabase/migrations/202607230007_course_schedule_academic_slots.sql'),
  readText(
    'supabase/migrations/202607300004_course_schedule_recurring_date_fallback.sql'
  ),
  readText('tools/course-schedule-academic-slots-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/local-supabase-acceptance-self-test.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

for (const fragment of [
  'create table if not exists public.course_schedule_academic_slots',
  "source_kind in ('recurring_pattern', 'static_schedule')",
  'course_schedule_academic_slots_immutable',
  'generate_course_schedule_academic_slots',
  'generate_active_course_schedule_academic_slots',
  'get_my_course_academic_slots',
  "'slotGeneration', 'active_phase_5f2_1'",
  "'targetMapping', 'planned_phase_5f2_2'",
  "'outcomesAndRequeue', 'planned_phase_5f3'",
  "'calendarBookings', 'deferred_calendar_phase'",
  "'attendanceAndCredits', 'deferred_live_class_phase'",
  'meeting_pattern_review_required',
  "'static:' || ordered.stable_item_key",
  "'pattern:' || ordered.stable_pattern_key",
  "item.item_state in ('scheduled', 'requeued')",
  'Recurring slots use day/time/duration only'
]) {
  assert.ok(migration.includes(fragment), `Phase 5.F.2.1 migration is missing ${fragment}`)
}

const slotTableDefinition = migration.slice(
  migration.indexOf('create table if not exists public.course_schedule_academic_slots'),
  migration.indexOf('create index if not exists course_schedule_academic_slots_course_date_idx')
)
assert.doesNotMatch(
  slotTableDefinition,
  /\b(?:purpose|class_type)\b/i,
  'Academic slots must not store a planned or actual Class purpose.'
)
assert.doesNotMatch(migration, /create table if not exists public\.(?:classes|attendance|credit)/i)
assert.doesNotMatch(migration, /insert into public\.(?:learning_schedule_sessions|course_schedule_notification_events)/i)
assert.doesNotMatch(migration, /update public\.course_schedule_academic_slots/i)
assert.doesNotMatch(migration, /delete from public\.course_schedule_academic_slots/i)

for (const fragment of [
  'generated_recurring_date_fallback',
  "'fallback:' || ordered.stable_item_key",
  "'recurringDateFallback'",
  "'createsBookedClass', false",
  "'createsSixHourHold', false",
  'backfill_recurring_date_fallback_slots',
  "'manual_refresh'"
]) {
  assert.ok(
    recurringFallbackMigration.includes(fragment),
    `Recurring date-fallback migration is missing ${fragment}`
  )
}
assert.doesNotMatch(
  recurringFallbackMigration,
  /update public\.course_schedule_academic_slots/i
)
assert.doesNotMatch(
  recurringFallbackMigration,
  /delete from public\.course_schedule_academic_slots/i
)

for (const fragment of [
  'A recurring Course without a meeting pattern did not receive safe date-only pacing opportunities',
  'purpose-free generated academic occurrences',
  'The Student academic-slot projection exposed staff history',
  'Expected outsider academic-slot access to fail',
  'A successor Schedule Version did not receive a distinct immutable slot set',
  'The on-demand Course did not receive one date-only academic slot per active item',
  'Expected browser roles to be denied direct academic-slot updates',
  'Expected immutable academic-slot history to reject a privileged update',
  'Recurring local wall-clock slots are not ready for an IANA daylight-saving boundary',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.F.2.1 DB characterization is missing ${fragment}`)
}

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.F.2.1 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'course-schedule-academic-slots-db-self-test\.sql'/)
assert.match(runnerTest, /course-schedule-academic-slots-db-self-test\.sql/)
assert.match(packageJson, /"test:schedule-slot-generation": "node tools\/course-schedule-academic-slots-self-test\.mjs"/)
assert.match(plan, /5\.F\.2\.1 .*Immutable slot generation/i)
assert.match(contract, /Phase 5\.F\.2\.1/i)
assert.match(coverage, /Phase 5\.F\.2\.1/i)

console.log('Phase 5.F.2.1 immutable recurring/static academic-slot generation contracts passed.')
