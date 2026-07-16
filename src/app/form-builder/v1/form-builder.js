(() => {
  'use strict';

  const STORAGE_KEY = 'kelp-form-builder-draft-v1';
  const QUESTION_TYPES = {
    'short-answer': { label: 'Short answer', helper: 'One concise written response.' },
    'long-answer': { label: 'Long answer', helper: 'A fuller written response.' },
    'multiple-choice': { label: 'Multiple choice', helper: 'Respondent selects one option.' },
    'multiple-answer': { label: 'Multiple answer', helper: 'Respondent may select more than one option.' },
    number: { label: 'Number', helper: 'Respondent enters a numeric value.' },
    'true-false': { label: 'True / false', helper: 'Respondent selects one of two fixed options.' }
  };

  const defaultState = () => ({
    meta: {
      title: 'Student Check-in',
      audience: 'Current students',
      description: 'Your answers help me adapt our next lessons and materials.',
      collectName: true
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
  let lastMessageTimer = null;

  const els = {
    title: document.getElementById('formTitle'),
    audience: document.getElementById('formAudience'),
    description: document.getElementById('formDescription'),
    collectName: document.getElementById('collectName'),
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
    hydrateMetaFields();
    bindStaticEvents();
    renderAll();
  }

  function bindStaticEvents() {
    els.title.addEventListener('input', () => updateMeta('title', els.title.value));
    els.audience.addEventListener('input', () => updateMeta('audience', els.audience.value));
    els.description.addEventListener('input', () => updateMeta('description', els.description.value));
    els.collectName.addEventListener('change', () => updateMeta('collectName', els.collectName.checked));

    els.addGreeting.addEventListener('click', () => addBlock('greeting'));
    els.addQuestion.addEventListener('click', () => addBlock('question'));
    els.addPhase.addEventListener('click', () => addBlock('phase'));
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
      const callToAction = event.target.closest('.form-builder-preview-cta');
      if (!callToAction) return;

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
      collapsed: false,
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
      collapsed: false,
      ...overrides
    };
  }

  function createPhase(overrides = {}) {
    return {
      id: createId('phase'),
      kind: 'phase',
      title: 'New phase',
      description: 'Introduce the next group of questions here.',
      collapsed: false,
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
      collapsed: false,
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
    els.collectName.checked = state.meta.collectName;
  }

  function renderAll() {
    normalizeState();
    hydrateMetaFields();
    renderBlockList();
    renderPreview();
    updateAddButtons();
    els.countPill.textContent = `${state.blocks.length} ${state.blocks.length === 1 ? 'block' : 'blocks'}`;
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
            <button type="button" class="form-builder-icon-button" data-action="move-up" aria-label="Move block up" title="Move up" ${canMove(index, -1) ? '' : 'disabled'}>↑</button>
            <button type="button" class="form-builder-icon-button" data-action="move-down" aria-label="Move block down" title="Move down" ${canMove(index, 1) ? '' : 'disabled'}>↓</button>
            ${block.kind === 'question' ? '<button type="button" class="form-builder-icon-button" data-action="duplicate" aria-label="Duplicate question" title="Duplicate">⧉</button>' : ''}
            <button type="button" class="form-builder-icon-button" data-action="toggle" aria-label="${block.collapsed ? 'Expand block' : 'Collapse block'}" title="${block.collapsed ? 'Expand' : 'Collapse'}">${block.collapsed ? '⌄' : '–'}</button>
            <button type="button" class="form-builder-icon-button danger" data-action="remove" aria-label="Remove block" title="Remove">×</button>
          </div>
        </header>
        <div class="form-builder-block-body">
          ${renderBlockBody(block)}
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

    if (['greeting', 'phase', 'goodbye'].includes(block.kind)) {
      title.textContent = block.title?.trim() || 'Untitled page';
    }
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
      renderBlockList();
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
      state.blocks.splice(index, 1);
      showMessage('Block removed.');
      renderAll();
      return;
    }

    if (action === 'duplicate') {
      const duplicate = createQuestion({ ...structuredCloneSafe(block), id: createId('question'), collapsed: false });
      state.blocks.splice(index + 1, 0, duplicate);
      showMessage('Question duplicated.');
      renderAll();
      return;
    }

    if (action === 'add-option') {
      block.options.push(`Option ${block.options.length + 1}`);
      renderAll();
      return;
    }

    if (action === 'remove-option') {
      const optionIndex = Number(button.dataset.optionIndex);
      if (block.options.length > 2) block.options.splice(optionIndex, 1);
      renderAll();
    }
  }

  function addBlock(kind) {
    if (kind === 'greeting') {
      if (state.blocks.some((block) => block.kind === 'greeting')) {
        showMessage('This form already has a greeting page.', true);
        return;
      }
      state.blocks.unshift(createGreeting());
      showMessage('Greeting page added at the start of the form.');
    }

    if (kind === 'goodbye') {
      if (state.blocks.some((block) => block.kind === 'goodbye')) {
        showMessage('This form already has a goodbye page.', true);
        return;
      }
      state.blocks.push(createGoodbye());
      showMessage('Goodbye page added at the end of the form.');
    }

    if (kind === 'question') {
      insertBeforeGoodbye(createQuestion());
      showMessage('Question added.');
    }

    if (kind === 'phase') {
      insertBeforeGoodbye(createPhase());
      showMessage('Phase added. Questions after it will appear on a new page.');
    }

    renderAll();
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
    const [block] = state.blocks.splice(index, 1);
    state.blocks.splice(index + direction, 0, block);
    renderAll();
  }

  function getBlockById(id) {
    return state.blocks.find((block) => block.id === id);
  }

  function normalizeState() {
    if (!state || typeof state !== 'object') state = defaultState();
    if (!state.meta || typeof state.meta !== 'object') state.meta = defaultState().meta;
    if (!Array.isArray(state.blocks)) state.blocks = [];

    state.meta = {
      title: String(state.meta.title ?? ''),
      audience: String(state.meta.audience ?? ''),
      description: String(state.meta.description ?? ''),
      collectName: Boolean(state.meta.collectName)
    };

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

  function buildPreviewPages() {
    const pages = [];
    const greeting = state.blocks.find((block) => block.kind === 'greeting');
    const goodbye = state.blocks.find((block) => block.kind === 'goodbye');
    const middle = state.blocks.filter((block) => block.kind !== 'greeting' && block.kind !== 'goodbye');

    if (greeting) pages.push({ type: 'greeting', block: greeting, questions: [] });

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

    if (!pages.length) {
      pages.push({ type: 'empty', block: null, questions: [] });
    }

    return pages;
  }

  function renderPreview() {
    const pages = buildPreviewPages();
    previewPageIndex = Math.max(0, Math.min(previewPageIndex, pages.length - 1));
    const page = pages[previewPageIndex];

    els.previewPageCount.textContent = `Page ${previewPageIndex + 1} of ${pages.length}`;
    els.previewPrevious.disabled = previewPageIndex === 0;
    els.previewNext.disabled = previewPageIndex === pages.length - 1;
    els.previewNext.textContent = page.type === 'goodbye' ? 'Done' : 'Next';

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

    if (page.type === 'empty') {
      return `${formHeader}<div class="form-builder-preview-empty"><p>Add a greeting, question, or phase to see a student-facing form page here.</p></div>`;
    }

    if (page.type === 'greeting') {
      return `
        ${formHeader}
        <section class="form-builder-preview-confirmation">
          <h3>${escapeHtml(page.block.title || 'Welcome')}</h3>
          <p>${escapeHtml(page.block.body || 'Introduce the form here.')}</p>
          <button type="button" class="form-builder-preview-cta">${escapeHtml(page.block.buttonText || 'Start form')}</button>
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

    return `
      ${formHeader}
      <h3 class="form-builder-preview-page-title">${escapeHtml(page.block.title || 'Questions')}</h3>
      ${page.block.description ? `<p class="form-builder-preview-page-copy">${escapeHtml(page.block.description)}</p>` : ''}
      ${state.meta.collectName && previewPageIndex === firstQuestionPageIndex() ? renderNamePreview() : ''}
      <div class="form-builder-preview-question-list">
        ${page.questions.length ? page.questions.map(renderPreviewQuestion).join('') : '<div class="form-builder-preview-empty"><p>This phase has no questions yet. Add a question below it in the editor.</p></div>'}
      </div>
    `;
  }

  function firstQuestionPageIndex() {
    const pages = buildPreviewPages();
    return pages.findIndex((page) => page.type === 'questions' || page.type === 'phase');
  }

  function renderNamePreview() {
    return `
      <div class="form-builder-preview-name-field">
        <label>Your name <span class="form-builder-required-star">*</span></label>
        <input class="form-builder-preview-text-field" type="text" placeholder="Type your name" />
      </div>
    `;
  }

  function renderPreviewQuestion(question) {
    const prompt = escapeHtml(question.prompt || 'Untitled question');
    const help = question.helpText ? `<p class="form-builder-preview-question-help">${escapeHtml(question.helpText)}</p>` : '';
    const required = question.required ? '<span class="form-builder-required-star">*</span>' : '';

    let input = '';
    if (question.type === 'short-answer') {
      input = '<input class="form-builder-preview-text-field" type="text" placeholder="Your answer" />';
    }
    if (question.type === 'long-answer') {
      input = '<textarea class="form-builder-preview-textarea" placeholder="Write your answer"></textarea>';
    }
    if (question.type === 'number') {
      input = '<input class="form-builder-preview-number-field" type="number" placeholder="Enter a number" />';
    }
    if (question.type === 'true-false') {
      input = renderPreviewChoices(question, ['True', 'False'], 'radio');
    }
    if (question.type === 'multiple-choice') {
      input = renderPreviewChoices(question, question.options, 'radio');
    }
    if (question.type === 'multiple-answer') {
      input = renderPreviewChoices(question, question.options, 'checkbox');
    }

    return `
      <article class="form-builder-preview-question">
        <div class="form-builder-preview-question-label">${prompt} ${required}</div>
        ${help}
        ${input}
      </article>
    `;
  }

  function renderPreviewChoices(question, options, inputType) {
    const inputName = `preview-${escapeAttribute(question.id)}`;
    return `
      <div class="form-builder-preview-choice-list">
        ${options
          .map(
            (option) => `
            <label class="form-builder-preview-choice">
              <input type="${inputType}" name="${inputName}" />
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
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
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
    downloadFile(`${fileName}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2), 'application/json');
    showMessage('JSON export prepared.');
  }

  async function importJson(event) {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      state = {
        meta: imported.meta || {},
        blocks: imported.blocks || []
      };
      previewPageIndex = 0;
      renderAll();
      showMessage('Form imported successfully.');
    } catch (error) {
      showMessage('That file is not a valid Kelp form JSON file.', true);
    }
  }

  function resetForm() {
    const confirmed = window.confirm('Reset the current form? This only clears the editor. A saved browser draft will remain available.');
    if (!confirmed) return;
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
:root{--p:#00acc1;--pd:#145c63;--s:#5fae63;--text:#383838;--muted:rgba(33,33,33,.65);--border:#e5ece8}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,rgba(86,241,255,.42),transparent 34%),radial-gradient(circle at bottom right,rgba(95,174,99,.12),transparent 32%),linear-gradient(135deg,#fcfcfc 0%,#eef8fb 45%,#f0faf6 100%);font-family:Inter,sans-serif;color:var(--text)}main{width:min(100% - 32px,720px);margin:0 auto;padding:42px 0}.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;color:var(--pd);font-size:.85rem;font-weight:800}.mark{display:grid;width:30px;height:30px;place-items:center;border:2px solid var(--p);border-radius:9px;color:var(--p)}.card{padding:28px;border:1px solid var(--border);border-radius:16px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(33,33,33,.08)}.progress{height:6px;margin:0 0 23px;border-radius:999px;background:#e7f1ef;overflow:hidden}.progress span{display:block;height:100%;background:var(--s);transition:width .2s}.meta{margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid var(--s)}.meta h1{margin:0;color:var(--text);font-size:clamp(1.55rem,4vw,2rem);line-height:1.15;letter-spacing:-.04em}.audience{margin:5px 0 0;color:var(--pd);font-size:.76rem;font-weight:800}.description{margin:9px 0 0;color:var(--muted);font-size:.9rem;line-height:1.55}.page-title{margin:4px 0 7px;font-size:1.2rem}.page-copy{margin:0 0 20px;color:var(--muted);line-height:1.55}.question-list{display:grid;gap:16px}.question{display:grid;gap:8px;padding:15px;border:1px solid var(--border);border-radius:12px;background:white}.question label,.name label{font-size:.92rem;font-weight:700}.help{margin:-2px 0 0;color:var(--muted);font-size:.8rem}.required{color:#b53f3f}input[type=text],input[type=number],textarea{width:100%;min-height:44px;padding:0 12px;border:1px solid #c9c9c9;border-radius:9px;background:white;color:var(--text);font:inherit;outline:none}textarea{min-height:112px;padding:11px 12px;resize:vertical}input:focus,textarea:focus{border-color:var(--s);box-shadow:0 0 0 4px rgba(0,172,193,.12)}.name{display:grid;gap:8px;margin:0 0 16px;padding:13px;border:1px solid rgba(0,172,193,.2);border-radius:12px;background:rgba(0,172,193,.035)}.choices{display:grid;gap:10px}.choice{display:flex;align-items:center;gap:9px;color:var(--text);font-size:.9rem}.choice input{width:16px;height:16px;margin:0;accent-color:var(--p)}.actions{display:flex;justify-content:space-between;gap:10px;margin-top:24px}.btn{min-height:42px;padding:0 15px;border:1px solid #bdbdbd;border-radius:9px;background:white;color:var(--text);font:inherit;font-size:.87rem;font-weight:700;cursor:pointer}.btn:hover{border-color:var(--p);background:rgba(0,172,193,.08)}.btn.primary{border-color:var(--p);background:var(--p);color:white}.btn.primary:hover{background:#0099ab}.error{margin:13px 0 0;color:#b53f3f;font-size:.84rem;font-weight:600}.welcome,.thanks{display:grid;min-height:300px;align-content:center;justify-items:center;gap:12px;text-align:center}.welcome h2,.thanks h2{margin:0;color:var(--pd);font-size:1.6rem}.welcome p,.thanks p{max-width:500px;margin:0;color:var(--muted);line-height:1.6}.full{width:100%;margin-top:8px}.submitted{display:grid;min-height:300px;place-items:center;text-align:center}.submitted h2{margin:0;color:var(--pd)}@media(max-width:520px){main{width:min(100% - 22px,720px);padding:22px 0}.card{padding:18px}.actions{flex-wrap:wrap}.actions .btn{flex:1 1 130px}}
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
const answers={};
const app=document.getElementById('app');
const esc=(value)=>String(value??'').replace(/[&<>"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
function pages(){const result=[];const greeting=formState.blocks.find(b=>b.kind==='greeting');const goodbye=formState.blocks.find(b=>b.kind==='goodbye');const middle=formState.blocks.filter(b=>b.kind!=='greeting'&&b.kind!=='goodbye');if(greeting)result.push({type:'greeting',block:greeting,questions:[]});let current=null;for(const block of middle){if(block.kind==='phase'){if(current)result.push(current);current={type:'phase',block,questions:[]};continue}if(block.kind==='question'){if(!current)current={type:'questions',block:{title:'Questions',description:''},questions:[]};current.questions.push(block)}}if(current)result.push(current);if(goodbye)result.push({type:'goodbye',block:goodbye,questions:[]});if(!result.length)result.push({type:'empty',block:null,questions:[]});return result}
function header(){return '<div class="meta"><h1>'+esc(formState.meta.title||'Untitled form')+'</h1>'+(formState.meta.audience?'<p class="audience">'+esc(formState.meta.audience)+'</p>':'')+(formState.meta.description?'<p class="description">'+esc(formState.meta.description)+'</p>':'')+'</div>'}
function inputFor(q){const name='q-'+q.id;if(q.type==='short-answer')return '<input type="text" data-question="'+esc(q.id)+'" placeholder="Your answer" value="'+esc(answers[q.id]||'')+'" />';if(q.type==='long-answer')return '<textarea data-question="'+esc(q.id)+'" placeholder="Write your answer">'+esc(answers[q.id]||'')+'</textarea>';if(q.type==='number')return '<input type="number" data-question="'+esc(q.id)+'" placeholder="Enter a number" value="'+esc(answers[q.id]||'')+'" />';const options=q.type==='true-false'?['True','False']:q.options;const kind=q.type==='multiple-answer'?'checkbox':'radio';return '<div class="choices">'+options.map((o,i)=>{const current=answers[q.id];const checked=kind==='checkbox'?Array.isArray(current)&&current.includes(o):current===o;return '<label class="choice"><input type="'+kind+'" name="'+name+'" data-question="'+esc(q.id)+'" value="'+esc(o)+'" '+(checked?'checked':'')+' /><span>'+esc(o||'Untitled option')+'</span></label>'}).join('')+'</div>'}
function question(q){return '<section class="question"><label>'+esc(q.prompt||'Untitled question')+(q.required?'<span class="required"> *</span>':'')+'</label>'+(q.helpText?'<p class="help">'+esc(q.helpText)+'</p>':'')+inputFor(q)+'</section>'}
function render(){const all=pages();pageIndex=Math.max(0,Math.min(pageIndex,all.length-1));if(submitted){app.innerHTML='<section class="submitted"><div><h2>Submitted</h2><p class="description">This preview does not save answers anywhere yet.</p></div></section>';return}const page=all[pageIndex];const progress='<div class="progress"><span style="width:'+((pageIndex+1)/all.length*100)+'%"></span></div>';let content=header()+progress;if(page.type==='empty')content+='<section class="thanks"><h2>Nothing here yet</h2><p>Add blocks in the builder to create a form.</p></section>';if(page.type==='greeting')content+='<section class="welcome"><h2>'+esc(page.block.title||'Welcome')+'</h2><p>'+esc(page.block.body||'')+'</p><button class="btn primary full" data-action="next">'+esc(page.block.buttonText||'Start form')+'</button></section>';if(page.type==='goodbye')content+='<section class="thanks"><h2>'+esc(page.block.title||'Thank you')+'</h2><p>'+esc(page.block.body||'')+'</p><button class="btn primary full" data-action="submit">'+esc(page.block.buttonText||'Submit form')+'</button></section>';if(page.type==='questions'||page.type==='phase'){content+='<h2 class="page-title">'+esc(page.block.title||'Questions')+'</h2>'+(page.block.description?'<p class="page-copy">'+esc(page.block.description)+'</p>':'')+(formState.meta.collectName&&pageIndex===all.findIndex(p=>p.type==='questions'||p.type==='phase')?'<div class="name"><label>Your name <span class="required">*</span></label><input type="text" data-question="respondent-name" placeholder="Type your name" value="'+esc(answers['respondent-name']||'')+'" /></div>':'')+'<div class="question-list">'+(page.questions.length?page.questions.map(question).join(''):'<p class="description">This phase has no questions yet.</p>')+'</div>'}if(page.type!=='greeting'&&page.type!=='goodbye'&&page.type!=='empty'){content+='<p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev" '+(pageIndex===0?'disabled':'')+'>Previous</button><button class="btn primary" data-action="next">'+(pageIndex===all.length-1?'Finish':'Next')+'</button></div>'}app.innerHTML=content}
function saveAnswer(el){const id=el.dataset.question;if(!id)return;if(el.type==='checkbox'){const checked=[...document.querySelectorAll('input[data-question="'+CSS.escape(id)+'"]:checked')].map(node=>node.value);answers[id]=checked;return}answers[id]=el.value}
function validate(){const all=pages();const page=all[pageIndex];if(!(page.type==='questions'||page.type==='phase'))return true;const required=[];if(formState.meta.collectName&&pageIndex===all.findIndex(p=>p.type==='questions'||p.type==='phase'))required.push({id:'respondent-name',label:'your name'});page.questions.filter(q=>q.required).forEach(q=>required.push({id:q.id,label:q.prompt||'this question'}));const missing=required.filter(item=>{const value=answers[item.id];return Array.isArray(value)?value.length===0:!String(value||'').trim()});if(!missing.length)return true;const error=document.getElementById('error');if(error)error.textContent='Please answer '+(missing.length===1?missing[0].label:'all required questions')+' before continuing.';return false}
app.addEventListener('input',e=>{if(e.target.matches('[data-question]'))saveAnswer(e.target)});app.addEventListener('change',e=>{if(e.target.matches('[data-question]'))saveAnswer(e.target)});app.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;if(action==='prev'){pageIndex--;render();return}if(action==='submit'){if(validate()){submitted=true;render()}return}if(action==='next'){const page=pages()[pageIndex];if(page.type==='greeting'){pageIndex++;render();return}if(!validate())return;if(pageIndex>=pages().length-1){submitted=true}else{pageIndex++}render()}});render();
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
