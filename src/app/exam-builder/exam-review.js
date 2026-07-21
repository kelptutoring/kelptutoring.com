(function examReviewPage(root) {
  "use strict";

  const EXAM_CONTRACT = root.KelpExamContract;
  const EXAM_ADAPTER_DOMAIN = root.KelpExamAdapters;
  if (!EXAM_CONTRACT || !EXAM_ADAPTER_DOMAIN) {
    throw new Error("The exam review page requires the exam contract and adapter domain.");
  }

  const HTTP_PAGE = /^https?:$/.test(root.location.protocol);
  const REVIEW_FILTERS = new Set(["pending_review", "approved", "changes_requested", "rejected"]);
  const localAdapters = EXAM_ADAPTER_DOMAIN.createLocalAdapters();
  const state = {
    adapters: null,
    auth: null,
    filter: "pending_review",
    records: [],
    selectedId: null,
    busy: false,
    curriculumPathById: new Map()
  };

  const elements = {
    provider: document.getElementById("reviewProvider"),
    refresh: document.getElementById("refreshReviewsBtn"),
    message: document.getElementById("reviewMessage"),
    filters: [...document.querySelectorAll("[data-review-filter]")],
    count: document.getElementById("reviewQueueCount"),
    queue: document.getElementById("reviewQueue"),
    detail: document.getElementById("reviewDetail")
  };

  const TYPE_LABELS = Object.freeze({
    "multiple-choice": "Multiple choice (text)",
    "multiple-choice-text": "Multiple choice (text)",
    "multiple-choice-image": "Multiple choice (image)",
    "multiple-choice-graph": "Multiple choice (diagram)",
    "multiple-answer": "Multiple answers (text)",
    "multiple-answer-text": "Multiple answers (text)",
    "multiple-answer-image": "Multiple answers (image)",
    "multiple-answer-graph": "Multiple answers (diagram)",
    "true-false": "True / false",
    numeric: "Numeric answer",
    "short-answer": "Short answer",
    essay: "Essay / explanation"
  });

  const DIFFICULTY_LABELS = Object.freeze({
    unclassified: "Unclassified",
    "very-easy": "Very easy",
    easy: "Easy",
    difficult: "Difficult",
    "very-difficult": "Very difficult",
    challenge: "Challenge"
  });

  const STATUS_LABELS = Object.freeze({
    pending_review: "Awaiting review",
    approved: "Approved",
    changes_requested: "Changes requested",
    rejected: "Rejected"
  });

  init();

  async function init() {
    bindEvents();
    try {
      state.auth = await requireReviewerAccess();
      if (HTTP_PAGE && !state.auth) return;
      await Promise.resolve(root.KelpExamProviderReady);
      state.adapters = await EXAM_ADAPTER_DOMAIN.resolveAdapters({
        localAdapters,
        context: {
          surface: "exam-review",
          readOnlyContent: true,
          definitionSchema: EXAM_CONTRACT.DEFINITION_SCHEMA,
          persistenceSchema: EXAM_CONTRACT.PERSISTENCE_BUNDLE_SCHEMA
        }
      });
      if (HTTP_PAGE && state.adapters.meta?.provider !== "supabase") {
        throw new Error("The trusted review provider is unavailable. Review decisions were not enabled.");
      }
      elements.provider.textContent = state.adapters.meta?.provider === "supabase"
        ? "Shared review library"
        : "Local review sandbox";
      await loadCurriculumPaths();
      await refreshQueue({ preserveSelection: false });
    } catch (error) {
      renderFatalError(error);
    }
  }

  async function requireReviewerAccess() {
    if (!HTTP_PAGE) return { local: true, role: "local-reviewer" };
    const { getHomePathByRole, requireCapability } = await import("../../auth/auth-guard.js");
    const current = await requireCapability(["exam.review"]);
    if (current) {
      const homePath = getHomePathByRole(current.primaryRole);
      document.querySelectorAll("[data-workspace-home]").forEach((link) => {
        link.href = homePath;
      });
    }
    return current;
  }

  async function loadCurriculumPaths() {
    if (!HTTP_PAGE) return;
    try {
      const [domain, adaptersModule, supabaseModule] = await Promise.all([
        import("../course-builder/curriculum-domain.js"),
        import("../course-builder/curriculum-supabase-adapters.js"),
        import("../../lib/supabase/supabaseClient.js")
      ]);
      const adapters = adaptersModule.createSupabaseCurriculumAdapters({ supabase: supabaseModule.supabase });
      const nodes = await adapters.nodes.list();
      const flattened = domain.flattenCurriculumForest(domain.buildCurriculumForest(nodes));
      state.curriculumPathById = new Map(flattened.map((node) => [node.id, node.pathLabel]));
    } catch (error) {
      state.curriculumPathById = new Map();
    }
  }

  function bindEvents() {
    elements.refresh?.addEventListener("click", () => refreshQueue({ preserveSelection: true }));
    elements.filters.forEach((button) => {
      button.addEventListener("click", () => changeFilter(button.dataset.reviewFilter));
    });
    elements.queue?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-review-exam-id]");
      if (card) selectExam(card.dataset.reviewExamId);
    });
    elements.detail?.addEventListener("click", (event) => {
      const decisionButton = event.target.closest("[data-review-decision]");
      if (decisionButton) submitDecision(decisionButton.dataset.reviewDecision);
    });
  }

  async function changeFilter(filter) {
    const normalized = String(filter || "").trim().toLowerCase();
    if (!REVIEW_FILTERS.has(normalized) || normalized === state.filter || state.busy) return;
    state.filter = normalized;
    state.selectedId = null;
    elements.filters.forEach((button) => {
      const active = button.dataset.reviewFilter === state.filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    await refreshQueue({ preserveSelection: false });
  }

  async function refreshQueue({ preserveSelection = true } = {}) {
    if (!state.adapters || state.busy) return;
    const previousSelection = preserveSelection ? state.selectedId : null;
    setBusy(true);
    clearMessage();
    elements.queue.innerHTML = '<div class="exam-review-loading">Loading review records...</div>';
    try {
      state.records = await state.adapters.reviews.list({ reviewStatus: state.filter });
      state.selectedId = previousSelection && state.records.some((record) => record.id === previousSelection)
        ? previousSelection
        : null;
      renderQueue();
      if (state.selectedId) await renderSelectedExam();
      else renderEmptyDetail();
    } catch (error) {
      state.records = [];
      state.selectedId = null;
      renderQueueError(error);
      renderEmptyDetail();
    } finally {
      setBusy(false);
    }
  }

  function renderQueue() {
    elements.count.textContent = String(state.records.length);
    if (!state.records.length) {
      elements.queue.innerHTML = `
        <div class="exam-review-empty-queue">
          <p>${escapeHTML(emptyQueueMessage(state.filter))}</p>
        </div>
      `;
      return;
    }
    elements.queue.innerHTML = state.records.map((record) => {
      const definition = getDefinition(record);
      const questions = Array.isArray(definition.questions) ? definition.questions : [];
      const totalPoints = questions.reduce((sum, question) => sum + numericValue(question.points), 0);
      return `
        <button
          type="button"
          class="exam-review-queue-card${record.id === state.selectedId ? " is-selected" : ""}"
          data-review-exam-id="${escapeHTML(record.id)}"
          aria-pressed="${record.id === state.selectedId ? "true" : "false"}"
        >
          <span class="exam-review-queue-card-top">
            <span class="exam-review-status" data-status="${escapeHTML(record.reviewStatus)}">${escapeHTML(statusLabel(record.reviewStatus))}</span>
            <span>${escapeHTML(formatDate(record.updatedAt))}</span>
          </span>
          <strong>${escapeHTML(definition.title || "Untitled exam")}</strong>
          <p>${escapeHTML(definition.subject || "Subject not provided")}</p>
          <span class="exam-review-queue-meta">
            <span>${questions.length} ${questions.length === 1 ? "question" : "questions"}</span>
            <span aria-hidden="true">&middot;</span>
            <span>${formatNumber(totalPoints)} ${totalPoints === 1 ? "point" : "points"}</span>
          </span>
          <span class="exam-review-queue-card-bottom">
            <span>Owner ${escapeHTML(shortIdentifier(definition.madeBy))}</span>
            <span>Inspect</span>
          </span>
        </button>
      `;
    }).join("");
  }

  async function selectExam(examId) {
    const id = String(examId || "");
    if (!id || state.busy || !state.records.some((record) => record.id === id)) return;
    state.selectedId = id;
    renderQueue();
    await renderSelectedExam();
  }

  async function renderSelectedExam() {
    const selectedId = state.selectedId;
    const record = state.records.find((item) => item.id === selectedId);
    if (!record) {
      renderEmptyDetail();
      return;
    }
    elements.detail.innerHTML = '<div class="exam-review-loading">Loading the exam and its audit history...</div>';
    try {
      const history = await state.adapters.reviews.history({ examId: selectedId });
      if (state.selectedId !== selectedId) return;
      elements.detail.innerHTML = renderExamDetail(record, history);
      typesetMath(elements.detail);
    } catch (error) {
      if (state.selectedId !== selectedId) return;
      elements.detail.innerHTML = `
        <div class="exam-review-empty-detail">
          <h2>This exam could not be inspected</h2>
          <p>${escapeHTML(error?.message || "Its review history could not be loaded.")}</p>
        </div>
      `;
    }
  }

  function renderExamDetail(record, history) {
    const definition = getDefinition(record);
    const questions = Array.isArray(definition.questions) ? definition.questions : [];
    const totalPoints = questions.reduce((sum, question) => sum + numericValue(question.points), 0);
    const duration = numericValue(definition.durationMinutes);
    const typeCounts = countBy(questions, (question) => typeLabel(question.type));
    const difficultyCounts = countBy(questions, (question) => difficultyLabel(question.difficulty));
    const mediaTotals = questions.reduce((totals, question) => {
      const media = questionMedia(question);
      totals.images += media.imageCount;
      totals.diagrams += media.diagramCount;
      return totals;
    }, { images: 0, diagrams: 0 });
    const pending = record.reviewStatus === "pending_review";
    return `
      <header class="exam-review-detail-header">
        <div>
          <p class="tracks-kicker">Read-only submission</p>
          <h2>${escapeHTML(definition.title || "Untitled exam")}</h2>
          <p class="exam-review-detail-subject">${escapeHTML(definition.subject || "Subject not provided")}</p>
        </div>
        <span class="exam-review-status" data-status="${escapeHTML(record.reviewStatus)}">${escapeHTML(statusLabel(record.reviewStatus))}</span>
      </header>

      <div class="exam-review-summary-grid">
        ${renderMetric(questions.length, "Questions")}
        ${renderMetric(formatNumber(totalPoints), "Total points")}
        ${renderMetric(duration || "—", duration === 1 ? "Minute" : "Minutes")}
        ${renderMetric(mediaTotals.images + mediaTotals.diagrams, "Media assets")}
      </div>

      <section class="exam-review-section" aria-labelledby="exam-review-metadata-title">
        ${renderSectionTitle("exam-review-metadata-title", "Submission metadata", "Identity and workflow fields for this immutable review copy.")}
        <dl class="exam-review-metadata">
          ${renderMetadata("Exam ID", record.id)}
          ${renderMetadata("Owner ID", definition.madeBy || "Not recorded")}
          ${renderMetadata("Created", formatDate(record.createdAt, true))}
          ${renderMetadata("Submitted / updated", formatDate(record.updatedAt, true))}
          ${renderMetadata("Review state", statusLabel(record.reviewStatus))}
          ${renderMetadata("Catalog visibility", record.visibility === "public" ? "Public / catalog-eligible" : "Private")}
        </dl>
      </section>

      <section class="exam-review-section" aria-labelledby="exam-review-instructions-title">
        ${renderSectionTitle("exam-review-instructions-title", "Instructions", "The directions students receive before answering the exam.")}
        <p class="exam-review-instructions">${escapeHTML(definition.instructions || "No instructions were provided.")}</p>
      </section>

      <section class="exam-review-section" aria-labelledby="exam-review-composition-title">
        ${renderSectionTitle("exam-review-composition-title", "Composition", "Question formats and tutor-proposed difficulty levels.")}
        <div class="exam-review-chip-list">
          ${renderCountChips(typeCounts)}
          ${renderCountChips(difficultyCounts)}
        </div>
      </section>

      <section class="exam-review-section" aria-labelledby="exam-review-questions-title">
        ${renderSectionTitle("exam-review-questions-title", "Student order and answer settings", "Open any item to inspect its prompt, answer key, classification, response settings, and media indicators.")}
        <div class="exam-review-question-list">
          ${questions.length ? questions.map(renderQuestion).join("") : '<p class="exam-review-empty-copy">This exam has no questions.</p>'}
        </div>
      </section>

      <section class="exam-review-section" aria-labelledby="exam-review-history-title">
        ${renderSectionTitle("exam-review-history-title", "Review history", "An append-only record of trusted mentor and administrator decisions.")}
        ${renderHistory(history)}
      </section>

      ${pending ? renderDecisionBox(record) : `
        <p class="exam-review-final-note">This submitted copy is no longer awaiting a decision. Its content remains read-only; a tutor must create a new copy for further revisions.</p>
      `}
    `;
  }

  function renderQuestion(question, index) {
    const media = questionMedia(question);
    const pointValue = numericValue(question.points);
    const title = String(question.name || question.prompt || `Question ${index + 1}`).trim();
    const classificationStatus = String(question.classificationStatus || "unclassified");
    const typeTags = EXAM_CONTRACT.normalizeQuestionTypeTags(question.questionTypeTags);
    const primaryCurriculumNodeId = EXAM_CONTRACT.normalizePrimaryCurriculumNodeId(
      question.primaryCurriculumNodeId,
      question.curriculumNodeIds
    );
    return `
      <details class="exam-review-question">
        <summary>
          <span class="exam-review-question-number">${index + 1}</span>
          <span class="exam-review-question-heading">
            <strong>${escapeHTML(truncate(title, 130))}</strong>
            <small>${escapeHTML(typeLabel(question.type))} &middot; ${escapeHTML(difficultyLabel(question.difficulty))} &middot; ${formatNumber(pointValue)} ${pointValue === 1 ? "point" : "points"}</small>
          </span>
        </summary>
        <div class="exam-review-question-body">
          <div class="exam-review-question-block is-wide">
            <span class="exam-review-question-label">Question prompt</span>
            <p class="exam-review-prompt">${escapeHTML(question.prompt || "No prompt was provided.")}</p>
          </div>
          <div class="exam-review-question-block">
            <span class="exam-review-question-label">Answer key</span>
            <p class="exam-review-answer-copy">${escapeHTML(answerSummary(question))}</p>
          </div>
          <div class="exam-review-question-block">
            <span class="exam-review-question-label">Response settings</span>
            <p class="exam-review-answer-copy">${escapeHTML(responseSettings(question))}</p>
          </div>
          <div class="exam-review-question-block">
            <span class="exam-review-question-label">Difficulty classification</span>
            <div class="exam-review-media-list">
              <span>${escapeHTML(difficultyLabel(question.difficulty))}</span>
              <span class="exam-review-classification${classificationStatus === "reviewed" ? " is-reviewed" : ""}">${escapeHTML(classificationLabel(classificationStatus))}</span>
            </div>
          </div>
          <div class="exam-review-question-block is-wide">
            <span class="exam-review-question-label">Question-bank classification</span>
            <p class="exam-review-answer-copy">${escapeHTML(curriculumPathLabel(primaryCurriculumNodeId))}</p>
            <div class="exam-review-media-list">
              ${typeTags.length
                ? typeTags.map((tag) => `<span>${escapeHTML(questionTypeTagLabel(tag))}</span>`).join("")
                : '<span>Missing categories</span>'}
            </div>
          </div>
          <div class="exam-review-question-block">
            <span class="exam-review-question-label">Media</span>
            <div class="exam-review-media-list">${renderMediaIndicators(media)}</div>
          </div>
          <div class="exam-review-question-block is-wide">
            <span class="exam-review-question-label">Stable question ID</span>
            <p class="exam-review-answer-copy">${escapeHTML(question.id || "Not recorded")}</p>
          </div>
        </div>
      </details>
    `;
  }

  function renderDecisionBox(record) {
    return `
      <section class="exam-review-decision-box" aria-labelledby="exam-review-decision-title">
        <div class="exam-review-section-title">
          <div>
            <h3 id="exam-review-decision-title">Record a review decision</h3>
            <p>Approval confirms every proposed difficulty, curriculum path, and question category and makes this immutable copy catalog-eligible.</p>
          </div>
        </div>
        <label for="reviewDecisionNotes">Decision notes</label>
        <textarea id="reviewDecisionNotes" placeholder="Explain required revisions or the reason for rejection. Approval notes are optional."></textarea>
        <p class="exam-review-decision-help">Notes are required for “Request changes” and “Reject.” They become part of the audit history.</p>
        <div class="exam-review-decision-actions">
          <button type="button" class="btn-primary" data-review-decision="approved" data-review-exam="${escapeHTML(record.id)}">Approve</button>
          <button type="button" class="btn-outline exam-review-request-btn" data-review-decision="changes_requested" data-review-exam="${escapeHTML(record.id)}">Request changes</button>
          <button type="button" class="btn-outline exam-review-reject-btn" data-review-decision="rejected" data-review-exam="${escapeHTML(record.id)}">Reject</button>
        </div>
      </section>
    `;
  }

  async function submitDecision(decision) {
    if (state.busy || !state.selectedId || !state.adapters) return;
    const normalized = String(decision || "").trim().toLowerCase();
    if (!["approved", "changes_requested", "rejected"].includes(normalized)) return;
    const notes = String(document.getElementById("reviewDecisionNotes")?.value || "").trim();
    if (normalized !== "approved" && !notes) {
      showMessage("Add review notes before requesting changes or rejecting this exam.", true);
      document.getElementById("reviewDecisionNotes")?.focus();
      return;
    }
    const verb = normalized === "approved" ? "approve" : normalized === "changes_requested" ? "request changes to" : "reject";
    const confirmed = root.confirm(`Are you sure you want to ${verb} this immutable exam submission?`);
    if (!confirmed) return;
    const reviewedExamId = state.selectedId;
    setBusy(true);
    clearMessage();
    try {
      await state.adapters.reviews.decide(reviewedExamId, { decision: normalized, notes });
      showMessage(`${statusLabel(normalized)} was recorded. The audit history has been updated.`);
      state.selectedId = null;
      state.records = await state.adapters.reviews.list({ reviewStatus: state.filter });
      renderQueue();
      renderEmptyDetail();
    } catch (error) {
      showMessage(error?.message || "The review decision could not be saved.", true);
    } finally {
      setBusy(false);
    }
  }

  function getDefinition(record) {
    if (record?.definition) return record.definition;
    return EXAM_CONTRACT.restoreDefinitionFromBundle(record?.bundle);
  }

  function questionMedia(question) {
    const bodyImage = Boolean(question?.imageData);
    const optionImages = Array.isArray(question?.optionImages) ? question.optionImages.filter(Boolean).length : 0;
    const bodyDiagram = hasDiagram(question?.graph);
    const optionDiagrams = Array.isArray(question?.optionGraphs) ? question.optionGraphs.filter(hasDiagram).length : 0;
    return {
      bodyImage,
      optionImages,
      bodyDiagram,
      optionDiagrams,
      imageCount: Number(bodyImage) + optionImages,
      diagramCount: Number(bodyDiagram) + optionDiagrams
    };
  }

  function hasDiagram(graph) {
    if (!graph || typeof graph !== "object") return false;
    return Object.keys(graph).length > 0;
  }

  function renderMediaIndicators(media) {
    const indicators = [];
    if (media.bodyImage) indicators.push("Body image");
    if (media.optionImages) indicators.push(`${media.optionImages} option ${media.optionImages === 1 ? "image" : "images"}`);
    if (media.bodyDiagram) indicators.push("Body diagram");
    if (media.optionDiagrams) indicators.push(`${media.optionDiagrams} option ${media.optionDiagrams === 1 ? "diagram" : "diagrams"}`);
    if (!indicators.length) indicators.push("No media attached");
    return indicators.map((label) => `<span>${escapeHTML(label)}</span>`).join("");
  }

  function answerSummary(question) {
    const type = String(question?.type || "");
    if (type === "numeric") {
      const expected = String(question.numericExpectedAnswer || question.answer || "").trim();
      if (!expected) return "No expected numeric answer was provided.";
      const details = [expected];
      if (!question.numericExactMatch) details.push(`tolerance ${question.numericTolerance ?? 0}`);
      if (question.numericRequireUnit && question.numericUnit) details.push(`required unit ${question.numericUnit}`);
      return details.join(" · ");
    }
    if (["short-answer", "essay"].includes(type)) {
      return String(question.answer || "").trim() || "No model answer or marking guidance was provided.";
    }
    if (type === "true-false") {
      const option = selectedOptionSummary(question, Number(question.correctOptionIndex));
      return option || String(question.answer || "").trim() || "No correct answer was selected.";
    }
    if (type.startsWith("multiple-answer") || type === "multiple-answer") {
      const indexes = Array.isArray(question.correctOptionIndexes) ? question.correctOptionIndexes : [];
      return indexes.length
        ? indexes.map((index) => selectedOptionSummary(question, Number(index))).filter(Boolean).join("; ")
        : "No correct options were selected.";
    }
    if (type.startsWith("multiple-choice") || type === "multiple-choice") {
      return selectedOptionSummary(question, Number(question.correctOptionIndex)) || "No correct option was selected.";
    }
    return String(question.answer || "").trim() || "No answer key was provided.";
  }

  function selectedOptionSummary(question, index) {
    if (!Number.isInteger(index) || index < 0) return "";
    const text = String(question?.options?.[index] || "").trim();
    const hasImage = Boolean(question?.optionImages?.[index]);
    const hasGraph = hasDiagram(question?.optionGraphs?.[index]);
    const fallback = hasImage ? "Image option" : hasGraph ? "Diagram option" : "Blank option";
    return `${optionLetter(index)}. ${text || fallback}`;
  }

  function responseSettings(question) {
    const type = String(question?.type || "");
    const settings = [`${formatNumber(numericValue(question.points))} ${numericValue(question.points) === 1 ? "point" : "points"}`];
    if (["short-answer", "essay"].includes(type)) {
      const size = String(question.pdfAnswerSpaceSize || "medium").replace(/-/g, " ");
      settings.push(`PDF answer space: ${size}${size === "custom" ? ` (${numericValue(question.pdfAnswerSpaceCustomMm)} mm)` : ""}`);
      settings.push("Tutor-reviewed response");
    } else if (type === "numeric") {
      settings.push(question.numericExactMatch ? "Exact numeric match" : `Tolerance: ${question.numericTolerance ?? 0}`);
      settings.push(`Angle mode: ${String(question.numericAngleMode || "radians")}`);
      if (question.numericRequireUnit) settings.push(`Unit required: ${String(question.numericUnit || "not specified")}`);
    } else if (type.startsWith("multiple-answer") || type === "multiple-answer") {
      settings.push("More than one option may be selected");
    } else {
      settings.push("One option may be selected");
    }
    return settings.join(" · ");
  }

  function renderHistory(history) {
    if (!Array.isArray(history) || !history.length) {
      return '<p class="exam-review-empty-copy">No decisions have been recorded for this exam yet.</p>';
    }
    return `
      <div class="exam-review-history">
        ${history.map((entry) => `
          <article class="exam-review-history-entry is-${escapeHTML(entry.decision)}">
            <div class="exam-review-history-entry-top">
              <span class="exam-review-status" data-status="${escapeHTML(entry.decision)}">${escapeHTML(statusLabel(entry.decision))}</span>
              <small>${escapeHTML(formatDate(entry.reviewedAt, true))}</small>
            </div>
            <p>${escapeHTML(entry.notes || "No decision notes were added.")}</p>
            <small>Reviewer ${escapeHTML(shortIdentifier(entry.reviewerId))}</small>
          </article>
        `).join("")}
      </div>
    `;
  }

  function countBy(items, labelFor) {
    const counts = new Map();
    items.forEach((item) => {
      const label = labelFor(item);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return counts;
  }

  function renderCountChips(counts) {
    return [...counts.entries()]
      .map(([label, count]) => `<span class="exam-review-chip"><strong>${count}</strong> ${escapeHTML(label)}</span>`)
      .join("");
  }

  function renderMetric(value, label) {
    return `<div class="exam-review-metric"><strong>${escapeHTML(String(value))}</strong><span>${escapeHTML(label)}</span></div>`;
  }

  function renderMetadata(label, value) {
    return `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(String(value))}</dd></div>`;
  }

  function renderSectionTitle(id, title, description) {
    return `
      <div class="exam-review-section-title">
        <div>
          <h3 id="${escapeHTML(id)}">${escapeHTML(title)}</h3>
          <p>${escapeHTML(description)}</p>
        </div>
      </div>
    `;
  }

  function renderEmptyDetail() {
    elements.detail.innerHTML = `
      <div class="exam-review-empty-detail">
        <div class="exam-review-empty-icon" aria-hidden="true">&#10003;</div>
        <h2>Select an exam to inspect</h2>
        <p>The complete metadata, question order, proposed difficulty, answer settings, media indicators, and review history will appear here.</p>
      </div>
    `;
  }

  function renderQueueError(error) {
    elements.count.textContent = "0";
    elements.queue.innerHTML = `
      <div class="exam-review-empty-queue">
        <p>${escapeHTML(error?.message || "The review queue could not be loaded.")}</p>
      </div>
    `;
    showMessage(error?.message || "The review queue could not be loaded.", true);
  }

  function renderFatalError(error) {
    elements.provider.textContent = "Review provider unavailable";
    renderQueueError(error);
    elements.filters.forEach((button) => { button.disabled = true; });
    elements.refresh.disabled = true;
  }

  function setBusy(busy) {
    state.busy = Boolean(busy);
    elements.refresh.disabled = state.busy;
    elements.filters.forEach((button) => { button.disabled = state.busy; });
    elements.detail.querySelectorAll("[data-review-decision]").forEach((button) => { button.disabled = state.busy; });
  }

  function showMessage(message, isError = false) {
    elements.message.textContent = String(message || "");
    elements.message.classList.toggle("is-error", Boolean(isError));
  }

  function clearMessage() {
    showMessage("");
  }

  function typeLabel(type) {
    return TYPE_LABELS[String(type || "")] || "Question";
  }

  function difficultyLabel(difficulty) {
    return DIFFICULTY_LABELS[String(difficulty || "")] || "Unclassified";
  }

  function classificationLabel(status) {
    const labels = { unclassified: "Not classified", proposed: "Tutor proposed", reviewed: "Reviewer confirmed" };
    return labels[String(status || "")] || "Not classified";
  }

  function curriculumPathLabel(nodeId) {
    const id = String(nodeId || "").trim();
    if (!id) return "No curriculum track or topic assigned";
    return state.curriculumPathById.get(id) || `Saved curriculum node ${id}`;
  }

  function questionTypeTagLabel(tag) {
    const labels = {
      "word-problem": "Word problem",
      numeric: "Numeric",
      graph: "Graph",
      image: "Image",
      "true-false": "True / false",
      "multiple-choice": "Multiple choice",
      "multiple-answer": "Multiple answers",
      "short-answer": "Short answer",
      essay: "Essay / explanation"
    };
    return labels[tag] || tag;
  }

  function statusLabel(status) {
    return STATUS_LABELS[String(status || "")] || String(status || "Unknown").replace(/_/g, " ");
  }

  function emptyQueueMessage(filter) {
    const messages = {
      pending_review: "No exams are currently awaiting review.",
      approved: "No approved exams are available.",
      changes_requested: "No exams currently have requested changes.",
      rejected: "No rejected exams are available."
    };
    return messages[filter] || "No exams match this filter.";
  }

  function numericValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    const number = numericValue(value);
    return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function optionLetter(index) {
    return String.fromCharCode(65 + Math.max(0, index));
  }

  function truncate(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function shortIdentifier(value) {
    const id = String(value || "not recorded");
    return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
  }

  function formatDate(value, includeTime = false) {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) return "Not recorded";
    return new Intl.DateTimeFormat(undefined, includeTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }).format(date);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function typesetMath(container) {
    try {
      if (root.MathJax?.typesetPromise) await root.MathJax.typesetPromise([container]);
    } catch (error) {
      console.warn("MathJax could not typeset the exam review.", error);
    }
  }
})(window);
