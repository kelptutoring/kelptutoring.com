import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const readJson = async (path) => JSON.parse(await readText(path))

const sqlContracts = [
  { file: 'tools/content-publication-db-self-test.sql', variables: ['tutor_id', 'mentor_id'] },
  { file: 'tools/curriculum-taxonomy-db-self-test.sql', variables: ['mentor_id', 'admin_id'] },
  { file: 'tools/question-bank-db-self-test.sql', variables: ['mentor_id', 'tutor_id'] },
  { file: 'tools/course-composition-db-self-test.sql', variables: ['mentor_id', 'tutor_id'] },
  { file: 'tools/course-practice-delivery-db-self-test.sql', variables: ['mentor_id', 'student_id', 'outsider_id'] },
  { file: 'tools/student-profile-preferences-db-self-test.sql', variables: ['student_id', 'outsider_id'] },
  {
    file: 'tools/student-relationships-db-self-test.sql',
    variables: ['admin_id', 'mentor_id', 'tutor_id', 'student_a_id', 'student_b_id', 'outsider_id']
  },
  {
    file: 'tools/course-progress-hierarchical-aggregation-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'student_b_id', 'outsider_id']
  },
  {
    file: 'tools/builder-effective-student-schedule-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'outsider_id']
  },
  {
    file: 'tools/course-schedule-meeting-pattern-db-self-test.sql',
    variables: [
      'admin_id', 'mentor_id', 'tutor_id', 'student_a_id',
      'student_b_id', 'independent_tutor_id', 'outsider_id'
    ]
  },
  {
    file: 'tools/course-schedule-academic-slots-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'student_b_id', 'outsider_id']
  },
  {
    file: 'tools/course-schedule-target-mapping-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'student_b_id', 'outsider_id']
  },
  {
    file: 'tools/course-schedule-pacing-policy-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'outsider_id']
  },
  {
    file: 'tools/course-schedule-occurrence-outcomes-db-self-test.sql',
    variables: ['admin_id', 'mentor_id', 'tutor_id', 'student_a_id', 'outsider_id']
  },
  {
    file: 'tools/unified-course-schedule-db-self-test.sql',
    variables: [
      'admin_id', 'mentor_id', 'tutor_id', 'student_a_id',
      'student_b_id', 'outsider_id'
    ]
  },
  {
    file: 'tools/unified-schedule-read-contract-db-self-test.sql',
    variables: [
      'mentor_id', 'tutor_id', 'student_a_id',
      'student_b_id', 'outsider_id'
    ]
  },
  {
    file: 'tools/course-schedule-version-coverage-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'outsider_id']
  },
  {
    file: 'tools/course-schedule-qualification-publication-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'outsider_id']
  },
  {
    file: 'tools/multi-curriculum-consumer-projection-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'outsider_id']
  },
  {
    file: 'tools/classroom-home-multi-curriculum-db-self-test.sql',
    variables: ['mentor_id', 'tutor_id', 'student_a_id', 'outsider_id']
  },
  {
    file: 'tools/student-dashboard-foundation-db-self-test.sql',
    variables: ['student_a_id', 'student_b_id', 'tutor_id', 'outsider_id']
  },
  {
    file: 'tools/student-classroom-cards-db-self-test.sql',
    variables: ['student_a_id', 'student_b_id', 'tutor_id', 'outsider_id']
  },
  {
    file: 'tools/classroom-membership-visibility-db-self-test.sql',
    variables: ['admin_id', 'student_a_id', 'student_b_id', 'tutor_id', 'outsider_id']
  },
  {
    file: 'tools/student-classroom-lifecycle-projection-db-self-test.sql',
    variables: ['student_a_id', 'student_b_id', 'tutor_id', 'outsider_id']
  },
  {
    file: 'tools/classroom-management-surface-db-self-test.sql',
    variables: ['admin_id', 'mentor_id', 'tutor_id', 'student_id', 'outsider_id']
  },
  {
    file: 'tools/classroom-overview-projection-db-self-test.sql',
    variables: ['admin_id', 'mentor_id', 'tutor_id', 'student_id', 'outsider_id']
  },
  {
    file: 'tools/classroom-navigation-privacy-db-self-test.sql',
    variables: ['admin_id', 'mentor_id', 'tutor_id', 'student_id', 'outsider_id']
  },
  {
    file: 'tools/classroom-private-files-db-self-test.sql',
    variables: [
      'admin_id', 'mentor_id', 'tutor_id', 'student_id',
      'guardian_id', 'former_tutor_id', 'outsider_id'
    ]
  },
  {
    file: 'tools/student-calendar-surface-db-self-test.sql',
    variables: ['student_a_id', 'student_b_id', 'mentor_id', 'tutor_id', 'outsider_id']
  }
]

