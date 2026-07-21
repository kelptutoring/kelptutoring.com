const FORM_TABLE = 'form_definitions';
const SUBMISSION_TABLE = 'form_submissions';
const SUBMISSION_RPC = 'submit_form_response';
const REVIEW_TABLE = 'form_reviews';
const SAVE_DRAFT_RPC = 'save_form_draft';
const SUBMIT_REVIEW_RPC = 'submit_form_for_review';
const DECIDE_REVIEW_RPC = 'review_form';
const PUBLISH_FORM_RPC = 'publish_form';
const FORM_COLUMNS = 'id, owner_id, status, review_status, visibility, publication_mode, published_by, published_at, created_at, updated_at, archived_at, definition';
const REVIEW_COLUMNS = 'id, form_id, owner_id, reviewer_id, decision, notes, reviewed_at';

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function requireIdentifier(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new TypeError(`${label} requires an ID.`);
  return id;
}

function validateFormDefinition(definition) {
  if (!definition || typeof definition !== 'object' || !Array.isArray(definition.blocks)) {
    throw new TypeError('A form definition with a blocks array is required.');
  }
  requireIdentifier(definition.id, 'A form definition');
  const version = Number(definition.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new TypeError('A positive form schema version is required.');
  }
  return definition;
}

function validateSubmission(submission) {
  if (!submission || typeof submission !== 'object' || submission.immutable !== true) {
    throw new TypeError('An immutable submission record is required.');
  }
  requireIdentifier(submission.id, 'A submission');
  requireIdentifier(submission.formId, 'A submission form reference');
  return submission;
}

function throwProviderError(error, fallback) {
  if (!error) return;
  const message = String(error.message || '').trim() || fallback;
  const providerError = new Error(message);
  providerError.code = error.code || null;
  providerError.cause = error;
  throw providerError;
}

function mapFormRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id || null,
    status: row.status,
    reviewStatus: row.review_status || 'draft',
    visibility: row.visibility || 'private',
    publicationMode: row.publication_mode || 'private',
    publishedBy: row.published_by || null,
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    definition: cloneJson(row.definition)
  };
}

function mapReviewRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    formId: row.form_id,
    ownerId: row.owner_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    notes: row.notes || '',
    reviewedAt: row.reviewed_at
  };
}

function mapSubmissionRecord(row) {
  return row?.record ? cloneJson(row.record) : null;
}

