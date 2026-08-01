import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createBuilderCoursePublication,
  normalizeBuilderSchedule
} from '../src/app/schedule-generator/course-schedule-adapter.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')
const [
  migration,
  projectionFollowup,
  recurringFallbackMigration,
  preProgressHoldLockMigration,
  holdMappingReadinessMigration,
  studentStudiedHoldMigration,
  effectiveConsumerProjectionMigration,
  effectiveEndAuthorityMigration,
  dbTest,
  builder,
  html,
  dataAdapter,
  domain
] = await Promise.all([
  readText('supabase/migrations/202607300002_course_schedule_pacing_policy.sql'),
  readText(
    'supabase/migrations/202607300003_course_schedule_pacing_projection_followup.sql'
  ),
  readText(
    'supabase/migrations/202607300004_course_schedule_recurring_date_fallback.sql'
  ),
  readText(
    'supabase/migrations/202607300006_course_schedule_pre_progress_hold_lock.sql'
  ),
  readText(
    'supabase/migrations/202607300007_course_schedule_hold_mapping_readiness.sql'
  ),
  readText(
    'supabase/migrations/202607300008_student_studied_class_hold.sql'
  ),
  readText(
    'supabase/migrations/202607310005_effective_schedule_consumer_projection.sql'
  ),
  readText(
    'supabase/migrations/202607310010_course_schedule_effective_end_authority.sql'
  ),
  readText('tools/course-schedule-pacing-policy-db-self-test.sql'),
  readText('src/app/schedule-generator/schedule-generator.js'),
  readText('src/app/schedule-generator/schedule-generator.html'),
  readText('src/data/studentData.js'),
  readText('src/app/schedule-generator/schedule-domain.js')
])

