import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COURSE_COMPOSITION_SCHEMA,
  courseDifficultyCounts,
  createCourseDefinition,
  normalizeCourseComposition,
  sortCourseQuestions
} from '../src/app/course-builder/course-composition-domain.js'
import { createSupabaseCourseCompositionAdapters } from '../src/app/course-builder/course-composition-adapters.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const courseId = '20000000-0000-4000-8000-000000000001'
const curriculumNodeId = '10000000-0000-4000-8000-000000000023'
const questions = [
  { id: 'q-challenge', position: 0, difficulty: 'challenge', prompt: 'Challenge', points: 5, curriculumNodeId },
  { id: 'q-easy', position: 1, difficulty: 'easy', prompt: 'Easy', points: 2, curriculumNodeId },
  { id: 'q-very-easy', position: 2, difficulty: 'very-easy', prompt: 'Very easy', points: 1, curriculumNodeId }
]

const sorted = sortCourseQuestions(questions)
assert.deepEqual(sorted.map((question) => question.id), ['q-very-easy', 'q-easy', 'q-challenge'])
assert.deepEqual(courseDifficultyCounts(sorted), {
  'very-easy': 1,
  easy: 1,
  difficult: 0,
  'very-difficult': 0,
  challenge: 1
})

const definition = createCourseDefinition({
  id: courseId,
  title: '  Mechanics   progression ',
  description: 'Reusable practice.',
  primaryCurriculumNodeId: curriculumNodeId,
  questionIds: ['q-challenge', 'q-easy', 'q-challenge', 'q-very-easy']
})
assert.equal(definition.schema, COURSE_COMPOSITION_SCHEMA)
assert.equal(definition.title, 'Mechanics progression')
assert.deepEqual(definition.questionIds, ['q-challenge', 'q-easy', 'q-very-easy'])

const record = {
  ...definition,
  ownerId: 'mentor-1',
  status: 'active',
  curriculumPath: [{ id: curriculumNodeId, type: 'track', name: 'Physics' }],
  questions,
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T13:00:00Z'
}
assert.deepEqual(normalizeCourseComposition(record).questionIds, ['q-very-easy', 'q-easy', 'q-challenge'])

const rpcCalls = []
const fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'mentor-1' } }, error: null }) },
  async rpc(name, args) {
    rpcCalls.push({ name, args })
    if (name === 'list_my_course_compositions') {
      return { data: [{ ...record, questionCount: 3 }], error: null }
    }
    if (name === 'delete_course_composition') {
      return { data: { id: args.p_course_id, deleted: true }, error: null }
    }
    return { data: record, error: null }
  }
}

const adapters = createSupabaseCourseCompositionAdapters({ supabase: fakeSupabase })
assert.equal((await adapters.save(definition)).id, courseId)
assert.equal((await adapters.list()).length, 1)
assert.equal((await adapters.load(courseId)).questions[0].id, 'q-very-easy')
assert.equal((await adapters.duplicate(courseId)).id, courseId)
assert.equal((await adapters.archive(courseId)).status, 'active')
assert.deepEqual(await adapters.remove(courseId), { id: courseId, deleted: true })
assert.deepEqual(rpcCalls.map((call) => call.name), [
  'save_course_composition',
  'list_my_course_compositions',
  'get_my_course_composition',
  'duplicate_course_composition',
  'archive_course_composition',
  'delete_course_composition'
])
assert.deepEqual(rpcCalls[0].args.p_definition.questionIds, definition.questionIds)

const [migration, html, pageJs, css, mentorHtml, adminHtml, authorization, readme] = await Promise.all([
  readFile(resolve(projectRoot, 'supabase/migrations/202607180007_course_composition.sql'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/course-composer.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/course-composer.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/course-composer.css'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/mentor-dashboard.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/admin-dashboard.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/authorization.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/README.md'), 'utf8')
])

assert.match(migration, /create table if not exists public\.course_compositions/)
assert.match(migration, /create table if not exists public\.course_composition_items/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'course\.compose'\)/)
assert.match(migration, /Every course item must be an approved question beneath the selected curriculum path/)
assert.match(migration, /course_question_difficulty_rank\(question\.difficulty\)/)
assert.match(migration, /create or replace function public\.duplicate_course_composition/)
assert.match(migration, /Archive the course draft before deleting it/)
assert.doesNotMatch(migration, /schedule_id|session_id|assignment_id/)
assert.match(html, /id="course-curriculum-cascade"/)
assert.match(html, /id="course-selection-modal"/)
assert.match(html, /id="course-drafts-modal"/)
assert.match(pageJs, /requireCapability\(\['course\.compose', 'course\.assign', 'question_bank\.read'\]\)/)
assert.match(pageJs, /sortCourseQuestions/)
assert.match(css, /\.course-composer-workspace/)
assert.match(mentorHtml, /course-composer\.html"[^>]*data-requires-capability="course\.compose"/)
assert.match(adminHtml, /course-composer\.html"[^>]*data-requires-capability="course\.compose"/)
assert.match(authorization, /'course\.compose'/)
assert.match(readme, /Phase 6/)

console.log('Course-composition domain, adapter, authorization, workflow, and phase-boundary self-test passed.')
