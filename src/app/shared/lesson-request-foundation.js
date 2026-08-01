const PURPOSE_LABELS = Object.freeze({
  regular: 'Regular lesson',
  extra: 'Extra lesson',
  standalone: 'Standalone lesson'
})

export function createLessonRequestFoundation({
  dialogId,
  triggerId,
  storageScope = 'dashboard',
  hideTriggerWhenUnavailable = false
} = {}) {
  const dialog = document.getElementById(dialogId)
  const trigger = document.getElementById(triggerId)
  if (!dialog || !trigger) {
    throw new TypeError('The Lesson Request draft surface is incomplete.')
  }

  const elements = collectElements(dialog, trigger)
  const state = {
    payload: null,
    contexts: [],
    foundation: null,
    storageScope: String(storageScope || 'dashboard')
  }
  bindControls(elements, state)
  updateAvailability(elements, state, hideTriggerWhenUnavailable)

  return Object.freeze({
    setCalendarPayload(payload) {
      state.payload = payload || null
      state.contexts = Array.isArray(payload?.availabilityOverlay?.eligibleContexts)
        ? payload.availabilityOverlay.eligibleContexts
        : []
      state.foundation = payload?.lessonRequestFoundation || null
      const classroomId = String(payload?.contract?.classroomId || '').trim()
      if (classroomId) state.storageScope = classroomId
      renderOptions(elements, state)
      updateAvailability(elements, state, hideTriggerWhenUnavailable)
    },
    canStart() {
      return canStartDraft(state)
    },
    open({ proposedDate = '', proposedTime = '' } = {}) {
      openDraftDialog(elements, state, { proposedDate, proposedTime })
    }
  })
}

export function createLessonRequestDraft({
  scope,
  context,
  purpose,
  proposedDate,
  proposedTime,
  durationMinutes,
  message,
  now = new Date(),
  constraints = {}
} = {}) {
  const normalizedScope = ['dashboard', 'classroom'].includes(scope)
    ? scope
    : 'dashboard'
  const normalizedPurpose = String(purpose || '').trim().toLowerCase()
  const duration = Number(durationMinutes)
  const date = String(proposedDate || '').trim()
  const time = String(proposedTime || '').trim()
  const tutorId = String(context?.tutor?.id || '').trim()
  const courseId = String(context?.courseId || '').trim()
  const classroomId = String(context?.classroomId || '').trim()

  if (!tutorId || !courseId || !classroomId) {
    throw new TypeError('Choose an active Course and Tutor.')
  }
  if (!['regular', 'extra'].includes(normalizedPurpose)) {
    throw new TypeError('Choose an available lesson purpose.')
  }
  if (![30, 60, 90].includes(duration)) {
    throw new TypeError('Choose a supported lesson duration.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new TypeError('Choose a valid proposed date and time.')
  }

  const proposedStart = new Date(`${date}T${time}:00`)
  const currentTime = now instanceof Date ? new Date(now) : new Date(now)
  if (Number.isNaN(proposedStart.getTime()) || Number.isNaN(currentTime.getTime())) {
    throw new TypeError('Choose a valid proposed date and time.')
  }
  const minimumLeadMinutes = nonNegativeInteger(constraints.minimumLeadMinutes, 1440)
  const maximumAdvanceDays = nonNegativeInteger(constraints.maximumAdvanceDays, 14)
  const minimumStart = currentTime.getTime() + (minimumLeadMinutes * 60 * 1000)
  const maximumStart = currentTime.getTime() + (maximumAdvanceDays * 24 * 60 * 60 * 1000)
  if (proposedStart.getTime() < minimumStart) {
    throw new RangeError(`Choose a time at least ${formatLeadTime(minimumLeadMinutes)} ahead.`)
  }
  if (proposedStart.getTime() > maximumStart) {
    throw new RangeError(`Choose a time no more than ${maximumAdvanceDays} days ahead.`)
  }

  const timestamp = new Date().toISOString()
  return Object.freeze({
    schemaVersion: 1,
    status: 'local_draft',
    scope: normalizedScope,
    tutor: Object.freeze({
      id: tutorId,
      name: String(context.tutor.name || 'Tutor')
    }),
    course: Object.freeze({
      id: courseId,
      classroomId,
      title: String(context.courseTitle || 'Course'),
      subject: String(context.subject || 'Subject'),
      track: String(context.focus || '')
    }),
    purpose: normalizedPurpose,
    proposedDate: date,
    proposedTime: time,
    proposedStartLocal: `${date}T${time}:00`,
    durationMinutes: duration,
    message: String(message || '').trim().slice(0, 1000),
    createdAt: timestamp,
    requestSubmitted: false,
    availabilityReserved: false,
    classCreated: false
  })
}

function collectElements(dialog, trigger) {
  const query = (name) => dialog.querySelector(`[data-lesson-request="${name}"]`)
  const elements = {
    dialog,
    trigger,
    form: query('form'),
    close: query('close'),
    cancel: query('cancel'),
    tutor: query('tutor'),
    context: query('context'),
    purpose: query('purpose'),
    date: query('date'),
    time: query('time'),
    duration: query('duration'),
    message: query('message'),
    feedback: query('feedback'),
    save: query('save')
  }
  if (Object.values(elements).some((value) => !value)) {
    throw new TypeError('The Lesson Request draft form is incomplete.')
  }
  return elements
}

function bindControls(elements, state) {
  elements.trigger.addEventListener('click', () => {
    openDraftDialog(elements, state)
  })
  elements.close.addEventListener('click', () => elements.dialog.close())
  elements.cancel.addEventListener('click', () => elements.dialog.close())
  elements.dialog.addEventListener('click', (event) => {
    if (event.target === elements.dialog) elements.dialog.close()
  })
  elements.tutor.addEventListener('change', () => {
    renderContextOptions(elements, state)
    clearFeedback(elements)
  })
  elements.context.addEventListener('change', () => clearFeedback(elements))
  elements.form.addEventListener('input', () => clearFeedback(elements))
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault()
    saveDraft(elements, state)
  })
}

