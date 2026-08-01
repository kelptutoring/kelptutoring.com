import { requireAuth } from '../../auth/auth-guard.js'
import { getClassroomLearningHistoryData } from '../../data/studentData.js'

const parameters = new URL(window.location.href).searchParams
const source = String(parameters.get('source') || '').trim()
const course = String(parameters.get('course') || '').trim()

const titleElement = document.getElementById('classroom-session-title')
const sourceElement = document.getElementById('classroom-session-source')
const courseElement = document.getElementById('classroom-session-course')
const backLink = document.getElementById('classroom-session-back')
const record = document.getElementById('classroom-session-record')
const loading = document.getElementById('classroom-session-loading')
const error = document.getElementById('classroom-session-error')
const unavailable = document.getElementById('classroom-session-unavailable')
const openLink = document.getElementById('classroom-session-open')
const progressSection = document.getElementById('classroom-session-progress')
const progressBadges = document.getElementById('classroom-session-progress-badges')
const resourcesSection = document.getElementById('classroom-session-resources')
const resourceList = document.getElementById('classroom-session-resource-list')

backLink.href = safeReturnPath(parameters.get('returnTo')) || './classroom-space.html?area=history'

initialize().catch((reason) => {
  console.error('Archived Session access failed:', reason)
  loading.classList.add('is-hidden')
  error.textContent = reason?.message || 'The retained Session record could not be loaded.'
  error.classList.remove('is-hidden')
  record.setAttribute('aria-busy', 'false')
})

async function initialize() {
  const auth = await requireAuth()
  if (!auth) return
  if (!course || !source) {
    throw new TypeError('This History link does not identify a retained Session.')
  }
  const history = await getClassroomLearningHistoryData(course)
  const item = history.versions
    .flatMap((version) => version.items)
    .find((candidate) => candidate.sourceSessionKey === source)
  if (!item) {
    throw new TypeError('This Session is not present in the retained Course history.')
  }
  renderSession(item)
  loading.classList.add('is-hidden')
  record.setAttribute('aria-busy', 'false')
}

function renderSession(item) {
  titleElement.textContent = item.title
  document.title = `${item.title} - Kelp`
  sourceElement.textContent = item.sourceAvailable
    ? 'Available in the current curriculum catalog'
    : 'Unavailable in the current curriculum catalog'
  courseElement.textContent = 'Retained Course history'

  unavailable.classList.toggle('is-hidden', item.sourceAvailable)
  openLink.classList.toggle('is-hidden', !item.sourceAvailable || !item.planningHref)
  if (item.sourceAvailable && item.planningHref) openLink.href = item.planningHref

  const progress = Object.entries(item.progress || {})
    .filter(([, marked]) => marked)
  progressBadges.replaceChildren(...progress.map(([kind]) => progressBadge(kind)))
  progressSection.classList.toggle('is-hidden', progress.length === 0)

  const resources = Array.isArray(item.resources) ? item.resources : []
  resourceList.replaceChildren(...resources.map(createResourceItem))
  resourcesSection.classList.toggle('is-hidden', resources.length === 0)
}

function progressBadge(kind) {
  const badge = document.createElement('span')
  badge.textContent = titleCase(kind)
  return badge
}

function createResourceItem(resource) {
  const item = document.createElement('li')
  const copy = document.createElement('div')
  copy.className = 'classroom-session-resource-copy'
  const title = document.createElement('strong')
  title.textContent = resource.title
  const requirement = document.createElement('small')
  requirement.textContent = titleCase(resource.requirementState || 'assigned')
  copy.append(title, requirement)

  const progress = document.createElement('div')
  progress.className = 'classroom-session-resource-progress'
  for (const [kind, marked] of Object.entries(resource.progress || {})) {
    if (marked) progress.append(progressBadge(kind))
  }
  item.append(copy, progress)
  return item
}

function titleCase(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function safeReturnPath(value) {
  const candidate = String(value || '').trim()
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return ''
  try {
    const resolved = new URL(candidate, window.location.origin)
    return resolved.origin === window.location.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : ''
  } catch (_error) {
    return ''
  }
}
