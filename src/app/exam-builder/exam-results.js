/* Kelp exam results page v5 - vanilla HTML/CSS/JS */

const RESULTS_KEY = "kelp-exam-results-v1";
const root = document.getElementById("resultsRoot");
const params = new URLSearchParams(window.location.search);
const resultId = params.get("resultId");

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
    return results.find((item) => item.id === resultId) || null;
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
    <p class="tracks-kicker">Exam results</p>
    <h1 id="results-title">No result found</h1>
    <p class="exam-muted">Take an online exam first. Results are saved in this browser for this prototype.</p>
    <div class="exam-results-actions">
      <a class="btn-primary" href="./exam-taker.html">Go to student view</a>
      <a class="btn-outline" href="./exam-builder.html">Go to builder</a>
    </div>
  `;
}

function renderResult(result) {
  const percentage = result.autoPossible > 0
    ? Math.round((result.autoEarned / result.autoPossible) * 100)
    : null;

  root.style.setProperty("--exam-title-color", result.titleColor || "#212121");
  root.style.setProperty("--exam-stripe-color", result.stripeColor || "#9bf17e");

  root.innerHTML = `
    <header class="exam-results-header">
      <p class="tracks-kicker">Exam results</p>
      <h1 id="results-title" class="exam-document-title">${escapeHTML(result.title || "Untitled exam")}</h1>
      <p class="exam-paper-subtitle">${escapeHTML(result.subject || "Subject / track")}${result.timeExpired ? " · Submitted when the timer ended" : ""}</p>
    </header>

    <section class="exam-result-summary" aria-label="Score summary">
      <table class="exam-result-table compact exam-result-summary-table">
        <thead>
          <tr>
            <th>Auto-graded score</th>
            <th>Auto-graded points</th>
            <th>Total exam points</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="exam-result-score-cell">${percentage === null ? "Pending" : `${percentage}%`}</td>
            <td>${escapeHTML(String(result.autoEarned))} / ${escapeHTML(String(result.autoPossible))}</td>
            <td>${escapeHTML(String(result.totalPossible))}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="exam-result-details" aria-label="Question details">
      <table class="exam-result-table exam-result-key-table">
        <thead>
          <tr>
            <th class="exam-result-question-col">Question</th>
            <th>Your answer</th>
          </tr>
        </thead>
        <tbody>
          ${result.items.map(renderResultRow).join("")}
        </tbody>
      </table>
    </section>

    <div class="exam-results-actions screen-only">
      <button type="button" class="btn-primary" id="printResultsBtn">Print results</button>
      <a class="btn-secondary" href="./exam-taker.html">Take again</a>
      <a class="btn-outline" href="./exam-builder.html">Back to builder</a>
    </div>
  `;

  const printButton = document.getElementById("printResultsBtn");
  if (printButton) printButton.addEventListener("click", () => window.print());
  drawResultGraphs(result);
  typesetMath(root);
}

function renderResultRow(item) {
  const statusClass = item.status === "correct" ? "correct" : item.status === "incorrect" ? "incorrect" : item.status === "partial" ? "partial" : "review";
  const statusLabel = item.status === "correct" ? "Right" : item.status === "incorrect" ? "Wrong" : item.status === "partial" ? "Partial" : "Review";
  const response = formatResponse(item);
  const pointText = item.autoGradable
    ? `${formatPoints(item.earnedPoints || 0)} / ${formatPoints(item.points || 0)} pt${Number(item.points) === 1 ? "" : "s"}`
    : `${formatPoints(item.points || 0)} pt${Number(item.points) === 1 ? "" : "s"}`;
  const mediaHtml = renderResultMedia(item);

  return `
    <tr class="exam-result-row ${statusClass}">
      <td class="exam-result-question-cell">
        <strong>Question ${escapeHTML(String(item.questionNumber))}</strong>
        <div class="exam-results-prompt">${escapeHTML(item.prompt || "Question text not added.")}</div>
        ${mediaHtml}
        <div class="exam-result-question-meta">
          <span>${escapeHTML(pointText)}</span>
          <span class="exam-result-status ${statusClass}">${escapeHTML(statusLabel)}</span>
        </div>
      </td>
      <td class="exam-result-answer-cell">${response}</td>
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
  root.querySelectorAll('[data-result-graph-id]').forEach((canvas) => {
    const key = canvas.dataset.resultGraphId;
    const item = (result.items || []).find((entry) => String(entry.questionId || entry.questionNumber) === String(key));
    if (item && item.graph) drawGraph(canvas, item.graph);
  });
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
  return text ? escapeHTML(text) : "<em>Blank</em>";
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
  const expected = String(item.expectedAnswer || "").trim();
  return expected ? escapeHTML(expected) : "<em>No automatic answer key available</em>";
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
  return `y = ${expression}`;
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
