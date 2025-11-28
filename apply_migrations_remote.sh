#!/bin/bash
# Скрипт для применения миграций на удаленном сервере
# Использование: передать на сервер и выполнить

DB_HOST="localhost"
DB_PORT="54322"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="4a83705eeb44c26e2ff867a5f853f5ce"

export PGPASSWORD="$DB_PASSWORD"

MIGRATIONS_DIR="/tmp/migrations"

echo "========================================"
echo "Применение миграций Supabase"
echo "========================================"
echo ""

apply_migration() {
    local file=$1
    local description=$2
    
    echo "Применение: $description"
    echo "  Файл: $file"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file" > /tmp/migration_${file##*/}.log 2>&1; then
        echo "  ✓ Успешно"
    else
        echo "  ✗ Ошибка!"
        echo "  Лог ошибки:"
        cat /tmp/migration_${file##*/}.log | tail -10
        exit 1
    fi
    echo ""
}

# Применяем миграции в правильном порядке
apply_migration "$MIGRATIONS_DIR/00_types_and_extensions.sql" "Типы, ENUM и расширения"
apply_migration "$MIGRATIONS_DIR/01_tables_structure.sql" "Структура таблиц"
apply_migration "$MIGRATIONS_DIR/01_foreign_keys.sql" "Внешние ключи"
apply_migration "$MIGRATIONS_DIR/01_unique_constraints.sql" "Уникальные ограничения"
apply_migration "$MIGRATIONS_DIR/01_check_constraints.sql" "CHECK ограничения"
apply_migration "$MIGRATIONS_DIR/02_indexes.sql" "Индексы"
apply_migration "$MIGRATIONS_DIR/03_functions.sql" "Функции"
apply_migration "$MIGRATIONS_DIR/04_rls_policies.sql" "RLS политики"
apply_migration "$MIGRATIONS_DIR/05_triggers.sql" "Триггеры на таблицах public"
apply_migration "$MIGRATIONS_DIR/05_auth_triggers.sql" "Триггеры на auth.users"

echo "========================================"
echo "Все миграции применены успешно!"
echo "========================================"

