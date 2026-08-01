import {
  getClassroomCalendarData,
  getStudentClassroomCalendarData
} from '../../data/studentData.js'
import {
  calendarReelStart,
  calendarRangeForView,
  moveCalendarAnchor
} from '../dashboard/student-dashboard-contract.js'
import { createLessonRequestFoundation } from '../shared/lesson-request-foundation.js'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CALENDAR_ROLES = new Set(['student', 'tutor', 'mentor'])
const ACTIVE_COURSE_STATUSES = new Set(['active', 'wind_down'])

export function createClassroomCalendarController() {
  const elements = collectElements()
  const lessonRequest = createLessonRequestFoundation({
    dialogId: 'classroom-lesson-request-dialog',
    triggerId: 'classroom-calendar-request-lesson',
    storageScope: 'classroom',
    hideTriggerWhenUnavailable: true
  })
  const state = {
    classroom: null,
    lessonRequest,
    view: 'month',
    anchorDate: todayAtNoon(),
    payload: null,
    loading: false,
    transitioning: false,
    transitionId: 0,
    error: '',
    requestId: 0
  }

  bindControls(elements, state)

  return Object.freeze({
    setContext(classroom) {
      const previousClassroomId = state.classroom?.classroom?.id || ''
      state.classroom = classroom
      const available = classroomCalendarIsAvailable(classroom)
      elements.card.hidden = !available
      if (!available) {
        state.payload = null
        state.error = ''
        state.lessonRequest.setCalendarPayload(null)
        return
      }

      elements.card.dataset.membershipRole = classroom.viewer.membershipRole
      if (previousClassroomId !== classroom.classroom.id) {
        state.anchorDate = todayAtNoon()
        state.payload = null
        state.error = ''
        state.lessonRequest.setCalendarPayload(null)
        renderCalendar(elements, state)
      }
    },
    load(options = {}) {
      return loadCalendar(elements, state, options)
    }
  })
}

function collectElements() {
  const card = document.getElementById('classroom-calendar-card')
  const shell = document.getElementById('classroom-calendar-shell')
  if (!card || !shell) {
    throw new TypeError('The Classroom Calendar surface is incomplete.')
  }
  return {
    card,
    shell,
    viewButtons: [...document.querySelectorAll('[data-classroom-calendar-view]')],
    legendDialog: document.getElementById('classroom-calendar-legend-dialog'),
    dayDialog: document.getElementById('classroom-calendar-day-dialog'),
    dayDialogTitle: document.getElementById('classroom-calendar-day-dialog-title'),
    dayDialogEvents: document.getElementById('classroom-calendar-day-dialog-events'),
    tooltip: document.getElementById('classroom-calendar-event-tooltip')
  }
}

function bindControls(elements, state) {
  elements.viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.classroomCalendarView
      if (
        !['month', 'week'].includes(nextView)
        || nextView === state.view
        || state.loading
        || state.transitioning
      ) return
      state.view = nextView
      void loadCalendar(elements, state, { force: true })
    })
  })

  elements.shell.addEventListener('click', (event) => {
    const requestDate = event.target.closest('[data-request-lesson-date]')
    if (requestDate) {
      state.lessonRequest.open({
        proposedDate: requestDate.dataset.requestLessonDate
      })
      return
    }
    const navigation = event.target.closest('[data-classroom-calendar-navigation]')
    if (navigation) {
      navigateCalendar(
        elements,
        state,
        navigation.dataset.classroomCalendarNavigation,
        navigation
      )
      return
    }
    if (event.target.closest('[data-open-classroom-calendar-helper]')) {
      elements.legendDialog?.showModal()
      return
    }
    const overflow = event.target.closest('[data-open-classroom-calendar-day]')
    if (overflow) openCalendarDayDialog(elements, state, overflow.dataset.openClassroomCalendarDay)
  })

  for (const dialog of [elements.legendDialog, elements.dayDialog]) {
    if (!dialog) continue
    dialog.addEventListener('click', (event) => {
      if (
        event.target === dialog
        || event.target.closest('[data-close-classroom-calendar-dialog]')
      ) dialog.close()
    })
  }

  elements.shell.addEventListener('pointerover', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent) showCalendarEventTooltip(elements, state, calendarEvent)
  })
  elements.shell.addEventListener('pointerout', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent && !calendarEvent.contains(event.relatedTarget)) {
      hideCalendarEventTooltip(elements)
    }
  })
  elements.shell.addEventListener('focusin', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent) showCalendarEventTooltip(elements, state, calendarEvent)
  })
  elements.shell.addEventListener('focusout', (event) => {
    const calendarEvent = event.target.closest('.student-dashboard-calendar-event:not(.is-expanded)')
    if (calendarEvent && !calendarEvent.contains(event.relatedTarget)) {
      hideCalendarEventTooltip(elements)
    }
  })
}

