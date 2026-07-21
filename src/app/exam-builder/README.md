# Exam builder

## Function

The exam builder is a browser-based authoring, delivery, grading, and results tool. Tutors create exams with text, images, mathematical notation, numeric rules, and reusable diagrams; reorder questions with buttons or drag-and-drop; preview the student experience; export/import exam JSON; print exam PDFs; and save exams to a local library. Students take the active exam one question at a time, after which auto-gradable responses are scored and written answers are marked for tutor review.

The implementation is framework-free HTML, CSS, and JavaScript. Browser storage is the current provider, but the builder now persists through a replaceable adapter boundary. Portable exam definitions, normalized exam/question bundles, results, and submissions have explicit versioned contracts.

## Entry pages and main files

- `exam-builder.html` / `exam-builder.js`: tutor authoring, live preview, ordering, draft/library persistence, JSON import/export, and printable exam.
- `exam-review.html` / `exam-review.js`: mentor/admin queue, read-only submission inspection, trusted decisions, and audit history.
- `exam-contract.js`: portable definitions, editor-draft wrapping, independent copies, import repair, and normalized persistence bundles.
- `exam-adapters.js`: local exam/question persistence plus the provider-resolution boundary.
- `exam-supabase-adapters.js` / `exam-supabase-provider.js`: authenticated Supabase implementation used over HTTP(S).
- `supabase/migrations/202607180001_exam_library.sql`: transactional exam/question storage, lifecycle constraints, RLS, and grants.
- `supabase/migrations/202607180002_exam_review_workflow.sql`: tutor submission, mentor/admin decisions, classification confirmation, and review audit history.
- `supabase/migrations/202607180003_multi_role_authorization.sql`: cumulative role assignments, capability-based authorization, credentials, and role audit history.
- `supabase/migrations/202607180004_content_publication.sql`: independent-review enforcement, privileged direct publication, immutable publication metadata, and generic publication audit events.
- `supabase/migrations/202607180006_question_bank.sql`: reusable question categories, curriculum links, classification gates, and capability-protected bank retrieval.
- `exam-taker.html` / `exam-taker.js`: student profile resolution, timed delivery, response collection, auto-grading, result creation, and submission payload.
- `exam-results.html` / `exam-results.js`: score summary, per-question review, result printing, and teacher/student visibility.
- `exam-answer-key.html` / `exam-answer-key.js`: answer-key view for a saved result.
- `exam-builder.css`: shared builder, taker, result, print, drag-indicator, and transition styles.
- `kelp-diagram-editor.js` / `kelp-diagram-editor.css`: shared canvas diagram/graph editor and renderer.
- `kelp-numeric-answer.js`: safe numeric expression normalization and grading.
- `test-fixtures/exam-builder-comprehensive-test.json`: portable exam covering the current question/media/diagram feature set.

The pages load MathJax and/or Math.js from `cdn.jsdelivr.net`. Serve the repository over HTTP and allow network access, or bundle those dependencies before offline deployment.

## Authoring workflow

1. Enter exam metadata: title, subject, instructions, duration, title color, and stripe color.
2. Add questions, choose a question type, and propose its difficulty.
3. Choose the most precise curriculum track/topic and review the overlapping question-bank categories. Structural categories are selected automatically; tutors may add semantic labels such as Word problem.
4. Enter the prompt, points, answer settings, and optional text/LaTeX around attached media.
5. For option questions, configure text, image, or graph choices and select the correct option(s).
6. For numeric questions, configure the expected expression, exact/tolerance grading, angle mode, and optional required unit.
7. Attach a question-body image or open the diagram editor for graphs, geometry, measurements, labels, and circuit objects.
8. Collapse sections for compact editing, reorder questions with arrows or drag-and-drop, and verify the live preview.
9. Save a draft, save to the library, export JSON, review the friendly Exam structure overview, print, or open the student view.
10. After every question has a proposed difficulty, curriculum path, and at least one category, submit the saved private draft for mentor/administrator review. The submitted record is locked; later revisions begin from Open as copy.
11. A mentor or administrator opens Exam review from the workspace, inspects the immutable copy, and approves, requests changes, or rejects it. Change requests and rejections require notes.
12. The student view stores the selected exam as the active exam, collects answers until submission/timeout, grades supported types, and opens the results page.

