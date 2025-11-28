#!/bin/bash
# Полная проверка всех миграций и функций

echo "=== Проверка миграций из Supabase Cloud ==="

# Подключение к старому Supabase Cloud
SUPABASE_DB_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
SUPABASE_DB_PORT="5432"
SUPABASE_DB_USER="postgres"
SUPABASE_DB_NAME="postgres"
SUPABASE_DB_PASSWORD="Dn2907200!"

echo "Получение списка миграций из Supabase Cloud..."
CLOUD_MIGRATIONS=$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -t -A -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;")

if [ $? -ne 0 ]; then
    echo "Ошибка при получении миграций из Cloud"
    exit 1
fi

echo "Миграции в Cloud:"
echo "$CLOUD_MIGRATIONS"
echo ""

echo "=== Проверка миграций на российском сервере ==="
echo "Подключение к российскому серверу..."

# Получение миграций с российского сервера
ssh root@176.124.217.224 "cd ~/HealApp-Web && docker compose exec -T db psql -U postgres -d postgres -t -A -c 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;'" > /tmp/rf_migrations.txt

RF_MIGRATIONS=$(cat /tmp/rf_migrations.txt)

echo "Миграции на российском сервере:"
echo "$RF_MIGRATIONS"
echo ""

echo "=== Сравнение миграций ==="
echo "Проверка отсутствующих миграций..."

# Сравнение
MISSING_MIGRATIONS=$(comm -23 <(echo "$CLOUD_MIGRATIONS" | sort) <(echo "$RF_MIGRATIONS" | sort))

if [ -z "$MISSING_MIGRATIONS" ]; then
    echo "✅ Все миграции присутствуют на российском сервере"
else
    echo "❌ Отсутствующие миграции:"
    echo "$MISSING_MIGRATIONS"
fi

echo ""
echo "=== Проверка RPC функций ==="

echo "Получение списка RPC функций из Cloud..."
CLOUD_FUNCTIONS=$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -t -A -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;")

echo "RPC функции в Cloud:"
echo "$CLOUD_FUNCTIONS"
echo ""

echo "Получение списка RPC функций с российского сервера..."
ssh root@176.124.217.224 "cd ~/HealApp-Web && docker compose exec -T db psql -U postgres -d postgres -t -A -c \"SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;\"" > /tmp/rf_functions.txt

RF_FUNCTIONS=$(cat /tmp/rf_functions.txt)

echo "RPC функции на российском сервере:"
echo "$RF_FUNCTIONS"
echo ""

MISSING_FUNCTIONS=$(comm -23 <(echo "$CLOUD_FUNCTIONS" | sort) <(echo "$RF_FUNCTIONS" | sort))

if [ -z "$MISSING_FUNCTIONS" ]; then
    echo "✅ Все RPC функции присутствуют на российском сервере"
else
    echo "❌ Отсутствующие RPC функции:"
    echo "$MISSING_FUNCTIONS"
fi

echo ""
echo "=== Проверка таблиц ==="

echo "Получение списка таблиц из Cloud..."
CLOUD_TABLES=$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")

echo "Таблицы в Cloud:"
echo "$CLOUD_TABLES"
echo ""

echo "Получение списка таблиц с российского сервера..."
ssh root@176.124.217.224 "cd ~/HealApp-Web && docker compose exec -T db psql -U postgres -d postgres -t -A -c \"SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;\"" > /tmp/rf_tables.txt

RF_TABLES=$(cat /tmp/rf_tables.txt)

echo "Таблицы на российском сервере:"
echo "$RF_TABLES"
echo ""

MISSING_TABLES=$(comm -23 <(echo "$CLOUD_TABLES" | sort) <(echo "$RF_TABLES" | sort))

if [ -z "$MISSING_TABLES" ]; then
    echo "✅ Все таблицы присутствуют на российском сервере"
else
    echo "❌ Отсутствующие таблицы:"
    echo "$MISSING_TABLES"
fi

echo ""
echo "=== Проверка Edge Functions ==="

echo "Edge Functions в проекте:"
ls -1 supabase/functions/ | grep -v "^_" | grep -v "^\." | sort

echo ""
echo "Edge Functions на сервере:"
ssh root@176.124.217.224 "cd ~/HealApp-Web && ls -1 supabase/functions/ 2>/dev/null | grep -v '^_' | grep -v '^\.' | sort"

echo ""
echo "=== Итоговый отчет ==="
echo "Проверка завершена"

