# ПРАВИЛЬНЫЕ КОМАНДЫ (исправлена ошибка с !)

## Проблема

Ошибка `-bash: !': event not found` возникает потому, что `!` в bash интерпретируется как команда истории.

## Решение - правильные команды:

### Вариант 1: Использовать одинарные кавычки снаружи

```bash
cd ~/HealApp-Web

docker compose exec db psql -U postgres -c 'ALTER USER postgres WITH PASSWORD '\''Dn2907200!'\'';'
```

### Вариант 2: Экранировать восклицательный знак

```bash
cd ~/HealApp-Web

docker compose exec db psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'Dn2907200\!';"
```

### Вариант 3: Отключить историю для этой команды

```bash
cd ~/HealApp-Web

set +H
docker compose exec db psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'Dn2907200!';"
set -H
```

### Вариант 4: Использовать переменную (самый надежный)

```bash
cd ~/HealApp-Web

PASSWORD='Dn2907200!'
docker compose exec db psql -U postgres -c "ALTER USER postgres WITH PASSWORD '$PASSWORD';"
```

## Полная последовательность команд:

```bash
cd ~/HealApp-Web

# Установить пароль (используйте вариант 4 - самый надежный)
PASSWORD='Dn2907200!'
docker compose exec db psql -U postgres -c "ALTER USER postgres WITH PASSWORD '$PASSWORD';"

# Проверить подключение
PGPASSWORD='Dn2907200!' docker compose exec -e PGPASSWORD db psql -U postgres -d postgres -c 'SELECT current_user;'

# Перезапустить meta
docker compose restart meta

# Подождать 25 секунд
sleep 25

# Проверить логи
docker logs healapp-web-meta-1 --tail 10 | grep -i password

# Перезапустить Studio
docker restart supabase-studio
```

## После выполнения:

1. Откройте `http://176.124.217.224/` в режиме инкогнито
2. Введите: `admin` / `HealApp2024SecurePass!`
3. Подождите 30 секунд

