-- RPC функция для создания/обновления user_profiles
-- Используется при регистрации для установки роли пользователя

create or replace function public.create_user_profile(
  p_role user_role_enum
)
returns user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile user_profiles;
begin
  -- Проверяем, что пользователь авторизован
  if v_user_id is null then
    raise exception 'User not authenticated' using errcode = '42501';
  end if;

  -- Создаем или обновляем запись в user_profiles
  insert into user_profiles (user_id, role)
  values (v_user_id, p_role)
  on conflict (user_id) do update
  set role = p_role
  returning * into v_profile;

  return v_profile;
end;
$$;

-- Даем права на выполнение
grant execute on function public.create_user_profile(user_role_enum) to authenticated;

comment on function public.create_user_profile(user_role_enum)
  is 'Создание или обновление записи в user_profiles с указанной ролью. Используется при регистрации.';

