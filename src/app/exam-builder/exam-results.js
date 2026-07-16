/* Kelp exam results page v8 - vanilla HTML/CSS/JS */

const RESULTS_KEY = "kelp-exam-results-v1";
const LATEST_RESULT_KEY = "kelp-latest-exam-result-v1";
const VIEWER_ROLE_KEY = "kelp-exam-viewer-role";
const PROFILE_STORAGE_KEYS = [
  "kelp-active-profile",
  "kelp-current-profile",
  "kelp-user-profile",
  "currentProfile",
  "profile"
];
const root = document.getElementById("resultsRoot");
const params = new URLSearchParams(window.location.search);
const resultId = params.get("resultId");
let currentResult = null;

function initialize() {
  const result = loadResult();
  if (!result) {
    renderNoResult();
    return;
  }
  renderResult(result);
}

function loadResult() {
  const results = readResults();
  if (resultId) {
    return readLatestResult(resultId) || results.find((item) => item.id === resultId);
  }
  return readLatestResult() || results[0];
}

function readResults() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function readLatestResult(expectedId = "") {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(LATEST_RESULT_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    if (expectedId && String(parsed.id) !== String(expectedId)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function isTeacherResultView(result) {
  if (isTeacherRole(result?.viewerRole)) return true;
  const profile = readCurrentProfile();
  if (isTeacherRole(profile.role)) return true;
  try {
    return isTeacherRole(sessionStorage.getItem(VIEWER_ROLE_KEY));
  } catch (_) {
    return false;
  }
}

function readCurrentProfile() {
  for (const storage of [sessionStorage, localStorage]) {
    for (const key of PROFILE_STORAGE_KEYS) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const profile = JSON.parse(raw);
        if (profile && typeof profile === "object") return profile;
      } catch (_) {
        // Profile data will come from the backend later.
      }
    }
  }
  return {};
}

function isTeacherRole(role) {
  return ["teacher", "tutor", "admin", "developer"].includes(String(role || "").trim().toLowerCase());
}

function renderNoResult() {
  root.innerHTML = `
    <p class="tracks-kicker">Exam results</p>
    <h1 id="results-title">No result found</h1>
    <p class="exam-muted">Take an online exam first. Results are saved in this browser for this prototype.</p>
    <div class="exam-results-actions">
      <a class="btn-primary" href="./exam-builder.html?resume=1">Go to builder</a>
    </div>
  `;
}

function resultItemHasResponse(item) {
  if (!item) return false;
  if (String(item.type || "").startsWith("multiple-answer")) {
    return Array.isArray(item.response) && item.response.length > 0;
  }
  if (String(item.type || "").startsWith("multiple-choice") || item.type === "true-false") {
    return item.response !== undefined && item.response !== null && item.response !== "";
  }
  return String(item.response ?? "").trim() !== "";
}

function getResultSummaryMetrics(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const answeredItems = items.filter(resultItemHasResponse);
  const awaitingItems = answeredItems.filter((item) => !item.autoGradable);
  const itemTotalPoints = items.reduce((sum, item) => sum + Math.max(0, Number(item?.points) || 0), 0);
  const storedTotalPoints = Math.max(0, Number(result?.totalPossible) || 0);
  const totalPoints = itemTotalPoints > 0 ? itemTotalPoints : storedTotalPoints;
  const hasItemScores = items.some((item) => Number.isFinite(Number(item?.earnedPoints)));
  const weightedAwardedPoints = items.reduce((sum, item) => sum + Math.max(0, Number(item?.earnedPoints) || 0), 0);
  const awardedPoints = Math.max(0, hasItemScores ? weightedAwardedPoints : Number(result?.autoEarned) || 0);
  const scorePercent = totalPoints > 0
    ? Math.round((awardedPoints / totalPoints) * 100)
    : null;

  return {
    totalQuestions: items.length,
    answered: answeredItems.length,
    right: items.filter((item) => item.status === "correct").length,
    wrong: answeredItems.filter((item) => item.status === "incorrect").length,
    partial: items.filter((item) => item.status === "partial").length,
    awaiting: awaitingItems.length,
    timeSpent: formatDuration(result?.durationSeconds || 0),
    awardedPoints,
    awaitingPoints: awaitingItems.reduce((sum, item) => sum + Math.max(0, Number(item.points) || 0), 0),
    totalPoints,
    scorePercent
  };
}

function renderResultSummaryCard(label, value) {
  return `
    <div class="exam-result-summary-card">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(String(value))}</strong>
    </div>
  `;
}

function renderResult(result) {
  currentResult = result;
  const isTeacherView = isTeacherResultView(result);
  document.body.classList.toggle("is-teacher-view", isTeacherView);
  document.body.classList.toggle("is-student-result", !isTeacherView);
  const metrics = getResultSummaryMetrics(result);
  const examScore = metrics.scorePercent === null
    ? `${formatPoints(metrics.awardedPoints)} / ${formatPoints(metrics.totalPoints)} pts`
    : `${formatPoints(metrics.awardedPoints)} / ${formatPoints(metrics.totalPoints)} pts (${metrics.scorePercent}%)`;

  root.style.setProperty("--exam-title-color", result.titleColor || "#212121");
  root.style.setProperty("--exam-stripe-color", result.stripeColor || "#9bf17e");

  root.innerHTML = `
    <header class="exam-results-header">
      <p class="tracks-kicker">Exam results</p>
      <h1 id="results-title" class="exam-document-title">${escapeHTML(result.title || "Untitled exam")}</h1>
      <p class="exam-paper-subtitle">${escapeHTML(result.subject || "Subject / track")}${result.timeExpired ? " · Submitted when the timer ended" : ""}</p>
    </header>

    <section class="exam-result-summary-grid" aria-label="Score summary">
      ${renderResultSummaryCard("Questions right", metrics.right)}
      ${renderResultSummaryCard("Questions wrong", metrics.wrong)}
      ${renderResultSummaryCard("Partially correct", metrics.partial)}
      ${renderResultSummaryCard("Questions awaiting grading", metrics.awaiting)}
      ${renderResultSummaryCard("Questions answered", `${metrics.answered} / ${metrics.totalQuestions}`)}
      ${renderResultSummaryCard("Time spent", metrics.timeSpent)}
      ${renderResultSummaryCard("Points awarded so far", `${formatPoints(metrics.awardedPoints)} pts`)}
      ${renderResultSummaryCard("Points awaiting analysis", `${formatPoints(metrics.awaitingPoints)} pts`)}
      ${renderResultSummaryCard("Exam score", examScore)}
    </section>

    <section class="exam-result-details" aria-label="Question details">
      <table class="exam-result-table exam-result-key-table">
        <thead>
          <tr>
            <th class="exam-result-question-col">Question</th>
            <th>Student's answer</th>
            <th>Answer key</th>
          </tr>
        </thead>
        <tbody>
          ${result.items.map(renderResultRow).join("")}
        </tbody>
      </table>
    </section>

    ${renderResultActions(isTeacherView)}

    ${renderCleanExam(result)}
  `;

  const printButton = document.getElementById("printResultsBtn");
  if (printButton) printButton.addEventListener("click", () => printResultDocument("is-printing-results", "Kelp Exam Results"));
  const cleanExamButton = document.getElementById("printCleanExamBtn");
  if (cleanExamButton) cleanExamButton.addEventListener("click", () => printResultDocument("is-printing-clean-exam", "Kelp Clean Exam"));

  /* Retained for a possible future return of the answered-exam PDF.
  const completedButton = document.getElementById("printCompletedExamBtn");
  if (completedButton) completedButton.addEventListener("click", () => printResultDocument("is-printing-completed-exam", "Kelp Completed Exam"));
  */
  drawResultGraphs(result);
  typesetMath(root);
}

function renderResultActions(isTeacherView) {
  return `
    <div class="exam-results-actions screen-only">
      <button type="button" class="btn-primary" id="printResultsBtn">Download results PDF</button>
      <button type="button" class="btn-secondary" id="printCleanExamBtn">Download clean exam PDF</button>
      <!-- Retained for a possible future return of the answered-exam PDF.
      <button type="button" class="btn-secondary" id="printCompletedExamBtn">Download completed exam PDF</button>
      -->
      ${isTeacherView ? '<a class="btn-secondary" href="./exam-taker.html">Take again</a><a class="btn-outline" href="./exam-builder.html?resume=1">Back to builder</a>' : ""}
    </div>
  `;
}

function renderResultRow(item) {
  const statusClass = item.status === "correct" ? "correct" : item.status === "incorrect" ? "incorrect" : item.status === "partial" ? "partial" : "review";
  const statusLabel = item.status === "correct" ? "Right" : item.status === "incorrect" ? "Wrong" : item.status === "partial" ? "Partial" : "Review";
  const response = formatResponse(item);
  const answerKey = formatCorrectAnswer(item);
  const pointText = item.autoGradable
    ? `${formatPoints(item.earnedPoints || 0)} / ${formatPoints(item.points || 0)} pt${Number(item.points) === 1 ? "" : "s"}`
    : `${formatPoints(item.points || 0)} pt${Number(item.points) === 1 ? "" : "s"}`;
  const questionName = String(item.questionName || "").trim();

  return `
    <tr class="exam-result-row ${statusClass}">
      <td class="exam-result-question-cell">
        <div class="exam-result-question-heading-row">
          <strong>Question ${escapeHTML(String(item.questionNumber))}</strong>
          <span class="exam-result-status ${statusClass}">${escapeHTML(statusLabel)}</span>
        </div>
        ${questionName ? `<div class="exam-result-question-name">${escapeHTML(questionName)}</div>` : ""}
        <div class="exam-results-prompt">${escapeHTML(item.prompt || "Question text not added.")}</div>
        <div class="exam-result-question-meta">
          <span>${escapeHTML(pointText)}</span>
        </div>
      </td>
      <td class="exam-result-answer-cell"><div class="exam-result-cell-content">${response}</div></td>
      <td class="exam-result-answer-key-cell"><div class="exam-result-cell-content">${answerKey}</div></td>
    </tr>
  `;
}


function renderOptionalText(text) {
  const value = String(text || "").trim();
  return value ? `<div class="exam-section-message">${escapeHTML(value)}</div>` : "";
}

function renderResultMedia(item) {
  const imageHtml = item.imageData || item.imageBeforeText || item.imageAfterText
    ? `${renderOptionalText(item.imageBeforeText)}${item.imageData ? `<figure class="exam-question-image"><img src="${escapeAttribute(item.imageData)}" alt="${escapeAttribute(item.imageAlt || 'Question image')}" />${item.imageAlt ? `<figcaption>${escapeHTML(item.imageAlt)}</figcaption>` : ""}</figure>` : ""}${renderOptionalText(item.imageAfterText)}`
    : "";
  const graphHtml = item.graph || item.graphBeforeText || item.graphAfterText
    ? `${renderOptionalText(item.graphBeforeText)}${item.graph ? renderGraphFigure(item.graph, `data-result-graph-id="${escapeAttribute(String(item.questionId || item.questionNumber))}"`, `Graph for question ${item.questionNumber}`) : ""}${renderOptionalText(item.graphAfterText)}`
    : "";
  return `${imageHtml}${graphHtml}`;
}

function renderGraphFigure(graph, canvasAttributes, ariaLabel) {
  const footer = graph.title
    ? `<figcaption class="exam-graph-footer">${escapeHTML(graph.title)}</figcaption>`
    : "";

  return `
    <figure class="exam-graph-figure exam-result-graph-figure">
      <canvas class="exam-paper-graph" ${canvasAttributes} aria-label="${escapeAttribute(ariaLabel)}"></canvas>
      ${footer}
    </figure>
  `;
}

function drawResultGraphs(result) {
  root.querySelectorAll('[data-result-graph-id], [data-completed-graph-id], [data-clean-graph-id]').forEach((canvas) => {
    const key = canvas.dataset.resultGraphId || canvas.dataset.completedGraphId || canvas.dataset.cleanGraphId;
    const item = (result.items || []).find((entry) => String(entry.questionId || entry.questionNumber) === String(key));
    if (item && item.graph) drawGraph(canvas, item.graph);
  });

  root.querySelectorAll("[data-completed-option-graph-id]").forEach((canvas) => {
    const key = canvas.dataset.completedOptionGraphId;
    const optionIndex = Number(canvas.dataset.completedOptionIndex);
    const item = (result.items || []).find((entry) => String(entry.questionId || entry.questionNumber) === String(key));
    const graph = item?.optionGraphs?.[optionIndex];
    if (graph && resultGraphHasContent(graph)) drawGraph(canvas, graph);
  });

  root.querySelectorAll("[data-clean-option-graph-id]").forEach((canvas) => {
    const key = canvas.dataset.cleanOptionGraphId;
    const optionIndex = Number(canvas.dataset.cleanOptionIndex);
    const item = (result.items || []).find((entry) => String(entry.questionId || entry.questionNumber) === String(key));
    const graph = item?.optionGraphs?.[optionIndex];
    if (graph && resultGraphHasContent(graph)) drawGraph(canvas, graph);
  });
}

async function printResultDocument(modeClass, title) {
  if (!currentResult) return;
  const previousTitle = document.title;
  document.body.classList.remove("is-printing-results", "is-printing-completed-exam", "is-printing-clean-exam");
  document.body.classList.add(modeClass);
  if (modeClass === "is-printing-clean-exam") document.body.classList.add("is-printing-completed-exam");
  document.title = title;

  const cleanup = () => {
    document.body.classList.remove(modeClass, "is-printing-completed-exam");
    document.title = previousTitle;
    drawResultGraphs(currentResult);
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.addEventListener("beforeprint", () => drawResultGraphs(currentResult), { once: true });
  try {
    await prepareResultDocumentForPrint();
    window.print();
  } catch (error) {
    console.warn("Could not fully prepare the result document before printing.", error);
    drawResultGraphs(currentResult);
    window.print();
  }
}

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function waitForDelay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForImages(container) {
  const images = [...(container || document.body).querySelectorAll("img")];
  await Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth) return Promise.resolve();
    if (image.decode) {
      return image.decode().catch(() => undefined);
    }
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
}

async function prepareResultDocumentForPrint() {
  await waitForNextFrame();
  await waitForNextFrame();
  await typesetMath(root);
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
  drawResultGraphs(currentResult);
  await waitForImages(root);
  await waitForDelay(180);
  drawResultGraphs(currentResult);
}

function downloadSubmissionJson(result) {
  const payload = result.submission || buildSubmissionPayloadFromResult(result);
  downloadJsonFile(`${slugify(result.title || "kelp-exam")}-submission.json`, payload);
}

function buildSubmissionPayloadFromResult(result) {
  const correctCount = Number(result.correctCount ?? (result.items || []).filter((item) => item.status === "correct").length);
  const wrongCount = Number(result.wrongCount ?? (result.items || []).filter((item) => item.status === "incorrect").length);
  const partialCount = Number(result.partialCount ?? (result.items || []).filter((item) => item.status === "partial").length);
  const reviewCount = Number(result.reviewCount ?? (result.items || []).filter((item) => item.status === "review").length);
  const answeredCount = Number(result.answeredCount ?? (result.items || []).filter((item) => {
    if (Array.isArray(item.response)) return item.response.length > 0;
    return item.response !== undefined && item.response !== null && String(item.response).trim() !== "";
  }).length);
  const scorePercent = result.scorePercent ?? (Number(result.autoPossible) > 0
    ? Number(((Number(result.autoEarned || 0) / Number(result.autoPossible)) * 100).toFixed(2))
    : null);

  return {
    schema: "kelp-exam-submission-v1",
    profileId: result.profileId || "",
    respondentName: result.respondentName || "",
    date: result.submittedAt || "",
    degreeLevel: result.degreeLevel || "",
    subject: result.subject || "",
    whoAssigned: result.assignedBy || "__KELP_TUTOR_PLACEHOLDER__",
    examTitle: result.title || "",
    questionCount: Number(result.items?.length || 0),
    answeredCount,
    correctCount,
    wrongCount,
    partialCount,
    reviewCount,
    score: {
      earnedPoints: Number(result.autoEarned || 0),
      possibleAutoGradedPoints: Number(result.autoPossible || 0),
      totalExamPoints: Number(result.totalPossible || 0),
      percent: scorePercent
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
    const texts = Array.isArray(item.responseTexts) ? item.responseTexts : [];
    const indexes = Array.isArray(item.response) ? item.response.map(Number) : [];
    return indexes.map((index, position) => `${optionLetter(index)}. ${texts[position] || ""}`.trim()).join("; ");
  }
  return String(item.response ?? "").trim();
}

function getSubmissionExpectedAnswer(item) {
  if (item.type === "multiple-choice" || item.type === "true-false") {
    return `${optionLetter(Number(item.correctOptionIndex))}. ${item.correctOptionText || ""}`.trim();
  }
  if (item.type === "multiple-answer") {
    const texts = Array.isArray(item.correctOptionTexts) ? item.correctOptionTexts : [];
    const indexes = Array.isArray(item.correctOptionIndexes) ? item.correctOptionIndexes : [];
    return indexes.map((index, position) => `${optionLetter(index)}. ${texts[position] || ""}`.trim()).join("; ");
  }
  if (item.type === "numeric") return String(item.expectedAnswer || "").trim();
  return String(item.expectedAnswer || item.teacherNotes || "").trim();
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

function formatResponse(item) {
  if (item.type === "multiple-choice" || item.type === "true-false") {
    if (item.response === undefined || item.response === null || item.response === "") return "<em>Blank</em>";
    return `${escapeHTML(optionLetter(Number(item.response)))}. ${escapeHTML(item.responseText || "")}`;
  }

  if (item.type === "multiple-answer") {
    const texts = Array.isArray(item.responseTexts) ? item.responseTexts : [];
    const responseIndexes = Array.isArray(item.response) ? item.response.map(Number) : [];
    if (!texts.length && !responseIndexes.length) return "<em>Blank</em>";
    return responseIndexes.map((index, position) => `${escapeHTML(optionLetter(index))}. ${escapeHTML(texts[position] || "")}`).join("<br>");
  }

  const text = String(item.response ?? "").trim();
  const feedback = item.numericFeedback
    ? `<div class="exam-result-feedback">${escapeHTML(item.numericFeedback)}</div>`
    : "";
  return `${text ? escapeHTML(text) : "<em>Blank</em>"}${feedback}`;
}

function formatCorrectAnswer(item) {
  if (item.type === "multiple-choice" || item.type === "true-false") {
    return `${escapeHTML(optionLetter(Number(item.correctOptionIndex)))}. ${escapeHTML(item.correctOptionText || "")}`;
  }
  if (item.type === "multiple-answer") {
    const indexes = Array.isArray(item.correctOptionIndexes) ? item.correctOptionIndexes : [];
    const texts = Array.isArray(item.correctOptionTexts) ? item.correctOptionTexts : [];
    if (!indexes.length) return "<em>No correct options selected by tutor</em>";
    return indexes.map((index, position) => `${escapeHTML(optionLetter(index))}. ${escapeHTML(texts[position] || "")}`).join("<br>");
  }
  if (item.type === "numeric") {
    const expected = String(item.expectedAnswer || "").trim();
    const notes = String(item.teacherNotes || "").trim();
    const formattedExpected = formatNumericExpression(expected);
    if (expected && notes && expected !== notes) {
      return `${formattedExpected}<div class="exam-result-feedback">${escapeHTML(notes)}</div>`;
    }
    return expected ? formattedExpected : "<em>No numeric answer key provided</em>";
  }
  const expected = String(item.expectedAnswer || item.teacherNotes || "").trim();
  return expected ? escapeHTML(expected) : "<em>No answer key note provided</em>";
}

function formatNumericExpression(expression) {
  const value = String(expression || "").trim();
  if (!value) return "";
  const latex = window.KelpNumericAnswer?.toLatex?.(value) || "";
  return latex ? `\\(${escapeHTML(latex)}\\)` : escapeHTML(value);
}

function renderCleanExam(result) {
  return `
    <section class="exam-completed-print exam-clean-print" aria-label="Clean printable exam">
      <header class="exam-paper-header">
        <h1 class="exam-document-title">${escapeHTML(result.title || "Untitled exam")}</h1>
        <div class="exam-title-stripe" aria-hidden="true"></div>
        <p class="exam-paper-subtitle">${escapeHTML(result.subject || "Subject / track")}</p>
      </header>
      ${String(result.instructions || "").trim() ? `<div class="exam-paper-instructions">${escapeHTML(result.instructions)}</div>` : ""}
      <ol class="exam-paper-question-list">
        ${(result.items || []).map(renderCleanExamQuestion).join("")}
      </ol>
    </section>
  `;
}

function renderCleanExamQuestion(item) {
  const imageHtml = item.imageData || item.imageBeforeText || item.imageAfterText
    ? `${renderOptionalText(item.imageBeforeText)}${item.imageData ? `<figure class="exam-question-image"><img src="${escapeAttribute(item.imageData)}" alt="${escapeAttribute(item.imageAlt || 'Question image')}" />${item.imageAlt ? `<figcaption>${escapeHTML(item.imageAlt)}</figcaption>` : ""}</figure>` : ""}${renderOptionalText(item.imageAfterText)}`
    : "";
  const graphHtml = item.graph || item.graphBeforeText || item.graphAfterText
    ? `${renderOptionalText(item.graphBeforeText)}${item.graph ? renderGraphFigure(item.graph, `data-clean-graph-id="${escapeAttribute(String(item.questionId || item.questionNumber))}"`, `Graph for question ${item.questionNumber}`) : ""}${renderOptionalText(item.graphAfterText)}`
    : "";

  return `
    <li class="exam-paper-question">
      <div class="exam-paper-question-title">
        <span>Question ${escapeHTML(String(item.questionNumber))}</span>
        <span>${escapeHTML(String(item.points || 0))} pt${Number(item.points) === 1 ? "" : "s"}</span>
      </div>
      <div class="exam-paper-prompt">${escapeHTML(item.prompt || "Question text not added.")}</div>
      ${imageHtml}
      ${graphHtml}
      ${renderCleanResponseArea(item)}
    </li>
  `;
}

function renderCleanResponseArea(item) {
  const type = String(item.type || "");
  const usesOptions = type === "true-false" || type.startsWith("multiple-choice") || type.startsWith("multiple-answer");
  if (usesOptions) {
    const visualOptionsClass = item.optionContentType && item.optionContentType !== "text" ? " has-visual-options" : "";
    return `
      <ol class="exam-paper-options${visualOptionsClass}">
        ${(item.options || []).map((option, index) => `
          <li>
            <span class="exam-option-bubble">${optionLetter(index)}</span>
            ${renderCleanOptionContent(item, option, index)}
          </li>
        `).join("")}
      </ol>
    `;
  }

  if (type === "short-answer" || type === "essay") {
    const allowed = type === "short-answer" ? ["none", "small"] : ["none", "small", "medium", "large", "custom"];
    const fallback = type === "essay" ? "medium" : "small";
    const size = allowed.includes(String(item.pdfAnswerSpaceSize || "")) ? String(item.pdfAnswerSpaceSize) : fallback;
    if (size === "none") return "";
    const heights = { small: 35, medium: 60, large: 95 };
    const customHeight = Math.max(10, Math.min(260, Number(item.pdfAnswerSpaceCustomMm) || 80));
    const height = size === "custom" ? customHeight : heights[size] || heights[fallback];
    const classes = `exam-paper-answer-space ${type === "essay" ? "essay" : "short-answer"} pdf-answer-space-${size}`;
    return `<div class="${classes}" style="--pdf-answer-space-height: ${height}mm;" aria-label="Answer space"></div>`;
  }

  return '<div class="exam-paper-answer-space" aria-label="Answer space"></div>';
}

function renderCleanOptionContent(item, option, index) {
  const optionText = String(option || "").trim();
  if (item.optionContentType === "graph") {
    const graph = item.optionGraphs?.[index];
    const graphHtml = graph && resultGraphHasContent(graph)
      ? renderGraphFigure(graph, `data-clean-option-graph-id="${escapeAttribute(String(item.questionId || item.questionNumber))}" data-clean-option-index="${index}"`, `Graph option ${optionLetter(index)}`)
      : '<span class="exam-option-asset-missing">No graph attached.</span>';
    return `<span class="exam-option-content exam-option-content-graph">${optionText ? `<span class="exam-option-text">${escapeHTML(optionText)}</span>` : ""}<span class="exam-option-media-tile exam-option-graph-tile">${graphHtml}</span></span>`;
  }
  if (item.optionContentType === "image") {
    const image = item.optionImages?.[index];
    return `<span class="exam-option-content exam-option-content-image">${optionText ? `<span class="exam-option-text">${escapeHTML(optionText)}</span>` : ""}<span class="exam-option-media-tile">${image ? `<img src="${escapeAttribute(image)}" alt="Image option ${optionLetter(index)}" />` : '<span class="exam-option-asset-missing">No image attached.</span>'}</span></span>`;
  }
  return `<span class="exam-option-text">${escapeHTML(option || "________")}</span>`;
}

function renderCompletedExam(result) {
  return `
    <section class="exam-completed-print" aria-label="Completed exam with student answers">
      <header class="exam-paper-header">
        <h1 class="exam-document-title">${escapeHTML(result.title || "Untitled exam")}</h1>
        <div class="exam-title-stripe" aria-hidden="true"></div>
        <p class="exam-paper-subtitle">${escapeHTML(result.subject || "Subject / track")}</p>
      </header>
      <ol class="exam-paper-question-list">
        ${(result.items || []).map(renderCompletedExamQuestion).join("")}
      </ol>
    </section>
  `;
}

function renderCompletedExamQuestion(item) {
  const imageHtml = item.imageData || item.imageBeforeText || item.imageAfterText
    ? `${renderOptionalText(item.imageBeforeText)}${item.imageData ? `<figure class="exam-question-image"><img src="${escapeAttribute(item.imageData)}" alt="${escapeAttribute(item.imageAlt || 'Question image')}" />${item.imageAlt ? `<figcaption>${escapeHTML(item.imageAlt)}</figcaption>` : ""}</figure>` : ""}${renderOptionalText(item.imageAfterText)}`
    : "";
  const graphHtml = item.graph || item.graphBeforeText || item.graphAfterText
    ? `${renderOptionalText(item.graphBeforeText)}${item.graph ? renderGraphFigure(item.graph, `data-completed-graph-id="${escapeAttribute(String(item.questionId || item.questionNumber))}"`, `Graph for question ${item.questionNumber}`) : ""}${renderOptionalText(item.graphAfterText)}`
    : "";
  const answerHtml = renderCompletedAnswer(item);

  return `
    <li class="exam-paper-question">
      <div class="exam-paper-question-title">
        <span>Question ${escapeHTML(String(item.questionNumber))}</span>
        <span>${escapeHTML(String(item.points || 0))} pt${Number(item.points) === 1 ? "" : "s"}</span>
      </div>
      <div class="exam-paper-prompt">${escapeHTML(item.prompt || "Question text not added.")}</div>
      ${imageHtml}
      ${graphHtml}
      ${answerHtml}
    </li>
  `;
}

function renderCompletedAnswer(item) {
  if (item.type === "multiple-choice" || item.type === "true-false" || item.type === "multiple-answer") {
    const contentType = item.optionContentType || "text";
    const visualOptionsClass = contentType !== "text" ? " has-visual-options" : "";
    const options = Array.isArray(item.options) && item.options.length ? item.options : [];
    if (!options.length) {
      return `<div class="exam-completed-answer"><strong>Student answer:</strong> ${formatResponse(item)}</div>`;
    }
    return `
      <ol class="exam-paper-options${visualOptionsClass}">
        ${options.map((option, index) => `
          <li class="${isCompletedOptionSelected(item, index) ? "is-student-selected" : ""}">
            <span class="exam-option-bubble">${optionLetter(index)}</span>
            ${renderCompletedOptionContent(item, option, index)}
          </li>
        `).join("")}
      </ol>
    `;
  }

  return `
    <div class="exam-completed-answer">
      <strong>Student answer</strong>
      <div>${formatWrittenResponse(item.response)}</div>
    </div>
  `;
}

function renderCompletedOptionContent(item, option, index) {
  const contentType = item.optionContentType || "text";
  const optionText = String(option || "").trim();
  if (contentType === "graph") {
    const graph = item.optionGraphs?.[index];
    const graphHtml = graph && resultGraphHasContent(graph)
      ? renderGraphFigure(graph, `data-completed-option-graph-id="${escapeAttribute(String(item.questionId || item.questionNumber))}" data-completed-option-index="${index}"`, `Graph option ${optionLetter(index)}`)
      : '<span class="exam-option-asset-missing">No graph attached.</span>';
    return `
      <span class="exam-option-content exam-option-content-graph">
        ${optionText ? `<span class="exam-option-text">${escapeHTML(optionText)}</span>` : ""}
        <span class="exam-option-media-tile exam-option-graph-tile">${graphHtml}</span>
      </span>
    `;
  }
  if (contentType === "image") {
    const image = item.optionImages?.[index];
    return `
      <span class="exam-option-content exam-option-content-image">
        ${optionText ? `<span class="exam-option-text">${escapeHTML(optionText)}</span>` : ""}
        <span class="exam-option-media-tile">${image ? `<img src="${escapeAttribute(image)}" alt="Image option ${optionLetter(index)}" />` : '<span class="exam-option-asset-missing">No image attached.</span>'}</span>
      </span>
    `;
  }
  return `<span class="exam-option-text">${escapeHTML(option || "________")}</span>`;
}

function isCompletedOptionSelected(item, index) {
  if (item.type === "multiple-answer") {
    return Array.isArray(item.response) && item.response.map(Number).includes(index);
  }
  return Number(item.response) === index;
}

function resultGraphHasContent(graph) {
  if (!graph) return false;
  if (Array.isArray(graph.functions) && graph.functions.some((curve) => String(curve?.expression || "").trim())) return true;
  if (Array.isArray(graph.shapes) && graph.shapes.length) return true;
  if (Array.isArray(graph.segments) && graph.segments.length) return true;
  if (Array.isArray(graph.angles) && graph.angles.length) return true;
  if (graph.regularPolygon && typeof graph.regularPolygon === "object") return true;
  const hasExpression = String(graph.expression || "").trim() !== "";
  const hasPoints = Array.isArray(graph.points) && graph.points.length > 0;
  const hasPointsText = String(graph.pointsText || "").trim() !== "";
  return hasExpression || hasPoints || hasPointsText;
}

function formatWrittenResponse(value) {
  const text = String(value ?? "").trim();
  return text ? escapeHTML(text).replace(/\n/g, "<br>") : "<em>Blank</em>";
}

function normalizeGraph(graph) {
  if (Array.isArray(graph?.functions) && window.KelpDiagramEditor?.normalizeGraph) {
    return window.KelpDiagramEditor.normalizeGraph(graph);
  }
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
  return matches.map((match) => ({ x: Number(match[1]), y: Number(match[2]) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function pointsToText(points) {
  return (Array.isArray(points) ? points : []).map((point) => `(${point.x}, ${point.y})`).join(', ');
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
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const padding = { left: 36, right: 40, top: 42, bottom: 32 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;
  const xMin = Number(graph.xMin);
  const xMax = Number(graph.xMax);
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
    drawGraphError(ctx, cssWidth, cssHeight, 'Use a valid x-domain.');
    return;
  }
  let points = [];
  let fnPoints = [];
  const needsFunction = graph.graphType === 'function' || graph.graphType === 'both';
  const needsPoints = graph.graphType === 'points' || graph.graphType === 'both';
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
  let yMin = graph.yMin === '' ? Math.min(...finiteYs, -10) : Number(graph.yMin);
  let yMax = graph.yMax === '' ? Math.max(...finiteYs, 10) : Number(graph.yMax);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
    const center = Number.isFinite(yMin) ? yMin : 0;
    yMin = center - 10;
    yMax = center + 10;
  }
  const paddingY = graph.yMin === '' && graph.yMax === '' ? (yMax - yMin) * 0.04 || 1 : 0;
  yMin -= paddingY;
  yMax += paddingY;
  const toPx = (x, y) => ({
    px: padding.left + ((x - xMin) / (xMax - xMin)) * plotWidth,
    py: padding.top + ((yMax - y) / (yMax - yMin)) * plotHeight
  });
  const meta = { width: cssWidth, height: cssHeight, padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx, graph };
  drawGrid(ctx, meta);
  if (fnPoints.length) drawCurve(ctx, fnPoints, { toPx, yMin, yMax, plotHeight });
  if (points.length) drawPoints(ctx, points, { toPx, xMin, xMax, yMin, yMax });
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
  return Math.max(220, Math.min(320, hostWidth - 8));
}

function drawGrid(ctx, meta) {
  const { width, height, padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx, graph } = meta;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#e7ece9';
  ctx.fillStyle = 'rgba(33, 33, 33, 0.62)';
  ctx.font = '11px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  const verticalTicks = 8;
  const horizontalTicks = 8;
  for (let i = 0; i <= verticalTicks; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / verticalTicks;
    const { px } = toPx(x, yMin);
    ctx.beginPath(); ctx.moveTo(px, padding.top); ctx.lineTo(px, padding.top + plotHeight); ctx.stroke();
    ctx.fillText(formatTick(x), px, height - 14);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= horizontalTicks; i += 1) {
    const y = yMin + ((yMax - yMin) * i) / horizontalTicks;
    const { py } = toPx(xMin, y);
    ctx.beginPath(); ctx.moveTo(padding.left, py); ctx.lineTo(padding.left + plotWidth, py); ctx.stroke();
    ctx.fillText(formatTick(y), padding.left - 7, py + 4);
  }
  ctx.strokeStyle = '#cfd9d4';
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
  ctx.strokeStyle = '#5f6f66';
  ctx.fillStyle = '#5f6f66';
  ctx.lineWidth = 2.15;
  if (xMin <= 0 && xMax >= 0) {
    const { px } = toPx(0, yMin);
    ctx.beginPath(); ctx.moveTo(px, padding.top + plotHeight); ctx.lineTo(px, padding.top); ctx.stroke();
    drawArrowhead(ctx, px, padding.top, 'up');
  }
  if (yMin <= 0 && yMax >= 0) {
    const { py } = toPx(xMin, 0);
    ctx.beginPath(); ctx.moveTo(padding.left, py); ctx.lineTo(padding.left + plotWidth, py); ctx.stroke();
    drawArrowhead(ctx, padding.left + plotWidth, py, 'right');
  }
  ctx.restore();
}


function drawAxisTickMarks(ctx, meta, verticalTicks, horizontalTicks) {
  const { padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx } = meta;
  ctx.save();
  ctx.strokeStyle = '#5f6f66';
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
  if (direction === 'right') {
    ctx.moveTo(x, y); ctx.lineTo(x - size, y - size * 0.55); ctx.lineTo(x - size, y + size * 0.55);
  } else {
    ctx.moveTo(x, y); ctx.lineTo(x - size * 0.55, y + size); ctx.lineTo(x + size * 0.55, y + size);
  }
  ctx.closePath(); ctx.fill();
}

function drawAxisLabels(ctx, meta, graph) {
  const { padding, plotWidth, xMin, xMax, yMin, yMax, toPx } = meta;
  ctx.save();
  ctx.fillStyle = '#145c63';
  ctx.font = '600 13px Inter, Arial, sans-serif';
  if (yMin <= 0 && yMax >= 0) {
    const { py } = toPx(xMax, 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', padding.left + plotWidth + 7, py - 9);
  }
  if (xMin <= 0 && xMax >= 0) {
    const { px } = toPx(0, yMax);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(formatYAxisExpression(graph), Math.min(padding.left + plotWidth - 8, px + 10), padding.top - 7);
  }
  ctx.restore();
}

function drawCurve(ctx, points, meta) {
  const { toPx, yMin, yMax, plotHeight } = meta;
  let startedCurve = false;
  let previous = null;
  ctx.save();
  ctx.strokeStyle = '#145c63';
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
  ctx.fillStyle = '#145c63';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  points.forEach((point) => {
    if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) return;
    const { px, py } = toPx(point.x, point.y);
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

function drawGraphError(ctx, width, height, message) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#c62828';
  ctx.font = '14px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
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

function formatTick(value) {
  if (Math.abs(value) >= 100 || (Math.abs(value) < 0.01 && value !== 0)) return value.toExponential(1);
  return Number(value.toFixed(2)).toString();
}

function formatYAxisExpression(graph) {
  if (!graph) return 'y';
  const expression = String(graph.expression || '').trim();
  if (!expression || graph.graphType === 'points') return 'y';
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

function formatPoints(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function optionLetter(index) {
  return String.fromCharCode(65 + index);
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
    return window.MathJax.typesetPromise([element]).catch((error) => console.error(error));
  }
  return Promise.resolve();
}

initialize();
