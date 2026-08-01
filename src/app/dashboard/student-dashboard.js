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
  calendarReelStart,
  calendarRangeForView,
  moveCalendarAnchor,
  moveClassroomCard,
  moveDashboardBlock,
  placeClassroomCardAtTarget,
  placeDashboardBlockAtTarget
} from './student-dashboard-contract.js'
import { bindStudentNavigation } from './student-navigation.js'
import { mountWorkspaceSwitcher, renderDashboardIdentity } from './workspace-switcher.js'
import { createLessonRequestFoundation } from '../shared/lesson-request-foundation.js'

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
  lessonRequest: null,
  calendar: {
    anchorDate: todayAtNoon(),
    payload: null,
    loading: false,
    transitioning: false,
    transitionId: 0,
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
  state.lessonRequest = createLessonRequestFoundation({
    dialogId: 'student-lesson-request-dialog',
    triggerId: 'student-calendar-request-lesson',
    storageScope: 'dashboard'
  })
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
  bindCalendarDialogs()
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
    'student-calendar-legend-dialog', 'student-calendar-day-dialog',
    'student-calendar-day-dialog-title', 'student-calendar-day-dialog-events',
    'student-calendar-event-tooltip',
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
      if (
        !state.preferences
        || state.saving
        || state.calendar.loading
        || state.calendar.transitioning
        || nextView === state.preferences.calendarView
      ) return
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
    if (
      !button
      || state.calendar.loading
      || state.calendar.transitioning
      || state.saving
    ) return
    const direction = button.dataset.calendarNavigation
    const preservedViewport = captureCalendarNavigationViewport(button)
    hideCalendarEventTooltip()
    const previousAnchor = new Date(state.calendar.anchorDate)
    const nextAnchor = direction === 'today'
      ? todayAtNoon()
      : moveCalendarAnchor(state.calendar.anchorDate, state.preferences.calendarView, direction)
    const previousRange = calendarRangeForView(
      previousAnchor,
      state.preferences.calendarView
    )
    const nextRange = calendarRangeForView(nextAnchor, state.preferences.calendarView)
    state.calendar.anchorDate = nextAnchor
    if (
      previousRange.startDate === nextRange.startDate
      && previousRange.endDate === nextRange.endDate
    ) {
      void renderCalendar({ preservedViewport })
      return
    }
    const motionDirection = calendarMotionDirection(previousAnchor, nextAnchor)
    void loadCalendarData({
      motionDirection,
      fallbackAnchor: previousAnchor,
      preservedViewport,
      reelAnchors: direction === 'today'
        ? calendarAnchorsBetween(previousAnchor, nextAnchor, state.preferences.calendarView)
        : []
    })
  })
}

function bindCalendarDialogs() {
  elements.calendarShell.addEventListener('click', (event) => {
    const requestDate = event.target.closest('[data-request-lesson-date]')
    if (requestDate) {
      state.lessonRequest?.open({
        proposedDate: requestDate.dataset.requestLessonDate
      })
      return
    }
    const helper = event.target.closest('[data-open-calendar-helper]')
    if (helper) {
      elements.studentCalendarLegendDialog?.showModal()
      return
    }
    const overflow = event.target.closest('[data-open-calendar-day]')
    if (overflow) openCalendarDayDialog(overflow.dataset.openCalendarDay)
  })

  for (const dialog of [
    elements.studentCalendarLegendDialog,
    elements.studentCalendarDayDialog
  ]) {
    if (!dialog) continue
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close-calendar-dialog]')) {
        dialog.close()
      }
    })
  }

  elements.calendarShell.addEventListener('pointerover', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent) showCalendarEventTooltip(calendarEvent)
  })
  elements.calendarShell.addEventListener('pointerout', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent && !calendarEvent.contains(event.relatedTarget)) {
      hideCalendarEventTooltip()
    }
  })
  elements.calendarShell.addEventListener('focusin', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent) showCalendarEventTooltip(calendarEvent)
  })
  elements.calendarShell.addEventListener('focusout', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent && !calendarEvent.contains(event.relatedTarget)) {
      hideCalendarEventTooltip()
    }
  })
  elements.calendarShell.addEventListener('scroll', hideCalendarEventTooltip, { passive: true })
  window.addEventListener('resize', hideCalendarEventTooltip, { passive: true })
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
      duration: 920,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    })
    animation.id = 'dashboard-block-reorder'
  })
}

