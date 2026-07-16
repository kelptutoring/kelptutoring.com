const catalog = globalThis.tracksCatalog || { schemaVersion: 1, levels: [] };
const scheduleDomain = globalThis.KelpScheduleDomain;
const scheduleOutline = globalThis.KelpScheduleOutline;
const builderDraftKey = "kelpScheduleBuilderDraft";

const elements = {
  levelStep: document.getElementById("levelStep"),
  subjectStep: document.getElementById("subjectStep"),
  trackStep: document.getElementById("trackStep"),
  sessionStep: document.getElementById("sessionStep"),
  settingsStep: document.getElementById("settingsStep"),
  previewStep: document.getElementById("previewStep"),
  levelButtons: document.getElementById("levelButtons"),
  subjectButtons: document.getElementById("subjectButtons"),
  trackButtons: document.getElementById("trackButtons"),
  continueToTrackSessionsBtn: document.getElementById("continueToTrackSessionsBtn"),
  trackSelectionProgress: document.getElementById("trackSelectionProgress"),
  trackSessionHeading: document.getElementById("trackSessionHeading"),
  trackSessionDescription: document.getElementById("trackSessionDescription"),
  sessionSelectionList: document.getElementById("sessionSelectionList"),
  customSessionName: document.getElementById("customSessionName"),
  customSessionType: document.getElementById("customSessionType"),
  customSessionLink: document.getElementById("customSessionLink"),
  addCustomSessionBtn: document.getElementById("addCustomSessionBtn"),
  customSessionList: document.getElementById("customSessionList"),
  continueToSettingsBtn: document.getElementById("continueToSettingsBtn"),
  scheduleName: document.getElementById("scheduleName"),
  startDate: document.getElementById("startDate"),
  studentTimeZone: document.getElementById("studentTimeZone"),
  timeZoneOptions: document.getElementById("timeZoneOptions"),
  intervalDays: document.getElementById("intervalDays"),
  intervalCadenceOptions: document.getElementById("intervalCadenceOptions"),
  weeklyCadenceOptions: document.getElementById("weeklyCadenceOptions"),
  weekdayGrid: document.getElementById("weekdayGrid"),
  previewScheduleBtn: document.getElementById("previewScheduleBtn"),
  schedulePreviewSummary: document.getElementById("schedulePreviewSummary"),
  schedulePreviewList: document.getElementById("schedulePreviewList"),
  addPreviewModuleBtn: document.getElementById("addPreviewModuleBtn"),
  undoPreviewOutlineBtn: document.getElementById("undoPreviewOutlineBtn"),
  redoPreviewOutlineBtn: document.getElementById("redoPreviewOutlineBtn"),
  saveScheduleBtn: document.getElementById("saveScheduleBtn"),
  backStepBtn: document.getElementById("backStepBtn"),
  generatorMessage: document.getElementById("generatorMessage")
};

const steps = {
  level: elements.levelStep,
  subject: elements.subjectStep,
  track: elements.trackStep,
  session: elements.sessionStep,
  settings: elements.settingsStep,
  preview: elements.previewStep
};

const state = {
  currentStep: "level",
  level: null,
  subject: null,
  selectedTrackIds: new Set(),
  activeTrackIndex: 0,
  moduleOrderByTrack: new Map(),
  selectedSessionIds: new Set(),
  customSessions: [],
  orderedPlans: [],
  outlineItems: [],
  outlineHistory: [],
  outlineFuture: [],
  previewSchedule: null,
  scheduleId: null,
  draggedModuleId: null,
  draggedOutlineItemKey: null,
  draggedOutlineItemKind: null,
  dragPointerY: null,
  dragAutoScrollFrame: null,
  moduleDragJustEnded: false
};

function showMessage(message, type = "error") {
  elements.generatorMessage.textContent = message;
  elements.generatorMessage.className = `message ${type}`;
}

function clearMessage() {
  elements.generatorMessage.textContent = "";
  elements.generatorMessage.className = "message";
}

function clearElement(element) {
  element.replaceChildren();
}

function createButton(text, className = "generator-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function persistBuilderDraft() {
  try {
    const cadenceType = document.querySelector('input[name="cadenceType"]:checked')?.value || "day_interval";
    const weekdays = Array.from(elements.weekdayGrid.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => Number(input.value));
    const draft = {
      schemaVersion: 1,
      currentStep: state.currentStep,
      levelId: state.level?.id || null,
      subjectId: state.subject?.id || null,
      selectedTrackIds: Array.from(state.selectedTrackIds),
      activeTrackIndex: state.activeTrackIndex,
      moduleOrderByTrack: Array.from(state.moduleOrderByTrack.entries()),
      selectedSessionIds: Array.from(state.selectedSessionIds),
      customSessions: state.customSessions,
      outlineItems: state.outlineItems,
      outlineHistory: state.outlineHistory,
      outlineFuture: state.outlineFuture,
      scheduleId: state.scheduleId,
      settings: {
        scheduleName: elements.scheduleName.value,
        startDate: elements.startDate.value,
        studentTimeZone: elements.studentTimeZone.value,
        intervalDays: elements.intervalDays.value,
        cadenceType,
        weekdays
      },
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(builderDraftKey, JSON.stringify(draft));
  } catch (error) {
    console.error("Could not save the schedule builder draft:", error);
  }
}

function restoreBuilderDraft() {
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(builderDraftKey) || "null");
  } catch (error) {
    console.error("Could not read the schedule builder draft:", error);
    return false;
  }
  if (!draft || draft.schemaVersion !== 1) return false;

  const level = catalog.levels.find((item) => item.id === draft.levelId) || null;
  const subject = level?.subjects.find((item) => item.id === draft.subjectId) || null;
  state.level = level;
  state.subject = subject;
  state.selectedTrackIds = new Set(
    (draft.selectedTrackIds || []).filter((trackId) => subject?.tracks.some((track) => track.id === trackId))
  );
  state.activeTrackIndex = Math.max(0, Number(draft.activeTrackIndex) || 0);
  state.moduleOrderByTrack = new Map(Array.isArray(draft.moduleOrderByTrack) ? draft.moduleOrderByTrack : []);
  state.selectedSessionIds = new Set(draft.selectedSessionIds || []);
  state.customSessions = Array.isArray(draft.customSessions) ? draft.customSessions : [];
  state.outlineItems = Array.isArray(draft.outlineItems) ? draft.outlineItems : [];
  state.outlineHistory = Array.isArray(draft.outlineHistory) ? draft.outlineHistory : [];
  state.outlineFuture = Array.isArray(draft.outlineFuture) ? draft.outlineFuture : [];
  state.scheduleId = draft.scheduleId || null;

  const settings = draft.settings || {};
  elements.scheduleName.value = settings.scheduleName || "";
  elements.startDate.value = settings.startDate || "";
  elements.studentTimeZone.value = settings.studentTimeZone || elements.studentTimeZone.value;
  elements.intervalDays.value = settings.intervalDays || "7";
  const cadenceInput = document.querySelector(`input[name="cadenceType"][value="${settings.cadenceType || "day_interval"}"]`);
  if (cadenceInput) cadenceInput.checked = true;
  const selectedWeekdays = new Set(settings.weekdays || []);
  elements.weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = selectedWeekdays.has(Number(input.value));
  });

  const allowedSteps = new Set(["level", "subject", "track", "session", "settings", "preview"]);
  state.currentStep = allowedSteps.has(draft.currentStep) ? draft.currentStep : "level";
  return true;
}

