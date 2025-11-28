#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

# Проверяем сеть
NETWORK=$(docker network ls | grep supabase | awk '{print $1}' | head -1)
if [ -z "$NETWORK" ]; then
    NETWORK=$(docker inspect supabase-db | grep -i networkmode | head -1 | awk -F'"' '{print $4}')
fi

# Удаляем старый контейнер если есть
docker rm -f supabase-meta 2>/dev/null || true

# Запускаем meta
docker run -d \
  --name supabase-meta \
  --network $NETWORK \
  -p 8080:8080 \
  -e PG_META_DB_HOST=db \
  -e PG_META_DB_PORT=5432 \
  -e PG_META_DB_NAME=postgres \
  -e PG_META_DB_USER=postgres \
  -e PG_META_DB_PASSWORD=$POSTGRES_PASSWORD \
  supabase/postgres-meta:v0.79

echo "Meta контейнер запущен"
sleep 5
docker ps | grep meta

