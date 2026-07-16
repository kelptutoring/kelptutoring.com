# Whiteboard

## Function

The whiteboard is a room-scoped Excalidraw workspace for live tutoring. It supports drawing and text tools, images, reusable frames, grids, geometry/graph editing, arrangement controls, pinned tools, local clipboard actions, autosave, optional collaboration adapters, and PNG/JPEG/PDF export.

It can run as a standalone board or as the embedded shared board inside the classroom. The current fallback persists one scene per room in the browser; a backend can replace persistence and collaboration through the shared adapter contract without changing the UI code.

## Entry page and main files

- `whiteboard.html` provides the toolbar, dialogs, stage, CDN import map, and hidden file inputs.
- `whiteboard.js` initializes Excalidraw, owns Kelp-specific tools and scene state, performs autosave/export, and communicates with the classroom host.
- `whiteboard.css` styles the standalone and embedded layouts, custom tool groups, grid overlay, focus mode, and geometry editor.
- `../shared/backend-adapters.js` defines and validates the optional backend boundary.
- `tools/geometry-lifecycle-self-test.html` is a focused browser fixture for geometry-frame lifecycle checks.
- `open-whiteboard-local.bat` is a Windows convenience launcher.

The page imports React, ReactDOM, and Excalidraw from `esm.sh`, Lucide from `unpkg`, and lazy-loads PDF/math helpers when required. It therefore needs an HTTP origin and network access unless these dependencies are later bundled locally.

## URL parameters

```text
whiteboard.html?room=lesson-123
whiteboard.html?room=lesson-123&embed=1
whiteboard.html?room=lesson-123&debugScene=1
```

- `room`: persistence/collaboration namespace. The default is `draft`. A URL hash is accepted as a legacy room ID fallback.
- `embed=1`: enables the compact classroom-embedded layout and host messaging.
- `debugScene=1`: records a short geometry-scene trace on the document element for browser diagnostics.

## Workflow

1. Resolve the room ID and create local whiteboard adapters.
2. Ask `window.KelpBackendAdapters` for optional `whiteboard` overrides. Invalid or unavailable overrides fall back to local behavior and surface a status message.
3. Load the room scene through `whiteboards.load` and normalize it for Excalidraw.
4. Mount Excalidraw and expose its API as `window.kelpWhiteboardApi` for debugging/integration.
5. Apply Kelp grid settings, pinned tools, frame preferences, and any pending collaborative scene.
6. Track persistent content changes. Autosave is debounced by 850 ms and only runs when scene content, saved app state, referenced files, or Kelp grid settings change.
7. Save files, save the scene, and publish a collaboration envelope through the adapters.
8. When embedded, exchange view/focus/shortcut messages with the classroom page.

## Main capabilities

- Excalidraw selection, hand, rectangle, diamond, ellipse, arrow, line, free draw, text, image, eraser, library, and Mermaid tools.
- Repeatable/sticky tools and customizable pinned toolbar groups.
- Copy, cut, paste, delete, alignment, distribution, and layer/order controls.
- Independent horizontal/vertical grid lines, spacing, color, opacity, and optional rotation assistance.
- Frame presets and per-frame background metadata.
- Geometry/graph editor stored in Excalidraw element `customData`, with support for functions, points, segments, measurements, shapes, text, and circuit symbols.
- Standalone focus controls, countdown, viewport fitting, and embedded classroom focus mode.
- Image upload and opening `.excalidraw` or JSON board files.
- PNG, JPEG, and single-page A4 PDF export.

## Persisted scene data

The primary whiteboard record has this shape:

```js
{
  type: "excalidraw",
  version: 2,
  source: "kelp-whiteboard",
  roomId,
  savedAt,
  elements,       // Excalidraw scene elements
  appState: {
    viewBackgroundColor,
    gridModeEnabled,
    gridSize,
    theme,
    name,
    exportBackground: true,
    exportWithDarkMode: false
  },
  files,          // only files referenced by live elements
  kelpGrid: {
    horizontal,
    vertical,
    spacing,
    color,
    opacity,
    rotationAssist
  }
}
```

