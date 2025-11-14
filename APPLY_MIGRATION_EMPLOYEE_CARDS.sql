-- ============================================
-- МИГРАЦИЯ ДЛЯ ИСПРАВЛЕНИЯ ДОСТУПА СОТРУДНИКОВ К КАРТОЧКАМ
-- ============================================
-- Откройте: https://supabase.com/dashboard/project/mtpawypaihmwrngirnxa
-- Перейдите в: SQL Editor
-- Скопируйте ВЕСЬ SQL ниже и выполните ОДНИМ запросом
-- ============================================

-- Исправление функции has_patient_card_access для сотрудников пансионатов
-- Проблема: сотрудники пансионатов видят карточки только через дневники, но должны видеть все карточки своей организации
-- Решение: для сотрудников пансионатов добавляем проверку через organization_id

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
  v_org_type text;
BEGIN
  IF public.is_service_role() THEN
    RETURN true;
  END IF;

  v_role := public.current_user_role();
  v_org := public.current_organization_id();
  v_client := public.current_client_id();

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

  -- Проверка для сотрудников организаций
  IF v_role = 'org_employee' THEN
    -- Получаем тип организации сотрудника
    IF v_org IS NULL THEN
      SELECT organization_id INTO v_org
      FROM organization_employees
      WHERE user_id = auth.uid()
      LIMIT 1;
    END IF;

    IF v_org IS NOT NULL THEN
      -- Получаем тип организации
      SELECT organization_type INTO v_org_type
      FROM organizations
      WHERE id = v_org;

      -- Для пансионатов: сотрудники видят ВСЕ карточки своей организации
      IF v_org_type = 'pension' THEN
        RETURN EXISTS (
          SELECT 1
          FROM patient_cards pc
          WHERE pc.id = p_card_id
            AND (
              -- Карточка создана организацией
              pc.created_by IN (
                SELECT user_id FROM organizations WHERE id = v_org
              )
              OR EXISTS (
                SELECT 1
                FROM clients c
                WHERE c.id = pc.client_id
                  AND c.invited_by_organization_id = v_org
              )
              OR EXISTS (
                SELECT 1
                FROM diaries d
                WHERE d.patient_card_id = pc.id
                  AND d.organization_id = v_org
              )
            )
        );
      END IF;

      -- Для патронажных агентств: сотрудники видят карточки через дневники (как раньше)
      IF v_org_type = 'patronage_agency' THEN
        RETURN EXISTS (
          SELECT 1
          FROM diaries d
          WHERE d.patient_card_id = p_card_id
            AND public.has_diary_access(d.id)
        );
      END IF;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Комментарий
COMMENT ON FUNCTION public.has_patient_card_access(uuid) IS 
  'Проверяет доступ к карточке подопечного. Для сотрудников пансионатов: видят все карточки своей организации. Для сотрудников патронажных агентств: видят карточки через дневники.';

-- ============================================
-- МИГРАЦИЯ ПРИМЕНЕНА!
-- ============================================
-- Теперь:
-- 1. Сотрудники пансионатов видят ВСЕ карточки своей организации
-- 2. Сотрудники патронажных агентств видят карточки через дневники (как раньше)
-- 3. При редактировании карточки данные загружаются из БД, а не из localStorage черновика
-- ============================================

