import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeClassroomSpacePayload } from '../src/app/classroom/classroom-space-contract.js'
import {
  CLASSROOM_AREAS,
  classroomAreaHref,
  getClassroomArea,
  normalizeClassroomArea
} from '../src/app/classroom/classroom-space-navigation.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration, databaseTest, contractSource, navigationSource, html, page, styles,
  runner, packageSource, implementationPlan, classroomReadme, productContract, coverageMap
] = await Promise.all([
  readText('supabase/migrations/202607220003_classroom_navigation_privacy.sql'),
  readText('tools/classroom-navigation-privacy-db-self-test.sql'),
  readText('src/app/classroom/classroom-space-contract.js'),
  readText('src/app/classroom/classroom-space-navigation.js'),
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

assert.deepEqual(CLASSROOM_AREAS.map((area) => area.key), [
  'home', 'overview', 'forum', 'assignments', 'schedule', 'files', 'report-cards', 'history'
])
assert.equal(normalizeClassroomArea('FILES'), 'files')
assert.equal(normalizeClassroomArea('unknown'), 'home')
assert.equal(getClassroomArea('forum').owningPhase, 'Phase 7')
assert.equal(getClassroomArea('overview').availability, 'available')
assert.equal(getClassroomArea('schedule').availability, 'available')
assert.equal(getClassroomArea('history').availability, 'available')
assert.equal(
  classroomAreaHref('http://127.0.0.1:4173/classroom-space.html?classroom=room-a#old', 'files'),
  'http://127.0.0.1:4173/classroom-space.html?classroom=room-a&area=files'
)
assert.equal(
  classroomAreaHref('http://127.0.0.1:4173/classroom-space.html?classroom=room-a&area=files', 'overview'),
  'http://127.0.0.1:4173/classroom-space.html?classroom=room-a&area=overview'
)
assert.equal(
  classroomAreaHref('http://127.0.0.1:4173/classroom-space.html?classroom=room-a&area=files', 'home'),
  'http://127.0.0.1:4173/classroom-space.html?classroom=room-a'
)
assert.ok(Object.isFrozen(CLASSROOM_AREAS))

const studentPayload = normalizeClassroomSpacePayload({
  schemaVersion: 5,
  viewer: { id: 'student-a', membershipRole: 'student', accessMode: 'participating' },
  classroom: { id: 'classroom-a', status: 'active' },
  course: { id: 'course-a', title: 'Mechanics', serviceModel: 'recurring' },
  student: { id: 'student-a', name: 'Student A' },
  subject: { name: 'Physics' }, focus: { name: 'Mechanics' },
  tutor: { id: 'tutor-a', name: 'Tutor A' }, mentor: null,
  management: { access: 'unavailable' },
  featureStatus: { classroomNavigation: 'active_phase_4c' }
})
assert.equal(studentPayload.mentor, null)
assert.equal(studentPayload.featureStatus.classroomNavigation, 'active_phase_4c')

const tutorPayload = normalizeClassroomSpacePayload({
  schemaVersion: 5,
  viewer: { id: 'tutor-a', membershipRole: 'tutor', accessMode: 'participating' },
  classroom: { id: 'classroom-a', status: 'active' },
  course: { id: 'course-a', title: 'Mechanics' },
  subject: { name: 'Physics' }, focus: { name: 'Mechanics' },
  tutor: { id: 'tutor-a', name: 'Tutor A' },
  mentor: { id: 'mentor-a', name: 'Mentor A' },
  management: { access: 'unavailable' }
})
assert.equal(tutorPayload.mentor.name, 'Mentor A')
assert.ok(Object.isFrozen(tutorPayload.mentor))

for (const fragment of [
  "'schemaVersion', 5",
  "membership.membership_role in ('tutor', 'mentor')",
  "authorization_user_has_capability(caller_id, 'relationships.manage')",
  "else 'null'::jsonb",
  "'classroomNavigation', 'active_phase_4c'",
  "'forum', 'planned_phase_7'",
  "'files', 'planned_phase_4e'",
  "'liveClassTool', case",
  "then 'scheduled_class_required'"
]) assert.ok(migration.includes(fragment), `Phase 4.C migration is missing: ${fragment}`)
assert.doesNotMatch(migration, /\b(?:email|birth_date|location_key)\b/i)

for (const fragment of [
  '{featureStatus,classroomNavigation}', 'student_internal_structure_privacy',
  "payload -> 'mentor' is distinct from 'null'::jsonb",
  'tutor_internal_structure_visibility', 'administrator_internal_structure_visibility',
  'outsider_navigation_denial'
]) assert.ok(databaseTest.includes(fragment), `Phase 4.C DB test is missing: ${fragment}`)
assert.match(databaseTest, /set local role authenticated;/i)
assert.match(databaseTest, /rollback;/i)

assert.match(contractSource, /mentor: normalizeOptionalPerson/)
assert.match(contractSource, /classroomNavigation:/)
assert.match(navigationSource, /export const CLASSROOM_AREAS/)
assert.match(navigationSource, /classroomAreaHref/)

for (const area of CLASSROOM_AREAS) {
  assert.match(html, new RegExp(`data-classroom-area="${area.key}"`))
}
assert.match(html, /id="classroom-detail-mentor-row" hidden/)
assert.match(html, /id="classroom-space-area-placeholder"[\s\S]*?hidden/)
assert.match(html, /id="classroom-space-live-entry"/)
assert.match(html, /id="classroom-space-home"/)
assert.match(html, /class="classroom-space-home"[\s\S]*?aria-busy="false"[\s\S]*?hidden/)
assert.match(html, /class="classroom-space-overview"[\s\S]*?aria-labelledby="classroom-overview-title"[\s\S]*?hidden/)
assert.match(html, /id="classroom-track-progress-bar"/)
assert.match(html, /An eligible scheduled Class is required/)
assert.doesNotMatch(html, /id="classroom-space-tools"/)

assert.match(page, /bindClassroomAreaControls/)
assert.match(page, /window\.addEventListener\('popstate'/)
assert.match(page, /window\.history\.pushState/)
assert.match(
  page,
  /showClassroomArea\(areaFromLocation\(\), \{[\s\S]*?loadData: false[\s\S]*?\}\)[\s\S]*?await getClassroomSpaceData/
)
assert.match(
  page,
  /function showClassroomArea\(requestedArea, \{[\s\S]*?loadData = true[\s\S]*?\} = \{\}\)/
)
assert.match(page, /elements\.classroomDetailMentorRow\.hidden = !showMentor/)
assert.match(page, /elements\.classroomSpaceLiveEntry\.textContent/)
assert.doesNotMatch(page, /classroom\.html\?|window\.location.*classroom\.html/)

assert.match(styles, /\.classroom-space-navigation button\[aria-current="page"\]/)
assert.match(styles, /\.classroom-space-area-placeholder/)
assert.match(styles, /\.classroom-space-live-entry/)
assert.match(styles, /@media \(max-width: 560px\)/)

assert.match(runner, /classroom-navigation-privacy-db-self-test\.sql/)
const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['test:classroom-navigation'], 'node tools/classroom-navigation-self-test.mjs')
assert.match(implementationPlan, /4\.C .*Navigation and tool boundaries.*Complete/i)
assert.match(classroomReadme, /## Classroom navigation and live-tool boundary/)
assert.match(productContract, /Phase 4\.C .*Navigation and tool boundaries/)
assert.match(coverageMap, /classroom-navigation-privacy-db-self-test\.sql/)
assert.match(coverageMap, /RUN-20260722-003/)

console.log('Phase 4.C Classroom navigation, internal-structure privacy, and live-tool boundary self-test passed.')
