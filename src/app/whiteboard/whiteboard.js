import React from "react";
import { createRoot } from "react-dom/client";
import * as ExcalidrawLib from "https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/dev/index.js?external=react,react-dom";
import {
  createLocalWhiteboardAdapters,
  resolveKelpBackendAdapters
} from "../shared/backend-adapters.js?v=20260713-phase5";

const GEOMETRY_MATH_URL = "https://cdn.jsdelivr.net/npm/mathjs@12.4.1/lib/browser/math.min.js";
const GEOMETRY_EDITOR_SCRIPT_URL = new URL(
  "../exam-builder/kelp-diagram-editor.js?v=20260713-compact-graph-3",
  import.meta.url
).href;
const GEOMETRY_EDITOR_STYLE_URL = new URL(
  "../exam-builder/kelp-diagram-editor.css?v=20260713-compact-graph-3",
  import.meta.url
).href;
const JSPDF_MODULE_URL = "https://esm.sh/jspdf@2.5.1";
let geometryDependenciesPromise = null;
let jsPdfModulePromise = null;

const STORAGE_PREFIX = "kelp:whiteboard:v1:";
const CLIPBOARD_KEY = "kelp:whiteboard:clipboard";
const PINNED_TOOLS_KEY = "kelp:whiteboard:pinned-tools:v1";
const PINNED_PALETTE_KEY = "kelp:whiteboard:pinned-palette:v2";
const PINNED_GROUPS_KEY = "kelp:whiteboard:pinned-groups:v1";
const FRAME_BACKGROUND_KEY = "kelp:whiteboard:frame-background:v1";
const FRAME_TEMPLATE_KEY = "kelp:whiteboard:frame-template:v1";
const DEFAULT_FRAME_BACKGROUND = "#e8f6f6";
const FRAME_BACKGROUND_META_KEY = "kelpFrameBackground";
const FRAME_BACKGROUND_OWNER_KEY = "kelpFrameBackgroundFor";
const FRAME_TEMPLATE_META_KEY = "kelpFrameTemplate";
const GRID_LAYER_META_KEY = "kelpGridLayer";
const GRID_LAYER_BEHIND = "behind";
const GRID_LAYER_FRONT = "front";
const FRAME_TEMPLATES = Object.freeze({
  custom: { id: "custom", label: "Custom", width: null, height: null },
  a4: { id: "a4", label: "A4", width: 794, height: 1123 },
  "16:9": { id: "16:9", label: "16:9", width: 1280, height: 720 },
  "4:3": { id: "4:3", label: "4:3", width: 1024, height: 768 },
  mobile: { id: "mobile", label: "Mobile", width: 390, height: 844 },
  tablet: { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  desktop: { id: "desktop", label: "Desktop", width: 1440, height: 900 }
});
const GRID_SETTINGS_PREFIX = "kelp:whiteboard:grid-settings:v1:";
const GRID_SPACING_VALUES = Object.freeze({ compact: 32, standard: 64, spacious: 128 });
const GRID_SPACING_LABELS = Object.freeze({ compact: "Medium", standard: "Large", spacious: "Extra-large" });
const DEFAULT_GRID_COLOR = "#145c63";
const DEFAULT_GRID_OPACITY = 20;
const FRAME_BACKGROUND_INSET = 2;
const ROTATION_SNAP_STEP = Math.PI / 4;
const ROTATION_SNAP_ATTACH = 2.5 * Math.PI / 180;
const ROTATION_SNAP_RELEASE = 4 * Math.PI / 180;
const FOCUS_BAR_HIDE_DELAY = 520;
const STANDALONE_TIMER_DEFAULT_MINUTES = 5;
const NATIVE_CONTROLS_FALLBACK_WIDTH = 274;
const NATIVE_CONTROLS_MIN_VIEWPORT_WIDTH = 560;
const NATIVE_CONTROLS_MIN_VIEWPORT_HEIGHT = 430;
const NATIVE_COLOR_PICKER_ESTIMATED_HEIGHT = 252;
const REPEATABLE_WHITEBOARD_TOOLS = new Set([
  "freedraw",
  "highlighter",
  "eraser",
  "line",
  "arrow",
  "rectangle",
  "diamond",
  "ellipse",
  "frame"
]);
const GEOMETRY_SHORTCUTS = {
  q: "point",
  w: "segment",
  e: "regularPolygon",
  d: "irregularPolygon",
  a: "angle",
  z: "trapezoid",
  x: "parallelogram",
  f: "function"
};
const CLASSROOM_SHORTCUT_CODES = new Set([
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6"
]);
const EXPORT_PADDING = 24;
const EXPORT_MAX_WIDTH_OR_HEIGHT = 4096;
const IMAGE_MAX_WIDTH = 720;
const IMAGE_MAX_HEIGHT = 520;
const GEOMETRY_FRAME_KEY = "kelpGeometryFrame";
const GEOMETRY_FRAME_SIZE = 560;
const GEOMETRY_TOOLS = [
  "point",
  "segment",
  "angle",
  "function",
  "regularPolygon",
  "irregularPolygon",
  "rectangle",
  "trapezoid",
  "parallelogram",
  "circle"
];

const CAPTURE_IMMEDIATELY =
  ExcalidrawLib.CaptureUpdateAction?.IMMEDIATELY ?? undefined;
const CAPTURE_NEVER =
  ExcalidrawLib.CaptureUpdateAction?.NEVER ?? undefined;

const url = new URL(window.location.href);
const roomId = url.searchParams.get("room") || url.hash.replace(/^#/, "") || "draft";
const isEmbedded = url.searchParams.get("embed") === "1";
const debugSceneEnabled = url.searchParams.get("debugScene") === "1";
const storageKey = `${STORAGE_PREFIX}${roomId}`;
const gridSettingsKey = `${GRID_SETTINGS_PREFIX}${roomId}`;
const collaborationClientId = window.crypto?.randomUUID?.()
  || `whiteboard-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const localWhiteboardAdapters = createLocalWhiteboardAdapters({
  roomId,
  storageKey,
  storage: window.localStorage
});
let backendAdapters = localWhiteboardAdapters;
let backendFallbackError = null;

try {
  backendAdapters = await resolveKelpBackendAdapters({
    scope: "whiteboard",
    localAdapters: localWhiteboardAdapters,
    globalObject: window,
    context: {
      roomId,
      clientId: collaborationClientId,
      embedded: isEmbedded,
      page: "whiteboard"
    }
  });
} catch (error) {
  console.error("Whiteboard adapter initialization failed", error);
  backendFallbackError = error;
}

window.kelpWhiteboardAdapters = backendAdapters;

document.body.classList.toggle("is-embedded", isEmbedded);
document.body.classList.toggle("is-standalone", !isEmbedded);

const rootEl = document.getElementById("excalidraw-root");
const stageEl = document.querySelector(".whiteboard-stage");
const statusEl = document.getElementById("whiteboard-status");
const selectionEl = document.getElementById("selection-count");
const roomLabelEl = document.getElementById("room-label");
const whiteboardToolbar = document.querySelector(".whiteboard-toolbar");
const imageUploadInput = document.getElementById("image-upload-input");
const boardFileInput = document.getElementById("board-file-input");
const focusToolsEdge = document.getElementById("focus-tools-edge");
const pinFocusToolsButton = document.getElementById("pin-focus-tools");
const geometryShell = document.getElementById("geometry-editor-shell");
const geometryHeader = document.getElementById("geometry-editor-header");
const geometryHost = document.getElementById("geometry-editor-host");
const geometryTitle = document.getElementById("geometry-editor-title");
const toggleGeometryExpandedButton = document.getElementById("toggle-geometry-expanded");
const toggleGeometryFullscreenButton = document.getElementById("toggle-geometry-fullscreen");
const closeGeometryEditorButton = document.getElementById("close-geometry-editor");
const pinnedToolsGroup = document.getElementById("pinned-tools-group");
const pinnedToolsHome = document.getElementById("pinned-tools-home");
const pinnedToolsHeading = document.getElementById("pinned-tools-heading");
const pinnedToolsList = document.getElementById("pinned-tools-list");
const pinnedFocusLayer = document.getElementById("pinned-focus-layer");
const toolContextMenu = document.getElementById("tool-context-menu");
const appearanceDialog = document.getElementById("appearance-dialog");
const appearanceForm = document.getElementById("appearance-form");
const appearanceDialogEyebrow = document.getElementById("appearance-dialog-eyebrow");
const appearanceDialogTitle = document.getElementById("appearance-dialog-title");
const appearanceColorInput = document.getElementById("appearance-color");
const appearanceHexInput = document.getElementById("appearance-hex");
const appearanceCustomColorSwatch = document.getElementById("appearance-custom-color-swatch");
const appearancePresetButtons = Array.from(
  appearanceDialog.querySelectorAll("[data-appearance-color]")
);
const appearanceOpacityField = document.getElementById("appearance-opacity-field");
const appearanceOpacityInput = document.getElementById("appearance-opacity");
const appearanceOpacityValue = document.getElementById("appearance-opacity-value");
const appearanceOpacityMaximum = document.getElementById("appearance-opacity-maximum");
const appearanceApplyLabel = document.getElementById("appearance-apply-label");
const closeAppearanceDialogButton = document.getElementById("close-appearance-dialog");
const cancelAppearanceDialogButton = document.getElementById("cancel-appearance-dialog");
const frameBackgroundControl = document.getElementById("frame-background-control");
const frameBackgroundCustomButton = document.getElementById("frame-background-custom-button");
const frameBackgroundColorInput = document.getElementById("frame-background-color-input");
const frameBackgroundPresetButtons = Array.from(
  frameBackgroundControl.querySelectorAll("[data-frame-background-color]")
);
const frameTemplateButtons = Array.from(
  frameBackgroundControl.querySelectorAll("[data-frame-template]")
);
const frameGridLayerButtons = Array.from(
  frameBackgroundControl.querySelectorAll("[data-frame-grid-layer]")
);
const imageGridLayerControl = document.getElementById("image-grid-layer-control");
const imageGridLayerButtons = Array.from(
  imageGridLayerControl.querySelectorAll("[data-image-grid-layer]")
);
const gridOverlay = document.getElementById("whiteboard-grid-overlay");
const gridToolsMenu = document.getElementById("grid-tools-menu");
const gridAppearanceTrigger = document.getElementById("grid-appearance-trigger");
const gridAppearancePopover = document.getElementById("grid-appearance-popover");
const gridColorInput = document.getElementById("grid-color-input");
const gridCustomColorSwatch = document.getElementById("grid-custom-color-swatch");
const gridColorPresetButtons = Array.from(
  gridAppearancePopover.querySelectorAll("[data-grid-color]")
);
const gridOpacityInput = document.getElementById("grid-opacity-input");
const gridOpacityScale = document.getElementById("grid-opacity-scale");
const gridOpacityValue = document.getElementById("grid-opacity-value");
const gridOpacityMaximum = document.getElementById("grid-opacity-maximum");
const standaloneDock = document.getElementById("standalone-whiteboard-dock");
const standaloneDockEdge = document.getElementById("standalone-dock-edge");
const pinStandaloneDockButton = document.getElementById("pin-standalone-dock");
const standaloneFullscreenButton = document.getElementById("standalone-fullscreen");
const standaloneFocusButton = document.getElementById("standalone-focus");
const standaloneCenterContentButton = document.getElementById("standalone-center-content");
const standaloneAutoFitButton = document.getElementById("standalone-auto-fit");
const standaloneTimeButton = document.getElementById("standalone-time");
const standaloneExitButton = document.getElementById("standalone-exit");
const standaloneTimerPanel = document.getElementById("standalone-timer-panel");
const standaloneTimerPanelHeader = document.getElementById("standalone-timer-panel-header");
const closeStandaloneTimerPanelButton = document.getElementById("close-standalone-timer-panel");
const standaloneCountdownMinutes = document.getElementById("standalone-countdown-minutes");
const standaloneCountdownTime = document.getElementById("standalone-countdown-time");
const startStandaloneCountdownButton = document.getElementById("start-standalone-countdown");
const pauseStandaloneCountdownButton = document.getElementById("pause-standalone-countdown");
const resetStandaloneCountdownButton = document.getElementById("reset-standalone-countdown");
const toggleStandaloneCountdownBoxButton = document.getElementById("toggle-standalone-countdown-box");
const standaloneFloatingTimer = document.getElementById("standalone-floating-timer");
const standaloneFloatingTimerHeader = document.getElementById("standalone-floating-timer-header");
const standaloneFloatingCountdownTime = document.getElementById("standalone-floating-countdown-time");
const standaloneFloatingCountdownState = document.getElementById("standalone-floating-countdown-state");
const pinnableToolButtons = new Map();
const initialGridSettings = loadGridSettings();

const state = {
  api: null,
  elements: [],
  appState: {},
  files: {},
  autosaveTimer: null,
  lastAutosaveContentSignature: "",
  persistenceQueue: Promise.resolve(),
  collaborationUnsubscribe: null,
  collaborationConnected: false,
  pendingCollaborativeScene: null,
  applyingCollaborativeScene: false,
  collaborationApplyTimer: null,
  lastCollaborativeRevision: "",
  statusTimer: null,
  internalClipboard: null,
  pasteCount: 0,
  focusMode: false,
  focusToolsOpen: false,
  focusToolsPinned: false,
  focusToolsHideTimer: null,
  classroomDockOpen: false,
  classroomDockBottomInset: 100,
  classroomFooterBottomInset: 130,
  classroomDockRightInset: 16,
  classroomNativeControlsBottomInset: 18,
  standaloneDockOpen: !isEmbedded,
  standaloneDockPinned: false,
  standaloneDockHideTimer: null,
  standaloneDockSettleTimer: null,
  standaloneDockBottomInset: 82,
  standaloneDockFooterInset: 112,
  standaloneDockRightInset: 12,
  standaloneDockLayoutFrame: null,
  nativeControlsLayoutFrame: null,
  nativeControlsPlacement: "",
  standaloneTimerPanelOpen: false,
  standaloneTimerTick: null,
  standaloneTimerLastToneKey: null,
  standaloneTimerAudioContext: null,
  standaloneTimerPanelDrag: null,
  standaloneTimerBoxDrag: null,
  standaloneTimer: {
    status: "idle",
    durationSeconds: STANDALONE_TIMER_DEFAULT_MINUTES * 60,
    remainingSeconds: STANDALONE_TIMER_DEFAULT_MINUTES * 60,
    boxVisible: false,
    startedAt: null,
    endsAt: null,
    finishedAt: null
  },
  geometryEditor: null,
  geometryElementId: null,
  geometryDirty: false,
  geometryCommitInProgress: false,
  geometryExpanded: false,
  geometryRestoreRect: null,
  geometryDrag: null,
  geometryLayoutFrame: null,
  geometryLayoutReposition: false,
  pinnedToolIds: [],
  pinnedGroups: [],
  pinnedPaletteDrag: null,
  pinnedPaletteSuppressed: false,
  draggedToolId: null,
  draggedToolSource: null,
  draggedToolGroupId: null,
  overlayLayoutFrame: null,
  excalidrawRefreshFrame: null,
  activeWhiteboardTool: "selection",
  stickyWhiteboardTool: null,
  stickyToolGestureActive: false,
  stickyToolRestorePending: false,
  suppressToolSyncUntil: 0,
  pendingViewCommand: null,
  debugSceneSignature: "",
  debugSceneEvents: [],
  appearanceMode: null,
  frameBackgroundColor: loadFrameBackgroundColor(),
  frameTemplateId: loadFrameTemplateId(),
  frameGridLayer: GRID_LAYER_BEHIND,
  pendingFrameBackground: null,
  frameBackgroundColors: new Map(),
  frameBackgroundSyncFrame: null,
  frameBackgroundSyncInProgress: false,
  frameBackgroundGestureActive: false,
  frameBackgroundGestureReleaseFrame: null,
  frameBackgroundGestureMode: null,
  frameBackgroundControlFrame: null,
  gridHorizontal: initialGridSettings.horizontal,
  gridVertical: initialGridSettings.vertical,
  gridSpacing: initialGridSettings.spacing,
  gridColor: initialGridSettings.color,
  gridOpacity: initialGridSettings.opacity,
  rotationAssistEnabled: initialGridSettings.rotationAssist,
  gridSettingsLoaded: initialGridSettings.saved,
  gridOverlayAttachmentFrame: null,
  gridOverlayMaskSignature: "",
  gridAppearanceAnchor: null,
  contextMenuLayoutFrame: null,
  rotationSnapGesture: null,
  rotationSnapTarget: null,
  rotationSnapInProgress: false,
  nativePropertiesDismissed: false,
  nativePropertiesOwnerGroup: null,
  nativePropertiesSelectionSignature: "",
  appearanceAnchorRect: null
};

roomLabelEl.textContent = roomId === "draft" ? "Draft room" : `Room ${roomId}`;
const initialScene = await loadInitialScene();
if (!state.gridSettingsLoaded) hydrateGridStateFromScene(initialScene);
await initializeWhiteboardCollaboration();

initializeToolGroups();
initializePinnedTools();
initializeStandaloneControls();
renderGridControls();
renderRotationAssistControl();
renderLucideIcons();
window.addEventListener("load", renderLucideIcons);

createRoot(rootEl).render(
  React.createElement(ExcalidrawLib.Excalidraw, {
    initialData: initialScene,
    excalidrawAPI: handleExcalidrawApi,
    onChange: handleSceneChange,
    onPaste: handleNativePaste,
    autoFocus: true,
    handleKeyboardGlobally: true,
    langCode: "en",
    name: "Kelp Whiteboard",
    theme: "light",
    UIOptions: {
      canvasActions: {
        clearCanvas: false,
        export: false,
        loadScene: false,
        saveToActiveFile: false,
        saveAsImage: false,
        toggleTheme: false
      }
    }
  })
);

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool, {
    ownerGroup: button.closest("[data-tool-group]")?.dataset.toolGroup || null
  }));
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => runAction(button.dataset.action, button));
});

document.querySelectorAll("[data-geometry-tool]").forEach((button) => {
  button.addEventListener("click", () => openGeometryEditor(button.dataset.geometryTool));
});

document.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", () => exportBoard(button.dataset.export));
});

imageUploadInput.addEventListener("change", async () => {
  const [file] = Array.from(imageUploadInput.files || []);
  imageUploadInput.value = "";
  if (file) {
    await insertImageFile(file);
  }
});

boardFileInput.addEventListener("change", async () => {
  const [file] = Array.from(boardFileInput.files || []);
  boardFileInput.value = "";
  if (file) {
    await openBoardFile(file);
  }
});

focusToolsEdge.addEventListener("pointerenter", revealFocusTools);
focusToolsEdge.addEventListener("pointerleave", scheduleFocusToolsHide);
focusToolsEdge.addEventListener("focus", revealFocusTools);
focusToolsEdge.addEventListener("blur", scheduleFocusToolsHide);
focusToolsEdge.addEventListener("click", () => {
  revealFocusTools();
  focusToolsEdge.blur();
});
pinFocusToolsButton.addEventListener("click", toggleFocusToolsPinned);
pinFocusToolsButton.addEventListener("pointerenter", keepFocusToolsOpen);
pinFocusToolsButton.addEventListener("pointerleave", scheduleFocusToolsHide);
pinFocusToolsButton.addEventListener("focus", keepFocusToolsOpen);
pinFocusToolsButton.addEventListener("blur", scheduleFocusToolsHide);
whiteboardToolbar.addEventListener("pointerenter", keepFocusToolsOpen);
whiteboardToolbar.addEventListener("pointerleave", scheduleFocusToolsHide);
whiteboardToolbar.addEventListener("focusin", keepFocusToolsOpen);
whiteboardToolbar.addEventListener("focusout", scheduleFocusToolsHide);
whiteboardToolbar.addEventListener("scroll", () => {
  requestWhiteboardOverlayLayout();
});
gridToolsMenu.addEventListener("scroll", () => {
  if (!gridAppearancePopover.hidden) positionGridAppearancePopover();
});
rootEl.addEventListener("pointerover", handleFocusOptionsPointerOver);
rootEl.addEventListener("pointerout", handleFocusOptionsPointerOut);
document.addEventListener("pointerover", handleDockTooltipPointerOver, true);
document.addEventListener("pointerout", handleDockTooltipPointerOut, true);
toggleGeometryExpandedButton.addEventListener("click", toggleGeometryExpanded);
toggleGeometryFullscreenButton.addEventListener("click", toggleGeometryFullscreen);
closeGeometryEditorButton.addEventListener("click", commitGeometryEditorAndClose);
geometryHost.addEventListener("kelp-diagram-change", handleGeometryChange);
geometryHost.addEventListener("kelp-diagram-attach", handleGeometryAttach);
geometryHeader.addEventListener("pointerdown", beginGeometryDrag);
geometryHeader.addEventListener("pointermove", moveGeometryEditor);
geometryHeader.addEventListener("pointerup", endGeometryDrag);
geometryHeader.addEventListener("pointercancel", endGeometryDrag);
stageEl.addEventListener("dblclick", handleGeometryDoubleClick, true);
stageEl.addEventListener("wheel", handleShiftWheelPan, { capture: true, passive: false });
stageEl.addEventListener("pointerdown", handleFrameBackgroundGesturePointerDown, true);
stageEl.addEventListener("pointerdown", handleStickyToolPointerDown, true);
stageEl.addEventListener("click", handleNativeToolControlClick, true);
stageEl.addEventListener("contextmenu", handleNativeContextMenuOpen, true);
window.addEventListener("pointerup", handleFrameBackgroundGesturePointerEnd, true);
window.addEventListener("pointercancel", handleFrameBackgroundGesturePointerEnd, true);
window.addEventListener("pointerup", handleStickyToolPointerUp, true);
window.addEventListener("pointercancel", handleStickyToolPointerUp, true);
window.addEventListener("pointermove", movePinnedPalette);
window.addEventListener("pointerup", endPinnedPaletteDrag);
window.addEventListener("pointercancel", endPinnedPaletteDrag);
document.addEventListener("fullscreenchange", renderGeometryFullscreenState);
document.addEventListener("pointerdown", handleGeometryOutsidePointerDown, true);
document.addEventListener("pointerdown", handleToolContextMenuOutsidePointer, true);
appearanceForm.addEventListener("submit", handleAppearanceSubmit);
appearanceCustomColorSwatch.addEventListener("pointerdown", () => {
  positionNativeColorPicker(
    appearanceColorInput,
    appearanceCustomColorSwatch,
    appearanceDialog
  );
});
appearanceCustomColorSwatch.addEventListener("click", () => {
  openPositionedNativeColorPicker(
    appearanceColorInput,
    appearanceCustomColorSwatch,
    appearanceDialog
  );
});
appearanceColorInput.addEventListener("input", handleAppearanceColorInput);
appearanceColorInput.addEventListener("change", handleAppearanceColorInput);
appearanceHexInput.addEventListener("input", handleAppearanceHexInput);
appearanceHexInput.addEventListener("blur", normalizeAppearanceHexInput);
appearanceOpacityInput.addEventListener("input", renderAppearancePreview);
appearancePresetButtons.forEach((button) => {
  button.addEventListener("click", () => selectAppearancePreset(button.dataset.appearanceColor));
});
closeAppearanceDialogButton.addEventListener("click", closeAppearanceDialog);
cancelAppearanceDialogButton.addEventListener("click", closeAppearanceDialog);
appearanceDialog.addEventListener("pointerenter", keepFocusToolsOpen);
appearanceDialog.addEventListener("pointerleave", scheduleFocusToolsHide);
appearanceDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeAppearanceDialog();
});
appearanceDialog.addEventListener("click", (event) => {
  if (event.target === appearanceDialog) closeAppearanceDialog();
});
appearanceDialog.addEventListener("close", () => {
  state.appearanceMode = null;
});
gridColorPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setGridAppearance({ color: button.dataset.gridColor }, true);
  });
});
gridCustomColorSwatch.addEventListener("pointerdown", () => {
  positionNativeColorPicker(
    gridColorInput,
    gridCustomColorSwatch,
    gridAppearancePopover,
    { alignPopupTop: true }
  );
});
gridCustomColorSwatch.addEventListener("click", () => {
  openPositionedNativeColorPicker(
    gridColorInput,
    gridCustomColorSwatch,
    gridAppearancePopover,
    { alignPopupTop: true }
  );
});
gridColorInput.addEventListener("input", () => {
  setGridAppearance({ color: gridColorInput.value }, false);
});
gridColorInput.addEventListener("change", () => {
  setGridAppearance({ color: gridColorInput.value }, true);
});
gridOpacityInput.addEventListener("input", () => {
  setGridAppearance({ opacity: gridOpacityInput.value }, false);
});
gridOpacityInput.addEventListener("change", () => {
  setGridAppearance({ opacity: gridOpacityInput.value }, true);
});
gridAppearancePopover.addEventListener("pointerenter", keepFocusToolsOpen);
gridAppearancePopover.addEventListener("pointerleave", scheduleFocusToolsHide);
frameBackgroundPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyFrameBackgroundColor(button.dataset.frameBackgroundColor);
  });
});
frameTemplateButtons.forEach((button) => {
  button.addEventListener("click", () => applyFrameTemplate(button.dataset.frameTemplate));
});
frameGridLayerButtons.forEach((button) => {
  button.addEventListener("click", () => applyFrameGridLayer(button.dataset.frameGridLayer));
});
imageGridLayerButtons.forEach((button) => {
  button.addEventListener("click", () => applyImageGridLayer(button.dataset.imageGridLayer));
});
frameBackgroundCustomButton.addEventListener("pointerdown", () => {
  prepareFrameBackgroundColorPicker();
});
frameBackgroundCustomButton.addEventListener("click", () => {
  prepareFrameBackgroundColorPicker();
  openPositionedNativeColorPicker(
    frameBackgroundColorInput,
    frameBackgroundCustomButton,
    getFrameBackgroundColorPickerOwner()
  );
});
frameBackgroundColorInput.addEventListener("change", () => {
  applyFrameBackgroundColor(frameBackgroundColorInput.value);
});

const frameBackgroundPanelObserver = typeof window.MutationObserver === "function"
  ? new window.MutationObserver(() => {
      requestFrameBackgroundControlSync();
      requestGridOverlayAttachment();
      requestNativeContextMenuLayout();
      requestNativeControlsLayout();
      syncDockSafeTooltips();
    })
  : null;
frameBackgroundPanelObserver?.observe(rootEl, { childList: true, subtree: true });

if (isEmbedded) {
  window.addEventListener("message", handleClassroomMessage);
  window.parent.postMessage({ type: "kelp:whiteboard-ready" }, window.location.origin);
}

window.addEventListener("resize", () => {
  requestExcalidrawLayoutRefresh();
  requestGeometryEditorLayout({ repositionShell: true });
  applyPinnedPalettePosition();
  requestWhiteboardOverlayLayout();
  requestGridOverlayAttachment();
  renderGridOverlay();
  requestNativeContextMenuLayout();
  requestNativeControlsLayout();
  syncDockSafeTooltips();
  if (appearanceDialog.open) positionAppearanceDialog();
  if (!gridAppearancePopover.hidden) positionGridAppearancePopover();
  closeToolContextMenu();
});

const whiteboardResizeObserver = typeof window.ResizeObserver === "function"
  ? new window.ResizeObserver((entries) => {
      const geometryOnly = entries.length > 0
        && entries.every((entry) => entry.target === geometryShell);
      requestExcalidrawLayoutRefresh();
      requestGeometryEditorLayout({ repositionShell: !geometryOnly });
      requestWhiteboardOverlayLayout();
      requestGridOverlayAttachment();
      renderGridOverlay();
      requestNativeContextMenuLayout();
      requestNativeControlsLayout();
      syncDockSafeTooltips();
    })
  : null;
whiteboardResizeObserver?.observe(stageEl);
whiteboardResizeObserver?.observe(whiteboardToolbar);
whiteboardResizeObserver?.observe(geometryShell);

window.addEventListener("keydown", handleWhiteboardShortcut, true);

window.addEventListener("error", () => {
  setStatus("Whiteboard error", "error", true);
});

window.addEventListener("unhandledrejection", () => {
  setStatus("Whiteboard error", "error", true);
});

window.addEventListener("pagehide", () => {
  state.collaborationUnsubscribe?.();
  state.collaborationUnsubscribe = null;
  void backendAdapters.collaboration.disconnect(whiteboardAdapterContext("page-hidden"));
});

async function initializeWhiteboardCollaboration() {
  try {
    const connection = await backendAdapters.collaboration.connect(
      whiteboardAdapterContext("whiteboard-opened")
    );
    state.collaborationConnected = Boolean(connection?.connected);
    const unsubscribe = await backendAdapters.collaboration.subscribe(
      handleCollaborativeScene,
      whiteboardAdapterContext("collaboration-subscribed")
    );
    state.collaborationUnsubscribe = typeof unsubscribe === "function" ? unsubscribe : null;
  } catch (error) {
    handleWhiteboardAdapterError("collaboration", error, false);
  }
}

function handleCollaborativeScene(update) {
  const scene = update?.scene || update?.board || null;
  if (!scene || update?.clientId === collaborationClientId) return;
  const revision = String(update?.revision || scene.savedAt || "");
  if (revision && revision === state.lastCollaborativeRevision) return;
  state.lastCollaborativeRevision = revision;
  state.pendingCollaborativeScene = scene;
  applyPendingCollaborativeScene();
}

function applyPendingCollaborativeScene() {
  if (!state.api || !state.pendingCollaborativeScene) return;
  const scene = state.pendingCollaborativeScene;
  state.pendingCollaborativeScene = null;
  const normalized = normalizeScene(scene);
  hydrateGridStateFromScene(normalized);
  saveGridSettings();
  renderGridControls();
  renderRotationAssistControl();
  if (normalized.files && Object.keys(normalized.files).length) {
    state.api.addFiles?.(normalized.files);
  }

  state.applyingCollaborativeScene = true;
  state.lastAutosaveContentSignature = persistentContentSignature(
    normalized.elements,
    normalized.appState,
    normalized.files
  );
  state.api.updateScene({
    elements: normalized.elements,
    appState: {
      viewBackgroundColor: normalized.appState.viewBackgroundColor,
      theme: normalized.appState.theme,
      gridModeEnabled: false,
      gridSize: GRID_SPACING_VALUES[state.gridSpacing]
    },
    captureUpdate: CAPTURE_NEVER
  });
  window.clearTimeout(state.collaborationApplyTimer);
  state.collaborationApplyTimer = window.setTimeout(() => {
    state.applyingCollaborativeScene = false;
    state.collaborationApplyTimer = null;
  }, 500);
  requestGridOverlayAttachment();
  renderGridOverlay(normalized.appState);
  setStatus("Board synchronized");
}

function hydrateGridStateFromScene(scene) {
  if (!scene?.kelpGrid) return;
  const grid = normalizeGridSettings(scene.kelpGrid, true);
  state.gridHorizontal = grid.horizontal;
  state.gridVertical = grid.vertical;
  state.gridSpacing = grid.spacing;
  state.gridColor = grid.color;
  state.gridOpacity = grid.opacity;
  state.rotationAssistEnabled = grid.rotationAssist;
  state.gridSettingsLoaded = true;
}

function whiteboardAdapterContext(reason, scene = null) {
  return {
    roomId,
    clientId: collaborationClientId,
    embedded: isEmbedded,
    reason,
    scene,
    occurredAt: new Date().toISOString()
  };
}

function handleWhiteboardAdapterError(domain, error, showStatus = true) {
  console.error(`Could not synchronize whiteboard ${domain}`, error);
  if (showStatus) setStatus(`Could not synchronize ${domain}`, "error", true);
}

function handleExcalidrawApi(api) {
  state.api = api;
  window.kelpWhiteboardApi = api;
  traceGeometryScene("api:ready");
  stageEl.classList.add("is-ready");
  if (backendFallbackError) {
    setStatus("Backend unavailable - using local mode", "error", true);
  } else {
    setStatus("Ready");
  }
  updateSelectionState(api.getAppState?.());
  requestFrameBackgroundControlSync();
  initializeGridFromApi();
  requestGridOverlayAttachment();
  renderGridOverlay(api.getAppState?.());
  stabilizeExcalidrawLayout();
  applyPendingCollaborativeScene();
  if (state.pendingViewCommand) {
    const pendingCommand = state.pendingViewCommand;
    state.pendingViewCommand = null;
    runWhiteboardViewCommand(pendingCommand);
  }
}

function handleSceneChange(elements, appState, files) {
  const appliedCollaborativeScene = state.applyingCollaborativeScene;
  state.elements = Array.from(elements || []);
  state.appState = appState || {};
  state.files = files || {};
  traceGeometryScene("change", elements);
  syncNativePropertiesFromSelection(appState);
  syncWhiteboardToolFromAppState(appState);
  syncGridStateFromAppState(appState);
  renderGridOverlay(appState);
  updateFrameBackgroundGestureMode(elements, appState);
  const rotationSnapApplied = applyRotationAssistDuringGesture(elements, appState);
  if (!rotationSnapApplied) {
    if (isFrameBackgroundLiveGesture()) {
      syncFrameBackgrounds(elements);
    } else {
      scheduleFrameBackgroundSync();
    }
  }
  updateSelectionState(appState);
  requestFrameBackgroundControlSync();
  if (state.focusToolsOpen) requestWhiteboardOverlayLayout();
  scheduleAutosaveForContentChange(elements, appState, files);
  if (appliedCollaborativeScene) {
    state.applyingCollaborativeScene = false;
    window.clearTimeout(state.collaborationApplyTimer);
    state.collaborationApplyTimer = null;
  }
}

function traceGeometryScene(event, changedElements = []) {
  if (!debugSceneEnabled) return;
  const summarize = (elements) => Array.from(elements || [])
    .map((element) => ({
      id: element.id,
      type: element.type,
      version: element.version,
      versionNonce: element.versionNonce,
      isDeleted: Boolean(element.isDeleted),
      fileId: element.fileId,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      angle: element.angle,
      frameId: element.frameId,
      backgroundColor: element.backgroundColor,
      opacity: element.opacity,
      locked: element.locked,
      customDataKeys: Object.keys(element.customData || {}),
      label: element.customData?.[GEOMETRY_FRAME_KEY]?.graph?.points?.[0]?.label || ""
    }));
  const snapshot = {
    event,
    changed: summarize(changedElements),
    live: summarize(state.api?.getSceneElements?.()),
    all: summarize(state.api?.getSceneElementsIncludingDeleted?.())
  };
  const signature = JSON.stringify(snapshot);
  if (signature === state.debugSceneSignature) return;
  state.debugSceneSignature = signature;
  state.debugSceneEvents.push(snapshot);
  state.debugSceneEvents = state.debugSceneEvents.slice(-24);
  document.documentElement.dataset.geometrySceneTrace = JSON.stringify(state.debugSceneEvents);
  console.info("KELP_GEOMETRY_SCENE", signature);
}

function handleNativePaste() {
  setStatus("Pasted");
  window.setTimeout(() => updateSelectionState(), 0);
  return true;
}

function renderLucideIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

function requestExcalidrawLayoutRefresh() {
  if (!state.api || state.excalidrawRefreshFrame) return;
  state.excalidrawRefreshFrame = window.requestAnimationFrame(() => {
    state.excalidrawRefreshFrame = null;
    state.api?.refresh?.();
    requestWhiteboardOverlayLayout();
    requestStandaloneDockLayout();
  });
}

function stabilizeExcalidrawLayout() {
  requestExcalidrawLayoutRefresh();
  window.setTimeout(requestExcalidrawLayoutRefresh, 120);
  window.setTimeout(requestExcalidrawLayoutRefresh, 420);
}

function initializeToolGroups() {
  document.querySelectorAll("[data-tool-group]").forEach((group) => {
    const toggle = group.querySelector("[data-tool-group-toggle]");
    const items = group.querySelector(".tool-group-items");
    if (!toggle || !items) return;

    setToolGroupExpanded(group, false);
    toggle.addEventListener("click", () => {
      const groupId = group.dataset.toolGroup || null;
      const expanded = group.classList.contains("is-expanded");
      const ownsVisibleProperties = groupId
        && state.nativePropertiesOwnerGroup === groupId
        && isNativePropertiesChainVisible();
      const ownsAppearancePopup = groupId === "board" && appearanceDialog.open;

      closeToolGroups();
      if (appearanceDialog.open) closeAppearanceDialog();
      if (expanded || ownsVisibleProperties || ownsAppearancePopup) {
        dismissNativePropertiesPanel();
        return;
      }

      dismissNativePropertiesPanel();
      setToolGroupExpanded(group, true);
    });

    items.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        if (group.dataset.toolGroup === "grid") return;
        window.requestAnimationFrame(() => setToolGroupExpanded(group, false));
      });
    });
  });

  stageEl.addEventListener("pointerdown", () => closeToolGroups());
  updateToolGroupActiveStates();
}

function initializePinnedTools() {
  document.querySelectorAll(".tool-group-items button").forEach((button) => {
    const toolId = getPinnableToolId(button);
    if (!toolId) return;

    pinnableToolButtons.set(toolId, button);

    const wrapper = document.createElement("div");
    wrapper.className = "pinnable-tool";
    wrapper.dataset.pinnableToolId = toolId;
    button.parentNode.insertBefore(wrapper, button);
    wrapper.append(button);
    button.draggable = true;
    button.addEventListener("dragstart", (event) => beginToolDrag(event, toolId, "source"));
    button.addEventListener("dragend", endToolDrag);
    wrapper.addEventListener("contextmenu", (event) => openToolContextMenu(event, toolId));
  });

  pinnedToolsGroup.hidden = false;
  pinnedToolsList.addEventListener("dragover", handlePinnedToolsDragOver);
  pinnedToolsList.addEventListener("dragleave", handlePinnedToolsDragLeave);
  pinnedToolsList.addEventListener("drop", handlePinnedToolsDrop);
  document.addEventListener("dragover", handleDocumentToolDragOver);
  document.addEventListener("drop", handleDocumentToolDrop);

  state.pinnedGroups = loadPinnedGroups();
  syncPinnedToolIds();
  savePinnedGroups();
  renderPinnedTools();
}

function getPinnableToolId(button) {
  if (button.closest("[data-tool-group]")?.dataset.toolGroup === "arrange") return "";
  if (button.dataset.action === "canvas-appearance") return "";
  if (button.dataset.tool) return `tool:${button.dataset.tool}`;
  if (button.dataset.geometryTool) return `geometry:${button.dataset.geometryTool}`;
  if (button.dataset.action) return `action:${button.dataset.action}`;
  if (button.dataset.export) return `export:${button.dataset.export}`;
  return "";
}

function loadPinnedGroups() {
  try {
    const savedGroups = JSON.parse(window.localStorage.getItem(PINNED_GROUPS_KEY) || "null");
    if (Array.isArray(savedGroups)) {
      const seenToolIds = new Set();
      return savedGroups.map((group, index) => normalizePinnedGroup(group, index, seenToolIds))
        .filter((group) => group.toolIds.length > 0);
    }
  } catch (error) {}

  try {
    const savedToolIds = JSON.parse(window.localStorage.getItem(PINNED_TOOLS_KEY) || "[]");
    const toolIds = Array.isArray(savedToolIds)
      ? Array.from(new Set(savedToolIds)).filter((toolId) => pinnableToolButtons.has(toolId))
      : [];
    if (!toolIds.length) return [];
    return [{
      id: createPinnedGroupId(),
      toolIds,
      position: loadLegacyPinnedPalettePosition() || defaultPinnedGroupPosition(0)
    }];
  } catch (error) {
    return [];
  }
}

function normalizePinnedGroup(group, index, seenToolIds = new Set()) {
  const source = group && typeof group === "object" ? group : {};
  const toolIds = Array.isArray(source.toolIds)
    ? source.toolIds.filter((toolId) => {
        if (!pinnableToolButtons.has(toolId) || seenToolIds.has(toolId)) return false;
        seenToolIds.add(toolId);
        return true;
      })
    : [];
  const position = source.position
    && Number.isFinite(source.position.left)
    && Number.isFinite(source.position.top)
    ? { left: source.position.left, top: source.position.top }
    : defaultPinnedGroupPosition(index);
  return {
    id: typeof source.id === "string" && source.id ? source.id : createPinnedGroupId(),
    toolIds,
    position
  };
}

function createPinnedGroupId() {
  if (typeof window.crypto?.randomUUID === "function") return window.crypto.randomUUID();
  return `pinned-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultPinnedGroupPosition(index = 0) {
  const columns = Math.max(1, Math.floor((window.innerWidth - 20) / 62));
  return {
    left: 10 + (index % columns) * 62,
    top: 10 + Math.floor(index / columns) * 76
  };
}

function loadLegacyPinnedPalettePosition() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PINNED_PALETTE_KEY) || "null");
    if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return null;
    return { left: saved.left, top: saved.top };
  } catch (error) {
    return null;
  }
}

