/* Kelp online exam taker v5 - vanilla HTML/CSS/JS */

const LIBRARY_KEY = "kelp-exam-library-v1";
const ACTIVE_EXAM_KEY = "kelp-active-exam-v1";
const RESULTS_KEY = "kelp-exam-results-v1";
const LATEST_RESULT_KEY = "kelp-latest-exam-result-v1";
const EXAM_MADE_BY_PLACEHOLDER = "__KELP_TUTOR_PLACEHOLDER__";
const VIEWER_ROLE_KEY = "kelp-exam-viewer-role";
const PROFILE_STORAGE_KEYS = [
  "kelp-active-profile",
  "kelp-current-profile",
  "kelp-user-profile",
  "currentProfile",
  "profile"
];

const root = document.getElementById("examRoot");
const params = new URLSearchParams(window.location.search);
const examId = params.get("examId");

let exam = loadExam();
let currentIndex = 0;
let started = false;
let submitted = false;
let startedAt = null;
let timerInterval = null;
let remainingSeconds = 0;
let studentProfile = readCurrentProfile();
let viewerRole = readViewerRole(studentProfile);
let initialViewportPositioned = false;
const responses = {};

const QUESTION_TYPES = new Set([
  "short-answer",
  "multiple-choice",
  "multiple-choice-text",
  "multiple-choice-graph",
  "multiple-choice-image",
  "multiple-answer",
  "multiple-answer-text",
  "multiple-answer-graph",
  "multiple-answer-image",
  "true-false",
  "numeric",
  "essay"
]);

const OPTION_QUESTION_BASE_TYPES = {
  "multiple-choice": "multiple-choice",
  "multiple-choice-text": "multiple-choice",
  "multiple-choice-graph": "multiple-choice",
  "multiple-choice-image": "multiple-choice",
  "multiple-answer": "multiple-answer",
  "multiple-answer-text": "multiple-answer",
  "multiple-answer-graph": "multiple-answer",
  "multiple-answer-image": "multiple-answer"
};

const OPTION_CONTENT_TYPES = {
  "multiple-choice-graph": "graph",
  "multiple-answer-graph": "graph",
  "multiple-choice-image": "image",
  "multiple-answer-image": "image"
};

function normalizeQuestionType(type) {
  const value = String(type || "");
  if (value === "multiple-choice-text") return "multiple-choice";
  if (value === "multiple-answer-text") return "multiple-answer";
  return QUESTION_TYPES.has(value) ? value : "short-answer";
}

function normalizePdfAnswerSpaceSize(value, type) {
  const allowed = type === "short-answer"
    ? ["none", "small"]
    : ["none", "small", "medium", "large", "custom"];
  const fallback = type === "essay" ? "medium" : "small";
  return allowed.includes(String(value || "")) ? String(value) : fallback;
}

function normalizePdfAnswerSpaceCustomMm(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(10, Math.min(260, numeric)) : 80;
}

function questionBaseType(questionOrType) {
  const type = typeof questionOrType === "string" ? questionOrType : questionOrType?.type;
  return OPTION_QUESTION_BASE_TYPES[type] || type;
}

function questionUsesOptions(questionOrType) {
  return ["multiple-choice", "multiple-answer", "true-false"].includes(questionBaseType(questionOrType));
}

function questionAllowsMultipleCorrect(questionOrType) {
  return questionBaseType(questionOrType) === "multiple-answer";
}

function questionOptionContentType(questionOrType) {
  const type = typeof questionOrType === "string" ? questionOrType : questionOrType?.type;
  return OPTION_CONTENT_TYPES[type] || "text";
}

function normalizeOptionGraphs(rawOptionGraphs, optionCount) {
  const source = Array.isArray(rawOptionGraphs) ? rawOptionGraphs : [];
  return Array.from({ length: optionCount }, (_, index) => {
    const graph = source[index];
    return graph && graphHasContent(graph) ? normalizeGraph(graph) : null;
  });
}

function normalizeOptionImages(rawOptionImages, optionCount) {
  const source = Array.isArray(rawOptionImages) ? rawOptionImages : [];
  return Array.from({ length: optionCount }, (_, index) => String(source[index] || ""));
}

function initialize() {
  if (!exam) {
    renderNoExam();
    scheduleInitialViewportPosition();
    return;
  }

  exam = normalizeExam(exam);
  viewerRole = readViewerRole(studentProfile, exam);
  document.body.classList.toggle("is-teacher-view", viewerRole === "teacher");
  document.body.classList.toggle("is-student-session", viewerRole !== "teacher");
  remainingSeconds = Math.max(0, Math.round(Number(exam.durationMinutes || 0) * 60));
  setupHelpPopovers();
  renderStartScreen();
  scheduleInitialViewportPosition();
}

function scheduleInitialViewportPosition() {
  if (initialViewportPositioned) return;
  if (typeof document.querySelector !== "function") return;
  initialViewportPositioned = true;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const main = document.querySelector(".exam-taker-body .exam-builder-main");
      if (!main) return;
      const mainTop = window.scrollY + main.getBoundingClientRect().top;
      const header = document.querySelector(".exam-taker-body .tracks-header");
      const headerBottom = header && getComputedStyle(header).display !== "none"
        ? window.scrollY + header.getBoundingClientRect().bottom
        : 0;
      window.scrollTo({
        left: 0,
        top: Math.max(0, Math.ceil(mainTop), Math.ceil(headerBottom)),
        behavior: "auto"
      });
    });
  });
}

