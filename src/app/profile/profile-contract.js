export const PROFILE_CONTRACT_VERSION = 2
export const DEFAULT_THEME_KEY = 'ocean'

export const THEME_KEYS = Object.freeze([
  'ocean',
  'kelp',
  'coral',
  'orchid',
  'sunrise',
  'slate'
])

const THEME_KEY_SET = new Set(THEME_KEYS)

export function normalizeThemeKey(value) {
  const key = String(value || '').trim().toLowerCase()
  return THEME_KEY_SET.has(key) ? key : DEFAULT_THEME_KEY
}

export function normalizeProfileConfiguration(payload) {
  const value = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const profile = value.profile && typeof value.profile === 'object' ? value.profile : {}
  const preferences = value.preferences && typeof value.preferences === 'object' ? value.preferences : {}
  const learningSummary = value.learningSummary && typeof value.learningSummary === 'object'
    ? value.learningSummary
    : {}

  return Object.freeze({
    version: Number(value.version) || PROFILE_CONTRACT_VERSION,
    profile: Object.freeze({
      id: String(profile.id || ''),
      fullName: String(profile.fullName || ''),
      email: String(profile.email || ''),
      birthDate: profile.birthDate ? String(profile.birthDate) : '',
      createdAt: profile.createdAt ? String(profile.createdAt) : '',
      updatedAt: profile.updatedAt ? String(profile.updatedAt) : '',
      joinedWeeks: Math.max(0, Number(profile.joinedWeeks) || 0),
      profileCompletedAt: profile.profileCompletedAt ? String(profile.profileCompletedAt) : '',
      location: normalizeLocation(profile.location)
    }),
    preferences: Object.freeze({
      themeKey: normalizeThemeKey(preferences.themeKey),
      timeZone: String(preferences.timeZone || 'UTC'),
      timeZoneConfirmedAt: preferences.timeZoneConfirmedAt ? String(preferences.timeZoneConfirmedAt) : '',
      timeZoneSource: String(preferences.timeZoneSource || 'profile_location'),
      schemaVersion: Math.max(1, Number(preferences.schemaVersion) || 1)
    }),
    hobbies: Object.freeze(normalizeChoices(value.hobbies)),
    learningGoals: Object.freeze(normalizeChoices(value.learningGoals)),
    learningSummary: Object.freeze({
      status: String(learningSummary.status || 'awaiting_learning_domains'),
      activeTutors: normalizeNullableNumber(learningSummary.activeTutors),
      completedClasses: normalizeNullableNumber(learningSummary.completedClasses),
      completedCourses: normalizeNullableNumber(learningSummary.completedCourses),
      tutoringMinutes: normalizeNullableNumber(learningSummary.tutoringMinutes)
    })
  })
}

export function normalizeConfigurationOptions(payload) {
  const value = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  return Object.freeze({
    themes: Object.freeze(normalizeChoices(value.themes).map((item) => Object.freeze({
      ...item,
      key: normalizeThemeKey(item.key)
    }))),
    hobbies: Object.freeze(normalizeChoices(value.hobbies)),
    learningGoals: Object.freeze(normalizeChoices(value.learningGoals))
  })
}

export function normalizeLocations(payload) {
  return Object.freeze((Array.isArray(payload) ? payload : [])
    .map(normalizeLocation)
    .filter((location) => location?.key))
}

export function normalizeCountries(payload) {
  return Object.freeze(normalizeNamedCodes(payload))
}

export function normalizeRegions(payload) {
  return Object.freeze(normalizeNamedCodes(payload).map((region) => Object.freeze({
    ...region,
    type: String(region.type || '')
  })))
}

export function groupLocations(locations) {
  const countries = new Map()
  for (const location of normalizeLocations(locations)) {
    if (!countries.has(location.countryCode)) {
      countries.set(location.countryCode, {
        code: location.countryCode,
        name: location.countryName,
        regions: new Map()
      })
    }
    const country = countries.get(location.countryCode)
    if (!country.regions.has(location.regionCode)) {
      country.regions.set(location.regionCode, {
        code: location.regionCode,
        name: location.regionName,
        locations: []
      })
    }
    country.regions.get(location.regionCode).locations.push(location)
  }
  return [...countries.values()].sort(compareByName).map((country) => ({
    ...country,
    regions: [...country.regions.values()].sort(compareByName).map((region) => ({
      ...region,
      locations: [...region.locations].sort((a, b) => a.cityName.localeCompare(b.cityName))
    }))
  }))
}

export function getSupportedTimeZones(extraValues = []) {
  let supported = []
  try {
    supported = typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : []
  } catch (error) {
    supported = []
  }
  return [...new Set([
    ...supported,
    ...extraValues.map((value) => String(value || '').trim()).filter(Boolean),
    'UTC'
  ])].sort((a, b) => a.localeCompare(b))
}

export function getDetectedTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch (error) {
    return 'UTC'
  }
}

export function formatLocation(location) {
  if (!location) return 'Not confirmed yet'
  return [location.cityName, location.regionName, location.countryName].filter(Boolean).join(', ')
}

export function formatJoinedDuration(weeks) {
  const normalized = Math.max(0, Number(weeks) || 0)
  if (normalized === 0) return 'Joined this week'
  if (normalized === 1) return 'Joined 1 week ago'
  return `Joined ${normalized} weeks ago`
}

export function formatBirthDate(value, locale = 'en') {
  if (!value) return 'Not provided'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}

function normalizeLocation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const location = {
    key: String(value.key || ''),
    countryCode: String(value.countryCode || ''),
    countryName: String(value.countryName || ''),
    regionCode: String(value.regionCode || ''),
    regionName: String(value.regionName || ''),
    cityName: String(value.cityName || ''),
    timeZone: String(value.timeZone || '')
  }
  return Object.freeze(location)
}

function normalizeChoices(values) {
  const seen = new Set()
  const choices = []
  for (const item of Array.isArray(values) ? values : []) {
    const key = String(item?.key || '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    choices.push(Object.freeze({
      key,
      name: String(item?.name || key),
      description: String(item?.description || '')
    }))
  }
  return choices
}

function normalizeNamedCodes(values) {
  const seen = new Set()
  const choices = []
  for (const item of Array.isArray(values) ? values : []) {
    const code = String(item?.code || '').trim()
    const name = String(item?.name || '').trim()
    if (!code || !name || seen.has(code)) continue
    seen.add(code)
    choices.push(Object.freeze({ code, name, type: String(item?.type || '') }))
  }
  return choices.sort(compareByName)
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function compareByName(left, right) {
  return String(left.name).localeCompare(String(right.name))
}
