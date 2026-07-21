(function formReviewPage(root) {
  'use strict';

  const AdapterDomain = root.KelpFormAdapters;
  if (!AdapterDomain) throw new Error('The form review page requires the form adapter domain.');

  const HTTP_PAGE = /^https?:$/.test(root.location.protocol);
  const FILTERS = new Set(['pending_review', 'approved', 'changes_requested', 'rejected']);
  const TYPE_LABELS = Object.freeze({
    'multiple-choice': 'Multiple choice',
    'multiple-answer': 'Multiple answers',
    'true-false': 'True / false',
    number: 'Number',
    'short-answer': 'Short answer',
    'long-answer': 'Long answer'
  });
  const STATUS_LABELS = Object.freeze({
    pending_review: 'Awaiting review',
    approved: 'Approved',
    changes_requested: 'Changes requested',
    rejected: 'Rejected'
  });
  const IDENTITY_LABELS = Object.freeze({
    fullName: 'Full name',
    birthdate: 'Birthdate',
    email: 'Email',
    phone: 'Phone',
    country: 'Country',
    state: 'State / province',
    city: 'City'
  });
  const localAdapters = AdapterDomain.createLocalAdapters();
  const state = {
    adapters: null,
    auth: null,
    filter: 'pending_review',
    records: [],
    selectedId: null,
    busy: false
  };
  const elements = {
    provider: document.getElementById('reviewProvider'),
    refresh: document.getElementById('refreshReviewsBtn'),
    message: document.getElementById('reviewMessage'),
    filters: [...document.querySelectorAll('[data-review-filter]')],
    count: document.getElementById('reviewQueueCount'),
    queue: document.getElementById('reviewQueue'),
    detail: document.getElementById('reviewDetail')
  };

  init();

  async function init() {
    bindEvents();
    try {
      state.auth = await requireReviewerAccess();
      if (HTTP_PAGE && !state.auth) return;
      await Promise.resolve(root.KelpFormProviderReady);
      state.adapters = await AdapterDomain.resolveAdapters({
        localAdapters,
        context: { surface: 'form-review', readOnlyContent: true }
      });
      if (HTTP_PAGE && state.adapters.meta?.provider !== 'supabase') {
        throw new Error('The trusted review provider is unavailable. Review decisions were not enabled.');
      }
      elements.provider.textContent = state.adapters.meta?.provider === 'supabase'
        ? 'Shared review library'
        : 'Local review sandbox';
      await refreshQueue({ preserveSelection: false });
    } catch (error) {
      renderFatalError(error);
    }
  }

  async function requireReviewerAccess() {
    if (!HTTP_PAGE) return { local: true, role: 'local-reviewer' };
    const { getHomePathByRole, requireCapability } = await import('../../auth/auth-guard.js');
    const current = await requireCapability(['form.review']);
    if (current) {
      const homePath = getHomePathByRole(current.primaryRole);
      document.querySelectorAll('[data-workspace-home]').forEach((link) => { link.href = homePath; });
    }
    return current;
  }

  function bindEvents() {
    elements.refresh?.addEventListener('click', () => refreshQueue({ preserveSelection: true }));
    elements.filters.forEach((button) => {
      button.addEventListener('click', () => changeFilter(button.dataset.reviewFilter));
    });
    elements.queue?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-review-form-id]');
      if (card) selectForm(card.dataset.reviewFormId);
    });
    elements.detail?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-review-decision]');
      if (button) submitDecision(button.dataset.reviewDecision);
    });
  }

  async function changeFilter(filter) {
    const normalized = String(filter || '').trim().toLowerCase();
    if (!FILTERS.has(normalized) || normalized === state.filter || state.busy) return;
    state.filter = normalized;
    state.selectedId = null;
    elements.filters.forEach((button) => {
      const active = button.dataset.reviewFilter === state.filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
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
      if (state.selectedId) await renderSelectedForm();
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
      elements.queue.innerHTML = `<div class="exam-review-empty-queue"><p>${escapeHTML(emptyQueueMessage(state.filter))}</p></div>`;
      return;
    }
    elements.queue.innerHTML = state.records.map((record) => {
      const definition = record.definition || {};
      const questions = blocksOfKind(definition, 'question');
      const phases = blocksOfKind(definition, 'phase');
      return `
        <button type="button" class="exam-review-queue-card${record.id === state.selectedId ? ' is-selected' : ''}"
          data-review-form-id="${escapeHTML(record.id)}" aria-pressed="${record.id === state.selectedId ? 'true' : 'false'}">
          <span class="exam-review-queue-card-top">
            <span class="exam-review-status" data-status="${escapeHTML(record.reviewStatus)}">${escapeHTML(statusLabel(record.reviewStatus))}</span>
            <span>${escapeHTML(formatDate(record.updatedAt))}</span>
          </span>
          <strong>${escapeHTML(definition.meta?.title || 'Untitled form')}</strong>
          <p>${escapeHTML(definition.meta?.audience || 'Audience not provided')}</p>
          <span class="exam-review-queue-meta">
            <span>${questions.length} ${questions.length === 1 ? 'question' : 'questions'}</span>
            <span aria-hidden="true">&middot;</span>
            <span>${phases.length} ${phases.length === 1 ? 'phase' : 'phases'}</span>
          </span>
          <span class="exam-review-queue-card-bottom">
            <span>Owner ${escapeHTML(shortIdentifier(record.ownerId))}</span>
            <span>Inspect</span>
          </span>
        </button>`;
    }).join('');
  }

  async function selectForm(formId) {
    const id = String(formId || '');
    if (!id || state.busy || !state.records.some((record) => record.id === id)) return;
    state.selectedId = id;
    renderQueue();
    await renderSelectedForm();
  }

  async function renderSelectedForm() {
    const selectedId = state.selectedId;
    const record = state.records.find((item) => item.id === selectedId);
    if (!record) return renderEmptyDetail();
    elements.detail.innerHTML = '<div class="exam-review-loading">Loading the form and its audit history...</div>';
    try {
      const history = await state.adapters.reviews.history({ formId: selectedId });
      if (state.selectedId !== selectedId) return;
      elements.detail.innerHTML = renderFormDetail(record, history);
    } catch (error) {
      if (state.selectedId !== selectedId) return;
      elements.detail.innerHTML = `<div class="exam-review-empty-detail"><h2>This form could not be inspected</h2><p>${escapeHTML(error?.message || 'Its review history could not be loaded.')}</p></div>`;
    }
  }

  function renderFormDetail(record, history) {
    const definition = record.definition || {};
    const meta = definition.meta || {};
    const questions = blocksOfKind(definition, 'question');
    const phases = blocksOfKind(definition, 'phase');
    const triggers = phases.flatMap((phase) => Array.isArray(phase.triggers) ? phase.triggers : []);
    const identity = Object.entries(meta.respondentDetails || {}).filter(([, config]) => config?.enabled);
    const typeCounts = countBy(questions, (question) => typeLabel(question.type));
    const pending = record.reviewStatus === 'pending_review';
    return `
      <header class="exam-review-detail-header">
        <div>
          <p class="tracks-kicker">Read-only submission</p>
          <h2>${escapeHTML(meta.title || 'Untitled form')}</h2>
          <p class="exam-review-detail-subject">${escapeHTML(meta.audience || 'Audience not provided')}</p>
        </div>
        <span class="exam-review-status" data-status="${escapeHTML(record.reviewStatus)}">${escapeHTML(statusLabel(record.reviewStatus))}</span>
      </header>

      <div class="exam-review-summary-grid">
        ${renderMetric(questions.length, 'Questions')}
        ${renderMetric(phases.length, 'Phases')}
        ${renderMetric(triggers.length, 'Routing triggers')}
        ${renderMetric(identity.length, 'Respondent fields')}
      </div>

      <section class="exam-review-section" aria-labelledby="form-review-metadata-title">
        ${renderSectionTitle('form-review-metadata-title', 'Submission metadata', 'Identity and workflow fields for this immutable review copy.')}
        <dl class="exam-review-metadata">
          ${renderMetadata('Form ID', record.id)}
          ${renderMetadata('Owner ID', record.ownerId || 'Not recorded')}
          ${renderMetadata('Schema version', definition.version || 'Not recorded')}
          ${renderMetadata('Created', formatDate(record.createdAt, true))}
          ${renderMetadata('Submitted / updated', formatDate(record.updatedAt, true))}
          ${renderMetadata('Review state', statusLabel(record.reviewStatus))}
          ${renderMetadata('Visibility', record.visibility === 'public' ? 'Public / catalog-eligible' : 'Private')}
          ${renderMetadata('Response policy', definition.settings?.submissionPolicy?.mode === 'single' ? 'One submission per respondent' : 'Multiple submissions allowed')}
        </dl>
      </section>

      <section class="exam-review-section" aria-labelledby="form-review-description-title">
        ${renderSectionTitle('form-review-description-title', 'Form purpose', 'The summary presented by the author for this respondent workflow.')}
        <p class="exam-review-instructions">${escapeHTML(meta.description || 'No description was provided.')}</p>
      </section>

      <section class="exam-review-section" aria-labelledby="form-review-respondent-title">
        ${renderSectionTitle('form-review-respondent-title', 'Respondent details', 'Personal fields requested before the question flow begins.')}
        <div class="exam-review-chip-list">
          ${identity.length ? identity.map(([key, config]) => `<span class="exam-review-chip"><strong>${config.required ? 'Required' : 'Optional'}</strong> ${escapeHTML(IDENTITY_LABELS[key] || key)}${config.verify ? ' · verify later' : ''}</span>`).join('') : '<span class="exam-review-empty-copy">No respondent details are collected.</span>'}
        </div>
      </section>

      <section class="exam-review-section" aria-labelledby="form-review-composition-title">
        ${renderSectionTitle('form-review-composition-title', 'Composition', 'Question formats included in the submitted copy.')}
        <div class="exam-review-chip-list">${renderCountChips(typeCounts)}</div>
      </section>

      <section class="exam-review-section" aria-labelledby="form-review-flow-title">
        ${renderSectionTitle('form-review-flow-title', 'Phases, questions, and routing', 'Open a phase or item to inspect the exact respondent order and every conditional entrance rule.')}
        <div class="exam-review-question-list">${renderFlow(definition)}</div>
      </section>

      <section class="exam-review-section" aria-labelledby="form-review-history-title">
        ${renderSectionTitle('form-review-history-title', 'Review history', 'An append-only record of trusted mentor and administrator decisions.')}
        ${renderHistory(history)}
      </section>

      ${pending ? renderDecisionBox(record) : '<p class="exam-review-final-note">This submitted copy is no longer awaiting a decision. Its content remains read-only; the author must create a new copy for further revisions.</p>'}
    `;
  }

  function renderFlow(definition) {
    const blocks = Array.isArray(definition.blocks) ? definition.blocks : [];
    if (!blocks.length) return '<p class="exam-review-empty-copy">This form has no content blocks.</p>';
    let questionNumber = 0;
    return blocks.map((block) => {
      if (block.kind === 'phase') return renderPhase(block, definition);
      if (block.kind === 'question') {
        questionNumber += 1;
        return renderQuestion(block, questionNumber);
      }
      if (block.kind === 'greeting' || block.kind === 'goodbye') return renderBoundaryBlock(block);
      return '';
    }).join('');
  }

  function renderPhase(phase, definition) {
    const questionCount = phaseQuestionCount(definition, phase.id);
    const triggers = Array.isArray(phase.triggers) ? phase.triggers : [];
    return `
      <details class="exam-review-question">
        <summary>
          <span class="exam-review-question-number">P</span>
          <span class="exam-review-question-heading">
            <strong>${escapeHTML(phase.title || 'Untitled phase')}</strong>
            <small>${questionCount} ${questionCount === 1 ? 'question' : 'questions'} · ${triggers.length ? `${triggers.length} conditional route${triggers.length === 1 ? '' : 's'}` : 'normal flow'}</small>
          </span>
        </summary>
        <div class="exam-review-question-body">
          <div class="exam-review-question-block is-wide"><span class="exam-review-question-label">Phase description</span><p class="exam-review-prompt">${escapeHTML(phase.description || 'No phase description was provided.')}</p></div>
          <div class="exam-review-question-block is-wide"><span class="exam-review-question-label">Entrance rules</span>${triggers.length ? `<div class="exam-review-history">${triggers.map((trigger) => `<article class="exam-review-history-entry"><p>${escapeHTML(triggerSummary(trigger, definition))}</p><small>${escapeHTML(trigger.id || 'Trigger ID not recorded')}</small></article>`).join('')}</div>` : '<p class="exam-review-answer-copy">Normal flow: this phase is used when no eligible conditional destination takes precedence.</p>'}</div>
          <div class="exam-review-question-block is-wide"><span class="exam-review-question-label">Stable phase ID</span><p class="exam-review-answer-copy">${escapeHTML(phase.id || 'Not recorded')}</p></div>
        </div>
      </details>`;
  }

  function renderQuestion(question, number) {
    const options = Array.isArray(question.options) ? question.options : [];
    return `
      <details class="exam-review-question">
        <summary>
          <span class="exam-review-question-number">${number}</span>
          <span class="exam-review-question-heading">
            <strong>${escapeHTML(truncate(question.prompt || `Question ${number}`, 130))}</strong>
            <small>${escapeHTML(typeLabel(question.type))} · ${question.required ? 'Required' : 'Optional'}</small>
          </span>
        </summary>
        <div class="exam-review-question-body">
          <div class="exam-review-question-block is-wide"><span class="exam-review-question-label">Question prompt</span><p class="exam-review-prompt">${escapeHTML(question.prompt || 'No prompt was provided.')}</p></div>
          <div class="exam-review-question-block"><span class="exam-review-question-label">Response settings</span><p class="exam-review-answer-copy">${question.required ? 'Response required' : 'Response optional'} · ${escapeHTML(typeLabel(question.type))}</p></div>
          <div class="exam-review-question-block"><span class="exam-review-question-label">Help text</span><p class="exam-review-answer-copy">${escapeHTML(question.helpText || 'No help text was provided.')}</p></div>
          ${options.length ? `<div class="exam-review-question-block is-wide"><span class="exam-review-question-label">Options</span><div class="exam-review-chip-list">${options.map((option, index) => `<span class="exam-review-chip"><strong>${index + 1}</strong> ${escapeHTML(option.label || 'Blank option')}</span>`).join('')}</div></div>` : ''}
          <div class="exam-review-question-block is-wide"><span class="exam-review-question-label">Stable question ID</span><p class="exam-review-answer-copy">${escapeHTML(question.id || 'Not recorded')}</p></div>
        </div>
      </details>`;
  }

  function renderBoundaryBlock(block) {
    const label = block.kind === 'greeting' ? 'Opening card' : 'Closing card';
    return `
      <details class="exam-review-question">
        <summary><span class="exam-review-question-number">${block.kind === 'greeting' ? 'O' : 'C'}</span><span class="exam-review-question-heading"><strong>${escapeHTML(block.title || label)}</strong><small>${label}</small></span></summary>
        <div class="exam-review-question-body"><div class="exam-review-question-block is-wide"><span class="exam-review-question-label">Message</span><p class="exam-review-prompt">${escapeHTML(block.body || 'No message was provided.')}</p></div><div class="exam-review-question-block"><span class="exam-review-question-label">Button text</span><p class="exam-review-answer-copy">${escapeHTML(block.buttonText || 'Not provided')}</p></div></div>
      </details>`;
  }

  function triggerSummary(trigger, definition) {
    const phase = findBlock(definition, trigger.sourcePhaseId);
    if (trigger.kind === 'phase-complete') return `After completing ${phase?.title || trigger.sourcePhaseId || 'the source phase'}`;
    const question = findBlock(definition, trigger.questionId);
    const matcher = trigger.matcher || {};
    if (matcher.type === 'equals-option') {
      const option = (question?.options || []).find((item) => item.id === matcher.optionId);
      return `From ${phase?.title || 'the source phase'}, when “${question?.prompt || 'the source question'}” equals “${option?.label || matcher.optionId || 'the selected option'}”`;
    }
    if (matcher.type === 'contains-options') {
      const labels = (matcher.optionIds || []).map((id) => (question?.options || []).find((item) => item.id === id)?.label || id);
      return `From ${phase?.title || 'the source phase'}, when “${question?.prompt || 'the source question'}” includes ${labels.join(', ') || 'the configured options'}`;
    }
    if (matcher.type === 'number') return `From ${phase?.title || 'the source phase'}, when “${question?.prompt || 'the source question'}” is ${matcher.operator || '='} ${matcher.value || 'the configured value'}`;
    return `Conditional answer route from ${phase?.title || trigger.sourcePhaseId || 'the source phase'}`;
  }

  function renderDecisionBox(record) {
    return `
      <section class="exam-review-decision-box" aria-labelledby="form-review-decision-title">
        <div class="exam-review-section-title"><div><h3 id="form-review-decision-title">Record a review decision</h3><p>Approval publishes this immutable definition. It does not assign the form to any student.</p></div></div>
        <label for="reviewDecisionNotes">Decision notes</label>
        <textarea id="reviewDecisionNotes" placeholder="Explain required revisions or the reason for rejection. Approval notes are optional."></textarea>
        <p class="exam-review-decision-help">Notes are required for “Request changes” and “Reject.” They become part of the audit history.</p>
        <div class="exam-review-decision-actions">
          <button type="button" class="btn-primary" data-review-decision="approved" data-review-form="${escapeHTML(record.id)}">Approve</button>
          <button type="button" class="btn-outline exam-review-request-btn" data-review-decision="changes_requested" data-review-form="${escapeHTML(record.id)}">Request changes</button>
          <button type="button" class="btn-outline exam-review-reject-btn" data-review-decision="rejected" data-review-form="${escapeHTML(record.id)}">Reject</button>
        </div>
      </section>`;
  }

  async function submitDecision(decision) {
    if (state.busy || !state.selectedId || !state.adapters) return;
    const normalized = String(decision || '').trim().toLowerCase();
    if (!['approved', 'changes_requested', 'rejected'].includes(normalized)) return;
    const notes = String(document.getElementById('reviewDecisionNotes')?.value || '').trim();
    if (normalized !== 'approved' && !notes) {
      showMessage('Add review notes before requesting changes or rejecting this form.', true);
      document.getElementById('reviewDecisionNotes')?.focus();
      return;
    }
    const verb = normalized === 'approved' ? 'approve' : normalized === 'changes_requested' ? 'request changes to' : 'reject';
    if (!root.confirm(`Are you sure you want to ${verb} this immutable form submission?`)) return;
    const reviewedId = state.selectedId;
    setBusy(true);
    clearMessage();
    try {
      await state.adapters.reviews.decide(reviewedId, { decision: normalized, notes });
      showMessage(`${statusLabel(normalized)} was recorded. The audit history has been updated.`);
      state.selectedId = null;
      state.records = await state.adapters.reviews.list({ reviewStatus: state.filter });
      renderQueue();
      renderEmptyDetail();
    } catch (error) {
      showMessage(error?.message || 'The review decision could not be saved.', true);
    } finally {
      setBusy(false);
    }
  }

  function renderHistory(history) {
    if (!Array.isArray(history) || !history.length) return '<p class="exam-review-empty-copy">No decisions have been recorded for this form yet.</p>';
    return `<div class="exam-review-history">${history.map((entry) => `<article class="exam-review-history-entry is-${escapeHTML(entry.decision)}"><div class="exam-review-history-entry-top"><span class="exam-review-status" data-status="${escapeHTML(entry.decision)}">${escapeHTML(statusLabel(entry.decision))}</span><small>${escapeHTML(formatDate(entry.reviewedAt, true))}</small></div><p>${escapeHTML(entry.notes || 'No decision notes were added.')}</p><small>Reviewer ${escapeHTML(shortIdentifier(entry.reviewerId))}</small></article>`).join('')}</div>`;
  }

  function blocksOfKind(definition, kind) {
    return (Array.isArray(definition?.blocks) ? definition.blocks : []).filter((block) => block.kind === kind);
  }

  function findBlock(definition, blockId) {
    return (definition?.blocks || []).find((block) => block.id === blockId) || null;
  }

  function phaseQuestionCount(definition, phaseId) {
    const blocks = Array.isArray(definition?.blocks) ? definition.blocks : [];
    const start = blocks.findIndex((block) => block.kind === 'phase' && block.id === phaseId);
    if (start < 0) return 0;
    let count = 0;
    for (let index = start + 1; index < blocks.length; index += 1) {
      if (blocks[index].kind === 'phase' || blocks[index].kind === 'goodbye') break;
      if (blocks[index].kind === 'question') count += 1;
    }
    return count;
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
    if (!counts.size) return '<span class="exam-review-empty-copy">No questions were provided.</span>';
    return [...counts.entries()].map(([label, count]) => `<span class="exam-review-chip"><strong>${count}</strong> ${escapeHTML(label)}</span>`).join('');
  }

  function renderMetric(value, label) {
    return `<div class="exam-review-metric"><strong>${escapeHTML(String(value))}</strong><span>${escapeHTML(label)}</span></div>`;
  }

  function renderMetadata(label, value) {
    return `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(String(value))}</dd></div>`;
  }

  function renderSectionTitle(id, title, description) {
    return `<div class="exam-review-section-title"><div><h3 id="${escapeHTML(id)}">${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p></div></div>`;
  }

  function renderEmptyDetail() {
    elements.detail.innerHTML = '<div class="exam-review-empty-detail"><div class="exam-review-empty-icon" aria-hidden="true">&#10003;</div><h2>Select a form to inspect</h2><p>Its metadata, respondent fields, phase routing, question order, options, and review history will appear here.</p></div>';
  }

  function renderQueueError(error) {
    elements.count.textContent = '0';
    elements.queue.innerHTML = `<div class="exam-review-empty-queue"><p>${escapeHTML(error?.message || 'The review queue could not be loaded.')}</p></div>`;
    showMessage(error?.message || 'The review queue could not be loaded.', true);
  }

  function renderFatalError(error) {
    elements.provider.textContent = 'Review provider unavailable';
    renderQueueError(error);
    elements.filters.forEach((button) => { button.disabled = true; });
    elements.refresh.disabled = true;
  }

  function setBusy(busy) {
    state.busy = Boolean(busy);
    elements.refresh.disabled = state.busy;
    elements.filters.forEach((button) => { button.disabled = state.busy; });
    elements.detail.querySelectorAll('[data-review-decision]').forEach((button) => { button.disabled = state.busy; });
  }

  function showMessage(message, isError = false) {
    elements.message.textContent = String(message || '');
    elements.message.classList.toggle('is-error', Boolean(isError));
  }

  function clearMessage() { showMessage(''); }
  function typeLabel(type) { return TYPE_LABELS[String(type || '')] || 'Question'; }
  function statusLabel(status) { return STATUS_LABELS[String(status || '')] || String(status || 'Unknown').replace(/_/g, ' '); }

  function emptyQueueMessage(filter) {
    return {
      pending_review: 'No forms are currently awaiting review.',
      approved: 'No approved forms are available.',
      changes_requested: 'No forms currently have requested changes.',
      rejected: 'No rejected forms are available.'
    }[filter] || 'No forms match this filter.';
  }

  function truncate(value, maxLength) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function shortIdentifier(value) {
    const id = String(value || 'not recorded');
    return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
  }

  function formatDate(value, includeTime = false) {
    const date = new Date(String(value || ''));
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat(undefined, includeTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' }).format(date);
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})(window);
