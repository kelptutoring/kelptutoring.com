const SESSION_KINDS = new Set(['curriculum_topic', 'review', 'exam', 'wrap_up'])
const SESSION_STATES = new Set(['scheduled', 'delivered', 'dropped', 'requeued'])
const REQUIREMENT_STATES = new Set(['required', 'optional', 'not_assigned'])
const DIFFICULTY_LEVELS = new Set(['easy', 'intermediate', 'difficult'])
const DEFAULT_MODULE_STYLE = Object.freeze({
  headerColor: '#5fae63',
  stripeColor: '#5fae63',
  templateName: 'Green'
})
const DEFAULT_PDF_STYLE = Object.freeze({
  ruleColor: '#4e9d68',
  textColor: '#17333a'
})

export function normalizeClassroomSchedulePayload(payload = {}, expectedCourseId = '') {
  const courseId = text(payload?.courseId)
  const activeScheduleVersionId = text(payload?.activeScheduleVersionId)
  if (!courseId || !activeScheduleVersionId || (expectedCourseId && courseId !== expectedCourseId)) {
    throw new TypeError('The Classroom Schedule payload is incomplete.')
  }

  const sourceItems = Array.isArray(payload?.items) ? payload.items : payload?.sessions
  const sessions = Array.isArray(sourceItems)
    ? inheritPresentationModules(omitMixedTrackLegacyScaffolds(
        sourceItems.map(normalizeScheduleSession)
      ))
    : []
  const trackProgress = normalizeTrackProgress(
    payload?.trackProgress,
    sessions,
    { preferSessions: true }
  )
  const courseProgress = normalizeCourseProgress(
    payload?.courseProgress || payload?.trackProgress,
    sessions,
    { preferSessions: true }
  )

  return Object.freeze({
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    courseId,
    activeScheduleVersionId,
    versionNumber: nonNegativeInteger(payload?.versionNumber, 0),
    name: text(payload?.name),
    timeZone: text(payload?.timeZone) || 'UTC',
    serviceModel: text(payload?.serviceModel),
    educationLevel: namedReference(payload?.educationLevel),
    coverage: normalizeScheduleCoverage(payload?.coverage),
    sessions: Object.freeze(sessions),
    trackProgress,
    courseProgress,
    pacingPolicy: normalizePacingPolicy(payload?.pacingPolicy),
    studentStudiedHold: normalizeStudentStudiedHold(
      payload?.studentStudiedHold
    ),
    moduleStyles: Object.freeze(normalizeModuleStyles(payload?.moduleStyles)),
    pdfStyle: classroomSchedulePdfStyle(payload?.pdfStyle),
    permissions: Object.freeze({
      canReadUnassignedResources: payload?.permissions?.canReadUnassignedResources === true,
      canReadSupersededSourceSnapshots: payload?.permissions?.canReadSupersededSourceSnapshots === true,
      actorRole: text(payload?.permissions?.actorRole),
      canMarkSession: payload?.permissions?.canMarkSession === true,
      canMarkResource: payload?.permissions?.canMarkResource === true,
      canReverseStudied: payload?.permissions?.canReverseStudied === true,
      canReverseOwnReviewedPracticed:
        payload?.permissions?.canReverseOwnReviewedPracticed === true,
      canCustomizeModuleStyle:
        payload?.permissions?.canCustomizeModuleStyle === true,
      canCustomizePdfStyle:
        payload?.permissions?.canCustomizePdfStyle === true
    }),
    featureStatus: Object.freeze({
      sessionResourceIdentity: status(payload?.featureStatus?.sessionResourceIdentity),
      progressLedger: status(payload?.featureStatus?.progressLedger),
      hierarchicalAggregation: status(payload?.featureStatus?.hierarchicalAggregation),
      effectiveSchedule: status(payload?.featureStatus?.effectiveSchedule),
      builderPublication: status(payload?.featureStatus?.builderPublication),
      academicSlots: status(payload?.featureStatus?.academicSlots),
      trackProgress: status(payload?.featureStatus?.trackProgress),
      studentStudiedClassHold:
        status(payload?.featureStatus?.studentStudiedClassHold),
      classroomHomeMultiCurriculum:
        status(payload?.featureStatus?.classroomHomeMultiCurriculum)
    })
  })
}