function syncPinnedToolIds() {
  state.pinnedToolIds = state.pinnedGroups.flatMap((group) => group.toolIds);
}

function savePinnedGroups() {
  syncPinnedToolIds();
  try {
    window.localStorage.setItem(PINNED_GROUPS_KEY, JSON.stringify(state.pinnedGroups));
    window.localStorage.setItem(PINNED_TOOLS_KEY, JSON.stringify(state.pinnedToolIds));
  } catch (error) {
    setStatus("Pinned tools could not be saved", "error");
  }
}

function findPinnedGroup(groupId) {
  return state.pinnedGroups.find((group) => group.id === groupId) || null;
}

function findPinnedGroupByTool(toolId) {
  return state.pinnedGroups.find((group) => group.toolIds.includes(toolId)) || null;
}

function removeToolFromPinnedGroups(toolId) {
  let previous = null;
  state.pinnedGroups.forEach((group) => {
    const index = group.toolIds.indexOf(toolId);
    if (index < 0) return;
    previous = { groupId: group.id, index };
    group.toolIds.splice(index, 1);
  });
  state.pinnedGroups = state.pinnedGroups.filter((group) => group.toolIds.length > 0);
  return previous;
}

function togglePinnedTool(toolId) {
  if (state.pinnedToolIds.includes(toolId)) unpinTool(toolId);
  else pinToolAt(toolId, state.pinnedToolIds.length);
}

function pinToolAt(toolId, requestedIndex) {
  if (!pinnableToolButtons.has(toolId)) return;
  const previousIndex = state.pinnedToolIds.indexOf(toolId);
  removeToolFromPinnedGroups(toolId);
  syncPinnedToolIds();

  let targetIndex = Number(requestedIndex) || 0;
  if (previousIndex >= 0 && previousIndex < targetIndex) targetIndex -= 1;
  const index = clamp(targetIndex, 0, state.pinnedToolIds.length);
  if (!state.pinnedGroups.length) {
    state.pinnedGroups.push({
      id: createPinnedGroupId(),
      toolIds: [],
      position: defaultPinnedGroupPosition(0)
    });
  }

  let remaining = index;
  let targetGroup = state.pinnedGroups[state.pinnedGroups.length - 1];
  for (const group of state.pinnedGroups) {
    if (remaining <= group.toolIds.length) {
      targetGroup = group;
      break;
    }
    remaining -= group.toolIds.length;
  }
  targetGroup.toolIds.splice(clamp(remaining, 0, targetGroup.toolIds.length), 0, toolId);

  savePinnedGroups();
  renderPinnedTools();
  setStatus(previousIndex >= 0 ? `${getPinnableToolLabel(toolId)} reordered` : `${getPinnableToolLabel(toolId)} pinned`);
}

function movePinnedToolToGroup(toolId, groupId, requestedIndex) {
  if (!pinnableToolButtons.has(toolId)) return;
  const sourceGroup = findPinnedGroupByTool(toolId);
  let targetGroup = findPinnedGroup(groupId);
  if (!targetGroup) return;
  const wasPinned = Boolean(sourceGroup);

  if (sourceGroup === targetGroup) {
    const previousIndex = targetGroup.toolIds.indexOf(toolId);
    targetGroup.toolIds.splice(previousIndex, 1);
    let targetIndex = Number(requestedIndex) || 0;
    if (previousIndex >= 0 && previousIndex < targetIndex) targetIndex -= 1;
    const index = clamp(targetIndex, 0, targetGroup.toolIds.length);
    targetGroup.toolIds.splice(index, 0, toolId);
  } else {
    removeToolFromPinnedGroups(toolId);
    targetGroup = findPinnedGroup(groupId);
    if (!targetGroup) return;
    const index = clamp(Number(requestedIndex) || 0, 0, targetGroup.toolIds.length);
    targetGroup.toolIds.splice(index, 0, toolId);
  }

  savePinnedGroups();
  renderPinnedTools();
  setStatus(wasPinned ? `${getPinnableToolLabel(toolId)} moved` : `${getPinnableToolLabel(toolId)} pinned`);
}

function createPinnedGroupFromTool(toolId, afterGroupId) {
  if (!pinnableToolButtons.has(toolId)) return;
  const targetIndexBefore = state.pinnedGroups.findIndex((group) => group.id === afterGroupId);
  if (targetIndexBefore < 0) return;
  const targetPosition = { ...state.pinnedGroups[targetIndexBefore].position };
  const wasPinned = state.pinnedToolIds.includes(toolId);

  removeToolFromPinnedGroups(toolId);
  const targetIndex = state.pinnedGroups.findIndex((group) => group.id === afterGroupId);
  const insertionIndex = targetIndex >= 0
    ? targetIndex + 1
    : clamp(targetIndexBefore, 0, state.pinnedGroups.length);
  const group = {
    id: createPinnedGroupId(),
    toolIds: [toolId],
    position: offsetPinnedGroupPosition(targetPosition, insertionIndex)
  };
  state.pinnedGroups.splice(insertionIndex, 0, group);

  savePinnedGroups();
  renderPinnedTools();
  setStatus(wasPinned ? `${getPinnableToolLabel(toolId)} moved to a new group` : `${getPinnableToolLabel(toolId)} pinned in a new group`);
}

function offsetPinnedGroupPosition(position, fallbackIndex) {
  const proposedLeft = position.left + 62;
  if (proposedLeft + 52 <= window.innerWidth - 8) {
    return { left: proposedLeft, top: position.top };
  }
  const proposedTop = position.top + 76;
  if (proposedTop + 52 <= window.innerHeight - 8) {
    return { left: 10, top: proposedTop };
  }
  return defaultPinnedGroupPosition(fallbackIndex);
}

function unpinTool(toolId) {
  if (!state.pinnedToolIds.includes(toolId)) return;
  removeToolFromPinnedGroups(toolId);
  savePinnedGroups();
  renderPinnedTools();
  setStatus(`${getPinnableToolLabel(toolId)} unpinned`);
}

function renderPinnedTools() {
  syncPinnedToolIds();
  pinnedToolsList.replaceChildren();

  state.pinnedToolIds.forEach((toolId) => {
    const wrapper = createPinnedToolElement(toolId, findPinnedGroupByTool(toolId)?.id || null);
    if (wrapper) pinnedToolsList.append(wrapper);
  });

  if (state.pinnedToolIds.length === 0) {
    const emptyTarget = document.createElement("div");
    emptyTarget.className = "pinned-tools-empty-target";
    emptyTarget.setAttribute("aria-label", "Pin tools here");
    emptyTarget.title = "Drag or right-click a tool to pin it";
    emptyTarget.innerHTML = '<i data-lucide="pin" aria-hidden="true"></i>';
    pinnedToolsList.append(emptyTarget);
  }

  pinnedToolsList.classList.toggle("is-empty", state.pinnedToolIds.length === 0);
  document.body.classList.toggle("has-pinned-tools", state.pinnedToolIds.length > 0);
  updatePinnableToolStates();
  updatePinnedToolStates();
  renderFocusPinnedGroups();
  renderPinnedPaletteMode();
  renderGridAppearanceControls();
  renderLucideIcons();
}

function createPinnedToolElement(toolId, groupId = null) {
  const original = pinnableToolButtons.get(toolId);
  if (!original) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "pinned-tool";
  wrapper.dataset.pinnedToolId = toolId;
  if (groupId) wrapper.dataset.pinnedGroupId = groupId;
  wrapper.addEventListener("contextmenu", (event) => openToolContextMenu(event, toolId));

  const button = document.createElement("button");
  button.type = "button";
  button.className = `tool-button pinned-tool-button${original.classList.contains("danger") ? " danger" : ""}`;
  button.dataset.pinnedToolId = toolId;
  button.draggable = true;
  button.innerHTML = original.innerHTML;
  if (original.dataset.short) button.dataset.short = original.dataset.short;
  button.setAttribute("aria-label", original.getAttribute("aria-label") || getPinnableToolLabel(toolId));
  button.title = original.title || getPinnableToolLabel(toolId);
  button.addEventListener("click", () => activatePinnedTool(toolId, button));
  button.addEventListener("dragstart", (event) => beginToolDrag(event, toolId, "pinned", groupId));
  button.addEventListener("dragend", endToolDrag);

  wrapper.append(button);
  return wrapper;
}

function renderFocusPinnedGroups() {
  pinnedFocusLayer.replaceChildren();
  state.pinnedGroups.forEach((group) => {
    const palette = document.createElement("section");
    palette.className = "focus-pinned-group";
    palette.dataset.pinnedGroupId = group.id;
    palette.setAttribute("aria-label", "Pinned tool group");

    const heading = document.createElement("div");
    heading.className = "focus-pinned-group-heading";
    heading.title = "Drag this pinned tool group";
    heading.innerHTML = '<i data-lucide="grip-horizontal" aria-hidden="true"></i>';
    heading.addEventListener("pointerdown", (event) => beginPinnedPaletteDrag(event, group.id, palette));

    const list = document.createElement("div");
    list.className = "focus-pinned-group-list";
    group.toolIds.forEach((toolId) => {
      const wrapper = createPinnedToolElement(toolId, group.id);
      if (wrapper) list.append(wrapper);
    });
    list.addEventListener("dragover", (event) => handleFocusPinnedGroupDragOver(event, group.id, palette));
    list.addEventListener("drop", (event) => handleFocusPinnedGroupDrop(event, group.id, list));

    const splitTarget = document.createElement("div");
    splitTarget.className = "focus-pinned-group-split-target";
    splitTarget.setAttribute("aria-label", "Drop below to create a new pinned tool group");
    splitTarget.title = "Drop here to create a new group";
    splitTarget.addEventListener("dragover", (event) => handleFocusPinnedSplitDragOver(event, palette));
    splitTarget.addEventListener("dragleave", () => splitTarget.classList.remove("is-drag-over"));
    splitTarget.addEventListener("drop", (event) => handleFocusPinnedSplitDrop(event, group.id));

    palette.addEventListener("dragleave", (event) => {
      if (!palette.contains(event.relatedTarget)) palette.classList.remove("is-drag-over");
    });
    palette.append(heading, list, splitTarget);
    pinnedFocusLayer.append(palette);
  });
  applyPinnedPalettePosition();
}

function renderPinnedPaletteMode() {
  if (pinnedToolsGroup.parentNode !== pinnedToolsHome) pinnedToolsHome.append(pinnedToolsGroup);
  pinnedToolsGroup.classList.remove("is-floating");
  pinnedToolsGroup.style.removeProperty("left");
  pinnedToolsGroup.style.removeProperty("top");
  pinnedToolsGroup.hidden = state.focusMode && state.pinnedToolIds.length > 0;
  pinnedFocusLayer.hidden = !(state.focusMode && state.pinnedToolIds.length > 0);
  applyPinnedPalettePosition();
  updatePinnedPaletteSuppression();
  requestWhiteboardOverlayLayout();
}

function applyPinnedPalettePosition() {
  if (pinnedFocusLayer.hidden) return;
  pinnedFocusLayer.querySelectorAll(".focus-pinned-group").forEach((palette) => {
    const group = findPinnedGroup(palette.dataset.pinnedGroupId);
    if (!group) return;
    const rect = palette.getBoundingClientRect();
    const left = clamp(group.position.left, 8, Math.max(8, window.innerWidth - rect.width - 8));
    const top = clamp(group.position.top, 8, Math.max(8, window.innerHeight - rect.height - 8));
    group.position = { left, top };
    palette.style.left = `${left}px`;
    palette.style.top = `${top}px`;
  });
}

function beginPinnedPaletteDrag(event, groupId, palette) {
  if (!state.focusMode || event.button !== 0) return;
  const rect = palette.getBoundingClientRect();
  state.pinnedPaletteDrag = {
    groupId,
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  palette.classList.add("is-dragging-palette");
  event.preventDefault();
}

function movePinnedPalette(event) {
  const drag = state.pinnedPaletteDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const group = findPinnedGroup(drag.groupId);
  const palette = pinnedFocusLayer.querySelector(`[data-pinned-group-id="${drag.groupId}"]`);
  if (!group || !palette) return;
  const rect = palette.getBoundingClientRect();
  const left = clamp(event.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - rect.width - 8));
  const top = clamp(event.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - rect.height - 8));
  group.position = { left, top };
  palette.style.left = `${left}px`;
  palette.style.top = `${top}px`;
  requestWhiteboardOverlayLayout();
}

function endPinnedPaletteDrag(event) {
  const drag = state.pinnedPaletteDrag;
  if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
  state.pinnedPaletteDrag = null;
  pinnedFocusLayer.querySelector(`[data-pinned-group-id="${drag.groupId}"]`)
    ?.classList.remove("is-dragging-palette");
  savePinnedGroups();
}

async function activatePinnedTool(toolId, trigger = null) {
  const original = pinnableToolButtons.get(toolId);
  if (!original) return;

  const hadOpenMenu = Boolean(document.querySelector("[data-tool-group].is-expanded"))
    || isNativePropertiesChainVisible()
    || appearanceDialog.open
    || !gridAppearancePopover.hidden;
  const closesCurrentToolMenu = hadOpenMenu
    && original.dataset.tool
    && original.dataset.tool === state.activeWhiteboardTool;
  const closesGridAppearance = !gridAppearancePopover.hidden
    && original.dataset.action === "grid-appearance";
  closeToolGroups();
  closeAppearanceDialog();
  dismissNativePropertiesPanel();
  if (closesCurrentToolMenu || closesGridAppearance) return;

  if (original.dataset.tool) {
    setTool(original.dataset.tool, {
      ownerGroup: original.closest("[data-tool-group]")?.dataset.toolGroup || null
    });
  } else if (original.dataset.geometryTool) {
    await openGeometryEditor(original.dataset.geometryTool);
  } else if (original.dataset.action) {
    await runAction(original.dataset.action, trigger || original);
  } else if (original.dataset.export) {
    await exportBoard(original.dataset.export);
  }
}

