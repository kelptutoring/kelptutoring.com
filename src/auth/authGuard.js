import { supabase } from '../lib/supabase/supabaseClient.js'

export async function requireAuth(allowedRoles = []) {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    window.location.replace('../app/login/login.html')
    return null
  }

  const user = data.user

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
