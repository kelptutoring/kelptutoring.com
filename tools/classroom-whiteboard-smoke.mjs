import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserTimeout = Number(process.env.KELP_SMOKE_TIMEOUT || 30_000);
const viewport = { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false };
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

let staticServer = null;
let chromeProcess = null;
let browserClient = null;
let debugPort = null;
let profileDirectory = null;
const openPages = new Set();

async function main() {
try {
  const origin = await startStaticServer();
  await startChrome();

  await runCase("standalone whiteboard layout and controls", async () => {
    const room = `smoke-standalone-${Date.now()}`;
    const page = await openPage("standalone-whiteboard", {
      initScript: clearWhiteboardStorageScript(room, true),
      url: `${origin}/src/app/whiteboard/whiteboard.html?room=${encodeURIComponent(room)}`
    });

    await page.waitFor("Boolean(window.kelpWhiteboardApi)", "standalone whiteboard API");
    await page.sleep(650);
    await page.waitFor('document.body.dataset.nativeControlsPlacement === "corner"', "wide native footer state");

    const whiteboardAdapters = await page.evaluate(`({
      provider: window.kelpWhiteboardAdapters?.meta?.provider,
      contractVersion: window.kelpWhiteboardAdapters?.meta?.contractVersion,
      collaboration: ["connect", "publishScene", "subscribe", "disconnect"]
        .every((method) => typeof window.kelpWhiteboardAdapters?.collaboration?.[method] === "function"),
      persistence: ["load", "save", "clear"]
        .every((method) => typeof window.kelpWhiteboardAdapters?.whiteboards?.[method] === "function"),
      files: typeof window.kelpWhiteboardAdapters?.files?.save === "function"
    })`);
    assertEqual(whiteboardAdapters, {
      provider: "local",
      contractVersion: 1,
      collaboration: true,
      persistence: true,
      files: true
    }, "Whiteboard backend adapter surface is incomplete");

    const deferredDependencies = await page.evaluate(`({
      math: Boolean(window.math),
      editor: Boolean(window.KelpDiagramEditor),
      editorScript: Boolean(document.getElementById("kelp-geometry-editor-script")),
      editorStyles: Boolean(document.getElementById("kelp-geometry-editor-styles")),
      pdfRequested: performance.getEntriesByType("resource").some((entry) => entry.name.includes("jspdf"))
    })`);
    assertEqual(deferredDependencies, {
      math: false,
      editor: false,
      editorScript: false,
      editorStyles: false,
      pdfRequested: false
    }, "Heavy whiteboard dependencies loaded before use");

    await page.click('[data-tool-group="geometry"] [data-tool-group-toggle]');
    await page.click('[data-geometry-tool="point"]');
    await page.waitFor(`Boolean(window.math?.parse)
      && Boolean(window.KelpDiagramEditor)
      && !document.getElementById("geometry-editor-shell").classList.contains("is-hidden")`, "lazy geometry editor");
    const loadedGeometryResources = await page.evaluate(`({
      script: Boolean(document.getElementById("kelp-geometry-editor-script")),
      styles: Boolean(document.getElementById("kelp-geometry-editor-styles")?.sheet),
      tool: document.getElementById("geometry-editor-host").__kelpDiagramEditor?.tool || ""
    })`);
    assert(loadedGeometryResources.script && loadedGeometryResources.styles, "Geometry resources did not load on demand");
    await page.click("[data-kelp-modal-cancel]");
    const geometryDefaults = await page.evaluate(`(() => {
      const editor = document.getElementById("geometry-editor-host").__kelpDiagramEditor;
      const graph = editor.getGraph();
      const shell = document.getElementById("geometry-editor-shell").getBoundingClientRect();
      const stage = document.querySelector(".whiteboard-stage").getBoundingClientRect();
      const canvas = document.querySelector("#geometry-editor-host .kde-canvas").getBoundingClientRect();
      const host = document.getElementById("geometry-editor-host");
      const layout = host.querySelector(".kde-layout");
      const rail = host.querySelector(".kde-side-tool-rail");
      const settings = host.querySelector(".kde-settings");
      const stageWrap = host.querySelector(".kde-stage-wrap");
      const viewport = host.closest(".geometry-editor-scroll");
      const uniformHeights = (selector) => {
        const heights = Array.from(host.querySelectorAll(selector), (element) => Math.round(element.getBoundingClientRect().height));
        return heights.length > 0 && new Set(heights).size === 1 && heights[0] >= 38;
      };
      return {
        displayMode: graph.displayMode,
        gridLayer: graph.gridLayer,
        autoFit: graph.autoFit,
        snapToGrid: graph.snapToGrid,
        stickChecked: host.querySelector('[data-kelp-field="snapToGrid"]')?.checked,
        autoFitChecked: host.querySelector('[data-kelp-field="autoFit"]')?.checked,
        behindActive: document.querySelector('[data-kelp-grid-layer="behind"]')?.classList.contains("is-active"),
        sideLayout: host.classList.contains("kde-side-tool-layout"),
        railPresent: Boolean(rail),
        toolbarInRail: rail?.contains(host.querySelector(".kde-toolbar")) || false,
        actionsInRail: rail?.contains(host.querySelector(".kde-stage-actions")) || false,
        diagramLabelRemoved: !host.querySelector('[data-kelp-field="title"]'),
        objectsRemoved: !host.querySelector(".kde-object-panel"),
        uniformToolRows: uniformHeights(".kde-toolbar .kde-tool"),
        uniformActionRows: uniformHeights(".kde-stage-actions .kde-tool, .kde-stage-actions .kde-action"),
        railFits: rail.scrollHeight <= rail.clientHeight + 1,
        settingsFit: settings.scrollHeight <= settings.clientHeight + 1,
        viewportFits: viewport.scrollHeight <= viewport.clientHeight + 1,
        columnHeightsAligned: Math.max(
          settings.getBoundingClientRect().height,
          rail.getBoundingClientRect().height,
          stageWrap.getBoundingClientRect().height
        ) - Math.min(
          settings.getBoundingClientRect().height,
          rail.getBoundingClientRect().height,
          stageWrap.getBoundingClientRect().height
        ) <= 1,
        layoutColumns: getComputedStyle(layout).gridTemplateColumns.trim().split(/\\s+/).filter(Boolean).length,
        centeredX: Math.abs((shell.left + shell.right) / 2 - (stage.left + stage.right) / 2) < 2,
        centeredY: Math.abs((shell.top + shell.bottom) / 2 - (stage.top + stage.bottom) / 2) < 2,
        shellInsideStage: shell.left >= stage.left && shell.top >= stage.top && shell.right <= stage.right && shell.bottom <= stage.bottom,
        canvasSize: Math.round(canvas.width)
      };
    })()`);
    assertEqual(geometryDefaults, {
      displayMode: "coordinate",
      gridLayer: "behind",
      autoFit: false,
      snapToGrid: false,
      stickChecked: false,
      autoFitChecked: false,
      behindActive: true,
      sideLayout: true,
      railPresent: true,
      toolbarInRail: true,
      actionsInRail: true,
      diagramLabelRemoved: true,
      objectsRemoved: true,
      uniformToolRows: true,
      uniformActionRows: true,
      railFits: true,
      settingsFit: true,
      viewportFits: true,
      columnHeightsAligned: true,
      layoutColumns: 3,
      centeredX: true,
      centeredY: true,
      shellInsideStage: true,
      canvasSize: geometryDefaults.canvasSize
    }, "Geometry editor defaults or responsive placement changed unexpectedly");
    assert(geometryDefaults.canvasSize >= 180 && geometryDefaults.canvasSize <= 900, "Geometry canvas did not fit its viewport");
    await page.click('[data-kelp-tool="select"]');
    const wheelBehavior = await page.evaluate(`(() => {
      const editor = document.getElementById("geometry-editor-host").__kelpDiagramEditor;
      const canvas = editor.canvas;
      const rect = canvas.getBoundingClientRect();
      const wheel = (ctrlKey) => new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        ctrlKey,
        deltaY: 120
      });
      const bounds = () => {
        const graph = editor.getGraph();
        return [graph.xMin, graph.xMax, graph.yMin, graph.yMax].join(",");
      };
      editor.graph.viewControls = true;
      editor.syncControls();
      const before = bounds();
      const plain = wheel(false);
      canvas.dispatchEvent(plain);
      const afterPlain = bounds();
      const modified = wheel(true);
      canvas.dispatchEvent(modified);
      const afterModified = bounds();
      editor.graph.viewControls = false;
      editor.syncControls();
      return {
        plainPrevented: plain.defaultPrevented,
        plainUnchanged: before === afterPlain,
        modifiedPrevented: modified.defaultPrevented,
        modifiedZoomed: afterModified !== afterPlain
      };
    })()`);
    assertEqual(wheelBehavior, {
      plainPrevented: false,
      plainUnchanged: true,
      modifiedPrevented: true,
      modifiedZoomed: true
    }, "Geometry canvas wheel handling did not preserve normal scrolling or modifier zoom");
    await page.drag("#geometry-editor-host .kde-canvas", { deltaX: 0, deltaY: 0 });
    const pointerFocus = await page.evaluate(`(() => {
      const host = document.getElementById("geometry-editor-host");
      const styles = getComputedStyle(host);
      return {
        hostFocused: document.activeElement === host,
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth
      };
    })()`);
    assert(pointerFocus.hostFocused, "Diagram selector did not retain keyboard focus");
    assert(pointerFocus.outlineStyle === "none" || pointerFocus.outlineWidth === "0px", "Pointer focus still drew an editor perimeter");
    await page.click('[data-kelp-grid-layer="front"]');
    await page.waitFor('document.getElementById("geometry-editor-host").__kelpDiagramEditor.getGraph().gridLayer === "front"', "geometry grid front setting");
    await page.click('[data-kelp-grid-layer="behind"]');
    await page.waitFor('document.getElementById("geometry-editor-host").__kelpDiagramEditor.getGraph().gridLayer === "behind"', "geometry grid behind setting");
    await page.click("#close-geometry-editor");
    await page.waitFor('document.getElementById("geometry-editor-shell").classList.contains("is-hidden")', "geometry editor close");

    const layout = await page.evaluate(`(() => {
      const rectFor = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const buttonRects = Array.from(document.querySelectorAll(".App-menu_bottom button"))
        .map((button) => {
          const styles = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return styles.display !== "none" && styles.visibility !== "hidden" && rect.width && rect.height
            ? rect
            : null;
        })
        .filter(Boolean);
      const native = buttonRects.length ? {
        left: Math.min(...buttonRects.map((rect) => rect.left)),
        top: Math.min(...buttonRects.map((rect) => rect.top)),
        right: Math.max(...buttonRects.map((rect) => rect.right)),
        bottom: Math.max(...buttonRects.map((rect) => rect.bottom))
      } : null;
      if (native) {
        native.width = native.right - native.left;
        native.height = native.bottom - native.top;
      }
      return {
        bodyClasses: document.body.className,
        viewport: { width: innerWidth, height: innerHeight },
        rail: rectFor(".whiteboard-toolbar"),
        dock: rectFor(".standalone-whiteboard-dock"),
        native
      };
    })()`);

    assert(layout.bodyClasses.includes("is-standalone"), "Standalone board did not enter standalone mode");
    assert(layout.rail && layout.dock && layout.native, "Standalone footer or toolbar did not render");
    assertClose(centerY(layout.rail), layout.viewport.height / 2, 1.5, "Left toolbar is not vertically centered");
    assertClose(centerX(layout.dock), layout.viewport.width / 2, 1.5, "Standalone dock is not independently centered");
    assert(layout.bodyClasses.includes("is-native-controls-corner"), "Wide native footer did not use the bottom-right state");
    assert(layout.viewport.width - layout.native.right <= 20, "Wide native footer is not anchored to the bottom-right corner");
    assertClose(centerY(layout.native), centerY(layout.dock), 1.5, "Native footer and standalone dock are not vertically aligned");
    assert(layout.dock.right + 8 <= layout.native.left, "Desktop footer controls overlap");

    await page.evaluate(`(() => {
      const api = window.kelpWhiteboardApi;
      const id = "phase4-smoke-rectangle";
      const timestamp = Date.now();
      window.__phase4SmokeElementId = id;
      api.updateScene({
        elements: [...api.getSceneElements(), {
          id,
          type: "rectangle",
          x: 120,
          y: 120,
          width: 180,
          height: 110,
          angle: 0,
          strokeColor: "#1f2933",
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 2,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: { type: 3 },
          seed: 104729,
          version: 1,
          versionNonce: 130363,
          isDeleted: false,
          boundElements: null,
          updated: timestamp,
          link: null,
          locked: false
        }]
      });
    })()`);
    await page.waitFor("window.__kelpSceneWrites.length >= 1", "content autosave");
    await page.sleep(1000);
    await page.evaluate(`(() => {
      window.__kelpSceneWrites.length = 0;
      const api = window.kelpWhiteboardApi;
      const id = window.__phase4SmokeElementId;
      api.setActiveTool({ type: "hand" });
      api.setActiveTool({ type: "selection" });
      api.updateScene({
        appState: {
          selectedElementIds: { [id]: true },
          scrollX: 48,
          scrollY: -32,
          zoom: { value: 1.2 }
        }
      });
    })()`);
    await page.sleep(1200);
    assert(await page.evaluate("window.__kelpSceneWrites.length === 0"), "View-only whiteboard changes triggered autosave");

    await page.evaluate(`(() => {
      const api = window.kelpWhiteboardApi;
      const id = window.__phase4SmokeElementId;
      api.updateScene({
        elements: api.getSceneElements().map((element) => element.id === id ? {
          ...element,
          x: element.x + 24,
          version: (element.version || 0) + 1,
          versionNonce: (element.versionNonce || 0) + 1,
          updated: Date.now()
        } : element)
      });
    })()`);
    await page.waitFor("window.__kelpSceneWrites.length >= 1", "mutated-content autosave");

    assert(!await page.evaluate('performance.getEntriesByType("resource").some((entry) => entry.name.includes("jspdf"))'), "jsPDF loaded before PDF export");
    await page.click('[data-export="pdf"]');
    await page.waitFor('document.getElementById("whiteboard-status").textContent === "PDF exported"', "lazy PDF export");
    assert(await page.evaluate('performance.getEntriesByType("resource").some((entry) => entry.name.includes("jspdf"))'), "PDF export did not load jsPDF on demand");

    await page.evaluate(`window.kelpWhiteboardApi.updateScene({
      appState: {
        selectedElementIds: {},
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 }
      }
    })`);

    await page.click('[data-tool-group="grid"] [data-tool-group-toggle]');
    await page.click('[data-action="toggle-grid-horizontal"]');
    const gridSteps = [];
    for (const action of ["set-grid-compact", "set-grid-standard", "set-grid-spacious"]) {
      await page.click(`[data-action="${action}"]`);
      gridSteps.push(await page.evaluate(`document.getElementById("whiteboard-grid-overlay").style.getPropertyValue("--kelp-grid-step")`));
    }
    assertEqual(gridSteps, ["32px", "64px", "128px"], "Standalone grid presets changed unexpectedly");

    await page.evaluate(`(() => {
      const api = window.kelpWhiteboardApi;
      const id = "grid-layer-smoke-image";
      const fileId = "grid-layer-smoke-file";
      const timestamp = Date.now();
      api.addFiles({
        [fileId]: {
          id: fileId,
          mimeType: "image/png",
          dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8WQAAAABJRU5ErkJggg==",
          created: timestamp,
          lastRetrieved: timestamp
        }
      });
      api.updateScene({
        elements: [...api.getSceneElements(), {
          id,
          type: "image",
          x: 340,
          y: 180,
          width: 180,
          height: 120,
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
          seed: 32452843,
          version: 1,
          versionNonce: 49979687,
          isDeleted: false,
          boundElements: null,
          updated: timestamp,
          link: null,
          locked: false,
          status: "saved",
          fileId,
          scale: [1, 1],
          crop: null
        }],
        appState: { selectedElementIds: { [id]: true } }
      });
    })()`);
    await page.waitFor('document.getElementById("image-grid-layer-control").isConnected && !document.getElementById("image-grid-layer-control").hidden', "image grid layer control");
    assert(await page.evaluate('document.querySelector("[data-image-grid-layer=behind]").classList.contains("active")'), "Legacy image did not default above the grid");
    await page.click('[data-image-grid-layer="front"]');
    await page.waitFor('window.kelpWhiteboardApi.getSceneElements().find((element) => element.id === "grid-layer-smoke-image")?.customData?.kelpGridLayer?.placement === "front"', "image grid layer metadata");
    await page.click('[data-image-grid-layer="behind"]');
    await page.waitFor('document.getElementById("whiteboard-grid-overlay").dataset.maskedElements === "1"', "image grid overlay mask");

    await page.evaluate(`(() => {
      const api = window.kelpWhiteboardApi;
      const id = "grid-layer-smoke-frame";
      const timestamp = Date.now();
      api.updateScene({
        elements: [...api.getSceneElements(), {
          id,
          type: "frame",
          name: "Grid layer smoke frame",
          x: 580,
          y: 160,
          width: 220,
          height: 160,
          angle: 0,
          strokeColor: "#1b1b1f",
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: 67867967,
          version: 1,
          versionNonce: 86028121,
          isDeleted: false,
          boundElements: null,
          updated: timestamp,
          link: null,
          locked: false
        }],
        appState: { selectedElementIds: { [id]: true } }
      });
    })()`);
    await page.waitFor('document.getElementById("frame-background-control").isConnected && !document.getElementById("frame-background-control").hidden', "frame grid layer control");
    assert(await page.evaluate('document.querySelector("[data-frame-grid-layer=behind]").classList.contains("active")'), "Legacy frame did not default above the grid");
    await page.click('[data-frame-grid-layer="front"]');
    await page.waitFor('window.kelpWhiteboardApi.getSceneElements().find((element) => element.id === "grid-layer-smoke-frame")?.customData?.kelpGridLayer?.placement === "front"', "frame grid layer metadata");
    await page.waitFor('document.getElementById("whiteboard-grid-overlay").dataset.maskedElements === "1"', "frame grid front mask");
    await page.click('[data-frame-grid-layer="behind"]');
    await page.waitFor('document.getElementById("whiteboard-grid-overlay").dataset.maskedElements === "2"', "frame grid behind mask");

    const shortcutKeys = await page.evaluate(`Array.from(document.querySelectorAll("#standalone-whiteboard-dock [aria-keyshortcuts]"), (element) => element.getAttribute("aria-keyshortcuts"))`);
    assertEqual(shortcutKeys, ["Alt+1", "Alt+2", "Alt+3", "Alt+4"], "Standalone shortcut hints changed unexpectedly");

    await page.evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", code: "Digit2", altKey: true, bubbles: true, cancelable: true }))');
    await page.waitFor('document.body.classList.contains("is-focus-mode")', "standalone focus mode");
    await page.evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", code: "Digit2", altKey: true, bubbles: true, cancelable: true }))');
    await page.waitFor('!document.body.classList.contains("is-focus-mode")', "standalone focus exit");
    await page.evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "3", code: "Digit3", altKey: true, bubbles: true, cancelable: true }))');
    await page.waitFor('document.getElementById("whiteboard-status").textContent === "Returned to content"', "standalone center shortcut");
    await page.evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "4", code: "Digit4", altKey: true, bubbles: true, cancelable: true }))');
    await page.waitFor('document.getElementById("whiteboard-status").textContent === "Content fitted to view"', "standalone fit shortcut");

    await page.setViewport({ width: 900, height: 720, deviceScaleFactor: 1, mobile: false });
    await page.waitFor('document.body.dataset.nativeControlsPlacement === "stacked"', "average native footer state");
    const compactLayout = await page.evaluate(`(() => {
      const dockRect = document.querySelector(".standalone-whiteboard-dock").getBoundingClientRect();
      const nativeRects = Array.from(document.querySelectorAll(".App-menu_bottom button"))
        .map((button) => {
          const styles = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return styles.display !== "none" && styles.visibility !== "hidden" && rect.width && rect.height ? rect : null;
        })
        .filter(Boolean);
      const native = nativeRects.length ? {
        left: Math.min(...nativeRects.map((rect) => rect.left)),
        top: Math.min(...nativeRects.map((rect) => rect.top)),
        right: Math.max(...nativeRects.map((rect) => rect.right)),
        bottom: Math.max(...nativeRects.map((rect) => rect.bottom))
      } : null;
      return {
        placement: document.body.dataset.nativeControlsPlacement,
        dock: { left: dockRect.left, top: dockRect.top, right: dockRect.right, bottom: dockRect.bottom },
        native,
        viewportWidth: innerWidth
      };
    })()`);
    assertClose((compactLayout.dock.left + compactLayout.dock.right) / 2, compactLayout.viewportWidth / 2, 1.5, "Compact dock is not centered");
    assert(compactLayout.placement === "stacked", `Average footer placement was ${compactLayout.placement || "missing"}`);
    assert(compactLayout.native?.bottom + 8 <= compactLayout.dock.top, "Average footer controls were not stacked above the dock");
    assert(!compactLayout.native || !rectanglesOverlap(compactLayout.native, compactLayout.dock), "Compact footer controls overlap");

    await page.setViewport({ width: 682, height: 384, deviceScaleFactor: 1, mobile: false });
    await page.waitFor('document.body.dataset.nativeControlsPlacement === "hidden"', "high-zoom native footer state");
    const constrainedLayout = await page.evaluate(`(() => {
      const compactToolbar = document.querySelector(".App-bottom-bar");
      const visibleNativeButtons = Array.from(document.querySelectorAll(".App-menu_bottom button"))
        .filter((button) => {
          const styles = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return styles.display !== "none" && styles.visibility !== "hidden" && rect.width && rect.height;
        }).length;
      const wideWhiteIslands = Array.from(document.querySelectorAll(".Island"))
        .filter((island) => {
          const styles = getComputedStyle(island);
          const rect = island.getBoundingClientRect();
          return styles.display !== "none"
            && styles.visibility !== "hidden"
            && rect.width > innerWidth * 0.7
            && styles.backgroundColor === "rgb(255, 255, 255)";
        }).length;
      return {
        placement: document.body.dataset.nativeControlsPlacement,
        compactToolbarVisibility: compactToolbar ? getComputedStyle(compactToolbar).visibility : "missing",
        visibleNativeButtons,
        wideWhiteIslands
      };
    })()`);
    assertEqual(constrainedLayout, {
      placement: "hidden",
      compactToolbarVisibility: "hidden",
      visibleNativeButtons: 0,
      wideWhiteIslands: 0
    }, "High-zoom whiteboard controls did not collapse cleanly");
    await page.setViewport(viewport);
    await page.waitFor('document.body.dataset.nativeControlsPlacement === "corner"', "native footer restored after zoom out");
  });

  await runCase("embedded whiteboard mode and grid", async () => {
    const room = `smoke-embedded-${Date.now()}`;
    const page = await openPage("embedded-whiteboard", {
      initScript: clearWhiteboardStorageScript(room),
      url: `${origin}/src/app/whiteboard/whiteboard.html?embed=1&room=${encodeURIComponent(room)}`
    });

    await page.waitFor("Boolean(window.kelpWhiteboardApi)", "embedded whiteboard API");
    const mode = await page.evaluate(`({
      embedded: document.body.classList.contains("is-embedded"),
      standalone: document.body.classList.contains("is-standalone"),
      dockHidden: document.getElementById("standalone-whiteboard-dock").hidden
    })`);
    assert(mode.embedded && !mode.standalone && mode.dockHidden, "Embedded whiteboard mode is inconsistent");

    await page.click('[data-tool-group="grid"] [data-tool-group-toggle]');
    await page.click('[data-action="toggle-grid-vertical"]');
    await page.click('[data-action="set-grid-spacious"]');
    const gridStep = await page.evaluate(`document.getElementById("whiteboard-grid-overlay").style.getPropertyValue("--kelp-grid-step")`);
    assert(gridStep === "128px", `Embedded grid preset was ${gridStep || "missing"}`);

    await page.evaluate(`window.postMessage({
      type: "kelp:whiteboard-dock-state",
      open: true,
      bottomInset: 94,
      footerBottomInset: 124,
      rightInset: 40,
      nativeControlsBottomInset: 18
    }, window.location.origin)`);
    await page.waitFor('document.body.dataset.nativeControlsPlacement === "stacked"', "embedded stacked footer state");
    await page.setViewport({ width: 682, height: 384, deviceScaleFactor: 1, mobile: false });
    await page.waitFor('document.body.dataset.nativeControlsPlacement === "hidden"', "embedded high-zoom footer state");
    assert(await page.evaluate(`(() => {
      const toolbar = document.querySelector(".App-bottom-bar");
      return !toolbar || getComputedStyle(toolbar).visibility === "hidden";
    })()`), "Embedded compact toolbar remained visible at high zoom");
    await page.setViewport(viewport);
    await page.waitFor('document.body.dataset.nativeControlsPlacement === "stacked"', "embedded footer restored after zoom out");
  });

  await runCase("whiteboard backend adapter injection", async () => {
    const room = `smoke-adapter-${Date.now()}`;
    const page = await openPage("whiteboard-adapter", {
      initScript: `${clearWhiteboardStorageScript(room)}\n${whiteboardBackendProbeScript()}`,
      url: `${origin}/src/app/whiteboard/whiteboard.html?room=${encodeURIComponent(room)}`
    });
    await page.waitFor("Boolean(window.kelpWhiteboardApi && window.__kelpAdapterProbe?.subscriber)", "whiteboard adapter connection");
    assertEqual(await page.evaluate(`({
      provider: window.kelpWhiteboardAdapters.meta.provider,
      connected: window.__kelpAdapterProbe.connected
    })`), { provider: "smoke-backend", connected: 1 }, "Injected whiteboard adapter did not connect");
    await page.sleep(1100);
    await page.evaluate(`(() => {
      window.__kelpAdapterProbe.published.length = 0;
      window.__kelpAdapterProbe.boardSaves = 0;
      window.__kelpAdapterProbe.fileSaves = 0;
    })()`);

    await page.evaluate(`(() => {
      const timestamp = Date.now();
      window.__kelpAdapterProbe.subscriber({
        clientId: "remote-participant",
        revision: "remote-scene-1",
        scene: {
          type: "excalidraw",
          version: 2,
          source: "smoke-backend",
          roomId: ${JSON.stringify(room)},
          savedAt: new Date(timestamp).toISOString(),
          elements: [{
            id: "remote-adapter-rectangle",
            type: "rectangle",
            x: 80,
            y: 90,
            width: 160,
            height: 100,
            angle: 0,
            strokeColor: "#1f2933",
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 2,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: { type: 3 },
            seed: 17389,
            version: 1,
            versionNonce: 7919,
            isDeleted: false,
            boundElements: null,
            updated: timestamp,
            link: null,
            locked: false
          }],
          appState: { viewBackgroundColor: "#ffffff", theme: "light" },
          files: {},
          kelpGrid: null
        }
      });
    })()`);
    await page.waitFor('window.kelpWhiteboardApi.getSceneElements().some((element) => element.id === "remote-adapter-rectangle")', "remote whiteboard scene");
    await page.sleep(1100);
    assert(await page.evaluate("window.__kelpAdapterProbe.published.length === 0"), "Remote whiteboard scene echoed back to the adapter");

    await page.evaluate(`(() => {
      const api = window.kelpWhiteboardApi;
      api.updateScene({
        elements: api.getSceneElements().map((element) => element.id === "remote-adapter-rectangle" ? {
          ...element,
          x: element.x + 32,
          version: element.version + 1,
          versionNonce: element.versionNonce + 1,
          updated: Date.now()
        } : element)
      });
    })()`);
    await page.waitFor("window.__kelpAdapterProbe.published.length === 1", "local collaboration publish");
    const adapterWrites = await page.evaluate(`({
      boardSaves: window.__kelpAdapterProbe.boardSaves,
      fileSaves: window.__kelpAdapterProbe.fileSaves,
      publishedIds: window.__kelpAdapterProbe.published[0]?.elementIds || []
    })`);
    assert(adapterWrites.boardSaves >= 1 && adapterWrites.fileSaves >= 1, "Injected persistence adapters were bypassed");
    assert(adapterWrites.publishedIds.includes("remote-adapter-rectangle"), "Published scene omitted the locally edited element");
  });

  await runCase("geometry editor lifecycle", async () => {
    const page = await openPage("geometry-lifecycle", {
      url: `${origin}/src/app/whiteboard/tools/geometry-lifecycle-self-test.html`
    });
    await page.waitFor('document.documentElement.dataset.testResult === "pass"', "geometry lifecycle self-test");
  });

  await runCase("classroom admission, menus, shared board, and review", async () => {
    const room = `smoke-classroom-${Date.now()}`;
    const classroomKey = `kelp:classroom:v1:${room}`;
    const tutor = await openPage("classroom-tutor", {
      initScript: `${fakeJitsiScript()}\nif (window.top === window) localStorage.removeItem(${JSON.stringify(classroomKey)});`,
      url: `${origin}/src/app/classroom/classroom.html?room=${encodeURIComponent(room)}&role=tutor`
    });

    await tutor.waitFor('document.readyState === "complete"', "tutor prejoin screen");
    const classroomAdapters = await tutor.evaluate(`({
      provider: window.kelpClassroomAdapters?.meta?.provider,
      contractVersion: window.kelpClassroomAdapters?.meta?.contractVersion,
      roomSession: ["load", "save", "subscribe"]
        .every((method) => typeof window.kelpClassroomAdapters?.roomSession?.[method] === "function"),
      presence: typeof window.kelpClassroomAdapters?.participantPresence?.publish === "function",
      chat: typeof window.kelpClassroomAdapters?.chat?.send === "function",
      timers: typeof window.kelpClassroomAdapters?.timers?.save === "function",
      events: typeof window.kelpClassroomAdapters?.sessionEvents?.append === "function"
    })`);
    assertEqual(classroomAdapters, {
      provider: "local",
      contractVersion: 1,
      roomSession: true,
      presence: true,
      chat: true,
      timers: true,
      events: true
    }, "Classroom backend adapter surface is incomplete");
    await tutor.waitFor(`[
      "prejoin-audio-input-select",
      "prejoin-audio-output-select",
      "prejoin-video-input-select"
    ].every((id) => document.getElementById(id)?.options.length >= 2)`, "prejoin device choices");
    const prejoin = await tutor.evaluate(`({
      visible: !document.getElementById("prejoin-screen").classList.contains("is-hidden"),
      joinButtons: document.querySelectorAll("#join-room").length,
      dashboardHref: document.getElementById("back-to-dashboard")?.getAttribute("href"),
      detailLabels: Array.from(document.querySelectorAll(".lesson-detail-list dt"), (item) => item.textContent.trim()),
      detailColumnCount: getComputedStyle(document.querySelector(".lesson-detail-list"))
        .gridTemplateColumns.trim().split(/\\s+/).filter(Boolean).length,
      detailHeading: document.querySelector(".lesson-confirmation-heading").textContent.trim(),
      identityCards: document.querySelectorAll(".session-identity-panel, .identity-card").length,
      duration: document.getElementById("prejoin-lesson-duration").textContent.trim(),
      lesson: document.getElementById("prejoin-lesson-progress").textContent.trim(),
      deviceOptionCounts: [
        document.getElementById("prejoin-audio-input-select").options.length,
        document.getElementById("prejoin-audio-output-select").options.length,
        document.getElementById("prejoin-video-input-select").options.length
      ]
    })`);
    assert(prejoin.visible && prejoin.joinButtons === 1, "Tutor prejoin screen is incomplete");
    assert(prejoin.dashboardHref === "../dashboard/tutor-dashboard.html", "Tutor dashboard return link is incorrect");
    assertEqual(
      prejoin.detailLabels,
      ["Tutor", "Subject", "Duration", "Attendees", "Cycle", "Lesson"],
      "Waiting-room lesson details changed unexpectedly"
    );
    assert(prejoin.identityCards === 0, "Legacy waiting-room identity cards are still visible");
    assert(prejoin.detailColumnCount === 1, "Waiting-room lesson details are not arranged in one column");
    assert(prejoin.detailHeading === "Lesson details", "Waiting-room lesson heading still contains confirmation copy");
    assert(prejoin.duration === "1 hour" && prejoin.lesson === "3 / 12", "Waiting-room lesson values are incomplete");
    assert(prejoin.deviceOptionCounts.every((count) => count >= 2), "Prejoin device selectors were not populated");

    await tutor.setViewport({ width: 682, height: 520, deviceScaleFactor: 1, mobile: false });
    await tutor.sleep(300);
    const zoomedPrejoin = await tutor.evaluate(`(() => {
      const screen = document.getElementById("prejoin-screen");
      const controls = Array.from(document.querySelectorAll(
        ".prejoin-device-settings select, .device-controls button, #back-to-dashboard, #join-room"
      )).map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.id, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      const overlaps = [];
      for (let index = 0; index < controls.length; index += 1) {
        for (let compare = index + 1; compare < controls.length; compare += 1) {
          const first = controls[index];
          const second = controls[compare];
          if (first.left < second.right && first.right > second.left
            && first.top < second.bottom && first.bottom > second.top) {
            overlaps.push([first.id, second.id]);
          }
        }
      }
      return {
        overflowY: getComputedStyle(screen).overflowY,
        scrollable: screen.scrollHeight > screen.clientHeight,
        overlaps,
        detailColumnCount: getComputedStyle(document.querySelector(".lesson-detail-list"))
          .gridTemplateColumns.trim().split(/\\s+/).filter(Boolean).length
      };
    })()`);
    assertEqual(zoomedPrejoin, {
      overflowY: "auto",
      scrollable: true,
      overlaps: [],
      detailColumnCount: 1
    }, "Zoomed waiting room is not readable and scrollable");
    await tutor.setViewport(viewport);

    await tutor.evaluate(`window.__addKelpSmokeDevice({
      kind: "videoinput",
      deviceId: "smoke-camera-document",
      label: "Document camera"
    })`);
    await tutor.waitFor(`[
      document.getElementById("prejoin-video-input-select"),
      document.getElementById("video-input-select")
    ].every((select) => Array.from(select.options).some((option) => option.value === "smoke-camera-document"))`, "automatic device refresh");

    await tutor.evaluate(`(() => {
      const select = document.getElementById("prejoin-video-input-select");
      select.value = "smoke-camera-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await tutor.waitFor(`document.getElementById("video-input-select").value === "smoke-camera-2"
      && JSON.parse(localStorage.getItem(${JSON.stringify(classroomKey)}) || "null")?.devices?.videoInputId === "smoke-camera-2"`, "synchronized prejoin camera choice");

    await tutor.click("#join-room");
    await tutor.waitFor('!document.getElementById("room-screen").classList.contains("is-hidden")', "tutor classroom");
    await tutor.waitFor('Boolean(document.querySelector("iframe[data-smoke-jitsi]"))', "stubbed video provider");

    const dockStructure = await tutor.evaluate(`({
      files: document.querySelectorAll('[data-tool-panel="files"]').length,
      review: document.querySelectorAll('[data-tool-panel="review"]').length,
      directLink: document.querySelectorAll('#classroom-tooldock #copy-room-link').length,
      peopleLink: document.querySelectorAll('[data-quick-panel="people"] #copy-room-link').length,
      geometryToggle: document.querySelectorAll("#toggle-geometry-dock").length
    })`);
    assertEqual(dockStructure, { files: 0, review: 0, directLink: 0, peopleLink: 1, geometryToggle: 1 }, "Classroom dock cleanup is incomplete");

    await tutor.click('[data-tool-panel="people"]');
    assert(await tutor.evaluate('!document.getElementById("quick-menu").classList.contains("is-hidden") && document.querySelector(\'[data-quick-panel="people"]\').classList.contains("active")'), "People quick menu did not open");
    await tutor.click("#copy-room-link");
    await tutor.waitFor('!document.getElementById("classroom-feedback").classList.contains("is-hidden")', "copy-link feedback");
    assert(await tutor.evaluate('/Link copied|Copy unavailable/.test(document.getElementById("classroom-feedback-text").textContent)'), "Copy-link feedback was not meaningful");
    await tutor.click('[data-tool-panel="people"]');

    await tutor.click('[data-tool-panel="audio"]');
    assert(await tutor.evaluate('!document.getElementById("quick-menu").classList.contains("is-hidden") && document.querySelector(\'[data-quick-panel="audio"]\').classList.contains("active")'), "Audio quick menu did not open");
    await tutor.click("#toggle-audio");
    await tutor.waitFor('document.getElementById("audio-tool-button").dataset.mediaState === "muted"', "muted microphone state");
    assert(await tutor.evaluate('document.getElementById("audio-tool-button").classList.contains("is-media-off") && document.getElementById("toggle-audio-label").textContent.includes("Unmute")'), "Microphone state did not reach both controls");
    await tutor.click("#toggle-audio");
    await tutor.waitFor('document.getElementById("audio-tool-button").dataset.mediaState === "on"', "unmuted microphone state");
    await tutor.click('[data-tool-panel="audio"]');
    assert(await tutor.evaluate('document.getElementById("quick-menu").classList.contains("is-hidden")'), "Audio quick menu did not toggle closed");

    await tutor.click('[data-tool-panel="video"]');
    await tutor.click("#toggle-video");
    await tutor.waitFor('document.getElementById("video-tool-button").dataset.mediaState === "muted"', "disabled camera state");
    assert(await tutor.evaluate('document.getElementById("video-tool-button").classList.contains("is-media-off") && document.getElementById("toggle-video-label").textContent.includes("on")'), "Camera state did not reach both controls");
    await tutor.click("#toggle-video");
    await tutor.waitFor('document.getElementById("video-tool-button").dataset.mediaState === "on"', "enabled camera state");
    await tutor.sleep(300);
    await tutor.evaluate('document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');
    assert(await tutor.evaluate('document.getElementById("quick-menu").classList.contains("is-hidden")'), "Outside click did not close the video quick menu");

    await tutor.click('[data-tool-panel="people"]');
    await tutor.setViewport({ width: 680, height: 520, deviceScaleFactor: 1, mobile: false });
    await tutor.sleep(250);
    const compactMenu = await tutor.evaluate(`(() => {
      const room = document.getElementById("room-screen").getBoundingClientRect();
      const menu = document.getElementById("quick-menu").getBoundingClientRect();
      const dock = document.getElementById("classroom-tooldock").getBoundingClientRect();
      return {
        inside: menu.left >= room.left - 1 && menu.right <= room.right + 1 && menu.top >= room.top - 1,
        aboveDock: menu.bottom <= dock.top + 1
      };
    })()`);
    assert(compactMenu.inside && compactMenu.aboveDock, "Quick menu escaped the compact classroom viewport");
    await tutor.click('[data-tool-panel="people"]');
    await tutor.setViewport(viewport);
    await tutor.sleep(150);

    await tutor.click('[data-tool-panel="time"]');
    assert(await tutor.evaluate('!document.getElementById("tool-drawer").classList.contains("is-hidden") && document.querySelector(\'[data-drawer-panel="time"]\').classList.contains("active")'), "Time drawer did not open");
    await tutor.drag("#tool-drawer-header", { deltaX: 420, deltaY: 260 });
    await tutor.setViewport({ width: 680, height: 520, deviceScaleFactor: 1, mobile: false });
    await tutor.sleep(250);
    const compactDrawer = await tutor.evaluate(`(() => {
      const room = document.getElementById("room-screen").getBoundingClientRect();
      const drawer = document.getElementById("tool-drawer").getBoundingClientRect();
      const dock = document.getElementById("classroom-tooldock").getBoundingClientRect();
      return {
        inside: drawer.left >= room.left - 1 && drawer.right <= room.right + 1 && drawer.top >= room.top - 1,
        aboveDock: drawer.bottom <= dock.top + 1
      };
    })()`);
    assert(compactDrawer.inside && compactDrawer.aboveDock, "Dragged time drawer escaped after viewport resize");
    await tutor.setViewport(viewport);
    await tutor.sleep(150);
    await tutor.click('[data-tool-panel="time"]');
    assert(await tutor.evaluate('document.getElementById("tool-drawer").classList.contains("is-hidden")'), "Time drawer did not toggle closed");

    const student = await openPage("classroom-student", {
      initScript: fakeJitsiScript(),
      url: `${origin}/src/app/classroom/classroom.html?room=${encodeURIComponent(room)}&role=student`
    });
    await student.waitFor('document.readyState === "complete"', "student prejoin screen");
    assert(
      await student.evaluate('document.getElementById("back-to-dashboard")?.getAttribute("href") === "../dashboard/student-dashboard.html"'),
      "Student dashboard return link is incorrect"
    );
    await student.waitFor('document.getElementById("prejoin-attendees").textContent.includes("Tutor")', "live tutor presence in student waiting room");
    await student.click("#join-room");
    await student.waitFor('!document.getElementById("prelesson-modal-shell").classList.contains("is-hidden")', "student check-in");
    await student.evaluate(`(() => {
      const goal = document.getElementById("student-goal");
      goal.value = "Review the lesson goal";
      goal.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("prelesson-form").requestSubmit();
      return true;
    })()`);
    await student.waitFor('!document.getElementById("student-waiting-modal-shell").classList.contains("is-hidden")', "student approval wait");
    await tutor.waitFor('!document.getElementById("waiting-insight").classList.contains("is-hidden")', "tutor check-in insight");
    await tutor.click("#approve-student-entry");
    await student.waitFor('!document.getElementById("room-screen").classList.contains("is-hidden")', "approved student classroom");

    const lessonStarted = await tutor.waitFor(`Boolean(JSON.parse(localStorage.getItem(${JSON.stringify(classroomKey)}) || "null")?.lessonStartedAt)`, "lesson clock start");
    assert(lessonStarted, "Lesson clock did not start after both participants joined");

    await tutor.click('[data-tool-panel="whiteboard"]');
    await tutor.click("#open-whiteboard-attached");
    await tutor.waitFor('document.getElementById("room-screen").classList.contains("is-board-active")', "tutor shared whiteboard");
    try {
      await student.waitFor('document.getElementById("room-screen").classList.contains("is-board-active")', "student shared whiteboard", 6_000);
    } catch (error) {
      const snapshots = await Promise.all([tutor, student].map((page) => page.evaluate(`(() => {
        const stored = JSON.parse(localStorage.getItem(${JSON.stringify(classroomKey)}) || "null");
        return {
          boardRendered: document.getElementById("room-screen").classList.contains("is-board-active"),
          storedWhiteboard: stored?.whiteboard || null,
          storedEvents: stored?.sessionEvents?.slice(0, 3).map((item) => item.label) || []
        };
      })()`)));
      error.message += `\nRoom snapshots: ${JSON.stringify(snapshots)}`;
      throw error;
    }
    const embeddedSource = await tutor.evaluate('document.getElementById("whiteboard-frame").getAttribute("src")');
    assert(embeddedSource?.includes("embed=1"), "Classroom did not open the embedded whiteboard URL");

    await tutor.waitFor('Boolean(document.getElementById("whiteboard-frame").contentWindow?.kelpWhiteboardApi)', "embedded classroom whiteboard API");
    const fullDockSize = await tutor.evaluate(`(() => {
      const rect = document.getElementById("classroom-tooldock").getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })()`);
    await tutor.evaluate(`(() => {
      const frameDocument = document.getElementById("whiteboard-frame").contentDocument;
      frameDocument.querySelector('[data-tool-group="geometry"] [data-tool-group-toggle]').click();
      frameDocument.querySelector('[data-geometry-tool="point"]').click();
    })()`);
    await tutor.waitFor('document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "compact dock for graph editor");
    const compactGeometryDock = await tutor.evaluate(`(() => {
      const dock = document.getElementById("classroom-tooldock");
      const toggle = document.getElementById("toggle-geometry-dock");
      const rect = dock.getBoundingClientRect();
      const visibleChildren = Array.from(dock.children).filter((element) => {
        const styles = getComputedStyle(element);
        const childRect = element.getBoundingClientRect();
        return styles.display !== "none" && styles.visibility !== "hidden" && childRect.width > 0 && childRect.height > 0;
      });
      return {
        label: toggle.getAttribute("aria-label"),
        ariaExpanded: toggle.getAttribute("aria-expanded"),
        visibleChildren: visibleChildren.length,
        width: rect.width,
        height: rect.height,
        editorOpen: !document.getElementById("whiteboard-frame").contentDocument
          .getElementById("geometry-editor-shell").classList.contains("is-hidden")
      };
    })()`);
    assert(compactGeometryDock.label === "Show classroom controls" && compactGeometryDock.ariaExpanded === "false", "Compact graph dock restore control is inconsistent");
    assert(compactGeometryDock.visibleChildren === 1 && compactGeometryDock.editorOpen, "Graph editor did not reduce the classroom dock to one control");
    assert(compactGeometryDock.width <= 46 && compactGeometryDock.height <= 22, "Graph editor dock did not become a minimal arrow tab");

    await tutor.click("#toggle-geometry-dock");
    await tutor.waitFor('!document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "expanded graph editor dock");
    const expandedGeometryDock = await tutor.evaluate(`(() => {
      const dock = document.getElementById("classroom-tooldock");
      const toggle = document.getElementById("toggle-geometry-dock");
      return {
        label: toggle.textContent.trim(),
        ariaExpanded: toggle.getAttribute("aria-expanded"),
        visibleChildren: Array.from(dock.children).filter((element) => {
          const styles = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return styles.display !== "none" && styles.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        }).length
      };
    })()`);
    assert(expandedGeometryDock.label === "Minimize" && expandedGeometryDock.ariaExpanded === "true" && expandedGeometryDock.visibleChildren > 1, "Classroom controls did not reopen over the graph editor");
    await tutor.click("#toggle-geometry-dock");
    await tutor.waitFor('document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "recompacted graph editor dock");

    await tutor.evaluate('document.getElementById("toggle-whiteboard-focus").click()');
    await tutor.waitFor('document.getElementById("room-screen").classList.contains("is-whiteboard-focus") && !document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "graph editor focus-mode dock state");
    assert(await tutor.evaluate('document.getElementById("toggle-geometry-dock").classList.contains("is-hidden")'), "Graph dock toggle remained visible in whiteboard focus mode");
    await tutor.evaluate('document.getElementById("pin-focus-dock").click()');
    await tutor.waitFor('document.getElementById("room-screen").classList.contains("is-focus-dock-pinned") && document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "compact graph dock in pinned focus mode");
    assert(await tutor.evaluate(`(() => {
      const toggle = document.getElementById("toggle-geometry-dock");
      const rect = document.getElementById("classroom-tooldock").getBoundingClientRect();
      return !toggle.classList.contains("is-hidden")
        && toggle.getAttribute("aria-expanded") === "false"
        && rect.width <= 46
        && rect.height <= 22;
    })()`), "Pinned focus mode did not reduce the graph dock to the arrow tab");
    await tutor.click("#toggle-geometry-dock");
    await tutor.waitFor('!document.getElementById("room-screen").classList.contains("is-geometry-dock-compact") && document.getElementById("pin-focus-dock").getAttribute("aria-pressed") === "true"', "expanded pinned-focus graph dock");
    await tutor.click("#toggle-geometry-dock");
    await tutor.waitFor('document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "recompacted pinned-focus graph dock");
    await tutor.evaluate('document.getElementById("pin-focus-dock").click()');
    await tutor.waitFor('!document.getElementById("room-screen").classList.contains("is-focus-dock-pinned") && !document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "unpinned focus dock state");
    await tutor.evaluate('document.getElementById("toggle-whiteboard-focus").click()');
    await tutor.waitFor('!document.getElementById("room-screen").classList.contains("is-whiteboard-focus") && document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "graph dock restored after focus mode");

    await tutor.evaluate(`document.getElementById("whiteboard-frame").contentDocument
      .getElementById("close-geometry-editor").click()`);
    await tutor.waitFor('!document.getElementById("room-screen").classList.contains("is-geometry-editor-open") && !document.getElementById("room-screen").classList.contains("is-geometry-dock-compact")', "classroom dock restored after graph editor close");
    assert(await tutor.evaluate('document.getElementById("toggle-geometry-dock").classList.contains("is-hidden")'), "Graph dock toggle remained visible after the editor closed");

    await tutor.click("#return-to-classroom");
    await tutor.waitFor('!document.getElementById("room-screen").classList.contains("is-board-active")', "return to classroom");

    await tutor.click("#leave-room");
    await tutor.waitFor('!document.getElementById("postlesson-modal-shell").classList.contains("is-hidden")', "tutor post-lesson review");
    const reviewStartsBlank = await tutor.evaluate(`[
      "lesson-subject",
      "lesson-branch",
      "lesson-format",
      "student-participation",
      "participation-evidence",
      "engagement-score"
    ].every((id) => document.getElementById(id).value === "")`);
    assert(reviewStartsBlank, "Required tutor review fields did not start blank");
  });

  console.log("\nAll classroom and whiteboard smoke tests passed.");
} catch (error) {
  console.error(`\nSmoke test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
}

async function runCase(name, test) {
  const startedAt = Date.now();
  console.log(`[RUN] ${name}`);
  try {
    await test();
    console.log(`[PASS] ${name} (${Date.now() - startedAt} ms)`);
  } catch (error) {
    const page = Array.from(openPages).at(-1);
    if (page) {
      const screenshotPath = await page.captureFailure(name).catch(() => null);
      if (screenshotPath) error.message += `\nScreenshot: ${screenshotPath}`;
    }
    throw error;
  } finally {
    await closeAllPages();
  }
}

async function startStaticServer() {
  staticServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname);
      const relativePath = pathname === "/" ? "src/app/classroom/classroom.html" : pathname.slice(1);
      const filePath = normalize(join(projectRoot, relativePath));
      const projectRelativePath = relative(projectRoot, filePath);
      if (projectRelativePath.startsWith("..") || isAbsolute(projectRelativePath) || !existsSync(filePath)) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream"
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Server error");
    }
  });

  await new Promise((resolvePromise, rejectPromise) => {
    staticServer.once("error", rejectPromise);
    staticServer.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = staticServer.address();
  return `http://127.0.0.1:${address.port}`;
}

async function startChrome() {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run the smoke tests.");
  }

  profileDirectory = await mkdtemp(join(tmpdir(), "kelp-smoke-profile-"));
  debugPort = await reserveLoopbackPort();
  let browserDiagnostics = "";
  let launchError = null;
  chromeProcess = spawn(chromePath, [
    "--headless=new",
    "--disable-extensions",
    "--disable-gpu",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"] });

  chromeProcess.stderr?.on("data", (chunk) => {
    browserDiagnostics = `${browserDiagnostics}${chunk}`.slice(-4000);
  });
  chromeProcess.once("error", (error) => {
    launchError = error;
  });

  const version = await waitForValue(async () => {
    if (launchError) throw launchError;
    if (chromeProcess.exitCode != null) {
      const diagnostics = browserDiagnostics.trim();
      throw new Error(`Chrome exited with code ${chromeProcess.exitCode}${diagnostics ? `: ${diagnostics}` : ""}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }, 15_000, `Chrome debugging endpoint on port ${debugPort}`);
  browserClient = await CdpClient.connect(version.webSocketDebuggerUrl);
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return address.port;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ].filter(Boolean);
  const directMatch = candidates.find((candidate) => existsSync(candidate));
  if (directMatch) return directMatch;

  for (const command of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const result = spawnSync(command, ["--version"], { stdio: "ignore" });
    if (!result.error && result.status === 0) return command;
  }
  return null;
}

async function openPage(name, { initScript = "", url }) {
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`, {
    method: "PUT"
  }).then((response) => response.json());
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  const page = new SmokePage(name, target.id, client);
  openPages.add(page);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", viewport);
  if (initScript) {
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: initScript });
  }
  await client.send("Page.navigate", { url });
  await page.waitFor('document.readyState === "complete"', `${name} document`);
  return page;
}

class SmokePage {
  constructor(name, targetId, client) {
    this.name = name;
    this.targetId = targetId;
    this.client = client;
  }

  async evaluate(expression) {
    const response = await this.client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      const message = response.exceptionDetails.exception?.description
        || response.exceptionDetails.text
        || "Browser evaluation failed";
      throw new Error(`${this.name}: ${message}`);
    }
    return response.result?.value;
  }

  async click(selector) {
    const clicked = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click();
      return true;
    })()`);
    assert(clicked, `${this.name}: missing click target ${selector}`);
  }

  async drag(selector, { deltaX, deltaY }) {
    const rect = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
    })()`);
    assert(rect, `${this.name}: missing drag target ${selector}`);

    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const end = { x: start.x + deltaX, y: start.y + deltaY };
    await this.client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...start });
    await this.client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...start,
      button: "left",
      buttons: 1,
      clickCount: 1
    });

    for (let step = 1; step <= 6; step += 1) {
      const progress = step / 6;
      await this.client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
        button: "left",
        buttons: 1
      });
    }

    await this.client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...end,
      button: "left",
      buttons: 0,
      clickCount: 1
    });
  }

  async waitFor(expression, description, timeout = browserTimeout) {
    return waitForValue(async () => {
      try {
        return await this.evaluate(`Boolean(${expression})`);
      } catch (error) {
        return false;
      }
    }, timeout, description);
  }

  async setViewport(nextViewport) {
    await this.client.send("Emulation.setDeviceMetricsOverride", nextViewport);
  }

  async sleep(milliseconds) {
    await delay(milliseconds);
  }

  async captureFailure(name) {
    const result = await this.client.send("Page.captureScreenshot", { format: "png" });
    const filename = `kelp-smoke-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.png`;
    const filePath = join(tmpdir(), filename);
    await writeFile(filePath, Buffer.from(result.data, "base64"));
    return filePath;
  }

  async close() {
    openPages.delete(this);
    await fetch(`http://127.0.0.1:${debugPort}/json/close/${this.targetId}`).catch(() => null);
    this.client.close();
  }
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => this.handleClose());
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, rejectPromise) => {
      socket.addEventListener("open", resolvePromise, { once: true });
      socket.addEventListener("error", rejectPromise, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (!message.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || "Chrome debugging command failed"));
    } else {
      pending.resolve(message.result || {});
    }
  }

  handleClose() {
    this.pending.forEach(({ reject }) => reject(new Error("Chrome debugging connection closed")));
    this.pending.clear();
  }

  close() {
    if (this.socket.readyState <= WebSocket.OPEN) this.socket.close();
  }
}

