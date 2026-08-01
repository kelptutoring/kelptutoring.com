import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classroomScheduleAcademicPath,
  classroomScheduleCoverageMetadata,
  deriveClassroomTrackProgress,
  classroomScheduleModuleStyle,
  classroomSchedulePdfStyle,
  createClassroomScheduleSnapshot,
  groupClassroomScheduleSessions,
  normalizeCanonicalClassroomSchedulePayload,
  normalizeClassroomSchedulePayload
} from '../src/app/classroom/classroom-schedule-contract.js'
import {
  normalizeClassroomCurrentScheduleLogPayload
} from '../src/app/classroom/classroom-history-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  html, page, styles, data, migration, migrationFix, interactionFollowup,
  trackProgressMigration, staffExplanationFollowup, studentStudiedHoldMigration,
  presentationParityMigration
] = await Promise.all([
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('src/data/studentData.js'),
  readText('supabase/migrations/202607240001_classroom_schedule_module_presentation.sql'),
  readText('supabase/migrations/202607240002_classroom_schedule_module_presentation_fix.sql'),
  readText('supabase/migrations/202607240003_classroom_schedule_interaction_followup.sql'),
  readText('supabase/migrations/202607240006_classroom_home_track_progress.sql'),
  readText('supabase/migrations/202607300005_staff_progress_explanations_and_schedule_log.sql'),
  readText('supabase/migrations/202607300008_student_studied_class_hold.sql'),
  readText('supabase/migrations/202607310001_calendar_pdf_presentation_parity.sql')
])

const payload = normalizeClassroomSchedulePayload({
  schemaVersion: 1,
  courseId: 'course-a',
  activeScheduleVersionId: 'version-a',
  sessions: [{
    scheduleItemId: 'item-a',
    stableItemKey: 'algebra-linear-equations',
    title: 'Linear equations',
    kind: 'curriculum_topic',
    state: 'scheduled',
    scheduledDate: '2026-07-29',
    endDate: '2026-07-29',
    position: 0,
    difficultyLevel: 'intermediate',
    source: {
      moduleKey: 'algebra-foundations',
      moduleTitle: 'Module 1: Algebraic Foundations',
      planningHref: '../tracks/algebra/linear-equations.html'
    },
    resources: [{
      id: 'resource-a',
      title: 'OpenStax practice',
      requirementState: 'required',
      href: 'https://example.test/openstax',
      position: 0
    }]
  }],
  featureStatus: {
    sessionResourceIdentity: 'active_phase_5e1',
    progressLedger: 'active_phase_5e2',
    hierarchicalAggregation: 'planned_phase_5e3',
    effectiveSchedule: 'planned_phase_5e4'
  },
  moduleStyles: {
    'algebra-foundations': {
      headerColor: '#5b8def',
      stripeColor: '#8b6fc0',
      templateName: 'Custom'
    }
  },
  pdfStyle: {
    ruleColor: '#224466',
    textColor: '#112233'
  },
  permissions: {
    canCustomizeModuleStyle: true,
    canCustomizePdfStyle: true
  }
}, 'course-a')

