import { supabase } from '../lib/supabase/supabaseClient.js'

const LOGIN_PATH = '/src/app/signUp/login.html'

const ROLE_HOME = {
  student: '/src/app/dashboard/student-dashboard.html',
  teacher: '/src/app/dashboard/tutor-dashboard.html',
  admin: '/src/app/dashboard/admin-dashboard.html'
}

export function getHomePathByRole(role) {
  return ROLE_HOME[role] || LOGIN_PATH
}

export function redirectByRole(role) {
  alert("role");
  window.location.replace(getHomePathByRole(role))
}

export async function requireAuth(allowedRoles = []) {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  alert("auth 1");
  if (authError || !authData?.user) {
    window.location.replace(LOGIN_PATH)
    alert("auth 2");
    alert(authError, authData.user);
    return null
  }

  const user = authData.user

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, birth_date')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    window.location.replace(LOGIN_PATH)
    alert("auth 3");
    alert(profileError, profile);
    return null
  }

  if (allowedRoles.length && !allowedRoles.includes(profile.role)) {
    redirectByRole(profile.role)
    alert("auth 4");
    return null
  }

  return { user, profile }
}

export async function redirectLoggedUser() {
  const current = await requireAuth()
  alert("tá logado");

  if (!current) return

  redirectByRole(current.profile.role)
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut()
  window.location.replace(LOGIN_PATH)
}
