# Form and submission data contract

The form builder currently produces two different records with different lifecycles:

- A form definition is editable tutor-owned content.
- A submission is an immutable record of one completed response.

Keeping these records separate means a form can later be archived, duplicated, edited as a copy, or deleted without changing an existing student's response.

## Form definition

The current form schema is version 3. Its top-level shape is:

```json
{
  "id": "form-...",
  "version": 3,
  "meta": {
    "title": "Student Check-in",
    "audience": "Current students",
    "description": "...",
    "respondentDetails": {}
  },
  "settings": {
    "submissionPolicy": {
      "mode": "single"
    }
  },
  "blocks": []
}
```

`settings.submissionPolicy.mode` is either `single` or `multiple`. The browser can display the policy, but the connected backend must enforce it against an authenticated respondent or another trustworthy identity.

Location respondent fields follow an enforced hierarchy: country may be enabled alone, state / province enables country, and city enables both state / province and country. The required flags follow the same hierarchy, so requiring state also requires country and requiring city also requires state and country. Disabling collection or required status on a parent cascades down to its dependent fields. The respondent page uses the open [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database) through its browser package and records the displayed location names. Its data is licensed under ODbL 1.0 and is attributed in the form. If the remote list is unavailable, the same fields fall back to manual entry instead of blocking the response.

Written questions carry their own printable answer-space setting:

```json
{
  "kind": "question",
  "type": "long-answer",
  "pdfAnswerSpace": {
    "size": "custom",
    "customMm": 80
  }
}
```

For short-answer questions, `pdfAnswerSpace.size` is `none` or `small`; unsupported imported values normalize to the 35-millimetre small block. Long-answer questions may use `none`, `small`, `medium`, `large`, or `custom`. The standard heights are 35, 60, and 95 millimetres, and custom long-answer heights are normalized to the 10–260 millimetre range. This setting belongs to the question, so it survives drafts, JSON import/export, library copies, and question duplication.

Importing a JSON form creates a copy rather than reopening the same record. The copy receives a new form ID and new IDs for every block, question option, and trigger. Trigger references are rewritten to those new IDs. Loading the builder's own saved browser draft is not an import and therefore preserves its existing form ID.

## Immutable submission

The current submission schema is version 1. A submission is divided into the snapshot, response data, and metadata discussed during the frontend design:

```json
{
  "id": "submission-...",
  "version": 1,
  "immutable": true,
  "formId": "form-...",
  "submittedAt": "2026-07-17T12:00:00.000Z",
  "snapshot": {
    "form": {
      "id": "form-...",
      "title": "Student Check-in",
      "audience": "Current students",
      "description": "..."
    },
    "respondentDetails": {},
    "pages": []
  },
  "data": {
    "respondent": {},
    "answers": [
      {
        "questionId": "question-...",
        "type": "multiple-choice",
        "value": "option-..."
      }
    ]
  },
  "metadata": {
    "formSchemaVersion": 3,
    "submissionPolicy": "single",
    "route": {
      "pageIds": []
    }
  }
}
```

The snapshot contains only pages visited by this respondent. Each page preserves its title, description, appearance, questions, and answer-option labels as they existed at submission time. It omits editor-only state and conditional rules that were not needed to interpret the completed response.

`data.respondent` contains enabled identity fields that received a value. `data.answers` contains responses to questions on the visited route. Number answers are stored as numbers; multiple-answer values are sorted arrays of option IDs.

`metadata.route.pageIds` records the actual respondent path, including the privacy and goodbye steps. This lets later reporting explain which conditional pages the respondent saw without recalculating the route against a form that may have changed.

The domain returns a recursively frozen submission object. This prevents accidental mutation within the current page. Database immutability must still be enforced with server-side permissions and append-only update rules.

## Frontend integration event

The standalone respondent page creates the submission only after final validation and emits:

```js
window.addEventListener('kelp:form-submitted', (event) => {
  const submission = event.detail;
});
```

The event is the respondent-side integration boundary. A deployed form taker can forward its detail to `submissions.create`. The standalone popup does not silently persist response data, because it does not have an authenticated respondent or a production provider context.

## Form persistence adapter

The builder resolves the `forms` scope from `window.KelpBackendAdapters`. Its contract contains:

```js
{
  forms: {
    list(options),
    load(formId),
    save(definition),
    archive(formId),
    remove(formId)
  },
  submissions: {
    create(submission),
    list(options)
  }
}
```

The default provider is a browser-backed library using separate records:

- `kelp:forms:v1:definitions`
- `kelp:forms:v1:submissions`

Saved form records wrap the editable definition with lifecycle metadata: `status`, `createdAt`, `updatedAt`, and `archivedAt`. Opening a library form always calls `cloneFormDefinition`, so the editor receives a new form and new nested IDs. The saved original is never edited through retrieval.

The local provider enforces `active -> archived -> deleted`: active records cannot be deleted, and archived records cannot be overwritten. Removing a form definition does not cascade into the separate submission collection.

Production providers can replace only the methods already connected to the database. Missing methods inherit the local provider during incremental wiring.

When the builder is served over HTTP or HTTPS, it registers the Supabase forms provider before resolving this contract. The standalone `file://` entry point skips the module import and retains the local browser provider. If the Supabase module cannot load, the builder falls back to local storage and identifies the unavailable custom provider in the library.

## Supabase persistence

Migration `202607170001_form_library.sql` adds two deliberately separate tables:

- `form_definitions` stores tutor-owned editable JSON plus active/archived lifecycle metadata.
- `form_submissions` stores the server-normalized immutable response, trusted respondent ID, source-form ownership metadata, and submission policy.

`form_definitions.id` is globally unique so a submitted `formId` resolves to one source form without trusting a client-provided owner ID. Tutor operations are protected by row-level ownership policies. Only profiles with a tutor-side role can create a form. Active forms may be archived, and only archived forms may be deleted through the authenticated client.

The form lifecycle trigger rejects changes to identity and ownership fields, rejects changes to archived forms, and prevents a form definition from being overwritten after its first response. Archival remains allowed after responses exist. This makes “open as copy” the editing path for any form that already has student history.

`form_submissions` intentionally has no foreign key to `form_definitions`. Its `form_owner_id`, `form_id`, and embedded snapshot remain readable after the source definition is hard-deleted. Authenticated tutors can read responses to their forms; authenticated respondents can read their own responses. Direct client insert, update, and delete privileges are not granted.

Submission creation goes through `submit_form_response(p_record)`. The function:

1. Requires an authenticated respondent.
2. Resolves an active source form by ID.
3. Replaces the client timestamp and submission-policy claim with database-authoritative values.
4. Treats the client submission ID as an idempotency key for safe retries.
5. Enforces single-response forms with a partial unique index over the trusted respondent identity.

A database trigger rejects every update or deletion of a stored submission, including privileged table writes unless that trigger is deliberately disabled for maintenance.

## Backend wiring rules

The Supabase provider now implements the first five rules below. A future file-storage phase can add the optional PDF artifact:

1. Authenticate the tutor and respondent independently of browser-provided role fields.
2. Treat the client-generated submission ID as an idempotency key and the timestamp as provisional, replacing the timestamp server-side.
3. Enforce `single` submissions with a uniqueness rule covering the form and trusted respondent identity.
4. Store submissions as append-only records; corrections should create an explicit new record rather than mutate a submitted response.
5. Permit form archival or deletion without cascading changes into submission snapshots.
6. Store an optional rendered PDF as an artifact linked to the submission, not as the only source of response data.
