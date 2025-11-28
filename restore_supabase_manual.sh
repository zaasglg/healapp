#!/bin/bash
# Ручное восстановление Supabase на старом сервере
# Используйте этот скрипт, если Git не работает

set -euo pipefail

echo "=== Ручное восстановление Supabase ==="
echo ""
echo "Если Git не работает, выполните следующие команды вручную:"
echo ""

cat <<'EOF'
# 1. Подключитесь к серверу
ssh root@176.124.217.224

# 2. Создайте директорию
mkdir -p /opt/supabase-project
cd /opt/supabase-project

# 3. СКАЧАЙТЕ архив Supabase вручную:
# Вариант A: Если есть доступ к другому серверу с Git:
#   - Скачайте архив на локальный компьютер
#   - Загрузите на сервер через scp:
#     scp supabase-master.zip root@176.124.217.224:/opt/supabase-project/

# Вариант B: Используйте зеркало GitHub (если доступно)

# Вариант C: Используйте готовый Docker образ напрямую

# 4. После получения файлов:
cd /opt/supabase-project
unzip supabase-master.zip
mv supabase-master supabase

# 5. Создайте .env файл
cd supabase/docker
cp .env.example .env

# 6. Сгенерируйте пароли
POSTGRES_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ANON_KEY=$(openssl rand -hex 32)
SERVICE_KEY=$(openssl rand -hex 32)

# 7. Добавьте в .env
cat >> .env <<ENVEOF

POSTGRES_PASSWORD=$POSTGRES_PASS
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_KEY
SITE_URL=https://176.124.217.224
SUPABASE_PUBLIC_URL=https://176.124.217.224
ENVEOF

# 8. Запустите Supabase
docker compose up -d

# 9. Проверьте статус
docker ps
docker compose logs --tail 50
EOF

echo ""
echo "=== Или используйте готовые Docker образы ==="
echo ""
echo "Можно запустить Supabase напрямую через Docker без клонирования:"
echo ""
echo "docker run -d --name supabase-studio -p 54323:3000 supabase/studio:latest"
echo ""

