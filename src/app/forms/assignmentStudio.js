const TEMPLATE_KEY = 'kelp_assignment_templates';
const QUESTION_TYPES = ['multiple-choice', 'checkbox', 'true-false', 'numeric', 'file-upload'];

let questions = [];
let editingTemplateId = null;
let signOutHandler = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

function bootstrap() {
  bindToolbar();
  renderLibrary();
  startBlankAssignment();
  updateStorageStatus('Studio ready in browser mode. Templates are saved in this browser for now.', 'neutral');
  setupOptionalAuth();
}

async function setupOptionalAuth() {
  const logoutButton = document.getElementById('logout-studio');
  if (!logoutButton) return;

  logoutButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (typeof signOutHandler === 'function') {
      signOutHandler();
      return;
    }
    window.location.href = 'src/app/login/login.html';
  });

  try {
    const authModule = await import('../../auth/guard.js');
    signOutHandler = authModule.signOutAndRedirect;
    const currentUser = await authModule.requireAuth(['teacher', 'tutor', 'mentor', 'admin']);
    if (!currentUser) return;
    updateStorageStatus('Studio ready. Browser save is active; cloud sync will be added in the next pass.', 'neutral');
  } catch (error) {
    updateStorageStatus('Studio ready in browser mode. Sign-in checks are temporarily bypassed if cloud auth is unavailable.', 'warning');
  }
}

function bindToolbar() {
  document.getElementById('new-assignment')?.addEventListener('click', startBlankAssignment);
  document.getElementById('add-question')?.addEventListener('click', () => {
    addQuestionCard();
    updateStorageStatus('Blank question added. Fill the body and preview it below.', 'neutral');
  });
  document.getElementById('save-template')?.addEventListener('click', saveTemplate);
  document.getElementById('preview-assignment')?.addEventListener('click', renderPreview);

  ['assignment-title', 'assignment-subject', 'assignment-timer'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderPreview);
  });
}

function createQuestionState(seed = {}) {
  const type = seed.type || 'multiple-choice';
  const options = Array.isArray(seed.options) ? seed.options.join('\n') : (seed.options || '');
  const answer = Array.isArray(seed.answer) ? seed.answer.join(', ') : (seed.answer || '');

  return {
    id: seed.id || `q-${Math.random().toString(36).slice(2, 10)}`,
    prompt: seed.prompt || '',
    type,
    optionsText: type === 'true-false' && !options ? 'True\nFalse' : options,
    answer,
    graphExpression: seed.graphExpression || '',
    imageData: seed.imageData || '',
    showGraph: Boolean(seed.graphExpression),
  };
}

function startBlankAssignment() {
  editingTemplateId = null;
  setValue('assignment-title', '');
  setValue('assignment-subject', '');
  setValue('assignment-timer', '');
  questions = [createQuestionState()];
  renderQuestionList();
  renderPreview();
}

function addQuestionCard(seed = {}) {
  questions.push(createQuestionState(seed));
  renderQuestionList();
  renderPreview();
}

