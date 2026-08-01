import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expectedProjectId = 'kelptutoring.com-main'
const expectedHostedProjectRef = 'vzbgijnwmavmdahybcxw'
const expectedHostedApiUrl = `https://${expectedHostedProjectRef}.supabase.co`
const provider = 'countries-states-cities'
const defaultSource = 'data/location-catalog/v3.1-export.2/json-countries+states+cities.json.gz'
const defaultRevision = 'v3.1-export.2'
const defaultSha256 = '315d33084e8bdd84948c9991840209fe4bcadc023912b5aac5428e28a0a2fb7b'
const STARTER_LOCATION_KEYS = new Map([
  ['BR:SP:sao-paulo', 'kelp:br:sp:sao-paulo'],
  ['BR:RJ:rio-de-janeiro', 'kelp:br:rj:rio-de-janeiro'],
  ['BR:MG:belo-horizonte', 'kelp:br:mg:belo-horizonte'],
  ['AR:C:buenos-aires', 'kelp:ar:c:buenos-aires'],
  ['CA:ON:toronto', 'kelp:ca:on:toronto'],
  ['MX:CMX:mexico-city', 'kelp:mx:cmx:mexico-city'],
  ['US:CA:los-angeles', 'kelp:us:ca:los-angeles'],
  ['US:CA:san-francisco', 'kelp:us:ca:san-francisco'],
  ['US:NY:new-york-city', 'kelp:us:ny:new-york'],
  ['US:TX:austin', 'kelp:us:tx:austin'],
  ['GB:ENG:london', 'kelp:gb:eng:london'],
  ['PT:11:lisbon', 'kelp:pt:11:lisbon'],
  ['ES:MD:madrid', 'kelp:es:md:madrid'],
  ['FR:IDF:paris', 'kelp:fr:idf:paris'],
  ['DE:BE:berlin', 'kelp:de:be:berlin'],
  ['IN:DL:new-delhi', 'kelp:in:dl:new-delhi'],
  ['JP:13:tokyo', 'kelp:jp:13:tokyo'],
  ['AU:NSW:sydney', 'kelp:au:nsw:sydney']
])
const STARTER_CITY_ID_KEYS = new Map([
  ['50388', 'kelp:gb:eng:london'],
  ['35186', 'kelp:es:md:madrid']
])
const RETAINED_STARTER_LOCATION_KEYS = new Set([
  'kelp:ar:c:buenos-aires'
])
const timeZoneValidationCache = new Map()
const args = parseArgs(process.argv.slice(2))
const sourcePath = resolve(projectRoot, args.source || defaultSource)
const sourceRevision = args.sourceRevision || defaultRevision
const expectedSha256 = String(args.sha256 || defaultSha256).toLowerCase()

const selectedModes = [args.dryRun, args.applyLocal, args.applyHosted].filter(Boolean).length
if (selectedModes !== 1) {
  throw new Error('Choose exactly one of --dry-run, --apply-local, or --apply-hosted. No catalog writes are implicit.')
}
if (args.applyLocal && args.confirmLocal !== expectedProjectId) {
  throw new Error(`Refusing a catalog import without --confirm-local=${expectedProjectId}.`)
}
if (args.applyHosted && args.confirmHosted !== expectedHostedProjectRef) {
  throw new Error(`Refusing a hosted catalog import without --confirm-hosted=${expectedHostedProjectRef}.`)
}

const compressed = await readFile(sourcePath)
const sourceSha256 = createHash('sha256').update(compressed).digest('hex')
if (sourceSha256 !== expectedSha256) {
  throw new Error(`Catalog SHA-256 mismatch. Expected ${expectedSha256}; received ${sourceSha256}.`)
}

const source = JSON.parse(gunzipSync(compressed).toString('utf8'))
const catalog = buildCatalog(source)
console.log(
  `Validated ${catalog.countries.length} countries, ${catalog.regions.length} regions, ` +
  `${catalog.locations.length} cities (${catalog.legacyKeyMatches} stable Kelp location keys).`
)
console.log(`Source ${sourceRevision}; SHA-256 ${sourceSha256}.`)

