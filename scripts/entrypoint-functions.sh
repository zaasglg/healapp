#!/bin/sh
set -e

# Копируем функции из образа в рабочую директорию, если их там нет
if [ ! -d "/home/deno/functions" ]; then
  echo "Functions directory not found, creating..."
  mkdir -p /home/deno/functions
fi

# Если функции не скопированы, копируем из образа
if [ ! -f "/home/deno/functions/accept-invite/index.ts" ]; then
  echo "Functions not found in working directory, checking image..."
  # Функции должны быть в образе, но если их нет - это проблема сборки
  if [ -d "/tmp/functions-backup" ]; then
    cp -r /tmp/functions-backup/* /home/deno/functions/ 2>/dev/null || true
  fi
fi

# Запускаем Edge Runtime
exec edge-runtime start

