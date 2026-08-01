import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createClassroomHistorySessionIndex,
  createClassroomHistorySessionKeySet,
  groupClassroomAuditChanges,
  groupCurrentScheduleLogEntries,
  normalizeClassroomLearningHistoryPayload,
  normalizeClassroomScheduleAuditPayload,
  normalizeClassroomCurrentScheduleLogPayload
} from '../src/app/classroom/classroom-history-contract.js'
import { getClassroomArea } from '../src/app/classroom/classroom-space-navigation.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  migration,
  resourceMigration,
  auditMigration,
  auditReasonMigration,
  databaseTest,
  acceptanceRunner,
  dataSource,
  page,
  html,
  styles,
  unavailablePage,
  unavailableScript
] = await Promise.all([
  readText('supabase/migrations/202607260008_course_learning_history.sql'),
  readText('supabase/migrations/202607260010_course_learning_history_resources.sql'),
  readText('supabase/migrations/202607260016_course_schedule_audit_history.sql'),
  readText('supabase/migrations/202607260017_course_schedule_audit_publication_reasons.sql'),
  readText('tools/course-schedule-qualification-publication-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('src/data/studentData.js'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.css'),
  readText('src/app/classroom/classroom-session.html'),
  readText('src/app/classroom/classroom-session.js')
])

const catalog = {
  levels: [{
    subjects: [{
      tracks: [{
        modules: [{
          sessions: [{
            id: 'session-available',
            sourceSessionId: 'session-available',
            planningHref: '../schedules/example.html'
          }]
        }]
      }]
    }]
  }]
}
assert.equal(
  createClassroomHistorySessionIndex(catalog).get('session-available').planningHref,
  '../schedules/example.html'
)
assert.deepEqual(
  [...createClassroomHistorySessionKeySet(catalog)],
  ['session-available']
)

const history = normalizeClassroomLearningHistoryPayload({
  schemaVersion: 1,
  courseId: 'course-a',
  activeScheduleVersionId: 'version-3',
  permissions: {
    actorRole: 'student',
    canReadLearningHistory: true
  },
  versions: [{
    scheduleVersionId: 'version-2',
    versionNumber: 2,
    name: 'Former Physics plan',
    timeZone: 'America/Sao_Paulo',
    coverageLabel: 'High School · Physics',
    items: [{
      stableItemKey: 'worked-session',
      title: 'Standing waves',
      sourceSessionKey: 'session-available',
      sourceTrackSlug: 'waves-and-sound',
      lastWorkedAt: '2026-07-25T15:00:00Z',
      progress: { studied: true, reviewed: true, practiced: false },
      resources: [{
        stableResourceKey: 'standing-waves-ixl',
        title: 'IXL standing waves practice',
        requirementState: 'required',
        position: 0,
        progress: { studied: true, practiced: true }
      }]
    }, {
      stableItemKey: 'missing-source-session',
      title: 'Removed source page',
      sourceSessionKey: 'session-unavailable',
      lastWorkedAt: '2026-07-24T15:00:00Z',
      progress: { studied: true }
    }, {
      stableItemKey: 'reviewed-only-session',
      title: 'Reviewed but not worked',
      sourceSessionKey: 'session-reviewed-only',
      lastWorkedAt: '2026-07-23T15:00:00Z',
      progress: { reviewed: true }
    }]
  }, {
    scheduleVersionId: 'version-1',
    versionNumber: 1,
    name: 'Legacy duplicate plan',
    items: [{
      stableItemKey: 'legacy-key-for-worked-session',
      title: 'Standing waves',
      sourceSessionKey: 'session-available',
      lastWorkedAt: '2026-07-20T15:00:00Z',
      progress: { studied: true }
    }]
  }]
}, 'course-a', catalog)

