import { supabase } from '../lib/supabase/supabaseClient.js'

const LOGIN_PATH = '/src/app/signUp/login.html'
const PROFILE_COLUMNS = 'id, full_name, email, role, birth_date'

const ROLE_HOME = {
  student: '/src/app/dashboard/student-dashboard.html',
  tutor: '/src/app/dashboard/tutor-dashboard.html',
  teacher: '/src/app/dashboard/tutor-dashboard.html',
  mentor: '/src/app/dashboard/tutor-dashboard.html',
  admin: '/src/app/dashboard/tutor-dashboard.html'
}

const ROLE_ALIASES = {
  student: 'student',
  tutor: 'tutor',
  teacher: 'tutor',
  mentor: 'tutor',
  admin: 'admin'
}

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function normalizeRole(role) {
  const key = String(role || '').trim().toLowerCase()
  return ROLE_ALIASES[key] || key
}

export function getHomePathByRole(role) {
  const normalizedRole = normalizeRole(role)
  return ROLE_HOME[normalizedRole] || ROLE_HOME[role] || LOGIN_PATH
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

function normalizeProfile(profile, user) {
  const metadata = user?.user_metadata || {}
  const fullName = profile.full_name || metadata.full_name || user?.email || 'Kelp user'
  const email = profile.email || user?.email || ''
  const role = normalizeRole(profile.role || metadata.role || 'student')

  return {
    ...profile,
    rawRole: profile.role,
    full_name: fullName,
    email,
    role
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
      return normalizeProfile(profile, user)
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

  const profile = await getProfile(user, waitForProfile ? 4 : 0)
  if (!profile) {
    console.warn(`Authenticated user does not have a profile row yet. User id: ${user.id}`)
    return null
  }

  return { user, profile }
}

export async function requireAuth(allowedRoles = []) {
  const current = await getCurrentAuthState()

  if (!current) {
    window.location.replace(LOGIN_PATH)
    return null
  }

  const allowed = allowedRoles.map(normalizeRole)

  if (allowed.length && !allowed.includes(current.profile.role)) {
    console.info(`Redirecting ${current.profile.role} away from a restricted page.`)
    redirectByRole(current.profile.role)
    return null
  }

  return current
}

export async function redirectLoggedUser() {
  const current = await getCurrentAuthState()
  if (!current) return null

  redirectByRole(current.profile.role)
  return current
}

export async function redirectLoggedUserAwayFromAuthPage() {
  const current = await getCurrentAuthState({ waitForProfile: false })
  if (!current) return null

  redirectByRole(current.profile.role)
  return current
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut()
  window.location.replace(LOGIN_PATH)
}
