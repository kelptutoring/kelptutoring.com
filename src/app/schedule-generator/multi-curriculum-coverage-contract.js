export const COURSE_COVERAGE_SCHEMA_VERSION = 1

export const CURRICULUM_PATH_ORDER = Object.freeze([
  'educationLevel',
  'goals',
  'subject',
  'track',
  'module',
  'session'
])

export const COURSE_COVERAGE_POLICY = Object.freeze({
  requiredSchedule: true,
  oneActiveSchedule: true,
  multipleEducationLevelsAllowed: true,
  multipleSubjectsAllowed: true,
  multipleTracksAllowed: true,
  exactlyOnePrimaryTrack: true,
  selectedGoalsOnly: true,
  uniqueCanonicalSessionPerActiveVersion: true,
  repeatedTutoringOccurrenceCreatesCurriculumTarget: false,
  homeworkCreatesTutoringOccurrence: false,
  tutorQualificationRequiredForEveryBranch: true,
  mentorQualificationRequiredForSupervision: false,
  mentorTeachingRequiresQualification: true,
  qualityAssistantTeachingAuthority: false
})

const COVERAGE_ROLES = new Set(['primary', 'supporting'])
const CONTEXT_SCOPES = new Set(['course', 'branch'])
const CUSTOM_ITEM_KINDS = new Set(['review', 'practice', 'exam', 'wrap_up'])

export function createCourseCoverageContract({
  primaryTrackKey,
  branches
} = {}) {
  const normalizedPrimaryTrackKey = requiredText(
    primaryTrackKey,
    'The primary Track key',
    240
  )
  const normalizedBranches = Array.isArray(branches)
    ? branches.map((branch, index) => normalizeCoverageBranch(branch, index))
    : []

  if (!normalizedBranches.length) {
    throw new TypeError('A Course coverage contract requires at least one Track branch.')
  }

  const trackKeys = normalizedBranches.map((branch) => branch.track.key)
  if (new Set(trackKeys).size !== trackKeys.length) {
    throw new TypeError(
      'Each canonical Track may appear only once in a Course coverage contract; combine its selected Goals instead.'
    )
  }
  if (!trackKeys.includes(normalizedPrimaryTrackKey)) {
    throw new TypeError('The primary Track must belong to the selected Course coverage.')
  }

  const branchesWithRoles = normalizedBranches.map((branch) => Object.freeze({
    ...branch,
    role: branch.track.key === normalizedPrimaryTrackKey ? 'primary' : 'supporting'
  }))
  if (branchesWithRoles.filter((branch) => branch.role === 'primary').length !== 1) {
    throw new TypeError('A Course coverage contract requires exactly one primary Track.')
  }

  return Object.freeze({
    schemaVersion: COURSE_COVERAGE_SCHEMA_VERSION,
    primaryTrackKey: normalizedPrimaryTrackKey,
    branches: Object.freeze(branchesWithRoles),
    displayLabel: formatCourseCoverageLabel(branchesWithRoles)
  })
}

export function createCurriculumTargetSnapshot({
  canonicalSessionKey,
  sourceContentVersionKey,
  educationLevel,
  goals = [],
  subject,
  track,
  module,
  session
} = {}) {
  const normalizedSession = normalizeNode(session, 'Session', 320)
  const normalizedCanonicalSessionKey = requiredText(
    canonicalSessionKey || normalizedSession.key,
    'The canonical Session key',
    320
  )
  if (normalizedCanonicalSessionKey !== normalizedSession.key) {
    throw new TypeError('The canonical Session key must match the selected Session identity.')
  }

  return Object.freeze({
    schemaVersion: COURSE_COVERAGE_SCHEMA_VERSION,
    canonicalSessionKey: normalizedCanonicalSessionKey,
    sourceContentVersionKey: requiredText(
      sourceContentVersionKey,
      'The Session content-version key',
      320
    ),
    path: Object.freeze({
      educationLevel: normalizeNode(educationLevel, 'Education level'),
      goals: normalizeGoals(goals),
      subject: normalizeNode(subject, 'Subject'),
      track: normalizeNode(track, 'Track'),
      module: normalizeNode(module, 'Module', 320),
      session: normalizedSession
    })
  })
}

