import { supabase } from '../lib/supabase/supabaseClient.js'
import {
  normalizeStudentCalendarPayload,
  normalizeStudentDashboardPayload
} from '../app/dashboard/student-dashboard-contract.js'
import { normalizeClassroomSpacePayload } from '../app/classroom/classroom-space-contract.js'
import { normalizeStudentClassroomsPayload } from '../app/classroom/student-classrooms-contract.js'

export async function getStudentDashboardData() {
  const { data, error } = await supabase.rpc('get_my_student_dashboard')
  if (error) throw error
  return normalizeStudentDashboardPayload(data)
}

export async function getStudentCalendarData(startDate, endDate) {
  const { data, error } = await supabase.rpc('get_my_student_calendar', {
    p_range_start: startDate,
    p_range_end: endDate
  })
  if (error) throw error
  return normalizeStudentCalendarPayload(data)
}

export async function saveStudentDashboardPreferences(preferences) {
  const { data, error } = await supabase.rpc('save_my_student_dashboard_preferences', {
    p_preferences: preferences
  })
  if (error) throw error
  return normalizeStudentDashboardPayload(data)
}

export async function resetStudentDashboardPreferences() {
  const { data, error } = await supabase.rpc('reset_my_student_dashboard_preferences')
  if (error) throw error
  return normalizeStudentDashboardPayload(data)
}

export async function saveStudentClassroomCardColor(classroomId, colorKey) {
  const { data, error } = await supabase.rpc('save_my_student_classroom_card_color', {
    p_classroom_id: classroomId,
    p_color_key: colorKey
  })
  if (error) throw error
  return normalizeStudentDashboardPayload(data)
}

export async function saveStudentClassroomCardOrder(classroomIds) {
  const { data, error } = await supabase.rpc('save_my_student_classroom_card_order', {
    p_classroom_ids: classroomIds
  })
  if (error) throw error
  return normalizeStudentDashboardPayload(data)
}

export async function getClassroomSpaceData(classroomId) {
  const { data, error } = await supabase.rpc('get_my_classroom_space', {
    p_classroom_id: classroomId
  })
  if (error) throw error
  return normalizeClassroomSpacePayload(data)
}

export async function getStudentClassroomsData() {
  const { data, error } = await supabase.rpc('get_my_student_classrooms')
  if (error) throw error
  return normalizeStudentClassroomsPayload(data)
}

export async function archiveStudentClassroom(classroomId) {
  const { data, error } = await supabase.rpc('archive_my_student_classroom', {
    p_classroom_id: classroomId
  })
  if (error) throw error
  return normalizeStudentClassroomsPayload(data)
}

export async function restoreStudentClassroom(classroomId) {
  const { data, error } = await supabase.rpc('restore_my_student_classroom', {
    p_classroom_id: classroomId
  })
  if (error) throw error
  return normalizeStudentClassroomsPayload(data)
}
