export const CURRICULUM_NODE_TYPES = Object.freeze(['degree', 'subject', 'track', 'topic'])

const CHILD_TYPE_BY_PARENT = Object.freeze({
  degree: 'subject',
  subject: 'track',
  track: 'topic',
  topic: 'topic'
})

export function normalizeCurriculumNode(node) {
  if (!node || typeof node !== 'object') return null
  const id = String(node.id || '').trim()
  const type = String(node.type || node.nodeType || node.node_type || '').trim().toLowerCase()
  const name = String(node.name || '').trim()
  if (!id || !CURRICULUM_NODE_TYPES.includes(type) || !name) return null
  return {
    id,
    parentId: node.parentId || node.parent_id || null,
    type,
    name,
    slug: String(node.slug || '').trim(),
    description: String(node.description || '').trim(),
    status: String(node.status || 'active').trim().toLowerCase(),
    sortOrder: Number.isFinite(Number(node.sortOrder ?? node.sort_order))
      ? Number(node.sortOrder ?? node.sort_order)
      : 100,
    createdBy: node.createdBy || node.created_by || null,
    approvedBy: node.approvedBy || node.approved_by || null,
    sourceProposalId: node.sourceProposalId || node.source_proposal_id || null,
    createdAt: node.createdAt || node.created_at || null,
    updatedAt: node.updatedAt || node.updated_at || null,
    archivedAt: node.archivedAt || node.archived_at || null,
    metadata: node.metadata && typeof node.metadata === 'object' ? node.metadata : {}
  }
}

export function getAllowedChildType(parent) {
  if (!parent) return 'degree'
  const type = String(parent.type || parent.nodeType || parent.node_type || '').trim().toLowerCase()
  return CHILD_TYPE_BY_PARENT[type] || ''
}

export function buildCurriculumForest(nodes, { includeArchived = false } = {}) {
  const normalized = (Array.isArray(nodes) ? nodes : [])
    .map(normalizeCurriculumNode)
    .filter(Boolean)
    .filter((node) => includeArchived || node.status === 'active')
  const byId = new Map(normalized.map((node) => [node.id, { ...node, children: [] }]))
  const roots = []

  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortNodes = (items) => {
    items.sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    ))
    items.forEach((node) => sortNodes(node.children))
    return items
  }
  return sortNodes(roots)
}

export function flattenCurriculumForest(forest) {
  const flattened = []
  const visit = (node, depth, path) => {
    const names = [...path, node.name]
    flattened.push({ ...node, depth, path: names, pathLabel: names.join(' / ') })
    node.children.forEach((child) => visit(child, depth + 1, names))
  }
  ;(Array.isArray(forest) ? forest : []).forEach((root) => visit(root, 0, []))
  return flattened
}

export function normalizeCurriculumProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return null
  const id = String(proposal.id || '').trim()
  if (!id) return null
  return {
    id,
    proposerId: proposal.proposerId || proposal.proposer_id || null,
    parentId: proposal.parentId || proposal.parent_id || null,
    nodeType: String(proposal.nodeType || proposal.node_type || '').trim().toLowerCase(),
    name: String(proposal.name || '').trim(),
    slug: String(proposal.slug || '').trim(),
    description: String(proposal.description || '').trim(),
    status: String(proposal.status || 'pending').trim().toLowerCase(),
    reviewerId: proposal.reviewerId || proposal.reviewer_id || null,
    reviewNotes: String(proposal.reviewNotes || proposal.review_notes || '').trim(),
    appliedNodeId: proposal.appliedNodeId || proposal.applied_node_id || null,
    submittedAt: proposal.submittedAt || proposal.submitted_at || null,
    decidedAt: proposal.decidedAt || proposal.decided_at || null,
    metadata: proposal.metadata && typeof proposal.metadata === 'object' ? proposal.metadata : {}
  }
}
