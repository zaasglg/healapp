-- RPC функция для создания организации
-- Решает проблему RLS: создает запись в user_profiles и organizations

create or replace function public.create_organization(
  p_organization_type organization_type_enum,
  p_name text,
  p_phone text default null,
  p_address text default null
)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_existing_org organizations;
  v_current_role user_role_enum;
begin
  -- Проверяем, что пользователь авторизован
  if v_user_id is null then
    raise exception 'User not authenticated' using errcode = '42501';
  end if;

  -- ВАЖНО: Проверяем, что пользователь НЕ является клиентом
  -- Клиенты не могут создавать организации
  v_current_role := public.current_user_role();
  if v_current_role = 'client' then
    raise exception 'Клиенты не могут создавать организации' using errcode = '42501';
  end if;

  -- Проверяем, что организации еще нет
  select * into v_existing_org
  from organizations
  where user_id = v_user_id
  limit 1;

  if v_existing_org is not null then
    -- Организация уже существует, обновляем user_profiles и возвращаем ее
    -- ВАЖНО: НЕ меняем роль, если пользователь является клиентом
    update user_profiles
    set organization_id = v_existing_org.id,
        phone_e164 = coalesce(p_phone, user_profiles.phone_e164)
    where user_id = v_user_id
      and role != 'client' -- НЕ обновляем, если пользователь - клиент
      and (organization_id is null or organization_id != v_existing_org.id or phone_e164 is null);
    return v_existing_org;
  end if;

  -- Создаем запись в organizations
  -- phone обязателен, используем значение по умолчанию если не передан
  insert into organizations (
    user_id,
    organization_type,
    name,
    phone,
    address
  ) values (
    v_user_id,
    p_organization_type,
    p_name,
    coalesce(p_phone, ''),
    p_address
  )
  returning id into v_org_id;

  -- Создаем или обновляем запись в user_profiles с organization_id
  -- ВАЖНО: НЕ меняем роль, если пользователь уже является клиентом
  insert into user_profiles (user_id, role, organization_id, phone_e164)
  values (v_user_id, 'organization', v_org_id, coalesce(p_phone, null))
  on conflict (user_id) do update
  set organization_id = v_org_id,
      phone_e164 = coalesce(p_phone, user_profiles.phone_e164)
  where user_profiles.role != 'client'; -- НЕ меняем роль, если пользователь - клиент

  -- Возвращаем созданную организацию
  select * into v_existing_org
  from organizations
  where id = v_org_id;

  return v_existing_org;
end;
$$;

-- Даем права на выполнение
grant execute on function public.create_organization(organization_type_enum, text, text, text) to authenticated;

comment on function public.create_organization(organization_type_enum, text, text, text)
  is 'Создание записи организации. Автоматически создает запись в user_profiles с ролью organization.';

