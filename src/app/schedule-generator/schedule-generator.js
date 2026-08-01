import { requireAuth } from "../../auth/auth-guard.js";
import {
  getCourseScheduleBuilderContext,
  publishCourseBuilderSchedule,
  setCourseSchedulePacingMode
} from "../../data/studentData.js";
import {
  createBuilderCoursePublication,
  normalizeCourseScheduleCadence,
  replacementScheduleStartFloor
} from "./course-schedule-adapter.js";
import {
  MULTI_BRANCH_DRAFT_SCHEMA_VERSION,
  classroomCoverageChangeState,
  classifyBuilderModuleStatus,
  classifyBuilderModulePresentationStatuses,
  classifyBuilderRetainedItemStatus,
  classifyBuilderSessionStatus,
  classifyCourseScheduleRevision,
  courseScheduleTrackRemovalState,
  courseDraftMatchesActiveVersion,
  createClassroomBuilderPreload,
  createReusablePlanCoverage,
  createSelectionTrayEntries,
  groupSubjectTracksByPathway,
  indexBuilderCatalog,
  normalizeBuilderDraftSelection,
  reconcileBuilderTrackSelection
} from "./multi-branch-builder-contract.js";

const catalog = globalThis.tracksCatalog || { schemaVersion: 1, levels: [] };
const catalogIndex = indexBuilderCatalog(catalog);
const scheduleDomain = globalThis.KelpScheduleDomain;
const scheduleOutline = globalThis.KelpScheduleOutline;
const locationParameters = new URL(window.location.href).searchParams;
const requestedCourseId = locationParameters.get("course") || "";
let builderDraftKey = requestedCourseId
  ? `kelpScheduleBuilderDraft:${requestedCourseId}`
  : "kelpScheduleBuilderDraft";
const builderRecoveryKey = requestedCourseId
  ? `kelpScheduleBuilderRecovery:${requestedCourseId}`
  : "";
let courseEditor = null;

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
  pathwayFilters: document.getElementById("pathwayFilters"),
  selectionTray: document.getElementById("selectionTray"),
  selectionTraySummary: document.getElementById("selectionTraySummary"),
  selectionTrayList: document.getElementById("selectionTrayList"),
  restoreCurrentPlanBtn: document.getElementById("restoreCurrentPlanBtn"),
  addContentBranchBtn: document.getElementById("addContentBranchBtn"),
  courseBuilderRecovery: document.getElementById("courseBuilderRecovery"),
  courseBuilderRecoveryToggle: document.getElementById("courseBuilderRecoveryToggle"),
  courseBuilderRecoveryCollapse: document.getElementById("courseBuilderRecoveryCollapse"),
  courseBuilderRecoverySummary: document.getElementById("courseBuilderRecoverySummary"),
  courseBuilderRecoveryList: document.getElementById("courseBuilderRecoveryList"),
  courseBuilderStaleDraft: document.getElementById("courseBuilderStaleDraft"),
  courseBuilderStaleDraftDetails: document.getElementById("courseBuilderStaleDraftDetails"),
  discardCourseBuilderRecovery: document.getElementById("discardCourseBuilderRecovery"),
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
  selectionFinishActions: document.getElementById("selectionFinishActions"),
  selectScheduleDatesBtn: document.getElementById("selectScheduleDatesBtn"),
  scheduleName: document.getElementById("scheduleName"),
  startDate: document.getElementById("startDate"),
  startDateHelp: document.getElementById("startDateHelp"),
  studentTimeZone: document.getElementById("studentTimeZone"),
  studentTimeZoneHelp: document.getElementById("studentTimeZoneHelp"),
  courseChangeReasonGroup: document.getElementById("courseChangeReasonGroup"),
  courseChangeReason: document.getElementById("courseChangeReason"),
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
  coursePublishBoundaryNotice: document.getElementById("coursePublishBoundaryNotice"),
  builderNavigationActions: document.getElementById("builderNavigationActions"),
  backStepBtn: document.getElementById("backStepBtn"),
  generatorMessage: document.getElementById("generatorMessage"),
  generatorTitle: document.getElementById("schedule-generator-title"),
  generatorDescription: document.getElementById("schedule-generator-description"),
  courseScheduleContext: document.getElementById("courseScheduleContext"),
  scheduleActionDialog: document.getElementById("scheduleActionDialog"),
  scheduleActionKicker: document.getElementById("scheduleActionKicker"),
  scheduleActionTitle: document.getElementById("scheduleActionTitle"),
  scheduleActionMessage: document.getElementById("scheduleActionMessage"),
  scheduleActionDetail: document.getElementById("scheduleActionDetail"),
  scheduleActionConfirm: document.getElementById("scheduleActionConfirm")
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
  primaryTrackId: null,
  pathwayFilter: "all",
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
  moduleDragJustEnded: false,
  coursePreload: null,
  courseLockedSessionIds: new Set(),
  courseSourceUpdateSessionIds: new Set(),
  scheduledSessionIdsBySourceId: new Map(),
  restoredDraft: null,
  staleRecoveryDraft: null,
  courseHierarchyActive: false,
  courseSettingsMode: null,
  startsNewSchedule: false,
  cadenceEdited: false,
  isInitializing: true
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

function setCourseBuilderRecoveryExpanded(expanded) {
  const isExpanded = Boolean(expanded);
  elements.courseBuilderRecovery.classList.toggle("is-collapsed", !isExpanded);
  elements.courseBuilderRecoveryToggle.setAttribute("aria-expanded", String(isExpanded));
  elements.courseBuilderRecoveryToggle.textContent = isExpanded ? "Minimize" : "Maximize";
  elements.courseBuilderRecoveryCollapse.setAttribute("aria-hidden", String(!isExpanded));
  elements.courseBuilderRecoveryCollapse.inert = !isExpanded;
}

function focusCurrentStep(stepName) {
  const heading = steps[stepName]?.querySelector("h2");
  if (!heading) return;
  heading.tabIndex = -1;
  requestAnimationFrame(() => heading.focus({ preventScroll: true }));
}

function createButton(text, className = "generator-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function confirmScheduleAction({
  kicker = "Schedule builder",
  title,
  message,
  detail = "",
  confirmLabel = "Continue",
  tone = "default"
}) {
  const dialog = elements.scheduleActionDialog;
  if (!dialog || typeof dialog.showModal !== "function") {
    showMessage("This browser cannot open the confirmation dialog. No changes were made.");
    return Promise.resolve(false);
  }
  if (dialog.open) dialog.close("cancel");
  elements.scheduleActionKicker.textContent = kicker;
  elements.scheduleActionTitle.textContent = title;
  elements.scheduleActionMessage.textContent = message;
  elements.scheduleActionDetail.textContent = detail;
  elements.scheduleActionDetail.hidden = !detail;
  elements.scheduleActionConfirm.textContent = confirmLabel;
  dialog.dataset.tone = tone;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "confirm");
    }, { once: true });
  });
}

function preserveViewportAfterLayout(previousScrollY, previousScrollX) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const maximumScrollY = Math.max(
        0,
        document.documentElement.scrollHeight - viewportHeight
      );
      const targetScrollY = Math.min(previousScrollY, maximumScrollY);
      if (Math.abs(window.scrollY - targetScrollY) > 1) {
        window.scrollTo({
          top: targetScrollY,
          left: previousScrollX,
          behavior: "auto"
        });
      }
    });
  });
}

