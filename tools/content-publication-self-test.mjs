import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');
const [migration, formAdapterSource, examAdapterSource, examContractSource] = await Promise.all([
  read('supabase/migrations/202607180004_content_publication.sql'),
  read('src/app/form-builder/form-adapters.js'),
  read('src/app/exam-builder/exam-adapters.js'),
  read('src/app/exam-builder/exam-contract.js')
]);

for (const capability of ['exam.publish', 'exam.review', 'form.publish', 'form.review']) {
  assert.match(migration, new RegExp(capability.replace('.', '\\.')));
}
assert.match(migration, /create table if not exists public\.content_publication_events/i);
assert.match(migration, /publication_mode[\s\S]+review_approved[\s\S]+privileged_direct/i);
assert.match(migration, /create table if not exists public\.form_reviews/i);
assert.match(migration, /create or replace function public\.save_form_draft/i);
assert.match(migration, /create or replace function public\.submit_form_for_review/i);
assert.match(migration, /create or replace function public\.review_form/i);
assert.match(migration, /create or replace function public\.publish_form/i);
assert.match(migration, /create or replace function public\.publish_exam/i);
assert.match(migration, /A submitted form must be reviewed by a different mentor or administrator/i);
assert.match(migration, /A submitted exam must be reviewed by a different mentor or administrator/i);
assert.match(migration, /Forms with submissions cannot be overwritten/i);
assert.match(migration, /revoke all on public\.form_definitions from anon, authenticated/i);
assert.match(migration, /grant select, delete on public\.form_definitions to authenticated/i);
assert.match(migration, /grant update \(status\) on public\.form_definitions to authenticated/i);
assert.equal((migration.match(/as \$\$/gi) || []).length, (migration.match(/\$\$;/g) || []).length, 'Every SQL function body must close its dollar quote.');

const storageValues = new Map();
const localStorage = {
  getItem(key) { return storageValues.get(key) || null; },
  setItem(key, value) { storageValues.set(key, String(value)); }
};
const context = { console, structuredClone, localStorage, crypto: globalThis.crypto };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(formAdapterSource, context);
vm.runInContext(examContractSource, context);
vm.runInContext(examAdapterSource, context);

const formAdapters = context.KelpFormAdapters.createLocalAdapters();
const formDefinition = {
  id: 'publication-form-review',
  version: 3,
  meta: { title: 'Review form', respondentDetails: {} },
  settings: { submissionPolicy: { mode: 'multiple' } },
  blocks: [{ id: 'q-1', kind: 'question', type: 'short-answer', prompt: 'How are you?', required: true, options: [] }]
};
await formAdapters.forms.save(formDefinition);
await formAdapters.forms.submitForReview(formDefinition.id);
await assert.rejects(formAdapters.forms.save(formDefinition), /under review or already published/i);
const formReview = await formAdapters.reviews.decide(formDefinition.id, { decision: 'approved', reviewerId: 'mentor-1' });
assert.equal(formReview.form.visibility, 'public');
assert.equal(formReview.form.publicationMode, 'review_approved');
assert.equal(formReview.form.publishedBy, 'mentor-1');

const directForm = structuredClone(formDefinition);
directForm.id = 'publication-form-direct';
await formAdapters.forms.save(directForm);
const directFormRecord = await formAdapters.forms.publish(directForm.id, { publisherId: 'mentor-2', notes: 'Mentor-owned form.' });
assert.equal(directFormRecord.visibility, 'public');
assert.equal(directFormRecord.publicationMode, 'privileged_direct');
await assert.rejects(formAdapters.forms.archive(directForm.id), /private draft/i);

const ExamContract = context.KelpExamContract;
const examAdapters = context.KelpExamAdapters.createLocalAdapters();
const unclassifiedExam = ExamContract.buildDefinition({
  id: 'publication-exam-unclassified',
  title: 'Unclassified exam',
  questions: [{ id: 'exam-q-1', prompt: 'Explain.', type: 'short-answer', difficulty: 'unclassified' }]
});
await examAdapters.exams.save(ExamContract.buildPersistenceBundle(unclassifiedExam));
await assert.rejects(examAdapters.exams.publish(unclassifiedExam.id), /classif/i);

const classifiedExam = ExamContract.buildDefinition({
  id: 'publication-exam-direct',
  title: 'Classified exam',
  questions: [{ id: 'exam-q-2', prompt: 'Explain.', type: 'short-answer', difficulty: 'easy', classificationStatus: 'proposed' }]
});
await examAdapters.exams.save(ExamContract.buildPersistenceBundle(classifiedExam));
const directExamRecord = await examAdapters.exams.publish(classifiedExam.id, { publisherId: 'mentor-3' });
assert.equal(directExamRecord.reviewStatus, 'approved');
assert.equal(directExamRecord.visibility, 'public');
assert.equal(directExamRecord.publicationMode, 'privileged_direct');
assert.equal(directExamRecord.definition.questions[0].classificationStatus, 'reviewed');
await assert.rejects(examAdapters.exams.save(ExamContract.buildPersistenceBundle(classifiedExam)), /under review or already/i);

console.log('Content publication policy, immutable lifecycle, and local adapter self-test passed.');
