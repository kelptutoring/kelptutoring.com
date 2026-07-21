(function attachKelpFormDomain(root) {
  'use strict';

  // Keep this factory self-contained: the builder serializes it into the generated respondent preview.
  function createKelpFormDomain(runtime = globalThis) {
    const FORM_DOCUMENT_VERSION = 3;
    const SUBMISSION_DOCUMENT_VERSION = 1;
    const SUBMISSION_MODES = Object.freeze({
      SINGLE: 'single',
      MULTIPLE: 'multiple'
    });

    const QUESTION_TYPES = Object.freeze({
      'short-answer': { label: 'Short answer', helper: 'One concise written response.', routable: false },
      'long-answer': { label: 'Long answer', helper: 'A fuller written response.', routable: false },
      'multiple-choice': { label: 'Multiple choice', helper: 'Respondent selects one option.', routable: true },
      'multiple-answer': { label: 'Multiple answer', helper: 'Respondent may select more than one option.', routable: true },
      number: { label: 'Number', helper: 'Respondent enters a numeric value.', routable: true },
      'true-false': { label: 'True / false', helper: 'Respondent selects one of two fixed options.', routable: true }
    });

    const PDF_ANSWER_SPACE_SIZES_MM = Object.freeze({ small: 35, medium: 60, large: 95 });
    const PDF_ANSWER_SPACE_MODES = Object.freeze(['none', 'small', 'medium', 'large', 'custom']);

    const IDENTITY_FIELDS = Object.freeze({
      fullName: {
        label: 'Full name',
        helper: 'Lets you identify the respondent by name.',
        inputType: 'text',
        autocomplete: 'name',
        placeholder: 'Example: Ana Maria Silva',
        supportsVerify: false
      },
      birthdate: {
        label: 'Birthdate',
        helper: 'Useful when age or parent consent matters.',
        inputType: 'date',
        autocomplete: 'bday',
        placeholder: '',
        supportsVerify: false
      },
      email: {
        label: 'E-mail address',
        helper: 'Can be checked for valid structure and later confirmed with an e-mail link or code.',
        inputType: 'email',
        autocomplete: 'email',
        placeholder: 'name@example.com',
        supportsVerify: true
      },
      phone: {
        label: 'Phone number',
        helper: 'Can be checked for a plausible number and later confirmed by SMS or WhatsApp.',
        inputType: 'tel',
        autocomplete: 'tel',
        placeholder: '+55 (00) 00000-0000',
        supportsVerify: true
      },
      country: {
        label: 'Country',
        helper: 'Provides the country context needed for later time-zone matching.',
        inputType: 'text',
        autocomplete: 'country-name',
        placeholder: 'Example: Brazil',
        supportsVerify: false
      },
      state: {
        label: 'State / province',
        helper: 'Pairs with country to narrow the respondent’s likely time zone.',
        inputType: 'text',
        autocomplete: 'address-level1',
        placeholder: 'Example: São Paulo',
        supportsVerify: false
      },
      city: {
        label: 'City',
        helper: 'Pairs with state / province and country for more precise location and time-zone matching.',
        inputType: 'text',
        autocomplete: 'address-level2',
        placeholder: 'Example: Campinas',
        supportsVerify: false
      }
    });

    function createId(prefix = 'block') {
      if (runtime.crypto?.randomUUID) return `${prefix}-${runtime.crypto.randomUUID()}`;
      return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function createOption(label = 'Option') {
      return { id: createId('option'), label };
    }

    function defaultIdentityState() {
      return {
        fullName: { enabled: true, required: true, verify: false },
        birthdate: { enabled: false, required: false, verify: false },
        email: { enabled: false, required: false, verify: false },
        phone: { enabled: false, required: false, verify: false },
        country: { enabled: false, required: false, verify: false },
        state: { enabled: false, required: false, verify: false },
        city: { enabled: false, required: false, verify: false }
      };
    }

    function defaultPhaseAppearance() {
      return {
        backgroundColor: '#00ACC1'
      };
    }

    function normalizeHexColor(value, fallback) {
      const candidate = String(value || '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
    }

    function normalizePhaseAppearance(input) {
      const source = input && typeof input === 'object' ? input : {};
      const defaults = defaultPhaseAppearance();
      return {
        backgroundColor: normalizeHexColor(source.backgroundColor, defaults.backgroundColor)
      };
    }

    function hexToRgba(hex, alpha) {
      const safe = normalizeHexColor(hex, '#00ACC1');
      const value = safe.slice(1);
      const red = Number.parseInt(value.slice(0, 2), 16);
      const green = Number.parseInt(value.slice(2, 4), 16);
      const blue = Number.parseInt(value.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function mixHexColor(hex, targetHex, amount) {
      const source = normalizeHexColor(hex, '#00ACC1').slice(1);
      const target = normalizeHexColor(targetHex, '#000000').slice(1);
      const ratio = Math.max(0, Math.min(1, Number(amount) || 0));
      const channel = (offset) => Math.round(
        Number.parseInt(source.slice(offset, offset + 2), 16) * (1 - ratio)
        + Number.parseInt(target.slice(offset, offset + 2), 16) * ratio
      ).toString(16).padStart(2, '0');
      return `#${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
    }

    function readableTextColor(hex) {
      const safe = normalizeHexColor(hex, '#00ACC1').slice(1);
      const red = Number.parseInt(safe.slice(0, 2), 16);
      const green = Number.parseInt(safe.slice(2, 4), 16);
      const blue = Number.parseInt(safe.slice(4, 6), 16);
      const perceivedBrightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
      return perceivedBrightness >= 155 ? '#173538' : '#FFFFFF';
    }

    function phaseAppearanceVariables(input) {
      const appearance = normalizePhaseAppearance(input);
      const colour = appearance.backgroundColor;
      const strongColour = mixHexColor(colour, '#000000', 0.16);
      return [
        `--phase-background:${colour}`,
        `--phase-background-faint:${hexToRgba(colour, 0.045)}`,
        `--phase-background-soft:${hexToRgba(colour, 0.11)}`,
        `--phase-page-faint:${hexToRgba(colour, 0.07)}`,
        `--phase-page-soft:${hexToRgba(colour, 0.24)}`,
        `--phase-stripe:${colour}`,
        `--phase-selection:${colour}`,
        `--phase-selection-strong:${strongColour}`,
        `--phase-selection-soft:${hexToRgba(colour, 0.12)}`,
        `--phase-selection-ring:${hexToRgba(colour, 0.26)}`,
        `--phase-control-text:${readableTextColor(colour)}`
      ].join(';');
    }

    function isWrittenQuestionType(type) {
      return type === 'short-answer' || type === 'long-answer';
    }

    function defaultPdfAnswerSpace(type = 'short-answer') {
      return type === 'long-answer'
        ? { size: 'medium', customMm: PDF_ANSWER_SPACE_SIZES_MM.medium }
        : { size: 'small', customMm: PDF_ANSWER_SPACE_SIZES_MM.small };
    }

    function normalizePdfAnswerSpace(input, type = 'short-answer') {
      const defaults = defaultPdfAnswerSpace(type);
      const source = input && typeof input === 'object' ? input : {};
      if (type === 'short-answer') {
        return {
          size: source.size === 'none' ? 'none' : 'small',
          customMm: PDF_ANSWER_SPACE_SIZES_MM.small
        };
      }
      const size = PDF_ANSWER_SPACE_MODES.includes(source.size) ? source.size : defaults.size;
      const customCandidate = Number(source.customMm);
      const customMm = Number.isFinite(customCandidate)
        ? Math.max(10, Math.min(260, customCandidate))
        : defaults.customMm;
      return { size, customMm };
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
      const type = QUESTION_TYPES[overrides.type] ? overrides.type : 'short-answer';
      return {
        id: createId('question'),
        kind: 'question',
        prompt: 'Untitled question',
        helpText: '',
        type,
        required: true,
        options: [createOption('Option 1'), createOption('Option 2')],
        pdfAnswerSpace: defaultPdfAnswerSpace(type),
        collapsed: true,
        ...overrides,
        type,
        pdfAnswerSpace: normalizePdfAnswerSpace(overrides.pdfAnswerSpace, type)
      };
    }

    function createPhase(overrides = {}) {
      const appearance = normalizePhaseAppearance(overrides.appearance);
      return {
        id: createId('phase'),
        kind: 'phase',
        title: 'New phase',
        description: 'Introduce the next group of questions here.',
        triggers: [],
        collapsed: true,
        ...overrides,
        appearance
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

    function createDefaultState() {
      return {
        id: createId('form'),
        version: FORM_DOCUMENT_VERSION,
        meta: {
          title: 'Student Check-in',
          audience: 'Current students',
          description: 'Your answers help me adapt our next lessons and materials.',
          respondentDetails: defaultIdentityState()
        },
        settings: {
          submissionPolicy: {
            mode: SUBMISSION_MODES.SINGLE
          }
        },
        blocks: [
          createGreeting(),
          createQuestion({
            prompt: 'How are you feeling about the course so far?',
            helpText: 'Choose the option that best reflects your current experience.',
            type: 'multiple-choice',
            options: [
              createOption('I feel confident'),
              createOption('I am making progress'),
              createOption('I need more support')
            ]
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
      };
    }

    function normalizeSubmissionSettings(input) {
      const source = input && typeof input === 'object' ? input : {};
      const submissionPolicy = source.submissionPolicy && typeof source.submissionPolicy === 'object'
        ? source.submissionPolicy
        : {};
      return {
        submissionPolicy: {
          mode: submissionPolicy.mode === SUBMISSION_MODES.MULTIPLE
            ? SUBMISSION_MODES.MULTIPLE
            : SUBMISSION_MODES.SINGLE
        }
      };
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
        if (defaults[field].required || defaults[field].verify) defaults[field].enabled = true;
        if (!defaults[field].enabled) {
          defaults[field].required = false;
          defaults[field].verify = false;
        }
      });
      if (defaults.city.required) {
        defaults.state.required = true;
        defaults.country.required = true;
      }
      if (defaults.state.required) defaults.country.required = true;
      if (defaults.city.enabled) {
        defaults.state.enabled = true;
        defaults.country.enabled = true;
      }
      if (defaults.state.enabled) defaults.country.enabled = true;
      return defaults;
    }

    function updateIdentityFieldConfig(input, field, key, checked) {
      const details = normalizeIdentity(input, false);
      if (!details[field] || !['enabled', 'required', 'verify'].includes(key)) return details;
      details[field][key] = Boolean(checked);

      if (key === 'enabled' && !checked) {
        details[field].required = false;
        details[field].verify = false;
        if (field === 'country') {
          details.state = { enabled: false, required: false, verify: false };
          details.city = { enabled: false, required: false, verify: false };
        }
        if (field === 'state') details.city = { enabled: false, required: false, verify: false };
      }

      if (key === 'required' && !checked) {
        if (field === 'country') {
          details.state.required = false;
          details.city.required = false;
        }
        if (field === 'state') details.city.required = false;
      }

      if ((key === 'required' || key === 'verify') && checked) details[field].enabled = true;
      return normalizeIdentity(details, false);
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

    function normalizeState(input) {
      const state = input && typeof input === 'object' ? input : createDefaultState();
      state.id = String(state.id || '').trim() || createId('form');
      state.version = FORM_DOCUMENT_VERSION;
      state.settings = normalizeSubmissionSettings(state.settings);
      if (!state.meta || typeof state.meta !== 'object') state.meta = createDefaultState().meta;
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
            pdfAnswerSpace: normalizePdfAnswerSpace(block.pdfAnswerSpace, type),
            collapsed: Boolean(block.collapsed),
            required: block.required !== false
          });
        })
        .filter(Boolean);

      const greeting = state.blocks.find((block) => block.kind === 'greeting');
      const goodbye = state.blocks.find((block) => block.kind === 'goodbye');
      const middle = state.blocks.filter((block) => block.kind !== 'greeting' && block.kind !== 'goodbye');
      state.blocks = [...(greeting ? [greeting] : []), ...middle, ...(goodbye ? [goodbye] : [])];
      pruneInvalidTriggers(state);
      return state;
    }

    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function cloneFormDefinition(input) {
      if (!input || typeof input !== 'object' || !Array.isArray(input.blocks)) {
        throw new TypeError('A Kelp form definition must contain a blocks array.');
      }

      const source = normalizeState(cloneJson(input));
      const blockIdMap = new Map();
      const optionIdMap = new Map();

      source.blocks.forEach((block) => {
        blockIdMap.set(block.id, createId(block.kind));
        if (block.kind !== 'question') return;
        block.options.forEach((option) => optionIdMap.set(option.id, createId('option')));
      });

      const blocks = source.blocks.map((block) => {
        const copy = cloneJson(block);
        copy.id = blockIdMap.get(block.id);

        if (block.kind === 'question') {
          copy.options = block.options.map((option) => ({
            ...cloneJson(option),
            id: optionIdMap.get(option.id)
          }));
        }

        if (block.kind === 'phase') {
          copy.triggers = block.triggers.map((trigger) => ({
            ...cloneJson(trigger),
            id: createId('trigger'),
            sourcePhaseId: blockIdMap.get(trigger.sourcePhaseId) || '',
            questionId: blockIdMap.get(trigger.questionId) || '',
            matcher: {
              ...cloneJson(trigger.matcher),
              optionId: optionIdMap.get(trigger.matcher.optionId) || trigger.matcher.optionId,
              optionIds: trigger.matcher.optionIds.map((optionId) => optionIdMap.get(optionId) || optionId)
            }
          }));
        }

        return copy;
      });

      return normalizeState({
        id: createId('form'),
        version: FORM_DOCUMENT_VERSION,
        meta: cloneJson(source.meta),
        settings: cloneJson(source.settings),
        blocks
      });
    }

    function getPhaseIndex(state, phaseId) {
      return state.blocks.findIndex((block) => block.kind === 'phase' && block.id === phaseId);
    }

    function getQuestionsForPhase(state, phaseId) {
      const start = getPhaseIndex(state, phaseId);
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
      if (question.type === 'true-false') {
        return [
          { id: 'true', label: 'True' },
          { id: 'false', label: 'False' }
        ];
      }
      return question.options || [];
    }

    function isValidTriggerForTarget(state, trigger, targetPhase) {
      if (!targetPhase || targetPhase.kind !== 'phase' || !trigger?.sourcePhaseId) return false;
      const sourceIndex = getPhaseIndex(state, trigger.sourcePhaseId);
      const targetIndex = getPhaseIndex(state, targetPhase.id);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= targetIndex) return false;
      if (trigger.kind === 'phase-complete') return true;
      if (trigger.kind !== 'answer' || !trigger.questionId) return false;
      const question = getQuestionsForPhase(state, trigger.sourcePhaseId).find((item) => item.id === trigger.questionId);
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

    function pruneInvalidTriggers(state) {
      let removed = 0;
      state.blocks.forEach((block) => {
        if (block.kind !== 'phase') return;
        const original = block.triggers || [];
        const next = original.filter((trigger) => isValidTriggerForTarget(state, trigger, block));
        removed += original.length - next.length;
        block.triggers = next;
      });
      return removed;
    }

    function buildContentPages(state) {
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
            order: block.__order ?? blockOrder,
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
              order: block.__order ?? blockOrder,
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

    function getEnabledIdentityFieldKeys(state) {
      const config = state?.meta?.respondentDetails || {};
      return Object.keys(IDENTITY_FIELDS).filter((key) => config[key]?.enabled);
    }

    function buildPageRespondentSteps(page) {
      if (!page) return [{ id: 'unavailable', kind: 'unavailable', page: null }];
      const steps = [];
      if (page.type === 'phase') {
        steps.push({ id: `phase-intro:${page.id}`, kind: 'phase-intro', page });
      }
      page.questions.forEach((question, questionIndex) => {
        steps.push({
          id: `question:${question.id}`,
          kind: 'question',
          page,
          question,
          questionIndex,
          questionCount: page.questions.length
        });
      });
      if (!steps.length) steps.push({ id: `page-empty:${page.id}`, kind: 'page-empty', page });
      return steps;
    }

    function buildRespondentSteps(state) {
      const greeting = state.blocks.find((block) => block.kind === 'greeting') || null;
      const goodbye = state.blocks.find((block) => block.kind === 'goodbye') || null;
      const steps = [{ id: 'privacy', kind: 'privacy', page: null, block: greeting }];
      if (getEnabledIdentityFieldKeys(state).length) {
        steps.push({ id: 'respondent-details', kind: 'identity', page: null, block: null });
      }
      buildContentPages(state).forEach((page) => steps.push(...buildPageRespondentSteps(page)));
      steps.push({ id: 'goodbye', kind: 'goodbye', page: null, block: goodbye });
      return steps;
    }

    function stepsForRouteSnapshot(state, snapshot, snapshotIndex) {
      if (!snapshot) return [{ id: 'unavailable', kind: 'unavailable', page: null }];
      if (snapshot.pageId === 'privacy') {
        const greeting = state.blocks.find((block) => block.kind === 'greeting') || null;
        return [{ id: 'privacy', kind: 'privacy', page: null, block: greeting }];
      }

      const steps = [];
      if (snapshotIndex === 1 && getEnabledIdentityFieldKeys(state).length) {
        steps.push({ id: 'respondent-details', kind: 'identity', page: null, block: null });
      }
      if (snapshot.pageId === 'goodbye') {
        const goodbye = state.blocks.find((block) => block.kind === 'goodbye') || null;
        steps.push({ id: 'goodbye', kind: 'goodbye', page: null, block: goodbye });
        return steps;
      }
      return [...steps, ...buildPageRespondentSteps(pageById(state, snapshot.pageId))];
    }

    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.values(value).forEach(deepFreeze);
      return Object.freeze(value);
    }

    function hasSubmissionValue(value) {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && String(value).trim() !== '';
    }

    function normalizeSubmissionValue(question, value) {
      if (question.type === 'multiple-answer') {
        return (Array.isArray(value) ? value : [value]).map(String).sort();
      }
      if (question.type === 'number') {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : String(value);
      }
      return String(value);
    }

    function questionSnapshot(question) {
      const hasOptions = ['multiple-choice', 'multiple-answer', 'true-false'].includes(question.type);
      return {
        id: question.id,
        prompt: question.prompt,
        helpText: question.helpText,
        type: question.type,
        required: question.required,
        options: hasOptions
          ? getOptionSet(question).map((option) => ({ id: option.id, label: option.label }))
          : []
      };
    }

    function createSubmissionRecord(input, rawAnswers = {}, context = {}) {
      if (!input || typeof input !== 'object' || !Array.isArray(input.blocks)) {
        throw new TypeError('A Kelp form definition must contain a blocks array.');
      }

      const state = normalizeState(cloneJson(input));
      const answers = rawAnswers && typeof rawAnswers === 'object' ? rawAnswers : {};
      const contentPages = buildContentPages(state);
      const pageMap = new Map(contentPages.map((page) => [page.id, page]));
      const defaultRoute = ['privacy', ...contentPages.map((page) => page.id), 'goodbye'];
      const requestedRoute = Array.isArray(context.pageIds) ? context.pageIds : defaultRoute;
      const routePageIds = requestedRoute
        .map(String)
        .filter((pageId) => pageId === 'privacy' || pageId === 'goodbye' || pageMap.has(pageId));
      const snapshotPages = routePageIds
        .filter((pageId) => pageMap.has(pageId))
        .map((pageId) => {
          const page = pageMap.get(pageId);
          return {
            id: page.id,
            phaseId: page.phaseId,
            title: String(page.block.title || 'Questions'),
            description: String(page.block.description || ''),
            appearance: page.phaseId ? normalizePhaseAppearance(page.block.appearance) : null,
            questions: page.questions.map(questionSnapshot)
          };
        });

      const visibleQuestions = new Map();
      snapshotPages.forEach((page) => {
        page.questions.forEach((question) => visibleQuestions.set(question.id, question));
      });
      const responseAnswers = [...visibleQuestions.values()]
        .filter((question) => hasSubmissionValue(answers[question.id]))
        .map((question) => ({
          questionId: question.id,
          type: question.type,
          value: normalizeSubmissionValue(question, answers[question.id])
        }));

      const respondent = {};
      Object.keys(IDENTITY_FIELDS).forEach((field) => {
        if (!state.meta.respondentDetails[field]?.enabled) return;
        const value = answers[`identity-${field}`];
        if (hasSubmissionValue(value)) respondent[field] = String(value).trim();
      });

      const submittedDate = context.submittedAt ? new Date(context.submittedAt) : new Date();
      const submittedAt = Number.isNaN(submittedDate.getTime())
        ? new Date().toISOString()
        : submittedDate.toISOString();
      const requestedId = String(context.id || '').trim();

      return deepFreeze({
        id: requestedId || createId('submission'),
        version: SUBMISSION_DOCUMENT_VERSION,
        immutable: true,
        formId: state.id,
        submittedAt,
        snapshot: {
          form: {
            id: state.id,
            title: state.meta.title,
            audience: state.meta.audience,
            description: state.meta.description
          },
          respondentDetails: cloneJson(state.meta.respondentDetails),
          pages: snapshotPages
        },
        data: {
          respondent,
          answers: responseAnswers
        },
        metadata: {
          formSchemaVersion: state.version,
          submissionPolicy: state.settings.submissionPolicy.mode,
          route: {
            pageIds: routePageIds
          }
        }
      });
    }

    function pageById(state, pageId) {
      return buildContentPages(state).find((page) => page.id === pageId) || null;
    }

    function isNormalPage(page) {
      return !page.phaseId || !(page.block.triggers && page.block.triggers.length);
    }

    function firstPageId(state) {
      const page = buildContentPages(state).find(isNormalPage);
      return page ? page.id : 'goodbye';
    }

    function createInitialSnapshot() {
      return { pageId: 'privacy', queue: [], visited: [] };
    }

    function triggerMatches(state, trigger, sourcePhaseId, answers) {
      if (trigger.sourcePhaseId !== sourcePhaseId) return false;
      if (trigger.kind === 'phase-complete') return true;
      const question = getQuestionsForPhase(state, sourcePhaseId).find((item) => item.id === trigger.questionId);
      if (!question) return false;
      const value = answers[question.id];
      if (question.type === 'number') {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return false;
        const first = Number(trigger.matcher.value);
        const second = Number(trigger.matcher.secondValue);
        if (trigger.matcher.operator === '=') return numericValue === first;
        if (trigger.matcher.operator === '>') return numericValue > first;
        if (trigger.matcher.operator === '<') return numericValue < first;
        if (trigger.matcher.operator === '>=') return numericValue >= first;
        if (trigger.matcher.operator === '<=') return numericValue <= first;
        if (trigger.matcher.operator === 'between') return numericValue >= first && numericValue <= second;
        return false;
      }
      if (question.type === 'multiple-answer') {
        if (!Array.isArray(value)) return false;
        const actual = [...value].sort();
        const expected = [...(trigger.matcher.optionIds || [])].sort();
        return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
      }
      return value === trigger.matcher.optionId;
    }

    function conditionalTarget(state, answers, current, snapshot) {
      if (!current || !current.phaseId) return null;
      return buildContentPages(state)
        .filter((page) => (
          page.phaseId
          && page.order > current.order
          && !snapshot.visited.includes(page.id)
          && page.block.triggers
          && page.block.triggers.some((trigger) => triggerMatches(state, trigger, current.phaseId, answers))
        ))
        .sort((left, right) => left.order - right.order)[0] || null;
    }

    function nextSnapshot(state, answers, snapshot) {
      if (snapshot.pageId === 'privacy') {
        const next = firstPageId(state);
        return { pageId: next, queue: [], visited: next === 'goodbye' ? [] : [next] };
      }
      if (snapshot.pageId === 'goodbye') return null;
      const pages = buildContentPages(state);
      const current = pageById(state, snapshot.pageId);
      if (!current) return { pageId: 'goodbye', queue: [], visited: snapshot.visited };
      let queue = [...(snapshot.queue || [])].filter((id) => !snapshot.visited.includes(id));
      const target = conditionalTarget(state, answers, current, snapshot);
      if (target) {
        const skipped = pages
          .filter((page) => (
            page.order > current.order
            && page.order < target.order
            && isNormalPage(page)
            && !snapshot.visited.includes(page.id)
            && !queue.includes(page.id)
          ))
          .map((page) => page.id);
        queue = [...queue, ...skipped];
        return { pageId: target.id, queue, visited: [...snapshot.visited, target.id] };
      }
      if (queue.length) {
        const next = queue.shift();
        return { pageId: next, queue, visited: [...snapshot.visited, next] };
      }
      const nextNormal = pages.find((page) => (
        page.order > current.order
        && isNormalPage(page)
        && !snapshot.visited.includes(page.id)
      ));
      if (nextNormal) {
        return { pageId: nextNormal.id, queue, visited: [...snapshot.visited, nextNormal.id] };
      }
      return { pageId: 'goodbye', queue: [], visited: snapshot.visited };
    }

    function enumeratePrintableRoutes(state, options = {}) {
      const pages = buildContentPages(state);
      const pageMap = new Map(pages.map((page) => [page.id, page]));
      const requestedLimit = Number(options.maxRoutes);
      const maxRoutes = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(512, Math.round(requestedLimit)))
        : 128;
      const completed = [];
      const completedKeys = new Set();
      let truncated = false;

      function conditionalChoices(snapshot, current) {
        if (!current?.phaseId) return [null];
        const candidates = pages
          .filter((page) => (
            page.phaseId
            && page.order > current.order
            && !snapshot.visited.includes(page.id)
            && page.block.triggers?.some((trigger) => trigger.sourcePhaseId === current.phaseId)
          ))
          .sort((left, right) => left.order - right.order);
        if (!candidates.length) return [null];
        const guaranteedIndex = candidates.findIndex((page) => (
          page.block.triggers.some((trigger) => (
            trigger.sourcePhaseId === current.phaseId && trigger.kind === 'phase-complete'
          ))
        ));
        const reachable = guaranteedIndex >= 0 ? candidates.slice(0, guaranteedIndex + 1) : candidates;
        const choices = reachable.map((page) => page.id);
        if (guaranteedIndex < 0) choices.push(null);
        return choices;
      }

      function advance(snapshot, selectedTargetId) {
        if (snapshot.pageId === 'privacy') {
          const next = firstPageId(state);
          return { pageId: next, queue: [], visited: next === 'goodbye' ? [] : [next] };
        }
        if (snapshot.pageId === 'goodbye') return null;
        const current = pageMap.get(snapshot.pageId);
        if (!current) return { pageId: 'goodbye', queue: [], visited: snapshot.visited };
        let queue = [...(snapshot.queue || [])].filter((id) => !snapshot.visited.includes(id));
        const target = selectedTargetId ? pageMap.get(selectedTargetId) : null;
        if (target) {
          const skipped = pages
            .filter((page) => (
              page.order > current.order
              && page.order < target.order
              && isNormalPage(page)
              && !snapshot.visited.includes(page.id)
              && !queue.includes(page.id)
            ))
            .map((page) => page.id);
          queue = [...queue, ...skipped];
          return { pageId: target.id, queue, visited: [...snapshot.visited, target.id] };
        }
        if (queue.length) {
          const next = queue.shift();
          return { pageId: next, queue, visited: [...snapshot.visited, next] };
        }
        const nextNormal = pages.find((page) => (
          page.order > current.order
          && isNormalPage(page)
          && !snapshot.visited.includes(page.id)
        ));
        if (nextNormal) {
          return { pageId: nextNormal.id, queue, visited: [...snapshot.visited, nextNormal.id] };
        }
        return { pageId: 'goodbye', queue: [], visited: snapshot.visited };
      }

      function recordRoute(pageIds) {
        const key = pageIds.join('>');
        if (completedKeys.has(key)) return;
        completedKeys.add(key);
        const contentPages = pageIds.map((pageId) => pageMap.get(pageId)).filter(Boolean);
        completed.push({
          pageIds,
          pageTitles: contentPages.map((page) => page.block.title || (page.type === 'questions' ? 'Initial questions' : 'Untitled phase')),
          questionIds: contentPages.flatMap((page) => page.questions.map((question) => question.id)),
          conditionalPageIds: contentPages.filter((page) => page.block.triggers?.length).map((page) => page.id)
        });
      }

      function visit(snapshot, pageIds, depth) {
        if (completed.length >= maxRoutes) {
          truncated = true;
          return;
        }
        if (!snapshot || depth > Math.max(20, pages.length * 3 + 6)) {
          truncated = true;
          return;
        }
        const nextPageIds = pageIds[pageIds.length - 1] === snapshot.pageId
          ? pageIds
          : [...pageIds, snapshot.pageId];
        if (snapshot.pageId === 'goodbye') {
          recordRoute(nextPageIds);
          return;
        }
        const current = pageMap.get(snapshot.pageId);
        conditionalChoices(snapshot, current).forEach((selectedTargetId) => {
          if (completed.length >= maxRoutes) {
            truncated = true;
            return;
          }
          const next = advance(snapshot, selectedTargetId);
          if (next) visit(next, nextPageIds, depth + 1);
        });
      }

      visit(createInitialSnapshot(), [], 0);
      completed.sort((left, right) => (
        left.questionIds.length - right.questionIds.length
        || left.conditionalPageIds.length - right.conditionalPageIds.length
        || left.pageIds.join('>').localeCompare(right.pageIds.join('>'))
      ));
      const hasConditionalRouting = pages.some((page) => page.block.triggers?.length);
      return {
        routes: completed.map((route, index) => ({
          ...route,
          id: `print-route-${index + 1}`,
          label: completed.length === 1
            ? (hasConditionalRouting ? 'Only reachable path' : 'Default path')
            : `Path ${index + 1}`
        })),
        truncated
      };
    }

    function questionsForPageId(state, pageId) {
      const page = pageById(state, pageId);
      return page ? page.questions : [];
    }

    function getMissingRequired(state, answers, page, includeIdentity) {
      const missing = [];
      const config = state.meta.respondentDetails || {};
      if (includeIdentity) {
        Object.keys(IDENTITY_FIELDS).forEach((key) => {
          if (config[key]?.enabled && config[key]?.required) {
            const value = answers[`identity-${key}`];
            if (!String(value || '').trim()) missing.push(IDENTITY_FIELDS[key].label);
          }
        });
      }
      page.questions.filter((question) => question.required).forEach((question) => {
        const value = answers[question.id];
        if (Array.isArray(value) ? !value.length : !String(value || '').trim()) {
          missing.push(question.prompt || 'this question');
        }
      });
      return missing;
    }

    function validateRespondentDetails(state, answers, includeIdentity) {
      if (!includeIdentity) return true;
      const config = state.meta.respondentDetails || {};
      for (const key of Object.keys(IDENTITY_FIELDS)) {
        if (!config[key]?.enabled) continue;
        const value = String(answers[`identity-${key}`] || '').trim();
        if (!value) continue;
        if (key === 'fullName' && value.split(/\s+/).filter(Boolean).length < 2) return 'Please enter a full name.';
        if (key === 'birthdate') {
          const date = new Date(`${value}T00:00:00`);
          if (Number.isNaN(date.getTime()) || date > new Date()) return 'Please enter a valid birthdate.';
        }
        if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value)) return 'Please enter a valid e-mail address.';
        if (key === 'phone' && value.replace(/\D/g, '').length < 8) return 'Please enter a plausible phone number.';
      }
      return true;
    }

    return Object.freeze({
      FORM_DOCUMENT_VERSION,
      SUBMISSION_DOCUMENT_VERSION,
      SUBMISSION_MODES,
      QUESTION_TYPES,
      PDF_ANSWER_SPACE_SIZES_MM,
      PDF_ANSWER_SPACE_MODES,
      IDENTITY_FIELDS,
      createId,
      createOption,
      defaultIdentityState,
      updateIdentityFieldConfig,
      defaultPhaseAppearance,
      normalizePhaseAppearance,
      phaseAppearanceVariables,
      isWrittenQuestionType,
      defaultPdfAnswerSpace,
      normalizePdfAnswerSpace,
      createGreeting,
      createQuestion,
      createPhase,
      createGoodbye,
      defaultTriggerDraft,
      createDefaultState,
      normalizeSubmissionSettings,
      normalizeState,
      cloneFormDefinition,
      getPhaseIndex,
      getQuestionsForPhase,
      getOptionSet,
      isValidTriggerForTarget,
      pruneInvalidTriggers,
      buildContentPages,
      getEnabledIdentityFieldKeys,
      buildPageRespondentSteps,
      buildRespondentSteps,
      stepsForRouteSnapshot,
      createSubmissionRecord,
      pageById,
      isNormalPage,
      firstPageId,
      createInitialSnapshot,
      triggerMatches,
      conditionalTarget,
      nextSnapshot,
      enumeratePrintableRoutes,
      questionsForPageId,
      getMissingRequired,
      validateRespondentDetails
    });
  }

  root.KelpFormDomainFactory = createKelpFormDomain;
  root.KelpFormDomain = createKelpFormDomain(root);
})(globalThis);
