import '../src/data/tracks-data.js'

export const manualQaNetwork = Object.freeze({
  mentor: Object.freeze({
    email: 'al.van.astrea@gmail.com',
    label: 'Aldebarã',
    roles: Object.freeze(['mentor'])
  }),
  tutor: Object.freeze({
    email: 'thiago.loyola@kelptutoring.com',
    label: 'Thiago Kelp',
    roles: Object.freeze(['tutor'])
  }),
  students: Object.freeze([
    Object.freeze({
      email: 'thiago.d.loyola@gmail.com',
      label: 'Thiago D.',
      roles: Object.freeze(['student']),
      trackSlug: 'algebra-1',
      serviceModel: 'recurring'
    }),
    Object.freeze({
      email: 'thiago.dias.loyola@gmail.com',
      label: 'Thiago Dias',
      roles: Object.freeze(['student']),
      trackSlug: 'mechanics',
      serviceModel: 'on_demand'
    })
  ])
})

function nextWeekday(weekday, weekOffset = 0) {
  const value = new Date()
  value.setUTCHours(12, 0, 0, 0)
  let days = (weekday - value.getUTCDay() + 7) % 7
  if (days === 0) days = 7
  value.setUTCDate(value.getUTCDate() + days + weekOffset * 7)
  return value.toISOString().slice(0, 10)
}

function findTrack(subjectSlug, trackSlug) {
  for (const level of globalThis.tracksCatalog?.levels || []) {
    for (const subject of level.subjects || []) {
      if (subject.taxonomySlug !== subjectSlug) continue
      const track = subject.tracks?.find((candidate) =>
        candidate.taxonomySlug === trackSlug
      )
      if (track) return { level, subject, track }
    }
  }
  throw new Error(
    `The generated Track catalogue does not contain ${subjectSlug} · ${trackSlug}.`
  )
}

function stripWeekPrefix(title) {
  return String(title || '').replace(/^Week\s+\d+\s*:\s*/i, '').trim()
}

function trackSessions(source) {
  return source.track.modules.flatMap((module) =>
    module.sessions.map((session) => ({
      ...session,
      moduleId: module.id,
      moduleTitle: module.title
    }))
  )
}

function buildTrackSchedule({
  id,
  name,
  subjectSlug,
  trackSlug,
  weekday,
  sessionCount = 8
}) {
  const source = findTrack(subjectSlug, trackSlug)
  const sessions = trackSessions(source).slice(0, sessionCount)
  if (sessions.length !== sessionCount) {
    throw new Error(
      `${source.track.title} must expose ${sessionCount} canonical Sessions for manual QA.`
    )
  }
  if (sessions.some((session) =>
    !session.sourceSessionId
    || !session.sourceContentVersionKey
    || !session.planningHref
    || !session.moduleId
  )) {
    throw new Error(
      `${source.track.title} contains a manual-QA Session without canonical source identity.`
    )
  }

  return {
    id,
    name,
    timeZone: 'America/Sao_Paulo',
    schemaVersion: 2,
    context: {
      subjectTaxonomySlug: source.subject.taxonomySlug,
      trackId: source.track.id,
      trackIds: [source.track.id],
      trackTaxonomySlugs: [source.track.taxonomySlug]
    },
    sessions: sessions.map((session, index) => ({
      id: `manual_qa_${trackSlug.replace(/-/g, '_')}_${String(index + 1).padStart(2, '0')}`,
      title: stripWeekPrefix(session.title),
      type: 'lesson',
      startDate: nextWeekday(weekday, index),
      endDate: nextWeekday(weekday, index),
      sourceSessionId: session.sourceSessionId,
      sourceContentVersionKey: session.sourceContentVersionKey,
      sourceTrackKey: source.track.id,
      sourceModuleKey: session.moduleId,
      sourceModuleTitle: session.moduleTitle,
      sourceSessionKey: session.sourceSessionId,
      sourceEducationLevelSlug: source.level.taxonomySlug,
      sourceSubjectSlug: source.subject.taxonomySlug,
      sourceTrackSlug: source.track.taxonomySlug,
      educationLevelId: source.level.id,
      educationLevelTitle: source.level.title,
      educationLevelTaxonomySlug: source.level.taxonomySlug,
      subjectTaxonomySlug: source.subject.taxonomySlug,
      trackTaxonomySlug: source.track.taxonomySlug,
      trackId: source.track.id,
      moduleId: session.moduleId,
      moduleTitle: session.moduleTitle,
      planningHref: session.planningHref,
      difficulty: session.difficulty,
      resources: []
    }))
  }
}

export function buildManualQaNetworkSchedules() {
  return Object.freeze({
    algebra: buildTrackSchedule({
      id: 'manual-qa-thiago-d-algebra-v1',
      name: 'Thiago D. · Algebra 1 Track Schedule',
      subjectSlug: 'mathematics',
      trackSlug: 'algebra-1',
      weekday: 2
    }),
    mechanics: buildTrackSchedule({
      id: 'manual-qa-thiago-dias-mechanics-v1',
      name: 'Thiago Dias · Mechanics Track Schedule',
      subjectSlug: 'physics',
      trackSlug: 'mechanics',
      weekday: 4
    })
  })
}
