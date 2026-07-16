# Backend Roadmap

This note tracks the Supabase wiring path for Kelp Tutoring. The project should keep static curriculum content and user-specific activity separate.

## Current Foundation

- Supabase Auth is the identity provider.
- The `profiles` table is the first application table.
- Profile rows are created by Supabase trigger after sign-up.
- Frontend auth lives in `src/auth/auth-guard.js`.
- The dashboard pages now read the authenticated profile before rendering role-specific workspace content.
- Local Supabase runs from `supabase/config.toml` and `supabase/migrations/` for fast auth/profile testing before remote deployment.
- The frontend Supabase client uses local Supabase automatically when served from `127.0.0.1` or `localhost`.

## Role Model

The frontend currently normalizes these role values:

- `student` -> student dashboard
- `teacher`, `tutor`, `mentor` -> tutor dashboard
- `admin` -> tutor dashboard until a dedicated admin dashboard exists

The database can keep the original role values, but UI routing should use the normalized role.

## Next Tables

These tables are the likely next layer after `profiles`.

```text
student_tutor_links
  id
  student_id -> profiles.id
  tutor_id -> profiles.id
  status
  created_at

triage_forms
  id
  owner_id -> profiles.id
  title
  status
  created_at

triage_questions
  id
  form_id -> triage_forms.id
  prompt
  type
  options
  position

triage_responses
  id
  form_id -> triage_forms.id
  student_id -> profiles.id
  answers
  submitted_at

student_learning_preferences
  id
  student_id -> profiles.id
  preferred_modes
  preferred_providers
  hidden_providers
  updated_at

student_track_assignments
  id
  student_id -> profiles.id
  tutor_id -> profiles.id
  source_track_id
  display_title
  status
  created_at

student_schedule_progress
  id
  student_id -> profiles.id
  assignment_id -> student_track_assignments.id
  source_session_id
  source_resource_id
  status
  updated_at
```

## Content Boundary

Keep curriculum content in markdown/generated files:

- `src/app/schedules/**/*.md`
- `src/app/schedules/**/*.html`
- `src/data/tracks-data.js`

Use Supabase for user-specific state:

- account identity
- profile fields
- tutor-student relationships
- triage answers
- adaptive visibility preferences
- assigned tracks
- per-student progress
- tutor-created drafts and approval state

## First Useful Backend Milestone

A student can log in, open a schedule/session page, mark one visible resource as `done`, `dismissed`, or blank, refresh the page, and see the same state restored from Supabase.

That milestone proves:

- auth
- profile lookup
- RLS policies
- student-specific data ownership
- frontend save/load flow
- the future adaptive-track path
