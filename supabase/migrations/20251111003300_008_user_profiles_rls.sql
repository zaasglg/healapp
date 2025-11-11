alter table user_profiles enable row level security;

drop policy if exists user_profiles_service_all on user_profiles;
drop policy if exists user_profiles_admin_all on user_profiles;
drop policy if exists user_profiles_self_access on user_profiles;
drop policy if exists user_profiles_self_update on user_profiles;
drop policy if exists user_profiles_insert_service on user_profiles;
drop policy if exists user_profiles_delete_service on user_profiles;

create policy user_profiles_service_all on user_profiles
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy user_profiles_admin_all on user_profiles
  for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy user_profiles_self_select on user_profiles
  for select using (user_id = auth.uid());

create policy user_profiles_self_update on user_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_profiles_insert_service on user_profiles
  for insert with check (public.is_service_role());

create policy user_profiles_delete_service on user_profiles
  for delete using (public.is_service_role() or public.current_user_role() = 'admin');
