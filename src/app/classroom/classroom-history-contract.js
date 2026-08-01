function text(value, maximum = 320) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, maximum) : ''
}

function integer(value) {
  const normalized = Number(value)
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0
}

function timestamp(value) {
  const normalized = text(value, 80)
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : null
}

function date(value) {
  const normalized = text(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

export function createClassroomHistorySessionIndex(catalog) {
  const sessions = new Map()
  for (const level of catalog?.levels || []) {
    for (const subject of level.subjects || []) {
      for (const track of subject.tracks || []) {
        for (const module of track.modules || []) {
          for (const session of module.sessions || []) {
            for (const key of [
              session.id,
              session.sourceSessionId,
              session.sourceSessionKey
            ]) {
              const normalized = text(key)
              if (!normalized || sessions.has(normalized)) continue
              sessions.set(normalized, Object.freeze({
                planningHref: text(session?.planningHref, 1200) || null,
                subjectTitle: text(subject?.title || subject?.name, 180) || null,
                trackTitle: text(track?.title || track?.name, 180) || null,
                moduleTitle: text(module?.title || module?.name, 240) || null
              }))
            }
          }
        }
      }
    }
  }
  return sessions
}

export function createClassroomHistorySessionKeySet(catalog) {
  return new Set(createClassroomHistorySessionIndex(catalog).keys())
}

function normalizeProgress(value) {
  return Object.freeze({
    studied: value?.studied === true,
    reviewed: value?.reviewed === true,
    practiced: value?.practiced === true
  })
}

function normalizeHistoryResource(value) {
  const stableResourceKey = text(value?.stableResourceKey, 240)
  const title = text(value?.title, 240)
  if (!stableResourceKey || !title) return null
  return Object.freeze({
    stableResourceKey,
    title,
    requirementState: text(value?.requirementState, 40) || 'optional',
    position: integer(value?.position),
    progress: normalizeProgress(value?.progress)
  })
}

function normalizeHistoryItem(value, sessionIndex) {
  const stableItemKey = text(value?.stableItemKey)
  const sourceSessionKey = text(value?.sourceSessionKey)
  const title = text(value?.title, 240)
  const progress = normalizeProgress(value?.progress)
  const source = sessionIndex.get(sourceSessionKey)
  if (
    !stableItemKey
    || !sourceSessionKey
    || !title
    || (!progress.studied && !progress.practiced)
  ) {
    return null
  }
  return Object.freeze({
    stableItemKey,
    title,
    scheduledDate: date(value?.scheduledDate),
    firstWorkedAt: timestamp(value?.firstWorkedAt),
    lastWorkedAt: timestamp(value?.lastWorkedAt),
    sourceSessionKey,
    sourceAvailable: Boolean(source),
    planningHref: source?.planningHref || null,
    sourceSubjectTitle: source?.subjectTitle || null,
    sourceTrackTitle: source?.trackTitle || null,
    sourceTrackKey: text(value?.sourceTrackKey) || null,
    sourceTrackSlug: text(value?.sourceTrackSlug) || null,
    sourceModuleKey: text(value?.sourceModuleKey) || null,
    sourceModuleTitle:
      text(value?.sourceModuleTitle, 240) || source?.moduleTitle || null,
    progress,
    resources: Object.freeze(
      (Array.isArray(value?.resources) ? value.resources : [])
        .map(normalizeHistoryResource)
        .filter(Boolean)
    )
  })
}

function normalizeHistoryVersion(
  value,
  sessionIndex,
  seenSessionKeys
) {
  const scheduleVersionId = text(value?.scheduleVersionId)
  const versionNumber = integer(value?.versionNumber)
  const name = text(value?.name, 180)
  const items = (Array.isArray(value?.items) ? value.items : [])
    .map((item) => normalizeHistoryItem(item, sessionIndex))
    .filter((item) => {
      if (!item || seenSessionKeys.has(item.sourceSessionKey)) return false
      seenSessionKeys.add(item.sourceSessionKey)
      return true
    })
  if (!scheduleVersionId || !versionNumber || !name || !items.length) return null
  return Object.freeze({
    scheduleVersionId,
    versionNumber,
    name,
    timeZone: text(value?.timeZone, 100) || 'UTC',
    createdAt: timestamp(value?.createdAt),
    coverageLabel: text(value?.coverageLabel, 500) || null,
    lastWorkedAt: timestamp(value?.lastWorkedAt),
    workedSessionCount: items.length,
    studiedCount: items.filter((item) => item.progress.studied).length,
    reviewedCount: items.filter((item) => item.progress.reviewed).length,
    practicedCount: items.filter((item) => item.progress.practiced).length,
    items: Object.freeze(items)
  })
}

export function normalizeClassroomLearningHistoryPayload(
  payload,
  expectedCourseId,
  catalog
) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('The Course learning history payload is unavailable.')
  }
  const courseId = text(payload.courseId)
  if (!courseId || (expectedCourseId && courseId !== expectedCourseId)) {
    throw new TypeError('The Course learning history does not match this Classroom.')
  }
  const sessionIndex = createClassroomHistorySessionIndex(catalog)
  if (!sessionIndex.size) {
    throw new TypeError('The governed Session catalog is unavailable.')
  }
  const seenSessionKeys = new Set()
  const versions = (Array.isArray(payload.versions) ? payload.versions : [])
    .map((version) => normalizeHistoryVersion(
      version,
      sessionIndex,
      seenSessionKeys
    ))
    .filter(Boolean)
  const items = versions.flatMap((version) => version.items)
  return Object.freeze({
    schemaVersion: integer(payload.schemaVersion) || 1,
    courseId,
    activeScheduleVersionId: text(payload.activeScheduleVersionId) || null,
    permissions: Object.freeze({
      actorRole: text(payload.permissions?.actorRole) || null,
      canReadLearningHistory:
        payload.permissions?.canReadLearningHistory === true
    }),
    summary: Object.freeze({
      workedSessionCount: items.length,
      studiedCount: items.filter((item) => item.progress.studied).length,
      reviewedCount: items.filter((item) => item.progress.reviewed).length,
      practicedCount: items.filter((item) => item.progress.practiced).length,
      scheduleVersionCount: versions.length
    }),
    versions: Object.freeze(versions),
    historyPolicy: Object.freeze({
      activeScheduleProgressExcluded: true,
      droppedItemsExcluded: true,
      unavailableSourcesExcluded: false,
      unavailableSourcesRetained: true
    })
  })
}

