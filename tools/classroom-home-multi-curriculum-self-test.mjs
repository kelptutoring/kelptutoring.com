import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeCanonicalClassroomSchedulePayload } from '../src/app/classroom/classroom-schedule-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, followup, html, page, styles, runner] = await Promise.all([
  readText('supabase/migrations/202607260005_classroom_home_multi_curriculum.sql'),
  readText('supabase/migrations/202607260006_schedule_experience_followup.sql'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('tools/local-supabase-acceptance.mjs')
])

const payload = normalizeCanonicalClassroomSchedulePayload({
  schemaVersion: 2,
  contract: {
    name: 'course_schedule_read',
    phase: '5.G.2.4.5.2',
    version: 1,
    asOf: '2026-07-26T15:00:00.000Z'
  },
  course: { id: 'course-home', serviceModel: 'recurring' },
  viewer: { actorRole: 'student', viewMode: 'student' },
  schedule: {
    activeVersionId: 'version-active',
    versionNumber: 4,
    name: 'Physics and Algebra plan',
    timeZone: 'America/Sao_Paulo'
  },
  context: {
    provider: { serviceModel: 'recurring' },
    academicContext: {}
  },
  academicTrack: {
    layoutMode: 'modules',
    activeScheduleVersionId: 'version-active',
    versionNumber: 4,
    coverage: {
      schemaVersion: 1,
      versionId: 'version-active',
      primaryTrackKey: 'physics',
      displayLabel: 'High School · AP · Physics · Mechanics + Algebra 1',
      branchCount: 2,
      branches: [{
        branchKey: 'physics',
        role: 'primary',
        displayLabel: 'High School · AP · Physics · Mechanics',
        educationLevel: { id: 'hs', name: 'High School' },
        academicPathways: [{ id: 'ap', name: 'AP' }],
        subject: { id: 'physics-subject', name: 'Physics' },
        track: { id: 'physics', name: 'Mechanics' }
      }, {
        branchKey: 'algebra',
        role: 'supporting',
        displayLabel: 'High School · Mathematics · Algebra 1',
        educationLevel: { id: 'hs', name: 'High School' },
        academicPathways: [],
        subject: { id: 'math-subject', name: 'Mathematics' },
        track: { id: 'algebra', name: 'Algebra 1' }
      }]
    },
    items: [{
      scheduleItemId: 'item-physics',
      title: 'Motion',
      kind: 'curriculum_topic',
      state: 'scheduled',
      sequenceState: 'studied',
      effectiveDate: '2026-07-28',
      scheduledDate: '2026-07-28',
      position: 0,
      moduleKey: 'module-1',
      moduleTitle: 'Module 1: Motion',
      presentation: {
        branchKey: 'physics',
        moduleKey: 'module-1',
        moduleTitle: 'Module 1: Motion',
        modulePresentationKey: 'branch:physics:m:module-1'
      },
      academicScope: 'branch',
      academicBranch: {
        branchKey: 'physics',
        role: 'primary',
        displayLabel: 'High School · AP · Physics · Mechanics',
        educationLevel: { id: 'hs', name: 'High School' },
        academicPathways: [{ id: 'ap', name: 'AP' }],
        subject: { id: 'physics-subject', name: 'Physics' },
        track: { id: 'physics', name: 'Mechanics' }
      },
      progress: {
        studied: { state: 'unmarked' },
        practiced: { state: 'marked' }
      }
    }, {
      scheduleItemId: 'item-legacy',
      title: 'Legacy placeholder',
      kind: 'curriculum_topic',
      state: 'scheduled',
      sequenceState: 'studied',
      effectiveDate: '2026-07-30',
      scheduledDate: '2026-07-30',
      position: 1,
      moduleKey: 'course-plan',
      moduleTitle: 'Course plan',
      presentation: {
        branchKey: 'physics',
        moduleKey: 'course-plan',
        moduleTitle: 'Course plan',
        modulePresentationKey: 'branch:physics:m:course-plan'
      },
      academicScope: 'branch',
      academicBranch: {
        branchKey: 'physics',
        role: 'primary',
        displayLabel: 'High School Â· AP Â· Physics Â· Mechanics',
        educationLevel: { id: 'hs', name: 'High School' },
        academicPathways: [{ id: 'ap', name: 'AP' }],
        subject: { id: 'physics-subject', name: 'Physics' },
        track: { id: 'physics', name: 'Mechanics' }
      },
      progress: {
        studied: { state: 'marked' }
      }
    }],
    trackProgress: {
      eligibleSessionCount: 2,
      studiedCount: 2,
      practicedCount: 1
    },
    courseProgress: {
      label: 'Course progress',
      scope: 'active_schedule_version',
      eligibleSessionCount: 2,
      studiedCount: 2,
      reviewedCount: 0,
      practicedCount: 1,
      percent: 75,
      byTrack: [{
        branchKey: 'physics',
        role: 'primary',
        displayLabel: 'High School Â· AP Â· Physics Â· Mechanics',
        track: { id: 'physics', name: 'Mechanics' },
        eligibleSessionCount: 2,
        studiedCount: 0,
        practicedCount: 1,
        percent: 25
      }]
    },
    moduleStyles: {
      'branch:physics:m:module-1': {
        headerColor: '#90caf9',
        stripeColor: '#bbdefb',
        templateName: 'Blue'
      }
    },
    pdfStyle: {}
  },
  classroomHome: {
    schemaVersion: 1,
    label: 'Classroom Home',
    timeZone: 'America/Sao_Paulo',
    coverage: {
      displayLabel: 'High School · AP · Physics · Mechanics + Algebra 1',
      branchCount: 2,
      branches: []
    },
    courseProgress: {
      label: 'Course progress',
      scope: 'active_schedule_version',
      eligibleSessionCount: 1,
      studiedCount: 0,
      practicedCount: 0,
      percent: 0
    },
    thisWeek: {
      startsOn: '2026-07-26',
      endsOn: '2026-08-01',
      items: [{
        id: 'assignment:a',
        kind: 'assignment_due',
        date: '2026-07-29',
        dateLabel: 'Due',
        title: 'Motion practice',
        action: { type: 'open_practice', assignmentId: 'assignment-a' }
      }]
    },
    comingNext: {
      startsOn: '2026-08-02',
      endsOn: '2026-08-08',
      items: [{
        id: 'schedule:item-physics',
        kind: 'curriculum_topic',
        date: '2026-08-04',
        dateLabel: 'Scheduled',
        title: 'Motion',
        academicPath: 'High School · AP · Physics · Mechanics',
        modulePresentationKey: 'branch:physics:m:module-1',
        action: { type: 'open_track_session', href: '../tracks/motion.html' }
      }]
    },
    historyPolicy: {
      activeVersionOnly: true,
      ordinaryAdjustmentsRetainContinuingProgress: true,
      fullReplacementProgressLocation: 'schedule_history',
      assignmentsMoveIndependently: true
    }
  },
  groups: { past: [], next: [], upcoming: [] },
  permissions: {
    canReadDetailedAcademicTrack: true,
    canCustomizeModuleStyle: true
  },
  featureStatus: {
    classroomHomeMultiCurriculum: 'active_phase_5g2_4_5_2'
  }
}, 'course-home')

