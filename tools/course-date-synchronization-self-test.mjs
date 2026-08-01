import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, dbTest, runner, plan, contract, coverage] = await Promise.all([
  readText('supabase/migrations/202607220007_course_date_synchronization.sql'),
  readText('tools/course-date-synchronization-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

for (const fragment of [
  'activated_start_date date',
  'student_courses_activated_start_date_check',
  'course_schedule_version_date_bounds',
  'synchronize_student_course_schedule_dates',
  'student_courses_require_schedule,',
  'student_courses_active_schedule_version_fkey',
  "item.item_state in ('scheduled', 'requeued')",
  'A later Schedule Version cannot move an activated Course before its locked start date',
  'A past-only Schedule revision requires the explicit Course finish flow',
  "new.status = 'wind_down'",
  "new.status := 'active'",
  "'schemaVersion', 2",
  "'courseDateSynchronization', 'active_phase_5c'"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.C migration is missing ${fragment}`)
}

assert.match(migration, /before insert or update on public\.student_courses/)
assert.match(migration, /new\.start_date := bounds\.first_date;[\s\S]*new\.scheduled_end_date := bounds\.last_date/)
assert.match(migration, /new\.start_date := locked_start;[\s\S]*new\.scheduled_end_date := bounds\.last_date/)
assert.match(migration, /scheduled_end_date = bounds\.last_date/)
assert.match(migration, /'windDownEndsOn', course\.wind_down_ends_on/)
assert.doesNotMatch(migration, /update public\.course_schedule_(?:versions|items)/i)

for (const fragment of [
  'Draft version 1 did not derive the complete Phase 5.C Course range',
  'A draft Course did not follow both edges of its revised Schedule',
  'Course activation did not establish the permanent Schedule start lock',
  'Extending an active Schedule did not synchronize the Course endpoint',
  'Shortening an active Schedule changed its start or lost immutable history',
  'Expected a backdated active Schedule revision to fail',
  'Expected a dropped-only active Schedule Version to fail',
  'A direct Course date write bypassed Schedule authority',
  'A valid wind-down extension did not reopen and resynchronize the Course',
  'Expected an elapsed Schedule activation to fail',
  'Expected outsider synchronized Course Schedule access to fail',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.C DB characterization is missing ${fragment}`)
}

assert.match(runner, /file: 'course-date-synchronization-db-self-test\.sql'/)
assert.match(runner, /student_b_id: 'ACT-STUDENT-B'/)
assert.match(plan, /5\.C .*Course-date synchronization/i)
assert.match(contract, /activated Course start/i)
assert.match(contract, /scheduled and requeued/i)
assert.match(coverage, /Phase 5\.C/i)

console.log('Phase 5.C authoritative Course date synchronization schema, invariant, projection, and rollback characterization self-test passed.')
