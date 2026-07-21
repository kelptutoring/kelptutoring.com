import { requireCapability, getHomePathByRole } from '../../auth/auth-guard.js'
import { supabase } from '../../lib/supabase/supabaseClient.js'
import { buildCurriculumForest, flattenCurriculumForest } from './curriculum-domain.js'
import { createSupabaseCurriculumAdapters } from './curriculum-supabase-adapters.js'
import { createSupabaseQuestionBankAdapters } from './question-bank-adapters.js'
import {
  COURSE_DIFFICULTIES,
  courseDifficultyCounts,
  createCourseDefinition,
  normalizeCourseComposition,
  sortCourseQuestions
} from './course-composition-domain.js'
import { createSupabaseCourseCompositionAdapters } from './course-composition-adapters.js'
import { createSupabaseCourseAssignmentAdapters } from './course-assignment-adapters.js'

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
  courseAdapters: null,
  assignmentAdapters: null,
  questionBankAdapters: null,
  nodes: [],
  nodesById: new Map(),
  childrenByParent: new Map(),
  course: null,
  curriculumSelectionIds: [],
  dirty: false,
  saving: false,
  selection: { page: 1, pageSize: 12, total: 0, items: [], busy: false },
  drafts: { status: 'active', items: [], busy: false },
  assignments: { students: [], sessions: [], items: [], busy: false },
  modalReturnFocus: null
}

const elements = {
  home: document.getElementById('workspace-home'),
  back: document.getElementById('back-to-workspace'),
  title: document.getElementById('course-title'),
  description: document.getElementById('course-description'),
  cascade: document.getElementById('course-curriculum-cascade'),
  curriculumHelp: document.getElementById('course-curriculum-help'),
  status: document.getElementById('course-composer-status'),
  dirtyBadge: document.getElementById('course-dirty-badge'),
  questionCount: document.getElementById('course-question-count'),
  pointCount: document.getElementById('course-point-count'),
  difficultySummary: document.getElementById('course-difficulty-summary'),
  selectedList: document.getElementById('course-selected-list'),
  addQuestions: document.getElementById('add-course-questions'),
  clearQuestions: document.getElementById('clear-course-questions'),
  save: document.getElementById('save-course-button'),
  saveGuidance: document.getElementById('course-save-guidance'),
  newCourse: document.getElementById('new-course-button'),
  draftsButton: document.getElementById('course-drafts-button'),
  assignmentsButton: document.getElementById('course-assignments-button'),
  assignCourse: document.getElementById('assign-course-button'),
  selectionModal: document.getElementById('course-selection-modal'),
  selectionPath: document.getElementById('course-selection-path'),
  selectionForm: document.getElementById('course-selection-filters'),
  selectionQuery: document.getElementById('course-question-query'),
  selectionType: document.getElementById('course-question-type'),
  selectionDifficulty: document.getElementById('course-question-difficulty'),
  selectionSummary: document.getElementById('course-selection-summary'),
  selectionCount: document.getElementById('course-selection-count'),
  selectionStatus: document.getElementById('course-selection-status'),
  selectionResults: document.getElementById('course-selection-results'),
  selectionPrevious: document.getElementById('course-selection-previous'),
  selectionNext: document.getElementById('course-selection-next'),
  selectionPage: document.getElementById('course-selection-page'),
  draftsModal: document.getElementById('course-drafts-modal'),
  draftsStatus: document.getElementById('course-drafts-status'),
  draftsList: document.getElementById('course-drafts-list'),
  draftTabs: [...document.querySelectorAll('[data-course-draft-status]')],
  assignmentsModal: document.getElementById('course-assignments-modal'),
  assignmentCourseLabel: document.getElementById('course-assignment-course-label'),
  assignmentStudent: document.getElementById('course-assignment-student'),
  assignmentSession: document.getElementById('course-assignment-session'),
  assignmentSync: document.getElementById('sync-browser-schedule'),
  assignmentConfirm: document.getElementById('confirm-course-assignment'),
  assignmentSyncNote: document.getElementById('course-assignment-sync-note'),
  assignmentsStatus: document.getElementById('course-assignments-status'),
  assignmentsList: document.getElementById('course-assignments-list'),
  assignmentsRefresh: document.getElementById('refresh-course-assignments')
}

init()

async function init() {
  bindEvents()
  try {
    state.auth = await requireCapability(['course.compose', 'course.assign', 'question_bank.read'])
    if (!state.auth) return
    const homePath = getHomePathByRole(state.auth.primaryRole)
    elements.home.href = homePath
    elements.back.href = homePath
    state.courseAdapters = createSupabaseCourseCompositionAdapters({ supabase })
    state.assignmentAdapters = createSupabaseCourseAssignmentAdapters({ supabase })
    state.questionBankAdapters = createSupabaseQuestionBankAdapters({ supabase })
    const curriculumAdapters = createSupabaseCurriculumAdapters({ supabase })
    state.nodes = flattenCurriculumForest(buildCurriculumForest(await curriculumAdapters.nodes.list()))
    state.nodesById = new Map(state.nodes.map((node) => [node.id, node]))
    state.childrenByParent = buildChildrenMap(state.nodes)
    startNewCourse({ confirmDiscard: false })
  } catch (error) {
    renderFatalError(error)
  }
}

