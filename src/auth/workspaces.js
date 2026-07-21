import { normalizeRoleKey } from './authorization.js'

export const WORKSPACE_DEFINITIONS = Object.freeze([
  Object.freeze({
    role: 'student',
    label: 'Student',
    path: '/src/app/dashboard/student-dashboard.html',
    dashboardFile: 'student-dashboard.html',
    capability: 'workspace.student'
  }),
  Object.freeze({
    role: 'tutor',
    label: 'Tutor',
    path: '/src/app/dashboard/tutor-dashboard.html',
    dashboardFile: 'tutor-dashboard.html',
    capability: 'workspace.tutor'
  }),
  Object.freeze({
    role: 'teacher',
    label: 'Teacher',
    path: '/src/app/dashboard/tutor-dashboard.html',
    dashboardFile: 'tutor-dashboard.html',
    capability: 'workspace.teacher'
  }),
  Object.freeze({
    role: 'mentor',
    label: 'Mentor',
    path: '/src/app/dashboard/mentor-dashboard.html',
    dashboardFile: 'mentor-dashboard.html',
    capability: 'workspace.mentor'
  }),
  Object.freeze({
    role: 'admin',
    label: 'Administrator',
    path: '/src/app/dashboard/admin-dashboard.html',
    dashboardFile: 'admin-dashboard.html',
    capability: 'workspace.admin'
  })
])

const WORKSPACE_BY_ROLE = new Map(
  WORKSPACE_DEFINITIONS.map((workspace) => [workspace.role, workspace])
)

export function getWorkspaceDefinition(role) {
  return WORKSPACE_BY_ROLE.get(normalizeRoleKey(role)) || null
}

export function getWorkspacePathByRole(role) {
  return getWorkspaceDefinition(role)?.path || ''
}

export function getWorkspaceLabel(role) {
  return getWorkspaceDefinition(role)?.label || normalizeRoleKey(role) || 'Unknown'
}

export function listAssignedWorkspaces(roles) {
  const assigned = new Set(
    (Array.isArray(roles) ? roles : [])
      .map(normalizeRoleKey)
      .filter(Boolean)
  )
  return WORKSPACE_DEFINITIONS.filter((workspace) => assigned.has(workspace.role))
}
