import './schedule-domain.js'

const ITEM_TYPES = Object.freeze({
  lesson: 'curriculum_topic',
  review: 'review',
  assessment: 'exam'
})

export function createBuilderCoursePublication({
  schedule,
  course,
  activeItems = [],
  activePacingMode = 'adaptive',
  today = null,
  studentExplanation = 'The Course plan was updated from the approved Kelp Track.'
} = {}) {
  const document = normalizeBuilderSchedule(schedule)
  const context = normalizeCourseContext(course)
  const explanation = boundedText(studentExplanation, 10, 500, 'A Student-visible publishing reason')
  const active = normalizeActiveItems(activeItems)
  const effectiveToday = today || dateInTimeZone(document.timeZone)
  const pacingModeChanged =
    normalizePacingMode(activePacingMode) !== document.pacingMode

  const existingByKey = new Map(active.map((item) => [item.stableItemKey, item]))
  const proposed = active.map((item) => ({ ...item }))
  const proposedByKey = new Map(proposed.map((item) => [item.stableItemKey, item]))
  const reasons = []
  const builderKeys = new Set(document.sessions.map((session) => session.id))
  let includedCount = 0
  let droppedCount = 0
  let restoredCount = 0

  proposed.forEach((item) => {
    if (
      !builderKeys.has(item.stableItemKey)
      && !item.isStudied
      && !item.isPracticed
      && !item.isDelivered
      && item.state !== 'dropped'
      && item.scheduledDate >= effectiveToday
    ) {
      item.state = 'dropped'
      droppedCount += 1
      reasons.push(reasonFor(item.stableItemKey, 'dropped', 'administrative_correction', explanation))
    }
  })

  document.sessions.forEach((session) => {
    const existing = existingByKey.get(session.id)
    if (existing) {
      if (existing.title !== session.title || existing.kind !== scheduleItemKind(session.type)) {
        throw new TypeError(
          `The existing Schedule identity “${session.title}” cannot be rewritten. Add it as a new Session instead.`
        )
      }
      if (
        existing.isStudied
        || existing.scheduledDate < effectiveToday
      ) return
      const retained = proposedByKey.get(session.id)
      if (existing.state === 'dropped') {
        retained.state = 'scheduled'
        restoredCount += 1
        reasons.push(reasonFor(session.id, 'restored', 'curriculum_adjustment', explanation))
      }
      retained.scheduledDate = session.startDate
      retained.endDate = session.endDate
      return
    }

    proposed.push(builderSessionToItem(session, document, context, proposed.length))
    includedCount += 1
    reasons.push(reasonFor(session.id, 'included', 'curriculum_adjustment', explanation))
  })

  const positioned = assignPublishedPositions(proposed, document.sessions, {
    effectiveToday,
    builderKeys
  })
  const existingByPosition = new Map(active.map((item) => [item.stableItemKey, item]))
  const retainedBefore = active
    .filter((item) =>
      item.state !== 'dropped'
      && positioned.some((candidate) =>
        candidate.stableItemKey === item.stableItemKey && candidate.state !== 'dropped'
      )
    )
    .map((item) => item.stableItemKey)
  const retainedAfter = positioned
    .filter((item) => {
      const existing = existingByPosition.get(item.stableItemKey)
      return existing && existing.state !== 'dropped' && item.state !== 'dropped'
    })
    .map((item) => item.stableItemKey)
  const changedRetained = positioned.find((item) => {
    const existing = existingByPosition.get(item.stableItemKey)
    return existing
      && existing.state !== 'dropped'
      && item.state !== 'dropped'
      && (
        existing.position !== item.position
        || existing.scheduledDate !== item.scheduledDate
        || existing.endDate !== item.endDate
      )
  })
  const retainedOrderChanged = retainedBefore.join('\u0000') !== retainedAfter.join('\u0000')
  const reorderedRequired = retainedOrderChanged
    || (
      includedCount === 0
      && droppedCount === 0
      && restoredCount === 0
      && Boolean(changedRetained)
    )
  if (reorderedRequired && changedRetained) {
    reasons.push(reasonFor(
      changedRetained.stableItemKey,
      'reordered',
      'pacing_adjustment',
      explanation
    ))
  }

  if (!reasons.length && !pacingModeChanged) {
    throw new TypeError('The Builder does not contain a publishable change.')
  }

  return Object.freeze({
    schemaVersion: 1,
    builderSchedule: document,
    items: Object.freeze(positioned.map((item) => Object.freeze(item))),
    changeReasons: Object.freeze(reasons.map(Object.freeze)),
    pacingPolicyOnly: reasons.length === 0 && pacingModeChanged
  })
}

