import { supabase } from '../lib/supabase/supabaseClient.js'
import {
  normalizeStudentCalendarPayload,
  normalizeStudentDashboardPayload
} from '../app/dashboard/student-dashboard-contract.js'
import { normalizeClassroomSpacePayload } from '../app/classroom/classroom-space-contract.js'
import { normalizeClassroomFilesPayload } from '../app/classroom/classroom-files-contract.js'
import {
  normalizeClassroomCurrentScheduleLogPayload,
  normalizeClassroomLearningHistoryPayload,
  normalizeClassroomScheduleAuditPayload
} from '../app/classroom/classroom-history-contract.js'
import {
  normalizeClassroomHomeLayoutPayload
} from '../app/classroom/classroom-home-layout-contract.js'
import {
  normalizeCanonicalClassroomSchedulePayload
} from '../app/classroom/classroom-schedule-contract.js'
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

export async function getStudentClassroomCalendarData(classroomId, startDate, endDate) {
  const { data, error } = await supabase.rpc('get_my_student_classroom_calendar', {
    p_classroom_id: classroomId,
    p_range_start: startDate,
    p_range_end: endDate
  })
  if (error) throw error
  return normalizeStudentCalendarPayload(data)
}

export async function getClassroomCalendarData(classroomId, startDate, endDate) {
  const { data, error } = await supabase.rpc('get_my_classroom_calendar', {
    p_classroom_id: classroomId,
    p_range_start: startDate,
    p_range_end: endDate
  })
  if (error) throw error
  return normalizeStudentCalendarPayload(data)
}

export async function getClassroomHomePreferences(classroomId) {
  const { data, error } = await supabase.rpc('get_my_classroom_home_preferences', {
    p_classroom_id: classroomId
  })
  if (error) throw error
  return normalizeClassroomHomeLayoutPayload(data)
}

