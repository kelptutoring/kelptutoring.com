# Exam builder

## Function

The exam builder is a browser-based authoring, delivery, grading, and results tool. Tutors create exams with text, images, mathematical notation, numeric rules, and reusable diagrams; reorder questions with buttons or drag-and-drop; preview the student experience; export/import exam JSON; print exam PDFs; and save exams to a local library. Students take the active exam one question at a time, after which auto-gradable responses are scored and written answers are marked for tutor review.

The implementation is framework-free HTML, CSS, and JavaScript. Browser storage is the current persistence layer, but the exam, exam-structure, result, and submission objects are shaped as explicit backend payloads.

## Entry pages and main files

- `exam-builder.html` / `exam-builder.js`: tutor authoring, live preview, ordering, draft/library persistence, JSON import/export, and printable exam.
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
2. Add questions and choose a question type.
3. Enter the prompt, points, answer settings, and optional text/LaTeX around attached media.
4. For option questions, configure text, image, or graph choices and select the correct option(s).
5. For numeric questions, configure the expected expression, exact/tolerance grading, angle mode, and optional required unit.
6. Attach a question-body image or open the diagram editor for graphs, geometry, measurements, labels, and circuit objects.
7. Collapse sections for compact editing, reorder questions with arrows or drag-and-drop, and verify the live preview.
8. Save a draft, save to the local library, export JSON, review the database-ready Exam structure summary, print, or open the student view.
9. The student view stores the selected exam as the active exam, collects answers until submission/timeout, grades supported types, and opens the results page.

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
  numericUnit,
  collapsed,
  basicCollapsed,
  imageCollapsed,
  graphCollapsed
}
```

Fields irrelevant to the selected type remain present with neutral defaults. UI-only collapse fields may be removed by a backend serializer if they are not needed for authoring restoration.

Images are currently embedded as Base64/data URLs. The builder warns when the active online-render payload exceeds 10 MB. Production storage should move images to object storage and replace them with durable authorized URLs or file IDs.

## Diagram data

Question body diagrams live in `question.graph`; option diagrams live in `question.optionGraphs`. `window.KelpDiagramEditor` provides normalization and canvas rendering so the builder preview, taker, results, and print views share the same interpretation.

Graphs can contain functions, points, segments, distance measurements, angles, regular/irregular shapes, circles, ellipses, trapezoids, parallelograms, labels, and circuit symbols. The first function is mirrored into legacy singular function fields for backward compatibility. Preserve unknown graph fields during backend round trips.

## Exam-structure export

The Exam structure action creates a compact database/debugging summary:

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
- `kelp-exam-library-v1`: locally saved exam array.
- `kelp-active-exam-v1`: exam opened by the taker.
- `kelp-exam-builder-return-v1`: builder restoration after preview.
- `kelp-exam-results-v1`: up to 20 recent detailed results.
- `kelp-latest-exam-result-v1` in `sessionStorage`: latest submitted result for immediate navigation.
- `kelp-exam-viewer-role` in `sessionStorage`: teacher/student results visibility.

Profile helpers are read from the site's existing session/local storage so the taker can populate respondent metadata. Browser storage is not authorization and should not be treated as trustworthy identity.

## Exported output

- Full exam JSON through Export JSON; Import JSON accepts the same normalized authoring document.
- `kelp-exam-structure-v1` JSON through the Exam structure dialog/download.
- Detailed result object in browser storage after submission.
- `kelp-exam-submission-v1` nested in the detailed result for backend/reporting use.
- Printable/PDF exam from the builder.
- Result, completed-exam, clean-exam, and answer-key print views exposed by the result flow.

PDF generation uses browser printing for the document-oriented pages. Layout depends on print CSS and the browser's selected paper/margins.

## Running and testing

From the repository root:

```bash
npm run test:exam-builder
npm run test:smoke
```

For manual testing, serve the repository with any local HTTP server and open:

```text
src/app/exam-builder/exam-builder.html
```

Import `test-fixtures/exam-builder-comprehensive-test.json` to exercise all current question families, body/option media, numeric settings, answer-space settings, multi-function graphs, measurements, constrained shapes, labels, and circuit symbols.

## Debugging notes

- If the preview or graph renderer is blank, confirm MathJax, Math.js, `kelp-diagram-editor.js`, and `kelp-numeric-answer.js` loaded before the page script.
- If an exam will not open in student view, inspect `kelp-active-exam-v1` and the 10 MB payload audit.
- If submission navigation fails, inspect `kelp-latest-exam-result-v1` first, then `kelp-exam-results-v1` for quota/serialization errors.
- If a question reorders incorrectly, verify DOM order and `state.questions` order together; question IDs, not card indexes, are the stable identity.
- Multiple-answer partial credit currently awards points for correct selections as a fraction of the correct-option count. Review this policy before high-stakes use.
- Numeric grading depends on normalized expressions, tolerance, angle mode, and unit settings. Keep the grading engine version with the stored result if reproducibility becomes a requirement.
- Use a server-side permission check for teacher-only answers/results. The current `viewerRole` is a UI hint, not a security boundary.
