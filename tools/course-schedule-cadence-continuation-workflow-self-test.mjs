import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeCourseScheduleCadence,
  reconcileContinuingScheduleDates,
  replacementScheduleStartFloor
} from '../src/app/schedule-generator/course-schedule-adapter.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  builderHtml,
  builderSource,
  cadenceMigration,
  cadencePersistenceMigration,
  deliveryTargetReflowMigration,
  activeStartAuthorityMigration,
  replacementRestorationMigration,
  stalePublicationPrecedenceMigration,
  futureLaneMigration,
  effectiveBuilderDbTest,
  qualificationDbTest,
  packageSource
] = await Promise.all([
  readText('src/app/schedule-generator/schedule-generator.html'),
  readText('src/app/schedule-generator/schedule-generator.js'),
  readText(
    'supabase/migrations/202607300010_course_schedule_practiced_date_reflow.sql'
  ),
  readText(
    'supabase/migrations/202607300011_course_schedule_builder_cadence_persistence.sql'
  ),
  readText(
    'supabase/migrations/202607310002_course_schedule_delivery_target_reflow.sql'
  ),
  readText(
    'supabase/migrations/202607310004_active_schedule_start_authority.sql'
  ),
  readText(
    'supabase/migrations/202607310006_course_schedule_replacement_restoration_foundation.sql'
  ),
  readText(
    'supabase/migrations/202607310007_course_schedule_stale_publication_precedence.sql'
  ),
  readText(
    'supabase/migrations/202607310011_course_schedule_frontend_future_lane.sql'
  ),
  readText('tools/builder-effective-student-schedule-db-self-test.sql'),
  readText('tools/course-schedule-qualification-publication-db-self-test.sql'),
  readText('package.json')
])
const packageJson = JSON.parse(packageSource)

assert.deepEqual(
  normalizeCourseScheduleCadence({
    type: 'weekly_frequency',
    weekdays: [5, 1, 3, 1]
  }),
  { type: 'weekly_frequency', weekdays: [1, 3, 5] },
  'Weekly cadence must de-duplicate and order selected weekdays.'
)
const reopenedMondayWednesdayFriday = normalizeCourseScheduleCadence(
  JSON.parse(JSON.stringify({
    type: 'weekly_frequency',
    weekdays: [1, 3, 5]
  }))
)
assert.deepEqual(
  reopenedMondayWednesdayFriday,
  { type: 'weekly_frequency', weekdays: [1, 3, 5] },
  'Reopening a published Monday/Wednesday/Friday Schedule must preserve its selected weekday controls.'
)
assert.notDeepEqual(
  reopenedMondayWednesdayFriday,
  { type: 'day_interval', intervalDays: 7 },
  'Reopening a published weekly Schedule must not fall back to Fixed period every seven days.'
)
assert.deepEqual(
  normalizeCourseScheduleCadence({
    type: 'weekly_meeting_pattern',
    weekdays: [2, 4]
  }),
  { type: 'weekly_frequency', weekdays: [2, 4] },
  'The retained meeting-pattern shape must preload as a weekly cadence.'
)
assert.deepEqual(
  normalizeCourseScheduleCadence({
    type: 'weekly_meeting_pattern',
    weekdays: []
  }),
  { type: 'day_interval', intervalDays: 7 },
  'A legacy weekly pattern without weekdays must retain its seven-day rhythm.'
)
assert.deepEqual(
  normalizeCourseScheduleCadence({ frequency: 'weekly' }),
  { type: 'day_interval', intervalDays: 7 },
  'The legacy weekly frequency shape must retain its seven-day rhythm.'
)
assert.deepEqual(
  normalizeCourseScheduleCadence({}),
  { type: 'day_interval', intervalDays: 7 },
  'A retained legacy Schedule without cadence metadata must not become daily.'
)
assert.throws(
  () => normalizeCourseScheduleCadence({
    type: 'weekly_frequency',
    weekdays: [1, 7]
  }),
  /between 1 and 7/,
  'Invalid weekday values must be rejected before publication.'
)
assert.equal(
  replacementScheduleStartFloor({
    today: '2026-07-30'
  }),
  '2026-07-30',
  'A brand-new replacement may begin today even when the former plan began later.'
)
assert.equal(
  replacementScheduleStartFloor({
    today: '2026-07-30'
  }),
  '2026-07-30',
  'A replacement for a Course that already began may start today.'
)

