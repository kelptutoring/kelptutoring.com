import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeStudentClassroomCollection,
  normalizeStudentClassroomsPayload
} from '../src/app/classroom/student-classrooms-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  html, page, styles, dashboardHtml, dashboardJs, navigation,
  classroomHtml, classroomJs, classroomCss, dataAdapter, packageSource,
  productContract, classroomReadme, acceptanceLog, coverageMap
] = await Promise.all([
  readText('src/app/classroom/student-classrooms.html'),
  readText('src/app/classroom/student-classrooms.js'),
  readText('src/app/classroom/student-classrooms.css'),
  readText('src/app/dashboard/student-dashboard.html'),
  readText('src/app/dashboard/student-dashboard.js'),
  readText('src/app/dashboard/student-navigation.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('src/data/studentData.js'),
  readText('package.json'),
  readText('docs/product/product-contract.md'),
  readText('src/app/classroom/README.md'),
  readText('tests/acceptance/TEST_RUN_LOG.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

const payload = normalizeStudentClassroomsPayload({
  schemaVersion: 1,
  viewer: { id: 'student-a', name: 'Student A' },
  collections: {
    active: [{
      courseId: 'course-active',
      courseTitle: 'Mechanics Foundations',
      courseStatus: 'wind_down',
      subject: { id: 'physics', name: 'Physics' },
      focus: { id: 'mechanics', name: 'Mechanics' },
      tutor: { id: 'tutor-a', name: 'Tutor A' },
      classroom: {
        id: 'classroom-active', membershipStatus: 'active', accessMode: 'participating'
      },
      card: { colorKey: 'CORAL', position: 0, presentationState: 'ending_soon' }
    }],
    former: [{
      courseId: 'course-former',
      courseStatus: 'completed',
      classroom: { id: 'classroom-former', accessMode: 'read_only' },
      card: { colorKey: 'unknown', presentationState: 'former' }
    }],
    archived: [{
      courseId: 'course-archived',
      classroom: { id: 'classroom-archived', accessMode: 'read_only' },
      card: { presentationState: 'archived', personallyArchivedAt: '2026-07-20T12:00:00Z' }
    }]
  }
})

assert.equal(normalizeStudentClassroomCollection('FORMER'), 'former')
assert.equal(normalizeStudentClassroomCollection('unsupported'), 'active')
assert.equal(payload.collections.active[0].card.colorKey, 'coral')
assert.equal(payload.collections.active[0].card.presentationState, 'ending_soon')
assert.equal(payload.collections.active[0].card.position, 0)
assert.equal(payload.collections.former[0].classroom.accessMode, 'read_only')
assert.equal(payload.collections.former[0].card.colorKey, 'ocean')
assert.equal(payload.collections.archived[0].card.personallyArchivedAt, '2026-07-20T12:00:00Z')
assert.ok(Object.isFrozen(payload.collections))

assert.match(html, /student-classrooms\.html/)
assert.match(html, /role="tablist"/)
assert.match(html, /data-classroom-collection="active"/)
assert.match(html, /data-classroom-collection="former"/)
assert.match(html, /data-classroom-collection="archived"/)
assert.match(html, /id="student-classrooms-panel" role="tabpanel"/)
assert.match(html, /Arrange Cards on Dashboard/)
assert.match(html, /student-dashboard-topbar/)
assert.match(html, /theme-bootstrap\.js/)
assert.match(html, />Course schedules</)

assert.match(page, /requireAuth\(\['student'\]\)/)
assert.match(page, /getStudentClassroomsData/)
assert.match(page, /archiveStudentClassroom/)
assert.match(page, /restoreStudentClassroom/)
assert.match(page, /button\.dataset\.classroomAction === 'archive'/)
assert.match(page, /state\.collection !== 'active'/)
assert.match(page, /ArrowLeft/)
assert.match(page, /ArrowRight/)
assert.match(page, /window\.history\.replaceState/)
assert.match(page, /classroom-space\.html\?classroom=/)
assert.match(page, /Open Schedule/)
assert.match(page, /classroomUrl\(item\.classroom\.id, 'schedule'\)/)
assert.match(page, /area=\$\{encodeURIComponent\(area\)\}/)
assert.match(page, /accessMode === 'read_only'/)
assert.doesNotMatch(page, /next lesson|homework|unread|report card/i)

assert.match(styles, /\.student-classrooms-grid/)
assert.match(styles, /grid-template-columns:\s*repeat\(3/)
assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\)/)
assert.match(styles, /\.student-classrooms-body \*[\s\S]*?box-sizing:\s*border-box/)
assert.match(styles, /@media \(max-width: 980px\)/)
assert.match(styles, /@media \(max-width: 700px\)/)
assert.match(styles, /@media \(max-width: 420px\)/)
assert.match(styles, /\[data-access-mode="read_only"\]/)
assert.match(styles, /var\(--kelp-theme-accent/)
assert.match(styles, /\.student-classrooms-card-link:hover,[\s\S]*?text-decoration:\s*none/)
assert.match(styles, /\.student-classrooms-open-link:hover,[\s\S]*?text-decoration:\s*underline/)
assert.doesNotMatch(styles, /position:\s*(sticky|fixed)/)

assert.match(dashboardHtml, /href="\.\.\/classroom\/student-classrooms\.html">Classrooms/)
assert.match(dashboardHtml, /class="student-dashboard-classrooms-link"/)
assert.match(dashboardJs, /bindStudentNavigation/)
assert.match(dashboardJs, /courseStatus === 'wind_down' \? 'Ending soon' : 'Active'/)
assert.match(navigation, /data-dashboard-menu/)
assert.match(navigation, /event\.key !== 'Escape'/)

assert.match(classroomHtml, /id="classroom-space-read-only"/)
assert.match(classroomHtml, /Historical Classroom/)
assert.match(classroomJs, /classroom\.viewer\.personalArchived \? 'archived' : 'former'/)
assert.match(classroomJs, /classroom\.classroom\.readOnly/)
assert.match(classroomCss, /\.classroom-space-read-only/)

assert.match(dataAdapter, /get_my_student_classrooms/)
assert.match(dataAdapter, /archive_my_student_classroom/)
assert.match(dataAdapter, /restore_my_student_classroom/)
assert.match(dataAdapter, /normalizeStudentClassroomsPayload/)

const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['test:student-classrooms'], 'node tools/student-classrooms-surface-self-test.mjs')

assert.match(productContract, /Phase 3\.F — Documentation checkpoint[^\n]+\| Complete \|/)
assert.match(productContract, /Phase 3\.D–3\.F implementation checkpoint/)
assert.match(classroomReadme, /## Student Classroom membership lifecycle/)
assert.match(classroomReadme, /get_my_student_classrooms/)
assert.match(classroomReadme, /archive_my_student_classroom/)
assert.match(classroomReadme, /npm run supabase:audit/)
assert.match(acceptanceLog, /RUN-20260720-006 — Phase 3 Student Classroom lifecycle/)
assert.match(coverageMap, /Current stage \| (?:Vertical )?Phases? 5/)
assert.match(coverageMap, /student-classroom-lifecycle-projection-db-self-test\.sql/)

console.log('Phase 3.D–3.F Student Classroom surfaces, lifecycle controls, responsive contracts, and documentation checkpoint self-test passed.')
