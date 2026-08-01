import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  practicedMigration,
  databaseTest,
  runner,
  plan,
  productContract,
  coverageMap,
  testRunLog
] = await Promise.all([
  readText('supabase/migrations/202607220012_course_progress_hierarchical_aggregation.sql'),
  readText('supabase/migrations/202607260009_course_progress_practiced_aggregation.sql'),
  readText('tools/course-progress-hierarchical-aggregation-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md'),
  readText('tests/acceptance/TEST_RUN_LOG.md')
])

for (const fragment of [
  'course_session_studied_aggregation',
  'course_session_progress_aggregation',
  'course-session-studied-aggregate',
  "'required_resources'",
  "'inherited_session'",
  "'explicit_resource'",
  "'session_studied_derived'",
  "'session_studied_derived_reversed'",
  'explicitStudiedRequiredResourceCount',
  'advancesAcademicPointer',
  'record_course_progress_phase5e2',
  'reverse_course_progress_phase5e2',
  'get_my_course_progress_phase5e2',
  'Reverse the Session-level Studied mark',
  'required_count > 0',
  "resource.requirement_state in ('required', 'optional')",
  "'active_phase_5e3'"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.E.3 migration is missing: ${fragment}`)
}

assert.match(migration, /new\.event_action in \('marked', 'reflection_amended'\)[\s\S]*new\.target_kind <> 'session'/)
assert.match(migration, /new\.progress_kind <> 'studied'/)
assert.match(
  migration,
  /create or replace function public\.record_course_progress\([\s\S]*p_effective_at timestamptz,\s*p_reflection text,\s*p_student_explanation text,/
)
assert.doesNotMatch(migration, /insert into public\.course_progress_events[\s\S]*inherited_session/i)
assert.doesNotMatch(
  migration,
  /grant\s+select\s+on\s+public\.course_progress_(?:events|notification_events)\s+to\s+authenticated/i
)
assert.match(migration, /create or replace function public\.protect_studied_course_schedule_items/)
assert.match(migration, /course_session_studied_aggregation\(old\.id, item\.id\)/)

for (const fragment of [
  'course_session_practiced_aggregation',
  "'required_resources'",
  "'inherited_session'",
  'explicitPracticedRequiredResourceCount',
  "'direct_session'",
  "'explicit_resource'",
  "'{practiced}'",
  "'{resources}'",
  'advancesAcademicPointer',
  'required_count > 0'
]) {
  assert.ok(
    practicedMigration.includes(fragment),
    `Practiced hierarchy migration is missing: ${fragment}`
  )
}
assert.doesNotMatch(
  practicedMigration,
  /insert into public\.course_progress_events[\s\S]*inherited_session/i
)

for (const fragment of [
  'partial_resources_do_not_aggregate',
  'required_resources_derive_studied',
  'derived_studied_structural_lock',
  'student_studied_resource_reversal_denied',
  'resource_correction_reverses_derived_state',
  'direct_session_inheritance',
  'parent_first_correction',
  'parent_reversal_preserves_explicit_children',
  'resource_correction_reopens_winddown',
  'no_required_and_practice_contract',
  'staff_not_assigned_visibility',
  'guardian_progress_denied',
  'outsider_progress_denied',
  'rollback;'
]) {
  assert.ok(databaseTest.includes(fragment), `Phase 5.E.3 DB test is missing: ${fragment}`)
}

assert.equal(
  (databaseTest.match(/p_reflection =>/g) || []).length,
  3,
  'Student reflections should use named RPC arguments so they cannot drift into staff-only explanation fields.'
)
assert.match(
  databaseTest,
  /derived_studied_structural_lock[\s\S]*'stableItemKey', 'phase5e3-db-derived-session'[\s\S]*'state', 'dropped'/
)
assert.match(
  databaseTest,
  /practiced,source\}' <> 'required_resources'[\s\S]*explicitPracticedRequiredResourceCount\}' <> '2'/
)
assert.match(
  databaseTest,
  /stableResourceKey' = 'no-required-optional'[\s\S]*practiced,source\}' = 'inherited_session'/
)
assert.match(databaseTest, /set local role authenticated;/i)
assert.match(runner, /course-progress-hierarchical-aggregation-db-self-test\.sql/)
assert.match(plan, /5\.E\.3 .*Hierarchical aggregation: Complete/i)
assert.match(productContract, /Phase 5\.E\.3 .*hierarchical aggregation/i)
assert.match(coverageMap, /course-progress-hierarchical-aggregation-db-self-test\.sql/)
assert.match(testRunLog, /RUN-20260723-013 .*Phase 5\.E\.3 hierarchical aggregation/i)

console.log('Phase 5.E.3 hierarchical Course progress aggregation source contracts passed.')
