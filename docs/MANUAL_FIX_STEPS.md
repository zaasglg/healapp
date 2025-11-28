# РУЧНОЕ ИСПРАВЛЕНИЕ - Пошаговая инструкция

## Проблема

`postgres-meta` не может подключиться к БД из-за несовпадения паролей.

## Что нужно сделать ВРУЧНУЮ:

### Шаг 1: Подключитесь к серверу по SSH

```bash
ssh root@176.124.217.224
```

### Шаг 2: Перейдите в директорию проекта

```bash
cd ~/HealApp-Web
```

### Шаг 3: Проверьте пароль в .env файле

```bash
cat .env | grep SUPABASE_DB_PASSWORD
```

Должно быть: `SUPABASE_DB_PASSWORD=Dn2907200!`

### Шаг 4: Подключитесь к БД и установите пароль

```bash
docker compose exec db psql -U postgres
```

После подключения выполните в psql:

```sql
ALTER USER postgres WITH PASSWORD 'Dn2907200!';
\q
```

### Шаг 5: Проверьте подключение с паролем

```bash
PGPASSWORD='Dn2907200!' docker compose exec -e PGPASSWORD db psql -U postgres -d postgres -c 'SELECT current_user;'
```

Должно вернуть: `postgres`

### Шаг 6: Перезапустите meta сервис

```bash
docker compose restart meta
```

### Шаг 7: Подождите 20 секунд и проверьте логи

```bash
sleep 20
docker logs healapp-web-meta-1 --tail 20 | grep -i error
```

Если ошибок нет - все работает!

### Шаг 8: Перезапустите Studio

```bash
docker restart supabase-studio
```

### Шаг 9: Проверьте в браузере

1. Откройте `http://176.124.217.224/` в режиме инкогнито
2. Введите: `admin` / `HealApp2024SecurePass!`
3. Подождите 30 секунд

## Если не работает:

### Альтернативный способ - пересоздать БД с нуля:

```bash
cd ~/HealApp-Web

# Остановить БД
docker compose stop db

# Удалить volume (ВНИМАНИЕ: это удалит данные!)
docker volume rm healapp-web_postgres-data

# Запустить БД заново
docker compose up -d db

# Подождать 30 секунд
sleep 30

# Перезапустить meta
docker compose restart meta

# Перезапустить Studio
docker restart supabase-studio
```

**ВНИМАНИЕ:** Это удалит все данные в БД! Используйте только если у вас есть бэкап!

## Если данные важны:

1. Сначала сделайте бэкап:
```bash
docker compose exec db pg_dump -U postgres postgres > backup.sql
```

2. Затем пересоздайте БД (как выше)

3. Восстановите данные:
```bash
docker compose exec -T db psql -U postgres postgres < backup.sql
```