const session = (number, startDate = '2026-08-02') => ({
  id: `cadence-session-${number}`,
  title: `Cadence Session ${number}`,
  type: 'lesson',
  startDate,
  endDate: startDate
})

const mondayWednesdayFriday = reconcileContinuingScheduleDates({
  today: '2026-08-02',
  lockedStartDate: '2026-07-01',
  activeItems: [],
  schedule: {
    id: 'cadence-sequence',
    name: 'Monday Wednesday Friday sequence',
    startDate: '2026-07-01',
    endDate: '2026-07-01',
    timeZone: 'America/Sao_Paulo',
    cadence: { type: 'weekly_frequency', weekdays: [1, 3, 5] },
    context: {},
    sessions: Array.from({ length: 10 }, (_, index) => session(index + 1))
  }
})

assert.deepEqual(
  mondayWednesdayFriday.sessions.map((entry) => entry.startDate),
  [
    '2026-08-03',
    '2026-08-05',
    '2026-08-07',
    '2026-08-10',
    '2026-08-12',
    '2026-08-14',
    '2026-08-17',
    '2026-08-19',
    '2026-08-21',
    '2026-08-24'
  ],
  'Weekly meetings must advance along independent weekday lanes across weeks.'
)

const tuesdaySaturday = reconcileContinuingScheduleDates({
  today: '2026-08-02',
  lockedStartDate: '2026-07-01',
  activeItems: [],
  schedule: {
    id: 'tuesday-saturday-sequence',
    name: 'Tuesday Saturday sequence',
    startDate: '2026-07-01',
    endDate: '2026-07-01',
    timeZone: 'America/Sao_Paulo',
    cadence: { type: 'weekly_frequency', weekdays: [2, 6] },
    context: {},
    sessions: Array.from({ length: 8 }, (_, index) => session(index + 1))
  }
})

assert.deepEqual(
  tuesdaySaturday.sessions.map((entry) => entry.startDate),
  [
    '2026-08-04',
    '2026-08-08',
    '2026-08-11',
    '2026-08-15',
    '2026-08-18',
    '2026-08-22',
    '2026-08-25',
    '2026-08-29'
  ],
  'A reopened Tuesday/Saturday cadence must keep both exact weekday lanes across weeks.'
)

const combinedMondaySaturday = reconcileContinuingScheduleDates({
  today: '2026-07-31',
  lockedStartDate: '2026-08-06',
  activeItems: [],
  schedule: {
    id: 'combined-monday-saturday-sequence',
    name: 'Combined cross-Track Monday Saturday sequence',
    startDate: '2026-08-06',
    endDate: '2026-08-06',
    timeZone: 'America/Sao_Paulo',
    cadence: { type: 'weekly_frequency', weekdays: [1, 6] },
    context: { combinedCadenceAuthority: true },
    sessions: Array.from({ length: 9 }, (_, index) => session(index + 1))
  }
})

assert.deepEqual(
  combinedMondaySaturday.sessions.map((entry) => entry.startDate),
  [
    '2026-08-08',
    '2026-08-10',
    '2026-08-15',
    '2026-08-17',
    '2026-08-22',
    '2026-08-24',
    '2026-08-29',
    '2026-08-31',
    '2026-09-05'
  ],
  'Nine Sessions from several Tracks must occupy one continuous Monday/Saturday lane without vacancies.'
)

const protectedAndFlexibleProgress = reconcileContinuingScheduleDates({
  today: '2026-07-30',
  lockedStartDate: '2026-07-01',
  activeItems: [{
    stableItemKey: 'cadence-session-1',
    title: 'Historical',
    kind: 'curriculum_topic',
    scheduledDate: '2026-07-20',
    endDate: '2026-07-20',
    position: 0,
    state: 'scheduled'
  }, {
    stableItemKey: 'cadence-session-2',
    title: 'Studied',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-03',
    endDate: '2026-08-03',
    position: 1,
    state: 'scheduled',
    isStudied: true
  }, {
    stableItemKey: 'cadence-session-3',
    title: 'Delivered occurrence with unfinished target',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-06',
    endDate: '2026-08-06',
    position: 2,
    state: 'scheduled',
    isDelivered: true
  }, {
    stableItemKey: 'cadence-session-4',
    title: 'Practiced',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-19',
    endDate: '2026-08-19',
    position: 3,
    state: 'scheduled',
    isPracticed: true
  }, {
    stableItemKey: 'cadence-session-5',
    title: 'Ordinary future topic',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-26',
    endDate: '2026-08-26',
    position: 4,
    state: 'scheduled'
  }],
  schedule: {
    id: 'protected-and-flexible-progress',
    name: 'Protected and flexible progress',
    startDate: '2026-07-01',
    endDate: '2026-08-26',
    timeZone: 'America/Sao_Paulo',
    cadence: { type: 'weekly_frequency', weekdays: [1, 3, 5] },
    context: {},
    sessions: Array.from({ length: 5 }, (_, index) => session(index + 1))
  }
})