assert.equal(payload.sessions.length, 1)
assert.equal(payload.sessions[0].difficultyLevel, 'intermediate')
assert.equal(payload.sessions[0].moduleTitle, 'Module 1: Algebraic Foundations')
assert.equal(payload.sessions[0].resources[0].requirementState, 'required')
assert.equal(payload.permissions.canCustomizeModuleStyle, true)
assert.equal(payload.permissions.canCustomizePdfStyle, true)
assert.equal(payload.moduleStyles['algebra-foundations'].headerColor, '#5b8def')
assert.equal(payload.pdfStyle.ruleColor, '#224466')
assert.deepEqual(deriveClassroomTrackProgress(payload.sessions), {
  eligibleSessionCount: 1,
  studiedCount: 0,
  reviewedCount: 0,
  practicedCount: 0,
  completedUnitCount: 0,
  totalUnitCount: 2,
  percent: 0,
  reviewedAffectsPercent: false
})
assert.ok(Object.isFrozen(payload))
assert.ok(Object.isFrozen(payload.sessions))
assert.deepEqual(
  groupClassroomScheduleSessions(payload.sessions).map((group) => group.moduleTitle),
  ['Module 1: Algebraic Foundations']
)
assert.deepEqual(
  groupClassroomScheduleSessions([{
    scheduleItemId: 'unnumbered-a',
    moduleKey: 'foundations',
    moduleTitle: 'Foundations',
    modulePresentationKey: 'foundations'
  }]).map((group) => ({
    number: group.moduleNumber,
    title: group.moduleTitle
  })),
  [{ number: 1, title: 'Module 1: Foundations' }]
)
const interleavedGroups = groupClassroomScheduleSessions([
  {
    scheduleItemId: 'physics-motion-a',
    moduleKey: 'module-1',
    moduleTitle: 'Module 1: Motion',
    modulePresentationKey: 'physics--module-1',
    presentation: { branchKey: 'physics', modulePresentationKey: 'physics--module-1' },
    academicBranch: {
      branchKey: 'physics',
      track: { id: 'physics', name: 'Physics' }
    }
  },
  {
    scheduleItemId: 'algebra-linear',
    moduleKey: 'module-3',
    moduleTitle: 'Module 3: Linear Modeling',
    modulePresentationKey: 'algebra-1--module-3',
    presentation: {
      branchKey: 'algebra-1',
      modulePresentationKey: 'algebra-1--module-3'
    },
    academicBranch: {
      branchKey: 'algebra-1',
      track: { id: 'algebra-1', name: 'Algebra 1' }
    }
  },
  {
    scheduleItemId: 'physics-motion-b',
    moduleKey: 'module-1',
    moduleTitle: 'Module 1: Motion',
    modulePresentationKey: 'physics--module-1',
    presentation: { branchKey: 'physics', modulePresentationKey: 'physics--module-1' },
    academicBranch: {
      branchKey: 'physics',
      track: { id: 'physics', name: 'Physics' }
    }
  }
])
assert.deepEqual(
  interleavedGroups.map((group) => group.moduleTitle),
  [
    'Physics · Module 1: Motion',
    'Algebra 1 · Module 3: Linear Modeling',
    'Physics · Module 1: Motion — continued'
  ]
)
assert.equal(interleavedGroups[2].isContinuation, true)
assert.equal(interleavedGroups[2].segmentIndex, 2)
assert.equal(interleavedGroups[2].moduleNumber, 1)
const branchSession = {
  academicBranch: {
    displayLabel: 'High School \u00b7 AP \u00b7 Physics \u00b7 Mechanics',
    educationLevel: { name: 'High School' },
    academicPathways: [{ name: 'AP' }],
    subject: { name: 'Physics' },
    track: { name: 'Mechanics' }
  }
}
assert.equal(
  classroomScheduleAcademicPath(branchSession),
  'High School \u00b7 AP \u00b7 Physics \u00b7 Mechanics'
)
assert.deepEqual(
  classroomScheduleCoverageMetadata({
    displayLabel: 'High School \u00b7 Physics \u00b7 Mechanics + High School \u00b7 Mathematics \u00b7 Algebra 1',
    branches: [
      {
        educationLevel: { name: 'High School' },
        subject: { name: 'Physics' },
        track: { name: 'Mechanics' }
      },
      {
        educationLevel: { name: 'High School' },
        subject: { name: 'Mathematics' },
        track: { name: 'Algebra 1' }
      }
    ]
  }),
  {
    educationLevel: 'High School',
    subject: 'Physics + Mathematics',
    coverage: 'High School \u00b7 Physics \u00b7 Mechanics + High School \u00b7 Mathematics \u00b7 Algebra 1',
    trackCount: 2
  }
)
assert.equal(
  classroomScheduleModuleStyle(payload.moduleStyles, 'algebra-foundations').stripeColor,
  '#8b6fc0'
)
assert.equal(classroomSchedulePdfStyle(payload.pdfStyle).textColor, '#112233')
assert.ok(Object.hasOwn(createClassroomScheduleSnapshot(payload), 'coverage'))
assert.throws(
  () => normalizeClassroomSchedulePayload({
    courseId: 'course-a',
    activeScheduleVersionId: 'version-a'
  }, 'course-b'),
  /incomplete/
)