function renderQuestionList() {
  const root = document.getElementById('question-list');
  if (!root) return;

  root.innerHTML = questions.map((question, index) => {
    const disableOptions = question.type === 'numeric' || question.type === 'file-upload';
    const graphHiddenClass = question.showGraph ? '' : 'hidden';

    return `
      <article class="builder-question-card" data-question-id="${question.id}">
        <div class="builder-question-top">
          <strong>Question ${index + 1}</strong>
          <button type="button" class="text-link danger-link" data-remove-question="${question.id}">Remove</button>
        </div>

        <div class="question-form-grid">
          <label class="form-field question-span-full">
            <span>4) Text / question body (LaTeX supported)</span>
            <textarea data-field="prompt" rows="7" placeholder="Example: Solve $x^2 - 5x + 6 = 0$. Show all valid roots.">${escapeHtml(question.prompt)}</textarea>
          </label>

          <div class="question-live-preview-block question-span-full">
            <div class="field-label-inline">Live body preview</div>
            <div class="question-live-preview" data-body-preview="${question.id}">${question.prompt ? question.prompt : '<span class="empty-panel-state">Write the question body here. LaTeX typed with $...$ or $$...$$ will appear in this preview.</span>'}</div>
          </div>

          <label class="form-field">
            <span>5) Type of answer</span>
            <select data-field="type">
              ${QUESTION_TYPES.map((type) => `<option value="${type}" ${question.type === type ? 'selected' : ''}>${labelizeType(type)}</option>`).join('')}
            </select>
          </label>

          <label class="form-field">
            <span>6) Right answer</span>
            <input data-field="answer" type="text" value="${escapeHtml(question.answer)}" placeholder="Example: True, 5, A, or A, C" />
          </label>

          <label class="form-field question-span-full ${disableOptions ? 'field-disabled' : ''}">
            <span>Options / alternatives (one per line)</span>
            <textarea data-field="optionsText" rows="5" ${disableOptions ? 'disabled' : ''} placeholder="A&#10;B&#10;C&#10;D">${escapeHtml(question.optionsText)}</textarea>
          </label>
        </div>

        <div class="builder-asset-toolbar">
          <label class="compact-file-btn">7) Insert image<input data-image-input="${question.id}" type="file" accept="image/*" /></label>
          <button type="button" class="btn-outline compact-btn" data-toggle-graph="${question.id}">${question.showGraph ? 'Hide graph' : '8) Insert graph'}</button>
        </div>

        <div class="builder-split-row ${graphHiddenClass}" data-graph-shell="${question.id}">
          <label class="form-field">
            <span>Graph function</span>
            <input data-field="graphExpression" type="text" placeholder="Examples: x^2 - 4, sin(x), 2*x + 1" value="${escapeHtml(question.graphExpression)}" />
          </label>
          <div class="graph-inline-block">
            <span class="field-label-inline">Live graph preview</span>
            <canvas width="280" height="180" data-graph-preview="${question.id}" class="graph-preview-canvas"></canvas>
          </div>
        </div>

        <div class="builder-inline-preview single-column-preview">
          ${question.imageData ? `<img src="${question.imageData}" alt="Uploaded figure" class="upload-preview-thumb" />` : '<div class="upload-placeholder">No uploaded figure for this question yet.</div>'}
        </div>
      </article>
    `;
  }).join('');

  attachQuestionEvents(root);
  updateInlineQuestionPreviews(root);
}

function attachQuestionEvents(root) {
  root.querySelectorAll('[data-remove-question]').forEach((button) => {
    button.addEventListener('click', () => {
      if (questions.length === 1) {
        updateStorageStatus('At least one question is required.', 'warning');
        return;
      }
      questions = questions.filter((question) => question.id !== button.dataset.removeQuestion);
      renderQuestionList();
      renderPreview();
    });
  });

  root.querySelectorAll('[data-toggle-graph]').forEach((button) => {
    button.addEventListener('click', () => {
      const question = questions.find((item) => item.id === button.dataset.toggleGraph);
      if (!question) return;
      question.showGraph = !question.showGraph;
      if (!question.showGraph) question.graphExpression = '';
      renderQuestionList();
      renderPreview();
    });
  });

  root.querySelectorAll('[data-question-id]').forEach((card) => {
    const question = questions.find((item) => item.id === card.dataset.questionId);
    if (!question) return;

    card.querySelectorAll('[data-field]').forEach((input) => {
      const syncField = (event) => {
        const field = event.target.dataset.field;
        question[field] = event.target.value;

        if (field === 'type') {
          handleTypeChange(question);
          renderQuestionList();
          renderPreview();
          return;
        }

        if (field === 'graphExpression') {
          plotExpression(card.querySelector(`[data-graph-preview="${question.id}"]`), question.graphExpression);
        }

        renderInlineQuestionPreview(card, question);
        renderPreview();
      };

      input.addEventListener('input', syncField);
      input.addEventListener('change', syncField);
    });

    const fileInput = card.querySelector(`[data-image-input="${question.id}"]`);
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          question.imageData = String(reader.result || '');
          renderQuestionList();
          renderPreview();
        };
        reader.readAsDataURL(file);
      });
    }
  });
}

