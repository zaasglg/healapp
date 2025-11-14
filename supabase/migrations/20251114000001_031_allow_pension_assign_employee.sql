-- Обновляем функцию assign_employee_to_diary для поддержки пансионатов
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
    
    -- Пансионаты и патронажные агентства могут назначать сотрудников
    if v_org_type not in ('patronage_agency', 'pension') then
      raise exception 'Назначение сотрудников доступно только для пансионатов и патронажных агентств' using errcode = '42501';
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
  is 'Назначение сотрудника к дневнику. Доступно для пансионатов и патронажных агентств (менеджерам).';

