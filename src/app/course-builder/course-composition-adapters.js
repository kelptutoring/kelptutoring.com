import {
  createCourseDefinition,
  normalizeCourseComposition,
  normalizeCourseSummary
} from './course-composition-domain.js'

const SAVE_RPC = 'save_course_composition'
const LIST_RPC = 'list_my_course_compositions'
const GET_RPC = 'get_my_course_composition'
const DUPLICATE_RPC = 'duplicate_course_composition'
const ARCHIVE_RPC = 'archive_course_composition'
const DELETE_RPC = 'delete_course_composition'

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

export function createSupabaseCourseCompositionAdapters({ supabase } = {}) {
  if (!supabase?.auth?.getUser || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase client with auth and RPC support is required.')
  }

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser()
    throwProviderError(error, 'The signed-in user could not be verified.')
    if (!data?.user?.id) throw new Error('Sign in before composing courses.')
    return data.user
  }

  async function invoke(name, args, fallback) {
    await requireUser()
    const { data, error } = await supabase.rpc(name, args)
    throwProviderError(error, fallback)
    return data
  }

  return {
    meta: Object.freeze({ scope: 'course-composition', provider: 'supabase', contractVersion: 1 }),

    async save(definition) {
      const normalized = createCourseDefinition(definition)
      if (!normalized.id) throw new TypeError('The course draft requires an ID.')
      if (!normalized.title) throw new TypeError('The course draft requires a title.')
      if (!normalized.primaryCurriculumNodeId) throw new TypeError('Choose a curriculum track or topic.')
      const data = await invoke(SAVE_RPC, { p_definition: normalized }, 'The course draft could not be saved.')
      const course = normalizeCourseComposition(data)
      if (!course) throw new Error('The saved course draft was invalid.')
      return course
    },

    async list({ status = 'active' } = {}) {
      const normalizedStatus = String(status || 'active').trim().toLowerCase()
      if (!['active', 'archived'].includes(normalizedStatus)) throw new TypeError('The course status filter is invalid.')
      const data = await invoke(LIST_RPC, { p_status: normalizedStatus }, 'Course drafts could not be loaded.')
      return (Array.isArray(data) ? data : []).map(normalizeCourseSummary).filter(Boolean)
    },

    async load(courseId) {
      const data = await invoke(GET_RPC, { p_course_id: requireId(courseId, 'Course lookup') }, 'The course draft could not be loaded.')
      const course = normalizeCourseComposition(data)
      if (!course) throw new Error('The course draft could not be loaded.')
      return course
    },

    async duplicate(courseId) {
      const data = await invoke(DUPLICATE_RPC, { p_course_id: requireId(courseId, 'Course duplication') }, 'The course draft could not be duplicated.')
      const course = normalizeCourseComposition(data)
      if (!course) throw new Error('The duplicated course draft was invalid.')
      return course
    },

    async archive(courseId) {
      const data = await invoke(ARCHIVE_RPC, { p_course_id: requireId(courseId, 'Course archival') }, 'The course draft could not be archived.')
      return normalizeCourseComposition(data)
    },

    async remove(courseId) {
      return invoke(DELETE_RPC, { p_course_id: requireId(courseId, 'Course deletion') }, 'The archived course draft could not be deleted.')
    }
  }
}

export const COURSE_COMPOSITION_RESOURCES = Object.freeze({
  saveRpc: SAVE_RPC,
  listRpc: LIST_RPC,
  getRpc: GET_RPC,
  duplicateRpc: DUPLICATE_RPC,
  archiveRpc: ARCHIVE_RPC,
  deleteRpc: DELETE_RPC
})
