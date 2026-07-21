import {
  createScheduleSyncPayload,
  normalizeAssignmentStudent,
  normalizeCourseAssignment,
  normalizeLearningSchedule,
  normalizeLearningSession,
  normalizePracticeAssignment,
  normalizePracticeAttempt
} from './course-assignment-domain.js'

const RPC = Object.freeze({
  students: 'list_course_assignment_students',
  syncSchedule: 'upsert_student_learning_schedule',
  sessions: 'list_student_learning_sessions',
  assign: 'assign_course_to_schedule_session',
  authored: 'list_my_course_assignments',
  cancel: 'cancel_course_assignment',
  practiceList: 'list_my_practice_assignments',
  practiceGet: 'get_my_practice_assignment',
  practiceStart: 'start_or_resume_course_practice_attempt',
  practiceSave: 'save_my_course_practice_progress',
  practiceSubmit: 'submit_my_course_practice_attempt'
})

function requireId(value, label) {
  const id = String(value || '').trim()
  if (!id) throw new TypeError(`${label} requires an ID.`)
  return id
}

function throwProviderError(error, fallback) {
  if (!error) return
  const providerError = new Error(String(error.message || '').trim() || fallback)
  providerError.code = error.code || null
  providerError.cause = error
  throw providerError
}

export function createSupabaseCourseAssignmentAdapters({ supabase } = {}) {
  if (!supabase?.auth?.getUser || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase client with auth and RPC support is required.')
  }

  async function invoke(name, args, fallback) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    throwProviderError(authError, 'The signed-in user could not be verified.')
    if (!authData?.user?.id) throw new Error('Sign in before opening course assignments.')
    const { data, error } = await supabase.rpc(name, args)
    throwProviderError(error, fallback)
    return data
  }

  return {
    meta: Object.freeze({ scope: 'course-assignment', provider: 'supabase', contractVersion: 1 }),

    async listStudents() {
      const data = await invoke(RPC.students, {}, 'Students could not be loaded.')
      return (Array.isArray(data) ? data : []).map(normalizeAssignmentStudent).filter(Boolean)
    },

    async syncSchedule(studentId, schedule) {
      const data = await invoke(RPC.syncSchedule, {
        p_student_id: requireId(studentId, 'Schedule synchronization'),
        p_schedule: createScheduleSyncPayload(schedule)
      }, 'The student schedule could not be synchronized.')
      const normalized = normalizeLearningSchedule(data)
      if (!normalized) throw new Error('The synchronized schedule response was invalid.')
      return normalized
    },

    async listSessions(studentId) {
      const data = await invoke(RPC.sessions, {
        p_student_id: requireId(studentId, 'Schedule session lookup')
      }, 'Student schedule sessions could not be loaded.')
      return (Array.isArray(data) ? data : []).map(normalizeLearningSession).filter(Boolean)
    },

    async assign({ courseId, studentId, sessionId } = {}) {
      const data = await invoke(RPC.assign, {
        p_course_id: requireId(courseId, 'Course assignment'),
        p_student_id: requireId(studentId, 'Course assignment'),
        p_schedule_session_id: requireId(sessionId, 'Course assignment')
      }, 'The course could not be assigned.')
      const normalized = normalizeCourseAssignment(data)
      if (!normalized) throw new Error('The course assignment response was invalid.')
      return normalized
    },

    async listAuthored({ courseId = null, status = null } = {}) {
      const data = await invoke(RPC.authored, {
        p_course_id: courseId ? requireId(courseId, 'Assignment lookup') : null,
        p_status: status || null
      }, 'Course assignments could not be loaded.')
      return (Array.isArray(data) ? data : []).map(normalizeCourseAssignment).filter(Boolean)
    },

    async cancel(assignmentId) {
      return invoke(RPC.cancel, {
        p_assignment_id: requireId(assignmentId, 'Assignment cancellation')
      }, 'The course assignment could not be cancelled.')
    },

    async listPractice() {
      const data = await invoke(RPC.practiceList, {}, 'Assigned practice could not be loaded.')
      return (Array.isArray(data) ? data : []).map(normalizeCourseAssignment).filter(Boolean)
    },

    async loadPractice(assignmentId) {
      const data = await invoke(RPC.practiceGet, {
        p_assignment_id: requireId(assignmentId, 'Practice assignment lookup')
      }, 'The assigned practice activity could not be loaded.')
      const normalized = normalizePracticeAssignment(data)
      if (!normalized) throw new Error('The assigned practice response was invalid.')
      return normalized
    },

    async startPractice(assignmentId) {
      const data = await invoke(RPC.practiceStart, {
        p_assignment_id: requireId(assignmentId, 'Practice attempt')
      }, 'The practice attempt could not be started.')
      const normalized = normalizePracticeAttempt(data)
      if (!normalized) throw new Error('The practice attempt response was invalid.')
      return normalized
    },

    async savePractice(attemptId, responses) {
      const data = await invoke(RPC.practiceSave, {
        p_attempt_id: requireId(attemptId, 'Practice progress'),
        p_responses: responses && typeof responses === 'object' ? responses : {}
      }, 'Practice progress could not be saved.')
      const normalized = normalizePracticeAttempt(data)
      if (!normalized) throw new Error('The saved practice response was invalid.')
      return normalized
    },

    async submitPractice(attemptId, responses) {
      const data = await invoke(RPC.practiceSubmit, {
        p_attempt_id: requireId(attemptId, 'Practice submission'),
        p_responses: responses && typeof responses === 'object' ? responses : {}
      }, 'The practice attempt could not be submitted.')
      const normalized = normalizePracticeAttempt(data)
      if (!normalized) throw new Error('The submitted practice response was invalid.')
      return normalized
    }
  }
}

export const COURSE_ASSIGNMENT_RESOURCES = RPC
