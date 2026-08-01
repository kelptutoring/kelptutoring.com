export const MULTI_BRANCH_DRAFT_SCHEMA_VERSION = 2
export const MULTI_BRANCH_COVERAGE_SCHEMA_VERSION = 2
export const REGULAR_PATHWAY_PRESENTATION = Object.freeze({
  key: 'regular',
  title: 'Regular',
  inferred: true
})

export function indexBuilderCatalog(catalog = {}) {
  const levels = Array.isArray(catalog.levels) ? catalog.levels : []
  const branches = []
  const branchesByTrackId = new Map()
  const sessionsById = new Map()

  levels.forEach((level, levelIndex) => {
    const levelIdentity = normalizeCatalogNode(level, `Education level ${levelIndex + 1}`)
    const subjects = Array.isArray(level.subjects) ? level.subjects : []
    subjects.forEach((subject, subjectIndex) => {
      const subjectIdentity = normalizeCatalogNode(
        subject,
        `${levelIdentity.title} Subject ${subjectIndex + 1}`
      )
      const tracks = Array.isArray(subject.tracks) ? subject.tracks : []
      tracks.forEach((track, trackIndex) => {
        const trackIdentity = normalizeCatalogNode(
          track,
          `${subjectIdentity.title} Track ${trackIndex + 1}`
        )
        if (branchesByTrackId.has(trackIdentity.id)) {
          throw new TypeError(`Track ID ${trackIdentity.id} is repeated in the Builder catalogue.`)
        }
        const academicPathway = normalizeAcademicPathway(track.academicPathway)
        const branch = Object.freeze({
          key: [levelIdentity.id, subjectIdentity.id, trackIdentity.id].join('::'),
          educationLevel: Object.freeze({ ...levelIdentity, source: level }),
          subject: Object.freeze({ ...subjectIdentity, source: subject }),
          track: Object.freeze({ ...trackIdentity, source: track }),
          academicPathway,
          pathwayPresentation: academicPathway || REGULAR_PATHWAY_PRESENTATION
        })
        branches.push(branch)
        branchesByTrackId.set(trackIdentity.id, branch)

        const modules = Array.isArray(track.modules) ? track.modules : []
        modules.forEach((module) => {
          const sessions = Array.isArray(module.sessions) ? module.sessions : []
          sessions.forEach((session) => {
            const sessionId = requiredText(session?.id, 'A catalogue Session ID', 320)
            if (sessionsById.has(sessionId)) {
              throw new TypeError(`Session ID ${sessionId} is repeated in the Builder catalogue.`)
            }
            sessionsById.set(sessionId, Object.freeze({
              branch,
              module,
              session
            }))
          })
        })
      })
    })
  })

  return Object.freeze({
    schemaVersion: Math.max(1, Number(catalog.schemaVersion) || 1),
    levels: Object.freeze(levels.slice()),
    branches: Object.freeze(branches),
    branchesByTrackId,
    sessionsById
  })
}

export function groupSubjectTracksByPathway(index, {
  levelId,
  subjectId
} = {}) {
  const groups = new Map()
  index.branches
    .filter((branch) =>
      branch.educationLevel.id === levelId
      && branch.subject.id === subjectId
    )
    .forEach((branch) => {
      const presentation = branch.pathwayPresentation
      if (!groups.has(presentation.key)) {
        groups.set(presentation.key, {
          key: presentation.key,
          title: presentation.title,
          inferred: presentation.inferred === true,
          branches: []
        })
      }
      groups.get(presentation.key).branches.push(branch)
    })

  return Object.freeze(Array.from(groups.values(), (group) => Object.freeze({
    ...group,
    branches: Object.freeze(group.branches.slice())
  })))
}

