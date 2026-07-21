import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
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
  migration, refinementMigration, cardMigration, calendarMigration,
  dbTest, cardDbTest, calendarDbTest, dataAdapter,
  html, dashboard, styles, classroomSpaceHtml, classroomSpaceJs, classroomSpaceCss, packageJsonSource
] = await Promise.all([
  readText('supabase/migrations/202607200005_student_dashboard_foundation.sql'),
  readText('supabase/migrations/202607200006_student_dashboard_refinements.sql'),
  readText('supabase/migrations/202607200007_student_classroom_cards.sql'),
  readText('supabase/migrations/202607200008_student_calendar_surface.sql'),
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
  range: { startDate: '2026-07-01', endDate: '2026-07-31', timeZone: 'America/Sao_Paulo' },
  events: [
    { id: 'schedule:a', kind: 'schedule_milestone', startsOn: '2026-07-22', endsOn: '2026-07-22', title: 'Kinematics', courseId: 'course-a', classroomId: 'classroom-a', colorKey: 'coral' },
    { id: 'assignment:a', kind: 'assignment_due', startsOn: '2026-07-22', endsOn: '2026-07-22', title: 'Homework due', courseId: 'course-a', classroomId: 'classroom-a', action: { type: 'open_practice', assignmentId: 'assignment-a' } }
  ],
  availabilityOverlay: { status: 'contract_only_phase_2e', eligibleContexts: [{ courseId: 'course-a', classroomId: 'classroom-a', tutor: { id: 'tutor-a', name: 'Tutor A' } }] }
})
assert.equal(normalizedCalendar.events.length, 2)
assert.equal(normalizedCalendar.events[0].startsOn, normalizedCalendar.events[1].startsOn)
assert.equal(normalizedCalendar.events[1].action.assignmentId, 'assignment-a')
assert.equal(normalizedCalendar.availabilityOverlay.eligibleContexts.length, 1)

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

assert.doesNotMatch(migration, /important_links|student_events/)
assert.match(dbTest, /set local role authenticated;/i)
assert.match(dbTest, /jsonb_array_length\(payload -> 'classrooms'\) <> 0/)
assert.match(dbTest, /rollback;/i)
assert.match(cardDbTest, /set local role authenticated;/i)
assert.match(cardDbTest, /cross-Student Classroom Card customization denial/i)
assert.match(cardDbTest, /outsider Classroom-space denial/i)
assert.match(cardDbTest, /rollback;/i)
assert.match(calendarDbTest, /Kinematics milestone/)
assert.match(calendarDbTest, /Kinematics homework due/)
assert.match(calendarDbTest, /Legacy milestone must stay hidden/)
assert.match(calendarDbTest, /Student B received Student A Calendar data/)
assert.match(calendarDbTest, /rollback;/i)
assert.match(dataAdapter, /supabase\.rpc\('get_my_student_dashboard'\)/)
assert.match(dataAdapter, /supabase\.rpc\('get_my_student_calendar'/)
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
assert.match(dashboard, /prefers-reduced-motion: reduce/)
assert.doesNotMatch(dashboard, /body\?\.classList\.toggle\('is-hidden'/)
assert.match(dashboard, /const daysInMonth = new Date/)
assert.match(dashboard, /async function loadCalendarData/)
assert.match(dashboard, /data-calendar-navigation/)
assert.match(dashboard, /course-practice\.html\?assignment=/)
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
assert.match(dashboardStyles, /\.student-dashboard-calendar-event/)
assert.match(dashboardStyles, /\.student-dashboard-calendar-event\[data-card-color="coral"\]/)
assert.match(dashboardStyles, /\.student-dashboard-block-copy\[data-dashboard-drag-handle\]/)
assert.match(dashboardStyles, /\.student-dashboard-feedback\s*\{[\s\S]*?position:\s*fixed[\s\S]*?bottom:/)
assert.match(dashboardStyles, /\.student-dashboard-block-body\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\)/)
assert.match(dashboardStyles, /\.student-dashboard-block\.is-collapsed \.student-dashboard-block-body\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 0fr\)/)
assert.match(dashboardStyles, /@media \(prefers-reduced-motion: reduce\)/)
assert.match(dashboardStyles, /\.student-dashboard-classroom-cards/)
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
assert.match(classroomSpaceHtml, /A scheduled Classroom tool—not the Classroom itself/)
assert.match(classroomSpaceHtml, /theme-bootstrap\.js/)
assert.match(classroomSpaceJs, /requireAuth\(\['student', 'teacher', 'tutor', 'mentor'\]\)/)
assert.match(classroomSpaceJs, /getClassroomSpaceData/)
assert.match(classroomSpaceJs, /searchParams\.get\('classroom'\)/)
assert.doesNotMatch(classroomSpaceJs, /searchParams\.get\(['"]role['"]\)/)
assert.match(classroomSpaceCss, /@media \(max-width: 560px\)/)

const packageJson = JSON.parse(packageJsonSource)
assert.equal(packageJson.scripts['test:student-dashboard'], 'node tools/student-dashboard-foundation-self-test.mjs')

console.log('Phase 2.B–2.E Dashboard shell, active Classroom Cards, authenticated Classroom entry, and Calendar surface self-test passed.')
