#!/bin/bash
# Получить все миграции из Supabase Cloud через Docker

CLOUD_DB_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
DB_PASSWORD="Dn2907200!"
LOCAL_DB_CONTAINER="caregivers-diary-db"

echo "=== Получение миграций из Supabase Cloud ==="

# Использовать Docker для psql
docker run --rm -e PGPASSWORD="$DB_PASSWORD" postgres:15 \
  psql -h $CLOUD_DB_HOST -U postgres -d postgres -p 5432 \
  -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;" \
  -t -A -F'|' > /tmp/migrations_list.txt

echo "Найдено миграций:"
cat /tmp/migrations_list.txt | wc -l

# Создать директорию для миграций
mkdir -p ~/HealApp-Web/migrations_from_cloud

# Получить SQL каждой миграции через Supabase API или напрямую из БД
echo "Получение SQL миграций..."
# Примечание: supabase_migrations.schema_migrations не хранит SQL напрямую
# Нужно использовать Supabase CLI или API для получения миграций

echo ""
echo "Для получения SQL миграций используйте Supabase CLI:"
echo "  supabase db dump -f migrations_backup.sql"
echo ""
echo "Или получите миграции через Supabase Dashboard → Database → Migrations"

