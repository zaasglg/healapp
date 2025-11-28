#!/bin/bash
# Применение миграций на новом сервере

cd /opt/supabase-project/supabase/docker
source .env

echo "=== Применение миграций на новом сервере ==="
echo ""

echo "1. Проверка подключения к базе данных..."
docker exec supabase-db psql -U postgres -d postgres -c "SELECT version();" 2>&1 | head -3

echo ""
echo "2. Применение миграций..."
echo "Это может занять несколько минут..."

# Применяем миграции
docker exec -i supabase-db psql -U postgres -d postgres < /tmp/migrations.sql 2>&1 | tee /tmp/migration_log.txt

echo ""
echo "3. Проверка результата..."
if [ $? -eq 0 ]; then
    echo "✅ Миграции применены успешно!"
else
    echo "⚠️  Были ошибки при применении миграций"
    echo "Проверьте логи: cat /tmp/migration_log.txt"
fi

echo ""
echo "4. Проверка созданных таблиц..."
docker exec supabase-db psql -U postgres -d postgres -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" 2>&1 | head -20

echo ""
echo "5. Перезапускаем сервисы..."
docker restart supabase-rest supabase-meta supabase-studio

echo ""
echo "=== Готово! ==="
echo "Проверьте Studio в браузере - должны появиться все таблицы!"