function updateAvailability(elements, state, hideTriggerWhenUnavailable) {
  const available = canStartDraft(state)
  elements.trigger.hidden = hideTriggerWhenUnavailable && !available
  elements.trigger.disabled = !available
  elements.trigger.setAttribute('aria-disabled', String(!available))
  elements.trigger.title = available
    ? 'Start a Lesson Request draft'
    : 'No active Tutor and Course context is available'
}

function canStartDraft(state) {
  return Boolean(
    state.foundation?.canStart
    && state.foundation?.status === 'local_draft_active_phase_5h'
    && state.contexts.length
  )
}

function renderOptions(elements, state) {
  renderTutorOptions(elements, state)
  renderContextOptions(elements, state)
  renderPurposeOptions(elements, state)
  renderDurationOptions(elements, state)
}

function renderTutorOptions(elements, state) {
  const previousValue = elements.tutor.value
  const tutors = uniqueTutors(state.contexts)
  elements.tutor.replaceChildren()
  for (const tutor of tutors) {
    elements.tutor.append(createOption(tutor.id, tutor.name))
  }
  elements.tutor.value = tutors.some((tutor) => tutor.id === previousValue)
    ? previousValue
    : tutors[0]?.id || ''
  elements.tutor.disabled = state.foundation?.tutorSelection
    === 'assigned_classroom_tutor_locked'
}

function renderContextOptions(elements, state) {
  const previousValue = elements.context.value
  const tutorId = elements.tutor.value
  const contexts = state.contexts.filter((context) => context.tutor.id === tutorId)
  elements.context.replaceChildren()
  for (const context of contexts) {
    elements.context.append(
      createOption(context.courseId, lessonContextLabel(context))
    )
  }
  elements.context.value = contexts.some((context) => context.courseId === previousValue)
    ? previousValue
    : contexts[0]?.courseId || ''
  elements.context.disabled = state.foundation?.contextSelection === 'current_course_locked'
}

function renderPurposeOptions(elements, state) {
  const previousValue = elements.purpose.value
  const purposes = (state.foundation?.purposeOptions || [])
    .filter((purpose) => purpose.status === 'draftable')
  elements.purpose.replaceChildren()
  for (const purpose of purposes) {
    elements.purpose.append(
      createOption(purpose.key, PURPOSE_LABELS[purpose.key] || purpose.key)
    )
  }
  elements.purpose.value = purposes.some((purpose) => purpose.key === previousValue)
    ? previousValue
    : purposes.find((purpose) => purpose.key === 'extra')?.key
      || purposes[0]?.key
      || ''
}

function renderDurationOptions(elements, state) {
  const previousValue = Number(elements.duration.value)
  const durations = state.foundation?.durationMinutes || []
  elements.duration.replaceChildren()
  for (const duration of durations) {
    elements.duration.append(
      createOption(String(duration), `${duration} minutes`)
    )
  }
  elements.duration.value = durations.includes(previousValue)
    ? String(previousValue)
    : String(durations.includes(60) ? 60 : durations[0] || '')
}

