-- Per-account public profile photo references. Users may only manage their own row.
create table public.user_profile_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_url text not null check (char_length(avatar_url) <= 2048),
  updated_at timestamptz not null default now()
);

alter table public.user_profile_avatars enable row level security;
revoke all on table public.user_profile_avatars from anon;
revoke all on table public.user_profile_avatars from authenticated;
grant select, insert, update, delete on table public.user_profile_avatars to authenticated;

create policy user_profile_avatars_select_own
  on public.user_profile_avatars for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy user_profile_avatars_insert_own
  on public.user_profile_avatars for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy user_profile_avatars_update_own
  on public.user_profile_avatars for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy user_profile_avatars_delete_own
  on public.user_profile_avatars for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 2097152, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_avatars_owner_read
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy profile_avatars_owner_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy profile_avatars_owner_update
  on storage.objects for update to authenticated
  using (bucket_id = 'profile-avatars' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'profile-avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy profile_avatars_owner_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'profile-avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);
