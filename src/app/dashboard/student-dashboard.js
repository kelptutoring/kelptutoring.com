import { requireAuth, signOutAndRedirect } from '../../auth/auth-guard.js'
import {
  getStudentCalendarData,
  getStudentDashboardData,
  saveStudentClassroomCardColor,
  saveStudentClassroomCardOrder,
  saveStudentDashboardPreferences
} from '../../data/studentData.js'
import {
  CLASSROOM_CARD_COLOR_KEYS,
  calendarRangeForView,
  moveCalendarAnchor,
  moveClassroomCard,
  moveDashboardBlock,
  placeClassroomCardAtTarget,
  placeDashboardBlockAtTarget
} from './student-dashboard-contract.js'
import { bindStudentNavigation } from './student-navigation.js'
import { mountWorkspaceSwitcher, renderDashboardIdentity } from './workspace-switcher.js'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CARD_COLOR_LABELS = Object.freeze({
  ocean: 'Ocean blue',
  kelp: 'Kelp green',
  coral: 'Coral red',
  orchid: 'Orchid purple',
  sunrise: 'Sunrise orange',
  slate: 'Slate gray'
})

const state = {
  dashboard: null,
  preferences: null,
  saving: false,
  savingClassroomCards: false,
  draggingBlock: '',
  draggingClassroomId: '',
  calendar: {
    anchorDate: todayAtNoon(),
    payload: null,
    loading: false,
    error: '',
    requestId: 0
  }
}

const elements = {}

prepareInitialScroll()

init().catch((error) => {
  console.error('Student Dashboard failed:', error)
  showFatal(error?.message || 'Your Dashboard could not be loaded.')
})

async function init() {
  const current = await requireAuth(['student'])
  if (!current) return

  collectElements()
  renderDashboardIdentity(current, {
    activeRole: 'student',
    headingId: 'student-heading',
    fallbackName: 'Student'
  })
  mountWorkspaceSwitcher(current, { activeRole: 'student' })
  bindStudentNavigation()
  bindDashboardMovement()
  bindCalendarView()
  bindCalendarNavigation()
  bindBlockCollapsing()
  bindDashboardDragAndDrop()
  bindClassroomCardInteractions()
  elements.logout?.addEventListener('click', signOutAndRedirect)

  const dashboard = await getStudentDashboardData()
  applyDashboardPayload(dashboard)
  await loadCalendarData()
  elements.root.setAttribute('aria-busy', 'false')
}

function collectElements() {
  const ids = [
    'student-dashboard', 'student-dashboard-feedback', 'student-dashboard-error',
    'dashboard-grid', 'student-calendar-shell', 'student-classroom-cards', 'classrooms-summary',
    'logout-student'
  ]
  for (const id of ids) elements[toCamelCase(id)] = document.getElementById(id)
  elements.root = elements.studentDashboard
  elements.feedback = elements.studentDashboardFeedback
  elements.error = elements.studentDashboardError
  elements.grid = elements.dashboardGrid
  elements.calendarShell = elements.studentCalendarShell
  elements.classroomCards = elements.studentClassroomCards
  elements.logout = elements.logoutStudent
}

function bindDashboardMovement() {
  elements.grid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-move-dashboard-block]')
    if (!button || !state.preferences || state.saving) return
    const block = button.closest('[data-dashboard-block]')
    if (!block) return
    const previousPreferences = clonePreferences(state.preferences)
    state.preferences.blockOrder = moveDashboardBlock(
      state.preferences.blockOrder,
      block.dataset.dashboardBlock,
      button.dataset.moveDashboardBlock
    )
    if (sameBlockOrder(previousPreferences.blockOrder, state.preferences.blockOrder)) return
    applyBlockOrder({ animate: true })
    await persistPreferences(previousPreferences, {
      failureMessage: 'The Dashboard order could not be saved.'
    })
  })
}

function bindBlockCollapsing() {
  elements.grid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-toggle-dashboard-block]')
    if (!button || !state.preferences || state.saving) return
    const blockKey = button.dataset.toggleDashboardBlock
    const previousPreferences = clonePreferences(state.preferences)
    state.preferences.collapsedBlocks = previousPreferences.collapsedBlocks.includes(blockKey)
      ? previousPreferences.collapsedBlocks.filter((key) => key !== blockKey)
      : [...previousPreferences.collapsedBlocks, blockKey]
    renderCollapsedBlocks()
    const action = state.preferences.collapsedBlocks.includes(blockKey) ? 'minimized' : 'expanded'
    await persistPreferences(previousPreferences, {
      failureMessage: `${dashboardBlockLabel(blockKey)} could not be ${action}.`
    })
  })
}

