import { normalizeClassroomCardColor } from '../dashboard/student-dashboard-contract.js'

export const STUDENT_CLASSROOM_COLLECTION_KEYS = Object.freeze(['active', 'former', 'archived'])

const PRESENTATION_STATES = new Set(['active', 'ending_soon', 'former', 'archived'])
const ACCESS_MODES = new Set(['participating', 'read_only'])

export function normalizeStudentClassroomsPayload(payload = {}) {
  const collections = payload?.collections || {}
  return Object.freeze({
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    viewer: Object.freeze({
      id: String(payload?.viewer?.id || ''),
      name: String(payload?.viewer?.name || '')
    }),
    collections: Object.freeze(Object.fromEntries(
      STUDENT_CLASSROOM_COLLECTION_KEYS.map((collectionKey) => [
        collectionKey,
        Object.freeze((Array.isArray(collections[collectionKey]) ? collections[collectionKey] : [])
          .map((item) => normalizeStudentClassroom(item, collectionKey))
          .filter(Boolean))
      ])
    )),
    featureStatus: Object.freeze({
      classroomCollections: normalizeStatus(payload?.featureStatus?.classroomCollections, 'active_phase_3c'),
      archiveRestore: normalizeStatus(payload?.featureStatus?.archiveRestore, 'active_phase_3c'),
      nextClass: normalizeStatus(payload?.featureStatus?.nextClass, 'pending_schedule_phase'),
      homework: normalizeStatus(payload?.featureStatus?.homework, 'pending_assignment_phase'),
      unread: normalizeStatus(payload?.featureStatus?.unread, 'pending_forum_phase'),
      reportCards: normalizeStatus(payload?.featureStatus?.reportCards, 'pending_report_phase')
    })
  })
}

export function normalizeStudentClassroomCollection(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return STUDENT_CLASSROOM_COLLECTION_KEYS.includes(normalized) ? normalized : 'active'
}

function normalizeStudentClassroom(item, collectionKey) {
  const courseId = String(item?.courseId || '').trim()
  const classroomId = String(item?.classroom?.id || '').trim()
  if (!courseId || !classroomId) return null

  const expectedAccessMode = collectionKey === 'active' ? 'participating' : 'read_only'
  const accessMode = ACCESS_MODES.has(String(item?.classroom?.accessMode || '').trim().toLowerCase())
    ? String(item.classroom.accessMode).trim().toLowerCase()
    : expectedAccessMode
  const expectedPresentation = collectionKey === 'active'
    ? (item?.courseStatus === 'wind_down' ? 'ending_soon' : 'active')
    : collectionKey
  const presentationState = PRESENTATION_STATES.has(String(item?.card?.presentationState || '').trim().toLowerCase())
    ? String(item.card.presentationState).trim().toLowerCase()
    : expectedPresentation

  return Object.freeze({
    courseId,
    courseTitle: String(item?.courseTitle || 'Course'),
    courseStatus: String(item?.courseStatus || 'draft'),
    serviceModel: String(item?.serviceModel || ''),
    startDate: normalizeNullableString(item?.startDate),
    scheduledEndDate: normalizeNullableString(item?.scheduledEndDate),
    windDownEndsOn: normalizeNullableString(item?.windDownEndsOn),
    endedAt: normalizeNullableString(item?.endedAt),
    subject: Object.freeze({
      id: String(item?.subject?.id || ''),
      name: String(item?.subject?.name || 'Subject')
    }),
    focus: Object.freeze({
      id: String(item?.focus?.id || ''),
      name: String(item?.focus?.name || '')
    }),
    tutor: Object.freeze({
      id: String(item?.tutor?.id || ''),
      name: String(item?.tutor?.name || 'Tutor')
    }),
    classroom: Object.freeze({
      id: classroomId,
      status: String(item?.classroom?.status || 'inactive'),
      membershipRole: 'student',
      membershipStatus: String(item?.classroom?.membershipStatus || 'ended'),
      accessMode
    }),
    card: Object.freeze({
      colorKey: normalizeClassroomCardColor(item?.card?.colorKey),
      position: item?.card?.position !== null && item?.card?.position !== undefined
        && Number.isInteger(Number(item.card.position))
        ? Number(item.card.position)
        : null,
      presentationState,
      personallyArchivedAt: normalizeNullableString(item?.card?.personallyArchivedAt)
    })
  })
}

function normalizeNullableString(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function normalizeStatus(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || fallback
}
