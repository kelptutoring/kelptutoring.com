import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  prestartFix,
  staffExplanationFollowup,
  restorationFoundation,
  deterministicRestoration,
  effectiveEndAuthority,
  dbTest,
  runner,
  packageJson,
  plan,
  contract,
  privilegeTest
] = await Promise.all([
  readText('supabase/migrations/202607220011_course_progress_ledger.sql'),
  readText('supabase/migrations/202607300001_course_progress_prestart_authority.sql'),
  readText('supabase/migrations/202607300005_staff_progress_explanations_and_schedule_log.sql'),
  readText('supabase/migrations/202607310006_course_schedule_replacement_restoration_foundation.sql'),
  readText('supabase/migrations/202607310009_course_progress_deterministic_restoration.sql'),
  readText('supabase/migrations/202607310010_course_schedule_effective_end_authority.sql'),
  readText('tools/course-progress-ledger-db-self-test.sql'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('tools/server-adapter-privileges-db-self-test.sql')
])

for (const table of [
  'course_progress_events',
  'course_progress_commands',
  'course_progress_notification_events'
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'))
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'))
}

for (const fragment of [
  "progress_kind in ('studied', 'reviewed', 'practiced')",
  "event_action in ('marked', 'reversed', 'reflection_amended')",
  'Course progress history is append-only.',
  'validate_course_progress_event',
  'The Course progress target does not belong to the Course Schedule.',
  'record_course_progress',
  'reverse_course_progress',
  'amend_my_course_progress_reflection',
  'get_my_course_progress',
  'course_progress_latest_event_id',
  'course_progress_target_is_marked',
  'pg_advisory_xact_lock',
  'Course progress changed while this page was open. Reload before saving.',
  'Student progress always uses authoritative server time.',
  'Progress reflections remain Student-controlled.',
  'Students must ask their Tutor to reverse Studied progress.',
  'Reviewed and Practiced progress remain Student-controlled.',
  "course_record.status not in ('active', 'wind_down')",
  "event_type in ('progress_studied_marked', 'progress_studied_reversed')",
  'A Studied Schedule item is immutable in successor Versions.',
  "'appendOnlyProgressLedger', 'active_phase_5e2'"
]) {
  assert.ok(migration.includes(fragment), `Phase 5.E.2 migration is missing ${fragment}`)
}
for (const fragment of [
  'course_schedule_active_plan_epoch',
  'course_schedule_adaptive_item_order',
  'course_schedule_apply_restoration_order',
  'predecessor_provenance_current_cadence',
  "policy ->> 'mode' <> 'adaptive'",
  'targetLocked',
  'course_schedule_target_mapping_snapshot_phase5g2_4_7_3_2_base'
]) {
  assert.ok(
    deterministicRestoration.includes(fragment),
    `Deterministic Studied reversal restoration is missing ${fragment}`
  )
}
assert.match(
  deterministicRestoration,
  /array_position\(ordered_keys, predecessor_key\)/,
  'Restoration must search the nearest surviving predecessor.'
)
assert.match(
  deterministicRestoration,
  /ordered_keys := array\[restored\.stable_item_key\] \|\| ordered_keys/,
  'A restored Session with no surviving predecessor must return first.'
)
assert.doesNotMatch(
  deterministicRestoration,
  /marked_cadence\s*->>|targetPlannedDate'\s*,\s*provenance/i,
  'Mark-time cadence is historical provenance and must not drive restored effective dates.'
)
for (const fragment of [
  'course_schedule_effective_plan_end',
  'course_schedule_target_mapping_revisions',
  "studied.payload ->> 'effectiveAt'",
  "mapping_snapshot -> 'slotMappings'",
  'effective_schedule_lifecycle',
  "event.value ->> 'kind' is distinct from 'course_end'"
]) {
  assert.ok(
    effectiveEndAuthority.includes(fragment),
    `Effective Course End authority is missing ${fragment}`
  )
}
assert.doesNotMatch(
  effectiveEndAuthority,
  /update\s+public\.student_courses[\s\S]*scheduled_end_date/i,
  'Effective Course End projection must not rewrite historical Course data.'
)

assert.match(migration, /effective_at timestamptz not null/i)
assert.match(migration, /recorded_at timestamptz not null default clock_timestamp\(\)/i)
assert.match(migration, /char_length\(reflection\) between 1 and 1000/i)
assert.match(migration, /active_mark\.recorded_at \+ interval '2 hours'/i)
assert.match(migration, /recipient\.user_id[\s\S]*course_record\.student_id[\s\S]*course_record\.tutor_id/i)
assert.doesNotMatch(
  migration,
  /union select course_record\.mentor_id/i,
  'Routine Studied notifications must not automatically include the Mentor.'
)
for (const fragment of [
  'create table if not exists public.course_progress_restoration_provenance',
  'capture_course_progress_restoration_provenance',
  'predecessor_stable_item_keys',
  'marked_cadence',
  'alter table public.course_progress_restoration_provenance enable row level security',
  'course_progress_restoration_provenance_immutable'
]) {
  assert.ok(
    restorationFoundation.includes(fragment),
    `The Studied restoration foundation is missing ${fragment}`
  )
}
assert.doesNotMatch(migration, /grant (?:insert|update|delete) on public\.course_progress_/i)
assert.match(
  prestartFix,
  /if p_effective_at is not null[\s\S]+course_record\.start_date then/i
)
assert.match(prestartFix, /record_course_progress_phase5e2/)
assert.match(prestartFix, /reverse_course_progress_phase5e2/)
assert.match(
  prestartFix,
  /The Course progress pre-start mark guard no longer matches its governed definition/
)
for (const fragment of [
  'A Student-visible explanation is required whenever a Tutor or Mentor marks or unmarks Studied progress.',
  "'studentExplanation', p_event.student_explanation",
  "'title', coalesce(",
  'get_my_current_course_schedule_log',
  "'activeScheduleOnly', true",
  "'retainedStableItemProgressIncluded', true",
  "'privateStaffNotesExcluded', true"
]) {
  assert.ok(
    staffExplanationFollowup.includes(fragment),
    `The staff explanation follow-up is missing ${fragment}`
  )
}
assert.doesNotMatch(
  staffExplanationFollowup,
  /'privateStaffNote'\s*,/,
  'The Student-facing current Schedule Log must not project private staff notes.'
)

for (const fragment of [
  'A Student may independently study a later Session without supplying a reason.',
  'Expected a stale Course progress mark to fail.',
  'Students cannot reverse Studied progress themselves.',
  'Assigned resources remain Student-controlled',
  'Student Session progress uses server time',
  'Tutor resource mark to fail',
  'Expected the Studied Schedule reorder to fail.',
  'A governed Studied reversal during wind-down reopens the Course.',
  'Guardians and outsiders do not receive lesson-level progress',
  'Ordinary staff actions use authoritative server time',
  'Expected an explicit pre-start back-report to fail.',
  'Expected an ordinary Tutor mark without an explanation to fail.',
  'The Student notification did not retain the Tutor explanation and Schedule title.',
  'The Student current-Schedule Log did not expose public staff explanations while excluding private notes.',
  'The Studied mark did not freeze its deterministic restoration provenance.',
  'The Studied reversal did not restore the Session from predecessor provenance.',
  'The restored Session did not consume the active cadence lane.',
  'Adaptive Course End did not contract before Studied restoration.',
  'Adaptive Course End did not expand after Studied reversal.',
  'Expected Studied restoration provenance to reject an update.',
  'Expected Course progress history to reject an update.',
  'rollback;'
]) {
  assert.ok(dbTest.includes(fragment), `Phase 5.E.2 DB characterization is missing ${fragment}`)
}
assert.match(
  dbTest,
  /clock_timestamp\(\) - interval '1 minute'/,
  'The explicit pre-start back-report must always be in the past, independent of test-run time.'
)
assert.doesNotMatch(
  dbTest,
  /current_date \+ time '12:00'/,
  'A noon-today back-report is future-dated when the suite runs before noon.'
)

const proceduralBlocks = [...dbTest.matchAll(/do \$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$;/gi)]
for (const block of proceduralBlocks) {
  assert.doesNotMatch(
    block[0],
    /:'[a-z_][a-z0-9_]*'/i,
    'Phase 5.E.2 embeds a psql variable inside a dollar-quoted DO block'
  )
}

assert.match(runner, /file: 'course-progress-ledger-db-self-test\.sql'/)
assert.match(packageJson, /"test:schedule-progress": "node tools\/course-progress-ledger-self-test\.mjs"/)
assert.match(plan, /5\.E\.2 .*Append-only progress ledger/i)
assert.match(contract, /Student progress uses authoritative server time/i)
assert.match(privilegeTest, /public\.course_progress_events/i)
assert.match(privilegeTest, /public\.course_progress_commands/i)
assert.match(privilegeTest, /public\.course_progress_notification_events/i)
assert.match(privilegeTest, /public\.course_progress_restoration_provenance/i)
assert.doesNotMatch(
  dbTest,
  /:'motion_reflection_event_id'/,
  'The reflection event is retained as PostgreSQL session state, not a psql substitution variable.'
)
assert.match(dbTest, /current_setting\('test\.motion_reflection_event_id'\)::uuid/)

console.log('Phase 5.E.2 append-only progress, privacy, concurrency, notifications, and structural-lock source contracts passed.')