function updateInlineQuestionPreviews(root) {
  root.querySelectorAll('[data-question-id]').forEach((card) => {
    const question = questions.find((item) => item.id === card.dataset.questionId);
    if (!question) return;
    renderInlineQuestionPreview(card, question);
  });
}

function renderInlineQuestionPreview(card, question) {
  const bodyPreview = card.querySelector(`[data-body-preview="${question.id}"]`);
  if (bodyPreview) {
    bodyPreview.innerHTML = question.prompt
      ? question.prompt
      : '<span class="empty-panel-state">Write the question body here. LaTeX typed with $...$ or $$...$$ will appear in this preview.</span>';
    typesetMath(bodyPreview);
  }

  if (question.showGraph) {
    plotExpression(card.querySelector(`[data-graph-preview="${question.id}"]`), question.graphExpression);
  }
}

function handleTypeChange(question) {
  if (question.type === 'true-false') {
    question.optionsText = 'True\nFalse';
    if (!question.answer) question.answer = 'True';
    return;
  }

  if (question.type === 'numeric' || question.type === 'file-upload') {
    question.optionsText = '';
  }
}

function collectTemplateState() {
  return {
    id: editingTemplateId || nextTemplateId(),
    title: getValue('assignment-title').trim() || 'Untitled assignment',
    subject: getValue('assignment-subject').trim() || 'General',
    timerMinutes: Number(getValue('assignment-timer') || 0),
    questions: questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.optionsText.split('\n').map((item) => item.trim()).filter(Boolean),
      answer: question.type === 'checkbox'
        ? question.answer.split(',').map((item) => item.trim()).filter(Boolean)
        : question.answer,
      graphExpression: question.showGraph ? question.graphExpression : '',
      imageData: question.imageData,
    })),
  };
}

function saveTemplate() {
  const template = collectTemplateState();
  const templates = getTemplates();
  const index = templates.findIndex((item) => item.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.unshift(template);
  }
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  editingTemplateId = template.id;
  renderLibrary();
  renderPreview();
  updateStorageStatus(`Saved "${template.title}" in this browser. Supabase wiring comes next.`, 'success');
}

function renderLibrary() {
  const root = document.getElementById('template-library-list');
  if (!root) return;

  const templates = getTemplates();
  root.innerHTML = templates.length
    ? templates.map((template) => `
        <button class="template-library-item" data-library-id="${template.id}" type="button">
          <strong>${escapeHtml(template.title)}</strong>
          <span>${escapeHtml(template.subject)}</span>
          <small>${template.questions.length} questions</small>
        </button>
      `).join('')
    : '<div class="empty-panel-state">No saved templates yet.</div>';

  root.querySelectorAll('[data-library-id]').forEach((button) => {
    button.addEventListener('click', () => loadTemplate(button.dataset.libraryId));
  });
}

function loadTemplate(templateId) {
  const template = getTemplates().find((item) => item.id === templateId);
  if (!template) return;

  editingTemplateId = template.id;
  setValue('assignment-title', template.title || '');
  setValue('assignment-subject', template.subject || '');
  setValue('assignment-timer', template.timerMinutes || '');
  questions = (template.questions || []).map((question) => createQuestionState(question));
  if (!questions.length) questions = [createQuestionState()];

  renderQuestionList();
  renderPreview();
  updateStorageStatus(`Loaded "${template.title}" from the template library.`, 'neutral');
}

