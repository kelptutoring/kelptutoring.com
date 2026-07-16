export const KELP_BACKEND_ADAPTER_CONTRACT_VERSION = 1;

const REQUIRED_METHODS = Object.freeze({
  classroom: Object.freeze({
    roomSession: ["load", "save", "subscribe"],
    participantPresence: ["publish"],
    chat: ["send"],
    timers: ["save"],
    sessionEvents: ["append"]
  }),
  whiteboard: Object.freeze({
    collaboration: ["connect", "publishScene", "subscribe", "disconnect"],
    whiteboards: ["load", "save", "clear"],
    files: ["save"]
  })
});

export function createLocalClassroomAdapters({
  roomId,
  storageKey,
  storage = globalThis.localStorage,
  eventTarget = globalThis,
  createRoom
}) {
  const readRoom = () => {
    try {
      const raw = storage?.getItem?.(storageKey);
      if (raw) return JSON.parse(raw);
    } catch (error) {}
    return createRoom?.() || { roomId };
  };

  const writeRoom = (room) => {
    if (!room || typeof room !== "object") {
      throw new TypeError("A classroom snapshot is required.");
    }
    storage?.setItem?.(storageKey, JSON.stringify(room));
    return room;
  };

  const writeContextSnapshot = (context) => writeRoom(context?.snapshot);

  return validateAdapterSet("classroom", {
    meta: localMetadata("classroom"),
    roomSession: {
      load: async () => readRoom(),
      save: async (room) => writeRoom(room),
      subscribe(listener) {
        if (typeof eventTarget?.addEventListener !== "function") return () => {};
        const handleStorage = (event) => {
          if (event.key !== storageKey) return;
          try {
            listener(event.newValue ? JSON.parse(event.newValue) : createRoom?.() || { roomId });
          } catch (error) {}
        };
        eventTarget.addEventListener("storage", handleStorage);
        return () => eventTarget.removeEventListener?.("storage", handleStorage);
      }
    },
    participantPresence: {
      publish: async (_presence, context) => writeContextSnapshot(context)
    },
    chat: {
      send: async (_message, context) => writeContextSnapshot(context)
    },
    timers: {
      save: async (_timer, context) => writeContextSnapshot(context)
    },
    sessionEvents: {
      append: async (_event, context) => writeContextSnapshot(context)
    }
  });
}

export function createLocalWhiteboardAdapters({
  roomId,
  storageKey,
  storage = globalThis.localStorage
}) {
  const loadBoard = () => {
    try {
      const raw = storage?.getItem?.(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };

  const saveBoard = (scene) => {
    if (!scene || typeof scene !== "object") {
      throw new TypeError("A whiteboard scene is required.");
    }
    storage?.setItem?.(storageKey, JSON.stringify(scene));
    return scene;
  };

  return validateAdapterSet("whiteboard", {
    meta: localMetadata("whiteboard"),
    collaboration: {
      connect: async () => ({ roomId, connected: false, provider: "local" }),
      publishScene: async () => {},
      subscribe: () => () => {},
      disconnect: async () => {}
    },
    whiteboards: {
      load: async () => loadBoard(),
      save: async (scene) => saveBoard(scene),
      clear: async () => storage?.removeItem?.(storageKey)
    },
    files: {
      save: async (files) => files || {}
    }
  });
}

export async function resolveKelpBackendAdapters({
  scope,
  localAdapters,
  context = {},
  globalObject = globalThis
}) {
  validateAdapterSet(scope, localAdapters);
  const registry = globalObject?.KelpBackendAdapters;
  if (!registry) return localAdapters;

  const factoryContext = Object.freeze({
    ...context,
    scope,
    contractVersion: KELP_BACKEND_ADAPTER_CONTRACT_VERSION,
    localAdapters
  });
  let overrides = null;

  if (typeof registry.create === "function") {
    overrides = await registry.create(scope, factoryContext);
  } else if (typeof registry[scope] === "function") {
    overrides = await registry[scope](factoryContext);
  } else {
    overrides = registry[scope];
  }

  if (!overrides) return localAdapters;
  return validateAdapterSet(scope, mergeAdapterSets(localAdapters, overrides));
}

export function validateAdapterSet(scope, adapters) {
  const requirements = REQUIRED_METHODS[scope];
  if (!requirements) throw new TypeError(`Unknown adapter scope: ${scope}`);

  Object.entries(requirements).forEach(([domain, methods]) => {
    methods.forEach((method) => {
      if (typeof adapters?.[domain]?.[method] !== "function") {
        throw new TypeError(`Missing ${scope}.${domain}.${method} adapter method.`);
      }
    });
  });

  return adapters;
}

function mergeAdapterSets(localAdapters, overrides) {
  const merged = { ...localAdapters, ...overrides };
  Object.keys(localAdapters).forEach((domain) => {
    const localDomain = localAdapters[domain];
    const overrideDomain = overrides?.[domain];
    if (isPlainObject(localDomain) && isPlainObject(overrideDomain)) {
      merged[domain] = { ...localDomain, ...overrideDomain };
    }
  });
  merged.meta = {
    ...(localAdapters.meta || {}),
    ...(overrides.meta || {}),
    contractVersion: KELP_BACKEND_ADAPTER_CONTRACT_VERSION
  };
  return merged;
}

function localMetadata(scope) {
  return Object.freeze({
    scope,
    provider: "local",
    contractVersion: KELP_BACKEND_ADAPTER_CONTRACT_VERSION
  });
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