const [
  actorReference,
  actorMap,
  runner,
  classroomNetworkSql,
  sandboxRunner,
  supabaseWrapper,
  runbook,
  packageJson,
  authorizationMigration,
  serverPrivilegeMigration,
  serverPrivilegeTest
] = await Promise.all([
  readJson('tests/acceptance/fixtures/authorization-standard-actors-v1.json'),
  readJson('tests/acceptance/fixtures/local-supabase-actor-map-v1.json'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/provision-classroom-test-network.sql'),
  readText('tools/provision-mentor-sandbox.mjs'),
  readText('tools/supabase-local.mjs'),
  readText('tests/acceptance/LOCAL_SUPABASE_EXECUTION_RUNBOOK.md'),
  readJson('package.json'),
  readText('supabase/migrations/202607180003_multi_role_authorization.sql'),
  readText('supabase/migrations/202607200009_server_adapter_privileges.sql'),
  readText('tools/server-adapter-privileges-db-self-test.sql')
])

assert.equal(actorMap.schema, 'kelp-local-supabase-actor-map-v1')
assert.equal(actorMap.projectId, 'kelptutoring.com-main')
assert.equal(actorMap.targetEnvironment, 'LOCAL-SUPABASE')
assert.equal(actorMap.credentials.passwordEnvironmentVariable, 'KELP_LOCAL_ACCEPTANCE_PASSWORD')
assert.equal(actorMap.credentials.storedInFixture, false)
assert.equal(actorMap.actors.length, actorReference.actors.length)

const referenceByAlias = new Map(actorReference.actors.map((actor) => [actor.alias, actor]))
const ids = new Set()
const emails = new Set()
for (const actor of actorMap.actors) {
  const reference = referenceByAlias.get(actor.alias)
  assert.ok(reference, `Unknown local actor alias ${actor.alias}`)
  assert.match(actor.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  assert.match(actor.email, /^[a-z0-9-]+@kelp\.local\.test$/)
  assert.ok(!ids.has(actor.id), `Duplicate local actor UUID ${actor.id}`)
  assert.ok(!emails.has(actor.email), `Duplicate local actor email ${actor.email}`)
  ids.add(actor.id)
  emails.add(actor.email)
  assert.deepEqual([...actor.roles].sort(), [...reference.roles].sort(), `${actor.alias} roles drifted from the canonical fixture`)
  assert.equal(actor.primaryRole, reference.primaryRole)
  assert.ok(actor.roles.includes(actor.primaryRole))
}

const actorMapSource = JSON.stringify(actorMap)
assert.doesNotMatch(actorMapSource, /"password"\s*:/i)
assert.doesNotMatch(actorMapSource, /"(?:access|refresh|service.?role|anon)_?token"\s*:/i)

for (const fragment of [
  "const expectedProjectId = 'kelptutoring.com-main'",
  "const expectedApiPort = '54321'",
  "const expectedDbPort = '54322'",
  'requireConfirmation()',
  "process.env[passwordVariable]",
  "['db', 'reset', '--local']",
  '/auth/v1/admin/users',
  "'bootstrap_first_administrator'",
  "'grant_user_role'",
  "'revoke_user_role'",
  "'set_my_primary_role'",
  "'get_my_authorization'",
  "'docker'",
  "'psql'"
]) {
  assert.ok(runner.includes(fragment), `Runner is missing safety/flow contract: ${fragment}`)
}
assert.doesNotMatch(runner, /--linked|db push|projects list/)
assert.match(runner, /Refusing non-local/)
assert.match(runner, /Refusing to mutate Supabase/)
assert.match(runner, /sameSet\(authorization\.roles \|\| \[\], actor\.roles\)/)
assert.match(runner, /process\.stdout\.write\(`\[\$\{index \+ 1\}\/\$\{databaseTests\.length\}\]/)
assert.match(runner, /console\.log\('PASS'\)/)
assert.match(runner, /console\.log\('FAIL'\)/)
assert.match(runner, /Post-run audit passed: \$\{context\.fixture\.actors\.length\} actors verified/)
assert.match(runner, /provisionClassroomTestNetwork\(context\)/)
assert.match(runner, /provision-classroom-test-network\.sql/)
for (const fragment of [
  'thiago.loyola@kelptutoring.com',
  'thiago.dias.loyola@gmail.com',
  'thiago.d.loyola@gmail.com',
  'al.van.astrea@gmail.com',
  'manual-qa-thiago-d-algebra-v1',
  'manual-qa-thiago-dias-mechanics-v1',
  '@@ALGEBRA_SCHEDULE_BASE64@@',
  '@@MECHANICS_SCHEDULE_BASE64@@',
  'Interactive manual-QA Classroom network provisioned and verified.'
]) {
  assert.ok(
    classroomNetworkSql.includes(fragment),
    `Classroom test-network fixture is missing ${fragment}`
  )
}
assert.match(classroomNetworkSql, /begin;/i)
assert.match(classroomNetworkSql, /commit;/i)
assert.match(classroomNetworkSql, /assign_tutor_supervisor/i)
assert.match(classroomNetworkSql, /create_student_course_with_schedule_draft/i)
assert.match(classroomNetworkSql, /classrooms_ready/i)
assert.match(runner, /manual-qa-network-fixtures\.mjs/)
assert.match(runner, /unresolved fixture token/)
for (const block of classroomNetworkSql.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Classroom test-network fixture embeds a psql variable inside a dollar-quoted DO block'
  )
}
assert.match(sandboxRunner, /--mentor-email/)
assert.match(sandboxRunner, /--student-email/)
assert.match(sandboxRunner, /reservedIds\.has\(user\.id\)/)
assert.match(sandboxRunner, /The nine deterministic acceptance actors were not modified/)
assert.match(sandboxRunner, /Refusing non-local/)
assert.match(sandboxRunner, /--confirm-project=/)
assert.match(sandboxRunner, /if \(alreadyPublished\) return false/)
assert.doesNotMatch(
  sandboxRunner,
  /alreadyPublished\s*\|\|\s*currentBuilderTrackItems\.length\s*>\s*0/
)
assert.doesNotMatch(sandboxRunner, /thiago\.d\.loyola@gmail\.com|al\.van\.astrea@gmail\.com/i)
assert.match(supabaseWrapper, /outputMayContainCredentials/)
assert.match(supabaseWrapper, /sanitizeOutput/)
assert.match(supabaseWrapper, /SERVICE_ROLE_KEY/)
assert.match(supabaseWrapper, /\[redacted\]/)

for (const contract of sqlContracts) {
  const sql = await readText(contract.file)
  assert.doesNotMatch(sql, /from public\.profiles order by id/i, `${contract.file} still selects actors by row order`)
  assert.doesNotMatch(sql, /insert into public\.user_roles/i, `${contract.file} still bypasses trusted role provisioning`)
  for (const variable of contract.variables) {
    assert.ok(sql.includes(`\\if :{?${variable}}`), `${contract.file} does not require ${variable}`)
    assert.ok(sql.includes(`:'${variable}'::uuid`), `${contract.file} does not consume ${variable}`)
  }
  assert.match(sql, /as actors_ready \\gset/)
  assert.match(sql, /\\if :actors_ready/)
  assert.match(sql, /begin;/i)
  assert.match(sql, /set local role authenticated;/i)
  assert.match(sql, /rollback;/i)
  const proceduralBlocks = [...sql.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
  for (const block of proceduralBlocks) {
    assert.doesNotMatch(
      block[0],
      /:'[a-z_][a-z0-9_]*'/i,
      `${contract.file} embeds a psql variable inside a dollar-quoted DO block`
    )
  }
}

assert.equal(packageJson.scripts['test:supabase-acceptance'], 'node tools/local-supabase-acceptance-self-test.mjs')
assert.equal(packageJson.scripts['test:relationships'], 'node tools/student-relationships-self-test.mjs')
assert.equal(packageJson.scripts['test:student-dashboard'], 'node tools/student-dashboard-foundation-self-test.mjs')
assert.equal(packageJson.scripts['supabase:preflight'], 'node tools/local-supabase-acceptance.mjs preflight')
assert.equal(packageJson.scripts['supabase:reset'], 'node tools/local-supabase-acceptance.mjs reset')
assert.equal(packageJson.scripts['supabase:provision'], 'node tools/local-supabase-acceptance.mjs provision')
assert.equal(packageJson.scripts['supabase:provision:manual-qa'], 'node tools/local-supabase-acceptance.mjs manual-qa')
assert.equal(packageJson.scripts['supabase:provision:mentor-sandbox'], 'node tools/provision-mentor-sandbox.mjs')
assert.equal(packageJson.scripts['supabase:verify-actors'], 'node tools/local-supabase-acceptance.mjs verify')
assert.equal(packageJson.scripts['supabase:test:db'], 'node tools/local-supabase-acceptance.mjs test')
assert.equal(packageJson.scripts['supabase:audit'], 'node tools/local-supabase-acceptance.mjs audit')

for (const command of [
  'npm.cmd run test:supabase-acceptance',
  'npm.cmd run supabase:start',
  'npm.cmd run supabase:preflight',
  'npm.cmd run supabase:reset -- --confirm-project=kelptutoring.com-main',
  'npm.cmd run supabase:provision -- --confirm-project=kelptutoring.com-main',
  'npm.cmd run supabase:provision:manual-qa -- --confirm-project=kelptutoring.com-main',
  'npm.cmd run supabase:verify-actors',
  'npm.cmd run supabase:test:db',
  'npm.cmd run supabase:audit'
]) {
  assert.ok(runbook.includes(command), `Runbook is missing ${command}`)
}
assert.match(runbook, /Phase 8\.3 prepares this sequence but does not execute it/)
assert.match(runbook, /intentionally not written to a fixture, evidence file, run log, or `.env` file/i)
assert.match(authorizationMigration, /create or replace function public\.bootstrap_first_administrator/)
assert.match(authorizationMigration, /grant execute on function public\.bootstrap_first_administrator\(uuid, text\) to service_role/)
assert.match(serverPrivilegeMigration, /grant select on table[\s\S]*?public\.profiles[\s\S]*?to service_role/)
assert.match(serverPrivilegeMigration, /grant insert on table[\s\S]*?public\.course_assignment_items[\s\S]*?to service_role/)
assert.doesNotMatch(serverPrivilegeMigration, /grant (?:select|insert|update|delete|all)[\s\S]*?to (?:anon|authenticated)/i)
assert.match(serverPrivilegeTest, /has_table_privilege\('service_role', 'public\.profiles', 'select'\)/)
assert.match(serverPrivilegeTest, /has_table_privilege\('authenticated', 'public\.course_assignments', 'insert'\)/)

console.log('Local Supabase actor map, guarded runner, explicit SQL actor contracts, and execution runbook self-test passed.')
