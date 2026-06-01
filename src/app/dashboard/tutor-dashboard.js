import { requireAuth, signOutAndRedirect } from '../../auth/guard.js';
import {
  seedLocalData,
  getProfiles,
  getTutorEvents,
  saveTutorEvents,
  getRoster,
  saveRoster,
  getTemplates,
  hydrateTemplatesFromSupabase,
  formatDate,
} from '../../data/demoData.js';

seedLocalData();

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let currentStudentId = null;
let currentClassId = null;
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();

init();

async function init() {
  const current = await requireAuth(['teacher', 'tutor', 'mentor', 'admin']);
  if (!current) return;

  await hydrateTemplatesFromSupabase();

  const profiles = getProfiles();
  document.getElementById('tutor-heading').textContent = `${profiles.tutor.firstName || current.fullName.split(' ')[0]}'s workspace`;
  document.getElementById('tutor-profile-summary-card').innerHTML = `
    <h3>${profiles.tutor.firstName}</h3>
    <p>${profiles.tutor.academicExperience}</p>
    <p>${profiles.tutor.workExperience}</p>
  `;

  renderCalendar();
  renderStudentCards();
  bindCalendarNavigation();

  document.getElementById('logout-tutor')?.addEventListener('click', signOutAndRedirect);
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById(button.dataset.close)?.classList.add('hidden'));
  });
}

function bindCalendarNavigation() {
  document.getElementById('tutor-calendar-prev')?.addEventListener('click', () => shiftMonth(-1));
  document.getElementById('tutor-calendar-next')?.addEventListener('click', () => shiftMonth(1));
}

function shiftMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear -= 1;
  }
  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear += 1;
  }
  renderCalendar();
}

