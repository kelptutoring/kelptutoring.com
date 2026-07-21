import { requireCapability, getHomePathByRole } from '../../auth/auth-guard.js'
import { supabase } from '../../lib/supabase/supabaseClient.js'
import { buildCurriculumForest, flattenCurriculumForest } from './curriculum-domain.js'
import { createSupabaseCurriculumAdapters } from './curriculum-supabase-adapters.js'
import { createSupabaseQuestionBankAdapters } from './question-bank-adapters.js'

const DIFFICULTY_LABELS = Object.freeze({
  'very-easy': 'Very easy',
  easy: 'Easy',
  difficult: 'Difficult',
  'very-difficult': 'Very difficult',
  challenge: 'Challenge'
})

const TYPE_LABELS = Object.freeze({
  'word-problem': 'Word problem',
  numeric: 'Numeric',
  graph: 'Graph',
  image: 'Image',
  'true-false': 'True / false',
  'multiple-choice': 'Multiple choice',
  'multiple-answer': 'Multiple answers',
  'short-answer': 'Short answer',
  essay: 'Essay / explanation'
})

const state = {
  auth: null,
  adapters: null,
  page: 1,
  pageSize: 12,
  total: 0,
  items: [],
  busy: false,
  modalReturnFocus: null
}

const elements = {
  home: document.getElementById('workspace-home'),
  back: document.getElementById('back-to-workspace'),
  form: document.getElementById('question-bank-filter-form'),
  query: document.getElementById('question-bank-query'),
  curriculum: document.getElementById('question-bank-curriculum'),
  type: document.getElementById('question-bank-type'),
  difficulty: document.getElementById('question-bank-difficulty'),
  clear: document.getElementById('question-bank-clear'),
  pageSize: document.getElementById('question-bank-page-size'),
  status: document.getElementById('question-bank-status'),
  summary: document.getElementById('question-bank-summary'),
  results: document.getElementById('question-bank-results'),
  previous: document.getElementById('question-bank-previous'),
  next: document.getElementById('question-bank-next'),
  pageLabel: document.getElementById('question-bank-page-label'),
  modal: document.getElementById('question-bank-modal'),
  modalTitle: document.getElementById('question-bank-dialog-title'),
  modalBody: document.getElementById('question-bank-dialog-body')
}

init()

async function init() {
  bindEvents()
  try {
    state.auth = await requireCapability(['question_bank.read'])
    if (!state.auth) return
    const homePath = getHomePathByRole(state.auth.primaryRole)
    elements.home.href = homePath
    elements.back.href = homePath
    state.adapters = createSupabaseQuestionBankAdapters({ supabase })
    const curriculumAdapters = createSupabaseCurriculumAdapters({ supabase })
    const nodes = await curriculumAdapters.nodes.list()
    renderCurriculumOptions(flattenCurriculumForest(buildCurriculumForest(nodes)))
    await searchQuestions()
  } catch (error) {
    renderFatalError(error)
  }
}

function bindEvents() {
  elements.form?.addEventListener('submit', (event) => {
    event.preventDefault()
    state.page = 1
    searchQuestions()
  })
  elements.clear?.addEventListener('click', () => {
    elements.form.reset()
    state.page = 1
    searchQuestions()
  })
  elements.pageSize?.addEventListener('change', () => {
    state.pageSize = Math.max(1, Number(elements.pageSize.value) || 12)
    state.page = 1
    searchQuestions()
  })
  elements.previous?.addEventListener('click', () => changePage(state.page - 1))
  elements.next?.addEventListener('click', () => changePage(state.page + 1))
  elements.results?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-question-bank-item]')
    if (button) openQuestion(button.dataset.questionBankItem, button)
  })
  elements.modal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-question-bank-close]')) closeModal()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.modal?.classList.contains('is-open')) closeModal()
  })
}

function renderCurriculumOptions(nodes) {
  nodes.forEach((node) => {
    const option = document.createElement('option')
    option.value = node.id
    option.textContent = `${'— '.repeat(node.depth)}${node.name} · ${node.type}`
    elements.curriculum.appendChild(option)
  })
}

