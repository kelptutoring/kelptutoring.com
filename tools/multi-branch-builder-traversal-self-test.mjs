import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MULTI_BRANCH_DRAFT_SCHEMA_VERSION,
  classifyBuilderModulePresentationStatuses,
  classifyBuilderModuleStatus,
  classifyBuilderRetainedItemStatus,
  classifyBuilderSessionStatus,
  classifyCourseScheduleRevision,
  courseScheduleTrackRemovalState,
  createReusablePlanCoverage,
  createSelectionTrayEntries,
  groupSubjectTracksByPathway,
  indexBuilderCatalog,
  normalizeBuilderDraftSelection,
  reconcileBuilderTrackSelection
} from '../src/app/schedule-generator/multi-branch-builder-contract.js'
import '../src/data/tracks-data.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [html, javascript, styles, plan, builderGuide] = await Promise.all([
  readFile(resolve(projectRoot, 'src/app/schedule-generator/schedule-generator.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/schedule-generator/schedule-generator.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/styles/style.css'), 'utf8'),
  readFile(resolve(projectRoot, 'IMPLEMENTATION_PLAN.md'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/schedule-generator/README.md'), 'utf8')
])

const session = (id) => ({ id, title: id, sourceContentVersionKey: `sha256:${id}` })
const track = (id, title, sessions, academicPathway = null) => ({
  id,
  title,
  taxonomySlug: id,
  academicPathway,
  modules: [{ id: `${id}-module`, title: `${title} module`, sessions }]
})
const catalog = {
  schemaVersion: 2,
  levels: [{
    id: 'high-school',
    title: 'High School',
    taxonomySlug: 'high-school',
    subjects: [{
      id: 'physics',
      title: 'Physics',
      taxonomySlug: 'physics',
      tracks: [
        track('physics-a', 'Physics A', [session('regular-motion')]),
        track('ap-physics-1', 'AP Physics 1', [session('ap-motion')], 'AP')
      ]
    }, {
      id: 'mathematics',
      title: 'Mathematics',
      taxonomySlug: 'mathematics',
      tracks: [track('algebra-1', 'Algebra 1', [session('linear-equations')])]
    }]
  }, {
    id: 'college',
    title: 'College',
    taxonomySlug: 'college',
    subjects: [{
      id: 'college-physics',
      title: 'Physics',
      taxonomySlug: 'physics',
      tracks: [track('university-mechanics', 'University Mechanics', [session('lagrangian-motion')])]
    }]
  }]
}

const index = indexBuilderCatalog(catalog)
assert.equal(index.branches.length, 4)
assert.equal(index.sessionsById.size, 4)

const physicsGroups = groupSubjectTracksByPathway(index, {
  levelId: 'high-school',
  subjectId: 'physics'
})
assert.deepEqual(physicsGroups.map((group) => group.title), ['Regular', 'AP'])
assert.equal(physicsGroups[0].inferred, true)
assert.equal(physicsGroups[1].inferred, false)

const migrated = normalizeBuilderDraftSelection({
  schemaVersion: 1,
  levelId: 'high-school',
  subjectId: 'physics',
  selectedTrackIds: ['physics-a', 'missing-track', 'ap-physics-1'],
  selectedSessionIds: ['regular-motion', 'ap-motion', 'lagrangian-motion']
}, index)
assert.equal(migrated.schemaVersion, MULTI_BRANCH_DRAFT_SCHEMA_VERSION)
assert.equal(migrated.migratedFromSchemaVersion, 1)
assert.deepEqual(migrated.selectedTrackIds, ['physics-a', 'ap-physics-1'])
assert.deepEqual(migrated.selectedSessionIds, ['regular-motion', 'ap-motion'])
assert.equal(migrated.primaryTrackId, 'physics-a')

const tray = createSelectionTrayEntries({
  index,
  selectedTrackIds: ['algebra-1', 'ap-physics-1', 'university-mechanics'],
  selectedSessionIds: ['ap-motion', 'linear-equations'],
  primaryTrackId: 'ap-physics-1'
})
assert.deepEqual(tray.map((entry) => entry.role), ['primary', 'supporting', 'supporting'])
assert.deepEqual(
  tray.map((entry) => entry.track.id),
  ['ap-physics-1', 'algebra-1', 'university-mechanics']
)
assert.deepEqual(tray.map((entry) => entry.sessionCount), [1, 1, 0])
assert.equal(tray[2].includedInCoverage, false)

