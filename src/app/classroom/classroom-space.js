import { requireAuth } from '../../auth/auth-guard.js'
import { getClassroomSpaceData } from '../../data/studentData.js'

const elements = {}

init().catch((error) => {
  console.error('Classroom space failed:', error)
  showError(error?.message || 'This Classroom could not be opened.')
})

async function init() {
  const current = await requireAuth(['student', 'teacher', 'tutor', 'mentor'])
  if (!current) return
  collectElements()
  const classroomId = classroomIdFromLocation()
  const classroom = await getClassroomSpaceData(classroomId)
  renderClassroom(classroom)
  elements.root.setAttribute('aria-busy', 'false')
}

function collectElements() {
  const ids = [
    'classroom-space', 'classroom-space-error', 'classroom-space-back',
    'classroom-space-read-only',
    'classroom-space-subject', 'classroom-space-title', 'classroom-space-tutor', 'classroom-space-status',
    'classroom-detail-subject', 'classroom-detail-focus', 'classroom-detail-tutor',
    'classroom-detail-dates', 'classroom-detail-model'
  ]
  ids.forEach((id) => { elements[toCamelCase(id)] = document.getElementById(id) })
  elements.root = elements.classroomSpace
  elements.error = elements.classroomSpaceError
}

function classroomIdFromLocation() {
  const classroomId = new URL(window.location.href).searchParams.get('classroom') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classroomId)) {
    throw new TypeError('A valid Classroom link is required.')
  }
  return classroomId
}

function renderClassroom(classroom) {
  document.title = `${classroom.course.title} Classroom - Kelp`
  elements.classroomSpaceSubject.textContent = classroom.focus.name
    ? `${classroom.subject.name} · ${classroom.focus.name}`
    : classroom.subject.name
  elements.classroomSpaceTitle.textContent = classroom.course.title
  elements.classroomSpaceTutor.textContent = `Tutor: ${classroom.tutor.name}`
  elements.classroomSpaceStatus.textContent = classroomStatusLabel(classroom)
  elements.classroomSpaceStatus.dataset.status = classroom.course.status
  elements.classroomDetailSubject.textContent = classroom.subject.name
  elements.classroomDetailFocus.textContent = classroom.focus.name || 'Course-wide'
  elements.classroomDetailTutor.textContent = classroom.tutor.name
  elements.classroomDetailDates.textContent = describeCourseDates(
    classroom.course.startDate,
    classroom.course.scheduledEndDate
  )
  elements.classroomDetailModel.textContent = titleCase(classroom.course.serviceModel.replaceAll('_', ' '))
  const back = backDestination(classroom)
  elements.classroomSpaceBack.href = back.href
  elements.classroomSpaceBack.textContent = back.label
  elements.classroomSpaceReadOnly.classList.toggle('is-hidden', !classroom.classroom.readOnly)
  elements.root.dataset.accessMode = classroom.viewer.accessMode
}

function showError(message) {
  if (!elements.error) collectElements()
  elements.root?.setAttribute('aria-busy', 'false')
  elements.error.textContent = message
  elements.error.classList.remove('is-hidden')
}

function describeCourseDates(startDate, endDate) {
  if (!startDate || !endDate) return 'Schedule not available'
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`))
}

function backDestination(classroom) {
  if (classroom.viewer.membershipRole === 'student') {
    if (classroom.classroom.readOnly) {
      return {
        href: `./student-classrooms.html#${classroom.viewer.personalArchived ? 'archived' : 'former'}`,
        label: 'Classrooms'
      }
    }
    return { href: '../dashboard/student-dashboard.html', label: 'Dashboard' }
  }
  if (classroom.viewer.membershipRole === 'mentor') {
    return { href: '../dashboard/mentor-dashboard.html', label: 'Dashboard' }
  }
  return { href: '../dashboard/tutor-dashboard.html', label: 'Dashboard' }
}

function classroomStatusLabel(classroom) {
  if (classroom.viewer.personalArchived) return 'Archived'
  if (classroom.course.status === 'wind_down') return 'Ending soon'
  if (classroom.classroom.readOnly) return 'Former'
  return titleCase(classroom.classroom.status)
}

function titleCase(value) {
  return String(value || '').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}
