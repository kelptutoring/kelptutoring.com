import { requireAuth } from '../../auth/auth-guard.js'
import {
  getClassroomFileSignedUrl,
  getClassroomFilesData,
  getClassroomCurrentScheduleLogData,
  getClassroomLearningHistoryData,
  getClassroomScheduleAuditData,
  getClassroomHomePreferences,
  getClassroomScheduleData,
  getClassroomSpaceData,
  hideClassroomFile,
  markCourseProgress,
  reverseMyCourseProgress,
  saveClassroomHomePreferences,
  saveClassroomScheduleModuleStyle,
  saveClassroomSchedulePdfStyle,
  uploadClassroomFile,
  withdrawClassroomFile
} from '../../data/studentData.js'
import '../../data/tracks-data.js'
import { validateClassroomUpload } from './classroom-files-contract.js'
import {
  classroomAreaHref,
  getClassroomArea,
  normalizeClassroomArea
} from './classroom-space-navigation.js'
import {
  classroomScheduleAcademicPath,
  classroomScheduleCoverageMetadata,
  classroomSchedulePdfStyle,
  classroomScheduleModuleStyle,
  createClassroomScheduleSnapshot,
  groupClassroomScheduleSessions
} from './classroom-schedule-contract.js'
import { createClassroomCalendarController } from './classroom-calendar.js'
import {
  classroomHomeBlockGroupKeys,
  moveClassroomHomeBlock,
  normalizeClassroomHomeLayoutPayload,
  placeClassroomHomeHelper,
  placeClassroomHomeBlockAtTarget,
  toggleClassroomHomeBlockCollapsed
} from './classroom-home-layout-contract.js'
import {
  groupClassroomAuditChanges,
  groupCurrentScheduleLogEntries
} from './classroom-history-contract.js'

const MODULE_COLOR_TEMPLATES = Object.freeze([
  Object.freeze({ name: 'Red', headerColor: '#ef9a9a', stripeColor: '#ffcdd2' }),
  Object.freeze({ name: 'Pink', headerColor: '#f8bbd0', stripeColor: '#f48fb1' }),
  Object.freeze({ name: 'Violet', headerColor: '#d1c4e9', stripeColor: '#b39ddb' }),
  Object.freeze({ name: 'Blue', headerColor: '#90caf9', stripeColor: '#bbdefb' }),
  Object.freeze({ name: 'Cyan', headerColor: '#80deea', stripeColor: '#b2ebf2' }),
  Object.freeze({ name: 'Green', headerColor: '#a5d6a7', stripeColor: '#c8e6c9' }),
  Object.freeze({ name: 'Lime', headerColor: '#dce775', stripeColor: '#e6ee9c' }),
  Object.freeze({ name: 'Yellow', headerColor: '#ffe082', stripeColor: '#fff9c4' }),
  Object.freeze({ name: 'Bright yellow', headerColor: '#ffee58', stripeColor: '#fff176' }),
  Object.freeze({ name: 'Orange', headerColor: '#ffcc80', stripeColor: '#ffb74d' })
])
const trackModuleTitleByKey = createTrackModuleTitleIndex(globalThis.tracksCatalog)

const elements = {}
let currentClassroom = null
let classroomCalendar = null
let classroomHomePreferences = null
let classroomHomeLayoutAvailable = false
let classroomHomeLayoutSaving = false
let draggingClassroomHomeBlock = ''
let currentFiles = null
let currentHistory = null
let currentScheduleAudit = null
let currentSchedule = null
let currentScheduleLog = null
let currentScheduleSubtab = 'schedule'
let selectedUpload = null
let pendingFileAction = null
let filesRequestToken = 0
let historyRequestToken = 0
let scheduleRequestToken = 0
let scheduleLogRequestToken = 0
let feedbackTimer = 0
let scheduleFeedbackTimer = 0
let classroomHomeLayoutFeedbackTimer = 0
let progressHelperPositionFrame = 0
const pendingProgressActions = new Set()
const pendingModuleStyleActions = new Set()
const scheduleRowFeedbackTimers = new WeakMap()
const expandedScheduleDetails = new Set()
const classroomViewportStorageKey =
  `kelpClassroomViewport:${window.location.pathname}${window.location.search}${window.location.hash}`
let pendingReloadViewport = readClassroomReloadViewport()
let classroomViewportRestoreTimers = []
let classroomViewportRestoreCancelled = false

init().catch((error) => {
  console.error('Classroom space failed:', error)
  showError(error?.message || 'This Classroom could not be opened.')
})

async function init() {
  bindClassroomViewportPersistence()
  const current = await requireAuth(['student', 'teacher', 'tutor', 'mentor'])
  if (!current) return
  collectElements()
  classroomCalendar = createClassroomCalendarController()
  bindManagementControls()
  bindClassroomAreaControls()
  bindClassroomFilesControls()
  bindClassroomHistoryControls()
  bindClassroomScheduleControls()
  bindProgressHelperControls()
  bindClassroomHomeLayoutControls()
  showClassroomArea(areaFromLocation(), {
    updateHistory: false,
    loadData: false
  })
  const classroomId = classroomIdFromLocation()
  const classroom = await getClassroomSpaceData(classroomId)
  renderClassroom(classroom)
  await loadClassroomHomeLayout()
  showClassroomArea(areaFromLocation(), { updateHistory: false })
  elements.root.setAttribute('aria-busy', 'false')
  scheduleClassroomReloadViewportRestoration()
}

function readClassroomReloadViewport() {
  const navigation = performance.getEntriesByType?.('navigation')?.[0]
  if (navigation?.type !== 'reload') return null
  try {
    const value = JSON.parse(sessionStorage.getItem(classroomViewportStorageKey))
    if (!Number.isFinite(value?.scrollY) || !Number.isFinite(value?.anchorOffset)) {
      return null
    }
    return value
  } catch {
    return null
  }
}

function bindClassroomViewportPersistence() {
  if (pendingReloadViewport && 'scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual'
  }
  window.addEventListener('pagehide', persistClassroomViewport)
  for (const eventName of ['pointerdown', 'wheel', 'touchstart', 'keydown']) {
    window.addEventListener(eventName, cancelClassroomReloadViewportRestoration, {
      passive: true,
      once: true
    })
  }
}

function persistClassroomViewport() {
  const anchor = classroomViewportAnchor()
  try {
    sessionStorage.setItem(classroomViewportStorageKey, JSON.stringify({
      scrollY: window.scrollY,
      anchorId: anchor?.id || null,
      anchorBlock: anchor?.dataset?.classroomHomeBlock || null,
      anchorOffset: anchor?.getBoundingClientRect().top ?? 0
    }))
  } catch {
    // Viewport persistence is a convenience and must never block navigation.
  }
}

function classroomViewportAnchor() {
  const candidates = [
    ...document.querySelectorAll('[data-classroom-home-block]'),
    elements.classroomSpaceScheduleView,
    elements.classroomSpaceFiles,
    elements.classroomSpaceHistory
  ].filter((element) => element && !element.hidden)
  const intersecting = candidates.filter((element) => {
    const bounds = element.getBoundingClientRect()
    return bounds.bottom > 0 && bounds.top < window.innerHeight
  })
  return intersecting.sort((left, right) =>
    Math.abs(left.getBoundingClientRect().top)
      - Math.abs(right.getBoundingClientRect().top)
  )[0] || null
}

function resolveClassroomViewportAnchor(snapshot) {
  if (snapshot?.anchorId) return document.getElementById(snapshot.anchorId)
  if (!snapshot?.anchorBlock) return null
  return [...document.querySelectorAll('[data-classroom-home-block]')]
    .find((element) =>
      element.dataset.classroomHomeBlock === snapshot.anchorBlock
    ) || null
}

function scheduleClassroomReloadViewportRestoration() {
  if (!pendingReloadViewport || classroomViewportRestoreCancelled) return
  classroomViewportRestoreTimers.forEach(window.clearTimeout)
  classroomViewportRestoreTimers = [0, 180, 600, 1200].map((delay) =>
    window.setTimeout(restoreClassroomReloadViewport, delay)
  )
  classroomViewportRestoreTimers.push(window.setTimeout(() => {
    pendingReloadViewport = null
    sessionStorage.removeItem(classroomViewportStorageKey)
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto'
    }
  }, 1500))
}

function restoreClassroomReloadViewport() {
  if (!pendingReloadViewport || classroomViewportRestoreCancelled) return
  const anchor = resolveClassroomViewportAnchor(pendingReloadViewport)
  const top = anchor
    ? window.scrollY
      + anchor.getBoundingClientRect().top
      - pendingReloadViewport.anchorOffset
    : pendingReloadViewport.scrollY
  window.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'auto' })
}

function cancelClassroomReloadViewportRestoration() {
  classroomViewportRestoreCancelled = true
  classroomViewportRestoreTimers.forEach(window.clearTimeout)
  classroomViewportRestoreTimers = []
  pendingReloadViewport = null
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'auto'
  }
}

function collectElements() {
  const ids = [
    'classroom-space', 'classroom-space-error', 'classroom-space-back',
    'classroom-space-read-only',
    'classroom-space-subject', 'classroom-space-title', 'classroom-space-tutor', 'classroom-space-status',
    'classroom-space-manage-toggle', 'classroom-space-management', 'classroom-space-management-close',
    'classroom-management-tutor', 'classroom-management-tutor-state',
    'classroom-management-schedule-state', 'classroom-management-end-date',
    'classroom-management-ending-state', 'classroom-management-termination-state',
    'classroom-detail-subject', 'classroom-detail-focus', 'classroom-detail-student',
    'classroom-detail-tutor', 'classroom-detail-mentor-row', 'classroom-detail-mentor',
    'classroom-detail-provider',
    'classroom-detail-dates', 'classroom-detail-model', 'classroom-schedule-summary',
    'classroom-schedule-linkage', 'classroom-schedule-name', 'classroom-schedule-message',
    'classroom-schedule-dates', 'classroom-schedule-sessions', 'classroom-schedule-time-zone',
    'classroom-schedule-versions', 'classroom-space-area-placeholder',
    'classroom-space-home', 'classroom-home-layout', 'classroom-home-layout-feedback',
    'classroom-home-weekly-group', 'classroom-home-schedule-link',
    'classroom-home-coverage',
    'classroom-track-progress-percent', 'classroom-track-progress-bar',
    'classroom-track-progress-fill', 'classroom-track-progress-counts',
    'classroom-track-progress-status', 'classroom-track-progress-breakdown',
    'classroom-course-progress-tracks',
    'classroom-home-this-week-range', 'classroom-home-this-week-empty',
    'classroom-home-this-week-list', 'classroom-home-coming-next-range',
    'classroom-home-coming-next-empty', 'classroom-home-coming-next-list',
    'classroom-area-placeholder-title',
    'classroom-area-placeholder-description', 'classroom-area-placeholder-phase',
    'classroom-space-live-entry',
    'classroom-space-schedule-view', 'classroom-schedule-view-description',
    'classroom-schedule-view-coverage',
    'classroom-schedule-studied-hold',
    'classroom-schedule-view-count', 'classroom-schedule-view-time-zone',
    'classroom-schedule-log-toggle',
    'classroom-schedule-print', 'classroom-schedule-pdf-style',
    'classroom-schedule-edit-link', 'classroom-schedule-progress-feedback',
    'classroom-schedule-view-error', 'classroom-schedule-view-error-message',
    'classroom-schedule-view-retry', 'classroom-schedule-view-loading',
    'classroom-current-schedule-plan',
    'classroom-schedule-view-empty', 'classroom-schedule-session-list',
    'classroom-current-schedule-log', 'classroom-current-schedule-log-count',
    'classroom-current-schedule-log-error',
    'classroom-current-schedule-log-error-message',
    'classroom-current-schedule-log-retry',
    'classroom-current-schedule-log-loading',
    'classroom-current-schedule-log-empty',
    'classroom-current-schedule-log-list',
    'classroom-schedule-print-document', 'classroom-schedule-print-page-style',
    'classroom-schedule-print-title',
    'classroom-schedule-print-student', 'classroom-schedule-print-tutor',
    'classroom-schedule-print-education-level',
    'classroom-schedule-print-subject', 'classroom-schedule-print-track',
    'classroom-schedule-print-generated', 'classroom-schedule-print-list',
    'classroom-schedule-print-copyright',
    'classroom-progress-confirm-dialog',
    'classroom-progress-reason-dialog', 'classroom-progress-reason-form',
    'classroom-progress-reason-title', 'classroom-progress-reason-description',
    'classroom-progress-reason', 'classroom-progress-reason-error',
    'classroom-space-files', 'classroom-files-count', 'classroom-files-feedback',
    'classroom-files-error', 'classroom-files-error-message', 'classroom-files-retry',
    'classroom-files-upload-form', 'classroom-files-input', 'classroom-files-dropzone',
    'classroom-files-rules', 'classroom-files-choose', 'classroom-files-upload',
    'classroom-files-selection', 'classroom-files-read-only', 'classroom-files-loading',
    'classroom-files-empty', 'classroom-files-list', 'classroom-file-dialog',
    'classroom-space-history', 'classroom-history-count',
    'classroom-history-error', 'classroom-history-error-message',
    'classroom-history-retry', 'classroom-history-loading',
    'classroom-history-empty', 'classroom-history-version-list',
    'classroom-history-audit', 'classroom-history-audit-count',
    'classroom-history-audit-print', 'classroom-history-audit-error',
    'classroom-history-audit-list',
    'classroom-audit-print-document', 'classroom-audit-print-title',
    'classroom-audit-print-student', 'classroom-audit-print-tutor',
    'classroom-audit-print-generated', 'classroom-audit-print-list',
    'classroom-file-dialog-form', 'classroom-file-dialog-kicker',
    'classroom-file-dialog-title', 'classroom-file-dialog-description',
    'classroom-file-dialog-file', 'classroom-file-dialog-reason-label',
    'classroom-file-dialog-reason', 'classroom-file-dialog-reason-help',
    'classroom-file-dialog-error', 'classroom-file-dialog-cancel',
    'classroom-file-dialog-confirm'
  ]
  ids.forEach((id) => { elements[toCamelCase(id)] = document.getElementById(id) })
  elements.root = elements.classroomSpace
  elements.error = elements.classroomSpaceError
  elements.areaButtons = [...document.querySelectorAll('[data-classroom-area]')]
}

function bindClassroomHomeLayoutControls() {
  elements.classroomHomeLayout.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle-classroom-home-block]')
    if (toggle) {
      if (!canCustomizeClassroomHomeLayout()) return
      const blockKey = toggle.dataset.toggleClassroomHomeBlock
      const previous = cloneClassroomHomePreferences()
      classroomHomePreferences.collapsedBlocks =
        toggleClassroomHomeBlockCollapsed(
          classroomHomePreferences.collapsedBlocks,
          blockKey
        )
      renderCollapsedClassroomHomeBlocks({ animate: true })
      void persistClassroomHomeLayout(previous)
      return
    }

    const move = event.target.closest('[data-move-classroom-home-block]')
    if (!move || !canCustomizeClassroomHomeLayout()) return
    const block = move.closest('[data-classroom-home-block]')
    if (!block) return
    const previous = cloneClassroomHomePreferences()
    const nextOrder = moveClassroomHomeBlock(
      classroomHomePreferences.blockOrder,
      block.dataset.classroomHomeBlock,
      move.dataset.moveClassroomHomeBlock
    )
    if (sameClassroomHomeOrder(nextOrder, classroomHomePreferences.blockOrder)) return
    classroomHomePreferences.blockOrder = nextOrder
    applyClassroomHomeBlockOrder({ animate: true })
    void persistClassroomHomeLayout(previous)
  })

  elements.classroomHomeLayout.addEventListener('dragstart', (event) => {
    const handle = event.target.closest('[data-classroom-home-drag-handle]')
    const block = event.target.closest('[data-classroom-home-block]')
    if (!handle || !block || !canCustomizeClassroomHomeLayout()) {
      event.preventDefault()
      return
    }
    draggingClassroomHomeBlock = block.dataset.classroomHomeBlock
    classroomHomeBlocksForGroup(draggingClassroomHomeBlock)
      .forEach((groupBlock) => groupBlock.classList.add('is-dragging'))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', draggingClassroomHomeBlock)
  })

  elements.classroomHomeLayout.addEventListener('dragover', (event) => {
    const target = event.target.closest('[data-classroom-home-block]')
    if (
      !target
      || !draggingClassroomHomeBlock
      || classroomHomeBlockGroupKeys(target.dataset.classroomHomeBlock)
        .includes(draggingClassroomHomeBlock)
    ) return
    event.preventDefault()
    clearClassroomHomeDropTargets()
    classroomHomeBlocksForGroup(target.dataset.classroomHomeBlock)
      .forEach((groupBlock) => groupBlock.classList.add('is-drop-target'))
    event.dataTransfer.dropEffect = 'move'
  })

  elements.classroomHomeLayout.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-classroom-home-block]')
    clearClassroomHomeDropTargets()
    if (
      !target
      || !draggingClassroomHomeBlock
      || !canCustomizeClassroomHomeLayout()
    ) return
    event.preventDefault()
    const previous = cloneClassroomHomePreferences()
    const nextOrder = placeClassroomHomeBlockAtTarget(
      classroomHomePreferences.blockOrder,
      draggingClassroomHomeBlock,
      target.dataset.classroomHomeBlock
    )
    if (sameClassroomHomeOrder(nextOrder, classroomHomePreferences.blockOrder)) return
    classroomHomePreferences.blockOrder = nextOrder
    applyClassroomHomeBlockOrder({ animate: true })
    void persistClassroomHomeLayout(previous)
  })

  elements.classroomHomeLayout.addEventListener('dragend', clearClassroomHomeDragState)
}

