# Kelp Vanilla Exam Builder v3

This prototype uses only HTML, CSS, and JavaScript. No React, Vite, npm, or build step is required. Version 3 adds square graphs, clickable coordinate points, graph labels, and schedule-style results.

## Files

- `exam-builder.html` — tutor-facing exam builder
- `exam-taker.html` — one-question-at-a-time online student view
- `exam-results.html` — results page with score and right answers when available
- `exam-builder.css` — exam builder/student/results styles
- `exam-builder.js` — builder logic
- `exam-taker.js` — student exam/timer/grading logic
- `exam-results.js` — results rendering logic
- `style.css` — your current Kelp global style system
- `supabase-schema-starter.sql` — starter backend schema for shared exam storage

## How to run locally

From this folder:

```powershell
python -m http.server 5500
```

Then open:

```text
http://localhost:5500/exam-builder.html
```

## Current storage behavior

This version can save drafts and a local exam library in `localStorage`. That means it is available only in the same browser on the same device.

For shared access across all tutors and students, connect the project to Supabase using the starter schema. The current front end is already shaped around a backend-ready exam JSON object.

## Multiple-choice behavior

Multiple-choice questions use a selected correct option. The student selects an option directly on the page. These questions are auto-graded.

## Graph behavior

Graphs can be created as functions, standalone coordinate points, or both. In point mode, click the editor graph to add points, then click **Attach graph** to save the graph to the question. Graphs render as square regions with heavier axes and arrows for positive directions.

## Written-answer behavior

Numeric and short-answer questions can be auto-graded only when the expected answer is simple enough. Essay/explanation questions are marked for teacher review.


## v5 notes

This version adds:

- result-page tables with fewer columns to prevent PDF overflow;
- question score/status displayed together, such as `1 / 1 pt · Right`;
- multiple-answer questions with partial auto-grading;
- true/false questions;
- image uploads embedded into the exam JSON/local browser storage;
- optional LaTeX/text blocks before and after image and graph sections;
- smoother minimize/maximize transitions;
- improved graph axis labels and tick marks.

For the prototype, uploaded images are stored as Base64 inside localStorage/JSON exports. Keep images reasonably small until this is connected to Supabase Storage.
