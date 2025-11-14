-- ============================================
-- ПОЛНАЯ МИГРАЦИЯ ДЛЯ ПРИМЕНЕНИЯ В SUPABASE DASHBOARD
-- ============================================
-- Откройте: https://supabase.com/dashboard/project/mtpawypaihmwrngirnxa
-- Перейдите в: SQL Editor
-- Скопируйте ВЕСЬ SQL ниже и выполните ОДНИМ запросом
-- ============================================

-- ШАГ 1: Создаем функцию exec_sql (если еще не создана)
CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- ШАГ 2: Применяем исправление политики clients_insert
-- Финальное исправление политики clients_insert
-- Проблема: current_organization_id() может не работать в контексте RLS
-- Решение: проверяем напрямую через таблицу organizations

-- Удаляем все старые политики clients_insert
DROP POLICY IF EXISTS clients_insert ON clients;

-- Создаем новую политику с прямой проверкой через таблицу organizations
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
      AND user_id IS NULL  -- Временный клиент, еще не зарегистрирован
    )
  );

-- Комментарий к политике
COMMENT ON POLICY clients_insert ON clients IS 
  'Разрешает service_role и организациям создавать временных клиентов (user_id = null) для карточек подопечных. Использует прямую проверку через таблицу organizations.';

-- ============================================
-- МИГРАЦИЯ ПРИМЕНЕНА!
-- ============================================
-- Теперь попробуйте создать карточку подопечного из аккаунта организации
-- Должно работать без ошибок 403 Forbidden
-- ============================================

