#!/bin/bash
# Обновить Nginx конфигурацию для добавления accept-profile

CONFIG_FILE="/etc/nginx/sites-enabled/supabase"

# Добавить accept-profile в заголовки для /rest/
sed -i '/location \/rest\/ {/,/}/ {
    s/Access-Control-Allow-Headers.*x-client-info/Access-Control-Allow-Headers'\'' Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info, accept-profile'\'' always;/
    s/Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info/Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info, accept-profile/g
}' "$CONFIG_FILE"

# Проверить конфигурацию
nginx -t

