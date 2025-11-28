#!/bin/bash
# Скрипт для выполнения на сервере напрямую

cd /opt/supabase-project/supabase/docker

# Генерация паролей
POSTGRES_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ANON_KEY=$(openssl rand -hex 32)
SERVICE_KEY=$(openssl rand -hex 32)

# Создание .env
cat > .env <<ENVEOF
POSTGRES_PASSWORD=$POSTGRES_PASS
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_KEY
SITE_URL=https://176.124.217.224
SUPABASE_PUBLIC_URL=https://176.124.217.224
ENVEOF

echo "✅ .env создан"
echo "Пароль PostgreSQL: $POSTGRES_PASS"

# Запуск
docker compose up -d

echo "Ожидание запуска (30 секунд)..."
sleep 30

echo ""
echo "Статус контейнеров:"
docker ps | grep supabase