async function searchQuestions() {
  if (!state.adapters || state.busy) return
  setBusy(true)
  showStatus('Loading approved questions…')
  elements.results.innerHTML = '<p class="question-bank-loading">Searching the approved question catalog…</p>'
  try {
    const response = await state.adapters.search({
      query: elements.query.value,
      curriculumNodeId: elements.curriculum.value || null,
      difficulties: elements.difficulty.value ? [elements.difficulty.value] : [],
      questionTypeTags: elements.type.value ? [elements.type.value] : [],
      page: state.page,
      pageSize: state.pageSize
    })
    state.page = response.page
    state.pageSize = response.pageSize
    state.total = response.total
    state.items = response.items
    renderResults()
    showStatus('')
  } catch (error) {
    state.items = []
    state.total = 0
    renderResults()
    showStatus(error?.message || 'The question bank could not be loaded.', true)
  } finally {
    setBusy(false)
  }
}

function renderResults() {
  const pageCount = Math.max(1, Math.ceil(state.total / state.pageSize))
  elements.summary.textContent = state.total
    ? `${state.total} approved ${state.total === 1 ? 'question' : 'questions'} found. Showing easiest to hardest.`
    : 'No approved questions match the current filters.'
  elements.pageLabel.textContent = `Page ${state.page} of ${pageCount}`
  elements.previous.disabled = state.busy || state.page <= 1
  elements.next.disabled = state.busy || state.page >= pageCount
  if (!state.items.length) {
    elements.results.innerHTML = '<p class="question-bank-empty">Try a broader curriculum path or clear one of the filters.</p>'
    return
  }
  elements.results.innerHTML = state.items.map((item) => `
    <article class="question-bank-card">
      <div class="question-bank-card-top">
        <span class="question-bank-difficulty" data-difficulty="${escapeHTML(item.difficulty)}">${escapeHTML(difficultyLabel(item.difficulty))}</span>
        <span class="question-bank-source-badge">Approved</span>
      </div>
      <h3>${escapeHTML(item.name || truncate(item.prompt, 96) || 'Untitled question')}</h3>
      <p class="question-bank-card-prompt">${escapeHTML(item.prompt || 'No prompt was recorded.')}</p>
      <div>
        <p class="question-bank-path">${escapeHTML(pathLabel(item.curriculumPath))}</p>
        <div class="question-bank-chip-list">${renderTypeChips(item.questionTypeTags)}</div>
      </div>
      <div class="question-bank-card-footer">
        <small>${escapeHTML(item.examTitle || 'Untitled source exam')} · ${formatNumber(item.points)} ${item.points === 1 ? 'point' : 'points'}</small>
        <button type="button" class="curriculum-secondary-button question-bank-inspect" data-question-bank-item="${escapeHTML(item.id)}">Inspect</button>
      </div>
    </article>
  `).join('')
}

function changePage(page) {
  const pageCount = Math.max(1, Math.ceil(state.total / state.pageSize))
  const nextPage = Math.min(pageCount, Math.max(1, page))
  if (nextPage === state.page || state.busy) return
  state.page = nextPage
  searchQuestions()
}

async function openQuestion(questionId, trigger) {
  if (!state.adapters || state.busy) return
  state.modalReturnFocus = trigger
  openModal()
  elements.modalTitle.textContent = 'Loading question…'
  elements.modalBody.innerHTML = '<p class="question-bank-loading">Loading the complete approved item…</p>'
  try {
    const item = await state.adapters.get(questionId)
    elements.modalTitle.textContent = item.name || 'Question details'
    elements.modalBody.innerHTML = renderQuestionDetail(item)
  } catch (error) {
    elements.modalTitle.textContent = 'Question unavailable'
    elements.modalBody.innerHTML = `<p class="question-bank-empty">${escapeHTML(error?.message || 'This question could not be loaded.')}</p>`
  }
}

function renderQuestionDetail(item) {
  const content = item.content || {}
  const options = Array.isArray(content.options) ? content.options : []
  return `
    <div class="question-bank-chip-list">
      <span class="question-bank-difficulty" data-difficulty="${escapeHTML(item.difficulty)}">${escapeHTML(difficultyLabel(item.difficulty))}</span>
      ${renderTypeChips(item.questionTypeTags)}
    </div>
    <section class="question-bank-detail-block">
      <span>Curriculum path</span>
      <p>${escapeHTML(pathLabel(item.curriculumPath))}</p>
    </section>
    <section class="question-bank-detail-block">
      <span>Question prompt</span>
      <p>${escapeHTML(content.prompt || item.prompt || 'No prompt was recorded.')}</p>
    </section>
    ${options.length ? `
      <section class="question-bank-detail-block">
        <span>Answer options</span>
        <ul>${options.map((option) => `<li>${escapeHTML(String(option || 'Blank option'))}</li>`).join('')}</ul>
      </section>
    ` : ''}
    <section class="question-bank-detail-block question-bank-answer">
      <span>Answer key / review expectation</span>
      <p>${escapeHTML(answerSummary(content))}</p>
    </section>
    <section class="question-bank-detail-block">
      <span>Media and scoring</span>
      <p>${escapeHTML(mediaSummary(item, content))} · ${formatNumber(Number(content.points) || item.points)} ${(Number(content.points) || item.points) === 1 ? 'point' : 'points'}</p>
    </section>
    <section class="question-bank-detail-block">
      <span>Source</span>
      <p>${escapeHTML(item.examTitle || 'Untitled exam')}${item.authorName ? ` · ${escapeHTML(item.authorName)}` : ''}</p>
      <p class="question-bank-identifier">Question ${escapeHTML(item.id)}<br />Exam ${escapeHTML(item.examId)}</p>
    </section>
  `
}