function getPinnableToolLabel(toolId) {
  const button = pinnableToolButtons.get(toolId);
  return button?.getAttribute("aria-label")
    || button?.title
    || button?.textContent?.trim()
    || "Tool";
}

function updatePinnableToolStates() {
  document.querySelectorAll("[data-pinnable-tool-id]").forEach((wrapper) => {
    wrapper.classList.toggle("is-pinned", state.pinnedToolIds.includes(wrapper.dataset.pinnableToolId));
  });
}

function beginToolDrag(event, toolId, source, groupId = null) {
  if (!event.dataTransfer) return;
  closeToolContextMenu();
  state.draggedToolId = toolId;
  state.draggedToolSource = source;
  state.draggedToolGroupId = groupId || findPinnedGroupByTool(toolId)?.id || null;
  document.body.classList.add("is-tool-dragging");
  event.dataTransfer.effectAllowed = source === "pinned" ? "move" : "copy";
  event.dataTransfer.setData("text/plain", toolId);
  event.currentTarget.closest(".pinnable-tool, .pinned-tool")?.classList.add("is-dragging");
  pinnedToolsGroup.classList.add("is-drop-ready");
  pinnedFocusLayer.classList.add("is-drop-ready");
  requestWhiteboardOverlayLayout();
}

function endToolDrag(event) {
  event.currentTarget?.closest?.(".pinnable-tool, .pinned-tool")?.classList.remove("is-dragging");
  clearToolDragState();
}

function clearToolDragState() {
  state.draggedToolId = null;
  state.draggedToolSource = null;
  state.draggedToolGroupId = null;
  document.body.classList.remove("is-tool-dragging");
  pinnedToolsGroup.classList.remove("is-drop-ready", "is-drag-over");
  pinnedFocusLayer.classList.remove("is-drop-ready");
  pinnedFocusLayer.querySelectorAll(".is-drag-over").forEach((element) => {
    element.classList.remove("is-drag-over");
  });
  requestWhiteboardOverlayLayout();
}

function handlePinnedToolsDragOver(event) {
  if (!state.draggedToolId) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = state.draggedToolSource === "pinned" ? "move" : "copy";
  pinnedToolsGroup.classList.add("is-drag-over");
}

function handlePinnedToolsDragLeave(event) {
  if (!pinnedToolsGroup.contains(event.relatedTarget)) pinnedToolsGroup.classList.remove("is-drag-over");
}

function handlePinnedToolsDrop(event) {
  if (!state.draggedToolId) return;
  event.preventDefault();
  event.stopPropagation();
  const toolId = state.draggedToolId;
  const index = pinnedToolDropIndex(event.clientX, event.clientY);
  clearToolDragState();
  pinToolAt(toolId, index);
}

function pinnedToolDropIndex(clientX, clientY) {
  const items = Array.from(pinnedToolsList.querySelectorAll(".pinned-tool"));
  for (let index = 0; index < items.length; index += 1) {
    const rect = items[index].getBoundingClientRect();
    const nextRect = items[index + 1]?.getBoundingClientRect();
    if (clientY < rect.top) return index;
    if (clientY <= rect.bottom) {
      if (clientX < rect.left + rect.width / 2) return index;
      if (!nextRect || Math.abs(nextRect.top - rect.top) > 4) return index + 1;
    }
  }
  return items.length;
}

function handleFocusPinnedGroupDragOver(event, groupId, palette) {
  if (!state.draggedToolId || !findPinnedGroup(groupId)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = state.draggedToolSource === "pinned" ? "move" : "copy";
  }
  palette.classList.add("is-drag-over");
}

function handleFocusPinnedGroupDrop(event, groupId, list) {
  if (!state.draggedToolId) return;
  event.preventDefault();
  event.stopPropagation();
  const toolId = state.draggedToolId;
  const index = focusPinnedToolDropIndex(list, event.clientY);
  clearToolDragState();
  movePinnedToolToGroup(toolId, groupId, index);
}

function focusPinnedToolDropIndex(list, clientY) {
  const items = Array.from(list.querySelectorAll(":scope > .pinned-tool"));
  for (let index = 0; index < items.length; index += 1) {
    const rect = items[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return items.length;
}

function handleFocusPinnedSplitDragOver(event, palette) {
  if (!state.draggedToolId) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = state.draggedToolSource === "pinned" ? "move" : "copy";
  }
  palette.classList.remove("is-drag-over");
  event.currentTarget.classList.add("is-drag-over");
}

function handleFocusPinnedSplitDrop(event, afterGroupId) {
  if (!state.draggedToolId) return;
  event.preventDefault();
  event.stopPropagation();
  const toolId = state.draggedToolId;
  clearToolDragState();
  createPinnedGroupFromTool(toolId, afterGroupId);
}

function isPinnedToolDropSurface(target) {
  return pinnedToolsGroup.contains(target) || pinnedFocusLayer.contains(target);
}

function handleDocumentToolDragOver(event) {
  if (state.draggedToolSource === "pinned" && !isPinnedToolDropSurface(event.target)) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }
}

function handleDocumentToolDrop(event) {
  if (state.draggedToolSource !== "pinned" || !state.draggedToolId || isPinnedToolDropSurface(event.target)) return;
  event.preventDefault();
  const toolId = state.draggedToolId;
  clearToolDragState();
  unpinTool(toolId);
}

function openToolContextMenu(event, toolId) {
  event.preventDefault();
  event.stopPropagation();
  const isPinned = state.pinnedToolIds.includes(toolId);
  const action = isPinned ? "Unpin" : "Pin";
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.innerHTML = `<i data-lucide="${isPinned ? "pin-off" : "pin"}" aria-hidden="true"></i><span>${action}</span>`;
  button.addEventListener("click", () => {
    togglePinnedTool(toolId);
    closeToolContextMenu();
  });

  toolContextMenu.replaceChildren(button);
  toolContextMenu.hidden = false;
  toolContextMenu.style.left = "0px";
  toolContextMenu.style.top = "0px";
  renderLucideIcons();

  const rect = toolContextMenu.getBoundingClientRect();
  toolContextMenu.style.left = `${clamp(event.clientX, 8, Math.max(8, window.innerWidth - rect.width - 8))}px`;
  toolContextMenu.style.top = `${clamp(event.clientY, 8, Math.max(8, window.innerHeight - rect.height - 8))}px`;
  button.focus({ preventScroll: true });
}

function closeToolContextMenu() {
  toolContextMenu.hidden = true;
  toolContextMenu.replaceChildren();
}

function handleToolContextMenuOutsidePointer(event) {
  if (!toolContextMenu.hidden && !toolContextMenu.contains(event.target)) closeToolContextMenu();
}

function updatePinnedToolStates() {
  document.querySelectorAll("[data-pinned-tool-id]").forEach((button) => {
    const original = pinnableToolButtons.get(button.dataset.pinnedToolId);
    const active = Boolean(original?.classList.contains("active"));
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setToolGroupExpanded(group, expanded) {
  const toggle = group?.querySelector("[data-tool-group-toggle]");
  const items = group?.querySelector(".tool-group-items");
  if (!group || !toggle || !items) return;

  if (!expanded && group.dataset.toolGroup === "grid") {
    closeGridAppearancePopover();
  }

  if (expanded) {
    layoutWhiteboardToolbar();
    positionToolGroupFlyout(group);
  }

  group.classList.toggle("is-expanded", expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
  items.setAttribute("aria-hidden", String(!expanded));
  items.inert = !expanded;
  updateWhiteboardOverlayOffsets();
  updatePinnedPaletteSuppression();
  requestWhiteboardOverlayLayout();
}

function requestWhiteboardOverlayLayout() {
  if (state.overlayLayoutFrame) return;
  state.overlayLayoutFrame = window.requestAnimationFrame(() => {
    state.overlayLayoutFrame = null;
    layoutWhiteboardToolbar();
    const expandedGroup = document.querySelector("[data-tool-group].is-expanded");
    if (expandedGroup) positionToolGroupFlyout(expandedGroup);
    if (!gridAppearancePopover.hidden) positionGridAppearancePopover();
    updateWhiteboardOverlayOffsets();
    updatePinnedPaletteSuppression();
  });
}

function layoutWhiteboardToolbar() {
  const rect = whiteboardToolbar.getBoundingClientRect();
  if (!rect.height) return;

  const containerRect = whiteboardToolbar.offsetParent?.getBoundingClientRect();
  const containerHeight = containerRect?.height || window.innerHeight;
  const topInset = 10;
  const centeredTop = (containerHeight - rect.height) / 2;
  const latestViewportTop = Math.max(topInset, containerHeight - topInset - rect.height);
  let top = clamp(centeredTop, topInset, latestViewportTop);

  if (isEmbedded) {
    const bottomInset = getActiveBottomDockInset(10);
    const latestDockSafeTop = Math.max(topInset, containerHeight - bottomInset - rect.height);
    top = clamp(centeredTop, topInset, latestDockSafeTop);
  } else if (isStandaloneDockVisible()) {
    const dockRect = standaloneDock.getBoundingClientRect();
    const containerLeft = containerRect?.left || 0;
    const toolbarLeft = containerLeft + 10;
    const toolbarRight = toolbarLeft + rect.width;
    const overlapsDockHorizontally = toolbarLeft < dockRect.right && toolbarRight > dockRect.left;
    const dockTop = dockRect.top - (containerRect?.top || 0);
    if (overlapsDockHorizontally && top + rect.height > dockTop - 10) {
      top = Math.max(topInset, dockTop - rect.height - 10);
    }
  }

  whiteboardToolbar.style.top = `${Math.round(top)}px`;
  document.body.style.setProperty("--whiteboard-toolbar-top", `${Math.round(top)}px`);
}

function positionToolGroupFlyout(group) {
  const toggle = group?.querySelector("[data-tool-group-toggle]");
  const items = group?.querySelector(".tool-group-items");
  if (!toggle || !items) return;

  const toggleRect = toggle.getBoundingClientRect();
  const itemCount = items.querySelectorAll("button").length;
  const flyoutHeight = Math.min(420, 12 + itemCount * 38 + Math.max(0, itemCount - 1) * 4);
  const safeTop = 8;
  const bottomInset = getActiveBottomDockInset(8);
  const safeBottom = Math.max(safeTop + 80, window.innerHeight - bottomInset);
  const availableHeight = Math.max(80, safeBottom - safeTop);
  const renderedHeight = Math.min(flyoutHeight, availableHeight);
  const latestTop = Math.max(safeTop, safeBottom - renderedHeight);
  const top = clamp(toggleRect.top - 6, safeTop, latestTop);
  items.style.left = `${Math.round(toggleRect.right + 26)}px`;
  items.style.top = `${Math.round(top)}px`;
  items.style.maxHeight = `${Math.floor(availableHeight)}px`;
}

function updateWhiteboardOverlayOffsets() {
  const toolbarRect = whiteboardToolbar.getBoundingClientRect();
  const toolbarStyles = window.getComputedStyle(whiteboardToolbar);
  const toolbarParentRect = whiteboardToolbar.offsetParent?.getBoundingClientRect();
  const configuredRailLeft = Number.parseFloat(
    toolbarStyles.getPropertyValue("--whiteboard-rail-left")
  );
  const toolbarLayoutLeft = Number.isFinite(configuredRailLeft)
    ? configuredRailLeft
    : Number.parseFloat(toolbarStyles.left);
  let toolbarTranslateX = 0;
  try {
    toolbarTranslateX = toolbarStyles.transform === "none"
      ? 0
      : new DOMMatrixReadOnly(toolbarStyles.transform).m41;
  } catch (error) {}
  const toolbarRight = Number.isFinite(toolbarLayoutLeft)
    ? (toolbarParentRect?.left || 0) + toolbarLayoutLeft + toolbarRect.width
    : toolbarRect.right - toolbarTranslateX;
  const expanded = document.querySelector("[data-tool-group].is-expanded .tool-group-items");
  const expandedRect = expanded?.getBoundingClientRect();
  const right = Math.max(toolbarRight, expandedRect?.right || 0);
  document.body.style.setProperty("--whiteboard-control-left", `${Math.ceil(right + 12)}px`);
}

function updatePinnedPaletteSuppression() {
  const shouldCheck = state.focusMode
    && state.focusToolsOpen
    && !pinnedFocusLayer.hidden;
  const collisionElements = [
    whiteboardToolbar,
    document.querySelector("[data-tool-group].is-expanded .tool-group-items"),
    !gridAppearancePopover.hidden ? gridAppearancePopover : null,
    ...document.querySelectorAll(".excalidraw .selected-shape-actions, .excalidraw .selected-shape-actions *")
  ].filter(Boolean);

  let anySuppressed = false;
  pinnedFocusLayer.querySelectorAll(".focus-pinned-group").forEach((palette) => {
    const pinnedRect = palette.getBoundingClientRect();
    const overlapsTools = shouldCheck && collisionElements.some((element) => {
      const styles = window.getComputedStyle(element);
      if (styles.display === "none" || styles.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      return rectanglesOverlap(pinnedRect, rect, 8);
    });
    palette.classList.toggle("is-suppressed-for-tools", overlapsTools);
    palette.setAttribute("aria-hidden", String(overlapsTools));
    anySuppressed ||= overlapsTools;
  });
  state.pinnedPaletteSuppressed = anySuppressed;
}

function rectanglesOverlap(first, second, padding = 0) {
  return first.left < second.right + padding
    && first.right > second.left - padding
    && first.top < second.bottom + padding
    && first.bottom > second.top - padding;
}

function closeToolGroups(except = null) {
  document.querySelectorAll("[data-tool-group].is-expanded").forEach((group) => {
    if (group !== except) setToolGroupExpanded(group, false);
  });
  if (except?.dataset.toolGroup !== "grid") closeGridAppearancePopover();
}

function updateToolGroupActiveStates() {
  document.querySelectorAll("[data-tool-group]").forEach((group) => {
    group.classList.toggle("has-active-tool", Boolean(group.querySelector(".tool-button.active")));
  });
}

function setStatus(message, type = "normal", sticky = false) {
  window.clearTimeout(state.statusTimer);
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", type === "error");

  if (!sticky && message !== "Ready") {
    state.statusTimer = window.setTimeout(() => {
      statusEl.textContent = "Ready";
      statusEl.classList.remove("is-error");
    }, 2400);
  }
}

function ensureApi() {
  if (!state.api) {
    setStatus("Still loading", "error");
    return false;
  }
  return true;
}

function handleWhiteboardShortcut(event) {
  if (isTypingTarget(event.target)) return;
  if (appearanceDialog.open) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeAppearanceDialog();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.code === "Quote") {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleFullGrid();
    return;
  }
  if (isEmbedded
    && event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && CLASSROOM_SHORTCUT_CODES.has(event.code)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage({
      type: "kelp:classroom-shortcut",
      code: event.code
    }, window.location.origin);
    return;
  }
  if (!isEmbedded
    && event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && ["Digit1", "Digit2", "Digit3", "Digit4"].includes(event.code)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === "Digit1") void toggleStandaloneFullscreen();
    if (event.code === "Digit2") requestClassroomFocusMode(!state.focusMode);
    if (event.code === "Digit3") runWhiteboardViewCommand("center");
    if (event.code === "Digit4") runWhiteboardViewCommand("fit");
    return;
  }
  if (!geometryShell.classList.contains("is-hidden") && geometryShell.contains(event.target)) return;
  if (!toolContextMenu.hidden && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeToolContextMenu();
    return;
  }
  if (state.focusMode && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    requestClassroomFocusMode(false);
    return;
  }
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key === "g") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGeometryEditor();
      return;
    }
    if (GEOMETRY_SHORTCUTS[key]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGeometryEditor(GEOMETRY_SHORTCUTS[key]);
    }
    return;
  }

  const drawingShortcuts = {
    h: "hand",
    v: "selection",
    "1": "selection",
    r: "rectangle",
    "2": "rectangle",
    d: "diamond",
    "3": "diamond",
    o: "ellipse",
    "4": "ellipse",
    a: "arrow",
    "5": "arrow",
    l: "line",
    "6": "line",
    p: "freedraw",
    "7": "freedraw",
    t: "text",
    "8": "text",
    e: "eraser",
    "0": "eraser",
    f: "frame",
    k: "laser"
  };
  if (drawingShortcuts[key]) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setTool(drawingShortcuts[key]);
  }
}

function handleClassroomMessage(event) {
  if (!isEmbedded || event.origin !== window.location.origin || event.source !== window.parent) return;
  if (event.data?.type === "kelp:whiteboard-focus") {
    setWhiteboardFocusMode(Boolean(event.data.enabled));
    return;
  }
  if (event.data?.type === "kelp:whiteboard-dock-state") {
    setClassroomDockOpen(
      Boolean(event.data.open),
      event.data.bottomInset,
      event.data.footerBottomInset,
      event.data.rightInset,
      event.data.nativeControlsBottomInset
    );
    return;
  }
  if (event.data?.type === "kelp:whiteboard-view") {
    const mode = event.data.mode;
    if (!["center", "fit"].includes(mode)) return;
    if (!state.api) {
      state.pendingViewCommand = mode;
      return;
    }
    runWhiteboardViewCommand(mode);
  }
}

function runWhiteboardViewCommand(mode) {
  const elements = state.api?.getSceneElements?.() || state.elements.filter((element) => !element.isDeleted);
  if (!elements.length) {
    setStatus("Nothing on the board yet");
    return;
  }
  if (!state.api?.scrollToContent) {
    setStatus("View control unavailable", "error");
    return;
  }

  const fitToContent = mode === "fit";
  state.api.scrollToContent(elements, {
    fitToContent,
    animate: true
  });
  setStatus(fitToContent ? "Content fitted to view" : "Returned to content");
}

function initializeStandaloneControls() {
  const standalone = !isEmbedded;
  standaloneDock.hidden = !standalone;
  standaloneDockEdge.hidden = !standalone;
  standaloneTimerPanel.hidden = true;
  standaloneFloatingTimer.hidden = true;
  if (!standalone) return;

  standaloneDock.addEventListener("pointerenter", keepStandaloneDockOpen);
  standaloneDock.addEventListener("pointerleave", scheduleStandaloneDockHide);
  standaloneDock.addEventListener("focusin", keepStandaloneDockOpen);
  standaloneDock.addEventListener("focusout", scheduleStandaloneDockHide);
  standaloneDockEdge.addEventListener("pointerenter", revealStandaloneDock);
  standaloneDockEdge.addEventListener("pointerleave", scheduleStandaloneDockHide);
  standaloneDockEdge.addEventListener("focus", revealStandaloneDock);
  standaloneDockEdge.addEventListener("blur", scheduleStandaloneDockHide);
  standaloneDockEdge.addEventListener("click", () => {
    revealStandaloneDock();
    standaloneDockEdge.blur();
  });
  pinStandaloneDockButton.addEventListener("click", toggleStandaloneDockPinned);
  standaloneFullscreenButton.addEventListener("click", toggleStandaloneFullscreen);
  standaloneFocusButton.addEventListener("click", () => {
    requestClassroomFocusMode(!state.focusMode);
  });
  standaloneCenterContentButton.addEventListener("click", () => runWhiteboardViewCommand("center"));
  standaloneAutoFitButton.addEventListener("click", () => runWhiteboardViewCommand("fit"));
  standaloneTimeButton.addEventListener("click", () => {
    setStandaloneTimerPanelOpen(!state.standaloneTimerPanelOpen);
  });
  standaloneExitButton.addEventListener("click", exitStandaloneWhiteboard);

  closeStandaloneTimerPanelButton.addEventListener("click", () => setStandaloneTimerPanelOpen(false));
  startStandaloneCountdownButton.addEventListener("click", startStandaloneCountdown);
  pauseStandaloneCountdownButton.addEventListener("click", pauseStandaloneCountdown);
  resetStandaloneCountdownButton.addEventListener("click", resetStandaloneCountdown);
  toggleStandaloneCountdownBoxButton.addEventListener("click", toggleStandaloneCountdownBox);
  standaloneTimerPanelHeader.addEventListener("pointerdown", (event) => {
    beginStandaloneFloatingDrag(event, "panel");
  });
  standaloneFloatingTimerHeader.addEventListener("pointerdown", (event) => {
    beginStandaloneFloatingDrag(event, "timer");
  });
  window.addEventListener("pointermove", moveStandaloneFloatingElement);
  window.addEventListener("pointerup", endStandaloneFloatingDrag);
  window.addEventListener("pointercancel", endStandaloneFloatingDrag);
  window.addEventListener("resize", () => {
    requestStandaloneDockLayout();
    constrainStandaloneFloatingElements();
  });
  window.addEventListener("beforeunload", stopStandaloneCountdownTick);
  document.addEventListener("fullscreenchange", renderStandaloneFullscreenState);

  renderStandaloneTimer();
  renderStandaloneDockState();
}

function isStandaloneDockVisible() {
  if (isEmbedded) return false;
  return !state.focusMode || state.standaloneDockOpen || state.standaloneDockPinned;
}

function revealStandaloneDock() {
  if (!state.focusMode || isEmbedded) return;
  clearStandaloneDockHideTimer();
  state.standaloneDockOpen = true;
  renderStandaloneDockState();
}

function keepStandaloneDockOpen() {
  if (!state.focusMode || isEmbedded) return;
  clearStandaloneDockHideTimer();
  state.standaloneDockOpen = true;
  renderStandaloneDockState();
}

function scheduleStandaloneDockHide(event) {
  if (!state.focusMode || state.standaloneDockPinned || isEmbedded) return;
  const relatedTarget = event?.relatedTarget;
  if (relatedTarget && isInsideStandaloneDockRegion(relatedTarget)) return;

  clearStandaloneDockHideTimer();
  state.standaloneDockHideTimer = window.setTimeout(() => {
    state.standaloneDockHideTimer = null;
    if (standaloneDock.matches(":hover") || standaloneDockEdge.matches(":hover")) return;
    state.standaloneDockOpen = false;
    renderStandaloneDockState();
  }, FOCUS_BAR_HIDE_DELAY);
}

function clearStandaloneDockHideTimer() {
  if (state.standaloneDockHideTimer) window.clearTimeout(state.standaloneDockHideTimer);
  state.standaloneDockHideTimer = null;
}

function isInsideStandaloneDockRegion(target) {
  return standaloneDock.contains(target) || standaloneDockEdge.contains(target);
}

function toggleStandaloneDockPinned() {
  if (!state.focusMode || isEmbedded) return;
  clearStandaloneDockHideTimer();
  state.standaloneDockPinned = !state.standaloneDockPinned;
  state.standaloneDockOpen = true;
  renderStandaloneDockState();
}

function renderStandaloneDockState() {
  if (isEmbedded) return;
  if (!state.focusMode) state.standaloneDockOpen = true;
  const dockVisible = isStandaloneDockVisible();
  document.body.classList.toggle("is-standalone-dock-open", dockVisible);
  standaloneDockEdge.tabIndex = state.focusMode ? 0 : -1;
  standaloneDockEdge.setAttribute("aria-hidden", String(!state.focusMode));
  pinStandaloneDockButton.hidden = !state.focusMode;
  pinStandaloneDockButton.setAttribute("aria-pressed", String(state.standaloneDockPinned));
  const pinLabel = state.standaloneDockPinned
    ? "Allow whiteboard controls to auto-hide"
    : "Keep whiteboard controls open";
  pinStandaloneDockButton.setAttribute("aria-label", pinLabel);
  pinStandaloneDockButton.title = pinLabel;

  standaloneFocusButton.setAttribute("aria-pressed", String(state.focusMode));
  const focusRenderState = state.focusMode ? "active" : "inactive";
  let iconChanged = false;
  if (standaloneFocusButton.dataset.renderState !== focusRenderState) {
    standaloneFocusButton.dataset.renderState = focusRenderState;
    standaloneFocusButton.innerHTML = state.focusMode
      ? '<i data-lucide="minimize-2" aria-hidden="true"></i><span>Focus</span>'
      : '<i data-lucide="maximize-2" aria-hidden="true"></i><span>Focus</span>';
    iconChanged = true;
  }
  const focusLabel = state.focusMode ? "Exit whiteboard focus" : "Focus whiteboard";
  standaloneFocusButton.setAttribute("aria-label", focusLabel);
  standaloneFocusButton.title = `${focusLabel} (Alt+2)`;
  standaloneTimeButton.classList.toggle("active", state.standaloneTimerPanelOpen);
  standaloneTimeButton.setAttribute("aria-expanded", String(state.standaloneTimerPanelOpen));
  if (iconChanged) renderLucideIcons();
  renderStandaloneFullscreenState();
  requestStandaloneDockLayout();
  window.clearTimeout(state.standaloneDockSettleTimer);
  state.standaloneDockSettleTimer = dockVisible
    ? window.setTimeout(requestStandaloneDockLayout, 230)
    : null;
}

function requestStandaloneDockLayout() {
  if (isEmbedded || state.standaloneDockLayoutFrame) return;
  state.standaloneDockLayoutFrame = window.requestAnimationFrame(() => {
    state.standaloneDockLayoutFrame = null;
    updateStandaloneDockLayout();
  });
}

function updateStandaloneDockLayout() {
  const dockVisible = isStandaloneDockVisible();
  const rect = dockVisible ? standaloneDock.getBoundingClientRect() : null;
  const nativeControlsRect = dockVisible ? getNativeFooterControlsRect() : null;
  const nativeBottom = rect?.height && nativeControlsRect?.height
    ? 10 + Math.max(0, (rect.height - nativeControlsRect.height) / 2)
    : 18;
  const bottomInset = rect?.height
    ? Math.ceil(window.innerHeight - rect.top + 10)
    : 10;
  const footerInset = bottomInset;
  const rightInset = rect?.width
    ? Math.max(8, Math.ceil(window.innerWidth - rect.right))
    : 12;
  const changed = state.standaloneDockBottomInset !== bottomInset
    || state.standaloneDockFooterInset !== footerInset
    || state.standaloneDockRightInset !== rightInset;

  state.standaloneDockBottomInset = bottomInset;
  state.standaloneDockFooterInset = footerInset;
  state.standaloneDockRightInset = rightInset;
  document.body.style.setProperty("--standalone-dock-safe-inset", `${bottomInset}px`);
  document.body.style.setProperty("--standalone-footer-safe-inset", `${footerInset}px`);
  document.body.style.setProperty("--standalone-dock-right-inset", `${rightInset}px`);
  document.body.style.setProperty("--standalone-native-controls-bottom", `${nativeBottom}px`);
  requestNativeControlsLayout();
  if (changed) {
    requestExcalidrawLayoutRefresh();
    requestWhiteboardOverlayLayout();
    requestNativeContextMenuLayout();
  }
  constrainStandaloneFloatingElements();
}