async function closeAllPages() {
  await Promise.all(Array.from(openPages).map((page) => page.close().catch(() => null)));
}

async function cleanup() {
  await closeAllPages();
  if (browserClient) {
    await browserClient.send("Browser.close").catch(() => null);
    browserClient.close();
  }
  if (chromeProcess && chromeProcess.exitCode == null) chromeProcess.kill();
  if (staticServer) {
    await new Promise((resolvePromise) => staticServer.close(resolvePromise));
  }
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }).catch(() => null);
  }
}

async function waitForValue(read, timeout, description) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function centerX(rect) {
  return rect.left + rect.width / 2;
}

function centerY(rect) {
  return rect.top + rect.height / 2;
}

function rectanglesOverlap(first, second) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function clearWhiteboardStorageScript(room, trackSceneWrites = false) {
  const sceneKey = `kelp:whiteboard:v1:${room}`;
  return `
    localStorage.removeItem(${JSON.stringify(sceneKey)});
    localStorage.removeItem(${JSON.stringify(`kelp:whiteboard:grid-settings:v1:${room}`)});
    ${trackSceneWrites ? `
      window.__kelpSceneWrites = [];
      const kelpOriginalStorageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === ${JSON.stringify(sceneKey)}) {
          window.__kelpSceneWrites.push({ time: Date.now(), bytes: String(value || "").length });
        }
        return kelpOriginalStorageSetItem.call(this, key, value);
      };
    ` : ""}
  `;
}

