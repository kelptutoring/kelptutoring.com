import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classroomCoverageChangeState,
  courseDraftMatchesActiveVersion,
  createClassroomBuilderPreload,
  indexBuilderCatalog
} from '../src/app/schedule-generator/multi-branch-builder-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [
  html,
  javascript,
  styles,
  migration,
  timeZoneMigration,
  revisionGuardMigration,
  plan,
  guide
] = await Promise.all([
  readFile(resolve(projectRoot, 'src/app/schedule-generator/schedule-generator.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/schedule-generator/schedule-generator.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/styles/style.css'), 'utf8'),
  readFile(resolve(
    projectRoot,
    'supabase/migrations/202607260001_classroom_builder_preload_recovery.sql'
  ), 'utf8'),
  readFile(resolve(
    projectRoot,
    'supabase/migrations/202607260011_builder_student_profile_timezone.sql'
  ), 'utf8'),
  readFile(resolve(
    projectRoot,
    'supabase/migrations/202607260015_schedule_revision_track_guard.sql'
  ), 'utf8'),
  readFile(resolve(projectRoot, 'IMPLEMENTATION_PLAN.md'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/schedule-generator/README.md'), 'utf8')
])

const session = (id, version) => ({
  id,
  title: id,
  sourceContentVersionKey: version,
  type: 'lesson'
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
      tracks: [{
        id: 'physics-a',
        title: 'Physics A',
        taxonomySlug: 'physics-a',
        modules: [{
          id: 'motion',
          title: 'Motion',
          sessions: [
            session('motion-current', 'sha256:motion-v2'),
            session('motion-studied', 'sha256:studied-v1'),
            session('motion-delivered', 'sha256:delivered-v1'),
            session('motion-dropped', 'sha256:dropped-v1')
          ]
        }]
      }]
    }, {
      id: 'mathematics',
      title: 'Mathematics',
      taxonomySlug: 'mathematics',
      tracks: [{
        id: 'algebra-1',
        title: 'Algebra 1',
        taxonomySlug: 'algebra-1',
        modules: [{
          id: 'linear',
          title: 'Linear equations',
          sessions: [session('linear-current', 'sha256:linear-v1')]
        }]
      }]
    }]
  }]
}
const index = indexBuilderCatalog(catalog)
const identity = (name, slug) => ({ key: slug, name, slug })
const context = {
  course: { id: 'course-a' },
  schedule: {
    activeVersionId: 'version-8',
    versionNumber: 8,
    coverage: {
      snapshot: {
        schemaVersion: 1,
        primaryTrackKey: 'physics-a',
        branches: [{
          role: 'primary',
          educationLevel: identity('High School', 'high-school'),
          goals: [],
          subject: identity('Physics', 'physics'),
          track: identity('Physics A', 'physics-a')
        }, {
          role: 'supporting',
          educationLevel: identity('High School', 'high-school'),
          goals: [{ key: 'ap', name: 'AP', slug: 'ap' }],
          subject: identity('Mathematics', 'mathematics'),
          track: identity('Algebra 1', 'algebra-1')
        }]
      }
    },
    items: [{
      scheduleItemId: 'item-motion',
      stableItemKey: 'scheduled-motion',
      title: 'Motion foundations',
      kind: 'curriculum_topic',
      scheduledDate: '2026-08-01',
      state: 'scheduled',
      isStudied: false,
      sourceSessionKey: 'motion-current',
      sourceContentVersionKey: 'sha256:motion-v1'
    }, {
      scheduleItemId: 'item-studied',
      stableItemKey: 'scheduled-studied',
      title: 'Studied motion',
      kind: 'curriculum_topic',
      scheduledDate: '2026-07-20',
      state: 'scheduled',
      isStudied: true,
      sourceSessionKey: 'motion-studied',
      sourceContentVersionKey: 'sha256:studied-v1'
    }, {
      scheduleItemId: 'item-linear',
      stableItemKey: 'scheduled-linear',
      title: 'Linear equations',
      kind: 'curriculum_topic',
      scheduledDate: '2026-08-08',
      state: 'requeued',
      isStudied: false,
      isPracticed: true,
      sourceSessionKey: 'linear-current',
      sourceContentVersionKey: 'sha256:linear-v1'
    }, {
      scheduleItemId: 'item-delivered',
      stableItemKey: 'scheduled-delivered',
      title: 'Delivered motion',
      kind: 'curriculum_topic',
      scheduledDate: '2026-08-10',
      state: 'scheduled',
      isStudied: false,
      isPracticed: false,
      isDelivered: true,
      sourceSessionKey: 'motion-delivered',
      sourceContentVersionKey: 'sha256:delivered-v1'
    }, {
      scheduleItemId: 'item-dropped',
      stableItemKey: 'scheduled-dropped',
      title: 'Dropped motion',
      kind: 'curriculum_topic',
      scheduledDate: '2026-08-12',
      state: 'dropped',
      isStudied: false,
      isPracticed: false,
      sourceSessionKey: 'motion-dropped',
      sourceContentVersionKey: 'sha256:dropped-v1'
    }, {
      scheduleItemId: 'item-missing',
      stableItemKey: 'scheduled-missing',
      title: 'Removed waves Session',
      kind: 'curriculum_topic',
      scheduledDate: '2026-08-15',
      state: 'scheduled',
      isStudied: false,
      sourceTrackKey: 'physics-a',
      sourceModuleKey: 'motion',
      sourceModuleTitle: 'Motion',
      sourceSessionKey: 'waves-removed',
      sourceContentVersionKey: 'sha256:waves-v1'
    }]
  }
}

