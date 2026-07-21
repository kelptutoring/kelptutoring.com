# Kelp backend adapters

The classroom, whiteboard, form library, and exam library use contract version `1`. Local implementations remain available, while `window.KelpBackendAdapters` can replace individual domains before the corresponding tool loads.

## Identity and authorization

Accounts can hold multiple active roles. Effective permissions are the union of the capabilities mapped to those roles; `profiles.role` is retained only as a transitional primary-workspace hint. Client navigation resolves this state through `get_my_authorization()`, while RLS and mutation RPCs enforce capabilities on the server. See [`src/auth/AUTHORIZATION.md`](../../auth/AUTHORIZATION.md) for the database tables, browser helpers, bootstrap constraints, and transition rules.

## Classroom domains

- `roomSession`: load, save, and subscribe to the canonical room snapshot.
- `participantPresence`: publish join, leave, and connection-quality state.
- `chat`: send one normalized message.
- `timers`: save the shared countdown state.
- `sessionEvents`: append one audit event.

## Whiteboard domains

- `collaboration`: connect, subscribe, publish a merged scene, and disconnect.
- `whiteboards`: load, save, and clear the room board.
- `files`: persist or transform Excalidraw files before the board is saved.

## Form domains

- `forms`: list, load, save, submit for review, publish when authorized, archive, and remove owner-scoped form definitions.
- `submissions`: create and list immutable response records independently of form lifecycle changes.
- `reviews`: list submitted forms, record trusted decisions, and load append-only form review history.

## Exam domains

- `exams`: list, load, save, submit for review, publish when authorized, archive, and remove owner-scoped normalized exam bundles.
- `questions`: list/filter or load independently addressable question records.
- `reviews`: list the review queue, record a mentor/admin decision, and load decision history.
- `question bank`: capability-protected search/detail RPCs for approved reusable questions, separate from an author's owner-scoped records.

## Course domains

- `course compositions`: save, list, load, duplicate, archive, and remove owner-scoped course drafts assembled from approved question references.
- `course assignments`: sync a student's schedule, list stable sessions, freeze one saved course into a scheduled assignment, list authored assignments, and cancel an unstarted assignment.
- `course practice`: list the signed-in student's assignments, retrieve answer-free delivery snapshots, start/resume attempts, save progress, submit, and start a later repeat attempt.

The exam builder loads `exam-contract.js` and `exam-adapters.js` before resolving `window.KelpBackendAdapters.exams`. Direct `file://` use keeps the local provider. Over HTTP(S), `exam-supabase-provider.js` installs the default Supabase implementation unless an explicit provider is already registered.

Supabase stores the canonical bundle in `exam_definitions`, derived question rows in `exam_questions`, and review decisions in `exam_reviews`. `save_exam_draft` performs definition/question changes transactionally and derives ownership, timestamps, private visibility, draft review state, and tutor-proposed classification from trusted server context. `submit_exam_for_review` locks a classified owner draft. `review_exam` requires `exam.review`, requires a reviewer other than the owner, and confirms classifications on approval. `publish_exam` requires `exam.publish` and an owned draft. Both approval paths create a `content_publication_events` entry. Tutors cannot directly insert/update question rows or grant approval/publication.

Phase 5 adds overlapping `question_type_tags` and `exam_question_curriculum_links`. Review/publication now requires every question to have a difficulty, at least one supported category, and an active track/topic link. `search_question_bank` and `get_question_bank_item` require `question_bank.read`; both restrict results to active/public/approved exams and reviewed question classifications. The list RPC returns a paginated preview and the detail RPC returns complete answer-bearing content. Neither RPC is a student-delivery endpoint.

Phase 6 adds `course_compositions` and `course_composition_items`. The client sends a course identity, title, description, canonical destination node, and question IDs to `save_course_composition`. The RPC derives ownership, validates every question against the approved bank and selected curriculum subtree, and persists only stable references in easiest-to-hardest order. `duplicate_course_composition` generates a new draft identity; archive/delete affect only the course rows and never their source questions. These RPCs require `course.compose` and remain mentor/administrator authoring endpoints, not student delivery endpoints.