async function renderPreview() {
  const root = document.getElementById('assignment-preview');
  if (!root) return;

  const template = collectTemplateState();
  root.innerHTML = `
    <article class="preview-sheet">
      <h3>${escapeHtml(template.title)}</h3>
      <p>${escapeHtml(template.subject)}${template.timerMinutes ? ` · ${template.timerMinutes} min` : ''}</p>
      <div class="preview-question-stack">
        ${template.questions.map((question, index) => `
          <section class="preview-question">
            <div class="builder-question-top">
              <strong>Question ${index + 1}</strong>
              <span class="question-type-pill">${escapeHtml(labelizeType(question.type))}</span>
            </div>
            <div class="math-copy">${question.prompt || 'Question body goes here.'}</div>
            ${question.options?.length ? `<ul>${question.options.map((option) => `<li>${escapeHtml(option)}</li>`).join('')}</ul>` : ''}
            ${question.graphExpression ? `<canvas width="280" height="180" data-preview-graph="${question.id}" class="graph-preview-canvas"></canvas>` : ''}
            ${question.imageData ? `<img class="upload-preview-thumb" src="${question.imageData}" alt="Question figure" />` : ''}
          </section>
        `).join('')}
      </div>
    </article>
  `;

  template.questions.forEach((question) => {
    if (question.graphExpression) {
      plotExpression(root.querySelector(`[data-preview-graph="${question.id}"]`), question.graphExpression);
    }
  });

  await typesetMath(root);
}

function getTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function nextTemplateId() {
  return `template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function updateStorageStatus(message, tone = 'neutral') {
  const node = document.getElementById('storage-status');
  if (!node) return;
  node.textContent = message;
  node.className = `storage-status ${tone}`;
}

function labelizeType(type) {
  switch (type) {
    case 'multiple-choice':
      return 'Multiple choice';
    case 'true-false':
      return 'True / false';
    case 'file-upload':
      return 'File upload';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function normalizeExpression(expression) {
  if (!expression) return '';
  return expression
    .replace(/\s+/g, '')
    .replace(/\^/g, '**')
    .replace(/(?<![A-Za-z])pi(?![A-Za-z])/gi, 'Math.PI')
    .replace(/(?<![A-Za-z])e(?![A-Za-z])/g, 'Math.E')
    .replace(/sin\(/gi, 'Math.sin(')
    .replace(/cos\(/gi, 'Math.cos(')
    .replace(/tan\(/gi, 'Math.tan(')
    .replace(/sqrt\(/gi, 'Math.sqrt(')
    .replace(/abs\(/gi, 'Math.abs(')
    .replace(/log\(/gi, 'Math.log(')
    .replace(/exp\(/gi, 'Math.exp(');
}

function evaluateExpression(expression, x) {
  const safe = normalizeExpression(expression);
  if (!safe) return null;
  try {
    const fn = new Function('x', `return ${safe};`);
    const y = fn(x);
    return Number.isFinite(y) ? y : null;
  } catch (error) {
    return null;
  }
}

function plotExpression(canvas, expression) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = 20;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d7e0db';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += scale) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += scale) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#8fa39a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();

  if (!expression) return;

  ctx.strokeStyle = '#00ACC1';
  ctx.lineWidth = 2.4;
  let started = false;

  for (let px = 0; px <= width; px += 1) {
    const x = (px - centerX) / scale;
    const yValue = evaluateExpression(expression, x);
    if (yValue === null) {
      started = false;
      continue;
    }
    const py = centerY - yValue * scale;
    if (!started) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
}

async function typesetMath(container) {
  if (!container || !window.MathJax?.typesetPromise) return;
  try {
    await window.MathJax.typesetPromise([container]);
  } catch (error) {
    // Ignore MathJax errors so the builder keeps working.
  }
}

function getValue(id) {
  return document.getElementById(id)?.value || '';
}

function setValue(id, value) {
  const node = document.getElementById(id);
  if (node) node.value = value;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
