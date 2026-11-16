# Talevo learning tools — release review

> Historical release record. Course syllabus import was removed from the application on 16 November 2026. See `docs/course-syllabus-removal.md` for the current scope and the separate database cleanup awaiting review. The database migration below remains unchanged as deployed history.

Implemented 15 November 2026. Existing timetable-image import is retained.

## User flows

- `/syllabus`: upload 1–6 PDF, DOCX, PNG or JPG files for one course, up to 20 MB each / 40 MB total. PDF text is extracted locally; scanned pages are prepared as images. Maximum 40 pages, 12 scanned pages and 160,000 text characters. Prepared API payload maximum 3.5 MB.
- Extract course details, classes, actual weekly topics/activities, work/exams, assessment weights and grade bands. Each fact/row carries a source document/page/quote and a found/review/missing label. Unverified image quotes always require review. Missing dates/years and score maxima are not filled automatically. No fixed 16-week assumption.
- Review/edit/add/remove/select rows. Dates accept Buddhist/Gregorian notation and use Asia/Bangkok. Selected weights must total 100%. Grade Lab requires complete score maxima; grade points can remain unknown. Work/exams require an existing linked course or a selected class to create that link.
- Import uses one PostgreSQL transaction across course classes, tasks, exams, weekly metadata and optional Grade Lab. Conflict/failure rolls back all writes. Import UUID and course/term identity prevent duplicate imports; existing task/class/exam matches are skipped.
- `/rescue`: read account tasks, classes and exams; show backlog, overdue and upcoming counts; rank by deadline, declared importance, remaining effort and subtask progress, with visible reasons.
- Availability is entered explicitly. Missing duration uses a labelled 60-minute estimate. The planner excludes classes/exams, uses 50-minute maximum work blocks and 10-minute breaks, respects future deadlines and reports work that cannot fit. Exams without an end time reserve a labelled two-hour estimate.
- AI suggests practical phases using the existing server provider/quota. A deterministic planner controls the times. Review and confirmation are required to save. Input changes mark the plan stale; server save validates the latest owner data and optimistic revision. Starting a task is an explicit action that sets it to doing, never submitted/completed.
- More menu and task page expose the tools. Homepage Rescue entry appears only for urgent work. Existing bottom navigation is retained. Floating AI is hidden inside these two workflows to keep confirmation buttons clear.
- The homepage banner now displays synchronized Thailand time `HH:mm:ss` with a clock icon. It synchronizes to `/api/time`, compensates half the request round trip, ticks with a monotonic timer and resynchronizes every minute / on return to the page. Offline it continues from the last anchor. Network asymmetry can still cause small clock error; it is not an authoritative legal timestamp.

## Database review required

File: `supabase/migrations/20261114144443_learning_tools.sql`.

- Adds `learning_syllabi` and `learning_rescue_plans`, with RLS owner-only reads.
- Adds `import_learning_syllabus` and `save_learning_rescue`. Authenticated-only execution, `auth.uid()` ownership and an empty search path are enforced. Direct writes to the new tables are revoked.
- Does not alter/drop existing tables or bulk change existing user data. Later confirmed actions write selected items and system notification records.
- Depends on existing Grade Lab storage/RPC; read-only inspection of `talevo-sg` confirms it exists.
- Migration was applied successfully to `talevo-sg` after explicit user authorization. Production metadata checks confirm RLS and authenticated-only RPC execution; anonymous execution and direct table inserts are denied. No `.env.local` edits, commit or push have been made.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: no errors. One existing unused-variable warning in `scripts/qa-grade-lab.cjs`.
- `npm run build`: passed, including both pages, three learning APIs and `/api/time`.
- `git diff --check`: passed; LF/CRLF warnings are normal Windows line-ending warnings.
- 18 pure logic tests: Bangkok dates, durations, progress, collision exclusion, deadlines, insufficient time, no mutation, source evidence, missing years, weights and grade boundaries.
- 9 integration tests in disposable PostgreSQL/PGlite: atomic success, repeat protection, whole-transaction rollback, successful Grade Lab integration, revision conflicts, owner isolation and denied anonymous/direct writes.
- 8 HTTP security checks against the local production server: unauthenticated reads/writes denied and foreign mutation origins denied.
- 16 browser scenarios with isolated account/API fixtures: Syllabus and Rescue at widths 390, 834, 1366 and 1440, light/dark themes, real DOCX preparation, review, evidence dialog, Escape close, confirmation, planner availability, no horizontal overflow and no JavaScript errors.
- 1 browser clock test: a non-Thai browser timezone still shows Thailand time from the server anchor and seconds advance.
- Browser account/API fixtures are test-only. They are not served by the production app. No live model accuracy evaluation or signed-in production import has been performed.

## Main files

New pages/UI: `src/app/syllabus/page.tsx`, `src/app/rescue/page.tsx`, `src/features/learning/*`.

New core/server code: `src/lib/learning-syllabus.ts`, `src/lib/learning-documents.ts`, `src/lib/learning-data.ts`, `src/lib/rescue.ts`, `src/lib/ai/learning-tools.ts`, `src/app/api/learning/*`.

Clock: `src/components/thailand-clock.tsx`, `src/components/thailand-clock.css`, `src/app/api/time/route.ts`.

Integration edits: app shell, task/schedule/today pages, shared English catalogue, global shortcut styles. `fflate@0.8.2` is the only added application dependency, for bounded DOCX ZIP extraction.

Tests: `scripts/qa-learning-tools.cjs`, `scripts/qa-learning-postgres.cjs`, `scripts/qa-learning-responsive.cjs`. PostgreSQL and browser harnesses accept an external temporary QA module directory; no real user credentials are used.

## Production release

Applied to talevo-sg with explicit user approval. Deployment `dpl_AeTJYpB5mvVVEGRGS1wKYgv5r5Lb` reached READY and is aliased to https://talevoo.vercel.app.
