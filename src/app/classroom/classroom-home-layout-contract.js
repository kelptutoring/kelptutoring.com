export const CLASSROOM_HOME_BLOCK_KEYS = Object.freeze([
  'progress',
  'this-week',
  'coming-next',
  'calendar'
])

export const CLASSROOM_HOME_WEEKLY_BLOCK_KEYS = Object.freeze([
  'this-week',
  'coming-next'
])
export const CLASSROOM_HOME_WEEKLY_GROUP_KEY = 'weekly'

export function placeClassroomHomeHelper({
  viewport,
  anchor,
  panel,
  align = 'end',
  margin = 16,
  gap = 8
} = {}) {
  const viewportLeft = Number(viewport?.left) || 0
  const viewportTop = Number(viewport?.top) || 0
  const viewportWidth = Math.max(0, Number(viewport?.width) || 0)
  const viewportHeight = Math.max(0, Number(viewport?.height) || 0)
  const viewportRight = viewportLeft + viewportWidth
  const viewportBottom = viewportTop + viewportHeight
  const safeMargin = Math.max(0, Number(margin) || 0)
  const safeGap = Math.max(0, Number(gap) || 0)
  const panelWidth = Math.min(
    Math.max(0, Number(panel?.width) || 0),
    Math.max(0, viewportWidth - (safeMargin * 2))
  )
  const panelHeight = Math.max(0, Number(panel?.height) || 0)
  const anchorLeft = Number(anchor?.left) || 0
  const anchorRight = Number(anchor?.right) || anchorLeft
  const anchorTop = Number(anchor?.top) || 0
  const anchorBottom = Number(anchor?.bottom) || anchorTop
  const preferredLeft = align === 'start'
    ? anchorLeft
    : anchorRight - panelWidth
  const left = Math.max(
    viewportLeft + safeMargin,
    Math.min(preferredLeft, viewportRight - safeMargin - panelWidth)
  )
  const spaceAbove = Math.max(
    0,
    anchorTop - viewportTop - safeMargin - safeGap
  )
  const spaceBelow = Math.max(
    0,
    viewportBottom - anchorBottom - safeMargin - safeGap
  )
  const placement = panelHeight <= spaceAbove || spaceAbove >= spaceBelow
    ? 'above'
    : 'below'
  const maxHeight = placement === 'above' ? spaceAbove : spaceBelow
  const visiblePanelHeight = Math.min(panelHeight, maxHeight)
  const preferredTop = placement === 'above'
    ? anchorTop - safeGap - visiblePanelHeight
    : anchorBottom + safeGap
  const top = Math.max(
    viewportTop + safeMargin,
    Math.min(
      preferredTop,
      viewportBottom - safeMargin - visiblePanelHeight
    )
  )
  return Object.freeze({
    left,
    top,
    maxHeight,
    placement
  })
}

export function normalizeClassroomHomeLayoutPayload(payload = {}) {
  return {
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    classroomId: String(payload?.classroomId || ''),
    blockOrder: normalizeClassroomHomeBlockOrder(payload?.blockOrder),
    collapsedBlocks: normalizeCollapsedClassroomHomeBlocks(payload?.collapsedBlocks),
    revision: Math.max(1, Number(payload?.revision) || 1),
    updatedAt: payload?.updatedAt || null
  }
}

export function normalizeClassroomHomeBlockOrder(value) {
  const requested = Array.isArray(value)
    ? value.map((key) => String(key || '').trim()).filter(Boolean)
    : []
  const unique = [...new Set(requested)]
    .filter((key) => CLASSROOM_HOME_BLOCK_KEYS.includes(key))
  const complete = [
    ...unique,
    ...CLASSROOM_HOME_BLOCK_KEYS.filter((key) => !unique.includes(key))
  ]
  const firstWeeklyIndex = Math.min(
    ...CLASSROOM_HOME_WEEKLY_BLOCK_KEYS.map((key) => complete.indexOf(key))
  )
  const weeklyInsertIndex = complete
    .slice(0, firstWeeklyIndex)
    .filter((key) => !CLASSROOM_HOME_WEEKLY_BLOCK_KEYS.includes(key))
    .length
  const normalized = complete.filter(
    (key) => !CLASSROOM_HOME_WEEKLY_BLOCK_KEYS.includes(key)
  )
  normalized.splice(weeklyInsertIndex, 0, ...CLASSROOM_HOME_WEEKLY_BLOCK_KEYS)
  return normalized
}

