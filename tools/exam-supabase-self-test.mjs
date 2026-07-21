import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import {
  createSupabaseExamAdapters,
  EXAM_SUPABASE_RESOURCES
} from '../src/app/exam-builder/exam-supabase-adapters.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clone = (value) => JSON.parse(JSON.stringify(value));
const contractSource = await readFile(resolve(projectRoot, 'src/app/exam-builder/exam-contract.js'), 'utf8');
vm.runInThisContext(contractSource);
const ExamContract = globalThis.KelpExamContract;
const clock = {
  created: '2026-07-18T12:00:00.000Z',
  updated: '2026-07-18T12:30:00.000Z'
};

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.action = 'select';
    this.filters = [];
    this.payload = null;
    this.sorts = [];
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  order(column, options) {
    this.sorts.push([column, options]);
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = clone(payload);
    this.client.calls.push({ action: 'update', table: this.table, payload: clone(payload) });
    return this;
  }

  delete() {
    this.action = 'delete';
    this.client.calls.push({ action: 'delete', table: this.table });
    return this;
  }

  matches(row) {
    return this.filters.every(([column, value]) => row[column] === value);
  }

  async execute(mode = 'many') {
    const rows = this.client.tables[this.table];
    let selected = rows.filter((row) => this.matches(row));

    if (this.action === 'update') {
      selected.forEach((row) => Object.assign(row, clone(this.payload), {
        updated_at: clock.updated,
        archived_at: this.payload.status === 'archived' ? clock.updated : row.archived_at
      }));
      if (this.table === 'exam_definitions' && this.payload.status === 'archived') {
        const ids = new Set(selected.map((row) => row.id));
        this.client.tables.exam_question_records.forEach((row) => {
          if (ids.has(row.exam_id)) row.exam_status = 'archived';
        });
      }
    }

    if (this.action === 'delete') {
      const removed = [];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (!this.matches(rows[index])) continue;
        removed.unshift(rows[index]);
        rows.splice(index, 1);
      }
      selected = removed;
    }

    this.sorts.slice().reverse().forEach(([column, options]) => {
      selected.sort((left, right) => String(left[column]).localeCompare(String(right[column])));
      if (options?.ascending === false) selected.reverse();
    });

    const data = selected.map(clone);
    if (mode === 'single') {
      return data.length === 1
        ? { data: data[0], error: null }
        : { data: null, error: { message: 'Expected one row.', code: 'PGRST116' } };
    }
    if (mode === 'maybeSingle') {
      return data.length <= 1
        ? { data: data[0] || null, error: null }
        : { data: null, error: { message: 'Expected at most one row.', code: 'PGRST116' } };
    }
    return { data, error: null };
  }

  single() {
    return this.execute('single');
  }

  maybeSingle() {
    return this.execute('maybeSingle');
  }

  then(resolveResult, rejectResult) {
    return this.execute().then(resolveResult, rejectResult);
  }
}