export function normalizeCanonicalClassroomSchedulePayload(
  payload = {},
  expectedCourseId = ''
) {
  const contractName = text(payload?.contract?.name)
  const contractVersion = nonNegativeInteger(payload?.contract?.version, 0)
  const courseId = text(payload?.course?.id)
  const academicTrack = payload?.academicTrack
  if (
    contractName !== 'course_schedule_read'
    || contractVersion !== 1
    || !courseId
    || (expectedCourseId && courseId !== expectedCourseId)
  ) {
    throw new TypeError('The canonical Classroom Schedule contract is incomplete.')
  }
  if (
    academicTrack?.layoutMode !== 'modules'
    || payload?.permissions?.canReadDetailedAcademicTrack !== true
  ) {
    throw new TypeError('A detailed Classroom Schedule is not available for this viewer.')
  }

  const schedule = normalizeClassroomSchedulePayload({
    schemaVersion: payload?.schemaVersion,
    courseId,
    activeScheduleVersionId:
      academicTrack?.activeScheduleVersionId || payload?.schedule?.activeVersionId,
    versionNumber: academicTrack?.versionNumber ?? payload?.schedule?.versionNumber,
    name: payload?.schedule?.name,
    timeZone: payload?.schedule?.timeZone,
    serviceModel:
      payload?.context?.provider?.serviceModel || payload?.course?.serviceModel,
    educationLevel:
      academicTrack?.educationLevel || payload?.context?.academicContext?.educationLevel,
    coverage:
      academicTrack?.coverage || payload?.context?.academicContext?.coverage,
    items: academicTrack?.items,
    trackProgress: academicTrack?.trackProgress,
    courseProgress: academicTrack?.courseProgress,
    pacingPolicy:
      academicTrack?.pacingPolicy || payload?.schedule?.pacingPolicy,
    studentStudiedHold: academicTrack?.studentStudiedHold,
    moduleStyles: academicTrack?.moduleStyles,
    pdfStyle: academicTrack?.pdfStyle,
    permissions: {
      ...(payload?.permissions || {}),
      actorRole: payload?.viewer?.actorRole
    },
    featureStatus: payload?.featureStatus
  }, expectedCourseId)

  return Object.freeze({
    ...schedule,
    readContract: Object.freeze({
      name: contractName,
      phase: text(payload?.contract?.phase),
      version: contractVersion,
      asOf: text(payload?.contract?.asOf)
    }),
    timeline: Object.freeze({
      past: freezeTimelineRows(payload?.groups?.past),
      next: freezeTimelineRows(payload?.groups?.next),
      upcoming: freezeTimelineRows(payload?.groups?.upcoming)
    }),
    classroomHome: normalizeClassroomHome(
      payload?.classroomHome,
      schedule.coverage,
      schedule.courseProgress
    ),
    calendarPolicy: Object.freeze({ ...(payload?.calendarPolicy || {}) }),
    meetingStatePolicy: Object.freeze({ ...(payload?.meetingStatePolicy || {}) })
  })
}

export function deriveClassroomTrackProgress(sessions = []) {
  const eligible = sessions.filter((session) => session?.kind === 'curriculum_topic')
  const studiedCount = eligible.filter(
    (session) => sessionProgressIsMarked(session, 'studied')
  ).length
  const reviewedCount = eligible.filter(
    (session) => sessionProgressIsMarked(session, 'reviewed')
  ).length
  const practicedCount = eligible.filter(
    (session) => sessionProgressIsMarked(session, 'practiced')
  ).length
  const completedUnitCount = studiedCount + practicedCount
  const totalUnitCount = eligible.length * 2
  return Object.freeze({
    eligibleSessionCount: eligible.length,
    studiedCount,
    reviewedCount,
    practicedCount,
    completedUnitCount,
    totalUnitCount,
    percent: totalUnitCount
      ? Math.round((completedUnitCount * 100) / totalUnitCount)
      : 0,
    reviewedAffectsPercent: false
  })
}

