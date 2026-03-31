import { supabase } from '../lib/supabase/supabaseClient.js';

export async function requireAuth(allowedRoles = []) {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    window.location.href = 'src/app/login/login.html';
    return null;
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', session.user.id)
    .maybeSingle();

  const role = (profileData?.role || 'student').toLowerCase();
  const fullName = profileData?.full_name || session.user.email?.split('@')[0] || 'Kelp user';
  const current = { session, user: session.user, role, fullName, email: profileData?.email || session.user.email || '' };

  if (allowedRoles.length && !allowedRoles.includes(role)) {
    if (role === 'teacher' || role === 'tutor' || role === 'mentor' || role === 'admin') {
      window.location.href = 'tutor-dashboard.html';
    } else {
      window.location.href = 'student-dashboard.html';
    }
    return null;
  }

  return current;
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut();
  window.location.href = 'src/app/login/login.html';
}
