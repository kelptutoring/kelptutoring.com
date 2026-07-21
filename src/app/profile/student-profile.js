import { requireAuth } from '../../auth/auth-guard.js'
import {
  formatBirthDate,
  formatJoinedDuration,
  formatLocation
} from './profile-contract.js'
import {
  getMyProfileConfiguration,
  listProfileConfigurationOptions,
  listProfileCities,
  listProfileCountries,
  listProfileRegions,
  saveMyStudentProfile
} from './profile-data.js'

const state = {
  configuration: null,
  options: null,
  countries: [],
  regionsByCountry: new Map(),
  citiesByRegion: new Map(),
  editing: false,
  saving: false
}

const elements = {}

init().catch((error) => {
  console.error('Student Profile failed:', error)
  showFatal(error?.message || 'Your Profile could not be loaded.')
})

async function init() {
  const current = await requireAuth(['student'])
  if (!current) return
  cacheElements()
  bindEvents()

  const [configuration, options, countries] = await Promise.all([
    getMyProfileConfiguration(),
    listProfileConfigurationOptions(),
    listProfileCountries()
  ])

  state.configuration = configuration
  state.options = options
  state.countries = [...countries]
  await preloadLocation(configuration.profile.location)
  render()
  elements.profileLoading.classList.add('is-hidden')
  elements.profileContent.classList.remove('is-hidden')
  elements.profileEditToggle.disabled = false
}

function cacheElements() {
  const ids = [
    'profile-loading', 'profile-content', 'profile-edit-toggle', 'profile-member-since',
    'profile-completion-status', 'profile-full-name', 'profile-email', 'profile-birth-date',
    'profile-location', 'profile-time-zone', 'profile-detail-grid', 'profile-edit-form',
    'profile-full-name-input', 'profile-birth-date-input', 'profile-birth-date-help',
    'profile-country', 'profile-region', 'profile-city', 'profile-cancel-edit', 'profile-save',
    'hobby-count', 'hobby-view', 'hobby-editor', 'goal-count', 'goal-view', 'goal-editor',
    'profile-class-count', 'profile-course-count', 'profile-tutor-count', 'profile-hour-count',
    'profile-message'
  ]
  for (const id of ids) {
    elements[toCamelCase(id)] = document.getElementById(id)
  }
}

function bindEvents() {
  elements.profileEditToggle.addEventListener('click', () => setEditing(!state.editing))
  elements.profileCancelEdit.addEventListener('click', () => setEditing(false))
  elements.profileEditForm.addEventListener('submit', saveProfile)
  elements.profileCountry.addEventListener('change', () => void handleCountryChange())
  elements.profileRegion.addEventListener('change', () => void handleRegionChange())
}

function render() {
  const { profile, preferences, hobbies, learningGoals, learningSummary } = state.configuration
  elements.profileMemberSince.textContent = formatJoinedDuration(profile.joinedWeeks)
  elements.profileFullName.textContent = profile.fullName || 'Not provided'
  elements.profileEmail.textContent = profile.email || 'Not provided'
  elements.profileBirthDate.textContent = formatBirthDate(profile.birthDate)
  elements.profileLocation.textContent = formatLocation(profile.location)
  elements.profileTimeZone.textContent = profile.location?.timeZone || preferences.timeZone || 'UTC'

  const complete = Boolean(profile.profileCompletedAt)
  elements.profileCompletionStatus.textContent = complete ? 'Profile complete' : 'Needs attention'
  elements.profileCompletionStatus.dataset.status = complete ? 'complete' : 'incomplete'

  renderChoiceView(elements.hobbyView, hobbies, 'No hobbies selected yet.')
  renderChoiceView(elements.goalView, learningGoals, 'No learning goals selected yet.')
  elements.hobbyCount.textContent = countLabel(hobbies.length)
  elements.goalCount.textContent = countLabel(learningGoals.length)

  elements.profileClassCount.textContent = displayStat(learningSummary.completedClasses)
  elements.profileCourseCount.textContent = displayStat(learningSummary.completedCourses)
  elements.profileTutorCount.textContent = displayStat(learningSummary.activeTutors)
  elements.profileHourCount.textContent = learningSummary.tutoringMinutes === null
    ? '—'
    : String(Math.round((learningSummary.tutoringMinutes / 60) * 10) / 10)

  populateEditor()
}

