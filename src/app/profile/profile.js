import { requireAuth } from '../../auth/guard.js';
import { seedLocalData, getProfiles, saveProfiles } from '../../data/demoData.js';

seedLocalData();
let editable = false;

init();

async function init() {
  const current = await requireAuth(['student', 'teacher', 'tutor', 'mentor', 'admin']);
  if (!current) return;

  const targetRole = document.body.dataset.profileRole;
  const canEdit = current.role === 'admin' || (targetRole === 'student' && current.role === 'student') || (targetRole === 'tutor' && ['teacher', 'tutor', 'mentor'].includes(current.role));
  editable = canEdit;

  const editToggle = document.getElementById('profile-edit-toggle');
  if (editToggle) editToggle.disabled = !canEdit;

  renderForm(targetRole, canEdit);
  editToggle?.addEventListener('click', () => {
    editable = !editable && canEdit ? true : false;
    renderForm(targetRole, canEdit);
  });
}

function renderForm(targetRole, canEdit) {
  const form = document.getElementById('profile-form');
  const message = document.getElementById('profile-message');
  const profiles = getProfiles();
  const profile = profiles[targetRole];
  const fields = targetRole === 'student'
    ? [
        ['firstName', 'First name'],
        ['subjects', 'Subjects at Kelp'],
        ['bio', 'Bio'],
      ]
    : [
        ['firstName', 'First name'],
        ['academicExperience', 'Academic experience'],
        ['workExperience', 'Work experience'],
        ['languages', 'Languages'],
        ['hobbies', 'Hobbies'],
        ['bio', 'Bio'],
        ['subjectCount', 'Number of subjects taught'],
        ['classCount', 'Classes taught at Kelp'],
      ];

  form.innerHTML = fields.map(([key, label]) => {
    const value = Array.isArray(profile[key]) ? profile[key].join(', ') : profile[key] ?? '';
    const multiline = key === 'bio' || key === 'workExperience';
    return `
      <label class="form-field ${multiline ? 'full-span' : ''}">
        <span>${label}</span>
        ${multiline
          ? `<textarea name="${key}" ${canEdit && editable ? '' : 'disabled'}>${escapeHtml(value)}</textarea>`
          : `<input name="${key}" type="text" value="${escapeHtml(value)}" ${canEdit && editable ? '' : 'disabled'} />`}
      </label>
    `;
  }).join('') + (canEdit ? `<button type="submit" class="btn-primary full-span" ${editable ? '' : 'disabled'}>Save profile</button>` : '');

  message.textContent = canEdit ? (editable ? 'Editing enabled for owner/admin.' : 'Read-only mode. Click edit to update.') : 'Read-only for linked users.';

  form.onsubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    fields.forEach(([key]) => {
      let value = formData.get(key);
      if (['subjects', 'languages', 'hobbies'].includes(key)) value = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
      profiles[targetRole][key] = value;
    });
    saveProfiles(profiles);
    message.textContent = 'Profile saved in this MVP build.';
    editable = false;
    renderForm(targetRole, canEdit);
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