function persistBuilderDraft() {
  try {
    const cadenceType =
      document.querySelector('input[name="cadenceType"]:checked')?.value || null;
    const pacingMode =
      document.querySelector('input[name="pacingMode"]:checked')?.value || "adaptive";
    const weekdays = Array.from(elements.weekdayGrid.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => Number(input.value));
    const draft = {
      schemaVersion: MULTI_BRANCH_DRAFT_SCHEMA_VERSION,
      courseId: courseEditor?.course?.id || null,
      baseActiveVersionId: courseEditor?.schedule?.activeVersionId || null,
      baseVersionNumber: courseEditor?.schedule?.versionNumber || null,
      currentStep: state.currentStep,
      browsing: {
        levelId: state.level?.id || null,
        subjectId: state.subject?.id || null
      },
      levelId: state.level?.id || null,
      subjectId: state.subject?.id || null,
      selectedTrackIds: Array.from(state.selectedTrackIds),
      primaryTrackId: state.primaryTrackId,
      activeTrackIndex: state.activeTrackIndex,
      activeTrackId: getActiveTrack()?.id || null,
      moduleOrderByTrack: Array.from(state.moduleOrderByTrack.entries()),
      selectedSessionIds: Array.from(state.selectedSessionIds),
      customSessions: state.customSessions,
      outlineItems: state.outlineItems,
      outlineHistory: state.outlineHistory,
      outlineFuture: state.outlineFuture,
      scheduleId: state.scheduleId,
      startsNewSchedule: state.startsNewSchedule,
      settings: {
        scheduleName: elements.scheduleName.value,
        startDate: elements.startDate.value,
        studentTimeZone: elements.studentTimeZone.value,
        courseChangeReason: elements.courseChangeReason.value,
        intervalDays: elements.intervalDays.value,
        cadenceType,
        pacingMode,
        weekdays,
        cadenceEdited: state.cadenceEdited
      },
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(builderDraftKey, JSON.stringify(draft));
  } catch (error) {
    console.error("Could not save the schedule builder draft:", error);
  }
}

function draftHasExplicitCadence(draft) {
  const settings = draft?.settings;
  if (!settings || typeof settings !== "object") return false;
  if (Object.hasOwn(settings, "cadenceEdited")) {
    return settings.cadenceEdited === true;
  }
  if (!["settings", "preview"].includes(draft.currentStep)) return false;
  if (settings.cadenceType === "weekly_frequency") {
    const weekdays = Array.isArray(settings.weekdays) ? settings.weekdays.map(Number) : [];
    return weekdays.length > 0
      && weekdays.length <= 7
      && weekdays.every((weekday) =>
        Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      );
  }
  if (settings.cadenceType === "day_interval") {
    const intervalDays = Number(settings.intervalDays);
    return Number.isInteger(intervalDays) && intervalDays >= 1 && intervalDays <= 365;
  }
  return false;
}

function restoreBuilderDraft() {
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(builderDraftKey) || "null");
  } catch (error) {
    console.error("Could not read the schedule builder draft:", error);
    return false;
  }
  const normalizedSelection = normalizeBuilderDraftSelection(draft, catalogIndex);
  if (!normalizedSelection) return false;
  state.restoredDraft = draft;

  const level = catalog.levels.find(
    (item) => item.id === normalizedSelection.browsing.levelId
  ) || null;
  const subject = level?.subjects.find(
    (item) => item.id === normalizedSelection.browsing.subjectId
  ) || null;
  state.level = level;
  state.subject = subject;
  state.selectedTrackIds = new Set(normalizedSelection.selectedTrackIds);
  state.primaryTrackId = normalizedSelection.primaryTrackId;
  const restoredTrackIds = getOrderedSelectedTrackIds();
  const legacyActiveTrackId = normalizedSelection.selectedTrackIds[
    Math.max(0, Number(draft.activeTrackIndex) || 0)
  ] || null;
  const restoredActiveTrackId = draft.activeTrackId || legacyActiveTrackId;
  state.activeTrackIndex = Math.max(0, restoredTrackIds.indexOf(restoredActiveTrackId));
  state.moduleOrderByTrack = new Map(Array.isArray(draft.moduleOrderByTrack) ? draft.moduleOrderByTrack : []);
  state.selectedSessionIds = new Set(normalizedSelection.selectedSessionIds);
  state.customSessions = Array.isArray(draft.customSessions) ? draft.customSessions : [];
  state.outlineItems = Array.isArray(draft.outlineItems) ? draft.outlineItems : [];
  state.outlineHistory = Array.isArray(draft.outlineHistory) ? draft.outlineHistory : [];
  state.outlineFuture = Array.isArray(draft.outlineFuture) ? draft.outlineFuture : [];
  state.scheduleId = draft.scheduleId || null;
  state.startsNewSchedule = draft.startsNewSchedule === true;
  state.cadenceEdited = draftHasExplicitCadence(draft);
  if (state.startsNewSchedule) {
    state.scheduledSessionIdsBySourceId = new Map();
  }

  const settings = draft.settings || {};
  elements.scheduleName.value = settings.scheduleName || "";
  elements.startDate.value = settings.startDate || "";
  elements.studentTimeZone.value = settings.studentTimeZone || elements.studentTimeZone.value;
  elements.courseChangeReason.value = settings.courseChangeReason || "";
  elements.intervalDays.value = settings.intervalDays || "7";
  const restoredCadenceType = Object.hasOwn(settings, "cadenceType")
    ? settings.cadenceType
    : "day_interval";
  document.querySelectorAll('input[name="cadenceType"]').forEach((input) => {
    input.checked = false;
  });
  const cadenceInput = restoredCadenceType
    ? document.querySelector(`input[name="cadenceType"][value="${restoredCadenceType}"]`)
    : null;
  if (cadenceInput) cadenceInput.checked = true;
  applyPacingMode(settings.pacingMode || "adaptive");
  const selectedWeekdays = new Set(settings.weekdays || []);
  elements.weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = selectedWeekdays.has(Number(input.value));
  });

  const allowedSteps = new Set(["level", "subject", "track", "session", "settings", "preview"]);
  state.currentStep = allowedSteps.has(draft.currentStep) ? draft.currentStep : "level";
  return true;
}

function renderRestoredDraft() {
  if (courseEditor && ["level", "subject", "track"].includes(state.currentStep)) {
    state.currentStep = "session";
  }
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
  const previousScrollY = window.scrollY;
  const previousScrollX = window.scrollX;
  state.currentStep = stepName;
  Object.values(steps).forEach((step) => step.classList.add("hidden"));
  steps[stepName].classList.remove("hidden");
  elements.builderNavigationActions.classList.toggle("hidden", stepName === "level");
  renderSelectionTray();
  clearMessage();
  persistBuilderDraft();
  if (!state.isInitializing) focusCurrentStep(stepName);
  preserveViewportAfterLayout(previousScrollY, previousScrollX);
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
  state.primaryTrackId = null;
  state.activeTrackIndex = 0;
  state.moduleOrderByTrack.clear();
  resetSessionWork();
}

function resetAfterLevel() {
  state.subject = null;
  state.pathwayFilter = "all";
}

function resetAfterSubject() {
  state.pathwayFilter = "all";
}

function getSelectedTracks() {
  return getOrderedSelectedTrackIds()
    .map((trackId) => catalogIndex.branchesByTrackId.get(trackId)?.track.source)
    .filter(Boolean);
}

function getSelectedTrackEntries() {
  return getOrderedSelectedTrackIds()
    .map((trackId) => catalogIndex.branchesByTrackId.get(trackId))
    .filter(Boolean);
}

function getOrderedSelectedTrackIds() {
  const trackIds = Array.from(state.selectedTrackIds);
  if (!state.primaryTrackId || !state.selectedTrackIds.has(state.primaryTrackId)) {
    return trackIds;
  }
  return [
    state.primaryTrackId,
    ...trackIds.filter((trackId) => trackId !== state.primaryTrackId)
  ];
}

function getActiveTrack() {
  return getSelectedTracks()[state.activeTrackIndex] || null;
}

function selectTrack(track) {
  state.selectedTrackIds.add(track.id);
  if (!state.primaryTrackId) state.primaryTrackId = track.id;
  ensureTrackModuleOrder(track);
}

async function removeTrack(track, { confirmRemoval = true } = {}) {
  const removalState = courseScheduleTrackRemovalState({
    trackId: track.id,
    selectedTrackIds: Array.from(state.selectedTrackIds),
    activeTrackIds: state.coursePreload?.selectedTrackIds || [],
    workedTrackIds: state.coursePreload?.workedTrackIds || []
  });
  if (removalState.action === "start_new_schedule") {
    const workedCount = countWorkedTrackSessions(track.id);
    if (confirmRemoval) {
      const confirmed = await confirmScheduleAction({
        kicker: "Worked Track",
        title: `Start a new Schedule without ${track.title}?`,
        message:
          `${workedCount} Session${workedCount === 1 ? "" : "s"} in this Track `
          + `${workedCount === 1 ? "has" : "have"} Studied, Practiced, or delivered work. `
          + "It cannot be removed as an ordinary revision.",
        detail:
          "The current Schedule, its Student progress, and its staff audit trail will remain "
          + "in History. The replacement will require a new start date and cadence.",
        confirmLabel: "Start new Schedule",
        tone: "danger"
      });
      if (!confirmed) return false;
    }
    resetTrackWork();
    state.startsNewSchedule = true;
    state.scheduledSessionIdsBySourceId = new Map();
    state.courseSettingsMode = "replacement";
    resetReplacementScheduleSettings();
    elements.courseChangeReason.value = "";
    return Object.freeze({
      removedTrackId: track.id,
      removedActiveTrack: true,
      activeTrackId: null,
      startedNewSchedule: true
    });
  }

  const selectedCount = countSelectedTrackSessions(track.id);
  if (confirmRemoval && selectedCount > 0) {
    const confirmed = await confirmScheduleAction({
      kicker: "Selected content",
      title: `Remove ${track.title}?`,
      message: `${selectedCount} selected item${selectedCount === 1 ? "" : "s"} from this Track will leave the draft.`,
      detail: "You can add the Track again before publishing.",
      confirmLabel: "Remove Track",
      tone: "danger"
    });
    if (!confirmed) return false;
  }
  const activeTrackId = getActiveTrack()?.id || null;
  const removedActiveTrack = activeTrackId === track.id;
  state.selectedTrackIds.delete(track.id);
  purgeTrackSelections(track);
  const reconciled = reconcileBuilderTrackSelection({
    index: catalogIndex,
    selectedTrackIds: Array.from(state.selectedTrackIds),
    selectedSessionIds: Array.from(state.selectedSessionIds),
    primaryTrackId: state.primaryTrackId,
    activeTrackId: removedActiveTrack ? null : activeTrackId
  });
  state.selectedTrackIds = new Set(reconciled.selectedTrackIds);
  state.selectedSessionIds = new Set(reconciled.selectedSessionIds);
  state.primaryTrackId = reconciled.primaryTrackId;
  state.activeTrackIndex = Math.max(
    0,
    getSelectedTracks().findIndex((track) => track.id === reconciled.activeTrackId)
  );
  reconcileOutlineAfterTrackSelectionChange();
  return Object.freeze({
    removedTrackId: track.id,
    removedActiveTrack,
    activeTrackId: reconciled.activeTrackId
  });
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
  if (state.primaryTrackId === track.id) {
    state.primaryTrackId = Array.from(state.selectedTrackIds)
      .find((trackId) => trackId !== track.id) || null;
  }
  state.orderedPlans = [];
  state.previewSchedule = null;
}

