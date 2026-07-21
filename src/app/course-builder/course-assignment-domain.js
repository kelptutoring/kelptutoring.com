export const COURSE_ASSIGNMENT_SCHEMA = 'kelp-course-assignment-v1'

function stringValue(value) {
  return String(value ?? '').trim()
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizePath(path) {
  return (Array.isArray(path) ? path : []).map((node) => ({
    id: stringValue(node?.id),
    type: stringValue(node?.type).toLowerCase(),
    name: stringValue(node?.name),
    slug: stringValue(node?.slug)
  })).filter((node) => node.id && node.name)
}

export function normalizeAssignmentStudent(record) {
  if (!record || typeof record !== 'object') return null
  const id = stringValue(record.id)
  if (!id) return null
  return {
    id,
    fullName: stringValue(record.fullName) || stringValue(record.email) || 'Student',
    email: stringValue(record.email)
  }
}

export function normalizeLearningSession(record) {
  if (!record || typeof record !== 'object') return null
  const id = stringValue(record.id)
  if (!id) return null
  return {
    id,
    scheduleId: stringValue(record.scheduleId),
    scheduleName: stringValue(record.scheduleName) || 'Student schedule',
    timeZone: stringValue(record.timeZone),
    sourceKey: stringValue(record.sourceKey),
    title: stringValue(record.title) || 'Untitled session',
    scheduledDate: stringValue(record.scheduledDate),
    endDate: stringValue(record.endDate),
    position: Math.max(0, Number(record.position) || 0)
  }
}

export function normalizeLearningSchedule(record) {
  if (!record || typeof record !== 'object') return null
  const id = stringValue(record.id)
  if (!id) return null
  return {
    id,
    studentId: stringValue(record.studentId),
    createdBy: stringValue(record.createdBy),
    sourceKey: stringValue(record.sourceKey),
    name: stringValue(record.name) || 'Student schedule',
    timeZone: stringValue(record.timeZone),
    status: stringValue(record.status || 'active').toLowerCase(),
    schemaVersion: Math.max(1, Number(record.schemaVersion) || 1),
    sessions: (Array.isArray(record.sessions) ? record.sessions : [])
      .map((session) => normalizeLearningSession({
        ...session,
        scheduleId: id,
        scheduleName: record.name,
        timeZone: record.timeZone
      }))
      .filter(Boolean),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  }
}

export function createScheduleSyncPayload(input = {}) {
  const id = stringValue(input.id)
  const name = stringValue(input.name)
  const timeZone = stringValue(input.timeZone)
  const sessions = (Array.isArray(input.sessions) ? input.sessions : []).map((session, position) => ({
    id: stringValue(session?.id),
    title: stringValue(session?.title) || 'Untitled session',
    startDate: stringValue(session?.startDate || session?.date),
    endDate: stringValue(session?.endDate || session?.startDate || session?.date),
    position,
    sourceSessionId: stringValue(session?.sourceSessionId) || null,
    trackId: stringValue(session?.trackId) || null,
    trackTitle: stringValue(session?.trackTitle),
    moduleId: stringValue(session?.moduleId) || null,
    moduleTitle: stringValue(session?.moduleTitle),
    notes: stringValue(session?.notes)
  }))
  if (!id) throw new TypeError('The generated schedule requires a stable ID.')
  if (!name) throw new TypeError('The generated schedule requires a name.')
  if (!timeZone) throw new TypeError('The generated schedule requires a timezone.')
  if (!sessions.length || sessions.some((session) => !session.id || !session.startDate)) {
    throw new TypeError('The generated schedule requires dated sessions with stable IDs.')
  }
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) {
    throw new TypeError('The generated schedule contains duplicate session IDs.')
  }
  return {
    schemaVersion: Math.max(1, Number(input.schemaVersion) || 1),
    id,
    name,
    timeZone,
    startDate: stringValue(input.startDate),
    endDate: stringValue(input.endDate),
    cadence: input.cadence && typeof input.cadence === 'object' ? input.cadence : null,
    context: input.context && typeof input.context === 'object' ? input.context : {},
    sessions
  }
}

function normalizeScheduleSnapshot(record) {
  const schedule = record && typeof record === 'object' ? record : {}
  return {
    scheduleId: stringValue(schedule.scheduleId),
    scheduleName: stringValue(schedule.scheduleName) || 'Student schedule',
    sessionId: stringValue(schedule.sessionId),
    sessionTitle: stringValue(schedule.sessionTitle) || 'Scheduled practice',
    scheduledDate: stringValue(schedule.scheduledDate),
    endDate: stringValue(schedule.endDate),
    timeZone: stringValue(schedule.timeZone)
  }
}