export function createClassroomScheduleSnapshot(payload = {}, {
  generatedAt = new Date().toISOString()
} = {}) {
  const schedule = normalizeClassroomSchedulePayload(payload, text(payload?.courseId))
  const normalizedGeneratedAt = isoTimestamp(generatedAt)

  return Object.freeze({
    schemaVersion: 1,
    snapshotId: [
      'KELP-SCHEDULE',
      `V${schedule.versionNumber}`,
      schedule.activeScheduleVersionId.toUpperCase()
    ].join('-'),
    generatedAt: normalizedGeneratedAt,
    courseId: schedule.courseId,
    activeScheduleVersionId: schedule.activeScheduleVersionId,
    versionNumber: schedule.versionNumber,
    name: schedule.name,
    timeZone: schedule.timeZone,
    serviceModel: schedule.serviceModel,
    educationLevel: schedule.educationLevel,
    coverage: schedule.coverage,
    sessions: schedule.sessions,
    moduleStyles: schedule.moduleStyles,
    pdfStyle: schedule.pdfStyle
  })
}

export function classroomScheduleAcademicPath(session = {}) {
  const branch = session?.academicBranch
  if (!branch || Array.isArray(branch) || typeof branch !== 'object') return ''
  const explicitLabel = text(branch?.displayLabel)
  if (explicitLabel) return explicitLabel

  const pathwayNames = Array.isArray(branch?.academicPathways)
    ? branch.academicPathways.map((pathway) => text(pathway?.name)).filter(Boolean)
    : []
  return [
    text(branch?.educationLevel?.name),
    pathwayNames.join(' + '),
    text(branch?.subject?.name),
    text(branch?.track?.name)
  ].filter(Boolean).join(' \u00b7 ')
}

export function classroomScheduleCoverageMetadata(coverage = {}, fallback = {}) {
  const branches = Array.isArray(coverage?.branches) ? coverage.branches : []
  const educationLevels = uniqueNamedValues(branches, 'educationLevel')
  const subjects = uniqueNamedValues(branches, 'subject')
  const tracks = uniqueNamedValues(branches, 'track')
  const fallbackCoverage = [
    text(fallback?.subject),
    text(fallback?.track)
  ].filter(Boolean).join(' \u00b7 ')

  return Object.freeze({
    educationLevel: educationLevels.join(' + ') || text(fallback?.educationLevel),
    subject: subjects.join(' + ') || text(fallback?.subject),
    coverage: text(coverage?.displayLabel) || fallbackCoverage || 'Course-wide',
    trackCount: tracks.length
  })
}