function whiteboardBackendProbeScript() {
  return `
    window.__kelpAdapterProbe = {
      connected: 0,
      disconnected: 0,
      subscriber: null,
      boardSaves: 0,
      fileSaves: 0,
      published: []
    };
    window.KelpBackendAdapters = {
      whiteboard: async ({ localAdapters }) => ({
        meta: { provider: "smoke-backend" },
        collaboration: {
          async connect() {
            window.__kelpAdapterProbe.connected += 1;
            return { connected: true, provider: "smoke-backend" };
          },
          subscribe(listener) {
            window.__kelpAdapterProbe.subscriber = listener;
            return () => { window.__kelpAdapterProbe.subscriber = null; };
          },
          async publishScene(update) {
            window.__kelpAdapterProbe.published.push({
              revision: update.revision,
              elementIds: update.scene.elements.map((element) => element.id)
            });
          },
          async disconnect() {
            window.__kelpAdapterProbe.disconnected += 1;
          }
        },
        whiteboards: {
          load: (...args) => localAdapters.whiteboards.load(...args),
          async save(scene, context) {
            window.__kelpAdapterProbe.boardSaves += 1;
            return localAdapters.whiteboards.save(scene, context);
          },
          clear: (...args) => localAdapters.whiteboards.clear(...args)
        },
        files: {
          async save(files, context) {
            window.__kelpAdapterProbe.fileSaves += 1;
            return localAdapters.files.save(files, context);
          }
        }
      })
    };
  `;
}

