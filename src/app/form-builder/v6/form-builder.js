(() => {
  'use strict';

  const STORAGE_KEY = 'kelp-form-builder-draft-v2';
  const LEGACY_STORAGE_KEY = 'kelp-form-builder-draft-v1';
  const TRANSITION_MS = 1200;

  const QUESTION_TYPES = {
    'short-answer': { label: 'Short answer', helper: 'One concise written response.', routable: false },
    'long-answer': { label: 'Long answer', helper: 'A fuller written response.', routable: false },
    'multiple-choice': { label: 'Multiple choice', helper: 'Respondent selects one option.', routable: true },
    'multiple-answer': { label: 'Multiple answer', helper: 'Respondent may select more than one option.', routable: true },
    number: { label: 'Number', helper: 'Respondent enters a numeric value.', routable: true },
    'true-false': { label: 'True / false', helper: 'Respondent selects one of two fixed options.', routable: true }
  };

  const IDENTITY_FIELDS = {
    fullName: {
      label: 'Full name',
      helper: 'Lets you identify the respondent by name.',
      inputType: 'text',
      placeholder: 'Example: Ana Maria Silva',
      supportsVerify: false
    },
    birthdate: {
      label: 'Birthdate',
      helper: 'Useful when age or parent consent matters.',
      inputType: 'date',
      placeholder: '',
      supportsVerify: false
    },
    email: {
      label: 'E-mail address',
      helper: 'Can be checked for valid structure and later confirmed with an e-mail link or code.',
      inputType: 'email',
      placeholder: 'name@example.com',
      supportsVerify: true
    },
    phone: {
      label: 'Phone number',
      helper: 'Can be checked for a plausible number and later confirmed by SMS or WhatsApp.',
      inputType: 'tel',
      placeholder: '+55 (00) 00000-0000',
      supportsVerify: true
    }
  };

  const defaultIdentityState = () => ({
    fullName: { enabled: true, required: true, verify: false },
    birthdate: { enabled: false, required: false, verify: false },
    email: { enabled: false, required: false, verify: false },
    phone: { enabled: false, required: false, verify: false }
  });

  const defaultState = () => ({
    version: 2,
    meta: {
      title: 'Student Check-in',
      audience: 'Current students',
      description: 'Your answers help me adapt our next lessons and materials.',
      respondentDetails: defaultIdentityState()
    },
    blocks: [
      createGreeting(),
      createQuestion({
        prompt: 'How are you feeling about the course so far?',
        helpText: 'Choose the option that best reflects your current experience.',
        type: 'multiple-choice',
        options: [createOption('I feel confident'), createOption('I am making progress'), createOption('I need more support')]
      }),
      createPhase({
        title: 'Study routine',
        description: 'These questions help me make the next part of your plan more realistic.'
      }),
      createQuestion({
        prompt: 'What has helped you learn the most recently?',
        type: 'long-answer',
        required: false
      }),
      createGoodbye()
    ]
  });

  let state = defaultState();
  let previewPageIndex = 0;
  let lastMessageTimer = null;
  let dragSourceId = null;
  let phaseModalState = null;

  const els = {
    title: document.getElementById('formTitle'),
    audience: document.getElementById('formAudience'),
    description: document.getElementById('formDescription'),
    respondentDetailsCard: document.getElementById('respondentDetailsCard'),
    respondentDetailsBody: document.getElementById('respondentDetailsBody'),
    toggleRespondentDetails: document.getElementById('toggleRespondentDetailsBtn'),
    respondentFields: document.getElementById('respondentFields'),
    blockList: document.getElementById('blockList'),
    formPreview: document.getElementById('formPreview'),
    previewPageCount: document.getElementById('previewPageCount'),
    previewPrevious: document.getElementById('previewPreviousBtn'),
    previewNext: document.getElementById('previewNextBtn'),
    addGreeting: document.getElementById('addGreetingBtn'),
    addQuestion: document.getElementById('addQuestionBtn'),
    addPhase: document.getElementById('addPhaseBtn'),
    addGoodbye: document.getElementById('addGoodbyeBtn'),
    saveDraft: document.getElementById('saveDraftBtn'),
    loadDraft: document.getElementById('loadDraftBtn'),
    exportJson: document.getElementById('exportJsonBtn'),
    importJson: document.getElementById('importJsonInput'),
    openStudentView: document.getElementById('openStudentViewBtn'),
    resetForm: document.getElementById('resetFormBtn'),
    message: document.getElementById('builderMessage'),
    countPill: document.getElementById('blockCountPill'),
    phaseModal: document.getElementById('phaseModal'),
    routingHelp: document.getElementById('routingHelp'),
    phaseModalContent: document.getElementById('phaseModalContent'),
    phaseModalActions: document.getElementById('phaseModalActions'),
    phaseModalTitle: document.getElementById('phaseModalTitle'),
    phaseModalSubtitle: document.getElementById('phaseModalSubtitle')
  };

  init();

  function init() {
    normalizeState();
    bindStaticEvents();
    renderAll();
  }

  function bindStaticEvents() {
    els.title.addEventListener('input', () => updateMeta('title', els.title.value));
    els.audience.addEventListener('input', () => updateMeta('audience', els.audience.value));
    els.description.addEventListener('input', () => updateMeta('description', els.description.value));

    els.toggleRespondentDetails.addEventListener('click', toggleRespondentDetails);
    els.respondentFields.addEventListener('change', handleIdentityChange);

    els.addGreeting.addEventListener('click', () => addBlock('greeting'));
    els.addQuestion.addEventListener('click', () => addBlock('question'));
    els.addPhase.addEventListener('click', () => openPhaseModal());
    els.addGoodbye.addEventListener('click', () => addBlock('goodbye'));

    els.previewPrevious.addEventListener('click', () => {
      previewPageIndex -= 1;
      renderPreview();
    });

    els.previewNext.addEventListener('click', () => {
      previewPageIndex += 1;
      renderPreview();
    });

    els.formPreview.addEventListener('click', (event) => {
      if (!event.target.closest('.form-builder-preview-cta')) return;
      const pages = buildPreviewPages();
      if (previewPageIndex < pages.length - 1) {
        previewPageIndex += 1;
        renderPreview();
      }
    });

    els.saveDraft.addEventListener('click', saveDraft);
    els.loadDraft.addEventListener('click', loadDraft);
    els.exportJson.addEventListener('click', exportJson);
    els.importJson.addEventListener('change', importJson);
    els.openStudentView.addEventListener('click', openStudentView);
    els.resetForm.addEventListener('click', resetForm);

    els.blockList.addEventListener('input', handleBlockInput);
    els.blockList.addEventListener('change', handleBlockChange);
    els.blockList.addEventListener('click', handleBlockClick);
    bindDragEvents();

    els.phaseModal.addEventListener('click', handleModalClick);
    els.phaseModal.addEventListener('input', handleModalInput);
    els.phaseModal.addEventListener('change', handleModalChange);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.phaseModal.classList.contains('is-open')) closePhaseModal();
    });
  }

  function bindDragEvents() {
    els.blockList.addEventListener('dragstart', (event) => {
      const handle = event.target.closest('[data-drag-handle]');
      if (!handle) {
        event.preventDefault();
        return;
      }
      const card = handle.closest('[data-block-id]');
      const block = getBlockById(card?.dataset.blockId);
      if (!block || isAnchoredBlock(block)) {
        event.preventDefault();
        return;
      }
      dragSourceId = block.id;
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', block.id);
    });

    els.blockList.addEventListener('dragover', (event) => {
      if (!dragSourceId) return;
      const card = event.target.closest('[data-block-id]');
      if (!card || card.dataset.blockId === dragSourceId) return;
      const target = getBlockById(card.dataset.blockId);
      if (!target || isAnchoredBlock(target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearDropTargets();
      card.classList.add('is-drop-target');
    });

    els.blockList.addEventListener('dragleave', (event) => {
      const card = event.target.closest('[data-block-id]');
      if (card && !card.contains(event.relatedTarget)) card.classList.remove('is-drop-target');
    });

    els.blockList.addEventListener('drop', (event) => {
      if (!dragSourceId) return;
      const targetCard = event.target.closest('[data-block-id]');
      const sourceId = dragSourceId;
      clearDropTargets();
      event.preventDefault();
      if (!targetCard || targetCard.dataset.blockId === sourceId) return;
      const sourceIndex = state.blocks.findIndex((block) => block.id === sourceId);
      const targetIndex = state.blocks.findIndex((block) => block.id === targetCard.dataset.blockId);
      if (sourceIndex < 0 || targetIndex < 0) return;

      const rect = targetCard.getBoundingClientRect();
      const targetAfter = event.clientY > rect.top + rect.height / 2;
      let insertionIndex = targetIndex + (targetAfter ? 1 : 0);
      if (sourceIndex < insertionIndex) insertionIndex -= 1;
      reorderBlock(sourceIndex, insertionIndex);
    });

    els.blockList.addEventListener('dragend', () => {
      dragSourceId = null;
      clearDropTargets();
      els.blockList.querySelectorAll('.is-dragging').forEach((card) => card.classList.remove('is-dragging'));
    });
  }

  function clearDropTargets() {
    els.blockList.querySelectorAll('.is-drop-target').forEach((card) => card.classList.remove('is-drop-target'));
  }

  function createId(prefix = 'block') {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createOption(label = 'Option') {
    return { id: createId('option'), label };
  }

  function createGreeting(overrides = {}) {
    return {
      id: createId('greeting'),
      kind: 'greeting',
      title: 'Welcome',
      body: 'Thank you for taking a few minutes to answer this form. Your responses will help me improve our next steps together.',
      buttonText: 'Start form',
      collapsed: true,
      ...overrides
    };
  }

  function createQuestion(overrides = {}) {
    return {
      id: createId('question'),
      kind: 'question',
      prompt: 'Untitled question',
      helpText: '',
      type: 'short-answer',
      required: true,
      options: [createOption('Option 1'), createOption('Option 2')],
      collapsed: true,
      ...overrides
    };
  }

  function createPhase(overrides = {}) {
    return {
      id: createId('phase'),
      kind: 'phase',
      title: 'New phase',
      description: 'Introduce the next group of questions here.',
      triggers: [],
      collapsed: true,
      ...overrides
    };
  }

  function createGoodbye(overrides = {}) {
    return {
      id: createId('goodbye'),
      kind: 'goodbye',
      title: 'Thank you',
      body: 'Your answers have been received. I will use them to better support your learning.',
      buttonText: 'Submit form',
      collapsed: true,
      ...overrides
    };
  }

  function defaultTriggerDraft() {
    return {
      id: createId('trigger'),
      sourcePhaseId: '',
      kind: 'phase-complete',
      questionId: '',
      matcher: {
        type: 'equals-option',
        optionId: '',
        optionIds: [],
        operator: '>=',
        value: '',
        secondValue: ''
      }
    };
  }

  function updateMeta(key, value) {
    state.meta[key] = value;
    renderPreview();
  }

  function hydrateMetaFields() {
    els.title.value = state.meta.title;
    els.audience.value = state.meta.audience;
    els.description.value = state.meta.description;
  }

  function toggleRespondentDetails() {
    const collapsed = els.respondentDetailsCard.classList.toggle('is-collapsed');
    els.toggleRespondentDetails.textContent = collapsed ? 'Maximize' : 'Minimize';
    els.toggleRespondentDetails.setAttribute('aria-expanded', String(!collapsed));
    els.respondentDetailsBody.setAttribute('aria-hidden', String(collapsed));
    if (collapsed) els.respondentDetailsBody.setAttribute('inert', '');
    else els.respondentDetailsBody.removeAttribute('inert');
  }

  function handleIdentityChange(event) {
    const input = event.target.closest('[data-identity-field]');
    if (!input) return;
    const field = input.dataset.identityField;
    const key = input.dataset.identityKey;
    if (!state.meta.respondentDetails[field]) return;
    state.meta.respondentDetails[field][key] = input.checked;
    if (key === 'enabled' && !input.checked) {
      state.meta.respondentDetails[field].required = false;
      state.meta.respondentDetails[field].verify = false;
    }
    if ((key === 'required' || key === 'verify') && input.checked) state.meta.respondentDetails[field].enabled = true;
    renderIdentityFields();
    renderPreview();
  }

  function renderIdentityFields() {
    const details = state.meta.respondentDetails;
    els.respondentFields.innerHTML = Object.entries(IDENTITY_FIELDS).map(([key, info]) => {
      const config = details[key];
      return `
        <article class="form-builder-identity-row">
          <div>
            <h3>${escapeHtml(info.label)}</h3>
            <p>${escapeHtml(info.helper)}</p>
          </div>
          <div class="form-builder-identity-options">
            <label class="form-builder-check-control">
              <input type="checkbox" data-identity-field="${key}" data-identity-key="enabled" ${config.enabled ? 'checked' : ''} />
              Collect
            </label>
            <label class="form-builder-check-control">
              <input type="checkbox" data-identity-field="${key}" data-identity-key="required" ${config.required ? 'checked' : ''} ${config.enabled ? '' : 'disabled'} />
              Required
            </label>
            ${info.supportsVerify ? `
              <label class="form-builder-check-control">
                <input type="checkbox" data-identity-field="${key}" data-identity-key="verify" ${config.verify ? 'checked' : ''} ${config.enabled ? '' : 'disabled'} />
                Verify later
              </label>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  function renderAll({ enteringId = null } = {}) {
    normalizeState();
    hydrateMetaFields();
    renderIdentityFields();
    renderBlockList();
    renderPreview();
    updateAddButtons();
    els.countPill.textContent = `${state.blocks.length} ${state.blocks.length === 1 ? 'block' : 'blocks'}`;
    if (enteringId) animateEntry(enteringId);
  }

  function renderBlockList() {
    if (!state.blocks.length) {
      els.blockList.innerHTML = `
        <div class="form-builder-empty-state">
          <p>Add a question to begin, then use phases to split the student-facing form into clear steps.</p>
        </div>
      `;
      return;
    }

    const questionNumbers = getQuestionNumbers();
    els.blockList.innerHTML = state.blocks
      .map((block, index) => renderBlockCard(block, index, questionNumbers.get(block.id)))
      .join('');
  }

  function getQuestionNumbers() {
    const questionNumbers = new Map();
    let number = 0;
    state.blocks.forEach((block) => {
      if (block.kind === 'question') {
        number += 1;
        questionNumbers.set(block.id, number);
      }
    });
    return questionNumbers;
  }

  function renderBlockCard(block, index, questionNumber) {
    const kindLabels = {
      greeting: 'Greeting page',
      question: `Question ${questionNumber}`,
      phase: 'Phase / new page',
      goodbye: 'Goodbye page'
    };

    const subtitle = {
      greeting: 'Set the first impression and explain the form.',
      question: QUESTION_TYPES[block.type]?.helper || 'Collect one response.',
      phase: block.triggers?.length ? 'This phase opens only when a configured trigger matches.' : 'This phase follows the normal respondent flow.',
      goodbye: 'Confirm submission and close the form.'
    }[block.kind];

    const canDrag = !isAnchoredBlock(block);
    return `
      <article class="form-builder-block-card${block.collapsed ? ' is-collapsed' : ''}" data-block-id="${escapeAttribute(block.id)}">
        <header class="form-builder-block-header">
          <div class="form-builder-block-header-main">
            <div class="form-builder-block-header-title-row">
              <span class="form-builder-block-kind">${kindLabels[block.kind]}</span>
              <h3>${escapeHtml(getBlockHeaderTitle(block, questionNumber))}</h3>
            </div>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <div class="form-builder-block-actions">
            ${canDrag ? `<button type="button" class="form-builder-drag-handle" draggable="true" data-drag-handle aria-label="Drag block to reorder" title="Drag to reorder">⠿</button>` : ''}
            <button type="button" class="form-builder-icon-button" data-action="move-up" aria-label="Move block up" title="Move up" ${canMove(index, -1) ? '' : 'disabled'}>↑</button>
            <button type="button" class="form-builder-icon-button" data-action="move-down" aria-label="Move block down" title="Move down" ${canMove(index, 1) ? '' : 'disabled'}>↓</button>
            ${block.kind === 'question' ? '<button type="button" class="form-builder-icon-button" data-action="duplicate" aria-label="Duplicate question" title="Duplicate">⧉</button>' : ''}
            <button type="button" class="form-builder-icon-button" data-action="toggle" aria-label="${block.collapsed ? 'Expand block' : 'Collapse block'}" title="${block.collapsed ? 'Expand' : 'Collapse'}">${block.collapsed ? '⌄' : '–'}</button>
            <button type="button" class="form-builder-icon-button danger" data-action="remove" aria-label="Remove block" title="Remove">×</button>
          </div>
        </header>
        <div class="form-builder-block-body">
          <div class="form-builder-block-body-inner">
            ${renderBlockBody(block)}
          </div>
        </div>
      </article>
    `;
  }

  function getBlockHeaderTitle(block, questionNumber) {
    if (block.kind === 'question') return block.prompt?.trim() || `Question ${questionNumber}`;
    return block.title?.trim() || (block.kind === 'phase' ? 'Untitled phase' : 'Untitled page');
  }

  function renderBlockBody(block) {
    if (block.kind === 'greeting') {
      return `
        <div class="form-builder-input-group">
          <label>Greeting title</label>
          <input type="text" data-field="title" value="${escapeAttribute(block.title)}" placeholder="Example: Welcome" />
        </div>
        <div class="form-builder-input-group">
          <label>Message</label>
          <textarea rows="4" data-field="body" placeholder="Explain the purpose of this form.">${escapeHtml(block.body)}</textarea>
        </div>
        <div class="form-builder-input-group">
          <label>Start button label</label>
          <input type="text" data-field="buttonText" value="${escapeAttribute(block.buttonText)}" placeholder="Example: Start form" />
        </div>
        <p class="form-builder-block-note">The mandatory Privacy Notice and Data Use Terms appear immediately above this page's start button.</p>
      `;
    }

    if (block.kind === 'phase') {
      return renderPhaseBody(block);
    }

    if (block.kind === 'goodbye') {
      return `
        <div class="form-builder-input-group">
          <label>Goodbye title</label>
          <input type="text" data-field="title" value="${escapeAttribute(block.title)}" placeholder="Example: Thank you" />
        </div>
        <div class="form-builder-input-group">
          <label>Message after submission</label>
          <textarea rows="4" data-field="body" placeholder="Explain what happens after the respondent submits.">${escapeHtml(block.body)}</textarea>
        </div>
        <div class="form-builder-input-group">
          <label>Submit button label</label>
          <input type="text" data-field="buttonText" value="${escapeAttribute(block.buttonText)}" placeholder="Example: Submit form" />
        </div>
      `;
    }

    return `
      <div class="form-builder-input-group">
        <label>Question</label>
        <textarea rows="3" data-field="prompt" placeholder="Write the question respondents should answer.">${escapeHtml(block.prompt)}</textarea>
      </div>

      <div class="form-builder-input-group">
        <label>Optional support text</label>
        <input type="text" data-field="helpText" value="${escapeAttribute(block.helpText)}" placeholder="Example: Choose the option that best describes you." />
      </div>

      <div class="form-builder-field-grid">
        <div class="form-builder-input-group">
          <label>Question type</label>
          <select data-field="type">
            ${Object.entries(QUESTION_TYPES)
              .map(([value, info]) => `<option value="${value}" ${block.type === value ? 'selected' : ''}>${info.label}</option>`)
              .join('')}
          </select>
        </div>
        <label class="form-builder-question-required">
          <input type="checkbox" data-field="required" ${block.required ? 'checked' : ''} />
          <span>
            <strong>Required answer</strong>
            <small>Respondent must answer before continuing.</small>
          </span>
        </label>
      </div>

      ${renderQuestionOptions(block)}
    `;
  }

  function renderPhaseBody(phase) {
    const isConditional = Array.isArray(phase.triggers) && phase.triggers.length;
    const routeList = isConditional
      ? phase.triggers.map((trigger) => `<span class="form-builder-route-chip">${escapeHtml(getTriggerLabel(trigger))}</span>`).join('')
      : '<p>This is a normal-flow phase. It appears when the current route has no eligible conditional destination.</p>';
    return `
      <section class="form-builder-route-summary${isConditional ? '' : ' is-normal'}">
        <div>
          <span class="form-builder-route-badge">${isConditional ? `${phase.triggers.length} trigger${phase.triggers.length === 1 ? '' : 's'}` : 'Normal flow'}</span>
          <h4>${escapeHtml(phase.title || 'Untitled phase')}</h4>
          <p>${escapeHtml(phase.description || 'No phase introduction yet.')}</p>
        </div>
        <div class="form-builder-route-list">${routeList}</div>
        <div class="form-builder-inline-actions">
          <button type="button" class="form-builder-btn form-builder-btn-secondary form-builder-small-btn" data-action="configure-phase">Configure phase and routing</button>
        </div>
      </section>
      <p class="form-builder-block-note">Questions directly below this block belong to this phase until the next phase begins. Conditional targets can only reference earlier phases.</p>
    `;
  }

  function renderQuestionOptions(block) {
    if (block.type === 'true-false') {
      return `
        <section class="form-builder-options-box">
          <div class="form-builder-options-header">
            <div>
              <h4>Answer options</h4>
              <p>True / false questions use these fixed choices.</p>
            </div>
          </div>
          <div class="form-builder-static-options"><span class="form-builder-static-option">True</span><span class="form-builder-static-option">False</span></div>
        </section>
      `;
    }

    if (!['multiple-choice', 'multiple-answer'].includes(block.type)) return '';

    return `
      <section class="form-builder-options-box">
        <div class="form-builder-options-header">
          <div>
            <h4>Answer options</h4>
            <p>${block.type === 'multiple-answer' ? 'Respondents may select more than one option. Conditional rules can require an exact set.' : 'Respondents select one option.'}</p>
          </div>
          <button type="button" class="form-builder-btn form-builder-btn-secondary form-builder-small-btn" data-action="add-option">Add option</button>
        </div>
        <div class="form-builder-options-list">
          ${block.options.map((option, optionIndex) => `
            <div class="form-builder-option-row">
              <span class="form-builder-option-marker" aria-hidden="true">${String.fromCharCode(65 + optionIndex)}</span>
              <input type="text" value="${escapeAttribute(option.label)}" data-option-id="${escapeAttribute(option.id)}" placeholder="Option ${optionIndex + 1}" />
              <button type="button" class="form-builder-option-remove" data-action="remove-option" data-option-id="${escapeAttribute(option.id)}" aria-label="Remove option ${optionIndex + 1}" ${block.options.length <= 2 ? 'disabled' : ''}>×</button>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function handleBlockInput(event) {
    const card = event.target.closest('[data-block-id]');
    if (!card) return;
    const block = getBlockById(card.dataset.blockId);
    if (!block) return;

    const optionId = event.target.dataset.optionId;
    if (optionId) {
      const option = block.options.find((item) => item.id === optionId);
      if (option) option.label = event.target.value;
      renderPreview();
      return;
    }

    const field = event.target.dataset.field;
    if (!field || event.target.type === 'checkbox' || event.target.tagName === 'SELECT') return;
    block[field] = event.target.value;
    refreshBlockHeader(card, block);
    renderPreview();
  }

  function refreshBlockHeader(card, block) {
    const title = card.querySelector('.form-builder-block-header h3');
    if (!title) return;
    if (block.kind === 'question') title.textContent = block.prompt?.trim() || 'Untitled question';
    if (['greeting', 'goodbye'].includes(block.kind)) title.textContent = block.title?.trim() || 'Untitled page';
  }

  function handleBlockChange(event) {
    const card = event.target.closest('[data-block-id]');
    if (!card) return;
    const block = getBlockById(card.dataset.blockId);
    if (!block) return;

    const field = event.target.dataset.field;
    if (!field) return;

    if (event.target.type === 'checkbox') {
      block[field] = event.target.checked;
      renderPreview();
      return;
    }

    if (event.target.tagName === 'SELECT') {
      const previousType = block.type;
      block[field] = event.target.value;
      if (['multiple-choice', 'multiple-answer'].includes(block.type) && block.options.length < 2) {
        block.options = [createOption('Option 1'), createOption('Option 2')];
      }
      if (previousType !== block.type) {
        const removed = removeTriggersReferencingQuestion(block.id);
        if (removed) showMessage('A routing trigger was removed because this question type changed.', true);
      }
      renderAll();
    }
  }

  function handleBlockClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-block-id]');
    if (!card) return;
    const blockId = card.dataset.blockId;
    const index = state.blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;

    const action = button.dataset.action;
    const block = state.blocks[index];

    if (action === 'toggle') {
      block.collapsed = !block.collapsed;
      card.classList.toggle('is-collapsed', block.collapsed);
      button.textContent = block.collapsed ? '⌄' : '–';
      button.title = block.collapsed ? 'Expand' : 'Collapse';
      button.setAttribute('aria-label', block.collapsed ? 'Expand block' : 'Collapse block');
      return;
    }

    if (action === 'move-up') { moveBlock(index, -1); return; }
    if (action === 'move-down') { moveBlock(index, 1); return; }
    if (action === 'configure-phase') { openPhaseModal(block.id); return; }

    if (action === 'remove') {
      animateRemoval(card, () => {
        const removedBlock = state.blocks[index];
        state.blocks.splice(index, 1);
        const removedTriggers = removedBlock.kind === 'question'
          ? removeTriggersReferencingQuestion(removedBlock.id)
          : pruneInvalidTriggers();
        renderAll();
        showMessage(removedTriggers ? 'Block removed. Broken routing triggers were also removed.' : 'Block removed.');
      });
      return;
    }

    if (action === 'duplicate') {
      const duplicate = duplicateQuestion(block);
      state.blocks.splice(index + 1, 0, duplicate);
      renderAll({ enteringId: duplicate.id });
      showMessage('Question duplicated. Routing rules remain connected to the original question.');
      return;
    }

    if (action === 'add-option') {
      block.options.push(createOption(`Option ${block.options.length + 1}`));
      renderAll();
      return;
    }

    if (action === 'remove-option') {
      const optionId = button.dataset.optionId;
      if (block.options.length <= 2) return;
      block.options = block.options.filter((option) => option.id !== optionId);
      const removed = removeTriggersReferencingOption(block.id, optionId);
      renderAll();
      showMessage(removed ? 'Option and its routing trigger(s) removed.' : 'Option removed.');
    }
  }

  function duplicateQuestion(question) {
    const clone = structuredCloneSafe(question);
    clone.id = createId('question');
    clone.collapsed = true;
    clone.options = (clone.options || []).map((option) => ({ id: createId('option'), label: option.label }));
    return createQuestion(clone);
  }

  function addBlock(kind) {
    let newBlock = null;
    if (kind === 'greeting') {
      if (state.blocks.some((block) => block.kind === 'greeting')) {
        showMessage('This form already has a greeting page.', true);
        return;
      }
      newBlock = createGreeting();
      state.blocks.unshift(newBlock);
      showMessage('Greeting page added at the start of the form.');
    }

    if (kind === 'goodbye') {
      if (state.blocks.some((block) => block.kind === 'goodbye')) {
        showMessage('This form already has a goodbye page.', true);
        return;
      }
      newBlock = createGoodbye();
      state.blocks.push(newBlock);
      showMessage('Goodbye page added at the end of the form.');
    }

    if (kind === 'question') {
      newBlock = createQuestion();
      insertBeforeGoodbye(newBlock);
      showMessage('Question added.');
    }

    if (newBlock) renderAll({ enteringId: newBlock.id });
  }

  function insertBeforeGoodbye(block) {
    const goodbyeIndex = state.blocks.findIndex((item) => item.kind === 'goodbye');
    if (goodbyeIndex === -1) state.blocks.push(block);
    else state.blocks.splice(goodbyeIndex, 0, block);
  }

  function animateEntry(blockId) {
    const card = els.blockList.querySelector(`[data-block-id="${cssEscape(blockId)}"]`);
    if (!card) return;
    card.style.height = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-10px)';
    requestAnimationFrame(() => {
      card.style.height = `${card.scrollHeight}px`;
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
    window.setTimeout(() => {
      card.style.height = '';
      card.style.opacity = '';
      card.style.transform = '';
    }, TRANSITION_MS + 60);
  }

  function animateRemoval(card, callback) {
    card.style.height = `${card.offsetHeight}px`;
    card.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      card.style.height = '0px';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-10px)';
    });
    window.setTimeout(callback, TRANSITION_MS + 30);
  }

  function isAnchoredBlock(block) { return block.kind === 'greeting' || block.kind === 'goodbye'; }

  function canMove(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.blocks.length) return false;
    const current = state.blocks[index];
    const target = state.blocks[targetIndex];
    return !isAnchoredBlock(current) && !isAnchoredBlock(target);
  }

  function moveBlock(index, direction) {
    if (!canMove(index, direction)) return;
    reorderBlock(index, index + direction);
  }

  function reorderBlock(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= state.blocks.length) return;
    const before = captureBlockPositions();
    const [block] = state.blocks.splice(fromIndex, 1);
    state.blocks.splice(toIndex, 0, block);
    const removedTriggers = pruneInvalidTriggers();
    renderAll();
    animateFlip(before, block.id);
    showMessage(removedTriggers ? 'Block moved. Routing rules that became invalid were removed.' : 'Block moved.');
  }

  function captureBlockPositions() {
    return new Map([...els.blockList.querySelectorAll('[data-block-id]')].map((card) => {
      const rect = card.getBoundingClientRect();
      return [card.dataset.blockId, { top: rect.top, left: rect.left }];
    }));
  }

  function animateFlip(before, focusId) {
    [...els.blockList.querySelectorAll('[data-block-id]')].forEach((card) => {
      const first = before.get(card.dataset.blockId);
      if (!first) return;
      const last = card.getBoundingClientRect();
      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;
      if (!deltaX && !deltaY) return;
      card.style.transition = 'none';
      card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      requestAnimationFrame(() => {
        card.style.transition = '';
        card.style.transform = '';
      });
    });
    const focusCard = els.blockList.querySelector(`[data-block-id="${cssEscape(focusId)}"]`);
    if (focusCard) {
      focusCard.classList.add('is-moving');
      window.setTimeout(() => focusCard.classList.remove('is-moving'), 700);
    }
  }

  function getBlockById(id) { return state.blocks.find((block) => block.id === id); }

  function normalizeState() {
    if (!state || typeof state !== 'object') state = defaultState();
    if (!state.meta || typeof state.meta !== 'object') state.meta = defaultState().meta;
    if (!Array.isArray(state.blocks)) state.blocks = [];

    const legacyCollectName = Boolean(state.meta.collectName);
    state.meta = {
      title: String(state.meta.title ?? ''),
      audience: String(state.meta.audience ?? ''),
      description: String(state.meta.description ?? ''),
      respondentDetails: normalizeIdentity(state.meta.respondentDetails, legacyCollectName)
    };

    let greetingUsed = false;
    let goodbyeUsed = false;
    state.blocks = state.blocks
      .filter((block) => block && typeof block === 'object' && ['greeting', 'question', 'phase', 'goodbye'].includes(block.kind))
      .map((block) => {
        if (block.kind === 'greeting') {
          if (greetingUsed) return null;
          greetingUsed = true;
          return createGreeting({ ...block, id: block.id || createId('greeting'), collapsed: Boolean(block.collapsed) });
        }
        if (block.kind === 'goodbye') {
          if (goodbyeUsed) return null;
          goodbyeUsed = true;
          return createGoodbye({ ...block, id: block.id || createId('goodbye'), collapsed: Boolean(block.collapsed) });
        }
        if (block.kind === 'phase') {
          return createPhase({
            ...block,
            id: block.id || createId('phase'),
            triggers: normalizeTriggers(block.triggers),
            collapsed: Boolean(block.collapsed)
          });
        }
        const type = QUESTION_TYPES[block.type] ? block.type : 'short-answer';
        const options = normalizeOptions(block.options);
        return createQuestion({
          ...block,
          id: block.id || createId('question'),
          type,
          options: options.length >= 2 ? options : [createOption('Option 1'), createOption('Option 2')],
          collapsed: Boolean(block.collapsed),
          required: block.required !== false
        });
      })
      .filter(Boolean);

    const greeting = state.blocks.find((block) => block.kind === 'greeting');
    const goodbye = state.blocks.find((block) => block.kind === 'goodbye');
    const middle = state.blocks.filter((block) => block.kind !== 'greeting' && block.kind !== 'goodbye');
    state.blocks = [...(greeting ? [greeting] : []), ...middle, ...(goodbye ? [goodbye] : [])];
    pruneInvalidTriggers();
  }

  function normalizeIdentity(input, legacyCollectName) {
    const defaults = defaultIdentityState();
    const source = input && typeof input === 'object' ? input : {};
    Object.keys(defaults).forEach((field) => {
      const raw = source[field] || {};
      defaults[field] = {
        enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : (field === 'fullName' ? legacyCollectName : false),
        required: raw.required !== undefined ? Boolean(raw.required) : (field === 'fullName' ? legacyCollectName : false),
        verify: Boolean(raw.verify)
      };
      if (!defaults[field].enabled) {
        defaults[field].required = false;
        defaults[field].verify = false;
      }
    });
    return defaults;
  }

  function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map((option, index) => {
      if (typeof option === 'string') return { id: createId('option'), label: option || `Option ${index + 1}` };
      return { id: option?.id || createId('option'), label: String(option?.label ?? option?.text ?? `Option ${index + 1}`) };
    });
  }

  function normalizeTriggers(triggers) {
    if (!Array.isArray(triggers)) return [];
    return triggers.map((trigger) => {
      const matcher = trigger?.matcher || {};
      return {
        id: trigger?.id || createId('trigger'),
        sourcePhaseId: String(trigger?.sourcePhaseId || ''),
        kind: trigger?.kind === 'answer' ? 'answer' : 'phase-complete',
        questionId: String(trigger?.questionId || ''),
        matcher: {
          type: String(matcher.type || 'equals-option'),
          optionId: String(matcher.optionId || ''),
          optionIds: Array.isArray(matcher.optionIds) ? matcher.optionIds.map(String).sort() : [],
          operator: String(matcher.operator || '>='),
          value: matcher.value === undefined ? '' : String(matcher.value),
          secondValue: matcher.secondValue === undefined ? '' : String(matcher.secondValue)
        }
      };
    });
  }

  function getPhaseIndex(phaseId) { return state.blocks.findIndex((block) => block.kind === 'phase' && block.id === phaseId); }

  function getQuestionsForPhase(phaseId) {
    const start = getPhaseIndex(phaseId);
    if (start < 0) return [];
    const result = [];
    for (let index = start + 1; index < state.blocks.length; index += 1) {
      const block = state.blocks[index];
      if (block.kind === 'phase' || block.kind === 'goodbye') break;
      if (block.kind === 'question') result.push(block);
    }
    return result;
  }

  function getOptionSet(question) {
    if (question.type === 'true-false') return [
      { id: 'true', label: 'True' },
      { id: 'false', label: 'False' }
    ];
    return question.options || [];
  }

  function isValidTriggerForTarget(trigger, targetPhase) {
    if (!targetPhase || targetPhase.kind !== 'phase' || !trigger?.sourcePhaseId) return false;
    const sourceIndex = getPhaseIndex(trigger.sourcePhaseId);
    const targetIndex = getPhaseIndex(targetPhase.id);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= targetIndex) return false;
    if (trigger.kind === 'phase-complete') return true;
    if (trigger.kind !== 'answer' || !trigger.questionId) return false;
    const question = getQuestionsForPhase(trigger.sourcePhaseId).find((item) => item.id === trigger.questionId);
    if (!question || !QUESTION_TYPES[question.type]?.routable) return false;
    if (question.type === 'number') {
      const operator = trigger.matcher?.operator;
      const first = Number(trigger.matcher?.value);
      const second = Number(trigger.matcher?.secondValue);
      if (!['=', '>', '<', '>=', '<=', 'between'].includes(operator) || Number.isNaN(first)) return false;
      return operator !== 'between' || (!Number.isNaN(second) && first <= second);
    }
    if (question.type === 'multiple-answer') {
      const ids = trigger.matcher?.optionIds || [];
      const options = getOptionSet(question).map((option) => option.id);
      return ids.length > 0 && ids.every((id) => options.includes(id));
    }
    const optionId = trigger.matcher?.optionId;
    return getOptionSet(question).some((option) => option.id === optionId);
  }

  function pruneInvalidTriggers() {
    let removed = 0;
    state.blocks.forEach((block) => {
      if (block.kind !== 'phase') return;
      const original = block.triggers || [];
      const next = original.filter((trigger) => isValidTriggerForTarget(trigger, block));
      removed += original.length - next.length;
      block.triggers = next;
    });
    return removed;
  }

  function removeTriggersReferencingQuestion(questionId) {
    let removed = 0;
    state.blocks.forEach((block) => {
      if (block.kind !== 'phase') return;
      const before = block.triggers.length;
      block.triggers = block.triggers.filter((trigger) => trigger.questionId !== questionId);
      removed += before - block.triggers.length;
    });
    return removed;
  }

  function removeTriggersReferencingOption(questionId, optionId) {
    let removed = 0;
    state.blocks.forEach((block) => {
      if (block.kind !== 'phase') return;
      const before = block.triggers.length;
      block.triggers = block.triggers.filter((trigger) => {
        if (trigger.questionId !== questionId) return true;
        if (trigger.matcher.type === 'exact-set') return !trigger.matcher.optionIds.includes(optionId);
        return trigger.matcher.optionId !== optionId;
      });
      removed += before - block.triggers.length;
    });
    return removed;
  }

  function buildContentPages() {
    const middle = state.blocks.filter((block) => block.kind !== 'greeting' && block.kind !== 'goodbye');
    const pages = [];
    let current = null;
    let blockOrder = 0;

    middle.forEach((block) => {
      if (block.kind === 'phase') {
        if (current) pages.push(current);
        current = {
          id: `phase-page-${block.id}`,
          type: 'phase',
          phaseId: block.id,
          order: blockOrder,
          block,
          questions: []
        };
      }
      if (block.kind === 'question') {
        if (!current) {
          current = {
            id: 'initial-questions',
            type: 'questions',
            phaseId: null,
            order: blockOrder,
            block: { title: 'Questions', description: '' },
            questions: []
          };
        }
        current.questions.push(block);
      }
      blockOrder += 1;
    });

    if (current) pages.push(current);
    return pages;
  }

  function buildPreviewPages() {
    const pages = [];
    const greeting = state.blocks.find((block) => block.kind === 'greeting');
    const goodbye = state.blocks.find((block) => block.kind === 'goodbye');
    pages.push({ id: 'privacy', type: 'privacy', block: greeting || null, questions: [] });
    pages.push(...buildContentPages());
    if (goodbye) pages.push({ id: 'goodbye', type: 'goodbye', block: goodbye, questions: [] });
    if (pages.length === 1) pages.push({ id: 'empty', type: 'empty', block: null, questions: [] });
    return pages;
  }

  function renderPreview() {
    const pages = buildPreviewPages();
    previewPageIndex = Math.max(0, Math.min(previewPageIndex, pages.length - 1));
    const page = pages[previewPageIndex];

    els.previewPageCount.textContent = `Page ${previewPageIndex + 1} of ${pages.length}`;
    els.previewPrevious.disabled = previewPageIndex === 0;
    els.previewNext.disabled = previewPageIndex === pages.length - 1;
    els.previewNext.textContent = previewPageIndex === pages.length - 1 ? 'Done' : 'Next';
    els.formPreview.innerHTML = renderPreviewPage(page);
  }

  function renderPreviewPage(page) {
    const formHeader = `
      <div class="form-builder-preview-form-header">
        <h3>${escapeHtml(state.meta.title || 'Untitled form')}</h3>
        ${state.meta.audience ? `<p class="form-builder-preview-audience">${escapeHtml(state.meta.audience)}</p>` : ''}
        ${state.meta.description ? `<p class="form-builder-preview-description">${escapeHtml(state.meta.description)}</p>` : ''}
      </div>
    `;

    if (page.type === 'empty') return `${formHeader}<div class="form-builder-preview-empty"><p>Add a question or phase to see a student-facing form page here.</p></div>`;

    if (page.type === 'privacy') {
      const greeting = page.block;
      return `
        ${formHeader}
        <section class="form-builder-preview-confirmation">
          <h3>${escapeHtml(greeting?.title || 'Before we begin')}</h3>
          <p>${escapeHtml(greeting?.body || 'Please read the information below before continuing.')}</p>
          ${renderPreviewTerms()}
          <button type="button" class="form-builder-preview-cta">${escapeHtml(greeting?.buttonText || 'Start form')}</button>
        </section>
      `;
    }

    if (page.type === 'goodbye') {
      return `
        ${formHeader}
        <section class="form-builder-preview-confirmation">
          <h3>${escapeHtml(page.block.title || 'Thank you')}</h3>
          <p>${escapeHtml(page.block.body || 'Your submission message appears here.')}</p>
          <button type="button" class="form-builder-preview-cta">${escapeHtml(page.block.buttonText || 'Submit form')}</button>
        </section>
      `;
    }

    const routeNote = page.type === 'phase' && page.block.triggers?.length
      ? `<p class="form-builder-preview-route-note">Conditional phase: it appears only after one of its routing rules matches.</p>`
      : '';

    return `
      ${formHeader}
      ${routeNote}
      <h3 class="form-builder-preview-page-title">${escapeHtml(page.block.title || 'Questions')}</h3>
      ${page.block.description ? `<p class="form-builder-preview-page-copy">${escapeHtml(page.block.description)}</p>` : ''}
      ${previewPageIndex === firstContentPreviewIndex() ? renderIdentityPreview() : ''}
      <div class="form-builder-preview-question-list">
        ${page.questions.length ? page.questions.map(renderPreviewQuestion).join('') : '<div class="form-builder-preview-empty"><p>This phase has no questions yet. Add a question below it in the editor.</p></div>'}
      </div>
    `;
  }

  function renderPreviewTerms() {
    return `
      <div class="form-builder-preview-terms">
        <strong>Privacy Notice and Data Use Terms</strong>
        <p>Kelp uses the information in this form to provide tutoring support, communicate about the learning plan, and improve the service. Responses should be accessed only by authorised people and kept only as long as needed for the stated purpose.</p>
        <label class="form-builder-preview-consent"><input type="checkbox" /> <span>I have read and agree with the Privacy Notice and Data Use Terms.</span></label>
      </div>
    `;
  }

  function firstContentPreviewIndex() {
    const pages = buildPreviewPages();
    return pages.findIndex((page) => page.type === 'questions' || page.type === 'phase');
  }

  function renderIdentityPreview() {
    const details = state.meta.respondentDetails;
    const fields = Object.entries(IDENTITY_FIELDS).filter(([key]) => details[key].enabled);
    if (!fields.length) return '';
    return `
      <section class="form-builder-preview-identity">
        <h4>Respondent details</h4>
        ${fields.map(([key, info]) => `
          <div class="form-builder-preview-identity-field">
            <label>${escapeHtml(info.label)} ${details[key].required ? '<span class="form-builder-required-star">*</span>' : ''}</label>
            <input class="form-builder-preview-text-field" type="${info.inputType}" placeholder="${escapeAttribute(info.placeholder)}" />
          </div>
        `).join('')}
      </section>
    `;
  }

  function renderPreviewQuestion(question) {
    const prompt = escapeHtml(question.prompt || 'Untitled question');
    const help = question.helpText ? `<p class="form-builder-preview-question-help">${escapeHtml(question.helpText)}</p>` : '';
    const required = question.required ? '<span class="form-builder-required-star">*</span>' : '';
    let input = '';
    if (question.type === 'short-answer') input = '<input class="form-builder-preview-text-field" type="text" placeholder="Your answer" />';
    if (question.type === 'long-answer') input = '<textarea class="form-builder-preview-textarea" placeholder="Write your answer"></textarea>';
    if (question.type === 'number') input = '<input class="form-builder-preview-number-field" type="number" placeholder="Enter a number" />';
    if (question.type === 'true-false') input = renderPreviewChoices(question, getOptionSet(question), 'radio');
    if (question.type === 'multiple-choice') input = renderPreviewChoices(question, question.options, 'radio');
    if (question.type === 'multiple-answer') input = renderPreviewChoices(question, question.options, 'checkbox');

    return `<article class="form-builder-preview-question"><div class="form-builder-preview-question-label">${prompt} ${required}</div>${help}${input}</article>`;
  }

  function renderPreviewChoices(question, options, inputType) {
    const inputName = `preview-${escapeAttribute(question.id)}`;
    return `<div class="form-builder-preview-choice-list">${options.map((option) => `
      <label class="form-builder-preview-choice">
        <input type="${inputType}" name="${inputName}" />
        <span>${escapeHtml(option.label || 'Untitled option')}</span>
      </label>
    `).join('')}</div>`;
  }

  function updateAddButtons() {
    els.addGreeting.disabled = state.blocks.some((block) => block.kind === 'greeting');
    els.addGoodbye.disabled = state.blocks.some((block) => block.kind === 'goodbye');
  }

  function openPhaseModal(phaseId = null) {
    const existing = phaseId ? getBlockById(phaseId) : null;
    if (phaseId && (!existing || existing.kind !== 'phase')) return;
    phaseModalState = {
      mode: existing ? 'edit' : 'create',
      phaseId: existing?.id || null,
      draft: existing ? structuredCloneSafe(existing) : createPhase(),
      step: 'details',
      routingMode: existing?.triggers?.length ? 'conditional' : 'normal',
      triggerDraft: defaultTriggerDraft(),
      message: ''
    };
    els.routingHelp.hidden = true;
    els.phaseModal.classList.add('is-open');
    els.phaseModal.setAttribute('aria-hidden', 'false');
    renderPhaseModal();
    window.setTimeout(() => els.phaseModal.querySelector('input, textarea, select, button')?.focus(), 30);
  }

  function closePhaseModal() {
    els.phaseModal.classList.remove('is-open');
    els.phaseModal.setAttribute('aria-hidden', 'true');
    phaseModalState = null;
  }

  function renderPhaseModal() {
    if (!phaseModalState) return;
    const { mode, step } = phaseModalState;
    els.phaseModalTitle.textContent = mode === 'create' ? 'Add a phase' : 'Configure phase';
    els.phaseModalSubtitle.textContent = step === 'details'
      ? 'Set the page details, then decide whether this phase follows the normal flow or opens after one or more triggers.'
      : step === 'trigger'
        ? 'Choose a preceding phase, then describe the event that should open this phase.'
        : 'Review every trigger. Any matching trigger may open this phase.';

    if (step === 'details') renderPhaseDetailsStep();
    if (step === 'trigger') renderPhaseTriggerStep();
    if (step === 'review') renderPhaseReviewStep();
  }

  function renderPhaseDetailsStep() {
    const draft = phaseModalState.draft;
    const hasEarlier = getAvailableSourcePhases().length > 0;
    const noTriggerMessage = `No trigger will be added. This phase follows the normal form order and, if a conditional jump skips it, it is resumed later in FIFO order.`;
    els.phaseModalContent.innerHTML = `
      <div class="form-builder-modal-step">
        <div class="form-builder-modal-step-heading">
          <h3>1. Phase details</h3>
          <p>Every phase becomes a separate respondent page.</p>
        </div>
        <div class="form-builder-input-group">
          <label for="phaseDraftTitle">Phase title</label>
          <input id="phaseDraftTitle" type="text" data-modal-field="title" value="${escapeAttribute(draft.title)}" placeholder="Example: Learning preferences" />
        </div>
        <div class="form-builder-input-group">
          <label for="phaseDraftDescription">Short introduction</label>
          <textarea id="phaseDraftDescription" rows="4" data-modal-field="description" placeholder="Tell respondents what this page is about.">${escapeHtml(draft.description)}</textarea>
        </div>
        <div class="form-builder-routing-choice">
          <label class="form-builder-radio-card">
            <input type="radio" name="routingMode" value="normal" ${phaseModalState.routingMode === 'normal' ? 'checked' : ''} />
            <span><strong>Continue in the normal form order</strong><small>This phase opens after the active route finishes. It has no conditions.</small></span>
          </label>
          <label class="form-builder-radio-card">
            <input type="radio" name="routingMode" value="conditional" ${phaseModalState.routingMode === 'conditional' ? 'checked' : ''} ${hasEarlier ? '' : 'disabled'} />
            <span><strong>Open this phase after one or more triggers</strong><small>Select a preceding phase, then optionally match a question answer.</small></span>
          </label>
        </div>
        ${phaseModalState.routingMode === 'normal' ? `<div class="form-builder-modal-notice">${noTriggerMessage}</div>` : ''}
        ${!hasEarlier ? '<div class="form-builder-modal-notice is-warning">There is no preceding phase yet. Add at least one phase above this one before creating conditional routes.</div>' : ''}
        ${phaseModalState.message ? `<div class="form-builder-modal-notice is-error">${escapeHtml(phaseModalState.message)}</div>` : ''}
      </div>
    `;
    els.phaseModalActions.innerHTML = `
      <button type="button" class="form-builder-btn form-builder-btn-outline" data-modal-action="close">Cancel</button>
      <button type="button" class="form-builder-btn form-builder-btn-primary" data-modal-action="details-next">${phaseModalState.routingMode === 'conditional' ? 'Configure trigger' : (phaseModalState.mode === 'create' ? 'Add phase' : 'Save phase')}</button>
    `;
  }

  function renderPhaseTriggerStep() {
    const sources = getAvailableSourcePhases();
    const trigger = phaseModalState.triggerDraft;
    const source = sources.find((phase) => phase.id === trigger.sourcePhaseId);
    const questions = source ? getQuestionsForPhase(source.id) : [];
    const selectedQuestion = questions.find((question) => question.id === trigger.questionId);

    els.phaseModalContent.innerHTML = `
      <div class="form-builder-modal-step">
        <div class="form-builder-modal-step-heading">
          <h3>2. Add a trigger</h3>
          <p>The current phase is the destination. It can only reference a phase that appears above it in the builder.</p>
        </div>
        <div class="form-builder-trigger-fields">
          <div class="form-builder-input-group">
            <label for="triggerSourcePhase">This phase opens after</label>
            <select id="triggerSourcePhase" data-trigger-field="sourcePhaseId">
              <option value="">Select a preceding phase</option>
              ${sources.map((phase) => `<option value="${escapeAttribute(phase.id)}" ${trigger.sourcePhaseId === phase.id ? 'selected' : ''}>${escapeHtml(phase.title || 'Untitled phase')}</option>`).join('')}
            </select>
          </div>
          ${source ? renderTriggerTypeFields(source, questions, selectedQuestion, trigger) : '<p class="form-builder-block-note">Choose a phase first. Selecting only that phase creates a phase-completion trigger.</p>'}
        </div>
        ${phaseModalState.message ? `<div class="form-builder-modal-notice is-error">${escapeHtml(phaseModalState.message)}</div>` : ''}
      </div>
    `;
    els.phaseModalActions.innerHTML = `
      <button type="button" class="form-builder-btn form-builder-btn-outline" data-modal-action="trigger-back">Back</button>
      <button type="button" class="form-builder-btn form-builder-btn-primary" data-modal-action="save-trigger">Add trigger</button>
    `;
  }

  function renderTriggerTypeFields(source, questions, selectedQuestion, trigger) {
    const eligibleQuestions = questions.filter((question) => QUESTION_TYPES[question.type]?.routable);
    const answerFields = trigger.kind === 'answer' ? `
      <div class="form-builder-input-group">
        <label for="triggerQuestion">Question in “${escapeHtml(source.title || 'Untitled phase')}”</label>
        <select id="triggerQuestion" data-trigger-field="questionId">
          <option value="">Select a question</option>
          ${eligibleQuestions.map((question) => `<option value="${escapeAttribute(question.id)}" ${trigger.questionId === question.id ? 'selected' : ''}>${escapeHtml(question.prompt || 'Untitled question')} — ${escapeHtml(QUESTION_TYPES[question.type].label)}</option>`).join('')}
        </select>
      </div>
      ${selectedQuestion ? renderTriggerMatcher(selectedQuestion, trigger) : ''}
      ${!eligibleQuestions.length ? '<div class="form-builder-modal-notice is-warning">This source phase has no choice, true/false, or number question available for routing. Use phase completion instead.</div>' : ''}
    ` : '';

    return `
      <div class="form-builder-routing-choice">
        <label class="form-builder-radio-card">
          <input type="radio" name="triggerKind" value="phase-complete" ${trigger.kind === 'phase-complete' ? 'checked' : ''} />
          <span><strong>After this phase is completed</strong><small>The answer values do not matter. Completing the selected phase is enough.</small></span>
        </label>
        <label class="form-builder-radio-card">
          <input type="radio" name="triggerKind" value="answer" ${trigger.kind === 'answer' ? 'checked' : ''} ${eligibleQuestions.length ? '' : 'disabled'} />
          <span><strong>When an answer matches a condition</strong><small>The matched question must belong to this selected source phase.</small></span>
        </label>
      </div>
      ${answerFields}
    `;
  }

  function renderTriggerMatcher(question, trigger) {
    if (question.type === 'number') {
      const matcher = trigger.matcher;
      return `
        <div class="form-builder-trigger-condition">
          <p><strong>Number condition</strong> — select an operator and a value.</p>
          <div class="form-builder-number-condition">
            <div class="form-builder-input-group">
              <label for="numberOperator">Answer</label>
              <select id="numberOperator" data-matcher-field="operator">
                ${[['=', 'is equal to'], ['>', 'is greater than'], ['<', 'is less than'], ['>=', 'is at least'], ['<=', 'is at most'], ['between', 'is between']]
                  .map(([value, label]) => `<option value="${value}" ${matcher.operator === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </div>
            <div class="form-builder-input-group">
              <label for="numberValue">${matcher.operator === 'between' ? 'Lower value' : 'Value'}</label>
              <input id="numberValue" type="number" step="any" data-matcher-field="value" value="${escapeAttribute(matcher.value)}" placeholder="Example: 70" />
            </div>
          </div>
          ${matcher.operator === 'between' ? `
            <div class="form-builder-input-group">
              <label for="numberSecondValue">Upper value</label>
              <input id="numberSecondValue" type="number" step="any" data-matcher-field="secondValue" value="${escapeAttribute(matcher.secondValue)}" placeholder="Example: 100" />
            </div>
          ` : ''}
        </div>
      `;
    }

    const options = getOptionSet(question);
    if (question.type === 'multiple-answer') {
      const selected = new Set(trigger.matcher.optionIds || []);
      return `
        <div class="form-builder-trigger-condition">
          <p><strong>Exact selected set</strong> — the respondent must choose exactly these options, with no additional selections.</p>
          <div class="form-builder-exact-set">
            ${options.map((option) => `
              <label>
                <input type="checkbox" data-multiple-option="${escapeAttribute(option.id)}" ${selected.has(option.id) ? 'checked' : ''} />
                <span>${escapeHtml(option.label || 'Untitled option')}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="form-builder-trigger-condition">
        <p><strong>Exact answer</strong> — the selected answer must match this option.</p>
        <div class="form-builder-input-group">
          <label for="triggerOption">Answer is</label>
          <select id="triggerOption" data-matcher-field="optionId">
            <option value="">Select an answer</option>
            ${options.map((option) => `<option value="${escapeAttribute(option.id)}" ${trigger.matcher.optionId === option.id ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  }

  function renderPhaseReviewStep() {
    const triggers = phaseModalState.draft.triggers || [];
    const canAdd = canAddAnotherTrigger(phaseModalState.draft);
    els.phaseModalContent.innerHTML = `
      <div class="form-builder-modal-step">
        <div class="form-builder-modal-step-heading">
          <h3>3. Review routing</h3>
          <p>These triggers have an OR relationship: any one match can open this phase.</p>
        </div>
        <div class="form-builder-review-list">
          ${triggers.map((trigger) => `
            <div class="form-builder-review-trigger">
              <span>${escapeHtml(getTriggerLabel(trigger))}</span>
              <button type="button" class="form-builder-icon-button danger" data-modal-action="remove-trigger" data-trigger-id="${escapeAttribute(trigger.id)}" aria-label="Remove trigger" title="Remove trigger">×</button>
            </div>
          `).join('')}
        </div>
        ${hasNumericOverlap(triggers) ? '<p class="form-builder-overlap-warning">Some numeric rules overlap. When they lead to different phases, the closest target below the source phase wins.</p>' : ''}
        ${!canAdd ? '<div class="form-builder-modal-notice is-warning">All currently available discrete trigger outcomes have been used. Numeric conditions can remain open-ended, but duplicate rules are always blocked.</div>' : ''}
        ${phaseModalState.message ? `<div class="form-builder-modal-notice is-error">${escapeHtml(phaseModalState.message)}</div>` : ''}
      </div>
    `;
    els.phaseModalActions.innerHTML = `
      <button type="button" class="form-builder-btn form-builder-btn-outline" data-modal-action="review-back">Back</button>
      <button type="button" class="form-builder-btn form-builder-btn-secondary" data-modal-action="add-another-trigger" ${canAdd ? '' : 'disabled'}>Add another trigger</button>
      <button type="button" class="form-builder-btn form-builder-btn-primary" data-modal-action="save-phase">${phaseModalState.mode === 'create' ? 'Add phase' : 'Save phase'}</button>
    `;
  }

  function handleModalInput(event) {
    if (!phaseModalState) return;
    const field = event.target.dataset.modalField;
    if (field) phaseModalState.draft[field] = event.target.value;
    const matcherField = event.target.dataset.matcherField;
    if (matcherField) phaseModalState.triggerDraft.matcher[matcherField] = event.target.value;
  }

  function handleModalChange(event) {
    if (!phaseModalState) return;
    phaseModalState.message = '';
    if (event.target.name === 'routingMode') {
      phaseModalState.routingMode = event.target.value;
      renderPhaseModal();
      return;
    }
    if (event.target.name === 'triggerKind') {
      phaseModalState.triggerDraft.kind = event.target.value;
      if (event.target.value === 'phase-complete') phaseModalState.triggerDraft.questionId = '';
      renderPhaseModal();
      return;
    }

    const triggerField = event.target.dataset.triggerField;
    if (triggerField) {
      phaseModalState.triggerDraft[triggerField] = event.target.value;
      if (triggerField === 'sourcePhaseId') {
        phaseModalState.triggerDraft.questionId = '';
        phaseModalState.triggerDraft.matcher = defaultTriggerDraft().matcher;
      }
      if (triggerField === 'questionId') phaseModalState.triggerDraft.matcher = defaultTriggerDraft().matcher;
      renderPhaseModal();
      return;
    }

    const matcherField = event.target.dataset.matcherField;
    if (matcherField) {
      phaseModalState.triggerDraft.matcher[matcherField] = event.target.value;
      if (matcherField === 'operator') renderPhaseModal();
      return;
    }

    const optionId = event.target.dataset.multipleOption;
    if (optionId) {
      const selected = new Set(phaseModalState.triggerDraft.matcher.optionIds || []);
      if (event.target.checked) selected.add(optionId);
      else selected.delete(optionId);
      phaseModalState.triggerDraft.matcher.optionIds = [...selected].sort();
    }
  }

  function handleModalClick(event) {
    const actionButton = event.target.closest('[data-modal-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.modalAction;
    if (action === 'close') { closePhaseModal(); return; }
    if (action === 'toggle-help') {
      els.routingHelp.hidden = !els.routingHelp.hidden;
      return;
    }
    if (!phaseModalState) return;

    if (action === 'details-next') {
      if (!phaseModalState.draft.title.trim()) {
        phaseModalState.message = 'Give the phase a title before continuing.';
        renderPhaseModal();
        return;
      }
      if (phaseModalState.routingMode === 'normal') {
        phaseModalState.draft.triggers = [];
        savePhaseDraft();
      } else {
        if (!getAvailableSourcePhases().length) {
          phaseModalState.message = 'This phase needs an earlier phase before you can add a conditional trigger.';
          renderPhaseModal();
          return;
        }
        phaseModalState.step = 'trigger';
        phaseModalState.message = '';
        renderPhaseModal();
      }
      return;
    }

    if (action === 'trigger-back') {
      phaseModalState.step = 'details';
      phaseModalState.message = '';
      renderPhaseModal();
      return;
    }

    if (action === 'save-trigger') {
      const result = validateAndCreateTrigger(phaseModalState.triggerDraft);
      if (!result.ok) {
        phaseModalState.message = result.message;
        renderPhaseModal();
        return;
      }
      if (phaseModalState.draft.triggers.some((trigger) => areTriggersEqual(trigger, result.trigger))) {
        phaseModalState.message = 'This exact trigger is already in the list.';
        renderPhaseModal();
        return;
      }
      const redundancy = getTriggerRedundancyMessage(result.trigger, phaseModalState.draft);
      if (redundancy) {
        phaseModalState.message = redundancy;
        renderPhaseModal();
        return;
      }
      phaseModalState.draft.triggers.push(result.trigger);
      phaseModalState.triggerDraft = defaultTriggerDraft();
      phaseModalState.step = 'review';
      phaseModalState.message = '';
      renderPhaseModal();
      return;
    }

    if (action === 'review-back') {
      phaseModalState.step = 'trigger';
      phaseModalState.message = '';
      renderPhaseModal();
      return;
    }

    if (action === 'add-another-trigger') {
      phaseModalState.triggerDraft = defaultTriggerDraft();
      phaseModalState.step = 'trigger';
      phaseModalState.message = '';
      renderPhaseModal();
      return;
    }

    if (action === 'remove-trigger') {
      phaseModalState.draft.triggers = phaseModalState.draft.triggers.filter((trigger) => trigger.id !== actionButton.dataset.triggerId);
      renderPhaseModal();
      return;
    }

    if (action === 'save-phase') savePhaseDraft();
  }

  function getAvailableSourcePhases() {
    const targetIndex = phaseModalState?.mode === 'edit'
      ? state.blocks.findIndex((block) => block.id === phaseModalState.phaseId)
      : state.blocks.findIndex((block) => block.kind === 'goodbye');
    const lastIndex = targetIndex === -1 ? state.blocks.length : targetIndex;
    return state.blocks.slice(0, lastIndex).filter((block) => block.kind === 'phase');
  }

  function validateAndCreateTrigger(triggerDraft) {
    const trigger = structuredCloneSafe(triggerDraft);
    const source = getBlockById(trigger.sourcePhaseId);
    if (!source || source.kind !== 'phase') return { ok: false, message: 'Select a preceding source phase.' };
    if (trigger.kind === 'phase-complete') {
      trigger.questionId = '';
      trigger.matcher = { type: 'phase-complete', optionId: '', optionIds: [], operator: '>=', value: '', secondValue: '' };
      return { ok: true, trigger };
    }

    const question = getQuestionsForPhase(source.id).find((item) => item.id === trigger.questionId);
    if (!question) return { ok: false, message: 'Select a question that belongs to the chosen source phase.' };
    if (!QUESTION_TYPES[question.type]?.routable) return { ok: false, message: 'Open-text questions cannot currently be used for routing.' };

    if (question.type === 'number') {
      const operator = trigger.matcher.operator;
      const first = Number(trigger.matcher.value);
      const second = Number(trigger.matcher.secondValue);
      if (!['=', '>', '<', '>=', '<=', 'between'].includes(operator) || Number.isNaN(first)) return { ok: false, message: 'Enter a valid number condition.' };
      if (operator === 'between' && (Number.isNaN(second) || first > second)) return { ok: false, message: 'For “between”, enter a valid lower and upper value.' };
      trigger.matcher.type = 'number';
      return { ok: true, trigger };
    }

    if (question.type === 'multiple-answer') {
      const selected = [...new Set(trigger.matcher.optionIds || [])].sort();
      if (!selected.length) return { ok: false, message: 'Choose the exact non-empty set of answers that should match.' };
      const allowed = new Set(getOptionSet(question).map((option) => option.id));
      if (!selected.every((id) => allowed.has(id))) return { ok: false, message: 'One selected option is no longer available.' };
      trigger.matcher.type = 'exact-set';
      trigger.matcher.optionIds = selected;
      return { ok: true, trigger };
    }

    const allowed = new Set(getOptionSet(question).map((option) => option.id));
    if (!allowed.has(trigger.matcher.optionId)) return { ok: false, message: 'Choose the exact answer that should match.' };
    trigger.matcher.type = 'equals-option';
    return { ok: true, trigger };
  }

  function getTriggerRedundancyMessage(candidate, draft) {
    const sameSource = (draft.triggers || []).filter((trigger) => trigger.sourcePhaseId === candidate.sourcePhaseId);
    if (candidate.kind === 'answer' && sameSource.some((trigger) => trigger.kind === 'phase-complete')) {
      return 'This phase already opens after the selected source phase regardless of answers. An answer-specific trigger would not change the route.';
    }
    if (candidate.kind === 'phase-complete' && sameSource.some((trigger) => trigger.kind === 'answer')) {
      return 'A phase-completion trigger would make this phase open regardless of answers, so its existing answer-specific triggers would become redundant.';
    }

    const sourceIndex = getPhaseIndex(candidate.sourcePhaseId);
    const targetIndex = phaseModalState?.mode === 'edit'
      ? getPhaseIndex(phaseModalState.phaseId)
      : state.blocks.findIndex((block) => block.kind === 'goodbye') === -1
        ? state.blocks.length
        : state.blocks.findIndex((block) => block.kind === 'goodbye');
    const closestBroadPhase = state.blocks
      .slice(sourceIndex + 1, targetIndex)
      .filter((block) => block.kind === 'phase' && (block.triggers || []).some((trigger) => trigger.sourcePhaseId === candidate.sourcePhaseId && trigger.kind === 'phase-complete'))
      .find(Boolean);

    if (closestBroadPhase) {
      return `“${closestBroadPhase.title || 'A closer phase'}” already opens after the selected source phase regardless of answers. Because closer targets take precedence, this new trigger would never be reached.`;
    }
    return '';
  }

  function areTriggersEqual(a, b) {
    if (a.sourcePhaseId !== b.sourcePhaseId || a.kind !== b.kind) return false;
    if (a.kind === 'phase-complete') return true;
    if (a.questionId !== b.questionId || a.matcher.type !== b.matcher.type) return false;
    if (a.matcher.type === 'exact-set') return arraysEqual(a.matcher.optionIds, b.matcher.optionIds);
    if (a.matcher.type === 'number') return a.matcher.operator === b.matcher.operator && a.matcher.value === b.matcher.value && a.matcher.secondValue === b.matcher.secondValue;
    return a.matcher.optionId === b.matcher.optionId;
  }

  function arraysEqual(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function canAddAnotherTrigger(draft) {
    const sources = getAvailableSourcePhases();
    for (const phase of sources) {
      if (!draft.triggers.some((trigger) => trigger.sourcePhaseId === phase.id && trigger.kind === 'phase-complete')) return true;
      const questions = getQuestionsForPhase(phase.id);
      for (const question of questions) {
        if (question.type === 'number') return true;
        if (!QUESTION_TYPES[question.type]?.routable) continue;
        const used = draft.triggers.filter((trigger) => trigger.sourcePhaseId === phase.id && trigger.questionId === question.id);
        if (question.type === 'multiple-answer') {
          const max = Math.pow(2, getOptionSet(question).length) - 1;
          if (used.length < max) return true;
        } else {
          const options = getOptionSet(question);
          if (used.length < options.length) return true;
        }
      }
    }
    return false;
  }

  function hasNumericOverlap(triggers) {
    const groups = new Map();
    triggers.filter((trigger) => trigger.matcher.type === 'number').forEach((trigger) => {
      const key = `${trigger.sourcePhaseId}:${trigger.questionId}`;
      const list = groups.get(key) || [];
      list.push(trigger);
      groups.set(key, list);
    });
    return [...groups.values()].some((group) => {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          if (numericRangesOverlap(group[i].matcher, group[j].matcher)) return true;
        }
      }
      return false;
    });
  }

  function numericRangesOverlap(a, b) {
    const toRange = (matcher) => {
      const v = Number(matcher.value);
      const second = Number(matcher.secondValue);
      if (matcher.operator === 'between') return [v, second];
      if (matcher.operator === '>') return [v + Number.EPSILON, Infinity];
      if (matcher.operator === '>=') return [v, Infinity];
      if (matcher.operator === '<') return [-Infinity, v - Number.EPSILON];
      if (matcher.operator === '<=') return [-Infinity, v];
      return [v, v];
    };
    const [aMin, aMax] = toRange(a);
    const [bMin, bMax] = toRange(b);
    return aMin <= bMax && bMin <= aMax;
  }

  function savePhaseDraft() {
    if (!phaseModalState) return;
    const draft = structuredCloneSafe(phaseModalState.draft);
    draft.collapsed = true;
    if (!draft.title.trim()) {
      phaseModalState.message = 'Give the phase a title before saving.';
      renderPhaseModal();
      return;
    }
    if (phaseModalState.mode === 'create') {
      insertBeforeGoodbye(draft);
      closePhaseModal();
      renderAll({ enteringId: draft.id });
      showMessage(draft.triggers.length ? 'Conditional phase added.' : 'Normal-flow phase added.');
      return;
    }

    const index = state.blocks.findIndex((block) => block.id === phaseModalState.phaseId);
    if (index < 0) { closePhaseModal(); return; }
    state.blocks[index] = createPhase(draft);
    const pruned = pruneInvalidTriggers();
    closePhaseModal();
    renderAll();
    showMessage(pruned ? 'Phase saved. An invalid routing rule was removed.' : 'Phase saved.');
  }

  function getTriggerLabel(trigger) {
    const source = getBlockById(trigger.sourcePhaseId);
    const sourceName = source?.title?.trim() || 'Untitled phase';
    if (trigger.kind === 'phase-complete') return `After “${sourceName}” is completed`;
    const question = getQuestionsForPhase(trigger.sourcePhaseId).find((item) => item.id === trigger.questionId);
    const questionLabel = question?.prompt?.trim() || 'Untitled question';
    if (!question) return `After “${sourceName}” → unavailable question`;

    if (trigger.matcher.type === 'number') {
      const symbol = { '=': '=', '>': '>', '<': '<', '>=': '≥', '<=': '≤', between: 'between' }[trigger.matcher.operator] || '=';
      const condition = trigger.matcher.operator === 'between'
        ? `between ${trigger.matcher.value} and ${trigger.matcher.secondValue}`
        : `${symbol} ${trigger.matcher.value}`;
      return `After “${sourceName}” → “${questionLabel}” ${condition}`;
    }

    const options = getOptionSet(question);
    if (trigger.matcher.type === 'exact-set') {
      const labels = trigger.matcher.optionIds.map((id) => options.find((option) => option.id === id)?.label || 'Unavailable option');
      return `After “${sourceName}” → “${questionLabel}” matches exactly: ${labels.join(', ')}`;
    }

    const label = options.find((option) => option.id === trigger.matcher.optionId)?.label || 'Unavailable option';
    return `After “${sourceName}” → “${questionLabel}” = “${label}”`;
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      showMessage('Draft saved in this browser.');
    } catch (error) {
      showMessage('The browser could not save this draft.', true);
    }
  }

  function loadDraft() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!saved) {
        showMessage('No saved draft was found in this browser.', true);
        return;
      }
      state = JSON.parse(saved);
      previewPageIndex = 0;
      renderAll();
      showMessage('Saved draft loaded.');
    } catch (error) {
      showMessage('The saved draft could not be loaded.', true);
    }
  }

  function exportJson() {
    const fileName = slugify(state.meta.title || 'kelp-form') || 'kelp-form';
    downloadFile(`${fileName}.json`, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), ...state }, null, 2), 'application/json');
    showMessage('JSON export prepared.');
  }

  async function importJson(event) {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      state = { meta: imported.meta || {}, blocks: imported.blocks || [] };
      previewPageIndex = 0;
      renderAll();
      showMessage('Form imported successfully.');
    } catch (error) {
      showMessage('That file is not a valid Kelp form JSON file.', true);
    }
  }

  function resetForm() {
    if (!window.confirm('Reset the current form? This only clears the editor. A saved browser draft remains available.')) return;
    state = defaultState();
    previewPageIndex = 0;
    renderAll();
    showMessage('The form was reset to the starter example.');
  }

  function openStudentView() {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) {
      showMessage('The browser blocked the preview window. Allow pop-ups and try again.', true);
      return;
    }
    popup.document.open();
    popup.document.write(buildStudentViewDocument());
    popup.document.close();
  }

  function buildStudentViewDocument() {
    const safeState = JSON.stringify({ meta: state.meta, blocks: state.blocks }).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(state.meta.title || 'Kelp Form')}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root{--p:#00acc1;--pd:#145c63;--s:#5fae63;--sd:#2d6b33;--text:#383838;--muted:rgba(33,33,33,.65);--border:#e5ece8;--danger:#b53f3f}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,rgba(86,241,255,.42),transparent 34%),radial-gradient(circle at bottom right,rgba(95,174,99,.12),transparent 32%),linear-gradient(135deg,#fcfcfc 0%,#eef8fb 45%,#f0faf6 100%);font-family:Inter,sans-serif;color:var(--text)}main{width:min(100% - 32px,720px);margin:0 auto;padding:42px 0}.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;color:var(--pd);font-size:.85rem;font-weight:800}.mark{display:grid;width:30px;height:30px;place-items:center;border:2px solid var(--p);border-radius:9px;color:var(--p)}.card{padding:28px;border:1px solid var(--border);border-radius:16px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(33,33,33,.08)}.progress{height:6px;margin:0 0 23px;border-radius:999px;background:#e7f1ef;overflow:hidden}.progress span{display:block;height:100%;background:var(--s);transition:width .2s}.meta{margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid var(--s)}.meta h1{margin:0;color:var(--text);font-size:clamp(1.55rem,4vw,2rem);line-height:1.15;letter-spacing:-.04em}.audience{margin:5px 0 0;color:var(--pd);font-size:.76rem;font-weight:800}.description{margin:9px 0 0;color:var(--muted);font-size:.9rem;line-height:1.55}.page-title{margin:4px 0 7px;font-size:1.2rem}.page-copy{margin:0 0 20px;color:var(--muted);line-height:1.55}.question-list{display:grid;gap:16px}.question{display:grid;gap:8px;padding:15px;border:1px solid var(--border);border-radius:12px;background:white}.question label,.identity label{font-size:.92rem;font-weight:700}.help{margin:-2px 0 0;color:var(--muted);font-size:.8rem}.required{color:var(--danger)}input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],textarea{width:100%;min-height:44px;padding:0 12px;border:1px solid #c9c9c9;border-radius:9px;background:white;color:var(--text);font:inherit;outline:none}textarea{min-height:112px;padding:11px 12px;resize:vertical}input:focus,textarea:focus{border-color:var(--s);box-shadow:0 0 0 4px rgba(0,172,193,.12)}.identity{display:grid;gap:11px;margin:0 0 16px;padding:13px;border:1px solid rgba(0,172,193,.2);border-radius:12px;background:rgba(0,172,193,.035)}.identity h3{margin:0;color:var(--pd);font-size:.86rem}.identity-field{display:grid;gap:7px}.choices{display:grid;gap:10px}.choice{display:flex;align-items:center;gap:9px;color:var(--text);font-size:.9rem}.choice input{width:16px;height:16px;margin:0;accent-color:var(--p)}.actions{display:flex;justify-content:space-between;gap:10px;margin-top:24px}.btn{min-height:42px;padding:0 15px;border:1px solid #bdbdbd;border-radius:9px;background:white;color:var(--text);font:inherit;font-size:.87rem;font-weight:700;cursor:pointer}.btn:hover{border-color:var(--p);background:rgba(0,172,193,.08)}.btn:disabled{cursor:not-allowed;opacity:.55}.btn.primary{border-color:var(--p);background:var(--p);color:white}.btn.primary:hover{background:#0099ab}.error{margin:13px 0 0;color:var(--danger);font-size:.84rem;font-weight:600}.notice{margin:0 0 14px;padding:11px;border:1px solid rgba(0,172,193,.2);border-radius:10px;background:rgba(0,172,193,.035);color:var(--muted);font-size:.79rem;line-height:1.55}.welcome,.thanks{display:grid;min-height:300px;align-content:center;justify-items:center;gap:12px;text-align:center}.welcome h2,.thanks h2{margin:0;color:var(--pd);font-size:1.6rem}.welcome p,.thanks p{max-width:500px;margin:0;color:var(--muted);line-height:1.6}.terms{width:100%;max-width:530px;padding:14px;border:1px solid rgba(0,172,193,.22);border-radius:12px;background:rgba(0,172,193,.035);color:var(--muted);font-size:.82rem;text-align:left;line-height:1.55}.terms strong{color:var(--pd)}.consent{display:flex;align-items:flex-start;gap:9px;margin-top:10px;color:var(--text);font-size:.82rem;font-weight:700;cursor:pointer}.consent input{width:16px;height:16px;margin:2px 0 0;accent-color:var(--p)}.full{width:100%;margin-top:8px}.submitted{display:grid;min-height:300px;place-items:center;text-align:center}.submitted h2{margin:0;color:var(--pd)}.route-note{margin:0 0 13px;padding:9px;border-radius:8px;background:rgba(95,174,99,.12);color:var(--sd);font-size:.75rem;font-weight:700}@media(max-width:520px){main{width:min(100% - 22px,720px);padding:22px 0}.card{padding:18px}.actions{flex-wrap:wrap}.actions .btn{flex:1 1 130px}}
</style>
</head>
<body>
<main>
  <div class="brand"><span class="mark">K</span><span>Kelp form preview</span></div>
  <div class="card" id="app"></div>
</main>
<script>
const formState=${safeState};
const app=document.getElementById('app');
const answers={};
let submitted=false;
let consent=false;
let history=[];
let historyIndex=0;
let routeDirty=false;
const esc=(value)=>String(value??'').replace(/[&<>\"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const optionList=(q)=>q.type==='true-false'?[{id:'true',label:'True'},{id:'false',label:'False'}]:(q.options||[]);
const identityInfo={fullName:{label:'Full name',type:'text',placeholder:'Example: Ana Maria Silva'},birthdate:{label:'Birthdate',type:'date',placeholder:''},email:{label:'E-mail address',type:'email',placeholder:'name@example.com'},phone:{label:'Phone number',type:'tel',placeholder:'+55 (00) 00000-0000'}};
function contentPages(){const middle=formState.blocks.filter(b=>b.kind!=='greeting'&&b.kind!=='goodbye');const pages=[];let current=null;let order=0;middle.forEach(block=>{if(block.kind==='phase'){if(current)pages.push(current);current={id:'phase-page-'+block.id,type:'phase',phaseId:block.id,order:block.__order??order,block,questions:[]}}if(block.kind==='question'){if(!current)current={id:'initial-questions',type:'questions',phaseId:null,order:block.__order??order,block:{title:'Questions',description:''},questions:[]};current.questions.push(block)}order++});if(current)pages.push(current);return pages}
function greeting(){return formState.blocks.find(b=>b.kind==='greeting')||null}function goodbye(){return formState.blocks.find(b=>b.kind==='goodbye')||null}function pageById(id){return contentPages().find(p=>p.id===id)||null}function normalPage(p){return !p.phaseId||!(p.block.triggers&&p.block.triggers.length)}function firstPageId(){const p=contentPages().find(normalPage);return p?p.id:'goodbye'}function initialSnapshot(){return {pageId:'privacy',queue:[],visited:[]}}
function deep(v){return JSON.parse(JSON.stringify(v))}function same(a,b){return a&&b&&a.pageId===b.pageId&&JSON.stringify(a.queue)===JSON.stringify(b.queue)&&JSON.stringify(a.visited)===JSON.stringify(b.visited)}
function sourceQuestions(phaseId){const blocks=formState.blocks;const start=blocks.findIndex(b=>b.kind==='phase'&&b.id===phaseId);if(start<0)return[];const result=[];for(let i=start+1;i<blocks.length;i++){const block=blocks[i];if(block.kind==='phase'||block.kind==='goodbye')break;if(block.kind==='question')result.push(block)}return result}
function triggerMatches(t,sourcePhaseId){if(t.sourcePhaseId!==sourcePhaseId)return false;if(t.kind==='phase-complete')return true;const q=sourceQuestions(sourcePhaseId).find(item=>item.id===t.questionId);if(!q)return false;const value=answers[q.id];if(q.type==='number'){const n=Number(value);if(!Number.isFinite(n))return false;const a=Number(t.matcher.value),b=Number(t.matcher.secondValue);if(t.matcher.operator==='=')return n===a;if(t.matcher.operator==='>')return n>a;if(t.matcher.operator==='<')return n<a;if(t.matcher.operator==='>=')return n>=a;if(t.matcher.operator==='<=')return n<=a;if(t.matcher.operator==='between')return n>=a&&n<=b;return false}if(q.type==='multiple-answer'){if(!Array.isArray(value))return false;const actual=[...value].sort();const expected=[...(t.matcher.optionIds||[])].sort();return actual.length===expected.length&&actual.every((x,i)=>x===expected[i])}return value===t.matcher.optionId}
function conditionalTarget(current,snapshot){if(!current||!current.phaseId)return null;return contentPages().filter(p=>p.phaseId&&p.order>current.order&&!snapshot.visited.includes(p.id)&&p.block.triggers&&p.block.triggers.some(t=>triggerMatches(t,current.phaseId))).sort((a,b)=>a.order-b.order)[0]||null}
function nextSnapshot(snapshot){if(snapshot.pageId==='privacy'){const next=firstPageId();return {pageId:next,queue:[],visited:next==='goodbye'?[]:[next]}}if(snapshot.pageId==='goodbye')return null;const pages=contentPages();const current=pageById(snapshot.pageId);if(!current)return {pageId:'goodbye',queue:[],visited:snapshot.visited};let queue=[...(snapshot.queue||[])].filter(id=>!snapshot.visited.includes(id));const target=conditionalTarget(current,snapshot);if(target){const skipped=pages.filter(p=>p.order>current.order&&p.order<target.order&&normalPage(p)&&!snapshot.visited.includes(p.id)&&!queue.includes(p.id)).map(p=>p.id);queue=[...queue,...skipped];return {pageId:target.id,queue,visited:[...snapshot.visited,target.id]}}if(queue.length){const next=queue.shift();return {pageId:next,queue,visited:[...snapshot.visited,next]}}const nextNormal=pages.find(p=>p.order>current.order&&normalPage(p)&&!snapshot.visited.includes(p.id));if(nextNormal)return {pageId:nextNormal.id,queue,visited:[...snapshot.visited,nextNormal.id]};return {pageId:'goodbye',queue:[],visited:snapshot.visited}}
function header(){return '<div class="meta"><h1>'+esc(formState.meta.title||'Untitled form')+'</h1>'+(formState.meta.audience?'<p class="audience">'+esc(formState.meta.audience)+'</p>':'')+(formState.meta.description?'<p class="description">'+esc(formState.meta.description)+'</p>':'')+'</div>'}
function progress(){const total=Math.max(1,contentPages().filter(normalPage).length+2);const position=Math.min(total,historyIndex+1);return '<div class="progress"><span style="width:'+((position/total)*100)+'%"></span></div>'}
function inputFor(q){const name='q-'+q.id;if(q.type==='short-answer')return '<input type="text" data-question="'+esc(q.id)+'" placeholder="Your answer" value="'+esc(answers[q.id]||'')+'" />';if(q.type==='long-answer')return '<textarea data-question="'+esc(q.id)+'" placeholder="Write your answer">'+esc(answers[q.id]||'')+'</textarea>';if(q.type==='number')return '<input type="number" step="any" data-question="'+esc(q.id)+'" placeholder="Enter a number" value="'+esc(answers[q.id]||'')+'" />';const options=optionList(q);const kind=q.type==='multiple-answer'?'checkbox':'radio';return '<div class="choices">'+options.map(o=>{const current=answers[q.id];const checked=kind==='checkbox'?Array.isArray(current)&&current.includes(o.id):current===o.id;return '<label class="choice"><input type="'+kind+'" name="'+name+'" data-question="'+esc(q.id)+'" value="'+esc(o.id)+'" '+(checked?'checked':'')+' /><span>'+esc(o.label||'Untitled option')+'</span></label>'}).join('')+'</div>'}
function question(q){return '<section class="question"><label>'+esc(q.prompt||'Untitled question')+(q.required?'<span class="required"> *</span>':'')+'</label>'+(q.helpText?'<p class="help">'+esc(q.helpText)+'</p>':'')+inputFor(q)+'</section>'}
function identity(){const config=formState.meta.respondentDetails||{};const fields=Object.keys(identityInfo).filter(k=>config[k]&&config[k].enabled);if(!fields.length)return'';return '<section class="identity"><h3>Respondent details</h3>'+fields.map(k=>{const info=identityInfo[k],field=config[k],id='identity-'+k;return '<div class="identity-field"><label>'+esc(info.label)+(field.required?'<span class="required"> *</span>':'')+'</label><input type="'+info.type+'" data-identity="'+k+'" placeholder="'+esc(info.placeholder)+'" value="'+esc(answers[id]||'')+'" /></div>'}).join('')+'</section>'}
function privacy(){const g=greeting();return '<section class="welcome"><h2>'+esc(g?.title||'Before we begin')+'</h2><p>'+esc(g?.body||'Please read the information below before continuing.')+'</p><div class="terms"><strong>Privacy Notice and Data Use Terms</strong><p>Kelp uses the information in this form to provide tutoring support, communicate about the learning plan, and improve the service. Responses should be accessed only by authorised people and kept only as long as needed for the stated purpose.</p><label class="consent"><input type="checkbox" data-consent '+(consent?'checked':'')+' /><span>I have read and agree with the Privacy Notice and Data Use Terms.</span></label></div><button class="btn primary full" data-action="start" '+(consent?'':'disabled')+'>'+esc(g?.buttonText||'Start form')+'</button></section>'}
function render(){if(!history.length){history=[initialSnapshot()];historyIndex=0}const snapshot=history[historyIndex];if(submitted){app.innerHTML='<section class="submitted"><div><h2>Submitted</h2><p class="description">Your form is now locked and can no longer be edited.</p></div></section>';return}let content=header()+progress();if(snapshot.pageId==='privacy'){content+=privacy();app.innerHTML=content;return}if(snapshot.pageId==='goodbye'){const g=goodbye();content+='<section class="thanks"><h2>'+esc(g?.title||'Thank you')+'</h2><p>'+esc(g?.body||'Your answers are ready to be submitted.')+'</p><p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev" '+(historyIndex===0?'disabled':'')+'>Previous</button><button class="btn primary" data-action="submit">'+esc(g?.buttonText||'Submit form')+'</button></div></section>';app.innerHTML=content;return}const page=pageById(snapshot.pageId);if(!page){content+='<section class="thanks"><h2>No available page</h2><p>Please return to the builder and review the phase rules.</p></section>';app.innerHTML=content;return}const conditional=page.phaseId&&page.block.triggers&&page.block.triggers.length;content+=(conditional?'<p class="route-note">This phase was opened by a matching route condition.</p>':'')+'<h2 class="page-title">'+esc(page.block.title||'Questions')+'</h2>'+(page.block.description?'<p class="page-copy">'+esc(page.block.description)+'</p>':'')+(historyIndex===1?identity():'')+'<div class="question-list">'+(page.questions.length?page.questions.map(question).join(''):'<p class="description">This phase has no questions yet.</p>')+'</div><p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev" '+(historyIndex===0?'disabled':'')+'>Previous</button><button class="btn primary" data-action="next">Next</button></div>';app.innerHTML=content}
function missingRequired(page){const missing=[];const config=formState.meta.respondentDetails||{};if(historyIndex===1){Object.keys(identityInfo).forEach(k=>{if(config[k]?.enabled&&config[k]?.required){const v=answers['identity-'+k];if(!String(v||'').trim())missing.push(identityInfo[k].label)}})}page.questions.filter(q=>q.required).forEach(q=>{const v=answers[q.id];if(Array.isArray(v)?!v.length:!String(v||'').trim())missing.push(q.prompt||'this question')});return missing}
function validIdentity(){const config=formState.meta.respondentDetails||{};if(historyIndex!==1)return true;for(const k of Object.keys(identityInfo)){if(!config[k]?.enabled)continue;const value=String(answers['identity-'+k]||'').trim();if(!value)continue;if(k==='fullName'&&value.split(/\s+/).filter(Boolean).length<2)return 'Please enter a full name.';if(k==='birthdate'){const date=new Date(value+'T00:00:00');if(Number.isNaN(date.getTime())||date>new Date())return 'Please enter a valid birthdate.'}if(k==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value))return 'Please enter a valid e-mail address.';if(k==='phone'&&value.replace(/\D/g,'').length<8)return 'Please enter a plausible phone number.'}return true}
function validateCurrent(){const snap=history[historyIndex];if(snap.pageId==='privacy')return consent;const page=pageById(snap.pageId);if(!page)return true;const id=validIdentity();if(id!==true){document.getElementById('error').textContent=id;return false}const missing=missingRequired(page);if(!missing.length)return true;document.getElementById('error').textContent='Please answer '+(missing.length===1?missing[0]:'all required questions')+' before continuing.';return false}
function proposedValue(el){if(el.dataset.identity)return el.value;const id=el.dataset.question;if(el.type==='checkbox')return [...document.querySelectorAll('input[data-question="'+CSS.escape(id)+'"]:checked')].map(node=>node.value).sort();return el.value}
function keyFor(el){return el.dataset.identity?'identity-'+el.dataset.identity:el.dataset.question}
function sameValue(a,b){if(Array.isArray(a)||Array.isArray(b))return JSON.stringify(a||[])===JSON.stringify(b||[]);return String(a??'')===String(b??'')}
function saveChange(el){const key=keyFor(el);if(!key)return;const next=proposedValue(el),previous=answers[key];if(sameValue(previous,next))return;if(historyIndex<history.length-1&&!routeDirty){const proceed=window.confirm('Changing this answer may send you through a different path. If the pathway changes, answers given after this page will be removed. Do you want to continue?');if(!proceed){render();return}routeDirty=true}answers[key]=next}
function questionsForPageId(id){const page=pageById(id);return page?page.questions:[]}
function discardFutureAnswers(){const future=history.slice(historyIndex+1);future.forEach(s=>{questionsForPageId(s.pageId).forEach(q=>delete answers[q.id]);if(s.pageId==='initial-questions'||pageById(s.pageId)?.order===contentPages()[0]?.order){Object.keys(identityInfo).forEach(k=>delete answers['identity-'+k])}})}
function goNext(){if(!validateCurrent())return;if(!routeDirty&&historyIndex<history.length-1){historyIndex++;render();return}const current=history[historyIndex];const next=nextSnapshot(current);if(!next){submitted=true;render();return}const known=history[historyIndex+1];if(routeDirty&&known&&!same(next,known)){discardFutureAnswers();history=history.slice(0,historyIndex+1)}if(routeDirty&&known&&same(next,known)){historyIndex++;routeDirty=false;render();return}history=history.slice(0,historyIndex+1);history.push(deep(next));historyIndex++;routeDirty=false;render()}
app.addEventListener('input',e=>{if(e.target.matches('[data-question],[data-identity]')){if(e.target.type!=='checkbox'&&e.target.type!=='radio')saveChange(e.target)}});app.addEventListener('change',e=>{if(e.target.matches('[data-question],[data-identity]'))saveChange(e.target);if(e.target.matches('[data-consent]')){consent=e.target.checked;render()}});app.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;if(a==='start'){if(!consent)return;goNext();return}if(a==='prev'){if(historyIndex>0){historyIndex--;routeDirty=false;render()}return}if(a==='next'){goNext();return}if(a==='submit'){if(validateCurrent()){submitted=true;render()}}});render();
<\/script>
</body>
</html>`;
  }

  function showMessage(message, isError = false) {
    window.clearTimeout(lastMessageTimer);
    els.message.textContent = message;
    els.message.classList.toggle('is-error', isError);
    lastMessageTimer = window.setTimeout(() => {
      els.message.textContent = '';
      els.message.classList.remove('is-error');
    }, 4600);
  }

  function downloadFile(name, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function slugify(value) {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function structuredCloneSafe(value) { return JSON.parse(JSON.stringify(value)); }
  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function escapeAttribute(value) { return escapeHtml(value); }
})();
