#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

# Находим сеть
NETWORK=$(docker inspect supabase-db 2>/dev/null | grep '"Networks"' -A 5 | grep -v Networks | head -1 | cut -d'"' -f2)
if [ -z "$NETWORK" ]; then
    NETWORK="docker_default"
fi

echo "Сеть: $NETWORK"

# Удаляем старый контейнер
docker rm -f supabase-meta 2>/dev/null || true

# Запускаем meta
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

echo "Meta запущен, ждем 5 секунд..."
sleep 5

docker ps | grep meta
docker logs supabase-meta --tail 5

echo ""
echo "Перезапускаем Studio..."
cd /opt/supabase-project/supabase/docker
docker compose restart studio