function getNativeFooterControlsRect() {
  const buttonRects = Array.from(rootEl.querySelectorAll(".App-menu_bottom button"))
    .map((button) => {
      const styles = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return styles.display !== "none" && styles.visibility !== "hidden" && rect.width && rect.height
        ? rect
        : null;
    })
    .filter(Boolean);
  if (!buttonRects.length) return null;

  const left = Math.min(...buttonRects.map((rect) => rect.left));
  const top = Math.min(...buttonRects.map((rect) => rect.top));
  const right = Math.max(...buttonRects.map((rect) => rect.right));
  const bottom = Math.max(...buttonRects.map((rect) => rect.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function requestNativeControlsLayout() {
  if (state.nativeControlsLayoutFrame) return;
  state.nativeControlsLayoutFrame = window.requestAnimationFrame(() => {
    state.nativeControlsLayoutFrame = null;
    updateNativeControlsLayout();
  });
}

function updateNativeControlsLayout() {
  const nativeControlsRect = getNativeFooterControlsRect();
  const compactToolbar = rootEl.querySelector(".App-bottom-bar");
  const viewportTooSmall = window.innerWidth < NATIVE_CONTROLS_MIN_VIEWPORT_WIDTH
    || window.innerHeight < NATIVE_CONTROLS_MIN_VIEWPORT_HEIGHT;
  const compactLayoutActive = Boolean(compactToolbar && !nativeControlsRect);
  const dockVisible = state.classroomDockOpen || isStandaloneDockVisible();

  let placement = viewportTooSmall || compactLayoutActive ? "hidden" : "corner";
  let stackRightInset = 12;
  let stackBottomInset = 12;
  let cornerBottomInset = 18;

  if (dockVisible && placement !== "hidden") {
    let availableRight = window.innerWidth;
    if (isEmbedded) {
      availableRight = state.classroomDockRightInset;
      stackRightInset = state.classroomDockRightInset;
      stackBottomInset = state.classroomDockBottomInset;
      cornerBottomInset = state.classroomNativeControlsBottomInset;
    } else {
      const dockRect = standaloneDock.getBoundingClientRect();
      availableRight = Math.max(0, window.innerWidth - dockRect.right);
      stackRightInset = Math.max(8, Math.ceil(availableRight));
      stackBottomInset = state.standaloneDockBottomInset;
      cornerBottomInset = Number.parseFloat(
        document.body.style.getPropertyValue("--standalone-native-controls-bottom")
      ) || 18;
    }

    const nativeWidth = nativeControlsRect?.width || NATIVE_CONTROLS_FALLBACK_WIDTH;
    if (availableRight < nativeWidth + 16) placement = "stacked";
  }

  document.body.classList.toggle("is-native-controls-corner", placement === "corner");
  document.body.classList.toggle("is-native-controls-stacked", placement === "stacked");
  document.body.classList.toggle("is-native-controls-hidden", placement === "hidden");
  document.body.dataset.nativeControlsPlacement = placement;
  document.body.style.setProperty("--native-controls-stack-right", `${stackRightInset}px`);
  document.body.style.setProperty("--native-controls-stack-bottom", `${stackBottomInset}px`);
  document.body.style.setProperty("--native-controls-corner-bottom", `${cornerBottomInset}px`);

  if (state.nativeControlsPlacement !== placement) {
    state.nativeControlsPlacement = placement;
    requestNativeContextMenuLayout();
    requestWhiteboardOverlayLayout();
  }
}

async function toggleStandaloneFullscreen() {
  try {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen !== "function") throw new Error("Fullscreen exit unavailable");
      await document.exitFullscreen();
    } else {
      if (typeof document.documentElement.requestFullscreen !== "function") {
        setStatus("Fullscreen unavailable", "error");
        return;
      }
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    setStatus("Fullscreen unavailable", "error");
  }
  renderStandaloneFullscreenState();
}

function renderStandaloneFullscreenState() {
  if (isEmbedded) return;
  const fullscreen = Boolean(document.fullscreenElement);
  const renderState = fullscreen ? "active" : "inactive";
  if (standaloneFullscreenButton.dataset.renderState !== renderState) {
    standaloneFullscreenButton.dataset.renderState = renderState;
    standaloneFullscreenButton.innerHTML = fullscreen
      ? '<i data-lucide="minimize" aria-hidden="true"></i><span>Full</span>'
      : '<i data-lucide="maximize" aria-hidden="true"></i><span>Full</span>';
    renderLucideIcons();
  }
  const label = fullscreen ? "Exit fullscreen" : "Fullscreen";
  standaloneFullscreenButton.setAttribute("aria-label", label);
  standaloneFullscreenButton.title = `${label} (Alt+1)`;
}

function exitStandaloneWhiteboard() {
  if (isEmbedded) return;
  saveToLocal(false);

  if (window.opener && !window.opener.closed) {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign("../dashboard/tutor-dashboard.html");
    }, 120);
    return;
  }

  if (window.history.length > 1 && document.referrer) {
    window.history.back();
    return;
  }
  window.location.assign("../dashboard/tutor-dashboard.html");
}

function setStandaloneTimerPanelOpen(open) {
  if (isEmbedded) return;
  state.standaloneTimerPanelOpen = Boolean(open);
  standaloneTimerPanel.hidden = !state.standaloneTimerPanelOpen;
  standaloneTimeButton.classList.toggle("active", state.standaloneTimerPanelOpen);
  standaloneTimeButton.setAttribute("aria-expanded", String(state.standaloneTimerPanelOpen));
  if (state.standaloneTimerPanelOpen) {
    window.requestAnimationFrame(constrainStandaloneFloatingElements);
  }
}

function startStandaloneCountdown() {
  const timer = state.standaloneTimer;
  const resuming = timer.status === "paused";
  const seconds = resuming
    ? Math.max(1, Number(timer.remainingSeconds || 0))
    : clampStandaloneTimerMinutes() * 60;
  const now = Date.now();

  primeStandaloneTimerAudio();
  state.standaloneTimer = {
    status: "running",
    durationSeconds: resuming ? timer.durationSeconds : seconds,
    remainingSeconds: seconds,
    boxVisible: true,
    startedAt: resuming ? timer.startedAt || new Date(now).toISOString() : new Date(now).toISOString(),
    endsAt: new Date(now + seconds * 1000).toISOString(),
    finishedAt: null
  };
  state.standaloneTimerLastToneKey = null;
  updateStandaloneCountdownTick();
  renderStandaloneTimer();
}

function pauseStandaloneCountdown() {
  const timer = state.standaloneTimer;
  if (timer.status !== "running") return;
  state.standaloneTimer = {
    ...timer,
    status: "paused",
    remainingSeconds: getStandaloneTimerRemainingSeconds(timer),
    endsAt: null
  };
  updateStandaloneCountdownTick();
  renderStandaloneTimer();
}

function resetStandaloneCountdown() {
  if (state.standaloneTimer.status === "idle") return;
  if (!window.confirm("Restart the countdown?")) return;

  const seconds = clampStandaloneTimerMinutes() * 60;
  const now = Date.now();
  primeStandaloneTimerAudio();
  state.standaloneTimer = {
    status: "running",
    durationSeconds: seconds,
    remainingSeconds: seconds,
    boxVisible: true,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + seconds * 1000).toISOString(),
    finishedAt: null
  };
  state.standaloneTimerLastToneKey = null;
  updateStandaloneCountdownTick();
  renderStandaloneTimer();
}

function toggleStandaloneCountdownBox() {
  if (state.standaloneTimer.status === "idle") return;
  state.standaloneTimer = {
    ...state.standaloneTimer,
    boxVisible: !state.standaloneTimer.boxVisible
  };
  renderStandaloneTimer();
}

function clampStandaloneTimerMinutes() {
  const minutes = Math.max(1, Math.min(180, Number(standaloneCountdownMinutes.value || STANDALONE_TIMER_DEFAULT_MINUTES)));
  standaloneCountdownMinutes.value = String(minutes);
  return minutes;
}

function getStandaloneTimerRemainingSeconds(timer = state.standaloneTimer) {
  if (timer.status === "running" && timer.endsAt) {
    return Math.max(0, Math.ceil((Date.parse(timer.endsAt) - Date.now()) / 1000));
  }
  return Math.max(0, Number(timer.remainingSeconds ?? timer.durationSeconds ?? 0));
}

function renderStandaloneTimer() {
  if (isEmbedded) return;
  const timer = state.standaloneTimer;
  const remainingSeconds = getStandaloneTimerRemainingSeconds(timer);
  if (timer.status === "running" && remainingSeconds <= 0) {
    finishStandaloneCountdown();
    return;
  }

  const formatted = formatStandaloneDuration(remainingSeconds);
  const hasTimerState = ["running", "paused", "finished"].includes(timer.status);
  const floatingVisible = hasTimerState && timer.boxVisible;
  standaloneCountdownTime.textContent = formatted;
  standaloneFloatingCountdownTime.textContent = formatted;
  standaloneFloatingTimer.hidden = !floatingVisible;
  startStandaloneCountdownButton.querySelector("span").textContent = timer.status === "paused" ? "Resume" : "Start";
  pauseStandaloneCountdownButton.disabled = timer.status !== "running";
  resetStandaloneCountdownButton.disabled = timer.status === "idle";
  toggleStandaloneCountdownBoxButton.disabled = timer.status === "idle";

  const boxRenderState = timer.boxVisible ? "visible" : "hidden";
  if (toggleStandaloneCountdownBoxButton.dataset.renderState !== boxRenderState) {
    toggleStandaloneCountdownBoxButton.dataset.renderState = boxRenderState;
    toggleStandaloneCountdownBoxButton.innerHTML = timer.boxVisible
      ? '<i data-lucide="eye-off" aria-hidden="true"></i><span>Hide box</span>'
      : '<i data-lucide="eye" aria-hidden="true"></i><span>Show box</span>';
    renderLucideIcons();
  }

  if (timer.status === "paused") {
    standaloneFloatingCountdownState.textContent = "Paused";
  } else if (timer.status === "finished") {
    standaloneFloatingCountdownState.textContent = "Finished";
    maybePlayStandaloneTimerTone(timer);
  } else {
    standaloneFloatingCountdownState.textContent = "Time left";
  }
}

function updateStandaloneCountdownTick() {
  stopStandaloneCountdownTick();
  if (state.standaloneTimer.status === "running") {
    state.standaloneTimerTick = window.setInterval(renderStandaloneTimer, 250);
  }
}

function stopStandaloneCountdownTick() {
  if (!state.standaloneTimerTick) return;
  window.clearInterval(state.standaloneTimerTick);
  state.standaloneTimerTick = null;
}

function finishStandaloneCountdown() {
  if (state.standaloneTimer.status !== "running") return;
  const finishedAt = new Date().toISOString();
  state.standaloneTimer = {
    ...state.standaloneTimer,
    status: "finished",
    remainingSeconds: 0,
    endsAt: null,
    finishedAt
  };
  stopStandaloneCountdownTick();
  renderStandaloneTimer();
}

function formatStandaloneDuration(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function primeStandaloneTimerAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!state.standaloneTimerAudioContext || state.standaloneTimerAudioContext.state === "closed") {
    state.standaloneTimerAudioContext = new AudioContext();
  }
  state.standaloneTimerAudioContext.resume?.().catch?.(() => {});
}

function maybePlayStandaloneTimerTone(timer) {
  if (!timer.finishedAt) return;
  const toneKey = `${timer.startedAt || timer.finishedAt}:finished`;
  if (state.standaloneTimerLastToneKey === toneKey) return;
  state.standaloneTimerLastToneKey = toneKey;
  playStandaloneCountdownAlert();
}

function playStandaloneCountdownAlert() {
  primeStandaloneTimerAudio();
  const context = state.standaloneTimerAudioContext;
  if (!context) return;

  const scheduleNotes = () => {
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.setValueAtTime(0.38, context.currentTime);
    master.connect(compressor);
    compressor.connect(context.destination);

    [
      { frequency: 880, offset: 0, length: 0.22 },
      { frequency: 1175, offset: 0.3, length: 0.22 },
      { frequency: 1568, offset: 0.6, length: 0.38 }
    ].forEach((note) => {
      const start = context.currentTime + note.offset;
      const end = start + note.length;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(note.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.42, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    });

    window.setTimeout(() => {
      if (state.standaloneTimerAudioContext !== context) return;
      context.close?.();
      state.standaloneTimerAudioContext = null;
    }, 1800);
  };

  if (context.state === "suspended") {
    context.resume?.().then(scheduleNotes).catch(() => {});
  } else {
    scheduleNotes();
  }
}

function beginStandaloneFloatingDrag(event, kind) {
  if (event.button !== 0 || event.target.closest("button, input, select, textarea")) return;
  const element = kind === "panel" ? standaloneTimerPanel : standaloneFloatingTimer;
  if (element.hidden) return;
  const rect = element.getBoundingClientRect();
  const drag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    element
  };
  element.style.left = `${Math.round(rect.left)}px`;
  element.style.top = `${Math.round(rect.top)}px`;
  element.style.right = "auto";
  element.style.bottom = "auto";
  element.classList.add("is-dragging");
  if (kind === "panel") {
    state.standaloneTimerPanelDrag = drag;
    standaloneTimerPanelHeader.setPointerCapture?.(event.pointerId);
  } else {
    state.standaloneTimerBoxDrag = drag;
    standaloneFloatingTimerHeader.setPointerCapture?.(event.pointerId);
  }
  event.preventDefault();
}

function moveStandaloneFloatingElement(event) {
  const drag = state.standaloneTimerPanelDrag || state.standaloneTimerBoxDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const rect = drag.element.getBoundingClientRect();
  const bottomInset = getActiveBottomDockInset(8);
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - bottomInset - rect.height - 8);
  drag.element.style.left = `${Math.round(clamp(event.clientX - drag.offsetX, 8, maxLeft))}px`;
  drag.element.style.top = `${Math.round(clamp(event.clientY - drag.offsetY, 8, maxTop))}px`;
}

function endStandaloneFloatingDrag(event) {
  const entries = [
    ["standaloneTimerPanelDrag", standaloneTimerPanelHeader],
    ["standaloneTimerBoxDrag", standaloneFloatingTimerHeader]
  ];
  entries.forEach(([key, header]) => {
    const drag = state[key];
    if (!drag || (event.pointerId != null && drag.pointerId !== event.pointerId)) return;
    header.releasePointerCapture?.(drag.pointerId);
    drag.element.classList.remove("is-dragging");
    state[key] = null;
  });
}

function constrainStandaloneFloatingElements() {
  if (isEmbedded) return;
  const bottomInset = getActiveBottomDockInset(8);
  [standaloneTimerPanel, standaloneFloatingTimer].forEach((element) => {
    if (element.hidden) return;
    const rect = element.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - bottomInset - rect.height - 8);
    const left = clamp(rect.left, 8, maxLeft);
    const top = clamp(rect.top, 8, maxTop);
    if (Math.abs(left - rect.left) < 0.5 && Math.abs(top - rect.top) < 0.5) return;
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  });
}

function requestClassroomFocusMode(enabled) {
  setWhiteboardFocusMode(enabled);
  if (isEmbedded) {
    window.parent.postMessage({
      type: "kelp:whiteboard-focus-request",
      enabled: Boolean(enabled)
    }, window.location.origin);
  }
}

function setClassroomDockOpen(open, bottomInset, footerBottomInset, rightInset, nativeControlsBottomInset) {
  const nextOpen = Boolean(isEmbedded && open);
  const nextBottomInset = nextOpen && Number.isFinite(Number(bottomInset))
    ? clamp(Number(bottomInset), 72, Math.max(72, window.innerHeight - 24))
    : 100;
  const nextFooterBottomInset = nextOpen && Number.isFinite(Number(footerBottomInset))
    ? clamp(Number(footerBottomInset), nextBottomInset, Math.max(nextBottomInset, window.innerHeight - 24))
    : 130;
  const nextRightInset = nextOpen && Number.isFinite(Number(rightInset))
    ? clamp(Number(rightInset), 8, Math.max(8, window.innerWidth - 120))
    : 16;
  const nextNativeControlsBottomInset = nextOpen && Number.isFinite(Number(nativeControlsBottomInset))
    ? clamp(Number(nativeControlsBottomInset), 8, 80)
    : 18;
  if (state.classroomDockOpen === nextOpen
    && state.classroomDockBottomInset === nextBottomInset
    && state.classroomFooterBottomInset === nextFooterBottomInset
    && state.classroomDockRightInset === nextRightInset
    && state.classroomNativeControlsBottomInset === nextNativeControlsBottomInset) {
    return;
  }

  state.classroomDockOpen = nextOpen;
  state.classroomDockBottomInset = nextBottomInset;
  state.classroomFooterBottomInset = nextFooterBottomInset;
  state.classroomDockRightInset = nextRightInset;
  state.classroomNativeControlsBottomInset = nextNativeControlsBottomInset;
  document.body.classList.toggle("is-classroom-dock-open", nextOpen);
  document.body.style.setProperty("--classroom-dock-safe-inset", `${nextBottomInset}px`);
  document.body.style.setProperty("--classroom-footer-safe-inset", `${nextFooterBottomInset}px`);
  document.body.style.setProperty("--classroom-dock-right-inset", `${nextRightInset}px`);
  requestNativeControlsLayout();
  requestExcalidrawLayoutRefresh();
  requestWhiteboardOverlayLayout();
  requestNativeContextMenuLayout();
  syncDockSafeTooltips();
}

function getActiveBottomDockInset(fallback = 8) {
  if (state.classroomDockOpen) return state.classroomDockBottomInset;
  if (isStandaloneDockVisible()) return state.standaloneDockBottomInset;
  return fallback;
}

function syncDockSafeTooltips() {
  document.querySelectorAll(".excalidraw .App-menu_bottom button[aria-label]").forEach((button) => {
    const label = button.dataset.kelpTooltip
      || button.getAttribute("title")
      || button.getAttribute("aria-label");
    if (!label) return;
    button.dataset.kelpTooltip = label;
    button.removeAttribute("title");
  });
}

function handleDockTooltipPointerOver(event) {
  const button = event.target.closest?.(".App-menu_bottom button[aria-label]");
  if (!button) return;

  const label = button.dataset.kelpTooltip
    || button.getAttribute("title")
    || button.getAttribute("aria-label");
  if (label) button.dataset.kelpTooltip = label;
  button.removeAttribute("title");
  document.body.classList.add("is-kelp-dock-tooltip-active");
  document.querySelector(".excalidraw-tooltip")
    ?.classList.remove("excalidraw-tooltip--visible");
  event.stopPropagation();
}

function handleDockTooltipPointerOut(event) {
  const button = event.target.closest?.(".App-menu_bottom button[aria-label]");
  if (!button) return;
  const nextButton = event.relatedTarget?.closest?.(".App-menu_bottom button[aria-label]");
  if (nextButton === button) return;
  document.body.classList.remove("is-kelp-dock-tooltip-active");
  document.querySelector(".excalidraw-tooltip")
    ?.classList.remove("excalidraw-tooltip--visible");
}

function setWhiteboardFocusMode(enabled) {
  const nextMode = Boolean(enabled);
  if (state.focusMode === nextMode) {
    renderFocusState();
    return;
  }

  clearFocusToolsHideTimer();
  clearStandaloneDockHideTimer();
  state.focusMode = nextMode;
  state.focusToolsOpen = false;
  state.focusToolsPinned = false;
  state.standaloneDockOpen = !nextMode;
  state.standaloneDockPinned = false;
  closeToolGroups();
  closeNativePropertyPopovers();
  renderFocusState();
}

function revealFocusTools() {
  if (!state.focusMode) return;
  clearFocusToolsHideTimer();
  setFocusToolsOpen(true);
}

function keepFocusToolsOpen() {
  if (!state.focusMode) return;
  clearFocusToolsHideTimer();
  setFocusToolsOpen(true);
}

function scheduleFocusToolsHide(event) {
  if (!state.focusMode || state.focusToolsPinned) return;
  const relatedTarget = event?.relatedTarget;
  if (relatedTarget && isInsideFocusToolsRegion(relatedTarget)) {
    return;
  }

  clearFocusToolsHideTimer();
  state.focusToolsHideTimer = window.setTimeout(() => {
    state.focusToolsHideTimer = null;
    setFocusToolsOpen(false);
  }, FOCUS_BAR_HIDE_DELAY);
}

function clearFocusToolsHideTimer() {
  if (state.focusToolsHideTimer) window.clearTimeout(state.focusToolsHideTimer);
  state.focusToolsHideTimer = null;
}

function setFocusToolsOpen(open) {
  const nextOpen = Boolean(state.focusMode && (open || state.focusToolsPinned));
  if (state.focusToolsOpen === nextOpen) {
    if (!nextOpen) {
      closeNativePropertyPopovers();
      closeAppearanceDialog();
    }
    return;
  }
  state.focusToolsOpen = nextOpen;
  if (!nextOpen) {
    closeToolGroups();
    closeNativePropertyPopovers();
    closeAppearanceDialog();
  }
  renderFocusState();
}

function renderFocusState() {
  const toolsOpen = state.focusMode && state.focusToolsOpen;
  document.body.classList.toggle("is-focus-mode", state.focusMode);
  document.body.classList.toggle("is-focus-tools-open", toolsOpen);
  document.body.classList.toggle("is-focus-tools-pinned", state.focusMode && state.focusToolsPinned);
  focusToolsEdge.tabIndex = state.focusMode ? 0 : -1;
  focusToolsEdge.setAttribute("aria-hidden", String(!state.focusMode));

  pinFocusToolsButton.setAttribute("aria-pressed", String(state.focusToolsPinned));
  const pinLabel = state.focusToolsPinned
    ? "Allow whiteboard tools to auto-hide"
    : "Keep whiteboard tools open";
  pinFocusToolsButton.setAttribute("aria-label", pinLabel);
  pinFocusToolsButton.title = pinLabel;
  renderStandaloneDockState();
  renderPinnedPaletteMode();
  layoutWhiteboardToolbar();
  updateWhiteboardOverlayOffsets();
  requestWhiteboardOverlayLayout();

  if (isEmbedded) {
    window.parent.postMessage({
      type: "kelp:whiteboard-tools-state",
      open: toolsOpen
    }, window.location.origin);
  }

  requestExcalidrawLayoutRefresh();
  window.setTimeout(requestWhiteboardOverlayLayout, 220);
}

function toggleFocusToolsPinned() {
  if (!state.focusMode) return;
  clearFocusToolsHideTimer();
  state.focusToolsPinned = !state.focusToolsPinned;
  state.focusToolsOpen = true;
  renderFocusState();
}

function handleFocusOptionsPointerOver(event) {
  if (!isInsideNativePropertiesRegion(event.target)) return;
  keepFocusToolsOpen();
}

function handleFocusOptionsPointerOut(event) {
  if (!isInsideNativePropertiesRegion(event.target)) return;
  scheduleFocusToolsHide(event);
}

function isInsideFocusToolsRegion(target) {
  return whiteboardToolbar.contains(target)
    || pinFocusToolsButton.contains(target)
    || focusToolsEdge.contains(target)
    || appearanceDialog.contains(target)
    || gridAppearancePopover.contains(target)
    || isInsideNativePropertiesRegion(target);
}

function isInsideNativePropertiesRegion(target) {
  return Boolean(target?.closest?.(
    ".selected-shape-actions, [data-radix-popper-content-wrapper], [data-prevent-outside-click='true'][role='dialog']"
  ));
}

function isNativePropertiesChainVisible() {
  if (document.body.classList.contains("is-native-properties-dismissed")) return false;
  return Boolean(
    rootEl.querySelector(".selected-shape-actions")
    || rootEl.querySelector("[data-prevent-outside-click='true'][role='dialog']")
  );
}

function closeNativePropertyPopovers() {
  rootEl.querySelectorAll(".selected-shape-actions [aria-expanded='true']").forEach((trigger) => {
    if (!(trigger instanceof HTMLElement)) return;
    try {
      trigger.click();
    } catch (error) {}
  });
}

function dismissNativePropertiesPanel() {
  closeNativePropertyPopovers();
  state.nativePropertiesDismissed = true;
  document.body.classList.add("is-native-properties-dismissed");
  requestFrameBackgroundControlSync();
  requestWhiteboardOverlayLayout();
}

function revealNativePropertiesPanel(ownerGroup = null) {
  if (ownerGroup !== state.nativePropertiesOwnerGroup) {
    closeNativePropertyPopovers();
  }
  state.nativePropertiesOwnerGroup = ownerGroup;
  state.nativePropertiesDismissed = false;
  document.body.classList.remove("is-native-properties-dismissed");
  requestFrameBackgroundControlSync();
  requestWhiteboardOverlayLayout();
}

function nativePropertiesOwnerForTool(tool) {
  const button = Array.from(document.querySelectorAll("[data-tool]"))
    .find((candidate) => candidate.dataset.tool === tool);
  return button?.closest("[data-tool-group]")?.dataset.toolGroup || null;
}

function syncNativePropertiesFromSelection(appState) {
  const signature = Object.entries(appState?.selectedElementIds || {})
    .filter(([, selected]) => Boolean(selected))
    .map(([elementId]) => elementId)
    .sort()
    .join("|");
  if (signature === state.nativePropertiesSelectionSignature) return;
  state.nativePropertiesSelectionSignature = signature;
  if (signature) revealNativePropertiesPanel(null);
}

function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.("input, textarea, select, [contenteditable='true'], .excalidraw-textEditorContainer"));
}

function handleShiftWheelPan(event) {
  if (!event.shiftKey
    || event.ctrlKey
    || event.metaKey
    || isTypingTarget(event.target)
    || !event.target.closest?.("canvas.excalidraw__canvas")) {
    return;
  }

  const rawDelta = event.deltaY || event.deltaX;
  if (!rawDelta || !ensureApi()) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const appState = state.api.getAppState?.() || state.appState || {};
  const rawZoom = typeof appState.zoom === "object" ? appState.zoom?.value : appState.zoom;
  const zoom = Math.max(0.01, Number(rawZoom) || 1);
  const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? window.innerWidth * 0.8
      : 1;
  const horizontalDistance = -clamp(rawDelta * deltaScale, -320, 320) / zoom;

  state.api.updateScene({
    appState: {
      scrollX: (Number(appState.scrollX) || 0) + horizontalDistance
    },
    captureUpdate: CAPTURE_NEVER
  });
}

function prepareFrameTool(options = {}) {
  state.pendingFrameBackground = null;
  ensurePendingFrameSettings();
  setTool("frame", { ...options, skipFramePreparation: true });
  requestFrameBackgroundControlSync();
}

function setTool(tool, options = {}) {
  if (!ensureApi()) return;
  if (tool === "frame" && !options.skipFramePreparation) {
    prepareFrameTool(options);
    return;
  }
  if (tool !== "frame") {
    state.pendingFrameBackground = null;
  }

  const presets = {
    hand: {
      tool: { type: "hand" },
      appState: {}
    },
    selection: {
      tool: { type: "selection" },
      appState: {}
    },
    freedraw: {
      tool: { type: "freedraw", locked: true },
      appState: {
        currentItemStrokeColor: "#1f2933",
        currentItemBackgroundColor: "transparent",
        currentItemStrokeWidth: 2,
        currentItemOpacity: 100,
        currentItemRoughness: 1
      }
    },
    highlighter: {
      tool: { type: "freedraw", locked: true },
      appState: {
        currentItemStrokeColor: "#f5c542",
        currentItemBackgroundColor: "transparent",
        currentItemStrokeWidth: 8,
        currentItemOpacity: 42,
        currentItemRoughness: 0
      }
    },
    eraser: {
      tool: { type: "eraser", locked: true },
      appState: {}
    },
    line: {
      tool: { type: "line", locked: true },
      appState: defaultDrawingAppState()
    },
    arrow: {
      tool: { type: "arrow", locked: true },
      appState: defaultDrawingAppState()
    },
    rectangle: {
      tool: { type: "rectangle", locked: true },
      appState: defaultDrawingAppState()
    },
    diamond: {
      tool: { type: "diamond", locked: true },
      appState: defaultDrawingAppState()
    },
    ellipse: {
      tool: { type: "ellipse", locked: true },
      appState: defaultDrawingAppState()
    },
    frame: {
      tool: { type: "frame", locked: true },
      appState: {
        ...defaultDrawingAppState(),
        currentItemBackgroundColor: "transparent",
        currentItemFillStyle: "solid"
      }
    },
    embeddable: {
      tool: { type: "embeddable" },
      appState: defaultDrawingAppState()
    },
    laser: {
      tool: { type: "laser" },
      appState: {}
    },
    text: {
      tool: { type: "text", locked: false },
      appState: {
        currentItemStrokeColor: "#1f2933",
        currentItemOpacity: 100,
        currentItemFontSize: 24
      }
    }
  };

  const preset = presets[tool] || presets.selection;
  const resolvedTool = presets[tool] ? tool : "selection";
  state.activeWhiteboardTool = resolvedTool;
  state.stickyWhiteboardTool = REPEATABLE_WHITEBOARD_TOOLS.has(resolvedTool) ? resolvedTool : null;
  state.suppressToolSyncUntil = performance.now() + 220;
  revealNativePropertiesPanel(
    options.ownerGroup ?? nativePropertiesOwnerForTool(resolvedTool)
  );
  setActiveToolButton(resolvedTool);

  try {
    if (Object.keys(preset.appState).length) {
      state.api.updateScene({
        appState: preset.appState,
        captureUpdate: undefined
      });
    }
    state.api.setActiveTool?.(preset.tool);
    if (options.announce !== false) {
      setStatus(resolvedTool === "freedraw" ? "Pen" : labelForTool(resolvedTool));
    }
  } catch (error) {
    setStatus("Tool unavailable", "error");
  }

  requestWhiteboardOverlayLayout();
  requestFrameBackgroundControlSync();
  window.setTimeout(requestWhiteboardOverlayLayout, 220);
}