function classroomCalendarIsAvailable(classroom) {
  return Boolean(
    classroom
    && CALENDAR_ROLES.has(classroom.viewer?.membershipRole)
    && classroom.viewer?.membershipStatus === 'active'
    && classroom.classroom?.status === 'active'
    && !classroom.classroom?.readOnly
    && ACTIVE_COURSE_STATUSES.has(classroom.course?.status)
  )
}

function calendarDataLoaderForClassroom(classroom) {
  return classroom?.viewer?.membershipRole === 'student'
    ? getStudentClassroomCalendarData
    : getClassroomCalendarData
}

async function loadCalendar(elements, state, {
  force = false,
  motionDirection = '',
  fallbackAnchor = null,
  preservedViewport = null,
  reelAnchors = []
} = {}) {
  if (!classroomCalendarIsAvailable(state.classroom)) return
  const range = calendarRangeForView(state.anchorDate, state.view)
  if (
    !force
    && state.payload
    && state.payload.range.startDate === range.startDate
    && state.payload.range.endDate === range.endDate
  ) {
    await renderCalendar(elements, state)
    return
  }

  const requestId = state.requestId + 1
  state.requestId = requestId
  state.loading = true
  state.error = ''
  const currentViewport = elements.shell.querySelector(
    ':scope > .student-dashboard-calendar-motion-viewport'
  )
  const preserveCurrentPeriod = Boolean(
    motionDirection && currentViewport?.firstElementChild
  )
  if (preserveCurrentPeriod) setRenderedCalendarBusy(elements, state, true)
  else await renderCalendar(elements, state)

  let loaded = false
  try {
    const getCalendarData = calendarDataLoaderForClassroom(state.classroom)
    const payload = await getCalendarData(
      state.classroom.classroom.id,
      range.startDate,
      range.endDate
    )
    if (requestId !== state.requestId) return
    state.payload = payload
    state.lessonRequest.setCalendarPayload(payload)
    loaded = true
  } catch (error) {
    if (requestId !== state.requestId) return
    console.error('Classroom Calendar failed:', error)
    if (fallbackAnchor) state.anchorDate = new Date(fallbackAnchor)
    if (!state.payload) state.lessonRequest.setCalendarPayload(null)
    state.error = calendarErrorMessage(error)
  } finally {
    if (requestId !== state.requestId) return
    state.loading = false
    if (loaded && reelAnchors.length > 1) {
      await playCalendarReel(elements, state, {
        anchors: reelAnchors,
        direction: motionDirection,
        requestId,
        preservedViewport
      })
    } else {
      await renderCalendar(elements, state, {
        motionDirection: loaded ? motionDirection : '',
        preservedViewport
      })
    }
  }
}

function navigateCalendar(elements, state, direction, navigationButton = null) {
  if (
    state.loading
    || state.transitioning
    || !['previous', 'today', 'next'].includes(direction)
  ) return
  const preservedViewport = captureCalendarNavigationViewport(
    navigationButton,
    'classroomCalendarNavigation'
  )
  hideCalendarEventTooltip(elements)
  const previousAnchor = new Date(state.anchorDate)
  const nextAnchor = direction === 'today'
    ? todayAtNoon()
    : moveCalendarAnchor(state.anchorDate, state.view, direction)
  const previousRange = calendarRangeForView(previousAnchor, state.view)
  const nextRange = calendarRangeForView(nextAnchor, state.view)
  state.anchorDate = nextAnchor
  if (
    previousRange.startDate === nextRange.startDate
    && previousRange.endDate === nextRange.endDate
  ) {
    void renderCalendar(elements, state, { preservedViewport })
    return
  }
  const motionDirection = calendarMotionDirection(previousAnchor, nextAnchor)
  void loadCalendar(elements, state, {
    force: true,
    motionDirection,
    fallbackAnchor: previousAnchor,
    preservedViewport,
    reelAnchors: direction === 'today'
      ? calendarAnchorsBetween(previousAnchor, nextAnchor, state.view)
      : []
  })
}

