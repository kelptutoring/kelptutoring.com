import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeClassroomFilesPayload } from '../src/app/classroom/classroom-files-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration, databaseTest, contractSource, dataAdapter, runner, packageSource,
  implementationPlan, classroomReadme, productContract, coverageMap
] = await Promise.all([
  readText('supabase/migrations/202607220004_classroom_private_files_authority.sql'),
  readText('tools/classroom-private-files-db-self-test.sql'),
  readText('src/app/classroom/classroom-files-contract.js'),
  readText('src/data/studentData.js'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('src/app/classroom/README.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

const studentFiles = normalizeClassroomFilesPayload({
  schemaVersion: 1,
  classroomId: 'classroom-a',
  access: { canUpload: true, canModerate: false, canPermanentlyPurge: true },
  uploadRules: {
    bucket: 'classroom-files', maxFileSizeBytes: 20971520,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'text/html'],
    uploaderWithdrawalMinutes: 120, reservationMinutes: 30
  },
  retentionPolicy: 'provisional_two_year_classroom_retention',
  files: [{
    id: 'file-a', name: 'reference.pdf', mimeType: 'application/pdf', sizeBytes: 5000,
    status: 'active', uploadedAt: '2026-07-22T12:00:00Z',
    uploadedBy: { id: 'student-a', name: 'Student A' },
    storage: { bucket: 'classroom-files', path: 'classroom-a/file-a' },
    canWithdraw: true, withdrawalDeadline: '2026-07-22T14:00:00Z', canHide: false
  }],
  featureStatus: { fileAuthority: 'active_phase_4d', fileInterface: 'planned_phase_4e' }
})
assert.equal(studentFiles.access.canUpload, true)
assert.equal(studentFiles.access.canModerate, false)
assert.equal(studentFiles.access.canPermanentlyPurge, false)
assert.deepEqual(studentFiles.uploadRules.allowedMimeTypes, ['application/pdf', 'image/jpeg', 'image/png'])
assert.equal(studentFiles.uploadRules.maxFileSizeBytes, 20971520)
assert.equal(studentFiles.uploadRules.uploaderWithdrawalMinutes, 120)
assert.equal(studentFiles.files[0].canWithdraw, true)
assert.ok(Object.isFrozen(studentFiles.files))
assert.ok(Object.isFrozen(studentFiles.files[0].storage))
assert.throws(() => normalizeClassroomFilesPayload({}), /payload is incomplete/)

for (const fragment of [
  "'classroom-files'",
  "array['application/pdf', 'image/jpeg', 'image/png']::text[]",
  '20971520',
  'create table if not exists public.classroom_files',
  'create table if not exists public.classroom_file_events',
  'upload_membership_id uuid not null',
  "status in ('reserved', 'active', 'withdrawn', 'hidden', 'purged')",
  "event_type in (",
  'current_user_can_upload_classroom_file',
  'current_user_can_moderate_classroom_file',
  'current_user_can_read_classroom_file',
  'reserve_my_classroom_file_upload',
  'activate_my_classroom_file',
  'withdraw_my_classroom_file',
  'hide_classroom_file',
  'get_my_classroom_files',
  'finalize_classroom_file_purge',
  "clock_timestamp() + interval '2 hours'",
  "'provisional_two_year_classroom_retention'",
  "'fileAuthority', 'active_phase_4d'",
  "'fileInterface', 'planned_phase_4e'"
]) assert.ok(migration.includes(fragment), `Phase 4.D migration is missing: ${fragment}`)

assert.match(migration, /create policy classroom_files_authenticated_insert[\s\S]*?for insert to authenticated/)
assert.match(migration, /create policy classroom_files_authenticated_select[\s\S]*?for select to authenticated/)
assert.doesNotMatch(migration, /create policy classroom_files[^;]+for (?:delete|update)/i)
assert.match(migration, /grant execute on function public\.finalize_classroom_file_purge\(uuid, uuid, text\) to service_role/)
assert.match(migration, /revoke all on function public\.finalize_classroom_file_purge\(uuid, uuid, text\) from public, anon, authenticated/)
assert.match(migration, /file_record\.retention_until is null/)
assert.match(migration, /file_record\.legal_hold/)

for (const fragment of [
  'guardian_read_only_files', 'former_tutor_tenure_files',
  'student_hidden_withdrawn_filter', 'expired_withdrawal_denial',
  'tutor_moderation_projection', 'mentor_moderation_projection',
  'outsider_files_denial',
  'storage_and_audit_contract', 'classroom_files_authenticated_insert',
  'classroom_files_authenticated_select'
]) assert.ok(databaseTest.includes(fragment), `Phase 4.D DB test is missing: ${fragment}`)
assert.match(databaseTest, /set local role authenticated;/i)
assert.match(databaseTest, /rollback;/i)

assert.match(contractSource, /export function normalizeClassroomFilesPayload/)
assert.match(contractSource, /canPermanentlyPurge: false/)
assert.match(dataAdapter, /getClassroomFilesData/)
assert.match(dataAdapter, /supabase\.rpc\('get_my_classroom_files'/)
assert.match(dataAdapter, /normalizeClassroomFilesPayload/)

assert.match(runner, /classroom-private-files-db-self-test\.sql/)
assert.match(runner, /guardian_id: 'ACT-STUDENT-B'/)
assert.match(runner, /former_tutor_id: 'ACT-STUDENT-TUTOR'/)
const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['test:classroom-files'], 'node tools/classroom-private-files-self-test.mjs')
assert.match(implementationPlan, /4\.D .*Private Files authority.*Complete/i)
assert.match(classroomReadme, /## Private Classroom Files authority/)
assert.match(productContract, /Phase 4\.D .*Private Files authority/)
assert.match(coverageMap, /classroom-private-files-db-self-test\.sql/)
assert.match(coverageMap, /RUN-20260722-004/)

console.log('Phase 4.D private Classroom Files authority, tenure, moderation, and retention self-test passed.')