Returning from the student preview can restore the same builder exam through `kelp-exam-builder-return-v1`.

## Supported question types

- `multiple-choice`, including text, image, and graph option variants.
- `multiple-answer`, including text, image, and graph option variants with partial credit.
- `true-false`.
- `numeric`, graded by the shared numeric engine.
- `short-answer`, retained for tutor review.
- `essay`, retained for tutor review.

Legacy `multiple-choice-text` and `multiple-answer-text` values normalize to their base types. Image and graph variants remain explicit because their option payloads differ.

## Exam data

The builder's top-level object is:

```js
{
  schema: "kelp-exam-definition-v1",
  id,
  title,
  madeBy,
  subject,
  instructions,
  durationMinutes,
  titleColor,
  stripeColor,
  questions: [],
  createdAt,
  updatedAt
}
```

Until authenticated tutor ownership is wired, `madeBy` uses `__KELP_TUTOR_PLACEHOLDER__`. Replace it server-side with the authenticated tutor/user ID; do not accept an arbitrary browser-supplied owner as authoritative.

A normalized question contains the fields needed across all question families:

```js
{
  id,
  copiedFromQuestionId,
  difficulty,
  classificationStatus,
  questionTypeTags,
  curriculumNodeIds,
  primaryCurriculumNodeId,
  name,
  type,
  prompt,
  points,
  answer,
  options,
  optionGraphs,
  optionImages,
  correctOptionIndex,
  correctOptionIndexes,
  imageBeforeText,
  imageData,
  imageAlt,
  imageAfterText,
  graphBeforeText,
  graphAfterText,
  graph,
  pdfAnswerSpaceSize,
  pdfAnswerSpaceCustomMm,
  numericExpectedAnswer,
  numericExactMatch,
  numericTolerance,
  numericAngleMode,
  numericRequireUnit,
  numericUnit
}
```

Fields irrelevant to the selected type remain present with neutral defaults. `difficulty` is one of `unclassified`, `very-easy`, `easy`, `difficult`, `very-difficult`, or `challenge`. Tutors create `proposed` classifications; mentor/administrator approval changes them to `reviewed`. `questionTypeTags` supports overlapping structural/semantic categories. The current builder supplies one primary curriculum track/topic, while the array contract and link table allow future multi-node classification.

The portable definition never includes the editor's collapse state or the temporary teacher-view marker. Browser drafts use `kelp-exam-editor-draft-v1`, which stores the portable definition and its editor-only state separately. Older raw drafts still load through the legacy normalization path.

## Persistence bundle and question records

`KelpExamContract.buildPersistenceBundle(definition)` creates `kelp-exam-persistence-bundle-v1`. It is normalized for storing the exam and querying questions independently:

```js
{
  schema: "kelp-exam-persistence-bundle-v1",
  exam: {
    ...examMetadata,
    questionIds: ["question-id-in-student-order"]
  },
  workflow: {
    reviewStatus: "draft",
    visibility: "private"
  },
  questions: [{
    schema: "kelp-exam-question-record-v1",
    id,
    examId,
    position,
    createdBy,
    copiedFromQuestionId,
    difficulty,
    classificationStatus,
    questionTypeTags,
    curriculumNodeIds,
    primaryCurriculumNodeId,
    reviewStatus: "draft",
    content: { /* complete portable question */ }
  }]
}
```

`restoreDefinitionFromBundle` validates ownership, IDs, record schemas, and ordering before rebuilding the portable definition. The round trip is lossless. This gives a future course builder separately queryable question records without forcing the exam builder to author questions on a second page.