async function loadClassroomHomeLayout() {
  classroomHomePreferences = normalizeClassroomHomeLayoutPayload({
    classroomId: currentClassroom?.classroom?.id
  })
  classroomHomeLayoutAvailable = false
  applyClassroomHomeBlockOrder()
  renderCollapsedClassroomHomeBlocks()
  renderClassroomHomeLayoutControls()

  if (currentClassroom?.viewer?.membershipRole !== 'student') return

  try {
    classroomHomePreferences = await getClassroomHomePreferences(
      currentClassroom.classroom.id
    )
    classroomHomeLayoutAvailable = true
    applyClassroomHomeBlockOrder()
    renderCollapsedClassroomHomeBlocks()
    renderClassroomHomeLayoutControls()
  } catch (error) {
    console.error('Classroom Home layout failed:', error)
    showClassroomHomeLayoutFeedback(
      'Layout controls are unavailable until the Classroom service update finishes.',
      { error: true, persistent: true }
    )
  }
}

async function persistClassroomHomeLayout(previousPreferences) {
  if (!canCustomizeClassroomHomeLayout()) return
  classroomHomeLayoutSaving = true
  renderClassroomHomeLayoutControls()
  const requestedPreferences = cloneClassroomHomePreferences()
  try {
    const persistedPreferences = await saveClassroomHomePreferences(
      currentClassroom.classroom.id,
      {
        blockOrder: requestedPreferences.blockOrder,
        collapsedBlocks: requestedPreferences.collapsedBlocks
      }
    )
    const orderChanged = !sameClassroomHomeOrder(
      persistedPreferences.blockOrder,
      requestedPreferences.blockOrder
    )
    const collapsedChanged = !sameClassroomHomeOrder(
      persistedPreferences.collapsedBlocks,
      requestedPreferences.collapsedBlocks
    )
    classroomHomePreferences = persistedPreferences
    if (orderChanged) applyClassroomHomeBlockOrder({ animate: true })
    if (collapsedChanged) renderCollapsedClassroomHomeBlocks()
    showClassroomHomeLayoutFeedback('Classroom Home layout saved.')
  } catch (error) {
    console.error('Classroom Home layout save failed:', error)
    classroomHomePreferences = previousPreferences
    applyClassroomHomeBlockOrder({ animate: true })
    renderCollapsedClassroomHomeBlocks()
    showClassroomHomeLayoutFeedback(
      error?.message || 'The Classroom Home layout could not be saved.',
      { error: true }
    )
  } finally {
    classroomHomeLayoutSaving = false
    renderClassroomHomeLayoutControls()
  }
}

function applyClassroomHomeBlockOrder({ animate = false } = {}) {
  if (!classroomHomePreferences) return
  const blocks = new Map(
    [...elements.classroomHomeLayout.querySelectorAll('[data-classroom-home-block]')]
      .map((block) => [block.dataset.classroomHomeBlock, block])
  )
  const previousPositions = animate
    ? new Map([...blocks].map(([key, block]) => [key, block.getBoundingClientRect()]))
    : new Map()
  let weeklyGroupPlaced = false
  classroomHomePreferences.blockOrder.forEach((key) => {
    if (classroomHomeBlockGroupKeys(key).length > 1) {
      if (!weeklyGroupPlaced) {
        elements.classroomHomeLayout.append(elements.classroomHomeWeeklyGroup)
        weeklyGroupPlaced = true
      }
      return
    }
    const block = blocks.get(key)
    if (block) elements.classroomHomeLayout.append(block)
  })
  if (!animate || !motionAllowed()) {
    renderClassroomHomeLayoutControls()
    return
  }
  blocks.forEach((block, key) => {
    const previous = previousPositions.get(key)
    const current = block.getBoundingClientRect()
    const offsetX = previous?.left - current.left
    const offsetY = previous?.top - current.top
    if (!offsetX && !offsetY) return
    block.animate([
      { transform: `translate(${offsetX}px, ${offsetY}px)` },
      { transform: 'translate(0, 0)' }
    ], {
      duration: 920,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    })
  })
  renderClassroomHomeLayoutControls()
}

function renderCollapsedClassroomHomeBlocks({ animate = false } = {}) {
  if (!classroomHomePreferences) return
  elements.classroomHomeLayout
    .querySelectorAll('[data-classroom-home-block]')
    .forEach((block) => {
      const blockKey = block.dataset.classroomHomeBlock
      const collapsed = classroomHomePreferences.collapsedBlocks.includes(blockKey)
      const body = block.querySelector('.classroom-home-block-body')
      const wasCollapsed = block.classList.contains('is-collapsed')
      const shouldAnimate = animate && wasCollapsed !== collapsed && motionAllowed()
      const fromHeight = shouldAnimate && body
        ? body.getBoundingClientRect().height
        : 0

      block.classList.toggle('is-collapsed', collapsed)
      if (body) {
        body.inert = collapsed
        body.setAttribute('aria-hidden', String(collapsed))
        if (shouldAnimate) {
          animateClassroomHomeBlockCollapse(body, {
            collapsed,
            fromHeight,
            toHeight: collapsed ? 0 : body.scrollHeight
          })
        }
      }
      if (collapsed) {
        block.querySelectorAll('details[open]').forEach((details) => {
          details.open = false
        })
      }
      const button = block.querySelector('[data-toggle-classroom-home-block]')
      if (!button) return
      button.textContent = collapsed ? 'Maximize' : 'Minimize'
      button.setAttribute('aria-expanded', String(!collapsed))
    })
}

function animateClassroomHomeBlockCollapse(body, {
  collapsed,
  fromHeight,
  toHeight
}) {
  const timing = {
    duration: 920,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
  }
  body.animate([
    {
      height: `${fromHeight}px`,
      opacity: collapsed ? 1 : 0
    },
    {
      height: `${toHeight}px`,
      opacity: collapsed ? 0 : 1
    }
  ], timing)
}

function renderClassroomHomeLayoutControls() {
  const editable = classroomHomeLayoutIsEditable()
  const order = classroomHomePreferences?.blockOrder || []
  elements.classroomSpaceHome.setAttribute(
    'aria-busy',
    String(classroomHomeLayoutSaving)
  )
  elements.classroomHomeLayout
    .querySelectorAll('.classroom-home-layout-controls')
    .forEach((controls) => {
      controls.hidden = !editable
    })
  elements.classroomHomeLayout
    .querySelectorAll('[data-classroom-home-drag-handle]')
    .forEach((handle) => {
      // Keep the handle's layout footprint stable while preferences save.
      // canCustomizeClassroomHomeLayout() still prevents a drag from starting.
      handle.draggable = editable
      handle.setAttribute(
        'aria-disabled',
        String(!editable || classroomHomeLayoutSaving)
      )
      const blockKey = handle.closest('[data-classroom-home-block]')
        ?.dataset.classroomHomeBlock
      if (editable && !classroomHomeLayoutSaving) {
        handle.title = `Drag to move ${classroomHomeBlockLabel(blockKey)}`
      }
      else handle.removeAttribute('title')
    })
  elements.classroomHomeLayout
    .querySelectorAll('[data-classroom-home-block]')
    .forEach((block) => {
      const blockKey = block.dataset.classroomHomeBlock
      const up = block.querySelector('[data-move-classroom-home-block="up"]')
      const down = block.querySelector('[data-move-classroom-home-block="down"]')
      const collapse = block.querySelector('[data-toggle-classroom-home-block]')
      if (up) {
        up.disabled = sameClassroomHomeOrder(
          moveClassroomHomeBlock(order, blockKey, 'up'),
          order
        )
        up.setAttribute(
          'aria-disabled',
          String(up.disabled || classroomHomeLayoutSaving)
        )
      }
      if (down) {
        down.disabled = sameClassroomHomeOrder(
          moveClassroomHomeBlock(order, blockKey, 'down'),
          order
        )
        down.setAttribute(
          'aria-disabled',
          String(down.disabled || classroomHomeLayoutSaving)
        )
      }
      if (collapse) {
        collapse.disabled = false
        collapse.setAttribute('aria-disabled', String(classroomHomeLayoutSaving))
      }
    })
}

function canCustomizeClassroomHomeLayout() {
  return classroomHomeLayoutIsEditable() && !classroomHomeLayoutSaving
}

function classroomHomeLayoutIsEditable() {
  return Boolean(
    classroomHomeLayoutAvailable
    && currentClassroom?.viewer?.membershipRole === 'student'
    && currentClassroom?.viewer?.membershipStatus === 'active'
    && currentClassroom?.classroom?.status === 'active'
    && !currentClassroom?.classroom?.readOnly
  )
}

function motionAllowed() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function cloneClassroomHomePreferences() {
  return normalizeClassroomHomeLayoutPayload({
    ...classroomHomePreferences,
    blockOrder: [...classroomHomePreferences.blockOrder],
    collapsedBlocks: [...classroomHomePreferences.collapsedBlocks]
  })
}

function sameClassroomHomeOrder(left, right) {
  return left.length === right.length
    && left.every((key, index) => key === right[index])
}

function classroomHomeBlockLabel(blockKey) {
  return {
    progress: 'Course progress',
    'this-week': 'This week and Coming next',
    'coming-next': 'This week and Coming next',
    calendar: 'Calendar'
  }[blockKey] || 'Classroom Home block'
}

function clearClassroomHomeDropTargets() {
  elements.classroomHomeLayout
    .querySelectorAll('.is-drop-target')
    .forEach((block) => block.classList.remove('is-drop-target'))
}

function clearClassroomHomeDragState() {
  draggingClassroomHomeBlock = ''
  clearClassroomHomeDropTargets()
  elements.classroomHomeLayout
    .querySelectorAll('.is-dragging')
    .forEach((block) => block.classList.remove('is-dragging'))
}

function classroomHomeBlocksForGroup(blockKey) {
  return classroomHomeBlockGroupKeys(blockKey)
    .map((key) => elements.classroomHomeLayout.querySelector(
      `[data-classroom-home-block="${key}"]`
    ))
    .filter(Boolean)
}

function showClassroomHomeLayoutFeedback(message, {
  error = false,
  persistent = false
} = {}) {
  window.clearTimeout(classroomHomeLayoutFeedbackTimer)
  elements.classroomHomeLayoutFeedback.textContent = message
  elements.classroomHomeLayoutFeedback.classList.toggle('is-error', error)
  if (persistent || !message) return
  classroomHomeLayoutFeedbackTimer = window.setTimeout(() => {
    elements.classroomHomeLayoutFeedback.textContent = ''
    elements.classroomHomeLayoutFeedback.classList.remove('is-error')
  }, 3600)
}

function bindClassroomScheduleControls() {
  setCurrentScheduleSubtab(currentScheduleSubtab)
  elements.classroomScheduleViewRetry.addEventListener('click', () => {
    void loadClassroomSchedule({ force: true })
  })
  elements.classroomScheduleLogToggle.addEventListener('click', () => {
    const nextSubtab =
      currentScheduleSubtab === 'log' ? 'schedule' : 'log'
    setCurrentScheduleSubtab(nextSubtab)
    if (nextSubtab === 'log') void loadCurrentScheduleLog()
  })
  elements.classroomCurrentScheduleLogRetry.addEventListener('click', () => {
    void loadCurrentScheduleLog({ force: true })
  })
  elements.classroomSchedulePrint.addEventListener('click', () => {
    void printClassroomSchedule()
  })
  window.addEventListener('afterprint', clearClassroomSchedulePrintMode)
  window.addEventListener('afterprint', clearClassroomAuditPrintMode)
  elements.classroomScheduleSessionList.addEventListener('click', (event) => {
    const moduleStyle = event.target.closest('button[data-module-style]')
    if (moduleStyle) {
      void handleModuleStyleAction(moduleStyle)
      return
    }
    const toggle = event.target.closest('button[data-schedule-details]')
    if (toggle) {
      toggleScheduleSessionDetails(toggle.dataset.scheduleDetails, toggle)
      return
    }
    const action = event.target.closest('button[data-progress-action]')
    if (action) void handleCourseProgressAction(action)
  })
  elements.classroomSchedulePdfStyle.addEventListener('change', (event) => {
    const colorInput = event.target.closest('input[data-pdf-color-input]')
    if (colorInput) void handlePdfStyleAction(colorInput)
  })
  document.addEventListener('click', closeScheduleStylePopoversOutside)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const openStyle = document.querySelector(
      '.classroom-schedule-module-style[open], '
        + '.classroom-schedule-pdf-style[open], '
        + '.classroom-track-progress-help[open]'
    )
    if (!openStyle) return
    openStyle.open = false
    openStyle.querySelector('summary')?.focus({ preventScroll: true })
  })
  for (const dialog of [
    elements.classroomProgressConfirmDialog,
    elements.classroomProgressReasonDialog
  ]) {
    dialog?.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('cancel')
    })
  }
}

function bindClassroomAreaControls() {
  elements.areaButtons.forEach((button) => {
    button.addEventListener('click', () => showClassroomArea(button.dataset.classroomArea))
  })
  window.addEventListener('popstate', () => showClassroomArea(areaFromLocation(), { updateHistory: false }))
}

function bindClassroomHistoryControls() {
  elements.classroomHistoryRetry.addEventListener('click', () => {
    void loadClassroomHistory({ force: true })
  })
  elements.classroomHistoryAuditPrint.addEventListener('click', () => {
    printClassroomScheduleAudit()
  })
}

function bindProgressHelperControls() {
  document.querySelectorAll('.classroom-track-progress-help').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (details.open) {
        document.querySelectorAll('.classroom-track-progress-help[open]')
          .forEach((otherDetails) => {
            if (otherDetails !== details) otherDetails.open = false
          })
        syncProgressHelperBlockState(details)
        positionProgressHelper(details)
      } else {
        resetProgressHelperPosition(details)
        syncProgressHelperBlockState(details)
      }
    })
  })
  const schedulePositionUpdate = () => {
    window.cancelAnimationFrame(progressHelperPositionFrame)
    progressHelperPositionFrame = window.requestAnimationFrame(() => {
      progressHelperPositionFrame = 0
      document.querySelectorAll('.classroom-track-progress-help[open]')
        .forEach(positionProgressHelper)
    })
  }
  window.addEventListener('resize', schedulePositionUpdate)
  window.visualViewport?.addEventListener('resize', schedulePositionUpdate)
  window.visualViewport?.addEventListener('scroll', schedulePositionUpdate)
  document.addEventListener('scroll', schedulePositionUpdate, {
    capture: true,
    passive: true
  })
}

function syncProgressHelperBlockState(details) {
  const block = details?.closest('[data-classroom-home-block]')
  if (!block) return
  block.classList.toggle(
    'has-open-progress-helper',
    Boolean(block.querySelector('.classroom-track-progress-help[open]'))
  )
}

function progressHelperViewport() {
  const visualViewport = window.visualViewport
  return {
    left: visualViewport?.offsetLeft || 0,
    top: visualViewport?.offsetTop || 0,
    width: visualViewport?.width || document.documentElement.clientWidth,
    height: visualViewport?.height || document.documentElement.clientHeight
  }
}

function positionProgressHelper(details) {
  if (!details?.open) return
  const summary = details.querySelector('summary')
  const panel = [...details.children].find((child) => child.tagName === 'DIV')
  if (!summary || !panel) return

  const viewport = progressHelperViewport()
  const margin = viewport.width <= 560 ? 12 : 16
  const gap = 8
  const preferredWidth = details.classList.contains('classroom-track-progress-breakdown')
    ? 310
    : 370
  const width = Math.max(0, Math.min(preferredWidth, viewport.width - (margin * 2)))

  details.classList.add('is-viewport-positioned')
  Object.assign(panel.style, {
    position: 'absolute',
    right: 'auto',
    bottom: 'auto',
    left: '0px',
    top: '0px',
    width: `${width}px`,
    maxWidth: `${width}px`,
    maxHeight: `${Math.max(0, viewport.height - (margin * 2))}px`,
    visibility: 'hidden'
  })

  const summaryBounds = summary.getBoundingClientRect()
  const placement = placeClassroomHomeHelper({
    viewport,
    anchor: summaryBounds,
    panel: panel.getBoundingClientRect(),
    align: details.classList.contains('classroom-track-progress-breakdown')
      ? 'start'
      : 'end',
    margin,
    gap
  })
  const detailsBounds = details.getBoundingClientRect()
  panel.style.left = `${placement.left - detailsBounds.left}px`
  panel.style.top = `${placement.top - detailsBounds.top}px`
  panel.style.maxHeight = `${placement.maxHeight}px`
  panel.style.visibility = ''
}

