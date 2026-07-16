import { requireAuth, normalizeRole } from '../../auth/auth-guard.js'
import { supabase } from '../../lib/supabase/supabaseClient.js'

let editable = false
let currentAuth = null

init().catch((error) => {
  console.error('Profile page failed:', error)
  showMessage('Profile could not be loaded.')
})

async function init() {
  currentAuth = await requireAuth(['student', 'teacher', 'tutor', 'mentor', 'admin'])
  if (!currentAuth) return

  const targetRole = normalizeRole(document.body.dataset.profileRole)
  const isOwnProfilePage = currentAuth.profile.role === targetRole
  const canEdit = isOwnProfilePage
  const editToggle = document.getElementById('profile-edit-toggle')

  if (!isOwnProfilePage) {
    renderLockedMessage(targetRole, currentAuth.profile.role)
    if (editToggle) editToggle.disabled = true
    return
  }

  editable = false
  if (editToggle) editToggle.disabled = !canEdit

  renderForm(currentAuth.profile, canEdit)
  editToggle?.addEventListener('click', () => {
    editable = !editable && canEdit
    renderForm(currentAuth.profile, canEdit)
  })
}

function renderLockedMessage(targetRole, currentRole) {
  const form = document.getElementById('profile-form')
  if (form) {
    form.innerHTML = `
      <div class="empty-panel-state full-span">
        ${capitalize(targetRole)} profile selection is not connected yet for ${currentRole} accounts.
      </div>
    `
  }
  showMessage('Linked profile access will need the student-tutor relationship table.')
}

function renderForm(profile, canEdit) {
  const form = document.getElementById('profile-form')
  if (!form) return

  const fields = [
    { key: 'full_name', label: 'Full name', type: 'text', editable: true },
    { key: 'email', label: 'Email', type: 'email', editable: false },
    { key: 'role', label: 'Role', type: 'text', editable: false },
    { key: 'birth_date', label: 'Birth date', type: 'date', editable: true }
  ]

  form.innerHTML = fields.map((field) => {
    const value = profile[field.key] ?? ''
    const disabled = !canEdit || !editable || !field.editable
    return `
      <label class="form-field">
        <span>${field.label}</span>
        <input
          name="${field.key}"
          type="${field.type}"
          value="${escapeHtml(value)}"
          ${disabled ? 'disabled' : ''}
        />
      </label>
    `
  }).join('') + (canEdit ? `<button type="submit" class="btn-primary full-span" ${editable ? '' : 'disabled'}>Save profile</button>` : '')

  showMessage(canEdit ? (editable ? 'Editing enabled.' : 'Read-only mode. Click edit to update.') : 'Read-only profile.')

  form.onsubmit = async (event) => {
    event.preventDefault()
    await saveProfile(new FormData(form))
  }
}

async function saveProfile(formData) {
  if (!currentAuth) return

  const updates = {
    full_name: String(formData.get('full_name') || '').trim(),
    birth_date: formData.get('birth_date') || null
  }

  if (!updates.full_name) {
    showMessage('Full name is required.')
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', currentAuth.user.id)
    .select('id, full_name, email, role, birth_date')
    .single()

  if (error) {
    console.error('Profile update failed:', error)
    showMessage(error.message || 'Profile could not be saved.')
    return
  }

  currentAuth.profile = {
    ...currentAuth.profile,
    ...data,
    role: normalizeRole(data.role),
    rawRole: data.role
  }
  editable = false
  renderForm(currentAuth.profile, true)
  showMessage('Profile saved.')
}

function showMessage(value) {
  const message = document.getElementById('profile-message')
  if (message) message.textContent = value
}

function capitalize(value) {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1)
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
