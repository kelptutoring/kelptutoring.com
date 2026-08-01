import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyCourseScheduleRevision,
  courseScheduleTrackRemovalState
} from '../src/app/schedule-generator/multi-branch-builder-contract.js'
import {
  reconcileContinuingScheduleDates
} from '../src/app/schedule-generator/course-schedule-adapter.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  html,
  builder,
  styles,
  adapter,
  replacementGuardMigration,
  cadenceMigration,
  dbTest,
  plan
] = await Promise.all([
  readText('src/app/schedule-generator/schedule-generator.html'),
  readText('src/app/schedule-generator/schedule-generator.js'),
  readText('src/styles/style.css'),
  readText('src/app/schedule-generator/course-schedule-adapter.js'),
  readText(
    'supabase/migrations/202607300009_schedule_continuation_replacement_guard.sql'
  ),
  readText(
    'supabase/migrations/202607300010_course_schedule_practiced_date_reflow.sql'
  ),
  readText('tools/course-schedule-qualification-publication-db-self-test.sql'),
  readText('IMPLEMENTATION_PLAN.md')
])

assert.equal(classifyCourseScheduleRevision({
  activeTrackIds: ['algebra-1', 'biology'],
  selectedTrackIds: ['algebra-1', 'chemistry']
}), 'incremental', 'Keeping one active Track makes an ordinary partial revision.')
assert.equal(classifyCourseScheduleRevision({
  activeTrackIds: ['algebra-1', 'biology'],
  selectedTrackIds: ['algebra-2', 'chemistry']
}), 'replacement', 'Replacing all active Tracks starts a new Schedule.')
assert.equal(courseScheduleTrackRemovalState({
  trackId: 'biology',
  selectedTrackIds: ['algebra-1', 'biology'],
  activeTrackIds: ['algebra-1', 'biology'],
  workedTrackIds: ['algebra-1']
}).action, 'remove', 'An untouched Track can leave an ordinary revision.')
assert.equal(courseScheduleTrackRemovalState({
  trackId: 'algebra-1',
  selectedTrackIds: ['algebra-1', 'biology'],
  activeTrackIds: ['algebra-1', 'biology'],
  workedTrackIds: ['algebra-1']
}).action, 'start_new_schedule', 'A started Track requires a replacement.')

const continued = reconcileContinuingScheduleDates({
  today: '2026-07-30',
  lockedStartDate: '2026-07-02',
  activeItems: [{
    stableItemKey: 'past',
    title: 'Past',
    kind: 'curriculum_topic',
    scheduledDate: '2026-07-23',
    endDate: '2026-07-23',
    position: 0,
    state: 'scheduled'
  }, {
    stableItemKey: 'practiced',
    title: 'Practiced',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-06',
    endDate: '2026-08-06',
    position: 1,
    state: 'scheduled',
    isPracticed: true
  }, {
    stableItemKey: 'future',
    title: 'Future',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-13',
    endDate: '2026-08-13',
    position: 2,
    state: 'scheduled'
  }],
  schedule: {
    id: 'continuation',
    name: 'Continuation',
    startDate: '2026-07-02',
    endDate: '2026-07-09',
    timeZone: 'America/Sao_Paulo',
    cadence: { type: 'weekly_frequency', weekdays: [1, 3, 5] },
    context: {},
    sessions: [{
      id: 'past',
      title: 'Past',
      startDate: '2026-07-02',
      endDate: '2026-07-02'
    }, {
      id: 'practiced',
      title: 'Practiced',
      startDate: '2026-07-09',
      endDate: '2026-07-09'
    }, {
      id: 'future',
      title: 'Future',
      startDate: '2026-07-16',
      endDate: '2026-07-16'
    }]
  }
})
assert.equal(continued.startDate, '2026-07-02')
assert.deepEqual(
  continued.sessions.map((session) => session.startDate),
  ['2026-07-31', '2026-08-03', '2026-08-05']
)

assert.match(html, /id="startDateHelp"/)
assert.match(builder, /elements\.startDate\.disabled = !replacement/)
assert.match(builder, /cadence changes recalculate future meetings and milestones only/)
assert.match(builder, /courseEditor && courseRevisionMode\(\) === "replacement"/)
assert.match(builder, /activeItems: courseEditor && !replacementMode/)
assert.match(builder, /lockedStartDate: courseEditor && !replacementMode/)
assert.match(builder, /revisionMode: replacementMode/)
assert.match(builder, /normalizeCourseScheduleCadence/)
assert.ok(
  html.indexOf('value="0" /> Sunday')
    < html.indexOf('value="1" /> Monday'),
  'Weekday choices must be presented Sunday through Saturday.'
)
assert.match(styles, /\.generator-week-card\.selected\[data-session-status\]/)
assert.match(adapter, /historicalDatesFrozen: true/)
assert.doesNotMatch(
  adapter,
  /existing\.isStudied\s*\|\|\s*existing\.isDelivered/,
  'A delivered Class occurrence must not freeze an unfinished future curriculum target.'
)
for (const fragment of [
  'course_schedule_item_has_started_work',
  'course_schedule_track_has_worked_progress',
  'publish_course_builder_schedule_phase5g2_4_7_2_base',
  "outcome.resolution_status = 'delivered'",
  "transition_kind <> 'complete_replacement'",
  'A started Schedule item is immutable in continuing Versions'
]) {
  assert.ok(
    replacementGuardMigration.includes(fragment),
    `Continuation migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'course_schedule_item_has_locked_structure',
  'A Practiced Schedule item must remain in a continuing Version',
  'A Studied or delivered Schedule item is immutable',
  'Practiced Schedule-item date reflow could not be governed'
]) {
  assert.ok(
    cadenceMigration.includes(fragment),
    `Cadence reflow migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'delivered_class_starts_track_without_progress',
  'delivered_track_requires_new_schedule',
  'future_practiced_item_reflows_without_losing_progress',
  'A delivered Class did not establish started Track work',
  'A future Practiced item did not reflow with its progress intact',
  'Rejected delivered Track removal retained a publication receipt'
]) {
  assert.ok(dbTest.includes(fragment), `Continuation DB characterization is missing ${fragment}.`)
}
assert.match(plan, /5\.G\.2\.4\.7\.3 .*Builder continuation and replacement UX/i)

console.log(
  'Active-Schedule locked start, future cadence continuation, untouched-Track adjustment, started-Track replacement, delivered-Class, and selected-session UX contracts passed.'
)