function normalizeScheduleSession(session = {}, index) {
  const scheduleItemId = text(session?.scheduleItemId)
  const title = text(session?.title)
  if (!scheduleItemId || !title) {
    throw new TypeError(`Classroom Schedule session ${index + 1} is incomplete.`)
  }

  const kind = enumValue(session?.kind, SESSION_KINDS, 'curriculum_topic')
  const state = enumValue(session?.state, SESSION_STATES, 'scheduled')
  const difficultyLevel = enumValue(session?.difficultyLevel, DIFFICULTY_LEVELS, '')
  const resources = Array.isArray(session?.resources)
    ? session.resources.map(normalizeScheduleResource)
    : []

  return Object.freeze({
    scheduleItemId,
    stableItemKey: text(session?.stableItemKey),
    title,
    kind,
    state,
    scheduledDate: dateText(session?.effectiveDate || session?.scheduledDate),
    plannedDate: dateText(session?.plannedDate || session?.scheduledDate),
    endDate: dateText(session?.endDate),
    position: nonNegativeInteger(session?.effectivePosition ?? session?.position, index),
    plannedPosition: nonNegativeInteger(session?.plannedPosition ?? session?.position, index),
    sequenceState: enumValue(
      session?.sequenceState,
      new Set(['studied', 'next', 'upcoming']),
      'upcoming'
    ),
    effectiveTimestamp: text(session?.effectiveTimestamp),
    difficultyLevel,
    planningHref: safeHref(session?.planningHref || session?.source?.planningHref),
    moduleKey: text(
      session?.moduleKey
      || session?.source?.moduleKey
      || session?.presentation?.moduleKey
    ),
    moduleTitle: text(
      session?.moduleTitle
      || session?.source?.moduleTitle
      || session?.presentation?.moduleTitle
    ) || '',
    modulePresentationKey: text(session?.presentation?.modulePresentationKey),
    academicScope: session?.academicScope === 'branch' ? 'branch' : 'course',
    academicBranch: normalizeAcademicBranch(session?.academicBranch),
    presentation: Object.freeze({
      branchKey: text(session?.presentation?.branchKey),
      branchLabel: text(session?.presentation?.branchLabel),
      moduleKey: text(session?.presentation?.moduleKey),
      moduleTitle: text(session?.presentation?.moduleTitle),
      modulePresentationKey: text(session?.presentation?.modulePresentationKey)
    }),
    progress: Object.freeze(normalizeSessionProgress(session?.progress)),
    resourceSummary: Object.freeze({
      assignedCount: nonNegativeInteger(session?.resourceSummary?.assignedCount, resources.length),
      requiredCount: nonNegativeInteger(session?.resourceSummary?.requiredCount, 0),
      studiedCount: nonNegativeInteger(session?.resourceSummary?.studiedCount, 0)
    }),
    resources: Object.freeze(resources)
  })
}

function uniqueNamedValues(branches, key) {
  return [...new Set(branches
    .map((branch) => text(branch?.[key]?.name))
    .filter(Boolean))]
}

function inheritPresentationModules(sessions) {
  const nextModuleByIndex = new Map()
  let nextModule = null
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    if (sessions[index].moduleKey) nextModule = sessions[index]
    nextModuleByIndex.set(index, nextModule)
  }

  let previousModule = null
  return sessions.map((session, index) => {
    if (session.moduleKey) {
      previousModule = session
      return session
    }
    const inherited = previousModule || nextModuleByIndex.get(index)
    return Object.freeze({
      ...session,
      moduleKey: inherited?.moduleKey || 'course-plan',
      moduleTitle: inherited?.moduleTitle || 'Course plan'
    })
  })
}

function omitMixedTrackLegacyScaffolds(sessions) {
  const hasTrackBackedCurriculum = sessions.some((session) =>
    session.kind === 'curriculum_topic'
      && session.moduleKey
      && session.moduleKey !== 'course-plan'
  )
  if (!hasTrackBackedCurriculum) return sessions
  return sessions.filter((session) =>
    session.kind !== 'curriculum_topic'
      || (session.moduleKey && session.moduleKey !== 'course-plan')
  )
}

