import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getWorkspaceDefinition,
  getWorkspacePathByRole,
  listAssignedWorkspaces
} from '../src/auth/workspaces.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dashboardRoot = resolve(projectRoot, 'src/app/dashboard')
const [
  authGuard,
  switcher,
  studentHtml,
  studentJs,
  tutorHtml,
  tutorJs,
  mentorHtml,
  mentorJs,
  relationshipData,
  adminHtml,
  adminJs,
  reviewHtml,
  reviewJs,
  styles
] = await Promise.all([
  readFile(resolve(projectRoot, 'src/auth/auth-guard.js'), 'utf8'),
  readFile(resolve(dashboardRoot, 'workspace-switcher.js'), 'utf8'),
  readFile(resolve(dashboardRoot, 'student-dashboard.html'), 'utf8'),
  readFile(resolve(dashboardRoot, 'student-dashboard.js'), 'utf8'),
  readFile(resolve(dashboardRoot, 'tutor-dashboard.html'), 'utf8'),
  readFile(resolve(dashboardRoot, 'tutor-dashboard.js'), 'utf8'),
  readFile(resolve(dashboardRoot, 'mentor-dashboard.html'), 'utf8'),
  readFile(resolve(dashboardRoot, 'mentor-dashboard.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/data/relationshipData.js'), 'utf8'),
  readFile(resolve(dashboardRoot, 'admin-dashboard.html'), 'utf8'),
  readFile(resolve(dashboardRoot, 'admin-dashboard.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/exam-builder/exam-review.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/exam-builder/exam-review.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/styles/style.css'), 'utf8')
])

assert.equal(getWorkspacePathByRole('student'), '/src/app/dashboard/student-dashboard.html')
assert.equal(getWorkspacePathByRole('tutor'), '/src/app/dashboard/tutor-dashboard.html')
assert.equal(getWorkspacePathByRole('teacher'), '/src/app/dashboard/tutor-dashboard.html')
assert.equal(getWorkspacePathByRole('mentor'), '/src/app/dashboard/mentor-dashboard.html')
assert.equal(getWorkspacePathByRole('administrator'), '/src/app/dashboard/admin-dashboard.html')
assert.equal(getWorkspacePathByRole('unknown'), '')
assert.equal(getWorkspaceDefinition('admin')?.capability, 'workspace.admin')
assert.deepEqual(
  listAssignedWorkspaces(['student', 'mentor', 'admin']).map(({ role }) => role),
  ['student', 'mentor', 'admin']
)

assert.match(authGuard, /getWorkspacePathByRole\(role\) \|\| LOGIN_PATH/)
assert.match(switcher, /supabase\.rpc\('set_my_primary_role', \{ p_role_key: nextRole \}\)/)
assert.match(switcher, /localStorage\.setItem\('kelpDashboardTarget', workspace\.dashboardFile\)/)
assert.match(switcher, /listAssignedWorkspaces\(current\.roles\)/)

for (const html of [studentHtml, tutorHtml, mentorHtml, adminHtml]) {
  assert.match(html, /id="workspace-switcher"/)
  assert.match(html, /id="workspace-switcher-status"/)
}

for (const html of [tutorHtml, mentorHtml, adminHtml]) {
  assert.match(html, /aria-label="Assigned roles"/)
}
assert.doesNotMatch(studentHtml, /aria-label="Assigned roles"|student-profile-line/)

assert.match(studentJs, /requireAuth\(\['student'\]\)/)
assert.doesNotMatch(studentJs, /requireAuth\(\['student',\s*'admin'\]\)/)
assert.match(tutorJs, /requireAuth\(\['teacher', 'tutor'\]\)/)
assert.doesNotMatch(tutorJs, /'mentor',\s*'admin'/)
assert.match(mentorJs, /requireAuth\(\['mentor'\]\)/)
assert.match(mentorJs, /getMyLearningRelationships\(\)/)
assert.match(mentorJs, /course\?\.mentor\?\.id === current\.user\.id/)
assert.match(mentorHtml, /id="mentor-course-grid"/)
assert.match(mentorHtml, />Your Courses and Classrooms</)
assert.match(relationshipData, /supabase\.rpc\('get_my_learning_relationships'\)/)
assert.match(adminJs, /requireAuth\(\['admin'\]\)/)

for (const html of [mentorHtml, adminHtml]) {
  assert.match(html, />Course Builder</)
  assert.match(html, /href="\.\.\/course-builder\/course-builder\.html"/)
  assert.match(html, /href="\.\.\/exam-builder\/exam-review\.html"/)
}
assert.match(mentorHtml, /data-requires-capability="taxonomy\.propose"/)
assert.match(adminHtml, /data-requires-capability="taxonomy\.manage"/)
assert.match(mentorHtml, /Mentor privileges remain explicit/)
assert.match(adminHtml, /Administrative access is server-owned/)
assert.match(adminHtml, />Roles and access</)
assert.match(adminHtml, />Credential review</)

assert.equal((reviewHtml.match(/data-workspace-home/g) || []).length, 2)
assert.match(reviewJs, /getHomePathByRole\(current\.primaryRole\)/)
assert.match(styles, /\.workspace-action-grid/)
assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.workspace-hero-layout/)

console.log('Multi-role dashboard routing, workspace switching, and role-boundary self-test passed.')
