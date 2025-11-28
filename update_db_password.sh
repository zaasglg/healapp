#!/bin/bash
# Обновить пароль БД для всех пользователей и сервисов

cd ~/HealApp-Web

NEW_PASSWORD="FGHgbfjx-314gkmGf"

echo "=== Обновление пароля в .env ==="
if [ -f .env ]; then
    sed -i "s/SUPABASE_DB_PASSWORD=.*/SUPABASE_DB_PASSWORD=${NEW_PASSWORD}/" .env
    echo "✅ .env обновлен"
else
    echo "⚠️ Файл .env не найден, создаю..."
    echo "SUPABASE_DB_PASSWORD=${NEW_PASSWORD}" > .env
fi

echo ""
echo "=== Обновление пароля для postgres ==="
docker compose exec -T db psql -U postgres -d postgres <<EOFSQL
ALTER USER postgres WITH PASSWORD '${NEW_PASSWORD}';
SELECT 'Password updated for postgres' as status;
EOFSQL

echo ""
echo "=== Обновление пароля для supabase_admin ==="
docker compose exec -T db psql -U postgres -d postgres <<EOFSQL
ALTER USER supabase_admin WITH PASSWORD '${NEW_PASSWORD}';
SELECT 'Password updated for supabase_admin' as status;
EOFSQL

echo ""
echo "=== Перезапуск всех сервисов ==="
docker compose restart auth rest storage realtime meta functions

echo ""
echo "=== Ожидание запуска сервисов (10 секунд) ==="
sleep 10

echo ""
echo "=== Проверка статуса сервисов ==="
docker compose ps | grep -E '(auth|rest|storage|realtime|meta|functions)'

echo ""
echo "✅ Пароль обновлен для всех пользователей и сервисов"
echo "Новый пароль: ${NEW_PASSWORD}"

