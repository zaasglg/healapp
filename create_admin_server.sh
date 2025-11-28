#!/bin/bash
echo "Создание пользователя supabase_admin..."

docker exec supabase-db psql -U postgres postgres <<'SQL'
DROP USER IF EXISTS supabase_admin;
CREATE USER supabase_admin WITH PASSWORD '4a83705eeb44c26e2ff867a5f853f5ce' SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;
GRANT ALL ON SCHEMA public TO supabase_admin;
GRANT ALL ON SCHEMA auth TO supabase_admin;
GRANT ALL ON SCHEMA storage TO supabase_admin;
SELECT usename, usesuper FROM pg_user WHERE usename = 'supabase_admin';
SQL

echo ""
echo "Проверяем подключение..."
docker exec -e PGPASSWORD=4a83705eeb44c26e2ff867a5f853f5ce supabase-db psql -U supabase_admin postgres -c "SELECT current_user, current_database();"

echo ""
echo "Готово!"

