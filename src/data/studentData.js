import { supabase } from '../lib/supabase/supabaseClient.js'

export async function getStudentDashboardData(userId) {
  const [
    { data: links, error: linksError },
    { data: events, error: eventsError }
  ] = await Promise.all([
    supabase
      .from('important_links')
      .select('id, label, url')
      .eq('student_id', userId),

    supabase
      .from('student_events')
      .select('id, title, type, date, notes, assignment_id')
      .eq('student_id', userId)
      .order('date', { ascending: true })
  ])

  if (linksError) throw linksError
  if (eventsError) throw eventsError

  return {
    links: links ?? [],
    events: events ?? []
  }
}
