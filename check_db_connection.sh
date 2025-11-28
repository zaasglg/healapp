#!/bin/bash
# Проверить подключение к БД и пароль

cd ~/HealApp-Web

echo "=== Проверка пароля БД ==="
if [ -f .env ]; then
    grep SUPABASE_DB_PASSWORD .env | head -1
else
    echo ".env файл не найден"
fi

echo ""
echo "=== Проверка подключения к БД ==="
docker compose exec -T db psql -U postgres -d postgres -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';" 2>&1

echo ""
echo "=== Проверка таблиц ==="
docker compose exec -T db psql -U postgres -d postgres -c "\dt public.*" 2>&1 | head -20

echo ""
echo "=== Проверка meta сервиса (для Studio) ==="
docker compose logs meta --tail 10 | grep -i 'error\|fail\|password' || echo "Нет ошибок в логах meta"

echo ""
echo "=== Проверка Studio ==="
docker compose ps | grep studio