assert.equal(history.summary.workedSessionCount, 2)
assert.equal(history.summary.studiedCount, 2)
assert.equal(history.summary.reviewedCount, 1)
assert.equal(history.summary.practicedCount, 0)
assert.equal(history.summary.scheduleVersionCount, 1)
assert.equal(history.versions.length, 1)
assert.equal(history.versions[0].items[0].stableItemKey, 'worked-session')
assert.equal(history.versions[0].items[0].progress.reviewed, true)
assert.equal(history.versions[0].items[0].sourceAvailable, true)
assert.equal(history.versions[0].items[0].planningHref, '../schedules/example.html')
assert.equal(history.versions[0].items[0].resources.length, 1)
assert.equal(history.versions[0].items[0].resources[0].progress.practiced, true)
assert.equal(history.versions[0].items[1].stableItemKey, 'missing-source-session')
assert.equal(history.versions[0].items[1].sourceAvailable, false)
assert.equal(
  history.versions[0].items.some((item) => item.stableItemKey === 'reviewed-only-session'),
  false
)
assert.equal(history.historyPolicy.activeScheduleProgressExcluded, true)
assert.equal(history.historyPolicy.droppedItemsExcluded, true)
assert.equal(history.historyPolicy.unavailableSourcesExcluded, false)
assert.equal(history.historyPolicy.unavailableSourcesRetained, true)
assert.ok(Object.isFrozen(history))
assert.ok(Object.isFrozen(history.versions[0].items[0].progress))
assert.equal(getClassroomArea('history').availability, 'available')

const audit = normalizeClassroomScheduleAuditPayload({
  schemaVersion: 1,
  courseId: 'course-a',
  activeScheduleVersionId: 'version-3',
  course: {
    title: 'Physics course',
    status: 'active',
    studentName: 'Student Example',
    tutorName: 'Tutor Example'
  },
  permissions: {
    actorRole: 'mentor',
    canReadScheduleAudit: true,
    canReadPrivateStaffNotes: true,
    canPrintScheduleAudit: true
  },
  versions: [{
    scheduleVersionId: 'version-3',
    versionNumber: 3,
    name: 'Physics plan',
    status: 'active',
    coverageLabel: 'High School · Physics · Mechanics',
    items: [{
      stableItemKey: 'forces',
      title: 'Forces and interactions',
      state: 'scheduled',
      position: 0
    }],
    changes: [{
      stableItemKey: 'forces',
      changeType: 'restored',
      reasonCode: 'curriculum_adjustment',
      reasonLabel: 'Curriculum adjustment',
      studentExplanation: 'The Session returned after the plan was reviewed.',
      privateStaffNote: 'Restored by the supervising Mentor.',
      actorName: 'Mentor Example',
      createdAt: '2026-07-26T15:00:00Z',
      publicationBoundary: true
    }, {
      stableItemKey: 'waves',
      changeType: 'dropped',
      reasonCode: 'curriculum_adjustment',
      reasonLabel: 'Curriculum adjustment',
      studentExplanation: 'The Session returned after the plan was reviewed.',
      actorName: 'Mentor Example',
      createdAt: '2026-07-26T15:00:00Z',
      publicationBoundary: true
    }]
  }]
}, 'course-a')
assert.equal(audit.summary.versionCount, 1)
assert.equal(audit.summary.changeCount, 2)
assert.equal(audit.versions[0].changes[0].changeType, 'restored')
assert.equal(
  audit.versions[0].changes[0].privateStaffNote,
  'Restored by the supervising Mentor.'
)
assert.equal(audit.permissions.canPrintScheduleAudit, true)
assert.ok(Object.isFrozen(audit.versions[0].changes))
assert.equal(audit.versions[0].changes[0].publicationBoundary, true)

const groupedAuditChanges = groupClassroomAuditChanges(
  audit.versions[0].changes
)
assert.equal(groupedAuditChanges.actionGroups.length, 2)
assert.equal(groupedAuditChanges.actionGroups[0].action, 'restored')
assert.equal(groupedAuditChanges.actionGroups[1].action, 'dropped')
assert.equal(
  groupedAuditChanges.studentExplanation,
  'The Session returned after the plan was reviewed.'
)