export function normalizeCourseAssignment(record) {
  if (!record || typeof record !== 'object') return null
  const id = stringValue(record.id)
  if (!id) return null
  return {
    schema: COURSE_ASSIGNMENT_SCHEMA,
    id,
    courseId: stringValue(record.courseId),
    courseTitle: stringValue(record.courseTitle) || 'Untitled course',
    courseDescription: stringValue(record.courseDescription),
    studentId: stringValue(record.studentId),
    studentName: stringValue(record.studentName) || 'Student',
    studentEmail: stringValue(record.studentEmail),
    status: stringValue(record.status || 'assigned').toLowerCase(),
    schedule: normalizeScheduleSnapshot(record.schedule),
    curriculumPath: normalizePath(record.curriculumPath),
    questionCount: Math.max(0, Number(record.questionCount) || 0),
    totalPoints: Math.max(0, numberValue(record.totalPoints)),
    assignedAt: record.assignedAt || null,
    completedAt: record.completedAt || null,
    cancelledAt: record.cancelledAt || null,
    latestAttempt: normalizePracticeAttempt(record.latestAttempt)
  }
}

export function normalizePracticeQuestion(record) {
  if (!record || typeof record !== 'object') return null
  const id = stringValue(record.id)
  if (!id) return null
  return {
    ...record,
    id,
    position: Math.max(0, Number(record.position) || 0),
    name: stringValue(record.name),
    prompt: stringValue(record.prompt),
    type: stringValue(record.type || 'short-answer').toLowerCase(),
    difficulty: stringValue(record.difficulty).toLowerCase(),
    questionTypeTags: [...new Set((Array.isArray(record.questionTypeTags) ? record.questionTypeTags : [])
      .map((value) => stringValue(value).toLowerCase()).filter(Boolean))],
    points: Math.max(0, numberValue(record.points)),
    options: (Array.isArray(record.options) ? record.options : []).map((option) => stringValue(option))
  }
}

export function normalizePracticeAssignment(record) {
  const assignment = normalizeCourseAssignment(record)
  if (!assignment) return null
  return {
    ...assignment,
    questions: (Array.isArray(record.questions) ? record.questions : [])
      .map(normalizePracticeQuestion)
      .filter(Boolean)
      .sort((left, right) => left.position - right.position)
  }
}

export function normalizePracticeAttempt(record) {
  if (!record || typeof record !== 'object') return null
  const id = stringValue(record.id)
  if (!id) return null
  return {
    id,
    assignmentId: stringValue(record.assignmentId),
    attemptNumber: Math.max(1, Number(record.attemptNumber) || 1),
    status: stringValue(record.status || 'in_progress').toLowerCase(),
    responses: record.responses && typeof record.responses === 'object' && !Array.isArray(record.responses)
      ? { ...record.responses }
      : {},
    result: record.result && typeof record.result === 'object' ? record.result : null,
    autoScore: Math.max(0, numberValue(record.autoScore ?? record.result?.autoScore)),
    autoMaxPoints: Math.max(0, numberValue(record.autoMaxPoints ?? record.result?.autoMaxPoints)),
    pendingReviewCount: Math.max(0, Number(record.pendingReviewCount ?? record.result?.pendingReviewCount) || 0),
    startedAt: record.startedAt || null,
    updatedAt: record.updatedAt || null,
    submittedAt: record.submittedAt || null
  }
}

export function normalizePracticeResponses(responses, questions = []) {
  const allowed = new Set((Array.isArray(questions) ? questions : []).map((question) => stringValue(question?.id)).filter(Boolean))
  return Object.fromEntries(Object.entries(responses && typeof responses === 'object' && !Array.isArray(responses) ? responses : {})
    .filter(([questionId]) => allowed.has(questionId))
    .map(([questionId, value]) => [questionId, Array.isArray(value) ? [...value] : value]))
}

export function countAnsweredResponses(responses, questions = []) {
  const normalized = normalizePracticeResponses(responses, questions)
  return Object.values(normalized).filter((value) => {
    if (Array.isArray(value)) return value.length > 0
    return String(value ?? '').trim() !== ''
  }).length
}