function bindCalendarView() {
  document.querySelectorAll('[data-calendar-view]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextView = button.dataset.calendarView
      if (!state.preferences || state.saving || nextView === state.preferences.calendarView) return
      const previousPreferences = clonePreferences(state.preferences)
      state.preferences.calendarView = nextView
      renderCalendar()
      const saved = await persistPreferences(previousPreferences, {
        failureMessage: 'The Calendar view could not be saved.'
      })
      if (saved) await loadCalendarData()
    })
  })
}

function bindCalendarNavigation() {
  elements.calendarShell.addEventListener('click', (event) => {
    const button = event.target.closest('[data-calendar-navigation]')
    if (!button || state.calendar.loading || state.saving) return
    const direction = button.dataset.calendarNavigation
    state.calendar.anchorDate = direction === 'today'
      ? todayAtNoon()
      : moveCalendarAnchor(state.calendar.anchorDate, state.preferences.calendarView, direction)
    renderCalendar()
    void loadCalendarData()
  })
}

function bindDashboardDragAndDrop() {
  elements.grid.addEventListener('dragstart', (event) => {
    if (event.target.closest('[data-classroom-card-handle]')) return
    const handle = event.target.closest('[data-dashboard-drag-handle]')
    const block = event.target.closest('[data-dashboard-block]')
    if (state.saving || !handle || !block) {
      event.preventDefault()
      return
    }
    const blockKey = block.dataset.dashboardBlock
    state.draggingBlock = blockKey
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', blockKey)
    block.classList.add('is-dragging')
  })
  elements.grid.addEventListener('dragover', (event) => {
    if (event.target.closest('[data-classroom-card]')) return
    const target = event.target.closest('[data-dashboard-block]')
    if (state.saving || !target || target.dataset.dashboardBlock === state.draggingBlock) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    clearDropTargets()
    target.classList.add('is-drop-target')
  })
  elements.grid.addEventListener('drop', async (event) => {
    if (event.target.closest('[data-classroom-card]')) return
    const target = event.target.closest('[data-dashboard-block]')
    if (state.saving || !target) return
    event.preventDefault()
    const movingKey = event.dataTransfer.getData('text/plain') || state.draggingBlock
    const previousPreferences = clonePreferences(state.preferences)
    state.preferences.blockOrder = placeDashboardBlockAtTarget(
      state.preferences.blockOrder,
      movingKey,
      target.dataset.dashboardBlock
    )
    if (sameBlockOrder(previousPreferences.blockOrder, state.preferences.blockOrder)) {
      clearDropTargets()
      return
    }
    applyBlockOrder({ animate: true })
    await persistPreferences(previousPreferences, {
      failureMessage: 'The Dashboard order could not be saved.'
    })
  })
  elements.grid.addEventListener('dragend', () => {
    state.draggingBlock = ''
    document.querySelectorAll('[data-dashboard-block]').forEach((block) => {
      block.classList.remove('is-dragging', 'is-drop-target')
    })
  })
}

function applyDashboardPayload(dashboard) {
  state.dashboard = dashboard
  state.preferences = clonePreferences(dashboard.preferences)
  applyBlockOrder()
  renderCollapsedBlocks()
  renderCalendar()
  renderClassroomCards()
}

function renderCollapsedBlocks() {
  const collapsedBlocks = state.preferences?.collapsedBlocks || []
  document.querySelectorAll('[data-dashboard-block]').forEach((block) => {
    const blockKey = block.dataset.dashboardBlock
    const collapsed = collapsedBlocks.includes(blockKey)
    const body = block.querySelector('.student-dashboard-block-body')
    const button = block.querySelector('[data-toggle-dashboard-block]')
    block.classList.toggle('is-collapsed', collapsed)
    if (body) {
      body.inert = collapsed
      body.setAttribute('aria-hidden', String(collapsed))
    }
    if (!button) return
    button.setAttribute('aria-expanded', String(!collapsed))
    button.textContent = collapsed ? 'Expand' : 'Minimize'
    button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Minimize'} ${dashboardBlockLabel(blockKey)}`)
  })
}