export function assertUniqueActiveCurriculumTargets(targets) {
  if (!Array.isArray(targets)) {
    throw new TypeError('The active curriculum target list is invalid.')
  }
  const keys = targets.map((target, index) => requiredText(
    target?.canonicalSessionKey,
    `Curriculum target ${index + 1} canonical Session key`,
    320
  ))
  if (new Set(keys).size !== keys.length) {
    throw new TypeError(
      'A canonical Curriculum Session may appear only once as an active curriculum target; use a linked Review or Practice item for another tutoring occurrence.'
    )
  }
  return true
}

export function createSupplementalItemContext({
  kind,
  scope,
  trackKey = null,
  canonicalSessionKey = null
} = {}) {
  const normalizedKind = String(kind || '').trim().toLowerCase()
  if (!CUSTOM_ITEM_KINDS.has(normalizedKind)) {
    throw new TypeError(
      'A custom Schedule item must be a Review, Practice, Exam, or wrap-up; curriculum topics must come from a governed Track.'
    )
  }

  const normalizedScope = String(scope || '').trim().toLowerCase()
  if (!CONTEXT_SCOPES.has(normalizedScope)) {
    throw new TypeError('A supplemental Schedule item must use Course-wide or branch-specific context.')
  }

  const normalizedTrackKey = optionalText(trackKey, 240)
  if (normalizedScope === 'branch' && !normalizedTrackKey) {
    throw new TypeError('A branch-specific supplemental item requires its Track identity.')
  }
  if (normalizedScope === 'course' && normalizedTrackKey) {
    throw new TypeError('A Course-wide supplemental item cannot impersonate one Track.')
  }

  return Object.freeze({
    kind: normalizedKind,
    scope: normalizedScope,
    trackKey: normalizedTrackKey,
    canonicalSessionKey: optionalText(canonicalSessionKey, 320)
  })
}

export function formatCourseCoverageLabel(branches) {
  const normalizedBranches = Array.isArray(branches) ? branches : []
  const levels = uniqueOrdered(normalizedBranches.map((branch) => branch.educationLevel.name))
  const goals = uniqueOrdered(normalizedBranches.flatMap(
    (branch) => branch.goals.map((goal) => goal.name)
  ))
  const subjects = uniqueOrdered(normalizedBranches.map((branch) => branch.subject.name))

  return [levels, goals, subjects]
    .filter((values) => values.length)
    .map((values) => values.join(' + '))
    .join(' · ')
}

function normalizeCoverageBranch(branch = {}, index) {
  const educationLevel = normalizeNode(
    branch.educationLevel,
    `Coverage branch ${index + 1} Education level`
  )
  const subject = normalizeNode(branch.subject, `Coverage branch ${index + 1} Subject`)
  const track = normalizeNode(branch.track, `Coverage branch ${index + 1} Track`)
  const goals = normalizeGoals(branch.goals)
  const requestedRole = String(branch.role || '').trim().toLowerCase()
  if (requestedRole && !COVERAGE_ROLES.has(requestedRole)) {
    throw new TypeError(`Coverage branch ${index + 1} has an invalid role.`)
  }

  return Object.freeze({
    educationLevel,
    goals,
    subject,
    track
  })
}

function normalizeGoals(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('Goals must be an array of explicitly selected values beneath the Education level.')
  }
  const goals = values.map((value, index) =>
    normalizeNode(value, `Goal ${index + 1}`)
  )
  const keys = goals.map((goal) => goal.key)
  if (new Set(keys).size !== keys.length) {
    throw new TypeError('A selected Goal cannot be repeated within one Track branch.')
  }
  return Object.freeze(goals)
}

function normalizeNode(value, label, maximum = 240) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(`${label} is required.`)
  }
  return Object.freeze({
    key: requiredText(value.key || value.id, `${label} key`, maximum),
    name: requiredText(value.name || value.title, `${label} name`, maximum),
    slug: taxonomySlug(value.slug || value.name || value.title, `${label} slug`)
  })
}

function taxonomySlug(value, label) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug || slug.length > 180) throw new TypeError(`${label} is required.`)
  return slug
}

function uniqueOrdered(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function requiredText(value, label, maximum) {
  const text = String(value || '').trim()
  if (!text || text.length > maximum) throw new TypeError(`${label} is required.`)
  return text
}

function optionalText(value, maximum) {
  const text = String(value || '').trim()
  if (!text) return null
  if (text.length > maximum) throw new TypeError('A curriculum context identifier is too long.')
  return text
}
