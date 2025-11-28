#!/bin/bash
# Создать пользователя supabase_admin

cd ~/HealApp-Web

echo "=== Создание пользователя supabase_admin ==="
docker compose exec -T db psql -U postgres -d postgres <<'EOFSQL'
-- Создать пользователя supabase_admin если его нет
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'supabase_admin') THEN
    CREATE USER supabase_admin WITH PASSWORD 'Dn2907200!';
    ALTER USER supabase_admin WITH SUPERUSER;
    GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;
    RAISE NOTICE 'User supabase_admin created';
  ELSE
    ALTER USER supabase_admin WITH PASSWORD 'Dn2907200!';
    RAISE NOTICE 'User supabase_admin password updated';
  END IF;
END
$$;

-- Проверить
SELECT usename, usesuper FROM pg_user WHERE usename IN ('postgres', 'supabase_admin');
EOFSQL

echo ""
echo "=== Перезапуск meta сервиса ==="
docker compose restart meta
sleep 5

echo ""
echo "=== Проверка логов meta ==="
docker compose logs meta --tail 10 | grep -i 'error\|connected\|ready' || echo "Логи проверены"

