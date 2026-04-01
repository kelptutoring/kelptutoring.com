import { requireAuth, signOutAndRedirect } from '../../auth/guard.js';
import {
  seedLocalData,
  getProfiles,
  getImportantLinks,
  getStudentEvents,
  saveStudentEvents,
  formatDate,
} from '../../data/demoData.js';

seedLocalData();

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();

init();

async function init() {
  const current = await requireAuth(['student', 'admin']);
  if (!current) return;

  const profiles = getProfiles();
  document.getElementById('student-heading').textContent = `${profiles.student.firstName || current.fullName.split(' ')[0]}'s workspace`;

  renderImportantLinks();
  renderCalendar();
  renderSidePanels();
  bindCalendarNavigation();

  document.getElementById('logout-student')?.addEventListener('click', signOutAndRedirect);
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById(button.dataset.close)?.classList.add('hidden'));
  });
}

function bindCalendarNavigation() {
  document.getElementById('student-calendar-prev')?.addEventListener('click', () => shiftMonth(-1));
  document.getElementById('student-calendar-next')?.addEventListener('click', () => shiftMonth(1));
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

function renderImportantLinks() {
  const root = document.getElementById('important-links');
  const links = getImportantLinks();
  root.innerHTML = links.map((link) => `
    <a class="link-chip" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
  `).join('');
}

function renderSidePanels() {
  const profiles = getProfiles();
  document.getElementById('student-profile-summary').innerHTML = `
    <h3>${profiles.student.firstName}</h3>
    <p>${profiles.student.subjects.join(' · ')}</p>
    <p>${profiles.student.bio}</p>
  `;
  document.getElementById('tutor-profile-summary').innerHTML = `
    <h3>${profiles.tutor.firstName}</h3>
    <p>${profiles.tutor.academicExperience}</p>
    <p>${profiles.tutor.languages.join(' · ')}</p>
  `;

  const assignmentsRoot = document.getElementById('student-assignment-list');
  const events = getStudentEvents().filter((event) => event.type === 'assignment').sort((a, b) => new Date(a.date) - new Date(b.date));
  assignmentsRoot.innerHTML = events.length
    ? events.map((event) => `
      <article class="stack-item">
        <div>
          <strong>${event.title}</strong>
          <p>${formatDate(event.date)}</p>
        </div>
        <a class="text-link" href="assignment-view.html?template=${event.assignmentId}">Open</a>
      </article>
    `).join('')
    : '<div class="empty-panel-state">No upcoming assignments have been added yet.</div>';
}

function renderCalendar() {
  const root = document.getElementById('student-calendar-grid');
  const label = document.getElementById('student-calendar-label');
  const summary = document.getElementById('student-calendar-summary');
  const year = calendarYear;
  const month = calendarMonth;
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const events = getStudentEvents();
  label.textContent = `${MONTH_NAMES[month]} ${year}`;

  const monthEvents = events.filter((event) => {
    const date = new Date(event.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  summary.textContent = monthEvents.length
    ? `${monthEvents.length} scheduled items this month.`
    : 'No classes or due dates in this month yet. Once events exist, they appear here immediately.';

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
            ? dayEvents.map((event) => `<button class="calendar-pill ${event.type}" data-student-event-id="${event.id}">${event.title}</button>`).join('')
            : '<div class="calendar-empty-note">No items</div>'}
        </div>
      </article>
    `;
  }

  root.innerHTML = html;
  root.querySelectorAll('[data-student-event-id]').forEach((button) => {
    button.addEventListener('click', () => openEventModal(button.dataset.studentEventId));
  });
}

function openEventModal(eventId) {
  const events = getStudentEvents();
  const event = events.find((item) => item.id === eventId);
  if (!event) return;

  const shell = document.getElementById('student-event-modal-shell');
  const content = document.getElementById('student-event-modal-content');

  content.innerHTML = `
    <div class="modal-content-stack">
      <p class="page-kicker">${event.type === 'class' ? 'Class' : 'Due date'}</p>
      <h2>${event.title}</h2>
      <p>${formatDate(event.date)}</p>
      <p>${event.notes || ''}</p>
      <div class="modal-action-grid">
        ${event.type === 'class' ? `
          <button class="btn-primary" data-event-action="delivered" data-id="${event.id}">Mark delivered</button>
          <button class="btn-secondary" data-event-action="reschedule" data-id="${event.id}">Reschedule +2 days</button>
          <button class="btn-outline" data-event-action="cancel" data-id="${event.id}">Cancel class</button>
        ` : `
          <a class="btn-primary modal-link-button" href="assignment-view.html?template=${event.assignmentId}">Open assignment</a>
          <button class="btn-secondary" data-event-action="reschedule" data-id="${event.id}">Move due date +2 days</button>
          <button class="btn-outline" data-event-action="cancel" data-id="${event.id}">Cancel due date</button>
        `}
      </div>
      <p class="mini-note" id="student-event-feedback"></p>
    </div>
  `;

  shell.classList.remove('hidden');

  content.querySelectorAll('[data-event-action]').forEach((button) => {
    button.addEventListener('click', () => mutateEvent(button.dataset.id, button.dataset.eventAction));
  });
}

function mutateEvent(eventId, action) {
  const feedback = document.getElementById('student-event-feedback');
  const events = getStudentEvents();
  const event = events.find((item) => item.id === eventId);
  if (!event) return;

  if (action === 'reschedule') {
    const d = new Date(event.date);
    d.setDate(d.getDate() + 2);
    event.date = d.toISOString();
    feedback.textContent = 'Date moved forward by 2 days for this MVP build.';
  } else if (action === 'cancel') {
    event.title = `[Cancelled] ${event.title.replace(/^\[Cancelled\]\s*/, '')}`;
    feedback.textContent = 'Event marked as cancelled.';
  } else if (action === 'delivered') {
    event.title = `[Delivered] ${event.title.replace(/^\[Delivered\]\s*/, '')}`;
    feedback.textContent = 'Class marked as delivered.';
  }

  saveStudentEvents(events);
  renderCalendar();
  renderSidePanels();
}
