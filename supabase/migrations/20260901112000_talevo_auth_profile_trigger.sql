-- Create the minimum TALEVO profile rows after a Supabase Auth sign-up.
-- The two-step registration values arrive through Auth user metadata.

create or replace function public.handle_new_talevo_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    user_id,
    display_name,
    major,
    university
  )
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'major', '')), 80),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'university', '')), 80)
  )
  on conflict (user_id) do nothing;

  insert into public.academic_terms (
    user_id,
    level,
    term,
    academic_year
  )
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'level', '')), 60),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'term', '')), 60),
    case
      when coalesce(new.raw_user_meta_data ->> 'academic_year', '') ~ '^\d{4}$'
        then new.raw_user_meta_data ->> 'academic_year'
      else ''
    end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_talevo_user() from public;
revoke all on function public.handle_new_talevo_user() from anon;
revoke all on function public.handle_new_talevo_user() from authenticated;

drop trigger if exists on_auth_user_created_talevo on auth.users;
create trigger on_auth_user_created_talevo
  after insert on auth.users
  for each row execute procedure public.handle_new_talevo_user();
