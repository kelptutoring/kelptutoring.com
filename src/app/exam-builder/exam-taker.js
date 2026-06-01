/* Kelp online exam taker v5 - vanilla HTML/CSS/JS */

const LIBRARY_KEY = "kelp-exam-library-v1";
const ACTIVE_EXAM_KEY = "kelp-active-exam-v1";
const RESULTS_KEY = "kelp-exam-results-v1";

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
const responses = {};

function initialize() {
  if (!exam) {
    renderNoExam();
    return;
  }

  exam = normalizeExam(exam);
  remainingSeconds = Math.max(0, Math.round(Number(exam.durationMinutes || 0) * 60));
  renderStartScreen();
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

function renderNoExam() {
  root.innerHTML = `
    <p class="tracks-kicker">Online exam</p>
    <h1 id="student-title">No exam loaded</h1>
    <p class="exam-muted">Open the Exam Builder first, then click <strong>Open student view</strong>. You can also import or save an exam there before opening this page.</p>
    <div class="exam-student-actions">
      <a class="btn-primary" href="./exam-builder.html">Go to builder</a>
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
      <a class="btn-outline" href="./exam-builder.html">Back to builder</a>
    </div>
  `;

  document.getElementById("startExamBtn").addEventListener("click", startExam);
  typesetMath(root);
}

function startExam() {
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
  const progressPercent = exam.questions.length ? ((currentIndex + 1) / exam.questions.length) * 100 : 0;
  const answeredCount = exam.questions.filter((item) => hasResponse(item.id)).length;
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
      <div class="exam-timer" id="examTimer">${remainingSeconds > 0 ? formatTime(remainingSeconds) : "No timer"}</div>
    </div>

    <div class="exam-progress-wrap" aria-label="Exam progress">
      <div class="exam-progress-meta">
        <span>Question ${currentIndex + 1} of ${exam.questions.length}</span>
        <span>${answeredCount} answered</span>
      </div>
      <div class="exam-progress-track"><div class="exam-progress-fill" style="width: ${progressPercent}%"></div></div>
    </div>

    <article class="exam-student-question-card">
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

  typesetMath(root);
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

function renderResponseControl(question) {
  const saved = responses[question.id];

  if (question.type === "multiple-choice" || question.type === "true-false") {
    return `
      <div class="exam-student-options" role="radiogroup" aria-label="Answer choices">
        ${question.options.map((option, index) => `
          <label class="exam-student-option">
            <input type="radio" name="student-option" value="${index}" ${Number(saved) === index ? "checked" : ""} />
            <span><strong>${optionLetter(index)}.</strong> ${escapeHTML(option || "________")}</span>
          </label>
        `).join("")}
      </div>
    `;
  }

  if (question.type === "multiple-answer") {
    const savedList = Array.isArray(saved) ? saved.map(Number) : [];
    return `
      <div class="exam-student-options" role="group" aria-label="Answer choices. Select all that apply.">
        <p class="exam-muted">Select all answers that apply.</p>
        ${question.options.map((option, index) => `
          <label class="exam-student-option">
            <input type="checkbox" name="student-option" value="${index}" ${savedList.includes(index) ? "checked" : ""} />
            <span><strong>${optionLetter(index)}.</strong> ${escapeHTML(option || "________")}</span>
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

  return `
    <div class="input-group exam-student-answer">
      <label for="studentTextAnswer">Your answer</label>
      <input id="studentTextAnswer" type="text" value="${escapeAttribute(saved || "")}" placeholder="Type your answer here" />
    </div>
  `;
}

function bindQuestionControls(question) {
  root.querySelectorAll('input[name="student-option"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (question.type === "multiple-answer") {
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
}

function updateProgressOnly() {
  const answeredCount = exam.questions.filter((item) => hasResponse(item.id)).length;
  const progressMeta = root.querySelector(".exam-progress-meta span:last-child");
  if (progressMeta) progressMeta.textContent = `${answeredCount} answered`;
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

  const result = gradeExam(exam, responses, {
    startedAt,
    submittedAt: new Date().toISOString(),
    timeExpired: Boolean(timeExpired)
  });

  const results = readResults();
  results.unshift(result);
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  window.location.href = `./exam-results.html?resultId=${encodeURIComponent(result.id)}`;
}

function gradeExam(examData, answerMap, meta) {
  const result = {
    id: crypto.randomUUID ? crypto.randomUUID() : `result-${Date.now()}-${Math.random()}`,
    examId: examData.id,
    title: examData.title,
    subject: examData.subject,
    titleColor: examData.titleColor || "#212121",
    stripeColor: examData.stripeColor || "#9bf17e",
    startedAt: meta.startedAt,
    submittedAt: meta.submittedAt,
    timeExpired: meta.timeExpired,
    autoEarned: 0,
    autoPossible: 0,
    totalPossible: 0,
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
    } else {
      result.reviewNeeded += points;
    }

    result.items.push(item);
  });

  result.autoEarned = Number(result.autoEarned.toFixed(4));
  return result;
}

function gradeQuestion(question, response, index) {
  const item = {
    questionNumber: index + 1,
    questionId: question.id,
    type: question.type,
    prompt: question.prompt,
    response,
    expectedAnswer: question.answer,
    imageBeforeText: question.imageBeforeText,
    imageData: question.imageData,
    imageAlt: question.imageAlt,
    imageAfterText: question.imageAfterText,
    graphBeforeText: question.graphBeforeText,
    graphAfterText: question.graphAfterText,
    graph: question.graph && graphHasContent(question.graph) ? normalizeGraph(question.graph) : null,
    autoGradable: false,
    isCorrect: false,
    earnedPoints: 0,
    status: "review"
  };

  const points = Number(question.points || 0);

  if (question.type === "multiple-choice" || question.type === "true-false") {
    item.autoGradable = true;
    item.correctOptionIndex = question.correctOptionIndex;
    item.correctOptionText = question.options[question.correctOptionIndex] || "";
    item.responseText = Number.isInteger(Number(response)) ? question.options[Number(response)] || "" : "";
    item.isCorrect = Number(response) === Number(question.correctOptionIndex);
    item.earnedPoints = item.isCorrect ? points : 0;
    item.status = item.isCorrect ? "correct" : "incorrect";
    return item;
  }

  if (question.type === "multiple-answer") {
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
    const expected = parseStrictNumber(question.answer);
    const actual = parseStrictNumber(response);
    if (expected !== null && actual !== null) {
      item.autoGradable = true;
      item.isCorrect = Math.abs(expected - actual) <= 1e-6;
      item.earnedPoints = item.isCorrect ? points : 0;
      item.status = item.isCorrect ? "correct" : "incorrect";
    }
    return item;
  }

  if (question.type === "short-answer" && String(question.answer || "").trim()) {
    item.autoGradable = true;
    item.isCorrect = normalizeText(response) === normalizeText(question.answer);
    item.earnedPoints = item.isCorrect ? points : 0;
    item.status = item.isCorrect ? "correct" : "incorrect";
    return item;
  }

  return item;
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

  const type = ["short-answer", "multiple-choice", "multiple-answer", "true-false", "numeric", "essay"].includes(question.type) ? question.type : "short-answer";
  const finalOptions = type === "true-false" ? ["True", "False"] : options;
  const rawCorrectIndexes = Array.isArray(question.correctOptionIndexes)
    ? question.correctOptionIndexes
    : Number.isInteger(Number(question.correctOptionIndex))
      ? [Number(question.correctOptionIndex)]
      : [];

  return {
    id: String(question.id || `q-${Math.random()}`),
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
    graph: question.graph && graphHasContent(question.graph) ? normalizeGraph(question.graph) : null
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

function getSquareCanvasSize(canvas) {
  const host = canvas.parentElement || canvas;
  const hostWidth = Math.floor(host.getBoundingClientRect().width || canvas.getBoundingClientRect().width || 360);
  return Math.max(240, Math.min(380, hostWidth - 8));
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
  return `y = ${expression}`;
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

initialize();