function resetProgressHelperPosition(details) {
  const panel = [...details.children].find((child) => child.tagName === 'DIV')
  details.classList.remove('is-viewport-positioned')
  if (!panel) return
  ;['position', 'right', 'bottom', 'left', 'top', 'width', 'maxWidth', 'maxHeight', 'visibility']
    .forEach((property) => panel.style.removeProperty(property))
}

function bindManagementControls() {
  elements.classroomSpaceManageToggle.addEventListener('click', () => {
    setManagementExpanded(elements.classroomSpaceManageToggle.getAttribute('aria-expanded') !== 'true')
  })
  elements.classroomSpaceManagementClose.addEventListener('click', () => {
    setManagementExpanded(false)
    elements.classroomSpaceManageToggle.focus({ preventScroll: true })
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.classroomSpaceManageToggle.getAttribute('aria-expanded') === 'true') {
      setManagementExpanded(false)
      elements.classroomSpaceManageToggle.focus({ preventScroll: true })
    }
  })
  elements.classroomScheduleSessionList.addEventListener('change', (event) => {
    const colorInput = event.target.closest('input[data-module-color-input]')
    if (colorInput) void handleModuleStyleAction(colorInput)
  })
}

function bindClassroomFilesControls() {
  elements.classroomFilesChoose.addEventListener('click', () => elements.classroomFilesInput.click())
  elements.classroomFilesInput.addEventListener('change', () => {
    selectUpload(elements.classroomFilesInput.files?.[0] || null)
  })
  elements.classroomFilesUploadForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitClassroomFileUpload()
  })
  elements.classroomFilesRetry.addEventListener('click', () => void loadClassroomFiles({ force: true }))
  elements.classroomFilesList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-file-action]')
    if (!button) return
    const file = currentFiles?.files.find((candidate) => candidate.id === button.dataset.fileId)
    if (file) void handleClassroomFileAction(button.dataset.fileAction, file)
  })
  ;['dragenter', 'dragover'].forEach((eventName) => {
    elements.classroomFilesDropzone.addEventListener(eventName, (event) => {
      if (!currentFiles?.access.canUpload) return
      event.preventDefault()
      elements.classroomFilesDropzone.classList.add('is-dragging')
    })
  })
  ;['dragleave', 'drop'].forEach((eventName) => {
    elements.classroomFilesDropzone.addEventListener(eventName, (event) => {
      elements.classroomFilesDropzone.classList.remove('is-dragging')
      if (eventName !== 'drop' || !currentFiles?.access.canUpload) return
      event.preventDefault()
      const droppedFiles = event.dataTransfer?.files || []
      if (droppedFiles.length > 1) {
        selectUpload(null)
        showClassroomFilesFeedback('Add one Classroom file at a time.', { error: true })
        return
      }
      selectUpload(droppedFiles[0] || null)
    })
  })
  elements.classroomFileDialogCancel.addEventListener('click', () => elements.classroomFileDialog.close())
  elements.classroomFileDialogForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitClassroomFileAction()
  })
  elements.classroomFileDialog.addEventListener('cancel', (event) => {
    if (elements.classroomFileDialogConfirm.disabled) event.preventDefault()
  })
  elements.classroomFileDialog.addEventListener('close', resetClassroomFileDialog)
}

function classroomIdFromLocation() {
  const classroomId = new URL(window.location.href).searchParams.get('classroom') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classroomId)) {
    throw new TypeError('A valid Classroom link is required.')
  }
  return classroomId
}

function renderClassroom(classroom) {
  currentClassroom = classroom
  document.title = `${classroom.course.title} Classroom - Kelp`
  elements.classroomSpaceSubject.textContent = classroom.focus.name
    ? `${classroom.subject.name} · ${classroom.focus.name}`
    : classroom.subject.name
  elements.classroomSpaceTitle.textContent = classroom.course.title
  elements.classroomSpaceTutor.textContent = `Tutor: ${classroom.tutor.name}`
  elements.classroomSpaceStatus.textContent = classroomStatusLabel(classroom)
  elements.classroomSpaceStatus.dataset.status = classroom.course.status
  elements.classroomDetailSubject.textContent = classroom.subject.name
  elements.classroomDetailFocus.textContent = classroom.focus.name || 'Course-wide'
  elements.classroomDetailStudent.textContent = classroom.student.name
  elements.classroomDetailTutor.textContent = classroom.tutor.name
  const showMentor = Boolean(classroom.mentor)
  elements.classroomDetailMentorRow.hidden = !showMentor
  elements.classroomDetailMentor.textContent = showMentor ? classroom.mentor.name : ''
  elements.classroomDetailProvider.textContent = classroom.provider.label
  elements.classroomDetailDates.textContent = describeCourseDates(
    classroom.course.startDate,
    classroom.course.scheduledEndDate
  )
  elements.classroomDetailModel.textContent = titleCase(classroom.course.serviceModel.replaceAll('_', ' '))
  renderScheduleSummary(classroom.schedule)
  renderScheduleBuilderLink(classroom)
  const back = backDestination(classroom)
  elements.classroomSpaceBack.href = back.href
  elements.classroomSpaceBack.textContent = back.label
  elements.classroomSpaceReadOnly.classList.toggle('is-hidden', !classroom.classroom.readOnly)
  elements.root.dataset.accessMode = classroom.viewer.accessMode
  elements.classroomSpaceLiveEntry.textContent = classroom.classroom.readOnly
    ? 'Lesson room unavailable'
    : 'Lesson room'
  elements.classroomSpaceLiveEntry.title = classroom.classroom.readOnly
    ? 'Live lessons are unavailable in a historical Classroom'
    : 'An eligible scheduled Class is required'
  renderManagementSurface(classroom)
  classroomCalendar?.setContext(classroom)
}

function areaFromLocation() {
  return normalizeClassroomArea(new URL(window.location.href).searchParams.get('area'))
}

function showClassroomArea(requestedArea, {
  updateHistory = true,
  loadData = true
} = {}) {
  const area = getClassroomArea(requestedArea)
  elements.areaButtons.forEach((button) => {
    const active = button.dataset.classroomArea === area.key
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })

  const isHome = area.key === 'home'
  const isOverview = area.key === 'overview'
  const isSchedule = area.key === 'schedule'
  const isFiles = area.key === 'files'
  const isHistory = area.key === 'history'
  elements.classroomSpaceHome.hidden = !isHome
  document.getElementById('overview').hidden = !isOverview
  elements.classroomSpaceScheduleView.hidden = !isSchedule
  elements.classroomSpaceFiles.hidden = !isFiles
  elements.classroomSpaceHistory.hidden = !isHistory
  elements.classroomSpaceAreaPlaceholder.hidden =
    isHome || isOverview || isSchedule || isFiles || isHistory

  if (!isHome && !isOverview && !isSchedule && !isFiles && !isHistory) {
    elements.classroomAreaPlaceholderTitle.textContent = area.title
    elements.classroomAreaPlaceholderDescription.textContent = area.description
    elements.classroomAreaPlaceholderPhase.textContent = `${area.owningPhase} will make this area functional.`
  }
  if (loadData) {
    if (isHome || isSchedule) void loadClassroomSchedule()
    if (isHome) void classroomCalendar?.load()
    if (isFiles) void loadClassroomFiles({ force: true })
    if (isHistory) void loadClassroomHistory()
  }

  if (currentClassroom) {
    document.title = isHome
      ? `${currentClassroom.course.title} Classroom - Kelp`
      : `${area.label} · ${currentClassroom.course.title} - Kelp`
  }
  if (updateHistory && area.key !== areaFromLocation()) {
    window.history.pushState({ classroomArea: area.key }, '', classroomAreaHref(window.location.href, area.key))
  }
}

async function loadClassroomHistory({ force = false } = {}) {
  if (!currentClassroom || (currentHistory && !force)) {
    if (currentHistory) renderClassroomHistory(currentHistory)
    if (currentScheduleAudit) renderClassroomScheduleAudit(currentScheduleAudit)
    return
  }
  const requestToken = ++historyRequestToken
  elements.classroomSpaceHistory.setAttribute('aria-busy', 'true')
  elements.classroomHistoryLoading.classList.remove('is-hidden')
  elements.classroomHistoryError.classList.add('is-hidden')
  try {
    const payload = await getClassroomLearningHistoryData(currentClassroom.course.id)
    if (requestToken !== historyRequestToken) return
    currentHistory = payload
    renderClassroomHistory(payload)
    if (canLoadClassroomScheduleAudit()) {
      elements.classroomHistoryAudit.classList.remove('is-hidden')
      elements.classroomHistoryAuditError.classList.add('is-hidden')
      try {
        const audit = await getClassroomScheduleAuditData(currentClassroom.course.id)
        if (requestToken !== historyRequestToken) return
        currentScheduleAudit = audit
        renderClassroomScheduleAudit(audit)
      } catch (auditError) {
        if (requestToken !== historyRequestToken) return
        currentScheduleAudit = null
        elements.classroomHistoryAuditError.textContent =
          auditError?.message || 'Schedule audit history could not be loaded.'
        elements.classroomHistoryAuditError.classList.remove('is-hidden')
        elements.classroomHistoryAuditList.replaceChildren()
        elements.classroomHistoryAuditPrint.disabled = true
      }
    } else {
      currentScheduleAudit = null
      elements.classroomHistoryAudit.classList.add('is-hidden')
    }
  } catch (error) {
    if (requestToken !== historyRequestToken) return
    elements.classroomHistoryErrorMessage.textContent =
      error?.message || 'Course learning history could not be loaded.'
    elements.classroomHistoryError.classList.remove('is-hidden')
    elements.classroomHistoryVersionList.replaceChildren()
    elements.classroomHistoryEmpty.classList.add('is-hidden')
  } finally {
    if (requestToken === historyRequestToken) {
      elements.classroomSpaceHistory.setAttribute('aria-busy', 'false')
      elements.classroomHistoryLoading.classList.add('is-hidden')
    }
  }
}

function canLoadClassroomScheduleAudit() {
  return ['tutor', 'mentor', 'administrator', 'quality_assistant']
    .includes(currentClassroom?.viewer?.membershipRole)
}

function renderClassroomHistory(history) {
  const versions = Array.isArray(history?.versions) ? history.versions : []
  const workedCount = Number(history?.summary?.workedSessionCount) || 0
  elements.classroomHistoryCount.textContent =
    `${workedCount} worked ${workedCount === 1 ? 'session' : 'sessions'}`
  elements.classroomHistoryEmpty.classList.toggle('is-hidden', versions.length > 0)
  elements.classroomHistoryVersionList.replaceChildren(
    ...versions.map(createClassroomHistoryVersion)
  )
}

function createClassroomHistoryVersion(version, index = 0) {
  const group = document.createElement('section')
  group.className = 'classroom-history-version'
  const titleId = `classroom-history-version-title-${index + 1}`
  const bodyId = `classroom-history-version-body-${index + 1}`
  group.setAttribute('aria-labelledby', titleId)

  const summary = document.createElement('header')
  summary.className = 'classroom-history-version-summary'
  const heading = document.createElement('div')
  const eyebrow = document.createElement('span')
  eyebrow.textContent = `Previous Schedule · Version ${version.versionNumber}`
  const title = document.createElement('strong')
  title.id = titleId
  title.textContent = version.name
  const context = document.createElement('small')
  context.textContent = version.coverageLabel || 'Previous Course coverage'
  heading.append(eyebrow, title, context)
  const summaryActions = document.createElement('div')
  summaryActions.className = 'classroom-history-version-actions'
  const count = document.createElement('span')
  count.textContent =
    `${version.workedSessionCount} worked ${
      version.workedSessionCount === 1 ? 'session' : 'sessions'
    }`
  const reportCard = document.createElement('button')
  reportCard.type = 'button'
  reportCard.className = 'classroom-history-report-card'
  reportCard.textContent = 'Report Card'
  reportCard.disabled = true
  reportCard.title = 'Report Cards will be added in Phase 13.'
  reportCard.setAttribute(
    'aria-label',
    `Report Card for ${version.name} will be available in Phase 13`
  )
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'classroom-history-version-toggle'
  toggle.setAttribute('aria-controls', bodyId)

  const body = document.createElement('div')
  body.className = 'classroom-history-version-body'
  body.id = bodyId
  const bodyInner = document.createElement('div')
  bodyInner.className = 'classroom-history-version-body-inner'

  const setExpanded = (expanded) => {
    const isExpanded = Boolean(expanded)
    const action = isExpanded ? 'Minimize' : 'Maximize'
    group.classList.toggle('is-expanded', isExpanded)
    toggle.textContent = action
    toggle.setAttribute('aria-expanded', String(isExpanded))
    toggle.setAttribute('aria-label', `${action} ${version.name}`)
    body.setAttribute('aria-hidden', String(!isExpanded))
    body.inert = !isExpanded
  }
  toggle.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    setExpanded(!group.classList.contains('is-expanded'))
  })
  setExpanded(false)
  summaryActions.append(count, reportCard, toggle)
  summary.append(heading, summaryActions)

  const list = document.createElement('ul')
  list.className = 'classroom-history-session-list'
  list.append(...version.items.map((item) =>
    createClassroomHistorySession(item, version.timeZone)
  ))
  bodyInner.append(list)
  body.append(bodyInner)
  group.append(summary, body)
  return group
}

function createClassroomHistorySession(item, timeZone) {
  const row = document.createElement('li')
  const date = document.createElement('time')
  date.dateTime = item.lastWorkedAt || item.scheduledDate || ''
  date.textContent =
    (item.lastWorkedAt ? formatProgressDate(item.lastWorkedAt, timeZone) : '')
    || (item.scheduledDate ? formatDate(item.scheduledDate) : 'Date unavailable')

  const content = document.createElement('div')
  const title = document.createElement('strong')
  const link = document.createElement('a')
  link.href = classroomHistorySessionHref(item)
  link.textContent = item.title
  title.append(link)
  const context = document.createElement('span')
  context.textContent = [
    item.sourceSubjectTitle,
    item.sourceTrackTitle,
    item.sourceModuleTitle,
    !item.sourceTrackTitle && item.sourceTrackSlug
      ? titleCase(item.sourceTrackSlug.replaceAll('-', ' '))
      : null,
    item.sourceAvailable ? null : 'Content unavailable'
  ].filter(Boolean).join(' · ')
  content.append(title)
  if (context.textContent) content.append(context)

  const progress = document.createElement('div')
  progress.className = 'classroom-history-progress'
  for (const [key, label] of [
    ['studied', 'Studied'],
    ['reviewed', 'Reviewed'],
    ['practiced', 'Practiced']
  ]) {
    if (!item.progress[key]) continue
    const badge = document.createElement('span')
    badge.dataset.progressKind = key
    badge.textContent = label
    progress.appendChild(badge)
  }
  row.append(date, content, progress)
  return row
}