function reconcileDatesWithScheduleDomain({
  schedule,
  activeItems = [],
  today = null,
  lockedStartDate = null
} = {}) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new TypeError('A generated Schedule document is required.')
  }
  if (!Array.isArray(schedule.sessions) || !schedule.sessions.length) {
    throw new TypeError('A continuing Schedule requires at least one Session.')
  }

  const timeZone = requiredText(schedule.timeZone, 'The Student timezone', 120)
  const effectiveToday = today || dateInTimeZone(timeZone)
  dateOnly(effectiveToday, 'The continuation date')
  const calculatedDates = globalThis.KelpScheduleDomain.calculateEffectiveSessionDates({
    sessions: schedule.sessions,
    startDate: schedule.startDate,
    cadence: normalizeCourseScheduleCadence(schedule.cadence),
    activeItems,
    today: effectiveToday,
    lockedStartDate,
    pacingMode: schedule.pacingMode
  })
  const sessions = schedule.sessions.map((session, index) => ({
    ...session,
    sessionNumber: index + 1,
    startDate: calculatedDates[index].startDate,
    endDate: calculatedDates[index].endDate
  }))

  return {
    ...schedule,
    startDate: lockedStartDate || schedule.startDate,
    endDate: sessions.map((session) => session.endDate).sort().at(-1),
    sessions,
    context: {
      ...(schedule.context || {}),
      continuationBoundary: effectiveToday,
      historicalDatesFrozen: true,
      cadenceCalculatedBy: 'schedule-domain'
    }
  }
}

export function reconcileContinuingScheduleDates({
  schedule,
  activeItems = [],
  today = null,
  lockedStartDate = null
} = {}) {
  return reconcileDatesWithScheduleDomain({
    schedule,
    activeItems,
    today,
    lockedStartDate
  })
}

export function normalizeBuilderSchedule(schedule = {}) {
  if (!schedule || Array.isArray(schedule) || typeof schedule !== 'object') {
    throw new TypeError('A generated Schedule document is required.')
  }

  const id = requiredText(schedule.id, 'The generated Schedule ID', 180)
  const name = requiredText(schedule.name, 'The generated Schedule name', 180)
  const timeZone = requiredText(schedule.timeZone, 'The Student timezone', 120)
  const pacingMode = normalizePacingMode(schedule.pacingMode)
  const sessions = Array.isArray(schedule.sessions) ? schedule.sessions.map(normalizeBuilderSession) : []
  if (!sessions.length || sessions.length > 500) {
    throw new TypeError('The generated Schedule must contain between 1 and 500 Sessions.')
  }
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) {
    throw new TypeError('Every generated Schedule Session requires a unique stable ID.')
  }
  const startDate = dateOnly(
    schedule.startDate || sessions.map((session) => session.startDate).sort()[0],
    'The generated Schedule start date'
  )

  const context = schedule.context || {}
  const subjectTaxonomySlug = taxonomySlug(context.subjectTaxonomySlug || context.subjectTitle)
  const trackTaxonomySlugs = Array.from(new Set(
    (Array.isArray(context.trackTaxonomySlugs) && context.trackTaxonomySlugs.length
      ? context.trackTaxonomySlugs
      : context.trackTitles || [context.trackTitle]
    ).map(taxonomySlug).filter(Boolean)
  ))
  if (!subjectTaxonomySlug || !trackTaxonomySlugs.length) {
    throw new TypeError('The generated Schedule requires its Subject and Track taxonomy context.')
  }

  return Object.freeze({
    schemaVersion: Math.max(1, Number(schedule.schemaVersion) || 1),
    id,
    name,
    startDate,
    timeZone,
    cadence: schedule.cadence && typeof schedule.cadence === 'object' ? { ...schedule.cadence } : {},
    pacingMode,
    context: Object.freeze({
      ...context,
      subjectTaxonomySlug,
      trackTaxonomySlugs: Object.freeze(trackTaxonomySlugs)
    }),
    sessions: Object.freeze(sessions)
  })
}