assert.match(migration, /course_schedule_pacing_policy_events/)
assert.match(migration, /pacing_mode in \('adaptive', 'static'\)/)
assert.match(migration, /frozen_effective_dates/)
assert.match(migration, /source_kind = 'recurring_pattern'/)
assert.match(migration, /interval '6 hours'/)
assert.match(migration, /lock_course_schedule_slot_target/)
assert.match(migration, /course_schedule_pacing_mapping_snapshot/)
assert.match(migration, /set_course_schedule_pacing_mode/)
assert.match(migration, /current_user_can_edit_course_schedule/)
assert.match(migration, /enable row level security/)
assert.match(migration, /append-only/)
assert.match(
  projectionFollowup,
  /get_my_unified_course_schedule_phase5g2_4_7_2_base/
)
assert.match(projectionFollowup, /\{academicTrack,items\}/)
assert.match(projectionFollowup, /\{academicTrack,pacingPolicy\}/)
assert.match(recurringFallbackMigration, /generated_recurring_date_fallback/)
assert.match(recurringFallbackMigration, /recurringDateFallback/)
assert.match(recurringFallbackMigration, /createsBookedClass/)
assert.match(recurringFallbackMigration, /createsSixHourHold/)
assert.match(
  recurringFallbackMigration,
  /course_schedule_recurring_date_fallback_mapping_snapshot/
)
assert.match(recurringFallbackMigration, /slot\.local_date >= local_today/)
assert.match(
  recurringFallbackMigration,
  /slotSourceMode', 'recurring_schedule_date_fallback/
)
assert.match(recurringFallbackMigration, /backfill_recurring_date_fallback_slots/)
assert.match(
  preProgressHoldLockMigration,
  /lock_course_schedule_targets_before_progress/
)
assert.match(
  preProgressHoldLockMigration,
  /before insert on public\.course_progress_events/
)
assert.match(
  preProgressHoldLockMigration,
  /public\.lock_course_schedule_slot_target/
)
assert.match(
  preProgressHoldLockMigration,
  /public\.refresh_course_schedule_target_mapping_after_progress/
)
assert.doesNotMatch(
  preProgressHoldLockMigration.match(
    /create or replace function public\.refresh_course_schedule_target_mapping_after_progress\(\)[\s\S]*?\$\$;/
  )?.[0] ?? '',
  /lock_course_schedule_slot_target/
)
assert.match(
  holdMappingReadinessMigration,
  /lock_course_schedule_targets_before_progress/
)
assert.match(
  holdMappingReadinessMigration,
  /public\.refresh_course_schedule_target_mapping/
)
assert.match(holdMappingReadinessMigration, /'manual_refresh'/)
assert.match(
  holdMappingReadinessMigration,
  /public\.lock_course_schedule_slot_target/
)
assert.match(
  studentStudiedHoldMigration,
  /course_schedule_student_studied_hold/
)
assert.match(
  studentStudiedHoldMigration,
  /block_student_studied_during_class_hold/
)
assert.match(
  studentStudiedHoldMigration,
  /new\.actor_role <> 'student'/
)
assert.match(
  studentStudiedHoldMigration,
  /new\.progress_kind <> 'studied'/
)
assert.match(
  studentStudiedHoldMigration,
  /new\.event_action <> 'marked'/
)
assert.match(
  studentStudiedHoldMigration,
  /slot\.local_start_time is not null/
)
assert.match(
  studentStudiedHoldMigration,
  /interval '6 hours'/
)
assert.match(
  studentStudiedHoldMigration,
  /Your next class begins within six hours/
)
assert.match(
  effectiveConsumerProjectionMigration,
  /course_schedule_reconcile_effective_groups/
)
assert.match(
  effectiveConsumerProjectionMigration,
  /row_entry ->> 'rowKind' = 'planned_topic'/
)
assert.match(
  effectiveConsumerProjectionMigration,
  /item_entry ->> 'sequenceState' = 'studied'/
)
assert.match(
  effectiveConsumerProjectionMigration,
  /\{calendarPresentation\}/
)
assert.match(
  effectiveConsumerProjectionMigration,
  /\{classroomHome\}/
)
assert.match(
  effectiveConsumerProjectionMigration,
  /project_course_schedule_classroom_home/
)
assert.match(
  effectiveConsumerProjectionMigration,
  /effectiveScheduleConsumerProjection/
)
assert.match(
  effectiveEndAuthorityMigration,
  /course_schedule_effective_plan_end/
)
assert.match(
  effectiveEndAuthorityMigration,
  /course_schedule_target_mapping_revisions/
)
assert.match(
  effectiveEndAuthorityMigration,
  /effective_schedule_lifecycle/
)
assert.match(
  effectiveEndAuthorityMigration,
  /effectiveCourseEndAuthority/
)
assert.match(
  dbTest,
  /Adaptive Course End did not contract to the last effective target\./
)
assert.match(
  dbTest,
  /Static Course End did not retain its frozen terminal date\./
)
assert.match(
  dbTest,
  /adaptive_recurring_date_fallback_reflows_without_class_hold/
)
assert.match(
  dbTest,
  /did not consume the freed structural date safely/
)
assert.match(
  dbTest,
  /fixture did not create a due recurring academic slot/
)
assert.match(
  dbTest,
  /fixture did not initially map its recurring slot to the prepared target/
)
assert.match(
  dbTest,
  /could mark Studied while a timed Class was inside the six-hour hold/
)
assert.match(
  dbTest,
  /current_setting\('test\.pacing_hold_a_item_id'\)::uuid/
)
assert.match(
  dbTest,
  /rejected six-hour Student action retained a progress event/
)
assert.match(
  dbTest,
  /rejected six-hour Student action retained a target lock/
)
assert.match(
  dbTest,
  /reset role;\s+do \$rejected_student_studied_left_no_internal_facts\$/
)
assert.match(
  dbTest,
  /rejected six-hour Student action moved the prepared target/
)
assert.match(
  dbTest,
  /six_hour_hold_keeps_reinforcement_available/
)
assert.match(
  dbTest,
  /incorrectly blocked Reviewed or Practiced progress/
)
assert.match(
  dbTest,
  /request\.jwt\.claim\.sub', :'mentor_id', true\);\s+select \(\s+public\.create_student_course_with_schedule_draft/
)
assert.match(
  dbTest,
  /activate_student_course\(:'pacing_course_id'::uuid\);\s+select set_config\('request\.jwt\.claim\.sub', :'student_a_id', true\);/
)
assert.doesNotMatch(
  dbTest,
  /public\.course_schedule_pacing_policy\(/
)
for (const block of dbTest.matchAll(
  /do (\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;/g
)) {
  assert.doesNotMatch(
    block[2],
    /:'[A-Za-z0-9_]+'/,
    'psql variables are not substituted inside dollar-quoted DO blocks'
  )
}

assert.match(html, /name="pacingMode" value="adaptive"/)
assert.match(html, /name="pacingMode" value="static"/)
assert.match(html, /six-hour hold/)
assert.match(builder, /activePacingMode/)
assert.match(builder, /pacingPolicyOnly/)
assert.match(builder, /setCourseSchedulePacingMode/)
assert.match(dataAdapter, /set_course_schedule_pacing_mode/)
assert.match(domain, /pacingMode/)

const session = {
  id: 'pacing-session',
  title: 'Pacing Session',
  type: 'lesson',
  startDate: '2026-08-06',
  endDate: '2026-08-06',
  sourceSessionId: 'governed-pacing-session',
  sourceContentVersionKey: `sha256:${'a'.repeat(64)}`,
  trackId: 'algebra-1',
  moduleId: 'linear-modeling',
  moduleTitle: 'Linear Modeling',
  difficulty: 'medium',
  planningHref: '../schedules/algebra-1/pacing-session.html',
  resources: []
}
const activeItem = {
  stableItemKey: session.id,
  title: session.title,
  kind: 'curriculum_topic',
  curriculumNodeId: '10000000-0000-4000-8000-000000000022',
  scheduledDate: session.startDate,
  endDate: session.endDate,
  position: 0,
  state: 'scheduled',
  sourceTrackKey: session.trackId,
  sourceModuleKey: session.moduleId,
  sourceSessionKey: session.sourceSessionId,
  sourceContentVersionKey: session.sourceContentVersionKey,
  planningHref: session.planningHref,
  difficulty: 'intermediate'
}
const staticSchedule = {
  schemaVersion: 4,
  id: 'pacing-schedule',
  name: 'Pacing Schedule',
  timeZone: 'America/Sao_Paulo',
  pacingMode: 'static',
  cadence: { type: 'day_interval', intervalDays: 7 },
  context: {
    subjectTaxonomySlug: 'mathematics',
    trackTaxonomySlugs: ['algebra-1']
  },
  sessions: [session]
}

assert.equal(normalizeBuilderSchedule(staticSchedule).pacingMode, 'static')
assert.throws(
  () => normalizeBuilderSchedule({ ...staticSchedule, pacingMode: 'floating' }),
  /Adaptive or Static/
)

const modeOnly = createBuilderCoursePublication({
  schedule: staticSchedule,
  course: {
    subject: { slug: 'mathematics' },
    focus: {
      id: activeItem.curriculumNodeId,
      slug: 'algebra-1'
    }
  },
  activeItems: [activeItem],
  activePacingMode: 'adaptive',
  today: '2026-07-30',
  studentExplanation: 'Freeze the current effective future dates for this plan.'
})
assert.equal(modeOnly.pacingPolicyOnly, true)
assert.equal(modeOnly.changeReasons.length, 0)
assert.equal(modeOnly.builderSchedule.pacingMode, 'static')

assert.throws(
  () => createBuilderCoursePublication({
    schedule: { ...staticSchedule, pacingMode: 'adaptive' },
    course: {
      subject: { slug: 'mathematics' },
      focus: {
        id: activeItem.curriculumNodeId,
        slug: 'algebra-1'
      }
    },
    activeItems: [activeItem],
    activePacingMode: 'adaptive',
    today: '2026-07-30',
    studentExplanation: 'This request intentionally contains no actual change.'
  }),
  /does not contain a publishable change/
)

console.log(
  'Adaptive/Static Schedule pacing policy, six-hour hold, frozen-date, Builder, RLS, and mode-only publication contracts passed.'
)
