#!/bin/bash
# Скрипт для применения миграций на сервере

set -e

MIGRATIONS_DIR="/root/HealApp-Web/supabase/migrations"
DB_CONTAINER="caregivers-diary-db"

echo "=== Применение миграций ==="

if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ Директория миграций не найдена: $MIGRATIONS_DIR"
    exit 1
fi

# Получить список файлов миграций, отсортированных по имени
MIGRATION_FILES=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)

if [ -z "$MIGRATION_FILES" ]; then
    echo "❌ Файлы миграций не найдены в $MIGRATIONS_DIR"
    exit 1
fi

echo "📋 Найдено миграций: $(echo "$MIGRATION_FILES" | wc -l)"

# Применить каждую миграцию
for migration_file in $MIGRATION_FILES; do
    filename=$(basename "$migration_file")
    echo "📦 Применяю: $filename"
    
    # Применить миграцию
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$migration_file"
    
    if [ $? -eq 0 ]; then
        echo "✅ Успешно: $filename"
    else
        echo "❌ Ошибка при применении: $filename"
        exit 1
    fi
done

echo ""
echo "✅ Все миграции применены успешно!"

