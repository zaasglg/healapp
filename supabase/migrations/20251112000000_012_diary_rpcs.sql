-- RPC функции для работы с дневниками и доступами
-- Шаг 16.3: Дневники и доступы

-- Функция создания дневника
create or replace function public.create_diary(
  p_patient_card_id uuid,
  p_metrics jsonb default '[]'::jsonb,
  p_organization_id uuid default null,
  p_organization_type organization_type_enum default null,
  p_caregiver_id uuid default null
)
returns diaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role user_role_enum;
  v_client_id uuid;
  v_org_id uuid;
  v_org_type organization_type_enum;
  v_caregiver_id uuid;
  v_diary diaries;
  v_metric jsonb;
  v_metric_key text;
  v_is_pinned boolean;
  v_metric_id uuid;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    v_actor_role := public.current_user_role();
    
    -- Клиенты могут создавать дневники для своих карточек
    if v_actor_role = 'client' then
      v_client_id := public.current_client_id();
      if v_client_id is null then
        raise exception 'Не удалось определить клиента' using errcode = '42501';
      end if;
      
      -- Проверяем, что карточка принадлежит клиенту
      if not exists (
        select 1 from patient_cards 
        where id = p_patient_card_id and client_id = v_client_id
      ) then
        raise exception 'Карточка не принадлежит вам' using errcode = '42501';
      end if;
      
      -- Проверяем, что для этой карточки еще нет активного дневника
      if exists (
        select 1 from diaries 
        where patient_card_id = p_patient_card_id and status = 'active'
      ) then
        raise exception 'Для этой карточки уже существует активный дневник' using errcode = '23505';
      end if;
      
    -- Организации могут создавать дневники от имени клиентов
    elsif v_actor_role in ('organization', 'org_employee') then
      v_org_id := public.current_organization_id();
      v_org_type := public.current_organization_type();
      
      if v_org_id is null or v_org_type is null then
        raise exception 'Не удалось определить организацию' using errcode = '42501';
      end if;
      
      -- Для организаций client_id берется из карточки
      select client_id into v_client_id 
      from patient_cards 
      where id = p_patient_card_id;
      
      if v_client_id is null then
        raise exception 'Карточка не найдена' using errcode = 'P0002';
      end if;
      
      -- Проверяем уникальность активного дневника
      if exists (
        select 1 from diaries 
        where patient_card_id = p_patient_card_id and status = 'active'
      ) then
        raise exception 'Для этой карточки уже существует активный дневник' using errcode = '23505';
      end if;
      
      -- Устанавливаем organization_id и organization_type
      p_organization_id := v_org_id;
      p_organization_type := v_org_type;
      
    else
      raise exception 'Недостаточно прав для создания дневника' using errcode = '42501';
    end if;
  else
    -- Service role: client_id берется из карточки
    select client_id into v_client_id 
    from patient_cards 
    where id = p_patient_card_id;
    
    if v_client_id is null then
      raise exception 'Карточка не найдена' using errcode = 'P0002';
    end if;
  end if;

  -- Создаем дневник
  insert into diaries (
    owner_client_id,
    patient_card_id,
    organization_id,
    organization_type,
    caregiver_id,
    created_by,
    status
  ) values (
    v_client_id,
    p_patient_card_id,
    p_organization_id,
    p_organization_type,
    p_caregiver_id,
    auth.uid(),
    'active'
  )
  returning * into v_diary;

  -- Создаем метрики дневника
  if p_metrics is not null and jsonb_array_length(p_metrics) > 0 then
    for v_metric in select * from jsonb_array_elements(p_metrics)
    loop
      v_metric_key := v_metric->>'metric_key';
      v_is_pinned := coalesce((v_metric->>'is_pinned')::boolean, false);
      
      if v_metric_key is not null then
        insert into diary_metrics (
          diary_id,
          metric_key,
          is_pinned,
          metadata
        ) values (
          v_diary.id,
          v_metric_key,
          v_is_pinned,
          coalesce(v_metric->'metadata', '{}'::jsonb)
        );
      end if;
    end loop;
  end if;

  return v_diary;
end;
$$;

comment on function public.create_diary(uuid, jsonb, uuid, organization_type_enum, uuid)
  is 'Создание дневника. Доступно клиентам (для своих карточек) и организациям (от имени клиентов).';