function handleStickyToolPointerDown(event) {
  if (event.button !== 0 || !state.stickyWhiteboardTool) return;
  if (!event.target.closest?.("canvas.excalidraw__canvas.interactive")) return;
  state.stickyToolGestureActive = true;
}

function handleFrameBackgroundGesturePointerDown(event) {
  if (event.button !== 0) return;
  if (!event.target.closest?.("canvas.excalidraw__canvas.interactive")) return;

  if (state.frameBackgroundGestureReleaseFrame) {
    window.cancelAnimationFrame(state.frameBackgroundGestureReleaseFrame);
    state.frameBackgroundGestureReleaseFrame = null;
  }
  if (state.frameBackgroundSyncFrame) {
    window.cancelAnimationFrame(state.frameBackgroundSyncFrame);
    state.frameBackgroundSyncFrame = null;
  }
  state.frameBackgroundGestureActive = true;
  const activeType = state.api?.getAppState?.().activeTool?.type;
  state.frameBackgroundGestureMode = activeType === "selection"
    && getSelectedElements().some((element) => element.type === "frame")
    ? "live"
    : "defer";
  beginRotationAssistGesture(activeType);
  if (activeType === "selection" && !state.rotationSnapGesture) {
    window.setTimeout(() => {
      if (state.frameBackgroundGestureActive && !state.rotationSnapGesture) {
        beginRotationAssistGesture(activeType);
      }
    }, 0);
  }
}

function updateFrameBackgroundGestureMode(elements, appState) {
  if (!state.frameBackgroundGestureActive || state.frameBackgroundGestureMode === "live") return;
  if (appState?.activeTool?.type !== "selection") return;

  const selectedIds = appState.selectedElementIds || {};
  if (Array.from(elements || []).some((element) => (
    element.type === "frame" && !element.isDeleted && selectedIds[element.id]
  ))) {
    state.frameBackgroundGestureMode = "live";
  }
}

function isFrameBackgroundSyncDeferred() {
  return state.frameBackgroundGestureActive && state.frameBackgroundGestureMode !== "live";
}

function isFrameBackgroundLiveGesture() {
  return state.frameBackgroundGestureActive && state.frameBackgroundGestureMode === "live";
}

function handleFrameBackgroundGesturePointerEnd() {
  if (!state.frameBackgroundGestureActive || state.frameBackgroundGestureReleaseFrame) return;

  state.frameBackgroundGestureReleaseFrame = window.requestAnimationFrame(() => {
    state.frameBackgroundGestureReleaseFrame = null;
    state.frameBackgroundGestureActive = false;
    state.frameBackgroundGestureMode = null;
    state.rotationSnapGesture = null;
    state.rotationSnapTarget = null;
    state.rotationSnapInProgress = false;
    scheduleFrameBackgroundSync();
  });
}

function handleStickyToolPointerUp() {
  if (!state.stickyToolGestureActive) return;
  state.stickyToolGestureActive = false;
  state.stickyToolRestorePending = true;
  const tool = state.stickyWhiteboardTool;

  window.requestAnimationFrame(() => {
    if (tool && state.stickyWhiteboardTool === tool) {
      const activeType = state.api?.getAppState?.().activeTool?.type;
      const expectedType = tool === "highlighter" ? "freedraw" : tool;
      if (activeType !== expectedType || state.api?.getAppState?.().activeTool?.locked !== true) {
        setTool(tool, { announce: false });
      }
    }
    state.stickyToolRestorePending = false;
  });
}

function handleNativeToolControlClick(event) {
  if (event.target.closest?.("canvas.excalidraw__canvas")) return;
  if (event.target.closest?.(".kelp-frame-background-control, .kelp-image-grid-layer-control")) return;
  if (!event.target.closest?.(".excalidraw button, .excalidraw label, .excalidraw [role='radio']")) return;
  window.requestAnimationFrame(syncNativeToolControl);
}

function syncNativeToolControl() {
  const activeTool = state.api?.getAppState?.().activeTool;
  const tool = whiteboardToolFromActiveTool(activeTool);
  if (!tool) return;

  state.activeWhiteboardTool = tool;
  state.stickyWhiteboardTool = REPEATABLE_WHITEBOARD_TOOLS.has(tool) ? tool : null;
  state.suppressToolSyncUntil = performance.now() + 180;
  setActiveToolButton(tool);

  if (state.stickyWhiteboardTool && activeTool.locked !== true) {
    state.api?.setActiveTool?.({ ...activeTool, locked: true });
  }
  requestFrameBackgroundControlSync();
}

function whiteboardToolFromActiveTool(activeTool) {
  const activeType = activeTool?.type;
  const toolMap = {
    hand: "hand",
    selection: "selection",
    freedraw: state.activeWhiteboardTool === "highlighter" ? "highlighter" : "freedraw",
    eraser: "eraser",
    line: "line",
    arrow: "arrow",
    rectangle: "rectangle",
    diamond: "diamond",
    ellipse: "ellipse",
    frame: "frame",
    embeddable: "embeddable",
    laser: "laser",
    text: "text"
  };
  return toolMap[activeType] || "";
}

function syncWhiteboardToolFromAppState(appState) {
  if (performance.now() < state.suppressToolSyncUntil
    || state.stickyToolGestureActive
    || state.stickyToolRestorePending) {
    return;
  }

  const activeTool = appState?.activeTool;
  const tool = whiteboardToolFromActiveTool(activeTool);
  if (!tool || state.activeWhiteboardTool === tool) return;

  state.activeWhiteboardTool = tool;
  state.stickyWhiteboardTool = REPEATABLE_WHITEBOARD_TOOLS.has(tool) ? tool : null;
  revealNativePropertiesPanel(nativePropertiesOwnerForTool(tool));
  setActiveToolButton(tool);

  if (state.stickyWhiteboardTool && activeTool.locked !== true) {
    state.api?.setActiveTool?.({ ...activeTool, locked: true });
  }
}

function defaultDrawingAppState() {
  return {
    currentItemStrokeColor: "#1f2933",
    currentItemBackgroundColor: "transparent",
    currentItemStrokeWidth: 2,
    currentItemOpacity: 100,
    currentItemRoughness: 1,
    currentItemFillStyle: "hachure"
  };
}