async function loadCalendarData({
  motionDirection = '',
  fallbackAnchor = null,
  preservedViewport = null,
  reelAnchors = []
} = {}) {
  if (!state.preferences) return
  const requestId = state.calendar.requestId + 1
  state.calendar.requestId = requestId
  state.calendar.loading = true
  state.calendar.error = ''
  const preserveCurrentPeriod = Boolean(
    motionDirection && elements.calendarShell.firstElementChild
  )
  if (preserveCurrentPeriod) setRenderedCalendarBusy(true)
  else renderCalendar()
  const range = calendarRangeForView(state.calendar.anchorDate, state.preferences.calendarView)
  let loaded = false
  try {
    const payload = await getStudentCalendarData(range.startDate, range.endDate)
    if (requestId !== state.calendar.requestId) return
    state.calendar.payload = payload
    state.lessonRequest?.setCalendarPayload(payload)
    loaded = true
  } catch (error) {
    if (requestId !== state.calendar.requestId) return
    console.error('Student Calendar failed:', error)
    if (fallbackAnchor) state.calendar.anchorDate = new Date(fallbackAnchor)
    if (!state.calendar.payload) state.lessonRequest?.setCalendarPayload(null)
    state.calendar.error = calendarErrorMessage(error)
  } finally {
    if (requestId === state.calendar.requestId) {
      state.calendar.loading = false
      if (loaded && reelAnchors.length > 1) {
        await playCalendarReel({
          anchors: reelAnchors,
          direction: motionDirection,
          requestId,
          preservedViewport
        })
      } else {
        await renderCalendar({
          motionDirection: loaded ? motionDirection : '',
          preservedViewport
        })
      }
    }
  }
}

