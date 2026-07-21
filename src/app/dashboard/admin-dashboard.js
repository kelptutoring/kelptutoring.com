import { requireAuth, signOutAndRedirect } from '../../auth/auth-guard.js'
import { mountWorkspaceSwitcher, renderDashboardIdentity } from './workspace-switcher.js'

init().catch((error) => {
  console.error('Administrator dashboard failed:', error)
})

async function init() {
  const current = await requireAuth(['admin'])
  if (!current) return

  renderDashboardIdentity(current, {
    activeRole: 'admin',
    headingId: 'admin-heading',
    profileLineId: 'admin-profile-line',
    roleListId: 'admin-role-list',
    fallbackName: 'Administrator'
  })
  mountWorkspaceSwitcher(current, { activeRole: 'admin' })
  renderAuthorizationSummary(current)
  applyCapabilityState(current)
  document.getElementById('logout-admin')?.addEventListener('click', signOutAndRedirect)
}

function renderAuthorizationSummary(current) {
  const authorization = document.getElementById('admin-authorization-status')
  const credentials = document.getElementById('admin-credential-status')
  const count = document.getElementById('admin-capability-count')
  if (authorization) authorization.textContent = current.can('authorization.manage') ? 'Role management enabled' : 'Role management unavailable'
  if (credentials) credentials.textContent = current.can('credentials.review') ? 'Credential review enabled' : 'Credential review unavailable'
  if (count) count.textContent = `${current.capabilities.length} ${current.capabilities.length === 1 ? 'capability' : 'capabilities'}`
}

function applyCapabilityState(current) {
  document.querySelectorAll('[data-requires-capability]').forEach((element) => {
    const allowed = current.can(element.dataset.requiresCapability)
    element.classList.toggle('is-capability-disabled', !allowed)
    if (!allowed && element.matches('a')) {
      element.removeAttribute('href')
      element.setAttribute('aria-disabled', 'true')
    }
  })
}
