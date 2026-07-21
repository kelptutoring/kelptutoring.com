(() => {
  'use strict';

  const STORAGE_KEY = 'kelp-form-builder-draft-v3';
  const LEGACY_STORAGE_KEYS = ['kelp-form-builder-draft-v2', 'kelp-form-builder-draft-v1'];
  const STUDENT_VIEW_HANDOFF_SCHEMA = 'kelp-form-taker-handoff-v1';
  const STUDENT_VIEW_STORAGE_KEY = 'kelp:form-taker:v1:active';
  const STUDENT_VIEW_READY_MESSAGE = 'kelp:form-taker:ready';
  const STUDENT_VIEW_LOAD_MESSAGE = 'kelp:form-taker:load';
  const STUDENT_VIEW_LOADED_MESSAGE = 'kelp:form-taker:loaded';
  const TRANSITION_MS = 1200;
  const PREVIEW_TOGGLE_MS = 2700;
  const PREVIEW_COLLAPSE_SETTLE_MS = 2150;
  const PREVIEW_RETURN_MS = 950;
  const PRINT_ANSWER_SPACE_SIZES_MM = Object.freeze({ small: 35, medium: 60, large: 95 });
  const PRINTABLE_FORM_CSS = `
    @page { size: A4 portrait; margin: 14mm 14mm 16mm; }
    .form-builder-print-document, .form-builder-print-document * { box-sizing: border-box; }
    .form-builder-print-document {
      color: #263633;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.42;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .form-builder-print-sheet { width: 100%; margin: 0; }
    .form-builder-print-paper-header {
      margin: 0 0 7mm;
      padding: 0 0 5mm;
      border-bottom: 1.1mm solid #00a8ba;
    }
    .form-builder-print-brand {
      margin: 0 0 2mm;
      color: #006974;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .form-builder-print-paper-header h1 {
      margin: 0;
      color: #243331;
      font-size: 22pt;
      line-height: 1.12;
      overflow-wrap: anywhere;
    }
    .form-builder-print-audience { margin: 1.6mm 0 0; color: #006974; font-size: 9pt; font-weight: 700; }
    .form-builder-print-description { max-width: 170mm; margin: 2.3mm 0 0; color: #52605d; }
    .form-builder-print-route-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 2mm 5mm;
      margin: 3.2mm 0 0;
      color: #52605d;
      font-size: 8pt;
    }
    .form-builder-print-route-meta strong { color: #263633; }
    .form-builder-print-intro,
    .form-builder-print-consent,
    .form-builder-print-identity {
      margin: 0 0 5mm;
      padding: 4mm;
      border: .35mm solid #d7e3df;
      border-radius: 3mm;
      background: #f8fbfa;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .form-builder-print-intro h2,
    .form-builder-print-identity h2 { margin: 0 0 1.5mm; color: #243331; font-size: 13pt; }
    .form-builder-print-intro p,
    .form-builder-print-consent p { margin: 0; color: #52605d; }
    .form-builder-print-consent strong { display: block; margin-bottom: 1.2mm; color: #006974; }
    .form-builder-print-consent-check { display: flex; align-items: flex-start; gap: 2mm; margin-top: 3mm; color: #263633; font-size: 9pt; font-weight: 700; }
    .form-builder-print-check-box {
      width: 4mm;
      height: 4mm;
      flex: 0 0 4mm;
      margin-top: .25mm;
      border: .35mm solid #6f7c79;
      background: #fff;
    }
    .form-builder-print-identity-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm 6mm; }
    .form-builder-print-identity-field { min-width: 0; }
    .form-builder-print-identity-field span { display: block; margin-bottom: 1.5mm; color: #263633; font-size: 8.5pt; font-weight: 700; }
    .form-builder-print-write-line { height: 5mm; border-bottom: .3mm solid #7d8986; }
    .form-builder-print-phase { margin: 0 0 6mm; break-inside: auto; page-break-inside: auto; }
    .form-builder-print-phase-heading {
      margin: 0 0 3.5mm;
      padding: 3.4mm 4mm;
      border: .35mm solid var(--phase-selection-ring, #cfe3df);
      border-left: 1.2mm solid var(--phase-selection, #00a8ba);
      border-radius: 2.5mm;
      background: var(--phase-background-faint, #f4fbfc);
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      page-break-after: avoid;
    }
    .form-builder-print-phase-heading h2 { margin: 0; color: #243331; font-size: 14pt; line-height: 1.2; }
    .form-builder-print-phase-heading p { margin: 1.3mm 0 0; color: #52605d; font-size: 9pt; }
    .form-builder-print-phase-heading + .form-builder-print-question { break-before: avoid; page-break-before: avoid; }
    .form-builder-print-question {
      margin: 0 0 4.5mm;
      padding: 4mm;
      border: .35mm solid #d9e2df;
      border-radius: 3mm;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .form-builder-print-question.is-answer-continuation {
      break-before: page;
      page-break-before: always;
    }
    .form-builder-print-question-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; }
    .form-builder-print-question-heading strong { color: #006974; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; }
    .form-builder-print-question-heading span { color: #6c7775; font-size: 7.5pt; }
    .form-builder-print-prompt { margin: 2mm 0 0; color: #202c2a; font-size: 11pt; font-weight: 700; overflow-wrap: anywhere; }
    .form-builder-print-required { color: #b53f3f; }
    .form-builder-print-help { margin: 1.4mm 0 0; color: #66726f; font-size: 8.5pt; }
    .form-builder-print-options { display: grid; gap: 2.4mm; margin: 3.2mm 0 0; padding: 0; list-style: none; }
    .form-builder-print-option { display: flex; align-items: flex-start; gap: 2.2mm; min-width: 0; }
    .form-builder-print-option-mark {
      width: 4mm;
      height: 4mm;
      flex: 0 0 4mm;
      margin-top: .3mm;
      border: .35mm solid #65726f;
      background: #fff;
    }
    .form-builder-print-option-mark.is-single { border-radius: 50%; }
    .form-builder-print-option span:last-child { min-width: 0; overflow-wrap: anywhere; }
    .form-builder-print-number-answer { display: flex; align-items: flex-end; gap: 3mm; margin-top: 5mm; color: #52605d; font-size: 8.5pt; }
    .form-builder-print-number-answer .form-builder-print-write-line { min-width: 70mm; flex: 1 1 auto; }
    .form-builder-print-answer-space {
      min-height: var(--print-answer-height, 35mm);
      margin-top: 3.5mm;
      border: .35mm dashed #aab6b2;
      border-radius: 2.5mm;
      background: repeating-linear-gradient(to bottom, transparent 0, transparent 8mm, #edf1f0 8.2mm, transparent 8.4mm);
    }
    .form-builder-print-empty-phase { margin: 0; padding: 3mm 4mm; color: #66726f; font-style: italic; }
    @media screen {
      body.form-print-standalone { margin: 0; padding: 18mm; background: #eef5f3; }
      body.form-print-standalone .form-builder-print-document {
        display: block;
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 14mm 14mm 16mm;
        background: #fff;
        box-shadow: 0 10px 35px rgba(22, 50, 48, .18);
      }
    }
    @media print {
      html, body { width: 100%; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body.is-printing-form > :not(.form-builder-print-document) { display: none !important; }
      body.is-printing-form .form-builder-print-document { display: block !important; width: 100%; margin: 0; padding: 0; }
    }
  `;

  const FormDomain = window.KelpFormDomain;
  if (!FormDomain || !window.KelpFormDomainFactory) {
    throw new Error('Kelp Form Domain must load before the Form Builder.');
  }
  const FormAdapterDomain = window.KelpFormAdapters;
  if (!FormAdapterDomain) {
    throw new Error('Kelp Form Adapters must load before the Form Builder.');
  }
  const {
    QUESTION_TYPES,
    PDF_ANSWER_SPACE_SIZES_MM,
    IDENTITY_FIELDS,
    SUBMISSION_MODES,
    createId,
    createOption,
    normalizePhaseAppearance,
    phaseAppearanceVariables,
    isWrittenQuestionType,
    defaultPdfAnswerSpace,
    normalizePdfAnswerSpace,
    createGreeting,
    createQuestion,
    createPhase,
    createGoodbye,
    defaultTriggerDraft
  } = FormDomain;
  const defaultState = FormDomain.createDefaultState;
  const localFormAdapters = FormAdapterDomain.createLocalAdapters();
  let adapterResolutionError = null;
  let builderAuthorization = null;
  const builderAuthorizationReady = /^https?:$/.test(window.location.protocol)
    ? import('../../auth/auth-guard.js')
      .then(async ({ getCurrentAuthState, getHomePathByRole }) => {
        builderAuthorization = await getCurrentAuthState();
        if (builderAuthorization) {
          const homePath = getHomePathByRole(builderAuthorization.primaryRole);
          document.querySelectorAll('[data-workspace-home]').forEach((link) => {
            link.href = homePath;
          });
        }
        return builderAuthorization;
      })
      .catch(() => null)
    : Promise.resolve(null);
  const formAdaptersReady = Promise.resolve(window.KelpFormProviderReady)
    .catch((error) => {
      adapterResolutionError = error;
    })
    .then(() => FormAdapterDomain.resolveAdapters({
      localAdapters: localFormAdapters,
      context: { formDocumentVersion: FormDomain.FORM_DOCUMENT_VERSION }
    }))
    .catch((error) => {
      adapterResolutionError = error;
      return localFormAdapters;
    });

  function phaseAppearanceStyleAttribute(input) {
    return `style="${phaseAppearanceVariables(input)}"`;
  }

  let state = defaultState();
  let previewPageIndex = 0;
  const previewAnswers = new Set();
  let lastMessageTimer = null;
  let dragSourceId = null;
  let phaseModalState = null;
  let structureModalReturnFocus = null;
  let printModalReturnFocus = null;
  let printInteractionScrollPosition = null;
  let printCleanupTimer = null;
  let printModalState = {
    routeCatalog: { routes: [], truncated: false },
    selectedRouteId: '',
    shortAnswerSize: 'small',
    shortAnswerCustomMm: 35,
    longAnswerSize: 'medium',
    longAnswerCustomMm: 60,
    message: '',
    messageIsError: false
  };

  const els = {
    title: document.getElementById('formTitle'),
    audience: document.getElementById('formAudience'),
    description: document.getElementById('formDescription'),
    submissionMode: document.getElementById('formSubmissionMode'),
    respondentDetailsCard: document.getElementById('respondentDetailsCard'),
    respondentDetailsBody: document.getElementById('respondentDetailsBody'),
    toggleRespondentDetails: document.getElementById('toggleRespondentDetailsBtn'),
    respondentFields: document.getElementById('respondentFields'),
    blockList: document.getElementById('blockList'),
    buildFlowTools: document.getElementById('buildFlowTools'),
    formPreview: document.getElementById('formPreview'),
    editor: document.getElementById('formBuilderEditor'),
    layout: document.getElementById('formBuilderLayout'),
    previewColumn: document.getElementById('preview'),
    previewSticky: document.getElementById('formPreviewSticky'),
    togglePreview: document.getElementById('togglePreviewColumnBtn'),
    previewPageCount: document.getElementById('previewPageCount'),
    previewPrevious: document.getElementById('previewPreviousBtn'),
    previewNext: document.getElementById('previewNextBtn'),
    addGreeting: document.getElementById('addGreetingBtn'),
    addQuestion: document.getElementById('addQuestionBtn'),
    addQuestionAction: document.getElementById('addQuestionActionBtn'),
    addPhase: document.getElementById('addPhaseBtn'),
    addGoodbye: document.getElementById('addGoodbyeBtn'),
    saveDraft: document.getElementById('saveDraftBtn'),
    loadDraft: document.getElementById('loadDraftBtn'),
    saveLibrary: document.getElementById('saveLibraryBtn'),
    openLibrary: document.getElementById('openLibraryBtn'),
    openStructure: document.getElementById('openStructureBtn'),
    exportJson: document.getElementById('exportJsonBtn'),
    importJson: document.getElementById('importJsonInput'),
    openStudentView: document.getElementById('openStudentViewBtn'),
    printForm: document.getElementById('printFormBtn'),
    resetForm: document.getElementById('resetFormBtn'),
    message: document.getElementById('builderMessage'),
    countPill: document.getElementById('blockCountPill'),
    phaseModal: document.getElementById('phaseModal'),
    routingHelp: document.getElementById('routingHelp'),
    phaseModalContent: document.getElementById('phaseModalContent'),
    phaseModalActions: document.getElementById('phaseModalActions'),
    phaseModalTitle: document.getElementById('phaseModalTitle'),
    phaseModalSubtitle: document.getElementById('phaseModalSubtitle'),
    libraryModal: document.getElementById('formLibraryModal'),
    libraryProvider: document.getElementById('formLibraryProvider'),
    libraryList: document.getElementById('formLibraryList'),
    structureModal: document.getElementById('formStructureModal'),
    structureContent: document.getElementById('formStructureContent'),
    printModal: document.getElementById('formPrintModal'),
    printContent: document.getElementById('formPrintContent'),
    printDocument: document.getElementById('formPrintDocument')
  };

  init();

  function init() {
    normalizeState();
    setupContextHelp();
    bindStaticEvents();
    observePreviewBoundary();
    setPreviewCollapsed(els.layout.classList.contains('preview-collapsed'));
    renderAll();
  }

  function observePreviewBoundary() {
    if (!els.editor || typeof window.ResizeObserver !== 'function') return;
    const observer = new window.ResizeObserver(schedulePreviewFollowingUpdate);
    observer.observe(els.editor);
    els.layout._previewBoundaryObserver = observer;
  }

  function bindStaticEvents() {
    els.title.addEventListener('input', () => updateMeta('title', els.title.value));
    els.audience.addEventListener('input', () => updateMeta('audience', els.audience.value));
    els.description.addEventListener('input', () => updateMeta('description', els.description.value));
    els.submissionMode.addEventListener('change', () => {
      state.settings.submissionPolicy.mode = els.submissionMode.value === SUBMISSION_MODES.MULTIPLE
        ? SUBMISSION_MODES.MULTIPLE
        : SUBMISSION_MODES.SINGLE;
    });

    els.toggleRespondentDetails.addEventListener('click', toggleRespondentDetails);
    els.respondentFields.addEventListener('change', handleIdentityChange);

    els.addGreeting.addEventListener('click', () => addBlock('greeting'));
    els.addQuestion.addEventListener('click', () => addBlock('question'));
    els.addQuestionAction.addEventListener('click', () => addBlock('question'));
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

    els.togglePreview.addEventListener('click', togglePreviewColumn);
    window.addEventListener?.('scroll', schedulePreviewFollowingUpdate, { passive: true });
    window.addEventListener?.('resize', schedulePreviewFollowingUpdate);

    els.formPreview.addEventListener('click', (event) => {
      if (!event.target.closest('.form-builder-preview-cta')) return;
      const steps = buildPreviewSteps();
      if (previewPageIndex < steps.length - 1) {
        previewPageIndex += 1;
        renderPreview();
      }
    });
    els.formPreview.addEventListener('input', handlePreviewResponse);
    els.formPreview.addEventListener('change', handlePreviewResponse);

    els.saveDraft.addEventListener('click', saveDraft);
    els.loadDraft.addEventListener('click', loadDraft);
    els.saveLibrary.addEventListener('click', saveToLibrary);
    els.openLibrary.addEventListener('click', openFormLibrary);
    els.openStructure.addEventListener('click', openFormStructure);
    els.exportJson.addEventListener('click', exportJson);
    els.importJson.addEventListener('change', importJson);
    els.openStudentView.addEventListener('click', openStudentView);
    els.printForm.addEventListener('click', openFormPrint);
    els.resetForm.addEventListener('click', resetForm);

    els.blockList.addEventListener('input', handleBlockInput);
    els.blockList.addEventListener('change', handleBlockChange);
    els.blockList.addEventListener('click', handleBlockClick);
    bindDragEvents();

    els.phaseModal.addEventListener('click', handleModalClick);
    els.phaseModal.addEventListener('input', handleModalInput);
    els.phaseModal.addEventListener('change', handleModalChange);
    els.libraryModal.addEventListener('click', handleLibraryClick);
    els.structureModal.addEventListener('click', handleStructureClick);
    els.printModal.addEventListener('click', handlePrintClick);
    els.printModal.addEventListener('pointerdown', handlePrintInteractionStart, true);
    els.printModal.addEventListener('keydown', handlePrintInteractionStart, true);
    els.printModal.addEventListener('change', handlePrintChange);
    window.addEventListener?.('afterprint', finishFormPrint);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.phaseModal.classList.contains('is-open')) closePhaseModal();
      if (event.key === 'Escape' && els.libraryModal.classList.contains('is-open')) closeFormLibrary();
      if (event.key === 'Escape' && els.structureModal.classList.contains('is-open')) closeFormStructure();
      if (event.key === 'Escape' && els.printModal.classList.contains('is-open')) closeFormPrint();
    });
  }

  function setupContextHelp() {
    const buttons = [...document.querySelectorAll('.form-builder-context-help[data-help-text]')];
    if (!buttons.length) return;

    const popover = document.createElement('div');
    popover.className = 'form-builder-context-help-popover';
    popover.setAttribute('role', 'tooltip');
    document.body.appendChild(popover);

    let activeButton = null;
    let pinned = false;

    function positionPopover() {
      if (!activeButton) return;
      const trigger = activeButton.getBoundingClientRect();
      const box = popover.getBoundingClientRect();
      const edge = 12;
      const gap = 8;
      const roomBelow = window.innerHeight - trigger.bottom;
      const preferAbove = activeButton.dataset.helpPosition === 'above' || roomBelow < box.height + gap + edge;
      let top = preferAbove ? trigger.top - box.height - gap : trigger.bottom + gap;
      if (top < edge) top = trigger.bottom + gap;
      if (top + box.height > window.innerHeight - edge) top = Math.max(edge, window.innerHeight - box.height - edge);
      const centredLeft = trigger.left + (trigger.width / 2) - (box.width / 2);
      const left = Math.min(Math.max(edge, centredLeft), Math.max(edge, window.innerWidth - box.width - edge));
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
    }

    function show(button, shouldPin = false) {
      if (!button) return;
      if (activeButton && activeButton !== button) activeButton.setAttribute('aria-expanded', 'false');
      activeButton = button;
      pinned = shouldPin;
      popover.textContent = button.dataset.helpText || '';
      popover.classList.add('is-visible');
      button.setAttribute('aria-expanded', 'true');
      positionPopover();
    }

    function hide(force = false) {
      if (pinned && !force) return;
      if (activeButton) activeButton.setAttribute('aria-expanded', 'false');
      activeButton = null;
      pinned = false;
      popover.classList.remove('is-visible');
    }

    buttons.forEach((button) => {
      button.removeAttribute('title');
      button.addEventListener('pointerenter', () => show(button));
      button.addEventListener('pointerleave', () => hide());
      button.addEventListener('focus', () => show(button));
      button.addEventListener('blur', () => hide());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (activeButton === button && pinned) hide(true);
        else show(button, true);
      });
    });

    document.addEventListener('pointerdown', (event) => {
      if (!activeButton || event.target.closest('.form-builder-context-help') === activeButton) return;
      hide(true);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hide(true);
    });
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, { passive: true });
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
      if (!card || card.dataset.blockId === dragSourceId) {
        clearDropTargets();
        return;
      }
      const target = getBlockById(card.dataset.blockId);
      if (!target || isAnchoredBlock(target)) {
        clearDropTargets();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearDropTargets();
      const placement = getDropPlacement(card, event.clientY);
      card.classList.add(placement === 'before' ? 'is-drop-before' : 'is-drop-after');
    });

    els.blockList.addEventListener('dragleave', (event) => {
      const card = event.target.closest('[data-block-id]');
      if (card && !card.contains(event.relatedTarget)) card.classList.remove('is-drop-before', 'is-drop-after');
    });

    els.blockList.addEventListener('drop', (event) => {
      if (!dragSourceId) return;
      const targetCard = event.target.closest('[data-block-id]');
      const sourceId = dragSourceId;
      const target = getBlockById(targetCard?.dataset.blockId);
      const placement = targetCard?.classList.contains('is-drop-after')
        ? 'after'
        : targetCard?.classList.contains('is-drop-before')
          ? 'before'
          : targetCard
            ? getDropPlacement(targetCard, event.clientY)
            : 'before';
      clearDropTargets();
      event.preventDefault();
      if (!targetCard || targetCard.dataset.blockId === sourceId || !target || isAnchoredBlock(target)) return;
      const sourceIndex = state.blocks.findIndex((block) => block.id === sourceId);
      const targetIndex = state.blocks.findIndex((block) => block.id === targetCard.dataset.blockId);
      if (sourceIndex < 0 || targetIndex < 0) return;

      const insertionIndex = getDropInsertionIndex(sourceIndex, targetIndex, placement);
      reorderBlock(sourceIndex, insertionIndex);
    });

    els.blockList.addEventListener('dragend', () => {
      dragSourceId = null;
      clearDropTargets();
      els.blockList.querySelectorAll('.is-dragging').forEach((card) => card.classList.remove('is-dragging'));
    });
  }

  function getDropPlacement(card, clientY) {
    const rect = card.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function getDropInsertionIndex(sourceIndex, targetIndex, placement) {
    let insertionIndex = targetIndex + (placement === 'after' ? 1 : 0);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    return insertionIndex;
  }

  function clearDropTargets() {
    els.blockList.querySelectorAll('.is-drop-before, .is-drop-after')
      .forEach((card) => card.classList.remove('is-drop-before', 'is-drop-after'));
  }

  function setPreviewCollapsed(collapsed) {
    if (collapsed) resetPreviewFollowing();
    els.layout.classList.remove(
      'is-preview-opening',
      'is-preview-closing',
      'is-preview-settling',
      'is-preview-animating',
      'is-preview-returning'
    );
    els.layout.classList.toggle('preview-collapsed', collapsed);
    setPreviewToggleState(collapsed);
    schedulePreviewFollowingUpdate();
  }

  function setPreviewToggleState(collapsed) {
    els.togglePreview.setAttribute('aria-expanded', String(!collapsed));
    els.togglePreview.setAttribute('aria-label', collapsed ? 'Show live preview' : 'Minimize live preview');
    els.togglePreview.dataset.previewToggleState = collapsed ? 'collapsed' : 'open';
  }

  function clearPreviewToggleTimers() {
    const timers = els.layout._previewToggleTimers || [];
    timers.forEach((timer) => window.clearTimeout?.(timer));
    els.layout._previewToggleTimers = [];
  }

  function schedulePreviewToggleTimer(callback, delay) {
    const timer = window.setTimeout(() => {
      els.layout._previewToggleTimers = (els.layout._previewToggleTimers || []).filter((item) => item !== timer);
      callback();
    }, delay);
    els.layout._previewToggleTimers = [...(els.layout._previewToggleTimers || []), timer];
  }

  function performPreviewColumnToggle() {
    const willCollapse = !els.layout.classList.contains('preview-collapsed');
    clearPreviewToggleTimers();
    els.layout.classList.remove(
      'is-preview-opening',
      'is-preview-closing',
      'is-preview-settling',
      'is-preview-animating'
    );
    els.layout.getBoundingClientRect?.();
    els.layout.classList.add('is-preview-animating', willCollapse ? 'is-preview-closing' : 'is-preview-opening');
    setPreviewToggleState(willCollapse);

    window.requestAnimationFrame(() => {
      if (willCollapse) resetPreviewFollowing();
      els.layout.classList.toggle('preview-collapsed', willCollapse);
    });

    if (willCollapse) {
      schedulePreviewToggleTimer(() => {
        els.layout.classList.remove('is-preview-closing');
        els.layout.classList.add('is-preview-settling');
      }, PREVIEW_COLLAPSE_SETTLE_MS);
    }

    schedulePreviewToggleTimer(() => {
      els.layout.classList.remove(
        'is-preview-opening',
        'is-preview-closing',
        'is-preview-settling',
        'is-preview-animating'
      );
      schedulePreviewFollowingUpdate();
    }, PREVIEW_TOGGLE_MS);
  }

  function togglePreviewColumn() {
    const { layout, previewSticky: sticky } = els;
    if (!layout || !sticky || layout.classList.contains('is-preview-returning') || layout.classList.contains('is-preview-animating')) return;
    const willCollapse = !layout.classList.contains('preview-collapsed');
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) {
      setPreviewCollapsed(willCollapse);
      return;
    }

    if (!willCollapse || typeof sticky.animate !== 'function') {
      performPreviewColumnToggle();
      return;
    }

    const fixedRect = sticky.getBoundingClientRect();
    const columnRect = els.previewColumn?.getBoundingClientRect();
    const isFollowingViewport = layout.classList.contains('is-preview-following')
      || (columnRect && Math.abs(fixedRect.top - columnRect.top) > 3);
    if (!isFollowingViewport) {
      resetPreviewFollowing();
      performPreviewColumnToggle();
      return;
    }

    resetPreviewFollowing();
    layout.classList.add('is-preview-returning');
    const naturalRect = sticky.getBoundingClientRect();
    const deltaX = fixedRect.left - naturalRect.left;
    const deltaY = fixedRect.top - naturalRect.top;
    const animation = sticky.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: 'translate(0, 0)' }
      ],
      {
        duration: PREVIEW_RETURN_MS,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }
    );

    let returnFinished = false;
    const finishReturn = () => {
      if (returnFinished) return;
      returnFinished = true;
      layout.classList.remove('is-preview-returning');
      performPreviewColumnToggle();
    };
    animation.addEventListener?.('finish', finishReturn, { once: true });
    animation.addEventListener?.('cancel', finishReturn, { once: true });
  }

  function resetPreviewFollowing() {
    els.layout.classList.remove('is-preview-following');
    els.layout.style.removeProperty?.('--preview-follow-left');
    els.layout.style.removeProperty?.('--preview-follow-width');
    els.layout.style.removeProperty?.('--preview-follow-top');
    els.layout.style.removeProperty?.('--preview-follow-max-height');
    els.layout.style.removeProperty?.('--preview-boundary-height');
  }

  function animatePreviewFollowShift(fromRect) {
    const sticky = els.previewSticky;
    if (!sticky || !fromRect || typeof sticky.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const toRect = sticky.getBoundingClientRect();
    const deltaX = fromRect.left - toRect.left;
    const deltaY = fromRect.top - toRect.top;
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
    els.layout._previewFollowAnimation?.cancel?.();
    const animation = sticky.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: 'translate(0, 0)' }
      ],
      { duration: 820, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
    els.layout._previewFollowAnimation = animation;
    animation.addEventListener?.('finish', () => {
      if (els.layout._previewFollowAnimation === animation) els.layout._previewFollowAnimation = null;
    }, { once: true });
  }

  function getPreviewBoundaryElement() {
    return els.buildFlowTools || els.blockList || els.editor || els.layout;
  }

  function updatePreviewFollowing() {
    const { layout, editor, previewColumn: column, previewSticky: sticky } = els;
    const unavailable = !layout
      || !editor
      || !column
      || !sticky
      || layout.classList.contains('preview-collapsed')
      || layout.classList.contains('is-preview-animating')
      || layout.classList.contains('is-preview-returning')
      || window.matchMedia?.('(max-width: 980px)')?.matches;
    if (unavailable) {
      resetPreviewFollowing();
      return;
    }

    const columnRect = column.getBoundingClientRect();
    const stickyRect = sticky.getBoundingClientRect();
    const boundaryRect = getPreviewBoundaryElement().getBoundingClientRect();
    const boundaryHeight = Math.max(0, boundaryRect.bottom - columnRect.top);
    layout.style.setProperty?.('--preview-boundary-height', `${boundaryHeight}px`);
    const wasFollowing = layout.classList.contains('is-preview-following');
    const followInset = 16;
    const previewTop = columnRect.top <= followInset ? followInset : Math.max(followInset, stickyRect.top);
    const previewBottom = Math.min(window.innerHeight - followInset, boundaryRect.bottom);
    const followMaxHeight = Math.max(0, previewBottom - previewTop);
    const shouldFollow = columnRect.top <= followInset && followMaxHeight > 0;

    if (followMaxHeight > 0) {
      layout.style.setProperty?.('--preview-follow-max-height', `${followMaxHeight}px`);
    } else {
      layout.style.removeProperty?.('--preview-follow-max-height');
    }
    if (shouldFollow) {
      layout.style.setProperty?.('--preview-follow-left', `${columnRect.left}px`);
      layout.style.setProperty?.('--preview-follow-width', `${columnRect.width}px`);
      layout.style.setProperty?.('--preview-follow-top', `${followInset}px`);
    } else {
      layout.style.removeProperty?.('--preview-follow-left');
      layout.style.removeProperty?.('--preview-follow-width');
      layout.style.removeProperty?.('--preview-follow-top');
    }
    layout.classList.toggle('is-preview-following', shouldFollow);
    if (wasFollowing !== shouldFollow) animatePreviewFollowShift(stickyRect);
  }

  function schedulePreviewFollowingUpdate() {
    if (els.layout._previewFollowRaf) return;
    els.layout._previewFollowRaf = requestAnimationFrame(() => {
      els.layout._previewFollowRaf = 0;
      updatePreviewFollowing();
    });
  }

  function updateMeta(key, value) {
    state.meta[key] = value;
    renderPreview();
  }

  function hydrateMetaFields() {
    els.title.value = state.meta.title;
    els.audience.value = state.meta.audience;
    els.description.value = state.meta.description;
    els.submissionMode.value = state.settings.submissionPolicy.mode;
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
    state.meta.respondentDetails = FormDomain.updateIdentityFieldConfig(
      state.meta.respondentDetails,
      field,
      key,
      input.checked
    );
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
              <input type="checkbox" data-identity-field="${key}" data-identity-key="enabled" aria-label="Collect ${escapeAttribute(info.label)}" ${config.enabled ? 'checked' : ''} />
              Collect
            </label>
            <label class="form-builder-check-control">
              <input type="checkbox" data-identity-field="${key}" data-identity-key="required" aria-label="Require ${escapeAttribute(info.label)}" ${config.required ? 'checked' : ''} ${config.enabled ? '' : 'disabled'} />
              Required
            </label>
            ${info.supportsVerify ? `
              <label class="form-builder-check-control">
                <input type="checkbox" data-identity-field="${key}" data-identity-key="verify" aria-label="Verify ${escapeAttribute(info.label)} later" ${config.verify ? 'checked' : ''} ${config.enabled ? '' : 'disabled'} />
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
    schedulePreviewFollowingUpdate();
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
      <article class="form-builder-block-card${block.kind === 'phase' ? ' form-builder-phase-card' : ''}${block.collapsed ? ' is-collapsed' : ''}" data-block-id="${escapeAttribute(block.id)}" data-block-kind="${escapeAttribute(block.kind)}" ${block.kind === 'phase' ? phaseAppearanceStyleAttribute(block.appearance) : ''}>
        <header class="form-builder-block-header">
          <div class="form-builder-block-header-main">
            <div class="form-builder-block-header-title-row">
              <span class="form-builder-block-kind">${kindLabels[block.kind]}</span>
              <h3>${escapeHtml(getBlockHeaderTitle(block, questionNumber))}</h3>
            </div>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <div class="form-builder-block-actions${block.kind === 'question' ? ' has-duplicate' : ''}">
            <button
              type="button"
              class="form-builder-btn form-builder-btn-outline form-builder-block-order-btn form-builder-drag-handle"
              ${canDrag ? 'draggable="true" data-drag-handle' : 'disabled'}
              aria-label="Drag block to reorder"
              title="${canDrag ? 'Drag to reorder block' : 'This page keeps its fixed position'}"
            >↕</button>
            <button type="button" class="form-builder-btn form-builder-btn-outline form-builder-block-order-btn" data-action="move-up" aria-label="Move block up" title="Move block up" ${canMove(index, -1) ? '' : 'disabled'}>↑</button>
            <button type="button" class="form-builder-btn form-builder-btn-outline form-builder-block-order-btn" data-action="move-down" aria-label="Move block down" title="Move block down" ${canMove(index, 1) ? '' : 'disabled'}>↓</button>
            ${block.kind === 'question' ? '<button type="button" class="form-builder-btn form-builder-btn-outline form-builder-block-text-btn" data-action="duplicate" aria-label="Duplicate question" title="Duplicate this question and all of its content">Duplicate</button>' : ''}
            <button type="button" class="form-builder-btn form-builder-btn-outline form-builder-block-text-btn" data-action="toggle" aria-expanded="${String(!block.collapsed)}">${block.collapsed ? 'Maximize' : 'Minimize'}</button>
            <button type="button" class="form-builder-btn form-builder-btn-outline form-builder-block-text-btn" data-action="remove">Remove</button>
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

      ${renderQuestionPdfAnswerSpace(block)}

      ${renderQuestionOptions(block)}
    `;
  }

  function renderQuestionPdfAnswerSpace(question) {
    if (!isWrittenQuestionType(question.type)) return '';
    const setting = normalizePdfAnswerSpace(question.pdfAnswerSpace, question.type);
    const isShortAnswer = question.type === 'short-answer';
    const sizeControlId = `pdf-answer-size-${question.id}`;
    const customControlId = `pdf-answer-mm-${question.id}`;
    return `
      <section class="form-builder-pdf-answer-setting" aria-label="PDF answer space">
        <div class="form-builder-pdf-answer-heading">
          <strong>PDF answer space</strong>
          <small>${isShortAnswer ? 'Short answers use either no writing area or one small block.' : 'Choose how much writing room this question receives when printed.'}</small>
        </div>
        <div class="form-builder-field-grid form-builder-pdf-answer-grid${isShortAnswer ? ' is-short-answer' : ''}">
          <div class="form-builder-input-group">
            <label for="${escapeAttribute(sizeControlId)}">PDF answer block</label>
            <select id="${escapeAttribute(sizeControlId)}" data-pdf-answer-space-size>
              <option value="none" ${setting.size === 'none' ? 'selected' : ''}>No block</option>
              <option value="small" ${setting.size === 'small' ? 'selected' : ''}>Small block</option>
              ${isShortAnswer ? '' : `
                <option value="medium" ${setting.size === 'medium' ? 'selected' : ''}>Medium block</option>
                <option value="large" ${setting.size === 'large' ? 'selected' : ''}>Large block</option>
                <option value="custom" ${setting.size === 'custom' ? 'selected' : ''}>Specific distance</option>
              `}
            </select>
          </div>
          ${isShortAnswer ? '' : `<div class="form-builder-input-group form-builder-pdf-answer-custom" ${setting.size === 'custom' ? '' : 'hidden'}>
            <label for="${escapeAttribute(customControlId)}">Specific distance (mm)</label>
            <input
              id="${escapeAttribute(customControlId)}"
              type="number"
              min="10"
              max="260"
              step="5"
              value="${escapeAttribute(setting.customMm)}"
              data-pdf-answer-custom-mm
            />
          </div>`}
        </div>
      </section>
    `;
  }

  function renderPhaseBody(phase) {
    const isConditional = Array.isArray(phase.triggers) && phase.triggers.length;
    const routeList = isConditional
      ? phase.triggers.map((trigger) => `<span class="form-builder-route-chip">${escapeHtml(getTriggerLabel(trigger))}</span>`).join('')
      : '<p>This is a normal-flow phase. It appears when the current route has no eligible conditional destination.</p>';
    const appearance = normalizePhaseAppearance(phase.appearance);
    return `
      <section class="form-builder-route-summary${isConditional ? '' : ' is-normal'} form-builder-phase-summary" ${phaseAppearanceStyleAttribute(appearance)}>
        <div>
          <span class="form-builder-route-badge">${isConditional ? `${phase.triggers.length} trigger${phase.triggers.length === 1 ? '' : 's'}` : 'Normal flow'}</span>
          <h4>${escapeHtml(phase.title || 'Untitled phase')}</h4>
          <p>${escapeHtml(phase.description || 'No phase introduction yet.')}</p>
        </div>
        <div class="form-builder-route-list">${routeList}</div>
        <div class="form-builder-phase-colour-key" aria-label="Phase appearance">
          <span class="form-builder-phase-colour-swatch form-builder-phase-colour-swatch-background" title="Page background colour"></span>
          <small>Page colour</small>
        </div>
        <div class="form-builder-inline-actions">
          <button type="button" class="form-builder-btn form-builder-btn-secondary form-builder-small-btn" data-action="configure-phase">Configure phase, routing and colour</button>
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

    if (event.target.hasAttribute('data-pdf-answer-custom-mm')) {
      const nextValue = Number(event.target.value);
      if (Number.isFinite(nextValue) && nextValue >= 10 && nextValue <= 260) {
        block.pdfAnswerSpace = normalizePdfAnswerSpace({
          ...block.pdfAnswerSpace,
          size: 'custom',
          customMm: nextValue
        }, block.type);
      }
      return;
    }

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

    if (event.target.hasAttribute('data-pdf-answer-space-size')) {
      block.pdfAnswerSpace = normalizePdfAnswerSpace({
        ...block.pdfAnswerSpace,
        size: event.target.value
      }, block.type);
      const customField = card.querySelector('.form-builder-pdf-answer-custom');
      if (customField) customField.hidden = block.pdfAnswerSpace.size !== 'custom';
      return;
    }

    if (event.target.hasAttribute('data-pdf-answer-custom-mm')) {
      block.pdfAnswerSpace = normalizePdfAnswerSpace({
        ...block.pdfAnswerSpace,
        size: 'custom',
        customMm: event.target.value
      }, block.type);
      event.target.value = block.pdfAnswerSpace.customMm;
      return;
    }

    const field = event.target.dataset.field;
    if (!field) return;

    if (event.target.type === 'checkbox') {
      block[field] = event.target.checked;
      renderPreview();
      return;
    }

    if (event.target.tagName === 'SELECT') {
      const previousType = block.type;
      const previousPdfAnswerSpace = normalizePdfAnswerSpace(block.pdfAnswerSpace, previousType);
      const previousDefaultPdfAnswerSpace = defaultPdfAnswerSpace(previousType);
      block[field] = event.target.value;
      if (field === 'type' && isWrittenQuestionType(block.type)) {
        const followedPreviousDefault = previousPdfAnswerSpace.size === previousDefaultPdfAnswerSpace.size
          && previousPdfAnswerSpace.customMm === previousDefaultPdfAnswerSpace.customMm;
        block.pdfAnswerSpace = followedPreviousDefault
          ? defaultPdfAnswerSpace(block.type)
          : normalizePdfAnswerSpace(previousPdfAnswerSpace, block.type);
      }
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
      if (block.collapsed) expandBlockExclusively(block.id);
      else setBlockCollapsed(block, true);
      schedulePreviewFollowingUpdate();
      return;
    }

    if (action === 'move-up') { moveBlock(index, -1); return; }
    if (action === 'move-down') { moveBlock(index, 1); return; }
    if (action === 'configure-phase') { openPhaseModal(block.id); return; }

    if (action === 'remove') {
      if (!confirmBlockRemoval(block)) return;
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

  function setBlockCollapsed(block, collapsed) {
    block.collapsed = collapsed;
    const blockCard = els.blockList.querySelector(`[data-block-id="${cssEscape(block.id)}"]`);
    if (!blockCard) return;
    blockCard.classList.toggle('is-collapsed', collapsed);
    const toggle = blockCard.querySelector('button[data-action="toggle"]');
    if (!toggle) return;
    toggle.textContent = collapsed ? 'Maximize' : 'Minimize';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }

  function expandBlockExclusively(blockId) {
    state.blocks.forEach((candidate) => setBlockCollapsed(candidate, candidate.id !== blockId));
  }

  function confirmBlockRemoval(block) {
    return block.kind !== 'question' || window.confirm('Remove this question?');
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
    state = FormDomain.normalizeState(state);
  }

  function getPhaseIndex(phaseId) { return FormDomain.getPhaseIndex(state, phaseId); }

  function getQuestionsForPhase(phaseId) {
    return FormDomain.getQuestionsForPhase(state, phaseId);
  }

  function getOptionSet(question) {
    return FormDomain.getOptionSet(question);
  }

  function isValidTriggerForTarget(trigger, targetPhase) {
    return FormDomain.isValidTriggerForTarget(state, trigger, targetPhase);
  }

  function pruneInvalidTriggers() {
    return FormDomain.pruneInvalidTriggers(state);
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
    return FormDomain.buildContentPages(state);
  }

  function buildPreviewSteps() {
    return FormDomain.buildRespondentSteps(state);
  }

  function renderPreview() {
    const steps = buildPreviewSteps();
    previewPageIndex = Math.max(0, Math.min(previewPageIndex, steps.length - 1));
    const step = steps[previewPageIndex];
    const themedPage = step?.page?.type === 'phase' ? step.page : null;

    els.previewSticky.classList.toggle('is-phase-page', Boolean(themedPage));
    if (themedPage) els.previewSticky.setAttribute('style', phaseAppearanceVariables(themedPage.block.appearance));
    else els.previewSticky.removeAttribute('style');

    els.previewPageCount.textContent = `Step ${previewPageIndex + 1} of ${steps.length}`;
    els.previewPrevious.disabled = previewPageIndex === 0;
    els.previewNext.disabled = previewPageIndex === steps.length - 1;
    els.previewNext.textContent = previewPageIndex === steps.length - 1 ? 'Done' : 'Next';
    els.formPreview.innerHTML = `<div class="form-builder-preview-page-card">${renderPreviewStep(step, previewPageIndex, steps.length)}</div>`;
  }

  function renderPreviewStep(step, stepIndex, stepCount) {
    const formHeader = `
      <div class="form-builder-preview-form-header">
        <h3>${escapeHtml(state.meta.title || 'Untitled form')}</h3>
        ${state.meta.audience ? `<p class="form-builder-preview-audience">${escapeHtml(state.meta.audience)}</p>` : ''}
        ${state.meta.description ? `<p class="form-builder-preview-description">${escapeHtml(state.meta.description)}</p>` : ''}
      </div>
    `;
    const previewHeader = formHeader + renderPreviewProgress(step);

    if (step.kind === 'privacy') {
      const greeting = step.block;
      return `
        ${previewHeader}
        <section class="form-builder-preview-confirmation">
          <h3>${escapeHtml(greeting?.title || 'Before we begin')}</h3>
          <p>${escapeHtml(greeting?.body || 'Please read the information below before continuing.')}</p>
          ${renderPreviewTerms()}
          <button type="button" class="form-builder-preview-cta">${escapeHtml(greeting?.buttonText || 'Start form')}</button>
        </section>
      `;
    }

    if (step.kind === 'identity') return `${previewHeader}${renderIdentityPreview()}`;

    if (step.kind === 'goodbye') {
      const goodbye = step.block;
      return `
        ${previewHeader}
        <section class="form-builder-preview-confirmation">
          <h3>${escapeHtml(goodbye?.title || 'Thank you')}</h3>
          <p>${escapeHtml(goodbye?.body || 'Your answers are ready to be submitted.')}</p>
          <button type="button" class="form-builder-preview-cta">${escapeHtml(goodbye?.buttonText || 'Submit form')}</button>
        </section>
      `;
    }

    const page = step.page;
    if (!page) return `${previewHeader}<div class="form-builder-preview-empty"><p>This respondent step is not available.</p></div>`;
    const themed = page.type === 'phase';
    let content = '';

    if (step.kind === 'phase-intro') {
      const routeNote = page.block.triggers?.length
        ? '<p class="form-builder-preview-route-note">This section appears only when one of its routing rules matches.</p>'
        : '';
      content = `
        <p class="form-builder-preview-step-eyebrow">Next section</p>
        ${routeNote}
        <div class="form-builder-preview-phase-heading">
          <div class="form-builder-preview-phase-title-row">
            <h3 class="form-builder-preview-page-title">${escapeHtml(page.block.title || 'Questions')}</h3>
            <p class="form-builder-preview-question-count">${page.questions.length} ${page.questions.length === 1 ? 'question' : 'questions'} in this section</p>
          </div>
          <p class="form-builder-preview-page-copy">${escapeHtml(page.block.description || 'Continue when you are ready for the next section.')}</p>
        </div>
      `;
    } else if (step.kind === 'question') {
      const contextLabel = page.block.title || (themed ? 'Section' : 'Questions');
      content = `
        <p class="form-builder-preview-step-eyebrow">${escapeHtml(contextLabel)}</p>
        <div class="form-builder-preview-question-list">${renderPreviewQuestion(step.question)}</div>
      `;
    } else {
      content = '<div class="form-builder-preview-empty"><p>This section has no questions. Continue to the next part of the form.</p></div>';
    }

    if (themed) {
      return `${previewHeader}<section class="form-builder-preview-phase">${content}</section>`;
    }

    return `${previewHeader}${content}`;
  }

  function previewProgressValues(step) {
    if (step?.kind !== 'question' || !step.page) return null;
    const questionIds = buildPreviewSteps()
      .filter((previewStep) => previewStep.kind === 'question' && previewStep.question?.id)
      .map((previewStep) => previewStep.question.id);
    const total = Math.max(1, questionIds.length);
    const previewIndex = questionIds.indexOf(step.question.id);
    const answered = questionIds.filter((questionId) => previewAnswers.has(questionId)).length;
    return {
      answered,
      total,
      number: previewIndex >= 0 ? previewIndex + 1 : 1,
      percentage: Math.min(100, (answered / total) * 100)
    };
  }

  function renderPreviewProgress(step) {
    const values = previewProgressValues(step);
    if (!values) return '';
    return `
      <div class="form-builder-preview-progress-wrap" aria-label="Question progress">
        <div class="form-builder-preview-progress-meta">
          <span>Question ${values.number} of ${values.total}</span>
          <span data-preview-progress-answered>${values.answered} answered</span>
        </div>
        <div class="form-builder-preview-progress-track" role="progressbar" aria-label="Answered questions" aria-valuemin="0" aria-valuemax="${values.total}" aria-valuenow="${values.answered}">
          <span class="form-builder-preview-progress-fill" data-preview-progress-fill style="width:${values.percentage}%"></span>
        </div>
      </div>
    `;
  }

  function handlePreviewResponse(event) {
    const control = event.target.closest('[data-preview-question]');
    if (!control) return;
    const questionId = control.dataset.previewQuestion;
    const selector = `[data-preview-question="${CSS.escape(questionId)}"]`;
    const controls = [...els.formPreview.querySelectorAll(selector)];
    const answered = controls.some((item) => {
      if (item.type === 'checkbox' || item.type === 'radio') return item.checked;
      return String(item.value || '').trim() !== '';
    });
    if (answered) previewAnswers.add(questionId);
    else previewAnswers.delete(questionId);

    const values = previewProgressValues(buildPreviewSteps()[previewPageIndex]);
    if (!values) return;
    const answeredLabel = els.formPreview.querySelector('[data-preview-progress-answered]');
    const track = els.formPreview.querySelector('.form-builder-preview-progress-track');
    const fill = els.formPreview.querySelector('[data-preview-progress-fill]');
    if (answeredLabel) answeredLabel.textContent = `${values.answered} answered`;
    if (track) track.setAttribute('aria-valuenow', String(values.answered));
    if (fill) fill.style.width = `${values.percentage}%`;
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

  function renderIdentityPreview() {
    const details = state.meta.respondentDetails;
    const fields = Object.entries(IDENTITY_FIELDS).filter(([key]) => details[key].enabled);
    if (!fields.length) return '';
    return `
      <section class="form-builder-preview-identity">
        <p class="form-builder-preview-step-eyebrow">About you</p>
        <h3>Respondent details</h3>
        <p class="form-builder-preview-page-copy">Please provide the information requested below before continuing to the questions.</p>
        ${fields.map(([key, info]) => {
          const isLocationField = ['country', 'state', 'city'].includes(key);
          const locationPlaceholders = {
            country: 'Select a country',
            state: 'Select a state / province',
            city: 'Select a city'
          };
          return `
            <div class="form-builder-preview-identity-field">
              <label>${escapeHtml(info.label)} ${details[key].required ? '<span class="form-builder-required-star">*</span>' : ''}</label>
              ${isLocationField
                ? `<select class="form-builder-preview-text-field" aria-label="${escapeAttribute(info.label)}" autocomplete="${escapeAttribute(info.autocomplete || 'off')}"><option>${locationPlaceholders[key]}</option></select>`
                : `<input class="form-builder-preview-text-field" type="${info.inputType}" autocomplete="${escapeAttribute(info.autocomplete || 'off')}" placeholder="${escapeAttribute(info.placeholder)}" />`}
            </div>
          `;
        }).join('')}
      </section>
    `;
  }

  function renderPreviewQuestion(question) {
    const prompt = escapeHtml(question.prompt || 'Untitled question');
    const help = question.helpText ? `<p class="form-builder-preview-question-help">${escapeHtml(question.helpText)}</p>` : '';
    const required = question.required ? '<span class="form-builder-required-star">*</span>' : '';
    const questionId = escapeAttribute(question.id);
    let input = '';
    if (question.type === 'short-answer') input = `<input class="form-builder-preview-text-field" type="text" data-preview-question="${questionId}" placeholder="Your answer" />`;
    if (question.type === 'long-answer') input = `<textarea class="form-builder-preview-textarea" data-preview-question="${questionId}" placeholder="Write your answer"></textarea>`;
    if (question.type === 'number') input = `<input class="form-builder-preview-number-field" type="number" data-preview-question="${questionId}" placeholder="Enter a number" />`;
    if (question.type === 'true-false') input = renderPreviewChoices(question, getOptionSet(question), 'radio');
    if (question.type === 'multiple-choice') input = renderPreviewChoices(question, question.options, 'radio');
    if (question.type === 'multiple-answer') input = renderPreviewChoices(question, question.options, 'checkbox');

    return `<article class="form-builder-preview-question"><div class="form-builder-preview-question-label">${prompt} ${required}</div>${help}${input}</article>`;
  }

  function renderPreviewChoices(question, options, inputType) {
    const inputName = `preview-${escapeAttribute(question.id)}`;
    return `<div class="form-builder-preview-choice-list">${options.map((option) => `
      <label class="form-builder-preview-choice">
        <input type="${inputType}" name="${inputName}" data-preview-question="${escapeAttribute(question.id)}" />
        <span>${escapeHtml(option.label || 'Untitled option')}</span>
      </label>
    `).join('')}</div>`;
  }

  function updateAddButtons() {
    els.addGreeting.disabled = state.blocks.some((block) => block.kind === 'greeting');
    els.addGoodbye.disabled = state.blocks.some((block) => block.kind === 'goodbye');
  }

  function openFormStructure() {
    structureModalReturnFocus = document.activeElement;
    renderFormStructure();
    els.structureModal.classList.add('is-open');
    els.structureModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => els.structureModal.querySelector('[data-structure-action="close"]')?.focus(), 30);
  }

  function closeFormStructure() {
    els.structureModal.classList.remove('is-open');
    els.structureModal.setAttribute('aria-hidden', 'true');
    if (structureModalReturnFocus?.focus) structureModalReturnFocus.focus();
    structureModalReturnFocus = null;
  }

  function handleStructureClick(event) {
    if (event.target.closest('[data-structure-action="close"]')) closeFormStructure();
  }

  function openFormPrint() {
    printModalReturnFocus = document.activeElement;
    const routeCatalog = FormDomain.enumeratePrintableRoutes(state);
    const selectedRouteId = routeCatalog.routes.some((route) => route.id === printModalState.selectedRouteId)
      ? printModalState.selectedRouteId
      : (routeCatalog.routes[0]?.id || '');
    printModalState = {
      ...printModalState,
      routeCatalog,
      selectedRouteId,
      message: '',
      messageIsError: false
    };
    renderFormPrint();
    els.printModal.classList.add('is-open');
    els.printModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => focusWithoutScrolling(els.printModal.querySelector('input[name="printRoute"]')), 30);
  }

  function closeFormPrint() {
    els.printModal.classList.remove('is-open');
    els.printModal.setAttribute('aria-hidden', 'true');
    focusWithoutScrolling(printModalReturnFocus);
    printModalReturnFocus = null;
    printInteractionScrollPosition = null;
  }

  function focusWithoutScrolling(element) {
    if (!element?.focus) return;
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }

  function captureFormPrintScrollPosition() {
    const dialog = els.printModal.querySelector('.form-builder-print-dialog');
    const routeList = els.printModal.querySelector('.form-builder-print-route-list');
    return {
      pageLeft: window.scrollX || 0,
      pageTop: window.scrollY || 0,
      dialogLeft: dialog?.scrollLeft || 0,
      dialogTop: dialog?.scrollTop || 0,
      routeListLeft: routeList?.scrollLeft || 0,
      routeListTop: routeList?.scrollTop || 0
    };
  }

  function restoreFormPrintScrollPosition(position) {
    if (!position) return;
    const restore = () => {
      const dialog = els.printModal.querySelector('.form-builder-print-dialog');
      const routeList = els.printModal.querySelector('.form-builder-print-route-list');
      if (dialog) {
        dialog.scrollLeft = position.dialogLeft;
        dialog.scrollTop = position.dialogTop;
      }
      if (routeList) {
        routeList.scrollLeft = position.routeListLeft;
        routeList.scrollTop = position.routeListTop;
      }
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(position.pageLeft, position.pageTop);
      root.style.scrollBehavior = previousScrollBehavior;
    };
    restore();
    window.requestAnimationFrame?.(restore);
  }

  function handlePrintInteractionStart(event) {
    const optionControl = event.target.closest?.('.form-builder-print-route-card');
    if (!optionControl) return;
    printInteractionScrollPosition = captureFormPrintScrollPosition();
  }

  function getSelectedPrintRoute() {
    return printModalState.routeCatalog.routes.find((route) => route.id === printModalState.selectedRouteId)
      || printModalState.routeCatalog.routes[0]
      || null;
  }

  function printRoutePath(route) {
    return route?.pageTitles?.length ? route.pageTitles.join(' → ') : 'Opening → Submission';
  }

  function pdfAnswerSpaceLabel(question) {
    const setting = normalizePdfAnswerSpace(question.pdfAnswerSpace, question.type);
    if (setting.size === 'none') return 'No answer block';
    if (setting.size === 'custom') return `${setting.customMm} mm`;
    const millimetres = PDF_ANSWER_SPACE_SIZES_MM[setting.size];
    const label = setting.size.charAt(0).toUpperCase() + setting.size.slice(1);
    return `${label} · ${millimetres} mm`;
  }

  function renderPrintQuestionSpaceSummary(route) {
    if (!route) return '<p class="form-builder-print-space-empty">Choose a path to review its written-answer spaces.</p>';
    const questionById = new Map(state.blocks
      .filter((block) => block.kind === 'question')
      .map((question) => [question.id, question]));
    const writtenQuestions = route.questionIds
      .map((id, index) => ({ question: questionById.get(id), number: index + 1 }))
      .filter(({ question }) => question && isWrittenQuestionType(question.type));
    if (!writtenQuestions.length) {
      return '<p class="form-builder-print-space-empty">This path has no written questions, so it does not need answer-space settings.</p>';
    }
    return `
      <div class="form-builder-print-question-space-list">
        ${writtenQuestions.map(({ question, number }) => `
          <div class="form-builder-print-question-space-row">
            <span class="form-builder-print-question-space-number">Question ${number}</span>
            <span class="form-builder-print-question-space-prompt">${escapeHtml(question.prompt || 'Untitled question')}</span>
            <strong>${escapeHtml(pdfAnswerSpaceLabel(question))}</strong>
          </div>
        `).join('')}
      </div>
      <p class="form-builder-print-space-note">Change a size from the PDF answer space controls inside that question's card.</p>
    `;
  }

  function renderFormPrint() {
    const routes = printModalState.routeCatalog.routes;
    const selectedRoute = getSelectedPrintRoute();
    const routeWord = routes.length === 1 ? 'path' : 'paths';
    els.printContent.innerHTML = `
      <section class="form-builder-print-section" aria-labelledby="form-print-route-heading">
        <div class="form-builder-print-section-heading">
          <h3 id="form-print-route-heading">1. Choose a respondent path</h3>
          <p>${routes.length} reachable ${routeWord}. Conditional branches and resumed normal phases are shown in their actual respondent order.</p>
        </div>
        <div class="form-builder-print-route-list" role="radiogroup" aria-label="Printable respondent path">
          ${routes.map((route) => `
            <label class="form-builder-print-route-card">
              <input type="radio" name="printRoute" value="${escapeAttribute(route.id)}" ${route.id === selectedRoute?.id ? 'checked' : ''} />
              <span class="form-builder-print-route-copy">
                <strong>${escapeHtml(route.label)}</strong>
                <span>${escapeHtml(printRoutePath(route))}</span>
                <small>${route.conditionalPageIds.length
                  ? `${route.conditionalPageIds.length} conditional ${route.conditionalPageIds.length === 1 ? 'section' : 'sections'} included`
                  : 'No conditional sections on this path'}</small>
              </span>
              <span class="form-builder-print-route-count">${route.questionIds.length} ${route.questionIds.length === 1 ? 'question' : 'questions'}</span>
            </label>
          `).join('')}
        </div>
        ${printModalState.routeCatalog.truncated
          ? '<p class="form-builder-print-limit-warning">This form has more than 128 reachable paths. Refine its routing before printing less common branches.</p>'
          : ''}
        ${selectedRoute ? `<p class="form-builder-print-route-summary"><strong>Selected:</strong> <span data-print-route-summary>${escapeHtml(printRoutePath(selectedRoute))}</span></p>` : ''}
      </section>

      <section class="form-builder-print-section" aria-labelledby="form-print-space-heading">
        <div class="form-builder-print-section-heading">
          <h3 id="form-print-space-heading">2. Review written-answer space</h3>
          <p>Each written question keeps its own saved PDF height, matching the controls in the exam builder.</p>
        </div>
        <div data-print-question-space-summary>${renderPrintQuestionSpaceSummary(selectedRoute)}</div>
      </section>
      ${printModalState.message
        ? `<p class="form-builder-print-message${printModalState.messageIsError ? ' is-error' : ''}" role="status">${escapeHtml(printModalState.message)}</p>`
        : ''}
    `;
  }

  function clearPrintMessage() {
    printModalState.message = '';
    printModalState.messageIsError = false;
    els.printContent.querySelector('.form-builder-print-message')?.remove();
  }

  function updatePrintRouteDetails() {
    const selectedRoute = getSelectedPrintRoute();
    if (!selectedRoute) return;
    const routeSummary = els.printContent.querySelector('[data-print-route-summary]');
    if (routeSummary) routeSummary.textContent = printRoutePath(selectedRoute);
    const answerSpaceSummary = els.printContent.querySelector('[data-print-question-space-summary]');
    if (answerSpaceSummary) answerSpaceSummary.innerHTML = renderPrintQuestionSpaceSummary(selectedRoute);
  }

  function handlePrintChange(event) {
    const scrollPosition = printInteractionScrollPosition || captureFormPrintScrollPosition();
    printInteractionScrollPosition = null;
    if (event.target.name === 'printRoute') {
      printModalState.selectedRouteId = event.target.value;
      clearPrintMessage();
      updatePrintRouteDetails();
      restoreFormPrintScrollPosition(scrollPosition);
      return;
    }
  }

  function printAnswerSpaceHeightMm(kind, settings = printModalState) {
    const isShort = kind === 'short';
    const size = isShort ? settings.shortAnswerSize : settings.longAnswerSize;
    if (size === 'none') return 0;
    if (size === 'custom') {
      const customValue = Number(isShort ? settings.shortAnswerCustomMm : settings.longAnswerCustomMm);
      return Number.isFinite(customValue) ? Math.max(10, Math.min(260, customValue)) : (isShort ? 35 : 60);
    }
    return PRINT_ANSWER_SPACE_SIZES_MM[size] || (isShort ? 35 : 60);
  }

  function questionPrintAnswerSpaceHeightMm(question, settings = printModalState) {
    const kind = question.type === 'short-answer' ? 'short' : 'long';
    if (!question.pdfAnswerSpace) return printAnswerSpaceHeightMm(kind, settings);
    const answerSpace = normalizePdfAnswerSpace(question.pdfAnswerSpace, question.type);
    if (answerSpace.size === 'none') return 0;
    if (answerSpace.size === 'custom') return answerSpace.customMm;
    return PDF_ANSWER_SPACE_SIZES_MM[answerSpace.size]
      || printAnswerSpaceHeightMm(kind, settings);
  }

  function renderPrintableRespondentDetails() {
    const enabledFields = Object.entries(state.meta.respondentDetails || {})
      .filter(([, config]) => config.enabled)
      .map(([key, config]) => ({ key, config, info: IDENTITY_FIELDS[key] }))
      .filter((field) => field.info);
    if (!enabledFields.length) return '';
    return `
      <section class="form-builder-print-identity">
        <h2>Respondent details</h2>
        <div class="form-builder-print-identity-grid">
          ${enabledFields.map(({ config, info }) => `
            <div class="form-builder-print-identity-field">
              <span>${escapeHtml(info.label)}${config.required ? ' *' : ''}</span>
              <div class="form-builder-print-write-line"></div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderPrintableQuestionAnswer(question, settings, writtenHeightOverride = null) {
    if (question.type === 'short-answer' || question.type === 'long-answer') {
      const kind = question.type === 'short-answer' ? 'short' : 'long';
      const heightMm = writtenHeightOverride === null
        ? questionPrintAnswerSpaceHeightMm(question, settings)
        : writtenHeightOverride;
      return heightMm
        ? `<div class="form-builder-print-answer-space" style="--print-answer-height:${escapeAttribute(heightMm)}mm" aria-label="${kind === 'short' ? 'Short' : 'Long'} written answer space"></div>`
        : '';
    }
    if (question.type === 'number') {
      return '<div class="form-builder-print-number-answer"><span>Answer</span><span class="form-builder-print-write-line"></span></div>';
    }
    const options = FormDomain.getOptionSet(question);
    if (!options.length) return '<div class="form-builder-print-write-line"></div>';
    const singleChoice = question.type !== 'multiple-answer';
    return `
      <ul class="form-builder-print-options">
        ${options.map((option) => `
          <li class="form-builder-print-option">
            <span class="form-builder-print-option-mark${singleChoice ? ' is-single' : ''}" aria-hidden="true"></span>
            <span>${escapeHtml(option.label || 'Untitled option')}</span>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function renderPrintableQuestion(question, questionNumber, settings) {
    const isWritten = question.type === 'short-answer' || question.type === 'long-answer';
    const totalWrittenHeight = isWritten ? questionPrintAnswerSpaceHeightMm(question, settings) : 0;
    const firstWrittenHeight = totalWrittenHeight > 180 ? 180 : totalWrittenHeight;
    let remainingWrittenHeight = Math.max(0, totalWrittenHeight - firstWrittenHeight);
    const continuationHeights = [];
    while (remainingWrittenHeight > 0) {
      const segmentHeight = Math.min(230, remainingWrittenHeight);
      continuationHeights.push(segmentHeight);
      remainingWrittenHeight -= segmentHeight;
    }
    const questionMarkup = `
      <article class="form-builder-print-question">
        <div class="form-builder-print-question-heading">
          <strong>Question ${questionNumber}</strong>
          <span>${escapeHtml(QUESTION_TYPES[question.type]?.label || 'Question')}</span>
        </div>
        <p class="form-builder-print-prompt">${escapeHtml(question.prompt || 'Untitled question')}${question.required ? '<span class="form-builder-print-required"> *</span>' : ''}</p>
        ${question.helpText ? `<p class="form-builder-print-help">${escapeHtml(question.helpText)}</p>` : ''}
        ${renderPrintableQuestionAnswer(question, settings, isWritten ? firstWrittenHeight : null)}
      </article>
    `;
    const continuationMarkup = continuationHeights.map((heightMm, continuationIndex) => `
      <article class="form-builder-print-question is-answer-continuation">
        <div class="form-builder-print-question-heading">
          <strong>Question ${questionNumber} - continued</strong>
          <span>${escapeHtml(QUESTION_TYPES[question.type]?.label || 'Written answer')} ${continuationIndex + 2}/${continuationHeights.length + 1}</span>
        </div>
        <div class="form-builder-print-answer-space" style="--print-answer-height:${escapeAttribute(heightMm)}mm" aria-label="Continued written answer space"></div>
      </article>
    `).join('');
    return questionMarkup + continuationMarkup;
  }

  function buildPrintableFormMarkup(route, settings = printModalState) {
    if (!route) return '';
    const greeting = state.blocks.find((block) => block.kind === 'greeting');
    const pages = route.pageIds.map((pageId) => FormDomain.pageById(state, pageId)).filter(Boolean);
    let questionNumber = 0;
    const pageMarkup = pages.map((page) => {
      const questions = page.questions.map((question) => {
        questionNumber += 1;
        return renderPrintableQuestion(question, questionNumber, settings);
      }).join('');
      const title = page.block.title || (page.type === 'questions' ? 'Questions' : 'Untitled section');
      const description = page.block.description || '';
      const appearance = page.type === 'phase' ? phaseAppearanceStyleAttribute(page.block.appearance) : '';
      return `
        <section class="form-builder-print-phase${page.type === 'questions' ? ' is-initial' : ''}" ${appearance}>
          <header class="form-builder-print-phase-heading">
            <h2>${escapeHtml(title)}</h2>
            ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          </header>
          ${questions || '<p class="form-builder-print-empty-phase">This section does not contain any questions.</p>'}
        </section>
      `;
    }).join('');
    const path = printRoutePath(route);
    return `
      <article class="form-builder-print-sheet">
        <header class="form-builder-print-paper-header">
          <p class="form-builder-print-brand">Kelp Tutoring - Printable form</p>
          <h1>${escapeHtml(state.meta.title || 'Untitled form')}</h1>
          ${state.meta.audience ? `<p class="form-builder-print-audience">${escapeHtml(state.meta.audience)}</p>` : ''}
          ${state.meta.description ? `<p class="form-builder-print-description">${escapeHtml(state.meta.description)}</p>` : ''}
          <p class="form-builder-print-route-meta">
            <span><strong>${escapeHtml(route.label)}</strong></span>
            <span>${escapeHtml(path)}</span>
            <span>${route.questionIds.length} ${route.questionIds.length === 1 ? 'question' : 'questions'}</span>
          </p>
        </header>
        ${greeting ? `
          <section class="form-builder-print-intro">
            <h2>${escapeHtml(greeting.title || 'Welcome')}</h2>
            <p>${escapeHtml(greeting.body || 'Please complete the form below.')}</p>
          </section>
        ` : ''}
        <section class="form-builder-print-consent">
          <strong>Privacy Notice and Data Use Terms</strong>
          <p>Kelp uses the information in this form to provide tutoring support, communicate about the learning plan, and improve the service. Responses should be accessed only by authorised people and kept only as long as needed for the stated purpose.</p>
          <div class="form-builder-print-consent-check">
            <span class="form-builder-print-check-box" aria-hidden="true"></span>
            <span>I have read and agree with the Privacy Notice and Data Use Terms.</span>
          </div>
        </section>
        ${renderPrintableRespondentDetails()}
        ${pageMarkup}
      </article>
    `;
  }

  function buildPrintableStandaloneDocument(route, settings = printModalState) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(state.meta.title || 'Printable form')}</title>
</head>
<body class="is-printing-form form-print-standalone">
  <div class="form-builder-print-document">
    <style>${PRINTABLE_FORM_CSS}</style>
    ${buildPrintableFormMarkup(route, settings)}
  </div>
</body>
</html>`;
  }

  function finishFormPrint() {
    window.clearTimeout(printCleanupTimer);
    printCleanupTimer = null;
    document.body.classList.remove('is-printing-form');
    els.printDocument.setAttribute('aria-hidden', 'true');
    els.printDocument.innerHTML = '';
  }

  function printSelectedFormRoute() {
    const selectedRoute = getSelectedPrintRoute();
    if (!selectedRoute) {
      printModalState.message = 'Choose a respondent path before printing.';
      printModalState.messageIsError = true;
      renderFormPrint();
      return;
    }
    els.printDocument.innerHTML = `<style>${PRINTABLE_FORM_CSS}</style>${buildPrintableFormMarkup(selectedRoute, printModalState)}`;
    els.printDocument.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-printing-form');
    closeFormPrint();
    showMessage(`${selectedRoute.label} is ready in the print dialog.`);
    window.clearTimeout(printCleanupTimer);
    printCleanupTimer = window.setTimeout(finishFormPrint, 120000);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          window.print();
        } catch (error) {
          finishFormPrint();
          showMessage('The browser could not open the print dialog.', true);
        }
      });
    });
  }

  function handlePrintClick(event) {
    const actionButton = event.target.closest('[data-print-action]');
    if (!actionButton) return;
    if (actionButton.dataset.printAction === 'close') {
      closeFormPrint();
      return;
    }
    if (actionButton.dataset.printAction !== 'prepare') return;
    const invalidCustom = [
      ['short', printModalState.shortAnswerSize, printModalState.shortAnswerCustomMm],
      ['long', printModalState.longAnswerSize, printModalState.longAnswerCustomMm]
    ].find(([, size, value]) => size === 'custom' && (!Number.isFinite(Number(value)) || Number(value) < 10 || Number(value) > 260));
    if (invalidCustom) {
      printModalState.message = `Enter a ${invalidCustom[0]}-answer distance between 10 and 260 mm.`;
      printModalState.messageIsError = true;
      renderFormPrint();
      return;
    }
    printSelectedFormRoute();
  }

  function renderFormStructure() {
    const questions = state.blocks.filter((block) => block.kind === 'question');
    const phases = state.blocks.filter((block) => block.kind === 'phase');
    const conditionalPhases = phases.filter((phase) => phase.triggers?.length);
    const requiredQuestions = questions.filter((question) => question.required);
    const enabledDetails = Object.entries(state.meta.respondentDetails || {})
      .filter(([, config]) => config.enabled);
    const requiredDetails = enabledDetails.filter(([, config]) => config.required);
    const routingRules = conditionalPhases.flatMap((phase) => (
      phase.triggers.map((trigger) => ({ phase, trigger }))
    ));
    const questionTypes = Object.entries(QUESTION_TYPES)
      .map(([type, info]) => ({
        label: info.label,
        count: questions.filter((question) => question.type === type).length
      }))
      .filter((item) => item.count);
    const questionNumbers = getQuestionNumbers();
    const studentStepCount = buildPreviewSteps().length;
    const greeting = state.blocks.find((block) => block.kind === 'greeting');
    const goodbye = state.blocks.find((block) => block.kind === 'goodbye');

    els.structureContent.innerHTML = `
      <div class="form-builder-structure-column">
        <section class="form-builder-structure-section" aria-labelledby="structure-overview-heading">
          <div class="form-builder-structure-section-heading">
            <div>
              <h3 id="structure-overview-heading">Overview</h3>
              <p>Counts reflect the current unsaved builder state.</p>
            </div>
            <span class="form-builder-structure-live-badge">Live</span>
          </div>
          <div class="form-builder-structure-metrics">
            ${renderStructureMetric(state.blocks.length, 'Total blocks')}
            ${renderStructureMetric(questions.length, 'Questions')}
            ${renderStructureMetric(phases.length, 'Phases')}
            ${renderStructureMetric(studentStepCount, 'Student steps')}
          </div>
          <dl class="form-builder-structure-details">
            ${renderStructureDetail('Questions', `${requiredQuestions.length} required · ${questions.length - requiredQuestions.length} optional`)}
            ${renderStructureDetail('Phases', `${phases.length - conditionalPhases.length} normal · ${conditionalPhases.length} conditional`)}
            ${renderStructureDetail('Routing rules', String(routingRules.length))}
            ${renderStructureDetail('Respondent details', enabledDetails.length
              ? `${enabledDetails.length} collected · ${requiredDetails.length} required`
              : 'None collected')}
            ${renderStructureDetail('Submissions', state.settings.submissionPolicy.mode === SUBMISSION_MODES.MULTIPLE
              ? 'Multiple per respondent'
              : 'One per respondent')}
            ${renderStructureDetail('Opening / closing', `${greeting ? 'Custom greeting' : 'Default opening'} · ${goodbye ? 'Custom goodbye' : 'Default submission page'}`)}
          </dl>
          <details class="form-builder-structure-technical">
            <summary>Technical details</summary>
            <dl class="form-builder-structure-details">
              ${renderStructureDetail('Form ID', `<code>${escapeHtml(state.id)}</code>`, true)}
              ${renderStructureDetail('Document version', String(state.version))}
            </dl>
          </details>
        </section>

        <section class="form-builder-structure-section" aria-labelledby="structure-types-heading">
          <div class="form-builder-structure-section-heading">
            <div>
              <h3 id="structure-types-heading">Item types</h3>
              <p>Question formats currently used in this form.</p>
            </div>
          </div>
          ${questionTypes.length
            ? `<div class="form-builder-structure-type-list">${questionTypes.map((item) => `
                <span class="form-builder-structure-type-chip"><strong>${item.count}</strong>${escapeHtml(item.label)}</span>
              `).join('')}</div>`
            : '<p class="form-builder-structure-empty">No questions have been added yet.</p>'}
        </section>

        <section class="form-builder-structure-section" aria-labelledby="structure-checks-heading">
          <div class="form-builder-structure-section-heading">
            <div>
              <h3 id="structure-checks-heading">Structure checks</h3>
              <p>Quick signals before you test the student view.</p>
            </div>
          </div>
          ${renderStructureChecks(questions, phases)}
        </section>
      </div>

      <div class="form-builder-structure-column">
        <section class="form-builder-structure-section" aria-labelledby="structure-tree-heading">
          <div class="form-builder-structure-section-heading">
            <div>
              <h3 id="structure-tree-heading">Respondent hierarchy</h3>
              <p>Indented questions belong to the phase or initial group directly above them.</p>
            </div>
          </div>
          ${renderStructureTree(questionNumbers, enabledDetails, greeting, goodbye)}
        </section>

        <section class="form-builder-structure-section" aria-labelledby="structure-routing-heading">
          <div class="form-builder-structure-section-heading">
            <div>
              <h3 id="structure-routing-heading">Routing relationships</h3>
              <p>Routes can jump between branches, so they are shown separately from the hierarchy.</p>
            </div>
          </div>
          ${routingRules.length
            ? `<div class="form-builder-structure-routes">${routingRules.map(({ phase, trigger }) => `
                <article class="form-builder-structure-route">
                  <strong>${escapeHtml(getBlockById(trigger.sourcePhaseId)?.title || 'Earlier phase')} → ${escapeHtml(phase.title || 'Untitled phase')}</strong>
                  <span>${escapeHtml(getTriggerLabel(trigger))}</span>
                </article>
              `).join('')}</div>`
            : '<p class="form-builder-structure-empty">No conditional routes are configured. Every phase follows the normal form order.</p>'}
        </section>
      </div>
    `;
  }

  function renderStructureMetric(value, label) {
    return `<div class="form-builder-structure-metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function renderStructureDetail(label, value, trustedValue = false) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${trustedValue ? value : escapeHtml(value)}</dd></div>`;
  }

  function renderStructureTree(questionNumbers, enabledDetails, greeting, goodbye) {
    const topLevel = [];
    let initialQuestions = null;
    let currentPhase = null;

    if (greeting) {
      topLevel.push({
        kind: 'greeting',
        title: greeting.title?.trim() || 'Untitled greeting',
        subtitle: 'Opening page · includes the mandatory privacy notice',
        badge: 'Greeting'
      });
    } else {
      topLevel.push({
        kind: 'system',
        title: 'Privacy notice and consent',
        subtitle: 'Mandatory opening step using the default copy',
        badge: 'Required'
      });
    }

    if (enabledDetails.length) {
      const labels = enabledDetails.map(([key]) => IDENTITY_FIELDS[key]?.label || key);
      topLevel.push({
        kind: 'identity',
        title: 'Respondent details',
        subtitle: labels.join(', '),
        badge: `${enabledDetails.length} ${enabledDetails.length === 1 ? 'field' : 'fields'}`
      });
    }

    state.blocks.forEach((block) => {
      if (block.kind === 'greeting' || block.kind === 'goodbye') return;
      if (block.kind === 'phase') {
        currentPhase = {
          kind: 'phase',
          block,
          title: block.title?.trim() || 'Untitled phase',
          subtitle: block.triggers?.length
            ? `${block.triggers.length} conditional ${block.triggers.length === 1 ? 'route' : 'routes'}`
            : 'Follows the normal flow',
          badge: block.triggers?.length ? 'Conditional' : 'Normal flow',
          children: []
        };
        topLevel.push(currentPhase);
        return;
      }
      if (block.kind !== 'question') return;
      const questionNode = {
        kind: 'question',
        title: block.prompt?.trim() || 'Untitled question',
        subtitle: `Question ${questionNumbers.get(block.id)} · ${QUESTION_TYPES[block.type]?.label || 'Question'}`,
        badge: block.required ? 'Required' : 'Optional',
        required: block.required
      };
      if (currentPhase) {
        currentPhase.children.push(questionNode);
        return;
      }
      if (!initialQuestions) {
        initialQuestions = {
          kind: 'group',
          title: 'Initial questions',
          subtitle: 'Shown before the first phase',
          badge: 'Normal flow',
          children: []
        };
        topLevel.push(initialQuestions);
      }
      initialQuestions.children.push(questionNode);
    });

    if (goodbye) {
      topLevel.push({
        kind: 'goodbye',
        title: goodbye.title?.trim() || 'Untitled goodbye',
        subtitle: 'Submission confirmation page',
        badge: 'Goodbye'
      });
    } else {
      topLevel.push({
        kind: 'system',
        title: 'Default submission page',
        subtitle: 'Shown after the last available question',
        badge: 'System'
      });
    }

    return `
      <div class="form-builder-structure-tree">
        ${renderStructureNode({
          kind: 'root',
          title: state.meta.title?.trim() || 'Untitled form',
          subtitle: `${topLevel.length} top-level ${topLevel.length === 1 ? 'step' : 'steps'}`,
          badge: 'Form',
          children: topLevel
        })}
      </div>
    `;
  }

  function renderStructureNode(node) {
    const style = node.kind === 'phase' ? phaseAppearanceStyleAttribute(node.block?.appearance) : '';
    const classes = [
      'form-builder-structure-node',
      node.kind === 'root' ? 'is-root' : '',
      node.kind === 'phase' ? 'is-phase' : ''
    ].filter(Boolean).join(' ');
    const badgeClasses = [
      'form-builder-structure-node-badge',
      node.badge === 'Conditional' ? 'is-conditional' : '',
      node.required || node.badge === 'Required' ? 'is-required' : ''
    ].filter(Boolean).join(' ');
    const children = node.children
      ? `<ul>${node.children.length
        ? node.children.map((child) => `<li>${renderStructureNode(child)}</li>`).join('')
        : '<li><p class="form-builder-structure-empty">This phase does not contain any questions yet.</p></li>'}</ul>`
      : '';
    return `
      <div class="${classes}" ${style}>
        <div class="form-builder-structure-node-copy">
          <strong>${escapeHtml(node.title)}</strong>
          <small>${escapeHtml(node.subtitle)}</small>
        </div>
        <span class="${badgeClasses}">${escapeHtml(node.badge)}</span>
      </div>
      ${children}
    `;
  }

  function renderStructureChecks(questions, phases) {
    const warnings = [];
    if (!questions.length) warnings.push('Add at least one question before sharing this form.');
    phases.forEach((phase) => {
      if (!getQuestionsForPhase(phase.id).length) {
        warnings.push(`“${phase.title?.trim() || 'Untitled phase'}” does not contain any questions.`);
      }
    });
    if (!warnings.length) return '<p class="form-builder-structure-check">No structural issues found in the current flow.</p>';
    return warnings.map((warning) => `<p class="form-builder-structure-check is-warning">${escapeHtml(warning)}</p>`).join('');
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
        ${renderPhaseAppearanceControls(draft)}
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

  function renderPhaseAppearanceControls(draft) {
    const appearance = normalizePhaseAppearance(draft.appearance);
    return `
      <section class="form-builder-phase-appearance-controls">
        <div class="form-builder-phase-appearance-heading">
          <div>
            <h4>Phase appearance</h4>
            <p>Choose one page colour. The surrounding treatment and interaction accents are generated from it automatically.</p>
          </div>
          <span class="form-builder-phase-appearance-badge">One colour</span>
        </div>
        <div class="form-builder-phase-colour-grid">
          <label class="form-builder-phase-colour-control">
            <span>Page background</span>
            <input type="color" data-appearance-field="backgroundColor" value="${escapeAttribute(appearance.backgroundColor)}" aria-label="Phase page background color" />
          </label>
        </div>
        <div class="form-builder-phase-appearance-sample" data-phase-appearance-sample ${phaseAppearanceStyleAttribute(appearance)}>
          <div class="form-builder-phase-appearance-sample-card">
            <div>
              <strong>Phase preview</strong>
              <small>The page is softly tinted while the form card stays white.</small>
            </div>
            <button type="button" disabled>Derived accent</button>
          </div>
        </div>
      </section>
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
    const appearanceField = event.target.dataset.appearanceField;
    if (appearanceField) {
      phaseModalState.draft.appearance = normalizePhaseAppearance({
        ...phaseModalState.draft.appearance,
        [appearanceField]: event.target.value
      });
      const sample = els.phaseModalContent.querySelector('[data-phase-appearance-sample]');
      if (sample) sample.setAttribute('style', phaseAppearanceVariables(phaseModalState.draft.appearance));
      return;
    }
    const field = event.target.dataset.modalField;
    if (field) phaseModalState.draft[field] = event.target.value;
    const matcherField = event.target.dataset.matcherField;
    if (matcherField) phaseModalState.triggerDraft.matcher[matcherField] = event.target.value;
  }

  function handleModalChange(event) {
    if (!phaseModalState) return;
    phaseModalState.message = '';
    const appearanceField = event.target.dataset.appearanceField;
    if (appearanceField) {
      phaseModalState.draft.appearance = normalizePhaseAppearance({
        ...phaseModalState.draft.appearance,
        [appearanceField]: event.target.value
      });
      const sample = els.phaseModalContent.querySelector('[data-phase-appearance-sample]');
      if (sample) sample.setAttribute('style', phaseAppearanceVariables(phaseModalState.draft.appearance));
      return;
    }
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

  async function saveToLibrary() {
    try {
      normalizeState();
      const adapters = await formAdaptersReady;
      await adapters.forms.save(structuredCloneSafe(state));
      showMessage('Form saved to your library.');
      if (els.libraryModal.classList.contains('is-open')) await renderFormLibrary();
    } catch (error) {
      showMessage(error?.message || 'The form could not be saved to the library.', true);
    }
  }

  function openFormLibrary() {
    els.libraryModal.classList.add('is-open');
    els.libraryModal.setAttribute('aria-hidden', 'false');
    renderFormLibrary();
  }

  function closeFormLibrary() {
    els.libraryModal.classList.remove('is-open');
    els.libraryModal.setAttribute('aria-hidden', 'true');
  }

  function formLibraryStatusLabel(record) {
    if (record?.status === 'archived') return 'Archived';
    if (record?.reviewStatus === 'approved' && record?.publicationMode === 'privileged_direct') return 'Published directly';
    if (record?.reviewStatus === 'approved' && record?.publicationMode === 'review_approved') return 'Approved after review';
    return {
      draft: 'Private draft',
      pending_review: 'Pending review',
      approved: 'Published',
      changes_requested: 'Changes requested',
      rejected: 'Rejected'
    }[record?.reviewStatus] || 'Private draft';
  }

  async function renderFormLibrary() {
    els.libraryList.innerHTML = '<div class="form-builder-library-empty"><p>Loading saved forms&hellip;</p></div>';
    try {
      const [adapters] = await Promise.all([formAdaptersReady, builderAuthorizationReady]);
      const records = await adapters.forms.list();
      const provider = adapters.meta?.provider || 'custom';
      const canPublishDirectly = provider === 'local' || Boolean(builderAuthorization?.can?.('form.publish'));
      els.libraryProvider.textContent = adapterResolutionError
        ? 'Local browser library (custom provider unavailable)'
        : `${provider === 'local' ? 'Local browser' : provider} library`;
      if (!records.length) {
        els.libraryList.innerHTML = `
          <div class="form-builder-library-empty">
            <p>No forms have been saved yet. Save the current form to create your first library record.</p>
          </div>
        `;
        return;
      }
      els.libraryList.innerHTML = records.map((record) => {
        const archived = record.status === 'archived';
        const title = record.definition?.meta?.title || 'Untitled form';
        const questionCount = (record.definition?.blocks || []).filter((block) => block.kind === 'question').length;
        return `
          <article class="form-builder-library-record ${archived ? 'is-archived' : ''}">
            <div class="form-builder-library-record-copy">
              <div class="form-builder-library-title-line">
                <h3>${escapeHtml(title)}</h3>
                <span class="form-builder-library-status">${escapeHtml(formLibraryStatusLabel(record))}</span>
              </div>
              <p>${questionCount} ${questionCount === 1 ? 'question' : 'questions'} &middot; Updated ${escapeHtml(formatLibraryTimestamp(record.updatedAt))}</p>
            </div>
            <div class="form-builder-inline-actions">
              <button type="button" class="form-builder-btn form-builder-btn-secondary form-builder-small-btn" data-library-action="open-copy" data-form-id="${escapeAttribute(record.id)}">Open as copy</button>
              ${archived
                ? `<button type="button" class="form-builder-btn form-builder-btn-danger form-builder-small-btn" data-library-action="delete" data-form-id="${escapeAttribute(record.id)}">Delete</button>`
                : record.reviewStatus === 'draft'
                  ? `<button type="button" class="form-builder-btn form-builder-btn-secondary form-builder-small-btn" data-library-action="submit-review" data-form-id="${escapeAttribute(record.id)}">Submit for review</button>
                     ${canPublishDirectly ? `<button type="button" class="form-builder-btn form-builder-btn-secondary form-builder-small-btn" data-library-action="publish" data-form-id="${escapeAttribute(record.id)}">Publish directly</button>` : ''}
                     <button type="button" class="form-builder-btn form-builder-btn-outline form-builder-small-btn" data-library-action="archive" data-form-id="${escapeAttribute(record.id)}">Archive</button>`
                  : ''}
            </div>
          </article>
        `;
      }).join('');
    } catch (error) {
      els.libraryList.innerHTML = `
        <div class="form-builder-library-empty is-error">
          <p>${escapeHtml(error?.message || 'The form library could not be loaded.')}</p>
        </div>
      `;
    }
  }

  async function handleLibraryClick(event) {
    const button = event.target.closest('[data-library-action]');
    if (!button) return;
    const action = button.dataset.libraryAction;
    if (action === 'close') {
      closeFormLibrary();
      return;
    }
    if (action === 'save-current') {
      await saveToLibrary();
      return;
    }
    if (action === 'refresh') {
      await renderFormLibrary();
      return;
    }

    const formId = button.dataset.formId;
    if (!formId) return;
    try {
      const adapters = await formAdaptersReady;
      if (action === 'open-copy') {
        await openLibraryRecordAsCopy(formId, adapters);
        return;
      }
      if (action === 'submit-review') {
        const confirmed = window.confirm('Submit this form for mentor or administrator review? The submitted record will be locked; further revisions must be made from a new copy.');
        if (!confirmed) return;
        await adapters.forms.submitForReview(formId);
        await renderFormLibrary();
        showMessage('Form submitted for review. The submitted record is now locked.');
        return;
      }
      if (action === 'publish') {
        const confirmed = window.confirm('Publish this form directly? The published record will be immutable, and later revisions must be made from a new copy.');
        if (!confirmed) return;
        const notes = window.prompt('Optional publication note for the audit trail:', '') ?? '';
        await adapters.forms.publish(formId, { notes });
        await renderFormLibrary();
        showMessage('Form published directly. The published record is now locked.');
        return;
      }
      if (action === 'archive') {
        await adapters.forms.archive(formId);
        await renderFormLibrary();
        showMessage('Form archived. It can now be deleted or opened as a copy.');
        return;
      }
      if (action === 'delete') {
        const confirmed = window.confirm('Permanently delete this archived form? Existing immutable submissions remain independent.');
        if (!confirmed) return;
        await adapters.forms.remove(formId);
        await renderFormLibrary();
        showMessage('Archived form deleted. Existing submissions were not changed.');
      }
    } catch (error) {
      showMessage(error?.message || 'The library action could not be completed.', true);
    }
  }

  async function openLibraryRecordAsCopy(formId, adapters = null) {
    const resolvedAdapters = adapters || await formAdaptersReady;
    const record = await resolvedAdapters.forms.load(formId);
    if (!record?.definition) throw new Error('The saved form could not be found.');
    state = FormDomain.cloneFormDefinition(record.definition);
    previewPageIndex = 0;
    closeFormLibrary();
    renderAll();
    showMessage('Saved form opened as a new independent copy.');
    return state;
  }

  function formatLibraryTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'recently';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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
      const saved = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]
        .map((key) => localStorage.getItem(key))
        .find(Boolean);
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
    const exported = { ...structuredCloneSafe(state), exportedAt: new Date().toISOString() };
    downloadFile(`${fileName}.json`, JSON.stringify(exported, null, 2), 'application/json');
    showMessage('JSON export prepared.');
  }

  async function importJson(event) {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      state = FormDomain.cloneFormDefinition(imported);
      previewPageIndex = 0;
      renderAll();
      showMessage('Form imported as a new independent copy.');
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
    const handoff = {
      schema: STUDENT_VIEW_HANDOFF_SCHEMA,
      sessionId: createId('student-view'),
      form: createStudentViewPayload()
    };

    try {
      localStorage.setItem(STUDENT_VIEW_STORAGE_KEY, JSON.stringify(handoff));
    } catch (error) {
      // The postMessage handshake below also supports file:// and restricted storage contexts.
    }

    const popup = window.open(`./form-taker.html?session=${encodeURIComponent(handoff.sessionId)}`, '_blank');
    if (!popup) {
      showMessage('The browser blocked the preview window. Allow pop-ups and try again.', true);
      return;
    }

    const clearHandoffListener = () => {
      window.removeEventListener('message', handleStudentViewMessage);
      window.clearTimeout(listenerTimer);
    };
    const handleStudentViewMessage = (event) => {
      const message = event.data;
      if (event.source !== popup || !message || message.sessionId !== handoff.sessionId) return;
      if (message.type === STUDENT_VIEW_READY_MESSAGE) {
        popup.postMessage({ ...handoff, type: STUDENT_VIEW_LOAD_MESSAGE }, '*');
        return;
      }
      if (message.type === STUDENT_VIEW_LOADED_MESSAGE) clearHandoffListener();
    };
    window.addEventListener('message', handleStudentViewMessage);
    const listenerTimer = window.setTimeout(clearHandoffListener, 10000);
    popup.focus?.();
    showMessage('Student view opened in a new tab.');
  }

  function createStudentViewPayload() {
    return structuredCloneSafe({
      id: state.id,
      version: state.version,
      meta: state.meta,
      settings: state.settings,
      blocks: state.blocks
    });
  }

  function buildStudentViewDocument() {
    const safeState = JSON.stringify({
      id: state.id,
      version: state.version,
      meta: state.meta,
      settings: state.settings,
      blocks: state.blocks
    }).replace(/</g, '\\u003c');
    const domainFactorySource = window.KelpFormDomainFactory.toString();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(state.meta.title || 'Kelp Form')}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root{--p:#00acc1;--pd:#145c63;--s:#5fae63;--sd:#2d6b33;--text:#383838;--muted:rgba(33,33,33,.65);--border:#e5ece8;--danger:#b53f3f}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,rgba(86,241,255,.42),transparent 34%),radial-gradient(circle at bottom right,rgba(95,174,99,.12),transparent 32%),linear-gradient(135deg,#fcfcfc 0%,#eef8fb 45%,#f0faf6 100%);font-family:Inter,sans-serif;color:var(--text)}main{width:min(100% - 32px,720px);margin:0 auto;padding:42px 0}.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;color:var(--pd);font-size:.85rem;font-weight:800}.mark{display:grid;width:30px;height:30px;place-items:center;border:2px solid var(--p);border-radius:9px;color:var(--p)}.card{padding:28px;border:1px solid var(--border);border-radius:16px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(33,33,33,.08)}.progress{height:6px;margin:0 0 23px;border-radius:999px;background:#e7f1ef;overflow:hidden}.progress span{display:block;height:100%;background:var(--s);transition:width .2s}.meta{margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid var(--s)}.meta h1{margin:0;color:var(--text);font-size:clamp(1.55rem,4vw,2rem);line-height:1.15;letter-spacing:-.04em}.audience{margin:5px 0 0;color:var(--pd);font-size:.76rem;font-weight:800}.description{margin:9px 0 0;color:var(--muted);font-size:.9rem;line-height:1.55}.page-title{margin:4px 0 7px;font-size:1.2rem}.page-copy{margin:0 0 20px;color:var(--muted);line-height:1.55}.question-list{display:grid;gap:16px}.question{display:grid;gap:8px;padding:15px;border:1px solid var(--border);border-radius:12px;background:white}.question label,.identity label{font-size:.92rem;font-weight:700}.help{margin:-2px 0 0;color:var(--muted);font-size:.8rem}.required{color:var(--danger)}input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],textarea{width:100%;min-height:44px;padding:0 12px;border:1px solid #c9c9c9;border-radius:9px;background:white;color:var(--text);font:inherit;outline:none}textarea{min-height:112px;padding:11px 12px;resize:vertical}input:focus,textarea:focus{border-color:var(--s);box-shadow:0 0 0 4px rgba(0,172,193,.12)}.identity{display:grid;gap:11px;margin:0 0 16px;padding:13px;border:1px solid rgba(0,172,193,.2);border-radius:12px;background:rgba(0,172,193,.035)}.identity h3{margin:0;color:var(--pd);font-size:.86rem}.identity-field{display:grid;gap:7px}.choices{display:grid;gap:10px}.choice{display:flex;align-items:center;gap:9px;color:var(--text);font-size:.9rem}.choice input{width:16px;height:16px;margin:0;accent-color:auto}.actions{display:flex;justify-content:space-between;gap:10px;margin-top:24px}.btn{min-height:42px;padding:0 15px;border:1px solid #bdbdbd;border-radius:9px;background:white;color:var(--text);font:inherit;font-size:.87rem;font-weight:700;cursor:pointer}.btn:hover{border-color:var(--p);background:rgba(0,172,193,.08)}.btn:disabled{cursor:not-allowed;opacity:.55}.btn.primary{border-color:var(--p);background:var(--p);color:white}.btn.primary:hover{background:#0099ab}.error{margin:13px 0 0;color:var(--danger);font-size:.84rem;font-weight:600}.notice{margin:0 0 14px;padding:11px;border:1px solid rgba(0,172,193,.2);border-radius:10px;background:rgba(0,172,193,.035);color:var(--muted);font-size:.79rem;line-height:1.55}.welcome,.thanks{display:grid;min-height:300px;align-content:center;justify-items:center;gap:12px;text-align:center}.welcome h2,.thanks h2{margin:0;color:var(--pd);font-size:1.6rem}.welcome p,.thanks p{max-width:500px;margin:0;color:var(--muted);line-height:1.6}.terms{width:100%;max-width:530px;padding:14px;border:1px solid rgba(0,172,193,.22);border-radius:12px;background:rgba(0,172,193,.035);color:var(--muted);font-size:.82rem;text-align:left;line-height:1.55}.terms strong{color:var(--pd)}.consent{display:flex;align-items:flex-start;gap:9px;margin-top:10px;color:var(--text);font-size:.82rem;font-weight:700;cursor:pointer}.consent input{width:16px;height:16px;margin:2px 0 0;accent-color:auto}.full{width:100%;margin-top:8px}.submitted{display:grid;min-height:300px;place-items:center;text-align:center}.submitted h2{margin:0;color:var(--pd)}.submitted .actions{justify-content:center}.reference{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:700;overflow-wrap:anywhere}.route-note{margin:0 0 13px;padding:9px;border-radius:8px;background:rgba(95,174,99,.12);color:var(--sd);font-size:.75rem;font-weight:700}.phase-theme{margin-top:2px;padding:16px;border:1px solid var(--phase-selection-ring,rgba(0,172,193,.18));border-top:4px solid var(--phase-stripe,var(--s));border-radius:12px;background:var(--phase-background-soft,rgba(0,172,193,.06))}.phase-theme .page-title{margin-top:0}.phase-theme .question{border-color:var(--phase-selection-ring,rgba(0,172,193,.18));background:white}.phase-theme .question:hover{border-color:var(--phase-selection,var(--p));background:white}.phase-theme input:focus,.phase-theme textarea:focus{border-color:var(--phase-selection,var(--p));box-shadow:0 0 0 4px var(--phase-selection-soft,rgba(0,172,193,.12))}.phase-theme .choice input{accent-color:auto}.phase-theme .route-note{background:rgba(255,255,255,.72);color:var(--text);border:1px solid var(--phase-selection-ring,rgba(0,172,193,.18))}@media(max-width:520px){main{width:min(100% - 22px,720px);padding:22px 0}.card{padding:18px}.actions{flex-wrap:wrap}.actions .btn{flex:1 1 130px}}
.choice input,.consent input{appearance:auto;-webkit-appearance:auto;min-width:16px;min-height:0;flex:0 0 16px;padding:0;border:0;background:transparent;box-shadow:none;outline:0;accent-color:auto}.choice input:focus,.consent input:focus{border-color:transparent;box-shadow:none}.choice input:focus-visible,.consent input:focus-visible{outline:none}
.step-eyebrow{margin:0 0 8px;color:var(--sd);font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.phase-question-count{margin:14px 0 0;color:var(--muted);font-size:.82rem;font-weight:700}
</style>
</head>
<body>
<main>
  <div class="brand"><span class="mark">K</span><span>Kelp form preview</span></div>
  <div class="card" id="app"></div>
</main>
<script>
const formDomain=(${domainFactorySource})(globalThis);
const formState=${safeState};
const app=document.getElementById('app');
const answers={};
let submitted=false;
let submissionRecord=null;
let consent=false;
let history=[];
let historyIndex=0;
let stepIndex=0;
let routeDirty=false;
const esc=(value)=>String(value??'').replace(/[&<>\"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const optionList=(q)=>formDomain.getOptionSet(q);
const identityInfo=formDomain.IDENTITY_FIELDS;
function contentPages(){return formDomain.buildContentPages(formState)}
function greeting(){return formState.blocks.find(b=>b.kind==='greeting')||null}function goodbye(){return formState.blocks.find(b=>b.kind==='goodbye')||null}function pageById(id){return formDomain.pageById(formState,id)}function normalPage(p){return formDomain.isNormalPage(p)}function firstPageId(){return formDomain.firstPageId(formState)}function initialSnapshot(){return formDomain.createInitialSnapshot()}
function phaseVars(appearance){return formDomain.phaseAppearanceVariables(appearance)}
function enabledIdentityFields(){return formDomain.getEnabledIdentityFieldKeys(formState)}
function contentSteps(page){return formDomain.buildPageRespondentSteps(page)}
function stepsForSnapshot(snapshot,snapshotIndex=historyIndex){return formDomain.stepsForRouteSnapshot(formState,snapshot,snapshotIndex)}
function currentSteps(){return stepsForSnapshot(history[historyIndex],historyIndex)}
function currentStep(){const steps=currentSteps();stepIndex=Math.max(0,Math.min(stepIndex,steps.length-1));return steps[stepIndex]}
function deep(v){return JSON.parse(JSON.stringify(v))}function sameSnapshot(a,b){return a&&b&&a.pageId===b.pageId&&JSON.stringify(a.queue)===JSON.stringify(b.queue)&&JSON.stringify(a.visited)===JSON.stringify(b.visited)}
function nextSnapshot(snapshot){return formDomain.nextSnapshot(formState,answers,snapshot)}
function header(){return '<div class="meta"><h1>'+esc(formState.meta.title||'Untitled form')+'</h1>'+(formState.meta.audience?'<p class="audience">'+esc(formState.meta.audience)+'</p>':'')+(formState.meta.description?'<p class="description">'+esc(formState.meta.description)+'</p>':'')+'</div>'}
function progress(){const completedBefore=history.slice(0,historyIndex).reduce((total,snapshot,index)=>total+stepsForSnapshot(snapshot,index).length,0);const position=completedBefore+stepIndex+1;const currentRemaining=Math.max(0,currentSteps().length-stepIndex-1);const visited=new Set(history.slice(0,historyIndex+1).map(snapshot=>snapshot.pageId));const remainingNormalSteps=contentPages().filter(page=>normalPage(page)&&!visited.has(page.id)).reduce((total,page)=>total+contentSteps(page).length,0);const identityRemaining=historyIndex===0&&enabledIdentityFields().length?1:0;const goodbyeRemaining=history[historyIndex]?.pageId==='goodbye'?0:1;const total=Math.max(position,position+currentRemaining+identityRemaining+remainingNormalSteps+goodbyeRemaining);const percentage=Math.min(100,(position/total)*100);return '<div class="progress" role="progressbar" aria-label="Form progress" aria-valuemin="1" aria-valuemax="'+total+'" aria-valuenow="'+position+'"><span style="width:'+percentage+'%"></span></div>'}
function inputFor(q){const name='q-'+q.id;if(q.type==='short-answer')return '<input type="text" data-question="'+esc(q.id)+'" placeholder="Your answer" value="'+esc(answers[q.id]||'')+'" />';if(q.type==='long-answer')return '<textarea data-question="'+esc(q.id)+'" placeholder="Write your answer">'+esc(answers[q.id]||'')+'</textarea>';if(q.type==='number')return '<input type="number" step="any" data-question="'+esc(q.id)+'" placeholder="Enter a number" value="'+esc(answers[q.id]||'')+'" />';const options=optionList(q);const kind=q.type==='multiple-answer'?'checkbox':'radio';return '<div class="choices">'+options.map(o=>{const current=answers[q.id];const checked=kind==='checkbox'?Array.isArray(current)&&current.includes(o.id):current===o.id;return '<label class="choice"><input type="'+kind+'" name="'+name+'" data-question="'+esc(q.id)+'" value="'+esc(o.id)+'" '+(checked?'checked':'')+' /><span>'+esc(o.label||'Untitled option')+'</span></label>'}).join('')+'</div>'}
function question(q){return '<section class="question"><label>'+esc(q.prompt||'Untitled question')+(q.required?'<span class="required"> *</span>':'')+'</label>'+(q.helpText?'<p class="help">'+esc(q.helpText)+'</p>':'')+inputFor(q)+'</section>'}
function identity(){const config=formState.meta.respondentDetails||{};const fields=enabledIdentityFields();if(!fields.length)return'';return '<section class="identity"><p class="step-eyebrow">About you</p><h2>Respondent details</h2><p class="page-copy">Please provide the information requested below before continuing to the questions.</p>'+fields.map(k=>{const info=identityInfo[k],field=config[k],id='identity-'+k;return '<div class="identity-field"><label>'+esc(info.label)+(field.required?'<span class="required"> *</span>':'')+'</label><input type="'+info.inputType+'" data-identity="'+k+'" autocomplete="'+esc(info.autocomplete||'off')+'" placeholder="'+esc(info.placeholder)+'" value="'+esc(answers[id]||'')+'" /></div>'}).join('')+'</section>'}
function privacy(){const g=greeting();return '<section class="welcome"><h2>'+esc(g?.title||'Before we begin')+'</h2><p>'+esc(g?.body||'Please read the information below before continuing.')+'</p><div class="terms"><strong>Privacy Notice and Data Use Terms</strong><p>Kelp uses the information in this form to provide tutoring support, communicate about the learning plan, and improve the service. Responses should be accessed only by authorised people and kept only as long as needed for the stated purpose.</p><label class="consent"><input type="checkbox" data-consent '+(consent?'checked':'')+' /><span>I have read and agree with the Privacy Notice and Data Use Terms.</span></label></div><button class="btn primary full" data-action="start" '+(consent?'':'disabled')+'>'+esc(g?.buttonText||'Start form')+'</button></section>'}
function completeSubmission(){submissionRecord=formDomain.createSubmissionRecord(formState,answers,{pageIds:history.map(snapshot=>snapshot.pageId)});submitted=true;if(typeof window.CustomEvent==='function'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('kelp:form-submitted',{detail:submissionRecord}));render()}
function restartSubmission(){Object.keys(answers).forEach(key=>delete answers[key]);submitted=false;submissionRecord=null;consent=false;history=[initialSnapshot()];historyIndex=0;stepIndex=0;routeDirty=false;render()}
function render(){if(!history.length){history=[initialSnapshot()];historyIndex=0;stepIndex=0}if(submitted){const another=formState.settings?.submissionPolicy?.mode==='multiple'?'<button class="btn primary" data-action="restart">Start another response</button>':'';app.innerHTML='<section class="submitted"><div><h2>Submitted</h2><p class="description">Your response is locked as an immutable submission snapshot.</p><p class="notice">Reference: <span class="reference">'+esc(submissionRecord?.id||'Pending')+'</span></p><div class="actions">'+another+'</div></div></section>';return}const step=currentStep();let content=header()+progress();if(step.kind==='privacy'){app.innerHTML=content+privacy();return}if(step.kind==='identity'){content+=identity()+'<p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev">Previous</button><button class="btn primary" data-action="next">Next</button></div>';app.innerHTML=content;return}if(step.kind==='goodbye'){const g=goodbye();content+='<section class="thanks"><h2>'+esc(g?.title||'Thank you')+'</h2><p>'+esc(g?.body||'Your answers are ready to be submitted.')+'</p><p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev">Previous</button><button class="btn primary" data-action="submit">'+esc(g?.buttonText||'Submit form')+'</button></div></section>';app.innerHTML=content;return}const page=step.page;if(!page){app.innerHTML=content+'<section class="thanks"><h2>No available page</h2><p>Please return to the builder and review the phase rules.</p></section>';return}const conditional=page.phaseId&&page.block.triggers&&page.block.triggers.length;const themed=page.type==='phase';const openTheme=themed?'<section class="phase-theme" style="'+phaseVars(page.block.appearance)+'">':'';const closeTheme=themed?'</section>':'';if(step.kind==='phase-intro'){content+=openTheme+'<p class="step-eyebrow">Next section</p>'+(conditional?'<p class="route-note">This section was opened by a matching route condition.</p>':'')+'<h2 class="page-title">'+esc(page.block.title||'Questions')+'</h2>'+(page.block.description?'<p class="page-copy">'+esc(page.block.description)+'</p>':'<p class="page-copy">Continue when you are ready for the next section.</p>')+'<p class="phase-question-count">'+page.questions.length+' '+(page.questions.length===1?'question':'questions')+' in this section</p><div class="actions"><button class="btn" data-action="prev">Previous</button><button class="btn primary" data-action="next">Next</button></div>'+closeTheme;app.innerHTML=content;return}if(step.kind==='question'){const contextLabel=page.block.title||'Questions';content+=openTheme+'<p class="step-eyebrow">'+esc(contextLabel)+' &middot; Question '+(step.questionIndex+1)+' of '+step.questionCount+'</p><div class="question-list">'+question(step.question)+'</div><p class="error" id="error"></p><div class="actions"><button class="btn" data-action="prev">Previous</button><button class="btn primary" data-action="next">Next</button></div>'+closeTheme;app.innerHTML=content;return}content+=openTheme+'<h2 class="page-title">'+esc(page.block.title||'Questions')+'</h2><p class="page-copy">This section has no questions. Continue to the next part of the form.</p><div class="actions"><button class="btn" data-action="prev">Previous</button><button class="btn primary" data-action="next">Next</button></div>'+closeTheme;app.innerHTML=content}
function setValidationError(message){const error=document.getElementById('error');if(error)error.textContent=message}
function validateCurrent(){const step=currentStep();if(step.kind==='privacy')return consent;if(step.kind==='identity'){const identityResult=formDomain.validateRespondentDetails(formState,answers,true);if(identityResult!==true){setValidationError(identityResult);return false}const missingIdentity=formDomain.getMissingRequired(formState,answers,{questions:[]},true);if(!missingIdentity.length)return true;setValidationError('Please complete '+(missingIdentity.length===1?missingIdentity[0]:'all required respondent details')+' before continuing.');return false}if(step.kind!=='question')return true;const missing=formDomain.getMissingRequired(formState,answers,{questions:[step.question]},false);if(!missing.length)return true;setValidationError('Please answer '+missing[0]+' before continuing.');return false}
function proposedValue(el){if(el.dataset.identity)return el.value;const id=el.dataset.question;if(el.type==='checkbox')return [...document.querySelectorAll('input[data-question="'+CSS.escape(id)+'"]:checked')].map(node=>node.value).sort();return el.value}
function keyFor(el){return el.dataset.identity?'identity-'+el.dataset.identity:el.dataset.question}
function sameValue(a,b){if(Array.isArray(a)||Array.isArray(b))return JSON.stringify(a||[])===JSON.stringify(b||[]);return String(a??'')===String(b??'')}
function saveChange(el){const key=keyFor(el);if(!key)return;const next=proposedValue(el),previous=answers[key];if(sameValue(previous,next))return;if(historyIndex<history.length-1&&!routeDirty){const proceed=window.confirm('Changing this answer may send you through a different path. If the pathway changes, answers given after this page will be removed. Do you want to continue?');if(!proceed){render();return}routeDirty=true}answers[key]=next}
function questionsForPageId(id){return formDomain.questionsForPageId(formState,id)}
function discardFutureAnswers(){const future=history.slice(historyIndex+1);future.forEach(s=>{questionsForPageId(s.pageId).forEach(q=>delete answers[q.id]);if(s.pageId==='initial-questions'||pageById(s.pageId)?.order===contentPages()[0]?.order){Object.keys(identityInfo).forEach(k=>delete answers['identity-'+k])}})}
function goNext(){if(!validateCurrent())return;const steps=currentSteps();if(stepIndex<steps.length-1){stepIndex++;render();return}if(!routeDirty&&historyIndex<history.length-1){historyIndex++;stepIndex=0;render();return}const current=history[historyIndex];const next=nextSnapshot(current);if(!next){submitted=true;render();return}const known=history[historyIndex+1];if(routeDirty&&known&&!sameSnapshot(next,known)){discardFutureAnswers();history=history.slice(0,historyIndex+1)}if(routeDirty&&known&&sameSnapshot(next,known)){historyIndex++;stepIndex=0;routeDirty=false;render();return}history=history.slice(0,historyIndex+1);history.push(deep(next));historyIndex++;stepIndex=0;routeDirty=false;render()}
function goPrevious(){if(stepIndex>0){stepIndex--;render();return}if(historyIndex===0)return;historyIndex--;stepIndex=Math.max(0,stepsForSnapshot(history[historyIndex],historyIndex).length-1);routeDirty=false;render()}
app.addEventListener('input',e=>{if(e.target.matches('[data-question],[data-identity]')){if(e.target.type!=='checkbox'&&e.target.type!=='radio')saveChange(e.target)}});app.addEventListener('change',e=>{if(e.target.matches('[data-question],[data-identity]'))saveChange(e.target);if(e.target.matches('[data-consent]')){consent=e.target.checked;render()}});app.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;if(a==='start'){if(!consent)return;goNext();return}if(a==='prev'){goPrevious();return}if(a==='next'){goNext();return}if(a==='submit'){if(validateCurrent())completeSubmission();return}if(a==='restart')restartSubmission()});render();
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