export function normalizeBuilderDraftSelection(draft, index) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null
  if (![1, MULTI_BRANCH_DRAFT_SCHEMA_VERSION].includes(Number(draft.schemaVersion))) {
    return null
  }

  const selectedTrackIds = uniqueOrdered(draft.selectedTrackIds)
    .filter((trackId) => index.branchesByTrackId.has(trackId))
  const selectedTrackSet = new Set(selectedTrackIds)
  const selectedSessionIds = uniqueOrdered(draft.selectedSessionIds)
    .filter((sessionId) => {
      const indexed = index.sessionsById.get(sessionId)
      return indexed && selectedTrackSet.has(indexed.branch.track.id)
    })
  const requestedPrimary = optionalText(draft.primaryTrackId, 320)
  const primaryTrackId = requestedPrimary && selectedTrackSet.has(requestedPrimary)
    ? requestedPrimary
    : selectedTrackIds[0] || null

  const levelId = optionalText(draft.browsing?.levelId || draft.levelId, 320)
  const subjectId = optionalText(draft.browsing?.subjectId || draft.subjectId, 320)
  const browsingBranch = index.branches.find((branch) =>
    branch.educationLevel.id === levelId
    && branch.subject.id === subjectId
  )

  return Object.freeze({
    schemaVersion: MULTI_BRANCH_DRAFT_SCHEMA_VERSION,
    migratedFromSchemaVersion: Number(draft.schemaVersion),
    browsing: Object.freeze({
      levelId: browsingBranch ? levelId : null,
      subjectId: browsingBranch ? subjectId : null
    }),
    selectedTrackIds: Object.freeze(selectedTrackIds),
    selectedSessionIds: Object.freeze(selectedSessionIds),
    primaryTrackId
  })
}

export function reconcileBuilderTrackSelection({
  index,
  selectedTrackIds,
  selectedSessionIds,
  primaryTrackId,
  activeTrackId
} = {}) {
  if (!index?.branchesByTrackId || !index?.sessionsById) {
    throw new TypeError('A Builder catalogue index is required.')
  }

  const tracks = uniqueOrdered(selectedTrackIds)
    .filter((trackId) => index.branchesByTrackId.has(trackId))
  const trackSet = new Set(tracks)
  const sessions = uniqueOrdered(selectedSessionIds)
    .filter((sessionId) => {
      const indexed = index.sessionsById.get(sessionId)
      return indexed && trackSet.has(indexed.branch.track.id)
    })
  const requestedPrimary = optionalText(primaryTrackId, 320)
  const nextPrimaryTrackId = requestedPrimary && trackSet.has(requestedPrimary)
    ? requestedPrimary
    : tracks[0] || null
  const requestedActive = optionalText(activeTrackId, 320)
  const nextActiveTrackId = requestedActive && trackSet.has(requestedActive)
    ? requestedActive
    : nextPrimaryTrackId

  return Object.freeze({
    selectedTrackIds: Object.freeze(tracks),
    selectedSessionIds: Object.freeze(sessions),
    primaryTrackId: nextPrimaryTrackId,
    activeTrackId: nextActiveTrackId,
    activeTrackIndex: nextActiveTrackId
      ? tracks.indexOf(nextActiveTrackId)
      : 0
  })
}

export function createSelectionTrayEntries({
  index,
  selectedTrackIds,
  selectedSessionIds,
  primaryTrackId
} = {}) {
  const selectedSessions = new Set(uniqueOrdered(selectedSessionIds))
  const entries = uniqueOrdered(selectedTrackIds).map((trackId) => {
    const branch = index.branchesByTrackId.get(trackId)
    if (!branch) return null
    const sessionCount = Array.from(index.sessionsById.values()).filter((entry) =>
      entry.branch.track.id === trackId
      && selectedSessions.has(entry.session.id)
    ).length
    return Object.freeze({
      ...branch,
      role: trackId === primaryTrackId ? 'primary' : 'supporting',
      sessionCount,
      includedInCoverage: sessionCount > 0
    })
  }).filter(Boolean)
  entries.sort((left, right) =>
    Number(right.track.id === primaryTrackId)
      - Number(left.track.id === primaryTrackId)
  )
  return Object.freeze(entries)
}

export function classifyBuilderRetainedItemStatus(item = {}) {
  const explicitStatus = String(item?.retainedStatus || '').trim().toLowerCase()
  if (
    ['studied', 'practiced', 'delivered', 'dropped', 'past', 'retained']
      .includes(explicitStatus)
  ) {
    return explicitStatus
  }
  const reason = String(item?.lockReason || '').trim().toLowerCase()
  if (item?.isStudied === true || reason === 'studied') return 'studied'
  if (item?.isPracticed === true || reason === 'practiced') return 'practiced'
  if (item?.isDelivered === true || reason === 'delivered') return 'delivered'
  if (item?.state === 'dropped' || reason === 'dropped') return 'dropped'
  if (reason === 'past') return 'past'
  return 'retained'
}

