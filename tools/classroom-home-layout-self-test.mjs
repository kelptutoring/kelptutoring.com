import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLASSROOM_HOME_BLOCK_KEYS,
  CLASSROOM_HOME_WEEKLY_GROUP_KEY,
  CLASSROOM_HOME_WEEKLY_BLOCK_KEYS,
  moveClassroomHomeBlock,
  normalizeClassroomHomeLayoutPayload,
  placeClassroomHomeHelper,
  placeClassroomHomeBlockAtTarget,
  toggleClassroomHomeBlockCollapsed
} from '../src/app/classroom/classroom-home-layout-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  databaseTest,
  builderDatabaseTest,
  adapter,
  html,
  page,
  styles,
  sharedStyles,
  packageDocument,
  runner
] =
  await Promise.all([
    readText('supabase/migrations/202607260014_classroom_home_layout_preferences.sql'),
    readText('tools/classroom-home-multi-curriculum-db-self-test.sql'),
    readText('tools/builder-effective-student-schedule-db-self-test.sql'),
    readText('src/data/studentData.js'),
    readText('src/app/classroom/classroom-space.html'),
    readText('src/app/classroom/classroom-space.js'),
    readText('src/app/classroom/classroom-space.css'),
    readText('src/styles/style.css'),
    readText('package.json'),
    readText('tools/local-supabase-acceptance.mjs')
  ])
const packageJson = JSON.parse(packageDocument)

assert.deepEqual(CLASSROOM_HOME_BLOCK_KEYS, [
  'progress',
  'this-week',
  'coming-next',
  'calendar'
])
assert.deepEqual(CLASSROOM_HOME_WEEKLY_BLOCK_KEYS, [
  'this-week',
  'coming-next'
])
assert.equal(CLASSROOM_HOME_WEEKLY_GROUP_KEY, 'weekly')

const normalized = normalizeClassroomHomeLayoutPayload({
  schemaVersion: 1,
  classroomId: 'classroom-a',
  blockOrder: ['calendar', 'progress', 'calendar', 'unknown'],
  collapsedBlocks: ['calendar', 'calendar', 'unknown'],
  revision: 3
})
assert.deepEqual(normalized.blockOrder, [
  'calendar',
  'progress',
  'this-week',
  'coming-next'
])
assert.deepEqual(normalized.collapsedBlocks, ['calendar'])
assert.equal(normalized.revision, 3)

const normalizedLegacyWeeklyLayout = normalizeClassroomHomeLayoutPayload({
  blockOrder: ['progress', 'coming-next', 'calendar', 'this-week'],
  collapsedBlocks: ['coming-next']
})
assert.deepEqual(normalizedLegacyWeeklyLayout.blockOrder, [
  'progress',
  'this-week',
  'coming-next',
  'calendar'
])
assert.deepEqual(normalizedLegacyWeeklyLayout.collapsedBlocks, [
  'this-week',
  'coming-next'
])

const rightEdgeHelper = placeClassroomHomeHelper({
  viewport: { left: 0, top: 0, width: 320, height: 480 },
  anchor: { left: 282, right: 310, top: 430, bottom: 458 },
  panel: { width: 296, height: 200 },
  align: 'end',
  margin: 12,
  gap: 8
})
assert.equal(rightEdgeHelper.left, 12)
assert.equal(rightEdgeHelper.placement, 'above')
assert.ok(rightEdgeHelper.top >= 12)
assert.ok(rightEdgeHelper.left + 296 <= 308)

const offsetViewportHelper = placeClassroomHomeHelper({
  viewport: { left: 100, top: 50, width: 320, height: 400 },
  anchor: { left: 105, right: 133, top: 70, bottom: 98 },
  panel: { width: 296, height: 500 },
  align: 'start',
  margin: 12,
  gap: 8
})
assert.equal(offsetViewportHelper.left, 112)
assert.equal(offsetViewportHelper.top, 106)
assert.equal(offsetViewportHelper.maxHeight, 332)
assert.equal(offsetViewportHelper.placement, 'below')
assert.ok(offsetViewportHelper.top + offsetViewportHelper.maxHeight <= 438)
assert.deepEqual(
  toggleClassroomHomeBlockCollapsed([], CLASSROOM_HOME_WEEKLY_GROUP_KEY),
  ['this-week', 'coming-next']
)
assert.deepEqual(
  toggleClassroomHomeBlockCollapsed(
    ['this-week', 'coming-next'],
    CLASSROOM_HOME_WEEKLY_GROUP_KEY
  ),
  []
)

