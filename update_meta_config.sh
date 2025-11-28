#!/bin/bash
# Обновить конфигурацию meta и пароль supabase_admin

cd ~/HealApp-Web

echo "=== Обновление пароля supabase_admin ==="
docker compose exec -T db psql -U postgres -d postgres <<'EOFSQL'
-- Обновить пароль для supabase_admin (от имени postgres суперпользователя)
ALTER USER supabase_admin WITH PASSWORD 'Dn2907200!';
SELECT 'Password updated for supabase_admin' as status;
EOFSQL

echo ""
echo "=== Обновление docker-compose.yml ==="
sed -i 's/PG_META_DB_USER: postgres/PG_META_DB_USER: supabase_admin/' docker-compose.yml

echo ""
echo "=== Перезапуск meta сервиса ==="
docker compose up -d meta
sleep 8

echo ""
echo "=== Проверка логов meta (последние 5 строк) ==="
docker compose logs meta --tail 5

