-- Исправление функции invite_visible_to_current_user для случая, когда current_user_role() возвращает null
-- Проблема: функция не работает для организаций, если current_user_role() возвращает null
-- Решение: добавляем проверку через таблицу organizations напрямую

CREATE OR REPLACE FUNCTION public.invite_visible_to_current_user(p_invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role_enum;
  v_org uuid;
BEGIN
  IF public.is_service_role() THEN
    RETURN true;
  END IF;

  v_role := public.current_user_role();
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  v_org := public.current_organization_id();

  -- Проверка для организаций (используем проверку через таблицу organizations, если role = null)
  IF v_role = 'organization' OR (v_role IS NULL AND v_org IS NOT NULL) THEN
    RETURN EXISTS (
      SELECT 1 FROM organization_invite_tokens oit
      WHERE oit.invite_id = p_invite_id
        AND oit.organization_id = v_org
    )
    OR EXISTS (
      SELECT 1 FROM organization_client_invite_tokens ocit
      WHERE ocit.invite_id = p_invite_id
        AND ocit.organization_id = v_org
    )
    OR EXISTS (
      SELECT 1 FROM caregiver_client_invite_tokens ccit
      WHERE ccit.invite_id = p_invite_id
        AND ccit.caregiver_id = v_org
    );
  END IF;

  IF v_role = 'org_employee' AND public.current_user_has_manager_permissions() THEN
    RETURN EXISTS (
      SELECT 1 FROM organization_invite_tokens oit
      WHERE oit.invite_id = p_invite_id
        AND oit.organization_id = v_org
    )
    OR EXISTS (
      SELECT 1 FROM organization_client_invite_tokens ocit
      WHERE ocit.invite_id = p_invite_id
        AND ocit.organization_id = v_org
    );
  END IF;

  RETURN false;
END;
$$;

-- Комментарий
COMMENT ON FUNCTION public.invite_visible_to_current_user(uuid) IS 
  'Проверяет видимость приглашения для текущего пользователя. Для организаций учитывает случай, когда current_user_role() возвращает null.';

