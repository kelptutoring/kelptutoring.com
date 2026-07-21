import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  countAnsweredResponses,
  createScheduleSyncPayload,
  normalizeCourseAssignment,
  normalizePracticeAssignment,
  normalizePracticeResponses
} from '../src/app/course-builder/course-assignment-domain.js'
import {
  COURSE_ASSIGNMENT_RESOURCES,
  createSupabaseCourseAssignmentAdapters
} from '../src/app/course-builder/course-assignment-adapters.js'

const schedule = createScheduleSyncPayload({
  schemaVersion: 1,
  id: 'student-physics-schedule',
  name: 'Physics schedule',
  timeZone: 'America/Sao_Paulo',
  sessions: [
    { id: 'session-2', title: 'Acceleration', startDate: '2026-08-08' },
    { id: 'session-1', title: 'Velocity', startDate: '2026-08-01', endDate: '2026-08-01' }
  ]
})
assert.equal(schedule.sessions.length, 2)
assert.equal(schedule.sessions[0].endDate, '2026-08-08')
assert.throws(() => createScheduleSyncPayload({ id: 'x', name: 'X', timeZone: 'UTC', sessions: [] }), /dated sessions/i)

const questions = [
  { id: 'q1', position: 0, type: 'multiple-choice', prompt: 'Choose.', options: ['A', 'B'], points: 1 },
  { id: 'q2', position: 1, type: 'essay', prompt: 'Explain.', points: 3 }
]
const assignment = normalizePracticeAssignment({
  id: 'assignment-1',
  courseId: 'course-1',
  courseTitle: 'Mechanics',
  studentId: 'student-1',
  status: 'assigned',
  questionCount: 2,
  totalPoints: 4,
  schedule: { scheduleId: 'schedule-1', sessionId: 'session-1', sessionTitle: 'Velocity', scheduledDate: '2026-08-01' },
  questions
})
assert.equal(assignment.questions[1].id, 'q2')
assert.deepEqual(normalizePracticeResponses({ q1: '1', unknown: 'x' }, questions), { q1: '1' })
assert.equal(countAnsweredResponses({ q1: '1', q2: '' }, questions), 1)

const rpcCalls = []
const responses = {
  [COURSE_ASSIGNMENT_RESOURCES.students]: [{ id: 'student-1', fullName: 'Student One', email: 'student@example.test' }],
  [COURSE_ASSIGNMENT_RESOURCES.syncSchedule]: {
    id: 'schedule-db-1', studentId: 'student-1', sourceKey: schedule.id, name: schedule.name,
    timeZone: schedule.timeZone, sessions: [{ id: 'session-db-1', sourceKey: 'session-1', title: 'Velocity', scheduledDate: '2026-08-01' }]
  },
  [COURSE_ASSIGNMENT_RESOURCES.sessions]: [{ id: 'session-db-1', scheduleId: 'schedule-db-1', scheduleName: 'Physics schedule', title: 'Velocity', scheduledDate: '2026-08-01' }],
  [COURSE_ASSIGNMENT_RESOURCES.assign]: {
    id: 'assignment-1', courseId: 'course-1', courseTitle: 'Mechanics', studentId: 'student-1', studentName: 'Student One',
    status: 'assigned', schedule: { sessionId: 'session-db-1', sessionTitle: 'Velocity', scheduledDate: '2026-08-01' }, questionCount: 2, totalPoints: 4
  },
  [COURSE_ASSIGNMENT_RESOURCES.authored]: [],
  [COURSE_ASSIGNMENT_RESOURCES.cancel]: { id: 'assignment-1', status: 'cancelled' },
  [COURSE_ASSIGNMENT_RESOURCES.practiceList]: [],
  [COURSE_ASSIGNMENT_RESOURCES.practiceGet]: {
    id: 'assignment-1', courseTitle: 'Mechanics', studentId: 'student-1', status: 'assigned', questionCount: 2, totalPoints: 4,
    schedule: { sessionId: 'session-db-1', sessionTitle: 'Velocity', scheduledDate: '2026-08-01' }, questions
  },
  [COURSE_ASSIGNMENT_RESOURCES.practiceStart]: { id: 'attempt-1', assignmentId: 'assignment-1', attemptNumber: 1, status: 'in_progress', responses: {} },
  [COURSE_ASSIGNMENT_RESOURCES.practiceSave]: { id: 'attempt-1', assignmentId: 'assignment-1', attemptNumber: 1, status: 'in_progress', responses: { q1: '1' } },
  [COURSE_ASSIGNMENT_RESOURCES.practiceSubmit]: {
    id: 'attempt-1', assignmentId: 'assignment-1', attemptNumber: 1, status: 'submitted', responses: { q1: '1' },
    result: { autoScore: 1, autoMaxPoints: 1, pendingReviewCount: 0, items: [] }
  }
}