function classroomHistorySessionHref(item) {
  const parameters = new URLSearchParams({
    course: currentHistory?.courseId || currentClassroom?.course?.id || '',
    source: item.sourceSessionKey,
    title: item.title,
    returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`
  })
  return `./classroom-session.html?${parameters.toString()}`
}

function renderClassroomScheduleAudit(audit) {
  const versions = Array.isArray(audit?.versions) ? audit.versions : []
  elements.classroomHistoryAudit.classList.remove('is-hidden')
  elements.classroomHistoryAuditError.classList.add('is-hidden')
  elements.classroomHistoryAuditCount.textContent =
    `${versions.length} ${versions.length === 1 ? 'Version' : 'Versions'}`
  elements.classroomHistoryAuditPrint.disabled =
    !audit?.permissions?.canPrintScheduleAudit || versions.length === 0
  elements.classroomHistoryAuditList.replaceChildren(
    ...versions.map(createClassroomAuditVersion)
  )
}

function createClassroomAuditVersion(version, index = 0) {
  const group = document.createElement('section')
  group.className = 'classroom-history-version classroom-audit-version'
  group.dataset.versionStatus = version.status
  const titleId = `classroom-audit-version-title-${index + 1}`
  const bodyId = `classroom-audit-version-body-${index + 1}`
  group.setAttribute('aria-labelledby', titleId)

  const summary = document.createElement('header')
  summary.className = 'classroom-history-version-summary'
  const heading = document.createElement('div')
  const eyebrow = document.createElement('span')
  eyebrow.textContent =
    `${version.status === 'active' ? 'Active' : 'Previous'} Schedule · Version ${version.versionNumber}`
  const title = document.createElement('strong')
  title.id = titleId
  title.textContent = version.name
  const context = document.createElement('small')
  context.textContent = version.coverageLabel || 'Coverage snapshot unavailable'
  heading.append(eyebrow, title, context)

  const actions = document.createElement('div')
  actions.className = 'classroom-history-version-actions'
  const count = document.createElement('span')
  count.textContent =
    `${version.changeCount} ${version.changeCount === 1 ? 'change' : 'changes'}`
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'classroom-history-version-toggle'
  toggle.setAttribute('aria-controls', bodyId)
  actions.append(count, toggle)
  summary.append(heading, actions)

  const body = document.createElement('div')
  body.className = 'classroom-history-version-body'
  body.id = bodyId
  const bodyInner = document.createElement('div')
  bodyInner.className =
    'classroom-history-version-body-inner classroom-audit-version-body-inner'
  bodyInner.append(
    createClassroomAuditChangeSection(version),
    createClassroomAuditSnapshotSection(version)
  )
  body.append(bodyInner)

  const setExpanded = (expanded) => {
    const isExpanded = Boolean(expanded)
    const action = isExpanded ? 'Minimize' : 'Maximize'
    group.classList.toggle('is-expanded', isExpanded)
    toggle.textContent = action
    toggle.setAttribute('aria-expanded', String(isExpanded))
    toggle.setAttribute('aria-label', `${action} audit Version ${version.versionNumber}`)
    body.setAttribute('aria-hidden', String(!isExpanded))
    body.inert = !isExpanded
  }
  toggle.addEventListener('click', () => {
    setExpanded(!group.classList.contains('is-expanded'))
  })
  setExpanded(false)
  group.append(summary, body)
  return group
}

function createClassroomAuditChangeSection(version) {
  const section = document.createElement('section')
  section.className = 'classroom-audit-version-section'
  const heading = document.createElement('h4')
  heading.textContent = 'Reasoned changes'
  section.append(heading)
  if (!version.changes.length) {
    const empty = document.createElement('p')
    empty.className = 'classroom-audit-empty'
    empty.textContent = 'No structural changes were recorded for this Version.'
    section.append(empty)
    return section
  }

  const groupedChanges = groupClassroomAuditChanges(version.changes)
  const titleByKey = new Map(
    version.items.map((item) => [item.stableItemKey, item.title])
  )
  const publication = document.createElement('article')
  publication.className = 'classroom-audit-change-publication'
  const publicationHeading = document.createElement('div')
  publicationHeading.className = 'classroom-audit-change-publication-heading'
  const publicationTitle = document.createElement('strong')
  publicationTitle.textContent = 'Schedule update'
  publicationHeading.append(
    publicationTitle,
    createScheduleHistoryStamp(
      'Update',
      groupedChanges.recordedAt,
      version.timeZone
    )
  )
  publication.append(publicationHeading)

  if (groupedChanges.studentExplanation) {
    const explanation = document.createElement('p')
    explanation.className = 'classroom-audit-shared-explanation'
    explanation.textContent = groupedChanges.reasonLabel
      ? `${groupedChanges.reasonLabel}: ${groupedChanges.studentExplanation}`
      : groupedChanges.studentExplanation
    publication.append(explanation)
  }

  const publicationMeta = document.createElement('small')
  publicationMeta.textContent = groupedChanges.actorName || ''
  if (publicationMeta.textContent) publication.append(publicationMeta)

  for (const actionGroup of groupedChanges.actionGroups) {
    const actionSection = document.createElement('section')
    actionSection.className = 'classroom-audit-action-group'
    actionSection.dataset.changeType = actionGroup.action
    const actionHeading = document.createElement('h5')
    actionHeading.textContent =
      `${titleCase(actionGroup.action)} (${actionGroup.entries.length})`
    const list = document.createElement('ul')
    list.className = 'classroom-audit-change-list'
    for (const change of actionGroup.entries) {
      const row = document.createElement('li')
      row.dataset.changeType = change.changeType
      const label = document.createElement('strong')
      label.textContent =
        titleByKey.get(change.stableItemKey) || change.stableItemKey
      row.append(label)
      if (!groupedChanges.studentExplanation && change.studentExplanation) {
        const reason = document.createElement('p')
        reason.textContent =
          `${change.reasonLabel}: ${change.studentExplanation}`
        row.append(reason)
      }
      if (change.privateStaffNote) {
        const privateNote = document.createElement('p')
        privateNote.className = 'classroom-audit-private-note'
        privateNote.textContent = `Private note: ${change.privateStaffNote}`
        row.append(privateNote)
      }
      list.append(row)
    }
    actionSection.append(actionHeading, list)
    publication.append(actionSection)
  }

  section.append(publication)
  return section
}

function createClassroomAuditChangeSectionLegacy(version) {
  const section = document.createElement('section')
  section.className = 'classroom-audit-version-section'
  const heading = document.createElement('h4')
  heading.textContent = 'Reasoned changes'
  section.append(heading)
  if (!version.changes.length) {
    const empty = document.createElement('p')
    empty.className = 'classroom-audit-empty'
    empty.textContent = 'No structural changes were recorded for this Version.'
    section.append(empty)
    return section
  }
  const titleByKey = new Map(
    version.items.map((item) => [item.stableItemKey, item.title])
  )
  const list = document.createElement('ul')
  list.className = 'classroom-audit-change-list'
  for (const change of version.changes) {
    const row = document.createElement('li')
    row.dataset.changeType = change.changeType
    const top = document.createElement('div')
    const label = document.createElement('strong')
    label.textContent =
      titleByKey.get(change.stableItemKey) || change.stableItemKey
    const badge = document.createElement('span')
    badge.textContent = titleCase(change.changeType)
    top.append(label, badge)
    const reason = document.createElement('p')
    reason.textContent =
      `${change.reasonLabel}: ${change.studentExplanation}`
    const meta = document.createElement('small')
    meta.textContent = [
      change.actorName,
      change.createdAt
        ? formatProgressDate(change.createdAt, version.timeZone)
        : null
    ].filter(Boolean).join(' · ')
    row.append(top, reason)
    if (change.privateStaffNote) {
      const privateNote = document.createElement('p')
      privateNote.className = 'classroom-audit-private-note'
      privateNote.textContent = `Private note: ${change.privateStaffNote}`
      row.append(privateNote)
    }
    if (meta.textContent) row.append(meta)
    list.append(row)
  }
  section.append(list)
  return section
}

function createClassroomAuditSnapshotSection(version) {
  const section = document.createElement('section')
  section.className = 'classroom-audit-version-section'
  const heading = document.createElement('h4')
  heading.textContent = 'Version snapshot'
  const list = document.createElement('ul')
  list.className = 'classroom-audit-snapshot-list'
  for (const item of version.items) {
    const row = document.createElement('li')
    row.dataset.itemState = item.state
    const order = document.createElement('span')
    order.textContent = String(item.position + 1)
    const content = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = item.title
    const context = document.createElement('small')
    context.textContent = [
      item.sourceModuleTitle,
      item.scheduledDate ? formatDate(item.scheduledDate) : null
    ].filter(Boolean).join(' · ')
    content.append(title)
    if (context.textContent) content.append(context)
    const state = document.createElement('span')
    state.textContent = titleCase(item.state)
    content.append(state)
    row.append(order, content)
    list.append(row)
  }
  section.append(heading, list)
  return section
}

function setCurrentScheduleSubtab(subtab = 'schedule') {
  currentScheduleSubtab = subtab === 'log' ? 'log' : 'schedule'
  const logIsOpen = currentScheduleSubtab === 'log'
  elements.classroomCurrentSchedulePlan.hidden = logIsOpen
  elements.classroomCurrentScheduleLog.hidden = !logIsOpen
  elements.classroomScheduleLogToggle.setAttribute(
    'aria-pressed',
    String(logIsOpen)
  )
  elements.classroomScheduleLogToggle.textContent =
    logIsOpen ? 'Schedule' : 'Log'
}

async function loadCurrentScheduleLog({ force = false } = {}) {
  if (!currentClassroom) return
  if (currentScheduleLog && !force) {
    renderCurrentScheduleLog(currentScheduleLog)
    return
  }
  const requestToken = ++scheduleLogRequestToken
  elements.classroomCurrentScheduleLog.setAttribute('aria-busy', 'true')
  elements.classroomCurrentScheduleLogLoading.classList.remove('is-hidden')
  elements.classroomCurrentScheduleLogError.classList.add('is-hidden')
  try {
    const payload = await getClassroomCurrentScheduleLogData(
      currentClassroom.course.id
    )
    if (requestToken !== scheduleLogRequestToken) return
    currentScheduleLog = payload
    renderCurrentScheduleLog(payload)
  } catch (error) {
    if (requestToken !== scheduleLogRequestToken) return
    elements.classroomCurrentScheduleLogErrorMessage.textContent =
      error?.message || 'The current Schedule Log could not be loaded.'
    elements.classroomCurrentScheduleLogError.classList.remove('is-hidden')
    elements.classroomCurrentScheduleLogList.replaceChildren()
    elements.classroomCurrentScheduleLogEmpty.classList.add('is-hidden')
    elements.classroomCurrentScheduleLogCount.textContent = 'Log unavailable'
  } finally {
    if (requestToken === scheduleLogRequestToken) {
      elements.classroomCurrentScheduleLog.setAttribute('aria-busy', 'false')
      elements.classroomCurrentScheduleLogLoading.classList.add('is-hidden')
    }
  }
}

function renderCurrentScheduleLog(log) {
  const entries = Array.isArray(log?.entries) ? log.entries : []
  const entryGroups = groupCurrentScheduleLogEntries(entries)
  elements.classroomCurrentScheduleLogError.classList.add('is-hidden')
  elements.classroomCurrentScheduleLogCount.textContent =
    `${entries.length} ${entries.length === 1 ? 'change' : 'changes'}`
  elements.classroomCurrentScheduleLogEmpty.classList.toggle(
    'is-hidden',
    entries.length > 0
  )
  elements.classroomCurrentScheduleLogList.replaceChildren(
    ...entryGroups.map((group) =>
      createCurrentScheduleLogGroup(group, log.timeZone)
    )
  )
}

function createCurrentScheduleLogGroup(group, timeZone) {
  if (group.groupKind !== 'structure') {
    return createCurrentScheduleLogEntry(group.entries[0], timeZone)
  }

  const row = document.createElement('li')
  row.className =
    'classroom-current-schedule-log-entry classroom-current-schedule-log-update'
  row.dataset.entryKind = 'structure'
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  const title = document.createElement('strong')
  title.textContent = group.actionGroups.length > 1
    ? `${group.entries.length} Schedule changes`
    : `${group.entries.length} ${titleCase(group.actionGroups[0]?.action || 'change')}`
  summary.append(
    title,
    createScheduleHistoryStamp('Update', group.recordedAt, timeZone)
  )
  details.append(summary)

  const body = document.createElement('div')
  body.className = 'classroom-current-schedule-log-update-body'
  if (group.studentExplanation) {
    const explanation = document.createElement('p')
    explanation.className = 'classroom-current-schedule-log-explanation'
    explanation.textContent = group.studentExplanation
    body.append(explanation)
  }

  const meta = document.createElement('small')
  meta.className = 'classroom-current-schedule-log-meta'
  meta.textContent = [
    group.actorName,
    group.actorRole
      ? titleCase(group.actorRole.replaceAll('_', ' '))
      : null,
    group.reasonLabel
  ].filter(Boolean).join(' · ')
  if (meta.textContent) body.append(meta)

  for (const actionGroup of group.actionGroups) {
    const actionSection = document.createElement('section')
    actionSection.className = 'classroom-current-schedule-log-action-group'
    actionSection.dataset.entryAction = actionGroup.action
    const heading = document.createElement('h4')
    heading.textContent =
      `${titleCase(actionGroup.action)} (${actionGroup.entries.length})`
    const list = document.createElement('ul')
    for (const entry of actionGroup.entries) {
      const item = document.createElement('li')
      if (entry.sourceSessionKey) {
        const link = document.createElement('a')
        link.href = currentScheduleLogSessionHref(entry)
        link.textContent = entry.title
        item.append(link)
      } else {
        item.textContent = entry.title
      }
      if (!group.studentExplanation && entry.studentExplanation) {
        const explanation = document.createElement('p')
        explanation.textContent = entry.studentExplanation
        item.append(explanation)
      }
      list.append(item)
    }
    actionSection.append(heading, list)
    body.append(actionSection)
  }

  details.append(body)
  row.append(details)
  return row
}

function createCurrentScheduleLogEntry(entry, timeZone) {
  const row = document.createElement('li')
  row.className = 'classroom-current-schedule-log-entry'
  row.dataset.entryKind = entry.entryKind
  row.dataset.entryAction = entry.action

  const heading = document.createElement('div')
  heading.className = 'classroom-current-schedule-log-entry-heading'
  const title = document.createElement('strong')
  if (entry.sourceSessionKey) {
    const link = document.createElement('a')
    link.href = currentScheduleLogSessionHref(entry)
    link.textContent = entry.title
    title.append(link)
  } else {
    title.textContent = entry.title
  }
  heading.append(title)
  row.append(
    heading,
    createScheduleHistoryStamp(
      currentScheduleLogActionLabel(entry),
      entry.recordedAt,
      timeZone
    )
  )

  if (entry.studentExplanation) {
    const explanation = document.createElement('p')
    explanation.className = 'classroom-current-schedule-log-explanation'
    explanation.textContent = entry.studentExplanation
    row.append(explanation)
  }

  const meta = document.createElement('small')
  meta.className = 'classroom-current-schedule-log-meta'
  meta.textContent = [
    entry.actorName,
    entry.actorRole
      ? titleCase(entry.actorRole.replaceAll('_', ' '))
      : null,
    entry.reasonLabel
  ].filter(Boolean).join(' · ')
  if (meta.textContent) row.append(meta)
  return row
}

function createScheduleHistoryStamp(label, recordedAt, timeZone) {
  const stamp = document.createElement('span')
  stamp.className = 'classroom-schedule-history-stamp'
  const badge = document.createElement('span')
  badge.className = 'classroom-current-schedule-log-badge'
  badge.textContent = label
  const time = document.createElement('time')
  time.dateTime = recordedAt || ''
  time.textContent = formatScheduleHistoryTimestamp(recordedAt, timeZone)
  stamp.append(badge, time)
  return stamp
}

function currentScheduleLogActionLabel(entry) {
  if (entry.entryKind === 'progress') {
    const progress = titleCase(entry.progressKind || 'progress')
    return entry.action === 'reversed'
      ? `Unmarked ${progress}`
      : `Marked ${progress}`
  }
  if (entry.entryKind === 'pacing') {
    return `${titleCase(entry.pacingMode || 'Schedule')} pacing`
  }
  return titleCase(entry.action.replaceAll('_', ' '))
}

function currentScheduleLogSessionHref(entry) {
  const parameters = new URLSearchParams({
    course: currentScheduleLog?.courseId
      || currentClassroom?.course?.id
      || '',
    source: entry.sourceSessionKey,
    title: entry.title,
    returnTo:
      `${window.location.pathname}${window.location.search}${window.location.hash}`
  })
  return `./classroom-session.html?${parameters.toString()}`
}

async function loadClassroomSchedule({
  force = false,
  quiet = false,
  throwOnError = false
} = {}) {
  if (!currentClassroom || (currentSchedule && !force)) {
    if (currentSchedule) renderClassroomSchedule(currentSchedule)
    return
  }
  const requestToken = ++scheduleRequestToken
  elements.classroomSpaceScheduleView.setAttribute('aria-busy', 'true')
  elements.classroomSpaceHome.setAttribute('aria-busy', 'true')
  elements.classroomTrackProgressStatus.textContent = 'Loading Course progress\u2026'
  if (!quiet) elements.classroomScheduleViewLoading.classList.remove('is-hidden')
  elements.classroomScheduleViewError.classList.add('is-hidden')
  try {
    const payload = await getClassroomScheduleData(currentClassroom.course.id)
    if (requestToken !== scheduleRequestToken) return
    if (
      currentScheduleLog
      && currentScheduleLog.activeScheduleVersionId
        !== payload.activeScheduleVersionId
    ) {
      currentScheduleLog = null
    }
    currentSchedule = payload
    renderClassroomSchedule(payload, { animate: quiet })
  } catch (error) {
    if (requestToken !== scheduleRequestToken) return
    elements.classroomScheduleViewErrorMessage.textContent =
      error?.message || 'The Course Schedule could not be loaded.'
    elements.classroomScheduleViewError.classList.remove('is-hidden')
    elements.classroomTrackProgressStatus.textContent =
      error?.message || 'Course progress could not be loaded.'
    if (!quiet) {
      elements.classroomScheduleSessionList.replaceChildren()
      elements.classroomScheduleViewEmpty.classList.add('is-hidden')
    }
    if (throwOnError) throw error
  } finally {
    if (requestToken === scheduleRequestToken) {
      elements.classroomSpaceScheduleView.setAttribute('aria-busy', 'false')
      elements.classroomSpaceHome.setAttribute('aria-busy', 'false')
      elements.classroomScheduleViewLoading.classList.add('is-hidden')
    }
  }
}

function renderClassroomSchedule(payload, { animate = false } = {}) {
  const sessions = [...payload.sessions].sort((first, second) =>
    first.position - second.position || first.scheduleItemId.localeCompare(second.scheduleItemId)
  )
  const groups = groupClassroomScheduleSessions(sessions, trackModuleTitleByKey)
  const orderBySessionId = new Map(
    sessions.map((session, index) => [session.scheduleItemId, index])
  )
  const showAuditMetadata = payload.permissions.actorRole !== 'student'
  elements.classroomScheduleViewError.classList.add('is-hidden')
  elements.classroomScheduleViewCount.textContent =
    `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`
  elements.classroomScheduleViewTimeZone.textContent =
    payload.timeZone || currentClassroom?.schedule?.timeZone || 'UTC'
  renderClassroomScheduleCoverage(payload.coverage)
  const studiedHoldActive =
    payload.permissions.actorRole === 'student'
    && payload.studentStudiedHold?.active === true
  elements.classroomScheduleStudiedHold.textContent = studiedHoldActive
    ? payload.studentStudiedHold.message
    : ''
  elements.classroomScheduleStudiedHold.classList.toggle(
    'is-hidden',
    !studiedHoldActive
  )
  elements.classroomScheduleViewEmpty.classList.toggle('is-hidden', sessions.length > 0)
  renderClassroomHome(payload.classroomHome, payload)
  const sections = groups.map((group) => createScheduleModuleSection(group, {
      moduleStyles: payload.moduleStyles,
      canCustomize: payload.permissions.canCustomizeModuleStyle,
      orderBySessionId,
      showAuditMetadata
    }))
  const replaceSections = () => elements.classroomScheduleSessionList.replaceChildren(...sections)
  if (
    animate
    && typeof document.startViewTransition === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    document.startViewTransition(replaceSections)
  } else {
    replaceSections()
  }
  renderPdfStyleControls(payload)
  applyScheduleWebStyle(elements.classroomScheduleSessionList, payload.pdfStyle)
  renderClassroomSchedulePrintSnapshot(createClassroomScheduleSnapshot(payload))
  elements.classroomSchedulePrint.disabled = sessions.length === 0
  restoreClassroomReloadViewport()
}

function renderClassroomScheduleCoverage(coverage = {}) {
  const branches = Array.isArray(coverage?.branches) ? coverage.branches : []
  const primary = branches.find((branch) => branch.role === 'primary') || branches[0]
  const supporting = branches.filter((branch) => branch !== primary)
  const primaryLabel = classroomScheduleBranchLabel(primary)
    || currentClassroom?.focus?.name
    || ''
  const supportingLabels = supporting
    .map(classroomScheduleBranchLabel)
    .filter(Boolean)
  const parts = [
    primaryLabel ? `Primary Track: ${primaryLabel}` : '',
    supportingLabels.length
      ? `Supporting ${supportingLabels.length === 1 ? 'Track' : 'Tracks'}: ${supportingLabels.join(', ')}`
      : ''
  ].filter(Boolean)
  elements.classroomScheduleViewCoverage.textContent = parts.join(' · ')
  elements.classroomScheduleViewCoverage.classList.toggle('is-hidden', parts.length === 0)
}

function classroomScheduleBranchLabel(branch = {}) {
  const subject = String(branch?.subject?.name || '').trim()
  const track = String(branch?.track?.name || '').trim()
  if (subject && track && subject.toLowerCase() !== track.toLowerCase()) {
    return `${subject}, ${track}`
  }
  return track || subject
}

function renderClassroomHomeProgress(progress = {}) {
  const eligible = Number(progress.eligibleSessionCount) || 0
  const studied = Number(progress.studiedCount) || 0
  const practiced = Number(progress.practicedCount) || 0
  const percent = Math.min(100, Math.max(0, Number(progress.percent) || 0))
  elements.classroomTrackProgressPercent.textContent = `\u2014 ${percent}%`
  elements.classroomTrackProgressCounts.textContent =
    `Studied ${studied}/${eligible} \u00b7 Practiced ${practiced}/${eligible}`
  elements.classroomTrackProgressBar.setAttribute('aria-valuenow', String(percent))
  elements.classroomTrackProgressBar.setAttribute(
    'aria-valuetext',
    `${percent}%. Studied ${studied} of ${eligible}; Practiced ${practiced} of ${eligible}.`
  )
  elements.classroomTrackProgressFill.style.setProperty('--track-progress', `${percent}%`)
  elements.classroomTrackProgressStatus.textContent = eligible
    ? 'Studied and Practiced contribute equally. Reviewed work is recorded separately.'
    : 'No active curriculum topics are available yet.'
  elements.classroomHomeScheduleLink.href = classroomAreaHref(window.location.href, 'schedule')
}

function renderClassroomHome(home = {}, payload = {}) {
  const coverage = home?.coverage || payload?.coverage || {}
  const progress = home?.courseProgress || payload?.courseProgress || payload?.trackProgress
  const coverageLabel = coverage.displayLabel || 'Current coverage'
  elements.classroomHomeCoverage.textContent = coverageLabel
  elements.classroomSpaceSubject.textContent = coverageLabel
  renderClassroomHomeProgress(progress)
  renderClassroomCourseProgressTracks(progress?.byTrack)
  renderClassroomHomeWindow({
    windowData: home?.thisWeek,
    rangeElement: elements.classroomHomeThisWeekRange,
    listElement: elements.classroomHomeThisWeekList,
    emptyElement: elements.classroomHomeThisWeekEmpty,
    moduleStyles: payload?.moduleStyles
  })
  renderClassroomHomeWindow({
    windowData: home?.comingNext,
    rangeElement: elements.classroomHomeComingNextRange,
    listElement: elements.classroomHomeComingNextList,
    emptyElement: elements.classroomHomeComingNextEmpty,
    moduleStyles: payload?.moduleStyles
  })
}

function renderClassroomCourseProgressTracks(tracks = []) {
  const visibleTracks = Array.isArray(tracks)
    ? tracks.filter((track) => track.displayLabel || track?.track?.name)
    : []
  elements.classroomTrackProgressBreakdown.hidden = visibleTracks.length === 0
  if (visibleTracks.length === 0) elements.classroomTrackProgressBreakdown.open = false
  elements.classroomCourseProgressTracks.classList.toggle('is-hidden', visibleTracks.length === 0)
  elements.classroomCourseProgressTracks.replaceChildren(
    ...visibleTracks.map((track) => {
      const item = document.createElement('li')
      const label = classroomProgressTrackLabel(track)
      const eligible = Number(track.eligibleSessionCount) || 0
      const studied = Number(track.studiedCount) || 0
      const practiced = Number(track.practicedCount) || 0
      const heading = document.createElement('strong')
      heading.textContent = `${label}: ${Number(track.percent) || 0}%`
      const studiedLine = document.createElement('span')
      studiedLine.textContent = `Items studied: ${studied} out of ${eligible}`
      const practicedLine = document.createElement('span')
      practicedLine.textContent = `Items practiced: ${practiced} out of ${eligible}`
      item.append(heading, studiedLine, practicedLine)
      return item
    })
  )
}

function classroomProgressTrackLabel(track = {}) {
  const subjectName = String(track?.subject?.name || '').trim()
  const trackName = String(track?.track?.name || '').trim()
  const subjectLabel = subjectName.toLowerCase() === 'math'
    ? 'Mathematics'
    : subjectName
  if (
    subjectLabel
    && trackName
    && subjectLabel.toLowerCase() !== trackName.toLowerCase()
  ) {
    return `${subjectLabel}, ${trackName}`
  }
  return trackName || subjectLabel || track.displayLabel || 'Track'
}

function renderClassroomHomeWindow({
  windowData = {},
  rangeElement,
  listElement,
  emptyElement,
  moduleStyles = {}
}) {
  const items = Array.isArray(windowData?.items)
    ? windowData.items.filter(classroomHomeWorkIsPending)
    : []
  rangeElement.textContent = formatDateRange(windowData?.startsOn, windowData?.endsOn)
  rangeElement.dateTime = windowData?.startsOn || ''
  emptyElement.classList.toggle('is-hidden', items.length > 0)
  listElement.replaceChildren(
    ...items.map((work) => createClassroomHomeWorkItem(work, moduleStyles))
  )
}

function classroomHomeWorkIsPending(work = {}) {
  const status = String(work.status || '').trim().toLowerCase()
  if (work?.progress?.studied?.state === 'marked') return false
  return !new Set([
    'studied',
    'completed',
    'done',
    'submitted',
    'dropped',
    'cancelled',
    'canceled'
  ]).has(status)
}

function createClassroomHomeWorkItem(work, moduleStyles = {}) {
  const item = document.createElement('li')
  item.className = 'classroom-home-work-item'
  item.dataset.kind = work.kind || 'course_work'
  const moduleStyle = moduleStyles?.[work.modulePresentationKey]
  if (moduleStyle) {
    item.dataset.moduleStyled = 'true'
    applyModuleStyle(
      item,
      classroomScheduleModuleStyle(moduleStyles, work.modulePresentationKey)
    )
  }

  const date = document.createElement('time')
  date.className = 'classroom-home-work-date'
  date.dateTime = work.date
  const dateLabel = document.createElement('span')
  dateLabel.textContent = work.dateLabel || 'Scheduled'
  date.append(dateLabel, document.createTextNode(formatDate(work.date)))

  const content = document.createElement('div')
  content.className = 'classroom-home-work-content'
  const link = document.createElement('a')
  link.href = classroomHomeWorkHref(work)
  link.textContent = work.title
  const contextParts = [work.academicPath, work.moduleTitle, work.detail].filter(Boolean)
  content.append(link)
  if (contextParts.length) {
    const context = document.createElement('p')
    context.textContent = contextParts.join(' \u00b7 ')
    content.append(context)
  }
  const status = document.createElement('span')
  status.className = 'classroom-home-work-status'
  status.textContent = classroomHomeWorkStatus(work)
  content.append(status)

  item.append(date, content)
  return item
}

function classroomHomeWorkHref(work) {
  if (work?.action?.type === 'open_track_session' && work.action.href) {
    return work.action.href
  }
  if (work?.action?.type === 'open_practice' && work.action.assignmentId) {
    return `../course-builder/course-practice.html?assignment=${encodeURIComponent(work.action.assignmentId)}`
  }
  return classroomAreaHref(window.location.href, 'schedule')
}

function classroomHomeWorkStatus(work) {
  if (work.kind === 'assignment_due') return 'Assignment'
  if (work?.progress?.studied?.state === 'marked') return 'Studied'
  return scheduleSequenceLabel(work.status)
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return ''
  return `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`
}

async function printClassroomScheduleAudit() {
  if (
    !currentScheduleAudit?.permissions?.canPrintScheduleAudit
    || !currentScheduleAudit.versions.length
  ) {
    return
  }
  renderClassroomAuditPrintDocument(currentScheduleAudit)
  elements.classroomAuditPrintDocument.setAttribute('aria-hidden', 'false')
  document.body.classList.add('is-printing-classroom-audit')
  await waitForAuditPrintLayout()
  window.print()
}

function clearClassroomAuditPrintMode() {
  document.body.classList.remove('is-printing-classroom-audit')
  elements.classroomAuditPrintDocument.setAttribute('aria-hidden', 'true')
}

function waitForAuditPrintLayout() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve)
    })
  })
}

function renderClassroomAuditPrintDocument(audit) {
  elements.classroomAuditPrintTitle.textContent =
    `${audit.course.title} Schedule audit`
  elements.classroomAuditPrintStudent.textContent = audit.course.studentName
  elements.classroomAuditPrintTutor.textContent = audit.course.tutorName
  elements.classroomAuditPrintGenerated.textContent =
    formatScheduleHistoryTimestamp(new Date().toISOString())
  elements.classroomAuditPrintList.replaceChildren(
    ...audit.versions.map(createClassroomAuditPrintVersion)
  )
}

function createClassroomAuditPrintVersion(version) {
  const section = document.createElement('section')
  section.className = 'classroom-audit-print-version'
  const heading = document.createElement('div')
  const title = document.createElement('h2')
  title.textContent = `Version ${version.versionNumber}: ${version.name}`
  const status = document.createElement('span')
  status.textContent = titleCase(version.status)
  heading.append(title, status)
  const context = document.createElement('p')
  context.textContent = [
    version.coverageLabel,
    `${version.itemCount} items`,
    `${version.changeCount} changes`
  ].filter(Boolean).join(' · ')
  section.append(heading, context)

  const changeHeading = document.createElement('h3')
  changeHeading.textContent = 'Reasoned changes'
  section.append(changeHeading)
  if (version.changes.length) {
    const groupedChanges = groupClassroomAuditChanges(version.changes)
    const titleByKey = new Map(
      version.items.map((item) => [item.stableItemKey, item.title])
    )
    const publication = document.createElement('article')
    publication.className = 'classroom-audit-print-publication'
    const publicationHeading = document.createElement('div')
    const publicationTitle = document.createElement('strong')
    publicationTitle.textContent = 'Schedule update'
    const publicationStamp = document.createElement('span')
    publicationStamp.textContent = [
      'Update',
      groupedChanges.recordedAt
        ? formatScheduleHistoryTimestamp(
            groupedChanges.recordedAt,
            version.timeZone
          )
        : null
    ].filter(Boolean).join(' · ')
    publicationHeading.append(publicationTitle, publicationStamp)
    publication.append(publicationHeading)

    if (groupedChanges.studentExplanation) {
      const explanation = document.createElement('p')
      explanation.textContent = groupedChanges.reasonLabel
        ? `${groupedChanges.reasonLabel}: ${groupedChanges.studentExplanation}`
        : groupedChanges.studentExplanation
      publication.append(explanation)
    }
    if (groupedChanges.actorName) {
      const actor = document.createElement('small')
      actor.textContent = groupedChanges.actorName
      publication.append(actor)
    }

    for (const actionGroup of groupedChanges.actionGroups) {
      const actionSection = document.createElement('section')
      actionSection.className = 'classroom-audit-print-action-group'
      const actionHeading = document.createElement('h4')
      actionHeading.textContent =
        `${titleCase(actionGroup.action)} (${actionGroup.entries.length})`
      const changeList = document.createElement('ol')
      changeList.className = 'classroom-audit-print-changes'
      for (const change of actionGroup.entries) {
        const row = document.createElement('li')
        const label = document.createElement('strong')
        label.textContent =
          titleByKey.get(change.stableItemKey) || change.stableItemKey
        row.append(label)
        if (!groupedChanges.studentExplanation && change.studentExplanation) {
          const explanation = document.createElement('p')
          explanation.textContent =
            `${change.reasonLabel}: ${change.studentExplanation}`
          row.append(explanation)
        }
        if (change.privateStaffNote) {
          const note = document.createElement('p')
          note.textContent = `Private note: ${change.privateStaffNote}`
          row.append(note)
        }
        changeList.append(row)
      }
      actionSection.append(actionHeading, changeList)
      publication.append(actionSection)
    }
    section.append(publication)
  } else {
    const empty = document.createElement('p')
    empty.textContent = 'No structural changes recorded.'
    section.append(empty)
  }

  const snapshotHeading = document.createElement('h3')
  snapshotHeading.textContent = 'Version snapshot'
  const snapshot = document.createElement('ol')
  snapshot.className = 'classroom-audit-print-snapshot'
  for (const item of version.items) {
    const row = document.createElement('li')
    const title = document.createElement('strong')
    title.textContent = item.title
    const detail = document.createElement('span')
    detail.textContent = [
      titleCase(item.state),
      item.sourceModuleTitle,
      item.scheduledDate
    ].filter(Boolean).join(' · ')
    row.append(title, detail)
    snapshot.append(row)
  }
  section.append(snapshotHeading, snapshot)
  return section
}

function createClassroomAuditPrintVersionLegacy(version) {
  const section = document.createElement('section')
  section.className = 'classroom-audit-print-version'
  const heading = document.createElement('div')
  const title = document.createElement('h2')
  title.textContent = `Version ${version.versionNumber}: ${version.name}`
  const status = document.createElement('span')
  status.textContent = titleCase(version.status)
  heading.append(title, status)
  const context = document.createElement('p')
  context.textContent = [
    version.coverageLabel,
    `${version.itemCount} items`,
    `${version.changeCount} changes`
  ].filter(Boolean).join(' · ')
  section.append(heading, context)

  const changeHeading = document.createElement('h3')
  changeHeading.textContent = 'Reasoned changes'
  section.append(changeHeading)
  if (version.changes.length) {
    const changeList = document.createElement('ol')
    changeList.className = 'classroom-audit-print-changes'
    for (const change of version.changes) {
      const row = document.createElement('li')
      const label = document.createElement('strong')
      label.textContent =
        `${titleCase(change.changeType)} · ${change.reasonLabel}`
      const explanation = document.createElement('p')
      explanation.textContent = change.studentExplanation
      const meta = document.createElement('small')
      meta.textContent = [
        change.stableItemKey,
        change.actorName,
        change.createdAt
          ? formatProgressDate(change.createdAt, version.timeZone)
          : null
      ].filter(Boolean).join(' · ')
      row.append(label, explanation)
      if (change.privateStaffNote) {
        const note = document.createElement('p')
        note.textContent = `Private note: ${change.privateStaffNote}`
        row.append(note)
      }
      row.append(meta)
      changeList.append(row)
    }
    section.append(changeList)
  } else {
    const empty = document.createElement('p')
    empty.textContent = 'No structural changes recorded.'
    section.append(empty)
  }

  const snapshotHeading = document.createElement('h3')
  snapshotHeading.textContent = 'Version snapshot'
  const snapshot = document.createElement('ol')
  snapshot.className = 'classroom-audit-print-snapshot'
  for (const item of version.items) {
    const row = document.createElement('li')
    const title = document.createElement('strong')
    title.textContent = item.title
    const detail = document.createElement('span')
    detail.textContent = [
      titleCase(item.state),
      item.sourceModuleTitle,
      item.scheduledDate
    ].filter(Boolean).join(' · ')
    row.append(title, detail)
    snapshot.append(row)
  }
  section.append(snapshotHeading, snapshot)
  return section
}

async function printClassroomSchedule() {
  if (!currentClassroom) return
  elements.classroomSchedulePrint.disabled = true
  elements.classroomSchedulePrint.textContent = 'Refreshing...'
  try {
    await loadClassroomSchedule({ force: true, quiet: true, throwOnError: true })
    if (!currentSchedule?.sessions?.length) {
      throw new TypeError('This Course does not have a visible Schedule to export.')
    }
    const snapshot = createClassroomScheduleSnapshot(currentSchedule)
    renderClassroomSchedulePrintSnapshot(snapshot)
    document.body.classList.add('is-printing-classroom-schedule')
    window.print()
  } catch (error) {
    clearClassroomSchedulePrintMode()
    showScheduleFeedback(error?.message || 'The Schedule PDF could not be prepared.', { error: true })
  } finally {
    elements.classroomSchedulePrint.textContent = 'Generate PDF'
    elements.classroomSchedulePrint.disabled = !currentSchedule?.sessions?.length
  }
}

function clearClassroomSchedulePrintMode() {
  document.body.classList.remove('is-printing-classroom-schedule')
}

function renderClassroomSchedulePrintSnapshot(snapshot) {
  const sessions = [...snapshot.sessions].sort((first, second) =>
    first.position - second.position || first.scheduleItemId.localeCompare(second.scheduleItemId)
  )
  const groups = groupClassroomScheduleSessions(sessions, trackModuleTitleByKey)
  const orderBySessionId = new Map(
    sessions.map((session, index) => [session.scheduleItemId, index])
  )
  elements.classroomSchedulePrintTitle.textContent =
    snapshot.name || currentClassroom?.course?.title || 'Course Schedule'
  elements.classroomSchedulePrintStudent.textContent = currentClassroom?.student?.name || 'Student'
  elements.classroomSchedulePrintTutor.textContent = currentClassroom?.tutor?.name || 'Tutor'
  const coverageMetadata = classroomScheduleCoverageMetadata(snapshot.coverage, {
    educationLevel: snapshot.educationLevel?.name,
    subject: currentClassroom?.subject?.name,
    track: currentClassroom?.focus?.name
  })
  elements.classroomSchedulePrintEducationLevel.textContent =
    coverageMetadata.educationLevel || 'Education level not set'
  elements.classroomSchedulePrintSubject.textContent =
    coverageMetadata.subject || 'Subject not set'
  elements.classroomSchedulePrintTrack.textContent = coverageMetadata.coverage
  const generatedLabel = `Generated ${formatDateTime(snapshot.generatedAt)}`
  const copyrightLabel =
    `Copyright ${new Date(snapshot.generatedAt).getUTCFullYear()} Kelp Tutoring. All rights reserved.`
  elements.classroomSchedulePrintGenerated.textContent = generatedLabel
  elements.classroomSchedulePrintCopyright.textContent = copyrightLabel
  renderClassroomSchedulePrintPageMargins({
    generatedLabel,
    copyrightLabel,
    textColor: snapshot.pdfStyle.textColor
  })
  applyPdfStyle(elements.classroomSchedulePrintDocument, snapshot.pdfStyle)
  elements.classroomSchedulePrintList.replaceChildren(
    ...groups.map((group) => createClassroomSchedulePrintModule(
      group,
      snapshot.moduleStyles,
      orderBySessionId,
      snapshot.timeZone
    ))
  )
}

function renderClassroomSchedulePrintPageMargins({
  generatedLabel,
  copyrightLabel,
  textColor
}) {
  elements.classroomSchedulePrintPageStyle.textContent = `
    @media print {
      @page {
        @top-left {
          content: "";
        }
        @top-center {
          content: "";
        }
        @top-right {
          content: "";
        }
        @bottom-left {
          content: ${cssContentString(generatedLabel)};
          color: ${textColor};
          font-family: Arial, Helvetica, sans-serif;
          font-size: 6pt;
          vertical-align: middle;
        }
        @bottom-center {
          content: ${cssContentString(copyrightLabel)};
          color: ${textColor};
          font-family: Arial, Helvetica, sans-serif;
          font-size: 6pt;
          font-weight: 700;
          vertical-align: middle;
        }
        @bottom-right {
          content: "Page " counter(page) " of " counter(pages);
          color: ${textColor};
          font-family: Arial, Helvetica, sans-serif;
          font-size: 6pt;
          vertical-align: middle;
        }
      }
    }
  `
}

function cssContentString(value) {
  return `"${String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')}"`
}

function renderPdfStyleControls(payload) {
  const style = classroomSchedulePdfStyle(payload?.pdfStyle)
  const ruleInput = elements.classroomSchedulePdfStyle.querySelector(
    '[data-pdf-color-input="rule"]'
  )
  const textInput = elements.classroomSchedulePdfStyle.querySelector(
    '[data-pdf-color-input="text"]'
  )
  if (ruleInput) ruleInput.value = style.ruleColor
  if (textInput) textInput.value = style.textColor
  elements.classroomSchedulePdfStyle.classList.toggle(
    'is-hidden',
    payload?.permissions?.canCustomizePdfStyle !== true
  )
}

function createScheduleModuleSection(group, {
  moduleStyles,
  canCustomize,
  orderBySessionId,
  showAuditMetadata
}) {
  const styleKey = group.modulePresentationKey || group.moduleKey
  const section = document.createElement('section')
  section.className = 'classroom-schedule-module'
  section.dataset.moduleKey = styleKey
  section.dataset.sourceModuleKey = group.moduleKey
  applyModuleStyle(section, classroomScheduleModuleStyle(moduleStyles, styleKey))

  const header = document.createElement('header')
  header.className = 'classroom-schedule-module-header'
  const title = document.createElement('h3')
  title.textContent = group.moduleTitle
  header.append(title)
  if (canCustomize && !group.isContinuation) {
    header.append(createScheduleModuleStyleEditor(group, moduleStyles))
  }

  const list = document.createElement('ol')
  list.className = 'classroom-schedule-session-list'
  list.setAttribute('aria-label', `${group.moduleTitle} sessions`)
  list.append(...group.sessions.map((session) =>
    createScheduleSessionItem(
      session,
      orderBySessionId.get(session.scheduleItemId) || 0,
      { showAuditMetadata }
    )
  ))
  section.append(header, list)
  return section
}

function createScheduleModuleStyleEditor(group, moduleStyles) {
  const styleKey = group.modulePresentationKey || group.moduleKey
  const style = classroomScheduleModuleStyle(moduleStyles, styleKey)
  const editor = document.createElement('details')
  editor.className = 'classroom-schedule-module-style'
  const summary = document.createElement('summary')
  summary.textContent = 'Colors'
  const panel = document.createElement('div')
  panel.className = 'classroom-schedule-module-style-panel'
  panel.dataset.moduleKey = styleKey

  const presets = document.createElement('div')
  presets.className = 'classroom-schedule-module-palettes'
  presets.setAttribute('aria-label', `${group.moduleTitle} color templates`)
  MODULE_COLOR_TEMPLATES.forEach((template) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'classroom-schedule-module-palette'
    button.dataset.moduleStyle = 'preset'
    button.dataset.moduleKey = styleKey
    button.dataset.headerColor = template.headerColor
    button.dataset.stripeColor = template.stripeColor
    button.dataset.templateName = template.name
    button.style.setProperty('--palette-color', template.headerColor)
    button.title = template.name
    button.setAttribute('aria-label', `Use ${template.name} for ${group.moduleTitle}`)
    if (style.templateName === template.name) button.setAttribute('aria-pressed', 'true')
    presets.append(button)
  })

  const custom = document.createElement('div')
  custom.className = 'classroom-schedule-module-custom-colors'
  custom.append(
    createModuleColorInput('Header', 'header', style.headerColor),
    createModuleColorInput('Rows', 'stripe', style.stripeColor)
  )
  panel.append(presets, custom)
  editor.append(summary, panel)
  return editor
}

function createModuleColorInput(labelText, kind, value) {
  const label = document.createElement('label')
  const text = document.createElement('span')
  text.textContent = labelText
  const input = document.createElement('input')
  input.type = 'color'
  input.value = value
  input.dataset.moduleColorInput = kind
  input.setAttribute('aria-label', `${labelText} color`)
  label.append(text, input)
  return label
}

function createClassroomSchedulePrintModule(
  group,
  moduleStyles,
  orderBySessionId,
  timeZone
) {
  const styleKey = group.modulePresentationKey || group.moduleKey
  const table = document.createElement('table')
  table.className = 'classroom-schedule-print-module'
  applyModuleStyle(table, classroomScheduleModuleStyle(moduleStyles, styleKey))
  const columns = document.createElement('colgroup')
  ;['metadata', 'content', 'progress'].forEach((columnName) => {
    const column = document.createElement('col')
    column.className = `is-${columnName}`
    columns.append(column)
  })
  const head = document.createElement('thead')
  const headingRow = document.createElement('tr')
  const title = document.createElement('th')
  title.className = 'classroom-schedule-print-module-title'
  title.colSpan = 3
  title.scope = 'colgroup'
  title.textContent = group.moduleTitle
  headingRow.append(title)
  head.append(headingRow)
  const body = document.createElement('tbody')
  body.className = 'classroom-schedule-print-module-rows'
  body.append(...group.sessions.map((session) =>
    createClassroomSchedulePrintRow(
      session,
      orderBySessionId.get(session.scheduleItemId) || 0,
      timeZone
    )
  ))
  table.append(columns, head, body)
  return table
}

function createClassroomSchedulePrintRow(session, index, timeZone) {
  const item = document.createElement('tr')
  item.className = 'classroom-schedule-print-row'
  item.dataset.sequenceState = session.sequenceState

  const metadataCell = document.createElement('td')
  metadataCell.className = 'classroom-schedule-print-metadata-cell'
  const metadata = document.createElement('div')
  metadata.className = 'classroom-schedule-print-metadata'
  const order = document.createElement('span')
  order.className = 'classroom-schedule-print-order'
  order.textContent = String(index + 1)

  const date = document.createElement('div')
  date.className = 'classroom-schedule-print-date'
  const effective = document.createElement('strong')
  effective.textContent = session.scheduledDate ? formatDate(session.scheduledDate) : 'Date pending'
  date.append(effective)
  metadata.append(order, date)

  const contentCell = document.createElement('td')
  contentCell.className = 'classroom-schedule-print-content-cell'
  const content = document.createElement('div')
  content.className = 'classroom-schedule-print-content'
  const title = document.createElement('h2')
  title.textContent = session.title
  const academicPath = classroomScheduleAcademicPath(session)
  const academicContext = document.createElement('p')
  academicContext.className = 'classroom-schedule-print-academic-path'
  academicContext.textContent = academicPath
  academicContext.hidden = !academicPath
  const badges = document.createElement('div')
  badges.className = 'classroom-schedule-print-badges'
  badges.append(
    createClassroomSchedulePrintBadge(
      scheduleSequenceLabel(session.sequenceState),
      `is-${session.sequenceState}`
    ),
    createClassroomSchedulePrintBadge(scheduleKindLabel(session.kind)),
    createClassroomSchedulePrintBadge(
      session.difficultyLevel ? titleCase(session.difficultyLevel) : 'Difficulty not set',
      'is-difficulty'
    )
  )
  content.append(title, academicContext, badges)

  if (session.resources.length) {
    const resources = document.createElement('p')
    resources.className = 'classroom-schedule-print-resources'
    resources.textContent = `Assigned resources: ${session.resources
      .map((resource) => `${resource.title} (${titleCase(resource.requirementState)})`)
      .join('; ')}`
    content.append(resources)
  }

  const progressCell = document.createElement('td')
  progressCell.className = 'classroom-schedule-print-progress-cell'
  const progress = document.createElement('div')
  progress.className = 'classroom-schedule-print-checklist'
  progress.setAttribute('aria-label', `Progress for ${session.title}`)
  progress.append(...['studied', 'reviewed', 'practiced'].map((kind) =>
    createClassroomSchedulePrintCheck(
      titleCase(kind),
      session.progress[kind],
      timeZone
    )
  ))

  metadataCell.append(metadata)
  contentCell.append(content)
  progressCell.append(progress)
  item.append(metadataCell, contentCell, progressCell)
  return item
}

function createClassroomSchedulePrintBadge(label, modifier = '') {
  const badge = document.createElement('span')
  badge.className = `classroom-schedule-print-badge ${modifier}`.trim()
  badge.textContent = label
  return badge
}

function createClassroomSchedulePrintCheck(label, mark, timeZone) {
  const checked = mark?.state === 'marked'
  const item = document.createElement('span')
  item.className = 'classroom-schedule-print-check'
  const box = document.createElement('span')
  box.className = 'classroom-schedule-print-checkbox'
  box.dataset.checked = String(checked)
  box.setAttribute('aria-hidden', 'true')
  box.textContent = checked ? '\u2713' : ''
  const text = document.createElement('span')
  text.className = 'classroom-schedule-print-check-label'
  text.textContent = label
  const date = document.createElement('time')
  date.className = 'classroom-schedule-print-check-date'
  date.dateTime = mark?.effectiveAt || ''
  date.textContent = checked && mark?.effectiveAt
    ? formatProgressDate(mark.effectiveAt, timeZone)
    : ''
  item.append(box, text, date)
  return item
}

function createScheduleSessionItem(session, index, { showAuditMetadata = false } = {}) {
  const item = document.createElement('li')
  item.className = 'classroom-schedule-session'
  item.dataset.state = session.state
  item.dataset.sequenceState = session.sequenceState
  item.dataset.kind = session.kind

  const metadata = document.createElement('div')
  metadata.className = 'classroom-schedule-session-metadata'
  const order = document.createElement('span')
  order.className = 'classroom-schedule-session-order'
  order.textContent = String(index + 1)
  order.setAttribute('aria-label', `Session ${index + 1}`)

  const date = document.createElement('time')
  date.className = 'classroom-schedule-session-date'
  date.dateTime = session.scheduledDate
  date.textContent = session.scheduledDate ? formatDate(session.scheduledDate) : 'Date pending'
  if (
    showAuditMetadata
    && session.plannedDate
    && session.plannedDate !== session.scheduledDate
  ) {
    const planned = document.createElement('small')
    planned.className = 'classroom-schedule-session-planned-date'
    planned.textContent = `Originally ${formatDate(session.plannedDate)}`
    date.append(planned)
  }
  metadata.append(order, date)

  const content = document.createElement('div')
  content.className = 'classroom-schedule-session-content'
  const title = session.planningHref
    ? createScheduleLink(session.title, session.planningHref)
    : document.createElement('h3')
  if (!session.planningHref) title.textContent = session.title
  const badges = document.createElement('div')
  badges.className = 'classroom-schedule-session-badges'
  badges.append(
    createScheduleBadge(scheduleSequenceLabel(session.sequenceState), `is-${session.sequenceState}`),
    createScheduleBadge(scheduleKindLabel(session.kind)),
    createScheduleBadge(session.difficultyLevel
      ? titleCase(session.difficultyLevel)
      : 'Difficulty not set', 'is-difficulty')
  )
  content.append(title, badges)

  let detail = null
  if (session.kind === 'curriculum_topic' && session.resources.length) {
    const expanded = expandedScheduleDetails.has(session.scheduleItemId)
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'classroom-schedule-details-toggle'
    toggle.dataset.scheduleDetails = session.scheduleItemId
    toggle.setAttribute('aria-expanded', String(expanded))
    toggle.textContent = expanded ? 'Hide resources' : 'View resources'
    content.append(toggle)

    detail = createScheduleSessionDetails(session)
    detail.id = `schedule-progress-${session.scheduleItemId}`
    detail.hidden = !expanded
  }

  item.append(metadata, content)
  if (session.kind === 'curriculum_topic') {
    item.append(createScheduleSessionActions(session))
  }
  if (detail) item.append(detail)
  return item
}

function createScheduleSessionActions(session) {
  const controls = document.createElement('div')
  controls.className = 'classroom-schedule-progress-controls'
  controls.setAttribute('aria-label', `${session.title} progress`)

  const actions = document.createElement('div')
  actions.className = 'classroom-schedule-progress-actions'
  ;['studied', 'reviewed', 'practiced'].forEach((kind) => {
    const action = createProgressControl({
      session,
      kind,
      mark: session.progress[kind],
      scope: 'session'
    })
    if (action) actions.append(action)
  })
  if (actions.childElementCount) controls.append(actions)
  const feedback = document.createElement('p')
  feedback.className = 'classroom-schedule-row-feedback'
  feedback.dataset.scheduleProgressFeedback = ''
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  feedback.hidden = true
  controls.append(feedback)
  return controls
}

function createScheduleSessionDetails(session) {
  const detail = document.createElement('div')
  detail.className = 'classroom-schedule-progress'

  const heading = document.createElement('h4')
  heading.textContent = 'Assigned resources'
  const resources = document.createElement('ul')
  resources.className = 'classroom-schedule-resource-list'
  session.resources.forEach((resource) => {
    resources.append(createScheduleResourceItem(session, resource))
  })
  detail.append(heading, resources)
  return detail
}

function createScheduleResourceItem(session, resource) {
  const item = document.createElement('li')
  const identity = document.createElement('div')
  identity.className = 'classroom-schedule-resource-identity'
  const title = resource.href
    ? createResourceLink(resource.title, resource.href)
    : document.createElement('span')
  if (!resource.href) title.textContent = resource.title
  const requirement = document.createElement('small')
  requirement.textContent = titleCase(resource.requirementState)
  identity.append(title, requirement)

  const actions = document.createElement('div')
  actions.className = 'classroom-schedule-resource-actions'
  ;['studied', 'reviewed', 'practiced'].forEach((kind) => {
    const action = createProgressControl({
      session,
      resource,
      kind,
      mark: resource.progress[kind],
      scope: 'resource'
    })
    if (action) actions.append(action)
  })
  item.append(identity, actions)
  return item
}

function createProgressControl(request) {
  const action = createProgressButton(request)
  if (!action) return null
  const control = document.createElement('span')
  control.className = 'classroom-schedule-progress-control'
  const date = document.createElement('time')
  date.className = 'classroom-schedule-progress-date'
  const effectiveAt = request.mark?.state === 'marked'
    ? request.mark?.effectiveAt
    : ''
  date.dateTime = effectiveAt || ''
  date.textContent = effectiveAt
    ? formatProgressDate(effectiveAt, currentSchedule?.timeZone)
    : '\u00a0'
  if (!effectiveAt) date.setAttribute('aria-hidden', 'true')
  control.append(date, action)
  return control
}

function createProgressButton({ session, resource = null, kind, mark, scope }) {
  const role = currentSchedule?.permissions?.actorRole
  const marked = mark?.state === 'marked'
  const isStudent = role === 'student'
  const isStaff = role === 'tutor' || role === 'mentor'
  const canMark = (scope === 'session'
    ? currentSchedule?.permissions?.canMarkSession
    : currentSchedule?.permissions?.canMarkResource)
    && (!isStaff || (scope === 'session' && kind === 'studied'))
  const canReverse = kind === 'studied'
    ? isStaff
    : isStudent && currentSchedule?.permissions?.canReverseOwnReviewedPracticed
  const hasReversibleTransition = !marked
    || mark?.source === 'direct_session'
    || mark?.source === 'explicit_resource'

  if ((!marked && !canMark) || (marked && (!canReverse || !hasReversibleTransition))) {
    if (!marked) return null
    const state = document.createElement('span')
    state.className = 'classroom-schedule-progress-state'
    state.dataset.progressKind = kind
    state.dataset.active = 'true'
    state.textContent = `${titleCase(kind)} ✓`
    return state
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'classroom-schedule-progress-button'
  button.dataset.progressAction = marked ? 'reverse' : 'mark'
  button.dataset.scheduleItemId = session.scheduleItemId
  button.dataset.resourceId = resource?.id || ''
  button.dataset.progressKind = kind
  button.setAttribute('aria-pressed', String(marked))
  button.dataset.expectedEventId = mark?.transitionEventId || mark?.latestEventId || ''
  button.dataset.sequenceState = session.sequenceState
  button.textContent = marked ? `Undo ${titleCase(kind)}` : `Mark ${titleCase(kind)}`
  const blockedByClassHold =
    !marked
    && kind === 'studied'
    && isStudent
    && currentSchedule?.studentStudiedHold?.active === true
  if (blockedByClassHold) {
    button.disabled = true
    button.dataset.classHoldBlocked = 'true'
    button.title = currentSchedule.studentStudiedHold.message
    button.setAttribute(
      'aria-description',
      currentSchedule.studentStudiedHold.message
    )
  }
  return button
}

function toggleScheduleSessionDetails(scheduleItemId, toggle) {
  const detail = document.getElementById(`schedule-progress-${scheduleItemId}`)
  if (!detail) return
  const expanded = toggle.getAttribute('aria-expanded') === 'true'
  toggle.setAttribute('aria-expanded', String(!expanded))
  toggle.textContent = expanded ? 'View resources' : 'Hide resources'
  detail.hidden = expanded
  if (expanded) expandedScheduleDetails.delete(scheduleItemId)
  else expandedScheduleDetails.add(scheduleItemId)
}

async function handleModuleStyleAction(control) {
  const section = control.closest('.classroom-schedule-module')
  const panel = section?.querySelector('.classroom-schedule-module-style-panel')
  const moduleKey = control.dataset.moduleKey || section?.dataset.moduleKey || ''
  if (!moduleKey || pendingModuleStyleActions.has(moduleKey) || !currentSchedule) return

  let headerColor = control.dataset.headerColor
  let stripeColor = control.dataset.stripeColor
  let templateName = control.dataset.templateName || 'Custom'
  if (control.matches('input[data-module-color-input]')) {
    headerColor = panel.querySelector('[data-module-color-input="header"]')?.value
    stripeColor = panel.querySelector('[data-module-color-input="stripe"]')?.value
  }

  pendingModuleStyleActions.add(moduleKey)
  applyModuleStyle(section, { headerColor, stripeColor })
  panel?.querySelectorAll('button, input').forEach((element) => { element.disabled = true })
  try {
    currentSchedule = await saveClassroomScheduleModuleStyle({
      courseId: currentSchedule.courseId,
      moduleKey,
      headerColor,
      stripeColor,
      templateName
    })
    updateModuleStylePresentation(moduleKey)
    showScheduleFeedback('Module colors were saved.')
  } catch (error) {
    if (error?.changeSaved !== true) updateModuleStylePresentation(moduleKey)
    showScheduleFeedback(error?.message || 'The module colors could not be saved.', { error: true })
  } finally {
    panel?.querySelectorAll('button, input').forEach((element) => { element.disabled = false })
    pendingModuleStyleActions.delete(moduleKey)
  }
}

async function handlePdfStyleAction(control) {
  const actionKey = 'schedule-pdf'
  if (pendingModuleStyleActions.has(actionKey) || !currentSchedule) return
  const ruleInput = elements.classroomSchedulePdfStyle.querySelector(
    '[data-pdf-color-input="rule"]'
  )
  const textInput = elements.classroomSchedulePdfStyle.querySelector(
    '[data-pdf-color-input="text"]'
  )
  const ruleColor = ruleInput?.value
  const textColor = textInput?.value

  pendingModuleStyleActions.add(actionKey)
  applyScheduleWebStyle(elements.classroomScheduleSessionList, { ruleColor, textColor })
  applyPdfStyle(elements.classroomSchedulePrintDocument, { ruleColor, textColor })
  elements.classroomSchedulePdfStyle.querySelectorAll('input')
    .forEach((input) => { input.disabled = true })
  try {
    currentSchedule = await saveClassroomSchedulePdfStyle({
      courseId: currentSchedule.courseId,
      ruleColor,
      textColor
    })
    renderPdfStyleControls(currentSchedule)
    applyScheduleWebStyle(elements.classroomScheduleSessionList, currentSchedule.pdfStyle)
    renderClassroomSchedulePrintSnapshot(createClassroomScheduleSnapshot(currentSchedule))
    showScheduleFeedback('Schedule colors were saved.')
  } catch (error) {
    if (error?.changeSaved !== true) {
      renderPdfStyleControls(currentSchedule)
      applyScheduleWebStyle(elements.classroomScheduleSessionList, currentSchedule.pdfStyle)
      renderClassroomSchedulePrintSnapshot(createClassroomScheduleSnapshot(currentSchedule))
    }
    showScheduleFeedback(error?.message || 'The Schedule colors could not be saved.', { error: true })
  } finally {
    elements.classroomSchedulePdfStyle.querySelectorAll('input')
      .forEach((input) => { input.disabled = false })
    pendingModuleStyleActions.delete(actionKey)
  }
}

function updateModuleStylePresentation(moduleKey) {
  const style = classroomScheduleModuleStyle(currentSchedule?.moduleStyles, moduleKey)
  const sections = [...elements.classroomScheduleSessionList.querySelectorAll(
    '.classroom-schedule-module'
  )].filter((candidate) => candidate.dataset.moduleKey === moduleKey)
  sections.forEach((section) => {
    applyModuleStyle(section, style)
    section.querySelectorAll('button[data-module-style]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.templateName === style.templateName))
    })
    const headerInput = section.querySelector('[data-module-color-input="header"]')
    const stripeInput = section.querySelector('[data-module-color-input="stripe"]')
    if (headerInput) headerInput.value = style.headerColor
    if (stripeInput) stripeInput.value = style.stripeColor
  })
  renderClassroomSchedulePrintSnapshot(createClassroomScheduleSnapshot(currentSchedule))
}

function closeScheduleStylePopoversOutside(event) {
  document.querySelectorAll(
    '.classroom-schedule-module-style[open], '
      + '.classroom-schedule-pdf-style[open], '
      + '.classroom-track-progress-help[open]'
  ).forEach((details) => {
    if (!details.contains(event.target)) details.open = false
  })
}

function applyModuleStyle(element, style = {}) {
  if (!element) return
  element.style.setProperty('--schedule-module-header', style.headerColor || '#5fae63')
  element.style.setProperty('--schedule-module-stripe', style.stripeColor || '#5fae63')
}

function applyPdfStyle(element, style = {}) {
  if (!element) return
  const normalized = classroomSchedulePdfStyle(style)
  element.style.setProperty('--schedule-pdf-rule', normalized.ruleColor)
  element.style.setProperty('--schedule-pdf-text', normalized.textColor)
}

function applyScheduleWebStyle(element, style = {}) {
  if (!element) return
  const normalized = classroomSchedulePdfStyle(style)
  element.style.setProperty('--schedule-web-rule', normalized.ruleColor)
  element.style.setProperty('--schedule-web-text', normalized.textColor)
}

function createTrackModuleTitleIndex(catalog = {}) {
  const index = new Map()
  ;(catalog?.levels || []).forEach((level) => {
    ;(level?.subjects || []).forEach((subject) => {
      ;(subject?.tracks || []).forEach((track) => {
        ;(track?.modules || []).forEach((module) => {
          const key = String(module?.id || '').trim()
          const title = String(module?.title || '').trim()
          if (key && title) index.set(key, title)
        })
      })
    })
  })
  return index
}

async function handleCourseProgressAction(button) {
  const key = [
    button.dataset.scheduleItemId,
    button.dataset.resourceId || 'session',
    button.dataset.progressKind
  ].join(':')
  if (pendingProgressActions.has(key)) return

  const action = button.dataset.progressAction
  const kind = button.dataset.progressKind
  const role = currentSchedule?.permissions?.actorRole
  let studentExplanation = null

  if (action === 'mark' && kind === 'studied' && role === 'student') {
    const accepted = await confirmStudiedProgress()
    if (!accepted) return
  }
  if (
    action === 'mark'
    && kind === 'studied'
    && (role === 'tutor' || role === 'mentor')
  ) {
    studentExplanation = await requestAcademicReason({
      title: 'Mark this topic as Studied?',
      description:
        'Explain briefly why you are marking this topic as Studied. The Student will receive this explanation and see it in the Schedule Log.'
    })
    if (!studentExplanation) return
  }
  if (action === 'reverse' && kind === 'studied') {
    studentExplanation = await requestAcademicReason({
      title: 'Correct this Studied mark?',
      description:
        'Explain briefly why this Studied mark is being corrected. The Student will receive this explanation and see it in the Schedule Log.'
    })
    if (!studentExplanation) return
  }

  pendingProgressActions.add(key)
  button.disabled = true
  const previousScrollY = window.scrollY
  let changeSaved = false
  try {
    const request = {
      courseId: currentSchedule.courseId,
      scheduleItemId: button.dataset.scheduleItemId,
      resourceId: button.dataset.resourceId || null,
      progressKind: kind,
      expectedLatestEventId: button.dataset.expectedEventId || null,
      studentExplanation
    }
    if (action === 'reverse') await reverseMyCourseProgress(request)
    else await markCourseProgress(request)
    changeSaved = true
    currentScheduleLog = null
    await loadClassroomSchedule({
      force: true,
      quiet: true,
      throwOnError: true
    })
    restoreProgressControlFocus(request, previousScrollY)
  } catch (error) {
    const message = changeSaved
      ? 'Your change was saved, but the latest Schedule could not be loaded.'
      : error?.message || 'Course progress could not be saved.'
    const reloadRequired = /changed while this page was open|reload/i.test(message)
    let feedbackButton = button
    if (!changeSaved && /changed while this page was open|reload/i.test(message)) {
      await loadClassroomSchedule({ force: true, quiet: true })
      feedbackButton = restoreProgressControlFocus({
        scheduleItemId: button.dataset.scheduleItemId,
        resourceId: button.dataset.resourceId || null,
        progressKind: kind
      }, previousScrollY) || button
    }
    showScheduleFeedback(
      reloadRequired
        ? `${message} The latest Schedule is now loaded.`
        : message,
      { error: true, button: feedbackButton }
    )
  } finally {
    pendingProgressActions.delete(key)
    button.disabled = false
  }
}

function confirmStudiedProgress() {
  const dialog = elements.classroomProgressConfirmDialog
  if (!dialog || typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(
      'Mark this topic as Studied? Your Schedule will advance to the next unfinished topic. Only your Tutor or Mentor can undo this change.'
    ))
  }
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm')
    }, { once: true })
  })
}

function restoreProgressControlFocus(request, previousScrollY) {
  window.scrollTo({ top: previousScrollY, left: window.scrollX, behavior: 'auto' })
  const replacement = [...elements.classroomScheduleSessionList.querySelectorAll(
    'button[data-progress-action]'
  )].find((candidate) =>
    candidate.dataset.scheduleItemId === request.scheduleItemId
    && (candidate.dataset.resourceId || null) === request.resourceId
    && candidate.dataset.progressKind === request.progressKind
  )
  replacement?.focus({ preventScroll: true })
  return replacement
}

function requestAcademicReason({ title, description }) {
  const dialog = elements.classroomProgressReasonDialog
  const form = elements.classroomProgressReasonForm
  const input = elements.classroomProgressReason
  const error = elements.classroomProgressReasonError
  if (!dialog || !form || !input || typeof dialog.showModal !== 'function') {
    showScheduleFeedback(
      'The academic-reason form is unavailable. Reload this page before trying again.',
      { error: true }
    )
    return Promise.resolve(null)
  }

  elements.classroomProgressReasonTitle.textContent = title
  elements.classroomProgressReasonDescription.textContent = description
  input.value = ''
  error.textContent = ''
  error.classList.add('is-hidden')
  dialog.returnValue = ''

  return new Promise((resolve) => {
    const cleanup = () => {
      form.removeEventListener('submit', handleSubmit)
      dialog.removeEventListener('close', handleClose)
    }
    const handleSubmit = (event) => {
      event.preventDefault()
      const submitterValue = event.submitter?.value || 'confirm'
      if (submitterValue !== 'confirm') {
        dialog.close('cancel')
        return
      }
      const reason = input.value.trim()
      if (reason.length < 10 || reason.length > 500) {
        error.textContent = 'Write between 10 and 500 characters.'
        error.classList.remove('is-hidden')
        input.focus()
        return
      }
      dialog.dataset.academicReason = reason
      dialog.close('confirm')
    }
    const handleClose = () => {
      const reason = dialog.returnValue === 'confirm'
        ? dialog.dataset.academicReason || null
        : null
      delete dialog.dataset.academicReason
      cleanup()
      resolve(reason)
    }
    form.addEventListener('submit', handleSubmit)
    dialog.addEventListener('close', handleClose)
    dialog.showModal()
    window.requestAnimationFrame(() => input.focus())
  })
}

function showScheduleFeedback(message, { error = false, button = null } = {}) {
  const rowFeedback = button
    ?.closest('.classroom-schedule-session')
    ?.querySelector('[data-schedule-progress-feedback]')
  if (rowFeedback) {
    window.clearTimeout(scheduleRowFeedbackTimers.get(rowFeedback))
    rowFeedback.textContent = message
    rowFeedback.classList.toggle('is-error', error)
    rowFeedback.hidden = false
    scheduleRowFeedbackTimers.set(rowFeedback, window.setTimeout(() => {
      rowFeedback.hidden = true
    }, error ? 6000 : 2000))
    return
  }
  window.clearTimeout(scheduleFeedbackTimer)
  elements.classroomScheduleProgressFeedback.textContent = message
  elements.classroomScheduleProgressFeedback.classList.toggle('is-error', error)
  elements.classroomScheduleProgressFeedback.classList.remove('is-hidden')
  scheduleFeedbackTimer = window.setTimeout(() => {
    elements.classroomScheduleProgressFeedback.classList.add('is-hidden')
  }, error ? 6000 : 2000)
}

function createScheduleLink(label, href) {
  const heading = document.createElement('h3')
  const link = document.createElement('a')
  link.href = href
  link.textContent = label
  heading.append(link)
  return heading
}

function createResourceLink(label, href) {
  const link = document.createElement('a')
  link.href = href
  link.textContent = label
  link.target = href.startsWith('http') ? '_blank' : '_self'
  if (link.target === '_blank') link.rel = 'noopener'
  return link
}

function createScheduleBadge(label, modifier = '') {
  const badge = document.createElement('span')
  badge.className = `classroom-schedule-session-badge ${modifier}`.trim()
  badge.textContent = label
  return badge
}

function scheduleKindLabel(kind) {
  const labels = {
    curriculum_topic: 'Topic',
    review: 'Review',
    exam: 'Exam',
    wrap_up: 'Wrap-up'
  }
  return labels[kind] || titleCase(kind.replaceAll('_', ' '))
}

function scheduleSequenceLabel(state) {
  return {
    studied: 'Studied',
    next: 'Next',
    upcoming: 'Upcoming'
  }[state] || 'Upcoming'
}

function renderScheduleBuilderLink(classroom) {
  const role = classroom.viewer.membershipRole
  const canEdit = !classroom.classroom.readOnly
    && classroom.course.status === 'active'
    && (role === 'tutor' || role === 'mentor')
  elements.classroomScheduleEditLink.classList.toggle('is-hidden', !canEdit)
  if (!canEdit) {
    elements.classroomScheduleEditLink.removeAttribute('href')
    return
  }
  const returnTo = `${window.location.pathname}?classroom=${encodeURIComponent(classroom.classroom.id)}&area=schedule`
  elements.classroomScheduleEditLink.href =
    `../schedule-generator/schedule-generator.html?course=${encodeURIComponent(classroom.course.id)}&returnTo=${encodeURIComponent(returnTo)}`
}

async function loadClassroomFiles({ force = false } = {}) {
  if (!currentClassroom || (currentFiles && !force)) {
    if (currentFiles) renderClassroomFiles(currentFiles)
    return
  }
  const requestToken = ++filesRequestToken
  elements.classroomSpaceFiles.setAttribute('aria-busy', 'true')
  elements.classroomFilesLoading.classList.remove('is-hidden')
  elements.classroomFilesError.classList.add('is-hidden')
  try {
    const payload = await getClassroomFilesData(currentClassroom.classroom.id)
    if (requestToken !== filesRequestToken) return
    currentFiles = payload
    renderClassroomFiles(payload)
  } catch (error) {
    if (requestToken !== filesRequestToken) return
    showClassroomFilesLoadError(error?.message || 'Classroom files could not be loaded.')
  } finally {
    if (requestToken === filesRequestToken) {
      elements.classroomSpaceFiles.setAttribute('aria-busy', 'false')
      elements.classroomFilesLoading.classList.add('is-hidden')
    }
  }
}

function renderClassroomFiles(payload) {
  elements.classroomFilesError.classList.add('is-hidden')
  elements.classroomFilesUploadForm.hidden = !payload.access.canUpload
  elements.classroomFilesReadOnly.classList.toggle('is-hidden', payload.access.canUpload)
  elements.classroomFilesRules.textContent = describeUploadRules(payload.uploadRules)
  elements.classroomFilesCount.textContent = `${payload.files.length} ${payload.files.length === 1 ? 'file' : 'files'}`
  elements.classroomFilesEmpty.classList.toggle('is-hidden', payload.files.length > 0)
  elements.classroomFilesList.replaceChildren(...payload.files.map(createClassroomFileItem))
}

function createClassroomFileItem(file) {
  const item = document.createElement('li')
  item.className = 'classroom-file-item'
  item.dataset.status = file.status

  const identity = document.createElement('div')
  identity.className = 'classroom-file-identity'
  const type = document.createElement('span')
  type.className = 'classroom-file-type'
  type.textContent = fileTypeLabel(file.mimeType)
  type.setAttribute('aria-hidden', 'true')
  const details = document.createElement('div')
  const name = document.createElement('h3')
  name.textContent = file.name
  const metadata = document.createElement('p')
  metadata.textContent = `${formatFileSize(file.sizeBytes)} · ${file.uploadedBy.name} · ${formatDateTime(file.uploadedAt)}`
  details.append(name, metadata)
  identity.append(type, details)

  const context = document.createElement('div')
  context.className = 'classroom-file-context'
  if (file.status === 'hidden') {
    const hidden = document.createElement('span')
    hidden.className = 'classroom-file-status'
    hidden.textContent = 'Hidden from members'
    context.append(hidden)
    if (file.hiddenReason) {
      const reason = document.createElement('p')
      reason.textContent = `Reason: ${file.hiddenReason}`
      context.append(reason)
    }
  } else if (file.canWithdraw && file.withdrawalDeadline) {
    const deadline = document.createElement('p')
    deadline.textContent = `You can withdraw this file until ${formatDateTime(file.withdrawalDeadline)}.`
    context.append(deadline)
  }

  const actions = document.createElement('div')
  actions.className = 'classroom-file-actions'
  actions.append(
    createFileActionButton('Preview', 'preview', file),
    createFileActionButton('Download', 'download', file)
  )
  if (file.canWithdraw) actions.append(createFileActionButton('Withdraw', 'withdraw', file, 'is-danger'))
  if (file.canHide) actions.append(createFileActionButton('Hide', 'hide', file, 'is-danger'))

  item.append(identity, context, actions)
  return item
}

function createFileActionButton(label, action, file, modifier = '') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `classroom-file-action ${modifier}`.trim()
  button.dataset.fileAction = action
  button.dataset.fileId = file.id
  button.textContent = label
  button.setAttribute('aria-label', `${label} ${file.name}`)
  return button
}

async function handleClassroomFileAction(action, file) {
  if (action === 'withdraw' || action === 'hide') {
    openClassroomFileDialog(action, file)
    return
  }
  if (action !== 'preview' && action !== 'download') return

  let previewWindow = null
  if (action === 'preview') {
    previewWindow = window.open('about:blank', '_blank')
    if (!previewWindow) {
      showClassroomFilesFeedback('Allow pop-ups to preview this Classroom file.', { error: true })
      return
    }
    previewWindow.opener = null
  }

  try {
    const signedUrl = await getClassroomFileSignedUrl(file, { download: action === 'download' })
    if (previewWindow) {
      previewWindow.location.replace(signedUrl)
      return
    }
    const link = document.createElement('a')
    link.href = signedUrl
    link.download = file.name
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
  } catch (error) {
    previewWindow?.close()
    showClassroomFilesFeedback(error?.message || 'A temporary file link could not be created.', { error: true })
  }
}

function selectUpload(file) {
  selectedUpload = null
  elements.classroomFilesUpload.disabled = true
  elements.classroomFilesSelection.classList.remove('is-error')
  if (!file) {
    elements.classroomFilesInput.value = ''
    elements.classroomFilesSelection.textContent = 'No file selected.'
    return
  }
  const validation = validateClassroomUpload(file, currentFiles?.uploadRules)
  if (!validation.valid) {
    elements.classroomFilesInput.value = ''
    elements.classroomFilesSelection.textContent = validation.message
    elements.classroomFilesSelection.classList.add('is-error')
    return
  }
  selectedUpload = file
  elements.classroomFilesSelection.textContent = `${validation.name} · ${formatFileSize(validation.size)}`
  elements.classroomFilesUpload.disabled = false
}

async function submitClassroomFileUpload() {
  if (!selectedUpload || !currentFiles?.access.canUpload || !currentClassroom) return
  const file = selectedUpload
  setClassroomFileUploadBusy(true)
  try {
    currentFiles = await uploadClassroomFile(currentClassroom.classroom.id, file)
    selectUpload(null)
    renderClassroomFiles(currentFiles)
    showClassroomFilesFeedback(`${file.name} was added to this Classroom.`)
  } catch (error) {
    showClassroomFilesFeedback(error?.message || 'This file could not be uploaded.', { error: true })
  } finally {
    setClassroomFileUploadBusy(false)
  }
}

function setClassroomFileUploadBusy(busy) {
  elements.classroomFilesChoose.disabled = busy
  elements.classroomFilesInput.disabled = busy
  elements.classroomFilesUpload.disabled = busy || !selectedUpload
  elements.classroomFilesDropzone.classList.toggle('is-busy', busy)
  elements.classroomFilesUpload.textContent = busy ? 'Uploading…' : 'Upload file'
}

function openClassroomFileDialog(action, file) {
  pendingFileAction = { action, file }
  const isHide = action === 'hide'
  elements.classroomFileDialogKicker.textContent = isHide ? 'Moderation' : 'Your upload'
  elements.classroomFileDialogTitle.textContent = isHide ? 'Hide this file?' : 'Withdraw this file?'
  elements.classroomFileDialogDescription.textContent = isHide
    ? 'Students and Guardians will no longer see it. Authorized moderators retain review access.'
    : 'It will disappear from ordinary Classroom access. This does not permanently erase the retained object.'
  elements.classroomFileDialogFile.textContent = file.name
  elements.classroomFileDialogReasonLabel.textContent = isHide ? 'Reason for hiding' : 'Optional note'
  elements.classroomFileDialogReasonHelp.textContent = isHide
    ? 'Required · 10–1000 characters · stored in the audit history'
    : 'Optional · up to 1000 characters'
  elements.classroomFileDialogReason.required = isHide
  elements.classroomFileDialogReason.minLength = isHide ? 10 : 0
  elements.classroomFileDialogConfirm.textContent = isHide ? 'Hide file' : 'Withdraw file'
  elements.classroomFileDialogError.classList.add('is-hidden')
  elements.classroomFileDialog.showModal()
  elements.classroomFileDialogReason.focus()
}

async function submitClassroomFileAction() {
  if (!pendingFileAction || !currentClassroom) return
  const { action, file } = pendingFileAction
  const reason = elements.classroomFileDialogReason.value.trim()
  if (action === 'hide' && (reason.length < 10 || reason.length > 1000)) {
    showClassroomFileDialogError('Enter a reason between 10 and 1000 characters.')
    return
  }
  setClassroomFileDialogBusy(true)
  try {
    currentFiles = action === 'hide'
      ? await hideClassroomFile(currentClassroom.classroom.id, file.id, reason)
      : await withdrawClassroomFile(currentClassroom.classroom.id, file.id, reason)
    renderClassroomFiles(currentFiles)
    elements.classroomFileDialog.close()
    showClassroomFilesFeedback(
      action === 'hide' ? `${file.name} is now hidden from members.` : `${file.name} was withdrawn.`
    )
  } catch (error) {
    showClassroomFileDialogError(error?.message || 'The file action could not be completed.')
  } finally {
    setClassroomFileDialogBusy(false)
  }
}

function setClassroomFileDialogBusy(busy) {
  elements.classroomFileDialogReason.disabled = busy
  elements.classroomFileDialogCancel.disabled = busy
  elements.classroomFileDialogConfirm.disabled = busy
  elements.classroomFileDialogConfirm.textContent = busy
    ? 'Saving…'
    : pendingFileAction?.action === 'hide' ? 'Hide file' : 'Withdraw file'
}

function resetClassroomFileDialog() {
  pendingFileAction = null
  elements.classroomFileDialogForm.reset()
  elements.classroomFileDialogError.textContent = ''
  elements.classroomFileDialogError.classList.add('is-hidden')
  setClassroomFileDialogBusy(false)
}

function showClassroomFileDialogError(message) {
  elements.classroomFileDialogError.textContent = message
  elements.classroomFileDialogError.classList.remove('is-hidden')
}

function showClassroomFilesLoadError(message) {
  elements.classroomFilesErrorMessage.textContent = message
  elements.classroomFilesError.classList.remove('is-hidden')
  elements.classroomFilesList.replaceChildren()
  elements.classroomFilesEmpty.classList.add('is-hidden')
}

function showClassroomFilesFeedback(message, { error = false } = {}) {
  window.clearTimeout(feedbackTimer)
  elements.classroomFilesFeedback.textContent = message
  elements.classroomFilesFeedback.classList.toggle('is-error', error)
  elements.classroomFilesFeedback.classList.remove('is-hidden')
  if (!error) {
    feedbackTimer = window.setTimeout(() => {
      elements.classroomFilesFeedback.classList.add('is-hidden')
      elements.classroomFilesFeedback.textContent = ''
    }, 3500)
  }
}

function describeUploadRules(rules) {
  return `PDF, JPEG, or PNG · up to ${formatFileSize(rules.maxFileSizeBytes)}`
}

function fileTypeLabel(mimeType) {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/png') return 'PNG'
  return 'JPG'
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  const megabytes = size / (1024 * 1024)
  return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`
}

function formatDateTime(value) {
  if (!value) return 'Upload pending'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(date)
}

function formatProgressDate(value, timeZone = 'UTC') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: timeZone || 'UTC'
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    }).format(date)
  }
}

