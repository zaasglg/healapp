-- ============================================
-- ПРОСТАЯ МИГРАЦИЯ ДЛЯ ПРИМЕНЕНИЯ В SUPABASE DASHBOARD
-- ============================================
-- Откройте: https://supabase.com/dashboard/project/mtpawypaihmwrngirnxa
-- Перейдите в: SQL Editor
-- Скопируйте ВЕСЬ SQL ниже и выполните ОДНИМ запросом
-- ============================================

-- Делаем client_id и owner_client_id nullable для карточек и дневников
-- Проблема: организации создают карточки и дневники ДО регистрации клиента
-- Решение: разрешаем создавать карточки и дневники без client_id
-- При регистрации клиента Edge Function создаст клиента и обновит client_id

-- ШАГ 1: Делаем client_id nullable в patient_cards
ALTER TABLE patient_cards 
  ALTER COLUMN client_id DROP NOT NULL;

-- ШАГ 2: Делаем owner_client_id nullable в diaries
ALTER TABLE diaries 
  ALTER COLUMN owner_client_id DROP NOT NULL;

-- Комментарии
COMMENT ON COLUMN patient_cards.client_id IS 
  'ID клиента-владельца карточки. Может быть NULL для карточек, созданных организациями до регистрации клиента.';

COMMENT ON COLUMN diaries.owner_client_id IS 
  'ID клиента-владельца дневника. Может быть NULL для дневников, созданных организациями до регистрации клиента.';

-- ШАГ 3: Исправление политики patient_cards_insert
-- Проблема: политика требует has_client_access(client_id), но для client_id = null это не работает
-- Решение: разрешаем организациям создавать карточки с client_id = null

-- Удаляем старую политику
DROP POLICY IF EXISTS patient_cards_insert ON patient_cards;

-- Создаем новую политику
CREATE POLICY patient_cards_insert ON patient_cards
  FOR INSERT WITH CHECK (
    public.is_service_role()
    OR (
      -- Клиенты могут создавать карточки только для себя
      public.current_user_role() = 'client'
      AND client_id = public.current_client_id()
    )
    OR (
      -- Организации могут создавать карточки:
      -- 1. С client_id = null (для будущих клиентов)
      -- 2. С client_id клиента, которого они пригласили
      -- Проверяем напрямую через таблицу organizations (более надежно, чем current_user_role())
      EXISTS (
        SELECT 1
        FROM organizations o
        WHERE o.user_id = auth.uid()
      )
      AND (
        client_id IS NULL  -- Разрешаем создавать карточки без client_id
        OR public.has_client_access(client_id)  -- Или для клиентов, которых организация пригласила
      )
    )
  );

-- Комментарий к политике
COMMENT ON POLICY patient_cards_insert ON patient_cards IS 
  'Разрешает service_role, клиентам и организациям создавать карточки. Организации могут создавать карточки с client_id = null для будущих клиентов.';

-- ШАГ 4: Исправление функции has_patient_card_access для карточек с client_id = null
-- Проблема: функция не учитывает карточки с client_id = null, созданные организациями
-- Решение: добавляем проверку created_by для организаций

CREATE OR REPLACE FUNCTION public.has_patient_card_access(p_card_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role_enum;
  v_org uuid;
  v_client uuid;
BEGIN
  IF public.is_service_role() THEN
    RETURN true;
  END IF;

  v_role := public.current_user_role();
  v_org := public.current_organization_id();
  v_client := public.current_client_id();

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_role = 'client' THEN
    RETURN EXISTS (
      SELECT 1 FROM patient_cards pc
      WHERE pc.id = p_card_id AND pc.client_id = v_client
    );
  END IF;

  -- Проверка для организаций (используем проверку через таблицу organizations, если role = null)
  IF v_role = 'organization' OR (v_role IS NULL AND v_org IS NOT NULL) THEN
    RETURN EXISTS (
      SELECT 1
      FROM patient_cards pc
      WHERE pc.id = p_card_id
        AND (
          -- Карточка создана этой организацией (даже если client_id = null)
          pc.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM clients c
            WHERE c.id = pc.client_id
              AND (c.invited_by_organization_id = v_org OR c.invited_by_caregiver_id = v_org)
          )
          OR EXISTS (
            SELECT 1
            FROM diaries d
            WHERE d.patient_card_id = pc.id
              AND (d.organization_id = v_org OR d.caregiver_id = v_org)
          )
        )
    );
  END IF;

  IF v_role = 'org_employee' THEN
    RETURN EXISTS (
      SELECT 1
      FROM diaries d
      WHERE d.patient_card_id = p_card_id
        AND public.has_diary_access(d.id)
    );
  END IF;

  RETURN false;
END;
$$;

-- Комментарий
COMMENT ON FUNCTION public.has_patient_card_access(uuid) IS 
  'Проверяет доступ к карточке подопечного. Для организаций учитывает карточки с client_id = null, созданные организацией (проверка через created_by).';

-- ============================================
-- МИГРАЦИЯ ПРИМЕНЕНА!
-- ============================================
-- Теперь организации могут:
-- 1. Создавать карточки БЕЗ client_id
-- 2. Видеть карточки, которые они создали (даже с client_id = null)
-- При регистрации клиента Edge Function создаст клиента и обновит client_id
-- ============================================

