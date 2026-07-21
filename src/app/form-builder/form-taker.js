(() => {
  'use strict';

  const HANDOFF_SCHEMA = 'kelp-form-taker-handoff-v1';
  const HANDOFF_STORAGE_KEY = 'kelp:form-taker:v1:active';
  const MESSAGE_READY = 'kelp:form-taker:ready';
  const MESSAGE_LOAD = 'kelp:form-taker:load';
  const MESSAGE_LOADED = 'kelp:form-taker:loaded';
  const HANDOFF_TIMEOUT_MS = 5000;

  const formDomain = window.KelpFormDomain;
  if (!formDomain) {
    throw new Error('Kelp Form Domain must load before the Form Taker.');
  }
  const formAdapterDomain = window.KelpFormAdapters;
  if (!formAdapterDomain) {
    throw new Error('Kelp Form Adapters must load before the Form Taker.');
  }

  const localFormAdapters = formAdapterDomain.createLocalAdapters();
  const expectsBackendProvider = /^https?:$/.test(window.location.protocol);
  let formAdapterResolutionError = null;
  const formAdaptersReady = Promise.resolve(window.KelpFormProviderReady)
    .then(() => formAdapterDomain.resolveAdapters({
      localAdapters: localFormAdapters,
      context: {
        formDocumentVersion: formDomain.FORM_DOCUMENT_VERSION,
        surface: 'form-taker'
      }
    }))
    .then((adapters) => {
      if (expectsBackendProvider && adapters.meta?.provider === 'local') {
        throw new Error('The form submission provider did not initialize.');
      }
      return adapters;
    })
    .catch((error) => {
      if (!expectsBackendProvider) return localFormAdapters;
      formAdapterResolutionError = error;
      return null;
    });

  const app = document.getElementById('app');
  const answers = {};
  const identityInfo = formDomain.IDENTITY_FIELDS;
  let initialViewportPositioned = false;
  const locationData = window.KelpLocationData || null;
  let formState = null;
  let submitted = false;
  let submissionRecord = null;
  let submissionStatus = 'idle';
  let submissionError = '';
  let consent = false;
  let history = [];
  let historyIndex = 0;
  let stepIndex = 0;
  let routeDirty = false;
  let locationHydrationId = 0;
  let handoffTimer = 0;
  let openerWindow = window.opener || null;

  const esc = (value) => String(value ?? '').replace(/[&<>\"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[character]));

  const deep = (value) => JSON.parse(JSON.stringify(value));
  const optionList = (question) => formDomain.getOptionSet(question);

  function requestedSessionId() {
    try {
      return new URLSearchParams(window.location.search).get('session') || '';
    } catch (error) {
      return '';
    }
  }

  function isHandoffPayload(value) {
    return Boolean(
      value
      && value.schema === HANDOFF_SCHEMA
      && typeof value.sessionId === 'string'
      && value.form
      && Array.isArray(value.form.blocks)
    );
  }

  function payloadMatchesRequest(payload) {
    const sessionId = requestedSessionId();
    return isHandoffPayload(payload) && (!sessionId || payload.sessionId === sessionId);
  }

  function readStoredHandoff() {
    try {
      const stored = window.localStorage.getItem(HANDOFF_STORAGE_KEY);
      if (!stored) return null;
      const payload = JSON.parse(stored);
      return payloadMatchesRequest(payload) ? payload : null;
    } catch (error) {
      return null;
    }
  }

  function notifyOpener(type, sessionId = requestedSessionId()) {
    if (!openerWindow || typeof openerWindow.postMessage !== 'function') return;
    openerWindow.postMessage({ type, sessionId }, '*');
  }

  function releaseOpener() {
    openerWindow = null;
    try {
      window.opener = null;
    } catch (error) {
      // Some browsers expose a read-only opener. The local reference is still released.
    }
  }

  function loadForm(payload) {
    if (!payloadMatchesRequest(payload)) return false;
    formState = formDomain.normalizeState(deep(payload.form));
    document.title = `${formState.meta.title || 'Kelp Form'} | Kelp`;
    Object.keys(answers).forEach((key) => delete answers[key]);
    submitted = false;
    submissionRecord = null;
    submissionStatus = 'idle';
    submissionError = '';
    consent = false;
    history = [initialSnapshot()];
    historyIndex = 0;
    stepIndex = 0;
    routeDirty = false;
    window.clearTimeout(handoffTimer);
    render();
    notifyOpener(MESSAGE_LOADED, payload.sessionId);
    releaseOpener();
    return true;
  }

  function showUnavailable() {
    if (formState) return;
    applyPhaseTheme(null);
    app.innerHTML = `
      <section class="form-taker-unavailable">
        <h1>This form could not be opened</h1>
        <p>Return to the form builder and choose <strong>Open student view</strong> again.</p>
      </section>
    `;
  }

  function contentPages() {
    return formDomain.buildContentPages(formState);
  }

  function greeting() {
    return formState.blocks.find((block) => block.kind === 'greeting') || null;
  }

  function goodbye() {
    return formState.blocks.find((block) => block.kind === 'goodbye') || null;
  }

  function pageById(id) {
    return formDomain.pageById(formState, id);
  }

  function normalPage(page) {
    return formDomain.isNormalPage(page);
  }

  function initialSnapshot() {
    return formDomain.createInitialSnapshot();
  }

  function phaseVars(appearance) {
    return formDomain.phaseAppearanceVariables(appearance);
  }

  function applyPhaseTheme(step) {
    const phasePage = step?.page?.type === 'phase' ? step.page : null;
    document.body.classList.toggle('is-phase-page', Boolean(phasePage));
    if (phasePage) document.body.setAttribute('style', phaseVars(phasePage.block.appearance));
    else document.body.removeAttribute('style');
  }

  function enabledIdentityFields() {
    return formDomain.getEnabledIdentityFieldKeys(formState);
  }

  function contentSteps(page) {
    return formDomain.buildPageRespondentSteps(page);
  }

  function stepsForSnapshot(snapshot, snapshotIndex = historyIndex) {
    return formDomain.stepsForRouteSnapshot(formState, snapshot, snapshotIndex);
  }

  function currentSteps() {
    return stepsForSnapshot(history[historyIndex], historyIndex);
  }

  function currentStep() {
    const steps = currentSteps();
    stepIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
    return steps[stepIndex];
  }

  function projectedRouteSnapshots() {
    const snapshots = [initialSnapshot()];
    let current = snapshots[0];
    const limit = Math.max(20, formState.blocks.length * 2 + 10);
    for (let guard = 0; guard < limit; guard += 1) {
      const next = nextSnapshot(current);
      if (!next) return snapshots;
      snapshots.push(next);
      current = next;
    }
    return snapshots;
  }

  function projectedQuestionIds() {
    return projectedRouteSnapshots().flatMap((snapshot, snapshotIndex) => (
      stepsForSnapshot(snapshot, snapshotIndex)
        .filter((step) => step.kind === 'question' && step.question?.id)
        .map((step) => step.question.id)
    ));
  }

  function sameSnapshot(first, second) {
    return first
      && second
      && first.pageId === second.pageId
      && JSON.stringify(first.queue) === JSON.stringify(second.queue)
      && JSON.stringify(first.visited) === JSON.stringify(second.visited);
  }

  function nextSnapshot(snapshot) {
    return formDomain.nextSnapshot(formState, answers, snapshot);
  }

  function header() {
    return `
      <div class="meta">
        <h1>${esc(formState.meta.title || 'Untitled form')}</h1>
        ${formState.meta.audience ? `<p class="audience">${esc(formState.meta.audience)}</p>` : ''}
        ${formState.meta.description ? `<p class="description">${esc(formState.meta.description)}</p>` : ''}
      </div>
    `;
  }

  function hasQuestionResponse(questionId) {
    const value = answers[questionId];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  function questionProgressValues(step = currentStep()) {
    if (step?.kind !== 'question' || !step.page) return null;
    const questionIds = projectedQuestionIds();
    const total = Math.max(1, questionIds.length);
    const routeIndex = questionIds.indexOf(step.question.id);
    const answered = questionIds.filter(hasQuestionResponse).length;
    return {
      answered,
      total,
      number: routeIndex >= 0 ? routeIndex + 1 : 1,
      percentage: Math.min(100, (answered / total) * 100)
    };
  }

  function progress(step) {
    const values = questionProgressValues(step);
    if (!values) return '';
    return `
      <div class="form-progress-wrap" aria-label="Question progress">
        <div class="form-progress-meta">
          <span>Question ${values.number} of ${values.total}</span>
          <span data-progress-answered>${values.answered} answered</span>
        </div>
        <div class="form-progress-track" role="progressbar" aria-label="Answered questions" aria-valuemin="0" aria-valuemax="${values.total}" aria-valuenow="${values.answered}">
          <span class="form-progress-fill" data-progress-fill style="width:${values.percentage}%"></span>
        </div>
      </div>
    `;
  }

  function updateQuestionProgress() {
    const values = questionProgressValues();
    if (!values) return;
    const answered = app.querySelector('[data-progress-answered]');
    const track = app.querySelector('.form-progress-track');
    const fill = app.querySelector('[data-progress-fill]');
    if (answered) answered.textContent = `${values.answered} answered`;
    if (track) track.setAttribute('aria-valuenow', String(values.answered));
    if (fill) fill.style.width = `${values.percentage}%`;
  }

  function inputFor(question) {
    const name = `q-${question.id}`;
    if (question.type === 'short-answer') {
      return `<input type="text" data-question="${esc(question.id)}" placeholder="Your answer" value="${esc(answers[question.id] || '')}" />`;
    }
    if (question.type === 'long-answer') {
      return `<textarea data-question="${esc(question.id)}" placeholder="Write your answer">${esc(answers[question.id] || '')}</textarea>`;
    }
    if (question.type === 'number') {
      return `<input type="number" step="any" data-question="${esc(question.id)}" placeholder="Enter a number" value="${esc(answers[question.id] || '')}" />`;
    }

    const options = optionList(question);
    const inputType = question.type === 'multiple-answer' ? 'checkbox' : 'radio';
    return `<div class="choices">${options.map((option) => {
      const current = answers[question.id];
      const checked = inputType === 'checkbox'
        ? Array.isArray(current) && current.includes(option.id)
        : current === option.id;
      return `
        <label class="choice">
          <input type="${inputType}" name="${name}" data-question="${esc(question.id)}" value="${esc(option.id)}" ${checked ? 'checked' : ''} />
          <span>${esc(option.label || 'Untitled option')}</span>
        </label>
      `;
    }).join('')}</div>`;
  }

  function questionMarkup(question) {
    return `
      <section class="question">
        <label>${esc(question.prompt || 'Untitled question')}${question.required ? '<span class="required"> *</span>' : ''}</label>
        ${question.helpText ? `<p class="help">${esc(question.helpText)}</p>` : ''}
        ${inputFor(question)}
      </section>
    `;
  }

  function identity() {
    const config = formState.meta.respondentDetails || {};
    const fields = enabledIdentityFields();
    if (!fields.length) return '';
    const hasLocationFields = fields.some((key) => ['country', 'state', 'city'].includes(key));
    return `
      <section class="identity">
        <p class="step-eyebrow">About you</p>
        <h2>Respondent details</h2>
        <p class="page-copy">Please provide the information requested below before continuing to the questions.</p>
        ${fields.map((key) => {
          const info = identityInfo[key];
          const field = config[key];
          const answerId = `identity-${key}`;
          const isLocationField = ['country', 'state', 'city'].includes(key);
          const locationPrompt = {
            country: 'Loading countries…',
            state: answers['identity-country'] ? 'Loading states / provinces…' : 'Select a country first',
            city: answers['identity-state'] ? 'Loading cities…' : 'Select a state / province first'
          };
          return `
            <div class="identity-field">
              <label>${esc(info.label)}${field.required ? '<span class="required"> *</span>' : ''}</label>
              ${isLocationField
                ? `<select data-identity="${key}" data-location-level="${key}" autocomplete="${esc(info.autocomplete || 'off')}" aria-label="${esc(info.label)}" disabled><option value="">${locationPrompt[key]}</option></select>`
                : `<input type="${info.inputType}" data-identity="${key}" autocomplete="${esc(info.autocomplete || 'off')}" placeholder="${esc(info.placeholder)}" value="${esc(answers[answerId] || '')}" />`}
            </div>
          `;
        }).join('')}
        ${hasLocationFields ? `
          <p class="location-data-credit">
            Location data by <a href="${esc(locationData?.ATTRIBUTION?.url || 'https://github.com/dr5hn/countries-states-cities-database')}" target="_blank" rel="noopener noreferrer">${esc(locationData?.ATTRIBUTION?.label || 'Countries States Cities Database')}</a>
            · ${esc(locationData?.ATTRIBUTION?.license || 'ODbL 1.0')}
          </p>
        ` : ''}
      </section>
    `;
  }

  function locationPlaceholder(level) {
    if (level === 'country') return 'Select a country';
    if (level === 'state') return answers['identity-country'] ? 'Select a state / province' : 'Select a country first';
    return answers['identity-state'] ? 'Select a city' : 'Select a state / province first';
  }

  function populateLocationSelect(select, level, options, enabled) {
    const selectedValue = String(answers[`identity-${level}`] || '');
    select.innerHTML = [
      `<option value="">${esc(locationPlaceholder(level))}</option>`,
      ...options.map((option) => `<option value="${esc(option.label)}" data-location-code="${esc(option.code)}" ${option.label === selectedValue ? 'selected' : ''}>${esc(option.label)}</option>`)
    ].join('');
    select.disabled = !enabled;
  }

  function resolveLocationCode(level, options) {
    const savedCode = String(answers[`identity-${level}Code`] || '');
    const savedLabel = String(answers[`identity-${level}`] || '');
    const match = options.find((option) => option.code === savedCode || option.label === savedLabel);
    if (!match) return '';
    answers[`identity-${level}Code`] = match.code;
    return match.code;
  }

  function enableManualLocationFallback(message) {
    app.querySelectorAll('[data-location-level]').forEach((select) => {
      const level = select.dataset.locationLevel;
      const info = identityInfo[level];
      if (!info) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.identity = level;
      input.autocomplete = info.autocomplete || 'off';
      input.placeholder = info.placeholder;
      input.value = String(answers[`identity-${level}`] || '');
      select.replaceWith(input);
    });
    const credit = app.querySelector('.location-data-credit');
    if (credit) credit.insertAdjacentHTML('beforebegin', `<p class="location-data-status" role="status">${esc(message)}</p>`);
  }

  async function hydrateLocationSelectors() {
    const hydrationId = ++locationHydrationId;
    const countrySelect = app.querySelector('[data-location-level="country"]');
    const stateSelect = app.querySelector('[data-location-level="state"]');
    const citySelect = app.querySelector('[data-location-level="city"]');
    if (!countrySelect && !stateSelect && !citySelect) return;
    if (!locationData) {
      enableManualLocationFallback('The location list is unavailable, so these fields accept manual entry.');
      return;
    }

    try {
      const countries = await locationData.getCountries();
      if (hydrationId !== locationHydrationId) return;
      if (countrySelect) populateLocationSelect(countrySelect, 'country', countries, true);
      const countryCode = resolveLocationCode('country', countries);

      let states = [];
      if (countryCode && (stateSelect || citySelect)) states = await locationData.getStates(countryCode);
      if (hydrationId !== locationHydrationId) return;
      if (stateSelect) populateLocationSelect(stateSelect, 'state', states, Boolean(countryCode));
      const stateCode = resolveLocationCode('state', states);

      let cities = [];
      if (countryCode && stateCode && citySelect) cities = await locationData.getCities(countryCode, stateCode);
      if (hydrationId !== locationHydrationId) return;
      if (citySelect) populateLocationSelect(citySelect, 'city', cities, Boolean(countryCode && stateCode));
    } catch (error) {
      if (hydrationId !== locationHydrationId) return;
      enableManualLocationFallback('The location list could not be loaded, so these fields accept manual entry.');
    }
  }

  function privacy() {
    const greetingBlock = greeting();
    return `
      <section class="welcome">
        <h2>${esc(greetingBlock?.title || 'Before we begin')}</h2>
        <p>${esc(greetingBlock?.body || 'Please read the information below before continuing.')}</p>
        <div class="terms">
          <strong>Privacy Notice and Data Use Terms</strong>
          <p>Kelp uses the information in this form to provide tutoring support, communicate about the learning plan, and improve the service. Responses should be accessed only by authorised people and kept only as long as needed for the stated purpose.</p>
          <label class="consent">
            <input type="checkbox" data-consent ${consent ? 'checked' : ''} />
            <span>I have read and agree with the Privacy Notice and Data Use Terms.</span>
          </label>
        </div>
        <button class="btn primary full" data-action="start" ${consent ? '' : 'disabled'}>${esc(greetingBlock?.buttonText || 'Start form')}</button>
      </section>
    `;
  }

  function submissionFailureMessage(error) {
    const message = String(error?.message || '').trim();
    if (/sign in|signed-in|authentication|session/i.test(message)) {
      return 'This response could not be saved because the form session is not signed in. Keep this page open and try again after reconnecting.';
    }
    if (/only one submission/i.test(message)) {
      return 'This form accepts only one response from each respondent, and a response has already been saved.';
    }
    return 'Your response could not be saved. Check your connection and try again; your answers are still on this page.';
  }

  async function completeSubmission() {
    if (submissionStatus === 'saving' || submissionStatus === 'saved') return;
    if (!submissionRecord) {
      submissionRecord = formDomain.createSubmissionRecord(formState, answers, {
        pageIds: history.map((snapshot) => snapshot.pageId)
      });
    }

    submissionStatus = 'saving';
    submissionError = '';
    render();

    try {
      const adapters = await formAdaptersReady;
      if (!adapters) {
        throw formAdapterResolutionError || new Error('The form submission provider is unavailable.');
      }
      const persistedRecord = await adapters.submissions.create(submissionRecord);
      if (persistedRecord) submissionRecord = deep(persistedRecord);
      submitted = true;
      submissionStatus = 'saved';
      if (typeof window.CustomEvent === 'function' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('kelp:form-submitted', { detail: submissionRecord }));
      }
    } catch (error) {
      submissionStatus = 'error';
      submissionError = submissionFailureMessage(error);
      console.error('The form response could not be persisted.', error);
    }
    render();
  }

  function restartSubmission() {
    Object.keys(answers).forEach((key) => delete answers[key]);
    submitted = false;
    submissionRecord = null;
    submissionStatus = 'idle';
    submissionError = '';
    consent = false;
    history = [initialSnapshot()];
    historyIndex = 0;
    stepIndex = 0;
    routeDirty = false;
    render();
  }

  function render() {
    if (!formState) return;
    applyPhaseTheme(null);
    if (!history.length) {
      history = [initialSnapshot()];
      historyIndex = 0;
      stepIndex = 0;
    }

    const snapshot = history[historyIndex];
    if (submitted) {
      const anotherResponse = formState.settings?.submissionPolicy?.mode === 'multiple'
        ? '<button class="btn primary" data-action="restart">Start another response</button>'
        : '';
      app.innerHTML = `
        <section class="submitted">
          <div>
            <h2>Submitted</h2>
            <p class="description">Your response is locked as an immutable submission snapshot.</p>
            <p class="notice">Reference: <span class="reference">${esc(submissionRecord?.id || 'Pending')}</span></p>
            <div class="actions">${anotherResponse}</div>
          </div>
        </section>
      `;
      return;
    }

    const step = currentStep();
    applyPhaseTheme(step);
    let content = header() + progress(step);
    if (step.kind === 'privacy') {
      app.innerHTML = content + privacy();
      return;
    }

    if (step.kind === 'identity') {
      content += `
        ${identity()}
        <p class="error" id="error"></p>
        <div class="actions">
          <button class="btn" data-action="prev">Previous</button>
          <button class="btn primary" data-action="next">Next</button>
        </div>
      `;
      app.innerHTML = content;
      hydrateLocationSelectors();
      return;
    }

    if (step.kind === 'goodbye') {
      const goodbyeBlock = goodbye();
      const isSaving = submissionStatus === 'saving';
      const submitLabel = isSaving
        ? 'Saving response...'
        : (submissionStatus === 'error' ? 'Try saving again' : (goodbyeBlock?.buttonText || 'Submit form'));
      content += `
        <section class="thanks" aria-busy="${isSaving ? 'true' : 'false'}">
          <h2>${esc(goodbyeBlock?.title || 'Thank you')}</h2>
          <p>${esc(goodbyeBlock?.body || 'Your answers are ready to be submitted.')}</p>
          <p class="error" id="error" role="alert">${esc(submissionError)}</p>
          <div class="actions">
            <button class="btn" data-action="prev" ${historyIndex === 0 || isSaving ? 'disabled' : ''}>Previous</button>
            <button class="btn primary" data-action="submit" ${isSaving ? 'disabled' : ''}>${esc(submitLabel)}</button>
          </div>
        </section>
      `;
      app.innerHTML = content;
      return;
    }

    const page = step.page;
    if (!page) {
      app.innerHTML = `${content}<section class="thanks"><h2>No available page</h2><p>Please return to the builder and review the phase rules.</p></section>`;
      return;
    }

    const conditional = page.phaseId && page.block.triggers && page.block.triggers.length;
    const themed = page.type === 'phase';
    const openTheme = themed ? '<section class="phase-theme">' : '';
    const closeTheme = themed ? '</section>' : '';

    if (step.kind === 'phase-intro') {
      content += `
        ${openTheme}
        <p class="step-eyebrow">Next section</p>
        ${conditional ? '<p class="route-note">This section was opened by a matching route condition.</p>' : ''}
        <div class="phase-title-row">
          <h2 class="page-title">${esc(page.block.title || 'Questions')}</h2>
          <p class="phase-question-count">${page.questions.length} ${page.questions.length === 1 ? 'question' : 'questions'} in this section</p>
        </div>
        ${page.block.description ? `<p class="page-copy">${esc(page.block.description)}</p>` : '<p class="page-copy">Continue when you are ready for the next section.</p>'}
        <div class="actions">
          <button class="btn" data-action="prev">Previous</button>
          <button class="btn primary" data-action="next">Next</button>
        </div>
        ${closeTheme}
      `;
      app.innerHTML = content;
      return;
    }

    if (step.kind === 'question') {
      const contextLabel = themed ? (page.block.title || 'Section') : (page.block.title || 'Questions');
      content += `
        ${openTheme}
        <p class="step-eyebrow">${esc(contextLabel)}</p>
        <div class="question-list">${questionMarkup(step.question)}</div>
        <p class="error" id="error"></p>
        <div class="actions">
          <button class="btn" data-action="prev">Previous</button>
          <button class="btn primary" data-action="next">Next</button>
        </div>
        ${closeTheme}
      `;
      app.innerHTML = content;
      return;
    }

    content += `
      ${openTheme}
      <h2 class="page-title">${esc(page.block.title || 'Questions')}</h2>
      <p class="page-copy">This section has no questions. Continue to the next part of the form.</p>
      <div class="actions">
        <button class="btn" data-action="prev">Previous</button>
        <button class="btn primary" data-action="next">Next</button>
      </div>
      ${closeTheme}
    `;
    app.innerHTML = content;
  }

  function setValidationError(message) {
    const error = document.getElementById('error');
    if (error) error.textContent = message;
  }

  function validateCurrent() {
    const step = currentStep();
    if (step.kind === 'privacy') return consent;

    if (step.kind === 'identity') {
      const identityResult = formDomain.validateRespondentDetails(formState, answers, true);
      if (identityResult !== true) {
        setValidationError(identityResult);
        return false;
      }
      const missingIdentity = formDomain.getMissingRequired(formState, answers, { questions: [] }, true);
      if (!missingIdentity.length) return true;
      setValidationError(`Please complete ${missingIdentity.length === 1 ? missingIdentity[0] : 'all required respondent details'} before continuing.`);
      return false;
    }

    if (step.kind !== 'question') return true;
    const missing = formDomain.getMissingRequired(formState, answers, { questions: [step.question] }, false);
    if (!missing.length) return true;
    setValidationError(`Please answer ${missing[0]} before continuing.`);
    return false;
  }

  function proposedValue(element) {
    if (element.dataset.identity) return element.value;
    const questionId = element.dataset.question;
    if (element.type === 'checkbox') {
      return [...document.querySelectorAll(`input[data-question="${CSS.escape(questionId)}"]:checked`)]
        .map((node) => node.value)
        .sort();
    }
    return element.value;
  }

  function keyFor(element) {
    return element.dataset.identity ? `identity-${element.dataset.identity}` : element.dataset.question;
  }

  function sameValue(first, second) {
    if (Array.isArray(first) || Array.isArray(second)) {
      return JSON.stringify(first || []) === JSON.stringify(second || []);
    }
    return String(first ?? '') === String(second ?? '');
  }

  function saveChange(element) {
    const key = keyFor(element);
    if (!key) return;
    const next = proposedValue(element);
    const previous = answers[key];
    if (sameValue(previous, next)) return;

    if (historyIndex < history.length - 1 && !routeDirty) {
      const proceed = window.confirm('Changing this answer may send you through a different path. If the pathway changes, answers given after this page will be removed. Do you want to continue?');
      if (!proceed) {
        render();
        return;
      }
      routeDirty = true;
    }
    answers[key] = next;
    updateQuestionProgress();
  }

  function saveLocationChange(element) {
    const level = element.dataset.locationLevel;
    if (!level) return;
    saveChange(element);
    const selectedOption = element.options?.[element.selectedIndex] || null;
    const code = String(selectedOption?.dataset?.locationCode || '');
    if (code) answers[`identity-${level}Code`] = code;
    else delete answers[`identity-${level}Code`];

    if (level === 'country') {
      delete answers['identity-state'];
      delete answers['identity-stateCode'];
      delete answers['identity-city'];
      delete answers['identity-cityCode'];
      render();
    } else if (level === 'state') {
      delete answers['identity-city'];
      delete answers['identity-cityCode'];
      render();
    }
  }

  function questionsForPageId(id) {
    return formDomain.questionsForPageId(formState, id);
  }

  function discardFutureAnswers() {
    const future = history.slice(historyIndex + 1);
    future.forEach((snapshot) => {
      questionsForPageId(snapshot.pageId).forEach((question) => delete answers[question.id]);
      const firstPage = contentPages()[0];
      if (snapshot.pageId === 'initial-questions' || pageById(snapshot.pageId)?.order === firstPage?.order) {
        Object.keys(identityInfo).forEach((key) => {
          delete answers[`identity-${key}`];
          delete answers[`identity-${key}Code`];
        });
      }
    });
  }

  function goNext() {
    if (!validateCurrent()) return;
    const steps = currentSteps();
    if (stepIndex < steps.length - 1) {
      stepIndex += 1;
      render();
      return;
    }

    if (!routeDirty && historyIndex < history.length - 1) {
      historyIndex += 1;
      stepIndex = 0;
      render();
      return;
    }

    const current = history[historyIndex];
    const next = nextSnapshot(current);
    if (!next) {
      submitted = true;
      render();
      return;
    }

    const known = history[historyIndex + 1];
    if (routeDirty && known && !sameSnapshot(next, known)) {
      discardFutureAnswers();
      history = history.slice(0, historyIndex + 1);
    }
    if (routeDirty && known && sameSnapshot(next, known)) {
      historyIndex += 1;
      stepIndex = 0;
      routeDirty = false;
      render();
      return;
    }

    history = history.slice(0, historyIndex + 1);
    history.push(deep(next));
    historyIndex += 1;
    stepIndex = 0;
    routeDirty = false;
    render();
  }

  function goPrevious() {
    if (stepIndex > 0) {
      stepIndex -= 1;
      render();
      return;
    }
    if (historyIndex === 0) return;
    historyIndex -= 1;
    stepIndex = Math.max(0, stepsForSnapshot(history[historyIndex], historyIndex).length - 1);
    routeDirty = false;
    render();
  }

  function handleHandoffMessage(event) {
    if (!openerWindow || event.source !== openerWindow) return;
    const payload = event.data;
    if (!payload || payload.type !== MESSAGE_LOAD || !payloadMatchesRequest(payload)) return;
    loadForm(payload);
  }

  app.addEventListener('input', (event) => {
    if (!event.target.matches('[data-question],[data-identity]')) return;
    if (event.target.matches('[data-location-level]')) return;
    if (event.target.type !== 'checkbox' && event.target.type !== 'radio') saveChange(event.target);
  });

  app.addEventListener('change', (event) => {
    if (event.target.matches('[data-location-level]')) {
      saveLocationChange(event.target);
      return;
    }
    if (event.target.matches('[data-question],[data-identity]')) saveChange(event.target);
    if (event.target.matches('[data-consent]')) {
      consent = event.target.checked;
      render();
    }
  });

  app.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'start') {
      if (consent) goNext();
      return;
    }
    if (action === 'prev') {
      goPrevious();
      return;
    }
    if (action === 'next') {
      goNext();
      return;
    }
    if (action === 'submit') {
      if (validateCurrent()) void completeSubmission();
      return;
    }
    if (action === 'restart') restartSubmission();
  });

  window.addEventListener('message', handleHandoffMessage);

  function bootstrap() {
    scheduleInitialViewportPosition();
    const storedPayload = readStoredHandoff();
    if (storedPayload && loadForm(storedPayload)) return;
    notifyOpener(MESSAGE_READY);
    handoffTimer = window.setTimeout(showUnavailable, HANDOFF_TIMEOUT_MS);
  }

  function scheduleInitialViewportPosition() {
    if (initialViewportPositioned) return;
    if (typeof document.querySelector !== 'function') return;
    initialViewportPositioned = true;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const main = document.querySelector('.form-taker-main');
        if (!main) return;
        const mainTop = window.scrollY + main.getBoundingClientRect().top;
        const header = document.querySelector('.form-taker-header');
        const headerBottom = header && getComputedStyle(header).display !== 'none'
          ? window.scrollY + header.getBoundingClientRect().bottom
          : 0;
        window.scrollTo({
          left: 0,
          top: Math.max(0, Math.ceil(mainTop), Math.ceil(headerBottom)),
          behavior: 'auto'
        });
      });
    });
  }

  bootstrap();
})();
