(() => {
  'use strict';

  const STORAGE_KEY = 'kelp-form-builder-draft-v2';
  const TRANSITION_MS = 1200;

  const QUESTION_TYPES = {
    'short-answer': { label: 'Short answer', helper: 'One concise written response.' },
    'long-answer': { label: 'Long answer', helper: 'A fuller written response.' },
    'multiple-choice': { label: 'Multiple choice', helper: 'Respondent selects one option.' },
    'multiple-answer': { label: 'Multiple answer', helper: 'Respondent may select more than one option.' },
    number: { label: 'Number', helper: 'Respondent enters a numeric value.' },
    'true-false': { label: 'True / false', helper: 'Respondent selects one of two fixed options.' }
  };

  const RESPONDENT_FIELD_DEFINITIONS = {
    fullName: {
      label: 'Full name',
      description: 'Ask for the respondent’s first and last name.',
      inputType: 'text',
      placeholder: 'Example: Ana Silva',
      canVerify: false
    },
    birthdate: {
      label: 'Birthdate',
      description: 'Ask for a valid date of birth.',
      inputType: 'date',
      placeholder: '',
      canVerify: false
    },
    email: {
      label: 'E-mail address',
      description: 'Check e-mail structure before the respondent continues.',
      inputType: 'email',
      placeholder: 'name@example.com',
      canVerify: true
    },
    phone: {
      label: 'Phone number',
      description: 'Check for a plausible phone number, with or without a country code.',
      inputType: 'tel',
      placeholder: 'Example: +55 11 99999-9999',
      canVerify: true
    }
  };

  const defaultState = () => ({
    meta: {
      title: 'Student Check-in',
      audience: 'Current students',
      description: 'Your answers help me adapt our next lessons and materials.',
      respondentFields: {
        fullName: { enabled: true, required: true },
        birthdate: { enabled: false, required: false },
        email: { enabled: false, required: true, verify: false },
        phone: { enabled: false, required: true, verify: false }
      }
    },
    blocks: [
      createGreeting(),
      createQuestion({
        prompt: 'How are you feeling about the course so far?',
        helpText: 'Choose the option that best reflects your current experience.',
        type: 'multiple-choice',
        options: ['I feel confident', 'I am making progress', 'I need more support']
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
  let previewPrivacyAccepted = false;
  let lastMessageTimer = null;
  let dragState = null;
  let structuralAnimationActive = false;

  const els = {
    title: document.getElementById('formTitle'),
    audience: document.getElementById('formAudience'),
    description: document.getElementById('formDescription'),
    respondentFields: document.getElementById('respondentFields'),
    respondentDetailsCard: document.getElementById('respondentDetailsCard'),
    respondentDetailsBody: document.getElementById('respondentDetailsBody'),
    toggleRespondentDetails: document.getElementById('toggleRespondentDetailsBtn'),
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
    countPill: document.getElementById('blockCountPill')
  };

  init();

  function init() {
    normalizeState();
    bindStaticEvents();
    setRespondentDetailsCollapsed(true);
    renderAll();
  }

  function bindStaticEvents() {
    els.title.addEventListener('input', () => updateMeta('title', els.title.value));
    els.audience.addEventListener('input', () => updateMeta('audience', els.audience.value));
    els.description.addEventListener('input', () => updateMeta('description', els.description.value));

    els.respondentFields.addEventListener('change', handleRespondentDetailsChange);
    els.toggleRespondentDetails.addEventListener('click', () => {
      setRespondentDetailsCollapsed(!els.respondentDetailsCard.classList.contains('is-collapsed'));
    });

    els.addGreeting.addEventListener('click', () => addBlock('greeting'));
    els.addQuestion.addEventListener('click', () => addBlock('question'));
    els.addPhase.addEventListener('click', () => addBlock('phase'));
    els.addGoodbye.addEventListener('click', () => addBlock('goodbye'));

    els.previewPrevious.addEventListener('click', () => stepPreview(-1));
    els.previewNext.addEventListener('click', () => stepPreview(1));

    els.formPreview.addEventListener('change', (event) => {
      if (!event.target.matches('[data-preview-consent]')) return;
      previewPrivacyAccepted = event.target.checked;
      renderPreview();
    });

    els.formPreview.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-preview-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.previewAction;
      if (action === 'previous') stepPreview(-1);
      if (action === 'next') stepPreview(1);
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
    els.blockList.addEventListener('dragstart', handleBlockDragStart);
    els.blockList.addEventListener('dragover', handleBlockDragOver);
    els.blockList.addEventListener('drop', handleBlockDrop);
    els.blockList.addEventListener('dragend', clearBlockDragState);
  }

  function createId(prefix = 'block') {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      options: ['Option 1', 'Option 2'],
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

  function updateMeta(key, value) {
    state.meta[key] = value;
    renderPreview();
  }

  function hydrateMetaFields() {
    els.title.value = state.meta.title;
    els.audience.value = state.meta.audience;
    els.description.value = state.meta.description;
  }

  function setRespondentDetailsCollapsed(collapsed) {
    const isCollapsed = Boolean(collapsed);
    els.respondentDetailsCard.classList.toggle('is-collapsed', isCollapsed);
    els.respondentDetailsBody.setAttribute('aria-hidden', String(isCollapsed));
    els.respondentDetailsBody.inert = isCollapsed;
    els.toggleRespondentDetails.textContent = isCollapsed ? 'Maximize' : 'Minimize';
    els.toggleRespondentDetails.setAttribute('aria-expanded', String(!isCollapsed));
  }

  function renderAll() {
    normalizeState();
    hydrateMetaFields();
    renderRespondentDetailsControls();
    renderBlockList();
    renderPreview();
    updateAddButtons();
    updateBlockCount();
  }

  function updateBlockCount() {
    els.countPill.textContent = `${state.blocks.length} ${state.blocks.length === 1 ? 'block' : 'blocks'}`;
  }

  function renderRespondentDetailsControls() {
    const fields = state.meta.respondentFields;

    els.respondentFields.innerHTML = Object.entries(RESPONDENT_FIELD_DEFINITIONS)
      .map(([key, definition]) => {
        const config = fields[key];
        const isEnabled = config.enabled;
        return `
          <div class="form-builder-detail-row${isEnabled ? '' : ' is-disabled'}" data-detail-row="${key}">
            <label class="form-builder-detail-main">
              <input type="checkbox" data-detail-toggle="${key}" ${isEnabled ? 'checked' : ''} />
              <span>
                <strong>${definition.label}</strong>
                <small>${definition.description}</small>
              </span>
            </label>
            <div class="form-builder-detail-config">
              <label>
                <input type="checkbox" data-detail-required="${key}" ${config.required ? 'checked' : ''} />
                Required
              </label>
              ${definition.canVerify ? `
                <label title="The builder stores this preference, but real confirmation needs a back-end e-mail or SMS service.">
                  <input type="checkbox" data-detail-verify="${key}" ${config.verify ? 'checked' : ''} />
                  Verify after submission
                </label>
              ` : ''}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function handleRespondentDetailsChange(event) {
    const toggle = event.target.dataset.detailToggle;
    const required = event.target.dataset.detailRequired;
    const verify = event.target.dataset.detailVerify;

    if (toggle) {
      state.meta.respondentFields[toggle].enabled = event.target.checked;
      renderRespondentDetailsControls();
      renderPreview();
      return;
    }

    if (required) {
      state.meta.respondentFields[required].required = event.target.checked;
      renderPreview();
      return;
    }

    if (verify) {
      state.meta.respondentFields[verify].verify = event.target.checked;
      renderPreview();
      showMessage('The verification preference is saved. Real confirmation needs an e-mail or SMS service in your back end.');
    }
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

    const questionNumbers = new Map();
    let number = 0;
    state.blocks.forEach((block) => {
      if (block.kind === 'question') {
        number += 1;
        questionNumbers.set(block.id, number);
      }
    });

    els.blockList.innerHTML = state.blocks
      .map((block, index) => renderBlockCard(block, index, questionNumbers.get(block.id)))
      .join('');
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
      phase: 'Everything after this block starts on a new respondent page.',
      goodbye: 'Confirm submission and close the form.'
    }[block.kind];

    const isFixed = ['greeting', 'goodbye'].includes(block.kind);

    return `
      <article class="form-builder-block-card${block.collapsed ? ' is-collapsed' : ''}" data-block-id="${escapeAttribute(block.id)}">
        <header class="form-builder-block-header">
          <button
            type="button"
            class="form-builder-drag-handle"
            data-drag-handle
            draggable="${isFixed ? 'false' : 'true'}"
            aria-label="${isFixed ? `${kindLabels[block.kind]} stays in its fixed position` : 'Drag block to reorder'}"
            title="${isFixed ? `${kindLabels[block.kind]} stays in its fixed position` : 'Drag with the left mouse button to reorder'}"
            ${isFixed ? 'disabled' : ''}
          >⠿</button>
          <div class="form-builder-block-header-main">
            <div class="form-builder-block-header-title-row">
              <span class="form-builder-block-kind">${kindLabels[block.kind]}</span>
              <h3>${escapeHtml(getBlockHeaderTitle(block, questionNumber))}</h3>
            </div>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <div class="form-builder-block-actions">
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
      `;
    }

    if (block.kind === 'phase') {
      return `
        <div class="form-builder-input-group">
          <label>Phase title</label>
          <input type="text" data-field="title" value="${escapeAttribute(block.title)}" placeholder="Example: Your study routine" />
        </div>
        <div class="form-builder-input-group">
          <label>Short introduction</label>
          <textarea rows="3" data-field="description" placeholder="Tell respondents what this page is about.">${escapeHtml(block.description)}</textarea>
        </div>
        <p class="form-builder-block-note">This block starts a new page in the student view. Questions after it belong to this phase until the next phase begins.</p>
      `;
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
          <div class="form-builder-static-options">
            <span class="form-builder-static-option">True</span>
            <span class="form-builder-static-option">False</span>
          </div>
        </section>
      `;
    }

    if (!['multiple-choice', 'multiple-answer'].includes(block.type)) return '';

    return `
      <section class="form-builder-options-box">
        <div class="form-builder-options-header">
          <div>
            <h4>Answer options</h4>
            <p>${block.type === 'multiple-answer' ? 'Respondents may select more than one option.' : 'Respondents will select one option.'}</p>
          </div>
          <button type="button" class="form-builder-btn form-builder-btn-secondary form-builder-small-btn" data-action="add-option">Add option</button>
        </div>
        <div class="form-builder-options-list">
          ${block.options
            .map(
              (option, optionIndex) => `
                <div class="form-builder-option-row">
                  <span class="form-builder-option-marker" aria-hidden="true">${String.fromCharCode(65 + optionIndex)}</span>
                  <input type="text" value="${escapeAttribute(option)}" data-option-index="${optionIndex}" placeholder="Option ${optionIndex + 1}" />
                  <button type="button" class="form-builder-option-remove" data-action="remove-option" data-option-index="${optionIndex}" aria-label="Remove option ${optionIndex + 1}" ${block.options.length <= 2 ? 'disabled' : ''}>×</button>
                </div>
              `
            )
            .join('')}
        </div>
      </section>
    `;
  }

  function handleBlockInput(event) {
    const card = event.target.closest('[data-block-id]');
    if (!card) return;
    const block = getBlockById(card.dataset.blockId);
    if (!block) return;

    const optionIndex = event.target.dataset.optionIndex;
    if (optionIndex !== undefined) {
      block.options[Number(optionIndex)] = event.target.value;
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

    if (block.kind === 'question') {
      title.textContent = block.prompt?.trim() || 'Untitled question';
      return;
    }

    title.textContent = block.title?.trim() || 'Untitled page';
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
      block[field] = event.target.value;
      if (['multiple-choice', 'multiple-answer'].includes(block.type) && (!Array.isArray(block.options) || block.options.length < 2)) {
        block.options = ['Option 1', 'Option 2'];
      }
      renderBlockList();
      renderPreview();
    }
  }

  function handleBlockClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || structuralAnimationActive) return;

    const card = button.closest('[data-block-id]');
    if (!card) return;
    const blockId = card.dataset.blockId;
    const index = state.blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;

    const action = button.dataset.action;
    const block = state.blocks[index];

    if (action === 'toggle') {
      toggleBlockCard(card, button, block);
      return;
    }

    if (action === 'move-up') {
      moveBlock(index, -1);
      return;
    }

    if (action === 'move-down') {
      moveBlock(index, 1);
      return;
    }

    if (action === 'remove') {
      removeBlockWithAnimation(index, card);
      return;
    }

    if (action === 'duplicate') {
      const duplicate = createQuestion({ ...structuredCloneSafe(block), id: createId('question'), collapsed: true });
      state.blocks.splice(index + 1, 0, duplicate);
      renderPreview();
      updateBlockCount();
      animateInsertedBlock(duplicate.id);
      showMessage('Question duplicated.');
      return;
    }

    if (action === 'add-option') {
      block.options.push(`Option ${block.options.length + 1}`);
      renderBlockList();
      renderPreview();
      return;
    }

    if (action === 'remove-option') {
      const optionIndex = Number(button.dataset.optionIndex);
      if (block.options.length > 2) block.options.splice(optionIndex, 1);
      renderBlockList();
      renderPreview();
    }
  }

  function toggleBlockCard(card, button, block) {
    block.collapsed = !block.collapsed;
    card.classList.toggle('is-collapsed', block.collapsed);
    button.textContent = block.collapsed ? '⌄' : '–';
    button.setAttribute('aria-label', block.collapsed ? 'Expand block' : 'Collapse block');
    button.setAttribute('title', block.collapsed ? 'Expand' : 'Collapse');
  }

  function captureBlockRects() {
    const rects = new Map();
    els.blockList.querySelectorAll('[data-block-id]').forEach((card) => {
      const rect = card.getBoundingClientRect();
      rects.set(card.dataset.blockId, { top: rect.top, left: rect.left });
    });
    return rects;
  }

  function animateInsertedBlock(blockId) {
    structuralAnimationActive = true;
    renderBlockList();

    const card = els.blockList.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
    if (!card) {
      structuralAnimationActive = false;
      return;
    }

    const targetHeight = card.getBoundingClientRect().height;
    card.classList.add('is-entering');
    card.style.height = '0px';
    card.style.marginBottom = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-10px)';

    // Force the collapsed starting state to paint before letting the card grow.
    void card.offsetHeight;

    requestAnimationFrame(() => {
      card.style.height = `${targetHeight}px`;
      card.style.marginBottom = '14px';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });

    finishAfterTransition(card, () => {
      card.classList.remove('is-entering');
      card.style.height = '';
      card.style.marginBottom = '';
      card.style.opacity = '';
      card.style.transform = '';
      structuralAnimationActive = false;
    });
  }

  function removeBlockWithAnimation(index, card) {
    const block = state.blocks[index];
    if (!block) return;

    structuralAnimationActive = true;
    const height = card.getBoundingClientRect().height;
    card.classList.add('is-leaving');
    card.style.height = `${height}px`;
    card.style.marginBottom = '14px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    card.style.pointerEvents = 'none';
    void card.offsetHeight;

    // Updating the model now keeps the live preview and add buttons in sync while the card collapses visually.
    state.blocks.splice(index, 1);
    renderPreview();
    updateBlockCount();
    updateAddButtons();

    requestAnimationFrame(() => {
      card.style.height = '0px';
      card.style.marginBottom = '0px';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-10px)';
    });

    finishAfterTransition(card, () => {
      renderBlockList();
      structuralAnimationActive = false;
      showMessage('Block removed.');
    });
  }

  function finishAfterTransition(element, callback) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener('transitionend', onTransitionEnd);
      callback();
    };
    const onTransitionEnd = (event) => {
      if (event.target === element && event.propertyName === 'height') finish();
    };
    element.addEventListener('transitionend', onTransitionEnd);
    window.setTimeout(finish, TRANSITION_MS + 80);
  }

  function animateReorder(beforeRects, movedBlockId) {
    const cards = [...els.blockList.querySelectorAll('[data-block-id]')];
    const animations = [];

    cards.forEach((card) => {
      const first = beforeRects.get(card.dataset.blockId);
      if (!first) return;
      const last = card.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      card.style.transition = 'none';
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      if (card.dataset.blockId === movedBlockId) card.classList.add('is-reordering-card');
      animations.push(card);
    });

    if (!animations.length) return;

    void els.blockList.offsetHeight;
    requestAnimationFrame(() => {
      animations.forEach((card) => {
        card.style.transition = `transform ${TRANSITION_MS}ms var(--kelp-motion-ease)`;
        card.style.transform = 'translate(0, 0)';
      });
    });

    window.setTimeout(() => {
      animations.forEach((card) => {
        card.style.transition = '';
        card.style.transform = '';
        card.classList.remove('is-reordering-card');
      });
    }, TRANSITION_MS + 70);
  }

  function reorderWithFlip(sourceIndex, insertionIndex) {
    if (structuralAnimationActive) return;
    const source = state.blocks[sourceIndex];
    if (!source || ['greeting', 'goodbye'].includes(source.kind)) return;
    if (sourceIndex === insertionIndex || sourceIndex + 1 === insertionIndex) return;

    const beforeRects = captureBlockRects();
    const [movedBlock] = state.blocks.splice(sourceIndex, 1);
    const adjustedIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
    state.blocks.splice(adjustedIndex, 0, movedBlock);

    renderBlockList();
    renderPreview();
    animateReorder(beforeRects, movedBlock.id);
    showMessage('Block reordered.');
  }

  function handleBlockDragStart(event) {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || handle.disabled || handle.getAttribute('draggable') !== 'true') {
      event.preventDefault();
      return;
    }

    const card = handle.closest('[data-block-id]');
    if (!card) return;

    dragState = {
      blockId: card.dataset.blockId,
      dropTargetId: null,
      dropAfter: false
    };

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragState.blockId);
    }

    requestAnimationFrame(() => card.classList.add('is-dragging'));
  }

  function handleBlockDragOver(event) {
    if (!dragState) return;

    const targetCard = event.target.closest('[data-block-id]');
    const sourceCard = els.blockList.querySelector(`[data-block-id="${CSS.escape(dragState.blockId)}"]`);

    if (!targetCard) {
      const movableCards = [...els.blockList.querySelectorAll('[data-block-id]')]
        .filter((card) => !['greeting', 'goodbye'].includes(getBlockById(card.dataset.blockId)?.kind));
      const lastMovableCard = movableCards[movableCards.length - 1];
      if (lastMovableCard) {
        event.preventDefault();
        setBlockDropTarget(lastMovableCard, true);
      }
      return;
    }

    if (targetCard === sourceCard) return;

    const targetBlock = getBlockById(targetCard.dataset.blockId);
    if (!targetBlock || ['greeting', 'goodbye'].includes(targetBlock.kind)) return;

    event.preventDefault();
    const rect = targetCard.getBoundingClientRect();
    setBlockDropTarget(targetCard, event.clientY > rect.top + rect.height / 2);
  }

  function setBlockDropTarget(card, dropAfter) {
    clearBlockDropIndicators();
    card.classList.add(dropAfter ? 'is-drop-after' : 'is-drop-before');
    dragState.dropTargetId = card.dataset.blockId;
    dragState.dropAfter = dropAfter;
  }

  function handleBlockDrop(event) {
    if (!dragState) return;
    event.preventDefault();

    const { blockId, dropTargetId, dropAfter } = dragState;
    clearBlockDragState();
    if (!dropTargetId || blockId === dropTargetId) return;

    const sourceIndex = state.blocks.findIndex((block) => block.id === blockId);
    const targetIndex = state.blocks.findIndex((block) => block.id === dropTargetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const target = state.blocks[targetIndex];
    if (!target || ['greeting', 'goodbye'].includes(target.kind)) return;

    reorderWithFlip(sourceIndex, targetIndex + (dropAfter ? 1 : 0));
  }

  function clearBlockDropIndicators() {
    els.blockList.querySelectorAll('.is-drop-before, .is-drop-after').forEach((card) => {
      card.classList.remove('is-drop-before', 'is-drop-after');
    });
  }

  function clearBlockDragState() {
    els.blockList.querySelectorAll('.is-dragging').forEach((card) => card.classList.remove('is-dragging'));
    clearBlockDropIndicators();
    dragState = null;
  }

  function addBlock(kind) {
    if (structuralAnimationActive) return;

    let block;
    if (kind === 'greeting') {
      if (state.blocks.some((item) => item.kind === 'greeting')) {
        showMessage('This form already has a greeting page.', true);
        return;
      }
      block = createGreeting();
      state.blocks.unshift(block);
      showMessage('Greeting page added at the start of the form.');
    }

    if (kind === 'goodbye') {
      if (state.blocks.some((item) => item.kind === 'goodbye')) {
        showMessage('This form already has a goodbye page.', true);
        return;
      }
      block = createGoodbye();
      state.blocks.push(block);
      showMessage('Goodbye page added at the end of the form.');
    }

    if (kind === 'question') {
      block = createQuestion();
      insertBeforeGoodbye(block);
      showMessage('Question added.');
    }

    if (kind === 'phase') {
      block = createPhase();
      insertBeforeGoodbye(block);
      showMessage('Phase added. Questions after it will appear on a new page.');
    }

    if (!block) return;
    renderPreview();
    updateAddButtons();
    updateBlockCount();
    animateInsertedBlock(block.id);
  }

  function insertBeforeGoodbye(block) {
    const goodbyeIndex = state.blocks.findIndex((item) => item.kind === 'goodbye');
    if (goodbyeIndex === -1) state.blocks.push(block);
    else state.blocks.splice(goodbyeIndex, 0, block);
  }

  function canMove(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.blocks.length) return false;

    const current = state.blocks[index];
    const target = state.blocks[targetIndex];
    if (current.kind === 'greeting' || current.kind === 'goodbye') return false;
    if (target.kind === 'greeting' || target.kind === 'goodbye') return false;
    return true;
  }

  function moveBlock(index, direction) {
    if (!canMove(index, direction)) return;
    reorderWithFlip(index, index + direction + (direction > 0 ? 1 : 0));
  }

  function getBlockById(id) {
    return state.blocks.find((block) => block.id === id);
  }

  function normalizeState() {
    if (!state || typeof state !== 'object') state = defaultState();
    if (!state.meta || typeof state.meta !== 'object') state.meta = defaultState().meta;
    if (!Array.isArray(state.blocks)) state.blocks = [];

    const fallbackFields = defaultState().meta.respondentFields;
    const legacyCollectName = Boolean(state.meta.collectName);
    const incomingFields = state.meta.respondentFields && typeof state.meta.respondentFields === 'object'
      ? state.meta.respondentFields
      : {};

    state.meta = {
      title: String(state.meta.title ?? ''),
      audience: String(state.meta.audience ?? ''),
      description: String(state.meta.description ?? ''),
      respondentFields: {}
    };

    Object.keys(RESPONDENT_FIELD_DEFINITIONS).forEach((key) => {
      const source = incomingFields[key] || {};
      state.meta.respondentFields[key] = {
        enabled: source.enabled !== undefined ? Boolean(source.enabled) : key === 'fullName' ? legacyCollectName : fallbackFields[key].enabled,
        required: source.required !== undefined ? Boolean(source.required) : fallbackFields[key].required,
        ...(RESPONDENT_FIELD_DEFINITIONS[key].canVerify ? { verify: Boolean(source.verify) } : {})
      };
    });

    const seenGreeting = new Set();
    const seenGoodbye = new Set();

    state.blocks = state.blocks
      .filter((block) => block && typeof block === 'object' && ['greeting', 'question', 'phase', 'goodbye'].includes(block.kind))
      .map((block) => {
        if (block.kind === 'greeting') {
          if (seenGreeting.size) return null;
          seenGreeting.add(true);
          return createGreeting({ ...block, id: block.id || createId('greeting'), collapsed: Boolean(block.collapsed) });
        }
        if (block.kind === 'goodbye') {
          if (seenGoodbye.size) return null;
          seenGoodbye.add(true);
          return createGoodbye({ ...block, id: block.id || createId('goodbye'), collapsed: Boolean(block.collapsed) });
        }
        if (block.kind === 'phase') {
          return createPhase({ ...block, id: block.id || createId('phase'), collapsed: Boolean(block.collapsed) });
        }
        const type = QUESTION_TYPES[block.type] ? block.type : 'short-answer';
        const options = Array.isArray(block.options) ? block.options.map((option) => String(option)) : ['Option 1', 'Option 2'];
        return createQuestion({
          ...block,
          id: block.id || createId('question'),
          type,
          options: options.length >= 2 ? options : ['Option 1', 'Option 2'],
          collapsed: Boolean(block.collapsed),
          required: block.required !== false
        });
      })
      .filter(Boolean);

    const greeting = state.blocks.find((block) => block.kind === 'greeting');
    const goodbye = state.blocks.find((block) => block.kind === 'goodbye');
    const middle = state.blocks.filter((block) => block.kind !== 'greeting' && block.kind !== 'goodbye');
    state.blocks = [...(greeting ? [greeting] : []), ...middle, ...(goodbye ? [goodbye] : [])];
  }

  function collapseAllBlocks() {
    state.blocks.forEach((block) => {
      block.collapsed = true;
    });
  }

  function buildPreviewPages() {
    const pages = [];
    const greeting = state.blocks.find((block) => block.kind === 'greeting');
    const goodbye = state.blocks.find((block) => block.kind === 'goodbye');
    const middle = state.blocks.filter((block) => block.kind !== 'greeting' && block.kind !== 'goodbye');

    if (greeting) {
      pages.push({ type: 'greeting', block: greeting, questions: [] });
    } else {
      pages.push({
        type: 'consent',
        block: {
          title: 'Before we begin',
          body: 'Please review the required privacy notice before continuing to this form.',
          buttonText: 'Continue to form'
        },
        questions: []
      });
    }

    let currentPage = null;
    middle.forEach((block) => {
      if (block.kind === 'phase') {
        if (currentPage) pages.push(currentPage);
        currentPage = { type: 'phase', block, questions: [] };
        return;
      }

      if (block.kind === 'question') {
        if (!currentPage) {
          currentPage = {
            type: 'questions',
            block: { title: 'Questions', description: '' },
            questions: []
          };
        }
        currentPage.questions.push(block);
      }
    });

    if (currentPage) pages.push(currentPage);
    if (goodbye) pages.push({ type: 'goodbye', block: goodbye, questions: [] });
    return pages;
  }

  function currentPreviewPageRequiresConsent() {
    const page = buildPreviewPages()[previewPageIndex];
    return page && (page.type === 'greeting' || page.type === 'consent');
  }

  function stepPreview(direction) {
    if (direction > 0 && currentPreviewPageRequiresConsent() && !previewPrivacyAccepted) {
      showMessage('Confirm the privacy notice in the preview before continuing.', true);
      return;
    }

    previewPageIndex += direction;
    renderPreview();
  }

  function renderPreview() {
    const pages = buildPreviewPages();
    previewPageIndex = Math.max(0, Math.min(previewPageIndex, pages.length - 1));
    const page = pages[previewPageIndex];
    const consentBlocked = (page.type === 'greeting' || page.type === 'consent') && !previewPrivacyAccepted;

    els.previewPageCount.textContent = `Page ${previewPageIndex + 1} of ${pages.length}`;
    els.previewPrevious.disabled = previewPageIndex === 0;
    els.previewNext.disabled = previewPageIndex === pages.length - 1 || consentBlocked;
    els.previewNext.textContent = previewPageIndex === pages.length - 1 ? 'Last page' : 'Next';
    els.previewNext.title = consentBlocked ? 'Confirm the privacy notice before continuing.' : '';
    els.formPreview.innerHTML = renderPreviewPage(page);
  }

  function renderPrivacyNotice({ preview = false } = {}) {
    return `
      <section class="form-builder-privacy-notice" aria-label="Privacy notice and data use terms">
        <p class="form-builder-privacy-kicker">Privacy notice and data use terms</p>
        <p>
          Kelp and the tutor may process the answers and contact details submitted through this form to administer the activity,
          support the learning plan, and communicate about the tutoring service.
        </p>
        <details>
          <summary>Read how information in this form will be handled</summary>
          <div>
            <ul>
              <li>Only the fields enabled in this form, the answers you provide, and the date of submission are requested here.</li>
              <li>Your tutor uses this information to follow up on the activity and tailor support, materials, or communication.</li>
              <li>Do not submit information that is unnecessary for the purpose of this form.</li>
              <li>For questions about your information or this activity, contact the tutor or Kelp through the service channel provided to you.</li>
            </ul>
          </div>
        </details>
        <label class="form-builder-consent-label">
          <input type="checkbox" data-preview-consent ${previewPrivacyAccepted ? 'checked' : ''} ${preview ? '' : 'disabled'} />
          <span>I have read and agree with the Privacy Notice and Data Use Terms.</span>
        </label>
        <p class="form-builder-privacy-helper">${previewPrivacyAccepted ? '' : 'You must confirm this notice before continuing.'}</p>
      </section>
    `;
  }

  function renderPreviewPage(page) {
    const header = `
      <div class="form-builder-preview-form-header">
        <h3>${escapeHtml(state.meta.title || 'Untitled form')}</h3>
        ${state.meta.audience ? `<p class="form-builder-preview-audience">${escapeHtml(state.meta.audience)}</p>` : ''}
        ${state.meta.description ? `<p class="form-builder-preview-description">${escapeHtml(state.meta.description)}</p>` : ''}
      </div>
    `;

    if (page.type === 'greeting' || page.type === 'consent') {
      const title = page.type === 'consent' ? 'Before we begin' : page.block.title || 'Welcome';
      const body = page.type === 'consent'
        ? 'Please review the required privacy notice before continuing to this form.'
        : page.block.body || '';
      const buttonText = page.type === 'consent' ? 'Continue to form' : page.block.buttonText || 'Start form';
      return `${header}
        <div class="form-builder-preview-confirmation">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(body)}</p>
          ${renderPrivacyNotice({ preview: true })}
          <button type="button" class="form-builder-preview-cta" data-preview-action="next" ${previewPrivacyAccepted ? '' : 'disabled'}>${escapeHtml(buttonText)}</button>
        </div>
      `;
    }

    if (page.type === 'goodbye') {
      return `${header}
        <div class="form-builder-preview-confirmation">
          <h3>${escapeHtml(page.block.title || 'Thank you')}</h3>
          <p>${escapeHtml(page.block.body || '')}</p>
          <button type="button" class="form-builder-preview-cta">${escapeHtml(page.block.buttonText || 'Submit form')}</button>
        </div>
      `;
    }

    const isFirstQuestionPage = previewPageIndex === firstQuestionPageIndex();
    return `${header}
      <h3 class="form-builder-preview-page-title">${escapeHtml(page.block.title || 'Questions')}</h3>
      ${page.block.description ? `<p class="form-builder-preview-page-copy">${escapeHtml(page.block.description)}</p>` : ''}
      ${isFirstQuestionPage ? renderIdentityPreview() : ''}
      <div class="form-builder-preview-question-list">
        ${page.questions.length ? page.questions.map(renderPreviewQuestion).join('') : '<p class="form-builder-preview-page-copy">This phase does not contain questions yet.</p>'}
      </div>
    `;
  }

  function firstQuestionPageIndex() {
    return buildPreviewPages().findIndex((page) => page.type === 'questions' || page.type === 'phase');
  }

  function renderIdentityPreview() {
    const fields = state.meta.respondentFields;
    const enabledFields = Object.keys(RESPONDENT_FIELD_DEFINITIONS).filter((key) => fields[key].enabled);
    if (!enabledFields.length) return '';

    return `
      <div class="form-builder-preview-identity-list">
        ${enabledFields
          .map((key) => {
            const definition = RESPONDENT_FIELD_DEFINITIONS[key];
            const config = fields[key];
            const verifyNote = config.verify ? 'Verification is requested after submission.' : '';
            return `
              <div class="form-builder-preview-identity-field">
                <span class="form-builder-preview-question-label">${definition.label}${config.required ? ' <span class="form-builder-required-star">*</span>' : ''}</span>
                <input class="form-builder-preview-${definition.inputType === 'date' ? 'date-field' : 'text-field'}" type="${definition.inputType}" placeholder="${escapeAttribute(definition.placeholder)}" disabled />
                ${verifyNote ? `<small>${verifyNote}</small>` : ''}
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderPreviewQuestion(question) {
    const label = `${escapeHtml(question.prompt || 'Untitled question')}${question.required ? ' <span class="form-builder-required-star">*</span>' : ''}`;
    let control = '';

    if (question.type === 'short-answer') {
      control = '<input class="form-builder-preview-text-field" type="text" placeholder="Your answer" disabled />';
    } else if (question.type === 'long-answer') {
      control = '<textarea class="form-builder-preview-textarea" placeholder="Write your answer" disabled></textarea>';
    } else if (question.type === 'number') {
      control = '<input class="form-builder-preview-number-field" type="number" placeholder="Enter a number" disabled />';
    } else {
      const options = question.type === 'true-false' ? ['True', 'False'] : question.options;
      const inputType = question.type === 'multiple-answer' ? 'checkbox' : 'radio';
      control = renderPreviewChoices(question, options, inputType);
    }

    return `
      <section class="form-builder-preview-question">
        <span class="form-builder-preview-question-label">${label}</span>
        ${question.helpText ? `<p class="form-builder-preview-question-help">${escapeHtml(question.helpText)}</p>` : ''}
        ${control}
      </section>
    `;
  }

  function renderPreviewChoices(question, options, inputType) {
    return `
      <div class="form-builder-preview-choice-list">
        ${options
          .map(
            (option, index) => `
              <label class="form-builder-preview-choice">
                <input type="${inputType}" name="preview-${escapeAttribute(question.id)}" ${index === 0 ? '' : ''} disabled />
                <span>${escapeHtml(option || 'Untitled option')}</span>
              </label>
            `
          )
          .join('')}
      </div>
    `;
  }

  function updateAddButtons() {
    els.addGreeting.disabled = state.blocks.some((block) => block.kind === 'greeting');
    els.addGoodbye.disabled = state.blocks.some((block) => block.kind === 'goodbye');
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      showMessage('No saved draft was found in this browser.', true);
      return;
    }

    try {
      state = JSON.parse(raw);
      normalizeState();
      collapseAllBlocks();
      previewPageIndex = 0;
      previewPrivacyAccepted = false;
      setRespondentDetailsCollapsed(true);
      renderAll();
      showMessage('Draft loaded. All blocks were minimized.');
    } catch (error) {
      showMessage('The saved draft could not be read.', true);
    }
  }

  function exportJson() {
    const fileName = `${slugify(state.meta.title || 'kelp-form') || 'kelp-form'}.json`;
    downloadFile(fileName, JSON.stringify(state, null, 2), 'application/json');
    showMessage('Form exported as JSON.');
  }

  async function importJson(event) {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      state = JSON.parse(text);
      normalizeState();
      collapseAllBlocks();
      previewPageIndex = 0;
      previewPrivacyAccepted = false;
      setRespondentDetailsCollapsed(true);
      renderAll();
      showMessage('Form imported. All blocks were minimized.');
    } catch (error) {
      showMessage('That file is not a valid Kelp form JSON file.', true);
    }
  }

  function resetForm() {
    if (!window.confirm('Reset this form to the starter example?')) return;
    state = defaultState();
    collapseAllBlocks();
    previewPageIndex = 0;
    previewPrivacyAccepted = false;
    setRespondentDetailsCollapsed(true);
    renderAll();
    showMessage('Form reset to the starter example.');
  }

  function openStudentView() {
    const popup = window.open('', '_blank');
    if (!popup) {
      showMessage('Your browser blocked the student preview window.', true);
      return;
    }

    try {
      popup.opener = null;
    } catch (error) {
      // The preview still works in browsers that prevent changing opener.
    }

    popup.document.open();
    popup.document.write(buildStudentViewDocument());
    popup.document.close();
  }

  function buildStudentViewDocument() {
    const safeState = JSON.stringify(state).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(state.meta.title || 'Kelp form')}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root{--p:#00acc1;--pd:#145c63;--s:#5fae63;--text:#383838;--muted:rgba(33,33,33,.65);--border:#e5ece8;--danger:#b53f3f}*{box-sizing:border-box}body{min-width:320px;min-height:100vh;margin:0;background:radial-gradient(circle at top left,rgba(86,241,255,.42),transparent 34%),radial-gradient(circle at bottom right,rgba(95,174,99,.12),transparent 32%),linear-gradient(135deg,#fcfcfc 0%,#eef8fb 45%,#f0faf6 100%);font-family:Inter,sans-serif;color:var(--text)}main{width:min(100% - 32px,720px);margin:0 auto;padding:42px 0}.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;color:var(--pd);font-size:.85rem;font-weight:800}.mark{display:grid;width:30px;height:30px;place-items:center;border:2px solid var(--p);border-radius:9px;color:var(--p)}.card{padding:28px;border:1px solid var(--border);border-radius:16px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(33,33,33,.08)}.progress{height:6px;margin:0 0 23px;border-radius:999px;background:#e7f1ef;overflow:hidden}.progress span{display:block;height:100%;background:var(--s);transition:width .2s}.meta{margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid var(--s)}.meta h1{margin:0;color:var(--text);font-size:clamp(1.55rem,4vw,2rem);line-height:1.15;letter-spacing:-.04em}.audience{margin:5px 0 0;color:var(--pd);font-size:.76rem;font-weight:800}.description{margin:9px 0 0;color:var(--muted);font-size:.9rem;line-height:1.55}.page-title{margin:4px 0 7px;font-size:1.2rem}.page-copy{margin:0 0 20px;color:var(--muted);line-height:1.55}.field-list,.question-list{display:grid;gap:16px}.field,.question{display:grid;gap:8px;padding:15px;border:1px solid var(--border);border-radius:12px;background:white}.field{background:rgba(0,172,193,.035);border-color:rgba(0,172,193,.2)}.question label,.field label{font-size:.92rem;font-weight:700}.hint{margin:-2px 0 0;color:var(--muted);font-size:.8rem}.required{color:var(--danger)}input[type=text],input[type=number],input[type=email],input[type=tel],input[type=date],textarea{width:100%;min-height:44px;padding:0 12px;border:1px solid #c9c9c9;border-radius:9px;background:white;color:var(--text);font:inherit;outline:none}textarea{min-height:112px;padding:11px 12px;resize:vertical}input:focus,textarea:focus{border-color:var(--s);box-shadow:0 0 0 4px rgba(0,172,193,.12)}.choices{display:grid;gap:10px}.choice{display:flex;align-items:center;gap:9px;color:var(--text);font-size:.9rem}.choice input{width:16px;height:16px;margin:0;accent-color:var(--p)}.actions{display:flex;justify-content:space-between;gap:10px;margin-top:24px}.btn{min-height:42px;padding:0 15px;border:1px solid #bdbdbd;border-radius:9px;background:white;color:var(--text);font:inherit;font-size:.87rem;font-weight:700;cursor:pointer}.btn:hover{border-color:var(--p);background:rgba(0,172,193,.08)}.btn:disabled{cursor:not-allowed;opacity:.54}.btn.primary{border-color:var(--p);background:var(--p);color:white}.btn.primary:hover{background:#0099ab}.error{min-height:20px;margin:13px 0 0;color:var(--danger);font-size:.84rem;font-weight:600}.welcome,.thanks{display:grid;min-height:300px;align-content:center;justify-items:center;gap:12px;text-align:center}.welcome h2,.thanks h2{margin:0;color:var(--pd);font-size:1.6rem}.welcome p,.thanks p{max-width:500px;margin:0;color:var(--muted);line-height:1.6}.full{width:100%;margin-top:8px}.submitted{display:grid;min-height:300px;place-items:center;text-align:center}.submitted h2{margin:0;color:var(--pd)}.submitted p{max-width:510px}.privacy{display:grid;gap:10px;width:100%;margin-top:17px;padding:14px;border:1px solid rgba(0,172,193,.26);border-radius:10px;background:rgba(0,172,193,.045);text-align:left}.privacy-kicker{margin:0;color:var(--pd);font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.privacy-copy{margin:0;color:var(--muted);font-size:.79rem;line-height:1.55}.privacy details{border:1px solid rgba(20,92,99,.16);border-radius:8px;background:rgba(255,255,255,.78);color:var(--text)}.privacy summary{padding:10px 11px;cursor:pointer;color:var(--pd);font-size:.78rem;font-weight:800}.privacy .privacy-details{padding:0 11px 11px;color:var(--muted);font-size:.75rem;line-height:1.5}.privacy ul{display:grid;gap:6px;margin:0;padding-left:17px}.consent{display:flex;align-items:flex-start;gap:9px;cursor:pointer;color:var(--text);font-size:.79rem;font-weight:700;line-height:1.42}.consent input{width:17px;height:17px;min-height:0;flex:0 0 17px;margin:1px 0 0;accent-color:var(--p)}@media(max-width:520px){main{width:min(100% - 22px,720px);padding:22px 0}.card{padding:18px}.actions{flex-wrap:wrap}.actions .btn{flex:1 1 130px}}
</style>
</head>
<body>
<main>
  <div class="brand"><span class="mark">K</span><span>Kelp form preview</span></div>
  <div class="card" id="app"></div>
</main>
<script>
const formState=${safeState};
let pageIndex=0;
let submitted=false;
let privacyAccepted=false;
const answers={fields:{},questions:{}};
const app=document.getElementById('app');
const definitions={fullName:{label:'Full name',type:'text',placeholder:'Example: Ana Silva'},birthdate:{label:'Birthdate',type:'date',placeholder:''},email:{label:'E-mail address',type:'email',placeholder:'name@example.com'},phone:{label:'Phone number',type:'tel',placeholder:'Example: +55 11 99999-9999'}};
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
function pages(){const result=[];const greeting=formState.blocks.find(b=>b.kind==='greeting');const goodbye=formState.blocks.find(b=>b.kind==='goodbye');const middle=formState.blocks.filter(b=>b.kind!=='greeting'&&b.kind!=='goodbye');if(greeting){result.push({type:'greeting',block:greeting,questions:[]})}else{result.push({type:'consent',block:{title:'Before we begin',body:'Please review the required privacy notice before continuing to this form.',buttonText:'Continue to form'},questions:[]})}let current=null;for(const block of middle){if(block.kind==='phase'){if(current)result.push(current);current={type:'phase',block,questions:[]};continue}if(block.kind==='question'){if(!current)current={type:'questions',block:{title:'Questions',description:''},questions:[]};current.questions.push(block)}}if(current)result.push(current);if(goodbye)result.push({type:'goodbye',block:goodbye,questions:[]});return result}
function firstQuestionIndex(){return pages().findIndex(p=>p.type==='questions'||p.type==='phase')}
function header(){return '<div class="meta"><h1>'+esc(formState.meta.title||'Untitled form')+'</h1>'+(formState.meta.audience?'<p class="audience">'+esc(formState.meta.audience)+'</p>':'')+(formState.meta.description?'<p class="description">'+esc(formState.meta.description)+'</p>':'')+'</div>'}
function respondentFields(){const config=formState.meta.respondentFields||{};return Object.keys(definitions).filter(key=>config[key]&&config[key].enabled)}
function privacyNotice(){return '<section class="privacy" aria-label="Privacy notice and data use terms"><p class="privacy-kicker">Privacy notice and data use terms</p><p class="privacy-copy">Kelp and the tutor may process the answers and contact details submitted through this form to administer the activity, support the learning plan, and communicate about the tutoring service.</p><details><summary>Read how information in this form will be handled</summary><div class="privacy-details"><ul><li>Only the fields enabled in this form, the answers you provide, and the date of submission are requested here.</li><li>Your tutor uses this information to follow up on the activity and tailor support, materials, or communication.</li><li>Do not submit information that is unnecessary for the purpose of this form.</li><li>For questions about your information or this activity, contact the tutor or Kelp through the service channel provided to you.</li></ul></div></details><label class="consent"><input type="checkbox" data-privacy-consent '+(privacyAccepted?'checked':'')+' /><span>I have read and agree with the Privacy Notice and Data Use Terms.</span></label></section>'}
function renderFields(){const config=formState.meta.respondentFields||{};const fields=respondentFields();if(!fields.length)return '';return '<div class="field-list">'+fields.map(key=>{const field=definitions[key];const rules=config[key];const verification=rules.verify?'Verification will be requested after submission.':'';return '<section class="field"><label>'+esc(field.label)+(rules.required?'<span class="required"> *</span>':'')+'</label><input type="'+field.type+'" data-respondent-field="'+key+'" placeholder="'+esc(field.placeholder)+'" value="'+esc(answers.fields[key]||'')+'" />'+(verification?'<p class="hint">'+verification+'</p>':'')+'</section>'}).join('')+'</div>'}
function inputFor(q){const name='q-'+q.id;if(q.type==='short-answer')return '<input type="text" data-question="'+esc(q.id)+'" placeholder="Your answer" value="'+esc(answers.questions[q.id]||'')+'" />';if(q.type==='long-answer')return '<textarea data-question="'+esc(q.id)+'" placeholder="Write your answer">'+esc(answers.questions[q.id]||'')+'</textarea>';if(q.type==='number')return '<input type="number" data-question="'+esc(q.id)+'" placeholder="Enter a number" value="'+esc(answers.questions[q.id]||'')+'" />';const options=q.type==='true-false'?['True','False']:q.options;const kind=q.type==='multiple-answer'?'checkbox':'radio';return '<div class="choices">'+options.map(o=>{const current=answers.questions[q.id];const checked=kind==='checkbox'?Array.isArray(current)&&current.includes(o):current===o;return '<label class="choice"><input type="'+kind+'" name="'+name+'" data-question="'+esc(q.id)+'" value="'+esc(o)+'" '+(checked?'checked':'')+' /><span>'+esc(o||'Untitled option')+'</span></label>'}).join('')+'</div>'}
function question(q){return '<section class="question"><label>'+esc(q.prompt||'Untitled question')+(q.required?'<span class="required"> *</span>':'')+'</label>'+(q.helpText?'<p class="hint">'+esc(q.helpText)+'</p>':'')+inputFor(q)+'</section>'}
function render(){const all=pages();pageIndex=Math.max(0,Math.min(pageIndex,all.length-1));if(submitted){app.innerHTML='<section class="submitted"><div><h2>Submitted</h2><p class="description">Your response is locked in this completed view. This standalone preview does not save information anywhere yet.</p></div></section>';return}const page=all[pageIndex];const progress='<div class="progress"><span style="width:'+((pageIndex+1)/all.length*100)+'%"></span></div>';let content=header()+progress;if(page.type==='greeting'||page.type==='consent'){const title=page.type==='consent'?'Before we begin':(page.block.title||'Welcome');const body=page.type==='consent'?'Please review the required privacy notice before continuing to this form.':(page.block.body||'');const buttonText=page.type==='consent'?'Continue to form':(page.block.buttonText||'Start form');content+='<section class="welcome"><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p>'+privacyNotice()+'<p class="error" id="error">'+(privacyAccepted?'':'You must confirm the privacy notice before continuing.')+'</p><button class="btn primary full" data-action="next" '+(privacyAccepted?'':'disabled')+'>'+esc(buttonText)+'</button></section>'}if(page.type==='questions'||page.type==='phase'){content+='<h2 class="page-title">'+esc(page.block.title||'Questions')+'</h2>'+(page.block.description?'<p class="page-copy">'+esc(page.block.description)+'</p>':'')+(pageIndex===firstQuestionIndex()?renderFields():'')+'<div class="question-list">'+(page.questions.length?page.questions.map(question).join(''):'<p class="description">This phase has no questions yet.</p>')+'</div><p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev" '+(pageIndex===0?'disabled':'')+'>Previous</button><button class="btn primary" data-action="next">Next</button></div>'}if(page.type==='goodbye')content+='<section class="thanks"><h2>'+esc(page.block.title||'Thank you')+'</h2><p>'+esc(page.block.body||'')+'</p><p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev">Previous</button><button class="btn primary" data-action="submit">'+esc(page.block.buttonText||'Submit form')+'</button></div></section>';app.innerHTML=content}
function saveInput(el){if(el.dataset.respondentField){answers.fields[el.dataset.respondentField]=el.value;return}const id=el.dataset.question;if(!id)return;if(el.type==='checkbox'){answers.questions[id]=[...document.querySelectorAll('input[data-question="'+CSS.escape(id)+'"]:checked')].map(node=>node.value);return}answers.questions[id]=el.value}
function fieldError(key,value){if(key==='fullName'){const words=String(value||'').trim().split(' ').filter(Boolean);return words.length>=2&&words.every(word=>word.length>=2)?'':'Enter at least a first and last name.'}if(key==='birthdate'){if(!value)return 'Enter a valid birthdate.';const date=new Date(value+'T00:00:00');const today=new Date();return Number.isNaN(date.getTime())||date>today?'Enter a birthdate in the past.':''}if(key==='email'){const text=String(value||'').trim();return text.includes('@')&&text.includes('.')&&text.indexOf('@')>0&&text.lastIndexOf('.')>text.indexOf('@')+1?'':'Enter an e-mail address in a valid format.'}if(key==='phone'){const digits=[...String(value||'')].filter(ch=>ch>='0'&&ch<='9').length;return digits>=8&&digits<=15?'':'Enter a phone number with 8 to 15 digits.'}return ''}
function validatePage(){const all=pages();const page=all[pageIndex];if((page.type==='greeting'||page.type==='consent')&&!privacyAccepted){const error=document.getElementById('error');if(error)error.textContent='You must confirm the privacy notice before continuing.';return false}const errors=[];if(pageIndex===firstQuestionIndex()){const config=formState.meta.respondentFields||{};respondentFields().forEach(key=>{const rules=config[key];const value=answers.fields[key]||'';if(rules.required&&!String(value).trim())errors.push('Please complete '+definitions[key].label+'.');else if(String(value).trim()){const message=fieldError(key,value);if(message)errors.push(message)}})}if(page.type==='questions'||page.type==='phase'){page.questions.filter(q=>q.required).forEach(q=>{const value=answers.questions[q.id];if(Array.isArray(value)?value.length===0:!String(value||'').trim())errors.push('Please answer '+(q.prompt||'this question')+'.')})}if(!errors.length)return true;const error=document.getElementById('error');if(error)error.textContent=errors[0];return false}
function validateAll(){const original=pageIndex;const all=pages();for(let index=0;index<all.length;index+=1){pageIndex=index;if(!validatePage()){pageIndex=original;return false}}pageIndex=original;return true}
app.addEventListener('input',e=>{if(e.target.matches('[data-question],[data-respondent-field]'))saveInput(e.target)});app.addEventListener('change',e=>{if(e.target.matches('[data-privacy-consent]')){privacyAccepted=e.target.checked;render();return}if(e.target.matches('[data-question],[data-respondent-field]'))saveInput(e.target)});app.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;if(action==='prev'){pageIndex=Math.max(0,pageIndex-1);render();return}if(action==='next'){if(!validatePage())return;pageIndex=Math.min(pages().length-1,pageIndex+1);render();return}if(action==='submit'){if(!validateAll()){const all=pages();for(let index=0;index<all.length;index+=1){pageIndex=index;if(!validatePage())break}render();return}submitted=true;render()}});render();
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
    }, 4200);
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

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