function applyBlockOrder({ animate = false } = {}) {
  const currentOrder = [...elements.grid.querySelectorAll('[data-dashboard-block]')]
    .map((block) => block.dataset.dashboardBlock)
  if (sameBlockOrder(currentOrder, state.preferences.blockOrder)) {
    updateMoveControls()
    return
  }

  const previousPositions = animate && motionAllowed()
    ? new Map([...elements.grid.querySelectorAll('[data-dashboard-block]')].map((block) => [
        block.dataset.dashboardBlock,
        block.getBoundingClientRect().top
      ]))
    : null

  for (const blockKey of state.preferences.blockOrder) {
    const block = elements.grid.querySelector(`[data-dashboard-block="${blockKey}"]`)
    if (block) elements.grid.append(block)
  }
  updateMoveControls()

  if (!previousPositions) return
  elements.grid.querySelectorAll('[data-dashboard-block]').forEach((block) => {
    const previousTop = previousPositions.get(block.dataset.dashboardBlock)
    const distance = previousTop - block.getBoundingClientRect().top
    if (!distance) return
    block.getAnimations().forEach((animation) => {
      if (animation.id === 'dashboard-block-reorder') animation.cancel()
    })
    const animation = block.animate([
      { transform: `translateY(${distance}px)` },
      { transform: 'translateY(0)' }
    ], {
      duration: 360,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    })
    animation.id = 'dashboard-block-reorder'
  })
}

async function loadCalendarData() {
  if (!state.preferences) return
  const requestId = state.calendar.requestId + 1
  state.calendar.requestId = requestId
  state.calendar.loading = true
  state.calendar.error = ''
  renderCalendar()
  const range = calendarRangeForView(state.calendar.anchorDate, state.preferences.calendarView)
  try {
    const payload = await getStudentCalendarData(range.startDate, range.endDate)
    if (requestId !== state.calendar.requestId) return
    state.calendar.payload = payload
  } catch (error) {
    if (requestId !== state.calendar.requestId) return
    console.error('Student Calendar failed:', error)
    state.calendar.error = calendarErrorMessage(error)
  } finally {
    if (requestId === state.calendar.requestId) {
      state.calendar.loading = false
      renderCalendar()
    }
  }
}

