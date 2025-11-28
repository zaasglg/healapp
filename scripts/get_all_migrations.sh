#!/bin/bash
# Получить все миграции из Supabase Cloud

PROJECT_REF="mtpawypaihmwrngirnxa"
DB_PASSWORD="Dn2907200!"
DB_HOST="db.mtpawypaihmwrngirnxa.supabase.co"

echo "Получение всех миграций из Supabase Cloud..."

# Получить список миграций
psql -h $DB_HOST -U postgres -d postgres -p 5432 \
  -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;" \
  -t -A -F'|' > migrations_list.txt

echo "Список миграций сохранен в migrations_list.txt"

# Получить SQL каждой миграции
mkdir -p migrations_backup
while IFS='|' read -r version name; do
  if [ ! -z "$version" ]; then
    echo "Получение миграции: $version - $name"
    psql -h $DB_HOST -U postgres -d postgres -p 5432 \
      -c "SELECT sql FROM supabase_migrations.schema_migrations WHERE version = '$version';" \
      -t -A > "migrations_backup/${version}_${name}.sql"
  fi
done < migrations_list.txt

echo "Все миграции сохранены в migrations_backup/"