-- Функция назначения сотрудника к дневнику (для патронажных агентств)
create or replace function public.assign_employee_to_diary(
  p_diary_id uuid,
  p_user_id uuid
)
returns diary_employee_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role user_role_enum;
  v_org_id uuid;
  v_org_type organization_type_enum;
  v_diary diaries;
  v_access diary_employee_access;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    v_actor_role := public.current_user_role();
    
    if v_actor_role not in ('organization', 'org_employee') then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    
    if v_actor_role = 'org_employee' and not public.current_user_has_manager_permissions() then
      raise exception 'Требуются права менеджера' using errcode = '42501';
    end if;
    
    v_org_id := public.current_organization_id();
    v_org_type := public.current_organization_type();
    
    if v_org_id is null or v_org_type is null then
      raise exception 'Не удалось определить организацию' using errcode = '42501';
    end if;
    
    -- Проверяем, что дневник принадлежит организации
    select * into v_diary from diaries where id = p_diary_id;
    if not found then
      raise exception 'Дневник не найден' using errcode = 'P0002';
    end if;
    
    if v_diary.organization_id <> v_org_id then
      raise exception 'Дневник не принадлежит вашей организации' using errcode = '42501';
    end if;
    
    -- Только патронажные агентства могут назначать сотрудников
    if v_org_type <> 'patronage_agency' then
      raise exception 'Назначение сотрудников доступно только для патронажных агентств' using errcode = '42501';
    end if;
    
    -- Проверяем, что пользователь - сотрудник организации
    if not exists (
      select 1 from organization_employees 
      where user_id = p_user_id and organization_id = v_org_id
    ) then
      raise exception 'Пользователь не является сотрудником организации' using errcode = '42501';
    end if;
  else
    -- Service role: проверяем дневник
    select * into v_diary from diaries where id = p_diary_id;
    if not found then
      raise exception 'Дневник не найден' using errcode = 'P0002';
    end if;
  end if;

  -- Проверяем, нет ли уже доступа
  if exists (
    select 1 from diary_employee_access 
    where diary_id = p_diary_id 
      and user_id = p_user_id 
      and revoked_at is null
  ) then
    raise exception 'Доступ уже предоставлен' using errcode = '23505';
  end if;

  -- Создаем или обновляем доступ
  insert into diary_employee_access (
    diary_id,
    user_id,
    granted_by
  ) values (
    p_diary_id,
    p_user_id,
    auth.uid()
  )
  on conflict (diary_id, user_id) 
  do update set
    revoked_at = null,
    granted_by = auth.uid(),
    granted_at = timezone('utc', now())
  returning * into v_access;

  return v_access;
end;
$$;

comment on function public.assign_employee_to_diary(uuid, uuid)
  is 'Назначение сотрудника к дневнику. Доступно только патронажным агентствам (менеджерам).';

-- Функция отзыва доступа сотрудника от дневника
create or replace function public.remove_employee_from_diary(
  p_diary_id uuid,
  p_user_id uuid
)
returns diary_employee_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role user_role_enum;
  v_org_id uuid;
  v_access diary_employee_access;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    v_actor_role := public.current_user_role();
    
    if v_actor_role not in ('organization', 'org_employee', 'client') then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    
    -- Клиент-владелец может отозвать доступ
    if v_actor_role = 'client' then
      if not exists (
        select 1 from diaries 
        where id = p_diary_id 
          and owner_client_id = public.current_client_id()
      ) then
        raise exception 'Дневник не принадлежит вам' using errcode = '42501';
      end if;
    else
      -- Организация может отозвать доступ своих сотрудников
      if v_actor_role = 'org_employee' and not public.current_user_has_manager_permissions() then
        raise exception 'Требуются права менеджера' using errcode = '42501';
      end if;
      
      v_org_id := public.current_organization_id();
      if v_org_id is null then
        raise exception 'Не удалось определить организацию' using errcode = '42501';
      end if;
      
      if not exists (
        select 1 from diaries 
        where id = p_diary_id and organization_id = v_org_id
      ) then
        raise exception 'Дневник не принадлежит вашей организации' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Отзываем доступ
  update diary_employee_access
  set revoked_at = timezone('utc', now()),
      revoked_by = auth.uid()
  where diary_id = p_diary_id
    and user_id = p_user_id
    and revoked_at is null
  returning * into v_access;

  if not found then
    raise exception 'Доступ не найден' using errcode = 'P0002';
  end if;

  return v_access;
end;
$$;

comment on function public.remove_employee_from_diary(uuid, uuid)
  is 'Отзыв доступа сотрудника от дневника. Доступно владельцу дневника (клиенту) и организации.';

