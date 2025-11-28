#!/bin/bash
# Проверить подключение meta к БД

cd ~/HealApp-Web

echo "=== Проверка переменных окружения meta ==="
docker compose exec -T meta printenv | grep PG_META

echo ""
echo "=== Проверка подключения meta к БД ==="
docker compose exec -T db psql -U postgres -d postgres -c "SELECT current_user, current_database();"

echo ""
echo "=== Проверка пароля в .env ==="
grep SUPABASE_DB_PASSWORD .env || echo "Файл .env не найден"

echo ""
echo "=== Попытка подключения с паролем из .env ==="
DB_PASSWORD=$(grep SUPABASE_DB_PASSWORD .env | cut -d'=' -f2)
echo "Пароль из .env: ${DB_PASSWORD:0:5}..."

echo ""
echo "=== Проверка логов meta (последние ошибки) ==="
docker compose logs meta --tail 20 | grep -i 'error\|fail\|password\|auth' | tail -5

