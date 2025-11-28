#!/bin/bash
# Cloud-init скрипт для подготовки сервера с Portainer для Supabase
# Этот скрипт выполнится при первой загрузке сервера

set -euo pipefail

echo "=== Cloud-init: Подготовка сервера для Supabase ==="
echo "Дата: $(date)"

# === 1. Обновление системы ===
echo "📦 Обновление системы..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y

# === 2. Установка необходимых утилит ===
echo "📦 Установка утилит..."
apt-get install -y \
    curl \
    git \
    jq \
    apache2-utils \
    nginx \
    certbot \
    python3-certbot-nginx \
    unzip \
    htop \
    net-tools \
    ufw

# === 3. Настройка Git для работы с GitHub ===
echo "🔧 Настройка Git..."
# Настройка для работы через HTTP (если HTTPS заблокирован)
git config --global url.'http://github.com/'.insteadOf 'https://github.com/' || true
git config --global http.sslVerify false || true
git config --global http.timeout 300 || true
git config --global http.postBuffer 524288000 || true

# Добавление GitHub в /etc/hosts (если нужно)
if ! grep -q "github.com" /etc/hosts; then
    echo "140.82.121.3 github.com www.github.com raw.githubusercontent.com" >> /etc/hosts
fi

# === 4. Настройка DNS (если нужно) ===
echo "🌐 Настройка DNS..."
# Добавление альтернативных DNS серверов
if [ -f /etc/systemd/resolved.conf ]; then
    if ! grep -q "DNS=77.88.8.8" /etc/systemd/resolved.conf; then
        sed -i '/^\[Resolve\]/a DNS=77.88.8.8 77.88.8.1 8.8.8.8 8.8.4.4' /etc/systemd/resolved.conf || true
        systemctl restart systemd-resolved || true
    fi
fi

# === 5. Создание директории для Supabase ===
echo "📁 Создание директорий..."
mkdir -p /opt/supabase-project
mkdir -p /opt/supabase-project/backups
chmod 755 /opt/supabase-project

# === 6. Настройка базового фаервола ===
echo "🔥 Настройка фаервола..."
ufw --force enable || true
ufw default deny incoming || true
ufw default allow outgoing || true
ufw allow ssh || true
ufw allow http || true
ufw allow https || true

# === 7. Проверка Docker и Portainer ===
echo "🐳 Проверка Docker и Portainer..."
if command -v docker &> /dev/null; then
    echo "✅ Docker установлен: $(docker --version)"
else
    echo "⚠️  Docker не найден (должен быть установлен через Portainer)"
fi

if docker ps | grep -q portainer; then
    echo "✅ Portainer контейнер запущен"
else
    echo "⚠️  Portainer контейнер не найден"
fi

# === 8. Создание скрипта для установки Supabase ===
echo "📝 Создание скрипта установки Supabase..."
cat > /opt/supabase-project/install_supabase.sh <<'INSTALL_EOF'
#!/bin/bash
# Скрипт для установки Supabase через Docker Compose
# Этот скрипт нужно будет запустить вручную после настройки Portainer

set -euo pipefail

cd /opt/supabase-project

echo "=== Установка Supabase ==="

# Запрос данных у пользователя
read -p "Введите ваш IP или домен: " IP_DOMAIN
read -p "Введите ваш email для SSL: " EMAIL
read -p "Введите имя пользователя для входа: " DASH_USER
read -p "Введите пароль для входа: " DASH_PASS

if [ -z "$IP_DOMAIN" ]; then 
    echo "❌ IP или домен пустой!"; 
    exit 1; 
fi

# Клонирование репозитория Supabase
echo "📥 Клонирование репозитория Supabase..."
if [ -d "supabase" ]; then
    rm -rf supabase
fi

git clone --depth 1 http://github.com/supabase/supabase.git supabase || {
    echo "❌ Не удалось клонировать. Попробуйте вручную."
    exit 1
}

cd supabase/docker

# Генерация .env
echo "⚙️  Генерация .env файла..."
if [ -f .env.example ]; then
    cp .env.example .env
fi

POSTGRES_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 20)
ANON_KEY=$(openssl rand -hex 20)
SERVICE_KEY=$(openssl rand -hex 20)

cat <<EOF >> .env
POSTGRES_PASSWORD=$POSTGRES_PASS
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_KEY
SITE_URL=https://$IP_DOMAIN
SUPABASE_PUBLIC_URL=https://$IP_DOMAIN
DASHBOARD_USERNAME=$DASH_USER
DASHBOARD_PASSWORD=$DASH_PASS
EOF

echo "✅ .env файл создан"

# Запуск через Docker Compose
echo "🚀 Запуск Supabase через Docker Compose..."
docker compose up -d

echo ""
echo "✅ Supabase установлен!"
echo "📝 Данные сохранены в /opt/supabase-project/supabase/docker/.env"
INSTALL_EOF

chmod +x /opt/supabase-project/install_supabase.sh

# === 9. Финальный вывод ===
echo ""
echo "✅ Cloud-init завершен!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Подождите завершения загрузки сервера"
echo "2. Откройте Portainer через веб-интерфейс"
echo "3. Запустите установку Supabase:"
echo "   /opt/supabase-project/install_supabase.sh"
echo ""
echo "📁 Файлы находятся в: /opt/supabase-project"
echo ""
echo "=== Cloud-init завершен: $(date) ==="

