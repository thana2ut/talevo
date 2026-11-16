-- User-approved removal of the retired course syllabus import feature.
-- Previously imported classes, tasks, exams, Grade Lab, Vision, timetable import, and Rescue are preserved.
begin;

drop function if exists public.import_learning_syllabus(uuid, text, jsonb, jsonb) restrict;

delete from public.notifications
where href = '/syllabus'
  and event_key like 'syllabus:%'
  and metadata ->> 'category' = 'syllabus';

drop table if exists public.learning_syllabi restrict;

commit;
