import { requireCapability } from '../../auth/auth-guard.js'
import { supabase } from '../../lib/supabase/supabaseClient.js'
import { createSupabaseCourseAssignmentAdapters } from './course-assignment-adapters.js'

const elements = {
  refresh: document.getElementById('refresh-practice-library'),
  summary: document.getElementById('practice-library-summary'),
  status: document.getElementById('practice-library-status'),
  grid: document.getElementById('practice-card-grid')
}

let adapters = null
let busy = false

elements.refresh?.addEventListener('click', loadPracticeLibrary)

init().catch(renderFatalError)

async function init() {
  const current = await requireCapability(['practice.attempt'])
  if (!current) return
  adapters = createSupabaseCourseAssignmentAdapters({ supabase })
  await loadPracticeLibrary()
}

async function loadPracticeLibrary() {
  if (!adapters || busy) return
  setBusy(true)
  showStatus('Loading assigned practice…')
  elements.grid.innerHTML = '<p class="practice-empty">Loading your practice space…</p>'
  try {
    const assignments = await adapters.listPractice()
    renderAssignments(assignments)
    showStatus('')
  } catch (error) {
    renderAssignments([])
    showStatus(error?.message || 'Assigned practice could not be loaded.', true)
  } finally {
    setBusy(false)
  }
}

function renderAssignments(assignments) {
  elements.summary.textContent = assignments.length
    ? `${assignments.length} assigned ${assignments.length === 1 ? 'activity' : 'activities'} available.`
    : 'No course practice has been assigned yet.'
  if (!assignments.length) {
    elements.grid.innerHTML = '<p class="practice-empty">Your scheduled course activities will appear here after a mentor or administrator assigns them.</p>'
    return
  }
  elements.grid.innerHTML = assignments.map((assignment) => {
    const attempt = assignment.latestAttempt
    const action = attempt?.status === 'in_progress'
      ? 'Continue attempt'
      : attempt?.status === 'submitted'
        ? 'Practice again'
        : 'Start practice'
    const attemptLine = attempt?.status === 'submitted'
      ? `${formatNumber(attempt.autoScore)} of ${formatNumber(attempt.autoMaxPoints)} automatically graded points${attempt.pendingReviewCount ? ` · ${attempt.pendingReviewCount} awaiting review` : ''}`
      : attempt?.status === 'in_progress'
        ? `Attempt ${attempt.attemptNumber} saved ${formatDateTime(attempt.updatedAt)}`
        : 'No attempts yet'
    return `
      <article class="practice-card">
        <div class="practice-card-top">
          <span class="practice-status" data-status="${escapeHTML(assignment.status)}">${escapeHTML(assignment.status)}</span>
          <span>${escapeHTML(formatDate(assignment.schedule.scheduledDate))}</span>
        </div>
        <div>
          <p class="page-kicker">${escapeHTML(assignment.schedule.sessionTitle)}</p>
          <h2>${escapeHTML(assignment.courseTitle)}</h2>
        </div>
        <p>${escapeHTML(assignment.courseDescription || pathLabel(assignment.curriculumPath) || 'Scheduled course practice')}</p>
        <div class="practice-card-metrics">
          <span><strong>${assignment.questionCount}</strong> questions</span>
          <span><strong>${formatNumber(assignment.totalPoints)}</strong> points</span>
        </div>
        <small>${escapeHTML(attemptLine)}</small>
        <a class="curriculum-primary-button practice-open-button" href="./course-practice.html?assignment=${encodeURIComponent(assignment.id)}">${action}</a>
      </article>
    `
  }).join('')
}

function setBusy(value) {
  busy = Boolean(value)
  elements.refresh.disabled = busy
}

function showStatus(message, isError = false) {
  elements.status.textContent = message
  elements.status.classList.toggle('is-error', isError)
}

function renderFatalError(error) {
  showStatus(error?.message || 'The practice space could not be initialized.', true)
  elements.grid.innerHTML = '<p class="practice-empty">Student practice is unavailable.</p>'
  setBusy(true)
}

function pathLabel(path) {
  return (Array.isArray(path) ? path : []).map((node) => node.name).filter(Boolean).join(' / ')
}

function formatDate(value) {
  const date = new Date(`${String(value || '')}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Unscheduled' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatNumber(value) {
  const number = Number(value) || 0
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
