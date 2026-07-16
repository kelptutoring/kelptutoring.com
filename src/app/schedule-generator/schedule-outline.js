(function initializeScheduleOutline(globalObject) {
  "use strict";

  function stripModuleNumber(title) {
    return String(title || "Custom sessions")
      .replace(/^Module\s+\d+\s*:\s*/i, "")
      .trim() || "Untitled module";
  }

  function slugify(value) {
    return String(value || "track")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "track";
  }

  function getPlanKey(plan) {
    if (plan.builderItemId) return String(plan.builderItemId);
    if (plan.sourceSessionId) return `source:${plan.sourceSessionId}`;
    if (plan.clientId) return `custom:${plan.clientId}`;
    return `session:${slugify(plan.title)}:${slugify(plan.trackId)}`;
  }

  function getCustomModuleId(plan) {
    return `custom_module_${slugify(plan.trackId || plan.trackTitle)}`;
  }

  function createModuleItem(plan, moduleId = plan.moduleId || getCustomModuleId(plan)) {
    return {
      kind: "module",
      key: `module:${moduleId}`,
      moduleId,
      sourceModuleId: plan.moduleId || null,
      trackId: plan.trackId || null,
      trackTitle: plan.trackTitle || "",
      title: stripModuleNumber(plan.moduleTitle),
      collapsed: false
    };
  }

  function createSessionItem(plan) {
    const key = getPlanKey(plan);
    return {
      kind: "session",
      key,
      plan: { ...plan, builderItemId: key }
    };
  }

  function normalizeMembership(items) {
    let activeModule = null;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.kind === "module") {
        activeModule = item;
        continue;
      }
      if (item.kind !== "session") continue;

      if (!activeModule) {
        activeModule = createModuleItem(item.plan);
        items.splice(index, 0, activeModule);
        index += 1;
      }

      item.plan.moduleId = activeModule.moduleId;
      item.plan.moduleTitle = activeModule.title;
      item.plan.trackId = activeModule.trackId || item.plan.trackId || null;
      item.plan.trackTitle = activeModule.trackTitle || item.plan.trackTitle || "";
    }

    return items;
  }

  function createOutline(plans) {
    const items = [];
    const modulesById = new Map();
    let activeModule = null;

    (plans || []).forEach((plan) => {
      const sourceModuleId = plan.moduleId || null;
      if (sourceModuleId) {
        if (!modulesById.has(sourceModuleId)) {
          const moduleItem = createModuleItem(plan, sourceModuleId);
          modulesById.set(sourceModuleId, moduleItem);
          items.push(moduleItem);
        }
        activeModule = modulesById.get(sourceModuleId);
      } else if (!activeModule || activeModule.trackId !== plan.trackId) {
        const customModuleId = getCustomModuleId(plan);
        if (!modulesById.has(customModuleId)) {
          const moduleItem = createModuleItem(plan, customModuleId);
          modulesById.set(customModuleId, moduleItem);
          items.push(moduleItem);
        }
        activeModule = modulesById.get(customModuleId);
      }

      items.push(createSessionItem(plan));
    });

    return normalizeMembership(items);
  }

  function findModuleForPlan(items, plan) {
    if (plan.moduleId) {
      const exactModule = items.find((item) => {
        return item.kind === "module" && item.sourceModuleId === plan.moduleId;
      });
      if (exactModule) return exactModule;
    }

    const sameTrackModules = items.filter((item) => {
      return item.kind === "module" && item.trackId === plan.trackId;
    });
    return sameTrackModules[sameTrackModules.length - 1] || null;
  }

  function insertSessionInModule(items, moduleKey, sessionItem) {
    const moduleIndex = items.findIndex((item) => item.kind === "module" && item.key === moduleKey);
    if (moduleIndex < 0) {
      items.push(sessionItem);
      return;
    }

    let insertIndex = moduleIndex + 1;
    while (insertIndex < items.length && items[insertIndex].kind !== "module") {
      insertIndex += 1;
    }
    items.splice(insertIndex, 0, sessionItem);
  }

  function reconcileOutline(outlineItems, latestPlans) {
    if (!outlineItems?.length) return createOutline(latestPlans);

    const latestByKey = new Map((latestPlans || []).map((plan) => [getPlanKey(plan), plan]));
    const items = outlineItems
      .filter((item) => item.kind === "module" || latestByKey.has(item.key))
      .map((item) => {
        if (item.kind !== "session") return { ...item };
        const latest = latestByKey.get(item.key);
        return {
          ...item,
          plan: {
            ...latest,
            builderItemId: item.key,
            moduleId: item.plan.moduleId,
            moduleTitle: item.plan.moduleTitle,
            trackId: item.plan.trackId,
            trackTitle: item.plan.trackTitle
          }
        };
      });

    const existingSessionKeys = new Set(
      items.filter((item) => item.kind === "session").map((item) => item.key)
    );

    (latestPlans || []).forEach((plan) => {
      const key = getPlanKey(plan);
      if (existingSessionKeys.has(key)) return;

      let moduleItem = findModuleForPlan(items, plan);
      if (!moduleItem) {
        moduleItem = createModuleItem(plan);
        items.push(moduleItem);
      }
      insertSessionInModule(items, moduleItem.key, createSessionItem(plan));
      existingSessionKeys.add(key);
    });

    return normalizeMembership(items);
  }

  function moveSessionRelative(items, sourceKey, targetKey, position) {
    const sourceIndex = items.findIndex((item) => item.kind === "session" && item.key === sourceKey);
    if (sourceIndex < 0 || sourceKey === targetKey || !["before", "after"].includes(position)) return items;
    const [sessionItem] = items.splice(sourceIndex, 1);
    const targetIndex = items.findIndex((item) => item.key === targetKey);
    if (targetIndex < 0) {
      items.splice(sourceIndex, 0, sessionItem);
      return items;
    }
    items.splice(position === "before" ? targetIndex : targetIndex + 1, 0, sessionItem);
    return normalizeMembership(items);
  }

  function moveSessionAfter(items, sourceKey, targetKey) {
    return moveSessionRelative(items, sourceKey, targetKey, "after");
  }

  function moveSessionBefore(items, sourceKey, targetKey) {
    return moveSessionRelative(items, sourceKey, targetKey, "before");
  }

  function moveSessionByDirection(items, sessionKey, direction) {
    const index = items.findIndex((item) => item.kind === "session" && item.key === sessionKey);
    if (index < 0 || ![-1, 1].includes(direction)) return items;

    if (direction < 0) {
      if (index === 0) return items;
      if (items[index - 1].kind === "session") {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
      } else {
        const previousModuleIndex = items.slice(0, index - 1)
          .map((item, itemIndex) => ({ item, itemIndex }))
          .filter(({ item }) => item.kind === "module")
          .at(-1)?.itemIndex;
        if (previousModuleIndex === undefined) return items;
        const [sessionItem] = items.splice(index, 1);
        const currentModuleIndex = items.findIndex((item, itemIndex) => {
          return itemIndex > previousModuleIndex && item.kind === "module";
        });
        items.splice(currentModuleIndex, 0, sessionItem);
      }
    } else if (index < items.length - 1) {
      if (items[index + 1].kind === "session") {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
      } else {
        const [sessionItem] = items.splice(index, 1);
        const nextModuleIndex = items.findIndex((item, itemIndex) => {
          return itemIndex >= index && item.kind === "module";
        });
        if (nextModuleIndex < 0) {
          items.splice(index, 0, sessionItem);
          return items;
        }
        items.splice(nextModuleIndex + 1, 0, sessionItem);
      }
    }

    return normalizeMembership(items);
  }

  function getModuleBlockEnd(items, moduleIndex) {
    let endIndex = moduleIndex + 1;
    while (endIndex < items.length && items[endIndex].kind !== "module") endIndex += 1;
    return endIndex;
  }

  function moveModuleBlockRelative(items, sourceModuleKey, targetModuleKey, position) {
    if (!sourceModuleKey || sourceModuleKey === targetModuleKey) return items;
    if (!["before", "after"].includes(position)) return items;
    const sourceIndex = items.findIndex((item) => item.kind === "module" && item.key === sourceModuleKey);
    if (sourceIndex < 0) return items;
    const sourceEnd = getModuleBlockEnd(items, sourceIndex);
    const block = items.splice(sourceIndex, sourceEnd - sourceIndex);
    const targetIndex = items.findIndex((item) => item.kind === "module" && item.key === targetModuleKey);
    if (targetIndex < 0) {
      items.splice(sourceIndex, 0, ...block);
      return items;
    }
    const insertIndex = position === "before" ? targetIndex : getModuleBlockEnd(items, targetIndex);
    items.splice(insertIndex, 0, ...block);
    return normalizeMembership(items);
  }

  function moveModuleBlockAfter(items, sourceModuleKey, targetModuleKey) {
    return moveModuleBlockRelative(items, sourceModuleKey, targetModuleKey, "after");
  }

  function moveModuleBlockBefore(items, sourceModuleKey, targetModuleKey) {
    return moveModuleBlockRelative(items, sourceModuleKey, targetModuleKey, "before");
  }

  function moveModuleByDirection(items, moduleKey, direction) {
    if (![-1, 1].includes(direction)) return items;
    const moduleKeys = items
      .filter((item) => item.kind === "module")
      .map((item) => item.key);
    const modulePosition = moduleKeys.indexOf(moduleKey);
    if (modulePosition < 0) return items;

    if (direction < 0) {
      if (modulePosition === 0) return items;
      const sourceIndex = items.findIndex((item) => item.kind === "module" && item.key === moduleKey);
      const sourceEnd = getModuleBlockEnd(items, sourceIndex);
      const block = items.splice(sourceIndex, sourceEnd - sourceIndex);
      const previousIndex = items.findIndex((item) => {
        return item.kind === "module" && item.key === moduleKeys[modulePosition - 1];
      });
      items.splice(previousIndex, 0, ...block);
      return normalizeMembership(items);
    }

    if (modulePosition === moduleKeys.length - 1) return items;
    return moveModuleBlockAfter(items, moduleKey, moduleKeys[modulePosition + 1]);
  }

  function addModule(items, module) {
    const moduleId = String(module?.moduleId || "").trim();
    if (!moduleId || items.some((item) => item.kind === "module" && item.moduleId === moduleId)) {
      return items;
    }

    items.push({
      kind: "module",
      key: `module:${moduleId}`,
      moduleId,
      sourceModuleId: module.sourceModuleId || null,
      trackId: module.trackId || null,
      trackTitle: module.trackTitle || "",
      title: stripModuleNumber(module.title || "New module"),
      collapsed: false
    });
    return normalizeMembership(items);
  }

  function removeModule(items, moduleKey) {
    const moduleIndexes = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === "module");
    if (moduleIndexes.length <= 1) return items;

    const modulePosition = moduleIndexes.findIndex(({ item }) => item.key === moduleKey);
    if (modulePosition < 0) return items;
    const sourceIndex = moduleIndexes[modulePosition].index;
    const sourceEnd = getModuleBlockEnd(items, sourceIndex);

    if (modulePosition === 0) {
      const sessions = items.slice(sourceIndex + 1, sourceEnd);
      items.splice(sourceIndex, sourceEnd - sourceIndex);
      const nextModuleIndex = items.findIndex((item) => item.kind === "module");
      items.splice(nextModuleIndex + 1, 0, ...sessions);
    } else {
      items.splice(sourceIndex, 1);
    }

    return normalizeMembership(items);
  }

  function renameModule(items, moduleKey, title) {
    const moduleItem = items.find((item) => item.kind === "module" && item.key === moduleKey);
    if (!moduleItem) return items;
    moduleItem.title = String(title || "").trim() || "Untitled module";
    return normalizeMembership(items);
  }

  function listPlans(items) {
    normalizeMembership(items);
    return items.filter((item) => item.kind === "session").map((item) => ({ ...item.plan }));
  }

  function listModules(items) {
    return items.filter((item) => item.kind === "module").map((item, index) => ({
      id: item.moduleId,
      sourceModuleId: item.sourceModuleId,
      trackId: item.trackId,
      trackTitle: item.trackTitle,
      title: item.title,
      order: index + 1
    }));
  }

  globalObject.KelpScheduleOutline = Object.freeze({
    addModule,
    createOutline,
    getPlanKey,
    listModules,
    listPlans,
    moveModuleBlockAfter,
    moveModuleBlockBefore,
    moveModuleByDirection,
    moveSessionAfter,
    moveSessionBefore,
    moveSessionByDirection,
    normalizeMembership,
    reconcileOutline,
    removeModule,
    renameModule
  });
}(globalThis));