The scene is the backend-ready board payload. Excalidraw elements can also contain Kelp metadata for geometry frames, frame templates, and frame-background ownership. Preserve unknown `customData` fields when moving this record through a backend.

## Backend adapter contract

`src/app/shared/backend-adapters.js` defines contract version `1`. A whiteboard adapter must provide:

```js
{
  collaboration: {
    connect(context),
    publishScene(message, context),
    subscribe(listener, context),
    disconnect(context)
  },
  whiteboards: {
    load(context),
    save(scene, context),
    clear(context)
  },
  files: {
    save(files, context)
  }
}
```

The page resolves overrides from `window.KelpBackendAdapters`. The registry may expose `create(scope, context)`, a `whiteboard(context)` factory, or a `whiteboard` object. Missing domains are merged from the local fallback; every required method is validated.

Adapter context includes `roomId`, a per-tab `clientId`, `embedded`, `reason`, optional `scene`, and `occurredAt`. Collaboration publications use an envelope:

```js
{
  type: "scene",
  roomId,
  clientId,
  revision: scene.savedAt,
  scene
}
```

The local adapter does not provide real-time collaboration; its collaboration methods are intentionally no-ops.

## Browser storage

- `kelp:whiteboard:v1:<roomId>`: the room scene.
- `kelp:whiteboard:grid-settings:v1:<roomId>`: room-specific Kelp grid appearance.
- `kelp:whiteboard:clipboard`: Kelp's cross-board selection clipboard.
- `kelp:whiteboard:pinned-tools:v1`: pinned individual tools.
- `kelp:whiteboard:pinned-palette:v2`: pinned palette state.
- `kelp:whiteboard:pinned-groups:v1`: pinned tool groups.
- `kelp:whiteboard:frame-background:v1`: preferred frame background color.
- `kelp:whiteboard:frame-template:v1`: preferred frame template.

Browser storage is a development fallback. Large Base64 images can exceed storage quotas; a production adapter should move file blobs to object storage and retain stable file references in the scene.

## Exported output

- Scene persistence payload: the JSON structure above, sent through `whiteboards.save`.
- Collaboration payload: the scene envelope above, sent through `collaboration.publishScene`.
- Files payload: the referenced Excalidraw file map, sent through `files.save` before the scene.
- PNG/JPEG: rendered from the current live elements with Excalidraw's canvas exporter.
- PDF: the rendered board fitted onto one centered A4 page; orientation follows the canvas aspect ratio.

Opening a `.excalidraw`/JSON file imports a scene into the current room but does not automatically redefine the room ID stored in the URL.

## Running and testing

From the repository root:

```bash
npm run serve:whiteboard
npm run test:smoke
npm run test:adapters
```

- `serve:whiteboard` starts the local HTTP server and opens the page.
- `test:smoke` exercises classroom/whiteboard page contracts and browser behaviors.
- `test:adapters` checks local adapter persistence, merge behavior, and validation.

## Debugging notes

- Use an HTTP server. ES modules, CDN imports, clipboard behavior, media, and embedded communication are less reliable from `file://`.
- Confirm `window.kelpWhiteboardApi` exists before diagnosing tool behavior; its absence usually means Excalidraw did not finish loading.
- Inspect `window.kelpWhiteboardAdapters.meta` to see whether the local or backend provider is active.
- If autosave appears idle, compare the current room ID with the `kelp:whiteboard:v1:<roomId>` key.
- If images disappear after a backend round trip, confirm `files.save` completed and the returned scene still contains file IDs referenced by live elements.
- If the classroom and board diverge, confirm both pages use the exact same `room` value and that the iframe uses `embed=1`.
- Respect `prefers-reduced-motion`; transitions and viewport animations may be deliberately reduced during accessibility testing.
