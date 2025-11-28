#!/bin/bash
# Получить дамп схемы напрямую через MCP или альтернативные методы

echo "=== Получение дампа схемы ==="

# Метод 1: Попробовать через Docker с прямым подключением
echo "Попытка 1: Docker с прямым подключением..."
docker run --rm -e PGPASSWORD='Dn2907200!' postgres:15 \
  pg_dump 'postgresql://postgres:Dn2907200!@db.mtpawypaihmwrngirnxa.supabase.co:5432/postgres' \
  --schema-only --schema=public --no-owner --no-acl \
  > supabase_schema_dump.sql 2>&1

if [ $? -eq 0 ] && [ -s supabase_schema_dump.sql ]; then
  echo "✅ Дамп получен успешно!"
  wc -l supabase_schema_dump.sql
  exit 0
fi

echo "Метод 1 не сработал. Используйте альтернативные методы:"
echo ""
echo "1. Через Supabase Dashboard:"
echo "   - Откройте https://mtpawypaihmwrngirnxa.supabase.co"
echo "   - Database → SQL Editor"
echo "   - Выполните запросы для получения схемы"
echo ""
echo "2. Через Supabase CLI (Scoop на Windows):"
echo "   scoop install supabase"
echo "   supabase login"
echo "   supabase link --project-ref mtpawypaihmwrngirnxa"
echo "   supabase db dump -f migrations_backup.sql"
echo ""
echo "3. Скачать бинарник Supabase CLI:"
echo "   https://github.com/supabase/cli/releases"