function renderCalendar() {
  const root = document.getElementById('tutor-calendar-grid');
  const label = document.getElementById('tutor-calendar-label');
  const summary = document.getElementById('tutor-calendar-summary');
  const year = calendarYear;
  const month = calendarMonth;
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const events = getTutorEvents();
  label.textContent = `${MONTH_NAMES[month]} ${year}`;

  const monthEvents = events.filter((event) => {
    const date = new Date(event.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  summary.textContent = monthEvents.length
    ? `${monthEvents.length} events in this month.`
    : 'No classes or meetings in this month yet. Once they are assigned, they show up here.';

  let html = DAY_NAMES.map((day) => `<div class="month-heading">${day}</div>`).join('');
  for (let i = 0; i < startOffset; i += 1) html += '<div class="month-day muted"></div>';

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayEvents = events.filter((event) => {
      const date = new Date(event.date);
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
    });

    html += `
      <article class="month-day ${dayEvents.length ? 'has-events' : ''}">
        <div class="month-day-number">${day}</div>
        <div class="month-event-list">
          ${dayEvents.length
            ? dayEvents.map((event) => `<button class="calendar-pill ${event.type}" data-calendar-event-id="${event.id}">${event.title}</button>`).join('')
            : '<div class="calendar-empty-note">No items</div>'}
        </div>
      </article>
    `;
  }

  root.innerHTML = html;
  root.querySelectorAll('[data-calendar-event-id]').forEach((button) => {
    button.addEventListener('click', () => openCalendarModal(button.dataset.calendarEventId));
  });
}

function openCalendarModal(eventId) {
  const events = getTutorEvents();
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  const content = document.getElementById('calendar-event-modal-content');
  const shell = document.getElementById('calendar-event-modal-shell');

  content.innerHTML = `
    <div class="modal-content-stack">
      <p class="page-kicker">${event.type === 'meeting' ? 'Company meeting' : 'Class event'}</p>
      <h2>${event.title}</h2>
      <p>${formatDate(event.date)}</p>
      <p>${event.notes || ''}</p>
      <div class="modal-action-grid">
        <button class="btn-primary" data-calendar-action="assign" data-id="${event.id}">Assign / grade</button>
        <button class="btn-secondary" data-calendar-action="reschedule" data-id="${event.id}">Reschedule +2 days</button>
        <button class="btn-outline" data-calendar-action="cancel" data-id="${event.id}">Cancel event</button>
      </div>
      <p class="mini-note" id="calendar-modal-feedback"></p>
    </div>
  `;
  shell.classList.remove('hidden');

  content.querySelectorAll('[data-calendar-action]').forEach((button) => {
    button.addEventListener('click', () => mutateCalendarEvent(button.dataset.id, button.dataset.calendarAction));
  });
}

function mutateCalendarEvent(eventId, action) {
  const feedback = document.getElementById('calendar-modal-feedback');
  const events = getTutorEvents();
  const event = events.find((item) => item.id === eventId);
  if (!event) return;

  if (action === 'reschedule') {
    const d = new Date(event.date);
    d.setDate(d.getDate() + 2);
    event.date = d.toISOString();
    feedback.textContent = 'Event moved forward by 2 days.';
  } else if (action === 'cancel') {
    event.title = `[Cancelled] ${event.title.replace(/^\[Cancelled\]\s*/, '')}`;
    feedback.textContent = 'Event marked as cancelled.';
  } else if (action === 'assign') {
    feedback.innerHTML = 'Use the student flow or open <a href="assignment-studio.html">assignment studio</a> to create, reuse, or grade.';
  }

  saveTutorEvents(events);
  renderCalendar();
}

function renderStudentCards() {
  const root = document.getElementById('student-card-grid');
  const roster = getRoster();
  root.innerHTML = roster.map((student) => `
    <button class="student-card" data-student-id="${student.id}" type="button">
      <strong>${student.name}</strong>
      <p>${student.subjects.join(' · ')}</p>
      <span>${student.classes.length} classes</span>
    </button>
  `).join('');

  root.querySelectorAll('[data-student-id]').forEach((button) => {
    button.addEventListener('click', () => openStudentModal(button.dataset.studentId));
  });
}

function openStudentModal(studentId) {
  currentStudentId = studentId;
  const roster = getRoster();
  const student = roster.find((item) => item.id === studentId);
  if (!student) return;
  const shell = document.getElementById('student-modal-shell');
  const content = document.getElementById('student-modal-content');

  content.innerHTML = `
    <div class="modal-content-stack">
      <p class="page-kicker">Student</p>
      <h2>${student.name}</h2>
      <p>${student.profileSummary}</p>
      <div class="profile-pairing-line">Subjects at Kelp: ${student.subjects.join(', ')}</div>
      <a href="student-profile.html" class="btn-outline modal-link-button">Open student profile</a>
      <div class="class-card-list">
        ${student.classes.map((course) => `
          <button class="class-card" data-class-id="${course.id}" type="button">
            <strong>${course.title}</strong>
            <p>${course.schedule}</p>
            <span>Due ${formatDate(course.dueDate)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  shell.classList.remove('hidden');

  content.querySelectorAll('[data-class-id]').forEach((button) => {
    button.addEventListener('click', () => openClassModal(button.dataset.classId));
  });
}

function openClassModal(classId) {
  currentClassId = classId;
  const roster = getRoster();
  const student = roster.find((item) => item.id === currentStudentId);
  const course = student?.classes.find((item) => item.id === classId);
  if (!student || !course) return;

  const content = document.getElementById('class-modal-content');
  const shell = document.getElementById('class-modal-shell');

  content.innerHTML = `
    <div class="modal-content-stack">
      <p class="page-kicker">Class workflow</p>
      <h2>${course.title}</h2>
      <p>${student.name} · ${course.schedule}</p>
      <div class="info-row-grid">
        <div class="info-tile"><strong>Current status</strong><span>${course.status}</span></div>
        <div class="info-tile"><strong>Due date</strong><span>${formatDate(course.dueDate)}</span></div>
      </div>
      <div class="subsection-label">Assignments</div>
      <div class="stack-list">
        ${course.assignments.map((assignment) => `
          <article class="stack-item with-column-gap">
            <div>
              <strong>${assignment.title}</strong>
              <p>${formatDate(assignment.dueDate)}</p>
            </div>
            <a class="text-link" href="assignment-view.html?template=${assignment.templateId}">Open</a>
          </article>
        `).join('')}
      </div>
      <div class="modal-action-grid">
        <button class="btn-primary" data-workflow-action="assign-new" type="button">Assign new task</button>
        <button class="btn-secondary" data-workflow-action="reuse" type="button">Reuse saved assignment</button>
        <button class="btn-secondary" data-workflow-action="grade" type="button">Grade exam</button>
        <button class="btn-outline" data-workflow-action="due-date" type="button">Change due date</button>
      </div>
    </div>
  `;

  shell.classList.remove('hidden');
  content.querySelectorAll('[data-workflow-action]').forEach((button) => {
    button.addEventListener('click', () => openWorkflowModal(button.dataset.workflowAction));
  });
}

function openWorkflowModal(action) {
  const roster = getRoster();
  const student = roster.find((item) => item.id === currentStudentId);
  const course = student?.classes.find((item) => item.id === currentClassId);
  if (!student || !course) return;

  const templates = getTemplates();
  const shell = document.getElementById('workflow-modal-shell');
  const content = document.getElementById('workflow-modal-content');

  let inner = '';
  if (action === 'assign-new') {
    inner = `
      <p class="page-kicker">Assign new task</p>
      <h2>Create in browser</h2>
      <p>Open the studio to build a brand-new homework, assessment, or midterm with LaTeX, uploaded figures, graphs, and timers.</p>
      <a href="assignment-studio.html" class="btn-primary modal-link-button">Open assignment studio</a>
      <label class="form-field"><span>Quick due date</span><input type="date" id="workflow-date-input" /></label>
      <button class="btn-secondary" data-save-due-date="1" type="button">Save due date for this class</button>
      <p class="mini-note" id="workflow-feedback"></p>
    `;
  } else if (action === 'reuse') {
    inner = `
      <p class="page-kicker">Reuse saved assignment</p>
      <h2>Template library</h2>
      <div class="template-picker-list">
        ${templates.map((template) => `
          <button class="template-pick" data-template-pick="${template.id}" type="button">
            <strong>${template.title}</strong>
            <span>${template.subject}</span>
          </button>
        `).join('')}
      </div>
      <p class="mini-note" id="workflow-feedback"></p>
    `;
  } else if (action === 'grade') {
    inner = `
      <p class="page-kicker">Grade exam</p>
      <h2>${course.title}</h2>
      <p>Jump to the current student-side form, then record qualitative feedback or scores in your backend later.</p>
      <a href="assignment-view.html?template=${course.assignments[0]?.templateId || ''}" class="btn-primary modal-link-button">Open current form</a>
      <p class="mini-note">This MVP build gives the grading entry point and modal flow. Persistent grading tables still need backend wiring.</p>
    `;
  } else if (action === 'due-date') {
    inner = `
      <p class="page-kicker">Change due date</p>
      <h2>${course.title}</h2>
      <label class="form-field"><span>New due date</span><input type="date" id="workflow-date-input" /></label>
      <div class="modal-action-grid">
        <button class="btn-primary" data-save-due-date="single" type="button">Apply to this student</button>
        <button class="btn-secondary" data-save-due-date="all" type="button">Apply to all students in class</button>
      </div>
      <p class="mini-note" id="workflow-feedback"></p>
    `;
  }

  content.innerHTML = `<div class="modal-content-stack">${inner}</div>`;
  shell.classList.remove('hidden');

  content.querySelectorAll('[data-template-pick]').forEach((button) => {
    button.addEventListener('click', () => attachTemplateToClass(button.dataset.templatePick));
  });
  content.querySelectorAll('[data-save-due-date]').forEach((button) => {
    button.addEventListener('click', () => saveDueDate(button.dataset.saveDueDate));
  });
}

function attachTemplateToClass(templateId) {
  const template = getTemplates().find((item) => item.id === templateId);
  if (!template) return;
  const roster = getRoster();
  const student = roster.find((item) => item.id === currentStudentId);
  const course = student?.classes.find((item) => item.id === currentClassId);
  if (!student || !course) return;

  course.assignments.unshift({
    title: template.title,
    dueDate: new Date().toISOString(),
    templateId: template.id,
  });
  saveRoster(roster);
  const feedback = document.getElementById('workflow-feedback');
  if (feedback) feedback.textContent = `${template.title} attached to ${student.name}.`;
  openClassModal(currentClassId);
}

function saveDueDate(scope) {
  const dateInput = document.getElementById('workflow-date-input');
  const feedback = document.getElementById('workflow-feedback');
  if (!dateInput?.value) {
    if (feedback) feedback.textContent = 'Choose a date first.';
    return;
  }
  const newDate = new Date(dateInput.value);
  const roster = getRoster();

  if (scope === 'all') {
    roster.forEach((student) => {
      student.classes.forEach((course) => {
        if (course.title === getCurrentCourseTitle()) course.dueDate = newDate.toISOString();
      });
    });
    if (feedback) feedback.textContent = 'Due date applied to every class with the same title.';
  } else {
    const student = roster.find((item) => item.id === currentStudentId);
    const course = student?.classes.find((item) => item.id === currentClassId);
    if (course) course.dueDate = newDate.toISOString();
    if (feedback) feedback.textContent = 'Due date updated for this class.';
  }

  saveRoster(roster);
  openClassModal(currentClassId);
}

function getCurrentCourseTitle() {
  const student = getRoster().find((item) => item.id === currentStudentId);
  const course = student?.classes.find((item) => item.id === currentClassId);
  return course?.title || '';
}
