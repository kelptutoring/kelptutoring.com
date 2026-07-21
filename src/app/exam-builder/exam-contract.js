(function attachKelpExamContract(root) {
  "use strict";

  const DEFINITION_SCHEMA = "kelp-exam-definition-v1";
  const EDITOR_DRAFT_SCHEMA = "kelp-exam-editor-draft-v1";
  const PERSISTENCE_BUNDLE_SCHEMA = "kelp-exam-persistence-bundle-v1";
  const QUESTION_RECORD_SCHEMA = "kelp-exam-question-record-v1";
  const REVIEW_STATUSES = Object.freeze([
    "draft",
    "pending_review",
    "approved",
    "changes_requested",
    "rejected"
  ]);
  const REVIEW_STATUS_SET = new Set(REVIEW_STATUSES);
  const DIFFICULTIES = Object.freeze([
    "unclassified",
    "very-easy",
    "easy",
    "difficult",
    "very-difficult",
    "challenge"
  ]);
  const DIFFICULTY_SET = new Set(DIFFICULTIES);
  const QUESTION_TYPE_TAGS = Object.freeze([
    "word-problem",
    "numeric",
    "graph",
    "image",
    "true-false",
    "multiple-choice",
    "multiple-answer",
    "short-answer",
    "essay"
  ]);
  const QUESTION_TYPE_TAG_SET = new Set(QUESTION_TYPE_TAGS);
  const PORTABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const EDITOR_QUESTION_FIELDS = Object.freeze([
    "collapsed",
    "basicCollapsed",
    "imageCollapsed",
    "graphCollapsed"
  ]);

  function clone(value) {
    if (typeof root.structuredClone === "function") {
      try {
        return root.structuredClone(value);
      } catch (_) {
        // The document contract contains JSON-safe data, so JSON is a safe fallback.
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function createId(prefix = "item") {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isPortableId(value) {
    return PORTABLE_ID_PATTERN.test(String(value || "").trim());
  }

  function normalizeId(value, prefix = "item") {
    const candidate = String(value || "").trim();
    return isPortableId(candidate) ? candidate : createId(prefix);
  }

  function normalizeDifficulty(value) {
    const candidate = String(value || "").trim().toLowerCase();
    return DIFFICULTY_SET.has(candidate) ? candidate : "unclassified";
  }

  function normalizeQuestionTypeTags(values) {
    const normalized = [];
    const seen = new Set();
    (Array.isArray(values) ? values : []).forEach((value) => {
      const tag = String(value || "").trim().toLowerCase();
      if (!QUESTION_TYPE_TAG_SET.has(tag) || seen.has(tag)) return;
      seen.add(tag);
      normalized.push(tag);
    });
    return normalized;
  }

  function normalizeCurriculumNodeIds(values) {
    const normalized = [];
    const seen = new Set();
    (Array.isArray(values) ? values : []).forEach((value) => {
      const id = String(value || "").trim().toLowerCase();
      if (!UUID_PATTERN.test(id) || seen.has(id)) return;
      seen.add(id);
      normalized.push(id);
    });
    return normalized;
  }

  function normalizePrimaryCurriculumNodeId(value, curriculumNodeIds) {
    const ids = normalizeCurriculumNodeIds(curriculumNodeIds);
    const candidate = String(value || "").trim().toLowerCase();
    if (ids.includes(candidate)) return candidate;
    return ids[0] || "";
  }

  function stripQuestionEditorState(question) {
    const portable = clone(question && typeof question === "object" ? question : {});
    EDITOR_QUESTION_FIELDS.forEach((field) => delete portable[field]);
    delete portable.classification;
    delete portable.provenance;
    return portable;
  }

  function buildDefinition(exam) {
    if (!exam || typeof exam !== "object" || Array.isArray(exam)) {
      throw new TypeError("An exam definition must be an object.");
    }
    const definition = clone(exam);
    definition.schema = DEFINITION_SCHEMA;
    definition.id = normalizeId(definition.id, "exam");
    definition.questions = Array.isArray(definition.questions)
      ? definition.questions.map(stripQuestionEditorState)
      : [];
    delete definition.viewerRole;
    return definition;
  }

  function captureEditorState(exam) {
    const questions = Array.isArray(exam?.questions) ? exam.questions : [];
    return {
      questions: questions.map((question) => ({
        id: String(question?.id || ""),
        collapsed: question?.collapsed !== false,
        basicCollapsed: question?.basicCollapsed !== false,
        imageCollapsed: question?.imageCollapsed !== false,
        graphCollapsed: question?.graphCollapsed !== false
      }))
    };
  }

  function applyEditorState(exam, editorState) {
    const restored = clone(exam && typeof exam === "object" ? exam : {});
    const stateByQuestionId = new Map(
      (Array.isArray(editorState?.questions) ? editorState.questions : [])
        .map((entry) => [String(entry?.id || ""), entry])
    );
    restored.questions = (Array.isArray(restored.questions) ? restored.questions : []).map((question) => {
      const editor = stateByQuestionId.get(String(question?.id || ""));
      if (!editor) return question;
      return {
        ...question,
        collapsed: editor.collapsed !== false,
        basicCollapsed: editor.basicCollapsed !== false,
        imageCollapsed: editor.imageCollapsed !== false,
        graphCollapsed: editor.graphCollapsed !== false
      };
    });
    return restored;
  }

  function buildEditorDraft(exam) {
    return {
      schema: EDITOR_DRAFT_SCHEMA,
      savedAt: new Date().toISOString(),
      definition: buildDefinition(exam),
      editor: captureEditorState(exam)
    };
  }

  function restoreEditorDraft(payload) {
    if (payload?.schema !== EDITOR_DRAFT_SCHEMA) return clone(payload);
    if (!payload.definition || typeof payload.definition !== "object") {
      throw new TypeError("This exam draft does not contain a definition.");
    }
    return applyEditorState(payload.definition, payload.editor);
  }

  function inspectImport(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("The selected file does not contain an exam object.");
    }

    const source = payload.schema === EDITOR_DRAFT_SCHEMA
      ? restoreEditorDraft(payload)
      : clone(payload);
    const schema = String(source.schema || "").trim();
    if (schema && schema !== DEFINITION_SCHEMA) {
      throw new TypeError(`Unsupported exam schema: ${schema}.`);
    }
    if (!Array.isArray(source.questions)) {
      throw new TypeError("The selected file does not contain a questions array.");
    }

    const warnings = [];
    if (!schema) warnings.push("Legacy exam upgraded to the current definition schema.");
    if (!isPortableId(source.id)) warnings.push("The exam identifier was missing or malformed and was replaced.");
    source.schema = DEFINITION_SCHEMA;
    source.id = normalizeId(source.id, "exam");

    const seenQuestionIds = new Set();
    let repairedQuestionIds = 0;
    let repairedDifficulties = 0;
    source.questions = source.questions.map((question) => {
      const repaired = question && typeof question === "object" && !Array.isArray(question)
        ? question
        : {};
      let id = String(repaired.id || "").trim();
      if (!isPortableId(id) || seenQuestionIds.has(id)) {
        repairedQuestionIds += 1;
        do {
          id = createId("q");
        } while (seenQuestionIds.has(id));
      }
      repaired.id = id;
      seenQuestionIds.add(id);

      const rawDifficulty = String(repaired.difficulty || repaired.classification?.difficulty || "").trim().toLowerCase();
      if (!DIFFICULTY_SET.has(rawDifficulty)) {
        repairedDifficulties += 1;
        repaired.difficulty = "unclassified";
        repaired.classificationStatus = "unclassified";
      } else {
        repaired.difficulty = rawDifficulty;
      }
      repaired.questionTypeTags = normalizeQuestionTypeTags(repaired.questionTypeTags);
      repaired.curriculumNodeIds = normalizeCurriculumNodeIds(repaired.curriculumNodeIds);
      repaired.primaryCurriculumNodeId = normalizePrimaryCurriculumNodeId(
        repaired.primaryCurriculumNodeId,
        repaired.curriculumNodeIds
      );
      return repaired;
    });
    if (repairedQuestionIds) {
      warnings.push(`${repairedQuestionIds} question identifier${repairedQuestionIds === 1 ? " was" : "s were"} repaired.`);
    }
    if (repairedDifficulties) {
      warnings.push(`${repairedDifficulties} question difficult${repairedDifficulties === 1 ? "y was" : "ies were"} set to Unclassified.`);
    }

    return { definition: source, warnings };
  }

  function createIndependentCopy(exam) {
    const source = buildDefinition(exam);
    const now = new Date().toISOString();
    return {
      ...source,
      schema: DEFINITION_SCHEMA,
      id: createId("exam"),
      createdAt: now,
      updatedAt: now,
      questions: source.questions.map((question) => {
        const sourceQuestionId = normalizeId(question.id, "q");
        const difficulty = normalizeDifficulty(question.difficulty);
        return {
          ...question,
          id: createId("q"),
          copiedFromQuestionId: sourceQuestionId,
          difficulty,
          classificationStatus: difficulty === "unclassified" ? "unclassified" : "proposed"
        };
      })
    };
  }

  function normalizeClassificationStatus(value, difficulty) {
    const normalizedDifficulty = normalizeDifficulty(difficulty);
    if (normalizedDifficulty === "unclassified") return "unclassified";
    const candidate = String(value || "").trim().toLowerCase();
    return candidate === "reviewed" ? "reviewed" : "proposed";
  }

  function buildPersistenceBundle(exam) {
    const definition = buildDefinition(exam);
    const questionIds = definition.questions.map((question) => String(question.id || ""));
    if (new Set(questionIds).size !== questionIds.length || questionIds.some((id) => !isPortableId(id))) {
      throw new TypeError("An exam bundle requires unique, portable question IDs.");
    }

    const examRecord = clone(definition);
    delete examRecord.questions;
    examRecord.questionIds = [...questionIds];

    return {
      schema: PERSISTENCE_BUNDLE_SCHEMA,
      exam: examRecord,
      workflow: {
        reviewStatus: "draft",
        visibility: "private"
      },
      questions: definition.questions.map((question, position) => {
        const difficulty = normalizeDifficulty(question.difficulty);
        const questionTypeTags = normalizeQuestionTypeTags(question.questionTypeTags);
        const curriculumNodeIds = normalizeCurriculumNodeIds(question.curriculumNodeIds);
        const primaryCurriculumNodeId = normalizePrimaryCurriculumNodeId(
          question.primaryCurriculumNodeId,
          curriculumNodeIds
        );
        const classificationStatus = normalizeClassificationStatus(
          question.classificationStatus,
          difficulty
        );
        const hasCopyProvenance = Object.prototype.hasOwnProperty.call(question, "copiedFromQuestionId");
        return {
          schema: QUESTION_RECORD_SCHEMA,
          id: question.id,
          examId: definition.id,
          position,
          createdBy: String(definition.madeBy || ""),
          copiedFromQuestionId: hasCopyProvenance ? String(question.copiedFromQuestionId || "") : null,
          difficulty,
          questionTypeTags,
          curriculumNodeIds,
          primaryCurriculumNodeId,
          classificationStatus,
          reviewStatus: "draft",
          content: {
            ...stripQuestionEditorState(question),
            id: question.id,
            difficulty,
            questionTypeTags,
            curriculumNodeIds,
            primaryCurriculumNodeId,
            classificationStatus
          }
        };
      })
    };
  }

  function restoreDefinitionFromBundle(bundle) {
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
      throw new TypeError("An exam persistence bundle must be an object.");
    }
    if (bundle.schema !== PERSISTENCE_BUNDLE_SCHEMA) {
      throw new TypeError(`Unsupported exam persistence schema: ${String(bundle.schema || "missing")}.`);
    }
    if (!bundle.exam || typeof bundle.exam !== "object" || Array.isArray(bundle.exam)) {
      throw new TypeError("The exam persistence bundle does not contain exam metadata.");
    }
    if (!Array.isArray(bundle.questions)) {
      throw new TypeError("The exam persistence bundle does not contain question records.");
    }

    const examId = String(bundle.exam.id || "").trim();
    if (!isPortableId(examId)) {
      throw new TypeError("The exam persistence bundle contains an invalid exam ID.");
    }
    const recordsById = new Map();
    bundle.questions.forEach((record) => {
      if (record?.schema !== QUESTION_RECORD_SCHEMA) {
        throw new TypeError("The exam persistence bundle contains an unsupported question record.");
      }
      const id = String(record.id || "").trim();
      if (!isPortableId(id) || recordsById.has(id)) {
        throw new TypeError("The exam persistence bundle contains a missing or duplicate question ID.");
      }
      if (String(record.examId || "") !== examId) {
        throw new TypeError("A question record points to a different exam.");
      }
      recordsById.set(id, record);
    });

    const requestedOrder = Array.isArray(bundle.exam.questionIds)
      ? bundle.exam.questionIds.map((id) => String(id || ""))
      : [...bundle.questions]
        .sort((left, right) => Number(left?.position || 0) - Number(right?.position || 0))
        .map((record) => String(record?.id || ""));
    if (requestedOrder.length !== recordsById.size || new Set(requestedOrder).size !== requestedOrder.length) {
      throw new TypeError("The exam question order does not match its question records.");
    }

    const definition = clone(bundle.exam);
    delete definition.questionIds;
    definition.schema = DEFINITION_SCHEMA;
    definition.id = examId;
    definition.questions = requestedOrder.map((questionId) => {
      const record = recordsById.get(questionId);
      if (!record) throw new TypeError(`Question record not found: ${questionId}.`);
      const difficulty = normalizeDifficulty(record.difficulty);
      const restoredQuestion = {
        ...clone(record.content || {}),
        id: questionId,
        difficulty,
        questionTypeTags: normalizeQuestionTypeTags(
          record.questionTypeTags || record.content?.questionTypeTags
        ),
        curriculumNodeIds: normalizeCurriculumNodeIds(
          record.curriculumNodeIds || record.content?.curriculumNodeIds
        ),
        classificationStatus: normalizeClassificationStatus(record.classificationStatus, difficulty)
      };
      restoredQuestion.primaryCurriculumNodeId = normalizePrimaryCurriculumNodeId(
        record.primaryCurriculumNodeId || record.content?.primaryCurriculumNodeId,
        restoredQuestion.curriculumNodeIds
      );
      if (record.copiedFromQuestionId !== null && record.copiedFromQuestionId !== undefined) {
        restoredQuestion.copiedFromQuestionId = String(record.copiedFromQuestionId || "");
      } else {
        delete restoredQuestion.copiedFromQuestionId;
      }
      return restoredQuestion;
    });
    return buildDefinition(definition);
  }

  function applyReviewStateToBundle(bundle, {
    reviewStatus,
    visibility = "private",
    reviewClassifications = false,
    proposeClassifications = false
  } = {}) {
    restoreDefinitionFromBundle(bundle);
    const normalizedReviewStatus = String(reviewStatus || "").trim().toLowerCase();
    if (!REVIEW_STATUS_SET.has(normalizedReviewStatus)) {
      throw new TypeError("Unsupported exam review status.");
    }
    const normalizedVisibility = String(visibility || "").trim().toLowerCase();
    if (!new Set(["private", "public"]).has(normalizedVisibility)) {
      throw new TypeError("Unsupported exam visibility.");
    }
    if (normalizedVisibility === "public" && normalizedReviewStatus !== "approved") {
      throw new TypeError("Only an approved exam can become public.");
    }

    const updated = clone(bundle);
    updated.workflow = {
      reviewStatus: normalizedReviewStatus,
      visibility: normalizedVisibility
    };
    updated.questions = updated.questions.map((question) => {
      const difficulty = normalizeDifficulty(question.difficulty);
      let classificationStatus = normalizeClassificationStatus(
        question.classificationStatus,
        difficulty
      );
      if (reviewClassifications) {
        if (difficulty === "unclassified") {
          throw new TypeError("Every question needs a proposed difficulty before approval.");
        }
        classificationStatus = "reviewed";
      } else if (proposeClassifications) {
        classificationStatus = difficulty === "unclassified" ? "unclassified" : "proposed";
      }
      return {
        ...question,
        difficulty,
        classificationStatus,
        reviewStatus: normalizedReviewStatus,
        content: {
          ...clone(question.content || {}),
          difficulty,
          classificationStatus
        }
      };
    });
    return updated;
  }

  root.KelpExamContract = Object.freeze({
    DEFINITION_SCHEMA,
    EDITOR_DRAFT_SCHEMA,
    PERSISTENCE_BUNDLE_SCHEMA,
    QUESTION_RECORD_SCHEMA,
    QUESTION_TYPE_TAGS,
    REVIEW_STATUSES,
    applyReviewStateToBundle,
    DIFFICULTIES,
    applyEditorState,
    buildDefinition,
    buildEditorDraft,
    buildPersistenceBundle,
    captureEditorState,
    createId,
    createIndependentCopy,
    inspectImport,
    isPortableId,
    normalizeDifficulty,
    normalizeQuestionTypeTags,
    normalizeCurriculumNodeIds,
    normalizePrimaryCurriculumNodeId,
    normalizeId,
    restoreDefinitionFromBundle,
    restoreEditorDraft,
    stripQuestionEditorState
  });
})(typeof window !== "undefined" ? window : globalThis);
