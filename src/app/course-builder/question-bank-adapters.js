const SEARCH_RPC = 'search_question_bank'
const ITEM_RPC = 'get_question_bank_item'
const DIFFICULTIES = new Set(['very-easy', 'easy', 'difficult', 'very-difficult', 'challenge'])
const TYPE_TAGS = new Set([
  'word-problem', 'numeric', 'graph', 'image', 'true-false',
  'multiple-choice', 'multiple-answer', 'short-answer', 'essay'
])

function uniqueAllowed(values, allowed) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => allowed.has(value)))]
}

function requireId(value, label) {
  const id = String(value || '').trim()
  if (!id) throw new TypeError(`${label} requires an ID.`)
  return id
}

function throwProviderError(error, fallback) {
  if (!error) return
  const providerError = new Error(String(error.message || '').trim() || fallback)
  providerError.code = error.code || null
  providerError.cause = error
  throw providerError
}

function normalizePath(path) {
  return (Array.isArray(path) ? path : [])
    .map((node) => ({
      id: String(node?.id || ''),
      type: String(node?.type || ''),
      name: String(node?.name || ''),
      slug: String(node?.slug || '')
    }))
    .filter((node) => node.id && node.name)
}

function normalizePreview(item) {
  if (!item || typeof item !== 'object') return null
  const id = String(item.id || '').trim()
  if (!id) return null
  return {
    id,
    examId: String(item.examId || ''),
    examTitle: String(item.examTitle || ''),
    ownerId: String(item.ownerId || ''),
    authorName: String(item.authorName || ''),
    position: Math.max(0, Number(item.position) || 0),
    difficulty: String(item.difficulty || ''),
    questionTypeTags: uniqueAllowed(item.questionTypeTags, TYPE_TAGS),
    copiedFromQuestionId: String(item.copiedFromQuestionId || ''),
    curriculumNodeId: String(item.curriculumNodeId || ''),
    curriculumPath: normalizePath(item.curriculumPath),
    name: String(item.name || ''),
    prompt: String(item.prompt || ''),
    responseType: String(item.responseType || ''),
    points: Number(item.points) || 0,
    hasImage: Boolean(item.hasImage),
    hasGraph: Boolean(item.hasGraph),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  }
}

function normalizeItem(item) {
  const content = item?.content && typeof item.content === 'object' ? item.content : {}
  const preview = normalizePreview({
    ...item,
    name: item?.name ?? content.name,
    prompt: item?.prompt ?? content.prompt,
    responseType: item?.responseType ?? content.type,
    points: item?.points ?? content.points,
    hasImage: item?.hasImage ?? Boolean(content.imageData || String(content.type || '').includes('image')),
    hasGraph: item?.hasGraph ?? Boolean(content.graph || String(content.type || '').includes('graph'))
  })
  if (!preview) return null
  return {
    ...preview,
    content: JSON.parse(JSON.stringify(content))
  }
}

export function createSupabaseQuestionBankAdapters({ supabase } = {}) {
  if (!supabase?.auth?.getUser || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase client with auth and RPC support is required.')
  }

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser()
    throwProviderError(error, 'The signed-in user could not be verified.')
    if (!data?.user?.id) throw new Error('Sign in before using the question bank.')
    return data.user
  }

  return {
    meta: Object.freeze({ scope: 'question-bank', provider: 'supabase', contractVersion: 1 }),

    async search({
      query = '',
      curriculumNodeId = null,
      difficulties = [],
      questionTypeTags = [],
      page = 1,
      pageSize = 12
    } = {}) {
      await requireUser()
      const normalizedPage = Math.max(1, Math.trunc(Number(page) || 1))
      const normalizedPageSize = Math.min(48, Math.max(1, Math.trunc(Number(pageSize) || 12)))
      const { data, error } = await supabase.rpc(SEARCH_RPC, {
        p_query: String(query || '').trim(),
        p_curriculum_node_id: curriculumNodeId ? String(curriculumNodeId).trim() : null,
        p_difficulties: uniqueAllowed(difficulties, DIFFICULTIES),
        p_question_type_tags: uniqueAllowed(questionTypeTags, TYPE_TAGS),
        p_page: normalizedPage,
        p_page_size: normalizedPageSize
      })
      throwProviderError(error, 'The question bank could not be searched.')
      const payload = data && typeof data === 'object' ? data : {}
      return {
        page: Math.max(1, Number(payload.page) || normalizedPage),
        pageSize: Math.max(1, Number(payload.pageSize) || normalizedPageSize),
        total: Math.max(0, Number(payload.total) || 0),
        items: (Array.isArray(payload.items) ? payload.items : []).map(normalizePreview).filter(Boolean)
      }
    },

    async get(questionId) {
      await requireUser()
      const { data, error } = await supabase.rpc(ITEM_RPC, {
        p_question_id: requireId(questionId, 'Question-bank lookup')
      })
      throwProviderError(error, 'The approved question could not be loaded.')
      const item = normalizeItem(data)
      if (!item) throw new Error('The approved question could not be loaded.')
      return item
    }
  }
}

export const QUESTION_BANK_RESOURCES = Object.freeze({ searchRpc: SEARCH_RPC, itemRpc: ITEM_RPC })
export const QUESTION_BANK_DIFFICULTIES = Object.freeze([...DIFFICULTIES])
export const QUESTION_BANK_TYPE_TAGS = Object.freeze([...TYPE_TAGS])
