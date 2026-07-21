import { requireCapability } from '../../auth/auth-guard.js'
import { supabase } from '../../lib/supabase/supabaseClient.js'
import { createSupabaseCourseAssignmentAdapters } from './course-assignment-adapters.js'
import {
  countAnsweredResponses,
  normalizePracticeResponses
} from './course-assignment-domain.js'

const shell = document.getElementById('practice-player-shell')
const saveState = document.getElementById('practice-save-state')

const state = {
  adapters: null,
  assignment: null,
  attempt: null,
  responses: {},
  index: 0,
  busy: false,
  dirty: false,
  submitted: false
}

shell?.addEventListener('input', handleResponseEvent)
shell?.addEventListener('change', handleResponseEvent)
shell?.addEventListener('click', handlePlayerClick)
window.addEventListener('beforeunload', (event) => {
  if (!state.dirty || state.submitted) return
  event.preventDefault()
  event.returnValue = ''
})

init().catch(renderFatalError)

async function init() {
  const current = await requireCapability(['practice.attempt'])
  if (!current) return
  const assignmentId = new URLSearchParams(window.location.search).get('assignment')
  if (!assignmentId) throw new Error('Choose an assigned activity from My practice.')
  state.adapters = createSupabaseCourseAssignmentAdapters({ supabase })
  setSaveState('Loading activity…')
  state.assignment = await state.adapters.loadPractice(assignmentId)
  state.attempt = await state.adapters.startPractice(assignmentId)
  state.responses = normalizePracticeResponses(state.attempt.responses, state.assignment.questions)
  renderPlayer()
  setSaveState(`Attempt ${state.attempt.attemptNumber} · Saved`)
}

function renderPlayer() {
  if (!state.assignment?.questions?.length) {
    shell.innerHTML = '<p class="practice-empty">This assignment snapshot contains no questions.</p>'
    return
  }
  const question = state.assignment.questions[state.index]
  const answered = countAnsweredResponses(state.responses, state.assignment.questions)
  const progress = (answered / state.assignment.questions.length) * 100
  shell.innerHTML = `
    <header class="practice-player-heading">
      <div>
        <p class="page-kicker">${escapeHTML(state.assignment.schedule.sessionTitle)} · ${escapeHTML(formatDate(state.assignment.schedule.scheduledDate))}</p>
        <h1>${escapeHTML(state.assignment.courseTitle)}</h1>
        <p>${escapeHTML(state.assignment.courseDescription || 'Complete the assigned questions at your own pace.')}</p>
      </div>
      <span class="practice-attempt-badge">Attempt ${state.attempt.attemptNumber}</span>
    </header>

    <section class="practice-progress" aria-label="Practice progress">
      <div><span>Question ${state.index + 1} of ${state.assignment.questions.length}</span><strong>${answered} answered</strong></div>
      <div class="practice-progress-track"><i style="width:${progress}%"></i></div>
      <nav class="practice-question-nav" aria-label="Questions">
        ${state.assignment.questions.map((item, index) => `
          <button type="button" data-practice-question-index="${index}" class="${index === state.index ? 'is-current' : ''}${hasResponse(item.id) ? ' is-answered' : ''}" aria-label="Question ${index + 1}${hasResponse(item.id) ? ', answered' : ''}">${index + 1}</button>
        `).join('')}
      </nav>
    </section>

    <article class="practice-question-card">
      <div class="practice-question-meta">
        <span class="practice-difficulty" data-difficulty="${escapeHTML(question.difficulty)}">${escapeHTML(difficultyLabel(question.difficulty))}</span>
        <span>${formatNumber(question.points)} ${question.points === 1 ? 'point' : 'points'}</span>
      </div>
      <h2>${escapeHTML(question.name || `Question ${state.index + 1}`)}</h2>
      <div class="practice-question-prompt">${formatQuestionText(question.prompt || 'No prompt was provided.')}</div>
      ${renderQuestionMedia(question)}
      <div class="practice-response-area">${renderResponseControl(question)}</div>
    </article>

    <footer class="practice-player-actions">
      <button type="button" class="curriculum-secondary-button" data-practice-action="previous" ${state.index === 0 || state.busy ? 'disabled' : ''}>Previous</button>
      <div>
        <button type="button" class="curriculum-secondary-button" data-practice-action="save" ${state.busy ? 'disabled' : ''}>Save progress</button>
        ${state.index < state.assignment.questions.length - 1
          ? `<button type="button" class="curriculum-primary-button" data-practice-action="next" ${state.busy ? 'disabled' : ''}>Next</button>`
          : `<button type="button" class="curriculum-primary-button" data-practice-action="submit" ${state.busy ? 'disabled' : ''}>Submit attempt</button>`}
      </div>
    </footer>
  `
  typesetMath()
}

