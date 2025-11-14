-- Вспомогательные функции для определения текущей роли и прав
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select auth.role() = 'service_role';
$$;

create or replace function public.current_user_role()
returns user_role_enum
language sql
stable
security definer
set search_path = public
as $$
  select role from user_profiles where user_id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from user_profiles where user_id = auth.uid();
$$;

create or replace function public.current_employee_role()
returns organization_employee_role_enum
language sql
stable
security definer
set search_path = public
as $$
  select role from organization_employees where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Если пользователь - это организация (user_id в таблице organizations)
    (select id from organizations where user_id = auth.uid() limit 1),
    -- Если пользователь - сотрудник организации
    (select organization_id from organization_employees where user_id = auth.uid() limit 1),
    -- Если пользователь - клиент с organization_id в user_profiles
    (select organization_id from user_profiles where user_id = auth.uid())
  );
$$;

create or replace function public.current_organization_type()
returns organization_type_enum
language sql
stable
security definer
set search_path = public
as $$
  select organization_type
  from organizations
  where id = public.current_organization_id();
$$;

create or replace function public.current_user_has_manager_permissions()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role_enum;
  v_employee_role organization_employee_role_enum;
begin
  if public.is_service_role() then
    return true;
  end if;

  v_role := public.current_user_role();

  if v_role = 'admin' then
    return true;
  end if;

  if v_role = 'organization' then
    return true;
  end if;

  if v_role = 'org_employee' then
    v_employee_role := public.current_employee_role();
    return v_employee_role in ('admin', 'manager');
  end if;

  return false;
end;
$$;

create or replace function public.has_active_employee_access(p_diary_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from diary_employee_access dea
    where dea.diary_id = p_diary_id
      and dea.user_id = auth.uid()
      and dea.revoked_at is null
  );
$$;

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

  if v_role = 'client' and v_diary.owner_client_id = v_client then
    return true;
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

create or replace function public.has_patient_card_access(p_card_id uuid)
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

  if v_role = 'client' then
    return exists (
      select 1 from patient_cards pc
      where pc.id = p_card_id and pc.client_id = v_client
    );
  end if;

  if v_role = 'organization' then
    return exists (
      select 1
      from patient_cards pc
      where pc.id = p_card_id
        and (
          exists (
            select 1
            from clients c
            where c.id = pc.client_id
              and (c.invited_by_organization_id = v_org or c.invited_by_caregiver_id = v_org)
          )
          or exists (
            select 1
            from diaries d
            where d.patient_card_id = pc.id
              and (d.organization_id = v_org or d.caregiver_id = v_org)
          )
        )
    );
  end if;

  if v_role = 'org_employee' then
    return exists (
      select 1
      from diaries d
      where d.patient_card_id = p_card_id
        and public.has_diary_access(d.id)
    );
  end if;

  return false;
end;
$$;

create or replace function public.has_client_access(p_client_id uuid)
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

  if v_role = 'client' and p_client_id = v_client then
    return true;
  end if;

  if v_role = 'organization' then
    return exists (
      select 1
      from clients c
      where c.id = p_client_id
        and (c.invited_by_organization_id = v_org or c.invited_by_caregiver_id = v_org)
    )
    or exists (
      select 1
      from diaries d
      where d.owner_client_id = p_client_id
        and (d.organization_id = v_org or d.caregiver_id = v_org)
    );
  end if;

  if v_role = 'org_employee' then
    return exists (
      select 1
      from diaries d
      where d.owner_client_id = p_client_id
        and public.has_diary_access(d.id)
    );
  end if;

  return false;
end;
$$;

create or replace function public.has_organization_access(p_organization_id uuid)
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
begin
  if public.is_service_role() then
    return true;
  end if;

  v_role := public.current_user_role();
  v_org := public.current_organization_id();
  v_client := public.current_client_id();

  if v_role = 'admin' then
    return true;
  end if;

  -- Проверка для организаций (используем проверку через таблицу organizations, если role = null)
  if (v_role in ('organization', 'org_employee') or (v_role is null and v_org is not null)) and v_org = p_organization_id then
    return true;
  end if;

  if v_role = 'client' then
    return exists (
      select 1
      from diaries d
      where d.owner_client_id = v_client
        and (d.organization_id = p_organization_id or d.caregiver_id = p_organization_id)
    );
  end if;

  return false;