function fakeJitsiScript() {
  return `
    (() => {
      const listeners = new Set();
      const tracksFor = (kind, deviceId) => [{
        kind,
        enabled: true,
        stop() {},
        getSettings() { return { deviceId }; }
      }];
      window.__kelpSmokeDevices = [
        { kind: "audioinput", deviceId: "smoke-mic-1", label: "Built-in microphone", groupId: "audio-1" },
        { kind: "audioinput", deviceId: "smoke-mic-2", label: "USB microphone", groupId: "audio-2" },
        { kind: "audiooutput", deviceId: "smoke-speaker-1", label: "Built-in speakers", groupId: "speaker-1" },
        { kind: "audiooutput", deviceId: "smoke-speaker-2", label: "Headset", groupId: "speaker-2" },
        { kind: "videoinput", deviceId: "smoke-camera-1", label: "Built-in camera", groupId: "video-1" },
        { kind: "videoinput", deviceId: "smoke-camera-2", label: "USB camera", groupId: "video-2" }
      ];
      const mediaDevices = {
        async enumerateDevices() {
          return window.__kelpSmokeDevices.map((device) => ({ ...device, toJSON: () => ({ ...device }) }));
        },
        async getUserMedia(constraints = {}) {
          const audioId = constraints.audio?.deviceId?.ideal || "smoke-mic-1";
          const videoId = constraints.video?.deviceId?.ideal || "smoke-camera-1";
          const audioTracks = constraints.audio ? tracksFor("audio", audioId) : [];
          const videoTracks = constraints.video ? tracksFor("video", videoId) : [];
          return {
            getTracks: () => [...audioTracks, ...videoTracks],
            getAudioTracks: () => audioTracks,
            getVideoTracks: () => videoTracks
          };
        },
        addEventListener(name, callback) {
          if (name === "devicechange") listeners.add(callback);
        },
        removeEventListener(name, callback) {
          if (name === "devicechange") listeners.delete(callback);
        }
      };
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: mediaDevices
      });
      window.__addKelpSmokeDevice = (device) => {
        window.__kelpSmokeDevices.push(device);
        listeners.forEach((callback) => callback(new Event("devicechange")));
      };
    })();

    class KelpSmokeJitsiMeetExternalAPI {
      constructor(domain, options = {}) {
        this.listeners = new Map();
        this.commands = [];
        this.audioMuted = false;
        this.videoMuted = false;
        this.frame = document.createElement("iframe");
        this.frame.src = "about:blank";
        this.frame.title = "Smoke video provider";
        this.frame.dataset.smokeJitsi = "true";
        options.parentNode?.appendChild(this.frame);
        setTimeout(() => this.emit("videoConferenceJoined", {}), 0);
      }
      addListener(name, callback) {
        const callbacks = this.listeners.get(name) || [];
        callbacks.push(callback);
        this.listeners.set(name, callbacks);
      }
      executeCommand(command, ...args) {
        this.commands.push({ command, args });
        if (command === "toggleAudio") {
          this.audioMuted = !this.audioMuted;
          this.emit("audioMuteStatusChanged", { muted: this.audioMuted });
        }
        if (command === "toggleVideo") {
          this.videoMuted = !this.videoMuted;
          this.emit("videoMuteStatusChanged", { muted: this.videoMuted });
        }
      }
      isAudioMuted() { return this.audioMuted; }
      isVideoMuted() { return this.videoMuted; }
      setAudioInputDevice() {}
      setAudioOutputDevice() {}
      setVideoInputDevice() {}
      getParticipantsInfo() { return []; }
      emit(name, payload) {
        (this.listeners.get(name) || []).forEach((callback) => callback(payload));
      }
      dispose() {
        this.frame?.remove();
      }
    }
    Object.defineProperty(window, "JitsiMeetExternalAPI", {
      configurable: true,
      value: KelpSmokeJitsiMeetExternalAPI
    });
  `;
}

await main();