function renderResponseControl(question) {
  const response = state.responses[question.id]
  const baseType = questionBaseType(question.type)
  if (baseType === 'multiple-choice' || baseType === 'true-false') {
    return `<fieldset class="practice-options"><legend>Choose one answer</legend>${question.options.map((option, index) => `
      <label><input type="radio" name="practice-response-${escapeHTML(question.id)}" value="${index}" data-practice-response="${escapeHTML(question.id)}" ${String(response ?? '') === String(index) ? 'checked' : ''} /><span>${formatQuestionText(option)}</span></label>
    `).join('')}</fieldset>`
  }
  if (baseType === 'multiple-answer') {
    const selected = new Set(Array.isArray(response) ? response.map(String) : [])
    return `<fieldset class="practice-options"><legend>Select all answers that apply</legend>${question.options.map((option, index) => `
      <label><input type="checkbox" value="${index}" data-practice-response="${escapeHTML(question.id)}" ${selected.has(String(index)) ? 'checked' : ''} /><span>${formatQuestionText(option)}</span></label>
    `).join('')}</fieldset>`
  }
  if (question.type === 'essay') {
    return `<label class="practice-written-response"><span>Your answer</span><textarea rows="9" data-practice-response="${escapeHTML(question.id)}" placeholder="Write your answer here">${escapeHTML(response || '')}</textarea></label>`
  }
  return `<label class="practice-written-response"><span>${question.type === 'numeric' ? 'Your numeric answer' : 'Your answer'}</span><input type="text" data-practice-response="${escapeHTML(question.id)}" value="${escapeHTML(response || '')}" placeholder="Type your answer here" /></label>`
}

function renderQuestionMedia(question) {
  const imageData = String(question.imageData || '')
  const graphImage = String(question.graph?.imageData || question.graph?.dataUrl || '')
  const media = []
  if (imageData.startsWith('data:image/') || imageData.startsWith('https://') || imageData.startsWith('/')) {
    media.push(`<figure class="practice-question-media"><img src="${escapeHTML(imageData)}" alt="${escapeHTML(question.imageAlt || 'Question image')}" />${question.imageCaption ? `<figcaption>${escapeHTML(question.imageCaption)}</figcaption>` : ''}</figure>`)
  }
  if (graphImage.startsWith('data:image/') || graphImage.startsWith('https://') || graphImage.startsWith('/')) {
    media.push(`<figure class="practice-question-media"><img src="${escapeHTML(graphImage)}" alt="Question graph" /></figure>`)
  } else if (question.graph && typeof question.graph === 'object') {
    media.push('<div class="practice-graph-note">This question includes structured graph data. The immutable graph snapshot is attached to the activity.</div>')
  }
  return media.join('')
}

function handleResponseEvent(event) {
  const control = event.target.closest('[data-practice-response]')
  if (!control || state.busy || state.submitted) return
  const questionId = control.dataset.practiceResponse
  const question = state.assignment.questions.find((item) => item.id === questionId)
  if (!question) return
  if (questionBaseType(question.type) === 'multiple-answer') {
    state.responses[questionId] = [...shell.querySelectorAll(`[data-practice-response="${cssEscape(questionId)}"]:checked`)].map((input) => input.value)
  } else {
    state.responses[questionId] = control.value
  }
  state.dirty = true
  setSaveState('Unsaved response')
  updateProgressWithoutRerender()
}

async function handlePlayerClick(event) {
  const questionButton = event.target.closest('[data-practice-question-index]')
  if (questionButton && !state.busy) {
    await saveProgress({ quiet: true })
    state.index = Math.max(0, Math.min(Number(questionButton.dataset.practiceQuestionIndex) || 0, state.assignment.questions.length - 1))
    renderPlayer()
    return
  }
  const action = event.target.closest('[data-practice-action]')?.dataset.practiceAction
  if (!action || state.busy) return
  if (action === 'save') await saveProgress()
  if (action === 'previous') await moveQuestion(-1)
  if (action === 'next') await moveQuestion(1)
  if (action === 'submit') await submitAttempt()
}

async function moveQuestion(delta) {
  await saveProgress({ quiet: true })
  state.index = Math.max(0, Math.min(state.index + delta, state.assignment.questions.length - 1))
  renderPlayer()
}

