/* ===== DOM elements ===== */

const scheduleMatrixList = document.getElementById("scheduleMatrixList");
const generatedScheduleMessage = document.getElementById("generatedScheduleMessage");
const scheduleSummary = document.getElementById("scheduleSummary");
const scheduleDocumentTitle = document.getElementById("scheduleDocumentTitle");

const schedulePrintArea = document.getElementById("schedulePrintArea");

const editProgressBtn = document.getElementById("editProgressBtn");
const saveProgressBtn = document.getElementById("saveProgressBtn");
const discardProgressBtn = document.getElementById("discardProgressBtn");
const printScheduleBtn = document.getElementById("printScheduleBtn");
const scheduleSaveStatus = document.getElementById("scheduleSaveStatus");

const headerColorInput = document.getElementById("headerColorInput");
const headerColorField = document.getElementById("headerColorField");
const headerColorLabel = document.getElementById("headerColorLabel");
const stripeColorInput = document.getElementById("stripeColorInput");
const stripeColorField = document.getElementById("stripeColorField");
const scheduleColorEditorRow = document.getElementById("scheduleColorEditorRow");
const openColorTemplateBtn = document.getElementById("openColorTemplateBtn");
const colorTemplateDialog = document.getElementById("colorTemplateDialog");
const closeColorTemplateBtn = document.getElementById("closeColorTemplateBtn");
const colorTemplateGrid = document.getElementById("colorTemplateGrid");
const moduleColorTarget = document.getElementById("moduleColorTarget");
const addScheduleColorRuleBtn = document.getElementById("addScheduleColorRuleBtn");
const scheduleColorRuleList = document.getElementById("scheduleColorRuleList");

/* ===== State ===== */

const storageKey = "kelpGeneratedSchedule";
const savedAtKey = "kelpGeneratedScheduleSavedAt";
const scheduleDocument = loadScheduleDocument();
const progressKey = `kelpGeneratedScheduleProgress_${scheduleDocument.id || "legacy"}`;

let savedSchedule = mergeScheduleAndProgress(scheduleDocument.sessions, loadProgress());
let schedule = cloneSchedule(savedSchedule);
let editMode = false;
let hasUnsavedChanges = false;
let activePerceptionToggle = null;
let perceptionFloatingMenu = null;
let selectedColorTemplateName = null;

/* ===== Helpers ===== */

function cloneSchedule(scheduleItems) {
  return JSON.parse(JSON.stringify(scheduleItems || []));
}

function loadScheduleDocument() {
  const storedSchedule = localStorage.getItem(storageKey);

  if (!storedSchedule) {
    return { schemaVersion: 1, id: "", name: "Generated schedule", context: {}, sessions: [] };
  }

  try {
    const parsed = JSON.parse(storedSchedule);
    if (!Array.isArray(parsed)) {
      return {
        schemaVersion: parsed.schemaVersion || 1,
        id: parsed.id || "",
        name: parsed.name || "Generated schedule",
        startDate: parsed.startDate || "",
        endDate: parsed.endDate || "",
        timeZone: parsed.timeZone || "",
        cadence: parsed.cadence || null,
        context: parsed.context || {},
        modules: Array.isArray(parsed.modules) ? parsed.modules : [],
        styleRules: Array.isArray(parsed.styleRules) ? parsed.styleRules : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
      };
    }

    const first = parsed[0] || {};
    const last = parsed[parsed.length - 1] || {};
    return {
      schemaVersion: 0,
      id: first.scheduleId || "legacy_schedule",
      name: `${first.track || first.subject || "Custom"} Study Schedule`,
      startDate: first.date || "",
      endDate: last.date || "",
      timeZone: "",
      cadence: { type: "day_interval", intervalDays: 7 },
      context: {
        levelTitle: first.level || "",
        subjectTitle: first.subject || "",
        trackTitle: first.track || ""
      },
      modules: [],
      styleRules: [],
      sessions: parsed.map((item, index) => ({
        ...item,
        id: item.id || item.scheduleItemId || `legacy_session_${index + 1}`,
        sessionNumber: item.sessionNumber || item.week || index + 1,
        startDate: item.startDate || item.date,
        endDate: item.endDate || getEndDate(item.date),
        title: item.title || item.weekTopic || "Untitled session"
      }))
    };
  } catch (error) {
    console.error("Could not parse generated schedule:", error);
    return { schemaVersion: 1, id: "", name: "Generated schedule", context: {}, sessions: [] };
  }
}

function progressFromSessions(sessions) {
  const progress = {};
  sessions.forEach((item) => {
    progress[item.id] = {
      done: Boolean(item.done),
      workedOn: Boolean(item.workedOn),
      practiced: Boolean(item.practiced),
      perception: String(item.perception || "")
    };
  });
  return progress;
}

function loadProgress() {
  try {
    const storedProgress = localStorage.getItem(progressKey);
    if (storedProgress) return JSON.parse(storedProgress);
  } catch (error) {
    console.error("Could not parse schedule progress:", error);
  }
  return progressFromSessions(scheduleDocument.sessions);
}

