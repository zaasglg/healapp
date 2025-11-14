-- Исправление функции has_patient_card_access для карточек с client_id = null
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