function renderRestoredDraft() {
  if (!state.level) {
    showStep("level");
    return;
  }
  if (!state.subject) {
    renderSubjects();
    showStep("subject");
    return;
  }
  if (state.currentStep === "subject") {
    renderSubjects();
    showStep("subject");
    return;
  }
  if (state.currentStep === "track" || state.selectedTrackIds.size === 0) {
    renderTracks();
    showStep("track");
    return;
  }

  state.activeTrackIndex = Math.min(state.activeTrackIndex, Math.max(0, getSelectedTracks().length - 1));
  if (state.currentStep === "session") {
    renderTrackSessionSelection();
    showStep("session");
    return;
  }
  if (state.currentStep === "settings") {
    showStep("settings");
    return;
  }
  if (state.currentStep === "preview") {
    try {
      state.previewSchedule = buildPreviewSchedule();
      renderSchedulePreview();
      showStep("preview");
    } catch (error) {
      showStep("settings");
      showMessage("Your draft was restored. Review the schedule settings before previewing again.");
    }
    return;
  }
  showStep("level");
}

function showStep(stepName) {
  state.currentStep = stepName;
  Object.values(steps).forEach((step) => step.classList.add("hidden"));
  steps[stepName].classList.remove("hidden");
  elements.backStepBtn.classList.toggle("hidden", stepName === "level");
  clearMessage();
  persistBuilderDraft();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetSessionWork() {
  state.selectedSessionIds.clear();
  state.customSessions = [];
  state.orderedPlans = [];
  state.outlineItems = [];
  state.outlineHistory = [];
  state.outlineFuture = [];
  state.previewSchedule = null;
  state.scheduleId = null;
}

function resetTrackWork() {
  state.selectedTrackIds.clear();
  state.activeTrackIndex = 0;
  state.moduleOrderByTrack.clear();
  resetSessionWork();
}

function resetAfterLevel() {
  state.subject = null;
  resetTrackWork();
}

function resetAfterSubject() {
  resetTrackWork();
}

function getSelectedTracks() {
  if (!state.subject) return [];
  return state.subject.tracks.filter((track) => state.selectedTrackIds.has(track.id));
}

function getActiveTrack() {
  return getSelectedTracks()[state.activeTrackIndex] || null;
}

function ensureTrackModuleOrder(track) {
  if (!state.moduleOrderByTrack.has(track.id)) {
    state.moduleOrderByTrack.set(track.id, track.modules.map((module) => module.id));
  }
  return state.moduleOrderByTrack.get(track.id);
}

function getOrderedTrackModules(track) {
  const modulesById = new Map(track.modules.map((module) => [module.id, module]));
  return ensureTrackModuleOrder(track)
    .map((moduleId) => modulesById.get(moduleId))
    .filter(Boolean);
}

function purgeTrackSelections(track) {
  track.modules.forEach((module) => {
    module.sessions.forEach((session) => state.selectedSessionIds.delete(session.id));
  });
  state.customSessions = state.customSessions.filter((session) => session.trackId !== track.id);
  state.moduleOrderByTrack.delete(track.id);
  state.orderedPlans = [];
  state.previewSchedule = null;
}

function renderLevels() {
  clearElement(elements.levelButtons);
  if (!catalog.levels?.length) {
    showMessage("No session catalogue was found. Regenerate the track data first.");
    return;
  }

  catalog.levels.forEach((level) => {
    const button = createButton(level.title);
    button.addEventListener("click", () => {
      const isSameLevel = state.level?.id === level.id;
      state.level = level;
      if (!isSameLevel) resetAfterLevel();
      renderSubjects();
      showStep("subject");
    });
    elements.levelButtons.appendChild(button);
  });
}

function renderSubjects() {
  clearElement(elements.subjectButtons);
  state.level.subjects.forEach((subject) => {
    const button = createButton(subject.title);
    button.addEventListener("click", () => {
      const isSameSubject = state.subject?.id === subject.id;
      state.subject = subject;
      if (!isSameSubject) resetAfterSubject();
      if (subject.tracks.length === 1 && subject.tracks[0].isImplicit) {
        state.selectedTrackIds.add(subject.tracks[0].id);
        ensureTrackModuleOrder(subject.tracks[0]);
        state.activeTrackIndex = 0;
        renderTrackSessionSelection();
        showStep("session");
      } else {
        renderTracks();
        showStep("track");
      }
    });
    elements.subjectButtons.appendChild(button);
  });
}

function renderTracks() {
  clearElement(elements.trackButtons);
  state.subject.tracks.forEach((track) => {
    const button = createButton("", "generator-button track-selection-button");
    const title = document.createElement("span");
    title.className = "track-selection-title";
    title.textContent = track.title;
    const description = document.createElement("span");
    description.className = "track-selection-description";
    description.textContent = track.description || "Open this track's modules and session plans.";
    button.append(title, description);
    button.classList.toggle("selected", state.selectedTrackIds.has(track.id));
    button.setAttribute("aria-pressed", String(state.selectedTrackIds.has(track.id)));
    button.addEventListener("click", () => {
      if (state.selectedTrackIds.has(track.id)) {
        state.selectedTrackIds.delete(track.id);
        purgeTrackSelections(track);
      } else {
        state.selectedTrackIds.add(track.id);
        ensureTrackModuleOrder(track);
      }
      button.classList.toggle("selected", state.selectedTrackIds.has(track.id));
      button.setAttribute("aria-pressed", String(state.selectedTrackIds.has(track.id)));
      persistBuilderDraft();
    });
    elements.trackButtons.appendChild(button);
  });
}

function reorderModule(track, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const moduleOrderIds = ensureTrackModuleOrder(track);
  const sourceIndex = moduleOrderIds.indexOf(sourceId);
  const originalTargetIndex = moduleOrderIds.indexOf(targetId);
  if (sourceIndex < 0) return;
  const [movedId] = moduleOrderIds.splice(sourceIndex, 1);
  const targetIndex = moduleOrderIds.indexOf(targetId);
  const insertIndex = targetIndex < 0
    ? moduleOrderIds.length
    : targetIndex + (sourceIndex < originalTargetIndex ? 1 : 0);
  moduleOrderIds.splice(insertIndex, 0, movedId);
  state.orderedPlans = [];
  state.previewSchedule = null;
  persistBuilderDraft();
  renderSessionSelection();
}

function makeModuleDraggable(section, toggle, track, moduleId) {
  toggle.draggable = true;
  toggle.classList.add("draggable-module");
  toggle.title = "Expand this module or drag it to change its order";

  toggle.addEventListener("dragstart", (event) => {
    state.draggedModuleId = moduleId;
    state.moduleDragJustEnded = true;
    section.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", moduleId);
  });
  section.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    section.classList.add("is-drag-target");
  });
  section.addEventListener("dragleave", () => section.classList.remove("is-drag-target"));
  section.addEventListener("drop", (event) => {
    event.preventDefault();
    section.classList.remove("is-drag-target");
    reorderModule(track, state.draggedModuleId, moduleId);
  });
  toggle.addEventListener("dragend", () => {
    state.draggedModuleId = null;
    section.classList.remove("is-dragging", "is-drag-target");
    setTimeout(() => {
      state.moduleDragJustEnded = false;
    }, 0);
  });
}