function mergeScheduleAndProgress(sessions, progress) {
  return sessions.map((item) => ({
    ...item,
    ...(progress[item.id] || {
      done: false,
      workedOn: false,
      practiced: false,
      perception: ""
    })
  }));
}

function loadSavedAt() {
  return localStorage.getItem(savedAtKey);
}

function ensureSavedAtForLoadedSchedule() {
  if (schedule.length > 0 && !loadSavedAt()) {
    localStorage.setItem(savedAtKey, new Date().toISOString());
  }
}

function saveSchedule() {
  const savedAt = new Date().toISOString();
  localStorage.setItem(progressKey, JSON.stringify(progressFromSessions(schedule)));
  localStorage.setItem(savedAtKey, savedAt);

  savedSchedule = cloneSchedule(schedule);
  hasUnsavedChanges = false;
}

function formatSavedAt(value) {
  if (!value) {
    return "Last saved: Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Last saved: Not saved yet";
  }

  return `Last saved: ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date)}`;
}

function updateSaveStatus(note = "") {
  const savedLabel = formatSavedAt(loadSavedAt());
  scheduleSaveStatus.textContent = note ? `${savedLabel} · ${note}` : savedLabel;
}

function markUnsavedChanges() {
  hasUnsavedChanges = true;
  updateEditingControls();
  updateSaveStatus("Unsaved changes");
}

function showMessage(message, type = "error") {
  generatedScheduleMessage.textContent = message;
  generatedScheduleMessage.className = `message screen-only ${type}`;
}

function clearMessage() {
  generatedScheduleMessage.textContent = "";
  generatedScheduleMessage.className = "message screen-only";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSafePlanningHref(value) {
  const href = String(value || "").trim();
  return /^(https?:\/\/|\.\.?\/)/i.test(href) ? href : "";
}

const shortMonthNames = [
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  "May",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sept.",
  "Oct.",
  "Nov.",
  "Dec."
];

const difficultyLevels = {
  low: {
    symbol: "\u{1F7E2}",
    label: "low",
    description: "definitions or direct method application"
  },
  medium: {
    symbol: "\u{1F7E1}",
    label: "medium",
    description: "combines two concepts or requires further interpretation"
  },
  high: {
    symbol: "\u{1F534}",
    label: "high",
    description: "combines multiple concepts and requires multi-step reasoning"
  }
};

function getOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) {
    return "th";
  }

  const lastDigit = day % 10;

  if (lastDigit === 1) return "st";
  if (lastDigit === 2) return "nd";
  if (lastDigit === 3) return "rd";

  return "th";
}

function formatDisplayDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const day = date.getUTCDate();

  return `${shortMonthNames[date.getUTCMonth()]} ${day}${getOrdinalSuffix(day)}`;
}

function getDifficultyLevel(value = "") {
  const difficultyText = String(value).trim().toLowerCase();

  if (!difficultyText) {
    return "";
  }

  if (
    difficultyText.includes("\u{1F534}") ||
    difficultyText.includes("high") ||
    difficultyText.includes("multiple concepts") ||
    difficultyText.includes("multi-step") ||
    difficultyText.includes("complex") ||
    difficultyText.includes("challenging")
  ) {
    return "high";
  }

  if (
    difficultyText.includes("\u{1F7E2}") ||
    difficultyText.includes("low") ||
    difficultyText.includes("foundational") ||
    difficultyText.includes("definition") ||
    difficultyText.includes("direct method") ||
    difficultyText.includes("direct application") ||
    difficultyText.includes("manageable")
  ) {
    return "low";
  }

  return "medium";
}

function renderDifficulty(value) {
  const level = getDifficultyLevel(value);

  if (!level) {
    return "";
  }

  const difficulty = difficultyLevels[level];
  const label = `${difficulty.label}: ${difficulty.description}`;

  return `<span class="schedule-difficulty-symbol" title="${label}" aria-label="${label}">${difficulty.symbol}</span>`;
}

const perceptionOptions = [
  "",
  "very easy",
  "easy",
  "a bit hard",
  "hard",
  "very hard"
];

function formatPerceptionLabel(value = "") {
  return String(value)
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderPerceptionChoices(item) {
  const selectedPerception = String(item.perception || "").trim();
  const selectedLabel = formatPerceptionLabel(selectedPerception);
  const safePerception = escapeHtml(selectedPerception);
  const safeLabel = escapeHtml(selectedLabel);
  return `
    <div class="perception-menu" data-index="${item.originalIndex}">
      <button
        type="button"
        class="perception-menu-toggle"
        data-index="${item.originalIndex}"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="perception-floating-menu"
        data-value="${safePerception}"
        ${editMode ? "" : "disabled"}
      >${safeLabel || "Select"}</button>
      <span class="perception-print-value">${safeLabel}</span>
    </div>
  `;
}

function addDays(dateValue, numberOfDays) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + numberOfDays);

  return date.toISOString().split("T")[0];
}

