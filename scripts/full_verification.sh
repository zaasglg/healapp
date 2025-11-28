#!/bin/bash
# Полная проверка через Docker контейнер

echo "=== Полная проверка миграций, функций и таблиц ==="
echo ""

# Используем Docker контейнер для подключения к Cloud
CLOUD_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
CLOUD_PORT="5432"
CLOUD_USER="postgres"
CLOUD_DB="postgres"
CLOUD_PASS="Dn2907200!"

echo "1. Получение миграций из Cloud через Docker..."
docker run --rm -e PGPASSWORD="$CLOUD_PASS" postgres:15 psql -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" -t -A -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" > /tmp/cloud_migrations.txt 2>&1

if [ $? -eq 0 ]; then
    echo "Миграции в Cloud:"
    cat /tmp/cloud_migrations.txt | head -20
    echo "... (всего: $(wc -l < /tmp/cloud_migrations.txt))"
else
    echo "Ошибка подключения к Cloud"
    cat /tmp/cloud_migrations.txt
fi

echo ""
echo "Миграции на RF сервере:"
cd ~/HealApp-Web
docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" > /tmp/rf_migrations.txt
cat /tmp/rf_migrations.txt | head -20
echo "... (всего: $(wc -l < /tmp/rf_migrations.txt))"

echo ""
echo "Сравнение миграций:"
MISSING_MIGRATIONS=$(comm -23 <(sort /tmp/cloud_migrations.txt 2>/dev/null) <(sort /tmp/rf_migrations.txt) 2>/dev/null)
if [ -z "$MISSING_MIGRATIONS" ]; then
    echo "✅ Все миграции присутствуют"
else
    echo "❌ Отсутствующие миграции:"
    echo "$MISSING_MIGRATIONS"
fi

echo ""
echo "2. Получение RPC функций из Cloud..."
docker run --rm -e PGPASSWORD="$CLOUD_PASS" postgres:15 psql -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" -t -A -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;" > /tmp/cloud_functions.txt 2>&1

if [ $? -eq 0 ]; then
    echo "RPC функции в Cloud:"
    cat /tmp/cloud_functions.txt
    echo "(всего: $(wc -l < /tmp/cloud_functions.txt))"
else
    echo "Ошибка подключения к Cloud"
    cat /tmp/cloud_functions.txt
fi

echo ""
echo "RPC функции на RF сервере:"
docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;" > /tmp/rf_functions.txt
cat /tmp/rf_functions.txt
echo "(всего: $(wc -l < /tmp/rf_functions.txt))"

echo ""
echo "Сравнение функций:"
MISSING_FUNCTIONS=$(comm -23 <(sort /tmp/cloud_functions.txt 2>/dev/null) <(sort /tmp/rf_functions.txt) 2>/dev/null)
if [ -z "$MISSING_FUNCTIONS" ]; then
    echo "✅ Все RPC функции присутствуют"
else
    echo "❌ Отсутствующие функции:"
    echo "$MISSING_FUNCTIONS"
fi

echo ""
echo "3. Проверка таблиц..."
docker run --rm -e PGPASSWORD="$CLOUD_PASS" postgres:15 psql -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" > /tmp/cloud_tables.txt 2>&1

if [ $? -eq 0 ]; then
    echo "Таблицы в Cloud:"
    cat /tmp/cloud_tables.txt
    echo "(всего: $(wc -l < /tmp/cloud_tables.txt))"
else
    echo "Ошибка подключения к Cloud"
    cat /tmp/cloud_tables.txt
fi

echo ""
echo "Таблицы на RF сервере:"
docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" > /tmp/rf_tables.txt
cat /tmp/rf_tables.txt
echo "(всего: $(wc -l < /tmp/rf_tables.txt))"

echo ""
echo "Сравнение таблиц:"
MISSING_TABLES=$(comm -23 <(sort /tmp/cloud_tables.txt 2>/dev/null) <(sort /tmp/rf_tables.txt) 2>/dev/null)
if [ -z "$MISSING_TABLES" ]; then
    echo "✅ Все таблицы присутствуют"
else
    echo "❌ Отсутствующие таблицы:"
    echo "$MISSING_TABLES"
fi

echo ""
echo "=== Итоговый отчет ==="
echo "Проверка завершена"