function bindEvents() {
  elements.title?.addEventListener('input', () => {
    state.course.title = elements.title.value
    markDirty()
    renderSaveGuidance()
  })
  elements.description?.addEventListener('input', () => {
    state.course.description = elements.description.value
    markDirty()
  })
  elements.cascade?.addEventListener('change', handleCurriculumChange)
  elements.addQuestions?.addEventListener('click', (event) => openSelectionModal(event.currentTarget))
  elements.clearQuestions?.addEventListener('click', clearSelectedQuestions)
  elements.selectedList?.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-course-question]')
    if (remove) removeQuestion(remove.dataset.removeCourseQuestion)
  })
  elements.save?.addEventListener('click', saveCourse)
  elements.newCourse?.addEventListener('click', () => startNewCourse())
  elements.draftsButton?.addEventListener('click', (event) => openDraftsModal(event.currentTarget))
  elements.assignmentsButton?.addEventListener('click', (event) => openAssignmentsModal(event.currentTarget))
  elements.assignCourse?.addEventListener('click', (event) => openAssignmentsModal(event.currentTarget))
  elements.assignmentStudent?.addEventListener('change', handleAssignmentStudentChange)
  elements.assignmentSession?.addEventListener('change', renderAssignmentControls)
  elements.assignmentSync?.addEventListener('click', syncBrowserSchedule)
  elements.assignmentConfirm?.addEventListener('click', assignCurrentCourse)
  elements.assignmentsRefresh?.addEventListener('click', loadAuthoredAssignments)
  elements.assignmentsModal?.addEventListener('click', handleAssignmentsModalClick)
  elements.selectionForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    state.selection.page = 1
    searchSelectionQuestions()
  })
  elements.selectionResults?.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle-course-question]')
    if (toggle) toggleSelectedQuestion(toggle.dataset.toggleCourseQuestion)
  })
  elements.selectionPrevious?.addEventListener('click', () => changeSelectionPage(state.selection.page - 1))
  elements.selectionNext?.addEventListener('click', () => changeSelectionPage(state.selection.page + 1))
  elements.selectionModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-course-selection-close]')) closeModal(elements.selectionModal)
  })
  elements.draftsModal?.addEventListener('click', handleDraftsModalClick)
  elements.draftTabs.forEach((button) => {
    button.addEventListener('click', () => changeDraftStatus(button.dataset.courseDraftStatus))
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (elements.selectionModal?.classList.contains('is-open')) closeModal(elements.selectionModal)
    else if (elements.draftsModal?.classList.contains('is-open')) closeModal(elements.draftsModal)
    else if (elements.assignmentsModal?.classList.contains('is-open')) closeModal(elements.assignmentsModal)
  })
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return
    event.preventDefault()
    event.returnValue = ''
  })
}

function createEmptyCourse() {
  return {
    schema: 'kelp-course-composition-v1',
    id: createUuid(),
    title: '',
    description: '',
    primaryCurriculumNodeId: '',
    questions: [],
    questionIds: [],
    status: 'active',
    createdAt: null,
    updatedAt: null
  }
}

function startNewCourse({ confirmDiscard = true } = {}) {
  if (confirmDiscard && state.dirty && !window.confirm('Discard the unsaved changes and start a new course draft?')) return
  state.course = createEmptyCourse()
  state.curriculumSelectionIds = []
  elements.title.value = ''
  elements.description.value = ''
  setDirty(false, 'New draft')
  renderAll()
  showStatus('Started a new course draft.')
}

function buildChildrenMap(nodes) {
  const map = new Map()
  nodes.forEach((node) => {
    const parentId = node.parentId || '__root__'
    if (!map.has(parentId)) map.set(parentId, [])
    map.get(parentId).push(node)
  })
  return map
}

function pathIdsForNode(nodeId) {
  const ids = []
  let node = state.nodesById.get(String(nodeId || ''))
  while (node) {
    ids.unshift(node.id)
    node = node.parentId ? state.nodesById.get(node.parentId) : null
  }
  return ids
}

function renderCurriculumCascade() {
  elements.cascade.replaceChildren()
  let options = state.childrenByParent.get('__root__') || []
  let parentSelectedId = null
  let level = 0
  while (options.length && level < 20) {
    const selectedId = state.curriculumSelectionIds[level] || ''
    const expectedType = options[0]?.type || 'topic'
    const wrapper = document.createElement('div')
    wrapper.className = `course-curriculum-select${expectedType === 'topic' ? ' is-topic' : ''}`
    const label = document.createElement('label')
    label.htmlFor = `course-curriculum-level-${level}`
    label.textContent = curriculumLevelLabel(expectedType, level)
    const select = document.createElement('select')
    select.id = label.htmlFor
    select.dataset.curriculumLevel = String(level)
    select.dataset.fallbackId = parentSelectedId || ''
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = expectedType === 'topic' ? 'No more specific topic' : `Choose ${expectedType}`
    select.appendChild(placeholder)
    options.forEach((node) => {
      const option = document.createElement('option')
      option.value = node.id
      option.textContent = node.name
      select.appendChild(option)
    })
    select.value = options.some((node) => node.id === selectedId) ? selectedId : ''
    wrapper.append(label, select)
    elements.cascade.appendChild(wrapper)
    if (!select.value) break
    parentSelectedId = select.value
    options = state.childrenByParent.get(parentSelectedId) || []
    level += 1
  }
  const selectedNode = state.nodesById.get(state.course.primaryCurriculumNodeId)
  elements.curriculumHelp.textContent = selectedNode
    ? `Course destination: ${selectedNode.pathLabel}`
    : 'Choose a degree, subject, and track. Add as many nested topic levels as needed.'
  elements.curriculumHelp.classList.toggle('is-error', !selectedNode)
}