export function groupClassroomScheduleSessions(sessions = [], moduleTitleByKey = new Map()) {
  const groups = []
  const segmentCounts = new Map()
  const moduleNumbers = new Map()
  let nextModuleNumber = 1
  const branchKeys = new Set(sessions
    .map((session) => text(
      session?.presentation?.branchKey || session?.academicBranch?.branchKey
    ))
    .filter(Boolean))
  const showTrackScope = branchKeys.size > 1

  sessions.forEach((session) => {
    const moduleKey = text(session?.moduleKey) || 'course-plan'
    const modulePresentationKey = text(session?.modulePresentationKey)
      || text(session?.presentation?.modulePresentationKey)
      || moduleKey
    const title = text(session?.moduleTitle)
      || text(moduleTitleByKey?.get?.(moduleKey))
      || 'Course plan'
    if (!moduleNumbers.has(modulePresentationKey)) {
      moduleNumbers.set(modulePresentationKey, nextModuleNumber)
      nextModuleNumber += 1
    }
    const moduleNumber = moduleNumbers.get(modulePresentationKey)
    const displayTitle = moduleDisplayTitle(title, moduleNumber)
    const trackName = text(session?.academicBranch?.track?.name)
    const scopedTitle = showTrackScope && trackName
      ? `${trackName} · ${displayTitle}`
      : displayTitle
    const latest = groups.at(-1)
    if (!latest || latest.modulePresentationKey !== modulePresentationKey) {
      const segmentIndex = (segmentCounts.get(modulePresentationKey) || 0) + 1
      segmentCounts.set(modulePresentationKey, segmentIndex)
      groups.push({
        moduleKey,
        modulePresentationKey,
        moduleNumber,
        moduleTitle: segmentIndex > 1
          ? `${scopedTitle} — continued`
          : scopedTitle,
        sourceModuleTitle: displayTitle,
        trackName,
        segmentIndex,
        isContinuation: segmentIndex > 1,
        sessions: [session]
      })
      return
    }
    latest.sessions.push(session)
  })

  return Object.freeze(groups.map((group) => Object.freeze({
    ...group,
    sessions: Object.freeze(group.sessions)
  })))
}

export function classroomScheduleModuleStyle(moduleStyles = {}, moduleKey = '') {
  const candidate = moduleStyles?.[text(moduleKey)] || {}
  return Object.freeze({
    headerColor: hexColor(candidate?.headerColor) || DEFAULT_MODULE_STYLE.headerColor,
    stripeColor: hexColor(candidate?.stripeColor) || DEFAULT_MODULE_STYLE.stripeColor,
    templateName: text(candidate?.templateName) || DEFAULT_MODULE_STYLE.templateName
  })
}

function normalizeClassroomHome(value, coverage, courseProgress) {
  const source = value && !Array.isArray(value) && typeof value === 'object'
    ? value
    : {}
  return Object.freeze({
    schemaVersion: nonNegativeInteger(source?.schemaVersion, 0),
    label: text(source?.label) || 'Classroom Home',
    timeZone: text(source?.timeZone) || 'UTC',
    coverage: Object.freeze({
      displayLabel:
        text(source?.coverage?.displayLabel) || coverage?.displayLabel || '',
      branchCount: nonNegativeInteger(
        source?.coverage?.branchCount,
        coverage?.branchCount || 0
      ),
      branches: Object.freeze(
        Array.isArray(source?.coverage?.branches)
          ? source.coverage.branches.map(normalizeAcademicBranch).filter(Boolean)
          : coverage?.branches || []
      )
    }),
    courseProgress: normalizeCourseProgress(
      courseProgress || source?.courseProgress,
      []
    ),
    thisWeek: normalizeClassroomHomeWindow(source?.thisWeek),
    comingNext: normalizeClassroomHomeWindow(source?.comingNext),
    historyPolicy: Object.freeze({
      activeVersionOnly: source?.historyPolicy?.activeVersionOnly === true,
      ordinaryAdjustmentsRetainContinuingProgress:
        source?.historyPolicy?.ordinaryAdjustmentsRetainContinuingProgress === true,
      fullReplacementProgressLocation:
        text(source?.historyPolicy?.fullReplacementProgressLocation),
      assignmentsMoveIndependently:
        source?.historyPolicy?.assignmentsMoveIndependently === true
    })
  })
}

function normalizeClassroomHomeWindow(value) {
  return Object.freeze({
    startsOn: dateText(value?.startsOn),
    endsOn: dateText(value?.endsOn),
    items: Object.freeze(
      Array.isArray(value?.items)
        ? value.items.map(normalizeClassroomHomeItem).filter(Boolean)
        : []
    )
  })
}

