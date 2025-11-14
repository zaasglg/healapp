# Применение миграции для создания карточек организациями

## SQL для применения (УПРОЩЕННАЯ ВЕРСИЯ)

Выполните следующий SQL в Supabase Dashboard → SQL Editor:

```sql
-- ФИНАЛЬНОЕ исправление политики clients_insert
-- Проблема: current_organization_id() может не работать в контексте RLS
-- Решение: проверяем напрямую через таблицу organizations

-- Удаляем все старые политики clients_insert
drop policy if exists clients_insert on clients;

-- Создаем новую политику с прямой проверкой через таблицу organizations
create policy clients_insert on clients
  for insert with check (
    public.is_service_role()
    or (
      -- Прямая проверка: существует ли запись в organizations с user_id = auth.uid()
      -- и invited_by_organization_id совпадает с id этой организации
      exists (
        select 1
        from organizations o
        where o.user_id = auth.uid()
        and o.id = invited_by_organization_id
      )
      and user_id is null  -- Временный клиент, еще не зарегистрирован
    )
  );

-- Комментарий к политике
comment on policy clients_insert on clients is 
  'Разрешает service_role и организациям создавать временных клиентов (user_id = null) для карточек подопечных. Использует прямую проверку через таблицу organizations.';
```

## Инструкция

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard/project/mtpawypaihmwrngirnxa)
2. Перейдите в **SQL Editor**
3. Скопируйте SQL выше
4. Вставьте в редактор и нажмите **Run**
5. Проверьте, что миграция применена успешно

## Проверка

После применения миграции попробуйте создать карточку подопечного из аккаунта организации. Должно работать без ошибок!

