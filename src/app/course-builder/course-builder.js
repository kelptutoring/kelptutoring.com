import { requireCapability, getHomePathByRole } from '../../auth/auth-guard.js'
import { supabase } from '../../lib/supabase/supabaseClient.js'
import {
  buildCurriculumForest,
  flattenCurriculumForest,
  getAllowedChildType
} from './curriculum-domain.js'
import { createSupabaseCurriculumAdapters } from './curriculum-supabase-adapters.js'

const state = {
  current: null,
  adapters: null,
  nodes: [],
  proposals: [],
  forest: [],
  flattened: [],
  selectedNodeId: null,
  busy: false
}

const elements = {}

init().catch((error) => {
  console.error('Curriculum workspace failed:', error)
  setStatus(error?.message || 'The curriculum workspace could not be opened.', true)
})

async function init() {
  state.current = await requireCapability(['taxonomy.propose', 'taxonomy.manage'], { requireAll: false })
  if (!state.current) return
  state.adapters = createSupabaseCurriculumAdapters({ supabase })
  cacheElements()
  configureIdentity()
  bindEvents()
  await refreshWorkspace()
}

function cacheElements() {
  const ids = [
    'workspace-home', 'back-to-workspace', 'active-workspace-label',
    'governance-title', 'governance-copy', 'active-node-count',
    'deepest-path-count', 'pending-proposal-count', 'page-status',
    'refresh-curriculum', 'curriculum-tree', 'new-node-form',
    'new-node-parent', 'new-node-type', 'new-node-name',
    'new-node-description', 'submit-proposal', 'create-canonical-node',
    'new-node-guidance', 'node-inspector', 'node-inspector-form',
    'inspector-node-id', 'inspector-node-name', 'inspector-node-description',
    'inspector-node-order', 'archive-node', 'proposal-guidance',
    'proposal-status-filter', 'proposal-list'
  ]
  ids.forEach((id) => { elements[id] = document.getElementById(id) })
}

function configureIdentity() {
  const homePath = getHomePathByRole(state.current.primaryRole)
  elements['workspace-home'].href = homePath
  elements['back-to-workspace'].href = homePath
  elements['active-workspace-label'].textContent = state.current.hasRole('admin')
    ? 'Administrator curriculum workspace'
    : 'Mentor curriculum workspace'

  if (canManage()) {
    elements['governance-title'].textContent = 'Canonical taxonomy access'
    elements['governance-copy'].textContent = 'You can approve proposals, add nodes directly, edit labels, and archive unused leaves.'
    elements['proposal-guidance'].textContent = 'Review every submitted proposal. Approval creates a stable canonical node.'
    elements['create-canonical-node'].classList.remove('is-hidden')
    elements['node-inspector'].classList.remove('is-hidden')
  } else {
    elements['governance-title'].textContent = 'Proposal access'
    elements['governance-copy'].textContent = 'Your proposals remain separate until an administrator accepts them into the canonical tree.'
  }
}

function bindEvents() {
  elements['refresh-curriculum'].addEventListener('click', () => refreshWorkspace({ announce: true }))
  elements['new-node-parent'].addEventListener('change', updateSuggestedNodeType)
  elements['new-node-form'].addEventListener('submit', handleNewNode)
  elements['curriculum-tree'].addEventListener('click', handleTreeClick)
  elements['node-inspector-form'].addEventListener('submit', handleNodeUpdate)
  elements['archive-node'].addEventListener('click', handleNodeArchive)
  elements['proposal-status-filter'].addEventListener('change', renderProposals)
  elements['proposal-list'].addEventListener('click', handleProposalDecision)
}

function canManage() {
  return Boolean(state.current?.can('taxonomy.manage'))
}

