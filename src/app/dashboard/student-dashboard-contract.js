export const DASHBOARD_BLOCK_KEYS = Object.freeze(['calendar', 'classrooms'])
export const DEFAULT_DASHBOARD_BLOCK_ORDER = Object.freeze(['calendar', 'classrooms'])
export const DASHBOARD_CALENDAR_VIEWS = Object.freeze(['month', 'week'])
export const CLASSROOM_CARD_COLOR_KEYS = Object.freeze([
  'ocean', 'kelp', 'coral', 'orchid', 'sunrise', 'slate'
])
export const STUDENT_CALENDAR_EVENT_KINDS = Object.freeze([
  'course_start', 'course_end', 'schedule_milestone', 'assignment_due',
  'regular_class', 'extra_class', 'independent_progress'
])

export function normalizeDashboardBlockOrder(value) {
  if (!Array.isArray(value)) return [...DEFAULT_DASHBOARD_BLOCK_ORDER]
  const normalized = value.map((item) => String(item || '').trim().toLowerCase())
  const isExactSet = normalized.length === DASHBOARD_BLOCK_KEYS.length
    && new Set(normalized).size === DASHBOARD_BLOCK_KEYS.length
    && DASHBOARD_BLOCK_KEYS.every((key) => normalized.includes(key))
  return isExactSet ? normalized : [...DEFAULT_DASHBOARD_BLOCK_ORDER]
}

export function normalizeDashboardCalendarView(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return DASHBOARD_CALENDAR_VIEWS.includes(normalized) ? normalized : 'month'
}

export function normalizeCollapsedDashboardBlocks(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => DASHBOARD_BLOCK_KEYS.includes(item)))]
}

export function normalizeStudentDashboardPayload(payload = {}) {
  const preferences = payload?.preferences || {}
  return {
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    viewer: {
      id: String(payload?.viewer?.id || ''),
      name: String(payload?.viewer?.name || '')
    },
    preferences: {
      blockOrder: normalizeDashboardBlockOrder(preferences.blockOrder),
      calendarView: normalizeDashboardCalendarView(preferences.calendarView),
      collapsedBlocks: normalizeCollapsedDashboardBlocks(preferences.collapsedBlocks),
      revision: Math.max(1, Number(preferences.revision) || 1),
      updatedAt: preferences.updatedAt || null
    },
    classrooms: Array.isArray(payload?.classrooms)
      ? payload.classrooms.map(normalizeClassroomFoundation).filter(Boolean)
      : [],
    featureStatus: {
      classroomCards: normalizeFeatureStatus(payload?.featureStatus?.classroomCards, 'pending_phase_2d'),
      classroomSpace: normalizeFeatureStatus(payload?.featureStatus?.classroomSpace, 'pending_phase_2d'),
      calendarData: normalizeFeatureStatus(payload?.featureStatus?.calendarData, 'pending_phase_2e'),
      credits: normalizeFeatureStatus(payload?.featureStatus?.credits, 'pending_credit_phase')
    }
  }
}

export function moveDashboardBlock(order, blockKey, direction) {
  const normalized = normalizeDashboardBlockOrder(order)
  const index = normalized.indexOf(blockKey)
  const targetIndex = index + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)
  if (index < 0 || targetIndex < 0 || targetIndex >= normalized.length) return normalized
  const next = [...normalized]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

export function placeDashboardBlockAtTarget(order, movingKey, targetKey) {
  const normalized = normalizeDashboardBlockOrder(order)
  if (movingKey === targetKey || !normalized.includes(movingKey) || !normalized.includes(targetKey)) {
    return normalized
  }
  const next = [...normalized]
  const movingIndex = next.indexOf(movingKey)
  const targetIndex = next.indexOf(targetKey)
  next.splice(movingIndex, 1)
  next.splice(targetIndex, 0, movingKey)
  return normalizeDashboardBlockOrder(next)
}

export function normalizeClassroomCardColor(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return CLASSROOM_CARD_COLOR_KEYS.includes(normalized) ? normalized : 'ocean'
}

