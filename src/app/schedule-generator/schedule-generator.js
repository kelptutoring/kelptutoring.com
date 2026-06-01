import { tracksData } from "../../data/tracks-data.js";

/* ===== DOM elements ===== */

const levelStep = document.getElementById("levelStep");
const subjectStep = document.getElementById("subjectStep");
const trackStep = document.getElementById("trackStep");
const moduleStep = document.getElementById("moduleStep");
const weekPreviewStep = document.getElementById("weekPreviewStep");
const dateStep = document.getElementById("dateStep");

const levelButtons = document.getElementById("levelButtons");
const subjectButtons = document.getElementById("subjectButtons");
const trackButtons = document.getElementById("trackButtons");
const moduleButtons = document.getElementById("moduleButtons");
const weekPreviewList = document.getElementById("weekPreviewList");

const backStepBtn = document.getElementById("backStepBtn");
const continueToDateBtn = document.getElementById("continueToDateBtn");
const startDateInput = document.getElementById("startDate");
const generateScheduleBtn = document.getElementById("generateScheduleBtn");
const generatorMessage = document.getElementById("generatorMessage");

/* ===== State ===== */

const selectedData = {
  level: null,
  subject: null,
  track: null,
  selectedModuleTitles: [],
  selectedWeekIds: [],
  selectedSpecialWeeks: {},
  availableModules: []
};

let currentStep = "level";

/* ===== Step controls ===== */

const stepMap = {
  level: levelStep,
  subject: subjectStep,
  track: trackStep,
  module: moduleStep,
  weekPreview: weekPreviewStep,
  date: dateStep
};

function showOnlyStep(stepName) {
  currentStep = stepName;

  Object.values(stepMap).forEach((step) => {
    if (step) {
      step.classList.add("hidden");
    }
  });

  if (stepMap[stepName]) {
    stepMap[stepName].classList.remove("hidden");
  }

  if (!backStepBtn) {
    return;
  }

  if (stepName === "level") {
    backStepBtn.classList.add("hidden");
  } else {
    backStepBtn.classList.remove("hidden");
  }
}

/* ===== General helpers ===== */

function showMessage(message, type = "error") {
  generatorMessage.textContent = message;
  generatorMessage.className = `message ${type}`;
}

function clearMessage() {
  generatorMessage.textContent = "";
  generatorMessage.className = "message";
}

function clearElement(element) {
  if (!element) {
    return;
  }

  element.innerHTML = "";
}

function createButton(text, className = "generator-button") {
  const button = document.createElement("button");

  button.type = "button";
  button.className = className;
  button.textContent = text;

  return button;
}

function getWeekId(moduleTitle, weekIndex) {
  return `${moduleTitle}__week_${weekIndex + 1}`;
}

function getSpecialWeekId(moduleTitle) {
  return `${moduleTitle}__special_week`;
}

function getModuleTitle(module) {
  if (typeof module === "string") {
    return module;
  }

  return module.title;
}

function getModuleWeeks(module) {
  if (typeof module === "string") {
    return [
      {
        title: module,
        difficulty: ""
      }
    ];
  }

  if (!Array.isArray(module.weeks)) {
    return [
      {
        title: module.title,
        difficulty: ""
      }
    ];
  }

  return module.weeks.map((week) => {
    if (typeof week === "string") {
      return {
        title: week,
        difficulty: ""
      };
    }

    return {
      title: week.title,
      difficulty: week.difficulty || ""
    };
  });
}

function stripWeekPrefix(weekTopic) {
  return String(weekTopic)
    .replace(/^Week\s+\d+\s*:\s*/i, "")
    .trim();
}

function stripModulePrefix(moduleTitle) {
  return String(moduleTitle)
    .replace(/^Module\s+\d+\s*:\s*/i, "")
    .trim();
}

function getGeneratedModuleTitle(moduleTitle, moduleIndex) {
  return `Module ${moduleIndex + 1}: ${stripModulePrefix(moduleTitle)}`;
}

