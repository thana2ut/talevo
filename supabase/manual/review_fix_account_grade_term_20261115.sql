-- Review before execution. Account: tarthanawutk@gmail.com
-- Timetables already verified: 9 older classes in term 1, 8 today's classes in term 2.
-- Correct only the mismatched grade course; preserve all score components.
begin;

select g.id, g.name, g.term, g.revision
from public.grade_lab_courses g
join auth.users u on u.id = g.user_id
where u.email = 'tarthanawutk@gmail.com'
  and g.id = 'ad60597f-8a08-4d8c-bff5-03c11d9d266b';

update public.grade_lab_courses g
set term = 'ภาคเรียนที่ 1 2569',
    payload = jsonb_set(g.payload, '{term}', to_jsonb('ภาคเรียนที่ 1 2569'::text)),
    revision = g.revision + 1,
    updated_at = now()
where g.user_id = (select id from auth.users where email = 'tarthanawutk@gmail.com')
  and g.id = 'ad60597f-8a08-4d8c-bff5-03c11d9d266b'
  and g.term = 'ภาคเรียนที่ 2 2569'
  and g.deleted_at is null
  and exists (
    select 1 from public.class_schedules s
    where s.user_id = g.user_id and s.course_id = g.source_course_id
      and s.academic_term = 'ภาคเรียนที่ 1' and s.academic_year = '2569'
  )
returning g.id, g.name, g.term, g.revision;

-- Default to a dry run. Replace ROLLBACK with COMMIT only after review.
rollback;
