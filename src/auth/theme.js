import { DEFAULT_THEME_KEY, normalizeThemeKey } from '../app/profile/profile-contract.js'

export const FIRST_PAINT_THEME_STORAGE_KEY = 'kelp:first-paint-theme:v1'

export function applyThemePreference(themeKey, { cache = true } = {}) {
  const normalized = normalizeThemeKey(themeKey)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.kelpTheme = normalized
    document.documentElement.dataset.kelpThemeSource = cache ? 'server-preference' : 'unsaved-preview'
  }
  if (cache) cacheFirstPaintTheme(normalized)
  return normalized
}

export function getFirstPaintTheme() {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_KEY
  try {
    const cached = localStorage.getItem(FIRST_PAINT_THEME_STORAGE_KEY)
    return cached ? normalizeThemeKey(cached) : DEFAULT_THEME_KEY
  } catch (error) {
    return DEFAULT_THEME_KEY
  }
}

export async function getMyThemePreference(client, userId) {
  if (!client || !userId) return defaultPreferences()
  try {
    const { data, error } = await client
      .from('user_preferences')
      .select('theme_key, time_zone, time_zone_confirmed_at, schema_version')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.info('Synchronized preferences are not available yet; using the default theme.', error.message)
      return defaultPreferences()
    }
    return {
      themeKey: applyThemePreference(data?.theme_key),
      timeZone: String(data?.time_zone || 'UTC'),
      timeZoneConfirmedAt: data?.time_zone_confirmed_at || null,
      schemaVersion: Math.max(1, Number(data?.schema_version) || 1)
    }
  } catch (error) {
    console.info('Preference loading fell back to the default theme.', error?.message || error)
    return defaultPreferences()
  }
}

function defaultPreferences() {
  const firstPaintTheme = getFirstPaintTheme()
  return {
    themeKey: applyThemePreference(firstPaintTheme),
    timeZone: 'UTC',
    timeZoneConfirmedAt: null,
    schemaVersion: 1
  }
}

function cacheFirstPaintTheme(themeKey) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(FIRST_PAINT_THEME_STORAGE_KEY, themeKey)
  } catch (error) {
    // Storage can be unavailable in private or constrained browser contexts.
  }
}