function normalizeAuditItem(value) {
  const stableItemKey = text(value?.stableItemKey)
  const title = text(value?.title, 320)
  if (!stableItemKey || !title) return null
  const state = text(value?.state, 40).toLowerCase()
  return Object.freeze({
    stableItemKey,
    title,
    kind: text(value?.kind, 60) || 'curriculum_topic',
    state: ['scheduled', 'requeued', 'dropped'].includes(state)
      ? state
      : 'scheduled',
    scheduledDate: date(value?.scheduledDate),
    endDate: date(value?.endDate),
    position: integer(value?.position),
    sourceSessionKey: text(value?.sourceSessionKey) || null,
    sourceTrackKey: text(value?.sourceTrackKey) || null,
    sourceModuleKey: text(value?.sourceModuleKey) || null,
    sourceModuleTitle: text(value?.sourceModuleTitle, 240) || null
  })
}

function normalizeAuditChange(value) {
  const stableItemKey = text(value?.stableItemKey)
  const changeType = text(value?.changeType, 40).toLowerCase()
  if (
    !stableItemKey
    || !['included', 'dropped', 'restored', 'reordered'].includes(changeType)
  ) {
    return null
  }
  return Object.freeze({
    stableItemKey,
    changeType,
    reasonCode: text(value?.reasonCode, 80) || null,
    reasonLabel: text(value?.reasonLabel, 160) || 'Schedule change',
    studentExplanation: text(value?.studentExplanation, 500),
    privateStaffNote: text(value?.privateStaffNote, 2000) || null,
    actorUserId: text(value?.actorUserId) || null,
    actorName: text(value?.actorName, 240) || 'Staff member',
    createdAt: timestamp(value?.createdAt),
    publicationBoundary: value?.publicationBoundary === true
  })
}

function normalizeAuditVersion(value) {
  const scheduleVersionId = text(value?.scheduleVersionId)
  const versionNumber = integer(value?.versionNumber)
  const name = text(value?.name, 240)
  if (!scheduleVersionId || !versionNumber || !name) return null
  const status = text(value?.status, 40).toLowerCase()
  const items = (Array.isArray(value?.items) ? value.items : [])
    .map(normalizeAuditItem)
    .filter(Boolean)
  const changes = (Array.isArray(value?.changes) ? value.changes : [])
    .map(normalizeAuditChange)
    .filter(Boolean)
  return Object.freeze({
    scheduleVersionId,
    versionNumber,
    previousVersionId: text(value?.previousVersionId) || null,
    name,
    timeZone: text(value?.timeZone, 100) || 'UTC',
    status: status === 'active' ? 'active' : 'superseded',
    createdAt: timestamp(value?.createdAt),
    createdBy: text(value?.createdBy) || null,
    coverageLabel: text(value?.coverageLabel, 500) || null,
    reason: text(value?.reason, 500) || null,
    itemCount: items.length,
    effectiveItemCount: items.filter((item) =>
      ['scheduled', 'requeued'].includes(item.state)
    ).length,
    droppedItemCount: items.filter((item) => item.state === 'dropped').length,
    changeCount: changes.length,
    items: Object.freeze(items),
    changes: Object.freeze(changes)
  })
}

