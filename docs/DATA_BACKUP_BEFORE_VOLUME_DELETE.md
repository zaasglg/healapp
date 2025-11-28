# ВАЖНО: Бэкап данных перед удалением volume

## ⚠️ ВНИМАНИЕ

Удаление volume `postgres-data` **удалит все данные в БД**!

## Что сделать ПЕРЕД удалением volume:

### 1. Создать бэкап данных

```bash
cd ~/HealApp-Web

# Создать бэкап всех данных
docker compose exec db pg_dump -U postgres postgres > /root/backup_before_volume_delete.sql

# Или только структуру + данные
docker compose exec db pg_dump -U postgres -Fc postgres > /root/backup_before_volume_delete.dump
```

### 2. Проверить бэкап

```bash
# Проверить размер файла
ls -lh /root/backup_before_volume_delete.sql

# Проверить содержимое (должны быть таблицы)
head -50 /root/backup_before_volume_delete.sql | grep -i 'CREATE TABLE'
```

### 3. Только после этого удалить volume

```bash
cd ~/HealApp-Web

# Остановить БД
docker compose stop db

# Удалить volume
docker volume rm healapp-web_postgres-data

# Запустить БД заново
docker compose up -d db

# Подождать 40 секунд
sleep 40
```

### 4. Восстановить данные

```bash
cd ~/HealApp-Web

# Восстановить из SQL файла
docker compose exec -T db psql -U postgres postgres < /root/backup_before_volume_delete.sql

# Или из dump файла
docker compose exec -T db pg_restore -U postgres -d postgres /root/backup_before_volume_delete.dump
```

### 5. Перезапустить сервисы

```bash
cd ~/HealApp-Web

docker compose restart meta
docker restart supabase-studio
```

## После восстановления

1. Откройте `http://176.124.217.224/` в режиме инкогнито
2. Введите: `admin` / `HealApp2024SecurePass!`
3. Должны отображаться все таблицы

