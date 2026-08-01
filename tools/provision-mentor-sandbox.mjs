import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { delimiter, dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createBuilderCoursePublication } from '../src/app/schedule-generator/course-schedule-adapter.js'
import '../src/data/tracks-data.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const actorMapPath = resolve(projectRoot, 'tests/acceptance/fixtures/local-supabase-actor-map-v1.json')
const expectedProjectId = 'kelptutoring.com-main'
const expectedApiPort = '54321'
const expectedDbPort = '54322'
const passwordVariable = 'KELP_LOCAL_ACCEPTANCE_PASSWORD'

const curriculum = Object.freeze({
  mathematics: '10000000-0000-4000-8000-000000000012',
  algebraOne: '10000000-0000-4000-8000-000000000022',
  physics: '10000000-0000-4000-8000-000000000013',
  mechanics: '10000000-0000-4000-8000-000000000032'
})

const sandboxActors = Object.freeze({
  saoPauloTutor: {
    id: '91000000-0000-4000-8000-000000000001',
    email: 'sandbox-tutor-sao-paulo@kelp.local.test',
    fullName: 'Marina Costa',
    alias: 'INTERACTIVE-TUTOR-SAO-PAULO'
  },
  londonTutor: {
    id: '91000000-0000-4000-8000-000000000002',
    email: 'sandbox-tutor-london@kelp.local.test',
    fullName: 'Oliver Bennett',
    alias: 'INTERACTIVE-TUTOR-LONDON'
  },
  student: {
    id: '91000000-0000-4000-8000-000000000003',
    email: 'sandbox-student-mechanics@kelp.local.test',
    fullName: 'Camila Santos',
    alias: 'INTERACTIVE-STUDENT-MECHANICS'
  }
})

const algebraAssignmentId = '92000000-0000-4000-8000-000000000001'

function usage() {
  console.log(`Usage:
  node tools/provision-mentor-sandbox.mjs \\
    --confirm-project=${expectedProjectId} \\
    --mentor-email=<existing local account> \\
    --student-email=<existing Aldebara local account> \\
    [--diagnose-only]

This command mutates only the confirmed disposable local Supabase stack. It
preserves existing roles and profile data, and it never changes the nine
deterministic acceptance actors. With --diagnose-only it performs read-only
Course/Schedule inspection and does not require the acceptance password.`)
}

function argumentValue(name) {
  const prefix = `--${name}=`
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : ''
}

function requiredEmail(name) {
  const value = argumentValue(name).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`Pass a valid --${name}=... value.`)
  }
  return value
}

function requireConfirmation() {
  if (argumentValue('confirm-project') !== expectedProjectId) {
    throw new Error(`Refusing to mutate Supabase. Pass --confirm-project=${expectedProjectId} after checking the disposable local target.`)
  }
}

function toolEnvironment() {
  const env = {
    ...process.env,
    DO_NOT_TRACK: '1',
    SUPABASE_TELEMETRY_DISABLED: 'true'
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path'
  const entries = [resolve(projectRoot, 'node_modules', '.bin')]
  if (process.platform === 'win32') {
    const dockerPath = 'C:\\Program Files\\Docker\\Docker\\resources\\bin'
    if (existsSync(dockerPath)) entries.unshift(dockerPath)
  }
  env[pathKey] = `${entries.join(delimiter)}${delimiter}${env[pathKey] || ''}`
  return env
}

function runProcess(command, args, { input = null } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: toolEnvironment(),
      shell: false,
      stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else rejectPromise(new Error(`${command} exited with code ${code}.\n${stderr || stdout}`))
    })
    if (input !== null) child.stdin.end(input)
  })
}

function runSupabase(args) {
  if (process.platform === 'win32') {
    return runProcess('cmd.exe', ['/d', '/s', '/c', 'supabase.cmd', ...args])
  }
  return runProcess('supabase', args)
}

