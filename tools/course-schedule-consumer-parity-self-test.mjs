import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeCanonicalClassroomSchedulePayload } from '../src/app/classroom/classroom-schedule-contract.js'
import { normalizeStudentCalendarPayload } from '../src/app/dashboard/student-dashboard-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const canonicalPayload = {
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
  classroom: {
    id: 'classroom-a'
  },
  viewer: {
    actorRole: 'student',
    viewMode: 'student'
  },
  schedule: {
    activeVersionId: 'version-a',
    versionNumber: 4,
    name: 'Algebra 1 plan',
    timeZone: 'Asia/Damascus'
  },
  context: {
    provider: { serviceModel: 'recurring' },
    academicContext: {
      educationLevel: {
        id: 'education-high-school',
        name: 'High School',
        slug: 'high-school'
      }
    }
  },
  academicTrack: {
    layoutMode: 'modules',
    activeScheduleVersionId: 'version-a',
    versionNumber: 4,
    educationLevel: {
      id: 'education-high-school',
      name: 'High School',
      slug: 'high-school'
    },
    items: [{
      scheduleItemId: 'item-a',
      stableItemKey: 'linear-equations',
      title: 'Linear equations',
      kind: 'curriculum_topic',
      state: 'scheduled',
      scheduledDate: '2026-07-29',
      effectiveDate: '2026-07-29',
      position: 0,
      moduleKey: 'linear-modeling',
      moduleTitle: 'Linear Modeling',
      planningHref: '../tracks/algebra-1/linear-equations.html'
    }],
    trackProgress: {
      eligibleSessionCount: 1,
      studiedCount: 0,
      reviewedCount: 0,
      practicedCount: 0
    },
    moduleStyles: {
      'linear-modeling': {
        headerColor: '#f2b7ce',
        stripeColor: '#f8dbe6',
        templateName: 'Pink'
      }
    },
    pdfStyle: {}
  },
  groups: {
    past: [],
    next: [{
      rowId: 'timeline:item-a',
      rowKind: 'schedule_item',
      scheduleItemId: 'item-a',
      title: 'Linear equations',
      status: 'scheduled',
      effectiveDate: '2026-07-29',
      calendarPresentation: {
        sourceKind: 'course_target',
        isDateOnly: true,
        effectiveDate: '2026-07-29',
        displayTimeZone: 'Asia/Damascus',
        placement: 'viewer_local_noon',
        blocksAvailability: false
      }
    }],
    upcoming: []
  },
  permissions: {
    canReadDetailedAcademicTrack: true,
    canMarkSession: true,
    canCustomizeModuleStyle: true
  },
  calendarPolicy: {
    assignmentDeadlinesAreIndependent: true,
    assignmentDeadlineChangesMoveMeetings: false
  },
  meetingStatePolicy: {
    lockWindowHours: 6
  }
}