function hasSelectedNormalWeek(module) {
  const moduleTitle = getModuleTitle(module);
  const moduleWeeks = getModuleWeeks(module);

  return moduleWeeks.some((_, weekIndex) => {
    const weekId = getWeekId(moduleTitle, weekIndex);
    return selectedData.selectedWeekIds.includes(weekId);
  });
}

function hasSelectedSpecialWeek(module) {
  const moduleTitle = getModuleTitle(module);
  const specialWeekId = getSpecialWeekId(moduleTitle);

  return (
    selectedData.selectedWeekIds.includes(specialWeekId) &&
    Boolean(selectedData.selectedSpecialWeeks[specialWeekId])
  );
}

function hasAnySelectedWeek(module) {
  return hasSelectedNormalWeek(module) || hasSelectedSpecialWeek(module);
}

function toggleSelectedWeek(weekId, button) {
  const isSelected = selectedData.selectedWeekIds.includes(weekId);

  if (isSelected) {
    selectedData.selectedWeekIds = selectedData.selectedWeekIds.filter(
      (selectedWeekId) => selectedWeekId !== weekId
    );

    button.classList.remove("selected");
  } else {
    selectedData.selectedWeekIds.push(weekId);
    button.classList.add("selected");
  }
}

function createWeekCard({ weekId, scheduleLabel, title, description = "" }) {
  const weekButton = document.createElement("button");

  weekButton.type = "button";
  weekButton.className = "link-card generator-week-card";
  weekButton.dataset.weekId = weekId;

  const descriptionMarkup = description
    ? `<span class="link-description">${description}</span>`
    : "";

  weekButton.innerHTML = `
    <span class="link-number">${scheduleLabel}</span>
    <span>
      <span class="link-title">${title}</span>
      ${descriptionMarkup}
    </span>
  `;

  weekButton.addEventListener("click", () => {
    clearMessage();
    toggleSelectedWeek(weekId, weekButton);
  });

  return weekButton;
}

/* ===== Reset helpers ===== */

function resetFromLevel() {
  selectedData.subject = null;
  selectedData.track = null;
  selectedData.selectedModuleTitles = [];
  selectedData.selectedWeekIds = [];
  selectedData.selectedSpecialWeeks = {};
  selectedData.availableModules = [];

  clearElement(subjectButtons);
  clearElement(trackButtons);
  clearElement(moduleButtons);
  clearElement(weekPreviewList);

  startDateInput.value = "";
}

function resetFromSubject() {
  selectedData.track = null;
  selectedData.selectedModuleTitles = [];
  selectedData.selectedWeekIds = [];
  selectedData.selectedSpecialWeeks = {};
  selectedData.availableModules = [];

  clearElement(trackButtons);
  clearElement(moduleButtons);
  clearElement(weekPreviewList);

  startDateInput.value = "";
}

function resetFromTrack() {
  selectedData.selectedModuleTitles = [];
  selectedData.selectedWeekIds = [];
  selectedData.selectedSpecialWeeks = {};
  selectedData.availableModules = [];

  clearElement(moduleButtons);
  clearElement(weekPreviewList);

  startDateInput.value = "";
}

/* ===== Data shape helper ===== */

function hasDirectModules(subjectData) {
  return Array.isArray(subjectData.modulesOnly);
}

/* ===== Step 1: Levels ===== */

function renderLevels() {
  clearElement(levelButtons);

  const levels = Object.keys(tracksData);

  levels.forEach((level) => {
    const button = createButton(level);

    button.addEventListener("click", () => {
      clearMessage();

      selectedData.level = level;
      resetFromLevel();

      renderSubjects(level);
      showOnlyStep("subject");
    });

    levelButtons.appendChild(button);
  });

  showOnlyStep("level");
}

/* ===== Step 2: Subjects ===== */