assert.equal(classifyBuilderRetainedItemStatus({
  isStudied: true,
  state: 'dropped'
}), 'studied')
assert.equal(classifyBuilderRetainedItemStatus({
  isDelivered: true,
  state: 'dropped'
}), 'delivered')
assert.equal(classifyBuilderRetainedItemStatus({ state: 'dropped' }), 'dropped')
assert.equal(classifyBuilderRetainedItemStatus({ lockReason: 'Past' }), 'past')
assert.equal(classifyBuilderRetainedItemStatus({ locked: true }), 'retained')
assert.equal(classifyBuilderSessionStatus({
  sessionId: 'a',
  selectedSessionIds: ['a'],
  retainedItems: [{ catalogSessionId: 'a', retainedStatus: 'studied' }]
}), 'studied')
assert.equal(classifyBuilderSessionStatus({
  sessionId: 'a',
  selectedSessionIds: ['a'],
  retainedItems: [],
  sourceUpdateSessionIds: ['a']
}), 'updated')
assert.equal(classifyBuilderSessionStatus({
  sessionId: 'a',
  selectedSessionIds: [],
  retainedItems: [{ catalogSessionId: 'a', retainedStatus: 'dropped' }]
}), 'dropped')
assert.equal(classifyBuilderSessionStatus({
  sessionId: 'a',
  selectedSessionIds: ['a'],
  retainedItems: [{ catalogSessionId: 'a', retainedStatus: 'dropped' }]
}), 'restored')
assert.equal(classifyBuilderSessionStatus({
  sessionId: 'a',
  selectedSessionIds: ['a'],
  retainedItems: [],
  inheritedSessionIds: ['a']
}), 'inherited')
assert.equal(classifyBuilderSessionStatus({
  sessionId: 'a',
  selectedSessionIds: ['a'],
  retainedItems: [],
  inheritedSessionIds: []
}), 'selected')

assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: [],
  retainedItems: [{ catalogSessionId: 'a', lockReason: 'Studied' }]
}), 'studied')
assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: [],
  retainedItems: [{ catalogSessionId: 'a', lockReason: 'Dropped' }]
}), 'dropped')
assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: [],
  retainedItems: [
    { catalogSessionId: 'a', lockReason: 'Studied' },
    { catalogSessionId: 'b', lockReason: 'Dropped' }
  ]
}), 'mixed')
assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: ['b'],
  retainedItems: []
}), 'selected')
assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: [],
  retainedItems: [],
  sourceUpdateSessionIds: ['a']
}), 'selected')
assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: ['a'],
  retainedItems: [],
  inheritedSessionIds: ['a']
}), 'selected')
assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: ['a'],
  retainedItems: [{ catalogSessionId: 'a', retainedStatus: 'dropped' }]
}), 'selected')
assert.equal(classifyBuilderModuleStatus({
  sessionIds: ['a', 'b'],
  selectedSessionIds: [],
  retainedItems: []
}), 'none')
assert.deepEqual(classifyBuilderModulePresentationStatuses({
  sessionIds: ['a', 'b', 'c', 'd'],
  selectedSessionIds: ['c', 'd'],
  retainedItems: [
    { catalogSessionId: 'a', retainedStatus: 'studied' },
    { catalogSessionId: 'b', retainedStatus: 'dropped' }
  ],
  inheritedSessionIds: ['c']
}), ['studied', 'dropped', 'former', 'recent'])

assert.equal(classifyCourseScheduleRevision({
  activeTrackIds: ['algebra-1', 'ap-physics-1'],
  selectedTrackIds: ['algebra-1', 'ap-physics-1', 'university-mechanics'],
  activeSessionIds: ['old-a', 'old-b'],
  selectedSessionIds: ['new-c']
}), 'incremental')
assert.equal(classifyCourseScheduleRevision({
  activeTrackIds: ['algebra-1', 'ap-physics-1'],
  selectedTrackIds: ['ap-physics-1', 'university-mechanics'],
  activeSessionIds: ['old-a', 'old-b'],
  selectedSessionIds: ['old-b']
}), 'incremental', 'Dropping an untouched Track remains an ordinary revision.')
assert.equal(classifyCourseScheduleRevision({
  activeTrackIds: ['algebra-1', 'ap-physics-1'],
  selectedTrackIds: ['university-mechanics'],
  activeSessionIds: ['old-a', 'old-b'],
  selectedSessionIds: ['new-c']
}), 'replacement', 'Replacing every active Track starts a new Schedule.')
assert.equal(classifyCourseScheduleRevision({
  activeSessionIds: ['old-a', 'old-b'],
  selectedSessionIds: ['old-b', 'new-c']
}), 'incremental', 'Legacy Session-only callers remain supported.')

assert.deepEqual(courseScheduleTrackRemovalState({
  trackId: 'algebra-1',
  selectedTrackIds: ['algebra-1', 'ap-physics-1'],
  activeTrackIds: ['algebra-1', 'ap-physics-1'],
  workedTrackIds: ['algebra-1']
}), {
  trackId: 'algebra-1',
  isSelected: true,
  belongsToActiveSchedule: true,
  hasWorkedProgress: true,
  action: 'start_new_schedule'
})
assert.equal(courseScheduleTrackRemovalState({
  trackId: 'ap-physics-1',
  selectedTrackIds: ['algebra-1', 'ap-physics-1'],
  activeTrackIds: ['algebra-1', 'ap-physics-1'],
  workedTrackIds: ['algebra-1']
}).action, 'remove')
assert.equal(courseScheduleTrackRemovalState({
  trackId: 'university-mechanics',
  selectedTrackIds: ['algebra-1', 'university-mechanics'],
  activeTrackIds: ['algebra-1'],
  workedTrackIds: ['algebra-1']
}).action, 'remove')