function curriculumLevelLabel(type, level) {
  if (type === 'degree') return 'Degree'
  if (type === 'subject') return 'Subject'
  if (type === 'track') return 'Track'
  const topicIndex = Math.max(1, level - 2)
  return topicIndex === 1 ? 'Topic / subtrack' : `Nested topic ${topicIndex}`
}

function handleCurriculumChange(event) {
  const select = event.target.closest('[data-curriculum-level]')
  if (!select || !state.course) return
  const level = Number(select.dataset.curriculumLevel)
  const previousSelections = [...state.curriculumSelectionIds]
  const previousPrimary = state.course.primaryCurriculumNodeId
  const nextSelections = previousSelections.slice(0, level)
  if (select.value) nextSelections.push(select.value)
  const nextPrimary = [...nextSelections].reverse()
    .find((id) => ['track', 'topic'].includes(state.nodesById.get(id)?.type)) || ''
  const incompatible = nextPrimary && nextPrimary !== previousPrimary
    ? state.course.questions.filter((question) => !isNodeDescendantOf(question.curriculumNodeId, nextPrimary))
    : []
  if (incompatible.length && !window.confirm(
    `Changing the curriculum path will remove ${incompatible.length} selected ${incompatible.length === 1 ? 'question' : 'questions'} that do not belong beneath it. Continue?`
  )) {
    state.curriculumSelectionIds = previousSelections
    renderCurriculumCascade()
    return
  }
  state.curriculumSelectionIds = nextSelections
  state.course.primaryCurriculumNodeId = nextPrimary
  if (incompatible.length) {
    const removedIds = new Set(incompatible.map((question) => question.id))
    state.course.questions = state.course.questions.filter((question) => !removedIds.has(question.id))
    showStatus(`${incompatible.length} incompatible ${incompatible.length === 1 ? 'question was' : 'questions were'} removed.`)
  }
  markDirty()
  renderAll()
}

function isNodeDescendantOf(nodeId, ancestorId) {
  let node = state.nodesById.get(String(nodeId || ''))
  while (node) {
    if (node.id === ancestorId) return true
    node = node.parentId ? state.nodesById.get(node.parentId) : null
  }
  return false
}

function renderAll() {
  renderCurriculumCascade()
  renderSelectedQuestions()
  renderSummary()
  renderSaveGuidance()
  renderAssignmentControls()
}

function renderSelectedQuestions() {
  state.course.questions = sortCourseQuestions(state.course.questions)
  state.course.questionIds = state.course.questions.map((question) => question.id)
  elements.clearQuestions.disabled = !state.course.questions.length
  if (!state.course.questions.length) {
    elements.selectedList.innerHTML = '<p class="question-bank-empty">Choose a curriculum track, then add approved questions from the bank.</p>'
    return
  }
  elements.selectedList.innerHTML = state.course.questions.map((question, index) => `
    <article class="course-selected-card">
      <div class="course-selected-card-top">
        <span class="course-sequence-number">${index + 1}</span>
        <span class="question-bank-difficulty" data-difficulty="${escapeHTML(question.difficulty)}">${escapeHTML(difficultyLabel(question.difficulty))}</span>
      </div>
      <h3>${escapeHTML(question.name || truncate(question.prompt, 100) || `Question ${index + 1}`)}</h3>
      <p class="course-selected-prompt">${escapeHTML(question.prompt || 'No prompt was recorded.')}</p>
      <div class="question-bank-chip-list">${renderTypeChips(question.questionTypeTags)}</div>
      <div class="course-selected-card-footer">
        <small>${formatNumber(question.points)} ${question.points === 1 ? 'point' : 'points'} · ${escapeHTML(question.examTitle || 'Source exam')}</small>
        <button type="button" class="curriculum-secondary-button course-remove-question" data-remove-course-question="${escapeHTML(question.id)}">Remove</button>
      </div>
    </article>
  `).join('')
}

function renderSummary() {
  const questions = state.course.questions
  const totalPoints = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0)
  const counts = courseDifficultyCounts(questions)
  const maxCount = Math.max(1, ...Object.values(counts))
  elements.questionCount.textContent = String(questions.length)
  elements.pointCount.textContent = formatNumber(totalPoints)
  elements.difficultySummary.innerHTML = COURSE_DIFFICULTIES.map((difficulty) => `
    <div class="course-difficulty-row">
      <span>${escapeHTML(difficultyLabel(difficulty))}</span>
      <div class="course-difficulty-track"><i style="width:${(counts[difficulty] / maxCount) * 100}%"></i></div>
      <strong>${counts[difficulty]}</strong>
    </div>
  `).join('')
  elements.addQuestions.disabled = !state.course.primaryCurriculumNodeId
}