function getEndDate(dateValue) {
  return addDays(dateValue, 6);
}

function getScheduleTitle() {
  return scheduleDocument.name || "Generated Schedule";
}

function getTrackLabel() {
  const context = scheduleDocument.context || {};
  const trackTitle = Array.isArray(context.trackTitles) && context.trackTitles.length > 0
    ? context.trackTitles.join(" + ")
    : context.trackTitle;
  return [context.levelTitle, context.subjectTitle, trackTitle]
    .filter(Boolean)
    .join(" · ");
}

function getSessionTopicMarkup(item) {
  const title = escapeHtml(item.title || item.weekTopic || "");
  const href = getSafePlanningHref(item.planningHref);
  if (!href) return title;
  return `<a class="schedule-session-link" href="${escapeHtml(href)}">${title}</a>`;
}

function groupScheduleByModule(scheduleItems) {
  const groups = [];
  const moduleNumbers = new Map();
  let nextModuleNumber = 1;

  scheduleItems.forEach((item, index) => {
    const originalModuleTitle = String(item.moduleTitle || "Custom sessions");
    const isCustomModule = !item.moduleId && /^Custom sessions$/i.test(originalModuleTitle);
    const moduleKey = item.moduleId || originalModuleTitle;
    let displayModuleTitle = originalModuleTitle;

    if (!isCustomModule) {
      if (!moduleNumbers.has(moduleKey)) {
        moduleNumbers.set(moduleKey, nextModuleNumber);
        nextModuleNumber += 1;
      }
      const titleWithoutNumber = originalModuleTitle
        .replace(/^Module\s+\d+\s*:\s*/i, "")
        .trim();
      displayModuleTitle = `Module ${moduleNumbers.get(moduleKey)}: ${titleWithoutNumber}`;
    }

    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.moduleKey !== moduleKey) {
      groups.push({
        moduleKey,
        moduleTitle: displayModuleTitle,
        items: [{ ...item, originalIndex: index }]
      });

      return;
    }

    lastGroup.items.push({ ...item, originalIndex: index });
  });

  return groups;
}

function updateStudied(index, checked) {
  schedule[index].workedOn = checked;
  markUnsavedChanges();
}

function updateDone(index, checked) {
  schedule[index].done = checked;
  markUnsavedChanges();
}

function updatePracticed(index, checked) {
  schedule[index].practiced = checked;
  markUnsavedChanges();
}

function updatePerception(index, value) {
  schedule[index].perception = value;
  markUnsavedChanges();
}

function updateEditingControls() {
  const hasSchedule = schedule.length > 0;

  editProgressBtn.classList.toggle("hidden", editMode);
  saveProgressBtn.classList.toggle("hidden", !editMode);
  discardProgressBtn.classList.toggle("hidden", !editMode);

  editProgressBtn.disabled = !hasSchedule;
  saveProgressBtn.disabled = !editMode || !hasUnsavedChanges;
  discardProgressBtn.disabled = !editMode;

  schedulePrintArea.classList.toggle("schedule-is-editing", editMode);
  schedulePrintArea.classList.toggle("schedule-is-locked", !editMode);
}

function enterEditMode() {
  if (schedule.length === 0) {
    return;
  }

  editMode = true;
  hasUnsavedChanges = false;
  schedule = cloneSchedule(savedSchedule);
  renderSchedule();
  updateEditingControls();
  updateSaveStatus("Editing mode");
  showMessage("Editing mode is on. Save or discard your changes.", "success");
}

function saveEdits() {
  if (!editMode || !hasUnsavedChanges) {
    return;
  }

  closePerceptionMenus();
  saveSchedule();
  editMode = false;
  renderSchedule();
  updateEditingControls();
  updateSaveStatus("Saved just now");
  showMessage("Schedule saved.", "success");
}

function discardEdits() {
  if (!editMode) {
    return;
  }

  closePerceptionMenus();
  schedule = cloneSchedule(savedSchedule);
  editMode = false;
  hasUnsavedChanges = false;
  renderSchedule();
  updateEditingControls();
  updateSaveStatus("Changes discarded");
  showMessage("Changes discarded.", "success");
}

