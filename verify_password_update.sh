#!/bin/bash
# Проверить что пароль обновлен

cd ~/HealApp-Web

echo "=== Проверка пароля в .env ==="
grep SUPABASE_DB_PASSWORD .env

echo ""
echo "=== Проверка подключения к БД ==="
docker compose exec -T db psql -U postgres -d postgres -c "SELECT current_user, current_database();" 2>&1 | grep -v 'time=' | grep -v 'warning'

echo ""
echo "=== Проверка статуса сервисов ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}" | grep -E '(auth|rest|meta|storage|realtime|functions)'

echo ""
echo "=== Проверка логов meta (последние 3 строки) ==="
docker compose logs meta --tail 3 | grep -v 'time=' | grep -v 'warning'

