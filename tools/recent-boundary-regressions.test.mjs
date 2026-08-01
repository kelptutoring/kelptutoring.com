import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  stalePrecedenceMigration,
  studentMembershipMigration,
  builderDatabaseTest,
  calendarDatabaseTest
] = await Promise.all([
  readText(
    'supabase/migrations/202607310007_course_schedule_stale_publication_precedence.sql'
  ),
  readText(
    'supabase/migrations/202607310008_student_classroom_calendar_membership_guard.sql'
  ),
  readText('tools/builder-effective-student-schedule-db-self-test.sql'),
  readText('tools/student-calendar-surface-db-self-test.sql')
])

test('stale Builder publication wins over document and cadence validation', () => {
  const staleGuard = stalePrecedenceMigration.indexOf(
    'current_active_version_id is distinct from p_expected_version_id'
  )
  const documentValidation = stalePrecedenceMigration.indexOf(
    'public.course_schedule_builder_publication_metadata(p_builder_schedule)'
  )
  const staleFixtureStart = builderDatabaseTest.indexOf(
    'do $stale_builder_publish_rejected$'
  )
  const staleFixtureEnd = builderDatabaseTest.indexOf(
    '$stale_builder_publish_rejected$;',
    staleFixtureStart
  )
  const staleFixture = builderDatabaseTest.slice(staleFixtureStart, staleFixtureEnd)

  assert.ok(staleGuard >= 0, 'The stale expected-Version guard is missing.')
  assert.ok(documentValidation >= 0, 'Current-document validation is missing.')
  assert.ok(
    staleGuard < documentValidation,
    'A stale submission must bypass document validation and reach the governed publisher.'
  )
  assert.match(stalePrecedenceMigration, /for update;/)
  assert.doesNotMatch(
    staleFixture,
    /'cadence',\s*jsonb_build_object/,
    'The regression fixture must remain a stale legacy document without cadence.'
  )
  assert.match(staleFixture, /changed after this page loaded/)
})

test('Student Classroom Calendar rejects cross-Student access before role-aware delegation', () => {
  const studentGuard = studentMembershipMigration.indexOf(
    "membership.membership_role = 'student'"
  )
  const delegate = studentMembershipMigration.indexOf(
    'return public.get_my_student_classroom_calendar_phase5g2_4_7_3_1_4_base'
  )
  const isolationStart = calendarDatabaseTest.indexOf(
    'do $student_calendar_isolation$'
  )
  const isolationEnd = calendarDatabaseTest.indexOf(
    '$student_calendar_isolation$;',
    isolationStart
  )
  const isolationFixture = calendarDatabaseTest.slice(isolationStart, isolationEnd)

  assert.ok(studentGuard >= 0, 'The narrow Student-membership predicate is missing.')
  assert.ok(delegate >= 0, 'The active-Version Calendar delegation is missing.')
  assert.ok(
    studentGuard < delegate,
    'Student membership must be verified before role-aware Calendar delegation.'
  )
  assert.match(studentMembershipMigration, /course\.student_id = caller_id/)
  assert.match(
    studentMembershipMigration,
    /An active Student Classroom Membership is required to load this Calendar\./
  )
  assert.match(isolationFixture, /get_my_student_classroom_calendar/)
  assert.match(isolationFixture, /active Student Classroom Membership/)
  assert.match(isolationFixture, /active Student, Tutor, or Mentor Classroom Membership/)
})
