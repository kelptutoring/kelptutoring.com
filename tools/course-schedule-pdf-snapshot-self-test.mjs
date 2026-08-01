import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createClassroomScheduleSnapshot,
  normalizeClassroomSchedulePayload
} from '../src/app/classroom/classroom-schedule-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [html, page, styles] = await Promise.all([
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css')
])

const schedule = normalizeClassroomSchedulePayload({
  schemaVersion: 1,
  courseId: '91000000-0000-4000-8000-000000000001',
  activeScheduleVersionId: '93000000-0000-4000-8000-000000000007',
  versionNumber: 7,
  name: 'Algebra 1 Guided Practice',
  timeZone: 'Asia/Bangkok',
  serviceModel: 'recurring',
  educationLevel: {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'High School',
    slug: 'high-school'
  },
  moduleStyles: {
    'linear-modeling': {
      headerColor: '#ddeb72',
      stripeColor: '#d9ead8',
      templateName: 'Custom'
    }
  },
  permissions: {
    actorRole: 'student',
    canMarkSession: true,
    canMarkResource: true
  },
  items: [{
    scheduleItemId: '94000000-0000-4000-8000-000000000001',
    stableItemKey: 'linear-equations',
    title: 'Linear equations',
    kind: 'curriculum_topic',
    state: 'scheduled',
    effectiveDate: '2026-07-23',
    plannedDate: '2026-07-29',
    effectivePosition: 0,
    plannedPosition: 1,
    sequenceState: 'studied',
    effectiveTimestamp: '2026-07-23T12:00:00Z',
    difficultyLevel: 'intermediate',
    source: {
      moduleKey: 'linear-modeling',
      moduleTitle: 'Module 1: Linear Modeling'
    },
    progress: {
      studied: { marked: true, effectiveAt: '2026-07-23T12:00:00Z' },
      reviewed: { marked: true, effectiveAt: '2026-07-23T13:00:00Z' },
      practiced: { marked: false }
    },
    resources: [{
      id: '95000000-0000-4000-8000-000000000001',
      stableResourceKey: 'openstax-linear-equations',
      providerKey: 'openstax',
      title: 'OpenStax practice',
      requirementState: 'required',
      progress: {
        studied: { marked: true },
        reviewed: { marked: false },
        practiced: { marked: true }
      }
    }]
  }]
})

const first = createClassroomScheduleSnapshot(schedule, {
  generatedAt: '2026-07-23T15:00:00Z'
})
const second = createClassroomScheduleSnapshot(schedule, {
  generatedAt: '2026-07-23T16:00:00Z'
})

assert.equal(first.snapshotId, second.snapshotId, 'Generation time must not change the Schedule snapshot identity.')
assert.equal(
  first.snapshotId,
  'KELP-SCHEDULE-V7-93000000-0000-4000-8000-000000000007'
)
assert.equal(first.generatedAt, '2026-07-23T15:00:00.000Z')
assert.equal(first.courseId, schedule.courseId)
assert.equal(first.activeScheduleVersionId, schedule.activeScheduleVersionId)
assert.equal(first.sessions[0].scheduledDate, '2026-07-23')
assert.equal(first.sessions[0].plannedDate, '2026-07-29')
assert.equal(first.sessions[0].moduleKey, 'linear-modeling')
assert.equal(first.sessions[0].moduleTitle, 'Module 1: Linear Modeling')
assert.equal(first.moduleStyles['linear-modeling'].headerColor, '#ddeb72')
assert.equal(first.educationLevel.name, 'High School')
assert.throws(
  () => createClassroomScheduleSnapshot(schedule, { generatedAt: 'not-a-date' }),
  /snapshot timestamp is invalid/i
)