function labelForTool(tool) {
  const labels = {
    freedraw: "Pen",
    hand: "Hand",
    embeddable: "Web Embed",
    laser: "Laser Pointer"
  };
  if (labels[tool]) return labels[tool];
  return tool
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function setActiveToolButton(tool) {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  updateToolGroupActiveStates();
  updatePinnedToolStates();
}

async function runAction(action, trigger = null) {
  if (!ensureApi()) return;

  const actions = {
    "edit-geometry": () => openGeometryEditor(),
    "canvas-appearance": () => openAppearanceDialog("canvas"),
    "grid-appearance": () => toggleGridAppearancePopover(trigger),
    "toggle-grid-horizontal": () => toggleGridAxis("horizontal"),
    "toggle-grid-vertical": () => toggleGridAxis("vertical"),
    "set-grid-compact": () => setGridSpacing("compact"),
    "set-grid-standard": () => setGridSpacing("standard"),
    "set-grid-spacious": () => setGridSpacing("spacious"),
    "toggle-rotation-assist": toggleRotationAssist,
    "upload-image": () => imageUploadInput.click(),
    "toggle-library": toggleNativeLibrary,
    "open-mermaid": openNativeMermaidDialog,
    copy: copySelection,
    cut: cutSelection,
    paste: pasteSelection,
    "delete-selection": deleteSelection,
    "align-vertical": () => alignSelection("vertical"),
    "align-horizontal": () => alignSelection("horizontal"),
    "distribute-vertical": () => distributeSelection("vertical"),
    "distribute-horizontal": () => distributeSelection("horizontal"),
    "save-local": () => saveToLocal(true),
    "load-local": loadFromLocal,
    "open-board-file": () => boardFileInput.click(),
    "clear-board": clearBoard
  };

  const handler = actions[action];
  if (handler) {
    await handler();
  }
}

function normalizeGridSettings(value, saved = false) {
  const source = value && typeof value === "object" ? value : {};
  const spacing = Object.prototype.hasOwnProperty.call(GRID_SPACING_VALUES, source.spacing)
    ? source.spacing
    : nearestGridSpacing(source.gridSize);
  const color = normalizeHexColor(source.color || source.gridColor, DEFAULT_GRID_COLOR);
  const opacity = normalizeGridOpacity(source.opacity ?? source.gridOpacity);
  return {
    horizontal: typeof source.horizontal === "boolean" ? source.horizontal : false,
    vertical: typeof source.vertical === "boolean" ? source.vertical : false,
    spacing,
    color,
    opacity,
    rotationAssist: typeof source.rotationAssist === "boolean"
      ? source.rotationAssist
      : typeof source.axisAssist === "boolean"
        ? source.axisAssist
        : true,
    saved
  };
}

function normalizeGridOpacity(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return DEFAULT_GRID_OPACITY;
  return clampNumber(Math.round(requested / 10) * 10, 0, 100);
}

function loadGridSettings() {
  try {
    const raw = window.localStorage.getItem(gridSettingsKey);
    if (raw) return normalizeGridSettings(JSON.parse(raw), true);
  } catch (error) {}
  return normalizeGridSettings(null, false);
}

function gridSettingsPayload() {
  return {
    version: 3,
    horizontal: Boolean(state.gridHorizontal),
    vertical: Boolean(state.gridVertical),
    spacing: state.gridSpacing,
    gridSize: GRID_SPACING_VALUES[state.gridSpacing],
    color: state.gridColor,
    opacity: state.gridOpacity,
    rotationAssist: Boolean(state.rotationAssistEnabled)
  };
}

function saveGridSettings() {
  try {
    window.localStorage.setItem(gridSettingsKey, JSON.stringify(gridSettingsPayload()));
  } catch (error) {}
}

function initializeGridFromApi() {
  const appState = state.api?.getAppState?.() || {};
  if (!state.gridSettingsLoaded) {
    if (appState.gridModeEnabled) {
      state.gridHorizontal = true;
      state.gridVertical = true;
      state.gridSpacing = nearestGridSpacing(appState.gridSize);
    }
    state.gridSettingsLoaded = true;
    saveGridSettings();
  }
  applyGridSettingsToApi(false);
}

function toggleGridAxis(axis) {
  if (axis === "horizontal") state.gridHorizontal = !state.gridHorizontal;
  if (axis === "vertical") state.gridVertical = !state.gridVertical;
  applyGridSettingsToApi(false);
  const enabled = axis === "horizontal" ? state.gridHorizontal : state.gridVertical;
  setStatus(`${axis === "horizontal" ? "Horizontal" : "Vertical"} grid ${enabled ? "on" : "off"}`);
}

function setGridSpacing(spacing) {
  if (!Object.prototype.hasOwnProperty.call(GRID_SPACING_VALUES, spacing)) return;
  state.gridSpacing = spacing;
  applyGridSettingsToApi(false);
  setStatus(`${GRID_SPACING_LABELS[spacing]} grid spacing`);
}

function toggleGridAppearancePopover(anchor = gridAppearanceTrigger) {
  if (gridAppearancePopover.hidden) {
    openGridAppearancePopover(anchor);
  } else {
    closeGridAppearancePopover();
  }
}

function openGridAppearancePopover(anchor = gridAppearanceTrigger) {
  state.gridAppearanceAnchor = anchor instanceof HTMLElement && anchor.isConnected
    ? anchor
    : gridAppearanceTrigger;
  gridAppearancePopover.classList.remove("is-opening");
  gridAppearancePopover.style.visibility = "hidden";
  gridAppearancePopover.hidden = false;
  renderGridAppearanceControls();
  positionGridAppearancePopover();
  void gridAppearancePopover.offsetWidth;
  gridAppearancePopover.style.visibility = "";
  gridAppearancePopover.classList.add("is-opening");
  keepFocusToolsOpen();
  updatePinnedPaletteSuppression();
}

function closeGridAppearancePopover() {
  if (gridAppearancePopover.hidden) return;
  gridAppearancePopover.hidden = true;
  gridAppearancePopover.classList.remove("is-opening");
  gridAppearancePopover.style.visibility = "";
  state.gridAppearanceAnchor = null;
  renderGridAppearanceControls();
  updatePinnedPaletteSuppression();
}

function positionGridAppearancePopover() {
  if (gridAppearancePopover.hidden) return;
  const anchor = state.gridAppearanceAnchor?.isConnected
    ? state.gridAppearanceAnchor
    : gridAppearanceTrigger;
  const triggerRect = anchor.getBoundingClientRect();
  const owner = gridToolsMenu.contains(anchor)
    ? gridToolsMenu
    : anchor.closest(".focus-pinned-group, .pinned-tools-group") || anchor;
  const ownerRect = owner.getBoundingClientRect();
  const popoverRect = gridAppearancePopover.getBoundingClientRect();
  const gap = 12;
  const safeInset = 8;
  const bottomInset = getActiveBottomDockInset(safeInset);
  const safeBottom = Math.max(safeInset + popoverRect.height, window.innerHeight - bottomInset);
  const maximumLeft = Math.max(safeInset, window.innerWidth - popoverRect.width - safeInset);
  const rightSideLeft = ownerRect.right + gap;
  const leftSideLeft = ownerRect.left - popoverRect.width - gap;
  const preferredLeft = rightSideLeft <= maximumLeft || leftSideLeft < safeInset
    ? rightSideLeft
    : leftSideLeft;
  const maximumTop = Math.max(safeInset, safeBottom - popoverRect.height);

  gridAppearancePopover.style.left = `${Math.round(clamp(preferredLeft, safeInset, maximumLeft))}px`;
  gridAppearancePopover.style.top = `${Math.round(clamp(triggerRect.top, safeInset, maximumTop))}px`;
}

function setGridAppearance(changes, announce = false) {
  const nextColor = changes.color === undefined
    ? state.gridColor
    : normalizeHexColor(changes.color, state.gridColor || DEFAULT_GRID_COLOR);
  const nextOpacity = changes.opacity === undefined
    ? state.gridOpacity
    : normalizeGridOpacity(changes.opacity);
  const changed = nextColor !== state.gridColor || nextOpacity !== state.gridOpacity;

  state.gridColor = nextColor;
  state.gridOpacity = nextOpacity;
  saveGridSettings();
  renderGridAppearanceControls();
  renderGridOverlay();
  if (changed) scheduleAutosave();
  if (announce) setStatus("Grid appearance updated");
}

function renderGridAppearanceControls() {
  const color = normalizeHexColor(state.gridColor, DEFAULT_GRID_COLOR);
  const opacity = normalizeGridOpacity(state.gridOpacity);
  const opacityPosition = `calc(${opacity}% + ${8 - opacity * 0.16}px)`;
  const popoverOpen = !gridAppearancePopover.hidden;

  gridAppearanceTrigger.style.setProperty("--kelp-grid-indicator-color", color);
  gridAppearanceTrigger.classList.toggle("active", popoverOpen);
  gridAppearanceTrigger.setAttribute("aria-expanded", String(popoverOpen));
  document.querySelectorAll('button[data-pinned-tool-id="action:grid-appearance"]').forEach((button) => {
    button.style.setProperty("--kelp-grid-indicator-color", color);
    button.classList.toggle("active", popoverOpen);
    button.setAttribute("aria-expanded", String(popoverOpen));
    button.setAttribute("aria-controls", "grid-appearance-popover");
  });
  gridColorInput.value = color;
  gridCustomColorSwatch.style.setProperty("--swatch-color", color);
  gridOpacityInput.value = String(opacity);
  gridOpacityInput.style.setProperty("--appearance-opacity-fill-position", `${opacity}%`);
  gridOpacityScale.style.setProperty("--appearance-opacity-position", opacityPosition);
  gridOpacityValue.textContent = String(opacity);
  gridOpacityValue.hidden = opacity === 0;
  gridOpacityMaximum.hidden = true;

  gridColorPresetButtons.forEach((button) => {
    const active = normalizeHexColor(button.dataset.gridColor, "") === color;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const usesPreset = gridColorPresetButtons.some((button) => button.classList.contains("active"));
  gridCustomColorSwatch.parentElement?.classList.toggle("is-active", !usesPreset);
}

function toggleFullGrid() {
  const enabled = !(state.gridHorizontal && state.gridVertical);
  state.gridHorizontal = enabled;
  state.gridVertical = enabled;
  applyGridSettingsToApi(false);
  setStatus(`Grid ${enabled ? "on" : "off"}`);
}

function toggleRotationAssist() {
  state.rotationAssistEnabled = !state.rotationAssistEnabled;
  if (!state.rotationAssistEnabled) {
    state.rotationSnapGesture = null;
    state.rotationSnapTarget = null;
  }
  saveGridSettings();
  renderRotationAssistControl();
  scheduleAutosave();
  setStatus(`Rotation assist ${state.rotationAssistEnabled ? "on" : "off"}`);
}

function applyGridSettingsToApi(shouldAnnounce = false) {
  const gridSize = GRID_SPACING_VALUES[state.gridSpacing];
  const appState = state.api?.getAppState?.() || {};
  if (state.api && (
    Boolean(appState.gridModeEnabled)
    || Number(appState.gridSize) !== gridSize
  )) {
    state.api.updateScene({
      appState: { gridModeEnabled: false, gridSize },
      captureUpdate: CAPTURE_NEVER
    });
  }
  saveGridSettings();
  renderGridControls();
  requestGridOverlayAttachment();
  renderGridOverlay();
  scheduleAutosave();
  if (shouldAnnounce) setStatus("Grid updated");
}

function syncGridStateFromAppState(appState) {
  if (!appState || !state.gridSettingsLoaded) return;
  const nativeGridEnabled = Boolean(appState.gridModeEnabled);
  let changed = false;

  if (nativeGridEnabled && Number.isFinite(Number(appState.gridSize))) {
    const spacing = nearestGridSpacing(appState.gridSize);
    if (spacing !== state.gridSpacing) {
      state.gridSpacing = spacing;
      changed = true;
    }
  }
  if (nativeGridEnabled) {
    state.api?.updateScene({
      appState: {
        gridModeEnabled: false,
        gridSize: GRID_SPACING_VALUES[state.gridSpacing]
      },
      captureUpdate: CAPTURE_NEVER
    });
  }
  if (changed) {
    saveGridSettings();
    renderGridControls();
  }
}

function renderGridControls() {
  const activeActions = new Set([
    ...(state.gridHorizontal ? ["toggle-grid-horizontal"] : []),
    ...(state.gridVertical ? ["toggle-grid-vertical"] : []),
    ...(state.gridHorizontal || state.gridVertical ? [`set-grid-${state.gridSpacing}`] : [])
  ]);
  document.querySelectorAll('[data-tool-group="grid"] [data-action]:not([data-action="grid-appearance"])').forEach((button) => {
    const active = activeActions.has(button.dataset.action);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderGridAppearanceControls();
  updateToolGroupActiveStates();
  updatePinnedToolStates();
}

function renderRotationAssistControl() {
  document.querySelectorAll('[data-action="toggle-rotation-assist"]').forEach((button) => {
    button.classList.toggle("active", state.rotationAssistEnabled);
    button.setAttribute("aria-pressed", String(state.rotationAssistEnabled));
  });
  updateToolGroupActiveStates();
  updatePinnedToolStates();
}

function nearestGridSpacing(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return "standard";
  return Object.entries(GRID_SPACING_VALUES)
    .sort((first, second) => Math.abs(first[1] - requested) - Math.abs(second[1] - requested))[0][0];
}

function requestGridOverlayAttachment() {
  if (state.gridOverlayAttachmentFrame) return;
  state.gridOverlayAttachmentFrame = window.requestAnimationFrame(() => {
    state.gridOverlayAttachmentFrame = null;
    attachGridOverlay();
    renderGridOverlay();
  });
}

function attachGridOverlay() {
  const staticCanvas = rootEl.querySelector("canvas.excalidraw__canvas.static");
  if (!staticCanvas?.parentElement) return false;
  if (gridOverlay.parentElement !== staticCanvas.parentElement
    || staticCanvas.nextElementSibling !== gridOverlay) {
    staticCanvas.after(gridOverlay);
  }
  return true;
}

function renderGridOverlay(appState = state.api?.getAppState?.() || state.appState || {}) {
  const customGridEnabled = state.gridHorizontal || state.gridVertical;
  gridOverlay.style.setProperty(
    "--kelp-grid-color",
    colorWithOpacity(state.gridColor, state.gridOpacity)
  );
  if (!customGridEnabled || !attachGridOverlay()) {
    gridOverlay.hidden = true;
    gridOverlay.classList.remove("has-horizontal-grid", "has-vertical-grid");
    clearGridOverlayMask();
    return;
  }

  const rawZoom = typeof appState.zoom === "object" ? appState.zoom?.value : appState.zoom;
  const zoom = Math.max(0.01, Number(rawZoom) || 1);
  let step = GRID_SPACING_VALUES[state.gridSpacing] * zoom;
  if (step < 12) step *= Math.ceil(12 / step);
  const offsetX = positiveModulo((Number(appState.scrollX) || 0) * zoom, step);
  const offsetY = positiveModulo((Number(appState.scrollY) || 0) * zoom, step);

  gridOverlay.hidden = false;
  gridOverlay.classList.toggle("has-horizontal-grid", state.gridHorizontal);
  gridOverlay.classList.toggle("has-vertical-grid", state.gridVertical);
  gridOverlay.style.setProperty("--kelp-grid-step", `${step}px`);
  gridOverlay.style.setProperty("--kelp-grid-offset-x", `${offsetX}px`);
  gridOverlay.style.setProperty("--kelp-grid-offset-y", `${offsetY}px`);
  renderGridOverlayMask(appState);
}

function renderGridOverlayMask(appState) {
  const overlayRect = gridOverlay.getBoundingClientRect();
  const width = Math.max(1, Math.round(overlayRect.width));
  const height = Math.max(1, Math.round(overlayRect.height));
  const maskedElementPolygons = (state.api?.getSceneElements?.() || state.elements)
    .filter((element) => !element.isDeleted && elementMasksGridOverlay(element))
    .map((element) => elementViewportPolygon(element, appState, overlayRect))
    .filter((polygon) => polygon.length === 4 && polygonIntersectsViewport(polygon, width, height));

  if (!maskedElementPolygons.length) {
    clearGridOverlayMask();
    return;
  }

  const polygonMarkup = maskedElementPolygons
    .map((polygon) => `<polygon points="${polygon.map((point) => `${roundMaskCoordinate(point.x)},${roundMaskCoordinate(point.y)}`).join(" ")}" fill="#000"/>`)
    .join("");
  const signature = `${width}x${height}:${polygonMarkup}`;
  if (signature === state.gridOverlayMaskSignature) return;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><mask id="drawing-holes" maskUnits="userSpaceOnUse" mask-type="luminance"><rect width="${width}" height="${height}" fill="#fff"/>${polygonMarkup}</mask><rect width="${width}" height="${height}" fill="#fff" mask="url(#drawing-holes)"/></svg>`;
  const maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  gridOverlay.style.maskImage = maskImage;
  gridOverlay.style.webkitMaskImage = maskImage;
  gridOverlay.style.maskPosition = "0 0";
  gridOverlay.style.webkitMaskPosition = "0 0";
  gridOverlay.style.maskRepeat = "no-repeat";
  gridOverlay.style.webkitMaskRepeat = "no-repeat";
  gridOverlay.style.maskSize = "100% 100%";
  gridOverlay.style.webkitMaskSize = "100% 100%";
  gridOverlay.dataset.maskedElements = String(maskedElementPolygons.length);
  state.gridOverlayMaskSignature = signature;
}

function normalizeGridLayer(value) {
  return value === GRID_LAYER_FRONT ? GRID_LAYER_FRONT : GRID_LAYER_BEHIND;
}

function gridLayerForElement(element) {
  const graph = geometryFrameData(element)?.graph;
  if (graph) return normalizeGridLayer(graph.gridLayer);
  return normalizeGridLayer(element?.customData?.[GRID_LAYER_META_KEY]?.placement);
}

function elementMasksGridOverlay(element) {
  if (!element || element.isDeleted || !["image", "frame"].includes(element.type)) return false;
  return gridLayerForElement(element) === GRID_LAYER_BEHIND;
}

function elementViewportPolygon(element, appState, overlayRect) {
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const width = Math.max(0, Number(element.width) || 0);
  const height = Math.max(0, Number(element.height) || 0);
  if (!width || !height) return [];

  const center = { x: x + width / 2, y: y + height / 2 };
  const angle = Number(element.angle) || 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const sceneCorners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ].map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cosine - dy * sine,
      y: center.y + dx * sine + dy * cosine
    };
  });

  const viewportCorners = sceneCorners.map((point) => {
    const client = sceneToClient(point.x, point.y, appState);
    return {
      x: client.x - overlayRect.left,
      y: client.y - overlayRect.top
    };
  });
  const viewportCenter = viewportCorners.reduce((result, point) => ({
    x: result.x + point.x / viewportCorners.length,
    y: result.y + point.y / viewportCorners.length
  }), { x: 0, y: 0 });

  return viewportCorners.map((point) => {
    const dx = point.x - viewportCenter.x;
    const dy = point.y - viewportCenter.y;
    const distance = Math.hypot(dx, dy) || 1;
    const outset = 1.5;
    return {
      x: point.x + dx / distance * outset,
      y: point.y + dy / distance * outset
    };
  });
}

function polygonIntersectsViewport(polygon, width, height) {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  return Math.max(...xs) >= 0
    && Math.min(...xs) <= width
    && Math.max(...ys) >= 0
    && Math.min(...ys) <= height;
}

function sceneToClient(sceneX, sceneY, appState) {
  try {
    if (ExcalidrawLib.sceneCoordsToViewportCoords) {
      const point = ExcalidrawLib.sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
      if (Number.isFinite(point?.clientX) && Number.isFinite(point?.clientY)) {
        return { x: point.clientX, y: point.clientY };
      }
    }
  } catch (error) {}

  const rawZoom = typeof appState.zoom === "object" ? appState.zoom?.value : appState.zoom;
  const zoom = Math.max(0.01, Number(rawZoom) || 1);
  return {
    x: (sceneX + (Number(appState.scrollX) || 0)) * zoom + (Number(appState.offsetLeft) || 0),
    y: (sceneY + (Number(appState.scrollY) || 0)) * zoom + (Number(appState.offsetTop) || 0)
  };
}

function roundMaskCoordinate(value) {
  return Math.round(value * 100) / 100;
}

function clearGridOverlayMask() {
  if (!state.gridOverlayMaskSignature
    && !gridOverlay.dataset.maskedElements
    && !gridOverlay.dataset.maskedGeometryFrames) return;
  gridOverlay.style.removeProperty("mask-image");
  gridOverlay.style.removeProperty("-webkit-mask-image");
  gridOverlay.style.removeProperty("mask-position");
  gridOverlay.style.removeProperty("-webkit-mask-position");
  gridOverlay.style.removeProperty("mask-repeat");
  gridOverlay.style.removeProperty("-webkit-mask-repeat");
  gridOverlay.style.removeProperty("mask-size");
  gridOverlay.style.removeProperty("-webkit-mask-size");
  delete gridOverlay.dataset.maskedElements;
  delete gridOverlay.dataset.maskedGeometryFrames;
  state.gridOverlayMaskSignature = "";
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function handleNativeContextMenuOpen() {
  requestNativeContextMenuLayout();
  window.setTimeout(requestNativeContextMenuLayout, 50);
}

function requestNativeContextMenuLayout() {
  if (state.contextMenuLayoutFrame) return;
  state.contextMenuLayoutFrame = window.requestAnimationFrame(() => {
    state.contextMenuLayoutFrame = null;
    layoutNativeContextMenus();
  });
}

function layoutNativeContextMenus() {
  const stageRect = stageEl.getBoundingClientRect();
  const dockInset = getActiveBottomDockInset(0);
  const safeLeft = Math.max(8, stageRect.left + 8);
  const safeRight = Math.min(window.innerWidth - 8, stageRect.right - 8);
  const safeTop = Math.max(8, stageRect.top + 8);
  const safeBottom = Math.min(
    stageRect.bottom - 8,
    window.innerHeight - dockInset - 8
  );
  const availableHeight = Math.max(80, safeBottom - safeTop);

  document.querySelectorAll(".excalidraw .popover > .context-menu").forEach((menu) => {
    Array.from(menu.children).forEach((item) => {
      if (/^Toggle grid\b/i.test(item.textContent?.trim() || "")) item.hidden = true;
    });
    const popover = menu.parentElement;
    if (!popover) return;
    menu.style.maxHeight = `${Math.floor(availableHeight)}px`;

    const rect = menu.getBoundingClientRect();
    let deltaX = 0;
    let deltaY = 0;
    if (rect.right > safeRight) deltaX = safeRight - rect.right;
    if (rect.left + deltaX < safeLeft) deltaX += safeLeft - (rect.left + deltaX);
    if (rect.bottom > safeBottom) deltaY = safeBottom - rect.bottom;
    if (rect.top + deltaY < safeTop) deltaY += safeTop - (rect.top + deltaY);
    if (!deltaX && !deltaY) return;

    const left = Number.parseFloat(popover.style.left) || popover.offsetLeft || 0;
    const top = Number.parseFloat(popover.style.top) || popover.offsetTop || 0;
    if (deltaX) popover.style.left = `${left + deltaX}px`;
    if (deltaY) popover.style.top = `${top + deltaY}px`;
  });
}

function beginRotationAssistGesture(activeType) {
  state.rotationSnapGesture = null;
  state.rotationSnapTarget = null;
  if (!state.rotationAssistEnabled || activeType !== "selection") return;

  const selectedElements = getSelectedElements();
  if (!selectedElements.length) return;
  const selectedIds = new Set(selectedElements.map((element) => element.id));
  const relatedIds = new Set(selectedIds);
  const starts = new Map();
  getSceneElementsForMutation().forEach((element) => {
    const ownerFrameId = element.customData?.[FRAME_BACKGROUND_OWNER_KEY]?.frameId;
    if (selectedIds.has(element.containerId)
      || selectedIds.has(element.frameId)
      || selectedIds.has(ownerFrameId)) {
      relatedIds.add(element.id);
    }
    if (!selectedIds.has(element.id) || element.isDeleted) return;
    starts.set(element.id, {
      width: Number(element.width) || 0,
      height: Number(element.height) || 0,
      angle: Number(element.angle) || 0
    });
  });
  state.rotationSnapGesture = {
    referenceId: selectedElements[0].id,
    selectedIds,
    relatedIds,
    starts
  };
}

function applyRotationAssistDuringGesture(elements, appState) {
  const gesture = state.rotationSnapGesture;
  if (!state.frameBackgroundGestureActive
    || !state.rotationAssistEnabled
    || state.rotationSnapInProgress
    || !gesture
    || appState?.activeTool?.type !== "selection") {
    return false;
  }

  const currentById = new Map(Array.from(elements || []).map((element) => [element.id, element]));
  const reference = currentById.get(gesture.referenceId);
  const referenceStart = gesture.starts.get(gesture.referenceId);
  if (!reference || reference.isDeleted || !referenceStart) return false;

  const selectionResized = Array.from(gesture.selectedIds).some((elementId) => {
    const current = currentById.get(elementId);
    const start = gesture.starts.get(elementId);
    return !current || !start
      || Math.abs((Number(current.width) || 0) - start.width) > 0.1
      || Math.abs((Number(current.height) || 0) - start.height) > 0.1;
  });
  if (selectionResized) {
    state.rotationSnapTarget = null;
    return false;
  }

  const currentAngle = Number(reference.angle) || 0;
  if (Math.abs(signedAngleDifference(currentAngle, referenceStart.angle)) < 0.001) return false;
  const snappedAngle = resolveRotationSnapAngle(currentAngle);
  if (snappedAngle == null) return false;
  const correction = signedAngleDifference(snappedAngle, currentAngle);
  if (Math.abs(correction) < 0.0001) return false;

  const selectedElements = Array.from(gesture.selectedIds)
    .map((elementId) => currentById.get(elementId))
    .filter((element) => element && !element.isDeleted);
  if (!selectedElements.length) return false;
  const centers = selectedElements.map((element) => ({
    x: (Number(element.x) || 0) + (Number(element.width) || 0) / 2,
    y: (Number(element.y) || 0) + (Number(element.height) || 0) / 2
  }));
  const pivot = {
    x: centers.reduce((sum, center) => sum + center.x, 0) / centers.length,
    y: centers.reduce((sum, center) => sum + center.y, 0) / centers.length
  };
  const cosine = Math.cos(correction);
  const sine = Math.sin(correction);
  const sceneElements = getSceneElementsForMutation();
  let changed = false;
  const nextElements = sceneElements.map((element) => {
    if (!gesture.relatedIds.has(element.id) || element.isDeleted) return element;
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;
    const centerX = (Number(element.x) || 0) + width / 2;
    const centerY = (Number(element.y) || 0) + height / 2;
    const offsetX = centerX - pivot.x;
    const offsetY = centerY - pivot.y;
    const rotatedCenterX = pivot.x + offsetX * cosine - offsetY * sine;
    const rotatedCenterY = pivot.y + offsetX * sine + offsetY * cosine;
    changed = true;
    return bumpElement({
      ...element,
      x: rotatedCenterX - width / 2,
      y: rotatedCenterY - height / 2,
      angle: normalizeRotationAngle((Number(element.angle) || 0) + correction)
    });
  });
  if (!changed) return false;

  state.rotationSnapInProgress = true;
  try {
    state.api.updateScene({ elements: nextElements, captureUpdate: CAPTURE_NEVER });
  } finally {
    state.rotationSnapInProgress = false;
  }
  return true;
}

function resolveRotationSnapAngle(angle) {
  const normalizedAngle = normalizeRotationAngle(angle);
  if (state.rotationSnapTarget != null) {
    if (Math.abs(signedAngleDifference(normalizedAngle, state.rotationSnapTarget)) <= ROTATION_SNAP_RELEASE) {
      return state.rotationSnapTarget;
    }
    state.rotationSnapTarget = null;
  }

  const target = normalizeRotationAngle(
    Math.round(normalizedAngle / ROTATION_SNAP_STEP) * ROTATION_SNAP_STEP
  );
  if (Math.abs(signedAngleDifference(normalizedAngle, target)) > ROTATION_SNAP_ATTACH) return null;
  state.rotationSnapTarget = target;
  return target;
}

function normalizeRotationAngle(angle) {
  const fullTurn = Math.PI * 2;
  return ((Number(angle) || 0) % fullTurn + fullTurn) % fullTurn;
}

function signedAngleDifference(target, source) {
  const fullTurn = Math.PI * 2;
  return ((target - source + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

function loadFrameBackgroundColor() {
  try {
    return normalizeFrameBackgroundColor(
      window.localStorage.getItem(FRAME_BACKGROUND_KEY),
      DEFAULT_FRAME_BACKGROUND
    );
  } catch (error) {
    return DEFAULT_FRAME_BACKGROUND;
  }
}

function loadFrameTemplateId() {
  try {
    return normalizeFrameTemplateId(window.localStorage.getItem(FRAME_TEMPLATE_KEY));
  } catch (error) {
    return "custom";
  }
}

function saveFrameTemplateId(templateId) {
  try {
    window.localStorage.setItem(FRAME_TEMPLATE_KEY, normalizeFrameTemplateId(templateId));
  } catch (error) {}
}

function normalizeFrameTemplateId(templateId) {
  return Object.prototype.hasOwnProperty.call(FRAME_TEMPLATES, templateId)
    ? templateId
    : "custom";
}

function frameTemplateIdForElement(frame) {
  return normalizeFrameTemplateId(frame?.customData?.[FRAME_TEMPLATE_META_KEY]?.id);
}

function saveFrameBackgroundColor(color) {
  try {
    window.localStorage.setItem(FRAME_BACKGROUND_KEY, color);
  } catch (error) {}
}

function normalizeFrameBackgroundColor(value, fallback = DEFAULT_FRAME_BACKGROUND) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "transparent") return "transparent";
  const normalizedFallback = String(fallback || "").trim().toLowerCase() === "transparent"
    ? "transparent"
    : normalizeHexColor(fallback, DEFAULT_FRAME_BACKGROUND);
  return normalizeHexColor(value, normalizedFallback);
}

function frameBackgroundColorForElement(frame) {
  return normalizeFrameBackgroundColor(
    frame?.customData?.[FRAME_BACKGROUND_META_KEY]?.color
      || state.frameBackgroundColors.get(frame?.id)
      || state.frameBackgroundColor,
    state.frameBackgroundColor
  );
}

function getFrameBackgroundContext() {
  if (!state.api) return null;

  const selectedElements = getSelectedElements();
  if (selectedElements.length
    && selectedElements.every((element) => element.type === "frame")) {
    const colors = selectedElements.map(frameBackgroundColorForElement);
    const templateIds = selectedElements.map(frameTemplateIdForElement);
    const gridLayers = selectedElements.map(gridLayerForElement);
    return {
      mode: "selection",
      frames: selectedElements,
      color: colors[0],
      mixed: colors.some((color) => color !== colors[0]),
      templateId: templateIds[0],
      templateMixed: templateIds.some((templateId) => templateId !== templateIds[0]),
      gridLayer: gridLayers[0],
      gridLayerMixed: gridLayers.some((gridLayer) => gridLayer !== gridLayers[0])
    };
  }

  const activeType = state.api.getAppState?.().activeTool?.type;
  if (activeType === "frame" || state.activeWhiteboardTool === "frame") {
    return {
      mode: "tool",
      frames: [],
      color: normalizeFrameBackgroundColor(state.frameBackgroundColor),
      mixed: false,
      templateId: state.frameTemplateId,
      templateMixed: false,
      gridLayer: state.frameGridLayer,
      gridLayerMixed: false
    };
  }

  return null;
}

function getImageGridLayerContext() {
  if (!state.api) return null;
  const selectedElements = getSelectedElements();
  if (!selectedElements.length
    || !selectedElements.every((element) => element.type === "image" && !isGeometryFrameElement(element))) {
    return null;
  }
  const gridLayers = selectedElements.map(gridLayerForElement);
  return {
    images: selectedElements,
    gridLayer: gridLayers[0],
    mixed: gridLayers.some((gridLayer) => gridLayer !== gridLayers[0])
  };
}

function requestFrameBackgroundControlSync() {
  if (state.frameBackgroundControlFrame) return;
  state.frameBackgroundControlFrame = window.requestAnimationFrame(() => {
    state.frameBackgroundControlFrame = null;
    syncFrameBackgroundControl();
  });
}

function syncFrameBackgroundControl() {
  const frameContext = getFrameBackgroundContext();
  const imageContext = getImageGridLayerContext();
  const panelColumn = rootEl.querySelector(".selected-shape-actions .panelColumn");
  if (!panelColumn) {
    frameBackgroundControl.hidden = true;
    frameBackgroundControl.remove();
    imageGridLayerControl.hidden = true;
    imageGridLayerControl.remove();
    return;
  }

  if (frameContext) {
    attachNativePropertyControl(frameBackgroundControl, panelColumn);
    frameBackgroundControl.hidden = false;
    renderFrameBackgroundControl(frameContext);
  } else {
    frameBackgroundControl.hidden = true;
    frameBackgroundControl.remove();
  }

  if (imageContext) {
    attachNativePropertyControl(imageGridLayerControl, panelColumn);
    imageGridLayerControl.hidden = false;
    renderImageGridLayerControl(imageContext);
  } else {
    imageGridLayerControl.hidden = true;
    imageGridLayerControl.remove();
  }
}

function attachNativePropertyControl(control, panelColumn) {
  if (panelColumn.contains(control)) return;
  const emptySlot = Array.from(panelColumn.children).find((child) => (
    child.tagName === "DIV"
    && child.childElementCount === 0
    && !child.textContent.trim()
  ));
  if (emptySlot) {
    emptySlot.append(control);
  } else {
    panelColumn.insertBefore(control, panelColumn.firstElementChild);
  }
}

function renderFrameBackgroundControl(context = getFrameBackgroundContext()) {
  if (!context) return;

  const color = normalizeFrameBackgroundColor(context.color);
  const templateId = normalizeFrameTemplateId(context.templateId);
  frameBackgroundControl.classList.toggle("is-mixed", Boolean(context.mixed));
  frameBackgroundControl.classList.toggle("is-template-mixed", Boolean(context.templateMixed));
  frameBackgroundControl.classList.toggle("is-grid-layer-mixed", Boolean(context.gridLayerMixed));
  frameBackgroundControl.dataset.mode = context.mode;
  frameTemplateButtons.forEach((button) => {
    const isActive = !context.templateMixed && button.dataset.frameTemplate === templateId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  frameBackgroundPresetButtons.forEach((button) => {
    const buttonColor = normalizeFrameBackgroundColor(button.dataset.frameBackgroundColor);
    const isActive = !context.mixed && buttonColor === color;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  frameGridLayerButtons.forEach((button) => {
    const isActive = !context.gridLayerMixed
      && normalizeGridLayer(button.dataset.frameGridLayer) === normalizeGridLayer(context.gridLayer);
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  frameBackgroundCustomButton.style.setProperty("--swatch-color", color);
  frameBackgroundCustomButton.classList.toggle("is-transparent", color === "transparent");
  frameBackgroundColorInput.setAttribute(
    "aria-label",
    context.mixed ? "Choose one background for selected frames" : `Custom frame background color ${color}`
  );
  if (color !== "transparent") {
    frameBackgroundColorInput.value = normalizeHexColor(color, DEFAULT_FRAME_BACKGROUND);
  }
}

function renderImageGridLayerControl(context = getImageGridLayerContext()) {
  if (!context) return;
  imageGridLayerControl.classList.toggle("is-grid-layer-mixed", Boolean(context.mixed));
  imageGridLayerButtons.forEach((button) => {
    const isActive = !context.mixed
      && normalizeGridLayer(button.dataset.imageGridLayer) === normalizeGridLayer(context.gridLayer);
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function applyFrameGridLayer(value) {
  const context = getFrameBackgroundContext();
  if (!context) return;
  const gridLayer = normalizeGridLayer(value);
  state.frameGridLayer = gridLayer;

  if (context.mode === "selection") {
    updateElementsGridLayer(context.frames, gridLayer, "Frame grid position updated");
  } else {
    ensurePendingFrameSettings().gridLayer = gridLayer;
    requestFrameBackgroundControlSync();
    setStatus("Frame grid position set");
  }
}

function applyImageGridLayer(value) {
  const context = getImageGridLayerContext();
  if (!context) return;
  updateElementsGridLayer(
    context.images,
    normalizeGridLayer(value),
    context.images.length === 1 ? "Image grid position updated" : "Image grid positions updated"
  );
}

function withGridLayerMetadata(element, value) {
  const gridLayer = normalizeGridLayer(value);
  if (gridLayerForElement(element) === gridLayer
    && element?.customData?.[GRID_LAYER_META_KEY]?.placement === gridLayer) {
    return element;
  }
  return bumpElement({
    ...element,
    customData: {
      ...(element.customData || {}),
      [GRID_LAYER_META_KEY]: {
        version: 1,
        placement: gridLayer
      }
    }
  });
}

function updateElementsGridLayer(elements, value, message) {
  if (!state.api || !elements.length) return;
  const selectedIds = state.api.getAppState?.().selectedElementIds || {};
  const elementIds = new Set(elements.map((element) => element.id));
  const nextElements = getSceneElementsForMutation().map((element) => (
    elementIds.has(element.id) ? withGridLayerMetadata(element, value) : element
  ));
  state.api.updateScene({
    elements: nextElements,
    appState: { selectedElementIds: selectedIds },
    captureUpdate: CAPTURE_IMMEDIATELY
  });
  requestFrameBackgroundControlSync();
  renderGridOverlay();
  setStatus(message);
}

function ensurePendingFrameSettings() {
  if (!state.pendingFrameBackground) {
    state.pendingFrameBackground = {
      color: state.frameBackgroundColor,
      templateId: state.frameTemplateId,
      gridLayer: state.frameGridLayer,
      knownFrameIds: new Set(
        state.api.getSceneElements?.()
          .filter((element) => element.type === "frame" && !element.isDeleted)
          .map((element) => element.id)
        || []
      )
    };
  }
  return state.pendingFrameBackground;
}

function applyFrameTemplate(value) {
  const context = getFrameBackgroundContext();
  if (!context) return;

  const templateId = normalizeFrameTemplateId(value);
  state.frameTemplateId = templateId;
  saveFrameTemplateId(templateId);

  if (context.mode === "selection") {
    const selectedIds = state.api.getAppState?.().selectedElementIds || {};
    const selectedFrameIds = new Set(context.frames.map((frame) => frame.id));
    const nextElements = getSceneElementsForMutation().map((element) => (
      selectedFrameIds.has(element.id)
        ? applyFrameTemplateToElement(element, templateId)
        : element
    ));
    state.api.updateScene({
      elements: nextElements,
      appState: { selectedElementIds: selectedIds },
      captureUpdate: CAPTURE_IMMEDIATELY
    });
    scheduleFrameBackgroundSync();
  } else {
    ensurePendingFrameSettings().templateId = templateId;
  }

  requestFrameBackgroundControlSync();
  setStatus(templateId === "custom"
    ? "Custom frame size"
    : `${FRAME_TEMPLATES[templateId].label} frame size locked`);
}

function applyFrameTemplateToElement(frame, templateId) {
  const normalizedId = normalizeFrameTemplateId(templateId);
  const template = FRAME_TEMPLATES[normalizedId];
  if (normalizedId === "custom") {
    return bumpElement({
      ...frame,
      customData: {
        ...(frame.customData || {}),
        [FRAME_TEMPLATE_META_KEY]: {
          version: 1,
          id: "custom",
          locked: false
        }
      }
    });
  }

  const currentWidth = Math.abs(Number(frame.width) || template.width);
  const currentHeight = Math.abs(Number(frame.height) || template.height);
  const centerX = (Number(frame.x) || 0) + currentWidth / 2;
  const centerY = (Number(frame.y) || 0) + currentHeight / 2;
  return bumpElement({
    ...frame,
    x: centerX - template.width / 2,
    y: centerY - template.height / 2,
    width: template.width,
    height: template.height,
    customData: {
      ...(frame.customData || {}),
      [FRAME_TEMPLATE_META_KEY]: {
        version: 1,
        id: normalizedId,
        locked: true,
        width: template.width,
        height: template.height
      }
    }
  });
}

function enforceFrameTemplateDimensions(frame) {
  if (!frame || frame.isDeleted || frame.type !== "frame") return frame;
  const templateId = frameTemplateIdForElement(frame);
  if (templateId === "custom") return frame;
  const template = FRAME_TEMPLATES[templateId];
  if (Math.abs((Number(frame.width) || 0) - template.width) < 0.1
    && Math.abs((Number(frame.height) || 0) - template.height) < 0.1) {
    return frame;
  }
  return bumpElement({
    ...frame,
    width: template.width,
    height: template.height,
    customData: {
      ...(frame.customData || {}),
      [FRAME_TEMPLATE_META_KEY]: {
        version: 1,
        id: templateId,
        locked: true,
        width: template.width,
        height: template.height
      }
    }
  });
}

function applyFrameBackgroundColor(value) {
  const context = getFrameBackgroundContext();
  if (!context) return;

  const color = normalizeFrameBackgroundColor(value, state.frameBackgroundColor);
  state.frameBackgroundColor = color;
  saveFrameBackgroundColor(color);

  if (context.mode === "selection") {
    updateSelectedFrameBackgroundColors(context.frames, color);
  } else {
    ensurePendingFrameSettings().color = color;
    setStatus("Frame background set");
  }

  requestFrameBackgroundControlSync();
}

function updateSelectedFrameBackgroundColors(frames, color) {
  const frameIds = new Set(frames.map((frame) => frame.id));
  const sceneElements = getSceneElementsForMutation();
  const backgroundsByFrameId = new Map();
  sceneElements.forEach((element) => {
    const owner = element.customData?.[FRAME_BACKGROUND_OWNER_KEY];
    if (owner?.frameId && !element.isDeleted) {
      backgroundsByFrameId.set(owner.frameId, element);
    }
  });

  const patches = new Map();
  frames.forEach((selectedFrame) => {
    const frame = sceneElements.find((element) => element.id === selectedFrame.id) || selectedFrame;
    const metadata = frame.customData?.[FRAME_BACKGROUND_META_KEY];
    const metadataBackground = metadata?.elementId
      ? sceneElements.find((element) => element.id === metadata.elementId && !element.isDeleted)
      : null;
    const background = metadataBackground || backgroundsByFrameId.get(frame.id) || null;
    state.frameBackgroundColors.set(frame.id, color);

    patches.set(frame.id, bumpElement({
      ...frame,
      backgroundColor: "transparent",
      customData: {
        ...(frame.customData || {}),
        [FRAME_BACKGROUND_META_KEY]: {
          version: 1,
          elementId: background?.id || null,
          color
        }
      }
    }));

    if (background) {
      patches.set(background.id, bumpElement({
        ...background,
        backgroundColor: color,
        customData: {
          ...(background.customData || {}),
          [FRAME_BACKGROUND_OWNER_KEY]: {
            version: 1,
            frameId: frame.id,
            color
          }
        }
      }));
    }
  });

  if (!patches.size) return;
  state.api.updateScene({
    elements: sceneElements.map((element) => patches.get(element.id) || element),
    captureUpdate: CAPTURE_IMMEDIATELY
  });
  scheduleFrameBackgroundSync();
  setStatus(frameIds.size === 1 ? "Frame background updated" : "Frame backgrounds updated");
}

function openAppearanceDialog() {
  if (!ensureApi()) return;

  const anchor = document.querySelector('[data-tool-group="board"] [data-tool-group-toggle]');
  const anchorRect = anchor?.getBoundingClientRect();
  if (anchorRect?.width) {
    state.appearanceAnchorRect = {
      left: anchorRect.left,
      top: anchorRect.top,
      right: anchorRect.right,
      bottom: anchorRect.bottom
    };
  }
  const currentAppearance = parseBackgroundColor(
    state.api.getAppState?.().viewBackgroundColor
  );

  state.appearanceMode = "canvas";
  appearanceDialogEyebrow.textContent = "Board appearance";
  appearanceDialogTitle.textContent = "Canvas background";
  appearanceApplyLabel.textContent = "Apply";
  appearanceOpacityField.hidden = false;
  appearanceColorInput.value = currentAppearance.color;
  appearanceHexInput.value = currentAppearance.color.toUpperCase();
  appearanceOpacityInput.value = String(currentAppearance.opacity);
  renderAppearancePreview();
  closeToolContextMenu();

  if (!appearanceDialog.open) {
    if (typeof appearanceDialog.show === "function") {
      appearanceDialog.show();
    } else {
      appearanceDialog.setAttribute("open", "");
    }
  }
  positionAppearanceDialog();
  window.requestAnimationFrame(() => {
    positionAppearanceDialog();
    appearanceCustomColorSwatch.focus();
  });
}

function positionAppearanceDialog() {
  if (!appearanceDialog.open) return;
  const rect = appearanceDialog.getBoundingClientRect();
  const anchor = state.appearanceAnchorRect || {
    left: 72,
    right: 72,
    top: Math.max(8, (window.innerHeight - rect.height) / 2),
    bottom: 0
  };
  const safeTop = 8;
  const safeBottom = window.innerHeight - getActiveBottomDockInset(8);
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const rightSideLeft = anchor.right + 26;
  const leftSideLeft = anchor.left - rect.width - 12;
  const left = rightSideLeft <= maxLeft
    ? rightSideLeft
    : clamp(leftSideLeft, 8, maxLeft);
  const top = clamp(
    anchor.top - 6,
    safeTop,
    Math.max(safeTop, safeBottom - rect.height - 8)
  );
  appearanceDialog.style.left = `${Math.round(left)}px`;
  appearanceDialog.style.top = `${Math.round(top)}px`;
}

function closeAppearanceDialog() {
  if (!appearanceDialog.open) return;
  if (typeof appearanceDialog.close === "function") {
    appearanceDialog.close();
  } else {
    appearanceDialog.removeAttribute("open");
    state.appearanceMode = null;
  }
}

function handleAppearanceSubmit(event) {
  event.preventDefault();
  const color = normalizeHexColor(appearanceHexInput.value, appearanceColorInput.value);
  const opacity = clampNumber(Number(appearanceOpacityInput.value), 0, 100);
  const background = colorWithOpacity(color, opacity);
  state.api.updateScene({
    appState: { viewBackgroundColor: background },
    captureUpdate: CAPTURE_IMMEDIATELY
  });
  closeAppearanceDialog();
  scheduleAutosave();
  setStatus("Canvas updated");
}

function scheduleFrameBackgroundSync() {
  if (!state.api
    || isFrameBackgroundSyncDeferred()
    || state.frameBackgroundSyncInProgress
    || state.frameBackgroundSyncFrame) {
    return;
  }

  const hasManagedFrame = state.pendingFrameBackground
    || state.elements.some((element) => (
      element.customData?.[FRAME_BACKGROUND_META_KEY]
      || element.customData?.[FRAME_BACKGROUND_OWNER_KEY]
      || element.customData?.[FRAME_TEMPLATE_META_KEY]
      || state.frameBackgroundColors.has(element.id)
    ));
  if (!hasManagedFrame) return;

  state.frameBackgroundSyncFrame = window.requestAnimationFrame(() => {
    state.frameBackgroundSyncFrame = null;
    syncFrameBackgrounds();
  });
}

function syncFrameBackgrounds(sceneElementsOverride = null) {
  if (!state.api || isFrameBackgroundSyncDeferred() || state.frameBackgroundSyncInProgress) return;

  const sceneElements = sceneElementsOverride
    ? Array.from(sceneElementsOverride)
    : getSceneElementsForMutation();
  let frames = sceneElements.filter((element) => element.type === "frame");
  const elementsById = new Map(sceneElements.map((element) => [element.id, element]));
  const backgroundsByFrameId = new Map();
  const elementPatches = new Map();

  frames = frames.map((frame) => {
    const enforcedFrame = enforceFrameTemplateDimensions(frame);
    if (enforcedFrame === frame) return frame;
    elementPatches.set(frame.id, enforcedFrame);
    elementsById.set(frame.id, enforcedFrame);
    return enforcedFrame;
  });

  sceneElements.forEach((element) => {
    const owner = element.customData?.[FRAME_BACKGROUND_OWNER_KEY];
    if (owner?.frameId && !element.isDeleted) {
      backgroundsByFrameId.set(owner.frameId, element);
      if (owner.color) {
        state.frameBackgroundColors.set(
          owner.frameId,
          normalizeFrameBackgroundColor(owner.color, DEFAULT_FRAME_BACKGROUND)
        );
      }
    }
  });

  frames.forEach((frame) => {
    const metadata = frame.customData?.[FRAME_BACKGROUND_META_KEY];
    if (metadata?.color) {
      state.frameBackgroundColors.set(
        frame.id,
        normalizeFrameBackgroundColor(metadata.color, DEFAULT_FRAME_BACKGROUND)
      );
    }
  });

  if (state.pendingFrameBackground) {
    const pendingFrameIndex = frames.findIndex((frame) => (
      !frame.isDeleted
      && !state.pendingFrameBackground.knownFrameIds.has(frame.id)
      && Math.abs(frame.width || 0) > 1
      && Math.abs(frame.height || 0) > 1
    ));
    if (pendingFrameIndex >= 0) {
      let pendingFrame = frames[pendingFrameIndex];
      const templateId = normalizeFrameTemplateId(state.pendingFrameBackground.templateId);
      if (templateId !== "custom") {
        pendingFrame = applyFrameTemplateToElement(pendingFrame, templateId);
      }
      pendingFrame = withGridLayerMetadata(pendingFrame, state.pendingFrameBackground.gridLayer);
      frames[pendingFrameIndex] = pendingFrame;
      elementPatches.set(pendingFrame.id, pendingFrame);
      elementsById.set(pendingFrame.id, pendingFrame);
      state.frameBackgroundColors.set(pendingFrame.id, state.pendingFrameBackground.color);
      state.pendingFrameBackground.knownFrameIds.add(pendingFrame.id);
    }
  }

  const backgroundsToAdd = [];

  frames.forEach((frame) => {
    const color = state.frameBackgroundColors.get(frame.id);
    if (!color) return;

    const metadata = frame.customData?.[FRAME_BACKGROUND_META_KEY];
    let background = metadata?.elementId ? elementsById.get(metadata.elementId) : null;
    if (!background || background.isDeleted) {
      background = backgroundsByFrameId.get(frame.id) || null;
    }

    if (frame.isDeleted) {
      if (background && !background.isDeleted) {
        elementPatches.set(background.id, bumpElement({
          ...background,
          isDeleted: true,
          frameId: null
        }));
      }
      return;
    }

    if (!background || background.isDeleted) {
      background = createFrameBackgroundElement(frame, color);
      backgroundsToAdd.push(background);
      elementsById.set(background.id, background);
      backgroundsByFrameId.set(frame.id, background);
    } else if (!frameBackgroundMatches(background, frame, color)) {
      background = bumpElement({
        ...background,
        ...frameBackgroundGeometry(frame),
        backgroundColor: color,
        opacity: frame.opacity ?? 100,
        frameId: null,
        locked: true,
        customData: {
          ...(background.customData || {}),
          [FRAME_BACKGROUND_OWNER_KEY]: {
            version: 1,
            frameId: frame.id,
            color
          }
        }
      });
      elementPatches.set(background.id, background);
    }

    const nextMetadata = {
      version: 1,
      elementId: background.id,
      color
    };
    if (frame.backgroundColor !== "transparent"
      || metadata?.elementId !== background.id
      || metadata?.color !== color) {
      elementPatches.set(frame.id, bumpElement({
        ...frame,
        backgroundColor: "transparent",
        customData: {
          ...(frame.customData || {}),
          [FRAME_BACKGROUND_META_KEY]: nextMetadata
        }
      }));
    }
  });

  sceneElements.forEach((element) => {
    const owner = element.customData?.[FRAME_BACKGROUND_OWNER_KEY];
    if (!owner?.frameId || element.isDeleted || elementPatches.has(element.id)) return;
    const frame = elementsById.get(owner.frameId);
    if (!frame || frame.isDeleted) {
      elementPatches.set(element.id, bumpElement({
        ...element,
        isDeleted: true,
        frameId: null
      }));
    }
  });

  if (!backgroundsToAdd.length && !elementPatches.size) return;

  const patchedElements = sceneElements.map((element) => elementPatches.get(element.id) || element);
  const existingBackgrounds = patchedElements.filter((element) => (
    element.customData?.[FRAME_BACKGROUND_OWNER_KEY]
  ));
  const contentElements = patchedElements.filter((element) => (
    !element.customData?.[FRAME_BACKGROUND_OWNER_KEY]
  ));
  const nextElements = [
    ...existingBackgrounds,
    ...backgroundsToAdd,
    ...contentElements
  ];
  state.frameBackgroundSyncInProgress = true;
  state.api.updateScene({
    elements: nextElements,
    captureUpdate: CAPTURE_NEVER
  });
  if (isFrameBackgroundLiveGesture()) {
    state.frameBackgroundSyncInProgress = false;
    return;
  }
  window.requestAnimationFrame(() => {
    state.frameBackgroundSyncInProgress = false;
    scheduleFrameBackgroundSync();
  });
}

function createFrameBackgroundElement(frame, color) {
  const created = Date.now();
  return {
    id: generateId("frame_background"),
    type: "rectangle",
    ...frameBackgroundGeometry(frame),
    strokeColor: "transparent",
    backgroundColor: color,
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: frame.opacity ?? 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: randomInteger(),
    version: 1,
    versionNonce: randomInteger(),
    isDeleted: false,
    boundElements: null,
    updated: created,
    link: null,
    locked: true,
    customData: {
      [FRAME_BACKGROUND_OWNER_KEY]: {
        version: 1,
        frameId: frame.id,
        color
      }
    }
  };
}

function frameBackgroundGeometry(frame) {
  const width = Math.max(0, (Number(frame.width) || 0) - FRAME_BACKGROUND_INSET * 2);
  const height = Math.max(0, (Number(frame.height) || 0) - FRAME_BACKGROUND_INSET * 2);
  return {
    x: (Number(frame.x) || 0) + ((Number(frame.width) || 0) - width) / 2,
    y: (Number(frame.y) || 0) + ((Number(frame.height) || 0) - height) / 2,
    width,
    height,
    angle: frame.angle || 0
  };
}

function frameBackgroundMatches(background, frame, color) {
  const owner = background.customData?.[FRAME_BACKGROUND_OWNER_KEY];
  const geometry = frameBackgroundGeometry(frame);
  return !background.isDeleted
    && background.type === "rectangle"
    && background.x === geometry.x
    && background.y === geometry.y
    && background.width === geometry.width
    && background.height === geometry.height
    && background.angle === geometry.angle
    && background.backgroundColor === color
    && background.opacity === (frame.opacity ?? 100)
    && background.frameId === null
    && background.locked === true
    && owner?.frameId === frame.id
    && owner?.color === color;
}

function handleAppearanceColorInput() {
  appearanceHexInput.value = appearanceColorInput.value.toUpperCase();
  renderAppearancePreview();
}

function selectAppearancePreset(value) {
  if (value === "transparent") {
    appearanceOpacityInput.value = "0";
  } else {
    const color = normalizeHexColor(value, appearanceColorInput.value);
    appearanceColorInput.value = color;
    appearanceHexInput.value = color.toUpperCase();
    if (Number(appearanceOpacityInput.value) === 0) appearanceOpacityInput.value = "100";
  }
  renderAppearancePreview();
}

function handleAppearanceHexInput() {
  const color = normalizeHexColor(appearanceHexInput.value, "");
  if (!color) return;
  appearanceColorInput.value = color;
  renderAppearancePreview();
}

function normalizeAppearanceHexInput() {
  const color = normalizeHexColor(appearanceHexInput.value, appearanceColorInput.value);
  appearanceColorInput.value = color;
  appearanceHexInput.value = color.toUpperCase();
  renderAppearancePreview();
}

function prepareFrameBackgroundColorPicker() {
  const context = getFrameBackgroundContext();
  const color = context?.color === "transparent"
    ? DEFAULT_FRAME_BACKGROUND
    : context?.color;
  frameBackgroundColorInput.value = normalizeHexColor(color, DEFAULT_FRAME_BACKGROUND);
  positionNativeColorPicker(
    frameBackgroundColorInput,
    frameBackgroundCustomButton,
    getFrameBackgroundColorPickerOwner()
  );
}

function getFrameBackgroundColorPickerOwner() {
  const propertyIsland = frameBackgroundCustomButton.closest(".Island.App-menu__left");
  const propertyIslandRect = propertyIsland?.getBoundingClientRect?.();
  if (propertyIslandRect?.width && propertyIslandRect?.height) return propertyIsland;
  const selectedActions = frameBackgroundCustomButton.closest(".selected-shape-actions");
  const selectedActionsRect = selectedActions?.getBoundingClientRect?.();
  if (selectedActionsRect?.width && selectedActionsRect?.height) return selectedActions;
  return frameBackgroundCustomButton.closest(".panelColumn") || frameBackgroundControl;
}

function positionNativeColorPicker(input, trigger, owner, options = {}) {
  const triggerRect = trigger.getBoundingClientRect();
  const measuredOwnerRect = owner?.getBoundingClientRect?.();
  const ownerRect = measuredOwnerRect?.width && measuredOwnerRect?.height
    ? measuredOwnerRect
    : triggerRect;
  const gap = 16;
  const inputWidth = 26;
  const inputHeight = 48;
  const nativePopupOffset = inputHeight + 4;
  const safeBottom = window.innerHeight - getActiveBottomDockInset(8);
  const left = clamp(
    ownerRect.right + gap,
    8,
    Math.max(8, window.innerWidth - inputWidth - 8)
  );
  const top = options.alignPopupTop
    ? clamp(
        ownerRect.top,
        8,
        Math.max(8, safeBottom - NATIVE_COLOR_PICKER_ESTIMATED_HEIGHT)
      ) + NATIVE_COLOR_PICKER_ESTIMATED_HEIGHT
    : clamp(
        triggerRect.top - nativePopupOffset,
        -inputHeight,
        Math.max(
          -inputHeight,
          safeBottom - NATIVE_COLOR_PICKER_ESTIMATED_HEIGHT - nativePopupOffset
        )
      );

  input.style.left = `${Math.round(left)}px`;
  input.style.top = `${Math.round(top)}px`;
  input.dataset.anchorGap = String(gap);
  input.dataset.triggerTop = String(Math.round(triggerRect.top));
  void input.offsetWidth;
}

function openPositionedNativeColorPicker(input, trigger, owner, options = {}) {
  positionNativeColorPicker(input, trigger, owner, options);
  input.click();
}

function renderAppearancePreview() {
  const opacity = state.appearanceMode === "canvas"
    ? clampNumber(Number(appearanceOpacityInput.value), 0, 100)
    : 100;
  const opacityPosition = `calc(${opacity}% + ${8 - opacity * 0.16}px)`;
  appearanceOpacityInput.style.setProperty("--appearance-opacity-fill-position", `${opacity}%`);
  appearanceOpacityValue.parentElement?.style.setProperty(
    "--appearance-opacity-position",
    opacityPosition
  );
  appearanceOpacityValue.textContent = String(opacity);
  appearanceOpacityValue.hidden = opacity === 0;
  appearanceOpacityMaximum.hidden = true;
  appearanceCustomColorSwatch.style.setProperty("--swatch-color", appearanceColorInput.value);
  appearancePresetButtons.forEach((button) => {
    const value = button.dataset.appearanceColor;
    const active = value === "transparent"
      ? opacity === 0
      : opacity > 0 && normalizeHexColor(value, "") === appearanceColorInput.value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const usesPreset = appearancePresetButtons.some((button) => button.classList.contains("active"));
  appearanceCustomColorSwatch.parentElement?.classList.toggle("is-active", !usesPreset && opacity > 0);
}

function normalizeHexColor(value, fallback = "#ffffff") {
  const compact = String(value || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(compact)) {
    return `#${compact.split("").map((part) => `${part}${part}`).join("")}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(compact)) {
    return `#${compact}`.toLowerCase();
  }
  return fallback;
}

function parseBackgroundColor(value) {
  const text = String(value || "").trim();
  if (text.toLowerCase() === "transparent") {
    return { color: "#ffffff", opacity: 0 };
  }

  const hex = normalizeHexColor(text, "");
  if (hex) return { color: hex, opacity: 100 };

  const match = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!match) return { color: "#ffffff", opacity: 100 };

  const red = clampNumber(Math.round(Number(match[1])), 0, 255);
  const green = clampNumber(Math.round(Number(match[2])), 0, 255);
  const blue = clampNumber(Math.round(Number(match[3])), 0, 255);
  const alpha = match[4] === undefined ? 1 : clampNumber(Number(match[4]), 0, 1);
  return {
    color: rgbToHex(red, green, blue),
    opacity: Math.round(alpha * 100)
  };
}

function colorWithOpacity(color, opacity) {
  const normalized = normalizeHexColor(color);
  const alpha = clampNumber(Number(opacity), 0, 100) / 100;
  if (alpha >= 1) return normalized;
  const { red, green, blue } = hexToRgb(normalized);
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(2))})`;
}

function flattenBackgroundColor(background) {
  const parsed = parseBackgroundColor(background);
  const alpha = parsed.opacity / 100;
  const { red, green, blue } = hexToRgb(parsed.color);
  return rgbToHex(
    Math.round(red * alpha + 255 * (1 - alpha)),
    Math.round(green * alpha + 255 * (1 - alpha)),
    Math.round(blue * alpha + 255 * (1 - alpha))
  );
}

function hexToRgb(color) {
  const normalized = normalizeHexColor(color).slice(1);
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((part) => clampNumber(Math.round(part), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function toggleNativeLibrary() {
  const libraryControl = rootEl.querySelector('input[aria-label="Library"]');
  if (!libraryControl) {
    setStatus("Library unavailable", "error");
    return;
  }

  libraryControl.click();
  window.requestAnimationFrame(() => {
    setStatus(libraryControl.checked ? "Library opened" : "Library closed");
  });
}

function openNativeMermaidDialog() {
  const moreToolsButton = rootEl.querySelector('button[data-testid="dropdown-menu-button"][title="More tools"]');
  if (!moreToolsButton) {
    setStatus("Mermaid tool unavailable", "error");
    return;
  }

  moreToolsButton.click();
  window.requestAnimationFrame(() => {
    const mermaidButton = Array.from(rootEl.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Mermaid to Excalidraw"));
    if (!mermaidButton) {
      moreToolsButton.click();
      setStatus("Mermaid tool unavailable", "error");
      return;
    }

    mermaidButton.click();
    setStatus("Mermaid editor opened");
  });
}

function updateSelectionState(appState = state.api?.getAppState?.()) {
  const ids = appState?.selectedElementIds || {};
  const count = Object.values(ids).filter(Boolean).length;

  selectionEl.textContent =
    count === 0 ? "No selection" : count === 1 ? "1 selected" : `${count} selected`;

  document.querySelectorAll(".arrange-control").forEach((button) => {
    const action = button.dataset.action || "";
    const needsThree = action.startsWith("distribute");
    button.disabled = needsThree ? count < 3 : count < 2;
  });

  const editGeometryButton = document.querySelector('[data-action="edit-geometry"]');
  editGeometryButton?.classList.toggle(
    "active",
    !geometryShell.classList.contains("is-hidden") || Boolean(getSelectedGeometryElement())
  );
  updateToolGroupActiveStates();
  updatePinnedToolStates();
}

function getSelectedElements() {
  if (!state.api) return [];
  const selectedIds = state.api.getAppState?.().selectedElementIds || {};
  return state.api
    .getSceneElements()
    .filter((element) => selectedIds[element.id] && !element.isDeleted);
}

function getSceneElementsForMutation() {
  return Array.from(
    state.api?.getSceneElementsIncludingDeleted?.()
    || state.elements
    || []
  );
}

function sceneForStorage() {
  const api = state.api;
  if (!api) return null;
  const elements = api.getSceneElements?.()
    || api.getSceneElementsIncludingDeleted?.().filter((element) => !element.isDeleted)
    || [];

  return {
    type: "excalidraw",
    version: 2,
    source: "kelp-whiteboard",
    roomId,
    savedAt: new Date().toISOString(),
    elements,
    appState: pickPersistedAppState(api.getAppState?.() || {}),
    files: filesForElements(elements),
    kelpGrid: gridSettingsPayload()
  };
}

function pickPersistedAppState(appState) {
  return {
    viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
    gridModeEnabled: Boolean(appState.gridModeEnabled),
    gridSize: Number(appState.gridSize) || GRID_SPACING_VALUES[state.gridSpacing],
    theme: appState.theme || "light",
    name: appState.name || "Kelp Whiteboard",
    exportBackground: true,
    exportWithDarkMode: false
  };
}

async function loadInitialScene() {
  const saved = await readStoredScene();
  if (saved) {
    return normalizeScene(saved);
  }

  return {
    appState: {
      viewBackgroundColor: "#ffffff",
      gridModeEnabled: false,
      gridSize: GRID_SPACING_VALUES.standard,
      name: "Kelp Whiteboard"
    }
  };
}

async function readStoredScene() {
  try {
    return await backendAdapters.whiteboards.load(whiteboardAdapterContext("board-loaded"));
  } catch (error) {
    handleWhiteboardAdapterError("board loading", error, false);
    return null;
  }
}

function normalizeScene(scene) {
  return {
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridModeEnabled: false,
      gridSize: GRID_SPACING_VALUES.standard,
      name: "Kelp Whiteboard",
      ...(scene.appState || {})
    },
    files: scene.files || {},
    kelpGrid: scene.kelpGrid || null,
    scrollToContent: Boolean(scene.elements?.length)
  };
}

function persistentContentSignature(
  elements = state.elements,
  appState = state.appState,
  files = state.files
) {
  const liveElements = Array.from(elements || []);
  const elementTokens = liveElements.map((element) => [
    element.id,
    Number(element.version) || 0,
    Number(element.versionNonce) || 0,
    element.isDeleted ? 1 : 0,
    element.fileId || ""
  ]);
  const referencedFileIds = Array.from(new Set(
    liveElements
      .filter((element) => !element.isDeleted && element.fileId)
      .map((element) => element.fileId)
  )).sort();
  const fileTokens = referencedFileIds.map((fileId) => {
    const file = files?.[fileId] || {};
    const dataUrl = String(file.dataURL || "");
    return [
      fileId,
      file.mimeType || "",
      dataUrl.length,
      dataUrl.slice(-24)
    ];
  });

  return JSON.stringify({
    elements: elementTokens,
    appState: pickPersistedAppState(appState || {}),
    files: fileTokens,
    kelpGrid: gridSettingsPayload()
  });
}

function scheduleAutosaveForContentChange(elements, appState, files) {
  const signature = persistentContentSignature(elements, appState, files);
  if (state.applyingCollaborativeScene) {
    state.lastAutosaveContentSignature = signature;
    return;
  }
  if (!state.lastAutosaveContentSignature) {
    state.lastAutosaveContentSignature = signature;
    return;
  }
  if (signature === state.lastAutosaveContentSignature) return;
  scheduleAutosave(signature);
}

function scheduleAutosave(signature = persistentContentSignature()) {
  state.lastAutosaveContentSignature = signature;
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => saveToLocal(false), 850);
}

async function saveToLocal(showToast = false) {
  const scene = sceneForStorage();
  if (!scene) return false;
  state.lastAutosaveContentSignature = persistentContentSignature();

  const operation = state.persistenceQueue
    .catch(() => {})
    .then(async () => {
      const context = whiteboardAdapterContext("board-saved", scene);
      const fileResult = await backendAdapters.files.save(scene.files, context);
      await backendAdapters.whiteboards.save(scene, { ...context, fileResult });
      await backendAdapters.collaboration.publishScene({
        type: "scene",
        roomId,
        clientId: collaborationClientId,
        revision: scene.savedAt,
        scene
      }, context);
    });
  state.persistenceQueue = operation;

  try {
    await operation;
    if (showToast) setStatus("Saved");
    return true;
  } catch (error) {
    handleWhiteboardAdapterError("board saving", error);
    return false;
  }
}

async function loadFromLocal() {
  const saved = await readStoredScene();
  if (!saved) {
    setStatus("Nothing saved yet", "error");
    return;
  }

  applyScene(saved);
  setStatus("Loaded");
}

async function openBoardFile(file) {
  try {
    let scene = null;

    if (ExcalidrawLib.loadFromBlob) {
      scene = await ExcalidrawLib.loadFromBlob(file, null, null);
    } else {
      scene = JSON.parse(await file.text());
    }

    applyScene(scene);
    setStatus("Board opened");
  } catch (error) {
    setStatus("Could not open file", "error");
  }
}

function applyScene(scene) {
  closeGeometryEditor();
  state.pendingFrameBackground = null;
  state.frameBackgroundColors.clear();
  const normalized = normalizeScene(scene);
  if (normalized.kelpGrid) {
    const grid = normalizeGridSettings(normalized.kelpGrid, true);
    state.gridHorizontal = grid.horizontal;
    state.gridVertical = grid.vertical;
    state.gridSpacing = grid.spacing;
    state.gridColor = grid.color;
    state.gridOpacity = grid.opacity;
    state.rotationAssistEnabled = grid.rotationAssist;
  } else {
    state.gridHorizontal = Boolean(normalized.appState.gridModeEnabled);
    state.gridVertical = Boolean(normalized.appState.gridModeEnabled);
    state.gridSpacing = nearestGridSpacing(normalized.appState.gridSize);
    state.gridColor = DEFAULT_GRID_COLOR;
    state.gridOpacity = DEFAULT_GRID_OPACITY;
  }
  state.gridSettingsLoaded = true;
  normalized.appState.gridModeEnabled = false;
  normalized.appState.gridSize = GRID_SPACING_VALUES[state.gridSpacing];
  saveGridSettings();
  renderGridControls();
  renderRotationAssistControl();
  if (normalized.files && Object.keys(normalized.files).length) {
    state.api.addFiles?.(normalized.files);
  }

  state.api.updateScene({
    elements: normalized.elements,
    appState: normalized.appState,
    captureUpdate: CAPTURE_IMMEDIATELY
  });

  if (normalized.elements.length) {
    state.api.scrollToContent?.(normalized.elements, {
      fitToContent: true,
      animate: true
    });
  }
  requestGridOverlayAttachment();
  renderGridOverlay(normalized.appState);
}

async function clearBoard() {
  if (!window.confirm("Clear this whiteboard?")) return;

  closeGeometryEditor();
  state.pendingFrameBackground = null;
  state.frameBackgroundColors.clear();
  state.api.resetScene?.({ resetLoadingState: true });
  state.api.history?.clear?.();
  try {
    const clearedAt = new Date().toISOString();
    const clearedScene = {
      type: "excalidraw",
      version: 2,
      source: "kelp-whiteboard",
      roomId,
      savedAt: clearedAt,
      elements: [],
      appState: pickPersistedAppState(state.api.getAppState?.() || {}),
      files: {},
      kelpGrid: gridSettingsPayload()
    };
    const context = whiteboardAdapterContext("board-cleared", clearedScene);
    await backendAdapters.whiteboards.clear(context);
    await backendAdapters.collaboration.publishScene({
      type: "scene",
      roomId,
      clientId: collaborationClientId,
      revision: clearedAt,
      scene: clearedScene
    }, context);
  } catch (error) {
    handleWhiteboardAdapterError("board clearing", error);
    return;
  }
  setStatus("Cleared");
}

async function exportBoard(format) {
  if (!ensureApi()) return;

  const elements = state.api.getSceneElements();
  if (!elements.length) {
    setStatus("Board is empty", "error");
    return;
  }

  try {
    if (format === "pdf") {
      await exportPdf(elements);
      return;
    }

    const blob = await exportRasterBlob(elements, format);
    downloadBlob(blob, filenameFor(format));
    setStatus(`${format.toUpperCase()} exported`);
  } catch (error) {
    setStatus("Export failed", "error");
  }
}

async function exportRasterBlob(elements, format) {
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const canvas = await ExcalidrawLib.exportToCanvas({
    elements,
    appState: exportAppState(format),
    files: state.api.getFiles?.() || {},
    exportPadding: EXPORT_PADDING,
    maxWidthOrHeight: EXPORT_MAX_WIDTH_OR_HEIGHT
  });

  return canvasToBlob(canvas, mimeType, format === "jpeg" ? 0.94 : undefined);
}

async function exportPdf(elements) {
  setStatus("Preparing PDF");
  const [canvas, JsPdf] = await Promise.all([
    ExcalidrawLib.exportToCanvas({
      elements,
      appState: exportAppState("pdf"),
      files: state.api.getFiles?.() || {},
      exportPadding: EXPORT_PADDING,
      maxWidthOrHeight: EXPORT_MAX_WIDTH_OR_HEIGHT
    }),
    loadJsPdfConstructor()
  ]);

  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const pdf = new JsPdf({ orientation, unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, width, height);
  pdf.save(filenameFor("pdf"));
  setStatus("PDF exported");
}

async function loadJsPdfConstructor() {
  if (!jsPdfModulePromise) {
    jsPdfModulePromise = import(JSPDF_MODULE_URL)
      .then((module) => module.jsPDF || module.default?.jsPDF || module.default)
      .then((constructor) => {
        if (typeof constructor !== "function") throw new Error("jsPDF did not load");
        return constructor;
      })
      .catch((error) => {
        jsPdfModulePromise = null;
        throw error;
      });
  }

  return jsPdfModulePromise;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Canvas export failed"));
    }, mimeType, quality);
  });
}

function exportAppState(format = "png") {
  const viewBackgroundColor = state.api.getAppState?.().viewBackgroundColor || "#ffffff";
  return {
    ...(state.api.getAppState?.() || {}),
    exportBackground: true,
    exportWithDarkMode: false,
    viewBackgroundColor: format === "png"
      ? viewBackgroundColor
      : flattenBackgroundColor(viewBackgroundColor)
  };
}

function filenameFor(extension) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const safeRoom = roomId.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return `kelp-whiteboard-${safeRoom}-${stamp}.${extension}`;
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 600);
}

function copySelection() {
  const selected = getSelectedElements();
  if (!selected.length) {
    setStatus("Select something first", "error");
    return null;
  }

  const files = filesForElements(selected);
  const payload = {
    source: "kelp-whiteboard",
    elements: deepClone(selected),
    files,
    copiedAt: Date.now()
  };

  state.internalClipboard = payload;
  try {
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(payload));
  } catch (error) {}

  setStatus(selected.length === 1 ? "Copied" : `${selected.length} copied`);
  return payload;
}

function cutSelection() {
  const copied = copySelection();
  if (copied) {
    deleteSelection("Cut");
  }
}

function pasteSelection() {
  const payload = readClipboardPayload();
  if (!payload?.elements?.length) {
    setStatus("Nothing to paste", "error");
    return;
  }

  const clones = cloneElementsForPaste(payload.elements);
  const selectedIds = Object.fromEntries(clones.map((element) => [element.id, true]));

  if (payload.files && Object.keys(payload.files).length) {
    state.api.addFiles?.(payload.files);
  }

  state.api.updateScene({
    elements: [...getSceneElementsForMutation(), ...clones],
    appState: { selectedElementIds: selectedIds },
    captureUpdate: CAPTURE_IMMEDIATELY
  });

  setStatus(clones.length === 1 ? "Pasted" : `${clones.length} pasted`);
}

function readClipboardPayload() {
  if (state.internalClipboard) return state.internalClipboard;

  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function filesForElements(elements) {
  const ids = new Set(elements.map((element) => element.fileId).filter(Boolean));
  const allFiles = state.api.getFiles?.() || {};
  return Object.fromEntries(
    Object.entries(allFiles).filter(([fileId]) => ids.has(fileId))
  );
}

function cloneElementsForPaste(elements) {
  state.pasteCount += 1;
  const offset = 28 + ((state.pasteCount - 1) % 5) * 10;
  const oldToNew = new Map();
  const groupMap = new Map();

  elements.forEach((element) => {
    oldToNew.set(element.id, generateId("el"));
    (element.groupIds || []).forEach((groupId) => {
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, generateId("group"));
      }
    });
  });

  return elements.map((element) => {
    const clone = deepClone(element);
    clone.id = oldToNew.get(element.id);
    clone.x = (clone.x || 0) + offset;
    clone.y = (clone.y || 0) + offset;
    clone.seed = randomInteger();
    clone.version = 1;
    clone.versionNonce = randomInteger();
    clone.updated = Date.now();
    clone.isDeleted = false;
    clone.groupIds = (clone.groupIds || []).map((groupId) => groupMap.get(groupId) || groupId);
    clone.frameId = null;

    if (Array.isArray(clone.boundElements)) {
      clone.boundElements = clone.boundElements
        .map((binding) =>
          oldToNew.has(binding.id)
            ? { ...binding, id: oldToNew.get(binding.id) }
            : null
        )
        .filter(Boolean);

      if (!clone.boundElements.length) {
        clone.boundElements = null;
      }
    }

    if (clone.containerId && oldToNew.has(clone.containerId)) {
      clone.containerId = oldToNew.get(clone.containerId);
    } else {
      clone.containerId = null;
    }

    if (clone.startBinding?.elementId && oldToNew.has(clone.startBinding.elementId)) {
      clone.startBinding = {
        ...clone.startBinding,
        elementId: oldToNew.get(clone.startBinding.elementId)
      };
    } else if (clone.startBinding) {
      clone.startBinding = null;
    }

    if (clone.endBinding?.elementId && oldToNew.has(clone.endBinding.elementId)) {
      clone.endBinding = {
        ...clone.endBinding,
        elementId: oldToNew.get(clone.endBinding.elementId)
      };
    } else if (clone.endBinding) {
      clone.endBinding = null;
    }

    return clone;
  });
}

function deleteSelection(statusMessage = "Deleted") {
  const selected = getSelectedElements();
  if (!selected.length) {
    setStatus("Select something first", "error");
    return;
  }

  const selectedIds = new Set(selected.map((element) => element.id));
  const nextElements = getSceneElementsForMutation().map((element) => {
    if (!selectedIds.has(element.id)) return element;
    return bumpElement({ ...element, isDeleted: true });
  });

  state.api.updateScene({
    elements: nextElements,
    appState: { selectedElementIds: {} },
    captureUpdate: CAPTURE_IMMEDIATELY
  });

  setStatus(statusMessage);
}

function geometryFrameData(element) {
  const frame = element?.customData?.[GEOMETRY_FRAME_KEY];
  return frame?.graph ? frame : null;
}

function isGeometryFrameElement(element) {
  return element?.type === "image" && Boolean(geometryFrameData(element));
}

function getSelectedGeometryElement() {
  return getSelectedElements().find(isGeometryFrameElement) || null;
}

function defaultGeometryGraph(tool = "") {
  return {
    title: "",
    displayMode: "coordinate",
    gridLayer: GRID_LAYER_BEHIND,
    frameBorderStyle: "solid",
    snapToGrid: false,
    autoFit: false,
    viewControls: false,
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    points: [],
    segments: [],
    angles: [],
    functions: [],
    shapes: []
  };
}

function geometryGraphHasContent(graph) {
  return ["points", "segments", "angles", "functions", "shapes"]
    .some((key) => Array.isArray(graph?.[key]) && graph[key].length > 0);
}

async function openGeometryEditor(tool = "") {
  if (!ensureApi()) return;
  try {
    await ensureGeometryDependencies();
  } catch (error) {
    console.error("Geometry editor loading failed", error);
    setStatus("Geometry editor unavailable", "error");
    return;
  }

  if (state.geometryEditor && !geometryShell.classList.contains("is-hidden")) {
    if (tool) state.geometryEditor.setTool(tool);
    return;
  }

  const selected = getSelectedGeometryElement();
  const frame = geometryFrameData(selected);
  const graph = frame?.graph ? deepClone(frame.graph) : defaultGeometryGraph(tool);
  if (tool === "function" && !graph.functions?.length) graph.displayMode = "coordinate";

  state.geometryElementId = selected?.id || null;
  state.geometryDirty = false;
  geometryTitle.textContent = selected ? "Edit geometry frame" : "New geometry frame";
  geometryHost.innerHTML = "";
  geometryShell.classList.remove("is-hidden");
  notifyClassroomGeometryEditorState(true);
  positionGeometryEditor();

  state.geometryEditor = new window.KelpDiagramEditor(geometryHost, {
    graph,
    tools: GEOMETRY_TOOLS,
    hideShapeLabels: true,
    attachLabel: selected ? "Update board" : "Place on board",
    attachTitle: selected ? "Update this geometry frame on the whiteboard." : "Place this geometry frame on the whiteboard.",
    maxCanvasSize: 900,
    fitCanvasToViewport: true,
    sideToolLayout: true
  });

  setTool("selection");
  renderGeometryEditorState();
  if (tool) state.geometryEditor?.setTool?.(tool);
  requestGeometryEditorLayout();
}

async function ensureGeometryDependencies() {
  if (window.math?.parse && window.KelpDiagramEditor) return;
  if (!geometryDependenciesPromise) {
    setStatus("Loading geometry editor");
    geometryDependenciesPromise = (async () => {
      await Promise.all([
        loadStylesheetOnce(
          GEOMETRY_EDITOR_STYLE_URL,
          "kelp-geometry-editor-styles"
        ),
        loadClassicScriptOnce(
          GEOMETRY_MATH_URL,
          "kelp-geometry-math",
          () => Boolean(window.math?.parse)
        )
      ]);
      await loadClassicScriptOnce(
        GEOMETRY_EDITOR_SCRIPT_URL,
        "kelp-geometry-editor-script",
        () => Boolean(window.KelpDiagramEditor)
      );

      if (!window.math?.parse || !window.KelpDiagramEditor) {
        throw new Error("Geometry dependencies were incomplete");
      }
    })().catch((error) => {
      geometryDependenciesPromise = null;
      throw error;
    });
  }

  return geometryDependenciesPromise;
}

function loadClassicScriptOnce(source, id, isReady) {
  if (isReady()) return Promise.resolve();
  const existing = document.getElementById(id);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => isReady() ? resolve() : reject(new Error(`Could not initialize ${id}`)), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Could not load ${id}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = source;
    script.async = true;
    script.addEventListener("load", () => {
      if (isReady()) {
        resolve();
        return;
      }
      script.remove();
      reject(new Error(`Could not initialize ${id}`));
    }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`Could not load ${id}`));
    }, { once: true });
    document.head.appendChild(script);
  });
}

function loadStylesheetOnce(source, id) {
  const existing = document.getElementById(id);
  if (existing?.sheet) return Promise.resolve();
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error(`Could not load ${id}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = source;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => {
      link.remove();
      reject(new Error(`Could not load ${id}`));
    }, { once: true });
    document.head.appendChild(link);
  });
}

