-- Исправление ролей клиентов, которые были неправильно изменены на 'organization'
-- Клиенты должны иметь роль 'client', даже если они пригласили сиделку

-- Находим всех пользователей, которые являются клиентами (есть запись в таблице clients),
-- но имеют роль 'organization' в user_profiles
-- Исправляем их роль на 'client'

update user_profiles up
set role = 'client'
from clients c
where up.user_id = c.user_id
  and up.role = 'organization'
  and not exists (
    -- Проверяем, что пользователь НЕ является организацией (нет записи в organizations)
    select 1
    from organizations o
    where o.user_id = up.user_id
  );

-- Комментарий для документации
comment on function public.create_organization(organization_type_enum, text, text, text)
  is 'Создание записи организации. Автоматически создает запись в user_profiles с ролью organization. Клиенты не могут создавать организации.';