function renderSubjects(level) {
  clearElement(subjectButtons);

  const subjects = Object.keys(tracksData[level]);

  subjects.forEach((subject) => {
    const button = createButton(subject);

    button.addEventListener("click", () => {
      clearMessage();

      selectedData.subject = subject;
      resetFromSubject();

      const subjectData = tracksData[selectedData.level][subject];

      if (hasDirectModules(subjectData)) {
        selectedData.track = null;
        selectedData.availableModules = subjectData.modulesOnly;

        renderModules(subjectData.modulesOnly);
        showOnlyStep("module");
      } else {
        renderTracks(subjectData);
        showOnlyStep("track");
      }
    });

    subjectButtons.appendChild(button);
  });
}

/* ===== Step 3: Specific tracks ===== */

function renderTracks(subjectData) {
  clearElement(trackButtons);

  const tracks = Object.keys(subjectData);

  tracks.forEach((track) => {
    const button = createButton(track);

    button.addEventListener("click", () => {
      clearMessage();

      selectedData.track = track;
      resetFromTrack();

      const modules = subjectData[track];

      selectedData.availableModules = modules;

      renderModules(modules);
      showOnlyStep("module");
    });

    trackButtons.appendChild(button);
  });
}

/* ===== Step 4: Modules ===== */

function renderModules(modules) {
  clearElement(moduleButtons);

  modules.forEach((module) => {
    const moduleTitle = getModuleTitle(module);
    const button = createButton(moduleTitle, "module-button");

    button.addEventListener("click", () => {
      clearMessage();

      const isSelected = selectedData.selectedModuleTitles.includes(moduleTitle);

      if (isSelected) {
        selectedData.selectedModuleTitles = selectedData.selectedModuleTitles.filter(
          (selectedTitle) => selectedTitle !== moduleTitle
        );

        button.classList.remove("selected");
      } else {
        selectedData.selectedModuleTitles.push(moduleTitle);
        button.classList.add("selected");
      }
    });

    moduleButtons.appendChild(button);
  });

  const continueButton = createButton("Continue", "btn-primary");

  continueButton.addEventListener("click", () => {
    clearMessage();

    if (selectedData.selectedModuleTitles.length === 0) {
      showMessage("Please select at least one module.");
      return;
    }

    renderWeekPreview();
    showOnlyStep("weekPreview");
  });

  moduleButtons.appendChild(continueButton);
}

/* ===== Back button behavior ===== */

function handleBackStep() {
  clearMessage();

  if (currentStep === "subject") {
    selectedData.level = null;
    resetFromLevel();

    renderLevels();
    showOnlyStep("level");
    return;
  }

  if (currentStep === "track") {
    selectedData.subject = null;
    resetFromSubject();

    renderSubjects(selectedData.level);
    showOnlyStep("subject");
    return;
  }

  if (currentStep === "module") {
    const subjectData = tracksData[selectedData.level][selectedData.subject];

    selectedData.selectedModuleTitles = [];
    selectedData.selectedWeekIds = [];
    selectedData.selectedSpecialWeeks = {};
    selectedData.availableModules = [];

    clearElement(moduleButtons);
    clearElement(weekPreviewList);

    startDateInput.value = "";

    if (hasDirectModules(subjectData)) {
      selectedData.subject = null;
      resetFromSubject();

      renderSubjects(selectedData.level);
      showOnlyStep("subject");
    } else {
      selectedData.track = null;
      resetFromTrack();

      renderTracks(subjectData);
      showOnlyStep("track");
    }

    return;
  }

  if (currentStep === "weekPreview") {
    clearElement(weekPreviewList);
    showOnlyStep("module");
    return;
  }

  if (currentStep === "date") {
    startDateInput.value = "";
    showOnlyStep("weekPreview");
  }
}

/* ===== Step 5: Week preview and selection ===== */

function getSelectedModulesInTrackOrder() {
  return selectedData.availableModules.filter((module) => {
    const moduleTitle = getModuleTitle(module);

    return selectedData.selectedModuleTitles.includes(moduleTitle);
  });
}