function normalizePacingMode(value) {
  const normalized = String(value || 'adaptive').trim().toLowerCase()
  if (!['adaptive', 'static'].includes(normalized)) {
    throw new TypeError('Choose Adaptive or Static Schedule pacing.')
  }
  return normalized
}

export function normalizeCourseScheduleCadence(value = {}) {
  value = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
  if (value.type === 'day_interval') {
    const intervalDays = Number(value.intervalDays)
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      throw new TypeError('The session period must be between 1 and 365 days.')
    }
    return { type: 'day_interval', intervalDays }
  }
  if (
    value.type === 'weekly_frequency'
    || value.type === 'weekly_meeting_pattern'
    || String(value.frequency || '').trim().toLowerCase() === 'weekly'
  ) {
    const weekdays = Array.from(new Set(
      (Array.isArray(value.weekdays) ? value.weekdays : []).map(Number)
    )).sort((left, right) => left - right)
    if (
      !weekdays.length
      && (
        value.type === 'weekly_meeting_pattern'
        || String(value.frequency || '').trim().toLowerCase() === 'weekly'
      )
    ) {
      return { type: 'day_interval', intervalDays: 7 }
    }
    if (
      !weekdays.length
      || weekdays.length > 7
      || weekdays.some((weekday) =>
        !Number.isInteger(weekday) || weekday < 0 || weekday > 6
      )
    ) {
      throw new TypeError('Choose between 1 and 7 different meeting weekdays.')
    }
    return { type: 'weekly_frequency', weekdays }
  }
  if (value == null || Object.keys(value).length === 0) {
    return { type: 'day_interval', intervalDays: 7 }
  }
  throw new TypeError('Choose a supported Schedule cadence.')
}

export function replacementScheduleStartFloor({
  today
} = {}) {
  return dateOnly(today, 'The replacement Schedule date')
}

function normalizeBuilderSession(session = {}, index) {
  const id = requiredText(session.id, `Schedule Session ${index + 1} ID`, 180)
  const title = requiredText(session.title, `Schedule Session ${index + 1} title`, 240)
  const type = String(session.type || 'lesson').trim().toLowerCase()
  scheduleItemKind(type)
  const startDate = dateOnly(session.startDate, `Schedule Session ${index + 1} start date`)
  const endDate = dateOnly(session.endDate || startDate, `Schedule Session ${index + 1} end date`)
  if (endDate < startDate) throw new TypeError(`Schedule Session ${index + 1} has an invalid date range.`)

  const sourceSessionId = optionalText(session.sourceSessionId, 240)
  const sourceContentVersionKey = optionalText(session.sourceContentVersionKey, 300)
  if (type === 'lesson' && (!sourceSessionId || !sourceContentVersionKey)) {
    throw new TypeError(`Curriculum Session “${title}” is missing durable Track source identity.`)
  }

  return Object.freeze({
    id,
    title,
    type,
    startDate,
    endDate,
    sourceSessionId,
    sourceContentVersionKey,
    educationLevelTaxonomySlug: optionalTaxonomySlug(
      session.educationLevelTaxonomySlug || session.educationLevelTitle
    ),
    subjectTaxonomySlug: optionalTaxonomySlug(
      session.subjectTaxonomySlug || session.subjectTitle
    ),
    trackTaxonomySlug: optionalTaxonomySlug(
      session.trackTaxonomySlug || session.trackTitle
    ),
    trackId: optionalText(session.trackId, 240),
    moduleId: optionalText(session.moduleId, 240),
    moduleTitle: optionalText(session.moduleTitle, 180),
    planningHref: safeHref(session.planningHref),
    difficulty: difficulty(session.difficulty),
    resources: Object.freeze(Array.isArray(session.resources) ? session.resources : [])
  })
}