function parseEnvironmentOutput(output) {
  const values = {}
  for (const line of output.split(/\r?\n/)) {
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

function assertLoopbackUrl(value, expectedPort, label) {
  let url
  try { url = new URL(value) } catch { throw new Error(`${label} is missing or invalid.`) }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== expectedPort) {
    throw new Error(`Refusing non-local ${label}: ${url.origin}`)
  }
}

async function preflight() {
  const config = await readFile(resolve(projectRoot, 'supabase/config.toml'), 'utf8')
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
  if (projectId !== expectedProjectId) throw new Error(`Refusing project ${projectId || '(missing)'}; expected ${expectedProjectId}.`)

  const { stdout } = await runSupabase(['status', '-o', 'env'])
  const status = parseEnvironmentOutput(stdout)
  const apiUrl = status.API_URL || status.SUPABASE_URL
  const dbUrl = status.DB_URL
  assertLoopbackUrl(apiUrl, expectedApiPort, 'API URL')
  assertLoopbackUrl(dbUrl, expectedDbPort, 'database URL')
  const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  if (!anonKey || !serviceRoleKey) throw new Error('Local Supabase did not expose its anonymous and service-role keys.')
  return { projectId, apiUrl, anonKey, serviceRoleKey }
}

async function fetchJson(url, options, expectedStatuses = [200]) {
  const response = await fetch(url, options)
  const bodyText = await response.text()
  let body = null
  if (bodyText) {
    try { body = JSON.parse(bodyText) } catch { body = bodyText }
  }
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`Local Supabase request failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }
  return { status: response.status, body }
}

function adminHeaders(context, extra = {}) {
  return {
    apikey: context.serviceRoleKey,
    Authorization: `Bearer ${context.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
  }
}

async function rest(context, table, { query = {}, method = 'GET', body = null, prefer = '' } = {}) {
  const url = new URL(`${context.apiUrl}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  const headers = adminHeaders(context, prefer ? { Prefer: prefer } : {})
  const options = { method, headers }
  if (body !== null) options.body = JSON.stringify(body)
  const expected = method === 'GET' ? [200] : [200, 201, 204]
  return (await fetchJson(url, options, expected)).body
}

async function callRpc(context, name, payload, token) {
  return (await fetchJson(`${context.apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })).body
}

async function signIn(context, email, password) {
  const { body } = await fetchJson(`${context.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: context.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!body?.access_token) throw new Error(`Local sign-in did not return a token for ${email}.`)
  return body.access_token
}

async function listAuthUsers(context) {
  const users = []
  const perPage = 1000
  for (let page = 1; page <= 20; page += 1) {
    const url = new URL(`${context.apiUrl}/auth/v1/admin/users`)
    url.searchParams.set('page', page)
    url.searchParams.set('per_page', perPage)
    const { body } = await fetchJson(url, { headers: adminHeaders(context) })
    const pageUsers = Array.isArray(body?.users) ? body.users : []
    users.push(...pageUsers)
    if (pageUsers.length < perPage) break
  }
  return users
}

async function requireExistingUser(context, email, reservedIds) {
  const user = (await listAuthUsers(context)).find((candidate) => candidate.email?.toLowerCase() === email)
  if (!user) throw new Error(`No local account exists for ${email}. Sign up in the disposable local app first, then rerun this command.`)
  if (reservedIds.has(user.id)) throw new Error(`${email} resolves to a deterministic acceptance actor and cannot be repurposed.`)
  const profiles = await rest(context, 'profiles', { query: { select: 'id,full_name', id: `eq.${user.id}`, limit: '1' } })
  if (!profiles?.length) throw new Error(`${email} has no local Kelp profile row.`)
  return { id: user.id, email, fullName: profiles[0].full_name || email }
}

async function findLocation(context, { countryCode, cityNames, timeZone }) {
  for (const cityName of cityNames) {
    const rows = await rest(context, 'profile_locations', {
      query: {
        select: 'location_key,country_code,region_code,city_name,time_zone',
        country_code: `eq.${countryCode}`,
        city_name: `eq.${cityName}`,
        time_zone: `eq.${timeZone}`,
        active: 'eq.true',
        limit: '1'
      }
    })
    if (rows?.length) return rows[0]
  }
  throw new Error(`The governed location catalog does not contain ${cityNames[0]} (${timeZone}). Import the Phase 1.A catalog first.`)
}

async function ensureSyntheticUser(context, actor, password, location) {
  const url = `${context.apiUrl}/auth/v1/admin/users/${actor.id}`
  const existing = await fetchJson(url, { headers: adminHeaders(context) }, [200, 404])
  const payload = {
    email: actor.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: actor.fullName,
      birth_date: '2000-01-01',
      location_key: location.location_key,
      interactive_sandbox_alias: actor.alias
    }
  }
  if (existing.status === 404) {
    await fetchJson(`${context.apiUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders(context),
      body: JSON.stringify({ id: actor.id, ...payload })
    }, [200, 201])
  } else {
    if (existing.body?.email !== actor.email) throw new Error(`${actor.alias} UUID is already assigned to another local email.`)
    await fetchJson(url, { method: 'PUT', headers: adminHeaders(context), body: JSON.stringify(payload) })
  }

  return actor
}

async function roleState(context, userId) {
  return rest(context, 'user_roles', {
    query: { select: 'role_key,status,is_primary', user_id: `eq.${userId}`, order: 'role_key.asc' }
  })
}

async function ensureRole(context, adminToken, userId, role, { primary = false } = {}) {
  const roles = await roleState(context, userId)
  const assigned = roles.find((entry) => entry.role_key === role && entry.status === 'active')
  const currentPrimary = roles.find((entry) => entry.status === 'active' && entry.is_primary)?.role_key
  if (assigned && (!primary || currentPrimary === role)) return
  await callRpc(context, 'grant_user_role', {
    p_user_id: userId,
    p_role_key: role,
    p_reason: 'Interactive local Mentor workflow sandbox',
    p_make_primary: primary
  }, adminToken)
}