New records are always private drafts. Tutors and teachers can submit a completely classified draft but cannot publish, approve, reject, or mark classifications as reviewed. A different mentor/administrator decides submitted work. Mentor/admin authors may instead publish their own draft directly through a protected capability-specific RPC. Backend code derives `createdBy`/ownership from the authenticated user rather than trusting `madeBy` from the browser.

The review lifecycle is:

```text
draft/private -> pending_review/private -> approved/public
                                      |-> changes_requested/private
                                      |-> rejected/private
draft/private -> approved/public (owned mentor/admin draft only)
```

Any transition out of `draft` locks that saved record. Even a changes-requested or rejected record is revised by opening it as a new independent copy. This avoids changing the content underneath a completed review or future assignment.

## Exam persistence adapters

`exam-adapters.js` defines contract version `1`:

```js
{
  exams: {
    list({ status, reviewStatus }),
    load(examId),
    save(persistenceBundle),
    submitForReview(examId),
    publish(examId, { notes }),
    archive(examId),
    remove(examId)
  },
  questions: {
    list({ examId, difficulty, classificationStatus, reviewStatus, includeArchived }),
    load(questionId)
  },
  reviews: {
    list({ reviewStatus }),
    decide(examId, { decision, notes }),
    history({ examId })
  }
}
```

Methods are asynchronous. `resolveAdapters` can merge a provider registered at `window.KelpBackendAdapters.exams` with the complete local implementation, so a backend can be introduced incrementally. The local provider enforces archive-before-delete and prevents archived or reviewed records from being overwritten.

### Provider resolution

The HTML entry point loads the portable contract and local adapters first, then exposes `window.KelpExamProviderReady`:

- `file://`: local browser provider.
- HTTP(S): the Supabase provider is installed by default.
- An explicitly registered `window.KelpBackendAdapters.exams` provider is never replaced.
- If the hosted-provider module cannot be initialized, the builder retains the local provider and labels the fallback in My exams.

The local adapter stores normalized records under `kelp:exams:v1:records` and review audit entries under `kelp:exams:v1:reviews`. On first read it migrates valid records from the earlier `kelp-exam-library-v1` array and its metadata key. Invalid legacy entries are left untouched for manual recovery.

### Supabase storage

The Supabase provider uses:

- `exam_definitions`: owner-scoped lifecycle, review state, visibility, and canonical persistence bundle.
- `exam_questions`: independently indexed question content and classification fields.
- `exam_question_records`: a security-invoker view joining question records with exam lifecycle metadata.
- `exam_question_curriculum_links`: stable many-to-many links between reusable questions and canonical track/topic nodes.
- `exam_reviews`: append-only mentor/administrator decision history, retained independently of a foreign-key cascade.
- `save_exam_draft(jsonb)`: the only tutor-facing definition write path.
- `submit_exam_for_review(text)`: owner-only transition from a classified private draft to the locked review queue.
- `review_exam(text, text, text)`: mentor/admin-only approval, change-request, or rejection decision.
- `publish_exam(text, text)`: owner-only direct publication for an authenticated user with `exam.publish`.
- `content_publication_events`: append-only audit distinction between `review_approved` and `privileged_direct` publication.
- `search_question_bank(...)`: mentor/admin-only paginated retrieval for approved questions, with descendant curriculum, difficulty, category, and text filters.
- `get_question_bank_item(text)`: mentor/admin-only complete inspection of one approved reusable question.

`save_exam_draft` updates the definition and its question rows in one transaction. It derives the owner and timestamps from the authenticated request, forces the exam and questions to `draft`/`private`, reduces every classified tutor claim to `proposed`, validates order and ownership, and rejects a question ID already owned by another exam.

RLS lets owners read their records and lets mentors/admins read the review queue and related questions. Direct table permissions allow only reading, archiving an active private draft, and deleting an archived private draft. Definition/question inserts and content updates go through trusted RPCs. The browser receives no direct permission to change `review_status`, `visibility`, or a question's reviewed classification.

