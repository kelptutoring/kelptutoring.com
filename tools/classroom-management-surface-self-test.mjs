import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeClassroomSpacePayload } from '../src/app/classroom/classroom-space-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration, databaseTest, contractSource, html, page, styles, mentorDashboard, runner,
  packageSource, implementationPlan, classroomReadme, productContract, coverageMap
] = await Promise.all([
  readText('supabase/migrations/202607220001_classroom_management_surface.sql'),
  readText('tools/classroom-management-surface-db-self-test.sql'),
  readText('src/app/classroom/classroom-space-contract.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('src/app/dashboard/mentor-dashboard.js'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('src/app/classroom/README.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

const mentorClassroom = normalizeClassroomSpacePayload({
  schemaVersion: 3,
  viewer: {
    id: 'mentor-a', membershipRole: 'mentor', membershipStatus: 'active',
    accessMode: 'participating', canParticipate: true, canManageClassroom: true
  },
  classroom: { id: 'classroom-a', status: 'active', readOnly: false },
  course: {
    id: 'course-a', title: 'Mechanics', status: 'active', serviceModel: 'recurring',
    startDate: '2026-07-01', scheduledEndDate: '2026-10-01'
  },
  subject: { id: 'physics', name: 'Physics' },
  focus: { id: 'mechanics', name: 'Mechanics' },
  tutor: { id: 'tutor-a', name: 'Tutor A' },
  management: {
    access: 'active',
    actions: {
      tutorAssignment: 'planned_phase_4d',
      meetingSchedule: 'planned_phase_4b',
      courseEnding: 'planned_course_lifecycle',
      courseTermination: 'planned_course_lifecycle'
    }
  },
  featureStatus: { classroomManagement: 'active_phase_4a' }
})

assert.equal(mentorClassroom.viewer.canManageClassroom, true)
assert.equal(mentorClassroom.management.access, 'active')
assert.equal(mentorClassroom.management.actions.tutorAssignment, 'planned_phase_4d')
assert.equal(mentorClassroom.featureStatus.classroomManagement, 'active_phase_4a')
assert.ok(Object.isFrozen(mentorClassroom.management.actions))

const studentClassroom = normalizeClassroomSpacePayload({
  viewer: {
    id: 'student-a', membershipRole: 'student', accessMode: 'participating',
    canManageClassroom: true
  },
  classroom: { id: 'classroom-a', status: 'active' },
  course: { id: 'course-a', title: 'Mechanics', status: 'active' },
  subject: { name: 'Physics' }, focus: { name: 'Mechanics' }, tutor: { name: 'Tutor A' },
  management: { access: 'unavailable' }
})
assert.equal(studentClassroom.viewer.canManageClassroom, false)
assert.equal(studentClassroom.management.access, 'unavailable')
assert.throws(
  () => normalizeClassroomSpacePayload({
    viewer: { membershipRole: 'mentor' }, classroom: { id: 'room' }, course: { id: 'course' },
    management: { access: 'owner' }
  }),
  /management payload is invalid/
)

for (const fragment of [
  "'schemaVersion', 3",
  "membership.membership_role = 'mentor'",
  'course.mentor_id = caller_id',
  "'canManageClassroom'",
  "'access', case",
  "'tutorAssignment', 'planned_phase_4d'",
  "'meetingSchedule', 'planned_phase_4b'",
  "'classroomManagement', 'active_phase_4a'"
]) assert.ok(migration.includes(fragment), `Management migration is missing: ${fragment}`)
assert.doesNotMatch(migration, /\n\s*(?:insert\s+into|update\s+public\.|delete\s+from)\b/i)

for (const fragment of [
  "{viewer,membershipRole}' <> 'mentor'",
  "{viewer,canManageClassroom}",
  "{management,access}",
  "{management,actions,tutorAssignment}",
  "{featureStatus,classroomManagement}"
]) assert.ok(databaseTest.includes(fragment), `Management database characterization is missing: ${fragment}`)
assert.match(databaseTest, /set local role authenticated;/i)
assert.match(databaseTest, /rollback;/i)

assert.match(contractSource, /MANAGEMENT_ACCESS_MODES/)
assert.match(contractSource, /canManageClassroom:/)
assert.match(contractSource, /management: Object\.freeze/)

assert.match(html, /id="classroom-space-status"[\s\S]*?id="classroom-space-manage-toggle"/)
assert.match(html, /id="classroom-space-manage-toggle"[\s\S]*?aria-expanded="false"[\s\S]*?hidden/)
assert.match(html, /aria-controls="classroom-space-management"/)
assert.match(html, /id="classroom-space-management"[\s\S]*?hidden/)
for (const action of ['Change Tutor', 'Change schedule', 'Postpone ending', 'Finish Course']) {
  assert.match(html, new RegExp(`<button type="button" disabled>${action}</button>`))
}

assert.match(page, /classroom\.viewer\.canManageClassroom && classroom\.management\.access === 'active'/)
assert.match(page, /setManagementExpanded/)
assert.match(page, /classroomSpaceManageToggle\.hidden = !canManage/)
assert.match(page, /event\.key === 'Escape'/)
assert.doesNotMatch(page, /classroomSpaceManagement\.scrollIntoView/)
assert.doesNotMatch(page, /managementCollapseTimer/)
assert.doesNotMatch(page, /supabase\.rpc|reassign.*tutor|update.*course/i)
assert.match(mentorDashboard, /classroom-space\.html\?classroom=/)
assert.match(mentorDashboard, /link\.textContent = 'Open Classroom'/)

assert.match(styles, /\.classroom-space-hero-actions/)
assert.match(styles, /\.classroom-space-management-grid/)
assert.match(styles, /\.classroom-space-management\.is-collapsed/)
assert.match(styles, /grid-template-rows 0\.36s ease/)
assert.match(styles, /\.classroom-space-management\.is-collapsed:not\(\[hidden\]\) \+ \.classroom-space-navigation/)
assert.match(styles, /\.classroom-space-management-card button:disabled/)
assert.match(styles, /\.classroom-space-body \[hidden\]/)
assert.match(styles, /var\(--kelp-theme-accent/)
const topbarStyles = styles.match(/\.classroom-space-topbar\s*\{([\s\S]*?)\}/)?.[1] ?? ''
assert.doesNotMatch(topbarStyles, /position:\s*(?:sticky|fixed)/)

assert.match(runner, /classroom-management-surface-db-self-test\.sql/)
assert.match(runner, /outsider_id: 'ACT-OUTSIDER'/)
const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['test:classroom-management'], 'node tools/classroom-management-surface-self-test.mjs')
assert.match(implementationPlan, /## Current position/)
assert.match(implementationPlan, /Phase 4 — Persistent Classroom environment/)
assert.match(implementationPlan, /Phase 5 — Authoritative Course Schedule/)
assert.match(implementationPlan, /Phase 6 — Availability, Tutor assignment, and reassignment/)
assert.match(classroomReadme, /## Mentor Classroom management surface/)
assert.match(productContract, /Phase 4\.A — Classroom management entry/)
assert.match(coverageMap, /classroom-management-surface-db-self-test\.sql/)

console.log('Phase 4.A Mentor-only Classroom management authority and staged surface self-test passed.')
