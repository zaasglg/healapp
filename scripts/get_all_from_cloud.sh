#!/bin/bash
# Получить ВСЕ миграции, функции и схему из Supabase Cloud

SUPABASE_DB_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
SUPABASE_DB_PORT="5432"
SUPABASE_DB_USER="postgres"
SUPABASE_DB_NAME="postgres"
SUPABASE_DB_PASSWORD="Dn2907200!"

OUTPUT_DIR="cloud_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "=== Получение всех данных из Supabase Cloud ==="

# 1. Получить все миграции
echo "1. Получение списка миграций..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;" > "$OUTPUT_DIR/migrations_list.txt"

# 2. Получить полную схему БД
echo "2. Получение полной схемы БД..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" pg_dump -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" --schema-only > "$OUTPUT_DIR/schema_only.sql"

# 3. Получить все RPC функции
echo "3. Получение всех RPC функций..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -c "SELECT routine_name, routine_definition FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;" > "$OUTPUT_DIR/rpc_functions.txt"

# 4. Получить определения всех функций через pg_get_functiondef
echo "4. Получение определений функций..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -t -A -c "SELECT 'CREATE OR REPLACE FUNCTION ' || p.proname || '(' || pg_get_function_arguments(p.oid) || ') RETURNS ' || pg_get_function_result(p.oid) || ' AS \$\$' || pg_get_functiondef(p.oid) || '\$\$ LANGUAGE ' || l.lanname || ';' FROM pg_proc p JOIN pg_language l ON p.prolang = l.oid WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') ORDER BY p.proname;" > "$OUTPUT_DIR/all_functions.sql"

# 5. Получить список всех таблиц и их структуру
echo "5. Получение структуры таблиц..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -c "\d+ public.*" > "$OUTPUT_DIR/tables_structure.txt"

# 6. Получить все индексы
echo "6. Получение всех индексов..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -c "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;" > "$OUTPUT_DIR/indexes.txt"

# 7. Получить все RLS политики
echo "7. Получение всех RLS политик..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -c "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;" > "$OUTPUT_DIR/rls_policies.txt"

# 8. Получить все триггеры
echo "8. Получение всех триггеров..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -p "$SUPABASE_DB_PORT" -c "SELECT trigger_name, event_object_table, action_statement FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name;" > "$OUTPUT_DIR/triggers.txt"

echo ""
echo "✅ Все данные сохранены в директорию: $OUTPUT_DIR"
echo ""
echo "Файлы:"
ls -lh "$OUTPUT_DIR"