function renderSaveGuidance() {
  const hasTitle = Boolean(String(state.course?.title || '').trim())
  const hasPath = Boolean(state.course?.primaryCurriculumNodeId)
  if (!hasTitle || !hasPath) {
    elements.saveGuidance.textContent = !hasTitle
      ? 'Add a course title before saving.'
      : 'Choose at least a curriculum track before saving.'
  } else if (!state.course.questions.length) {
    elements.saveGuidance.textContent = 'You can save this empty structure as a draft or add questions first.'
  } else {
    elements.saveGuidance.textContent = `${state.course.questions.length} approved ${state.course.questions.length === 1 ? 'question' : 'questions'} ready to save.`
  }
}

function markDirty() { setDirty(true, 'Unsaved changes') }

function setDirty(dirty, label) {
  state.dirty = Boolean(dirty)
  elements.dirtyBadge.textContent = label || (dirty ? 'Unsaved changes' : 'Saved')
  elements.dirtyBadge.classList.toggle('is-dirty', dirty)
  elements.dirtyBadge.classList.toggle('is-saved', !dirty && label !== 'New draft')
  renderAssignmentControls()
}

function removeQuestion(questionId) {
  const before = state.course.questions.length
  state.course.questions = state.course.questions.filter((question) => question.id !== questionId)
  if (state.course.questions.length === before) return
  markDirty()
  renderAll()
  renderSelectionResults()
}

function clearSelectedQuestions() {
  if (!state.course.questions.length) return
  if (!window.confirm('Remove every selected question from this course draft?')) return
  state.course.questions = []
  markDirty()
  renderAll()
}

async function saveCourse() {
  if (!state.courseAdapters || state.saving) return
  state.course.title = elements.title.value
  state.course.description = elements.description.value
  if (!state.course.title.trim()) {
    showStatus('Add a course title before saving.', true)
    elements.title.focus()
    return
  }
  if (!state.course.primaryCurriculumNodeId) {
    showStatus('Choose a curriculum track or topic before saving.', true)
    elements.cascade.querySelector('select')?.focus()
    return
  }
  setSaving(true)
  showStatus('Saving the course draft…')
  try {
    const definition = createCourseDefinition({
      ...state.course,
      questionIds: state.course.questions.map((question) => question.id)
    })
    const saved = await state.courseAdapters.save(definition)
    applyLoadedCourse(saved)
    setDirty(false, 'Saved')
    showStatus('Course draft saved. Its questions remain linked to their approved source records.')
  } catch (error) {
    showStatus(error?.message || 'The course draft could not be saved.', true)
  } finally {
    setSaving(false)
  }
}

function setSaving(saving) {
  state.saving = Boolean(saving)
  elements.save.disabled = state.saving
  elements.newCourse.disabled = state.saving
  elements.draftsButton.disabled = state.saving
  elements.assignmentsButton.disabled = state.saving
  renderAssignmentControls()
}

function applyLoadedCourse(course) {
  const normalized = normalizeCourseComposition(course)
  if (!normalized) throw new Error('The course draft is invalid.')
  state.course = normalized
  state.curriculumSelectionIds = pathIdsForNode(normalized.primaryCurriculumNodeId)
  elements.title.value = normalized.title
  elements.description.value = normalized.description
  renderAll()
}

function openSelectionModal(trigger) {
  if (!state.course.primaryCurriculumNodeId) {
    showStatus('Choose a curriculum track before searching for questions.', true)
    return
  }
  state.modalReturnFocus = trigger
  elements.selectionPath.textContent = state.nodesById.get(state.course.primaryCurriculumNodeId)?.pathLabel || 'Selected curriculum path'
  state.selection.page = 1
  openModal(elements.selectionModal)
  searchSelectionQuestions()
}

async function searchSelectionQuestions() {
  if (!state.questionBankAdapters || state.selection.busy || !state.course.primaryCurriculumNodeId) return
  setSelectionBusy(true)
  showSelectionStatus('Loading approved questions…')
  elements.selectionResults.innerHTML = '<p class="question-bank-loading">Searching the approved question bank…</p>'
  try {
    const result = await state.questionBankAdapters.search({
      query: elements.selectionQuery.value,
      curriculumNodeId: state.course.primaryCurriculumNodeId,
      difficulties: elements.selectionDifficulty.value ? [elements.selectionDifficulty.value] : [],
      questionTypeTags: elements.selectionType.value ? [elements.selectionType.value] : [],
      page: state.selection.page,
      pageSize: state.selection.pageSize
    })
    Object.assign(state.selection, result)
    showSelectionStatus('')
    renderSelectionResults()
  } catch (error) {
    state.selection.items = []
    state.selection.total = 0
    renderSelectionResults()
    showSelectionStatus(error?.message || 'Approved questions could not be loaded.', true)
  } finally {
    setSelectionBusy(false)
  }
}