function renderCalendar(elements, state, {
  motionDirection = '',
  motionDuration = 380,
  motionEasing = 'cubic-bezier(0.22, 1, 0.36, 1)',
  keepBusy = false,
  preservedViewport = null
} = {}) {
  if (elements.card.hidden) return Promise.resolve()
  const currentViewport = elements.shell.querySelector(
    ':scope > .student-dashboard-calendar-motion-viewport'
  )
  const shouldTransition = Boolean(
    ['forward', 'backward'].includes(motionDirection)
    && motionAllowed()
    && currentViewport?.firstElementChild
  )
  const transitionId = state.transitionId + 1
  state.transitionId = transitionId
  state.transitioning = shouldTransition || keepBusy
  updateCalendarControls(elements, state)

  const heading = createCalendarHeading(state)
  let content
  if (state.error) {
    content = document.createElement('p')
    content.className = 'student-dashboard-calendar-error'
    content.setAttribute('role', 'alert')
    content.textContent = state.error
  } else {
    content = document.createElement('div')
    content.className = `student-dashboard-calendar-canvas is-${state.view}`
    if (state.view === 'month') renderMonthCalendar(content, state)
    else renderWeekCalendar(content, state)
  }
  content.classList.add('calendar-motion-panel')

  if (shouldTransition) {
    const currentHeading = elements.shell.querySelector(
      ':scope > .student-dashboard-calendar-heading'
    )
    if (currentHeading) currentHeading.replaceWith(heading)
    else elements.shell.prepend(heading)
    restoreCalendarNavigationViewport(
      elements.shell,
      preservedViewport,
      'classroom-calendar-navigation'
    )
    return new Promise((resolve) => {
      animateCalendarReel(currentViewport, content, motionDirection, () => {
        if (state.transitionId === transitionId) {
          state.transitioning = keepBusy
          updateCalendarControls(elements, state)
        }
        restoreCalendarNavigationViewport(
          elements.shell,
          preservedViewport,
          'classroom-calendar-navigation'
        )
        resolve()
      }, {
        duration: motionDuration,
        easing: motionEasing
      })
    })
  }

  state.transitioning = keepBusy
  const viewport = document.createElement('div')
  viewport.className = 'calendar-motion-viewport student-dashboard-calendar-motion-viewport'
  viewport.append(content)
  elements.shell.replaceChildren(heading, viewport)
  updateCalendarControls(elements, state)
  restoreCalendarNavigationViewport(
    elements.shell,
    preservedViewport,
    'classroom-calendar-navigation'
  )
  return Promise.resolve()
}

function createCalendarHeading(state) {
  const heading = document.createElement('div')
  heading.className = 'student-dashboard-calendar-heading'
  const copy = document.createElement('div')
  copy.className = 'student-dashboard-calendar-heading-copy'
  const titleLine = document.createElement('div')
  titleLine.className = 'student-dashboard-calendar-heading-title'
  const title = document.createElement('strong')
  title.textContent = state.view === 'month'
    ? `${MONTH_NAMES[state.anchorDate.getMonth()]} ${state.anchorDate.getFullYear()}`
    : describeCurrentWeek(state.anchorDate)
  const helper = document.createElement('button')
  helper.type = 'button'
  helper.className = 'student-dashboard-calendar-helper'
  helper.dataset.openClassroomCalendarHelper = ''
  helper.textContent = 'i'
  helper.setAttribute('aria-label', 'Explain Calendar abbreviations')
  titleLine.append(title, helper)
  const status = document.createElement('span')
  status.dataset.classroomCalendarStatus = ''
  status.textContent = calendarStatusText(state)
  copy.append(titleLine, status)

  const navigation = document.createElement('div')
  navigation.className = 'student-dashboard-calendar-navigation'
  navigation.setAttribute('aria-label', 'Navigate Classroom Calendar dates')
  navigation.append(
    createNavigationButton(state, 'previous', 'Previous', 'Previous Calendar period'),
    createNavigationButton(state, 'today', 'Today', 'Return to today'),
    createNavigationButton(state, 'next', 'Next', 'Next Calendar period')
  )
  heading.append(copy, navigation)
  return heading
}