function formatScheduleHistoryTimestamp(value, timeZone = 'UTC') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: timeZone || 'UTC'
  }
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: 'UTC'
    }).format(date)
  }
}

function renderScheduleSummary(schedule) {
  const isLinked = schedule.linkageStatus === 'linked'
  elements.classroomScheduleSummary.dataset.linkageStatus = schedule.linkageStatus
  elements.classroomScheduleLinkage.textContent = isLinked ? 'Linked' : 'Not linked yet'
  elements.classroomScheduleName.textContent = isLinked ? schedule.name : 'No Course Schedule is linked'
  elements.classroomScheduleMessage.textContent = isLinked
    ? 'This is the current read-only Schedule summary. Editing and Course-date synchronization arrive in Phase 5.'
    : 'This legacy Course remains readable. Phase 5 will migrate existing Courses and require a versioned Schedule.'
  elements.classroomScheduleDates.textContent = isLinked
    ? describeCourseDates(schedule.firstSessionDate, schedule.lastSessionDate)
    : 'Not available'
  elements.classroomScheduleSessions.textContent = isLinked
    ? `${schedule.sessionCount} ${schedule.sessionCount === 1 ? 'session' : 'sessions'}`
    : 'Not available'
  elements.classroomScheduleTimeZone.textContent = isLinked ? schedule.timeZone || 'UTC' : 'Not available'
  elements.classroomScheduleVersions.textContent = isLinked
    ? `${schedule.versionCount} ${schedule.versionCount === 1 ? 'version' : 'versions'}`
    : '0 versions'
}

