-- Tag each class with its year/level/semester so switching the active
-- academic context shows a separate timetable without moving old classes.
alter table public.class_schedules
  add column academic_level text,
  add column academic_term text,
  add column academic_year text;

update public.class_schedules as schedule
set academic_level = nullif(term.level, ''),
    academic_term = nullif(term.term, ''),
    academic_year = nullif(term.academic_year, '')
from public.academic_terms as term
where term.user_id = schedule.user_id;

alter table public.class_schedules
  add constraint class_schedules_academic_level_length
    check (academic_level is null or char_length(academic_level) between 1 and 60),
  add constraint class_schedules_academic_term_length
    check (academic_term is null or char_length(academic_term) between 1 and 60),
  add constraint class_schedules_academic_year_format
    check (academic_year is null or academic_year ~ '^[0-9]{4}$');

create index class_schedules_academic_scope_idx
  on public.class_schedules (user_id, academic_year, academic_term, academic_level);

create function public.apply_class_schedule_academic_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.academic_level is null or new.academic_term is null or new.academic_year is null then
    select nullif(term.level, ''), nullif(term.term, ''), nullif(term.academic_year, '')
      into new.academic_level, new.academic_term, new.academic_year
    from public.academic_terms as term
    where term.user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger class_schedules_apply_academic_scope
  before insert on public.class_schedules
  for each row execute function public.apply_class_schedule_academic_scope();