function renderWeekPreview() {
  clearElement(weekPreviewList);

  selectedData.selectedWeekIds = [];
  selectedData.selectedSpecialWeeks = {};

  const orderedModules = getSelectedModulesInTrackOrder();

  orderedModules.forEach((module, moduleIndex) => {
    const originalModuleTitle = getModuleTitle(module);
    const displayModuleTitle = getGeneratedModuleTitle(originalModuleTitle, moduleIndex);
    const moduleWeeks = getModuleWeeks(module);

    const moduleBlock = document.createElement("section");
    moduleBlock.className = "week-preview-module";

    const moduleHeading = document.createElement("h3");
    moduleHeading.className = "week-preview-module-title";
    moduleHeading.textContent = displayModuleTitle;
    moduleBlock.appendChild(moduleHeading);

    const weekList = document.createElement("div");
    weekList.className = "lesson-list week-preview-items";

    moduleWeeks.forEach((weekData, index) => {
      const weekId = getWeekId(originalModuleTitle, index);

    const weekButton = createWeekCard({
      weekId,
      scheduleLabel: index + 1,
      title: stripWeekPrefix(weekData.title)
    });
      weekList.appendChild(weekButton);
    });

    const specialWeekBlock = createSpecialWeekBlock(originalModuleTitle, displayModuleTitle);
    weekList.appendChild(specialWeekBlock);

    moduleBlock.appendChild(weekList);
    weekPreviewList.appendChild(moduleBlock);
  });
}

function createSpecialWeekBlock(originalModuleTitle, displayModuleTitle) {
  const specialWeekId = getSpecialWeekId(originalModuleTitle);

  const wrapper = document.createElement("div");
  wrapper.className = "special-week-wrapper";

  const specialButton = document.createElement("button");
  specialButton.type = "button";
  specialButton.className = "link-card generator-week-card special-week-card";

  specialButton.innerHTML = `
    <span class="link-number">+</span>
    <span>
      <span class="link-title">Assessment / Review Week</span>
      <span class="link-description">Click to choose a mid-term exam or a review week.</span>
    </span>
  `;

  const options = document.createElement("div");
  options.className = "special-week-options hidden";

  const examButton = createSpecialWeekOptionButton("Mid-term exam");
  const reviewButton = createSpecialWeekOptionButton("Review");

  examButton.addEventListener("click", () => {
    selectSpecialWeek({
      originalModuleTitle,
      displayModuleTitle,
      specialWeekId,
      choice: "Mid-term exam",
      wrapper
    });
  });

  reviewButton.addEventListener("click", () => {
    selectSpecialWeek({
      originalModuleTitle,
      displayModuleTitle,
      specialWeekId,
      choice: "Review",
      wrapper
    });
  });

  options.appendChild(examButton);
  options.appendChild(reviewButton);

  specialButton.addEventListener("click", () => {
    clearMessage();
    options.classList.toggle("hidden");
  });

  wrapper.appendChild(specialButton);
  wrapper.appendChild(options);

  return wrapper;
}

function createSpecialWeekOptionButton(text) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "btn-secondary special-week-option";
  button.textContent = text;

  return button;
}

function selectSpecialWeek({
  originalModuleTitle,
  displayModuleTitle,
  specialWeekId,
  choice,
  wrapper
}) {
  selectedData.selectedSpecialWeeks[specialWeekId] = {
    originalModuleTitle,
    displayModuleTitle,
    moduleWeek: "special",
    weekTopic: choice,
    type: choice
  };

  if (!selectedData.selectedWeekIds.includes(specialWeekId)) {
    selectedData.selectedWeekIds.push(specialWeekId);
  }

  wrapper.innerHTML = "";

  const selectedCard = document.createElement("button");
  selectedCard.type = "button";
  selectedCard.className = "link-card generator-week-card special-week-card selected";

  selectedCard.innerHTML = `
    <span class="link-number">✓</span>
    <span>
      <span class="link-title">${choice}</span>
      <span class="link-description">Selected as the extra week for ${displayModuleTitle}.</span>
    </span>
  `;

  selectedCard.addEventListener("click", () => {
    delete selectedData.selectedSpecialWeeks[specialWeekId];

    selectedData.selectedWeekIds = selectedData.selectedWeekIds.filter(
      (selectedWeekId) => selectedWeekId !== specialWeekId
    );

    const rebuiltBlock = createSpecialWeekBlock(originalModuleTitle, displayModuleTitle);
    wrapper.replaceWith(rebuiltBlock);
  });

  wrapper.appendChild(selectedCard);
}

