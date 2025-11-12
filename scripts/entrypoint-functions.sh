#!/bin/sh
set -e

# Проверяем наличие функций в /var/functions (скопированы в образ)
if [ ! -d "/var/functions" ] || [ ! -f "/var/functions/accept-invite/index.ts" ]; then
  echo "❌ ERROR: Functions not found in /var/functions"
  echo "Available files:"
  find /var -type f 2>/dev/null | head -10 || echo "No files found in /var"
  exit 1
fi

echo "✅ Functions found in /var/functions"
ls -la /var/functions/

# Запускаем Edge Runtime с указанием пути к функциям
# --main-service указывает путь к директории с функциями
exec edge-runtime start --main-service /var/functions --verbose

