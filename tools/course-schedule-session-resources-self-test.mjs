import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (path) => readFile(resolve(projectRoot, path), 'utf8')

const [migration, repairMigration, dbTest, plan, productContract, readme, generatorReadme, trackData, runner, privilegeTest] = await Promise.all([
  readText('supabase/migrations/202607220009_course_schedule_session_resources.sql'),
  readText('supabase/migrations/202607220010_course_schedule_source_inheritance_fix.sql'),
  readText('tools/course-schedule-session-resources-db-self-test.sql'),
  readText('IMPLEMENTATION_PLAN.md'),
  readText('docs/product/product-contract.md'),
  readText('README.md'),
  readText('src/app/schedule-generator/README.md'),
  readText('src/data/tracks-data.js'),
  readText('tools/local-supabase-acceptance.mjs'),
  readText('tools/server-adapter-privileges-db-self-test.sql')
])

assert.match(migration, /add column if not exists source_session_key text generated always/i)
assert.match(migration, /source_content_version_key text generated always/i)
assert.match(migration, /difficulty_level text generated always/i)
assert.match(migration, /create table if not exists public\.course_schedule_item_resources/i)
assert.match(migration, /requirement_state in \('required', 'optional', 'not_assigned'\)/i)
assert.match(migration, /inherit_course_schedule_item_source_snapshot/i)
assert.match(migration, /previous_item\.source_content_version_key is not null/i)
assert.match(migration, /snapshot_course_schedule_item_resources/i)
assert.match(migration, /Active Students and authorized staff read Session resources/i)
assert.match(migration, /get_my_course_schedule_sources/i)
assert.match(migration, /javascript\|data\|vbscript/i)
assert.match(repairMigration, /previous_item\.source_content_version_key is not null/i)
assert.match(repairMigration, /leaving Review and Exam content-version identity intentionally null/i)

assert.match(dbTest, /Student RLS exposed a not-assigned Session resource/i)
assert.match(dbTest, /successor Schedule Version lost its inherited Session\/resource snapshot/i)
assert.match(dbTest, /Outsider RLS exposed Course Session resources/i)
assert.match(dbTest, /immutable resource history/i)

assert.match(plan, /5\.E\.1 \u2014 Session and resource identity/i)
assert.match(plan, /5\.E\.2 \u2014 Append-only progress ledger/i)
assert.match(productContract, /Required resources are visible and count toward derived Session completion/i)
assert.match(productContract, /Phase 15 owns full immutable Markdown-derived Track publication and synchronization/i)
assert.match(readme, /Course Schedule Phases 5\.A\u20135\.G\.2\.3,[^\n]+are complete/i)
assert.match(readme, /multi-curriculum Phases 5\.G\.2\.4\.1\u20135\.G\.2\.4\.4 are complete/i)
assert.match(readme, /5\.G\.2\.4\.2 immutable Version coverage/i)
assert.match(readme, /RUN-20260726-034/i)
assert.match(generatorReadme, /sourceSessionId/i)
assert.match(trackData, /"difficulty": "(?:low|medium|high)"/i)
assert.match(trackData, /"planningHref":/i)
assert.match(runner, /course-schedule-session-resources-db-self-test\.sql/i)
assert.match(privilegeTest, /public\.course_schedule_item_resources/i)

console.log('Course Schedule Session/resource source contracts passed.')
