import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createClassroomScheduleSnapshot,
  normalizeClassroomSchedulePayload
} from '../src/app/classroom/classroom-schedule-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  migration,
  identityRepair,
  legacyRepair,
  viewerTimezone,
  interactionFollowup,
  roleParity,
  page,
  html,
  data,
  builder
] = await Promise.all([
  readText('supabase/migrations/202607230001_builder_effective_student_schedule.sql'),
  readText('supabase/migrations/202607230002_builder_retained_item_identity.sql'),
  readText('supabase/migrations/202607230003_builder_legacy_source_identity.sql'),
  readText('supabase/migrations/202607230012_student_schedule_viewer_timezone.sql'),
  readText('supabase/migrations/202607240003_classroom_schedule_interaction_followup.sql'),
  readText('supabase/migrations/202607260007_active_schedule_role_parity.sql'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/data/studentData.js'),
  readText('src/app/schedule-generator/schedule-generator.js')
])

const payload = normalizeClassroomSchedulePayload({
  schemaVersion: 1,
  courseId: 'course-a',
  activeScheduleVersionId: 'version-a',
  versionNumber: 2,
  name: 'Algebra 1',
  timeZone: 'Asia/Bangkok',
  permissions: {
    actorRole: 'student',
    canMarkSession: true,
    canMarkResource: true,
    canReverseStudied: false,
    canReverseOwnReviewedPracticed: true
  },
  items: [{
    scheduleItemId: 'item-a',
    stableItemKey: 'linear-equations',
    title: 'Linear equations',
    kind: 'curriculum_topic',
    state: 'scheduled',
    plannedDate: '2026-08-05',
    effectiveDate: '2026-07-23',
    plannedPosition: 2,
    effectivePosition: 0,
    sequenceState: 'studied',
    effectiveTimestamp: '2026-07-23T12:00:00Z',
    difficultyLevel: 'intermediate',
    progress: {
      studied: {
        marked: true,
        source: 'direct_session',
        effectiveAt: '2026-07-23T12:00:00Z',
        directTransitionEventId: 'event-a'
      }
    },
    resources: []
  }],
  featureStatus: {
    builderPublication: 'active_phase_5e4',
    effectiveSchedule: 'active_phase_5e4',
    academicSlots: 'planned_phase_5f'
  }
}, 'course-a')

assert.equal(payload.sessions[0].scheduledDate, '2026-07-23')
assert.equal(payload.sessions[0].plannedDate, '2026-08-05')
assert.equal(payload.sessions[0].sequenceState, 'studied')
assert.equal(payload.sessions[0].progress.studied.latestEventId, 'event-a')
assert.equal(payload.permissions.actorRole, 'student')
assert.equal(payload.featureStatus.effectiveSchedule, 'active_phase_5e4')
assert.equal(
  createClassroomScheduleSnapshot(payload, { generatedAt: '2026-07-23T15:00:00Z' }).snapshotId,
  'KELP-SCHEDULE-V2-VERSION-A'
)

for (const fragment of [
  'get_my_course_schedule_builder_context',
  'publish_course_builder_schedule',
  'get_my_effective_course_schedule',
  "'active_phase_5e4'",
  'expected_version_id',
  'sourceContentVersionKey',
  'effectiveTimestamp',
  'sequenceState'
]) {
  assert.ok(
    `${migration}\n${identityRepair}\n${legacyRepair}\n${data}`.includes(fragment),
    `Phase 5.E.4 is missing ${fragment}`
  )
}

assert.match(legacyRepair, /Retained legacy placeholders preserve their original missing Track identity/)
assert.match(legacyRepair, /not retained/)
assert.match(viewerTimezone, /get_my_effective_course_schedule_phase5e4/)
assert.match(viewerTimezone, /payload #>> '\{permissions,actorRole\}' = 'student'/)
assert.match(viewerTimezone, /preference\.time_zone/)
assert.match(viewerTimezone, /project_course_schedule_rows_in_time_zone/)
assert.match(interactionFollowup, /mixed Track-backed Student plans omit source-less legacy curriculum scaffolds/)
assert.match(roleParity, /one role-neutral active Course item set/)
assert.match(roleParity, /sequenceState/)
assert.match(roleParity, /get_my_effective_course_schedule_phase5g2_4_5_3_base/)
assert.doesNotMatch(roleParity, /actorRole[\s\S]*?student/)
assert.match(html, /id="classroom-schedule-edit-link"/)
assert.match(html, /id="classroom-schedule-print"/)
assert.doesNotMatch(html, /Use the controls beside each topic to record Studied, Reviewed, or Practiced work/)
assert.match(page, /handleCourseProgressAction/)
assert.match(page, /Only your Tutor or Mentor can undo this change/)
assert.match(page, /changed while this page was open/)
assert.match(builder, /createBuilderCoursePublication/)
assert.match(builder, /Publish Course Schedule/)
assert.match(data, /supabase\.rpc\('get_my_unified_course_schedule'/)
assert.doesNotMatch(data, /supabase\.rpc\('get_my_effective_course_schedule'/)
assert.match(data, /supabase\.rpc\('publish_course_builder_schedule'/)

console.log('Effective Student Schedule and governed Builder interface contracts passed.')
