import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, dbTest, runner, runnerTest, packageJson, plan, contract, coverage] = await Promise.all([
  readText('supabase/migrations/202607230006_course_schedule_meeting_patterns.sql'),
  readText('tools/course-schedule-meeting-pattern-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/local-supabase-acceptance-self-test.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

for (const table of [
  'course_schedule_meeting_patterns',
  'course_schedule_meeting_pattern_changes'
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`))
}

for (const fragment of [
  "purpose in ('theory', 'practice', 'review', 'exam', 'wrap_up')",
  "duration_minutes in (30, 60, 90)",
  "purpose <> 'theory' or duration_minutes in (60, 90)",
  'course_schedule_meeting_patterns_version_time unique',
  'course_schedule_meeting_patterns_immutable',
  'inherit_course_schedule_meeting_patterns',
  'publish_course_meeting_pattern_version',
  'get_my_course_meeting_pattern',
  'Only a recurring Course owns a weekly meeting pattern.',
  'A recurring Course requires at least one weekly Theory slot.',
  'The Schedule changed after this page loaded. Refresh it before publishing your edits.',
  'A meeting-pattern Version cannot rewrite elapsed Course dates.',
  'A meeting pattern cannot extend beyond the current Course Schedule.',
  "'changeScope', 'meeting_pattern'",
  "'meetingPatternContract', 'active_phase_5f1'",
  "'slotGeneration', 'planned_phase_5f2'",
  "'outcomesAndRequeue', 'planned_phase_5f3'",
  "'advancesCurriculum', pattern.purpose = 'theory'"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.F.1 migration is missing ${fragment}`)
}

assert.match(migration, /course_record\.status not in \('draft', 'active'\)/)
assert.match(migration, /course_record\.service_model <> 'recurring'/)
assert.match(
  migration,
  /p_effective_from < \(case[\s\S]*?end\) then/,
  'The PL/pgSQL IF must parenthesize its CASE expression so its inner THEN is not parsed as the IF boundary.'
)
assert.match(migration, /course_record\.active_schedule_version_id <> p_expected_version_id/)
assert.match(migration, /prior_receipt\.request_payload <> request_payload/)
assert.match(migration, /insert into public\.course_schedule_versions[\s\S]*previous_version_id/)
assert.match(migration, /insert into public\.course_schedule_items[\s\S]*from public\.course_schedule_items/)
assert.match(migration, /insert into public\.course_schedule_notification_events/)
assert.match(migration, /course\.student_id = \(select auth\.uid\(\)\)[\s\S]*active_schedule_version_id/)
assert.doesNotMatch(migration, /create table if not exists public\.(?:classes|class_events|attendance|credit)/i)
assert.doesNotMatch(migration, /delete from public\.course_schedule/i)
assert.doesNotMatch(migration, /update public\.course_schedule_(?:versions|items|meeting_patterns)/i)

for (const fragment of [
  'The assigned Tutor did not receive the complete Phase 5.F.1 meeting-pattern contract',
  'An exact meeting-pattern retry created duplicate effects',
  'Expected an unsupported meeting duration to fail',
  'Expected duplicate weekly local starts to fail',
  'Expected a backdated active pattern to fail',
  'Expected stale Mentor pattern publishing to fail',
  'The Student meeting-pattern projection exposed staff history',
  'Expected Student meeting-pattern publishing to fail',
  'Expected outsider meeting-pattern access to fail',
  'A structural successor lost its inherited meeting pattern',
  'The self-employed Tutor could not publish the ordinary recurring meeting pattern',
  'Expected immutable meeting-pattern history to reject an update',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.F.1 DB characterization is missing ${fragment}`)
}

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.F.1 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'course-schedule-meeting-pattern-db-self-test\.sql'/)
assert.match(runner, /independent_tutor_id: 'ACT-TEACHER'/)
assert.match(runnerTest, /course-schedule-meeting-pattern-db-self-test\.sql/)
assert.match(packageJson, /"test:schedule-slots": "node tools\/course-schedule-meeting-pattern-self-test\.mjs"/)
assert.match(plan, /5\.F\.1 .*Recurrence and slot contract/i)
assert.match(contract, /meeting pattern/i)
assert.match(coverage, /Phase 5\.F\.1/i)

console.log('Phase 5.F.1 immutable recurring meeting-pattern, authority, privacy, versioning, and rollback contracts passed.')