function renderSelectionResults() {
  const selectedIds = new Set(state.course.questions.map((question) => question.id))
  const pageCount = Math.max(1, Math.ceil(state.selection.total / state.selection.pageSize))
  elements.selectionSummary.textContent = state.selection.total
    ? `${state.selection.total} approved ${state.selection.total === 1 ? 'question' : 'questions'} found.`
    : 'No approved questions match these filters.'
  elements.selectionCount.textContent = `${selectedIds.size} selected`
  elements.selectionPage.textContent = `Page ${state.selection.page} of ${pageCount}`
  elements.selectionPrevious.disabled = state.selection.busy || state.selection.page <= 1
  elements.selectionNext.disabled = state.selection.busy || state.selection.page >= pageCount
  if (!state.selection.items.length) {
    elements.selectionResults.innerHTML = '<p class="question-bank-empty">Try another difficulty, category, or search phrase.</p>'
    return
  }
  elements.selectionResults.innerHTML = state.selection.items.map((question) => {
    const selected = selectedIds.has(question.id)
    return `
      <article class="course-selection-card${selected ? ' is-selected' : ''}">
        <div class="course-selection-card-top">
          <span class="question-bank-difficulty" data-difficulty="${escapeHTML(question.difficulty)}">${escapeHTML(difficultyLabel(question.difficulty))}</span>
          <span class="question-bank-source-badge">${selected ? 'Selected' : 'Approved'}</span>
        </div>
        <h3>${escapeHTML(question.name || truncate(question.prompt, 100) || 'Untitled question')}</h3>
        <p>${escapeHTML(question.prompt || 'No prompt was recorded.')}</p>
        <div class="question-bank-chip-list">${renderTypeChips(question.questionTypeTags)}</div>
        <div class="course-selected-card-footer">
          <small>${formatNumber(question.points)} ${question.points === 1 ? 'point' : 'points'} · ${escapeHTML(question.examTitle || 'Source exam')}</small>
          <button type="button" class="curriculum-primary-button course-selection-add" data-toggle-course-question="${escapeHTML(question.id)}">${selected ? 'Remove' : 'Add'}</button>
        </div>
      </article>
    `
  }).join('')
}

function toggleSelectedQuestion(questionId) {
  const existing = state.course.questions.find((question) => question.id === questionId)
  if (existing) {
    removeQuestion(questionId)
    return
  }
  const question = state.selection.items.find((item) => item.id === questionId)
  if (!question) return
  state.course.questions = sortCourseQuestions([
    ...state.course.questions,
    { ...question, position: state.course.questions.length }
  ])
  markDirty()
  renderAll()
  renderSelectionResults()
}

function changeSelectionPage(page) {
  const pageCount = Math.max(1, Math.ceil(state.selection.total / state.selection.pageSize))
  const nextPage = Math.min(pageCount, Math.max(1, page))
  if (nextPage === state.selection.page || state.selection.busy) return
  state.selection.page = nextPage
  searchSelectionQuestions()
}

function setSelectionBusy(busy) {
  state.selection.busy = Boolean(busy)
  elements.selectionForm.querySelectorAll('input, select, button').forEach((control) => { control.disabled = busy })
  elements.selectionPrevious.disabled = busy
  elements.selectionNext.disabled = busy
}

function showSelectionStatus(message, isError = false) {
  elements.selectionStatus.textContent = message
  elements.selectionStatus.classList.toggle('is-error', isError)
}

function openDraftsModal(trigger) {
  state.modalReturnFocus = trigger
  openModal(elements.draftsModal)
  loadDrafts()
}

async function loadDrafts() {
  if (!state.courseAdapters || state.drafts.busy) return
  setDraftsBusy(true)
  elements.draftsStatus.textContent = 'Loading course drafts…'
  elements.draftsList.innerHTML = '<p class="question-bank-loading">Loading your course library…</p>'
  try {
    state.drafts.items = await state.courseAdapters.list({ status: state.drafts.status })
    elements.draftsStatus.textContent = ''
    renderDrafts()
  } catch (error) {
    state.drafts.items = []
    renderDrafts()
    elements.draftsStatus.textContent = error?.message || 'Course drafts could not be loaded.'
    elements.draftsStatus.classList.add('is-error')
  } finally {
    setDraftsBusy(false)
  }
}

