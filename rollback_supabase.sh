#!/bin/bash
# Откатить все изменения Supabase на сервере для чистого старта

cd ~/HealApp-Web

echo "=== Остановка всех контейнеров ==="
docker compose down

echo ""
echo "=== Удаление всех контейнеров и volumes ==="
docker compose down -v --remove-orphans

echo ""
echo "=== Очистка данных БД (если есть volumes) ==="
docker volume ls | grep -E '(healapp|supabase|postgres)' | awk '{print $2}' | xargs -r docker volume rm

echo ""
echo "=== Создание резервной копии текущих файлов ==="
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -f docker-compose.yml ]; then
    cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml.backup"
    echo "✅ docker-compose.yml сохранен в $BACKUP_DIR"
fi

if [ -f .env ]; then
    cp .env "$BACKUP_DIR/.env.backup"
    echo "✅ .env сохранен в $BACKUP_DIR"
fi

echo ""
echo "=== Очистка конфигурационных файлов ==="
# Переименуем файлы вместо удаления
if [ -f docker-compose.yml ]; then
    mv docker-compose.yml docker-compose.yml.old
    echo "✅ docker-compose.yml переименован в docker-compose.yml.old"
fi

if [ -f .env ]; then
    mv .env .env.old
    echo "✅ .env переименован в .env.old"
fi

echo ""
echo "=== Проверка что контейнеры удалены ==="
docker ps -a | grep -E '(healapp|supabase|caregivers)' || echo "✅ Контейнеры удалены"

echo ""
echo "=== Проверка volumes ==="
docker volume ls | grep -E '(healapp|supabase|postgres)' || echo "✅ Volumes удалены"

echo ""
echo "=== Статус ==="
echo "✅ Все контейнеры остановлены и удалены"
echo "✅ Volumes удалены"
echo "✅ Конфигурационные файлы сохранены в $BACKUP_DIR и переименованы"
echo ""
echo "📁 Резервные копии находятся в: ~/HealApp-Web/$BACKUP_DIR"
echo ""
echo "Теперь вы можете начать развертывание Supabase заново вручную."