function createPerceptionFloatingMenu() {
  if (perceptionFloatingMenu) {
    return perceptionFloatingMenu;
  }

  perceptionFloatingMenu = document.createElement("div");
  perceptionFloatingMenu.id = "perception-floating-menu";
  perceptionFloatingMenu.className = "perception-floating-menu";
  perceptionFloatingMenu.setAttribute("role", "listbox");
  perceptionFloatingMenu.setAttribute("aria-label", "Perceived difficulty");
  perceptionFloatingMenu.setAttribute("aria-hidden", "true");

  perceptionFloatingMenu.innerHTML = perceptionOptions.map((option) => {
    const optionLabel = option ? formatPerceptionLabel(option) : "Select";

    return `
      <button
        type="button"
        class="perception-option"
        data-value="${option}"
        role="option"
        aria-selected="false"
      >${optionLabel}</button>
    `;
  }).join("");

  perceptionFloatingMenu.addEventListener("click", (event) => {
    const optionButton = event.target.closest(".perception-option");

    if (!optionButton || !activePerceptionToggle || !editMode) {
      return;
    }

    const index = Number(activePerceptionToggle.dataset.index);
    const value = optionButton.dataset.value;
    const selectedLabel = formatPerceptionLabel(value);
    const menu = activePerceptionToggle.closest(".perception-menu");
    const printValue = menu.querySelector(".perception-print-value");

    updatePerception(index, value);
    activePerceptionToggle.textContent = selectedLabel || "Select";
    activePerceptionToggle.dataset.value = value;
    printValue.textContent = selectedLabel;
    hidePerceptionFloatingMenu();
  });

  document.body.appendChild(perceptionFloatingMenu);

  return perceptionFloatingMenu;
}

function updatePerceptionFloatingMenuSelection(value) {
  const menu = createPerceptionFloatingMenu();

  menu.querySelectorAll(".perception-option").forEach((button) => {
    const isSelected = button.dataset.value === value;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
  });
}

function positionPerceptionFloatingMenu() {
  if (!activePerceptionToggle || !perceptionFloatingMenu) {
    return;
  }

  const toggleRect = activePerceptionToggle.getBoundingClientRect();
  const menuWidth = Math.max(toggleRect.width, 148);
  const menuHeight = perceptionFloatingMenu.offsetHeight;
  const viewportPadding = 8;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const maxLeft = Math.max(viewportPadding, viewportWidth - menuWidth - viewportPadding);
  const left = Math.min(
    Math.max(toggleRect.left + (toggleRect.width - menuWidth) / 2, viewportPadding),
    maxLeft
  );
  const spaceBelow = viewportHeight - toggleRect.bottom;
  const shouldOpenUp = spaceBelow < menuHeight + 12 && toggleRect.top > menuHeight + 12;
  const top = shouldOpenUp
    ? Math.max(toggleRect.top - menuHeight - 6, viewportPadding)
    : Math.min(toggleRect.bottom + 6, viewportHeight - menuHeight - viewportPadding);

  perceptionFloatingMenu.style.width = `${menuWidth}px`;
  perceptionFloatingMenu.style.left = `${left}px`;
  perceptionFloatingMenu.style.top = `${top}px`;
  perceptionFloatingMenu.classList.toggle("open-up", shouldOpenUp);
}

function showPerceptionFloatingMenu(toggleButton) {
  if (!editMode) {
    return;
  }

  if (activePerceptionToggle === toggleButton && perceptionFloatingMenu?.classList.contains("open")) {
    hidePerceptionFloatingMenu();
    return;
  }

  hidePerceptionFloatingMenu();

  activePerceptionToggle = toggleButton;
  activePerceptionToggle.setAttribute("aria-expanded", "true");

  const menu = createPerceptionFloatingMenu();
  updatePerceptionFloatingMenuSelection(toggleButton.dataset.value || "");
  menu.setAttribute("aria-hidden", "false");
  positionPerceptionFloatingMenu();

  requestAnimationFrame(() => {
    menu.classList.add("open");
    positionPerceptionFloatingMenu();
  });
}

function hidePerceptionFloatingMenu() {
  if (activePerceptionToggle) {
    activePerceptionToggle.setAttribute("aria-expanded", "false");
  }

  if (perceptionFloatingMenu) {
    perceptionFloatingMenu.classList.remove("open", "open-up");
    perceptionFloatingMenu.setAttribute("aria-hidden", "true");
  }

  activePerceptionToggle = null;
}

function closePerceptionMenus() {
  hidePerceptionFloatingMenu();
}

const templateScheduleStyle = Object.freeze({
  headerColor: "#5FAE63",
  stripeColor: "#5FAE63"
});
const TITLE_STRIPE_TARGET = "__title_stripe__";
const scheduleColorTemplates = Object.freeze([
  { name: "Red", headerColor: "#EF9A9A", stripeColor: "#FFCDD2" },
  { name: "Pink", headerColor: "#F8BBD0", stripeColor: "#F48FB1" },
  { name: "Violet", headerColor: "#D1C4E9", stripeColor: "#B39DDB" },
  { name: "Blue", headerColor: "#90CAF9", stripeColor: "#BBDEFB" },
  { name: "Cyan", headerColor: "#80DEEA", stripeColor: "#B2EBF2" },
  { name: "Green", headerColor: "#A5D6A7", stripeColor: "#C8E6C9" },
  { name: "Lime", headerColor: "#DCE775", stripeColor: "#E6EE9C" },
  { name: "Yellow", headerColor: "#FFE082", stripeColor: "#FFF9C4" },
  { name: "Bright yellow", headerColor: "#FFEE58", stripeColor: "#FFF176" },
  { name: "Orange", headerColor: "#FFCC80", stripeColor: "#FFB74D" }
]);
const scheduleStyleKey = `kelpScheduleStyle_${scheduleDocument.id || "legacy"}`;

function normalizeHexColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function normalizeStyleRule(rule, index) {
  const target = rule.target === "title_stripe"
    ? "title_stripe"
    : rule.moduleId
      ? "module"
      : "schedule";

  if (target === "title_stripe") {
    return {
      id: rule.id || "style_rule_title_stripe",
      target,
      moduleId: null,
      titleStripeColor: normalizeHexColor(
        rule.titleStripeColor || rule.headerColor,
        templateScheduleStyle.headerColor
      ),
      templateName: null
    };
  }

  return {
    id: rule.id || `style_rule_${index + 1}`,
    target,
    moduleId: target === "module" ? rule.moduleId : null,
    headerColor: normalizeHexColor(rule.headerColor, templateScheduleStyle.headerColor),
    stripeColor: normalizeHexColor(rule.stripeColor, templateScheduleStyle.stripeColor),
    templateName: String(rule.templateName || "").trim() || null
  };
}

function updateColorTemplateButton() {
  openColorTemplateBtn.textContent = selectedColorTemplateName
    ? `${selectedColorTemplateName} template`
    : "Choose template";
}

function closeColorTemplateDialog() {
  if (typeof colorTemplateDialog.close === "function") {
    colorTemplateDialog.close();
  } else {
    colorTemplateDialog.removeAttribute("open");
  }
}

function selectColorTemplate(template) {
  selectedColorTemplateName = template.name;
  headerColorInput.value = template.headerColor;
  stripeColorInput.value = template.stripeColor;
  updateColorTemplateButton();
  closeColorTemplateDialog();
}

function renderColorTemplates() {
  colorTemplateGrid.replaceChildren();
  scheduleColorTemplates.forEach((template) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "schedule-color-template-option";
    button.classList.toggle("is-selected", template.name === selectedColorTemplateName);
    button.setAttribute("aria-pressed", String(template.name === selectedColorTemplateName));

    const preview = document.createElement("span");
    preview.className = "schedule-color-template-preview";
    preview.style.setProperty("--template-header-color", template.headerColor);
    preview.style.setProperty("--template-stripe-color", template.stripeColor);
    const name = document.createElement("strong");
    name.textContent = template.name;
    const values = document.createElement("small");
    values.textContent = `${template.headerColor} · ${template.stripeColor}`;
    button.append(preview, name, values);
    button.addEventListener("click", () => selectColorTemplate(template));
    colorTemplateGrid.appendChild(button);
  });
}

function openColorTemplateDialog() {
  renderColorTemplates();
  if (typeof colorTemplateDialog.showModal === "function") {
    colorTemplateDialog.showModal();
  } else {
    colorTemplateDialog.setAttribute("open", "");
  }
}

function loadScheduleStyle() {
  if (Array.isArray(scheduleDocument.styleRules) && scheduleDocument.styleRules.length > 0) {
    return { rules: scheduleDocument.styleRules.map(normalizeStyleRule) };
  }

  const storedStyle = localStorage.getItem(scheduleStyleKey) || localStorage.getItem("kelpScheduleStyle");
  if (!storedStyle) return { rules: [] };

  try {
    const parsedStyle = JSON.parse(storedStyle);
    if (Array.isArray(parsedStyle.rules)) {
      return { rules: parsedStyle.rules.map(normalizeStyleRule) };
    }
    if (parsedStyle.headerColor || parsedStyle.stripeColor) {
      return {
        rules: [normalizeStyleRule({
          id: "style_rule_global",
          moduleId: null,
          headerColor: parsedStyle.headerColor,
          stripeColor: parsedStyle.stripeColor
        }, 0)]
      };
    }
  } catch (error) {
    console.error("Could not parse schedule style:", error);
  }
  return { rules: [] };
}

function saveScheduleStyle(style) {
  scheduleDocument.styleRules = style.rules.map((rule) => ({ ...rule }));
  localStorage.setItem(scheduleStyleKey, JSON.stringify(style));
  localStorage.setItem(storageKey, JSON.stringify(scheduleDocument));
}

