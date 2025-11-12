-- Исправление функции current_organization_id() для правильного определения organization_id
-- Проблема: функция не учитывала случай, когда пользователь - это сама организация

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