function renderCalendar({
  motionDirection = '',
  motionDuration = 380,
  motionEasing = 'cubic-bezier(0.22, 1, 0.36, 1)',
  keepBusy = false,
  preservedViewport = null
} = {}) {
  if (!state.preferences || !elements.calendarShell) return Promise.resolve()
  const view = state.preferences.calendarView
  const anchor = state.calendar.anchorDate
  const currentViewport = elements.calendarShell.querySelector(
    ':scope > .student-dashboard-calendar-motion-viewport'
  )
  const shouldTransition = Boolean(
    ['forward', 'backward'].includes(motionDirection)
    && motionAllowed()
    && currentViewport?.firstElementChild
  )
  const transitionId = state.calendar.transitionId + 1
  state.calendar.transitionId = transitionId
  state.calendar.transitioning = shouldTransition || keepBusy
  document.querySelectorAll('[data-calendar-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.calendarView === view))
    button.disabled = state.calendar.loading || state.calendar.transitioning
    button.setAttribute('aria-disabled', String(button.disabled || state.saving))
  })
  elements.calendarShell.setAttribute(
    'aria-busy',
    String(state.calendar.loading || state.calendar.transitioning)
  )

  const heading = document.createElement('div')
  heading.className = 'student-dashboard-calendar-heading'
  const headingCopy = document.createElement('div')
  headingCopy.className = 'student-dashboard-calendar-heading-copy'
  const titleLine = document.createElement('div')
  titleLine.className = 'student-dashboard-calendar-heading-title'
  const title = document.createElement('strong')
  title.textContent = view === 'month'
    ? `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
    : describeCurrentWeek(anchor)
  const helper = document.createElement('button')
  helper.type = 'button'
  helper.className = 'student-dashboard-calendar-helper'
  helper.dataset.openCalendarHelper = ''
  helper.textContent = 'i'
  helper.setAttribute('aria-label', 'Explain Calendar abbreviations')
  titleLine.append(title, helper)
  const boundary = document.createElement('span')
  boundary.dataset.calendarStatus = ''
  boundary.textContent = calendarStatusText()
  headingCopy.append(titleLine, boundary)

  const navigation = document.createElement('div')
  navigation.className = 'student-dashboard-calendar-navigation'
  navigation.setAttribute('aria-label', 'Navigate Calendar dates')
  navigation.append(
    createCalendarNavigationButton('previous', 'Previous', 'Previous Calendar period'),
    createCalendarNavigationButton('today', 'Today', 'Return to today'),
    createCalendarNavigationButton('next', 'Next', 'Next Calendar period')
  )
  heading.append(headingCopy, navigation)

  let content
  if (state.calendar.error) {
    content = document.createElement('p')
    content.className = 'student-dashboard-calendar-error'
    content.setAttribute('role', 'alert')
    content.textContent = state.calendar.error
  } else {
    content = document.createElement('div')
    content.className = `student-dashboard-calendar-canvas is-${view}`
    if (view === 'month') renderMonthCalendar(content, anchor)
    else renderWeekCalendar(content, anchor)
  }
  content.classList.add('calendar-motion-panel')

  if (shouldTransition) {
    const currentHeading = elements.calendarShell.querySelector(
      ':scope > .student-dashboard-calendar-heading'
    )
    if (currentHeading) currentHeading.replaceWith(heading)
    else elements.calendarShell.prepend(heading)
    restoreCalendarNavigationViewport(preservedViewport)
    return new Promise((resolve) => {
      animateCalendarReel(currentViewport, content, motionDirection, () => {
        if (state.calendar.transitionId === transitionId) {
          state.calendar.transitioning = keepBusy
          if (keepBusy) elements.calendarShell.setAttribute('aria-busy', 'true')
          else setRenderedCalendarBusy(false)
        }
        restoreCalendarNavigationViewport(preservedViewport)
        resolve()
      }, {
        duration: motionDuration,
        easing: motionEasing
      })
    })
  }

  state.calendar.transitioning = keepBusy
  const viewport = document.createElement('div')
  viewport.className = 'calendar-motion-viewport student-dashboard-calendar-motion-viewport'
  viewport.append(content)
  elements.calendarShell.replaceChildren(heading, viewport)
  restoreCalendarNavigationViewport(preservedViewport)
  return Promise.resolve()
}

function animateCalendarReel(
  viewport,
  nextPanel,
  direction,
  onComplete,
  {
    duration = 380,
    easing = 'cubic-bezier(0.22, 1, 0.36, 1)'
  } = {}
) {
  const currentPanel = viewport.firstElementChild
  if (!currentPanel || typeof currentPanel.animate !== 'function') {
    viewport.replaceChildren(nextPanel)
    onComplete()
    return
  }

  const enteringFrom = direction === 'forward' ? 100 : -100
  const leavingTo = enteringFrom * -1
  const currentHeight = currentPanel.getBoundingClientRect().height
  currentPanel.classList.add('calendar-motion-panel')
  currentPanel.inert = true
  currentPanel.setAttribute('aria-hidden', 'true')
  nextPanel.inert = true
  viewport.classList.add('is-transitioning')
  viewport.append(nextPanel)
  const nextHeight = nextPanel.getBoundingClientRect().height
  viewport.style.height = `${Math.max(currentHeight, nextHeight)}px`

  const options = {
    duration,
    easing,
    fill: 'both'
  }
  const outgoing = currentPanel.animate([
    { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    { opacity: 0.32, transform: `translate3d(${leavingTo}%, 0, 0)` }
  ], options)
  const incoming = nextPanel.animate([
    { opacity: 0.32, transform: `translate3d(${enteringFrom}%, 0, 0)` },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' }
  ], options)

  Promise.allSettled([outgoing.finished, incoming.finished]).then(() => {
    outgoing.cancel()
    incoming.cancel()
    if (!viewport.isConnected || !nextPanel.isConnected) {
      onComplete()
      return
    }
    viewport.replaceChildren(nextPanel)
    nextPanel.inert = false
    viewport.classList.remove('is-transitioning')
    viewport.style.height = ''
    onComplete()
  })
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
  const totalCells = 42
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
      const canRequestLesson = state.lessonRequest?.canStart() === true
      const number = document.createElement(canRequestLesson ? 'button' : 'span')
      number.className = 'student-dashboard-calendar-day-number'
      number.textContent = String(dayNumber)
      if (canRequestLesson) {
        number.type = 'button'
        number.dataset.requestLessonDate = dateKey
        number.setAttribute(
          'aria-label',
          `Prepare a lesson request for ${MONTH_NAMES[month]} ${dayNumber}, ${year}`
        )
      }
      const dayEvents = calendarEventsForDate(dateKey)
      cell.setAttribute('aria-label', `${MONTH_NAMES[month]} ${dayNumber}, ${year}${dayEvents.length ? `, ${dayEvents.length} scheduled ${dayEvents.length === 1 ? 'item' : 'items'}` : ''}`)
      if (dateKey === formatCalendarDate(todayAtNoon())) {
        cell.classList.add('is-today')
        cell.setAttribute('aria-current', 'date')
      }
      cell.append(number)
      appendCalendarEvents(cell, dayEvents, { dateKey, visibleLimit: 2 })
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
    const canRequestLesson = state.lessonRequest?.canStart() === true
    const label = document.createElement(canRequestLesson ? 'button' : 'span')
    label.className = 'student-dashboard-calendar-week-label'
    label.textContent = `${DAY_NAMES[date.getDay()]} ${date.getDate()}`
    if (canRequestLesson) {
      label.type = 'button'
      label.dataset.requestLessonDate = dateKey
      label.setAttribute(
        'aria-label',
        `Prepare a lesson request for ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
      )
    }
    column.append(label)
    appendCalendarEvents(column, dayEvents, { dateKey, visibleLimit: 4 })
    if (!dayEvents.length && !state.calendar.loading) {
      const empty = document.createElement('span')
      empty.className = 'student-dashboard-calendar-empty'
      empty.textContent = 'No items'
      column.append(empty)
    }
    canvas.append(column)
  }
}

