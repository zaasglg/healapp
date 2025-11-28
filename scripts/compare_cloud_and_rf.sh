#!/bin/bash
# Полное сравнение Cloud и RF сервера

CLOUD_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
CLOUD_PORT="5432"
CLOUD_USER="postgres"
CLOUD_DB="postgres"
CLOUD_PASS="Dn2907200!"

echo "=== Сравнение Cloud и RF сервера ==="
echo ""

# 1. Миграции
echo "1. Проверка миграций..."
echo "Миграции в Cloud:"
PGPASSWORD="$CLOUD_PASS" psql -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" -t -A -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" > /tmp/cloud_migrations.txt
cat /tmp/cloud_migrations.txt

echo ""
echo "Миграции на RF сервере:"
cd ~/HealApp-Web
docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" > /tmp/rf_migrations.txt
cat /tmp/rf_migrations.txt

echo ""
echo "Отсутствующие миграции на RF:"
comm -23 <(sort /tmp/cloud_migrations.txt) <(sort /tmp/rf_migrations.txt)

echo ""
echo "---"
echo ""

# 2. RPC функции
echo "2. Проверка RPC функций..."
echo "RPC функции в Cloud:"
PGPASSWORD="$CLOUD_PASS" psql -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" -t -A -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;" > /tmp/cloud_functions.txt
cat /tmp/cloud_functions.txt

echo ""
echo "RPC функции на RF сервере:"
docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;" > /tmp/rf_functions.txt
cat /tmp/rf_functions.txt

echo ""
echo "Отсутствующие функции на RF:"
comm -23 <(sort /tmp/cloud_functions.txt) <(sort /tmp/rf_functions.txt)

echo ""
echo "---"
echo ""

# 3. Таблицы
echo "3. Проверка таблиц..."
echo "Таблицы в Cloud:"
PGPASSWORD="$CLOUD_PASS" psql -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" > /tmp/cloud_tables.txt
cat /tmp/cloud_tables.txt

echo ""
echo "Таблицы на RF сервере:"
docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" > /tmp/rf_tables.txt
cat /tmp/rf_tables.txt

echo ""
echo "Отсутствующие таблицы на RF:"
comm -23 <(sort /tmp/cloud_tables.txt) <(sort /tmp/rf_tables.txt)

echo ""
echo "=== Итоговый отчет ==="
echo "Проверка завершена. Результаты сохранены в /tmp/cloud_*.txt и /tmp/rf_*.txt"

