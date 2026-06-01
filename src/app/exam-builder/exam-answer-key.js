/* Kelp exam answer key page - vanilla HTML/CSS/JS */

const RESULTS_KEY = "kelp-exam-results-v1";

const root = document.getElementById("answerKeyRoot");
const params = new URLSearchParams(window.location.search);
const resultId = params.get("resultId");

function initialize() {
  const result = loadResult();

  if (!result) {
    renderNoResult();
    return;
  }

  renderAnswerKey(result);
}

function loadResult() {
  const results = readResults();

  if (resultId) {
    return results.find((item) => String(item.id) === String(resultId)) || null;
  }

  return results[0] || null;
}

function readResults() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function renderNoResult() {
  root.innerHTML = `
    <p class="tracks-kicker">Answers and key</p>
    <h1 id="answer-key-title">No result found</h1>
    <p class="exam-muted">Take an online exam first. Results are saved in this browser for this prototype.</p>

    <div class="exam-results-actions">
      <a class="btn-primary" href="./exam-taker.html">Go to student view</a>
      <a class="btn-outline" href="./exam-builder.html">Go to builder</a>
    </div>
  `;
}

function renderAnswerKey(result) {
  const resultsHref = `./exam-results.html?resultId=${encodeURIComponent(result.id)}`;

  root.style.setProperty("--exam-title-color", result.titleColor || "#212121");
  root.style.setProperty("--exam-stripe-color", result.stripeColor || "#9bf17e");

  root.innerHTML = `
    <header class="exam-results-header">
      <p class="tracks-kicker">Answers and answer key</p>
      <h1 id="answer-key-title" class="exam-document-title">${escapeHTML(result.title || "Untitled exam")}</h1>
      <p class="exam-paper-subtitle">${escapeHTML(result.subject || "Subject / track")}</p>
      <p class="exam-muted">This page shows the student response beside the exam answer key.</p>
    </header>

    <section class="exam-result-details" aria-label="Answers and answer key">
      <table class="exam-result-table compact">
        <thead>
          <tr>
            <th>Question</th>
            <th>Your answer</th>
            <th>Answer key</th>
          </tr>
        </thead>
        <tbody>
          ${(result.items || []).map(renderAnswerKeyRow).join("")}
        </tbody>
      </table>
    </section>

    <div class="exam-results-actions screen-only">
      <button type="button" class="btn-primary" id="printAnswerKeyBtn">Print answers and key</button>
      <a class="btn-secondary" href="${escapeAttribute(resultsHref)}">Back to result</a>
      <a class="btn-outline" href="./exam-taker.html">Take again</a>
      <a class="btn-outline" href="./exam-builder.html">Back to builder</a>
    </div>
  `;

  const printButton = document.getElementById("printAnswerKeyBtn");
  if (printButton) {
    printButton.addEventListener("click", () => window.print());
  }

  typesetMath(root);
}

function renderAnswerKeyRow(item) {
  const statusClass = getStatusClass(item);
  const statusLabel = getStatusLabel(item);
  const scoreText = item.autoGradable
    ? `${formatPoints(item.earnedPoints)} / ${formatPoints(item.points)} pt${Number(item.points) === 1 ? "" : "s"}`
    : `${formatPoints(item.points)} pt${Number(item.points) === 1 ? "" : "s"} · teacher review`;

  return `
    <tr class="exam-result-row ${statusClass}">
      <td class="exam-result-question-cell">
        <strong>Question ${escapeHTML(String(item.questionNumber))}</strong>
        <div class="exam-results-prompt">${escapeHTML(item.prompt || "Question text not added.")}</div>
        ${renderMediaNote(item)}
        <div class="exam-result-question-meta">
          <span>${escapeHTML(scoreText)}</span>
          <span class="exam-result-status ${statusClass}">${escapeHTML(statusLabel)}</span>
        </div>
      </td>
      <td class="exam-result-answer-cell">${formatResponse(item)}</td>
      <td class="exam-result-answer-cell">${formatCorrectAnswer(item)}</td>
    </tr>
  `;
}

function renderMediaNote(item) {
  const pieces = [];

  if (item.imageData || item.imageBeforeText || item.imageAfterText) {
    pieces.push("Image included in the original question.");
  }

  if (item.graph || item.graphBeforeText || item.graphAfterText) {
    const title = item.graph && item.graph.title ? `: ${item.graph.title}` : "";
    pieces.push(`Diagram included in the original question${title}.`);
  }

  if (!pieces.length) return "";

  return `<p class="exam-muted">${escapeHTML(pieces.join(" "))}</p>`;
}

function formatResponse(item) {
  if (item.type === "multiple-choice" || item.type === "true-false") {
    if (item.response === undefined || item.response === null || item.response === "") return "<em>Blank</em>";

    return `${escapeHTML(optionLetter(Number(item.response)))}. ${escapeHTML(item.responseText || "")}`;
  }

  if (item.type === "multiple-answer") {
    const responseIndexes = Array.isArray(item.response) ? item.response.map(Number) : [];
    const texts = Array.isArray(item.responseTexts) ? item.responseTexts : [];

    if (!responseIndexes.length) return "<em>Blank</em>";

    return responseIndexes
      .map((index, position) => `${escapeHTML(optionLetter(index))}. ${escapeHTML(texts[position] || "")}`)
      .join("<br>");
  }

  const text = String(item.response ?? "").trim();
  return text ? escapeHTML(text) : "<em>Blank</em>";
}

function formatCorrectAnswer(item) {
  let answer = "";

  if (item.type === "multiple-choice" || item.type === "true-false") {
    answer = `${escapeHTML(optionLetter(Number(item.correctOptionIndex)))}. ${escapeHTML(item.correctOptionText || "")}`;
  } else if (item.type === "multiple-answer") {
    const indexes = Array.isArray(item.correctOptionIndexes) ? item.correctOptionIndexes : [];
    const texts = Array.isArray(item.correctOptionTexts) ? item.correctOptionTexts : [];

    answer = indexes.length
      ? indexes.map((index, position) => `${escapeHTML(optionLetter(index))}. ${escapeHTML(texts[position] || "")}`).join("<br>")
      : "<em>No correct options selected by tutor</em>";
  } else {
    const expected = String(item.expectedAnswer || "").trim();
    answer = expected ? escapeHTML(expected) : "<em>Teacher review required</em>";
  }

  const notes = getTeacherNotes(item);
  return notes ? `${answer}<hr><strong>Teacher notes:</strong><br>${escapeHTML(notes)}` : answer;
}

function getTeacherNotes(item) {
  const notes = String(item.expectedAnswer || "").trim();

  if (!notes) return "";

  if (item.type === "multiple-choice" || item.type === "multiple-answer" || item.type === "true-false") {
    return notes;
  }

  return "";
}

function getStatusClass(item) {
  if (item.status === "correct") return "correct";
  if (item.status === "incorrect") return "incorrect";
  if (item.status === "partial") return "partial";
  return "review";
}

function getStatusLabel(item) {
  if (item.status === "correct") return "Right";
  if (item.status === "incorrect") return "Wrong";
  if (item.status === "partial") return "Partial";
  return "Review";
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
    window.MathJax.typesetPromise([element]).catch((error) => console.error(error));
  }
}

initialize();