/* ===== Step 6: Generate week-based schedule ===== */

function generateWeeklySchedule(modules, startDateValue) {
  const startDate = new Date(`${startDateValue}T00:00:00`);

  const scheduledModules = modules.filter((module) => {
    return hasAnySelectedWeek(module);
  });

  const schedule = [];
  let scheduleWeek = 1;

  scheduledModules.forEach((module, moduleIndex) => {
    const originalModuleTitle = getModuleTitle(module);
    const generatedModuleTitle = getGeneratedModuleTitle(originalModuleTitle, moduleIndex);
    const moduleWeeks = getModuleWeeks(module);

    moduleWeeks.forEach((weekData, moduleWeekIndex) => {
      const weekId = getWeekId(originalModuleTitle, moduleWeekIndex);

      if (!selectedData.selectedWeekIds.includes(weekId)) {
        return;
      }

      const weekDate = new Date(startDate);
      weekDate.setDate(startDate.getDate() + (scheduleWeek - 1) * 7);

      schedule.push({
        week: scheduleWeek,
        level: selectedData.level,
        subject: selectedData.subject,
        track: selectedData.track,

        moduleTitle: generatedModuleTitle,
        originalModuleTitle,
        moduleWeek: moduleWeekIndex + 1,
        weekTopic: stripWeekPrefix(weekData.title),
        type: "lesson",

        date: formatDateForStorage(weekDate),
        workedOn: false,
        practiced: false,
        difficulty: weekData.difficulty || "",
        perception: ""
      });

      scheduleWeek += 1;
    });

    const specialWeekId = getSpecialWeekId(originalModuleTitle);
    const specialWeek = selectedData.selectedSpecialWeeks[specialWeekId];

    if (selectedData.selectedWeekIds.includes(specialWeekId) && specialWeek) {
      const weekDate = new Date(startDate);
      weekDate.setDate(startDate.getDate() + (scheduleWeek - 1) * 7);

      schedule.push({
        week: scheduleWeek,
        level: selectedData.level,
        subject: selectedData.subject,
        track: selectedData.track,

        moduleTitle: generatedModuleTitle,
        originalModuleTitle,
        moduleWeek: "special",
        weekTopic: specialWeek.weekTopic,
        type: specialWeek.type,

        date: formatDateForStorage(weekDate),
        workedOn: false,
        practiced: false,
        difficulty: "",
        perception: ""
      });

      scheduleWeek += 1;
    }
  });

  return schedule;
}

function formatDateForStorage(date) {
  return date.toISOString().split("T")[0];
}

function handleGenerateSchedule() {
  clearMessage();

  const startDateValue = startDateInput.value;

  if (!startDateValue) {
    showMessage("Please choose a starting date.");
    return;
  }

  const orderedModules = getSelectedModulesInTrackOrder();

  if (orderedModules.length === 0) {
    showMessage("Please select at least one module.");
    showOnlyStep("module");
    return;
  }

  const schedule = generateWeeklySchedule(orderedModules, startDateValue);

  if (schedule.length === 0) {
    showMessage("Please select at least one week.");
    showOnlyStep("weekPreview");
    return;
  }

  localStorage.setItem("kelpGeneratedSchedule", JSON.stringify(schedule));

  window.location.href = "./generated-schedule.html";
}

/* ===== Events ===== */

generateScheduleBtn.addEventListener("click", handleGenerateSchedule);

if (backStepBtn) {
  backStepBtn.addEventListener("click", handleBackStep);
}

continueToDateBtn.addEventListener("click", () => {
  clearMessage();

  if (selectedData.selectedWeekIds.length === 0) {
    showMessage("Please select at least one week.");
    return;
  }

  showOnlyStep("date");
});

/* ===== Init ===== */

renderLevels();