function createNavigationButton(state, direction, label, accessibleName) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.classroomCalendarNavigation = direction
  button.textContent = label
  button.setAttribute('aria-label', accessibleName)
  button.disabled = state.loading || state.transitioning
  return button
}

function updateCalendarControls(elements, state) {
  const busy = state.loading || state.transitioning
  elements.shell.setAttribute('aria-busy', String(busy))
  elements.shell.querySelectorAll('[data-classroom-calendar-navigation]').forEach((button) => {
    button.disabled = busy
  })
  elements.viewButtons.forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.classroomCalendarView === state.view)
    )
    button.disabled = busy
  })
  const status = elements.shell.querySelector('[data-classroom-calendar-status]')
  if (status && busy) status.textContent = 'Loading Course Calendar\u2026'
}

function setRenderedCalendarBusy(elements, state, busy) {
  elements.shell.setAttribute('aria-busy', String(busy))
  elements.shell.querySelectorAll('[data-classroom-calendar-navigation]').forEach((button) => {
    button.disabled = busy
  })
  elements.viewButtons.forEach((button) => { button.disabled = busy })
  const status = elements.shell.querySelector('[data-classroom-calendar-status]')
  if (status && busy) status.textContent = 'Loading Course Calendar\u2026'
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
  currentPanel.inert = true
  currentPanel.setAttribute('aria-hidden', 'true')
  nextPanel.inert = true
  viewport.classList.add('is-transitioning')
  viewport.append(nextPanel)
  const nextHeight = nextPanel.getBoundingClientRect().height
  viewport.style.height = `${Math.max(currentHeight, nextHeight)}px`
  const options = { duration, easing, fill: 'both' }
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

function renderMonthCalendar(canvas, state) {
  const date = state.anchorDate
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
  for (let cellIndex = 0; cellIndex < 42; cellIndex += 1) {
    const dayNumber = cellIndex - leadingCells + 1
    const cell = document.createElement('div')
    cell.className = 'student-dashboard-calendar-date-cell'
    cell.setAttribute('role', 'gridcell')
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cell.classList.add('is-outside-month')
      cell.setAttribute('aria-hidden', 'true')
    } else {
      const dateKey = formatCalendarDate(new Date(year, month, dayNumber, 12))
      const dayEvents = calendarEventsForDate(state, dateKey)
      const canRequestLesson = state.lessonRequest.canStart()
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
      cell.setAttribute(
        'aria-label',
        `${MONTH_NAMES[month]} ${dayNumber}, ${year}${eventCountLabel(dayEvents)}`
      )
      if (dateKey === formatCalendarDate(todayAtNoon())) {
        cell.classList.add('is-today')
        cell.setAttribute('aria-current', 'date')
      }
      cell.append(number)
      appendCalendarEvents(cell, state, dayEvents, { dateKey, visibleLimit: 2 })
    }
    canvas.append(cell)
  }
}

function renderWeekCalendar(canvas, state) {
  const start = new Date(state.anchorDate)
  start.setDate(state.anchorDate.getDate() - state.anchorDate.getDay())
  canvas.setAttribute('role', 'grid')
  canvas.setAttribute('aria-label', describeCurrentWeek(state.anchorDate))
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + dayIndex)
    const dateKey = formatCalendarDate(date)
    const dayEvents = calendarEventsForDate(state, dateKey)
    const column = document.createElement('div')
    column.className = 'student-dashboard-calendar-column'
    column.setAttribute('role', 'gridcell')
    column.setAttribute(
      'aria-label',
      `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}${eventCountLabel(dayEvents)}`
    )
    if (dateKey === formatCalendarDate(todayAtNoon())) {
      column.classList.add('is-today')
      column.setAttribute('aria-current', 'date')
    }
    const canRequestLesson = state.lessonRequest.canStart()
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
    appendCalendarEvents(column, state, dayEvents, { dateKey, visibleLimit: 4 })
    if (!dayEvents.length && !state.loading) {
      const empty = document.createElement('span')
      empty.className = 'student-dashboard-calendar-empty'
      empty.textContent = 'No items'
      column.append(empty)
    }
    canvas.append(column)
  }
}

function eventCountLabel(events) {
  if (!events.length) return ''
  return `, ${events.length} scheduled ${events.length === 1 ? 'item' : 'items'}`
}

