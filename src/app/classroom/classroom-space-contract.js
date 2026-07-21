const MEMBERSHIP_ROLES = new Set(['student', 'tutor', 'mentor', 'guardian', 'administrator'])
const ACCESS_MODES = new Set(['participating', 'read_only'])

export function normalizeClassroomSpacePayload(payload = {}) {
  const membershipRole = String(payload?.viewer?.membershipRole || '').trim().toLowerCase()
  const accessMode = String(payload?.viewer?.accessMode || 'participating').trim().toLowerCase()
  const classroomId = String(payload?.classroom?.id || '')
  const courseId = String(payload?.course?.id || '')
  if (!classroomId || !courseId || !MEMBERSHIP_ROLES.has(membershipRole) || !ACCESS_MODES.has(accessMode)) {
    throw new TypeError('The Classroom space payload is incomplete.')
  }

  return Object.freeze({
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    viewer: Object.freeze({
      id: String(payload?.viewer?.id || ''),
      membershipRole,
      membershipStatus: String(payload?.viewer?.membershipStatus || 'active'),
      accessMode,
      canParticipate: accessMode === 'participating' && payload?.viewer?.canParticipate !== false,
      personalArchived: Boolean(payload?.viewer?.personalArchived)
    }),
    classroom: Object.freeze({
      id: classroomId,
      status: String(payload?.classroom?.status || 'inactive'),
      createdAt: payload?.classroom?.createdAt || null,
      readOnly: accessMode === 'read_only' || Boolean(payload?.classroom?.readOnly)
    }),
    course: Object.freeze({
      id: courseId,
      title: String(payload?.course?.title || 'Classroom'),
      status: String(payload?.course?.status || 'draft'),
      serviceModel: String(payload?.course?.serviceModel || ''),
      startDate: payload?.course?.startDate || null,
      scheduledEndDate: payload?.course?.scheduledEndDate || null,
      windDownEndsOn: payload?.course?.windDownEndsOn || null,
      endedAt: payload?.course?.endedAt || null
    }),
    subject: Object.freeze({
      id: String(payload?.subject?.id || ''),
      name: String(payload?.subject?.name || 'Subject')
    }),
    focus: Object.freeze({
      id: String(payload?.focus?.id || ''),
      name: String(payload?.focus?.name || '')
    }),
    tutor: Object.freeze({
      id: String(payload?.tutor?.id || ''),
      name: String(payload?.tutor?.name || 'Tutor')
    }),
    featureStatus: Object.freeze({
      forum: normalizeStatus(payload?.featureStatus?.forum),
      assignments: normalizeStatus(payload?.featureStatus?.assignments),
      files: normalizeStatus(payload?.featureStatus?.files),
      reportCards: normalizeStatus(payload?.featureStatus?.reportCards),
      history: normalizeStatus(payload?.featureStatus?.history),
      liveClassTool: normalizeStatus(payload?.featureStatus?.liveClassTool)
    })
  })
}

function normalizeStatus(value) {
  return String(value || 'planned').trim().toLowerCase()
}
