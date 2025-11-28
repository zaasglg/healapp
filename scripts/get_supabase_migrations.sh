#!/bin/bash
# Получить все миграции из Supabase Cloud и применить на российский сервер

PROJECT_REF="mtpawypaihmwrngirnxa"
DB_PASSWORD="Dn2907200!"
CLOUD_DB_HOST="db.mtpawypaihmwrngirnxa.supabase.co"
LOCAL_DB_CONTAINER="caregivers-diary-db"

echo "=== Получение миграций из Supabase Cloud ==="

# Экспорт пароля для psql
export PGPASSWORD="$DB_PASSWORD"

# Получить список всех миграций
echo "Получение списка миграций..."
psql -h $CLOUD_DB_HOST -U postgres -d postgres -p 5432 \
  -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;" \
  -t -A -F'|' > /tmp/migrations_list.txt

echo "Найдено миграций:"
cat /tmp/migrations_list.txt | wc -l

# Создать директорию для миграций
mkdir -p ~/HealApp-Web/migrations_from_cloud

# Получить SQL каждой миграции
echo "Экспорт миграций..."
while IFS='|' read -r version name; do
  if [ ! -z "$version" ] && [ ! -z "$name" ]; then
    echo "  - $version: $name"
    psql -h $CLOUD_DB_HOST -U postgres -d postgres -p 5432 \
      -c "SELECT sql FROM supabase_migrations.schema_migrations WHERE version = '$version';" \
      -t -A > "~/HealApp-Web/migrations_from_cloud/${version}_${name}.sql"
  fi
done < /tmp/migrations_list.txt

echo "Миграции сохранены в ~/HealApp-Web/migrations_from_cloud/"

# Применить миграции на локальный сервер
echo ""
echo "=== Применение миграций на российский сервер ==="

cd ~/HealApp-Web

for migration_file in migrations_from_cloud/*.sql; do
  if [ -f "$migration_file" ]; then
    version=$(basename "$migration_file" | cut -d'_' -f1)
    echo "Применение миграции: $version"
    docker compose exec -T db psql -U postgres -d postgres < "$migration_file"
  fi
done

echo "Все миграции применены!"

