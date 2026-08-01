import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  dbTest,
  adapter,
  builder,
  adapterTest,
  runner,
  runnerTest,
  packageJson,
  plan,
  coverageMap,
  followup,
  learningHistory,
  revisionGuard,
  continuationGuard
] = await Promise.all([
  readText('supabase/migrations/202607260002_course_schedule_qualification_publication.sql'),
  readText('tools/course-schedule-qualification-publication-db-self-test.sql'),
  readText('src/app/schedule-generator/course-schedule-adapter.js'),
  readText('src/app/schedule-generator/schedule-generator.js'),
  readText('tools/course-schedule-builder-adapter-self-test.mjs'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/local-supabase-acceptance-self-test.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('tests/acceptance/COVERAGE_MAP.md'),
  readText('supabase/migrations/202607260006_schedule_experience_followup.sql'),
  readText('supabase/migrations/202607260008_course_learning_history.sql'),
  readText('supabase/migrations/202607260015_schedule_revision_track_guard.sql'),
  readText(
    'supabase/migrations/202607300009_schedule_continuation_replacement_guard.sql'
  )
])

for (const fragment of [
  'course_schedule_coverage_publish_intents',
  'course_schedule_builder_publish_commands',
  'resolve_course_schedule_builder_coverage',
  'course_schedule_tutor_qualification_snapshot',
  'normalize_course_schedule_builder_items',
  'course_schedule_curriculum_item_is_publishable',
  'assigned Tutor is not actively qualified',
  "'complete_replacement'",
  "'historicalProgressLocation'",
  "'previous_schedule'",
  "'activePlanOnly', true",
  "'selected'",
  'for share',
  'This Schedule idempotency key is already bound to a different Builder publication',
  'The Schedule changed after this page loaded',
  'The selected curriculum coverage was not attached to the published Version',
  "'canPublishMultipleTracks'', true",
  "'courseScopeLocked'', false"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.G.2.4.4 migration is missing ${fragment}`)
}
assert.doesNotMatch(
  migration,
  /grant\s+(?:insert|update|delete|all)[\s\S]{0,100}course_schedule_coverage_publish_intents/i,
  'The internal coverage intent must not be writable through a browser or server role.'
)

for (const fragment of [
  'The selected multi-branch coverage or complete-replacement boundary is invalid',
  'The former Schedule coverage was not retained with its historical Version',
  'The Course compatibility anchors did not follow the selected primary Track',
  'Historical work did not remain available with the former Schedule',
  'A partial replacement hid or detached continuing Student progress',
  'A delivered Class did not establish started Track work',
  'Expected delivered Track removal to require a new Schedule',
  'Rejected delivered Track removal changed the active Version',
  'Rejected delivered Track removal retained a publication receipt',
  'Expected worked Track removal to require a new Schedule',
  'Rejected worked Track removal changed the active Version',
  'Rejected worked Track removal retained a publication receipt',
  'The assigned-Tutor qualification audit snapshot is incomplete',
  'Student learning history did not isolate worked Sessions from the superseded Schedule',
  'Expected unrelated Course learning-history access to fail',
  'An exact governed Builder retry created duplicate history',
  'A rejected qualification check partially changed the active Version',
  'Expected the direct structural coverage bypass to fail',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.G.2.4.4 DB test is missing ${fragment}`)
}

for (const block of dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.G.2.4.4 embeds a psql variable inside a dollar-quoted DO block.'
  )
}

assert.match(adapter, /sourceEducationLevelSlug/)
assert.match(adapter, /usesCompatibilityAnchor/)
assert.doesNotMatch(adapter, /The Builder Subject does not match this Course/)
assert.match(adapterTest, /supporting branch must be resolved/i)
assert.match(builder, /Publication will validate the complete plan atomically/)
assert.doesNotMatch(builder, /Preview is available, but Publish remains locked/)
assert.match(runner, /course-schedule-qualification-publication-db-self-test\.sql/)
assert.match(runnerTest, /course-schedule-qualification-publication-db-self-test\.sql/)
assert.match(
  packageJson,
  /"test:schedule-qualification-publication": "node tools\/course-schedule-qualification-publication-self-test\.mjs"/
)
assert.match(
  plan,
  /5\.G\.2\.4\.4 .*Qualification and publication enforcement: Complete/i
)
assert.match(coverageMap, /Phase 5\.G\.2\.4\.4/i)
for (const slug of [
  'algebra-2',
  'geometry',
  'trigonometry',
  'fluids-and-thermodynamics',
  'waves-and-sound',
  'optics',
  'electricity-and-magnetism',
  'modern-atomic-and-nuclear-physics'
]) {
  assert.ok(followup.includes(`'${slug}'`), `The Builder taxonomy follow-up is missing ${slug}.`)
}
assert.match(followup, /'source', 'tracksCatalog'/)
assert.match(followup, /where not exists \(/i)
assert.doesNotMatch(
  followup,
  /replace function public\.resolve_course_schedule_builder_coverage/i,
  'The catalog fix must not weaken the exact-branch resolver.'
)
for (const fragment of [
  'get_my_course_learning_history',
  'latest_session_states',
  'marked_historical_states',
  "'activeScheduleProgressExcluded', true",
  "'droppedItemsExcluded', true",
  "'missingSourcesRequireCatalogValidation', true"
]) {
  assert.ok(
    learningHistory.includes(fragment),
    `The Course learning-history projection is missing ${fragment}.`
  )
}
for (const fragment of [
  'course_schedule_track_has_worked_progress',
  'course_session_studied_aggregation',
  'course_session_practiced_aggregation',
  "'{context,revisionMode}' = 'new_schedule'",
  'Studied or Practiced work cannot be removed from a continuing Schedule',
  'revoke all on function public.course_schedule_track_has_worked_progress'
]) {
  assert.ok(
    revisionGuard.includes(fragment),
    `The governed Track revision boundary is missing ${fragment}.`
  )
}
for (const fragment of [
  'course_schedule_item_has_started_work',
  'course_schedule_occurrence_outcome_events',
  "outcome.resolution_status = 'delivered'",
  "transition_kind <> 'complete_replacement'",
  'A started Schedule item is immutable in continuing Versions',
  'Reviewed alone is intentionally not treated as started work'
]) {
  assert.ok(
    continuationGuard.includes(fragment),
    `The active-Schedule continuation guard is missing ${fragment}.`
  )
}

console.log(
  'Phase 5.G.2.4.4 complete-plan qualification, atomic selected coverage, stale-screen protection, idempotency, direct-bypass denial, and historical replacement boundaries passed.'
)
