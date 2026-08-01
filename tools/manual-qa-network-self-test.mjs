import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildManualQaNetworkSchedules,
  manualQaNetwork
} from './manual-qa-network-fixtures.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sql = await readFile(
  resolve(projectRoot, 'tools', 'provision-classroom-test-network.sql'),
  'utf8'
)
const runner = await readFile(
  resolve(projectRoot, 'tools', 'local-supabase-acceptance.mjs'),
  'utf8'
)
const schedules = buildManualQaNetworkSchedules()

assert.deepEqual(manualQaNetwork.mentor.roles, ['mentor'])
assert.deepEqual(manualQaNetwork.tutor.roles, ['tutor'])
assert.deepEqual(
  manualQaNetwork.students.map((student) => student.roles),
  [['student'], ['student']]
)
assert.equal(manualQaNetwork.mentor.email, 'al.van.astrea@gmail.com')
assert.equal(manualQaNetwork.tutor.email, 'thiago.loyola@kelptutoring.com')
assert.deepEqual(
  manualQaNetwork.students.map((student) => student.email),
  ['thiago.d.loyola@gmail.com', 'thiago.dias.loyola@gmail.com']
)

const sourceSessions = new Map()
for (const level of globalThis.tracksCatalog?.levels || []) {
  for (const subject of level.subjects || []) {
    for (const track of subject.tracks || []) {
      for (const module of track.modules || []) {
        for (const session of module.sessions || []) {
          sourceSessions.set(session.sourceSessionId, {
            sourceContentVersionKey: session.sourceContentVersionKey,
            planningHref: session.planningHref,
            moduleId: module.id,
            educationLevelSlug: level.taxonomySlug,
            subjectSlug: subject.taxonomySlug,
            trackSlug: track.taxonomySlug
          })
        }
      }
    }
  }
}

for (const [fixtureName, schedule] of Object.entries(schedules)) {
  assert.equal(schedule.schemaVersion, 2)
  assert.equal(schedule.timeZone, 'America/Sao_Paulo')
  assert.equal(schedule.sessions.length, 8)
  assert.equal(new Set(schedule.sessions.map((session) => session.id)).size, 8)

  for (const session of schedule.sessions) {
    const source = sourceSessions.get(session.sourceSessionId)
    assert.ok(source, `${fixtureName} references an unknown canonical Session.`)
    assert.equal(session.sourceContentVersionKey, source.sourceContentVersionKey)
    assert.equal(session.planningHref, source.planningHref)
    assert.equal(session.sourceModuleKey, source.moduleId)
    assert.equal(session.sourceEducationLevelSlug, source.educationLevelSlug)
    assert.equal(session.sourceSubjectSlug, source.subjectSlug)
    assert.equal(session.sourceTrackSlug, source.trackSlug)
    assert.match(session.planningHref, /\.html$/i)
    assert.ok(
      existsSync(resolve(projectRoot, 'src', 'app', 'classroom', session.planningHref)),
      `${fixtureName} has no generated Track page for ${session.planningHref}.`
    )
  }
}

assert.match(sql, /Aldebarã \(Mentor\)[\s\S]+Thiago Kelp \(Tutor\)/)
assert.match(sql, /'manual-qa-thiago-d-algebra-v1'/)
assert.match(sql, /'manual-qa-thiago-dias-mechanics-v1'/)
assert.match(sql, /'recurring'[\s\S]+@@ALGEBRA_SCHEDULE_BASE64@@/)
assert.match(sql, /'on_demand'[\s\S]+@@MECHANICS_SCHEDULE_BASE64@@/)
assert.match(sql, /Known legacy sandbox Courses were retained as inactive history/)
assert.match(sql, /sourceSessionId[\s\S]+sourceContentVersionKey[\s\S]+planningHref/)
assert.match(sql, /full active-Subject coverage/)
assert.match(sql, /subject\.node_type = 'subject'/)
assert.match(sql, /manual_qualification_coverage_ready/)
assert.doesNotMatch(sql, /Linear equations foundations/)
assert.doesNotMatch(sql, /Motion and reference frames/)

assert.match(runner, /import\(\s*'\.\/manual-qa-network-fixtures\.mjs'\s*\)/)
assert.match(runner, /@@ALGEBRA_SCHEDULE_BASE64@@/)
assert.match(runner, /@@MECHANICS_SCHEDULE_BASE64@@/)
assert.match(runner, /unresolved fixture token/)

console.log(
  'Manual-QA Mentor/Tutor/Student graph and canonical Track Schedule fixtures passed.'
)
