#!/bin/bash
# Обновить пароль supabase_admin

cd ~/HealApp-Web

echo "=== Обновление пароля supabase_admin ==="
docker compose exec -T db psql -U postgres -d postgres <<'EOFSQL'
ALTER USER supabase_admin WITH PASSWORD 'Dn2907200!';
SELECT 'Password updated for supabase_admin' as status;
EOFSQL

echo ""
echo "=== Проверка подключения с новым паролем ==="
docker compose exec -T db psql -U supabase_admin -d postgres -c "SELECT 'Connection successful' as status;" 2>&1 | head -5

echo ""
echo "=== Перезапуск meta сервиса ==="
docker compose restart meta
sleep 8

echo ""
echo "=== Проверка новых логов meta (последние 3 строки) ==="
docker compose logs meta --tail 3

