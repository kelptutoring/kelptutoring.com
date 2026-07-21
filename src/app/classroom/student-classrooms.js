import { requireAuth, signOutAndRedirect } from '../../auth/auth-guard.js'
import {
  archiveStudentClassroom,
  getStudentClassroomsData,
  restoreStudentClassroom
} from '../../data/studentData.js'
import { bindStudentNavigation } from '../dashboard/student-navigation.js'
import { mountWorkspaceSwitcher } from '../dashboard/workspace-switcher.js'
import { normalizeStudentClassroomCollection } from './student-classrooms-contract.js'

const COLLECTION_COPY = Object.freeze({
  active: {
    kicker: 'Current Courses',
    title: 'Active Classrooms',
    copy: 'These Classrooms stay visible while their Courses remain active.',
    emptyTitle: 'No active Classrooms yet',
    emptyCopy: 'A Classroom appears here after a Mentor activates your Course relationship.'
  },
  former: {
    kicker: 'Completed Courses',
    title: 'Former Classrooms',
    copy: 'Former Classrooms stay readable and can be moved to your personal archive.',
    emptyTitle: 'No former Classrooms',
    emptyCopy: 'Completed and cancelled Course spaces will appear here before you archive them.'
  },
  archived: {
    kicker: 'Personal archive',
    title: 'Archived Classrooms',
    copy: 'Archiving only changes your view. The retained Classroom remains readable.',
    emptyTitle: 'Your archive is empty',
    emptyCopy: 'You can archive a former Classroom whenever you no longer need it close at hand.'
  }
})

const state = {
  payload: null,
  collection: collectionFromLocation(),
  pendingClassroomId: ''
}

const elements = {}

init().catch((error) => {
  console.error('Student Classrooms failed:', error)
  showFatal(error?.message || 'Your Classrooms could not be loaded.')
})

async function init() {
  const current = await requireAuth(['student'])
  if (!current) return

  collectElements()
  bindStudentNavigation()
  mountWorkspaceSwitcher(current, { activeRole: 'student' })
  elements.logout?.addEventListener('click', signOutAndRedirect)
  elements.tabs.addEventListener('click', handleTabClick)
  elements.tabs.addEventListener('keydown', handleTabKeydown)
  elements.panel.addEventListener('click', handleCollectionAction)
  window.addEventListener('hashchange', handleHashChange)

  state.payload = await getStudentClassroomsData()
  render()
  elements.root.setAttribute('aria-busy', 'false')
}

function collectElements() {
  elements.root = document.getElementById('student-classrooms')
  elements.error = document.getElementById('student-classrooms-error')
  elements.introduction = document.getElementById('student-classrooms-introduction')
  elements.tabs = document.querySelector('.student-classrooms-tabs')
  elements.kicker = document.getElementById('student-classrooms-collection-kicker')
  elements.title = document.getElementById('student-classrooms-collection-title')
  elements.copy = document.getElementById('student-classrooms-collection-copy')
  elements.arrangeLink = document.getElementById('student-classrooms-arrange-link')
  elements.panel = document.getElementById('student-classrooms-panel')
  elements.logout = document.getElementById('logout-student')
}

function render() {
  renderCounts()
  renderTabs()
  renderCollection()
  const firstName = String(state.payload?.viewer?.name || 'Student').trim().split(/\s+/)[0]
  elements.introduction.textContent = `${firstName}, open an active Course or revisit a completed Classroom.`
}

function renderCounts() {
  document.querySelectorAll('[data-classroom-count]').forEach((count) => {
    count.textContent = String(state.payload?.collections?.[count.dataset.classroomCount]?.length || 0)
  })
}

function renderTabs() {
  document.querySelectorAll('[data-classroom-collection]').forEach((button) => {
    const selected = button.dataset.classroomCollection === state.collection
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
  })
  elements.panel.setAttribute('aria-labelledby', `classrooms-tab-${state.collection}`)
}

function renderCollection() {
  const copy = COLLECTION_COPY[state.collection]
  const classrooms = state.payload?.collections?.[state.collection] || []
  elements.kicker.textContent = copy.kicker
  elements.title.textContent = copy.title
  elements.copy.textContent = copy.copy
  elements.arrangeLink.classList.toggle('is-hidden', state.collection !== 'active')
  elements.panel.replaceChildren()

  if (!classrooms.length) {
    const empty = document.createElement('div')
    empty.className = 'student-classrooms-empty'
    const title = document.createElement('strong')
    title.textContent = copy.emptyTitle
    const message = document.createElement('p')
    message.textContent = copy.emptyCopy
    empty.append(title, message)
    elements.panel.append(empty)
    return
  }

  classrooms.forEach((classroom) => elements.panel.append(createClassroomCard(classroom)))
}

