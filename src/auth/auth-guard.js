import { supabase } from '../lib/supabase/supabaseClient.js'
import {
  hasAnyRole,
  hasCapabilities,
  hasCapability,
  hasRole,
  normalizeAuthorization,
  normalizeRoleKey
} from './authorization.js'
import { getWorkspacePathByRole } from './workspaces.js'
import { getMyThemePreference } from './theme.js'

const LOGIN_PATH = '/src/app/signUp/login.html'
const PROFILE_COLUMNS = 'id, full_name, email, role, birth_date, location_key, profile_completed_at, created_at, updated_at'

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function normalizeRole(role) {
  return normalizeRoleKey(role)
}

export function getHomePathByRole(role) {
  return getWorkspacePathByRole(role) || LOGIN_PATH
}

export function redirectByRole(role) {
  window.location.replace(getHomePathByRole(role))
}

async function getSessionUser() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    console.warn('Could not read local Supabase session.', sessionError)
  }

  if (sessionData?.session?.user) {
    return sessionData.session.user
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) {
    console.info('No authenticated Supabase user is available.', userError.message)
    return null
  }

  return userData?.user || null
}

function normalizeProfile(profile, user, authorization) {
  const metadata = user?.user_metadata || {}
  const fullName = profile.full_name || metadata.full_name || user?.email || 'Kelp user'
  const email = profile.email || user?.email || ''
  const legacyRole = normalizeRole(profile.role || metadata.role || 'student') || 'student'

  return {
    ...profile,
    rawRole: profile.role || legacyRole,
    full_name: fullName,
    email,
    role: authorization.primaryRole,
    primaryRole: authorization.primaryRole,
    roles: [...authorization.roles],
    capabilities: [...authorization.capabilities]
  }
}

async function getAuthorization(profile, user) {
  const legacyRole = profile?.role || user?.user_metadata?.role || 'student'
  if (typeof supabase.rpc !== 'function') return normalizeAuthorization(null, { legacyRole })

  try {
    const { data, error } = await supabase.rpc('get_my_authorization')
    if (error) {
      console.info('Multi-role authorization is not available yet; using the legacy profile role for this session.', error.message)
      return normalizeAuthorization(null, { legacyRole })
    }
    return normalizeAuthorization(data, { legacyRole })
  } catch (error) {
    console.info('Authorization lookup fell back to the legacy profile role.', error?.message || error)
    return normalizeAuthorization(null, { legacyRole })
  }
}

async function getProfile(user, retries = 4) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle()

    if (!error && profile) {
      return profile
    }

    lastError = error
    if (error) break

    await delay(200 + attempt * 150)
  }

  if (lastError) throw lastError
  return null
}

export async function getCurrentAuthState({ waitForProfile = true } = {}) {
  const user = await getSessionUser()
  if (!user) return null

  const storedProfile = await getProfile(user, waitForProfile ? 4 : 0)
  if (!storedProfile) {
    console.warn(`Authenticated user does not have a profile row yet. User id: ${user.id}`)
    return null
  }

  const [authorization, preferences] = await Promise.all([
    getAuthorization(storedProfile, user),
    getMyThemePreference(supabase, user.id)
  ])
  const profile = normalizeProfile(storedProfile, user, authorization)
  return {
    user,
    profile,
    preferences,
    authorization,
    primaryRole: authorization.primaryRole,
    roles: [...authorization.roles],
    capabilities: [...authorization.capabilities],
    hasRole: (role) => hasRole(authorization, role),
    can: (capability) => hasCapability(authorization, capability),
    canAll: (capabilities) => hasCapabilities(authorization, capabilities),
    canAny: (capabilities) => hasCapabilities(authorization, capabilities, { requireAll: false })
  }
}

export async function requireAuth(allowedRoles = []) {
  const current = await getCurrentAuthState()

  if (!current) {
    window.location.replace(LOGIN_PATH)
    return null
  }

  if (!hasAnyRole(current.authorization, allowedRoles)) {
    console.info(`Redirecting ${current.primaryRole} away from a restricted page.`)
    redirectByRole(current.primaryRole)
    return null
  }

  return current
}

export async function requireCapability(requiredCapabilities = [], { requireAll = true } = {}) {
  const current = await getCurrentAuthState()
  if (!current) {
    window.location.replace(LOGIN_PATH)
    return null
  }

  const required = Array.isArray(requiredCapabilities) ? requiredCapabilities : [requiredCapabilities]
  if (!hasCapabilities(current.authorization, required, { requireAll })) {
    console.info(`Redirecting ${current.primaryRole} away from a capability-protected page.`)
    redirectByRole(current.primaryRole)
    return null
  }

  return current
}

export async function redirectLoggedUser() {
  const current = await getCurrentAuthState()
  if (!current) return null

  redirectByRole(current.primaryRole)
  return current
}

export async function redirectLoggedUserAwayFromAuthPage() {
  const current = await getCurrentAuthState({ waitForProfile: false })
  if (!current) return null

  redirectByRole(current.primaryRole)
  return current
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut()
  window.location.replace(LOGIN_PATH)
}
