#!/bin/bash
# Скрипт для обновления SMTP настроек в Supabase

echo "=== Настройка SMTP для Supabase ==="
echo ""

# Переменные SMTP (замените на свои)
SMTP_HOST="${SMTP_HOST:-smtp.gmail.com}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-your_email@gmail.com}"
SMTP_PASS="${SMTP_PASS:-your_app_password}"
SMTP_ADMIN_EMAIL="${SMTP_ADMIN_EMAIL:-your_email@gmail.com}"
SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-Supabase}"

echo "Настройки SMTP:"
echo "  Host: $SMTP_HOST"
echo "  Port: $SMTP_PORT"
echo "  User: $SMTP_USER"
echo "  Admin Email: $SMTP_ADMIN_EMAIL"
echo ""

# Находим docker-compose файл
COMPOSE_FILE="/root/HealApp-Web/docker-compose.production.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Файл docker-compose не найден: $COMPOSE_FILE"
    exit 1
fi

echo "✅ Файл найден: $COMPOSE_FILE"
echo ""
echo "Для настройки SMTP добавьте следующие переменные в секцию auth:"
echo ""
echo "  GOTRUE_SMTP_HOST=$SMTP_HOST"
echo "  GOTRUE_SMTP_PORT=$SMTP_PORT"
echo "  GOTRUE_SMTP_USER=$SMTP_USER"
echo "  GOTRUE_SMTP_PASS=$SMTP_PASS"
echo "  GOTRUE_SMTP_ADMIN_EMAIL=$SMTP_ADMIN_EMAIL"
echo "  GOTRUE_SMTP_SENDER_NAME=$SMTP_SENDER_NAME"
echo "  GOTRUE_MAILER_AUTOCONFIRM=false"
echo ""
echo "После добавления выполните:"
echo "  docker-compose -f $COMPOSE_FILE restart auth"
echo ""