function appendCalendarEvents(container, events, { dateKey = '', visibleLimit = events.length } = {}) {
  if (state.calendar.loading && !events.length) {
    const loading = document.createElement('span')
    loading.className = 'student-dashboard-calendar-empty'
    loading.textContent = 'Loading…'
    container.append(loading)
    return
  }
  events.slice(0, visibleLimit).forEach((event) => {
    container.append(createCalendarEventLink(event))
  })
  if (events.length > visibleLimit) {
    const overflow = document.createElement('button')
    overflow.type = 'button'
    overflow.className = 'student-dashboard-calendar-overflow'
    overflow.dataset.openCalendarDay = dateKey
    overflow.textContent = `+${events.length - visibleLimit} more`
    overflow.setAttribute(
      'aria-label',
      `Show all ${events.length} scheduled items for ${formatCalendarDayHeading(dateKey)}`
    )
    container.append(overflow)
  }
}

function createCalendarEventLink(event, { expanded = false } = {}) {
  const link = document.createElement('a')
  link.className = `student-dashboard-calendar-event is-${event.kind}`
  if (expanded) link.classList.add('is-expanded')
  applyCalendarEventPresentation(link, event)
  link.href = calendarEventDestination(event)
  const fullLabel = calendarEventFullLabel(event)
  link.dataset.eventId = event.id
  if (expanded) renderCalendarEventDescription(link, event)
  else link.textContent = calendarEventCompactLabel(event)
  link.setAttribute('aria-label', fullLabel)
  return link
}

function calendarEventDestination(event) {
  if (event.action?.type === 'open_practice') {
    return `../course-builder/course-practice.html?assignment=${encodeURIComponent(event.action.assignmentId)}`
  }
  if (event.action?.type === 'open_track_session' && event.action.href) {
    return event.action.href
  }
  return `../classroom/classroom-space.html?classroom=${encodeURIComponent(event.classroomId)}`
}

