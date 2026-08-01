import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createBuilderCoursePublication,
  normalizeCourseScheduleCadence,
  reconcileContinuingScheduleDates
} from '../src/app/schedule-generator/course-schedule-adapter.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [tracksSource, builderSource, scopeMigration, progressGuardMigration] = await Promise.all([
  readFile(resolve(projectRoot, 'src/data/tracks-data.js'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/schedule-generator/schedule-generator.js'), 'utf8'),
  readFile(
    resolve(projectRoot, 'supabase/migrations/202607240004_classroom_scoped_schedule_builder.sql'),
    'utf8'
  ),
  readFile(
    resolve(
      projectRoot,
      'supabase/migrations/202607240005_classroom_builder_progress_state_guard.sql'
    ),
    'utf8'
  )
])

assert.match(tracksSource, /"taxonomySlug": "mathematics"/)
assert.match(tracksSource, /"taxonomySlug": "algebra-1"/)
assert.match(tracksSource, /"sourceContentVersionKey": "sha256:[a-f0-9]{64}"/)
assert.match(builderSource, /activeVersionId = result\.publishedVersionId/)
assert.doesNotMatch(builderSource, /result\.activeScheduleVersionId/)
assert.match(builderSource, /Classroom content .* active Version/)
assert.match(builderSource, /Current eligible Sessions are preselected/)
assert.match(builderSource, /Add content from another Track/)
assert.match(builderSource, /showStep\("session"\)/)
assert.match(scopeMigration, /'isStudied'/)
assert.match(scopeMigration, /'courseScopeLocked', true/)
assert.match(scopeMigration, /A Classroom Schedule must use exactly its Course content\./)
assert.match(
  progressGuardMigration,
  /item\.item_state in \('scheduled', 'requeued'\)/
)
assert.match(progressGuardMigration, /else false/)

const publication = createBuilderCoursePublication({
  today: '2026-07-23',
  course: {
    subject: { slug: 'mathematics' },
    focus: {
      id: '10000000-0000-4000-8000-000000000022',
      slug: 'algebra-1'
    }
  },
  activeItems: [{
    stableItemKey: 'historical-item',
    title: 'Historical item',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-07-22',
    endDate: '2026-07-22',
    position: 0,
    state: 'scheduled'
  }, {
    stableItemKey: 'future-placeholder',
    title: 'Future placeholder',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-07-29',
    endDate: '2026-07-29',
    position: 1,
    state: 'scheduled'
  }],
  schedule: {
    schemaVersion: 1,
    id: 'schedule-algebra-1',
    name: 'Algebra 1 Track schedule',
    timeZone: 'Asia/Bangkok',
    context: {
      subjectTaxonomySlug: 'mathematics',
      trackIds: ['builtin-track-algebra-1'],
      trackTaxonomySlugs: ['algebra-1']
    },
    sessions: [{
      id: 'schedule-algebra-1-session-1',
      title: 'Variables and expressions',
      type: 'lesson',
      startDate: '2026-08-05',
      endDate: '2026-08-05',
      sourceSessionId: 'builtin-session-algebra-1',
      sourceContentVersionKey: `sha256:${'a'.repeat(64)}`,
      trackId: 'builtin-track-algebra-1',
      moduleId: 'builtin-module-algebra-foundations',
      moduleTitle: 'Module 1: Algebraic Foundations',
      difficulty: 'medium',
      planningHref: '../schedules/algebra-1/session-1.html',
      resources: []
    }]
  }
})

assert.equal(publication.items.length, 3)
assert.equal(
  publication.items.find((item) => item.stableItemKey === 'schedule-algebra-1-session-1')
    .sourceModuleTitle,
  'Module 1: Algebraic Foundations'
)
assert.equal(publication.items[0].state, 'scheduled', 'Past history must remain present.')
assert.equal(publication.items[1].state, 'dropped', 'Missing future placeholders become explicit drops.')
assert.equal(publication.items[2].sourceSubjectSlug, 'mathematics')
assert.equal(publication.items[2].sourceTrackSlug, 'algebra-1')
assert.equal(publication.items[2].sourceContentVersionKey, `sha256:${'a'.repeat(64)}`)
assert.deepEqual(
  publication.changeReasons.map((reason) => reason.changeType),
  ['dropped', 'included']
)

