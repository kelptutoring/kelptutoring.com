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
    --student-email=<existing Aldebara local account>

This command mutates only the confirmed disposable local Supabase stack. It
preserves existing roles and profile data, and it never changes the nine
deterministic acceptance actors.`)
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

function runProcess(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: toolEnvironment(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
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

async function ensureCourse(context, adminToken, input) {
  const course = await callRpc(context, 'create_student_course_draft', {
    p_student_id: input.studentId,
    p_tutor_id: input.tutorId,
    p_subject_node_id: input.subjectId,
    p_focus_node_id: input.focusId,
    p_title: input.title,
    p_service_model: input.serviceModel,
    p_start_date: input.startDate,
    p_scheduled_end_date: input.endDate,
    p_idempotency_key: input.idempotencyKey
  }, adminToken)
  const activation = await callRpc(context, 'activate_student_course', { p_course_id: course.id }, adminToken)
  return activation.course
}

async function upsertCourseSchedule(context, adminToken, courseId, schedule) {
  return callRpc(context, 'upsert_student_course_learning_schedule', {
    p_student_course_id: courseId,
    p_schedule: schedule
  }, adminToken)
}

async function userTimeZone(context, userId, fallback) {
  const preferences = await rest(context, 'user_preferences', {
    query: { select: 'time_zone', user_id: `eq.${userId}`, limit: '1' }
  })
  return preferences?.[0]?.time_zone || fallback
}

async function ensureAlgebraAssignment(context, mentor, student, schedule) {
  const targetSession = schedule.sessions.find((session) => session.sourceKey === 'interactive-algebra-session-2') || schedule.sessions[0]
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
  const mentorEmail = requiredEmail('mentor-email')
  const studentEmail = requiredEmail('student-email')
  if (mentorEmail === studentEmail) throw new Error('The Mentor and Aldebara accounts must be different users.')

  const password = process.env[passwordVariable] || ''
  if (password.length < 12) throw new Error(`${passwordVariable} must contain at least 12 characters and must not be committed.`)
  const context = await preflight()
  const actorFixture = JSON.parse(await readFile(actorMapPath, 'utf8'))
  const reservedIds = new Set(actorFixture.actors.map((actor) => actor.id))
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
  await ensureQualification(context, adminToken, londonTutor.id, curriculum.algebraOne, 'Tutor Algebra 1')
  await ensureSupervision(context, adminToken, saoPauloTutor.id, mentor.id)
  await ensureSupervision(context, adminToken, londonTutor.id, mentor.id)

  const mechanicsCourse = await ensureCourse(context, adminToken, {
    studentId: syntheticStudent.id,
    tutorId: saoPauloTutor.id,
    subjectId: curriculum.physics,
    focusId: curriculum.mechanics,
    title: 'Mechanics Foundations',
    serviceModel: 'recurring',
    startDate: dateOnlyFromNow(1),
    endDate: dateOnlyFromNow(90),
    idempotencyKey: 'interactive-mentor-mechanics-v1'
  })
  const algebraCourse = await ensureCourse(context, adminToken, {
    studentId: aldebara.id,
    tutorId: londonTutor.id,
    subjectId: curriculum.mathematics,
    focusId: curriculum.algebraOne,
    title: 'Algebra 1 Guided Practice',
    serviceModel: 'on_demand',
    startDate: dateOnlyFromNow(3),
    endDate: dateOnlyFromNow(120),
    idempotencyKey: 'interactive-mentor-algebra-v1'
  })

  const mechanicsSchedule = await upsertCourseSchedule(context, adminToken, mechanicsCourse.id, {
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
  })
  const algebraTimeZone = await userTimeZone(context, aldebara.id, saoPaulo.time_zone)
  const algebraSchedule = await upsertCourseSchedule(context, adminToken, algebraCourse.id, {
    id: 'interactive-algebra-schedule-v1',
    name: 'Algebra 1 Wednesday plan',
    timeZone: algebraTimeZone,
    schemaVersion: 1,
    sessions: [
      { id: 'interactive-algebra-session-1', title: 'Linear equations — theory', startDate: nextWeekday(3, 0), endDate: nextWeekday(3, 0) },
      { id: 'interactive-algebra-session-2', title: 'Linear equations — assignment due', startDate: nextWeekday(3, 1), endDate: nextWeekday(3, 1) },
      { id: 'interactive-algebra-session-3', title: 'Functions and graphs — theory', startDate: nextWeekday(3, 2), endDate: nextWeekday(3, 2) },
      { id: 'interactive-algebra-session-4', title: 'Slope and intercepts — practice', startDate: nextWeekday(3, 3), endDate: nextWeekday(3, 3) }
    ]
  })
  await ensureAlgebraAssignment(context, mentor, aldebara, algebraSchedule)
  await verifySandbox(context, mentor, aldebara, [mechanicsCourse, algebraCourse])

  console.log('Interactive Mentor sandbox provisioned and verified.')
  console.log(`Mentor: ${mentor.fullName} (existing account; Student + Tutor + Mentor workspaces)`)
  console.log(`Tutors: ${saoPauloTutor.fullName} (${saoPaulo.time_zone}); ${londonTutor.fullName} (${london.time_zone})`)
  console.log(`Students: ${syntheticStudent.fullName} (synthetic); ${aldebara.fullName} (existing Aldebara account)`)
  console.log('Courses: Mechanics Foundations; Algebra 1 Guided Practice')
  console.log(`Aldebara assignment: Algebra 1 check-in (${algebraAssignmentId})`)
  console.log(`Synthetic account password: the current ${passwordVariable} value.`)
  console.log('The nine deterministic acceptance actors were not modified.')
  void mechanicsSchedule
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
