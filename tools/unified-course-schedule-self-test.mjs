import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, viewerTimezone, dbTest, runner, runnerTest, packageJson, plan, contract, coverage] =
  await Promise.all([
    readText('supabase/migrations/202607230011_unified_course_schedule_projection.sql'),
    readText('supabase/migrations/202607230012_student_schedule_viewer_timezone.sql'),
    readText('tools/unified-course-schedule-db-self-test.sql'),
    readText('tools/local-supabase-acceptance.mjs'),
    readText('tools/local-supabase-acceptance-self-test.mjs'),
    readText('package.json'),
    readText('IMPLEMENTATION_PLAN.md'),
    readText('docs/product/product-contract.md'),
    readText('tests/acceptance/COVERAGE_MAP.md')
  ])

for (const fragment of [
  'get_my_unified_course_schedule',
  "'meeting'",
  "'independent_progress'",
  "'planned_topic'",
  "'past'",
  "'next'",
  "'upcoming'",
  "'planned'",
  "'confirmed'",
  "'guardian_summary'",
  "'staff_audit'",
  "'recommendationsOnly', true",
  "'active_phase_5f4'",
  'course_schedule_target_locks',
  'course_schedule_occurrence_outcome_events',
  'course_session_progress_aggregation',
  'course_schedule_target_mapping_revisions'
]) {
  assert.ok(migration.includes(fragment), `Phase 5.F.4 migration is missing ${fragment}`)
}

assert.doesNotMatch(
  migration,
  /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.(?:course_progress|course_schedule|credit|tutor_settlement)/i,
  'The unified projection must remain read-only'
)
assert.match(viewerTimezone, /get_my_unified_course_schedule_phase5f4/)
assert.match(viewerTimezone, /payload #>> '\{viewer,viewMode\}' = 'student'/)
assert.match(viewerTimezone, /'\{schedule,timeZone\}'/)
assert.match(viewerTimezone, /array\['groups', group_key\]/)

assert.doesNotMatch(
  migration,
  /grant\s+(?:insert|update|delete|all)\s+on/i,
  'The unified projection must not grant direct mutation authority'
)

for (const fragment of [
  'The Student did not receive one redacted Past/Next/Upcoming timeline',
  'The assigned Tutor did not receive the staff audit projection',
  'The supervising Mentor did not receive the staff audit projection',
  'Expected unrelated unified-Schedule access to fail',
  'The Quality Assistant did not receive outcome oversight',
  'The Guardian projection exposed lesson-level or staff-only detail',
  "interval '6 hours'",
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.F.4 DB characterization is missing ${fragment}`)
}

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.F.4 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'unified-course-schedule-db-self-test\.sql'/)
assert.match(runnerTest, /unified-course-schedule-db-self-test\.sql/)
assert.match(
  packageJson,
  /"test:schedule-unified": "node tools\/unified-course-schedule-self-test\.mjs"/
)
assert.match(plan, /5\.F\.4 .*Unified projection/i)
assert.match(contract, /Phase 5\.F\.4/i)
assert.match(coverage, /Phase 5\.F\.4/i)

console.log(
  'Phase 5.F.4 unified Student, Guardian, Tutor, Mentor, and Quality Assistant Schedule projection contracts passed.'
)
