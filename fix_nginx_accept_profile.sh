#!/bin/bash
# Исправить nginx конфигурацию для добавления accept-profile

CONFIG="/etc/nginx/sites-enabled/supabase"

# Создать backup
cp "$CONFIG" "${CONFIG}.backup.$(date +%s)"

# Добавить accept-profile в заголовки для /rest/
sed -i '/location \/rest\/ {/,/proxy_set_header X-Forwarded-Proto/ {
    s/add_header '\''Access-Control-Allow-Headers'\'' '\''Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info'\'' always;/add_header '\''Access-Control-Allow-Headers'\'' '\''Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info, accept-profile'\'' always;/
}' "$CONFIG"

# Добавить accept-profile в OPTIONS обработку
sed -i '/if (\$request_method = '\''OPTIONS'\'') {/,/return 204/ {
    s/add_header '\''Access-Control-Allow-Headers'\'' '\''Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info'\'';/add_header '\''Access-Control-Allow-Headers'\'' '\''Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info, accept-profile'\'';/
}' "$CONFIG"

# Проверить
nginx -t

