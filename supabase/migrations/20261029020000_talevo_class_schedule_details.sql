-- Course code, section and credits for a class.
--
-- The form has asked for all three since the schedule screen was built, and
-- ClassSchedule carries them, but class_schedules had no column for any of
-- them. They were written to the device and then dropped on the way to the
-- cloud, so the next launch - which rehydrates from the cloud - handed back a
-- class with an empty course code, and typing it in again changed nothing.

alter table public.class_schedules
  add column if not exists course_code text,
  add column if not exists section text,
  add column if not exists credits numeric(4, 1);

-- A class carries at most a handful of credits; anything else is a typo or a
-- wrong unit, and silently storing it would show up as nonsense in a plan.
alter table public.class_schedules
  drop constraint if exists class_schedules_credits_range;
alter table public.class_schedules
  add constraint class_schedules_credits_range
  check (credits is null or (credits >= 0 and credits <= 30));

-- The one-time local-to-cloud import reads a fixed column list too, so it
-- dropped the same three fields on the way in. Patching the live definition in
-- place rather than restating 23KB of function body by hand: the three lines
-- below are the only ones that change, and re-running this is a no-op once
-- they already read that way.
do $outer$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'import_talevo_v8';

  if definition is null then
    raise notice 'import_talevo_v8 is not installed; nothing to patch';
    return;
  end if;

  patched := replace(
    definition,
    'insert into public.class_schedules (user_id, id, course_id, name, teacher, room, color, day, start_time, end_time, note)',
    'insert into public.class_schedules (user_id, id, course_id, name, course_code, teacher, room, color, day, start_time, end_time, note, section, credits)'
  );
  patched := replace(
    patched,
    'select qa_uid, source_row.id, source_row.course_id, source_row.name, source_row.teacher, source_row.room, source_row.color, source_row.day, source_row.start_time, source_row.end_time, source_row.note',
    'select qa_uid, source_row.id, source_row.course_id, source_row.name, source_row.course_code, source_row.teacher, source_row.room, source_row.color, source_row.day, source_row.start_time, source_row.end_time, source_row.note, source_row.section, source_row.credits'
  );
  patched := replace(
    patched,
    'as source_row(id text, course_id text, name text, teacher text, room text, color text, day smallint, start_time time, end_time time, note text)',
    'as source_row(id text, course_id text, name text, course_code text, teacher text, room text, color text, day smallint, start_time time, end_time time, note text, section text, credits numeric)'
  );

  if patched = definition then
    raise notice 'import_talevo_v8 already carries the class detail columns';
    return;
  end if;

  execute patched;
end
$outer$;