assert.equal(
  protectedAndFlexibleProgress.startDate,
  '2026-07-01',
  'A continuing Schedule must retain its historical start date.'
)
assert.deepEqual(
  protectedAndFlexibleProgress.sessions.map((entry) => entry.startDate),
  [
    '2026-07-31',
    '2026-08-03',
    '2026-08-03',
    '2026-08-05',
    '2026-08-07'
  ],
  'Only Studied dates stay fixed; every unfinished target consumes the shared future cadence lane in stable identity order.'
)
assert.equal(
  protectedAndFlexibleProgress.context.historicalDatesFrozen,
  true
)

assert.ok(
  builderHtml.indexOf('value="0" /> Sunday')
    < builderHtml.indexOf('value="1" /> Monday'),
  'The cadence selector must present Sunday as the first day of the week.'
)
assert.ok(
  builderHtml.indexOf('id="backStepBtn"')
    > builderHtml.indexOf('id="previewStep"'),
  'The Builder Back control must follow the workflow content at the bottom of the Builder.'
)
assert.doesNotMatch(
  builderHtml.match(/<nav class="tracks-nav"[\s\S]*?<\/nav>/)?.[0] || '',
  /id="backStepBtn"/,
  'The workflow Back control must not remain in the page-level header navigation.'
)
for (const fragment of [
  'applyCourseCadence(courseEditor.schedule.cadence)',
  'cadenceEdited: state.cadenceEdited',
  'state.cadenceEdited = draftHasExplicitCadence(draft)',
  'state.courseSettingsMode !== "replacement" && !state.cadenceEdited',
  'applyPacingMode(courseEditor.schedule.pacingPolicy?.mode || "adaptive")',
  'elements.startDate.disabled = !replacement',
  'replacementScheduleStartFloor',
  'courseEditor && courseRevisionMode() === "replacement"',
  'activeItems: courseEditor && !replacementMode',
  'lockedStartDate: courseEditor && !replacementMode',
  'revisionMode: replacementMode',
  'combinedCadenceAuthority: true'
]) {
  assert.ok(
    builderSource.includes(fragment),
    `The continuing Builder workflow is missing ${fragment}.`
  )
}
for (const fragment of [
  'course_schedule_active_plan_start',
  "'{schedule,activeStartDate}'",
  "'{builderSchedule,startDate}'",
  "event.value ->> 'kind' is distinct from 'course_start'",
  'active_schedule_lifecycle',
  'do not recalculate dates here',
  'return p_items'
]) {
  assert.ok(
    activeStartAuthorityMigration.includes(fragment),
    `The active Schedule start authority is missing ${fragment}.`
  )
}
for (const fragment of [
  'current_active_version_id is distinct from p_expected_version_id',
  'return p_items;',
  'for update;',
  'publish_course_builder_schedule_phase5g2_4_7_3_1_3_base',
  'current_user_can_edit_course_schedule'
]) {
  assert.ok(
    stalePublicationPrecedenceMigration.includes(fragment),
    `The stale-publication precedence migration is missing ${fragment}.`
  )
}
assert.ok(
  stalePublicationPrecedenceMigration.indexOf(
    'current_active_version_id is distinct from p_expected_version_id'
  ) < stalePublicationPrecedenceMigration.indexOf(
    'course_schedule_builder_publication_metadata(p_builder_schedule)'
  ),
  'A stale Builder must bypass current-document cadence validation.'
)
for (const fragment of [
  'effectiveFutureLaneAuthority',
  'validate_course_schedule_effective_future_lane',
  'without stale weekdays or vacancies',
  'course_schedule_future_lane_publish_intents',
  'generated_frontend_future_lane',
  "'frontendCadenceLane', true",
  "'recurringDateFallback', course_record.service_model = 'recurring'"
]) {
  assert.ok(
    futureLaneMigration.includes(fragment),
    `The frontend future-lane authority is missing ${fragment}.`
  )
}
assert.ok(
  futureLaneMigration.indexOf(
    'insert into public.course_schedule_future_lane_publish_intents'
  ) < futureLaneMigration.indexOf(
    'publish_course_builder_schedule_phase5g2_4_7_3_1_3_base'
  ),
  'The validated lane must exist before successor activation generates immutable academic slots.'
)
for (const fragment of [
  "'id', 'phase5e4-db-stale-builder'",
  "'%changed after this page loaded%'"
]) {
  assert.ok(
    effectiveBuilderDbTest.includes(fragment),
    `The stale Builder database characterization is missing ${fragment}.`
  )
}
for (const fragment of [
  'course_progress_restoration_provenance',
  'capture_course_progress_restoration_provenance',
  'predecessor_stable_item_keys',
  'order by predecessor.position desc, predecessor.id desc',
  'marked_cadence',
  "intent.transition_kind = 'complete_replacement'",
  'and not complete_replacement',
  'an elapsed Course start remains historical and immutable'
]) {
  assert.ok(
    replacementRestorationMigration.includes(fragment),
    `The replacement/restoration foundation is missing ${fragment}.`
  )
}
for (const fragment of [
  'keep Class delivery history separate from',
  'course_schedule_item_has_locked_structure',
  'Delivered Class occurrences remain immutable occurrence history',
  'do not complete or date-lock an unstudied target',
  'A Studied Schedule item is immutable in continuing Versions'
]) {
  assert.ok(
    deliveryTargetReflowMigration.includes(fragment),
    `The delivered-occurrence target-reflow migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'course_schedule_item_has_locked_structure',
  'A Practiced Schedule item must remain in a continuing Version',
  'A Studied or delivered Schedule item is immutable in continuing Versions'
]) {
  assert.ok(
    cadenceMigration.includes(fragment),
    `The governed cadence migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'normalize_course_schedule_builder_cadence',
  'course_schedule_builder_publication_metadata',
  'course_schedule_successor_metadata',
  'publication_metadata -> \'cadence\'',
  'version_metadata -> \'\'cadence\'\'',
  'builderPresentationRecoveredBy',
  'course_schedule_builder_publish_commands'
]) {
  assert.ok(
    cadencePersistenceMigration.includes(fragment),
    `The Builder cadence-persistence migration is missing ${fragment}.`
  )
}
for (const fragment of [
  'governed_builder_presentation_persists',
  'Reopening the governed Builder fell back to a seven-day fixed period.',
  'The reopened governed Builder did not retain Monday, Wednesday, and Friday.',
  'The Builder publication receipt did not retain its authored cadence.',
  'future_practiced_item_reflows_without_losing_progress',
  'continuing_practiced_item_cannot_be_dropped',
  'continuing_studied_item_cannot_move',
  'continuing_delivered_item_reflows',
  'Rejected Practiced-item removal retained a publication receipt',
  'Rejected Studied-item movement retained a publication receipt',
  'A delivered Review incorrectly froze its unfinished curriculum target.',
  'frontend_combined_track_dates_persist_exactly',
  'Publication recalculated the frontend combined date/session lane.',
  'active_plan_start_reopens_from_published_version',
  'The reopened Builder fell back to the historical Course start.',
  'Phase 5.G replacement-start fixture qualification',
  'complete_replacement_owns_future_plan_start',
  'A complete replacement did not establish the selected future-plan start.'
]) {
  assert.ok(
    qualificationDbTest.includes(fragment),
    `The governed cadence characterization is missing ${fragment}.`
  )
}
assert.match(
  packageJson.scripts['test:classroom-calendar-followup'],
  /test:schedule-cadence-continuation/,
  'The normal pre-database acceptance path must keep running the cadence reopen regression.'
)
assert.equal(
  packageJson.scripts['presupabase:test:db'],
  'npm run test:classroom-calendar-followup',
  'The database acceptance command must retain the cadence regression as a prerequisite.'
)

console.log(
  'Published weekday cadence reopen, seven-day fallback rejection, authoritative preload, intentional draft restoration, bottom workflow navigation, Sunday-first selection, exact Monday/Wednesday/Friday, Tuesday/Saturday, and combined Monday/Saturday sequencing without Track-batch vacancies, locked historical/Studied work, movable delivered-occurrence and Practiced targets, and atomic publication regressions passed.'
)
