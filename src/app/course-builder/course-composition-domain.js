export const COURSE_COMPOSITION_SCHEMA = 'kelp-course-composition-v1'

export const COURSE_DIFFICULTIES = Object.freeze([
  'very-easy', 'easy', 'difficult', 'very-difficult', 'challenge'
])

const DIFFICULTY_RANK = Object.freeze({
  'very-easy': 10,
  easy: 20,
  difficult: 30,
  'very-difficult': 40,
  challenge: 50
})

export function courseDifficultyRank(value) {
  return DIFFICULTY_RANK[String(value || '').trim().toLowerCase()] || 99
}

export function normalizeCoursePath(path) {
  return (Array.isArray(path) ? path : [])
    .map((node) => ({
      id: String(node?.id || '').trim(),
      type: String(node?.type || '').trim().toLowerCase(),
      name: String(node?.name || '').trim(),
      slug: String(node?.slug || '').trim()
    }))
    .filter((node) => node.id && node.name)
}

export function normalizeCourseQuestion(item) {
  if (!item || typeof item !== 'object') return null
  const id = String(item.id || '').trim()
  if (!id) return null
  return {
    id,
    position: Math.max(0, Number(item.position) || 0),
    difficulty: String(item.difficulty || '').trim().toLowerCase(),
    questionTypeTags: [...new Set((Array.isArray(item.questionTypeTags) ? item.questionTypeTags : [])
      .map((tag) => String(tag || '').trim().toLowerCase())
      .filter(Boolean))],
    name: String(item.name || '').trim(),
    prompt: String(item.prompt || '').trim(),
    responseType: String(item.responseType || '').trim(),
    points: Number(item.points) || 0,
    hasImage: Boolean(item.hasImage),
    hasGraph: Boolean(item.hasGraph),
    examId: String(item.examId || '').trim(),
    examTitle: String(item.examTitle || '').trim(),
    ownerId: String(item.ownerId || '').trim(),
    authorName: String(item.authorName || '').trim(),
    curriculumNodeId: String(item.curriculumNodeId || '').trim(),
    curriculumPath: normalizeCoursePath(item.curriculumPath),
    updatedAt: item.updatedAt || null
  }
}

export function sortCourseQuestions(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeCourseQuestion)
    .filter(Boolean)
    .sort((left, right) => (
      courseDifficultyRank(left.difficulty) - courseDifficultyRank(right.difficulty)
      || left.position - right.position
      || left.id.localeCompare(right.id)
    ))
    .map((item, position) => ({ ...item, position }))
}

export function createCourseDefinition(input = {}) {
  const id = String(input.id || '').trim()
  const title = String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  const description = String(input.description || '').trim().slice(0, 4000)
  const primaryCurriculumNodeId = String(input.primaryCurriculumNodeId || '').trim()
  const questions = sortCourseQuestions(input.questions)
  const requestedIds = Array.isArray(input.questionIds)
    ? input.questionIds.map((value) => String(value || '').trim()).filter(Boolean)
    : questions.map((question) => question.id)
  const questionIds = [...new Set(requestedIds)]
  return {
    schema: COURSE_COMPOSITION_SCHEMA,
    id,
    title,
    description,
    primaryCurriculumNodeId,
    questionIds
  }
}

export function normalizeCourseComposition(record) {
  if (!record || typeof record !== 'object') return null
  const definition = createCourseDefinition(record)
  if (!definition.id) return null
  const questions = sortCourseQuestions(record.questions)
  return {
    ...definition,
    ownerId: String(record.ownerId || '').trim(),
    curriculumPath: normalizeCoursePath(record.curriculumPath),
    status: String(record.status || 'active').trim().toLowerCase(),
    questionIds: questions.length ? questions.map((question) => question.id) : definition.questionIds,
    questions,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    archivedAt: record.archivedAt || null
  }
}

export function normalizeCourseSummary(record) {
  if (!record || typeof record !== 'object') return null
  const id = String(record.id || '').trim()
  if (!id) return null
  return {
    id,
    title: String(record.title || '').trim(),
    description: String(record.description || '').trim(),
    primaryCurriculumNodeId: String(record.primaryCurriculumNodeId || '').trim(),
    curriculumPath: normalizeCoursePath(record.curriculumPath),
    status: String(record.status || 'active').trim().toLowerCase(),
    questionCount: Math.max(0, Number(record.questionCount) || 0),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    archivedAt: record.archivedAt || null
  }
}

export function courseDifficultyCounts(items) {
  const counts = Object.fromEntries(COURSE_DIFFICULTIES.map((difficulty) => [difficulty, 0]))
  sortCourseQuestions(items).forEach((item) => {
    if (Object.hasOwn(counts, item.difficulty)) counts[item.difficulty] += 1
  })
  return counts
}
