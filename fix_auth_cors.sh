#!/bin/bash

# Скрипт для диагностики и исправления CORS проблем с Auth

echo "=== Диагностика CORS для Supabase Auth ==="

# 1. Проверяем, запущен ли GoTrue (Auth)
echo ""
echo "1. Проверка статуса Auth (GoTrue) контейнера:"
docker ps | grep -E "gotrue|auth" || echo "   ⚠️ Auth контейнер не найден!"

echo ""
echo "2. Проверка доступности Auth на порту 54326:"
curl -s -o /dev/null -w "   HTTP статус: %{http_code}\n" http://127.0.0.1:54326/health || echo "   ⚠️ Auth недоступен на 54326"

echo ""
echo "3. Проверка nginx конфигурации:"
nginx -t 2>&1

echo ""
echo "4. Проверка /auth/v1/health через nginx:"
curl -s -o /dev/null -w "   HTTP статус: %{http_code}\n" http://127.0.0.1/auth/v1/health || echo "   ⚠️ /auth/v1/ не работает через nginx"

echo ""
echo "5. Тест OPTIONS запроса на /auth/v1/token:"
curl -s -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, apikey, Authorization" \
  -o /dev/null -w "   HTTP статус: %{http_code}\n" \
  http://127.0.0.1/auth/v1/token

echo ""
echo "=== Исправление ==="

# Копируем актуальную конфигурацию
echo "6. Копирование nginx конфигурации..."
cat > /etc/nginx/sites-available/supabase << 'NGINX_CONF'
server {
    listen 80;
    server_name supabase.healapp.ru 176.124.217.224;

    # API эндпоинты с CORS (для работы приложения)
    location /rest/ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info, accept-profile' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info, accept-profile';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }

        proxy_pass http://127.0.0.1:54327/rest/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_hide_header 'Access-Control-Allow-Origin';
        proxy_hide_header 'Access-Control-Allow-Methods';
        proxy_hide_header 'Access-Control-Allow-Headers';
        proxy_hide_header 'Access-Control-Allow-Credentials';
    }

    location /functions/ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, x-supabase-api-version, x-client-info' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, x-supabase-api-version, x-client-info';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }

        proxy_pass http://127.0.0.1:54325/functions/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_hide_header 'Access-Control-Allow-Origin';
        proxy_hide_header 'Access-Control-Allow-Methods';
        proxy_hide_header 'Access-Control-Allow-Headers';
    }

    location /auth/v1/ {
        proxy_hide_header 'Access-Control-Allow-Origin';
        proxy_hide_header 'Access-Control-Allow-Methods';
        proxy_hide_header 'Access-Control-Allow-Headers';
        proxy_hide_header 'Access-Control-Allow-Credentials';

        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, x-supabase-api-version, x-client-info' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;

        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, x-supabase-api-version, x-client-info' always;
            add_header 'Access-Control-Max-Age' 1728000 always;
            add_header 'Content-Type' 'text/plain; charset=utf-8' always;
            add_header 'Content-Length' 0 always;
            return 204;
        }

        rewrite ^/auth/v1/(.*) /$1 break;
        proxy_pass http://127.0.0.1:54326;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /storage/ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, x-supabase-api-version, x-client-info' always;

        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, x-supabase-api-version, x-client-info';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }

        proxy_pass http://127.0.0.1:54328/storage/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Supabase Studio (с базовой авторизацией)
    location / {
        auth_basic "Supabase Studio Access";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://127.0.0.1:54324;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_CONF

echo "7. Создание симлинка..."
ln -sf /etc/nginx/sites-available/supabase /etc/nginx/sites-enabled/supabase

echo "8. Проверка конфигурации nginx..."
nginx -t

echo "9. Перезагрузка nginx..."
systemctl reload nginx

echo ""
echo "=== Финальная проверка ==="
echo "Тест OPTIONS запроса на /auth/v1/token:"
curl -s -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, apikey, Authorization" \
  -i http://127.0.0.1/auth/v1/token 2>&1 | head -20

echo ""
echo "=== Готово ==="
echo "Если проблема сохраняется, проверьте что Auth контейнер запущен:"
echo "  docker-compose ps"
echo "  docker logs supabase-auth"
