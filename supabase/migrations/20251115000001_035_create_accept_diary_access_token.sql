-- Функция для принятия приглашения к дневнику по токену
-- ВАЖНО: Эта функция НЕ меняет роль пользователя в user_profiles
-- Она только обновляет caregiver_id или organization_id в дневнике

create or replace function public.accept_diary_access_token(
  p_link_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_diary diaries;
  v_user_role user_role_enum;
  v_org_id uuid;
  v_org_type organization_type_enum;
  v_updated_rows int;
begin
  -- Находим ссылку по токену
  select * into v_link
  from diary_external_access_links
  where link_token = p_link_token
    and revoked_at is null
    and (expires_at is null or expires_at > timezone('utc', now()));

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Ссылка не найдена или истекла'
    );
  end if;

  -- Получаем дневник
  select * into v_diary
  from diaries
  where id = v_link.diary_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Дневник не найден'
    );
  end if;

  -- Определяем роль текущего пользователя
  v_user_role := public.current_user_role();
  
  if v_user_role is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Не удалось определить роль пользователя'
    );
  end if;

  -- ВАЖНО: Если пользователь - клиент, НЕ даем ему доступ через эту функцию
  -- Клиенты получают доступ через diary_client_links, а не через caregiver_id
  if v_user_role = 'client' then
    return jsonb_build_object(
      'success', false,
      'error', 'Клиенты не могут принимать приглашения через эту функцию'
    );
  end if;

  -- Для организаций и сиделок
  if v_user_role = 'organization' then
    v_org_id := public.current_organization_id();
    v_org_type := public.current_organization_type();
    
    if v_org_id is null or v_org_type is null then
      return jsonb_build_object(
        'success', false,
        'error', 'Не удалось определить организацию'
      );
    end if;

    -- Если это сиделка (caregiver), обновляем caregiver_id
    if v_org_type = 'caregiver' then
      update diaries
      set caregiver_id = v_org_id
      where id = v_diary.id;
      
      get diagnostics v_updated_rows = row_count;
      
      if v_updated_rows = 0 then
        return jsonb_build_object(
          'success', false,
          'error', 'Не удалось обновить дневник'
        );
      end if;
    else
      -- Для других организаций обновляем organization_id
      update diaries
      set organization_id = v_org_id,
          organization_type = v_org_type
      where id = v_diary.id;
      
      get diagnostics v_updated_rows = row_count;
      
      if v_updated_rows = 0 then
        return jsonb_build_object(
          'success', false,
          'error', 'Не удалось обновить дневник'
        );
      end if;
    end if;
  elsif v_user_role = 'org_employee' then
    -- Сотрудники организаций не могут принимать приглашения напрямую
    -- Они получают доступ через assign_employee_to_diary
    return jsonb_build_object(
      'success', false,
      'error', 'Сотрудники организаций не могут принимать приглашения напрямую'
    );
  else
    return jsonb_build_object(
      'success', false,
      'error', 'Недостаточно прав для принятия приглашения'
    );
  end if;

  -- Помечаем ссылку как использованную (опционально, можно оставить для повторного использования)
  -- update diary_external_access_links
  -- set revoked_at = timezone('utc', now())
  -- where id = v_link.id;

  return jsonb_build_object(
    'success', true,
    'diary_id', v_diary.id
  );
end;
$$;

comment on function public.accept_diary_access_token(text)
  is 'Принятие приглашения к дневнику по токену. Доступно только для организаций и сиделок. НЕ меняет роль пользователя в user_profiles.';

-- Даем права на выполнение
revoke all on function public.accept_diary_access_token(text) from public;
grant execute on function public.accept_diary_access_token(text) to authenticated;

