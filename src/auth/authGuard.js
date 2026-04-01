import { supabase } from '../lib/supabase/supabaseClient.js'

export async function requireAuth() {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    window.location.replace('./login.html')
    return null
  }

  return data.user
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut()
  window.location.replace('./login.html')
}