function normalizeCourseContext(course = {}) {
  const subjectSlug = taxonomySlug(course.subjectSlug || course.subject?.slug || course.subjectName)
  const focusSlug = taxonomySlug(course.focusSlug || course.focus?.slug || course.focusName)
  const focusNodeId = requiredUuid(
    course.focusNodeId || course.focus?.id,
    'The Course focus node'
  )
  if (!subjectSlug || !focusSlug) throw new TypeError('The Course taxonomy context is incomplete.')
  return Object.freeze({ subjectSlug, focusSlug, focusNodeId })
}

function normalizeActiveItems(items) {
  if (!Array.isArray(items)) throw new TypeError('The active Schedule item list is invalid.')
  return items
    .map((item, index) => ({
      stableItemKey: requiredText(item.stableItemKey, `Active item ${index + 1} key`, 180),
      title: requiredText(item.title, `Active item ${index + 1} title`, 240),
      kind: scheduleItemKind(item.kind || 'lesson', { allowNormalized: true }),
      curriculumNodeId: item.curriculumNodeId || null,
      scheduledDate: dateOnly(item.scheduledDate, `Active item ${index + 1} date`),
      endDate: dateOnly(item.endDate || item.scheduledDate, `Active item ${index + 1} end date`),
      position: Number.isInteger(Number(item.position)) ? Number(item.position) : index,
      state: ['scheduled', 'dropped', 'requeued'].includes(item.state) ? item.state : 'scheduled',
      ...(item.sourceSnapshot && typeof item.sourceSnapshot === 'object' ? item.sourceSnapshot : {}),
      isStudied: item.isStudied === true,
      isPracticed: item.isPracticed === true,
      isDelivered: item.isDelivered === true
    }))
    .sort((left, right) => left.position - right.position)
}

function assignPublishedPositions(items, builderSessions, { effectiveToday, builderKeys }) {
  const byKey = new Map(items.map((item) => [item.stableItemKey, item]))
  const desired = [
    ...builderSessions.map((session) => byKey.get(session.id)).filter(Boolean),
    ...items.filter((item) => !builderKeys.has(item.stableItemKey))
  ]
  const locked = new Set(
    items
      .filter((item) =>
        item.isStudied
        || item.scheduledDate < effectiveToday
        || item.state === 'dropped'
      )
      .map((item) => item.position)
  )
  let candidatePosition = 0
  const positioned = desired.map((item) => {
    const positionIsLocked = item.isStudied
      || item.scheduledDate < effectiveToday
      || item.state === 'dropped'
    let position = item.position
    if (!positionIsLocked) {
      while (locked.has(candidatePosition)) candidatePosition += 1
      position = candidatePosition
      locked.add(position)
      candidatePosition += 1
    }
    const {
      isStudied: _isStudied,
      isPracticed: _isPracticed,
      isDelivered: _isDelivered,
      ...published
    } = item
    return { ...published, position }
  })
  return positioned.sort((left, right) =>
    left.position - right.position
    || left.stableItemKey.localeCompare(right.stableItemKey)
  )
}

