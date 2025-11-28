#!/bin/bash
# Скрипт для получения данных подключения MCP к self-hosted Supabase

echo "=== Данные для подключения MCP к self-hosted Supabase ==="
echo ""

COMPOSE_FILE="/root/HealApp-Web/docker-compose.production.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Файл docker-compose не найден: $COMPOSE_FILE"
    exit 1
fi

# Получаем URL
echo "1. SUPABASE_URL:"
echo "   https://176.124.217.224"
echo "   (или ваш домен, если настроен)"
echo ""

# Получаем ключи из docker-compose
echo "2. Ключи из docker-compose:"
if grep -q "SUPABASE_ANON_KEY" "$COMPOSE_FILE"; then
    ANON_KEY=$(grep "SUPABASE_ANON_KEY" "$COMPOSE_FILE" | head -1 | sed 's/.*=//' | tr -d ' "')
    echo "   SUPABASE_ANON_KEY: ${ANON_KEY:0:20}... (первые 20 символов)"
else
    echo "   ⚠️  SUPABASE_ANON_KEY не найден в docker-compose"
fi

if grep -q "SUPABASE_SERVICE_ROLE_KEY" "$COMPOSE_FILE"; then
    SERVICE_KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY" "$COMPOSE_FILE" | head -1 | sed 's/.*=//' | tr -d ' "')
    echo "   SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_KEY:0:20}... (первые 20 символов)"
else
    echo "   ⚠️  SUPABASE_SERVICE_ROLE_KEY не найден в docker-compose"
fi

echo ""
echo "3. Проверка доступности:"
if curl -s -o /dev/null -w "%{http_code}" https://176.124.217.224/rest/v1/ | grep -q "200\|401"; then
    echo "   ✅ Supabase доступен по https://176.124.217.224"
else
    echo "   ⚠️  Supabase может быть недоступен (проверьте настройки Nginx/SSL)"
fi

echo ""
echo "=== Для MCP сервера используйте: ==="
echo ""
echo "SUPABASE_URL=https://176.124.217.224"
echo "SUPABASE_SERVICE_ROLE_KEY=<полный_ключ_из_docker-compose>"
echo ""