for (const fragment of [
  'id="classroom-schedule-print"',
  'id="classroom-schedule-print-document"',
  'id="classroom-schedule-print-page-style"',
  'id="classroom-schedule-print-education-level"',
  'id="classroom-schedule-print-subject"',
  'id="classroom-schedule-print-track"',
  'id="classroom-schedule-print-copyright"',
  'id="classroom-schedule-print-generated"'
]) {
  assert.match(html, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
for (const fragment of [
  'id="classroom-schedule-print-time-zone"',
  'id="classroom-schedule-print-snapshot-id"',
  'id="classroom-schedule-print-course-id"',
  'id="classroom-schedule-print-version-id"'
]) {
  assert.doesNotMatch(html, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.doesNotMatch(html, /id="classroom-schedule-print-header-copyright"/)

assert.match(page, /createClassroomScheduleSnapshot/)
assert.match(page, /loadClassroomSchedule\(\{ force: true, quiet: true \}\)/)
assert.match(page, /window\.print\(\)/)
assert.match(page, /Assigned resources:/)
assert.match(page, /createClassroomSchedulePrintBadge/)
assert.match(page, /createClassroomSchedulePrintCheck/)
assert.match(page, /classroom-schedule-print-checklist/)
assert.match(page, /item\.append\(metadataCell, contentCell, progressCell\)/)
assert.match(page, /classroom-schedule-print-check-date/)
assert.match(page, /formatProgressDate\(mark\.effectiveAt, timeZone\)/)
assert.match(page, /renderClassroomSchedulePrintPageMargins/)
assert.match(page, /@top-left[\s\S]*?content:\s*""/)
assert.match(page, /@top-center[\s\S]*?content:\s*""/)
assert.match(page, /@top-right[\s\S]*?content:\s*""/)
assert.match(page, /@bottom-left/)
assert.match(page, /@bottom-center/)
assert.match(page, /@bottom-right/)
assert.match(page, /counter\(page\)/)
assert.match(page, /counter\(pages\)/)
assert.doesNotMatch(page, /classroomSchedulePrintHeaderCopyright/)
const schedulePrintSource = page.slice(
  page.indexOf('async function printClassroomSchedule()'),
  page.indexOf('function createScheduleSessionItem(')
)
assert.ok(
  schedulePrintSource.length > 0,
  'The Student Schedule PDF source boundary could not be located.'
)
assert.doesNotMatch(schedulePrintSource, /privateStaffNote|reflection/)
assert.match(page, /payload\.permissions\.actorRole !== 'student'/)
assert.doesNotMatch(html, /turn off browser headers and footers/i)

assert.match(styles, /@media print/)
assert.match(styles, /@page[\s\S]*margin:\s*12mm 12mm 18mm/)
assert.match(styles, /body\.is-printing-classroom-schedule > :not\(\.classroom-schedule-print-document\)/)
assert.match(styles, /\.classroom-schedule-print-watermark img/)
assert.doesNotMatch(styles, /min-height:\s*297mm/)
assert.match(styles, /\.classroom-schedule-print-watermark[\s\S]*position:\s*fixed/)
assert.match(styles, /break-inside:\s*avoid/)
assert.match(styles, /\.classroom-schedule-print-module thead\s*\{[\s\S]*?table-header-group/)
assert.match(styles, /\.classroom-schedule-print-row > td\s*\{[\s\S]*?border:\s*0;/)
assert.match(styles, /\.classroom-schedule-print-row\[data-sequence-state="studied"\][\s\S]*?#2f8a4a/)
assert.match(styles, /\.classroom-schedule-print-badge\.is-studied/)
assert.match(styles, /\.classroom-schedule-print-checkbox\[data-checked="true"\]/)
assert.match(
  styles,
  /\.classroom-schedule-print-check\s*\{[\s\S]*?grid-template-columns:\s*4mm auto minmax\(0, 1fr\)/
)
assert.match(styles, /\.classroom-schedule-print-check-date\s*\{[\s\S]*?white-space:\s*nowrap/)
assert.match(styles, /\.classroom-schedule-print-footer\s*\{[\s\S]*?display:\s*none !important/)
assert.doesNotMatch(styles, /\.classroom-schedule-print-footer\s*\{[\s\S]*?position:\s*fixed/)

console.log('Course Schedule PDF snapshot contracts passed.')