function reconcileOutlineAfterTrackSelectionChange() {
  if (!state.outlineItems.length) return;
  state.outlineItems = scheduleOutline.reconcileOutline(
    state.outlineItems,
    getSelectedSessionPlans()
  );
  state.orderedPlans = scheduleOutline.listPlans(state.outlineItems);
  state.outlineHistory = [];
  state.outlineFuture = [];
}

function countSelectedTrackSessions(trackId) {
  let count = 0;
  catalogIndex.sessionsById.forEach((entry, sessionId) => {
    if (entry.branch.track.id === trackId && state.selectedSessionIds.has(sessionId)) {
      count += 1;
    }
  });
  count += state.customSessions.filter((session) => session.trackId === trackId).length;
  return count;
}

function countWorkedTrackSessions(trackId) {
  return [
    ...(state.coursePreload?.retainedItems || []),
    ...(state.coursePreload?.missingSourceItems || [])
  ].filter((item) =>
    item.catalogTrackId === trackId
    && (item.isStudied || item.isPracticed || item.isDelivered)
  ).length;
}

function renderAfterTrackRemoval(track, removal) {
  const branch = catalogIndex.branchesByTrackId.get(track.id);
  if (
    state.selectedTrackIds.size === 0
    || (state.currentStep === "session" && removal.removedActiveTrack)
  ) {
    state.level = branch?.educationLevel.source || state.level;
    state.subject = branch?.subject.source || state.subject;
    state.pathwayFilter = "all";
    state.courseHierarchyActive = Boolean(courseEditor);
    renderTracks();
    showStep("track");
    if (removal.startedNewSchedule) {
      showMessage(
        "Choose the Track or Tracks for the replacement Schedule. "
        + "Its previous plan and worked progress remain in History.",
        "success"
      );
    }
    return;
  }

  if (state.currentStep === "session") {
    renderTrackSessionSelection();
    showStep("session");
    return;
  }

  if (state.currentStep === "preview") {
    try {
      state.previewSchedule = buildPreviewSchedule();
      renderSchedulePreview();
      renderSelectionTray();
      persistBuilderDraft();
    } catch (error) {
      showStep("settings");
      showMessage("The Track was removed. Review the remaining Schedule before previewing it again.");
    }
    return;
  }

  if (state.currentStep === "track") renderTracks();
  renderSelectionTray();
  persistBuilderDraft();
}

function renderSelectionTray() {
  const entries = createSelectionTrayEntries({
    index: catalogIndex,
    selectedTrackIds: Array.from(state.selectedTrackIds),
    selectedSessionIds: Array.from(state.selectedSessionIds),
    primaryTrackId: state.primaryTrackId
  });
  elements.selectionTray.classList.toggle(
    "hidden",
    entries.length === 0 && !courseEditor
  );
  renderSelectionFinishAction(entries);
  elements.addContentBranchBtn.textContent = entries.length
    ? "Add another Track"
    : "Add a Track";
  renderRestoreCurrentPlanAction();
  clearElement(elements.selectionTrayList);
  if (!entries.length) {
    elements.selectionTraySummary.textContent =
      "No Tracks are selected. Add a Track to rebuild the Course plan.";
    return;
  }

  const selectedSessionCount = entries.reduce(
    (total, entry) => total + countSelectedTrackSessions(entry.track.id),
    0
  );
  elements.selectionTraySummary.textContent =
    `${entries.length} Track${entries.length === 1 ? "" : "s"} · `
    + `${selectedSessionCount} selected item${selectedSessionCount === 1 ? "" : "s"}`;

  entries.forEach((entry) => {
    const row = document.createElement("article");
    row.className = "builder-selection-tray-item";
    row.classList.toggle("is-primary", entry.role === "primary");

    const content = document.createElement("div");
    content.className = "builder-selection-tray-content";
    const role = document.createElement("span");
    role.className = "builder-selection-role";
    role.textContent = entry.role === "primary" ? "Primary Track" : "Supporting Track";
    const title = document.createElement("strong");
    title.textContent = entry.track.title;
    const path = document.createElement("span");
    path.className = "builder-selection-path";
    path.textContent = [
      entry.educationLevel.title,
      entry.subject.title,
      entry.academicPathway?.title
    ].filter(Boolean).join(" · ");
    const count = document.createElement("span");
    count.className = "builder-selection-count";
    const actualCount = countSelectedTrackSessions(entry.track.id);
    const retainedCount = state.coursePreload?.retainedItems.filter(
      (item) => item.catalogTrackId === entry.track.id
    ).length || 0;
    const workedCount = countWorkedTrackSessions(entry.track.id);
    count.textContent = courseEditor
      ? [
          `${actualCount} editable Session${actualCount === 1 ? "" : "s"}`,
          retainedCount
            ? `${retainedCount} retained historical item${retainedCount === 1 ? "" : "s"}`
            : null
        ].filter(Boolean).join(" · ")
      : actualCount
        ? `${actualCount} selected item${actualCount === 1 ? "" : "s"}`
        : "Choose at least one Session";
    content.append(role, title, path, count);

    const actions = document.createElement("div");
    actions.className = "builder-selection-actions";
    const editButton = createButton("Edit Sessions", "btn-secondary compact-button");
    editButton.addEventListener("click", () => {
      state.courseHierarchyActive = false;
      state.level = entry.educationLevel.source;
      state.subject = entry.subject.source;
      state.activeTrackIndex = getSelectedTracks().findIndex(
        (track) => track.id === entry.track.id
      );
      renderTrackSessionSelection();
      showStep("session");
    });
    actions.appendChild(editButton);

    if (entry.role !== "primary") {
      const primaryButton = createButton("Make primary", "btn-secondary compact-button");
      primaryButton.addEventListener("click", () => {
        const activeTrackId = getActiveTrack()?.id || null;
        state.primaryTrackId = entry.track.id;
        state.activeTrackIndex = Math.max(
          0,
          getSelectedTracks().findIndex((track) => track.id === activeTrackId)
        );
        state.previewSchedule = null;
        if (state.currentStep === "session") renderTrackSessionSelection();
        renderSelectionTray();
        persistBuilderDraft();
      });
      actions.appendChild(primaryButton);
    }

    const removeButton = createButton("Remove", "btn-secondary compact-button");
    const removalState = courseScheduleTrackRemovalState({
      trackId: entry.track.id,
      selectedTrackIds: Array.from(state.selectedTrackIds),
      activeTrackIds: state.coursePreload?.selectedTrackIds || [],
      workedTrackIds: state.coursePreload?.workedTrackIds || []
    });
    if (removalState.action === "start_new_schedule") {
      removeButton.textContent = "Start new Schedule";
      removeButton.title =
        `${workedCount} worked Session${workedCount === 1 ? "" : "s"} must remain `
        + "with the current Schedule history.";
    }
    removeButton.addEventListener("click", async () => {
      const track = entry.track.source;
      const removal = await removeTrack(track);
      if (!removal) return;
      renderAfterTrackRemoval(track, removal);
    });
    actions.appendChild(removeButton);
    row.append(content, actions);
    elements.selectionTrayList.appendChild(row);
  });
}

function renderRestoreCurrentPlanAction() {
  elements.restoreCurrentPlanBtn.classList.toggle("hidden", !courseEditor);
  if (!courseEditor) return;
  const sameTracks = sameStringSet(
    state.selectedTrackIds,
    state.coursePreload?.selectedTrackIds || []
  );
  const sameSessions = sameStringSet(
    state.selectedSessionIds,
    state.coursePreload?.selectedSessionIds || []
  );
  elements.restoreCurrentPlanBtn.disabled =
    !state.startsNewSchedule && sameTracks && sameSessions;
}

function sameStringSet(left, right) {
  const leftValues = Array.from(left || []).map(String).sort();
  const rightValues = Array.from(right || []).map(String).sort();
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
}

function restoreCurrentCoursePlan() {
  if (!courseEditor || !state.coursePreload) return;
  localStorage.removeItem(builderDraftKey);
  state.restoredDraft = null;
  resetTrackWork();
  state.scheduledSessionIdsBySourceId = new Map(
    Object.entries(state.coursePreload.scheduledSessionIdsBySourceId || {})
  );
  prepareNewCourseDraft();
  showMessage(
    "The currently published Schedule was restored to this draft.",
    "success"
  );
}