const preload = createClassroomBuilderPreload({
  context,
  index,
  today: '2026-07-26'
})
assert.deepEqual(preload.selectedTrackIds, ['physics-a', 'algebra-1'])
assert.deepEqual(preload.selectedSessionIds, ['motion-current', 'motion-delivered'])
assert.equal(preload.primaryTrackId, 'physics-a')
assert.equal(preload.retainedItems.length, 3)
assert.equal(preload.retainedItems[0].lockReason, 'Studied')
assert.equal(preload.retainedItems[0].retainedStatus, 'studied')
assert.equal(preload.retainedItems[1].lockReason, 'Practiced')
assert.equal(preload.retainedItems[1].retainedStatus, 'practiced')
assert.equal(preload.retainedItems[2].retainedStatus, 'dropped')
assert.equal(preload.retainedItems[2].catalogSessionId, 'motion-dropped')
assert.equal(preload.retainedItems[2].canRestore, true)
assert.equal(preload.retainedItems[2].locked, false)
assert.deepEqual(preload.retainedItems[0].academicContext, {
  educationLevel: 'High School',
  subject: 'Physics',
  academicPathways: [],
  track: 'Physics A',
  module: 'Motion'
})
assert.deepEqual(
  preload.lockedSessionIds,
  ['motion-studied', 'linear-current']
)
assert.deepEqual(preload.workedTrackIds, ['physics-a', 'algebra-1'])
assert.equal(preload.missingSourceItems.length, 1)
assert.equal(preload.missingSourceItems[0].canDropLater, true)
assert.equal(preload.missingSourceItems[0].academicContext.track, 'Physics A')
assert.equal(preload.missingSourceItems[0].academicContext.module, 'Motion')
assert.equal(preload.sourceUpdates.length, 1)
assert.equal(preload.sourceUpdates[0].latestVersionKey, 'sha256:motion-v2')
assert.equal(preload.sourceUpdates[0].academicContext.subject, 'Physics')
assert.equal(preload.sourceUpdates[0].academicContext.track, 'Physics A')
assert.equal(preload.scheduledSessionIdsBySourceId['motion-current'], 'scheduled-motion')
assert.equal(preload.scheduledSessionIdsBySourceId['motion-delivered'], 'scheduled-delivered')
assert.equal(preload.scheduledSessionIdsBySourceId['motion-dropped'], 'scheduled-dropped')

assert.equal(courseDraftMatchesActiveVersion({
  courseId: 'course-a',
  baseActiveVersionId: 'version-8'
}, {
  courseId: 'course-a',
  activeVersionId: 'version-8'
}), true)
assert.equal(courseDraftMatchesActiveVersion({
  courseId: 'course-a',
  baseActiveVersionId: 'version-7'
}, {
  courseId: 'course-a',
  activeVersionId: 'version-8'
}), false)

const boundary = classroomCoverageChangeState({
  preload,
  selectedTrackIds: preload.selectedTrackIds,
  selectedSessionIds: preload.selectedSessionIds,
  primaryTrackId: preload.primaryTrackId
})
assert.equal(boundary.requiresGovernedPublisher, true)
assert.ok(boundary.reasons.includes('existing_multi_branch'))
assert.ok(boundary.reasons.includes('track_source_update'))
assert.ok(boundary.reasons.includes('missing_future_source'))