function renderCalendar() {
  if (!state.preferences || !elements.calendarShell) return
  const view = state.preferences.calendarView
  const anchor = state.calendar.anchorDate
  document.querySelectorAll('[data-calendar-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.calendarView === view))
  })
  elements.calendarShell.replaceChildren()

  const heading = document.createElement('div')
  heading.className = 'student-dashboard-calendar-heading'
  const headingCopy = document.createElement('div')
  headingCopy.className = 'student-dashboard-calendar-heading-copy'
  const title = document.createElement('strong')
  title.textContent = view === 'month'
    ? `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
    : describeCurrentWeek(anchor)
  const boundary = document.createElement('span')
  boundary.textContent = calendarStatusText()
  headingCopy.append(title, boundary)

  const navigation = document.createElement('div')
  navigation.className = 'student-dashboard-calendar-navigation'
  navigation.setAttribute('aria-label', 'Navigate Calendar dates')
  navigation.append(
    createCalendarNavigationButton('previous', 'Previous', 'Previous Calendar period'),
    createCalendarNavigationButton('today', 'Today', 'Return to today'),
    createCalendarNavigationButton('next', 'Next', 'Next Calendar period')
  )
  heading.append(headingCopy, navigation)

  if (state.calendar.error) {
    const error = document.createElement('p')
    error.className = 'student-dashboard-calendar-error'
    error.setAttribute('role', 'alert')
    error.textContent = state.calendar.error
    elements.calendarShell.append(heading, error)
    return
  }

  const canvas = document.createElement('div')
  canvas.className = `student-dashboard-calendar-canvas is-${view}`
  if (view === 'month') renderMonthCalendar(canvas, anchor)
  else renderWeekCalendar(canvas, anchor)
  elements.calendarShell.append(heading, canvas)
}

function renderMonthCalendar(canvas, date) {
  canvas.setAttribute('role', 'grid')
  canvas.setAttribute('aria-label', `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`)
  for (const day of DAY_NAMES) {
    const label = document.createElement('span')
    label.className = 'student-dashboard-calendar-day-label'
    label.setAttribute('role', 'columnheader')
    label.textContent = day
    canvas.append(label)
  }

  const year = date.getFullYear()
  const month = date.getMonth()
  const leadingCells = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((leadingCells + daysInMonth) / 7) * 7
  for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
    const dayNumber = cellIndex - leadingCells + 1
    const cell = document.createElement('div')
    cell.className = 'student-dashboard-calendar-date-cell'
    cell.setAttribute('role', 'gridcell')
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cell.classList.add('is-outside-month')
      cell.setAttribute('aria-hidden', 'true')
    } else {
      const calendarDate = new Date(year, month, dayNumber, 12)
      const dateKey = formatCalendarDate(calendarDate)
      const number = document.createElement('span')
      number.className = 'student-dashboard-calendar-day-number'
      number.textContent = String(dayNumber)
      const dayEvents = calendarEventsForDate(dateKey)
      cell.setAttribute('aria-label', `${MONTH_NAMES[month]} ${dayNumber}, ${year}${dayEvents.length ? `, ${dayEvents.length} scheduled ${dayEvents.length === 1 ? 'item' : 'items'}` : ''}`)
      if (dateKey === formatCalendarDate(todayAtNoon())) {
        cell.classList.add('is-today')
        cell.setAttribute('aria-current', 'date')
      }
      cell.append(number)
      appendCalendarEvents(cell, dayEvents)
    }
    canvas.append(cell)
  }
}

function renderWeekCalendar(canvas, anchorDate) {
  canvas.setAttribute('role', 'grid')
  canvas.setAttribute('aria-label', describeCurrentWeek(anchorDate))
  const start = new Date(anchorDate)
  start.setDate(anchorDate.getDate() - anchorDate.getDay())
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + dayIndex)
    const dateKey = formatCalendarDate(date)
    const dayEvents = calendarEventsForDate(dateKey)
    const column = document.createElement('div')
    column.className = 'student-dashboard-calendar-column'
    column.setAttribute('role', 'gridcell')
    column.setAttribute('aria-label', `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}${dayEvents.length ? `, ${dayEvents.length} scheduled ${dayEvents.length === 1 ? 'item' : 'items'}` : ''}`)
    if (dateKey === formatCalendarDate(todayAtNoon())) {
      column.classList.add('is-today')
      column.setAttribute('aria-current', 'date')
    }
    const label = document.createElement('span')
    label.className = 'student-dashboard-calendar-week-label'
    label.textContent = `${DAY_NAMES[date.getDay()]} ${date.getDate()}`
    column.append(label)
    appendCalendarEvents(column, dayEvents)
    if (!dayEvents.length && !state.calendar.loading) {
      const empty = document.createElement('span')
      empty.className = 'student-dashboard-calendar-empty'
      empty.textContent = 'No items'
      column.append(empty)
    }
    canvas.append(column)
  }
}

function appendCalendarEvents(container, events) {
  if (state.calendar.loading && !events.length) {
    const loading = document.createElement('span')
    loading.className = 'student-dashboard-calendar-empty'
    loading.textContent = 'Loading…'
    container.append(loading)
    return
  }
  events.forEach((event) => container.append(createCalendarEventLink(event)))
}

function createCalendarEventLink(event) {
  const link = document.createElement('a')
  link.className = `student-dashboard-calendar-event is-${event.kind}`
  link.dataset.cardColor = calendarEventColor(event)
  link.href = event.action?.type === 'open_practice'
    ? `../course-builder/course-practice.html?assignment=${encodeURIComponent(event.action.assignmentId)}`
    : `../classroom/classroom-space.html?classroom=${encodeURIComponent(event.classroomId)}`
  link.textContent = event.title
  link.title = `${calendarEventKindLabel(event.kind)}: ${event.title}${event.detail ? ` — ${event.detail}` : ''}`
  link.setAttribute('aria-label', link.title)
  return link
}

function createCalendarNavigationButton(direction, label, accessibleName) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.calendarNavigation = direction
  button.textContent = label
  button.setAttribute('aria-label', accessibleName)
  button.disabled = state.calendar.loading || state.saving
  return button
}

function calendarStatusText() {
  if (state.calendar.loading) return 'Loading your schedule…'
  if (state.calendar.error) return 'Schedule unavailable'
  const events = visibleCalendarEvents()
  const timeZone = state.calendar.payload?.range?.timeZone || 'UTC'
  return `${events.length} scheduled ${events.length === 1 ? 'item' : 'items'} · ${timeZone}`
}

function visibleCalendarEvents() {
  const range = calendarRangeForView(state.calendar.anchorDate, state.preferences.calendarView)
  return (state.calendar.payload?.events || []).filter((event) => (
    event.startsOn >= range.startDate && event.startsOn <= range.endDate
  ))
}

function calendarEventsForDate(dateKey) {
  return visibleCalendarEvents().filter((event) => event.startsOn === dateKey)
}

function calendarEventColor(event) {
  return state.dashboard?.classrooms?.find((item) => item.courseId === event.courseId)?.card?.colorKey
    || event.colorKey
    || 'ocean'
}

function calendarEventKindLabel(kind) {
  if (kind === 'assignment_due') return 'Assignment due'
  if (kind === 'schedule_milestone') return 'Schedule milestone'
  if (kind === 'course_start') return 'Course begins'
  return 'Course scheduled end'
}

function calendarErrorMessage(error) {
  const message = String(error?.message || '').trim()
  if (/get_my_student_calendar/i.test(message) && /schema cache|could not find the function/i.test(message)) {
    return 'Calendar setup is still being completed. Reload this page after the service update finishes.'
  }
  return message || 'Your Calendar items could not be loaded.'
}

function renderClassroomCards() {
  const classrooms = state.dashboard.classrooms
  elements.classroomCards.replaceChildren()
  const activeCount = classrooms.length
  elements.classroomsSummary.textContent = classrooms.length
    ? `${activeCount} active ${activeCount === 1 ? 'Classroom' : 'Classrooms'}. Drag the Cards to arrange them.`
    : 'No active Classroom is assigned to this Student yet.'

  if (!classrooms.length) {
    const empty = document.createElement('div')
    empty.className = 'student-dashboard-empty-state'
    const title = document.createElement('strong')
    title.textContent = 'No active Classrooms yet'
    const copy = document.createElement('p')
    copy.textContent = 'A Classroom will appear after a Mentor activates a Course relationship.'
    empty.append(title, copy)
    elements.classroomCards.append(empty)
    return
  }

  classrooms.forEach((item, index) => {
    elements.classroomCards.append(createClassroomCard(item, index, classrooms.length))
  })
  setClassroomCardControlsBusy(state.savingClassroomCards)
}

function createClassroomCard(item, index, total) {
  const classroomId = item.classroom.id
  const card = document.createElement('article')
  card.className = 'student-dashboard-classroom-card'
  card.dataset.classroomCard = classroomId
  card.dataset.cardColor = item.card.colorKey

  const toolbar = document.createElement('div')
  toolbar.className = 'student-dashboard-classroom-card-toolbar'
  const handle = document.createElement('button')
  handle.className = 'student-dashboard-classroom-card-handle'
  handle.type = 'button'
  handle.draggable = total > 1
  handle.dataset.classroomCardHandle = classroomId
  handle.setAttribute('aria-label', `Drag ${item.courseTitle} Classroom Card`)
  handle.title = total > 1
    ? 'Drag to rearrange this Classroom Card'
    : 'Add another Classroom to enable Card reordering'
  handle.innerHTML = '<span aria-hidden="true"></span>'

  const customize = document.createElement('details')
  customize.className = 'student-dashboard-classroom-card-menu'
  const summary = document.createElement('summary')
  summary.textContent = 'Customize'
  const panel = document.createElement('div')
  panel.className = 'student-dashboard-classroom-card-menu-panel'
  const colorLabel = document.createElement('p')
  colorLabel.textContent = 'Card color'
  const colors = document.createElement('div')
  colors.className = 'student-dashboard-classroom-card-colors'
  colors.setAttribute('aria-label', `Choose a color for ${item.courseTitle}`)
  CLASSROOM_CARD_COLOR_KEYS.forEach((colorKey) => {
    const color = document.createElement('button')
    color.type = 'button'
    color.dataset.classroomCardColor = colorKey
    color.dataset.classroomId = classroomId
    color.dataset.cardColor = colorKey
    color.setAttribute('aria-label', CARD_COLOR_LABELS[colorKey])
    color.setAttribute('aria-pressed', String(colorKey === item.card.colorKey))
    colors.append(color)
  })
  const move = document.createElement('div')
  move.className = 'student-dashboard-classroom-card-move'
  const earlier = document.createElement('button')
  earlier.type = 'button'
  earlier.dataset.classroomCardMove = 'earlier'
  earlier.dataset.classroomId = classroomId
  earlier.textContent = 'Move earlier'
  earlier.disabled = index === 0
  const later = document.createElement('button')
  later.type = 'button'
  later.dataset.classroomCardMove = 'later'
  later.dataset.classroomId = classroomId
  later.textContent = 'Move later'
  later.disabled = index === total - 1
  move.append(earlier, later)
  panel.append(colorLabel, colors, move)
  customize.append(summary, panel)
  toolbar.append(handle, customize)

  const link = document.createElement('a')
  link.className = 'student-dashboard-classroom-card-link'
  link.href = `../classroom/classroom-space.html?classroom=${encodeURIComponent(classroomId)}`
  link.draggable = false
  link.setAttribute('aria-label', `Open ${item.courseTitle} Classroom`)
  const eyebrow = document.createElement('p')
  eyebrow.className = 'page-kicker'
  eyebrow.textContent = `${item.subject.name}${item.focus.name ? ` · ${item.focus.name}` : ''}`
  const title = document.createElement('h3')
  title.textContent = item.courseTitle
  const tutor = document.createElement('p')
  tutor.className = 'student-dashboard-classroom-card-tutor'
  tutor.textContent = `Tutor: ${item.tutor.name}`
  const footer = document.createElement('div')
  footer.className = 'student-dashboard-classroom-card-footer'
  const stateLabel = document.createElement('span')
  stateLabel.className = 'student-dashboard-relationship-state'
  stateLabel.textContent = item.courseStatus === 'wind_down' ? 'Ending soon' : 'Active'
  const action = document.createElement('span')
  action.className = 'student-dashboard-classroom-card-action'
  action.textContent = 'Open Classroom →'
  footer.append(stateLabel, action)
  link.append(eyebrow, title, tutor, footer)
  card.append(toolbar, link)
  return card
}

function bindClassroomCardInteractions() {
  elements.classroomCards.addEventListener('click', (event) => {
    const color = event.target.closest('[data-classroom-card-color]')
    if (color) {
      void changeClassroomCardColor(color.dataset.classroomId, color.dataset.classroomCardColor)
      color.closest('details').open = false
      return
    }
    const move = event.target.closest('[data-classroom-card-move]')
    if (move) {
      void moveClassroomCardBy(move.dataset.classroomId, move.dataset.classroomCardMove)
      move.closest('details').open = false
    }
  })

  elements.classroomCards.addEventListener('dragstart', (event) => {
    const handle = event.target.closest('[data-classroom-card-handle]')
    const card = event.target.closest('[data-classroom-card]')
    if (state.savingClassroomCards || !handle || !card || state.dashboard.classrooms.length < 2) {
      event.preventDefault()
      return
    }
    event.stopPropagation()
    state.draggingClassroomId = card.dataset.classroomCard
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-kelp-classroom-card', state.draggingClassroomId)
    card.classList.add('is-dragging')
  })
  elements.classroomCards.addEventListener('dragover', (event) => {
    const target = event.target.closest('[data-classroom-card]')
    if (!state.draggingClassroomId || !target || target.dataset.classroomCard === state.draggingClassroomId) return
    event.preventDefault()
    event.stopPropagation()
    clearClassroomCardDropTargets()
    target.classList.add('is-drop-target')
  })
  elements.classroomCards.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-classroom-card]')
    if (state.savingClassroomCards || !target) return
    event.preventDefault()
    event.stopPropagation()
    const movingId = event.dataTransfer.getData('application/x-kelp-classroom-card')
      || state.draggingClassroomId
    const previousOrder = classroomCardIds()
    const nextOrder = placeClassroomCardAtTarget(previousOrder, movingId, target.dataset.classroomCard)
    if (sameBlockOrder(previousOrder, nextOrder)) {
      clearClassroomCardDropTargets()
      return
    }
    reorderClassrooms(nextOrder)
    applyClassroomCardOrder({ animate: true })
    void persistClassroomCardOrder(previousOrder)
  })
  elements.classroomCards.addEventListener('dragend', () => {
    state.draggingClassroomId = ''
    clearClassroomCardDropTargets()
    elements.classroomCards.querySelectorAll('[data-classroom-card]').forEach((card) => {
      card.classList.remove('is-dragging')
    })
  })
}

async function moveClassroomCardBy(classroomId, direction) {
  if (state.savingClassroomCards) return
  const previousOrder = classroomCardIds()
  const nextOrder = moveClassroomCard(previousOrder, classroomId, direction)
  if (sameBlockOrder(previousOrder, nextOrder)) return
  reorderClassrooms(nextOrder)
  applyClassroomCardOrder({ animate: true })
  await persistClassroomCardOrder(previousOrder)
}

async function changeClassroomCardColor(classroomId, colorKey) {
  if (state.savingClassroomCards) return
  const classroom = state.dashboard.classrooms.find((item) => item.classroom.id === classroomId)
  if (!classroom || classroom.card.colorKey === colorKey) return
  const previousColor = classroom.card.colorKey
  classroom.card.colorKey = colorKey
  applyClassroomCardColor(classroomId, colorKey)
  renderCalendar()
  state.savingClassroomCards = true
  setClassroomCardControlsBusy(true)
  showFeedback('')
  try {
    const dashboard = await saveStudentClassroomCardColor(classroomId, colorKey)
    state.dashboard = dashboard
    state.preferences = clonePreferences(dashboard.preferences)
    renderClassroomCards()
    renderCalendar()
  } catch (error) {
    classroom.card.colorKey = previousColor
    applyClassroomCardColor(classroomId, previousColor)
    renderCalendar()
    showFeedback(error?.message || 'The Classroom Card color could not be saved.')
  } finally {
    state.savingClassroomCards = false
    setClassroomCardControlsBusy(false)
  }
}

async function persistClassroomCardOrder(previousOrder) {
  state.savingClassroomCards = true
  setClassroomCardControlsBusy(true)
  showFeedback('')
  try {
    const dashboard = await saveStudentClassroomCardOrder(classroomCardIds())
    state.dashboard = dashboard
    state.preferences = clonePreferences(dashboard.preferences)
    applyClassroomCardOrder()
    return true
  } catch (error) {
    reorderClassrooms(previousOrder)
    applyClassroomCardOrder({ animate: true })
    showFeedback(error?.message || 'The Classroom Card order could not be saved.')
    return false
  } finally {
    state.savingClassroomCards = false
    setClassroomCardControlsBusy(false)
  }
}

function classroomCardIds() {
  return state.dashboard.classrooms.map((item) => item.classroom.id)
}

function reorderClassrooms(classroomIds) {
  const byId = new Map(state.dashboard.classrooms.map((item) => [item.classroom.id, item]))
  state.dashboard.classrooms = classroomIds.map((id) => byId.get(id)).filter(Boolean)
}

function applyClassroomCardOrder({ animate = false } = {}) {
  const desiredOrder = classroomCardIds()
  const cards = [...elements.classroomCards.querySelectorAll('[data-classroom-card]')]
  const currentOrder = cards.map((card) => card.dataset.classroomCard)
  if (sameBlockOrder(currentOrder, desiredOrder)) {
    updateClassroomCardMoveControls()
    return
  }
  const previousPositions = animate && motionAllowed()
    ? new Map(cards.map((card) => [card.dataset.classroomCard, card.getBoundingClientRect()]))
    : null
  desiredOrder.forEach((classroomId) => {
    const card = elements.classroomCards.querySelector(`[data-classroom-card="${classroomId}"]`)
    if (card) elements.classroomCards.append(card)
  })
  updateClassroomCardMoveControls()
  if (!previousPositions) return
  elements.classroomCards.querySelectorAll('[data-classroom-card]').forEach((card) => {
    const before = previousPositions.get(card.dataset.classroomCard)
    const after = card.getBoundingClientRect()
    if (!before) return
    const x = before.left - after.left
    const y = before.top - after.top
    if (!x && !y) return
    const animation = card.animate([
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'translate(0, 0)' }
    ], { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    animation.id = 'classroom-card-reorder'
  })
}

function applyClassroomCardColor(classroomId, colorKey) {
  const card = elements.classroomCards.querySelector(`[data-classroom-card="${classroomId}"]`)
  if (!card) return
  card.dataset.cardColor = colorKey
  card.querySelectorAll('[data-classroom-card-color]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.classroomCardColor === colorKey))
  })
}

function updateClassroomCardMoveControls() {
  const order = classroomCardIds()
  elements.classroomCards.querySelectorAll('[data-classroom-card]').forEach((card) => {
    const index = order.indexOf(card.dataset.classroomCard)
    const earlier = card.querySelector('[data-classroom-card-move="earlier"]')
    const later = card.querySelector('[data-classroom-card-move="later"]')
    if (earlier) earlier.disabled = state.savingClassroomCards || index <= 0
    if (later) later.disabled = state.savingClassroomCards || index >= order.length - 1
  })
}

function setClassroomCardControlsBusy(busy) {
  const reorderable = (state.dashboard?.classrooms?.length || 0) > 1
  elements.root.classList.toggle('is-saving-classroom-cards', busy)
  elements.classroomCards.querySelectorAll('[data-classroom-card-color]').forEach((button) => {
    button.disabled = busy
  })
  elements.classroomCards.querySelectorAll('[data-classroom-card-handle]').forEach((handle) => {
    handle.draggable = !busy && reorderable
    handle.setAttribute('aria-disabled', String(busy || !reorderable))
  })
  updateClassroomCardMoveControls()
}

function clearClassroomCardDropTargets() {
  elements.classroomCards.querySelectorAll('[data-classroom-card]').forEach((card) => {
    card.classList.remove('is-drop-target')
  })
}

async function persistPreferences(previousPreferences, { failureMessage }) {
  state.saving = true
  setPreferenceControlsBusy(true)
  showFeedback('')
  try {
    const dashboard = await saveStudentDashboardPreferences(state.preferences)
    applyDashboardPayload(dashboard)
    return true
  } catch (error) {
    state.preferences = clonePreferences(previousPreferences)
    applyBlockOrder({ animate: true })
    renderCollapsedBlocks()
    renderCalendar()
    showFeedback(error?.message || failureMessage)
    return false
  } finally {
    state.saving = false
    setPreferenceControlsBusy(false)
  }
}

function updateMoveControls() {
  if (!state.preferences) return
  document.querySelectorAll('[data-dashboard-block]').forEach((block) => {
    const index = state.preferences.blockOrder.indexOf(block.dataset.dashboardBlock)
    const up = block.querySelector('[data-move-dashboard-block="up"]')
    const down = block.querySelector('[data-move-dashboard-block="down"]')
    if (up) up.disabled = state.saving || index <= 0
    if (down) down.disabled = state.saving || index >= state.preferences.blockOrder.length - 1
  })
}

function clearDropTargets() {
  document.querySelectorAll('[data-dashboard-block]').forEach((block) => {
    block.classList.remove('is-drop-target')
  })
}

function setPreferenceControlsBusy(busy) {
  elements.root.classList.toggle('is-saving-preferences', busy)
  document.querySelectorAll('[data-calendar-view]').forEach((button) => { button.disabled = busy })
  document.querySelectorAll('[data-calendar-navigation]').forEach((button) => {
    button.disabled = busy || state.calendar.loading
  })
  document.querySelectorAll('[data-toggle-dashboard-block]').forEach((button) => { button.disabled = busy })
  document.querySelectorAll('[data-dashboard-drag-handle]').forEach((handle) => {
    handle.draggable = !busy
    handle.setAttribute('aria-disabled', String(busy))
  })
  updateMoveControls()
}

function showFeedback(message) {
  elements.feedback.textContent = message
  elements.feedback.classList.toggle('is-error', Boolean(message))
}

function showFatal(message) {
  if (!elements.error) collectElements()
  elements.root?.setAttribute('aria-busy', 'false')
  elements.error.textContent = message
  elements.error.classList.remove('is-hidden')
}

function clonePreferences(preferences) {
  return {
    blockOrder: [...preferences.blockOrder],
    calendarView: preferences.calendarView,
    collapsedBlocks: [...(preferences.collapsedBlocks || [])]
  }
}

function sameBlockOrder(left, right) {
  return left.length === right.length && left.every((key, index) => key === right[index])
}

function dashboardBlockLabel(blockKey) {
  return blockKey === 'calendar' ? 'Calendar' : 'Classrooms'
}

function motionAllowed() {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

function prepareInitialScroll() {
  if (window.location.hash) return
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  window.addEventListener('pageshow', () => {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
  }, { once: true })
}

function describeCurrentWeek(date) {
  const start = new Date(date)
  start.setDate(date.getDate() - date.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  if (start.getFullYear() !== end.getFullYear()) {
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}–${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
  }
  return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
}

function todayAtNoon() {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
}

function formatCalendarDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}