function loadExam() {
  if (examId) {
    const library = readLocalLibrary();
    const found = library.find((item) => item.id === examId);
    if (found) return found;
  }

  try {
    return JSON.parse(localStorage.getItem(ACTIVE_EXAM_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function readLocalLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function readCurrentProfile() {
  for (const storage of [sessionStorage, localStorage]) {
    for (const key of PROFILE_STORAGE_KEYS) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const profile = JSON.parse(raw);
        if (profile && typeof profile === "object") return normalizeProfile(profile);
      } catch (_) {
        // Future backend/session profile data is optional in this prototype.
      }
    }
  }
  return normalizeProfile({});
}

function normalizeProfile(profile) {
  return {
    id: String(profile.id || profile.profileId || ""),
    respondentName: String(profile.full_name || profile.fullName || profile.name || profile.respondentName || ""),
    degreeLevel: String(profile.degree_level || profile.degreeLevel || profile.grade_level || profile.gradeLevel || ""),
    role: String(profile.role || "")
  };
}

function readViewerRole(profile = studentProfile, examData = exam) {
  if (isTeacherRole(examData?.viewerRole)) return "teacher";
  const storedRole = (() => {
    try {
      return sessionStorage.getItem(VIEWER_ROLE_KEY) || "";
    } catch (_) {
      return "";
    }
  })();
  if (isTeacherRole(storedRole)) return "teacher";
  return isTeacherRole(profile?.role) ? "teacher" : "student";
}

function isTeacherRole(role) {
  return ["teacher", "tutor", "admin", "developer"].includes(String(role || "").trim().toLowerCase());
}

function setupHelpPopovers() {
  if (document.body.dataset.studentHelpPopovers === "ready") return;
  document.body.dataset.studentHelpPopovers = "ready";

  let popover = null;
  let activeButton = null;

  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement("div");
    popover.className = "exam-help-popover";
    popover.setAttribute("role", "tooltip");
    document.body.appendChild(popover);
    return popover;
  }

  function hide() {
    if (activeButton) activeButton.setAttribute("aria-expanded", "false");
    activeButton = null;
    popover?.classList.remove("is-visible");
  }

  function show(button) {
    const text = String(button?.dataset?.helpText || button?.title || "").trim();
    if (!button || !text) return;
    const tip = ensurePopover();
    activeButton = button;
    tip.textContent = text;
    tip.classList.remove("is-visible");
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.style.visibility = "hidden";

    const buttonRect = button.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const margin = 12;
    const gap = 9;
    const left = Math.max(margin, Math.min(buttonRect.right - tipRect.width, window.innerWidth - tipRect.width - margin));
    const top = Math.min(window.innerHeight - tipRect.height - margin, buttonRect.bottom + gap);

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(margin, top))}px`;
    tip.style.visibility = "visible";
    requestAnimationFrame(() => {
      if (activeButton === button) tip.classList.add("is-visible");
    });
    button.setAttribute("aria-expanded", "true");
  }

  document.addEventListener("pointerover", (event) => {
    const button = event.target.closest?.(".exam-help-button");
    if (button) show(button);
  });
  document.addEventListener("pointerout", (event) => {
    const button = event.target.closest?.(".exam-help-button");
    if (button && !button.contains(event.relatedTarget)) hide();
  });
  document.addEventListener("focusin", (event) => {
    const button = event.target.closest?.(".exam-help-button");
    if (button) show(button);
  });
  document.addEventListener("focusout", (event) => {
    const button = event.target.closest?.(".exam-help-button");
    if (button && !button.contains(event.relatedTarget)) hide();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".exam-help-button");
    if (button) {
      event.preventDefault();
      if (activeButton === button && popover?.classList.contains("is-visible")) hide();
      else show(button);
      return;
    }
    hide();
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

function renderNoExam() {
  root.innerHTML = `
    <p class="tracks-kicker">Online exam</p>
    <h1 id="student-title">No exam loaded</h1>
    <p class="exam-muted">Open the Exam Builder first, then click <strong>Open student view</strong>. You can also import or save an exam there before opening this page.</p>
    <div class="exam-student-actions">
      <a class="btn-primary" href="./exam-builder.html?resume=1">Go to builder</a>
    </div>
  `;
}

function renderStartScreen() {
  root.style.setProperty("--exam-title-color", exam.titleColor || "#212121");
  root.style.setProperty("--exam-stripe-color", exam.stripeColor || "#9bf17e");

  root.innerHTML = `
    <p class="tracks-kicker">Online exam preview</p>
    <h1 id="student-title" class="exam-document-title">${escapeHTML(exam.title || "Untitled exam")}</h1>
    <p class="exam-paper-subtitle">${escapeHTML(exam.subject || "Subject / track")}</p>
    <div class="exam-paper-instructions">${escapeHTML(exam.instructions || "No instructions added.")}</div>
    <p class="exam-muted">Questions: <strong>${exam.questions.length}</strong>${exam.durationMinutes ? ` · Time limit: <strong>${escapeHTML(String(exam.durationMinutes))} minutes</strong>` : " · No time limit"}</p>
    <p class="exam-muted">The timer starts only after you click <strong>Start exam</strong>. Multiple-choice questions are selected on the page. Written answers may require teacher review.</p>
    <div class="exam-student-actions">
      <button type="button" class="btn-primary" id="startExamBtn">Start exam</button>
      ${viewerRole === "teacher" ? '<a class="btn-outline" href="./exam-builder.html?resume=1">Back to builder</a>' : ""}
    </div>
  `;

  document.getElementById("startExamBtn").addEventListener("click", startExam);
  typesetMath(root);
}

function startExam() {
  studentProfile = readCurrentProfile();
  viewerRole = readViewerRole(studentProfile, exam);
  document.body.classList.toggle("is-teacher-view", viewerRole === "teacher");
  document.body.classList.toggle("is-student-session", viewerRole !== "teacher");
  started = true;
  startedAt = new Date().toISOString();
  currentIndex = 0;

  if (remainingSeconds > 0) {
    timerInterval = setInterval(() => {
      remainingSeconds -= 1;
      const timer = document.getElementById("examTimer");
      if (timer) timer.textContent = formatTime(remainingSeconds);
      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        submitExam(true);
      }
    }, 1000);
  }

  renderQuestion();
}

function renderQuestion() {
  if (!started || submitted) return;

  const question = exam.questions[currentIndex];
  const answeredCount = exam.questions.filter((item) => hasResponse(item.id)).length;
  const progressPercent = exam.questions.length ? (answeredCount / exam.questions.length) * 100 : 0;
  const imageHtml = renderQuestionImage(question);
  const graphHtml = question.graph || question.graphBeforeText || question.graphAfterText
    ? `${renderOptionalText(question.graphBeforeText)}${question.graph ? renderGraphFigure(question.graph, `data-student-graph`, `Graph for question ${currentIndex + 1}`) : ""}${renderOptionalText(question.graphAfterText)}`
    : "";

  root.innerHTML = `
    <div class="exam-student-topbar">
      <div>
        <p class="tracks-kicker">${escapeHTML(exam.subject || "Online exam")}</p>
        <h1 id="student-title">${escapeHTML(exam.title || "Untitled exam")}</h1>
      </div>
      ${renderQuestionNavigator()}
      <div class="exam-timer" id="examTimer">${remainingSeconds > 0 ? formatTime(remainingSeconds) : "No timer"}</div>
    </div>

    <div class="exam-progress-wrap" aria-label="Exam progress">
      <div class="exam-progress-meta">
        <span>Question ${currentIndex + 1} of ${exam.questions.length}</span>
        <span>${answeredCount} answered</span>
      </div>
      <div class="exam-progress-track"><div class="exam-progress-fill" style="width: ${progressPercent}%"></div></div>
    </div>

    <article class="exam-student-question-card is-entering">
      <div class="exam-paper-question-title">
        <span>Question ${currentIndex + 1}</span>
        <span>${escapeHTML(String(question.points || 0))} pt${Number(question.points) === 1 ? "" : "s"}</span>
      </div>
      <div class="exam-student-prompt">${escapeHTML(question.prompt || "Question text not added yet.")}</div>
      ${imageHtml}
      ${graphHtml}
      ${renderResponseControl(question)}
    </article>

    <div class="exam-student-actions">
      ${currentIndex > 0
        ? '<button type="button" class="btn-outline" id="prevQuestionBtn">Previous</button>'
        : ""}
      ${currentIndex < exam.questions.length - 1
        ? '<button type="button" class="btn-secondary" id="nextQuestionBtn">Next</button>'
        : '<button type="button" class="btn-primary" id="submitExamBtn">Submit exam</button>'}
    </div>
  `;

  bindQuestionControls(question);

  const graphCanvas = root.querySelector("[data-student-graph]");
  if (graphCanvas && question.graph) {
    drawGraph(graphCanvas, question.graph);
  }

  root.querySelectorAll("[data-student-option-graph-index]").forEach((canvas) => {
    const optionIndex = Number(canvas.dataset.studentOptionGraphIndex);
    const graph = question.optionGraphs?.[optionIndex];
    if (graph && graphHasContent(graph)) drawGraph(canvas, graph);
  });

  typesetMath(root);
}

function renderQuestionNavigator() {
  if (!exam?.questions?.length) return "";
  return `
    <nav class="exam-question-navigator" aria-label="Question navigation">
      ${exam.questions.map((question, index) => {
        const isAnswered = hasResponse(question.id);
        const isCurrent = index === currentIndex;
        const label = `Question ${index + 1}${isAnswered ? ", answered" : ", unanswered"}`;
        return `
          <button
            type="button"
            class="exam-question-dot${isAnswered ? " is-answered" : ""}${isCurrent ? " is-current" : ""}"
            data-question-nav-index="${index}"
            aria-label="${escapeAttribute(label)}"
            aria-current="${isCurrent ? "true" : "false"}"
          >${index + 1}</button>
        `;
      }).join("")}
    </nav>
  `;
}


function renderOptionalText(text) {
  const value = String(text || "").trim();
  return value ? `<div class="exam-section-message">${escapeHTML(value)}</div>` : "";
}

function renderQuestionImage(question) {
  if (!question.imageData && !question.imageBeforeText && !question.imageAfterText) return "";
  const image = question.imageData
    ? `<figure class="exam-question-image"><img src="${escapeAttribute(question.imageData)}" alt="${escapeAttribute(question.imageAlt || 'Question image')}" />${question.imageAlt ? `<figcaption>${escapeHTML(question.imageAlt)}</figcaption>` : ""}</figure>`
    : "";
  return `${renderOptionalText(question.imageBeforeText)}${image}${renderOptionalText(question.imageAfterText)}`;
}

function renderGraphFigure(graph, canvasAttributes, ariaLabel) {
  const footer = graph.title
    ? `<figcaption class="exam-graph-footer">${escapeHTML(graph.title)}</figcaption>`
    : "";

  return `
    <figure class="exam-graph-figure">
      <canvas class="exam-student-graph" ${canvasAttributes} aria-label="${escapeAttribute(ariaLabel)}"></canvas>
      ${footer}
    </figure>
  `;
}

function renderStudentOptionContent(question, option, index) {
  const contentType = questionOptionContentType(question);
  const optionText = String(option || "").trim();

  if (contentType === "graph") {
    const graph = question.optionGraphs?.[index];
    const graphHtml = graph && graphHasContent(graph)
      ? renderGraphFigure(graph, `data-student-option-graph-index="${index}"`, `Graph option ${optionLetter(index)}`)
      : '<span class="exam-option-asset-missing">No graph attached.</span>';
    return `
      <span class="exam-option-content exam-option-content-graph">
        <span class="exam-option-text"><strong>${optionLetter(index)}.</strong>${optionText ? ` ${escapeHTML(optionText)}` : ""}</span>
        <span class="exam-option-media-tile exam-option-graph-tile">${graphHtml}</span>
      </span>
    `;
  }

  if (contentType === "image") {
    const image = question.optionImages?.[index];
    return `
      <span class="exam-option-content exam-option-content-image">
        <span class="exam-option-text"><strong>${optionLetter(index)}.</strong>${optionText ? ` ${escapeHTML(optionText)}` : ""}</span>
        <span class="exam-option-media-tile">${image ? `<img src="${escapeAttribute(image)}" alt="Image option ${optionLetter(index)}" />` : '<span class="exam-option-asset-missing">No image attached.</span>'}</span>
      </span>
    `;
  }

  return `<span><strong>${optionLetter(index)}.</strong> ${escapeHTML(option || "________")}</span>`;
}

function renderResponseControl(question) {
  const saved = responses[question.id];
  const baseType = questionBaseType(question);
  const visualOptionsClass = questionOptionContentType(question) !== "text" ? " has-visual-options" : "";

  if (baseType === "multiple-choice" || question.type === "true-false") {
    return `
      <div class="exam-student-options${visualOptionsClass}" role="radiogroup" aria-label="Answer choices">
        ${question.options.map((option, index) => `
          <label class="exam-student-option">
            <input type="radio" name="student-option" value="${index}" ${Number(saved) === index ? "checked" : ""} />
            ${renderStudentOptionContent(question, option, index)}
          </label>
        `).join("")}
      </div>
    `;
  }

  if (baseType === "multiple-answer") {
    const savedList = Array.isArray(saved) ? saved.map(Number) : [];
    return `
      <div class="exam-student-options${visualOptionsClass}" role="group" aria-label="Answer choices. Select all that apply.">
        <p class="exam-muted">Select all answers that apply.</p>
        ${question.options.map((option, index) => `
          <label class="exam-student-option">
            <input type="checkbox" name="student-option" value="${index}" ${savedList.includes(index) ? "checked" : ""} />
            ${renderStudentOptionContent(question, option, index)}
          </label>
        `).join("")}
      </div>
    `;
  }

  if (question.type === "essay") {
    return `
      <div class="input-group exam-student-answer">
        <label for="studentTextAnswer">Your answer</label>
        <textarea id="studentTextAnswer" rows="6" placeholder="Write your explanation here.">${escapeHTML(saved || "")}</textarea>
      </div>
    `;
  }

  if (question.type === "numeric") {
    return `
      <div class="input-group exam-student-answer">
        <div class="exam-field-heading">
          <label for="studentTextAnswer">Your numeric answer</label>
          <button
            type="button"
            class="exam-help-button"
            aria-label="Help for numeric answers"
            data-help-text="You may enter numbers, expressions, variables, sqrt(), pi, e, and tuples such as (x, 2x + 3). Multiplication can be written as 2x or 2 * x. Add units only when the question asks for them."
            title="Numeric answer help."
          >?</button>
        </div>
        <input id="studentTextAnswer" type="text" value="${escapeAttribute(saved || "")}" placeholder="Example: 5/2, sqrt(8), 2x, or (x, 2x + 3)" autocomplete="off" />
      </div>
    `;
  }

  return `
    <div class="input-group exam-student-answer">
      <label for="studentTextAnswer">Your answer</label>
      <input id="studentTextAnswer" type="text" value="${escapeAttribute(saved || "")}" placeholder="Type your answer here" />
    </div>
  `;
}

function bindQuestionControls(question) {
  bindMediaScrollGuard();

  root.querySelectorAll('input[name="student-option"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (questionAllowsMultipleCorrect(question)) {
        responses[question.id] = [...root.querySelectorAll('input[name="student-option"]:checked')].map((item) => Number(item.value));
      } else {
        responses[question.id] = Number(input.value);
      }
      updateProgressOnly();
    });
  });

  const textAnswer = document.getElementById("studentTextAnswer");
  if (textAnswer) {
    textAnswer.addEventListener("input", () => {
      responses[question.id] = textAnswer.value;
      updateProgressOnly();
    });
  }

  const prev = document.getElementById("prevQuestionBtn");
  if (prev) {
    prev.addEventListener("click", () => {
      currentIndex = Math.max(0, currentIndex - 1);
      renderQuestion();
    });
  }

  const next = document.getElementById("nextQuestionBtn");
  if (next) {
    next.addEventListener("click", () => {
      currentIndex = Math.min(exam.questions.length - 1, currentIndex + 1);
      renderQuestion();
    });
  }

  const submit = document.getElementById("submitExamBtn");
  if (submit) {
    submit.addEventListener("click", () => {
      const unanswered = exam.questions.length - exam.questions.filter((item) => hasResponse(item.id)).length;
      if (unanswered > 0) {
        const confirmed = confirm(`You still have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway?`);
        if (!confirmed) return;
      }
      submitExam(false);
    });
  }

  root.querySelectorAll("[data-question-nav-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextIndex = Number(button.dataset.questionNavIndex);
      if (!Number.isInteger(nextIndex) || nextIndex === currentIndex) return;
      currentIndex = Math.max(0, Math.min(exam.questions.length - 1, nextIndex));
      renderQuestion();
    });
  });
}

function bindMediaScrollGuard() {
  root.querySelectorAll(".exam-student-option, .exam-option-media-tile, .exam-graph-figure, .exam-question-image").forEach((target) => {
    if (target.dataset.scrollGuard === "ready") return;
    target.dataset.scrollGuard = "ready";

    target.addEventListener("pointerdown", (event) => {
      target.__scrollGuardStart = {
        x: window.scrollX,
        y: window.scrollY,
        clientX: event.clientX,
        clientY: event.clientY,
        time: Date.now()
      };
    }, { passive: true });

    target.addEventListener("click", (event) => {
      restoreOptionClickScroll(target, event);
    });

    target.addEventListener("change", (event) => {
      restoreOptionClickScroll(target, event);
    });
  });
}

function restoreOptionClickScroll(target, event) {
  const start = target.__scrollGuardStart || event.target?.closest?.(".exam-student-option")?.__scrollGuardStart;
  if (!start) return;

  const moved = Number.isFinite(event.clientX)
    ? Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY)
    : 0;
  const isRecentTap = Date.now() - start.time < 1200;
  if (!isRecentTap || moved > 10) return;

  const restore = () => {
    if (Math.abs(window.scrollY - start.y) > 1 || Math.abs(window.scrollX - start.x) > 1) {
      window.scrollTo({ left: start.x, top: start.y, behavior: "auto" });
    }
  };

  restore();
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 80);
}

function updateProgressOnly() {
  const answeredCount = exam.questions.filter((item) => hasResponse(item.id)).length;
  const progressMeta = root.querySelector(".exam-progress-meta span:last-child");
  if (progressMeta) progressMeta.textContent = `${answeredCount} answered`;
  const progressFill = root.querySelector(".exam-progress-fill");
  if (progressFill) {
    progressFill.style.width = `${exam.questions.length ? (answeredCount / exam.questions.length) * 100 : 0}%`;
  }
  root.querySelectorAll("[data-question-nav-index]").forEach((button) => {
    const index = Number(button.dataset.questionNavIndex);
    const question = exam.questions[index];
    const isAnswered = question ? hasResponse(question.id) : false;
    button.classList.toggle("is-answered", isAnswered);
    button.setAttribute("aria-label", `Question ${index + 1}${isAnswered ? ", answered" : ", unanswered"}`);
  });
}

function hasResponse(questionId) {
  const value = responses[questionId];
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function submitExam(timeExpired) {
  if (submitted) return;
  submitted = true;
  if (timerInterval) clearInterval(timerInterval);

  try {
    const submittedAt = new Date().toISOString();
    const result = gradeExam(exam, responses, {
      startedAt,
      submittedAt,
      timeExpired: Boolean(timeExpired),
      respondentName: studentProfile.respondentName,
      degreeLevel: studentProfile.degreeLevel,
      profileId: studentProfile.id,
      viewerRole
    });
    result.submission = buildSubmissionPayload(result);

    saveResultForResultsPage(result);
    window.setTimeout(() => {
      window.location.href = `./exam-results.html?resultId=${encodeURIComponent(result.id)}`;
    }, 80);
  } catch (error) {
    console.error("Could not submit the exam.", error);
    submitted = false;
    alert("The exam could not be submitted in this browser. Try clearing older local results or using a smaller image, then submit again.");
  }
}

function saveResultForResultsPage(result) {
  let latestSaved = false;
  try {
    sessionStorage.setItem(LATEST_RESULT_KEY, JSON.stringify(result));
    latestSaved = true;
  } catch (error) {
    console.warn("Could not save the latest result in session storage.", error);
  }

  try {
    const results = readResults();
    results.unshift(result);
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results.slice(0, 20)));
    return;
  } catch (error) {
    console.warn("Could not save result history in local storage.", error);
  }

  if (!latestSaved) {
    throw new Error("Browser storage rejected the submitted exam result.");
  }
}

function gradeExam(examData, answerMap, meta) {
  const result = {
    id: crypto.randomUUID ? crypto.randomUUID() : `result-${Date.now()}-${Math.random()}`,
    examId: examData.id,
    title: examData.title,
    subject: examData.subject,
    instructions: examData.instructions,
    respondentName: meta.respondentName || "",
    degreeLevel: meta.degreeLevel || "",
    profileId: meta.profileId || "",
    viewerRole: meta.viewerRole || "student",
    assignedBy: examData.madeBy || EXAM_MADE_BY_PLACEHOLDER,
    titleColor: examData.titleColor || "#212121",
    stripeColor: examData.stripeColor || "#9bf17e",
    startedAt: meta.startedAt,
    submittedAt: meta.submittedAt,
    durationSeconds: getDurationSeconds(meta.startedAt, meta.submittedAt),
    timeExpired: meta.timeExpired,
    autoEarned: 0,
    autoPossible: 0,
    totalPossible: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    partialCount: 0,
    reviewCount: 0,
    reviewNeeded: 0,
    items: []
  };

  examData.questions.forEach((question, index) => {
    const points = Number(question.points || 0);
    const response = answerMap[question.id];
    const item = gradeQuestion(question, response, index);
    item.points = points;
    item.earnedPoints = Number.isFinite(Number(item.earnedPoints)) ? Number(item.earnedPoints) : 0;

    result.totalPossible += points;
    if (item.autoGradable) {
      result.autoPossible += points;
      result.autoEarned += item.earnedPoints;
    }

    result.items.push(item);
  });

  result.answeredCount = examData.questions.filter((question) => hasResponse(question.id)).length;
  result.correctCount = result.items.filter((item) => item.status === "correct").length;
  result.wrongCount = result.items.filter((item, index) => item.status === "incorrect" && hasResponse(examData.questions[index]?.id)).length;
  result.partialCount = result.items.filter((item) => item.status === "partial").length;
  result.reviewCount = result.items.filter((item, index) => item.status === "review" && hasResponse(examData.questions[index]?.id)).length;
  result.reviewNeeded = result.items.reduce((sum, item, index) => {
    if (item.autoGradable || !hasResponse(examData.questions[index]?.id)) return sum;
    return sum + Math.max(0, Number(item.points) || 0);
  }, 0);
  result.autoEarned = Number(result.autoEarned.toFixed(4));
  result.scorePercent = result.autoPossible > 0
    ? Number(((result.autoEarned / result.autoPossible) * 100).toFixed(2))
    : null;
  return result;
}

function gradeQuestion(question, response, index) {
  const item = {
    questionNumber: index + 1,
    questionId: question.id,
    questionName: question.name,
    type: question.type,
    prompt: question.prompt,
    response,
    expectedAnswer: question.answer,
    options: Array.isArray(question.options) ? question.options : [],
    optionContentType: questionOptionContentType(question),
    optionGraphs: normalizeOptionGraphs(question.optionGraphs, Array.isArray(question.options) ? question.options.length : 0),
    optionImages: normalizeOptionImages(question.optionImages, Array.isArray(question.options) ? question.options.length : 0),
    imageBeforeText: question.imageBeforeText,
    imageData: question.imageData,
    imageAlt: question.imageAlt,
    imageAfterText: question.imageAfterText,
    graphBeforeText: question.graphBeforeText,
    graphAfterText: question.graphAfterText,
    graph: question.graph && graphHasContent(question.graph) ? normalizeGraph(question.graph) : null,
    pdfAnswerSpaceSize: normalizePdfAnswerSpaceSize(question.pdfAnswerSpaceSize, question.type),
    pdfAnswerSpaceCustomMm: normalizePdfAnswerSpaceCustomMm(question.pdfAnswerSpaceCustomMm),
    autoGradable: false,
    isCorrect: false,
    earnedPoints: 0,
    status: "review"
  };

  const points = Number(question.points || 0);

  if (questionBaseType(question) === "multiple-choice" || question.type === "true-false") {
    item.autoGradable = true;
    item.correctOptionIndex = question.correctOptionIndex;
    item.correctOptionText = question.options[question.correctOptionIndex] || "";
    item.responseText = Number.isInteger(Number(response)) ? question.options[Number(response)] || "" : "";
    item.isCorrect = Number(response) === Number(question.correctOptionIndex);
    item.earnedPoints = item.isCorrect ? points : 0;
    item.status = item.isCorrect ? "correct" : "incorrect";
    return item;
  }

  if (questionBaseType(question) === "multiple-answer") {
    item.autoGradable = true;
    const selected = Array.isArray(response) ? response.map(Number).filter(Number.isInteger) : [];
    const correct = Array.isArray(question.correctOptionIndexes) ? question.correctOptionIndexes.map(Number).filter(Number.isInteger) : [];
    item.correctOptionIndexes = correct;
    item.correctOptionTexts = correct.map((index) => question.options[index] || "");
    item.responseTexts = selected.map((index) => question.options[index] || "");

    if (correct.length === 0) {
      item.earnedPoints = selected.length === 0 ? points : 0;
    } else {
      const correctSelected = selected.filter((index) => correct.includes(index)).length;
      item.earnedPoints = points * (correctSelected / correct.length);
    }

    item.earnedPoints = Number(item.earnedPoints.toFixed(4));
    item.isCorrect = item.earnedPoints === points;
    item.status = item.earnedPoints === points ? "correct" : item.earnedPoints > 0 ? "partial" : "incorrect";
    return item;
  }

  if (question.type === "numeric") {
    const numericAnswerKey = String(question.numericExpectedAnswer || "").trim() || String(question.answer || "").trim();
    const numericResult = window.KelpNumericAnswer?.grade(numericAnswerKey, response, question);
    item.expectedAnswer = numericAnswerKey;
    item.teacherNotes = question.answer;
    item.numericFeedback = numericResult?.message || "Numeric grading engine is unavailable.";
    if (numericResult?.gradable) {
      item.autoGradable = true;
      item.isCorrect = Boolean(numericResult.isCorrect);
      item.earnedPoints = item.isCorrect ? points : 0;
      item.status = item.isCorrect ? "correct" : "incorrect";
    }
    return item;
  }

  return item;
}

function buildSubmissionPayload(result) {
  return {
    schema: "kelp-exam-submission-v1",
    profileId: result.profileId || "",
    respondentName: result.respondentName || "",
    date: result.submittedAt || new Date().toISOString(),
    degreeLevel: result.degreeLevel || "",
    subject: result.subject || "",
    whoAssigned: result.assignedBy || EXAM_MADE_BY_PLACEHOLDER,
    examTitle: result.title || "",
    questionCount: Number(result.items?.length || 0),
    answeredCount: Number(result.answeredCount || 0),
    correctCount: Number(result.correctCount || 0),
    wrongCount: Number(result.wrongCount || 0),
    partialCount: Number(result.partialCount || 0),
    reviewCount: Number(result.reviewCount || 0),
    score: {
      earnedPoints: Number(result.autoEarned || 0),
      possibleAutoGradedPoints: Number(result.autoPossible || 0),
      totalExamPoints: Number(result.totalPossible || 0),
      percent: result.scorePercent
    },
    durationSeconds: Number(result.durationSeconds || 0),
    duration: formatDuration(result.durationSeconds || 0),
    questions: (result.items || []).map((item) => ({
      questionNumber: item.questionNumber,
      questionName: item.questionName || "",
      type: item.type,
      status: item.status,
      answer: getSubmissionAnswer(item),
      expectedAnswer: getSubmissionExpectedAnswer(item)
    }))
  };
}

function getSubmissionAnswer(item) {
  if (item.type === "multiple-choice" || item.type === "true-false") {
    if (item.response === undefined || item.response === null || item.response === "") return "";
    return `${optionLetter(Number(item.response))}. ${item.responseText || ""}`.trim();
  }
  if (item.type === "multiple-answer") {
    const responseIndexes = Array.isArray(item.response) ? item.response.map(Number) : [];
    const texts = Array.isArray(item.responseTexts) ? item.responseTexts : [];
    return responseIndexes.map((index, position) => `${optionLetter(index)}. ${texts[position] || ""}`.trim()).join("; ");
  }
  return String(item.response ?? "").trim();
}

function getSubmissionExpectedAnswer(item) {
  if (item.type === "multiple-choice" || item.type === "true-false") {
    return `${optionLetter(Number(item.correctOptionIndex))}. ${item.correctOptionText || ""}`.trim();
  }
  if (item.type === "multiple-answer") {
    const indexes = Array.isArray(item.correctOptionIndexes) ? item.correctOptionIndexes : [];
    const texts = Array.isArray(item.correctOptionTexts) ? item.correctOptionTexts : [];
    return indexes.map((index, position) => `${optionLetter(index)}. ${texts[position] || ""}`.trim()).join("; ");
  }
  if (item.type === "numeric") return String(item.expectedAnswer || "").trim();
  return String(item.expectedAnswer || item.teacherNotes || "").trim();
}

function getDurationSeconds(start, end) {
  const startMs = Date.parse(start || "");
  const endMs = Date.parse(end || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.round((endMs - startMs) / 1000);
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "kelp-exam";
}

function readResults() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeExam(examData) {
  return {
    id: String(examData.id || "active-exam"),
    title: String(examData.title || ""),
    madeBy: String(examData.madeBy || EXAM_MADE_BY_PLACEHOLDER),
    viewerRole: isTeacherRole(examData.viewerRole) ? "teacher" : "student",
    subject: String(examData.subject || ""),
    instructions: String(examData.instructions || ""),
    durationMinutes: Number.isFinite(Number(examData.durationMinutes)) ? Number(examData.durationMinutes) : 0,
    titleColor: /^#[0-9a-f]{6}$/i.test(String(examData.titleColor || "")) ? examData.titleColor : "#212121",
    stripeColor: /^#[0-9a-f]{6}$/i.test(String(examData.stripeColor || "")) ? examData.stripeColor : "#9bf17e",
    questions: Array.isArray(examData.questions) ? examData.questions.map(normalizeQuestion) : []
  };
}

function normalizeQuestion(question) {
  const options = Array.isArray(question.options) && question.options.length
    ? question.options.map((option) => String(option || ""))
    : ["", "", "", ""];

  const type = normalizeQuestionType(question.type);
  const finalOptions = type === "true-false" ? ["True", "False"] : options;
  const rawCorrectIndexes = Array.isArray(question.correctOptionIndexes)
    ? question.correctOptionIndexes
    : Number.isInteger(Number(question.correctOptionIndex))
      ? [Number(question.correctOptionIndex)]
      : [];

  return {
    id: String(question.id || `q-${Math.random()}`),
    name: String(question.name || ""),
    type,
    prompt: String(question.prompt || ""),
    points: Number.isFinite(Number(question.points)) ? Number(question.points) : 1,
    answer: String(question.answer || ""),
    options: finalOptions,
    correctOptionIndex: Number.isInteger(Number(question.correctOptionIndex))
      ? Math.max(0, Math.min(Number(question.correctOptionIndex), finalOptions.length - 1))
      : 0,
    correctOptionIndexes: [...new Set(rawCorrectIndexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value < finalOptions.length))],
    imageBeforeText: String(question.imageBeforeText || ""),
    imageData: String(question.imageData || ""),
    imageAlt: String(question.imageAlt || ""),
    imageAfterText: String(question.imageAfterText || ""),
    graphBeforeText: String(question.graphBeforeText || ""),
    graphAfterText: String(question.graphAfterText || ""),
    graph: question.graph && graphHasContent(question.graph) ? normalizeGraph(question.graph) : null,
    optionGraphs: normalizeOptionGraphs(question.optionGraphs, finalOptions.length),
    optionImages: normalizeOptionImages(question.optionImages, finalOptions.length),
    pdfAnswerSpaceSize: normalizePdfAnswerSpaceSize(question.pdfAnswerSpaceSize, type),
    pdfAnswerSpaceCustomMm: normalizePdfAnswerSpaceCustomMm(question.pdfAnswerSpaceCustomMm),
    numericExpectedAnswer: String(question.numericExpectedAnswer || ""),
    numericExactMatch: normalizeStoredBoolean(question.numericExactMatch),
    numericTolerance: normalizeNumericTolerance(question.numericTolerance),
    numericAngleMode: question.numericAngleMode === "degrees" ? "degrees" : "radians",
    numericRequireUnit: normalizeStoredBoolean(question.numericRequireUnit),
    numericUnit: String(question.numericUnit || "").trim()
  };
}

function normalizeGraph(graph) {
  const graphType = ["function", "points", "both"].includes(graph.graphType) ? graph.graphType : "function";
  const pointsText = String(graph.pointsText || pointsToText(Array.isArray(graph.points) ? graph.points : []));
  const points = parsePoints(pointsText);

  return {
    graphType,
    title: String(graph.title || graph.label || ""),
    expression: String(graph.expression || ""),
    pointsText,
    points,
    xMin: parseNumberOrDefault(graph.xMin, -10),
    xMax: parseNumberOrDefault(graph.xMax, 10),
    yMin: parseOptionalNumber(graph.yMin),
    yMax: parseOptionalNumber(graph.yMax)
  };
}

function graphHasContent(graph) {
  if (!graph) return false;
  const graphType = graph.graphType || "function";
  const hasExpression = String(graph.expression || "").trim() !== "";
  const hasPoints = parsePoints(String(graph.pointsText || pointsToText(Array.isArray(graph.points) ? graph.points : []))).length > 0;
  return (graphType === "function" && hasExpression) || (graphType === "points" && hasPoints) || (graphType === "both" && (hasExpression || hasPoints));
}

function parseNumberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function parsePoints(text) {
  const input = String(text || "");
  const matches = [...input.matchAll(/\(?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[,;]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)?/gi)];
  return matches
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function pointsToText(points) {
  return (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
    .map((point) => `(${roundGraphCoordinate(point.x)}, ${roundGraphCoordinate(point.y)})`)
    .join(", ");
}

function roundGraphCoordinate(value) {
  return Number.parseFloat(Number(value).toFixed(2));
}

function drawGraph(canvas, rawGraph) {
  if (shouldUseKelpDiagramRenderer(rawGraph)) {
    try {
      if (window.KelpDiagramEditor.renderToCanvas(canvas, rawGraph)) return;
    } catch (error) {
      console.warn("Could not render diagram editor graph.", error);
    }
  }
  const graph = normalizeGraph(rawGraph);
  const size = getSquareCanvasSize(canvas);
  const cssWidth = size;
  const cssHeight = size;
  const scale = window.devicePixelRatio || 1;

  canvas.width = cssWidth * scale;
  canvas.height = cssHeight * scale;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { left: 36, right: 40, top: 42, bottom: 32 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;
  const xMin = Number(graph.xMin);
  const xMax = Number(graph.xMax);
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
    drawGraphError(ctx, cssWidth, cssHeight, "Use a valid x-domain.");
    return;
  }
  let points = [];
  let fnPoints = [];
  const needsFunction = graph.graphType === "function" || graph.graphType === "both";
  const needsPoints = graph.graphType === "points" || graph.graphType === "both";

  if (needsFunction && graph.expression) {
    let fn;
    try { fn = compileExpression(graph.expression); } catch (error) { drawGraphError(ctx, cssWidth, cssHeight, error.message); return; }
    const samples = 700;
    for (let i = 0; i <= samples; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      let y;
      try { y = fn(x); } catch (_) { y = NaN; }
      fnPoints.push({ x, y });
    }
  }

  if (needsPoints) points = Array.isArray(graph.points) ? graph.points : parsePoints(graph.pointsText);

  const finiteYs = [...fnPoints.map((point) => point.y), ...points.map((point) => point.y)].filter(Number.isFinite);
  let yMin = graph.yMin === "" ? Math.min(...finiteYs, -10) : Number(graph.yMin);
  let yMax = graph.yMax === "" ? Math.max(...finiteYs, 10) : Number(graph.yMax);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
    const center = Number.isFinite(yMin) ? yMin : 0;
    yMin = center - 10;
    yMax = center + 10;
  }
  const paddingY = graph.yMin === "" && graph.yMax === "" ? (yMax - yMin) * 0.04 || 1 : 0;
  yMin -= paddingY;
  yMax += paddingY;

  const toPx = (x, y) => ({
    px: padding.left + ((x - xMin) / (xMax - xMin)) * plotWidth,
    py: padding.top + ((yMax - y) / (yMax - yMin)) * plotHeight
  });

  drawGrid(ctx, { width: cssWidth, height: cssHeight, padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx, graph });
  if (fnPoints.length) drawCurve(ctx, fnPoints, { toPx, yMin, yMax, plotHeight });
  if (points.length) drawPoints(ctx, points, { toPx, xMin, xMax, yMin, yMax });
  drawGraphCanvasTitle(ctx, graph, cssWidth);
}

function shouldUseKelpDiagramRenderer(graph) {
  if (!window.KelpDiagramEditor?.renderToCanvas || !graph) return false;
  return (Array.isArray(graph.functions) && graph.functions.length > 0)
    || graph.graphType === "diagram"
    || graph.displayMode
    || Array.isArray(graph.shapes)
    || Array.isArray(graph.segments)
    || Array.isArray(graph.angles);
}

function getSquareCanvasSize(canvas) {
  const host = canvas.parentElement || canvas;
  const hostWidth = Math.floor(host.getBoundingClientRect().width || canvas.getBoundingClientRect().width || 360);
  return Math.max(240, Math.min(440, hostWidth - 8));
}

function drawGrid(ctx, meta) {
  const { width, height, padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx, graph } = meta;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#e7ece9";
  ctx.fillStyle = "rgba(33, 33, 33, 0.62)";
  ctx.font = "11px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  const verticalTicks = 8;
  const horizontalTicks = 8;
  for (let i = 0; i <= verticalTicks; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / verticalTicks;
    const { px } = toPx(x, yMin);
    ctx.beginPath(); ctx.moveTo(px, padding.top); ctx.lineTo(px, padding.top + plotHeight); ctx.stroke();
    ctx.fillText(formatTick(x), px, height - 14);
  }
  ctx.textAlign = "right";
  for (let i = 0; i <= horizontalTicks; i += 1) {
    const y = yMin + ((yMax - yMin) * i) / horizontalTicks;
    const { py } = toPx(xMin, y);
    ctx.beginPath(); ctx.moveTo(padding.left, py); ctx.lineTo(padding.left + plotWidth, py); ctx.stroke();
    ctx.fillText(formatTick(y), padding.left - 7, py + 4);
  }
  ctx.strokeStyle = "#cfd9d4";
  ctx.lineWidth = 1;
  ctx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);
  drawAxes(ctx, meta);
  drawAxisTickMarks(ctx, meta, verticalTicks, horizontalTicks);
  drawAxisLabels(ctx, meta, graph);
  ctx.restore();
}

function drawAxes(ctx, meta) {
  const { padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx } = meta;
  ctx.save();
  ctx.strokeStyle = "#5f6f66";
  ctx.fillStyle = "#5f6f66";
  ctx.lineWidth = 2.15;
  if (xMin <= 0 && xMax >= 0) {
    const { px } = toPx(0, yMin);
    ctx.beginPath(); ctx.moveTo(px, padding.top + plotHeight); ctx.lineTo(px, padding.top); ctx.stroke();
    drawArrowhead(ctx, px, padding.top, "up");
  }
  if (yMin <= 0 && yMax >= 0) {
    const { py } = toPx(xMin, 0);
    ctx.beginPath(); ctx.moveTo(padding.left, py); ctx.lineTo(padding.left + plotWidth, py); ctx.stroke();
    drawArrowhead(ctx, padding.left + plotWidth, py, "right");
  }
  ctx.restore();
}


function drawAxisTickMarks(ctx, meta, verticalTicks, horizontalTicks) {
  const { padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx } = meta;
  ctx.save();
  ctx.strokeStyle = "#5f6f66";
  ctx.lineWidth = 1.65;
  if (yMin <= 0 && yMax >= 0) {
    const { py } = toPx(xMin, 0);
    for (let i = 0; i <= verticalTicks; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / verticalTicks;
      const { px } = toPx(x, 0);
      if (px < padding.left || px > padding.left + plotWidth) continue;
      ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke();
    }
  }
  if (xMin <= 0 && xMax >= 0) {
    const { px } = toPx(0, yMin);
    for (let i = 0; i <= horizontalTicks; i += 1) {
      const y = yMin + ((yMax - yMin) * i) / horizontalTicks;
      const { py } = toPx(0, y);
      if (py < padding.top || py > padding.top + plotHeight) continue;
      ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawArrowhead(ctx, x, y, direction) {
  const size = 8;
  ctx.beginPath();
  if (direction === "right") {
    ctx.moveTo(x, y); ctx.lineTo(x - size, y - size * 0.55); ctx.lineTo(x - size, y + size * 0.55);
  } else {
    ctx.moveTo(x, y); ctx.lineTo(x - size * 0.55, y + size); ctx.lineTo(x + size * 0.55, y + size);
  }
  ctx.closePath(); ctx.fill();
}

function drawAxisLabels(ctx, meta, graph) {
  const { padding, plotWidth, xMin, xMax, yMin, yMax, toPx } = meta;
  ctx.save();
  ctx.fillStyle = "#145c63";
  ctx.font = "600 13px Inter, Arial, sans-serif";
  if (yMin <= 0 && yMax >= 0) {
    const { py } = toPx(xMax, 0);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("x", padding.left + plotWidth + 7, py - 9);
  }
  if (xMin <= 0 && xMax >= 0) {
    const { px } = toPx(0, yMax);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(formatYAxisExpression(graph), Math.min(padding.left + plotWidth - 8, px + 10), padding.top - 7);
  }
  ctx.restore();
}

function drawCurve(ctx, points, meta) {
  const { toPx, yMin, yMax, plotHeight } = meta;
  let startedCurve = false;
  let previous = null;
  ctx.save();
  ctx.strokeStyle = "#145c63";
  ctx.lineWidth = 2.35;
  ctx.beginPath();
  points.forEach((point) => {
    if (!Number.isFinite(point.y) || point.y < yMin - Math.abs(yMax - yMin) || point.y > yMax + Math.abs(yMax - yMin)) {
      startedCurve = false; previous = null; return;
    }
    const current = toPx(point.x, point.y);
    const jumpIsTooLarge = previous && Math.abs(current.py - previous.py) > plotHeight * 0.85;
    if (!startedCurve || jumpIsTooLarge) { ctx.moveTo(current.px, current.py); startedCurve = true; }
    else { ctx.lineTo(current.px, current.py); }
    previous = current;
  });
  ctx.stroke();
  ctx.restore();
}

function drawPoints(ctx, points, meta) {
  const { toPx, xMin, xMax, yMin, yMax } = meta;
  ctx.save();
  ctx.fillStyle = "#145c63";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  points.forEach((point) => {
    if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) return;
    const { px, py } = toPx(point.x, point.y);
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

function drawGraphCanvasTitle(ctx, graph, width) {
  return;
}

function drawGraphError(ctx, width, height, message) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#c62828";
  ctx.font = "14px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function compileExpression(rawExpression) {
  const normalized = normalizeMathExpression(rawExpression);
  const identifiers = normalized.match(/[a-zA-Z_]+/g) || [];
  const allowed = new Set(["x", "sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "log", "exp", "floor", "ceil", "round", "pow", "min", "max", "pi", "e"]);
  const invalid = identifiers.find((identifier) => !allowed.has(identifier));
  if (invalid) throw new Error(`Unsupported term: ${invalid}.`);
  if (!/^[0-9x+\-*/().,\sA-Za-z_*]+$/.test(normalized)) throw new Error("Unsupported graph expression.");

  const body = `
    "use strict";
    const { sin, cos, tan, asin, acos, atan, sqrt, abs, log, exp, floor, ceil, round, pow, min, max } = Math;
    const pi = Math.PI;
    const e = Math.E;
    return (${normalized});
  `;
  const fn = new Function("x", body);
  return (x) => Number(fn(x));
}

function normalizeMathExpression(expression) {
  let output = String(expression || "").trim().toLowerCase();
  output = output.replace(/^y\s*=\s*/, "");
  output = output.replace(/^f\s*\(\s*x\s*\)\s*=\s*/, "");
  output = output.replace(/π/g, "pi").replace(/−/g, "-").replace(/\^/g, "**").replace(/\bln\s*\(/g, "log(");
  const functionNames = "sin|cos|tan|asin|acos|atan|sqrt|abs|log|exp|floor|ceil|round|pow|min|max";
  output = output.replace(new RegExp(`(\\d|\\)|x|pi|e)\\s*(?=(${functionNames})\\s*\\()`, "g"), "$1*");
  output = output.replace(/(\d|\)|x|pi|e)\s*(?=(x|pi|e|\())/g, "$1*");
  return output;
}

function normalizeNumericTolerance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1e-6;
  return Math.max(1e-12, Math.min(1, parsed));
}

function normalizeStoredBoolean(value) {
  return value === true || value === 1 || value === "true" || value === "1";
}

function parseStrictNumber(value) {
  const cleaned = String(value ?? "").trim().replace(/[$\\]/g, "");
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[$\\{}]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function formatYAxisExpression(graph) {
  if (!graph) return "y";
  const expression = String(graph.expression || "").trim();
  if (!expression || graph.graphType === "points") return "y";
  return `y = ${formatMathLabel(expression)}`;
}

function formatMathLabel(expression) {
  let text = String(expression || "").trim();
  text = text.replace(/^y\s*=\s*/i, "");
  text = text.replace(/\*/g, "·");
  text = text.replace(/\bpi\b/gi, "π");
  text = text.replace(/\bsqrt\s*\(\s*([^)]+?)\s*\)/gi, (_, inner) => {
    const clean = inner.trim();
    return /^[a-z0-9π.]+$/i.test(clean) ? `√${clean}` : `√(${clean})`;
  });
  return text
    .replace(/\^2\b/g, "²")
    .replace(/\^3\b/g, "³")
    .replace(/\^4\b/g, "⁴")
    .replace(/\^5\b/g, "⁵");
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function optionLetter(index) {
  return String.fromCharCode(65 + index);
}

function formatTick(value) {
  if (Math.abs(value) >= 100 || (Math.abs(value) < 0.01 && value !== 0)) return value.toExponential(1);
  return Number(value.toFixed(2)).toString();
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value).replace(/`/g, "&#096;");
}