function answerSummary(content) {
  const type = String(content.type || '')
  const options = Array.isArray(content.options) ? content.options : []
  if (type === 'numeric') {
    const answer = content.numericExpectedAnswer ?? content.numericExpected ?? content.numericAnswer ?? content.correctAnswer
    return answer === undefined || answer === '' ? 'Numeric answer not recorded.' : `Expected numeric answer: ${answer}`
  }
  if (type === 'true-false') {
    const index = Number(content.correctOptionIndex)
    return `Correct answer: ${options[index] || (index === 1 ? 'False' : 'True')}`
  }
  if (type.startsWith('multiple-choice') || type.startsWith('multiple-answer')) {
    const indexes = Array.isArray(content.correctOptionIndexes) && content.correctOptionIndexes.length
      ? content.correctOptionIndexes
      : [Number(content.correctOptionIndex)]
    const answers = indexes.filter(Number.isInteger).map((index) => options[index]).filter(Boolean)
    return answers.length ? `Correct ${answers.length === 1 ? 'answer' : 'answers'}: ${answers.join('; ')}` : 'No answer key was recorded.'
  }
  return 'Written response; the tutor or mentor reviews the submitted work.'
}

function mediaSummary(item, content) {
  const media = []
  if (item.hasImage || content.imageData || String(content.type || '').includes('image')) media.push('Includes image content')
  if (item.hasGraph || content.graph || String(content.type || '').includes('graph')) media.push('Includes diagram content')
  return media.length ? media.join(' · ') : 'No image or diagram'
}

function openModal() {
  elements.modal.classList.add('is-open')
  elements.modal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('question-bank-modal-open')
  elements.modal.querySelector('.question-bank-close')?.focus()
}

function closeModal() {
  elements.modal.classList.remove('is-open')
  elements.modal.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('question-bank-modal-open')
  state.modalReturnFocus?.focus?.()
  state.modalReturnFocus = null
}

function setBusy(busy) {
  state.busy = Boolean(busy)
  elements.form?.querySelectorAll('button, input, select').forEach((control) => { control.disabled = state.busy })
  elements.pageSize.disabled = state.busy
  const pageCount = Math.max(1, Math.ceil(state.total / state.pageSize))
  elements.previous.disabled = state.busy || state.page <= 1
  elements.next.disabled = state.busy || state.page >= pageCount
}

function showStatus(message, isError = false) {
  elements.status.textContent = message
  elements.status.classList.toggle('is-error', isError)
}

function renderFatalError(error) {
  state.items = []
  state.total = 0
  elements.summary.textContent = 'Question-bank access is unavailable.'
  elements.results.innerHTML = `<p class="question-bank-empty">${escapeHTML(error?.message || 'The question bank could not be initialized.')}</p>`
  showStatus(error?.message || 'The question bank could not be initialized.', true)
  setBusy(true)
}

function renderTypeChips(tags) {
  return (Array.isArray(tags) ? tags : []).map((tag) => (
    `<span class="question-bank-chip">${escapeHTML(TYPE_LABELS[tag] || tag)}</span>`
  )).join('')
}

function pathLabel(path) {
  const names = (Array.isArray(path) ? path : []).map((node) => node.name).filter(Boolean)
  return names.length ? names.join(' / ') : 'Curriculum path unavailable'
}

function difficultyLabel(value) { return DIFFICULTY_LABELS[value] || 'Unclassified' }
function formatNumber(value) { return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(1) }
function truncate(value, length) { const text = String(value || '').trim(); return text.length > length ? `${text.slice(0, length - 1)}…` : text }
function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