export function createSupabaseFormAdapters({ supabase } = {}) {
  if (!supabase?.auth?.getUser || typeof supabase.from !== 'function' || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase client with auth, table, and RPC support is required.');
  }

  async function getUser() {
    const { data, error } = await supabase.auth.getUser();
    throwProviderError(error, 'The signed-in user could not be verified.');
    if (!data?.user?.id) {
      throw new Error('Sign in before using the shared form library.');
    }
    return data.user;
  }

  async function findOwnedForm(formId, ownerId) {
    const { data, error } = await supabase
      .from(FORM_TABLE)
      .select(FORM_COLUMNS)
      .eq('owner_id', ownerId)
      .eq('id', formId)
      .maybeSingle();
    throwProviderError(error, 'The form could not be loaded.');
    return mapFormRecord(data);
  }

  return {
    meta: Object.freeze({
      scope: 'forms',
      provider: 'supabase',
      contractVersion: 1
    }),
    forms: {
      async list({ status = null } = {}) {
        const user = await getUser();
        let query = supabase
          .from(FORM_TABLE)
          .select(FORM_COLUMNS)
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false });
        if (status) {
          if (!['active', 'archived'].includes(status)) {
            throw new TypeError('Form status must be active or archived.');
          }
          query = query.eq('status', status);
        }
        const { data, error } = await query;
        throwProviderError(error, 'The form library could not be loaded.');
        return (data || []).map(mapFormRecord);
      },

      async load(formId) {
        const id = requireIdentifier(formId, 'Form lookup');
        const user = await getUser();
        return findOwnedForm(id, user.id);
      },

      async save(definition) {
        validateFormDefinition(definition);
        await getUser();
        const { data, error } = await supabase.rpc(SAVE_DRAFT_RPC, {
          p_definition: cloneJson(definition)
        });
        throwProviderError(error, 'The form could not be saved.');
        return mapFormRecord(data);
      },

      async submitForReview(formId) {
        const id = requireIdentifier(formId, 'Form review submission');
        await getUser();
        const { data, error } = await supabase.rpc(SUBMIT_REVIEW_RPC, { p_form_id: id });
        throwProviderError(error, 'The form could not be submitted for review.');
        return mapFormRecord(data);
      },

      async publish(formId, { notes = '' } = {}) {
        const id = requireIdentifier(formId, 'Form publication');
        await getUser();
        const { data, error } = await supabase.rpc(PUBLISH_FORM_RPC, {
          p_form_id: id,
          p_notes: String(notes || '').trim()
        });
        throwProviderError(error, 'The form could not be published.');
        return mapFormRecord(data);
      },

      async archive(formId) {
        const id = requireIdentifier(formId, 'Form archival');
        const user = await getUser();
        const { data, error } = await supabase
          .from(FORM_TABLE)
          .update({ status: 'archived' })
          .eq('owner_id', user.id)
          .eq('id', id)
          .eq('status', 'active')
          .eq('review_status', 'draft')
          .eq('visibility', 'private')
          .select(FORM_COLUMNS)
          .maybeSingle();
        throwProviderError(error, 'The form could not be archived.');
        if (data) return mapFormRecord(data);

        const existing = await findOwnedForm(id, user.id);
        if (!existing) throw new Error('The form could not be found.');
        if (existing.status !== 'archived') throw new Error('The form could not be archived.');
        return existing;
      },

      async remove(formId) {
        const id = requireIdentifier(formId, 'Form deletion');
        const user = await getUser();
        const { data, error } = await supabase
          .from(FORM_TABLE)
          .delete()
          .eq('owner_id', user.id)
          .eq('id', id)
          .eq('status', 'archived')
          .eq('review_status', 'draft')
          .eq('visibility', 'private')
          .select('id')
          .maybeSingle();
        throwProviderError(error, 'The form could not be deleted.');
        if (data) return { id, deleted: true };

        const existing = await findOwnedForm(id, user.id);
        if (!existing) return { id, deleted: false };
        throw new Error('Archive the form before deleting it.');
      }
    },
    submissions: {
      async create(submission) {
        validateSubmission(submission);
        await getUser();
        const { data, error } = await supabase.rpc(SUBMISSION_RPC, {
          p_record: cloneJson(submission)
        });
        throwProviderError(error, 'The form response could not be submitted.');
        return cloneJson(data);
      },

      async list({ formId = null } = {}) {
        await getUser();
        let query = supabase
          .from(SUBMISSION_TABLE)
          .select('record, submitted_at')
          .order('submitted_at', { ascending: false });
        if (formId) query = query.eq('form_id', requireIdentifier(formId, 'Submission form lookup'));
        const { data, error } = await query;
        throwProviderError(error, 'The form responses could not be loaded.');
        return (data || []).map(mapSubmissionRecord).filter(Boolean);
      }
    },
    reviews: {
      async list({ reviewStatus = 'pending_review' } = {}) {
        const normalizedStatus = String(reviewStatus || '').trim().toLowerCase();
        if (!['draft', 'pending_review', 'approved', 'changes_requested', 'rejected'].includes(normalizedStatus)) {
          throw new TypeError('Unsupported form review status.');
        }
        await getUser();
        const { data, error } = await supabase
          .from(FORM_TABLE)
          .select(FORM_COLUMNS)
          .eq('status', 'active')
          .eq('review_status', normalizedStatus)
          .order('updated_at', { ascending: true });
        throwProviderError(error, 'The form review queue could not be loaded.');
        return (data || []).map(mapFormRecord);
      },

      async decide(formId, { decision, notes = '' } = {}) {
        const id = requireIdentifier(formId, 'Form review decision');
        const normalizedDecision = String(decision || '').trim().toLowerCase();
        if (!['approved', 'changes_requested', 'rejected'].includes(normalizedDecision)) {
          throw new TypeError('A review decision must approve, request changes, or reject the form.');
        }
        await getUser();
        const { data, error } = await supabase.rpc(DECIDE_REVIEW_RPC, {
          p_form_id: id,
          p_decision: normalizedDecision,
          p_notes: String(notes || '').trim()
        });
        throwProviderError(error, 'The form review decision could not be saved.');
        return {
          form: mapFormRecord(data?.form),
          review: mapReviewRecord(data?.review)
        };
      },

      async history({ formId = null } = {}) {
        await getUser();
        let query = supabase
          .from(REVIEW_TABLE)
          .select(REVIEW_COLUMNS)
          .order('reviewed_at', { ascending: false });
        if (formId) query = query.eq('form_id', requireIdentifier(formId, 'Form review history'));
        const { data, error } = await query;
        throwProviderError(error, 'The form review history could not be loaded.');
        return (data || []).map(mapReviewRecord);
      }
    }
  };
}

export const FORM_SUPABASE_RESOURCES = Object.freeze({
  formTable: FORM_TABLE,
  submissionTable: SUBMISSION_TABLE,
  reviewTable: REVIEW_TABLE,
  submissionRpc: SUBMISSION_RPC,
  saveDraftRpc: SAVE_DRAFT_RPC,
  submitReviewRpc: SUBMIT_REVIEW_RPC,
  decideReviewRpc: DECIDE_REVIEW_RPC,
  publishFormRpc: PUBLISH_FORM_RPC
});