export function normalizeStudentCalendarPayload(payload = {}) {
  const range = payload?.range || {}
  const availabilityOverlay = payload?.availabilityOverlay || {}
  const calendarPolicy = payload?.calendarPolicy || {}
  const lessonRequestFoundation = payload?.lessonRequestFoundation || {}
  return {
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    contract: {
      name: String(payload?.contract?.name || ''),
      phase: String(payload?.contract?.phase || ''),
      version: Math.max(0, Number(payload?.contract?.version) || 0),
      scheduleAuthority: String(payload?.contract?.scheduleAuthority || ''),
      assignmentAuthority: String(payload?.contract?.assignmentAuthority || ''),
      scope: String(payload?.contract?.scope || 'dashboard'),
      classroomId: String(payload?.contract?.classroomId || ''),
      legacyScheduleMirrorAuthoritative:
        payload?.contract?.legacyScheduleMirrorAuthoritative === true,
      directEventDestinations:
        payload?.contract?.directEventDestinations === true,
      moduleColorPresentation:
        payload?.contract?.moduleColorPresentation === true,
      itemAcademicPresentation:
        payload?.contract?.itemAcademicPresentation === true,
      courseLifecycleCoveragePresentation:
        payload?.contract?.courseLifecycleCoveragePresentation === true,
      roleAwareClassroomAccess:
        payload?.contract?.roleAwareClassroomAccess === true,
      failureMode: String(payload?.contract?.failureMode || '')
    },
    viewer: {
      membershipRole: String(payload?.viewer?.membershipRole || '').trim().toLowerCase(),
      canRequestLesson: payload?.viewer?.canRequestLesson === true
    },
    range: {
      startDate: normalizeCalendarDate(range.startDate),
      endDate: normalizeCalendarDate(range.endDate),
      timeZone: String(range.timeZone || 'UTC')
    },
    events: Array.isArray(payload?.events)
      ? payload.events.map(normalizeCalendarEvent).filter(Boolean)
      : [],
    availabilityOverlay: {
      status: normalizeFeatureStatus(availabilityOverlay.status, 'contract_only_phase_2e'),
      eligibleContexts: Array.isArray(availabilityOverlay.eligibleContexts)
        ? availabilityOverlay.eligibleContexts.map(normalizeAvailabilityContext).filter(Boolean)
        : []
    },
    calendarPolicy: {
      dateOnlyDisplayAnchor: String(calendarPolicy.dateOnlyDisplayAnchor || ''),
      dateOnlyDisplayIsPresentationOnly:
        calendarPolicy.dateOnlyDisplayIsPresentationOnly === true,
      dateOnlyItemsBlockAvailability:
        calendarPolicy.dateOnlyItemsBlockAvailability === true,
      assignmentDeadlinesAreIndependent:
        calendarPolicy.assignmentDeadlinesAreIndependent === true,
      assignmentDeadlineChangesMoveMeetings:
        calendarPolicy.assignmentDeadlineChangesMoveMeetings === true,
      canonicalFailureIsAtomic: calendarPolicy.canonicalFailureIsAtomic === true,
      legacyScheduleFallback: calendarPolicy.legacyScheduleFallback === true,
      classroomCourseFilter: calendarPolicy.classroomCourseFilter === true,
      availabilityTutorScope: String(calendarPolicy.availabilityTutorScope || '')
    },
    lessonRequestFoundation: {
      schemaVersion: Math.max(
        0,
        Number(lessonRequestFoundation.schemaVersion) || 0
      ),
      status: normalizeFeatureStatus(
        lessonRequestFoundation.status,
        'unavailable'
      ),
      scope: ['dashboard', 'classroom'].includes(
        String(lessonRequestFoundation.scope || '').trim().toLowerCase()
      )
        ? String(lessonRequestFoundation.scope).trim().toLowerCase()
        : '',
      canStart: lessonRequestFoundation.canStart === true,
      tutorSelection: String(lessonRequestFoundation.tutorSelection || ''),
      contextSelection: String(lessonRequestFoundation.contextSelection || ''),
      purposeOptions: Array.isArray(lessonRequestFoundation.purposeOptions)
        ? lessonRequestFoundation.purposeOptions
          .map(normalizeLessonRequestPurpose)
          .filter(Boolean)
        : [],
      durationMinutes: Array.isArray(lessonRequestFoundation.durationMinutes)
        ? lessonRequestFoundation.durationMinutes
          .map(Number)
          .filter((value) => [30, 60, 90].includes(value))
        : [],
      constraints: {
        minimumLeadMinutes: normalizeNonNegativeInteger(
          lessonRequestFoundation.constraints?.minimumLeadMinutes
        ),
        maximumAdvanceDays: normalizeNonNegativeInteger(
          lessonRequestFoundation.constraints?.maximumAdvanceDays
        ),
        pendingRequestExpiresMinutesBeforeClass: normalizeNonNegativeInteger(
          lessonRequestFoundation.constraints?.pendingRequestExpiresMinutesBeforeClass
        )
      },
      requiredFields: Array.isArray(lessonRequestFoundation.requiredFields)
        ? [...new Set(
            lessonRequestFoundation.requiredFields
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          )]
        : [],
      draftStorage: String(lessonRequestFoundation.draftStorage || ''),
      submissionStatus: normalizeFeatureStatus(
        lessonRequestFoundation.submissionStatus,
        'pending_phase_10'
      ),
      availabilityStatus: normalizeFeatureStatus(
        lessonRequestFoundation.availabilityStatus,
        'pending_phase_10'
      ),
      creditValidationStatus: normalizeFeatureStatus(
        lessonRequestFoundation.creditValidationStatus,
        'pending_phase_11'
      ),
      createsReservation: lessonRequestFoundation.createsReservation === true,
      createsLessonRequest: lessonRequestFoundation.createsLessonRequest === true,
      createsClass: lessonRequestFoundation.createsClass === true
    },
    featureStatus: {
      calendarProjection: normalizeFeatureStatus(payload?.featureStatus?.calendarProjection, 'active_phase_2e'),
      scheduledClasses: normalizeFeatureStatus(payload?.featureStatus?.scheduledClasses, 'pending_calendar_phase'),
      availabilitySlots: normalizeFeatureStatus(payload?.featureStatus?.availabilitySlots, 'contract_only_phase_2e'),
      lessonRequests: normalizeFeatureStatus(payload?.featureStatus?.lessonRequests, 'pending_calendar_phase'),
      bookingConcurrency: normalizeFeatureStatus(payload?.featureStatus?.bookingConcurrency, 'pending_calendar_phase')
    }
  }
}