async function refreshWorkspace({ announce = false } = {}) {
  if (state.busy) return
  setBusy(true)
  if (announce) setStatus('Refreshing the curriculum workspace…')
  try {
    const [nodes, proposals] = await Promise.all([
      state.adapters.nodes.list({ includeArchived: canManage() }),
      state.adapters.proposals.list()
    ])
    state.nodes = nodes
    state.proposals = proposals
    state.forest = buildCurriculumForest(nodes, { includeArchived: canManage() })
    state.flattened = flattenCurriculumForest(state.forest)
    if (state.selectedNodeId && !state.nodes.some((node) => node.id === state.selectedNodeId)) {
      state.selectedNodeId = null
    }
    renderSummary()
    renderParentOptions()
    renderTree()
    renderInspector()
    renderProposals()
    if (announce) setStatus('Curriculum workspace refreshed.')
  } catch (error) {
    setStatus(error?.message || 'The curriculum workspace could not be refreshed.', true)
    throw error
  } finally {
    setBusy(false)
  }
}

function renderSummary() {
  const activeNodes = state.nodes.filter((node) => node.status === 'active')
  const activeForest = buildCurriculumForest(activeNodes)
  const activeFlattened = flattenCurriculumForest(activeForest)
  const deepest = activeFlattened.reduce((maximum, node) => Math.max(maximum, node.depth + 1), 0)
  const pending = state.proposals.filter((proposal) => proposal.status === 'pending').length
  elements['active-node-count'].textContent = String(activeNodes.length)
  elements['deepest-path-count'].textContent = deepest ? `${deepest} levels` : '0 levels'
  elements['pending-proposal-count'].textContent = String(pending)
}

function renderParentOptions() {
  const select = elements['new-node-parent']
  const selected = select.value || state.selectedNodeId || ''
  select.replaceChildren(new Option('Root (add a degree)', ''))
  const activeForest = buildCurriculumForest(state.nodes.filter((node) => node.status === 'active'))
  flattenCurriculumForest(activeForest).forEach((node) => {
    const prefix = '— '.repeat(node.depth)
    select.append(new Option(`${prefix}${node.name} · ${node.type}`, node.id))
  })
  select.value = Array.from(select.options).some((option) => option.value === selected) ? selected : ''
  updateSuggestedNodeType()
}

function updateSuggestedNodeType() {
  const parent = state.nodes.find((node) => node.id === elements['new-node-parent'].value) || null
  const nodeType = getAllowedChildType(parent)
  elements['new-node-type'].value = nodeType
  elements['new-node-guidance'].textContent = parent
    ? `The next node under ${parent.name} must be a ${nodeType}. Topics may contain more topics.`
    : 'Root nodes represent degrees such as Middle School, High School, or College.'
}

function renderTree() {
  const container = elements['curriculum-tree']
  container.replaceChildren()
  if (!state.forest.length) {
    container.append(createEmptyState('No curriculum nodes are available yet.'))
    return
  }
  container.append(createTreeList(state.forest))
}

function createTreeList(nodes) {
  const list = document.createElement('ul')
  nodes.forEach((node) => {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'curriculum-tree-node'
    button.dataset.nodeId = node.id
    if (node.id === state.selectedNodeId) button.classList.add('is-selected')
    if (node.status === 'archived') button.classList.add('is-archived')
    button.setAttribute('aria-pressed', String(node.id === state.selectedNodeId))

    const name = document.createElement('span')
    name.className = 'curriculum-tree-node-name'
    name.textContent = node.name
    const type = document.createElement('span')
    type.className = 'curriculum-type-badge'
    type.dataset.type = node.type
    type.textContent = node.status === 'archived' ? `${node.type} · archived` : node.type
    button.append(name, type)
    item.append(button)
    if (node.children.length) item.append(createTreeList(node.children))
    list.append(item)
  })
  return list
}

function handleTreeClick(event) {
  const button = event.target.closest('[data-node-id]')
  if (!button) return
  const node = state.nodes.find((candidate) => candidate.id === button.dataset.nodeId)
  if (!node) return
  state.selectedNodeId = node.id
  if (node.status === 'active') elements['new-node-parent'].value = node.id
  updateSuggestedNodeType()
  renderTree()
  renderInspector()
}

