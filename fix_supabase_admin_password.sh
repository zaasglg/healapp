#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

echo "Текущий пароль PostgreSQL: $POSTGRES_PASSWORD"
echo ""
echo "Обновляем пароль для supabase_admin..."

docker exec supabase-db psql -U postgres -d postgres <<SQL
-- Проверяем существование пользователя
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'supabase_admin') THEN
        CREATE USER supabase_admin WITH PASSWORD '$POSTGRES_PASSWORD';
        RAISE NOTICE 'Пользователь supabase_admin создан';
    ELSE
        ALTER USER supabase_admin WITH PASSWORD '$POSTGRES_PASSWORD';
        RAISE NOTICE 'Пароль для supabase_admin обновлен';
    END IF;
END
\$\$;

-- Даем все права
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;
ALTER USER supabase_admin WITH SUPERUSER;

-- Проверяем
SELECT usename, usesuper FROM pg_user WHERE usename = 'supabase_admin';
SQL

echo ""
echo "Пароль установлен: $POSTGRES_PASSWORD"
echo ""
echo "Перезапускаем meta с правильным паролем..."
docker stop supabase-meta 2>/dev/null
docker rm supabase-meta 2>/dev/null

docker run -d \
  --name supabase-meta \
  --network docker_default \
  --network-alias meta \
  -p 8080:8080 \
  -e PG_META_DB_HOST=db \
  -e PG_META_DB_PORT=5432 \
  -e PG_META_DB_NAME=postgres \
  -e PG_META_DB_USER=supabase_admin \
  -e PG_META_DB_PASSWORD=$POSTGRES_PASSWORD \
  -e PG_META_PORT=8080 \
  d15da6f8925b

echo ""
echo "Ждем запуска meta..."
sleep 10

echo "Проверяем подключение..."
docker logs supabase-meta --tail 5

echo ""
echo "Перезапускаем Studio..."
docker restart supabase-studio

echo ""
echo "Готово! Проверьте Studio в браузере."

