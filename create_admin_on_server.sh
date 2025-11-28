#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

echo "Создание пользователя supabase_admin..."

docker exec supabase-db psql -U postgres -d postgres <<'SQL'
-- Создаем пользователя если его нет
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'supabase_admin') THEN
        CREATE USER supabase_admin WITH PASSWORD '4a83705eeb44c26e2ff867a5f853f5ce';
    ELSE
        ALTER USER supabase_admin WITH PASSWORD '4a83705eeb44c26e2ff867a5f853f5ce';
    END IF;
END
\$\$;

-- Даем права
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;
GRANT ALL ON SCHEMA public TO supabase_admin;
GRANT ALL ON SCHEMA auth TO supabase_admin;

-- Делаем суперпользователем
ALTER USER supabase_admin WITH SUPERUSER;
SQL

echo "Пользователь создан"