const canonicalPayload = normalizeCanonicalClassroomSchedulePayload({
  schemaVersion: 2,
  contract: {
    name: 'course_schedule_read',
    phase: '5.G.1',
    version: 1,
    asOf: '2026-07-24T15:00:00.000Z'
  },
  course: {
    id: 'course-a',
    serviceModel: 'recurring'
  },
  viewer: {
    actorRole: 'student',
    viewMode: 'student'
  },
  schedule: {
    activeVersionId: 'version-a',
    versionNumber: 3,
    name: 'Algebra plan',
    timeZone: 'America/Sao_Paulo'
  },
  context: {
    provider: { serviceModel: 'recurring' },
    academicContext: {
      educationLevel: { name: 'High School', slug: 'high-school' }
    }
  },
  academicTrack: {
    layoutMode: 'modules',
    activeScheduleVersionId: 'version-a',
    versionNumber: 3,
    items: [{
      scheduleItemId: 'item-a',
      title: 'Linear equations',
      kind: 'curriculum_topic',
      state: 'scheduled',
      scheduledDate: '2026-07-29',
      position: 0
    }],
    trackProgress: {
      eligibleSessionCount: 1,
      studiedCount: 0,
      practicedCount: 0
    },
    studentStudiedHold: {
      active: true,
      academicSlotId: 'slot-a',
      startsAt: '2026-07-24T18:00:00Z',
      localDate: '2026-07-24',
      localStartTime: '15:00',
      durationMinutes: 60,
      timeZone: 'America/Sao_Paulo',
      lockWindowHours: 6,
      message:
        'Your next class begins within six hours, so its lesson plan is locked. You can mark this topic as Studied after the class.'
    },
    moduleStyles: {},
    pdfStyle: {}
  },
  groups: {
    past: [],
    next: [{ rowId: 'timeline-a', presentationState: 'planned' }],
    upcoming: []
  },
  permissions: {
    canReadDetailedAcademicTrack: true,
    canMarkSession: true
  },
  calendarPolicy: {
    assignmentDeadlinesAreIndependent: true
  },
  meetingStatePolicy: {
    lockWindowHours: 6
  }
}, 'course-a')

assert.equal(canonicalPayload.readContract.name, 'course_schedule_read')
assert.equal(canonicalPayload.readContract.version, 1)
assert.equal(canonicalPayload.permissions.actorRole, 'student')
assert.equal(canonicalPayload.sessions.length, 1)
assert.equal(canonicalPayload.studentStudiedHold.active, true)
assert.equal(canonicalPayload.studentStudiedHold.academicSlotId, 'slot-a')
assert.match(canonicalPayload.studentStudiedHold.message, /within six hours/)
assert.equal(canonicalPayload.timeline.next[0].presentationState, 'planned')
assert.equal(canonicalPayload.calendarPolicy.assignmentDeadlinesAreIndependent, true)
assert.equal(canonicalPayload.meetingStatePolicy.lockWindowHours, 6)
assert.throws(
  () => normalizeCanonicalClassroomSchedulePayload({
    contract: { name: 'course_schedule_read', version: 1 },
    course: { id: 'course-a' },
    academicTrack: { layoutMode: 'higher_level_timeline' },
    permissions: { canReadDetailedAcademicTrack: false }
  }, 'course-a'),
  /detailed Classroom Schedule is not available/
)