function centerGeometryCanvasViewport() {
  const viewport = geometryShell.querySelector(".geometry-editor-scroll");
  const canvas = geometryHost.querySelector(".kde-canvas");
  if (!viewport || !canvas) return;

  const viewportRect = viewport.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const left = viewport.scrollLeft
    + canvasRect.left
    - viewportRect.left
    - (viewport.clientWidth - canvasRect.width) / 2;
  const top = viewport.scrollTop
    + canvasRect.top
    - viewportRect.top
    - (viewport.clientHeight - canvasRect.height) / 2;

  viewport.scrollTo({
    left: Math.max(0, left),
    top: Math.max(0, top),
    behavior: "auto"
  });
}

function requestGeometryEditorLayout({ repositionShell = false } = {}) {
  if (!state.geometryEditor || geometryShell.classList.contains("is-hidden")) return;
  state.geometryLayoutReposition = state.geometryLayoutReposition || Boolean(repositionShell);
  if (state.geometryLayoutFrame) return;

  state.geometryLayoutFrame = window.requestAnimationFrame(() => {
    state.geometryLayoutFrame = null;
    const shouldReposition = state.geometryLayoutReposition;
    state.geometryLayoutReposition = false;
    if (!state.geometryEditor || geometryShell.classList.contains("is-hidden")) return;
    if (shouldReposition && !state.geometryExpanded && document.fullscreenElement !== geometryShell) {
      positionGeometryEditor();
    }
    state.geometryEditor.draw?.();
    window.requestAnimationFrame(() => {
      if (state.geometryEditor && !geometryShell.classList.contains("is-hidden")) {
        centerGeometryCanvasViewport();
      }
    });
  });
}

