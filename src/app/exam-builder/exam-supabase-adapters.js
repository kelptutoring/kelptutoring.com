const EXAM_TABLE = 'exam_definitions';
const QUESTION_TABLE = 'exam_questions';
const QUESTION_VIEW = 'exam_question_records';
const REVIEW_TABLE = 'exam_reviews';
const SAVE_DRAFT_RPC = 'save_exam_draft';
const SUBMIT_REVIEW_RPC = 'submit_exam_for_review';
const DECIDE_REVIEW_RPC = 'review_exam';
const PUBLISH_EXAM_RPC = 'publish_exam';
const EXAM_COLUMNS = 'id, status, review_status, visibility, publication_mode, published_by, published_at, created_at, updated_at, archived_at, bundle';
const QUESTION_COLUMNS = 'id, exam_id, position, difficulty, classification_status, review_status, copied_from_question_id, question_type_tags, curriculum_node_ids, primary_curriculum_node_id, content, created_at, updated_at, exam_status, exam_review_status, exam_visibility, exam_title';
const REVIEW_COLUMNS = 'id, exam_id, owner_id, reviewer_id, decision, notes, reviewed_at';
const EXAM_STATUSES = new Set(['active', 'archived']);
const REVIEW_STATUSES = new Set(['draft', 'pending_review', 'approved', 'changes_requested', 'rejected']);
const DIFFICULTIES = new Set(['unclassified', 'very-easy', 'easy', 'difficult', 'very-difficult', 'challenge']);
const CLASSIFICATION_STATUSES = new Set(['unclassified', 'proposed', 'reviewed']);

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function requireIdentifier(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new TypeError(`${label} requires an ID.`);
  return id;
}

function validatePersistenceBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new TypeError('An exam persistence bundle is required.');
  }
  if (bundle.schema !== 'kelp-exam-persistence-bundle-v1'
    || !bundle.exam
    || !Array.isArray(bundle.exam.questionIds)
    || !Array.isArray(bundle.questions)) {
    throw new TypeError('A valid exam persistence bundle is required.');
  }
  requireIdentifier(bundle.exam.id, 'An exam persistence bundle');
  globalThis.KelpExamContract?.restoreDefinitionFromBundle?.(bundle);
  return bundle;
}

function throwProviderError(error, fallback) {
  if (!error) return;
  const providerError = new Error(String(error.message || '').trim() || fallback);
  providerError.code = error.code || null;
  providerError.cause = error;
  throw providerError;
}

function restoreDefinition(bundle) {
  if (!globalThis.KelpExamContract?.restoreDefinitionFromBundle) {
    throw new Error('The exam definition contract is unavailable.');
  }
  return globalThis.KelpExamContract.restoreDefinitionFromBundle(bundle);
}

function mapExamRecord(row) {
  if (!row) return null;
  const bundle = cloneJson(row.bundle);
  return {
    id: row.id,
    status: row.status,
    reviewStatus: row.review_status,
    visibility: row.visibility,
    publicationMode: row.publication_mode || 'private',
    publishedBy: row.published_by || null,
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    bundle,
    definition: restoreDefinition(bundle)
  };
}

function mapQuestionRecord(row) {
  if (!row) return null;
  return {
    schema: 'kelp-exam-question-record-v1',
    id: row.id,
    examId: row.exam_id,
    position: Number(row.position),
    difficulty: row.difficulty,
    classificationStatus: row.classification_status,
    reviewStatus: row.review_status,
    copiedFromQuestionId: row.copied_from_question_id || '',
    questionTypeTags: Array.isArray(row.question_type_tags) ? [...row.question_type_tags] : [],
    curriculumNodeIds: Array.isArray(row.curriculum_node_ids) ? [...row.curriculum_node_ids] : [],
    primaryCurriculumNodeId: row.primary_curriculum_node_id || '',
    content: cloneJson(row.content),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    examStatus: row.exam_status,
    examReviewStatus: row.exam_review_status,
    examVisibility: row.exam_visibility,
    examTitle: row.exam_title || ''
  };
}

function mapReviewRecord(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    examId: row.exam_id,
    ownerId: row.owner_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    notes: row.notes || '',
    reviewedAt: row.reviewed_at
  };
}

