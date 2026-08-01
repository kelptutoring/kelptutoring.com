import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { delimiter, dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const actorMapPath = resolve(projectRoot, 'tests/acceptance/fixtures/local-supabase-actor-map-v1.json')
const expectedProjectId = 'kelptutoring.com-main'
const expectedApiPort = '54321'
const expectedDbPort = '54322'
const passwordVariable = 'KELP_LOCAL_ACCEPTANCE_PASSWORD'

const databaseTests = [
  {
    file: 'content-publication-db-self-test.sql',
    actors: { tutor_id: 'ACT-TUTOR', mentor_id: 'ACT-MENTOR' }
  },
  {
    file: 'curriculum-taxonomy-db-self-test.sql',
    actors: { mentor_id: 'ACT-MENTOR', admin_id: 'ACT-ADMIN' }
  },
  {
    file: 'question-bank-db-self-test.sql',
    actors: { mentor_id: 'ACT-MENTOR', tutor_id: 'ACT-TUTOR' }
  },
  {
    file: 'course-composition-db-self-test.sql',
    actors: { mentor_id: 'ACT-MENTOR', tutor_id: 'ACT-TUTOR' }
  },
  {
    file: 'course-practice-delivery-db-self-test.sql',
    actors: { mentor_id: 'ACT-MENTOR', student_id: 'ACT-STUDENT', outsider_id: 'ACT-OUTSIDER' }
  },
  {
    file: 'student-profile-preferences-db-self-test.sql',
    actors: { student_id: 'ACT-STUDENT', outsider_id: 'ACT-OUTSIDER' }
  },
  {
    file: 'student-relationships-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'required-versioned-course-schedule-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      independent_tutor_id: 'ACT-TEACHER',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-date-synchronization-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-structural-editing-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      independent_tutor_id: 'ACT-TEACHER',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-session-resources-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-progress-ledger-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-progress-hierarchical-aggregation-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'builder-effective-student-schedule-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-meeting-pattern-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      independent_tutor_id: 'ACT-TEACHER',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-academic-slots-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-target-mapping-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-pacing-policy-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-occurrence-outcomes-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'unified-course-schedule-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'unified-schedule-read-contract-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-version-coverage-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'course-schedule-qualification-publication-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'multi-curriculum-consumer-projection-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'classroom-home-multi-curriculum-db-self-test.sql',
    actors: {
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_a_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'student-dashboard-foundation-db-self-test.sql',
    actors: {
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      tutor_id: 'ACT-TUTOR',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'student-classroom-cards-db-self-test.sql',
    actors: {
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      tutor_id: 'ACT-TUTOR',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'classroom-membership-visibility-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      tutor_id: 'ACT-TUTOR',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'student-classroom-lifecycle-projection-db-self-test.sql',
    actors: {
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      tutor_id: 'ACT-TUTOR',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'classroom-management-surface-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'classroom-overview-projection-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'classroom-navigation-privacy-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_id: 'ACT-STUDENT',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'classroom-private-files-db-self-test.sql',
    actors: {
      admin_id: 'ACT-ADMIN',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      student_id: 'ACT-STUDENT',
      guardian_id: 'ACT-STUDENT-B',
      former_tutor_id: 'ACT-STUDENT-TUTOR',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'student-calendar-surface-db-self-test.sql',
    actors: {
      student_a_id: 'ACT-STUDENT',
      student_b_id: 'ACT-STUDENT-B',
      mentor_id: 'ACT-MENTOR',
      tutor_id: 'ACT-TUTOR',
      outsider_id: 'ACT-OUTSIDER'
    }
  },
  {
    file: 'server-adapter-privileges-db-self-test.sql',
    actors: {}
  }
]

function usage() {
  console.log(`Usage:
  node tools/local-supabase-acceptance.mjs preflight
  node tools/local-supabase-acceptance.mjs reset --confirm-project=${expectedProjectId}
  node tools/local-supabase-acceptance.mjs provision --confirm-project=${expectedProjectId}
  node tools/local-supabase-acceptance.mjs manual-qa --confirm-project=${expectedProjectId}
  node tools/local-supabase-acceptance.mjs verify
  node tools/local-supabase-acceptance.mjs test
  node tools/local-supabase-acceptance.mjs audit

The reset and manual-qa commands target only the confirmed local stack.
Provision and verify require ${passwordVariable} to be set for the disposable
synthetic accounts. manual-qa preserves passwords and needs no password value.`)
}

function argumentValue(name) {
  const prefix = `--${name}=`
  const direct = process.argv.slice(3).find((argument) => argument.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : ''
}

function requireConfirmation() {
  const supplied = argumentValue('confirm-project')
  if (supplied !== expectedProjectId) {
    throw new Error(`Refusing to mutate Supabase. Pass --confirm-project=${expectedProjectId} after verifying the disposable local target.`)
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

function runProcess(command, args, { capture = true, input = null } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: toolEnvironment(),
      shell: false,
      stdio: [input === null ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit']
    })
    let stdout = ''
    let stderr = ''
    if (capture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => { stdout += chunk })
      child.stderr.on('data', (chunk) => { stderr += chunk })
    }
    child.on('error', rejectPromise)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }
      const detail = capture ? `\n${stderr || stdout}` : ''
      rejectPromise(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}.${detail}`))
    })
    if (input !== null) {
      child.stdin.end(input)
    }
  })
}

function runSupabase(args, options) {
  if (process.platform === 'win32') {
    return runProcess('cmd.exe', ['/d', '/s', '/c', 'supabase.cmd', ...args], options)
  }
  return runProcess('supabase', args, options)
}

async function loadActorMap() {
  const fixture = JSON.parse(await readFile(actorMapPath, 'utf8'))
  if (fixture.projectId !== expectedProjectId) {
    throw new Error(`Actor map project ${fixture.projectId || '(missing)'} does not match ${expectedProjectId}.`)
  }
  return fixture
}

async function configuredProjectId() {
  const config = await readFile(resolve(projectRoot, 'supabase/config.toml'), 'utf8')
  const match = config.match(/^project_id\s*=\s*"([^"]+)"/m)
  if (!match) throw new Error('supabase/config.toml does not declare project_id.')
  return match[1]
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
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is missing or invalid.`)
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== expectedPort) {
    throw new Error(`Refusing non-local ${label}: ${url.origin}`)
  }
  return url
}

async function preflight({ quiet = false } = {}) {
  const projectId = await configuredProjectId()
  if (projectId !== expectedProjectId) {
    throw new Error(`Refusing project ${projectId}; expected ${expectedProjectId}.`)
  }
  const fixture = await loadActorMap()
  const { stdout } = await runSupabase(['status', '-o', 'env'])
  const status = parseEnvironmentOutput(stdout)
  const apiUrl = status.API_URL || status.SUPABASE_URL
  const dbUrl = status.DB_URL
  assertLoopbackUrl(apiUrl, expectedApiPort, 'API URL')
  assertLoopbackUrl(dbUrl, expectedDbPort, 'database URL')
  const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  if (!anonKey || !serviceRoleKey) {
    throw new Error('Local Supabase status did not provide the anonymous/publishable and service-role/secret keys.')
  }
  if (!quiet) {
    console.log(`Local preflight passed for ${projectId} (${apiUrl}, database port ${expectedDbPort}).`)
  }
  return { projectId, fixture, apiUrl, dbUrl, anonKey, serviceRoleKey }
}

async function fetchJson(url, options, expectedStatuses = [200]) {
  const response = await fetch(url, options)
  const bodyText = await response.text()
  let body = null
  if (bodyText) {
    try { body = JSON.parse(bodyText) } catch { body = bodyText }
  }
  if (!expectedStatuses.includes(response.status)) {
    const safeDetail = typeof body === 'string' ? body : JSON.stringify(body)
    throw new Error(`Local Supabase request failed (${response.status}): ${safeDetail}`)
  }
  return { status: response.status, body }
}

function adminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  }
}

async function ensureAuthUser(context, actor, password) {
  const url = `${context.apiUrl}/auth/v1/admin/users/${actor.id}`
  const existing = await fetchJson(url, { headers: adminHeaders(context.serviceRoleKey) }, [200, 404])
  const payload = {
    email: actor.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: actor.fullName,
      birth_date: '2000-01-01',
      acceptance_alias: actor.alias
    }
  }
  if (existing.status === 404) {
    await fetchJson(`${context.apiUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders(context.serviceRoleKey),
      body: JSON.stringify({ id: actor.id, ...payload })
    }, [200, 201])
    return
  }
  if (existing.body?.email !== actor.email) {
    throw new Error(`${actor.alias} UUID is already assigned to a different local email.`)
  }
  await fetchJson(url, {
    method: 'PUT',
    headers: adminHeaders(context.serviceRoleKey),
    body: JSON.stringify(payload)
  })
}

async function signIn(context, actor, password) {
  const { body } = await fetchJson(`${context.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: context.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: actor.email, password })
  })
  if (!body?.access_token) throw new Error(`Local sign-in did not return a token for ${actor.alias}.`)
  return body.access_token
}