function renderSelectionFinishAction(entries = []) {
  const selectingContent = ["level", "subject", "track", "session"]
    .includes(state.currentStep);
  elements.selectionFinishActions.classList.toggle(
    "hidden",
    !selectingContent || entries.length === 0
  );
}

function renderCourseBuilderRecovery() {
  if (!courseEditor || !state.coursePreload) {
    elements.courseBuilderRecovery.classList.add("hidden");
    setCourseBuilderRecoveryExpanded(false);
    return;
  }

  const preload = state.coursePreload;
  const editableCount = preload.selectedSessionIds.length;
  const historicalCount = preload.retainedItems.length;
  const issueCount = preload.missingBranches.length
    + preload.missingSourceItems.length
    + preload.sourceUpdates.length;
  elements.courseBuilderRecovery.classList.remove("hidden");
  elements.courseBuilderRecoverySummary.textContent = [
    `${editableCount} editable Session${editableCount === 1 ? "" : "s"}`,
    `${historicalCount} retained historical item${historicalCount === 1 ? "" : "s"}`,
    issueCount ? `${issueCount} source notice${issueCount === 1 ? "" : "s"}` : null
  ].filter(Boolean).join(" · ");
  clearElement(elements.courseBuilderRecoveryList);

  [...preload.retainedItems]
    .sort((first, second) =>
      retainedItemRank(first) - retainedItemRank(second)
      || first.scheduledDate.localeCompare(second.scheduledDate)
      || first.title.localeCompare(second.title)
    )
    .forEach((item) => {
      appendCourseRecoveryRow({
        status: item.lockReason || "Retained",
        title: item.title,
        context: builderAcademicContextLabel(item.academicContext),
        description: `${item.scheduledDate} · retained in Schedule history and locked from editing`,
        tone: retainedItemTone(item)
      });
    });
  preload.missingBranches.forEach((branch) => {
    appendCourseRecoveryRow({
      status: "Track source unavailable",
      title: branch.track.name,
      context: [
        branch.educationLevel.name,
        branch.subject.name,
        branch.academicPathways.map((pathway) => pathway.name).join(" + "),
        branch.track.name
      ].filter(Boolean).join(" · "),
      description: "Retained from the active Version.",
      tone: "warning"
    });
  });
  preload.missingSourceItems.forEach((item) => {
    appendCourseRecoveryRow({
      status: "Session source unavailable",
      title: item.title,
      context: builderAcademicContextLabel(item.academicContext),
      description: item.locked
        ? `${item.scheduledDate} · the stored snapshot remains immutable`
        : `${item.scheduledDate} · the stored future snapshot is retained until staff explicitly resolve it`,
      tone: "warning"
    });
  });
  preload.sourceUpdates.forEach((item) => {
    appendCourseRecoveryRow({
      status: "Updated from Track",
      title: stripLegacySessionPrefix(item.title),
      context: builderAcademicContextLabel(item.academicContext),
      description: "The current draft uses the latest Track source; retained history keeps its original content version.",
      tone: "updated"
    });
  });

  renderStaleCourseDraft();
}

function retainedItemRank(item) {
  return {
    studied: 0,
    practiced: 1,
    delivered: 2,
    past: 3,
    dropped: 4
  }[item?.retainedStatus || classifyBuilderRetainedItemStatus(item)] ?? 4;
}

function retainedItemTone(item) {
  return item?.retainedStatus || classifyBuilderRetainedItemStatus(item);
}

function builderAcademicContextLabel(context) {
  if (!context) return "";
  const seen = new Set();
  return [
    context.educationLevel,
    context.subject,
    ...(Array.isArray(context.academicPathways) ? context.academicPathways : []),
    context.track,
    context.module
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" \u00b7 ");
}

function retainedStatusLabel(item) {
  const status = item?.retainedStatus || classifyBuilderRetainedItemStatus(item);
  return {
    studied: "Studied history",
    practiced: "Practiced history",
    dropped: "Dropped history",
    delivered: "Delivered history",
    past: "Past history",
    retained: "Retained history"
  }[status] || "Retained history";
}

function appendCourseRecoveryRow({ status, title, context = "", description, tone }) {
  const row = document.createElement("article");
  row.className = `course-builder-recovery-item is-${tone}`;
  const badge = document.createElement("span");
  badge.className = "course-builder-recovery-badge";
  badge.textContent = status;
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const contextCopy = document.createElement("p");
  contextCopy.className = "course-builder-recovery-context";
  contextCopy.textContent = context;
  contextCopy.hidden = !context;
  const copy = document.createElement("p");
  copy.textContent = description;
  content.append(heading, contextCopy, copy);
  row.append(badge, content);
  elements.courseBuilderRecoveryList.appendChild(row);
}

function renderStaleCourseDraft() {
  const draft = state.staleRecoveryDraft;
  elements.courseBuilderStaleDraft.classList.toggle("hidden", !draft);
  if (!draft) {
    clearElement(elements.courseBuilderStaleDraftDetails);
    return;
  }
  clearElement(elements.courseBuilderStaleDraftDetails);
  const message = document.createElement("p");
  message.textContent =
    `This unsaved draft was based on Version ${draft.baseVersionNumber || "unknown"}, `
    + `not active Version ${courseEditor.schedule.versionNumber}. It was not merged.`;
  const details = document.createElement("ul");
  const selectedTracks = (draft.selectedTrackIds || [])
    .map((trackId) => catalogIndex.branchesByTrackId.get(trackId)?.track.title || trackId);
  const selectedSessions = (draft.selectedSessionIds || [])
    .map((sessionId) => catalogIndex.sessionsById.get(sessionId)?.session.title || sessionId);
  [
    `Saved: ${draft.savedAt ? new Date(draft.savedAt).toLocaleString() : "unknown"}`,
    `Name: ${draft.settings?.scheduleName || "Untitled draft"}`,
    `Tracks: ${selectedTracks.length ? selectedTracks.join(", ") : "none"}`,
    `Sessions: ${selectedSessions.length ? selectedSessions.map(stripLegacySessionPrefix).join(", ") : "none"}`
  ].forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    details.appendChild(item);
  });
  elements.courseBuilderStaleDraftDetails.append(message, details);
}

