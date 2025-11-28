#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

# Получаем сеть
NETWORK=$(docker inspect supabase-db 2>/dev/null | grep -A 5 Networks | grep Name | head -1 | cut -d'"' -f4)
if [ -z "$NETWORK" ]; then
    NETWORK=$(docker network ls | grep supabase | awk '{print $1}' | head -1)
fi

echo "Используем сеть: $NETWORK"

# Удаляем старый контейнер
docker rm -f supabase-meta 2>/dev/null || true

# Запускаем meta используя ID образа
docker run -d \
  --name supabase-meta \
  --network "$NETWORK" \
  -p 8080:8080 \
  -e PG_META_DB_HOST=db \
  -e PG_META_DB_PORT=5432 \
  -e PG_META_DB_NAME=postgres \
  -e PG_META_DB_USER=postgres \
  -e PG_META_DB_PASSWORD="$POSTGRES_PASSWORD" \
  d15da6f8925b

echo "Meta контейнер запущен"
sleep 5
docker ps | grep meta

