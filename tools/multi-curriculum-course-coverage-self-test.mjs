import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COURSE_COVERAGE_POLICY,
  CURRICULUM_PATH_ORDER,
  assertUniqueActiveCurriculumTargets,
  createCourseCoverageContract,
  createCurriculumTargetSnapshot,
  createSupplementalItemContext
} from '../src/app/schedule-generator/multi-curriculum-coverage-contract.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [plan, productContract, scheduleContract, builderGuide] = await Promise.all([
  readFile(resolve(projectRoot, 'IMPLEMENTATION_PLAN.md'), 'utf8'),
  readFile(resolve(projectRoot, 'docs/product/product-contract.md'), 'utf8'),
  readFile(resolve(projectRoot, 'docs/schedule-data-contract.md'), 'utf8'),
  readFile(resolve(projectRoot, 'src/app/schedule-generator/README.md'), 'utf8')
])

const coverage = createCourseCoverageContract({
  primaryTrackKey: 'track-mechanics',
  branches: [{
    educationLevel: {
      id: 'level-high-school',
      name: 'High School',
      slug: 'high-school'
    },
    goals: [{
      id: 'goal-ap',
      name: 'AP',
      slug: 'ap'
    }, {
      id: 'goal-sat',
      name: 'SAT',
      slug: 'sat'
    }],
    subject: {
      id: 'subject-physics',
      name: 'Physics',
      slug: 'physics'
    },
    track: {
      id: 'track-mechanics',
      name: 'Mechanics',
      slug: 'mechanics'
    }
  }, {
    educationLevel: {
      id: 'level-high-school',
      name: 'High School',
      slug: 'high-school'
    },
    goals: [{
      id: 'goal-ap',
      name: 'AP',
      slug: 'ap'
    }],
    subject: {
      id: 'subject-mathematics',
      name: 'Mathematics',
      slug: 'mathematics'
    },
    track: {
      id: 'track-algebra-1',
      name: 'Algebra 1',
      slug: 'algebra-1'
    }
  }]
})

assert.equal(coverage.branches.length, 2)
assert.equal(coverage.branches[0].role, 'primary')
assert.equal(coverage.branches[1].role, 'supporting')
assert.equal(
  coverage.displayLabel,
  'High School · AP + SAT · Physics + Mathematics'
)
assert.doesNotMatch(coverage.displayLabel, /ACT|IB/)
assert.deepEqual(CURRICULUM_PATH_ORDER, [
  'educationLevel',
  'goals',
  'subject',
  'track',
  'module',
  'session'
])

assert.equal(COURSE_COVERAGE_POLICY.requiredSchedule, true)
assert.equal(COURSE_COVERAGE_POLICY.oneActiveSchedule, true)
assert.equal(COURSE_COVERAGE_POLICY.multipleSubjectsAllowed, true)
assert.equal(COURSE_COVERAGE_POLICY.multipleTracksAllowed, true)
assert.equal(COURSE_COVERAGE_POLICY.selectedGoalsOnly, true)
assert.equal(COURSE_COVERAGE_POLICY.tutorQualificationRequiredForEveryBranch, true)
assert.equal(COURSE_COVERAGE_POLICY.mentorQualificationRequiredForSupervision, false)
assert.equal(COURSE_COVERAGE_POLICY.mentorTeachingRequiresQualification, true)
assert.equal(COURSE_COVERAGE_POLICY.qualityAssistantTeachingAuthority, false)

const algebraTarget = createCurriculumTargetSnapshot({
  canonicalSessionKey: 'session-linear-equations',
  sourceContentVersionKey: `sha256:${'a'.repeat(64)}`,
  educationLevel: {
    id: 'level-high-school',
    name: 'High School',
    slug: 'high-school'
  },
  goals: [{
    id: 'goal-sat',
    name: 'SAT',
    slug: 'sat'
  }],
  subject: {
    id: 'subject-mathematics',
    name: 'Mathematics',
    slug: 'mathematics'
  },
  track: {
    id: 'track-algebra-1',
    name: 'Algebra 1',
    slug: 'algebra-1'
  },
  module: {
    id: 'module-linear-modeling',
    name: 'Linear Modeling',
    slug: 'linear-modeling'
  },
  session: {
    id: 'session-linear-equations',
    name: 'Linear equations',
    slug: 'linear-equations'
  }
})

assert.equal(algebraTarget.path.subject.name, 'Mathematics')
assert.deepEqual(
  algebraTarget.path.goals.map((goal) => goal.name),
  ['SAT']
)
assertUniqueActiveCurriculumTargets([algebraTarget])

assert.throws(
  () => assertUniqueActiveCurriculumTargets([algebraTarget, algebraTarget]),
  /only once as an active curriculum target/
)

assert.deepEqual(createSupplementalItemContext({
  kind: 'review',
  scope: 'branch',
  trackKey: 'track-algebra-1',
  canonicalSessionKey: algebraTarget.canonicalSessionKey
}), {
  kind: 'review',
  scope: 'branch',
  trackKey: 'track-algebra-1',
  canonicalSessionKey: 'session-linear-equations'
})

assert.deepEqual(createSupplementalItemContext({
  kind: 'exam',
  scope: 'course'
}), {
  kind: 'exam',
  scope: 'course',
  trackKey: null,
  canonicalSessionKey: null
})

assert.throws(
  () => createSupplementalItemContext({
    kind: 'curriculum_topic',
    scope: 'branch',
    trackKey: 'track-algebra-1'
  }),
  /must be a Review, Practice, Exam, or wrap-up/
)

assert.throws(
  () => createCourseCoverageContract({
    primaryTrackKey: 'track-mechanics',
    branches: [coverage.branches[0], coverage.branches[0]]
  }),
  /canonical Track may appear only once/
)

assert.match(plan, /5\.G\.2\.4\.1 — Vocabulary and coverage contract: Complete/i)
assert.match(plan, /one required active Schedule/i)
assert.match(plan, /another tutoring occurrence/i)
assert.match(productContract, /\*\*Academic pathway\*\* is optional Track metadata/i)
assert.match(productContract, /only\s+the pathways\s+selected/i)
assert.match(productContract, /another Class occurrence/i)
assert.match(scheduleContract, /Multi-curriculum Course coverage/i)
assert.match(scheduleContract, /canonical Session/i)
assert.match(builderGuide, /Phase 5\.G\.2\.4\.1/)

console.log(
  'Phase 5.G.2.4.1 multi-curriculum vocabulary, selected-pathway, authority, target, and occurrence contracts passed.'
)