function renderLevels() {
  clearElement(elements.levelButtons);
  if (!catalog.levels?.length) {
    showMessage("No session catalogue was found. Regenerate the track data first.");
    return;
  }

  eligibleLevels().forEach((level) => {
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
  eligibleSubjects(state.level).forEach((subject) => {
    const button = createButton(subject.title);
    button.addEventListener("click", () => {
      const isSameSubject = state.subject?.id === subject.id;
      state.subject = subject;
      if (!isSameSubject) resetAfterSubject();
      if (subject.tracks.length === 1 && subject.tracks[0].isImplicit) {
        selectTrack(subject.tracks[0]);
        state.activeTrackIndex = getSelectedTracks().findIndex(
          (track) => track.id === subject.tracks[0].id
        );
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
  if (!state.level || !state.subject) return;
  clearElement(elements.trackButtons);
  clearElement(elements.pathwayFilters);
  const groups = groupSubjectTracksByPathway(catalogIndex, {
    levelId: state.level.id,
    subjectId: state.subject.id
  });
  const availablePathwayKeys = new Set(groups.map((group) => group.key));
  if (state.pathwayFilter !== "all" && !availablePathwayKeys.has(state.pathwayFilter)) {
    state.pathwayFilter = "all";
  }

  if (groups.length > 1) {
    const filters = [
      { key: "all", title: "All pathways" },
      ...groups.map((group) => ({ key: group.key, title: group.title }))
    ];
    filters.forEach((filter) => {
      const button = createButton(filter.title, "btn-secondary compact-button pathway-filter-button");
      const active = state.pathwayFilter === filter.key;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", () => {
        state.pathwayFilter = filter.key;
        renderTracks();
        persistBuilderDraft();
      });
      elements.pathwayFilters.appendChild(button);
    });
  }
  elements.pathwayFilters.classList.toggle("hidden", groups.length <= 1);

  groups
    .filter((group) => state.pathwayFilter === "all" || group.key === state.pathwayFilter)
    .forEach((group) => {
      const section = document.createElement("section");
      section.className = "pathway-track-group";
      const heading = document.createElement("h3");
      heading.className = "pathway-track-heading";
      heading.textContent = group.title;
      const list = document.createElement("div");
      list.className = "button-grid track-selection-grid";

      group.branches.forEach((branch) => {
        const track = branch.track.source;
        const button = createButton("", "generator-button track-selection-button");
        const headingRow = document.createElement("span");
        headingRow.className = "track-selection-heading";
        const title = document.createElement("span");
        title.className = "track-selection-title";
        title.textContent = track.title;
        headingRow.appendChild(title);
        if (state.primaryTrackId === track.id) {
          const badge = document.createElement("span");
          badge.className = "track-primary-badge";
          badge.textContent = "Primary";
          headingRow.appendChild(badge);
        }
        const description = document.createElement("span");
        description.className = "track-selection-description";
        description.textContent = track.description || "Open this Track's Modules and Sessions.";
        button.append(headingRow, description);
        button.classList.toggle("selected", state.selectedTrackIds.has(track.id));
        button.setAttribute("aria-pressed", String(state.selectedTrackIds.has(track.id)));
        button.addEventListener("click", async () => {
          if (state.selectedTrackIds.has(track.id)) {
            const removal = await removeTrack(track);
            if (!removal) return;
            renderAfterTrackRemoval(track, removal);
            return;
          } else {
            selectTrack(track);
          }
          state.previewSchedule = null;
          renderTracks();
          renderSelectionTray();
          persistBuilderDraft();
        });
        list.appendChild(button);
      });

      section.append(heading, list);
      elements.trackButtons.appendChild(section);
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

function createSessionSelectionCard(session, number, onSelectionChange = null) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-card generator-week-card";
  button.classList.toggle("selected", state.selectedSessionIds.has(session.id));
  button.setAttribute(
    "aria-pressed",
    String(state.selectedSessionIds.has(session.id))
  );
  const retainedItem = (state.coursePreload?.retainedItems || [])
    .find((item) => item.catalogSessionId === session.id) || null;
  const sourceUpdateItem = (state.coursePreload?.sourceUpdates || [])
    .find((item) => item.catalogSessionId === session.id) || null;
  const hasSourceUpdate = Boolean(sourceUpdateItem)
    || state.courseSourceUpdateSessionIds.has(session.id);
  const isLocked = Boolean(retainedItem?.locked)
    || state.courseLockedSessionIds.has(session.id);
  const isRestorableDropped = retainedItem?.retainedStatus === "dropped"
    && retainedItem?.canRestore === true;
  const isInherited = state.scheduledSessionIdsBySourceId.has(session.id)
    && !retainedItem
    && !hasSourceUpdate;
  const inheritedSessionIds = Array.from(state.scheduledSessionIdsBySourceId.keys());
  button.classList.toggle("is-retained", isLocked);
  button.classList.toggle("is-restorable-dropped", isRestorableDropped);
  button.classList.toggle("is-inherited", isInherited);
  button.classList.toggle("has-source-update", hasSourceUpdate);
  button.disabled = isLocked;

  let sourceStatusElement = null;
  const syncStatus = () => {
    const status = classifyBuilderSessionStatus({
      sessionId: session.id,
      selectedSessionIds: Array.from(state.selectedSessionIds),
      retainedItems: state.coursePreload?.retainedItems || [],
      sourceUpdateSessionIds: Array.from(state.courseSourceUpdateSessionIds),
      inheritedSessionIds
    });
    if (status === "none") {
      delete button.dataset.sessionStatus;
    } else {
      button.dataset.sessionStatus = status;
    }
    if (sourceStatusElement) {
      sourceStatusElement.textContent = status === "restored"
        ? "Restore on publish"
        : status === "updated"
          ? "Updated from Track"
          : isInherited
            ? "Previous version"
            : retainedItem
              ? retainedStatusLabel(retainedItem)
              : "";
      sourceStatusElement.dataset.sourceStatus = status === "none" && isInherited
        ? "inherited"
        : status;
    }
    return status;
  };

  const numberElement = document.createElement("span");
  numberElement.className = "link-number";
  numberElement.textContent = String(number);

  const titleWrapper = document.createElement("span");
  const titleElement = document.createElement("span");
  titleElement.className = "link-title";
  titleElement.textContent = stripLegacySessionPrefix(session.title);
  titleWrapper.appendChild(titleElement);
  const academicContext = builderAcademicContextLabel(
    retainedItem?.academicContext || sourceUpdateItem?.academicContext
  );
  const titleDetails = [];
  if (academicContext) {
    const context = document.createElement("span");
    context.className = "generator-session-academic-context";
    context.textContent = academicContext;
    titleWrapper.appendChild(context);
    titleDetails.push(academicContext);
  }
  if (isInherited) {
    titleDetails.push(
      "Previous version: this untouched Session is still included and may be removed."
    );
  } else if (isRestorableDropped) {
    titleDetails.push(
      "Dropped history: select this Session to restore it in the next Version."
    );
  }
  if (retainedItem || hasSourceUpdate || isInherited) {
    sourceStatusElement = document.createElement("span");
    sourceStatusElement.className = "generator-session-source-status";
    titleWrapper.appendChild(sourceStatusElement);
  }
  button.title = titleDetails.join(" \u00b7 ");
  syncStatus();

  button.append(numberElement, titleWrapper);
  button.addEventListener("click", () => {
    if (state.selectedSessionIds.has(session.id)) {
      state.selectedSessionIds.delete(session.id);
      button.classList.remove("selected");
    } else {
      state.selectedSessionIds.add(session.id);
      button.classList.add("selected");
    }
    button.setAttribute(
      "aria-pressed",
      String(state.selectedSessionIds.has(session.id))
    );
    syncStatus();
    state.orderedPlans = [];
    state.previewSchedule = null;
    renderSelectionTray();
    persistBuilderDraft();
    onSelectionChange?.();
  });
  return button;
}

function applySessionModuleStatus(section, toggle, module) {
  const statusInput = {
    sessionIds: module.sessions.map((session) => session.id),
    selectedSessionIds: Array.from(state.selectedSessionIds),
    retainedItems: state.coursePreload?.retainedItems || [],
    sourceUpdateSessionIds: Array.from(state.courseSourceUpdateSessionIds),
    inheritedSessionIds: Array.from(state.scheduledSessionIdsBySourceId.keys())
  };
  const status = classifyBuilderModuleStatus(statusInput);
  const presentationStatuses =
    classifyBuilderModulePresentationStatuses(statusInput);
  const descriptions = {
    studied: "contains studied Sessions",
    dropped: "contains dropped Sessions",
    mixed: "contains studied and dropped Sessions",
    selected: "contains selected, inherited, restored, or otherwise retained Sessions"
  };
  section.dataset.sessionStatus = status;
  if (presentationStatuses.length) {
    const colors = {
      studied: "#dff3e2",
      dropped: "#f5dfe2",
      former: "#fff2bd",
      recent: "#dcecff"
    };
    const accents = {
      studied: "#4e9d68",
      dropped: "#b85a64",
      former: "#c49324",
      recent: "#4b83c4"
    };
    const step = 100 / presentationStatuses.length;
    const stops = presentationStatuses.flatMap((presentationStatus, index) => {
      const start = Number((index * step).toFixed(4));
      const end = Number(((index + 1) * step).toFixed(4));
      const color = colors[presentationStatus];
      return [`${color} ${start}%`, `${color} ${end}%`];
    });
    const background = presentationStatuses.length === 1
      ? colors[presentationStatuses[0]]
      : `linear-gradient(90deg, ${stops.join(", ")})`;
    section.dataset.sessionPresentation = presentationStatuses.join(" ");
    section.style.setProperty("--builder-module-status-background", background);
    section.style.setProperty(
      "--builder-module-status-accent",
      accents[presentationStatuses[0]]
    );
  } else {
    delete section.dataset.sessionPresentation;
    section.style.removeProperty("--builder-module-status-background");
    section.style.removeProperty("--builder-module-status-accent");
  }
  if (descriptions[status]) {
    toggle.setAttribute("aria-label", `${module.title}: ${descriptions[status]}`);
    toggle.title = `${module.title}: ${descriptions[status]}`;
  } else {
    toggle.removeAttribute("aria-label");
    toggle.title = "Expand this module or drag it to change its order";
  }
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
      list.appendChild(createSessionSelectionCard(session, index + 1, () => {
        applySessionModuleStatus(section, toggle, module);
      }));
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
    applySessionModuleStatus(section, toggle, module);
    section.append(heading, collapse);
    elements.sessionSelectionList.appendChild(section);
  });
}

function renderTrackSessionSelection() {
  const tracks = getSelectedTracks();
  const track = getActiveTrack();
  if (!track) return;

  elements.trackSelectionProgress.textContent = courseEditor
    ? `Classroom content · active Version ${courseEditor.schedule.versionNumber}`
    : `Track ${state.activeTrackIndex + 1} of ${tracks.length}`;
  elements.trackSessionHeading.textContent = courseEditor
    ? `Choose sessions: ${track.title}`
    : `4. Choose sessions: ${track.title}`;
  elements.trackSessionDescription.textContent = courseEditor
    ? "Current eligible Sessions are preselected. Previous version identifies untouched inherited Sessions; dropped history may be selected for restoration."
    : track.description
      || "Choose sessions from this track's modules. Your selections remain saved as you move through the other tracks.";
  const hasNextTrack = state.activeTrackIndex < tracks.length - 1;
  elements.continueToSettingsBtn.classList.toggle("hidden", !hasNextTrack);
  if (hasNextTrack) {
    elements.continueToSettingsBtn.textContent =
      `Continue to ${tracks[state.activeTrackIndex + 1].title}`;
  }
  renderSessionSelection();
  renderCustomSessions();
  renderSelectionTray();
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
  renderSelectionTray();
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
      renderSelectionTray();
      persistBuilderDraft();
    });
    row.append(description, removeButton);
    elements.customSessionList.appendChild(row);
  });
}

function getSelectedSessionPlans() {
  const plans = [];

  getSelectedTracks().forEach((track) => {
    const branch = catalogIndex.branchesByTrackId.get(track.id);
    const branchContext = {
      educationLevelId: branch.educationLevel.id,
      educationLevelTitle: branch.educationLevel.title,
      educationLevelTaxonomySlug: branch.educationLevel.taxonomySlug,
      subjectId: branch.subject.id,
      subjectTitle: branch.subject.title,
      subjectTaxonomySlug: branch.subject.taxonomySlug,
      academicPathway: branch.academicPathway
        ? {
            id: branch.academicPathway.id,
            key: branch.academicPathway.key,
            title: branch.academicPathway.title,
            taxonomySlug: branch.academicPathway.taxonomySlug
          }
        : null,
      trackTaxonomySlug: branch.track.taxonomySlug
    };
    getOrderedTrackModules(track).forEach((module) => {
      module.sessions.forEach((session) => {
        if (!state.selectedSessionIds.has(session.id)) return;
        plans.push({
          scheduledSessionId: state.scheduledSessionIdsBySourceId.get(session.id) || null,
          sourceSessionId: session.id,
          trackId: track.id,
          trackTitle: track.title,
          moduleId: module.id,
          moduleTitle: module.title,
          title: stripLegacySessionPrefix(session.title),
          planningHref: session.planningHref,
          sourceContentVersionKey: session.sourceContentVersionKey,
          type: session.type || "lesson",
          difficulty: session.difficulty || "",
          ...branchContext
        });
      });
    });
    plans.push(...state.customSessions
      .filter((session) => session.trackId === track.id)
      .map((session) => ({ ...session, ...branchContext })));
  });

  return plans;
}

function getCadence() {
  const type = document.querySelector('input[name="cadenceType"]:checked')?.value;
  if (!type) throw new TypeError("Choose a Schedule cadence.");
  if (type === "weekly_frequency") {
    const weekdays = Array.from(elements.weekdayGrid.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => Number(input.value));
    return { type, weekdays };
  }
  return { type: "day_interval", intervalDays: Number(elements.intervalDays.value) };
}

function getPacingMode() {
  const mode = document.querySelector('input[name="pacingMode"]:checked')?.value;
  if (!["adaptive", "static"].includes(mode)) {
    throw new TypeError("Choose Adaptive or Static Schedule pacing.");
  }
  return mode;
}

function applyPacingMode(mode = "adaptive") {
  const normalized = mode === "static" ? "static" : "adaptive";
  document.querySelectorAll('input[name="pacingMode"]').forEach((input) => {
    input.checked = input.value === normalized;
  });
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
  const replacementMode = Boolean(
    courseEditor && courseRevisionMode() === "replacement"
  );
  const selectedPlans = getSelectedSessionPlans();
  state.outlineItems = scheduleOutline.reconcileOutline(state.outlineItems, selectedPlans);
  state.orderedPlans = scheduleOutline.listPlans(state.outlineItems);
  const selectedEntries = getSelectedTrackEntries();
  const primaryEntry = selectedEntries.find(
    (entry) => entry.track.id === state.primaryTrackId
  );
  if (!primaryEntry) {
    throw new TypeError("Choose a primary Track before previewing the Schedule.");
  }
  const coverage = createReusablePlanCoverage({
    index: catalogIndex,
    selectedTrackIds: Array.from(state.selectedTrackIds),
    selectedSessionIds: Array.from(state.selectedSessionIds),
    primaryTrackId: state.primaryTrackId
  });
  const includedTrackIds = new Set(coverage.branches.map((branch) => branch.track.key));
  const includedEntries = selectedEntries.filter((entry) => includedTrackIds.has(entry.track.id));
  const tracks = includedEntries.map((entry) => entry.track.source);
  const trackIds = includedEntries.map((entry) => entry.track.id);
  const trackTitles = includedEntries.map((entry) => entry.track.title);

  const schedule = scheduleDomain.buildSchedule({
    schemaVersion: MULTI_BRANCH_DRAFT_SCHEMA_VERSION,
    id: ensureScheduleId(),
    name: elements.scheduleName.value,
    startDate: elements.startDate.value,
    timeZone: elements.studentTimeZone.value,
    cadence: getCadence(),
    pacingMode: getPacingMode(),
    sessionPlans: state.orderedPlans,
    activeItems: courseEditor && !replacementMode
      ? courseEditor.schedule.items
      : [],
    today: courseEditor ? currentDateInTimeZone(courseStudentTimeZone()) : null,
    lockedStartDate: courseEditor && !replacementMode
      ? activeCourseScheduleStartDate(courseEditor)
      : null,
    modules: scheduleOutline.listModules(state.outlineItems),
    context: {
      levelId: primaryEntry.educationLevel.id,
      levelTitle: primaryEntry.educationLevel.title,
      subjectId: primaryEntry.subject.id,
      subjectTitle: primaryEntry.subject.title,
      subjectTaxonomySlug: primaryEntry.subject.taxonomySlug,
      trackId: primaryEntry.track.id,
      trackTitle: trackTitles.join(" + "),
      trackIds,
      trackTitles,
      trackTaxonomySlugs: includedEntries.map((entry) => entry.track.taxonomySlug),
      revisionMode: replacementMode
        ? "new_schedule"
        : "continuing_revision",
      combinedCadenceAuthority: true,
      coverage
    }
  });
  return schedule;
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

async function removePreviewModule(moduleKey) {
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
  const confirmed = await confirmScheduleAction({
    kicker: "Schedule outline",
    title: `Remove “${moduleItem.title}”?`,
    message: reassignmentMessage,
    detail: "You can undo this change afterward.",
    confirmLabel: "Remove module",
    tone: "danger"
  });
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
  remove.addEventListener("click", () => {
    void removePreviewModule(moduleItem.key);
  });
  const collapse = createButton(
    moduleItem.collapsed ? "Maximize" : "Minimize",
    "btn-secondary compact-button"
  );
  collapse.setAttribute("aria-expanded", String(!moduleItem.collapsed));
  collapse.setAttribute("aria-controls", contentId);
  collapse.addEventListener("click", () => {
    moduleItem.collapsed = !moduleItem.collapsed;
    const group = card.closest(".schedule-preview-outline-module");
    const content = group?.querySelector(".schedule-preview-outline-collapse");
    group?.classList.toggle("is-collapsed", moduleItem.collapsed);
    collapse.textContent = moduleItem.collapsed ? "Maximize" : "Minimize";
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
  const pacingLabel = schedule.pacingMode === "static"
    ? "Static pacing"
    : "Adaptive pacing";
  elements.schedulePreviewSummary.textContent = `${schedule.sessions.length} sessions · ${formatPreviewDate(schedule.startDate)} to ${formatPreviewDate(schedule.endDate)} · ${cadenceLabel} · ${pacingLabel} · ${schedule.timeZone}`;
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
  updateCoursePublishBoundary();
}

function getCoursePublishBoundary() {
  return classroomCoverageChangeState({
    preload: state.coursePreload,
    selectedTrackIds: Array.from(state.selectedTrackIds),
    selectedSessionIds: Array.from(state.selectedSessionIds),
    primaryTrackId: state.primaryTrackId
  });
}

function updateCoursePublishBoundary() {
  if (!courseEditor) {
    elements.coursePublishBoundaryNotice.classList.add("hidden");
    return;
  }
  const boundary = getCoursePublishBoundary();
  elements.saveScheduleBtn.disabled = false;
  elements.coursePublishBoundaryNotice.classList.toggle(
    "hidden",
    !boundary.requiresGovernedPublisher
  );
  if (!boundary.requiresGovernedPublisher) {
    elements.coursePublishBoundaryNotice.textContent = "";
    return;
  }
  const explanations = {
    coverage: "the draft changes the Classroom's Track coverage",
    primary_track: "the draft changes the primary Track",
    existing_multi_branch: "the active Version already contains multiple Tracks",
    track_source_update: "future work has a newer governed Track source",
    missing_future_source: "future work has a missing Track source that needs an explicit staff decision"
  };
  const details = boundary.reasons.map((reason) => explanations[reason]).filter(Boolean);
  elements.coursePublishBoundaryNotice.textContent =
    `Publication will validate the complete plan atomically because ${details.join("; ")}. `
    + "If any selected branch is outside the assigned Tutor's active qualifications, nothing will be published.";
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
  if (
    courseEditor
    && elements.startDate.min
    && elements.startDate.value < elements.startDate.min
  ) {
    showMessage(
      `Choose ${formatPreviewDate(elements.startDate.min)} or a later date. `
      + "The activated Course start remains part of its permanent history."
    );
    elements.startDate.focus();
    return;
  }
  const cadenceType = document.querySelector('input[name="cadenceType"]:checked')?.value;
  if (!cadenceType) {
    showMessage("Choose a Schedule cadence.");
    document.querySelector('input[name="cadenceType"]')?.focus();
    return;
  }
  if (courseEditor) {
    const reason = elements.courseChangeReason.value.trim();
    if (reason.length < 10 || reason.length > 500) {
      showMessage("Explain this Schedule update in 10 to 500 characters.");
      elements.courseChangeReason.focus();
      return;
    }
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

async function saveSchedule() {
  if (!state.previewSchedule) return;
  if (courseEditor) {
    await publishScheduleToCourse();
    return;
  }
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

async function publishScheduleToCourse() {
  elements.saveScheduleBtn.disabled = true;
  showMessage("Publishing the new immutable Course Schedule version...", "success");
  try {
    const publication = createBuilderCoursePublication({
      schedule: state.previewSchedule,
      course: {
        subject: courseEditor.course.subject,
        focus: courseEditor.course.focus
      },
      activeItems: courseEditor.schedule.items,
      activePacingMode: courseEditor.schedule.pacingPolicy?.mode || "adaptive",
      studentExplanation: elements.courseChangeReason.value.trim()
    });
    const result = publication.pacingPolicyOnly
      ? await setCourseSchedulePacingMode({
          courseId: courseEditor.course.id,
          expectedVersionId: courseEditor.schedule.activeVersionId,
          pacingMode: publication.builderSchedule.pacingMode,
          studentExplanation: elements.courseChangeReason.value.trim()
        })
      : await publishCourseBuilderSchedule({
          courseId: courseEditor.course.id,
          expectedVersionId: courseEditor.schedule.activeVersionId,
          builderSchedule: publication.builderSchedule,
          items: publication.items,
          changeReasons: publication.changeReasons
        });
    courseEditor.schedule.pacingPolicy =
      result.pacingPolicy || courseEditor.schedule.pacingPolicy;
    if (!publication.pacingPolicyOnly) {
      courseEditor.schedule.activeVersionId = result.publishedVersionId;
      courseEditor.schedule.versionNumber = result.versionNumber;
    }
    localStorage.removeItem(builderDraftKey);
    const returnTo = safeCourseReturnPath(locationParameters.get("returnTo"));
    window.location.assign(returnTo || classroomSchedulePath(courseEditor.course.id));
  } catch (error) {
    const message = error?.message || "The generated Course Schedule could not be published.";
    showMessage(
      /changed while this page was open|active schedule version/i.test(message)
        ? `${message} Return to the Classroom and reopen the Builder to load the latest version.`
        : message
    );
  } finally {
    updateCoursePublishBoundary();
  }
}

function handleBack() {
  if (courseEditor && state.currentStep === "session" && state.courseHierarchyActive) {
    renderTracks();
    showStep("track");
    return;
  }
  if (courseEditor && state.currentStep === "session") {
    window.location.assign(
      safeCourseReturnPath(locationParameters.get("returnTo"))
        || classroomSchedulePath(courseEditor.course.id)
    );
    return;
  }
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
  return track.modules.some((module) => {
    return module.sessions.some((session) => state.selectedSessionIds.has(session.id));
  });
}

function beginTrackSessionSelection() {
  if (state.selectedTrackIds.size === 0) {
    showMessage("Choose at least one Track.");
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
    showMessage(
      `Choose at least one governed Track Session${track ? ` for ${track.title}` : ""}. `
      + "Supplemental items do not establish curriculum coverage by themselves."
    );
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

  openScheduleSettings();
}

function openScheduleSettings() {
  const tracks = getSelectedTracks();
  const incompleteTrackIndex = tracks.findIndex((track) => !trackHasSelections(track));
  if (incompleteTrackIndex >= 0) {
    state.activeTrackIndex = incompleteTrackIndex;
    renderTrackSessionSelection();
    showStep("session");
    showMessage(
      `Choose at least one governed Track Session for ${tracks[incompleteTrackIndex].title}. `
      + "Supplemental items do not establish curriculum coverage by themselves."
    );
    return;
  }

  syncCourseRevisionSettings();
  state.orderedPlans = getSelectedSessionPlans();
  if (!elements.scheduleName.value) {
    elements.scheduleName.value = `${tracks.map((item) => item.title).join(" + ")} schedule`;
  }
  showStep("settings");
}

elements.addCustomSessionBtn.addEventListener("click", addCustomSession);
elements.restoreCurrentPlanBtn.addEventListener("click", restoreCurrentCoursePlan);
elements.addContentBranchBtn.addEventListener("click", () => {
  state.courseHierarchyActive = Boolean(courseEditor);
  state.level = null;
  state.subject = null;
  state.pathwayFilter = "all";
  renderLevels();
  showStep("level");
});
elements.continueToTrackSessionsBtn.addEventListener("click", beginTrackSessionSelection);
elements.continueToSettingsBtn.addEventListener("click", continueFromActiveTrack);
elements.selectScheduleDatesBtn.addEventListener("click", openScheduleSettings);
elements.previewScheduleBtn.addEventListener("click", handlePreview);
elements.addPreviewModuleBtn.addEventListener("click", addPreviewModule);
elements.undoPreviewOutlineBtn.addEventListener("click", undoOutlineChange);
elements.redoPreviewOutlineBtn.addEventListener("click", redoOutlineChange);
elements.saveScheduleBtn.addEventListener("click", saveSchedule);
elements.backStepBtn.addEventListener("click", handleBack);
elements.courseBuilderRecoveryToggle.addEventListener("click", () => {
  setCourseBuilderRecoveryExpanded(
    elements.courseBuilderRecoveryToggle.getAttribute("aria-expanded") !== "true"
  );
});
elements.discardCourseBuilderRecovery.addEventListener("click", () => {
  state.staleRecoveryDraft = null;
  if (builderRecoveryKey) localStorage.removeItem(builderRecoveryKey);
  renderCourseBuilderRecovery();
});
document.addEventListener("dragover", (event) => {
  if (state.draggedOutlineItemKey) updateDragAutoScroll(event);
});

document.querySelectorAll('input[name="cadenceType"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.cadenceEdited = true;
    updateCadenceVisibility();
  });
});
document.querySelectorAll('input[name="pacingMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    clearMessage();
    state.previewSchedule = null;
    persistBuilderDraft();
  });
});
elements.weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.cadenceEdited = true;
    updateWeekdaySelection();
  });
});
[
  elements.scheduleName,
  elements.startDate,
  elements.studentTimeZone,
  elements.courseChangeReason,
  elements.intervalDays
].forEach((input) => {
  input.addEventListener("input", () => {
    if (input === elements.intervalDays) state.cadenceEdited = true;
    state.previewSchedule = null;
    persistBuilderDraft();
  });
});