for (const fragment of [
  'courseBuilderRecovery',
  'courseBuilderRecoveryToggle',
  'courseBuilderRecoveryCollapse',
  'courseBuilderRecoveryList',
  'courseBuilderStaleDraft',
  'coursePublishBoundaryNotice',
  'scheduleActionDialog',
  'restoreCurrentPlanBtn'
]) {
  assert.ok(html.includes(fragment), `The Classroom preload interface is missing ${fragment}.`)
}
assert.match(html, /class="course-builder-recovery is-collapsed hidden"/)
assert.match(html, /aria-expanded="false"[\s\S]*>Maximize<\/button>/)
for (const fragment of [
  'createClassroomBuilderPreload',
  'courseDraftMatchesActiveVersion',
  'baseActiveVersionId',
  'scheduledSessionIdsBySourceId',
  'Add content from another Track',
  'updateCoursePublishBoundary',
  'confirmScheduleAction',
  'setCourseBuilderRecoveryExpanded',
  'reconcileBuilderTrackSelection',
  'renderAfterTrackRemoval',
  'preserveViewportAfterLayout',
  'builderAcademicContextLabel',
  'generator-session-academic-context',
  'classifyBuilderSessionStatus',
  'is-restorable-dropped',
  'Previous version',
  'Restore on publish',
  'entries.length === 0 && !courseEditor',
  'Add a Track',
  'restoreCurrentCoursePlan',
  'localStorage.removeItem(builderDraftKey)',
  'resetTrackWork()',
  'scheduledSessionIdsBySourceId'
]) {
  assert.ok(javascript.includes(fragment), `The Classroom preload flow is missing ${fragment}.`)
}
assert.doesNotMatch(javascript, /window\.confirm/)
assert.match(styles, /\.course-builder-recovery/)
assert.match(styles, /\.course-builder-recovery\.is-collapsed \.course-builder-recovery-collapse/)
assert.match(styles, /\.course-builder-recovery-item\.is-studied/)
assert.match(styles, /\.course-builder-recovery-item\.is-practiced/)
assert.match(styles, /\.course-builder-recovery-item\.is-dropped/)
assert.match(styles, /\.course-builder-recovery-item\.is-retained/)
assert.match(styles, /\.course-builder-recovery-context/)
assert.match(styles, /\.generator-week-card\.is-retained/)
assert.match(styles, /\.generator-week-card\[data-session-status="studied"\]/)
assert.match(styles, /\.generator-week-card\[data-session-status="practiced"\]/)
assert.match(styles, /\.generator-week-card\[data-session-status="dropped"\]/)
assert.match(styles, /\.generator-week-card\[data-session-status="restored"\]/)
assert.match(styles, /\.generator-week-card\.is-restorable-dropped/)
assert.match(styles, /\.generator-week-card\.is-inherited/)
assert.match(styles, /\.generator-session-academic-context/)
assert.match(styles, /\.schedule-action-dialog/)
assert.match(styles, /@media \(max-width: 520px\)[\s\S]*course-builder-recovery-item/)
for (const fragment of [
  "'coverage'",
  "'isDelivered'",
  "'sourceSessionKey'",
  "'canDraftMultipleTracks', true",
  "'canPublishMultipleTracks', false"
]) {
  assert.ok(migration.includes(fragment), `The preload RPC is missing ${fragment}.`)
}
for (const fragment of [
  "'schemaVersion', 4",
  "'studentTimeZone'",
  'preferences.time_zone',
  'preferences.user_id = course.student_id',
  "'canPublishMultipleTracks', true",
  "'courseScopeLocked', false"
]) {
  assert.ok(
    timeZoneMigration.includes(fragment),
    `The governed Student timezone follow-up is missing ${fragment}.`
  )
}
for (const fragment of [
  "'isPracticed'",
  'course_session_practiced_aggregation',
  'course_schedule_track_has_worked_progress',
  'Studied or Practiced work cannot be removed',
  "'{context,revisionMode}' = 'new_schedule'"
]) {
  assert.ok(
    revisionGuardMigration.includes(fragment),
    `The governed Track revision guard is missing ${fragment}.`
  )
}
assert.match(plan, /5\.G\.2\.4\.3\.2 .*Classroom preloading, recovery, and responsive traversal/i)
assert.match(guide, /Classroom preloading/i)

console.log(
  'Phase 5.G.2.4.3.2 Classroom coverage preload, retained-source recovery, stale-draft rejection, identity preservation, and staged publication contracts passed.'
)
