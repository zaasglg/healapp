#!/bin/bash
# Скрипт для быстрой настройки SMTP в docker-compose

COMPOSE_FILE="/root/HealApp-Web/docker-compose.production.yml"
BACKUP_FILE="${COMPOSE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

echo "=== Настройка SMTP для аутентификации по email ==="
echo ""

# Проверка файла
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Файл не найден: $COMPOSE_FILE"
    exit 1
fi

# Создание резервной копии
echo "1. Создание резервной копии..."
cp "$COMPOSE_FILE" "$BACKUP_FILE"
echo "✅ Резервная копия: $BACKUP_FILE"
echo ""

# Проверка наличия SMTP
if grep -q "GOTRUE_SMTP_HOST" "$COMPOSE_FILE"; then
    echo "⚠️  SMTP настройки уже есть. Текущие значения:"
    grep "GOTRUE_SMTP" "$COMPOSE_FILE" | sed 's/^/  /'
    echo ""
    read -p "Обновить настройки? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено"
        exit 0
    fi
    # Удаляем старые SMTP настройки
    sed -i '/GOTRUE_SMTP_HOST/,/GOTRUE_SMTP_SENDER_NAME/d' "$COMPOSE_FILE"
fi

echo "2. Введите данные SMTP:"
echo ""

# Запрашиваем данные
read -p "SMTP Host (например, smtp.gmail.com): " SMTP_HOST
[ -z "$SMTP_HOST" ] && SMTP_HOST="smtp.gmail.com"

read -p "SMTP Port (обычно 587): " SMTP_PORT
[ -z "$SMTP_PORT" ] && SMTP_PORT="587"

read -p "SMTP User (ваш email): " SMTP_USER
if [ -z "$SMTP_USER" ]; then
    echo "❌ Email обязателен!"
    exit 1
fi

read -sp "SMTP Password (пароль приложения для Gmail): " SMTP_PASS
echo ""
if [ -z "$SMTP_PASS" ]; then
    echo "❌ Пароль обязателен!"
    exit 1
fi

read -p "Admin Email (отправитель, по умолчанию = SMTP User): " SMTP_ADMIN_EMAIL
[ -z "$SMTP_ADMIN_EMAIL" ] && SMTP_ADMIN_EMAIL="$SMTP_USER"

read -p "Sender Name (например, Supabase): " SMTP_SENDER_NAME
[ -z "$SMTP_SENDER_NAME" ] && SMTP_SENDER_NAME="Supabase"

echo ""
echo "3. Добавление SMTP настроек в docker-compose.yml..."

# Находим строку с GOTRUE_MAILER_AUTOCONFIRM
if grep -q "GOTRUE_MAILER_AUTOCONFIRM" "$COMPOSE_FILE"; then
    # Добавляем после GOTRUE_MAILER_AUTOCONFIRM
    sed -i "/GOTRUE_MAILER_AUTOCONFIRM/a\\
      GOTRUE_SMTP_HOST: ${SMTP_HOST}\\
      GOTRUE_SMTP_PORT: ${SMTP_PORT}\\
      GOTRUE_SMTP_USER: ${SMTP_USER}\\
      GOTRUE_SMTP_PASS: ${SMTP_PASS}\\
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}\\
      GOTRUE_SMTP_SENDER_NAME: ${SMTP_SENDER_NAME}" "$COMPOSE_FILE"
    
    # Меняем GOTRUE_MAILER_AUTOCONFIRM на false для тестирования
    sed -i 's/GOTRUE_MAILER_AUTOCONFIRM: "true"/GOTRUE_MAILER_AUTOCONFIRM: "false"/' "$COMPOSE_FILE"
    
    echo "✅ SMTP настройки добавлены"
else
    echo "❌ Не найдена строка GOTRUE_MAILER_AUTOCONFIRM в файле"
    exit 1
fi

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
echo "   docker logs supabase-auth --tail 50 | grep -i smtp"
echo ""
echo "3. Протестируйте регистрацию по email в вашем приложении"
echo ""