assert.deepEqual(
  moveClassroomHomeBlock(CLASSROOM_HOME_BLOCK_KEYS, 'calendar', 'up'),
  ['progress', 'calendar', 'this-week', 'coming-next']
)
assert.deepEqual(
  moveClassroomHomeBlock(CLASSROOM_HOME_BLOCK_KEYS, 'this-week', 'up'),
  ['this-week', 'coming-next', 'progress', 'calendar']
)
assert.deepEqual(
  moveClassroomHomeBlock(CLASSROOM_HOME_BLOCK_KEYS, 'coming-next', 'down'),
  ['progress', 'calendar', 'this-week', 'coming-next']
)
assert.deepEqual(
  placeClassroomHomeBlockAtTarget(
    CLASSROOM_HOME_BLOCK_KEYS,
    'calendar',
    'this-week'
  ),
  ['progress', 'calendar', 'this-week', 'coming-next']
)

for (const fragment of [
  'create table if not exists public.classroom_home_preferences',
  'create or replace function public.get_my_classroom_home_preferences',
  'create or replace function public.save_my_classroom_home_preferences',
  "membership.membership_role = 'student'",
  "course.status in ('active', 'wind_down')",
  'Classroom Home block order must contain every block exactly once.',
  'Collapsed Classroom Home blocks contain an unsupported or duplicate value.'
]) {
  assert.ok(migration.includes(fragment), `Layout migration is missing: ${fragment}`)
}