assert.equal(payload.classroomHome.courseProgress.label, 'Course progress')
assert.equal(payload.sessions.length, 1)
assert.equal(payload.sessions[0].scheduleItemId, 'item-physics')
assert.equal(payload.courseProgress.eligibleSessionCount, 1)
assert.equal(payload.courseProgress.studiedCount, 1)
assert.equal(payload.courseProgress.practicedCount, 1)
assert.equal(payload.courseProgress.percent, 100)
assert.equal(payload.courseProgress.byTrack[0].eligibleSessionCount, 1)
assert.equal(payload.courseProgress.byTrack[0].studiedCount, 1)
assert.equal(payload.courseProgress.byTrack[0].practicedCount, 1)
assert.equal(payload.courseProgress.byTrack[0].subject.name, 'Physics')
assert.equal(payload.courseProgress.byTrack[0].track.name, 'Mechanics')
assert.equal(payload.classroomHome.courseProgress.eligibleSessionCount, 1)
assert.equal(payload.classroomHome.coverage.branchCount, 2)
assert.equal(payload.classroomHome.thisWeek.items[0].action.type, 'open_practice')
assert.equal(payload.classroomHome.comingNext.items[0].action.type, 'open_track_session')
assert.equal(
  payload.classroomHome.comingNext.items[0].modulePresentationKey,
  'branch:physics:m:module-1'
)
assert.equal(payload.classroomHome.historyPolicy.activeVersionOnly, true)
assert.equal(
  payload.moduleStyles['branch:physics:m:module-1'].headerColor,
  '#90caf9'
)
assert.equal(
  payload.featureStatus.classroomHomeMultiCurriculum,
  'active_phase_5g2_4_5_2'
)

assert.match(migration, /project_course_schedule_classroom_home/i)
assert.match(page, /function classroomProgressTrackLabel/)
assert.match(page, /return `\$\{subjectLabel\}, \$\{trackName\}`/)
assert.match(page, /Items studied: \$\{studied\} out of \$\{eligible\}/)
assert.match(page, /Items practiced: \$\{practiced\} out of \$\{eligible\}/)
assert.match(migration, /course_assignments/i)
assert.match(migration, /assignmentsMoveIndependently/i)
assert.match(migration, /fullReplacementProgressLocation/i)
assert.match(migration, /modulePresentationKey/i)
assert.match(migration, /Track-qualified/i)
assert.match(followup, /modulePresentationKey/i)
assert.match(followup, /\{progress,studied,state\}/i)
assert.match(followup, /sequenceState[\s\S]*?<> 'studied'/i)
assert.match(html, /Course progress/)
assert.match(html, /Track breakdown/)
assert.match(html, /id="classroom-track-progress-breakdown"/)
assert.match(html, /id="classroom-home-this-week-list"/)
assert.match(html, /id="classroom-home-coming-next-list"/)
assert.match(page, /renderClassroomHome/)
assert.match(page, /open_track_session/)
assert.match(page, /open_practice/)
assert.match(page, /group\.modulePresentationKey \|\| group\.moduleKey/)
assert.match(page, /classroomHomeWorkIsPending/)
assert.match(page, /work\.modulePresentationKey/)
assert.match(page, /Items studied:/)
assert.match(page, /Items practiced:/)
assert.match(page, /function positionProgressHelper\(details\)/)
assert.match(page, /document\.documentElement\.clientWidth/)
assert.match(page, /document\.documentElement\.clientHeight/)
assert.match(styles, /\.classroom-track-progress-breakdown > div/)
assert.match(styles, /\.classroom-track-progress-summary-primary/)
assert.match(styles, /\.classroom-track-progress-help\.is-viewport-positioned > div/)
assert.match(styles, /\.classroom-home-layout/)
assert.match(styles, /\.classroom-home-work-item\[data-module-styled="true"\]/)
assert.match(runner, /classroom-home-multi-curriculum-db-self-test\.sql/)

console.log('Multi-curriculum Classroom Home contracts passed.')
