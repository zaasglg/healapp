#!/bin/bash
# Скрипт для экспорта миграций из Supabase CLI

echo "=== Экспорт миграций из Supabase ==="
echo ""

# Проверка установки Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI не установлен!"
    echo ""
    echo "Установите через:"
    echo "  npm install -g supabase"
    echo "Или:"
    echo "  scoop install supabase"
    exit 1
fi

echo "✅ Supabase CLI установлен: $(supabase --version)"
echo ""

# Проверка авторизации
echo "Проверка авторизации..."
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Не авторизованы. Выполните:"
    echo "  supabase login"
    exit 1
fi

echo "✅ Авторизованы"
echo ""

# Список проектов
echo "Доступные проекты:"
supabase projects list

echo ""
echo "Введите project-ref вашего проекта (из URL Supabase):"
read PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo "❌ Project-ref не указан"
    exit 1
fi

# Создание директории для экспорта
EXPORT_DIR="./supabase_migrations_export"
mkdir -p "$EXPORT_DIR"

echo ""
echo "Связывание с проектом..."
supabase link --project-ref "$PROJECT_REF"

echo ""
echo "Скачивание миграций..."
supabase db pull --schema public,auth,storage

echo ""
echo "Создание SQL дампа..."
supabase db dump -f "$EXPORT_DIR/full_dump.sql"

echo ""
echo "✅ Миграции экспортированы в: $EXPORT_DIR"
echo ""
echo "Файлы:"
ls -la "$EXPORT_DIR"

echo ""
echo "📤 Отправьте эти файлы для применения на новом сервере!"

