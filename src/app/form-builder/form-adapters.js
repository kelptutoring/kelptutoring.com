(function attachKelpFormAdapters(root) {
  'use strict';

  const CONTRACT_VERSION = 1;
  const DEFAULT_FORM_STORAGE_KEY = 'kelp:forms:v1:definitions';
  const DEFAULT_SUBMISSION_STORAGE_KEY = 'kelp:forms:v1:submissions';
  const DEFAULT_REVIEW_STORAGE_KEY = 'kelp:forms:v1:reviews';
  const REQUIRED_METHODS = Object.freeze({
    forms: Object.freeze(['list', 'load', 'save', 'submitForReview', 'publish', 'archive', 'remove']),
    submissions: Object.freeze(['create', 'list']),
    reviews: Object.freeze(['list', 'decide', 'history'])
  });

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
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

  function validateAdapterSet(adapters) {
    Object.entries(REQUIRED_METHODS).forEach(([domain, methods]) => {
      methods.forEach((method) => {
        if (typeof adapters?.[domain]?.[method] !== 'function') {
          throw new TypeError(`Missing forms.${domain}.${method} adapter method.`);
        }
      });
    });
    return adapters;
  }

  function createLocalAdapters({
    storage = root.localStorage,
    formStorageKey = DEFAULT_FORM_STORAGE_KEY,
    submissionStorageKey = DEFAULT_SUBMISSION_STORAGE_KEY,
    reviewStorageKey = DEFAULT_REVIEW_STORAGE_KEY,
    now = () => new Date().toISOString()
  } = {}) {
    function readCollection(key) {
      try {
        const raw = storage?.getItem?.(key);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    function writeCollection(key, collection) {
      storage?.setItem?.(key, JSON.stringify(collection));
    }

    function readReviews() {
      try {
        const raw = storage?.getItem?.(reviewStorageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }

    function writeReviews(reviews) {
      storage?.setItem?.(reviewStorageKey, JSON.stringify(reviews));
    }

    function timestamp() {
      const value = String(now() || '').trim();
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    const adapters = {
      meta: Object.freeze({
        scope: 'forms',
        provider: 'local',
        contractVersion: CONTRACT_VERSION
      }),
      forms: {
        async list({ status = null } = {}) {
          return Object.values(readCollection(formStorageKey))
            .filter((record) => !status || record.status === status)
            .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
            .map(cloneJson);
        },
        async load(formId) {
          const id = requireIdentifier(formId, 'Form lookup');
          const record = readCollection(formStorageKey)[id];
          return record ? cloneJson(record) : null;
        },
        async save(definition) {
          validateFormDefinition(definition);
          const records = readCollection(formStorageKey);
          const existing = records[definition.id] || null;
          if (existing?.status === 'archived') {
            throw new Error('Archived forms cannot be overwritten. Open the form as a copy instead.');
          }
          if (existing && existing.reviewStatus !== 'draft') {
            throw new Error('A form under review or already published cannot be overwritten. Open it as a copy instead.');
          }
          const savedAt = timestamp();
          const record = {
            id: definition.id,
            ownerId: existing?.ownerId || 'local-author',
            status: 'active',
            reviewStatus: 'draft',
            visibility: 'private',
            publicationMode: 'private',
            publishedBy: null,
            publishedAt: null,
            createdAt: existing?.createdAt || savedAt,
            updatedAt: savedAt,
            archivedAt: null,
            definition: cloneJson(definition)
          };
          records[record.id] = record;
          writeCollection(formStorageKey, records);
          return cloneJson(record);
        },
        async submitForReview(formId) {
          const id = requireIdentifier(formId, 'Form review submission');
          const records = readCollection(formStorageKey);
          const existing = records[id];
          if (!existing) throw new Error('The form could not be found.');
          if (existing.status !== 'active' || existing.reviewStatus !== 'draft' || existing.visibility !== 'private') {
            throw new Error('Only an active private draft can be submitted for review.');
          }
          if (!(existing.definition.blocks || []).some((block) => block.kind === 'question')) {
            throw new Error('Add at least one question before submitting this form.');
          }
          const submittedAt = timestamp();
          records[id] = {
            ...existing,
            reviewStatus: 'pending_review',
            visibility: 'private',
            publicationMode: 'private',
            publishedBy: null,
            publishedAt: null,
            updatedAt: submittedAt
          };
          writeCollection(formStorageKey, records);
          return cloneJson(records[id]);
        },
        async publish(formId, { notes = '', publisherId = 'local-publisher' } = {}) {
          const id = requireIdentifier(formId, 'Form publication');
          const records = readCollection(formStorageKey);
          const existing = records[id];
          if (!existing) throw new Error('The form could not be found.');
          if (existing.status !== 'active' || existing.reviewStatus !== 'draft' || existing.visibility !== 'private') {
            throw new Error('Only an active private draft can be published directly.');
          }
          if (!(existing.definition.blocks || []).some((block) => block.kind === 'question')) {
            throw new Error('Add at least one question before publishing this form.');
          }
          const publishedAt = timestamp();
          records[id] = {
            ...existing,
            reviewStatus: 'approved',
            visibility: 'public',
            publicationMode: 'privileged_direct',
            publishedBy: String(publisherId || 'local-publisher'),
            publishedAt,
            publicationNotes: String(notes || '').trim(),
            updatedAt: publishedAt
          };
          writeCollection(formStorageKey, records);
          return cloneJson(records[id]);
        },
        async archive(formId) {
          const id = requireIdentifier(formId, 'Form archival');
          const records = readCollection(formStorageKey);
          const existing = records[id];
          if (!existing) throw new Error('The form could not be found.');
          if (existing.reviewStatus !== 'draft' || existing.visibility !== 'private') {
            throw new Error('Only a private draft can be archived here.');
          }
          if (existing.status !== 'archived') {
            const archivedAt = timestamp();
            records[id] = {
              ...existing,
              status: 'archived',
              archivedAt,
              updatedAt: archivedAt
            };
            writeCollection(formStorageKey, records);
          }
          return cloneJson(records[id]);
        },
        async remove(formId) {
          const id = requireIdentifier(formId, 'Form deletion');
          const records = readCollection(formStorageKey);
          const existing = records[id];
          if (!existing) return { id, deleted: false };
          if (existing.status !== 'archived' || existing.reviewStatus !== 'draft') {
            throw new Error('Archive the form before deleting it.');
          }
          delete records[id];
          writeCollection(formStorageKey, records);
          return { id, deleted: true };
        }
      },
      submissions: {
        async create(submission) {
          validateSubmission(submission);
          const records = readCollection(submissionStorageKey);
          const existing = records[submission.id];
          if (existing) {
            if (JSON.stringify(existing) !== JSON.stringify(submission)) {
              throw new Error('A different submission already uses this ID.');
            }
            return cloneJson(existing);
          }
          records[submission.id] = cloneJson(submission);
          writeCollection(submissionStorageKey, records);
          return cloneJson(records[submission.id]);
        },
        async list({ formId = null } = {}) {
          return Object.values(readCollection(submissionStorageKey))
            .filter((submission) => !formId || submission.formId === formId)
            .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))
            .map(cloneJson);
        }
      },
      reviews: {
        async list({ reviewStatus = 'pending_review' } = {}) {
          const normalizedStatus = String(reviewStatus || '').trim().toLowerCase();
          if (!['draft', 'pending_review', 'approved', 'changes_requested', 'rejected'].includes(normalizedStatus)) {
            throw new TypeError('Unsupported form review status.');
          }
          return Object.values(readCollection(formStorageKey))
            .filter((record) => record.status === 'active' && record.reviewStatus === normalizedStatus)
            .sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)))
            .map(cloneJson);
        },
        async decide(formId, { decision, notes = '', reviewerId = 'local-reviewer' } = {}) {
          const id = requireIdentifier(formId, 'Form review decision');
          const normalizedDecision = String(decision || '').trim().toLowerCase();
          if (!['approved', 'changes_requested', 'rejected'].includes(normalizedDecision)) {
            throw new TypeError('A review decision must approve, request changes, or reject the form.');
          }
          const normalizedNotes = String(notes || '').trim();
          if (normalizedDecision !== 'approved' && !normalizedNotes) {
            throw new TypeError('Review notes are required when requesting changes or rejecting a form.');
          }
          const records = readCollection(formStorageKey);
          const existing = records[id];
          if (!existing) throw new Error('The form could not be found.');
          if (existing.status !== 'active' || existing.reviewStatus !== 'pending_review') {
            throw new Error('Only a form awaiting review can receive a decision.');
          }
          const reviewedAt = timestamp();
          const visibility = normalizedDecision === 'approved' ? 'public' : 'private';
          records[id] = {
            ...existing,
            reviewStatus: normalizedDecision,
            visibility,
            publicationMode: normalizedDecision === 'approved' ? 'review_approved' : 'private',
            publishedBy: normalizedDecision === 'approved' ? String(reviewerId || 'local-reviewer') : null,
            publishedAt: normalizedDecision === 'approved' ? reviewedAt : null,
            updatedAt: reviewedAt
          };
          writeCollection(formStorageKey, records);
          const review = {
            id: `form-review-${reviewedAt}-${Math.random().toString(16).slice(2)}`,
            formId: id,
            ownerId: String(existing.ownerId || 'local-author'),
            reviewerId: String(reviewerId || 'local-reviewer'),
            decision: normalizedDecision,
            notes: normalizedNotes,
            reviewedAt
          };
          const reviews = readReviews();
          reviews.push(review);
          writeReviews(reviews);
          return { form: cloneJson(records[id]), review: cloneJson(review) };
        },
        async history({ formId = null } = {}) {
          return readReviews()
            .filter((review) => !formId || review.formId === formId)
            .sort((left, right) => String(right.reviewedAt).localeCompare(String(left.reviewedAt)))
            .map(cloneJson);
        }
      }
    };

    return validateAdapterSet(adapters);
  }

  function mergeAdapterSets(localAdapters, overrides) {
    const merged = { ...localAdapters, ...overrides };
    Object.keys(REQUIRED_METHODS).forEach((domain) => {
      if (overrides?.[domain] && typeof overrides[domain] === 'object') {
        merged[domain] = { ...localAdapters[domain], ...overrides[domain] };
      }
    });
    merged.meta = {
      ...(localAdapters.meta || {}),
      ...(overrides?.meta || {}),
      scope: 'forms',
      contractVersion: CONTRACT_VERSION
    };
    return validateAdapterSet(merged);
  }

  async function resolveAdapters({ localAdapters, context = {}, globalObject = root } = {}) {
    const local = validateAdapterSet(localAdapters || createLocalAdapters());
    const registry = globalObject?.KelpBackendAdapters;
    if (!registry) return local;

    const factoryContext = Object.freeze({
      ...context,
      scope: 'forms',
      contractVersion: CONTRACT_VERSION,
      localAdapters: local
    });
    let overrides = null;
    if (typeof registry.create === 'function') {
      overrides = await registry.create('forms', factoryContext);
    } else if (typeof registry.forms === 'function') {
      overrides = await registry.forms(factoryContext);
    } else {
      overrides = registry.forms;
    }
    return overrides ? mergeAdapterSets(local, overrides) : local;
  }

  root.KelpFormAdapters = Object.freeze({
    CONTRACT_VERSION,
    DEFAULT_FORM_STORAGE_KEY,
    DEFAULT_SUBMISSION_STORAGE_KEY,
    DEFAULT_REVIEW_STORAGE_KEY,
    createLocalAdapters,
    resolveAdapters,
    validateAdapterSet
  });
})(globalThis);
