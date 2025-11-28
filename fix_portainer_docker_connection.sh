#!/bin/bash
# Исправление подключения Portainer к Docker

echo "=== Диагностика проблемы ==="

# Проверка Docker
echo "1. Проверка Docker..."
if systemctl is-active --quiet docker; then
    echo "✅ Docker запущен"
    docker --version
else
    echo "❌ Docker НЕ запущен!"
    echo "Запускаю Docker..."
    systemctl start docker
    systemctl enable docker
    sleep 2
fi

# Проверка Docker socket
echo ""
echo "2. Проверка Docker socket..."
if [ -S /var/run/docker.sock ]; then
    echo "✅ Docker socket существует"
    ls -la /var/run/docker.sock
else
    echo "❌ Docker socket не найден!"
    exit 1
fi

# Проверка Portainer
echo ""
echo "3. Проверка Portainer..."
if docker ps -a | grep -q portainer; then
    echo "Portainer контейнер найден"
    
    # Проверяем, запущен ли
    if docker ps | grep -q portainer; then
        echo "✅ Portainer запущен"
        
        # Проверяем доступ к socket
        if docker inspect portainer 2>/dev/null | grep -q "/var/run/docker.sock:/var/run/docker.sock"; then
            echo "✅ Portainer имеет доступ к Docker socket"
        else
            echo "❌ Portainer НЕ имеет доступа к Docker socket!"
            echo ""
            echo "Перезапускаю Portainer с правильными флагами..."
            docker stop portainer
            docker rm portainer
        fi
    else
        echo "⚠️  Portainer остановлен"
    fi
else
    echo "⚠️  Portainer контейнер не найден"
fi

# Перезапуск Portainer с правильными флагами
echo ""
echo "4. Запуск/перезапуск Portainer..."
docker stop portainer 2>/dev/null || true
docker rm portainer 2>/dev/null || true

docker run -d \
  -p 9000:9000 \
  --name=portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest

echo "✅ Portainer перезапущен"

# Ожидание запуска
echo ""
echo "Ожидание запуска Portainer (5 секунд)..."
sleep 5

# Проверка подключения
echo ""
echo "5. Проверка подключения..."
if docker ps | grep -q portainer; then
    echo "✅ Portainer запущен"
    
    # Проверяем, может ли Portainer видеть Docker
    if docker exec portainer docker ps >/dev/null 2>&1; then
        echo "✅ Portainer может подключиться к Docker"
    else
        echo "⚠️  Portainer не может выполнить команды Docker"
    fi
else
    echo "❌ Portainer не запустился"
    echo "Проверьте логи:"
    docker logs portainer --tail 20
fi

echo ""
echo "=== Готово ==="
echo ""
echo "Теперь:"
echo "1. Обновите страницу Portainer в браузере (F5)"
echo "2. Удалите старое окружение 'docker-local'"
echo "3. Создайте новое окружение через Socket"
echo "4. Окружение должно подключиться!"

