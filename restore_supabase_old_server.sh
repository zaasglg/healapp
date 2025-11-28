#!/bin/bash
# Восстановление Supabase на старом сервере (176.124.217.224)

set -euo pipefail

OLD_SERVER="176.124.217.224"

echo "=== Восстановление Supabase на старом сервере ==="
echo ""

# Проверка подключения
echo "1. Проверка подключения к серверу..."
if ! ssh -o ConnectTimeout=5 root@$OLD_SERVER "echo 'OK'" 2>/dev/null; then
    echo "❌ Не удалось подключиться к серверу"
    exit 1
fi
echo "✅ Подключение установлено"

# Очистка старых контейнеров
echo ""
echo "2. Очистка старых контейнеров..."
ssh root@$OLD_SERVER <<'EOFCLEAN'
# Остановка и удаление старых контейнеров
docker ps -a | grep -E '(supabase|postgres|auth|rest|storage|realtime|studio|meta|functions|kong|edge)' | awk '{print $1}' | xargs -r docker rm -f 2>/dev/null || true

# Удаление старых сетей
docker network ls | grep supabase | awk '{print $1}' | xargs -r docker network rm 2>/dev/null || true

echo "✅ Очистка завершена"
EOFCLEAN

# Создание директории проекта
echo ""
echo "3. Создание директории проекта..."
ssh root@$OLD_SERVER <<'EOFDIR'
mkdir -p /opt/supabase-project
cd /opt/supabase-project
echo "✅ Директория создана: $(pwd)"
EOFDIR

# Клонирование Supabase
echo ""
echo "4. Клонирование репозитория Supabase..."
ssh root@$OLD_SERVER <<'EOFCLONE'
cd /opt/supabase-project

# Настройка Git для работы с GitHub
git config --global url.'http://github.com/'.insteadOf 'https://github.com/' 2>/dev/null || true
git config --global http.sslVerify false 2>/dev/null || true
git config --global http.timeout 300 2>/dev/null || true

# Добавление GitHub в /etc/hosts
if ! grep -q "github.com" /etc/hosts; then
    echo "140.82.121.3 github.com www.github.com raw.githubusercontent.com" >> /etc/hosts
fi

# Удаление старой директории если есть
if [ -d "supabase" ]; then
    echo "Удаление старой директории..."
    rm -rf supabase
fi

# Клонирование
echo "Клонирование репозитория..."
if git clone --depth 1 http://github.com/supabase/supabase.git 2>&1; then
    echo "✅ Репозиторий клонирован"
else
    echo "❌ Ошибка при клонировании"
    exit 1
fi
EOFCLONE

# Создание .env файла
echo ""
echo "5. Создание .env файла..."
ssh root@$OLD_SERVER <<'EOFENV'
cd /opt/supabase-project/supabase/docker

if [ -f .env.example ]; then
    cp .env.example .env
    echo "✅ .env файл создан из примера"
else
    echo "❌ .env.example не найден"
    exit 1
fi

# Генерация паролей и ключей
POSTGRES_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ANON_KEY=$(openssl rand -hex 32)
SERVICE_KEY=$(openssl rand -hex 32)

# Обновление .env
cat >> .env <<ENVEOF

# Автоматически сгенерированные значения
POSTGRES_PASSWORD=$POSTGRES_PASS
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_KEY
SITE_URL=https://176.124.217.224
SUPABASE_PUBLIC_URL=https://176.124.217.224
ENVEOF

echo "✅ .env файл настроен"
echo "📝 Пароль PostgreSQL: $POSTGRES_PASS"
EOFENV

# Запуск Supabase
echo ""
echo "6. Запуск Supabase..."
ssh root@$OLD_SERVER <<'EOFSTART'
cd /opt/supabase-project/supabase/docker

echo "Запуск контейнеров..."
docker compose up -d

echo "Ожидание запуска сервисов (30 секунд)..."
sleep 30

echo "Проверка статуса контейнеров..."
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E '(supabase|postgres|auth|rest|storage|realtime|studio|meta|functions|kong)'
EOFSTART

# Проверка доступности
echo ""
echo "7. Проверка доступности..."
ssh root@$OLD_SERVER <<'EOFCHECK'
echo "Проверка REST API..."
curl -s http://localhost:54321/rest/v1/ 2>&1 | head -3 || echo "⚠️  REST API недоступен"

echo ""
echo "Проверка Studio..."
curl -s http://localhost:54323/ 2>&1 | head -3 || echo "⚠️  Studio недоступен"
EOFCHECK

echo ""
echo "=== Восстановление завершено ==="
echo ""
echo "📋 Следующие шаги:"
echo "1. Проверьте логи: ssh root@$OLD_SERVER 'cd /opt/supabase-project/supabase/docker && docker compose logs --tail 50'"
echo "2. Проверьте доступность: http://176.124.217.224:54323"
echo "3. Настройте Nginx и SSL (если нужно)"
echo ""
echo "🔑 Пароль PostgreSQL находится в: /opt/supabase-project/supabase/docker/.env"

