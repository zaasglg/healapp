#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

PASSWORD="$POSTGRES_PASSWORD"
echo "Используем пароль: $PASSWORD"
echo ""

echo "1. Удаляем пользователя если существует..."
docker exec supabase-db psql -U postgres -d postgres -c "DROP USER IF EXISTS supabase_admin;" 2>&1

echo ""
echo "2. Создаем пользователя заново с паролем..."
docker exec supabase-db psql -U postgres -d postgres <<SQL
CREATE USER supabase_admin WITH PASSWORD '$PASSWORD';
ALTER USER supabase_admin WITH SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;
GRANT ALL ON SCHEMA public TO supabase_admin;
GRANT ALL ON SCHEMA auth TO supabase_admin;
GRANT ALL ON SCHEMA storage TO supabase_admin;
SQL

echo ""
echo "3. Проверяем создание пользователя..."
docker exec supabase-db psql -U postgres -d postgres -c "SELECT usename, usesuper FROM pg_user WHERE usename = 'supabase_admin';" 2>&1

echo ""
echo "4. Тестируем подключение с этим паролем..."
docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT current_user, current_database();" 2>&1

echo ""
echo "5. Перезапускаем meta с этим паролем..."
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
  -e PG_META_DB_PASSWORD="$PASSWORD" \
  -e PG_META_PORT=8080 \
  d15da6f8925b

echo ""
echo "6. Ждем запуска meta..."
sleep 10

echo ""
echo "7. Проверяем логи meta на ошибки подключения..."
docker logs supabase-meta 2>&1 | grep -i "error\|fatal\|password\|auth" | tail -10

echo ""
echo "8. Перезапускаем Studio..."
docker restart supabase-studio

echo ""
echo "Готово! Пароль: $PASSWORD"
echo "Проверьте Studio в браузере."