async function ensureQualification(context, adminToken, userId, curriculumNodeId, label) {
  const existing = await rest(context, 'teaching_qualifications', {
    query: {
      select: 'id',
      user_id: `eq.${userId}`,
      curriculum_node_id: `eq.${curriculumNodeId}`,
      status: 'eq.active',
      limit: '1'
    }
  })
  if (existing?.length) return
  await callRpc(context, 'grant_teaching_qualification', {
    p_user_id: userId,
    p_curriculum_node_id: curriculumNodeId,
    p_reason: `Interactive local ${label} qualification`
  }, adminToken)
}

async function ensureAllActiveSubjectQualifications(context, adminToken, userId, label) {
  const subjects = await rest(context, 'curriculum_nodes', {
    query: {
      select: 'id,name',
      node_type: 'eq.subject',
      status: 'eq.active',
      order: 'name.asc'
    }
  })
  if (!subjects?.length) {
    throw new Error('The local curriculum has no active Subjects to qualify.')
  }
  for (const subject of subjects) {
    await ensureQualification(
      context,
      adminToken,
      userId,
      subject.id,
      `${label}: ${subject.name}`
    )
  }
  return subjects
}

async function ensureSupervision(context, adminToken, tutorId, mentorId) {
  const existing = await rest(context, 'mentor_tutor_assignments', {
    query: { select: 'id,mentor_id', tutor_id: `eq.${tutorId}`, status: 'eq.active', limit: '1' }
  })
  if (existing?.length) {
    if (existing[0].mentor_id !== mentorId) throw new Error('A sandbox Tutor is already supervised by another Mentor.')
    return
  }
  await callRpc(context, 'assign_tutor_supervisor', {
    p_tutor_id: tutorId,
    p_mentor_id: mentorId,
    p_reason: 'Interactive local Mentor workflow sandbox'
  }, adminToken)
}

function dateOnlyFromNow(offsetDays) {
  const value = new Date()
  value.setUTCHours(12, 0, 0, 0)
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return value.toISOString().slice(0, 10)
}

function nextWeekday(weekday, weekOffset = 0) {
  const value = new Date()
  value.setUTCHours(12, 0, 0, 0)
  let days = (weekday - value.getUTCDay() + 7) % 7
  if (days === 0) days = 7
  value.setUTCDate(value.getUTCDate() + days + weekOffset * 7)
  return value.toISOString().slice(0, 10)
}

function algebraTrackSource() {
  for (const level of globalThis.tracksCatalog?.levels || []) {
    const subject = level.subjects?.find((candidate) => candidate.taxonomySlug === 'mathematics')
    const track = subject?.tracks?.find((candidate) => candidate.taxonomySlug === 'algebra-1')
    if (!subject || !track) continue
    const sessions = track.modules
      .flatMap((module) => module.sessions.map((session) => ({
        ...session,
        moduleId: module.id,
        moduleTitle: module.title
      })))
      .slice(0, 4)
    if (sessions.length !== 4 || sessions.some((session) => !session.sourceContentVersionKey)) {
      throw new Error('The generated Algebra 1 Track does not contain four versioned Sessions.')
    }
    return { subject, track, sessions }
  }
  throw new Error('The generated Track catalogue does not contain Mathematics · Algebra 1.')
}

function stripTrackWeekPrefix(title) {
  return String(title || '').replace(/^Week\s+\d+\s*:\s*/i, '').trim()
}

function buildAlgebraTrackSchedule(timeZone) {
  const source = algebraTrackSource()
  return {
    id: 'interactive-algebra-track-schedule-v1',
    name: 'Algebra 1 Wednesday Track plan',
    timeZone,
    schemaVersion: 1,
    context: {
      subjectTaxonomySlug: source.subject.taxonomySlug,
      trackId: source.track.id,
      trackIds: [source.track.id],
      trackTaxonomySlugs: [source.track.taxonomySlug]
    },
    sessions: source.sessions.map((session, index) => ({
      id: `interactive_${session.id}`,
      title: stripTrackWeekPrefix(session.title),
      type: 'lesson',
      startDate: nextWeekday(3, index),
      endDate: nextWeekday(3, index),
      sourceSessionId: session.sourceSessionId,
      sourceContentVersionKey: session.sourceContentVersionKey,
      sourceTrackKey: source.track.id,
      sourceModuleKey: session.moduleId,
      sourceSubjectSlug: source.subject.taxonomySlug,
      sourceTrackSlug: source.track.taxonomySlug,
      trackId: source.track.id,
      moduleId: session.moduleId,
      moduleTitle: session.moduleTitle,
      planningHref: session.planningHref,
      difficulty: session.difficulty,
      resources: []
    }))
  }
}