export function createSupabaseExamAdapters({ supabase } = {}) {
  if (!supabase?.auth?.getUser || typeof supabase.from !== 'function' || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase client with auth, table, and RPC support is required.');
  }

  async function getUser() {
    const { data, error } = await supabase.auth.getUser();
    throwProviderError(error, 'The signed-in user could not be verified.');
    if (!data?.user?.id) throw new Error('Sign in before using the shared exam library.');
    return data.user;
  }

  async function findOwnedExam(examId, ownerId) {
    const { data, error } = await supabase
      .from(EXAM_TABLE)
      .select(EXAM_COLUMNS)
      .eq('owner_id', ownerId)
      .eq('id', examId)
      .maybeSingle();
    throwProviderError(error, 'The exam could not be loaded.');
    return mapExamRecord(data);
  }

  return {
    meta: Object.freeze({
      scope: 'exams',
      provider: 'supabase',
      contractVersion: 1
    }),
    exams: {
      async list({ status = null, reviewStatus = null } = {}) {
        const user = await getUser();
        let query = supabase
          .from(EXAM_TABLE)
          .select(EXAM_COLUMNS)
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false });
        if (status) {
          if (!EXAM_STATUSES.has(status)) throw new TypeError('Exam status must be active or archived.');
          query = query.eq('status', status);
        }
        if (reviewStatus) {
          if (!REVIEW_STATUSES.has(reviewStatus)) throw new TypeError('Unsupported exam review status.');
          query = query.eq('review_status', reviewStatus);
        }
        const { data, error } = await query;
        throwProviderError(error, 'The exam library could not be loaded.');
        return (data || []).map(mapExamRecord);
      },

      async load(examId) {
        const id = requireIdentifier(examId, 'Exam lookup');
        const user = await getUser();
        return findOwnedExam(id, user.id);
      },

      async save(bundle) {
        validatePersistenceBundle(bundle);
        await getUser();
        const { data, error } = await supabase.rpc(SAVE_DRAFT_RPC, {
          p_bundle: cloneJson(bundle)
        });
        throwProviderError(error, 'The exam could not be saved.');
        return mapExamRecord(data);
      },

      async submitForReview(examId) {
        const id = requireIdentifier(examId, 'Exam review submission');
        await getUser();
        const { data, error } = await supabase.rpc(SUBMIT_REVIEW_RPC, { p_exam_id: id });
        throwProviderError(error, 'The exam could not be submitted for review.');
        return mapExamRecord(data);
      },

      async publish(examId, { notes = '' } = {}) {
        const id = requireIdentifier(examId, 'Exam publication');
        await getUser();
        const { data, error } = await supabase.rpc(PUBLISH_EXAM_RPC, {
          p_exam_id: id,
          p_notes: String(notes || '').trim()
        });
        throwProviderError(error, 'The exam could not be published.');
        return mapExamRecord(data);
      },

      async archive(examId) {
        const id = requireIdentifier(examId, 'Exam archival');
        const user = await getUser();
        const { data, error } = await supabase
          .from(EXAM_TABLE)
          .update({ status: 'archived' })
          .eq('owner_id', user.id)
          .eq('id', id)
          .eq('status', 'active')
          .eq('review_status', 'draft')
          .select(EXAM_COLUMNS)
          .maybeSingle();
        throwProviderError(error, 'The exam could not be archived.');
        if (data) return mapExamRecord(data);
        const existing = await findOwnedExam(id, user.id);
        if (!existing) throw new Error('The exam could not be found.');
        if (existing.status !== 'archived') throw new Error('Only active private drafts can be archived here.');
        return existing;
      },

      async remove(examId) {
        const id = requireIdentifier(examId, 'Exam deletion');
        const user = await getUser();
        const { data, error } = await supabase
          .from(EXAM_TABLE)
          .delete()
          .eq('owner_id', user.id)
          .eq('id', id)
          .eq('status', 'archived')
          .eq('review_status', 'draft')
          .select('id')
          .maybeSingle();
        throwProviderError(error, 'The exam could not be deleted.');
        if (data) return { id, deleted: true };
        const existing = await findOwnedExam(id, user.id);
        if (!existing) return { id, deleted: false };
        throw new Error('Archive the private draft before deleting it.');
      }
    },

    questions: {
      async list({
        examId = null,
        difficulty = null,
        classificationStatus = null,
        reviewStatus = null,
        includeArchived = false
      } = {}) {
        const user = await getUser();
        let query = supabase
          .from(QUESTION_VIEW)
          .select(QUESTION_COLUMNS)
          .eq('owner_id', user.id)
          .order('exam_id', { ascending: true })
          .order('position', { ascending: true });
        if (!includeArchived) query = query.eq('exam_status', 'active');
        if (examId) query = query.eq('exam_id', requireIdentifier(examId, 'Question exam lookup'));
        if (difficulty) {
          if (!DIFFICULTIES.has(difficulty)) throw new TypeError('Unsupported question difficulty.');
          query = query.eq('difficulty', difficulty);
        }
        if (classificationStatus) {
          if (!CLASSIFICATION_STATUSES.has(classificationStatus)) throw new TypeError('Unsupported question classification status.');
          query = query.eq('classification_status', classificationStatus);
        }
        if (reviewStatus) {
          if (!REVIEW_STATUSES.has(reviewStatus)) throw new TypeError('Unsupported question review status.');
          query = query.eq('review_status', reviewStatus);
        }
        const { data, error } = await query;
        throwProviderError(error, 'The exam questions could not be loaded.');
        return (data || []).map(mapQuestionRecord);
      },

      async load(questionId) {
        const id = requireIdentifier(questionId, 'Question lookup');
        const user = await getUser();
        const { data, error } = await supabase
          .from(QUESTION_VIEW)
          .select(QUESTION_COLUMNS)
          .eq('owner_id', user.id)
          .eq('id', id)
          .maybeSingle();
        throwProviderError(error, 'The exam question could not be loaded.');
        return mapQuestionRecord(data);
      }
    },

    reviews: {
      async list({ reviewStatus = 'pending_review' } = {}) {
        const normalizedStatus = String(reviewStatus || '').trim().toLowerCase();
        if (!REVIEW_STATUSES.has(normalizedStatus)) throw new TypeError('Unsupported exam review status.');
        await getUser();
        const { data, error } = await supabase
          .from(EXAM_TABLE)
          .select(EXAM_COLUMNS)
          .eq('status', 'active')
          .eq('review_status', normalizedStatus)
          .order('updated_at', { ascending: true });
        throwProviderError(error, 'The exam review queue could not be loaded.');
        return (data || []).map(mapExamRecord);
      },

      async decide(examId, { decision, notes = '' } = {}) {
        const id = requireIdentifier(examId, 'Exam review decision');
        const normalizedDecision = String(decision || '').trim().toLowerCase();
        if (!['approved', 'changes_requested', 'rejected'].includes(normalizedDecision)) {
          throw new TypeError('A review decision must approve, request changes, or reject the exam.');
        }
        await getUser();
        const { data, error } = await supabase.rpc(DECIDE_REVIEW_RPC, {
          p_exam_id: id,
          p_decision: normalizedDecision,
          p_notes: String(notes || '').trim()
        });
        throwProviderError(error, 'The exam review decision could not be saved.');
        return {
          exam: mapExamRecord(data?.exam),
          review: mapReviewRecord(data?.review)
        };
      },

      async history({ examId = null } = {}) {
        await getUser();
        let query = supabase
          .from(REVIEW_TABLE)
          .select(REVIEW_COLUMNS)
          .order('reviewed_at', { ascending: false });
        if (examId) query = query.eq('exam_id', requireIdentifier(examId, 'Exam review history'));
        const { data, error } = await query;
        throwProviderError(error, 'The exam review history could not be loaded.');
        return (data || []).map(mapReviewRecord);
      }
    }
  };
}

export const EXAM_SUPABASE_RESOURCES = Object.freeze({
  examTable: EXAM_TABLE,
  questionTable: QUESTION_TABLE,
  questionView: QUESTION_VIEW,
  reviewTable: REVIEW_TABLE,
  saveDraftRpc: SAVE_DRAFT_RPC,
  submitReviewRpc: SUBMIT_REVIEW_RPC,
  decideReviewRpc: DECIDE_REVIEW_RPC,
  publishExamRpc: PUBLISH_EXAM_RPC
});
