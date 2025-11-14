-- Исправление политики clients_insert для более надежной работы
-- Проблема: политика может не работать из-за сложной проверки exists
-- Решение: упрощаем проверку, используя только current_organization_id()

-- Удаляем старую политику
drop policy if exists clients_insert on clients;

-- Создаем упрощенную политику
-- Проверяем только наличие organization_id и соответствие invited_by_organization_id
create policy clients_insert on clients
  for insert with check (
    public.is_service_role()
    or (
      -- Упрощенная проверка: если current_organization_id() не null,
      -- значит пользователь является организацией
      public.current_organization_id() is not null
      and invited_by_organization_id = public.current_organization_id()
      and user_id is null  -- Временный клиент, еще не зарегистрирован
    )
  );

-- Комментарий к политике
comment on policy clients_insert on clients is 
  'Разрешает service_role и организациям создавать временных клиентов (user_id = null) для карточек подопечных. Упрощенная версия без exists проверки.';