export function calendarRangeForView(anchorDate, view) {
  const anchor = normalizeCalendarAnchor(anchorDate)
  const normalizedView = normalizeDashboardCalendarView(view)
  if (normalizedView === 'month') {
    return {
      startDate: formatCalendarDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)),
      endDate: formatCalendarDate(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12))
    }
  }
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { startDate: formatCalendarDate(start), endDate: formatCalendarDate(end) }
}

export function moveCalendarAnchor(anchorDate, view, direction) {
  const anchor = normalizeCalendarAnchor(anchorDate)
  const amount = direction === 'previous' ? -1 : direction === 'next' ? 1 : 0
  if (!amount) return anchor
  if (normalizeDashboardCalendarView(view) === 'month') {
    return new Date(anchor.getFullYear(), anchor.getMonth() + amount, 1, 12)
  }
  const next = new Date(anchor)
  next.setDate(anchor.getDate() + (amount * 7))
  return next
}

export function calendarReelStart(previousAnchor, nextAnchor, view, maximumMonths = 6) {
  const previous = normalizeCalendarAnchor(previousAnchor)
  const target = normalizeCalendarAnchor(nextAnchor)
  const direction = target > previous ? 'forward' : target < previous ? 'backward' : ''
  const monthLimit = Math.max(1, Math.floor(Number(maximumMonths) || 6))
  if (!direction) return previous

  const monthStart = new Date(
    target.getFullYear(),
    target.getMonth() + (direction === 'forward' ? -monthLimit : monthLimit),
    1,
    12
  )
  const boundaryDay = normalizeDashboardCalendarView(view) === 'month'
    ? 1
    : Math.min(
      target.getDate(),
      new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12).getDate()
    )
  const boundary = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    boundaryDay,
    12
  )
  if (direction === 'forward' && previous < boundary) return boundary
  if (direction === 'backward' && previous > boundary) return boundary
  return previous
}