initializeBuilder().catch((error) => {
  console.error("Schedule Builder initialization failed:", error);
  showMessage(error?.message || "The Schedule Builder could not be initialized.");
  elements.saveScheduleBtn.disabled = true;
});

async function initializeBuilder() {
  populateTimeZoneOptions();
  if (requestedCourseId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedCourseId)) {
      throw new TypeError("A valid Course link is required.");
    }
    const current = await requireAuth(["teacher", "tutor", "mentor"]);
    if (!current) return;
    courseEditor = await getCourseScheduleBuilderContext(requestedCourseId);
    state.coursePreload = createClassroomBuilderPreload({
      context: courseEditor,
      index: catalogIndex,
      today: currentDateInTimeZone(courseEditor.schedule.timeZone || "UTC")
    });
    state.courseLockedSessionIds = new Set(state.coursePreload.lockedSessionIds);
    state.courseSourceUpdateSessionIds = new Set(
      state.coursePreload.sourceUpdates.map((item) => item.catalogSessionId)
    );
    state.scheduledSessionIdsBySourceId = new Map(
      Object.entries(state.coursePreload.scheduledSessionIdsBySourceId)
    );
    loadCourseBuilderRecovery();
    configureCourseEditor();
  }

  renderLevels();
  const restoredBuilderDraft = restoreBuilderDraft();
  syncCourseStudentTimeZone();
  updateCadenceVisibility();
  if (restoredBuilderDraft) {
    if (ensureRestoredCourseDraftMatches()) {
      renderRestoredDraft();
    } else {
      prepareNewCourseDraft();
    }
  } else if (courseEditor) {
    prepareNewCourseDraft();
  } else {
    showStep("level");
  }
  renderCourseBuilderRecovery();
  state.isInitializing = false;
}

