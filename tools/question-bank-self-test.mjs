import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createSupabaseQuestionBankAdapters } from '../src/app/course-builder/question-bank-adapters.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const curriculumNodeId = '10000000-0000-4000-8000-000000000032'
const rpcCalls = []
const preview = {
  id: 'question-approved-1',
  examId: 'exam-approved-1',
  examTitle: 'Mechanics checkpoint',
  ownerId: 'author-1',
  authorName: 'Tutor Example',
  position: 0,
  difficulty: 'easy',
  questionTypeTags: ['word-problem', 'numeric'],
  copiedFromQuestionId: '',
  curriculumNodeId,
  curriculumPath: [
    { id: 'degree-1', type: 'degree', name: 'High School', slug: 'high-school' },
    { id: curriculumNodeId, type: 'topic', name: 'Mechanics', slug: 'mechanics' }
  ],
  name: 'Average velocity',
  prompt: 'Calculate the average velocity.',
  responseType: 'numeric',
  points: 2,
  hasImage: false,
  hasGraph: true,
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T13:00:00Z'
}

const fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'mentor-1' } }, error: null }) },
  async rpc(name, args) {
    rpcCalls.push({ name, args })
    if (name === 'search_question_bank') {
      return { data: { page: 1, pageSize: 12, total: 1, items: [preview] }, error: null }
    }
    if (name === 'get_question_bank_item') {
      return {
        data: {
          ...preview,
          content: {
            id: preview.id,
            type: 'numeric',
            name: preview.name,
            prompt: preview.prompt,
            points: 2,
            numericExpectedAnswer: '12',
            questionTypeTags: preview.questionTypeTags,
            curriculumNodeIds: [curriculumNodeId],
            primaryCurriculumNodeId: curriculumNodeId
          }
        },
        error: null
      }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  }
}

const adapters = createSupabaseQuestionBankAdapters({ supabase: fakeSupabase })
const result = await adapters.search({
  query: 'velocity',
  curriculumNodeId,
  difficulties: ['easy', 'UNSUPPORTED'],
  questionTypeTags: ['NUMERIC', 'numeric'],
  page: 1,
  pageSize: 12
})
assert.equal(result.total, 1)
assert.equal(result.items[0].id, preview.id)
assert.deepEqual(result.items[0].questionTypeTags, ['word-problem', 'numeric'])
assert.deepEqual(rpcCalls[0], {
  name: 'search_question_bank',
  args: {
    p_query: 'velocity',
    p_curriculum_node_id: curriculumNodeId,
    p_difficulties: ['easy'],
    p_question_type_tags: ['numeric'],
    p_page: 1,
    p_page_size: 12
  }
})
const item = await adapters.get(preview.id)
assert.equal(item.content.numericExpectedAnswer, '12')
assert.equal(item.responseType, 'numeric')
assert.equal(rpcCalls[1].name, 'get_question_bank_item')

const contractSource = await readFile(resolve(projectRoot, 'src/app/exam-builder/exam-contract.js'), 'utf8')
vm.runInThisContext(contractSource)
const contract = globalThis.KelpExamContract
const bundle = contract.buildPersistenceBundle({
  id: 'exam-classified-1',
  title: 'Classified exam',
  questions: [{
    id: 'question-classified-1',
    type: 'numeric',
    prompt: 'Find x.',
    difficulty: 'easy',
    classificationStatus: 'proposed',
    questionTypeTags: ['numeric', 'word-problem', 'numeric'],
    curriculumNodeIds: [curriculumNodeId],
    primaryCurriculumNodeId: curriculumNodeId
  }]
})
assert.deepEqual(bundle.questions[0].questionTypeTags, ['numeric', 'word-problem'])
assert.deepEqual(bundle.questions[0].curriculumNodeIds, [curriculumNodeId])
assert.equal(bundle.questions[0].primaryCurriculumNodeId, curriculumNodeId)
assert.equal(bundle.questions[0].content.primaryCurriculumNodeId, curriculumNodeId)
const restored = contract.restoreDefinitionFromBundle(bundle)
assert.deepEqual(restored.questions[0].questionTypeTags, ['numeric', 'word-problem'])
assert.equal(restored.questions[0].primaryCurriculumNodeId, curriculumNodeId)

const [migration, html, pageJs, css, builderHtml, builderJs, reviewJs, mentorHtml, adminHtml, authorization] = await Promise.all([
  readFile(resolve(projectRoot, 'supabase/migrations/202607180006_question_bank.sql'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/question-bank.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/question-bank.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/question-bank.css'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/exam-builder/exam-builder.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/exam-builder/exam-builder.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/exam-builder/exam-review.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/mentor-dashboard.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/admin-dashboard.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/authorization.js'), 'utf8')
])

assert.match(migration, /create table if not exists public\.exam_question_curriculum_links/)
assert.match(migration, /create or replace function public\.search_question_bank/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'question_bank\.read'\)/)
assert.match(migration, /order by difficulty_order, updated_at desc, id/)
assert.match(migration, /exam\.review_status = 'approved'/)
assert.match(migration, /exam\.visibility = 'public'/)
assert.match(migration, /question\.classification_status = 'reviewed'/)
assert.match(migration, /Assign every question to a curriculum track or topic before review or publication/)
assert.match(html, /id="question-bank-filter-form"/)
assert.match(html, /id="question-bank-results"/)
assert.match(pageJs, /requireCapability\(\['question_bank\.read'\]\)/)
assert.match(pageJs, /createSupabaseQuestionBankAdapters/)
assert.match(css, /\.question-bank-results/)
assert.match(builderHtml, /data-field="primaryCurriculumNodeId"/)
assert.match(builderHtml, /data-question-type-tag/)
assert.match(builderJs, /normalizeQuestionBankTypeTags/)
assert.match(reviewJs, /Question-bank classification/)
assert.match(mentorHtml, /question-bank\.html"[^>]*data-requires-capability="question_bank\.read"/)
assert.match(adminHtml, /question-bank\.html"[^>]*data-requires-capability="question_bank\.read"/)
assert.match(authorization, /'question_bank\.read'/)

console.log('Question-bank contract, adapter, classification, retrieval UI, and authorization self-test passed.')