function showCalendarEventTooltip(calendarEvent) {
  const tooltip = elements.studentCalendarEventTooltip
  const eventId = calendarEvent?.dataset?.eventId
  const event = state.calendar.payload?.events?.find((item) => item.id === eventId)
  if (!tooltip || !event) return

  renderCalendarEventDescription(tooltip, event)
  tooltip.hidden = false
  tooltip.style.left = '0px'
  tooltip.style.top = '0px'
  tooltip.style.maxWidth = ''

  const shellBounds = elements.calendarShell.getBoundingClientRect()
  const eventBounds = calendarEvent.getBoundingClientRect()
  const horizontalInset = 8
  const availableWidth = Math.max(180, shellBounds.width - (horizontalInset * 2))
  tooltip.style.maxWidth = `${Math.min(300, availableWidth)}px`
  const tooltipBounds = tooltip.getBoundingClientRect()
  const minimumLeft = Math.max(shellBounds.left + horizontalInset, horizontalInset)
  const maximumLeft = Math.max(
    minimumLeft,
    Math.min(
      shellBounds.right - tooltipBounds.width - horizontalInset,
      window.innerWidth - tooltipBounds.width - horizontalInset
    )
  )
  const left = Math.min(Math.max(eventBounds.left, minimumLeft), maximumLeft)

  let top = eventBounds.bottom + 6
  if (top + tooltipBounds.height > shellBounds.bottom - 8) {
    top = eventBounds.top - tooltipBounds.height - 6
  }
  const minimumTop = Math.max(shellBounds.top + 8, 8)
  const maximumTop = Math.max(
    minimumTop,
    Math.min(
      shellBounds.bottom - tooltipBounds.height - 8,
      window.innerHeight - tooltipBounds.height - 8
    )
  )
  top = Math.min(Math.max(top, minimumTop), maximumTop)
  tooltip.style.left = `${Math.round(left)}px`
  tooltip.style.top = `${Math.round(top)}px`
}

function hideCalendarEventTooltip() {
  const tooltip = elements.studentCalendarEventTooltip
  if (!tooltip) return
  tooltip.hidden = true
}

function openCalendarDayDialog(dateKey) {
  const dialog = elements.studentCalendarDayDialog
  if (!dialog || typeof dialog.showModal !== 'function') return
  const events = calendarEventsForDate(dateKey)
  elements.studentCalendarDayDialogTitle.textContent = formatCalendarDayHeading(dateKey)
  elements.studentCalendarDayDialogEvents.replaceChildren()
  for (const event of events) {
    elements.studentCalendarDayDialogEvents.append(
      createCalendarEventLink(event, { expanded: true })
    )
  }
  dialog.showModal()
}

function createCalendarNavigationButton(direction, label, accessibleName) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.calendarNavigation = direction
  button.textContent = label
  button.setAttribute('aria-label', accessibleName)
  button.disabled = state.calendar.loading || state.calendar.transitioning
  button.setAttribute('aria-disabled', String(button.disabled || state.saving))
  return button
}

function setRenderedCalendarBusy(busy) {
  elements.calendarShell.setAttribute('aria-busy', String(busy))
  elements.calendarShell.querySelectorAll('[data-calendar-navigation]').forEach((button) => {
    button.disabled = busy
    button.setAttribute('aria-disabled', String(busy || state.saving))
  })
  document.querySelectorAll('[data-calendar-view]').forEach((button) => {
    button.disabled = busy
    button.setAttribute('aria-disabled', String(busy || state.saving))
  })
  const status = elements.calendarShell.querySelector('[data-calendar-status]')
  if (status && busy) status.textContent = 'Loading your schedule\u2026'
}

async function playCalendarReel({
  anchors,
  direction,
  requestId,
  preservedViewport = null
}) {
  const finalAnchor = anchors[anchors.length - 1]
  if (!finalAnchor) {
    await renderCalendar({ preservedViewport })
    return
  }
  if (
    !motionAllowed()
    || !['forward', 'backward'].includes(direction)
  ) {
    state.calendar.anchorDate = new Date(finalAnchor)
    await renderCalendar({ preservedViewport })
    return
  }

  const stepDuration = Math.max(
    72,
    Math.min(220, Math.round(1800 / anchors.length))
  )
  for (let index = 0; index < anchors.length; index += 1) {
    if (requestId !== state.calendar.requestId) return
    const isLast = index === anchors.length - 1
    state.calendar.anchorDate = new Date(anchors[index])
    await renderCalendar({
      motionDirection: direction,
      motionDuration: stepDuration,
      motionEasing: isLast ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'linear',
      keepBusy: !isLast,
      preservedViewport
    })
  }
}

