#!/bin/bash
# Восстановление Supabase через готовые Docker образы (без Git)

set -euo pipefail

OLD_SERVER="176.124.217.224"

echo "=== Восстановление Supabase через Docker образы ==="
echo ""

# Создание docker-compose.yml напрямую
ssh root@$OLD_SERVER <<'EOFDOCKER'
cd /opt/supabase-project
mkdir -p supabase/docker
cd supabase/docker

# Создание минимального docker-compose.yml
cat > docker-compose.yml <<'COMPOSEEOF'
version: '3.8'

services:
  db:
    image: supabase/postgres:15.1.0.147
    container_name: supabase-db
    restart: unless-stopped
    ports:
      - "54322:5432"
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGDATA: /var/lib/postgresql/data
      POSTGRES_PORT: 5432
      POSTGRES_DB: postgres
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  studio:
    image: supabase/studio:20231128-0b97c65
    container_name: supabase-studio
    restart: unless-stopped
    ports:
      - "54323:3000"
    environment:
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      DEFAULT_ORGANIZATION_NAME: Default Organization
      DEFAULT_PROJECT_NAME: Default Project
      SUPABASE_URL: http://kong:8000
      SUPABASE_PUBLIC_URL: ${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
    depends_on:
      meta:
        condition: service_healthy

  meta:
    image: supabase/postgres-meta:v0.80.0
    container_name: supabase-meta
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: db
      PG_META_DB_PORT: 5432
      PG_META_DB_NAME: postgres
      PG_META_DB_USER: postgres
      PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 5s
      timeout: 5s
      retries: 10

  rest:
    image: postgrest/postgrest:v11.2.0
    container_name: supabase-rest
    restart: unless-stopped
    ports:
      - "54321:3000"
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@db:5432/postgres
      PGRST_DB_SCHEMAS: public,storage,graphql_public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
    depends_on:
      db:
        condition: service_healthy

  auth:
    image: supabase/gotrue:v2.99.0
    container_name: supabase-auth
    restart: unless-stopped
    ports:
      - "54324:9999"
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db:5432/postgres
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ${SITE_URL}
      GOTRUE_DISABLE_SIGNUP: false
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_JWT_EXP: 3600
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_EXTERNAL_EMAIL_ENABLED: true
      GOTRUE_MAILER_AUTOCONFIRM: true
    depends_on:
      db:
        condition: service_healthy

volumes:
  db-data:
COMPOSEEOF

echo "✅ docker-compose.yml создан"

# Создание .env
POSTGRES_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ANON_KEY=$(openssl rand -hex 32)
SERVICE_KEY=$(openssl rand -hex 32)

cat > .env <<ENVEOF
POSTGRES_PASSWORD=$POSTGRES_PASS
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_KEY
SITE_URL=https://176.124.217.224
SUPABASE_PUBLIC_URL=https://176.124.217.224
ENVEOF

echo "✅ .env файл создан"
echo "📝 Пароль PostgreSQL: $POSTGRES_PASS"
echo ""

# Запуск
echo "Запуск контейнеров..."
docker compose up -d

echo "Ожидание запуска (30 секунд)..."
sleep 30

echo ""
echo "Статус контейнеров:"
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep supabase
EOFDOCKER

echo ""
echo "=== Восстановление завершено ==="
echo ""
echo "Проверьте доступность:"
echo "- Studio: http://176.124.217.224:54323"
echo "- REST API: http://176.124.217.224:54321/rest/v1/"