end;
$$;

create or replace function public.user_in_current_org(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_employees oe
    where oe.user_id = p_user_id
      and oe.organization_id = public.current_organization_id()
  );
$$;

create or replace function public.invite_visible_to_current_user(p_invite_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role_enum;
  v_org uuid;
begin
  if public.is_service_role() then
    return true;
  end if;

  v_role := public.current_user_role();
  if v_role = 'admin' then
    return true;
  end if;

  v_org := public.current_organization_id();

  -- Проверка для организаций (используем проверку через таблицу organizations, если role = null)
  if v_role = 'organization' or (v_role is null and v_org is not null) then
    return exists (
      select 1 from organization_invite_tokens oit
      where oit.invite_id = p_invite_id
        and oit.organization_id = v_org
    )
    or exists (
      select 1 from organization_client_invite_tokens ocit
      where ocit.invite_id = p_invite_id
        and ocit.organization_id = v_org
    )
    or exists (
      select 1 from caregiver_client_invite_tokens ccit
      where ccit.invite_id = p_invite_id
        and ccit.caregiver_id = v_org
    );
  end if;

  if v_role = 'org_employee' and public.current_user_has_manager_permissions() then
    return exists (
      select 1 from organization_invite_tokens oit
      where oit.invite_id = p_invite_id
        and oit.organization_id = v_org
    )
    or exists (
      select 1 from organization_client_invite_tokens ocit
      where ocit.invite_id = p_invite_id
        and ocit.organization_id = v_org
    );
  end if;

  return false;
end;
$$;

-- Включаем RLS для основных таблиц
alter table organizations enable row level security;
alter table organization_employees enable row level security;
alter table clients enable row level security;

-- Политики для таблицы organizations
create policy organizations_service_role_all on organizations
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy organizations_admin_all on organizations
  for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy organizations_self_select on organizations
  for select using (public.has_organization_access(id));

create policy organizations_self_modify on organizations
  for update using (
    public.has_organization_access(id) and public.current_user_has_manager_permissions()
  ) with check (
    public.has_organization_access(id)
  );

create policy organizations_self_insert on organizations
  for insert with check (
    public.is_service_role()
    or public.current_user_role() in ('admin', 'organization')
  );

create policy organizations_service_delete on organizations
  for delete using (public.is_service_role() or public.current_user_role() = 'admin');

-- Политики для organization_employees
create policy organization_employees_service_all on organization_employees
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy organization_employees_admin_all on organization_employees
  for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy organization_employees_select on organization_employees
  for select using (
    public.has_organization_access(organization_id)
    or user_id = auth.uid()
  );

create policy organization_employees_manage on organization_employees
  for update using (
    public.has_organization_access(organization_id)
    or user_id = auth.uid()
  ) with check (
    public.has_organization_access(organization_id)
    or user_id = auth.uid()
  );

create policy organization_employees_insert on organization_employees
  for insert with check (
    public.is_service_role()
    or (
      public.has_organization_access(organization_id)
      and public.current_user_has_manager_permissions()
    )
  );

create policy organization_employees_delete on organization_employees
  for delete using (
    public.is_service_role()
    or (
      public.has_organization_access(organization_id)
      and public.current_user_has_manager_permissions()
    )
  );

-- Политики для clients
create policy clients_service_all on clients
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy clients_admin_all on clients
  for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy clients_select on clients
  for select using (public.has_client_access(id));

create policy clients_update on clients
  for update using (
    public.is_service_role()
    or id = public.current_client_id()
    or public.has_client_access(id)
  ) with check (
    public.is_service_role()
    or id = public.current_client_id()
    or public.has_client_access(id)
  );

create policy clients_insert on clients
  for insert with check (public.is_service_role());

create policy clients_delete on clients
  for delete using (public.is_service_role() or public.current_user_role() = 'admin');

-- Политики для patient_cards
create policy patient_cards_service_all on patient_cards
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy patient_cards_select on patient_cards
  for select using (public.has_patient_card_access(id));

create policy patient_cards_insert on patient_cards
  for insert with check (
    public.is_service_role()
    or (
      public.current_user_role() = 'client'
      and client_id = public.current_client_id()
    )
    or (
      public.current_user_role() = 'organization'
      and public.has_client_access(client_id)
    )
  );

create policy patient_cards_update on patient_cards
  for update using (
    public.is_service_role()
    or (
      public.current_user_role() = 'client'
      and client_id = public.current_client_id()
    )
    or (
      public.current_user_role() in ('organization', 'org_employee')
      and public.has_patient_card_access(id)
    )
  ) with check (
    public.is_service_role()
    or (
      public.current_user_role() = 'client'
      and client_id = public.current_client_id()
    )
    or (
      public.current_user_role() in ('organization', 'org_employee')
      and public.has_patient_card_access(id)
    )
  );

create policy patient_cards_delete on patient_cards
  for delete using (public.is_service_role() or public.current_user_role() = 'admin');

-- Политики для diaries
create policy diaries_service_all on diaries
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy diaries_select on diaries
  for select using (public.has_diary_access(id));

create policy diaries_insert on diaries
  for insert with check (
    public.is_service_role()
    or (public.current_user_role() = 'client' and owner_client_id = public.current_client_id())
    or (
      public.current_user_role() = 'organization'
      and (organization_id = public.current_organization_id() or caregiver_id = public.current_organization_id())
    )
    or public.current_user_role() = 'admin'
  );

create policy diaries_update on diaries
  for update using (
    public.has_diary_access(id)
    and (
      public.is_service_role()
      or public.current_user_role() in ('admin', 'client', 'organization')
      or (
        public.current_user_role() = 'org_employee'
        and public.current_user_has_manager_permissions()
        and public.current_organization_type() = 'patronage_agency'
        and public.has_active_employee_access(id)
      )
    )
  ) with check (
    public.has_diary_access(id)
  );

create policy diaries_delete on diaries
  for delete using (
    public.is_service_role()
    or (public.current_user_role() = 'client' and owner_client_id = public.current_client_id())
    or public.current_user_role() = 'admin'
  );

-- Политики для diary_metrics
create policy diary_metrics_service_all on diary_metrics
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy diary_metrics_select on diary_metrics
  for select using (public.has_diary_access(diary_id));

create policy diary_metrics_modify on diary_metrics
  for all using (
    public.has_diary_access(diary_id)
    and (
      public.is_service_role()
      or public.current_user_role() in ('admin', 'client', 'organization', 'org_employee')
    )
  ) with check (
    public.has_diary_access(diary_id)
  );

-- Политики для diary_metric_values
create policy diary_metric_values_service_all on diary_metric_values
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy diary_metric_values_select on diary_metric_values
  for select using (public.has_diary_access(diary_id));

create policy diary_metric_values_modify on diary_metric_values
  for all using (
    public.has_diary_access(diary_id)
    and (
      public.is_service_role()
      or public.current_user_role() in ('admin', 'client', 'organization', 'org_employee')
    )
  ) with check (
    public.has_diary_access(diary_id)
  );

-- Политики для diary_history
create policy diary_history_service_all on diary_history
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy diary_history_select on diary_history
  for select using (public.has_diary_access(diary_id));

-- Политики для diary_employee_access
create policy diary_employee_access_service_all on diary_employee_access
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy diary_employee_access_select on diary_employee_access
  for select using (public.has_diary_access(diary_id));

create policy diary_employee_access_modify on diary_employee_access
  for insert with check (
    public.is_service_role()
    or (
      public.has_diary_access(diary_id)
      and public.current_user_has_manager_permissions()
      and public.current_user_role() in ('organization', 'org_employee')
      and public.user_in_current_org(user_id)
    )
  );

create policy diary_employee_access_update on diary_employee_access
  for update using (
    public.is_service_role()
    or (
      public.has_diary_access(diary_id)
      and public.current_user_has_manager_permissions()
    )
  ) with check (
    public.has_diary_access(diary_id)
  );

create policy diary_employee_access_delete on diary_employee_access
  for delete using (
    public.is_service_role()
    or (
      public.has_diary_access(diary_id)
      and public.current_user_has_manager_permissions()
    )
  );

-- Политики для diary_client_links
create policy diary_client_links_service_all on diary_client_links
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy diary_client_links_access on diary_client_links
  for all using (
    public.has_diary_access(diary_id)
    and (
      public.is_service_role()
      or public.current_user_role() in ('admin', 'client', 'organization', 'org_employee')
    )
  ) with check (
    public.has_diary_access(diary_id)
  );

-- Политики для diary_external_access_links
create policy diary_external_links_service_all on diary_external_access_links
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy diary_external_links_access on diary_external_access_links
  for all using (
    public.has_diary_access(diary_id)
    and (
      public.is_service_role()
      or public.current_user_role() in ('admin', 'client', 'organization', 'org_employee')
    )
  ) with check (
    public.has_diary_access(diary_id)
  );

-- Политики для invite_tokens и специализированных таблиц
create policy invite_tokens_service_all on invite_tokens
  for all using (public.is_service_role()) with check (public.is_service_role());

create policy invite_tokens_visible on invite_tokens
  for select using (public.invite_visible_to_current_user(id));

create policy invite_tokens_modify on invite_tokens
  for update using (
    public.invite_visible_to_current_user(id)
  ) with check (
    public.invite_visible_to_current_user(id)
  );

create policy invite_tokens_insert on invite_tokens
  for insert with check (
    public.is_service_role()
    or public.invite_visible_to_current_user(id)
  );

create policy organization_invite_tokens_access on organization_invite_tokens
  for all using (
    public.is_service_role()
    or public.invite_visible_to_current_user(invite_id)
  ) with check (
    public.is_service_role()
    or public.invite_visible_to_current_user(invite_id)
  );

create policy caregiver_invite_tokens_access on caregiver_client_invite_tokens
  for all using (
    public.is_service_role()
    or public.invite_visible_to_current_user(invite_id)
  ) with check (
    public.is_service_role()
    or public.invite_visible_to_current_user(invite_id)
  );

create policy organization_client_invite_tokens_access on organization_client_invite_tokens
  for all using (
    public.is_service_role()
    or public.invite_visible_to_current_user(invite_id)
  ) with check (
    public.is_service_role()
    or public.invite_visible_to_current_user(invite_id)
  );

create policy admin_static_tokens_access on admin_static_tokens
  for all using (public.is_service_role() or public.current_user_role() = 'admin')
  with check (public.is_service_role() or public.current_user_role() = 'admin');

-- Политики для справочников
create policy metric_catalog_read on metric_catalog
  for select using (auth.role() = 'authenticated' or public.is_service_role() or public.current_user_role() = 'admin');

create policy metric_catalog_modify on metric_catalog
  for all using (public.is_service_role() or public.current_user_role() = 'admin')
  with check (public.is_service_role() or public.current_user_role() = 'admin');

create policy medication_dictionary_read on medication_dictionary
  for select using (auth.role() = 'authenticated' or public.is_service_role() or public.current_user_role() = 'admin');

create policy medication_dictionary_modify on medication_dictionary
  for all using (public.is_service_role() or public.current_user_role() = 'admin')
  with check (public.is_service_role() or public.current_user_role() = 'admin');

create policy vitamin_dictionary_read on vitamin_dictionary
  for select using (auth.role() = 'authenticated' or public.is_service_role() or public.current_user_role() = 'admin');

create policy vitamin_dictionary_modify on vitamin_dictionary
  for all using (public.is_service_role() or public.current_user_role() = 'admin')
  with check (public.is_service_role() or public.current_user_role() = 'admin');

-- Журналы и мониторинг доступны только админам и сервисной роли
create policy activity_log_access on activity_log
  for all using (public.is_service_role() or public.current_user_role() = 'admin')
  with check (public.is_service_role() or public.current_user_role() = 'admin');

create policy support_logs_access on support_logs
  for all using (public.is_service_role() or public.current_user_role() = 'admin')
  with check (public.is_service_role() or public.current_user_role() = 'admin');

create policy dashboard_counters_access on dashboard_counters
  for all using (public.is_service_role() or public.current_user_role() = 'admin')
  with check (public.is_service_role() or public.current_user_role() = 'admin');

create policy diary_activity_snapshots_access on diary_activity_snapshots
  for all using (
    public.is_service_role()
    or (
      public.has_diary_access(diary_id)
      and public.current_user_role() in ('admin', 'client', 'organization', 'org_employee')
    )
  ) with check (
    public.has_diary_access(diary_id)
  );