function configureCourseEditor() {
  const { course, schedule } = courseEditor;
  setCourseBuilderRecoveryExpanded(false);
  elements.generatorTitle.textContent = `Edit ${course.title}`;
  elements.generatorDescription.textContent =
    "Build the next Version from governed Kelp Track Sessions. Current coverage is preloaded; retained history stays locked and the Student continues to receive one effective Schedule.";
  elements.courseScheduleContext.textContent = `${
    schedule.coverage?.displayLabel || `${course.subject.name} · ${course.focus.name}`
  } · editing from Version ${schedule.versionNumber}`;
  elements.courseScheduleContext.classList.remove("hidden");
  elements.courseChangeReasonGroup.classList.remove("hidden");
  elements.studentTimeZone.readOnly = true;
  elements.studentTimeZone.setAttribute("aria-readonly", "true");
  elements.studentTimeZoneHelp.textContent =
    "Retrieved automatically from the Student's governed Profile location.";
  elements.saveScheduleBtn.textContent = "Publish Course Schedule";
  elements.addContentBranchBtn.textContent = "Add content from another Track";
  elements.customSessionType.replaceChildren(
    new Option("Review", "review"),
    new Option("Exam", "assessment")
  );
  const homeLink = document.querySelector(".tracks-nav a");
  if (homeLink) {
    homeLink.textContent = "Return to Classroom";
    homeLink.href = safeCourseReturnPath(locationParameters.get("returnTo"))
      || classroomSchedulePath(course.id);
  }
}

