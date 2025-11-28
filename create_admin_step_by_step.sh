#!/bin/bash
echo "=== Создание supabase_admin пошагово ==="

echo ""
echo "1. Проверяем существующих пользователей..."
docker exec supabase-db psql -U postgres postgres -c "\du" | grep supabase

echo ""
echo "2. Удаляем пользователя если есть..."
docker exec supabase-db psql -U postgres postgres -c "DROP USER IF EXISTS supabase_admin;"

echo ""
echo "3. Создаем пользователя..."
docker exec supabase-db psql -U postgres postgres -c "CREATE USER supabase_admin WITH PASSWORD '4a83705eeb44c26e2ff867a5f853f5ce';"

echo ""
echo "4. Делаем суперпользователем..."
docker exec supabase-db psql -U postgres postgres -c "ALTER USER supabase_admin WITH SUPERUSER;"

echo ""
echo "5. Даем права на базу данных..."
docker exec supabase-db psql -U postgres postgres -c "GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;"

echo ""
echo "6. Проверяем создание..."
docker exec supabase-db psql -U postgres postgres -c "SELECT usename, usesuper FROM pg_user WHERE usename = 'supabase_admin';"

echo ""
echo "7. Тестируем подключение..."
PGPASSWORD=4a83705eeb44c26e2ff867a5f853f5ce docker exec supabase-db psql -U supabase_admin postgres -c "SELECT current_user;"

echo ""
echo "=== Готово ==="