function normalizeClassroomHomeItem(value) {
  const id = text(value?.id)
  const title = text(value?.title)
  const date = dateText(value?.date)
  if (!id || !title || !date) return null
  const actionType = text(value?.action?.type)
  return Object.freeze({
    id,
    kind: text(value?.kind),
    date,
    dateLabel: text(value?.dateLabel),
    title,
    status: text(value?.status),
    academicPath: text(value?.academicPath),
    moduleTitle: text(value?.moduleTitle),
    modulePresentationKey: text(value?.modulePresentationKey),
    detail: text(value?.detail),
    progress: Object.freeze(normalizeSessionProgress(value?.progress)),
    action: Object.freeze({
      type: new Set([
        'open_track_session',
        'open_practice',
        'open_schedule'
      ]).has(actionType) ? actionType : 'open_schedule',
      href: safeHref(value?.action?.href),
      assignmentId: text(value?.action?.assignmentId)
    })
  })
}

export function classroomSchedulePdfStyle(value = {}) {
  return Object.freeze({
    ruleColor: hexColor(value?.ruleColor) || DEFAULT_PDF_STYLE.ruleColor,
    textColor: hexColor(value?.textColor) || DEFAULT_PDF_STYLE.textColor
  })
}

function normalizeScheduleResource(resource = {}, index) {
  const id = text(resource?.id)
  const title = text(resource?.title)
  if (!id || !title) {
    throw new TypeError(`Classroom Schedule resource ${index + 1} is incomplete.`)
  }

  return Object.freeze({
    id,
    stableResourceKey: text(resource?.stableResourceKey),
    providerKey: text(resource?.providerKey),
    title,
    resourceKind: text(resource?.resourceKind) || 'reference',
    href: safeHref(resource?.href),
    requirementState: enumValue(resource?.requirementState, REQUIREMENT_STATES, 'optional'),
    position: nonNegativeInteger(resource?.position, index),
    progress: Object.freeze(normalizeResourceProgress(resource?.progress))
  })
}

function normalizeSessionProgress(progress = {}) {
  return {
    studied: normalizeProgressMark(progress?.studied),
    reviewed: normalizeProgressMark(progress?.reviewed),
    practiced: normalizeProgressMark(progress?.practiced)
  }
}

function normalizeResourceProgress(progress = {}) {
  return {
    studied: normalizeProgressMark(progress?.studied),
    reviewed: normalizeProgressMark(progress?.reviewed),
    practiced: normalizeProgressMark(progress?.practiced)
  }
}

function normalizeProgressMark(mark = {}) {
  return Object.freeze({
    state: mark?.state === 'marked' || mark?.marked === true ? 'marked' : 'unmarked',
    source: text(mark?.source) || 'none',
    effectiveAt: text(mark?.effectiveAt),
    latestEventId: text(
      mark?.latestEventId
      || mark?.transitionEventId
      || mark?.directTransitionEventId
    ),
    transitionEventId: text(mark?.transitionEventId)
  })
}

function namedReference(value = {}) {
  return Object.freeze({
    id: text(value?.id || value?.nodeId || value?.key),
    name: text(value?.name),
    slug: text(value?.slug)
  })
}

function normalizeAcademicBranch(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null
  const branchKey = text(value?.branchKey)
  const track = namedReference(value?.track)
  if (!branchKey || !track.id || !track.name) return null
  return Object.freeze({
    branchKey,
    role: value?.role === 'primary' ? 'primary' : 'supporting',
    displayLabel: text(value?.displayLabel),
    educationLevel: namedReference(value?.educationLevel),
    academicPathways: Object.freeze(
      Array.isArray(value?.academicPathways)
        ? value.academicPathways.map(namedReference)
        : []
    ),
    subject: namedReference(value?.subject),
    track
  })
}