function hexToRgba(hex, alpha = 0.12) {
  const cleanHex = hex.replace("#", "");

  const red = parseInt(cleanHex.substring(0, 2), 16);
  const green = parseInt(cleanHex.substring(2, 4), 16);
  const blue = parseInt(cleanHex.substring(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function resolveScheduleStyle(style, moduleId = null) {
  const globalRule = style.rules.find((rule) => rule.target === "schedule");
  const moduleRule = moduleId
    ? style.rules.find((rule) => rule.target === "module" && rule.moduleId === moduleId)
    : null;
  return moduleRule || globalRule || templateScheduleStyle;
}

function getStyleRuleTargetValue(rule) {
  if (rule.target === "title_stripe") return TITLE_STRIPE_TARGET;
  return rule.target === "module" ? rule.moduleId : "";
}

function findStyleRule(style, targetValue) {
  return style.rules.find((rule) => getStyleRuleTargetValue(rule) === targetValue) || null;
}

function getModuleStyleLabel(targetValue) {
  if (targetValue === TITLE_STRIPE_TARGET) return "Header's stripe";
  if (!targetValue) return "Entire schedule";
  const option = Array.from(moduleColorTarget.options).find((item) => item.value === targetValue);
  return option?.textContent || "Selected module";
}

function getModuleStyleNumber(rule) {
  if (rule.target !== "module") return Number.MAX_SAFE_INTEGER;
  const match = getModuleStyleLabel(rule.moduleId).match(/\bModule\s+(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function compareScheduleStyleRules(first, second) {
  const rank = (rule) => {
    if (rule.target === "schedule") return 0;
    if (rule.target === "title_stripe") return 1;
    return 2;
  };
  const rankDifference = rank(first) - rank(second);
  if (rankDifference !== 0) return rankDifference;
  const moduleDifference = getModuleStyleNumber(first) - getModuleStyleNumber(second);
  if (moduleDifference !== 0) return moduleDifference;
  return getModuleStyleLabel(first.moduleId).localeCompare(getModuleStyleLabel(second.moduleId), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function sortScheduleStyleRules(rules) {
  return [...rules].sort(compareScheduleStyleRules);
}

function resolveTitleStripeColor(style, fallbackColor) {
  const titleStripeRule = style.rules.find((rule) => rule.target === "title_stripe");
  return titleStripeRule?.titleStripeColor || fallbackColor;
}

function syncScheduleColorEditor(style) {
  const targetValue = moduleColorTarget.value;
  const isTitleStripe = targetValue === TITLE_STRIPE_TARGET;
  scheduleColorEditorRow.classList.toggle("is-title-stripe-target", isTitleStripe);
  stripeColorField.classList.toggle("hidden", isTitleStripe);
  openColorTemplateBtn.closest(".schedule-color-template-field")?.classList.toggle("hidden", isTitleStripe);
  headerColorLabel.textContent = isTitleStripe ? "Header stripe color" : "Header color";

  if (isTitleStripe) {
    const firstModule = scheduleMatrixList.querySelector(".schedule-matrix-section");
    const fallback = firstModule
      ? resolveScheduleStyle(style, firstModule.dataset.moduleId).headerColor
      : resolveScheduleStyle(style).headerColor;
    headerColorInput.value = resolveTitleStripeColor(style, fallback);
    selectedColorTemplateName = null;
    updateColorTemplateButton();
    return;
  }

  const editorStyle = resolveScheduleStyle(style, targetValue || null);
  headerColorInput.value = editorStyle.headerColor;
  stripeColorInput.value = editorStyle.stripeColor;
  selectedColorTemplateName = editorStyle.templateName || null;
  updateColorTemplateButton();
}

function renderScheduleStyleRules(style) {
  scheduleColorRuleList.replaceChildren();
  sortScheduleStyleRules(style.rules).forEach((rule) => {
    const isTitleStripe = rule.target === "title_stripe";
    const titleStripeColor = isTitleStripe ? rule.titleStripeColor : null;
    const card = document.createElement("article");
    card.className = "schedule-color-rule-card";
    card.classList.toggle("is-title-stripe-rule", isTitleStripe);
    card.style.setProperty("--rule-header-color", titleStripeColor || rule.headerColor);
    card.style.setProperty("--rule-stripe-color", titleStripeColor || rule.stripeColor);

    const labelGroup = document.createElement("span");
    labelGroup.className = "schedule-color-rule-label";
    const label = document.createElement("strong");
    label.textContent = getModuleStyleLabel(getStyleRuleTargetValue(rule));
    const scope = document.createElement("small");
    scope.textContent = isTitleStripe
      ? "Title underline override"
      : rule.target === "module"
        ? "Module override"
        : "Schedule default";
    const templateName = document.createElement("span");
    templateName.className = "schedule-color-rule-template";
    templateName.textContent = isTitleStripe
      ? "Custom color"
      : rule.templateName
        ? `${rule.templateName} template`
        : "Custom colors";
    labelGroup.append(label, scope, templateName);
    const colors = document.createElement("span");
    colors.className = "schedule-color-rule-swatches";
    if (isTitleStripe) {
      const titleStripeValue = document.createElement("span");
      titleStripeValue.className = "schedule-color-rule-value";
      const titleStripeSwatch = document.createElement("i");
      titleStripeSwatch.style.setProperty("--rule-color", titleStripeColor);
      titleStripeValue.append(titleStripeSwatch, `Underline ${titleStripeColor.toUpperCase()}`);
      colors.append(titleStripeValue);
    } else {
      const headerValue = document.createElement("span");
      headerValue.className = "schedule-color-rule-value";
      const headerSwatch = document.createElement("i");
      headerSwatch.style.setProperty("--rule-color", rule.headerColor);
      headerValue.append(headerSwatch, `Header ${rule.headerColor.toUpperCase()}`);
      const stripeValue = document.createElement("span");
      stripeValue.className = "schedule-color-rule-value";
      const stripeSwatch = document.createElement("i");
      stripeSwatch.style.setProperty("--rule-color", rule.stripeColor);
      stripeValue.append(stripeSwatch, `Stripe ${rule.stripeColor.toUpperCase()}`);
      colors.append(headerValue, stripeValue);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-secondary compact-button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      const nextStyle = { rules: style.rules.filter((item) => item.id !== rule.id) };
      saveScheduleStyle(nextStyle);
      applyScheduleStyle();
    });

    card.append(labelGroup, colors, remove);
    scheduleColorRuleList.appendChild(card);
  });
}

function populateModuleColorTargets(moduleGroups) {
  const currentValue = moduleColorTarget.value;
  moduleColorTarget.replaceChildren();
  const globalOption = document.createElement("option");
  globalOption.value = "";
  globalOption.textContent = "Entire schedule";
  moduleColorTarget.appendChild(globalOption);
  const titleStripeOption = document.createElement("option");
  titleStripeOption.value = TITLE_STRIPE_TARGET;
  titleStripeOption.textContent = "Header's stripe";
  moduleColorTarget.appendChild(titleStripeOption);
  moduleGroups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.moduleKey;
    option.textContent = group.moduleTitle;
    moduleColorTarget.appendChild(option);
  });
  if (Array.from(moduleColorTarget.options).some((option) => option.value === currentValue)) {
    moduleColorTarget.value = currentValue;
  }
}

function applyScheduleStyle() {
  const style = loadScheduleStyle();
  const globalStyle = resolveScheduleStyle(style);
  const moduleSections = Array.from(scheduleMatrixList.querySelectorAll(".schedule-matrix-section"));
  const firstModuleStyle = moduleSections.length > 0
    ? resolveScheduleStyle(style, moduleSections[0].dataset.moduleId)
    : globalStyle;

  schedulePrintArea.style.setProperty("--schedule-header-color", globalStyle.headerColor);
  schedulePrintArea.style.setProperty("--schedule-stripe-color", hexToRgba(globalStyle.stripeColor, 0.12));
  schedulePrintArea.style.setProperty(
    "--schedule-title-stripe-color",
    resolveTitleStripeColor(style, firstModuleStyle.headerColor)
  );
  moduleSections.forEach((section) => {
    const moduleStyle = resolveScheduleStyle(style, section.dataset.moduleId);
    section.style.setProperty("--schedule-header-color", moduleStyle.headerColor);
    section.style.setProperty("--schedule-stripe-color", hexToRgba(moduleStyle.stripeColor, 0.12));
  });

  syncScheduleColorEditor(style);
  renderScheduleStyleRules(style);
}

function addScheduleColorRule() {
  const targetValue = moduleColorTarget.value;
  const isTitleStripe = targetValue === TITLE_STRIPE_TARGET;
  const moduleId = targetValue && !isTitleStripe ? targetValue : null;
  const style = loadScheduleStyle();
  const existingRule = findStyleRule(style, targetValue);
  if (existingRule) {
    const targetLabel = getModuleStyleLabel(targetValue);
    const confirmed = window.confirm(
      `${targetLabel} already has a color rule. Replace its current colors?`
    );
    if (!confirmed) return;
  }
  const nextRule = isTitleStripe
    ? {
        id: "style_rule_title_stripe",
        target: "title_stripe",
        moduleId: null,
        titleStripeColor: headerColorInput.value,
        templateName: null
      }
    : {
        id: moduleId ? `style_rule_${moduleId}` : "style_rule_global",
        target: moduleId ? "module" : "schedule",
        moduleId,
        headerColor: headerColorInput.value,
        stripeColor: stripeColorInput.value,
        templateName: selectedColorTemplateName
      };
  const rules = style.rules.filter((rule) => getStyleRuleTargetValue(rule) !== targetValue);
  rules.push(nextRule);
  saveScheduleStyle({ rules: sortScheduleStyleRules(rules) });
  applyScheduleStyle();
}

/* ===== Render ===== */

function renderSchedule() {
  closePerceptionMenus();
  scheduleMatrixList.innerHTML = "";
  clearMessage();

  if (!schedule || schedule.length === 0) {
    scheduleSummary.textContent = "No schedule was found. Go back and generate a new schedule.";
    scheduleDocumentTitle.textContent = "Generated Schedule";
    showMessage("No generated schedule found.");
    return;
  }

  const title = getScheduleTitle();
  scheduleDocumentTitle.textContent = title;
  document.title = title;
  scheduleSummary.textContent = [
    getTrackLabel(),
    `${schedule.length} scheduled session${schedule.length === 1 ? "" : "s"}`,
    scheduleDocument.timeZone
  ].filter(Boolean).join(" · ");

  const moduleGroups = groupScheduleByModule(schedule);
  populateModuleColorTargets(moduleGroups);

  moduleGroups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "schedule-matrix-section";
    section.dataset.moduleId = group.moduleKey;

    const table = document.createElement("table");
    table.className = "schedule-matrix-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th class="schedule-date-col">Date</th>
          <th class="schedule-week-col">Session</th>
          <th class="schedule-topic-col">${escapeHtml(group.moduleTitle)}</th>
          <th class="schedule-small-col">Difficulty</th>
          <th class="schedule-small-col">Done</th>
          <th class="schedule-small-col">Studied</th>
          <th class="schedule-small-col">Practiced</th>
          <th class="schedule-perception-col">Perception</th>
        </tr>
      </thead>

      <tbody>
        ${group.items.map((item) => renderScheduleRow(item)).join("")}
      </tbody>
    `;

    section.appendChild(table);
    scheduleMatrixList.appendChild(section);
  });

  bindScheduleInputs();
  applyScheduleStyle();
}

function renderScheduleRow(item) {
  const rawStartDate = item.startDate || item.date;
  const startDate = formatDisplayDate(rawStartDate);

  const difficulty = renderDifficulty(item.difficulty);

  return `
    <tr>
      <td class="schedule-date-cell">${startDate}</td>
      <td class="schedule-week-cell">${item.sessionNumber || item.week}</td>
      <td class="schedule-topic-cell">${getSessionTopicMarkup(item)}</td>

      <td class="schedule-difficulty-cell">${difficulty}</td>

      <td class="schedule-check-cell">
        <input
          type="checkbox"
          class="matrix-checkbox done-checkbox"
          data-index="${item.originalIndex}"
          ${item.done ? "checked" : ""}
          ${editMode ? "" : "disabled"}
        />
      </td>

      <td class="schedule-check-cell">
        <input
          type="checkbox"
          class="matrix-checkbox studied-checkbox"
          data-index="${item.originalIndex}"
          ${item.workedOn ? "checked" : ""}
          ${editMode ? "" : "disabled"}
        />
      </td>

      <td class="schedule-check-cell">
        <input
          type="checkbox"
          class="matrix-checkbox practiced-checkbox"
          data-index="${item.originalIndex}"
          ${item.practiced ? "checked" : ""}
          ${editMode ? "" : "disabled"}
        />
      </td>

      <td class="schedule-perception-cell">
        ${renderPerceptionChoices(item)}
      </td>
    </tr>
  `;
}

function bindScheduleInputs() {
  const doneCheckboxes = document.querySelectorAll(".done-checkbox");
  const studiedCheckboxes = document.querySelectorAll(".studied-checkbox");
  const practicedCheckboxes = document.querySelectorAll(".practiced-checkbox");
  const perceptionToggles = document.querySelectorAll(".perception-menu-toggle");

  doneCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      if (!editMode) return;

      const index = Number(event.target.dataset.index);
      updateDone(index, event.target.checked);
    });
  });

  studiedCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      if (!editMode) return;

      const index = Number(event.target.dataset.index);
      updateStudied(index, event.target.checked);
    });
  });

  practicedCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      if (!editMode) return;

      const index = Number(event.target.dataset.index);
      updatePracticed(index, event.target.checked);
    });
  });

  perceptionToggles.forEach((toggleButton) => {
    toggleButton.addEventListener("click", (event) => {
      if (!editMode) return;

      event.stopPropagation();
      showPerceptionFloatingMenu(event.currentTarget);
    });
  });
}

/* ===== Events ===== */

editProgressBtn.addEventListener("click", enterEditMode);
saveProgressBtn.addEventListener("click", saveEdits);
discardProgressBtn.addEventListener("click", discardEdits);

printScheduleBtn.addEventListener("click", () => {
  closePerceptionMenus();
  window.print();
});

addScheduleColorRuleBtn.addEventListener("click", addScheduleColorRule);
moduleColorTarget.addEventListener("change", () => {
  syncScheduleColorEditor(loadScheduleStyle());
});
openColorTemplateBtn.addEventListener("click", openColorTemplateDialog);
closeColorTemplateBtn.addEventListener("click", closeColorTemplateDialog);
colorTemplateDialog.addEventListener("click", (event) => {
  if (event.target === colorTemplateDialog) closeColorTemplateDialog();
});
[headerColorInput, stripeColorInput].forEach((input) => {
  input.addEventListener("input", () => {
    selectedColorTemplateName = null;
    updateColorTemplateButton();
  });
});

window.addEventListener("beforeunload", (event) => {
  if (!editMode || !hasUnsavedChanges) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});

document.addEventListener("click", (event) => {
  if (
    !perceptionFloatingMenu?.classList.contains("open") ||
    perceptionFloatingMenu.contains(event.target) ||
    activePerceptionToggle?.contains(event.target)
  ) {
    return;
  }

  hidePerceptionFloatingMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hidePerceptionFloatingMenu();
  }
});

window.addEventListener("scroll", hidePerceptionFloatingMenu, true);
window.addEventListener("resize", hidePerceptionFloatingMenu);

/* ===== Init ===== */

ensureSavedAtForLoadedSchedule();
renderSchedule();
createPerceptionFloatingMenu();
updateEditingControls();
updateSaveStatus();
