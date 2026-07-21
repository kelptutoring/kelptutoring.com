import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expectedConfirmation = '--confirm-local=kelptutoring.com-main'
if (!process.argv.includes(expectedConfirmation)) {
  throw new Error(`Refusing to create disposable local actors. Pass ${expectedConfirmation}.`)
}

const apiUrl = 'http://127.0.0.1:54321'
const clientSource = await readFile(resolve(projectRoot, 'src/lib/supabase/supabaseClient.js'), 'utf8')
const localBlock = clientSource.match(/const localSupabase\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const publishableKey = localBlock.match(/key:\s*'([^']+)'/)?.[1] || ''
assert.ok(publishableKey.startsWith('sb_publishable_'), 'The committed local publishable key is missing.')

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Kelp-${crypto.randomUUID()}-Aa1!`

const first = await createStudent(`phase1-${runId}@local.test`, password, 'Phase 1 Student')
const second = await createStudent(`phase1-outsider-${runId}@local.test`, password, 'Phase 1 Outsider')

const countries = await rpc('list_profile_countries', {}, null)
assert.ok(Array.isArray(countries) && countries.length >= 10)
const regions = await rpc('list_profile_regions', { p_country_code: 'BR' }, null)
assert.ok(regions.some(({ code }) => code === 'SP'))
const cities = await rpc('list_profile_cities', { p_country_code: 'BR', p_region_code: 'SP' }, null)
assert.ok(cities.some(({ key }) => key === 'kelp:br:sp:sao-paulo'))

const initial = await rpc('get_my_profile_configuration', {}, first.accessToken)
assert.equal(initial.profile.id, first.userId)
assert.equal(initial.profile.location.key, 'kelp:br:sp:sao-paulo')
assert.equal(initial.profile.location.timeZone, 'America/Sao_Paulo')
assert.equal(initial.preferences.timeZone, 'America/Sao_Paulo')
assert.equal(initial.preferences.timeZoneSource, 'profile_location')
assert.equal(initial.preferences.themeKey, 'ocean')

const savedProfile = await rpc('save_my_student_profile', {
  p_profile: {
    fullName: 'Phase 1 Student Updated',
    birthDate: '2001-02-03',
    locationKey: 'kelp:us:ca:san-francisco'
  },
  p_hobby_keys: ['reading', 'coding-technology'],
  p_learning_goal_keys: ['problem-solving', 'strengthen-foundations']
}, first.accessToken)
assert.equal(savedProfile.profile.fullName, 'Phase 1 Student Updated')
assert.equal(savedProfile.profile.location.key, 'kelp:us:ca:san-francisco')
assert.equal(savedProfile.profile.location.timeZone, 'America/Los_Angeles')
assert.equal(savedProfile.preferences.timeZone, 'America/Los_Angeles')
assert.deepEqual(savedProfile.hobbies.map(({ key }) => key).sort(), ['coding-technology', 'reading'])

const savedPreferences = await rpc('save_my_preferences', {
  p_preferences: { themeKey: 'coral' }
}, first.accessToken)
assert.equal(savedPreferences.preferences.themeKey, 'coral')
assert.equal(savedPreferences.preferences.timeZone, 'America/Los_Angeles')

await expectRpcFailure('save_my_preferences', {
  p_preferences: { themeKey: 'coral', timeZone: 'America/New_York' }
}, first.accessToken, /Timezone is derived from the Profile country, state, and city/)

await expectRpcFailure('save_my_student_profile', {
  p_profile: {
    fullName: 'Phase 1 Student Updated',
    birthDate: '2001-02-04',
    locationKey: 'kelp:us:ca:san-francisco'
  },
  p_hobby_keys: ['reading'],
  p_learning_goal_keys: ['problem-solving']
}, first.accessToken, /Birth date corrections require Support review/)

await expectRpcFailure('save_my_student_profile', {
  p_profile: {
    fullName: 'Phase 1 Student Updated',
    birthDate: '2001-02-03',
    locationKey: 'browser-authored-place'
  },
  p_hobby_keys: ['reading'],
  p_learning_goal_keys: ['problem-solving']
}, first.accessToken, /Choose an available country, state, and city/)

await expectRpcFailure('save_my_preferences', {
  p_preferences: { themeKey: 'arbitrary-css' }
}, first.accessToken, /Choose an available theme/)

const crossRead = await requestJson(
  `${apiUrl}/rest/v1/user_preferences?user_id=eq.${first.userId}&select=user_id,theme_key`,
  { headers: authenticatedHeaders(second.accessToken) },
  [200]
)
assert.deepEqual(crossRead.body, [])

const directUpdate = await requestJson(
  `${apiUrl}/rest/v1/user_preferences?user_id=eq.${first.userId}`,
  {
    method: 'PATCH',
    headers: { ...authenticatedHeaders(first.accessToken), Prefer: 'return=representation' },
    body: JSON.stringify({ theme_key: 'slate' })
  },
  [401, 403]
)
assert.ok([401, 403].includes(directUpdate.status))

const outsiderOwnProfile = await rpc('get_my_profile_configuration', {}, second.accessToken)
assert.equal(outsiderOwnProfile.profile.id, second.userId)
assert.notEqual(outsiderOwnProfile.profile.id, first.userId)

const reset = await rpc('reset_my_preferences', { p_scope: 'theme' }, first.accessToken)
assert.equal(reset.preferences.themeKey, 'ocean')
assert.equal(reset.preferences.timeZone, 'America/Los_Angeles')

console.log('Live local Student Profile/RLS characterization passed with two disposable synthetic actors.')

async function createStudent(email, accountPassword, fullName) {
  const response = await requestJson(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: accountPassword,
      data: {
        full_name: fullName,
        birth_date: '2001-02-03',
        location_key: 'kelp:br:sp:sao-paulo'
      }
    })
  }, [200])
  const accessToken = response.body?.access_token
  const userId = response.body?.user?.id
  assert.ok(accessToken && userId, 'Local signup did not return an authenticated synthetic actor.')
  return { accessToken, userId }
}

async function rpc(name, body, accessToken) {
  const response = await requestJson(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: accessToken
      ? authenticatedHeaders(accessToken)
      : { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, [200])
  return response.body
}

async function expectRpcFailure(name, body, accessToken, messagePattern) {
  const response = await requestJson(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: authenticatedHeaders(accessToken),
    body: JSON.stringify(body)
  }, [400])
  assert.match(String(response.body?.message || response.body), messagePattern)
}

function authenticatedHeaders(accessToken) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
}

async function requestJson(url, options, expectedStatuses) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = null
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`Local request failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }
  return { status: response.status, body }
}
