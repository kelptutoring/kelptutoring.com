import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');
const [html, javascript, adaptersSource, mentorHtml, adminHtml] = await Promise.all([
  read('src/app/form-builder/form-review.html'),
  read('src/app/form-builder/form-review.js'),
  read('src/app/form-builder/form-adapters.js'),
  read('src/app/dashboard/mentor-dashboard.html'),
  read('src/app/dashboard/admin-dashboard.html')
]);

assert.match(html, /Mentor and administrator tools/);
for (const filter of ['pending_review', 'approved', 'changes_requested', 'rejected']) {
  assert.match(html, new RegExp(`data-review-filter="${filter}"`));
}
assert.match(javascript, /requireCapability\(\['form\.review'\]\)/);
assert.match(javascript, /provider !== 'supabase'/);
assert.match(javascript, /readOnlyContent: true/);
assert.match(javascript, /state\.adapters\.reviews\.decide/);
assert.match(javascript, /Stable question ID/);
assert.match(javascript, /Phases, questions, and routing/);
assert.match(javascript, /function escapeHTML/);
assert.match(mentorHtml, /href="\.\.\/form-builder\/form-review\.html"[^>]+data-requires-capability="form\.review"/);
assert.match(adminHtml, /href="\.\.\/form-builder\/form-review\.html"[^>]+data-requires-capability="form\.review"/);

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  setAttribute() {}
  querySelectorAll() { return []; }
  focus() { this.focused = true; }
}

const ids = ['reviewProvider', 'refreshReviewsBtn', 'reviewMessage', 'reviewQueueCount', 'reviewQueue', 'reviewDetail', 'reviewDecisionNotes'];
const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
const filters = ['pending_review', 'approved', 'changes_requested', 'rejected'].map((status) => {
  const element = new FakeElement(`filter-${status}`);
  element.dataset.reviewFilter = status;
  return element;
});
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  },
  querySelectorAll(selector) { return selector === '[data-review-filter]' ? filters : []; }
};
const storage = new Map();
const localStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, String(value)); }
};
const context = {
  console,
  structuredClone,
  document,
  localStorage,
  location: { protocol: 'file:' },
  confirm() { return true; }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(adaptersSource, context);

const definition = {
  id: 'form-review-test',
  version: 3,
  meta: {
    title: 'Review <script> form',
    audience: 'Current students',
    description: 'Inspect conditional flow.',
    respondentDetails: { email: { enabled: true, required: true, verify: true } }
  },
  settings: { submissionPolicy: { mode: 'single' } },
  blocks: [
    { id: 'opening', kind: 'greeting', title: 'Welcome', body: 'Begin.', buttonText: 'Next' },
    { id: 'phase-first', kind: 'phase', title: 'First phase', description: 'Start here.', triggers: [] },
    { id: 'question-first', kind: 'question', type: 'multiple-choice', prompt: 'Choose <unsafe>.', required: true, options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
    { id: 'phase-second', kind: 'phase', title: 'Conditional phase', description: 'Shown after Yes.', triggers: [{ id: 'trigger-yes', sourcePhaseId: 'phase-first', kind: 'answer', questionId: 'question-first', matcher: { type: 'equals-option', optionId: 'yes' } }] },
    { id: 'question-second', kind: 'question', type: 'long-answer', prompt: 'Explain.', required: false, options: [] },
    { id: 'closing', kind: 'goodbye', title: 'Done', body: 'Thanks.', buttonText: 'Submit' }
  ]
};
const seedAdapters = context.KelpFormAdapters.createLocalAdapters();
await seedAdapters.forms.save(definition);
await seedAdapters.forms.submitForReview(definition.id);
context.KelpFormProviderReady = Promise.resolve(null);
vm.runInContext(javascript, context);

const settle = async () => {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve));
};
await settle();
assert.equal(elements.get('reviewProvider').textContent, 'Local review sandbox');
assert.equal(elements.get('reviewQueueCount').textContent, '1');
assert.match(elements.get('reviewQueue').innerHTML, /Review &lt;script&gt; form/);
assert.doesNotMatch(elements.get('reviewQueue').innerHTML, /<script>/);

elements.get('reviewQueue').dispatch('click', {
  target: {
    closest(selector) {
      return selector === '[data-review-form-id]' ? { dataset: { reviewFormId: definition.id } } : null;
    }
  }
});
await settle();
assert.match(elements.get('reviewDetail').innerHTML, /Record a review decision/);
assert.match(elements.get('reviewDetail').innerHTML, /Conditional phase/);
assert.match(elements.get('reviewDetail').innerHTML, /when “Choose &lt;unsafe&gt;\.” equals “Yes”/);
assert.match(elements.get('reviewDetail').innerHTML, /Stable question ID/);

elements.get('reviewDetail').dispatch('click', {
  target: { closest(selector) { return selector === '[data-review-decision]' ? { dataset: { reviewDecision: 'rejected' } } : null; } }
});
assert.match(elements.get('reviewMessage').textContent, /Add review notes/);
elements.get('reviewDecisionNotes').value = 'The form is clear and safe.';
elements.get('reviewDetail').dispatch('click', {
  target: { closest(selector) { return selector === '[data-review-decision]' ? { dataset: { reviewDecision: 'approved' } } : null; } }
});
await settle();
const approved = await seedAdapters.reviews.list({ reviewStatus: 'approved' });
assert.equal(approved.length, 1);
assert.equal(approved[0].visibility, 'public');
assert.equal(approved[0].publicationMode, 'review_approved');
assert.equal((await seedAdapters.reviews.history({ formId: definition.id })).length, 1);

console.log('Form review page access, friendly rendering, decision, and audit-history self-test passed.');
