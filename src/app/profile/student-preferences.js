import { requireAuth } from '../../auth/auth-guard.js'
import { applyThemePreference } from '../../auth/theme.js'
import { normalizeThemeKey } from './profile-contract.js'
import {
  getMyProfileConfiguration,
  listProfileConfigurationOptions,
  resetMyPreferences,
  saveMyPreferences
} from './profile-data.js'

const state = {
  configuration: null,
  options: null,
  saving: false
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
    'preferences-loading', 'preferences-form', 'theme-grid', 'reset-theme',
    'save-preferences', 'preferences-message'
  ]
  for (const id of ids) elements[toCamelCase(id)] = document.getElementById(id)
}

function bindEvents() {
  elements.preferencesForm.addEventListener('submit', savePreferences)
  elements.resetTheme.addEventListener('click', resetTheme)
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
      if (input.checked) applyThemePreference(theme.key, { cache: false })
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

async function savePreferences(event) {
  event.preventDefault()
  if (state.saving) return
  const themeKey = elements.themeGrid.querySelector('input[name="themeKey"]:checked')?.value
  await runPreferenceMutation(
    () => saveMyPreferences({ themeKey }),
    'Your theme was saved and synchronized.'
  )
}

async function resetTheme() {
  if (state.saving) return
  await runPreferenceMutation(
    () => resetMyPreferences('theme'),
    'The Ocean theme was restored.'
  )
}

async function runPreferenceMutation(mutation, successMessage) {
  state.saving = true
  setButtonsDisabled(true)
  showMessage('Synchronizing your theme...')
  try {
    state.configuration = await mutation()
    applyThemePreference(state.configuration.preferences.themeKey)
    renderThemes()
    showMessage(successMessage, 'success')
  } catch (error) {
    console.error('Preference update failed:', error)
    applyThemePreference(state.configuration.preferences.themeKey)
    showMessage(error?.message || 'Your theme could not be updated.', 'error')
  } finally {
    state.saving = false
    setButtonsDisabled(false)
  }
}

function setButtonsDisabled(disabled) {
  elements.savePreferences.disabled = disabled
  elements.resetTheme.disabled = disabled
  elements.savePreferences.textContent = disabled ? 'Saving...' : 'Save theme'
}

function showMessage(message, tone = '') {
  elements.preferencesMessage.textContent = message
  elements.preferencesMessage.dataset.tone = tone
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
