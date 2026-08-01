import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calendarReelStart,
  normalizeStudentCalendarPayload
} from '../src/app/dashboard/student-dashboard-contract.js'
import {
  createLessonRequestDraft
} from '../src/app/shared/lesson-request-foundation.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  migration,
  dashboardHtml,
  dashboardController,
  classroomHtml,
  classroomController,
  sharedController,
  styles,
  plan
] = await Promise.all([
  readText('supabase/migrations/202607260013_lesson_request_draft_foundation.sql'),
  readText('src/app/dashboard/student-dashboard.html'),
  readText('src/app/dashboard/student-dashboard.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-calendar.js'),
  readText('src/app/shared/lesson-request-foundation.js'),
  readText('src/styles/style.css'),
  readText('IMPLEMENTATION_PLAN.md')
])

const target = new Date(2026, 6, 26, 12)
assert.equal(
  calendarReelStart(new Date(2024, 0, 1, 12), target, 'month')
    .toISOString()
    .slice(0, 10),
  '2026-01-01'
)
assert.equal(
  calendarReelStart(new Date(2028, 0, 1, 12), target, 'month')
    .toISOString()
    .slice(0, 10),
  '2027-01-01'
)
assert.equal(
  calendarReelStart(new Date(2026, 4, 1, 12), target, 'month')
    .toISOString()
    .slice(0, 10),
  '2026-05-01'
)

const context = {
  courseId: 'course-a',
  classroomId: 'classroom-a',
  courseTitle: 'Physics',
  subject: 'Physics',
  focus: 'Waves',
  tutor: { id: 'tutor-a', name: 'Oliver Bennett' }
}
const now = new Date(2026, 6, 26, 12, 0, 0)
const draft = createLessonRequestDraft({
  scope: 'classroom',
  context,
  purpose: 'extra',
  proposedDate: '2026-07-27',
  proposedTime: '12:30',
  durationMinutes: 60,
  message: 'Please review standing waves.',
  now
})
assert.equal(draft.status, 'local_draft')
assert.equal(draft.scope, 'classroom')
assert.equal(draft.tutor.id, 'tutor-a')
assert.equal(draft.course.id, 'course-a')
assert.equal(draft.requestSubmitted, false)
assert.equal(draft.availabilityReserved, false)
assert.equal(draft.classCreated, false)

assert.throws(
  () => createLessonRequestDraft({
    scope: 'dashboard',
    context,
    purpose: 'regular',
    proposedDate: '2026-07-27',
    proposedTime: '11:30',
    durationMinutes: 30,
    now
  }),
  /at least 1 day ahead/
)
assert.throws(
  () => createLessonRequestDraft({
    scope: 'dashboard',
    context,
    purpose: 'regular',
    proposedDate: '2026-08-10',
    proposedTime: '12:30',
    durationMinutes: 30,
    now
  }),
  /no more than 14 days ahead/
)
assert.throws(
  () => createLessonRequestDraft({
    scope: 'dashboard',
    context,
    purpose: 'standalone',
    proposedDate: '2026-07-27',
    proposedTime: '12:30',
    durationMinutes: 30,
    now
  }),
  /available lesson purpose/
)
assert.throws(
  () => createLessonRequestDraft({
    scope: 'dashboard',
    context,
    purpose: 'extra',
    proposedDate: '2026-07-27',
    proposedTime: '12:30',
    durationMinutes: 45,
    now
  }),
  /supported lesson duration/
)

const normalized = normalizeStudentCalendarPayload({
  lessonRequestFoundation: {
    schemaVersion: 1,
    status: 'local_draft_active_phase_5h',
    scope: 'classroom',
    canStart: true,
    tutorSelection: 'assigned_classroom_tutor_locked',
    contextSelection: 'current_course_locked',
    purposeOptions: [
      { key: 'regular', status: 'draftable' },
      { key: 'standalone', status: 'contract_only_phase_10' }
    ],
    durationMinutes: [30, 60, 90],
    constraints: {
      minimumLeadMinutes: 1440,
      maximumAdvanceDays: 14,
      pendingRequestExpiresMinutesBeforeClass: 720
    },
    draftStorage: 'browser_session_only',
    submissionStatus: 'pending_phase_10',
    availabilityStatus: 'pending_phase_10',
    creditValidationStatus: 'pending_phase_11',
    createsReservation: false,
    createsLessonRequest: false,
    createsClass: false
  }
})
assert.equal(normalized.lessonRequestFoundation.canStart, true)
assert.equal(normalized.lessonRequestFoundation.scope, 'classroom')
assert.deepEqual(normalized.lessonRequestFoundation.durationMinutes, [30, 60, 90])
assert.equal(normalized.lessonRequestFoundation.constraints.minimumLeadMinutes, 1440)
assert.equal(normalized.lessonRequestFoundation.createsLessonRequest, false)

for (const fragment of [
  "status', 'local_draft_active_phase_5h'",
  "'minimumLeadMinutes', 1440",
  "'maximumAdvanceDays', 14",
  "'draftStorage', 'browser_session_only'",
  "'submissionStatus', 'pending_phase_10'",
  "'creditValidationStatus', 'pending_phase_11'",
  "'createsReservation', false",
  "'createsLessonRequest', false",
  "'createsClass', false",
  'get_my_student_calendar_phase5h_lesson_request_base',
  'get_my_classroom_calendar_phase5h_lesson_request_base'
]) {
  assert.ok(migration.includes(fragment), `Lesson Request migration is missing: ${fragment}`)
}

assert.match(dashboardHtml, /id="student-calendar-request-lesson"/)
assert.match(dashboardHtml, />Book a lesson<\/button>/)
assert.match(dashboardHtml, /id="student-lesson-request-dialog"/)
assert.match(classroomHtml, /id="classroom-calendar-request-lesson"[\s\S]*?hidden[\s\S]*?disabled/)
assert.match(classroomHtml, />Book a lesson<\/button>/)
assert.match(classroomHtml, /id="classroom-lesson-request-dialog"/)
assert.match(dashboardController, /createLessonRequestFoundation/)
assert.match(dashboardController, /data-request-lesson-date/)
assert.match(classroomController, /hideTriggerWhenUnavailable:\s*true/)
assert.match(classroomController, /data-request-lesson-date/)
assert.match(sharedController, /sessionStorage\.setItem/)
assert.match(sharedController, /No lesson request was sent/)
assert.doesNotMatch(sharedController, /supabase|fetch\(|createClass|reserveAvailability/)
assert.match(styles, /\.lesson-request-dialog\s*\{/)
assert.match(styles, /\.lesson-request-form-grid\s*\{/)
assert.match(plan, /authorized many-to-many Tutor relationships/i)
assert.match(
  plan,
  /overlay the Student's commitments[\s\S]*select an eligible Slot[\s\S]*open the request form/i
)

console.log('Six-month Calendar reel fallback and Tutor-first Lesson Request foundation self-test passed.')