const currentScheduleLog = normalizeClassroomCurrentScheduleLogPayload({
  schemaVersion: 1,
  courseId: 'course-a',
  activeScheduleVersionId: 'version-3',
  scheduleVersionNumber: 3,
  scheduleName: 'Physics plan',
  timeZone: 'America/Sao_Paulo',
  permissions: {
    actorRole: 'student',
    canReadCurrentScheduleLog: true
  },
  entries: [{
    entryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:1',
    entryKind: 'structure',
    action: 'included',
    stableItemKey: 'forces',
    sourceSessionKey: 'forces-session',
    title: 'Forces and interactions',
    reasonLabel: 'Curriculum adjustment',
    studentExplanation: 'The plan now includes the requested mechanics work.',
    actorUserId: 'mentor-a',
    actorName: 'Mentor Example',
    actorRole: 'mentor',
    recordedAt: '2026-07-26T15:00:01Z'
  }, {
    entryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:2',
    entryKind: 'structure',
    action: 'included',
    stableItemKey: 'energy',
    sourceSessionKey: 'energy-session',
    title: 'Energy conservation',
    reasonLabel: 'Curriculum adjustment',
    studentExplanation: 'The plan now includes the requested mechanics work.',
    actorUserId: 'mentor-a',
    actorName: 'Mentor Example',
    actorRole: 'mentor',
    recordedAt: '2026-07-26T15:00:01Z'
  }, {
    entryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:3',
    entryKind: 'structure',
    action: 'dropped',
    stableItemKey: 'waves',
    sourceSessionKey: 'waves-session',
    title: 'Standing waves',
    reasonLabel: 'Curriculum adjustment',
    studentExplanation: 'The plan now includes the requested mechanics work.',
    actorUserId: 'mentor-a',
    actorName: 'Mentor Example',
    actorRole: 'mentor',
    recordedAt: '2026-07-26T15:00:01Z'
  }, {
    entryId: 'progress-a',
    entryKind: 'progress',
    action: 'marked',
    progressKind: 'studied',
    stableItemKey: 'forces',
    sourceSessionKey: 'forces-session',
    title: 'Forces and interactions',
    actorName: 'Student Example',
    actorRole: 'student',
    recordedAt: '2026-07-26T14:00:00Z'
  }]
}, 'course-a')
const groupedScheduleLog = groupCurrentScheduleLogEntries(
  currentScheduleLog.entries
)
assert.equal(groupedScheduleLog.length, 2)
assert.equal(groupedScheduleLog[0].groupKind, 'structure')
assert.equal(groupedScheduleLog[0].entries.length, 3)
assert.equal(groupedScheduleLog[0].actionGroups.length, 2)
assert.equal(groupedScheduleLog[0].actionGroups[0].entries.length, 2)
assert.equal(groupedScheduleLog[0].actionGroups[1].action, 'dropped')
assert.equal(
  groupedScheduleLog[0].studentExplanation,
  'The plan now includes the requested mechanics work.'
)
assert.equal(groupedScheduleLog[1].groupKind, 'progress')
assert.ok(Object.isFrozen(groupedScheduleLog[0].actionGroups))

