import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createSupabaseFormAdapters,
  FORM_SUPABASE_RESOURCES
} from '../src/app/form-builder/form-supabase-adapters.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clone = (value) => JSON.parse(JSON.stringify(value));
const clock = {
  created: '2026-07-17T12:00:00.000Z',
  updated: '2026-07-17T12:30:00.000Z',
  submitted: '2026-07-17T13:00:00.000Z'
};

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.action = 'select';
    this.filters = [];
    this.payload = null;
    this.sort = null;
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
    this.sort = [column, options];
    return this;
  }

  upsert(payload, options) {
    this.action = 'upsert';
    this.payload = clone(payload);
    this.options = options;
    this.client.calls.push({ action: 'upsert', table: this.table, payload: clone(payload), options });
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

    if (this.action === 'upsert') {
      let row = rows.find((candidate) => candidate.id === this.payload.id);
      if (row) {
        Object.assign(row, clone(this.payload), {
          updated_at: clock.updated,
          archived_at: null
        });
      } else {
        row = {
          ...clone(this.payload),
          created_at: clock.created,
          updated_at: clock.created,
          archived_at: null
        };
        rows.push(row);
      }
      selected = [row];
    }

    if (this.action === 'update') {
      selected.forEach((row) => Object.assign(row, clone(this.payload), {
        updated_at: clock.updated,
        archived_at: this.payload.status === 'archived' ? clock.updated : row.archived_at
      }));
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

    if (this.sort) {
      const [column, options] = this.sort;
      selected.sort((left, right) => String(left[column]).localeCompare(String(right[column])));
      if (options?.ascending === false) selected.reverse();
    }

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
  const client = {
    calls: [],
    tables: {
      form_definitions: [],
      form_submissions: [],
      form_reviews: []
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
      if (name === 'save_form_draft') {
        const definition = clone(args.p_definition);
        let row = this.tables.form_definitions.find((item) => item.id === definition.id);
        if (!row) {
          row = {
            id: definition.id,
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
            definition
          };
          this.tables.form_definitions.push(row);
        } else {
          row.definition = definition;
          row.updated_at = clock.updated;
        }
        return { data: clone(row), error: null };
      }
      if (name === 'submit_form_response') {
        const source = clone(args.p_record);
        const form = this.tables.form_definitions.find((row) => row.id === source.formId);
        source.submittedAt = clock.submitted;
        source.metadata.submissionPolicy = form.definition.settings.submissionPolicy.mode;
        this.tables.form_submissions.push({
          id: source.id,
          form_id: source.formId,
          respondent_id: 'user-student-1',
          form_owner_id: 'user-tutor-1',
          submitted_at: source.submittedAt,
          record: source
        });
        return { data: source, error: null };
      }
      if (name === 'submit_form_for_review') {
        const row = this.tables.form_definitions.find((item) => item.id === args.p_form_id);
        row.review_status = 'pending_review';
        row.updated_at = clock.updated;
        return { data: clone(row), error: null };
      }
      if (name === 'review_form') {
        const row = this.tables.form_definitions.find((item) => item.id === args.p_form_id);
        row.review_status = args.p_decision;
        row.visibility = args.p_decision === 'approved' ? 'public' : 'private';
        row.publication_mode = args.p_decision === 'approved' ? 'review_approved' : 'private';
        row.published_by = args.p_decision === 'approved' ? 'user-mentor-1' : null;
        row.published_at = args.p_decision === 'approved' ? clock.updated : null;
        row.updated_at = clock.updated;
        const review = {
          id: this.tables.form_reviews.length + 1,
          form_id: row.id,
          owner_id: row.owner_id,
          reviewer_id: 'user-mentor-1',
          decision: args.p_decision,
          notes: args.p_notes,
          reviewed_at: clock.updated
        };
        this.tables.form_reviews.push(review);
        return { data: { form: clone(row), review: clone(review) }, error: null };
      }
      if (name === 'publish_form') {
        const row = this.tables.form_definitions.find((item) => item.id === args.p_form_id);
        row.review_status = 'approved';
        row.visibility = 'public';
        row.publication_mode = 'privileged_direct';
        row.published_by = 'user-tutor-1';
        row.published_at = clock.updated;
        row.updated_at = clock.updated;
        return { data: clone(row), error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    }
  };
  return client;
}

const supabase = createFakeSupabase();
const adapters = createSupabaseFormAdapters({ supabase });
assert.equal(adapters.meta.provider, 'supabase');
assert.deepEqual(FORM_SUPABASE_RESOURCES, {
  formTable: 'form_definitions',
  submissionTable: 'form_submissions',
  reviewTable: 'form_reviews',
  submissionRpc: 'submit_form_response',
  saveDraftRpc: 'save_form_draft',
  submitReviewRpc: 'submit_form_for_review',
  decideReviewRpc: 'review_form',
  publishFormRpc: 'publish_form'
});

const definition = {
  id: 'form-supabase-test',
  version: 3,
  meta: { title: 'Supabase form' },
  settings: { submissionPolicy: { mode: 'single' } },
  blocks: [{ id: 'question-form-supabase', kind: 'question', type: 'short-answer', prompt: 'How are you?', options: [] }]
};

const saved = await adapters.forms.save(definition);
assert.equal(saved.id, definition.id);
assert.equal(saved.status, 'active');
assert.equal(supabase.calls[0].name, 'save_form_draft');
assert.equal(supabase.calls[0].args.p_definition.id, definition.id);
assert.equal((await adapters.forms.list({ status: 'active' })).length, 1);
assert.equal((await adapters.forms.load(definition.id)).definition.meta.title, 'Supabase form');
await assert.rejects(adapters.forms.list({ status: 'deleted' }), /active or archived/);

const submission = {
  id: 'submission-supabase-test',
  version: 1,
  immutable: true,
  formId: definition.id,
  submittedAt: '2026-07-17T11:00:00.000Z',
  snapshot: { form: { id: definition.id } },
  data: { respondent: {}, answers: [] },
  metadata: { formSchemaVersion: 3, submissionPolicy: 'multiple', route: { pageIds: [] } }
};
const submitted = await adapters.submissions.create(submission);
assert.equal(submitted.submittedAt, clock.submitted, 'The provider must return the server-authoritative timestamp.');
assert.equal(submitted.metadata.submissionPolicy, 'single', 'The database policy must replace the client claim.');
assert.equal((await adapters.submissions.list({ formId: definition.id })).length, 1);
assert.ok(supabase.calls.some((call) => call.name === 'submit_form_response'));

const archived = await adapters.forms.archive(definition.id);
assert.equal(archived.status, 'archived');
assert.equal(archived.archivedAt, clock.updated);
assert.deepEqual(await adapters.forms.remove(definition.id), { id: definition.id, deleted: true });
assert.equal(await adapters.forms.load(definition.id), null);
assert.equal((await adapters.submissions.list({ formId: definition.id })).length, 1);

const reviewDefinition = { ...clone(definition), id: 'form-supabase-review', meta: { title: 'Review form' } };
await adapters.forms.save(reviewDefinition);
const reviewSubmitted = await adapters.forms.submitForReview(reviewDefinition.id);
assert.equal(reviewSubmitted.reviewStatus, 'pending_review');
assert.equal((await adapters.reviews.list({ reviewStatus: 'pending_review' })).length, 1);
const reviewed = await adapters.reviews.decide(reviewDefinition.id, { decision: 'approved', notes: 'Ready.' });
assert.equal(reviewed.form.visibility, 'public');
assert.equal(reviewed.form.publicationMode, 'review_approved');
assert.equal(reviewed.review.reviewerId, 'user-mentor-1');
assert.equal((await adapters.reviews.history({ formId: reviewDefinition.id })).length, 1);

const directDefinition = { ...clone(definition), id: 'form-supabase-direct', meta: { title: 'Direct form' } };
await adapters.forms.save(directDefinition);
const published = await adapters.forms.publish(directDefinition.id, { notes: 'Administrator-owned.' });
assert.equal(published.visibility, 'public');
assert.equal(published.publicationMode, 'privileged_direct');

const signedOutAdapters = createSupabaseFormAdapters({
  supabase: {
    auth: { async getUser() { return { data: { user: null }, error: null }; } },
    from() { throw new Error('A signed-out request must stop before querying.'); },
    async rpc() { throw new Error('A signed-out request must stop before calling RPC.'); }
  }
});
await assert.rejects(signedOutAdapters.forms.list(), /Sign in/);

const migration = await readFile(
  resolve(projectRoot, 'supabase/migrations/202607170001_form_library.sql'),
  'utf8'
);
assert.match(migration, /alter table public\.form_definitions enable row level security/i);
assert.match(migration, /alter table public\.form_submissions enable row level security/i);
assert.match(migration, /form_submissions_single_response_idx/i);
assert.match(migration, /before update or delete on public\.form_submissions/i);
assert.match(migration, /status = 'archived'[\s\S]+for delete|for delete[\s\S]+status = 'archived'/i);
assert.match(migration, /role in \('teacher', 'tutor', 'mentor', 'admin'\)/i);
assert.match(migration, /security definer[\s\S]+submit_form_response|submit_form_response[\s\S]+security definer/i);
assert.match(migration, /revoke all on public\.form_submissions from anon, authenticated/i);
assert.doesNotMatch(
  migration.match(/create table if not exists public\.form_submissions \([\s\S]*?\n\);/i)?.[0] || '',
  /references public\.form_definitions/i,
  'Submission storage must not cascade through a source-form foreign key.'
);

const html = await readFile(resolve(projectRoot, 'src/app/form-builder/form-builder.html'), 'utf8');
assert.ok(html.indexOf("import('./form-supabase-provider.js')") < html.indexOf('<script src="form-builder.js"></script>'));
const builder = await readFile(resolve(projectRoot, 'src/app/form-builder/form-builder.js'), 'utf8');
assert.match(builder, /Promise\.resolve\(window\.KelpFormProviderReady\)/);

console.log('Supabase form provider and migration contract self-test passed.');