const calendarPayload = {
  schemaVersion: 2,
  contract: {
    name: 'student_calendar_read',
    phase: '5.G.2.2',
    version: 2,
    scheduleAuthority: 'course_schedule_read',
    assignmentAuthority: 'course_assignments.schedule_snapshot',
    scope: 'dashboard',
    legacyScheduleMirrorAuthoritative: false,
    directEventDestinations: true,
    moduleColorPresentation: true,
    failureMode: 'atomic'
  },
  range: {
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    timeZone: 'Asia/Damascus'
  },
  events: [{
    id: 'timeline:item-a',
    kind: 'schedule_milestone',
    eventCode: 'SM',
    eventLabel: 'Schedule milestone',
    startsOn: '2026-07-29',
    endsOn: '2026-07-29',
    title: 'Linear equations',
    courseId: 'course-a',
    classroomId: 'classroom-a',
    scheduleItemId: 'item-a',
    courseTitle: 'Algebra 1',
    subject: 'Mathematics',
    focus: 'Algebra 1',
    educationLevel: {
      name: 'High School',
      slug: 'high-school',
      code: 'HS'
    },
    presentationColorSource: 'module',
    modulePresentation: {
      key: 'linear-modeling',
      title: 'Linear Modeling',
      headerColor: '#f2b7ce',
      rowColor: '#f8dbe6'
    },
    status: 'scheduled',
    calendarPresentation: {
      sourceKind: 'course_target',
      isDateOnly: true,
      effectiveDate: '2026-07-29',
      displayTimeZone: 'Asia/Damascus',
      placement: 'viewer_local_noon',
      blocksAvailability: false
    },
    action: {
      type: 'open_track_session',
      href: '../tracks/algebra-1/linear-equations.html',
      scheduleItemId: 'item-a'
    }
  }],
  availabilityOverlay: {
    status: 'contract_only_phase_10',
    eligibleContexts: []
  },
  calendarPolicy: {
    dateOnlyDisplayAnchor: 'viewer_local_noon',
    dateOnlyDisplayIsPresentationOnly: true,
    dateOnlyItemsBlockAvailability: false,
    assignmentDeadlinesAreIndependent: true,
    assignmentDeadlineChangesMoveMeetings: false,
    canonicalFailureIsAtomic: true,
    legacyScheduleFallback: false
  }
}

for (const actorRole of ['student', 'tutor', 'mentor']) {
  const payload = structuredClone(canonicalPayload)
  payload.viewer.actorRole = actorRole
  payload.viewer.viewMode = actorRole
  const normalized = normalizeCanonicalClassroomSchedulePayload(payload, 'course-a')
  assert.equal(normalized.permissions.actorRole, actorRole)
  assert.equal(normalized.timeline.next.length, 1)
}

const classroom = normalizeCanonicalClassroomSchedulePayload(canonicalPayload, 'course-a')
const calendar = normalizeStudentCalendarPayload(calendarPayload)
const classroomRow = classroom.timeline.next[0]
const calendarEvent = calendar.events[0]

assert.deepEqual({
  courseId: classroom.courseId,
  classroomId: canonicalPayload.classroom.id,
  scheduleItemId: classroomRow.scheduleItemId,
  rowId: classroomRow.rowId,
  title: classroomRow.title,
  effectiveDate: classroomRow.calendarPresentation.effectiveDate,
  status: classroomRow.status,
  timeZone: classroom.timeZone,
  moduleKey: classroom.sessions[0].moduleKey,
  headerColor: classroom.moduleStyles['linear-modeling'].headerColor,
  rowColor: classroom.moduleStyles['linear-modeling'].stripeColor,
  planningHref: classroom.sessions[0].planningHref
}, {
  courseId: calendarEvent.courseId,
  classroomId: calendarEvent.classroomId,
  scheduleItemId: calendarEvent.scheduleItemId,
  rowId: calendarEvent.id,
  title: calendarEvent.title,
  effectiveDate: calendarEvent.calendarPresentation.effectiveDate,
  status: calendarEvent.status,
  timeZone: calendar.range.timeZone,
  moduleKey: calendarEvent.modulePresentation.key,
  headerColor: calendarEvent.modulePresentation.headerColor,
  rowColor: calendarEvent.modulePresentation.rowColor,
  planningHref: calendarEvent.action.href
})
assert.equal(calendar.contract.scheduleAuthority, classroom.readContract.name)
assert.equal(calendar.contract.legacyScheduleMirrorAuthoritative, false)
assert.equal(calendar.contract.failureMode, 'atomic')
assert.equal(calendar.calendarPolicy.canonicalFailureIsAtomic, true)
assert.equal(calendar.calendarPolicy.legacyScheduleFallback, false)
assert.equal(calendar.calendarPolicy.assignmentDeadlinesAreIndependent, true)
assert.equal(calendar.calendarPolicy.assignmentDeadlineChangesMoveMeetings, false)

