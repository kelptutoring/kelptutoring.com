/* Kelp Exam Builder v5 - vanilla HTML/CSS/JS */

const STORAGE_DRAFT_KEY = "kelp-exam-builder-draft-v5";
const LIBRARY_KEY = "kelp-exam-library-v1";
const ACTIVE_EXAM_KEY = "kelp-active-exam-v1";

const state = createExam();
const graphDrafts = new Map();
let renderTimer = null;
let pendingEnterQuestionId = null;
let diagramDragState = null;
let suppressNextCanvasClick = false;
const diagramToolByQuestionId = new Map();
const diagramSelectionByQuestionId = new Map();
const diagramObjectSelectionByQuestionId = new Map();
const diagramConstructionByQuestionId = new Map();
const diagramHistoryByQuestionId = new Map();

const MOTION = {
  questionMs: 900,
  toolbarMs: 900,
  previewMs: 900,
  foldMs: 800
};

const els = {
  title: document.getElementById("examTitle"),
  subject: document.getElementById("examSubject"),
  duration: document.getElementById("examDuration"),
  titleColor: document.getElementById("titleColor"),
  stripeColor: document.getElementById("stripeColor"),
  instructions: document.getElementById("examInstructions"),
  instructionsPreview: document.getElementById("instructionsPreview"),
  addQuestionBtn: document.getElementById("addQuestionBtn"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  loadDraftBtn: document.getElementById("loadDraftBtn"),
  saveLibraryBtn: document.getElementById("saveLibraryBtn"),
  openStudentViewBtn: document.getElementById("openStudentViewBtn"),
  printExamBtn: document.getElementById("printExamBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  questionList: document.getElementById("questionList"),
  examPreview: document.getElementById("examPreview"),
  questionTemplate: document.getElementById("questionTemplate"),
  toolbar: document.querySelector(".exam-toolbar"),
};

function createExam(overrides = {}) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `exam-${Date.now()}-${Math.random()}`,
    title: "",
    subject: "",
    instructions: "",
    durationMinutes: 45,
    titleColor: "#212121",
    stripeColor: "#9bf17e",
    questions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function createQuestion(overrides = {}) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}-${Math.random()}`,
    type: "multiple-choice",
    prompt: "",
    points: 1,
    answer: "",
    options: ["", "", "", ""],
    correctOptionIndex: 0,
    correctOptionIndexes: [],
    imageBeforeText: "",
    imageData: "",
    imageAlt: "",
    imageAfterText: "",
    graphBeforeText: "",
    graphAfterText: "",
    graph: null,
    collapsed: true,
    basicCollapsed: true,
    imageCollapsed: true,
    graphCollapsed: true,
    ...overrides
  };
}

function initialize() {
  state.title = "Algebra 1 Checkpoint";
  state.subject = "Algebra 1";
  state.instructions = "Answer each question. For multiple-choice questions, select one option. For written answers, show your reasoning when possible.";
  state.questions.push(createQuestion({
    prompt: "What is the solution of $x^2=4$?",
    options: ["$x=2$ only", "$x=-2$ only", "$x=-2$ or $x=2$", "No real solution"],
    correctOptionIndex: 2,
    correctOptionIndexes: [2],
    answer: "Both $-2$ and $2$ solve the equation because $(-2)^2=4$ and $2^2=4$.",
    graph: null,
    collapsed: false
  }));

  bindEvents();
  syncInputsFromState();
  renderQuestions();
  renderAllPreviews();
}

function bindEvents() {
  [els.title, els.subject, els.duration, els.titleColor, els.stripeColor, els.instructions].forEach((input) => {
    input.addEventListener("input", () => {
      updateMetaFromInputs();
      renderAllPreviewsDebounced();
    });
  });

  els.addQuestionBtn.addEventListener("click", () => {
    const toolbarBefore = getToolbarRect();

    const newQuestion = createQuestion({
      collapsed: true,
      basicCollapsed: true,
      imageCollapsed: true,
      graphCollapsed: true
    });

    pendingEnterQuestionId = newQuestion.id;
    state.questions.push(newQuestion);

    renderQuestions();
    renderAllPreviews({ animatePreview: true });
    animateToolbarFrom(toolbarBefore);
  });

  els.saveDraftBtn.addEventListener("click", () => {
    updateMetaFromInputs();
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(state));
    alert("Draft saved in this browser.");
  });

  els.loadDraftBtn.addEventListener("click", () => {
    const saved = localStorage.getItem(STORAGE_DRAFT_KEY);
    if (!saved) {
      alert("No saved draft found in this browser.");
      return;
    }

    try {
      replaceState(JSON.parse(saved));
      syncInputsFromState();
      renderQuestions();
      renderAllPreviews();
    } catch (error) {
      alert("The saved draft could not be loaded.");
      console.error(error);
    }
  });

  els.saveLibraryBtn.addEventListener("click", () => {
    const saved = saveExamToLocalLibrary();
    alert(`Saved to local library: ${saved.title || "Untitled exam"}`);
  });

  els.openStudentViewBtn.addEventListener("click", () => {
    const saved = saveExamToLocalLibrary();
    localStorage.setItem(ACTIVE_EXAM_KEY, JSON.stringify(saved));
    window.open(`./exam-taker.html?examId=${encodeURIComponent(saved.id)}`, "_blank", "noopener");
  });

  els.printExamBtn.addEventListener("click", () => {
    updateMetaFromInputs();
    renderAllPreviews();
    setTimeout(() => window.print(), 250);
  });

  els.exportJsonBtn.addEventListener("click", exportJson);
  els.importJsonInput.addEventListener("change", importJson);

  els.questionList.addEventListener("input", handleQuestionInput);
  els.questionList.addEventListener("change", handleQuestionChange);
  els.questionList.addEventListener("click", handleQuestionClick);
  els.questionList.addEventListener("dblclick", handleQuestionDoubleClick);
  els.questionList.addEventListener("pointerdown", handleGraphPointerDown);
  els.questionList.addEventListener("pointermove", handleGraphPointerMove);
  els.questionList.addEventListener("pointerleave", handleGraphPointerLeave, true);
  window.addEventListener("pointerup", handleGraphPointerUp);
  window.addEventListener("pointercancel", handleGraphPointerUp);

  window.addEventListener("resize", debounce(drawAllGraphs, 150));
}

function updateMetaFromInputs() {
  state.title = els.title.value.trim();
  state.subject = els.subject.value.trim();
  state.durationMinutes = parseNumberOrDefault(els.duration.value, 0);
  state.titleColor = els.titleColor.value || "#212121";
  state.stripeColor = els.stripeColor.value || "#9bf17e";
  state.instructions = els.instructions.value;
}

function syncInputsFromState() {
  els.title.value = state.title || "";
  els.subject.value = state.subject || "";
  els.duration.value = Number.isFinite(Number(state.durationMinutes)) ? state.durationMinutes : 0;
  els.titleColor.value = state.titleColor || "#212121";
  els.stripeColor.value = state.stripeColor || "#9bf17e";
  els.instructions.value = state.instructions || "";
}

function replaceState(nextState) {
  const normalized = normalizeExam(nextState);
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, normalized);
  graphDrafts.clear();
}

function normalizeExam(exam) {
  const normalized = createExam({
    id: String(exam.id || (crypto.randomUUID ? crypto.randomUUID() : `exam-${Date.now()}`)),
    title: String(exam.title || ""),
    subject: String(exam.subject || ""),
    instructions: String(exam.instructions || ""),
    durationMinutes: Number.isFinite(Number(exam.durationMinutes)) ? Number(exam.durationMinutes) : 0,
    titleColor: isHexColor(exam.titleColor) ? exam.titleColor : "#212121",
    stripeColor: isHexColor(exam.stripeColor) ? exam.stripeColor : "#9bf17e",
    createdAt: exam.createdAt || new Date().toISOString(),
    updatedAt: exam.updatedAt || new Date().toISOString(),
    questions: Array.isArray(exam.questions) ? exam.questions.map(normalizeQuestion) : []
  });

  if (normalized.questions.length === 0) {
    normalized.questions.push(createQuestion());
  }

  return normalized;
}

function normalizeQuestion(question) {
  const normalized = createQuestion(question);
  normalized.basicCollapsed = question.basicCollapsed ?? true;
  normalized.imageCollapsed = question.imageCollapsed ?? true;
  normalized.graphCollapsed = question.graphCollapsed ?? true;
  normalized.id = String(question.id || normalized.id);
  normalized.prompt = String(question.prompt || "");
  normalized.type = ["short-answer", "multiple-choice", "multiple-answer", "true-false", "numeric", "essay"].includes(question.type)
    ? question.type
    : "short-answer";
  normalized.points = Number.isFinite(Number(question.points)) ? Number(question.points) : 1;
  normalized.answer = String(question.answer || "");
  normalized.options = Array.isArray(question.options) && question.options.length
    ? question.options.map((option) => String(option || ""))
    : ["", "", "", ""];

  if (normalized.type === "true-false") {
    normalized.options = ["True", "False"];
  }

  normalized.correctOptionIndex = Number.isInteger(Number(question.correctOptionIndex))
    ? Math.max(0, Math.min(Number(question.correctOptionIndex), normalized.options.length - 1))
    : 0;

  const rawCorrectIndexes = Array.isArray(question.correctOptionIndexes)
    ? question.correctOptionIndexes
    : Number.isInteger(Number(question.correctOptionIndex))
      ? [Number(question.correctOptionIndex)]
      : [];

  normalized.correctOptionIndexes = [...new Set(rawCorrectIndexes
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < normalized.options.length))];

  normalized.imageBeforeText = String(question.imageBeforeText || "");
  normalized.imageData = String(question.imageData || "");
  normalized.imageAlt = String(question.imageAlt || "");
  normalized.imageAfterText = String(question.imageAfterText || "");
  normalized.graphBeforeText = String(question.graphBeforeText || "");
  normalized.graphAfterText = String(question.graphAfterText || "");
  normalized.graph = question.graph && graphHasContent(question.graph) ? normalizeGraph(question.graph) : null;
  normalized.collapsed = question.collapsed ?? true;
  normalized.basicCollapsed = question.basicCollapsed ?? true;
  normalized.imageCollapsed = question.imageCollapsed ?? true;
  normalized.graphCollapsed = question.graphCollapsed ?? true;
  return normalized;
}

function normalizeGraph(graph = {}) {
  const graphType = ["points", "polygon", "function", "diagram"].includes(graph.graphType)
    ? graph.graphType
    : "points";

  const displayMode = graph.displayMode === "geometry" ? "geometry" : "coordinate";
  const pointsText = String(
    graph.pointsText || pointsToText(Array.isArray(graph.points) ? graph.points : [])
  );
  const points = parsePoints(pointsText);

  const segments = Array.isArray(graph.segments)
    ? graph.segments.map(normalizeSegment).filter(Boolean)
    : [];

  const angles = Array.isArray(graph.angles)
    ? graph.angles.map(normalizeAngle).filter(Boolean)
    : [];

  const regularPolygon = graph.regularPolygon && typeof graph.regularPolygon === "object"
    ? normalizeRegularPolygon(graph.regularPolygon, graph)
    : (graphType === "polygon" ? normalizeRegularPolygon({}, graph) : null);

  return {
    graphType,
    displayMode,
    title: String(graph.title || graph.label || ""),
    expression: String(graph.expression || ""),
    pointsText,
    points,
    segments,
    angles,
    regularPolygon,
    autoFit: graph.autoFit !== false,
    snapToGrid: Boolean(graph.snapToGrid),
    xMin: parseNumberOrDefault(graph.xMin, -10),
    xMax: parseNumberOrDefault(graph.xMax, 10),
    yMin: parseOptionalNumber(graph.yMin),
    yMax: parseOptionalNumber(graph.yMax)
  };
}

function normalizeSegment(segment) {
  if (!segment || typeof segment !== "object") return null;
  const from = sanitizeGraphLabel(segment.from);
  const to = sanitizeGraphLabel(segment.to);
  if (!from || !to || from === to) return null;
  return {
    from,
    to,
    labelMode: ["name", "length", "variable", "hidden"].includes(segment.labelMode)
      ? segment.labelMode
      : "name"
  };
}

function normalizeAngle(angle) {
  if (!angle || typeof angle !== "object") return null;
  const from = sanitizeGraphLabel(angle.from);
  const vertex = sanitizeGraphLabel(angle.vertex);
  const to = sanitizeGraphLabel(angle.to);
  if (!from || !vertex || !to || from === vertex || vertex === to) return null;
  return {
    from,
    vertex,
    to,
    labelMode: ["name", "value", "variable", "blank", "none"].includes(angle.labelMode)
      ? angle.labelMode
      : "name"
  };
}

function normalizeRegularPolygon(polygon = {}, graph = {}) {
  return {
    sides: Math.max(3, Math.floor(parseNumberOrDefault(polygon.sides ?? graph.polygonSides, 3))),
    radius: Math.max(0.1, parseNumberOrDefault(polygon.radius ?? graph.polygonRadius, 4)),
    rotation: parseNumberOrDefault(polygon.rotation ?? graph.polygonRotation, 90),
    centerX: parseNumberOrDefault(polygon.centerX ?? graph.polygonCenterX, 0),
    centerY: parseNumberOrDefault(polygon.centerY ?? graph.polygonCenterY, 0),
    showApothem: Boolean(polygon.showApothem ?? graph.showApothem),
    segmentLabelModes: polygon.segmentLabelModes && typeof polygon.segmentLabelModes === "object"
      ? { ...polygon.segmentLabelModes }
      : {}
  };
}

function graphHasContent(graph) {
  if (!graph) return false;
  const normalized = normalizeGraph(graph);
  const hasExpression = normalized.expression.trim() !== "";
  return (
    hasExpression ||
    normalized.points.length > 0 ||
    normalized.segments.length > 0 ||
    normalized.angles.length > 0 ||
    Boolean(normalized.regularPolygon)
  );
}

function renderQuestions() {
  els.questionList.innerHTML = "";

  state.questions.forEach((question, index) => {
    const node = els.questionTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.questionId = question.id;

    const shouldAnimateEnter = question.id === pendingEnterQuestionId;

    if (shouldAnimateEnter) {
      node.classList.add("is-entering");
    }

    node.querySelector("[data-question-number]").textContent = index + 1;
    node.querySelector("[data-question-heading]").textContent = question.prompt.trim()
      ? firstWords(question.prompt, 8)
      : "Untitled question";

    node.querySelector('[data-field="prompt"]').value = question.prompt;
    node.querySelector('[data-field="type"]').value = question.type;
    node.querySelector('[data-field="points"]').value = question.points;
    node.querySelector('[data-field="answer"]').value = question.answer;
    node.querySelector('[data-field="imageBeforeText"]').value = question.imageBeforeText || "";
    node.querySelector('[data-field="imageAlt"]').value = question.imageAlt || "";
    node.querySelector('[data-field="imageAfterText"]').value = question.imageAfterText || "";
    node.querySelector('[data-field="graphBeforeText"]').value = question.graphBeforeText || "";
    node.querySelector('[data-field="graphAfterText"]').value = question.graphAfterText || "";
    node.querySelector("[data-question-preview]").textContent =
      question.prompt || "Type a question above to preview LaTeX.";

    updateFoldState(node, "basic", question.basicCollapsed ?? true);
    updateFoldState(node, "image", question.imageCollapsed ?? true);
    updateFoldState(node, "graph", question.graphCollapsed ?? true);

    const questionToggle = node.querySelector('[data-action="toggle-question"]');
    node.classList.toggle("is-collapsed", Boolean(question.collapsed));
    if (questionToggle) {
      questionToggle.textContent = question.collapsed ? "Maximize" : "Minimize";
    }

    renderOptions(node, question);
    renderImagePreview(node, question);
    renderGraphDraft(node, question);

    els.questionList.appendChild(node);

    if (shouldAnimateEnter) {
      runQuestionEnterAnimation(node);
    }
  });

  drawAllGraphs();
  typesetMath();
}


function runQuestionEnterAnimation(node) {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (prefersReducedMotion) {
    node.classList.remove("is-entering");
    pendingEnterQuestionId = null;
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      node.classList.remove("is-entering");
      pendingEnterQuestionId = null;
    });
  });
}


function renderOptions(card, question) {
  const optionsBox = card.querySelector("[data-options-box]");
  const optionList = card.querySelector("[data-option-list]");
  const usesOptions = ["multiple-choice", "multiple-answer", "true-false"].includes(question.type);
  const allowsMultipleCorrect = question.type === "multiple-answer";

  optionsBox.classList.toggle("is-hidden", !usesOptions);
  optionList.innerHTML = "";
  if (!usesOptions) return;

  if (question.type === "true-false") {
    question.options = ["True", "False"];
  }

  question.options.forEach((option, optionIndex) => {
    const row = document.createElement("div");
    row.className = "exam-option-row";

    const letter = document.createElement("span");
    letter.className = "exam-option-letter";
    letter.textContent = optionLetter(optionIndex);

    const input = document.createElement("input");
    input.type = "text";
    input.dataset.optionIndex = String(optionIndex);
    input.value = option;
    input.placeholder = `Option ${optionLetter(optionIndex)}`;
    input.disabled = question.type === "true-false";

    const correct = document.createElement("label");
    correct.className = "exam-correct-choice";
    const selector = document.createElement("input");
    selector.type = allowsMultipleCorrect ? "checkbox" : "radio";
    selector.name = `correct-${question.id}`;
    selector.dataset.correctOptionIndex = String(optionIndex);
    selector.checked = allowsMultipleCorrect
      ? question.correctOptionIndexes.includes(optionIndex)
      : question.correctOptionIndex === optionIndex;
    correct.append(selector, document.createTextNode("Correct"));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-outline exam-small-btn";
    remove.dataset.action = "remove-option";
    remove.dataset.optionIndex = String(optionIndex);
    remove.textContent = "Remove";
    remove.disabled = question.type === "true-false";

    row.append(letter, input, correct, remove);
    optionList.appendChild(row);
  });
}


function renderImagePreview(card, question) {
  const preview = card.querySelector('[data-image-preview]');
  if (!preview) return;

  if (!question.imageData) {
    preview.innerHTML = '<p class="exam-muted">No image uploaded yet.</p>';
    return;
  }

  preview.innerHTML = `
    <img src="${escapeAttribute(question.imageData)}" alt="${escapeAttribute(question.imageAlt || 'Question image')}" />
    ${question.imageAlt ? `<figcaption>${escapeHTML(question.imageAlt)}</figcaption>` : ''}
  `;
}

function renderGraphDraft(card, question) {
  const draft = normalizeGraph(graphDrafts.get(question.id) || question.graph || {
    graphType: "points",
    displayMode: "coordinate",
    title: "",
    expression: "",
    pointsText: "",
    points: [],
    segments: [],
    angles: [],
    regularPolygon: null,
    autoFit: true,
    snapToGrid: false,
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10
  });

  const setValue = (name, value) => {
    const field = card.querySelector(`[data-graph-field="${name}"]`);
    if (!field) return;

    if (field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }

    field.value = value ?? "";
  };

  setValue("graphType", draft.graphType || "points");
  setValue("displayMode", draft.displayMode || "coordinate");
  setValue("title", draft.title || "");
  setValue("expression", draft.expression || "");
  setValue("functionStroke", draft.functionStroke || "#145c63");
  setValue("functionLineWidth", draft.functionLineWidth ?? 2.5);
  setValue("functionDash", draft.functionDash || "solid");
  setValue("functionLabel", draft.functionLabel || "");
  setValue("pointsText", draft.pointsText || pointsToText(draft.points || []));
  setValue("xMin", draft.xMin ?? -10);
  setValue("xMax", draft.xMax ?? 10);
  setValue("yMin", draft.yMin ?? -10);
  setValue("yMax", draft.yMax ?? 10);
  setValue("autoFit", draft.autoFit !== false);
  setValue("snapToGrid", draft.snapToGrid || false);
  setValue("polygonSides", draft.regularPolygon?.sides ?? 3);
  setValue("polygonRadius", draft.regularPolygon?.radius ?? 4);
  setValue("polygonRotation", draft.regularPolygon?.rotation ?? 90);
  setValue("showApothem", draft.regularPolygon?.showApothem || false);

  graphDrafts.set(question.id, draft);
  updateGraphFieldVisibility(card, draft.graphType || "points");
  updateDiagramToolButtons(card, getActiveDiagramTool(question.id));
  updateDiagramToolHint(card, draft);

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = question.graph
      ? describeAttachedGraph(question.graph)
      : "Choose a tool on the left, then interact with the diagram.";
    message.classList.remove("error");
  }
}

function refreshGraphDraftFromCard(card, options = {}) {
  const question = findQuestion(card.dataset.questionId);
  if (!question) return null;

  const values = getGraphValuesFromCard(card);
  graphDrafts.set(question.id, values);

  if (options.updateVisibility) {
    updateGraphFieldVisibility(card, values.graphType);
  }

  updateDiagramToolButtons(card, getActiveDiagramTool(question.id));
  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
  return values;
}

function handleQuestionInput(event) {
  const card = event.target.closest("[data-question-card]");
  if (!card) return;

  const question = findQuestion(card.dataset.questionId);
  if (!question) return;

  if (event.target.matches("[data-field]")) {
    const field = event.target.dataset.field;
    const value = event.target.type === "number" ? Number(event.target.value) : event.target.value;
    question[field] = value;

    if (field === "prompt") {
      const preview = card.querySelector("[data-question-preview]");
      preview.textContent = question.prompt || "Type a question above to preview LaTeX.";
      card.querySelector("[data-question-heading]").textContent = question.prompt.trim()
        ? firstWords(question.prompt, 8)
        : "Untitled question";
    }

    if (field === "imageAlt") {
      renderImagePreview(card, question);
    }

    renderAllPreviewsDebounced();
  }

  if (event.target.matches("[data-option-index]")) {
    const index = Number(event.target.dataset.optionIndex);
    question.options[index] = event.target.value;
    renderAllPreviewsDebounced();
  }

  if (event.target.matches("[data-graph-field]")) {
    refreshGraphDraftFromCard(card, {
      updateVisibility: event.target.dataset.graphField === "graphType"
    });
  }
}

function getToolbarRect() {
  return els.toolbar ? els.toolbar.getBoundingClientRect() : null;
}

function animateToolbarFrom(beforeRect) {
  if (!els.toolbar || !beforeRect) return;

  const afterRect = els.toolbar.getBoundingClientRect();
  const deltaY = beforeRect.top - afterRect.top;

  if (Math.abs(deltaY) < 1) return;

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prefersReducedMotion) return;

  els.toolbar.getAnimations?.().forEach((animation) => animation.cancel());

  if (typeof els.toolbar.animate === "function") {
    els.toolbar.animate(
      [
        { transform: `translateY(${deltaY}px)` },
        { transform: "translateY(0)" }
      ],
      {
        duration: MOTION.toolbarMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both"
      }
    );
    return;
  }

  els.toolbar.style.transition = "none";
  els.toolbar.style.transform = `translateY(${deltaY}px)`;
  els.toolbar.style.willChange = "transform";
  els.toolbar.getBoundingClientRect();

  requestAnimationFrame(() => {
    els.toolbar.style.transition = `transform ${MOTION.toolbarMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    els.toolbar.style.transform = "translateY(0)";
  });

  const cleanup = () => {
    els.toolbar.style.transition = "";
    els.toolbar.style.transform = "";
    els.toolbar.style.willChange = "";
    els.toolbar.removeEventListener("transitionend", cleanup);
  };

  els.toolbar.addEventListener("transitionend", cleanup);
}

function createQuestionRemovalGhost(card) {
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);

  ghost.classList.add("exam-removal-ghost");
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;

  document.body.appendChild(ghost);
  return ghost;
}

function runQuestionRemovalGhost(ghost) {
  if (!ghost) return;

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prefersReducedMotion) {
    ghost.remove();
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ghost.classList.add("is-active");
    });
  });

  window.setTimeout(() => ghost.remove(), MOTION.questionMs + 100);
}

async function animatePreviewResize(renderCallback) {
  const preview = els.examPreview;
  if (!preview) {
    await renderCallback();
    return;
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prefersReducedMotion) {
    await renderCallback();
    return;
  }

  const startHeight = preview.getBoundingClientRect().height;

  preview.classList.add("is-resizing");
  preview.style.transition = "none";
  preview.style.height = `${startHeight}px`;
  preview.style.overflow = "hidden";

  await renderCallback();
  await waitForFrames(2);

  // Important: scrollHeight is not reliable while the element is fixed to
  // a larger height, because it can report the current fixed height instead
  // of the smaller natural content height. Temporarily measure the natural
  // height synchronously, then restore the frozen starting height before the
  // browser paints.
  preview.style.height = "auto";
  const endHeight = preview.getBoundingClientRect().height;
  preview.style.height = `${startHeight}px`;
  preview.getBoundingClientRect();

  if (Math.abs(endHeight - startHeight) < 1) {
    preview.classList.remove("is-resizing");
    preview.style.height = "";
    preview.style.overflow = "";
    preview.style.transition = "";
    return;
  }

  let finished = false;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    preview.classList.remove("is-resizing");
    preview.style.height = "";
    preview.style.overflow = "";
    preview.style.transition = "";
    preview.removeEventListener("transitionend", handleEnd);
  };

  const handleEnd = (event) => {
    if (event.propertyName === "height") cleanup();
  };

  preview.addEventListener("transitionend", handleEnd);

  requestAnimationFrame(() => {
    preview.style.transition = `height ${MOTION.previewMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    preview.style.height = `${endHeight}px`;
  });

  window.setTimeout(cleanup, MOTION.previewMs + 200);
}

function waitForFrames(count = 1) {
  return new Promise((resolve) => {
    const step = () => {
      count -= 1;
      if (count <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function handleQuestionChange(event) {
  const card = event.target.closest("[data-question-card]");
  if (!card) return;

  const question = findQuestion(card.dataset.questionId);
  if (!question) return;

  if (event.target.matches("[data-graph-field]")) {
    refreshGraphDraftFromCard(card, {
      updateVisibility: event.target.dataset.graphField === "graphType"
    });
    return;
  }

  if (event.target.matches('[data-field="type"]')) {
    question.type = event.target.value;
    if (question.type === "true-false") {
      question.options = ["True", "False"];
      question.correctOptionIndex = 0;
      question.correctOptionIndexes = [];
    }
    if (question.type === "multiple-answer" && !Array.isArray(question.correctOptionIndexes)) {
      question.correctOptionIndexes = [];
    }
    renderQuestions();
    renderAllPreviews();
  }

  if (event.target.matches("[data-correct-option-index]")) {
    const optionIndex = Number(event.target.dataset.correctOptionIndex);
    if (question.type === "multiple-answer") {
      const set = new Set(question.correctOptionIndexes || []);
      if (event.target.checked) set.add(optionIndex);
      else set.delete(optionIndex);
      question.correctOptionIndexes = [...set].sort((a, b) => a - b);
    } else {
      question.correctOptionIndex = optionIndex;
      question.correctOptionIndexes = [optionIndex];
    }
    renderAllPreviews();
  }

  if (event.target.matches("[data-image-upload]")) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      question.imageData = String(reader.result || "");
      if (!question.imageAlt) question.imageAlt = file.name.replace(/\.[^.]+$/, "");
      renderImagePreview(card, question);
      renderAllPreviews();
    };
    reader.readAsDataURL(file);
  }
}

function handleQuestionClick(event) {
  const toolButton = event.target.closest("[data-diagram-tool]");
  if (toolButton) {
    const card = toolButton.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;

    const tool = toolButton.dataset.diagramTool;
    setActiveDiagramTool(question.id, tool);
    updateDiagramToolButtons(card, tool);

    const values = getGraphValuesFromCard(card);
    if (tool === "function") {
      configureFunctionTool(card, question, values);
    }

    if (tool === "point") {
      values.graphType = values.graphType === "function" ? "points" : values.graphType;
      const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
      if (graphTypeField) graphTypeField.value = values.graphType;
      graphDrafts.set(question.id, normalizeGraph(values));
      updateGraphFieldVisibility(card, values.graphType);
    }

    updateDiagramToolHint(card, values);
    return;
  }

  const graphCanvas = event.target.closest("[data-editor-graph]");
  if (graphCanvas) {
    handleGraphCanvasClick(event, graphCanvas);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const card = actionButton.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const action = actionButton.dataset.action;

  if (!card || !question) return;

  if (action === "toggle-question") {
    question.collapsed = !question.collapsed;
    card.classList.toggle("is-collapsed", question.collapsed);
    actionButton.textContent = question.collapsed ? "Maximize" : "Minimize";

    if (!question.collapsed) {
      setTimeout(drawAllGraphs, MOTION.foldMs);
    }

    renderAllPreviewsDebounced();
    return;
  }

  if (action === "toggle-basic" || action === "toggle-image" || action === "toggle-graph") {
    const sectionName = action.replace("toggle-", "");
    const propertyName = `${sectionName}Collapsed`;

    question[propertyName] = !question[propertyName];
    updateFoldState(card, sectionName, question[propertyName]);

    if (sectionName === "graph" && !question[propertyName]) {
      setTimeout(drawAllGraphs, MOTION.foldMs);
    }

    renderAllPreviewsDebounced();
    return;
  }

  if (action === "remove-image") {
    question.imageData = "";
    question.imageAlt = "";
    const upload = card.querySelector('[data-image-upload]');
    const uploadText = card.querySelector("[data-upload-button-text]");
    if (upload) upload.value = "";
    if (uploadText) uploadText.textContent = "Upload image";
    renderImagePreview(card, question);
    renderAllPreviews();
    return;
  }

  if (action === "remove-question") {
    const confirmed = confirm("Remove this question?");
    if (!confirmed) return;

    const toolbarBefore = getToolbarRect();
    const ghost = createQuestionRemovalGhost(card);

    state.questions = state.questions.filter((item) => item.id !== question.id);
    graphDrafts.delete(question.id);

    if (state.questions.length === 0) {
      state.questions.push(createQuestion());
    }

    renderQuestions();
    renderAllPreviews({ animatePreview: true });
    animateToolbarFrom(toolbarBefore);
    runQuestionRemovalGhost(ghost);

    return;
  }

  if (action === "add-option") {
    if (question.type === "true-false") return;
    question.options.push("");
    renderQuestions();
    renderAllPreviews();
    return;
  }

  if (action === "remove-option") {
    if (question.type === "true-false") return;
    const index = Number(actionButton.dataset.optionIndex);
    question.options.splice(index, 1);
    if (question.options.length === 0) question.options.push("");
    question.correctOptionIndex = Math.max(0, Math.min(question.correctOptionIndex, question.options.length - 1));
    question.correctOptionIndexes = (question.correctOptionIndexes || [])
      .filter((item) => item !== index)
      .map((item) => item > index ? item - 1 : item);
    renderQuestions();
    renderAllPreviews();
    return;
  }

  if (action === "generate-graph") {
    const values = getGraphValuesFromCard(card);
    const message = card.querySelector("[data-graph-message]");

    try {
      validateGraphValues(values);
      question.graph = normalizeGraph(values);
      graphDrafts.set(question.id, question.graph);
      message.textContent = describeAttachedGraph(question.graph);
      message.classList.remove("error");
      drawAllGraphs();
      renderAllPreviews();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("error");
    }
  }
}

function runQuestionRemoveAnimation(card, afterRemove) {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (prefersReducedMotion) {
    afterRemove();
    return;
  }

  let finished = false;
  const currentHeight = card.scrollHeight;
  card.style.maxHeight = `${currentHeight}px`;
  card.style.overflow = "hidden";
  card.style.pointerEvents = "none";

  // Stage 1: visually remove the card while preserving its layout height.
  card.classList.add("is-removing-visual");

  // Stage 2: after the card has faded, collapse its height so the toolbar slides up.
  window.setTimeout(() => {
    card.classList.add("is-removing-layout");
    card.style.maxHeight = "0px";
    card.style.marginTop = "-18px";
    card.style.paddingTop = "0px";
    card.style.paddingBottom = "0px";
  }, 420);

  const finish = () => {
    if (finished) return;
    finished = true;
    card.removeEventListener("transitionend", handleEnd);
    afterRemove();
  };

  const handleEnd = (event) => {
    if (event.propertyName === "max-height") {
      finish();
    }
  };

  card.addEventListener("transitionend", handleEnd);
  window.setTimeout(finish, MOTION.questionMs + 200);
}

function updateFoldState(card, sectionName, isCollapsed) {
  const section = card.querySelector(`[data-fold-section="${sectionName}"]`);
  if (!section) return;

  const button = section.querySelector(`[data-action="toggle-${sectionName}"]`);
  section.classList.toggle("is-collapsed", Boolean(isCollapsed));

  if (button) {
    button.textContent = isCollapsed ? "Maximize" : "Minimize";
    button.setAttribute("aria-expanded", String(!isCollapsed));
  }
}

function getGraphValuesFromCard(card) {
  const getValue = (name) => {
    const field = card.querySelector(`[data-graph-field="${name}"]`);
    if (!field) return "";
    if (field.type === "checkbox") return field.checked;
    return String(field.value || "").trim();
  };

  const question = findQuestion(card.dataset.questionId);
  const previous = question ? graphDrafts.get(question.id) || question.graph || {} : {};

  const graphType = ["points", "polygon", "function", "diagram"].includes(getValue("graphType"))
    ? getValue("graphType")
    : "points";

  const pointsText = String(getValue("pointsText") || "");
  const previousRegularPolygon = previous.regularPolygon || null;

  const nextGraph = {
    graphType,
    displayMode: getValue("displayMode") === "geometry" ? "geometry" : "coordinate",
    title: getValue("title"),
    expression: getValue("expression"),
    functionStroke: getValue("functionStroke") || previousGraph.functionStroke || "#145c63",
    functionLineWidth: parseNumberOrDefault(getValue("functionLineWidth"), previousGraph.functionLineWidth || 2.5),
    functionDash: getValue("functionDash") || previousGraph.functionDash || "solid",
    functionLabel: getValue("functionLabel") || previousGraph.functionLabel || "",
    pointsText,
    points: parsePoints(pointsText),
    segments: Array.isArray(previous.segments) ? previous.segments.map(normalizeSegment).filter(Boolean) : [],
    angles: Array.isArray(previous.angles) ? previous.angles.map(normalizeAngle).filter(Boolean) : [],
    regularPolygon: previousRegularPolygon ? normalizeRegularPolygon(previousRegularPolygon, previous) : null,
    autoFit: getValue("autoFit") !== false,
    snapToGrid: Boolean(getValue("snapToGrid")),
    xMin: parseNumberOrDefault(getValue("xMin"), -10),
    xMax: parseNumberOrDefault(getValue("xMax"), 10),
    yMin: parseOptionalNumber(getValue("yMin")),
    yMax: parseOptionalNumber(getValue("yMax"))
  };

  if (nextGraph.regularPolygon) {
    nextGraph.regularPolygon = {
      ...nextGraph.regularPolygon,
      sides: Math.max(3, Math.floor(parseNumberOrDefault(getValue("polygonSides"), nextGraph.regularPolygon.sides))),
      radius: Math.max(0.1, parseNumberOrDefault(getValue("polygonRadius"), nextGraph.regularPolygon.radius)),
      rotation: parseNumberOrDefault(getValue("polygonRotation"), nextGraph.regularPolygon.rotation),
      showApothem: Boolean(getValue("showApothem"))
    };
  }

  return normalizeGraph(nextGraph);
}

function validateGraphValues(values) {
  const graph = normalizeGraph(values);
  const mustValidateXDomain = graph.graphType === "function" || !graph.autoFit;

  if (mustValidateXDomain) {
    if (!Number.isFinite(graph.xMin) || !Number.isFinite(graph.xMax) || graph.xMin >= graph.xMax) {
      throw new Error("Use a valid x-domain where x min is smaller than x max.");
    }
  }

  if (!graph.autoFit || graph.graphType === "function") {
    if (graph.yMin !== "" && graph.yMax !== "" && graph.yMin >= graph.yMax) {
      throw new Error("When using y-limits, y min must be smaller than y max.");
    }
  }

  if (graph.graphType === "function" && graph.expression) {
    compileExpression(graph.expression)(0);
  }

  if (!graphHasContent(graph)) {
    throw new Error("Add at least one diagram object, point, function, segment, polygon, or angle.");
  }
}

function updateGraphFieldVisibility(card, graphType) {
  const functionFields = card.querySelector("[data-graph-function-fields]");
  const polygonFields = card.querySelector("[data-graph-polygon-fields]");
  const type = ["points", "polygon", "function", "diagram"].includes(graphType) ? graphType : "points";

  if (functionFields) {
    functionFields.classList.toggle("is-hidden", type !== "function");
  }

  if (polygonFields) {
    polygonFields.classList.toggle("is-hidden", type !== "polygon");
  }
}

function drawGraphDraftOnCard(card, values) {
  const canvas = card.querySelector("[data-editor-graph]");
  if (!canvas) return;

  const graph = normalizeGraph(values);
  drawGraph(canvas, graph);
}

function handleGraphPointerDown(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;

  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const tool = getActiveDiagramTool(question.id);
  const meta = canvas.__graphMeta;
  if (!meta) return;

  const values = getGraphValuesFromCard(card);
  const pointer = getCanvasPointer(event, canvas);
  const clickedPoint = findClickedPoint(values, meta, pointer.x, pointer.y);

  if ((tool === "move-point" || tool === "point") && clickedPoint && clickedPoint.source === "manual") {
    diagramDragState = {
      card,
      canvas,
      questionId: question.id,
      pointIndex: clickedPoint.index,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false
    };
    canvas.setPointerCapture?.(event.pointerId);
  }
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;

  const card = diagramDragState?.card || canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;

  const pointer = getCanvasPointer(event, canvas);
  const inside = isInsidePlot(pointer.x, pointer.y, meta);

  if (!diagramDragState) {
    const values = getGraphValuesFromCard(card);
    const tool = getActiveDiagramTool(question.id);
    if (inside && ["point", "segment", "polygon", "angle"].includes(tool)) {
      let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      if (values.snapToGrid) graphPoint = snapGraphPoint(graphPoint, meta);
      canvas.__interactionPreview = {
        point: graphPoint,
        snap: values.snapToGrid,
        tool,
        visible: true
      };
    } else {
      canvas.__interactionPreview = null;
    }
    drawGraphDraftOnCard(card, values);
    return;
  }

  const dx = event.clientX - diagramDragState.startClientX;
  const dy = event.clientY - diagramDragState.startClientY;

  if (!diagramDragState.moved && Math.hypot(dx, dy) < 3) return;
  diagramDragState.moved = true;

  if (!inside) return;

  const values = getGraphValuesFromCard(card);
  let point = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  const index = diagramDragState.pointIndex;
  if (!values.points[index]) return;

  values.points[index] = {
    ...values.points[index],
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y)
  };
  values.pointsText = pointsToText(values.points);
  updatePointsField(card, values);

  graphDrafts.set(question.id, values);
  canvas.__interactionPreview = { point, snap: values.snapToGrid, tool: "move-point", visible: true };
  drawGraphDraftOnCard(card, values);
}

function handleGraphPointerUp(event) {
  if (!diagramDragState) return;

  if (diagramDragState.moved) {
    suppressNextCanvasClick = true;
    window.setTimeout(() => {
      suppressNextCanvasClick = false;
    }, 0);
  }

  diagramDragState.canvas?.releasePointerCapture?.(event.pointerId);
  diagramDragState = null;
}

function handleGraphPointerLeave(event) {
  const canvas = event.target.closest?.("[data-editor-graph]");
  if (!canvas || diagramDragState) return;
  const card = canvas.closest("[data-question-card]");
  if (!card) return;
  canvas.__interactionPreview = null;
  drawGraphDraftOnCard(card, getGraphValuesFromCard(card));
}

function handleGraphCanvasClick(event, canvas) {
  if (suppressNextCanvasClick) {
    suppressNextCanvasClick = false;
    return;
  }

  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const values = getGraphValuesFromCard(card);
  const meta = canvas.__graphMeta;
  if (!meta) return;

  const pointer = getCanvasPointer(event, canvas);
  if (!isInsidePlot(pointer.x, pointer.y, meta)) return;

  const tool = getActiveDiagramTool(question.id);

  if (tool === "toggle-label") {
    if (cycleClickedAngleOrSegment(values, meta, pointer.x, pointer.y)) {
      graphDrafts.set(question.id, values);
      drawGraphDraftOnCard(card, values);
      updateDiagramToolHint(card, values);
      return;
    }
  }

  if (tool === "segment") {
    handleSegmentToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "angle") {
    handleAngleToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "polygon") {
    handlePolygonToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "function") {
    setGraphType(card, question, values, "function");
    return;
  }

  if (tool === "move-point") return;

  addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
}

function describeAttachedGraph(graph) {
  const normalized = normalizeGraph(graph);
  const pieces = [];
  const name = normalized.title ? ` “${normalized.title}”` : "";

  if (normalized.expression) pieces.push(`function y = ${normalized.expression}`);
  if (normalized.regularPolygon) pieces.push(`${normalized.regularPolygon.sides}-sided regular polygon`);
  if (normalized.points.length) pieces.push(`${normalized.points.length} point${normalized.points.length === 1 ? "" : "s"}`);
  if (normalized.segments.length) pieces.push(`${normalized.segments.length} segment${normalized.segments.length === 1 ? "" : "s"}`);
  if (normalized.angles.length) pieces.push(`${normalized.angles.length} angle${normalized.angles.length === 1 ? "" : "s"}`);

  return `Attached diagram${name}: ${pieces.join("; ") || "empty"}`;
}

function parsePoints(text) {
  const input = String(text || "");
  const pattern = /(?:\b([A-Za-z][A-Za-z0-9_]*)\s*[:=]?\s*)?\(?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[,;]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)?/gi;
  const matches = [...input.matchAll(pattern)];

  return matches
    .map((match, index) => ({
      label: sanitizeGraphLabel(match[1] || `P${index + 1}`),
      x: Number(match[2]),
      y: Number(match[3]),
      labelDx: 8,
      labelDy: -7
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function pointsToText(points) {
  return (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
    .map((point, index) => {
      const label = sanitizeGraphLabel(point.label || `P${index + 1}`);
      return `${label}(${roundGraphCoordinate(point.x)}, ${roundGraphCoordinate(point.y)})`;
    })
    .join(", ");
}

function sanitizeGraphLabel(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 8);
}

function nextPointLabel(points) {
  const existing = new Set((Array.isArray(points) ? points : []).map((point) => sanitizeGraphLabel(point.label)));
  let index = existing.size + 1;
  let label = `P${index}`;
  while (existing.has(label)) {
    index += 1;
    label = `P${index}`;
  }
  return label;
}

function roundGraphCoordinate(value) {
  return Number.parseFloat(Number(value).toFixed(2));
}

function renderAllPreviewsDebounced() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderAllPreviews, 180);
}

async function renderAllPreviews(options = {}) {
  updateMetaFromInputs();
  els.instructionsPreview.textContent = state.instructions || "Type instructions above to preview LaTeX.";

  if (options.animatePreview) {
    await animatePreviewResize(async () => {
      renderExamPreview();
      drawAllGraphs();
      await typesetMath(els.examPreview);
    });
    return;
  }

  renderExamPreview();
  drawAllGraphs();
  await typesetMath();
}

function renderExamPreview() {
  const title = state.title || "Untitled exam";
  const subject = state.subject || "Subject / track";
  const instructions = state.instructions || "No instructions added yet.";
  const questionsHtml = state.questions.map((question, index) => renderQuestionPreview(question, index)).join("");

  els.examPreview.style.setProperty("--exam-title-color", state.titleColor || "#212121");
  els.examPreview.style.setProperty("--exam-stripe-color", state.stripeColor || "#9bf17e");

  els.examPreview.innerHTML = `
    <header class="exam-paper-header">
      <h2 class="exam-document-title">${escapeHTML(title)}</h2>
      <p class="exam-paper-subtitle">${escapeHTML(subject)}${state.durationMinutes ? ` · ${escapeHTML(String(state.durationMinutes))} minutes` : ""}</p>
      <div class="exam-paper-instructions">${escapeHTML(instructions)}</div>
    </header>

    <section class="exam-paper-question-list">
      ${questionsHtml || '<p class="exam-empty-state">No questions yet.</p>'}
    </section>
  `;
}

function renderGraphFigure(graph, canvasAttributes, ariaLabel) {
  const footer = graph.title
    ? `<figcaption class="exam-graph-footer">${escapeHTML(graph.title)}</figcaption>`
    : "";

  return `
    <figure class="exam-graph-figure">
      <canvas class="exam-paper-graph" ${canvasAttributes} aria-label="${escapeAttribute(ariaLabel)}"></canvas>
      ${footer}
    </figure>
  `;
}

function renderQuestionPreview(question, index) {
  const optionsHtml = ["multiple-choice", "multiple-answer", "true-false"].includes(question.type)
    ? `<ol class="exam-paper-options">${question.options.map((option, optionIndex) => `
        <li><span class="exam-option-bubble">${optionLetter(optionIndex)}</span><span>${escapeHTML(option || "________")}</span></li>
      `).join("")}</ol>`
    : renderAnswerSpace(question.type);

  const imageHtml = question.imageData || question.imageBeforeText || question.imageAfterText
    ? renderImageFigure(question)
    : "";

  const graphHtml = question.graph || question.graphBeforeText || question.graphAfterText
    ? `${renderOptionalText(question.graphBeforeText)}${question.graph ? renderGraphFigure(question.graph, `data-preview-graph-id="${question.id}"`, `Graph for question ${index + 1}`) : ""}${renderOptionalText(question.graphAfterText)}`
    : "";

  return `
    <article class="exam-paper-question">
      <div class="exam-paper-question-title">
        <span>Question ${index + 1}</span>
        <span>${escapeHTML(String(question.points || 0))} pt${Number(question.points) === 1 ? "" : "s"}</span>
      </div>
      <div class="exam-paper-prompt">${escapeHTML(question.prompt || "Question text not added yet.")}</div>
      ${imageHtml}
      ${graphHtml}
      ${optionsHtml}
    </article>
  `;
}


function renderOptionalText(text) {
  const value = String(text || "").trim();
  return value ? `<div class="exam-section-message">${escapeHTML(value)}</div>` : "";
}

function renderImageFigure(question) {
  const image = question.imageData
    ? `<figure class="exam-question-image"><img src="${escapeAttribute(question.imageData)}" alt="${escapeAttribute(question.imageAlt || 'Question image')}" />${question.imageAlt ? `<figcaption>${escapeHTML(question.imageAlt)}</figcaption>` : ""}</figure>`
    : "";
  return `${renderOptionalText(question.imageBeforeText)}${image}${renderOptionalText(question.imageAfterText)}`;
}

function renderAnswerSpace(type) {
  if (type === "essay") {
    return '<div class="exam-paper-answer-space essay" aria-label="Essay answer space"></div>';
  }
  return '<div class="exam-paper-answer-space" aria-label="Answer space"></div>';
}

function saveExamToLocalLibrary() {
  updateMetaFromInputs();
  state.updatedAt = new Date().toISOString();
  const exam = normalizeExam(JSON.parse(JSON.stringify(state)));
  const library = readLocalLibrary();
  const existingIndex = library.findIndex((item) => item.id === exam.id);

  if (existingIndex >= 0) {
    library[existingIndex] = exam;
  } else {
    library.unshift(exam);
  }

  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  localStorage.setItem(ACTIVE_EXAM_KEY, JSON.stringify(exam));
  localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(exam));
  return exam;
}

function readLocalLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeExam) : [];
  } catch (_) {
    return [];
  }
}

function drawAllGraphs() {
  document.querySelectorAll("[data-question-card]").forEach((card) => {
    const question = findQuestion(card.dataset.questionId);
    const canvas = card.querySelector("[data-editor-graph]");

    if (!question || !canvas) return;

    const draft = graphDrafts.get(question.id) || question.graph || getGraphValuesFromCard(card);
    if (graphHasContent(draft)) {
      drawGraph(canvas, draft);
    } else {
      drawEmptyGraph(canvas, draft);
    }
  });

  document.querySelectorAll("[data-preview-graph-id]").forEach((canvas) => {
    const question = findQuestion(canvas.dataset.previewGraphId);
    if (question && question.graph) {
      drawGraph(canvas, question.graph);
    }
  });
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

  let xMin = Number(graph.xMin);
  let xMax = Number(graph.xMax);

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
    if (graph.graphType === "function" || !graph.autoFit) {
      drawGraphError(ctx, cssWidth, cssHeight, "Use a valid x-domain.");
      return;
    }
    xMin = -10;
    xMax = 10;
  }

  const polygonPoints = graph.regularPolygon ? getRegularPolygonPoints(graph.regularPolygon) : [];
  let fnPoints = [];

  if (graph.expression) {
    let fn;
    try {
      fn = compileExpression(graph.expression);
    } catch (error) {
      drawGraphError(ctx, cssWidth, cssHeight, error.message);
      return;
    }

    const samples = 700;
    for (let i = 0; i <= samples; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      let y;
      try { y = fn(x); } catch (_) { y = NaN; }
      fnPoints.push({ x, y });
    }
  }

  const objectPoints = [
    ...graph.points,
    ...polygonPoints
  ].filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  let autoBounds = null;
  if (graph.autoFit && graph.graphType !== "function" && objectPoints.length) {
    autoBounds = getPointBounds(objectPoints, 0.16);
    xMin = autoBounds.xMin;
    xMax = autoBounds.xMax;
  }

  const finiteYs = [
    ...fnPoints.map((point) => point.y),
    ...graph.points.map((point) => point.y),
    ...polygonPoints.map((point) => point.y)
  ].filter(Number.isFinite);

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

  const paddingY = graph.yMin === "" && graph.yMax === "" && !autoBounds
    ? (yMax - yMin) * 0.04 || 1
    : 0;
  yMin -= paddingY;
  yMax += paddingY;

  const toPx = (x, y) => ({
    px: padding.left + ((x - xMin) / (xMax - xMin)) * plotWidth,
    py: padding.top + ((yMax - y) / (yMax - yMin)) * plotHeight
  });

  const meta = { width: cssWidth, height: cssHeight, padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx, graph };
  canvas.__graphMeta = meta;

  if (graph.displayMode === "geometry") drawGeometryBackground(ctx, meta);
  else drawGrid(ctx, meta);

  ctx.save();
  ctx.beginPath();
  ctx.rect(padding.left, padding.top, plotWidth, plotHeight);
  ctx.clip();

  if (fnPoints.length) drawCurve(ctx, fnPoints, { toPx, yMin, yMax, plotHeight, graph });

  if (polygonPoints.length) {
    drawPolygon(ctx, polygonPoints, meta, graph.regularPolygon);
    if (graph.regularPolygon?.showApothem) drawApothem(ctx, polygonPoints, meta);
  }

  drawSegments(ctx, graph, meta, polygonPoints);
  drawAngles(ctx, graph, meta, polygonPoints);
  if (graph.points.length) drawPoints(ctx, graph.points, meta);

  ctx.restore();

  drawInteractionPreview(ctx, meta, canvas);
  drawGraphCanvasTitle(ctx, graph, cssWidth);
}

function drawFunctionGraph(canvas, graph) {
  drawGraph(canvas, graph);
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
    ctx.beginPath();
    ctx.moveTo(px, padding.top);
    ctx.lineTo(px, padding.top + plotHeight);
    ctx.stroke();
    ctx.fillText(formatTick(x), px, height - 14);
  }

  ctx.textAlign = "right";
  for (let i = 0; i <= horizontalTicks; i += 1) {
    const y = yMin + ((yMax - yMin) * i) / horizontalTicks;
    const { py } = toPx(xMin, y);
    ctx.beginPath();
    ctx.moveTo(padding.left, py);
    ctx.lineTo(padding.left + plotWidth, py);
    ctx.stroke();
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


function drawGeometryBackground(ctx, meta) {
  const { padding, plotWidth, plotHeight } = meta;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);
  ctx.strokeStyle = "#dfe8e4";
  ctx.lineWidth = 1;
  ctx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);
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
    ctx.beginPath();
    ctx.moveTo(px, padding.top + plotHeight);
    ctx.lineTo(px, padding.top);
    ctx.stroke();
    drawArrowhead(ctx, px, padding.top, "up");
  }

  if (yMin <= 0 && yMax >= 0) {
    const { py } = toPx(xMin, 0);
    ctx.beginPath();
    ctx.moveTo(padding.left, py);
    ctx.lineTo(padding.left + plotWidth, py);
    ctx.stroke();
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
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px, py + 4);
      ctx.stroke();
    }
  }

  if (xMin <= 0 && xMax >= 0) {
    const { px } = toPx(0, yMin);
    for (let i = 0; i <= horizontalTicks; i += 1) {
      const y = yMin + ((yMax - yMin) * i) / horizontalTicks;
      const { py } = toPx(0, y);
      if (py < padding.top || py > padding.top + plotHeight) continue;
      ctx.beginPath();
      ctx.moveTo(px - 4, py);
      ctx.lineTo(px + 4, py);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawArrowhead(ctx, x, y, direction) {
  const size = 8;
  ctx.beginPath();
  if (direction === "right") {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size, y - size * 0.55);
    ctx.lineTo(x - size, y + size * 0.55);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * 0.55, y + size);
    ctx.lineTo(x + size * 0.55, y + size);
  }
  ctx.closePath();
  ctx.fill();
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
    const yText = formatYAxisExpression(graph);
    ctx.fillText(yText, Math.min(padding.left + plotWidth - 8, px + 10), padding.top - 7);
  }

  ctx.restore();
}

function drawCurve(ctx, points, meta) {
  const { toPx, yMin, yMax, plotHeight } = meta;
  let started = false;
  let previous = null;

  ctx.save();
  ctx.strokeStyle = "#145c63";
  ctx.lineWidth = 2.35;
  ctx.beginPath();

  points.forEach((point) => {
    if (!Number.isFinite(point.y) || point.y < yMin - Math.abs(yMax - yMin) || point.y > yMax + Math.abs(yMax - yMin)) {
      started = false;
      previous = null;
      return;
    }

    const current = toPx(point.x, point.y);
    const jumpIsTooLarge = previous && Math.abs(current.py - previous.py) > plotHeight * 0.85;

    if (!started || jumpIsTooLarge) {
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

function drawPoints(ctx, points, meta) {
  const { toPx, xMin, xMax, yMin, yMax } = meta;
  ctx.save();
  ctx.fillStyle = "#145c63";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.font = "700 12px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";

  points.forEach((point, index) => {
    if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) return;
    const { px, py } = toPx(point.x, point.y);
    const label = sanitizeGraphLabel(point.label || `P${index + 1}`);

    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (label) {
      drawTextWithHalo(ctx, label, px + (point.labelDx ?? 8), py + (point.labelDy ?? -7));
    }
  });

  ctx.restore();
}

function getActiveDiagramTool(questionId) {
  return diagramToolByQuestionId.get(questionId) || "point";
}

function setActiveDiagramTool(questionId, tool) {
  diagramToolByQuestionId.set(questionId, tool);
  if (!["segment", "angle"].includes(tool)) {
    diagramSelectionByQuestionId.delete(questionId);
  }
}

function updateDiagramToolButtons(card, activeTool) {
  card.querySelectorAll("[data-diagram-tool]").forEach((button) => {
    const isActive = button.dataset.diagramTool === activeTool;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function updateDiagramToolHint(card, graph) {
  const hint = card.querySelector("[data-diagram-tool-hint]");
  if (!hint) return;
  const questionId = card.dataset.questionId;
  const tool = getActiveDiagramTool(questionId);
  const selection = diagramSelectionByQuestionId.get(questionId) || [];
  const messages = {
    point: "Click the diagram to insert a point. Turn on Stick to preview snapped placement.",
    segment: selection.length ? `Segment tool: selected ${selection.join(" → ")}. Click another point.` : "Segment tool: click two points to create one independent segment.",
    polygon: "Polygon tool: click the diagram to place the center of a regular polygon.",
    angle: selection.length ? `Angle tool: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle tool: click three points to mark an angle.",
    function: "Function tool: type y = expression, then attach the diagram.",
    "move-point": "Move point: drag any manual point directly on the diagram.",
    "toggle-label": "Toggle label: click a segment or angle to cycle labels."
  };
  hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
}

function setGraphType(card, question, values, graphType) {
  values.graphType = graphType;
  const field = card.querySelector('[data-graph-field="graphType"]');
  if (field) field.value = graphType;
  graphDrafts.set(question.id, normalizeGraph(values));
  updateGraphFieldVisibility(card, graphType);
  drawGraphDraftOnCard(card, values);
  updateDiagramToolHint(card, values);
}

function getCanvasPointer(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function isInsidePlot(canvasX, canvasY, meta) {
  return (
    canvasX >= meta.padding.left &&
    canvasX <= meta.padding.left + meta.plotWidth &&
    canvasY >= meta.padding.top &&
    canvasY <= meta.padding.top + meta.plotHeight
  );
}

function graphPointFromCanvasPoint(meta, canvasX, canvasY) {
  return {
    x: meta.xMin + ((canvasX - meta.padding.left) / meta.plotWidth) * (meta.xMax - meta.xMin),
    y: meta.yMax - ((canvasY - meta.padding.top) / meta.plotHeight) * (meta.yMax - meta.yMin)
  };
}

function snapGraphPoint(point, meta) {
  const xStep = getNiceSnapStep(meta.xMax - meta.xMin);
  const yStep = getNiceSnapStep(meta.yMax - meta.yMin);
  let x = Math.round(point.x / xStep) * xStep;
  let y = Math.round(point.y / yStep) * yStep;

  if (Math.abs(point.x) <= xStep * 0.35) x = 0;
  if (Math.abs(point.y) <= yStep * 0.35) y = 0;
  return { x, y };
}

function getNiceSnapStep(range) {
  const rawStep = Math.abs(Number(range) || 10) / 8;
  const exponent = Math.floor(Math.log10(rawStep || 1));
  const base = rawStep / Math.pow(10, exponent);
  const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return niceBase * Math.pow(10, exponent);
}

function updatePointsField(card, values) {
  values.pointsText = pointsToText(values.points);
  const pointsField = card.querySelector('[data-graph-field="pointsText"]');
  if (pointsField) pointsField.value = values.pointsText;
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  const nextPoint = {
    label: nextPointLabel(values.points),
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y),
    labelDx: 8,
    labelDy: -7
  };

  values.points.push(nextPoint);
  updatePointsField(card, values);
  graphDrafts.set(question.id, normalizeGraph(values));
  drawGraphDraftOnCard(card, values);
  updateDiagramToolHint(card, values);

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = `Added point ${nextPoint.label}(${nextPoint.x}, ${nextPoint.y}).`;
    message.classList.remove("error");
  }
}

function findPointByLabelInGraph(graph, label) {
  const cleanLabel = sanitizeGraphLabel(label).toLowerCase();
  const manual = graph.points.find((point) => sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
  if (manual) return manual;
  const polygonPoints = graph.regularPolygon ? getRegularPolygonPoints(graph.regularPolygon) : [];
  return polygonPoints.find((point) => sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel) || null;
}

function findClickedPoint(graph, meta, clickX, clickY) {
  const hitRadius = 11;
  const manualPoints = graph.points || [];

  for (let index = 0; index < manualPoints.length; index += 1) {
    const point = manualPoints[index];
    const { px, py } = meta.toPx(point.x, point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) {
      return { point, index, source: "manual" };
    }
  }

  const polygonPoints = graph.regularPolygon ? getRegularPolygonPoints(graph.regularPolygon) : [];
  for (let index = 0; index < polygonPoints.length; index += 1) {
    const point = polygonPoints[index];
    const { px, py } = meta.toPx(point.x, point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) {
      return { point, index, source: "polygon" };
    }
  }

  return null;
}

function handleSegmentToolClick(card, question, values, meta, canvasX, canvasY) {
  let clickedPoint = findClickedPoint(values, meta, canvasX, canvasY);

  if (!clickedPoint) {
    addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY);
    values = getGraphValuesFromCard(card);
    clickedPoint = { point: values.points[values.points.length - 1], source: "manual" };
  }

  const label = sanitizeGraphLabel(clickedPoint.point.label);
  const selection = diagramSelectionByQuestionId.get(question.id) || [];

  if (!selection.length) {
    diagramSelectionByQuestionId.set(question.id, [label]);
    updateDiagramToolHint(card, values);
    return;
  }

  const from = selection[0];
  const to = label;
  if (from && to && from !== to && !values.segments.some((segment) => segmentMatches(segment, from, to))) {
    values.segments.push({ from, to, labelMode: "name" });
  }

  diagramSelectionByQuestionId.delete(question.id);
  graphDrafts.set(question.id, normalizeGraph(values));
  drawGraphDraftOnCard(card, values);
  updateDiagramToolHint(card, values);
}

function handleAngleToolClick(card, question, values, meta, canvasX, canvasY) {
  const clickedPoint = findClickedPoint(values, meta, canvasX, canvasY);
  if (!clickedPoint) return;

  const label = sanitizeGraphLabel(clickedPoint.point.label);
  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  selection.push(label);
  diagramSelectionByQuestionId.set(question.id, selection);

  if (selection.length >= 3) {
    const [from, vertex, to] = selection;
    if (from !== vertex && vertex !== to && from !== to) {
      values.angles.push({ from, vertex, to, labelMode: "name" });
    }
    diagramSelectionByQuestionId.delete(question.id);
    graphDrafts.set(question.id, normalizeGraph(values));
    drawGraphDraftOnCard(card, values);
  }

  updateDiagramToolHint(card, values);
}

function handlePolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) center = snapGraphPoint(center, meta);

  const sides = parseNumberOrDefault(card.querySelector('[data-graph-field="polygonSides"]')?.value, 3);
  const radius = parseNumberOrDefault(card.querySelector('[data-graph-field="polygonRadius"]')?.value, 4);
  const rotation = parseNumberOrDefault(card.querySelector('[data-graph-field="polygonRotation"]')?.value, 90);
  const showApothem = Boolean(card.querySelector('[data-graph-field="showApothem"]')?.checked);

  values.graphType = "polygon";
  values.regularPolygon = normalizeRegularPolygon({
    sides,
    radius,
    rotation,
    centerX: roundGraphCoordinate(center.x),
    centerY: roundGraphCoordinate(center.y),
    showApothem
  });

  const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
  if (graphTypeField) graphTypeField.value = "polygon";

  graphDrafts.set(question.id, normalizeGraph(values));
  updateGraphFieldVisibility(card, "polygon");
  drawGraphDraftOnCard(card, values);
  updateDiagramToolHint(card, values);
}

function cycleClickedAngleOrSegment(values, meta, canvasX, canvasY) {
  const clickedAngle = findClickedAngle(values, meta, canvasX, canvasY);
  if (clickedAngle) {
    clickedAngle.angle.labelMode = getNextAngleLabelMode(clickedAngle.angle.labelMode);
    return true;
  }

  const clickedSegment = findClickedSegment(values, meta, canvasX, canvasY);
  if (clickedSegment) {
    const nextMode = getNextSegmentLabelMode(clickedSegment.segment.labelMode);

    if (clickedSegment.segment.polygon && values.regularPolygon) {
      values.regularPolygon.segmentLabelModes = {
        ...(values.regularPolygon.segmentLabelModes || {}),
        [clickedSegment.segment.polygonSegmentKey]: nextMode
      };
    } else {
      clickedSegment.segment.labelMode = nextMode;
    }

    return true;
  }

  return false;
}

function getRegularPolygonPoints(polygon) {
  const sides = Math.max(3, Math.floor(Number(polygon?.sides) || 3));
  const radius = Math.max(0.1, Number(polygon?.radius) || 4);
  const rotation = ((Number(polygon?.rotation) || 0) * Math.PI) / 180;
  const centerX = Number(polygon?.centerX) || 0;
  const centerY = Number(polygon?.centerY) || 0;
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (index * 2 * Math.PI) / sides;
    return {
      label: labels[index] || `P${index + 1}`,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      labelDx: 8,
      labelDy: -7
    };
  });
}

function drawPolygon(ctx, points, meta) {
  if (!Array.isArray(points) || points.length < 3) return;

  ctx.save();
  ctx.fillStyle = "rgba(0, 172, 193, 0.06)";
  ctx.strokeStyle = "#145c63";
  ctx.lineWidth = 2.2;

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

  drawPoints(ctx, points, meta);
}

function drawSegments(ctx, graph, meta, polygonPoints = []) {
  const polygonSegments = polygonPoints.length >= 3
    ? polygonPoints.map((point, index) => {
        const next = polygonPoints[(index + 1) % polygonPoints.length];
        const key = makeSegmentKeyLabels(point.label, next.label);
        return {
          from: point.label,
          to: next.label,
          labelMode: graph.regularPolygon?.segmentLabelModes?.[key] || "name",
          polygon: true,
          polygonSegmentKey: key
        };
      })
    : [];

  const segments = [...polygonSegments, ...graph.segments];
  if (!segments.length) return;

  ctx.save();
  ctx.strokeStyle = "#145c63";
  ctx.fillStyle = "#145c63";
  ctx.lineWidth = 2;
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  segments.forEach((segment) => {
    const start = findPointByLabelInGraph(graph, segment.from);
    const end = findPointByLabelInGraph(graph, segment.to);
    if (!start || !end) return;

    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();

    const label = getSegmentLabel(start, end, segment.labelMode);
    if (label) {
      const labelX = (a.px + b.px) / 2;
      const labelY = (a.py + b.py) / 2 - 10;
      if (segment.labelMode === "name") drawTextWithOverbar(ctx, label, labelX, labelY);
      else drawTextWithHalo(ctx, label, labelX, labelY);
    }
  });

  ctx.restore();
}

function drawApothem(ctx, polygonPoints, meta) {
  if (!Array.isArray(polygonPoints) || polygonPoints.length < 3) return;
  const center = getPointsCenter(polygonPoints);
  const a = polygonPoints[0];
  const b = polygonPoints[1];
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const centerPx = meta.toPx(center.x, center.y);
  const midPx = meta.toPx(midpoint.x, midpoint.y);

  ctx.save();
  ctx.strokeStyle = "#5f6f66";
  ctx.fillStyle = "#5f6f66";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(centerPx.px, centerPx.py);
  ctx.lineTo(midPx.px, midPx.py);
  ctx.stroke();
  ctx.setLineDash([]);
  drawTextWithHalo(ctx, "apothem", (centerPx.px + midPx.px) / 2 + 8, (centerPx.py + midPx.py) / 2 - 8);
  ctx.restore();
}

function drawAngles(ctx, graph, meta) {
  if (!graph.angles.length) return;

  ctx.save();
  ctx.strokeStyle = "#145c63";
  ctx.fillStyle = "#145c63";
  ctx.lineWidth = 1.7;
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  graph.angles.forEach((angle) => {
    if (angle.labelMode === "none") return;
    const from = findPointByLabelInGraph(graph, angle.from);
    const vertex = findPointByLabelInGraph(graph, angle.vertex);
    const to = findPointByLabelInGraph(graph, angle.to);
    if (!from || !vertex || !to) return;

    const arc = getAngleArc(from, vertex, to, meta);
    const radius = 22;
    ctx.beginPath();
    ctx.arc(arc.vertexPx.px, arc.vertexPx.py, radius, arc.start, arc.end, arc.counterclockwise);
    ctx.stroke();

    const label = getAngleLabel(from, vertex, to, angle.labelMode);
    if (label && angle.labelMode !== "blank") {
      const labelX = arc.vertexPx.px + Math.cos(arc.middle) * (radius + 16);
      const labelY = arc.vertexPx.py + Math.sin(arc.middle) * (radius + 16);
      drawTextWithHalo(ctx, label, labelX, labelY);
    }
  });

  ctx.restore();
}

function getAngleArc(from, vertex, to, meta) {
  const fromPx = meta.toPx(from.x, from.y);
  const vertexPx = meta.toPx(vertex.x, vertex.y);
  const toPx = meta.toPx(to.x, to.y);
  const startAngle = Math.atan2(fromPx.py - vertexPx.py, fromPx.px - vertexPx.px);
  const endAngle = Math.atan2(toPx.py - vertexPx.py, toPx.px - vertexPx.px);
  const arc = getSmallArc(startAngle, endAngle);
  return { ...arc, vertexPx };
}

function findClickedSegment(graph, meta, clickX, clickY) {
  const candidates = graph.segments.map((segment) => ({ segment }));

  if (graph.regularPolygon) {
    const polygonPoints = getRegularPolygonPoints(graph.regularPolygon);
    polygonPoints.forEach((point, index) => {
      const next = polygonPoints[(index + 1) % polygonPoints.length];
      const key = makeSegmentKeyLabels(point.label, next.label);
      candidates.push({
        segment: {
          from: point.label,
          to: next.label,
          labelMode: graph.regularPolygon.segmentLabelModes?.[key] || "name",
          polygon: true,
          polygonSegmentKey: key
        }
      });
    });
  }

  let best = null;
  candidates.forEach(({ segment }) => {
    const start = findPointByLabelInGraph(graph, segment.from);
    const end = findPointByLabelInGraph(graph, segment.to);
    if (!start || !end) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    const distance = distancePointToSegment(clickX, clickY, a.px, a.py, b.px, b.py);
    if (distance <= 9 && (!best || distance < best.distance)) best = { segment, distance };
  });
  return best;
}

function findClickedAngle(graph, meta, clickX, clickY) {
  let best = null;
  graph.angles.forEach((angle) => {
    const vertex = findPointByLabelInGraph(graph, angle.vertex);
    if (!vertex) return;
    const v = meta.toPx(vertex.x, vertex.y);
    const distance = Math.hypot(clickX - v.px, clickY - v.py);
    if (distance <= 26 && (!best || distance < best.distance)) best = { angle, distance };
  });
  return best;
}

function makeSegmentKeyLabels(from, to) {
  return `${sanitizeGraphLabel(from)}${sanitizeGraphLabel(to)}`;
}

function segmentMatches(segment, from, to) {
  return (segment.from === from && segment.to === to) || (segment.from === to && segment.to === from);
}

function getSegmentLabel(start, end, mode) {
  if (mode === "hidden") return "";
  if (mode === "length") return formatSegmentLength(Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y)));
  if (mode === "variable") return "x";
  return `${sanitizeGraphLabel(start.label)}${sanitizeGraphLabel(end.label)}`;
}

function getNextSegmentLabelMode(currentMode) {
  if (!currentMode || currentMode === "name") return "length";
  if (currentMode === "length") return "variable";
  if (currentMode === "variable") return "hidden";
  return "name";
}

function getAngleLabel(from, vertex, to, mode) {
  if (mode === "none" || mode === "blank") return "";
  if (mode === "value") return `${formatAngleValue(computeAngleDegrees(from, vertex, to))}°`;
  if (mode === "variable") return "x";
  return `∠${sanitizeGraphLabel(from.label)}${sanitizeGraphLabel(vertex.label)}${sanitizeGraphLabel(to.label)}`;
}

function getNextAngleLabelMode(currentMode) {
  if (!currentMode || currentMode === "name") return "value";
  if (currentMode === "value") return "variable";
  if (currentMode === "variable") return "blank";
  if (currentMode === "blank") return "none";
  return "name";
}

function computeAngleDegrees(from, vertex, to) {
  const ux = from.x - vertex.x;
  const uy = from.y - vertex.y;
  const vx = to.x - vertex.x;
  const vy = to.y - vertex.y;
  const dot = ux * vx + uy * vy;
  const magU = Math.hypot(ux, uy);
  const magV = Math.hypot(vx, vy);
  if (magU === 0 || magV === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magU * magV)))) * 180 / Math.PI;
}

function formatAngleValue(value) {
  return Number(value.toFixed(1)).toString();
}

function formatSegmentLength(value) {
  return Number(value.toFixed(2)).toString();
}

function getSmallArc(start, end) {
  let diff = end - start;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return {
    start,
    end: start + diff,
    middle: start + diff / 2,
    counterclockwise: diff < 0
  };
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function getPointBounds(points, marginRatio = 0.12) {
  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const xPad = (xMax - xMin) * marginRatio || 1;
  const yPad = (yMax - yMin) * marginRatio || 1;
  return { xMin: xMin - xPad, xMax: xMax + xPad, yMin: yMin - yPad, yMax: yMax + yPad };
}

function getPointsCenter(points) {
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function drawTextWithHalo(ctx, text, x, y) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#145c63";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTextWithOverbar(ctx, text, x, y) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#145c63";
  ctx.fillText(text, x, y);
  const width = ctx.measureText(text).width;
  const barY = y - 9;
  ctx.strokeStyle = "#145c63";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, barY);
  ctx.lineTo(x + width / 2, barY);
  ctx.stroke();
  ctx.restore();
}

function drawInteractionPreview(ctx, meta, canvas) {
  const preview = canvas.__interactionPreview;
  if (!preview?.visible || !preview.point) return;
  const { px, py } = meta.toPx(preview.point.x, preview.point.y);

  ctx.save();
  ctx.strokeStyle = "rgba(20, 92, 99, 0.55)";
  ctx.fillStyle = "rgba(20, 92, 99, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);

  if (preview.snap) {
    const xAxisY = meta.yMin <= 0 && meta.yMax >= 0 ? meta.toPx(meta.xMin, 0).py : meta.padding.top + meta.plotHeight;
    const yAxisX = meta.xMin <= 0 && meta.xMax >= 0 ? meta.toPx(0, meta.yMin).px : meta.padding.left;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, xAxisY);
    ctx.moveTo(px, py);
    ctx.lineTo(yAxisX, py);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "600 11px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  drawTextWithHalo(ctx, `(${roundGraphCoordinate(preview.point.x)}, ${roundGraphCoordinate(preview.point.y)})`, px + 10, py - 9);
  ctx.restore();
}

function drawGraphCanvasTitle(ctx, graph, width) {
  return;
}

function drawEmptyGraph(canvas, rawGraph = {}) {
  drawGraph(canvas, normalizeGraph({
    ...rawGraph,
    graphType: rawGraph.graphType || "points",
    displayMode: rawGraph.displayMode || "coordinate",
    points: [],
    pointsText: "",
    xMin: rawGraph.xMin ?? -10,
    xMax: rawGraph.xMax ?? 10,
    yMin: rawGraph.yMin === "" ? -10 : rawGraph.yMin ?? -10,
    yMax: rawGraph.yMax === "" ? 10 : rawGraph.yMax ?? 10
  }));
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
  const allowed = new Set([
    "x", "sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "log", "exp",
    "floor", "ceil", "round", "pow", "min", "max", "pi", "e"
  ]);

  const invalid = identifiers.find((identifier) => !allowed.has(identifier));
  if (invalid) {
    throw new Error(`Unsupported term: ${invalid}. Try sin, cos, tan, sqrt, log, abs, pi, or e.`);
  }

  if (!/^[0-9x+\-*/().,\sA-Za-z_*]+$/.test(normalized)) {
    throw new Error("The expression contains unsupported characters.");
  }

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
  output = output.replace(/π/g, "pi");
  output = output.replace(/−/g, "-");
  output = output.replace(/\^/g, "**");
  output = output.replace(/\bln\s*\(/g, "log(");

  const functionNames = "sin|cos|tan|asin|acos|atan|sqrt|abs|log|exp|floor|ceil|round|pow|min|max";
  output = output.replace(new RegExp(`(\\d|\\)|x|pi|e)\\s*(?=(${functionNames})\\s*\\()`, "g"), "$1*");
  output = output.replace(/(\d|\)|x|pi|e)\s*(?=(x|pi|e|\())/g, "$1*");

  return output;
}

function formatYAxisExpression(graph) {
  if (!graph) return "y";

  const expression = String(graph.expression || "").trim();
  if (!expression || graph.graphType !== "function") return "y";

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

  text = text
    .replace(/\^2\b/g, "²")
    .replace(/\^3\b/g, "³")
    .replace(/\^4\b/g, "⁴")
    .replace(/\^5\b/g, "⁵");

  return text;
}

function exportJson() {
  updateMetaFromInputs();
  const exam = normalizeExam(JSON.parse(JSON.stringify(state)));
  const fileName = `${slugify(exam.title || "kelp-exam")}.json`;
  const blob = new Blob([JSON.stringify(exam, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      replaceState(JSON.parse(reader.result));
      syncInputsFromState();
      renderQuestions();
      renderAllPreviews();
    } catch (error) {
      alert("This JSON file could not be imported.");
      console.error(error);
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function typesetMath(root = document.body) {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetClear?.([root]);
    return window.MathJax.typesetPromise([root]).catch((error) => console.error(error));
  }

  return Promise.resolve();
}

function findQuestion(id) {
  return state.questions.find((question) => question.id === id);
}

function optionLetter(index) {
  return String.fromCharCode(65 + index);
}

function firstWords(text, count) {
  const words = String(text).replace(/[$\\{}_^]/g, "").trim().split(/\s+/).filter(Boolean);
  const shortened = words.slice(0, count).join(" ");
  return words.length > count ? `${shortened}...` : shortened || "Untitled question";
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

function formatTick(value) {
  if (Math.abs(value) >= 100 || (Math.abs(value) < 0.01 && value !== 0)) {
    return value.toExponential(1);
  }
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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "kelp-exam";
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function debounce(callback, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), delay);
  };
}

/* ===== Diagram editor object model patch ===== */
function cloneDiagramGraph(graph) {
  return normalizeGraph(JSON.parse(JSON.stringify(normalizeGraph(graph || {}))));
}

function getDiagramHistory(questionId) {
  if (!diagramHistoryByQuestionId.has(questionId)) {
    diagramHistoryByQuestionId.set(questionId, { undo: [], redo: [] });
  }
  return diagramHistoryByQuestionId.get(questionId);
}

function pushDiagramHistory(questionId, graph) {
  const history = getDiagramHistory(questionId);
  history.undo.push(JSON.stringify(normalizeGraph(graph)));
  if (history.undo.length > 60) history.undo.shift();
  history.redo = [];
}

function undoDiagram(card, question) {
  const history = getDiagramHistory(question.id);
  if (!history.undo.length) return;

  const current = graphDrafts.get(question.id) || question.graph || getGraphValuesFromCard(card);
  history.redo.push(JSON.stringify(normalizeGraph(current)));
  const previous = JSON.parse(history.undo.pop());
  graphDrafts.set(question.id, normalizeGraph(previous));
  renderGraphDraft(card, question);
  drawGraphDraftOnCard(card, previous);
  renderAllPreviewsDebounced();
}

function redoDiagram(card, question) {
  const history = getDiagramHistory(question.id);
  if (!history.redo.length) return;

  const current = graphDrafts.get(question.id) || question.graph || getGraphValuesFromCard(card);
  history.undo.push(JSON.stringify(normalizeGraph(current)));
  const next = JSON.parse(history.redo.pop());
  graphDrafts.set(question.id, normalizeGraph(next));
  renderGraphDraft(card, question);
  drawGraphDraftOnCard(card, next);
  renderAllPreviewsDebounced();
}

function normalizePoint(point, fallbackIndex = 0) {
  if (!point || typeof point !== "object") return null;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    label: sanitizeGraphLabel(point.label || `P${fallbackIndex + 1}`),
    x,
    y,
    labelDx: Number.isFinite(Number(point.labelDx)) ? Number(point.labelDx) : 8,
    labelDy: Number.isFinite(Number(point.labelDy)) ? Number(point.labelDy) : -7,
    color: isHexColor(point.color) ? point.color : "#145c63",
    size: Number.isFinite(Number(point.size)) ? Math.max(2, Number(point.size)) : 5,
    visible: point.visible !== false
  };
}

function mergeParsedPointsWithExisting(parsedPoints, existingPoints) {
  const byLabel = new Map((Array.isArray(existingPoints) ? existingPoints : [])
    .map((point, index) => normalizePoint(point, index))
    .filter(Boolean)
    .map((point) => [sanitizeGraphLabel(point.label).toLowerCase(), point]));

  return parsedPoints.map((point, index) => {
    const key = sanitizeGraphLabel(point.label).toLowerCase();
    return normalizePoint({ ...(byLabel.get(key) || {}), ...point }, index);
  }).filter(Boolean);
}

function normalizeShapePoint(point, fallback = { x: 0, y: 0 }) {
  const x = Number(point?.x ?? fallback.x);
  const y = Number(point?.y ?? fallback.y);
  return {
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y
  };
}

function normalizeShape(shape, index = 0) {
  if (!shape || typeof shape !== "object") return null;
  const type = ["regularPolygon", "irregularPolygon", "circle", "ellipse", "trapezoid", "parallelogram"].includes(shape.type)
    ? shape.type
    : "irregularPolygon";

  const base = {
    id: sanitizeObjectId(shape.id || `${type}-${index + 1}`),
    type,
    label: String(shape.label || shape.name || getDefaultShapeLabel(type, index)).trim(),
    visible: shape.visible !== false,
    stroke: isHexColor(shape.stroke) ? shape.stroke : "#145c63",
    fill: isHexColor(shape.fill) ? shape.fill : "#e8f7f9",
    lineWidth: Number.isFinite(Number(shape.lineWidth)) ? Math.max(1, Number(shape.lineWidth)) : 2
  };

  if (type === "regularPolygon") {
    return {
      ...base,
      sides: Math.max(3, Math.floor(parseNumberOrDefault(shape.sides, 3))),
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 4)),
      rotation: parseNumberOrDefault(shape.rotation, 90),
      centerX: parseNumberOrDefault(shape.centerX, 0),
      centerY: parseNumberOrDefault(shape.centerY, 0),
      showApothem: Boolean(shape.showApothem),
      segmentLabelModes: shape.segmentLabelModes && typeof shape.segmentLabelModes === "object" ? { ...shape.segmentLabelModes } : {}
    };
  }

  if (type === "circle") {
    return {
      ...base,
      center: normalizeShapePoint(shape.center, { x: 0, y: 0 }),
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 1))
    };
  }

  if (type === "ellipse") {
    return {
      ...base,
      focus1: normalizeShapePoint(shape.focus1, { x: -1, y: 0 }),
      focus2: normalizeShapePoint(shape.focus2, { x: 1, y: 0 }),
      through: normalizeShapePoint(shape.through, { x: 0, y: 1 })
    };
  }

  const points = Array.isArray(shape.points)
    ? shape.points.map((point) => normalizeShapePoint(point)).filter(Boolean)
    : [];

  return {
    ...base,
    points,
    targetSides: type === "irregularPolygon" ? Math.max(3, Math.floor(parseNumberOrDefault(shape.targetSides, points.length || 3))) : undefined
  };
}

function sanitizeObjectId(value) {
  return String(value || "object")
    .trim()
    .replace(/[^A-Za-z0-9_:-]/g, "")
    .slice(0, 32) || `object-${Date.now()}`;
}

function getDefaultShapeLabel(type, index = 0) {
  const labels = {
    regularPolygon: "Regular polygon",
    irregularPolygon: "Irregular polygon",
    circle: "Circle",
    ellipse: "Ellipse",
    trapezoid: "Trapezoid",
    parallelogram: "Parallelogram"
  };
  return `${labels[type] || "Shape"} ${index + 1}`;
}

function nextShapeId(graph, type) {
  const existing = new Set((graph.shapes || []).map((shape) => shape.id));
  let index = existing.size + 1;
  let id = `${type}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${type}-${index}`;
  }
  return id;
}

function normalizeGraph(graph = {}) {
  const graphType = ["points", "polygon", "function", "diagram"].includes(graph.graphType)
    ? graph.graphType
    : "points";

  const displayMode = graph.displayMode === "geometry" ? "geometry" : "coordinate";
  const pointsText = String(graph.pointsText || pointsToText(Array.isArray(graph.points) ? graph.points : []));
  const points = mergeParsedPointsWithExisting(parsePoints(pointsText), graph.points);

  const segments = Array.isArray(graph.segments)
    ? graph.segments.map(normalizeSegment).filter(Boolean)
    : [];

  const angles = Array.isArray(graph.angles)
    ? graph.angles.map(normalizeAngle).filter(Boolean)
    : [];

  const regularPolygon = graph.regularPolygon && typeof graph.regularPolygon === "object"
    ? normalizeRegularPolygon(graph.regularPolygon, graph)
    : (graphType === "polygon" && graph.polygonCenterX !== undefined ? normalizeRegularPolygon({}, graph) : null);

  const shapes = Array.isArray(graph.shapes)
    ? graph.shapes.map(normalizeShape).filter(Boolean)
    : [];

  return {
    graphType,
    displayMode,
    title: String(graph.title || graph.label || ""),
    expression: String(graph.expression || ""),
    functionVisible: graph.functionVisible !== false,
    functionStroke: isHexColor(graph.functionStroke) ? graph.functionStroke : "#145c63",
    functionLineWidth: Number.isFinite(Number(graph.functionLineWidth)) ? Math.max(1, Number(graph.functionLineWidth)) : 2.5,
    functionDash: ["solid", "dashed", "dotted"].includes(graph.functionDash) ? graph.functionDash : "solid",
    functionLabel: String(graph.functionLabel || ""),
    pointsText,
    points,
    segments,
    angles,
    regularPolygon,
    shapes,
    autoFit: graph.autoFit !== false,
    snapToGrid: Boolean(graph.snapToGrid),
    xMin: parseNumberOrDefault(graph.xMin, -10),
    xMax: parseNumberOrDefault(graph.xMax, 10),
    yMin: parseOptionalNumber(graph.yMin),
    yMax: parseOptionalNumber(graph.yMax)
  };
}

function normalizeSegment(segment) {
  if (!segment || typeof segment !== "object") return null;
  const from = sanitizeGraphLabel(segment.from);
  const to = sanitizeGraphLabel(segment.to);
  if (!from || !to || from === to) return null;
  return {
    from,
    to,
    labelMode: ["name", "length", "variable", "hidden"].includes(segment.labelMode) ? segment.labelMode : "name",
    color: isHexColor(segment.color) ? segment.color : "#145c63",
    lineWidth: Number.isFinite(Number(segment.lineWidth)) ? Math.max(1, Number(segment.lineWidth)) : 2,
    visible: segment.visible !== false
  };
}

function normalizeAngle(angle) {
  if (!angle || typeof angle !== "object") return null;
  const from = sanitizeGraphLabel(angle.from);
  const vertex = sanitizeGraphLabel(angle.vertex);
  const to = sanitizeGraphLabel(angle.to);
  if (!from || !vertex || !to || from === vertex || vertex === to) return null;
  return {
    from,
    vertex,
    to,
    labelMode: ["name", "value", "variable", "blank", "none"].includes(angle.labelMode) ? angle.labelMode : "name",
    color: isHexColor(angle.color) ? angle.color : "#145c63",
    radius: Number.isFinite(Number(angle.radius)) ? Math.max(8, Number(angle.radius)) : 22,
    visible: angle.visible !== false
  };
}

function normalizeRegularPolygon(polygon = {}, graph = {}) {
  return {
    sides: Math.max(3, Math.floor(parseNumberOrDefault(polygon.sides ?? graph.polygonSides, 3))),
    radius: Math.max(0.1, parseNumberOrDefault(polygon.radius ?? graph.polygonRadius, 4)),
    rotation: parseNumberOrDefault(polygon.rotation ?? graph.polygonRotation, 90),
    centerX: parseNumberOrDefault(polygon.centerX ?? graph.polygonCenterX, 0),
    centerY: parseNumberOrDefault(polygon.centerY ?? graph.polygonCenterY, 0),
    showApothem: Boolean(polygon.showApothem ?? graph.showApothem),
    visible: polygon.visible !== false,
    stroke: isHexColor(polygon.stroke) ? polygon.stroke : "#145c63",
    fill: isHexColor(polygon.fill) ? polygon.fill : "#e8f7f9",
    segmentLabelModes: polygon.segmentLabelModes && typeof polygon.segmentLabelModes === "object" ? { ...polygon.segmentLabelModes } : {}
  };
}

function graphHasContent(graph) {
  if (!graph) return false;
  const normalized = normalizeGraph(graph);
  return (
    normalized.expression.trim() !== "" ||
    normalized.points.length > 0 ||
    normalized.segments.length > 0 ||
    normalized.angles.length > 0 ||
    Boolean(normalized.regularPolygon) ||
    normalized.shapes.length > 0
  );
}

function renderGraphDraft(card, question) {
  const draft = normalizeGraph(graphDrafts.get(question.id) || question.graph || {
    graphType: "points",
    displayMode: "coordinate",
    title: "",
    expression: "",
    pointsText: "",
    points: [],
    segments: [],
    angles: [],
    regularPolygon: null,
    shapes: [],
    autoFit: true,
    snapToGrid: false,
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10
  });

  const setValue = (name, value) => {
    const field = card.querySelector(`[data-graph-field="${name}"]`);
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }
    field.value = value ?? "";
  };

  setValue("graphType", draft.graphType || "points");
  setValue("displayMode", draft.displayMode || "coordinate");
  setValue("title", draft.title || "");
  setValue("expression", draft.expression || "");
  setValue("functionStroke", draft.functionStroke || "#145c63");
  setValue("functionLineWidth", draft.functionLineWidth ?? 2.5);
  setValue("functionDash", draft.functionDash || "solid");
  setValue("functionLabel", draft.functionLabel || "");
  setValue("pointsText", draft.pointsText || pointsToText(draft.points || []));
  setValue("xMin", draft.xMin ?? -10);
  setValue("xMax", draft.xMax ?? 10);
  setValue("yMin", draft.yMin ?? -10);
  setValue("yMax", draft.yMax ?? 10);
  setValue("autoFit", draft.autoFit !== false);
  setValue("snapToGrid", draft.snapToGrid || false);
  setValue("polygonSides", draft.regularPolygon?.sides ?? 6);
  setValue("polygonRadius", draft.regularPolygon?.radius ?? 4);
  setValue("polygonRotation", draft.regularPolygon?.rotation ?? 90);
  setValue("showApothem", draft.regularPolygon?.showApothem || false);

  graphDrafts.set(question.id, draft);
  updateGraphFieldVisibility(card, draft.graphType || "points");
  updateDiagramToolButtons(card, getActiveDiagramTool(question.id));
  updateDiagramToolHint(card, draft);
  renderDiagramObjectList(card, draft);

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = question.graph ? describeAttachedGraph(question.graph) : "Choose a tool on the left, then interact with the diagram.";
    message.classList.remove("error");
  }
}

function drawGraphDraftOnCard(card, values) {
  const canvas = card.querySelector("[data-editor-graph]");
  if (!canvas) return;
  const question = findQuestion(card.dataset.questionId);
  const graph = normalizeGraph(values);
  canvas.__selectedObjectId = question ? diagramObjectSelectionByQuestionId.get(question.id) || null : null;
  drawGraph(canvas, graph);
  renderDiagramObjectList(card, graph);
}

function drawAllGraphs() {
  document.querySelectorAll("[data-question-card]").forEach((card) => {
    const question = findQuestion(card.dataset.questionId);
    if (!question) return;
    const draft = graphDrafts.get(question.id) || question.graph || getGraphValuesFromCard(card);
    drawGraphDraftOnCard(card, draft);
  });

  document.querySelectorAll("[data-preview-graph-id]").forEach((canvas) => {
    const question = findQuestion(canvas.dataset.previewGraphId);
    if (question && question.graph) drawGraph(canvas, question.graph);
  });
}

function getGraphValuesFromCard(card) {
  const getValue = (name) => {
    const field = card.querySelector(`[data-graph-field="${name}"]`);
    if (!field) return "";
    if (field.type === "checkbox") return field.checked;
    return String(field.value || "").trim();
  };

  const question = findQuestion(card.dataset.questionId);
  const previous = question ? graphDrafts.get(question.id) || question.graph || {} : {};
  const previousGraph = normalizeGraph(previous);

  const graphType = ["points", "polygon", "function", "diagram"].includes(getValue("graphType")) ? getValue("graphType") : "points";
  const pointsText = String(getValue("pointsText") || "");

  const nextGraph = {
    ...previousGraph,
    graphType,
    displayMode: getValue("displayMode") === "geometry" ? "geometry" : "coordinate",
    title: getValue("title"),
    expression: getValue("expression"),
    functionStroke: getValue("functionStroke") || previousGraph.functionStroke || "#145c63",
    functionLineWidth: parseNumberOrDefault(getValue("functionLineWidth"), previousGraph.functionLineWidth || 2.5),
    functionDash: getValue("functionDash") || previousGraph.functionDash || "solid",
    functionLabel: getValue("functionLabel") || previousGraph.functionLabel || "",
    pointsText,
    points: mergeParsedPointsWithExisting(parsePoints(pointsText), previousGraph.points),
    autoFit: getValue("autoFit") !== false,
    snapToGrid: Boolean(getValue("snapToGrid")),
    xMin: parseNumberOrDefault(getValue("xMin"), -10),
    xMax: parseNumberOrDefault(getValue("xMax"), 10),
    yMin: parseOptionalNumber(getValue("yMin")),
    yMax: parseOptionalNumber(getValue("yMax"))
  };

  if (nextGraph.regularPolygon) {
    nextGraph.regularPolygon = {
      ...nextGraph.regularPolygon,
      sides: Math.max(3, Math.floor(parseNumberOrDefault(getValue("polygonSides"), nextGraph.regularPolygon.sides))),
      radius: Math.max(0.1, parseNumberOrDefault(getValue("polygonRadius"), nextGraph.regularPolygon.radius)),
      rotation: parseNumberOrDefault(getValue("polygonRotation"), nextGraph.regularPolygon.rotation),
      showApothem: Boolean(getValue("showApothem"))
    };
  }

  return normalizeGraph(nextGraph);
}

function updateGraphFieldVisibility(card, graphType) {
  const functionFields = card.querySelector("[data-graph-function-fields]");
  const polygonFields = card.querySelector("[data-graph-polygon-fields]");
  const type = ["points", "polygon", "function", "diagram"].includes(graphType) ? graphType : "points";

  if (functionFields) functionFields.classList.toggle("is-hidden", type !== "function");
  if (polygonFields) polygonFields.classList.toggle("is-hidden", type !== "polygon");
}

function handleQuestionClick(event) {
  const toolSectionToggle = event.target.closest('[data-action="toggle-tool-section"]');
  if (toolSectionToggle) {
    const section = toolSectionToggle.closest(".diagram-tool-section");
    if (section) {
      const willExpand = section.classList.contains("is-collapsed");
      section.classList.toggle("is-collapsed", !willExpand);
      toolSectionToggle.setAttribute("aria-expanded", String(willExpand));
      const icon = toolSectionToggle.querySelector("span[aria-hidden='true']");
      if (icon) icon.textContent = willExpand ? "▾" : "▸";
    }
    return;
  }

  const visibilityToggle = event.target.closest("[data-diagram-object-visible]");
  if (visibilityToggle) {
    const row = visibilityToggle.closest("[data-diagram-object-id]");
    const card = row?.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question || !row) return;
    const values = getGraphValuesFromCard(card);
    pushDiagramHistory(question.id, values);
    setObjectVisibility(values, row.dataset.diagramObjectId, visibilityToggle.checked);
    graphDrafts.set(question.id, normalizeGraph(values));
    drawGraphDraftOnCard(card, values);
    renderAllPreviewsDebounced();
    return;
  }

  const objectRow = event.target.closest("[data-diagram-object-id]");
  if (objectRow) {
    const card = objectRow.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;
    diagramObjectSelectionByQuestionId.set(question.id, objectRow.dataset.diagramObjectId);
    setActiveDiagramTool(question.id, "select");
    updateDiagramToolButtons(card, "select");
    drawGraphDraftOnCard(card, getGraphValuesFromCard(card));
    return;
  }

  const toolButton = event.target.closest("[data-diagram-tool]");
  if (toolButton) {
    const card = toolButton.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;

    const tool = toolButton.dataset.diagramTool;
    setActiveDiagramTool(question.id, tool);
    updateDiagramToolButtons(card, tool);
    diagramObjectSelectionByQuestionId.delete(question.id);

    const values = getGraphValuesFromCard(card);

    if (tool === "polygon") configureRegularPolygonTool(card, question, values);
    if (tool === "irregular-polygon") configureIrregularPolygonTool(question);

    if (tool === "function") {
      configureFunctionTool(card, question, values);
      return;
    }

    if (["point", "segment", "angle", "circle", "ellipse", "trapezoid", "parallelogram", "select", "erase", "move-point"].includes(tool)) {
      values.graphType = values.graphType === "function" && tool !== "function" ? "points" : values.graphType;
      const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
      if (graphTypeField) graphTypeField.value = values.graphType;
      graphDrafts.set(question.id, normalizeGraph(values));
      updateGraphFieldVisibility(card, values.graphType);
    }

    updateDiagramToolHint(card, values);
    return;
  }

  const graphCanvas = event.target.closest("[data-editor-graph]");
  if (graphCanvas) {
    handleGraphCanvasClick(event, graphCanvas);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const card = actionButton.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const action = actionButton.dataset.action;

  if (!card || !question) return;

  if (action === "diagram-undo") { undoDiagram(card, question); return; }
  if (action === "diagram-redo") { redoDiagram(card, question); return; }
  if (action === "open-margin-dialog") { openMarginDialog(card, question); return; }
  if (action === "clear-diagram") {
    if (!confirm("Clear every object from this diagram?")) return;
    const values = getGraphValuesFromCard(card);
    pushDiagramHistory(question.id, values);
    const cleared = normalizeGraph({ ...values, points: [], pointsText: "", segments: [], angles: [], regularPolygon: null, shapes: [], expression: "" });
    graphDrafts.set(question.id, cleared);
    diagramObjectSelectionByQuestionId.delete(question.id);
    diagramSelectionByQuestionId.delete(question.id);
    updatePointsField(card, cleared);
    renderGraphDraft(card, question);
    drawGraphDraftOnCard(card, cleared);
    renderAllPreviewsDebounced();
    return;
  }

  if (action === "toggle-question") {
    question.collapsed = !question.collapsed;
    card.classList.toggle("is-collapsed", question.collapsed);
    actionButton.textContent = question.collapsed ? "Maximize" : "Minimize";
    if (!question.collapsed) setTimeout(drawAllGraphs, MOTION.foldMs);
    renderAllPreviewsDebounced();
    return;
  }

  if (action === "toggle-basic" || action === "toggle-image" || action === "toggle-graph") {
    const sectionName = action.replace("toggle-", "");
    const propertyName = `${sectionName}Collapsed`;
    question[propertyName] = !question[propertyName];
    updateFoldState(card, sectionName, question[propertyName]);
    if (sectionName === "graph" && !question[propertyName]) setTimeout(drawAllGraphs, MOTION.foldMs);
    renderAllPreviewsDebounced();
    return;
  }

  if (action === "remove-image") {
    question.imageData = "";
    question.imageAlt = "";
    const upload = card.querySelector('[data-image-upload]');
    const uploadText = card.querySelector("[data-upload-button-text]");
    if (upload) upload.value = "";
    if (uploadText) uploadText.textContent = "Upload image";
    renderImagePreview(card, question);
    renderAllPreviews();
    return;
  }

  if (action === "remove-question") {
    const confirmed = confirm("Remove this question?");
    if (!confirmed) return;
    const toolbarBefore = getToolbarRect();
    const ghost = createQuestionRemovalGhost(card);
    state.questions = state.questions.filter((item) => item.id !== question.id);
    graphDrafts.delete(question.id);
    if (state.questions.length === 0) state.questions.push(createQuestion());
    renderQuestions();
    renderAllPreviews({ animatePreview: true });
    animateToolbarFrom(toolbarBefore);
    runQuestionRemovalGhost(ghost);
    return;
  }

  if (action === "add-option") {
    if (question.type === "true-false") return;
    question.options.push("");
    renderQuestions();
    renderAllPreviews();
    return;
  }

  if (action === "remove-option") {
    if (question.type === "true-false") return;
    const index = Number(actionButton.dataset.optionIndex);
    question.options.splice(index, 1);
    if (question.options.length === 0) question.options.push("");
    question.correctOptionIndex = Math.max(0, Math.min(question.correctOptionIndex, question.options.length - 1));
    question.correctOptionIndexes = (question.correctOptionIndexes || [])
      .filter((item) => item !== index)
      .map((item) => item > index ? item - 1 : item);
    renderQuestions();
    renderAllPreviews();
    return;
  }

  if (action === "generate-graph") {
    const values = getGraphValuesFromCard(card);
    const message = card.querySelector("[data-graph-message]");
    try {
      validateGraphValues(values);
      question.graph = normalizeGraph(values);
      graphDrafts.set(question.id, question.graph);
      message.textContent = describeAttachedGraph(question.graph);
      message.classList.remove("error");
      drawAllGraphs();
      renderAllPreviews();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("error");
    }
  }
}

function handleQuestionDoubleClick(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;
  const pointer = getCanvasPointer(event, canvas);
  const values = getGraphValuesFromCard(card);
  const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
  if (!hit) return;
  pushDiagramHistory(question.id, values);
  editDiagramObjectProperties(values, hit.id);
  diagramObjectSelectionByQuestionId.set(question.id, hit.id);
  graphDrafts.set(question.id, normalizeGraph(values));
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;
  const card = diagramDragState?.card || canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;

  const pointer = getCanvasPointer(event, canvas);
  const inside = isInsidePlot(pointer.x, pointer.y, meta);

  if (!diagramDragState) {
    const values = getGraphValuesFromCard(card);
    const tool = getActiveDiagramTool(question.id);
    if (inside && ["point", "segment", "polygon", "irregular-polygon", "angle", "circle", "ellipse", "trapezoid", "parallelogram"].includes(tool)) {
      let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      if (values.snapToGrid) graphPoint = snapGraphPoint(graphPoint, meta);
      canvas.__interactionPreview = { point: graphPoint, snap: values.snapToGrid, tool, visible: true };
    } else {
      canvas.__interactionPreview = null;
    }
    drawGraphDraftOnCard(card, values);
    return;
  }

  const dx = event.clientX - diagramDragState.startClientX;
  const dy = event.clientY - diagramDragState.startClientY;
  if (!diagramDragState.moved && Math.hypot(dx, dy) < 3) return;
  diagramDragState.moved = true;
  if (!inside) return;

  const values = getGraphValuesFromCard(card);
  let point = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  const index = diagramDragState.pointIndex;
  if (!values.points[index]) return;

  if (!diagramDragState.historySaved) {
    pushDiagramHistory(question.id, values);
    diagramDragState.historySaved = true;
  }

  values.points[index] = { ...values.points[index], x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) };
  updatePointsField(card, values);
  graphDrafts.set(question.id, values);
  canvas.__interactionPreview = { point, snap: values.snapToGrid, tool: "move-point", visible: true };
  drawGraphDraftOnCard(card, values);
}

function handleGraphCanvasClick(event, canvas) {
  if (suppressNextCanvasClick) {
    suppressNextCanvasClick = false;
    return;
  }

  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const values = getGraphValuesFromCard(card);
  const meta = canvas.__graphMeta;
  if (!meta) return;

  const pointer = getCanvasPointer(event, canvas);
  if (!isInsidePlot(pointer.x, pointer.y, meta)) return;

  const tool = getActiveDiagramTool(question.id);

  if (tool === "select") {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit) {
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      drawGraphDraftOnCard(card, values);
    }
    return;
  }

  if (tool === "erase") {
    eraseObjectAtPosition(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "toggle-label") {
    if (cycleClickedAngleOrSegment(values, meta, pointer.x, pointer.y)) {
      pushDiagramHistory(question.id, getGraphValuesFromCard(card));
      graphDrafts.set(question.id, normalizeGraph(values));
      drawGraphDraftOnCard(card, values);
      updateDiagramToolHint(card, values);
      return;
    }
  }

  if (tool === "segment") { handleSegmentToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "angle") { handleAngleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "polygon") { handlePolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "irregular-polygon") { handleIrregularPolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "circle") { handleCircleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "ellipse") { handleEllipseToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "trapezoid") { handleTemplateShapeClick(card, question, values, meta, pointer.x, pointer.y, "trapezoid"); return; }
  if (tool === "parallelogram") { handleTemplateShapeClick(card, question, values, meta, pointer.x, pointer.y, "parallelogram"); return; }
  if (tool === "function") { setGraphType(card, question, values, "function"); return; }
  if (tool === "move-point") return;

  addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
}

function configureRegularPolygonTool(card, question, values) {
  const currentSides = card.querySelector('[data-graph-field="polygonSides"]')?.value || "6";
  const sides = promptNumber("Number of sides", currentSides, 3, 40);
  if (sides == null) return;
  const currentRadius = card.querySelector('[data-graph-field="polygonRadius"]')?.value || "4";
  const radius = promptNumber("Radius", currentRadius, 0.1, 100);
  if (radius == null) return;
  const currentRotation = card.querySelector('[data-graph-field="polygonRotation"]')?.value || "90";
  const rotation = promptNumber("Rotation in degrees", currentRotation, -360, 360);
  if (rotation == null) return;
  const showApothem = confirm("Show apothem for this regular polygon?");

  const sidesField = card.querySelector('[data-graph-field="polygonSides"]');
  const radiusField = card.querySelector('[data-graph-field="polygonRadius"]');
  const rotationField = card.querySelector('[data-graph-field="polygonRotation"]');
  const apothemField = card.querySelector('[data-graph-field="showApothem"]');
  if (sidesField) sidesField.value = String(Math.round(sides));
  if (radiusField) radiusField.value = String(radius);
  if (rotationField) rotationField.value = String(rotation);
  if (apothemField) apothemField.checked = showApothem;

  values.graphType = "polygon";
  const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
  if (graphTypeField) graphTypeField.value = "polygon";
  graphDrafts.set(question.id, normalizeGraph(values));
  updateGraphFieldVisibility(card, "polygon");
}

function configureIrregularPolygonTool(question) {
  const sides = promptNumber("How many sides will the irregular polygon have?", "3", 3, 40);
  if (sides == null) return;
  diagramConstructionByQuestionId.set(question.id, { tool: "irregular-polygon", targetSides: Math.round(sides), points: [] });
}

function promptNumber(label, initialValue, min, max) {
  const raw = window.prompt(label, String(initialValue));
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function handlePolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) center = snapGraphPoint(center, meta);

  const sides = parseNumberOrDefault(card.querySelector('[data-graph-field="polygonSides"]')?.value, 6);
  const radius = parseNumberOrDefault(card.querySelector('[data-graph-field="polygonRadius"]')?.value, 4);
  const rotation = parseNumberOrDefault(card.querySelector('[data-graph-field="polygonRotation"]')?.value, 90);
  const showApothem = Boolean(card.querySelector('[data-graph-field="showApothem"]')?.checked);

  pushDiagramHistory(question.id, values);
  values.graphType = "polygon";
  values.shapes.push(normalizeShape({
    id: nextShapeId(values, "regularPolygon"),
    type: "regularPolygon",
    sides,
    radius,
    rotation,
    centerX: roundGraphCoordinate(center.x),
    centerY: roundGraphCoordinate(center.y),
    showApothem,
    label: `${Math.round(sides)}-gon`
  }, values.shapes.length));

  const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
  if (graphTypeField) graphTypeField.value = "polygon";
  graphDrafts.set(question.id, normalizeGraph(values));
  updateGraphFieldVisibility(card, "polygon");
  drawGraphDraftOnCard(card, values);
  updateDiagramToolHint(card, values);
}

function handleIrregularPolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  let construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "irregular-polygon") {
    configureIrregularPolygonTool(question);
    construction = diagramConstructionByQuestionId.get(question.id);
    if (!construction) return;
  }

  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  construction.points.push({ x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) });

  if (construction.points.length >= construction.targetSides) {
    pushDiagramHistory(question.id, values);
    values.shapes.push(normalizeShape({
      id: nextShapeId(values, "irregularPolygon"),
      type: "irregularPolygon",
      points: construction.points,
      targetSides: construction.targetSides,
      label: `${construction.targetSides}-side polygon`
    }, values.shapes.length));
    diagramConstructionByQuestionId.delete(question.id);
    graphDrafts.set(question.id, normalizeGraph(values));
    drawGraphDraftOnCard(card, values);
  } else {
    updateDiagramToolHint(card, values);
  }
}

function handleCircleToolClick(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  let construction = diagramConstructionByQuestionId.get(question.id);

  if (!construction || construction.tool !== "circle") {
    diagramConstructionByQuestionId.set(question.id, { tool: "circle", center: point });
    updateDiagramToolHint(card, values);
    return;
  }

  pushDiagramHistory(question.id, values);
  const radius = Math.max(0.1, Math.hypot(point.x - construction.center.x, point.y - construction.center.y));
  values.shapes.push(normalizeShape({
    id: nextShapeId(values, "circle"),
    type: "circle",
    center: construction.center,
    radius,
    label: "Circle"
  }, values.shapes.length));
  diagramConstructionByQuestionId.delete(question.id);
  graphDrafts.set(question.id, normalizeGraph(values));
  drawGraphDraftOnCard(card, values);
}

function handleEllipseToolClick(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  let construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "ellipse") construction = { tool: "ellipse", points: [] };
  construction.points.push(point);
  diagramConstructionByQuestionId.set(question.id, construction);

  if (construction.points.length >= 3) {
    pushDiagramHistory(question.id, values);
    values.shapes.push(normalizeShape({
      id: nextShapeId(values, "ellipse"),
      type: "ellipse",
      focus1: construction.points[0],
      focus2: construction.points[1],
      through: construction.points[2],
      label: "Ellipse"
    }, values.shapes.length));
    diagramConstructionByQuestionId.delete(question.id);
    graphDrafts.set(question.id, normalizeGraph(values));
    drawGraphDraftOnCard(card, values);
  }
  updateDiagramToolHint(card, values);
}

function handleTemplateShapeClick(card, question, values, meta, canvasX, canvasY, type) {
  let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) center = snapGraphPoint(center, meta);
  pushDiagramHistory(question.id, values);
  values.shapes.push(normalizeShape({
    id: nextShapeId(values, type),
    type,
    label: type === "trapezoid" ? "Trapezoid" : "Parallelogram",
    points: type === "trapezoid" ? makeTrapezoidPoints(center) : makeParallelogramPoints(center)
  }, values.shapes.length));
  graphDrafts.set(question.id, normalizeGraph(values));
  drawGraphDraftOnCard(card, values);
}

function makeTrapezoidPoints(center) {
  return [
    { x: center.x - 1.6, y: center.y + 1 },
    { x: center.x + 1.6, y: center.y + 1 },
    { x: center.x + 2.5, y: center.y - 1 },
    { x: center.x - 2.5, y: center.y - 1 }
  ];
}

function makeParallelogramPoints(center) {
  return [
    { x: center.x - 2.2, y: center.y + 1 },
    { x: center.x + 1.8, y: center.y + 1 },
    { x: center.x + 2.2, y: center.y - 1 },
    { x: center.x - 1.8, y: center.y - 1 }
  ];
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  pushDiagramHistory(question.id, values);
  const nextPoint = {
    label: nextPointLabel(values.points),
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y),
    labelDx: 8,
    labelDy: -7,
    color: "#145c63",
    size: 5,
    visible: true
  };

  values.points.push(nextPoint);
  updatePointsField(card, values);
  graphDrafts.set(question.id, normalizeGraph(values));
  drawGraphDraftOnCard(card, values);
  updateDiagramToolHint(card, values);

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = `Added point ${nextPoint.label}(${nextPoint.x}, ${nextPoint.y}).`;
    message.classList.remove("error");
  }
}

function handleSegmentToolClick(card, question, values, meta, canvasX, canvasY) {
  let clickedPoint = findClickedPoint(values, meta, canvasX, canvasY);

  if (!clickedPoint) {
    addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY);
    values = getGraphValuesFromCard(card);
    clickedPoint = { point: values.points[values.points.length - 1], source: "manual" };
  }

  const label = sanitizeGraphLabel(clickedPoint.point.label);
  const selection = diagramSelectionByQuestionId.get(question.id) || [];

  if (!selection.length) {
    diagramSelectionByQuestionId.set(question.id, [label]);
    updateDiagramToolHint(card, values);
    return;
  }

  const from = selection[0];
  const to = label;
  if (from && to && from !== to && !values.segments.some((segment) => segmentMatches(segment, from, to))) {
    pushDiagramHistory(question.id, values);
    values.segments.push({ from, to, labelMode: "name", visible: true, color: "#145c63" });
  }

  diagramSelectionByQuestionId.delete(question.id);
  graphDrafts.set(question.id, normalizeGraph(values));
  drawGraphDraftOnCard(card, values);
  updateDiagramToolHint(card, values);
}

function handleAngleToolClick(card, question, values, meta, canvasX, canvasY) {
  const clickedPoint = findClickedPoint(values, meta, canvasX, canvasY);
  if (!clickedPoint) return;
  const label = sanitizeGraphLabel(clickedPoint.point.label);
  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  selection.push(label);
  diagramSelectionByQuestionId.set(question.id, selection);

  if (selection.length >= 3) {
    const [from, vertex, to] = selection;
    if (from !== vertex && vertex !== to && from !== to) {
      pushDiagramHistory(question.id, values);
      values.angles.push({ from, vertex, to, labelMode: "name", visible: true, color: "#145c63" });
    }
    diagramSelectionByQuestionId.delete(question.id);
    graphDrafts.set(question.id, normalizeGraph(values));
    drawGraphDraftOnCard(card, values);
  }

  updateDiagramToolHint(card, values);
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

  let xMin = Number(graph.xMin);
  let xMax = Number(graph.xMax);
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
    if (graph.graphType === "function" || !graph.autoFit) {
      drawGraphError(ctx, cssWidth, cssHeight, "Use a valid x-domain.");
      return;
    }
    xMin = -10;
    xMax = 10;
  }

  const legacyPolygonPoints = graph.regularPolygon?.visible !== false ? getRegularPolygonPoints(graph.regularPolygon) : [];
  const shapePoints = getAllShapePoints(graph.shapes);
  let fnPoints = [];

  if (graph.expression && graph.functionVisible !== false) {
    let fn;
    try { fn = compileExpression(graph.expression); }
    catch (error) { drawGraphError(ctx, cssWidth, cssHeight, error.message); return; }
    const samples = 700;
    for (let i = 0; i <= samples; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      let y;
      try { y = fn(x); } catch (_) { y = NaN; }
      fnPoints.push({ x, y });
    }
  }

  const objectPoints = [...graph.points.filter((p) => p.visible !== false), ...legacyPolygonPoints, ...shapePoints]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  let autoBounds = null;
  if (graph.autoFit && graph.graphType !== "function" && objectPoints.length) {
    autoBounds = getPointBounds(objectPoints, 0.16);
    xMin = autoBounds.xMin;
    xMax = autoBounds.xMax;
  }

  const finiteYs = [...fnPoints.map((point) => point.y), ...objectPoints.map((point) => point.y)].filter(Number.isFinite);
  let yMin = graph.yMin === "" ? Math.min(...finiteYs, -10) : Number(graph.yMin);
  let yMax = graph.yMax === "" ? Math.max(...finiteYs, 10) : Number(graph.yMax);
  if (autoBounds) { yMin = autoBounds.yMin; yMax = autoBounds.yMax; }
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
  canvas.__graphMeta = meta;

  if (graph.displayMode === "geometry") drawGeometryBackground(ctx, meta);
  else drawGrid(ctx, meta);

  ctx.save();
  ctx.beginPath();
  ctx.rect(padding.left, padding.top, plotWidth, plotHeight);
  ctx.clip();

  if (fnPoints.length) drawCurve(ctx, fnPoints, { toPx, yMin, yMax, plotHeight, graph });
  if (legacyPolygonPoints.length) {
    drawPolygon(ctx, legacyPolygonPoints, meta, graph.regularPolygon);
    if (graph.regularPolygon?.showApothem) drawApothem(ctx, legacyPolygonPoints, meta);
  }

  drawShapes(ctx, graph, meta);
  drawSegments(ctx, graph, meta, legacyPolygonPoints);
  drawAngles(ctx, graph, meta);
  if (graph.points.length) drawPoints(ctx, graph.points, meta);
  drawSelectionHighlight(ctx, graph, meta, canvas.__selectedObjectId, legacyPolygonPoints);

  ctx.restore();

  drawInteractionPreview(ctx, meta, canvas);
  drawGraphCanvasTitle(ctx, graph, cssWidth);
}

function drawPoints(ctx, points, meta) {
  const { toPx, xMin, xMax, yMin, yMax } = meta;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "700 12px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";

  points.forEach((point, index) => {
    if (point.visible === false) return;
    if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) return;
    const { px, py } = toPx(point.x, point.y);
    const label = sanitizeGraphLabel(point.label || `P${index + 1}`);
    ctx.fillStyle = point.color || "#145c63";
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px, py, point.size || 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (label) drawTextWithHalo(ctx, label, px + (point.labelDx ?? 8), py + (point.labelDy ?? -7));
  });

  ctx.restore();
}

function getAllShapePoints(shapes = []) {
  const points = [];
  shapes.filter((shape) => shape.visible !== false).forEach((shape) => {
    if (shape.type === "regularPolygon") points.push(...getRegularPolygonPoints(shape));
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) points.push(...(shape.points || []));
    if (shape.type === "circle") {
      points.push(shape.center, { x: shape.center.x + shape.radius, y: shape.center.y }, { x: shape.center.x - shape.radius, y: shape.center.y }, { x: shape.center.x, y: shape.center.y + shape.radius }, { x: shape.center.x, y: shape.center.y - shape.radius });
    }
    if (shape.type === "ellipse") {
      const params = getEllipseParams(shape);
      if (params) {
        points.push({ x: params.cx + params.a, y: params.cy }, { x: params.cx - params.a, y: params.cy }, { x: params.cx, y: params.cy + params.b }, { x: params.cx, y: params.cy - params.b });
      }
    }
  });
  return points.filter(Boolean);
}

function drawShapes(ctx, graph, meta) {
  graph.shapes.filter((shape) => shape.visible !== false).forEach((shape) => {
    if (shape.type === "regularPolygon") {
      const points = getRegularPolygonPoints(shape);
      drawPolygon(ctx, points, meta, shape);
      if (shape.showApothem) drawApothem(ctx, points, meta);
      return;
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      drawClosedPointShape(ctx, shape, meta);
      return;
    }
    if (shape.type === "circle") {
      drawCircleShape(ctx, shape, meta);
      return;
    }
    if (shape.type === "ellipse") {
      drawEllipseShape(ctx, shape, meta);
    }
  });
}

function drawClosedPointShape(ctx, shape, meta) {
  const points = shape.points || [];
  if (points.length < 2) return;
  ctx.save();
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.42);
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.lineWidth = shape.lineWidth || 2;
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
}

function drawCircleShape(ctx, shape, meta) {
  const center = meta.toPx(shape.center.x, shape.center.y);
  const edge = meta.toPx(shape.center.x + shape.radius, shape.center.y);
  const r = Math.abs(edge.px - center.px);
  ctx.save();
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.25);
  ctx.lineWidth = shape.lineWidth || 2;
  ctx.beginPath();
  ctx.arc(center.px, center.py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (shape.label) drawTextWithHalo(ctx, shape.label, center.px + r + 8, center.py);
  ctx.restore();
}

function drawEllipseShape(ctx, shape, meta) {
  const params = getEllipseParams(shape);
  if (!params) return;
  const center = meta.toPx(params.cx, params.cy);
  const edgeA = meta.toPx(params.cx + params.a, params.cy);
  const edgeB = meta.toPx(params.cx, params.cy + params.b);
  const rx = Math.abs(edgeA.px - center.px);
  const ry = Math.abs(edgeB.py - center.py);
  ctx.save();
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.25);
  ctx.lineWidth = shape.lineWidth || 2;
  ctx.translate(center.px, center.py);
  ctx.rotate(params.rotation);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function getEllipseParams(shape) {
  const f1 = shape.focus1;
  const f2 = shape.focus2;
  const through = shape.through;
  if (!f1 || !f2 || !through) return null;
  const cx = (f1.x + f2.x) / 2;
  const cy = (f1.y + f2.y) / 2;
  const c = Math.hypot(f2.x - f1.x, f2.y - f1.y) / 2;
  const a = (Math.hypot(through.x - f1.x, through.y - f1.y) + Math.hypot(through.x - f2.x, through.y - f2.y)) / 2;
  if (a <= c) return null;
  const b = Math.sqrt(a * a - c * c);
  const rotation = Math.atan2(f2.y - f1.y, f2.x - f1.x);
  return { cx, cy, a, b, rotation };
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "#145c63").replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawPolygon(ctx, points, meta, polygon = {}) {
  if (!Array.isArray(points) || points.length < 3) return;
  ctx.save();
  ctx.fillStyle = hexToRgba(polygon.fill || "#e8f7f9", 0.42);
  ctx.strokeStyle = polygon.stroke || "#145c63";
  ctx.lineWidth = polygon.lineWidth || 2.2;
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
  drawPoints(ctx, points, meta);
}

function drawSegments(ctx, graph, meta, polygonPoints = []) {
  const polygonSegments = polygonPoints.length >= 3
    ? polygonPoints.map((point, index) => {
        const next = polygonPoints[(index + 1) % polygonPoints.length];
        const key = makeSegmentKeyLabels(point.label, next.label);
        return { from: point.label, to: next.label, labelMode: graph.regularPolygon?.segmentLabelModes?.[key] || "name", polygon: true, polygonSegmentKey: key, visible: graph.regularPolygon?.visible !== false };
      })
    : [];

  const segments = [...polygonSegments, ...graph.segments].filter((segment) => segment.visible !== false);
  if (!segments.length) return;

  ctx.save();
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  segments.forEach((segment) => {
    const start = findPointByLabelInGraph(graph, segment.from);
    const end = findPointByLabelInGraph(graph, segment.to);
    if (!start || !end) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    ctx.strokeStyle = segment.color || "#145c63";
    ctx.fillStyle = segment.color || "#145c63";
    ctx.lineWidth = segment.lineWidth || 2;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    const label = getSegmentLabel(start, end, segment.labelMode);
    if (label) {
      const labelX = (a.px + b.px) / 2;
      const labelY = (a.py + b.py) / 2 - 10;
      if (segment.labelMode === "name") drawTextWithOverbar(ctx, label, labelX, labelY);
      else drawTextWithHalo(ctx, label, labelX, labelY);
    }
  });
  ctx.restore();
}

function drawAngles(ctx, graph, meta) {
  const angles = graph.angles.filter((angle) => angle.visible !== false);
  if (!angles.length) return;
  ctx.save();
  ctx.lineWidth = 1.7;
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  angles.forEach((angle) => {
    if (angle.labelMode === "none") return;
    const from = findPointByLabelInGraph(graph, angle.from);
    const vertex = findPointByLabelInGraph(graph, angle.vertex);
    const to = findPointByLabelInGraph(graph, angle.to);
    if (!from || !vertex || !to) return;
    const arc = getAngleArc(from, vertex, to, meta);
    const radius = angle.radius || 22;
    ctx.strokeStyle = angle.color || "#145c63";
    ctx.fillStyle = angle.color || "#145c63";
    ctx.beginPath();
    ctx.arc(arc.vertexPx.px, arc.vertexPx.py, radius, arc.start, arc.end, arc.counterclockwise);
    ctx.stroke();
    const label = getAngleLabel(from, vertex, to, angle.labelMode);
    if (label && angle.labelMode !== "blank") {
      const labelX = arc.vertexPx.px + Math.cos(arc.middle) * (radius + 16);
      const labelY = arc.vertexPx.py + Math.sin(arc.middle) * (radius + 16);
      drawTextWithHalo(ctx, label, labelX, labelY);
    }
  });
  ctx.restore();
}

function findPointByLabelInGraph(graph, label) {
  const cleanLabel = sanitizeGraphLabel(label).toLowerCase();
  const manual = graph.points.find((point) => point.visible !== false && sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
  if (manual) return manual;
  const polygonPoints = graph.regularPolygon?.visible !== false ? getRegularPolygonPoints(graph.regularPolygon) : [];
  const legacy = polygonPoints.find((point) => sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
  if (legacy) return legacy;
  for (const shape of graph.shapes.filter((item) => item.visible !== false)) {
    if (shape.type === "regularPolygon") {
      const found = getRegularPolygonPoints(shape).find((point) => sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
      if (found) return found;
    }
  }
  return null;
}

function findClickedPoint(graph, meta, clickX, clickY) {
  const hitRadius = 11;
  for (let index = 0; index < graph.points.length; index += 1) {
    const point = graph.points[index];
    if (point.visible === false) continue;
    const { px, py } = meta.toPx(point.x, point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) return { point, index, source: "manual", id: `point:${point.label}` };
  }
  const polygonPoints = graph.regularPolygon?.visible !== false ? getRegularPolygonPoints(graph.regularPolygon) : [];
  for (let index = 0; index < polygonPoints.length; index += 1) {
    const point = polygonPoints[index];
    const { px, py } = meta.toPx(point.x, point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) return { point, index, source: "polygon", id: `legacyPolygonPoint:${point.label}` };
  }
  return null;
}

function findClickedDiagramObject(graph, meta, clickX, clickY) {
  const pointHit = findClickedPoint(graph, meta, clickX, clickY);
  if (pointHit?.source === "manual") return { id: `point:${pointHit.point.label}`, kind: "point", ref: pointHit.point };
  const angleHit = findClickedAngle(graph, meta, clickX, clickY);
  if (angleHit) return { id: getAngleObjectId(angleHit.angle), kind: "angle", ref: angleHit.angle };
  const segmentHit = findClickedSegment(graph, meta, clickX, clickY);
  if (segmentHit && !segmentHit.segment.polygon) return { id: getSegmentObjectId(segmentHit.segment), kind: "segment", ref: segmentHit.segment };
  const shapeHit = findClickedShape(graph, meta, clickX, clickY);
  if (shapeHit) return shapeHit;
  return null;
}

function findClickedShape(graph, meta, clickX, clickY) {
  for (const shape of graph.shapes.filter((item) => item.visible !== false).slice().reverse()) {
    if (["regularPolygon", "irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      const points = shape.type === "regularPolygon" ? getRegularPolygonPoints(shape) : shape.points;
      if (pointInPolygonPx(points.map((p) => meta.toPx(p.x, p.y)), clickX, clickY)) return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
    }
    if (shape.type === "circle") {
      const center = meta.toPx(shape.center.x, shape.center.y);
      const edge = meta.toPx(shape.center.x + shape.radius, shape.center.y);
      const r = Math.abs(edge.px - center.px);
      if (Math.abs(Math.hypot(clickX - center.px, clickY - center.py) - r) <= 10) return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
    }
    if (shape.type === "ellipse") {
      const params = getEllipseParams(shape);
      if (!params) continue;
      const c = meta.toPx(params.cx, params.cy);
      if (Math.hypot(clickX - c.px, clickY - c.py) <= 40) return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
    }
  }
  return null;
}

function pointInPolygonPx(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].px, yi = points[i].py;
    const xj = points[j].px, yj = points[j].py;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function eraseObjectAtPosition(card, question, values, meta, canvasX, canvasY) {
  const hit = findClickedDiagramObject(values, meta, canvasX, canvasY);
  if (!hit) return;
  pushDiagramHistory(question.id, values);
  removeDiagramObject(values, hit.id);
  diagramObjectSelectionByQuestionId.delete(question.id);
  graphDrafts.set(question.id, normalizeGraph(values));
  updatePointsField(card, values);
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
}

function removeDiagramObject(graph, objectId) {
  const [kind, ...rest] = String(objectId).split(":");
  if (kind === "point") {
    const label = rest[0];
    graph.points = graph.points.filter((point) => point.label !== label);
    graph.segments = graph.segments.filter((segment) => segment.from !== label && segment.to !== label);
    graph.angles = graph.angles.filter((angle) => angle.from !== label && angle.vertex !== label && angle.to !== label);
  }
  if (kind === "segment") graph.segments = graph.segments.filter((segment) => getSegmentObjectId(segment) !== objectId);
  if (kind === "angle") graph.angles = graph.angles.filter((angle) => getAngleObjectId(angle) !== objectId);
  if (kind === "shape") graph.shapes = graph.shapes.filter((shape) => shape.id !== rest.join(":"));
  if (kind === "legacyPolygon") graph.regularPolygon = null;
}

function setObjectVisibility(graph, objectId, visible) {
  const [kind, ...rest] = String(objectId).split(":");
  if (kind === "point") {
    const point = graph.points.find((item) => item.label === rest[0]);
    if (point) point.visible = visible;
  }
  if (kind === "segment") {
    const segment = graph.segments.find((item) => getSegmentObjectId(item) === objectId);
    if (segment) segment.visible = visible;
  }
  if (kind === "angle") {
    const angle = graph.angles.find((item) => getAngleObjectId(item) === objectId);
    if (angle) angle.visible = visible;
  }
  if (kind === "shape") {
    const shape = graph.shapes.find((item) => item.id === rest.join(":"));
    if (shape) shape.visible = visible;
  }
  if (kind === "legacyPolygon" && graph.regularPolygon) graph.regularPolygon.visible = visible;
}

function editDiagramObjectProperties(graph, objectId) {
  const hit = getDiagramObjectById(graph, objectId);
  if (!hit) return;
  const obj = hit.ref;
  if (hit.kind === "point") {
    const nextLabel = window.prompt("Point label", obj.label);
    if (nextLabel !== null) renamePoint(graph, obj.label, sanitizeGraphLabel(nextLabel) || obj.label);
    const nextColor = window.prompt("Point color", obj.color || "#145c63");
    if (nextColor !== null && isHexColor(nextColor)) obj.color = nextColor;
    const nextSize = promptNumber("Point size", obj.size || 5, 2, 20);
    if (nextSize !== null) obj.size = nextSize;
  }
  if (hit.kind === "segment") {
    const nextColor = window.prompt("Segment color", obj.color || "#145c63");
    if (nextColor !== null && isHexColor(nextColor)) obj.color = nextColor;
    const nextWidth = promptNumber("Segment width", obj.lineWidth || 2, 1, 10);
    if (nextWidth !== null) obj.lineWidth = nextWidth;
  }
  if (hit.kind === "angle") {
    const nextColor = window.prompt("Angle color", obj.color || "#145c63");
    if (nextColor !== null && isHexColor(nextColor)) obj.color = nextColor;
    const nextRadius = promptNumber("Angle arc radius", obj.radius || 22, 8, 80);
    if (nextRadius !== null) obj.radius = nextRadius;
  }
  if (hit.kind === "shape") {
    const nextLabel = window.prompt("Object label", obj.label || "");
    if (nextLabel !== null) obj.label = nextLabel.trim();
    const nextStroke = window.prompt("Stroke color", obj.stroke || "#145c63");
    if (nextStroke !== null && isHexColor(nextStroke)) obj.stroke = nextStroke;
    const nextFill = window.prompt("Fill color", obj.fill || "#e8f7f9");
    if (nextFill !== null && isHexColor(nextFill)) obj.fill = nextFill;
    if (obj.type === "circle") {
      const nextRadius = promptNumber("Circle radius", obj.radius || 1, 0.1, 100);
      if (nextRadius !== null) obj.radius = nextRadius;
    }
    if (obj.type === "regularPolygon") {
      const nextRadius = promptNumber("Polygon radius", obj.radius || 4, 0.1, 100);
      if (nextRadius !== null) obj.radius = nextRadius;
    }
  }
}

function getDiagramObjectById(graph, objectId) {
  const [kind, ...rest] = String(objectId).split(":");
  if (kind === "point") {
    const ref = graph.points.find((point) => point.label === rest[0]);
    return ref ? { kind, ref } : null;
  }
  if (kind === "segment") {
    const ref = graph.segments.find((segment) => getSegmentObjectId(segment) === objectId);
    return ref ? { kind, ref } : null;
  }
  if (kind === "angle") {
    const ref = graph.angles.find((angle) => getAngleObjectId(angle) === objectId);
    return ref ? { kind, ref } : null;
  }
  if (kind === "shape") {
    const ref = graph.shapes.find((shape) => shape.id === rest.join(":"));
    return ref ? { kind, ref } : null;
  }
  return null;
}

function renamePoint(graph, oldLabel, newLabel) {
  if (!newLabel || oldLabel === newLabel) return;
  if (graph.points.some((point) => point.label === newLabel)) return;
  const point = graph.points.find((item) => item.label === oldLabel);
  if (point) point.label = newLabel;
  graph.segments.forEach((segment) => {
    if (segment.from === oldLabel) segment.from = newLabel;
    if (segment.to === oldLabel) segment.to = newLabel;
  });
  graph.angles.forEach((angle) => {
    if (angle.from === oldLabel) angle.from = newLabel;
    if (angle.vertex === oldLabel) angle.vertex = newLabel;
    if (angle.to === oldLabel) angle.to = newLabel;
  });
}

function renderDiagramObjectList(card, graph) {
  const list = card.querySelector("[data-diagram-object-list]");
  const questionId = card.dataset.questionId;
  if (!list) return;
  const objects = getDiagramObjects(graph);
  const selectedId = diagramObjectSelectionByQuestionId.get(questionId);
  if (!objects.length) {
    list.innerHTML = '<p class="diagram-empty-note">No objects yet.</p>';
    return;
  }
  list.innerHTML = objects.map((object) => `
    <div class="diagram-object-row ${object.id === selectedId ? "is-selected" : ""}" data-diagram-object-id="${escapeAttribute(object.id)}" title="Double-click on the canvas to edit properties">
      <input type="checkbox" data-diagram-object-visible ${object.visible ? "checked" : ""} aria-label="Show or hide ${escapeAttribute(object.name)}" />
      <span class="diagram-object-name">${escapeHTML(object.name)}</span>
      <span class="diagram-object-type">${escapeHTML(object.typeLabel)}</span>
    </div>
  `).join("");
}

function getDiagramObjects(graph) {
  const objects = [];
  graph.points.forEach((point) => objects.push({ id: `point:${point.label}`, name: `Point ${point.label}`, typeLabel: "point", visible: point.visible !== false }));
  graph.segments.forEach((segment) => objects.push({ id: getSegmentObjectId(segment), name: `Segment ${segment.from}${segment.to}`, typeLabel: "segment", visible: segment.visible !== false }));
  graph.angles.forEach((angle) => objects.push({ id: getAngleObjectId(angle), name: `Angle ${angle.from}${angle.vertex}${angle.to}`, typeLabel: "angle", visible: angle.visible !== false }));
  if (graph.regularPolygon) objects.push({ id: "legacyPolygon:regular", name: `${graph.regularPolygon.sides}-sided regular polygon`, typeLabel: "polygon", visible: graph.regularPolygon.visible !== false });
  graph.shapes.forEach((shape) => objects.push({ id: `shape:${shape.id}`, name: shape.label || getDefaultShapeLabel(shape.type), typeLabel: shape.type.replace(/([A-Z])/g, " $1").toLowerCase(), visible: shape.visible !== false }));
  if (graph.expression) objects.push({ id: "function:main", name: `Function y = ${graph.expression}`, typeLabel: "function", visible: graph.functionVisible !== false });
  return objects;
}

function getSegmentObjectId(segment) {
  return `segment:${segment.from}:${segment.to}`;
}

function getAngleObjectId(angle) {
  return `angle:${angle.from}:${angle.vertex}:${angle.to}`;
}

function drawSelectionHighlight(ctx, graph, meta, objectId, polygonPoints = []) {
  if (!objectId) return;
  ctx.save();
  ctx.strokeStyle = "#f4a261";
  ctx.fillStyle = "rgba(244, 162, 97, 0.12)";
  ctx.lineWidth = 2.4;
  ctx.setLineDash([6, 5]);
  const hit = getDiagramObjectById(graph, objectId);
  if (hit?.kind === "point") {
    const p = meta.toPx(hit.ref.x, hit.ref.y);
    ctx.beginPath();
    ctx.arc(p.px, p.py, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (hit?.kind === "segment") {
    const a0 = findPointByLabelInGraph(graph, hit.ref.from);
    const b0 = findPointByLabelInGraph(graph, hit.ref.to);
    if (a0 && b0) {
      const a = meta.toPx(a0.x, a0.y);
      const b = meta.toPx(b0.x, b0.y);
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.stroke();
    }
  }
  if (hit?.kind === "shape") drawShapeHighlight(ctx, hit.ref, meta);
  ctx.restore();
}

function drawShapeHighlight(ctx, shape, meta) {
  const points = shape.type === "regularPolygon" ? getRegularPolygonPoints(shape)
    : ["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type) ? shape.points
    : getShapeBoundsPoints(shape);
  if (!points?.length) return;
  const pxs = points.map((point) => meta.toPx(point.x, point.y));
  const left = Math.min(...pxs.map((p) => p.px));
  const right = Math.max(...pxs.map((p) => p.px));
  const top = Math.min(...pxs.map((p) => p.py));
  const bottom = Math.max(...pxs.map((p) => p.py));
  ctx.strokeRect(left - 6, top - 6, right - left + 12, bottom - top + 12);
}

function getShapeBoundsPoints(shape) {
  if (shape.type === "circle") return [
    { x: shape.center.x - shape.radius, y: shape.center.y - shape.radius },
    { x: shape.center.x + shape.radius, y: shape.center.y + shape.radius }
  ];
  if (shape.type === "ellipse") {
    const params = getEllipseParams(shape);
    if (!params) return [];
    return [
      { x: params.cx - params.a, y: params.cy - params.b },
      { x: params.cx + params.a, y: params.cy + params.b }
    ];
  }
  return [];
}

function updateDiagramToolHint(card, graph) {
  const hint = card.querySelector("[data-diagram-tool-hint]");
  if (!hint) return;
  const questionId = card.dataset.questionId;
  const tool = getActiveDiagramTool(questionId);
  const selection = diagramSelectionByQuestionId.get(questionId) || [];
  const construction = diagramConstructionByQuestionId.get(questionId);
  const messages = {
    point: "Point: click the diagram to insert a point. Stick previews the exact snapped placement.",
    segment: selection.length ? `Segment: selected ${selection.join(" → ")}. Click another point.` : "Segment: click two points to create one independent segment.",
    polygon: "Regular polygon: click the diagram to place its center. The popup defines sides/radius/rotation.",
    "irregular-polygon": construction?.tool === "irregular-polygon" ? `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.` : "Irregular polygon: choose the side count, then click each vertex.",
    circle: construction?.tool === "circle" ? "Circle: center selected. Click a second point to set the radius." : "Circle: click the center, then click a point on the circumference.",
    ellipse: construction?.tool === "ellipse" ? `Ellipse: ${construction.points.length}/3 construction points selected.` : "Ellipse: click focus 1, focus 2, then a point on the ellipse.",
    trapezoid: "Trapezoid: click to insert an editable trapezoid template.",
    parallelogram: "Parallelogram: click to insert an editable parallelogram template.",
    angle: selection.length ? `Angle: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle: click three existing points: from, vertex, to.",
    function: "Function: type y = expression, then attach the diagram.",
    select: "Selection: click an object to select it. Double-click it on the canvas to edit properties.",
    erase: "Erase: click an object to remove it. Use Clear canvas for everything.",
    "move-point": "Move point: drag any manual point directly on the diagram.",
    "toggle-label": "Toggle label: click a segment or angle to cycle labels."
  };
  hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
}

function setActiveDiagramTool(questionId, tool) {
  diagramToolByQuestionId.set(questionId, tool);
  if (!["segment", "angle", "irregular-polygon", "circle", "ellipse"].includes(tool)) {
    diagramSelectionByQuestionId.delete(questionId);
  }
  if (!["irregular-polygon", "circle", "ellipse"].includes(tool)) {
    diagramConstructionByQuestionId.delete(questionId);
  }
}

function drawInteractionPreview(ctx, meta, canvas) {
  const preview = canvas.__interactionPreview;
  if (!preview?.visible || !preview.point) return;
  const { px, py } = meta.toPx(preview.point.x, preview.point.y);
  ctx.save();
  ctx.strokeStyle = "rgba(20, 92, 99, 0.55)";
  ctx.fillStyle = "rgba(20, 92, 99, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  if (preview.snap) {
    ctx.beginPath();
    ctx.moveTo(px, meta.padding.top);
    ctx.lineTo(px, meta.padding.top + meta.plotHeight);
    ctx.moveTo(meta.padding.left, py);
    ctx.lineTo(meta.padding.left + meta.plotWidth, py);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "600 11px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  drawTextWithHalo(ctx, `(${roundGraphCoordinate(preview.point.x)}, ${roundGraphCoordinate(preview.point.y)})`, px + 10, py - 9);
  ctx.restore();
}


/* ===== Diagram segment labels for shape polygons ===== */
function drawShapes(ctx, graph, meta) {
  graph.shapes.filter((shape) => shape.visible !== false).forEach((shape) => {
    if (shape.type === "regularPolygon") {
      const points = getRegularPolygonPoints(shape);
      drawPolygon(ctx, points, meta, shape);
      drawRegularPolygonShapeSegments(ctx, shape, points, meta);
      if (shape.showApothem) drawApothem(ctx, points, meta);
      return;
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      drawClosedPointShape(ctx, shape, meta);
      return;
    }
    if (shape.type === "circle") {
      drawCircleShape(ctx, shape, meta);
      return;
    }
    if (shape.type === "ellipse") {
      drawEllipseShape(ctx, shape, meta);
    }
  });
}

function drawRegularPolygonShapeSegments(ctx, shape, points, meta) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.fillStyle = shape.stroke || "#145c63";
  ctx.lineWidth = shape.lineWidth || 2;
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const key = makeSegmentKeyLabels(start.label, end.label);
    const mode = shape.segmentLabelModes?.[key] || "name";
    const label = getSegmentLabel(start, end, mode);
    if (!label) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    const labelX = (a.px + b.px) / 2;
    const labelY = (a.py + b.py) / 2 - 10;
    if (mode === "name") drawTextWithOverbar(ctx, label, labelX, labelY);
    else drawTextWithHalo(ctx, label, labelX, labelY);
  });
  ctx.restore();
}

function findClickedSegment(graph, meta, clickX, clickY) {
  const candidates = graph.segments.map((segment) => ({ segment }));

  if (graph.regularPolygon?.visible !== false && graph.regularPolygon) {
    const polygonPoints = getRegularPolygonPoints(graph.regularPolygon);
    polygonPoints.forEach((point, index) => {
      const next = polygonPoints[(index + 1) % polygonPoints.length];
      const key = makeSegmentKeyLabels(point.label, next.label);
      candidates.push({
        segment: {
          from: point.label,
          to: next.label,
          labelMode: graph.regularPolygon.segmentLabelModes?.[key] || "name",
          polygon: true,
          polygonSegmentKey: key
        }
      });
    });
  }

  graph.shapes.filter((shape) => shape.visible !== false && shape.type === "regularPolygon").forEach((shape) => {
    const points = getRegularPolygonPoints(shape);
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const key = makeSegmentKeyLabels(point.label, next.label);
      candidates.push({
        segment: {
          from: point.label,
          to: next.label,
          labelMode: shape.segmentLabelModes?.[key] || "name",
          shapePolygon: true,
          shapeId: shape.id,
          polygonSegmentKey: key
        }
      });
    });
  });

  let best = null;
  candidates.forEach(({ segment }) => {
    const start = findPointByLabelInGraph(graph, segment.from);
    const end = findPointByLabelInGraph(graph, segment.to);
    if (!start || !end) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    const distance = distancePointToSegment(clickX, clickY, a.px, a.py, b.px, b.py);
    if (distance <= 9 && (!best || distance < best.distance)) best = { segment, distance };
  });
  return best;
}

function cycleClickedAngleOrSegment(values, meta, canvasX, canvasY) {
  const clickedAngle = findClickedAngle(values, meta, canvasX, canvasY);
  if (clickedAngle) {
    clickedAngle.angle.labelMode = getNextAngleLabelMode(clickedAngle.angle.labelMode);
    return true;
  }
  const clickedSegment = findClickedSegment(values, meta, canvasX, canvasY);
  if (!clickedSegment) return false;
  const nextMode = getNextSegmentLabelMode(clickedSegment.segment.labelMode);
  if (clickedSegment.segment.polygon && values.regularPolygon) {
    values.regularPolygon.segmentLabelModes = {
      ...(values.regularPolygon.segmentLabelModes || {}),
      [clickedSegment.segment.polygonSegmentKey]: nextMode
    };
    return true;
  }
  if (clickedSegment.segment.shapePolygon) {
    const shape = values.shapes.find((item) => item.id === clickedSegment.segment.shapeId);
    if (shape) {
      shape.segmentLabelModes = {
        ...(shape.segmentLabelModes || {}),
        [clickedSegment.segment.polygonSegmentKey]: nextMode
      };
      return true;
    }
  }
  clickedSegment.segment.labelMode = nextMode;
  return true;
}

/* ===== Diagram function visibility support ===== */
function setObjectVisibility(graph, objectId, visible) {
  const [kind, ...rest] = String(objectId).split(":");
  if (kind === "point") {
    const point = graph.points.find((item) => item.label === rest[0]);
    if (point) point.visible = visible;
  }
  if (kind === "segment") {
    const segment = graph.segments.find((item) => getSegmentObjectId(item) === objectId);
    if (segment) segment.visible = visible;
  }
  if (kind === "angle") {
    const angle = graph.angles.find((item) => getAngleObjectId(item) === objectId);
    if (angle) angle.visible = visible;
  }
  if (kind === "shape") {
    const shape = graph.shapes.find((item) => item.id === rest.join(":"));
    if (shape) shape.visible = visible;
  }
  if (kind === "legacyPolygon" && graph.regularPolygon) graph.regularPolygon.visible = visible;
  if (kind === "function") graph.functionVisible = visible;
}

function getDiagramObjectById(graph, objectId) {
  const [kind, ...rest] = String(objectId).split(":");
  if (kind === "point") {
    const ref = graph.points.find((point) => point.label === rest[0]);
    return ref ? { kind, ref } : null;
  }
  if (kind === "segment") {
    const ref = graph.segments.find((segment) => getSegmentObjectId(segment) === objectId);
    return ref ? { kind, ref } : null;
  }
  if (kind === "angle") {
    const ref = graph.angles.find((angle) => getAngleObjectId(angle) === objectId);
    return ref ? { kind, ref } : null;
  }
  if (kind === "shape") {
    const ref = graph.shapes.find((shape) => shape.id === rest.join(":"));
    return ref ? { kind, ref } : null;
  }
  if (kind === "function") return { kind, ref: graph };
  return null;
}


/* ===== Diagram drawing stability patch ===== */
function getVisibleDiagramPoints(graph) {
  const normalized = normalizeGraph(graph);
  return {
    graph: normalized,
    manual: normalized.points.filter((point) => point.visible !== false),
    legacyPolygon: normalized.regularPolygon?.visible !== false ? getRegularPolygonPoints(normalized.regularPolygon) : [],
    shapes: getAllShapePoints(normalized.shapes).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  };
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

  let xMin = Number(graph.xMin);
  let xMax = Number(graph.xMax);

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
    if (graph.graphType === "function" || !graph.autoFit) {
      drawGraphError(ctx, cssWidth, cssHeight, "Use a valid x-domain.");
      return;
    }
    xMin = -10;
    xMax = 10;
  }

  const legacyPolygonPoints = graph.regularPolygon?.visible !== false ? getRegularPolygonPoints(graph.regularPolygon) : [];
  const shapePoints = getAllShapePoints(graph.shapes);
  const manualPoints = graph.points.filter((point) => point.visible !== false);
  let fnPoints = [];

  if (graph.expression && graph.functionVisible !== false) {
    try {
      const fn = compileExpression(graph.expression);
      const samples = 700;
      for (let i = 0; i <= samples; i += 1) {
        const x = xMin + ((xMax - xMin) * i) / samples;
        let y;
        try { y = fn(x); } catch (_) { y = NaN; }
        fnPoints.push({ x, y });
      }
    } catch (error) {
      drawGraphError(ctx, cssWidth, cssHeight, error.message);
      return;
    }
  }

  const objectPoints = [
    ...manualPoints,
    ...legacyPolygonPoints,
    ...shapePoints
  ].filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  let autoBounds = null;
  if (graph.autoFit && graph.graphType !== "function" && objectPoints.length) {
    autoBounds = getPointBounds(objectPoints, 0.16);
    xMin = autoBounds.xMin;
    xMax = autoBounds.xMax;
  }

  const finiteYs = [
    ...fnPoints.map((point) => point.y),
    ...objectPoints.map((point) => point.y)
  ].filter(Number.isFinite);

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

  const paddingY = graph.yMin === "" && graph.yMax === "" && !autoBounds
    ? (yMax - yMin) * 0.04 || 1
    : 0;

  yMin -= paddingY;
  yMax += paddingY;

  const toPx = (x, y) => ({
    px: padding.left + ((x - xMin) / (xMax - xMin)) * plotWidth,
    py: padding.top + ((yMax - y) / (yMax - yMin)) * plotHeight
  });

  const meta = { width: cssWidth, height: cssHeight, padding, plotWidth, plotHeight, xMin, xMax, yMin, yMax, toPx, graph };
  canvas.__graphMeta = meta;

  if (graph.displayMode === "geometry") drawGeometryBackground(ctx, meta);
  else drawGrid(ctx, meta);

  ctx.save();
  ctx.beginPath();
  ctx.rect(padding.left, padding.top, plotWidth, plotHeight);
  ctx.clip();

  if (fnPoints.length) drawCurve(ctx, fnPoints, { toPx, yMin, yMax, plotHeight, graph });

  try {
    if (legacyPolygonPoints.length) {
      drawPolygon(ctx, legacyPolygonPoints, meta, graph.regularPolygon);
      if (graph.regularPolygon?.showApothem) drawApothem(ctx, legacyPolygonPoints, meta);
    }
  } catch (error) {
    console.error("Could not draw legacy regular polygon", error);
  }

  try { drawShapes(ctx, graph, meta); }
  catch (error) { console.error("Could not draw diagram shapes", error); }

  try { drawSegments(ctx, graph, meta, legacyPolygonPoints); }
  catch (error) { console.error("Could not draw diagram segments", error); }

  try { drawAngles(ctx, graph, meta); }
  catch (error) { console.error("Could not draw diagram angles", error); }

  // Manual points are drawn last so they remain visible even when a shape,
  // segment, or filled polygon occupies the same region.
  if (manualPoints.length) drawPoints(ctx, manualPoints, meta);

  try { drawSelectionHighlight(ctx, graph, meta, canvas.__selectedObjectId, legacyPolygonPoints); }
  catch (error) { console.error("Could not draw selection highlight", error); }

  ctx.restore();

  drawInteractionPreview(ctx, meta, canvas);
  drawGraphCanvasTitle(ctx, graph, cssWidth);
}

function drawShapes(ctx, graph, meta) {
  const shapes = Array.isArray(graph.shapes) ? graph.shapes.filter((shape) => shape.visible !== false) : [];

  shapes.forEach((shape) => {
    if (shape.type === "regularPolygon") {
      const points = getRegularPolygonPoints(shape);
      drawPolygon(ctx, points, meta, shape);
      if (shape.showApothem) drawApothem(ctx, points, meta);
      return;
    }

    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      drawClosedPointShape(ctx, shape, meta);
      const labeledPoints = (shape.points || []).map((point, index) => ({
        ...point,
        label: point.label || String.fromCharCode(65 + index),
        color: shape.stroke || "#145c63",
        size: 4,
        visible: shape.visible !== false
      }));
      drawPoints(ctx, labeledPoints, meta);
      return;
    }

    if (shape.type === "circle") {
      drawCircleShape(ctx, shape, meta);
      return;
    }

    if (shape.type === "ellipse") {
      drawEllipseShape(ctx, shape, meta);
    }
  });
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  pushDiagramHistory(question.id, values);

  const nextPoint = {
    label: nextPointLabel(values.points),
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y),
    labelDx: 8,
    labelDy: -7,
    color: "#145c63",
    size: 5,
    visible: true
  };

  const nextGraph = normalizeGraph({
    ...values,
    graphType: values.graphType === "function" ? "points" : values.graphType,
    points: [...values.points, nextPoint]
  });

  updatePointsField(card, nextGraph);

  const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
  if (graphTypeField) graphTypeField.value = nextGraph.graphType;

  graphDrafts.set(question.id, nextGraph);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = `Added point ${nextPoint.label}(${nextPoint.x}, ${nextPoint.y}).`;
    message.classList.remove("error");
  }
}


/* ===== Patch: diagram editor fixes, modal configuration, improved snap ===== */
function updateGraphFieldVisibility(card, graphType) {
  const functionFields = card.querySelector("[data-graph-function-fields]");
  const polygonFields = card.querySelectorAll("[data-graph-polygon-fields]");
  const type = ["points", "polygon", "function", "diagram"].includes(graphType) ? graphType : "points";

  if (functionFields) functionFields.classList.toggle("is-hidden", type !== "function");
  polygonFields.forEach((field) => field.classList.toggle("is-hidden", type !== "polygon"));
}

function getPointBounds(points, marginRatio = 0.12) {
  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);

  const minRange = 10;
  const xCenter = (xMin + xMax) / 2;
  const yCenter = (yMin + yMax) / 2;
  if (xMax - xMin < minRange) {
    xMin = xCenter - minRange / 2;
    xMax = xCenter + minRange / 2;
  }
  if (yMax - yMin < minRange) {
    yMin = yCenter - minRange / 2;
    yMax = yCenter + minRange / 2;
  }

  const xPad = (xMax - xMin) * marginRatio || 1;
  const yPad = (yMax - yMin) * marginRatio || 1;
  return { xMin: xMin - xPad, xMax: xMax + xPad, yMin: yMin - yPad, yMax: yMax + yPad };
}

function getSnapStepForRange(min, max) {
  const range = Math.abs(Number(max) - Number(min)) || 10;
  if (range <= 12) return 0.5;
  if (range <= 25) return 1;
  if (range <= 50) return 2;
  if (range <= 120) return 5;
  return 10;
}

function snapGraphPoint(point, meta) {
  const graph = meta.graph ? normalizeGraph(meta.graph) : null;
  const cursorPx = meta.toPx(point.x, point.y);
  const hitPx = 12;

  const pointSnap = findNearestSnapPoint(graph, meta, cursorPx, hitPx);
  if (pointSnap) return pointSnap;

  const segmentSnap = findNearestSnapOnSegment(graph, meta, point, cursorPx, hitPx);
  if (segmentSnap) return segmentSnap;

  const xStep = getSnapStepForRange(meta.xMin, meta.xMax);
  const yStep = getSnapStepForRange(meta.yMin, meta.yMax);
  let x = Math.round(point.x / xStep) * xStep;
  let y = Math.round(point.y / yStep) * yStep;

  if (Math.abs(point.x) <= xStep * 0.35) x = 0;
  if (Math.abs(point.y) <= yStep * 0.35) y = 0;

  return { x, y };
}

function findNearestSnapPoint(graph, meta, cursorPx, hitPx) {
  if (!graph) return null;
  const candidates = [];
  graph.points.filter((point) => point.visible !== false).forEach((point) => candidates.push(point));
  if (graph.regularPolygon?.visible !== false) candidates.push(...getRegularPolygonPoints(graph.regularPolygon));
  (graph.shapes || []).filter((shape) => shape.visible !== false).forEach((shape) => {
    if (shape.type === "regularPolygon") candidates.push(...getRegularPolygonPoints(shape));
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) candidates.push(...(shape.points || []));
    if (shape.type === "circle") candidates.push(shape.center);
    if (shape.type === "ellipse") candidates.push(shape.focus1, shape.focus2, shape.through);
  });

  let best = null;
  candidates.filter(Boolean).forEach((candidate) => {
    if (!Number.isFinite(Number(candidate.x)) || !Number.isFinite(Number(candidate.y))) return;
    const p = meta.toPx(candidate.x, candidate.y);
    const distance = Math.hypot(cursorPx.px - p.px, cursorPx.py - p.py);
    if (distance <= hitPx && (!best || distance < best.distance)) {
      best = { distance, point: { x: Number(candidate.x), y: Number(candidate.y) } };
    }
  });
  return best?.point || null;
}

function findNearestSnapOnSegment(graph, meta, point, cursorPx, hitPx) {
  if (!graph) return null;
  const segments = [];

  const addPointSequence = (points, closeShape = false) => {
    if (!Array.isArray(points) || points.length < 2) return;
    const count = closeShape ? points.length : points.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a && b) segments.push([a, b]);
    }
  };

  (graph.segments || []).filter((segment) => segment.visible !== false).forEach((segment) => {
    const a = findPointByLabelInGraph(graph, segment.from);
    const b = findPointByLabelInGraph(graph, segment.to);
    if (a && b) segments.push([a, b]);
  });
  if (graph.regularPolygon?.visible !== false) addPointSequence(getRegularPolygonPoints(graph.regularPolygon), true);
  (graph.shapes || []).filter((shape) => shape.visible !== false).forEach((shape) => {
    if (shape.type === "regularPolygon") addPointSequence(getRegularPolygonPoints(shape), true);
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) addPointSequence(shape.points || [], true);
  });

  let best = null;
  segments.forEach(([a, b]) => {
    const projected = projectPointToSegment(point, a, b);
    const px = meta.toPx(projected.x, projected.y);
    const distance = Math.hypot(cursorPx.px - px.px, cursorPx.py - px.py);
    if (distance <= hitPx && (!best || distance < best.distance)) best = { distance, point: projected };
  });
  return best?.point || null;
}

function projectPointToSegment(point, a, b) {
  const ax = Number(a.x), ay = Number(a.y), bx = Number(b.x), by = Number(b.y);
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / (dx * dx + dy * dy)));
  return { x: ax + t * dx, y: ay + t * dy };
}

function configureRegularPolygonTool(card, question, values) {
  values.graphType = "polygon";
  const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
  if (graphTypeField) graphTypeField.value = "polygon";
  updateGraphFieldVisibility(card, "polygon");
  graphDrafts.set(question.id, normalizeGraph(values));

  openDiagramDialog({
    title: "Regular polygon",
    description: "Choose the polygon settings. After clicking OK, click the diagram to place the center.",
    fields: [
      { name: "sides", label: "Number of sides", type: "number", min: 3, max: 40, step: 1, value: card.querySelector('[data-graph-field="polygonSides"]')?.value || "6" },
      { name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: card.querySelector('[data-graph-field="polygonRadius"]')?.value || "4" },
      { name: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1, value: card.querySelector('[data-graph-field="polygonRotation"]')?.value || "90" },
      { name: "showApothem", label: "Show apothem", type: "checkbox", value: Boolean(card.querySelector('[data-graph-field="showApothem"]')?.checked) }
    ]
  }).then((result) => {
    if (!result) return;
    const sidesField = card.querySelector('[data-graph-field="polygonSides"]');
    const radiusField = card.querySelector('[data-graph-field="polygonRadius"]');
    const rotationField = card.querySelector('[data-graph-field="polygonRotation"]');
    const apothemField = card.querySelector('[data-graph-field="showApothem"]');
    if (sidesField) sidesField.value = String(Math.max(3, Math.round(Number(result.sides) || 6)));
    if (radiusField) radiusField.value = String(Math.max(0.1, Number(result.radius) || 4));
    if (rotationField) rotationField.value = String(Number(result.rotation) || 0);
    if (apothemField) apothemField.checked = Boolean(result.showApothem);

    const next = getGraphValuesFromCard(card);
    next.graphType = "polygon";
    graphDrafts.set(question.id, normalizeGraph(next));
    updateDiagramToolHint(card, next);
    drawGraphDraftOnCard(card, next);
  });
}

function configureIrregularPolygonTool(question) {
  openDiagramDialog({
    title: "Irregular polygon",
    description: "Choose how many vertices the polygon will have. Then click each vertex on the diagram.",
    fields: [
      { name: "sides", label: "Number of sides", type: "number", min: 3, max: 40, step: 1, value: 3 }
    ]
  }).then((result) => {
    if (!result) return;
    const sides = Math.max(3, Math.round(Number(result.sides) || 3));
    diagramConstructionByQuestionId.set(question.id, { tool: "irregular-polygon", targetSides: sides, points: [] });
  });
}

function openDiagramDialog(config) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "diagram-modal-backdrop";
    const fieldsHtml = (config.fields || []).map((field) => {
      if (field.type === "checkbox") {
        return `
          <label class="diagram-modal-check full">
            <input type="checkbox" name="${escapeAttribute(field.name)}" ${field.value ? "checked" : ""} />
            <span>${escapeHTML(field.label)}</span>
          </label>
        `;
      }
      const type = field.type || "text";
      return `
        <div class="diagram-modal-field ${field.full ? "full" : ""}">
          <label>${escapeHTML(field.label)}</label>
          <input
            type="${escapeAttribute(type)}"
            name="${escapeAttribute(field.name)}"
            value="${escapeAttribute(field.value ?? "")}"
            ${field.min != null ? `min="${escapeAttribute(field.min)}"` : ""}
            ${field.max != null ? `max="${escapeAttribute(field.max)}"` : ""}
            ${field.step != null ? `step="${escapeAttribute(field.step)}"` : ""}
          />
        </div>
      `;
    }).join("");

    backdrop.innerHTML = `
      <form class="diagram-modal" role="dialog" aria-modal="true">
        <header class="diagram-modal-header">
          <h2 class="diagram-modal-title">${escapeHTML(config.title || "Diagram settings")}</h2>
          <p class="diagram-modal-description">${escapeHTML(config.description || "Adjust the settings and click OK.")}</p>
        </header>
        <div class="diagram-modal-grid">${fieldsHtml}</div>
        <footer class="diagram-modal-actions">
          <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
          <button type="submit" class="btn-primary">OK</button>
        </footer>
      </form>
    `;

    document.body.appendChild(backdrop);
    const form = backdrop.querySelector("form");
    const firstInput = backdrop.querySelector("input, select, button");
    firstInput?.focus();

    const close = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(null);
    });
    backdrop.querySelector("[data-modal-cancel]")?.addEventListener("click", () => close(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = {};
      (config.fields || []).forEach((field) => {
        const input = form.elements[field.name];
        if (!input) return;
        data[field.name] = field.type === "checkbox" ? Boolean(input.checked) : input.value;
      });
      close(data);
    });
  });
}

function findClickedDiagramObject(graph, meta, clickX, clickY) {
  const pointHit = findClickedPoint(graph, meta, clickX, clickY);
  if (pointHit?.source === "manual") return { id: `point:${pointHit.point.label}`, kind: "point", ref: pointHit.point };
  const angleHit = findClickedAngle(graph, meta, clickX, clickY);
  if (angleHit) return { id: getAngleObjectId(angleHit.angle), kind: "angle", ref: angleHit.angle };
  const segmentHit = findClickedSegment(graph, meta, clickX, clickY);
  if (segmentHit && !segmentHit.segment.polygon) return { id: getSegmentObjectId(segmentHit.segment), kind: "segment", ref: segmentHit.segment };

  if (graph.regularPolygon?.visible !== false) {
    const polygonPoints = getRegularPolygonPoints(graph.regularPolygon);
    if (pointInPolygonPx(polygonPoints.map((p) => meta.toPx(p.x, p.y)), clickX, clickY)) {
      return { id: "legacyPolygon:regular", kind: "legacyPolygon", ref: graph.regularPolygon };
    }
  }

  const shapeHit = findClickedShape(graph, meta, clickX, clickY);
  if (shapeHit) return shapeHit;
  return null;
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  const latest = normalizeGraph(graphDrafts.get(question.id) || values || {});
  pushDiagramHistory(question.id, latest);

  const nextPoint = {
    label: nextPointLabel(latest.points),
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y),
    labelDx: 8,
    labelDy: -7,
    color: "#145c63",
    size: 5,
    visible: true
  };

  const nextGraph = normalizeGraph({
    ...latest,
    graphType: latest.graphType === "function" ? "points" : latest.graphType,
    points: [...latest.points, nextPoint],
    pointsText: pointsToText([...latest.points, nextPoint])
  });

  updatePointsField(card, nextGraph);
  const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
  if (graphTypeField) graphTypeField.value = nextGraph.graphType;
  graphDrafts.set(question.id, nextGraph);
  updateGraphFieldVisibility(card, nextGraph.graphType);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = `Added point ${nextPoint.label}(${nextPoint.x}, ${nextPoint.y}).`;
    message.classList.remove("error");
  }
}



/* ===== Patch: clean modal tools, margin modal, empty startup, improved stick, shape vertex dragging ===== */
function configureFunctionTool(card, question, values) {
  const current = normalizeGraph(values || getGraphValuesFromCard(card));
  openDiagramDialog({
    title: "Function settings",
    description: "Define the function and its viewing window. Click OK to draw it on the diagram.",
    fields: [
      { name: "expression", label: "y =", type: "text", value: current.expression || "x^2", full: true },
      { name: "xMin", label: "x min", type: "number", step: 0.1, value: current.xMin ?? -10 },
      { name: "xMax", label: "x max", type: "number", step: 0.1, value: current.xMax ?? 10 },
      { name: "yMin", label: "y min", type: "number", step: 0.1, value: current.yMin === "" ? -10 : current.yMin },
      { name: "yMax", label: "y max", type: "number", step: 0.1, value: current.yMax === "" ? 10 : current.yMax },
      { name: "title", label: "Diagram label", type: "text", value: current.title || "Function", full: true }
    ]
  }).then((result) => {
    if (!result) return;
    const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
    const expressionField = card.querySelector('[data-graph-field="expression"]');
    const titleField = card.querySelector('[data-graph-field="title"]');
    const xMinField = card.querySelector('[data-graph-field="xMin"]');
    const xMaxField = card.querySelector('[data-graph-field="xMax"]');
    const yMinField = card.querySelector('[data-graph-field="yMin"]');
    const yMaxField = card.querySelector('[data-graph-field="yMax"]');

    if (graphTypeField) graphTypeField.value = "function";
    if (expressionField) expressionField.value = String(result.expression || "");
    if (titleField) titleField.value = String(result.title || "");
    if (xMinField) xMinField.value = String(result.xMin ?? -10);
    if (xMaxField) xMaxField.value = String(result.xMax ?? 10);
    if (yMinField) yMinField.value = String(result.yMin ?? -10);
    if (yMaxField) yMaxField.value = String(result.yMax ?? 10);

    const next = normalizeGraph({
      ...getGraphValuesFromCard(card),
      graphType: "function",
      expression: String(result.expression || ""),
      title: String(result.title || ""),
      xMin: parseNumberOrDefault(result.xMin, -10),
      xMax: parseNumberOrDefault(result.xMax, 10),
      yMin: parseOptionalNumber(result.yMin),
      yMax: parseOptionalNumber(result.yMax)
    });

    graphDrafts.set(question.id, next);
    updateGraphFieldVisibility(card, "function");
    drawGraphDraftOnCard(card, next);
    updateDiagramToolHint(card, next);
    renderAllPreviewsDebounced();
  });
}

function openMarginDialog(card, question) {
  const current = normalizeGraph(getGraphValuesFromCard(card));
  openDiagramDialog({
    title: "Diagram margin",
    description: "Set the coordinate window used by the diagram. Turn off Auto-fit when you want these limits to stay fixed.",
    fields: [
      { name: "xMin", label: "x min", type: "number", step: 0.1, value: current.xMin ?? -10 },
      { name: "xMax", label: "x max", type: "number", step: 0.1, value: current.xMax ?? 10 },
      { name: "yMin", label: "y min", type: "number", step: 0.1, value: current.yMin === "" ? -10 : current.yMin },
      { name: "yMax", label: "y max", type: "number", step: 0.1, value: current.yMax === "" ? 10 : current.yMax },
      { name: "autoFit", label: "Keep Auto-fit enabled", type: "checkbox", value: current.autoFit }
    ]
  }).then((result) => {
    if (!result) return;
    const xMinField = card.querySelector('[data-graph-field="xMin"]');
    const xMaxField = card.querySelector('[data-graph-field="xMax"]');
    const yMinField = card.querySelector('[data-graph-field="yMin"]');
    const yMaxField = card.querySelector('[data-graph-field="yMax"]');
    const autoFitField = card.querySelector('[data-graph-field="autoFit"]');
    if (xMinField) xMinField.value = String(result.xMin ?? -10);
    if (xMaxField) xMaxField.value = String(result.xMax ?? 10);
    if (yMinField) yMinField.value = String(result.yMin ?? -10);
    if (yMaxField) yMaxField.value = String(result.yMax ?? 10);
    if (autoFitField) autoFitField.checked = Boolean(result.autoFit);

    const next = normalizeGraph({
      ...getGraphValuesFromCard(card),
      xMin: parseNumberOrDefault(result.xMin, -10),
      xMax: parseNumberOrDefault(result.xMax, 10),
      yMin: parseOptionalNumber(result.yMin),
      yMax: parseOptionalNumber(result.yMax),
      autoFit: Boolean(result.autoFit)
    });
    graphDrafts.set(question.id, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
}

function getGridStepX(meta) {
  return (Number(meta.xMax) - Number(meta.xMin)) / 8 || 1;
}

function getGridStepY(meta) {
  return (Number(meta.yMax) - Number(meta.yMin)) / 8 || 1;
}

function nearestVisibleGridPoint(point, meta) {
  const xStep = getGridStepX(meta);
  const yStep = getGridStepY(meta);
  let x = Number(meta.xMin) + Math.round((point.x - Number(meta.xMin)) / xStep) * xStep;
  let y = Number(meta.yMin) + Math.round((point.y - Number(meta.yMin)) / yStep) * yStep;

  if (Number(meta.xMin) <= 0 && Number(meta.xMax) >= 0) {
    const axisPx = meta.toPx(0, point.y);
    const cursorPx = meta.toPx(point.x, point.y);
    if (Math.abs(axisPx.px - cursorPx.px) <= 10) x = 0;
  }

  if (Number(meta.yMin) <= 0 && Number(meta.yMax) >= 0) {
    const axisPx = meta.toPx(point.x, 0);
    const cursorPx = meta.toPx(point.x, point.y);
    if (Math.abs(axisPx.py - cursorPx.py) <= 10) y = 0;
  }

  return { x, y };
}

function snapGraphPoint(point, meta) {
  const graph = meta.graph ? normalizeGraph(meta.graph) : null;
  const cursorPx = meta.toPx(point.x, point.y);

  const pointSnap = findNearestSnapPointStrict(graph, meta, cursorPx, 13);
  if (pointSnap) return pointSnap;

  const segmentSnap = findNearestSnapOnSegmentStrict(graph, meta, point, cursorPx, 11);
  if (segmentSnap) return segmentSnap;

  return nearestVisibleGridPoint(point, meta);
}

function findNearestSnapPointStrict(graph, meta, cursorPx, hitPx) {
  if (!graph) return null;
  const candidates = [];
  (graph.points || []).filter((point) => point.visible !== false).forEach((point) => candidates.push(point));
  if (graph.regularPolygon?.visible !== false) candidates.push(...getRegularPolygonPoints(graph.regularPolygon));
  (graph.shapes || []).filter((shape) => shape.visible !== false).forEach((shape) => {
    if (shape.type === "regularPolygon") candidates.push(...getRegularPolygonPoints(shape));
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) candidates.push(...(shape.points || []));
    if (shape.type === "circle") candidates.push(shape.center);
    if (shape.type === "ellipse") candidates.push(shape.focus1, shape.focus2, shape.through);
  });

  let best = null;
  candidates.filter(Boolean).forEach((candidate) => {
    if (!Number.isFinite(Number(candidate.x)) || !Number.isFinite(Number(candidate.y))) return;
    const p = meta.toPx(candidate.x, candidate.y);
    const distance = Math.hypot(cursorPx.px - p.px, cursorPx.py - p.py);
    if (distance <= hitPx && (!best || distance < best.distance)) {
      best = { distance, point: { x: Number(candidate.x), y: Number(candidate.y) } };
    }
  });
  return best?.point || null;
}

function findNearestSnapOnSegmentStrict(graph, meta, point, cursorPx, hitPx) {
  if (!graph) return null;
  const segments = [];

  const addPointSequence = (points, closeShape = false) => {
    if (!Array.isArray(points) || points.length < 2) return;
    const count = closeShape ? points.length : points.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a && b) segments.push([a, b]);
    }
  };

  (graph.segments || []).filter((segment) => segment.visible !== false).forEach((segment) => {
    const a = findPointByLabelInGraph(graph, segment.from);
    const b = findPointByLabelInGraph(graph, segment.to);
    if (a && b) segments.push([a, b]);
  });
  if (graph.regularPolygon?.visible !== false) addPointSequence(getRegularPolygonPoints(graph.regularPolygon), true);
  (graph.shapes || []).filter((shape) => shape.visible !== false).forEach((shape) => {
    if (shape.type === "regularPolygon") addPointSequence(getRegularPolygonPoints(shape), true);
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) addPointSequence(shape.points || [], true);
  });

  let best = null;
  segments.forEach(([a, b]) => {
    const projected = projectPointToSegment(point, a, b);
    const px = meta.toPx(projected.x, projected.y);
    const distance = Math.hypot(cursorPx.px - px.px, cursorPx.py - px.py);
    if (distance <= hitPx && (!best || distance < best.distance)) best = { distance, point: projected };
  });
  return best?.point || null;
}

function findClickedDraggableHandle(graph, meta, canvasX, canvasY) {
  const manual = findClickedPoint(graph, meta, canvasX, canvasY);
  if (manual?.source === "manual") return { kind: "manual", index: manual.index };

  const hitRadius = 12;
  for (let shapeIndex = 0; shapeIndex < (graph.shapes || []).length; shapeIndex += 1) {
    const shape = graph.shapes[shapeIndex];
    if (!shape || shape.visible === false) continue;
    const handles = [];
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      (shape.points || []).forEach((point, pointIndex) => handles.push({ point, pointIndex, handleType: "vertex" }));
    }
    if (shape.type === "circle") {
      handles.push({ point: shape.center, pointIndex: "center", handleType: "center" });
    }
    if (shape.type === "ellipse") {
      handles.push({ point: shape.focus1, pointIndex: "focus1", handleType: "focus1" });
      handles.push({ point: shape.focus2, pointIndex: "focus2", handleType: "focus2" });
      handles.push({ point: shape.through, pointIndex: "through", handleType: "through" });
    }
    for (const handle of handles) {
      if (!handle.point) continue;
      const p = meta.toPx(handle.point.x, handle.point.y);
      if (Math.hypot(canvasX - p.px, canvasY - p.py) <= hitRadius) {
        return { kind: "shape", shapeIndex, pointIndex: handle.pointIndex, handleType: handle.handleType };
      }
    }
  }
  return null;
}

function applyShapeHandleMove(shape, handle, point) {
  if (!shape) return;
  const nextPoint = { x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) };

  if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
    if (!Array.isArray(shape.points) || typeof handle.pointIndex !== "number" || !shape.points[handle.pointIndex]) return;
    shape.points[handle.pointIndex] = { ...shape.points[handle.pointIndex], ...nextPoint };

    if (shape.type === "parallelogram" && shape.points.length >= 4) {
      const i = handle.pointIndex;
      const prev = shape.points[(i + 3) % 4];
      const next = shape.points[(i + 1) % 4];
      const oppositeIndex = (i + 2) % 4;
      shape.points[oppositeIndex] = {
        ...shape.points[oppositeIndex],
        x: roundGraphCoordinate(prev.x + next.x - shape.points[i].x),
        y: roundGraphCoordinate(prev.y + next.y - shape.points[i].y)
      };
    }

    if (shape.type === "trapezoid" && shape.points.length >= 4) {
      if (handle.pointIndex === 0) shape.points[1].y = shape.points[0].y;
      if (handle.pointIndex === 1) shape.points[0].y = shape.points[1].y;
      if (handle.pointIndex === 2) shape.points[3].y = shape.points[2].y;
      if (handle.pointIndex === 3) shape.points[2].y = shape.points[3].y;
    }
    return;
  }

  if (shape.type === "circle" && handle.pointIndex === "center") {
    shape.center = { ...shape.center, ...nextPoint };
    return;
  }

  if (shape.type === "ellipse" && ["focus1", "focus2", "through"].includes(handle.pointIndex)) {
    shape[handle.pointIndex] = { ...shape[handle.pointIndex], ...nextPoint };
  }
}

function handleGraphPointerDown(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const tool = getActiveDiagramTool(question.id);
  const meta = canvas.__graphMeta;
  if (!meta) return;

  const values = getGraphValuesFromCard(card);
  const pointer = getCanvasPointer(event, canvas);
  const handle = findClickedDraggableHandle(values, meta, pointer.x, pointer.y);

  if ((tool === "move-point" || tool === "point") && handle) {
    diagramDragState = {
      card,
      canvas,
      questionId: question.id,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      historySaved: false
    };
    canvas.setPointerCapture?.(event.pointerId);
  }
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;
  const card = diagramDragState?.card || canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;

  const pointer = getCanvasPointer(event, canvas);
  const inside = isInsidePlot(pointer.x, pointer.y, meta);

  if (!diagramDragState) {
    const values = getGraphValuesFromCard(card);
    const tool = getActiveDiagramTool(question.id);
    if (inside && ["point", "segment", "polygon", "irregular-polygon", "angle", "circle", "ellipse", "trapezoid", "parallelogram"].includes(tool)) {
      let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      if (values.snapToGrid) graphPoint = snapGraphPoint(graphPoint, meta);
      canvas.__interactionPreview = { point: graphPoint, snap: values.snapToGrid, tool, visible: true };
    } else {
      canvas.__interactionPreview = null;
    }
    drawGraphDraftOnCard(card, values);
    return;
  }

  const dx = event.clientX - diagramDragState.startClientX;
  const dy = event.clientY - diagramDragState.startClientY;
  if (!diagramDragState.moved && Math.hypot(dx, dy) < 3) return;
  diagramDragState.moved = true;
  if (!inside) return;

  const values = getGraphValuesFromCard(card);
  let point = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  if (!diagramDragState.historySaved) {
    pushDiagramHistory(question.id, values);
    diagramDragState.historySaved = true;
  }

  const handle = diagramDragState.handle;
  if (handle.kind === "manual") {
    if (!values.points[handle.index]) return;
    values.points[handle.index] = { ...values.points[handle.index], x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) };
    updatePointsField(card, values);
  }

  if (handle.kind === "shape") {
    const shape = values.shapes?.[handle.shapeIndex];
    applyShapeHandleMove(shape, handle, point);
  }

  graphDrafts.set(question.id, normalizeGraph(values));
  canvas.__interactionPreview = { point, snap: values.snapToGrid, tool: "move-point", visible: true };
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
}


/* ===== Patch: modal-based styling, selection workflow, dynamic previews ===== */
function initialize() {
  state.title = "Algebra 1 Checkpoint";
  state.subject = "Algebra 1";
  state.instructions = "Answer each question. For multiple-choice questions, select one option. For written answers, show your reasoning when possible.";
  state.questions.push(createQuestion({
    prompt: "What is the solution of $x^2=4$?",
    options: ["$x=2$ only", "$x=-2$ only", "$x=-2$ or $x=2$", "No real solution"],
    correctOptionIndex: 2,
    correctOptionIndexes: [2],
    answer: "Both $-2$ and $2$ solve the equation because $(-2)^2=4$ and $2^2=4$.",
    graph: null,
    collapsed: false
  }));

  bindEvents();
  syncInputsFromState();
  renderQuestions();
  renderAllPreviews();
}

function setHiddenGraphField(card, name, value) {
  const field = card.querySelector(`[data-graph-field="${name}"]`);
  if (!field) return;
  if (field.type === "checkbox") field.checked = Boolean(value);
  else field.value = value ?? "";
}

function setToolToSelection(card, question, graph, objectId = null) {
  setActiveDiagramTool(question.id, "select");
  updateDiagramToolButtons(card, "select");
  if (objectId) diagramObjectSelectionByQuestionId.set(question.id, objectId);
  diagramSelectionByQuestionId.delete(question.id);
  diagramConstructionByQuestionId.delete(question.id);
  graphDrafts.set(question.id, normalizeGraph(graph));
  drawGraphDraftOnCard(card, graph);
  updateDiagramToolHint(card, graph);
}

function openDiagramDialog(config) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "diagram-modal-backdrop";

    const fieldsHtml = (config.fields || []).map((field) => {
      if (field.type === "checkbox") {
        return `
          <label class="diagram-modal-check ${field.full ? "full" : ""}">
            <input type="checkbox" name="${escapeAttribute(field.name)}" ${field.value ? "checked" : ""} />
            <span>${escapeHTML(field.label)}</span>
          </label>
        `;
      }

      if (field.type === "select") {
        const options = (field.options || []).map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return `<option value="${escapeAttribute(value)}" ${String(value) === String(field.value) ? "selected" : ""}>${escapeHTML(label)}</option>`;
        }).join("");
        return `
          <div class="diagram-modal-field ${field.full ? "full" : ""}">
            <label>${escapeHTML(field.label)}</label>
            <select name="${escapeAttribute(field.name)}">${options}</select>
          </div>
        `;
      }

      const type = field.type || "text";
      return `
        <div class="diagram-modal-field ${field.full ? "full" : ""}">
          <label>${escapeHTML(field.label)}</label>
          <input
            type="${escapeAttribute(type)}"
            name="${escapeAttribute(field.name)}"
            value="${escapeAttribute(field.value ?? "")}" 
            ${field.min != null ? `min="${escapeAttribute(field.min)}"` : ""}
            ${field.max != null ? `max="${escapeAttribute(field.max)}"` : ""}
            ${field.step != null ? `step="${escapeAttribute(field.step)}"` : ""}
          />
        </div>
      `;
    }).join("");

    backdrop.innerHTML = `
      <form class="diagram-modal" role="dialog" aria-modal="true">
        <header class="diagram-modal-header">
          <h2 class="diagram-modal-title">${escapeHTML(config.title || "Diagram settings")}</h2>
          <p class="diagram-modal-description">${escapeHTML(config.description || "Adjust the settings and click OK.")}</p>
        </header>
        <div class="diagram-modal-grid">${fieldsHtml}</div>
        <footer class="diagram-modal-actions">
          <button type="button" class="btn-outline" data-modal-cancel>Cancel</button>
          <button type="submit" class="btn-primary">OK</button>
        </footer>
      </form>
    `;

    document.body.appendChild(backdrop);
    const form = backdrop.querySelector("form");
    const firstInput = backdrop.querySelector("input, select, button");
    firstInput?.focus();

    const close = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(null);
    });
    backdrop.querySelector("[data-modal-cancel]")?.addEventListener("click", () => close(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = {};
      (config.fields || []).forEach((field) => {
        const input = form.elements[field.name];
        if (!input) return;
        data[field.name] = field.type === "checkbox" ? Boolean(input.checked) : input.value;
      });
      close(data);
    });
  });
}

function configureFunctionTool(card, question, values) {
  const current = normalizeGraph(values || getGraphValuesFromCard(card));
  openDiagramDialog({
    title: "Function settings",
    description: "Define the function, viewing window, and line style. Click OK to draw it on the diagram.",
    fields: [
      { name: "expression", label: "Function: y =", type: "text", value: current.expression || "x^2", full: true },
      { name: "xMin", label: "x min", type: "number", step: 0.1, value: current.xMin ?? -10 },
      { name: "xMax", label: "x max", type: "number", step: 0.1, value: current.xMax ?? 10 },
      { name: "yMin", label: "y min", type: "number", step: 0.1, value: current.yMin === "" ? -10 : current.yMin },
      { name: "yMax", label: "y max", type: "number", step: 0.1, value: current.yMax === "" ? 10 : current.yMax },
      { name: "functionStroke", label: "Trace color", type: "color", value: current.functionStroke || "#145c63" },
      { name: "functionLineWidth", label: "Trace thickness", type: "number", step: 0.5, min: 1, max: 12, value: current.functionLineWidth || 2.5 },
      { name: "functionDash", label: "Trace type", type: "select", value: current.functionDash || "solid", options: [
        { value: "solid", label: "Continuous" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" }
      ]},
      { name: "functionLabel", label: "Function label", type: "text", value: current.functionLabel || current.title || "", full: true }
    ]
  }).then((result) => {
    if (!result) {
      setToolToSelection(card, question, current);
      return;
    }

    setHiddenGraphField(card, "graphType", "function");
    setHiddenGraphField(card, "expression", String(result.expression || ""));
    setHiddenGraphField(card, "xMin", result.xMin ?? -10);
    setHiddenGraphField(card, "xMax", result.xMax ?? 10);
    setHiddenGraphField(card, "yMin", result.yMin ?? -10);
    setHiddenGraphField(card, "yMax", result.yMax ?? 10);
    setHiddenGraphField(card, "functionStroke", result.functionStroke || "#145c63");
    setHiddenGraphField(card, "functionLineWidth", result.functionLineWidth || 2.5);
    setHiddenGraphField(card, "functionDash", result.functionDash || "solid");
    setHiddenGraphField(card, "functionLabel", result.functionLabel || "");
    setHiddenGraphField(card, "title", result.functionLabel || current.title || "Function");

    const next = normalizeGraph({
      ...getGraphValuesFromCard(card),
      graphType: "function",
      expression: String(result.expression || ""),
      title: String(result.functionLabel || current.title || "Function"),
      functionLabel: String(result.functionLabel || ""),
      functionStroke: isHexColor(result.functionStroke) ? result.functionStroke : "#145c63",
      functionLineWidth: parseNumberOrDefault(result.functionLineWidth, 2.5),
      functionDash: ["solid", "dashed", "dotted"].includes(result.functionDash) ? result.functionDash : "solid",
      xMin: parseNumberOrDefault(result.xMin, -10),
      xMax: parseNumberOrDefault(result.xMax, 10),
      yMin: parseOptionalNumber(result.yMin),
      yMax: parseOptionalNumber(result.yMax)
    });

    graphDrafts.set(question.id, next);
    updateGraphFieldVisibility(card, "function");
    drawGraphDraftOnCard(card, next);
    updateDiagramToolHint(card, next);
    renderAllPreviewsDebounced();
    setToolToSelection(card, question, next, "function:main");
  });
}

function configureRegularPolygonTool(card, question, values) {
  const current = normalizeGraph(values || getGraphValuesFromCard(card));
  openDiagramDialog({
    title: "Regular polygon settings",
    description: "Choose the polygon settings. After clicking OK, click the diagram to place its center.",
    fields: [
      { name: "sides", label: "Number of sides", type: "number", min: 3, max: 40, step: 1, value: card.querySelector('[data-graph-field="polygonSides"]')?.value || "6" },
      { name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: card.querySelector('[data-graph-field="polygonRadius"]')?.value || "4" },
      { name: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1, value: card.querySelector('[data-graph-field="polygonRotation"]')?.value || "90" },
      { name: "stroke", label: "Line color", type: "color", value: "#145c63" },
      { name: "fill", label: "Fill color", type: "color", value: "#e8f7f9" },
      { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: 2 },
      { name: "label", label: "Label", type: "text", value: "Regular polygon", full: true },
      { name: "showApothem", label: "Show apothem", type: "checkbox", value: Boolean(card.querySelector('[data-graph-field="showApothem"]')?.checked) }
    ]
  }).then((result) => {
    if (!result) {
      setToolToSelection(card, question, current);
      return;
    }

    const settings = {
      sides: Math.max(3, Math.round(Number(result.sides) || 6)),
      radius: Math.max(0.1, Number(result.radius) || 4),
      rotation: Number(result.rotation) || 0,
      showApothem: Boolean(result.showApothem),
      stroke: isHexColor(result.stroke) ? result.stroke : "#145c63",
      fill: isHexColor(result.fill) ? result.fill : "#e8f7f9",
      lineWidth: parseNumberOrDefault(result.lineWidth, 2),
      label: String(result.label || "Regular polygon")
    };

    setHiddenGraphField(card, "graphType", "polygon");
    setHiddenGraphField(card, "polygonSides", settings.sides);
    setHiddenGraphField(card, "polygonRadius", settings.radius);
    setHiddenGraphField(card, "polygonRotation", settings.rotation);
    setHiddenGraphField(card, "showApothem", settings.showApothem);
    diagramConstructionByQuestionId.set(question.id, { tool: "polygon", settings });

    const next = normalizeGraph({ ...current, graphType: "polygon" });
    graphDrafts.set(question.id, next);
    updateGraphFieldVisibility(card, "polygon");
    updateDiagramToolHint(card, next);
    drawGraphDraftOnCard(card, next);
  });
}

function handlePolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) center = snapGraphPoint(center, meta);

  const construction = diagramConstructionByQuestionId.get(question.id);
  const settings = construction?.tool === "polygon" ? construction.settings || {} : {};
  const sides = parseNumberOrDefault(settings.sides ?? card.querySelector('[data-graph-field="polygonSides"]')?.value, 6);
  const radius = parseNumberOrDefault(settings.radius ?? card.querySelector('[data-graph-field="polygonRadius"]')?.value, 4);
  const rotation = parseNumberOrDefault(settings.rotation ?? card.querySelector('[data-graph-field="polygonRotation"]')?.value, 90);
  const showApothem = Boolean(settings.showApothem ?? card.querySelector('[data-graph-field="showApothem"]')?.checked);

  pushDiagramHistory(question.id, values);
  values.graphType = "polygon";
  const shape = normalizeShape({
    id: nextShapeId(values, "regularPolygon"),
    type: "regularPolygon",
    sides,
    radius,
    rotation,
    centerX: roundGraphCoordinate(center.x),
    centerY: roundGraphCoordinate(center.y),
    showApothem,
    label: settings.label || `${Math.round(sides)}-gon`,
    stroke: settings.stroke || "#145c63",
    fill: settings.fill || "#e8f7f9",
    lineWidth: settings.lineWidth || 2
  }, values.shapes.length);
  values.shapes.push(shape);

  setHiddenGraphField(card, "graphType", "polygon");
  graphDrafts.set(question.id, normalizeGraph(values));
  updateGraphFieldVisibility(card, "polygon");
  renderAllPreviewsDebounced();
  setToolToSelection(card, question, values, `shape:${shape.id}`);
}

function handleCircleToolClick(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  let construction = diagramConstructionByQuestionId.get(question.id);

  if (!construction || construction.tool !== "circle") {
    diagramConstructionByQuestionId.set(question.id, { tool: "circle", center: point });
    updateDiagramToolHint(card, values);
    drawGraphDraftOnCard(card, values);
    return;
  }

  pushDiagramHistory(question.id, values);
  const radius = Math.max(0.1, Math.hypot(point.x - construction.center.x, point.y - construction.center.y));
  const shape = normalizeShape({
    id: nextShapeId(values, "circle"),
    type: "circle",
    center: construction.center,
    radius,
    label: "Circle"
  }, values.shapes.length);
  values.shapes.push(shape);
  graphDrafts.set(question.id, normalizeGraph(values));
  renderAllPreviewsDebounced();
  setToolToSelection(card, question, values, `shape:${shape.id}`);
}

function handleEllipseToolClick(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  let construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "ellipse") construction = { tool: "ellipse", points: [] };
  construction.points.push(point);
  diagramConstructionByQuestionId.set(question.id, construction);

  if (construction.points.length >= 3) {
    pushDiagramHistory(question.id, values);
    const shape = normalizeShape({
      id: nextShapeId(values, "ellipse"),
      type: "ellipse",
      focus1: construction.points[0],
      focus2: construction.points[1],
      through: construction.points[2],
      label: "Ellipse"
    }, values.shapes.length);
    values.shapes.push(shape);
    graphDrafts.set(question.id, normalizeGraph(values));
    renderAllPreviewsDebounced();
    setToolToSelection(card, question, values, `shape:${shape.id}`);
    return;
  }
  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function handleTemplateShapeClick(card, question, values, meta, canvasX, canvasY, type) {
  let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) center = snapGraphPoint(center, meta);
  pushDiagramHistory(question.id, values);
  const shape = normalizeShape({
    id: nextShapeId(values, type),
    type,
    label: type === "trapezoid" ? "Trapezoid" : "Parallelogram",
    points: type === "trapezoid" ? makeTrapezoidPoints(center) : makeParallelogramPoints(center)
  }, values.shapes.length);
  values.shapes.push(shape);
  graphDrafts.set(question.id, normalizeGraph(values));
  renderAllPreviewsDebounced();
  setToolToSelection(card, question, values, `shape:${shape.id}`);
}

function handleAngleToolClick(card, question, values, meta, canvasX, canvasY) {
  const clickedPoint = findClickedPoint(values, meta, canvasX, canvasY);
  if (!clickedPoint) return;
  const label = sanitizeGraphLabel(clickedPoint.point.label);
  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  selection.push(label);
  diagramSelectionByQuestionId.set(question.id, selection);

  if (selection.length >= 3) {
    const [from, vertex, to] = selection;
    if (from !== vertex && vertex !== to && from !== to) {
      pushDiagramHistory(question.id, values);
      const angle = { from, vertex, to, labelMode: "name", visible: true, color: "#145c63" };
      values.angles.push(angle);
      diagramSelectionByQuestionId.delete(question.id);
      graphDrafts.set(question.id, normalizeGraph(values));
      renderAllPreviewsDebounced();
      setToolToSelection(card, question, values, getAngleObjectId(angle));
      return;
    }
    diagramSelectionByQuestionId.delete(question.id);
  }

  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function handleIrregularPolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  let construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "irregular-polygon") {
    configureIrregularPolygonTool(question);
    return;
  }

  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  construction.points.push({ x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) });
  diagramConstructionByQuestionId.set(question.id, construction);

  if (construction.points.length >= construction.targetSides) {
    pushDiagramHistory(question.id, values);
    const shape = normalizeShape({
      id: nextShapeId(values, "irregularPolygon"),
      type: "irregularPolygon",
      label: "Irregular polygon",
      points: construction.points
    }, values.shapes.length);
    values.shapes.push(shape);
    diagramConstructionByQuestionId.delete(question.id);
    graphDrafts.set(question.id, normalizeGraph(values));
    renderAllPreviewsDebounced();
    setToolToSelection(card, question, values, `shape:${shape.id}`);
    return;
  }

  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function handleQuestionDoubleClick(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;
  const pointer = getCanvasPointer(event, canvas);
  const values = getGraphValuesFromCard(card);
  const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
  if (!hit) return;
  diagramObjectSelectionByQuestionId.set(question.id, hit.id);
  setActiveDiagramTool(question.id, "select");
  updateDiagramToolButtons(card, "select");
  drawGraphDraftOnCard(card, values);
  editDiagramObjectPropertiesAsync(card, question, values, hit.id);
}

function editDiagramObjectPropertiesAsync(card, question, graph, objectId) {
  const hit = getDiagramObjectById(graph, objectId);
  if (!hit) return;
  const obj = hit.ref;
  const commonColor = obj.color || obj.stroke || "#145c63";
  const commonWidth = obj.lineWidth || 2;
  const fields = [];

  if (hit.kind === "point") {
    fields.push(
      { name: "label", label: "Point label", type: "text", value: obj.label || "" },
      { name: "color", label: "Point color", type: "color", value: obj.color || "#145c63" },
      { name: "size", label: "Point size", type: "number", min: 2, max: 24, step: 1, value: obj.size || 5 },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
  } else if (hit.kind === "segment") {
    fields.push(
      { name: "labelMode", label: "Label", type: "select", value: obj.labelMode || "name", options: [
        { value: "name", label: "Name" }, { value: "length", label: "Length" }, { value: "variable", label: "Variable x" }, { value: "hidden", label: "Hidden" }
      ]},
      { name: "color", label: "Line color", type: "color", value: commonColor },
      { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: commonWidth },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
  } else if (hit.kind === "angle") {
    fields.push(
      { name: "labelMode", label: "Label", type: "select", value: obj.labelMode || "name", options: [
        { value: "name", label: "∠ABC" }, { value: "value", label: "Value" }, { value: "variable", label: "Variable x" }, { value: "blank", label: "Blank with arc" }, { value: "none", label: "No label or arc" }
      ]},
      { name: "color", label: "Arc color", type: "color", value: obj.color || "#145c63" },
      { name: "radius", label: "Arc radius", type: "number", min: 8, max: 80, step: 1, value: obj.radius || 22 },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
  } else if (hit.kind === "shape") {
    fields.push(
      { name: "label", label: "Object label", type: "text", value: obj.label || "", full: true },
      { name: "stroke", label: "Line color", type: "color", value: obj.stroke || "#145c63" },
      { name: "fill", label: "Fill color", type: "color", value: obj.fill || "#e8f7f9" },
      { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: obj.lineWidth || 2 },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
    if (obj.type === "circle") fields.push({ name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: obj.radius || 1 });
    if (obj.type === "regularPolygon") {
      fields.push(
        { name: "sides", label: "Sides", type: "number", min: 3, max: 40, step: 1, value: obj.sides || 6 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: obj.radius || 4 },
        { name: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1, value: obj.rotation || 90 },
        { name: "showApothem", label: "Show apothem", type: "checkbox", value: obj.showApothem }
      );
    }
  } else if (hit.kind === "function") {
    fields.push(
      { name: "expression", label: "Function: y =", type: "text", value: graph.expression || "", full: true },
      { name: "functionStroke", label: "Trace color", type: "color", value: graph.functionStroke || "#145c63" },
      { name: "functionLineWidth", label: "Trace thickness", type: "number", min: 1, max: 12, step: 0.5, value: graph.functionLineWidth || 2.5 },
      { name: "functionDash", label: "Trace type", type: "select", value: graph.functionDash || "solid", options: [
        { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
      ]},
      { name: "functionLabel", label: "Function label", type: "text", value: graph.functionLabel || graph.title || "", full: true },
      { name: "functionVisible", label: "Visible", type: "checkbox", value: graph.functionVisible !== false }
    );
  }

  openDiagramDialog({
    title: "Object properties",
    description: "Adjust this object's visual style and label.",
    fields
  }).then((result) => {
    if (!result) return;
    pushDiagramHistory(question.id, graph);

    if (hit.kind === "point") {
      const newLabel = sanitizeGraphLabel(result.label) || obj.label;
      renamePoint(graph, obj.label, newLabel);
      obj.color = isHexColor(result.color) ? result.color : obj.color;
      obj.size = parseNumberOrDefault(result.size, obj.size || 5);
      obj.visible = Boolean(result.visible);
    } else if (hit.kind === "segment") {
      obj.labelMode = result.labelMode || obj.labelMode;
      obj.color = isHexColor(result.color) ? result.color : obj.color;
      obj.lineWidth = parseNumberOrDefault(result.lineWidth, obj.lineWidth || 2);
      obj.visible = Boolean(result.visible);
    } else if (hit.kind === "angle") {
      obj.labelMode = result.labelMode || obj.labelMode;
      obj.color = isHexColor(result.color) ? result.color : obj.color;
      obj.radius = parseNumberOrDefault(result.radius, obj.radius || 22);
      obj.visible = Boolean(result.visible);
    } else if (hit.kind === "shape") {
      obj.label = String(result.label || obj.label || "").trim();
      obj.stroke = isHexColor(result.stroke) ? result.stroke : obj.stroke;
      obj.fill = isHexColor(result.fill) ? result.fill : obj.fill;
      obj.lineWidth = parseNumberOrDefault(result.lineWidth, obj.lineWidth || 2);
      obj.visible = Boolean(result.visible);
      if (obj.type === "circle") obj.radius = Math.max(0.1, parseNumberOrDefault(result.radius, obj.radius || 1));
      if (obj.type === "regularPolygon") {
        obj.sides = Math.max(3, Math.round(Number(result.sides) || obj.sides || 6));
        obj.radius = Math.max(0.1, parseNumberOrDefault(result.radius, obj.radius || 4));
        obj.rotation = parseNumberOrDefault(result.rotation, obj.rotation || 90);
        obj.showApothem = Boolean(result.showApothem);
      }
    } else if (hit.kind === "function") {
      graph.expression = String(result.expression || "");
      graph.functionStroke = isHexColor(result.functionStroke) ? result.functionStroke : "#145c63";
      graph.functionLineWidth = parseNumberOrDefault(result.functionLineWidth, 2.5);
      graph.functionDash = ["solid", "dashed", "dotted"].includes(result.functionDash) ? result.functionDash : "solid";
      graph.functionLabel = String(result.functionLabel || "");
      graph.title = graph.functionLabel || graph.title;
      graph.functionVisible = Boolean(result.functionVisible);
    }

    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
}

function getDiagramObjectById(graph, objectId) {
  if (String(objectId) === "function:main" && graph.expression) return { kind: "function", ref: graph };
  const [kind, ...rest] = String(objectId).split(":");
  if (kind === "point") {
    const ref = graph.points.find((point) => point.label === rest[0]);
    return ref ? { kind, ref } : null;
  }
  if (kind === "segment") {
    const ref = graph.segments.find((segment) => getSegmentObjectId(segment) === objectId);
    return ref ? { kind, ref } : null;
  }
  if (kind === "angle") {
    const ref = graph.angles.find((angle) => getAngleObjectId(angle) === objectId);
    return ref ? { kind, ref } : null;
  }
  if (kind === "shape") {
    const ref = graph.shapes.find((shape) => shape.id === rest.join(":"));
    return ref ? { kind, ref } : null;
  }
  return null;
}

function findClickedDiagramObject(graph, meta, clickX, clickY) {
  const normalized = normalizeGraph(graph);
  const pointHit = findClickedPoint(normalized, meta, clickX, clickY);
  if (pointHit?.source === "manual") return { id: `point:${pointHit.point.label}`, kind: "point", ref: pointHit.point };
  const angleHit = findClickedAngle(normalized, meta, clickX, clickY);
  if (angleHit) return { id: getAngleObjectId(angleHit.angle), kind: "angle", ref: angleHit.angle };
  const segmentHit = findClickedSegment(normalized, meta, clickX, clickY);
  if (segmentHit && !segmentHit.segment.polygon) return { id: getSegmentObjectId(segmentHit.segment), kind: "segment", ref: segmentHit.segment };
  const shapeHit = findClickedShape(normalized, meta, clickX, clickY);
  if (shapeHit) return shapeHit;
  if (normalized.expression) {
    const distance = distanceToFunctionCurve(normalized, meta, clickX, clickY);
    if (distance <= 10) return { id: "function:main", kind: "function", ref: normalized };
  }
  return null;
}

function distanceToFunctionCurve(graph, meta, clickX, clickY) {
  if (!graph.expression) return Infinity;
  try {
    const fn = compileExpression(graph.expression);
    let best = Infinity;
    const samples = 250;
    for (let i = 0; i <= samples; i += 1) {
      const x = meta.xMin + ((meta.xMax - meta.xMin) * i) / samples;
      const y = fn(x);
      if (!Number.isFinite(y)) continue;
      const p = meta.toPx(x, y);
      best = Math.min(best, Math.hypot(clickX - p.px, clickY - p.py));
    }
    return best;
  } catch (_) {
    return Infinity;
  }
}

function drawCurve(ctx, points, meta) {
  const { toPx, yMin, yMax, plotHeight, graph } = meta;
  let started = false;
  let previous = null;

  ctx.save();
  ctx.strokeStyle = graph?.functionStroke || "#145c63";
  ctx.lineWidth = graph?.functionLineWidth || 2.35;
  if (graph?.functionDash === "dashed") ctx.setLineDash([8, 6]);
  if (graph?.functionDash === "dotted") ctx.setLineDash([2, 6]);
  ctx.beginPath();

  points.forEach((point) => {
    if (!Number.isFinite(point.y) || point.y < yMin - Math.abs(yMax - yMin) || point.y > yMax + Math.abs(yMax - yMin)) {
      started = false;
      previous = null;
      return;
    }
    const current = toPx(point.x, point.y);
    const jumpIsTooLarge = previous && Math.abs(current.py - previous.py) > plotHeight * 0.85;
    if (!started || jumpIsTooLarge) {
      ctx.moveTo(current.px, current.py);
      started = true;
    } else {
      ctx.lineTo(current.px, current.py);
    }
    previous = current;
  });

  ctx.stroke();
  ctx.setLineDash([]);

  if (graph?.functionLabel && points.length) {
    const visible = points.filter((point) => Number.isFinite(point.y) && point.y >= yMin && point.y <= yMax);
    const anchor = visible[Math.floor(visible.length * 0.72)] || visible[visible.length - 1];
    if (anchor) {
      const p = toPx(anchor.x, anchor.y);
      drawTextWithHalo(ctx, graph.functionLabel, p.px + 10, p.py - 10);
    }
  }
  ctx.restore();
}

function drawInteractionPreview(ctx, meta, canvas) {
  const preview = canvas.__interactionPreview;
  if (!preview?.visible || !preview.point) return;

  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const construction = question ? diagramConstructionByQuestionId.get(question.id) : null;
  const tool = preview.tool;
  const point = preview.point;
  const { px, py } = meta.toPx(point.x, point.y);

  ctx.save();
  ctx.strokeStyle = "rgba(20, 92, 99, 0.70)";
  ctx.fillStyle = "rgba(20, 92, 99, 0.12)";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 5]);

  if (preview.snap) {
    const xAxisY = meta.yMin <= 0 && meta.yMax >= 0 ? meta.toPx(meta.xMin, 0).py : meta.padding.top + meta.plotHeight;
    const yAxisX = meta.xMin <= 0 && meta.xMax >= 0 ? meta.toPx(0, meta.yMin).px : meta.padding.left;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, xAxisY);
    ctx.moveTo(px, py);
    ctx.lineTo(yAxisX, py);
    ctx.stroke();
  }

  if (tool === "polygon") {
    const settings = construction?.tool === "polygon" ? construction.settings || {} : {};
    const sides = Math.max(3, Math.round(Number(settings.sides) || 6));
    const radius = Math.max(0.1, Number(settings.radius) || 4);
    const rotation = Number(settings.rotation) || 90;
    const polygon = normalizeShape({ type: "regularPolygon", centerX: point.x, centerY: point.y, sides, radius, rotation, showApothem: settings.showApothem, stroke: settings.stroke, fill: settings.fill, lineWidth: settings.lineWidth });
    const pts = getRegularPolygonPoints(polygon);
    ghostClosedShape(ctx, meta, pts);
  } else if (tool === "circle") {
    if (construction?.tool === "circle" && construction.center) {
      const c = meta.toPx(construction.center.x, construction.center.y);
      const r = Math.hypot(px - c.px, py - c.py);
      ctx.beginPath();
      ctx.arc(c.px, c.py, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c.px, c.py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tool === "ellipse") {
    if (construction?.tool === "ellipse" && Array.isArray(construction.points)) {
      const pts = construction.points;
      pts.forEach((p0) => {
        const q = meta.toPx(p0.x, p0.y);
        ctx.beginPath();
        ctx.arc(q.px, q.py, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      if (pts.length === 1) {
        const a = meta.toPx(pts[0].x, pts[0].y);
        ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(px, py); ctx.stroke();
      }
      if (pts.length >= 2) {
        const ghost = normalizeShape({ type: "ellipse", focus1: pts[0], focus2: pts[1], through: point });
        const params = getEllipseParams(ghost);
        if (params) {
          const c = meta.toPx(params.cx, params.cy);
          const rx = Math.abs(meta.toPx(params.cx + params.a, params.cy).px - c.px);
          const ry = Math.abs(meta.toPx(params.cx, params.cy + params.b).py - c.py);
          ctx.save();
          ctx.translate(c.px, c.py);
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.restore();
          ctx.stroke();
        }
      }
    }
  } else if (tool === "trapezoid" || tool === "parallelogram") {
    const pts = tool === "trapezoid" ? makeTrapezoidPoints(point) : makeParallelogramPoints(point);
    ghostClosedShape(ctx, meta, pts);
  } else if (tool === "irregular-polygon") {
    const pts = construction?.tool === "irregular-polygon" ? construction.points || [] : [];
    if (pts.length) {
      ctx.beginPath();
      const first = meta.toPx(pts[0].x, pts[0].y);
      ctx.moveTo(first.px, first.py);
      pts.slice(1).forEach((p0) => { const q = meta.toPx(p0.x, p0.y); ctx.lineTo(q.px, q.py); });
      ctx.lineTo(px, py);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "600 11px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  drawTextWithHalo(ctx, `(${roundGraphCoordinate(point.x)}, ${roundGraphCoordinate(point.y)})`, px + 10, py - 9);
  ctx.restore();
}

function ghostClosedShape(ctx, meta, points) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.beginPath();
  const first = meta.toPx(points[0].x, points[0].y);
  ctx.moveTo(first.px, first.py);
  points.slice(1).forEach((point) => {
    const p = meta.toPx(point.x, point.y);
    ctx.lineTo(p.px, p.py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  points.forEach((point) => {
    const p = meta.toPx(point.x, point.y);
    ctx.beginPath();
    ctx.arc(p.px, p.py, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updateDiagramToolHint(card, graph) {
  const hint = card.querySelector("[data-diagram-tool-hint]");
  if (!hint) return;
  const questionId = card.dataset.questionId;
  const tool = getActiveDiagramTool(questionId);
  const selection = diagramSelectionByQuestionId.get(questionId) || [];
  const construction = diagramConstructionByQuestionId.get(questionId);
  const messages = {
    point: "Point: click the diagram to insert a point. Turn on Stick to preview snapped placement.",
    segment: selection.length ? `Segment: selected ${selection.join(" → ")}. Click another point.` : "Segment: click two points to create one independent segment.",
    polygon: "Regular polygon: configure it, then click the diagram to place its center.",
    "irregular-polygon": construction?.tool === "irregular-polygon" ? `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.` : "Irregular polygon: choose the number of sides, then click each vertex.",
    circle: construction?.tool === "circle" ? "Circle: center selected. Move the cursor to preview radius, then click the circumference." : "Circle: click the center, then click a point on the circumference.",
    ellipse: construction?.tool === "ellipse" ? `Ellipse: ${construction.points.length}/3 construction points selected.` : "Ellipse: click focus 1, focus 2, then a point on the ellipse.",
    trapezoid: "Trapezoid: click to insert an editable trapezoid template, then adjust with Selection or Move point.",
    parallelogram: "Parallelogram: click to insert an editable parallelogram template, then adjust with Selection or Move point.",
    angle: selection.length ? `Angle: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle: click three points to mark an angle.",
    function: "Function: configure the expression and style in the dialog.",
    select: "Selection: click an object to select it; double-click it to edit properties.",
    "move-point": "Move point: drag any manual point or shape handle.",
    erase: "Eraser: click an object to remove it."
  };
  hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
}



/* ===== First-stage interaction patch ===== */
function initialize() {
  state.title = "Algebra 1 Checkpoint";
  state.subject = "Algebra 1";
  state.instructions = "Answer each question. For multiple-choice questions, select one option. For written answers, show your reasoning when possible.";
  state.questions = [];
  graphDrafts.clear();
  diagramToolByQuestionId.clear();
  diagramSelectionByQuestionId.clear();
  diagramObjectSelectionByQuestionId.clear();
  diagramConstructionByQuestionId.clear();
  diagramHistoryByQuestionId.clear();

  state.questions.push(createQuestion({
    prompt: "What is the solution of $x^2=4$?",
    options: ["$x=2$ only", "$x=-2$ only", "$x=-2$ or $x=2$", "No real solution"],
    correctOptionIndex: 2,
    correctOptionIndexes: [2],
    answer: "Both $-2$ and $2$ solve the equation because $(-2)^2=4$ and $2^2=4$.",
    graph: null,
    collapsed: false
  }));

  bindEvents();
  syncInputsFromState();
  renderQuestions();
  renderAllPreviews();
}

function drawEmptyGraph(canvas, rawGraph = {}) {
  const clean = normalizeGraph({
    graphType: "points",
    displayMode: rawGraph.displayMode || "coordinate",
    title: rawGraph.title || "",
    expression: "",
    pointsText: "",
    points: [],
    segments: [],
    angles: [],
    regularPolygon: null,
    shapes: [],
    autoFit: rawGraph.autoFit !== false,
    snapToGrid: Boolean(rawGraph.snapToGrid),
    xMin: Number.isFinite(Number(rawGraph.xMin)) ? Number(rawGraph.xMin) : -10,
    xMax: Number.isFinite(Number(rawGraph.xMax)) ? Number(rawGraph.xMax) : 10,
    yMin: rawGraph.yMin === "" ? -10 : Number.isFinite(Number(rawGraph.yMin)) ? Number(rawGraph.yMin) : -10,
    yMax: rawGraph.yMax === "" ? 10 : Number.isFinite(Number(rawGraph.yMax)) ? Number(rawGraph.yMax) : 10
  });
  drawGraph(canvas, clean);
}

function normalizeShapePoint(point, fallback = { x: 0, y: 0 }) {
  const x = Number(point?.x ?? fallback.x);
  const y = Number(point?.y ?? fallback.y);
  const normalized = {
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y
  };
  if (point && point.label) normalized.label = sanitizeGraphLabel(point.label);
  if (point && point.color && isHexColor(point.color)) normalized.color = point.color;
  if (point && Number.isFinite(Number(point.size))) normalized.size = Number(point.size);
  return normalized;
}

function normalizeShape(shape, index = 0) {
  if (!shape || typeof shape !== "object") return null;
  const type = ["regularPolygon", "irregularPolygon", "circle", "ellipse", "trapezoid", "parallelogram"].includes(shape.type)
    ? shape.type
    : "irregularPolygon";

  const base = {
    id: sanitizeObjectId(shape.id || `${type}-${index + 1}`),
    type,
    label: String(shape.label || shape.name || getDefaultShapeLabel(type, index)).trim(),
    visible: shape.visible !== false,
    stroke: isHexColor(shape.stroke) ? shape.stroke : "#145c63",
    fill: isHexColor(shape.fill) ? shape.fill : "#e8f7f9",
    lineWidth: Number.isFinite(Number(shape.lineWidth)) ? Math.max(1, Number(shape.lineWidth)) : 2,
    lineDash: ["solid", "dashed", "dotted"].includes(shape.lineDash) ? shape.lineDash : "solid"
  };

  if (type === "regularPolygon") {
    const sides = Math.max(3, Math.floor(parseNumberOrDefault(shape.sides, 3)));
    const vertexLabels = Array.isArray(shape.vertexLabels)
      ? shape.vertexLabels.map(sanitizeGraphLabel).filter(Boolean).slice(0, sides)
      : [];
    return {
      ...base,
      sides,
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 4)),
      rotation: parseNumberOrDefault(shape.rotation, 90),
      centerX: parseNumberOrDefault(shape.centerX, 0),
      centerY: parseNumberOrDefault(shape.centerY, 0),
      showApothem: Boolean(shape.showApothem),
      vertexLabels,
      segmentLabelModes: shape.segmentLabelModes && typeof shape.segmentLabelModes === "object" ? { ...shape.segmentLabelModes } : {}
    };
  }

  if (type === "circle") {
    return {
      ...base,
      center: normalizeShapePoint(shape.center, { x: 0, y: 0 }),
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 1))
    };
  }

  if (type === "ellipse") {
    return {
      ...base,
      focus1: normalizeShapePoint(shape.focus1, { x: -1, y: 0 }),
      focus2: normalizeShapePoint(shape.focus2, { x: 1, y: 0 }),
      through: normalizeShapePoint(shape.through, { x: 0, y: 1 })
    };
  }

  const points = Array.isArray(shape.points)
    ? shape.points.map((point) => normalizeShapePoint(point)).filter(Boolean)
    : [];

  return {
    ...base,
    points,
    targetSides: type === "irregularPolygon" ? Math.max(3, Math.floor(parseNumberOrDefault(shape.targetSides, points.length || 3))) : undefined
  };
}

function getRegularPolygonPoints(polygon) {
  const sides = Math.max(3, Math.floor(Number(polygon?.sides) || 3));
  const radius = Math.max(0.1, Number(polygon?.radius) || 4);
  const rotation = ((Number(polygon?.rotation) || 0) * Math.PI) / 180;
  const centerX = Number(polygon?.centerX) || 0;
  const centerY = Number(polygon?.centerY) || 0;
  const labels = Array.isArray(polygon?.vertexLabels) ? polygon.vertexLabels : [];

  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (index * 2 * Math.PI) / sides;
    return {
      label: sanitizeGraphLabel(labels[index] || `P${index}`),
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      labelDx: 8,
      labelDy: -7,
      color: polygon?.stroke || "#145c63",
      size: 4,
      visible: polygon?.visible !== false
    };
  });
}

function collectUsedPointLabels(graph = {}) {
  const normalized = graph && graph.points !== undefined ? graph : normalizeGraph(graph || {});
  const labels = new Set();
  const add = (value) => {
    const label = sanitizeGraphLabel(value);
    if (label) labels.add(label.toLowerCase());
  };
  (normalized.points || []).forEach((point) => add(point.label));
  if (normalized.regularPolygon?.vertexLabels) normalized.regularPolygon.vertexLabels.forEach(add);
  (normalized.shapes || []).forEach((shape) => {
    if (shape.type === "regularPolygon") {
      (shape.vertexLabels || []).forEach(add);
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      (shape.points || []).forEach((point) => add(point.label));
    }
  });
  return labels;
}

function nextPointLabelForGraph(graph, prefix = "P") {
  const used = collectUsedPointLabels(graph);
  let index = 0;
  let label = `${prefix}${index}`;
  while (used.has(label.toLowerCase())) {
    index += 1;
    label = `${prefix}${index}`;
  }
  return label;
}

function nextPointLabelsForGraph(graph, count, prefix = "P") {
  const labels = [];
  const used = collectUsedPointLabels(graph);
  let index = 0;
  while (labels.length < count) {
    const label = `${prefix}${index}`;
    if (!used.has(label.toLowerCase())) {
      labels.push(label);
      used.add(label.toLowerCase());
    }
    index += 1;
  }
  return labels;
}

function nextPointLabel(points) {
  const used = new Set((Array.isArray(points) ? points : []).map((point) => sanitizeGraphLabel(point.label).toLowerCase()).filter(Boolean));
  let index = 0;
  let label = `P${index}`;
  while (used.has(label.toLowerCase())) {
    index += 1;
    label = `P${index}`;
  }
  return label;
}

function applyCanvasLineDash(ctx, dash) {
  if (dash === "dashed") ctx.setLineDash([8, 6]);
  else if (dash === "dotted") ctx.setLineDash([2, 6]);
  else ctx.setLineDash([]);
}

function drawClosedPointShape(ctx, shape, meta) {
  const points = shape.points || [];
  if (points.length < 2) return;
  ctx.save();
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.42);
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.lineWidth = shape.lineWidth || 2;
  applyCanvasLineDash(ctx, shape.lineDash);
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
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCircleShape(ctx, shape, meta) {
  const center = meta.toPx(shape.center.x, shape.center.y);
  const edge = meta.toPx(shape.center.x + shape.radius, shape.center.y);
  const r = Math.abs(edge.px - center.px);
  ctx.save();
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.25);
  ctx.lineWidth = shape.lineWidth || 2;
  applyCanvasLineDash(ctx, shape.lineDash);
  ctx.beginPath();
  ctx.arc(center.px, center.py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  if (shape.label) drawTextWithHalo(ctx, shape.label, center.px + r + 8, center.py);
  ctx.restore();
}

function drawEllipseShape(ctx, shape, meta) {
  const params = getEllipseParams(shape);
  if (!params) return;
  const center = meta.toPx(params.cx, params.cy);
  const edgeA = meta.toPx(params.cx + params.a, params.cy);
  const edgeB = meta.toPx(params.cx, params.cy + params.b);
  const rx = Math.abs(edgeA.px - center.px);
  const ry = Math.abs(edgeB.py - center.py);
  ctx.save();
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.25);
  ctx.lineWidth = shape.lineWidth || 2;
  applyCanvasLineDash(ctx, shape.lineDash);
  ctx.translate(center.px, center.py);
  ctx.rotate(params.rotation);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPolygon(ctx, points, meta, polygon = {}) {
  if (!Array.isArray(points) || points.length < 3) return;
  ctx.save();
  ctx.fillStyle = hexToRgba(polygon.fill || "#e8f7f9", 0.42);
  ctx.strokeStyle = polygon.stroke || "#145c63";
  ctx.lineWidth = polygon.lineWidth || 2.2;
  applyCanvasLineDash(ctx, polygon.lineDash);
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
  ctx.setLineDash([]);
  ctx.restore();
  drawPoints(ctx, points, meta);
}

function findPointByLabelInGraph(graph, label) {
  const cleanLabel = sanitizeGraphLabel(label).toLowerCase();
  if (!cleanLabel) return null;
  const manual = (graph.points || []).find((point) => point.visible !== false && sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
  if (manual) return manual;

  const polygonPoints = graph.regularPolygon?.visible !== false ? getRegularPolygonPoints(graph.regularPolygon) : [];
  const legacy = polygonPoints.find((point) => sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
  if (legacy) return legacy;

  for (const shape of (graph.shapes || []).filter((item) => item.visible !== false)) {
    if (shape.type === "regularPolygon") {
      const found = getRegularPolygonPoints(shape).find((point) => sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
      if (found) return found;
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      const found = (shape.points || []).find((point) => sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
      if (found) return found;
    }
  }
  return null;
}

function findClickedPoint(graph, meta, clickX, clickY) {
  const hitRadius = 11;
  for (let index = 0; index < (graph.points || []).length; index += 1) {
    const point = graph.points[index];
    if (point.visible === false) continue;
    const { px, py } = meta.toPx(point.x, point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) return { point, index, source: "manual", id: `point:${point.label}` };
  }

  const polygonPoints = graph.regularPolygon?.visible !== false ? getRegularPolygonPoints(graph.regularPolygon) : [];
  for (let index = 0; index < polygonPoints.length; index += 1) {
    const point = polygonPoints[index];
    const { px, py } = meta.toPx(point.x, point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) return { point, index, source: "polygon", id: `legacyPolygonPoint:${point.label}` };
  }

  for (let shapeIndex = 0; shapeIndex < (graph.shapes || []).length; shapeIndex += 1) {
    const shape = graph.shapes[shapeIndex];
    if (!shape || shape.visible === false) continue;
    const candidates = [];
    if (shape.type === "regularPolygon") {
      getRegularPolygonPoints(shape).forEach((point, pointIndex) => candidates.push({ point, pointIndex, source: "shape", shapeIndex, id: `shapePoint:${shape.id}:${point.label}` }));
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      (shape.points || []).forEach((point, pointIndex) => candidates.push({ point, pointIndex, source: "shape", shapeIndex, id: `shapePoint:${shape.id}:${point.label}` }));
    }
    for (const candidate of candidates) {
      const p = meta.toPx(candidate.point.x, candidate.point.y);
      if (Math.hypot(clickX - p.px, clickY - p.py) <= hitRadius) return candidate;
    }
  }

  return null;
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  pushDiagramHistory(question.id, values);

  const nextPoint = {
    label: nextPointLabelForGraph(values),
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y),
    labelDx: 8,
    labelDy: -7,
    color: "#145c63",
    size: 5,
    visible: true
  };

  const nextGraph = normalizeGraph({
    ...values,
    graphType: values.graphType === "function" ? "points" : values.graphType,
    points: [...values.points, nextPoint]
  });

  updatePointsField(card, nextGraph);
  const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
  if (graphTypeField) graphTypeField.value = nextGraph.graphType;
  graphDrafts.set(question.id, nextGraph);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = `Added point ${nextPoint.label}(${nextPoint.x}, ${nextPoint.y}).`;
    message.classList.remove("error");
  }
}

function setToolToSelection(card, question, graph, objectId = null) {
  setActiveDiagramTool(question.id, "move-point");
  updateDiagramToolButtons(card, "move-point");
  if (objectId) diagramObjectSelectionByQuestionId.set(question.id, objectId);
  diagramSelectionByQuestionId.delete(question.id);
  diagramConstructionByQuestionId.delete(question.id);
  graphDrafts.set(question.id, normalizeGraph(graph));
  drawGraphDraftOnCard(card, graph);
  updateDiagramToolHint(card, graph);
}

function setToolToMovePoint(card, question, graph, objectId = null) {
  setToolToSelection(card, question, graph, objectId);
}

function getShapeStyleFields(defaults = {}) {
  return [
    { name: "label", label: "General label", type: "text", value: defaults.label || "", full: true },
    { name: "stroke", label: "Outline color", type: "color", value: defaults.stroke || "#145c63" },
    { name: "fill", label: "Fill color", type: "color", value: defaults.fill || "#e8f7f9" },
    { name: "lineDash", label: "Outline type", type: "select", value: defaults.lineDash || "solid", options: [
      { value: "solid", label: "Continuous" },
      { value: "dashed", label: "Dashed" },
      { value: "dotted", label: "Dotted" }
    ]},
    { name: "lineWidth", label: "Outline width", type: "number", min: 1, max: 12, step: 0.5, value: defaults.lineWidth || 2 }
  ];
}

function parseShapeStyle(result, fallback = {}) {
  return {
    label: String(result.label || fallback.label || "").trim(),
    stroke: isHexColor(result.stroke) ? result.stroke : (fallback.stroke || "#145c63"),
    fill: isHexColor(result.fill) ? result.fill : (fallback.fill || "#e8f7f9"),
    lineDash: ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : (fallback.lineDash || "solid"),
    lineWidth: parseNumberOrDefault(result.lineWidth, fallback.lineWidth || 2)
  };
}

function configureFunctionTool(card, question, values) {
  const current = normalizeGraph(values || getGraphValuesFromCard(card));
  openDiagramDialog({
    title: "Function settings",
    description: "Define the function, viewing window, and line style. Click OK to draw it on the diagram.",
    fields: [
      { name: "expression", label: "Function: y =", type: "text", value: current.expression || "", full: true },
      { name: "xMin", label: "x min", type: "number", step: 0.1, value: current.xMin ?? -10 },
      { name: "xMax", label: "x max", type: "number", step: 0.1, value: current.xMax ?? 10 },
      { name: "yMin", label: "y min", type: "number", step: 0.1, value: current.yMin === "" ? -10 : current.yMin },
      { name: "yMax", label: "y max", type: "number", step: 0.1, value: current.yMax === "" ? 10 : current.yMax },
      { name: "functionStroke", label: "Trace color", type: "color", value: current.functionStroke || "#145c63" },
      { name: "functionLineWidth", label: "Trace thickness", type: "number", step: 0.5, min: 1, max: 12, value: current.functionLineWidth || 2.5 },
      { name: "functionDash", label: "Trace type", type: "select", value: current.functionDash || "solid", options: [
        { value: "solid", label: "Continuous" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" }
      ]},
      { name: "functionLabel", label: "Function label", type: "text", value: current.functionLabel || current.title || "", full: true }
    ]
  }).then((result) => {
    if (!result) {
      setToolToMovePoint(card, question, current);
      return;
    }

    setHiddenGraphField(card, "graphType", "function");
    setHiddenGraphField(card, "expression", String(result.expression || ""));
    setHiddenGraphField(card, "xMin", result.xMin ?? -10);
    setHiddenGraphField(card, "xMax", result.xMax ?? 10);
    setHiddenGraphField(card, "yMin", result.yMin ?? -10);
    setHiddenGraphField(card, "yMax", result.yMax ?? 10);
    setHiddenGraphField(card, "functionStroke", result.functionStroke || "#145c63");
    setHiddenGraphField(card, "functionLineWidth", result.functionLineWidth || 2.5);
    setHiddenGraphField(card, "functionDash", result.functionDash || "solid");
    setHiddenGraphField(card, "functionLabel", result.functionLabel || "");
    setHiddenGraphField(card, "title", result.functionLabel || current.title || "Function");

    const next = normalizeGraph({
      ...getGraphValuesFromCard(card),
      graphType: "function",
      expression: String(result.expression || ""),
      title: String(result.functionLabel || current.title || "Function"),
      functionLabel: String(result.functionLabel || ""),
      functionStroke: isHexColor(result.functionStroke) ? result.functionStroke : "#145c63",
      functionLineWidth: parseNumberOrDefault(result.functionLineWidth, 2.5),
      functionDash: ["solid", "dashed", "dotted"].includes(result.functionDash) ? result.functionDash : "solid",
      xMin: parseNumberOrDefault(result.xMin, -10),
      xMax: parseNumberOrDefault(result.xMax, 10),
      yMin: parseOptionalNumber(result.yMin),
      yMax: parseOptionalNumber(result.yMax)
    });

    graphDrafts.set(question.id, next);
    updateGraphFieldVisibility(card, "function");
    drawGraphDraftOnCard(card, next);
    updateDiagramToolHint(card, next);
    renderAllPreviewsDebounced();
    setToolToMovePoint(card, question, next, "function:main");
  });
}

function configureRegularPolygonTool(card, question, values) {
  const current = normalizeGraph(values || getGraphValuesFromCard(card));
  const defaults = { label: "Regular polygon", stroke: "#145c63", fill: "#e8f7f9", lineDash: "solid", lineWidth: 2 };
  openDiagramDialog({
    title: "Regular polygon settings",
    description: "Choose the polygon settings. After clicking OK, click the diagram to place its center.",
    fields: [
      { name: "sides", label: "Number of sides", type: "number", min: 3, max: 40, step: 1, value: card.querySelector('[data-graph-field="polygonSides"]')?.value || "6" },
      { name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: card.querySelector('[data-graph-field="polygonRadius"]')?.value || "4" },
      { name: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1, value: card.querySelector('[data-graph-field="polygonRotation"]')?.value || "90" },
      ...getShapeStyleFields(defaults),
      { name: "showApothem", label: "Show apothem", type: "checkbox", value: Boolean(card.querySelector('[data-graph-field="showApothem"]')?.checked) }
    ]
  }).then((result) => {
    if (!result) {
      setToolToMovePoint(card, question, current);
      return;
    }

    const settings = {
      sides: Math.max(3, Math.round(Number(result.sides) || 6)),
      radius: Math.max(0.1, Number(result.radius) || 4),
      rotation: Number(result.rotation) || 0,
      showApothem: Boolean(result.showApothem),
      ...parseShapeStyle(result, defaults)
    };

    setHiddenGraphField(card, "graphType", "polygon");
    setHiddenGraphField(card, "polygonSides", settings.sides);
    setHiddenGraphField(card, "polygonRadius", settings.radius);
    setHiddenGraphField(card, "polygonRotation", settings.rotation);
    setHiddenGraphField(card, "showApothem", settings.showApothem);
    diagramConstructionByQuestionId.set(question.id, { tool: "polygon", settings });

    const next = normalizeGraph({ ...current, graphType: "polygon" });
    graphDrafts.set(question.id, next);
    updateGraphFieldVisibility(card, "polygon");
    updateDiagramToolHint(card, next);
    drawGraphDraftOnCard(card, next);
  });
}

function configureIrregularPolygonTool(question) {
  const defaults = { label: "Irregular polygon", stroke: "#145c63", fill: "#e8f7f9", lineDash: "solid", lineWidth: 2 };
  openDiagramDialog({
    title: "Irregular polygon settings",
    description: "Choose how many vertices the polygon will have. Then click each vertex on the diagram.",
    fields: [
      { name: "sides", label: "Number of sides", type: "number", min: 3, max: 40, step: 1, value: 3 },
      ...getShapeStyleFields(defaults)
    ]
  }).then((result) => {
    if (!result) return;
    const sides = Math.max(3, Math.round(Number(result.sides) || 3));
    diagramConstructionByQuestionId.set(question.id, {
      tool: "irregular-polygon",
      targetSides: sides,
      points: [],
      settings: parseShapeStyle(result, defaults)
    });
  });
}

function configureGenericShapeTool(card, question, values, tool) {
  const labels = {
    circle: "Circle",
    ellipse: "Ellipse",
    trapezoid: "Trapezoid",
    parallelogram: "Parallelogram"
  };
  const label = labels[tool] || "Shape";
  const defaults = { label, stroke: "#145c63", fill: "#e8f7f9", lineDash: "solid", lineWidth: 2 };
  openDiagramDialog({
    title: `${label} settings`,
    description: tool === "circle"
      ? "Choose the style. Then click the center and one point on the circumference."
      : tool === "ellipse"
        ? "Choose the style. Then click focus 1, focus 2, and one point on the ellipse."
        : "Choose the style. Then click the diagram to insert the editable template.",
    fields: getShapeStyleFields(defaults)
  }).then((result) => {
    if (!result) {
      setToolToMovePoint(card, question, values);
      return;
    }
    diagramConstructionByQuestionId.set(question.id, { tool, settings: parseShapeStyle(result, defaults), points: [] });
    updateDiagramToolHint(card, values);
    drawGraphDraftOnCard(card, values);
  });
}

function shapePointWithLabel(graph, point, label) {
  return {
    ...point,
    label,
    labelDx: 8,
    labelDy: -7,
    color: "#145c63",
    size: 4,
    visible: true
  };
}

function handlePolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) center = snapGraphPoint(center, meta);

  const construction = diagramConstructionByQuestionId.get(question.id);
  const settings = construction?.tool === "polygon" ? construction.settings || {} : {};
  const sides = Math.max(3, Math.round(parseNumberOrDefault(settings.sides ?? card.querySelector('[data-graph-field="polygonSides"]')?.value, 6)));
  const radius = parseNumberOrDefault(settings.radius ?? card.querySelector('[data-graph-field="polygonRadius"]')?.value, 4);
  const rotation = parseNumberOrDefault(settings.rotation ?? card.querySelector('[data-graph-field="polygonRotation"]')?.value, 90);
  const showApothem = Boolean(settings.showApothem ?? card.querySelector('[data-graph-field="showApothem"]')?.checked);
  const vertexLabels = nextPointLabelsForGraph(values, sides);

  pushDiagramHistory(question.id, values);
  values.graphType = "polygon";
  const shape = normalizeShape({
    id: nextShapeId(values, "regularPolygon"),
    type: "regularPolygon",
    sides,
    radius,
    rotation,
    centerX: roundGraphCoordinate(center.x),
    centerY: roundGraphCoordinate(center.y),
    showApothem,
    vertexLabels,
    label: settings.label || `${Math.round(sides)}-gon`,
    stroke: settings.stroke || "#145c63",
    fill: settings.fill || "#e8f7f9",
    lineDash: settings.lineDash || "solid",
    lineWidth: settings.lineWidth || 2
  }, values.shapes.length);
  values.shapes.push(shape);

  setHiddenGraphField(card, "graphType", "polygon");
  graphDrafts.set(question.id, normalizeGraph(values));
  updateGraphFieldVisibility(card, "polygon");
  renderAllPreviewsDebounced();
  setToolToMovePoint(card, question, values, `shape:${shape.id}`);
}

function handleCircleToolClick(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  let construction = diagramConstructionByQuestionId.get(question.id);

  if (!construction || construction.tool !== "circle") {
    construction = { tool: "circle", settings: parseShapeStyle({}, { label: "Circle" }) };
  }

  if (!construction.center) {
    diagramConstructionByQuestionId.set(question.id, { ...construction, center: point });
    updateDiagramToolHint(card, values);
    drawGraphDraftOnCard(card, values);
    return;
  }

  pushDiagramHistory(question.id, values);
  const radius = Math.max(0.1, Math.hypot(point.x - construction.center.x, point.y - construction.center.y));
  const settings = construction.settings || {};
  const shape = normalizeShape({
    id: nextShapeId(values, "circle"),
    type: "circle",
    center: construction.center,
    radius,
    label: settings.label || "Circle",
    stroke: settings.stroke || "#145c63",
    fill: settings.fill || "#e8f7f9",
    lineDash: settings.lineDash || "solid",
    lineWidth: settings.lineWidth || 2
  }, values.shapes.length);
  values.shapes.push(shape);
  graphDrafts.set(question.id, normalizeGraph(values));
  renderAllPreviewsDebounced();
  setToolToMovePoint(card, question, values, `shape:${shape.id}`);
}

function handleEllipseToolClick(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  let construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "ellipse") construction = { tool: "ellipse", points: [], settings: parseShapeStyle({}, { label: "Ellipse" }) };
  if (!Array.isArray(construction.points)) construction.points = [];
  construction.points.push(point);
  diagramConstructionByQuestionId.set(question.id, construction);

  if (construction.points.length >= 3) {
    pushDiagramHistory(question.id, values);
    const settings = construction.settings || {};
    const shape = normalizeShape({
      id: nextShapeId(values, "ellipse"),
      type: "ellipse",
      focus1: construction.points[0],
      focus2: construction.points[1],
      through: construction.points[2],
      label: settings.label || "Ellipse",
      stroke: settings.stroke || "#145c63",
      fill: settings.fill || "#e8f7f9",
      lineDash: settings.lineDash || "solid",
      lineWidth: settings.lineWidth || 2
    }, values.shapes.length);
    values.shapes.push(shape);
    graphDrafts.set(question.id, normalizeGraph(values));
    renderAllPreviewsDebounced();
    setToolToMovePoint(card, question, values, `shape:${shape.id}`);
    return;
  }
  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function handleTemplateShapeClick(card, question, values, meta, canvasX, canvasY, type) {
  let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) center = snapGraphPoint(center, meta);
  pushDiagramHistory(question.id, values);
  const construction = diagramConstructionByQuestionId.get(question.id);
  const settings = construction?.tool === type ? construction.settings || {} : {};
  const rawPoints = type === "trapezoid" ? makeTrapezoidPoints(center) : makeParallelogramPoints(center);
  const labels = nextPointLabelsForGraph(values, rawPoints.length);
  const points = rawPoints.map((point, index) => shapePointWithLabel(values, point, labels[index]));
  const shape = normalizeShape({
    id: nextShapeId(values, type),
    type,
    label: settings.label || (type === "trapezoid" ? "Trapezoid" : "Parallelogram"),
    points,
    stroke: settings.stroke || "#145c63",
    fill: settings.fill || "#e8f7f9",
    lineDash: settings.lineDash || "solid",
    lineWidth: settings.lineWidth || 2
  }, values.shapes.length);
  values.shapes.push(shape);
  graphDrafts.set(question.id, normalizeGraph(values));
  renderAllPreviewsDebounced();
  setToolToMovePoint(card, question, values, `shape:${shape.id}`);
}

function handleIrregularPolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  let construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "irregular-polygon") {
    configureIrregularPolygonTool(question);
    return;
  }

  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  const label = nextPointLabelForGraph({ ...values, shapes: [...(values.shapes || []), { type: "irregularPolygon", points: construction.points || [] }] });
  construction.points.push(shapePointWithLabel(values, { x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) }, label));
  diagramConstructionByQuestionId.set(question.id, construction);

  if (construction.points.length >= construction.targetSides) {
    pushDiagramHistory(question.id, values);
    const settings = construction.settings || {};
    const shape = normalizeShape({
      id: nextShapeId(values, "irregularPolygon"),
      type: "irregularPolygon",
      label: settings.label || "Irregular polygon",
      points: construction.points,
      stroke: settings.stroke || "#145c63",
      fill: settings.fill || "#e8f7f9",
      lineDash: settings.lineDash || "solid",
      lineWidth: settings.lineWidth || 2
    }, values.shapes.length);
    values.shapes.push(shape);
    diagramConstructionByQuestionId.delete(question.id);
    graphDrafts.set(question.id, normalizeGraph(values));
    renderAllPreviewsDebounced();
    setToolToMovePoint(card, question, values, `shape:${shape.id}`);
    return;
  }

  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function handleAngleToolClick(card, question, values, meta, canvasX, canvasY) {
  const clickedPoint = findClickedPoint(values, meta, canvasX, canvasY);
  if (!clickedPoint) return;
  const label = sanitizeGraphLabel(clickedPoint.point.label);
  if (!label) return;
  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  if (selection[selection.length - 1] !== label) selection.push(label);
  diagramSelectionByQuestionId.set(question.id, selection);

  if (selection.length >= 3) {
    const [from, vertex, to] = selection;
    if (from !== vertex && vertex !== to && from !== to) {
      pushDiagramHistory(question.id, values);
      const angle = { from, vertex, to, labelMode: "name", visible: true, color: "#145c63" };
      values.angles.push(angle);
      diagramSelectionByQuestionId.delete(question.id);
      graphDrafts.set(question.id, normalizeGraph(values));
      renderAllPreviewsDebounced();
      setToolToMovePoint(card, question, values, getAngleObjectId(angle));
      return;
    }
    diagramSelectionByQuestionId.delete(question.id);
  }

  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function handleQuestionClick(event) {
  const toolSectionToggle = event.target.closest('[data-action="toggle-tool-section"]');
  if (toolSectionToggle) {
    const section = toolSectionToggle.closest(".diagram-tool-section");
    if (section) {
      const willExpand = section.classList.contains("is-collapsed");
      section.classList.toggle("is-collapsed", !willExpand);
      toolSectionToggle.setAttribute("aria-expanded", String(willExpand));
      const icon = toolSectionToggle.querySelector("span[aria-hidden='true']");
      if (icon) icon.textContent = willExpand ? "▾" : "▸";
    }
    return;
  }

  const visibilityToggle = event.target.closest("[data-diagram-object-visible]");
  if (visibilityToggle) {
    const row = visibilityToggle.closest("[data-diagram-object-id]");
    const card = row?.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question || !row) return;
    const values = getGraphValuesFromCard(card);
    pushDiagramHistory(question.id, values);
    setObjectVisibility(values, row.dataset.diagramObjectId, visibilityToggle.checked);
    graphDrafts.set(question.id, normalizeGraph(values));
    drawGraphDraftOnCard(card, values);
    renderAllPreviewsDebounced();
    return;
  }

  const objectRow = event.target.closest("[data-diagram-object-id]");
  if (objectRow) {
    const card = objectRow.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;
    diagramObjectSelectionByQuestionId.set(question.id, objectRow.dataset.diagramObjectId);
    setActiveDiagramTool(question.id, "select");
    updateDiagramToolButtons(card, "select");
    drawGraphDraftOnCard(card, getGraphValuesFromCard(card));
    return;
  }

  const toolButton = event.target.closest("[data-diagram-tool]");
  if (toolButton) {
    const card = toolButton.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;

    const tool = toolButton.dataset.diagramTool;
    setActiveDiagramTool(question.id, tool);
    updateDiagramToolButtons(card, tool);
    diagramObjectSelectionByQuestionId.delete(question.id);

    const values = getGraphValuesFromCard(card);

    if (tool === "angle") {
      const snapField = card.querySelector('[data-graph-field="snapToGrid"]');
      if (snapField) snapField.checked = true;
      values.snapToGrid = true;
      graphDrafts.set(question.id, normalizeGraph(values));
    }

    if (tool === "polygon") { configureRegularPolygonTool(card, question, values); return; }
    if (tool === "irregular-polygon") { configureIrregularPolygonTool(question); return; }
    if (tool === "function") { configureFunctionTool(card, question, values); return; }
    if (["circle", "ellipse", "trapezoid", "parallelogram"].includes(tool)) { configureGenericShapeTool(card, question, values, tool); return; }

    if (["point", "segment", "angle", "select", "erase", "move-point"].includes(tool)) {
      values.graphType = values.graphType === "function" && tool !== "function" ? "points" : values.graphType;
      const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
      if (graphTypeField) graphTypeField.value = values.graphType;
      graphDrafts.set(question.id, normalizeGraph(values));
      updateGraphFieldVisibility(card, values.graphType);
    }

    updateDiagramToolHint(card, values);
    return;
  }

  const graphCanvas = event.target.closest("[data-editor-graph]");
  if (graphCanvas) {
    handleGraphCanvasClick(event, graphCanvas);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const card = actionButton.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const action = actionButton.dataset.action;

  if (!card || !question) return;

  if (action === "diagram-undo") { undoDiagram(card, question); return; }
  if (action === "diagram-redo") { redoDiagram(card, question); return; }
  if (action === "open-margin-dialog") { openMarginDialog(card, question); return; }
  if (action === "clear-diagram") {
    if (!confirm("Clear every object from this diagram?")) return;
    const values = getGraphValuesFromCard(card);
    pushDiagramHistory(question.id, values);
    const cleared = normalizeGraph({ ...values, points: [], pointsText: "", segments: [], angles: [], regularPolygon: null, shapes: [], expression: "" });
    graphDrafts.set(question.id, cleared);
    diagramObjectSelectionByQuestionId.delete(question.id);
    diagramSelectionByQuestionId.delete(question.id);
    updatePointsField(card, cleared);
    renderGraphDraft(card, question);
    drawGraphDraftOnCard(card, cleared);
    renderAllPreviewsDebounced();
    return;
  }

  if (action === "toggle-question") {
    question.collapsed = !question.collapsed;
    card.classList.toggle("is-collapsed", question.collapsed);
    actionButton.textContent = question.collapsed ? "Maximize" : "Minimize";
    if (!question.collapsed) setTimeout(drawAllGraphs, MOTION.foldMs);
    renderAllPreviewsDebounced();
    return;
  }

  if (action === "toggle-basic" || action === "toggle-image" || action === "toggle-graph") {
    const sectionName = action.replace("toggle-", "");
    const propertyName = `${sectionName}Collapsed`;
    question[propertyName] = !question[propertyName];
    updateFoldState(card, sectionName, question[propertyName]);
    if (sectionName === "graph" && !question[propertyName]) setTimeout(drawAllGraphs, MOTION.foldMs);
    renderAllPreviewsDebounced();
    return;
  }

  if (action === "remove-image") {
    question.imageData = "";
    question.imageAlt = "";
    const upload = card.querySelector('[data-image-upload]');
    const uploadText = card.querySelector("[data-upload-button-text]");
    if (upload) upload.value = "";
    if (uploadText) uploadText.textContent = "Upload image";
    renderImagePreview(card, question);
    renderAllPreviews();
    return;
  }

  if (action === "remove-question") {
    const confirmed = confirm("Remove this question?");
    if (!confirmed) return;
    const toolbarBefore = getToolbarRect();
    const ghost = createQuestionRemovalGhost(card);
    state.questions = state.questions.filter((item) => item.id !== question.id);
    graphDrafts.delete(question.id);
    if (state.questions.length === 0) state.questions.push(createQuestion());
    renderQuestions();
    renderAllPreviews({ animatePreview: true });
    animateToolbarFrom(toolbarBefore);
    runQuestionRemovalGhost(ghost);
    return;
  }

  if (action === "add-option") {
    if (question.type === "true-false") return;
    question.options.push("");
    renderQuestions();
    renderAllPreviews();
    return;
  }

  if (action === "remove-option") {
    if (question.type === "true-false") return;
    const index = Number(actionButton.dataset.optionIndex);
    question.options.splice(index, 1);
    if (question.options.length === 0) question.options.push("");
    question.correctOptionIndex = Math.max(0, Math.min(question.correctOptionIndex, question.options.length - 1));
    question.correctOptionIndexes = (question.correctOptionIndexes || [])
      .filter((item) => item !== index)
      .map((item) => item > index ? item - 1 : item);
    renderQuestions();
    renderAllPreviews();
    return;
  }

  if (action === "generate-graph") {
    const values = getGraphValuesFromCard(card);
    const message = card.querySelector("[data-graph-message]");
    try {
      validateGraphValues(values);
      question.graph = normalizeGraph(values);
      graphDrafts.set(question.id, question.graph);
      message.textContent = describeAttachedGraph(question.graph);
      message.classList.remove("error");
      drawAllGraphs();
      renderAllPreviews();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("error");
    }
  }
}

function drawInteractionPreview(ctx, meta, canvas) {
  const preview = canvas.__interactionPreview;
  if (!preview?.visible || !preview.point) return;

  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const construction = question ? diagramConstructionByQuestionId.get(question.id) : null;
  const graph = meta.graph || (card ? getGraphValuesFromCard(card) : null);
  const tool = preview.tool;
  const point = preview.point;
  const { px, py } = meta.toPx(point.x, point.y);

  ctx.save();
  ctx.strokeStyle = "rgba(20, 92, 99, 0.70)";
  ctx.fillStyle = "rgba(20, 92, 99, 0.12)";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 5]);

  if (preview.snap) {
    const xAxisY = meta.yMin <= 0 && meta.yMax >= 0 ? meta.toPx(meta.xMin, 0).py : meta.padding.top + meta.plotHeight;
    const yAxisX = meta.xMin <= 0 && meta.xMax >= 0 ? meta.toPx(0, meta.yMin).px : meta.padding.left;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, xAxisY);
    ctx.moveTo(px, py);
    ctx.lineTo(yAxisX, py);
    ctx.stroke();
  }

  if (tool === "segment") {
    const selection = question ? diagramSelectionByQuestionId.get(question.id) || [] : [];
    const start = selection.length && graph ? findPointByLabelInGraph(graph, selection[0]) : null;
    if (start) {
      const a = meta.toPx(start.x, start.y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(20, 92, 99, 0.75)";
      ctx.fillStyle = "rgba(20, 92, 99, 0.10)";
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(a.px, a.py, 5, 0, Math.PI * 2);
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([6, 5]);
    }
  } else if (tool === "polygon") {
    const settings = construction?.tool === "polygon" ? construction.settings || {} : {};
    const sides = Math.max(3, Math.round(Number(settings.sides) || 6));
    const radius = Math.max(0.1, Number(settings.radius) || 4);
    const rotation = Number(settings.rotation) || 90;
    const polygon = normalizeShape({ type: "regularPolygon", centerX: point.x, centerY: point.y, sides, radius, rotation, showApothem: settings.showApothem, stroke: settings.stroke, fill: settings.fill, lineWidth: settings.lineWidth, lineDash: settings.lineDash, vertexLabels: Array.from({length:sides}, (_,i)=>`P${i}`) });
    const pts = getRegularPolygonPoints(polygon);
    ghostClosedShape(ctx, meta, pts);
  } else if (tool === "circle") {
    if (construction?.tool === "circle" && construction.center) {
      const c = meta.toPx(construction.center.x, construction.center.y);
      const r = Math.hypot(px - c.px, py - c.py);
      ctx.beginPath();
      ctx.arc(c.px, c.py, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c.px, c.py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tool === "ellipse") {
    if (construction?.tool === "ellipse" && Array.isArray(construction.points)) {
      const pts = construction.points;
      pts.forEach((p0) => {
        const q = meta.toPx(p0.x, p0.y);
        ctx.beginPath();
        ctx.arc(q.px, q.py, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      if (pts.length === 1) {
        const a = meta.toPx(pts[0].x, pts[0].y);
        ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(px, py); ctx.stroke();
      }
      if (pts.length >= 2) {
        const ghost = normalizeShape({ type: "ellipse", focus1: pts[0], focus2: pts[1], through: point });
        const params = getEllipseParams(ghost);
        if (params) {
          const c = meta.toPx(params.cx, params.cy);
          const rx = Math.abs(meta.toPx(params.cx + params.a, params.cy).px - c.px);
          const ry = Math.abs(meta.toPx(params.cx, params.cy + params.b).py - c.py);
          ctx.save();
          ctx.translate(c.px, c.py);
          ctx.rotate(params.rotation || 0);
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.restore();
          ctx.stroke();
        }
      }
    }
  } else if (tool === "trapezoid" || tool === "parallelogram") {
    const pts = tool === "trapezoid" ? makeTrapezoidPoints(point) : makeParallelogramPoints(point);
    ghostClosedShape(ctx, meta, pts);
  } else if (tool === "irregular-polygon") {
    const pts = construction?.tool === "irregular-polygon" ? construction.points || [] : [];
    if (pts.length) {
      ctx.beginPath();
      const first = meta.toPx(pts[0].x, pts[0].y);
      ctx.moveTo(first.px, first.py);
      pts.slice(1).forEach((p0) => { const q = meta.toPx(p0.x, p0.y); ctx.lineTo(q.px, q.py); });
      ctx.lineTo(px, py);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "600 11px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  drawTextWithHalo(ctx, `(${roundGraphCoordinate(point.x)}, ${roundGraphCoordinate(point.y)})`, px + 10, py - 9);
  ctx.restore();
}

function updateDiagramToolHint(card, graph) {
  const hint = card.querySelector("[data-diagram-tool-hint]");
  if (!hint) return;
  const questionId = card.dataset.questionId;
  const tool = getActiveDiagramTool(questionId);
  const selection = diagramSelectionByQuestionId.get(questionId) || [];
  const construction = diagramConstructionByQuestionId.get(questionId);
  const messages = {
    point: "Point: click the diagram to insert a point. Turn on Stick to preview snapped placement.",
    segment: selection.length ? `Segment: selected ${selection.join(" → ")}. Move the cursor to preview the segment, then click another point.` : "Segment: click two points to create one independent segment.",
    polygon: "Regular polygon: configure it, then click the diagram to place its center.",
    "irregular-polygon": construction?.tool === "irregular-polygon" ? `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.` : "Irregular polygon: choose the number of sides, then click each vertex.",
    circle: construction?.tool === "circle" && construction.center ? "Circle: center selected. Move the cursor to preview radius, then click the circumference." : "Circle: configure it, then click the center and one point on the circumference.",
    ellipse: construction?.tool === "ellipse" ? `Ellipse: ${construction.points.length}/3 construction points selected.` : "Ellipse: configure it, then click focus 1, focus 2, and one point on the ellipse.",
    trapezoid: "Trapezoid: configure it, then click to insert an editable template. The tool will switch to Move point.",
    parallelogram: "Parallelogram: configure it, then click to insert an editable template. The tool will switch to Move point.",
    angle: selection.length ? `Angle: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle: Stick is enabled. Click three existing points: from, vertex, to.",
    function: "Function: configure the expression and style in the dialog.",
    select: "Selection: click an object to select it; double-click it to edit properties.",
    "move-point": "Move point: drag any point or shape handle. Group move/rotation comes next.",
    erase: "Eraser: click an object to remove it. Clear canvas is below it."
  };
  hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
}

// initialize moved to end by stage 3 patch.

/* ===== First-stage object properties modal patch ===== */
function editDiagramObjectPropertiesAsync(card, question, graph, objectId) {
  const hit = getDiagramObjectById(graph, objectId);
  if (!hit) return;
  const obj = hit.ref;
  const commonColor = obj.color || obj.stroke || "#145c63";
  const commonWidth = obj.lineWidth || 2;
  const fields = [];

  if (hit.kind === "point") {
    fields.push(
      { name: "label", label: "Point label", type: "text", value: obj.label || "" },
      { name: "color", label: "Point color", type: "color", value: obj.color || "#145c63" },
      { name: "size", label: "Point size", type: "number", min: 2, max: 24, step: 1, value: obj.size || 5 },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
  } else if (hit.kind === "segment") {
    fields.push(
      { name: "labelMode", label: "Label", type: "select", value: obj.labelMode || "name", options: [
        { value: "name", label: "Name" }, { value: "length", label: "Length" }, { value: "variable", label: "Variable x" }, { value: "hidden", label: "Hidden" }
      ]},
      { name: "color", label: "Line color", type: "color", value: commonColor },
      { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: commonWidth },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
  } else if (hit.kind === "angle") {
    fields.push(
      { name: "labelMode", label: "Label", type: "select", value: obj.labelMode || "name", options: [
        { value: "name", label: "∠ABC" }, { value: "value", label: "Value" }, { value: "variable", label: "Variable x" }, { value: "blank", label: "Blank with arc" }, { value: "none", label: "No label or arc" }
      ]},
      { name: "color", label: "Arc color", type: "color", value: obj.color || "#145c63" },
      { name: "radius", label: "Arc radius", type: "number", min: 8, max: 80, step: 1, value: obj.radius || 22 },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
  } else if (hit.kind === "shape") {
    fields.push(
      { name: "label", label: "Object label", type: "text", value: obj.label || "", full: true },
      { name: "stroke", label: "Outline color", type: "color", value: obj.stroke || "#145c63" },
      { name: "fill", label: "Fill color", type: "color", value: obj.fill || "#e8f7f9" },
      { name: "lineDash", label: "Outline type", type: "select", value: obj.lineDash || "solid", options: [
        { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
      ]},
      { name: "lineWidth", label: "Outline width", type: "number", min: 1, max: 12, step: 0.5, value: obj.lineWidth || 2 },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    );
    if (obj.type === "circle") fields.push({ name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: obj.radius || 1 });
    if (obj.type === "regularPolygon") {
      fields.push(
        { name: "sides", label: "Sides", type: "number", min: 3, max: 40, step: 1, value: obj.sides || 6 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: obj.radius || 4 },
        { name: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1, value: obj.rotation || 90 },
        { name: "showApothem", label: "Show apothem", type: "checkbox", value: obj.showApothem }
      );
    }
  } else if (hit.kind === "function") {
    fields.push(
      { name: "expression", label: "Function: y =", type: "text", value: graph.expression || "", full: true },
      { name: "functionStroke", label: "Trace color", type: "color", value: graph.functionStroke || "#145c63" },
      { name: "functionLineWidth", label: "Trace thickness", type: "number", min: 1, max: 12, step: 0.5, value: graph.functionLineWidth || 2.5 },
      { name: "functionDash", label: "Trace type", type: "select", value: graph.functionDash || "solid", options: [
        { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
      ]},
      { name: "functionLabel", label: "Function label", type: "text", value: graph.functionLabel || graph.title || "", full: true },
      { name: "functionVisible", label: "Visible", type: "checkbox", value: graph.functionVisible !== false }
    );
  }

  openDiagramDialog({
    title: "Object properties",
    description: "Adjust this object's visual style and label.",
    fields
  }).then((result) => {
    if (!result) return;
    pushDiagramHistory(question.id, graph);

    if (hit.kind === "point") {
      const newLabel = sanitizeGraphLabel(result.label) || obj.label;
      renamePoint(graph, obj.label, newLabel);
      obj.color = isHexColor(result.color) ? result.color : obj.color;
      obj.size = parseNumberOrDefault(result.size, obj.size || 5);
      obj.visible = Boolean(result.visible);
    } else if (hit.kind === "segment") {
      obj.labelMode = result.labelMode || obj.labelMode;
      obj.color = isHexColor(result.color) ? result.color : obj.color;
      obj.lineWidth = parseNumberOrDefault(result.lineWidth, obj.lineWidth || 2);
      obj.visible = Boolean(result.visible);
    } else if (hit.kind === "angle") {
      obj.labelMode = result.labelMode || obj.labelMode;
      obj.color = isHexColor(result.color) ? result.color : obj.color;
      obj.radius = parseNumberOrDefault(result.radius, obj.radius || 22);
      obj.visible = Boolean(result.visible);
    } else if (hit.kind === "shape") {
      obj.label = String(result.label || obj.label || "").trim();
      obj.stroke = isHexColor(result.stroke) ? result.stroke : obj.stroke;
      obj.fill = isHexColor(result.fill) ? result.fill : obj.fill;
      obj.lineDash = ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : (obj.lineDash || "solid");
      obj.lineWidth = parseNumberOrDefault(result.lineWidth, obj.lineWidth || 2);
      obj.visible = Boolean(result.visible);
      if (obj.type === "circle") obj.radius = Math.max(0.1, parseNumberOrDefault(result.radius, obj.radius || 1));
      if (obj.type === "regularPolygon") {
        const oldSides = obj.sides || 6;
        obj.sides = Math.max(3, Math.round(Number(result.sides) || oldSides));
        obj.radius = Math.max(0.1, parseNumberOrDefault(result.radius, obj.radius || 4));
        obj.rotation = parseNumberOrDefault(result.rotation, obj.rotation || 90);
        obj.showApothem = Boolean(result.showApothem);
        if (!Array.isArray(obj.vertexLabels)) obj.vertexLabels = [];
        if (obj.vertexLabels.length < obj.sides) {
          const extra = nextPointLabelsForGraph(graph, obj.sides - obj.vertexLabels.length);
          obj.vertexLabels = [...obj.vertexLabels, ...extra];
        }
        obj.vertexLabels = obj.vertexLabels.slice(0, obj.sides);
      }
    } else if (hit.kind === "function") {
      graph.expression = String(result.expression || "");
      graph.functionStroke = isHexColor(result.functionStroke) ? result.functionStroke : "#145c63";
      graph.functionLineWidth = parseNumberOrDefault(result.functionLineWidth, 2.5);
      graph.functionDash = ["solid", "dashed", "dotted"].includes(result.functionDash) ? result.functionDash : "solid";
      graph.functionLabel = String(result.functionLabel || "");
      graph.title = graph.functionLabel || graph.title;
      graph.functionVisible = Boolean(result.functionVisible);
    }

    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
}

/* ===== Stability patch: points/segments, angle anchors, labels, modal overflow, group move ===== */
var diagramGroupedHandleSelectionByQuestionId = diagramGroupedHandleSelectionByQuestionId || new Map();

function normalizeGraph(graph = {}) {
  const graphType = ["points", "polygon", "function", "diagram"].includes(graph.graphType)
    ? graph.graphType
    : "points";

  const displayMode = graph.displayMode === "geometry" ? "geometry" : "coordinate";
  const pointsText = String(graph.pointsText || pointsToText(Array.isArray(graph.points) ? graph.points : []));
  const points = mergeParsedPointsWithExisting(parsePoints(pointsText), graph.points);

  const segments = Array.isArray(graph.segments)
    ? graph.segments.map(normalizeSegment).filter(Boolean)
    : [];

  const angles = Array.isArray(graph.angles)
    ? graph.angles.map(normalizeAngle).filter(Boolean)
    : [];

  const shapes = Array.isArray(graph.shapes)
    ? graph.shapes.map(normalizeShape).filter(Boolean)
    : [];

  return {
    graphType,
    displayMode,
    title: String(graph.title || graph.label || ""),
    expression: String(graph.expression || ""),
    functionVisible: graph.functionVisible !== false,
    functionStroke: isHexColor(graph.functionStroke) ? graph.functionStroke : "#145c63",
    functionLineWidth: Number.isFinite(Number(graph.functionLineWidth)) ? Math.max(1, Number(graph.functionLineWidth)) : 2.5,
    functionDash: ["solid", "dashed", "dotted"].includes(graph.functionDash) ? graph.functionDash : "solid",
    functionLabel: String(graph.functionLabel || ""),
    pointsText,
    points,
    segments,
    angles,
    regularPolygon: null,
    shapes,
    autoFit: graph.autoFit !== false,
    snapToGrid: Boolean(graph.snapToGrid),
    xMin: parseNumberOrDefault(graph.xMin, -10),
    xMax: parseNumberOrDefault(graph.xMax, 10),
    yMin: parseOptionalNumber(graph.yMin),
    yMax: parseOptionalNumber(graph.yMax)
  };
}

function graphHasContent(graph) {
  if (!graph) return false;
  const normalized = normalizeGraph(graph);
  return (
    normalized.expression.trim() !== "" ||
    normalized.points.length > 0 ||
    normalized.segments.length > 0 ||
    normalized.angles.length > 0 ||
    normalized.shapes.length > 0
  );
}

function getGraphValuesFromCard(card) {
  const getValue = (name) => {
    const field = card.querySelector(`[data-graph-field="${name}"]`);
    if (!field) return "";
    if (field.type === "checkbox") return field.checked;
    return String(field.value || "").trim();
  };

  const question = findQuestion(card.dataset.questionId);
  const previous = question ? graphDrafts.get(question.id) || question.graph || {} : {};
  const previousGraph = normalizeGraph(previous);

  const graphType = ["points", "polygon", "function", "diagram"].includes(getValue("graphType"))
    ? getValue("graphType")
    : previousGraph.graphType || "points";

  const pointsText = String(getValue("pointsText") || pointsToText(previousGraph.points || []));

  const nextGraph = {
    ...previousGraph,
    graphType,
    displayMode: getValue("displayMode") === "geometry" ? "geometry" : "coordinate",
    title: getValue("title"),
    expression: getValue("expression") || previousGraph.expression || "",
    functionStroke: getValue("functionStroke") || previousGraph.functionStroke || "#145c63",
    functionLineWidth: parseNumberOrDefault(getValue("functionLineWidth"), previousGraph.functionLineWidth || 2.5),
    functionDash: getValue("functionDash") || previousGraph.functionDash || "solid",
    functionLabel: getValue("functionLabel") || previousGraph.functionLabel || "",
    pointsText,
    points: mergeParsedPointsWithExisting(parsePoints(pointsText), previousGraph.points),
    regularPolygon: null,
    autoFit: getValue("autoFit") !== false,
    snapToGrid: Boolean(getValue("snapToGrid")),
    xMin: parseNumberOrDefault(getValue("xMin"), previousGraph.xMin ?? -10),
    xMax: parseNumberOrDefault(getValue("xMax"), previousGraph.xMax ?? 10),
    yMin: parseOptionalNumber(getValue("yMin")),
    yMax: parseOptionalNumber(getValue("yMax"))
  };

  return normalizeGraph(nextGraph);
}

function renderGraphDraft(card, question) {
  const draft = normalizeGraph(graphDrafts.get(question.id) || question.graph || {
    graphType: "points",
    displayMode: "coordinate",
    title: "",
    expression: "",
    pointsText: "",
    points: [],
    segments: [],
    angles: [],
    regularPolygon: null,
    shapes: [],
    autoFit: true,
    snapToGrid: false,
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10
  });

  const setValue = (name, value) => {
    const field = card.querySelector(`[data-graph-field="${name}"]`);
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }
    field.value = value ?? "";
  };

  setValue("graphType", draft.graphType || "points");
  setValue("displayMode", draft.displayMode || "coordinate");
  setValue("title", draft.title || "");
  setValue("expression", draft.expression || "");
  setValue("functionStroke", draft.functionStroke || "#145c63");
  setValue("functionLineWidth", draft.functionLineWidth ?? 2.5);
  setValue("functionDash", draft.functionDash || "solid");
  setValue("functionLabel", draft.functionLabel || "");
  setValue("pointsText", draft.pointsText || pointsToText(draft.points || []));
  setValue("xMin", draft.xMin ?? -10);
  setValue("xMax", draft.xMax ?? 10);
  setValue("yMin", draft.yMin ?? -10);
  setValue("yMax", draft.yMax ?? 10);
  setValue("autoFit", draft.autoFit !== false);
  setValue("snapToGrid", draft.snapToGrid || false);
  setValue("polygonSides", 6);
  setValue("polygonRadius", 4);
  setValue("polygonRotation", 90);
  setValue("showApothem", false);

  graphDrafts.set(question.id, draft);
  updateGraphFieldVisibility(card, draft.graphType || "points");
  updateDiagramToolButtons(card, getActiveDiagramTool(question.id));
  updateDiagramToolHint(card, draft);
  renderDiagramObjectList(card, draft);

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = question.graph ? describeAttachedGraph(question.graph) : "Choose a tool on the left, then interact with the diagram.";
    message.classList.remove("error");
  }
}

function drawEmptyGraph(canvas, rawGraph = {}) {
  canvas.__interactionPreview = null;
  const clean = normalizeGraph({
    graphType: "points",
    displayMode: rawGraph.displayMode || "coordinate",
    title: rawGraph.title || "",
    expression: "",
    pointsText: "",
    points: [],
    segments: [],
    angles: [],
    regularPolygon: null,
    shapes: [],
    autoFit: rawGraph.autoFit !== false,
    snapToGrid: Boolean(rawGraph.snapToGrid),
    xMin: Number.isFinite(Number(rawGraph.xMin)) ? Number(rawGraph.xMin) : -10,
    xMax: Number.isFinite(Number(rawGraph.xMax)) ? Number(rawGraph.xMax) : 10,
    yMin: rawGraph.yMin === "" ? -10 : Number.isFinite(Number(rawGraph.yMin)) ? Number(rawGraph.yMin) : -10,
    yMax: rawGraph.yMax === "" ? 10 : Number.isFinite(Number(rawGraph.yMax)) ? Number(rawGraph.yMax) : 10
  });
  drawGraph(canvas, clean);
}

function collectUsedPointLabels(graph = {}) {
  const normalized = graph && graph.points !== undefined ? graph : normalizeGraph(graph || {});
  const labels = new Set();
  const add = (value) => {
    const label = sanitizeGraphLabel(value);
    if (label) labels.add(label.toLowerCase());
  };

  (normalized.points || []).forEach((point) => add(point.label));
  (normalized.shapes || []).forEach((shape) => {
    if (shape.type === "regularPolygon") {
      (shape.vertexLabels || []).forEach(add);
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      (shape.points || []).forEach((point) => add(point.label));
    }
  });

  return labels;
}

function nextPointLabelForGraph(graph, prefix = "P") {
  const used = collectUsedPointLabels(graph);
  let index = 0;
  let label = `${prefix}${index}`;
  while (used.has(label.toLowerCase())) {
    index += 1;
    label = `${prefix}${index}`;
  }
  return label;
}

function nextPointLabelsForGraph(graph, count, prefix = "P") {
  const labels = [];
  const used = collectUsedPointLabels(graph);
  let index = 0;
  while (labels.length < count) {
    const label = `${prefix}${index}`;
    if (!used.has(label.toLowerCase())) {
      labels.push(label);
      used.add(label.toLowerCase());
    }
    index += 1;
  }
  return labels;
}

function nextPointLabel(points) {
  const used = new Set((Array.isArray(points) ? points : []).map((point) => sanitizeGraphLabel(point.label).toLowerCase()).filter(Boolean));
  let index = 0;
  let label = `P${index}`;
  while (used.has(label.toLowerCase())) {
    index += 1;
    label = `P${index}`;
  }
  return label;
}

function getShapePointReferences(graph) {
  const refs = [];
  (graph.shapes || []).forEach((shape, shapeIndex) => {
    if (!shape || shape.visible === false) return;
    if (shape.type === "regularPolygon") {
      getRegularPolygonPoints(shape).forEach((point, pointIndex) => {
        refs.push({ point, shape, shapeIndex, pointIndex, source: "shape-regular" });
      });
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      (shape.points || []).forEach((point, pointIndex) => {
        refs.push({ point, shape, shapeIndex, pointIndex, source: "shape" });
      });
    }
    if (shape.type === "circle") {
      refs.push({ point: { ...shape.center, label: shape.center?.label || `${shape.label || "O"}` }, shape, shapeIndex, pointIndex: "center", source: "shape" });
    }
    if (shape.type === "ellipse") {
      refs.push({ point: { ...shape.focus1, label: shape.focus1?.label || "F1" }, shape, shapeIndex, pointIndex: "focus1", source: "shape" });
      refs.push({ point: { ...shape.focus2, label: shape.focus2?.label || "F2" }, shape, shapeIndex, pointIndex: "focus2", source: "shape" });
      refs.push({ point: { ...shape.through, label: shape.through?.label || "P" }, shape, shapeIndex, pointIndex: "through", source: "shape" });
    }
  });
  return refs.filter((ref) => ref.point && Number.isFinite(Number(ref.point.x)) && Number.isFinite(Number(ref.point.y)) && sanitizeGraphLabel(ref.point.label));
}

function findPointByLabelInGraph(graph, label) {
  const normalized = normalizeGraph(graph);
  const cleanLabel = sanitizeGraphLabel(label).toLowerCase();
  if (!cleanLabel) return null;

  const manual = normalized.points.find((point) => point.visible !== false && sanitizeGraphLabel(point.label).toLowerCase() === cleanLabel);
  if (manual) return manual;

  for (const ref of getShapePointReferences(normalized)) {
    if (sanitizeGraphLabel(ref.point.label).toLowerCase() === cleanLabel) return ref.point;
  }

  return null;
}

function findClickedPoint(graph, meta, clickX, clickY) {
  const normalized = normalizeGraph(graph);
  const hitRadius = 12;

  for (let index = 0; index < normalized.points.length; index += 1) {
    const point = normalized.points[index];
    if (point.visible === false) continue;
    const { px, py } = meta.toPx(point.x, point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) return { point, index, source: "manual", id: `point:${point.label}` };
  }

  for (const ref of getShapePointReferences(normalized)) {
    const { px, py } = meta.toPx(ref.point.x, ref.point.y);
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) {
      return {
        point: ref.point,
        index: ref.pointIndex,
        source: ref.source,
        id: `shape:${ref.shape.id}:${ref.pointIndex}`,
        shapeIndex: ref.shapeIndex,
        shape: ref.shape
      };
    }
  }

  return null;
}

function drawClosedPointShape(ctx, shape, meta) {
  const points = shape.points || [];
  if (points.length < 2) return;
  ctx.save();
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.42);
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.lineWidth = shape.lineWidth || 2;
  if (shape.lineDash === "dashed") ctx.setLineDash([8, 6]);
  if (shape.lineDash === "dotted") ctx.setLineDash([2, 6]);
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
  drawPoints(ctx, points, meta);
}

function drawCircleShape(ctx, shape, meta) {
  const center = meta.toPx(shape.center.x, shape.center.y);
  const edge = meta.toPx(shape.center.x + shape.radius, shape.center.y);
  const r = Math.abs(edge.px - center.px);
  ctx.save();
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.25);
  ctx.lineWidth = shape.lineWidth || 2;
  if (shape.lineDash === "dashed") ctx.setLineDash([8, 6]);
  if (shape.lineDash === "dotted") ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.arc(center.px, center.py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  if (shape.label) drawTextWithHalo(ctx, shape.label, center.px + r + 8, center.py);
  ctx.restore();
}

function drawEllipseShape(ctx, shape, meta) {
  const params = getEllipseParams(shape);
  if (!params) return;
  const center = meta.toPx(params.cx, params.cy);
  const edgeA = meta.toPx(params.cx + params.a, params.cy);
  const edgeB = meta.toPx(params.cx, params.cy + params.b);
  const rx = Math.abs(edgeA.px - center.px);
  const ry = Math.abs(edgeB.py - center.py);
  ctx.save();
  ctx.strokeStyle = shape.stroke || "#145c63";
  ctx.fillStyle = hexToRgba(shape.fill || "#e8f7f9", 0.25);
  ctx.lineWidth = shape.lineWidth || 2;
  if (shape.lineDash === "dashed") ctx.setLineDash([8, 6]);
  if (shape.lineDash === "dotted") ctx.setLineDash([2, 6]);
  ctx.translate(center.px, center.py);
  ctx.rotate(params.rotation);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  const latest = normalizeGraph(graphDrafts.get(question.id) || values || {});
  pushDiagramHistory(question.id, latest);

  const nextPoint = {
    label: nextPointLabelForGraph(latest),
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y),
    labelDx: 8,
    labelDy: -7,
    color: "#145c63",
    size: 5,
    visible: true
  };

  const nextPoints = [...latest.points, nextPoint];
  const nextGraph = normalizeGraph({
    ...latest,
    graphType: latest.graphType === "function" ? "points" : latest.graphType,
    points: nextPoints,
    pointsText: pointsToText(nextPoints)
  });

  updatePointsField(card, nextGraph);
  setHiddenGraphField(card, "graphType", nextGraph.graphType);
  graphDrafts.set(question.id, nextGraph);
  updateGraphFieldVisibility(card, nextGraph.graphType);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();

  const message = card.querySelector("[data-graph-message]");
  if (message) {
    message.textContent = `Added point ${nextPoint.label}(${nextPoint.x}, ${nextPoint.y}).`;
    message.classList.remove("error");
  }
}

function handleSegmentToolClick(card, question, values, meta, canvasX, canvasY) {
  let graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
  let clickedPoint = findClickedPoint(graph, meta, canvasX, canvasY);

  if (!clickedPoint) {
    addManualPointAtCanvasPosition(card, question, graph, meta, canvasX, canvasY);
    graph = normalizeGraph(graphDrafts.get(question.id) || getGraphValuesFromCard(card));
    clickedPoint = { point: graph.points[graph.points.length - 1], source: "manual" };
  }

  const label = sanitizeGraphLabel(clickedPoint.point.label);
  if (!label) return;
  const selection = diagramSelectionByQuestionId.get(question.id) || [];

  if (!selection.length) {
    diagramSelectionByQuestionId.set(question.id, [label]);
    updateDiagramToolHint(card, graph);
    drawGraphDraftOnCard(card, graph);
    return;
  }

  const from = selection[0];
  const to = label;
  if (from && to && from !== to && !graph.segments.some((segment) => segmentMatches(segment, from, to))) {
    pushDiagramHistory(question.id, graph);
    graph.segments.push({ from, to, labelMode: "name", visible: true, color: "#145c63", lineWidth: 2 });
  }

  diagramSelectionByQuestionId.delete(question.id);
  const nextGraph = normalizeGraph(graph);
  graphDrafts.set(question.id, nextGraph);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();
}

function handleAngleToolClick(card, question, values, meta, canvasX, canvasY) {
  const graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
  const clickedPoint = findClickedPoint(graph, meta, canvasX, canvasY);
  if (!clickedPoint) return;
  const label = sanitizeGraphLabel(clickedPoint.point.label);
  if (!label) return;

  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  if (selection[selection.length - 1] !== label) selection.push(label);
  diagramSelectionByQuestionId.set(question.id, selection);

  if (selection.length >= 3) {
    const [from, vertex, to] = selection;
    if (from !== vertex && vertex !== to && from !== to) {
      pushDiagramHistory(question.id, graph);
      const angle = { from, vertex, to, labelMode: "value", visible: true, color: "#145c63", radius: 22 };
      graph.angles.push(angle);
      diagramSelectionByQuestionId.delete(question.id);
      const nextGraph = normalizeGraph(graph);
      graphDrafts.set(question.id, nextGraph);
      renderAllPreviewsDebounced();
      setToolToMovePoint(card, question, nextGraph, getAngleObjectId(angle));
      return;
    }
    diagramSelectionByQuestionId.delete(question.id);
  }

  updateDiagramToolHint(card, graph);
  drawGraphDraftOnCard(card, graph);
}

function getHandleObjectIdFromHandle(graph, handle) {
  if (!handle) return "";
  if (handle.kind === "manual") {
    const point = graph.points?.[handle.index];
    return point ? `point:${point.label}` : "";
  }
  if (handle.kind === "shape") {
    const shape = graph.shapes?.[handle.shapeIndex];
    if (!shape) return "";
    return `shape:${shape.id}:${handle.pointIndex}`;
  }
  return "";
}

function toggleGroupedHandle(questionId, handleId) {
  if (!handleId) return;
  const selected = new Set(diagramGroupedHandleSelectionByQuestionId.get(questionId) || []);
  if (selected.has(handleId)) selected.delete(handleId);
  else selected.add(handleId);
  diagramGroupedHandleSelectionByQuestionId.set(questionId, [...selected]);
}

function translateHandleById(graph, handleId, dx, dy) {
  const [kind, shapeId, pointIndex] = String(handleId).split(":");
  if (kind === "point") {
    const point = graph.points.find((item) => item.label === shapeId);
    if (point) {
      point.x = roundGraphCoordinate(Number(point.x) + dx);
      point.y = roundGraphCoordinate(Number(point.y) + dy);
    }
    return;
  }
  if (kind === "shape") {
    const shape = graph.shapes.find((item) => item.id === shapeId);
    if (!shape) return;
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type) && Array.isArray(shape.points)) {
      const index = Number(pointIndex);
      if (shape.points[index]) {
        shape.points[index].x = roundGraphCoordinate(Number(shape.points[index].x) + dx);
        shape.points[index].y = roundGraphCoordinate(Number(shape.points[index].y) + dy);
      }
    }
    if (shape.type === "circle" && pointIndex === "center") {
      shape.center.x = roundGraphCoordinate(Number(shape.center.x) + dx);
      shape.center.y = roundGraphCoordinate(Number(shape.center.y) + dy);
    }
    if (shape.type === "ellipse" && ["focus1", "focus2", "through"].includes(pointIndex)) {
      shape[pointIndex].x = roundGraphCoordinate(Number(shape[pointIndex].x) + dx);
      shape[pointIndex].y = roundGraphCoordinate(Number(shape[pointIndex].y) + dy);
    }
  }
}

function handleGraphPointerDown(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const tool = getActiveDiagramTool(question.id);
  const meta = canvas.__graphMeta;
  if (!meta) return;

  const values = normalizeGraph(getGraphValuesFromCard(card));
  const pointer = getCanvasPointer(event, canvas);
  const handle = findClickedDraggableHandle(values, meta, pointer.x, pointer.y);

  if (tool === "move-point" && handle) {
    const handleId = getHandleObjectIdFromHandle(values, handle);

    if (event.ctrlKey || event.metaKey) {
      toggleGroupedHandle(question.id, handleId);
      diagramObjectSelectionByQuestionId.set(question.id, handleId.split(":").slice(0, 2).join(":"));
      drawGraphDraftOnCard(card, values);
      event.preventDefault();
      return;
    }

    const selectedHandles = diagramGroupedHandleSelectionByQuestionId.get(question.id) || [];
    const groupHandles = selectedHandles.includes(handleId) && selectedHandles.length > 1 ? selectedHandles : [handleId];
    diagramDragState = {
      card,
      canvas,
      questionId: question.id,
      handle,
      handleId,
      groupHandles,
      startGraph: JSON.parse(JSON.stringify(values)),
      startPoint: graphPointFromCanvasPoint(meta, pointer.x, pointer.y),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      historySaved: false
    };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;
  const card = diagramDragState?.card || canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;

  const pointer = getCanvasPointer(event, canvas);
  const inside = isInsidePlot(pointer.x, pointer.y, meta);

  if (!diagramDragState) {
    const values = normalizeGraph(getGraphValuesFromCard(card));
    const tool = getActiveDiagramTool(question.id);
    if (inside && ["point", "segment", "polygon", "irregular-polygon", "angle", "circle", "ellipse", "trapezoid", "parallelogram"].includes(tool)) {
      let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      if (values.snapToGrid) graphPoint = snapGraphPoint(graphPoint, meta);
      canvas.__interactionPreview = { point: graphPoint, snap: values.snapToGrid, tool, visible: true };
    } else {
      canvas.__interactionPreview = null;
    }
    drawGraphDraftOnCard(card, values);
    return;
  }

  const dxClient = event.clientX - diagramDragState.startClientX;
  const dyClient = event.clientY - diagramDragState.startClientY;
  if (!diagramDragState.moved && Math.hypot(dxClient, dyClient) < 3) return;
  diagramDragState.moved = true;
  if (!inside) return;

  let currentPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  if (getGraphValuesFromCard(card).snapToGrid) currentPoint = snapGraphPoint(currentPoint, meta);

  const values = normalizeGraph(JSON.parse(JSON.stringify(diagramDragState.startGraph)));

  if (!diagramDragState.historySaved) {
    pushDiagramHistory(question.id, normalizeGraph(diagramDragState.startGraph));
    diagramDragState.historySaved = true;
  }

  if (diagramDragState.groupHandles && diagramDragState.groupHandles.length > 1) {
    const dx = currentPoint.x - diagramDragState.startPoint.x;
    const dy = currentPoint.y - diagramDragState.startPoint.y;
    diagramDragState.groupHandles.forEach((handleId) => translateHandleById(values, handleId, dx, dy));
  } else {
    const handle = diagramDragState.handle;
    if (handle.kind === "manual") {
      if (!values.points[handle.index]) return;
      values.points[handle.index] = {
        ...values.points[handle.index],
        x: roundGraphCoordinate(currentPoint.x),
        y: roundGraphCoordinate(currentPoint.y)
      };
    }
    if (handle.kind === "shape") {
      const shape = values.shapes?.[handle.shapeIndex];
      applyShapeHandleMove(shape, handle, currentPoint);
    }
  }

  updatePointsField(card, values);
  graphDrafts.set(question.id, normalizeGraph(values));
  canvas.__interactionPreview = { point: currentPoint, snap: getGraphValuesFromCard(card).snapToGrid, tool: "move-point", visible: true };
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
}

function handleGraphPointerUp(event) {
  if (!diagramDragState) return;

  if (diagramDragState.moved) {
    suppressNextCanvasClick = true;
    window.setTimeout(() => { suppressNextCanvasClick = false; }, 0);
  }

  diagramDragState.canvas?.releasePointerCapture?.(event.pointerId);
  diagramDragState = null;
}

function handleGraphCanvasClick(event, canvas) {
  if (suppressNextCanvasClick) {
    suppressNextCanvasClick = false;
    return;
  }

  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const values = normalizeGraph(getGraphValuesFromCard(card));
  const meta = canvas.__graphMeta;
  if (!meta) return;

  const pointer = getCanvasPointer(event, canvas);
  if (!isInsidePlot(pointer.x, pointer.y, meta)) return;

  const tool = getActiveDiagramTool(question.id);

  if (tool === "select") {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit) {
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      drawGraphDraftOnCard(card, values);
    }
    return;
  }

  if (tool === "erase") {
    eraseObjectAtPosition(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "segment") {
    handleSegmentToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "angle") {
    handleAngleToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "polygon") {
    handlePolygonToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "irregular-polygon") {
    handleIrregularPolygonToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "circle") {
    handleCircleToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "ellipse") {
    handleEllipseToolClick(card, question, values, meta, pointer.x, pointer.y);
    return;
  }

  if (tool === "trapezoid" || tool === "parallelogram") {
    handleTemplateShapeClick(card, question, values, meta, pointer.x, pointer.y, tool);
    return;
  }

  if (tool === "function" || tool === "move-point") return;

  addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
}

function computeAngleDegrees(from, vertex, to) {
  const ux = Number(from.x) - Number(vertex.x);
  const uy = Number(from.y) - Number(vertex.y);
  const vx = Number(to.x) - Number(vertex.x);
  const vy = Number(to.y) - Number(vertex.y);
  const dot = ux * vx + uy * vy;
  const magU = Math.hypot(ux, uy);
  const magV = Math.hypot(vx, vy);
  if (magU === 0 || magV === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magU * magV)))) * 180 / Math.PI;
}

function getAngleLabel(from, vertex, to, mode) {
  if (mode === "none" || mode === "blank") return "";
  if (mode === "value") return `${formatAngleValue(computeAngleDegrees(from, vertex, to))}°`;
  if (mode === "variable") return "x";
  return `∠${sanitizeGraphLabel(from.label)}${sanitizeGraphLabel(vertex.label)}${sanitizeGraphLabel(to.label)}`;
}

function setToolToMovePoint(card, question, graph, objectId = null) {
  setActiveDiagramTool(question.id, "move-point");
  updateDiagramToolButtons(card, "move-point");
  if (objectId) diagramObjectSelectionByQuestionId.set(question.id, objectId);
  diagramSelectionByQuestionId.delete(question.id);
  diagramConstructionByQuestionId.delete(question.id);
  graphDrafts.set(question.id, normalizeGraph(graph));
  drawGraphDraftOnCard(card, graph);
  updateDiagramToolHint(card, graph);
}


/* ===== Stage 3 interaction patch: object transform, label dragging, stronger snap, LaTeX text ===== */
var diagramMultiObjectSelectionByQuestionId = diagramMultiObjectSelectionByQuestionId || new Map();

function normalizeSegment(segment) {
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
    lineWidth: Number.isFinite(Number(segment.lineWidth)) ? Math.max(1, Number(segment.lineWidth)) : 2,
    lineDash: ["solid", "dashed", "dotted"].includes(segment.lineDash) ? segment.lineDash : "solid"
  };
}

function normalizeShapePoint(point, fallback = { x: 0, y: 0 }) {
  const x = Number(point?.x ?? fallback.x);
  const y = Number(point?.y ?? fallback.y);
  const normalized = {
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y
  };
  if (point && point.label) normalized.label = sanitizeGraphLabel(point.label);
  if (point && point.color && isHexColor(point.color)) normalized.color = point.color;
  if (point && Number.isFinite(Number(point.size))) normalized.size = Number(point.size);
  if (point && Number.isFinite(Number(point.labelDx))) normalized.labelDx = Number(point.labelDx);
  if (point && Number.isFinite(Number(point.labelDy))) normalized.labelDy = Number(point.labelDy);
  return normalized;
}

function normalizeShape(shape, index = 0) {
  if (!shape || typeof shape !== "object") return null;
  const type = ["regularPolygon", "irregularPolygon", "circle", "ellipse", "trapezoid", "parallelogram", "latexText"].includes(shape.type)
    ? shape.type
    : "irregularPolygon";

  const base = {
    id: sanitizeObjectId(shape.id || `${type}-${index + 1}`),
    type,
    label: String(shape.label || shape.name || getDefaultShapeLabel(type, index)).trim(),
    visible: shape.visible !== false,
    stroke: isHexColor(shape.stroke) ? shape.stroke : "#145c63",
    fill: isHexColor(shape.fill) ? shape.fill : "#e8f7f9",
    lineWidth: Number.isFinite(Number(shape.lineWidth)) ? Math.max(1, Number(shape.lineWidth)) : 2,
    lineDash: ["solid", "dashed", "dotted"].includes(shape.lineDash) ? shape.lineDash : "solid"
  };

  if (type === "latexText") {
    return {
      ...base,
      text: String(shape.text || shape.label || ""),
      x: parseNumberOrDefault(shape.x, 0),
      y: parseNumberOrDefault(shape.y, 0),
      fontSize: Number.isFinite(Number(shape.fontSize)) ? Math.max(8, Number(shape.fontSize)) : 18,
      fill: isHexColor(shape.fill) ? shape.fill : "#145c63"
    };
  }

  if (type === "regularPolygon") {
    const sides = Math.max(3, Math.floor(parseNumberOrDefault(shape.sides, 3)));
    const vertexLabels = Array.isArray(shape.vertexLabels)
      ? shape.vertexLabels.map(sanitizeGraphLabel).filter(Boolean).slice(0, sides)
      : [];
    const vertexLabelOffsets = Array.isArray(shape.vertexLabelOffsets)
      ? shape.vertexLabelOffsets.slice(0, sides).map((offset) => ({
          dx: Number.isFinite(Number(offset?.dx)) ? Number(offset.dx) : 8,
          dy: Number.isFinite(Number(offset?.dy)) ? Number(offset.dy) : -7
        }))
      : [];
    return {
      ...base,
      sides,
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 4)),
      rotation: parseNumberOrDefault(shape.rotation, 90),
      centerX: parseNumberOrDefault(shape.centerX, 0),
      centerY: parseNumberOrDefault(shape.centerY, 0),
      showApothem: Boolean(shape.showApothem),
      vertexLabels,
      vertexLabelOffsets,
      segmentLabelModes: shape.segmentLabelModes && typeof shape.segmentLabelModes === "object" ? { ...shape.segmentLabelModes } : {}
    };
  }

  if (type === "circle") {
    return {
      ...base,
      center: normalizeShapePoint(shape.center, { x: 0, y: 0 }),
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 1))
    };
  }

  if (type === "ellipse") {
    return {
      ...base,
      focus1: normalizeShapePoint(shape.focus1, { x: -1, y: 0 }),
      focus2: normalizeShapePoint(shape.focus2, { x: 1, y: 0 }),
      through: normalizeShapePoint(shape.through, { x: 0, y: 1 })
    };
  }

  const points = Array.isArray(shape.points)
    ? shape.points.map((point) => normalizeShapePoint(point)).filter(Boolean)
    : [];

  return {
    ...base,
    points,
    targetSides: type === "irregularPolygon" ? Math.max(3, Math.floor(parseNumberOrDefault(shape.targetSides, points.length || 3))) : undefined
  };
}

function getRegularPolygonPoints(polygon) {
  const sides = Math.max(3, Math.floor(Number(polygon?.sides) || 3));
  const radius = Math.max(0.1, Number(polygon?.radius) || 4);
  const rotation = ((Number(polygon?.rotation) || 0) * Math.PI) / 180;
  const centerX = Number(polygon?.centerX) || 0;
  const centerY = Number(polygon?.centerY) || 0;
  const labels = Array.isArray(polygon?.vertexLabels) ? polygon.vertexLabels : [];
  const offsets = Array.isArray(polygon?.vertexLabelOffsets) ? polygon.vertexLabelOffsets : [];

  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (index * 2 * Math.PI) / sides;
    const offset = offsets[index] || {};
    return {
      label: sanitizeGraphLabel(labels[index] || `P${index}`),
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      labelDx: Number.isFinite(Number(offset.dx)) ? Number(offset.dx) : 8,
      labelDy: Number.isFinite(Number(offset.dy)) ? Number(offset.dy) : -7,
      color: polygon?.stroke || "#145c63",
      size: 4,
      visible: polygon?.visible !== false
    };
  });
}

function getDefaultShapeLabel(type, index = 0) {
  const map = {
    regularPolygon: "Regular polygon",
    irregularPolygon: "Irregular polygon",
    circle: "Circle",
    ellipse: "Ellipse",
    trapezoid: "Trapezoid",
    parallelogram: "Parallelogram",
    latexText: "LaTeX text"
  };
  return map[type] || `Shape ${index + 1}`;
}

function normalizeGraph(graph = {}) {
  const graphType = ["points", "polygon", "function", "diagram"].includes(graph.graphType)
    ? graph.graphType
    : "points";

  const displayMode = graph.displayMode === "geometry" ? "geometry" : "coordinate";
  const pointsText = String(graph.pointsText || pointsToText(Array.isArray(graph.points) ? graph.points : []));
  const points = mergeParsedPointsWithExisting(parsePoints(pointsText), graph.points);

  const segments = Array.isArray(graph.segments) ? graph.segments.map(normalizeSegment).filter(Boolean) : [];
  const angles = Array.isArray(graph.angles) ? graph.angles.map(normalizeAngle).filter(Boolean) : [];
  const shapes = Array.isArray(graph.shapes) ? graph.shapes.map(normalizeShape).filter(Boolean) : [];

  return {
    graphType,
    displayMode,
    title: String(graph.title || graph.label || ""),
    expression: String(graph.expression || ""),
    functionVisible: graph.functionVisible !== false,
    functionStroke: isHexColor(graph.functionStroke) ? graph.functionStroke : "#145c63",
    functionLineWidth: Number.isFinite(Number(graph.functionLineWidth)) ? Math.max(1, Number(graph.functionLineWidth)) : 2.5,
    functionDash: ["solid", "dashed", "dotted"].includes(graph.functionDash) ? graph.functionDash : "solid",
    functionLabel: String(graph.functionLabel || ""),
    pointsText,
    points,
    segments,
    angles,
    regularPolygon: null,
    shapes,
    autoFit: graph.autoFit !== false,
    snapToGrid: Boolean(graph.snapToGrid),
    xMin: parseNumberOrDefault(graph.xMin, -10),
    xMax: parseNumberOrDefault(graph.xMax, 10),
    yMin: parseOptionalNumber(graph.yMin),
    yMax: parseOptionalNumber(graph.yMax)
  };
}

function collectUsedPointLabels(graph = {}) {
  const normalized = graph && graph.points !== undefined ? graph : normalizeGraph(graph || {});
  const labels = new Set();
  const add = (value) => {
    const label = sanitizeGraphLabel(value);
    if (label) labels.add(label.toLowerCase());
  };
  (normalized.points || []).forEach((point) => add(point.label));
  (normalized.shapes || []).forEach((shape) => {
    if (shape.type === "regularPolygon") (shape.vertexLabels || []).forEach(add);
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) (shape.points || []).forEach((point) => add(point.label));
  });
  return labels;
}

function drawSegments(ctx, graph, meta, polygonPoints = []) {
  const polygonSegments = polygonPoints.length >= 3
    ? polygonPoints.map((point, index) => {
        const next = polygonPoints[(index + 1) % polygonPoints.length];
        const key = makeSegmentKeyLabels(point.label, next.label);
        return { from: point.label, to: next.label, labelMode: graph.regularPolygon?.segmentLabelModes?.[key] || "name", polygon: true, polygonSegmentKey: key, visible: graph.regularPolygon?.visible !== false };
      })
    : [];

  const segments = [...polygonSegments, ...graph.segments].filter((segment) => segment.visible !== false);
  if (!segments.length) return;

  ctx.save();
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  segments.forEach((segment) => {
    const start = findPointByLabelInGraph(graph, segment.from);
    const end = findPointByLabelInGraph(graph, segment.to);
    if (!start || !end) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    ctx.save();
    ctx.strokeStyle = segment.color || "#145c63";
    ctx.fillStyle = segment.color || "#145c63";
    ctx.lineWidth = segment.lineWidth || 2;
    applyCanvasLineDash(ctx, segment.lineDash || "solid");
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = getSegmentLabel(start, end, segment.labelMode);
    if (label) {
      const labelX = (a.px + b.px) / 2;
      const labelY = (a.py + b.py) / 2 - 10;
      if (segment.labelMode === "name") drawTextWithOverbar(ctx, label, labelX, labelY);
      else drawTextWithHalo(ctx, label, labelX, labelY);
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawTextShape(ctx, shape, meta) {
  if (!shape.text) return;
  const p = meta.toPx(shape.x, shape.y);
  ctx.save();
  ctx.fillStyle = shape.fill || shape.stroke || "#145c63";
  ctx.font = `700 ${Math.max(8, Number(shape.fontSize) || 18)}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawTextWithHalo(ctx, shape.text, p.px, p.py);
  ctx.restore();
}

function drawShapes(ctx, graph, meta) {
  const shapes = Array.isArray(graph.shapes) ? graph.shapes.filter((shape) => shape.visible !== false) : [];
  shapes.forEach((shape) => {
    if (shape.type === "regularPolygon") {
      const points = getRegularPolygonPoints(shape);
      drawPolygon(ctx, points, meta, shape);
      if (shape.showApothem) drawApothem(ctx, points, meta);
      return;
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      drawClosedPointShape(ctx, shape, meta);
      const labeledPoints = (shape.points || []).map((point, index) => ({
        ...point,
        label: point.label || String.fromCharCode(65 + index),
        color: shape.stroke || "#145c63",
        size: 4,
        visible: shape.visible !== false
      }));
      drawPoints(ctx, labeledPoints, meta);
      return;
    }
    if (shape.type === "circle") { drawCircleShape(ctx, shape, meta); return; }
    if (shape.type === "ellipse") { drawEllipseShape(ctx, shape, meta); return; }
    if (shape.type === "latexText") { drawTextShape(ctx, shape, meta); return; }
  });
}

function updateDiagramToolHint(card, graph) {
  const hint = card.querySelector("[data-diagram-tool-hint]");
  if (!hint) return;
  const questionId = card.dataset.questionId;
  const tool = getActiveDiagramTool(questionId);
  const selection = diagramSelectionByQuestionId.get(questionId) || [];
  const construction = diagramConstructionByQuestionId.get(questionId);
  const messages = {
    point: "Point: click the diagram to insert points. This tool stays active for fast point entry.",
    segment: selection.length ? `Segment: selected ${selection.join(" → ")}. Move the cursor to preview the segment, then click another point.` : "Segment: click two points to create one independent segment. This tool stays active.",
    polygon: "Regular polygon: configure it, then click the diagram to place its center. After creation, the tool changes to Move point.",
    "irregular-polygon": construction?.tool === "irregular-polygon" ? `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.` : "Irregular polygon: choose the number of sides, then click each vertex.",
    circle: construction?.tool === "circle" && construction.center ? "Circle: center selected. Move the cursor to preview radius, then click the circumference." : "Circle: configure it, then click the center and one point on the circumference.",
    ellipse: construction?.tool === "ellipse" ? `Ellipse: ${construction.points.length}/3 construction points selected.` : "Ellipse: configure it, then click focus 1, focus 2, and one point on the ellipse.",
    trapezoid: "Trapezoid: configure it, then click to insert an editable template. The tool will switch to Move point.",
    parallelogram: "Parallelogram: configure it, then click to insert an editable template. The tool will switch to Move point.",
    angle: selection.length ? `Angle: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle: Stick is enabled. Click three existing points: from, vertex, to. This tool stays active.",
    function: "Function: configure the expression and style in the dialog.",
    "latex-text": construction?.tool === "latex-text" ? "LaTeX text: click the diagram to place the text." : "LaTeX text: enter a short formula/string, then click the diagram to place it.",
    select: "Selection: click objects to select them; Ctrl+click selects multiple; Delete removes the selection; double-click opens properties.",
    "move-point": "Move point: drag vertices, labels, selected objects, or the selected shape handle. Use Ctrl+click to build a point group.",
    erase: "Eraser: click an object to remove it. Clear canvas is in Edit."
  };
  hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
}

function setActiveDiagramTool(questionId, tool) {
  diagramToolByQuestionId.set(questionId, tool);
  if (!["segment", "angle", "irregular-polygon", "circle", "ellipse", "latex-text"].includes(tool)) diagramSelectionByQuestionId.delete(questionId);
  if (!["irregular-polygon", "circle", "ellipse", "latex-text"].includes(tool)) diagramConstructionByQuestionId.delete(questionId);
}

function configureLatexTextTool(question) {
  openDiagramDialog({
    title: "LaTeX text settings",
    description: "Add a short text or LaTeX-style string to the diagram. It is drawn on the canvas as text.",
    fields: [
      { name: "text", label: "Text / LaTeX", type: "text", value: "x^2 + y^2 = r^2", full: true },
      { name: "fill", label: "Text color", type: "color", value: "#145c63" },
      { name: "fontSize", label: "Font size", type: "number", min: 8, max: 48, step: 1, value: 18 }
    ],
    onSubmit: (data) => {
      diagramConstructionByQuestionId.set(question.id, {
        tool: "latex-text",
        settings: {
          text: String(data.text || "").trim(),
          fill: isHexColor(data.fill) ? data.fill : "#145c63",
          fontSize: Number.isFinite(Number(data.fontSize)) ? Number(data.fontSize) : 18
        }
      });
    }
  });
}

function handleQuestionClick(event) {
  const toolSectionToggle = event.target.closest('[data-action="toggle-tool-section"]');
  if (toolSectionToggle) {
    const section = toolSectionToggle.closest(".diagram-tool-section");
    if (section) {
      const willExpand = section.classList.contains("is-collapsed");
      section.classList.toggle("is-collapsed", !willExpand);
      toolSectionToggle.setAttribute("aria-expanded", String(willExpand));
      const icon = toolSectionToggle.querySelector("span[aria-hidden='true']");
      if (icon) icon.textContent = willExpand ? "▾" : "▸";
    }
    return;
  }

  const visibilityToggle = event.target.closest("[data-diagram-object-visible]");
  if (visibilityToggle) {
    const row = visibilityToggle.closest("[data-diagram-object-id]");
    const card = row?.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question || !row) return;
    const values = getGraphValuesFromCard(card);
    pushDiagramHistory(question.id, values);
    setObjectVisibility(values, row.dataset.diagramObjectId, visibilityToggle.checked);
    graphDrafts.set(question.id, normalizeGraph(values));
    drawGraphDraftOnCard(card, values);
    renderAllPreviewsDebounced();
    return;
  }

  const objectRow = event.target.closest("[data-diagram-object-id]");
  if (objectRow) {
    const card = objectRow.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;
    diagramObjectSelectionByQuestionId.set(question.id, objectRow.dataset.diagramObjectId);
    diagramMultiObjectSelectionByQuestionId.set(question.id, [objectRow.dataset.diagramObjectId]);
    setActiveDiagramTool(question.id, "select");
    updateDiagramToolButtons(card, "select");
    drawGraphDraftOnCard(card, getGraphValuesFromCard(card));
    return;
  }

  const toolButton = event.target.closest("[data-diagram-tool]");
  if (toolButton) {
    const card = toolButton.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;
    const tool = toolButton.dataset.diagramTool;
    setActiveDiagramTool(question.id, tool);
    updateDiagramToolButtons(card, tool);
    diagramObjectSelectionByQuestionId.delete(question.id);
    diagramMultiObjectSelectionByQuestionId.delete(question.id);
    const values = getGraphValuesFromCard(card);

    if (tool === "angle") {
      const snapField = card.querySelector('[data-graph-field="snapToGrid"]');
      if (snapField) snapField.checked = true;
      values.snapToGrid = true;
      graphDrafts.set(question.id, normalizeGraph(values));
    }

    if (tool === "polygon") { configureRegularPolygonTool(card, question, values); return; }
    if (tool === "irregular-polygon") { configureIrregularPolygonTool(question); return; }
    if (tool === "function") { configureFunctionTool(card, question, values); return; }
    if (tool === "latex-text") { configureLatexTextTool(question); updateDiagramToolHint(card, values); return; }
    if (["circle", "ellipse", "trapezoid", "parallelogram"].includes(tool)) { configureGenericShapeTool(card, question, values, tool); return; }

    if (["point", "segment", "angle", "select", "erase", "move-point"].includes(tool)) {
      if (tool === "point") diagramConstructionByQuestionId.delete(question.id);
      values.graphType = values.graphType === "function" && tool !== "function" ? "points" : values.graphType;
      const graphTypeField = card.querySelector('[data-graph-field="graphType"]');
      if (graphTypeField) graphTypeField.value = values.graphType;
      graphDrafts.set(question.id, normalizeGraph(values));
      updateGraphFieldVisibility(card, values.graphType);
    }
    updateDiagramToolHint(card, values);
    return;
  }

  const graphCanvas = event.target.closest("[data-editor-graph]");
  if (graphCanvas) { handleGraphCanvasClick(event, graphCanvas); return; }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const card = actionButton.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const action = actionButton.dataset.action;
  if (!card || !question) return;

  if (action === "diagram-undo") { undoDiagram(card, question); return; }
  if (action === "diagram-redo") { redoDiagram(card, question); return; }
  if (action === "open-margin-dialog") { openMarginDialog(card, question); return; }
  if (action === "clear-diagram") {
    if (!confirm("Clear every object from this diagram?")) return;
    const values = getGraphValuesFromCard(card);
    pushDiagramHistory(question.id, values);
    const cleared = normalizeGraph({ ...values, points: [], pointsText: "", segments: [], angles: [], regularPolygon: null, shapes: [], expression: "" });
    graphDrafts.set(question.id, cleared);
    diagramObjectSelectionByQuestionId.delete(question.id);
    diagramMultiObjectSelectionByQuestionId.delete(question.id);
    diagramSelectionByQuestionId.delete(question.id);
    diagramConstructionByQuestionId.delete(question.id);
    updatePointsField(card, cleared);
    renderGraphDraft(card, question);
    drawGraphDraftOnCard(card, cleared);
    renderAllPreviewsDebounced();
    return;
  }

  if (action === "toggle-question") {
    question.collapsed = !question.collapsed;
    card.classList.toggle("is-collapsed", question.collapsed);
    actionButton.textContent = question.collapsed ? "Maximize" : "Minimize";
    if (!question.collapsed) setTimeout(drawAllGraphs, MOTION.foldMs);
    renderAllPreviewsDebounced();
    return;
  }
  if (action === "toggle-basic" || action === "toggle-image" || action === "toggle-graph") {
    const sectionName = action.replace("toggle-", "");
    const propertyName = `${sectionName}Collapsed`;
    question[propertyName] = !question[propertyName];
    updateFoldState(card, sectionName, question[propertyName]);
    if (sectionName === "graph" && !question[propertyName]) setTimeout(drawAllGraphs, MOTION.foldMs);
    renderAllPreviewsDebounced();
    return;
  }
  if (action === "remove-image") {
    question.imageData = ""; question.imageAlt = "";
    const upload = card.querySelector('[data-image-upload]');
    const uploadText = card.querySelector("[data-upload-button-text]");
    if (upload) upload.value = "";
    if (uploadText) uploadText.textContent = "Upload image";
    renderImagePreview(card, question);
    renderAllPreviews();
    return;
  }
  if (action === "remove-question") {
    const confirmed = confirm("Remove this question?");
    if (!confirmed) return;
    const toolbarBefore = getToolbarRect();
    const ghost = createQuestionRemovalGhost(card);
    state.questions = state.questions.filter((item) => item.id !== question.id);
    graphDrafts.delete(question.id);
    if (state.questions.length === 0) state.questions.push(createQuestion());
    renderQuestions(); renderAllPreviews({ animatePreview: true }); animateToolbarFrom(toolbarBefore); runQuestionRemovalGhost(ghost);
    return;
  }
  if (action === "add-option") { if (question.type === "true-false") return; question.options.push(""); renderQuestions(); renderAllPreviews(); return; }
  if (action === "remove-option") {
    if (question.type === "true-false") return;
    const index = Number(actionButton.dataset.optionIndex);
    question.options.splice(index, 1);
    if (question.options.length === 0) question.options.push("");
    question.correctOptionIndex = Math.max(0, Math.min(question.correctOptionIndex, question.options.length - 1));
    question.correctOptionIndexes = (question.correctOptionIndexes || []).filter((item) => item !== index).map((item) => item > index ? item - 1 : item);
    renderQuestions(); renderAllPreviews(); return;
  }
  if (action === "generate-graph") {
    const values = getGraphValuesFromCard(card);
    const message = card.querySelector("[data-graph-message]");
    try {
      validateGraphValues(values);
      question.graph = normalizeGraph(values);
      graphDrafts.set(question.id, question.graph);
      message.textContent = describeAttachedGraph(question.graph);
      message.classList.remove("error");
      drawAllGraphs(); renderAllPreviews();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("error");
    }
  }
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  diagramConstructionByQuestionId.delete(question.id);
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  const latest = normalizeGraph(graphDrafts.get(question.id) || values || {});
  pushDiagramHistory(question.id, latest);
  const nextPoint = { label: nextPointLabelForGraph(latest), x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y), labelDx: 8, labelDy: -7, color: "#145c63", size: 5, visible: true };
  const nextPoints = [...latest.points, nextPoint];
  const nextGraph = normalizeGraph({ ...latest, graphType: latest.graphType === "function" ? "points" : latest.graphType, points: nextPoints, pointsText: pointsToText(nextPoints) });
  updatePointsField(card, nextGraph);
  setHiddenGraphField(card, "graphType", nextGraph.graphType);
  graphDrafts.set(question.id, nextGraph);
  updateGraphFieldVisibility(card, nextGraph.graphType);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();
}

function handleSegmentToolClick(card, question, values, meta, canvasX, canvasY) {
  let graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
  let clickedPoint = findClickedPoint(graph, meta, canvasX, canvasY);
  if (!clickedPoint) {
    addManualPointAtCanvasPosition(card, question, graph, meta, canvasX, canvasY);
    graph = normalizeGraph(graphDrafts.get(question.id) || getGraphValuesFromCard(card));
    clickedPoint = { point: graph.points[graph.points.length - 1], source: "manual" };
  }
  const label = sanitizeGraphLabel(clickedPoint.point.label);
  if (!label) return;
  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  if (!selection.length) {
    diagramSelectionByQuestionId.set(question.id, [label]);
    updateDiagramToolHint(card, graph); drawGraphDraftOnCard(card, graph); return;
  }
  const from = selection[0];
  const to = label;
  if (from && to && from !== to && !graph.segments.some((segment) => segmentMatches(segment, from, to))) {
    pushDiagramHistory(question.id, graph);
    graph.segments.push({ from, to, labelMode: "name", visible: true, color: "#145c63", lineWidth: 2, lineDash: "solid" });
  }
  diagramSelectionByQuestionId.delete(question.id);
  const nextGraph = normalizeGraph(graph);
  graphDrafts.set(question.id, nextGraph);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();
}

function handleAngleToolClick(card, question, values, meta, canvasX, canvasY) {
  const graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
  const clickedPoint = findClickedPoint(graph, meta, canvasX, canvasY);
  if (!clickedPoint) return;
  const label = sanitizeGraphLabel(clickedPoint.point.label);
  if (!label) return;
  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  if (selection[selection.length - 1] !== label) selection.push(label);
  diagramSelectionByQuestionId.set(question.id, selection);
  if (selection.length >= 3) {
    const [from, vertex, to] = selection;
    if (from !== vertex && vertex !== to && from !== to) {
      pushDiagramHistory(question.id, graph);
      const angle = { from, vertex, to, labelMode: "value", visible: true, color: "#145c63", radius: 22 };
      graph.angles.push(angle);
      diagramSelectionByQuestionId.delete(question.id);
      const nextGraph = normalizeGraph(graph);
      graphDrafts.set(question.id, nextGraph);
      renderAllPreviewsDebounced();
      drawGraphDraftOnCard(card, nextGraph);
      updateDiagramToolHint(card, nextGraph);
      return;
    }
    diagramSelectionByQuestionId.delete(question.id);
  }
  updateDiagramToolHint(card, graph);
  drawGraphDraftOnCard(card, graph);
}

function handleLatexTextToolClick(card, question, values, meta, canvasX, canvasY) {
  const construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "latex-text") {
    configureLatexTextTool(question);
    return;
  }
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  pushDiagramHistory(question.id, values);
  const settings = construction.settings || {};
  const shape = normalizeShape({ id: nextShapeId(values, "latexText"), type: "latexText", text: settings.text || "", x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y), fill: settings.fill || "#145c63", fontSize: settings.fontSize || 18, label: settings.text || "Text" }, values.shapes.length);
  values.shapes.push(shape);
  diagramConstructionByQuestionId.delete(question.id);
  const nextGraph = normalizeGraph(values);
  graphDrafts.set(question.id, nextGraph);
  renderAllPreviewsDebounced();
  setToolToMovePoint(card, question, nextGraph, `shape:${shape.id}`);
}

function handleGraphCanvasClick(event, canvas) {
  if (suppressNextCanvasClick) { suppressNextCanvasClick = false; return; }
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;
  const values = normalizeGraph(getGraphValuesFromCard(card));
  const meta = canvas.__graphMeta;
  if (!meta) return;
  const pointer = getCanvasPointer(event, canvas);
  if (!isInsidePlot(pointer.x, pointer.y, meta)) return;
  const tool = getActiveDiagramTool(question.id);

  if (tool === "select") {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit) {
      const current = new Set(diagramMultiObjectSelectionByQuestionId.get(question.id) || []);
      if (event.ctrlKey || event.metaKey) {
        if (current.has(hit.id)) current.delete(hit.id); else current.add(hit.id);
      } else {
        current.clear(); current.add(hit.id);
      }
      diagramMultiObjectSelectionByQuestionId.set(question.id, [...current]);
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      drawGraphDraftOnCard(card, values);
    } else if (!(event.ctrlKey || event.metaKey)) {
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramObjectSelectionByQuestionId.delete(question.id);
      drawGraphDraftOnCard(card, values);
    }
    return;
  }
  if (tool === "erase") { eraseObjectAtPosition(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "segment") { handleSegmentToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "angle") { handleAngleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "polygon") { handlePolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "irregular-polygon") { handleIrregularPolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "circle") { handleCircleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "ellipse") { handleEllipseToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "trapezoid" || tool === "parallelogram") { handleTemplateShapeClick(card, question, values, meta, pointer.x, pointer.y, tool); return; }
  if (tool === "latex-text") { handleLatexTextToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "function" || tool === "move-point") return;
  addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
}

function graphDistancePx(a, b, meta) {
  const pa = meta.toPx(a.x, a.y);
  const pb = meta.toPx(b.x, b.y);
  return Math.hypot(pa.px - pb.px, pa.py - pb.py);
}

function getGraphEdges(graph) {
  const edges = [];
  const add = (a, b, source = "edge") => {
    if (a && b && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y)) edges.push({ a, b, source });
  };
  (graph.segments || []).forEach((seg) => add(findPointByLabelInGraph(graph, seg.from), findPointByLabelInGraph(graph, seg.to), "segment"));
  (graph.shapes || []).forEach((shape) => {
    if (shape.visible === false) return;
    if (shape.type === "regularPolygon") {
      const pts = getRegularPolygonPoints(shape);
      pts.forEach((p, i) => add(p, pts[(i + 1) % pts.length], "shape"));
    }
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      const pts = shape.points || [];
      pts.forEach((p, i) => add(p, pts[(i + 1) % pts.length], "shape"));
    }
  });
  return edges;
}

function lineIntersectionGraph(e1, e2) {
  const { a, b } = e1;
  const { a: c, b: d } = e2;
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(den) < 1e-9) return null;
  const px = ((a.x * b.y - a.y * b.x) * (c.x - d.x) - (a.x - b.x) * (c.x * d.y - c.y * d.x)) / den;
  const py = ((a.x * b.y - a.y * b.x) * (c.y - d.y) - (a.y - b.y) * (c.x * d.y - c.y * d.x)) / den;
  const within = (p, q, r) => r >= Math.min(p, q) - 1e-7 && r <= Math.max(p, q) + 1e-7;
  if (within(a.x, b.x, px) && within(a.y, b.y, py) && within(c.x, d.x, px) && within(c.y, d.y, py)) return { x: px, y: py };
  return null;
}

function projectGraphPointToSegment(point, edge) {
  const ax = edge.a.x, ay = edge.a.y, bx = edge.b.x, by = edge.b.y;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / (dx * dx + dy * dy)));
  return { x: ax + t * dx, y: ay + t * dy };
}

function getStickCandidates(graph, meta) {
  const candidates = { intersections: [], points: [], objects: [] };
  (graph.points || []).filter((p) => p.visible !== false).forEach((p) => candidates.points.push({ x: p.x, y: p.y }));
  getShapePointReferences(graph).forEach((ref) => candidates.points.push({ x: ref.point.x, y: ref.point.y }));
  const edges = getGraphEdges(graph);
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const p = lineIntersectionGraph(edges[i], edges[j]);
      if (p) candidates.intersections.push(p);
    }
  }
  candidates.objects = edges;
  return candidates;
}

function nearestGraphPointByPx(point, meta, list, maxPx) {
  let best = null;
  let bestDistance = Infinity;
  list.forEach((candidate) => {
    const distance = graphDistancePx(point, candidate, meta);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  });
  return best && bestDistance <= maxPx ? best : null;
}

function snapGraphPoint(point, meta) {
  const graph = normalizeGraph(meta.graph || {});
  const candidates = getStickCandidates(graph, meta);
  const intersection = nearestGraphPointByPx(point, meta, candidates.intersections, 18);
  if (intersection) return intersection;
  const existingPoint = nearestGraphPointByPx(point, meta, candidates.points, 14);
  if (existingPoint) return existingPoint;
  let bestProjection = null;
  let bestProjectionDistance = Infinity;
  candidates.objects.forEach((edge) => {
    const projected = projectGraphPointToSegment(point, edge);
    const distance = graphDistancePx(point, projected, meta);
    if (distance < bestProjectionDistance) { bestProjectionDistance = distance; bestProjection = projected; }
  });
  if (bestProjection && bestProjectionDistance <= 12) return bestProjection;

  const gridStepX = getNiceSnapStep((meta.xMax - meta.xMin) / 10) || 1;
  const gridStepY = getNiceSnapStep((meta.yMax - meta.yMin) / 10) || 1;
  let x = Math.round(point.x / gridStepX) * gridStepX;
  let y = Math.round(point.y / gridStepY) * gridStepY;
  if (Math.abs(point.x) <= gridStepX * 0.25) x = 0;
  if (Math.abs(point.y) <= gridStepY * 0.25) y = 0;
  return { x, y };
}

function findClickedLabel(graph, meta, clickX, clickY) {
  const hit = (x, y, text) => Math.abs(clickX - x) <= Math.max(14, String(text || "").length * 4.5) && Math.abs(clickY - y) <= 12;
  for (let index = 0; index < (graph.points || []).length; index += 1) {
    const p = graph.points[index];
    const q = meta.toPx(p.x, p.y);
    const lx = q.px + (p.labelDx ?? 8);
    const ly = q.py + (p.labelDy ?? -7);
    if (hit(lx, ly, p.label)) return { kind: "manual", index, labelDx: p.labelDx ?? 8, labelDy: p.labelDy ?? -7 };
  }
  for (let shapeIndex = 0; shapeIndex < (graph.shapes || []).length; shapeIndex += 1) {
    const shape = graph.shapes[shapeIndex];
    if (shape.visible === false) continue;
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      for (let pointIndex = 0; pointIndex < (shape.points || []).length; pointIndex += 1) {
        const p = shape.points[pointIndex];
        const q = meta.toPx(p.x, p.y);
        const lx = q.px + (p.labelDx ?? 8);
        const ly = q.py + (p.labelDy ?? -7);
        if (hit(lx, ly, p.label)) return { kind: "shapePoint", shapeIndex, pointIndex, labelDx: p.labelDx ?? 8, labelDy: p.labelDy ?? -7 };
      }
    }
    if (shape.type === "regularPolygon") {
      const pts = getRegularPolygonPoints(shape);
      for (let pointIndex = 0; pointIndex < pts.length; pointIndex += 1) {
        const p = pts[pointIndex];
        const q = meta.toPx(p.x, p.y);
        const lx = q.px + (p.labelDx ?? 8);
        const ly = q.py + (p.labelDy ?? -7);
        if (hit(lx, ly, p.label)) return { kind: "regularVertex", shapeIndex, pointIndex, labelDx: p.labelDx ?? 8, labelDy: p.labelDy ?? -7 };
      }
    }
    if (shape.type === "latexText") {
      const q = meta.toPx(shape.x, shape.y);
      if (hit(q.px, q.py, shape.text)) return { kind: "text", shapeIndex };
    }
  }
  return null;
}

function getShapeVisualPoints(shape) {
  if (!shape) return [];
  if (shape.type === "regularPolygon") return getRegularPolygonPoints(shape);
  if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) return shape.points || [];
  if (shape.type === "circle") {
    const c = shape.center;
    const r = shape.radius;
    return [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }, { x: c.x + r, y: c.y - r }];
  }
  if (shape.type === "ellipse") {
    const params = getEllipseParams(shape);
    if (!params) return [shape.focus1, shape.focus2, shape.through].filter(Boolean);
    return [{ x: params.cx - params.a, y: params.cy - params.b }, { x: params.cx + params.a, y: params.cy + params.b }];
  }
  if (shape.type === "latexText") return [{ x: shape.x, y: shape.y }];
  return [];
}

function getGraphBoundsForShape(shape) {
  const points = getShapeVisualPoints(shape).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function findShapeTransformHandle(graph, meta, clickX, clickY, objectId) {
  if (!objectId || !objectId.startsWith("shape:")) return null;
  const shapeId = objectId.split(":")[1];
  const shapeIndex = graph.shapes.findIndex((shape) => shape.id === shapeId);
  const shape = graph.shapes[shapeIndex];
  if (!shape) return null;
  const bounds = getGraphBoundsForShape(shape);
  if (!bounds) return null;
  const center = meta.toPx(bounds.cx, bounds.cy);
  const corner = meta.toPx(bounds.xMax, bounds.yMax);
  const rotateHandle = { px: corner.px + 18, py: corner.py - 18 };
  if (Math.hypot(clickX - rotateHandle.px, clickY - rotateHandle.py) <= 12) return { mode: "rotate-shape", shapeIndex, shapeId, bounds, centerGraph: { x: bounds.cx, y: bounds.cy } };
  if (Math.hypot(clickX - center.px, clickY - center.py) <= 13) return { mode: "move-shape", shapeIndex, shapeId, bounds, centerGraph: { x: bounds.cx, y: bounds.cy } };
  const hit = findClickedDiagramObject(graph, meta, clickX, clickY);
  if (hit?.id === objectId) return { mode: "move-shape", shapeIndex, shapeId, bounds, centerGraph: { x: bounds.cx, y: bounds.cy } };
  return null;
}

function translateWholeShape(shape, dx, dy) {
  if (!shape) return;
  if (shape.type === "regularPolygon") { shape.centerX = roundGraphCoordinate(Number(shape.centerX) + dx); shape.centerY = roundGraphCoordinate(Number(shape.centerY) + dy); return; }
  if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) { (shape.points || []).forEach((p) => { p.x = roundGraphCoordinate(Number(p.x) + dx); p.y = roundGraphCoordinate(Number(p.y) + dy); }); return; }
  if (shape.type === "circle") { shape.center.x = roundGraphCoordinate(Number(shape.center.x) + dx); shape.center.y = roundGraphCoordinate(Number(shape.center.y) + dy); return; }
  if (shape.type === "ellipse") { ["focus1", "focus2", "through"].forEach((key) => { shape[key].x = roundGraphCoordinate(Number(shape[key].x) + dx); shape[key].y = roundGraphCoordinate(Number(shape[key].y) + dy); }); return; }
  if (shape.type === "latexText") { shape.x = roundGraphCoordinate(Number(shape.x) + dx); shape.y = roundGraphCoordinate(Number(shape.y) + dy); }
}

function rotatePointAround(point, center, angle) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: roundGraphCoordinate(center.x + dx * Math.cos(angle) - dy * Math.sin(angle)), y: roundGraphCoordinate(center.y + dx * Math.sin(angle) + dy * Math.cos(angle)) };
}

function rotateWholeShape(shape, center, angle) {
  if (!shape) return;
  if (shape.type === "regularPolygon") { shape.rotation = roundGraphCoordinate(Number(shape.rotation || 0) + angle * 180 / Math.PI); return; }
  if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) { (shape.points || []).forEach((p) => Object.assign(p, rotatePointAround(p, center, angle))); return; }
  if (shape.type === "ellipse") { ["focus1", "focus2", "through"].forEach((key) => Object.assign(shape[key], rotatePointAround(shape[key], center, angle))); }
}

function findClickedDraggableHandle(graph, meta, clickX, clickY) {
  const labelHit = findClickedLabel(graph, meta, clickX, clickY);
  if (labelHit) return { kind: "label", labelHit };
  const selectedId = diagramObjectSelectionByQuestionId.get(document.querySelector('[data-editor-graph]')?.closest('[data-question-card]')?.dataset.questionId || "");
  const transform = findShapeTransformHandle(graph, meta, clickX, clickY, selectedId);
  if (transform) return { kind: "transform", transform };
  const point = findClickedPoint(graph, meta, clickX, clickY);
  if (point) return point.source === "manual" ? { kind: "manual", index: point.index, point } : { kind: "shape", shapeIndex: point.shapeIndex, pointIndex: point.index, point };
  return null;
}

function handleGraphPointerDown(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;
  const tool = getActiveDiagramTool(question.id);
  const meta = canvas.__graphMeta;
  if (!meta) return;
  const values = normalizeGraph(getGraphValuesFromCard(card));
  const pointer = getCanvasPointer(event, canvas);

  if (tool === "move-point") {
    const selectedId = diagramObjectSelectionByQuestionId.get(question.id);
    const transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId);
    const labelHit = findClickedLabel(values, meta, pointer.x, pointer.y);
    const handle = labelHit ? { kind: "label", labelHit } : (transform ? { kind: "transform", transform } : findClickedDraggableHandle(values, meta, pointer.x, pointer.y));
    if (handle) {
      const handleId = getHandleObjectIdFromHandle(values, handle);
      if ((event.ctrlKey || event.metaKey) && handleId) { toggleGroupedHandle(question.id, handleId); drawGraphDraftOnCard(card, values); event.preventDefault(); return; }
      const selectedHandles = diagramGroupedHandleSelectionByQuestionId.get(question.id) || [];
      const groupHandles = handleId && selectedHandles.includes(handleId) && selectedHandles.length > 1 ? selectedHandles : (handleId ? [handleId] : []);
      const gp = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      diagramDragState = { card, canvas, questionId: question.id, handle, handleId, groupHandles, startGraph: JSON.parse(JSON.stringify(values)), startPoint: gp, startClientX: event.clientX, startClientY: event.clientY, moved: false, historySaved: false };
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  }
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;
  const card = diagramDragState?.card || canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;
  const pointer = getCanvasPointer(event, canvas);
  const inside = isInsidePlot(pointer.x, pointer.y, meta);

  if (!diagramDragState) {
    const values = normalizeGraph(getGraphValuesFromCard(card));
    const tool = getActiveDiagramTool(question.id);
    if (inside && ["point", "segment", "polygon", "irregular-polygon", "angle", "circle", "ellipse", "trapezoid", "parallelogram", "latex-text"].includes(tool)) {
      let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      if (values.snapToGrid || tool === "angle") graphPoint = snapGraphPoint(graphPoint, meta);
      canvas.__interactionPreview = { point: graphPoint, snap: values.snapToGrid || tool === "angle", tool, visible: true };
    } else canvas.__interactionPreview = null;
    drawGraphDraftOnCard(card, values);
    return;
  }

  const dxClient = event.clientX - diagramDragState.startClientX;
  const dyClient = event.clientY - diagramDragState.startClientY;
  if (!diagramDragState.moved && Math.hypot(dxClient, dyClient) < 3) return;
  diagramDragState.moved = true;
  if (!inside) return;
  let currentPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  if (getGraphValuesFromCard(card).snapToGrid) currentPoint = snapGraphPoint(currentPoint, meta);
  const values = normalizeGraph(JSON.parse(JSON.stringify(diagramDragState.startGraph)));
  if (!diagramDragState.historySaved) { pushDiagramHistory(question.id, normalizeGraph(diagramDragState.startGraph)); diagramDragState.historySaved = true; }

  const handle = diagramDragState.handle;
  if (handle.kind === "label") {
    const dx = event.clientX - diagramDragState.startClientX;
    const dy = event.clientY - diagramDragState.startClientY;
    const hit = handle.labelHit;
    if (hit.kind === "manual" && values.points[hit.index]) { values.points[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx); values.points[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy); }
    if (hit.kind === "shapePoint") { const p = values.shapes?.[hit.shapeIndex]?.points?.[hit.pointIndex]; if (p) { p.labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx); p.labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy); } }
    if (hit.kind === "regularVertex") { const shape = values.shapes?.[hit.shapeIndex]; if (shape) { if (!Array.isArray(shape.vertexLabelOffsets)) shape.vertexLabelOffsets = []; shape.vertexLabelOffsets[hit.pointIndex] = { dx: roundGraphCoordinate((hit.labelDx ?? 8) + dx), dy: roundGraphCoordinate((hit.labelDy ?? -7) + dy) }; } }
    if (hit.kind === "text") { const shape = values.shapes?.[hit.shapeIndex]; if (shape) { const dxg = currentPoint.x - diagramDragState.startPoint.x; const dyg = currentPoint.y - diagramDragState.startPoint.y; shape.x = roundGraphCoordinate(Number(shape.x) + dxg); shape.y = roundGraphCoordinate(Number(shape.y) + dyg); } }
  } else if (handle.kind === "transform") {
    const tr = handle.transform;
    const shape = values.shapes?.[tr.shapeIndex];
    if (shape) {
      if (tr.mode === "move-shape") {
        const dx = currentPoint.x - diagramDragState.startPoint.x;
        const dy = currentPoint.y - diagramDragState.startPoint.y;
        translateWholeShape(shape, dx, dy);
      } else if (tr.mode === "rotate-shape") {
        const startAngle = Math.atan2(diagramDragState.startPoint.y - tr.centerGraph.y, diagramDragState.startPoint.x - tr.centerGraph.x);
        const currentAngle = Math.atan2(currentPoint.y - tr.centerGraph.y, currentPoint.x - tr.centerGraph.x);
        rotateWholeShape(shape, tr.centerGraph, currentAngle - startAngle);
      }
    }
  } else if (diagramDragState.groupHandles && diagramDragState.groupHandles.length > 1) {
    const dx = currentPoint.x - diagramDragState.startPoint.x;
    const dy = currentPoint.y - diagramDragState.startPoint.y;
    diagramDragState.groupHandles.forEach((handleId) => translateHandleById(values, handleId, dx, dy));
  } else if (handle.kind === "manual") {
    if (values.points[handle.index]) values.points[handle.index] = { ...values.points[handle.index], x: roundGraphCoordinate(currentPoint.x), y: roundGraphCoordinate(currentPoint.y) };
  } else if (handle.kind === "shape") {
    const shape = values.shapes?.[handle.shapeIndex];
    applyShapeHandleMove(shape, handle, currentPoint);
  }

  updatePointsField(card, values);
  graphDrafts.set(question.id, normalizeGraph(values));
  canvas.__interactionPreview = { point: currentPoint, snap: getGraphValuesFromCard(card).snapToGrid, tool: "move-point", visible: true };
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
}

function drawTransformOverlay(canvas, rawGraph) {
  const meta = canvas.__graphMeta;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!meta || !question) return;
  const graph = normalizeGraph(rawGraph || meta.graph || getGraphValuesFromCard(card));
  const selectedIds = new Set(diagramMultiObjectSelectionByQuestionId.get(question.id) || []);
  const single = diagramObjectSelectionByQuestionId.get(question.id);
  if (single) selectedIds.add(single);
  if (!selectedIds.size) return;
  const ctx = canvas.getContext("2d");
  ctx.save();
  selectedIds.forEach((id) => {
    if (!id.startsWith("shape:")) return;
    const shapeId = id.split(":")[1];
    const shape = graph.shapes.find((item) => item.id === shapeId);
    if (!shape) return;
    const bounds = getGraphBoundsForShape(shape);
    if (!bounds) return;
    const a = meta.toPx(bounds.xMin, bounds.yMin);
    const b = meta.toPx(bounds.xMax, bounds.yMax);
    const left = Math.min(a.px, b.px), right = Math.max(a.px, b.px), top = Math.min(a.py, b.py), bottom = Math.max(a.py, b.py);
    const center = meta.toPx(bounds.cx, bounds.cy);
    ctx.strokeStyle = "rgba(0, 172, 193, 0.8)";
    ctx.fillStyle = "rgba(0, 172, 193, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(center.px, center.py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const rotateX = right + 18, rotateY = top - 18;
    ctx.beginPath(); ctx.arc(rotateX, rotateY, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(right, top); ctx.lineTo(rotateX, rotateY); ctx.stroke();
    ctx.font = "700 13px Inter, Arial, sans-serif";
    ctx.fillStyle = "#145c63";
    ctx.fillText("↻", rotateX - 4, rotateY + 5);
  });
  ctx.restore();
}

const drawGraphBeforeStage3 = drawGraph;
drawGraph = function drawGraphWithTransformOverlay(canvas, rawGraph) {
  drawGraphBeforeStage3(canvas, rawGraph);
  drawTransformOverlay(canvas, rawGraph);
};


function eraseObjectById(graph, objectId) {
  if (!objectId) return;
  if (objectId.startsWith("point:")) {
    const label = objectId.split(":")[1];
    graph.points = (graph.points || []).filter((point) => sanitizeGraphLabel(point.label) !== label);
    graph.segments = (graph.segments || []).filter((segment) => segment.from !== label && segment.to !== label);
    graph.angles = (graph.angles || []).filter((angle) => angle.from !== label && angle.vertex !== label && angle.to !== label);
    graph.pointsText = pointsToText(graph.points);
    return;
  }
  if (objectId.startsWith("segment:")) {
    const parts = objectId.split(":");
    const from = parts[1];
    const to = parts[2];
    graph.segments = (graph.segments || []).filter((segment) => !segmentMatches(segment, from, to));
    return;
  }
  if (objectId.startsWith("angle:")) {
    const key = objectId.split(":")[1];
    graph.angles = (graph.angles || []).filter((angle) => getAngleObjectId(angle) !== objectId && `${angle.from}${angle.vertex}${angle.to}` !== key);
    return;
  }
  if (objectId.startsWith("shape:")) {
    const shapeId = objectId.split(":")[1];
    graph.shapes = (graph.shapes || []).filter((shape) => shape.id !== shapeId);
  }
}

const findClickedDiagramObjectBeforeStage3 = findClickedDiagramObject;
findClickedDiagramObject = function findClickedDiagramObjectWithLatex(graph, meta, clickX, clickY) {
  const hit = findClickedDiagramObjectBeforeStage3(graph, meta, clickX, clickY);
  if (hit) return hit;
  const normalized = normalizeGraph(graph);
  for (const shape of normalized.shapes || []) {
    if (shape.visible === false || shape.type !== "latexText") continue;
    const p = meta.toPx(shape.x, shape.y);
    const width = Math.max(24, String(shape.text || shape.label || "").length * (Number(shape.fontSize) || 18) * 0.52);
    const height = Math.max(14, Number(shape.fontSize) || 18);
    if (Math.abs(clickX - p.px) <= width / 2 && Math.abs(clickY - p.py) <= height) {
      return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
    }
  }
  return null;
};

function deleteSelectedDiagramObjects() {
  const activeElement = document.activeElement;
  if (activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName)) return;
  document.querySelectorAll("[data-question-card]").forEach((card) => {
    const question = findQuestion(card.dataset.questionId);
    if (!question) return;
    const selected = new Set(diagramMultiObjectSelectionByQuestionId.get(question.id) || []);
    const single = diagramObjectSelectionByQuestionId.get(question.id);
    if (single) selected.add(single);
    if (!selected.size) return;
    const graph = normalizeGraph(getGraphValuesFromCard(card));
    pushDiagramHistory(question.id, graph);
    selected.forEach((id) => eraseObjectById(graph, id));
    diagramMultiObjectSelectionByQuestionId.delete(question.id);
    diagramObjectSelectionByQuestionId.delete(question.id);
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    updatePointsField(card, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Delete" || event.key === "Backspace") {
    deleteSelectedDiagramObjects();
  }
});


/* ===== Stage 4 label movement, text insertion, snap/rotation, and UI fixes ===== */
function normalizeSegment(segment) {
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
    lineWidth: Number.isFinite(Number(segment.lineWidth)) ? Math.max(1, Number(segment.lineWidth)) : 2,
    lineDash: ["solid", "dashed", "dotted"].includes(segment.lineDash) ? segment.lineDash : "solid",
    labelDx: Number.isFinite(Number(segment.labelDx)) ? Number(segment.labelDx) : 0,
    labelDy: Number.isFinite(Number(segment.labelDy)) ? Number(segment.labelDy) : -10
  };
}

function normalizeAngle(angle) {
  if (!angle || typeof angle !== "object") return null;
  const from = sanitizeGraphLabel(angle.from);
  const vertex = sanitizeGraphLabel(angle.vertex);
  const to = sanitizeGraphLabel(angle.to);
  if (!from || !vertex || !to || from === vertex || vertex === to) return null;
  return {
    from,
    vertex,
    to,
    labelMode: ["name", "value", "variable", "blank", "none"].includes(angle.labelMode) ? angle.labelMode : "name",
    visible: angle.visible !== false,
    color: isHexColor(angle.color) ? angle.color : "#145c63",
    radius: Number.isFinite(Number(angle.radius)) ? Math.max(8, Number(angle.radius)) : 22,
    labelDx: Number.isFinite(Number(angle.labelDx)) ? Number(angle.labelDx) : 0,
    labelDy: Number.isFinite(Number(angle.labelDy)) ? Number(angle.labelDy) : 0
  };
}

function drawSegments(ctx, graph, meta, polygonPoints = []) {
  const polygonSegments = polygonPoints.length >= 3
    ? polygonPoints.map((point, index) => {
        const next = polygonPoints[(index + 1) % polygonPoints.length];
        const key = makeSegmentKeyLabels(point.label, next.label);
        return {
          from: point.label,
          to: next.label,
          labelMode: graph.regularPolygon?.segmentLabelModes?.[key] || "name",
          polygon: true,
          polygonSegmentKey: key,
          visible: graph.regularPolygon?.visible !== false,
          color: graph.regularPolygon?.stroke || "#145c63",
          lineWidth: graph.regularPolygon?.lineWidth || 2,
          lineDash: graph.regularPolygon?.lineDash || "solid",
          labelDx: 0,
          labelDy: -10
        };
      })
    : [];

  const segments = [...polygonSegments, ...(graph.segments || [])].filter((segment) => segment.visible !== false);
  if (!segments.length) return;

  ctx.save();
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  segments.forEach((segment) => {
    const start = findPointByLabelInGraph(graph, segment.from);
    const end = findPointByLabelInGraph(graph, segment.to);
    if (!start || !end) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    ctx.save();
    ctx.strokeStyle = segment.color || "#145c63";
    ctx.fillStyle = segment.color || "#145c63";
    ctx.lineWidth = segment.lineWidth || 2;
    applyCanvasLineDash(ctx, segment.lineDash || "solid");
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = getSegmentLabel(start, end, segment.labelMode);
    if (label) {
      const labelX = (a.px + b.px) / 2 + (Number(segment.labelDx) || 0);
      const labelY = (a.py + b.py) / 2 + (Number(segment.labelDy) || -10);
      if (segment.labelMode === "name") drawTextWithOverbar(ctx, label, labelX, labelY);
      else drawTextWithHalo(ctx, label, labelX, labelY);
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawAngles(ctx, graph, meta) {
  const angles = (graph.angles || []).filter((angle) => angle.visible !== false);
  if (!angles.length) return;
  ctx.save();
  ctx.lineWidth = 1.7;
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  angles.forEach((angle) => {
    if (angle.labelMode === "none") return;
    const from = findPointByLabelInGraph(graph, angle.from);
    const vertex = findPointByLabelInGraph(graph, angle.vertex);
    const to = findPointByLabelInGraph(graph, angle.to);
    if (!from || !vertex || !to) return;
    const arc = getAngleArc(from, vertex, to, meta);
    const radius = angle.radius || 22;
    ctx.strokeStyle = angle.color || "#145c63";
    ctx.fillStyle = angle.color || "#145c63";
    ctx.beginPath();
    ctx.arc(arc.vertexPx.px, arc.vertexPx.py, radius, arc.start, arc.end, arc.counterclockwise);
    ctx.stroke();
    const label = getAngleLabel(from, vertex, to, angle.labelMode);
    if (label && angle.labelMode !== "blank") {
      const labelX = arc.vertexPx.px + Math.cos(arc.middle) * (radius + 16) + (Number(angle.labelDx) || 0);
      const labelY = arc.vertexPx.py + Math.sin(arc.middle) * (radius + 16) + (Number(angle.labelDy) || 0);
      drawTextWithHalo(ctx, label, labelX, labelY);
    }
  });
  ctx.restore();
}

function getSegmentLabelAnchor(segment, graph, meta) {
  const start = findPointByLabelInGraph(graph, segment.from);
  const end = findPointByLabelInGraph(graph, segment.to);
  if (!start || !end) return null;
  const a = meta.toPx(start.x, start.y);
  const b = meta.toPx(end.x, end.y);
  return {
    x: (a.px + b.px) / 2 + (Number(segment.labelDx) || 0),
    y: (a.py + b.py) / 2 + (Number(segment.labelDy) || -10),
    text: getSegmentLabel(start, end, segment.labelMode)
  };
}

function getAngleLabelAnchor(angle, graph, meta) {
  const from = findPointByLabelInGraph(graph, angle.from);
  const vertex = findPointByLabelInGraph(graph, angle.vertex);
  const to = findPointByLabelInGraph(graph, angle.to);
  if (!from || !vertex || !to || angle.labelMode === "none" || angle.labelMode === "blank") return null;
  const arc = getAngleArc(from, vertex, to, meta);
  const radius = angle.radius || 22;
  return {
    x: arc.vertexPx.px + Math.cos(arc.middle) * (radius + 16) + (Number(angle.labelDx) || 0),
    y: arc.vertexPx.py + Math.sin(arc.middle) * (radius + 16) + (Number(angle.labelDy) || 0),
    text: getAngleLabel(from, vertex, to, angle.labelMode)
  };
}

function findClickedLabel(graph, meta, clickX, clickY) {
  const hit = (x, y, text) => Math.abs(clickX - x) <= Math.max(14, String(text || "").length * 4.8) && Math.abs(clickY - y) <= 13;

  for (let index = 0; index < (graph.points || []).length; index += 1) {
    const p = graph.points[index];
    const q = meta.toPx(p.x, p.y);
    const lx = q.px + (p.labelDx ?? 8);
    const ly = q.py + (p.labelDy ?? -7);
    if (hit(lx, ly, p.label)) return { kind: "manual", index, labelDx: p.labelDx ?? 8, labelDy: p.labelDy ?? -7 };
  }

  for (let index = 0; index < (graph.segments || []).length; index += 1) {
    const segment = graph.segments[index];
    if (segment.visible === false) continue;
    const anchor = getSegmentLabelAnchor(segment, graph, meta);
    if (anchor?.text && hit(anchor.x, anchor.y, anchor.text)) {
      return { kind: "segmentLabel", index, labelDx: segment.labelDx ?? 0, labelDy: segment.labelDy ?? -10 };
    }
  }

  for (let index = 0; index < (graph.angles || []).length; index += 1) {
    const angle = graph.angles[index];
    if (angle.visible === false) continue;
    const anchor = getAngleLabelAnchor(angle, graph, meta);
    if (anchor?.text && hit(anchor.x, anchor.y, anchor.text)) {
      return { kind: "angleLabel", index, labelDx: angle.labelDx ?? 0, labelDy: angle.labelDy ?? 0 };
    }
  }

  for (let shapeIndex = 0; shapeIndex < (graph.shapes || []).length; shapeIndex += 1) {
    const shape = graph.shapes[shapeIndex];
    if (shape.visible === false) continue;
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      for (let pointIndex = 0; pointIndex < (shape.points || []).length; pointIndex += 1) {
        const p = shape.points[pointIndex];
        const q = meta.toPx(p.x, p.y);
        const lx = q.px + (p.labelDx ?? 8);
        const ly = q.py + (p.labelDy ?? -7);
        if (hit(lx, ly, p.label)) return { kind: "shapePoint", shapeIndex, pointIndex, labelDx: p.labelDx ?? 8, labelDy: p.labelDy ?? -7 };
      }
    }
    if (shape.type === "regularPolygon") {
      const pts = getRegularPolygonPoints(shape);
      for (let pointIndex = 0; pointIndex < pts.length; pointIndex += 1) {
        const p = pts[pointIndex];
        const q = meta.toPx(p.x, p.y);
        const lx = q.px + (p.labelDx ?? 8);
        const ly = q.py + (p.labelDy ?? -7);
        if (hit(lx, ly, p.label)) return { kind: "regularVertex", shapeIndex, pointIndex, labelDx: p.labelDx ?? 8, labelDy: p.labelDy ?? -7 };
      }
    }
    if (shape.type === "latexText") {
      const q = meta.toPx(shape.x, shape.y);
      if (hit(q.px, q.py, shape.text)) return { kind: "text", shapeIndex };
    }
  }
  return null;
}

function snapAngleRadians(angle, incrementDeg = 15, toleranceDeg = 5) {
  const deg = angle * 180 / Math.PI;
  const nearest = Math.round(deg / incrementDeg) * incrementDeg;
  return Math.abs(nearest - deg) <= toleranceDeg ? nearest * Math.PI / 180 : angle;
}

function configureLatexTextTool(question) {
  openDiagramDialog({
    title: "LaTeX text settings",
    description: "Add a short text or LaTeX-style string to the diagram. It is drawn on the canvas as editable text.",
    fields: [
      { name: "text", label: "Text / LaTeX", type: "text", value: "x^2 + y^2 = r^2", full: true },
      { name: "fill", label: "Text color", type: "color", value: "#145c63" },
      { name: "fontSize", label: "Font size", type: "number", min: 8, max: 48, step: 1, value: 18 }
    ]
  }).then((result) => {
    if (!result) {
      diagramConstructionByQuestionId.delete(question.id);
      return;
    }
    const text = String(result.text || "").trim();
    if (!text) {
      diagramConstructionByQuestionId.delete(question.id);
      return;
    }
    diagramConstructionByQuestionId.set(question.id, {
      tool: "latex-text",
      settings: {
        text,
        fill: isHexColor(result.fill) ? result.fill : "#145c63",
        fontSize: Number.isFinite(Number(result.fontSize)) ? Number(result.fontSize) : 18
      }
    });
  });
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;
  const card = diagramDragState?.card || canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;
  const pointer = getCanvasPointer(event, canvas);
  const inside = isInsidePlot(pointer.x, pointer.y, meta);

  if (!diagramDragState) {
    const values = normalizeGraph(getGraphValuesFromCard(card));
    const tool = getActiveDiagramTool(question.id);
    if (inside && ["point", "segment", "polygon", "irregular-polygon", "angle", "circle", "ellipse", "trapezoid", "parallelogram", "latex-text"].includes(tool)) {
      let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      if (values.snapToGrid || tool === "angle") graphPoint = snapGraphPoint(graphPoint, meta);
      canvas.__interactionPreview = { point: graphPoint, snap: values.snapToGrid || tool === "angle", tool, visible: true };
    } else canvas.__interactionPreview = null;
    drawGraphDraftOnCard(card, values);
    return;
  }

  const dxClient = event.clientX - diagramDragState.startClientX;
  const dyClient = event.clientY - diagramDragState.startClientY;
  if (!diagramDragState.moved && Math.hypot(dxClient, dyClient) < 3) return;
  diagramDragState.moved = true;
  if (!inside) return;
  let currentPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  if (getGraphValuesFromCard(card).snapToGrid) currentPoint = snapGraphPoint(currentPoint, meta);
  const values = normalizeGraph(JSON.parse(JSON.stringify(diagramDragState.startGraph)));
  if (!diagramDragState.historySaved) { pushDiagramHistory(question.id, normalizeGraph(diagramDragState.startGraph)); diagramDragState.historySaved = true; }

  const handle = diagramDragState.handle;
  if (handle.kind === "label") {
    const dx = event.clientX - diagramDragState.startClientX;
    const dy = event.clientY - diagramDragState.startClientY;
    const hit = handle.labelHit;
    if (hit.kind === "manual" && values.points[hit.index]) { values.points[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx); values.points[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy); }
    if (hit.kind === "segmentLabel" && values.segments[hit.index]) { values.segments[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx); values.segments[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -10) + dy); }
    if (hit.kind === "angleLabel" && values.angles[hit.index]) { values.angles[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx); values.angles[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? 0) + dy); }
    if (hit.kind === "shapePoint") { const p = values.shapes?.[hit.shapeIndex]?.points?.[hit.pointIndex]; if (p) { p.labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx); p.labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy); } }
    if (hit.kind === "regularVertex") { const shape = values.shapes?.[hit.shapeIndex]; if (shape) { if (!Array.isArray(shape.vertexLabelOffsets)) shape.vertexLabelOffsets = []; shape.vertexLabelOffsets[hit.pointIndex] = { dx: roundGraphCoordinate((hit.labelDx ?? 8) + dx), dy: roundGraphCoordinate((hit.labelDy ?? -7) + dy) }; } }
    if (hit.kind === "text") { const shape = values.shapes?.[hit.shapeIndex]; if (shape) { const dxg = currentPoint.x - diagramDragState.startPoint.x; const dyg = currentPoint.y - diagramDragState.startPoint.y; shape.x = roundGraphCoordinate(Number(shape.x) + dxg); shape.y = roundGraphCoordinate(Number(shape.y) + dyg); } }
  } else if (handle.kind === "transform") {
    const tr = handle.transform;
    const shape = values.shapes?.[tr.shapeIndex];
    if (shape) {
      if (tr.mode === "move-shape") {
        const dx = currentPoint.x - diagramDragState.startPoint.x;
        const dy = currentPoint.y - diagramDragState.startPoint.y;
        translateWholeShape(shape, dx, dy);
      } else if (tr.mode === "rotate-shape") {
        const startAngle = Math.atan2(diagramDragState.startPoint.y - tr.centerGraph.y, diagramDragState.startPoint.x - tr.centerGraph.x);
        let currentAngle = Math.atan2(currentPoint.y - tr.centerGraph.y, currentPoint.x - tr.centerGraph.x);
        currentAngle = snapAngleRadians(currentAngle, 15, 5);
        rotateWholeShape(shape, tr.centerGraph, currentAngle - startAngle);
      }
    }
  } else if (diagramDragState.groupHandles && diagramDragState.groupHandles.length > 1) {
    const dx = currentPoint.x - diagramDragState.startPoint.x;
    const dy = currentPoint.y - diagramDragState.startPoint.y;
    diagramDragState.groupHandles.forEach((handleId) => translateHandleById(values, handleId, dx, dy));
  } else if (handle.kind === "manual") {
    if (values.points[handle.index]) values.points[handle.index] = { ...values.points[handle.index], x: roundGraphCoordinate(currentPoint.x), y: roundGraphCoordinate(currentPoint.y) };
  } else if (handle.kind === "shape") {
    const shape = values.shapes?.[handle.shapeIndex];
    applyShapeHandleMove(shape, handle, currentPoint);
  }

  updatePointsField(card, values);
  graphDrafts.set(question.id, normalizeGraph(values));
  canvas.__interactionPreview = { point: currentPoint, snap: getGraphValuesFromCard(card).snapToGrid, tool: "move-point", visible: true };
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  diagramConstructionByQuestionId.delete(question.id);
  diagramSelectionByQuestionId.delete(question.id);
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  const latest = normalizeGraph(graphDrafts.get(question.id) || values || {});
  pushDiagramHistory(question.id, latest);
  const nextPoint = { label: nextPointLabelForGraph(latest), x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y), labelDx: 8, labelDy: -7, color: "#145c63", size: 5, visible: true };
  const nextPoints = [...latest.points, nextPoint];
  const nextGraph = normalizeGraph({ ...latest, graphType: latest.graphType === "function" ? "points" : latest.graphType, points: nextPoints, pointsText: pointsToText(nextPoints) });
  updatePointsField(card, nextGraph);
  setHiddenGraphField(card, "graphType", nextGraph.graphType);
  graphDrafts.set(question.id, nextGraph);
  updateGraphFieldVisibility(card, nextGraph.graphType);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();
}

/* Add missing segment outline type to object-property dialogs. */
const editDiagramObjectPropertiesAsyncBeforeStage4 = editDiagramObjectPropertiesAsync;
editDiagramObjectPropertiesAsync = function editDiagramObjectPropertiesAsyncStage4(card, question, graph, objectId) {
  const hit = getDiagramObjectById(graph, objectId);
  if (hit?.kind !== "segment") {
    return editDiagramObjectPropertiesAsyncBeforeStage4(card, question, graph, objectId);
  }
  const obj = hit.ref;
  openDiagramDialog({
    title: "Segment properties",
    description: "Adjust this segment's label and line style.",
    fields: [
      { name: "labelMode", label: "Label", type: "select", value: obj.labelMode || "name", options: [
        { value: "name", label: "Name" }, { value: "length", label: "Length" }, { value: "variable", label: "Variable x" }, { value: "hidden", label: "Hidden" }
      ]},
      { name: "color", label: "Line color", type: "color", value: obj.color || "#145c63" },
      { name: "lineDash", label: "Outline type", type: "select", value: obj.lineDash || "solid", options: [
        { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
      ]},
      { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: obj.lineWidth || 2 },
      { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
    ]
  }).then((result) => {
    if (!result) return;
    pushDiagramHistory(question.id, graph);
    obj.labelMode = result.labelMode || obj.labelMode;
    obj.color = isHexColor(result.color) ? result.color : obj.color;
    obj.lineDash = ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : (obj.lineDash || "solid");
    obj.lineWidth = parseNumberOrDefault(result.lineWidth, obj.lineWidth || 2);
    obj.visible = Boolean(result.visible);
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
};



/* ===== Stage 5 focused interaction fixes ===== */
function snapAngleRadians(angle) { return angle; }

function drawGeometryBackground(ctx, meta) {
  const { padding, plotWidth, plotHeight } = meta;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);
  ctx.restore();
}

function toCanvasMathText(text) {
  let value = String(text || "").trim();
  value = value.replace(/^\$+|\$+$/g, "");
  const supers = { "0":"⁰", "1":"¹", "2":"²", "3":"³", "4":"⁴", "5":"⁵", "6":"⁶", "7":"⁷", "8":"⁸", "9":"⁹", "+":"⁺", "-":"⁻", "=":"⁼", "(":"⁽", ")":"⁾", "n":"ⁿ", "i":"ⁱ" };
  const subs = { "0":"₀", "1":"₁", "2":"₂", "3":"₃", "4":"₄", "5":"₅", "6":"₆", "7":"₇", "8":"₈", "9":"₉", "+":"₊", "-":"₋", "=":"₌", "(":"₍", ")":"₎" };
  const convertRun = (run, map) => String(run).split("").map((ch) => map[ch] || ch).join("");
  value = value.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  value = value.replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)");
  value = value.replace(/\\cdot/g, "·").replace(/\\times/g, "×").replace(/\\pi/g, "π").replace(/\\theta/g, "θ").replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\gamma/g, "γ");
  value = value.replace(/\^\{([^{}]+)\}/g, (_, run) => convertRun(run, supers));
  value = value.replace(/_\{([^{}]+)\}/g, (_, run) => convertRun(run, subs));
  value = value.replace(/\^([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, supers));
  value = value.replace(/_([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, subs));
  value = value.replace(/\\([A-Za-z]+)/g, "$1");
  return value;
}

function drawTextShape(ctx, shape, meta) {
  if (!shape.text) return;
  const p = meta.toPx(shape.x, shape.y);
  ctx.save();
  ctx.fillStyle = shape.fill || shape.stroke || "#145c63";
  ctx.font = `700 ${Math.max(8, Number(shape.fontSize) || 18)}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawTextWithHalo(ctx, toCanvasMathText(shape.text), p.px, p.py);
  ctx.restore();
}

function makeShapeSegmentKey(shape, index, start, end) {
  return makeSegmentKeyLabels(start?.label || `P${index}`, end?.label || `P${index + 1}`);
}

function getSegmentOffsetFromContainer(container, key) {
  const offset = container?.segmentLabelOffsets?.[key] || {};
  return { dx: Number.isFinite(Number(offset.dx)) ? Number(offset.dx) : 0, dy: Number.isFinite(Number(offset.dy)) ? Number(offset.dy) : -10 };
}

function getSegmentStyleFromContainer(container, key) {
  const style = container?.segmentStyles?.[key] || {};
  return {
    color: isHexColor(style.color) ? style.color : (container?.stroke || "#145c63"),
    lineWidth: Number.isFinite(Number(style.lineWidth)) ? Math.max(1, Number(style.lineWidth)) : (container?.lineWidth || 2),
    lineDash: ["solid", "dashed", "dotted"].includes(style.lineDash) ? style.lineDash : (container?.lineDash || "solid")
  };
}

function drawRegularPolygonShapeSegments(ctx, shape, points, meta) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const key = makeShapeSegmentKey(shape, index, start, end);
    const mode = shape.segmentLabelModes?.[key] || "name";
    const label = getSegmentLabel(start, end, mode);
    if (!label) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    const offset = getSegmentOffsetFromContainer(shape, key);
    const style = getSegmentStyleFromContainer(shape, key);
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    const labelX = (a.px + b.px) / 2 + offset.dx;
    const labelY = (a.py + b.py) / 2 + offset.dy;
    if (mode === "name") drawTextWithOverbar(ctx, label, labelX, labelY);
    else drawTextWithHalo(ctx, label, labelX, labelY);
  });
  ctx.restore();
}

function drawShapeEdgeLabels(ctx, shape, points, meta) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  ctx.font = "600 12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const key = makeShapeSegmentKey(shape, index, start, end);
    const mode = shape.segmentLabelModes?.[key] || "name";
    const label = getSegmentLabel(start, end, mode);
    if (!label) return;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    const offset = getSegmentOffsetFromContainer(shape, key);
    const style = getSegmentStyleFromContainer(shape, key);
    ctx.fillStyle = style.color;
    const labelX = (a.px + b.px) / 2 + offset.dx;
    const labelY = (a.py + b.py) / 2 + offset.dy;
    if (mode === "name") drawTextWithOverbar(ctx, label, labelX, labelY);
    else drawTextWithHalo(ctx, label, labelX, labelY);
  });
  ctx.restore();
}

function drawShapeSegmentLines(ctx, shape, points, meta) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const key = makeShapeSegmentKey(shape, index, start, end);
    const style = getSegmentStyleFromContainer(shape, key);
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    applyCanvasLineDash(ctx, style.lineDash);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();
}

function drawClosedPointShape(ctx, shape, meta) {
  const points = Array.isArray(shape.points) ? shape.points : [];
  if (points.length < 2) return;
  ctx.save();
  ctx.fillStyle = shape.fill || "rgba(0, 172, 193, 0.06)";
  const first = meta.toPx(points[0].x, points[0].y);
  ctx.beginPath();
  ctx.moveTo(first.px, first.py);
  points.slice(1).forEach((point) => { const p = meta.toPx(point.x, point.y); ctx.lineTo(p.px, p.py); });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawShapeSegmentLines(ctx, shape, points, meta);
  drawShapeEdgeLabels(ctx, shape, points, meta);
}

function findClickedLabel(graph, meta, clickX, clickY) {
  const hit = (x, y, text) => Math.abs(clickX - x) <= Math.max(14, String(text || "").length * 4.8) && Math.abs(clickY - y) <= 13;
  for (let index = 0; index < (graph.points || []).length; index += 1) {
    const p = graph.points[index]; const q = meta.toPx(p.x, p.y); const lx = q.px + (p.labelDx ?? 8); const ly = q.py + (p.labelDy ?? -7);
    if (hit(lx, ly, p.label)) return { kind: "manual", index, labelDx: p.labelDx ?? 8, labelDy: p.labelDy ?? -7 };
  }
  for (let index = 0; index < (graph.segments || []).length; index += 1) {
    const segment = graph.segments[index]; const anchor = getSegmentLabelAnchor(segment, graph, meta);
    if (anchor && anchor.text && hit(anchor.x, anchor.y, anchor.text)) return { kind: "segmentLabel", index, labelDx: segment.labelDx ?? 0, labelDy: segment.labelDy ?? -10 };
  }
  for (let index = 0; index < (graph.angles || []).length; index += 1) {
    const angle = graph.angles[index]; const anchor = getAngleLabelAnchor(angle, graph, meta);
    if (anchor && anchor.text && hit(anchor.x, anchor.y, anchor.text)) return { kind: "angleLabel", index, labelDx: angle.labelDx ?? 0, labelDy: angle.labelDy ?? 0 };
  }
  for (let shapeIndex = 0; shapeIndex < (graph.shapes || []).length; shapeIndex += 1) {
    const shape = graph.shapes[shapeIndex]; if (shape.visible === false) continue;
    const points = shape.type === "regularPolygon" ? getRegularPolygonPoints(shape) : (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type) ? (shape.points || []) : []);
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex]; const p = meta.toPx(point.x, point.y); const lx = p.px + (point.labelDx ?? 8); const ly = p.py + (point.labelDy ?? -7);
      if (hit(lx, ly, point.label)) return { kind: shape.type === "regularPolygon" ? "regularVertex" : "shapePoint", shapeIndex, pointIndex, labelDx: point.labelDx ?? 8, labelDy: point.labelDy ?? -7 };
    }
    for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
      const start = points[edgeIndex], end = points[(edgeIndex + 1) % points.length]; const key = makeShapeSegmentKey(shape, edgeIndex, start, end); const mode = shape.segmentLabelModes?.[key] || "name"; const text = getSegmentLabel(start, end, mode);
      if (!text) continue;
      const a = meta.toPx(start.x, start.y), b = meta.toPx(end.x, end.y); const offset = getSegmentOffsetFromContainer(shape, key); const x = (a.px + b.px) / 2 + offset.dx; const y = (a.py + b.py) / 2 + offset.dy;
      if (hit(x, y, text)) return { kind: "shapeSegmentLabel", shapeIndex, edgeIndex, key, labelDx: offset.dx, labelDy: offset.dy };
    }
    if (shape.type === "latexText") {
      const p = meta.toPx(shape.x, shape.y); const text = toCanvasMathText(shape.text || ""); if (hit(p.px, p.py, text)) return { kind: "text", shapeIndex };
    }
  }
  return null;
}

function getOrCreatePointForConstruction(card, question, graph, meta, canvasX, canvasY) {
  let clickedPoint = findClickedPoint(graph, meta, canvasX, canvasY);
  if (clickedPoint) return { graph, point: clickedPoint.point };
  let p = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (graph.snapToGrid) p = snapGraphPoint(p, meta);
  const nextPoint = { label: nextPointLabelForGraph(graph), x: roundGraphCoordinate(p.x), y: roundGraphCoordinate(p.y), labelDx: 8, labelDy: -7, color: "#145c63", size: 5, visible: true };
  graph.points = [...(graph.points || []), nextPoint];
  graph.pointsText = pointsToText(graph.points);
  updatePointsField(card, graph);
  graphDrafts.set(question.id, normalizeGraph(graph));
  return { graph: normalizeGraph(graph), point: nextPoint };
}

function handleSegmentToolClick(card, question, values, meta, canvasX, canvasY) {
  let graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
  const created = getOrCreatePointForConstruction(card, question, graph, meta, canvasX, canvasY);
  graph = created.graph;
  const label = sanitizeGraphLabel(created.point?.label);
  if (!label) return;
  const selection = diagramSelectionByQuestionId.get(question.id) || [];
  if (!selection.length) {
    diagramSelectionByQuestionId.set(question.id, [label]);
    graphDrafts.set(question.id, normalizeGraph(graph));
    drawGraphDraftOnCard(card, graph); updateDiagramToolHint(card, graph); renderAllPreviewsDebounced(); return;
  }
  const from = selection[0], to = label;
  if (from && to && from !== to && !graph.segments.some((segment) => segmentMatches(segment, from, to))) {
    pushDiagramHistory(question.id, graph);
    graph.segments.push({ from, to, labelMode: "name", visible: true, color: "#145c63", lineWidth: 2, lineDash: "solid", labelDx: 0, labelDy: -10 });
  }
  diagramSelectionByQuestionId.delete(question.id);
  const nextGraph = normalizeGraph(graph);
  graphDrafts.set(question.id, nextGraph); updatePointsField(card, nextGraph); drawGraphDraftOnCard(card, nextGraph); updateDiagramToolHint(card, nextGraph); renderAllPreviewsDebounced();
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  if (getActiveDiagramTool(question.id) === "point") { diagramConstructionByQuestionId.delete(question.id); diagramSelectionByQuestionId.delete(question.id); }
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  const latest = normalizeGraph(graphDrafts.get(question.id) || values || {});
  pushDiagramHistory(question.id, latest);
  const nextPoint = { label: nextPointLabelForGraph(latest), x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y), labelDx: 8, labelDy: -7, color: "#145c63", size: 5, visible: true };
  const nextPoints = [...latest.points, nextPoint];
  const nextGraph = normalizeGraph({ ...latest, graphType: latest.graphType === "function" ? "points" : latest.graphType, points: nextPoints, pointsText: pointsToText(nextPoints) });
  updatePointsField(card, nextGraph); setHiddenGraphField(card, "graphType", nextGraph.graphType); graphDrafts.set(question.id, nextGraph); updateGraphFieldVisibility(card, nextGraph.graphType); drawGraphDraftOnCard(card, nextGraph); updateDiagramToolHint(card, nextGraph); renderAllPreviewsDebounced();
}

function findShapeTransformHandle(graph, meta, clickX, clickY, objectId) {
  if (!objectId || !objectId.startsWith("shape:")) return null;
  const shapeId = objectId.split(":")[1]; const shapeIndex = graph.shapes.findIndex((shape) => shape.id === shapeId); const shape = graph.shapes[shapeIndex]; if (!shape) return null;
  const bounds = getGraphBoundsForShape(shape); if (!bounds) return null;
  const center = meta.toPx(bounds.cx, bounds.cy); const topRight = meta.toPx(bounds.xMax, bounds.yMax); const bottomRight = meta.toPx(bounds.xMax, bounds.yMin);
  const rotateHandle = { px: topRight.px + 18, py: topRight.py - 18 }; const resizeHandle = { px: bottomRight.px + 18, py: bottomRight.py + 18 };
  if (Math.hypot(clickX - rotateHandle.px, clickY - rotateHandle.py) <= 12) return { mode: "rotate-shape", shapeIndex, shapeId, bounds, centerGraph: { x: bounds.cx, y: bounds.cy } };
  if (Math.hypot(clickX - resizeHandle.px, clickY - resizeHandle.py) <= 12) return { mode: "resize-shape", shapeIndex, shapeId, bounds, centerGraph: { x: bounds.cx, y: bounds.cy } };
  if (Math.hypot(clickX - center.px, clickY - center.py) <= 13) return { mode: "move-shape", shapeIndex, shapeId, bounds, centerGraph: { x: bounds.cx, y: bounds.cy } };
  const hit = findClickedDiagramObject(graph, meta, clickX, clickY); if (hit?.id === objectId) return { mode: "move-shape", shapeIndex, shapeId, bounds, centerGraph: { x: bounds.cx, y: bounds.cy } };
  return null;
}

function scalePointAround(point, center, scale) { point.x = roundGraphCoordinate(center.x + (point.x - center.x) * scale); point.y = roundGraphCoordinate(center.y + (point.y - center.y) * scale); }
function scaleWholeShape(shape, center, scale) {
  if (!shape || !Number.isFinite(scale) || scale <= 0) return;
  if (shape.type === "regularPolygon") { shape.radius = Math.max(0.1, roundGraphCoordinate(Number(shape.radius || 1) * scale)); return; }
  if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) { (shape.points || []).forEach((p) => scalePointAround(p, center, scale)); return; }
  if (shape.type === "circle") { shape.radius = Math.max(0.1, roundGraphCoordinate(Number(shape.radius || 1) * scale)); return; }
  if (shape.type === "ellipse") { ["focus1", "focus2", "through"].forEach((key) => shape[key] && scalePointAround(shape[key], center, scale)); return; }
  if (shape.type === "latexText") { shape.fontSize = Math.max(8, roundGraphCoordinate(Number(shape.fontSize || 18) * scale)); }
}

function findClickedDraggableHandle(graph, meta, clickX, clickY) {
  const selectedId = diagramObjectSelectionByQuestionId.get(meta?.canvasQuestionId || "");
  const transform = findShapeTransformHandle(graph, meta, clickX, clickY, selectedId); if (transform) return { kind: "transform", transform };
  const point = findClickedPoint(graph, meta, clickX, clickY); if (point) return point.source === "manual" ? { kind: "manual", index: point.index, point } : { kind: "shape", shapeIndex: point.shapeIndex, pointIndex: point.index, point };
  const labelHit = findClickedLabel(graph, meta, clickX, clickY); if (labelHit) return { kind: "label", labelHit };
  return null;
}

function handleGraphPointerDown(event) {
  const canvas = event.target.closest("[data-editor-graph]"); if (!canvas) return;
  const card = canvas.closest("[data-question-card]"); const question = card ? findQuestion(card.dataset.questionId) : null; if (!card || !question) return;
  const tool = getActiveDiagramTool(question.id); const meta = canvas.__graphMeta; if (!meta) return; meta.canvasQuestionId = question.id;
  const values = normalizeGraph(getGraphValuesFromCard(card)); const pointer = getCanvasPointer(event, canvas);
  if (tool === "move-point") {
    let selectedId = diagramObjectSelectionByQuestionId.get(question.id);
    let transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId);
    if (!transform) {
      const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
      if (hit && hit.id && hit.id.startsWith("shape:")) { selectedId = hit.id; diagramObjectSelectionByQuestionId.set(question.id, hit.id); diagramMultiObjectSelectionByQuestionId.set(question.id, [hit.id]); transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId); drawGraphDraftOnCard(card, values); }
    }
    const point = findClickedPoint(values, meta, pointer.x, pointer.y);
    const labelHit = point ? null : findClickedLabel(values, meta, pointer.x, pointer.y);
    const handle = transform ? { kind: "transform", transform } : (point ? (point.source === "manual" ? { kind: "manual", index: point.index, point } : { kind: "shape", shapeIndex: point.shapeIndex, pointIndex: point.index, point }) : (labelHit ? { kind: "label", labelHit } : null));
    if (handle) {
      const handleId = getHandleObjectIdFromHandle(values, handle);
      if ((event.ctrlKey || event.metaKey) && handleId) { toggleGroupedHandle(question.id, handleId); drawGraphDraftOnCard(card, values); event.preventDefault(); return; }
      const selectedHandles = diagramGroupedHandleSelectionByQuestionId.get(question.id) || [];
      const groupHandles = handleId && selectedHandles.includes(handleId) && selectedHandles.length > 1 ? selectedHandles : (handleId ? [handleId] : []);
      const gp = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      diagramDragState = { card, canvas, questionId: question.id, handle, handleId, groupHandles, startGraph: JSON.parse(JSON.stringify(values)), startPoint: gp, startClientX: event.clientX, startClientY: event.clientY, moved: false, historySaved: false };
      canvas.setPointerCapture?.(event.pointerId); event.preventDefault();
    }
  }
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]"); if (!canvas) return;
  const card = diagramDragState?.card || canvas.closest("[data-question-card]"); const question = card ? findQuestion(card.dataset.questionId) : null; const meta = canvas.__graphMeta; if (!card || !question || !meta) return; meta.canvasQuestionId = question.id;
  const pointer = getCanvasPointer(event, canvas); const inside = isInsidePlot(pointer.x, pointer.y, meta);
  if (!diagramDragState) { const values = normalizeGraph(getGraphValuesFromCard(card)); const tool = getActiveDiagramTool(question.id); if (inside && ["point", "segment", "polygon", "irregular-polygon", "angle", "circle", "ellipse", "trapezoid", "parallelogram", "latex-text"].includes(tool)) { let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y); if (values.snapToGrid || tool === "angle") graphPoint = snapGraphPoint(graphPoint, meta); canvas.__interactionPreview = { point: graphPoint, snap: values.snapToGrid || tool === "angle", tool, visible: true }; } else canvas.__interactionPreview = null; drawGraphDraftOnCard(card, values); return; }
  const dxClient = event.clientX - diagramDragState.startClientX; const dyClient = event.clientY - diagramDragState.startClientY; if (!diagramDragState.moved && Math.hypot(dxClient, dyClient) < 3) return; diagramDragState.moved = true; if (!inside) return;
  let currentPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y); if (getGraphValuesFromCard(card).snapToGrid) currentPoint = snapGraphPoint(currentPoint, meta);
  const values = normalizeGraph(JSON.parse(JSON.stringify(diagramDragState.startGraph))); if (!diagramDragState.historySaved) { pushDiagramHistory(question.id, normalizeGraph(diagramDragState.startGraph)); diagramDragState.historySaved = true; }
  const handle = diagramDragState.handle;
  if (handle.kind === "label") { const dx = event.clientX - diagramDragState.startClientX; const dy = event.clientY - diagramDragState.startClientY; const hit = handle.labelHit;
    if (hit.kind === "manual" && values.points[hit.index]) { values.points[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx); values.points[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy); }
    if (hit.kind === "segmentLabel" && values.segments[hit.index]) { values.segments[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx); values.segments[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -10) + dy); }
    if (hit.kind === "angleLabel" && values.angles[hit.index]) { values.angles[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx); values.angles[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? 0) + dy); }
    if (hit.kind === "shapePoint") { const p = values.shapes?.[hit.shapeIndex]?.points?.[hit.pointIndex]; if (p) { p.labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx); p.labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy); } }
    if (hit.kind === "regularVertex") { const shape = values.shapes?.[hit.shapeIndex]; if (shape) { if (!Array.isArray(shape.vertexLabelOffsets)) shape.vertexLabelOffsets = []; shape.vertexLabelOffsets[hit.pointIndex] = { dx: roundGraphCoordinate((hit.labelDx ?? 8) + dx), dy: roundGraphCoordinate((hit.labelDy ?? -7) + dy) }; } }
    if (hit.kind === "shapeSegmentLabel") { const shape = values.shapes?.[hit.shapeIndex]; if (shape) { if (!shape.segmentLabelOffsets || typeof shape.segmentLabelOffsets !== "object") shape.segmentLabelOffsets = {}; shape.segmentLabelOffsets[hit.key] = { dx: roundGraphCoordinate((hit.labelDx ?? 0) + dx), dy: roundGraphCoordinate((hit.labelDy ?? -10) + dy) }; } }
    if (hit.kind === "text") { const shape = values.shapes?.[hit.shapeIndex]; if (shape) { const dxg = currentPoint.x - diagramDragState.startPoint.x; const dyg = currentPoint.y - diagramDragState.startPoint.y; shape.x = roundGraphCoordinate(Number(shape.x) + dxg); shape.y = roundGraphCoordinate(Number(shape.y) + dyg); } }
  } else if (handle.kind === "transform") { const tr = handle.transform; const shape = values.shapes?.[tr.shapeIndex]; if (shape) { if (tr.mode === "move-shape") { const dx = currentPoint.x - diagramDragState.startPoint.x; const dy = currentPoint.y - diagramDragState.startPoint.y; translateWholeShape(shape, dx, dy); } else if (tr.mode === "rotate-shape") { const startAngle = Math.atan2(diagramDragState.startPoint.y - tr.centerGraph.y, diagramDragState.startPoint.x - tr.centerGraph.x); const currentAngle = Math.atan2(currentPoint.y - tr.centerGraph.y, currentPoint.x - tr.centerGraph.x); rotateWholeShape(shape, tr.centerGraph, currentAngle - startAngle); } else if (tr.mode === "resize-shape") { const startDist = Math.hypot(diagramDragState.startPoint.x - tr.centerGraph.x, diagramDragState.startPoint.y - tr.centerGraph.y) || 1; const currentDist = Math.hypot(currentPoint.x - tr.centerGraph.x, currentPoint.y - tr.centerGraph.y) || startDist; scaleWholeShape(shape, tr.centerGraph, Math.max(0.05, currentDist / startDist)); } } }
  else if (diagramDragState.groupHandles && diagramDragState.groupHandles.length > 1) { const dx = currentPoint.x - diagramDragState.startPoint.x; const dy = currentPoint.y - diagramDragState.startPoint.y; diagramDragState.groupHandles.forEach((handleId) => translateHandleById(values, handleId, dx, dy)); }
  else if (handle.kind === "manual") { if (values.points[handle.index]) values.points[handle.index] = { ...values.points[handle.index], x: roundGraphCoordinate(currentPoint.x), y: roundGraphCoordinate(currentPoint.y) }; }
  else if (handle.kind === "shape") { const shape = values.shapes?.[handle.shapeIndex]; applyShapeHandleMove(shape, handle, currentPoint); }
  updatePointsField(card, values); graphDrafts.set(question.id, normalizeGraph(values)); canvas.__interactionPreview = { point: currentPoint, snap: getGraphValuesFromCard(card).snapToGrid, tool: "move-point", visible: true }; drawGraphDraftOnCard(card, values); renderAllPreviewsDebounced();
}

function drawTransformOverlay(canvas, rawGraph) {
  const meta = canvas.__graphMeta; const card = canvas.closest("[data-question-card]"); const question = card ? findQuestion(card.dataset.questionId) : null; if (!meta || !question) return;
  const graph = normalizeGraph(rawGraph || meta.graph || getGraphValuesFromCard(card)); const selectedIds = new Set(diagramMultiObjectSelectionByQuestionId.get(question.id) || []); const single = diagramObjectSelectionByQuestionId.get(question.id); if (single) selectedIds.add(single); if (!selectedIds.size) return;
  const ctx = canvas.getContext("2d"); ctx.save();
  selectedIds.forEach((id) => { if (!id.startsWith("shape:")) return; const shapeId = id.split(":")[1]; const shape = graph.shapes.find((item) => item.id === shapeId); if (!shape) return; const bounds = getGraphBoundsForShape(shape); if (!bounds) return; const a = meta.toPx(bounds.xMin, bounds.yMin); const b = meta.toPx(bounds.xMax, bounds.yMax); const left = Math.min(a.px, b.px), right = Math.max(a.px, b.px), top = Math.min(a.py, b.py), bottom = Math.max(a.py, b.py); const center = meta.toPx(bounds.cx, bounds.cy); ctx.strokeStyle = "rgba(0, 172, 193, 0.8)"; ctx.fillStyle = "rgba(0, 172, 193, 0.16)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(left, top, right - left, bottom - top); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(center.px, center.py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); const rotateX = right + 18, rotateY = top - 18; const resizeX = right + 18, resizeY = bottom + 18; ctx.beginPath(); ctx.arc(rotateX, rotateY, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(right, top); ctx.lineTo(rotateX, rotateY); ctx.stroke(); ctx.beginPath(); ctx.rect(resizeX - 7, resizeY - 7, 14, 14); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(right, bottom); ctx.lineTo(resizeX, resizeY); ctx.stroke(); ctx.font = "700 13px Inter, Arial, sans-serif"; ctx.fillStyle = "#145c63"; ctx.fillText("↻", rotateX - 4, rotateY + 5); ctx.fillText("↘", resizeX - 5, resizeY + 5); });
  ctx.restore();
}

function findClickedDiagramObject(graph, meta, clickX, clickY) {
  const normalized = normalizeGraph(graph);
  for (let index = (normalized.points || []).length - 1; index >= 0; index -= 1) { const point = normalized.points[index]; const p = meta.toPx(point.x, point.y); if (Math.hypot(clickX - p.px, clickY - p.py) <= 10) return { id: `point:${point.label}`, kind: "point", ref: point }; }
  const segmentHit = findClickedSegment(normalized, meta, clickX, clickY);
  if (segmentHit) { if (segmentHit.segment.shapePolygon) return { id: `edge:${segmentHit.segment.shapeId}:${segmentHit.segment.polygonSegmentKey}`, kind: "shapeEdge", ref: segmentHit.segment }; if (segmentHit.segment.polygon) return { id: `regular-edge:${segmentHit.segment.polygonSegmentKey}`, kind: "regularEdge", ref: segmentHit.segment }; return { id: getSegmentObjectId(segmentHit.segment), kind: "segment", ref: segmentHit.segment }; }
  const angleHit = findClickedAngle(normalized, meta, clickX, clickY); if (angleHit) return { id: getAngleObjectId(angleHit.angle), kind: "angle", ref: angleHit.angle };
  for (let index = (normalized.shapes || []).length - 1; index >= 0; index -= 1) { const shape = normalized.shapes[index]; if (shape.visible === false) continue; if (shape.type === "latexText") { const p = meta.toPx(shape.x, shape.y); const width = Math.max(24, toCanvasMathText(shape.text || shape.label || "").length * (Number(shape.fontSize) || 18) * 0.52); const height = Math.max(14, Number(shape.fontSize) || 18); if (Math.abs(clickX - p.px) <= width / 2 && Math.abs(clickY - p.py) <= height) return { id: `shape:${shape.id}`, kind: "shape", ref: shape }; continue; } if (isPointInsideShapeClick(shape, normalized, meta, clickX, clickY)) return { id: `shape:${shape.id}`, kind: "shape", ref: shape }; }
  return null;
}

function editShapeEdgeProperties(card, question, graph, objectId) {
  const [, shapeId, key] = objectId.split(":"); const shape = graph.shapes.find((item) => item.id === shapeId); if (!shape) return; const mode = shape.segmentLabelModes?.[key] || "name"; const style = getSegmentStyleFromContainer(shape, key);
  openDiagramDialog({ title: "Edge properties", description: "Adjust this polygon edge independently from the rest of the figure.", fields: [ { name: "labelMode", label: "Label", type: "select", value: mode, options: [{ value: "name", label: "Name" }, { value: "length", label: "Length" }, { value: "variable", label: "Variable x" }, { value: "hidden", label: "Hidden" }]}, { name: "color", label: "Line color", type: "color", value: style.color }, { name: "lineDash", label: "Outline type", type: "select", value: style.lineDash, options: [{ value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]}, { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: style.lineWidth } ] }).then((result) => { if (!result) return; pushDiagramHistory(question.id, graph); if (!shape.segmentLabelModes || typeof shape.segmentLabelModes !== "object") shape.segmentLabelModes = {}; if (!shape.segmentStyles || typeof shape.segmentStyles !== "object") shape.segmentStyles = {}; shape.segmentLabelModes[key] = result.labelMode || mode; shape.segmentStyles[key] = { color: isHexColor(result.color) ? result.color : style.color, lineDash: ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : style.lineDash, lineWidth: parseNumberOrDefault(result.lineWidth, style.lineWidth) }; const next = normalizeGraph(graph); graphDrafts.set(question.id, next); drawGraphDraftOnCard(card, next); renderAllPreviewsDebounced(); });
}

const editDiagramObjectPropertiesAsyncBeforeStage5 = editDiagramObjectPropertiesAsync;
editDiagramObjectPropertiesAsync = function editDiagramObjectPropertiesAsyncStage5(card, question, graph, objectId) { if (objectId && objectId.startsWith("edge:")) return editShapeEdgeProperties(card, question, graph, objectId); return editDiagramObjectPropertiesAsyncBeforeStage5(card, question, graph, objectId); };


/* ===== Stage 6 object editing, move mode, and label fixes ===== */
function normalizeShape(shape, index = 0) {
  if (!shape || typeof shape !== "object") return null;
  const type = ["regularPolygon", "irregularPolygon", "circle", "ellipse", "trapezoid", "parallelogram", "latexText"].includes(shape.type)
    ? shape.type
    : "irregularPolygon";

  const base = {
    id: sanitizeObjectId(shape.id || `${type}-${index + 1}`),
    type,
    label: String(shape.label || shape.name || getDefaultShapeLabel(type, index)).trim(),
    visible: shape.visible !== false,
    stroke: isHexColor(shape.stroke) ? shape.stroke : "#145c63",
    fill: isHexColor(shape.fill) ? shape.fill : "#e8f7f9",
    lineWidth: Number.isFinite(Number(shape.lineWidth)) ? Math.max(1, Number(shape.lineWidth)) : 2,
    lineDash: ["solid", "dashed", "dotted"].includes(shape.lineDash) ? shape.lineDash : "solid",
    segmentLabelModes: shape.segmentLabelModes && typeof shape.segmentLabelModes === "object" ? { ...shape.segmentLabelModes } : {},
    segmentLabelOffsets: shape.segmentLabelOffsets && typeof shape.segmentLabelOffsets === "object" ? { ...shape.segmentLabelOffsets } : {},
    segmentStyles: shape.segmentStyles && typeof shape.segmentStyles === "object" ? { ...shape.segmentStyles } : {}
  };

  if (type === "latexText") {
    return {
      ...base,
      text: String(shape.text || shape.label || ""),
      x: parseNumberOrDefault(shape.x, 0),
      y: parseNumberOrDefault(shape.y, 0),
      fontSize: Number.isFinite(Number(shape.fontSize)) ? Math.max(8, Number(shape.fontSize)) : 18,
      fill: isHexColor(shape.fill) ? shape.fill : "#145c63"
    };
  }

  if (type === "regularPolygon") {
    const sides = Math.max(3, Math.floor(parseNumberOrDefault(shape.sides, 3)));
    const vertexLabels = Array.isArray(shape.vertexLabels)
      ? shape.vertexLabels.map(sanitizeGraphLabel).filter(Boolean).slice(0, sides)
      : [];
    const vertexLabelOffsets = Array.isArray(shape.vertexLabelOffsets)
      ? shape.vertexLabelOffsets.slice(0, sides).map((offset) => ({
          dx: Number.isFinite(Number(offset?.dx)) ? Number(offset.dx) : 8,
          dy: Number.isFinite(Number(offset?.dy)) ? Number(offset.dy) : -7
        }))
      : [];

    return {
      ...base,
      sides,
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 4)),
      rotation: parseNumberOrDefault(shape.rotation, 90),
      centerX: parseNumberOrDefault(shape.centerX, 0),
      centerY: parseNumberOrDefault(shape.centerY, 0),
      showApothem: Boolean(shape.showApothem),
      vertexLabels,
      vertexLabelOffsets
    };
  }

  if (type === "circle") {
    return {
      ...base,
      center: normalizeShapePoint(shape.center, { x: 0, y: 0 }),
      radius: Math.max(0.1, parseNumberOrDefault(shape.radius, 1))
    };
  }

  if (type === "ellipse") {
    return {
      ...base,
      focus1: normalizeShapePoint(shape.focus1, { x: -1, y: 0 }),
      focus2: normalizeShapePoint(shape.focus2, { x: 1, y: 0 }),
      through: normalizeShapePoint(shape.through, { x: 0, y: 1 })
    };
  }

  const points = Array.isArray(shape.points)
    ? shape.points.map((point) => normalizeShapePoint(point)).filter(Boolean)
    : [];

  return {
    ...base,
    points,
    targetSides: type === "irregularPolygon" ? Math.max(3, Math.floor(parseNumberOrDefault(shape.targetSides, points.length || 3))) : undefined
  };
}

function setActiveDiagramTool(questionId, tool) {
  diagramToolByQuestionId.set(questionId, tool);

  if (tool !== "segment" && tool !== "angle") {
    diagramSelectionByQuestionId.delete(questionId);
  }

  if (!["segment", "irregular-polygon", "circle", "ellipse", "latex-text"].includes(tool)) {
    diagramConstructionByQuestionId.delete(questionId);
  }

  if (tool === "point") {
    diagramConstructionByQuestionId.delete(questionId);
    diagramSelectionByQuestionId.delete(questionId);
  }
}

function updateDiagramToolHint(card, graph) {
  const hint = card.querySelector("[data-diagram-tool-hint]");
  if (!hint) return;
  const questionId = card.dataset.questionId;
  const tool = getActiveDiagramTool(questionId);
  const selection = diagramSelectionByQuestionId.get(questionId) || [];
  const construction = diagramConstructionByQuestionId.get(questionId);
  const messages = {
    point: "Point: click the diagram to insert points. This tool stays active.",
    segment: construction?.tool === "segment" && construction.startLabel
      ? `Segment: start ${construction.startLabel}. Click anywhere to create/select the endpoint.`
      : "Segment: click the start and endpoint. Empty-space clicks create endpoint points automatically.",
    polygon: "Reg. polygon: configure it, then click the diagram to place its center.",
    "irregular-polygon": construction?.tool === "irregular-polygon"
      ? `Irreg. polygon: ${construction.points.length}/${construction.targetSides} vertices selected.`
      : "Irreg. polygon: choose the side count, then click each vertex.",
    circle: construction?.tool === "circle" && construction.center
      ? "Circle: center selected. Click the circumference."
      : "Circle: click center, then circumference.",
    ellipse: construction?.tool === "ellipse"
      ? `Ellipse: ${construction.points.length}/3 construction points selected.`
      : "Ellipse: click focus 1, focus 2, then a point on the ellipse.",
    trapezoid: "Trapezoid: configure it, then click to insert an editable template.",
    parallelogram: "Parallelog.: configure it, then click to insert an editable template.",
    angle: selection.length ? `Angle: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle: Stick is enabled. Click three existing points: from, vertex, to.",
    function: "Function: configure the expression and style in the dialog.",
    "latex-text": construction?.tool === "latex-text" ? "LaTeX: click the diagram to place the text." : "LaTeX: enter a short formula/string, then click the diagram.",
    select: "Selection: click objects to select them; Ctrl+click selects multiple; Delete removes selection; double-click opens properties.",
    "move-point": "Move: click a figure to activate transform handles; drag vertices, labels, text, or handles. Click empty space to deactivate.",
    erase: "Eraser: click an object to remove it. Clear canvas is in Edit."
  };
  hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
}

function toCanvasMathText(text) {
  let value = String(text || "").trim();
  value = value.replace(/^\$+|\$+$/g, "");

  const supers = { "0":"⁰", "1":"¹", "2":"²", "3":"³", "4":"⁴", "5":"⁵", "6":"⁶", "7":"⁷", "8":"⁸", "9":"⁹", "+":"⁺", "-":"⁻", "=":"⁼", "(":"⁽", ")":"⁾", "n":"ⁿ", "i":"ⁱ", "x":"ˣ", "y":"ʸ" };
  const subs = { "0":"₀", "1":"₁", "2":"₂", "3":"₃", "4":"₄", "5":"₅", "6":"₆", "7":"₇", "8":"₈", "9":"₉", "+":"₊", "-":"₋", "=":"₌", "(":"₍", ")":"₎" };
  const convertRun = (run, map) => String(run).split("").map((ch) => map[ch] || ch).join("");

  value = value.replace(/\\+frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  value = value.replace(/\\+sqrt\s*\{([^{}]+)\}/g, "√($1)");
  value = value.replace(/\\+sqrt\s*([A-Za-z0-9]+)/g, "√$1");
  value = value
    .replace(/\\+cdot/g, "·")
    .replace(/\\+times/g, "×")
    .replace(/\\+div/g, "÷")
    .replace(/\\+pi/g, "π")
    .replace(/\\+theta/g, "θ")
    .replace(/\\+alpha/g, "α")
    .replace(/\\+beta/g, "β")
    .replace(/\\+gamma/g, "γ")
    .replace(/\\+Delta/g, "Δ")
    .replace(/\\+Omega/g, "Ω")
    .replace(/\\+mu/g, "μ")
    .replace(/\\+sin/g, "sin")
    .replace(/\\+cos/g, "cos")
    .replace(/\\+tan/g, "tan")
    .replace(/\\+ln/g, "ln")
    .replace(/\\+log/g, "log");
  value = value.replace(/\^\{([^{}]+)\}/g, (_, run) => convertRun(run, supers));
  value = value.replace(/_\{([^{}]+)\}/g, (_, run) => convertRun(run, subs));
  value = value.replace(/\^([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, supers));
  value = value.replace(/_([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, subs));
  value = value.replace(/\\+([A-Za-z]+)/g, "$1");
  return value;
}

function drawTextShape(ctx, shape, meta) {
  if (!shape.text) return;
  const p = meta.toPx(shape.x, shape.y);
  ctx.save();
  ctx.fillStyle = shape.fill || shape.stroke || "#145c63";
  ctx.font = `700 ${Math.max(8, Number(shape.fontSize) || 18)}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawTextWithHalo(ctx, toCanvasMathText(shape.text), p.px, p.py);
  ctx.restore();
}

function getEdgePointsForShape(shape) {
  if (!shape) return [];
  if (shape.type === "regularPolygon") return getRegularPolygonPoints(shape);
  if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) return shape.points || [];
  return [];
}

function getShapeEdgeAt(shape, key) {
  const points = getEdgePointsForShape(shape);
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (makeShapeSegmentKey(shape, index, start, end) === key) {
      return { index, start, end };
    }
  }
  return null;
}

function getDiagramObjectById(graph, objectId) {
  const normalized = normalizeGraph(graph);
  if (String(objectId) === "function:main" && normalized.expression) return { kind: "function", ref: normalized };
  const [kind, ...rest] = String(objectId).split(":");

  if (kind === "point") {
    const ref = normalized.points.find((point) => sanitizeGraphLabel(point.label) === rest[0]);
    return ref ? { kind, ref } : null;
  }

  if (kind === "segment") {
    const ref = normalized.segments.find((segment) => getSegmentObjectId(segment) === objectId);
    return ref ? { kind, ref } : null;
  }

  if (kind === "angle") {
    const ref = normalized.angles.find((angle) => getAngleObjectId(angle) === objectId);
    return ref ? { kind, ref } : null;
  }

  if (kind === "shape") {
    const ref = normalized.shapes.find((shape) => shape.id === rest.join(":"));
    return ref ? { kind, ref } : null;
  }

  if (kind === "shape-point") {
    const shapeId = rest[0];
    const pointIndex = rest[1];
    const shapeIndex = normalized.shapes.findIndex((shape) => shape.id === shapeId);
    const shape = normalized.shapes[shapeIndex];
    if (!shape) return null;
    const points = getEdgePointsForShape(shape);
    const numericIndex = Number(pointIndex);
    const ref = points[numericIndex];
    return ref ? { kind: "shapePoint", ref, shape, shapeIndex, pointIndex: numericIndex } : null;
  }

  if (kind === "edge") {
    const shapeId = rest[0];
    const key = rest.slice(1).join(":");
    const shapeIndex = normalized.shapes.findIndex((shape) => shape.id === shapeId);
    const shape = normalized.shapes[shapeIndex];
    if (!shape) return null;
    const edge = getShapeEdgeAt(shape, key);
    return edge ? { kind: "shapeEdge", ref: edge, shape, shapeIndex, key } : null;
  }

  return null;
}

function findClickedLabel(graph, meta, clickX, clickY) {
  const normalized = normalizeGraph(graph);
  const hit = (x, y, text) => Math.abs(clickX - x) <= Math.max(16, String(text || "").length * 5.2) && Math.abs(clickY - y) <= 14;

  for (let index = 0; index < (normalized.segments || []).length; index += 1) {
    const segment = normalized.segments[index];
    if (segment.visible === false) continue;
    const anchor = getSegmentLabelAnchor(segment, normalized, meta);
    if (anchor?.text && hit(anchor.x, anchor.y, anchor.text)) {
      return { kind: "segmentLabel", index, labelDx: segment.labelDx ?? 0, labelDy: segment.labelDy ?? -10 };
    }
  }

  for (let index = 0; index < (normalized.angles || []).length; index += 1) {
    const angle = normalized.angles[index];
    if (angle.visible === false) continue;
    const anchor = getAngleLabelAnchor(angle, normalized, meta);
    if (anchor?.text && hit(anchor.x, anchor.y, anchor.text)) {
      return { kind: "angleLabel", index, labelDx: angle.labelDx ?? 0, labelDy: angle.labelDy ?? 0 };
    }
  }

  for (let shapeIndex = 0; shapeIndex < (normalized.shapes || []).length; shapeIndex += 1) {
    const shape = normalized.shapes[shapeIndex];
    if (shape.visible === false) continue;
    const points = getEdgePointsForShape(shape);

    for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
      const start = points[edgeIndex];
      const end = points[(edgeIndex + 1) % points.length];
      const key = makeShapeSegmentKey(shape, edgeIndex, start, end);
      const mode = shape.segmentLabelModes?.[key] || "name";
      const text = getSegmentLabel(start, end, mode);
      if (!text) continue;
      const a = meta.toPx(start.x, start.y);
      const b = meta.toPx(end.x, end.y);
      const offset = getSegmentOffsetFromContainer(shape, key);
      const x = (a.px + b.px) / 2 + offset.dx;
      const y = (a.py + b.py) / 2 + offset.dy;
      if (hit(x, y, text)) return { kind: "shapeSegmentLabel", shapeIndex, edgeIndex, key, labelDx: offset.dx, labelDy: offset.dy };
    }

    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      const p = meta.toPx(point.x, point.y);
      const lx = p.px + (point.labelDx ?? 8);
      const ly = p.py + (point.labelDy ?? -7);
      if (hit(lx, ly, point.label)) {
        return { kind: shape.type === "regularPolygon" ? "regularVertex" : "shapePoint", shapeIndex, pointIndex, labelDx: point.labelDx ?? 8, labelDy: point.labelDy ?? -7 };
      }
    }

    if (shape.type === "latexText") {
      const p = meta.toPx(shape.x, shape.y);
      const text = toCanvasMathText(shape.text || "");
      if (hit(p.px, p.py, text)) return { kind: "text", shapeIndex };
    }
  }

  for (let index = 0; index < (normalized.points || []).length; index += 1) {
    const point = normalized.points[index];
    if (point.visible === false) continue;
    const p = meta.toPx(point.x, point.y);
    const lx = p.px + (point.labelDx ?? 8);
    const ly = p.py + (point.labelDy ?? -7);
    if (hit(lx, ly, point.label)) return { kind: "manual", index, labelDx: point.labelDx ?? 8, labelDy: point.labelDy ?? -7 };
  }

  return null;
}

function findClickedDiagramObject(graph, meta, clickX, clickY) {
  const normalized = normalizeGraph(graph);

  const pointHit = findClickedPoint(normalized, meta, clickX, clickY);
  if (pointHit?.source === "manual") return { id: `point:${pointHit.point.label}`, kind: "point", ref: pointHit.point };
  if (pointHit?.shape && pointHit.shape.id && Number.isFinite(Number(pointHit.index))) {
    return { id: `shape-point:${pointHit.shape.id}:${pointHit.index}`, kind: "shapePoint", ref: pointHit.point };
  }

  const segmentHit = findClickedSegment(normalized, meta, clickX, clickY);
  if (segmentHit) {
    if (segmentHit.segment.shapePolygon) return { id: `edge:${segmentHit.segment.shapeId}:${segmentHit.segment.polygonSegmentKey}`, kind: "shapeEdge", ref: segmentHit.segment };
    if (segmentHit.segment.polygon) return { id: `regular-edge:${segmentHit.segment.polygonSegmentKey}`, kind: "regularEdge", ref: segmentHit.segment };
    return { id: getSegmentObjectId(segmentHit.segment), kind: "segment", ref: segmentHit.segment };
  }

  const angleHit = findClickedAngle(normalized, meta, clickX, clickY);
  if (angleHit) return { id: getAngleObjectId(angleHit.angle), kind: "angle", ref: angleHit.angle };

  for (let index = (normalized.shapes || []).length - 1; index >= 0; index -= 1) {
    const shape = normalized.shapes[index];
    if (shape.visible === false) continue;
    if (shape.type === "latexText") {
      const p = meta.toPx(shape.x, shape.y);
      const text = toCanvasMathText(shape.text || shape.label || "");
      const width = Math.max(24, text.length * (Number(shape.fontSize) || 18) * 0.56);
      const height = Math.max(16, Number(shape.fontSize) || 18);
      if (Math.abs(clickX - p.px) <= width / 2 && Math.abs(clickY - p.py) <= height) return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
      continue;
    }
    if (isPointInsideShapeClick(shape, normalized, meta, clickX, clickY)) return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
  }

  if (normalized.expression && distanceToFunctionCurve(normalized, meta, clickX, clickY) <= 10) {
    return { id: "function:main", kind: "function", ref: normalized };
  }

  return null;
}

function configureIrregularPolygonTool(question) {
  openDiagramDialog({
    title: "Irregular polygon settings",
    description: "Choose the number of vertices, then click them on the diagram.",
    fields: [
      { name: "sides", label: "Number of sides", type: "number", min: 3, max: 24, step: 1, value: 3 },
      { name: "label", label: "Object label", type: "text", value: "Irregular polygon", full: true },
      { name: "stroke", label: "Line color", type: "color", value: "#145c63" },
      { name: "fill", label: "Fill color", type: "color", value: "#e8f7f9" },
      { name: "lineDash", label: "Outline type", type: "select", value: "solid", options: [
        { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
      ]},
      { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: 2 }
    ],
    onSubmit: (data) => {
      diagramConstructionByQuestionId.set(question.id, {
        tool: "irregular-polygon",
        targetSides: Math.max(3, Math.floor(parseNumberOrDefault(data.sides, 3))),
        points: [],
        settings: {
          label: String(data.label || "Irregular polygon"),
          stroke: isHexColor(data.stroke) ? data.stroke : "#145c63",
          fill: isHexColor(data.fill) ? data.fill : "#e8f7f9",
          lineDash: ["solid", "dashed", "dotted"].includes(data.lineDash) ? data.lineDash : "solid",
          lineWidth: parseNumberOrDefault(data.lineWidth, 2)
        }
      });
    }
  });
}

function handleIrregularPolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  const construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "irregular-polygon" || !Number.isFinite(Number(construction.targetSides))) {
    configureIrregularPolygonTool(question);
    return;
  }

  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  construction.points.push({ x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) });
  diagramConstructionByQuestionId.set(question.id, construction);

  if (construction.points.length >= construction.targetSides) {
    pushDiagramHistory(question.id, values);
    const settings = construction.settings || {};
    const labels = reserveSequentialPointLabels(values, construction.targetSides);
    const shape = normalizeShape({
      id: nextShapeId(values, "irregularPolygon"),
      type: "irregularPolygon",
      label: settings.label || `${construction.targetSides}-side polygon`,
      stroke: settings.stroke || "#145c63",
      fill: settings.fill || "#e8f7f9",
      lineDash: settings.lineDash || "solid",
      lineWidth: settings.lineWidth || 2,
      targetSides: construction.targetSides,
      points: construction.points.map((p, index) => ({ ...p, label: labels[index], labelDx: 8, labelDy: -7 }))
    }, values.shapes.length);
    values.shapes.push(shape);
    diagramConstructionByQuestionId.delete(question.id);
    const next = normalizeGraph(values);
    graphDrafts.set(question.id, next);
    renderAllPreviewsDebounced();
    setToolToMovePoint(card, question, next, `shape:${shape.id}`);
    return;
  }

  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function handleSegmentToolClick(card, question, values, meta, canvasX, canvasY) {
  let graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
  const created = getOrCreatePointForConstruction(card, question, graph, meta, canvasX, canvasY);
  graph = normalizeGraph(created.graph);
  const label = sanitizeGraphLabel(created.point?.label);
  if (!label) return;

  const construction = diagramConstructionByQuestionId.get(question.id);
  if (!construction || construction.tool !== "segment" || !construction.startLabel) {
    diagramConstructionByQuestionId.set(question.id, { tool: "segment", startLabel: label });
    graphDrafts.set(question.id, graph);
    updatePointsField(card, graph);
    drawGraphDraftOnCard(card, graph);
    updateDiagramToolHint(card, graph);
    renderAllPreviewsDebounced();
    return;
  }

  const from = sanitizeGraphLabel(construction.startLabel);
  const to = label;
  if (from && to && from !== to && !graph.segments.some((segment) => segmentMatches(segment, from, to))) {
    pushDiagramHistory(question.id, graph);
    graph.segments.push({ from, to, labelMode: "name", visible: true, color: "#145c63", lineWidth: 2, lineDash: "solid", labelDx: 0, labelDy: -10 });
  }

  diagramConstructionByQuestionId.delete(question.id);
  diagramSelectionByQuestionId.delete(question.id);
  const nextGraph = normalizeGraph(graph);
  graphDrafts.set(question.id, nextGraph);
  updatePointsField(card, nextGraph);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  diagramConstructionByQuestionId.delete(question.id);
  diagramSelectionByQuestionId.delete(question.id);
  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);
  const latest = normalizeGraph(graphDrafts.get(question.id) || values || {});
  pushDiagramHistory(question.id, latest);
  const nextPoint = { label: nextPointLabelForGraph(latest), x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y), labelDx: 8, labelDy: -7, color: "#145c63", size: 5, visible: true };
  const nextPoints = [...latest.points, nextPoint];
  const nextGraph = normalizeGraph({ ...latest, graphType: latest.graphType === "function" ? "points" : latest.graphType, points: nextPoints, pointsText: pointsToText(nextPoints) });
  updatePointsField(card, nextGraph);
  setHiddenGraphField(card, "graphType", nextGraph.graphType);
  graphDrafts.set(question.id, nextGraph);
  updateGraphFieldVisibility(card, nextGraph.graphType);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();
}

function handleGraphCanvasClick(event, canvas) {
  if (suppressNextCanvasClick) { suppressNextCanvasClick = false; return; }
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;
  const values = normalizeGraph(getGraphValuesFromCard(card));
  const meta = canvas.__graphMeta;
  if (!meta) return;
  meta.canvasQuestionId = question.id;
  const pointer = getCanvasPointer(event, canvas);
  if (!isInsidePlot(pointer.x, pointer.y, meta)) return;
  const tool = getActiveDiagramTool(question.id);

  if (tool === "select") {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit) {
      const current = new Set(diagramMultiObjectSelectionByQuestionId.get(question.id) || []);
      if (event.ctrlKey || event.metaKey) {
        if (current.has(hit.id)) current.delete(hit.id); else current.add(hit.id);
      } else {
        current.clear(); current.add(hit.id);
      }
      diagramMultiObjectSelectionByQuestionId.set(question.id, [...current]);
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      drawGraphDraftOnCard(card, values);
    } else if (!(event.ctrlKey || event.metaKey)) {
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramObjectSelectionByQuestionId.delete(question.id);
      drawGraphDraftOnCard(card, values);
    }
    return;
  }

  if (tool === "move-point") {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit?.id?.startsWith("shape:")) {
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      diagramMultiObjectSelectionByQuestionId.set(question.id, [hit.id]);
      drawGraphDraftOnCard(card, values);
    } else if (!hit) {
      diagramObjectSelectionByQuestionId.delete(question.id);
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramGroupedHandleSelectionByQuestionId.delete(question.id);
      drawGraphDraftOnCard(card, values);
    }
    return;
  }

  if (tool === "erase") { eraseObjectAtPosition(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "segment") { handleSegmentToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "angle") { handleAngleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "polygon") { handlePolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "irregular-polygon") { handleIrregularPolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "circle") { handleCircleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "ellipse") { handleEllipseToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "trapezoid" || tool === "parallelogram") { handleTemplateShapeClick(card, question, values, meta, pointer.x, pointer.y, tool); return; }
  if (tool === "latex-text") { handleLatexTextToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "function") return;
  addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
}

function handleGraphPointerDown(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;
  const tool = getActiveDiagramTool(question.id);
  const meta = canvas.__graphMeta;
  if (!meta) return;
  meta.canvasQuestionId = question.id;
  const values = normalizeGraph(getGraphValuesFromCard(card));
  const pointer = getCanvasPointer(event, canvas);

  if (tool !== "move-point") return;

  const point = findClickedPoint(values, meta, pointer.x, pointer.y);
  const labelHit = point ? null : findClickedLabel(values, meta, pointer.x, pointer.y);
  let selectedId = diagramObjectSelectionByQuestionId.get(question.id);
  let transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId);

  if (!point && !labelHit && !transform) {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit?.id?.startsWith("shape:")) {
      selectedId = hit.id;
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      diagramMultiObjectSelectionByQuestionId.set(question.id, [hit.id]);
      transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId);
      drawGraphDraftOnCard(card, values);
      event.preventDefault();
      return;
    }

    if (!hit) {
      diagramObjectSelectionByQuestionId.delete(question.id);
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramGroupedHandleSelectionByQuestionId.delete(question.id);
      drawGraphDraftOnCard(card, values);
      return;
    }
  }

  const handle = point
    ? (point.source === "manual" ? { kind: "manual", index: point.index, point } : { kind: "shape", shapeIndex: point.shapeIndex, pointIndex: point.index, point })
    : (labelHit ? { kind: "label", labelHit } : (transform ? { kind: "transform", transform } : null));

  if (!handle) return;
  const handleId = getHandleObjectIdFromHandle(values, handle);
  if ((event.ctrlKey || event.metaKey) && handleId) {
    toggleGroupedHandle(question.id, handleId);
    drawGraphDraftOnCard(card, values);
    event.preventDefault();
    return;
  }
  const selectedHandles = diagramGroupedHandleSelectionByQuestionId.get(question.id) || [];
  const groupHandles = handleId && selectedHandles.includes(handleId) && selectedHandles.length > 1 ? selectedHandles : (handleId ? [handleId] : []);
  const gp = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  diagramDragState = { card, canvas, questionId: question.id, handle, handleId, groupHandles, startGraph: JSON.parse(JSON.stringify(values)), startPoint: gp, startClientX: event.clientX, startClientY: event.clientY, moved: false, historySaved: false };
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function handleGraphPointerMove(event) {
  const canvas = diagramDragState?.canvas || event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;
  const card = diagramDragState?.card || canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;
  meta.canvasQuestionId = question.id;
  const pointer = getCanvasPointer(event, canvas);
  const inside = isInsidePlot(pointer.x, pointer.y, meta);

  if (!diagramDragState) {
    const values = normalizeGraph(getGraphValuesFromCard(card));
    const tool = getActiveDiagramTool(question.id);
    if (inside && ["point", "segment", "polygon", "irregular-polygon", "angle", "circle", "ellipse", "trapezoid", "parallelogram", "latex-text"].includes(tool)) {
      let graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
      if (values.snapToGrid || tool === "angle") graphPoint = snapGraphPoint(graphPoint, meta);
      canvas.__interactionPreview = { point: graphPoint, snap: values.snapToGrid || tool === "angle", tool, visible: true };
    } else {
      canvas.__interactionPreview = null;
    }
    drawGraphDraftOnCard(card, values);
    return;
  }

  const dxClient = event.clientX - diagramDragState.startClientX;
  const dyClient = event.clientY - diagramDragState.startClientY;
  if (!diagramDragState.moved && Math.hypot(dxClient, dyClient) < 3) return;
  diagramDragState.moved = true;
  if (!inside) return;

  let currentPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  if (getGraphValuesFromCard(card).snapToGrid) currentPoint = snapGraphPoint(currentPoint, meta);
  const values = normalizeGraph(JSON.parse(JSON.stringify(diagramDragState.startGraph)));
  if (!diagramDragState.historySaved) {
    pushDiagramHistory(question.id, normalizeGraph(diagramDragState.startGraph));
    diagramDragState.historySaved = true;
  }

  const handle = diagramDragState.handle;
  if (handle.kind === "label") {
    const dx = event.clientX - diagramDragState.startClientX;
    const dy = event.clientY - diagramDragState.startClientY;
    const hit = handle.labelHit;
    if (hit.kind === "manual" && values.points[hit.index]) {
      values.points[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx);
      values.points[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy);
    }
    if (hit.kind === "segmentLabel" && values.segments[hit.index]) {
      values.segments[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx);
      values.segments[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -10) + dy);
    }
    if (hit.kind === "angleLabel" && values.angles[hit.index]) {
      values.angles[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx);
      values.angles[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? 0) + dy);
    }
    if (hit.kind === "shapePoint") {
      const p = values.shapes?.[hit.shapeIndex]?.points?.[hit.pointIndex];
      if (p) { p.labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx); p.labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy); }
    }
    if (hit.kind === "regularVertex") {
      const shape = values.shapes?.[hit.shapeIndex];
      if (shape) {
        if (!Array.isArray(shape.vertexLabelOffsets)) shape.vertexLabelOffsets = [];
        shape.vertexLabelOffsets[hit.pointIndex] = { dx: roundGraphCoordinate((hit.labelDx ?? 8) + dx), dy: roundGraphCoordinate((hit.labelDy ?? -7) + dy) };
      }
    }
    if (hit.kind === "shapeSegmentLabel") {
      const shape = values.shapes?.[hit.shapeIndex];
      if (shape) {
        if (!shape.segmentLabelOffsets || typeof shape.segmentLabelOffsets !== "object") shape.segmentLabelOffsets = {};
        shape.segmentLabelOffsets[hit.key] = { dx: roundGraphCoordinate((hit.labelDx ?? 0) + dx), dy: roundGraphCoordinate((hit.labelDy ?? -10) + dy) };
      }
    }
    if (hit.kind === "text") {
      const shape = values.shapes?.[hit.shapeIndex];
      if (shape) {
        const dxg = currentPoint.x - diagramDragState.startPoint.x;
        const dyg = currentPoint.y - diagramDragState.startPoint.y;
        shape.x = roundGraphCoordinate(Number(shape.x) + dxg);
        shape.y = roundGraphCoordinate(Number(shape.y) + dyg);
      }
    }
  } else if (handle.kind === "transform") {
    const tr = handle.transform;
    const shape = values.shapes?.[tr.shapeIndex];
    if (shape) {
      if (tr.mode === "move-shape") {
        translateWholeShape(shape, currentPoint.x - diagramDragState.startPoint.x, currentPoint.y - diagramDragState.startPoint.y);
      } else if (tr.mode === "rotate-shape") {
        const startAngle = Math.atan2(diagramDragState.startPoint.y - tr.centerGraph.y, diagramDragState.startPoint.x - tr.centerGraph.x);
        const currentAngle = Math.atan2(currentPoint.y - tr.centerGraph.y, currentPoint.x - tr.centerGraph.x);
        rotateWholeShape(shape, tr.centerGraph, currentAngle - startAngle);
      } else if (tr.mode === "resize-shape") {
        const startDist = Math.hypot(diagramDragState.startPoint.x - tr.centerGraph.x, diagramDragState.startPoint.y - tr.centerGraph.y) || 1;
        const currentDist = Math.hypot(currentPoint.x - tr.centerGraph.x, currentPoint.y - tr.centerGraph.y) || startDist;
        scaleWholeShape(shape, tr.centerGraph, Math.max(0.05, currentDist / startDist));
      }
    }
  } else if (diagramDragState.groupHandles && diagramDragState.groupHandles.length > 1) {
    const dx = currentPoint.x - diagramDragState.startPoint.x;
    const dy = currentPoint.y - diagramDragState.startPoint.y;
    diagramDragState.groupHandles.forEach((handleId) => translateHandleById(values, handleId, dx, dy));
  } else if (handle.kind === "manual") {
    if (values.points[handle.index]) values.points[handle.index] = { ...values.points[handle.index], x: roundGraphCoordinate(currentPoint.x), y: roundGraphCoordinate(currentPoint.y) };
  } else if (handle.kind === "shape") {
    const shape = values.shapes?.[handle.shapeIndex];
    applyShapeHandleMove(shape, handle, currentPoint);
  }

  updatePointsField(card, values);
  graphDrafts.set(question.id, normalizeGraph(values));
  canvas.__interactionPreview = { point: currentPoint, snap: getGraphValuesFromCard(card).snapToGrid, tool: "move-point", visible: true };
  drawGraphDraftOnCard(card, values);
  renderAllPreviewsDebounced();
}

function editShapeVertexProperties(card, question, graph, objectId) {
  const [, shapeId, pointIndexRaw] = objectId.split(":");
  const shape = graph.shapes.find((item) => item.id === shapeId);
  const pointIndex = Number(pointIndexRaw);
  if (!shape || !Number.isFinite(pointIndex)) return;
  const points = getEdgePointsForShape(shape);
  const point = points[pointIndex];
  if (!point) return;
  openDiagramDialog({
    title: "Vertex properties",
    description: "Edit this vertex label and appearance.",
    fields: [
      { name: "label", label: "Vertex label", type: "text", value: point.label || `P${pointIndex}` },
      { name: "color", label: "Point color", type: "color", value: point.color || shape.stroke || "#145c63" },
      { name: "size", label: "Point size", type: "number", min: 2, max: 24, step: 1, value: point.size || 4 }
    ]
  }).then((result) => {
    if (!result) return;
    pushDiagramHistory(question.id, graph);
    if (shape.type === "regularPolygon") {
      if (!Array.isArray(shape.vertexLabels)) shape.vertexLabels = [];
      shape.vertexLabels[pointIndex] = sanitizeGraphLabel(result.label || point.label || `P${pointIndex}`);
    } else if (shape.points?.[pointIndex]) {
      shape.points[pointIndex].label = sanitizeGraphLabel(result.label || point.label || `P${pointIndex}`);
      shape.points[pointIndex].color = isHexColor(result.color) ? result.color : (point.color || shape.stroke || "#145c63");
      shape.points[pointIndex].size = parseNumberOrDefault(result.size, point.size || 4);
    }
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
}

function editLatexTextProperties(card, question, graph, shape) {
  openDiagramDialog({
    title: "LaTeX text properties",
    description: "Edit the text, color, and size. Common LaTeX commands are converted for canvas display.",
    fields: [
      { name: "text", label: "Text / LaTeX", type: "text", value: shape.text || "", full: true },
      { name: "fill", label: "Text color", type: "color", value: shape.fill || "#145c63" },
      { name: "fontSize", label: "Font size", type: "number", min: 8, max: 80, step: 1, value: shape.fontSize || 18 },
      { name: "visible", label: "Visible", type: "checkbox", value: shape.visible !== false }
    ]
  }).then((result) => {
    if (!result) return;
    pushDiagramHistory(question.id, graph);
    shape.text = String(result.text || "");
    shape.label = shape.text || "LaTeX text";
    shape.fill = isHexColor(result.fill) ? result.fill : (shape.fill || "#145c63");
    shape.fontSize = parseNumberOrDefault(result.fontSize, shape.fontSize || 18);
    shape.visible = Boolean(result.visible);
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
}

function editShapeProperties(card, question, graph, shape) {
  if (shape.type === "latexText") return editLatexTextProperties(card, question, graph, shape);
  const fields = [
    { name: "label", label: "Object label", type: "text", value: shape.label || "", full: true },
    { name: "stroke", label: "Line color", type: "color", value: shape.stroke || "#145c63" },
    { name: "fill", label: "Fill color", type: "color", value: shape.fill || "#e8f7f9" },
    { name: "lineDash", label: "Outline type", type: "select", value: shape.lineDash || "solid", options: [
      { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
    ]},
    { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: shape.lineWidth || 2 },
    { name: "visible", label: "Visible", type: "checkbox", value: shape.visible !== false }
  ];
  if (shape.type === "regularPolygon") {
    fields.push(
      { name: "sides", label: "Sides", type: "number", min: 3, max: 40, step: 1, value: shape.sides || 6 },
      { name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: shape.radius || 4 },
      { name: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1, value: shape.rotation || 90 },
      { name: "showApothem", label: "Show apothem", type: "checkbox", value: shape.showApothem }
    );
  }
  if (shape.type === "circle") fields.push({ name: "radius", label: "Radius", type: "number", min: 0.1, max: 100, step: 0.1, value: shape.radius || 1 });
  openDiagramDialog({ title: "Object properties", description: "Edit this figure's general properties.", fields }).then((result) => {
    if (!result) return;
    pushDiagramHistory(question.id, graph);
    shape.label = String(result.label || shape.label || "");
    shape.stroke = isHexColor(result.stroke) ? result.stroke : (shape.stroke || "#145c63");
    shape.fill = isHexColor(result.fill) ? result.fill : (shape.fill || "#e8f7f9");
    shape.lineDash = ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : (shape.lineDash || "solid");
    shape.lineWidth = parseNumberOrDefault(result.lineWidth, shape.lineWidth || 2);
    shape.visible = Boolean(result.visible);
    if (shape.type === "regularPolygon") {
      shape.sides = Math.max(3, Math.floor(parseNumberOrDefault(result.sides, shape.sides || 6)));
      shape.radius = Math.max(0.1, parseNumberOrDefault(result.radius, shape.radius || 4));
      shape.rotation = parseNumberOrDefault(result.rotation, shape.rotation || 90);
      shape.showApothem = Boolean(result.showApothem);
    }
    if (shape.type === "circle") shape.radius = Math.max(0.1, parseNumberOrDefault(result.radius, shape.radius || 1));
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    drawGraphDraftOnCard(card, next);
    renderAllPreviewsDebounced();
  });
}

function editDiagramObjectPropertiesAsync(card, question, graph, objectId) {
  const normalized = normalizeGraph(graph);
  if (objectId && objectId.startsWith("edge:")) return editShapeEdgeProperties(card, question, normalized, objectId);
  if (objectId && objectId.startsWith("shape-point:")) return editShapeVertexProperties(card, question, normalized, objectId);

  const hit = getDiagramObjectById(normalized, objectId);
  if (!hit) return;
  const obj = hit.ref;

  if (hit.kind === "point") {
    openDiagramDialog({
      title: "Point properties",
      description: "Edit this point.",
      fields: [
        { name: "label", label: "Point label", type: "text", value: obj.label || "" },
        { name: "color", label: "Point color", type: "color", value: obj.color || "#145c63" },
        { name: "size", label: "Point size", type: "number", min: 2, max: 24, step: 1, value: obj.size || 5 },
        { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
      ]
    }).then((result) => {
      if (!result) return;
      pushDiagramHistory(question.id, normalized);
      obj.label = sanitizeGraphLabel(result.label || obj.label);
      obj.color = isHexColor(result.color) ? result.color : (obj.color || "#145c63");
      obj.size = parseNumberOrDefault(result.size, obj.size || 5);
      obj.visible = Boolean(result.visible);
      normalized.pointsText = pointsToText(normalized.points);
      const next = normalizeGraph(normalized);
      graphDrafts.set(question.id, next);
      updatePointsField(card, next);
      drawGraphDraftOnCard(card, next);
      renderAllPreviewsDebounced();
    });
    return;
  }

  if (hit.kind === "segment") {
    openDiagramDialog({
      title: "Segment properties",
      description: "Adjust this segment's label and line style.",
      fields: [
        { name: "labelMode", label: "Label", type: "select", value: obj.labelMode || "name", options: [
          { value: "name", label: "Name" }, { value: "length", label: "Length" }, { value: "variable", label: "Variable x" }, { value: "hidden", label: "Hidden" }
        ]},
        { name: "color", label: "Line color", type: "color", value: obj.color || "#145c63" },
        { name: "lineDash", label: "Outline type", type: "select", value: obj.lineDash || "solid", options: [
          { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
        ]},
        { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: obj.lineWidth || 2 },
        { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
      ]
    }).then((result) => {
      if (!result) return;
      pushDiagramHistory(question.id, normalized);
      obj.labelMode = result.labelMode || obj.labelMode || "name";
      obj.color = isHexColor(result.color) ? result.color : (obj.color || "#145c63");
      obj.lineDash = ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : (obj.lineDash || "solid");
      obj.lineWidth = parseNumberOrDefault(result.lineWidth, obj.lineWidth || 2);
      obj.visible = Boolean(result.visible);
      const next = normalizeGraph(normalized);
      graphDrafts.set(question.id, next);
      drawGraphDraftOnCard(card, next);
      renderAllPreviewsDebounced();
    });
    return;
  }

  if (hit.kind === "angle") {
    openDiagramDialog({
      title: "Angle properties",
      description: "Adjust this angle label and arc.",
      fields: [
        { name: "labelMode", label: "Label", type: "select", value: obj.labelMode || "value", options: [
          { value: "name", label: "∠ABC" }, { value: "value", label: "Value" }, { value: "variable", label: "Variable x" }, { value: "blank", label: "Blank with arc" }, { value: "none", label: "No arc or label" }
        ]},
        { name: "color", label: "Arc color", type: "color", value: obj.color || "#145c63" },
        { name: "radius", label: "Arc radius", type: "number", min: 8, max: 80, step: 1, value: obj.radius || 22 },
        { name: "visible", label: "Visible", type: "checkbox", value: obj.visible !== false }
      ]
    }).then((result) => {
      if (!result) return;
      pushDiagramHistory(question.id, normalized);
      obj.labelMode = result.labelMode || obj.labelMode || "value";
      obj.color = isHexColor(result.color) ? result.color : (obj.color || "#145c63");
      obj.radius = parseNumberOrDefault(result.radius, obj.radius || 22);
      obj.visible = Boolean(result.visible);
      const next = normalizeGraph(normalized);
      graphDrafts.set(question.id, next);
      drawGraphDraftOnCard(card, next);
      renderAllPreviewsDebounced();
    });
    return;
  }

  if (hit.kind === "shape") return editShapeProperties(card, question, normalized, obj);

  if (hit.kind === "function") {
    openDiagramDialog({
      title: "Function properties",
      description: "Edit the plotted function and its style.",
      fields: [
        { name: "expression", label: "Function: y =", type: "text", value: normalized.expression || "", full: true },
        { name: "functionStroke", label: "Trace color", type: "color", value: normalized.functionStroke || "#145c63" },
        { name: "functionDash", label: "Trace type", type: "select", value: normalized.functionDash || "solid", options: [
          { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
        ]},
        { name: "functionLineWidth", label: "Trace thickness", type: "number", min: 1, max: 12, step: 0.5, value: normalized.functionLineWidth || 2.5 },
        { name: "functionLabel", label: "Function label", type: "text", value: normalized.functionLabel || "", full: true },
        { name: "visible", label: "Visible", type: "checkbox", value: normalized.functionVisible !== false }
      ]
    }).then((result) => {
      if (!result) return;
      pushDiagramHistory(question.id, normalized);
      normalized.expression = String(result.expression || "").trim();
      normalized.functionStroke = isHexColor(result.functionStroke) ? result.functionStroke : "#145c63";
      normalized.functionDash = ["solid", "dashed", "dotted"].includes(result.functionDash) ? result.functionDash : "solid";
      normalized.functionLineWidth = parseNumberOrDefault(result.functionLineWidth, 2.5);
      normalized.functionLabel = String(result.functionLabel || "");
      normalized.functionVisible = Boolean(result.visible);
      const next = normalizeGraph(normalized);
      graphDrafts.set(question.id, next);
      setHiddenGraphField(card, "expression", next.expression);
      drawGraphDraftOnCard(card, next);
      renderAllPreviewsDebounced();
    });
  }
}

function handleQuestionDoubleClick(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;
  meta.canvasQuestionId = question.id;
  const pointer = getCanvasPointer(event, canvas);
  const values = normalizeGraph(getGraphValuesFromCard(card));
  const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
  if (!hit) return;
  diagramObjectSelectionByQuestionId.set(question.id, hit.id);
  diagramMultiObjectSelectionByQuestionId.set(question.id, [hit.id]);
  setActiveDiagramTool(question.id, "select");
  updateDiagramToolButtons(card, "select");
  drawGraphDraftOnCard(card, values);
  editDiagramObjectPropertiesAsync(card, question, values, hit.id);
}



initialize();

/* ===== Stage 7: navigation, active-tool stabilization, and construction fixes ===== */
var stage7DiagramViewByQuestionId = new Map();
var stage7PanState = null;

function getQuestionCardById(questionId) {
  return document.querySelector(`[data-question-card][data-question-id="${CSS.escape(String(questionId || ""))}"]`);
}

function getActiveDiagramTool(questionId) {
  const card = getQuestionCardById(questionId);
  const activeButton = card?.querySelector?.('[data-diagram-tool].is-active');
  if (activeButton?.dataset?.diagramTool) return activeButton.dataset.diagramTool;
  return diagramToolByQuestionId.get(questionId) || "point";
}

function configureIrregularPolygonTool(question) {
  openDiagramDialog({
    title: "Irregular polygon settings",
    description: "Choose the number of vertices, then click them on the diagram.",
    fields: [
      { name: "sides", label: "Number of sides", type: "number", min: 3, max: 24, step: 1, value: 3 },
      { name: "label", label: "Object label", type: "text", value: "Irregular polygon", full: true },
      { name: "stroke", label: "Line color", type: "color", value: "#145c63" },
      { name: "fill", label: "Fill color", type: "color", value: "#e8f7f9" },
      { name: "lineDash", label: "Outline type", type: "select", value: "solid", options: [
        { value: "solid", label: "Continuous" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" }
      ]},
      { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: 2 }
    ]
  }).then((data) => {
    if (!data) {
      diagramConstructionByQuestionId.delete(question.id);
      return;
    }

    diagramConstructionByQuestionId.set(question.id, {
      tool: "irregular-polygon",
      targetSides: Math.max(3, Math.floor(parseNumberOrDefault(data.sides, 3))),
      points: [],
      settings: {
        label: String(data.label || "Irregular polygon"),
        stroke: isHexColor(data.stroke) ? data.stroke : "#145c63",
        fill: isHexColor(data.fill) ? data.fill : "#e8f7f9",
        lineDash: ["solid", "dashed", "dotted"].includes(data.lineDash) ? data.lineDash : "solid",
        lineWidth: parseNumberOrDefault(data.lineWidth, 2)
      }
    });
  });
}

function handleIrregularPolygonToolClick(card, question, values, meta, canvasX, canvasY) {
  const construction = diagramConstructionByQuestionId.get(question.id);
  const message = card.querySelector("[data-graph-message]");

  if (!construction || construction.tool !== "irregular-polygon" || !Number.isFinite(Number(construction.targetSides))) {
    if (message) {
      message.textContent = "Choose Irregular polygon again and confirm the settings before clicking vertices.";
      message.classList.add("error");
    }
    return;
  }

  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  construction.points.push({
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y)
  });
  diagramConstructionByQuestionId.set(question.id, construction);

  if (construction.points.length >= construction.targetSides) {
    pushDiagramHistory(question.id, values);
    const settings = construction.settings || {};
    const labels = reserveSequentialPointLabels(values, construction.targetSides);
    const shape = normalizeShape({
      id: nextShapeId(values, "irregularPolygon"),
      type: "irregularPolygon",
      label: settings.label || `${construction.targetSides}-side polygon`,
      stroke: settings.stroke || "#145c63",
      fill: settings.fill || "#e8f7f9",
      lineDash: settings.lineDash || "solid",
      lineWidth: settings.lineWidth || 2,
      targetSides: construction.targetSides,
      points: construction.points.map((p, index) => ({
        ...p,
        label: labels[index],
        labelDx: 8,
        labelDy: -7
      }))
    }, values.shapes.length);

    values.shapes.push(shape);
    diagramConstructionByQuestionId.delete(question.id);
    const next = normalizeGraph(values);
    graphDrafts.set(question.id, next);
    renderAllPreviewsDebounced();
    setToolToMovePoint(card, question, next, `shape:${shape.id}`);
    return;
  }

  if (message) {
    message.textContent = `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.`;
    message.classList.remove("error");
  }
  updateDiagramToolHint(card, values);
  drawGraphDraftOnCard(card, values);
}

function addManualPointAtCanvasPosition(card, question, values, meta, canvasX, canvasY) {
  diagramConstructionByQuestionId.delete(question.id);
  diagramSelectionByQuestionId.delete(question.id);

  let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
  if (values.snapToGrid) point = snapGraphPoint(point, meta);

  const latest = normalizeGraph(graphDrafts.get(question.id) || values || {});
  pushDiagramHistory(question.id, latest);

  const nextPoint = {
    label: nextPointLabelForGraph(latest),
    x: roundGraphCoordinate(point.x),
    y: roundGraphCoordinate(point.y),
    labelDx: 8,
    labelDy: -7,
    color: "#145c63",
    size: 5,
    visible: true
  };

  const nextPoints = [...latest.points, nextPoint];
  const nextGraph = normalizeGraph({
    ...latest,
    graphType: latest.graphType === "function" ? "points" : latest.graphType,
    points: nextPoints,
    pointsText: pointsToText(nextPoints)
  });

  updatePointsField(card, nextGraph);
  setHiddenGraphField(card, "graphType", nextGraph.graphType);
  graphDrafts.set(question.id, nextGraph);
  updateGraphFieldVisibility(card, nextGraph.graphType);
  drawGraphDraftOnCard(card, nextGraph);
  updateDiagramToolHint(card, nextGraph);
  renderAllPreviewsDebounced();
}

function handleGraphCanvasClick(event, canvas) {
  if (suppressNextCanvasClick) {
    suppressNextCanvasClick = false;
    return;
  }

  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const values = normalizeGraph(getGraphValuesFromCard(card));
  const meta = canvas.__graphMeta;
  if (!meta) return;
  meta.canvasQuestionId = question.id;

  const pointer = getCanvasPointer(event, canvas);
  if (!isInsidePlot(pointer.x, pointer.y, meta)) return;

  const tool = getActiveDiagramTool(question.id);

  if (tool === "move-point") {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit?.id?.startsWith("shape:")) {
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      diagramMultiObjectSelectionByQuestionId.set(question.id, [hit.id]);
    } else {
      diagramObjectSelectionByQuestionId.delete(question.id);
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
    }
    drawGraphDraftOnCard(card, values);
    updateDiagramToolHint(card, values);
    return;
  }

  if (tool === "select") {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit) {
      const current = new Set(diagramMultiObjectSelectionByQuestionId.get(question.id) || []);
      if (event.ctrlKey || event.metaKey) {
        if (current.has(hit.id)) current.delete(hit.id);
        else current.add(hit.id);
      } else {
        current.clear();
        current.add(hit.id);
      }
      diagramMultiObjectSelectionByQuestionId.set(question.id, [...current]);
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      drawGraphDraftOnCard(card, values);
    } else if (!(event.ctrlKey || event.metaKey)) {
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramObjectSelectionByQuestionId.delete(question.id);
      drawGraphDraftOnCard(card, values);
    }
    return;
  }

  if (tool === "erase") { eraseObjectAtPosition(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "segment") { handleSegmentToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "angle") { handleAngleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "polygon") { handlePolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "irregular-polygon") { handleIrregularPolygonToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "circle") { handleCircleToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "ellipse") { handleEllipseToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "trapezoid" || tool === "parallelogram") { handleTemplateShapeClick(card, question, values, meta, pointer.x, pointer.y, tool); return; }
  if (tool === "latex-text") { handleLatexTextToolClick(card, question, values, meta, pointer.x, pointer.y); return; }
  if (tool === "function") return;

  addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
}

function handleGraphPointerDown(event) {
  const canvas = event.target.closest("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  if (!card || !question) return;

  const meta = canvas.__graphMeta;
  if (!meta) return;
  meta.canvasQuestionId = question.id;

  if (event.button === 2) {
    stage7PanState = {
      canvas,
      card,
      questionId: question.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startView: getCurrentDiagramView(question.id, meta)
    };
    canvas.classList.add("is-panning");
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return;
  }

  const tool = getActiveDiagramTool(question.id);
  if (tool !== "move-point") return;

  const values = normalizeGraph(getGraphValuesFromCard(card));
  const pointer = getCanvasPointer(event, canvas);

  let selectedId = diagramObjectSelectionByQuestionId.get(question.id);
  let transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId);

  if (!transform) {
    const hit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
    if (hit?.id?.startsWith("shape:")) {
      selectedId = hit.id;
      diagramObjectSelectionByQuestionId.set(question.id, hit.id);
      diagramMultiObjectSelectionByQuestionId.set(question.id, [hit.id]);
      transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId) || getMoveTransformForShapeHit(values, hit.id);
      drawGraphDraftOnCard(card, values);
    } else if (!hit) {
      diagramObjectSelectionByQuestionId.delete(question.id);
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
      drawGraphDraftOnCard(card, values);
      return;
    }
  }

  const point = findClickedPoint(values, meta, pointer.x, pointer.y);
  const labelHit = point ? null : findClickedLabel(values, meta, pointer.x, pointer.y);
  const handle = transform
    ? { kind: "transform", transform }
    : point
      ? (point.source === "manual" ? { kind: "manual", index: point.index, point } : { kind: "shape", shapeIndex: point.shapeIndex, pointIndex: point.index, point })
      : (labelHit ? { kind: "label", labelHit } : null);

  if (!handle) return;

  const handleId = getHandleObjectIdFromHandle(values, handle);
  if ((event.ctrlKey || event.metaKey) && handleId) {
    toggleGroupedHandle(question.id, handleId);
    drawGraphDraftOnCard(card, values);
    event.preventDefault();
    return;
  }

  const selectedHandles = diagramGroupedHandleSelectionByQuestionId.get(question.id) || [];
  const groupHandles = handleId && selectedHandles.includes(handleId) && selectedHandles.length > 1 ? selectedHandles : (handleId ? [handleId] : []);
  const gp = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  diagramDragState = {
    card,
    canvas,
    questionId: question.id,
    handle,
    handleId,
    groupHandles,
    startGraph: JSON.parse(JSON.stringify(values)),
    startPoint: gp,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
    historySaved: false
  };
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function getMoveTransformForShapeHit(graph, objectId) {
  if (!objectId?.startsWith?.("shape:")) return null;
  const shapeId = objectId.split(":")[1];
  const shapeIndex = graph.shapes.findIndex((shape) => shape.id === shapeId);
  const shape = graph.shapes[shapeIndex];
  const bounds = getGraphBoundsForShape(shape);
  if (!shape || !bounds) return null;
  return {
    mode: "move-shape",
    shapeIndex,
    shapeId,
    bounds,
    centerGraph: { x: bounds.cx, y: bounds.cy }
  };
}

function getCurrentDiagramView(questionId, meta) {
  return stage7DiagramViewByQuestionId.get(questionId) || {
    xMin: meta.xMin,
    xMax: meta.xMax,
    yMin: meta.yMin,
    yMax: meta.yMax
  };
}

function setDiagramView(questionId, view) {
  if (!view || !Number.isFinite(view.xMin) || !Number.isFinite(view.xMax) || !Number.isFinite(view.yMin) || !Number.isFinite(view.yMax)) return;
  if (view.xMin >= view.xMax || view.yMin >= view.yMax) return;
  stage7DiagramViewByQuestionId.set(questionId, view);
}

function resetDiagramView(questionId) {
  stage7DiagramViewByQuestionId.delete(questionId);
}

const drawGraphBeforeStage7 = drawGraph;
drawGraph = function drawGraphStage7View(canvas, rawGraph) {
  const card = canvas.closest?.("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const view = question ? stage7DiagramViewByQuestionId.get(question.id) : null;
  if (view) {
    const graph = normalizeGraph(rawGraph || {});
    drawGraphBeforeStage7(canvas, { ...graph, ...view, autoFit: false });
    return;
  }
  drawGraphBeforeStage7(canvas, rawGraph);
};

function handleStage7Wheel(event) {
  const canvas = event.target.closest?.("[data-editor-graph]");
  if (!canvas) return;
  const card = canvas.closest("[data-question-card]");
  const question = card ? findQuestion(card.dataset.questionId) : null;
  const meta = canvas.__graphMeta;
  if (!card || !question || !meta) return;

  event.preventDefault();
  const pointer = getCanvasPointer(event, canvas);
  const graphPoint = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
  const current = getCurrentDiagramView(question.id, meta);
  const factor = event.deltaY < 0 ? 0.88 : 1.14;
  const next = {
    xMin: graphPoint.x - (graphPoint.x - current.xMin) * factor,
    xMax: graphPoint.x + (current.xMax - graphPoint.x) * factor,
    yMin: graphPoint.y - (graphPoint.y - current.yMin) * factor,
    yMax: graphPoint.y + (current.yMax - graphPoint.y) * factor
  };
  setDiagramView(question.id, next);
  drawGraphDraftOnCard(card, getGraphValuesFromCard(card));
}

function handleStage7PanMove(event) {
  if (!stage7PanState) return;
  const { canvas, card, questionId, startClientX, startClientY, startView } = stage7PanState;
  const meta = canvas.__graphMeta;
  if (!meta) return;

  const dxPx = event.clientX - startClientX;
  const dyPx = event.clientY - startClientY;
  const dxGraph = (dxPx / meta.plotWidth) * (startView.xMax - startView.xMin);
  const dyGraph = (dyPx / meta.plotHeight) * (startView.yMax - startView.yMin);

  const next = {
    xMin: startView.xMin - dxGraph,
    xMax: startView.xMax - dxGraph,
    yMin: startView.yMin + dyGraph,
    yMax: startView.yMax + dyGraph
  };
  setDiagramView(questionId, next);
  drawGraphDraftOnCard(card, getGraphValuesFromCard(card));
  event.preventDefault();
}

function handleStage7PanEnd(event) {
  if (!stage7PanState) return;
  stage7PanState.canvas?.classList.remove("is-panning");
  stage7PanState.canvas?.releasePointerCapture?.(event.pointerId);
  stage7PanState = null;
}

function handleStage7Click(event) {
  const centerButton = event.target.closest?.('[data-action="center-view"]');
  if (centerButton) {
    const card = centerButton.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;
    resetDiagramView(question.id);
    drawGraphDraftOnCard(card, getGraphValuesFromCard(card));
    event.preventDefault();
    return;
  }
}

function setupStage7Runtime() {
  document.addEventListener("wheel", handleStage7Wheel, { passive: false });
  document.addEventListener("pointermove", handleStage7PanMove, true);
  document.addEventListener("pointerup", handleStage7PanEnd, true);
  document.addEventListener("pointercancel", handleStage7PanEnd, true);
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest?.("[data-editor-graph]")) event.preventDefault();
  });
  document.addEventListener("click", handleStage7Click, true);

  const previewButton = document.getElementById("togglePreviewColumnBtn");
  const layout = document.querySelector(".exam-layout");
  if (previewButton && layout) {
    previewButton.addEventListener("click", () => {
      const collapsed = layout.classList.toggle("preview-collapsed");
      previewButton.textContent = collapsed ? "Preview" : "Minimize";
      previewButton.setAttribute("aria-expanded", String(!collapsed));
      window.setTimeout(drawAllGraphs, 120);
    });
  }
}

setupStage7Runtime();

/* ===== Stage 8: irregular polygon fix, view aspect, preview collapse polish, and robust move/select/edit ===== */
(function setupStage8Patch() {
  const stage8DefaultViewByQuestionId = new Map();

  function stage8CardAndQuestionFromCanvas(canvas) {
    const card = canvas?.closest?.("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    return { card, question };
  }

  function stage8SetMessage(card, text, isError = false) {
    const message = card?.querySelector?.("[data-graph-message]");
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("error", Boolean(isError));
  }

  function stage8GetCanvasSizeParts(canvas) {
    const size = getSquareCanvasSize(canvas);
    const padding = { left: 36, right: 40, top: 42, bottom: 32 };
    return {
      size,
      padding,
      plotWidth: size - padding.left - padding.right,
      plotHeight: size - padding.top - padding.bottom
    };
  }

  function stage8MatchPixelAspect(view, canvas) {
    if (!view || !canvas) return view;
    const { plotWidth, plotHeight } = stage8GetCanvasSizeParts(canvas);
    if (!plotWidth || !plotHeight) return view;

    const xRange = Math.max(1e-9, Number(view.xMax) - Number(view.xMin));
    const yRange = Math.max(1e-9, Number(view.yMax) - Number(view.yMin));
    const targetYRange = xRange * (plotHeight / plotWidth);
    const cx = (Number(view.xMin) + Number(view.xMax)) / 2;
    const cy = (Number(view.yMin) + Number(view.yMax)) / 2;

    if (targetYRange >= yRange) {
      return {
        xMin: Number(view.xMin),
        xMax: Number(view.xMax),
        yMin: cy - targetYRange / 2,
        yMax: cy + targetYRange / 2
      };
    }

    const targetXRange = yRange * (plotWidth / plotHeight);
    return {
      xMin: cx - targetXRange / 2,
      xMax: cx + targetXRange / 2,
      yMin: Number(view.yMin),
      yMax: Number(view.yMax)
    };
  }

  if (typeof drawGraphBeforeStage7 === "function") {
    drawGraph = function drawGraphStage8View(canvas, rawGraph) {
      const card = canvas.closest?.("[data-question-card]");
      const question = card ? findQuestion(card.dataset.questionId) : null;
      const view = question ? stage7DiagramViewByQuestionId.get(question.id) : null;
      const graph = normalizeGraph(rawGraph || {});

      if (question && !stage8DefaultViewByQuestionId.has(question.id)) {
        stage8DefaultViewByQuestionId.set(question.id, {
          xMin: graph.xMin,
          xMax: graph.xMax,
          yMin: graph.yMin === "" ? -10 : graph.yMin,
          yMax: graph.yMax === "" ? 10 : graph.yMax
        });
      }

      if (view) {
        const fixedView = stage8MatchPixelAspect(view, canvas);
        drawGraphBeforeStage7(canvas, { ...graph, ...fixedView, autoFit: false });
        return;
      }

      drawGraphBeforeStage7(canvas, graph);
    };
  }

  const stage8PreviousResetDiagramView = typeof resetDiagramView === "function" ? resetDiagramView : null;
  resetDiagramView = function resetDiagramViewStage8(questionId) {
    if (stage8PreviousResetDiagramView) stage8PreviousResetDiagramView(questionId);
    stage7DiagramViewByQuestionId.delete(questionId);
  };

  const stage8PreviousGetActiveDiagramTool = typeof getActiveDiagramTool === "function" ? getActiveDiagramTool : null;
  getActiveDiagramTool = function getActiveDiagramToolStage8(questionId) {
    const card = getQuestionCardById(questionId);
    const activeButton = card?.querySelector?.('[data-diagram-tool].is-active');
    if (activeButton?.dataset?.diagramTool) return activeButton.dataset.diagramTool;
    return (stage8PreviousGetActiveDiagramTool ? stage8PreviousGetActiveDiagramTool(questionId) : diagramToolByQuestionId.get(questionId)) || "point";
  };

  const stage8PreviousSetActiveDiagramTool = typeof setActiveDiagramTool === "function" ? setActiveDiagramTool : null;
  setActiveDiagramTool = function setActiveDiagramToolStage8(questionId, tool) {
    if (stage8PreviousSetActiveDiagramTool) stage8PreviousSetActiveDiagramTool(questionId, tool);
    diagramToolByQuestionId.set(questionId, tool);

    if (tool === "point") {
      diagramConstructionByQuestionId.delete(questionId);
      diagramSelectionByQuestionId.delete(questionId);
      diagramGroupedHandleSelectionByQuestionId?.delete?.(questionId);
    }

    if (tool !== "move-point") {
      diagramObjectSelectionByQuestionId.delete(questionId);
      diagramMultiObjectSelectionByQuestionId.delete(questionId);
    }
  };

  const stage8PreviousConfigureIrregularPolygonTool = typeof configureIrregularPolygonTool === "function" ? configureIrregularPolygonTool : null;
  configureIrregularPolygonTool = function configureIrregularPolygonToolStage8(question) {
    openDiagramDialog({
      title: "Irregular polygon settings",
      description: "Choose the number of vertices, then click each vertex on the diagram.",
      fields: [
        { name: "sides", label: "Number of sides", type: "number", min: 3, max: 24, step: 1, value: 3 },
        { name: "label", label: "Object label", type: "text", value: "Irregular polygon", full: true },
        { name: "stroke", label: "Line color", type: "color", value: "#145c63" },
        { name: "fill", label: "Fill color", type: "color", value: "#e8f7f9" },
        { name: "lineDash", label: "Outline type", type: "select", value: "solid", options: [
          { value: "solid", label: "Continuous" },
          { value: "dashed", label: "Dashed" },
          { value: "dotted", label: "Dotted" }
        ] },
        { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: 2 }
      ],
      onSubmit: (data) => {
        const targetSides = Math.max(3, Math.floor(parseNumberOrDefault(data.sides, 3)));
        diagramConstructionByQuestionId.set(question.id, {
          tool: "irregular-polygon",
          targetSides,
          points: [],
          settings: {
            label: String(data.label || "Irregular polygon"),
            stroke: isHexColor(data.stroke) ? data.stroke : "#145c63",
            fill: isHexColor(data.fill) ? data.fill : "#e8f7f9",
            lineDash: ["solid", "dashed", "dotted"].includes(data.lineDash) ? data.lineDash : "solid",
            lineWidth: parseNumberOrDefault(data.lineWidth, 2)
          }
        });

        const card = getQuestionCardById(question.id);
        if (card) {
          stage8SetMessage(card, `Irregular polygon: 0/${targetSides} vertices selected.`);
          updateDiagramToolHint(card, getGraphValuesFromCard(card));
        }
      }
    });
  };

  handleIrregularPolygonToolClick = function handleIrregularPolygonToolClickStage8(card, question, values, meta, canvasX, canvasY) {
    const construction = diagramConstructionByQuestionId.get(question.id);
    if (!construction || construction.tool !== "irregular-polygon" || !Number.isFinite(Number(construction.targetSides))) {
      stage8SetMessage(card, "Choose Irregular polygon in the Insert menu and confirm its settings first.", true);
      return;
    }

    let point = graphPointFromCanvasPoint(meta, canvasX, canvasY);
    if (values.snapToGrid) point = snapGraphPoint(point, meta);

    construction.points = Array.isArray(construction.points) ? construction.points : [];
    construction.points.push({ x: roundGraphCoordinate(point.x), y: roundGraphCoordinate(point.y) });
    diagramConstructionByQuestionId.set(question.id, construction);

    if (construction.points.length >= Number(construction.targetSides)) {
      const graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
      pushDiagramHistory(question.id, graph);
      const settings = construction.settings || {};
      const labels = reserveSequentialPointLabels(graph, construction.points.length);
      const shape = normalizeShape({
        id: nextShapeId(graph, "irregularPolygon"),
        type: "irregularPolygon",
        label: settings.label || `${construction.targetSides}-side polygon`,
        stroke: settings.stroke || "#145c63",
        fill: settings.fill || "#e8f7f9",
        lineDash: settings.lineDash || "solid",
        lineWidth: settings.lineWidth || 2,
        targetSides: construction.targetSides,
        points: construction.points.map((p, index) => ({ ...p, label: labels[index], labelDx: 8, labelDy: -7 }))
      }, graph.shapes.length);

      graph.shapes.push(shape);
      diagramConstructionByQuestionId.delete(question.id);
      const next = normalizeGraph(graph);
      graphDrafts.set(question.id, next);
      stage8SetMessage(card, "Irregular polygon created. Use Move to adjust it.");
      setToolToMovePoint(card, question, next, `shape:${shape.id}`);
      drawGraphDraftOnCard(card, next);
      renderAllPreviewsDebounced();
      return;
    }

    stage8SetMessage(card, `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.`);
    updateDiagramToolHint(card, values);
    drawGraphDraftOnCard(card, values);
  };

  const stage8PreviousAddManualPoint = typeof addManualPointAtCanvasPosition === "function" ? addManualPointAtCanvasPosition : null;
  addManualPointAtCanvasPosition = function addManualPointAtCanvasPositionStage8(card, question, values, meta, canvasX, canvasY) {
    diagramConstructionByQuestionId.delete(question.id);
    diagramSelectionByQuestionId.delete(question.id);
    diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
    if (stage8PreviousAddManualPoint) {
      return stage8PreviousAddManualPoint(card, question, values, meta, canvasX, canvasY);
    }
  };

  function stage8HitShapeObject(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});
    for (let index = (normalized.shapes || []).length - 1; index >= 0; index -= 1) {
      const shape = normalized.shapes[index];
      if (!shape || shape.visible === false) continue;
      if (isPointInsideShapeClick(shape, normalized, meta, clickX, clickY)) return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
      const points = getEdgePointsForShape(shape);
      if (Array.isArray(points) && points.length >= 2) {
        for (let i = 0; i < points.length; i += 1) {
          const start = points[i];
          const end = points[(i + 1) % points.length];
          const a = meta.toPx(start.x, start.y);
          const b = meta.toPx(end.x, end.y);
          if (distancePointToSegment(clickX, clickY, a.px, a.py, b.px, b.py) <= 12) return { id: `shape:${shape.id}`, kind: "shape", ref: shape };
        }
      }
    }
    return null;
  }

  const stage8PreviousFindClickedDiagramObject = typeof findClickedDiagramObject === "function" ? findClickedDiagramObject : null;
  findClickedDiagramObject = function findClickedDiagramObjectStage8(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});
    const labelHit = typeof findClickedLabel === "function" ? findClickedLabel(normalized, meta, clickX, clickY) : null;
    if (labelHit?.kind === "shapeSegmentLabel") {
      const shape = normalized.shapes?.[labelHit.shapeIndex];
      if (shape?.id) return { id: `edge:${shape.id}:${labelHit.key}`, kind: "shapeEdge", ref: { shape, key: labelHit.key } };
    }

    const segmentHit = findClickedSegment(normalized, meta, clickX, clickY);
    if (segmentHit?.segment?.shapePolygon) return { id: `edge:${segmentHit.segment.shapeId}:${segmentHit.segment.polygonSegmentKey}`, kind: "shapeEdge", ref: segmentHit.segment };

    const previous = stage8PreviousFindClickedDiagramObject ? stage8PreviousFindClickedDiagramObject(normalized, meta, clickX, clickY) : null;
    if (previous) return previous;

    return stage8HitShapeObject(normalized, meta, clickX, clickY);
  };

  function stage8SelectShapeForMove(card, question, graph, objectId) {
    if (!objectId || !objectId.startsWith("shape:")) return false;
    diagramObjectSelectionByQuestionId.set(question.id, objectId);
    diagramMultiObjectSelectionByQuestionId.set(question.id, [objectId]);
    diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
    drawGraphDraftOnCard(card, graph);
    updateDiagramToolHint(card, graph);
    return true;
  }

  function stage8ClearMoveSelection(card, question, graph) {
    diagramObjectSelectionByQuestionId.delete(question.id);
    diagramMultiObjectSelectionByQuestionId.delete(question.id);
    diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
    drawGraphDraftOnCard(card, graph);
    updateDiagramToolHint(card, graph);
  }

  function handleStage8Click(event) {
    const toolButton = event.target.closest?.("[data-diagram-tool]");
    if (toolButton) {
      const card = toolButton.closest("[data-question-card]");
      const question = card ? findQuestion(card.dataset.questionId) : null;
      if (!card || !question) return;
      const tool = toolButton.dataset.diagramTool;
      if (tool === "point") {
        diagramConstructionByQuestionId.delete(question.id);
        diagramSelectionByQuestionId.delete(question.id);
        diagramObjectSelectionByQuestionId.delete(question.id);
        diagramMultiObjectSelectionByQuestionId.delete(question.id);
        diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
      }
      return;
    }

    const canvas = event.target.closest?.("[data-editor-graph]");
    if (!canvas) return;
    const { card, question } = stage8CardAndQuestionFromCanvas(canvas);
    const meta = canvas.__graphMeta;
    if (!card || !question || !meta) return;
    meta.canvasQuestionId = question.id;
    const pointer = getCanvasPointer(event, canvas);
    if (!isInsidePlot(pointer.x, pointer.y, meta)) return;

    const tool = getActiveDiagramTool(question.id);
    const values = normalizeGraph(getGraphValuesFromCard(card));

    if (tool === "point") {
      event.preventDefault();
      event.stopImmediatePropagation();
      addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
      return;
    }

    if (tool === "irregular-polygon") {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleIrregularPolygonToolClick(card, question, values, meta, pointer.x, pointer.y);
      return;
    }

    if (tool === "move-point") {
      const transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, diagramObjectSelectionByQuestionId.get(question.id));
      if (transform) return;
      const shapeHit = stage8HitShapeObject(values, meta, pointer.x, pointer.y);
      if (shapeHit?.id) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stage8SelectShapeForMove(card, question, values, shapeHit.id);
        return;
      }
      const anyHit = findClickedDiagramObject(values, meta, pointer.x, pointer.y);
      if (!anyHit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stage8ClearMoveSelection(card, question, values);
      }
    }
  }

  function handleStage8PointerDown(event) {
    const canvas = event.target.closest?.("[data-editor-graph]");
    if (!canvas || event.button === 2) return;
    const { card, question } = stage8CardAndQuestionFromCanvas(canvas);
    const meta = canvas.__graphMeta;
    if (!card || !question || !meta) return;
    const tool = getActiveDiagramTool(question.id);
    if (tool !== "move-point") return;

    const values = normalizeGraph(getGraphValuesFromCard(card));
    const pointer = getCanvasPointer(event, canvas);
    const selectedId = diagramObjectSelectionByQuestionId.get(question.id);
    const transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId);
    if (transform) return;

    const shapeHit = stage8HitShapeObject(values, meta, pointer.x, pointer.y);
    if (shapeHit?.id) {
      diagramObjectSelectionByQuestionId.set(question.id, shapeHit.id);
      diagramMultiObjectSelectionByQuestionId.set(question.id, [shapeHit.id]);
      drawGraphDraftOnCard(card, values);
    }
  }

  const stage8PreviousEditDiagramObject = typeof editDiagramObjectPropertiesAsync === "function" ? editDiagramObjectPropertiesAsync : null;
  editDiagramObjectPropertiesAsync = function editDiagramObjectPropertiesAsyncStage8(card, question, graph, objectId) {
    const normalized = normalizeGraph(graph || getGraphValuesFromCard(card));

    if (objectId?.startsWith?.("edge:")) {
      return editShapeEdgeProperties(card, question, normalized, objectId);
    }

    if (objectId?.startsWith?.("shape:")) {
      const shapeId = objectId.split(":")[1];
      const shape = normalized.shapes.find((item) => item.id === shapeId);
      if (!shape) return;
      return openDiagramDialog({
        title: "Object properties",
        description: "Adjust this object after creation.",
        fields: [
          { name: "label", label: "Object label", type: "text", value: shape.label || "", full: true },
          ...(shape.type === "latexText" ? [
            { name: "text", label: "LaTeX/text", type: "text", value: shape.text || "", full: true },
            { name: "fontSize", label: "Text size", type: "number", min: 8, max: 72, step: 1, value: shape.fontSize || 18 },
            { name: "fill", label: "Text color", type: "color", value: shape.fill || "#145c63" }
          ] : [
            { name: "stroke", label: "Line color", type: "color", value: shape.stroke || "#145c63" },
            { name: "fill", label: "Fill color", type: "color", value: shape.fill || "#e8f7f9" },
            { name: "lineDash", label: "Outline type", type: "select", value: shape.lineDash || "solid", options: [
              { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
            ] },
            { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: shape.lineWidth || 2 }
          ]),
          { name: "visible", label: "Visible", type: "checkbox", value: shape.visible !== false }
        ]
      }).then((result) => {
        if (!result) return;
        pushDiagramHistory(question.id, normalized);
        shape.label = String(result.label || "");
        shape.visible = Boolean(result.visible);
        if (shape.type === "latexText") {
          shape.text = String(result.text || "");
          shape.fontSize = Math.max(8, parseNumberOrDefault(result.fontSize, shape.fontSize || 18));
          shape.fill = isHexColor(result.fill) ? result.fill : (shape.fill || "#145c63");
        } else {
          shape.stroke = isHexColor(result.stroke) ? result.stroke : (shape.stroke || "#145c63");
          shape.fill = isHexColor(result.fill) ? result.fill : (shape.fill || "#e8f7f9");
          shape.lineDash = ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : (shape.lineDash || "solid");
          shape.lineWidth = parseNumberOrDefault(result.lineWidth, shape.lineWidth || 2);
        }
        const next = normalizeGraph(normalized);
        graphDrafts.set(question.id, next);
        drawGraphDraftOnCard(card, next);
        renderAllPreviewsDebounced();
      });
    }

    return stage8PreviousEditDiagramObject ? stage8PreviousEditDiagramObject(card, question, normalized, objectId) : undefined;
  };

  document.addEventListener("click", handleStage8Click, true);
  document.addEventListener("pointerdown", handleStage8PointerDown, true);
})();

/* ===== Stage 9: robust move/label editing, irregular polygon fix, and cleaner defaults ===== */
(function stage9Patch() {
  let stage9DragState = null;
  let stage9SuppressClick = false;

  function stage9CardAndQuestionFromCanvas(canvas) {
    const card = canvas?.closest?.("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    return { card, question };
  }

  function stage9SetMessage(card, text, isError = false) {
    const message = card?.querySelector?.("[data-graph-message]");
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("error", Boolean(isError));
  }

  function stage9BaseRange(graph, meta) {
    const xMin = Number.isFinite(Number(graph?.xMin)) ? Number(graph.xMin) : meta?.xMin ?? -10;
    const xMax = Number.isFinite(Number(graph?.xMax)) ? Number(graph.xMax) : meta?.xMax ?? 10;
    const yMin = graph?.yMin === "" || !Number.isFinite(Number(graph?.yMin)) ? (meta?.yMin ?? -10) : Number(graph.yMin);
    const yMax = graph?.yMax === "" || !Number.isFinite(Number(graph?.yMax)) ? (meta?.yMax ?? 10) : Number(graph.yMax);
    return {
      x: Math.max(1, Math.abs(xMax - xMin)),
      y: Math.max(1, Math.abs(yMax - yMin))
    };
  }

  function stage9Hit(x, y, text, clickX, clickY) {
    return Math.abs(clickX - x) <= Math.max(18, String(text || "").length * 5.6) && Math.abs(clickY - y) <= 16;
  }

  function stage9SegmentLabelAnchor(segment, graph, meta) {
    const start = findPointByLabelInGraph(graph, segment.from);
    const end = findPointByLabelInGraph(graph, segment.to);
    if (!start || !end) return null;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    return {
      x: (a.px + b.px) / 2 + (Number(segment.labelDx) || 0),
      y: (a.py + b.py) / 2 + (Number(segment.labelDy) || -10),
      text: getSegmentLabel(start, end, segment.labelMode || "name")
    };
  }

  function stage9ShapeEdgeLabelAnchor(shape, edgeIndex, meta) {
    const points = getEdgePointsForShape(shape);
    if (!Array.isArray(points) || points.length < 2) return null;
    const start = points[edgeIndex];
    const end = points[(edgeIndex + 1) % points.length];
    if (!start || !end) return null;
    const key = makeShapeSegmentKey(shape, edgeIndex, start, end);
    const mode = shape.segmentLabelModes?.[key] || "name";
    const text = getSegmentLabel(start, end, mode);
    if (!text) return null;
    const a = meta.toPx(start.x, start.y);
    const b = meta.toPx(end.x, end.y);
    const offset = getSegmentOffsetFromContainer(shape, key);
    return {
      x: (a.px + b.px) / 2 + offset.dx,
      y: (a.py + b.py) / 2 + offset.dy,
      text,
      key,
      labelDx: offset.dx,
      labelDy: offset.dy
    };
  }

  function stage9FindLabelHit(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});

    for (let index = 0; index < (normalized.points || []).length; index += 1) {
      const point = normalized.points[index];
      if (!point || point.visible === false) continue;
      const p = meta.toPx(point.x, point.y);
      const x = p.px + (Number(point.labelDx) || 8);
      const y = p.py + (Number(point.labelDy) || -7);
      if (stage9Hit(x, y, point.label, clickX, clickY)) {
        return { kind: "manual", index, labelDx: Number(point.labelDx) || 8, labelDy: Number(point.labelDy) || -7 };
      }
    }

    for (let index = 0; index < (normalized.segments || []).length; index += 1) {
      const segment = normalized.segments[index];
      if (!segment || segment.visible === false) continue;
      const anchor = stage9SegmentLabelAnchor(segment, normalized, meta);
      if (anchor?.text && stage9Hit(anchor.x, anchor.y, anchor.text, clickX, clickY)) {
        return { kind: "segmentLabel", index, labelDx: Number(segment.labelDx) || 0, labelDy: Number(segment.labelDy) || -10 };
      }
    }

    for (let index = 0; index < (normalized.angles || []).length; index += 1) {
      const angle = normalized.angles[index];
      if (!angle || angle.visible === false) continue;
      const anchor = getAngleLabelAnchor(angle, normalized, meta);
      if (anchor?.text && stage9Hit(anchor.x, anchor.y, anchor.text, clickX, clickY)) {
        return { kind: "angleLabel", index, labelDx: Number(angle.labelDx) || 0, labelDy: Number(angle.labelDy) || 0 };
      }
    }

    for (let shapeIndex = 0; shapeIndex < (normalized.shapes || []).length; shapeIndex += 1) {
      const shape = normalized.shapes[shapeIndex];
      if (!shape || shape.visible === false) continue;

      const points = getEdgePointsForShape(shape);
      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        const point = points[pointIndex];
        if (!point) continue;
        const p = meta.toPx(point.x, point.y);
        const x = p.px + (Number(point.labelDx) || 8);
        const y = p.py + (Number(point.labelDy) || -7);
        if (stage9Hit(x, y, point.label, clickX, clickY)) {
          return {
            kind: shape.type === "regularPolygon" ? "regularVertex" : "shapePoint",
            shapeIndex,
            pointIndex,
            labelDx: Number(point.labelDx) || 8,
            labelDy: Number(point.labelDy) || -7
          };
        }
      }

      for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
        const anchor = stage9ShapeEdgeLabelAnchor(shape, edgeIndex, meta);
        if (anchor?.text && stage9Hit(anchor.x, anchor.y, anchor.text, clickX, clickY)) {
          return {
            kind: "shapeSegmentLabel",
            shapeIndex,
            edgeIndex,
            key: anchor.key,
            labelDx: anchor.labelDx,
            labelDy: anchor.labelDy
          };
        }
      }

      if (shape.type === "latexText") {
        const p = meta.toPx(shape.x, shape.y);
        const text = toCanvasMathText(shape.text || shape.label || "");
        if (stage9Hit(p.px, p.py, text, clickX, clickY)) {
          return { kind: "text", shapeIndex };
        }
      }
    }

    return null;
  }

  findClickedLabel = function findClickedLabelStage9(graph, meta, clickX, clickY) {
    return stage9FindLabelHit(graph, meta, clickX, clickY);
  };

  function stage9FindShapeHit(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});
    for (let shapeIndex = (normalized.shapes || []).length - 1; shapeIndex >= 0; shapeIndex -= 1) {
      const shape = normalized.shapes[shapeIndex];
      if (!shape || shape.visible === false) continue;
      if (isPointInsideShapeClick(shape, normalized, meta, clickX, clickY)) {
        return { id: `shape:${shape.id}`, kind: "shape", ref: shape, shapeIndex };
      }
      const points = getEdgePointsForShape(shape);
      for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
        const start = points[edgeIndex];
        const end = points[(edgeIndex + 1) % points.length];
        if (!start || !end) continue;
        const a = meta.toPx(start.x, start.y);
        const b = meta.toPx(end.x, end.y);
        if (distancePointToSegment(clickX, clickY, a.px, a.py, b.px, b.py) <= 12) {
          return { id: `shape:${shape.id}`, kind: "shape", ref: shape, shapeIndex };
        }
      }
    }
    return null;
  }

  findClickedDiagramObject = function findClickedDiagramObjectStage9(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});

    const labelHit = stage9FindLabelHit(normalized, meta, clickX, clickY);
    if (labelHit?.kind === "shapeSegmentLabel") {
      const shape = normalized.shapes?.[labelHit.shapeIndex];
      if (shape?.id) return { id: `edge:${shape.id}:${labelHit.key}`, kind: "shapeEdge", ref: { shape, key: labelHit.key } };
    }
    if (labelHit?.kind === "segmentLabel") {
      const segment = normalized.segments?.[labelHit.index];
      if (segment) return { id: getSegmentObjectId(segment), kind: "segment", ref: segment };
    }
    if (labelHit?.kind === "manual") {
      const point = normalized.points?.[labelHit.index];
      if (point) return { id: `point:${point.label}`, kind: "point", ref: point };
    }

    const pointHit = findClickedPoint(normalized, meta, clickX, clickY);
    if (pointHit?.source === "manual") return { id: `point:${pointHit.point.label}`, kind: "point", ref: pointHit.point };
    if (pointHit?.source && pointHit.source !== "manual" && pointHit.shape?.id) {
      return { id: `shape-point:${pointHit.shape.id}:${pointHit.index}`, kind: "shapePoint", ref: pointHit.point };
    }

    const segmentHit = findClickedSegment(normalized, meta, clickX, clickY);
    if (segmentHit?.segment?.shapePolygon || segmentHit?.segment?.polygon) {
      const shapeId = segmentHit.segment.shapeId || null;
      const key = segmentHit.segment.polygonSegmentKey;
      if (shapeId && key) return { id: `edge:${shapeId}:${key}`, kind: "shapeEdge", ref: segmentHit.segment };
    }
    if (segmentHit?.segment) return { id: getSegmentObjectId(segmentHit.segment), kind: "segment", ref: segmentHit.segment };

    const angleHit = findClickedAngle(normalized, meta, clickX, clickY);
    if (angleHit?.angle) return { id: getAngleObjectId(angleHit.angle), kind: "angle", ref: angleHit.angle };

    const shapeHit = stage9FindShapeHit(normalized, meta, clickX, clickY);
    if (shapeHit) return shapeHit;

    if (normalized.expression) return null;
    return null;
  };

  function stage9GetContext(event) {
    const canvas = event.target?.closest?.("[data-editor-graph]");
    if (!canvas) return null;
    const { card, question } = stage9CardAndQuestionFromCanvas(canvas);
    const meta = canvas.__graphMeta;
    if (!card || !question || !meta) return null;
    meta.canvasQuestionId = question.id;
    const pointer = getCanvasPointer(event, canvas);
    return { canvas, card, question, meta, pointer };
  }

  function stage9GraphPointFromPointer(meta, pointer, snap, graph) {
    let point = graphPointFromCanvasPoint(meta, pointer.x, pointer.y);
    if (snap) point = snapGraphPoint(point, { ...meta, graph: graph || meta.graph });
    return point;
  }

  function stage9ApplyLabelDrag(values, hit, dx, dy, currentPoint, startPoint) {
    if (!hit) return;
    if (hit.kind === "manual" && values.points?.[hit.index]) {
      values.points[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx);
      values.points[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy);
    }
    if (hit.kind === "segmentLabel" && values.segments?.[hit.index]) {
      values.segments[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx);
      values.segments[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? -10) + dy);
    }
    if (hit.kind === "angleLabel" && values.angles?.[hit.index]) {
      values.angles[hit.index].labelDx = roundGraphCoordinate((hit.labelDx ?? 0) + dx);
      values.angles[hit.index].labelDy = roundGraphCoordinate((hit.labelDy ?? 0) + dy);
    }
    if (hit.kind === "shapePoint") {
      const p = values.shapes?.[hit.shapeIndex]?.points?.[hit.pointIndex];
      if (p) {
        p.labelDx = roundGraphCoordinate((hit.labelDx ?? 8) + dx);
        p.labelDy = roundGraphCoordinate((hit.labelDy ?? -7) + dy);
      }
    }
    if (hit.kind === "regularVertex") {
      const shape = values.shapes?.[hit.shapeIndex];
      if (shape) {
        if (!Array.isArray(shape.vertexLabelOffsets)) shape.vertexLabelOffsets = [];
        shape.vertexLabelOffsets[hit.pointIndex] = {
          dx: roundGraphCoordinate((hit.labelDx ?? 8) + dx),
          dy: roundGraphCoordinate((hit.labelDy ?? -7) + dy)
        };
      }
    }
    if (hit.kind === "shapeSegmentLabel") {
      const shape = values.shapes?.[hit.shapeIndex];
      if (shape) {
        if (!shape.segmentLabelOffsets || typeof shape.segmentLabelOffsets !== "object") shape.segmentLabelOffsets = {};
        shape.segmentLabelOffsets[hit.key] = {
          dx: roundGraphCoordinate((hit.labelDx ?? 0) + dx),
          dy: roundGraphCoordinate((hit.labelDy ?? -10) + dy)
        };
      }
    }
    if (hit.kind === "text") {
      const shape = values.shapes?.[hit.shapeIndex];
      if (shape && currentPoint && startPoint) {
        shape.x = roundGraphCoordinate(Number(shape.x) + (currentPoint.x - startPoint.x));
        shape.y = roundGraphCoordinate(Number(shape.y) + (currentPoint.y - startPoint.y));
      }
    }
  }

  function stage9MovePoint(values, hit, currentPoint) {
    if (!hit || !currentPoint) return;
    if (hit.source === "manual" && values.points?.[hit.index]) {
      values.points[hit.index].x = roundGraphCoordinate(currentPoint.x);
      values.points[hit.index].y = roundGraphCoordinate(currentPoint.y);
      values.pointsText = pointsToText(values.points);
      return;
    }
    const shape = values.shapes?.[hit.shapeIndex];
    if (!shape) return;
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type) && shape.points?.[hit.index]) {
      if (shape.type === "trapezoid") {
        moveTrapezoidVertexKeepingBasesParallel(shape, hit.index, currentPoint);
        return;
      }
      shape.points[hit.index].x = roundGraphCoordinate(currentPoint.x);
      shape.points[hit.index].y = roundGraphCoordinate(currentPoint.y);
      return;
    }
    if (shape.type === "regularPolygon") {
      const center = { x: Number(shape.centerX), y: Number(shape.centerY) };
      shape.radius = Math.max(0.1, Math.hypot(currentPoint.x - center.x, currentPoint.y - center.y));
      shape.rotation = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x) * 180 / Math.PI - (Number(hit.index) * 360 / Math.max(3, Number(shape.sides) || 3));
      return;
    }
    applyShapeHandleMove(shape, { kind: "shape", shapeIndex: hit.shapeIndex, pointIndex: hit.index, point: hit.point }, currentPoint);
  }

  function stage9SaveAndDraw(card, question, values) {
    const next = normalizeGraph(values);
    graphDrafts.set(question.id, next);
    updatePointsField(card, next);
    drawGraphDraftOnCard(card, next);
    renderDiagramObjectList?.(card, next);
    renderAllPreviewsDebounced();
  }

  function stage9HandleMovePointerDown(event, ctx) {
    const { canvas, card, question, meta, pointer } = ctx;
    const values = normalizeGraph(getGraphValuesFromCard(card));
    const selectedId = diagramObjectSelectionByQuestionId.get(question.id);

    const transform = findShapeTransformHandle(values, meta, pointer.x, pointer.y, selectedId);
    if (transform) {
      stage9DragState = {
        kind: "transform",
        transform,
        card,
        canvas,
        questionId: question.id,
        startGraph: JSON.parse(JSON.stringify(values)),
        startPoint: graphPointFromCanvasPoint(meta, pointer.x, pointer.y),
        startClientX: event.clientX,
        startClientY: event.clientY,
        historySaved: false
      };
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    const pointHit = findClickedPoint(values, meta, pointer.x, pointer.y);
    if (pointHit) {
      const objectId = pointHit.source === "manual"
        ? `point:${pointHit.point.label}`
        : `shape:${pointHit.shape?.id || ""}`;
      if (objectId.startsWith("shape:")) {
        diagramObjectSelectionByQuestionId.set(question.id, objectId);
        diagramMultiObjectSelectionByQuestionId.set(question.id, [objectId]);
      }
      stage9DragState = {
        kind: "point",
        pointHit,
        card,
        canvas,
        questionId: question.id,
        startGraph: JSON.parse(JSON.stringify(values)),
        startPoint: graphPointFromCanvasPoint(meta, pointer.x, pointer.y),
        startClientX: event.clientX,
        startClientY: event.clientY,
        historySaved: false
      };
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    const labelHit = stage9FindLabelHit(values, meta, pointer.x, pointer.y);
    if (labelHit) {
      stage9DragState = {
        kind: "label",
        labelHit,
        card,
        canvas,
        questionId: question.id,
        startGraph: JSON.parse(JSON.stringify(values)),
        startPoint: graphPointFromCanvasPoint(meta, pointer.x, pointer.y),
        startClientX: event.clientX,
        startClientY: event.clientY,
        historySaved: false
      };
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    const shapeHit = stage9FindShapeHit(values, meta, pointer.x, pointer.y);
    if (shapeHit?.id) {
      diagramObjectSelectionByQuestionId.set(question.id, shapeHit.id);
      diagramMultiObjectSelectionByQuestionId.set(question.id, [shapeHit.id]);
      diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
      drawGraphDraftOnCard(card, values);
      updateDiagramToolHint(card, values);
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    diagramObjectSelectionByQuestionId.delete(question.id);
    diagramMultiObjectSelectionByQuestionId.delete(question.id);
    diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
    drawGraphDraftOnCard(card, values);
    updateDiagramToolHint(card, values);
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function stage9PointerDown(event) {
    if (event.button === 2) return;
    const ctx = stage9GetContext(event);
    if (!ctx) return;
    const tool = getActiveDiagramTool(ctx.question.id);
    if (tool === "move-point") {
      stage9HandleMovePointerDown(event, ctx);
    }
  }

  function stage9PointerMove(event) {
    if (!stage9DragState) return;
    const { card, canvas, questionId } = stage9DragState;
    const question = findQuestion(questionId);
    const meta = canvas.__graphMeta;
    if (!question || !meta) return;
    const pointer = getCanvasPointer(event, canvas);
    const currentValues = normalizeGraph(getGraphValuesFromCard(card));
    const startGraph = normalizeGraph(stage9DragState.startGraph);
    const snap = currentValues.snapToGrid;
    let currentPoint = stage9GraphPointFromPointer(meta, pointer, snap, currentValues);

    const dxClient = event.clientX - stage9DragState.startClientX;
    const dyClient = event.clientY - stage9DragState.startClientY;
    if (Math.hypot(dxClient, dyClient) < 2 && !stage9DragState.moved) return;
    stage9DragState.moved = true;
    stage9SuppressClick = true;

    const values = normalizeGraph(JSON.parse(JSON.stringify(startGraph)));
    if (!stage9DragState.historySaved) {
      pushDiagramHistory(questionId, startGraph);
      stage9DragState.historySaved = true;
    }

    if (stage9DragState.kind === "label") {
      stage9ApplyLabelDrag(values, stage9DragState.labelHit, dxClient, dyClient, currentPoint, stage9DragState.startPoint);
    }

    if (stage9DragState.kind === "point") {
      stage9MovePoint(values, stage9DragState.pointHit, currentPoint);
    }

    if (stage9DragState.kind === "transform") {
      const tr = stage9DragState.transform;
      const shape = values.shapes?.[tr.shapeIndex];
      if (shape) {
        if (tr.mode === "move-shape") {
          translateWholeShape(shape, currentPoint.x - stage9DragState.startPoint.x, currentPoint.y - stage9DragState.startPoint.y);
        }
        if (tr.mode === "rotate-shape") {
          const startAngle = Math.atan2(stage9DragState.startPoint.y - tr.centerGraph.y, stage9DragState.startPoint.x - tr.centerGraph.x);
          const currentAngle = Math.atan2(currentPoint.y - tr.centerGraph.y, currentPoint.x - tr.centerGraph.x);
          rotateWholeShape(shape, tr.centerGraph, currentAngle - startAngle);
        }
        if (tr.mode === "resize-shape") {
          const startDist = Math.hypot(stage9DragState.startPoint.x - tr.centerGraph.x, stage9DragState.startPoint.y - tr.centerGraph.y) || 1;
          const currentDist = Math.hypot(currentPoint.x - tr.centerGraph.x, currentPoint.y - tr.centerGraph.y) || startDist;
          scaleWholeShape(shape, tr.centerGraph, Math.max(0.05, currentDist / startDist));
        }
      }
    }

    stage9SaveAndDraw(card, question, values);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function stage9PointerUp(event) {
    if (!stage9DragState) return;
    stage9DragState.canvas?.releasePointerCapture?.(event.pointerId);
    stage9DragState = null;
    window.setTimeout(() => { stage9SuppressClick = false; }, 0);
  }

  function stage9GetOrCreatePointForSegment(card, question, graph, meta, canvasX, canvasY) {
    const hit = findClickedPoint(graph, meta, canvasX, canvasY);
    if (hit?.point?.label) return { graph, label: sanitizeGraphLabel(hit.point.label) };
    let p = graphPointFromCanvasPoint(meta, canvasX, canvasY);
    if (graph.snapToGrid) p = snapGraphPoint(p, { ...meta, graph });
    const point = {
      label: nextPointLabelForGraph(graph),
      x: roundGraphCoordinate(p.x),
      y: roundGraphCoordinate(p.y),
      labelDx: 8,
      labelDy: -7,
      color: "#145c63",
      size: 5,
      visible: true
    };
    graph.points.push(point);
    graph.pointsText = pointsToText(graph.points);
    updatePointsField(card, graph);
    return { graph: normalizeGraph(graph), label: point.label };
  }

  function stage9HandleSegmentClick(card, question, values, meta, canvasX, canvasY) {
    let graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
    const result = stage9GetOrCreatePointForSegment(card, question, graph, meta, canvasX, canvasY);
    graph = normalizeGraph(result.graph);
    const label = result.label;
    if (!label) return;

    const construction = diagramConstructionByQuestionId.get(question.id);
    if (!construction || construction.tool !== "segment" || !construction.startLabel) {
      diagramConstructionByQuestionId.set(question.id, { tool: "segment", startLabel: label });
      graphDrafts.set(question.id, graph);
      updatePointsField(card, graph);
      drawGraphDraftOnCard(card, graph);
      stage9SetMessage(card, `Segment: start ${label}. Click the endpoint.`);
      updateDiagramToolHint(card, graph);
      return;
    }

    const from = construction.startLabel;
    const to = label;
    if (from && to && from !== to && !graph.segments.some((segment) => segmentMatches(segment, from, to))) {
      pushDiagramHistory(question.id, graph);
      graph.segments.push({ from, to, labelMode: "name", visible: true, color: "#145c63", lineWidth: 2, lineDash: "solid", labelDx: 0, labelDy: -10 });
    }
    diagramConstructionByQuestionId.delete(question.id);
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    updatePointsField(card, next);
    drawGraphDraftOnCard(card, next);
    stage9SetMessage(card, from !== to ? `Segment ${from}${to} created.` : "Choose a different endpoint.", from === to);
    updateDiagramToolHint(card, next);
    renderAllPreviewsDebounced();
  }

  function stage9HandleIrregularClick(card, question, values, meta, canvasX, canvasY) {
    let construction = diagramConstructionByQuestionId.get(question.id);
    if (!construction || construction.tool !== "irregular-polygon" || !Number.isFinite(Number(construction.targetSides))) {
      stage9SetMessage(card, "Choose Irregular polygon and confirm its settings first.", true);
      return;
    }
    let p = graphPointFromCanvasPoint(meta, canvasX, canvasY);
    if (values.snapToGrid) p = snapGraphPoint(p, { ...meta, graph: values });
    construction.points = Array.isArray(construction.points) ? construction.points : [];
    construction.points.push({ x: roundGraphCoordinate(p.x), y: roundGraphCoordinate(p.y) });
    diagramConstructionByQuestionId.set(question.id, construction);

    if (construction.points.length >= Number(construction.targetSides)) {
      const graph = normalizeGraph(graphDrafts.get(question.id) || values || {});
      pushDiagramHistory(question.id, graph);
      const settings = construction.settings || {};
      const labels = reserveSequentialPointLabels(graph, construction.points.length);
      const shape = normalizeShape({
        id: nextShapeId(graph, "irregularPolygon"),
        type: "irregularPolygon",
        label: settings.label || "Irregular polygon",
        stroke: settings.stroke || "#145c63",
        fill: settings.fill || "#e8f7f9",
        lineDash: settings.lineDash || "solid",
        lineWidth: settings.lineWidth || 2,
        targetSides: Number(construction.targetSides),
        points: construction.points.map((point, index) => ({ ...point, label: labels[index], labelDx: 8, labelDy: -7 }))
      }, graph.shapes.length);
      graph.shapes.push(shape);
      diagramConstructionByQuestionId.delete(question.id);
      const next = normalizeGraph(graph);
      graphDrafts.set(question.id, next);
      stage9SetMessage(card, "Irregular polygon created. Use Move to adjust it.");
      setToolToMovePoint(card, question, next, `shape:${shape.id}`);
      drawGraphDraftOnCard(card, next);
      renderAllPreviewsDebounced();
      return;
    }

    stage9SetMessage(card, `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.`);
    updateDiagramToolHint(card, values);
    drawGraphDraftOnCard(card, values);
  }

  handleSegmentToolClick = stage9HandleSegmentClick;
  handleIrregularPolygonToolClick = stage9HandleIrregularClick;

  function stage9CanvasClick(event) {
    if (stage9SuppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const ctx = stage9GetContext(event);
    if (!ctx) return;
    const { canvas, card, question, meta, pointer } = ctx;
    if (!isInsidePlot(pointer.x, pointer.y, meta)) return;
    const tool = getActiveDiagramTool(question.id);
    const values = normalizeGraph(getGraphValuesFromCard(card));

    if (tool === "point") {
      diagramConstructionByQuestionId.delete(question.id);
      diagramSelectionByQuestionId.delete(question.id);
      event.preventDefault();
      event.stopImmediatePropagation();
      addManualPointAtCanvasPosition(card, question, values, meta, pointer.x, pointer.y);
      return;
    }

    if (tool === "segment") {
      event.preventDefault();
      event.stopImmediatePropagation();
      stage9HandleSegmentClick(card, question, values, meta, pointer.x, pointer.y);
      return;
    }

    if (tool === "irregular-polygon") {
      event.preventDefault();
      event.stopImmediatePropagation();
      stage9HandleIrregularClick(card, question, values, meta, pointer.x, pointer.y);
      return;
    }
  }

  function stage9ToolButtonClick(event) {
    const toolButton = event.target?.closest?.("[data-diagram-tool]");
    if (!toolButton) return;
    const card = toolButton.closest("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    if (!card || !question) return;
    const tool = toolButton.dataset.diagramTool;
    if (["point", "segment", "irregular-polygon"].includes(tool)) {
      setActiveDiagramTool(question.id, tool);
      updateDiagramToolButtons(card, tool);
      diagramObjectSelectionByQuestionId.delete(question.id);
      diagramMultiObjectSelectionByQuestionId.delete(question.id);
      diagramGroupedHandleSelectionByQuestionId?.delete?.(question.id);
      if (tool === "point") {
        diagramConstructionByQuestionId.delete(question.id);
        diagramSelectionByQuestionId.delete(question.id);
      }
      if (tool === "segment") {
        diagramConstructionByQuestionId.delete(question.id);
        diagramSelectionByQuestionId.delete(question.id);
      }
      if (tool === "irregular-polygon") {
        configureIrregularPolygonTool(question);
      }
      updateDiagramToolHint(card, getGraphValuesFromCard(card));
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  const previousHandlePolygonToolClick = handlePolygonToolClick;
  handlePolygonToolClick = function handlePolygonToolClickStage9(card, question, values, meta, canvasX, canvasY) {
    const graph = normalizeGraph(values || getGraphValuesFromCard(card));
    const range = stage9BaseRange(graph, meta);
    const construction = diagramConstructionByQuestionId.get(question.id);
    if (construction?.tool === "polygon" && construction.settings && !Number.isFinite(Number(construction.settings.radius))) {
      construction.settings.radius = Math.min(range.x, range.y) * 0.25;
    }
    const radiusField = card.querySelector('[data-graph-field="polygonRadius"]');
    if (radiusField && (!radiusField.value || Number(radiusField.value) === 4)) {
      radiusField.value = String(Math.min(range.x, range.y) * 0.25);
    }
    return previousHandlePolygonToolClick(card, question, values, meta, canvasX, canvasY);
  };

  const previousHandleTemplateShapeClick = handleTemplateShapeClick;
  handleTemplateShapeClick = function handleTemplateShapeClickStage9(card, question, values, meta, canvasX, canvasY, type) {
    let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
    if (values.snapToGrid) center = snapGraphPoint(center, { ...meta, graph: values });
    const graph = normalizeGraph(values);
    const range = stage9BaseRange(graph, meta);
    const halfW = range.x * 0.25;
    const halfH = range.y * 0.25;
    pushDiagramHistory(question.id, graph);
    const construction = diagramConstructionByQuestionId.get(question.id);
    const settings = construction?.tool === type ? construction.settings || {} : {};
    const rawPoints = type === "trapezoid"
      ? [
          { x: center.x - halfW * 0.7, y: center.y + halfH },
          { x: center.x + halfW * 0.7, y: center.y + halfH },
          { x: center.x + halfW, y: center.y - halfH },
          { x: center.x - halfW, y: center.y - halfH }
        ]
      : [
          { x: center.x - halfW * 0.8, y: center.y + halfH },
          { x: center.x + halfW, y: center.y + halfH },
          { x: center.x + halfW * 0.8, y: center.y - halfH },
          { x: center.x - halfW, y: center.y - halfH }
        ];
    const labels = nextPointLabelsForGraph(graph, rawPoints.length);
    const points = rawPoints.map((point, index) => shapePointWithLabel(graph, point, labels[index]));
    const shape = normalizeShape({
      id: nextShapeId(graph, type),
      type,
      label: settings.label || (type === "trapezoid" ? "Trapezoid" : "Parallelogram"),
      points,
      stroke: settings.stroke || "#145c63",
      fill: settings.fill || "#e8f7f9",
      lineDash: settings.lineDash || "solid",
      lineWidth: settings.lineWidth || 2
    }, graph.shapes.length);
    graph.shapes.push(shape);
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    renderAllPreviewsDebounced();
    setToolToMovePoint(card, question, next, `shape:${shape.id}`);
  };

  toCanvasMathText = function toCanvasMathTextStage9(text) {
    let value = String(text || "").trim().replace(/^\$+|\$+$/g, "");
    const supers = { "0":"⁰", "1":"¹", "2":"²", "3":"³", "4":"⁴", "5":"⁵", "6":"⁶", "7":"⁷", "8":"⁸", "9":"⁹", "+":"⁺", "-":"⁻", "=":"⁼", "(":"⁽", ")":"⁾", "n":"ⁿ", "i":"ⁱ", "x":"ˣ", "y":"ʸ" };
    const subs = { "0":"₀", "1":"₁", "2":"₂", "3":"₃", "4":"₄", "5":"₅", "6":"₆", "7":"₇", "8":"₈", "9":"₉", "+":"₊", "-":"₋", "=":"₌", "(":"₍", ")":"₎" };
    const convertRun = (run, map) => String(run).split("").map((ch) => map[ch] || ch).join("");
    value = value
      .replace(/\\+frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\+sqrt\s*\{([^{}]+)\}/g, "√($1)")
      .replace(/\\+sqrt\s*([A-Za-z0-9]+)/g, "√$1")
      .replace(/\\+cdot/g, "·")
      .replace(/\\+times/g, "×")
      .replace(/\\+div/g, "÷")
      .replace(/\\+pi/g, "π")
      .replace(/\\+theta/g, "θ")
      .replace(/\\+alpha/g, "α")
      .replace(/\\+beta/g, "β")
      .replace(/\\+gamma/g, "γ")
      .replace(/\\+Delta/g, "Δ")
      .replace(/\\+Omega/g, "Ω")
      .replace(/\\+mu/g, "μ")
      .replace(/\\+sin/g, "sin")
      .replace(/\\+cos/g, "cos")
      .replace(/\\+tan/g, "tan")
      .replace(/\\+ln/g, "ln")
      .replace(/\\+log/g, "log")
      .replace(/\^\{([^{}]+)\}/g, (_, run) => convertRun(run, supers))
      .replace(/_\{([^{}]+)\}/g, (_, run) => convertRun(run, subs))
      .replace(/\^([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, supers))
      .replace(/_([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, subs))
      .replace(/\\+([A-Za-z]+)/g, "$1");
    return value;
  };

  updateDiagramToolHint = function updateDiagramToolHintStage9(card, graph) {
    const hint = card.querySelector("[data-diagram-tool-hint]");
    if (!hint) return;
    const questionId = card.dataset.questionId;
    const tool = getActiveDiagramTool(questionId);
    const selection = diagramSelectionByQuestionId.get(questionId) || [];
    const construction = diagramConstructionByQuestionId.get(questionId);
    const messages = {
      point: "Point: click the diagram to insert independent points. This tool stays active.",
      segment: construction?.tool === "segment" && construction.startLabel ? `Segment: start ${construction.startLabel}. Click the endpoint.` : "Segment: click start and endpoint. Empty-space clicks create endpoint points automatically.",
      polygon: "Regular polygon: configure it, then click the diagram to place its center.",
      "irregular-polygon": construction?.tool === "irregular-polygon" ? `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.` : "Irregular polygon: choose the side count, then click each vertex.",
      circle: construction?.tool === "circle" && construction.center ? "Circle: center selected. Click the circumference." : "Circle: click center, then circumference.",
      ellipse: construction?.tool === "ellipse" ? `Ellipse: ${construction.points.length}/3 construction points selected.` : "Ellipse: click focus 1, focus 2, then a point on the ellipse.",
      trapezoid: "Trapezoid: configure it, then click to insert an editable template.",
      parallelogram: "Parallelogram: configure it, then click to insert an editable template.",
      angle: selection.length ? `Angle: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle: Stick is enabled. Click three existing points: from, vertex, to.",
      function: "Function: configure the expression and style in the dialog.",
      "latex-text": construction?.tool === "latex-text" ? "LaTeX text: click the diagram to place the text." : "LaTeX text: enter a short formula/string, then click the diagram.",
      select: "Selection: click objects to select them; Ctrl+click selects multiple; Delete removes selection; double-click opens properties.",
      "move-point": "Move: click a figure to activate transform handles; drag vertices, labels, text, or handles. Click empty space to deactivate.",
      erase: "Eraser: click an object to remove it. Clear canvas is in Edit."
    };
    hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
  };

  window.addEventListener("pointerdown", stage9PointerDown, true);
  window.addEventListener("pointermove", stage9PointerMove, true);
  window.addEventListener("pointerup", stage9PointerUp, true);
  window.addEventListener("pointercancel", stage9PointerUp, true);
  window.addEventListener("click", stage9ToolButtonClick, true);
  window.addEventListener("click", stage9CanvasClick, true);
})();


/* ===== Stage 10: canvas status placement, stable irregular polygons, full object selection, and property polish ===== */
(function stage10Patch() {
  function stage10CardAndQuestionFromCanvas(canvas) {
    const card = canvas?.closest?.("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    return { card, question };
  }

  function stage10SetMessage(card, text, isError = false) {
    const message = card?.querySelector?.("[data-graph-message]");
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("error", Boolean(isError));
  }

  function stage10PointInPolygonPx(points, clickX, clickY) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].px, yi = points[i].py;
      const xj = points[j].px, yj = points[j].py;
      const intersects = ((yi > clickY) !== (yj > clickY)) &&
        (clickX < ((xj - xi) * (clickY - yi)) / ((yj - yi) || 1e-9) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function stage10ShapePixels(shape, meta) {
    if (!shape) return [];
    if (shape.type === "regularPolygon") return getRegularPolygonPoints(shape).map((p) => meta.toPx(p.x, p.y));
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) return (shape.points || []).map((p) => meta.toPx(p.x, p.y));
    return [];
  }

  isPointInsideShapeClick = function isPointInsideShapeClickStage10(shape, graph, meta, clickX, clickY) {
    if (!shape || shape.visible === false || !meta) return false;

    if (["regularPolygon", "irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
      const pts = stage10ShapePixels(shape, meta);
      if (pts.length >= 3 && stage10PointInPolygonPx(pts, clickX, clickY)) return true;
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (distancePointToSegment(clickX, clickY, a.px, a.py, b.px, b.py) <= 14) return true;
      }
      return false;
    }

    if (shape.type === "circle") {
      const c = meta.toPx(shape.center?.x ?? 0, shape.center?.y ?? 0);
      const edge = meta.toPx((shape.center?.x ?? 0) + (Number(shape.radius) || 1), shape.center?.y ?? 0);
      const r = Math.abs(edge.px - c.px);
      const d = Math.hypot(clickX - c.px, clickY - c.py);
      return d <= r + 10;
    }

    if (shape.type === "ellipse") {
      const params = getEllipseParams(shape);
      if (!params) return false;
      const c = meta.toPx(params.cx, params.cy);
      const rx = Math.abs(meta.toPx(params.cx + params.a, params.cy).px - c.px) || 1;
      const ry = Math.abs(meta.toPx(params.cx, params.cy + params.b).py - c.py) || 1;
      const dx = clickX - c.px;
      const dy = clickY - c.py;
      const cos = Math.cos(-(params.rotation || 0));
      const sin = Math.sin(-(params.rotation || 0));
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      return ((localX * localX) / (rx * rx) + (localY * localY) / (ry * ry)) <= 1.18;
    }

    if (shape.type === "latexText") {
      const p = meta.toPx(shape.x, shape.y);
      const text = toCanvasMathText(shape.text || shape.label || "");
      const fontSize = Math.max(8, Number(shape.fontSize) || 18);
      const width = Math.max(30, text.length * fontSize * 0.58);
      const height = Math.max(16, fontSize * 1.2);
      return Math.abs(clickX - p.px) <= width / 2 && Math.abs(clickY - p.py) <= height / 2;
    }

    return false;
  };

  const stage10PreviousFindClickedPoint = findClickedPoint;
  findClickedPoint = function findClickedPointStage10(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});
    const labelHit = typeof findClickedLabel === "function" ? findClickedLabel(normalized, meta, clickX, clickY) : null;
    if (labelHit) {
      let pointCenter = null;
      if (labelHit.kind === "manual") {
        const point = normalized.points?.[labelHit.index];
        if (point) pointCenter = meta.toPx(point.x, point.y);
      }
      if (["shapePoint", "regularVertex"].includes(labelHit.kind)) {
        const points = getEdgePointsForShape(normalized.shapes?.[labelHit.shapeIndex]);
        const point = points?.[labelHit.pointIndex];
        if (point) pointCenter = meta.toPx(point.x, point.y);
      }
      if (!pointCenter || Math.hypot(clickX - pointCenter.px, clickY - pointCenter.py) > 7) return null;
    }
    return stage10PreviousFindClickedPoint(normalized, meta, clickX, clickY);
  };

  function stage10BaseRange(graph, meta) {
    const xRange = Math.max(1, Math.abs(Number(meta?.xMax ?? graph.xMax ?? 10) - Number(meta?.xMin ?? graph.xMin ?? -10)));
    const yRange = Math.max(1, Math.abs(Number(meta?.yMax ?? graph.yMax ?? 10) - Number(meta?.yMin ?? graph.yMin ?? -10)));
    return { x: xRange, y: yRange };
  }

  function stage10TemplatePoints(tool, center, graph, meta) {
    const range = stage10BaseRange(graph, meta);
    const halfW = range.x * 0.25;
    const halfH = range.y * 0.25;
    if (tool === "trapezoid") {
      return [
        { x: center.x - halfW * 0.65, y: center.y + halfH },
        { x: center.x + halfW * 0.65, y: center.y + halfH },
        { x: center.x + halfW, y: center.y - halfH },
        { x: center.x - halfW, y: center.y - halfH }
      ];
    }
    return [
      { x: center.x - halfW * 0.8, y: center.y + halfH },
      { x: center.x + halfW, y: center.y + halfH },
      { x: center.x + halfW * 0.8, y: center.y - halfH },
      { x: center.x - halfW, y: center.y - halfH }
    ];
  }

  const stage10PreviousDrawInteractionPreview = drawInteractionPreview;
  drawInteractionPreview = function drawInteractionPreviewStage10(ctx, meta, canvas) {
    const preview = canvas.__interactionPreview;
    const tool = preview?.tool;
    const card = canvas.closest?.("[data-question-card]");
    const question = card ? findQuestion(card.dataset.questionId) : null;
    const graph = meta.graph || (card ? getGraphValuesFromCard(card) : null);

    if (preview?.visible && preview.point && ["trapezoid", "parallelogram"].includes(tool)) {
      ctx.save();
      ctx.strokeStyle = "rgba(20, 92, 99, 0.70)";
      ctx.fillStyle = "rgba(20, 92, 99, 0.12)";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ghostClosedShape(ctx, meta, stage10TemplatePoints(tool, preview.point, graph || {}, meta));
      const p = meta.toPx(preview.point.x, preview.point.y);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.px, p.py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    return stage10PreviousDrawInteractionPreview(ctx, meta, canvas);
  };

  const stage10PreviousHandleTemplateShapeClick = handleTemplateShapeClick;
  handleTemplateShapeClick = function handleTemplateShapeClickStage10(card, question, values, meta, canvasX, canvasY, type) {
    if (!["trapezoid", "parallelogram"].includes(type)) {
      return stage10PreviousHandleTemplateShapeClick(card, question, values, meta, canvasX, canvasY, type);
    }
    let center = graphPointFromCanvasPoint(meta, canvasX, canvasY);
    if (values.snapToGrid) center = snapGraphPoint(center, { ...meta, graph: values });
    const graph = normalizeGraph(values || getGraphValuesFromCard(card));
    pushDiagramHistory(question.id, graph);
    const construction = diagramConstructionByQuestionId.get(question.id);
    const settings = construction?.tool === type ? construction.settings || {} : {};
    const rawPoints = stage10TemplatePoints(type, center, graph, meta);
    const labels = nextPointLabelsForGraph(graph, rawPoints.length);
    const points = rawPoints.map((point, index) => shapePointWithLabel(graph, point, labels[index]));
    const shape = normalizeShape({
      id: nextShapeId(graph, type),
      type,
      points,
      label: settings.label || (type === "trapezoid" ? "Trapezoid" : "Parallelogram"),
      stroke: settings.stroke || "#145c63",
      fill: settings.fill || "#e8f7f9",
      lineDash: settings.lineDash || "solid",
      lineWidth: settings.lineWidth || 2
    }, graph.shapes.length);
    graph.shapes.push(shape);
    const next = normalizeGraph(graph);
    graphDrafts.set(question.id, next);
    renderAllPreviewsDebounced();
    setToolToMovePoint(card, question, next, `shape:${shape.id}`);
  };

  configureIrregularPolygonTool = function configureIrregularPolygonToolStage10(question) {
    openDiagramDialog({
      title: "Irregular polygon settings",
      description: "Choose the number of vertices, then click each vertex on the diagram.",
      fields: [
        { name: "sides", label: "Number of sides", type: "number", min: 3, max: 24, step: 1, value: 3 },
        { name: "label", label: "Object label", type: "text", value: "Irregular polygon", full: true },
        { name: "stroke", label: "Line color", type: "color", value: "#145c63" },
        { name: "fill", label: "Fill color", type: "color", value: "#e8f7f9" },
        { name: "lineDash", label: "Outline type", type: "select", value: "solid", options: [
          { value: "solid", label: "Continuous" },
          { value: "dashed", label: "Dashed" },
          { value: "dotted", label: "Dotted" }
        ] },
        { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: 2 }
      ],
      onSubmit: (data) => {
        const targetSides = Math.max(3, Math.floor(parseNumberOrDefault(data.sides, 3)));
        diagramConstructionByQuestionId.set(question.id, {
          tool: "irregular-polygon",
          targetSides,
          points: [],
          settings: {
            label: String(data.label || "Irregular polygon"),
            stroke: isHexColor(data.stroke) ? data.stroke : "#145c63",
            fill: isHexColor(data.fill) ? data.fill : "#e8f7f9",
            lineDash: ["solid", "dashed", "dotted"].includes(data.lineDash) ? data.lineDash : "solid",
            lineWidth: parseNumberOrDefault(data.lineWidth, 2)
          }
        });
        const card = getQuestionCardById(question.id);
        if (card) {
          setActiveDiagramTool(question.id, "irregular-polygon");
          updateDiagramToolButtons(card, "irregular-polygon");
          stage10SetMessage(card, `Irregular polygon: 0/${targetSides} vertices selected.`);
          updateDiagramToolHint(card, getGraphValuesFromCard(card));
        }
      }
    });
  };

  handleIrregularPolygonToolClick = function handleIrregularPolygonToolClickStage10(card, question, values, meta, canvasX, canvasY) {
    const construction = diagramConstructionByQuestionId.get(question.id);
    if (!construction || construction.tool !== "irregular-polygon" || !Number.isFinite(Number(construction.targetSides))) {
      stage10SetMessage(card, "Choose Irregular polygon and confirm its settings first.", true);
      return;
    }
    const graph = normalizeGraph(graphDrafts.get(question.id) || values || getGraphValuesFromCard(card));
    let p = graphPointFromCanvasPoint(meta, canvasX, canvasY);
    if (graph.snapToGrid) p = snapGraphPoint(p, { ...meta, graph });
    construction.points = Array.isArray(construction.points) ? construction.points : [];
    construction.points.push({ x: roundGraphCoordinate(p.x), y: roundGraphCoordinate(p.y) });
    diagramConstructionByQuestionId.set(question.id, construction);

    if (construction.points.length >= Number(construction.targetSides)) {
      pushDiagramHistory(question.id, graph);
      const settings = construction.settings || {};
      const labels = reserveSequentialPointLabels(graph, construction.points.length);
      const shape = normalizeShape({
        id: nextShapeId(graph, "irregularPolygon"),
        type: "irregularPolygon",
        label: settings.label || "Irregular polygon",
        stroke: settings.stroke || "#145c63",
        fill: settings.fill || "#e8f7f9",
        lineDash: settings.lineDash || "solid",
        lineWidth: settings.lineWidth || 2,
        targetSides: Number(construction.targetSides),
        points: construction.points.map((point, index) => ({ ...point, label: labels[index], labelDx: 8, labelDy: -7 }))
      }, graph.shapes.length);
      graph.shapes.push(shape);
      diagramConstructionByQuestionId.delete(question.id);
      const next = normalizeGraph(graph);
      graphDrafts.set(question.id, next);
      stage10SetMessage(card, "Irregular polygon created. Use Move to adjust it.");
      setToolToMovePoint(card, question, next, `shape:${shape.id}`);
      drawGraphDraftOnCard(card, next);
      renderAllPreviewsDebounced();
      return;
    }

    canvas = card.querySelector("[data-editor-graph]");
    if (canvas) canvas.__interactionPreview = { tool: "irregular-polygon", point: p, visible: true, snap: graph.snapToGrid };
    stage10SetMessage(card, `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.`);
    updateDiagramToolHint(card, graph);
    drawGraphDraftOnCard(card, graph);
  };

  function stage10FindShapeObject(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});
    for (let index = (normalized.shapes || []).length - 1; index >= 0; index -= 1) {
      const shape = normalized.shapes[index];
      if (shape?.visible === false) continue;
      if (isPointInsideShapeClick(shape, normalized, meta, clickX, clickY)) return { id: `shape:${shape.id}`, kind: "shape", ref: shape, shapeIndex: index };
    }
    return null;
  }

  const stage10PreviousFindClickedDiagramObject = findClickedDiagramObject;
  findClickedDiagramObject = function findClickedDiagramObjectStage10(graph, meta, clickX, clickY) {
    const normalized = normalizeGraph(graph || {});
    const edgeHit = findClickedSegment(normalized, meta, clickX, clickY);
    if (edgeHit?.segment?.shapePolygon) return { id: `edge:${edgeHit.segment.shapeId}:${edgeHit.segment.polygonSegmentKey}`, kind: "shapeEdge", ref: edgeHit.segment };
    const previous = stage10PreviousFindClickedDiagramObject ? stage10PreviousFindClickedDiagramObject(normalized, meta, clickX, clickY) : null;
    if (previous) return previous;
    return stage10FindShapeObject(normalized, meta, clickX, clickY);
  };

  const stage10PreviousEditDiagramObject = editDiagramObjectPropertiesAsync;
  editDiagramObjectPropertiesAsync = function editDiagramObjectPropertiesAsyncStage10(card, question, graph, objectId) {
    const normalized = normalizeGraph(graph || getGraphValuesFromCard(card));

    if (objectId?.startsWith?.("shape:")) {
      const shapeId = objectId.split(":")[1];
      const shape = normalized.shapes.find((item) => item.id === shapeId);
      if (!shape) return;
      const isText = shape.type === "latexText";
      return openDiagramDialog({
        title: isText ? "LaTeX text properties" : "Object properties",
        description: isText ? "Edit this text/formula and its visual style." : "Adjust the whole object. These settings overwrite individual edge styles.",
        fields: [
          ...(isText ? [
            { name: "text", label: "Text / LaTeX", type: "text", value: shape.text || "", placeholder: "Example: x^2 + y^2 = r^2", full: true },
            { name: "fill", label: "Text color", type: "color", value: shape.fill || "#145c63" },
            { name: "fontSize", label: "Text size", type: "number", min: 8, max: 96, step: 1, value: shape.fontSize || 18 }
          ] : [
            { name: "label", label: "Object label", type: "text", value: shape.label || "", full: true },
            { name: "stroke", label: "Line color", type: "color", value: shape.stroke || "#145c63" },
            { name: "fill", label: "Fill color", type: "color", value: shape.fill || "#e8f7f9" },
            { name: "lineDash", label: "Outline type", type: "select", value: shape.lineDash || "solid", options: [
              { value: "solid", label: "Continuous" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }
            ] },
            { name: "lineWidth", label: "Line thickness", type: "number", min: 1, max: 12, step: 0.5, value: shape.lineWidth || 2 }
          ]),
          { name: "visible", label: "Visible", type: "checkbox", value: shape.visible !== false, full: true }
        ]
      }).then((result) => {
        if (!result) return;
        pushDiagramHistory(question.id, normalized);
        shape.visible = Boolean(result.visible);
        if (isText) {
          shape.text = String(result.text || "");
          shape.label = shape.text;
          shape.fill = isHexColor(result.fill) ? result.fill : (shape.fill || "#145c63");
          shape.fontSize = Math.max(8, parseNumberOrDefault(result.fontSize, shape.fontSize || 18));
        } else {
          shape.label = String(result.label || shape.label || "");
          shape.stroke = isHexColor(result.stroke) ? result.stroke : (shape.stroke || "#145c63");
          shape.fill = isHexColor(result.fill) ? result.fill : (shape.fill || "#e8f7f9");
          shape.lineDash = ["solid", "dashed", "dotted"].includes(result.lineDash) ? result.lineDash : (shape.lineDash || "solid");
          shape.lineWidth = parseNumberOrDefault(result.lineWidth, shape.lineWidth || 2);
          shape.segmentStyles = {};
        }
        const next = normalizeGraph(normalized);
        graphDrafts.set(question.id, next);
        drawGraphDraftOnCard(card, next);
        renderDiagramObjectList?.(card, next);
        renderAllPreviewsDebounced();
      });
    }

    return stage10PreviousEditDiagramObject ? stage10PreviousEditDiagramObject(card, question, normalized, objectId) : undefined;
  };

  const stage10PreviousDrawShapes = drawShapes;
  drawShapes = function drawShapesStage10(ctx, graph, meta) {
    const normalized = normalizeGraph(graph || {});
    const shapes = Array.isArray(normalized.shapes) ? normalized.shapes.filter((shape) => shape.visible !== false) : [];
    shapes.forEach((shape) => {
      if (shape.type === "regularPolygon") {
        const points = getRegularPolygonPoints(shape);
        drawPolygon(ctx, points, meta, shape);
        drawRegularPolygonShapeSegments(ctx, shape, points, meta);
        if (shape.showApothem) drawApothem(ctx, points, meta);
        return;
      }
      if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) {
        drawClosedPointShape(ctx, shape, meta);
        const labeledPoints = (shape.points || []).map((point, index) => ({
          ...point,
          label: point.label || `P${index}`,
          color: shape.stroke || "#145c63",
          size: 4,
          visible: shape.visible !== false
        }));
        drawPoints(ctx, labeledPoints, meta);
        return;
      }
      if (shape.type === "circle") { drawCircleShape(ctx, shape, meta); return; }
      if (shape.type === "ellipse") { drawEllipseShape(ctx, shape, meta); return; }
      if (shape.type === "latexText") { drawTextShape(ctx, shape, meta); return; }
    });
  };

  toCanvasMathText = function toCanvasMathTextStage10(text) {
    let value = String(text || "").trim().replace(/^\$+|\$+$/g, "");
    const supers = { "0":"⁰", "1":"¹", "2":"²", "3":"³", "4":"⁴", "5":"⁵", "6":"⁶", "7":"⁷", "8":"⁸", "9":"⁹", "+":"⁺", "-":"⁻", "=":"⁼", "(":"⁽", ")":"⁾", "n":"ⁿ", "i":"ⁱ", "x":"ˣ", "y":"ʸ" };
    const subs = { "0":"₀", "1":"₁", "2":"₂", "3":"₃", "4":"₄", "5":"₅", "6":"₆", "7":"₇", "8":"₈", "9":"₉", "+":"₊", "-":"₋", "=":"₌", "(":"₍", ")":"₎" };
    const convertRun = (run, map) => String(run).split("").map((ch) => map[ch] || ch).join("");
    value = value
      .replace(/\\+left|\\+right/g, "")
      .replace(/\\+frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\+sqrt\s*\{([^{}]+)\}/g, "√($1)")
      .replace(/\\+sqrt\s*([A-Za-z0-9]+)/g, "√$1")
      .replace(/\\+cdot/g, "·")
      .replace(/\\+times/g, "×")
      .replace(/\\+div/g, "÷")
      .replace(/\\+pm/g, "±")
      .replace(/\\+leq/g, "≤")
      .replace(/\\+geq/g, "≥")
      .replace(/\\+neq/g, "≠")
      .replace(/\\+pi/g, "π")
      .replace(/\\+theta/g, "θ")
      .replace(/\\+alpha/g, "α")
      .replace(/\\+beta/g, "β")
      .replace(/\\+gamma/g, "γ")
      .replace(/\\+delta/g, "δ")
      .replace(/\\+Delta/g, "Δ")
      .replace(/\\+Omega/g, "Ω")
      .replace(/\\+mu/g, "μ")
      .replace(/\\+sin/g, "sin")
      .replace(/\\+cos/g, "cos")
      .replace(/\\+tan/g, "tan")
      .replace(/\\+ln/g, "ln")
      .replace(/\\+log/g, "log")
      .replace(/\^\{([^{}]+)\}/g, (_, run) => convertRun(run, supers))
      .replace(/_\{([^{}]+)\}/g, (_, run) => convertRun(run, subs))
      .replace(/\^([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, supers))
      .replace(/_([A-Za-z0-9+\-=()])/g, (_, run) => convertRun(run, subs))
      .replace(/\\+([A-Za-z]+)/g, "$1");
    return value;
  };

  drawTextShape = function drawTextShapeStage10(ctx, shape, meta) {
    if (!shape.text) return;
    const p = meta.toPx(shape.x, shape.y);
    const text = toCanvasMathText(shape.text);
    ctx.save();
    ctx.fillStyle = shape.fill || shape.stroke || "#145c63";
    ctx.font = `700 ${Math.max(8, Number(shape.fontSize) || 18)}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithHalo(ctx, text, p.px, p.py);
    ctx.restore();
  };

  configureLatexTextTool = function configureLatexTextToolStage10(question) {
    openDiagramDialog({
      title: "LaTeX text settings",
      description: "Add a short formula or label to the diagram.",
      fields: [
        { name: "text", label: "Text / LaTeX", type: "text", value: "", placeholder: "Example: x^2 + y^2 = r^2", full: true },
        { name: "fill", label: "Text color", type: "color", value: "#145c63" },
        { name: "fontSize", label: "Font size", type: "number", min: 8, max: 72, step: 1, value: 18 }
      ],
      onSubmit: (data) => {
        const text = String(data.text || "").trim();
        if (!text) return;
        diagramConstructionByQuestionId.set(question.id, {
          tool: "latex-text",
          settings: {
            text,
            fill: isHexColor(data.fill) ? data.fill : "#145c63",
            fontSize: Number.isFinite(Number(data.fontSize)) ? Number(data.fontSize) : 18
          }
        });
        const card = getQuestionCardById(question.id);
        if (card) {
          setActiveDiagramTool(question.id, "latex-text");
          updateDiagramToolButtons(card, "latex-text");
          updateDiagramToolHint(card, getGraphValuesFromCard(card));
        }
      }
    });
  };

  updateDiagramToolHint = function updateDiagramToolHintStage10(card, graph) {
    const hint = card.querySelector("[data-diagram-tool-hint]");
    if (!hint) return;
    const questionId = card.dataset.questionId;
    const tool = getActiveDiagramTool(questionId);
    const selection = diagramSelectionByQuestionId.get(questionId) || [];
    const construction = diagramConstructionByQuestionId.get(questionId);
    const messages = {
      point: "Point: click the diagram to insert independent points.",
      segment: construction?.tool === "segment" && construction.startLabel ? `Segment: start ${construction.startLabel}. Click the endpoint.` : "Segment: click start and endpoint. Empty-space clicks create endpoint points automatically.",
      polygon: "Regular polygon: configure it, then click the diagram to place its center.",
      "irregular-polygon": construction?.tool === "irregular-polygon" ? `Irregular polygon: ${construction.points.length}/${construction.targetSides} vertices selected.` : "Irregular polygon: choose the number of sides, then click each vertex.",
      circle: construction?.tool === "circle" && construction.center ? "Circle: center selected. Click the circumference." : "Circle: click center, then circumference.",
      ellipse: construction?.tool === "ellipse" ? `Ellipse: ${construction.points.length}/3 construction points selected.` : "Ellipse: click focus 1, focus 2, then a point on the ellipse.",
      trapezoid: "Trapezoid: configure it, then click to insert an editable template.",
      parallelogram: "Parallelogram: configure it, then click to insert an editable template.",
      angle: selection.length ? `Angle: selected ${selection.join(" → ")}. Use three points: from, vertex, to.` : "Angle: Stick is enabled. Click three existing points: from, vertex, to.",
      function: "Function: configure the expression and style in the dialog.",
      "latex-text": construction?.tool === "latex-text" ? "LaTeX text: click the diagram to place the text." : "LaTeX text: enter a short formula/string, then click the diagram.",
      select: "Selection: click objects; Ctrl+click selects multiple; Delete removes; double-click opens properties.",
      "move-point": "Move: click a figure to activate handles; drag vertices, labels, text, or handles. Click empty space to deactivate.",
      erase: "Eraser: click an object to remove it. Clear canvas is in Edit."
    };
    hint.textContent = messages[tool] || "Choose a tool and interact with the diagram.";
  };
})();
