import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeClassroomFilesPayload,
  validateClassroomUpload
} from '../src/app/classroom/classroom-files-contract.js'
import { getClassroomArea } from '../src/app/classroom/classroom-space-navigation.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [
  migration, filesDatabaseTest, navigationDatabaseTest, contractSource, navigationSource,
  html, page, styles, dataAdapter, packageSource, implementationPlan,
  classroomReadme, productContract, coverageMap
] = await Promise.all([
  readText('supabase/migrations/202607220005_classroom_files_interface_status.sql'),
  readText('tools/classroom-private-files-db-self-test.sql'),
  readText('tools/classroom-navigation-privacy-db-self-test.sql'),
  readText('src/app/classroom/classroom-files-contract.js'),
  readText('src/app/classroom/classroom-space-navigation.js'),
  readText('src/app/classroom/classroom-space.html'),
  readText('src/app/classroom/classroom-space.js'),
  readText('src/app/classroom/classroom-space.css'),
  readText('src/data/studentData.js'),
  readText('package.json'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('src/app/classroom/README.md'),
  readText('docs/product/product-contract.md'),
  readText('tests/acceptance/COVERAGE_MAP.md')
])

const uploadRules = {
  maxFileSizeBytes: 20 * 1024 * 1024,
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png']
}
assert.equal(validateClassroomUpload({
  name: 'mechanics-reference.pdf', type: 'application/pdf', size: 2048
}, uploadRules).valid, true)
assert.equal(validateClassroomUpload({
  name: 'diagram.png', type: 'image/png', size: 4096
}, uploadRules).valid, true)
assert.match(validateClassroomUpload({
  name: 'diagram.pdf', type: 'image/png', size: 4096
}, uploadRules).message, /extension does not match/i)
assert.match(validateClassroomUpload({
  name: 'notes.txt', type: 'text/plain', size: 100
}, uploadRules).message, /Only PDF, JPEG, and PNG/i)
assert.match(validateClassroomUpload({
  name: 'large.pdf', type: 'application/pdf', size: 21 * 1024 * 1024
}, uploadRules).message, /larger than 20 MB/i)

const activeFiles = normalizeClassroomFilesPayload({
  schemaVersion: 2,
  classroomId: 'classroom-a',
  access: { canUpload: true, canModerate: true },
  uploadRules,
  files: [],
  featureStatus: { fileAuthority: 'active_phase_4d', fileInterface: 'active_phase_4e' }
})
assert.equal(activeFiles.featureStatus.fileInterface, 'active_phase_4e')
assert.equal(getClassroomArea('files').availability, 'available')

for (const fragment of [
  'create or replace function public.get_my_classroom_files',
  'create or replace function public.get_my_classroom_space',
  "'schemaVersion', 2",
  "'schemaVersion', 6",
  "'fileInterface', 'active_phase_4e'",
  "'files', 'active_phase_4e'",
  'grants no additional table, Storage, or permanent-deletion authority'
]) assert.ok(migration.includes(fragment), `Phase 4.E migration is missing: ${fragment}`)
assert.doesNotMatch(migration, /storage\.objects\s+for\s+(?:delete|update)/i)
assert.match(filesDatabaseTest, /\{featureStatus,fileInterface\}.*active_phase_4e/s)
assert.match(navigationDatabaseTest, /\{featureStatus,files\}.*active_phase_4e/s)

assert.match(contractSource, /export function validateClassroomUpload/)
assert.match(contractSource, /EXTENSIONS_BY_MIME_TYPE/)
assert.match(navigationSource, /key: 'files',[\s\S]*?availability: 'available'/)
assert.match(html, /data-classroom-area="files" data-availability="available"/)
for (const id of [
  'classroom-space-files', 'classroom-files-upload-form', 'classroom-files-dropzone',
  'classroom-files-list', 'classroom-files-empty', 'classroom-file-dialog',
  'classroom-file-dialog-reason', 'classroom-file-dialog-confirm'
]) assert.match(html, new RegExp(`id="${id}"`))
assert.match(html, /accept="application\/pdf,image\/jpeg,image\/png,\.pdf,\.jpg,\.jpeg,\.png"/)
assert.doesNotMatch(html, /id="classroom-files-input"[^>]*\bmultiple\b/)

for (const fragment of [
  'bindClassroomFilesControls', 'loadClassroomFiles', 'renderClassroomFiles',
  'submitClassroomFileUpload', 'getClassroomFileSignedUrl', 'openClassroomFileDialog',
  'submitClassroomFileAction', "eventName !== 'drop'", "window.open('about:blank'",
  "}, 3500)"
]) assert.ok(page.includes(fragment), `Phase 4.E page is missing: ${fragment}`)
assert.match(page, /name\.textContent = file\.name/)
assert.match(page, /reason\.textContent = `Reason: \$\{file\.hiddenReason\}`/)

for (const fragment of [
  'reserve_my_classroom_file_upload', ".storage.from(bucket).upload(path, file",
  'activate_my_classroom_file', '.createSignedUrl(path, 60, options)',
  'withdraw_my_classroom_file', 'hide_classroom_file'
]) assert.ok(dataAdapter.includes(fragment), `Phase 4.E adapter is missing: ${fragment}`)
assert.doesNotMatch(dataAdapter, /supabase\.storage\.from\([^)]*\)\.remove\(/)

assert.match(styles, /\.classroom-space-files/)
assert.match(styles, /\.classroom-files-dropzone\.is-dragging/)
assert.match(styles, /\.classroom-file-dialog::backdrop/)
assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?\.classroom-file-item/)
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)

const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['test:classroom-files-ui'], 'node tools/classroom-files-interface-self-test.mjs')
assert.match(implementationPlan, /4\.E .*Private Files interface: Complete/i)
assert.match(implementationPlan, /RUN-20260722-005/)
assert.match(classroomReadme, /## Private Classroom Files interface/)
assert.match(productContract, /Phase 4\.E .*Private Files interface/)
assert.match(coverageMap, /202607220005_classroom_files_interface_status\.sql/)

console.log('Phase 4.E private Classroom Files interface and Storage adapter self-test passed.')
