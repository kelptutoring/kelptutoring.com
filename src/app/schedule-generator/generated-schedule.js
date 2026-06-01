/* ===== DOM elements ===== */

const scheduleMatrixList = document.getElementById("scheduleMatrixList");
const generatedScheduleMessage = document.getElementById("generatedScheduleMessage");
const scheduleSummary = document.getElementById("scheduleSummary");
const scheduleDocumentTitle = document.getElementById("scheduleDocumentTitle");

const schedulePrintArea = document.getElementById("schedulePrintArea");

const editScheduleBtn = document.getElementById("editScheduleBtn");
const printScheduleBtn = document.getElementById("printScheduleBtn");

const headerColorInput = document.getElementById("headerColorInput");
const stripeColorInput = document.getElementById("stripeColorInput");

/* ===== State ===== */

const storageKey = "kelpGeneratedSchedule";

let schedule = loadSchedule();

/* ===== Helpers ===== */

function loadSchedule() {
  const storedSchedule = localStorage.getItem(storageKey);

  if (!storedSchedule) {
    return [];
  }

  try {
    return JSON.parse(storedSchedule);
  } catch (error) {
    console.error("Could not parse generated schedule:", error);
    return [];
  }
}

function saveSchedule() {
  localStorage.setItem(storageKey, JSON.stringify(schedule));
}

function showMessage(message, type = "error") {
  generatedScheduleMessage.textContent = message;
  generatedScheduleMessage.className = `message ${type}`;
}

function clearMessage() {
  generatedScheduleMessage.textContent = "";
  generatedScheduleMessage.className = "message";
}

function formatDisplayDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric"
  });
}

function addDays(dateValue, numberOfDays) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + numberOfDays);

  return date.toISOString().split("T")[0];
}

function getEndDate(dateValue) {
  return addDays(dateValue, 6);
}

function getScheduleTitle() {
  if (!schedule || schedule.length === 0) {
    return "Generated Schedule";
  }

  const firstItem = schedule[0];
  const scheduleName = firstItem.track || firstItem.subject || "Custom";
  
  return `${scheduleName} Study Schedule`;
}

function getTrackLabel() {
  if (!schedule || schedule.length === 0) {
    return "";
  }

  const firstItem = schedule[0];

  if (firstItem.track) {
    return `${firstItem.level} · ${firstItem.subject} · ${firstItem.track}`;
  }

  return `${firstItem.level} · ${firstItem.subject}`;
}

function getWeekTopic(item) {
  return item.weekTopic || "";
}

function groupScheduleByModule(scheduleItems) {
  const groups = [];

  scheduleItems.forEach((item, index) => {
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.moduleTitle !== item.moduleTitle) {
      groups.push({
        moduleTitle: item.moduleTitle,
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
  saveSchedule();
}

function updatePracticed(index, checked) {
  schedule[index].practiced = checked;
  saveSchedule();
}

function updatePerception(index, checked) {
  schedule[index].perception = checked;
  saveSchedule();
}

const scheduleStyleKey = "kelpScheduleStyle";

function loadScheduleStyle() {
  const storedStyle = localStorage.getItem(scheduleStyleKey);

  if (!storedStyle) {
    return {
      headerColor: "#5FAE63",
      stripeColor: "#5FAE63"
    };
  }

  try {
    const parsedStyle = JSON.parse(storedStyle);

    return {
      headerColor: parsedStyle.headerColor || "#5FAE63",
      stripeColor: parsedStyle.stripeColor || "#5FAE63"
    };
  } catch (error) {
    console.error("Could not parse schedule style:", error);

    return {
      headerColor: "#5FAE63",
      stripeColor: "#5FAE63"
    };
  }
}

function saveScheduleStyle(style) {
  localStorage.setItem(scheduleStyleKey, JSON.stringify(style));
}

function hexToRgba(hex, alpha = 0.12) {
  const cleanHex = hex.replace("#", "");

  const red = parseInt(cleanHex.substring(0, 2), 16);
  const green = parseInt(cleanHex.substring(2, 4), 16);
  const blue = parseInt(cleanHex.substring(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applyScheduleStyle() {
  const style = loadScheduleStyle();

  schedulePrintArea.style.setProperty("--schedule-header-color", style.headerColor);
  schedulePrintArea.style.setProperty(
    "--schedule-stripe-color",
    hexToRgba(style.stripeColor, 0.12)
  );

  headerColorInput.value = style.headerColor;
  stripeColorInput.value = style.stripeColor;
}

function updateScheduleStyle() {
  const style = {
    headerColor: headerColorInput.value,
    stripeColor: stripeColorInput.value
  };

  saveScheduleStyle(style);
  applyScheduleStyle();
}

/* ===== Render ===== */

function renderSchedule() {
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
  scheduleSummary.textContent = `${getTrackLabel()} · ${schedule.length} scheduled week(s)`;

  const moduleGroups = groupScheduleByModule(schedule);

  moduleGroups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "schedule-matrix-section";

    const table = document.createElement("table");
    table.className = "schedule-matrix-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th class="schedule-date-col">Start</th>
          <th class="schedule-date-col">End</th>
          <th class="schedule-week-col">Week</th>
          <th class="schedule-topic-col">${group.moduleTitle}</th>
          <th class="schedule-small-col">Difficulty</th>
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
}

function renderScheduleRow(item) {
  const startDate = formatDisplayDate(item.date);
  const endDate = formatDisplayDate(getEndDate(item.date));

  const difficulty = item.difficulty || "";

  return `
    <tr>
      <td class="schedule-date-cell">${startDate}</td>
      <td class="schedule-date-cell">${endDate}</td>
      <td class="schedule-week-cell">${item.week}</td>
      <td class="schedule-topic-cell">${getWeekTopic(item)}</td>

      <td class="schedule-difficulty-cell">${difficulty}</td>

      <td class="schedule-check-cell">
        <input
          type="checkbox"
          class="matrix-checkbox studied-checkbox"
          data-index="${item.originalIndex}"
          ${item.workedOn ? "checked" : ""}
        />
      </td>

      <td class="schedule-check-cell">
        <input
          type="checkbox"
          class="matrix-checkbox practiced-checkbox"
          data-index="${item.originalIndex}"
          ${item.practiced ? "checked" : ""}
        />
      </td>

      <td class="schedule-check-cell">
        <input
          type="checkbox"
          class="matrix-checkbox perception-checkbox"
          data-index="${item.originalIndex}"
          ${item.perception ? "checked" : ""}
        />
      </td>
    </tr>
  `;
}

function bindScheduleInputs() {
  const studiedCheckboxes = document.querySelectorAll(".studied-checkbox");
  const practicedCheckboxes = document.querySelectorAll(".practiced-checkbox");
  const perceptionCheckboxes = document.querySelectorAll(".perception-checkbox");

  studiedCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      updateStudied(index, event.target.checked);
    });
  });

  practicedCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      updatePracticed(index, event.target.checked);
    });
  });

    perceptionCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const index = Number(event.target.dataset.index);
        updatePerception(index, event.target.checked);
      });
    });
}

/* ===== Events ===== */

editScheduleBtn.addEventListener("click", () => {
  window.location.href = "./schedule-generator.html";
});

printScheduleBtn.addEventListener("click", () => {
  window.print();
});

headerColorInput.addEventListener("input", updateScheduleStyle);
stripeColorInput.addEventListener("input", updateScheduleStyle);

/* ===== Init ===== */

applyScheduleStyle();
renderSchedule();