function builderSessionToItem(session, schedule, course, position) {
  const trackIndex = schedule.context.trackIds?.indexOf(session.trackId) ?? -1
  const mappedTrackSlug = trackIndex >= 0
    ? schedule.context.trackTaxonomySlugs[trackIndex]
    : schedule.context.trackTaxonomySlugs[0]
  const kind = scheduleItemKind(session.type)
  const sourceSubjectSlug = session.subjectTaxonomySlug
    || schedule.context.subjectTaxonomySlug
  const sourceTrackSlug = session.trackTaxonomySlug || mappedTrackSlug
  const usesCompatibilityAnchor = sourceSubjectSlug === course.subjectSlug
    && sourceTrackSlug === course.focusSlug

  return {
    stableItemKey: session.id,
    title: session.title,
    kind,
    curriculumNodeId: kind === 'curriculum_topic' && usesCompatibilityAnchor
      ? course.focusNodeId
      : null,
    scheduledDate: session.startDate,
    endDate: session.endDate,
    position,
    state: 'scheduled',
    sourceTrackKey: kind === 'curriculum_topic' ? session.trackId : null,
    sourceModuleKey: kind === 'curriculum_topic' ? session.moduleId : null,
    sourceModuleTitle: kind === 'curriculum_topic' ? session.moduleTitle : null,
    sourceSessionKey: kind === 'curriculum_topic' ? session.sourceSessionId : null,
    sourceSessionId: kind === 'curriculum_topic' ? session.sourceSessionId : null,
    sourceContentVersionKey: kind === 'curriculum_topic' ? session.sourceContentVersionKey : null,
    sourceEducationLevelSlug: kind === 'curriculum_topic'
      ? session.educationLevelTaxonomySlug
      : null,
    sourceSubjectSlug,
    sourceTrackSlug,
    planningHref: kind === 'curriculum_topic' ? session.planningHref : null,
    difficulty: kind === 'curriculum_topic' ? session.difficulty : null,
    resources: kind === 'curriculum_topic' ? session.resources : []
  }
}

function scheduleItemKind(value, { allowNormalized = false } = {}) {
  const type = String(value || '').trim().toLowerCase()
  if (allowNormalized && ['curriculum_topic', 'review', 'exam'].includes(type)) return type
  if (ITEM_TYPES[type]) return ITEM_TYPES[type]
  if (type === 'custom') {
    throw new TypeError('Classify every custom Session as a Review or Assessment before publishing.')
  }
  throw new TypeError(`Unsupported Builder Session type: ${type || 'empty'}.`)
}

function reasonFor(stableItemKey, changeType, reasonCode, studentExplanation) {
  return { stableItemKey, changeType, reasonCode, studentExplanation, privateStaffNote: null }
}

function taxonomySlug(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === 'math' ? 'mathematics' : slug
}

function optionalTaxonomySlug(value) {
  const text = String(value || '').trim()
  return text ? taxonomySlug(text) : ''
}

function difficulty(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['low', 'easy'].includes(normalized)) return 'easy'
  if (['medium', 'intermediate'].includes(normalized)) return 'intermediate'
  if (['high', 'difficult'].includes(normalized)) return 'difficult'
  return ''
}

function dateOnly(value, label) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new TypeError(`${label} must use a valid YYYY-MM-DD date.`)
  }
  return text
}

function dateInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function safeHref(value) {
  const href = String(value || '').trim()
  if (!href) return null
  if (/^(?:https?:\/\/|\.{0,2}\/|\/)/i.test(href)) return href
  throw new TypeError('A planning link must use HTTP(S) or a relative application path.')
}

function requiredText(value, label, maximum) {
  const text = String(value || '').trim()
  if (!text || text.length > maximum) throw new TypeError(`${label} is required.`)
  return text
}

function optionalText(value, maximum) {
  const text = String(value || '').trim()
  if (!text) return null
  if (text.length > maximum) throw new TypeError('A Builder source identifier is too long.')
  return text
}

function boundedText(value, minimum, maximum, label) {
  const text = String(value || '').trim()
  if (text.length < minimum || text.length > maximum) {
    throw new TypeError(`${label} must contain between ${minimum} and ${maximum} characters.`)
  }
  return text
}

function requiredUuid(value, label) {
  const text = String(value || '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new TypeError(`${label} is required.`)
  }
  return text
}
