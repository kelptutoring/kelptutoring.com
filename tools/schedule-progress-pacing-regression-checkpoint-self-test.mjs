import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  progressDbTest,
  pacingDbTest,
  qualificationDbTest,
  progressMigration,
  classroomHtml,
  classroomPage,
  classroomStyles,
  continuationTest,
  qualificationTest,
  manualQaTest,
  historyTest,
  localRunner,
  postRunAudit,
  packageDocument
] = await Promise.all([
  readText('tools/course-progress-ledger-db-self-test.sql'),
  readText('tools/course-schedule-pacing-policy-db-self-test.sql'),
  readText('tools/course-schedule-qualification-publication-db-self-test.sql'),
  readText('supabase/migrations/202607300005_staff_progress_explanations_and_schedule_log.sql'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('tools/course-schedule-continuation-replacement-self-test.mjs'),
  readText('tools/course-schedule-qualification-publication-self-test.mjs'),
  readText('tools/manual-qa-network-self-test.mjs'),
  readText('tools/classroom-learning-history-self-test.mjs'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/local-supabase-post-run-audit.sql'),
  readText('package.json')
])

for (const fragment of [
  'A Student may independently study a later Session without supplying a reason.',
  'Expected the later-topic Tutor mark to require a reason.',
  'Mentor correction reopened the active academic Schedule.',
  'Expected an ordinary Tutor mark without an explanation to fail.',
  'The Student current-Schedule Log did not expose public staff explanations while excluding private notes.'
]) {
  assert.ok(
    progressDbTest.includes(fragment),
    `Student/Tutor/Mentor progress parity is missing: ${fragment}`
  )
}
assert.match(
  progressMigration,
  /Student-visible explanation is required whenever a Tutor or Mentor marks or unmarks Studied progress/
)

for (const id of [
  'classroom-progress-confirm-dialog',
  'classroom-progress-reason-dialog'
]) {
  assert.match(classroomHtml, new RegExp(`id="${id}"`))
}
assert.ok(
  [...classroomPage.matchAll(/\.showModal\(\)/g)].length >= 2,
  'Both progress workflows must use modal dialogs.'
)
assert.match(
  classroomStyles,
  /\.classroom-progress-confirm-dialog\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0[\s\S]*?margin:\s*auto/
)

for (const fragment of [
  'Current-time pre-start correction characterization.',
  'Expected an explicit pre-start back-report to fail.'
]) {
  assert.ok(
    progressDbTest.includes(fragment),
    `Pre-start authority coverage is missing: ${fragment}`
  )
}

for (const fragment of [
  'Adaptive independent progress did not move the next unfinished topic forward.',
  'Adaptive recurring progress outside the hold did not move the next unfinished topic into the freed Class date.',
  'Static progress changed a frozen future effective date.',
  'The Student could mark Studied while a timed Class was inside the six-hour hold.',
  'The six-hour Student hold incorrectly blocked Reviewed or Practiced progress.',
  'rejected six-hour Student action retained a progress event',
  'rejected six-hour Student action retained a target lock',
  'rejected six-hour Student action moved the prepared target',
  'The valid Tuesday/Thursday frontend future lane was not preserved exactly.',
  'A stale weekday was accepted inside the frontend future lane.'
]) {
  assert.ok(
    pacingDbTest.includes(fragment),
    `Adaptive/Static or six-hour coverage is missing: ${fragment}`
  )
}

for (const fragment of [
  'An untouched Track can leave an ordinary revision.',
  'A started Track requires a replacement.',
  'delivered_class_starts_track_without_progress',
  'future_practiced_item_reflows_without_losing_progress',
  'Rejected delivered Track removal retained a publication receipt'
]) {
  assert.ok(
    continuationTest.includes(fragment),
    `Continuation/replacement coverage is missing: ${fragment}`
  )
}

for (const fragment of [
  'assigned Tutor is not actively qualified',
  'A rejected qualification check partially changed the active Version.',
  'The assigned-Tutor qualification audit snapshot is incomplete'
]) {
  assert.ok(
    qualificationDbTest.includes(fragment),
    `Qualification publication coverage is missing: ${fragment}`
  )
}
assert.match(qualificationTest, /complete-plan qualification/)
assert.match(manualQaTest, /manual_qualification_coverage_ready/)

for (const fragment of [
  'Student learning history did not isolate worked Sessions from the superseded Schedule',
  'The Student history did not retain only Studied or Practiced Sessions',
  'Expected Student Schedule-audit access to fail',
  'The assigned Tutor did not receive printable Schedule audit history',
  'The Mentor did not receive the complete printable Schedule audit history'
]) {
  assert.ok(
    historyTest.includes(fragment),
    `Immutable or role-redacted History coverage is missing: ${fragment}`
  )
}

assert.match(localRunner, /All \$\{databaseTests\.length\} rollback database characterizations passed/)
assert.match(localRunner, /zero characterization rows retained/)
assert.match(
  postRunAudit,
  /phase\[0-9\]\[a-z0-9\._-\]\*-db-/i,
  'The residue audit must cover nested Phase acceptance keys such as phase5g2-4-7-2-db-.'
)

const packageJson = JSON.parse(packageDocument)
assert.equal(
  packageJson.scripts['test:schedule-regression-checkpoint'],
  'node tools/schedule-progress-pacing-regression-checkpoint-self-test.mjs'
)
for (const command of [
  'test:schedule-progress',
  'test:schedule-pacing',
  'test:schedule-qualification-publication',
  'test:schedule-continuation',
  'test:schedule-cadence-continuation',
  'test:classroom-history',
  'test:schedule-regression-checkpoint'
]) {
  assert.ok(
    packageJson.scripts['test:schedule-phase'].includes(`npm run ${command}`),
    `The complete Schedule suite is missing ${command}.`
  )
}

console.log(
  'Phase 5.G.2.4.7.4 role parity, modal, pre-start, six-hour, pacing, replacement, qualification, History, and cleanup checkpoint passed.'
)
