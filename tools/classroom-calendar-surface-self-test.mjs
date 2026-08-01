import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeStudentCalendarPayload } from '../src/app/dashboard/student-dashboard-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  migration,
  lessonRequestMigration,
  presentationParityMigration,
  studentMembershipGuardMigration,
  effectiveEndAuthorityMigration,
  databaseTest,
  adapter,
  html,
  classroomSpace,
  calendarController,
  lessonRequestController,
  styles,
  packageJsonSource
] = await Promise.all([
  readText('supabase/migrations/202607260012_role_aware_classroom_calendar.sql'),
  readText('supabase/migrations/202607260013_lesson_request_draft_foundation.sql'),
  readText('supabase/migrations/202607310001_calendar_pdf_presentation_parity.sql'),
  readText('supabase/migrations/202607310008_student_classroom_calendar_membership_guard.sql'),
  readText('supabase/migrations/202607310010_course_schedule_effective_end_authority.sql'),
  readText('tools/student-calendar-surface-db-self-test.sql'),
  readText('src/data/studentData.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-calendar.js'),
  readText('src/app/shared/lesson-request-foundation.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('package.json')
])

const normalized = normalizeStudentCalendarPayload({
  schemaVersion: 3,
  contract: {
    name: 'classroom_calendar_read',
    scope: 'classroom',
    classroomId: 'classroom-a',
    roleAwareClassroomAccess: true
  },
  viewer: {
    membershipRole: 'Tutor',
    canRequestLesson: false
  },
  lessonRequestFoundation: {
    schemaVersion: 1,
    status: 'local_draft_active_phase_5h',
    scope: 'classroom',
    canStart: false,
    tutorSelection: 'assigned_classroom_tutor_locked',
    contextSelection: 'current_course_locked',
    durationMinutes: [30, 60, 90],
    createsReservation: false,
    createsLessonRequest: false,
    createsClass: false
  },
  range: {
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    timeZone: 'America/Sao_Paulo'
  },
  events: [{
    id: 'plan:item-a',
    kind: 'schedule_milestone',
    startsOn: '2026-07-22',
    title: 'Kinematics',
    courseId: 'course-a',
    academicScope: 'branch',
    academicPath: 'High School \u00b7 AP \u00b7 Physics \u00b7 Mechanics',
    compactAcademicLabel: 'Mechanics',
    academicPathways: [{ name: 'AP', slug: 'ap' }],
    educationLevel: { name: 'High School', code: 'HS' }
  }]
})
assert.equal(normalized.contract.name, 'classroom_calendar_read')
assert.equal(normalized.contract.roleAwareClassroomAccess, true)
assert.equal(normalized.viewer.membershipRole, 'tutor')
assert.equal(normalized.viewer.canRequestLesson, false)
assert.equal(normalized.lessonRequestFoundation.canStart, false)
assert.equal(normalized.lessonRequestFoundation.scope, 'classroom')
assert.equal(normalized.events[0].academicPathways[0].name, 'AP')
assert.equal(normalized.events[0].compactAcademicLabel, 'Mechanics')

for (const fragment of [
  'create or replace function public.get_my_classroom_calendar',
  "candidate.membership_role in ('student', 'tutor', 'mentor')",
  "'name', 'classroom_calendar_read'",
  "'roleAwareClassroomAccess', true",
  "'canRequestLesson', course_record.membership_role = 'student'",
  "'availabilityTutorScope', 'assigned_classroom_tutor'",
  "'lessonRequests', 'pending_phase_10'",
  'public.get_my_unified_course_schedule'
]) {
  assert.ok(migration.includes(fragment), `Classroom Calendar migration is missing: ${fragment}`)
}

assert.match(adapter, /export async function getClassroomCalendarData/)
assert.match(adapter, /supabase\.rpc\('get_my_classroom_calendar'/)
assert.match(adapter, /export async function getStudentClassroomCalendarData/)
assert.match(adapter, /supabase\.rpc\('get_my_student_classroom_calendar'/)
assert.match(presentationParityMigration, /get_my_classroom_calendar_phase5g2_4_5_3_base/)
assert.match(presentationParityMigration, /courseLifecycleCoveragePresentation/)
assert.match(
  studentMembershipGuardMigration,
  /membership\.membership_role = 'student'/
)
assert.match(
  studentMembershipGuardMigration,
  /course\.student_id = caller_id/
)
assert.match(
  studentMembershipGuardMigration,
  /An active Student Classroom Membership is required to load this Calendar\./
)
assert.match(
  studentMembershipGuardMigration,
  /get_my_student_classroom_calendar_phase5g2_4_7_3_1_4_base/
)
for (const fragment of [
  'course_schedule_effective_plan_end',
  'get_my_classroom_calendar_phase5g2_4_7_3_4_base',
  "event.value ->> 'kind' is distinct from 'course_end'",
  "'effectiveCourseEndAuthority'",
  "'effective_schedule_lifecycle'"
]) {
  assert.ok(
    effectiveEndAuthorityMigration.includes(fragment),
    `Effective Course End Calendar authority is missing: ${fragment}`
  )
}
assert.match(html, /id="classroom-calendar-card"/)
assert.match(html, /data-classroom-calendar-view="month"/)
assert.match(html, /data-classroom-calendar-view="week"/)
assert.match(html, /id="classroom-calendar-legend-dialog"/)
assert.match(html, /id="classroom-calendar-day-dialog"/)
assert.match(html, /id="classroom-calendar-request-lesson"/)
assert.match(html, /id="classroom-lesson-request-dialog"/)
assert.match(classroomSpace, /createClassroomCalendarController/)
assert.match(classroomSpace, /classroomCalendar\?\.setContext\(classroom\)/)
assert.match(classroomSpace, /if \(isHome\) void classroomCalendar\?\.load\(\)/)

for (const fragment of [
  "const CALENDAR_ROLES = new Set(['student', 'tutor', 'mentor'])",
  'createLessonRequestFoundation(',
  'hideTriggerWhenUnavailable: true',
  'state.lessonRequest.setCalendarPayload(payload)',
  'data-request-lesson-date',
  'calendarDataLoaderForClassroom(state.classroom)',
  "classroom?.viewer?.membershipRole === 'student'",
  '? getStudentClassroomCalendarData',
  ': getClassroomCalendarData',
  'calendarRangeForView(',
  'moveCalendarAnchor(',
  'for (let cellIndex = 0; cellIndex < 42; cellIndex += 1)',
  'calendarAnchorsBetween(',
  "viewport.classList.add('is-transitioning')",
  'captureCalendarNavigationViewport(',
  'restoreCalendarNavigationViewport(',
  ".focus({ preventScroll: true })",
  "destination.searchParams.set('area', 'schedule')"
  ,'event.compactAcademicLabel || event.focus || event.subject'
  ,'pathwayNames.join(\' + \')'
]) {
  assert.ok(
    calendarController.includes(fragment),
    `Classroom Calendar controller is missing: ${fragment}`
  )
}
assert.doesNotMatch(calendarController, /snapshot\.scroll[XY]/)
assert.doesNotMatch(calendarController, /window\.scrollTo\(\{ top: targetY/)

for (const fragment of [
  "'scope', normalized_scope",
  "'canStart', can_start",
  "'assigned_classroom_tutor_locked'",
  "'current_course_locked'",
  "'createsLessonRequest', false"
]) {
  assert.ok(
    lessonRequestMigration.includes(fragment),
    `Lesson Request migration is missing: ${fragment}`
  )
}

assert.match(lessonRequestController, /sessionStorage\.setItem/)
assert.match(lessonRequestController, /No lesson request was sent/)
assert.doesNotMatch(lessonRequestController, /supabase|fetch\(/)
assert.match(styles, /\.classroom-calendar-card\s*\{/)
assert.match(styles, /\.classroom-calendar-card-heading\s*\{/)
assert.match(styles, /\.classroom-calendar-card-actions\s*\{/)
assert.match(databaseTest, /Student role-aware Classroom Calendar contract is invalid/)
assert.match(databaseTest, /Student Classroom Calendar diverged from its Dashboard timeline/)
assert.match(databaseTest, /assigned Tutor Classroom Calendar authority is invalid/)
assert.match(databaseTest, /supervising Mentor Classroom Calendar authority is invalid/)
assert.match(databaseTest, /Expected outsider Classroom Calendar denial/)
assert.match(packageJsonSource, /"test:classroom-calendar"/)

console.log('Classroom Calendar surface self-test passed.')