function createFakeSupabase() {
  return {
    calls: [],
    tables: {
      exam_definitions: [],
      exam_question_records: [],
      exam_reviews: []
    },
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-tutor-1' } }, error: null };
      }
    },
    from(table) {
      assert.ok(this.tables[table], `Unexpected table: ${table}`);
      return new FakeQuery(this, table);
    },
    async rpc(name, args) {
      this.calls.push({ action: 'rpc', name, args: clone(args) });
      if (name === 'submit_exam_for_review') {
        const row = this.tables.exam_definitions.find((item) => item.id === args.p_exam_id);
        row.review_status = 'pending_review';
        row.visibility = 'private';
        row.bundle = ExamContract.applyReviewStateToBundle(row.bundle, {
          reviewStatus: 'pending_review',
          visibility: 'private'
        });
        this.tables.exam_question_records.forEach((question) => {
          if (question.exam_id !== row.id) return;
          question.review_status = 'pending_review';
          question.exam_review_status = 'pending_review';
        });
        return { data: clone(row), error: null };
      }
      if (name === 'review_exam') {
        const row = this.tables.exam_definitions.find((item) => item.id === args.p_exam_id);
        const visibility = args.p_decision === 'approved' ? 'public' : 'private';
        row.review_status = args.p_decision;
        row.visibility = visibility;
        row.publication_mode = args.p_decision === 'approved' ? 'review_approved' : 'private';
        row.published_by = args.p_decision === 'approved' ? 'user-mentor-1' : null;
        row.published_at = args.p_decision === 'approved' ? clock.updated : null;
        row.bundle = ExamContract.applyReviewStateToBundle(row.bundle, {
          reviewStatus: args.p_decision,
          visibility,
          reviewClassifications: args.p_decision === 'approved'
        });
        this.tables.exam_question_records.forEach((question) => {
          if (question.exam_id !== row.id) return;
          question.review_status = args.p_decision;
          question.exam_review_status = args.p_decision;
          question.exam_visibility = visibility;
          if (args.p_decision === 'approved') {
            question.classification_status = 'reviewed';
            question.content.classificationStatus = 'reviewed';
          }
        });
        const review = {
          id: 1,
          exam_id: row.id,
          owner_id: row.owner_id,
          reviewer_id: 'user-mentor-1',
          decision: args.p_decision,
          notes: args.p_notes,
          reviewed_at: clock.updated
        };
        this.tables.exam_reviews.push(review);
        return { data: { exam: clone(row), review: clone(review) }, error: null };
      }
      if (name === 'publish_exam') {
        const row = this.tables.exam_definitions.find((item) => item.id === args.p_exam_id);
        row.review_status = 'approved';
        row.visibility = 'public';
        row.publication_mode = 'privileged_direct';
        row.published_by = 'user-tutor-1';
        row.published_at = clock.updated;
        row.updated_at = clock.updated;
        row.bundle = ExamContract.applyReviewStateToBundle(row.bundle, {
          reviewStatus: 'approved',
          visibility: 'public',
          reviewClassifications: true
        });
        this.tables.exam_question_records.forEach((question) => {
          if (question.exam_id !== row.id) return;
          question.review_status = 'approved';
          question.exam_review_status = 'approved';
          question.exam_visibility = 'public';
          question.classification_status = 'reviewed';
          question.content.classificationStatus = 'reviewed';
        });
        return { data: clone(row), error: null };
      }
      assert.equal(name, 'save_exam_draft');
      const bundle = clone(args.p_bundle);
      bundle.workflow = { reviewStatus: 'draft', visibility: 'private' };
      bundle.exam.madeBy = 'user-tutor-1';
      bundle.exam.createdAt = clock.created;
      bundle.exam.updatedAt = clock.updated;
      bundle.questions = bundle.questions.map((question) => {
        const classificationStatus = question.difficulty === 'unclassified' ? 'unclassified' : 'proposed';
        return {
          ...question,
          createdBy: 'user-tutor-1',
          classificationStatus,
          reviewStatus: 'draft',
          content: {
            ...question.content,
            classificationStatus
          }
        };
      });
      let row = this.tables.exam_definitions.find((item) => item.id === bundle.exam.id);
      if (!row) {
        row = {
          id: bundle.exam.id,
          owner_id: 'user-tutor-1',
          status: 'active',
          review_status: 'draft',
          visibility: 'private',
          publication_mode: 'private',
          published_by: null,
          published_at: null,
          created_at: clock.created,
          updated_at: clock.updated,
          archived_at: null,
          bundle
        };
        this.tables.exam_definitions.push(row);
      } else {
        row.bundle = bundle;
        row.updated_at = clock.updated;
      }
      this.tables.exam_question_records = this.tables.exam_question_records
        .filter((question) => question.exam_id !== bundle.exam.id)
        .concat(bundle.questions.map((question) => ({
        id: question.id,
        exam_id: bundle.exam.id,
        owner_id: 'user-tutor-1',
        position: question.position,
        difficulty: question.difficulty,
        classification_status: question.classificationStatus,
        review_status: question.reviewStatus,
        copied_from_question_id: question.copiedFromQuestionId || null,
        content: clone(question.content),
        created_at: clock.created,
        updated_at: clock.updated,
        exam_status: row.status,
        exam_review_status: row.review_status,
        exam_visibility: row.visibility,
        exam_title: bundle.exam.title
        })));
      return { data: clone(row), error: null };
    }
  };
}