export function classifyBuilderSessionStatus({
  sessionId,
  selectedSessionIds,
  retainedItems,
  sourceUpdateSessionIds,
  inheritedSessionIds
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) return 'none'
  const selected = new Set(uniqueOrdered(selectedSessionIds))
  const retainedItem = (Array.isArray(retainedItems) ? retainedItems : [])
    .find((item) => item?.catalogSessionId === normalizedSessionId)
  if (retainedItem) {
    const retainedStatus = classifyBuilderRetainedItemStatus(retainedItem)
    if (retainedStatus === 'dropped' && selected.has(normalizedSessionId)) {
      return 'restored'
    }
    return retainedStatus
  }
  if (new Set(uniqueOrdered(sourceUpdateSessionIds)).has(normalizedSessionId)) {
    return 'updated'
  }
  if (selected.has(normalizedSessionId)) {
    return new Set(uniqueOrdered(inheritedSessionIds)).has(normalizedSessionId)
      ? 'inherited'
      : 'selected'
  }
  return 'none'
}

export function classifyBuilderModulePresentationStatuses({
  sessionIds,
  selectedSessionIds,
  retainedItems,
  sourceUpdateSessionIds,
  inheritedSessionIds
} = {}) {
  const presentationStatuses = new Set()

  uniqueOrdered(sessionIds).forEach((sessionId) => {
    const status = classifyBuilderSessionStatus({
      sessionId,
      selectedSessionIds,
      retainedItems,
      sourceUpdateSessionIds,
      inheritedSessionIds
    })
    if (status === 'studied' || status === 'practiced') {
      presentationStatuses.add('studied')
    } else if (status === 'dropped') {
      presentationStatuses.add('dropped')
    } else if (
      status === 'delivered'
      || status === 'past'
      || status === 'retained'
      || status === 'inherited'
    ) {
      presentationStatuses.add('former')
    } else if (
      status === 'updated'
      || status === 'restored'
      || status === 'selected'
    ) {
      presentationStatuses.add('recent')
    }
  })

  return Object.freeze(
    ['studied', 'dropped', 'former', 'recent']
      .filter((status) => presentationStatuses.has(status))
  )
}

export function classifyBuilderModuleStatus({
  sessionIds,
  selectedSessionIds,
  retainedItems,
  sourceUpdateSessionIds,
  inheritedSessionIds
} = {}) {
  const presentationStatuses = classifyBuilderModulePresentationStatuses({
    sessionIds,
    selectedSessionIds,
    retainedItems,
    sourceUpdateSessionIds,
    inheritedSessionIds
  })

  if (
    presentationStatuses.includes('studied')
    && presentationStatuses.includes('dropped')
  ) return 'mixed'
  if (presentationStatuses.length === 1 && presentationStatuses[0] === 'studied') {
    return 'studied'
  }
  if (presentationStatuses.length === 1 && presentationStatuses[0] === 'dropped') {
    return 'dropped'
  }
  if (presentationStatuses.length) return 'selected'
  return 'none'
}

export function classifyCourseScheduleRevision({
  activeTrackIds,
  selectedTrackIds,
  activeSessionIds,
  selectedSessionIds
} = {}) {
  const activeTracks = uniqueOrdered(activeTrackIds)
  if (activeTracks.length) {
    const selectedTracks = new Set(uniqueOrdered(selectedTrackIds))
    return activeTracks.some((trackId) => selectedTracks.has(trackId))
      ? 'incremental'
      : 'replacement'
  }
  const selected = new Set(uniqueOrdered(selectedSessionIds))
  return uniqueOrdered(activeSessionIds).some((sessionId) => selected.has(sessionId))
    ? 'incremental'
    : 'replacement'
}

