import { requireAuth } from '../../auth/guard.js';
import { seedLocalData, getTemplates, hydrateTemplatesFromSupabase } from '../../data/demoData.js';
import { plotExpression, typesetMath, createCountdown } from '../../utils/assignmentTools.js';

seedLocalData();
let stopTimer = null;

init();

async function init() {
  const current = await requireAuth(['student', 'teacher', 'tutor', 'mentor', 'admin']);
  if (!current) return;

  await hydrateTemplatesFromSupabase();

  const params = new URLSearchParams(window.location.search);
  const templateId = params.get('template') || getTemplates()[0]?.id;
  const template = getTemplates().find((item) => item.id === templateId) || getTemplates()[0];
  if (!template) return;

  document.getElementById('assignment-view-title').textContent = template.title;
  document.getElementById('assignment-view-subtitle').textContent = `${template.subject}${template.timerMinutes ? ` · ${template.timerMinutes} minute timer` : ''}`;

  renderAssignment(template);
  if (stopTimer) stopTimer();
  stopTimer = createCountdown(document.getElementById('assignment-countdown'), template.timerMinutes);
  document.getElementById('mock-submit')?.addEventListener('click', () => {
    document.getElementById('submit-message').textContent = 'Submission captured in the UI flow. Persistent attempts still need backend tables.';
  });
}

async function renderAssignment(template) {
  const root = document.getElementById('assignment-render-root');
  root.innerHTML = template.questions.map((question, index) => `
    <article class="assignment-question-card">
      <div class="assignment-question-head">
        <strong>Question ${index + 1}</strong>
        <span class="question-type-pill">${question.type}</span>
      </div>
      <div class="math-copy">${question.prompt}</div>
      ${renderInput(question, index)}
      ${question.graphExpression ? `<canvas width="520" height="220" data-assignment-graph="${question.id}" class="graph-preview-canvas wide"></canvas>` : ''}
      ${question.imageData ? `<img class="assignment-image" src="${question.imageData}" alt="Question figure" />` : ''}
    </article>
  `).join('');

  template.questions.forEach((question) => {
    if (question.graphExpression) plotExpression(root.querySelector(`[data-assignment-graph="${question.id}"]`), question.graphExpression);
  });
  await typesetMath(root);
}

function renderInput(question, index) {
  if (question.type === 'multiple-choice' || question.type === 'true-false') {
    return `<div class="answer-block">${question.options.map((option) => `
      <label class="option-row"><input type="radio" name="q-${index}" /> <span>${option}</span></label>
    `).join('')}</div>`;
  }
  if (question.type === 'checkbox') {
    return `<div class="answer-block">${question.options.map((option) => `
      <label class="option-row"><input type="checkbox" /> <span>${option}</span></label>
    `).join('')}</div>`;
  }
  if (question.type === 'numeric') {
    return '<div class="answer-block"><input type="number" class="answer-input" placeholder="Enter a numeric answer" /></div>';
  }
  if (question.type === 'file-upload') {
    return '<div class="answer-block"><input type="file" class="answer-input" /></div>';
  }
  return '<div class="answer-block"><input type="text" class="answer-input" placeholder="Write your answer" /></div>';
}