export function normalizeClassroomScheduleAuditPayload(
  payload,
  expectedCourseId
) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('The Course Schedule audit payload is unavailable.')
  }
  const courseId = text(payload.courseId)
  if (!courseId || (expectedCourseId && courseId !== expectedCourseId)) {
    throw new TypeError('The Course Schedule audit does not match this Classroom.')
  }
  if (payload.permissions?.canReadScheduleAudit !== true) {
    throw new TypeError('Schedule audit access was not granted.')
  }
  const versions = (Array.isArray(payload.versions) ? payload.versions : [])
    .map(normalizeAuditVersion)
    .filter(Boolean)
  return Object.freeze({
    schemaVersion: integer(payload.schemaVersion) || 1,
    courseId,
    activeScheduleVersionId: text(payload.activeScheduleVersionId) || null,
    course: Object.freeze({
      title: text(payload.course?.title, 240) || 'Course',
      status: text(payload.course?.status, 40) || null,
      studentName: text(payload.course?.studentName, 240) || 'Student',
      tutorName: text(payload.course?.tutorName, 240) || 'Tutor'
    }),
    permissions: Object.freeze({
      actorRole: text(payload.permissions?.actorRole, 80) || 'staff',
      canReadScheduleAudit: true,
      canReadPrivateStaffNotes:
        payload.permissions?.canReadPrivateStaffNotes === true,
      canPrintScheduleAudit:
        payload.permissions?.canPrintScheduleAudit === true
    }),
    summary: Object.freeze({
      versionCount: versions.length,
      changeCount: versions.reduce(
        (total, version) => total + version.changes.length,
        0
      )
    }),
    versions: Object.freeze(versions),
    auditPolicy: Object.freeze({
      appendOnlyVersionHistory: true,
      privateStaffNotesIncluded:
        payload.permissions?.canReadPrivateStaffNotes === true,
      studentAccess: false,
      printable: payload.permissions?.canPrintScheduleAudit === true
    })
  })
}

function normalizeCurrentScheduleLogEntry(value) {
  const entryId = text(value?.entryId, 180)
  const entryKind = text(value?.entryKind, 40).toLowerCase()
  const action = text(value?.action, 80).toLowerCase()
  const title = text(value?.title, 320)
  const recordedAt = timestamp(value?.recordedAt)
  if (
    !entryId
    || !['progress', 'structure', 'pacing'].includes(entryKind)
    || !action
    || !title
    || !recordedAt
  ) {
    return null
  }
  const progressKind = text(value?.progressKind, 40).toLowerCase()
  const pacingMode = text(value?.pacingMode, 40).toLowerCase()
  return Object.freeze({
    entryId,
    entryKind,
    action,
    progressKind: ['studied', 'reviewed', 'practiced'].includes(progressKind)
      ? progressKind
      : null,
    pacingMode: ['adaptive', 'static'].includes(pacingMode)
      ? pacingMode
      : null,
    stableItemKey: text(value?.stableItemKey, 180) || null,
    sourceSessionKey: text(value?.sourceSessionKey, 320) || null,
    title,
    reasonCode: text(value?.reasonCode, 80) || null,
    reasonLabel: text(value?.reasonLabel, 160) || null,
    studentExplanation: text(value?.studentExplanation, 500) || null,
    actorUserId: text(value?.actorUserId) || null,
    actorName: text(value?.actorName, 240) || 'Course participant',
    actorRole: text(value?.actorRole, 80) || null,
    effectiveAt: timestamp(value?.effectiveAt),
    recordedAt
  })
}

