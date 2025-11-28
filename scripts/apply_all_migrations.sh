#!/bin/bash
# Применить все миграции из Supabase Cloud на российский сервер

CLOUD_DB_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
DB_PASSWORD="Dn2907200!"
LOCAL_DB_CONTAINER="caregivers-diary-db"

echo "=== Получение списка миграций из Supabase Cloud ==="

# Получить список всех миграций через Docker
docker run --rm -e PGPASSWORD="$DB_PASSWORD" postgres:15 \
  psql -h $CLOUD_DB_HOST -U postgres -d postgres -p 5432 \
  -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;" \
  -t -A -F'|' > /tmp/migrations_list.txt

echo "Найдено миграций:"
cat /tmp/migrations_list.txt | wc -l

# Создать директорию для миграций
mkdir -p ~/HealApp-Web/migrations_from_cloud

echo ""
echo "=== Получение SQL миграций ==="
echo "Для получения SQL миграций используйте Supabase CLI:"
echo "  supabase db dump -f migrations_backup.sql"
echo ""
echo "Или получите миграции через Supabase Dashboard → Database → Migrations"

