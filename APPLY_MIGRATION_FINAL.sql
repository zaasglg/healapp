-- ============================================
-- ФИНАЛЬНАЯ МИГРАЦИЯ ДЛЯ ПРИМЕНЕНИЯ В SUPABASE DASHBOARD
-- ============================================
-- Откройте: https://supabase.com/dashboard/project/mtpawypaihmwrngirnxa
-- Перейдите в: SQL Editor
-- Скопируйте ВЕСЬ SQL ниже и выполните ОДНИМ запросом
-- ============================================

-- ШАГ 1: Убираем unique constraint на user_id
-- Проблема: constraint clients_user_unique не позволяет организациям создавать
-- несколько временных клиентов с одним user_id организации
-- Решение: убираем constraint полностью
-- Edge Function обновит user_id при регистрации реального клиента
-- После обновления user_id будет уникальным для реальных клиентов (проверка в приложении)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_user_unique;

-- Удаляем частичный unique индекс, если он был создан ранее
DROP INDEX IF EXISTS clients_user_id_unique_not_null;

-- ШАГ 2: Исправление политики clients_insert - убираем проверку user_id is null
-- Проблема: проверка user_id is null блокирует вставку из-за RLS
-- Решение: разрешаем организациям создавать клиентов с user_id организации (временно)
-- Edge Function обновит user_id при регистрации реального клиента

-- Удаляем все старые политики clients_insert
DROP POLICY IF EXISTS clients_insert ON clients;

-- Создаем новую политику БЕЗ проверки user_id is null
-- Организации могут создавать клиентов с user_id организации (временно)
-- При регистрации клиента Edge Function обновит user_id на реального клиента
CREATE POLICY clients_insert ON clients
  FOR INSERT WITH CHECK (
    public.is_service_role()
    OR (
      -- Прямая проверка: существует ли запись в organizations с user_id = auth.uid()
      -- и invited_by_organization_id совпадает с id этой организации
      EXISTS (
        SELECT 1
        FROM organizations o
        WHERE o.user_id = auth.uid()
        AND o.id = invited_by_organization_id
      )
      -- УБИРАЕМ проверку user_id is null - разрешаем любой user_id
      -- Организация может использовать свой user_id временно
    )
  );

-- Комментарий к политике
COMMENT ON POLICY clients_insert ON clients IS 
  'Разрешает service_role и организациям создавать клиентов для карточек подопечных. Организации могут использовать свой user_id временно, Edge Function обновит его при регистрации реального клиента.';

-- ============================================
-- МИГРАЦИЯ ПРИМЕНЕНА!
-- ============================================
-- Теперь попробуйте создать карточку подопечного из аккаунта организации
-- Должно работать без ошибок 403 Forbidden
-- ============================================

