import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, dbTest, runner, provisioner, plan, contract] = await Promise.all([
  readText('supabase/migrations/202607220006_required_versioned_course_schedule.sql'),
  readText('tools/required-versioned-course-schedule-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/provision-mentor-sandbox.mjs'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md')
])

for (const table of ['course_schedules', 'course_schedule_versions', 'course_schedule_items']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`))
}

for (const fragment of [
  'active_schedule_version_id uuid',
  'student_courses_require_schedule',
  'deferrable initially deferred',
  'reject_course_schedule_version_mutation',
  'create_student_course_with_schedule_draft',
  'get_my_course_schedule',
  "provider_kind in ('kelp', 'independent_tutor')",
  "service_model in ('recurring', 'on_demand', 'access_only')",
  "'requiredSchedule', 'active_phase_5b'",
  'Compatibility mirror for Calendar and practice assignments'
]) {
  assert.ok(migration.includes(fragment), `Phase 5.B migration is missing ${fragment}`)
}

assert.match(migration, /insert into public\.course_schedules[\s\S]*from public\.student_courses course/)
assert.match(migration, /insert into public\.course_schedule_versions[\s\S]*Phase 5\.B migration/)
assert.match(migration, /insert into public\.course_schedule_items[\s\S]*migration-initial-plan/)
assert.match(migration, /course\.mentor_id is not null[\s\S]*independent_tutor/)
assert.doesNotMatch(migration, /drop table (?:public\.)?learning_schedules/i)
assert.doesNotMatch(migration, /delete from public\.learning_schedule_sessions/i)

for (const fragment of [
  'A retained Course was not backfilled with its required active Schedule Version',
  'The atomic Kelp Course and Schedule version 1 projection is incomplete',
  'The revised Schedule did not preserve auditable version 1',
  'Expected immutable Schedule Version update to fail',
  'Expected a schedule-less Course to be rejected',
  'The independent Tutor cannot read the expected self-employed Course contract',
  'Classroom Membership RLS should expose exactly the Tutor',
  'The independent Classroom requires two underlying active Memberships',
  'A self-employed independent Classroom must not contain a Mentor Membership',
  'Student Schedule RLS exposed another Student Course',
  'Expected outsider Course Schedule access to fail',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.B DB characterization is missing ${fragment}`)
}

assert.match(runner, /file: 'required-versioned-course-schedule-db-self-test\.sql'/)
assert.match(runner, /independent_tutor_id: 'ACT-TEACHER'/)
assert.match(runner, /callRpc\(context, 'create_student_course_with_schedule_draft'/)
assert.match(provisioner, /callRpc\(context, 'create_student_course_with_schedule_draft'/)
assert.match(provisioner, /schedule: mechanicsScheduleInput/)
assert.match(provisioner, /schedule: algebraScheduleInput/)
assert.match(provisioner, /ensureAllActiveSubjectQualifications/)
assert.match(provisioner, /Oliver Bennett all-Track sandbox access/)
assert.match(provisioner, /node_type: 'eq\.subject'/)
assert.match(plan, /5\.B .*Required versioned Schedule/i)
assert.match(contract, /Schedule Version.*immutable/i)

console.log('Phase 5.B required versioned Course Schedule schema, provisioning, authorization, and rollback characterization self-test passed.')
