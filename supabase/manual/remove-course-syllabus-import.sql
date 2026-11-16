-- REVIEW BEFORE RUNNING. This file has NOT been applied to any database.
-- Permanently removes only the retired course syllabus import feature:
--   * import_learning_syllabus RPC
--   * learning_syllabi history, weekly topics, and source document metadata
--   * notifications created by that RPC
-- Previously imported classes, tasks, exams, and Grade Lab data are preserved.
-- Timetable-image import, Vision, and Rescue remain available.
-- Keep the deployed learning_tools migration unchanged.
-- RESTRICT stops this transaction if unexpected dependencies exist.

begin;

drop function if exists public.import_learning_syllabus(uuid, text, jsonb, jsonb) restrict;

delete from public.notifications
where href = '/syllabus'
  and event_key like 'syllabus:%'
  and metadata ->> 'category' = 'syllabus';

drop table if exists public.learning_syllabi restrict;

commit;
