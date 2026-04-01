import { supabase } from '../lib/supabase/supabaseClient.js'

export async function requireAuth(allowedRoles = []) {
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    window.location.replace('../app/login/login.html')
    return null
  }

  const user = authData.user

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, birth_date')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    window.location.replace('../app/login/login.html')
    return null
  }

  if (allowedRoles.length && !allowedRoles.includes(profile.role)) {
    window.location.replace('../app/login/login.html')
    return null
  }

  return { user, profile }
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut()
  window.location.replace('../app/login/login.html')
}