assert.deepEqual(EXAM_SUPABASE_RESOURCES, {
  examTable: 'exam_definitions',
  questionTable: 'exam_questions',
  questionView: 'exam_question_records',
  reviewTable: 'exam_reviews',
  saveDraftRpc: 'save_exam_draft',
  submitReviewRpc: 'submit_exam_for_review',
  decideReviewRpc: 'review_exam',
  publishExamRpc: 'publish_exam'
});

const definition = ExamContract.buildDefinition({
  id: 'exam-supabase-test',
  title: 'Supabase exam',
  madeBy: '__CLIENT_CLAIM__',
  createdAt: '2026-07-18T10:00:00.000Z',
  updatedAt: '2026-07-18T10:00:00.000Z',
  questions: [{
    id: 'question-supabase-test',
    prompt: 'What is 2 + 2?',
    type: 'multiple-choice',
    difficulty: 'easy',
    classificationStatus: 'reviewed',
    options: ['3', '4'],
    correctOptionIndex: 1
  }]
});
const bundle = ExamContract.buildPersistenceBundle(definition);
bundle.workflow = { reviewStatus: 'approved', visibility: 'public' };
bundle.questions[0].reviewStatus = 'approved';

const supabase = createFakeSupabase();
const adapters = createSupabaseExamAdapters({ supabase });
assert.equal(adapters.meta.provider, 'supabase');

const saved = await adapters.exams.save(bundle);
assert.equal(saved.status, 'active');
assert.equal(saved.reviewStatus, 'draft');
assert.equal(saved.visibility, 'private');
assert.equal(saved.definition.madeBy, 'user-tutor-1');
assert.equal(saved.definition.questions[0].classificationStatus, 'proposed');
assert.equal(supabase.calls[0].name, 'save_exam_draft');
assert.equal((await adapters.exams.list({ status: 'active', reviewStatus: 'draft' })).length, 1);
assert.equal((await adapters.exams.load(definition.id)).definition.title, definition.title);
await assert.rejects(adapters.exams.list({ status: 'deleted' }), /active or archived/);
await assert.rejects(adapters.exams.list({ reviewStatus: 'published' }), /Unsupported exam review status/);

const questions = await adapters.questions.list({ difficulty: 'easy', classificationStatus: 'proposed' });
assert.equal(questions.length, 1);
assert.equal(questions[0].id, definition.questions[0].id);
assert.equal(questions[0].examVisibility, 'private');
assert.equal((await adapters.questions.load(definition.questions[0].id)).examTitle, definition.title);
await assert.rejects(adapters.questions.list({ difficulty: 'impossible' }), /Unsupported question difficulty/);

const submitted = await adapters.exams.submitForReview(definition.id);
assert.equal(submitted.reviewStatus, 'pending_review');
assert.equal((await adapters.reviews.list()).length, 1);
const decided = await adapters.reviews.decide(definition.id, { decision: 'approved', notes: 'Ready.' });
assert.equal(decided.exam.reviewStatus, 'approved');
assert.equal(decided.exam.visibility, 'public');
assert.equal(decided.exam.definition.questions[0].classificationStatus, 'reviewed');
assert.equal(decided.review.reviewerId, 'user-mentor-1');
assert.equal((await adapters.reviews.history({ examId: definition.id })).length, 1);

const directDefinition = ExamContract.createIndependentCopy(definition);
const directSaved = await adapters.exams.save(ExamContract.buildPersistenceBundle(directDefinition));
const directlyPublished = await adapters.exams.publish(directSaved.id, { notes: 'Mentor-owned.' });
assert.equal(directlyPublished.reviewStatus, 'approved');
assert.equal(directlyPublished.visibility, 'public');
assert.equal(directlyPublished.publicationMode, 'privileged_direct');
assert.equal(directlyPublished.definition.questions[0].classificationStatus, 'reviewed');

