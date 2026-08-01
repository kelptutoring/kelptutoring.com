import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  dbTest,
  runner,
  runnerTest,
  packageJson,
  plan,
  productContract,
  scheduleContract,
  coverageMap
] = await Promise.all([
  readText('supabase/migrations/202607250001_course_schedule_version_coverage.sql'),
  readText('tools/course-schedule-version-coverage-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/local-supabase-acceptance-self-test.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('docs/schedule-data-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

for (const fragment of [
  'course_schedule_coverage_snapshot_is_valid',
  'course_schedule_coverage_display_label',
  'branch_element.value',
  'goal_element.value',
  'label_part text',
  'course_schedule_version_coverages',
  'build_legacy_course_schedule_coverage',
  "'goals', '[]'::jsonb",
  "'legacy_course_scope'",
  "'inherited'",
  'snapshot_course_schedule_version_coverage',
  'Course Schedule Version coverage is immutable',
  'Active Students and authorized staff read Version coverage',
  'Version coverage is authoritative from Phase 5.G.2.4.2'
]) {
  assert.ok(migration.includes(fragment), `Phase 5.G.2.4.2 migration is missing ${fragment}`)
}

assert.doesNotMatch(
  migration,
  /(?:update|delete\s+from)\s+public\.(?:student_courses|course_schedule_versions|course_schedule_items|course_progress_events|classrooms|classroom_memberships)/i,
  'The coverage backfill must not rewrite Course, Version, item, progress, Classroom, or Membership history'
)
assert.doesNotMatch(
  migration,
  /'goals',\s*jsonb_build_array\(\s*jsonb_build_object/i,
  'The legacy migration must not invent AP, SAT, ACT, IB, or another Goal'
)
assert.doesNotMatch(
  migration,
  /select\s+value\s+from\s+jsonb_array_elements/i,
  'Coverage JSON iterators must qualify their implicit value column to avoid PL/pgSQL name collisions'
)

for (const fragment of [
  'The retained Schedule Version coverage backfill is incomplete',
  'An existing single-focus Course received invented or invalid Version coverage',
  "coverage.metadata ->> 'sourceSubjectNodeId'",
  "coverage.metadata ->> 'sourceFocusNodeId'",
  'A valid multi-Subject Goal hierarchy was rejected',
  'The coverage label did not preserve only the selected Goals',
  'Coverage accepted more than one primary Track',
  'A newly created version did not receive its initial single-focus coverage',
  'A successor Version did not inherit the exact immutable coverage snapshot',
  'The Student received stale Version coverage history',
  'The assigned Tutor cannot read Version coverage history',
  'The supervising Mentor cannot read Version coverage history',
  'An unrelated account received private Version coverage',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.G.2.4.2 DB test is missing ${fragment}`)
}

const retainedCoverageBlock = dbTest.match(
  /do \$all_retained_versions_are_covered\$[\s\S]*?\$all_retained_versions_are_covered\$;/
)?.[0] || ''
assert.doesNotMatch(
  retainedCoverageBlock,
  /course\.(?:subject_node_id|focus_node_id)/,
  'Historical Version coverage must be checked against its immutable source metadata, not the mutable current Course focus'
)

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.G.2.4.2 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'course-schedule-version-coverage-db-self-test\.sql'/)
assert.match(runnerTest, /course-schedule-version-coverage-db-self-test\.sql/)
assert.match(
  packageJson,
  /"test:schedule-version-coverage": "node tools\/course-schedule-version-coverage-self-test\.mjs"/
)
assert.match(
  plan,
  /5\.G\.2\.4\.2 .*Versioned coverage and migration: Complete/i
)
assert.match(productContract, /Education level .* Subject .* Track .* Module .* Session/i)
assert.match(productContract, /Academic pathway.*optional Track metadata/i)
assert.match(scheduleContract, /immutable coverage snapshot/i)
assert.match(coverageMap, /Phase 5\.G\.2\.4\.2/i)

console.log(
  'Phase 5.G.2.4.2 immutable Version coverage, selected-pathway compatibility, safe backfill, inheritance, privacy, and rollback contracts passed.'
)
