# ПРОСТОЕ РУЧНОЕ ИСПРАВЛЕНИЕ

## Что сделать на сервере:

### 1. Подключитесь к серверу

```bash
ssh root@176.124.217.224
```

### 2. Выполните эти команды:

```bash
cd ~/HealApp-Web

# Установить пароль для postgres
docker compose exec db psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'Dn2907200!';"

# Перезапустить meta
docker compose restart meta

# Подождать 20 секунд
sleep 20

# Перезапустить Studio
docker restart supabase-studio
```

### 3. Проверьте в браузере

1. Откройте `http://176.124.217.224/` в режиме инкогнито
2. Введите: `admin` / `HealApp2024SecurePass!`
3. Подождите 30 секунд

## Если не работает:

Выполните на сервере:

```bash
cd ~/HealApp-Web

# Проверить логи meta
docker logs healapp-web-meta-1 --tail 30 | grep -i error

# Проверить статус
docker compose ps | grep -E 'meta|db'
```

Пришлите результат этих команд.