for (const fragment of [
  'get_my_course_learning_history',
  'active_session_keys',
  'event.source_session_key',
  'latest_session_states',
  'item.item_state <> \'dropped\'',
  "'activeScheduleProgressExcluded', true"
]) {
  assert.ok(migration.includes(fragment), `Learning-history migration is missing ${fragment}.`)
}
for (const fragment of [
  'course_historical_session_progress',
  'stableResourceKey',
  'unavailableSourcesRetained',
  'resourceProgressRetained',
  "'schemaVersion', 2"
]) {
  assert.ok(
    resourceMigration.includes(fragment),
    `Learning-history resource migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'get_my_course_learning_history_progress_base',
  "'workedProgressKinds'",
  "'reviewedOnlySessionsExcluded', true",
  'get_my_course_schedule_audit_history',
  'current_user_can_oversee_course_outcomes',
  "'canReadPrivateStaffNotes', true",
  "'canPrintScheduleAudit', true",
  "'studentAccess', false",
  'to service_role'
]) {
  assert.ok(
    auditMigration.includes(fragment),
    `Schedule audit-history migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'course_schedule_builder_publish_commands',
  "builder_request_payload -> 'changeReasons'",
  "'publicationBoundary', true",
  "'builderPublicationReasonsIncluded', true",
  "version.version_payload ->> 'changeCount'"
]) {
  assert.ok(
    auditReasonMigration.includes(fragment),
    `Schedule audit publication-reason migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'Student learning history did not isolate worked Sessions from the superseded Schedule',
  'The Student history did not retain only Studied or Practiced Sessions',
  'Expected Student Schedule-audit access to fail',
  'Expected outsider Schedule-audit access to fail',
  'The assigned Tutor did not receive printable Schedule audit history',
  'The Mentor did not receive the complete printable Schedule audit history',
  'The Quality Assistant did not receive printable Schedule audit history'
]) {
  assert.ok(databaseTest.includes(fragment), `Learning-history DB coverage is missing ${fragment}.`)
}
assert.match(
  acceptanceRunner,
  /course-schedule-qualification-publication-db-self-test\.sql[\s\S]*?admin_id:\s*'ACT-ADMIN'/,
  'The DB runner must provide the administrator used for rollback-only Quality access.'
)
assert.match(dataSource, /getClassroomLearningHistoryData/)
assert.match(dataSource, /get_my_course_learning_history/)
assert.match(dataSource, /getClassroomScheduleAuditData/)
assert.match(dataSource, /get_my_course_schedule_audit_history/)
assert.match(page, /loadClassroomHistory/)
assert.match(page, /createClassroomHistoryVersion/)
assert.match(page, /createClassroomHistorySession/)
assert.match(page, /classroom-history-version-toggle/)
assert.match(page, /classroom-history-report-card/)
assert.match(page, /setExpanded\(false\)/)
assert.match(page, /Report Cards will be added in Phase 13/)
assert.match(page, /classroomHistorySessionHref/)
assert.match(page, /renderClassroomScheduleAudit/)
assert.match(page, /createClassroomAuditVersion/)
assert.match(page, /printClassroomScheduleAudit/)
assert.match(page, /groupCurrentScheduleLogEntries/)
assert.match(page, /classroom-current-schedule-log-update/)
assert.match(page, /classroom-current-schedule-log-action-group/)
assert.match(page, /groupClassroomAuditChanges/)
assert.match(page, /formatScheduleHistoryTimestamp/)
assert.match(page, /second:\s*'2-digit'/)
assert.match(page, /waitForAuditPrintLayout/)
assert.match(page, /requestAnimationFrame\(resolve\)/)
assert.match(html, /data-classroom-area="history" data-availability="available"/)
assert.match(html, /id="classroom-space-history"/)
assert.match(html, /previous Course Schedules remain here/i)
assert.match(html, /Version numbers may skip/)
assert.match(html, /id="classroom-history-audit"/)
assert.match(html, /id="classroom-history-audit-print"/)
assert.match(html, /id="classroom-audit-print-document"/)
assert.match(styles, /\.classroom-history-version-list/)
assert.match(styles, /\.classroom-history-session-list/)
assert.match(styles, /\.classroom-history-version-toggle/)
assert.match(styles, /\.classroom-history-version-body\s*\{[\s\S]*?grid-template-rows:\s*0fr/)
assert.match(styles, /\.classroom-history-audit/)
assert.match(styles, /\.classroom-audit-change-list/)
assert.match(styles, /body\.is-printing-classroom-audit/)
assert.match(styles, /\.classroom-current-schedule-log-update summary/)
assert.match(styles, /\.classroom-audit-print-version\s*\{[\s\S]*?break-inside:\s*auto/)
assert.match(styles, /\.classroom-audit-print-changes li,[\s\S]*?break-inside:\s*avoid/)
assert.match(styles, /\.classroom-history-version\.is-expanded \.classroom-history-version-body/)
assert.match(unavailablePage, /This content is unavailable/)
assert.match(unavailableScript, /safeReturnPath/)
assert.match(unavailableScript, /getClassroomLearningHistoryData/)

console.log(
  'Course learning-history projection, unavailable-source retention, Student History controls, and privacy contracts passed.'
)
