(function attachKelpExamAdapters(root) {
  "use strict";

  const CONTRACT_VERSION = 1;
  const DEFAULT_EXAM_STORAGE_KEY = "kelp:exams:v1:records";
  const DEFAULT_REVIEW_STORAGE_KEY = "kelp:exams:v1:reviews";
  const LEGACY_EXAM_STORAGE_KEY = "kelp-exam-library-v1";
  const LEGACY_META_STORAGE_KEY = "kelp-exam-library-meta-v1";
  const REQUIRED_METHODS = Object.freeze({
    exams: Object.freeze(["list", "load", "save", "submitForReview", "publish", "archive", "remove"]),
    questions: Object.freeze(["list", "load"]),
    reviews: Object.freeze(["list", "decide", "history"])
  });

  const ExamContract = root.KelpExamContract;
  if (!ExamContract) throw new Error("Kelp Exam Contract must load before the exam adapters.");

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function requireIdentifier(value, label) {
    const id = String(value || "").trim();
    if (!id) throw new TypeError(`${label} requires an ID.`);
    return id;
  }

  function validatePersistenceBundle(bundle) {
    const definition = ExamContract.restoreDefinitionFromBundle(bundle);
    return { bundle, definition };
  }

  function validateAdapterSet(adapters) {
    Object.entries(REQUIRED_METHODS).forEach(([domain, methods]) => {
      methods.forEach((method) => {
        if (typeof adapters?.[domain]?.[method] !== "function") {
          throw new TypeError(`Missing exams.${domain}.${method} adapter method.`);
        }
      });
    });
    return adapters;
  }

  function createLocalAdapters({
    storage = root.localStorage,
    examStorageKey = DEFAULT_EXAM_STORAGE_KEY,
    reviewStorageKey = DEFAULT_REVIEW_STORAGE_KEY,
    legacyExamStorageKey = LEGACY_EXAM_STORAGE_KEY,
    legacyMetaStorageKey = LEGACY_META_STORAGE_KEY,
    now = () => new Date().toISOString()
  } = {}) {
    function parseStorage(key, fallback) {
      try {
        const raw = storage?.getItem?.(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    }

    function writeRecords(records) {
      storage?.setItem?.(examStorageKey, JSON.stringify(records));
    }

    function readReviews() {
      const parsed = parseStorage(reviewStorageKey, []);
      return Array.isArray(parsed) ? parsed : [];
    }

    function writeReviews(reviews) {
      storage?.setItem?.(reviewStorageKey, JSON.stringify(reviews));
    }

    function timestamp() {
      const candidate = new Date(String(now() || ""));
      return Number.isNaN(candidate.getTime()) ? new Date().toISOString() : candidate.toISOString();
    }

    function migrateLegacyRecords() {
      const legacy = parseStorage(legacyExamStorageKey, []);
      if (!Array.isArray(legacy) || !legacy.length) return {};
      const legacyMetadata = parseStorage(legacyMetaStorageKey, {});
      const records = {};
      const usedQuestionIds = new Set();
      legacy.forEach((definition) => {
        try {
          const normalizedDefinition = ExamContract.inspectImport(definition).definition;
          const bundle = ExamContract.applyReviewStateToBundle(
            ExamContract.buildPersistenceBundle(normalizedDefinition),
            { reviewStatus: "draft", visibility: "private", proposeClassifications: true }
          );
          if (bundle.questions.some((question) => usedQuestionIds.has(question.id))) {
            throw new Error("A legacy question ID is already owned by another exam.");
          }
          bundle.questions.forEach((question) => usedQuestionIds.add(question.id));
          const metadata = legacyMetadata?.[bundle.exam.id] || {};
          const savedAt = String(metadata.updatedAt || definition.updatedAt || definition.createdAt || timestamp());
          records[bundle.exam.id] = {
            id: bundle.exam.id,
            status: metadata.status === "archived" ? "archived" : "active",
            reviewStatus: "draft",
            visibility: "private",
            publicationMode: "private",
            publishedBy: null,
            publishedAt: null,
            createdAt: String(metadata.createdAt || definition.createdAt || savedAt),
            updatedAt: savedAt,
            archivedAt: metadata.status === "archived" ? savedAt : null,
            bundle
          };
        } catch (_) {
          // An invalid legacy entry stays untouched in the legacy key for manual recovery.
        }
      });
      if (Object.keys(records).length) writeRecords(records);
      return records;
    }

    function readRecords() {
      const parsed = parseStorage(examStorageKey, null);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      return migrateLegacyRecords();
    }

    function hydrateRecord(record) {
      const hydrated = cloneJson(record);
      hydrated.definition = ExamContract.restoreDefinitionFromBundle(hydrated.bundle);
      return hydrated;
    }

    const adapters = {
      meta: Object.freeze({
        scope: "exams",
        provider: "local",
        contractVersion: CONTRACT_VERSION
      }),
      exams: {
        async list({ status = null, reviewStatus = null } = {}) {
          return Object.values(readRecords())
            .filter((record) => !status || record.status === status)
            .filter((record) => !reviewStatus || record.reviewStatus === reviewStatus)
            .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
            .map(hydrateRecord);
        },
        async load(examId) {
          const id = requireIdentifier(examId, "Exam lookup");
          const record = readRecords()[id];
          return record ? hydrateRecord(record) : null;
        },
        async save(bundle) {
          const { definition } = validatePersistenceBundle(bundle);
          const records = readRecords();
          const existing = records[definition.id] || null;
          if (existing?.status === "archived") {
            throw new Error("Archived exams cannot be overwritten. Open the exam as a copy instead.");
          }
          if (existing && existing.reviewStatus !== "draft") {
            throw new Error("An exam under review or already reviewed cannot be overwritten. Open it as a copy instead.");
          }
          const questionOwners = new Map();
          Object.values(records).forEach((record) => {
            if (record.id === definition.id) return;
            record.bundle.questions.forEach((question) => questionOwners.set(question.id, record.id));
          });
          const reusedQuestion = bundle.questions.find((question) => questionOwners.has(question.id));
          if (reusedQuestion) {
            throw new Error("A question ID is already owned by another exam. Open or import the exam as an independent copy.");
          }
          const savedAt = timestamp();
          const draftBundle = ExamContract.applyReviewStateToBundle(bundle, {
            reviewStatus: "draft",
            visibility: "private",
            proposeClassifications: true
          });
          const record = {
            id: definition.id,
            status: "active",
            reviewStatus: "draft",
            visibility: "private",
            publicationMode: "private",
            publishedBy: null,
            publishedAt: null,
            createdAt: existing?.createdAt || definition.createdAt || savedAt,
            updatedAt: savedAt,
            archivedAt: null,
            bundle: draftBundle
          };
          records[record.id] = record;
          writeRecords(records);
          return hydrateRecord(record);
        },
        async submitForReview(examId) {
          const id = requireIdentifier(examId, "Exam review submission");
          const records = readRecords();
          const existing = records[id];
          if (!existing) throw new Error("The exam could not be found.");
          if (existing.status !== "active" || existing.reviewStatus !== "draft") {
            throw new Error("Only an active private draft can be submitted for review.");
          }
          if (existing.bundle.questions.some((question) => question.difficulty === "unclassified")) {
            throw new Error("Classify every question before submitting this exam for review.");
          }
          const submittedAt = timestamp();
          records[id] = {
            ...existing,
            reviewStatus: "pending_review",
            visibility: "private",
            publicationMode: "private",
            publishedBy: null,
            publishedAt: null,
            updatedAt: submittedAt,
            bundle: ExamContract.applyReviewStateToBundle(existing.bundle, {
              reviewStatus: "pending_review",
              visibility: "private"
            })
          };
          writeRecords(records);
          return hydrateRecord(records[id]);
        },
        async publish(examId, { notes = "", publisherId = "local-publisher" } = {}) {
          const id = requireIdentifier(examId, "Exam publication");
          const records = readRecords();
          const existing = records[id];
          if (!existing) throw new Error("The exam could not be found.");
          if (existing.status !== "active" || existing.reviewStatus !== "draft" || existing.visibility !== "private") {
            throw new Error("Only an active private draft can be published directly.");
          }
          if (!existing.bundle.questions.length) {
            throw new Error("Add at least one question before publishing this exam.");
          }
          if (existing.bundle.questions.some((question) => question.difficulty === "unclassified")) {
            throw new Error("Classify every question before publishing this exam.");
          }
          const publishedAt = timestamp();
          records[id] = {
            ...existing,
            reviewStatus: "approved",
            visibility: "public",
            publicationMode: "privileged_direct",
            publishedBy: String(publisherId || "local-publisher"),
            publishedAt,
            publicationNotes: String(notes || "").trim(),
            updatedAt: publishedAt,
            bundle: ExamContract.applyReviewStateToBundle(existing.bundle, {
              reviewStatus: "approved",
              visibility: "public",
              reviewClassifications: true
            })
          };
          writeRecords(records);
          return hydrateRecord(records[id]);
        },
        async archive(examId) {
          const id = requireIdentifier(examId, "Exam archival");
          const records = readRecords();
          const existing = records[id];
          if (!existing) throw new Error("The exam could not be found.");
          if (existing.reviewStatus !== "draft") {
            throw new Error("Only a private draft can be archived here.");
          }
          if (existing.status !== "archived") {
            const archivedAt = timestamp();
            records[id] = {
              ...existing,
              status: "archived",
              visibility: "private",
              archivedAt,
              updatedAt: archivedAt
            };
            writeRecords(records);
          }
          return hydrateRecord(records[id]);
        },
        async remove(examId) {
          const id = requireIdentifier(examId, "Exam deletion");
          const records = readRecords();
          const existing = records[id];
          if (!existing) return { id, deleted: false };
          if (existing.status !== "archived" || existing.reviewStatus !== "draft") {
            throw new Error("Archive the private draft before deleting it.");
          }
          delete records[id];
          writeRecords(records);
          return { id, deleted: true };
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
          const records = Object.values(readRecords());
          return records
            .filter((record) => includeArchived || record.status !== "archived")
            .flatMap((record) => record.bundle.questions.map((question) => ({
              ...cloneJson(question),
              examStatus: record.status,
              examReviewStatus: record.reviewStatus,
              examVisibility: record.visibility,
              examTitle: String(record.bundle.exam.title || "")
            })))
            .filter((question) => !examId || question.examId === examId)
            .filter((question) => !difficulty || question.difficulty === difficulty)
            .filter((question) => !classificationStatus || question.classificationStatus === classificationStatus)
            .filter((question) => !reviewStatus || question.reviewStatus === reviewStatus)
            .sort((left, right) => left.examId === right.examId
              ? Number(left.position) - Number(right.position)
              : String(left.examId).localeCompare(String(right.examId)));
        },
        async load(questionId) {
          const id = requireIdentifier(questionId, "Question lookup");
          const match = Object.values(readRecords())
            .flatMap((record) => record.bundle.questions.map((question) => ({
              ...cloneJson(question),
              examStatus: record.status,
              examReviewStatus: record.reviewStatus,
              examVisibility: record.visibility,
              examTitle: String(record.bundle.exam.title || "")
            })))
            .find((question) => question.id === id);
          return match || null;
        }
      },
      reviews: {
        async list({ reviewStatus = "pending_review" } = {}) {
          const normalizedStatus = String(reviewStatus || "").trim().toLowerCase();
          if (!ExamContract.REVIEW_STATUSES.includes(normalizedStatus)) {
            throw new TypeError("Unsupported exam review status.");
          }
          return Object.values(readRecords())
            .filter((record) => record.status === "active" && record.reviewStatus === normalizedStatus)
            .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
            .map(hydrateRecord);
        },
        async decide(examId, { decision, notes = "", reviewerId = "local-reviewer" } = {}) {
          const id = requireIdentifier(examId, "Exam review decision");
          const normalizedDecision = String(decision || "").trim().toLowerCase();
          if (!["approved", "changes_requested", "rejected"].includes(normalizedDecision)) {
            throw new TypeError("A review decision must approve, request changes, or reject the exam.");
          }
          const normalizedNotes = String(notes || "").trim();
          if (normalizedDecision !== "approved" && !normalizedNotes) {
            throw new TypeError("Review notes are required when requesting changes or rejecting an exam.");
          }
          const records = readRecords();
          const existing = records[id];
          if (!existing) throw new Error("The exam could not be found.");
          if (existing.status !== "active" || existing.reviewStatus !== "pending_review") {
            throw new Error("Only an exam awaiting review can receive a decision.");
          }
          const reviewedAt = timestamp();
          const visibility = normalizedDecision === "approved" ? "public" : "private";
          records[id] = {
            ...existing,
            reviewStatus: normalizedDecision,
            visibility,
            publicationMode: normalizedDecision === "approved" ? "review_approved" : "private",
            publishedBy: normalizedDecision === "approved" ? String(reviewerId || "local-reviewer") : null,
            publishedAt: normalizedDecision === "approved" ? reviewedAt : null,
            updatedAt: reviewedAt,
            bundle: ExamContract.applyReviewStateToBundle(existing.bundle, {
              reviewStatus: normalizedDecision,
              visibility,
              reviewClassifications: normalizedDecision === "approved"
            })
          };
          writeRecords(records);
          const review = {
            id: `review-${reviewedAt}-${Math.random().toString(16).slice(2)}`,
            examId: id,
            ownerId: String(existing.bundle.exam.madeBy || ""),
            reviewerId: String(reviewerId || "local-reviewer"),
            decision: normalizedDecision,
            notes: normalizedNotes,
            reviewedAt
          };
          const reviews = readReviews();
          reviews.push(review);
          writeReviews(reviews);
          return { exam: hydrateRecord(records[id]), review: cloneJson(review) };
        },
        async history({ examId = null } = {}) {
          return readReviews()
            .filter((review) => !examId || review.examId === examId)
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
      if (overrides?.[domain] && typeof overrides[domain] === "object") {
        merged[domain] = { ...localAdapters[domain], ...overrides[domain] };
      }
    });
    merged.meta = {
      ...(localAdapters.meta || {}),
      ...(overrides?.meta || {}),
      scope: "exams",
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
      scope: "exams",
      contractVersion: CONTRACT_VERSION,
      localAdapters: local
    });
    let overrides = null;
    if (typeof registry.create === "function") {
      overrides = await registry.create("exams", factoryContext);
    } else if (typeof registry.exams === "function") {
      overrides = await registry.exams(factoryContext);
    } else {
      overrides = registry.exams;
    }
    return overrides ? mergeAdapterSets(local, overrides) : local;
  }

  root.KelpExamAdapters = Object.freeze({
    CONTRACT_VERSION,
    DEFAULT_EXAM_STORAGE_KEY,
    DEFAULT_REVIEW_STORAGE_KEY,
    LEGACY_EXAM_STORAGE_KEY,
    LEGACY_META_STORAGE_KEY,
    createLocalAdapters,
    resolveAdapters,
    validateAdapterSet,
    validatePersistenceBundle
  });
})(globalThis);