function renderManagementSurface(classroom) {
  const canManage = classroom.viewer.canManageClassroom && classroom.management.access === 'active'
  elements.classroomSpaceManageToggle.hidden = !canManage
  if (!canManage) {
    setManagementExpanded(false)
    return
  }
  setManagementExpanded(false)

  elements.classroomManagementTutor.textContent = classroom.tutor.name
  elements.classroomManagementEndDate.textContent = classroom.course.scheduledEndDate
    ? `Scheduled to end ${formatDate(classroom.course.scheduledEndDate)}`
    : 'Ending date unavailable'
  elements.classroomManagementTutorState.textContent = managementStatusLabel(
    classroom.management.actions.tutorAssignment
  )
  elements.classroomManagementScheduleState.textContent = managementStatusLabel(
    classroom.management.actions.meetingSchedule
  )
  elements.classroomManagementEndingState.textContent = managementStatusLabel(
    classroom.management.actions.courseEnding
  )
  elements.classroomManagementTerminationState.textContent = managementStatusLabel(
    classroom.management.actions.courseTermination
  )
}

function setManagementExpanded(expanded) {
  const mayExpand = Boolean(currentClassroom?.viewer?.canManageClassroom)
  const nextExpanded = Boolean(expanded && mayExpand)
  elements.classroomSpaceManageToggle.setAttribute('aria-expanded', String(nextExpanded))
  elements.classroomSpaceManagement.setAttribute('aria-hidden', String(!nextExpanded))
  elements.classroomSpaceManagement.inert = !nextExpanded
  elements.classroomSpaceManagement.hidden = !mayExpand
  if (!mayExpand) {
    elements.classroomSpaceManagement.classList.add('is-collapsed')
    return
  }
  if (nextExpanded) {
    elements.classroomSpaceManagement.classList.remove('is-collapsed')
    return
  }
  elements.classroomSpaceManagement.classList.add('is-collapsed')
}

