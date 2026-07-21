export const AUTHORIZATION_CONTRACT_VERSION = 1

export const SYSTEM_ROLES = Object.freeze([
  'student',
  'tutor',
  'teacher',
  'mentor',
  'admin'
])

export const LEGACY_ROLE_CAPABILITIES = Object.freeze({
  student: Object.freeze([
    'workspace.student',
    'practice.attempt',
    'practice.results.view_own'
  ]),
  tutor: Object.freeze([
    'workspace.tutor',
    'exam.create',
    'exam.submit_review',
    'form.create',
    'form.submit_review'
  ]),
  teacher: Object.freeze([
    'workspace.teacher',
    'exam.create',
    'exam.submit_review',
    'form.create',
    'form.submit_review'
  ]),
  mentor: Object.freeze([
    'workspace.mentor',
    'exam.create',
    'exam.submit_review',
    'exam.review',
    'exam.publish',
    'form.create',
    'form.submit_review',
    'form.review',
    'form.publish',
    'course.create',
    'course.publish',
    'question_bank.read',
    'course.compose',
    'course.assign',
    'taxonomy.propose'
  ]),
  admin: Object.freeze([
    'workspace.admin',
    'exam.create',
    'exam.submit_review',
    'exam.review',
    'exam.publish',
    'form.create',
    'form.submit_review',
    'form.review',
    'form.publish',
    'course.create',
    'course.publish',
    'question_bank.read',
    'course.compose',
    'course.assign',
    'taxonomy.propose',
    'taxonomy.manage',
    'credentials.review',
    'authorization.manage'
  ])
})

const KEY_PATTERN = /^[a-z][a-z0-9._-]{0,95}$/

function uniqueKeys(values, normalizer) {
  const output = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizer(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }
  return output
}

export function normalizeRoleKey(value) {
  const key = String(value || '').trim().toLowerCase()
  if (!KEY_PATTERN.test(key)) return ''
  if (key === 'administrator') return 'admin'
  return key
}

export function normalizeCapabilityKey(value) {
  const key = String(value || '').trim().toLowerCase()
  return KEY_PATTERN.test(key) ? key : ''
}

export function capabilitiesForLegacyRoles(roles) {
  return uniqueKeys(
    uniqueKeys(roles, normalizeRoleKey)
      .flatMap((role) => LEGACY_ROLE_CAPABILITIES[role] || []),
    normalizeCapabilityKey
  )
}

export function normalizeAuthorization(payload, { legacyRole = 'student' } = {}) {
  const hasPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
  const fallbackRole = normalizeRoleKey(legacyRole) || 'student'
  const roles = uniqueKeys(hasPayload ? payload.roles : [], normalizeRoleKey)
  if (!roles.length) roles.push(fallbackRole)

  const requestedPrimaryRole = normalizeRoleKey(
    hasPayload ? (payload.primaryRole || payload.primary_role) : fallbackRole
  )
  const primaryRole = roles.includes(requestedPrimaryRole) ? requestedPrimaryRole : roles[0]
  const suppliedCapabilities = uniqueKeys(
    hasPayload ? payload.capabilities : [],
    normalizeCapabilityKey
  )
  const capabilities = hasPayload && Array.isArray(payload.capabilities)
    ? suppliedCapabilities
    : capabilitiesForLegacyRoles(roles)

  return Object.freeze({
    version: Number(hasPayload ? payload.version : AUTHORIZATION_CONTRACT_VERSION) || AUTHORIZATION_CONTRACT_VERSION,
    primaryRole,
    roles: Object.freeze([...roles]),
    capabilities: Object.freeze([...capabilities]),
    source: hasPayload ? 'database' : 'legacy-profile'
  })
}

export function hasRole(authorization, role) {
  const normalized = normalizeRoleKey(role)
  return Boolean(normalized && authorization?.roles?.includes(normalized))
}

export function hasAnyRole(authorization, roles) {
  const requested = uniqueKeys(roles, normalizeRoleKey)
  return requested.length === 0 || requested.some((role) => hasRole(authorization, role))
}

export function hasCapability(authorization, capability) {
  const normalized = normalizeCapabilityKey(capability)
  return Boolean(normalized && authorization?.capabilities?.includes(normalized))
}

export function hasCapabilities(authorization, capabilities, { requireAll = true } = {}) {
  const requested = uniqueKeys(capabilities, normalizeCapabilityKey)
  if (!requested.length) return true
  return requireAll
    ? requested.every((capability) => hasCapability(authorization, capability))
    : requested.some((capability) => hasCapability(authorization, capability))
}