function appendCalendarEvents(
  container,
  state,
  events,
  { dateKey = '', visibleLimit = events.length } = {}
) {
  if (state.loading && !events.length) {
    const loading = document.createElement('span')
    loading.className = 'student-dashboard-calendar-empty'
    loading.textContent = 'Loading\u2026'
    container.append(loading)
    return
  }
  events.slice(0, visibleLimit).forEach((event) => {
    container.append(createCalendarEventLink(state, event))
  })
  if (events.length <= visibleLimit) return
  const overflow = document.createElement('button')
  overflow.type = 'button'
  overflow.className = 'student-dashboard-calendar-overflow'
  overflow.dataset.openClassroomCalendarDay = dateKey
  overflow.textContent = `+${events.length - visibleLimit} more`
  overflow.setAttribute(
    'aria-label',
    `Show all ${events.length} scheduled items for ${formatCalendarDayHeading(dateKey)}`
  )
  container.append(overflow)
}

function createCalendarEventLink(state, event, { expanded = false } = {}) {
  const link = document.createElement('a')
  link.className = `student-dashboard-calendar-event is-${event.kind}`
  if (expanded) link.classList.add('is-expanded')
  applyCalendarEventPresentation(link, event)
  link.href = calendarEventDestination(state, event)
  link.dataset.eventId = event.id
  if (expanded) renderCalendarEventDescription(link, event)
  else link.textContent = calendarEventCompactLabel(event)
  link.setAttribute('aria-label', calendarEventDescriptionLines(event).join(' \u00b7 '))
  return link
}

function calendarEventDestination(state, event) {
  if (event.action?.type === 'open_practice') {
    return `../course-builder/course-practice.html?assignment=${encodeURIComponent(
      event.action.assignmentId
    )}`
  }
  if (event.action?.type === 'open_track_session' && event.action.href) {
    return event.action.href
  }
  const destination = new URL(window.location.href)
  destination.searchParams.set('classroom', state.classroom.classroom.id)
  destination.searchParams.set('area', 'schedule')
  return destination.href
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
  } else if (source === 'classroom') {
    element.dataset.cardColor = event.colorKey || 'ocean'
  }
}

function openCalendarDayDialog(elements, state, dateKey) {
  if (!elements.dayDialog || typeof elements.dayDialog.showModal !== 'function') return
  elements.dayDialogTitle.textContent = formatCalendarDayHeading(dateKey)
  elements.dayDialogEvents.replaceChildren()
  for (const event of calendarEventsForDate(state, dateKey)) {
    elements.dayDialogEvents.append(createCalendarEventLink(state, event, { expanded: true }))
  }
  elements.dayDialog.showModal()
}

function showCalendarEventTooltip(elements, state, calendarEvent) {
  const event = state.payload?.events?.find((item) => item.id === calendarEvent.dataset.eventId)
  if (!elements.tooltip || !event) return
  renderCalendarEventDescription(elements.tooltip, event)
  elements.tooltip.hidden = false
  elements.tooltip.style.left = '0px'
  elements.tooltip.style.top = '0px'
  elements.tooltip.style.maxWidth = ''

  const shellBounds = elements.shell.getBoundingClientRect()
  const eventBounds = calendarEvent.getBoundingClientRect()
  const availableWidth = Math.max(180, shellBounds.width - 16)
  elements.tooltip.style.maxWidth = `${Math.min(300, availableWidth)}px`
  const tooltipBounds = elements.tooltip.getBoundingClientRect()
  const minimumLeft = Math.max(shellBounds.left + 8, 8)
  const maximumLeft = Math.max(
    minimumLeft,
    Math.min(
      shellBounds.right - tooltipBounds.width - 8,
      window.innerWidth - tooltipBounds.width - 8
    )
  )
  const left = Math.min(Math.max(eventBounds.left, minimumLeft), maximumLeft)
  let top = eventBounds.bottom + 6
  if (top + tooltipBounds.height > window.innerHeight - 8) {
    top = eventBounds.top - tooltipBounds.height - 6
  }
  top = Math.min(
    Math.max(top, 8),
    Math.max(8, window.innerHeight - tooltipBounds.height - 8)
  )
  elements.tooltip.style.left = `${Math.round(left)}px`
  elements.tooltip.style.top = `${Math.round(top)}px`
}

function hideCalendarEventTooltip(elements) {
  if (elements.tooltip) elements.tooltip.hidden = true
}