function captureCalendarNavigationViewport(button) {
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    focusedDirection: document.activeElement === button
      ? button.dataset.calendarNavigation
      : null
  }
}

function restoreCalendarNavigationViewport(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.scrollY)) return
  if (snapshot.focusedDirection) {
    elements.calendarShell.querySelector(
      `[data-calendar-navigation="${snapshot.focusedDirection}"]`
    )?.focus({ preventScroll: true })
  }
  const root = document.documentElement
  const maxScrollX = Math.max(0, root.scrollWidth - window.innerWidth)
  const maxScrollY = Math.max(0, root.scrollHeight - window.innerHeight)
  const targetX = Math.min(Math.max(0, snapshot.scrollX || 0), maxScrollX)
  const targetY = Math.min(Math.max(0, snapshot.scrollY), maxScrollY)
  if (
    Math.abs(window.scrollX - targetX) > 1
    || Math.abs(window.scrollY - targetY) > 1
  ) {
    window.scrollTo({ top: targetY, left: targetX, behavior: 'auto' })
  }
}

function calendarAnchorsBetween(previousAnchor, nextAnchor, view) {
  const direction = calendarMotionDirection(previousAnchor, nextAnchor)
  if (!direction) return []
  const navigationDirection = direction === 'forward' ? 'next' : 'previous'
  const targetRange = calendarRangeForView(nextAnchor, view)
  const anchors = []
  const boundedStart = calendarReelStart(previousAnchor, nextAnchor, view)
  let cursor = new Date(boundedStart)
  if (boundedStart.getTime() !== new Date(previousAnchor).getTime()) {
    anchors.push(new Date(boundedStart))
  }

  for (let step = 0; step < 600; step += 1) {
    const candidate = moveCalendarAnchor(cursor, view, navigationDirection)
    const candidateRange = calendarRangeForView(candidate, view)
    const reachedTarget = direction === 'forward'
      ? candidateRange.startDate >= targetRange.startDate
      : candidateRange.startDate <= targetRange.startDate
    if (reachedTarget) {
      anchors.push(new Date(nextAnchor))
      return anchors
    }
    anchors.push(candidate)
    cursor = candidate
  }

  anchors.push(new Date(nextAnchor))
  return anchors
}

