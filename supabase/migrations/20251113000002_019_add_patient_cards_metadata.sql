-- Добавляем колонку metadata в таблицу patient_cards для хранения дополнительных данных
-- (address, entrance, apartment, has_pets, services, service_wishes)

alter table patient_cards
  add column if not exists metadata jsonb default '{}'::jsonb;

-- Комментарий к колонке
comment on column patient_cards.metadata is 'Дополнительные данные карточки: address, entrance, apartment, has_pets, services, service_wishes';