const draftCopy = ExamContract.createIndependentCopy(definition);
const savedDraftCopy = await adapters.exams.save(ExamContract.buildPersistenceBundle(draftCopy));
const archived = await adapters.exams.archive(savedDraftCopy.id);
assert.equal(archived.status, 'archived');
assert.deepEqual(await adapters.exams.remove(savedDraftCopy.id), { id: savedDraftCopy.id, deleted: true });
assert.equal(await adapters.exams.load(savedDraftCopy.id), null);

const signedOutAdapters = createSupabaseExamAdapters({
  supabase: {
    auth: { async getUser() { return { data: { user: null }, error: null }; } },
    from() { throw new Error('A signed-out request must stop before querying.'); },
    async rpc() { throw new Error('A signed-out request must stop before calling the RPC.'); }
  }
});
await assert.rejects(signedOutAdapters.exams.list(), /Sign in/);

const migration = await readFile(
  resolve(projectRoot, 'supabase/migrations/202607180001_exam_library.sql'),
  'utf8'
);
assert.match(migration, /create table if not exists public\.exam_definitions/i);
assert.match(migration, /create table if not exists public\.exam_questions/i);
assert.match(migration, /with \(security_invoker = true\)/i);
assert.match(migration, /alter table public\.exam_definitions enable row level security/i);
assert.match(migration, /alter table public\.exam_questions enable row level security/i);
assert.match(migration, /security definer[\s\S]+save_exam_draft|save_exam_draft[\s\S]+security definer/i);
assert.match(migration, /role in \('teacher', 'tutor', 'mentor', 'admin'\)/i);
assert.match(migration, /jsonb_build_object\('reviewStatus', 'draft', 'visibility', 'private'\)/i);
assert.match(migration, /question_classification := case[\s\S]+else 'proposed'/i);
assert.match(migration, /grant update \(status\) on public\.exam_definitions to authenticated/i);
assert.doesNotMatch(migration, /grant update \([^)]*review_status|grant update \([^)]*visibility/i);
assert.match(migration, /status = 'archived'[\s\S]+review_status = 'draft'[\s\S]+for delete|for delete[\s\S]+status = 'archived'/i);
assert.match(migration, /references public\.exam_definitions\(id\) on delete cascade/i);
assert.match(migration, /unique \(exam_id, position\) deferrable initially deferred/i);

const reviewMigration = await readFile(
  resolve(projectRoot, 'supabase/migrations/202607180002_exam_review_workflow.sql'),
  'utf8'
);
assert.match(reviewMigration, /create table if not exists public\.exam_reviews/i);
assert.match(reviewMigration, /create or replace function public\.submit_exam_for_review/i);
assert.match(reviewMigration, /create or replace function public\.review_exam/i);
assert.match(reviewMigration, /role in \('mentor', 'admin'\)/i);
assert.match(reviewMigration, /review_status = 'pending_review'/i);
assert.match(reviewMigration, /classification_status = case[\s\S]+then 'reviewed'/i);
assert.match(reviewMigration, /visibility = case when new\.review_status = 'approved' then 'public'/i);
assert.match(reviewMigration, /review notes are required/i);
assert.match(reviewMigration, /grant execute on function public\.submit_exam_for_review\(text\) to authenticated/i);
assert.match(reviewMigration, /grant execute on function public\.review_exam\(text, text, text\) to authenticated/i);
assert.doesNotMatch(reviewMigration, /grant (insert|update|delete) on public\.exam_reviews to authenticated/i);

const html = await readFile(resolve(projectRoot, 'src/app/exam-builder/exam-builder.html'), 'utf8');
assert.ok(html.indexOf("import('./exam-supabase-provider.js") < html.indexOf('<script src="./exam-builder.js'));
const builder = await readFile(resolve(projectRoot, 'src/app/exam-builder/exam-builder.js'), 'utf8');
assert.match(builder, /Promise\.resolve\(window\.KelpExamProviderReady\)/);

console.log('Supabase exam provider and migration contract self-test passed.');
