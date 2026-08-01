import { requireAuth } from '../../auth/auth-guard.js'
import { applyThemePreference } from '../../auth/theme.js'
import { normalizeThemeKey } from './profile-contract.js'
import {
  getMyProfileConfiguration,
  listProfileConfigurationOptions,
  saveMyPreferences
} from './profile-data.js'

const state = {
  configuration: null,
  options: null,
  saving: false,
  pendingThemeKey: '',
  messageTimer: 0
}

const elements = {}

init().catch((error) => {
  console.error('Student preferences failed:', error)
  showFatal(error?.message || 'Your preferences could not be loaded.')
})

async function init() {
  const current = await requireAuth(['student'])
  if (!current) return
  cacheElements()
  bindEvents()

  const [configuration, options] = await Promise.all([
    getMyProfileConfiguration(),
    listProfileConfigurationOptions()
  ])
  state.configuration = configuration
  state.options = options
  renderThemes()
  elements.preferencesLoading.classList.add('is-hidden')
  elements.preferencesForm.classList.remove('is-hidden')
}

function cacheElements() {
  const ids = [
    'preferences-loading', 'preferences-form', 'theme-grid', 'preferences-message'
  ]
  for (const id of ids) elements[toCamelCase(id)] = document.getElementById(id)
}

function bindEvents() {
  elements.preferencesForm.addEventListener('submit', (event) => event.preventDefault())
}

function renderThemes() {
  const selectedTheme = normalizeThemeKey(state.configuration.preferences.themeKey)
  elements.themeGrid.replaceChildren()
  for (const theme of state.options.themes) {
    const label = document.createElement('label')
    label.className = 'theme-option'
    label.dataset.themePreview = theme.key

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = 'themeKey'
    input.value = theme.key
    input.checked = theme.key === selectedTheme
    input.addEventListener('change', () => {
      if (input.checked) selectTheme(theme.key)
    })

    const preview = document.createElement('span')
    preview.className = 'theme-option-preview'
    preview.setAttribute('aria-hidden', 'true')
    const copy = document.createElement('span')
    copy.className = 'theme-option-copy'
    const name = document.createElement('strong')
    name.textContent = theme.name
    const description = document.createElement('small')
    description.textContent = theme.description
    copy.append(name, description)
    label.append(input, preview, copy)
    elements.themeGrid.append(label)
  }
}

function selectTheme(themeKey) {
  state.pendingThemeKey = normalizeThemeKey(themeKey)
  applyThemePreference(state.pendingThemeKey)
  showMessage('Synchronizing your theme...')
  void persistPendingTheme()
}

async function persistPendingTheme() {
  if (state.saving) return
  state.saving = true
  try {
    while (state.pendingThemeKey) {
      const themeKey = state.pendingThemeKey
      state.pendingThemeKey = ''
      try {
        state.configuration = await saveMyPreferences({ themeKey })
        if (!state.pendingThemeKey) {
          applyThemePreference(state.configuration.preferences.themeKey)
          renderThemes()
          showMessage('Theme updated.', 'success', { transient: true })
        }
      } catch (error) {
        console.error('Preference update failed:', error)
        if (!state.pendingThemeKey) {
          applyThemePreference(state.configuration.preferences.themeKey)
          renderThemes()
          showMessage(error?.message || 'Your theme could not be updated.', 'error')
        }
      }
    }
  } finally {
    state.saving = false
  }
}

function showMessage(message, tone = '', { transient = false } = {}) {
  window.clearTimeout(state.messageTimer)
  elements.preferencesMessage.textContent = message
  elements.preferencesMessage.dataset.tone = tone
  if (transient && message) {
    state.messageTimer = window.setTimeout(() => showMessage(''), 2000)
  }
}
function showFatal(message) {
  document.getElementById('preferences-loading')?.classList.add('is-hidden')
  const feedback = document.getElementById('preferences-message')
  if (feedback) {
    feedback.textContent = message
    feedback.dataset.tone = 'error'
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
}