async function saveProgress({ quiet = false } = {}) {
  if (!state.dirty || state.busy || state.submitted) return true
  setBusy(true)
  setSaveState('Saving…')
  try {
    state.attempt = await state.adapters.savePractice(state.attempt.id, normalizePracticeResponses(state.responses, state.assignment.questions))
    state.responses = { ...state.attempt.responses }
    state.dirty = false
    setSaveState(quiet ? 'Saved' : `Attempt ${state.attempt.attemptNumber} · Saved`)
    return true
  } catch (error) {
    setSaveState(error?.message || 'Progress could not be saved.', true)
    return false
  } finally {
    setBusy(false)
  }
}

async function submitAttempt() {
  const unanswered = state.assignment.questions.length - countAnsweredResponses(state.responses, state.assignment.questions)
  const message = unanswered
    ? `Submit with ${unanswered} unanswered ${unanswered === 1 ? 'question' : 'questions'}?`
    : 'Submit this practice attempt? Submitted responses cannot be edited.'
  if (!window.confirm(message)) return
  setBusy(true)
  setSaveState('Submitting…')
  try {
    state.attempt = await state.adapters.submitPractice(state.attempt.id, normalizePracticeResponses(state.responses, state.assignment.questions))
    state.submitted = true
    state.dirty = false
    renderSubmittedResult()
    setSaveState('Attempt submitted')
  } catch (error) {
    setSaveState(error?.message || 'The attempt could not be submitted.', true)
    setBusy(false)
  }
}

function renderSubmittedResult() {
  const result = state.attempt.result || {}
  shell.innerHTML = `
    <section class="practice-result-card">
      <p class="page-kicker">Attempt ${state.attempt.attemptNumber} submitted</p>
      <h1>${escapeHTML(state.assignment.courseTitle)}</h1>
      <p>Your responses are now immutable. Objective questions were checked automatically; written or expression-based answers remain available for later review.</p>
      <div class="practice-result-metrics">
        <article><span>Automatic score</span><strong>${formatNumber(result.autoScore)} / ${formatNumber(result.autoMaxPoints)}</strong></article>
        <article><span>Awaiting review</span><strong>${Number(result.pendingReviewCount) || 0}</strong></article>
        <article><span>Answered</span><strong>${countAnsweredResponses(state.responses, state.assignment.questions)} / ${state.assignment.questions.length}</strong></article>
      </div>
      <div class="practice-result-actions">
        <a class="curriculum-primary-button" href="./practice-library.html">Return to My practice</a>
        <a class="curriculum-secondary-button" href="./course-practice.html?assignment=${encodeURIComponent(state.assignment.id)}">Practice again</a>
      </div>
    </section>
  `
}

function updateProgressWithoutRerender() {
  const answered = countAnsweredResponses(state.responses, state.assignment.questions)
  const strong = shell.querySelector('.practice-progress strong')
  const fill = shell.querySelector('.practice-progress-track i')
  if (strong) strong.textContent = `${answered} answered`
  if (fill) fill.style.width = `${(answered / state.assignment.questions.length) * 100}%`
  shell.querySelectorAll('[data-practice-question-index]').forEach((button) => {
    const question = state.assignment.questions[Number(button.dataset.practiceQuestionIndex)]
    button.classList.toggle('is-answered', hasResponse(question?.id))
  })
}

function hasResponse(questionId) {
  const value = state.responses[questionId]
  return Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== ''
}

function setBusy(value) {
  state.busy = Boolean(value)
  shell.querySelectorAll('button, input, textarea').forEach((control) => { control.disabled = state.busy })
}

function setSaveState(message, isError = false) {
  saveState.textContent = message
  saveState.classList.toggle('is-error', isError)
}

function renderFatalError(error) {
  setSaveState('Practice unavailable', true)
  shell.innerHTML = `<section class="practice-result-card"><h1>Practice could not be opened</h1><p>${escapeHTML(error?.message || 'Return to My practice and choose another activity.')}</p><a class="curriculum-secondary-button" href="./practice-library.html">Return to My practice</a></section>`
}

function questionBaseType(type) {
  const value = String(type || '').toLowerCase()
  if (value.startsWith('multiple-choice')) return 'multiple-choice'
  if (value.startsWith('multiple-answer')) return 'multiple-answer'
  return value
}

function difficultyLabel(value) {
  return ({ 'very-easy': 'Very easy', easy: 'Easy', difficult: 'Difficult', 'very-difficult': 'Very difficult', challenge: 'Challenge' })[value] || 'Practice'
}

function formatQuestionText(value) {
  return escapeHTML(value).replace(/\n/g, '<br />')
}

function formatDate(value) {
  const date = new Date(`${String(value || '')}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Unscheduled' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatNumber(value) {
  const number = Number(value) || 0
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

function typesetMath() {
  window.MathJax?.typesetPromise?.([shell]).catch(() => {})
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(String(value)) : String(value).replace(/(["\\])/g, '\\$1')
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