function renderInspector() {
  if (!canManage()) return
  const node = state.nodes.find((candidate) => candidate.id === state.selectedNodeId) || null
  elements['node-inspector-form'].classList.toggle('is-hidden', !node)
  if (!node) return
  elements['inspector-node-id'].value = node.id
  elements['inspector-node-name'].value = node.name
  elements['inspector-node-description'].value = node.description
  elements['inspector-node-order'].value = String(node.sortOrder)
  const activeChildren = state.nodes.some((candidate) => candidate.parentId === node.id && candidate.status === 'active')
  elements['archive-node'].disabled = node.status !== 'active' || activeChildren
  elements['archive-node'].title = activeChildren
    ? 'Archive this node’s active children first.'
    : node.status === 'archived' ? 'This node is already archived.' : ''
}

async function handleNewNode(event) {
  event.preventDefault()
  if (state.busy) return
  const mode = event.submitter?.dataset.submitMode || 'proposal'
  const input = {
    parentId: elements['new-node-parent'].value || null,
    nodeType: elements['new-node-type'].value,
    name: elements['new-node-name'].value,
    description: elements['new-node-description'].value
  }
  setBusy(true)
  setStatus(mode === 'direct' ? 'Adding the canonical curriculum node…' : 'Submitting the curriculum proposal…')
  try {
    if (mode === 'direct') {
      if (!canManage()) throw new Error('Canonical nodes require taxonomy management access.')
      await state.adapters.nodes.create(input)
      setStatus('Canonical curriculum node added.')
    } else {
      await state.adapters.proposals.create(input)
      setStatus('Curriculum proposal submitted for administrator review.')
    }
    elements['new-node-name'].value = ''
    elements['new-node-description'].value = ''
  } catch (error) {
    setStatus(error?.message || 'The curriculum node could not be submitted.', true)
    return
  } finally {
    setBusy(false)
  }
  await refreshWorkspace()
}

async function handleNodeUpdate(event) {
  event.preventDefault()
  if (state.busy || !canManage()) return
  setBusy(true)
  setStatus('Saving the canonical curriculum node…')
  try {
    await state.adapters.nodes.update(elements['inspector-node-id'].value, {
      name: elements['inspector-node-name'].value,
      description: elements['inspector-node-description'].value,
      sortOrder: elements['inspector-node-order'].value
    })
    setStatus('Canonical curriculum node updated.')
  } catch (error) {
    setStatus(error?.message || 'The curriculum node could not be updated.', true)
    return
  } finally {
    setBusy(false)
  }
  await refreshWorkspace()
}

async function handleNodeArchive() {
  if (state.busy || !canManage() || !state.selectedNodeId) return
  const node = state.nodes.find((candidate) => candidate.id === state.selectedNodeId)
  if (!node || !window.confirm(`Archive “${node.name}”? Existing references will retain this stable node ID.`)) return
  setBusy(true)
  setStatus('Archiving the curriculum node…')
  try {
    await state.adapters.nodes.archive(node.id)
    state.selectedNodeId = null
    setStatus('Curriculum node archived. Its ID and history were preserved.')
  } catch (error) {
    setStatus(error?.message || 'The curriculum node could not be archived.', true)
    return
  } finally {
    setBusy(false)
  }
  await refreshWorkspace()
}