assert.throws(
  () => normalizeCanonicalClassroomSchedulePayload({
    ...canonicalPayload,
    academicTrack: { layoutMode: 'higher_level_timeline' },
    permissions: { canReadDetailedAcademicTrack: false }
  }, 'course-a'),
  /detailed Classroom Schedule is not available/
)
assert.equal(normalizeStudentCalendarPayload({
  ...calendarPayload,
  events: [{ id: 'legacy-only', title: 'Legacy mirror', startsOn: '2026-07-29' }]
}).events.length, 0)

const [
  dataAdapter,
  calendarCutover,
  calendarNavigation,
  calendarModulePresentation,
  activeVersionCalendarParity,
  databaseCharacterization,
  packageJson,
  plan,
  productContract,
  coverage
] = await Promise.all([
  readText('src/data/studentData.js'),
  readText('supabase/migrations/202607240009_student_calendar_canonical_cutover.sql'),
  readText('supabase/migrations/202607240010_student_calendar_navigation_presentation.sql'),
  readText('supabase/migrations/202607240011_student_calendar_module_presentation.sql'),
  readText('supabase/migrations/202607310003_combined_cadence_and_student_calendar_parity.sql'),
  readText('tools/student-calendar-surface-db-self-test.sql'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

assert.match(dataAdapter, /supabase\.rpc\('get_my_unified_course_schedule'/)
assert.match(dataAdapter, /supabase\.rpc\('get_my_student_calendar'/)
assert.doesNotMatch(dataAdapter, /supabase\.rpc\('get_my_effective_course_schedule'/)
assert.match(calendarCutover, /course_projection := public\.get_my_unified_course_schedule/)
assert.match(calendarCutover, /A canonical Course Schedule could not be loaded for this Calendar/)
assert.match(calendarCutover, /'failureMode', 'atomic'/)
assert.match(calendarCutover, /'legacyScheduleMirrorAuthoritative', false/)
assert.match(calendarCutover, /'legacyScheduleFallback', false/)
assert.match(
  calendarNavigation,
  /\{contract,directEventDestinations\}[\s\S]*?'true'::jsonb/
)
assert.match(
  calendarModulePresentation,
  /\{contract,moduleColorPresentation\}[\s\S]*?'true'::jsonb/
)
for (const fragment of [
  'get_my_student_calendar_phase5g2_4_7_3_1_3_base',
  'public.get_my_classroom_calendar(',
  "'{contract,activeVersionClassroomAuthority}'",
  'current active-Version role-aware Classroom timelines'
]) {
  assert.ok(
    activeVersionCalendarParity.includes(fragment),
    `The active-Version Student Calendar parity migration is missing ${fragment}.`
  )
}

for (const fragment of [
  'Classroom and Calendar consumers disagreed about the viewer timezone',
  'Classroom and Calendar consumers drifted from the same canonical timeline row',
  'Classroom and Calendar consumers disagreed about module presentation colors',
  'Classroom and Calendar consumers disagreed about the Track destination',
  'Classroom and Calendar did not inherit the same Profile timezone',
  'Expected cross-Student Classroom Schedule denial was not raised',
  'The assigned Tutor did not retain detailed Classroom Schedule access',
  'The supervising Mentor did not retain detailed Classroom Schedule access',
  'Student Calendar treated the legacy Schedule mirror as Course-event authority',
  'Student and staff Calendars disagreed about the active Schedule Version'
]) {
  assert.ok(
    databaseCharacterization.includes(fragment),
    `Phase 5.G.2.3 database parity coverage is missing: ${fragment}`
  )
}

assert.match(
  packageJson,
  /"test:schedule-consumer-parity": "node tools\/course-schedule-consumer-parity-self-test\.mjs"/
)
assert.match(plan, /5\.G\.2\.3 .*Consumer parity and regression checks: Complete/i)
assert.match(productContract, /Phase 5\.G\.2\.3/i)
assert.match(coverage, /Phase 5\.G\.2\.3/i)

console.log(
  'Phase 5.G.2.3 Classroom/Calendar active-Version identity, timezone, role, failure, color, destination, and legacy-isolation parity contracts passed.'
)
