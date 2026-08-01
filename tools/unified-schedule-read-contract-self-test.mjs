import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, dbTest, runner, runnerTest, packageJson, plan, contract, coverage] =
  await Promise.all([
    readText('supabase/migrations/202607240008_unified_schedule_read_contract.sql'),
    readText('tools/unified-schedule-read-contract-db-self-test.sql'),
    readText('tools/local-supabase-acceptance.mjs'),
    readText('tools/local-supabase-acceptance-self-test.mjs'),
    readText('package.json'),
    readText('IMPLEMENTATION_PLAN.md'),
    readText('docs/product/product-contract.md'),
    readText('tests/acceptance/COVERAGE_MAP.md')
  ])

for (const fragment of [
  'get_my_unified_course_schedule_phase5f5',
  'project_phase5g1_timeline_rows',
  "'course_schedule_read'",
  "'5.G.1'",
  "'active_phase_5g1'",
  "'planned'",
  "'awaiting'",
  "'pending_confirmation'",
  "'delivered'",
  "'not_delivered'",
  "'cancelled'",
  "'student_absent'",
  "'tutor_absent'",
  "'technical_issue'",
  "'outside_kelp_unconfirmed'",
  "'unverified'",
  "'viewer_local_noon'",
  "'assignmentDeadlinesAreIndependent', true",
  "'assignmentDeadlineChangesMoveMeetings', false",
  "'academicSlotsCreateBookings', false",
  "'layoutMode', 'modules'",
  "'layoutMode', 'higher_level_timeline'",
  "'authoritative', false",
  "'consumerCutover', 'planned_phase_5g2'",
  "'integrationEvents', 'planned_phase_5g3'"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.G.1 migration is missing ${fragment}`)
}

assert.doesNotMatch(
  migration,
  /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.(?:course_progress|course_schedule|learning_schedule|credit|tutor_settlement)/i,
  'The Phase 5.G.1 read contract must not mutate Schedule, progress, mirror, or financial data'
)
assert.doesNotMatch(
  migration,
  /grant\s+(?:insert|update|delete|all)\s+on/i,
  'The Phase 5.G.1 read contract must not grant direct table mutation authority'
)

for (const fragment of [
  'The Phase 5.G.1 meeting or date-only presentation vocabulary is invalid',
  'The Student did not receive the canonical module-based Schedule contract',
  'The assigned Tutor did not receive the detailed staff Schedule contract',
  'The supervising Mentor did not receive the canonical Course context',
  'Expected unrelated Phase 5.G.1 access to fail',
  'The Guardian received detailed academic or staff Schedule data',
  'A private Phase 5.G.1 projection helper is browser-executable',
  '2026-08-01T12:00:00Z',
  'viewer_local_noon',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.G.1 DB characterization is missing ${fragment}`)
}

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.G.1 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'unified-schedule-read-contract-db-self-test\.sql'/)
assert.match(runnerTest, /unified-schedule-read-contract-db-self-test\.sql/)
assert.match(
  packageJson,
  /"test:schedule-read-contract": "node tools\/unified-schedule-read-contract-self-test\.mjs"/
)
assert.match(plan, /5\.G\.1 .*Canonical read contract/i)
assert.match(contract, /Phase 5\.G\.1/i)
assert.match(coverage, /Phase 5\.G\.1/i)

console.log(
  'Phase 5.G.1 canonical module, timeline, Calendar-presentation, role-redaction, and legacy-mirror read contracts passed.'
)