function stripLegacySessionPrefix(title) {
  return String(title).replace(/^Week\s+\d+\s*:\s*/i, "").trim();
}

function createSessionSelectionCard(session, number) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-card generator-week-card";
  button.classList.toggle("selected", state.selectedSessionIds.has(session.id));

  const numberElement = document.createElement("span");
  numberElement.className = "link-number";
  numberElement.textContent = String(number);

  const titleWrapper = document.createElement("span");
  const titleElement = document.createElement("span");
  titleElement.className = "link-title";
  titleElement.textContent = stripLegacySessionPrefix(session.title);
  titleWrapper.appendChild(titleElement);

  button.append(numberElement, titleWrapper);
  button.addEventListener("click", () => {
    if (state.selectedSessionIds.has(session.id)) {
      state.selectedSessionIds.delete(session.id);
      button.classList.remove("selected");
    } else {
      state.selectedSessionIds.add(session.id);
      button.classList.add("selected");
    }
    state.orderedPlans = [];
    state.previewSchedule = null;
    persistBuilderDraft();
  });
  return button;
}

function renderSessionSelection() {
  clearElement(elements.sessionSelectionList);
  const track = getActiveTrack();
  if (!track) return;

  getOrderedTrackModules(track).forEach((module) => {
    const section = document.createElement("section");
    section.className = "week-preview-module is-collapsed";

    const heading = document.createElement("h3");
    heading.className = "week-preview-module-title";
    const contentId = `session-module-content-${module.id}`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "session-module-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", contentId);
    const headingText = document.createElement("span");
    headingText.textContent = module.title;
    const chevron = document.createElement("span");
    chevron.className = "session-module-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌃";
    toggle.append(headingText, chevron);
    heading.appendChild(toggle);

    const list = document.createElement("div");
    list.className = "lesson-list week-preview-items";
    module.sessions.forEach((session, index) => {
      list.appendChild(createSessionSelectionCard(session, index + 1));
    });

    const collapseInner = document.createElement("div");
    collapseInner.className = "session-module-collapse-inner";
    collapseInner.appendChild(list);
    const collapse = document.createElement("div");
    collapse.id = contentId;
    collapse.className = "session-module-collapse";
    collapse.setAttribute("aria-hidden", "true");
    collapse.inert = true;
    collapse.appendChild(collapseInner);

    toggle.addEventListener("click", () => {
      if (state.moduleDragJustEnded) return;
      const willCollapse = !section.classList.contains("is-collapsed");
      section.classList.toggle("is-collapsed", willCollapse);
      toggle.setAttribute("aria-expanded", String(!willCollapse));
      collapse.setAttribute("aria-hidden", String(willCollapse));
      collapse.inert = willCollapse;
    });

    makeModuleDraggable(section, toggle, track, module.id);
    section.append(heading, collapse);
    elements.sessionSelectionList.appendChild(section);
  });
}

