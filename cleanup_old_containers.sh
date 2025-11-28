#!/bin/bash
# Удалить все старые контейнеры Supabase

echo "=== Поиск старых контейнеров Supabase ==="
OLD_CONTAINERS=$(docker ps -a | grep -E '(supabase|edge-runtime|studio)' | awk '{print $1}')

if [ -z "$OLD_CONTAINERS" ]; then
    echo "✅ Старых контейнеров не найдено"
else
    echo "Найдены контейнеры:"
    echo "$OLD_CONTAINERS"
    
    echo ""
    echo "=== Остановка и удаление старых контейнеров ==="
    echo "$OLD_CONTAINERS" | xargs -r docker stop
    echo "$OLD_CONTAINERS" | xargs -r docker rm -f
    
    echo "✅ Старые контейнеры удалены"
fi

echo ""
echo "=== Проверка оставшихся контейнеров ==="
docker ps -a | grep -E '(supabase|edge-runtime|studio)' || echo "✅ Все контейнеры Supabase удалены"

echo ""
echo "=== Очистка неиспользуемых сетей ==="
docker network prune -f

echo ""
echo "✅ Очистка завершена"

