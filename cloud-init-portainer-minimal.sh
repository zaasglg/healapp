#!/bin/bash
# Минимальный Cloud-init скрипт для сервера с Portainer
# Только подготовка окружения, без установки Supabase

set -euo pipefail

echo "=== Cloud-init: Подготовка сервера для Supabase ==="
echo "Дата: $(date)"

# === 1. Обновление системы ===
echo "📦 Обновление системы..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# === 2. Установка необходимых утилит ===
echo "📦 Установка утилит..."
apt-get install -y -qq \
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
    ufw \
    openssl

# === 3. Настройка Git для работы с GitHub ===
echo "🔧 Настройка Git..."
git config --global url.'http://github.com/'.insteadOf 'https://github.com/' 2>/dev/null || true
git config --global http.sslVerify false 2>/dev/null || true
git config --global http.timeout 300 2>/dev/null || true
git config --global http.postBuffer 524288000 2>/dev/null || true

# Добавление GitHub в /etc/hosts
if ! grep -q "github.com" /etc/hosts; then
    echo "140.82.121.3 github.com www.github.com raw.githubusercontent.com" >> /etc/hosts
fi

# === 4. Настройка DNS ===
echo "🌐 Настройка DNS..."
if [ -f /etc/systemd/resolved.conf ]; then
    if ! grep -q "DNS=77.88.8.8" /etc/systemd/resolved.conf; then
        sed -i '/^\[Resolve\]/a DNS=77.88.8.8 77.88.8.1 8.8.8.8 8.8.4.4' /etc/systemd/resolved.conf 2>/dev/null || true
        systemctl restart systemd-resolved 2>/dev/null || true
    fi
fi

# === 5. Создание директории для Supabase ===
echo "📁 Создание директорий..."
mkdir -p /opt/supabase-project
mkdir -p /opt/supabase-project/backups
chmod 755 /opt/supabase-project

# === 6. Настройка базового фаервола ===
echo "🔥 Настройка фаервола..."
ufw --force enable 2>/dev/null || true
ufw default deny incoming 2>/dev/null || true
ufw default allow outgoing 2>/dev/null || true
ufw allow ssh 2>/dev/null || true
ufw allow http 2>/dev/null || true
ufw allow https 2>/dev/null || true

# === 7. Проверка Docker и Portainer ===
echo "🐳 Проверка Docker и Portainer..."
sleep 5  # Даем время Portainer запуститься
if command -v docker &> /dev/null; then
    echo "✅ Docker установлен: $(docker --version)"
else
    echo "⚠️  Docker не найден (должен быть установлен через Portainer)"
fi

if docker ps 2>/dev/null | grep -q portainer; then
    echo "✅ Portainer контейнер запущен"
    PORTAINER_IP=$(docker inspect $(docker ps | grep portainer | awk '{print $1}') 2>/dev/null | grep -i ipaddress | head -1 | awk -F'"' '{print $4}' || echo "не найден")
    echo "   Portainer IP: $PORTAINER_IP"
else
    echo "⚠️  Portainer контейнер не найден (может еще запускаться)"
fi

# === 8. Создание README с инструкциями ===
echo "📝 Создание инструкций..."
cat > /opt/supabase-project/README.md <<'README_EOF'
# Установка Supabase на сервере с Portainer

## После Cloud-init

1. **Откройте Portainer:**
   - Обычно доступен по IP:9000
   - Или через веб-интерфейс провайдера

2. **Клонируйте репозиторий Supabase:**
   ```bash
   cd /opt/supabase-project
   git clone --depth 1 http://github.com/supabase/supabase.git
   cd supabase/docker
   ```

3. **Создайте .env файл:**
   ```bash
   cp .env.example .env
   # Отредактируйте .env файл с вашими настройками
   nano .env
   ```

4. **Запустите через Docker Compose:**
   ```bash
   docker compose up -d
   ```

5. **Или через Portainer:**
   - Создайте новый Stack в Portainer
   - Загрузите docker-compose.yml
   - Запустите

## Настройка Nginx и SSL

После запуска Supabase настройте Nginx и SSL сертификат.

README_EOF

# === 9. Финальный вывод ===
echo ""
echo "✅ Cloud-init завершен!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Подождите завершения загрузки сервера (2-5 минут)"
echo "2. Проверьте логи: cat /var/log/cloud-init-output.log"
echo "3. Откройте Portainer через веб-интерфейс"
echo "4. Установите Supabase вручную (см. /opt/supabase-project/README.md)"
echo ""
echo "📁 Файлы находятся в: /opt/supabase-project"
echo ""
echo "=== Cloud-init завершен: $(date) ==="

