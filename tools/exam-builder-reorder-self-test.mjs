import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const toolsRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsRoot, "..");
const examRoot = path.join(projectRoot, "src", "app", "exam-builder");
const [html, javascript, styles, takerHtml, takerJavascript, contractJavascript, adapterJavascript] = await Promise.all([
  fs.readFile(path.join(examRoot, "exam-builder.html"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-builder.js"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-builder.css"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-taker.html"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-taker.js"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-contract.js"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-adapters.js"), "utf8")
]);

assert.match(html, /data-question-card/);
assert.match(html, /data-question-drag-handle/);
assert.match(javascript, /is-question-drop-before/);
assert.match(javascript, /is-question-drop-after/);
assert.match(javascript, /event\.clientY[\s\S]*?targetCard\.offsetHeight \/ 2/);
assert.match(javascript, /reorderQuestion\(sourceId, targetCard\.dataset\.questionId, placement\)/);
assert.match(javascript, /addEventListener\("dragleave"/);
assert.match(styles, /\.exam-builder-body \.exam-question-card\.is-question-drop-before::before\s*\{[\s\S]*?top:\s*0;/);
assert.match(styles, /\.exam-builder-body \.exam-question-card\.is-question-drop-after::after\s*\{[\s\S]*?bottom:\s*0;/);
assert.match(styles, /\.exam-builder-body \.exam-question-card\.is-question-dragging\s*\{[\s\S]*?opacity:\s*0\.45;/);

assert.match(html, /<select data-field="difficulty">[\s\S]*?<option value="unclassified">Unclassified<\/option>[\s\S]*?<option value="challenge">Challenge<\/option>/);
assert.match(html, /data-question-difficulty-badge/);
assert.match(javascript, /const QUESTION_DIFFICULTIES = new Set\(EXAM_CONTRACT\.DIFFICULTIES\);/);
assert.match(javascript, /difficulty:\s*"unclassified"/);
assert.match(javascript, /classificationStatus:\s*"unclassified"/);
assert.match(javascript, /copiedFromQuestionId:\s*question\.id/);
assert.match(javascript, /difficultyCounts\[normalizeQuestionDifficulty\(question\.difficulty\)\] \+= 1/);
assert.match(styles, /\.exam-question-difficulty-badge\[data-difficulty="challenge"\]/);
assert.doesNotMatch(takerHtml, /data-question-difficulty-badge|data-field="difficulty"/);
assert.doesNotMatch(takerJavascript, /questionDifficultyLabel|classificationStatus/);

assert.match(html, /<script src="\.\/exam-contract\.js[^>]*><\/script>[\s\S]*?<script src="\.\/exam-builder\.js/);
assert.match(html, /<script src="\.\/exam-contract\.js[^>]*><\/script>[\s\S]*?<script src="\.\/exam-adapters\.js[^>]*><\/script>[\s\S]*?<script src="\.\/exam-builder\.js/);
assert.match(html, />Import as copy</);
assert.match(javascript, /buildExamDefinitionDocument\(state\)/);
assert.match(javascript, /buildExamEditorDraft\(state\)/);
assert.match(javascript, /EXAM_CONTRACT\.createIndependentCopy/);
assert.match(javascript, /EXAM_CONTRACT\.inspectImport/);
assert.match(javascript, /EXAM_ADAPTER_DOMAIN\.createLocalAdapters/);
assert.match(javascript, /adapters\.exams\.save\(bundle\)/);
assert.match(javascript, /adapters\.exams\.list\(\)/);
assert.match(javascript, /adapters\.exams\.submitForReview\(examId\)/);
assert.match(javascript, /data-exam-library-action="submit-review"/);
assert.match(javascript, /pending_review:\s*"Pending review"/);

let generatedId = 0;
const contractContext = {
  structuredClone,
  crypto: {
    randomUUID() {
      generatedId += 1;
      return `00000000-0000-4000-8000-${String(generatedId).padStart(12, "0")}`;
    }
  }
};
contractContext.globalThis = contractContext;
vm.createContext(contractContext);
vm.runInContext(contractJavascript, contractContext);
const contract = contractContext.KelpExamContract;
const plain = (value) => JSON.parse(JSON.stringify(value));
const editorExam = {
  schema: contract.DEFINITION_SCHEMA,
  id: "exam-source",
  title: "Portable contract test",
  viewerRole: "teacher",
  questions: [{
    id: "q-source-1",
    prompt: "Classify this question",
    difficulty: "easy",
    classificationStatus: "proposed",
    collapsed: false,
    basicCollapsed: true,
    imageCollapsed: false,
    graphCollapsed: true
  }]
};

const definition = contract.buildDefinition(editorExam);
assert.equal(definition.schema, "kelp-exam-definition-v1");
assert.equal(definition.id, editorExam.id);
assert.equal(definition.questions[0].id, editorExam.questions[0].id);
assert.equal(definition.questions[0].difficulty, "easy");
assert.equal("viewerRole" in definition, false);
for (const editorField of ["collapsed", "basicCollapsed", "imageCollapsed", "graphCollapsed"]) {
  assert.equal(editorField in definition.questions[0], false);
}

const editorDraft = contract.buildEditorDraft(editorExam);
assert.equal(editorDraft.schema, "kelp-exam-editor-draft-v1");
assert.equal("collapsed" in editorDraft.definition.questions[0], false);
const restoredDraft = contract.restoreEditorDraft(editorDraft);
assert.equal(restoredDraft.questions[0].collapsed, false);
assert.equal(restoredDraft.questions[0].basicCollapsed, true);
assert.deepEqual(
  plain(contract.buildDefinition(restoredDraft)),
  plain(contract.buildDefinition(editorExam))
);

const inspection = contract.inspectImport({
  id: "bad id with spaces",
  questions: [
    { id: "repeated-id", difficulty: "easy" },
    { id: "repeated-id", difficulty: "impossible" }
  ]
});
assert.equal(inspection.definition.schema, contract.DEFINITION_SCHEMA);
assert.notEqual(inspection.definition.id, "bad id with spaces");
assert.notEqual(inspection.definition.questions[0].id, inspection.definition.questions[1].id);
assert.equal(inspection.definition.questions[1].difficulty, "unclassified");
assert.match(inspection.warnings.join(" "), /Legacy exam upgraded/);
assert.match(inspection.warnings.join(" "), /question identifier/);
assert.match(inspection.warnings.join(" "), /Unclassified/);

const independentCopy = contract.createIndependentCopy(definition);
assert.notEqual(independentCopy.id, definition.id);
assert.notEqual(independentCopy.questions[0].id, definition.questions[0].id);
assert.equal(independentCopy.questions[0].copiedFromQuestionId, definition.questions[0].id);
assert.equal(independentCopy.questions[0].difficulty, "easy");
assert.equal(independentCopy.questions[0].classificationStatus, "proposed");
assert.throws(
  () => contract.inspectImport({ schema: "kelp-exam-definition-v99", questions: [] }),
  /Unsupported exam schema/
);

const persistenceBundle = contract.buildPersistenceBundle(definition);
assert.equal(persistenceBundle.schema, "kelp-exam-persistence-bundle-v1");
assert.equal(persistenceBundle.workflow.reviewStatus, "draft");
assert.equal(persistenceBundle.workflow.visibility, "private");
assert.deepEqual(plain(persistenceBundle.exam.questionIds), ["q-source-1"]);
assert.equal("questions" in persistenceBundle.exam, false);
assert.equal(persistenceBundle.questions[0].schema, "kelp-exam-question-record-v1");
assert.equal(persistenceBundle.questions[0].examId, definition.id);
assert.equal(persistenceBundle.questions[0].position, 0);
assert.equal(persistenceBundle.questions[0].difficulty, "easy");
assert.equal(persistenceBundle.questions[0].classificationStatus, "proposed");
assert.equal(persistenceBundle.questions[0].reviewStatus, "draft");
assert.deepEqual(plain(persistenceBundle.questions[0].questionTypeTags), []);
assert.deepEqual(plain(persistenceBundle.questions[0].curriculumNodeIds), []);
assert.equal(persistenceBundle.questions[0].primaryCurriculumNodeId, "");
const normalizedDefinition = plain(contract.restoreDefinitionFromBundle(persistenceBundle));
assert.deepEqual(
  normalizedDefinition,
  plain({
    ...definition,
    questions: definition.questions.map((question) => ({
      ...question,
      questionTypeTags: [],
      curriculumNodeIds: [],
      primaryCurriculumNodeId: ""
    }))
  })
);
const pendingBundle = contract.applyReviewStateToBundle(persistenceBundle, {
  reviewStatus: "pending_review",
  visibility: "private",
  proposeClassifications: true
});
assert.equal(pendingBundle.workflow.reviewStatus, "pending_review");
assert.equal(pendingBundle.questions[0].classificationStatus, "proposed");
const approvedBundle = contract.applyReviewStateToBundle(pendingBundle, {
  reviewStatus: "approved",
  visibility: "public",
  reviewClassifications: true
});
assert.equal(approvedBundle.workflow.visibility, "public");
assert.equal(approvedBundle.questions[0].reviewStatus, "approved");
assert.equal(approvedBundle.questions[0].classificationStatus, "reviewed");
assert.equal(approvedBundle.questions[0].content.classificationStatus, "reviewed");
assert.throws(
  () => contract.applyReviewStateToBundle(persistenceBundle, { reviewStatus: "draft", visibility: "public" }),
  /Only an approved exam can become public/
);

vm.runInContext(adapterJavascript, contractContext);
const adapterDomain = contractContext.KelpExamAdapters;
const storageRecords = new Map();
const memoryStorage = {
  getItem(key) {
    return storageRecords.has(key) ? storageRecords.get(key) : null;
  },
  setItem(key, value) {
    storageRecords.set(key, String(value));
  }
};
let adapterNowIndex = 0;
const localAdapters = adapterDomain.createLocalAdapters({
  storage: memoryStorage,
  now: () => `2026-07-18T12:00:0${adapterNowIndex++}.000Z`
});
const savedRecord = await localAdapters.exams.save(persistenceBundle);
assert.equal(savedRecord.status, "active");
assert.equal(savedRecord.reviewStatus, "draft");
assert.equal(savedRecord.visibility, "private");
assert.deepEqual(plain(savedRecord.definition), normalizedDefinition);
assert.equal((await localAdapters.exams.list()).length, 1);
assert.deepEqual(
  plain((await localAdapters.exams.load(definition.id)).definition),
  normalizedDefinition
);
const easyQuestions = await localAdapters.questions.list({ difficulty: "easy" });
assert.equal(easyQuestions.length, 1);
assert.equal(easyQuestions[0].id, "q-source-1");
assert.equal(easyQuestions[0].examTitle, definition.title);
assert.equal((await localAdapters.questions.list({ difficulty: "challenge" })).length, 0);
const collidingDefinition = { ...definition, id: "exam-with-colliding-question" };
await assert.rejects(
  () => localAdapters.exams.save(contract.buildPersistenceBundle(collidingDefinition)),
  /question ID is already owned by another exam/
);
await localAdapters.exams.archive(definition.id);
assert.equal((await localAdapters.questions.list()).length, 0);
assert.equal((await localAdapters.questions.list({ includeArchived: true })).length, 1);
await assert.rejects(() => localAdapters.exams.save(persistenceBundle), /Archived exams cannot be overwritten/);
assert.deepEqual(plain(await localAdapters.exams.remove(definition.id)), { id: definition.id, deleted: true });
assert.equal((await localAdapters.exams.list()).length, 0);

await localAdapters.exams.save(persistenceBundle);
const submittedRecord = await localAdapters.exams.submitForReview(definition.id);
assert.equal(submittedRecord.reviewStatus, "pending_review");
assert.equal((await localAdapters.reviews.list()).length, 1);
await assert.rejects(() => localAdapters.exams.save(persistenceBundle), /under review or already reviewed/);
const localDecision = await localAdapters.reviews.decide(definition.id, {
  decision: "approved",
  notes: "Classification and content reviewed.",
  reviewerId: "mentor-local-1"
});
assert.equal(localDecision.exam.reviewStatus, "approved");
assert.equal(localDecision.exam.visibility, "public");
assert.equal(localDecision.exam.definition.questions[0].classificationStatus, "reviewed");
assert.equal(localDecision.review.reviewerId, "mentor-local-1");
assert.equal((await localAdapters.reviews.history({ examId: definition.id })).length, 1);
await assert.rejects(() => localAdapters.exams.archive(definition.id), /Only a private draft can be archived/);

const legacyStorageRecords = new Map([
  [adapterDomain.LEGACY_EXAM_STORAGE_KEY, JSON.stringify([definition])],
  [adapterDomain.LEGACY_META_STORAGE_KEY, JSON.stringify({
    [definition.id]: {
      status: "active",
      createdAt: "2026-07-18T11:00:00.000Z",
      updatedAt: "2026-07-18T11:30:00.000Z"
    }
  })]
]);
const legacyStorage = {
  getItem(key) {
    return legacyStorageRecords.has(key) ? legacyStorageRecords.get(key) : null;
  },
  setItem(key, value) {
    legacyStorageRecords.set(key, String(value));
  }
};
const migrationAdapters = adapterDomain.createLocalAdapters({ storage: legacyStorage });
const migratedRecords = await migrationAdapters.exams.list();
assert.equal(migratedRecords.length, 1);
assert.deepEqual(plain(migratedRecords[0].definition), normalizedDefinition);
assert.equal(legacyStorageRecords.has(adapterDomain.DEFAULT_EXAM_STORAGE_KEY), true);

console.log("Exam builder reorder, metadata, persistence bundle, and adapter self-test passed.");