if (args.dryRun) {
  console.log('Dry run complete. No database records were changed.')
} else {
  const context = args.applyLocal
    ? await localSupabaseContext()
    : hostedSupabaseContext()
  await requireCatalogSchema(context)
  await upsertBatches(context, 'profile_countries', ['country_code'], catalog.countries, 250)
  await upsertBatches(context, 'profile_regions', ['country_code', 'region_code'], catalog.regions, 500)
  await upsertBatches(context, 'profile_locations', ['location_key'], catalog.locations, 500)
  await deactivateStaleRows(context, 'profile_locations')
  await deactivateStaleRows(context, 'profile_regions')
  await deactivateStaleRows(context, 'profile_countries')
  await deactivateProviderRows(context, 'profile_regions', 'kelp')
  await recordImport(context, catalog, sourceSha256)
  await verifyImport(context, catalog)
  console.log(`${context.label} governed location catalog import completed and verified.`)
}

function buildCatalog(countries) {
  if (!Array.isArray(countries)) throw new Error('The catalog root must be an array of countries.')
  const countryRows = []
  const regionRows = []
  const locationRows = []
  const seenCountries = new Set()
  const seenRegions = new Set()
  const seenCities = new Set()
  let legacyKeyMatches = 0

  for (const [countryIndex, country] of countries.entries()) {
    const countryCode = String(country?.iso2 || '').trim().toUpperCase()
    const countryName = cleanName(country?.name)
    if (!/^[A-Z]{2}$/.test(countryCode) || !countryName) {
      throw new Error(`Invalid country at source index ${countryIndex}.`)
    }
    if (seenCountries.has(countryCode)) throw new Error(`Duplicate country code ${countryCode}.`)
    seenCountries.add(countryCode)
    countryRows.push({
      country_code: countryCode,
      country_name: countryName,
      provider,
      provider_reference: String(country.id),
      source_revision: sourceRevision,
      active: true,
      sort_order: 100
    })

    for (const [regionIndex, region] of (country.states || []).entries()) {
      const regionCode = String(region?.iso2 || '').trim()
      const regionName = cleanName(region?.name)
      const regionKey = `${countryCode}:${regionCode}`
      if (!regionCode || !regionName) {
        throw new Error(`Invalid region at ${countryCode}[${regionIndex}].`)
      }
      if (seenRegions.has(regionKey)) throw new Error(`Duplicate region key ${regionKey}.`)
      seenRegions.add(regionKey)
      regionRows.push({
        country_code: countryCode,
        region_code: regionCode,
        region_name: regionName,
        region_type: cleanName(region.type),
        provider,
        provider_reference: String(region.id),
        source_revision: sourceRevision,
        active: true,
        sort_order: 100
      })

      for (const [cityIndex, city] of (region.cities || []).entries()) {
        const cityId = String(city?.id || '').trim()
        const cityName = cleanName(city?.name)
        const timeZone = String(city?.timezone || '').trim()
        if (!cityId || !cityName || !isTimeZone(timeZone)) {
          throw new Error(`Invalid city at ${regionKey}[${cityIndex}].`)
        }
        if (seenCities.has(cityId)) throw new Error(`Duplicate city provider reference ${cityId}.`)
        seenCities.add(cityId)
        const legacyKey = STARTER_LOCATION_KEYS.get(placeKey(countryCode, regionCode, cityName)) ||
          STARTER_CITY_ID_KEYS.get(cityId)
        if (legacyKey) legacyKeyMatches += 1
        locationRows.push({
          location_key: legacyKey || `csc:${cityId}`,
          country_code: countryCode,
          country_name: countryName,
          region_code: regionCode,
          region_name: regionName,
          city_name: cityName,
          time_zone: timeZone,
          provider,
          provider_reference: cityId,
          source_revision: sourceRevision,
          active: true,
          sort_order: 100
        })
      }
    }
  }

  const expectedLegacyMatches = STARTER_LOCATION_KEYS.size - RETAINED_STARTER_LOCATION_KEYS.size
  if (legacyKeyMatches !== expectedLegacyMatches) {
    throw new Error(
      `Expected ${expectedLegacyMatches} starter locations in the source; matched ${legacyKeyMatches}.`
    )
  }
  return { countries: countryRows, regions: regionRows, locations: locationRows, legacyKeyMatches }
}