const restoration = createBuilderCoursePublication({
  today: '2026-07-23',
  course: {
    subject: { slug: 'mathematics' },
    focus: {
      id: '10000000-0000-4000-8000-000000000022',
      slug: 'algebra-1'
    }
  },
  activeItems: [{
    stableItemKey: 'current-builder-session',
    title: 'Current Builder topic',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-07-29',
    endDate: '2026-07-29',
    position: 0,
    state: 'scheduled',
    sourceSnapshot: {
      sourceContentVersionKey: `sha256:${'b'.repeat(64)}`
    }
  }, {
    stableItemKey: 'restored-builder-session',
    title: 'Restored Builder topic',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-08-01',
    endDate: '2026-08-01',
    position: 1,
    state: 'dropped',
    sourceSnapshot: {
      sourceContentVersionKey: `sha256:${'c'.repeat(64)}`
    }
  }],
  schedule: {
    schemaVersion: 1,
    id: 'schedule-algebra-1-restoration',
    name: 'Algebra 1 restored Track schedule',
    timeZone: 'Asia/Bangkok',
    context: {
      subjectTaxonomySlug: 'mathematics',
      trackIds: ['builtin-track-algebra-1'],
      trackTaxonomySlugs: ['algebra-1']
    },
    sessions: [{
      id: 'restored-builder-session',
      title: 'Restored Builder topic',
      type: 'lesson',
      startDate: '2026-08-05',
      endDate: '2026-08-05',
      sourceSessionId: 'builtin-session-algebra-1-restored',
      sourceContentVersionKey: `sha256:${'c'.repeat(64)}`,
      trackId: 'builtin-track-algebra-1',
      moduleId: 'builtin-module-algebra-foundations',
      difficulty: 'medium',
      resources: []
    }]
  }
})

assert.equal(
  restoration.items.find((item) => item.stableItemKey === 'current-builder-session').state,
  'dropped',
  'The replaced active Builder Session must become explicit history.'
)
const restored = restoration.items.find((item) => item.stableItemKey === 'restored-builder-session')
assert.equal(restored.state, 'scheduled', 'A desired dropped Builder Session must be restored.')
assert.equal(restored.scheduledDate, '2026-08-05', 'Restoration must use the current Builder date.')
assert.deepEqual(
  restoration.changeReasons.map((reason) => reason.changeType),
  ['dropped', 'restored']
)

const studiedReplacement = createBuilderCoursePublication({
  today: '2026-07-24',
  course: {
    subject: { slug: 'mathematics' },
    focus: {
      id: '10000000-0000-4000-8000-000000000022',
      slug: 'algebra-1'
    }
  },
  activeItems: [{
    stableItemKey: 'completed-session',
    title: 'Completed linear equations',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-07-29',
    endDate: '2026-07-29',
    position: 0,
    state: 'scheduled',
    isStudied: true,
    sourceSnapshot: {
      sourceContentVersionKey: `sha256:${'d'.repeat(64)}`
    }
  }, {
    stableItemKey: 'future-session',
    title: 'Future equations',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-08-05',
    endDate: '2026-08-05',
    position: 1,
    state: 'scheduled',
    sourceSnapshot: {
      sourceContentVersionKey: `sha256:${'e'.repeat(64)}`
    }
  }],
  schedule: {
    id: 'replacement-schedule',
    name: 'Replacement Algebra 1 plan',
    startDate: '2026-08-12',
    timeZone: 'America/Sao_Paulo',
    context: {
      subjectTaxonomySlug: 'mathematics',
      trackIds: ['builtin-track-algebra-1'],
      trackTaxonomySlugs: ['algebra-1']
    },
    sessions: [{
      id: 'replacement-session',
      title: 'Replacement inequalities',
      type: 'lesson',
      startDate: '2026-08-12',
      endDate: '2026-08-12',
      sourceSessionId: 'builtin-session-replacement',
      sourceContentVersionKey: `sha256:${'f'.repeat(64)}`,
      trackId: 'builtin-track-algebra-1',
      moduleId: 'builtin-module-linear-modeling',
      moduleTitle: 'Module 1: Linear Modeling',
      difficulty: 'medium',
      resources: []
    }]
  }
})

const retainedStudied = studiedReplacement.items.find(
  (item) => item.stableItemKey === 'completed-session'
)
assert.deepEqual(
  {
    scheduledDate: retainedStudied.scheduledDate,
    endDate: retainedStudied.endDate,
    position: retainedStudied.position,
    state: retainedStudied.state
  },
  {
    scheduledDate: '2026-07-29',
    endDate: '2026-07-29',
    position: 0,
    state: 'scheduled'
  },
  'A replacement must retain the exact Studied successor snapshot.'
)
assert.equal(
  studiedReplacement.items.find((item) => item.stableItemKey === 'future-session').state,
  'dropped',
  'A replacement must drop only the eligible future plan.'
)
assert.equal(
  studiedReplacement.items.find((item) => item.stableItemKey === 'replacement-session').state,
  'scheduled'
)
assert.equal(
  studiedReplacement.builderSchedule.startDate,
  '2026-08-12',
  'A replacement publication must retain the newly chosen active-plan start date.'
)
assert.equal('isStudied' in retainedStudied, false, 'Internal lock metadata must not enter publication JSON.')
assert.deepEqual(
  studiedReplacement.changeReasons.map((reason) => reason.changeType),
  ['dropped', 'included']
)

