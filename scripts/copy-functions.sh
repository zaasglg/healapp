#!/bin/bash
# Скрипт для копирования Edge Functions в контейнер без volumes

CONTAINER_NAME="healapp-web-functions-1"
FUNCTIONS_DIR="./supabase/functions"

if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "❌ Папка $FUNCTIONS_DIR не найдена"
  exit 1
fi

echo "📦 Копирование Edge Functions в контейнер $CONTAINER_NAME..."

# Ждем пока контейнер запустится
echo "⏳ Ожидание запуска контейнера..."
for i in {1..30}; do
  if docker ps | grep -q "$CONTAINER_NAME"; then
    echo "✅ Контейнер запущен"
    break
  fi
  sleep 1
done

# Копируем функции в контейнер
for func_dir in "$FUNCTIONS_DIR"/*; do
  if [ -d "$func_dir" ]; then
    func_name=$(basename "$func_dir")
    echo "📋 Копирование функции: $func_name"
    docker cp "$func_dir" "$CONTAINER_NAME:/home/deno/functions/$func_name"
  fi
done

echo "✅ Edge Functions скопированы!"
echo "🔄 Перезапускаем контейнер для применения изменений..."
docker restart "$CONTAINER_NAME"

echo "✅ Готово! Edge Functions должны быть доступны."