async function callRpc(context, name, payload, token, apiKey = context.anonKey) {
  const { body } = await fetchJson(`${context.apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  return body
}

async function authorizationFor(context, actor, password) {
  const token = await signIn(context, actor, password)
  const authorization = await callRpc(context, 'get_my_authorization', {}, token)
  return { token, authorization }
}

function sameSet(left, right) {
  return [...left].sort().join('|') === [...right].sort().join('|')
}

function dateOnlyFromNow(offsetDays) {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return value.toISOString().slice(0, 10)
}

async function provisionRelationshipFixtures(context, actors, password, adminSession) {
  const actorByAlias = new Map(actors.map((actor) => [actor.alias, actor]))
  const mentor = actorByAlias.get('ACT-MENTOR')
  const tutor = actorByAlias.get('ACT-TUTOR')
  const studentA = actorByAlias.get('ACT-STUDENT')
  const studentB = actorByAlias.get('ACT-STUDENT-B')
  if (!mentor || !tutor || !studentA || !studentB) {
    throw new Error('Phase 2.A relationship actors are incomplete.')
  }

  const mechanicsNodeId = '10000000-0000-4000-8000-000000000032'
  const physicsSubjectId = '10000000-0000-4000-8000-000000000013'
  for (const actor of [mentor, tutor]) {
    await callRpc(context, 'grant_teaching_qualification', {
      p_user_id: actor.id,
      p_curriculum_node_id: mechanicsNodeId,
      p_reason: 'Phase 2.A deterministic Mechanics qualification'
    }, adminSession.token)
  }
  await callRpc(context, 'assign_tutor_supervisor', {
    p_tutor_id: tutor.id,
    p_mentor_id: mentor.id,
    p_reason: 'Phase 2.A deterministic supervisory relationship'
  }, adminSession.token)

  const mentorSession = await authorizationFor(context, mentor, password)
  const courseInputs = [
    {
      student: studentA,
      title: 'Recurring Mechanics Foundations',
      serviceModel: 'recurring',
      idempotencyKey: 'acceptance-dashboard-student-a'
    },
    {
      student: studentB,
      title: 'On-demand Mechanics Practice',
      serviceModel: 'on_demand',
      idempotencyKey: 'acceptance-dashboard-student-b'
    }
  ]
  for (const [index, input] of courseInputs.entries()) {
    const course = await callRpc(context, 'create_student_course_with_schedule_draft', {
      p_student_id: input.student.id,
      p_tutor_id: tutor.id,
      p_subject_node_id: physicsSubjectId,
      p_focus_node_id: mechanicsNodeId,
      p_title: input.title,
      p_provider_kind: 'kelp',
      p_service_model: input.serviceModel,
      p_schedule: {
        schemaVersion: 1,
        id: `${input.idempotencyKey}-schedule-v1`,
        name: `${input.title} Schedule`,
        timeZone: 'UTC',
        sessions: [{
          id: `${input.idempotencyKey}-topic-1`,
          title: index === 0 ? 'Motion foundations' : 'Mechanics problem analysis',
          startDate: dateOnlyFromNow(1),
          endDate: dateOnlyFromNow(120)
        }]
      },
      p_idempotency_key: input.idempotencyKey
    }, mentorSession.token)
    await callRpc(context, 'activate_student_course', { p_course_id: course.id }, mentorSession.token)
  }
}

async function verifyRelationshipFixtures(context, password) {
  const actorByAlias = new Map(context.fixture.actors.map((actor) => [actor.alias, actor]))
  const expectations = [
    ['ACT-STUDENT', 1, 0],
    ['ACT-STUDENT-B', 1, 0],
    ['ACT-TUTOR', 2, 1],
    ['ACT-MENTOR', 2, 1],
    ['ACT-OUTSIDER', 0, 0]
  ]
  for (const [alias, expectedCourses, expectedSupervisions] of expectations) {
    const actor = actorByAlias.get(alias)
    if (!actor) throw new Error(`Relationship verification references unknown actor ${alias}.`)
    const token = await signIn(context, actor, password)
    const relationships = await callRpc(context, 'get_my_learning_relationships', {}, token)
    if ((relationships.courses || []).length !== expectedCourses) {
      throw new Error(`${alias} expected ${expectedCourses} visible Course relationships.`)
    }
    if ((relationships.supervisions || []).length !== expectedSupervisions) {
      throw new Error(`${alias} expected ${expectedSupervisions} visible Tutor supervision relationships.`)
    }
    if ((relationships.courses || []).some((course) => !course.classroom || course.classroom.status !== 'active')) {
      throw new Error(`${alias} has a Course without its active Classroom projection.`)
    }
  }
}

async function provisionClassroomTestNetwork(context) {
  const container = await findDatabaseContainer(context.projectId)
  const { buildManualQaNetworkSchedules } = await import(
    './manual-qa-network-fixtures.mjs'
  )
  const schedules = buildManualQaNetworkSchedules()
  const encodeSchedule = (schedule) =>
    Buffer.from(JSON.stringify(schedule), 'utf8').toString('base64')
  const sqlTemplate = await readFile(
    resolve(projectRoot, 'tools', 'provision-classroom-test-network.sql'),
    'utf8'
  )
  const sql = sqlTemplate
    .replace('@@ALGEBRA_SCHEDULE_BASE64@@', encodeSchedule(schedules.algebra))
    .replace('@@MECHANICS_SCHEDULE_BASE64@@', encodeSchedule(schedules.mechanics))
  if (/@@[A-Z0-9_]+@@/.test(sql)) {
    throw new Error('The manual-QA Classroom SQL still contains an unresolved fixture token.')
  }
  await runProcess('docker', [
    'exec', '-i', container, 'psql', '-X', '--quiet',
    '--username', 'postgres', '--dbname', 'postgres',
    '--set', 'ON_ERROR_STOP=1'
  ], { input: sql })
}

async function provisionActors() {
  requireConfirmation()
  const password = process.env[passwordVariable] || ''
  if (password.length < 12) {
    throw new Error(`${passwordVariable} must contain at least 12 characters and must not be committed.`)
  }
  const context = await preflight({ quiet: true })
  const actors = context.fixture.actors
  for (const actor of actors) {
    await ensureAuthUser(context, actor, password)
  }

  const admin = actors.find((actor) => actor.alias === 'ACT-ADMIN')
  if (!admin) throw new Error('Actor map is missing ACT-ADMIN.')
  let adminSession = await authorizationFor(context, admin, password)
  if (!adminSession.authorization.roles.includes('admin')) {
    await callRpc(
      context,
      'bootstrap_first_administrator',
      { p_user_id: admin.id, p_reason: 'Phase 8 deterministic local acceptance bootstrap' },
      context.serviceRoleKey,
      context.serviceRoleKey
    )
    adminSession = await authorizationFor(context, admin, password)
  }

  for (const actor of actors) {
    let actorSession = await authorizationFor(context, actor, password)
    for (const role of actor.roles.filter((role) => role !== 'student')) {
      if (!actorSession.authorization.roles.includes(role) || actorSession.authorization.primaryRole !== actor.primaryRole) {
        await callRpc(context, 'grant_user_role', {
          p_user_id: actor.id,
          p_role_key: role,
          p_reason: 'Phase 8 deterministic local acceptance role setup',
          p_make_primary: role === actor.primaryRole
        }, adminSession.token)
        actorSession = await authorizationFor(context, actor, password)
      }
    }
    for (const role of actorSession.authorization.roles.filter((role) => !actor.roles.includes(role))) {
      await callRpc(context, 'revoke_user_role', {
        p_user_id: actor.id,
        p_role_key: role,
        p_reason: 'Phase 8 deterministic local acceptance role normalization'
      }, adminSession.token)
      actorSession = await authorizationFor(context, actor, password)
    }
    if (actorSession.authorization.primaryRole !== actor.primaryRole) {
      await callRpc(context, 'set_my_primary_role', { p_role_key: actor.primaryRole }, actorSession.token)
    }
  }

  await provisionRelationshipFixtures(context, actors, password, adminSession)
  await provisionClassroomTestNetwork(context)
  await verifyActors(context, password)
  await verifyRelationshipFixtures(context, password)
  console.log(`Provisioned and verified ${actors.length} deterministic local acceptance actors.`)
  console.log('Provisioned and verified the Phase 2.A Mentor, Tutor, Student, Course, and Classroom fixtures.')
  console.log('Provisioned and verified the requested local Mentor-to-Tutor Classroom test network.')
}

async function provisionManualQaNetwork() {
  requireConfirmation()
  const context = await preflight({ quiet: true })
  await provisionClassroomTestNetwork(context)
  console.log('Provisioned and verified the four-account interactive manual-QA network.')
}

async function verifyActors(existingContext = null, suppliedPassword = '') {
  const password = suppliedPassword || process.env[passwordVariable] || ''
  if (password.length < 12) {
    throw new Error(`${passwordVariable} must be set to verify the local actors.`)
  }
  const context = existingContext || await preflight({ quiet: true })
  for (const actor of context.fixture.actors) {
    const { authorization } = await authorizationFor(context, actor, password)
    if (!sameSet(authorization.roles || [], actor.roles) || authorization.primaryRole !== actor.primaryRole) {
      throw new Error(`${actor.alias} authorization mismatch. Expected ${actor.roles.join(', ')} with primary ${actor.primaryRole}.`)
    }
  }
  if (!existingContext) {
    await verifyRelationshipFixtures(context, password)
    console.log(`Verified ${context.fixture.actors.length} deterministic local acceptance actors and Phase 2.A relationships.`)
  }
}

async function findDatabaseContainer(projectId) {
  const { stdout } = await runProcess('docker', [
    'ps', '--filter', `name=supabase_db_${projectId}`, '--format', '{{.Names}}'
  ])
  const names = stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
  const expectedName = `supabase_db_${projectId}`
  const match = names.find((name) => name === expectedName)
  if (!match) throw new Error(`Running Docker container ${expectedName} was not found.`)
  return match
}

async function runDatabaseTests() {
  const context = await preflight({ quiet: true })
  const actorByAlias = new Map(context.fixture.actors.map((actor) => [actor.alias, actor]))
  const container = await findDatabaseContainer(context.projectId)
  for (const [index, test] of databaseTests.entries()) {
    const sql = await readFile(resolve(projectRoot, 'tools', test.file), 'utf8')
    const variables = []
    for (const [variable, alias] of Object.entries(test.actors)) {
      const actor = actorByAlias.get(alias)
      if (!actor) throw new Error(`${test.file} references unknown actor ${alias}.`)
      variables.push('--set', `${variable}=${actor.id}`)
    }
    process.stdout.write(`[${index + 1}/${databaseTests.length}] ${test.file} ... `)
    try {
      await runProcess('docker', [
        'exec', '-i', container, 'psql', '-X', '--username', 'postgres', '--dbname', 'postgres',
        '--set', 'ON_ERROR_STOP=1', ...variables
      ], { input: sql })
      console.log('PASS')
    } catch (error) {
      console.log('FAIL')
      throw error
    }
  }
  console.log(`All ${databaseTests.length} rollback database characterizations passed.`)
}

async function auditPostRunState() {
  const context = await preflight({ quiet: true })
  const actorByAlias = new Map(context.fixture.actors.map((actor) => [actor.alias, actor]))
  const container = await findDatabaseContainer(context.projectId)
  const sql = await readFile(resolve(projectRoot, 'tools', 'local-supabase-post-run-audit.sql'), 'utf8')
  const actorVariables = {
    student_id: 'ACT-STUDENT',
    student_b_id: 'ACT-STUDENT-B',
    tutor_id: 'ACT-TUTOR',
    teacher_id: 'ACT-TEACHER',
    mentor_id: 'ACT-MENTOR',
    admin_id: 'ACT-ADMIN',
    student_tutor_id: 'ACT-STUDENT-TUTOR',
    tutor_mentor_id: 'ACT-TUTOR-MENTOR',
    outsider_id: 'ACT-OUTSIDER'
  }
  const variables = []
  for (const [variable, alias] of Object.entries(actorVariables)) {
    const actor = actorByAlias.get(alias)
    if (!actor) throw new Error(`Post-run audit references unknown actor ${alias}.`)
    variables.push('--set', `${variable}=${actor.id}`)
  }
  await runProcess('docker', [
    'exec', '-i', container, 'psql', '-X', '--username', 'postgres', '--dbname', 'postgres',
    '--set', 'ON_ERROR_STOP=1', ...variables
  ], { input: sql })
  console.log(`Post-run audit passed: ${context.fixture.actors.length} actors verified; zero characterization rows retained.`)
}

async function resetLocalDatabase() {
  requireConfirmation()
  await preflight({ quiet: true })
  console.log(`Resetting confirmed disposable local project ${expectedProjectId}...`)
  await runSupabase(['db', 'reset', '--local'], { capture: false })
  console.log('Local reset completed. Provision actors before running database characterizations.')
}

async function main() {
  const command = process.argv[2]
  if (!command || ['help', '--help', '-h'].includes(command)) {
    usage()
    return
  }
  if (command === 'preflight') return preflight()
  if (command === 'reset') return resetLocalDatabase()
  if (command === 'provision') return provisionActors()
  if (command === 'manual-qa') return provisionManualQaNetwork()
  if (command === 'verify') return verifyActors()
  if (command === 'test') return runDatabaseTests()
  if (command === 'audit') return auditPostRunState()
  usage()
  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
