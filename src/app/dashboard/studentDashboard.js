import { requireAuth, signOutAndRedirect } from '../../auth/authGuard.js'
import { getStudentDashboardData } from '../../data/dashboardData.js'
import { formatDate } from '../../data/demoData.js' // you can keep utility-only helpers for now

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

let calendarYear = new Date().getFullYear()
let calendarMonth = new Date().getMonth()
let currentProfile = null
let currentEvents = []
let currentLinks = []

async function init() {
  const current = await requireAuth(['student', 'admin'])
  if (!current) return

  document.getElementById('student-heading').textContent =
    `${current.profile.full_name.split(' ')[0]}'s workspace`

  renderImportantLinks()
  renderCalendar()
  renderSidePanels(current.profile)
  bindCalendarNavigation()

  document.getElementById('logout-student')?.addEventListener('click', signOutAndRedirect)
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById(button.dataset.close)?.classList.add('hidden')
    })
  })
}

function renderImportantLinks(links) {
  const root = document.getElementById('important-links')
  root.innerHTML = links.length
    ? links.map((link) => `
        <a class="link-chip" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
      `).join('')
    : '<div class="empty-panel-state">No links yet.</div>'
}

function renderSidePanels(profile) {
  document.getElementById('student-profile-summary').innerHTML = `
    <h3>${profile.full_name}</h3>
    <p>${profile.email}</p>
    <p>Birth date: ${profile.birth_date ?? 'Not provided'}</p>
  `

  document.getElementById('tutor-profile-summary').innerHTML = `
    <h3>Tutor profile</h3>
    <p>Not connected yet.</p>
  `

  const assignmentsRoot = document.getElementById('student-assignment-list')
  const events = getStudentEvents()
    .filter((event) => event.type === 'assignment')
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  assignmentsRoot.innerHTML = events.length
    ? events.map((event) => `
      <article class="stack-item">
        <div>
          <strong>${event.title}</strong>
          <p>${formatDate(event.date)}</p>
        </div>
        <a class="text-link" href="assignment-view.html?template=${event.assignmentId}">Open</a>
      </article>
    `).join('')
    : '<div class="empty-panel-state">No upcoming assignments have been added yet.</div>'
}

function renderCalendar(events) {
  const root = document.getElementById('student-calendar-grid')
  const label = document.getElementById('student-calendar-label')
  const summary = document.getElementById('student-calendar-summary')

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