const coverage = createReusablePlanCoverage({
  index,
  selectedTrackIds: ['algebra-1', 'ap-physics-1', 'university-mechanics'],
  selectedSessionIds: ['ap-motion', 'linear-equations'],
  primaryTrackId: 'ap-physics-1'
})
assert.equal(coverage.schemaVersion, 2)
assert.equal(coverage.branches.length, 2)
assert.equal(coverage.branches[0].academicPathways[0].name, 'AP')
assert.deepEqual(coverage.branches[1].academicPathways, [])
assert.equal(coverage.branches[1].subject.name, 'Mathematics')

const replacement = reconcileBuilderTrackSelection({
  index,
  selectedTrackIds: ['ap-physics-1'],
  selectedSessionIds: ['linear-equations', 'ap-motion'],
  primaryTrackId: 'ap-physics-1',
  activeTrackId: 'ap-physics-1'
})
assert.deepEqual(replacement.selectedTrackIds, ['ap-physics-1'])
assert.deepEqual(replacement.selectedSessionIds, ['ap-motion'])
assert.equal(replacement.primaryTrackId, 'ap-physics-1')
assert.equal(replacement.activeTrackId, 'ap-physics-1')
assert.equal(replacement.activeTrackIndex, 0)

assert.throws(
  () => createReusablePlanCoverage({
    index,
    selectedTrackIds: ['ap-physics-1', 'algebra-1'],
    selectedSessionIds: ['linear-equations'],
    primaryTrackId: 'ap-physics-1'
  }),
  /primary Track must contain/
)

const governedIndex = indexBuilderCatalog(globalThis.tracksCatalog)
const wavesBranch = governedIndex.branches.find(
  (branch) =>
    branch.subject.taxonomySlug === 'physics'
    && branch.track.taxonomySlug === 'waves-and-sound'
)
assert.ok(wavesBranch, 'The governed Builder catalogue must expose Physics > Waves and sound.')
const wavesSessionId = wavesBranch.track.source.modules[0].sessions[0].id
const wavesCoverage = createReusablePlanCoverage({
  index: governedIndex,
  selectedTrackIds: [wavesBranch.track.id],
  selectedSessionIds: [wavesSessionId],
  primaryTrackId: wavesBranch.track.id
})
assert.equal(wavesCoverage.primaryTrackKey, wavesBranch.track.id)
assert.equal(wavesCoverage.branches.length, 1)
assert.equal(wavesCoverage.branches[0].role, 'primary')
assert.equal(wavesCoverage.branches[0].subject.slug, 'physics')
assert.equal(wavesCoverage.branches[0].track.slug, 'waves-and-sound')

for (const fragment of [
  'selectionTray',
  'selectionTrayList',
  'addContentBranchBtn',
  'pathwayFilters'
]) {
  assert.ok(html.includes(fragment), `The Builder HTML is missing ${fragment}.`)
}
for (const fragment of [
  'indexBuilderCatalog',
  'groupSubjectTracksByPathway',
  'createSelectionTrayEntries',
  'createReusablePlanCoverage',
  'reconcileBuilderTrackSelection',
  'classifyBuilderRetainedItemStatus',
  'classifyBuilderSessionStatus',
  'classifyBuilderModulePresentationStatuses',
  'classifyBuilderModuleStatus',
  'classifyCourseScheduleRevision',
  'courseScheduleTrackRemovalState',
  'primaryTrackId',
  'renderSelectionTray'
]) {
  assert.ok(javascript.includes(fragment), `The Builder traversal is missing ${fragment}.`)
}
assert.match(styles, /\.builder-selection-tray/)
assert.match(styles, /\.pathway-filter-list/)
assert.match(styles, /\.week-preview-module\[data-session-status="studied"\]/)
assert.match(styles, /\.week-preview-module\[data-session-status="dropped"\]/)
assert.match(styles, /\.week-preview-module\[data-session-status="mixed"\]/)
assert.match(styles, /\.week-preview-module\[data-session-status="selected"\]/)
assert.match(styles, /\.week-preview-module\[data-session-presentation\]/)
assert.match(javascript, /linear-gradient\(90deg/)
assert.match(styles, /\.generator-week-card\[data-session-status="studied"\]/)
assert.match(styles, /\.generator-week-card\[data-session-status="dropped"\]/)
assert.match(styles, /\.generator-week-card\[data-session-status="delivered"\]/)
assert.match(styles, /\.generator-week-card\[data-session-status="inherited"\]/)
assert.match(styles, /\.generator-week-card\[data-session-status="restored"\]/)
assert.match(styles, /\.generator-week-card\.is-restorable-dropped/)
assert.match(javascript, /Previous version/)
assert.match(javascript, /Restore on publish/)
assert.match(plan, /5\.G\.2\.4\.3\.1 .*Subject-first multi-branch selection/i)
assert.match(builderGuide, /Subject-first multi-branch/i)

console.log(
  'Phase 5.G.2.4.3.1 subject-first pathways, cross-Subject/level selection, primary Track, tray, and draft migration contracts passed.'
)