export function normalizeCollapsedClassroomHomeBlocks(value) {
  if (!Array.isArray(value)) return []
  const collapsed = [...new Set(
    value
      .map((key) => String(key || '').trim())
      .filter((key) => CLASSROOM_HOME_BLOCK_KEYS.includes(key))
  )]
  if (collapsed.some((key) => CLASSROOM_HOME_WEEKLY_BLOCK_KEYS.includes(key))) {
    collapsed.push(
      ...CLASSROOM_HOME_WEEKLY_BLOCK_KEYS.filter((key) => !collapsed.includes(key))
    )
  }
  return CLASSROOM_HOME_BLOCK_KEYS.filter((key) => collapsed.includes(key))
}

export function classroomHomeBlockGroupKeys(blockKey) {
  const normalized = String(blockKey || '')
  return (
    normalized === CLASSROOM_HOME_WEEKLY_GROUP_KEY
    || CLASSROOM_HOME_WEEKLY_BLOCK_KEYS.includes(normalized)
  )
    ? [...CLASSROOM_HOME_WEEKLY_BLOCK_KEYS]
    : CLASSROOM_HOME_BLOCK_KEYS.includes(normalized)
      ? [normalized]
      : []
}

export function toggleClassroomHomeBlockCollapsed(value, blockKey) {
  const collapsed = normalizeCollapsedClassroomHomeBlocks(value)
  const groupKeys = classroomHomeBlockGroupKeys(blockKey)
  const groupIsCollapsed = groupKeys.every((key) => collapsed.includes(key))
  return normalizeCollapsedClassroomHomeBlocks(
    groupIsCollapsed
      ? collapsed.filter((key) => !groupKeys.includes(key))
      : [...collapsed, ...groupKeys]
  )
}

export function moveClassroomHomeBlock(order, blockKey, direction) {
  const normalized = normalizeClassroomHomeBlockOrder(order)
  const groups = classroomHomeBlockGroups(normalized)
  const index = groups.findIndex((group) => group.includes(String(blockKey || '')))
  const amount = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
  const targetIndex = index + amount
  if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) return normalized
  const next = [...groups]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next.flat()
}

export function placeClassroomHomeBlockAtTarget(order, movingKey, targetKey) {
  const normalized = normalizeClassroomHomeBlockOrder(order)
  const groups = classroomHomeBlockGroups(normalized)
  const moving = String(movingKey || '')
  const target = String(targetKey || '')
  const movingIndex = groups.findIndex((group) => group.includes(moving))
  const targetIndex = groups.findIndex((group) => group.includes(target))
  if (movingIndex < 0 || targetIndex < 0 || movingIndex === targetIndex) {
    return normalized
  }
  const next = [...groups]
  const [movingGroup] = next.splice(movingIndex, 1)
  const nextTargetIndex = next.findIndex((group) => group.includes(target))
  next.splice(nextTargetIndex, 0, movingGroup)
  return next.flat()
}

function classroomHomeBlockGroups(order) {
  const groups = []
  order.forEach((key) => {
    if (CLASSROOM_HOME_WEEKLY_BLOCK_KEYS.includes(key)) {
      if (!groups.some((group) =>
        group.includes(CLASSROOM_HOME_WEEKLY_BLOCK_KEYS[0])
      )) {
        groups.push([...CLASSROOM_HOME_WEEKLY_BLOCK_KEYS])
      }
      return
    }
    groups.push([key])
  })
  return groups
}