function renderTrackSessionSelection() {
  const tracks = getSelectedTracks();
  const track = getActiveTrack();
  if (!track) return;

  elements.trackSelectionProgress.textContent = `Track ${state.activeTrackIndex + 1} of ${tracks.length}`;
  elements.trackSessionHeading.textContent = `4. Choose sessions: ${track.title}`;
  elements.trackSessionDescription.textContent = track.description
    || "Choose sessions from this track's modules. Your selections remain saved as you move through the other tracks.";
  elements.continueToSettingsBtn.textContent = state.activeTrackIndex < tracks.length - 1
    ? `Continue to ${tracks[state.activeTrackIndex + 1].title}`
    : "Continue to schedule settings";
  renderSessionSelection();
  renderCustomSessions();
}

function normalizePlanningLink(value) {
  const link = String(value || "").trim();
  if (!link) return null;
  if (/^(https?:\/\/|\.\.?\/)/i.test(link)) return link;
  throw new TypeError("Planning links must start with http://, https://, ./, or ../.");
}

function addCustomSession() {
  clearMessage();
  const track = getActiveTrack();
  if (!track) return;
  const title = elements.customSessionName.value.trim();
  if (!title) {
    showMessage("Enter a title for the custom session.");
    elements.customSessionName.focus();
    return;
  }

  let planningHref = null;
  try {
    planningHref = normalizePlanningLink(elements.customSessionLink.value);
  } catch (error) {
    showMessage(error.message);
    elements.customSessionLink.focus();
    return;
  }

  state.customSessions.push({
    clientId: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    sourceSessionId: null,
    trackId: track.id,
    trackTitle: track.title,
    moduleId: null,
    moduleTitle: "Custom sessions",
    title,
    planningHref,
    type: elements.customSessionType.value,
    difficulty: ""
  });
  state.orderedPlans = [];
  state.previewSchedule = null;
  elements.customSessionName.value = "";
  elements.customSessionLink.value = "";
  renderCustomSessions();
  persistBuilderDraft();
  showMessage("Custom session added. You can position it in the final preview.", "success");
}

function renderCustomSessions() {
  clearElement(elements.customSessionList);
  const track = getActiveTrack();
  if (!track) return;

  state.customSessions.filter((session) => session.trackId === track.id).forEach((session) => {
    const row = document.createElement("div");
    row.className = "custom-session-row";
    const description = document.createElement("span");
    description.textContent = `${session.title} · ${session.type}`;
    const removeButton = createButton("Remove", "btn-secondary compact-button");
    removeButton.addEventListener("click", () => {
      state.customSessions = state.customSessions.filter((item) => item.clientId !== session.clientId);
      state.orderedPlans = [];
      state.previewSchedule = null;
      renderCustomSessions();
      persistBuilderDraft();
    });
    row.append(description, removeButton);
    elements.customSessionList.appendChild(row);
  });
}

function getSelectedSessionPlans() {
  const plans = [];

  getSelectedTracks().forEach((track) => {
    getOrderedTrackModules(track).forEach((module) => {
      module.sessions.forEach((session) => {
        if (!state.selectedSessionIds.has(session.id)) return;
        plans.push({
          sourceSessionId: session.id,
          trackId: track.id,
          trackTitle: track.title,
          moduleId: module.id,
          moduleTitle: module.title,
          title: stripLegacySessionPrefix(session.title),
          planningHref: session.planningHref,
          type: session.type || "lesson",
          difficulty: session.difficulty || ""
        });
      });
    });
    plans.push(...state.customSessions.filter((session) => session.trackId === track.id));
  });

  return plans;
}

function getCadence() {
  const type = document.querySelector('input[name="cadenceType"]:checked')?.value;
  if (type === "weekly_frequency") {
    const weekdays = Array.from(elements.weekdayGrid.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => Number(input.value));
    return { type, weekdays };
  }
  return { type: "day_interval", intervalDays: Number(elements.intervalDays.value) };
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "schedule";
}

function ensureScheduleId() {
  if (!state.scheduleId) {
    state.scheduleId = `schedule_${slugify(elements.scheduleName.value)}_${Date.now().toString(36)}`;
  }
  return state.scheduleId;
}

function buildPreviewSchedule() {
  const selectedPlans = getSelectedSessionPlans();
  state.outlineItems = scheduleOutline.reconcileOutline(state.outlineItems, selectedPlans);
  state.orderedPlans = scheduleOutline.listPlans(state.outlineItems);
  const tracks = getSelectedTracks();
  const trackIds = tracks.map((track) => track.id);
  const trackTitles = tracks.map((track) => track.title);

  return scheduleDomain.buildSchedule({
    id: ensureScheduleId(),
    name: elements.scheduleName.value,
    startDate: elements.startDate.value,
    timeZone: elements.studentTimeZone.value,
    cadence: getCadence(),
    sessionPlans: state.orderedPlans,
    modules: scheduleOutline.listModules(state.outlineItems),
    context: {
      levelId: state.level.id,
      levelTitle: state.level.title,
      subjectId: state.subject.id,
      subjectTitle: state.subject.title,
      trackId: trackIds.length === 1 ? trackIds[0] : null,
      trackTitle: trackTitles.join(" + "),
      trackIds,
      trackTitles
    }
  });
}

function formatPreviewDate(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function describeDateRange(session) {
  const start = formatPreviewDate(session.startDate);
  if (session.startDate === session.endDate) return start;
  return `${start} – ${formatPreviewDate(session.endDate)}`;
}

function rebuildSchedulePreview({ animateFrom = null } = {}) {
  state.previewSchedule = buildPreviewSchedule();
  persistBuilderDraft();
  renderSchedulePreview();
  if (animateFrom) animatePreviewReorder(animateFrom);
}

function capturePreviewPositions() {
  const positions = new Map();
  elements.schedulePreviewList.querySelectorAll("[data-outline-key]").forEach((element) => {
    positions.set(element.dataset.outlineKey, element.getBoundingClientRect());
  });
  return positions;
}

function animatePreviewReorder(previousPositions) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  elements.schedulePreviewList.querySelectorAll("[data-outline-key]").forEach((element) => {
    const previous = previousPositions.get(element.dataset.outlineKey);
    if (!previous || typeof element.animate !== "function") return;
    const current = element.getBoundingClientRect();
    const deltaX = previous.left - current.left;
    const deltaY = previous.top - current.top;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
    element.animate([
      { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 0.72 },
      { transform: "translate(0, 0)", opacity: 1 }
    ], {
      duration: 360,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)"
    });
  });
}

