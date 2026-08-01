import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calendarReelStart,
  calendarRangeForView,
  moveClassroomCard,
  moveCalendarAnchor,
  moveDashboardBlock,
  normalizeCollapsedDashboardBlocks,
  normalizeClassroomCardColor,
  normalizeDashboardBlockOrder,
  normalizeStudentCalendarPayload,
  normalizeStudentDashboardPayload,
  placeClassroomCardAtTarget,
  placeDashboardBlockAtTarget
} from '../src/app/dashboard/student-dashboard-contract.js'
import { normalizeClassroomSpacePayload } from '../src/app/classroom/classroom-space-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  migration, refinementMigration, cardMigration, calendarMigration, calendarCutoverMigration,
  calendarNavigationMigration, calendarModulePresentationMigration,
  calendarPresentationParityMigration,
  dbTest, cardDbTest, calendarDbTest, dataAdapter,
  html, dashboard, styles, classroomSpaceHtml, classroomSpaceJs, classroomSpaceCss, packageJsonSource
] = await Promise.all([
  readText('supabase/migrations/202607200005_student_dashboard_foundation.sql'),
  readText('supabase/migrations/202607200006_student_dashboard_refinements.sql'),
  readText('supabase/migrations/202607200007_student_classroom_cards.sql'),
  readText('supabase/migrations/202607200008_student_calendar_surface.sql'),
  readText('supabase/migrations/202607240009_student_calendar_canonical_cutover.sql'),
  readText('supabase/migrations/202607240010_student_calendar_navigation_presentation.sql'),
  readText('supabase/migrations/202607240011_student_calendar_module_presentation.sql'),
  readText('supabase/migrations/202607310001_calendar_pdf_presentation_parity.sql'),
  readText('tools/student-dashboard-foundation-db-self-test.sql'),
  readText('tools/student-classroom-cards-db-self-test.sql'),
  readText('tools/student-calendar-surface-db-self-test.sql'),
  readText('src/data/studentData.js'),
  readText('src/app/dashboard/student-dashboard.html'),
  readText('src/app/dashboard/student-dashboard.js'),
  readText('src/styles/style.css'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('package.json')
])

assert.deepEqual(normalizeDashboardBlockOrder(['classrooms', 'calendar']), ['classrooms', 'calendar'])
assert.deepEqual(normalizeDashboardBlockOrder(['calendar', 'calendar']), ['calendar', 'classrooms'])
assert.deepEqual(normalizeCollapsedDashboardBlocks(['calendar', 'calendar', 'unknown']), ['calendar'])
assert.deepEqual(moveDashboardBlock(['calendar', 'classrooms'], 'calendar', 'down'), ['classrooms', 'calendar'])
assert.deepEqual(placeDashboardBlockAtTarget(['calendar', 'classrooms'], 'classrooms', 'calendar'), ['classrooms', 'calendar'])
assert.deepEqual(placeDashboardBlockAtTarget(['calendar', 'classrooms'], 'calendar', 'classrooms'), ['classrooms', 'calendar'])
assert.equal(normalizeClassroomCardColor('CORAL'), 'coral')
assert.equal(normalizeClassroomCardColor('unsupported'), 'ocean')
assert.deepEqual(moveClassroomCard(['room-a', 'room-b'], 'room-b', 'earlier'), ['room-b', 'room-a'])
assert.deepEqual(placeClassroomCardAtTarget(['room-a', 'room-b'], 'room-a', 'room-b'), ['room-b', 'room-a'])
assert.deepEqual(calendarRangeForView(new Date(2026, 6, 20, 12), 'month'), {
  startDate: '2026-07-01', endDate: '2026-07-31'
})
assert.deepEqual(calendarRangeForView(new Date(2026, 6, 20, 12), 'week'), {
  startDate: '2026-07-19', endDate: '2026-07-25'
})
assert.equal(moveCalendarAnchor(new Date(2026, 6, 20, 12), 'month', 'next').getMonth(), 7)
assert.equal(
  calendarReelStart(
    new Date(2024, 0, 1, 12),
    new Date(2026, 6, 20, 12),
    'month'
  ).toISOString().slice(0, 10),
  '2026-01-01'
)

const normalized = normalizeStudentDashboardPayload({
  preferences: { blockOrder: ['classrooms', 'calendar'], calendarView: 'week', collapsedBlocks: ['calendar'], revision: 3 },
  classrooms: [{
    courseId: 'course-a', courseTitle: 'Mechanics', courseStatus: 'active',
    subject: { name: 'Physics' }, focus: { name: 'Mechanics' }, tutor: { name: 'Tutor A' },
    classroom: { id: 'classroom-a', status: 'active', membershipRole: 'student' },
    card: { colorKey: 'orchid', position: 2 }
  }]
})
assert.equal(normalized.preferences.calendarView, 'week')
assert.deepEqual(normalized.preferences.collapsedBlocks, ['calendar'])
assert.equal(normalized.classrooms[0].classroom.status, 'active')
assert.equal(normalized.classrooms[0].card.colorKey, 'orchid')
assert.equal(normalized.classrooms[0].card.position, 2)

const normalizedCalendar = normalizeStudentCalendarPayload({
  schemaVersion: 2,
  contract: {
    name: 'student_calendar_read',
    phase: '5.G.2.2',
    version: 2,
    scheduleAuthority: 'course_schedule_read',
    legacyScheduleMirrorAuthoritative: false,
    directEventDestinations: true,
    itemAcademicPresentation: true,
    courseLifecycleCoveragePresentation: true,
    failureMode: 'atomic'
  },
  range: { startDate: '2026-07-01', endDate: '2026-07-31', timeZone: 'America/Sao_Paulo' },
  events: [
    { id: 'schedule:a', kind: 'schedule_milestone', eventCode: 'SM', eventLabel: 'Schedule milestone', startsOn: '2026-07-22', endsOn: '2026-07-22', title: 'Kinematics', courseId: 'course-a', classroomId: 'classroom-a', scheduleItemId: 'item-a', colorKey: 'coral', presentationColorSource: 'module', modulePresentation: { key: 'branch:physics:module:motion', title: 'Motion', headerColor: '#5B8DEF', rowColor: '#DCE8F7' }, educationLevel: { name: 'High School', code: 'HS' }, academicScope: 'branch', academicPath: 'High School \u00b7 AP \u00b7 Physics \u00b7 Mechanics', compactAcademicLabel: 'Mechanics', academicPathways: [{ name: 'AP', slug: 'ap' }], calendarPresentation: { sourceKind: 'course_target', isDateOnly: true, effectiveDate: '2026-07-22', displayTimeZone: 'America/Sao_Paulo', blocksAvailability: false }, action: { type: 'open_track_session', href: '../schedules/kinematics.html', scheduleItemId: 'item-a' } },
    { id: 'assignment:a', kind: 'assignment_due', startsOn: '2026-07-22', endsOn: '2026-07-22', title: 'Homework due', courseId: 'course-a', classroomId: 'classroom-a', action: { type: 'open_practice', assignmentId: 'assignment-a' } }
  ],
  availabilityOverlay: { status: 'contract_only_phase_10', eligibleContexts: [{ courseId: 'course-a', classroomId: 'classroom-a', tutor: { id: 'tutor-a', name: 'Tutor A' } }] },
  calendarPolicy: {
    dateOnlyDisplayAnchor: 'viewer_local_noon',
    assignmentDeadlinesAreIndependent: true,
    canonicalFailureIsAtomic: true,
    legacyScheduleFallback: false
  }
})
assert.equal(normalizedCalendar.events.length, 2)
assert.equal(normalizedCalendar.events[0].startsOn, normalizedCalendar.events[1].startsOn)
assert.equal(normalizedCalendar.events[0].eventCode, 'SM')
assert.equal(normalizedCalendar.events[0].educationLevel.code, 'HS')
assert.equal(normalizedCalendar.events[0].presentationColorSource, 'module')
assert.equal(normalizedCalendar.events[0].modulePresentation.headerColor, '#5b8def')
assert.equal(normalizedCalendar.events[0].modulePresentation.rowColor, '#dce8f7')
assert.equal(normalizedCalendar.events[0].academicScope, 'branch')
assert.equal(normalizedCalendar.events[0].academicPath, 'High School \u00b7 AP \u00b7 Physics \u00b7 Mechanics')
assert.equal(normalizedCalendar.events[0].compactAcademicLabel, 'Mechanics')
assert.deepEqual(normalizedCalendar.events[0].academicPathways, [{ name: 'AP', slug: 'ap' }])
assert.equal(normalizedCalendar.events[0].calendarPresentation.blocksAvailability, false)
assert.equal(normalizedCalendar.events[0].action.type, 'open_track_session')
assert.equal(normalizedCalendar.events[0].action.href, '../schedules/kinematics.html')
assert.equal(normalizedCalendar.events[1].action.assignmentId, 'assignment-a')
assert.equal(normalizedCalendar.availabilityOverlay.eligibleContexts.length, 1)
assert.equal(normalizedCalendar.contract.scheduleAuthority, 'course_schedule_read')
assert.equal(normalizedCalendar.contract.legacyScheduleMirrorAuthoritative, false)
assert.equal(normalizedCalendar.contract.directEventDestinations, true)
assert.equal(normalizedCalendar.contract.itemAcademicPresentation, true)
assert.equal(normalizedCalendar.contract.courseLifecycleCoveragePresentation, true)
assert.equal(normalizedCalendar.calendarPolicy.canonicalFailureIsAtomic, true)

const normalizedClassroomSpace = normalizeClassroomSpacePayload({
  viewer: { id: 'student-a', membershipRole: 'student' },
  classroom: { id: 'classroom-a', status: 'active' },
  course: { id: 'course-a', title: 'Mechanics', status: 'active' },
  subject: { name: 'Physics' }, focus: { name: 'Mechanics' }, tutor: { name: 'Tutor A' }
})
assert.equal(normalizedClassroomSpace.viewer.membershipRole, 'student')
assert.equal(normalizedClassroomSpace.course.title, 'Mechanics')
assert.throws(() => normalizeClassroomSpacePayload({}), /payload is incomplete/)

for (const fragment of [
  'create table if not exists public.student_dashboard_preferences',
  "array['calendar', 'classrooms']::text[]",
  "calendar_view in ('month', 'week')",
  'create or replace function public.get_my_student_dashboard()',
  'create or replace function public.save_my_student_dashboard_preferences(p_preferences jsonb)',
  'create or replace function public.reset_my_student_dashboard_preferences()',
  "'classroomCards', 'pending_phase_3'",
  "'calendarData', 'pending_phase_7'",
  "'credits', 'pending_phase_8'",
  'course.student_id = caller_id',
  'enable row level security',
  'user_id = (select auth.uid())'
]) assert.ok(migration.includes(fragment), `Dashboard migration is missing: ${fragment}`)

for (const fragment of [
  'add column if not exists collapsed_blocks',
  "'collapsedBlocks'",
  "p_preferences - 'blockOrder' - 'calendarView' - 'collapsedBlocks'",
  'collapsed_blocks = excluded.collapsed_blocks'
]) assert.ok(refinementMigration.includes(fragment), `Dashboard refinement migration is missing: ${fragment}`)

for (const fragment of [
  'create table if not exists public.student_classroom_card_preferences',
  'enable row level security',
  'create or replace function public.save_my_student_classroom_card_color',
  'create or replace function public.save_my_student_classroom_card_order',
  'create or replace function public.get_my_classroom_space',
  "membership.membership_role = 'student'",
  "membership.status = 'active'",
  "classroom.status = 'active'",
  "'classroomCards', 'active_phase_2d'",
  "'liveClassTool', 'schedule_bound'"
]) assert.ok(cardMigration.includes(fragment), `Classroom Card migration is missing: ${fragment}`)

for (const fragment of [
  'add column if not exists student_course_id',
  'learning_schedules_one_active_student_course_idx',
  'create or replace function public.upsert_student_course_learning_schedule',
  'create or replace function public.get_my_student_calendar',
  "'schedule_milestone'::text",
  "'assignment_due'::text",
  "'contract_only_phase_2e'",
  "'calendarData', 'active_phase_2e'",
  'Calendar ranges cannot exceed 62 days',
  "schedule.student_course_id"
]) assert.ok(calendarMigration.includes(fragment), `Calendar migration is missing: ${fragment}`)

for (const fragment of [
  'create or replace function public.calendar_education_level_code',
  'create or replace function public.get_my_student_calendar',
  'create or replace function public.get_my_student_classroom_calendar',
  'public.get_my_unified_course_schedule',
  "'scheduleAuthority', 'course_schedule_read'",
  "'legacyScheduleMirrorAuthoritative', false",
  "'failureMode', 'atomic'",
  "'assignmentDeadlinesAreIndependent', true",
  "'dateOnlyDisplayAnchor', 'viewer_local_noon'",
  "event_code := 'SM'",
  "event_code := 'RC'",
  "'eventCode', 'AD'",
  "'calendarProjection', 'active_phase_5g2_2'"
]) assert.ok(
  calendarCutoverMigration.includes(fragment),
  `Calendar cutover migration is missing: ${fragment}`
)

for (const fragment of [
  'get_my_student_calendar_phase5g2_2_base',
  'directEventDestinations',
  "'open_practice'",
  "'open_track_session'",
  'item.planning_href',
  "'scheduleItemId'",
  "'sourceKind', 'course_target'"
]) assert.ok(
  calendarNavigationMigration.includes(fragment),
  `Calendar navigation follow-up migration is missing: ${fragment}`
)

for (const fragment of [
  'get_my_student_calendar_phase5g2_2_navigation',
  'schedule_module_styles',
  'source_module_key',
  'presentationColorSource',
  'modulePresentation',
  'moduleColorPresentation'
]) assert.ok(
  calendarModulePresentationMigration.includes(fragment),
  `Calendar module-presentation migration is missing: ${fragment}`
)

for (const fragment of [
  'course_schedule_calendar_presentation_parity',
  'course_schedule_consumer_branch_context',
  'course_schedule_module_presentation_key',
  'itemAcademicPresentation',
  'courseLifecycleCoveragePresentation'
]) assert.ok(
  calendarPresentationParityMigration.includes(fragment),
  `Calendar presentation-parity migration is missing: ${fragment}`
)

assert.doesNotMatch(migration, /important_links|student_events/)
assert.match(dbTest, /set local role authenticated;/i)
assert.match(dbTest, /jsonb_array_length\(payload -> 'classrooms'\) <> 0/)
assert.match(dbTest, /rollback;/i)
assert.match(cardDbTest, /set local role authenticated;/i)
assert.match(cardDbTest, /cross-Student Classroom Card customization denial/i)
assert.match(cardDbTest, /outsider Classroom-space denial/i)
assert.match(cardDbTest, /rollback;/i)
assert.match(calendarDbTest, /Kinematics milestone/)
assert.match(calendarDbTest, /Kinematics homework/)
assert.match(calendarDbTest, /Legacy milestone must stay hidden/)
assert.match(calendarDbTest, /authoritative Course timeline item/)
assert.match(calendarDbTest, /legacy Schedule mirror as Course-event authority/)
assert.match(calendarDbTest, /Classroom Calendar adapter did not preserve its exact Course scope/)
assert.match(calendarDbTest, /cross-Student Classroom Calendar denial/)
assert.match(calendarDbTest, /Student B received Student A Calendar data/)
assert.match(calendarDbTest, /rollback;/i)
assert.match(dataAdapter, /supabase\.rpc\('get_my_student_dashboard'\)/)
assert.match(dataAdapter, /supabase\.rpc\('get_my_student_calendar'/)
assert.match(dataAdapter, /supabase\.rpc\('get_my_student_classroom_calendar'/)
assert.match(dataAdapter, /supabase\.rpc\('save_my_student_dashboard_preferences'/)
assert.match(dataAdapter, /supabase\.rpc\('save_my_student_classroom_card_color'/)
assert.match(dataAdapter, /supabase\.rpc\('save_my_student_classroom_card_order'/)
assert.match(dataAdapter, /supabase\.rpc\('get_my_classroom_space'/)
assert.doesNotMatch(dataAdapter, /important_links|student_events/)

assert.match(html, /class="student-dashboard-topbar"/)
assert.match(html, /data-dashboard-menu="learn"/)
assert.match(html, /data-dashboard-menu="schedule"/)
assert.match(html, /data-dashboard-menu="account"/)
assert.match(html, /id="dashboard-grid"/)
assert.match(html, /data-dashboard-block="calendar"/)
assert.match(html, /data-dashboard-block="classrooms"/)
assert.equal((html.match(/data-dashboard-block="/g) || []).length, 2)
assert.match(html, /class="student-dashboard-wallet"/)
assert.match(html, /data-toggle-dashboard-block="calendar"/)
assert.match(html, /data-dashboard-drag-handle="calendar" draggable="true"/)
assert.match(html, /data-dashboard-drag-handle="classrooms" draggable="true"/)
assert.match(html, /id="student-classroom-cards"/)
assert.match(html, /id="student-calendar-legend-dialog"/)
assert.match(html, /id="student-calendar-day-dialog"/)
assert.match(html, /id="student-calendar-event-tooltip"/)
assert.match(html, /id="student-calendar-request-lesson"/)
assert.match(html, /id="student-lesson-request-dialog"/)
assert.match(html, />SM<\/dt><dd>Schedule milestone/)
assert.doesNotMatch(html, /Cards arrive next|student-classroom-foundations/)
assert.doesNotMatch(html, /id="customize-dashboard"|id="reset-dashboard-layout"|id="cancel-dashboard-layout"|id="save-dashboard-layout"/)
assert.doesNotMatch(html, /student-dashboard-home-link/)
assert.doesNotMatch(html, /id="student-credits-block"/)
assert.doesNotMatch(html, /id="student-dashboard-customize-bar"/)
assert.doesNotMatch(html, /id="student-profile-line"|id="student-role-list"/)
assert.doesNotMatch(html, /workspace-sidebar/)
assert.ok(html.indexOf('class="student-dashboard-wallet"') < html.indexOf('id="dashboard-grid"'))
assert.ok(html.indexOf('class="student-dashboard-hero"') < html.indexOf('id="dashboard-grid"'))
assert.ok(html.indexOf('id="student-dashboard-feedback"') > html.indexOf('id="dashboard-grid"'))

assert.match(dashboard, /requireAuth\(\['student'\]\)/)
assert.match(dashboard, /saveStudentDashboardPreferences/)
assert.doesNotMatch(dashboard, /resetStudentDashboardPreferences|state\.customizing|is-customizing/)
assert.match(dashboard, /event\.dataTransfer\.setData\('text\/plain', blockKey\)/)
assert.match(dashboard, /data-move-dashboard-block/)
assert.match(dashboard, /async function persistPreferences/)
assert.match(dashboard, /placeDashboardBlockAtTarget/)
assert.match(dashboard, /placeClassroomCardAtTarget/)
assert.match(dashboard, /dataClassroomCardHandle|classroomCardHandle/)
assert.match(dashboard, /classroom-space\.html\?classroom=/)
assert.match(dashboard, /saveStudentClassroomCardColor/)
assert.match(dashboard, /saveStudentClassroomCardOrder/)
assert.match(dashboard, /function applyBlockOrder\(\{ animate = false \} = \{\}\)/)
assert.match(dashboard, /block\.animate\(\[/)
assert.match(dashboard, /animation\.id = 'dashboard-block-reorder'/)
assert.match(dashboard, /animation\.id = 'classroom-card-reorder'/)
assert.equal((dashboard.match(/duration: 920/g) || []).length >= 2, true)
assert.match(dashboard, /button\.setAttribute\('aria-disabled', String\(button\.disabled \|\| state\.saving\)\)/)
assert.match(dashboard, /handle\.draggable = true/)
assert.doesNotMatch(dashboard, /button\.disabled = state\.saving \|\|/)
assert.match(dashboard, /prefers-reduced-motion: reduce/)
assert.doesNotMatch(dashboard, /body\?\.classList\.toggle\('is-hidden'/)
assert.match(dashboard, /const daysInMonth = new Date/)
assert.match(dashboard, /async function loadCalendarData/)
assert.match(dashboard, /data-calendar-navigation/)
assert.match(dashboard, /function calendarMotionDirection/)
assert.match(dashboard, /const preservedViewport = captureCalendarNavigationViewport\(button\)/)
assert.match(dashboard, /function restoreCalendarNavigationViewport\(snapshot\)/)
assert.match(dashboard, /\.focus\(\{ preventScroll: true \}\)/)
assert.doesNotMatch(dashboard, /snapshot\.scroll[XY]/)
assert.doesNotMatch(dashboard, /window\.scrollTo\(\{ top: targetY/)
assert.match(html, /student-dashboard-loading-placeholder is-calendar/)
assert.match(html, /student-dashboard-loading-calendar-grid/)
assert.match(html, /student-dashboard-loading-classroom-grid/)
assert.match(styles, /#student-dashboard\[aria-busy="true"\] \.student-dashboard-loading-placeholder/)
assert.match(styles, /\.student-dashboard-loading-placeholder::after/)
assert.match(dashboard, /function setRenderedCalendarBusy/)
assert.match(dashboard, /const motionDirection = calendarMotionDirection\(previousAnchor, nextAnchor\)/)
assert.match(dashboard, /fallbackAnchor: previousAnchor/)
assert.match(dashboard, /function calendarAnchorsBetween/)
assert.match(dashboard, /async function playCalendarReel/)
assert.match(dashboard, /reelAnchors: direction === 'today'/)
assert.match(dashboard, /calendarReelStart\(previousAnchor, nextAnchor, view\)/)
assert.match(dashboard, /createLessonRequestFoundation/)
assert.match(dashboard, /state\.lessonRequest\?\.setCalendarPayload\(payload\)/)
assert.match(dashboard, /data-request-lesson-date/)
assert.match(dashboard, /const totalCells = 42/)
assert.match(dashboard, /function animateCalendarReel/)
assert.match(dashboard, /student-dashboard-calendar-motion-viewport/)
assert.match(dashboard, /data-open-calendar-helper/)
assert.match(dashboard, /data-open-calendar-day/)
assert.match(dashboard, /function calendarEventCompactLabel/)
assert.match(dashboard, /function openCalendarDayDialog/)
assert.match(dashboard, /function showCalendarEventTooltip/)
assert.match(dashboard, /function calendarEventDestination/)
assert.match(dashboard, /function applyCalendarEventPresentation/)
assert.match(dashboard, /function calendarEventDescriptionLines/)
assert.match(dashboard, /document\.addEventListener\('click', closeClassroomCardMenusOutside\)/)
assert.match(dashboard, /function closeClassroomCardMenusOutside/)
assert.match(dashboard, /\.student-dashboard-classroom-card-menu\[open\]/)
assert.match(dashboard, /course-practice\.html\?assignment=/)
assert.match(dashboard, /open_track_session/)
assert.match(dashboard, /classroom-space\.html\?classroom=/)
assert.doesNotMatch(dashboard, /successMessage|feedbackTimer/)
assert.match(dashboard, /scrollRestoration = 'manual'/)
const dashboardStyles = styles.match(/\/\* ===== Phase 2\.B Student Dashboard ===== \*\/[\s\S]*$/)?.[0] || ''
assert.match(dashboardStyles, /\.student-dashboard-topbar\s*\{[\s\S]*?position:\s*relative/)
assert.doesNotMatch(dashboardStyles, /position:\s*sticky/)
assert.match(dashboardStyles, /\.student-dashboard-wallet/)
assert.match(dashboardStyles, /\.student-dashboard-wallet\s*\{[\s\S]*?flex:\s*0 0 auto/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-date-cell/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-navigation/)
assert.match(styles, /\.calendar-motion-viewport/)
assert.match(styles, /\.calendar-motion-viewport\.is-transitioning\s*\{[\s\S]*?overflow:\s*clip/)
assert.match(styles, /\.calendar-motion-viewport\.is-transitioning > \.calendar-motion-panel/)
assert.match(styles, /\.student-dashboard-calendar-motion-viewport/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-shell\s*\{[\s\S]*?overflow:\s*visible/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-motion-viewport\s*\{[\s\S]*?overflow-x:\s*auto/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-event/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-tooltip/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-overflow/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-dialog/)
assert.match(dashboardStyles, /\[data-color-source="classroom"\]\[data-card-color="coral"\]/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-event\.is-assignment_due/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-event\.is-independent_progress/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-helper\s*\{[\s\S]*?min-height:\s*24px[\s\S]*?border-radius:\s*50%/)
assert.match(dashboardStyles, /\[data-color-source="module"\]/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-description-line\.is-line-4/)
assert.match(dashboardStyles, /\.student-dashboard-block-copy\[data-dashboard-drag-handle\]/)
assert.doesNotMatch(dashboardStyles, /\.student-dashboard-shell\.is-saving-preferences/)
assert.match(dashboardStyles, /\.student-dashboard-feedback\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*0[^}]*left:\s*6px/)
assert.doesNotMatch(dashboardStyles, /\.student-dashboard-feedback\s*\{[^}]*position:\s*fixed/)
assert.match(dashboardStyles, /\.student-dashboard-block-body\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\)/)
assert.match(dashboardStyles, /\.student-dashboard-block\.is-collapsed \.student-dashboard-block-body\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 0fr\)/)
assert.match(dashboardStyles, /\.student-dashboard-block\s*\{[\s\S]*?transition:\s*padding 920ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
assert.match(dashboardStyles, /\.student-dashboard-block-header\s*\{[\s\S]*?transition:\s*margin-bottom 920ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
assert.match(dashboardStyles, /\.student-dashboard-block-body\s*\{[\s\S]*?grid-template-rows 920ms cubic-bezier\(0\.22, 1, 0\.36, 1\)[\s\S]*?opacity 920ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
assert.match(dashboardStyles, /\.student-dashboard-block\.is-collapsed \.student-dashboard-block-body\s*\{[\s\S]*?transition-delay:\s*0s, 0s, 920ms/)
assert.match(dashboardStyles, /\.student-dashboard-collapse-control\s*\{[\s\S]*?width:\s*88px;[\s\S]*?flex:\s*0 0 88px;[\s\S]*?justify-content:\s*center;/)
assert.doesNotMatch(dashboardStyles, /\.student-dashboard-block\.is-collapsed \.student-dashboard-view-switch/)
assert.match(dashboardStyles, /@media \(prefers-reduced-motion: reduce\)/)
assert.match(dashboardStyles, /\.student-dashboard-classroom-cards/)
assert.match(dashboardStyles, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
assert.match(dashboardStyles, /\.student-dashboard-classroom-card-link:hover\s*\{[\s\S]*?text-decoration:\s*none/)
assert.match(dashboardStyles, /\.student-dashboard-classroom-card-link:hover \.student-dashboard-classroom-card-action\s*\{[\s\S]*?text-decoration:\s*underline/)
assert.match(dashboardStyles, /\.student-dashboard-classroom-card\[data-card-color="coral"\]/)
assert.match(dashboardStyles, /\.student-dashboard-classroom-card-menu-panel/)
assert.doesNotMatch(dashboardStyles, /student-dashboard-customize-actions|#customize-dashboard/)
assert.match(dashboardStyles, /@media \(max-width: 640px\)[\s\S]*?\.student-dashboard-block-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/)
assert.match(dashboardStyles, /@media \(max-width: 360px\)[\s\S]*?\.student-dashboard-topbar\s*\{[\s\S]*?flex-wrap:\s*wrap/)
assert.match(dashboardStyles, /@media \(max-width: 360px\)[\s\S]*?\.student-dashboard-navigation\s*\{[\s\S]*?order:\s*3[\s\S]*?width:\s*100%/)
assert.match(styles, /\.student-dashboard-menu-panel/)
assert.doesNotMatch(dashboardStyles, /border[^;]*dashed/)
assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.student-dashboard-topbar/)

assert.match(classroomSpaceHtml, /id="classroom-space"/)
assert.match(classroomSpaceHtml, /Forum/)
assert.match(classroomSpaceHtml, /Assignments/)
assert.match(classroomSpaceHtml, /Report cards/)
assert.match(classroomSpaceHtml, /id="classroom-space-live-entry"/)
assert.match(classroomSpaceHtml, /An eligible scheduled Class is required/)
assert.match(classroomSpaceHtml, /theme-bootstrap\.js/)
assert.match(classroomSpaceJs, /requireAuth\(\['student', 'teacher', 'tutor', 'mentor'\]\)/)
assert.match(classroomSpaceJs, /getClassroomSpaceData/)
assert.match(classroomSpaceJs, /searchParams\.get\('classroom'\)/)
assert.doesNotMatch(classroomSpaceJs, /searchParams\.get\(['"]role['"]\)/)
assert.match(classroomSpaceCss, /@media \(max-width: 560px\)/)
assert.match(classroomSpaceCss, /\.classroom-progress-confirm-dialog\s*\{[\s\S]*?inset:\s*0[\s\S]*?margin:\s*auto/)

const packageJson = JSON.parse(packageJsonSource)
assert.equal(packageJson.scripts['test:student-dashboard'], 'node tools/student-dashboard-foundation-self-test.mjs')

console.log('Dashboard shell, canonical Phase 5.G.2.2 Calendar consumer, active Classroom Cards, and centered progress confirmation self-test passed.')