function normalizeScheduleCoverage(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return Object.freeze({
      schemaVersion: 0,
      versionId: '',
      primaryTrackKey: '',
      displayLabel: '',
      branchCount: 0,
      branches: Object.freeze([])
    })
  }
  const branches = Array.isArray(value?.branches)
    ? value.branches.map(normalizeAcademicBranch).filter(Boolean)
    : []
  return Object.freeze({
    schemaVersion: nonNegativeInteger(value?.schemaVersion, 0),
    versionId: text(value?.versionId),
    primaryTrackKey: text(value?.primaryTrackKey),
    displayLabel: text(value?.displayLabel),
    branchCount: nonNegativeInteger(value?.branchCount, branches.length),
    branches: Object.freeze(branches)
  })
}

function normalizeCourseProgress(value, sessions, { preferSessions = false } = {}) {
  const overall = normalizeTrackProgress(value, sessions, { preferSessions })
  const derivedByTrack = deriveClassroomCourseProgressByTrack(sessions)
  const byTrack = preferSessions
    ? derivedByTrack
    : Array.isArray(value?.byTrack)
    ? value.byTrack.map((entry) => Object.freeze({
        branchKey: text(entry?.branchKey),
        role: entry?.role === 'primary' ? 'primary' : 'supporting',
        displayLabel: text(entry?.displayLabel),
        educationLevel: namedReference(entry?.educationLevel),
        academicPathways: Object.freeze(
          Array.isArray(entry?.academicPathways)
            ? entry.academicPathways.map(namedReference)
            : []
        ),
        subject: namedReference(entry?.subject),
        track: namedReference(entry?.track),
        eligibleSessionCount: nonNegativeInteger(entry?.eligibleSessionCount, 0),
        studiedCount: nonNegativeInteger(entry?.studiedCount, 0),
        reviewedCount: nonNegativeInteger(entry?.reviewedCount, 0),
        practicedCount: nonNegativeInteger(entry?.practicedCount, 0),
        completedUnitCount: nonNegativeInteger(entry?.completedUnitCount, 0),
        totalUnitCount: nonNegativeInteger(entry?.totalUnitCount, 0),
        percent: Math.min(100, nonNegativeInteger(entry?.percent, 0))
      }))
    : []
  return Object.freeze({
    ...overall,
    label: text(value?.label) || 'Course progress',
    scope: text(value?.scope) || 'active_schedule_version',
    byTrack: Object.freeze(byTrack)
  })
}

function normalizeModuleStyles(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value)
    .slice(0, 600)
    .map(([moduleKey, style]) => {
      const key = text(moduleKey).slice(0, 240)
      if (!key) return null
      return [key, {
        headerColor: hexColor(style?.headerColor) || DEFAULT_MODULE_STYLE.headerColor,
        stripeColor: hexColor(style?.stripeColor) || DEFAULT_MODULE_STYLE.stripeColor,
        templateName: text(style?.templateName).slice(0, 80) || DEFAULT_MODULE_STYLE.templateName
      }]
    })
    .filter(Boolean))
}

function normalizePacingPolicy(value) {
  const mode = text(value?.mode).toLowerCase() === 'static'
    ? 'static'
    : 'adaptive'
  return Object.freeze({
    mode,
    eventKind: text(value?.eventKind) || 'implicit_default',
    revisionNumber: nonNegativeInteger(value?.revisionNumber, 0),
    lockWindowHours: nonNegativeInteger(value?.lockWindowHours, 6)
  })
}

function normalizeStudentStudiedHold(value) {
  const active = value?.active === true
  return Object.freeze({
    active,
    academicSlotId: text(value?.academicSlotId),
    startsAt: text(value?.startsAt),
    localDate: dateText(value?.localDate),
    localStartTime: text(value?.localStartTime),
    durationMinutes: nonNegativeInteger(value?.durationMinutes, 0),
    timeZone: text(value?.timeZone),
    lockWindowHours: nonNegativeInteger(value?.lockWindowHours, 6),
    message: active
      ? text(value?.message)
        || 'Your next class begins within six hours, so its lesson plan is locked. You can mark this topic as Studied after the class.'
      : ''
  })
}

