-- Исправление политики patient_cards_insert для разрешения создания карточек с client_id = null
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

