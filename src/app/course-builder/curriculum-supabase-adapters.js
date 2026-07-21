import {
  normalizeCurriculumNode,
  normalizeCurriculumProposal
} from './curriculum-domain.js'

const NODE_TABLE = 'curriculum_nodes'
const PROPOSAL_TABLE = 'curriculum_taxonomy_proposals'
const NODE_COLUMNS = 'id, parent_id, node_type, name, slug, description, status, sort_order, created_by, approved_by, source_proposal_id, created_at, updated_at, archived_at, metadata'
const PROPOSAL_COLUMNS = 'id, proposer_id, parent_id, node_type, name, slug, description, status, reviewer_id, review_notes, applied_node_id, submitted_at, decided_at, metadata'

function requireId(value, label) {
  const id = String(value || '').trim()
  if (!id) throw new TypeError(`${label} requires an ID.`)
  return id
}

function validateNodeInput(input) {
  const nodeType = String(input?.nodeType || '').trim().toLowerCase()
  const name = String(input?.name || '').trim()
  if (!['degree', 'subject', 'track', 'topic'].includes(nodeType)) {
    throw new TypeError('A valid curriculum node type is required.')
  }
  if (!name) throw new TypeError('A curriculum node name is required.')
  return {
    parentId: input?.parentId || null,
    nodeType,
    name,
    description: String(input?.description || '').trim()
  }
}

function throwProviderError(error, fallback) {
  if (!error) return
  const providerError = new Error(String(error.message || '').trim() || fallback)
  providerError.code = error.code || null
  providerError.cause = error
  throw providerError
}

export function createSupabaseCurriculumAdapters({ supabase } = {}) {
  if (!supabase?.auth?.getUser || typeof supabase.from !== 'function' || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase client with auth, table, and RPC support is required.')
  }

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser()
    throwProviderError(error, 'The signed-in user could not be verified.')
    if (!data?.user?.id) throw new Error('Sign in before using the curriculum workspace.')
    return data.user
  }

  async function invoke(rpc, args, fallback) {
    await requireUser()
    const { data, error } = await supabase.rpc(rpc, args)
    throwProviderError(error, fallback)
    return data
  }

  return {
    meta: Object.freeze({
      scope: 'curriculum',
      provider: 'supabase',
      contractVersion: 1
    }),
    nodes: {
      async list({ includeArchived = false } = {}) {
        await requireUser()
        let query = supabase
          .from(NODE_TABLE)
          .select(NODE_COLUMNS)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
        if (!includeArchived) query = query.eq('status', 'active')
        const { data, error } = await query
        throwProviderError(error, 'The curriculum tree could not be loaded.')
        return (data || []).map(normalizeCurriculumNode).filter(Boolean)
      },

      async create(input) {
        const node = validateNodeInput(input)
        const data = await invoke('create_curriculum_node', {
          p_parent_id: node.parentId,
          p_node_type: node.nodeType,
          p_name: node.name,
          p_description: node.description
        }, 'The canonical curriculum node could not be created.')
        return normalizeCurriculumNode(data)
      },

      async update(nodeId, input) {
        const id = requireId(nodeId, 'Curriculum update')
        const name = String(input?.name || '').trim()
        if (!name) throw new TypeError('A curriculum node name is required.')
        const data = await invoke('update_curriculum_node', {
          p_node_id: id,
          p_name: name,
          p_description: String(input?.description || '').trim(),
          p_sort_order: Math.max(0, Number(input?.sortOrder) || 0)
        }, 'The curriculum node could not be updated.')
        return normalizeCurriculumNode(data)
      },

      async archive(nodeId) {
        const data = await invoke('archive_curriculum_node', {
          p_node_id: requireId(nodeId, 'Curriculum archival')
        }, 'The curriculum node could not be archived.')
        return normalizeCurriculumNode(data)
      }
    },
    proposals: {
      async list({ status = null } = {}) {
        await requireUser()
        let query = supabase
          .from(PROPOSAL_TABLE)
          .select(PROPOSAL_COLUMNS)
          .order('submitted_at', { ascending: false })
        if (status) query = query.eq('status', String(status).trim().toLowerCase())
        const { data, error } = await query
        throwProviderError(error, 'Curriculum proposals could not be loaded.')
        return (data || []).map(normalizeCurriculumProposal).filter(Boolean)
      },

      async create(input) {
        const node = validateNodeInput(input)
        const data = await invoke('propose_curriculum_node', {
          p_parent_id: node.parentId,
          p_node_type: node.nodeType,
          p_name: node.name,
          p_description: node.description
        }, 'The curriculum proposal could not be submitted.')
        return normalizeCurriculumProposal(data)
      },

      async decide(proposalId, { decision, notes = '' } = {}) {
        const normalizedDecision = String(decision || '').trim().toLowerCase()
        if (!['approved', 'rejected'].includes(normalizedDecision)) {
          throw new TypeError('A curriculum proposal must be approved or rejected.')
        }
        const data = await invoke('review_curriculum_proposal', {
          p_proposal_id: requireId(proposalId, 'Curriculum proposal decision'),
          p_decision: normalizedDecision,
          p_notes: String(notes || '').trim()
        }, 'The curriculum proposal decision could not be saved.')
        return {
          proposal: normalizeCurriculumProposal(data?.proposal),
          node: normalizeCurriculumNode(data?.node)
        }
      }
    }
  }
}

export const CURRICULUM_SUPABASE_RESOURCES = Object.freeze({
  nodeTable: NODE_TABLE,
  proposalTable: PROPOSAL_TABLE,
  createNodeRpc: 'create_curriculum_node',
  proposeNodeRpc: 'propose_curriculum_node',
  decideProposalRpc: 'review_curriculum_proposal',
  updateNodeRpc: 'update_curriculum_node',
  archiveNodeRpc: 'archive_curriculum_node'
})