async function playCalendarReel(elements, state, {
  anchors,
  direction,
  requestId,
  preservedViewport = null
}) {
  const finalAnchor = anchors[anchors.length - 1]
  if (!finalAnchor) {
    await renderCalendar(elements, state, { preservedViewport })
    return
  }
  if (!motionAllowed() || !['forward', 'backward'].includes(direction)) {
    state.anchorDate = new Date(finalAnchor)
    await renderCalendar(elements, state, { preservedViewport })
    return
  }
  const stepDuration = Math.max(72, Math.min(220, Math.round(1800 / anchors.length)))
  for (let index = 0; index < anchors.length; index += 1) {
    if (requestId !== state.requestId) return
    const isLast = index === anchors.length - 1
    state.anchorDate = new Date(anchors[index])
    await renderCalendar(elements, state, {
      motionDirection: direction,
      motionDuration: stepDuration,
      motionEasing: isLast ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'linear',
      keepBusy: !isLast,
      preservedViewport
    })
  }
}

function captureCalendarNavigationViewport(button, datasetKey) {
  return {
    focusedDirection: button && document.activeElement === button
      ? button.dataset[datasetKey]
      : null
  }
}

function restoreCalendarNavigationViewport(shell, snapshot, dataAttribute) {
  if (!snapshot?.focusedDirection) return
  shell.querySelector(
    `[data-${dataAttribute}="${snapshot.focusedDirection}"]`
  )?.focus({ preventScroll: true })
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

function visibleCalendarEvents(state) {
  const range = calendarRangeForView(state.anchorDate, state.view)
  return (state.payload?.events || []).filter((event) => (
    event.startsOn >= range.startDate && event.startsOn <= range.endDate
  ))
}

function calendarEventsForDate(state, dateKey) {
  return visibleCalendarEvents(state).filter((event) => event.startsOn === dateKey)
}

function calendarStatusText(state) {
  if (state.loading) return 'Loading Course Calendar\u2026'
  if (state.error) return 'Course Calendar unavailable'
  const events = visibleCalendarEvents(state)
  const timeZone = state.payload?.range?.timeZone || 'UTC'
  return `${events.length} scheduled ${events.length === 1 ? 'item' : 'items'} \u00b7 ${timeZone}`
}

function calendarEventCompactLabel(event) {
  return [
    event.eventCode || calendarEventCode(event.kind),
    event.educationLevel?.code,
    event.compactAcademicLabel || event.focus || event.subject
  ].filter(Boolean).join(' ')
}

function calendarEventDescriptionLines(event) {
  const notableStatuses = new Set([
    'awaiting', 'pending_confirmation', 'not_delivered', 'cancelled'
  ])
  const status = notableStatuses.has(event.status)
    ? ` \u00b7 ${event.status.replaceAll('_', ' ')}`
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
    .join(' \u00b7 ')
  return [
    `${calendarEventKindLabel(event.kind)}${status}`,
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

function calendarEventKindLabel(kind) {
  return {
    course_start: 'Course begins',
    course_end: 'Course ends',
    schedule_milestone: 'Schedule milestone',
    regular_class: 'Regular class',
    extra_class: 'Extra class',
    independent_progress: 'Independent study',
    assignment_due: 'Assignment due'
  }[kind] || 'Calendar event'
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

function calendarMotionDirection(previousAnchor, nextAnchor) {
  const previousTime = new Date(previousAnchor).getTime()
  const nextTime = new Date(nextAnchor).getTime()
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return ''
  if (nextTime > previousTime) return 'forward'
  if (nextTime < previousTime) return 'backward'
  return ''
}

function describeCurrentWeek(anchorDate) {
  const start = new Date(anchorDate)
  start.setDate(anchorDate.getDate() - anchorDate.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`
  }
  return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} - ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
}

function formatCalendarDayHeading(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Scheduled items'
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

function formatCalendarDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayAtNoon() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
}

function motionAllowed() {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function calendarErrorMessage(error) {
  const message = String(error?.message || '').trim()
  if (
    /get_my_classroom_calendar/i.test(message)
    && /schema cache|could not find the function/i.test(message)
  ) {
    return 'Classroom Calendar setup is still being completed. Reload after the service update finishes.'
  }
  return message || 'This Course Calendar could not be loaded.'
}