export function normalizeClassroomCurrentScheduleLogPayload(
  payload,
  expectedCourseId
) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('The current Schedule Log is unavailable.')
  }
  const courseId = text(payload.courseId)
  if (!courseId || (expectedCourseId && courseId !== expectedCourseId)) {
    throw new TypeError('The current Schedule Log does not match this Classroom.')
  }
  if (payload.permissions?.canReadCurrentScheduleLog !== true) {
    throw new TypeError('Current Schedule Log access was not granted.')
  }
  const entries = (Array.isArray(payload.entries) ? payload.entries : [])
    .map(normalizeCurrentScheduleLogEntry)
    .filter(Boolean)
  return Object.freeze({
    schemaVersion: integer(payload.schemaVersion) || 1,
    courseId,
    activeScheduleVersionId:
      text(payload.activeScheduleVersionId) || null,
    scheduleVersionNumber: integer(payload.scheduleVersionNumber),
    scheduleName: text(payload.scheduleName, 240) || 'Current Schedule',
    timeZone: text(payload.timeZone, 100) || 'UTC',
    permissions: Object.freeze({
      actorRole: text(payload.permissions?.actorRole, 80) || null,
      canReadCurrentScheduleLog: true,
      canReadPrivateStaffNotes: false
    }),
    summary: Object.freeze({
      entryCount: entries.length,
      staffExplanationCount: integer(
        payload.summary?.staffExplanationCount
      )
    }),
    entries: Object.freeze(entries),
    logPolicy: Object.freeze({
      activeScheduleOnly: true,
      retainedStableItemProgressIncluded: true,
      privateStaffNotesExcluded: true,
      appendOnlySources: true
    })
  })
}

function structuralPublicationKey(entry) {
  const builderEntryMatch = entry.entryId.match(/^(.+):\d+$/)
  if (builderEntryMatch) return `builder:${builderEntryMatch[1]}`
  return [
    'structure',
    entry.recordedAt,
    entry.actorUserId || entry.actorName,
    entry.studentExplanation || ''
  ].join(':')
}

function freezeActionGroups(entries, actionSelector) {
  const groups = []
  const groupByAction = new Map()
  for (const entry of entries) {
    const action = actionSelector(entry)
    let group = groupByAction.get(action)
    if (!group) {
      group = { action, entries: [] }
      groupByAction.set(action, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return Object.freeze(groups.map((group) => Object.freeze({
    action: group.action,
    entries: Object.freeze([...group.entries])
  })))
}

function sharedText(entries, selector) {
  const values = [...new Set(
    entries
      .map(selector)
      .filter(Boolean)
  )]
  return values.length === 1 ? values[0] : null
}

export function groupCurrentScheduleLogEntries(entries = []) {
  const sourceEntries = Array.isArray(entries) ? entries.filter(Boolean) : []
  const orderedGroups = []
  const structuralGroups = new Map()

  for (const entry of sourceEntries) {
    if (entry.entryKind !== 'structure') {
      orderedGroups.push({
        groupId: entry.entryId,
        groupKind: entry.entryKind,
        entries: [entry]
      })
      continue
    }

    const groupId = structuralPublicationKey(entry)
    let group = structuralGroups.get(groupId)
    if (!group) {
      group = {
        groupId,
        groupKind: 'structure',
        entries: []
      }
      structuralGroups.set(groupId, group)
      orderedGroups.push(group)
    }
    group.entries.push(entry)
  }

  return Object.freeze(orderedGroups.map((group) => {
    const groupedEntries = Object.freeze([...group.entries])
    return Object.freeze({
      groupId: group.groupId,
      groupKind: group.groupKind,
      recordedAt: groupedEntries[0]?.recordedAt || null,
      actorName: sharedText(groupedEntries, (entry) => entry.actorName),
      actorRole: sharedText(groupedEntries, (entry) => entry.actorRole),
      reasonLabel: sharedText(groupedEntries, (entry) => entry.reasonLabel),
      studentExplanation: sharedText(
        groupedEntries,
        (entry) => entry.studentExplanation
      ),
      entries: groupedEntries,
      actionGroups: freezeActionGroups(
        groupedEntries,
        (entry) => entry.action
      )
    })
  }))
}

export function groupClassroomAuditChanges(changes = []) {
  const entries = Array.isArray(changes) ? changes.filter(Boolean) : []
  return Object.freeze({
    recordedAt: entries[0]?.createdAt || null,
    actorName: sharedText(entries, (change) => change.actorName),
    reasonLabel: sharedText(entries, (change) => change.reasonLabel),
    studentExplanation: sharedText(
      entries,
      (change) => change.studentExplanation
    ),
    changes: Object.freeze([...entries]),
    actionGroups: freezeActionGroups(
      entries,
      (change) => change.changeType
    )
  })
}
