import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCurriculumForest,
  flattenCurriculumForest,
  getAllowedChildType,
  normalizeCurriculumNode
} from '../src/app/course-builder/curriculum-domain.js'
import {
  createSupabaseCurriculumAdapters
} from '../src/app/course-builder/curriculum-supabase-adapters.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureNodes = [
  { id: 'degree-hs', node_type: 'degree', name: 'High School', status: 'active', sort_order: 10 },
  { id: 'subject-physics', parent_id: 'degree-hs', node_type: 'subject', name: 'Physics', status: 'active', sort_order: 10 },
  { id: 'track-physics', parent_id: 'subject-physics', node_type: 'track', name: 'Physics', status: 'active', sort_order: 10 },
  { id: 'topic-mechanics', parent_id: 'track-physics', node_type: 'topic', name: 'Mechanics', status: 'active', sort_order: 10 },
  { id: 'topic-kinematics', parent_id: 'topic-mechanics', node_type: 'topic', name: 'Kinematics', status: 'active', sort_order: 10 },
  { id: 'topic-motion-2d', parent_id: 'topic-kinematics', node_type: 'topic', name: 'Two-dimensional motion', status: 'active', sort_order: 10 },
  { id: 'topic-velocity', parent_id: 'topic-motion-2d', node_type: 'topic', name: 'Velocity', status: 'active', sort_order: 10 },
  { id: 'topic-archived', parent_id: 'topic-motion-2d', node_type: 'topic', name: 'Old label', status: 'archived', sort_order: 20 }
]

assert.equal(getAllowedChildType(null), 'degree')
assert.equal(getAllowedChildType({ type: 'degree' }), 'subject')
assert.equal(getAllowedChildType({ type: 'subject' }), 'track')
assert.equal(getAllowedChildType({ type: 'track' }), 'topic')
assert.equal(getAllowedChildType({ type: 'topic' }), 'topic')
assert.equal(normalizeCurriculumNode({ id: '', node_type: 'topic', name: 'No ID' }), null)

const forest = buildCurriculumForest(fixtureNodes)
const flattened = flattenCurriculumForest(forest)
assert.equal(forest.length, 1)
assert.equal(flattened.length, 7)
assert.equal(flattened.at(-1).pathLabel, 'High School / Physics / Physics / Mechanics / Kinematics / Two-dimensional motion / Velocity')
assert.equal(flattened.at(-1).depth, 6)
assert.equal(flattenCurriculumForest(buildCurriculumForest(fixtureNodes, { includeArchived: true })).length, 8)

class FakeQuery {
  constructor(rows) {
    this.rows = rows
    this.filters = []
  }

  select() { return this }
  order() { return this }
  eq(column, value) { this.filters.push([column, value]); return this }
  then(resolvePromise, rejectPromise) {
    const filtered = this.rows.filter((row) => this.filters.every(([column, value]) => row[column] === value))
    return Promise.resolve({ data: filtered, error: null }).then(resolvePromise, rejectPromise)
  }
}

const rpcCalls = []
const proposalRow = {
  id: 'proposal-1', proposer_id: 'user-1', parent_id: 'topic-mechanics',
  node_type: 'topic', name: 'Dynamics', slug: 'dynamics', description: '',
  status: 'pending', reviewer_id: null, review_notes: '', applied_node_id: null,
  submitted_at: '2026-07-18T12:00:00Z', decided_at: null, metadata: {}
}
const fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  from(table) {
    if (table === 'curriculum_nodes') return new FakeQuery(fixtureNodes)
    if (table === 'curriculum_taxonomy_proposals') return new FakeQuery([proposalRow])
    throw new Error(`Unexpected table ${table}`)
  },
  async rpc(name, args) {
    rpcCalls.push({ name, args })
    if (name === 'propose_curriculum_node') return { data: proposalRow, error: null }
    if (name === 'create_curriculum_node') {
      return { data: { ...fixtureNodes.at(-2), id: 'topic-dynamics', name: args.p_name }, error: null }
    }
    if (name === 'update_curriculum_node' || name === 'archive_curriculum_node') {
      return { data: fixtureNodes.at(-2), error: null }
    }
    if (name === 'review_curriculum_proposal') {
      return {
        data: {
          proposal: { ...proposalRow, status: args.p_decision, reviewer_id: 'admin-1', decided_at: '2026-07-18T13:00:00Z', applied_node_id: args.p_decision === 'approved' ? 'topic-dynamics' : null },
          node: args.p_decision === 'approved' ? { ...fixtureNodes.at(-2), id: 'topic-dynamics', name: 'Dynamics' } : null
        },
        error: null
      }
    }
    throw new Error(`Unexpected RPC ${name}`)
  }
}

const adapters = createSupabaseCurriculumAdapters({ supabase: fakeSupabase })
assert.equal(adapters.meta.contractVersion, 1)
assert.equal((await adapters.nodes.list()).length, 7)
assert.equal((await adapters.nodes.list({ includeArchived: true })).length, 8)
assert.equal((await adapters.proposals.list({ status: 'pending' })).length, 1)
await adapters.proposals.create({ parentId: 'topic-mechanics', nodeType: 'topic', name: 'Dynamics' })
await adapters.nodes.create({ parentId: 'topic-mechanics', nodeType: 'topic', name: 'Dynamics' })
await adapters.proposals.decide('proposal-1', { decision: 'approved', notes: 'Fits the hierarchy.' })
assert.deepEqual(rpcCalls.map(({ name }) => name), [
  'propose_curriculum_node',
  'create_curriculum_node',
  'review_curriculum_proposal'
])
assert.equal(rpcCalls[0].args.p_parent_id, 'topic-mechanics')
assert.equal(rpcCalls[2].args.p_decision, 'approved')

const [migration, html, pageJs, css, mentorHtml, adminHtml, readme] = await Promise.all([
  readFile(resolve(projectRoot, 'supabase/migrations/202607180005_curriculum_taxonomy.sql'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/course-builder.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/course-builder.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/course-builder.css'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/mentor-dashboard.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/admin-dashboard.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/course-builder/README.md'), 'utf8')
])

assert.match(migration, /create table if not exists public\.curriculum_nodes/)
assert.match(migration, /create table if not exists public\.curriculum_taxonomy_proposals/)
assert.match(migration, /parent_node\.node_type in \('track', 'topic'\) and normalized_type <> 'topic'/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'taxonomy\.propose'\)/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'taxonomy\.manage'\)/)
assert.match(migration, /Archive this node''s active children first/)
assert.match(migration, /alter table public\.curriculum_nodes enable row level security/)
assert.doesNotMatch(migration, /grant (?:insert|update|delete).*curriculum_nodes.*authenticated/i)
assert.match(html, /id="curriculum-tree"/)
assert.match(html, /id="proposal-list"/)
assert.match(pageJs, /requireCapability\(\['taxonomy\.propose', 'taxonomy\.manage'\]/)
assert.match(pageJs, /createSupabaseCurriculumAdapters/)
assert.match(css, /\.curriculum-workspace-grid/)
assert.match(mentorHtml, /href="\.\.\/course-builder\/course-builder\.html"[^>]*data-requires-capability="taxonomy\.propose"/)
assert.match(adminHtml, /href="\.\.\/course-builder\/course-builder\.html"[^>]*data-requires-capability="taxonomy\.manage"/)
assert.match(readme, /topic -> topic -> \.\.\./)

console.log('Curriculum taxonomy hierarchy, governance, adapter, and workspace self-test passed.')
