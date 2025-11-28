#!/bin/bash
# Получить недостающие миграции из Cloud и применить на RF сервере

CLOUD_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
CLOUD_PORT="5432"
CLOUD_USER="postgres"
CLOUD_DB="postgres"
CLOUD_PASS="Dn2907200!"

echo "=== Получение недостающих миграций ==="

# Получить список миграций из Cloud
echo "Получение списка миграций из Cloud..."
PGPASSWORD="$CLOUD_PASS" psql -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" -t -A -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" > /tmp/cloud_migrations.txt

# Получить список миграций с RF сервера
echo "Получение списка миграций с RF сервера..."
cd ~/HealApp-Web
docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" > /tmp/rf_migrations.txt

# Найти недостающие
MISSING=$(comm -23 <(sort /tmp/cloud_migrations.txt) <(sort /tmp/rf_migrations.txt))

if [ -z "$MISSING" ]; then
    echo "✅ Все миграции присутствуют на RF сервере"
    exit 0
fi

echo "❌ Найдены недостающие миграции:"
echo "$MISSING"
echo ""

# Получить полную схему из Cloud
echo "Получение полной схемы из Cloud..."
PGPASSWORD="$CLOUD_PASS" pg_dump -h "$CLOUD_HOST" -U "$CLOUD_USER" -d "$CLOUD_DB" -p "$CLOUD_PORT" --schema-only > /tmp/cloud_schema.sql

echo "Схема сохранена в /tmp/cloud_schema.sql"
echo "Размер файла: $(du -h /tmp/cloud_schema.sql | cut -f1)"

