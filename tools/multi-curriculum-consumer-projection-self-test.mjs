import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration,
  compatibilityMigration,
  roleParityMigration,
  contract,
  dbTest,
  plan,
  readme,
  runner
] = await Promise.all([
  readText('supabase/migrations/202607260003_multi_curriculum_consumer_projection.sql'),
  readText('supabase/migrations/202607260004_calendar_legacy_module_identity_compatibility.sql'),
  readText('supabase/migrations/202607260007_active_schedule_role_parity.sql'),
  readText('src/app/classroom/classroom-schedule-contract.js'),
  readText('tools/multi-curriculum-consumer-projection-db-self-test.sql'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('README.md'),
  readText('tools/local-supabase-acceptance.mjs')
])

assert.match(migration, /course_schedule_consumer_branch_context/i)
assert.match(migration, /academicPathways/i)
assert.match(migration, /course_schedule_module_presentation_key/i)
assert.match(migration, /academicScope/i)
assert.match(migration, /academicBranch/i)
assert.match(migration, /Course progress/i)
assert.match(migration, /active_schedule_version/i)
assert.match(migration, /multiCurriculumConsumerProjection/i)
assert.match(migration, /get_my_unified_course_schedule_phase5g2_4_5_base/i)
assert.doesNotMatch(migration, /learning_schedules/)
assert.match(compatibilityMigration, /legacyModuleIdentityCompatibility/i)
assert.match(compatibilityMigration, /'course-plan'/)
assert.match(compatibilityMigration, /'#dcefdc'/)
assert.match(roleParityMigration, /activeScheduleRoleParity/i)
assert.match(roleParityMigration, /sequenceState/i)
assert.match(roleParityMigration, /one role-neutral active Course item set/i)

assert.match(contract, /normalizeScheduleCoverage/i)
assert.match(contract, /normalizeAcademicBranch/i)
assert.match(contract, /modulePresentationKey/i)
assert.match(contract, /courseProgress/i)
assert.match(contract, /byTrack/i)
assert.match(contract, /omitMixedTrackLegacyScaffolds/i)
assert.match(contract, /sessionProgressIsMarked/i)

assert.match(dbTest, /two same-named modules shared one presentation identity/i)
assert.match(dbTest, /The Course progress breakdown is not branch-specific/i)
assert.match(dbTest, /The canonical reader did not expose active Version coverage/i)
assert.match(plan, /5\.G\.2\.4\.5\.1/i)
assert.match(readme, /5\.G\.2\.4\.5\.1/i)
assert.match(runner, /multi-curriculum-consumer-projection-db-self-test\.sql/i)

console.log('Multi-curriculum consumer projection contracts passed.')
