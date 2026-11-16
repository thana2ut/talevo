# Talevo interface, language and timetable update

## Changes
- Shared dark theme: layered backgrounds, subtle highlights and shadows, status-aware surfaces, icons, form fields, navigation, dialogs, welcome/authentication screens and scanner review states.
- English UI catalogue with more than 1,300 application strings, reactive language switching, English weekday/month/date/duration formatting, accessible labels and responsive English layouts. User-created task/course/profile content is not rewritten.
- Removed the decorative header calendar on mobile schedule and exam pages only.
- Replaced the document scanner's local OCR/parser entry path with a server-side multimodal university timetable reader. Multiple images and PDF pages are analyzed together. Course/section/name lists and building directories are supporting evidence, not new class rows.
- Timetable review: per-course uncertain-field counts, red editable fields, green reviewed fields, explicit confirmation, source evidence, duplicate/conflict review and an import guard for unresolved fields.
- Existing authentication, persistence and AI quota mechanisms are reused. No database migration or seed was run.

## Limits
- Up to 12 image/PDF pages; each selected source file up to 6 MB; selected source files up to 24 MB total. Prepared image payload up to 3.5 MB.
- Online timetable analysis depends on the configured Groq/Gemini Vision provider and available quota. AI output is not guaranteed error-free; uncertain fields require review before import.
- No device/browser interaction tests, live sample reading tests, or database write tests were run, as requested.
- Data typed by users and text extracted from their documents remain in the original language. AI-generated document content is distinct from application UI translations.

## Build checks
- TypeScript compilation: passed.
- Production build: passed, including 34 generated static pages and the timetable API route.
- ESLint: no errors; one existing unused-variable warning in scripts/qa-grade-lab.cjs (the script was not run).
- git diff --check: no whitespace errors; LF/CRLF notices are normal Windows line-ending warnings.
- No commit, push, migration, seed or .env.local edit was performed.

## Updated application files
- src/app/api/ai/syllabus/analyze/route.ts
- src/app/error.tsx
- src/app/global-error.tsx
- src/app/grade-lab/page.tsx
- src/app/not-found.tsx
- src/components/academic-end-time-input.tsx
- src/components/account-actions.tsx
- src/components/app-shell.tsx
- src/components/domain.tsx
- src/components/local-cloud-migration-panel.tsx
- src/components/talevo-color-picker.tsx
- src/components/ui.tsx
- src/components/verification-code-input.tsx
- src/features/academic/academic-pages.tsx
- src/features/academic/exam-dashboard.tsx
- src/features/academic/syllabus-scanner.tsx
- src/features/ai/ai-assistive-touch.tsx
- src/features/ai/ai-page.tsx
- src/features/ai/voice-command-sheet.tsx
- src/features/grade-lab/grade-lab-page.tsx
- src/features/notifications/notifications-page.tsx
- src/features/other/other-pages.tsx
- src/features/profile/profile-pages.tsx
- src/features/public/public-pages.tsx
- src/features/schedule/schedule-pages.tsx
- src/features/tasks/task-create-page.tsx
- src/features/tasks/task-pages.tsx
- src/features/today/mobile-home.tsx
- src/features/today/today-page.tsx
- src/features/vision/vision-page.tsx
- src/lib/ai/university-timetable.ts
- src/lib/course-utils.ts
- src/lib/greeting.ts
- src/lib/schedule-date.ts
- src/lib/schedule-utils.ts
- src/lib/syllabus-import.ts
- src/lib/task-utils.ts
- src/lib/ui-language.ts
- src/lib/ui-translations.en.json
- src/lib/university-timetable-pages.ts
- src/providers/language-provider.tsx
- src/providers/ui-language.ts
- src/styles/dark-mode.css
- src/styles/mobile-app.css
- src/styles/syllabus-import-composition.css

## Maintenance
- scripts/localize-ui.cjs maintains the static UI catalogue from app-authored source strings. It does not translate or send user records.
- Use providers/ui-language.ts useUiText() for new literal UI copy. Preserve stable enum values and translate only their displayed labels.