function renderDrafts() {
  elements.draftTabs.forEach((button) => {
    const active = button.dataset.courseDraftStatus === state.drafts.status
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  if (!state.drafts.items.length) {
    elements.draftsList.innerHTML = `<p class="question-bank-empty">No ${escapeHTML(state.drafts.status)} course drafts found.</p>`
    return
  }
  elements.draftsList.innerHTML = state.drafts.items.map((course) => `
    <article class="course-draft-card">
      <span class="question-bank-source-badge">${escapeHTML(course.status)}</span>
      <h3>${escapeHTML(course.title || 'Untitled course')}</h3>
      <p>${escapeHTML(pathLabel(course.curriculumPath))}</p>
      <small>${course.questionCount} ${course.questionCount === 1 ? 'question' : 'questions'} · Updated ${escapeHTML(formatDate(course.updatedAt))}</small>
      <div class="course-draft-actions">
        ${course.status === 'active' ? `<button type="button" class="curriculum-primary-button" data-course-draft-action="open" data-course-id="${escapeHTML(course.id)}">Open</button>` : ''}
        <button type="button" class="curriculum-secondary-button" data-course-draft-action="duplicate" data-course-id="${escapeHTML(course.id)}">Duplicate</button>
        ${course.status === 'active'
          ? `<button type="button" class="curriculum-secondary-button" data-course-draft-action="archive" data-course-id="${escapeHTML(course.id)}">Archive</button>`
          : `<button type="button" class="curriculum-secondary-button course-draft-delete" data-course-draft-action="delete" data-course-id="${escapeHTML(course.id)}">Delete</button>`}
      </div>
    </article>
  `).join('')
}

async function handleDraftsModalClick(event) {
  if (event.target.closest('[data-course-drafts-close]')) {
    closeModal(elements.draftsModal)
    return
  }
  const action = event.target.closest('[data-course-draft-action]')
  if (!action || state.drafts.busy) return
  const courseId = action.dataset.courseId
  const name = action.dataset.courseDraftAction
  if (name === 'open') await openDraft(courseId)
  if (name === 'duplicate') await duplicateDraft(courseId)
  if (name === 'archive') await archiveDraft(courseId)
  if (name === 'delete') await deleteDraft(courseId)
}

async function openDraft(courseId) {
  if (state.dirty && !window.confirm('Discard the current unsaved changes and open this course draft?')) return
  setDraftsBusy(true)
  try {
    const course = await state.courseAdapters.load(courseId)
    applyLoadedCourse(course)
    setDirty(false, 'Saved')
    closeModal(elements.draftsModal)
    showStatus(`Opened ${course.title || 'the course draft'}.`)
  } catch (error) {
    elements.draftsStatus.textContent = error?.message || 'The course draft could not be opened.'
    elements.draftsStatus.classList.add('is-error')
  } finally {
    setDraftsBusy(false)
  }
}

async function duplicateDraft(courseId) {
  setDraftsBusy(true)
  try {
    const course = await state.courseAdapters.duplicate(courseId)
    applyLoadedCourse(course)
    setDirty(false, 'Saved copy')
    closeModal(elements.draftsModal)
    showStatus('Created and opened an independent course copy.')
  } catch (error) {
    elements.draftsStatus.textContent = error?.message || 'The course draft could not be duplicated.'
    elements.draftsStatus.classList.add('is-error')
  } finally {
    setDraftsBusy(false)
  }
}

async function archiveDraft(courseId) {
  if (!window.confirm('Archive this course draft? It can be duplicated or deleted from the Archived tab.')) return
  setDraftsBusy(true)
  try {
    await state.courseAdapters.archive(courseId)
    if (state.course.id === courseId) startNewCourse({ confirmDiscard: false })
    await loadDraftsAfterBusy()
  } catch (error) {
    elements.draftsStatus.textContent = error?.message || 'The course draft could not be archived.'
    elements.draftsStatus.classList.add('is-error')
  } finally {
    setDraftsBusy(false)
  }
}

async function deleteDraft(courseId) {
  if (!window.confirm('Permanently delete this archived course draft? Its source exam questions will remain untouched.')) return
  setDraftsBusy(true)
  try {
    await state.courseAdapters.remove(courseId)
    await loadDraftsAfterBusy()
  } catch (error) {
    elements.draftsStatus.textContent = error?.message || 'The archived course draft could not be deleted.'
    elements.draftsStatus.classList.add('is-error')
  } finally {
    setDraftsBusy(false)
  }
}

async function loadDraftsAfterBusy() {
  state.drafts.busy = false
  await loadDrafts()
  state.drafts.busy = true
}

function changeDraftStatus(status) {
  const next = String(status || '').trim().toLowerCase()
  if (!['active', 'archived'].includes(next) || next === state.drafts.status || state.drafts.busy) return
  state.drafts.status = next
  loadDrafts()
}

function setDraftsBusy(busy) {
  state.drafts.busy = Boolean(busy)
  elements.draftTabs.forEach((button) => { button.disabled = busy })
  elements.draftsList.querySelectorAll('button').forEach((button) => { button.disabled = busy })
}

function courseReadyForAssignment() {
  return Boolean(
    state.course?.id
    && state.course?.updatedAt
    && state.course?.status === 'active'
    && state.course?.questions?.length
    && !state.dirty
    && !state.saving
  )
}

function renderAssignmentControls() {
  const ready = courseReadyForAssignment()
  if (elements.assignCourse) elements.assignCourse.disabled = !ready || state.assignments.busy
  if (elements.assignmentCourseLabel) {
    elements.assignmentCourseLabel.textContent = ready
      ? `${state.course.title} · ${state.course.questions.length} frozen ${state.course.questions.length === 1 ? 'question' : 'questions'} per assignment`
      : 'Save a populated course without pending edits before assigning it.'
  }
  const studentId = elements.assignmentStudent?.value || ''
  const sessionId = elements.assignmentSession?.value || ''
  if (elements.assignmentStudent) elements.assignmentStudent.disabled = state.assignments.busy || !ready
  if (elements.assignmentSession) elements.assignmentSession.disabled = state.assignments.busy || !ready || !studentId || !state.assignments.sessions.length
  if (elements.assignmentSync) elements.assignmentSync.disabled = state.assignments.busy || !ready || !studentId
  if (elements.assignmentConfirm) elements.assignmentConfirm.disabled = state.assignments.busy || !ready || !studentId || !sessionId
  if (elements.assignmentsRefresh) elements.assignmentsRefresh.disabled = state.assignments.busy
}

function openAssignmentsModal(trigger) {
  state.modalReturnFocus = trigger
  openModal(elements.assignmentsModal)
  loadAssignmentWorkspace()
}

async function loadAssignmentWorkspace() {
  if (!state.assignmentAdapters || state.assignments.busy) return
  setAssignmentsBusy(true)
  showAssignmentsStatus('Loading students and course assignments…')
  elements.assignmentsList.innerHTML = '<p class="question-bank-loading">Loading assignment history…</p>'
  try {
    const [students, assignments] = await Promise.all([
      state.assignmentAdapters.listStudents(),
      state.assignmentAdapters.listAuthored({ courseId: courseReadyForAssignment() ? state.course.id : null })
    ])
    state.assignments.students = students
    state.assignments.items = assignments
    state.assignments.sessions = []
    renderAssignmentStudents()
    renderAssignmentSessions()
    renderAuthoredAssignments()
    showAssignmentsStatus('')
  } catch (error) {
    state.assignments.students = []
    state.assignments.sessions = []
    state.assignments.items = []
    renderAssignmentStudents()
    renderAssignmentSessions()
    renderAuthoredAssignments()
    showAssignmentsStatus(error?.message || 'Course assignments could not be loaded.', true)
  } finally {
    setAssignmentsBusy(false)
  }
}

function renderAssignmentStudents() {
  const selected = elements.assignmentStudent.value
  elements.assignmentStudent.innerHTML = `
    <option value="">Choose a student</option>
    ${state.assignments.students.map((student) => `
      <option value="${escapeHTML(student.id)}">${escapeHTML(student.fullName)}${student.email ? ` · ${escapeHTML(student.email)}` : ''}</option>
    `).join('')}
  `
  if (state.assignments.students.some((student) => student.id === selected)) elements.assignmentStudent.value = selected
  elements.assignmentSyncNote.textContent = state.assignments.students.length
    ? 'Choose a student to load their synchronized schedule sessions.'
    : 'No account with an active student role is available.'
}

function renderAssignmentSessions() {
  const selected = elements.assignmentSession.value
  elements.assignmentSession.innerHTML = state.assignments.sessions.length
    ? `<option value="">Choose a scheduled session</option>${state.assignments.sessions.map((session) => `
        <option value="${escapeHTML(session.id)}">${escapeHTML(formatDate(session.scheduledDate))} · ${escapeHTML(session.title)} · ${escapeHTML(session.scheduleName)}</option>
      `).join('')}`
    : `<option value="">${elements.assignmentStudent.value ? 'No synchronized sessions yet' : 'Choose a student first'}</option>`
  if (state.assignments.sessions.some((session) => session.id === selected)) elements.assignmentSession.value = selected
  renderAssignmentControls()
}

async function handleAssignmentStudentChange() {
  const studentId = elements.assignmentStudent.value
  state.assignments.sessions = []
  renderAssignmentSessions()
  if (!studentId || !state.assignmentAdapters) {
    elements.assignmentSyncNote.textContent = 'Choose a student to load their synchronized schedule sessions.'
    return
  }
  setAssignmentsBusy(true)
  elements.assignmentSyncNote.textContent = 'Loading the student schedule…'
  try {
    state.assignments.sessions = await state.assignmentAdapters.listSessions(studentId)
    renderAssignmentSessions()
    elements.assignmentSyncNote.textContent = state.assignments.sessions.length
      ? `${state.assignments.sessions.length} scheduled ${state.assignments.sessions.length === 1 ? 'session' : 'sessions'} available.`
      : 'No backend schedule yet. Generate one in this browser, then choose Sync browser schedule.'
  } catch (error) {
    state.assignments.sessions = []
    renderAssignmentSessions()
    elements.assignmentSyncNote.textContent = error?.message || 'The student schedule could not be loaded.'
  } finally {
    setAssignmentsBusy(false)
  }
}

function readBrowserGeneratedSchedule() {
  let schedule
  try {
    schedule = JSON.parse(localStorage.getItem('kelpGeneratedSchedule') || 'null')
  } catch (error) {
    throw new Error('The generated schedule saved in this browser is malformed.')
  }
  if (!schedule || Array.isArray(schedule) || typeof schedule !== 'object') {
    throw new Error('No current generated schedule was found in this browser.')
  }
  return schedule
}

async function syncBrowserSchedule() {
  if (!state.assignmentAdapters || state.assignments.busy) return
  const studentId = elements.assignmentStudent.value
  if (!studentId) return
  setAssignmentsBusy(true)
  elements.assignmentSyncNote.textContent = 'Synchronizing the browser schedule…'
  try {
    const schedule = await state.assignmentAdapters.syncSchedule(studentId, readBrowserGeneratedSchedule())
    state.assignments.sessions = await state.assignmentAdapters.listSessions(studentId)
    renderAssignmentSessions()
    elements.assignmentSyncNote.textContent = `${schedule.name} synchronized with ${schedule.sessions.length} ${schedule.sessions.length === 1 ? 'session' : 'sessions'}.`
  } catch (error) {
    elements.assignmentSyncNote.textContent = error?.message || 'The browser schedule could not be synchronized.'
  } finally {
    setAssignmentsBusy(false)
  }
}

async function assignCurrentCourse() {
  if (!state.assignmentAdapters || state.assignments.busy || !courseReadyForAssignment()) return
  const studentId = elements.assignmentStudent.value
  const sessionId = elements.assignmentSession.value
  if (!studentId || !sessionId) return
  setAssignmentsBusy(true)
  showAssignmentsStatus('Freezing the course assignment snapshot…')
  try {
    const assignment = await state.assignmentAdapters.assign({
      courseId: state.course.id,
      studentId,
      sessionId
    })
    showAssignmentsStatus(`${assignment.courseTitle} was assigned to ${assignment.studentName}.`)
    await loadAuthoredAssignmentsAfterBusy()
  } catch (error) {
    showAssignmentsStatus(error?.message || 'The course could not be assigned.', true)
  } finally {
    setAssignmentsBusy(false)
  }
}

async function loadAuthoredAssignments() {
  if (!state.assignmentAdapters || state.assignments.busy) return
  setAssignmentsBusy(true)
  showAssignmentsStatus('Refreshing assignment history…')
  try {
    state.assignments.items = await state.assignmentAdapters.listAuthored({
      courseId: courseReadyForAssignment() ? state.course.id : null
    })
    renderAuthoredAssignments()
    showAssignmentsStatus('')
  } catch (error) {
    showAssignmentsStatus(error?.message || 'Assignment history could not be refreshed.', true)
  } finally {
    setAssignmentsBusy(false)
  }
}

async function loadAuthoredAssignmentsAfterBusy() {
  state.assignments.busy = false
  await loadAuthoredAssignments()
  state.assignments.busy = true
}

function renderAuthoredAssignments() {
  if (!state.assignments.items.length) {
    elements.assignmentsList.innerHTML = '<p class="question-bank-empty">No course assignments found for this view.</p>'
    return
  }
  elements.assignmentsList.innerHTML = state.assignments.items.map((assignment) => `
    <article class="course-assignment-card">
      <div class="course-assignment-card-top">
        <span class="question-bank-source-badge">${escapeHTML(assignment.status)}</span>
        <small>${escapeHTML(formatDate(assignment.assignedAt))}</small>
      </div>
      <h3>${escapeHTML(assignment.courseTitle)}</h3>
      <p><strong>${escapeHTML(assignment.studentName)}</strong> · ${escapeHTML(assignment.schedule.sessionTitle)}</p>
      <p>${escapeHTML(formatDate(assignment.schedule.scheduledDate))} · ${escapeHTML(assignment.schedule.scheduleName)}</p>
      <small>${assignment.questionCount} ${assignment.questionCount === 1 ? 'question' : 'questions'} · ${formatNumber(assignment.totalPoints)} points</small>
      ${assignment.status === 'assigned'
        ? `<button type="button" class="curriculum-secondary-button course-assignment-cancel" data-cancel-course-assignment="${escapeHTML(assignment.id)}">Cancel assignment</button>`
        : ''}
    </article>
  `).join('')
}

async function handleAssignmentsModalClick(event) {
  if (event.target.closest('[data-course-assignments-close]')) {
    closeModal(elements.assignmentsModal)
    return
  }
  const cancel = event.target.closest('[data-cancel-course-assignment]')
  if (!cancel || state.assignments.busy) return
  if (!window.confirm('Cancel this uncompleted assignment? Its snapshot and any saved attempt history will remain recorded.')) return
  setAssignmentsBusy(true)
  try {
    await state.assignmentAdapters.cancel(cancel.dataset.cancelCourseAssignment)
    showAssignmentsStatus('The course assignment was cancelled.')
    await loadAuthoredAssignmentsAfterBusy()
  } catch (error) {
    showAssignmentsStatus(error?.message || 'The assignment could not be cancelled.', true)
  } finally {
    setAssignmentsBusy(false)
  }
}

function setAssignmentsBusy(busy) {
  state.assignments.busy = Boolean(busy)
  elements.assignmentsList.querySelectorAll('button').forEach((button) => { button.disabled = busy })
  renderAssignmentControls()
}

function showAssignmentsStatus(message, isError = false) {
  elements.assignmentsStatus.textContent = message
  elements.assignmentsStatus.classList.toggle('is-error', isError)
}

function openModal(modal) {
  modal.classList.add('is-open')
  modal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('question-bank-modal-open')
  modal.querySelector('.question-bank-close')?.focus()
}

function closeModal(modal) {
  modal.classList.remove('is-open')
  modal.setAttribute('aria-hidden', 'true')
  if (![elements.selectionModal, elements.draftsModal, elements.assignmentsModal].some((item) => item.classList.contains('is-open'))) {
    document.body.classList.remove('question-bank-modal-open')
  }
  state.modalReturnFocus?.focus?.()
  state.modalReturnFocus = null
}

function showStatus(message, isError = false) {
  elements.status.textContent = message
  elements.status.classList.toggle('is-error', isError)
}

function renderFatalError(error) {
  showStatus(error?.message || 'The course composer could not be initialized.', true)
  elements.selectedList.innerHTML = '<p class="question-bank-empty">Course composition is unavailable.</p>'
  elements.save.disabled = true
  elements.addQuestions.disabled = true
  elements.draftsButton.disabled = true
  elements.assignmentsButton.disabled = true
  elements.assignCourse.disabled = true
}

function renderTypeChips(tags) {
  return (Array.isArray(tags) ? tags : []).map((tag) => (
    `<span class="question-bank-chip">${escapeHTML(TYPE_LABELS[tag] || tag)}</span>`
  )).join('')
}

function difficultyLabel(value) { return DIFFICULTY_LABELS[value] || 'Unclassified' }
function pathLabel(path) { const names = (Array.isArray(path) ? path : []).map((node) => node.name).filter(Boolean); return names.length ? names.join(' / ') : 'Curriculum path unavailable' }
function formatNumber(value) { const number = Number(value) || 0; return Number.isInteger(number) ? String(number) : number.toFixed(1) }
function formatDate(value) {
  const raw = String(value || '')
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw)
  return Number.isNaN(date.getTime()) ? 'unknown date' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function truncate(value, length) { const text = String(value || '').trim(); return text.length > length ? `${text.slice(0, length - 1)}…` : text }

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
