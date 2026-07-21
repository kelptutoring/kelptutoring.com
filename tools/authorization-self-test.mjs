import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTHORIZATION_CONTRACT_VERSION,
  capabilitiesForLegacyRoles,
  hasAnyRole,
  hasCapabilities,
  hasCapability,
  hasRole,
  normalizeAuthorization,
  normalizeCapabilityKey,
  normalizeRoleKey
} from '../src/auth/authorization.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [migration, profilesMigration, authGuard, signup, examReview, tutorDashboard, profilePage] = await Promise.all([
  readFile(resolve(projectRoot, 'supabase/migrations/202607180003_multi_role_authorization.sql'), 'utf8'),
  readFile(resolve(projectRoot, 'supabase/migrations/202607160001_profiles.sql'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/auth-guard.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/signUp.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/exam-builder/exam-review.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/tutor-dashboard.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/profile/profile.js'), 'utf8')
])

assert.equal(AUTHORIZATION_CONTRACT_VERSION, 1)
assert.equal(normalizeRoleKey(' Mentor '), 'mentor')
assert.equal(normalizeRoleKey('teacher'), 'teacher')
assert.equal(normalizeRoleKey('administrator'), 'admin')
assert.equal(normalizeRoleKey('not a role'), '')
assert.equal(normalizeCapabilityKey(' Exam.Review '), 'exam.review')

const legacyMentor = normalizeAuthorization(null, { legacyRole: 'mentor' })
assert.equal(legacyMentor.source, 'legacy-profile')
assert.deepEqual(legacyMentor.roles, ['mentor'])
assert.equal(legacyMentor.primaryRole, 'mentor')
assert.equal(hasCapability(legacyMentor, 'exam.review'), true)
assert.equal(hasCapability(legacyMentor, 'course.create'), true)
assert.equal(hasCapability(legacyMentor, 'authorization.manage'), false)

const multiRole = normalizeAuthorization({
  version: 1,
  primaryRole: 'student',
  roles: ['student', 'tutor', 'mentor', 'mentor'],
  capabilities: [
    'workspace.student',
    'practice.attempt',
    'exam.create',
    'exam.review',
    'course.create'
  ]
}, { legacyRole: 'student' })
assert.equal(multiRole.source, 'database')
assert.equal(multiRole.primaryRole, 'student')
assert.deepEqual(multiRole.roles, ['student', 'tutor', 'mentor'])
assert.equal(hasRole(multiRole, 'mentor'), true)
assert.equal(hasAnyRole(multiRole, ['admin', 'tutor']), true)
assert.equal(hasAnyRole(multiRole, ['admin', 'teacher']), false)
assert.equal(hasCapabilities(multiRole, ['exam.create', 'exam.review']), true)
assert.equal(hasCapabilities(multiRole, ['exam.publish', 'exam.review']), false)
assert.equal(hasCapabilities(multiRole, ['exam.publish', 'exam.review'], { requireAll: false }), true)

const intentionallyEmptyCapabilities = normalizeAuthorization({
  primaryRole: 'mentor',
  roles: ['mentor'],
  capabilities: []
})
assert.deepEqual(intentionallyEmptyCapabilities.capabilities, [])
assert.equal(hasCapability(intentionallyEmptyCapabilities, 'exam.review'), false)
assert.ok(capabilitiesForLegacyRoles(['student', 'tutor']).includes('practice.attempt'))
assert.ok(capabilitiesForLegacyRoles(['student', 'tutor']).includes('exam.create'))

for (const table of [
  'authorization_roles',
  'authorization_capabilities',
  'role_capabilities',
  'user_roles',
  'user_credentials',
  'authorization_events'
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
}
assert.match(migration, /update public\.profiles[\s\S]*?set role = 'student'[\s\S]*?select id, 'student', 'active', true, 'system'/)
assert.match(migration, /disable trigger profiles_prevent_identity_changes[\s\S]*?update public\.profiles[\s\S]*?enable trigger profiles_prevent_identity_changes/)
assert.doesNotMatch(migration, /select id, role, 'active', true, 'legacy'/)
assert.match(migration, /create or replace function public\.bootstrap_first_administrator/)
assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/)
assert.match(migration, /pg_advisory_xact_lock\(hashtext\('public\.bootstrap_first_administrator'\)\)/)
assert.match(migration, /grant execute on function public\.bootstrap_first_administrator\(uuid, text\) to service_role/)
assert.match(migration, /create unique index if not exists user_roles_one_primary_idx/)
assert.match(migration, /create or replace function public\.get_my_authorization\(\)/)
assert.match(migration, /'primaryRole', coalesce\(primary_role, role_keys\[1\], 'student'\)/)
assert.match(migration, /create or replace function public\.grant_user_role\(/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'authorization\.manage'\)/)
assert.match(migration, /create or replace function public\.revoke_user_role\(/)
assert.match(migration, /create or replace function public\.set_my_primary_role\(p_role_key text\)/)
assert.match(migration, /event_type in \('granted', 'regranted', 'revoked', 'primary_selected'\)/)
assert.match(migration, /create or replace function public\.handle_new_user\(\)[\s\S]*?'student'/)
assert.doesNotMatch(migration, /raw_user_meta_data ->> 'role'/)
assert.match(profilesMigration, /create or replace function public\.handle_new_user\(\)[\s\S]*?set search_path = pg_catalog, public[\s\S]*?'student'/)
assert.doesNotMatch(profilesMigration, /raw_user_meta_data ->> 'role'/)
assert.match(migration, /revoke update on public\.profiles from authenticated/)
assert.match(migration, /grant update \(full_name, birth_date\) on public\.profiles to authenticated/)
assert.match(migration, /current_user_has_capability\('form\.create'\)/)
assert.match(migration, /current_user_has_capability\('exam\.review'\)/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'exam\.create'\)/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'exam\.submit_review'\)/)
assert.match(migration, /authorization_user_has_capability\(caller_id, 'exam\.review'\)/)
assert.equal((migration.match(/as \$\$/g) || []).length, (migration.match(/\$\$;/g) || []).length)

const earlyCapabilityHelper = migration.indexOf('create or replace function public.authorization_user_has_capability')
const lifecycleFunction = migration.indexOf('create or replace function public.enforce_exam_definition_lifecycle')
assert.ok(earlyCapabilityHelper >= 0 && earlyCapabilityHelper < lifecycleFunction)

assert.match(authGuard, /supabase\.rpc\('get_my_authorization'\)/)
assert.match(authGuard, /roles: \[\.\.\.authorization\.roles\]/)
assert.match(authGuard, /capabilities: \[\.\.\.authorization\.capabilities\]/)
assert.match(authGuard, /hasAnyRole\(current\.authorization, allowedRoles\)/)
assert.match(authGuard, /export async function requireCapability/)
assert.doesNotMatch(authGuard, /teacher:\s*'tutor'|mentor:\s*'tutor'/)
assert.doesNotMatch(signup, /\brole\s*:/)
assert.match(examReview, /requireCapability\(\["exam\.review"\]\)/)
assert.doesNotMatch(examReview, /rawRole|REVIEWER_ROLES/)
assert.match(tutorDashboard, /current\.can\('exam\.review'\)/)
assert.match(profilePage, /currentAuth\.hasRole\(targetRole\)/)

console.log('Multi-role authorization, capability, migration, and compatibility self-test passed.')
