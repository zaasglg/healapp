-- Обновляем функцию has_diary_access для поддержки клиентов организаций
-- Клиенты должны иметь доступ если:
-- 1. owner_client_id = client_id (владелец дневника)
-- 2. Есть запись в diary_client_links с accepted_at IS NOT NULL (принятое приглашение)
-- 3. invited_by_organization_id клиента совпадает с organization_id дневника (автоматический доступ)

create or replace function public.has_diary_access(p_diary_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role_enum;
  v_org uuid;
  v_client uuid;
  v_diary record;
  v_org_type organization_type_enum;
  v_employee_role organization_employee_role_enum;
begin
  if public.is_service_role() then
    return true;
  end if;

  v_role := public.current_user_role();
  v_org := public.current_organization_id();
  v_client := public.current_client_id();

  if v_role is null then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  select owner_client_id, organization_id, organization_type, caregiver_id
    into v_diary
  from diaries
  where id = p_diary_id;

  if not found then
    return false;
  end if;

  -- КЛИЕНТ: проверяем доступ через owner_client_id, diary_client_links или invited_by_organization_id
  if v_role = 'client' then
    -- 1. Владелец дневника
    if v_diary.owner_client_id = v_client then
      return true;
    end if;
    
    -- 2. Проверяем diary_client_links (принятое приглашение)
    if exists (
      select 1
      from diary_client_links dcl
      where dcl.diary_id = p_diary_id
        and dcl.client_id = v_client
        and dcl.accepted_at is not null
    ) then
      return true;
    end if;
    
    -- 3. Проверяем invited_by_organization_id клиента (автоматический доступ для клиентов, приглашенных организацией)
    if v_diary.organization_id is not null then
      if exists (
        select 1
        from clients c
        where c.id = v_client
          and c.invited_by_organization_id = v_diary.organization_id
      ) then
        return true;
      end if;
    end if;
    
    return false;
  end if;

  if v_role = 'organization' then
    if v_diary.organization_id = v_org then
      return true;
    end if;
    if v_diary.caregiver_id = v_org then
      return true;
    end if;
  end if;

  if v_role = 'org_employee' then
    if v_org is null then
      select organization_id, role
        into v_org, v_employee_role
      from organization_employees
      where user_id = auth.uid()
      limit 1;
    else
      v_employee_role := public.current_employee_role();
    end if;

    select organization_type
      into v_org_type
    from organizations
    where id = v_org;

    if v_org_type = 'pension' and v_diary.organization_id = v_org then
      -- Проверяем, не отозван ли доступ
      if exists (
        select 1
        from diary_employee_access dea
        where dea.diary_id = p_diary_id
          and dea.user_id = auth.uid()
          and dea.revoked_at is not null
      ) then
        return false;
      end if;
      return true;
    end if;

    if v_org_type = 'patronage_agency'
       and v_diary.organization_id = v_org
       and public.has_active_employee_access(p_diary_id) then
      return true;
    end if;

    if v_org_type = 'caregiver' and v_diary.caregiver_id = v_org then
      return true;
    end if;
  end if;

  return false;
end;
$$;

comment on function public.has_diary_access(uuid)
  is 'Проверяет доступ к дневнику. Для клиентов: проверка через owner_client_id, diary_client_links (принятое приглашение) и invited_by_organization_id (автоматический доступ).';