export async function saveClassroomHomePreferences(classroomId, preferences) {
  const { data, error } = await supabase.rpc('save_my_classroom_home_preferences', {
    p_classroom_id: classroomId,
    p_preferences: preferences
  })
  if (error) throw error
  return normalizeClassroomHomeLayoutPayload(data)
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

export async function getClassroomFilesData(classroomId) {
  const { data, error } = await supabase.rpc('get_my_classroom_files', {
    p_classroom_id: classroomId
  })
  if (error) throw error
  return normalizeClassroomFilesPayload(data)
}

export async function getClassroomScheduleData(courseId) {
  const { data, error } = await supabase.rpc('get_my_unified_course_schedule', {
    p_course_id: courseId
  })
  if (error) throw error
  return normalizeCanonicalClassroomSchedulePayload(data, courseId)
}

export async function getClassroomLearningHistoryData(courseId) {
  const { data, error } = await supabase.rpc('get_my_course_learning_history', {
    p_course_id: courseId
  })
  if (error) throw error
  return normalizeClassroomLearningHistoryPayload(
    data,
    courseId,
    globalThis.tracksCatalog
  )
}

export async function getClassroomScheduleAuditData(courseId) {
  const { data, error } = await supabase.rpc(
    'get_my_course_schedule_audit_history',
    { p_course_id: courseId }
  )
  if (error) throw error
  return normalizeClassroomScheduleAuditPayload(data, courseId)
}

export async function getClassroomCurrentScheduleLogData(courseId) {
  const { data, error } = await supabase.rpc(
    'get_my_current_course_schedule_log',
    { p_course_id: courseId }
  )
  if (error) throw error
  return normalizeClassroomCurrentScheduleLogPayload(data, courseId)
}

export async function saveClassroomScheduleModuleStyle({
  courseId,
  moduleKey,
  headerColor,
  stripeColor,
  templateName
} = {}) {
  const { error } = await supabase.rpc('save_my_classroom_schedule_module_style', {
    p_course_id: courseId,
    p_module_key: moduleKey,
    p_header_color: headerColor,
    p_stripe_color: stripeColor,
    p_template_name: templateName
  })
  if (error) throw error
  return refreshCanonicalClassroomScheduleAfterSavedChange(courseId)
}

export async function saveClassroomSchedulePdfStyle({
  courseId,
  ruleColor,
  textColor
} = {}) {
  const { error } = await supabase.rpc('save_my_classroom_schedule_pdf_style', {
    p_course_id: courseId,
    p_rule_color: ruleColor,
    p_text_color: textColor
  })
  if (error) throw error
  return refreshCanonicalClassroomScheduleAfterSavedChange(courseId)
}

export async function getCourseScheduleBuilderContext(courseId) {
  const { data, error } = await supabase.rpc('get_my_course_schedule_builder_context', {
    p_course_id: courseId
  })
  if (error) throw error
  return data
}

export async function publishCourseBuilderSchedule({
  courseId,
  expectedVersionId,
  builderSchedule,
  items,
  changeReasons,
  idempotencyKey = `schedule.publish:${crypto.randomUUID()}`
} = {}) {
  const { data, error } = await supabase.rpc('publish_course_builder_schedule', {
    p_course_id: courseId,
    p_expected_version_id: expectedVersionId,
    p_builder_schedule: builderSchedule,
    p_items: items,
    p_change_reasons: changeReasons,
    p_idempotency_key: idempotencyKey
  })
  if (error) throw error
  return data
}

export async function setCourseSchedulePacingMode({
  courseId,
  expectedVersionId,
  pacingMode,
  studentExplanation,
  idempotencyKey = `schedule.pacing:${crypto.randomUUID()}`
} = {}) {
  const { data, error } = await supabase.rpc('set_course_schedule_pacing_mode', {
    p_course_id: courseId,
    p_expected_version_id: expectedVersionId,
    p_pacing_mode: pacingMode,
    p_student_explanation: studentExplanation,
    p_idempotency_key: idempotencyKey
  })
  if (error) throw error
  return data
}

export async function markCourseProgress({
  courseId,
  scheduleItemId,
  resourceId = null,
  progressKind,
  expectedLatestEventId = null,
  reflection = null,
  studentExplanation = null,
  privateStaffNote = null,
  idempotencyKey = `progress.mark:${crypto.randomUUID()}`
} = {}) {
  const { data, error } = await supabase.rpc('record_course_progress', {
    p_course_id: courseId,
    p_schedule_item_id: scheduleItemId,
    p_resource_id: resourceId,
    p_progress_kind: progressKind,
    p_expected_latest_event_id: expectedLatestEventId,
    p_effective_at: null,
    p_reflection: reflection,
    p_student_explanation: studentExplanation,
    p_private_staff_note: privateStaffNote,
    p_idempotency_key: idempotencyKey
  })
  if (error) throw error
  return data
}

export async function reverseMyCourseProgress({
  courseId,
  scheduleItemId,
  resourceId = null,
  progressKind,
  expectedLatestEventId,
  studentExplanation = null,
  privateStaffNote = null,
  idempotencyKey = `progress.reverse:${crypto.randomUUID()}`
} = {}) {
  const { data, error } = await supabase.rpc('reverse_course_progress', {
    p_course_id: courseId,
    p_schedule_item_id: scheduleItemId,
    p_resource_id: resourceId,
    p_progress_kind: progressKind,
    p_expected_latest_event_id: expectedLatestEventId,
    p_effective_at: null,
    p_student_explanation: studentExplanation,
    p_private_staff_note: privateStaffNote,
    p_idempotency_key: idempotencyKey
  })
  if (error) throw error
  return data
}

export async function uploadClassroomFile(classroomId, file, { idempotencyKey } = {}) {
  const key = String(idempotencyKey || createClassroomFileIdempotencyKey()).toLowerCase()
  const { data: reservation, error: reservationError } = await supabase.rpc(
    'reserve_my_classroom_file_upload',
    {
      p_classroom_id: classroomId,
      p_original_file_name: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_idempotency_key: key
    }
  )
  if (reservationError) throw reservationError

  const fileId = String(reservation?.id || '')
  const bucket = String(reservation?.bucket || '')
  const path = String(reservation?.path || '')
  if (!fileId || bucket !== 'classroom-files' || !path) {
    throw new TypeError('The Classroom file reservation was incomplete.')
  }

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false
  })
  if (uploadError) throw uploadError

  let activation = await supabase.rpc('activate_my_classroom_file', { p_file_id: fileId })
  if (activation.error) {
    activation = await supabase.rpc('activate_my_classroom_file', { p_file_id: fileId })
  }
  if (activation.error) throw activation.error
  return getClassroomFilesData(classroomId)
}

export async function getClassroomFileSignedUrl(file, { download = false } = {}) {
  const bucket = String(file?.storage?.bucket || '')
  const path = String(file?.storage?.path || '')
  if (bucket !== 'classroom-files' || !path) {
    throw new TypeError('The Classroom file location is invalid.')
  }
  const options = download ? { download: String(file?.name || 'classroom-file') } : undefined
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60, options)
  if (error) throw error
  const signedUrl = String(data?.signedUrl || '')
  if (!signedUrl) throw new TypeError('A temporary Classroom file link could not be created.')
  return signedUrl
}

export async function withdrawClassroomFile(classroomId, fileId, reason = '') {
  const { error } = await supabase.rpc('withdraw_my_classroom_file', {
    p_file_id: fileId,
    p_reason: reason
  })
  if (error) throw error
  return getClassroomFilesData(classroomId)
}

export async function hideClassroomFile(classroomId, fileId, reason) {
  const { error } = await supabase.rpc('hide_classroom_file', {
    p_file_id: fileId,
    p_reason: reason
  })
  if (error) throw error
  return getClassroomFilesData(classroomId)
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

function createClassroomFileIdempotencyKey() {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `classroom-file-${randomId}`
}

async function refreshCanonicalClassroomScheduleAfterSavedChange(courseId) {
  try {
    return await getClassroomScheduleData(courseId)
  } catch (cause) {
    const error = new Error(
      'Your change was saved, but the latest Schedule could not be loaded.'
    )
    error.name = 'ClassroomScheduleRefreshError'
    error.changeSaved = true
    error.cause = cause
    throw error
  }
}