export function courseScheduleTrackRemovalState({
  trackId,
  selectedTrackIds,
  activeTrackIds,
  workedTrackIds
} = {}) {
  const normalizedTrackId = optionalText(trackId, 320)
  const selected = new Set(uniqueOrdered(selectedTrackIds))
  const active = new Set(uniqueOrdered(activeTrackIds))
  const worked = new Set(uniqueOrdered(workedTrackIds))
  const isSelected = Boolean(normalizedTrackId && selected.has(normalizedTrackId))
  const belongsToActiveSchedule = Boolean(
    normalizedTrackId && active.has(normalizedTrackId)
  )
  const hasWorkedProgress = Boolean(
    belongsToActiveSchedule && worked.has(normalizedTrackId)
  )
  return Object.freeze({
    trackId: normalizedTrackId,
    isSelected,
    belongsToActiveSchedule,
    hasWorkedProgress,
    action: !isSelected
      ? 'none'
      : hasWorkedProgress
        ? 'start_new_schedule'
        : 'remove'
  })
}

export function createReusablePlanCoverage({
  index,
  selectedTrackIds,
  selectedSessionIds,
  primaryTrackId
} = {}) {
  const entries = createSelectionTrayEntries({
    index,
    selectedTrackIds,
    selectedSessionIds,
    primaryTrackId
  }).filter((entry) => entry.includedInCoverage)
  if (!entries.length) {
    throw new TypeError('A reusable Schedule plan requires at least one selected Session.')
  }
  if (!entries.some((entry) => entry.track.id === primaryTrackId)) {
    throw new TypeError('The primary Track must contain at least one selected Session.')
  }

  return Object.freeze({
    schemaVersion: MULTI_BRANCH_COVERAGE_SCHEMA_VERSION,
    primaryTrackKey: primaryTrackId,
    branches: Object.freeze(entries.map((entry) => Object.freeze({
      branchKey: entry.key,
      role: entry.role,
      educationLevel: coverageNode(entry.educationLevel),
      academicPathways: Object.freeze(
        entry.academicPathway ? [coverageNode(entry.academicPathway)] : []
      ),
      subject: coverageNode(entry.subject),
      track: coverageNode(entry.track)
    })))
  })
}