function handleGeometryChange() {
  if (!state.geometryEditor) return;
  state.geometryDirty = true;
}

function handleGeometryAttach(event) {
  if (!state.geometryEditor || event.detail?.editor !== state.geometryEditor || state.geometryCommitInProgress) return;
  const graph = event.detail?.graph;
  if (!graph) return;

  state.geometryCommitInProgress = true;
  try {
    placeGeometryFrame(graph);
  } finally {
    state.geometryCommitInProgress = false;
  }
}

function handleGeometryOutsidePointerDown(event) {
  if (event.button !== 0
    || geometryShell.classList.contains("is-hidden")
    || geometryShell.contains(event.target)
    || state.geometryCommitInProgress) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  commitGeometryEditorAndClose();
}

function commitGeometryEditorAndClose() {
  if (geometryShell.classList.contains("is-hidden")) return true;
  if (!state.geometryEditor || state.geometryCommitInProgress) return false;

  const graph = state.geometryEditor.getGraph?.();
  if (!state.geometryDirty || !geometryGraphHasContent(graph)) {
    return closeGeometryEditor();
  }

  state.geometryCommitInProgress = true;
  try {
    placeGeometryFrame(graph);
    return geometryShell.classList.contains("is-hidden");
  } finally {
    state.geometryCommitInProgress = false;
  }
}

function createGeometrySnapshot(graph) {
  const holder = document.createElement("div");
  const canvas = document.createElement("canvas");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0";
  holder.style.width = "720px";
  holder.style.height = "720px";
  holder.style.pointerEvents = "none";
  holder.style.opacity = "0";
  canvas.style.width = "720px";
  canvas.style.height = "720px";
  holder.appendChild(canvas);
  document.body.appendChild(holder);

  try {
    const rendered = window.KelpDiagramEditor.renderToCanvas(canvas, graph, { hideShapeLabels: true });
    if (!rendered) throw new Error("Geometry snapshot failed");
    return {
      dataURL: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    holder.remove();
  }
}

function placeGeometryFrame(graph) {
  if (!geometryGraphHasContent(graph)) {
    setStatus("Add geometry first", "error");
    return;
  }

  try {
    traceGeometryScene("place:before");
    const normalizedGraph = window.KelpDiagramEditor.normalizeGraph(graph);
    const snapshot = createGeometrySnapshot(normalizedGraph);
    const sceneElements = getSceneElementsForMutation();
    const existing = sceneElements.find((element) => element.id === state.geometryElementId && !element.isDeleted);
    const fileId = generateId("geometry_file");
    const created = Date.now();
    const frameData = {
      version: 1,
      graph: normalizedGraph,
      updatedAt: new Date().toISOString()
    };

    state.api.addFiles?.({
      [fileId]: {
        id: fileId,
        mimeType: "image/png",
        dataURL: snapshot.dataURL,
        created,
        lastRetrieved: created
      }
    });

    let geometryElement = null;
    if (existing && isGeometryFrameElement(existing)) {
      geometryElement = bumpElement({
        ...existing,
        fileId,
        status: "saved",
        crop: null,
        customData: {
          ...(existing.customData || {}),
          [GEOMETRY_FRAME_KEY]: frameData
        }
      });
    } else {
      const center = sceneCenter();
      geometryElement = {
        id: generateId("geometry"),
        type: "image",
        x: center.x - GEOMETRY_FRAME_SIZE / 2,
        y: center.y - GEOMETRY_FRAME_SIZE / 2,
        width: GEOMETRY_FRAME_SIZE,
        height: GEOMETRY_FRAME_SIZE,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: randomInteger(),
        version: 1,
        versionNonce: randomInteger(),
        isDeleted: false,
        boundElements: null,
        updated: created,
        link: null,
        locked: false,
        status: "saved",
        fileId,
        scale: [1, 1],
        crop: null,
        customData: { [GEOMETRY_FRAME_KEY]: frameData }
      };
    }

    const nextElements = existing
      ? sceneElements.map((element) => element.id === existing.id ? geometryElement : element)
      : [...sceneElements, geometryElement];

    state.api.updateScene({
      elements: nextElements,
      appState: { selectedElementIds: { [geometryElement.id]: true } },
      captureUpdate: CAPTURE_IMMEDIATELY
    });
    traceGeometryScene(existing ? "place:update" : "place:create");
    window.setTimeout(() => traceGeometryScene(existing ? "place:update:settled" : "place:create:settled"), 0);

    state.geometryDirty = false;
    closeGeometryEditor();
    setTool("selection");
    setStatus(existing ? "Geometry updated" : "Geometry placed");
  } catch (error) {
    console.error("Geometry frame placement failed", error);
    setStatus("Could not place geometry", "error");
  }
}

function closeGeometryEditor() {
  if (geometryShell.classList.contains("is-hidden")) return true;

  if (document.fullscreenElement === geometryShell) {
    document.exitFullscreen?.().catch?.(() => {});
  }
  if (state.geometryExpanded) setGeometryExpanded(false);
  state.geometryEditor?.destroy?.();
  state.geometryEditor = null;
  state.geometryElementId = null;
  state.geometryDirty = false;
  state.geometryDrag = null;
  if (state.geometryLayoutFrame) window.cancelAnimationFrame(state.geometryLayoutFrame);
  state.geometryLayoutFrame = null;
  state.geometryLayoutReposition = false;
  geometryHost.innerHTML = "";
  geometryShell.classList.remove("is-dragging");
  geometryShell.classList.add("is-hidden");
  notifyClassroomGeometryEditorState(false);
  renderGeometryEditorState();
  state.api?.refresh?.();
  return true;
}

function notifyClassroomGeometryEditorState(open) {
  if (!isEmbedded) return;
  window.parent.postMessage({
    type: "kelp:whiteboard-geometry-editor-state",
    open: Boolean(open)
  }, window.location.origin);
}

function positionGeometryEditor() {
  const stageWidth = Math.max(1, stageEl.clientWidth);
  const stageHeight = Math.max(1, stageEl.clientHeight);
  const inset = stageWidth < 640 || stageHeight < 520 ? 8 : 24;
  const availableWidth = Math.max(1, stageWidth - inset * 2);
  const availableHeight = Math.max(1, stageHeight - inset * 2);
  const width = Math.min(1120, availableWidth, Math.max(560, Math.round(stageWidth * 0.9)));
  const height = Math.min(820, availableHeight, Math.max(480, Math.round(stageHeight * 0.88)));
  geometryShell.style.width = `${width}px`;
  geometryShell.style.height = `${height}px`;
  geometryShell.style.left = `${Math.max(inset, (stageWidth - width) / 2)}px`;
  geometryShell.style.top = `${Math.max(inset, (stageHeight - height) / 2)}px`;
}

function toggleGeometryExpanded() {
  setGeometryExpanded(!state.geometryExpanded);
}

function setGeometryExpanded(enabled) {
  const next = Boolean(enabled);
  if (next === state.geometryExpanded) return;
  if (next) {
    state.geometryRestoreRect = {
      left: geometryShell.style.left,
      top: geometryShell.style.top,
      width: geometryShell.style.width,
      height: geometryShell.style.height
    };
    geometryShell.classList.add("is-expanded");
  } else {
    geometryShell.classList.remove("is-expanded");
    if (state.geometryRestoreRect) {
      Object.assign(geometryShell.style, state.geometryRestoreRect);
    }
  }
  state.geometryExpanded = next;
  renderGeometryEditorState();
  requestGeometryEditorLayout();
}

async function toggleGeometryFullscreen() {
  try {
    if (document.fullscreenElement === geometryShell) {
      await document.exitFullscreen?.();
      return;
    }
    if (geometryShell.requestFullscreen) {
      await geometryShell.requestFullscreen();
      return;
    }
  } catch (error) {
    setGeometryExpanded(true);
    setStatus("Geometry editor expanded");
    return;
  }
  setGeometryExpanded(true);
}

function renderGeometryFullscreenState() {
  const fullscreen = document.fullscreenElement === geometryShell;
  toggleGeometryFullscreenButton.innerHTML = fullscreen
    ? '<i data-lucide="minimize" aria-hidden="true"></i>'
    : '<i data-lucide="maximize" aria-hidden="true"></i>';
  toggleGeometryFullscreenButton.setAttribute("aria-label", fullscreen ? "Exit geometry fullscreen" : "Open geometry editor fullscreen");
  toggleGeometryFullscreenButton.title = fullscreen ? "Exit geometry fullscreen" : "Open geometry editor fullscreen";
  renderLucideIcons();
  requestGeometryEditorLayout();
}

function renderGeometryEditorState() {
  const open = !geometryShell.classList.contains("is-hidden");
  const editButton = document.querySelector('[data-action="edit-geometry"]');
  editButton?.classList.toggle("active", open || Boolean(getSelectedGeometryElement()));
  updatePinnedToolStates();
  toggleGeometryExpandedButton.innerHTML = state.geometryExpanded
    ? '<i data-lucide="minimize-2" aria-hidden="true"></i>'
    : '<i data-lucide="maximize-2" aria-hidden="true"></i>';
  toggleGeometryExpandedButton.setAttribute("aria-pressed", String(state.geometryExpanded));
  toggleGeometryExpandedButton.setAttribute("aria-label", state.geometryExpanded ? "Restore geometry editor" : "Expand geometry editor");
  toggleGeometryExpandedButton.title = state.geometryExpanded ? "Restore geometry editor" : "Expand geometry editor";
  renderGeometryFullscreenState();
}

function beginGeometryDrag(event) {
  if (state.geometryExpanded || document.fullscreenElement === geometryShell) return;
  if (event.composedPath().some((node) => node instanceof HTMLButtonElement)) return;
  const shellRect = geometryShell.getBoundingClientRect();
  state.geometryDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - shellRect.left,
    offsetY: event.clientY - shellRect.top
  };
  geometryHeader.setPointerCapture?.(event.pointerId);
  geometryShell.classList.add("is-dragging");
  event.preventDefault();
}

function moveGeometryEditor(event) {
  if (!state.geometryDrag) return;
  const stageRect = stageEl.getBoundingClientRect();
  const shellRect = geometryShell.getBoundingClientRect();
  const maxLeft = Math.max(6, stageRect.width - shellRect.width - 6);
  const maxTop = Math.max(6, stageRect.height - shellRect.height - 6);
  geometryShell.style.left = `${clamp(event.clientX - stageRect.left - state.geometryDrag.offsetX, 6, maxLeft)}px`;
  geometryShell.style.top = `${clamp(event.clientY - stageRect.top - state.geometryDrag.offsetY, 6, maxTop)}px`;
}

function endGeometryDrag(event) {
  if (!state.geometryDrag) return;
  geometryHeader.releasePointerCapture?.(state.geometryDrag.pointerId || event.pointerId);
  geometryShell.classList.remove("is-dragging");
  state.geometryDrag = null;
}

function handleGeometryDoubleClick(event) {
  if (!geometryShell.classList.contains("is-hidden")) return;
  if (!getSelectedGeometryElement()) return;
  event.preventDefault();
  event.stopPropagation();
  openGeometryEditor();
}

async function insertImageFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("Choose an image", "error");
    return;
  }

  try {
    const dataURL = await readFileAsDataURL(file);
    const dimensions = await imageDimensions(dataURL);
    const fit = fitWithin(dimensions.width, dimensions.height, IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT);
    const center = sceneCenter();
    const fileId = generateId("file");
    const elementId = generateId("image");
    const created = Date.now();

    const imageElement = {
      id: elementId,
      type: "image",
      x: center.x - fit.width / 2,
      y: center.y - fit.height / 2,
      width: fit.width,
      height: fit.height,
      angle: 0,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: randomInteger(),
      version: 1,
      versionNonce: randomInteger(),
      isDeleted: false,
      boundElements: null,
      updated: created,
      link: null,
      locked: false,
      status: "saved",
      fileId,
      scale: [1, 1],
      crop: null,
      customData: {
        [GRID_LAYER_META_KEY]: {
          version: 1,
          placement: GRID_LAYER_BEHIND
        }
      }
    };

    state.api.addFiles?.({
      [fileId]: {
        id: fileId,
        mimeType: file.type || "image/png",
        dataURL,
        created,
        lastRetrieved: created
      }
    });

    state.api.updateScene({
      elements: [...getSceneElementsForMutation(), imageElement],
      appState: { selectedElementIds: { [elementId]: true } },
      captureUpdate: CAPTURE_IMMEDIATELY
    });

    setTool("selection");
    setStatus("Image inserted");
  } catch (error) {
    setStatus("Image failed", "error");
  }
}

function alignSelection(axis) {
  const selected = getSelectedElements();
  if (selected.length < 2) {
    setStatus("Select at least two", "error");
    return;
  }

  const group = commonBounds(selected);
  const targetCenterX = group.left + group.width / 2;
  const targetCenterY = group.top + group.height / 2;
  const updates = new Map();

  selected.forEach((element) => {
    const bounds = boundsForElement(element);
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const dx = axis === "vertical" ? targetCenterX - centerX : 0;
    const dy = axis === "horizontal" ? targetCenterY - centerY : 0;
    updates.set(element.id, { x: (element.x || 0) + dx, y: (element.y || 0) + dy });
  });

  applyElementPositionUpdates(updates);
  setStatus(axis === "vertical" ? "Aligned vertically" : "Aligned horizontally");
}

function distributeSelection(axis) {
  const selected = getSelectedElements();
  if (selected.length < 3) {
    setStatus("Select at least three", "error");
    return;
  }

  const items = selected
    .map((element) => ({ element, bounds: boundsForElement(element) }))
    .sort((a, b) =>
      axis === "horizontal"
        ? a.bounds.left - b.bounds.left
        : a.bounds.top - b.bounds.top
    );

  const start = axis === "horizontal" ? items[0].bounds.left : items[0].bounds.top;
  const endItem = items[items.length - 1];
  const end =
    axis === "horizontal"
      ? endItem.bounds.left + endItem.bounds.width
      : endItem.bounds.top + endItem.bounds.height;
  const totalSize = items.reduce(
    (sum, item) => sum + (axis === "horizontal" ? item.bounds.width : item.bounds.height),
    0
  );
  const gap = (end - start - totalSize) / (items.length - 1);
  let cursor = start;
  const updates = new Map();

  items.forEach((item) => {
    const targetStart = cursor;
    const currentStart = axis === "horizontal" ? item.bounds.left : item.bounds.top;
    const delta = targetStart - currentStart;

    updates.set(item.element.id, {
      x: (item.element.x || 0) + (axis === "horizontal" ? delta : 0),
      y: (item.element.y || 0) + (axis === "vertical" ? delta : 0)
    });

    cursor += (axis === "horizontal" ? item.bounds.width : item.bounds.height) + gap;
  });

  applyElementPositionUpdates(updates);
  setStatus(axis === "horizontal" ? "Distributed horizontally" : "Distributed vertically");
}

function applyElementPositionUpdates(updates) {
  const selectedIds = state.api.getAppState?.().selectedElementIds || {};
  const nextElements = getSceneElementsForMutation().map((element) => {
    if (!updates.has(element.id)) return element;
    return bumpElement({ ...element, ...updates.get(element.id) });
  });

  state.api.updateScene({
    elements: nextElements,
    appState: { selectedElementIds: selectedIds },
    captureUpdate: CAPTURE_IMMEDIATELY
  });
}

function clientToScene(clientX, clientY) {
  const appState = state.api.getAppState?.() || {};

  if (ExcalidrawLib.viewportCoordsToSceneCoords) {
    return ExcalidrawLib.viewportCoordsToSceneCoords({ clientX, clientY }, appState);
  }

  const zoom = appState.zoom?.value || 1;
  return {
    x: (clientX - (appState.offsetLeft || 0)) / zoom - (appState.scrollX || 0),
    y: (clientY - (appState.offsetTop || 0)) / zoom - (appState.scrollY || 0)
  };
}

function sceneCenter() {
  const rect = stageEl.getBoundingClientRect();
  return clientToScene(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function boundsForElement(element) {
  try {
    if (ExcalidrawLib.getCommonBounds) {
      const [left, top, right, bottom] = ExcalidrawLib.getCommonBounds([element]);
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top
      };
    }
  } catch (error) {}

  const x = element.x || 0;
  const y = element.y || 0;
  const width = element.width || 0;
  const height = element.height || 0;
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  const right = Math.max(x, x + width);
  const bottom = Math.max(y, y + height);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function commonBounds(elements) {
  const bounds = elements.map(boundsForElement);
  const left = Math.min(...bounds.map((item) => item.left));
  const top = Math.min(...bounds.map((item) => item.top));
  const right = Math.max(...bounds.map((item) => item.right));
  const bottom = Math.max(...bounds.map((item) => item.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function bumpElement(element) {
  return {
    ...element,
    version: (element.version || 0) + 1,
    versionNonce: randomInteger(),
    updated: Date.now()
  };
}

function randomInteger() {
  return Math.floor(Math.random() * 2147483647);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function generateId(prefix = "id") {
  const random = window.crypto?.randomUUID
    ? window.crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random}`;
}

function deepClone(value) {
  if (window.structuredClone) {
    return window.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(dataURL) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    });
    image.addEventListener("error", reject);
    image.src = dataURL;
  });
}

function fitWithin(width, height, maxWidth, maxHeight) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}