function typesetMath(element = document.body) {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetClear?.([element]);
    window.MathJax.typesetPromise([element]).catch((error) => console.error(error));
  }
}

/* ===== Diagram compatibility: vectors and circuit symbols ===== */
(function () {
  const circuitSymbolLabels = {
    resistor: "Resistor",
    variableResistor: "Variable resistor",
    battery: "Battery",
    ammeter: "Ammeter",
    voltmeter: "Voltmeter",
    inductor: "Inductor",
    earth: "Earth electrode",
    capacitor: "Capacitor"
  };

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ""));
  }

  function hexToRgba(hex, alpha) {
    const safe = isHexColor(hex) ? hex : "#e8f7f9";
    const numeric = Number.parseInt(safe.slice(1), 16);
    const r = (numeric >> 16) & 255;
    const g = (numeric >> 8) & 255;
    const b = numeric & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, Number(alpha)))})`;
  }

  function sanitizeGraphLabel(value, fallback = "") {
    const label = String(value || "").trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 12);
    return label || fallback;
  }

  function normalizeDiagramPoint(point, index = 0) {
    const coordinateLabelModes = ["name", "variableY", "xVariable", "coordinates", "nameVariableY", "nameXVariable", "nameCoordinates"];
    return {
      label: sanitizeGraphLabel(point?.label, `P${index + 1}`),
      x: parseNumberOrDefault(point?.x, 0),
      y: parseNumberOrDefault(point?.y, 0),
      labelDx: parseNumberOrDefault(point?.labelDx, 8),
      labelDy: parseNumberOrDefault(point?.labelDy, -7),
      labelBasisWidth: Math.max(0, parseNumberOrDefault(point?.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, parseNumberOrDefault(point?.labelBasisHeight, 0)),
      labelHidden: Boolean(point?.labelHidden),
      color: isHexColor(point?.color) ? point.color : "#145c63",
      size: Math.max(2, parseNumberOrDefault(point?.size, 5)),
      visible: point?.visible !== false,
      coordinateLabelMode: coordinateLabelModes.includes(point?.coordinateLabelMode) ? point.coordinateLabelMode : "name",
      coordinatePrecision: Math.max(0, Math.min(3, Math.floor(parseNumberOrDefault(point?.coordinatePrecision, 2)))),
      coordinateVariable: String(point?.coordinateVariable || "").trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 8)
    };
  }

  function normalizeDiagramShapePoint(point, index = 0) {
    return {
      label: sanitizeGraphLabel(point?.label, `P${index + 1}`),
      x: parseNumberOrDefault(point?.x, 0),
      y: parseNumberOrDefault(point?.y, 0),
      labelDx: parseNumberOrDefault(point?.labelDx, 8),
      labelDy: parseNumberOrDefault(point?.labelDy, -7),
      labelBasisWidth: Math.max(0, parseNumberOrDefault(point?.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, parseNumberOrDefault(point?.labelBasisHeight, 0)),
      labelHidden: Boolean(point?.labelHidden),
      color: isHexColor(point?.color) ? point.color : "#145c63",
      size: Math.max(2, parseNumberOrDefault(point?.size, 4)),
      visible: point?.visible !== false
    };
  }

  function normalizeDiagramSegment(segment) {
    if (!segment || typeof segment !== "object") return null;
    const from = sanitizeGraphLabel(segment.from);
    const to = sanitizeGraphLabel(segment.to);
    if (!from || !to || from === to) return null;
    return {
      from,
      to,
      labelMode: ["name", "length", "variable", "hidden"].includes(segment.labelMode) ? segment.labelMode : "name",
      visible: segment.visible !== false,
      color: isHexColor(segment.color) ? segment.color : "#145c63",
      lineWidth: Math.max(1, parseNumberOrDefault(segment.lineWidth, 2)),
      lineDash: ["solid", "dashed", "dotted", "arrow"].includes(segment.lineDash) ? segment.lineDash : "solid",
      showEndpointPoints: Boolean(segment.showEndpointPoints),
      precision: Math.max(0, Math.min(3, Math.floor(parseNumberOrDefault(segment.precision, 2)))),
      labelDx: parseNumberOrDefault(segment.labelDx, 0),
      labelDy: parseNumberOrDefault(segment.labelDy, -10),
      labelBasisWidth: Math.max(0, parseNumberOrDefault(segment.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, parseNumberOrDefault(segment.labelBasisHeight, 0))
    };
  }

  function projectCircleRadiusPoint(shape) {
    const center = normalizeDiagramShapePoint(shape.center || {});
    const radius = Math.max(0.1, parseNumberOrDefault(shape.radius, 2));
    const raw = normalizeDiagramShapePoint(shape.radiusPoint || { x: center.x + radius, y: center.y });
    const dx = raw.x - center.x;
    const dy = raw.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      ...raw,
      x: center.x + (dx / length) * radius,
      y: center.y + (dy / length) * radius
    };
  }

  function normalizeDiagramShape(shape, index = 0) {
    if (!shape || typeof shape !== "object") return null;
    const type = ["regularPolygon", "irregularPolygon", "circle", "ellipse", "trapezoid", "parallelogram", "latexText", "circuitSymbol"].includes(shape.type)
      ? shape.type
      : "irregularPolygon";
    const base = {
      id: String(shape.id || `${type}-${index + 1}`),
      type,
      label: String(shape.label || circuitSymbolLabels[shape.symbolKind] || "").trim(),
      visible: shape.visible !== false,
      stroke: isHexColor(shape.stroke) ? shape.stroke : "#145c63",
      fill: isHexColor(shape.fill) ? shape.fill : "#e8f7f9",
      fillOpacity: Number.isFinite(Number(shape.fillOpacity)) ? Math.max(0, Math.min(1, Number(shape.fillOpacity))) : 0.36,
      lineWidth: Math.max(1, parseNumberOrDefault(shape.lineWidth, 2)),
      lineDash: ["solid", "dashed", "dotted"].includes(shape.lineDash) ? shape.lineDash : "solid"
    };

    if (type === "latexText") {
      return {
        ...base,
        text: String(shape.text || shape.label || ""),
        x: parseNumberOrDefault(shape.x, 0),
        y: parseNumberOrDefault(shape.y, 0),
        fontSize: Math.max(8, parseNumberOrDefault(shape.fontSize, 18)),
        fill: isHexColor(shape.fill) ? shape.fill : "#145c63"
      };
    }

    if (type === "regularPolygon") {
      return {
        ...base,
        sides: Math.max(3, Math.floor(parseNumberOrDefault(shape.sides, 3))),
        radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 4)),
        rotation: parseNumberOrDefault(shape.rotation, 90),
        centerX: parseNumberOrDefault(shape.centerX, 0),
        centerY: parseNumberOrDefault(shape.centerY, 0),
        showCenter: Boolean(shape.showCenter),
        showApothem: Boolean(shape.showApothem),
        vertexLabels: Array.isArray(shape.vertexLabels) ? shape.vertexLabels.map((label) => sanitizeGraphLabel(label)).filter(Boolean) : [],
        vertexLabelOffsets: Array.isArray(shape.vertexLabelOffsets) ? shape.vertexLabelOffsets : [],
        vertexLabelHidden: Array.isArray(shape.vertexLabelHidden) ? shape.vertexLabelHidden.map(Boolean) : []
      };
    }

    if (type === "circle") {
      return {
        ...base,
        center: normalizeDiagramShapePoint(shape.center || {}, 0),
        radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 2)),
        radiusPoint: projectCircleRadiusPoint(shape),
        showCenter: Boolean(shape.showCenter),
        showRadiusPoint: Boolean(shape.showRadiusPoint)
      };
    }

    if (type === "ellipse") {
      return {
        ...base,
        focus1: normalizeDiagramShapePoint(shape.focus1 || { x: -1, y: 0 }, 0),
        focus2: normalizeDiagramShapePoint(shape.focus2 || { x: 1, y: 0 }, 1),
        through: normalizeDiagramShapePoint(shape.through || { x: 0, y: 1 }, 2)
      };
    }

    if (type === "circuitSymbol") {
      const width = Math.max(1, parseNumberOrDefault(shape.width, 3.8));
      const height = Math.max(0.4, parseNumberOrDefault(shape.height, 1.6));
      const centerX = parseNumberOrDefault(shape.centerX, 0);
      const centerY = parseNumberOrDefault(shape.centerY, 0);
      const points = Array.isArray(shape.points) && shape.points.length >= 2
        ? shape.points.slice(0, 2).map((point, pointIndex) => ({
            ...normalizeDiagramShapePoint(point, pointIndex),
            label: sanitizeGraphLabel(point.label, `T${index + 1}${pointIndex + 1}`),
            labelHidden: point.labelHidden !== false
          }))
        : [
            { ...normalizeDiagramShapePoint({ label: `T${index + 1}1`, x: centerX - width / 2, y: centerY }, 0), labelHidden: true },
            { ...normalizeDiagramShapePoint({ label: `T${index + 1}2`, x: centerX + width / 2, y: centerY }, 1), labelHidden: true }
          ];
      let terminals = Array.isArray(shape.terminals) && shape.terminals.length
        ? shape.terminals.map((point, terminalIndex) => ({
            ...normalizeDiagramShapePoint(point, terminalIndex),
            label: sanitizeGraphLabel(point.label, points[terminalIndex]?.label || `T${index + 1}${terminalIndex + 1}`),
            labelHidden: true
          }))
        : points.map((point) => ({ ...point, labelHidden: true }));
      if ((!Array.isArray(shape.terminals) || !shape.terminals.length) && shape.symbolKind === "earth") {
        const start = points[0];
        const end = points[1];
        const dx = Number(end.x) - Number(start.x);
        const dy = Number(end.y) - Number(start.y);
        const length = Math.hypot(dx, dy) || 1;
        terminals = [{
          ...normalizeDiagramShapePoint({
            label: start.label,
            x: Number(start.x) + dx / 2 + (-dy / length) * height * 0.31,
            y: Number(start.y) + dy / 2 + (dx / length) * height * 0.31
          }, 0),
          labelHidden: true
        }];
      }
      return {
        ...base,
        label: String(shape.label || circuitSymbolLabels[shape.symbolKind] || "Circuit symbol").trim(),
        symbolKind: circuitSymbolLabels[shape.symbolKind] ? shape.symbolKind : "resistor",
        fill: isHexColor(shape.fill) ? shape.fill : "#ffffff",
        fillOpacity: Number.isFinite(Number(shape.fillOpacity)) ? Math.max(0, Math.min(1, Number(shape.fillOpacity))) : 0.16,
        showTerminals: Boolean(shape.showTerminals),
        width,
        height,
        points,
        terminals
      };
    }

    return {
      ...base,
      points: Array.isArray(shape.points) ? shape.points.map(normalizeDiagramShapePoint) : []
    };
  }

  function getDiagramRegularPolygonPoints(shape) {
    const sides = Math.max(3, Math.floor(Number(shape?.sides) || 3));
    const radius = Math.max(0.1, Number(shape?.radius) || 4);
    const rotation = ((Number(shape?.rotation) || 0) * Math.PI) / 180;
    const labels = Array.isArray(shape?.vertexLabels) ? shape.vertexLabels : [];
    const offsets = Array.isArray(shape?.vertexLabelOffsets) ? shape.vertexLabelOffsets : [];
    const hidden = Array.isArray(shape?.vertexLabelHidden) ? shape.vertexLabelHidden : [];
    return Array.from({ length: sides }, (_, index) => {
      const angle = rotation + (index * 2 * Math.PI) / sides;
      const offset = offsets[index] || {};
      return {
        label: sanitizeGraphLabel(labels[index], `P${index}`),
        x: (Number(shape.centerX) || 0) + radius * Math.cos(angle),
        y: (Number(shape.centerY) || 0) + radius * Math.sin(angle),
        labelDx: parseNumberOrDefault(offset.dx, 8),
        labelDy: parseNumberOrDefault(offset.dy, -7),
        labelBasisWidth: Math.max(0, parseNumberOrDefault(offset.labelBasisWidth, 0)),
        labelBasisHeight: Math.max(0, parseNumberOrDefault(offset.labelBasisHeight, 0)),
        labelHidden: Boolean(hidden[index]),
        color: shape.stroke || "#145c63",
        size: 4,
        visible: shape.visible !== false
      };
    });
  }

  normalizeGraph = function normalizeGraphWithDiagramShapes(graph = {}) {
    const graphType = ["function", "points", "both", "diagram", "polygon"].includes(graph.graphType) ? graph.graphType : "diagram";
    const points = Array.isArray(graph.points) && graph.points.length
      ? graph.points.map(normalizeDiagramPoint)
      : parsePoints(String(graph.pointsText || "")).map((point, index) => normalizeDiagramPoint({ ...point, label: `P${index + 1}` }, index));
    return {
      graphType,
      displayMode: graph.displayMode === "geometry" ? "geometry" : "coordinate",
      title: String(graph.title || graph.label || ""),
      expression: String(graph.expression || ""),
      functionVisible: graph.functionVisible !== false,
      functionStroke: isHexColor(graph.functionStroke) ? graph.functionStroke : "#145c63",
      functionLineWidth: Math.max(1, parseNumberOrDefault(graph.functionLineWidth, 2.5)),
      functionDash: ["solid", "dashed", "dotted"].includes(graph.functionDash) ? graph.functionDash : "solid",
      functionLabel: String(graph.functionLabel || ""),
      pointsText: String(graph.pointsText || pointsToText(points)),
      points,
      segments: Array.isArray(graph.segments) ? graph.segments.map(normalizeDiagramSegment).filter(Boolean) : [],
      angles: Array.isArray(graph.angles) ? graph.angles : [],
      shapes: Array.isArray(graph.shapes) ? graph.shapes.map(normalizeDiagramShape).filter(Boolean) : [],
      xMin: parseNumberOrDefault(graph.xMin, -10),
      xMax: parseNumberOrDefault(graph.xMax, 10),
      yMin: parseOptionalNumber(graph.yMin),
      yMax: parseOptionalNumber(graph.yMax),
      autoFit: graph.autoFit === true,
      snapToGrid: Boolean(graph.snapToGrid)
    };
  };

  graphHasContent = function graphHasDiagramContent(graph) {
    if (!graph) return false;
    const normalized = normalizeGraph(graph);
    return Boolean(
      normalized.expression.trim() ||
      normalized.points.length ||
      normalized.segments.length ||
      normalized.angles.length ||
      normalized.shapes.length
    );
  };

  function applyDiagramDash(ctx, dash) {
    if (dash === "dashed") ctx.setLineDash([8, 6]);
    else if (dash === "dotted") ctx.setLineDash([2, 6]);
    else ctx.setLineDash([]);
  }

  function drawDiagramTextHalo(ctx, text, x, y, color = "#145c63") {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawDiagramTextOverbar(ctx, text, x, y, color = "#145c63") {
    drawDiagramTextHalo(ctx, text, x, y, color);
    const width = ctx.measureText(text).width;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y - 9);
    ctx.lineTo(x + width / 2, y - 9);
    ctx.stroke();
    ctx.restore();
  }

  function getShapePoints(shape) {
    if (!shape || shape.visible === false) return [];
    if (shape.type === "regularPolygon") return getDiagramRegularPolygonPoints(shape);
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) return shape.points || [];
    if (shape.type === "circuitSymbol") {
      const points = shape.points || [];
      if (points.length < 2) return points;
      const start = points[0];
      const end = points[1];
      const dx = Number(end.x) - Number(start.x);
      const dy = Number(end.y) - Number(start.y);
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      const px = -uy;
      const py = ux;
      const center = { x: Number(start.x) + dx / 2, y: Number(start.y) + dy / 2 };
      const halfHeight = Math.max(
        Math.max(0.2, parseNumberOrDefault(shape.height, 1.6) / 2),
        ["ammeter", "voltmeter"].includes(shape.symbolKind) ? length / 2 : 0
      );
      const pointAt = (along, offset) => ({
        x: center.x + ux * along + px * offset,
        y: center.y + uy * along + py * offset
      });
      return [
        ...(shape.terminals || []),
        ...points,
        pointAt(-length / 2, -halfHeight),
        pointAt(length / 2, -halfHeight),
        pointAt(length / 2, halfHeight),
        pointAt(-length / 2, halfHeight)
      ];
    }
    if (shape.type === "circle") {
      return [
        shape.center,
        shape.radiusPoint,
        { x: shape.center.x + shape.radius, y: shape.center.y },
        { x: shape.center.x - shape.radius, y: shape.center.y },
        { x: shape.center.x, y: shape.center.y + shape.radius },
        { x: shape.center.x, y: shape.center.y - shape.radius }
      ];
    }
    return [];
  }

  function findDiagramPoint(graph, label) {
    const clean = sanitizeGraphLabel(label).toLowerCase();
    if (!clean) return null;
    const manual = graph.points.find((point) => sanitizeGraphLabel(point.label).toLowerCase() === clean);
    if (manual) return manual;
    for (const shape of graph.shapes || []) {
      for (const point of getShapePoints(shape)) {
        if (sanitizeGraphLabel(point?.label).toLowerCase() === clean) return point;
      }
    }
    return null;
  }

  function getPointBounds(points) {
    const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
    const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xPad = Math.max((xMax - xMin) * 0.16, 1);
    const yPad = Math.max((yMax - yMin) * 0.16, 1);
    return { xMin: xMin - xPad, xMax: xMax + xPad, yMin: yMin - yPad, yMax: yMax + yPad };
  }

  function canvasMathText(text) {
    const supers = { "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079", "+": "\u207a", "-": "\u207b", "=": "\u207c", "(": "\u207d", ")": "\u207e" };
    const convert = (run, map) => String(run).split("").map((char) => map[char] || char).join("");
    return String(text || "")
      .trim()
      .replace(/^\$+|\$+$/g, "")
      .replace(/\\?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\?sqrt\s*\{([^{}]+)\}/g, "\u221a($1)")
      .replace(/\^\{([^{}]+)\}/g, (_, run) => convert(run, supers))
      .replace(/\^([A-Za-z0-9+\-=()])/g, (_, run) => convert(run, supers))
      .replace(/\\([A-Za-z]+)/g, "$1");
  }

  function diagramPointDisplayLabel(point, index = 0) {
    const variableLabels = ["x", "y", "w", "z", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t"];
    const name = sanitizeGraphLabel(point?.label || `P${index + 1}`);
    const mode = point?.coordinateLabelMode || "name";
    if (mode === "name") return name;
    const precision = Math.max(0, Math.min(3, Number(point?.coordinatePrecision) || 0));
    const x = Number(point?.x).toFixed(precision);
    const y = Number(point?.y).toFixed(precision);
    const variable = point?.coordinateVariable || variableLabels[index % variableLabels.length];
    const coordinate = ["variableY", "nameVariableY"].includes(mode)
      ? `(${variable}, ${y})`
      : ["xVariable", "nameXVariable"].includes(mode)
        ? `(${x}, ${variable})`
        : `(${x}, ${y})`;
    return mode.startsWith("name") ? `${name} ${coordinate}` : coordinate;
  }

  function diagramLabelOffset(source, meta, fallbackDx = 0, fallbackDy = 0) {
    const basisWidth = Math.max(0, parseNumberOrDefault(source?.labelBasisWidth, 0));
    const basisHeight = Math.max(0, parseNumberOrDefault(source?.labelBasisHeight, 0));
    const plotWidth = Math.max(0, parseNumberOrDefault(meta?.plotWidth, 0));
    const plotHeight = Math.max(0, parseNumberOrDefault(meta?.plotHeight, 0));
    return {
      dx: parseNumberOrDefault(source?.labelDx ?? source?.dx, fallbackDx) * (basisWidth && plotWidth ? plotWidth / basisWidth : 1),
      dy: parseNumberOrDefault(source?.labelDy ?? source?.dy, fallbackDy) * (basisHeight && plotHeight ? plotHeight / basisHeight : 1)
    };
  }

  function drawDiagramPoints(ctx, points, meta) {
    const arrowTips = new Set((meta?.graph?.segments || [])
      .filter((segment) => segment?.visible !== false && segment?.lineDash === "arrow")
      .map((segment) => sanitizeGraphLabel(segment.to)));
    ctx.save();
    ctx.font = "700 14.4px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    points.forEach((point, index) => {
      if (!point || point.visible === false || arrowTips.has(sanitizeGraphLabel(point.label))) return;
      if (point.x < meta.xMin || point.x > meta.xMax || point.y < meta.yMin || point.y > meta.yMax) return;
      const { px, py } = meta.toPx(point.x, point.y);
      const color = point.color || "#145c63";
      ctx.fillStyle = color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, point.size || 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const label = diagramPointDisplayLabel(point, index);
      const offset = diagramLabelOffset(point, meta, 8, -7);
      if (label && !point.labelHidden) drawDiagramTextHalo(ctx, label, px + offset.dx, py + offset.dy, color);
    });
    ctx.restore();
  }

  function drawVectorArrowhead(ctx, from, to, color = "#145c63", width = 2) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const angle = Math.atan2(dy, dx);
    const size = Math.max(10, Math.min(20, 7 + Number(width || 2) * 2.2));
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(angle - Math.PI / 7) * size, to.y - Math.sin(angle - Math.PI / 7) * size);
    ctx.lineTo(to.x - Math.cos(angle + Math.PI / 7) * size, to.y - Math.sin(angle + Math.PI / 7) * size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function segmentLabel(start, end, segment) {
    if (segment.labelMode === "hidden") return "";
    if (segment.labelMode === "length") {
      const precision = Math.max(0, Math.min(3, Number(segment.precision) || 2));
      return Number(Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y)).toFixed(precision)).toString();
    }
    if (segment.labelMode === "variable") return "x";
    return `${sanitizeGraphLabel(start.label)}${sanitizeGraphLabel(end.label)}`;
  }

  function drawDiagramSegments(ctx, graph, meta) {
    const segments = (graph.segments || []).filter((segment) => segment.visible !== false);
    if (!segments.length) return;
    ctx.save();
    ctx.font = "600 14.4px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    segments.forEach((segment) => {
      const start = findDiagramPoint(graph, segment.from);
      const end = findDiagramPoint(graph, segment.to);
      if (!start || !end) return;
      const a = meta.toPx(start.x, start.y);
      const b = meta.toPx(end.x, end.y);
      const color = segment.color || "#145c63";
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = segment.lineWidth || 2;
      applyDiagramDash(ctx, segment.lineDash);
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.stroke();
      ctx.setLineDash([]);
      if (segment.lineDash === "arrow") drawVectorArrowhead(ctx, { x: a.px, y: a.py }, { x: b.px, y: b.py }, color, segment.lineWidth);
      const label = segmentLabel(start, end, segment);
      if (label) {
        const offset = diagramLabelOffset(segment, meta, 0, -10);
        const labelX = (a.px + b.px) / 2 + offset.dx;
        const labelY = (a.py + b.py) / 2 + offset.dy;
        if (segment.labelMode === "name") drawDiagramTextOverbar(ctx, label, labelX, labelY, color);
        else drawDiagramTextHalo(ctx, label, labelX, labelY, color);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  function drawClosedShape(ctx, shape, meta) {
    const points = shape.type === "regularPolygon" ? getDiagramRegularPolygonPoints(shape) : (shape.points || []);
    if (points.length < 2) return;
    ctx.save();
    ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", shape.fillOpacity ?? 0.36);
    ctx.strokeStyle = shape.stroke || "#145c63";
    ctx.lineWidth = shape.lineWidth || 2;
    applyDiagramDash(ctx, shape.lineDash);
    const first = meta.toPx(points[0].x, points[0].y);
    ctx.beginPath();
    ctx.moveTo(first.px, first.py);
    points.slice(1).forEach((point) => {
      const current = meta.toPx(point.x, point.y);
      ctx.lineTo(current.px, current.py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawDiagramPoints(ctx, points.map((point) => ({ ...point, color: shape.stroke || "#145c63", size: 4 })), meta);
    if (shape.type === "regularPolygon") {
      const center = { x: shape.centerX, y: shape.centerY };
      if (shape.showApothem && points.length >= 2) {
        const centerPx = meta.toPx(center.x, center.y);
        const first = meta.toPx(points[0].x, points[0].y);
        const second = meta.toPx(points[1].x, points[1].y);
        ctx.save();
        ctx.strokeStyle = shape.stroke || "#145c63";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(centerPx.px, centerPx.py);
        ctx.lineTo((first.px + second.px) / 2, (first.py + second.py) / 2);
        ctx.stroke();
        ctx.restore();
      }
      if (shape.showCenter) {
        drawDiagramPoints(ctx, [{
          label: "O",
          x: center.x,
          y: center.y,
          labelDx: 8,
          labelDy: -7,
          color: shape.stroke || "#145c63",
          size: 4,
          visible: true
        }], meta);
      }
    }
  }

  function drawCircleShape(ctx, shape, meta) {
    const center = meta.toPx(shape.center.x, shape.center.y);
    const edge = meta.toPx(shape.center.x + shape.radius, shape.center.y);
    ctx.save();
    ctx.strokeStyle = shape.stroke || "#145c63";
    ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", shape.fillOpacity ?? 0.25);
    ctx.lineWidth = shape.lineWidth || 2;
    applyDiagramDash(ctx, shape.lineDash);
    ctx.beginPath();
    ctx.arc(center.px, center.py, Math.abs(edge.px - center.px), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const visiblePoints = [];
    if (shape.showCenter) visiblePoints.push({ ...shape.center, color: shape.stroke || "#145c63", size: 4 });
    if (shape.showRadiusPoint) visiblePoints.push({ ...shape.radiusPoint, color: shape.stroke || "#145c63", size: 4 });
    drawDiagramPoints(ctx, visiblePoints, meta);
  }

  function circuitPixelBasis(shape, meta) {
    const points = shape.points || [];
    if (points.length < 2) return null;
    const start = meta.toPx(points[0].x, points[0].y);
    const end = meta.toPx(points[1].x, points[1].y);
    const dx = end.px - start.px;
    const dy = end.py - start.py;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const perp = { x: -uy, y: ux };
    const center = { x: (start.px + end.px) / 2, y: (start.py + end.py) / 2 };
    const heightProbe = meta.toPx(points[0].x, Number(points[0].y) + Math.max(0.4, Number(shape.height) || 1.6));
    const halfHeight = Math.max(16, Math.abs(heightProbe.py - start.py) / 2);
    const boxHalf = length / 2;
    const inner = Math.max(12, boxHalf * 0.58);
    const p = (along, offset) => ({ x: center.x + ux * along + perp.x * offset, y: center.y + uy * along + perp.y * offset });
    return { center, boxHalf, halfHeight, inner, p };
  }

  function drawCircuitPath(ctx, basis, points) {
    if (!points.length) return;
    const first = basis.p(points[0][0], points[0][1]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    points.slice(1).forEach((point) => {
      const current = basis.p(point[0], point[1]);
      ctx.lineTo(current.x, current.y);
    });
    ctx.stroke();
  }

  function drawCircuitSymbol(ctx, shape, meta) {
    const basis = circuitPixelBasis(shape, meta);
    if (!basis) return;
    const color = shape.stroke || "#145c63";
    const halfHeight = basis.halfHeight;
    const bodyInner = Math.max(8, basis.boxHalf);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = shape.lineWidth || 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const kind = shape.symbolKind || "resistor";
    if (kind === "resistor" || kind === "variableResistor") {
      const zig = [];
      for (let index = 0; index <= 8; index += 1) {
        const along = -bodyInner + (bodyInner * 2 * index) / 8;
        const offset = index === 0 || index === 8 ? 0 : (index % 2 ? -halfHeight * 0.42 : halfHeight * 0.42);
        zig.push([along, offset]);
      }
      drawCircuitPath(ctx, basis, zig);
      if (kind === "variableResistor") {
        const from = basis.p(-bodyInner * 0.58, halfHeight * 0.72);
        const to = basis.p(bodyInner * 0.5, -halfHeight * 0.72);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        drawVectorArrowhead(ctx, from, to, color, shape.lineWidth);
      }
    } else if (kind === "battery") {
      [-1, -0.35, 0.35, 1].forEach((factor, index) => {
        const h = index % 2 === 0 ? halfHeight * 0.62 : halfHeight * 0.34;
        drawCircuitPath(ctx, basis, [[basis.boxHalf * factor, -h], [basis.boxHalf * factor, h]]);
      });
    } else if (kind === "ammeter" || kind === "voltmeter") {
      const radius = Math.max(8, basis.boxHalf);
      ctx.beginPath();
      ctx.arc(basis.center.x, basis.center.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `800 ${Math.max(13, radius * 0.95)}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(kind === "ammeter" ? "A" : "V", basis.center.x, basis.center.y + 1);
    } else if (kind === "inductor") {
      const radius = Math.min(halfHeight * 0.54, basis.inner / 5);
      for (let index = 0; index < 4; index += 1) {
        const center = basis.p(-radius * 3 + index * radius * 2, 0);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, Math.PI, 0, false);
        ctx.stroke();
      }
    } else if (kind === "earth") {
      drawCircuitPath(ctx, basis, [[0, -halfHeight * 0.62], [0, halfHeight * 0.08]]);
      drawCircuitPath(ctx, basis, [[-bodyInner * 0.34, halfHeight * 0.08], [bodyInner * 0.34, halfHeight * 0.08]]);
      drawCircuitPath(ctx, basis, [[-bodyInner * 0.22, halfHeight * 0.28], [bodyInner * 0.22, halfHeight * 0.28]]);
      drawCircuitPath(ctx, basis, [[-bodyInner * 0.11, halfHeight * 0.46], [bodyInner * 0.11, halfHeight * 0.46]]);
    } else if (kind === "capacitor") {
      drawCircuitPath(ctx, basis, [[-bodyInner, -halfHeight * 0.62], [-bodyInner, halfHeight * 0.62]]);
      drawCircuitPath(ctx, basis, [[bodyInner, -halfHeight * 0.62], [bodyInner, halfHeight * 0.62]]);
    }
    ctx.restore();
    if (shape.showTerminals) drawDiagramPoints(ctx, (shape.terminals || shape.points || []).map((point) => ({ ...point, color, size: 4 })), meta);
  }

  function drawDiagramShapes(ctx, graph, meta) {
    (graph.shapes || []).filter((shape) => shape.visible !== false).forEach((shape) => {
      if (["regularPolygon", "irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
        drawClosedShape(ctx, shape, meta);
        return;
      }
      if (shape.type === "circle") {
        drawCircleShape(ctx, shape, meta);
        return;
      }
      if (shape.type === "latexText") {
        const p = meta.toPx(shape.x, shape.y);
        ctx.save();
        ctx.font = `700 ${Math.max(8, Number(shape.fontSize) || 18)}px Inter, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        drawDiagramTextHalo(ctx, canvasMathText(shape.text || shape.label), p.px, p.py, shape.fill || shape.stroke || "#145c63");
        ctx.restore();
        return;
      }
      if (shape.type === "circuitSymbol") drawCircuitSymbol(ctx, shape, meta);
    });
  }

  function drawDiagramCurve(ctx, points, meta, graph) {
    const { toPx, yMin, yMax, plotHeight } = meta;
    let started = false;
    let previous = null;
    ctx.save();
    ctx.strokeStyle = graph.functionStroke || "#145c63";
    ctx.lineWidth = graph.functionLineWidth || 2.35;
    applyDiagramDash(ctx, graph.functionDash);
    ctx.beginPath();
    points.forEach((point) => {
      if (!Number.isFinite(point.y) || point.y < yMin - Math.abs(yMax - yMin) || point.y > yMax + Math.abs(yMax - yMin)) {
        started = false;
        previous = null;
        return;
      }
      const current = toPx(point.x, point.y);
      const jump = previous && Math.abs(current.py - previous.py) > plotHeight * 0.85;
      if (!started || jump) {
        ctx.moveTo(current.px, current.py);
        started = true;
      } else {
        ctx.lineTo(current.px, current.py);
      }
      previous = current;
    });
    ctx.stroke();
    ctx.restore();
  }

  drawGraph = function drawGraphWithDiagramShapes(canvas, rawGraph) {
    const graph = normalizeGraph(rawGraph || {});
    const size = getSquareCanvasSize(canvas);
    const cssWidth = size;
    const cssHeight = size;
    const scale = window.devicePixelRatio || 1;
    canvas.width = cssWidth * scale;
    canvas.height = cssHeight * scale;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const padding = { left: 36, right: 40, top: 42, bottom: 32 };
    const plotWidth = cssWidth - padding.left - padding.right;
    const plotHeight = cssHeight - padding.top - padding.bottom;
    let xMin = Number(graph.xMin);
    let xMax = Number(graph.xMax);
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
      drawGraphError(ctx, cssWidth, cssHeight, "Use a valid x-domain.");
      return;
    }

    const shapePoints = (graph.shapes || []).flatMap(getShapePoints).filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
    const manualPoints = (graph.points || []).filter((point) => point.visible !== false);
    const objectPoints = [...manualPoints, ...shapePoints];
    let fnPoints = [];
    if (graph.expression && graph.functionVisible !== false) {
      try {
        const fn = compileExpression(graph.expression);
        for (let i = 0; i <= 700; i += 1) {
          const x = xMin + ((xMax - xMin) * i) / 700;
          let y;
          try { y = fn(x); } catch (_) { y = NaN; }
          fnPoints.push({ x, y });
        }
      } catch (error) {
        drawGraphError(ctx, cssWidth, cssHeight, error.message);
        return;
      }
    }

    let autoBounds = null;
    if (graph.autoFit && graph.graphType !== "function" && objectPoints.length) {
      autoBounds = getPointBounds(objectPoints);
      if (autoBounds) {
        xMin = autoBounds.xMin;
        xMax = autoBounds.xMax;
      }
    }
    const finiteYs = [...fnPoints.map((point) => point.y), ...objectPoints.map((point) => point.y)].filter(Number.isFinite);
    let yMin = graph.yMin === "" ? Math.min(...finiteYs, -10) : Number(graph.yMin);
    let yMax = graph.yMax === "" ? Math.max(...finiteYs, 10) : Number(graph.yMax);
    if (autoBounds) {
      yMin = autoBounds.yMin;
      yMax = autoBounds.yMax;
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
      const center = Number.isFinite(yMin) ? yMin : 0;
      yMin = center - 10;
      yMax = center + 10;
    }
    const paddingY = graph.yMin === "" && graph.yMax === "" && !autoBounds ? (yMax - yMin) * 0.04 || 1 : 0;
    yMin -= paddingY;
    yMax += paddingY;

    const toPx = (x, y) => ({
      px: padding.left + ((x - xMin) / (xMax - xMin)) * plotWidth,
      py: padding.top + ((yMax - y) / (yMax - yMin)) * plotHeight
    });
    const meta = { width: cssWidth, height: cssHeight, padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx, graph };
    drawGrid(ctx, meta);
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, padding.top, plotWidth, plotHeight);
    ctx.clip();
    if (fnPoints.length) drawDiagramCurve(ctx, fnPoints, meta, graph);
    drawDiagramShapes(ctx, graph, meta);
    drawDiagramSegments(ctx, graph, meta);
    if (manualPoints.length) drawDiagramPoints(ctx, manualPoints, meta);
    ctx.restore();
    drawGraphCanvasTitle(ctx, graph, cssWidth);
  };
})();

(function () {
  const previousNormalizeGraph = normalizeGraph;
  const previousDrawGraph = drawGraph;

  function hasStandaloneDiagramFeatures(graph) {
    return Boolean(graph && (
      (Array.isArray(graph.functions) && graph.functions.length > 0) ||
      graph.graphType === "diagram" ||
      graph.graphType === "polygon" ||
      graph.displayMode ||
      Array.isArray(graph.shapes) ||
      Array.isArray(graph.segments) ||
      Array.isArray(graph.angles) ||
      Object.prototype.hasOwnProperty.call(graph, "functionXMin") ||
      Object.prototype.hasOwnProperty.call(graph, "functionXMax")
    ));
  }

  normalizeGraph = function normalizeGraphForStandaloneDiagrams(graph = {}) {
    if (hasStandaloneDiagramFeatures(graph) && window.KelpDiagramEditor?.normalizeGraph) {
      return window.KelpDiagramEditor.normalizeGraph(graph);
    }
    const normalized = previousNormalizeGraph(graph || {});
    if (Object.prototype.hasOwnProperty.call(graph || {}, "functionXMin")) {
      normalized.functionXMin = graph.functionXMin === "" ? "" : parseNumberOrDefault(graph.functionXMin, "");
    }
    if (Object.prototype.hasOwnProperty.call(graph || {}, "functionXMax")) {
      normalized.functionXMax = graph.functionXMax === "" ? "" : parseNumberOrDefault(graph.functionXMax, "");
    }
    return normalized;
  };

  drawGraph = function drawGraphWithStandaloneDiagramRenderer(canvas, rawGraph) {
    if (hasStandaloneDiagramFeatures(rawGraph) && window.KelpDiagramEditor?.renderToCanvas) {
      try {
        if (window.KelpDiagramEditor.renderToCanvas(canvas, rawGraph)) return;
      } catch (error) {
        console.warn("Standalone diagram renderer failed; falling back to the student graph renderer.", error);
      }
    }
    previousDrawGraph(canvas, rawGraph);
  };
})();

initialize();
