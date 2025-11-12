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

# Edge Runtime ожидает конкретную функцию, а не родительскую директорию
# Используем первую найденную функцию (accept-invite)
FUNCTION_DIR="/var/functions/accept-invite"

if [ ! -f "$FUNCTION_DIR/index.ts" ]; then
  echo "❌ ERROR: Function index.ts not found in $FUNCTION_DIR"
  exit 1
fi

echo "🚀 Starting Edge Runtime with function: $FUNCTION_DIR"

# Запускаем Edge Runtime с указанием пути к конкретной функции
exec edge-runtime start --main-service "$FUNCTION_DIR" --verbose

