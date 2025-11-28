#!/bin/bash
# Исправить пользователя для meta сервиса

cd ~/HealApp-Web

echo "=== Проверка пользователя supabase_admin ==="
docker compose exec -T db psql -U postgres -d postgres <<'EOFSQL'
-- Проверить существует ли supabase_admin
SELECT usename, usesuper FROM pg_user WHERE usename = 'supabase_admin';

-- Если не существует, создать с паролем из переменной окружения
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'supabase_admin') THEN
    -- Создать пользователя (только суперпользователь может создать supabase_admin)
    EXECUTE format('CREATE USER supabase_admin WITH PASSWORD %L', current_setting('app.settings.db_password', true));
    ALTER USER supabase_admin WITH SUPERUSER;
    GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;
    RAISE NOTICE 'User supabase_admin created';
  ELSE
    -- Обновить пароль (только суперпользователь может изменить пароль supabase_admin)
    EXECUTE format('ALTER USER supabase_admin WITH PASSWORD %L', current_setting('app.settings.db_password', true));
    RAISE NOTICE 'User supabase_admin password updated';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Cannot modify supabase_admin: %', SQLERRM;
END
$$;
EOFSQL

echo ""
echo "=== Обновление docker-compose.yml ==="
# Обновить PG_META_DB_USER на supabase_admin
sed -i 's/PG_META_DB_USER: postgres/PG_META_DB_USER: supabase_admin/' docker-compose.yml

echo ""
echo "=== Перезапуск meta сервиса ==="
docker compose up -d meta
sleep 5

echo ""
echo "=== Проверка логов meta ==="
docker compose logs meta --tail 10 | grep -i 'error\|connected\|ready' || echo "Логи проверены"