function effectiveDateBounds(items) {
  const effective = items.filter((item) =>
    ['scheduled', 'requeued'].includes(item.state || item.item_state)
  )
  const starts = effective
    .map((item) => item.scheduledDate || item.scheduled_date)
    .filter(Boolean)
    .sort()
  const ends = effective
    .map((item) =>
      item.endDate || item.end_date || item.scheduledDate || item.scheduled_date
    )
    .filter(Boolean)
    .sort()
  return {
    firstDate: starts[0] || null,
    lastDate: ends.at(-1) || null,
    effectiveItemCount: effective.length
  }
}

function isCurrentBuilderTrackItem(item, trackSlug) {
  const snapshot = item.source_snapshot || {}
  return ['scheduled', 'requeued'].includes(item.item_state)
    && item.item_kind === 'curriculum_topic'
    && String(item.stable_item_key || '').startsWith('schedule_')
    && snapshot.sourceTrackSlug === trackSlug
    && Boolean(snapshot.sourceSessionId)
    && Boolean(snapshot.sourceContentVersionKey)
    && Boolean(snapshot.planningHref)
}

async function diagnoseAlgebraSchedule(context, aldebara) {
  const courses = await rest(context, 'student_courses', {
    query: {
      select: 'id,title,status,start_date,activated_start_date,scheduled_end_date,focus_node_id,active_schedule_version_id',
      student_id: `eq.${aldebara.id}`,
      idempotency_key: 'eq.interactive-mentor-algebra-v1',
      limit: '1'
    }
  })
  const course = courses?.[0]
  if (!course?.active_schedule_version_id) {
    console.log('No active interactive Algebra Course Schedule exists for the requested Student.')
    return
  }

  const versions = await rest(context, 'course_schedule_versions', {
    query: {
      select: 'id,version_number,name,time_zone,previous_version_id',
      id: `eq.${course.active_schedule_version_id}`,
      limit: '1'
    }
  })
  const version = versions?.[0]
  const rows = await rest(context, 'course_schedule_items', {
    query: {
      select: 'stable_item_key,title,item_kind,curriculum_node_id,scheduled_date,end_date,position,item_state,source_snapshot',
      version_id: `eq.${course.active_schedule_version_id}`,
      order: 'position.asc'
    }
  })
  const timeZone = await userTimeZone(context, aldebara.id, version?.time_zone || 'UTC')
  const builderSchedule = buildAlgebraTrackSchedule(timeZone)
  const activeItems = rows.map((item) => ({
    stableItemKey: item.stable_item_key,
    title: item.title,
    kind: item.item_kind,
    curriculumNodeId: item.curriculum_node_id,
    scheduledDate: item.scheduled_date,
    endDate: item.end_date,
    position: item.position,
    state: item.item_state,
    sourceSnapshot: item.source_snapshot
  }))
  const expected = builderSchedule.sessions.map((session) => ({
    stableItemKey: session.id,
    scheduledDate: session.startDate,
    sourceContentVersionKey: session.sourceContentVersionKey
  }))
  const expectedCurrent = expected.every((candidate) => rows.some((item) =>
    item.stable_item_key === candidate.stableItemKey
    && item.item_state !== 'dropped'
    && item.source_snapshot?.sourceContentVersionKey === candidate.sourceContentVersionKey
  ))
  const currentBuilderTrackItems = rows.filter((item) =>
    isCurrentBuilderTrackItem(item, builderSchedule.context.trackTaxonomySlugs[0])
  )

  let proposed = null
  let adapterMessage = null
  try {
    proposed = createBuilderCoursePublication({
      schedule: builderSchedule,
      course: {
        subject: { slug: builderSchedule.context.subjectTaxonomySlug },
        focus: {
          id: course.focus_node_id,
          slug: builderSchedule.context.trackTaxonomySlugs[0]
        }
      },
      activeItems
    })
  } catch (error) {
    adapterMessage = error.message
  }

  console.log(JSON.stringify({
    diagnostic: 'interactive-algebra-course-schedule',
    student: { id: aldebara.id, email: aldebara.email },
    course: {
      id: course.id,
      title: course.title,
      status: course.status,
      startDate: course.start_date,
      activatedStartDate: course.activated_start_date,
      scheduledEndDate: course.scheduled_end_date
    },
    activeVersion: {
      id: version?.id || course.active_schedule_version_id,
      versionNumber: version?.version_number ?? null,
      previousVersionId: version?.previous_version_id || null,
      timeZone: version?.time_zone || null,
      bounds: effectiveDateBounds(rows),
      items: rows.map((item) => ({
        stableItemKey: item.stable_item_key,
        title: item.title,
        scheduledDate: item.scheduled_date,
        endDate: item.end_date,
        state: item.item_state,
        hasTrackIdentity: Boolean(item.source_snapshot?.sourceContentVersionKey),
        sourceTrackSlug: item.source_snapshot?.sourceTrackSlug || null,
        sourceSessionId: item.source_snapshot?.sourceSessionId || null,
        builderScheduleId: item.source_snapshot?.builderScheduleId || null,
        planningHref: item.source_snapshot?.planningHref || null
      }))
    },
    expectedBuilderTrack: {
      alreadyCurrent: expectedCurrent,
      currentBuilderSchedulePresent: currentBuilderTrackItems.length > 0,
      currentBuilderSessionCount: currentBuilderTrackItems.length,
      bounds: effectiveDateBounds(expected.map((item) => ({ ...item, state: 'scheduled' }))),
      items: expected
    },
    proposedSuccessor: proposed ? {
      bounds: effectiveDateBounds(proposed.items),
      items: proposed.items.map((item) => ({
        stableItemKey: item.stableItemKey,
        scheduledDate: item.scheduledDate,
        endDate: item.endDate,
        state: item.state,
        hasTrackIdentity: Boolean(item.sourceContentVersionKey),
        sourceTrackSlug: item.sourceTrackSlug || null,
        sourceSessionId: item.sourceSessionId || null,
        planningHref: item.planningHref || null
      }))
    } : null,
    adapterMessage
  }, null, 2))
}