Review submission or privileged direct publication is rejected unless every question has a proposed difficulty, at least one supported category, and an active track/topic. Approval or privileged direct publication changes all proposed question and curriculum-link classifications to `reviewed` and marks the definition as `public`. Here, public means eligible for the mentor/admin question bank and future assignment workflows. It does **not** grant students direct access to the stored bundle, because that document contains answer keys. Student delivery must use a later assignment/access service that returns an authorized student-safe projection.

`exam-review.html` is the standalone Phase 6 review surface. Over HTTP(S), it requires the `exam.review` capability, refuses an untrusted local fallback, and delegates decisions to the protected `review_exam` RPC. The shared tutor workspace reveals its link when the same capability is present. Direct `file://` use is an explicitly labeled local review sandbox for UI testing.

The reviewer sees the submission metadata, student order, prompts, answer keys, response settings, tutor-proposed difficulty, curriculum path, question categories, stable question IDs, media indicators, and append-only review history. Exam content is never editable on this page. Approval confirms proposed classifications and makes the immutable record catalog-eligible; assignment and student-safe delivery remain separate future workflows.

Images are currently embedded as Base64/data URLs. The builder warns when the active online-render payload exceeds 10 MB. Production storage should move images to object storage and replace them with durable authorized URLs or file IDs.

## Diagram data

Question body diagrams live in `question.graph`; option diagrams live in `question.optionGraphs`. `window.KelpDiagramEditor` provides normalization and canvas rendering so the builder preview, taker, results, and print views share the same interpretation.

Graphs can contain functions, points, segments, distance measurements, angles, regular/irregular shapes, circles, ellipses, trapezoids, parallelograms, labels, and circuit symbols. The first function is mirrored into legacy singular function fields for backward compatibility. Preserve unknown graph fields during backend round trips.

## Exam-structure overview

The Exam structure action renders a tutor-friendly modal with counts, formats, difficulty coverage, structural warnings, student order, and media use. Internally, `buildExamStructure` creates the following summary for rendering and characterization tests; it is not the persistence contract:

```js
{
  schema: "kelp-exam-structure-v1",
  generatedAt,
  madeBy,
  examName,
  date,
  subject,
  instructions,
  timeMinutes,
  questionCount,
  questionCounts: {
    multipleChoiceText,
    multipleChoiceImage,
    multipleChoiceGraph,
    multipleAnswerText,
    multipleAnswerImage,
    multipleAnswerGraph,
    trueFalse,
    numericAnswer,
    shortAnswer,
    longAnswer
  },
  imageCount,
  graphCount,
  maximumGraphObjectCount,
  graphWithMostObjects,
  allGraphs
}
```

Each graph summary records its question/location plus object counts. Text labels are intentionally excluded from graph-object totals.

## Result and submission data

On submission, `gradeExam` creates a detailed result with exam/student metadata, timestamps, duration, score aggregates, and one normalized item per question. Auto-gradable types are multiple choice, multiple answer, true/false, and numeric when the numeric engine can grade the expression. Short and essay answers receive `status: "review"` and contribute to `reviewNeeded` rather than the automatic percentage.

The result also contains a backend-oriented summary:

```js
{
  schema: "kelp-exam-submission-v1",
  profileId,
  respondentName,
  date,
  degreeLevel,
  subject,
  whoAssigned,
  examTitle,
  questionCount,
  answeredCount,
  correctCount,
  wrongCount,
  partialCount,
  reviewCount,
  score: {
    earnedPoints,
    possibleAutoGradedPoints,
    totalExamPoints,
    percent
  },
  durationSeconds,
  duration,
  questions: [{
    questionNumber,
    questionName,
    type,
    status,
    answer,
    expectedAnswer
  }]
}
```

The detailed result remains necessary for results rendering and tutor review; the submission object is a compact reporting/integration payload. A production backend should store the student's raw response and the immutable grading basis used at submission time.