function normalizeTrackProgress(value, sessions, { preferSessions = false } = {}) {
  const fallback = deriveClassroomTrackProgress(sessions)
  if (preferSessions) return fallback
  if (!value || Array.isArray(value) || typeof value !== 'object') return fallback
  const eligibleSessionCount = nonNegativeInteger(
    value.eligibleSessionCount,
    fallback.eligibleSessionCount
  )
  const totalUnitCount = eligibleSessionCount * 2
  const studiedCount = Math.min(
    eligibleSessionCount,
    nonNegativeInteger(value.studiedCount, fallback.studiedCount)
  )
  const reviewedCount = Math.min(
    eligibleSessionCount,
    nonNegativeInteger(value.reviewedCount, fallback.reviewedCount)
  )
  const practicedCount = Math.min(
    eligibleSessionCount,
    nonNegativeInteger(value.practicedCount, fallback.practicedCount)
  )
  const completedUnitCount = studiedCount + practicedCount
  return Object.freeze({
    eligibleSessionCount,
    studiedCount,
    reviewedCount,
    practicedCount,
    completedUnitCount,
    totalUnitCount,
    percent: totalUnitCount
      ? Math.round((completedUnitCount * 100) / totalUnitCount)
      : 0,
    reviewedAffectsPercent: false
  })
}

function deriveClassroomCourseProgressByTrack(sessions = []) {
  const tracks = new Map()
  sessions.forEach((session) => {
    if (session?.kind !== 'curriculum_topic' || session?.academicScope !== 'branch') return
    const branch = session.academicBranch
    if (!branch?.branchKey || !branch?.track?.name) return
    if (!tracks.has(branch.branchKey)) {
      tracks.set(branch.branchKey, {
        branchKey: branch.branchKey,
        role: branch.role,
        displayLabel: branch.displayLabel,
        educationLevel: branch.educationLevel,
        academicPathways: branch.academicPathways,
        subject: branch.subject,
        track: branch.track,
        eligibleSessionCount: 0,
        studiedCount: 0,
        reviewedCount: 0,
        practicedCount: 0
      })
    }
    const progress = tracks.get(branch.branchKey)
    progress.eligibleSessionCount += 1
    if (sessionProgressIsMarked(session, 'studied')) progress.studiedCount += 1
    if (sessionProgressIsMarked(session, 'reviewed')) progress.reviewedCount += 1
    if (sessionProgressIsMarked(session, 'practiced')) progress.practicedCount += 1
  })
  return Array.from(tracks.values(), (track) => {
    const completedUnitCount = track.studiedCount + track.practicedCount
    const totalUnitCount = track.eligibleSessionCount * 2
    return Object.freeze({
      ...track,
      completedUnitCount,
      totalUnitCount,
      percent: totalUnitCount
        ? Math.round((completedUnitCount * 100) / totalUnitCount)
        : 0
    })
  })
}

function sessionProgressIsMarked(session, kind) {
  return session?.progress?.[kind]?.state === 'marked'
    || (kind === 'studied' && session?.sequenceState === 'studied')
}

function freezeTimelineRows(value) {
  if (!Array.isArray(value)) return Object.freeze([])
  return Object.freeze(value.map((row) => Object.freeze({ ...(row || {}) })))
}

function moduleDisplayTitle(value, moduleNumber = 0) {
  const title = text(value) || 'Course plan'
  if (!moduleNumber || /^Module\s+\d+\b/i.test(title)) return title
  return `Module ${moduleNumber}: ${title}`
}

function hexColor(value) {
  const normalized = text(value).toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : ''
}

function text(value) {
  return String(value || '').trim()
}

function status(value) {
  return text(value).toLowerCase() || 'planned'
}

function enumValue(value, allowed, fallback) {
  const normalized = text(value).toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function dateText(value) {
  const normalized = text(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function isoTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('The Schedule snapshot timestamp is invalid.')
  }
  return date.toISOString()
}

function safeHref(value) {
  const href = text(value)
  if (!href) return ''
  if (/^(?:https?:\/\/|\.{0,2}\/|\/)/i.test(href)) return href
  return ''
}
