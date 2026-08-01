const MEMBERSHIP_ROLES = new Set(['student', 'tutor', 'mentor', 'guardian', 'administrator'])
const ACCESS_MODES = new Set(['participating', 'read_only'])
const MANAGEMENT_ACCESS_MODES = new Set(['active', 'unavailable'])
const SCHEDULE_LINKAGE_STATUSES = new Set(['linked', 'missing'])
const PROVIDER_KINDS = new Set(['kelp', 'independent_tutor'])

export function normalizeClassroomSpacePayload(payload = {}) {
  const membershipRole = String(payload?.viewer?.membershipRole || '').trim().toLowerCase()
  const accessMode = String(payload?.viewer?.accessMode || 'participating').trim().toLowerCase()
  const classroomId = String(payload?.classroom?.id || '')
  const courseId = String(payload?.course?.id || '')
  const managementAccess = String(payload?.management?.access || 'unavailable').trim().toLowerCase()
  const scheduleLinkageStatus = String(payload?.schedule?.linkageStatus || 'missing').trim().toLowerCase()
  const scheduleId = String(payload?.schedule?.id || '')
  const providerKind = String(payload?.provider?.kind || inferProviderKind(payload?.course?.serviceModel))
    .trim().toLowerCase()
  if (!classroomId || !courseId || !MEMBERSHIP_ROLES.has(membershipRole) || !ACCESS_MODES.has(accessMode)) {
    throw new TypeError('The Classroom space payload is incomplete.')
  }
  if (!MANAGEMENT_ACCESS_MODES.has(managementAccess)) {
    throw new TypeError('The Classroom management payload is invalid.')
  }
  if (!SCHEDULE_LINKAGE_STATUSES.has(scheduleLinkageStatus) || (scheduleLinkageStatus === 'linked' && !scheduleId)) {
    throw new TypeError('The Classroom Schedule summary is invalid.')
  }
  if (!PROVIDER_KINDS.has(providerKind)) {
    throw new TypeError('The Classroom provider payload is invalid.')
  }

  return Object.freeze({
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    viewer: Object.freeze({
      id: String(payload?.viewer?.id || ''),
      membershipRole,
      membershipStatus: String(payload?.viewer?.membershipStatus || 'active'),
      accessMode,
      canParticipate: accessMode === 'participating' && payload?.viewer?.canParticipate !== false,
      canManageClassroom: managementAccess === 'active' && payload?.viewer?.canManageClassroom === true,
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
    student: normalizePerson(payload?.student, 'Student'),
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
    mentor: normalizeOptionalPerson(payload?.mentor),
    provider: Object.freeze({
      kind: providerKind,
      label: String(payload?.provider?.label || providerLabel(providerKind))
    }),
    schedule: Object.freeze({
      linkageStatus: scheduleLinkageStatus,
      id: scheduleId,
      name: String(payload?.schedule?.name || ''),
      recordStatus: String(payload?.schedule?.recordStatus || ''),
      timeZone: String(payload?.schedule?.timeZone || ''),
      sessionCount: normalizeCount(payload?.schedule?.sessionCount),
      firstSessionDate: payload?.schedule?.firstSessionDate || null,
      lastSessionDate: payload?.schedule?.lastSessionDate || null,
      versionCount: normalizeCount(payload?.schedule?.versionCount),
      updatedAt: payload?.schedule?.updatedAt || null
    }),
    management: Object.freeze({
      access: managementAccess,
      actions: Object.freeze({
        tutorAssignment: normalizeStatus(payload?.management?.actions?.tutorAssignment),
        meetingSchedule: normalizeStatus(payload?.management?.actions?.meetingSchedule),
        courseEnding: normalizeStatus(payload?.management?.actions?.courseEnding),
        courseTermination: normalizeStatus(payload?.management?.actions?.courseTermination)
      })
    }),
    featureStatus: Object.freeze({
      classroomOverview: normalizeStatus(payload?.featureStatus?.classroomOverview),
      classroomNavigation: normalizeStatus(payload?.featureStatus?.classroomNavigation),
      forum: normalizeStatus(payload?.featureStatus?.forum),
      assignments: normalizeStatus(payload?.featureStatus?.assignments),
      files: normalizeStatus(payload?.featureStatus?.files),
      reportCards: normalizeStatus(payload?.featureStatus?.reportCards),
      history: normalizeStatus(payload?.featureStatus?.history),
      classroomManagement: normalizeStatus(payload?.featureStatus?.classroomManagement),
      liveClassTool: normalizeStatus(payload?.featureStatus?.liveClassTool)
    })
  })
}

function normalizePerson(person, fallbackName) {
  return Object.freeze({
    id: String(person?.id || ''),
    name: String(person?.name || fallbackName)
  })
}

function normalizeOptionalPerson(person) {
  if (!person || typeof person !== 'object') return null
  const id = String(person.id || '')
  const name = String(person.name || '')
  return id && name ? Object.freeze({ id, name }) : null
}

function normalizeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

function inferProviderKind(serviceModel) {
  return String(serviceModel || '').trim().toLowerCase() === 'independent_tutor'
    ? 'independent_tutor'
    : 'kelp'
}

function providerLabel(kind) {
  return kind === 'independent_tutor' ? 'Independent Tutor' : 'Kelp Tutoring'
}

function normalizeStatus(value) {
  return String(value || 'planned').trim().toLowerCase()
}
