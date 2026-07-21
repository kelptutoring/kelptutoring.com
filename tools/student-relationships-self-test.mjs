import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const readJson = async (path) => JSON.parse(await readText(path))

const [migration, dbTest, actorMap, actorReference, runner, productContract] = await Promise.all([
  readText('supabase/migrations/202607200004_student_relationship_classroom_foundation.sql'),
  readText('tools/student-relationships-db-self-test.sql'),
  readJson('tests/acceptance/fixtures/local-supabase-actor-map-v1.json'),
  readJson('tests/acceptance/fixtures/authorization-standard-actors-v1.json'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('docs/product/product-contract.md')
])

for (const table of [
  'teaching_qualifications',
  'mentor_tutor_assignments',
  'student_courses',
  'classrooms',
  'classroom_memberships',
  'learning_relationship_events'
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`))
}

for (const fn of [
  'grant_teaching_qualification',
  'assign_tutor_supervisor',
  'create_student_course_draft',
  'activate_student_course',
  'get_my_learning_relationships'
]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${fn}`))
}

assert.match(migration, /mentor_tutor_one_active_supervisor_idx/)
assert.match(migration, /The Tutor is not qualified for the selected Course focus/)
assert.match(migration, /The Tutor's supervisory Mentor is not qualified|The Tutor''s supervisory Mentor is not qualified/)
assert.match(migration, /membership_role in \('student', 'tutor', 'mentor', 'guardian'\)/)
assert.match(migration, /student_courses_mentor_idempotency_key unique/)
assert.match(migration, /wind_down_ends_on date generated always as \(scheduled_end_date \+ 14\)/)
assert.doesNotMatch(migration, /create table if not exists public\.(?:tutor_availability|lesson_requests|credit_balances|class_attendance)/i)

const mapByAlias = new Map(actorMap.actors.map((actor) => [actor.alias, actor]))
const referenceByAlias = new Map(actorReference.actors.map((actor) => [actor.alias, actor]))
assert.equal(mapByAlias.get('ACT-STUDENT-B')?.id, '90000000-0000-4000-8000-000000000009')
assert.deepEqual(mapByAlias.get('ACT-STUDENT-B')?.roles, ['student'])
assert.ok(referenceByAlias.has('ACT-STUDENT-B'))
assert.ok(mapByAlias.has('ACT-OUTSIDER'), 'The unlinked outsider must remain available for denial tests.')

for (const fragment of [
  "file: 'student-relationships-db-self-test.sql'",
  "p_idempotency_key: input.idempotencyKey",
  "'acceptance-dashboard-student-a'",
  "'acceptance-dashboard-student-b'",
  "await verifyRelationshipFixtures(context, password)"
]) {
  assert.ok(runner.includes(fragment), `Relationship provisioning runner is missing ${fragment}`)
}

for (const variable of ['admin_id', 'mentor_id', 'tutor_id', 'student_a_id', 'student_b_id', 'outsider_id']) {
  assert.ok(dbTest.includes(`\\if :{?${variable}}`), `DB characterization does not require ${variable}`)
  assert.ok(dbTest.includes(`:'${variable}'::uuid`), `DB characterization does not consume ${variable}`)
}
assert.match(dbTest, /set local role authenticated/i)
assert.match(dbTest, /Student A RLS exposed another Student relationship/)
assert.match(dbTest, /The unlinked outsider received relationship data/)
assert.match(dbTest, /rollback;/i)
assert.match(productContract, /### Phase 2\.A implementation boundary/)

console.log('Phase 2.A relationship schema, deterministic actors, RLS characterization, and boundary self-test passed.')
