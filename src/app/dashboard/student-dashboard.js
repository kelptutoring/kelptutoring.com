import { requireAuth, signOutAndRedirect } from '../../auth/auth-guard.js'
import { getStudentDashboardData } from '../../data/studentData.js'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

let calendarYear = new Date().getFullYear()
let calendarMonth = new Date().getMonth()
let currentEvents = []
let currentLinks = []

init().catch((error) => {
  console.error('Student dashboard failed:', error)
})

async function init() {
  const current = await requireAuth(['student', 'admin'])
  if (!current) return

  renderProfileHeader(current.profile)

  const dashboardData = await loadDashboardData(current.user.id)
  currentLinks = dashboardData.links
  currentEvents = dashboardData.events

  renderImportantLinks(currentLinks)
  renderCalendar(currentEvents)
  bindCalendarNavigation()

  document.getElementById('logout-student')?.addEventListener('click', signOutAndRedirect)
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById(button.dataset.close)?.classList.add('hidden'))
  })
}

async function loadDashboardData(userId) {
  try {
    return await getStudentDashboardData(userId)
  } catch (error) {
    console.info('Student dashboard tables are not ready yet. Showing the profile-backed shell.', error)
    return { links: [], events: [] }
  }
}

function renderProfileHeader(profile) {
  const firstName = getFirstName(profile)
  const heading = document.getElementById('student-heading')
  const profileLine = document.getElementById('student-profile-line')

  if (heading) heading.textContent = `${firstName}'s workspace`
  if (profileLine) {
    profileLine.textContent = profile.email
      ? `${profile.email} - ${profile.role}`
      : profile.role
  }
}

function getFirstName(profile) {
  return String(profile.full_name || profile.email || 'Student').trim().split(/\s+/)[0]
}

function renderImportantLinks(links) {
  const root = document.getElementById('important-links')
  if (!root) return

  root.innerHTML = links.length
    ? links.map((link) => `
        <a class="link-chip" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
      `).join('')
    : '<div class="empty-panel-state">No links yet.</div>'
}

function bindCalendarNavigation() {
  document.getElementById('student-calendar-prev')?.addEventListener('click', () => shiftMonth(-1))
  document.getElementById('student-calendar-next')?.addEventListener('click', () => shiftMonth(1))
}

function shiftMonth(delta) {
  calendarMonth += delta
  if (calendarMonth < 0) {
    calendarMonth = 11
    calendarYear -= 1
  }
  if (calendarMonth > 11) {
    calendarMonth = 0
    calendarYear += 1
  }
  renderCalendar(currentEvents)
}

function renderCalendar(events) {
  const root = document.getElementById('student-calendar-grid')
  const label = document.getElementById('student-calendar-label')
  const summary = document.getElementById('student-calendar-summary')
  if (!root || !label || !summary) return

  const year = calendarYear
  const month = calendarMonth
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = firstDay.getDay()

  label.textContent = `${MONTH_NAMES[month]} ${year}`

  const monthEvents = events.filter((event) => {
    const date = new Date(event.date)
    return date.getFullYear() === year && date.getMonth() === month
  })

  summary.textContent = monthEvents.length
    ? `${monthEvents.length} scheduled items this month.`
    : 'No classes or due dates in this month yet.'

  let html = DAY_NAMES.map((day) => `<div class="month-heading">${day}</div>`).join('')
  for (let i = 0; i < startOffset; i += 1) html += '<div class="month-day muted"></div>'

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayEvents = events.filter((event) => {
      const date = new Date(event.date)
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    })

    html += `
      <article class="month-day ${dayEvents.length ? 'has-events' : ''}">
        <div class="month-day-number">${day}</div>
        <div class="month-event-list">
          ${dayEvents.length
            ? dayEvents.map((event) => `<button class="calendar-pill ${event.type}">${event.title}</button>`).join('')
            : '<div class="calendar-empty-note">No items</div>'}
        </div>
      </article>
    `
  }

  root.innerHTML = html
}
