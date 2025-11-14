-- Убираем unique constraint на user_id в таблице clients
-- Проблема: constraint clients_user_unique не позволяет организациям создавать
-- несколько временных клиентов с одним user_id организации
-- Решение: убираем unique constraint, так как:
-- 1. Организации создают временных клиентов с user_id организации
-- 2. При регистрации клиента Edge Function обновит user_id на реального клиента
-- 3. После обновления user_id будет уникальным для реальных клиентов

-- Удаляем старый constraint полностью
-- Это позволяет организациям создавать несколько временных клиентов с одним user_id
-- Edge Function обновит user_id при регистрации реального клиента
-- После обновления user_id будет уникальным для реальных клиентов (проверка в приложении)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_user_unique;

-- Удаляем частичный unique индекс, если он был создан ранее
DROP INDEX IF EXISTS clients_user_id_unique_not_null;

