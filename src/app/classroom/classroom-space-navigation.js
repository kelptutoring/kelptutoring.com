const AREA_DEFINITIONS = [
  {
    key: 'home',
    label: 'Home',
    availability: 'available',
    title: 'Home',
    description: 'Your current Track progress and daily Classroom priorities.'
  },
  {
    key: 'overview',
    label: 'Overview',
    availability: 'available',
    title: 'Overview',
    description: 'Course details, Classroom team, and the current linked Schedule.'
  },
  {
    key: 'forum',
    label: 'Forum',
    availability: 'planned',
    title: 'Forum is not available yet',
    description: 'Course conversations, announcements, and threaded replies will live here.',
    owningPhase: 'Phase 7'
  },
  {
    key: 'assignments',
    label: 'Assignments',
    availability: 'planned',
    title: 'Assignments are not available yet',
    description: 'Tasks, submissions, feedback, deadlines, and grades will live here.',
    owningPhase: 'Phase 14'
  },
  {
    key: 'schedule',
    label: 'Schedule',
    availability: 'available',
    title: 'Schedule',
    description: 'The active Course plan and its assigned learning resources.'
  },
  {
    key: 'files',
    label: 'Files',
    availability: 'available',
    title: 'Files',
    description: 'Private Course material, previews, downloads, and retained shared files.'
  },
  {
    key: 'report-cards',
    label: 'Report cards',
    availability: 'planned',
    title: 'Report cards are not available yet',
    description: 'Monthly and final downloadable Course reports will live here.',
    owningPhase: 'Phase 13'
  },
  {
    key: 'history',
    label: 'History',
    availability: 'available',
    title: 'History',
    description: 'Completed work from previous Course Schedules.'
  }
]

export const CLASSROOM_AREAS = Object.freeze(
  AREA_DEFINITIONS.map((area) => Object.freeze({ ...area }))
)

const AREA_BY_KEY = new Map(CLASSROOM_AREAS.map((area) => [area.key, area]))

export function normalizeClassroomArea(value) {
  const key = String(value || '').trim().toLowerCase()
  return AREA_BY_KEY.has(key) ? key : 'home'
}

export function getClassroomArea(value) {
  return AREA_BY_KEY.get(normalizeClassroomArea(value))
}

export function classroomAreaHref(currentHref, requestedArea) {
  const url = new URL(currentHref)
  const area = normalizeClassroomArea(requestedArea)
  if (area === 'home') url.searchParams.delete('area')
  else url.searchParams.set('area', area)
  url.hash = ''
  return url.toString()
}
