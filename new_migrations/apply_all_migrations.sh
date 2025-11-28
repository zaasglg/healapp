#!/bin/bash
# Скрипт для применения всех миграций в правильном порядке
# Использование: ./apply_all_migrations.sh [host] [port] [database] [user] [password]

set -e  # Остановка при ошибке

# Параметры подключения
DB_HOST=${1:-"localhost"}
DB_PORT=${2:-"54322"}
DB_NAME=${3:-"postgres"}
DB_USER=${4:-"postgres"}
DB_PASSWORD=${5:-""}

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Применение миграций Supabase${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Подключение к: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# Экспорт пароля для psql
export PGPASSWORD="$DB_PASSWORD"

# Функция для применения миграции
apply_migration() {
    local file=$1
    local description=$2
    
    echo -e "${YELLOW}Применение: $description${NC}"
    echo -e "  Файл: $file"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Успешно${NC}"
    else
        echo -e "${RED}  ✗ Ошибка!${NC}"
        echo "  Проверьте логи выше"
        exit 1
    fi
    echo ""
}

# Применяем миграции в правильном порядке
apply_migration "00_types_and_extensions.sql" "Типы, ENUM и расширения"
apply_migration "01_tables_structure.sql" "Структура таблиц"
apply_migration "01_foreign_keys.sql" "Внешние ключи"
apply_migration "01_unique_constraints.sql" "Уникальные ограничения"
apply_migration "01_check_constraints.sql" "CHECK ограничения"
apply_migration "02_indexes.sql" "Индексы"
apply_migration "03_functions.sql" "Функции"
apply_migration "04_rls_policies.sql" "RLS политики"
apply_migration "05_triggers.sql" "Триггеры на таблицах public"
apply_migration "05_auth_triggers.sql" "Триггеры на auth.users"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Все миграции применены успешно!${NC}"
echo -e "${GREEN}========================================${NC}"