const practicedReplacement = createBuilderCoursePublication({
  today: '2026-07-24',
  course: {
    subject: { slug: 'mathematics' },
    focus: {
      id: '10000000-0000-4000-8000-000000000022',
      slug: 'algebra-1'
    }
  },
  activeItems: [{
    stableItemKey: 'practiced-session',
    title: 'Practiced linear equations',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-07-30',
    endDate: '2026-07-30',
    position: 0,
    state: 'scheduled',
    isPracticed: true,
    sourceSnapshot: {
      sourceContentVersionKey: `sha256:${'1'.repeat(64)}`
    }
  }],
  schedule: studiedReplacement.builderSchedule
})
const retainedPracticed = practicedReplacement.items.find(
  (item) => item.stableItemKey === 'practiced-session'
)
assert.deepEqual(
  {
    scheduledDate: retainedPracticed.scheduledDate,
    endDate: retainedPracticed.endDate,
    position: retainedPracticed.position,
    state: retainedPracticed.state
  },
  {
    scheduledDate: '2026-07-30',
    endDate: '2026-07-30',
    position: 1,
    state: 'scheduled'
  },
  'A continuing revision must retain the Practiced item even when it is absent from the edited selection.'
)
assert.equal(
  'isPracticed' in retainedPracticed,
  false,
  'Internal Practiced lock metadata must not enter publication JSON.'
)

const practicedContinuation = createBuilderCoursePublication({
  today: '2026-07-24',
  studentExplanation:
    'The future lesson dates now follow the Student selected meeting weekdays.',
  course: {
    subject: { slug: 'mathematics' },
    focus: {
      id: '10000000-0000-4000-8000-000000000022',
      slug: 'algebra-1'
    }
  },
  activeItems: [{
    stableItemKey: 'practiced-session',
    title: 'Practiced linear equations',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-07-30',
    endDate: '2026-07-30',
    position: 0,
    state: 'scheduled',
    isPracticed: true,
    sourceSnapshot: {
      sourceContentVersionKey: `sha256:${'1'.repeat(64)}`
    }
  }],
  schedule: {
    ...studiedReplacement.builderSchedule,
    sessions: [{
      ...studiedReplacement.builderSchedule.sessions[0],
      id: 'practiced-session',
      title: 'Practiced linear equations',
      startDate: '2026-08-03',
      endDate: '2026-08-03'
    }]
  }
})
assert.deepEqual(
  practicedContinuation.items.map((item) => ({
    stableItemKey: item.stableItemKey,
    scheduledDate: item.scheduledDate,
    position: item.position,
    state: item.state
  })),
  [{
    stableItemKey: 'practiced-session',
    scheduledDate: '2026-08-03',
    position: 0,
    state: 'scheduled'
  }],
  'A retained future Practiced Session may move with a continuing cadence.'
)
assert.deepEqual(
  practicedContinuation.changeReasons.map((reason) => reason.changeType),
  ['reordered']
)

assert.deepEqual(
  normalizeCourseScheduleCadence({
    type: 'weekly_meeting_pattern',
    weekdays: [5, 1, 3, 1],
    meetingPatternCount: 3
  }),
  { type: 'weekly_frequency', weekdays: [1, 3, 5] },
  'A retained meeting-pattern Version must preload its selected weekdays.'
)
assert.deepEqual(
  normalizeCourseScheduleCadence({ frequency: 'weekly' }),
  { type: 'day_interval', intervalDays: 7 },
  'A legacy weekly cadence must remain a weekly interval when weekdays were not recorded.'
)

