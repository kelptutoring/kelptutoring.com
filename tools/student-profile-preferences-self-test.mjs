import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_THEME_KEY,
  formatJoinedDuration,
  formatLocation,
  normalizeCountries,
  normalizeLocations,
  normalizeProfileConfiguration,
  normalizeRegions,
  normalizeThemeKey
} from '../src/app/profile/profile-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [
  baseMigration,
  catalogMigration,
  profileHtml,
  profileJs,
  preferencesHtml,
  preferencesJs,
  profileData,
  importer,
  themeBootstrap,
  theme,
  authGuard,
  studentDashboardHtml,
  signupHtml,
  signupJs,
  profileCss,
  styles,
  headerGuide
] = await Promise.all([
  readFile(resolve(projectRoot, 'supabase/migrations/202607200001_student_profile_preferences.sql'), 'utf8'),
  readFile(resolve(projectRoot, 'supabase/migrations/202607200002_profile_location_catalog.sql'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/profile/student-profile.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/profile/student-profile.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/profile/student-preferences.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/profile/student-preferences.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/profile/profile-data.js'), 'utf8'),
  readFile(resolve(projectRoot, 'tools/import-profile-location-catalog.mjs'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/theme-bootstrap.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/theme.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/auth-guard.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/dashboard/student-dashboard.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/signUp/signUp.html'), 'utf8'),
  readFile(resolve(projectRoot, 'src/auth/signUp.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/profile/profile.css'), 'utf8'),
  readFile(resolve(projectRoot, 'src/styles/style.css'), 'utf8'),
  readFile(resolve(projectRoot, 'KELP_PAGE_HEADER_STYLE.md'), 'utf8')
])
const migrations = `${baseMigration}\n${catalogMigration}`

assert.equal(normalizeThemeKey('CORAL'), 'coral')
assert.equal(normalizeThemeKey('arbitrary-css'), DEFAULT_THEME_KEY)
assert.equal(formatJoinedDuration(0), 'Joined this week')
assert.equal(formatJoinedDuration(1), 'Joined 1 week ago')
assert.equal(formatJoinedDuration(12), 'Joined 12 weeks ago')
assert.equal(formatLocation({ cityName: 'Sao Paulo', regionName: 'Sao Paulo', countryName: 'Brazil' }), 'Sao Paulo, Sao Paulo, Brazil')

const normalized = normalizeProfileConfiguration({
  version: 2,
  profile: {
    fullName: 'A Student',
    joinedWeeks: 4,
    location: { key: 'one', cityName: 'Sao Paulo', timeZone: 'America/Sao_Paulo' }
  },
  preferences: { themeKey: 'orchid', timeZone: 'America/Sao_Paulo', timeZoneSource: 'profile_location' },
  hobbies: [{ key: 'reading', name: 'Reading' }, { key: 'reading', name: 'Duplicate' }],
  learningGoals: [{ key: 'problem-solving', name: 'Build problem-solving skills' }]
})
assert.equal(normalized.version, 2)
assert.equal(normalized.profile.fullName, 'A Student')
assert.equal(normalized.profile.location.timeZone, 'America/Sao_Paulo')
assert.equal(normalized.preferences.timeZoneSource, 'profile_location')
assert.equal(normalized.preferences.themeKey, 'orchid')
assert.equal(normalized.hobbies.length, 1)
assert.equal(normalized.learningGoals.length, 1)
assert.equal(normalized.learningSummary.completedClasses, null)

assert.deepEqual(normalizeCountries([
  { code: 'US', name: 'United States' },
  { code: 'BR', name: 'Brazil' }
]).map(({ code }) => code), ['BR', 'US'])
assert.equal(normalizeRegions([{ code: 'SP', name: 'Sao Paulo', type: 'state' }])[0].type, 'state')
assert.equal(normalizeLocations([{
  key: 'one', countryCode: 'BR', countryName: 'Brazil', regionCode: 'SP',
  regionName: 'Sao Paulo', cityName: 'Sao Paulo', timeZone: 'America/Sao_Paulo'
}])[0].key, 'one')

for (const table of [
  'profile_locations',
  'profile_countries',
  'profile_regions',
  'profile_location_catalog_imports',
  'profile_theme_presets',
  'profile_option_definitions',
  'user_preferences',
  'user_profile_option_selections',
  'profile_change_events'
]) {
  assert.match(migrations, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migrations, new RegExp(`alter table public\\.${table} enable row level security`))
}
assert.match(baseMigration, /revoke update on public\.profiles from authenticated/)
assert.match(catalogMigration, /location\.time_zone[\s\S]*into accepted_location_key, accepted_time_zone/)
assert.match(catalogMigration, /Timezone is derived from the Profile country, state, and city/)
assert.match(catalogMigration, /timeZoneSource'[\s\S]*profile_location/)
assert.match(catalogMigration, /changed_fields := array_append\(changed_fields, 'time_zone'\)/)
assert.doesNotMatch(catalogMigration, /requested_time_zone text := nullif\(btrim\(coalesce\(new\.raw_user_meta_data/)
assert.doesNotMatch(migrations, /street_address|address_line/i)

assert.match(profileHtml, /src="\.\/student-profile\.js"/)
assert.match(profileHtml, /id="profile-country"/)
assert.match(profileHtml, /id="profile-time-zone"/)
assert.match(profileHtml, />Themes<\/a>/)
assert.match(profileHtml, /class="profile-privacy-helper"/)
assert.match(profileHtml, /Your Profile is never public/)
assert.ok(profileHtml.indexOf('/src/auth/theme-bootstrap.js') < profileHtml.indexOf('../../styles/style.css'))
assert.match(profileJs, /requireAuth\(\['student'\]\)/)
assert.match(profileJs, /listProfileCountries/)
assert.match(profileJs, /listProfileRegions/)
assert.match(profileJs, /listProfileCities/)
assert.match(profileJs, /profile\.location\?\.timeZone/)
assert.doesNotMatch(profileJs, /listProfileLocations|groupLocations/)
assert.doesNotMatch(profileJs, /\.innerHTML\s*=/)

assert.match(preferencesHtml, /id="theme-grid"/)
assert.match(preferencesHtml, /Student Themes - Kelp/)
assert.doesNotMatch(preferencesHtml, /preferences-theme-actions|id="reset-theme"|id="save-preferences"/)
assert.match(preferencesHtml, /Each selection is saved immediately/)
assert.doesNotMatch(preferencesHtml, /preferences-save-bar/)
assert.ok(preferencesHtml.indexOf('/src/auth/theme-bootstrap.js') < preferencesHtml.indexOf('../../styles/style.css'))
assert.doesNotMatch(preferencesHtml, /id="preference-time-zone"|id="reset-all-preferences"/)
assert.match(preferencesJs, /input\.addEventListener\('change'/)
assert.match(preferencesJs, /saveMyPreferences\(\{ themeKey \}\)/)
assert.match(preferencesJs, /applyThemePreference\(state\.pendingThemeKey\)/)
assert.match(preferencesJs, /setTimeout\(\(\) => showMessage\(''\), 2000\)/)
assert.doesNotMatch(preferencesJs, /resetMyPreferences|setButtonsDisabled/)
assert.doesNotMatch(preferencesJs, /timeZone|localStorage|sessionStorage/)

for (const rpc of [
  'list_profile_countries',
  'list_profile_regions',
  'list_profile_cities',
  'list_profile_configuration_options',
  'get_my_profile_configuration',
  'save_my_student_profile',
  'save_my_preferences',
  'reset_my_preferences'
]) assert.match(profileData, new RegExp(rpc))

assert.match(importer, /315d33084e8bdd84948c9991840209fe4bcadc023912b5aac5428e28a0a2fb7b/)
assert.match(importer, /--apply-local/)
assert.match(importer, /--confirm-local=/)
assert.match(importer, /Refusing non-local Supabase API/)
assert.match(importer, /SUPABASE_TELEMETRY_DISABLED: '1'/)
assert.doesNotMatch(importer, /console\.log\([^\n]*(serviceRoleKey|SECRET_KEY)/)

assert.match(theme, /from\('user_preferences'\)/)
assert.match(theme, /document\.documentElement\.dataset\.kelpTheme/)
assert.match(theme, /FIRST_PAINT_THEME_STORAGE_KEY/)
assert.match(theme, /localStorage\.setItem/)
assert.match(themeBootstrap, /kelp:first-paint-theme:v1/)
assert.match(themeBootstrap, /allowedThemes/)
assert.doesNotMatch(themeBootstrap, /supabase|access_token|refresh_token/i)
assert.match(authGuard, /getMyThemePreference\(supabase, user\.id\)/)
assert.match(studentDashboardHtml, /data-kelp-theme="ocean"/)
assert.ok(studentDashboardHtml.indexOf('/src/auth/theme-bootstrap.js') < studentDashboardHtml.indexOf('../../styles/style.css'))

for (const id of ['country', 'region', 'city']) {
  assert.match(signupHtml, new RegExp(`id="${id}"`))
}
assert.doesNotMatch(signupHtml, /id="timeZone"|timezone-help/)
assert.match(signupHtml, /not your street address/i)
assert.match(signupJs, /location_key: locationKey/)
assert.match(signupJs, /listProfileCountries/)
assert.match(signupJs, /listProfileRegions/)
assert.match(signupJs, /listProfileCities/)
assert.doesNotMatch(signupJs, /time_zone:|getDetectedTimeZone|listProfileLocations/)

assert.match(styles, /:root\[data-kelp-theme="coral"\]/)
assert.match(styles, /--kelp-page-background/)
assert.match(styles, /html\[data-kelp-theme\][\s\S]*--color-primary: var\(--kelp-theme-accent\)/)
assert.match(profileCss, /@media \(max-width: 620px\)/)
assert.match(profileCss, /input:focus-visible/)
assert.match(profileCss, /\.sr-only/)
assert.match(profileCss, /\.profile-topbar[\s\S]*position: relative/)
assert.doesNotMatch(profileCss, /\.profile-topbar[\s\S]{0,500}position: fixed/)
assert.doesNotMatch(profileCss, /\.preferences-save-bar[\s\S]{0,500}position: sticky/)
assert.match(profileCss, /\.profile-field[\s\S]*grid-template-rows/)
assert.match(profileCss, /\.profile-privacy-popover/)
assert.match(profileCss, /\.profile-feedback\s*\{[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*0[\s\S]*?left:\s*6px/)
assert.match(headerGuide, /## Layout contract/)
assert.match(headerGuide, /## Adoption checklist/)
assert.match(headerGuide, /normal document flow/)
assert.match(headerGuide, /Do not use `fixed` or `sticky`/)
assert.match(headerGuide, /390-pixel horizontal overflow/)

console.log('Student Profile, hierarchical location catalog, derived timezone, and synchronized theme contract self-test passed.')