function showError(message) {
  if (!elements.error) collectElements()
  elements.root?.setAttribute('aria-busy', 'false')
  elements.error.textContent = message
  elements.error.classList.remove('is-hidden')
}

function describeCourseDates(startDate, endDate) {
  if (!startDate || !endDate) return 'Schedule not available'
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`))
}

function backDestination(classroom) {
  if (classroom.viewer.membershipRole === 'student') {
    if (classroom.classroom.readOnly) {
      return {
        href: `./student-classrooms.html#${classroom.viewer.personalArchived ? 'archived' : 'former'}`,
        label: 'Classrooms'
      }
    }
    return { href: '../dashboard/student-dashboard.html', label: 'Dashboard' }
  }
  if (classroom.viewer.membershipRole === 'mentor') {
    return { href: '../dashboard/mentor-dashboard.html', label: 'Dashboard' }
  }
  return { href: '../dashboard/tutor-dashboard.html', label: 'Dashboard' }
}

function classroomStatusLabel(classroom) {
  if (classroom.viewer.personalArchived) return 'Archived'
  if (classroom.course.status === 'wind_down') return 'Ending soon'
  if (classroom.classroom.readOnly) return 'Former'
  return titleCase(classroom.classroom.status)
}

function titleCase(value) {
  return String(value || '').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function managementStatusLabel(status) {
  const labels = {
    planned_phase_4b: 'Planned for Phase 4.B',
    planned_phase_4d: 'Planned for Phase 4.D',
    planned_phase_5: 'Planned for Phase 5',
    planned_phase_6: 'Planned for Phase 6',
    planned_course_lifecycle: 'Lifecycle command pending'
  }
  return labels[status] || titleCase(String(status || 'planned').replaceAll('_', ' '))
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}
