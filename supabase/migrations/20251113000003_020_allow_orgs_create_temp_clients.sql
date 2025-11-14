-- Разрешаем организациям создавать временных клиентов для карточек подопечных
-- Организация создает карточку ДО регистрации клиента, поэтому нужен временный клиент
-- При регистрации клиента по ссылке Edge Function обновит client_id в карточке

-- Удаляем старую политику
drop policy if exists clients_insert on clients;

-- Создаем новую политику, разрешающую организациям создавать временных клиентов
-- Проверяем наличие organization_id (более надежно, чем проверка роли)
create policy clients_insert on clients
  for insert with check (
    public.is_service_role()
    or (
      -- Проверяем, что у пользователя есть organization_id (он является организацией)
      -- Это более надежно, чем проверка роли, так как organization_id всегда устанавливается
      public.current_organization_id() is not null
      and invited_by_organization_id = public.current_organization_id()
      and user_id is null  -- Временный клиент, еще не зарегистрирован
      and exists (
        -- Дополнительная проверка: пользователь действительно является организацией
        select 1 from organizations o
        where o.id = public.current_organization_id()
        and o.user_id = auth.uid()
      )
    )
  );

-- Комментарий к политике
comment on policy clients_insert on clients is 
  'Разрешает service_role и организациям создавать временных клиентов (user_id = null) для карточек подопечных. При регистрации клиента Edge Function обновит user_id и client_id в карточке.';

