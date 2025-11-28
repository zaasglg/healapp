#!/bin/bash
# Скрипт для добавления SMTP настроек в docker-compose.production.yml

COMPOSE_FILE="/root/HealApp-Web/docker-compose.production.yml"
BACKUP_FILE="${COMPOSE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

echo "=== Добавление SMTP настроек в docker-compose ==="
echo ""

# Проверка файла
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Файл не найден: $COMPOSE_FILE"
    exit 1
fi

# Создание резервной копии
echo "1. Создание резервной копии..."
cp "$COMPOSE_FILE" "$BACKUP_FILE"
echo "✅ Резервная копия создана: $BACKUP_FILE"
echo ""

# Проверка наличия SMTP переменных
if grep -q "GOTRUE_SMTP_HOST" "$COMPOSE_FILE"; then
    echo "⚠️  SMTP настройки уже присутствуют в файле"
    echo "Проверьте текущие настройки:"
    grep -A 5 "GOTRUE_SMTP" "$COMPOSE_FILE" || true
    echo ""
    read -p "Продолжить и обновить настройки? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено"
        exit 0
    fi
fi

echo "2. Добавление SMTP переменных..."
echo ""
echo "Введите данные SMTP сервера:"
echo ""

read -p "SMTP Host (например, smtp.gmail.com): " SMTP_HOST
read -p "SMTP Port (обычно 587): " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}
read -p "SMTP User (email): " SMTP_USER
read -sp "SMTP Password: " SMTP_PASS
echo ""
read -p "Admin Email (отправитель): " SMTP_ADMIN_EMAIL
SMTP_ADMIN_EMAIL=${SMTP_ADMIN_EMAIL:-$SMTP_USER}
read -p "Sender Name (например, Supabase): " SMTP_SENDER_NAME
SMTP_SENDER_NAME=${SMTP_SENDER_NAME:-Supabase}

echo ""
echo "3. Обновление docker-compose.yml..."

# Создание временного файла с новыми переменными
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" <<EOF
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_SENDER_NAME: ${SMTP_SENDER_NAME}
      GOTRUE_MAILER_AUTOCONFIRM: "false"
EOF

# Поиск строки с GOTRUE_SMTP_PORT (уже есть в файле)
if grep -q "GOTRUE_SMTP_PORT" "$COMPOSE_FILE"; then
    # Заменяем существующие SMTP настройки
    sed -i "/GOTRUE_SMTP_PORT/,/GOTRUE_SUPABASE_DOMAIN/c\\
$(cat "$TEMP_FILE")\\
      GOTRUE_SUPABASE_DOMAIN: localhost" "$COMPOSE_FILE"
else
    # Добавляем после GOTRUE_MAILER_AUTOCONFIRM
    sed -i "/GOTRUE_MAILER_AUTOCONFIRM/a\\
$(cat "$TEMP_FILE")" "$COMPOSE_FILE"
fi

rm "$TEMP_FILE"

echo "✅ Файл обновлен"
echo ""
echo "4. Проверка синтаксиса..."
if docker-compose -f "$COMPOSE_FILE" config > /dev/null 2>&1; then
    echo "✅ Синтаксис корректен"
else
    echo "❌ Ошибка в синтаксисе! Восстанавливаю из резервной копии..."
    cp "$BACKUP_FILE" "$COMPOSE_FILE"
    exit 1
fi

echo ""
echo "=== Готово! ==="
echo ""
echo "Следующие шаги:"
echo "1. Перезапустите контейнер auth:"
echo "   docker-compose -f $COMPOSE_FILE restart auth"
echo ""
echo "2. Проверьте логи:"
echo "   docker logs supabase-auth | grep -i smtp"
echo ""
echo "3. Протестируйте регистрацию по email"
echo ""