export function createClassroomBuilderPreload({
  context,
  index,
  today
} = {}) {
  if (!context?.schedule || !index?.branchesByTrackId || !index?.sessionsById) {
    throw new TypeError('A governed Classroom Schedule context and Builder catalogue are required.')
  }

  const activeVersionId = requiredText(
    context.schedule.activeVersionId,
    'The active Schedule Version ID',
    320
  )
  const effectiveToday = dateOnly(today || new Date().toISOString().slice(0, 10))
  const coverage = normalizeCoverage(context.schedule.coverage)
  const resolvedBranches = []
  const missingBranches = []

  coverage.branches.forEach((coverageBranch) => {
    const catalogBranch = resolveCoverageBranch(index, coverageBranch)
    if (catalogBranch) {
      resolvedBranches.push(Object.freeze({
        coverage: coverageBranch,
        catalog: catalogBranch
      }))
    } else {
      missingBranches.push(Object.freeze({
        role: coverageBranch.role,
        educationLevel: coverageBranch.educationLevel,
        academicPathways: coverageBranch.academicPathways,
        subject: coverageBranch.subject,
        track: coverageBranch.track
      }))
    }
  })

  const primaryResolved = resolvedBranches.find(({ coverage: branch }) =>
    branch.role === 'primary'
  )
  const selectedTrackIds = uniqueOrdered(
    resolvedBranches.map(({ catalog: branch }) => branch.track.id)
  )
  const selectedSessionIds = []
  const retainedItems = []
  const missingSourceItems = []
  const sourceUpdates = []
  const scheduledSessionIdsBySourceId = {}
  const lockedSessionIds = []
  const workedTrackIds = []

  ;(Array.isArray(context.schedule.items) ? context.schedule.items : []).forEach((item, indexValue) => {
    const normalizedItem = normalizeClassroomItem(item, indexValue, effectiveToday)
    const sourceSessionId = normalizedItem.sourceSessionId
    const indexedSession = sourceSessionId
      ? index.sessionsById.get(sourceSessionId)
      : null
    const catalogBranch = resolveBuilderItemCatalogBranch({
      index,
      item: normalizedItem,
      indexedSession
    })
    const academicContext = resolveBuilderItemAcademicContext({
      index,
      coverage,
      item: normalizedItem,
      indexedSession,
      catalogBranch
    })
    if (
      (
        normalizedItem.isStudied
        || normalizedItem.isPracticed
        || normalizedItem.isDelivered
      )
      && catalogBranch
      && !workedTrackIds.includes(catalogBranch.track.id)
    ) {
      workedTrackIds.push(catalogBranch.track.id)
    }

    if (normalizedItem.kind !== 'curriculum_topic') {
      if (normalizedItem.locked) {
        retainedItems.push(Object.freeze({
          ...normalizedItem,
          retainedStatus: classifyBuilderRetainedItemStatus(normalizedItem),
          academicContext
        }))
      }
      return
    }

    if (!indexedSession) {
      missingSourceItems.push(Object.freeze({
        ...normalizedItem,
        retainedStatus: normalizedItem.locked || normalizedItem.state === 'dropped'
          ? classifyBuilderRetainedItemStatus(normalizedItem)
          : null,
        academicContext,
        catalogTrackId: catalogBranch?.track.id || null,
        canRetainSnapshot: true,
        canDropLater: !normalizedItem.locked && normalizedItem.state !== 'dropped',
        canRestore: false
      }))
      return
    }

    if (!selectedTrackIds.includes(indexedSession.branch.track.id)) {
      selectedTrackIds.push(indexedSession.branch.track.id)
    }
    scheduledSessionIdsBySourceId[indexedSession.session.id] = normalizedItem.stableItemKey

    if (normalizedItem.state === 'dropped') {
      retainedItems.push(Object.freeze({
        ...normalizedItem,
        retainedStatus: 'dropped',
        academicContext,
        catalogTrackId: indexedSession.branch.track.id,
        catalogSessionId: indexedSession.session.id,
        canRestore: true
      }))
      return
    }

    if (normalizedItem.locked) {
      lockedSessionIds.push(indexedSession.session.id)
      retainedItems.push(Object.freeze({
        ...normalizedItem,
        retainedStatus: classifyBuilderRetainedItemStatus(normalizedItem),
        academicContext,
        catalogTrackId: indexedSession.branch.track.id,
        catalogSessionId: indexedSession.session.id
      }))
      return
    }

    if (!selectedSessionIds.includes(indexedSession.session.id)) {
      selectedSessionIds.push(indexedSession.session.id)
    }
    const latestVersion = optionalText(indexedSession.session.sourceContentVersionKey, 320)
    if (
      normalizedItem.sourceContentVersionKey
      && latestVersion
      && normalizedItem.sourceContentVersionKey !== latestVersion
    ) {
      sourceUpdates.push(Object.freeze({
        stableItemKey: normalizedItem.stableItemKey,
        catalogTrackId: indexedSession.branch.track.id,
        catalogSessionId: indexedSession.session.id,
        title: indexedSession.session.title,
        academicContext,
        retainedVersionKey: normalizedItem.sourceContentVersionKey,
        latestVersionKey: latestVersion
      }))
    }
  })

  return Object.freeze({
    schemaVersion: 1,
    courseId: requiredText(context.course?.id, 'The Course ID', 320),
    activeVersionId,
    versionNumber: Number(context.schedule.versionNumber) || 1,
    catalogIndex: index,
    selectedTrackIds: Object.freeze(uniqueOrdered(selectedTrackIds)),
    selectedSessionIds: Object.freeze(uniqueOrdered(selectedSessionIds)),
    primaryTrackId: primaryResolved?.catalog.track.id || selectedTrackIds[0] || null,
    resolvedBranches: Object.freeze(resolvedBranches),
    missingBranches: Object.freeze(missingBranches),
    retainedItems: Object.freeze(retainedItems),
    missingSourceItems: Object.freeze(missingSourceItems),
    sourceUpdates: Object.freeze(sourceUpdates),
    lockedSessionIds: Object.freeze(uniqueOrdered(lockedSessionIds)),
    workedTrackIds: Object.freeze(uniqueOrdered(workedTrackIds)),
    scheduledSessionIdsBySourceId: Object.freeze(scheduledSessionIdsBySourceId),
    hasMultiBranchCoverage: coverage.branches.length > 1
  })
}