function cloneOutlineItems(items = state.outlineItems) {
  return JSON.parse(JSON.stringify(items));
}

function updateOutlineHistoryControls() {
  elements.undoPreviewOutlineBtn.disabled = state.outlineHistory.length === 0;
  elements.redoPreviewOutlineBtn.disabled = state.outlineFuture.length === 0;
}

function recordOutlineChange(snapshot = cloneOutlineItems()) {
  state.outlineHistory.push(snapshot);
  if (state.outlineHistory.length > 50) state.outlineHistory.shift();
  state.outlineFuture = [];
}

function commitOutlineChange(snapshot) {
  if (!snapshot || JSON.stringify(snapshot) === JSON.stringify(state.outlineItems)) return false;
  recordOutlineChange(snapshot);
  return true;
}

function undoOutlineChange() {
  if (state.outlineHistory.length === 0) return;
  state.outlineFuture.push(cloneOutlineItems());
  state.outlineItems = state.outlineHistory.pop();
  rebuildSchedulePreview();
}

function redoOutlineChange() {
  if (state.outlineFuture.length === 0) return;
  state.outlineHistory.push(cloneOutlineItems());
  state.outlineItems = state.outlineFuture.pop();
  rebuildSchedulePreview();
}

function updateDragAutoScroll(event) {
  state.dragPointerY = event.clientY;
  if (state.dragAutoScrollFrame !== null) return;

  const tick = () => {
    const edgeSize = 84;
    const pointerY = state.dragPointerY;
    let scrollDelta = 0;
    if (pointerY !== null && pointerY < edgeSize) {
      scrollDelta = -Math.max(2, Math.ceil((edgeSize - pointerY) / 14));
    } else if (pointerY !== null && pointerY > window.innerHeight - edgeSize) {
      scrollDelta = Math.max(2, Math.ceil((pointerY - (window.innerHeight - edgeSize)) / 14));
    }
    if (scrollDelta !== 0) window.scrollBy({ top: scrollDelta, behavior: "auto" });
    state.dragAutoScrollFrame = window.requestAnimationFrame(tick);
  };

  state.dragAutoScrollFrame = window.requestAnimationFrame(tick);
}

function stopDragAutoScroll() {
  state.dragPointerY = null;
  if (state.dragAutoScrollFrame !== null) {
    window.cancelAnimationFrame(state.dragAutoScrollFrame);
    state.dragAutoScrollFrame = null;
  }
}

function getDropPosition(element, event) {
  const bounds = element.getBoundingClientRect();
  return event.clientY < bounds.top + (bounds.height / 2) ? "before" : "after";
}

function showDropPosition(element, position) {
  elements.schedulePreviewList.querySelectorAll(".is-drop-before, .is-drop-after").forEach((item) => {
    if (item === element) return;
    item.classList.remove("is-drop-before", "is-drop-after");
    delete item.dataset.dropPosition;
  });
  element.classList.toggle("is-drop-before", position === "before");
  element.classList.toggle("is-drop-after", position === "after");
  element.dataset.dropPosition = position;
}

function clearDropPosition(element) {
  element.classList.remove("is-drop-before", "is-drop-after");
  delete element.dataset.dropPosition;
}

function clearPreviewDragState() {
  state.draggedOutlineItemKey = null;
  state.draggedOutlineItemKind = null;
  stopDragAutoScroll();
  elements.schedulePreviewList.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    delete item.dataset.dropPosition;
  });
}

function getModuleSessionCount(moduleKey) {
  const moduleIndex = state.outlineItems.findIndex((item) => item.kind === "module" && item.key === moduleKey);
  if (moduleIndex < 0) return 0;
  let count = 0;
  for (let index = moduleIndex + 1; index < state.outlineItems.length; index += 1) {
    if (state.outlineItems[index].kind === "module") break;
    if (state.outlineItems[index].kind === "session") count += 1;
  }
  return count;
}

function movePreviewModule(moduleKey, direction) {
  const previousPositions = capturePreviewPositions();
  recordOutlineChange();
  scheduleOutline.moveModuleByDirection(state.outlineItems, moduleKey, direction);
  rebuildSchedulePreview({ animateFrom: previousPositions });
}

function removePreviewModule(moduleKey) {
  const modules = state.outlineItems.filter((item) => item.kind === "module");
  if (modules.length <= 1) {
    showMessage("A schedule must contain at least one module.");
    return;
  }
  const moduleIndex = modules.findIndex((item) => item.key === moduleKey);
  if (moduleIndex < 0) return;
  const moduleItem = modules[moduleIndex];
  const destination = moduleIndex === 0 ? modules[1] : modules[moduleIndex - 1];
  const sessionCount = getModuleSessionCount(moduleKey);
  const reassignmentMessage = sessionCount === 0
    ? "It does not contain any sessions."
    : `${sessionCount} session${sessionCount === 1 ? "" : "s"} will move to “${destination.title}”.`;
  const confirmed = window.confirm(
    `Remove “${moduleItem.title}”?\n\n${reassignmentMessage}\n\nYou can undo this change afterward.`
  );
  if (!confirmed) return;
  clearMessage();
  recordOutlineChange();
  scheduleOutline.removeModule(state.outlineItems, moduleKey);
  rebuildSchedulePreview();
}

