#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

echo "Останавливаем и удаляем старый meta..."
docker stop supabase-meta 2>/dev/null
docker rm supabase-meta 2>/dev/null

echo "Создаем новый meta с правильными переменными..."
docker run -d \
  --name supabase-meta \
  --network docker_default \
  --network-alias meta \
  -p 8080:8080 \
  -e PG_META_DB_HOST=db \
  -e PG_META_DB_PORT=5432 \
  -e PG_META_DB_NAME=postgres \
  -e PG_META_DB_USER=supabase_admin \
  -e PG_META_DB_PASSWORD=4a83705eeb44c26e2ff867a5f853f5ce \
  -e PG_META_PORT=8080 \
  d15da6f8925b

echo "Ждем запуска..."
sleep 10

echo "Проверяем логи..."
docker logs supabase-meta --tail 10

echo ""
echo "Проверяем подключение к базе..."
docker exec supabase-meta node -e "const http = require('http'); http.get('http://localhost:8080/health', (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => console.log('Health:', d)); }).on('error', e => console.log('Error:', e.message));"

