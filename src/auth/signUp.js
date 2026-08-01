import { supabase } from '../lib/supabase/supabaseClient.js'
import { redirectLoggedUser } from './auth-guard.js'
import {
  listProfileCities,
  listProfileCountries,
  listProfileRegions
} from '../app/profile/profile-data.js'

const form = document.getElementById('signup-form')
const messageBox = document.getElementById('message')
const countrySelect = document.getElementById('country')
const regionSelect = document.getElementById('region')
const citySelect = document.getElementById('city')
const submitButton = document.getElementById('signup-submit')
const locationHelp = document.getElementById('location-help')
const locationRetry = document.getElementById('location-retry')
const birthDateInput = document.getElementById('birthDate')

const state = {
  countries: [],
  regions: [],
  cities: [],
  regionRequest: 0,
  cityRequest: 0,
  ready: false,
  submitting: false
}

countrySelect?.addEventListener('change', () => void loadRegions(countrySelect.value))
regionSelect?.addEventListener('change', () => void loadCities(countrySelect.value, regionSelect.value))
locationRetry?.addEventListener('click', () => {
  void initializeSignup().catch(handleLocationLoadFailure)
})

initializeSignup().catch(handleLocationLoadFailure)

form?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.ready || state.submitting) return

  const fullName = document.getElementById('fullName').value.trim()
  const birthDate = birthDateInput.value
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const locationKey = citySelect.value

  state.submitting = true
  submitButton.disabled = true
  submitButton.textContent = 'Creating account...'
  setMessage('Creating your Kelp account...')

  const result = await handleSignUp({ fullName, email, password, birthDate, locationKey })

  setMessage(result.message)
  if (result.ok) {
    if (result.session) {
      setMessage('Loading your workspace...')
      try {
        await redirectLoggedUser()
      } catch (error) {
        console.error('Sign-up succeeded, but workspace routing failed:', error)
        setMessage('Account created, but your Profile could not be loaded yet. Try logging in.')
      }
      return
    }
    window.location.href = '../signUp/login.html'
    return
  }

  state.submitting = false
  submitButton.disabled = false
  submitButton.textContent = 'Create account'
})

async function initializeSignup() {
  if (!form) return
  const today = new Date()
  birthDateInput.max = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-')

  state.ready = false
  submitButton.disabled = true
  locationRetry.hidden = true
  locationHelp.textContent = 'Loading Kelp\'s governed location catalog…'
  replaceSelectOptions(countrySelect, [{ value: '', label: 'Loading locations...' }])
  countrySelect.disabled = true
  replaceSelectOptions(regionSelect, [{ value: '', label: 'Choose a country first' }])
  replaceSelectOptions(citySelect, [{ value: '', label: 'Choose a state or region first' }])
  regionSelect.disabled = true
  citySelect.disabled = true
  state.countries = [...await listProfileCountries()]
  populateCountries()

  state.ready = state.countries.length > 0
  submitButton.disabled = !state.ready
  locationHelp.textContent = state.ready
    ? "Choose from Kelp's governed location catalog. Your timezone is set from the selected city."
    : 'No signup locations are currently available.'
  if (state.ready) setMessage('')
}

function populateCountries() {
  replaceSelectOptions(countrySelect, [
    { value: '', label: 'Choose a country' },
    ...state.countries.map(({ code, name }) => ({ value: code, label: name }))
  ])
  countrySelect.disabled = state.countries.length === 0
}

async function loadRegions(countryCode) {
  const request = ++state.regionRequest
  state.cityRequest += 1
  state.regions = []
  state.cities = []
  replaceSelectOptions(regionSelect, [
    { value: '', label: countryCode ? 'Loading states and regions...' : 'Choose a country first' }
  ])
  replaceSelectOptions(citySelect, [{ value: '', label: 'Choose a state or region first' }])
  regionSelect.disabled = true
  citySelect.disabled = true
  if (!countryCode) return

  try {
    const regions = [...await listProfileRegions(countryCode)]
    if (request !== state.regionRequest || countrySelect.value !== countryCode) return
    state.regions = regions
    replaceSelectOptions(regionSelect, [
      { value: '', label: regions.length ? 'Choose a state or region' : 'No regions available' },
      ...regions.map(({ code, name }) => ({ value: code, label: name }))
    ])
    regionSelect.disabled = regions.length === 0
  } catch (error) {
    console.error('Signup regions failed:', error)
    if (request === state.regionRequest) setMessage('States and regions could not be loaded. Try again.')
  }
}

async function loadCities(countryCode, regionCode) {
  const request = ++state.cityRequest
  state.cities = []
  replaceSelectOptions(citySelect, [
    { value: '', label: regionCode ? 'Loading cities...' : 'Choose a state or region first' }
  ])
  citySelect.disabled = true
  if (!countryCode || !regionCode) return

  try {
    const cities = [...await listProfileCities(countryCode, regionCode)]
    if (request !== state.cityRequest || countrySelect.value !== countryCode || regionSelect.value !== regionCode) return
    state.cities = cities
    replaceSelectOptions(citySelect, [
      { value: '', label: cities.length ? 'Choose a city' : 'No cities available' },
      ...cities.map(({ key, cityName }) => ({ value: key, label: cityName }))
    ])
    citySelect.disabled = cities.length === 0
  } catch (error) {
    console.error('Signup cities failed:', error)
    if (request === state.cityRequest) setMessage('Cities could not be loaded. Try again.')
  }
}

function replaceSelectOptions(select, options) {
  select.replaceChildren()
  for (const item of options) {
    const option = document.createElement('option')
    option.value = item.value
    option.textContent = item.label
    select.append(option)
  }
}

async function handleSignUp({ fullName, email, password, birthDate, locationKey }) {
  if (!fullName || !email || !password || !birthDate || !locationKey) {
    return { ok: false, message: 'Fill in all required fields.' }
  }
  if (password.length < 6) {
    return { ok: false, message: 'Password must have at least 6 characters.' }
  }
  if (!state.cities.some(({ key }) => key === locationKey)) {
    return { ok: false, message: 'Choose an available country, state, and city.' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        birth_date: birthDate,
        location_key: locationKey
      }
    }
  })
  if (error) return { ok: false, message: error.message }

  const user = data?.user
  const session = data?.session
  if (!user) return { ok: false, message: 'User could not be created.' }
  return {
    ok: true,
    message: session ? 'Account created successfully.' : 'Account created. Check your email or log in.',
    session,
    user
  }
}

function handleLocationLoadFailure(error) {
  console.error('Signup configuration failed:', error)
  state.ready = false
  state.countries = []
  submitButton.disabled = true
  countrySelect.disabled = true
  regionSelect.disabled = true
  citySelect.disabled = true
  locationRetry.hidden = false
  locationHelp.textContent = 'Locations could not be loaded. Check your connection and try again.'
  setMessage('Signup locations could not be loaded.')
}

function setMessage(message) {
  if (messageBox) messageBox.textContent = message
}