export function moveClassroomCard(order, classroomId, direction) {
  const normalized = normalizeClassroomCardIds(order)
  const index = normalized.indexOf(String(classroomId || ''))
  const targetIndex = index + (direction === 'earlier' ? -1 : direction === 'later' ? 1 : 0)
  if (index < 0 || targetIndex < 0 || targetIndex >= normalized.length) return normalized
  const next = [...normalized]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

export function placeClassroomCardAtTarget(order, movingId, targetId) {
  const normalized = normalizeClassroomCardIds(order)
  const moving = String(movingId || '')
  const target = String(targetId || '')
  if (moving === target || !normalized.includes(moving) || !normalized.includes(target)) return normalized
  const next = [...normalized]
  const movingIndex = next.indexOf(moving)
  const targetIndex = next.indexOf(target)
  next.splice(movingIndex, 1)
  next.splice(targetIndex, 0, moving)
  return next
}

function normalizeClassroomFoundation(item) {
  if (!item?.courseId) return null
  const classroom = item.classroom?.id
    ? {
        id: String(item.classroom.id),
        status: String(item.classroom.status || 'inactive'),
        membershipRole: String(item.classroom.membershipRole || 'student')
      }
    : null
  return {
    courseId: String(item.courseId),
    courseTitle: String(item.courseTitle || 'Course'),
    courseStatus: String(item.courseStatus || 'draft'),
    serviceModel: String(item.serviceModel || ''),
    startDate: item.startDate || null,
    scheduledEndDate: item.scheduledEndDate || null,
    subject: {
      id: String(item.subject?.id || ''),
      name: String(item.subject?.name || 'Subject')
    },
    focus: {
      id: String(item.focus?.id || ''),
      name: String(item.focus?.name || '')
    },
    tutor: {
      id: String(item.tutor?.id || ''),
      name: String(item.tutor?.name || 'Tutor')
    },
    classroom,
    card: {
      colorKey: normalizeClassroomCardColor(item.card?.colorKey),
      position: item.card?.position !== null && item.card?.position !== undefined
        && Number.isInteger(Number(item.card.position))
        ? Number(item.card.position)
        : null
    }
  }
}

function normalizeCalendarEvent(item) {
  const id = String(item?.id || '').trim()
  const title = String(item?.title || '').trim()
  const startsOn = normalizeCalendarDate(item?.startsOn)
  const kind = String(item?.kind || '').trim().toLowerCase()
  const courseId = String(item?.courseId || '').trim()
  if (!id || !title || !startsOn || !courseId || !STUDENT_CALENDAR_EVENT_KINDS.includes(kind)) return null
  const actionType = String(item?.action?.type || '').trim().toLowerCase()
  const assignmentId = String(item?.action?.assignmentId || '').trim()
  const scheduleItemId = String(
    item?.scheduleItemId || item?.action?.scheduleItemId || ''
  ).trim()
  const trackSessionHref = safeCalendarHref(item?.action?.href)
  const action = actionType === 'open_practice' && assignmentId
    ? { type: 'open_practice', assignmentId }
    : actionType === 'open_track_session' && trackSessionHref
      ? { type: 'open_track_session', href: trackSessionHref, scheduleItemId }
      : null
  return {
    id,
    kind,
    startsOn,
    endsOn: normalizeCalendarDate(item?.endsOn) || startsOn,
    title,
    detail: String(item?.detail || ''),
    eventCode: String(item?.eventCode || '').trim().toUpperCase(),
    eventLabel: String(item?.eventLabel || '').trim(),
    courseId,
    classroomId: String(item?.classroomId || ''),
    scheduleItemId,
    courseTitle: String(item?.courseTitle || 'Course'),
    tutor: {
      id: String(item?.tutor?.id || ''),
      name: String(item?.tutor?.name || 'Tutor')
    },
    subject: String(item?.subject || 'Subject'),
    focus: String(item?.focus || ''),
    educationLevel: {
      name: String(item?.educationLevel?.name || ''),
      slug: String(item?.educationLevel?.slug || ''),
      code: String(item?.educationLevel?.code || '').trim().toUpperCase()
    },
    academicScope: item?.academicScope === 'branch' ? 'branch' : 'course',
    academicPath: String(item?.academicPath || '').trim(),
    compactAcademicLabel: String(item?.compactAcademicLabel || '').trim(),
    academicPathways: Array.isArray(item?.academicPathways)
      ? item.academicPathways.map((pathway) => ({
          name: String(pathway?.name || '').trim(),
          slug: String(pathway?.slug || '').trim()
        })).filter((pathway) => pathway.name)
      : [],
    academicCoverage: {
      displayLabel: String(item?.academicCoverage?.displayLabel || '').trim(),
      branchCount: Math.max(0, Number(item?.academicCoverage?.branchCount) || 0)
    },
    presentationColorSource: ['classroom', 'module', 'event_kind'].includes(
      String(item?.presentationColorSource || '').trim()
    )
      ? String(item.presentationColorSource).trim()
      : 'event_kind',
    modulePresentation: {
      key: String(item?.modulePresentation?.key || '').trim(),
      title: String(item?.modulePresentation?.title || '').trim(),
      headerColor: normalizeCalendarHexColor(item?.modulePresentation?.headerColor),
      rowColor: normalizeCalendarHexColor(item?.modulePresentation?.rowColor)
    },
    colorKey: normalizeClassroomCardColor(item?.colorKey),
    status: String(item?.status || '').trim().toLowerCase(),
    nonDeliveryReason: String(item?.nonDeliveryReason || '').trim().toLowerCase(),
    startsAt: item?.startsAt || null,
    endsAt: item?.endsAt || null,
    calendarPresentation: {
      sourceKind: String(item?.calendarPresentation?.sourceKind || ''),
      isDateOnly: item?.calendarPresentation?.isDateOnly === true,
      effectiveDate: normalizeCalendarDate(item?.calendarPresentation?.effectiveDate),
      displayAnchor: item?.calendarPresentation?.displayAnchor || null,
      displayTimeZone: String(item?.calendarPresentation?.displayTimeZone || ''),
      placement: String(item?.calendarPresentation?.placement || ''),
      blocksAvailability: item?.calendarPresentation?.blocksAvailability === true
    },
    action
  }
}

function normalizeCalendarHexColor(value) {
  const color = String(value || '').trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(color) ? color : ''
}

function safeCalendarHref(value) {
  const href = String(value || '').trim()
  if (!href || /^(?:javascript|data|vbscript):/i.test(href)) return ''
  return href
}

function normalizeAvailabilityContext(item) {
  const courseId = String(item?.courseId || '').trim()
  const classroomId = String(item?.classroomId || '').trim()
  const tutorId = String(item?.tutor?.id || '').trim()
  if (!courseId || !classroomId || !tutorId) return null
  return {
    courseId,
    classroomId,
    courseTitle: String(item?.courseTitle || 'Course'),
    tutor: { id: tutorId, name: String(item?.tutor?.name || 'Tutor') },
    subject: String(item?.subject || 'Subject'),
    focus: String(item?.focus || ''),
    educationLevel: {
      name: String(item?.educationLevel?.name || ''),
      slug: String(item?.educationLevel?.slug || ''),
      code: String(item?.educationLevel?.code || '').trim().toUpperCase()
    },
    colorKey: normalizeClassroomCardColor(item?.colorKey)
  }
}

function normalizeCalendarDate(value) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const [year, month, day] = normalized.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? normalized
    : null
}

function normalizeCalendarAnchor(value) {
  const candidate = value instanceof Date ? new Date(value) : new Date(value)
  if (Number.isNaN(candidate.getTime())) return new Date()
  return new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), 12)
}

function formatCalendarDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeClassroomCardIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeFeatureStatus(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || fallback
}

function normalizeLessonRequestPurpose(value) {
  const key = String(value?.key || '').trim().toLowerCase()
  if (!['regular', 'extra', 'standalone'].includes(key)) return null
  return {
    key,
    status: normalizeFeatureStatus(value?.status, 'contract_only_phase_10')
  }
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : 0
}