function createClassroomCard(item) {
  const card = document.createElement('article')
  card.className = 'student-classrooms-card'
  card.dataset.cardColor = item.card.colorKey
  card.dataset.classroomId = item.classroom.id
  card.dataset.accessMode = item.classroom.accessMode

  const stateRow = document.createElement('div')
  stateRow.className = 'student-classrooms-card-state-row'
  const status = document.createElement('span')
  status.className = 'student-classrooms-card-status'
  status.dataset.presentationState = item.card.presentationState
  status.textContent = presentationLabel(item.card.presentationState)
  stateRow.append(status)
  if (item.classroom.accessMode === 'read_only') {
    const readOnly = document.createElement('span')
    readOnly.className = 'student-classrooms-read-only'
    readOnly.textContent = 'Read-only'
    stateRow.append(readOnly)
  }

  const content = document.createElement('a')
  content.className = 'student-classrooms-card-link'
  content.href = classroomUrl(item.classroom.id)
  content.setAttribute('aria-label', `Open ${item.courseTitle} Classroom${item.classroom.accessMode === 'read_only' ? ' in read-only mode' : ''}`)
  const eyebrow = document.createElement('p')
  eyebrow.className = 'page-kicker'
  eyebrow.textContent = `${item.subject.name}${item.focus.name ? ` · ${item.focus.name}` : ''}`
  const title = document.createElement('h3')
  title.textContent = item.courseTitle
  const tutor = document.createElement('p')
  tutor.className = 'student-classrooms-card-tutor'
  tutor.textContent = `Tutor: ${item.tutor.name}`
  const dates = document.createElement('p')
  dates.className = 'student-classrooms-card-dates'
  dates.textContent = describeCourseDates(item)
  content.append(eyebrow, title, tutor, dates)

  const footer = document.createElement('div')
  footer.className = 'student-classrooms-card-footer'
  const open = document.createElement('a')
  open.className = 'student-classrooms-open-link'
  open.href = classroomUrl(item.classroom.id)
  open.textContent = item.classroom.accessMode === 'read_only' ? 'Review Classroom →' : 'Open Classroom →'
  footer.append(open)

  if (state.collection !== 'active') {
    const action = document.createElement('button')
    action.type = 'button'
    action.dataset.classroomAction = state.collection === 'former' ? 'archive' : 'restore'
    action.dataset.classroomId = item.classroom.id
    action.textContent = state.collection === 'former' ? 'Archive' : 'Restore'
    action.disabled = state.pendingClassroomId === item.classroom.id
    footer.append(action)
  }

  card.append(stateRow, content, footer)
  return card
}

function handleTabClick(event) {
  const button = event.target.closest('[data-classroom-collection]')
  if (!button) return
  const collection = normalizeStudentClassroomCollection(button.dataset.classroomCollection)
  if (collection === state.collection) return
  selectCollection(collection, { focusPanel: true })
}

function handleTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const buttons = [...elements.tabs.querySelectorAll('[data-classroom-collection]')]
  const currentIndex = buttons.findIndex((button) => button.dataset.classroomCollection === state.collection)
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? buttons.length - 1
      : (currentIndex + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length
  event.preventDefault()
  const next = buttons[nextIndex]
  selectCollection(next.dataset.classroomCollection)
  next.focus()
}

function selectCollection(collection, { focusPanel = false } = {}) {
  const normalized = normalizeStudentClassroomCollection(collection)
  if (normalized === state.collection) return
  state.collection = normalized
  window.history.replaceState(null, '', `#${normalized}`)
  renderTabs()
  renderCollection()
  if (focusPanel) elements.panel.focus({ preventScroll: true })
}

function handleHashChange() {
  const collection = collectionFromLocation()
  if (collection === state.collection) return
  state.collection = collection
  if (state.payload) {
    renderTabs()
    renderCollection()
  }
}

async function handleCollectionAction(event) {
  const button = event.target.closest('[data-classroom-action]')
  if (!button || state.pendingClassroomId) return

  state.pendingClassroomId = button.dataset.classroomId
  clearError()
  renderCollection()
  try {
    state.payload = button.dataset.classroomAction === 'archive'
      ? await archiveStudentClassroom(state.pendingClassroomId)
      : await restoreStudentClassroom(state.pendingClassroomId)
  } catch (error) {
    showError(error?.message || 'This Classroom preference could not be updated.')
  } finally {
    state.pendingClassroomId = ''
    renderCounts()
    renderCollection()
  }
}

function collectionFromLocation() {
  return normalizeStudentClassroomCollection(window.location.hash.replace(/^#/, ''))
}

function classroomUrl(classroomId) {
  return `./classroom-space.html?classroom=${encodeURIComponent(classroomId)}`
}

function presentationLabel(value) {
  if (value === 'ending_soon') return 'Ending soon'
  if (value === 'former') return 'Former'
  if (value === 'archived') return 'Archived'
  return 'Active'
}

function describeCourseDates(item) {
  if (item.courseStatus === 'wind_down' && item.windDownEndsOn) {
    return `Readable through ${formatDate(item.windDownEndsOn)}`
  }
  if (item.endedAt) return `Ended ${formatDate(item.endedAt)}`
  if (item.startDate && item.scheduledEndDate) {
    return `${formatDate(item.startDate)} – ${formatDate(item.scheduledEndDate)}`
  }
  return 'Course dates unavailable'
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`))
}

function clearError() {
  elements.error.textContent = ''
  elements.error.classList.add('is-hidden')
}

function showError(message) {
  elements.error.textContent = message
  elements.error.classList.remove('is-hidden')
}

function showFatal(message) {
  if (!elements.root) collectElements()
  elements.root?.setAttribute('aria-busy', 'false')
  showError(message)
}