-- Функция предоставления доступа к дневнику клиенту (через ссылку)
create or replace function public.share_diary_with_client(
  p_diary_id uuid,
  p_client_id uuid
)
returns diaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role user_role_enum;
  v_org_id uuid;
  v_diary diaries;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    v_actor_role := public.current_user_role();
    
    if v_actor_role not in ('organization', 'org_employee') then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    
    v_org_id := public.current_organization_id();
    if v_org_id is null then
      raise exception 'Не удалось определить организацию' using errcode = '42501';
    end if;
    
    -- Проверяем, что дневник принадлежит организации
    select * into v_diary from diaries where id = p_diary_id;
    if not found then
      raise exception 'Дневник не найден' using errcode = 'P0002';
    end if;
    
    if v_diary.organization_id <> v_org_id then
      raise exception 'Дневник не принадлежит вашей организации' using errcode = '42501';
    end if;
  else
    select * into v_diary from diaries where id = p_diary_id;
    if not found then
      raise exception 'Дневник не найден' using errcode = 'P0002';
    end if;
  end if;

  -- Обновляем владельца дневника на клиента
  update diaries
  set owner_client_id = p_client_id
  where id = p_diary_id
  returning * into v_diary;

  return v_diary;
end;
$$;

comment on function public.share_diary_with_client(uuid, uuid)
  is 'Предоставление доступа к дневнику клиенту. Доступно организациям.';

-- Функция отзыва доступа к дневнику
create or replace function public.revoke_diary_access(
  p_diary_id uuid,
  p_organization_id uuid default null,
  p_caregiver_id uuid default null
)
returns diaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role user_role_enum;
  v_client_id uuid;
  v_diary diaries;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    v_actor_role := public.current_user_role();
    
    -- Только владелец дневника (клиент) может отозвать доступ
    if v_actor_role <> 'client' then
      raise exception 'Только владелец дневника может отозвать доступ' using errcode = '42501';
    end if;
    
    v_client_id := public.current_client_id();
    if v_client_id is null then
      raise exception 'Не удалось определить клиента' using errcode = '42501';
    end if;
    
    -- Проверяем, что дневник принадлежит клиенту
    select * into v_diary from diaries where id = p_diary_id;
    if not found then
      raise exception 'Дневник не найден' using errcode = 'P0002';
    end if;
    
    if v_diary.owner_client_id <> v_client_id then
      raise exception 'Дневник не принадлежит вам' using errcode = '42501';
    end if;
  else
    select * into v_diary from diaries where id = p_diary_id;
    if not found then
      raise exception 'Дневник не найден' using errcode = 'P0002';
    end if;
  end if;

  -- Отзываем доступ организации или сиделки
  if p_organization_id is not null then
    update diaries
    set organization_id = null,
        organization_type = null
    where id = p_diary_id
      and organization_id = p_organization_id
    returning * into v_diary;
  elsif p_caregiver_id is not null then
    update diaries
    set caregiver_id = null
    where id = p_diary_id
      and caregiver_id = p_caregiver_id
    returning * into v_diary;
  else
    raise exception 'Необходимо указать organization_id или caregiver_id' using errcode = '23514';
  end if;

  if not found then
    raise exception 'Доступ не найден' using errcode = 'P0002';
  end if;

  return v_diary;
end;
$$;

comment on function public.revoke_diary_access(uuid, uuid, uuid)
  is 'Отзыв доступа к дневнику. Доступно владельцу дневника (клиенту).';

-- Предоставляем права на выполнение функций
revoke all on function public.create_diary(uuid, jsonb, uuid, organization_type_enum, uuid) from public;
revoke all on function public.assign_employee_to_diary(uuid, uuid) from public;
revoke all on function public.remove_employee_from_diary(uuid, uuid) from public;
revoke all on function public.share_diary_with_client(uuid, uuid) from public;
revoke all on function public.revoke_diary_access(uuid, uuid, uuid) from public;

grant execute on function public.create_diary(uuid, jsonb, uuid, organization_type_enum, uuid) to authenticated;
grant execute on function public.assign_employee_to_diary(uuid, uuid) to authenticated;
grant execute on function public.remove_employee_from_diary(uuid, uuid) to authenticated;
grant execute on function public.share_diary_with_client(uuid, uuid) to authenticated;
grant execute on function public.revoke_diary_access(uuid, uuid, uuid) to authenticated;

