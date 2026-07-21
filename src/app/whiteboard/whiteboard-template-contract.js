function selectedIdSet(value) {
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return new Set(value);
  if (value && typeof value === "object") {
    return new Set(
      Object.entries(value)
        .filter(([, selected]) => Boolean(selected))
        .map(([elementId]) => elementId)
    );
  }
  return new Set();
}

export function resolveTemplateDeletionIds(elements, selectedElementIds) {
  const liveElements = Array.from(elements || []).filter((element) => !element?.isDeleted);
  const selectedIds = selectedIdSet(selectedElementIds);
  const elementsById = new Map(liveElements.map((element) => [element.id, element]));
  const frames = liveElements.filter((element) => element.type === "frame");
  const frameIds = new Set();

  selectedIds.forEach((elementId) => {
    const element = elementsById.get(elementId);
    if (!element) return;
    if (element.type === "frame") frameIds.add(element.id);
    const ownerFrameId = element.customData?.kelpFrameBackgroundFor?.frameId;
    if (ownerFrameId) frameIds.add(ownerFrameId);
  });

  frames.forEach((frame) => {
    if (frameIds.has(frame.id)) return;
    const selectableChildren = liveElements.filter((element) => (
      element.frameId === frame.id && !element.locked
    ));
    if (selectableChildren.length >= 2 && selectableChildren.every((element) => selectedIds.has(element.id))) {
      frameIds.add(frame.id);
    }
  });

  const deletionIds = new Set(selectedIds);
  frameIds.forEach((frameId) => {
    deletionIds.add(frameId);
    const frame = elementsById.get(frameId);
    const metadataBackgroundId = frame?.customData?.kelpFrameBackground?.elementId;
    if (metadataBackgroundId) deletionIds.add(metadataBackgroundId);

    liveElements.forEach((element) => {
      if (element.frameId === frameId) deletionIds.add(element.id);
      if (element.customData?.kelpFrameBackgroundFor?.frameId === frameId) {
        deletionIds.add(element.id);
      }
    });
  });

  return deletionIds;
}

export function removeDeletedElementBindings(element, deletionIds) {
  const deleted = deletionIds instanceof Set ? deletionIds : selectedIdSet(deletionIds);
  let changed = false;
  let next = element;

  if (Array.isArray(element.boundElements)) {
    const boundElements = element.boundElements.filter((binding) => !deleted.has(binding.id));
    if (boundElements.length !== element.boundElements.length) {
      next = { ...next, boundElements: boundElements.length ? boundElements : null };
      changed = true;
    }
  }

  if (element.startBinding?.elementId && deleted.has(element.startBinding.elementId)) {
    next = { ...next, startBinding: null };
    changed = true;
  }
  if (element.endBinding?.elementId && deleted.has(element.endBinding.elementId)) {
    next = { ...next, endBinding: null };
    changed = true;
  }
  if (element.containerId && deleted.has(element.containerId)) {
    next = { ...next, containerId: null };
    changed = true;
  }

  return changed ? next : element;
}
