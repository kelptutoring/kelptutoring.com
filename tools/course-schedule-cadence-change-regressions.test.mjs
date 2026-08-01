import assert from 'node:assert/strict'
import test from 'node:test'

import '../src/app/schedule-generator/schedule-domain.js'

const {
  buildSchedule,
  calculateEffectiveSessionDates
} = globalThis.KelpScheduleDomain

const sessions = ['A', 'B', 'C', 'D', 'E'].map((id) => ({
  id,
  scheduledSessionId: id,
  sourceSessionId: `source-${id}`,
  trackId: 'regression-track',
  trackTitle: 'Regression Track',
  moduleId: 'regression-module',
  moduleTitle: 'Regression Module',
  title: `Session ${id}`,
  type: 'lesson'
}))

const formerMondayFridayState = [
  ['A', '2026-08-10', true],
  ['B', '2026-08-14', false],
  ['C', '2026-08-17', true],
  ['D', '2026-08-21', false],
  ['E', '2026-08-24', false]
].map(([stableItemKey, scheduledDate, isStudied]) => ({
  stableItemKey,
  scheduledDate,
  endDate: scheduledDate,
  isStudied
}))

const revisedCadence = {
  type: 'weekly_frequency',
  weekdays: [2, 4]
}

const dateWeekday = (dateOnly) => new Date(`${dateOnly}T12:00:00Z`).getUTCDay()

test('cadence change keeps Studied Sessions fixed and moves every unfinished Session', () => {
  const effectiveDates = calculateEffectiveSessionDates({
    sessions,
    startDate: '2026-08-06',
    today: '2026-08-06',
    lockedStartDate: '2026-08-06',
    cadence: revisedCadence,
    activeItems: formerMondayFridayState
  })

  assert.deepEqual(
    effectiveDates.map((entry) => entry.startDate),
    [
      '2026-08-10',
      '2026-08-06',
      '2026-08-17',
      '2026-08-11',
      '2026-08-13'
    ]
  )
  assert.deepEqual(
    effectiveDates.map((entry) => entry.retainedReason),
    ['studied', null, 'studied', null, null]
  )
  assert.deepEqual(
    [effectiveDates[1], effectiveDates[3], effectiveDates[4]]
      .map((entry) => dateWeekday(entry.startDate)),
    [4, 2, 4],
    'Every unfinished Session must move to the revised Tuesday/Thursday lane.'
  )
})

test('unmarking after a cadence change restores the Session only on the new cadence', () => {
  const effectiveDates = calculateEffectiveSessionDates({
    sessions,
    startDate: '2026-08-06',
    today: '2026-08-06',
    lockedStartDate: '2026-08-06',
    cadence: revisedCadence,
    activeItems: formerMondayFridayState.map((entry) => (
      entry.stableItemKey === 'C'
        ? { ...entry, isStudied: false }
        : entry
    ))
  })

  assert.deepEqual(
    effectiveDates.map((entry) => entry.startDate),
    [
      '2026-08-10',
      '2026-08-06',
      '2026-08-11',
      '2026-08-13',
      '2026-08-18'
    ]
  )
  assert.equal(effectiveDates[2].retainedReason, null)
  assert.deepEqual(
    effectiveDates.slice(1).map((entry) => dateWeekday(entry.startDate)),
    [4, 2, 4, 2],
    'The restored Session and every other unfinished Session must avoid the former Monday/Friday slots.'
  )
})

test('the persisted publication lane contains no dates from the superseded cadence', () => {
  const schedule = buildSchedule({
    id: 'cadence-change-regression',
    name: 'Cadence change regression',
    startDate: '2026-08-06',
    timeZone: 'America/Sao_Paulo',
    cadence: revisedCadence,
    pacingMode: 'adaptive',
    activeItems: formerMondayFridayState,
    today: '2026-08-06',
    lockedStartDate: '2026-08-06',
    sessionPlans: sessions
  })

  assert.deepEqual(
    schedule.sessions.map((session) => session.startDate),
    [
      '2026-08-10',
      '2026-08-06',
      '2026-08-17',
      '2026-08-11',
      '2026-08-13'
    ],
    'The Student-facing document keeps only the two Studied dates fixed.'
  )
  assert.deepEqual(
    schedule.context.effectiveFutureLane.map((entry) => [
      entry.stableItemKey,
      entry.startDate,
      dateWeekday(entry.startDate)
    ]),
    [
      ['A', '2026-08-06', 4],
      ['B', '2026-08-11', 2],
      ['C', '2026-08-13', 4],
      ['D', '2026-08-18', 2],
      ['E', '2026-08-20', 4]
    ],
    'The publication authority must contain the new cadence exclusively, even while Studied history stays visible elsewhere.'
  )
})
