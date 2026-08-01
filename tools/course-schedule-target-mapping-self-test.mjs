import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  interactionFollowup,
  dbTest,
  runner,
  runnerTest,
  packageJson,
  plan,
  contract,
  coverage
] =
  await Promise.all([
    readText('supabase/migrations/202607230008_course_schedule_target_mapping.sql'),
    readText('supabase/migrations/202607240003_classroom_schedule_interaction_followup.sql'),
    readText('tools/course-schedule-target-mapping-db-self-test.sql'),
    readText('tools/local-supabase-acceptance.mjs'),
    readText('tools/local-supabase-acceptance-self-test.mjs'),
    readText('package.json'),
    readText('IMPLEMENTATION_PLAN.md'),
    readText('docs/product/product-contract.md'),
    readText('tests/acceptance/COVERAGE_MAP.md')
  ])

for (const fragment of [
  'create table if not exists public.course_schedule_target_mapping_revisions',
  'create table if not exists public.course_schedule_academic_slot_targets',
  'course_schedule_target_mapping_revisions_immutable',
  'course_schedule_academic_slot_targets_immutable',
  'course_schedule_target_mapping_snapshot',
  'refresh_course_schedule_target_mapping',
  'refresh_active_course_schedule_target_mapping',
  'refresh_course_schedule_target_mapping_after_progress',
  'get_my_course_target_mapping',
  "'awaiting_future_slot'",
  "'automatic_next_unstudied'",
  "'student_selects_unstudied_topic'",
  "'requiresPurchase', false",
  "'requiresAutomaticClassBooking', false",
  "'onDemandBookingChoice', 'deferred_lesson_request_phase'",
  "'credits', 'deferred_credit_phase'",
  "'curriculum_topic',",
  "'practice',",
  "'wrap_up'",
  "'meetingPatternSemantics', 'neutral_academic_opportunity'",
  "'academic'"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.F.2.2 migration is missing ${fragment}`)
}

assert.doesNotMatch(
  migration,
  /create table if not exists public\.(?:classes|attendance|credit|lesson_requests)/i
)
assert.doesNotMatch(
  migration,
  /insert into public\.(?:credit_|class_|lesson_request)/i
)
assert.doesNotMatch(
  migration,
  /update public\.course_schedule_(?:target_mapping_revisions|academic_slot_targets)/i
)
assert.doesNotMatch(
  migration,
  /delete from public\.course_schedule_(?:target_mapping_revisions|academic_slot_targets)/i
)
assert.doesNotMatch(migration, /pattern\s*->>\s*'purpose'/i)
assert.doesNotMatch(migration, /advancesCurriculum/i)
assert.doesNotMatch(dbTest, /'purpose'\s*,/i)
assert.match(
  interactionFollowup,
  /drop constraint if exists course_schedule_target_mapping_version_signature_key/
)
assert.match(
  interactionFollowup,
  /create index if not exists course_schedule_target_mapping_version_signature_idx/
)

for (const fragment of [
  'Recurring opportunities retained a default purpose or duration-based progression rule',
  'The recurring Course did not map A-D and leave E awaiting a future slot',
  'Independent Study did not reflow recurring targets without exposing staff history',
  'The assigned Tutor did not retain append-only mapping history',
  'A corrected and re-marked topic did not retain all chronological mapping revisions',
  "time zone 'America/Sao_Paulo'",
  'Expected outsider target-mapping access to fail',
  'Adaptive on-demand reflow did not move C and D forward while preserving booking choice',
  'Expected browser target-mapping mutation to fail',
  'Expected privileged target-mapping mutation to fail',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.F.2.2 DB characterization is missing ${fragment}`)
}

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.F.2.2 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'course-schedule-target-mapping-db-self-test\.sql'/)
assert.match(runnerTest, /course-schedule-target-mapping-db-self-test\.sql/)
assert.match(
  packageJson,
  /"test:schedule-target-mapping": "node tools\/course-schedule-target-mapping-self-test\.mjs"/
)
assert.match(plan, /5\.F\.2\.2 .*Effective target mapping and capacity/i)
assert.match(contract, /Phase 5\.F\.2\.2/i)
assert.match(coverage, /Phase 5\.F\.2\.2/i)

console.log(
  'Phase 5.F.2.2 recurring reflow, on-demand selection, append-only mapping, and nonfinancial capacity contracts passed.'
)