function addPreviewModule() {
  const modules = state.outlineItems.filter((item) => item.kind === "module");
  const lastModule = modules.at(-1);
  const moduleId = `custom_module_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  recordOutlineChange();
  scheduleOutline.addModule(state.outlineItems, {
    moduleId,
    title: "New module",
    trackId: lastModule?.trackId || null,
    trackTitle: lastModule?.trackTitle || ""
  });
  rebuildSchedulePreview();
  const nameInput = elements.schedulePreviewList.querySelector(`[data-outline-key="module:${moduleId}"] .schedule-preview-module-name`);
  nameInput?.focus();
  nameInput?.select();
}

function createPreviewModuleCard(moduleItem, moduleNumber, totalModules, contentId) {
  const card = document.createElement("article");
  card.className = "schedule-preview-module-card";
  card.draggable = true;
  card.dataset.outlineKey = moduleItem.key;

  const dragHandle = document.createElement("span");
  dragHandle.className = "schedule-preview-module-drag-handle";
  dragHandle.title = "Drag this module and all of its sessions";
  dragHandle.setAttribute("aria-hidden", "true");
  dragHandle.textContent = "⋮⋮";

  const number = document.createElement("span");
  number.className = "schedule-preview-module-number";
  number.textContent = `Module ${moduleNumber}`;

  const name = document.createElement("input");
  name.type = "text";
  name.className = "schedule-preview-module-name";
  name.value = moduleItem.title;
  name.maxLength = 120;
  name.setAttribute("aria-label", `Name for module ${moduleNumber}`);
  let renameSnapshot = null;
  name.addEventListener("focus", () => {
    renameSnapshot = cloneOutlineItems();
  });
  name.addEventListener("input", () => {
    scheduleOutline.renameModule(state.outlineItems, moduleItem.key, name.value);
    persistBuilderDraft();
  });
  name.addEventListener("change", () => {
    scheduleOutline.renameModule(state.outlineItems, moduleItem.key, name.value);
    commitOutlineChange(renameSnapshot);
    renameSnapshot = null;
    window.setTimeout(rebuildSchedulePreview, 0);
  });

  const count = document.createElement("span");
  count.className = "schedule-preview-module-count";
  const sessionCount = getModuleSessionCount(moduleItem.key);
  count.textContent = `${sessionCount} session${sessionCount === 1 ? "" : "s"}`;

  const controls = document.createElement("div");
  controls.className = "schedule-preview-module-controls";
  const up = createButton("↑", "btn-secondary compact-button icon-button");
  up.title = "Move module up";
  up.setAttribute("aria-label", `Move module ${moduleNumber} up`);
  up.disabled = moduleNumber === 1;
  up.addEventListener("click", () => movePreviewModule(moduleItem.key, -1));
  const down = createButton("↓", "btn-secondary compact-button icon-button");
  down.title = "Move module down";
  down.setAttribute("aria-label", `Move module ${moduleNumber} down`);
  down.disabled = moduleNumber === totalModules;
  down.addEventListener("click", () => movePreviewModule(moduleItem.key, 1));
  const remove = createButton("Remove", "btn-secondary compact-button schedule-preview-module-remove");
  remove.title = totalModules === 1 ? "A schedule must contain at least one module" : "Remove this module";
  remove.disabled = totalModules === 1;
  remove.addEventListener("click", () => removePreviewModule(moduleItem.key));
  const collapse = createButton(moduleItem.collapsed ? "Show" : "Hide", "btn-secondary compact-button");
  collapse.setAttribute("aria-expanded", String(!moduleItem.collapsed));
  collapse.setAttribute("aria-controls", contentId);
  collapse.addEventListener("click", () => {
    moduleItem.collapsed = !moduleItem.collapsed;
    const group = card.closest(".schedule-preview-outline-module");
    const content = group?.querySelector(".schedule-preview-outline-collapse");
    group?.classList.toggle("is-collapsed", moduleItem.collapsed);
    collapse.textContent = moduleItem.collapsed ? "Show" : "Hide";
    collapse.setAttribute("aria-expanded", String(!moduleItem.collapsed));
    content?.setAttribute("aria-hidden", String(moduleItem.collapsed));
    if (content) content.inert = moduleItem.collapsed;
    persistBuilderDraft();
  });
  controls.append(up, down, remove, collapse);

  card.addEventListener("dragstart", (event) => {
    if (event.target.closest("input, button")) {
      event.preventDefault();
      return;
    }
    state.draggedOutlineItemKey = moduleItem.key;
    state.draggedOutlineItemKind = "module";
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", moduleItem.key);
  });
  card.addEventListener("dragover", (event) => {
    if (!state.draggedOutlineItemKey || state.draggedOutlineItemKey === moduleItem.key) return;
    event.preventDefault();
    updateDragAutoScroll(event);
    const position = state.draggedOutlineItemKind === "session" && moduleNumber === 1
      ? "after"
      : getDropPosition(card, event);
    showDropPosition(card, position);
  });
  card.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;
    clearDropPosition(card);
  });
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    const previousPositions = capturePreviewPositions();
    const position = card.dataset.dropPosition
      || (state.draggedOutlineItemKind === "session" && moduleNumber === 1
        ? "after"
        : getDropPosition(card, event));
    recordOutlineChange();
    if (state.draggedOutlineItemKind === "module") {
      const moveModule = position === "before"
        ? scheduleOutline.moveModuleBlockBefore
        : scheduleOutline.moveModuleBlockAfter;
      moveModule(state.outlineItems, state.draggedOutlineItemKey, moduleItem.key);
    } else if (state.draggedOutlineItemKind === "session") {
      const moveSession = position === "before"
        ? scheduleOutline.moveSessionBefore
        : scheduleOutline.moveSessionAfter;
      moveSession(state.outlineItems, state.draggedOutlineItemKey, moduleItem.key);
    }
    clearPreviewDragState();
    rebuildSchedulePreview({ animateFrom: previousPositions });
  });
  card.addEventListener("dragend", clearPreviewDragState);

  card.append(dragHandle, number, name, count, controls);
  return card;
}

function movePreviewSession(sessionKey, direction) {
  const previousPositions = capturePreviewPositions();
  recordOutlineChange();
  scheduleOutline.moveSessionByDirection(state.outlineItems, sessionKey, direction);
  rebuildSchedulePreview({ animateFrom: previousPositions });
}

function createPreviewRow(session, index, moduleItem, moduleNumber, outlineItem) {
  const row = document.createElement("article");
  row.className = "schedule-preview-row";
  row.draggable = true;
  row.dataset.outlineKey = outlineItem.key;

  const dragHandle = document.createElement("span");
  dragHandle.className = "schedule-preview-drag-handle";
  dragHandle.title = "Drag to reorder this session";
  dragHandle.setAttribute("aria-hidden", "true");
  dragHandle.textContent = "⋮⋮";

  const number = document.createElement("span");
  number.className = "schedule-preview-number";
  number.textContent = String(session.sessionNumber);

  const content = document.createElement("div");
  content.className = "schedule-preview-content";
  const title = session.planningHref ? document.createElement("a") : document.createElement("strong");
  title.textContent = session.title;
  if (session.planningHref) {
    title.href = session.planningHref;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.draggable = false;
  }
  const meta = document.createElement("span");
  meta.textContent = `${describeDateRange(session)} · Module ${moduleNumber}: ${moduleItem.title}`;
  content.append(title, meta);

  const controls = document.createElement("div");
  controls.className = "schedule-preview-controls";
  const up = createButton("↑", "btn-secondary compact-button icon-button");
  up.title = "Move session earlier";
  up.disabled = index === 0;
  up.addEventListener("click", () => movePreviewSession(outlineItem.key, -1));
  const down = createButton("↓", "btn-secondary compact-button icon-button");
  down.title = "Move session later";
  down.disabled = index === state.previewSchedule.sessions.length - 1;
  down.addEventListener("click", () => movePreviewSession(outlineItem.key, 1));
  controls.append(up, down);

  row.addEventListener("dragstart", (event) => {
    state.draggedOutlineItemKey = outlineItem.key;
    state.draggedOutlineItemKind = "session";
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", outlineItem.key);
  });
  row.addEventListener("dragover", (event) => {
    if (state.draggedOutlineItemKind !== "session" || state.draggedOutlineItemKey === outlineItem.key) return;
    event.preventDefault();
    updateDragAutoScroll(event);
    event.dataTransfer.dropEffect = "move";
    showDropPosition(row, getDropPosition(row, event));
  });
  row.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && row.contains(event.relatedTarget)) return;
    clearDropPosition(row);
  });
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    const previousPositions = capturePreviewPositions();
    const position = row.dataset.dropPosition || getDropPosition(row, event);
    recordOutlineChange();
    const moveSession = position === "before"
      ? scheduleOutline.moveSessionBefore
      : scheduleOutline.moveSessionAfter;
    moveSession(state.outlineItems, state.draggedOutlineItemKey, outlineItem.key);
    clearPreviewDragState();
    rebuildSchedulePreview({ animateFrom: previousPositions });
  });
  row.addEventListener("dragend", clearPreviewDragState);

  row.append(dragHandle, number, content, controls);
  return row;
}

function renderSchedulePreview() {
  clearElement(elements.schedulePreviewList);
  updateOutlineHistoryControls();
  const schedule = state.previewSchedule;
  const cadenceLabel = schedule.cadence.type === "day_interval"
    ? `${schedule.cadence.intervalDays}-day sessions`
    : `${schedule.cadence.meetingsPerWeek} meeting${schedule.cadence.meetingsPerWeek === 1 ? "" : "s"} per week`;
  elements.schedulePreviewSummary.textContent = `${schedule.sessions.length} sessions · ${formatPreviewDate(schedule.startDate)} to ${formatPreviewDate(schedule.endDate)} · ${cadenceLabel} · ${schedule.timeZone}`;
  let moduleItem = null;
  let moduleItemsContainer = null;
  let moduleNumber = 0;
  let sessionIndex = 0;
  const totalModules = scheduleOutline.listModules(state.outlineItems).length;

  state.outlineItems.forEach((outlineItem) => {
    if (outlineItem.kind === "module") {
      moduleItem = outlineItem;
      moduleNumber += 1;
      const group = document.createElement("section");
      group.className = "schedule-preview-outline-module";
      group.classList.toggle("is-collapsed", moduleItem.collapsed);
      const contentId = `schedule-preview-module-content-${moduleNumber}`;
      const collapse = document.createElement("div");
      collapse.id = contentId;
      collapse.className = "schedule-preview-outline-collapse";
      collapse.setAttribute("aria-hidden", String(moduleItem.collapsed));
      collapse.inert = moduleItem.collapsed;
      moduleItemsContainer = document.createElement("div");
      moduleItemsContainer.className = "schedule-preview-outline-items";
      collapse.appendChild(moduleItemsContainer);
      group.append(createPreviewModuleCard(moduleItem, moduleNumber, totalModules, contentId), collapse);
      elements.schedulePreviewList.appendChild(group);
      return;
    }
    if (outlineItem.kind !== "session" || !moduleItem || !moduleItemsContainer) return;
    const scheduledSession = schedule.sessions[sessionIndex];
    const currentSessionIndex = sessionIndex;
    sessionIndex += 1;
    if (!scheduledSession) return;
    moduleItemsContainer.appendChild(createPreviewRow(
      scheduledSession,
      currentSessionIndex,
      moduleItem,
      moduleNumber,
      outlineItem
    ));
  });
}

function updateCadenceVisibility() {
  const cadenceType = document.querySelector('input[name="cadenceType"]:checked')?.value;
  elements.intervalCadenceOptions.classList.toggle("hidden", cadenceType !== "day_interval");
  elements.weeklyCadenceOptions.classList.toggle("hidden", cadenceType !== "weekly_frequency");
  state.previewSchedule = null;
  persistBuilderDraft();
}

function updateWeekdaySelection() {
  clearMessage();
  state.previewSchedule = null;
  persistBuilderDraft();
}

function populateTimeZoneOptions() {
  const fallbackTimeZones = [
    "America/Sao_Paulo",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Asia/Tokyo",
    "Australia/Sydney"
  ];
  const timeZones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackTimeZones;

  clearElement(elements.timeZoneOptions);
  timeZones.forEach((timeZone) => {
    const option = document.createElement("option");
    option.value = timeZone;
    elements.timeZoneOptions.appendChild(option);
  });
}

function handlePreview() {
  clearMessage();
  if (!elements.scheduleName.value.trim()) {
    showMessage("Enter a schedule name.");
    elements.scheduleName.focus();
    return;
  }
  if (!elements.startDate.value) {
    showMessage("Choose a starting date.");
    elements.startDate.focus();
    return;
  }
  try {
    state.previewSchedule = buildPreviewSchedule();
  } catch (error) {
    showMessage(error.message);
    return;
  }
  renderSchedulePreview();
  showStep("preview");
}

function saveSchedule() {
  if (!state.previewSchedule) return;
  persistBuilderDraft();
  const savedAt = new Date().toISOString();
  try {
    const existingSchedule = JSON.parse(localStorage.getItem("kelpGeneratedSchedule") || "null");
    if (
      existingSchedule?.id === state.previewSchedule.id
      && Array.isArray(existingSchedule.styleRules)
    ) {
      state.previewSchedule.styleRules = existingSchedule.styleRules;
    }
  } catch (error) {
    console.error("Could not retain the existing schedule colors:", error);
  }
  localStorage.setItem("kelpGeneratedSchedule", JSON.stringify(state.previewSchedule));
  const progressStorageKey = `kelpGeneratedScheduleProgress_${state.previewSchedule.id}`;
  if (localStorage.getItem(progressStorageKey) === null) {
    localStorage.setItem(progressStorageKey, JSON.stringify({}));
  }
  localStorage.setItem("kelpGeneratedScheduleSavedAt", savedAt);
  window.location.href = "./generated-schedule.html";
}

function handleBack() {
  if (state.currentStep === "subject") {
    showStep("level");
    return;
  }
  if (state.currentStep === "track") {
    showStep("subject");
    return;
  }
  if (state.currentStep === "session") {
    if (state.activeTrackIndex > 0) {
      state.activeTrackIndex -= 1;
      renderTrackSessionSelection();
      showStep("session");
      return;
    }
    if (state.subject?.tracks.length === 1 && state.subject.tracks[0].isImplicit) {
      showStep("subject");
    } else {
      renderTracks();
      showStep("track");
    }
    return;
  }
  if (state.currentStep === "settings") {
    state.activeTrackIndex = Math.max(0, getSelectedTracks().length - 1);
    renderTrackSessionSelection();
    showStep("session");
    return;
  }
  if (state.currentStep === "preview") {
    showStep("settings");
  }
}

function trackHasSelections(track) {
  const hasBuiltInSession = track.modules.some((module) => {
    return module.sessions.some((session) => state.selectedSessionIds.has(session.id));
  });
  return hasBuiltInSession || state.customSessions.some((session) => session.trackId === track.id);
}

function beginTrackSessionSelection() {
  if (state.selectedTrackIds.size === 0) {
    showMessage("Choose at least one track.");
    return;
  }
  state.activeTrackIndex = 0;
  renderTrackSessionSelection();
  showStep("session");
}

function continueFromActiveTrack() {
  const track = getActiveTrack();
  const tracks = getSelectedTracks();
  if (!track || !trackHasSelections(track)) {
    showMessage(`Choose or add at least one session${track ? ` for ${track.title}` : ""}.`);
    return;
  }

  if (state.activeTrackIndex < tracks.length - 1) {
    state.activeTrackIndex += 1;
    elements.customSessionName.value = "";
    elements.customSessionLink.value = "";
    renderTrackSessionSelection();
    showStep("session");
    return;
  }

  state.orderedPlans = getSelectedSessionPlans();
  if (!elements.scheduleName.value) {
    elements.scheduleName.value = `${tracks.map((item) => item.title).join(" + ")} schedule`;
  }
  showStep("settings");
}

elements.addCustomSessionBtn.addEventListener("click", addCustomSession);
elements.continueToTrackSessionsBtn.addEventListener("click", beginTrackSessionSelection);
elements.continueToSettingsBtn.addEventListener("click", continueFromActiveTrack);
elements.previewScheduleBtn.addEventListener("click", handlePreview);
elements.addPreviewModuleBtn.addEventListener("click", addPreviewModule);
elements.undoPreviewOutlineBtn.addEventListener("click", undoOutlineChange);
elements.redoPreviewOutlineBtn.addEventListener("click", redoOutlineChange);
elements.saveScheduleBtn.addEventListener("click", saveSchedule);
elements.backStepBtn.addEventListener("click", handleBack);
document.addEventListener("dragover", (event) => {
  if (state.draggedOutlineItemKey) updateDragAutoScroll(event);
});

document.querySelectorAll('input[name="cadenceType"]').forEach((input) => {
  input.addEventListener("change", updateCadenceVisibility);
});
elements.weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
  input.addEventListener("change", updateWeekdaySelection);
});
[elements.scheduleName, elements.startDate, elements.studentTimeZone, elements.intervalDays].forEach((input) => {
  input.addEventListener("input", () => {
    state.previewSchedule = null;
    persistBuilderDraft();
  });
});

populateTimeZoneOptions();
renderLevels();
const restoredBuilderDraft = restoreBuilderDraft();
updateCadenceVisibility();
if (restoredBuilderDraft) {
  renderRestoredDraft();
} else {
  showStep("level");
}
