import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  timezoneBoundaryMigration,
  dbTest,
  runner,
  packageJson,
  plan,
  contract,
  coverage
] = await Promise.all([
  readText('supabase/migrations/202607220008_course_schedule_structural_editing.sql'),
  readText('supabase/migrations/202607230010_course_schedule_local_date_boundary.sql'),
  readText('tools/course-schedule-structural-editing-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

for (const table of [
  'course_schedule_change_reasons',
  'course_schedule_version_changes',
  'course_schedule_publish_commands',
  'course_schedule_notification_events'
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`))
}

for (const fragment of [
  "values ('schedule.edit'",
  "('teacher', 'schedule.edit')",
  "('tutor', 'schedule.edit')",
  "('mentor', 'schedule.edit')",
  "item_kind in ('curriculum_topic', 'review', 'exam')",
  'current_user_can_read_course_schedule_history',
  'current_user_can_edit_course_schedule',
  'publish_course_schedule_version',
  'The Schedule changed after this page loaded. Refresh it before publishing your edits.',
  'Past Schedule items are locked and cannot be changed.',
  'This Course does not currently accept ordinary structural Schedule edits.',
  'Direct Schedule synchronization is closed.',
  "'schemaVersion', 3",
  "'structuralEditing', 'active_phase_5d'",
  "then 'active' else 'superseded' end"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.D migration is missing ${fragment}`)
}

assert.match(migration, /course_record\.status not in \('draft', 'active'\)/)
assert.match(migration, /course_record\.active_schedule_version_id <> p_expected_version_id/)
assert.match(migration, /prior_receipt\.request_payload <> request_payload/)
assert.match(migration, /update public\.learning_schedule_sessions[\s\S]*status = 'removed'/)
assert.match(migration, /insert into public\.course_schedule_versions[\s\S]*previous_version_id/)
assert.match(migration, /insert into public\.course_schedule_notification_events/)
assert.match(migration, /course\.student_id = \(select auth\.uid\(\)\)[\s\S]*course\.active_schedule_version_id/)
assert.doesNotMatch(migration, /delete from public\.course_schedule_(?:versions|items)/i)
assert.doesNotMatch(migration, /update public\.course_schedule_(?:versions|items)/i)

for (const fragment of [
  'course_schedule_version_current_date',
  "now() at time zone version.time_zone",
  'prior_item.scheduled_date < current_date',
  'prior_item.scheduled_date < public.course_schedule_version_current_date(prior_item.version_id)',
  'pg_get_functiondef',
  'execute patched_definition'
]) {
  assert.ok(
    timezoneBoundaryMigration.includes(fragment),
    `The Schedule-timezone boundary migration is missing ${fragment}`
  )
}
assert.doesNotMatch(
  timezoneBoundaryMigration,
  /grant execute on function public\.course_schedule_version_current_date/i
)

for (const fragment of [
  'The assigned Tutor did not receive the complete Phase 5.D structural publishing contract',
  'An exact structural publishing retry created duplicate effects',
  'The Student Schedule projection exposed staff history',
  'A stale Mentor save left a partial immutable Version',
  'The refreshed Mentor publish did not atomically override the future plan',
  'Restoring a dropped Session rewrote history or failed to activate the successor snapshot',
  'The Student effective Schedule did not expose the restored Session',
  'Expected outsider structural publishing to fail',
  'Expected administrator routine structural publishing to fail',
  'The self-employed Tutor could not exercise combined Schedule authority',
  'Expected wind-down structural publishing to fail',
  'Expected immutable Schedule history to reject an update',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.D DB characterization is missing ${fragment}`)
}

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(block[0], /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.D embeds a psql variable inside a dollar-quoted DO block')
}

assert.match(runner, /file: 'course-schedule-structural-editing-db-self-test\.sql'/)
assert.match(runner, /independent_tutor_id: 'ACT-TEACHER'/)
assert.match(packageJson, /"test:schedule-editing": "node tools\/course-schedule-structural-editing-self-test\.mjs"/)
assert.match(plan, /5\.D .*Structural editing authority/i)
assert.match(contract, /superseded Schedule Version/i)
assert.match(coverage, /Phase 5\.D/i)

console.log('Phase 5.D structural Schedule authority, immutable publishing, RLS, concurrency, audit, notifications, and rollback characterization self-test passed.')
