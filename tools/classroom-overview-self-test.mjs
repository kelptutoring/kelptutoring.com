import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeClassroomSpacePayload } from '../src/app/classroom/classroom-space-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration, databaseTest, contractSource, html, page, styles, runner,
  packageSource, implementationPlan, classroomReadme, productContract, coverageMap
] = await Promise.all([
  readText('supabase/migrations/202607220002_classroom_overview_projection.sql'),
  readText('tools/classroom-overview-projection-db-self-test.sql'),
  readText('src/app/classroom/classroom-space-contract.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('src/app/classroom/README.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

const linkedOverview = normalizeClassroomSpacePayload({
  schemaVersion: 4,
  viewer: {
    id: 'student-a', membershipRole: 'student', membershipStatus: 'active',
    accessMode: 'participating', canParticipate: true, canManageClassroom: false
  },
  classroom: { id: 'classroom-a', status: 'active', readOnly: false },
  course: {
    id: 'course-a', title: 'Mechanics Foundations', status: 'active',
    serviceModel: 'recurring', startDate: '2026-08-01', scheduledEndDate: '2026-12-01'
  },
  student: { id: 'student-a', name: 'Student A' },
  subject: { id: 'physics', name: 'Physics' },
  focus: { id: 'mechanics', name: 'Mechanics' },
  tutor: { id: 'tutor-a', name: 'Tutor A' },
  mentor: { id: 'mentor-a', name: 'Mentor A' },
  provider: { kind: 'kelp', label: 'Kelp Tutoring' },
  schedule: {
    linkageStatus: 'linked', id: 'schedule-a', name: 'Mechanics schedule',
    recordStatus: 'active', timeZone: 'America/Sao_Paulo', sessionCount: 8,
    firstSessionDate: '2026-08-04', lastSessionDate: '2026-09-22', versionCount: 2
  },
  management: {
    access: 'unavailable',
    actions: {
      tutorAssignment: 'planned_phase_6', meetingSchedule: 'planned_phase_5',
      courseEnding: 'planned_phase_5', courseTermination: 'planned_phase_5'
    }
  },
  featureStatus: { classroomOverview: 'active_phase_4b', classroomManagement: 'active_phase_4a' }
})

assert.equal(linkedOverview.schemaVersion, 4)
assert.equal(linkedOverview.student.name, 'Student A')
assert.equal(linkedOverview.mentor.name, 'Mentor A')
assert.equal(linkedOverview.provider.kind, 'kelp')
assert.equal(linkedOverview.schedule.linkageStatus, 'linked')
assert.equal(linkedOverview.schedule.sessionCount, 8)
assert.equal(linkedOverview.schedule.versionCount, 2)
assert.equal(linkedOverview.featureStatus.classroomOverview, 'active_phase_4b')
assert.ok(Object.isFrozen(linkedOverview.schedule))
assert.ok(Object.isFrozen(linkedOverview.student))

const legacyOverview = normalizeClassroomSpacePayload({
  viewer: { membershipRole: 'tutor', accessMode: 'read_only' },
  classroom: { id: 'classroom-legacy', status: 'inactive', readOnly: true },
  course: { id: 'course-legacy', title: 'Legacy Course', serviceModel: 'independent_tutor' },
  subject: { name: 'Mathematics' }, focus: { name: 'Algebra' }, tutor: { name: 'Tutor B' },
  management: { access: 'unavailable' }
})
assert.equal(legacyOverview.schedule.linkageStatus, 'missing')
assert.equal(legacyOverview.schedule.sessionCount, 0)
assert.equal(legacyOverview.provider.kind, 'independent_tutor')
assert.equal(legacyOverview.provider.label, 'Independent Tutor')
assert.throws(
  () => normalizeClassroomSpacePayload({
    viewer: { membershipRole: 'student', accessMode: 'participating' },
    classroom: { id: 'classroom-a' }, course: { id: 'course-a' },
    schedule: { linkageStatus: 'linked' }, management: { access: 'unavailable' }
  }),
  /Schedule summary is invalid/
)

for (const fragment of [
  "'schemaVersion', 4",
  "'student', jsonb_build_object(",
  "'mentor', jsonb_build_object(",
  "'provider', jsonb_build_object(",
  "'linkageStatus', case when linked_schedule.id is null then 'missing' else 'linked' end",
  "schedule.student_course_id = course.id",
  "session.status = 'active'",
  "'classroomOverview', 'active_phase_4b'",
  "'meetingSchedule', 'planned_phase_5'",
  "'tutorAssignment', 'planned_phase_6'"
]) assert.ok(migration.includes(fragment), `Overview migration is missing: ${fragment}`)
assert.doesNotMatch(migration, /\b(?:email|birth_date|location_key)\b/i)
assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function\s+public\.(?:save|update|reassign|finish)/i)

for (const fragment of [
  '{featureStatus,classroomOverview}', '{schedule,linkageStatus}',
  '{schedule,sessionCount}', '{student,id}', '{mentor,id}',
  'legacy_missing_schedule_projection', 'outsider_overview_denial'
]) assert.ok(databaseTest.includes(fragment), `Overview database characterization is missing: ${fragment}`)
assert.match(databaseTest, /set local role authenticated;/i)
assert.match(databaseTest, /rollback;/i)

assert.match(contractSource, /SCHEDULE_LINKAGE_STATUSES/)
assert.match(contractSource, /PROVIDER_KINDS/)
assert.match(contractSource, /schedule: Object\.freeze/)
assert.match(contractSource, /student: normalizePerson/)
assert.match(contractSource, /mentor: normalizeOptionalPerson/)

for (const id of [
  'classroom-detail-student', 'classroom-detail-tutor', 'classroom-detail-mentor',
  'classroom-detail-provider', 'classroom-schedule-summary', 'classroom-schedule-linkage',
  'classroom-schedule-name', 'classroom-schedule-dates', 'classroom-schedule-sessions',
  'classroom-schedule-time-zone', 'classroom-schedule-versions'
]) assert.match(html, new RegExp(`id="${id}"`), `Overview HTML is missing ${id}`)
assert.match(html, /Current linked Schedule/)
assert.match(html, /Planned for Phase 5/)
assert.match(html, /Planned for Phase 6/)

assert.match(page, /renderScheduleSummary\(classroom\.schedule\)/)
assert.match(page, /schedule\.linkageStatus === 'linked'/)
assert.match(page, /legacy Course remains readable/)
assert.match(page, /classroom\.provider\.label/)
assert.doesNotMatch(page, /supabase\.rpc|upsert_student_course_learning_schedule/)

assert.match(styles, /\.classroom-space-overview-grid/)
assert.match(styles, /\.classroom-space-overview-card/)
assert.match(styles, /\.classroom-space-schedule-details/)
assert.match(styles, /data-linkage-status="missing"/)
assert.match(styles, /@media \(max-width: 560px\)/)

assert.match(runner, /classroom-overview-projection-db-self-test\.sql/)
const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['test:classroom-overview'], 'node tools/classroom-overview-self-test.mjs')
assert.match(implementationPlan, /4\.B .*Classroom Overview.*Complete/i)
assert.match(classroomReadme, /## Classroom Overview/)
assert.match(productContract, /Phase 4\.B .*Classroom Overview/)
assert.match(coverageMap, /classroom-overview-projection-db-self-test\.sql/)
assert.match(coverageMap, /RUN-20260722-002/)

console.log('Phase 4.B authorized Classroom Overview and linked Schedule-summary self-test passed.')
