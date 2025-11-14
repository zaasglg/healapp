-- Делаем client_id и owner_client_id nullable для карточек и дневников
-- Проблема: организации создают карточки и дневники ДО регистрации клиента
-- Решение: разрешаем создавать карточки и дневники без client_id
-- При регистрации клиента Edge Function обновит client_id

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

