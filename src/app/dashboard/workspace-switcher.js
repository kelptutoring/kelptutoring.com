import { supabase } from '../../lib/supabase/supabaseClient.js'
import {
  getWorkspaceDefinition,
  getWorkspaceLabel,
  listAssignedWorkspaces
} from '../../auth/workspaces.js'

export function renderDashboardIdentity(current, {
  activeRole,
  headingId,
  profileLineId,
  roleListId,
  fallbackName = 'Kelp user'
}) {
  const firstName = getFirstName(current.profile, fallbackName)
  const workspaceLabel = getWorkspaceLabel(activeRole)
  const heading = document.getElementById(headingId)
  const profileLine = document.getElementById(profileLineId)
  const roleList = document.getElementById(roleListId)

  if (heading) heading.textContent = `${firstName}'s ${workspaceLabel.toLowerCase()} workspace`
  if (profileLine) profileLine.textContent = current.profile.email || 'Signed-in Kelp account'
  if (roleList) {
    roleList.innerHTML = current.roles
      .map((role) => `<span class="workspace-role-badge">${getWorkspaceLabel(role)}</span>`)
      .join('')
  }
}

export function mountWorkspaceSwitcher(current, {
  activeRole,
  rootId = 'workspace-switcher',
  statusId = 'workspace-switcher-status'
}) {
  const root = document.getElementById(rootId)
  const status = document.getElementById(statusId)
  if (!root) return

  const workspaces = listAssignedWorkspaces(current.roles)
  root.innerHTML = workspaces.map((workspace) => {
    const isCurrent = workspace.role === activeRole
    return `
      <button
        type="button"
        class="workspace-switcher-button${isCurrent ? ' is-current' : ''}"
        data-workspace-role="${workspace.role}"
        ${isCurrent ? 'aria-current="page"' : ''}
      >
        <span class="workspace-switcher-dot" aria-hidden="true"></span>
        <span>${workspace.label}</span>
        ${isCurrent ? '<small>Current</small>' : '<small>Open</small>'}
      </button>
    `
  }).join('')

  if (!workspaces.length) {
    root.innerHTML = '<p class="workspace-switcher-empty">No workspace role is currently assigned.</p>'
    return
  }

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-workspace-role]')
    if (!button || button.disabled) return
    const nextRole = button.dataset.workspaceRole
    const workspace = getWorkspaceDefinition(nextRole)
    if (!workspace) return
    if (nextRole === activeRole) {
      setStatus(status, `${workspace.label} is already open.`, false)
      return
    }

    setSwitcherBusy(root, true, button)
    setStatus(status, `Opening the ${workspace.label.toLowerCase()} workspace...`, false)
    try {
      const { error } = await supabase.rpc('set_my_primary_role', { p_role_key: nextRole })
      if (error) throw error
      try {
        localStorage.setItem('kelpDashboardTarget', workspace.dashboardFile)
      } catch (error) {
        console.info('The preferred dashboard could not be cached locally.', error)
      }
      window.location.assign(workspace.path)
    } catch (error) {
      console.error('Workspace switch failed:', error)
      setStatus(status, error?.message || 'This workspace could not be opened.', true)
      setSwitcherBusy(root, false)
    }
  })
}

function setSwitcherBusy(root, busy, activeButton = null) {
  root.querySelectorAll('[data-workspace-role]').forEach((button) => {
    button.disabled = busy
    button.classList.toggle('is-loading', busy && button === activeButton)
  })
}

function setStatus(element, message, isError) {
  if (!element) return
  element.textContent = message
  element.classList.toggle('is-error', Boolean(isError))
}

function getFirstName(profile, fallback) {
  return String(profile?.full_name || profile?.email || fallback).trim().split(/\s+/)[0]
}