function calendarMotionDirection(previousAnchor, nextAnchor) {
  const previousTime = new Date(previousAnchor).getTime()
  const nextTime = new Date(nextAnchor).getTime()
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return ''
  if (nextTime > previousTime) return 'forward'
  if (nextTime < previousTime) return 'backward'
  return ''
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

function applyCalendarEventPresentation(element, event) {
  const source = event.presentationColorSource || 'event_kind'
  element.dataset.colorSource = source

  if (
    source === 'module'
    && event.modulePresentation?.headerColor
    && event.modulePresentation?.rowColor
  ) {
    element.style.setProperty('--calendar-event-start', event.modulePresentation.rowColor)
    element.style.setProperty(
      '--calendar-event-end',
      `color-mix(in srgb, ${event.modulePresentation.rowColor} 58%, white)`
    )
    element.style.setProperty('--calendar-event-border', event.modulePresentation.headerColor)
    element.style.setProperty('--calendar-event-accent', event.modulePresentation.headerColor)
    return
  }

  if (source === 'classroom') {
    element.dataset.cardColor = state.dashboard?.classrooms
      ?.find((item) => item.courseId === event.courseId)?.card?.colorKey
      || event.colorKey
      || 'ocean'
  }
}

function calendarEventKindLabel(kind) {
  if (kind === 'regular_class') return 'Regular class'
  if (kind === 'extra_class') return 'Extra class'
  if (kind === 'independent_progress') return 'Independent study'
  if (kind === 'assignment_due') return 'Assignment due'
  if (kind === 'schedule_milestone') return 'Schedule milestone'
  if (kind === 'course_start') return 'Course begins'
  return 'Course ends'
}

function calendarEventCompactLabel(event) {
  return [
    event.eventCode || calendarEventCode(event.kind),
    event.educationLevel?.code,
    event.compactAcademicLabel || event.focus || event.subject
  ].filter(Boolean).join(' ')
}

function calendarEventFullLabel(event) {
  return calendarEventDescriptionLines(event).join(' · ')
}

function calendarEventDescriptionLines(event) {
  const label = calendarEventKindLabel(event.kind) || event.eventLabel || 'Calendar event'
  const notableStatuses = new Set([
    'awaiting', 'pending_confirmation', 'not_delivered', 'cancelled'
  ])
  const status = notableStatuses.has(event.status)
    ? ` · ${event.status.replaceAll('_', ' ')}`
    : ''
  const pathwayNames = Array.isArray(event.academicPathways)
    ? event.academicPathways.map((pathway) => pathway?.name).filter(Boolean)
    : []
  const educationContext = [
    event.educationLevel?.name,
    pathwayNames.join(' + ')
  ].filter(Boolean).join(' \u00b7 ')
  const academicContext = [event.subject, event.focus]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ')
  return [
    `${label}${status}`,
    educationContext,
    event.academicScope === 'course' && event.academicPath
      ? event.academicPath
      : academicContext,
    event.title || event.detail || event.courseTitle
  ].filter(Boolean)
}

function renderCalendarEventDescription(container, event) {
  container.replaceChildren()
  calendarEventDescriptionLines(event).forEach((line, index) => {
    const row = document.createElement(index === 0 ? 'strong' : 'span')
    row.className = `student-dashboard-calendar-description-line is-line-${index + 1}`
    row.textContent = line
    container.append(row)
  })
}

function calendarEventCode(kind) {
  return {
    course_start: 'CB',
    course_end: 'CE',
    schedule_milestone: 'SM',
    regular_class: 'RC',
    extra_class: 'EC',
    independent_progress: 'IP',
    assignment_due: 'AD'
  }[kind] || 'EV'
}

function formatCalendarDayHeading(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Scheduled items'
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
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

  document.addEventListener('click', closeClassroomCardMenusOutside)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const openMenu = elements.classroomCards.querySelector(
      '.student-dashboard-classroom-card-menu[open]'
    )
    if (!openMenu) return
    openMenu.open = false
    openMenu.querySelector('summary')?.focus({ preventScroll: true })
  })
}

function closeClassroomCardMenusOutside(event) {
  elements.classroomCards.querySelectorAll(
    '.student-dashboard-classroom-card-menu[open]'
  ).forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false
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
    ], { duration: 920, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
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
    if (up) {
      up.disabled = index <= 0
      up.setAttribute('aria-disabled', String(up.disabled || state.saving))
    }
    if (down) {
      down.disabled = index >= state.preferences.blockOrder.length - 1
      down.setAttribute('aria-disabled', String(down.disabled || state.saving))
    }
  })
}

function clearDropTargets() {
  document.querySelectorAll('[data-dashboard-block]').forEach((block) => {
    block.classList.remove('is-drop-target')
  })
}

function setPreferenceControlsBusy(busy) {
  elements.root.setAttribute('aria-busy', String(busy))
  document.querySelectorAll('[data-calendar-view]').forEach((button) => {
    button.setAttribute('aria-disabled', String(busy || button.disabled))
  })
  document.querySelectorAll('[data-calendar-navigation]').forEach((button) => {
    button.disabled = state.calendar.loading || state.calendar.transitioning
    button.setAttribute('aria-disabled', String(busy || button.disabled))
  })
  document.querySelectorAll('[data-toggle-dashboard-block]').forEach((button) => {
    button.disabled = false
    button.setAttribute('aria-disabled', String(busy))
  })
  document.querySelectorAll('[data-dashboard-drag-handle]').forEach((handle) => {
    handle.draggable = true
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