assert.match(html, /data-classroom-area="schedule" data-availability="available"/)
assert.match(html, /id="classroom-space-schedule-view"/)
assert.match(html, /id="classroom-schedule-view-coverage"/)
assert.match(html, /id="classroom-schedule-studied-hold"/)
assert.match(html, /id="classroom-schedule-session-list"/)
assert.match(html, /id="classroom-schedule-log-toggle"/)
assert.match(html, /id="classroom-current-schedule-log"/)
assert.match(html, /id="classroom-current-schedule-log-list"/)
assert.match(html, /classroom-schedule-module-list/)
assert.ok(html.indexOf('id="classroom-schedule-progress-feedback"') > html.indexOf('id="classroom-schedule-session-list"'))
assert.match(html, /id="classroom-schedule-print-document"/)
assert.match(html, /id="classroom-schedule-pdf-style"/)
assert.match(html, /<summary>Colors<\/summary>/)
assert.doesNotMatch(html, />PDF colors</)
assert.match(html, /id="classroom-space-home"/)
assert.match(html, /id="classroom-track-progress-percent"/)
assert.match(html, /id="classroom-progress-confirm-dialog"/)
assert.match(html, /id="classroom-progress-reason-dialog"/)
assert.match(html, /id="classroom-progress-reason"/)
assert.match(html, /minlength="10"/)
assert.match(html, /maxlength="500"/)
assert.doesNotMatch(html, /Active Course plan|One effective plan combines/)
assert.match(page, /getClassroomScheduleData/)
assert.match(page, /loadClassroomSchedule/)
assert.match(page, /renderClassroomSchedule/)
assert.match(page, /renderClassroomScheduleCoverage/)
assert.match(page, /payload\.studentStudiedHold\?\.active/)
assert.match(page, /dataset\.classHoldBlocked = 'true'/)
assert.match(
  page,
  /kind === 'studied'[\s\S]*?currentSchedule\?\.studentStudiedHold\?\.active === true/
)
assert.match(page, /Primary Track:/)
assert.match(page, /Supporting .*Track/)
assert.match(page, /createScheduleSessionActions/)
assert.match(page, /createScheduleModuleSection/)
assert.match(page, /saveClassroomScheduleModuleStyle/)
assert.match(page, /saveClassroomSchedulePdfStyle/)
assert.match(page, /applyScheduleWebStyle/)
assert.match(page, /Schedule colors were saved/)
assert.match(page, /closeScheduleStylePopoversOutside/)
assert.match(
  page,
  /\.classroom-schedule-pdf-style\[open\][\s\S]*?\.classroom-track-progress-help\[open\]/
)
assert.match(page, /document\.startViewTransition/)
assert.match(page, /renderClassroomHomeProgress/)
assert.match(page, /confirmStudiedProgress/)
assert.match(page, /requestAcademicReason/)
assert.match(page, /await requestAcademicReason/)
assert.match(
  page,
  /action === 'mark'[\s\S]*kind === 'studied'[\s\S]*\(role === 'tutor' \|\| role === 'mentor'\)[\s\S]*requestAcademicReason/
)
assert.doesNotMatch(
  page,
  /\(role === 'tutor' \|\| role === 'mentor'\)[\s\S]{0,100}sequenceState !== 'next'/
)
assert.match(page, /loadCurrentScheduleLog/)
assert.match(page, /renderCurrentScheduleLog/)
assert.match(page, /createCurrentScheduleLogEntry/)
assert.match(page, /data-schedule-progress-feedback/)
assert.doesNotMatch(page, /\$\{titleCase\(kind\)\} was (?:recorded|unmarked)\./)
assert.doesNotMatch(page, /window\.prompt\(/)
assert.match(page, /formatProgressDate/)
assert.match(page, /setAttribute\('aria-pressed', String\(marked\)\)/)
assert.doesNotMatch(page, /This is the next expected Course topic|This topic remains in the upcoming Course plan/)
assert.match(page, /error \? 6000 : 2000/)
assert.match(page, /View resources/)
assert.match(page, /elements\.classroomSpaceScheduleView\.hidden = !isSchedule/)
assert.match(styles, /\.classroom-schedule-session-list/)
assert.match(styles, /\.classroom-schedule-module-header/)
assert.match(styles, /\.classroom-schedule-module-style-panel/)
assert.match(styles, /\.classroom-schedule-pdf-style-panel/)
assert.match(styles, /\.classroom-schedule-edit-link\s*\{[\s\S]*?display:\s*inline-flex/)
assert.match(styles, /\.classroom-schedule-view-coverage/)
assert.match(styles, /\.classroom-schedule-studied-hold/)
assert.match(
  styles,
  /\.classroom-schedule-progress-button\[data-class-hold-blocked="true"\]/
)
assert.match(styles, /\.classroom-schedule-session/)
assert.match(styles, /\.classroom-schedule-progress-controls/)
assert.match(styles, /\.classroom-schedule-row-feedback/)
assert.match(styles, /\.classroom-progress-reason-dialog textarea/)
assert.match(
  styles,
  /\.classroom-progress-confirm-dialog\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0[\s\S]*?margin:\s*auto/
)
assert.match(styles, /\.classroom-schedule-progress-feedback\s*\{[\s\S]*?position:\s*absolute[\s\S]*?border:\s*0/)
assert.match(styles, /\.classroom-schedule-session\[data-sequence-state="studied"\]/)
assert.match(
  styles,
  /\.classroom-schedule-session\[data-sequence-state="studied"\]\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--schedule-module-stripe\)/s
)
assert.match(styles, /\.classroom-schedule-progress-button\[aria-pressed="true"\]/)
assert.match(styles, /\.classroom-track-progress-bar/)
assert.match(styles, /\.classroom-schedule-progress-date/)
assert.match(styles, /\.classroom-current-schedule-log-list/)
assert.match(styles, /\.classroom-current-schedule-log-entry/)
assert.match(styles, /::view-transition-new\(classroom-schedule-modules\)/)
assert.match(styles, /\.classroom-schedule-print-document/)
assert.match(styles, /\.classroom-schedule-print-module-title/)
assert.match(styles, /\.classroom-schedule-print-row\s*\{[\s\S]*?align-items:\s*center/)
assert.match(styles, /\.classroom-schedule-print-row\s*\{[\s\S]*?border:\s*0/)
assert.match(styles, /\.classroom-schedule-print-checklist/)
assert.match(styles, /\.classroom-schedule-print-badges/)
assert.match(styles, /\.classroom-schedule-print-academic-path/)
assert.match(page, /classroomScheduleAcademicPath\(session\)/)
assert.match(page, /classroomScheduleCoverageMetadata\(snapshot\.coverage/)
assert.match(html, /<dt>Coverage<\/dt>/)
assert.match(styles, /--schedule-pdf-rule/)
assert.match(styles, /--schedule-pdf-text/)
assert.match(styles, /--schedule-web-rule/)
assert.match(styles, /--schedule-web-text/)
assert.match(styles, /@media \(max-width: 560px\)/)
assert.match(data, /supabase\.rpc\('get_my_unified_course_schedule'/)
assert.match(data, /get_my_current_course_schedule_log/)
assert.doesNotMatch(data, /supabase\.rpc\('get_my_effective_course_schedule'/)
assert.match(data, /normalizeCanonicalClassroomSchedulePayload\(data, courseId\)/)
assert.match(presentationParityMigration, /itemAcademicPresentation/)
assert.match(presentationParityMigration, /courseLifecycleCoveragePresentation/)
assert.match(presentationParityMigration, /course_schedule_module_presentation_key/)
assert.match(data, /refreshCanonicalClassroomScheduleAfterSavedChange\(courseId\)/)
assert.match(data, /Your change was saved, but the latest Schedule could not be loaded/)
assert.match(page, /throwOnError = false/)
assert.match(page, /changeSaved = true/)
assert.match(data, /supabase\.rpc\('save_my_classroom_schedule_module_style'/)
assert.match(data, /supabase\.rpc\('save_my_classroom_schedule_pdf_style'/)
assert.match(migration, /schedule_module_styles jsonb not null default '\{\}'::jsonb/)
assert.match(migration, /save_my_classroom_schedule_module_style/)
assert.match(migration, /sourceModuleTitle/)
assert.match(migration, /A retained Classroom Membership is required/)
assert.match(migration, /target_classroom_id uuid/)
assert.doesNotMatch(migration, /preference\.classroom_id = classroom_id/)
assert.match(migrationFix, /create or replace function public\.get_my_effective_course_schedule/)
assert.match(migrationFix, /create or replace function public\.save_my_classroom_schedule_module_style/)
assert.match(migrationFix, /preference\.classroom_id = target_classroom_id/)
assert.match(interactionFollowup, /drop constraint if exists course_schedule_target_mapping_version_signature_key/)
assert.match(interactionFollowup, /schedule_pdf_style jsonb not null/)
assert.match(interactionFollowup, /save_my_classroom_schedule_pdf_style/)
assert.match(interactionFollowup, /mixed Track-backed Student plans omit source-less legacy curriculum scaffolds/)
assert.match(trackProgressMigration, /eligibleSessionCount/)
assert.match(trackProgressMigration, /studiedCount/)
assert.match(trackProgressMigration, /practicedCount/)
assert.match(trackProgressMigration, /reviewedAffectsPercent/)
assert.match(trackProgressMigration, /active_phase_5h_home/)
assert.match(
  staffExplanationFollowup,
  /get_my_current_course_schedule_log/
)
assert.match(
  studentStudiedHoldMigration,
  /course_schedule_student_studied_hold/
)
assert.match(
  studentStudiedHoldMigration,
  /block_student_studied_during_class_hold/
)
assert.match(
  studentStudiedHoldMigration,
  /\{academicTrack,studentStudiedHold\}/
)

const currentScheduleLog = normalizeClassroomCurrentScheduleLogPayload({
  schemaVersion: 1,
  courseId: 'course-a',
  activeScheduleVersionId: 'version-a',
  scheduleVersionNumber: 4,
  scheduleName: 'Algebra plan',
  timeZone: 'America/Sao_Paulo',
  permissions: {
    actorRole: 'student',
    canReadCurrentScheduleLog: true,
    canReadPrivateStaffNotes: false
  },
  entries: [{
    entryId: 'event-a',
    entryKind: 'progress',
    action: 'marked',
    progressKind: 'studied',
    stableItemKey: 'linear-equations',
    sourceSessionKey: 'track-session:linear-equations',
    title: 'Linear equations',
    studentExplanation: 'The Tutor confirmed this topic during guided work.',
    actorName: 'Tutor Example',
    actorRole: 'tutor',
    recordedAt: '2026-07-30T12:00:00Z'
  }]
}, 'course-a')
assert.equal(currentScheduleLog.entries.length, 1)
assert.equal(
  currentScheduleLog.entries[0].studentExplanation,
  'The Tutor confirmed this topic during guided work.'
)
assert.equal(
  currentScheduleLog.permissions.canReadPrivateStaffNotes,
  false
)

console.log('Canonical Classroom Schedule consumer and surface self-test passed.')
