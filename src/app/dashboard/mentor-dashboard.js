import { requireAuth, signOutAndRedirect } from '../../auth/auth-guard.js'
import { getMyLearningRelationships } from '../../data/relationshipData.js'
import { mountWorkspaceSwitcher, renderDashboardIdentity } from './workspace-switcher.js'

init().catch((error) => {
  console.error('Mentor dashboard failed:', error)
})

async function init() {
  const current = await requireAuth(['mentor'])
  if (!current) return

  renderDashboardIdentity(current, {
    activeRole: 'mentor',
    headingId: 'mentor-heading',
    profileLineId: 'mentor-profile-line',
    roleListId: 'mentor-role-list',
    fallbackName: 'Mentor'
  })
  mountWorkspaceSwitcher(current, { activeRole: 'mentor' })
  applyCapabilityState(current)
  await loadSupervisedCourses(current)
  document.getElementById('logout-mentor')?.addEventListener('click', signOutAndRedirect)
}

async function loadSupervisedCourses(current) {
  const status = document.getElementById('mentor-roster-status')
  const grid = document.getElementById('mentor-course-grid')
  const count = document.getElementById('mentor-roster-count')
  if (!status || !grid || !count) return

  try {
    const relationships = await getMyLearningRelationships()
    const courses = relationships.courses.filter((course) => course?.mentor?.id === current.user.id)
    renderSupervisedCourses(courses, { status, grid, count })
  } catch (error) {
    console.error('Mentor relationship roster failed:', error)
    count.textContent = 'Unavailable'
    status.textContent = error?.message || 'Your supervised Courses could not be loaded.'
    status.classList.add('is-error')
  }
}

function renderSupervisedCourses(courses, { status, grid, count }) {
  const activeCourses = courses.filter((course) => ['active', 'wind_down'].includes(course?.status))
  count.textContent = `${activeCourses.length} ${activeCourses.length === 1 ? 'Course' : 'Courses'}`
  status.classList.remove('is-error')
  grid.replaceChildren()

  if (!activeCourses.length) {
    status.textContent = 'No active supervised Courses are assigned to this Mentor yet.'
    return
  }

  status.textContent = ''
  for (const course of activeCourses) grid.append(createCourseCard(course))
}

function createCourseCard(course) {
  const card = document.createElement('article')
  card.className = 'mentor-course-card'

  const top = document.createElement('div')
  top.className = 'mentor-course-card-top'
  const label = document.createElement('span')
  label.className = 'workspace-action-status is-ready'
  label.textContent = course.status === 'wind_down' ? 'Wind-down' : 'Active'
  const serviceModel = document.createElement('span')
  serviceModel.className = 'mentor-course-service-model'
  serviceModel.textContent = formatServiceModel(course.serviceModel)
  top.append(label, serviceModel)

  const title = document.createElement('h3')
  title.textContent = course.title || 'Untitled Course'

  const subject = document.createElement('p')
  subject.className = 'mentor-course-subject'
  subject.textContent = [course?.subject?.name, course?.focus?.name].filter(Boolean).join(' · ') || 'Curriculum not assigned'

  const people = document.createElement('dl')
  people.className = 'mentor-course-people'
  appendDetail(people, 'Student', course?.student?.name || 'Student')
  appendDetail(people, 'Tutor', course?.tutor?.name || 'Tutor')
  appendDetail(people, 'Schedule', formatDateRange(course.startDate, course.scheduledEndDate))

  card.append(top, title, subject, people)

  if (course?.classroom?.id && course.classroom.status === 'active') {
    const link = document.createElement('a')
    link.className = 'mentor-course-open'
    link.href = `../classroom/classroom-space.html?classroom=${encodeURIComponent(course.classroom.id)}`
    link.textContent = 'Open Classroom'
    card.append(link)
  } else {
    const unavailable = document.createElement('span')
    unavailable.className = 'mentor-course-unavailable'
    unavailable.textContent = 'Classroom is not active'
    card.append(unavailable)
  }

  return card
}

function appendDetail(list, term, description) {
  const row = document.createElement('div')
  const label = document.createElement('dt')
  const value = document.createElement('dd')
  label.textContent = term
  value.textContent = description
  row.append(label, value)
  list.append(row)
}

function formatServiceModel(value) {
  const labels = {
    recurring: 'Recurring',
    on_demand: 'On demand',
    access_only: 'Access only',
    independent_tutor: 'Independent Tutor'
  }
  return labels[value] || 'Course'
}

function formatDateRange(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const format = (value) => {
    const date = new Date(`${value || ''}T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? 'Not set' : formatter.format(date)
  }
  return `${format(startDate)} – ${format(endDate)}`
}

function applyCapabilityState(current) {
  const canReview = current.can('exam.review')
  const status = document.getElementById('mentor-review-status')
  if (status) status.textContent = canReview ? 'Exam review available' : 'Review access unavailable'

  document.querySelectorAll('[data-requires-capability]').forEach((element) => {
    const allowed = current.can(element.dataset.requiresCapability)
    element.classList.toggle('is-capability-disabled', !allowed)
    if (!allowed && element.matches('a')) {
      element.removeAttribute('href')
      element.setAttribute('aria-disabled', 'true')
    }
  })
}