Phase 7 adds `learning_schedules`, `learning_schedule_sessions`, `course_assignments`, `course_assignment_items`, and `course_practice_attempts`. `assign_course_to_schedule_session` requires `course.assign`, revalidates the author's saved course and approved questions, and freezes independent private grading and student delivery snapshots. The server derives all ownership and scheduling relationships. Student RPCs require `practice.attempt`, expose only the stripped delivery snapshot, and restrict attempts to the authenticated assignee. Submitted attempts are immutable; repeat practice creates another numbered attempt. Deleting or archiving a source course cannot rewrite the assignment snapshot.

An approved record's `public` visibility is catalog eligibility, not permission for students to read the full answer-bearing bundle. The full question-bank payload remains trusted-author only; students receive content solely through the Phase 7 assignment delivery RPCs.

`exam-review.html` consumes only the `reviews` adapter domain. It provides read-only question and answer inspection, status filters, required notes for change requests/rejections, and audit history. Over HTTP(S), the client requires `exam.review` and refuses a local-provider fallback; this is defense in depth because RLS and `review_exam` remain the authorization boundary. Direct `file://` use is a labeled local review sandbox.

The form builder loads `form-adapters.js` as a classic script so it continues to work from its standalone `file://` entry point. It resolves the same `window.KelpBackendAdapters` registry and supports the same partial-override behavior as the module-based classroom and whiteboard adapters.

When served over HTTP or HTTPS, `form-supabase-provider.js` installs the default Supabase implementation before the builder or respondent page resolves its adapters. It leaves an explicitly registered forms provider untouched. The builder can keep using its local fallback while backend configuration is incomplete. The respondent page deliberately does not report a local fallback as a successful hosted submission: if its HTTP(S) provider is unavailable, it keeps the answers on screen and offers a retry. Direct `file://` previews persist locally.

The Supabase implementation stores definitions in `form_definitions`, decisions in `form_reviews`, and immutable responses in `form_submissions`. Definition content is written only through `save_form_draft`; review submission, decisions, and direct publication use dedicated RPCs with capability and ownership checks. `form-review.html` refuses a local fallback over HTTP(S) and renders readable metadata, respondent fields, phases, triggers, questions, and history without allowing content edits. `submit_form_response` derives the form owner, authenticated respondent, server timestamp, and single/multiple policy instead of trusting those fields from the browser. Submission IDs are generated once on the client and reused on retry.

Future assignment IDs should remain outside the client-authored submission snapshot. Add them as trusted columns resolved by the submission RPC from an assignment or access token, then return them in tutor-facing read models. This keeps historical answers stable while profiles, dashboards, and assignment workflows evolve independently.

Collaboration subscribers should deliver an authoritative, already-merged scene and preserve the originating `clientId`. The page ignores its own echoed updates; conflict resolution belongs in the collaboration provider rather than in the whiteboard UI.

Each write receives a narrow payload followed by a context containing `roomId`, the current participant when relevant, a reason, and the optimistic local snapshot. Methods may be synchronous or return promises.

```js
window.KelpBackendAdapters = {
  classroom: async ({ roomId }) => ({
    chat: {
      async send(message) {
        await fetch(`/api/rooms/${roomId}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(message)
        });
      }
    }
  }),
  whiteboard: async ({ roomId }) => ({
    whiteboards: {
      async load() {
        const response = await fetch(`/api/rooms/${roomId}/whiteboard`);
        return response.ok ? response.json() : null;
      }
    }
  }),
  forms: async () => ({
    forms: {
      async save(definition) {
        const response = await fetch('/api/forms', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(definition)
        });
        return response.json();
      }
    },
    submissions: {
      async create(submission) {
        const response = await fetch('/api/form-submissions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(submission)
        });
        return response.json();
      }
    }
  })
};
```

Partial overrides inherit every omitted method from the local provider. This makes it possible to wire and validate one backend capability at a time.