async function localSupabaseContext() {
  const config = await readFile(resolve(projectRoot, 'supabase/config.toml'), 'utf8')
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
  if (projectId !== expectedProjectId) {
    throw new Error(`Refusing project ${projectId || '(missing)'}; expected ${expectedProjectId}.`)
  }

  const env = {
    ...process.env,
    SUPABASE_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1'
  }
  const command = process.platform === 'win32' ? 'cmd.exe' : 'supabase'
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'supabase.cmd', 'status', '-o', 'env']
    : ['status', '-o', 'env']
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true
  })
  if (result.error) throw new Error(`Could not inspect local Supabase: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error('Local Supabase is unavailable. Start Docker/Supabase and run the import again.')
  }
  const status = parseEnvironmentOutput(result.stdout)
  const apiUrl = status.API_URL || status.SUPABASE_URL
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  const url = new URL(apiUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54321') {
    throw new Error(`Refusing non-local Supabase API: ${url.origin}.`)
  }
  if (!serviceRoleKey) throw new Error('Local Supabase did not expose a service-role key.')
  return { apiUrl: url.origin, serviceRoleKey, label: 'Local' }
}

function hostedSupabaseContext() {
  const serviceRoleKey = String(process.env.KELP_SUPABASE_SECRET_KEY || '').trim()
  if (!serviceRoleKey) {
    throw new Error(
      'Set KELP_SUPABASE_SECRET_KEY to the hosted project secret/service-role key for this one import. ' +
      'Never place that key in frontend files.'
    )
  }
  const apiUrl = String(process.env.KELP_SUPABASE_URL || expectedHostedApiUrl).trim().replace(/\/$/, '')
  if (apiUrl !== expectedHostedApiUrl) {
    throw new Error(`Refusing hosted Supabase API ${apiUrl}; expected ${expectedHostedApiUrl}.`)
  }
  return { apiUrl, serviceRoleKey, label: 'Hosted' }
}

async function requireCatalogSchema(context) {
  const response = await fetch(`${context.apiUrl}/rest/v1/rpc/list_profile_countries`, {
    method: 'POST',
    headers: adminHeaders(context.serviceRoleKey),
    body: '{}'
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(
      `Phase 1.A catalog preflight failed (${response.status}). ` +
      `Apply pending local migrations, then retry. REST detail: ${detail}`
    )
  }
}

async function upsertBatches(context, table, conflictColumns, rows, batchSize) {
  const totalBatches = Math.ceil(rows.length / batchSize)
  for (let start = 0, batchNumber = 1; start < rows.length; start += batchSize, batchNumber += 1) {
    const url = new URL(`${context.apiUrl}/rest/v1/${table}`)
    url.searchParams.set('on_conflict', conflictColumns.join(','))
    await fetchExpected(url, {
      method: 'POST',
      headers: {
        ...adminHeaders(context.serviceRoleKey),
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows.slice(start, start + batchSize))
    }, [200, 201, 204])
    if (batchNumber === 1 || batchNumber === totalBatches || batchNumber % 25 === 0) {
      console.log(`${table}: imported batch ${batchNumber}/${totalBatches}.`)
    }
  }
}

async function deactivateStaleRows(context, table) {
  const url = new URL(`${context.apiUrl}/rest/v1/${table}`)
  url.searchParams.set('provider', `eq.${provider}`)
  url.searchParams.set('source_revision', `neq.${sourceRevision}`)
  await fetchExpected(url, {
    method: 'PATCH',
    headers: { ...adminHeaders(context.serviceRoleKey), Prefer: 'return=minimal' },
    body: JSON.stringify({ active: false })
  }, [200, 204])
}

async function deactivateProviderRows(context, table, providerName) {
  const url = new URL(`${context.apiUrl}/rest/v1/${table}`)
  url.searchParams.set('provider', `eq.${providerName}`)
  await fetchExpected(url, {
    method: 'PATCH',
    headers: { ...adminHeaders(context.serviceRoleKey), Prefer: 'return=minimal' },
    body: JSON.stringify({ active: false })
  }, [200, 204])
}

async function recordImport(context, catalog, sourceSha256) {
  await fetchExpected(`${context.apiUrl}/rest/v1/profile_location_catalog_imports`, {
    method: 'POST',
    headers: { ...adminHeaders(context.serviceRoleKey), Prefer: 'return=minimal' },
    body: JSON.stringify({
      provider,
      source_revision: sourceRevision,
      source_sha256: sourceSha256,
      country_count: catalog.countries.length,
      region_count: catalog.regions.length,
      city_count: catalog.locations.length,
      metadata: { format: 'json-countries+states+cities.json.gz' }
    })
  }, [200, 201, 204])
}

async function verifyImport(context, catalog) {
  for (const [table, expected] of [
    ['profile_countries', catalog.countries.length],
    ['profile_regions', catalog.regions.length],
    ['profile_locations', catalog.locations.length]
  ]) {
    const url = new URL(`${context.apiUrl}/rest/v1/${table}`)
    url.searchParams.set('provider', `eq.${provider}`)
    url.searchParams.set('active', 'eq.true')
    url.searchParams.set('select', table === 'profile_locations' ? 'location_key' : '*')
    const response = await fetchExpected(url, {
      method: 'HEAD',
      headers: { ...adminHeaders(context.serviceRoleKey), Prefer: 'count=exact' }
    }, [200, 206])
    const actual = Number(response.headers.get('content-range')?.split('/')?.[1])
    if (actual !== expected) throw new Error(`${table} verification expected ${expected}; received ${actual}.`)
  }

  const cityUrl = new URL(`${context.apiUrl}/rest/v1/profile_locations`)
  cityUrl.searchParams.set('location_key', 'eq.kelp:br:sp:sao-paulo')
  cityUrl.searchParams.set('select', 'location_key,time_zone')
  const response = await fetchExpected(cityUrl, {
    headers: adminHeaders(context.serviceRoleKey)
  }, [200])
  const rows = await response.json()
  if (rows?.[0]?.time_zone !== 'America/Sao_Paulo') {
    throw new Error('Stable Sao Paulo location/timezone verification failed.')
  }
}

async function fetchExpected(url, options, expectedStatuses) {
  const response = await fetch(url, options)
  if (!expectedStatuses.includes(response.status)) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`Catalog request failed (${response.status}): ${detail}`)
  }
  return response
}

function adminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  }
}

function parseEnvironmentOutput(output) {
  const values = {}
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

function parseArgs(values) {
  const parsed = {}
  for (const value of values) {
    if (value === '--dry-run') parsed.dryRun = true
    else if (value === '--apply-local') parsed.applyLocal = true
    else if (value === '--apply-hosted') parsed.applyHosted = true
    else if (value.startsWith('--source=')) parsed.source = value.slice('--source='.length)
    else if (value.startsWith('--source-revision=')) parsed.sourceRevision = value.slice('--source-revision='.length)
    else if (value.startsWith('--sha256=')) parsed.sha256 = value.slice('--sha256='.length)
    else if (value.startsWith('--confirm-local=')) parsed.confirmLocal = value.slice('--confirm-local='.length)
    else if (value.startsWith('--confirm-hosted=')) parsed.confirmHosted = value.slice('--confirm-hosted='.length)
    else throw new Error(`Unknown argument: ${value}`)
  }
  return parsed
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function isTimeZone(value) {
  if (timeZoneValidationCache.has(value)) return timeZoneValidationCache.get(value)
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0)
    timeZoneValidationCache.set(value, true)
    return true
  } catch {
    timeZoneValidationCache.set(value, false)
    return false
  }
}

function placeKey(countryCode, regionCode, cityName) {
  return `${countryCode}:${regionCode}:${normalizeForMatch(cityName)}`
}

function normalizeForMatch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