function populateEditor() {
  const { profile, hobbies, learningGoals } = state.configuration
  elements.profileFullNameInput.value = profile.fullName
  elements.profileBirthDateInput.value = profile.birthDate
  elements.profileBirthDateInput.disabled = Boolean(profile.birthDate)
  elements.profileBirthDateInput.required = !profile.birthDate
  elements.profileBirthDateHelp.textContent = profile.birthDate
    ? 'Birth-date corrections require Support review.'
    : 'This can be saved once. Later corrections require Support review.'

  populateCountries(profile.location?.countryCode || '')
  populateRegions(profile.location?.countryCode || '', profile.location?.regionCode || '')
  populateCities(
    profile.location?.countryCode || '',
    profile.location?.regionCode || '',
    profile.location?.key || ''
  )

  renderChoiceEditor(
    elements.hobbyEditor,
    state.options.hobbies,
    new Set(hobbies.map(({ key }) => key)),
    'hobby',
    12
  )
  renderChoiceEditor(
    elements.goalEditor,
    state.options.learningGoals,
    new Set(learningGoals.map(({ key }) => key)),
    'learning-goal',
    8
  )
}

function setEditing(nextEditing) {
  if (state.saving && nextEditing) return
  state.editing = Boolean(nextEditing)
  elements.profileDetailGrid.classList.toggle('is-hidden', state.editing)
  elements.profileEditForm.classList.toggle('is-hidden', !state.editing)
  elements.hobbyView.classList.toggle('is-hidden', state.editing)
  elements.goalView.classList.toggle('is-hidden', state.editing)
  elements.hobbyEditor.classList.toggle('is-hidden', !state.editing)
  elements.goalEditor.classList.toggle('is-hidden', !state.editing)
  elements.profileEditToggle.textContent = state.editing ? 'Close editor' : 'Edit Profile'
  if (state.editing) {
    populateEditor()
    elements.profileFullNameInput.focus()
    showMessage('Editing enabled. Changes are not saved until you choose Save Profile.')
  } else {
    populateEditor()
    showMessage('')
  }
}

async function saveProfile(event) {
  event.preventDefault()
  if (state.saving) return

  const locationKey = elements.profileCity.value
  const hobbyKeys = selectedKeys(elements.hobbyEditor)
  const learningGoalKeys = selectedKeys(elements.goalEditor)
  if (!locationKey) return showMessage('Choose your country, state, and city.', 'error')
  if (hobbyKeys.length > 12) return showMessage('Choose at most 12 hobbies.', 'error')
  if (learningGoalKeys.length > 8) return showMessage('Choose at most 8 learning goals.', 'error')

  state.saving = true
  elements.profileSave.disabled = true
  elements.profileSave.textContent = 'Saving...'
  showMessage('Saving your Profile...')
  try {
    state.configuration = await saveMyStudentProfile({
      profile: {
        fullName: elements.profileFullNameInput.value.trim(),
        birthDate: state.configuration.profile.birthDate || elements.profileBirthDateInput.value,
        locationKey
      },
      hobbyKeys,
      learningGoalKeys
    })
    state.editing = false
    render()
    setEditing(false)
    showMessage('Your Profile was saved and synchronized.', 'success')
  } catch (error) {
    console.error('Student Profile save failed:', error)
    showMessage(error?.message || 'Your Profile could not be saved.', 'error')
  } finally {
    state.saving = false
    elements.profileSave.disabled = false
    elements.profileSave.textContent = 'Save Profile'
  }
}

function populateCountries(selectedCode = '') {
  replaceSelectOptions(elements.profileCountry, [
    { value: '', label: 'Choose a country' },
    ...state.countries.map((country) => ({ value: country.code, label: country.name }))
  ], selectedCode)
  elements.profileCountry.disabled = state.countries.length === 0
}

function populateRegions(countryCode, selectedCode = '') {
  const regions = state.regionsByCountry.get(countryCode) || []
  replaceSelectOptions(elements.profileRegion, [
    { value: '', label: countryCode ? 'Choose a state or region' : 'Choose a country first' },
    ...regions.map((region) => ({ value: region.code, label: region.name }))
  ], selectedCode)
  elements.profileRegion.disabled = !countryCode || regions.length === 0
}

function populateCities(countryCode, regionCode, selectedKey = '') {
  const locations = state.citiesByRegion.get(regionCacheKey(countryCode, regionCode)) || []
  replaceSelectOptions(elements.profileCity, [
    { value: '', label: regionCode ? 'Choose a city' : 'Choose a state or region first' },
    ...locations.map((location) => ({ value: location.key, label: location.cityName }))
  ], selectedKey)
  elements.profileCity.disabled = !regionCode || locations.length === 0
}