export function courseDraftMatchesActiveVersion(draft, {
  courseId,
  activeVersionId
} = {}) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return false
  return optionalText(draft.courseId, 320) === optionalText(courseId, 320)
    && optionalText(draft.baseActiveVersionId, 320) === optionalText(activeVersionId, 320)
}

export function classroomCoverageChangeState({
  preload,
  selectedTrackIds,
  selectedSessionIds,
  primaryTrackId
} = {}) {
  if (!preload) {
    return Object.freeze({
      changed: false,
      requiresGovernedPublisher: false,
      reasons: Object.freeze([])
    })
  }
  const selectedSessions = new Set(uniqueOrdered(selectedSessionIds))
  const proposedTrackIds = uniqueOrdered(selectedTrackIds).filter((trackId) =>
    Array.from(selectedSessions).some((sessionId) =>
      preload.catalogIndex.sessionsById.get(sessionId)?.branch.track.id === trackId
    )
  )
  const retainedTrackIds = uniqueOrdered(
    preload.resolvedBranches.map(({ catalog: branch }) => branch.track.id)
  )
  const reasons = []
  if (
    proposedTrackIds.slice().sort().join('\u0000')
      !== retainedTrackIds.slice().sort().join('\u0000')
  ) {
    reasons.push('coverage')
  }
  if (primaryTrackId && primaryTrackId !== preload.primaryTrackId) {
    reasons.push('primary_track')
  }
  if (preload.hasMultiBranchCoverage) reasons.push('existing_multi_branch')
  if (preload.sourceUpdates.length) reasons.push('track_source_update')
  if (preload.missingSourceItems.some((item) => !item.locked)) {
    reasons.push('missing_future_source')
  }
  return Object.freeze({
    changed: reasons.includes('coverage') || reasons.includes('primary_track'),
    requiresGovernedPublisher: reasons.length > 0,
    reasons: Object.freeze(Array.from(new Set(reasons)))
  })
}

function normalizeCoverage(value) {
  const snapshot = value?.snapshot && typeof value.snapshot === 'object'
    ? value.snapshot
    : value
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.branches)) {
    throw new TypeError('The active Schedule Version has no retained curriculum coverage.')
  }
  const branches = snapshot.branches.map((branch, index) => {
    const role = branch?.role === 'primary' ? 'primary' : 'supporting'
    return Object.freeze({
      role,
      educationLevel: normalizeCoverageIdentity(
        branch?.educationLevel,
        `Coverage branch ${index + 1} Education level`
      ),
      academicPathways: Object.freeze(
        (Array.isArray(branch?.academicPathways)
          ? branch.academicPathways
          : Array.isArray(branch?.goals)
            ? branch.goals
            : []
        ).map((pathway, pathwayIndex) => normalizeCoverageIdentity(
          pathway,
          `Coverage branch ${index + 1} pathway ${pathwayIndex + 1}`
        ))
      ),
      subject: normalizeCoverageIdentity(
        branch?.subject,
        `Coverage branch ${index + 1} Subject`
      ),
      track: normalizeCoverageIdentity(
        branch?.track,
        `Coverage branch ${index + 1} Track`
      )
    })
  })
  if (!branches.length || branches.filter((branch) => branch.role === 'primary').length !== 1) {
    throw new TypeError('The active Schedule Version coverage requires exactly one primary Track.')
  }
  return Object.freeze({ branches: Object.freeze(branches) })
}