assert.match(adapter, /export async function getClassroomHomePreferences/)
assert.match(adapter, /supabase\.rpc\('get_my_classroom_home_preferences'/)
assert.match(adapter, /export async function saveClassroomHomePreferences/)
assert.match(adapter, /supabase\.rpc\('save_my_classroom_home_preferences'/)

for (const key of CLASSROOM_HOME_BLOCK_KEYS) {
  assert.match(html, new RegExp(`data-classroom-home-block="${key}"`))
}
assert.match(html, /data-toggle-classroom-home-block="progress"/)
assert.match(html, /data-toggle-classroom-home-block="calendar"/)
assert.equal(
  [...html.matchAll(/data-toggle-classroom-home-block="weekly"/g)].length,
  2
)
assert.equal(
  [...html.matchAll(/data-classroom-home-block="/g)].length,
  CLASSROOM_HOME_BLOCK_KEYS.length
)
assert.match(html, /class="classroom-home-layout-controls" hidden/)
assert.match(html, />Minimize<\/button>/)
assert.match(html, /id="classroom-home-weekly-group"/)
assert.equal(
  [...html.matchAll(
    /aria-controls="classroom-home-this-week-body classroom-home-coming-next-body"/g
  )].length,
  2
)

for (const fragment of [
  'bindClassroomHomeLayoutControls()',
  'await loadClassroomHomeLayout()',
  'saveClassroomHomePreferences(',
  'applyClassroomHomeBlockOrder({ animate: true })',
  'toggleClassroomHomeBlockCollapsed(',
  'renderCollapsedClassroomHomeBlocks({ animate: true })',
  'animateClassroomHomeBlockCollapse(body, {',
  'height: `${fromHeight}px`',
  'height: `${toHeight}px`',
  'duration: 920',
  'elements.classroomHomeLayout.append(elements.classroomHomeWeeklyGroup)',
  'classroomHomeBlockGroupKeys(blockKey)',
  'classroomHomeBlocksForGroup(draggingClassroomHomeBlock)',
  'handle.draggable = editable',
  "String(!editable || classroomHomeLayoutSaving)",
  "'aria-busy'",
  'String(up.disabled || classroomHomeLayoutSaving)',
  'String(down.disabled || classroomHomeLayoutSaving)',
  "collapse.setAttribute('aria-disabled', String(classroomHomeLayoutSaving))",
  'return classroomHomeLayoutIsEditable() && !classroomHomeLayoutSaving',
  "button.textContent = collapsed ? 'Maximize' : 'Minimize'",
  'body.inert = collapsed',
  "currentClassroom?.viewer?.membershipRole === 'student'",
  "currentClassroom?.viewer?.membershipStatus === 'active'",
  'classroomHomePreferences = previousPreferences',
  'const requestedPreferences = cloneClassroomHomePreferences()',
  'if (orderChanged) applyClassroomHomeBlockOrder({ animate: true })',
  'if (collapsedChanged) renderCollapsedClassroomHomeBlocks()',
  'readClassroomReloadViewport()',
  'persistClassroomViewport',
  'scheduleClassroomReloadViewportRestoration()',
  'cancelClassroomReloadViewportRestoration',
  'placeClassroomHomeHelper({',
  'syncProgressHelperBlockState(details)',
  "'has-open-progress-helper'",
  "position: 'absolute'",
  'placement.left - detailsBounds.left',
  'placement.top - detailsBounds.top',
  'window.visualViewport?.addEventListener',
  'duration: 920'
]) {
  assert.ok(page.includes(fragment), `Classroom Home layout behavior is missing: ${fragment}`)
}

assert.match(styles, /\.classroom-home-layout\s*\{[\s\S]*grid-template-columns/)
assert.match(styles, /html\s*\{[\s\S]*scrollbar-gutter:\s*stable;/)
assert.match(
  styles,
  /\.classroom-home-weekly-group\s*\{[\s\S]*grid-template-columns:[\s\S]*grid-auto-rows:\s*1fr;[\s\S]*align-items:\s*stretch;/
)
assert.match(styles, /grid-auto-flow:\s*row;/)
assert.doesNotMatch(styles, /grid-auto-flow:\s*row dense;/)
assert.doesNotMatch(styles, /grid-template-rows 1280ms cubic-bezier/)
assert.match(styles, /\.classroom-home-layout-block\.is-collapsed .classroom-home-block-body/)
assert.match(
  styles,
  /\.classroom-home-layout-block\.is-collapsed \.classroom-home-block-body\s*\{[\s\S]*height:\s*0;/
)
assert.match(
  styles,
  /\.classroom-track-progress-help\.is-viewport-positioned > div\s*\{[\s\S]*overflow:\s*auto;/
)
assert.match(
  styles,
  /\.classroom-home-layout-block\.has-open-progress-helper \.classroom-home-block-body,[\s\S]*overflow:\s*visible;/
)
assert.doesNotMatch(page, /content\?\.animate\(/)
assert.doesNotMatch(page, /handle\.draggable = editable && !classroomHomeLayoutSaving/)
assert.doesNotMatch(page, /collapse\.disabled = classroomHomeLayoutSaving/)
assert.doesNotMatch(styles, /\.is-saving-layout \.classroom-home-layout-controls/)
assert.doesNotMatch(
  styles,
  /\.classroom-home-layout-block\.is-collapsed \.classroom-home-block-body > div\s*\{[\s\S]*transform:/
)
assert.match(styles, /overflow-wrap:\s*anywhere;/)
assert.match(
  styles,
  /\.classroom-track-progress-card\.is-collapsed #classroom-track-progress-percent\s*\{[\s\S]*display:\s*none;/
)
assert.match(styles, /data-classroom-home-drag-handle\]\[draggable="true"\]::before/)
assert.match(
  styles,
  /\.classroom-home-collapse-control\s*\{[\s\S]*min-width:\s*82px;[\s\S]*justify-content:\s*center;/
)
assert.match(
  sharedStyles,
  /\.student-dashboard-calendar-day-number\s*\{[\s\S]*min-width:\s*28px;[\s\S]*min-height:\s*28px;[\s\S]*aspect-ratio:\s*1;[\s\S]*border-radius:\s*50%;/
)

assert.match(databaseTest, /Classroom Home preferences did not return server defaults/)
assert.match(databaseTest, /Classroom Home preferences did not round-trip/)
assert.match(databaseTest, /Expected Tutor Classroom Home preference denial/)
assert.match(databaseTest, /Expected outsider Classroom Home preference denial/)
assert.match(runner, /classroom-home-multi-curriculum-db-self-test\.sql/)
assert.equal(
  packageJson.scripts['presupabase:test:db'],
  'npm run test:classroom-calendar-followup'
)
for (const sourceCommand of [
  'test:classroom-home-layout',
  'test:classroom-calendar',
  'test:lesson-request-foundation',
  'test:schedule-version-coverage',
  'test:schedule-consumer-parity',
  'test:classroom-home'
]) {
  assert.ok(
    packageJson.scripts['test:classroom-calendar-followup'].includes(sourceCommand),
    `Fast Supabase preflight is missing ${sourceCommand}.`
  )
}
assert.match(
  builderDatabaseTest,
  /'test\.student_time_zone'[\s\S]*?from public\.user_preferences/
)
assert.match(
  builderDatabaseTest,
  /\{course,studentTimeZone\}[\s\S]*?current_setting\('test\.student_time_zone'\)/
)

console.log('Classroom Home layout self-test passed.')