async function preloadLocation(location) {
  if (!location?.countryCode) return
  await loadRegions(location.countryCode)
  if (location.regionCode) await loadCities(location.countryCode, location.regionCode)
}

async function handleCountryChange() {
  const countryCode = elements.profileCountry.value
  replaceSelectOptions(elements.profileRegion, [
    { value: '', label: countryCode ? 'Loading states and regions...' : 'Choose a country first' }
  ])
  replaceSelectOptions(elements.profileCity, [{ value: '', label: 'Choose a state or region first' }])
  elements.profileRegion.disabled = true
  elements.profileCity.disabled = true
  if (!countryCode) return
  try {
    await loadRegions(countryCode)
    if (elements.profileCountry.value !== countryCode) return
    populateRegions(countryCode)
  } catch (error) {
    console.error('Profile regions failed:', error)
    showMessage('States and regions could not be loaded. Try again.', 'error')
  }
}

async function handleRegionChange() {
  const countryCode = elements.profileCountry.value
  const regionCode = elements.profileRegion.value
  replaceSelectOptions(elements.profileCity, [
    { value: '', label: regionCode ? 'Loading cities...' : 'Choose a state or region first' }
  ])
  elements.profileCity.disabled = true
  if (!countryCode || !regionCode) return
  try {
    await loadCities(countryCode, regionCode)
    if (elements.profileCountry.value !== countryCode || elements.profileRegion.value !== regionCode) return
    populateCities(countryCode, regionCode)
  } catch (error) {
    console.error('Profile cities failed:', error)
    showMessage('Cities could not be loaded. Try again.', 'error')
  }
}

async function loadRegions(countryCode) {
  if (!state.regionsByCountry.has(countryCode)) {
    state.regionsByCountry.set(countryCode, [...await listProfileRegions(countryCode)])
  }
  return state.regionsByCountry.get(countryCode)
}

async function loadCities(countryCode, regionCode) {
  const key = regionCacheKey(countryCode, regionCode)
  if (!state.citiesByRegion.has(key)) {
    state.citiesByRegion.set(key, [...await listProfileCities(countryCode, regionCode)])
  }
  return state.citiesByRegion.get(key)
}

function regionCacheKey(countryCode, regionCode) {
  return `${countryCode}:${regionCode}`
}

function replaceSelectOptions(select, options, selectedValue = '') {
  select.replaceChildren()
  for (const option of options) {
    const node = document.createElement('option')
    node.value = option.value
    node.textContent = option.label
    node.selected = option.value === selectedValue
    select.append(node)
  }
}

function renderChoiceView(root, choices, emptyLabel) {
  root.replaceChildren()
  if (!choices.length) {
    const empty = document.createElement('p')
    empty.className = 'profile-empty-copy'
    empty.textContent = emptyLabel
    root.append(empty)
    return
  }
  for (const choice of choices) {
    const chip = document.createElement('span')
    chip.className = 'profile-chip'
    chip.textContent = choice.name
    root.append(chip)
  }
}

function renderChoiceEditor(root, options, selected, name, maximum) {
  root.replaceChildren()
  for (const option of options) {
    const label = document.createElement('label')
    label.className = 'profile-choice'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.name = name
    input.value = option.key
    input.checked = selected.has(option.key)
    input.addEventListener('change', () => enforceChoiceMaximum(root, input, maximum))
    const text = document.createElement('span')
    text.textContent = option.name
    label.append(input, text)
    root.append(label)
  }
}

function enforceChoiceMaximum(root, changedInput, maximum) {
  const checked = root.querySelectorAll('input:checked')
  if (checked.length <= maximum) return
  changedInput.checked = false
  showMessage(`Choose at most ${maximum} options in this section.`, 'error')
}

function selectedKeys(root) {
  return [...root.querySelectorAll('input:checked')].map(({ value }) => value)
}

function displayStat(value) {
  return value === null || value === undefined ? '—' : String(value)
}

function countLabel(count) {
  return `${count} selected`
}

function showMessage(message, tone = '') {
  elements.profileMessage.textContent = message
  elements.profileMessage.dataset.tone = tone
}

function showFatal(message) {
  const loading = document.getElementById('profile-loading')
  const feedback = document.getElementById('profile-message')
  loading?.classList.add('is-hidden')
  if (feedback) {
    feedback.textContent = message
    feedback.dataset.tone = 'error'
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
}