function prepareNewCourseDraft() {
  const preload = state.coursePreload;
  const primary = preload?.resolvedBranches.find(
    ({ coverage }) => coverage.role === "primary"
  )?.catalog;
  const selection = primary
    ? {
        level: primary.educationLevel.source,
        subject: primary.subject.source,
        track: primary.track.source
      }
    : findCourseCatalogSelection();
  state.level = selection.level;
  state.subject = selection.subject;
  state.startsNewSchedule = false;
  state.cadenceEdited = false;
  state.selectedTrackIds = new Set(preload?.selectedTrackIds || [selection.track.id]);
  state.primaryTrackId = preload?.primaryTrackId || selection.track.id;
  state.selectedSessionIds = new Set(preload?.selectedSessionIds || []);
  getSelectedTracks().forEach(ensureTrackModuleOrder);
  state.activeTrackIndex = Math.max(
    0,
    getSelectedTracks().findIndex((track) => track.id === state.primaryTrackId)
  );
  elements.scheduleName.value = courseEditor.schedule.name || `${courseEditor.course.focus.name} schedule`;
  elements.studentTimeZone.value = courseStudentTimeZone();
  elements.startDate.value = activeCourseScheduleStartDate(courseEditor);
  elements.startDate.min = courseEditor.course.startDate || "";
  elements.courseChangeReason.value = "";
  applyCourseCadence(courseEditor.schedule.cadence);
  applyPacingMode(courseEditor.schedule.pacingPolicy?.mode || "adaptive");
  state.courseSettingsMode = courseRevisionMode();
  if (state.courseSettingsMode === "replacement") {
    resetReplacementScheduleSettings();
  } else {
    applyCourseScheduleSettingsAuthority();
  }
  renderTrackSessionSelection();
  showStep("session");
}

function syncCourseStudentTimeZone() {
  if (!courseEditor) return;
  elements.studentTimeZone.value = courseStudentTimeZone();
}

function courseStudentTimeZone() {
  return courseEditor?.course?.studentTimeZone
    || courseEditor?.schedule?.timeZone
    || "UTC";
}

function ensureRestoredCourseDraftMatches() {
  if (!courseEditor) return true;
  if (!courseDraftMatchesActiveVersion(state.restoredDraft, {
    courseId: courseEditor.course.id,
    activeVersionId: courseEditor.schedule.activeVersionId
  })) {
    preserveStaleCourseDraft(state.restoredDraft);
    localStorage.removeItem(builderDraftKey);
    resetTrackWork();
    state.restoredDraft = null;
    return false;
  }
  getSelectedTracks().forEach(ensureTrackModuleOrder);
  if (!state.primaryTrackId) state.primaryTrackId = state.coursePreload.primaryTrackId;
  state.courseSettingsMode = courseRevisionMode();
  if (state.courseSettingsMode !== "replacement" && !state.cadenceEdited) {
    applyCourseCadence(courseEditor.schedule.cadence);
  }
  applyCourseScheduleSettingsAuthority();
  return true;
}

function preserveStaleCourseDraft(draft) {
  if (!draft || !builderRecoveryKey) return;
  state.staleRecoveryDraft = draft;
  try {
    localStorage.setItem(builderRecoveryKey, JSON.stringify(draft));
  } catch (error) {
    console.error("Could not preserve the stale Course Schedule draft:", error);
  }
}

function loadCourseBuilderRecovery() {
  if (!builderRecoveryKey) return;
  try {
    state.staleRecoveryDraft = JSON.parse(
      localStorage.getItem(builderRecoveryKey) || "null"
    );
  } catch (error) {
    console.error("Could not read the Course Schedule recovery copy:", error);
    state.staleRecoveryDraft = null;
  }
}

function applyCourseCadence(cadence = {}) {
  const normalizedCadence = normalizeCourseScheduleCadence(cadence);
  const type = normalizedCadence.type;
  const cadenceInput = document.querySelector(`input[name="cadenceType"][value="${type}"]`);
  if (cadenceInput) cadenceInput.checked = true;
  if (type === "weekly_frequency") {
    const weekdays = new Set(normalizedCadence.weekdays);
    elements.weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = weekdays.has(Number(input.value));
    });
  } else {
    elements.intervalDays.value = String(normalizedCadence.intervalDays);
  }
  updateCadenceVisibility();
}

function courseRevisionMode() {
  if (!courseEditor) return null;
  if (state.startsNewSchedule) return "replacement";
  return classifyCourseScheduleRevision({
    activeTrackIds: state.coursePreload?.selectedTrackIds || [],
    selectedTrackIds: Array.from(state.selectedTrackIds)
  });
}

function syncCourseRevisionSettings() {
  if (!courseEditor) return;
  const nextMode = courseRevisionMode();
  if (nextMode === state.courseSettingsMode) {
    applyCourseScheduleSettingsAuthority();
    return;
  }
  state.courseSettingsMode = nextMode;
  state.cadenceEdited = false;
  elements.courseChangeReason.value = "";
  state.scheduleId = null;
  if (nextMode === "replacement") {
    resetReplacementScheduleSettings();
    return;
  }
  elements.scheduleName.value =
    courseEditor.schedule.name || `${courseEditor.course.focus.name} schedule`;
  elements.startDate.value = activeCourseScheduleStartDate(courseEditor);
  applyCourseCadence(courseEditor.schedule.cadence);
  applyPacingMode(courseEditor.schedule.pacingPolicy?.mode || "adaptive");
  applyCourseScheduleSettingsAuthority();
}

function resetReplacementScheduleSettings() {
  state.cadenceEdited = false;
  elements.scheduleName.value = "";
  elements.startDate.value = courseEditor
    ? replacementScheduleStartFloor({
        today: currentDateInTimeZone(courseStudentTimeZone())
      })
    : "";
  document.querySelectorAll('input[name="cadenceType"]').forEach((input) => {
    input.checked = false;
  });
  elements.intervalDays.value = "7";
  elements.weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
  applyPacingMode("adaptive");
  updateCadenceVisibility();
  applyCourseScheduleSettingsAuthority();
}

function applyCourseScheduleSettingsAuthority() {
  if (!courseEditor) return;
  const replacement = state.courseSettingsMode === "replacement";
  elements.startDate.disabled = !replacement;
  elements.startDate.setAttribute("aria-disabled", String(!replacement));
  if (!replacement) {
    elements.startDate.value = activeCourseScheduleStartDate(courseEditor);
    elements.startDate.min = courseEditor.course.startDate || "";
    elements.startDateHelp.textContent =
      "This active Course already started. Its historical start stays fixed; cadence changes recalculate future meetings and milestones only.";
    return;
  }
  const replacementStartFloor = replacementScheduleStartFloor({
    today: currentDateInTimeZone(courseStudentTimeZone())
  });
  elements.startDate.min = replacementStartFloor;
  if (
    !elements.startDate.value
    || elements.startDate.value < replacementStartFloor
  ) {
    elements.startDate.value = replacementStartFloor;
  }
  elements.startDateHelp.textContent =
    "This replacement begins a new active plan. A future plan start follows this date; an elapsed Course start remains historical. The former Schedule and its progress remain available in History.";
}

function findCourseCatalogSelection() {
  for (const level of catalog.levels || []) {
    const subject = (level.subjects || []).find(
      (candidate) => candidate.taxonomySlug === courseEditor.course.subject.slug
    );
    if (!subject) continue;
    const track = subject.tracks.find(
      (candidate) => candidate.taxonomySlug === courseEditor.course.focus.slug
    ) || (courseEditor.course.focus.slug === courseEditor.course.subject.slug ? subject.tracks[0] : null);
    if (track) return { level, subject, track };
  }
  throw new TypeError(
    `The Track catalogue does not contain ${courseEditor.course.subject.name} · ${courseEditor.course.focus.name}.`
  );
}

function eligibleLevels() {
  return catalog.levels || [];
}

function eligibleSubjects(level) {
  return level?.subjects || [];
}

function activeCourseScheduleStartDate(context) {
  const activeDates = (context.schedule.items || [])
    .filter((item) =>
      item.state !== "dropped"
      && item.scheduledDate
    )
    .map((item) => item.scheduledDate)
    .sort();
  const activeStart = activeDates[0] || "";
  const versionStart = context.schedule?.activeStartDate || "";
  const lockedStart = context.course?.startDate || "";
  return versionStart || activeStart || lockedStart;
}

function currentDateInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function safeCourseReturnPath(value) {
  const candidate = String(value || "").trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "";
  try {
    const resolved = new URL(candidate, window.location.origin);
    return resolved.origin === window.location.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : "";
  } catch (_error) {
    return "";
  }
}

function classroomSchedulePath(courseId) {
  const classroom = courseEditor?.course?.classroomId;
  if (classroom) {
    return `../classroom/classroom-space.html?classroom=${encodeURIComponent(classroom)}&area=schedule`;
  }
  return "../dashboard/tutor-dashboard.html";
}