function normalizeCoverageIdentity(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} is required.`)
  }
  const name = requiredText(value.name || value.title, `${label} name`, 240)
  return Object.freeze({
    key: optionalText(value.key || value.nodeId || value.id, 320),
    name,
    slug: taxonomySlug(value.slug || value.taxonomySlug || name)
  })
}

function resolveCoverageBranch(index, coverageBranch) {
  return index.branches.find((branch) =>
    branch.educationLevel.taxonomySlug === coverageBranch.educationLevel.slug
    && branch.subject.taxonomySlug === coverageBranch.subject.slug
    && branch.track.taxonomySlug === coverageBranch.track.slug
  ) || null
}

function resolveBuilderItemAcademicContext({
  index,
  coverage,
  item,
  indexedSession,
  catalogBranch = resolveBuilderItemCatalogBranch({ index, item, indexedSession })
}) {
  const coverageBranch = coverage.branches.find((branch) => {
    if (catalogBranch) {
      return branch.educationLevel.slug === catalogBranch.educationLevel.taxonomySlug
        && branch.subject.slug === catalogBranch.subject.taxonomySlug
        && branch.track.slug === catalogBranch.track.taxonomySlug
    }
    return item.sourceTrackSlug
      && branch.track.slug === item.sourceTrackSlug
      && (!item.sourceSubjectSlug || branch.subject.slug === item.sourceSubjectSlug)
      && (
        !item.sourceEducationLevelSlug
        || branch.educationLevel.slug === item.sourceEducationLevelSlug
      )
  }) || null
  const catalogModule = indexedSession?.module
    || (Array.isArray(catalogBranch?.track?.source?.modules)
      ? catalogBranch.track.source.modules.find((module) =>
        String(module?.id || '') === String(item.sourceModuleId || '')
      )
      : null)
  const educationLevel = coverageBranch?.educationLevel?.name
    || catalogBranch?.educationLevel?.title
    || ''
  const subject = coverageBranch?.subject?.name
    || catalogBranch?.subject?.title
    || ''
  const track = coverageBranch?.track?.name
    || catalogBranch?.track?.title
    || ''
  const academicPathways = coverageBranch?.academicPathways?.length
    ? coverageBranch.academicPathways.map((pathway) => pathway.name)
    : catalogBranch?.academicPathway?.title
      ? [catalogBranch.academicPathway.title]
      : []
  const module = String(catalogModule?.title || item.sourceModuleTitle || '').trim()
  if (!educationLevel && !subject && !track && !module) return null
  return Object.freeze({
    educationLevel,
    subject,
    academicPathways: Object.freeze(academicPathways),
    track,
    module
  })
}

function resolveBuilderItemCatalogBranch({
  index,
  item,
  indexedSession
}) {
  return indexedSession?.branch
    || (item.sourceTrackId ? index.branchesByTrackId.get(item.sourceTrackId) : null)
    || index.branches.find((branch) =>
      item.sourceTrackSlug
      && branch.track.taxonomySlug === item.sourceTrackSlug
      && (!item.sourceSubjectSlug || branch.subject.taxonomySlug === item.sourceSubjectSlug)
      && (
        !item.sourceEducationLevelSlug
        || branch.educationLevel.taxonomySlug === item.sourceEducationLevelSlug
      )
    )
    || null
}

function normalizeClassroomItem(item, index, today) {
  const stableItemKey = requiredText(
    item?.stableItemKey,
    `Schedule item ${index + 1} key`,
    320
  )
  const state = ['scheduled', 'requeued', 'dropped'].includes(item?.state)
    ? item.state
    : 'scheduled'
  const scheduledDate = dateOnly(item?.scheduledDate)
  const sourceSnapshot = item?.sourceSnapshot && typeof item.sourceSnapshot === 'object'
    ? item.sourceSnapshot
    : {}
  const sourceTrackId = optionalText(
    item?.sourceTrackKey
      || sourceSnapshot.sourceTrackKey
      || sourceSnapshot.trackId
      || sourceSnapshot.trackKey,
    320
  )
  const sourceModuleId = optionalText(
    item?.sourceModuleKey
      || sourceSnapshot.sourceModuleKey
      || sourceSnapshot.moduleId
      || sourceSnapshot.moduleKey,
    320
  )
  const sourceModuleTitle = optionalText(
    item?.sourceModuleTitle
      || sourceSnapshot.sourceModuleTitle
      || sourceSnapshot.moduleTitle,
    240
  )
  const sourceSessionId = optionalText(
    item?.sourceSessionKey
      || sourceSnapshot.sourceSessionKey
      || sourceSnapshot.sourceSessionId
      || sourceSnapshot.sessionId
      || (String(stableItemKey).startsWith('builtin_session_') ? stableItemKey : ''),
    320
  )
  const sourceContentVersionKey = optionalText(
    item?.sourceContentVersionKey
      || sourceSnapshot.sourceContentVersionKey
      || sourceSnapshot.contentVersionKey,
    320
  )
  const sourceEducationLevelSlug = optionalTaxonomySlug(
    item?.sourceEducationLevelSlug
      || sourceSnapshot.sourceEducationLevelSlug
      || sourceSnapshot.educationLevelTaxonomySlug
  )
  const sourceSubjectSlug = optionalTaxonomySlug(
    item?.sourceSubjectSlug
      || sourceSnapshot.sourceSubjectSlug
      || sourceSnapshot.subjectTaxonomySlug
  )
  const sourceTrackSlug = optionalTaxonomySlug(
    item?.sourceTrackSlug
      || sourceSnapshot.sourceTrackSlug
      || sourceSnapshot.trackTaxonomySlug
  )
  const isStudied = item?.isStudied === true
  const isPracticed = item?.isPracticed === true
  const isDelivered = item?.isDelivered === true
  const canRestore = state === 'dropped'
    && !isStudied
    && !isPracticed
    && !isDelivered
  const locked = isStudied
    || isPracticed
    || (!canRestore && scheduledDate < today)
  return Object.freeze({
    scheduleItemId: optionalText(item?.scheduleItemId, 320),
    stableItemKey,
    title: requiredText(item?.title, `Schedule item ${index + 1} title`, 320),
    kind: String(item?.kind || 'curriculum_topic'),
    state,
    scheduledDate,
    sourceTrackId,
    sourceModuleId,
    sourceModuleTitle,
    sourceSessionId,
    sourceContentVersionKey,
    sourceEducationLevelSlug,
    sourceSubjectSlug,
    sourceTrackSlug,
    isStudied,
    isPracticed,
    isDelivered,
    canRestore,
    locked,
    lockReason: isStudied
      ? 'Studied'
      : isPracticed
        ? 'Practiced'
        : state === 'dropped'
            ? 'Dropped'
            : scheduledDate < today
              ? 'Past'
              : null
  })
}

function normalizeCatalogNode(node, label) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new TypeError(`${label} is required.`)
  }
  const title = requiredText(node.title || node.name, `${label} title`, 240)
  return {
    id: requiredText(node.id || node.key, `${label} ID`, 320),
    title,
    taxonomySlug: taxonomySlug(node.taxonomySlug || node.slug || title)
  }
}

function normalizeAcademicPathway(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const title = requiredText(value, 'The academic pathway title', 120)
    return Object.freeze({
      key: taxonomySlug(title),
      id: null,
      title,
      taxonomySlug: taxonomySlug(title),
      inferred: false
    })
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('A Track academic pathway is invalid.')
  }
  const title = requiredText(value.title || value.name, 'The academic pathway title', 120)
  return Object.freeze({
    key: requiredText(value.key || value.id || taxonomySlug(title), 'The academic pathway key', 240),
    id: optionalText(value.id, 320),
    title,
    taxonomySlug: taxonomySlug(value.taxonomySlug || value.slug || title),
    inferred: false
  })
}

function coverageNode(node) {
  return Object.freeze({
    key: node.id || node.key,
    name: node.title,
    slug: node.taxonomySlug
  })
}

function uniqueOrdered(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ))
}

function taxonomySlug(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug || slug.length > 180) throw new TypeError('A taxonomy slug is required.')
  return slug === 'math' ? 'mathematics' : slug
}

function optionalTaxonomySlug(value) {
  const text = String(value || '').trim()
  return text ? taxonomySlug(text) : null
}

function requiredText(value, label, maximum) {
  const text = String(value || '').trim()
  if (!text || text.length > maximum) throw new TypeError(`${label} is required.`)
  return text
}

function optionalText(value, maximum) {
  const text = String(value || '').trim()
  if (!text) return null
  if (text.length > maximum) throw new TypeError('A Builder identifier is too long.')
  return text
}

function dateOnly(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new TypeError('A Schedule date must use a valid YYYY-MM-DD value.')
  }
  return text
}
