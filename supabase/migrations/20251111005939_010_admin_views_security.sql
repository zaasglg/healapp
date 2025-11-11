-- Ограничиваем доступ к материализованным представлениям админ-панели
revoke all on admin_invites_view   from anon, authenticated;
revoke all on admin_users_view     from anon, authenticated;
revoke all on admin_diaries_view   from anon, authenticated;

grant select on admin_invites_view to service_role;
grant select on admin_users_view   to service_role;
grant select on admin_diaries_view to service_role;