function renderProposals() {
  const container = elements['proposal-list']
  const filter = elements['proposal-status-filter'].value
  const proposals = state.proposals.filter((proposal) => !filter || proposal.status === filter)
  container.replaceChildren()
  if (!proposals.length) {
    container.append(createEmptyState(filter ? `No ${filter.replace('_', ' ')} proposals.` : 'No curriculum proposals yet.'))
    return
  }

  proposals.forEach((proposal) => {
    const card = document.createElement('article')
    card.className = 'curriculum-proposal-card'
    card.dataset.proposalId = proposal.id

    const copy = document.createElement('div')
    copy.className = 'curriculum-proposal-copy'
    const title = document.createElement('div')
    title.className = 'curriculum-proposal-title'
    const name = document.createElement('strong')
    name.textContent = proposal.name
    const type = document.createElement('span')
    type.className = 'curriculum-type-badge'
    type.dataset.type = proposal.nodeType
    type.textContent = proposal.nodeType
    const status = document.createElement('span')
    status.className = 'curriculum-status-badge'
    status.dataset.status = proposal.status
    status.textContent = proposal.status.replace('_', ' ')
    title.append(name, type, status)

    const parent = document.createElement('p')
    parent.textContent = `Parent: ${getNodePathLabel(proposal.parentId)}`
    const description = document.createElement('p')
    description.textContent = proposal.description || 'No description supplied.'
    const meta = document.createElement('span')
    meta.className = 'curriculum-proposal-meta'
    meta.textContent = `Submitted ${formatDate(proposal.submittedAt)}${proposal.reviewNotes ? ` · Review: ${proposal.reviewNotes}` : ''}`
    copy.append(title, parent, description, meta)
    card.append(copy)

    if (canManage() && proposal.status === 'pending') {
      const review = document.createElement('div')
      review.className = 'curriculum-proposal-review'
      const notes = document.createElement('textarea')
      notes.dataset.reviewNotes = proposal.id
      notes.setAttribute('aria-label', `Review notes for ${proposal.name}`)
      notes.placeholder = 'Notes (required when rejecting)'
      const actions = document.createElement('div')
      actions.className = 'curriculum-form-actions'
      const approve = createDecisionButton('Approve', 'approved', 'curriculum-primary-button', proposal.id)
      const reject = createDecisionButton('Reject', 'rejected', 'curriculum-danger-button', proposal.id)
      actions.append(approve, reject)
      review.append(notes, actions)
      card.append(review)
    }
    container.append(card)
  })
}

function createDecisionButton(label, decision, className, proposalId) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.dataset.proposalDecision = decision
  button.dataset.proposalId = proposalId
  button.textContent = label
  return button
}

async function handleProposalDecision(event) {
  const button = event.target.closest('[data-proposal-decision]')
  if (!button || state.busy || !canManage()) return
  const proposalId = button.dataset.proposalId
  const notes = elements['proposal-list'].querySelector(`[data-review-notes="${proposalId}"]`)?.value || ''
  if (button.dataset.proposalDecision === 'rejected' && !notes.trim()) {
    setStatus('Add review notes before rejecting a curriculum proposal.', true)
    return
  }
  setBusy(true)
  setStatus(`${button.dataset.proposalDecision === 'approved' ? 'Approving' : 'Rejecting'} the curriculum proposal…`)
  try {
    await state.adapters.proposals.decide(proposalId, {
      decision: button.dataset.proposalDecision,
      notes
    })
    setStatus(`Curriculum proposal ${button.dataset.proposalDecision}.`)
  } catch (error) {
    setStatus(error?.message || 'The curriculum proposal decision could not be saved.', true)
    return
  } finally {
    setBusy(false)
  }
  await refreshWorkspace()
}

function getNodePathLabel(nodeId) {
  if (!nodeId) return 'Root'
  return state.flattened.find((node) => node.id === nodeId)?.pathLabel || 'Unavailable parent'
}

function createEmptyState(message) {
  const paragraph = document.createElement('p')
  paragraph.className = 'curriculum-empty-state'
  paragraph.textContent = message
  return paragraph
}

function formatDate(value) {
  if (!value) return 'at an unknown time'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'at an unknown time'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function setBusy(busy) {
  state.busy = busy
  document.querySelectorAll('button, input, textarea, select').forEach((control) => {
    if (control.id === 'archive-node' && !busy) return
    control.disabled = busy
  })
  if (!busy) {
    elements['proposal-status-filter'].disabled = false
    elements['new-node-parent'].disabled = false
    elements['new-node-type'].disabled = false
    renderInspector()
  }
}

function setStatus(message, isError = false) {
  if (!elements['page-status']) return
  elements['page-status'].textContent = message
  elements['page-status'].classList.toggle('is-error', isError)
}
