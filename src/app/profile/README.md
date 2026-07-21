# Student Profile and Configuration

Phase 1 delivers the Student's own Profile and synchronized configuration as one server-authoritative vertical slice.

## Routes

- `student-profile.html`: view and edit Student Profile fields, hobbies, and learning goals.
- `student-preferences.html`: the Student-facing Themes page for choosing and resetting the synchronized theme.
- `../signUp/signUp.html`: create a Student account with a governed country, state/region, and city.

Tutor and other role profiles continue to use their existing route until their relationship-scoped views are implemented.

## Data ownership

| Data | Authority |
| --- | --- |
| Email | Supabase Auth; not editable from the Profile |
| Full name | `profiles`; Student-editable through the Profile RPC and audited |
| Birth date | `profiles`; may be set once, then requires Support correction |
| Country/state/city | Governed `profile_locations` record referenced by `profiles.location_key` |
| Hobbies and learning goals | Governed option definitions plus per-user selection rows |
| Theme | `user_preferences`, synchronized across devices |
| Timezone | Derived server-side from the governed city and cached in `user_preferences` for scheduling |
| Learning statistics | Deferred to Course, Classroom Membership, and Class history; never fabricated in the browser |

The browser never stores arbitrary CSS, role authority, a timezone override, or a second authoritative preference record. Theme tokens are selected from `ocean`, `kelp`, `coral`, `orchid`, `sunrise`, and `slate`.

A non-sensitive, allowlisted theme identifier is cached locally only to establish the correct first paint before authenticated data returns. The server preference remains authoritative and reconciles the cache on every authenticated page load. Unsaved Theme-page previews do not update the cache.

The Student's self-service Profile retains country, state/region, and city. A future relationship-scoped Tutor projection exposes only the Student's country; it must not reuse the owner's full Profile payload. That projection is enforced when Tutor–Student relationships enter their owning vertical phase.

The Profile privacy helper communicates the narrower display contract: no Profile information is public; email, birth year, state/region, and city stay private from the Tutor projection; Tutor-visible fields use purpose-built relationship data rather than the owner's unrestricted payload.

## Server boundary

Migrations `202607200001_student_profile_preferences.sql` and `202607200002_profile_location_catalog.sql` own the catalogs, preferences, selections, change events, grants, RLS, and these public RPC contracts:

- `list_profile_countries`
- `list_profile_regions`
- `list_profile_cities`
- `list_profile_configuration_options`
- `get_my_profile_configuration`
- `save_my_student_profile`
- `save_my_preferences`
- `reset_my_preferences`

Direct writes to Profile configuration tables are denied to browser roles. Change events retain changed field names and counts without duplicating name, birth date, location, or option values into event metadata.

## Location catalog

The base migration ships a small deterministic seed for disposable local development. Phase 1.A adds a hierarchical query contract plus a verified importer for the [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database) release `v3.1-export.2` (250 countries, 5,296 regions, and 153,823 cities). The browser loads countries first, then only the selected country's regions, then only the selected region's cities. Source provenance and ODbL attribution live in `data/location-catalog/README.md`.

## Verification

- `npm run test:profile`: deterministic source and contract characterization.
- `npm run test:profile-live`: authenticated local REST/RPC and RLS characterization with disposable synthetic users.
- `tools/student-profile-preferences-db-self-test.sql`: rollback SQL for the standard local acceptance runner.

The browser journey covers signup, reload persistence, Profile editing, locked birth date, governed choices, theme preview/save, clean console output, and desktop/mobile overflow checks.

The reusable fixed-header measurements, responsive rules, accessibility requirements, and adoption checklist live in [`KELP_PAGE_HEADER_STYLE.md`](../../../KELP_PAGE_HEADER_STYLE.md).

## Deferred dependencies

- production location-catalog deployment and ODbL review;
- Support UI for birth-date corrections;
- relationship-scoped Tutor visibility;
- active Tutor, completed Class/Course, and tutoring-hour derivation;
- Dashboard layout, Classroom colors, Calendar style, holidays, and notification preferences in their owning vertical phases.