function openDraftDialog(elements, state, {
  proposedDate = '',
  proposedTime = ''
} = {}) {
  if (!canStartDraft(state) || typeof elements.dialog.showModal !== 'function') return
  renderOptions(elements, state)
  restoreDraft(elements, state)
  const defaultStart = defaultProposedStart(
    state.foundation.constraints?.minimumLeadMinutes
  )
  elements.date.min = formatDate(defaultStart)
  elements.date.max = formatDate(
    new Date(
      Date.now()
      + (state.foundation.constraints?.maximumAdvanceDays || 14) * 24 * 60 * 60 * 1000
    )
  )
  if (proposedDate) elements.date.value = proposedDate
  else if (!elements.date.value) elements.date.value = formatDate(defaultStart)
  if (proposedTime) elements.time.value = proposedTime
  else if (!elements.time.value) elements.time.value = formatTime(defaultStart)
  clearFeedback(elements)
  elements.dialog.showModal()
  elements.tutor.focus({ preventScroll: true })
}

function saveDraft(elements, state) {
  const context = selectedContext(elements, state)
  try {
    const draft = createLessonRequestDraft({
      scope: state.foundation.scope,
      context,
      purpose: elements.purpose.value,
      proposedDate: elements.date.value,
      proposedTime: elements.time.value,
      durationMinutes: elements.duration.value,
      message: elements.message.value,
      constraints: state.foundation.constraints
    })
    sessionStorage.setItem(storageKey(state), JSON.stringify(draft))
    elements.feedback.dataset.state = 'success'
    elements.feedback.textContent =
      `Draft saved for ${formatDraftDate(draft)}. No lesson request was sent.`
  } catch (error) {
    elements.feedback.dataset.state = 'error'
    elements.feedback.textContent = error?.message || 'This draft could not be saved.'
  }
}

function restoreDraft(elements, state) {
  let draft = null
  try {
    draft = JSON.parse(sessionStorage.getItem(storageKey(state)) || 'null')
  } catch {
    draft = null
  }
  if (!draft || draft.schemaVersion !== 1 || draft.status !== 'local_draft') return
  if (state.contexts.some((context) => context.tutor.id === draft.tutor?.id)) {
    elements.tutor.value = draft.tutor.id
    renderContextOptions(elements, state)
  }
  if (state.contexts.some((context) => context.courseId === draft.course?.id)) {
    elements.context.value = draft.course.id
  }
  if ([...elements.purpose.options].some((option) => option.value === draft.purpose)) {
    elements.purpose.value = draft.purpose
  }
  if ([...elements.duration.options].some(
    (option) => Number(option.value) === Number(draft.durationMinutes)
  )) {
    elements.duration.value = String(draft.durationMinutes)
  }
  elements.date.value = String(draft.proposedDate || '')
  elements.time.value = String(draft.proposedTime || '')
  elements.message.value = String(draft.message || '')
}

function selectedContext(elements, state) {
  return state.contexts.find((context) => (
    context.tutor.id === elements.tutor.value
    && context.courseId === elements.context.value
  ))
}

function uniqueTutors(contexts) {
  const tutors = new Map()
  for (const context of contexts) {
    if (!tutors.has(context.tutor.id)) tutors.set(context.tutor.id, context.tutor)
  }
  return [...tutors.values()]
}

function lessonContextLabel(context) {
  const academic = [context.subject, context.focus]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' / ')
  return [context.courseTitle, academic].filter(Boolean).join(' - ')
}

function createOption(value, label) {
  const option = document.createElement('option')
  option.value = value
  option.textContent = label
  return option
}

function defaultProposedStart(minimumLeadMinutes = 1440) {
  const date = new Date(Date.now() + nonNegativeInteger(minimumLeadMinutes, 1440) * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0)
  return date
}

function storageKey(state) {
  return `kelp.lesson-request-draft.v1.${state.foundation?.scope || 'dashboard'}.${state.storageScope}`
}

function clearFeedback(elements) {
  elements.feedback.textContent = ''
  delete elements.feedback.dataset.state
}

function formatLeadTime(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  return `${minutes} minutes`
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDraftDate(draft) {
  const date = new Date(`${draft.proposedDate}T${draft.proposedTime}:00`)
  if (Number.isNaN(date.getTime())) return draft.proposedDate
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}
