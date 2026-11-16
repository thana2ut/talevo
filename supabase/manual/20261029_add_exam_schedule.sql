-- TALEVO production exam entries proposed from the user's request.
-- Dates are Buddhist year 2569 (Gregorian 2026), Asia/Bangkok (UTC+07).
-- All six entries are in the past as of 2026-10-29, so completed_at is set
-- to the requested end time to display them as already taken.
-- Exam subtype and rooms were not provided: type uses the schema's required
-- generic value 'other'; room remains NULL.
-- The 2026-11-02 exam is intentionally omitted until its time is supplied.

begin;

insert into public.exams (
  user_id, id, course_id, title, type, start_at, end_at, room, note,
  completed_at, created_at, updated_at
)
values
  (
    '1e7ab1d6-808e-4709-80cf-c9f1d4401eb9',
    'manual-exam-20261019-life-skills',
    'class-1793219454902-nqbst',
    'สอบ', 'other',
    '2026-10-19 17:00:00+07', '2026-10-19 19:00:00+07',
    null, 'ยังไม่ระบุประเภทและห้องสอบ',
    '2026-10-19 19:00:00+07', now(), now()
  ),
  (
    '1e7ab1d6-808e-4709-80cf-c9f1d4401eb9',
    'manual-exam-20261020-wisdom',
    'class-1793219511927-3o6x9',
    'สอบ', 'other',
    '2026-10-20 17:00:00+07', '2026-10-20 19:00:00+07',
    null, 'ยังไม่ระบุประเภทและห้องสอบ',
    '2026-10-20 19:00:00+07', now(), now()
  ),
  (
    '1e7ab1d6-808e-4709-80cf-c9f1d4401eb9',
    'manual-exam-20261021-data-communications',
    'class-1793219262461-1yt5q',
    'สอบ', 'other',
    '2026-10-21 09:00:00+07', '2026-10-21 12:00:00+07',
    null, 'ยังไม่ระบุประเภทและห้องสอบ',
    '2026-10-21 12:00:00+07', now(), now()
  ),
  (
    '1e7ab1d6-808e-4709-80cf-c9f1d4401eb9',
    'manual-exam-20261022-educational-innovation',
    'class-1793219850795-ymiox',
    'สอบ', 'other',
    '2026-10-22 13:00:00+07', '2026-10-22 17:00:00+07',
    null, 'ยังไม่ระบุประเภทและห้องสอบ',
    '2026-10-22 17:00:00+07', now(), now()
  ),
  (
    '1e7ab1d6-808e-4709-80cf-c9f1d4401eb9',
    'manual-exam-20261026-database-design',
    'class-1793219617919-sklxu',
    'สอบ', 'other',
    '2026-10-26 08:00:00+07', '2026-10-26 12:00:00+07',
    null, 'ยังไม่ระบุประเภทและห้องสอบ',
    '2026-10-26 12:00:00+07', now(), now()
  ),
  (
    '1e7ab1d6-808e-4709-80cf-c9f1d4401eb9',
    'manual-exam-20261028-curriculum-design',
    'class-1793219324131-7vb3i',
    'สอบ', 'other',
    '2026-10-28 10:00:00+07', '2026-10-28 11:00:00+07',
    null, 'ยังไม่ระบุประเภทและห้องสอบ',
    '2026-10-28 11:00:00+07', now(), now()
  )
on conflict (user_id, id) do nothing;

commit;