const deliveredReplacement = createBuilderCoursePublication({
  today: '2026-07-24',
  course: {
    subject: { slug: 'mathematics' },
    focus: {
      id: '10000000-0000-4000-8000-000000000022',
      slug: 'algebra-1'
    }
  },
  activeItems: [{
    stableItemKey: 'delivered-session',
    title: 'Delivered linear equations',
    kind: 'curriculum_topic',
    curriculumNodeId: '10000000-0000-4000-8000-000000000022',
    scheduledDate: '2026-07-30',
    endDate: '2026-07-30',
    position: 0,
    state: 'scheduled',
    isDelivered: true,
    sourceSnapshot: {
      sourceContentVersionKey: `sha256:${'2'.repeat(64)}`
    }
  }],
  schedule: studiedReplacement.builderSchedule
})
const retainedDelivered = deliveredReplacement.items.find(
  (item) => item.stableItemKey === 'delivered-session'
)
assert.deepEqual(
  {
    scheduledDate: retainedDelivered.scheduledDate,
    endDate: retainedDelivered.endDate,
    position: retainedDelivered.position,
    state: retainedDelivered.state
  },
  {
    scheduledDate: '2026-07-30',
    endDate: '2026-07-30',
    position: 1,
    state: 'scheduled'
  },
  'A delivered occurrence keeps its unfinished target in the continuation without freezing its future position.'
)
assert.equal(
  'isDelivered' in retainedDelivered,
  false,
  'Internal delivered lock metadata must not enter publication JSON.'
)

const continuedDates = reconcileContinuingScheduleDates({
  today: '2026-07-30',
  lockedStartDate: '2026-07-02',
  activeItems: [{
    stableItemKey: 'past-session',
    title: 'Past Session',
    kind: 'curriculum_topic',
    scheduledDate: '2026-07-23',
    endDate: '2026-07-23',
    position: 0,
    state: 'scheduled'
  }, {
    stableItemKey: 'delivered-future-session',
    title: 'Delivered future Session',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-06',
    endDate: '2026-08-06',
    position: 1,
    state: 'scheduled',
    isDelivered: true
  }, {
    stableItemKey: 'practiced-future-session',
    title: 'Practiced future Session',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-13',
    endDate: '2026-08-13',
    position: 2,
    state: 'scheduled',
    isPracticed: true
  }, {
    stableItemKey: 'flexible-future-session',
    title: 'Flexible future Session',
    kind: 'curriculum_topic',
    scheduledDate: '2026-08-20',
    endDate: '2026-08-20',
    position: 3,
    state: 'scheduled'
  }],
  schedule: {
    id: 'continued-cadence',
    name: 'Continued cadence',
    startDate: '2026-07-02',
    endDate: '2026-08-13',
    timeZone: 'America/Sao_Paulo',
    cadence: { type: 'weekly_frequency', weekdays: [2, 4] },
    context: {},
    sessions: [{
      id: 'past-session',
      title: 'Past Session',
      startDate: '2026-07-07',
      endDate: '2026-07-07'
    }, {
      id: 'delivered-future-session',
      title: 'Delivered future Session',
      startDate: '2026-07-09',
      endDate: '2026-07-09'
    }, {
      id: 'practiced-future-session',
      title: 'Practiced future Session',
      startDate: '2026-07-14',
      endDate: '2026-07-14'
    }, {
      id: 'flexible-future-session',
      title: 'Flexible future Session',
      startDate: '2026-07-16',
      endDate: '2026-07-16'
    }]
  }
})
assert.equal(continuedDates.startDate, '2026-07-02')
assert.deepEqual(
  continuedDates.sessions.map((session) => session.startDate),
  ['2026-07-30', '2026-08-04', '2026-08-06', '2026-08-11'],
  'Only Studied curriculum dates stay fixed; every unfinished target returns to the shared future lane.'
)
assert.equal(continuedDates.context.historicalDatesFrozen, true)

const crossSubjectPublication = createBuilderCoursePublication({
  course: {
    subject: { slug: 'physics' },
    focus: {
      id: '10000000-0000-4000-8000-000000000032',
      slug: 'mechanics'
    }
  },
  activeItems: [],
  schedule: {
    id: 'wrong-subject',
    name: 'Wrong Subject',
    timeZone: 'UTC',
    context: {
      subjectTaxonomySlug: 'mathematics',
      trackTaxonomySlugs: ['algebra-1']
    },
    sessions: publication.builderSchedule.sessions
  }
})
const crossSubjectItem = crossSubjectPublication.items.find(
  (item) => item.stableItemKey === 'schedule-algebra-1-session-1'
)
assert.equal(
  crossSubjectItem.curriculumNodeId,
  null,
  'A supporting branch must be resolved to its canonical node by the governed server publisher.'
)
assert.equal(crossSubjectItem.sourceSubjectSlug, 'mathematics')
assert.equal(crossSubjectItem.sourceTrackSlug, 'algebra-1')

console.log('Schedule Builder to governed Course publication adapter contracts passed.')