function base64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

function assertUuid(value, label) {
  const normalized = String(value || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${label} is not a valid UUID.`)
  }
  return normalized
}

async function publishLocallyAsActor(actorId, {
  courseId,
  expectedVersionId,
  builderSchedule,
  items,
  changeReasons
}) {
  const actor = assertUuid(actorId, 'The sandbox Mentor')
  const course = assertUuid(courseId, 'The sandbox Course')
  const version = assertUuid(expectedVersionId, 'The active Schedule Version')
  const sql = `
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', true);
select public.publish_course_builder_schedule(
  '${course}'::uuid,
  '${version}'::uuid,
  convert_from(decode('${base64Json(builderSchedule)}', 'base64'), 'utf8')::jsonb,
  convert_from(decode('${base64Json(items)}', 'base64'), 'utf8')::jsonb,
  convert_from(decode('${base64Json(changeReasons)}', 'base64'), 'utf8')::jsonb,
  'interactive-algebra-track-bridge:${version}'
);
commit;
`
  await runProcess('docker', [
    'exec', '-i', `supabase_db_${expectedProjectId}`,
    'psql', '-X', '--username', 'postgres', '--dbname', 'postgres',
    '--set', 'ON_ERROR_STOP=1'
  ], { input: sql })
}

async function publishAlgebraTrackBridge(context, mentor, course, builderSchedule) {
  const courses = await rest(context, 'student_courses', {
    query: {
      select: 'id,title,status,subject_node_id,focus_node_id,active_schedule_version_id',
      id: `eq.${course.id}`,
      limit: '1'
    }
  })
  const record = courses?.[0]
  if (!record?.active_schedule_version_id) {
    throw new Error('The interactive Algebra Course has no active Schedule Version.')
  }
  const versions = await rest(context, 'course_schedule_versions', {
    query: {
      select: 'id,version_number,name,time_zone',
      id: `eq.${record.active_schedule_version_id}`,
      limit: '1'
    }
  })
  const activeVersion = versions?.[0]
  const items = await rest(context, 'course_schedule_items', {
    query: {
      select: 'stable_item_key,title,item_kind,curriculum_node_id,scheduled_date,end_date,position,item_state,source_snapshot',
      version_id: `eq.${record.active_schedule_version_id}`,
      order: 'position.asc'
    }
  })
  const expected = new Map(builderSchedule.sessions.map((session) => [
    session.id,
    session.sourceContentVersionKey
  ]))
  const alreadyPublished = [...expected.entries()].every(([stableKey, contentKey]) =>
    items.some((item) =>
      item.stable_item_key === stableKey
      && item.item_state !== 'dropped'
      && item.source_snapshot?.sourceContentVersionKey === contentKey
    )
  )
  if (alreadyPublished) return false

  const publication = createBuilderCoursePublication({
    schedule: builderSchedule,
    course: {
      subject: { slug: builderSchedule.context.subjectTaxonomySlug },
      focus: {
        id: record.focus_node_id,
        slug: builderSchedule.context.trackTaxonomySlugs[0]
      }
    },
    activeItems: items.map((item) => ({
      stableItemKey: item.stable_item_key,
      title: item.title,
      kind: item.item_kind,
      curriculumNodeId: item.curriculum_node_id,
      scheduledDate: item.scheduled_date,
      endDate: item.end_date,
      position: item.position,
      state: item.item_state,
      sourceSnapshot: item.source_snapshot
    }))
  })
  await publishLocallyAsActor(mentor.id, {
    courseId: record.id,
    expectedVersionId: activeVersion.id,
    builderSchedule: publication.builderSchedule,
    items: publication.items,
    changeReasons: publication.changeReasons
  })
  return true
}

async function ensureCourse(context, adminToken, input) {
  const course = await callRpc(context, 'create_student_course_with_schedule_draft', {
    p_student_id: input.studentId,
    p_tutor_id: input.tutorId,
    p_subject_node_id: input.subjectId,
    p_focus_node_id: input.focusId,
    p_title: input.title,
    p_provider_kind: 'kelp',
    p_service_model: input.serviceModel,
    p_schedule: input.schedule,
    p_idempotency_key: input.idempotencyKey
  }, adminToken)
  const activation = await callRpc(context, 'activate_student_course', { p_course_id: course.id }, adminToken)
  return activation.course
}

async function readCourseScheduleMirror(context, courseId) {
  const schedules = await rest(context, 'learning_schedules', {
    query: {
      select: 'id,name,time_zone',
      student_course_id: `eq.${courseId}`,
      status: 'eq.active',
      limit: '1'
    }
  })
  const schedule = schedules?.[0]
  if (!schedule) throw new Error('The Course did not expose its Calendar compatibility mirror.')
  const sessions = await rest(context, 'learning_schedule_sessions', {
    query: {
      select: 'id,source_key,title,scheduled_date,end_date,position',
      schedule_id: `eq.${schedule.id}`,
      status: 'eq.active',
      order: 'position.asc'
    }
  })
  return {
    id: schedule.id,
    name: schedule.name,
    timeZone: schedule.time_zone,
    sessions: (sessions || []).map((session) => ({
      id: session.id,
      sourceKey: session.source_key,
      title: session.title,
      scheduledDate: session.scheduled_date,
      endDate: session.end_date,
      position: session.position
    }))
  }
}

async function userTimeZone(context, userId, fallback) {
  const preferences = await rest(context, 'user_preferences', {
    query: { select: 'time_zone', user_id: `eq.${userId}`, limit: '1' }
  })
  return preferences?.[0]?.time_zone || fallback
}

async function ensureAlgebraAssignment(context, mentor, student, schedule) {
  const targetSession = schedule.sessions.find((session) =>
    session.sourceKey.includes('instructions-hsm2')
  ) || schedule.sessions[1] || schedule.sessions[0]
  if (!targetSession) throw new Error('The Algebra schedule did not return an assignable session.')

  const existing = await rest(context, 'course_assignments', {
    query: { select: 'id,student_id,status', id: `eq.${algebraAssignmentId}`, limit: '1' }
  })
  if (existing?.length) {
    if (existing[0].student_id !== student.id) throw new Error('The reserved interactive assignment ID belongs to another Student.')
    return existing[0]
  }

  const assignment = {
    id: algebraAssignmentId,
    course_id: null,
    assigned_by: mentor.id,
    student_id: student.id,
    schedule_session_id: targetSession.id,
    status: 'assigned',
    course_title: 'Algebra 1 check-in',
    course_description: 'A small local practice set for experiencing Kelp assignments from the Student workspace.',
    curriculum_path_snapshot: [
      { id: curriculum.mathematics, name: 'Mathematics', type: 'subject' },
      { id: curriculum.algebraOne, name: 'Algebra 1', type: 'track' }
    ],
    schedule_snapshot: {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      sessionId: targetSession.id,
      sessionTitle: targetSession.title,
      scheduledDate: targetSession.scheduledDate,
      endDate: targetSession.endDate,
      timeZone: schedule.timeZone
    },
    question_count: 3,
    total_points: 8
  }
  await rest(context, 'course_assignments', {
    method: 'POST',
    body: assignment,
    prefer: 'return=minimal'
  })

  const items = [
    {
      assignment_id: algebraAssignmentId,
      position: 0,
      source_question_id: 'interactive-algebra-choice',
      difficulty: 'very-easy',
      question_type_tags: ['multiple-choice'],
      points: 2,
      delivery_snapshot: {
        name: 'Solving a linear equation',
        prompt: 'Which value of x satisfies 2x + 3 = 11?',
        type: 'multiple-choice',
        options: ['2', '3', '4', '7'],
        points: 2
      },
      grading_snapshot: {
        type: 'multiple-choice',
        correctOptionIndex: 2,
        points: 2
      }
    },
    {
      assignment_id: algebraAssignmentId,
      position: 1,
      source_question_id: 'interactive-algebra-numeric',
      difficulty: 'easy',
      question_type_tags: ['numeric'],
      points: 2,
      delivery_snapshot: {
        name: 'Slope from two points',
        prompt: 'What is the slope of the line through (1, 2) and (3, 6)?',
        type: 'numeric',
        points: 2
      },
      grading_snapshot: {
        type: 'numeric',
        numericExpectedAnswer: '2',
        numericTolerance: 0.000001,
        points: 2
      }
    },
    {
      assignment_id: algebraAssignmentId,
      position: 2,
      source_question_id: 'interactive-algebra-explanation',
      difficulty: 'difficult',
      question_type_tags: ['short-answer'],
      points: 4,
      delivery_snapshot: {
        name: 'Explain your reasoning',
        prompt: 'Explain how you would check whether a point lies on a given linear equation.',
        type: 'short-answer',
        points: 4
      },
      grading_snapshot: {
        type: 'short-answer',
        rubric: 'The response should describe substitution and comparison of both sides.',
        points: 4
      }
    }
  ]
  await rest(context, 'course_assignment_items', {
    method: 'POST',
    body: items,
    prefer: 'return=minimal'
  })
  return assignment
}

async function verifySandbox(context, mentor, aldebara, courses) {
  const courseRows = await rest(context, 'student_courses', {
    query: {
      select: 'id,title,status,student_id,tutor_id,mentor_id,idempotency_key',
      mentor_id: `eq.${mentor.id}`,
      idempotency_key: 'in.(interactive-mentor-mechanics-v1,interactive-mentor-algebra-v1)'
    }
  })
  if (courseRows.length !== 2 || courseRows.some((course) => course.status !== 'active')) {
    throw new Error('Interactive Course verification failed.')
  }
  if (!courseRows.some((course) => course.student_id === aldebara.id)) {
    throw new Error('Aldebara is not attached to the expected interactive Course.')
  }
  const courseIds = courses.map((course) => course.id).join(',')
  const classrooms = await rest(context, 'classrooms', {
    query: { select: 'id,course_id,status', course_id: `in.(${courseIds})` }
  })
  if (classrooms.length !== 2 || classrooms.some((classroom) => classroom.status !== 'active')) {
    throw new Error('Interactive Classroom verification failed.')
  }
  const assignments = await rest(context, 'course_assignments', {
    query: { select: 'id,student_id,status', id: `eq.${algebraAssignmentId}`, student_id: `eq.${aldebara.id}` }
  })
  if (assignments.length !== 1) throw new Error('Aldebara practice assignment verification failed.')
}

async function main() {
  if (process.argv.some((argument) => ['-h', '--help', 'help'].includes(argument))) {
    usage()
    return
  }
  requireConfirmation()
  const diagnoseOnly = process.argv.includes('--diagnose-only')
  const mentorEmail = requiredEmail('mentor-email')
  const studentEmail = requiredEmail('student-email')
  if (mentorEmail === studentEmail) throw new Error('The Mentor and Aldebara accounts must be different users.')

  const password = process.env[passwordVariable] || ''
  if (!diagnoseOnly && password.length < 12) {
    throw new Error(`${passwordVariable} must contain at least 12 characters and must not be committed.`)
  }
  const context = await preflight()
  const actorFixture = JSON.parse(await readFile(actorMapPath, 'utf8'))
  const reservedIds = new Set(actorFixture.actors.map((actor) => actor.id))
  if (diagnoseOnly) {
    const aldebara = await requireExistingUser(context, studentEmail, reservedIds)
    await diagnoseAlgebraSchedule(context, aldebara)
    return
  }
  const admin = actorFixture.actors.find((actor) => actor.alias === 'ACT-ADMIN')
  if (!admin) throw new Error('The deterministic actor map is missing ACT-ADMIN.')
  const adminToken = await signIn(context, admin.email, password)
  const adminAuthorization = await callRpc(context, 'get_my_authorization', {}, adminToken)
  if (!adminAuthorization.roles?.includes('admin')) {
    throw new Error('Provision the deterministic acceptance actors before creating the interactive sandbox.')
  }

  const [mentor, aldebara, saoPaulo, london] = await Promise.all([
    requireExistingUser(context, mentorEmail, reservedIds),
    requireExistingUser(context, studentEmail, reservedIds),
    findLocation(context, { countryCode: 'BR', cityNames: ['São Paulo', 'Sao Paulo'], timeZone: 'America/Sao_Paulo' }),
    findLocation(context, { countryCode: 'GB', cityNames: ['London'], timeZone: 'Europe/London' })
  ])

  const [saoPauloTutor, londonTutor, syntheticStudent] = await Promise.all([
    ensureSyntheticUser(context, sandboxActors.saoPauloTutor, password, saoPaulo),
    ensureSyntheticUser(context, sandboxActors.londonTutor, password, london),
    ensureSyntheticUser(context, sandboxActors.student, password, saoPaulo)
  ])

  for (const role of ['student', 'tutor']) await ensureRole(context, adminToken, mentor.id, role)
  await ensureRole(context, adminToken, mentor.id, 'mentor', { primary: true })
  await ensureRole(context, adminToken, aldebara.id, 'student')
  for (const tutor of [saoPauloTutor, londonTutor]) {
    await ensureRole(context, adminToken, tutor.id, 'student')
    await ensureRole(context, adminToken, tutor.id, 'tutor', { primary: true })
  }
  await ensureRole(context, adminToken, syntheticStudent.id, 'student', { primary: true })

  await ensureQualification(context, adminToken, mentor.id, curriculum.mechanics, 'Mentor Mechanics')
  await ensureQualification(context, adminToken, mentor.id, curriculum.algebraOne, 'Mentor Algebra 1')
  await ensureQualification(context, adminToken, saoPauloTutor.id, curriculum.mechanics, 'Tutor Mechanics')
  const londonTutorQualificationScopes = await ensureAllActiveSubjectQualifications(
    context,
    adminToken,
    londonTutor.id,
    'Oliver Bennett all-Track sandbox access'
  )
  await ensureSupervision(context, adminToken, saoPauloTutor.id, mentor.id)
  await ensureSupervision(context, adminToken, londonTutor.id, mentor.id)

  const mechanicsScheduleInput = {
    id: 'interactive-mechanics-schedule-v1',
    name: 'Mechanics Tuesday and Thursday plan',
    timeZone: saoPaulo.time_zone,
    schemaVersion: 1,
    sessions: [
      { id: 'interactive-mechanics-session-1', title: 'Motion foundations — theory', startDate: nextWeekday(2, 0), endDate: nextWeekday(2, 0) },
      { id: 'interactive-mechanics-session-2', title: 'Kinematics — guided problems', startDate: nextWeekday(4, 0), endDate: nextWeekday(4, 0) },
      { id: 'interactive-mechanics-session-3', title: 'Force diagrams — theory', startDate: nextWeekday(2, 1), endDate: nextWeekday(2, 1) },
      { id: 'interactive-mechanics-session-4', title: 'Newton laws — practice', startDate: nextWeekday(4, 1), endDate: nextWeekday(4, 1) }
    ]
  }
  const algebraTimeZone = await userTimeZone(context, aldebara.id, saoPaulo.time_zone)
  const algebraScheduleInput = buildAlgebraTrackSchedule(algebraTimeZone)

  const mechanicsCourse = await ensureCourse(context, adminToken, {
    studentId: syntheticStudent.id,
    tutorId: saoPauloTutor.id,
    subjectId: curriculum.physics,
    focusId: curriculum.mechanics,
    title: 'Mechanics Foundations',
    serviceModel: 'recurring',
    schedule: mechanicsScheduleInput,
    idempotencyKey: 'interactive-mentor-mechanics-v1'
  })
  const algebraCourse = await ensureCourse(context, adminToken, {
    studentId: aldebara.id,
    tutorId: londonTutor.id,
    subjectId: curriculum.mathematics,
    focusId: curriculum.algebraOne,
    title: 'Algebra 1 Guided Practice',
    serviceModel: 'on_demand',
    schedule: algebraScheduleInput,
    idempotencyKey: 'interactive-mentor-algebra-v1'
  })

  const algebraTrackUpdated = await publishAlgebraTrackBridge(
    context,
    mentor,
    algebraCourse,
    algebraScheduleInput
  )
  const mechanicsSchedule = await readCourseScheduleMirror(context, mechanicsCourse.id)
  const algebraSchedule = await readCourseScheduleMirror(context, algebraCourse.id)
  await ensureAlgebraAssignment(context, mentor, aldebara, algebraSchedule)
  await verifySandbox(context, mentor, aldebara, [mechanicsCourse, algebraCourse])

  console.log('Interactive Mentor sandbox provisioned and verified.')
  console.log(`Mentor: ${mentor.fullName} (existing account; Student + Tutor + Mentor workspaces)`)
  console.log(`Tutors: ${saoPauloTutor.fullName} (${saoPaulo.time_zone}); ${londonTutor.fullName} (${london.time_zone})`)
  console.log(
    `Oliver Bennett qualifications: ${londonTutorQualificationScopes.length} active Subject scopes covering every governed Track.`
  )
  console.log(`Students: ${syntheticStudent.fullName} (synthetic); ${aldebara.fullName} (existing Aldebara account)`)
  console.log('Courses: Mechanics Foundations; Algebra 1 Guided Practice')
  console.log(algebraTrackUpdated
    ? 'Aldebara Schedule: published four real Algebra 1 Track Sessions as a governed successor Version.'
    : 'Aldebara Schedule: preserved the current Builder-backed Algebra 1 Track Schedule.')
  console.log(`Aldebara assignment: Algebra 1 check-in (${algebraAssignmentId})`)
  console.log(`Synthetic account password: the current ${passwordVariable} value.`)
  console.log('The nine deterministic acceptance actors were not modified.')
  void mechanicsSchedule
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