## Browser storage

- `kelp-exam-builder-draft-v5`: current authoring draft.
- `kelp:exams:v1:records`: normalized local exam bundles and question records.
- `kelp:exams:v1:reviews`: local review-decision audit entries.
- `kelp-exam-library-v1` / `kelp-exam-library-meta-v1`: legacy library keys read for one-way migration.
- `kelp-active-exam-v1`: exam opened by the taker.
- `kelp-exam-builder-return-v1`: builder restoration after preview.
- `kelp-exam-results-v1`: up to 20 recent detailed results.
- `kelp-latest-exam-result-v1` in `sessionStorage`: latest submitted result for immediate navigation.
- `kelp-exam-viewer-role` in `sessionStorage`: teacher/student results visibility.

Profile helpers are read from the site's existing session/local storage so the taker can populate respondent metadata. Browser storage is not authorization and should not be treated as trustworthy identity.

## Exported output

- Portable `kelp-exam-definition-v1` JSON through Export JSON.
- Import as copy accepts current definitions, editor drafts, and repairable legacy documents, then assigns new exam/question IDs while preserving copy provenance.
- `kelp-exam-structure-v1` is an internal overview model rather than a database record.
- Detailed result object in browser storage after submission.
- `kelp-exam-submission-v1` nested in the detailed result for backend/reporting use.
- Printable/PDF exam from the builder.
- Result, completed-exam, clean-exam, and answer-key print views exposed by the result flow.

PDF generation uses browser printing for the document-oriented pages. Layout depends on print CSS and the browser's selected paper/margins.

## Running and testing

From the repository root:

```bash
npm run test:exam-builder
npm run test:exam-review
npm run test:exam-supabase
npm run test:authorization
npm run test:publication
npm run test:smoke
```

For manual testing, serve the repository with any local HTTP server and open:

```text
src/app/exam-builder/exam-builder.html
src/app/exam-builder/exam-review.html
```

Import `test-fixtures/exam-builder-comprehensive-test.json` as a copy to exercise all current question families, body/option media, numeric settings, answer-space settings, multi-function graphs, measurements, constrained shapes, labels, and circuit symbols.

The exam-builder self-test also covers definition/draft round trips, malformed import repair, independent-copy provenance, persistence-bundle reconstruction, local adapter lifecycle rules, and difficulty-filtered question queries. The review-page test boots the local sandbox with a submitted exam, verifies escaped read-only rendering, enforces required rejection notes, records approval, confirms classification, and reads the resulting audit entry.

## Debugging notes

- If the preview or graph renderer is blank, confirm MathJax, Math.js, `kelp-diagram-editor.js`, and `kelp-numeric-answer.js` loaded before the page script.
- If an exam will not open in student view, inspect `kelp-active-exam-v1` and the 10 MB payload audit.
- If the shared library reports that sign-in is required, confirm Supabase Auth has restored the session and `get_my_authorization()` includes an active authoring role/capability.
- If Exam review redirects to the dashboard, confirm the user's active role union grants `exam.review`; `profiles.role` alone is no longer sufficient for reviewer access.
- If an exam saves without question rows, inspect the `save_exam_draft` RPC response; the provider never performs a second non-transactional question write.
- If submission navigation fails, inspect `kelp-latest-exam-result-v1` first, then `kelp-exam-results-v1` for quota/serialization errors.
- If a question reorders incorrectly, verify DOM order and `state.questions` order together; question IDs, not card indexes, are the stable identity.
- Multiple-answer partial credit currently awards points for correct selections as a fraction of the correct-option count. Review this policy before high-stakes use.
- Numeric grading depends on normalized expressions, tolerance, angle mode, and unit settings. Keep the grading engine version with the stored result if reproducibility becomes a requirement.
- Use a server-side permission check for teacher-only answers/results. The current `viewerRole` is a UI hint, not a security boundary.