const supabase = {
  auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null } } },
  async rpc(name, args) {
    rpcCalls.push({ name, args })
    return { data: responses[name], error: null }
  }
}
const adapters = createSupabaseCourseAssignmentAdapters({ supabase })
assert.equal((await adapters.listStudents())[0].fullName, 'Student One')
assert.equal((await adapters.syncSchedule('student-1', schedule)).sessions.length, 1)
assert.equal((await adapters.listSessions('student-1'))[0].title, 'Velocity')
assert.equal((await adapters.assign({ courseId: 'course-1', studentId: 'student-1', sessionId: 'session-db-1' })).studentId, 'student-1')
await adapters.listAuthored({ courseId: 'course-1' })
await adapters.cancel('assignment-1')
await adapters.listPractice()
assert.equal((await adapters.loadPractice('assignment-1')).questions.length, 2)
assert.equal((await adapters.startPractice('assignment-1')).status, 'in_progress')
assert.equal((await adapters.savePractice('attempt-1', { q1: '1' })).responses.q1, '1')
assert.equal((await adapters.submitPractice('attempt-1', { q1: '1' })).status, 'submitted')
assert.ok(rpcCalls.some((call) => call.name === 'assign_course_to_schedule_session' && call.args.p_schedule_session_id === 'session-db-1'))

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const migration = read('supabase/migrations/202607190001_course_practice_delivery.sql')
const composer = read('src/app/course-builder/course-composer.js')
const composerHtml = read('src/app/course-builder/course-composer.html')
const practicePlayer = read('src/app/course-builder/course-practice.js')
const practiceLibrary = read('src/app/course-builder/practice-library.html')
const studentDashboard = read('src/app/dashboard/student-dashboard.html')
const authorization = read('src/auth/authorization.js')

for (const fragment of [
  "values ('course.assign'",
  'create table if not exists public.learning_schedules',
  'create table if not exists public.course_assignments',
  'create table if not exists public.course_assignment_items',
  'create table if not exists public.course_practice_attempts',
  'course_assignment_delivery_question',
  'assign_course_to_schedule_session',
  'get_my_practice_assignment',
  'submit_my_course_practice_attempt',
  'revoke all on public.course_assignment_items from anon, authenticated'
]) assert.ok(migration.includes(fragment), `Missing migration contract: ${fragment}`)

const deliveryProjectionStart = migration.indexOf('create or replace function public.course_assignment_delivery_question')
const deliveryProjectionEnd = migration.indexOf('create or replace function public.learning_schedule_json', deliveryProjectionStart)
const deliveryProjection = migration.slice(deliveryProjectionStart, deliveryProjectionEnd)
assert.ok(deliveryProjection.includes('jsonb_strip_nulls(jsonb_build_object('), 'Delivery must use an explicit allowlist projection.')
for (const allowedKey of ['prompt', 'type', 'options', 'imageData', 'graph']) {
  assert.ok(deliveryProjection.includes(`'${allowedKey}', p_snapshot -> '${allowedKey}'`), `Delivery projection is missing ${allowedKey}`)
}
for (const secretKey of ['answer', 'correctOptionIndex', 'correctOptionIndexes', 'numericExpectedAnswer', 'teacherNotes', 'solution', 'answerKey']) {
  assert.equal(deliveryProjection.includes(`p_snapshot -> '${secretKey}'`), false, `Delivery projection exposes ${secretKey}`)
}
assert.ok(composer.includes("requireCapability(['course.compose', 'course.assign', 'question_bank.read'])"))
assert.ok(composer.includes('syncBrowserSchedule'))
assert.ok(composerHtml.includes('Assign to session'))
assert.ok(composerHtml.includes('Immutable at assignment time'))
assert.ok(practiceLibrary.includes('My practice space'))
assert.ok(practicePlayer.includes('normalizePracticeResponses'))
assert.equal(practicePlayer.includes('correctOptionIndex'), false, 'Student player must not consume answer keys.')
assert.ok(studentDashboard.includes('practice-library.html'))
assert.ok(authorization.includes("'course.assign'"))

const normalizedSummary = normalizeCourseAssignment(responses[COURSE_ASSIGNMENT_RESOURCES.assign])
assert.equal(normalizedSummary.schedule.sessionTitle, 'Velocity')

console.log('Course assignment, immutable delivery, practice attempt, adapter, authorization, and UI self-test passed.')
