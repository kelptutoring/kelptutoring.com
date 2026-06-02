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
  window.location.replace(getHomePathByRole(role))
}

export async function requireAuth(allowedRoles = []) {
  const { data: authData, error: authError } = await supabase.auth.getUser()

  console.log("AUTH DATA:", authData)
  console.log("AUTH ERROR:", authError)

  if (authError || !authData?.user) {
    console.error("Usuário não autenticado:", authError)

    window.location.replace(LOGIN_PATH)
    return null
  }

  const user = authData.user

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, birth_date')
    .eq('id', user.id)
    .maybeSingle()

  console.log("USER ID:", user.id)
  console.log("PROFILE:", profile)
  console.log("PROFILE ERROR:", profileError)

  if (profileError) {
    alert(JSON.stringify(profileError, null, 2))
    return null
  }

  if (!profile) {
    alert(`Usuário autenticado, mas sem profile na tabela profiles. User id: ${user.id}`)
    return null
  }

  if (allowedRoles.length && !allowedRoles.includes(profile.role)) {
    redirectByRole(profile.role)
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
