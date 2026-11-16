-- Developer portrait: public read; only the support admin can change it.
create table public.developer_profile (id boolean primary key default true check(id), avatar text not null check(length(avatar) <= 600000 and avatar ~ '^data:image/(png|jpeg|webp);base64,'));
alter table public.developer_profile enable row level security;
revoke all on public.developer_profile from public, anon, authenticated;
grant select on public.developer_profile to authenticated;
grant insert, update on public.developer_profile to authenticated;
create policy developer_read on public.developer_profile for select to authenticated using(true);
create policy developer_insert on public.developer_profile for insert to authenticated with check((select public.is_support_admin()));
create policy developer_update on public.developer_profile for update to authenticated using((select public.is_support_admin())) with check((select public.is_support_admin()));
