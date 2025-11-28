#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env

echo "Создаем Studio с правильными переменными..."
docker run -d \
  --name supabase-studio \
  --network docker_default \
  --network-alias studio \
  -p 54323:3000 \
  -e STUDIO_PG_META_URL=http://meta:8080 \
  -e POSTGRES_PASSWORD=4a83705eeb44c26e2ff867a5f853f5ce \
  -e DEFAULT_ORGANIZATION_NAME='Default Organization' \
  -e DEFAULT_PROJECT_NAME='Default Project' \
  -e SUPABASE_URL=http://rest:3000 \
  -e SUPABASE_PUBLIC_URL=http://176.124.217.224 \
  -e SUPABASE_ANON_KEY=5a35400515a186b111c2bb2b8f37154000e1d631d12d7a227dc76dea01af2184 \
  -e SUPABASE_SERVICE_KEY=78013cffaafbb367925be0f1142e4c76c223a015946096e38ca01bb31abcee2b \
  -e API_URL=http://rest:3000 \
  supabase/studio:latest

echo "Ждем запуска..."
sleep 15

echo "Проверяем статус..."
docker ps | grep studio

echo ""
echo "Проверяем логи..."
docker logs supabase-studio --tail 5

